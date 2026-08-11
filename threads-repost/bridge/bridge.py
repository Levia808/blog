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
import socket
import struct
import threading
import time
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
    picked = {}
    for c in res.get('result', {}).get('cookies', []) or []:
        if any(c.get('domain', '').endswith(d) for d in COOKIE_DOMAINS):
            picked.setdefault(c['name'], c['value'])
    return {'ok': True, 'cookies': picked}


def close_tab():
    with _lock:
        tid, _ = _opened_target.pop('id', None), _opened_target.pop('ws', None)
        tid = tid or None
    if tid:
        try:
            cdp_json('/json/close/' + tid)
        except Exception:
            pass


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
