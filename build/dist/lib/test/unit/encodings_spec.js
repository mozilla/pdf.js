/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2019 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

var _encodings = require("../../core/encodings");

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

describe('encodings', function () {
  describe('getEncoding', function () {
    it('fetches a valid array for known encoding names', function () {
      var knownEncodingNames = ['ExpertEncoding', 'MacExpertEncoding', 'MacRomanEncoding', 'StandardEncoding', 'SymbolSetEncoding', 'WinAnsiEncoding', 'ZapfDingbatsEncoding'];

      for (var _i = 0, _knownEncodingNames = knownEncodingNames; _i < _knownEncodingNames.length; _i++) {
        var knownEncodingName = _knownEncodingNames[_i];
        var encoding = (0, _encodings.getEncoding)(knownEncodingName);
        expect(Array.isArray(encoding)).toEqual(true);
        expect(encoding.length).toEqual(256);
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = encoding[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var item = _step.value;
            expect(_typeof(item)).toEqual('string');
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator["return"] != null) {
              _iterator["return"]();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }
      }
    });
    it('fetches `null` for unknown encoding names', function () {
      expect((0, _encodings.getEncoding)('FooBarEncoding')).toEqual(null);
    });
  });
});