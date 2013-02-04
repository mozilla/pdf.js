/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* globals expect, it, describe, calculateMD5, ARCFourCipher, Name,
           CipherTransformFactory */

'use strict';

describe('crypto', function() {
  function string2binary(s) {
    var n = s.length, i;
    var result = new Uint8Array(n);
    for (i = 0; i < n; ++i)
      result[i] = s.charCodeAt(i) % 0xFF;
    return result;
  }

  function hex2binary(s) {
    var digits = '0123456789ABCDEF';
    s = s.toUpperCase();
    var n = s.length >> 1, i, j;
    var result = new Uint8Array(n);
    for (i = 0, j = 0; i < n; ++i) {
      var d1 = s.charAt(j++);
      var d2 = s.charAt(j++);
      var value = (digits.indexOf(d1) << 4) | (digits.indexOf(d2));
      result[i] = value;
    }
    return result;
  }

  // RFC 1321, A.5 Test suite
  describe('calculateMD5', function() {
    it('should pass RFC 1321 test #1', function() {
      var input, result, expected;
      input = string2binary('');
      result = calculateMD5(input, 0, input.length);
      expected = hex2binary('d41d8cd98f00b204e9800998ecf8427e');
      expect(result).toEqual(expected);
    });
    it('should pass RFC 1321 test #2', function() {
      var input, result, expected;
      input = string2binary('a');
      result = calculateMD5(input, 0, input.length);
      expected = hex2binary('0cc175b9c0f1b6a831c399e269772661');
      expect(result).toEqual(expected);
    });
    it('should pass RFC 1321 test #3', function() {
      var input, result, expected;
      input = string2binary('abc');
      result = calculateMD5(input, 0, input.length);
      expected = hex2binary('900150983cd24fb0d6963f7d28e17f72');
      expect(result).toEqual(expected);
    });
    it('should pass RFC 1321 test #4', function() {
      var input, result, expected;
      input = string2binary('message digest');
      result = calculateMD5(input, 0, input.length);
      expected = hex2binary('f96b697d7cb7938d525a2f31aaf161d0');
      expect(result).toEqual(expected);
    });
    it('should pass RFC 1321 test #5', function() {
      var input, result, expected;
      input = string2binary('abcdefghijklmnopqrstuvwxyz');
      result = calculateMD5(input, 0, input.length);
      expected = hex2binary('c3fcd3d76192e4007dfb496cca67e13b');
      expect(result).toEqual(expected);
    });
    it('should pass RFC 1321 test #6', function() {
      var input, result, expected;
      input = string2binary('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuv' +
        'wxyz0123456789');
      result = calculateMD5(input, 0, input.length);
      expected = hex2binary('d174ab98d277d9f5a5611c2c9f419d9f');
      expect(result).toEqual(expected);
    });
    it('should pass RFC 1321 test #7', function() {
      var input, result, expected;
      input = string2binary('123456789012345678901234567890123456789012345678' +
        '90123456789012345678901234567890');
      result = calculateMD5(input, 0, input.length);
      expected = hex2binary('57edf4a22be3c955ac49da2e2107b67a');
      expect(result).toEqual(expected);
    });
  });

  // http://www.freemedialibrary.com/index.php/RC4_test_vectors are used
  describe('ARCFourCipher', function() {
    it('should pass test #1', function() {
      var key, input, result, expected, cipher;
      key = hex2binary('0123456789abcdef');
      input = hex2binary('0123456789abcdef');
      cipher = new ARCFourCipher(key);
      result = cipher.encryptBlock(input);
      expected = hex2binary('75b7878099e0c596');
      expect(result).toEqual(expected);
    });
    it('should pass test #2', function() {
      var key, input, result, expected, cipher;
      key = hex2binary('0123456789abcdef');
      input = hex2binary('0000000000000000');
      cipher = new ARCFourCipher(key);
      result = cipher.encryptBlock(input);
      expected = hex2binary('7494c2e7104b0879');
      expect(result).toEqual(expected);
    });
    it('should pass test #3', function() {
      var key, input, result, expected, cipher;
      key = hex2binary('0000000000000000');
      input = hex2binary('0000000000000000');
      cipher = new ARCFourCipher(key);
      result = cipher.encryptBlock(input);
      expected = hex2binary('de188941a3375d3a');
      expect(result).toEqual(expected);
    });
    it('should pass test #4', function() {
      var key, input, result, expected, cipher;
      key = hex2binary('ef012345');
      input = hex2binary('00000000000000000000');
      cipher = new ARCFourCipher(key);
      result = cipher.encryptBlock(input);
      expected = hex2binary('d6a141a7ec3c38dfbd61');
      expect(result).toEqual(expected);
    });
    it('should pass test #5', function() {
      var key, input, result, expected, cipher;
      key = hex2binary('0123456789abcdef');
      input = hex2binary('010101010101010101010101010101010101010101010101010' +
        '10101010101010101010101010101010101010101010101010101010101010101010' +
        '10101010101010101010101010101010101010101010101010101010101010101010' +
        '10101010101010101010101010101010101010101010101010101010101010101010' +
        '10101010101010101010101010101010101010101010101010101010101010101010' +
        '10101010101010101010101010101010101010101010101010101010101010101010' +
        '10101010101010101010101010101010101010101010101010101010101010101010' +
        '10101010101010101010101010101010101010101010101010101010101010101010' +
        '10101010101010101010101010101010101010101010101010101010101010101010' +
        '10101010101010101010101010101010101010101010101010101010101010101010' +
        '10101010101010101010101010101010101010101010101010101010101010101010' +
        '10101010101010101010101010101010101010101010101010101010101010101010' +
        '10101010101010101010101010101010101010101010101010101010101010101010' +
        '10101010101010101010101010101010101010101010101010101010101010101010' +
        '10101010101010101010101010101010101010101010101010101010101010101010' +
        '101010101010101010101');
      cipher = new ARCFourCipher(key);
      result = cipher.encryptBlock(input);
      expected = hex2binary('7595c3e6114a09780c4ad452338e1ffd9a1be9498f813d76' +
        '533449b6778dcad8c78a8d2ba9ac66085d0e53d59c26c2d1c490c1ebbe0ce66d1b6b' +
        '1b13b6b919b847c25a91447a95e75e4ef16779cde8bf0a95850e32af9689444fd377' +
        '108f98fdcbd4e726567500990bcc7e0ca3c4aaa304a387d20f3b8fbbcd42a1bd311d' +
        '7a4303dda5ab078896ae80c18b0af66dff319616eb784e495ad2ce90d7f772a81747' +
        'b65f62093b1e0db9e5ba532fafec47508323e671327df9444432cb7367cec82f5d44' +
        'c0d00b67d650a075cd4b70dedd77eb9b10231b6b5b741347396d62897421d43df9b4' +
        '2e446e358e9c11a9b2184ecbef0cd8e7a877ef968f1390ec9b3d35a5585cb009290e' +
        '2fcde7b5ec66d9084be44055a619d9dd7fc3166f9487f7cb272912426445998514c1' +
        '5d53a18c864ce3a2b7555793988126520eacf2e3066e230c91bee4dd5304f5fd0405' +
        'b35bd99c73135d3d9bc335ee049ef69b3867bf2d7bd1eaa595d8bfc0066ff8d31509' +
        'eb0c6caa006c807a623ef84c3d33c195d23ee320c40de0558157c822d4b8c569d849' +
        'aed59d4e0fd7f379586b4b7ff684ed6a189f7486d49b9c4bad9ba24b96abf924372c' +
        '8a8fffb10d55354900a77a3db5f205e1b99fcd8660863a159ad4abe40fa48934163d' +
        'dde542a6585540fd683cbfd8c00f12129a284deacc4cdefe58be7137541c047126c8' +
        'd49e2755ab181ab7e940b0c0');
      expect(result).toEqual(expected);
    });
    it('should pass test #6', function() {
      var key, input, result, expected, cipher;
      key = hex2binary('fb029e3031323334');
      input = hex2binary('aaaa0300000008004500004e661a00008011be640a0001220af' +
        'fffff00890089003a000080a601100001000000000000204543454a4548454346434' +
        '550464545494546464343414341434143414341414100002000011bd0b604');
      cipher = new ARCFourCipher(key);
      result = cipher.encryptBlock(input);
      expected = hex2binary('f69c5806bd6ce84626bcbefb9474650aad1f7909b0f64d5f' +
        '58a503a258b7ed22eb0ea64930d3a056a55742fcce141d485f8aa836dea18df42c53' +
        '80805ad0c61a5d6f58f41040b24b7d1a693856ed0d4398e7aee3bf0e2a2ca8f7');
      expect(result).toEqual(expected);
    });
    it('should pass test #7', function() {
      var key, input, result, expected, cipher;
      key = hex2binary('0123456789abcdef');
      input = hex2binary('123456789abcdef0123456789abcdef0123456789abcdef0123' +
        '45678');
      cipher = new ARCFourCipher(key);
      result = cipher.encryptBlock(input);
      expected = hex2binary('66a0949f8af7d6891f7f832ba833c00c892ebe30143ce287' +
        '40011ecf');
      expect(result).toEqual(expected);
    });
  });
});

