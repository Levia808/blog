'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 4188);
const HOST = process.env.HOST || '0.0.0.0';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const ENV_COOKIE = process.env.NETEASE_COOKIE || '';
const COOKIE_FILE = process.env.NETEASE_COOKIE_FILE || process.env.MUSIC_API_COOKIE_FILE || path.join(__dirname, '.netease-session.json');
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 200;

let enhancedApi = null;

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(body);
}

function getEnhancedApi() {
  if (!enhancedApi) {
    enhancedApi = require('@neteasecloudmusicapienhanced/api');
  }
  return enhancedApi;
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

function unwrapApiPayload(result) {
  if (result && typeof result === 'object' && result.body && typeof result.body === 'object') {
    return result.body;
  }
  return result || {};
}

async function callNetease(method, params = {}, options = {}) {
  const api = getEnhancedApi();
  const fn = api[method];
  if (typeof fn !== 'function') {
    throw new Error(`Netease API method is not available: ${method}`);
  }

  const payload = Object.assign({}, params);
  const cookie = options.cookie !== undefined ? options.cookie : readSessionCookie();
  if (!options.skipCookie && cookie) payload.cookie = cookie;
  const result = await fn(payload);
  return unwrapApiPayload(result);
}

function clampLimit(value) {
  const parsed = Number(value || DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
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

async function handleStatus(req, res) {
  const cookie = readSessionCookie();
  const payload = {
    ok: true,
    adapter: '@neteasecloudmusicapienhanced/api',
    loginSupported: true,
    hasCookie: Boolean(cookie)
  };

  if (!cookie) {
    send(res, 200, payload);
    return;
  }

  try {
    const status = await callNetease('login_status');
    payload.loginStatus = status;
    payload.loggedIn = Boolean(status && status.data && status.data.account);
  } catch (error) {
    payload.loggedIn = false;
    payload.loginError = error.message;
  }
  send(res, 200, payload);
}

async function handleQrLogin(req, res) {
  const keyPayload = await callNetease('login_qr_key', {
    timestamp: Date.now()
  }, { skipCookie: true });
  const key = keyPayload && keyPayload.data && keyPayload.data.unikey;
  if (!key) throw new Error('Netease QR key was not returned.');

  const qrPayload = await callNetease('login_qr_create', {
    key,
    qrimg: true,
    timestamp: Date.now()
  }, { skipCookie: true });

  send(res, 200, {
    ok: true,
    key,
    qrurl: qrPayload && qrPayload.data && qrPayload.data.qrurl,
    qrimg: qrPayload && qrPayload.data && qrPayload.data.qrimg
  });
}

async function handleQrCheck(req, res, url) {
  const key = url.searchParams.get('key');
  if (!key) {
    send(res, 400, { ok: false, error: 'QR key is required.' });
    return;
  }

  const payload = await callNetease('login_qr_check', {
    key,
    timestamp: Date.now(),
    noCookie: true
  }, { skipCookie: true });

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
  try {
    await callNetease('logout');
  } catch (error) {}
  const cleared = clearSessionCookie();
  send(res, 200, {
    ok: true,
    cleared,
    hasCookie: Boolean(readSessionCookie())
  });
}

async function handlePlaylist(req, res, url) {
  const id = url.searchParams.get('id');
  if (!id || !/^\d+$/.test(id)) {
    send(res, 400, { ok: false, error: 'A numeric playlist id is required.' });
    return;
  }

  const limit = clampLimit(url.searchParams.get('limit'));
  const level = url.searchParams.get('level') || 'exhigh';
  const songsPayload = await callNetease('playlist_track_all', { id, limit });
  const songs = Array.isArray(songsPayload.songs) ? songsPayload.songs : [];
  const ids = songs.map((song) => song.id).filter(Boolean);

  const urls = {};
  if (ids.length) {
    const urlPayload = await callNetease('song_url_v1', {
      id: ids.join(','),
      level
    });
    (urlPayload.data || []).forEach((item) => {
      if (item && item.id && item.url) urls[item.id] = item.url;
    });
  }

  const allTracks = songs.map((song, index) => normalizeSong(song, urls, index));
  const tracks = allTracks.filter((track) => track.url);

  send(res, 200, {
    ok: true,
    adapter: '@neteasecloudmusicapienhanced/api',
    playlist: {
      id,
      name: songsPayload.playlist && songsPayload.playlist.name || '',
      cover: songsPayload.playlist && songsPayload.playlist.coverImgUrl || ''
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
  if (req.method !== 'GET') {
    send(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }

  const routes = {
    '/api/netease/status': () => handleStatus(req, res),
    '/api/netease/login/qr': () => handleQrLogin(req, res),
    '/api/netease/login/check': () => handleQrCheck(req, res, url),
    '/api/netease/logout': () => handleLogout(req, res),
    '/api/netease/playlist': () => handlePlaylist(req, res, url)
  };

  const route = routes[url.pathname];
  if (!route) {
    send(res, 404, { ok: false, error: 'Not found.' });
    return;
  }

  route().catch((error) => {
    send(res, 502, { ok: false, error: error.message || String(error) });
  });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Music API listening on http://${HOST}:${PORT}`);
  });
}

module.exports = {
  server,
  readSessionCookie,
  callNetease
};
