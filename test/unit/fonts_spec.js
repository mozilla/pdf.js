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

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-test/unit/fonts_spec', ['exports', 'pdfjs/core/fonts'],
           factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('../../src/core/fonts.js'));
  } else {
    factory((root.pdfjsTestUnitFontsSpec = {}), root.pdfjsCoreFonts);
  }
}(this, function (exports, coreFonts) {

var checkProblematicCharRanges = coreFonts.checkProblematicCharRanges;

describe('Fonts', function() {
  it('checkProblematicCharRanges', function() {
    var EXPECTED_PERCENTAGE = 45;
    var result = checkProblematicCharRanges();

    expect(result.percentage).toBeLessThan(EXPECTED_PERCENTAGE);
  });
});
}));
