const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 4188);
const HOST = process.env.HOST || '127.0.0.1';
const API_BASE = (process.env.NETEASE_API_BASE || '').replace(/\/$/, '');
const ENV_COOKIE = process.env.NETEASE_COOKIE || '';
const COOKIE_FILE = process.env.NETEASE_COOKIE_FILE || path.join(__dirname, '.netease-session.json');
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 200;

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(body);
}

function appendQuery(url, query) {
  const next = new URL(url);
  Object.keys(query).forEach((key) => {
    if (query[key] !== undefined && query[key] !== null && query[key] !== '') {
      next.searchParams.set(key, query[key]);
    }
  });
  return next.toString();
}

function readSessionCookie() {
  if (ENV_COOKIE) return ENV_COOKIE;
  try {
    const payload = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
    return payload && typeof payload.cookie === 'string' ? payload.cookie : '';
  } catch (error) {
    return '';
  }
}

function writeSessionCookie(cookie) {
  const value = String(cookie || '').trim();
  if (!value) return;
  fs.mkdirSync(path.dirname(COOKIE_FILE), { recursive: true });
  fs.writeFileSync(COOKIE_FILE, JSON.stringify({
    cookie: value,
    updatedAt: new Date().toISOString()
  }, null, 2));
}

function clearSessionCookie() {
  if (ENV_COOKIE) return false;
  try {
    fs.rmSync(COOKIE_FILE, { force: true });
  } catch (error) {}
  return true;
}

function requestJson(url, options = {}) {
  const client = url.startsWith('https:') ? https : http;
  const headers = {
    'User-Agent': 'Mozilla/5.0',
    Referer: 'https://music.163.com/'
  };
  const cookie = options.cookie !== undefined ? options.cookie : readSessionCookie();
  if (!options.skipCookie && cookie) headers.Cookie = cookie;

  return new Promise((resolve, reject) => {
    const req = client.get(url, { headers, timeout: 12000 }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        text += chunk;
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
          return;
        }
        try {
          resolve(JSON.parse(text));
        } catch (error) {
          reject(new Error(`Invalid JSON from ${url}`));
        }
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error(`Timeout for ${url}`));
    });
    req.on('error', reject);
  });
}

function artistName(song) {
  const list = song.ar || song.artists || [];
  if (Array.isArray(list) && list.length) return list.map((item) => item.name).filter(Boolean).join(' / ');
  return song.artist || song.author || '';
}

function albumName(song) {
  return (song.al && song.al.name) || (song.album && song.album.name) || song.album || '';
}

function coverUrl(song) {
  return (song.al && song.al.picUrl) || song.cover || song.picUrl || song.pic || '';
}

function normalizeSong(song, urlMap, index) {
  const id = song.id || song.songId;
  return {
    id,
    name: song.name || song.title || `Track ${index + 1}`,
    artist: artistName(song) || 'Unknown Artist',
    album: albumName(song),
    cover: coverUrl(song),
    url: urlMap[id] || ''
  };
}

