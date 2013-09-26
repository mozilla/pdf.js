/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2012 Mozilla Foundation
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
/* globals Util, isString, isInt, warn, error, isCmd, isEOF, isName, Lexer,
           isStream */

'use strict';

var CMAP_CODESPACES = {
  'Adobe-CNS1-0': [[], [0, 14335]],
  'Adobe-CNS1-1': [[], [0, 17407]],
  'Adobe-CNS1-2': [[], [0, 17663]],
  'Adobe-CNS1-3': [[], [0, 18943]],
  'Adobe-CNS1-4': [[], [0, 19199]],
  'Adobe-CNS1-5': [[], [0, 19199]],
  'Adobe-CNS1-6': [[], [0, 19199]],
  'Adobe-CNS1-UCS2': [[], [0, 65535]],
  'B5-H': [[0, 128], [41280, 65278]],
  'B5-V': [[0, 128], [41280, 65278]],
  'B5pc-H': [[0, 128, 253, 255], [41280, 64766]],
  'B5pc-V': [[0, 128, 253, 255], [41280, 64766]],
  'CNS-EUC-H': [[0, 128], [41377, 65278], [],
    [2392957345, 2392981246, 2393022881, 2393046782, 2393088417, 2393112318]],
  'CNS-EUC-V': [[0, 128], [41377, 65278], [],
    [2392957345, 2392981246, 2393022881, 2393046782, 2393088417, 2393112318]],
  'CNS1-H': [[], [8481, 32382]],
  'CNS1-V': [[], [8481, 32382]],
  'CNS2-H': [[], [8481, 32382]],
  'CNS2-V': [[], [8481, 32382]],
  'ETen-B5-H': [[0, 128], [41280, 65278]],
  'ETen-B5-V': [[0, 128], [41280, 65278]],
  'ETenms-B5-H': [[0, 128], [41280, 65278]],
  'ETenms-B5-V': [[0, 128], [41280, 65278]],
  'ETHK-B5-H': [[0, 128], [34624, 65278]],
  'ETHK-B5-V': [[0, 128], [34624, 65278]],
  'HKdla-B5-H': [[0, 128], [41280, 65278]],
  'HKdla-B5-V': [[0, 128], [41280, 65278]],
  'HKdlb-B5-H': [[0, 128], [36416, 65278]],
  'HKdlb-B5-V': [[0, 128], [36416, 65278]],
  'HKgccs-B5-H': [[0, 128], [35392, 65278]],
  'HKgccs-B5-V': [[0, 128], [35392, 65278]],
  'HKm314-B5-H': [[0, 128], [41280, 65278]],
  'HKm314-B5-V': [[0, 128], [41280, 65278]],
  'HKm471-B5-H': [[0, 128], [41280, 65278]],
  'HKm471-B5-V': [[0, 128], [41280, 65278]],
  'HKscs-B5-H': [[0, 128], [34624, 65278]],
  'HKscs-B5-V': [[0, 128], [34624, 65278]],
  'UniCNS-UCS2-H': [[], [0, 55295, 57344, 65535]],
  'UniCNS-UCS2-V': [[], [0, 55295, 57344, 65535]],
  'UniCNS-UTF16-H': [[], [0, 55295, 57344, 65535], [],
    [3623934976, 3690979327]],
  'UniCNS-UTF16-V': [[], [0, 55295, 57344, 65535], [],
    [3623934976, 3690979327]],
  'Adobe-GB1-0': [[], [0, 7935]],
  'Adobe-GB1-1': [[], [0, 9983]],
  'Adobe-GB1-2': [[], [0, 22271]],
  'Adobe-GB1-3': [[], [0, 22527]],
  'Adobe-GB1-4': [[], [0, 29183]],
  'Adobe-GB1-5': [[], [0, 30463]],
  'Adobe-GB1-UCS2': [[], [0, 65535]],
  'GB-EUC-H': [[0, 128], [41377, 65278]],
  'GB-EUC-V': [[0, 128], [41377, 65278]],
  'GB-H': [[], [8481, 32382]],
  'GB-V': [[], [8481, 32382]],
  'GBK-EUC-H': [[0, 128], [33088, 65278]],
  'GBK-EUC-V': [[0, 128], [33088, 65278]],
  'GBK2K-H': [[0, 127], [33088, 65278], [], [2167439664, 4265213497]],
  'GBK2K-V': [[0, 127], [33088, 65278], [], [2167439664, 4265213497]],
  'GBKp-EUC-H': [[0, 128], [33088, 65278]],
  'GBKp-EUC-V': [[0, 128], [33088, 65278]],
  'GBpc-EUC-H': [[0, 128, 253, 255], [41377, 64766]],
  'GBpc-EUC-V': [[0, 128, 253, 255], [41377, 64766]],
  'GBT-EUC-H': [[0, 128], [41377, 65278]],
  'GBT-EUC-V': [[0, 128], [41377, 65278]],
  'GBT-H': [[], [8481, 32382]],
  'GBT-V': [[], [8481, 32382]],
  'GBTpc-EUC-H': [[0, 128, 253, 255], [41377, 64766]],
  'GBTpc-EUC-V': [[0, 128, 253, 255], [41377, 64766]],
  'UniGB-UCS2-H': [[], [0, 55295, 57344, 65535]],
  'UniGB-UCS2-V': [[], [0, 55295, 57344, 65535]],
  'UniGB-UTF16-H': [[], [0, 55295, 57344, 65535], [], [3623934976, 3690979327]],
  'UniGB-UTF16-V': [[], [0, 55295, 57344, 65535], [], [3623934976, 3690979327]],
  '78-EUC-H': [[0, 128], [36512, 36575, 41377, 65278]],
  '78-EUC-V': [[0, 128], [36512, 36575, 41377, 65278]],
  '78-H': [[], [8481, 32382]],
  '78-RKSJ-H': [[0, 128, 160, 223], [33088, 40956, 57408, 64764]],
  '78-RKSJ-V': [[0, 128, 160, 223], [33088, 40956, 57408, 64764]],
  '78-V': [[], [8481, 32382]],
  '78ms-RKSJ-H': [[0, 128, 160, 223], [33088, 40956, 57408, 64764]],
  '78ms-RKSJ-V': [[0, 128, 160, 223], [33088, 40956, 57408, 64764]],
  '83pv-RKSJ-H': [[0, 128, 160, 223, 253, 255], [33088, 40956, 57408, 64764]],
  '90ms-RKSJ-H': [[0, 128, 160, 223], [33088, 40956, 57408, 64764]],
  '90ms-RKSJ-V': [[0, 128, 160, 223], [33088, 40956, 57408, 64764]],
  '90msp-RKSJ-H': [[0, 128, 160, 223], [33088, 40956, 57408, 64764]],
  '90msp-RKSJ-V': [[0, 128, 160, 223], [33088, 40956, 57408, 64764]],
  '90pv-RKSJ-H': [[0, 128, 160, 223, 253, 255], [33088, 40956, 57408, 64764]],
  '90pv-RKSJ-V': [[0, 128, 160, 223, 253, 255], [33088, 40956, 57408, 64764]],
  'Add-H': [[], [8481, 32382]],
  'Add-RKSJ-H': [[0, 128, 160, 223], [33088, 40956, 57408, 64764]],
  'Add-RKSJ-V': [[0, 128, 160, 223], [33088, 40956, 57408, 64764]],
  'Add-V': [[], [8481, 32382]],
  'Adobe-Japan1-0': [[], [0, 8447]],
  'Adobe-Japan1-1': [[], [0, 8447]],
  'Adobe-Japan1-2': [[], [0, 8959]],
  'Adobe-Japan1-3': [[], [0, 9471]],
  'Adobe-Japan1-4': [[], [0, 15615]],
  'Adobe-Japan1-5': [[], [0, 20479]],
  'Adobe-Japan1-6': [[], [0, 23295]],
  'Adobe-Japan1-UCS2': [[], [0, 65535]],
  'Adobe-Japan2-0': [[], [0, 6143]],
  'EUC-H': [[0, 128], [36512, 36575, 41377, 65278]],
  'EUC-V': [[0, 128], [36512, 36575, 41377, 65278]],
  'Ext-H': [[], [8481, 32382]],
  'Ext-RKSJ-H': [[0, 128, 160, 223], [33088, 40956, 57408, 64764]],
  'Ext-RKSJ-V': [[0, 128, 160, 223], [33088, 40956, 57408, 64764]],
  'Ext-V': [[], [8481, 32382]],
  'H': [[], [8481, 32382]],
  'Hankaku': [[0, 255], []],
  'Hiragana': [[0, 255], []],
  'Hojo-EUC-H': [[], [], [9413025, 9436926], []],
  'Hojo-EUC-V': [[], [], [9413025, 9436926], []],
  'Hojo-H': [[], [8481, 32382]],
  'Hojo-V': [[], [8481, 32382]],
  'Katakana': [[0, 255], []],
  'NWP-H': [[], [8481, 32382]],
  'NWP-V': [[], [8481, 32382]],
  'RKSJ-H': [[0, 128, 160, 223], [33088, 40956, 57408, 64764]],
  'RKSJ-V': [[0, 128, 160, 223], [33088, 40956, 57408, 64764]],
  'Roman': [[0, 255], []],
  'UniHojo-UCS2-H': [[], [0, 55295, 57344, 65535]],
  'UniHojo-UCS2-V': [[], [0, 55295, 57344, 65535]],
  'UniHojo-UTF16-H': [[], [0, 55295, 57344, 65535], [],
    [3623934976, 3690979327]],
  'UniHojo-UTF16-V': [[], [0, 55295, 57344, 65535], [],
    [3623934976, 3690979327]],
  'UniJIS-UCS2-H': [[], [0, 55295, 57344, 65535]],
  'UniJIS-UCS2-HW-H': [[], [0, 55295, 57344, 65535]],
  'UniJIS-UCS2-HW-V': [[], [0, 55295, 57344, 65535]],
  'UniJIS-UCS2-V': [[], [0, 55295, 57344, 65535]],
  'UniJIS-UTF16-H': [[], [0, 55295, 57344, 65535], [],
    [3623934976, 3690979327]],
  'UniJIS-UTF16-V': [[], [0, 55295, 57344, 65535], [],
    [3623934976, 3690979327]],
  'UniJISPro-UCS2-HW-V': [[], [0, 55295, 57344, 65535]],
  'UniJISPro-UCS2-V': [[], [0, 55295, 57344, 65535]],
  'V': [[], [8481, 32382]],
  'WP-Symbol': [[0, 255], []],
  'Adobe-Korea1-0': [[], [0, 9471]],
  'Adobe-Korea1-1': [[], [0, 18175]],
  'Adobe-Korea1-2': [[], [0, 18431]],
  'Adobe-Korea1-UCS2': [[], [0, 65535]],
  'KSC-EUC-H': [[0, 128], [41377, 65278]],
  'KSC-EUC-V': [[0, 128], [41377, 65278]],
  'KSC-H': [[], [8481, 32382]],
  'KSC-Johab-H': [[0, 128], [33857, 54270, 55345, 57086, 57393, 63998]],
  'KSC-Johab-V': [[0, 128], [33857, 54270, 55345, 57086, 57393, 63998]],
  'KSC-V': [[], [8481, 32382]],
  'KSCms-UHC-H': [[0, 128], [33089, 65278]],
  'KSCms-UHC-HW-H': [[0, 128], [33089, 65278]],
  'KSCms-UHC-HW-V': [[0, 128], [33089, 65278]],
  'KSCms-UHC-V': [[0, 128], [33089, 65278]],
  'KSCpc-EUC-H': [[0, 132, 254, 255], [41281, 65022]],
  'KSCpc-EUC-V': [[0, 132, 254, 255], [41281, 65022]],
  'UniKS-UCS2-H': [[], [0, 55295, 57344, 65535]],
  'UniKS-UCS2-V': [[], [0, 55295, 57344, 65535]],
  'UniKS-UTF16-H': [[], [0, 55295, 57344, 65535], [], [3623934976, 3690979327]],
  'UniKS-UTF16-V': [[], [0, 55295, 57344, 65535], [], [3623934976, 3690979327]]
};

