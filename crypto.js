/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

"use strict";

var ARCFourCipher = (function() {
  function constructor(key) {
    this.a = 0;
    this.b = 0;
    var s = new Uint8Array(256);
    var i, j = 0, tmp, keyLength = key.length;
    for (i = 0; i < 256; ++i)
      s[i] = i;
    for (i = 0; i < 256; ++i) {
      tmp = s[i];
      j = (j + tmp + key[i % keyLength]) & 0xFF;
      s[i] = s[j];
      s[j] = tmp;
    }
    this.s = s;
  }

  constructor.prototype = {
    encryptBlock: function(data) {
      var i, n = data.length, tmp, tmp2;
      var a = this.a, b = this.b, s = this.s;
      var output = new Uint8Array(n);
      for (i = 0; i < n; ++i) {
        var tmp;
        a = (a + 1) & 0xFF;
        tmp = s[a];
        b = (b + tmp) & 0xFF;
        tmp2 = s[b]
        s[a] = tmp2;
        s[b] = tmp;
        output[i] = data[i] ^ s[(tmp + tmp2) & 0xFF];
      }
      this.a = a;
      this.b = b;
      return output;
    }
  };

  return constructor;
})();

var md5 = (function() {
  var r = new Uint8Array([
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21]);
  var k = new Int32Array([
    -680876936, -389564586, 606105819, -1044525330, -176418897, 1200080426,
    -1473231341, -45705983, 1770035416, -1958414417, -42063, -1990404162,
    1804603682, -40341101, -1502002290, 1236535329, -165796510, -1069501632,
    643717713, -373897302, -701558691, 38016083, -660478335, -405537848, 568446438,
    -1019803690, -187363961, 1163531501, -1444681467, -51403784, 1735328473,
    -1926607734, -378558, -2022574463, 1839030562, -35309556, -1530992060,
    1272893353, -155497632, -1094730640, 681279174, -358537222, -722521979,
    76029189, -640364487, -421815835, 530742520, -995338651, -198630844, 1126891415,
    -1416354905, -57434055, 1700485571, -1894986606, -1051523, -2054922799,
    1873313359, -30611744, -1560198380, 1309151649, -145523070, -1120210379,
    718787259, -343485551]);
  
  function hash(data, offset, length) {
    var h0 = 1732584193, h1 = -271733879, h2 = -1732584194, h3 = 271733878;
    // pre-processing
    var paddedLength = (length + 72) & ~63; // data + 9 extra bytes
    var padded = new Uint8Array(paddedLength);
    var i, j, n;
    for (i = 0; i < length; ++i)
      padded[i] = data[offset++];
    padded[i++] = 0x80;
    n = paddedLength - 8;
    for (; i < n; ++i)
      padded[i] = 0;
    padded[i++] = (length << 3) & 0xFF;
    padded[i++] = (length >> 5)  & 0xFF;
    padded[i++] = (length >> 13)  & 0xFF;
    padded[i++] = (length >> 21)  & 0xFF;
    padded[i++] = (length >>> 29)  & 0xFF;
    padded[i++] = 0;
    padded[i++] = 0;
    padded[i++] = 0;
    // chunking
    // TODO ArrayBuffer ?
    var w = new Int32Array(16);
    for (i = 0; i < paddedLength;) {
      for (j = 0; j < 16; ++j, i += 4)
        w[j] = padded[i] | (padded[i + 1] << 8) | (padded[i + 2] << 16) | (padded[i + 3] << 24);
      var a = h0, b = h1, c = h2, d = h3, f, g;
      for (j = 0; j < 64; ++j) {
        if (j < 16) {
          f = (b & c) | ((~b) & d);
          g = j;
        } else if (j < 32) {
          f = (d & b) | ((~d) & c);
          g = (5 * j + 1) & 15;
        } else if (j < 48) {
          f = b ^ c ^ d;
          g = (3 * j + 5) & 15;
        } else {
          f = c ^ (b | (~d));
          g = (7 * j) & 15;
        }
        var tmp = d, rotateArg = (a + f + k[j] + w[g]) | 0, rotate = r[j];
        d = c;
        c = b;
        b = (b + ((rotateArg << rotate) | (rotateArg >>> (32 - rotate)))) | 0;
        a = tmp;
      }
      h0 = (h0 + a) | 0;
      h1 = (h1 + b) | 0;
      h2 = (h2 + c) | 0;
      h3 = (h3 + d) | 0;
    }
    return new Uint8Array([
        h0 & 0xFF, (h0 >> 8) & 0xFF, (h0 >> 16) & 0xFF, (h0 >>> 24) & 0xFF,
        h1 & 0xFF, (h1 >> 8) & 0xFF, (h1 >> 16) & 0xFF, (h1 >>> 24) & 0xFF,
        h2 & 0xFF, (h2 >> 8) & 0xFF, (h2 >> 16) & 0xFF, (h2 >>> 24) & 0xFF,
        h3 & 0xFF, (h3 >> 8) & 0xFF, (h3 >> 16) & 0xFF, (h3 >>> 24) & 0xFF
    ]);
  }
  return hash;
})();

