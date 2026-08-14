# Netease Proxy

Local proxy for the floating player. The browser requests this service instead of calling NetEase directly, avoiding CORS and keeping source parsing out of the UI.

## Run

```powershell
node float-player\netease-proxy\server.js
```

Default endpoint:

```text
http://127.0.0.1:4188/api/netease/playlist?id=3778678&limit=30
```

Open the player with:

```text
http://127.0.0.1:4174/v3_20260813_minimal-arrow-wheel/index.html?playlist=3778678
```

## Optional Self-Hosted API

If you run NeteaseCloudMusicApi yourself, point this proxy at it:

```powershell
$env:NETEASE_API_BASE='http://127.0.0.1:3000'
node float-player\netease-proxy\server.js
```

Optional cookie for better availability:

```powershell
$env:NETEASE_COOKIE='MUSIC_U=...'
```

Some songs may still be unavailable because NetEase returns no playable URL for restricted tracks.

## QR Login Automation

For the most stable playlist parsing, run this proxy together with a self-hosted NeteaseCloudMusicApi service and set `NETEASE_API_BASE`.

Recommended local shape:

```powershell
# terminal 1: run NeteaseCloudMusicApi / Enhanced-NeteaseCloudMusicApi on port 3000

# terminal 2: run this proxy
$env:NETEASE_API_BASE='http://127.0.0.1:3000'
$env:NETEASE_COOKIE_FILE='C:\Users\27418\Documents\blog\float-player\netease-proxy\.netease-session.json'
node float-player\netease-proxy\server.js
```

Admin panel flow:

1. Open `播放器配置`.
2. Fill `代理地址`, for example `http://127.0.0.1:4188`.
3. Click `检查代理`.
4. Click `扫码登录` and scan with the NetEase Cloud Music app.
5. Fill `网易云歌单 ID`.
6. Click `测试歌单`.
7. Save the player config.

Proxy endpoints:

```text
GET /api/netease/status
GET /api/netease/login/qr
GET /api/netease/login/check?key=...
GET /api/netease/logout
GET /api/netease/playlist?id=3778678&limit=30&level=exhigh
```

The QR login cookie is saved to `NETEASE_COOKIE_FILE`. If `NETEASE_COOKIE` is set, the proxy treats it as read-only and will not overwrite it.
