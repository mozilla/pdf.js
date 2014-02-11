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
           isStream, StringStream */

'use strict';

var BUILT_IN_CMAPS = [
// << Start unicode maps.
'Adobe-GB1-UCS2',
'Adobe-CNS1-UCS2',
'Adobe-Japan1-UCS2',
'Adobe-Korea1-UCS2',
// >> End unicode maps.
'78-EUC-H',
'78-EUC-V',
'78-H',
'78-RKSJ-H',
'78-RKSJ-V',
'78-V',
'78ms-RKSJ-H',
'78ms-RKSJ-V',
'83pv-RKSJ-H',
'90ms-RKSJ-H',
'90ms-RKSJ-V',
'90msp-RKSJ-H',
'90msp-RKSJ-V',
'90pv-RKSJ-H',
'90pv-RKSJ-V',
'Add-H',
'Add-RKSJ-H',
'Add-RKSJ-V',
'Add-V',
'Adobe-CNS1-0',
'Adobe-CNS1-1',
'Adobe-CNS1-2',
'Adobe-CNS1-3',
'Adobe-CNS1-4',
'Adobe-CNS1-5',
'Adobe-CNS1-6',
'Adobe-GB1-0',
'Adobe-GB1-1',
'Adobe-GB1-2',
'Adobe-GB1-3',
'Adobe-GB1-4',
'Adobe-GB1-5',
'Adobe-Japan1-0',
'Adobe-Japan1-1',
'Adobe-Japan1-2',
'Adobe-Japan1-3',
'Adobe-Japan1-4',
'Adobe-Japan1-5',
'Adobe-Japan1-6',
'Adobe-Korea1-0',
'Adobe-Korea1-1',
'Adobe-Korea1-2',
'B5-H',
'B5-V',
'B5pc-H',
'B5pc-V',
'CNS-EUC-H',
'CNS-EUC-V',
'CNS1-H',
'CNS1-V',
'CNS2-H',
'CNS2-V',
'ETHK-B5-H',
'ETHK-B5-V',
'ETen-B5-H',
'ETen-B5-V',
'ETenms-B5-H',
'ETenms-B5-V',
'EUC-H',
'EUC-V',
'Ext-H',
'Ext-RKSJ-H',
'Ext-RKSJ-V',
'Ext-V',
'GB-EUC-H',
'GB-EUC-V',
'GB-H',
'GB-V',
'GBK-EUC-H',
'GBK-EUC-V',
'GBK2K-H',
'GBK2K-V',
'GBKp-EUC-H',
'GBKp-EUC-V',
'GBT-EUC-H',
'GBT-EUC-V',
'GBT-H',
'GBT-V',
'GBTpc-EUC-H',
'GBTpc-EUC-V',
'GBpc-EUC-H',
'GBpc-EUC-V',
'H',
'HKdla-B5-H',
'HKdla-B5-V',
'HKdlb-B5-H',
'HKdlb-B5-V',
'HKgccs-B5-H',
'HKgccs-B5-V',
'HKm314-B5-H',
'HKm314-B5-V',
'HKm471-B5-H',
'HKm471-B5-V',
'HKscs-B5-H',
'HKscs-B5-V',
'Hankaku',
'Hiragana',
'KSC-EUC-H',
'KSC-EUC-V',
'KSC-H',
'KSC-Johab-H',
'KSC-Johab-V',
'KSC-V',
'KSCms-UHC-H',
'KSCms-UHC-HW-H',
'KSCms-UHC-HW-V',
'KSCms-UHC-V',
'KSCpc-EUC-H',
'KSCpc-EUC-V',
'Katakana',
'NWP-H',
'NWP-V',
'RKSJ-H',
'RKSJ-V',
'Roman',
'UniCNS-UCS2-H',
'UniCNS-UCS2-V',
'UniCNS-UTF16-H',
'UniCNS-UTF16-V',
'UniCNS-UTF32-H',
'UniCNS-UTF32-V',
'UniCNS-UTF8-H',
'UniCNS-UTF8-V',
'UniGB-UCS2-H',
'UniGB-UCS2-V',
'UniGB-UTF16-H',
'UniGB-UTF16-V',
'UniGB-UTF32-H',
'UniGB-UTF32-V',
'UniGB-UTF8-H',
'UniGB-UTF8-V',
'UniJIS-UCS2-H',
'UniJIS-UCS2-HW-H',
'UniJIS-UCS2-HW-V',
'UniJIS-UCS2-V',
'UniJIS-UTF16-H',
'UniJIS-UTF16-V',
'UniJIS-UTF32-H',
'UniJIS-UTF32-V',
'UniJIS-UTF8-H',
'UniJIS-UTF8-V',
'UniJIS2004-UTF16-H',
'UniJIS2004-UTF16-V',
'UniJIS2004-UTF32-H',
'UniJIS2004-UTF32-V',
'UniJIS2004-UTF8-H',
'UniJIS2004-UTF8-V',
'UniJISPro-UCS2-HW-V',
'UniJISPro-UCS2-V',
'UniJISPro-UTF8-V',
'UniJISX0213-UTF32-H',
'UniJISX0213-UTF32-V',
'UniJISX02132004-UTF32-H',
'UniJISX02132004-UTF32-V',
'UniKS-UCS2-H',
'UniKS-UCS2-V',
'UniKS-UTF16-H',
'UniKS-UTF16-V',
'UniKS-UTF32-H',
'UniKS-UTF32-V',
'UniKS-UTF8-H',
'UniKS-UTF8-V',
'V',
'WP-Symbol'];