var CipherTransform = (function() {
  function constructor(stringCipherConstructor, streamCipherConstructor) {
    this.stringCipherConstructor = stringCipherConstructor;
    this.streamCipherConstructor = streamCipherConstructor;
  }
  constructor.prototype = {
    createStream: function (stream) {
      var cipher = new this.streamCipherConstructor();
      return new DecryptStream(stream, function(data) {
        return cipher.encryptBlock(data);
      });
    },
    decryptString: function(s) {
      var cipher = new this.stringCipherConstructor();
      var data = string2bytes(s);
      data = cipher.encryptBlock(data);
      return bytes2string(data);
    }
  };
  return constructor;
})();

var CipherTransformFactory = (function() {
  function prepareKeyData(fileId, password, ownerPassword, userPassword, flags, revision, keyLength) {
    var defaultPasswordBytes = new Uint8Array([
      0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41, 0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08, 
      0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80, 0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A]);
    var hashData = new Uint8Array(88), i = 0, j, n;
    if (password) {
      n = Math.min(32, password.length);
      for (; i < n; ++i)
        hashData[i] = password[i];
    }
    j = 0;
    while (i < 32) {
      hashData[i++] = defaultPasswordBytes[j++];
    }
    // as now the padded password in the hashData[0..i]
    for (j = 0, n = ownerPassword.length; j < n; ++j)
      hashData[i++] = ownerPassword[j];
    hashData[i++] = flags & 0xFF;
    hashData[i++] = (flags >> 8) & 0xFF;
    hashData[i++] = (flags >> 16) & 0xFF;
    hashData[i++] = (flags >>> 24) & 0xFF;
    for (j = 0, n = fileId.length; j < n; ++j)
      hashData[i++] = fileId[j];
    // TODO rev 4, if metadata is not encrypted pass 0xFFFFFF also
    var hash = md5(hashData, 0, i);
    var keyLengthInBytes = keyLength >> 3;
    if (revision >= 3) {
      for (j = 0; j < 50; ++j) {
         hash = md5(hash, 0, keyLengthInBytes);
      }
    }
    var encryptionKey = hash.subarray(0, keyLengthInBytes);
    var cipher, checkData;

    if (revision >= 3) {
      // padded password in hashData, we can use this array for user password check
      i = 32;
      for(j = 0, n = fileId.length; j < n; ++j)
        hashData[i++] = fileId[j];
      cipher = new ARCFourCipher(encryptionKey);
      var checkData = cipher.encryptBlock(md5(hashData, 0, i));
      n = encryptionKey.length;
      var derrivedKey = new Uint8Array(n), k;
      for (j = 1; j <= 19; ++j) {
        for (k = 0; k < n; ++k)
          derrivedKey[k] = encryptionKey[k] ^ j;
        cipher = new ARCFourCipher(derrivedKey);
        checkData = cipher.encryptBlock(checkData);
      }
    } else {
      cipher = new ARCFourCipher(encryptionKey);
      checkData = cipher.encryptBlock(hashData.subarray(0, 32));
    }
    for (j = 0, n = checkData.length; j < n; ++j) {
      if (userPassword[j] != checkData[j])
        error("incorrect password");
    }
    return encryptionKey;
  } 

  function constructor(dict, fileId, password) {
    var filter = dict.get("Filter");
    if (!IsName(filter) || filter.name != "Standard")
      error("unknown encryption method");
    this.dict = dict;
    var algorithm = dict.get("V");
    if (!IsInt(algorithm) ||
      (algorithm != 1 && algorithm != 2))
      error("unsupported encryption algorithm");
    // TODO support algorithm 4
    var keyLength = dict.get("Length") || 40;
    if (!IsInt(keyLength) ||
      keyLength < 40 || (keyLength % 8) != 0)
      error("invalid key length");
    // prepare keys
    var ownerPassword = stringToBytes(dict.get("O"));
    var userPassword = stringToBytes(dict.get("U"));
    var flags = dict.get("P");
    var revision = dict.get("R");
    var fileIdBytes = stringToBytes(fileId);
    var passwordBytes;
    if (password)
      passwordBytes = stringToBytes(password);

    this.encryptionKey = prepareKeyData(fileIdBytes, passwordBytes, 
                                        ownerPassword, userPassword, flags, revision, keyLength);
  }

  constructor.prototype = {
    createCipherTransform: function(num, gen) {
      var encryptionKey = this.encryptionKey;
      var key = new Uint8Array(encryptionKey.length + 5), i, n;
      for (i = 0, n = encryptionKey.length; i < n; ++i)
        key[i] = encryptionKey[i];
      key[i++] = num & 0xFF;
      key[i++] = (num >> 8) & 0xFF;
      key[i++] = (num >> 16) & 0xFF;
      key[i++] = gen & 0xFF;
      key[i++] = (gen >> 8) & 0xFF;
      var hash = md5(key, 0, i);
      key = hash.subarray(0, Math.min(key.length, 16));
      var cipherConstructor = function() {
        return new ARCFourCipher(key);
      };
      return new CipherTransform(cipherConstructor, cipherConstructor);
    }
  };

  return constructor;
})();
