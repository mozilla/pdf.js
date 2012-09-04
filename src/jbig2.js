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

'use strict';

var Jbig2Image = (function Jbig2ImageClosure() {

  // Annex E. Arithmetic Coding
  var ArithmeticDecoder = (function ArithmeticDecoderClosure() {
    var QeTable = [
      {qe: 0x5601, nmps: 1, nlps: 1, switchFlag: 1},
      {qe: 0x3401, nmps: 2, nlps: 6, switchFlag: 0},
      {qe: 0x1801, nmps: 3, nlps: 9, switchFlag: 0},
      {qe: 0x0AC1, nmps: 4, nlps: 12, switchFlag: 0},
      {qe: 0x0521, nmps: 5, nlps: 29, switchFlag: 0},
      {qe: 0x0221, nmps: 38, nlps: 33, switchFlag: 0},
      {qe: 0x5601, nmps: 7, nlps: 6, switchFlag: 1},
      {qe: 0x5401, nmps: 8, nlps: 14, switchFlag: 0},
      {qe: 0x4801, nmps: 9, nlps: 14, switchFlag: 0},
      {qe: 0x3801, nmps: 10, nlps: 14, switchFlag: 0},
      {qe: 0x3001, nmps: 11, nlps: 17, switchFlag: 0},
      {qe: 0x2401, nmps: 12, nlps: 18, switchFlag: 0},
      {qe: 0x1C01, nmps: 13, nlps: 20, switchFlag: 0},
      {qe: 0x1601, nmps: 29, nlps: 21, switchFlag: 0},
      {qe: 0x5601, nmps: 15, nlps: 14, switchFlag: 1},
      {qe: 0x5401, nmps: 16, nlps: 14, switchFlag: 0},
      {qe: 0x5101, nmps: 17, nlps: 15, switchFlag: 0},
      {qe: 0x4801, nmps: 18, nlps: 16, switchFlag: 0},
      {qe: 0x3801, nmps: 19, nlps: 17, switchFlag: 0},
      {qe: 0x3401, nmps: 20, nlps: 18, switchFlag: 0},
      {qe: 0x3001, nmps: 21, nlps: 19, switchFlag: 0},
      {qe: 0x2801, nmps: 22, nlps: 19, switchFlag: 0},
      {qe: 0x2401, nmps: 23, nlps: 20, switchFlag: 0},
      {qe: 0x2201, nmps: 24, nlps: 21, switchFlag: 0},
      {qe: 0x1C01, nmps: 25, nlps: 22, switchFlag: 0},
      {qe: 0x1801, nmps: 26, nlps: 23, switchFlag: 0},
      {qe: 0x1601, nmps: 27, nlps: 24, switchFlag: 0},
      {qe: 0x1401, nmps: 28, nlps: 25, switchFlag: 0},
      {qe: 0x1201, nmps: 29, nlps: 26, switchFlag: 0},
      {qe: 0x1101, nmps: 30, nlps: 27, switchFlag: 0},
      {qe: 0x0AC1, nmps: 31, nlps: 28, switchFlag: 0},
      {qe: 0x09C1, nmps: 32, nlps: 29, switchFlag: 0},
      {qe: 0x08A1, nmps: 33, nlps: 30, switchFlag: 0},
      {qe: 0x0521, nmps: 34, nlps: 31, switchFlag: 0},
      {qe: 0x0441, nmps: 35, nlps: 32, switchFlag: 0},
      {qe: 0x02A1, nmps: 36, nlps: 33, switchFlag: 0},
      {qe: 0x0221, nmps: 37, nlps: 34, switchFlag: 0},
      {qe: 0x0141, nmps: 38, nlps: 35, switchFlag: 0},
      {qe: 0x0111, nmps: 39, nlps: 36, switchFlag: 0},
      {qe: 0x0085, nmps: 40, nlps: 37, switchFlag: 0},
      {qe: 0x0049, nmps: 41, nlps: 38, switchFlag: 0},
      {qe: 0x0025, nmps: 42, nlps: 39, switchFlag: 0},
      {qe: 0x0015, nmps: 43, nlps: 40, switchFlag: 0},
      {qe: 0x0009, nmps: 44, nlps: 41, switchFlag: 0},
      {qe: 0x0005, nmps: 45, nlps: 42, switchFlag: 0},
      {qe: 0x0001, nmps: 45, nlps: 43, switchFlag: 0},
      {qe: 0x5601, nmps: 46, nlps: 46, switchFlag: 0}
    ];

    function ArithmeticDecoder(data, start, end) {
      this.data = data;
      this.bp = start;
      this.dataEnd = end;

      this.chigh = data[start];
      this.clow = 0;

      this.byteIn();

      this.chigh = ((this.chigh << 7) & 0xFFFF) | ((this.clow >> 9) & 0x7F);
      this.clow = (this.clow << 7) & 0xFFFF;
      this.ct -= 7;
      this.a = 0x8000;
    }

    ArithmeticDecoder.prototype = {
      byteIn: function ArithmeticDecoder_byteIn() {
        var data = this.data;
        var bp = this.bp;
        if (data[bp] == 0xFF) {
          var b1 = data[bp + 1];
          if (b1 > 0x8F) {
            this.clow += 0xFF00;
            this.ct = 8;
          } else {
            bp++;
            this.clow += (data[bp] << 9);
            this.ct = 7;
            this.bp = bp;
          }
        } else {
          bp++;
          this.clow += bp < this.dataEnd ? (data[bp] << 8) : 0xFF00;
          this.ct = 8;
          this.bp = bp;
        }
        if (this.clow > 0xFFFF) {
          this.chigh += (this.clow >> 16);
          this.clow &= 0xFFFF;
        }
      },
      readBit: function ArithmeticDecoder_readBit(cx) {
        var qeIcx = QeTable[cx.index].qe;
        this.a -= qeIcx;

        if (this.chigh < qeIcx) {
          var d = this.exchangeLps(cx);
          this.renormD();
          return d;
        } else {
          this.chigh -= qeIcx;
          if ((this.a & 0x8000) == 0) {
            var d = this.exchangeMps(cx);
            this.renormD();
            return d;
          } else {
            return cx.mps;
          }
        }
      },
      renormD: function ArithmeticDecoder_renormD() {
        do {
          if (this.ct == 0)
            this.byteIn();

          this.a <<= 1;
          this.chigh = ((this.chigh << 1) & 0xFFFF) | ((this.clow >> 15) & 1);
          this.clow = (this.clow << 1) & 0xFFFF;
          this.ct--;
        } while ((this.a & 0x8000) == 0);
      },
      exchangeMps: function ArithmeticDecoder_exchangeMps(cx) {
        var d;
        var qeTableIcx = QeTable[cx.index];
        if (this.a < qeTableIcx.qe) {
          d = 1 - cx.mps;

          if (qeTableIcx.switchFlag == 1) {
            cx.mps = 1 - cx.mps;
          }
          cx.index = qeTableIcx.nlps;
        } else {
          d = cx.mps;
          cx.index = qeTableIcx.nmps;
        }
        return d;
      },
      exchangeLps: function ArithmeticDecoder_exchangeLps(cx) {
        var d;
        var qeTableIcx = QeTable[cx.index];
        if (this.a < qeTableIcx.qe) {
          this.a = qeTableIcx.qe;
          d = cx.mps;
          cx.index = qeTableIcx.nmps;
        } else {
          this.a = qeTableIcx.qe;
          d = 1 - cx.mps;

          if (qeTableIcx.switchFlag == 1) {
            cx.mps = 1 - cx.mps;
          }
          cx.index = qeTableIcx.nlps;
        }
        return d;
      }
    };

    return ArithmeticDecoder;
  })();

  // Utility data structures
  function ContextCache() {}

  ContextCache.prototype = {
    getContexts: function(id) {
      if (id in this)
        return this[id];
      return (this[id] = []);
    }
  };

  function DecodingContext(data, start, end) {
    this.data = data;
    this.start = start;
    this.end = end;
  }

  DecodingContext.prototype = {
    get decoder() {
      var decoder = new ArithmeticDecoder(this.data, this.start, this.end);
      return shadow(this, 'decoder', decoder);
    },
    get contextCache() {
      var cache = new ContextCache();
      return shadow(this, 'contextCache', cache);
    }
  };

  // Annex A. Arithmetic Integer Decoding Procedure
  // A.2 Procedure for decoding values
  function decodeInteger(contextCache, procedure, decoder) {
    var contexts = contextCache.getContexts(procedure);

    var prev = 1;
    var state = 1, v = 0, s;
    var toRead = 32, offset = 4436; // defaults for state 7
    while (state) {
      var cx = contexts[prev];
      if (!cx)
        contexts[prev] = cx = {index: 0, mps: 0};
      var bit = decoder.readBit(cx);
      prev = prev < 256 ? (prev << 1) | bit :
        (((prev << 1) | bit) & 511) | 256;
      switch (state) {
        case 1:
          s = !!bit;
          break;
        case 2:
          if (bit) break;
          state = 7;
          toRead = 2;
          offset = 0;
          break;
        case 3:
          if (bit) break;
          state = 7;
          toRead = 4;
          offset = 4;
          break;
        case 4:
          if (bit) break;
          state = 7;
          toRead = 6;
          offset = 20;
          break;
        case 5:
          if (bit) break;
          state = 7;
          toRead = 8;
          offset = 84;
          break;
        case 6:
          if (bit) break;
          state = 7;
          toRead = 12;
          offset = 340;
          break;
        default:
          v = v * 2 + bit;
          if (--toRead == 0)
            state = 0;
          continue;
      }
      state++;
    }
    v += offset;
    return !s ? v : v > 0 ? -v : null;
  }

  // A.3 The IAID decoding procedure
  function decodeIAID(contextCache, decoder, codeLength) {
    var contexts = contextCache.getContexts('IAID');

    var prev = 1;
    for (var i = 0; i < codeLength; i++) {
      var cx = contexts[prev];
      if (!cx)
        contexts[prev] = cx = {index: 0, mps: 0};
      var bit = decoder.readBit(cx);
      prev = (prev * 2) + bit;
    }
    if (codeLength < 31)
      return prev & ((1 << codeLength) - 1);
    else
      return prev - Math.pow(2, codeLength);
  }

  // 7.3 Segment types
  var SegmentTypes = [
    'SymbolDictionary', null, null, null, 'IntermediateTextRegion', null,
    'ImmediateTextRegion', 'ImmediateLosslessTextRegion', null, null, null,
    null, null, null, null, null, 'patternDictionary', null, null, null,
    'IntermediateHalftoneRegion', null, 'ImmediateHalftoneRegion',
    'ImmediateLosslessHalftoneRegion', null, null, null, null, null, null, null,
    null, null, null, null, null, 'IntermediateGenericRegion', null,
    'ImmediateGenericRegion', 'ImmediateLosslessGenericRegion',
    'IntermediateGenericRefinementRegion', null,
    'ImmediateGenericRefinementRegion',
    'ImmediateLosslessGenericRefinementRegion', null, null, null, null,
    'PageInformation', 'EndOfPage', 'EndOfStripe', 'EndOfFile', 'Profiles',
    'Tables', null, null, null, null, null, null, null, null,
    'Extension'
  ];

  var CodingTemplates = [
    [{x: -1, y: -2}, {x: 0, y: -2}, {x: 1, y: -2}, {x: -2, y: -1},
     {x: -1, y: -1}, {x: 0, y: -1}, {x: 1, y: -1}, {x: 2, y: -1},
     {x: -4, y: 0}, {x: -3, y: 0}, {x: -2, y: 0}, {x: -1, y: 0}],
    [{x: -1, y: -2}, {x: 0, y: -2}, {x: 1, y: -2}, {x: -2, y: -1},
     {x: -1, y: -1}, {x: 0, y: -1}, {x: 1, y: -1}, {x: 2, y: -1},
     {x: -3, y: 0}, {x: -2, y: 0}, {x: -1, y: 0}],
    [{x: -1, y: -2}, {x: 0, y: -2}, {x: 1, y: -2}, {x: -2, y: -1},
     {x: -1, y: -1}, {x: 0, y: -1}, {x: 1, y: -1}, {x: -2, y: 0},
     {x: -1, y: 0}],
    [{x: -3, y: -1}, {x: -2, y: -1}, {x: -1, y: -1}, {x: 0, y: -1},
     {x: 1, y: -1}, {x: -4, y: 0}, {x: -3, y: 0}, {x: -2, y: 0}, {x: -1, y: 0}]
  ];

  var RefinementTemplates = [
    {
      coding: [{x: 0, y: -1}, {x: 1, y: -1}, {x: -1, y: 0}],
      reference: [{x: 0, y: -1}, {x: 1, y: -1}, {x: -1, y: 0}, {x: 0, y: 0},
                  {x: 1, y: 0}, {x: -1, y: 1}, {x: 0, y: 1}, {x: 1, y: 1}]
    },
    {
      coding: [{x: -1, y: -1}, {x: 0, y: -1}, {x: 1, y: -1}, {x: -1, y: 0}],
      reference: [{x: 0, y: -1}, {x: -1, y: 0}, {x: 0, y: 0}, {x: 1, y: 0},
                  {x: 0, y: 1}, {x: 1, y: 1}]
    }
  ];

  var ReusedContexts = [
    0x1CD3, // '00111001101' (template) + '0011' (at),
    0x079A, // '001111001101' + '0',
    0x00E3, // '001110001' + '1',
    0x018B  // '011000101' + '1'
  ];

  var RefinementReusedContexts = [
    0x0020, // '000' + '0' (coding) + '00010000' + '0' (reference)
    0x0008  // '0000' + '001000'
  ];

  function log2(x) {
    var n = 1, i = 0;
    while (x > n) {
      n <<= 1;
      i++;
    }
    return i;
  }

  function readInt32(data, start) {
    return (data[start] << 24) | (data[start + 1] << 16) |
           (data[start + 2] << 8) | data[start + 3];
  }

  function readUint32(data, start) {
    var value = readInt32(data, start);
    return value & 0x80000000 ? (value + 4294967296) : value;
  }

  function readUint16(data, start) {
    return (data[start] << 8) | data[start + 1];
  }

  function readInt8(data, start) {
    return (data[start] << 24) >> 24;
  }

  // 6.2 Generic Region Decoding Procedure
  function decodeBitmap(mmr, width, height, templateIndex, prediction, skip, at,
                        decodingContext) {
    if (mmr)
      error('JBIG2 error: MMR encoding is not supported');

    var useskip = !!skip;
    var template = CodingTemplates[templateIndex].concat(at);
    var templateLength = template.length;
    var templateX = new Int32Array(templateLength);
    var templateY = new Int32Array(templateLength);
    for (var k = 0; k < templateLength; k++) {
      templateX[k] = template[k].x;
      templateY[k] = template[k].y;
    }

    var pseudoPixelContext = ReusedContexts[templateIndex];
    var bitmap = [];

    var decoder = decodingContext.decoder;
    var contexts = decodingContext.contextCache.getContexts('GB');

    var ltp = 0;
    for (var i = 0; i < height; i++) {
      if (prediction) {
        var cx = contexts[pseudoPixelContext];
        if (!cx)
          contexts[pseudoPixelContext] = cx = {index: 0, mps: 0};
        var sltp = decoder.readBit(cx);
        ltp ^= sltp;
      }
      if (ltp) {
        bitmap.push(bitmap[bitmap.length - 1]); // duplicate previous row
        continue;
      }
      var row = new Uint8Array(width);
      bitmap.push(row);
      for (var j = 0; j < width; j++) {
        if (useskip && skip[i][j]) {
          row[j] = 0;
          continue;
        }
        var contextLabel = 0;
        for (var k = 0; k < templateLength; k++) {
          var i0 = i + templateY[k], j0 = j + templateX[k];
          if (i0 < 0 || j0 < 0 || j0 >= width)
            contextLabel <<= 1; // out of bound pixel
          else
            contextLabel = (contextLabel << 1) | bitmap[i0][j0];
        }
        var cx = contexts[contextLabel];
        if (!cx)
          contexts[contextLabel] = cx = {index: 0, mps: 0};
        var pixel = decoder.readBit(cx);
        row[j] = pixel;
      }
    }
    return bitmap;
  }

  // 6.3.2 Generic Refinement Region Decoding Procedure
  function decodeRefinement(width, height, templateIndex, referenceBitmap,
                            offsetX, offsetY, prediction, at,
                            decodingContext) {
    var codingTemplate = RefinementTemplates[templateIndex].coding;
    if (templateIndex == 0)
      codingTemplate = codingTemplate.concat([at[0]]);
    var codingTemplateLength = codingTemplate.length;
    var codingTemplateX = new Int32Array(codingTemplateLength);
    var codingTemplateY = new Int32Array(codingTemplateLength);
    for (var k = 0; k < codingTemplateLength; k++) {
      codingTemplateX[k] = codingTemplate[k].x;
      codingTemplateY[k] = codingTemplate[k].y;
    }
    var referenceTemplate = RefinementTemplates[templateIndex].reference;
    if (templateIndex == 0)
      referenceTemplate = referenceTemplate.concat([at[1]]);
    var referenceTemplateLength = referenceTemplate.length;
    var referenceTemplateX = new Int32Array(referenceTemplateLength);
    var referenceTemplateY = new Int32Array(referenceTemplateLength);
    for (var k = 0; k < referenceTemplateLength; k++) {
      referenceTemplateX[k] = referenceTemplate[k].x;
      referenceTemplateY[k] = referenceTemplate[k].y;
    }
    var referenceWidth = referenceBitmap[0].length;
    var referenceHeight = referenceBitmap.length;

    var pseudoPixelContext = RefinementReusedContexts[templateIndex];
    var bitmap = [];

    var decoder = decodingContext.decoder;
    var contexts = decodingContext.contextCache.getContexts('GR');

    var ltp = 0;
    for (var i = 0; i < height; i++) {
      if (prediction) {
        var cx = contexts[pseudoPixelContext];
        if (!cx)
          contexts[pseudoPixelContext] = cx = {index: 0, mps: 0};
        var sltp = decoder.readBit(cx);
        ltp ^= sltp;
      }
      var row = new Uint8Array(width);
      bitmap.push(row);
      for (var j = 0; j < width; j++) {
        if (ltp)
          error('JBIG2 error: prediction is not supported');

        var contextLabel = 0;
        for (var k = 0; k < codingTemplateLength; k++) {
          var i0 = i + codingTemplateY[k], j0 = j + codingTemplateX[k];
          if (i0 < 0 || j0 < 0 || j0 >= width)
            contextLabel <<= 1; // out of bound pixel
          else
            contextLabel = (contextLabel << 1) | bitmap[i0][j0];
        }
        for (var k = 0; k < referenceTemplateLength; k++) {
          var i0 = i + referenceTemplateY[k] + offsetY;
          var j0 = j + referenceTemplateX[k] + offsetX;
          if (i0 < 0 || i0 >= referenceHeight || j0 < 0 || j0 >= referenceWidth)
            contextLabel <<= 1; // out of bound pixel
          else
            contextLabel = (contextLabel << 1) | referenceBitmap[i0][j0];
        }
        var cx = contexts[contextLabel];
        if (!cx)
          contexts[contextLabel] = cx = {index: 0, mps: 0};
        var pixel = decoder.readBit(cx);
        row[j] = pixel;
      }
    }

    return bitmap;
  }

  // 6.5.5 Decoding the symbol dictionary
  function decodeSymbolDictionary(huffman, refinement, symbols,
                                  numberOfNewSymbols, numberOfExportedSymbols,
                                  huffmanTables, templateIndex, at,
                                  refinementTemplateIndex, refinementAt,
                                  decodingContext) {
    if (huffman)
      error('JBIG2 error: huffman is not supported');

    var newSymbols = [];
    var currentHeight = 0;
    var symbolCodeLength = log2(symbols.length + numberOfNewSymbols);

    var decoder = decodingContext.decoder;
    var contextCache = decodingContext.contextCache;

    while (newSymbols.length < numberOfNewSymbols) {
      var deltaHeight = decodeInteger(contextCache, 'IADH', decoder); // 6.5.6
      currentHeight += deltaHeight;
      var currentWidth = 0;
      var totalWidth = 0;
      while (true) {
        var deltaWidth = decodeInteger(contextCache, 'IADW', decoder); // 6.5.7
        if (deltaWidth == null)
          break; // OOB
        currentWidth += deltaWidth;
        totalWidth += currentWidth;
        var bitmap;
        if (refinement) {
          // 6.5.8.2 Refinement/aggregate-coded symbol bitmap
          var numberOfInstances = decodeInteger(contextCache, 'IAAI', decoder);
          if (numberOfInstances > 1)
            error('JBIG2 error: number of instances > 1 is not supported');
          var symbolId = decodeIAID(contextCache, decoder, symbolCodeLength);
          var rdx = decodeInteger(contextCache, 'IARDX', decoder); // 6.4.11.3
          var rdy = decodeInteger(contextCache, 'IARDY', decoder); // 6.4.11.4
          var symbol = symbolId < symbols.length ? symbols[symbolId] :
            newSymbols[symbolId - symbols.length];
          bitmap = decodeRefinement(currentWidth, currentHeight,
            refinementTemplateIndex, symbol, rdx, rdy, false, refinementAt,
            decodingContext);
        } else {
          // 6.5.8.1 Direct-coded symbol bitmap
          bitmap = decodeBitmap(false, currentWidth, currentHeight,
            templateIndex, false, null, at, decodingContext);
        }
        newSymbols.push(bitmap);
      }
    }
    // 6.5.10 Exported symbols
    var exportedSymbols = [];
    var flags = [], currentFlag = false;
    var totalSymbolsLength = symbols.length + numberOfNewSymbols;
    while (flags.length < totalSymbolsLength) {
      var runLength = decodeInteger(contextCache, 'IAEX', decoder);
      while (runLength--)
        flags.push(currentFlag);
      currentFlag = !currentFlag;
    }
    for (var i = 0, ii = symbols.length; i < ii; i++)
      if (flags[i]) exportedSymbols.push(symbols[i]);
    for (var j = 0; j < numberOfNewSymbols; i++, j++)
      if (flags[i]) exportedSymbols.push(newSymbols[j]);
    return exportedSymbols;
  }

  function decodeTextRegion(huffman, refinement, width, height,
                            defaultPixelValue, numberOfSymbolInstances,
                            stripSize, inputSymbols, symbolCodeLength,
                            transposed, dsOffset, referenceCorner,
                            combinationOperator, huffmanTables,
                            refinementTemplateIndex, refinementAt,
                            decodingContext) {
    if (huffman)
      error('JBIG2 error: huffman is not supported');

    // Prepare bitmap
    var bitmap = [];
    for (var i = 0; i < height; i++) {
      var row = new Uint8Array(width);
      if (defaultPixelValue) {
        for (var j = 0; j < width; j++)
          row[j] = defaultPixelValue;
      }
      bitmap.push(row);
    }

    var decoder = decodingContext.decoder;
    var contextCache = decodingContext.contextCache;

    if (transposed)
      error('JBIG2 error: transposed is not supported');

    var stripT = -decodeInteger(contextCache, 'IADT', decoder); // 6.4.6
    var firstS = 0;
    var i = 0;
    while (i < numberOfSymbolInstances) {
      var deltaT = decodeInteger(contextCache, 'IADT', decoder); // 6.4.6
      stripT += deltaT;

      var deltaFirstS = decodeInteger(contextCache, 'IAFS', decoder); // 6.4.7
      firstS += deltaFirstS;
      var currentS = firstS;
      do {
        var currentT = stripSize == 1 ? 0 :
          decodeInteger(contextCache, 'IAIT', decoder); // 6.4.9
        var t = stripSize * stripT + currentT;
        var symbolId = decodeIAID(contextCache, decoder, symbolCodeLength);
        var applyRefinement = refinement &&
          decodeInteger(contextCache, 'IARI', decoder);
        var symbolBitmap = inputSymbols[symbolId];
        var symbolWidth = symbolBitmap[0].length;
        var symbolHeight = symbolBitmap.length;
        if (applyRefinement) {
          var rdw = decodeInteger(contextCache, 'IARDW', decoder); // 6.4.11.1
          var rdh = decodeInteger(contextCache, 'IARDH', decoder); // 6.4.11.2
          var rdx = decodeInteger(contextCache, 'IARDX', decoder); // 6.4.11.3
          var rdy = decodeInteger(contextCache, 'IARDY', decoder); // 6.4.11.4
          symbolWidth += rdw;
          symbolHeight += rdh;
          symbolBitmap = decodeRefinement(symbolWidth, symbolHeight,
            refinementTemplateIndex, symbolBitmap, (rdw >> 1) + rdx,
            (rdh >> 1) + rdy, false, refinementAt,
            decodingContext);
        }
        var offsetT = t - ((referenceCorner & 1) ? 0 : symbolHeight);
        var offsetS = currentS - ((referenceCorner & 2) ? symbolWidth : 0);
        for (var t2 = 0; t2 < symbolHeight; t2++) {
          var row = bitmap[offsetT + t2];
          if (!row) continue;
          var symbolRow = symbolBitmap[t2];
          switch (combinationOperator) {
            case 0: // OR
              for (var s2 = 0; s2 < symbolWidth; s2++)
                row[offsetS + s2] |= symbolRow[s2];
              break;
            case 2: // XOR
              for (var s2 = 0; s2 < symbolWidth; s2++)
                row[offsetS + s2] ^= symbolRow[s2];
              break;
            default:
              error('JBIG2 error: operator ' + combinationOperator +
                    ' is not supported');
          }
        }

        currentS += symbolWidth - 1;
        i++;

        var deltaS = decodeInteger(contextCache, 'IADS', decoder); // 6.4.8
        if (deltaS == null)
          break; // OOB
        currentS += deltaS + dsOffset;
      } while (true);
    }
    return bitmap;
  }

  function readSegmentHeader(data, start) {
    var segmentHeader = {};
    segmentHeader.number = readUint32(data, start);
    var flags = data[start + 4];
    var segmentType = flags & 0x3F;
    if (!SegmentTypes[segmentType])
      error('JBIG2 error: invalid segment type: ' + segmentType);
    segmentHeader.type = segmentType;
    segmentHeader.typeName = SegmentTypes[segmentType];
    segmentHeader.deferredNonRetain = !!(flags & 0x80);
    var pageAssociationFieldSize = !!(flags & 0x40);
    var referredFlags = data[start + 5];
    var referredToCount = (referredFlags >> 5) & 7;
    var retainBits = [referredFlags & 31];
    var position = start + 6;
    if (referredFlags == 7) {
      referredToCount = readInt32(data, position - 1) & 0x1FFFFFFF;
      position += 3;
      var bytes = (referredToCount + 7) >> 3;
      retainBits[0] = data[position++];
      while (--bytes > 0) {
        retainBits.push(data[position++]);
      }
    } else if (referredFlags == 5 || referredFlags == 6)
      error('JBIG2 error: invalid referred-to flags');
    segmentHeader.retainBits = retainBits;
    var referredToSegmentNumberSize = segmentHeader.number <= 256 ? 1 :
      segmentHeader.number <= 65536 ? 2 : 4;
    var referredTo = [];
    for (var i = 0; i < referredToCount; i++) {
      var number = referredToSegmentNumberSize == 1 ? data[position] :
        referredToSegmentNumberSize == 2 ? readUint16(data, position) :
        readUint32(data, position);
      referredTo.push(number);
      position += referredToSegmentNumberSize;
    }
    segmentHeader.referredTo = referredTo;
    if (!pageAssociationFieldSize)
      segmentHeader.pageAssociation = data[position++];
    else {
      segmentHeader.pageAssociation = readUint32(data, position);
      position += 4;
    }
    segmentHeader.length = readUint32(data, position);
    if (segmentHeader.length == 0xFFFFFFFF)
      error('JBIG2 error: unknown segment length is not supported');
    position += 4;
    segmentHeader.headerEnd = position;
    return segmentHeader;
  }

  function readSegments(header, data, start, end) {
    var segments = [];
    var position = start;
    while (position < end) {
      var segmentHeader = readSegmentHeader(data, position);
      position = segmentHeader.headerEnd;
      var segment = {
        header: segmentHeader,
        data: data
      };
      if (!header.randomAccess) {
        segment.start = position;
        position += segmentHeader.length;
        segment.end = position;
      }
      segments.push(segment);
      if (segmentHeader.type == 51)
        break; // end of file is found
    }
    if (header.randomAccess) {
      for (var i = 0, ii = segments.length; i < ii; i++) {
        segments[i].start = position;
        position += segments[i].header.length;
        segments[i].end = position;
      }
    }
    return segments;
  }

  // 7.4.1 Region segment information field
  function readRegionSegmentInformation(data, start) {
    return {
      width: readUint32(data, start),
      height: readUint32(data, start + 4),
      x: readUint32(data, start + 8),
      y: readUint32(data, start + 12),
      combinationOperator: data[start + 16] & 7
    };
  }
  var RegionSegmentInformationFieldLength = 17;

  function processSegment(segment, visitor) {
    var header = segment.header;

    var data = segment.data, position = segment.start, end = segment.end;
    var args;
    switch (header.type) {
      case 0: // SymbolDictionary
        // 7.4.2 Symbol dictionary segment syntax
        var dictionary = {};
        var dictionaryFlags = readUint16(data, position); // 7.4.2.1.1
        dictionary.huffman = !!(dictionaryFlags & 1);
        dictionary.refinement = !!(dictionaryFlags & 2);
        dictionary.huffmanDHSelector = (dictionaryFlags >> 2) & 3;
        dictionary.huffmanDWSelector = (dictionaryFlags >> 4) & 3;
        dictionary.bitmapSizeSelector = (dictionaryFlags >> 6) & 1;
        dictionary.aggregationInstancesSelector = (dictionaryFlags >> 7) & 1;
        dictionary.bitmapCodingContextUsed = !!(dictionaryFlags & 256);
        dictionary.bitmapCodingContextRetained = !!(dictionaryFlags & 512);
        dictionary.template = (dictionaryFlags >> 10) & 3;
        dictionary.refinementTemplate = (dictionaryFlags >> 12) & 1;
        position += 2;
        if (!dictionary.huffman) {
          var atLength = dictionary.template == 0 ? 4 : 1;
          var at = [];
          for (var i = 0; i < atLength; i++) {
            at.push({
              x: readInt8(data, position),
              y: readInt8(data, position + 1)
            });
            position += 2;
          }
          dictionary.at = at;
        }
        if (dictionary.refinement && !dictionary.refinementTemplate) {
          var at = [];
          for (var i = 0; i < 2; i++) {
            at.push({
              x: readInt8(data, position),
              y: readInt8(data, position + 1)
            });
            position += 2;
          }
          dictionary.refinementAt = at;
        }
        dictionary.numberOfExportedSymbols = readUint32(data, position);
        position += 4;
        dictionary.numberOfNewSymbols = readUint32(data, position);
        position += 4;
        args = [dictionary, header.number, header.referredTo,
                data, position, end];
        break;
      case 6: // ImmediateTextRegion
      case 7: // ImmediateLosslessTextRegion
        var textRegion = {};
        textRegion.info = readRegionSegmentInformation(data, position);
        position += RegionSegmentInformationFieldLength;
        var textRegionSegmentFlags = readUint16(data, position);
        position += 2;
        textRegion.huffman = !!(textRegionSegmentFlags & 1);
        textRegion.refinement = !!(textRegionSegmentFlags & 2);
        textRegion.stripSize = 1 << ((textRegionSegmentFlags >> 2) & 3);
        textRegion.referenceCorner = (textRegionSegmentFlags >> 4) & 3;
        textRegion.transposed = !!(textRegionSegmentFlags & 64);
        textRegion.combinationOperator = (textRegionSegmentFlags >> 7) & 3;
        textRegion.defaultPixelValue = (textRegionSegmentFlags >> 9) & 1;
        textRegion.dsOffset = (textRegionSegmentFlags >> 10) & 31;
        textRegion.refinementTemplate = (textRegionSegmentFlags >> 15) & 1;
        if (textRegion.huffman) {
          var textRegionHuffmanFlags = readUint16(data, position);
          position += 2;
          textRegion.huffmanFS = (textRegionHuffmanFlags) & 3;
          textRegion.huffmanDS = (textRegionHuffmanFlags >> 2) & 3;
          textRegion.huffmanDT = (textRegionHuffmanFlags >> 4) & 3;
          textRegion.huffmanRefinementDW = (textRegionHuffmanFlags >> 6) & 3;
          textRegion.huffmanRefinementDH = (textRegionHuffmanFlags >> 8) & 3;
          textRegion.huffmanRefinementDX = (textRegionHuffmanFlags >> 10) & 3;
          textRegion.huffmanRefinementDY = (textRegionHuffmanFlags >> 12) & 3;
          textRegion.huffmanRefinementSizeSelector =
            !!(textRegionHuffmanFlags & 14);
        }
        if (textRegion.refinement && !textRegion.refinementTemplate) {
          var at = [];
          for (var i = 0; i < 2; i++) {
            at.push({
              x: readInt8(data, position),
              y: readInt8(data, position + 1)
            });
            position += 2;
          }
          textRegion.refinementAt = at;
        }
        textRegion.numberOfSymbolInstances = readUint32(data, position);
        position += 4;
        // TODO 7.4.3.1.7 Symbol ID Huffman table decoding
        if (textRegion.huffman)
          error('JBIG2 error: huffman is not supported');
        args = [textRegion, header.referredTo, data, position, end];
        break;
      case 38: // ImmediateGenericRegion
      case 39: // ImmediateLosslessGenericRegion
        var genericRegion = {};
        genericRegion.info = readRegionSegmentInformation(data, position);
        position += RegionSegmentInformationFieldLength;
        var genericRegionSegmentFlags = data[position++];
        genericRegion.mmr = !!(genericRegionSegmentFlags & 1);
        genericRegion.template = (genericRegionSegmentFlags >> 1) & 3;
        genericRegion.prediction = !!(genericRegionSegmentFlags & 8);
        if (!genericRegion.mmr) {
          var atLength = genericRegion.template == 0 ? 4 : 1;
          var at = [];
          for (var i = 0; i < atLength; i++) {
            at.push({
              x: readInt8(data, position),
              y: readInt8(data, position + 1)
            });
            position += 2;
          }
          genericRegion.at = at;
        }
        args = [genericRegion, data, position, end];
        break;
      case 48: // PageInformation
        var pageInfo = {
          width: readUint32(data, position),
          height: readUint32(data, position + 4),
          resolutionX: readUint32(data, position + 8),
          resolutionY: readUint32(data, position + 12)
        };
        if (pageInfo.height == 0xFFFFFFFF)
          delete pageInfo.height;
        var pageSegmentFlags = data[position + 16];
        var pageStripingInformatiom = readUint16(data, position + 17);
        pageInfo.lossless = !!(pageSegmentFlags & 1);
        pageInfo.refinement = !!(pageSegmentFlags & 2);
        pageInfo.defaultPixelValue = (pageSegmentFlags >> 2) & 1;
        pageInfo.combinationOperator = (pageSegmentFlags >> 3) & 3;
        pageInfo.requiresBuffer = !!(pageSegmentFlags & 32);
        pageInfo.combinationOperatorOverride = !!(pageSegmentFlags & 64);
        args = [pageInfo];
        break;
      case 50: // EndOfStripe
        break;
      case 51: // EndOfFile
        break;
      default:
        error('JBIG2 error: segment type ' + header.typeName + '(' +
              header.type + ') is not implemented');
    }
    var callbackName = 'on' + header.typeName;
    if (callbackName in visitor)
      visitor[callbackName].apply(visitor, args);
  }

  function processSegments(segments, visitor) {
    for (var i = 0, ii = segments.length; i < ii; i++)
      processSegment(segments[i], visitor);
  }

  function parseJbig2(data, start, end) {
    var position = start;
    if (data[position] != 0x97 || data[position + 1] != 0x4A ||
        data[position + 2] != 0x42 || data[position + 3] != 0x32 ||
        data[position + 4] != 0x0D || data[position + 5] != 0x0A ||
        data[position + 6] != 0x1A || data[position + 7] != 0x0A)
      error('JBIG2 error: invalid header');
    var header = {};
    position += 8;
    var flags = data[position++];
    header.randomAccess = !(flags & 1);
    if (!(flags & 2)) {
      header.numberOfPages = readUint32(data, position);
      position += 4;
    }
    var segments = readSegments(header, data, position, end);
    error('Not implemented');
    // processSegments(segments, new SimpleSegmentVisitor());
  }

  function parseJbig2Chunks(chunks) {
    var visitor = new SimpleSegmentVisitor();
    for (var i = 0, ii = chunks.length; i < ii; i++) {
      var chunk = chunks[i];
      var segments = readSegments({}, chunk.data, chunk.start, chunk.end);
      processSegments(segments, visitor);
    }
    return visitor.buffer;
  }

  function SimpleSegmentVisitor() {}

  SimpleSegmentVisitor.prototype = {
    onPageInformation: function SimpleSegmentVisitor_onPageInformation(info) {
      this.currentPageInfo = info;
      var rowSize = (info.width + 7) >> 3;
      var buffer = new Uint8Array(rowSize * info.height);
      var fill = info.defaultPixelValue ? 0xFF : 0;
      for (var i = 0, ii = buffer.length; i < ii; i++)
        buffer[i] = fill;
      this.buffer = buffer;
    },
    drawBitmap: function SimpleSegmentVisitor_drawBitmap(regionInfo, bitmap) {
      var pageInfo = this.currentPageInfo;
      var width = regionInfo.width, height = regionInfo.height;
      var rowSize = (pageInfo.width + 7) >> 3;
      var combinationOperator = pageInfo.combinationOperatorOverride ?
        regionInfo.combinationOperator : pageInfo.combinationOperator;
      var buffer = this.buffer;
      for (var i = 0; i < height; i++) {
        var mask = 128 >> (regionInfo.x & 7);
        var offset = (i + regionInfo.y) * rowSize + (regionInfo.x >> 3);
        switch (combinationOperator) {
          case 0: // OR
            for (var j = 0; j < width; j++) {
              buffer[offset] |= bitmap[i][j] ? mask : 0;
              mask >>= 1;
              if (!mask) {
                mask = 128;
                offset++;
              }
            }
            break;
          case 2: // XOR
            for (var j = 0; j < width; j++) {
              buffer[offset] ^= bitmap[i][j] ? mask : 0;
              mask >>= 1;
              if (!mask) {
                mask = 128;
                offset++;
              }
            }
            break;
          default:
            error('JBIG2 error: operator ' + combinationOperator +
                  ' is not supported');
        }
      }
    },
    onImmediateGenericRegion:
      function SimpleSegmentVisitor_onImmediateGenericRegion(region, data,
                                                             start, end) {
      var regionInfo = region.info;
      var decodingContext = new DecodingContext(data, start, end);
      var bitmap = decodeBitmap(region.mmr, regionInfo.width, regionInfo.height,
                                region.template, region.prediction, null,
                                region.at, decodingContext);
      this.drawBitmap(regionInfo, bitmap);
    },
    onImmediateLosslessGenericRegion:
      function SimpleSegmentVisitor_onImmediateLosslessGenericRegion() {
      this.onImmediateGenericRegion.apply(this, arguments);
    },
    onSymbolDictionary:
      function SimpleSegmentVisitor_onSymbolDictionary(dictionary,
                                                       currentSegment,
                                                       referredSegments,
                                                       data, start, end) {
      var huffmanTables;
      if (dictionary.huffman)
        error('JBIG2 error: huffman is not supported');

      // Combines exported symbols from all referred segments
      var symbols = this.symbols;
      if (!symbols)
        this.symbols = symbols = {};

      var inputSymbols = [];
      for (var i = 0, ii = referredSegments.length; i < ii; i++)
        inputSymbols = inputSymbols.concat(symbols[referredSegments[i]]);

      var decodingContext = new DecodingContext(data, start, end);
      symbols[currentSegment] = decodeSymbolDictionary(dictionary.huffman,
        dictionary.refinement, inputSymbols, dictionary.numberOfNewSymbols,
        dictionary.numberOfExportedSymbols, huffmanTables,
        dictionary.template, dictionary.at,
        dictionary.refinementTemplate, dictionary.refinementAt,
        decodingContext);
    },
    onImmediateTextRegion:
      function SimpleSegmentVisitor_onImmediateTextRegion(region,
                                                          referredSegments,
                                                          data, start, end) {
      var regionInfo = region.info;
      var huffmanTables;

      // Combines exported symbols from all referred segments
      var symbols = this.symbols;
      var inputSymbols = [];
      for (var i = 0, ii = referredSegments.length; i < ii; i++)
        inputSymbols = inputSymbols.concat(symbols[referredSegments[i]]);
      var symbolCodeLength = log2(inputSymbols.length);

      var decodingContext = new DecodingContext(data, start, end);
      var bitmap = decodeTextRegion(region.huffman, region.refinement,
        regionInfo.width, regionInfo.height, region.defaultPixelValue,
        region.numberOfSymbolInstances, region.stripSize, inputSymbols,
        symbolCodeLength, region.transposed, region.dsOffset,
        region.referenceCorner, region.combinationOperator, huffmanTables,
        region.refinementTemplate, region.refinementAt, decodingContext);
      this.drawBitmap(regionInfo, bitmap);
    },
    onImmediateLosslessTextRegion:
      function SimpleSegmentVisitor_onImmediateLosslessTextRegion() {
        this.onImmediateTextRegion.apply(this, arguments);
    }
  };

  function Jbig2Image() {}

  Jbig2Image.prototype = {
    parseChunks: function Jbig2Image_parseChunks(chunks) {
      return parseJbig2Chunks(chunks);
    }
  };

  return Jbig2Image;
})();