// CMap, not to be confused with TrueType's cmap.
var CMap = (function CMapClosure() {
  function CMap(builtInCMap) {
    // Codespace ranges are stored as follows:
    // [[1BytePairs], [2BytePairs], [3BytePairs], [4BytePairs]]
    // where nBytePairs are ranges e.g. [low1, high1, low2, high2, ...]
    this.codespaceRanges = [[], [], [], []];
    this.numCodespaceRanges = 0;
    this.map = [];
    this.vertical = false;
    this.useCMap = null;
    this.builtInCMap = builtInCMap;
  }
  CMap.prototype = {
    addCodespaceRange: function(n, low, high) {
      this.codespaceRanges[n - 1].push(low, high);
      this.numCodespaceRanges++;
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

  function parseWMode(cMap, lexer) {
    var obj = lexer.getObj();
    if (isInt(obj)) {
      cMap.vertical = !!obj;
    }
  }

  function parseCMap(cMap, lexer, builtInCMapUrl, useCMap) {
    var previous;
    var embededUseCMap;
    objLoop: while (true) {
      var obj = lexer.getObj();
      if (isEOF(obj)) {
        break;
      } else if (isName(obj)) {
        if (obj.name === 'WMode') {
          parseWMode(cMap, lexer);
        }
        previous = obj;
      } else if (isCmd(obj)) {
        switch (obj.cmd) {
          case 'endcmap':
            break objLoop;
          case 'usecmap':
            if (isName(previous)) {
              embededUseCMap = previous.name;
            }
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

    if (!useCMap && embededUseCMap) {
      // Load the usecmap definition from the file only if there wasn't one
      // specified.
      useCMap = embededUseCMap;
    }
    if (useCMap) {
      cMap.useCMap = createBuiltInCMap(useCMap, builtInCMapUrl);
      // If there aren't any code space ranges defined clone all the parent ones
      // into this cMap.
      if (cMap.numCodespaceRanges === 0) {
        var useCodespaceRanges = cMap.useCMap.codespaceRanges;
        for (var i = 0; i < useCodespaceRanges.length; i++) {
          cMap.codespaceRanges[i] = useCodespaceRanges[i].slice();
        }
        cMap.numCodespaceRanges = cMap.useCMap.numCodespaceRanges;
      }
      // Merge the map into the current one, making sure not to override
      // any previously defined entries.
      for (var key in cMap.useCMap.map) {
        if (key in cMap.map) {
          continue;
        }
        cMap.map[key] = cMap.useCMap.map[key];
      }
    }
  }

  function createBuiltInCMap(name, builtInCMapUrl) {
    if (name === 'Identity-H') {
      return new IdentityCMap(false, 2);
    } else if (name === 'Identity-V') {
      return new IdentityCMap(true, 2);
    }
    if (BUILT_IN_CMAPS.indexOf(name) === -1) {
      error('Unknown cMap name: ' + name);
    }

    var request = new XMLHttpRequest();
    var url = builtInCMapUrl + name;
    request.open('GET', url, false);
    request.send(null);
    if (request.status === 0 && /^https?:/i.test(url)) {
      error('Unable to get cMap at: ' + url);
    }
    var cMap = new CMap(true);
    var lexer = new Lexer(new StringStream(request.responseText));
    parseCMap(cMap, lexer, builtInCMapUrl, null);
    return cMap;
  }

  return {
    create: function (encoding, builtInCMapUrl, useCMap) {
      if (isName(encoding)) {
        return createBuiltInCMap(encoding.name, builtInCMapUrl);
      } else if (isStream(encoding)) {
        var cMap = new CMap();
        var lexer = new Lexer(encoding);
        try {
          parseCMap(cMap, lexer, builtInCMapUrl, useCMap);
        } catch (e) {
          warn('Invalid CMap data. ' + e);
        }
        return cMap;
      }
      error('Encoding required.');
    }
  };
})();
