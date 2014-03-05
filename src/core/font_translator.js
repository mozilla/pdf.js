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
/* globals assert, assertWellFormed, ColorSpace, Dict, Encodings, error,
           ErrorFont, Font, FONT_IDENTITY_MATRIX, fontCharsToUnicode, FontFlags,
           ImageKind, info, isArray, isCmd, isDict, isEOF, isName, isNum,
           isStream, isString, JpegStream, Lexer, Metrics, Name, Parser,
           Pattern, PDFImage, PDFJS, serifFonts, stdFontMap, symbolsFonts,
           getTilingPatternIR, warn, Util, Promise, LegacyPromise,
           RefSetCache, isRef, TextRenderingMode, CMapFactory, OPS,
           UNSUPPORTED_FEATURES, UnsupportedManager */

'use strict';

var FontTranslator = (function FontTranslatorClosure() {
  function FontTranslator(xref, fontCache, evaluator) {
    this.xref = xref;
    this.fontCache = fontCache;
    this.evaluator = evaluator;
  }

  FontTranslator.prototype = {

    getLoadableFont: function FontTranslator_loadFont(fontName, font, xref,
                                                 resources,
                                                 parentOperatorList) {

      function errorFont() {
        return {
          translated: new ErrorFont('Font ' + fontName + ' is not available'),
          loadedName: 'g_font_error'
        };
      }

      var fontRef;
      if (font) { // Loading by ref.
        assert(isRef(font));
        fontRef = font;
      } else { // Loading by name.
        var fontRes = resources.get('Font');
        if (fontRes) {
          fontRef = fontRes.getRaw(fontName);
        } else {
          warn('fontRes not available');
          return errorFont();
        }
      }
      if (this.fontCache.has(fontRef)) {
        return this.fontCache.get(fontRef);
      }

      font = xref.fetchIfRef(fontRef);
      if (!isDict(font)) {
        return errorFont();
      }

      var encoding = font.map.Encoding;
      var encodingID = '';
      if (isName(encoding)) {
        encodingID = encoding.name;
      } else if (isRef(encoding)) {
        encodingID = String(encoding.num) + String(encoding.gen);
      }
      var preEvaluatedFont = this.preEvaluateFont(font, xref);
      var descriptor = preEvaluatedFont.descriptor;
      if (descriptor && descriptor.fonts && descriptor.fonts[encodingID]) {
        return descriptor.fonts[encodingID];
      }

      // Workaround for bad PDF generators that doesn't reference fonts
      // properly, i.e. by not using an object identifier.
      // Check if the fontRef is a Dict (as opposed to a standard object),
      // in which case we don't cache the font and instead reference it by
      // fontName in font.loadedName below.
      var fontRefIsDict = isDict(fontRef);
      if (!fontRefIsDict) {
        this.fontCache.put(fontRef, font);
      }

      // keep track of each font we translated so the caller can
      // load them asynchronously before calling display on a page
      font.loadedName = 'g_font_' + (fontRefIsDict ?
        fontName.replace(/\W/g, '') : (fontRef.num + '_' + fontRef.gen));

      if (!font.translated) {
        var translated;
        try {
          translated = this.translateFont(preEvaluatedFont, xref);
        } catch (e) {
          UnsupportedManager.notify(UNSUPPORTED_FEATURES.font);
          translated = new ErrorFont(e instanceof Error ? e.message : e);
        }
        font.translated = translated;
      }

      if (font.translated.loadCharProcs) {
        var charProcs = font.get('CharProcs').getAll();
        var fontResources = font.get('Resources') || resources;
        var charProcKeys = Object.keys(charProcs);
        var charProcOperatorList = {};
        for (var i = 0, n = charProcKeys.length; i < n; ++i) {
          var key = charProcKeys[i];
          var glyphStream = charProcs[key];
          var operatorList = this.evaluator.getOperatorList(glyphStream,
                                                            fontResources);
          charProcOperatorList[key] = operatorList.getIR();
          if (!parentOperatorList) {
            continue;
          }
          // Add the dependencies to the parent operator list so they are
          // resolved before sub operator list is executed synchronously.
          parentOperatorList.addDependencies(charProcOperatorList.dependencies);
        }
        font.translated.charProcOperatorList = charProcOperatorList;
        font.loaded = true;
      } else {
        font.loaded = true;
      }

      if (descriptor && encodingID) {
        if (!descriptor.fonts) {
          descriptor.fonts = Object.create(null);
        }
        descriptor.fonts[encodingID] = font;
      }

      return font;
    },

    preEvaluateFont: function FontTranslator_preEvaluateFont(dict, xref) {
      var baseDict = dict;
      var type = dict.get('Subtype');
      assertWellFormed(isName(type), 'invalid font Subtype');

      var composite = false;
      if (type.name == 'Type0') {
        // If font is a composite
        //  - get the descendant font
        //  - set the type according to the descendant font
        //  - get the FontDescriptor from the descendant font
        var df = dict.get('DescendantFonts');
        if (!df) {
          error('Descendant fonts are not specified');
        }

        dict = isArray(df) ? xref.fetchIfRef(df[0]) : df;

        type = dict.get('Subtype');
        assertWellFormed(isName(type), 'invalid font Subtype');
        composite = true;
      }

      return {
        descriptor: dict.get('FontDescriptor'),
        dict: dict,
        baseDict: baseDict,
        composite: composite
      };
    },

    translateFont: function FontTranslator_translateFont(preEvaluatedFont,
                                                         xref) {
      var baseDict = preEvaluatedFont.baseDict;
      var dict = preEvaluatedFont.dict;
      var composite = preEvaluatedFont.composite;
      var descriptor = preEvaluatedFont.descriptor;
      var type = dict.get('Subtype');
      var maxCharIndex = composite ? 0xFFFF : 0xFF;

      var descriptor = dict.get('FontDescriptor');
      if (!descriptor) {
        if (type.name == 'Type3') {
          // FontDescriptor is only required for Type3 fonts when the document
          // is a tagged pdf. Create a barbebones one to get by.
          descriptor = new Dict();
          descriptor.set('FontName', Name.get(type.name));
        } else {
          // Before PDF 1.5 if the font was one of the base 14 fonts, having a
          // FontDescriptor was not required.
          // This case is here for compatibility.
          var baseFontName = dict.get('BaseFont');
          if (!isName(baseFontName))
            error('Base font is not specified');

          // Using base font name as a font name.
          baseFontName = baseFontName.name.replace(/[,_]/g, '-');
          var metrics = this.getBaseFontMetrics(baseFontName);

          // Simulating descriptor flags attribute
          var fontNameWoStyle = baseFontName.split('-')[0];
          var flags = (
            this.isSerifFont(fontNameWoStyle) ? FontFlags.Serif : 0) |
            (metrics.monospace ? FontFlags.FixedPitch : 0) |
            (symbolsFonts[fontNameWoStyle] ? FontFlags.Symbolic :
            FontFlags.Nonsymbolic);

          var properties = {
            type: type.name,
            name: baseFontName,
            widths: metrics.widths,
            defaultWidth: metrics.defaultWidth,
            flags: flags,
            firstChar: 0,
            lastChar: maxCharIndex
          };
          this.extractDataStructures(dict, dict, xref, properties);
          properties.widths = this.buildCharCodeToWidth(metrics.widths,
                                                        properties);

          return new Font(baseFontName, null, properties);
        }
      }

      // According to the spec if 'FontDescriptor' is declared, 'FirstChar',
      // 'LastChar' and 'Widths' should exist too, but some PDF encoders seem
      // to ignore this rule when a variant of a standart font is used.
      // TODO Fill the width array depending on which of the base font this is
      // a variant.
      var firstChar = dict.get('FirstChar') || 0;
      var lastChar = dict.get('LastChar') || maxCharIndex;

      var fontName = descriptor.get('FontName');
      var baseFont = dict.get('BaseFont');
      // Some bad pdf's have a string as the font name.
      if (isString(fontName)) {
        fontName = Name.get(fontName);
      }
      if (isString(baseFont)) {
        baseFont = Name.get(baseFont);
      }

      if (type.name !== 'Type3') {
        var fontNameStr = fontName && fontName.name;
        var baseFontStr = baseFont && baseFont.name;
        if (fontNameStr !== baseFontStr) {
          info('The FontDescriptor\'s FontName is "' + fontNameStr +
               '" but should be the same as the Font\'s BaseFont "' +
               baseFontStr + '"');
        }
      }
      fontName = fontName || baseFont;

      assertWellFormed(isName(fontName), 'invalid font name');

      var fontFile = descriptor.get('FontFile', 'FontFile2', 'FontFile3');
      if (fontFile) {
        if (fontFile.dict) {
          var subtype = fontFile.dict.get('Subtype');
          if (subtype) {
            subtype = subtype.name;
          }
          var length1 = fontFile.dict.get('Length1');
          var length2 = fontFile.dict.get('Length2');
        }
      }

      var properties = {
        type: type.name,
        name: fontName.name,
        subtype: subtype,
        file: fontFile,
        length1: length1,
        length2: length2,
        loadedName: baseDict.loadedName,
        composite: composite,
        wideChars: composite,
        fixedPitch: false,
        fontMatrix: dict.get('FontMatrix') || FONT_IDENTITY_MATRIX,
        firstChar: firstChar || 0,
        lastChar: lastChar || maxCharIndex,
        bbox: descriptor.get('FontBBox'),
        ascent: descriptor.get('Ascent'),
        descent: descriptor.get('Descent'),
        xHeight: descriptor.get('XHeight'),
        capHeight: descriptor.get('CapHeight'),
        flags: descriptor.get('Flags'),
        italicAngle: descriptor.get('ItalicAngle'),
        coded: false
      };

      if (composite) {
        var cidEncoding = baseDict.get('Encoding');
        if (isName(cidEncoding)) {
          properties.cidEncoding = cidEncoding.name;
        }
        properties.cMap = CMapFactory.create(cidEncoding, PDFJS.cMapUrl, null);
        properties.vertical = properties.cMap.vertical;
      }
      this.extractDataStructures(dict, baseDict, xref, properties);
      this.extractWidths(dict, xref, descriptor, properties);

      if (type.name === 'Type3') {
        properties.coded = true;
      }

      return new Font(fontName.name, fontFile, properties);
    },

    extractDataStructures: function
      FontTranslator_ExtractDataStructures(dict, baseDict,
                                           xref, properties) {
      // 9.10.2
      var toUnicode = dict.get('ToUnicode') ||
        baseDict.get('ToUnicode');
      if (toUnicode) {
        properties.toUnicode = this.readToUnicode(toUnicode, xref, properties);
      }
      if (properties.composite) {
        // CIDSystemInfo helps to match CID to glyphs
        var cidSystemInfo = dict.get('CIDSystemInfo');
        if (isDict(cidSystemInfo)) {
          properties.cidSystemInfo = {
            registry: cidSystemInfo.get('Registry'),
            ordering: cidSystemInfo.get('Ordering'),
            supplement: cidSystemInfo.get('Supplement')
          };
        }

        var cidToGidMap = dict.get('CIDToGIDMap');
        if (isStream(cidToGidMap)) {
          properties.cidToGidMap = this.readCidToGidMap(cidToGidMap);
        }
      }

      // Based on 9.6.6 of the spec the encoding can come from multiple places
      // and depends on the font type. The base encoding and differences are
      // read here, but the encoding that is actually used is chosen during
      // glyph mapping in the font.
      // TODO: Loading the built in encoding in the font would allow the
      // differences to be merged in here not require us to hold on to it.
      var differences = [];
      var baseEncodingName = null;
      if (dict.has('Encoding')) {
        var encoding = dict.get('Encoding');
        if (isDict(encoding)) {
          baseEncodingName = encoding.get('BaseEncoding');
          baseEncodingName = isName(baseEncodingName) ? baseEncodingName.name :
            null;
          // Load the differences between the base and original
          if (encoding.has('Differences')) {
            var diffEncoding = encoding.get('Differences');
            var index = 0;
            for (var j = 0, jj = diffEncoding.length; j < jj; j++) {
              var data = diffEncoding[j];
              if (isNum(data)) {
                index = data;
              } else {
                differences[index++] = data.name;
              }
            }
          }
        } else if (isName(encoding)) {
          baseEncodingName = encoding.name;
        } else {
          error('Encoding is not a Name nor a Dict');
        }
        // According to table 114 if the encoding is a named encoding it must be
        // one of these predefined encodings.
        if ((baseEncodingName !== 'MacRomanEncoding' &&
             baseEncodingName !== 'MacExpertEncoding' &&
             baseEncodingName !== 'WinAnsiEncoding')) {
          baseEncodingName = null;
        }
      }

      if (baseEncodingName) {
        properties.defaultEncoding = Encodings[baseEncodingName].slice();
      } else {
        var encoding = properties.type === 'TrueType' ?
                Encodings.WinAnsiEncoding :
                Encodings.StandardEncoding;
        // The Symbolic attribute can be misused for regular fonts
        // Heuristic: we have to check if the font is a standard one also
        if (!!(properties.flags & FontFlags.Symbolic)) {
          encoding = !properties.file && /Symbol/i.test(properties.name) ?
            Encodings.SymbolSetEncoding : Encodings.MacRomanEncoding;
        }
        properties.defaultEncoding = encoding;
      }

      properties.differences = differences;
      properties.baseEncodingName = baseEncodingName;
      properties.dict = dict;
    },

    readToUnicode: function FontTranslator_readToUnicode(toUnicode, xref,
                                                         properties) {
      var cmapObj = toUnicode;
      var charToUnicode = [];
      if (isName(cmapObj)) {
        return CMapFactory.create(cmapObj).map;
      } else if (isStream(cmapObj)) {
        var cmap = CMapFactory.create(cmapObj).map;
        // Convert UTF-16BE
        // NOTE: cmap can be a sparse array, so use forEach instead of for(;;)
        //  to iterate over all keys.
        cmap.forEach(function(token, i) {
          var str = [];
          for (var k = 0; k < token.length; k += 2) {
            var w1 = (token.charCodeAt(k) << 8) | token.charCodeAt(k + 1);
            if ((w1 & 0xF800) !== 0xD800) { // w1 < 0xD800 || w1 > 0xDFFF
              str.push(w1);
              continue;
            }
            k += 2;
            var w2 = (token.charCodeAt(k) << 8) | token.charCodeAt(k + 1);
            str.push(((w1 & 0x3ff) << 10) + (w2 & 0x3ff) + 0x10000);
          }
          cmap[i] = String.fromCharCode.apply(String, str);
        });
        return cmap;
      }
      return null;
    },

    readCidToGidMap: function FontTranslator_readCidToGidMap(cidToGidStream) {
      // Extract the encoding from the CIDToGIDMap
      var glyphsData = cidToGidStream.getBytes();

      // Set encoding 0 to later verify the font has an encoding
      var result = [];
      for (var j = 0, jj = glyphsData.length; j < jj; j++) {
        var glyphID = (glyphsData[j++] << 8) | glyphsData[j];
        if (glyphID === 0) {
          continue;
        }

        var code = j >> 1;
        result[code] = glyphID;
      }
      return result;
    },

    extractWidths: function FontTranslator_extractWidths(dict,
                                                         xref,
                                                         descriptor,
                                                         properties) {
      var glyphsWidths = [];
      var defaultWidth = 0;
      var glyphsVMetrics = [];
      var defaultVMetrics;
      if (properties.composite) {
        defaultWidth = dict.get('DW') || 1000;

        var widths = dict.get('W');
        if (widths) {
          for (var i = 0, ii = widths.length; i < ii; i++) {
            var start = widths[i++];
            var code = xref.fetchIfRef(widths[i]);
            if (isArray(code)) {
              for (var j = 0, jj = code.length; j < jj; j++) {
                glyphsWidths[start++] = code[j];
              }
            } else {
              var width = widths[++i];
              for (var j = start; j <= code; j++) {
                glyphsWidths[j] = width;
              }
            }
          }
        }

        if (properties.vertical) {
          var vmetrics = dict.get('DW2') || [880, -1000];
          defaultVMetrics = [vmetrics[1], defaultWidth * 0.5, vmetrics[0]];
          vmetrics = dict.get('W2');
          if (vmetrics) {
            for (var i = 0, ii = vmetrics.length; i < ii; i++) {
              var start = vmetrics[i++];
              var code = xref.fetchIfRef(vmetrics[i]);
              if (isArray(code)) {
                for (var j = 0, jj = code.length; j < jj; j++) {
                  glyphsVMetrics[start++] = [code[j++], code[j++], code[j]];
                }
              } else {
                var vmetric = [vmetrics[++i], vmetrics[++i], vmetrics[++i]];
                for (var j = start; j <= code; j++) {
                  glyphsVMetrics[j] = vmetric;
                }
              }
            }
          }
        }
      } else {
        var firstChar = properties.firstChar;
        var widths = dict.get('Widths');
        if (widths) {
          var j = firstChar;
          for (var i = 0, ii = widths.length; i < ii; i++)
            glyphsWidths[j++] = widths[i];
          defaultWidth = parseFloat(descriptor.get('MissingWidth')) || 0;
        } else {
          // Trying get the BaseFont metrics (see comment above).
          var baseFontName = dict.get('BaseFont');
          if (isName(baseFontName)) {
            var metrics = this.getBaseFontMetrics(baseFontName.name);

            glyphsWidths = this.buildCharCodeToWidth(metrics.widths,
                                                     properties);
            defaultWidth = metrics.defaultWidth;
          }
        }
      }

      // Heuristic: detection of monospace font by checking all non-zero widths
      var isMonospace = true, firstWidth = defaultWidth;
      for (var glyph in glyphsWidths) {
        var glyphWidth = glyphsWidths[glyph];
        if (!glyphWidth) {
          continue;
        }
        if (!firstWidth) {
          firstWidth = glyphWidth;
          continue;
        }
        if (firstWidth != glyphWidth) {
          isMonospace = false;
          break;
        }
      }
      if (isMonospace)
        properties.flags |= FontFlags.FixedPitch;

      properties.defaultWidth = defaultWidth;
      properties.widths = glyphsWidths;
      properties.defaultVMetrics = defaultVMetrics;
      properties.vmetrics = glyphsVMetrics;
    },

    isSerifFont: function FontTranslator_isSerifFont(baseFontName) {
      // Simulating descriptor flags attribute
      var fontNameWoStyle = baseFontName.split('-')[0];
      return (fontNameWoStyle in serifFonts) ||
          (fontNameWoStyle.search(/serif/gi) !== -1);
    },

    getBaseFontMetrics: function FontTranslator_getBaseFontMetrics(name) {
      var defaultWidth = 0, widths = [], monospace = false;

      var lookupName = stdFontMap[name] || name;
      if (!(lookupName in Metrics)) {
        // Use default fonts for looking up font metrics if the passed
        // font is not a base font
        if (this.isSerifFont(name)) {
          lookupName = 'Times-Roman';
        } else {
          lookupName = 'Helvetica';
        }
      }
      var glyphWidths = Metrics[lookupName];

      if (isNum(glyphWidths)) {
        defaultWidth = glyphWidths;
        monospace = true;
      } else {
        widths = glyphWidths;
      }

      return {
        defaultWidth: defaultWidth,
        monospace: monospace,
        widths: widths
      };
    },

    buildCharCodeToWidth:
      function FontTranslator_bulildCharCodeToWidth(widthsByGlyphName,
                                                    properties) {
      var widths = Object.create(null);
      var differences = properties.differences;
      var encoding = properties.defaultEncoding;
      for (var charCode = 0; charCode < 256; charCode++) {
        if (charCode in differences &&
            widthsByGlyphName[differences[charCode]]) {
          widths[charCode] = widthsByGlyphName[differences[charCode]];
          continue;
        }
        if (charCode in encoding && widthsByGlyphName[encoding[charCode]]) {
          widths[charCode] = widthsByGlyphName[encoding[charCode]];
          continue;
        }
      }
      return widths;
    }
  };

  return FontTranslator;
})();
