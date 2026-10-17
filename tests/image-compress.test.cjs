const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../static/js/supabase.js'), 'utf8');
const start = source.indexOf('  async compressImage(file)');
const end = source.indexOf('  async uploadMedia(', start);
assert.ok(start >= 0 && end > start);
let preserve = false, contextAvailable = true, outputType = 'image/webp', revoked = 0, dimensions = [];
const window = { MediaPolicy: {
  preserveOriginal: async () => preserve,
  dimensions: (w, h, edge) => [w * Math.min(1, edge / Math.max(w, h)), h * Math.min(1, edge / Math.max(w, h))]
} };
class Image {
  naturalWidth = 3000;
  naturalHeight = 6000;
  set src(value) { queueMicrotask(() => this.onload()); }
}
const context = vm.createContext({
  window, File, Image,
  URL: { createObjectURL: () => 'blob:synthetic', revokeObjectURL: () => revoked++ },
  document: { createElement: () => ({
    getContext() { return contextAvailable ? { drawImage: () => {} } : null; },
    toBlob(callback) { dimensions.push([this.width, this.height]); callback(new Blob(['small'], { type: outputType })); }
  }) }
});
const admin = vm.runInContext('({' + source.slice(start, end) + '})', context);
(async () => {
  const original = new File(['x'.repeat(100)], 'synthetic.jpg', { type: 'image/jpeg' });
  preserve = true;
  assert.equal(await admin.compressImage(original), original);
  assert.equal(revoked, 0);
  preserve = false;
  const pair = await admin.compressImage(original);
  assert.equal(pair.original.type, 'image/webp');
  assert.equal(pair.preview.type, 'image/webp');
  assert.deepEqual(dimensions, [[1280, 2560], [300, 600]]);
  contextAvailable = false;
  assert.equal(await admin.compressImage(original), original, 'Canvas failure resolves with the source instead of hanging');
  contextAvailable = true;
  outputType = 'image/png';
  assert.equal(await admin.compressImage(original), original, 'Unsupported WebP encoding is never mislabeled');
  assert.equal(revoked, 3, 'Every decode URL is released on success and failure');
  console.log('foreground compression: HDR guard, portrait sizing, Canvas failures and URL cleanup passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
