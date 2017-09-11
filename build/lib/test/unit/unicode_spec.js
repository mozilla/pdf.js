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
'use strict';

var _glyphlist = require('../../core/glyphlist');

var _unicode = require('../../core/unicode');

describe('unicode', function () {
  describe('mapSpecialUnicodeValues', function () {
    it('should not re-map normal Unicode values', function () {
      expect((0, _unicode.mapSpecialUnicodeValues)(0x0041)).toEqual(0x0041);
      expect((0, _unicode.mapSpecialUnicodeValues)(0xFB01)).toEqual(0xFB01);
    });
    it('should re-map special Unicode values', function () {
      expect((0, _unicode.mapSpecialUnicodeValues)(0xF8E9)).toEqual(0x00A9);
      expect((0, _unicode.mapSpecialUnicodeValues)(0xFFFF)).toEqual(0);
    });
  });
  describe('getUnicodeForGlyph', function () {
    var standardMap, dingbatsMap;
    beforeAll(function (done) {
      standardMap = (0, _glyphlist.getGlyphsUnicode)();
      dingbatsMap = (0, _glyphlist.getDingbatsGlyphsUnicode)();
      done();
    });
    afterAll(function () {
      standardMap = dingbatsMap = null;
    });
    it('should get Unicode values for valid glyph names', function () {
      expect((0, _unicode.getUnicodeForGlyph)('A', standardMap)).toEqual(0x0041);
      expect((0, _unicode.getUnicodeForGlyph)('a1', dingbatsMap)).toEqual(0x2701);
    });
    it('should recover Unicode values from uniXXXX/uXXXX{XX} glyph names', function () {
      expect((0, _unicode.getUnicodeForGlyph)('uni0041', standardMap)).toEqual(0x0041);
      expect((0, _unicode.getUnicodeForGlyph)('u0041', standardMap)).toEqual(0x0041);
      expect((0, _unicode.getUnicodeForGlyph)('uni2701', dingbatsMap)).toEqual(0x2701);
      expect((0, _unicode.getUnicodeForGlyph)('u2701', dingbatsMap)).toEqual(0x2701);
    });
    it('should not get Unicode values for invalid glyph names', function () {
      expect((0, _unicode.getUnicodeForGlyph)('Qwerty', standardMap)).toEqual(-1);
      expect((0, _unicode.getUnicodeForGlyph)('Qwerty', dingbatsMap)).toEqual(-1);
    });
  });
  describe('getUnicodeRangeFor', function () {
    it('should get correct Unicode range', function () {
      expect((0, _unicode.getUnicodeRangeFor)(0x0041)).toEqual(0);
      expect((0, _unicode.getUnicodeRangeFor)(0xFB01)).toEqual(62);
    });
    it('should not get a Unicode range', function () {
      expect((0, _unicode.getUnicodeRangeFor)(0x05FF)).toEqual(-1);
    });
  });
  describe('getNormalizedUnicodes', function () {
    var NormalizedUnicodes;
    beforeAll(function (done) {
      NormalizedUnicodes = (0, _unicode.getNormalizedUnicodes)();
      done();
    });
    afterAll(function () {
      NormalizedUnicodes = null;
    });
    it('should get normalized Unicode values for ligatures', function () {
      expect(NormalizedUnicodes['\uFB01']).toEqual('fi');
      expect(NormalizedUnicodes['\u0675']).toEqual('\u0627\u0674');
    });
    it('should not normalize standard characters', function () {
      expect(NormalizedUnicodes['A']).toEqual(undefined);
    });
  });
  describe('reverseIfRtl', function () {
    var NormalizedUnicodes;
    function getGlyphUnicode(char) {
      if (NormalizedUnicodes[char] !== undefined) {
        return NormalizedUnicodes[char];
      }
      return char;
    }
    beforeAll(function (done) {
      NormalizedUnicodes = (0, _unicode.getNormalizedUnicodes)();
      done();
    });
    afterAll(function () {
      NormalizedUnicodes = null;
    });
    it('should not reverse LTR characters', function () {
      var A = getGlyphUnicode('A');
      expect((0, _unicode.reverseIfRtl)(A)).toEqual('A');
      var fi = getGlyphUnicode('\uFB01');
      expect((0, _unicode.reverseIfRtl)(fi)).toEqual('fi');
    });
    it('should reverse RTL characters', function () {
      var heAlef = getGlyphUnicode('\u05D0');
      expect((0, _unicode.reverseIfRtl)(heAlef)).toEqual('\u05D0');
      var arAlef = getGlyphUnicode('\u0675');
      expect((0, _unicode.reverseIfRtl)(arAlef)).toEqual('\u0674\u0627');
    });
  });
});