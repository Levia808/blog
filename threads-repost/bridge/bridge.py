#!/usr/bin/env python3
# Threads 浏览器登录桥 — 零依赖 (Python 标准库)
# 作用: 后台页面通过 HTTP 调本桥, 桥通过 Chrome DevTools Protocol 操作本机调试 Chrome:
#   1) 打开新标签到 Threads 登录页 (用户在弹出的真实浏览器中登录, 2FA/验证码原生支持)
#   2) 轮询读取登录态 Cookie (sessionid 为 HttpOnly, 页面 JS 读不到, CDP 可以)
# 启动: python3 bridge.py   (默认 Chrome 调试端口 9222, 桥端口 8788)
# 端点 (均带 CORS, 供后台页面调用):
#   GET /api/status            → { chrome: bool, bridge: true }
#   GET /api/open?url=...      → 打开新标签, 返回 { targetId, targetWs }
#   GET /api/cookies           → 读最近打开标签的 Cookie, 返回 { ok, cookies: {sessionid, ds_user_id, csrftoken} }
#   GET /api/close             → 关闭最近打开标签

import base64
import json
import os
import re
import socket
import struct
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CDP_PORT = int(os.environ.get('CDP_PORT', '9222'))
BRIDGE_PORT = int(os.environ.get('BRIDGE_PORT', '8788'))
COOKIE_DOMAINS = ('threads.com', 'instagram.com')

_lock = threading.Lock()
_opened_target = {'id': None, 'ws': None}