function clampLimit(value) {
  const parsed = Number(value || DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

async function loadViaNeteaseCloudMusicApi(id, limit, level) {
  const songsPayload = await requestJson(appendQuery(`${API_BASE}/playlist/track/all`, { id, limit }));
  const songs = Array.isArray(songsPayload.songs) ? songsPayload.songs : [];
  const ids = songs.map((song) => song.id).filter(Boolean);
  if (!ids.length) return { playlist: { id, name: '' }, songs: [], urls: {} };

  const urlPayload = await requestJson(appendQuery(`${API_BASE}/song/url/v1`, {
    id: ids.join(','),
    level
  }));
  const urls = {};
  (urlPayload.data || []).forEach((item) => {
    if (item && item.id && item.url) urls[item.id] = item.url;
  });
  return { playlist: { id, name: '' }, songs, urls };
}

function requireApiBase(res) {
  if (API_BASE) return true;
  send(res, 501, {
    ok: false,
    error: 'NETEASE_API_BASE is required for QR login. Start NeteaseCloudMusicApi and point this proxy to it.'
  });
  return false;
}

async function handleStatus(req, res) {
  const cookie = readSessionCookie();
  const payload = {
    ok: true,
    apiBase: API_BASE,
    loginSupported: Boolean(API_BASE),
    hasCookie: Boolean(cookie)
  };

  if (!API_BASE || !cookie) {
    send(res, 200, payload);
    return;
  }

  try {
    const status = await requestJson(appendQuery(`${API_BASE}/login/status`, { timestamp: Date.now() }));
    payload.loginStatus = status;
    payload.loggedIn = Boolean(status && status.data && status.data.account);
  } catch (error) {
    payload.loggedIn = false;
    payload.loginError = error.message;
  }
  send(res, 200, payload);
}

async function handleQrLogin(req, res) {
  if (!requireApiBase(res)) return;
  const keyPayload = await requestJson(appendQuery(`${API_BASE}/login/qr/key`, {
    timestamp: Date.now()
  }), { skipCookie: true });
  const key = keyPayload && keyPayload.data && keyPayload.data.unikey;
  if (!key) throw new Error('Netease QR key was not returned.');

  const qrPayload = await requestJson(appendQuery(`${API_BASE}/login/qr/create`, {
    key,
    qrimg: true,
    timestamp: Date.now()
  }), { skipCookie: true });

  send(res, 200, {
    ok: true,
    key,
    qrurl: qrPayload && qrPayload.data && qrPayload.data.qrurl,
    qrimg: qrPayload && qrPayload.data && qrPayload.data.qrimg
  });
}

async function handleQrCheck(req, res, url) {
  if (!requireApiBase(res)) return;
  const key = url.searchParams.get('key');
  if (!key) {
    send(res, 400, { ok: false, error: 'QR key is required.' });
    return;
  }
  const payload = await requestJson(appendQuery(`${API_BASE}/login/qr/check`, {
    key,
    timestamp: Date.now(),
    noCookie: true
  }), { skipCookie: true });

  if (payload && payload.code === 803 && payload.cookie) {
    writeSessionCookie(payload.cookie);
  }

  send(res, 200, {
    ok: true,
    code: payload && payload.code,
    message: payload && payload.message,
    loggedIn: Boolean(payload && payload.code === 803),
    hasCookie: Boolean(readSessionCookie())
  });
}

async function handleLogout(req, res) {
  if (API_BASE) {
    try {
      await requestJson(appendQuery(`${API_BASE}/logout`, { timestamp: Date.now() }));
    } catch (error) {}
  }
  const cleared = clearSessionCookie();
  send(res, 200, {
    ok: true,
    cleared,
    hasCookie: Boolean(readSessionCookie())
  });
}

async function loadViaMusic163(id, limit) {
  const playlistPayload = await requestJson(`https://music.163.com/api/playlist/detail?id=${encodeURIComponent(id)}`);
  const playlist = playlistPayload.result || playlistPayload.playlist || {};
  const songs = (playlist.tracks || []).slice(0, limit);
  const ids = songs.map((song) => song.id).filter(Boolean);
  if (!ids.length) return { playlist, songs: [], urls: {} };

  const urlPayload = await requestJson(appendQuery('https://music.163.com/api/song/enhance/player/url', {
    ids: `[${ids.join(',')}]`,
    br: 320000
  }));
  const urls = {};
  (urlPayload.data || []).forEach((item) => {
    if (item && item.id && item.url) urls[item.id] = item.url;
  });
  return { playlist, songs, urls };
}

async function handlePlaylist(req, res, url) {
  const id = url.searchParams.get('id');
  if (!id || !/^\d+$/.test(id)) {
    send(res, 400, { ok: false, error: 'A numeric playlist id is required.' });
    return;
  }

  const limit = clampLimit(url.searchParams.get('limit'));
  const level = url.searchParams.get('level') || 'exhigh';
  const loaded = API_BASE
    ? await loadViaNeteaseCloudMusicApi(id, limit, level)
    : await loadViaMusic163(id, limit);
  const allTracks = loaded.songs.map((song, index) => normalizeSong(song, loaded.urls, index));
  const tracks = allTracks.filter((track) => track.url);

  send(res, 200, {
    ok: true,
    adapter: API_BASE ? 'netease-cloud-music-api' : 'music.163-proxy',
    playlist: {
      id,
      name: loaded.playlist.name || '',
      cover: loaded.playlist.coverImgUrl || ''
    },
    total: allTracks.length,
    playable: tracks.length,
    skipped: allTracks.filter((track) => !track.url).map((track) => ({
      id: track.id,
      name: track.name,
      artist: track.artist
    })),
    tracks
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  if (req.method === 'OPTIONS') {
    send(res, 204, {});
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/netease/playlist') {
    handlePlaylist(req, res, url).catch((error) => {
      send(res, 502, { ok: false, error: error.message });
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/netease/status') {
    handleStatus(req, res).catch((error) => {
      send(res, 502, { ok: false, error: error.message });
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/netease/login/qr') {
    handleQrLogin(req, res).catch((error) => {
      send(res, 502, { ok: false, error: error.message });
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/netease/login/check') {
    handleQrCheck(req, res, url).catch((error) => {
      send(res, 502, { ok: false, error: error.message });
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/netease/logout') {
    handleLogout(req, res).catch((error) => {
      send(res, 502, { ok: false, error: error.message });
    });
    return;
  }
  send(res, 404, { ok: false, error: 'Not found.' });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Netease proxy listening on http://${HOST}:${PORT}`);
    if (API_BASE) console.log(`NeteaseCloudMusicApi upstream: ${API_BASE}`);
  });
}

module.exports = {
  server,
  readSessionCookie,
  loadViaMusic163,
  loadViaNeteaseCloudMusicApi
};
