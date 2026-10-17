const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../static/js/moments.js'), 'utf8');
const start = source.indexOf('  async function buildPreviewForLegacy(');
const end = source.indexOf('  /* 视频元数据就绪', start);
assert.ok(start >= 0 && end > start);
const base = 'https://media.test/object/public/media/';
let compressed, headStatus = 404, fetched = [], uploads = [];
const storage = {
  getPublicUrl: (key) => ({ data: { publicUrl: base + key.split('/').map(encodeURIComponent).join('/') } }),
  upload: async (key, file, options) => { uploads.push({ key, file, options }); return { error: null }; }
};
const context = vm.createContext({
  File, currentProfile: { role: 'superadmin' }, momentMediaCache: { moment: [1, 2, 3, 4] },
  window: { BlogStorage: { from: () => storage }, Admin: { compressImage: async () => compressed } },
  fetch: async (url, options) => {
    fetched.push(url);
    return options?.method === 'HEAD' ? { status: headStatus } : new Response('synthetic-image', { headers: { 'Content-Type': 'image/jpeg' } });
  }
});
vm.runInContext(source.slice(start, end), context);
const image = (url = base + 'user/a%20b.jpg') => ({
  currentSrc: url, src: url, dataset: {}, isConnected: true,
  closest: () => ({ dataset: { momentId: 'moment' } })
});
(async () => {
  compressed = new File(['synthetic-hdr'], 'hdr.jpg', { type: 'image/jpeg' });
  await context.buildPreviewForLegacy(image());
  assert.equal(uploads.length, 0, 'HDR pass-through never creates a lossy preview');
  compressed = { preview: new File(['synthetic-preview'], 'preview.webp', { type: 'image/webp' }) };
  const img = image();
  await context.buildPreviewForLegacy(img);
  assert.equal(uploads[0].key, 'user/preview-a b.jpg');
  assert.equal(uploads[0].options.upsert, false);
  assert.equal(img.src, base + 'user/preview-a%20b.jpg');
  assert.equal(img.dataset.previewBuilt, '2');
  for (const status of [200, 402, 503]) {
    headStatus = status;
    const before = fetched.length;
    await context.buildPreviewForLegacy(image());
    assert.equal(fetched.length, before + 1, 'Only a confirmed missing preview triggers compression');
  }
  fetched = [];
  await context.buildPreviewForLegacy(image('https://supabase.test/storage/v1/object/public/media/user/old.jpg'));
  assert.equal(fetched.length, 0, 'Legacy objects are not written into a different storage origin');
  console.log('legacy preview: HDR pass-through, storage matching, encoded paths and error handling passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
