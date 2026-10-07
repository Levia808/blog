/* Image decode/resize/encode in a worker. Unsupported formats are passed through by the caller. */
self.onmessage = async function (event) {
  var file = event.data && event.data.file;
  if (!file || !self.createImageBitmap || !self.OffscreenCanvas) {
    self.postMessage({ error: 'worker-unavailable' });
    return;
  }
  var bitmap;
  try {
    bitmap = await self.createImageBitmap(file);
    var sourceType = file.type === 'image/png' ? 'image/webp' : 'image/webp';
    async function encode(maxWidth, quality) {
      var scale = Math.min(1, maxWidth / bitmap.width);
      var width = Math.max(1, Math.round(bitmap.width * scale));
      var height = Math.max(1, Math.round(bitmap.height * scale));
      var canvas = new OffscreenCanvas(width, height);
      var context = canvas.getContext('2d');
      if (!context) throw new Error('canvas-context-unavailable');
      context.drawImage(bitmap, 0, 0, width, height);
      var blob = await canvas.convertToBlob({ type: sourceType, quality: quality });
      return blob && blob.type === 'image/webp' ? blob : null;
    }
    var results = await Promise.all([encode(2560, 0.86), encode(600, 0.72)]);
    self.postMessage({ original: results[0], preview: results[1] });
  } catch (error) {
    self.postMessage({ error: error && error.message || 'compression-failed' });
  } finally {
    if (bitmap) bitmap.close();
  }
};
