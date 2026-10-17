/* Image decode/resize/encode in a worker. Unsupported formats are passed through by the caller. */
importScripts('media-policy.js' + self.location.search);
self.onmessage = async function (event) {
  var file = event.data && event.data.file;
  if (!file || !self.createImageBitmap || !self.OffscreenCanvas) {
    self.postMessage({ error: 'worker-unavailable' });
    return;
  }
  var bitmap;
  try {
    if (await self.MediaPolicy.preserveOriginal(file)) {
      self.postMessage({ preserveOriginal: true });
      return;
    }
    bitmap = await self.createImageBitmap(file);
    async function encode(maxWidth, quality) {
      var dimensions = self.MediaPolicy.dimensions(bitmap.width, bitmap.height, maxWidth);
      var width = dimensions[0], height = dimensions[1];
      var canvas = new OffscreenCanvas(width, height);
      var context = canvas.getContext('2d');
      if (!context) throw new Error('canvas-context-unavailable');
      context.drawImage(bitmap, 0, 0, width, height);
      var blob = await canvas.convertToBlob({ type: 'image/webp', quality: quality });
      return blob && blob.type === 'image/webp' ? blob : null;
    }
    var results = await Promise.all([encode(2560, 0.86), encode(600, 0.72)]);
    self.postMessage({ original: results[0] && results[0].size < file.size ? results[0] : null, preview: results[1] });
  } catch (error) {
    self.postMessage({ error: error && error.message || 'compression-failed' });
  } finally {
    if (bitmap) bitmap.close();
  }
};