// CMap, not to be confused with TrueType's cmap.
var CMap = (function CMapClosure() {
  function CMap() {
    // Codespace ranges are stored as follows:
    // [[1BytePairs], [2BytePairs], [3BytePairs], [4BytePairs]]
    // where nBytePairs are ranges e.g. [low1, high1, low2, high2, ...]
    this.codespaceRanges = [[], [], [], []];
    this.map = [];
    this.vertical = false;
  }
  CMap.prototype = {
    addCodespaceRange: function(n, low, high) {
      this.codespaceRanges[n - 1].push(low, high);
    },

    mapRange: function(low, high, dstLow) {
      var lastByte = dstLow.length - 1;
      while (low <= high) {
        this.map[low] = dstLow;
        // Only the last byte has to be incremented.
        dstLow = dstLow.substr(0, lastByte) +
                 String.fromCharCode(dstLow.charCodeAt(lastByte) + 1);
        ++low;
      }
    },

    mapRangeToArray: function(low, high, array) {
      var i = 0;
      while (low <= high) {
        this.map[low] = array[i++];
        ++low;
      }
    },

    mapOne: function(src, dst) {
      this.map[src] = dst;
    },

    lookup: function(code) {
      return this.map[code];
    },

    readCharCode: function(str, offset) {
      var c = 0;
      var codespaceRanges = this.codespaceRanges;
      var codespaceRangesLen = this.codespaceRanges.length;
      // 9.7.6.2 CMap Mapping
      // The code length is at most 4.
      for (var n = 0; n < codespaceRangesLen; n++) {
        c = ((c << 8) | str.charCodeAt(offset + n)) >>> 0;
        // Check each codespace range to see if it falls within.
        var codespaceRange = codespaceRanges[n];
        for (var k = 0, kk = codespaceRange.length; k < kk;) {
          var low = codespaceRange[k++];
          var high = codespaceRange[k++];
          if (c >= low && c <= high) {
            return [c, n + 1];
          }
        }
      }

      return [0, 1];
    }

  };
  return CMap;
})();

