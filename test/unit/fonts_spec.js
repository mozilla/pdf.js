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
    define('pdfjs-test/unit/fonts_spec', ['exports', 'pdfjs/core/fonts',
      'pdfjs/shared/util'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('../../src/core/fonts.js'),
      require('../../src/shared/util.js'));
  } else {
    factory((root.pdfjsTestUnitFontsSpec = {}), root.pdfjsCoreFonts,
      root.pdfjsSharedUtil);
  }
}(this, function (exports, coreFonts, sharedUtil) {

var ProblematicCharRanges = coreFonts.ProblematicCharRanges;
var PRIVATE_USE_OFFSET_START = coreFonts.PRIVATE_USE_OFFSET_START;
var PRIVATE_USE_OFFSET_END = coreFonts.PRIVATE_USE_OFFSET_END;
var isInt = sharedUtil.isInt;

/**
 * Used to validate the entries in `ProblematicCharRanges`, and to ensure that
 * its total number of characters does not exceed the PUA (Private Use Area)
 * length.
 * @returns {Object} An object with {number} `numChars`, {number} `puaLength`,
 *   and {number} `percentage` parameters.
 */
var checkProblematicCharRanges = function checkProblematicCharRanges() {
  function printRange(limits) {
    return '[' + limits.lower.toString('16').toUpperCase() + ', ' +
                  limits.upper.toString('16').toUpperCase() + ')';
  }

  var numRanges = ProblematicCharRanges.length;
  if (numRanges % 2 !== 0) {
    throw new Error('Char ranges must contain an even number of elements.');
  }
  var prevLimits, numChars = 0;
  for (var i = 0; i < numRanges; i += 2) {
    var limits = {
      lower: ProblematicCharRanges[i],
      upper: ProblematicCharRanges[i + 1],
    };
    if (!isInt(limits.lower) || !isInt(limits.upper)) {
      throw new Error('Range endpoints must be integers: ' +
                      printRange(limits));
    }
    if (limits.lower < 0 || limits.upper < 0) {
      throw new Error('Range endpoints must be non-negative: ' +
                      printRange(limits));
    }
    var range = limits.upper - limits.lower;
    if (range < 1) {
      throw new Error('Range must contain at least one element: ' +
                      printRange(limits));
    }
    if (prevLimits) {
      if (limits.lower < prevLimits.lower) {
        throw new Error('Ranges must be sorted in ascending order: ' +
                        printRange(limits) + ', ' + printRange(prevLimits));
      }
      if (limits.lower < prevLimits.upper) {
        throw new Error('Ranges must not overlap: ' +
                        printRange(limits) + ', ' + printRange(prevLimits));
      }
    }
    prevLimits = {
      lower: limits.lower,
      upper: limits.upper,
    };
    // The current range is OK.
    numChars += range;
  }
  var puaLength = (PRIVATE_USE_OFFSET_END + 1) - PRIVATE_USE_OFFSET_START;
  if (numChars > puaLength) {
    throw new Error('Total number of chars must not exceed the PUA length.');
  }
  return {
    numChars: numChars,
    puaLength: puaLength,
    percentage: 100 * (numChars / puaLength),
  };
};

describe('Fonts', function() {
  it('checkProblematicCharRanges', function() {
    var EXPECTED_PERCENTAGE = 45;
    var result = checkProblematicCharRanges();

    expect(result.percentage).toBeLessThan(EXPECTED_PERCENTAGE);
  });
});
}));