# ── 极简 WebSocket 客户端 (Chrome CDP 用: 纯文本帧, 无扩展) ──
class CdpClient:
    def __init__(self, ws_url, timeout=10):
        u = urllib.parse.urlparse(ws_url)
        self.sock = socket.create_connection((u.hostname, u.port), timeout=timeout)
        self.sock.settimeout(timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        path = u.path + (('?' + u.query) if u.query else '')
        req = (
            'GET %s HTTP/1.1\r\n'
            'Host: %s:%d\r\n'
            'Upgrade: websocket\r\n'
            'Connection: Upgrade\r\n'
            'Sec-WebSocket-Key: %s\r\n'
            'Sec-WebSocket-Version: 13\r\n\r\n'
        ) % (path, u.hostname, u.port, key)
        self.sock.sendall(req.encode())
        resp = b''
        while b'\r\n\r\n' not in resp:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError('WS 握手失败')
            resp += chunk
        if b'101' not in resp.split(b'\r\n', 1)[0]:
            raise ConnectionError('WS 握手被拒绝: ' + resp[:200].decode(errors='ignore'))
        self._buf = b''

    def _read(self, n):
        while len(self._buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError('WS 连接断开')
            self._buf += chunk
        out, self._buf = self._buf[:n], self._buf[n:]
        return out

    def _read_frame(self):
        while True:
            h1, h2 = self._read(2)
            opcode = h1 & 0x0F
            length = h2 & 0x7F
            if length == 126:
                length = struct.unpack('>H', self._read(2))[0]
            elif length == 127:
                length = struct.unpack('>Q', self._read(8))[0]
            if h2 & 0x80:
                mask = self._read(4)
            else:
                mask = None
            payload = self._read(length)
            if mask:
                payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
            if opcode == 0x9:  # ping → pong
                self._send_frame(0xA, payload)
                continue
            if opcode == 0x8:
                raise ConnectionError('WS 被关闭')
            if opcode == 0x1 or opcode == 0x2:
                return payload

    def _send_frame(self, opcode, payload):
        length = len(payload)
        if length < 126:
            head = bytes([0x80 | opcode, 0x80 | length])
        elif length < 65536:
            head = bytes([0x80 | opcode, 0x80 | 126]) + struct.pack('>H', length)
        else:
            head = bytes([0x80 | opcode, 0x80 | 127]) + struct.pack('>Q', length)
        mask = os.urandom(4)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(head + mask + masked)

    def call(self, method, params=None):
        msg = json.dumps({'id': 1, 'method': method, 'params': params or {}}).encode()
        self._send_frame(0x1, msg)
        while True:
            data = self._read_frame()
            try:
                obj = json.loads(data.decode(errors='ignore'))
            except Exception:
                continue
            if obj.get('id') == 1:
                return obj

    def close(self):
        try:
            self.sock.close()
        except Exception:
            pass


# ── CDP 帮助 ──
def cdp_json(path, method=None):
    url = 'http://127.0.0.1:%d%s' % (CDP_PORT, path)
    req = urllib.request.Request(url, method=method or 'GET')
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read().decode())


def chrome_alive():
    try:
        cdp_json('/json/version')
        return True
    except Exception:
        return False


def open_tab(url):
    q = urllib.parse.quote(url, safe='')
    info = cdp_json('/json/new?' + q, method='PUT')
    target = {'id': info.get('id'), 'ws': info.get('webSocketDebuggerUrl')}
    with _lock:
        _opened_target.update(target)
    return target


def validate_cookie(cookie_str):
    """验证 cookie 是否有效: 有效 sessionid → Threads 返回 200; 无效 → 500 (帖页已改为客户端渲染, 不再有 og 元数据)"""
    url = 'https://www.threads.com/@chaoliang_/post/Db5rr3Cm5Ht'
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Cookie': cookie_str,
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
            return True
    except urllib.error.HTTPError as e:
        return False
    except Exception:
        return False


def cookie_string(c):
    return 'sessionid=' + c.get('sessionid', '') + \
        ('; ds_user_id=' + c['ds_user_id'] if c.get('ds_user_id') else '') + \
        ('; csrftoken=' + c['csrftoken'] if c.get('csrftoken') else '')


def read_cookies():
    with _lock:
        t = dict(_opened_target)
    if not t.get('ws'):
        return {'ok': False, 'error': '尚未打开浏览器标签'}
    try:
        client = CdpClient(t['ws'], timeout=10)
        try:
            res = client.call('Network.getAllCookies')
        finally:
            client.close()
    except Exception as e:
        return {'ok': False, 'error': '读取失败: ' + str(e)}
    # 按域名分组: threads.com 的登录态优先于 instagram.com
    by_domain = {'threads.com': {}, 'instagram.com': {}}
    for c in res.get('result', {}).get('cookies', []) or []:
        d = c.get('domain', '')
        for key in by_domain:
            if d.endswith(key):
                by_domain[key].setdefault(c['name'], c['value'])
    # 依次尝试各域登录态, 用真实爬取验证, 返回第一个有效的
    for key in ('threads.com', 'instagram.com'):
        c = by_domain[key]
        if 'sessionid' not in c:
            continue
        cs = cookie_string(c)
        if validate_cookie(cs):
            return {'ok': True, 'cookies': c}
    for key in ('threads.com', 'instagram.com'):
        if 'sessionid' in by_domain[key]:
            return {'ok': False, 'error': '找到登录态但验证失败 (sessionid 无效或已过期) — 请在弹出的浏览器中重新登录后再试'}
    return {'ok': False, 'error': '未找到登录态 (sessionid) — 请在浏览器中完成登录'}


def close_tab():
    with _lock:
        tid, _ = _opened_target.pop('id', None), _opened_target.pop('ws', None)
        tid = tid or None
    if tid:
        try:
            cdp_json('/json/close/' + tid)
        except Exception:
            pass


# ── 帖子抓取: 真实浏览器渲染后从 DOM 提取 (Threads 帖子内容为客户端渲染, 无 og 元数据) ──
FETCH_POLL_INTERVAL = 1.5
FETCH_TIMEOUT = 25

EXTRACT_JS = r"""
(function(){
  var t = document.body.innerText || '';
  var lines = t.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  var iViews = -1;
  for (var i = 0; i < lines.length; i++) {
    if (/次浏览|次查看/.test(lines[i])) { iViews = i; break; }
  }
  var start = iViews >= 0 ? iViews + 1 : 0;
  if (!lines[start]) return { ready: false };
  var author = lines[start] || '';
  var time = lines[start + 1] || '';
  var textLines = [];
  var likes = 0, replies = 0;
  for (var j = start + 2; j < lines.length; j++) {
    var l = lines[j];
    if (/^[\d.]+[万kK]?$/.test(l)) {
      var n = parseFloat(l);
      if (/万$/.test(l)) n = n * 10000;
      else if (/[kK]$/.test(l)) n = n * 1000;
      likes = n;
      continue;
    }
    if (/^回复/.test(l)) { var m = l.match(/回复\s*([\d.]+[万kK]?)/); if (m) { var rn = parseFloat(m[1]); if (/万$/.test(m[1])) rn *= 10000; else if (/[kK]$/.test(m[1])) rn *= 1000; replies = rn; } break; }
    if (/^(暂无回复|热门|查看动态|分享|复制链接|关注|更多|收起|展开)$/.test(l)) { break; }
    if (textLines.length >= 12) { break; }
    textLines.push(l);
  }
  var text = textLines.join('\n');
  var media = [];
  var seen = {};
  var avatar = '';
  Array.from(document.querySelectorAll('img')).forEach(function (img) {
    var alt = img.alt || '';
    var src = img.currentSrc || img.src || '';
    if (/头像|avatar/i.test(alt) && src && !avatar) { avatar = src; return; }
    var isAvatar = img.naturalWidth === 150 && img.naturalHeight === 150;
    if (!isAvatar && src && !seen[src]) { seen[src] = true; media.push({ type: 'image', url: src, width: img.naturalWidth, height: img.naturalHeight }); }
  });
  Array.from(document.querySelectorAll('video')).forEach(function (v) {
    var src = v.currentSrc || v.src || (v.querySelector('source') || {}).src || '';
    if (src && !seen[src]) { seen[src] = true; media.push({ type: 'video', url: src }); }
  });
  if (media.length > 10) media = media.slice(0, 10);
  return { ready: text.length > 0 || media.length > 0, author: author, time: time, text: text, likes: likes, replies: replies, media: media, avatar: avatar };
})()
"""


def fetch_post(url):
    """导航标签到帖子页 → 轮询渲染 → 提取帖子内容"""
    with _lock:
        tid = _opened_target.get('id')
        ws_url = _opened_target.get('ws')
    if not ws_url:
        t = open_tab('about:blank')
        tid, ws_url = t['id'], t['ws']
    try:
        client = CdpClient(ws_url, timeout=15)
    except Exception as e:
        return {'ok': False, 'error': '连接浏览器失败: ' + str(e)}
    try:
        client.call('Page.navigate', {'url': url})
        deadline = time.time() + FETCH_TIMEOUT
        last_err = None
        while time.time() < deadline:
            time.sleep(FETCH_POLL_INTERVAL)
            res = client.call('Runtime.evaluate', {'expression': EXTRACT_JS, 'returnByValue': True})
            try:
                val = res['result']['result']['value']
            except Exception:
                continue
            if not val:
                continue
            if val.get('ready'):
                # 作者/句柄从 URL 取
                import re as _re
                m = _re.match(r'https?://(?:www\.)?threads\.(?:net|com)/@([^/]+)/post/([A-Za-z0-9_-]+)', url)
                handle = m.group(1) if m else ''
                pid = m.group(2) if m else ''
                return {'ok': True, 'data': {
                    'url': url, 'id': pid, 'author': val.get('author') or handle,
                    'handle': '@' + handle, 'time': val.get('time', ''),
                    'text': val.get('text', ''), 'replies': [],
                    'media': val.get('media', []),
                    'avatar': val.get('avatar', ''),
                    'stats': {'likes': val.get('likes', 0), 'replies': val.get('replies', 0), 'reposts': 0},
                    'fetchedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                }}
            last_err = '页面渲染超时'
        return {'ok': False, 'error': '未能提取帖子内容（' + str(last_err or '渲染超时') + '）'}
    except Exception as e:
        return {'ok': False, 'error': '抓取失败: ' + str(e)}
    finally:
        client.close()


# ── HTTP 服务 ──
class Handler(BaseHTTPRequestHandler):
    def _send(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        # Chrome 私有网络访问 (https 页面 → localhost): 需要声明允许
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send({})

    def do_GET(self):
        try:
            u = urllib.parse.urlparse(self.path)
            if u.path == '/api/status':
                self._send({'bridge': True, 'chrome': chrome_alive()})
            elif u.path == '/api/open':
                q = urllib.parse.parse_qs(u.query)
                url = (q.get('url') or ['https://www.threads.com/'])[0]
                if not chrome_alive():
                    self._send({'ok': False, 'error': 'Chrome 调试端口未开启 (请先运行 chrome-debug 启动器)'}, 400)
                    return
                t = open_tab(url)
                self._send({'ok': True, 'targetId': t['id']})
            elif u.path == '/api/fetch':
                q = urllib.parse.parse_qs(u.query)
                url = (q.get('url') or [''])[0]
                if not url or not re.match(r'https?://(?:www\.)?threads\.(?:net|com)/@[^/]+/post/', url):
                    self._send({'ok': False, 'error': '无效的 Threads 帖子链接'}, 400)
                    return
                if not chrome_alive():
                    self._send({'ok': False, 'error': 'Chrome 调试端口未开启 (请先运行 chrome-debug 启动器)'}, 400)
                    return
                r = fetch_post(url)
                self._send(r, 200 if r['ok'] else 400)
            elif u.path == '/api/cookies':
                r = read_cookies()
                self._send({'ok': r['ok'], 'cookies': r.get('cookies', {}), 'error': r.get('error')}, 200 if r['ok'] else 400)
            elif u.path == '/api/close':
                close_tab()
                self._send({'ok': True})
            else:
                self._send({'error': 'not found'}, 404)
        except Exception as e:
            self._send({'error': str(e)}, 500)

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    print('桥已启动: http://localhost:%d  (Chrome CDP: %d)' % (BRIDGE_PORT, CDP_PORT))
    ThreadingHTTPServer(('127.0.0.1', BRIDGE_PORT), Handler).serve_forever()
