# Blog Music API

Single public Node backend for the floating player. It replaces the local two-process flow:

```text
NeteaseCloudMusicApi + float-player/netease-proxy
```

with one deployable HTTP service:

```text
music-api
```

## Endpoints

```text
GET /api/netease/status
GET /api/netease/login/qr
GET /api/netease/login/check?key=...
GET /api/netease/logout
GET /api/netease/playlist?id=3778678&limit=30&level=exhigh
```

## Local Run

```powershell
cd C:\Users\27418\Documents\blog\music-api
npm install
npm start
```

Then set the admin player proxy URL to:

```text
http://127.0.0.1:4188
```

## Deploy

Recommended service shape:

```text
Build command: npm install
Start command: npm start
Root directory: music-api
```

Required runtime:

```text
Node.js >= 22
```

Useful environment variables:

```text
PORT=4188
HOST=0.0.0.0
CORS_ORIGIN=https://blog-go3.pages.dev
NETEASE_COOKIE=optional prefilled MUSIC_U cookie
NETEASE_COOKIE_FILE=/data/.netease-session.json
```

If your platform does not provide persistent disk, QR login still works until the service restarts. For durable login across restarts, use a persistent disk path for `NETEASE_COOKIE_FILE` or set `NETEASE_COOKIE` as an environment variable.

After deployment, set the admin player proxy URL to your public HTTPS service URL, for example:

```text
https://your-music-api.onrender.com
```
