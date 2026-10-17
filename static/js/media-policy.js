/* Shared by the foreground uploader and its image worker. */
(function (root) {
  root.MediaPolicy = {
    dimensions: function (width, height, edge) {
      var scale = Math.min(1, edge / Math.max(width, height));
      return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
    },
    async preserveOriginal(file) {
      var type = String(file.type || '').toLowerCase();
      if (!/^image\/(jpeg|jpg|png|webp)$/.test(type)) return true;
      if (type === 'image/webp') {
        var header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
        return header.length < 21 || (header[12] === 86 && header[15] === 88 && !!(header[20] & 2));
      }
      var bytes = new Uint8Array(await file.arrayBuffer());
      var text = new TextDecoder('latin1');
      if (/jpe?g/.test(type)) {
        if (bytes[0] !== 255 || bytes[1] !== 216) return true;
        for (var offset = 2; offset + 4 <= bytes.length;) {
          if (bytes[offset++] !== 255) return true;
          while (bytes[offset] === 255) offset++;
          var marker = bytes[offset++];
          if (marker === 218 || marker === 217) break;
          var length = bytes[offset] * 256 + bytes[offset + 1];
          if (length < 2 || offset + length > bytes.length) return true;
          if (marker >= 224 && marker <= 239 && /hdrgm|gain.?map|MPF\x00|21496/i.test(text.decode(bytes.subarray(offset + 2, offset + length)))) return true;
          offset += length;
        }
      } else {
        if (bytes.length < 26 || bytes[0] !== 137 || bytes[1] !== 80) return true;
        if (bytes[24] > 8) return true;
        var view = new DataView(bytes.buffer);
        for (var pos = 8; pos + 12 <= bytes.length;) {
          var size = view.getUint32(pos);
          if (pos + 12 + size > bytes.length) return true;
          var chunk = text.decode(bytes.subarray(pos + 4, pos + 8));
          if (/^(cICP|mDCv|cLLi|acTL)$/.test(chunk)) return true;
          pos += 12 + size;
        }
      }
      return false;
    }
  };
})(typeof self !== 'undefined' ? self : window);
