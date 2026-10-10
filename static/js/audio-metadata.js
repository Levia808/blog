/**
 * Audio Metadata Extractor
 * Extracts ID3 tags and audio information from audio files
 * Supports: MP3 (ID3v2), M4A/MP4 (iTunes), OGG (Vorbis), FLAC
 */
(function(window) {
  'use strict';

  var AudioMetadata = {
    /**
     * Extract metadata from audio file
     * @param {File} file - Audio file
     * @returns {Promise<Object>} Metadata object
     */
    extract: function(file) {
      return new Promise(function(resolve, reject) {
        var reader = new FileReader();

        reader.onload = function(e) {
          try {
            var arrayBuffer = e.target.result;
            var uint8Array = new Uint8Array(arrayBuffer);
            var metadata = {
              title: '',
              artist: '',
              album: '',
              year: '',
              genre: '',
              duration: 0,
              cover: null,
              fileName: file.name,
              fileSize: file.size,
              mimeType: file.type
            };

            // Detect format and extract
            if (AudioMetadata._isMP3(uint8Array)) {
              metadata = AudioMetadata._extractID3v2(uint8Array, metadata);
            } else if (AudioMetadata._isM4A(uint8Array)) {
              metadata = AudioMetadata._extractM4A(uint8Array, metadata);
            } else if (AudioMetadata._isOGG(uint8Array)) {
              metadata = AudioMetadata._extractOGG(uint8Array, metadata);
            } else if (AudioMetadata._isFLAC(uint8Array)) {
              metadata = AudioMetadata._extractFLAC(uint8Array, metadata);
            }

            // Fallback to filename if no title
            if (!metadata.title) {
              metadata.title = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
            }

            // Get duration via Audio element
            AudioMetadata._getDuration(file).then(function(duration) {
              metadata.duration = duration;
              resolve(metadata);
            }).catch(function() {
              resolve(metadata);
            });

          } catch (error) {
            reject(error);
          }
        };

        reader.onerror = function() {
          reject(new Error('Failed to read file'));
        };

        reader.readAsArrayBuffer(file);
      });
    },

    /**
     * Get audio duration via HTML5 Audio API
     */
    _getDuration: function(file) {
      return new Promise(function(resolve, reject) {
        var audio = new Audio();
        var url = URL.createObjectURL(file);

        audio.addEventListener('loadedmetadata', function() {
          var duration = Math.round(audio.duration);
          URL.revokeObjectURL(url);
          resolve(duration);
        });

        audio.addEventListener('error', function() {
          URL.revokeObjectURL(url);
          reject(new Error('Cannot get duration'));
        });

        audio.src = url;
      });
    },

    // Format detection
    _isMP3: function(data) {
      return data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33; // ID3
    },

    _isM4A: function(data) {
      return data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70; // ftyp
    },

    _isOGG: function(data) {
      return data[0] === 0x4F && data[1] === 0x67 && data[2] === 0x67 && data[3] === 0x53; // OggS
    },

    _isFLAC: function(data) {
      return data[0] === 0x66 && data[1] === 0x4C && data[2] === 0x61 && data[3] === 0x43; // fLaC
    },

    /**
     * Extract ID3v2 tags from MP3
     */
    _extractID3v2: function(data, metadata) {
      if (data[0] !== 0x49 || data[1] !== 0x44 || data[2] !== 0x33) return metadata;

      var version = data[3];
      var flags = data[5];
      var size = AudioMetadata._synchsafe(data[6], data[7], data[8], data[9]);

      var offset = 10;
      var end = offset + size;

      while (offset < end && offset < data.length - 10) {
        var frameId = AudioMetadata._readString(data, offset, 4);
        if (frameId === '\0\0\0\0' || frameId[0] === '\0') break;

        var frameSize = version === 4
          ? AudioMetadata._synchsafe(data[offset+4], data[offset+5], data[offset+6], data[offset+7])
          : (data[offset+4] << 24) | (data[offset+5] << 16) | (data[offset+6] << 8) | data[offset+7];

        var frameFlags = (data[offset+8] << 8) | data[offset+9];
        var frameData = data.slice(offset + 10, offset + 10 + frameSize);

        // Parse common frames
        if (frameId === 'TIT2') { // Title
          metadata.title = AudioMetadata._decodeTextFrame(frameData);
        } else if (frameId === 'TPE1') { // Artist
          metadata.artist = AudioMetadata._decodeTextFrame(frameData);
        } else if (frameId === 'TALB') { // Album
          metadata.album = AudioMetadata._decodeTextFrame(frameData);
        } else if (frameId === 'TYER' || frameId === 'TDRC') { // Year
          metadata.year = AudioMetadata._decodeTextFrame(frameData);
        } else if (frameId === 'TCON') { // Genre
          metadata.genre = AudioMetadata._decodeTextFrame(frameData);
        } else if (frameId === 'APIC') { // Picture
          metadata.cover = AudioMetadata._decodeAPIC(frameData);
        }

        offset += 10 + frameSize;
      }

      return metadata;
    },

    /**
     * Extract metadata from M4A/MP4
     */
    _extractM4A: function(data, metadata) {
      // Simplified M4A parsing - look for udta/meta atoms
      var offset = 0;
      while (offset < data.length - 8) {
        var atomSize = (data[offset] << 24) | (data[offset+1] << 16) | (data[offset+2] << 8) | data[offset+3];
        var atomType = AudioMetadata._readString(data, offset+4, 4);

        if (atomType === 'meta' || atomType === 'udta') {
          // Parse meta atoms (simplified)
          var metaData = data.slice(offset + 8, offset + atomSize);
          var metaOffset = 0;

          while (metaOffset < metaData.length - 8) {
            var subSize = (metaData[metaOffset] << 24) | (metaData[metaOffset+1] << 16) |
                         (metaData[metaOffset+2] << 8) | metaData[metaOffset+3];
            var subType = AudioMetadata._readString(metaData, metaOffset+4, 4);

            if (subType === '©nam') { // Title
              metadata.title = AudioMetadata._readM4AString(metaData, metaOffset + 8, subSize - 8);
            } else if (subType === '©ART') { // Artist
              metadata.artist = AudioMetadata._readM4AString(metaData, metaOffset + 8, subSize - 8);
            } else if (subType === '©alb') { // Album
              metadata.album = AudioMetadata._readM4AString(metaData, metaOffset + 8, subSize - 8);
            } else if (subType === '©day') { // Year
              metadata.year = AudioMetadata._readM4AString(metaData, metaOffset + 8, subSize - 8);
            }

            metaOffset += subSize;
          }
        }

        if (atomSize <= 0) break;
        offset += atomSize;
      }

      return metadata;
    },

    /**
     * Extract OGG Vorbis comments
     */
    _extractOGG: function(data, metadata) {
      // Simplified OGG parsing
      // Look for vorbis comment header
      var offset = 0;
      while (offset < data.length - 100) {
        if (data[offset] === 0x03 &&
            AudioMetadata._readString(data, offset+1, 6) === 'vorbis') {

          offset += 7;
          var vendorLength = data[offset] | (data[offset+1] << 8) |
                            (data[offset+2] << 16) | (data[offset+3] << 24);
          offset += 4 + vendorLength;

          var commentCount = data[offset] | (data[offset+1] << 8) |
                            (data[offset+2] << 16) | (data[offset+3] << 24);
          offset += 4;

          for (var i = 0; i < commentCount && offset < data.length - 4; i++) {
            var commentLength = data[offset] | (data[offset+1] << 8) |
                               (data[offset+2] << 16) | (data[offset+3] << 24);
            offset += 4;

            var comment = AudioMetadata._readString(data, offset, commentLength);
            offset += commentLength;

            var parts = comment.split('=');
            if (parts.length === 2) {
              var key = parts[0].toUpperCase();
              var value = parts[1];

              if (key === 'TITLE') metadata.title = value;
              else if (key === 'ARTIST') metadata.artist = value;
              else if (key === 'ALBUM') metadata.album = value;
              else if (key === 'DATE') metadata.year = value;
              else if (key === 'GENRE') metadata.genre = value;
            }
          }
          break;
        }
        offset++;
      }

      return metadata;
    },

    /**
     * Extract FLAC metadata
     */
    _extractFLAC: function(data, metadata) {
      if (!AudioMetadata._isFLAC(data)) return metadata;

      var offset = 4; // Skip 'fLaC'

      while (offset < data.length - 4) {
        var isLast = (data[offset] & 0x80) !== 0;
        var blockType = data[offset] & 0x7F;
        var blockSize = (data[offset+1] << 16) | (data[offset+2] << 8) | data[offset+3];

        offset += 4;

        if (blockType === 4) { // VORBIS_COMMENT
          var vendorLength = data[offset] | (data[offset+1] << 8) |
                            (data[offset+2] << 16) | (data[offset+3] << 24);
          offset += 4 + vendorLength;

          var commentCount = data[offset] | (data[offset+1] << 8) |
                            (data[offset+2] << 16) | (data[offset+3] << 24);
          offset += 4;

          for (var i = 0; i < commentCount && offset < data.length - 4; i++) {
            var commentLength = data[offset] | (data[offset+1] << 8) |
                               (data[offset+2] << 16) | (data[offset+3] << 24);
            offset += 4;

            var comment = AudioMetadata._readString(data, offset, commentLength);
            offset += commentLength;

            var parts = comment.split('=');
            if (parts.length === 2) {
              var key = parts[0].toUpperCase();
              var value = parts[1];

              if (key === 'TITLE') metadata.title = value;
              else if (key === 'ARTIST') metadata.artist = value;
              else if (key === 'ALBUM') metadata.album = value;
              else if (key === 'DATE') metadata.year = value;
              else if (key === 'GENRE') metadata.genre = value;
            }
          }
          break;
        }

        offset += blockSize;
        if (isLast) break;
      }

      return metadata;
    },

    // Helper functions
    _synchsafe: function(a, b, c, d) {
      return (a << 21) | (b << 14) | (c << 7) | d;
    },

    _readString: function(data, offset, length) {
      var str = '';
      for (var i = 0; i < length && offset + i < data.length; i++) {
        str += String.fromCharCode(data[offset + i]);
      }
      return str;
    },

    _readM4AString: function(data, offset, length) {
      // Skip data atom header (usually 16 bytes)
      var start = offset + 16;
      return AudioMetadata._decodeUTF8(data.slice(start, start + length - 16));
    },

    _decodeTextFrame: function(data) {
      if (data.length < 2) return '';

      var encoding = data[0];
      var text = data.slice(1);

      if (encoding === 0) { // ISO-8859-1
        return AudioMetadata._decodeISO88591(text);
      } else if (encoding === 1) { // UTF-16 with BOM
        return AudioMetadata._decodeUTF16(text);
      } else if (encoding === 3) { // UTF-8
        return AudioMetadata._decodeUTF8(text);
      }

      return AudioMetadata._decodeISO88591(text);
    },

    _decodeISO88591: function(data) {
      var str = '';
      for (var i = 0; i < data.length && data[i] !== 0; i++) {
        str += String.fromCharCode(data[i]);
      }
      return str;
    },

    _decodeUTF8: function(data) {
      try {
        var decoder = new TextDecoder('utf-8');
        return decoder.decode(data).replace(/\0/g, '');
      } catch (e) {
        return AudioMetadata._decodeISO88591(data);
      }
    },

    _decodeUTF16: function(data) {
      if (data.length < 2) return '';

      var bom = (data[0] << 8) | data[1];
      var littleEndian = bom === 0xFFFE;
      var str = '';

      for (var i = 2; i < data.length - 1; i += 2) {
        var charCode = littleEndian
          ? data[i] | (data[i+1] << 8)
          : (data[i] << 8) | data[i+1];

        if (charCode === 0) break;
        str += String.fromCharCode(charCode);
      }

      return str;
    },

    _decodeAPIC: function(data) {
      if (data.length < 10) return null;

      var encoding = data[0];
      var offset = 1;

      // Read MIME type
      var mimeEnd = offset;
      while (mimeEnd < data.length && data[mimeEnd] !== 0) mimeEnd++;
      var mimeType = AudioMetadata._readString(data, offset, mimeEnd - offset);
      offset = mimeEnd + 1;

      // Skip picture type and description
      var pictureType = data[offset];
      offset++;

      // Skip description
      while (offset < data.length && data[offset] !== 0) offset++;
      offset++;

      // Rest is image data
      var imageData = data.slice(offset);
      var blob = new Blob([imageData], { type: mimeType });
      return URL.createObjectURL(blob);
    }
  };

  window.AudioMetadata = AudioMetadata;

})(window);
