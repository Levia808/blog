const assert = require('node:assert/strict');
process.env.CORS_ORIGIN = 'https://levia808.github.io,https://blog-go3.pages.dev';
const { server } = require('../music-api/server.js');

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = 'http://127.0.0.1:' + server.address().port + '/api/netease/playlist';
    for (const origin of ['https://l3via.cc.cd', 'https://www.l3via.cc.cd', 'https://blog-go3.pages.dev', 'https://levia808.github.io', 'https://untrusted.example']) {
      const response = await fetch(url, { method: 'OPTIONS', headers: { Origin: origin } });
      assert.equal(response.status, 204);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin === 'https://untrusted.example' ? null : origin);
      assert.equal(response.headers.get('Vary'), 'Origin');
    }
    console.log('domain CORS: new and legacy origins accepted, unrelated origin denied with legacy environment settings');
  } finally { await new Promise((resolve) => server.close(resolve)); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
