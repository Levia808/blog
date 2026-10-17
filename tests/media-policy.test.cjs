const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const self = {};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../static/js/media-policy.js'), 'utf8'), { self, TextDecoder, Uint8Array, DataView });
const policy = self.MediaPolicy;
const jpeg = (metadata) => {
  const text = Buffer.from(metadata);
  return new File([Buffer.from([255, 216, 255, 225, (text.length + 2) >> 8, (text.length + 2) & 255]), text, Buffer.from([255, 218, 0, 2])], 'image.jpg', { type: 'image/jpeg' });
};
(async () => {
  assert.deepEqual(Array.from(policy.dimensions(3000, 6000, 2560)), [1280, 2560]);
  assert.deepEqual(Array.from(policy.dimensions(300, 200, 2560)), [300, 200]);
  assert.equal(await policy.preserveOriginal(jpeg('ordinary EXIF')), false);
  assert.equal(await policy.preserveOriginal(jpeg('hdrgm:Version="1.0"')), true);
  assert.equal(await policy.preserveOriginal(jpeg('MPF\0')), true);
  assert.equal(await policy.preserveOriginal(new File(['hdr'], 'x.avif', { type: 'image/avif' })), true);
  const png = Buffer.alloc(33); png[0] = 137; png[1] = 80; png[24] = 16;
  assert.equal(await policy.preserveOriginal(new File([png], 'x.png', { type: 'image/png' })), true);
  const webp = Buffer.alloc(32); webp.write('VP8X', 12); webp[20] = 2;
  assert.equal(await policy.preserveOriginal(new File([webp], 'x.webp', { type: 'image/webp' })), true);
  console.log('media policy: long-edge sizing and HDR/animation guards passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