describe('CipherTransformFactory', function() {
  function DictMock(map) {
    this.map = map;
  }
  DictMock.prototype = {
    get: function(key) {
      return this.map[key];
    }
  };

  var map1 = {
    Filter: new Name('Standard'),
    V: 2,
    Length: 128,
    O: unescape('%80%C3%04%96%91o%20sl%3A%E6%1B%13T%91%F2%0DV%12%E3%FF%5E%BB%' +
                'E9VO%D8k%9A%CA%7C%5D'),
    U: unescape('j%0C%8D%3EY%19%00%BCjd%7D%91%BD%AA%00%18%00%00%00%00%00%00%0' +
                '0%00%00%00%00%00%00%00%00%00'),
    P: -1028,
    R: 3
  };
  var fileID1 = unescape('%F6%C6%AF%17%F3rR%8DRM%9A%80%D1%EF%DF%18');

  var map2 = {
    Filter: new Name('Standard'),
    V: 4,
    Length: 128,
    O: unescape('sF%14v.y5%27%DB%97%0A5%22%B3%E1%D4%AD%BD%9B%3C%B4%A5%89u%15%' +
                'B2Y%F1h%D9%E9%F4'),
    U: unescape('%93%04%89%A9%BF%8AE%A6%88%A2%DB%C2%A0%A8gn%00%00%00%00%00%00' +
                '%00%00%00%00%00%00%00%00%00%00'),
    P: -1084,
    R: 4
  };
  var fileID2 = unescape('%3CL_%3AD%96%AF@%9A%9D%B3%3Cx%1Cv%AC');

  describe('#ctor', function() {
    it('should accept user password', function() {
      var factory = new CipherTransformFactory(new DictMock(map1), fileID1,
        '123456');
    });

    it('should accept owner password', function() {
      var factory = new CipherTransformFactory(new DictMock(map1), fileID1,
        '654321');
    });

    it('should not accept wrong password', function() {
      var thrown = false;
      try {
        var factory = new CipherTransformFactory(new DictMock(map1), fileID1,
          'wrong');
      } catch (e) {
        thrown = true;
      }
      expect(thrown).toEqual(true);
    });

    it('should accept no password', function() {
      var factory = new CipherTransformFactory(new DictMock(map2), fileID2);
    });
  });
});
