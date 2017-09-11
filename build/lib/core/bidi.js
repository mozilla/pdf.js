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

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.bidi = undefined;

var _util = require('../shared/util');

var baseTypes = ['BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'S', 'B', 'S', 'WS', 'B', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'B', 'B', 'B', 'S', 'WS', 'ON', 'ON', 'ET', 'ET', 'ET', 'ON', 'ON', 'ON', 'ON', 'ON', 'ES', 'CS', 'ES', 'CS', 'CS', 'EN', 'EN', 'EN', 'EN', 'EN', 'EN', 'EN', 'EN', 'EN', 'EN', 'CS', 'ON', 'ON', 'ON', 'ON', 'ON', 'ON', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'ON', 'ON', 'ON', 'ON', 'ON', 'ON', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'ON', 'ON', 'ON', 'ON', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'B', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'CS', 'ON', 'ET', 'ET', 'ET', 'ET', 'ON', 'ON', 'ON', 'ON', 'L', 'ON', 'ON', 'BN', 'ON', 'ON', 'ET', 'ET', 'EN', 'EN', 'ON', 'L', 'ON', 'ON', 'ON', 'EN', 'L', 'ON', 'ON', 'ON', 'ON', 'ON', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'ON', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'ON', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L'];
var arabicTypes = ['AN', 'AN', 'AN', 'AN', 'AN', 'AN', 'ON', 'ON', 'AL', 'ET', 'ET', 'AL', 'CS', 'AL', 'ON', 'ON', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'AL', 'AL', '', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'AN', 'AN', 'AN', 'AN', 'AN', 'AN', 'AN', 'AN', 'AN', 'AN', 'ET', 'AN', 'AN', 'AL', 'AL', 'AL', 'NSM', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'AN', 'ON', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'AL', 'AL', 'NSM', 'NSM', 'ON', 'NSM', 'NSM', 'NSM', 'NSM', 'AL', 'AL', 'EN', 'EN', 'EN', 'EN', 'EN', 'EN', 'EN', 'EN', 'EN', 'EN', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL'];
function isOdd(i) {
  return (i & 1) !== 0;
}
function isEven(i) {
  return (i & 1) === 0;
}
function findUnequal(arr, start, value) {
  for (var j = start, jj = arr.length; j < jj; ++j) {
    if (arr[j] !== value) {
      return j;
    }
  }
  return j;
}
function setValues(arr, start, end, value) {
  for (var j = start; j < end; ++j) {
    arr[j] = value;
  }
}
function reverseValues(arr, start, end) {
  for (var i = start, j = end - 1; i < j; ++i, --j) {
    var temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
}
function createBidiText(str, isLTR, vertical) {
  return {
    str: str,
    dir: vertical ? 'ttb' : isLTR ? 'ltr' : 'rtl'
  };
}
var chars = [];
var types = [];
function bidi(str, startLevel, vertical) {
  var isLTR = true;
  var strLength = str.length;
  if (strLength === 0 || vertical) {
    return createBidiText(str, isLTR, vertical);
  }
  chars.length = strLength;
  types.length = strLength;
  var numBidi = 0;
  var i, ii;
  for (i = 0; i < strLength; ++i) {
    chars[i] = str.charAt(i);
    var charCode = str.charCodeAt(i);
    var charType = 'L';
    if (charCode <= 0x00ff) {
      charType = baseTypes[charCode];
    } else if (0x0590 <= charCode && charCode <= 0x05f4) {
      charType = 'R';
    } else if (0x0600 <= charCode && charCode <= 0x06ff) {
      charType = arabicTypes[charCode & 0xff];
      if (!charType) {
        (0, _util.warn)('Bidi: invalid Unicode character ' + charCode.toString(16));
      }
    } else if (0x0700 <= charCode && charCode <= 0x08AC) {
      charType = 'AL';
    }
    if (charType === 'R' || charType === 'AL' || charType === 'AN') {
      numBidi++;
    }
    types[i] = charType;
  }
  if (numBidi === 0) {
    isLTR = true;
    return createBidiText(str, isLTR);
  }
  if (startLevel === -1) {
    if (numBidi / strLength < 0.3) {
      isLTR = true;
      startLevel = 0;
    } else {
      isLTR = false;
      startLevel = 1;
    }
  }
  var levels = [];
  for (i = 0; i < strLength; ++i) {
    levels[i] = startLevel;
  }
  var e = isOdd(startLevel) ? 'R' : 'L';
  var sor = e;
  var eor = sor;
  var lastType = sor;
  for (i = 0; i < strLength; ++i) {
    if (types[i] === 'NSM') {
      types[i] = lastType;
    } else {
      lastType = types[i];
    }
  }
  lastType = sor;
  var t;
  for (i = 0; i < strLength; ++i) {
    t = types[i];
    if (t === 'EN') {
      types[i] = lastType === 'AL' ? 'AN' : 'EN';
    } else if (t === 'R' || t === 'L' || t === 'AL') {
      lastType = t;
    }
  }
  for (i = 0; i < strLength; ++i) {
    t = types[i];
    if (t === 'AL') {
      types[i] = 'R';
    }
  }
  for (i = 1; i < strLength - 1; ++i) {
    if (types[i] === 'ES' && types[i - 1] === 'EN' && types[i + 1] === 'EN') {
      types[i] = 'EN';
    }
    if (types[i] === 'CS' && (types[i - 1] === 'EN' || types[i - 1] === 'AN') && types[i + 1] === types[i - 1]) {
      types[i] = types[i - 1];
    }
  }
  for (i = 0; i < strLength; ++i) {
    if (types[i] === 'EN') {
      var j;
      for (j = i - 1; j >= 0; --j) {
        if (types[j] !== 'ET') {
          break;
        }
        types[j] = 'EN';
      }
      for (j = i + 1; j < strLength; ++j) {
        if (types[j] !== 'ET') {
          break;
        }
        types[j] = 'EN';
      }
    }
  }
  for (i = 0; i < strLength; ++i) {
    t = types[i];
    if (t === 'WS' || t === 'ES' || t === 'ET' || t === 'CS') {
      types[i] = 'ON';
    }
  }
  lastType = sor;
  for (i = 0; i < strLength; ++i) {
    t = types[i];
    if (t === 'EN') {
      types[i] = lastType === 'L' ? 'L' : 'EN';
    } else if (t === 'R' || t === 'L') {
      lastType = t;
    }
  }
  for (i = 0; i < strLength; ++i) {
    if (types[i] === 'ON') {
      var end = findUnequal(types, i + 1, 'ON');
      var before = sor;
      if (i > 0) {
        before = types[i - 1];
      }
      var after = eor;
      if (end + 1 < strLength) {
        after = types[end + 1];
      }
      if (before !== 'L') {
        before = 'R';
      }
      if (after !== 'L') {
        after = 'R';
      }
      if (before === after) {
        setValues(types, i, end, before);
      }
      i = end - 1;
    }
  }
  for (i = 0; i < strLength; ++i) {
    if (types[i] === 'ON') {
      types[i] = e;
    }
  }
  for (i = 0; i < strLength; ++i) {
    t = types[i];
    if (isEven(levels[i])) {
      if (t === 'R') {
        levels[i] += 1;
      } else if (t === 'AN' || t === 'EN') {
        levels[i] += 2;
      }
    } else {
      if (t === 'L' || t === 'AN' || t === 'EN') {
        levels[i] += 1;
      }
    }
  }
  var highestLevel = -1;
  var lowestOddLevel = 99;
  var level;
  for (i = 0, ii = levels.length; i < ii; ++i) {
    level = levels[i];
    if (highestLevel < level) {
      highestLevel = level;
    }
    if (lowestOddLevel > level && isOdd(level)) {
      lowestOddLevel = level;
    }
  }
  for (level = highestLevel; level >= lowestOddLevel; --level) {
    var start = -1;
    for (i = 0, ii = levels.length; i < ii; ++i) {
      if (levels[i] < level) {
        if (start >= 0) {
          reverseValues(chars, start, i);
          start = -1;
        }
      } else if (start < 0) {
        start = i;
      }
    }
    if (start >= 0) {
      reverseValues(chars, start, levels.length);
    }
  }
  for (i = 0, ii = chars.length; i < ii; ++i) {
    var ch = chars[i];
    if (ch === '<' || ch === '>') {
      chars[i] = '';
    }
  }
  return createBidiText(chars.join(''), isLTR);
}
exports.bidi = bidi;