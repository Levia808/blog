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