var IdentityCMap = (function IdentityCMapClosure() {
  function IdentityCMap(vertical, n) {
    CMap.call(this);
    this.vertical = vertical;
    this.addCodespaceRange(n, 0, 0xffff);
    this.mapRange(0, 0xffff, '\u0000');
  }
  Util.inherit(IdentityCMap, CMap, {});

  return IdentityCMap;
})();

var CMapFactory = (function CMapFactoryClosure() {
  function strToInt(str) {
    var a = 0;
    for (var i = 0; i < str.length; i++) {
      a = (a << 8) | str.charCodeAt(i);
    }
    return a >>> 0;
  }

  function expectString(obj) {
    if (!isString(obj)) {
      error('Malformed CMap: expected string.');
    }
  }

  function expectInt(obj) {
    if (!isInt(obj)) {
      error('Malformed CMap: expected int.');
    }
  }

  function parseBfChar(cMap, lexer) {
    while (true) {
      var obj = lexer.getObj();
      if (isEOF(obj)) {
        break;
      }
      if (isCmd(obj, 'endbfchar')) {
        return;
      }
      expectString(obj);
      var src = strToInt(obj);
      obj = lexer.getObj();
      // TODO are /dstName used?
      expectString(obj);
      var dst = obj;
      cMap.mapOne(src, dst);
    }
  }

  function parseBfRange(cMap, lexer) {
    while (true) {
      var obj = lexer.getObj();
      if (isEOF(obj)) {
        break;
      }
      if (isCmd(obj, 'endbfrange')) {
        return;
      }
      expectString(obj);
      var low = strToInt(obj);
      obj = lexer.getObj();
      expectString(obj);
      var high = strToInt(obj);
      obj = lexer.getObj();
      if (isInt(obj) || isString(obj)) {
        var dstLow = isInt(obj) ? String.fromCharCode(obj) : obj;
        cMap.mapRange(low, high, dstLow);
      } else if (isCmd(obj, '[')) {
        obj = lexer.getObj();
        var array = [];
        while (!isCmd(obj, ']') && !isEOF(obj)) {
          array.push(obj);
          obj = lexer.getObj();
        }
        cMap.mapRangeToArray(low, high, array);
      } else {
        break;
      }
    }
    error('Invalid bf range.');
  }

  function parseCidChar(cMap, lexer) {
    while (true) {
      var obj = lexer.getObj();
      if (isEOF(obj)) {
        break;
      }
      if (isCmd(obj, 'endcidchar')) {
        return;
      }
      expectString(obj);
      var src = strToInt(obj);
      obj = lexer.getObj();
      expectInt(obj);
      var dst = String.fromCharCode(obj);
      cMap.mapOne(src, dst);
    }
  }

  function parseCidRange(cMap, lexer) {
    while (true) {
      var obj = lexer.getObj();
      if (isEOF(obj)) {
        break;
      }
      if (isCmd(obj, 'endcidrange')) {
        return;
      }
      expectString(obj);
      var low = strToInt(obj);
      obj = lexer.getObj();
      expectString(obj);
      var high = strToInt(obj);
      obj = lexer.getObj();
      expectInt(obj);
      var dstLow = String.fromCharCode(obj);
      cMap.mapRange(low, high, dstLow);
    }
  }

  function parseCodespaceRange(cMap, lexer) {
    while (true) {
      var obj = lexer.getObj();
      if (isEOF(obj)) {
        break;
      }
      if (isCmd(obj, 'endcodespacerange')) {
        return;
      }
      if (!isString(obj)) {
        break;
      }
      var low = strToInt(obj);
      obj = lexer.getObj();
      if (!isString(obj)) {
        break;
      }
      var high = strToInt(obj);
      cMap.addCodespaceRange(obj.length, low, high);
    }
    error('Invalid codespace range.');
  }

  function parseCmap(cMap, lexer) {
    objLoop: while (true) {
      var obj = lexer.getObj();
      if (isEOF(obj)) {
        break;
      } else if (isCmd(obj)) {
        switch (obj.cmd) {
          case 'endcMap':
            break objLoop;
          case 'usecMap':
            // TODO
            break;
          case 'begincodespacerange':
            parseCodespaceRange(cMap, lexer);
            break;
          case 'beginbfchar':
            parseBfChar(cMap, lexer);
            break;
          case 'begincidchar':
            parseCidChar(cMap, lexer);
            break;
          case 'beginbfrange':
            parseBfRange(cMap, lexer);
            break;
          case 'begincidrange':
            parseCidRange(cMap, lexer);
            break;
        }
      }
    }
  }
  return {
    create: function (encoding) {
      if (isName(encoding)) {
        switch (encoding.name) {
          case 'Identity-H':
            return new IdentityCMap(false, 2);
          case 'Identity-V':
            return new IdentityCMap(true, 2);
          default:
            if (encoding.name in CMAP_CODESPACES) {
              // XXX: Temporary hack so the correct amount of bytes are read in
              // CMap.readCharCode.
              var cMap = new CMap();
              cMap.codespaceRanges = CMAP_CODESPACES[encoding.name];
              return cMap;
            }
            return null;
        }
      } else if (isStream(encoding)) {
        var cMap = new CMap();
        var lexer = new Lexer(encoding);
        try {
          parseCmap(cMap, lexer);
        } catch (e) {
          warn('Invalid CMap data. ' + e);
        }
        return cMap;
      }
      error('Encoding required.');
    }
  };
})();
