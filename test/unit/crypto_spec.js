/* Copyright 2017 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  AES128Cipher, AES256Cipher, ARCFourCipher, calculateMD5, calculateSHA256,
  calculateSHA384, calculateSHA512, CipherTransformFactory, PDF17, PDF20
} from '../../src/core/crypto';
import { Dict, Name } from '../../src/core/primitives';
import {
  PasswordException, PasswordResponses, stringToBytes
} from '../../src/shared/util';

describe('crypto', function() {
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
      input = stringToBytes('');
      result = calculateMD5(input, 0, input.length);
      expected = hex2binary('d41d8cd98f00b204e9800998ecf8427e');
      expect(result).toEqual(expected);
    });
    it('should pass RFC 1321 test #2', function() {
      var input, result, expected;
      input = stringToBytes('a');
      result = calculateMD5(input, 0, input.length);
      expected = hex2binary('0cc175b9c0f1b6a831c399e269772661');
      expect(result).toEqual(expected);
    });
    it('should pass RFC 1321 test #3', function() {
      var input, result, expected;
      input = stringToBytes('abc');
      result = calculateMD5(input, 0, input.length);
      expected = hex2binary('900150983cd24fb0d6963f7d28e17f72');
      expect(result).toEqual(expected);
    });
    it('should pass RFC 1321 test #4', function() {
      var input, result, expected;
      input = stringToBytes('message digest');
      result = calculateMD5(input, 0, input.length);
      expected = hex2binary('f96b697d7cb7938d525a2f31aaf161d0');
      expect(result).toEqual(expected);
    });
    it('should pass RFC 1321 test #5', function() {
      var input, result, expected;
      input = stringToBytes('abcdefghijklmnopqrstuvwxyz');
      result = calculateMD5(input, 0, input.length);
      expected = hex2binary('c3fcd3d76192e4007dfb496cca67e13b');
      expect(result).toEqual(expected);
    });
    it('should pass RFC 1321 test #6', function() {
      var input, result, expected;
      input = stringToBytes('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuv' +
        'wxyz0123456789');
      result = calculateMD5(input, 0, input.length);
      expected = hex2binary('d174ab98d277d9f5a5611c2c9f419d9f');
      expect(result).toEqual(expected);
    });
    it('should pass RFC 1321 test #7', function() {
      var input, result, expected;
      input = stringToBytes('123456789012345678901234567890123456789012345678' +
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

  describe('calculateSHA256', function() {
    it('should properly hash abc', function() {
      var input, result, expected;
      input = stringToBytes('abc');
      result = calculateSHA256(input, 0, input.length);
      expected = hex2binary('BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9C' +
                            'B410FF61F20015AD');
      expect(result).toEqual(expected);
    });
    it('should properly hash a multiblock input', function() {
      var input, result, expected;
      input = stringToBytes('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmno' +
                            'mnopnopq');
      result = calculateSHA256(input, 0, input.length);
      expected = hex2binary('248D6A61D20638B8E5C026930C3E6039A33CE45964FF2167' +
                            'F6ECEDD419DB06C1');
      expect(result).toEqual(expected);
    });
  });

  describe('calculateSHA384', function() {
    it('should properly hash abc', function() {
      var input, result, expected;
      input = stringToBytes('abc');
      result = calculateSHA384(input, 0, input.length);
      expected = hex2binary('CB00753F45A35E8BB5A03D699AC65007272C32AB0EDED163' +
                            '1A8B605A43FF5BED8086072BA1E7CC2358BAECA134C825A7');
      expect(result).toEqual(expected);
    });
    it('should properly hash a multiblock input', function() {
      var input, result, expected;
      input = stringToBytes('abcdefghbcdefghicdefghijdefghijkefghijklfghijklm' +
                            'ghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrs' +
                            'mnopqrstnopqrstu');
      result = calculateSHA384(input, 0, input.length);
      expected = hex2binary('09330C33F71147E83D192FC782CD1B4753111B173B3B05D2' +
                            '2FA08086E3B0F712FCC7C71A557E2DB966C3E9FA91746039');
      expect(result).toEqual(expected);
    });
  });

  describe('calculateSHA512', function() {
    it('should properly hash abc', function() {
      var input, result, expected;
      input = stringToBytes('abc');
      result = calculateSHA512(input, 0, input.length);
      expected = hex2binary('DDAF35A193617ABACC417349AE20413112E6FA4E89A97EA2' +
                            '0A9EEEE64B55D39A2192992A274FC1A836BA3C23A3FEEBBD' +
                            '454D4423643CE80E2A9AC94FA54CA49F');
      expect(result).toEqual(expected);
    });
    it('should properly hash a multiblock input', function() {
      var input, result, expected;
      input = stringToBytes('abcdefghbcdefghicdefghijdefghijkefghijklfghijklm' +
                            'ghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrs' +
                            'mnopqrstnopqrstu');
      result = calculateSHA512(input, 0, input.length);
      expected = hex2binary('8E959B75DAE313DA8CF4F72814FC143F8F7779C6EB9F7FA1' +
                            '7299AEADB6889018501D289E4900F7E4331B99DEC4B5433A' +
                            'C7D329EEB6DD26545E96E55B874BE909');
      expect(result).toEqual(expected);
    });
  });

  describe('AES128', function() {
    describe('Encryption', function() {
      it('should be able to encrypt a block', function() {
        var input, key, result, expected, iv, cipher;
        input = hex2binary('00112233445566778899aabbccddeeff');
        key = hex2binary('000102030405060708090a0b0c0d0e0f');
        iv = hex2binary('00000000000000000000000000000000');
        cipher = new AES128Cipher(key);
        result = cipher.encrypt(input, iv);
        expected = hex2binary('69c4e0d86a7b0430d8cdb78070b4c55a');
        expect(result).toEqual(expected);
      });
    });

    describe('Decryption', function() {
      it('should be able to decrypt a block with IV in stream', function() {
        var input, key, result, expected, cipher;
        input = hex2binary('0000000000000000000000000000000069c4e0d86a7b0430d' +
                           '8cdb78070b4c55a');
        key = hex2binary('000102030405060708090a0b0c0d0e0f');
        cipher = new AES128Cipher(key);
        result = cipher.decryptBlock(input);
        expected = hex2binary('00112233445566778899aabbccddeeff');
        expect(result).toEqual(expected);
      });
    });
  });

  describe('AES256', function() {
    describe('Encryption', function() {
      it('should be able to encrypt a block', function() {
        var input, key, result, expected, iv, cipher;
        input = hex2binary('00112233445566778899aabbccddeeff');
        key = hex2binary('000102030405060708090a0b0c0d0e0f101112131415161718' +
                         '191a1b1c1d1e1f');
        iv = hex2binary('00000000000000000000000000000000');
        cipher = new AES256Cipher(key);
        result = cipher.encrypt(input, iv);
        expected = hex2binary('8ea2b7ca516745bfeafc49904b496089');
        expect(result).toEqual(expected);
      });
    });

    describe('Decryption', function() {
      it('should be able to decrypt a block with specified iv', function() {
        var input, key, result, expected, cipher, iv;
        input = hex2binary('8ea2b7ca516745bfeafc49904b496089');
        key = hex2binary('000102030405060708090a0b0c0d0e0f101112131415161718' +
                         '191a1b1c1d1e1f');
        iv = hex2binary('00000000000000000000000000000000');
        cipher = new AES256Cipher(key);
        result = cipher.decryptBlock(input, false, iv);
        expected = hex2binary('00112233445566778899aabbccddeeff');
        expect(result).toEqual(expected);
      });
      it('should be able to decrypt a block with IV in stream', function() {
        var input, key, result, expected, cipher;
        input = hex2binary('000000000000000000000000000000008ea2b7ca516745bf' +
                           'eafc49904b496089');
        key = hex2binary('000102030405060708090a0b0c0d0e0f101112131415161718' +
                         '191a1b1c1d1e1f');
        cipher = new AES256Cipher(key);
        result = cipher.decryptBlock(input, false);
        expected = hex2binary('00112233445566778899aabbccddeeff');
        expect(result).toEqual(expected);
      });
    });
  });

  describe('PDF17Algorithm', function() {
    it('should correctly check a user key', function() {
      var password, userValidation, userPassword, alg, result;
      alg = new PDF17();
      password = new Uint8Array([117, 115, 101, 114]);
      userValidation = new Uint8Array([117, 169, 4, 32, 159, 101, 22, 220]);
      userPassword = new Uint8Array([131, 242, 143, 160, 87, 2, 138, 134, 79,
                                     253, 189, 173, 224, 73, 144, 241, 190, 81,
                                     197, 15, 249, 105, 145, 151, 15, 194, 65,
                                     3, 1, 126, 187, 221]);
      result = alg.checkUserPassword(password, userValidation, userPassword);
      expect(result).toEqual(true);
    });

    it('should correctly check an owner key', function () {
      var password, ownerValidation, ownerPassword, alg, result, uBytes;
      alg = new PDF17();
      password = new Uint8Array([111, 119, 110, 101, 114]);
      ownerValidation = new Uint8Array([243, 118, 71, 153, 128, 17, 101, 62]);
      ownerPassword = new Uint8Array([60, 98, 137, 35, 51, 101, 200, 152, 210,
                                      178, 226, 228, 134, 205, 163, 24, 204,
                                      126, 177, 36, 106, 50, 36, 125, 210, 172,
                                      171, 120, 222, 108, 139, 115]);
      uBytes = new Uint8Array([131, 242, 143, 160, 87, 2, 138, 134, 79, 253,
                               189, 173, 224, 73, 144, 241, 190, 81, 197, 15,
                               249, 105, 145, 151, 15, 194, 65, 3, 1, 126, 187,
                               221, 117, 169, 4, 32, 159, 101, 22, 220, 168,
                               94, 215, 192, 100, 38, 188, 40]);
      result = alg.checkOwnerPassword(password, ownerValidation, uBytes,
                                      ownerPassword);
      expect(result).toEqual(true);
    });

    it('should generate a file encryption key from the user key', function () {
      var password, userKeySalt, expected, alg, result, userEncryption;
      alg = new PDF17();
      password = new Uint8Array([117, 115, 101, 114]);
      userKeySalt = new Uint8Array([168, 94, 215, 192, 100, 38, 188, 40]);
      userEncryption = new Uint8Array([35, 150, 195, 169, 245, 51, 51, 255,
                                       158, 158, 33, 242, 231, 75, 125, 190,
                                       25, 126, 172, 114, 195, 244, 137, 245,
                                       234, 165, 42, 74, 60, 38, 17, 17]);
      result = alg.getUserKey(password, userKeySalt, userEncryption);
      expected = new Uint8Array([63, 114, 136, 209, 87, 61, 12, 30, 249, 1,
                                 186, 144, 254, 248, 163, 153, 151, 51, 133,
                                 10, 80, 152, 206, 15, 72, 187, 231, 33, 224,
                                 239, 13, 213]);
      expect(result).toEqual(expected);
    });

    it('should generate a file encryption key from the owner key', function () {
      var password, ownerKeySalt, expected, alg, result, ownerEncryption;
      var uBytes;
      alg = new PDF17();
      password = new Uint8Array([111, 119, 110, 101, 114]);
      ownerKeySalt = new Uint8Array([200, 245, 242, 12, 218, 123, 24, 120]);
      ownerEncryption = new Uint8Array([213, 202, 14, 189, 110, 76, 70, 191, 6,
                                        195, 10, 190, 157, 100, 144, 85, 8, 62,
                                        123, 178, 156, 229, 50, 40, 229, 216,
                                        54, 222, 34, 38, 106, 223]);
      uBytes = new Uint8Array([131, 242, 143, 160, 87, 2, 138, 134, 79, 253,
                               189, 173, 224, 73, 144, 241, 190, 81, 197, 15,
                               249, 105, 145, 151, 15, 194, 65, 3, 1, 126, 187,
                               221, 117, 169, 4, 32, 159, 101, 22, 220, 168,
                               94, 215, 192, 100, 38, 188, 40]);
      result = alg.getOwnerKey(password, ownerKeySalt, uBytes, ownerEncryption);
      expected = new Uint8Array([63, 114, 136, 209, 87, 61, 12, 30, 249, 1,
                                 186, 144, 254, 248, 163, 153, 151, 51, 133,
                                 10, 80, 152, 206, 15, 72, 187, 231, 33, 224,
                                 239, 13, 213]);
      expect(result).toEqual(expected);
    });
  });

  describe('PDF20Algorithm', function() {
    it('should correctly check a user key', function () {
      var password, userValidation, userPassword, alg, result;
      alg = new PDF20();
      password = new Uint8Array([117, 115, 101, 114]);
      userValidation = new Uint8Array([83, 245, 146, 101, 198, 247, 34, 198]);
      userPassword = new Uint8Array([94, 230, 205, 75, 166, 99, 250, 76, 219,
                                     128, 17, 85, 57, 17, 33, 164, 150, 46,
                                     103, 176, 160, 156, 187, 233, 166, 223,
                                     163, 253, 147, 235, 95, 184]);
      result = alg.checkUserPassword(password, userValidation, userPassword);
      expect(result).toEqual(true);
    });

    it('should correctly check an owner key', function () {
      var password, ownerValidation, ownerPassword, alg, result, uBytes;
      alg = new PDF20();
      password = new Uint8Array([111, 119, 110, 101, 114]);
      ownerValidation = new Uint8Array([142, 232, 169, 208, 202, 214, 5, 185]);
      ownerPassword = new Uint8Array([88, 232, 62, 54, 245, 26, 245, 209, 137,
                                      123, 221, 72, 199, 49, 37, 217, 31, 74,
                                      115, 167, 127, 158, 176, 77, 45, 163, 87,
                                      47, 39, 90, 217, 141]);
      uBytes = new Uint8Array([94, 230, 205, 75, 166, 99, 250, 76, 219, 128,
                               17, 85, 57, 17, 33, 164, 150, 46, 103, 176, 160,
                               156, 187, 233, 166, 223, 163, 253, 147, 235, 95,
                               184, 83, 245, 146, 101, 198, 247, 34, 198, 191,
                               11, 16, 94, 237, 216, 20, 175]);
      result = alg.checkOwnerPassword(password, ownerValidation, uBytes,
                                      ownerPassword);
      expect(result).toEqual(true);
    });

    it('should generate a file encryption key from the user key', function () {
      var password, userKeySalt, expected, alg, result, userEncryption;
      alg = new PDF20();
      password = new Uint8Array([117, 115, 101, 114]);
      userKeySalt = new Uint8Array([191, 11, 16, 94, 237, 216, 20, 175]);
      userEncryption = new Uint8Array([121, 208, 2, 181, 230, 89, 156, 60, 253,
                                       143, 212, 28, 84, 180, 196, 177, 173,
                                       128, 221, 107, 46, 20, 94, 186, 135, 51,
                                       95, 24, 20, 223, 254, 36]);
      result = alg.getUserKey(password, userKeySalt, userEncryption);
      expected = new Uint8Array([42, 218, 213, 39, 73, 91, 72, 79, 67, 38, 248,
                                 133, 18, 189, 61, 34, 107, 79, 29, 56, 59,
                                 181, 213, 118, 113, 34, 65, 210, 87, 174, 22,
                                 239]);
      expect(result).toEqual(expected);
    });

    it('should generate a file encryption key from the owner key', function () {
      var password, ownerKeySalt, expected, alg, result, ownerEncryption;
      var uBytes;
      alg = new PDF20();
      password = new Uint8Array([111, 119, 110, 101, 114]);
      ownerKeySalt = new Uint8Array([29, 208, 185, 46, 11, 76, 135, 149]);
      ownerEncryption = new Uint8Array([209, 73, 224, 77, 103, 155, 201, 181,
                                        190, 68, 223, 20, 62, 90, 56, 210, 5,
                                        240, 178, 128, 238, 124, 68, 254, 253,
                                        244, 62, 108, 208, 135, 10, 251]);
      uBytes = new Uint8Array([94, 230, 205, 75, 166, 99, 250, 76, 219, 128,
                               17, 85, 57, 17, 33, 164, 150, 46, 103, 176, 160,
                               156, 187, 233, 166, 223, 163, 253, 147, 235, 95,
                               184, 83, 245, 146, 101, 198, 247, 34, 198, 191,
                               11, 16, 94, 237, 216, 20, 175]);
      result = alg.getOwnerKey(password, ownerKeySalt, uBytes, ownerEncryption);
      expected = new Uint8Array([42, 218, 213, 39, 73, 91, 72, 79, 67, 38, 248,
                                 133, 18, 189, 61, 34, 107, 79, 29, 56, 59,
                                 181, 213, 118, 113, 34, 65, 210, 87, 174, 22,
                                 239]);
      expect(result).toEqual(expected);
    });
  });
});

describe('CipherTransformFactory', function() {
  function buildDict(map) {
    var dict = new Dict();
    for (var key in map) {
      dict.set(key, map[key]);
    }
    return dict;
  }

  function ensurePasswordCorrect(done, dict, fileId, password) {
    try {
      var factory = new CipherTransformFactory(dict, fileId, password);
      expect('createCipherTransform' in factory).toEqual(true);
    } catch (ex) {
      done.fail('Password should be accepted: ' + ex);
      return;
    }
    done();
  }

  function ensurePasswordNeeded(done, dict, fileId, password) {
    try {
      // eslint-disable-next-line no-new
      new CipherTransformFactory(dict, fileId, password);
    } catch (ex) {
      expect(ex instanceof PasswordException).toEqual(true);
      expect(ex.code).toEqual(PasswordResponses.NEED_PASSWORD);

      done();
      return;
    }
    done.fail('Password should be rejected.');
  }

  function ensurePasswordIncorrect(done, dict, fileId, password) {
    try {
      // eslint-disable-next-line no-new
      new CipherTransformFactory(dict, fileId, password);
    } catch (ex) {
      expect(ex instanceof PasswordException).toEqual(true);
      expect(ex.code).toEqual(PasswordResponses.INCORRECT_PASSWORD);

      done();
      return;
    }
    done.fail('Password should be rejected.');
  }

  var fileId1, fileId2, dict1, dict2;
  var aes256Dict, aes256IsoDict, aes256BlankDict, aes256IsoBlankDict;

  beforeAll(function (done) {
    fileId1 = unescape('%F6%C6%AF%17%F3rR%8DRM%9A%80%D1%EF%DF%18');
    fileId2 = unescape('%3CL_%3AD%96%AF@%9A%9D%B3%3Cx%1Cv%AC');

    dict1 = buildDict({
      Filter: Name.get('Standard'),
      V: 2,
      Length: 128,
      O: unescape('%80%C3%04%96%91o%20sl%3A%E6%1B%13T%91%F2%0DV%12%E3%FF%5E%B' +
                  'B%E9VO%D8k%9A%CA%7C%5D'),
      U: unescape('j%0C%8D%3EY%19%00%BCjd%7D%91%BD%AA%00%18%00%00%00%00%00%00' +
                  '%00%00%00%00%00%00%00%00%00%00'),
      P: -1028,
      R: 3,
    });
    dict2 = buildDict({
      Filter: Name.get('Standard'),
      V: 4,
      Length: 128,
      O: unescape('sF%14v.y5%27%DB%97%0A5%22%B3%E1%D4%AD%BD%9B%3C%B4%A5%89u%1' +
                  '5%B2Y%F1h%D9%E9%F4'),
      U: unescape('%93%04%89%A9%BF%8AE%A6%88%A2%DB%C2%A0%A8gn%00%00%00%00%00%' +
                  '00%00%00%00%00%00%00%00%00%00%00'),
      P: -1084,
      R: 4,
    });
    aes256Dict = buildDict({
      Filter: Name.get('Standard'),
      V: 5,
      Length: 256,
      O: unescape('%3Cb%89%233e%C8%98%D2%B2%E2%E4%86%CD%A3%18%CC%7E%B1%24j2%2' +
                  '4%7D%D2%AC%ABx%DEl%8Bs%F3vG%99%80%11e%3E%C8%F5%F2%0C%DA%7B' +
                  '%18x'),
      U: unescape('%83%F2%8F%A0W%02%8A%86O%FD%BD%AD%E0I%90%F1%BEQ%C5%0F%F9i%9' +
                  '1%97%0F%C2A%03%01%7E%BB%DDu%A9%04%20%9Fe%16%DC%A8%5E%D7%C0' +
                  'd%26%BC%28'),
      OE: unescape('%D5%CA%0E%BDnLF%BF%06%C3%0A%BE%9Dd%90U%08%3E%7B%B2%9C%E52' +
                   '%28%E5%D86%DE%22%26j%DF'),
      UE: unescape('%23%96%C3%A9%F533%FF%9E%9E%21%F2%E7K%7D%BE%19%7E%ACr%C3%F' +
                   '4%89%F5%EA%A5*J%3C%26%11%11'),
      Perms: unescape('%D8%FC%844%E5e%0DB%5D%7Ff%FD%3COMM'),
      P: -1084,
      R: 5,
    });
    aes256IsoDict = buildDict({
      Filter: Name.get('Standard'),
      V: 5,
      Length: 256,
      O: unescape('X%E8%3E6%F5%1A%F5%D1%89%7B%DDH%C71%25%D9%1FJs%A7%7F%9E%B0M' +
                  '-%A3W/%27Z%D9%8D%8E%E8%A9%D0%CA%D6%05%B9%1D%D0%B9.%0BL%87%' +
                  '95'),
      U: unescape('%5E%E6%CDK%A6c%FAL%DB%80%11U9%11%21%A4%96.g%B0%A0%9C%BB%E9' +
                  '%A6%DF%A3%FD%93%EB_%B8S%F5%92e%C6%F7%22%C6%BF%0B%10%5E%ED%' +
                  'D8%14%AF'),
      OE: unescape('%D1I%E0Mg%9B%C9%B5%BED%DF%14%3EZ8%D2%05%F0%B2%80%EE%7CD%F' +
                   'E%FD%F4%3El%D0%87%0A%FB'),
      UE: unescape('y%D0%02%B5%E6Y%9C%3C%FD%8F%D4%1CT%B4%C4%B1%AD%80%DDk.%14%' +
                   '5E%BA%873_%18%14%DF%FE%24'),
      Perms: unescape('l%AD%0F%A0%EBM%86WM%3E%CB%B5%E0X%C97'),
      P: -1084,
      R: 6,
    });
    aes256BlankDict = buildDict({
      Filter: Name.get('Standard'),
      V: 5,
      Length: 256,
      O: unescape('%B8p%04%C3g%26%FCW%CCN%D4%16%A1%E8%950YZ%C9%9E%B1-%97%F3%F' +
                  'E%03%13%19ffZn%8F%F5%EB%EC%CC5sV%10e%CEl%B5%E9G%C1'),
      U: unescape('%83%D4zi%F1O0%961%12%CC%82%CB%CA%BF5y%FD%21%EB%E4%D1%B5%1D' +
                  '%D6%FA%14%F3%BE%8Fqs%EF%88%DE%E2%E8%DC%F55%E4%B8%16%C8%14%' +
                  '8De%1E'),
      OE: unescape('%8F%19%E8%D4%27%D5%07%CA%C6%A1%11%A6a%5Bt%F4%DF%0F%84%29%' +
                   '0F%E4%EFF7%5B%5B%11%A0%8F%17e'),
      UE: unescape('%81%F5%5D%B0%28%81%E4%7F_%7C%8F%85b%A0%7E%10%D0%88lx%7B%7' +
                   'EJ%5E%912%B6d%12%27%05%F6'),
      Perms: unescape('%86%1562%0D%AE%A2%FB%5D%3B%22%3Dq%12%B2H'),
      P: -1084,
      R: 5,
    });
    aes256IsoBlankDict = buildDict({
      Filter: Name.get('Standard'),
      V: 5,
      Length: 256,
      O: unescape('%F7%DB%99U%A6M%ACk%AF%CF%D7AFw%E9%C1%91%CBDgI%23R%CF%0C%15' +
                  'r%D74%0D%CE%E9%91@%E4%98QF%BF%88%7Ej%DE%AD%8F%F4@%C1'),
      U: unescape('%1A%A9%DC%918%83%93k%29%5B%117%B16%DB%E8%8E%FE%28%E5%89%D4' +
                  '%0E%AD%12%3B%7DN_6fez%8BG%18%05YOh%7DZH%A3Z%87%17*'),
      OE: unescape('%A4a%88%20h%1B%7F%CD%D5%CAc%D8R%83%E5%D6%1C%D2%98%07%984%' +
                   'BA%AF%1B%B4%7FQ%F8%1EU%7D'),
      UE: unescape('%A0%0AZU%27%1D%27%2C%0B%FE%0E%A2L%F9b%5E%A1%B9%D6v7b%B26%' +
                   'A9N%99%F1%A4Deq'),
      Perms: unescape('%03%F2i%07%0D%C3%F9%F2%28%80%B7%F5%DD%D1c%EB'),
      P: -1084,
      R: 6,
    });

    done();
  });

  afterAll(function () {
    fileId1 = fileId2 = dict1 = dict2 = null;
    aes256Dict = aes256IsoDict = aes256BlankDict = aes256IsoBlankDict = null;
  });

  describe('#ctor', function() {
    describe('AES256 Revision 5', function () {
      it('should accept user password', function (done) {
        ensurePasswordCorrect(done, aes256Dict, fileId1, 'user');
      });
      it('should accept owner password', function (done) {
        ensurePasswordCorrect(done, aes256Dict, fileId1, 'owner');
      });
      it('should not accept blank password', function (done) {
        ensurePasswordNeeded(done, aes256Dict, fileId1);
      });
      it('should not accept wrong password', function (done) {
        ensurePasswordIncorrect(done, aes256Dict, fileId1, 'wrong');
      });
      it('should accept blank password', function (done) {
        ensurePasswordCorrect(done, aes256BlankDict, fileId1);
      });
    });

    describe('AES256 Revision 6', function () {
      it('should accept user password', function (done) {
        ensurePasswordCorrect(done, aes256IsoDict, fileId1, 'user');
      });
      it('should accept owner password', function (done) {
        ensurePasswordCorrect(done, aes256IsoDict, fileId1, 'owner');
      });
      it('should not accept blank password', function (done) {
        ensurePasswordNeeded(done, aes256IsoDict, fileId1);
      });
      it('should not accept wrong password', function (done) {
        ensurePasswordIncorrect(done, aes256IsoDict, fileId1, 'wrong');
      });
      it('should accept blank password', function (done) {
        ensurePasswordCorrect(done, aes256IsoBlankDict, fileId1);
      });
    });

    it('should accept user password', function (done) {
      ensurePasswordCorrect(done, dict1, fileId1, '123456');
    });
    it('should accept owner password', function (done) {
      ensurePasswordCorrect(done, dict1, fileId1, '654321');
    });
    it('should not accept blank password', function (done) {
      ensurePasswordNeeded(done, dict1, fileId1);
    });
    it('should not accept wrong password', function (done) {
      ensurePasswordIncorrect(done, dict1, fileId1, 'wrong');
    });
    it('should accept blank password', function (done) {
      ensurePasswordCorrect(done, dict2, fileId2);
    });
  });
});
