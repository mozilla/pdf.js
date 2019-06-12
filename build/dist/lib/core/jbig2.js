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

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Jbig2Image = void 0;

var _util = require("../shared/util");

var _arithmetic_decoder = require("./arithmetic_decoder");

var _ccitt = require("./ccitt");

var Jbig2Error = function Jbig2ErrorClosure() {
  function Jbig2Error(msg) {
    this.message = 'JBIG2 error: ' + msg;
  }

  Jbig2Error.prototype = new Error();
  Jbig2Error.prototype.name = 'Jbig2Error';
  Jbig2Error.constructor = Jbig2Error;
  return Jbig2Error;
}();

var Jbig2Image = function Jbig2ImageClosure() {
  function ContextCache() {}

  ContextCache.prototype = {
    getContexts: function getContexts(id) {
      if (id in this) {
        return this[id];
      }

      return this[id] = new Int8Array(1 << 16);
    }
  };

  function DecodingContext(data, start, end) {
    this.data = data;
    this.start = start;
    this.end = end;
  }

  DecodingContext.prototype = {
    get decoder() {
      var decoder = new _arithmetic_decoder.ArithmeticDecoder(this.data, this.start, this.end);
      return (0, _util.shadow)(this, 'decoder', decoder);
    },

    get contextCache() {
      var cache = new ContextCache();
      return (0, _util.shadow)(this, 'contextCache', cache);
    }

  };

  function decodeInteger(contextCache, procedure, decoder) {
    var contexts = contextCache.getContexts(procedure);
    var prev = 1;

    function readBits(length) {
      var v = 0;

      for (var i = 0; i < length; i++) {
        var bit = decoder.readBit(contexts, prev);
        prev = prev < 256 ? prev << 1 | bit : (prev << 1 | bit) & 511 | 256;
        v = v << 1 | bit;
      }

      return v >>> 0;
    }

    var sign = readBits(1);
    var value = readBits(1) ? readBits(1) ? readBits(1) ? readBits(1) ? readBits(1) ? readBits(32) + 4436 : readBits(12) + 340 : readBits(8) + 84 : readBits(6) + 20 : readBits(4) + 4 : readBits(2);
    return sign === 0 ? value : value > 0 ? -value : null;
  }

  function decodeIAID(contextCache, decoder, codeLength) {
    var contexts = contextCache.getContexts('IAID');
    var prev = 1;

    for (var i = 0; i < codeLength; i++) {
      var bit = decoder.readBit(contexts, prev);
      prev = prev << 1 | bit;
    }

    if (codeLength < 31) {
      return prev & (1 << codeLength) - 1;
    }

    return prev & 0x7FFFFFFF;
  }

  var SegmentTypes = ['SymbolDictionary', null, null, null, 'IntermediateTextRegion', null, 'ImmediateTextRegion', 'ImmediateLosslessTextRegion', null, null, null, null, null, null, null, null, 'PatternDictionary', null, null, null, 'IntermediateHalftoneRegion', null, 'ImmediateHalftoneRegion', 'ImmediateLosslessHalftoneRegion', null, null, null, null, null, null, null, null, null, null, null, null, 'IntermediateGenericRegion', null, 'ImmediateGenericRegion', 'ImmediateLosslessGenericRegion', 'IntermediateGenericRefinementRegion', null, 'ImmediateGenericRefinementRegion', 'ImmediateLosslessGenericRefinementRegion', null, null, null, null, 'PageInformation', 'EndOfPage', 'EndOfStripe', 'EndOfFile', 'Profiles', 'Tables', null, null, null, null, null, null, null, null, 'Extension'];
  var CodingTemplates = [[{
    x: -1,
    y: -2
  }, {
    x: 0,
    y: -2
  }, {
    x: 1,
    y: -2
  }, {
    x: -2,
    y: -1
  }, {
    x: -1,
    y: -1
  }, {
    x: 0,
    y: -1
  }, {
    x: 1,
    y: -1
  }, {
    x: 2,
    y: -1
  }, {
    x: -4,
    y: 0
  }, {
    x: -3,
    y: 0
  }, {
    x: -2,
    y: 0
  }, {
    x: -1,
    y: 0
  }], [{
    x: -1,
    y: -2
  }, {
    x: 0,
    y: -2
  }, {
    x: 1,
    y: -2
  }, {
    x: 2,
    y: -2
  }, {
    x: -2,
    y: -1
  }, {
    x: -1,
    y: -1
  }, {
    x: 0,
    y: -1
  }, {
    x: 1,
    y: -1
  }, {
    x: 2,
    y: -1
  }, {
    x: -3,
    y: 0
  }, {
    x: -2,
    y: 0
  }, {
    x: -1,
    y: 0
  }], [{
    x: -1,
    y: -2
  }, {
    x: 0,
    y: -2
  }, {
    x: 1,
    y: -2
  }, {
    x: -2,
    y: -1
  }, {
    x: -1,
    y: -1
  }, {
    x: 0,
    y: -1
  }, {
    x: 1,
    y: -1
  }, {
    x: -2,
    y: 0
  }, {
    x: -1,
    y: 0
  }], [{
    x: -3,
    y: -1
  }, {
    x: -2,
    y: -1
  }, {
    x: -1,
    y: -1
  }, {
    x: 0,
    y: -1
  }, {
    x: 1,
    y: -1
  }, {
    x: -4,
    y: 0
  }, {
    x: -3,
    y: 0
  }, {
    x: -2,
    y: 0
  }, {
    x: -1,
    y: 0
  }]];
  var RefinementTemplates = [{
    coding: [{
      x: 0,
      y: -1
    }, {
      x: 1,
      y: -1
    }, {
      x: -1,
      y: 0
    }],
    reference: [{
      x: 0,
      y: -1
    }, {
      x: 1,
      y: -1
    }, {
      x: -1,
      y: 0
    }, {
      x: 0,
      y: 0
    }, {
      x: 1,
      y: 0
    }, {
      x: -1,
      y: 1
    }, {
      x: 0,
      y: 1
    }, {
      x: 1,
      y: 1
    }]
  }, {
    coding: [{
      x: -1,
      y: -1
    }, {
      x: 0,
      y: -1
    }, {
      x: 1,
      y: -1
    }, {
      x: -1,
      y: 0
    }],
    reference: [{
      x: 0,
      y: -1
    }, {
      x: -1,
      y: 0
    }, {
      x: 0,
      y: 0
    }, {
      x: 1,
      y: 0
    }, {
      x: 0,
      y: 1
    }, {
      x: 1,
      y: 1
    }]
  }];
  var ReusedContexts = [0x9B25, 0x0795, 0x00E5, 0x0195];
  var RefinementReusedContexts = [0x0020, 0x0008];

  function decodeBitmapTemplate0(width, height, decodingContext) {
    var decoder = decodingContext.decoder;
    var contexts = decodingContext.contextCache.getContexts('GB');
    var contextLabel,
        i,
        j,
        pixel,
        row,
        row1,
        row2,
        bitmap = [];
    var OLD_PIXEL_MASK = 0x7BF7;

    for (i = 0; i < height; i++) {
      row = bitmap[i] = new Uint8Array(width);
      row1 = i < 1 ? row : bitmap[i - 1];
      row2 = i < 2 ? row : bitmap[i - 2];
      contextLabel = row2[0] << 13 | row2[1] << 12 | row2[2] << 11 | row1[0] << 7 | row1[1] << 6 | row1[2] << 5 | row1[3] << 4;

      for (j = 0; j < width; j++) {
        row[j] = pixel = decoder.readBit(contexts, contextLabel);
        contextLabel = (contextLabel & OLD_PIXEL_MASK) << 1 | (j + 3 < width ? row2[j + 3] << 11 : 0) | (j + 4 < width ? row1[j + 4] << 4 : 0) | pixel;
      }
    }

    return bitmap;
  }

  function decodeBitmap(mmr, width, height, templateIndex, prediction, skip, at, decodingContext) {
    if (mmr) {
      var input = new Reader(decodingContext.data, decodingContext.start, decodingContext.end);
      return decodeMMRBitmap(input, width, height, false);
    }

    if (templateIndex === 0 && !skip && !prediction && at.length === 4 && at[0].x === 3 && at[0].y === -1 && at[1].x === -3 && at[1].y === -1 && at[2].x === 2 && at[2].y === -2 && at[3].x === -2 && at[3].y === -2) {
      return decodeBitmapTemplate0(width, height, decodingContext);
    }

    var useskip = !!skip;
    var template = CodingTemplates[templateIndex].concat(at);
    template.sort(function (a, b) {
      return a.y - b.y || a.x - b.x;
    });
    var templateLength = template.length;
    var templateX = new Int8Array(templateLength);
    var templateY = new Int8Array(templateLength);
    var changingTemplateEntries = [];
    var reuseMask = 0,
        minX = 0,
        maxX = 0,
        minY = 0;
    var c, k;

    for (k = 0; k < templateLength; k++) {
      templateX[k] = template[k].x;
      templateY[k] = template[k].y;
      minX = Math.min(minX, template[k].x);
      maxX = Math.max(maxX, template[k].x);
      minY = Math.min(minY, template[k].y);

      if (k < templateLength - 1 && template[k].y === template[k + 1].y && template[k].x === template[k + 1].x - 1) {
        reuseMask |= 1 << templateLength - 1 - k;
      } else {
        changingTemplateEntries.push(k);
      }
    }

    var changingEntriesLength = changingTemplateEntries.length;
    var changingTemplateX = new Int8Array(changingEntriesLength);
    var changingTemplateY = new Int8Array(changingEntriesLength);
    var changingTemplateBit = new Uint16Array(changingEntriesLength);

    for (c = 0; c < changingEntriesLength; c++) {
      k = changingTemplateEntries[c];
      changingTemplateX[c] = template[k].x;
      changingTemplateY[c] = template[k].y;
      changingTemplateBit[c] = 1 << templateLength - 1 - k;
    }

    var sbb_left = -minX;
    var sbb_top = -minY;
    var sbb_right = width - maxX;
    var pseudoPixelContext = ReusedContexts[templateIndex];
    var row = new Uint8Array(width);
    var bitmap = [];
    var decoder = decodingContext.decoder;
    var contexts = decodingContext.contextCache.getContexts('GB');
    var ltp = 0,
        j,
        i0,
        j0,
        contextLabel = 0,
        bit,
        shift;

    for (var i = 0; i < height; i++) {
      if (prediction) {
        var sltp = decoder.readBit(contexts, pseudoPixelContext);
        ltp ^= sltp;

        if (ltp) {
          bitmap.push(row);
          continue;
        }
      }

      row = new Uint8Array(row);
      bitmap.push(row);

      for (j = 0; j < width; j++) {
        if (useskip && skip[i][j]) {
          row[j] = 0;
          continue;
        }

        if (j >= sbb_left && j < sbb_right && i >= sbb_top) {
          contextLabel = contextLabel << 1 & reuseMask;

          for (k = 0; k < changingEntriesLength; k++) {
            i0 = i + changingTemplateY[k];
            j0 = j + changingTemplateX[k];
            bit = bitmap[i0][j0];

            if (bit) {
              bit = changingTemplateBit[k];
              contextLabel |= bit;
            }
          }
        } else {
          contextLabel = 0;
          shift = templateLength - 1;

          for (k = 0; k < templateLength; k++, shift--) {
            j0 = j + templateX[k];

            if (j0 >= 0 && j0 < width) {
              i0 = i + templateY[k];

              if (i0 >= 0) {
                bit = bitmap[i0][j0];

                if (bit) {
                  contextLabel |= bit << shift;
                }
              }
            }
          }
        }

        var pixel = decoder.readBit(contexts, contextLabel);
        row[j] = pixel;
      }
    }

    return bitmap;
  }

  function decodeRefinement(width, height, templateIndex, referenceBitmap, offsetX, offsetY, prediction, at, decodingContext) {
    var codingTemplate = RefinementTemplates[templateIndex].coding;

    if (templateIndex === 0) {
      codingTemplate = codingTemplate.concat([at[0]]);
    }

    var codingTemplateLength = codingTemplate.length;
    var codingTemplateX = new Int32Array(codingTemplateLength);
    var codingTemplateY = new Int32Array(codingTemplateLength);
    var k;

    for (k = 0; k < codingTemplateLength; k++) {
      codingTemplateX[k] = codingTemplate[k].x;
      codingTemplateY[k] = codingTemplate[k].y;
    }

    var referenceTemplate = RefinementTemplates[templateIndex].reference;

    if (templateIndex === 0) {
      referenceTemplate = referenceTemplate.concat([at[1]]);
    }

    var referenceTemplateLength = referenceTemplate.length;
    var referenceTemplateX = new Int32Array(referenceTemplateLength);
    var referenceTemplateY = new Int32Array(referenceTemplateLength);

    for (k = 0; k < referenceTemplateLength; k++) {
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
        var sltp = decoder.readBit(contexts, pseudoPixelContext);
        ltp ^= sltp;

        if (ltp) {
          throw new Jbig2Error('prediction is not supported');
        }
      }

      var row = new Uint8Array(width);
      bitmap.push(row);

      for (var j = 0; j < width; j++) {
        var i0, j0;
        var contextLabel = 0;

        for (k = 0; k < codingTemplateLength; k++) {
          i0 = i + codingTemplateY[k];
          j0 = j + codingTemplateX[k];

          if (i0 < 0 || j0 < 0 || j0 >= width) {
            contextLabel <<= 1;
          } else {
            contextLabel = contextLabel << 1 | bitmap[i0][j0];
          }
        }

        for (k = 0; k < referenceTemplateLength; k++) {
          i0 = i + referenceTemplateY[k] - offsetY;
          j0 = j + referenceTemplateX[k] - offsetX;

          if (i0 < 0 || i0 >= referenceHeight || j0 < 0 || j0 >= referenceWidth) {
            contextLabel <<= 1;
          } else {
            contextLabel = contextLabel << 1 | referenceBitmap[i0][j0];
          }
        }

        var pixel = decoder.readBit(contexts, contextLabel);
        row[j] = pixel;
      }
    }

    return bitmap;
  }

  function decodeSymbolDictionary(huffman, refinement, symbols, numberOfNewSymbols, numberOfExportedSymbols, huffmanTables, templateIndex, at, refinementTemplateIndex, refinementAt, decodingContext, huffmanInput) {
    if (huffman && refinement) {
      throw new Jbig2Error('symbol refinement with Huffman is not supported');
    }

    var newSymbols = [];
    var currentHeight = 0;
    var symbolCodeLength = (0, _util.log2)(symbols.length + numberOfNewSymbols);
    var decoder = decodingContext.decoder;
    var contextCache = decodingContext.contextCache;
    var tableB1, symbolWidths;

    if (huffman) {
      tableB1 = getStandardTable(1);
      symbolWidths = [];
      symbolCodeLength = Math.max(symbolCodeLength, 1);
    }

    while (newSymbols.length < numberOfNewSymbols) {
      var deltaHeight = huffman ? huffmanTables.tableDeltaHeight.decode(huffmanInput) : decodeInteger(contextCache, 'IADH', decoder);
      currentHeight += deltaHeight;
      var currentWidth = 0,
          totalWidth = 0;
      var firstSymbol = huffman ? symbolWidths.length : 0;

      while (true) {
        var deltaWidth = huffman ? huffmanTables.tableDeltaWidth.decode(huffmanInput) : decodeInteger(contextCache, 'IADW', decoder);

        if (deltaWidth === null) {
          break;
        }

        currentWidth += deltaWidth;
        totalWidth += currentWidth;
        var bitmap;

        if (refinement) {
          var numberOfInstances = decodeInteger(contextCache, 'IAAI', decoder);

          if (numberOfInstances > 1) {
            bitmap = decodeTextRegion(huffman, refinement, currentWidth, currentHeight, 0, numberOfInstances, 1, symbols.concat(newSymbols), symbolCodeLength, 0, 0, 1, 0, huffmanTables, refinementTemplateIndex, refinementAt, decodingContext, 0, huffmanInput);
          } else {
            var symbolId = decodeIAID(contextCache, decoder, symbolCodeLength);
            var rdx = decodeInteger(contextCache, 'IARDX', decoder);
            var rdy = decodeInteger(contextCache, 'IARDY', decoder);
            var symbol = symbolId < symbols.length ? symbols[symbolId] : newSymbols[symbolId - symbols.length];
            bitmap = decodeRefinement(currentWidth, currentHeight, refinementTemplateIndex, symbol, rdx, rdy, false, refinementAt, decodingContext);
          }

          newSymbols.push(bitmap);
        } else if (huffman) {
          symbolWidths.push(currentWidth);
        } else {
          bitmap = decodeBitmap(false, currentWidth, currentHeight, templateIndex, false, null, at, decodingContext);
          newSymbols.push(bitmap);
        }
      }

      if (huffman && !refinement) {
        var bitmapSize = huffmanTables.tableBitmapSize.decode(huffmanInput);
        huffmanInput.byteAlign();
        var collectiveBitmap = void 0;

        if (bitmapSize === 0) {
          collectiveBitmap = readUncompressedBitmap(huffmanInput, totalWidth, currentHeight);
        } else {
          var originalEnd = huffmanInput.end;
          var bitmapEnd = huffmanInput.position + bitmapSize;
          huffmanInput.end = bitmapEnd;
          collectiveBitmap = decodeMMRBitmap(huffmanInput, totalWidth, currentHeight, false);
          huffmanInput.end = originalEnd;
          huffmanInput.position = bitmapEnd;
        }

        var numberOfSymbolsDecoded = symbolWidths.length;

        if (firstSymbol === numberOfSymbolsDecoded - 1) {
          newSymbols.push(collectiveBitmap);
        } else {
          var _i = void 0,
              y = void 0,
              xMin = 0,
              xMax = void 0,
              bitmapWidth = void 0,
              symbolBitmap = void 0;

          for (_i = firstSymbol; _i < numberOfSymbolsDecoded; _i++) {
            bitmapWidth = symbolWidths[_i];
            xMax = xMin + bitmapWidth;
            symbolBitmap = [];

            for (y = 0; y < currentHeight; y++) {
              symbolBitmap.push(collectiveBitmap[y].subarray(xMin, xMax));
            }

            newSymbols.push(symbolBitmap);
            xMin = xMax;
          }
        }
      }
    }

    var exportedSymbols = [];
    var flags = [],
        currentFlag = false;
    var totalSymbolsLength = symbols.length + numberOfNewSymbols;

    while (flags.length < totalSymbolsLength) {
      var runLength = huffman ? tableB1.decode(huffmanInput) : decodeInteger(contextCache, 'IAEX', decoder);

      while (runLength--) {
        flags.push(currentFlag);
      }

      currentFlag = !currentFlag;
    }

    for (var i = 0, ii = symbols.length; i < ii; i++) {
      if (flags[i]) {
        exportedSymbols.push(symbols[i]);
      }
    }

    for (var j = 0; j < numberOfNewSymbols; i++, j++) {
      if (flags[i]) {
        exportedSymbols.push(newSymbols[j]);
      }
    }

    return exportedSymbols;
  }

  function decodeTextRegion(huffman, refinement, width, height, defaultPixelValue, numberOfSymbolInstances, stripSize, inputSymbols, symbolCodeLength, transposed, dsOffset, referenceCorner, combinationOperator, huffmanTables, refinementTemplateIndex, refinementAt, decodingContext, logStripSize, huffmanInput) {
    if (huffman && refinement) {
      throw new Jbig2Error('refinement with Huffman is not supported');
    }

    var bitmap = [];
    var i, row;

    for (i = 0; i < height; i++) {
      row = new Uint8Array(width);

      if (defaultPixelValue) {
        for (var j = 0; j < width; j++) {
          row[j] = defaultPixelValue;
        }
      }

      bitmap.push(row);
    }

    var decoder = decodingContext.decoder;
    var contextCache = decodingContext.contextCache;
    var stripT = huffman ? -huffmanTables.tableDeltaT.decode(huffmanInput) : -decodeInteger(contextCache, 'IADT', decoder);
    var firstS = 0;
    i = 0;

    while (i < numberOfSymbolInstances) {
      var deltaT = huffman ? huffmanTables.tableDeltaT.decode(huffmanInput) : decodeInteger(contextCache, 'IADT', decoder);
      stripT += deltaT;
      var deltaFirstS = huffman ? huffmanTables.tableFirstS.decode(huffmanInput) : decodeInteger(contextCache, 'IAFS', decoder);
      firstS += deltaFirstS;
      var currentS = firstS;

      do {
        var currentT = 0;

        if (stripSize > 1) {
          currentT = huffman ? huffmanInput.readBits(logStripSize) : decodeInteger(contextCache, 'IAIT', decoder);
        }

        var t = stripSize * stripT + currentT;
        var symbolId = huffman ? huffmanTables.symbolIDTable.decode(huffmanInput) : decodeIAID(contextCache, decoder, symbolCodeLength);
        var applyRefinement = refinement && (huffman ? huffmanInput.readBit() : decodeInteger(contextCache, 'IARI', decoder));
        var symbolBitmap = inputSymbols[symbolId];
        var symbolWidth = symbolBitmap[0].length;
        var symbolHeight = symbolBitmap.length;

        if (applyRefinement) {
          var rdw = decodeInteger(contextCache, 'IARDW', decoder);
          var rdh = decodeInteger(contextCache, 'IARDH', decoder);
          var rdx = decodeInteger(contextCache, 'IARDX', decoder);
          var rdy = decodeInteger(contextCache, 'IARDY', decoder);
          symbolWidth += rdw;
          symbolHeight += rdh;
          symbolBitmap = decodeRefinement(symbolWidth, symbolHeight, refinementTemplateIndex, symbolBitmap, (rdw >> 1) + rdx, (rdh >> 1) + rdy, false, refinementAt, decodingContext);
        }

        var offsetT = t - (referenceCorner & 1 ? 0 : symbolHeight - 1);
        var offsetS = currentS - (referenceCorner & 2 ? symbolWidth - 1 : 0);
        var s2, t2, symbolRow;

        if (transposed) {
          for (s2 = 0; s2 < symbolHeight; s2++) {
            row = bitmap[offsetS + s2];

            if (!row) {
              continue;
            }

            symbolRow = symbolBitmap[s2];
            var maxWidth = Math.min(width - offsetT, symbolWidth);

            switch (combinationOperator) {
              case 0:
                for (t2 = 0; t2 < maxWidth; t2++) {
                  row[offsetT + t2] |= symbolRow[t2];
                }

                break;

              case 2:
                for (t2 = 0; t2 < maxWidth; t2++) {
                  row[offsetT + t2] ^= symbolRow[t2];
                }

                break;

              default:
                throw new Jbig2Error("operator ".concat(combinationOperator, " is not supported"));
            }
          }

          currentS += symbolHeight - 1;
        } else {
          for (t2 = 0; t2 < symbolHeight; t2++) {
            row = bitmap[offsetT + t2];

            if (!row) {
              continue;
            }

            symbolRow = symbolBitmap[t2];

            switch (combinationOperator) {
              case 0:
                for (s2 = 0; s2 < symbolWidth; s2++) {
                  row[offsetS + s2] |= symbolRow[s2];
                }

                break;

              case 2:
                for (s2 = 0; s2 < symbolWidth; s2++) {
                  row[offsetS + s2] ^= symbolRow[s2];
                }

                break;

              default:
                throw new Jbig2Error("operator ".concat(combinationOperator, " is not supported"));
            }
          }

          currentS += symbolWidth - 1;
        }

        i++;
        var deltaS = huffman ? huffmanTables.tableDeltaS.decode(huffmanInput) : decodeInteger(contextCache, 'IADS', decoder);

        if (deltaS === null) {
          break;
        }

        currentS += deltaS + dsOffset;
      } while (true);
    }

    return bitmap;
  }

  function decodePatternDictionary(mmr, patternWidth, patternHeight, maxPatternIndex, template, decodingContext) {
    var at = [];

    if (!mmr) {
      at.push({
        x: -patternWidth,
        y: 0
      });

      if (template === 0) {
        at.push({
          x: -3,
          y: -1
        });
        at.push({
          x: 2,
          y: -2
        });
        at.push({
          x: -2,
          y: -2
        });
      }
    }

    var collectiveWidth = (maxPatternIndex + 1) * patternWidth;
    var collectiveBitmap = decodeBitmap(mmr, collectiveWidth, patternHeight, template, false, null, at, decodingContext);
    var patterns = [],
        i = 0,
        patternBitmap,
        xMin,
        xMax,
        y;

    while (i <= maxPatternIndex) {
      patternBitmap = [];
      xMin = patternWidth * i;
      xMax = xMin + patternWidth;

      for (y = 0; y < patternHeight; y++) {
        patternBitmap.push(collectiveBitmap[y].subarray(xMin, xMax));
      }

      patterns.push(patternBitmap);
      i++;
    }

    return patterns;
  }

  function decodeHalftoneRegion(mmr, patterns, template, regionWidth, regionHeight, defaultPixelValue, enableSkip, combinationOperator, gridWidth, gridHeight, gridOffsetX, gridOffsetY, gridVectorX, gridVectorY, decodingContext) {
    var skip = null;

    if (enableSkip) {
      throw new Jbig2Error('skip is not supported');
    }

    if (combinationOperator !== 0) {
      throw new Jbig2Error('operator ' + combinationOperator + ' is not supported in halftone region');
    }

    var regionBitmap = [];
    var i, j, row;

    for (i = 0; i < regionHeight; i++) {
      row = new Uint8Array(regionWidth);

      if (defaultPixelValue) {
        for (j = 0; j < regionWidth; j++) {
          row[j] = defaultPixelValue;
        }
      }

      regionBitmap.push(row);
    }

    var numberOfPatterns = patterns.length;
    var pattern0 = patterns[0];
    var patternWidth = pattern0[0].length,
        patternHeight = pattern0.length;
    var bitsPerValue = (0, _util.log2)(numberOfPatterns);
    var at = [];

    if (!mmr) {
      at.push({
        x: template <= 1 ? 3 : 2,
        y: -1
      });

      if (template === 0) {
        at.push({
          x: -3,
          y: -1
        });
        at.push({
          x: 2,
          y: -2
        });
        at.push({
          x: -2,
          y: -2
        });
      }
    }

    var grayScaleBitPlanes = [],
        mmrInput,
        bitmap;

    if (mmr) {
      mmrInput = new Reader(decodingContext.data, decodingContext.start, decodingContext.end);
    }

    for (i = bitsPerValue - 1; i >= 0; i--) {
      if (mmr) {
        bitmap = decodeMMRBitmap(mmrInput, gridWidth, gridHeight, true);
      } else {
        bitmap = decodeBitmap(false, gridWidth, gridHeight, template, false, skip, at, decodingContext);
      }

      grayScaleBitPlanes[i] = bitmap;
    }

    var mg, ng, bit, patternIndex, patternBitmap, x, y, patternRow, regionRow;

    for (mg = 0; mg < gridHeight; mg++) {
      for (ng = 0; ng < gridWidth; ng++) {
        bit = 0;
        patternIndex = 0;

        for (j = bitsPerValue - 1; j >= 0; j--) {
          bit = grayScaleBitPlanes[j][mg][ng] ^ bit;
          patternIndex |= bit << j;
        }

        patternBitmap = patterns[patternIndex];
        x = gridOffsetX + mg * gridVectorY + ng * gridVectorX >> 8;
        y = gridOffsetY + mg * gridVectorX - ng * gridVectorY >> 8;

        if (x >= 0 && x + patternWidth <= regionWidth && y >= 0 && y + patternHeight <= regionHeight) {
          for (i = 0; i < patternHeight; i++) {
            regionRow = regionBitmap[y + i];
            patternRow = patternBitmap[i];

            for (j = 0; j < patternWidth; j++) {
              regionRow[x + j] |= patternRow[j];
            }
          }
        } else {
          var regionX = void 0,
              regionY = void 0;

          for (i = 0; i < patternHeight; i++) {
            regionY = y + i;

            if (regionY < 0 || regionY >= regionHeight) {
              continue;
            }

            regionRow = regionBitmap[regionY];
            patternRow = patternBitmap[i];

            for (j = 0; j < patternWidth; j++) {
              regionX = x + j;

              if (regionX >= 0 && regionX < regionWidth) {
                regionRow[regionX] |= patternRow[j];
              }
            }
          }
        }
      }
    }

    return regionBitmap;
  }

  function readSegmentHeader(data, start) {
    var segmentHeader = {};
    segmentHeader.number = (0, _util.readUint32)(data, start);
    var flags = data[start + 4];
    var segmentType = flags & 0x3F;

    if (!SegmentTypes[segmentType]) {
      throw new Jbig2Error('invalid segment type: ' + segmentType);
    }

    segmentHeader.type = segmentType;
    segmentHeader.typeName = SegmentTypes[segmentType];
    segmentHeader.deferredNonRetain = !!(flags & 0x80);
    var pageAssociationFieldSize = !!(flags & 0x40);
    var referredFlags = data[start + 5];
    var referredToCount = referredFlags >> 5 & 7;
    var retainBits = [referredFlags & 31];
    var position = start + 6;

    if (referredFlags === 7) {
      referredToCount = (0, _util.readUint32)(data, position - 1) & 0x1FFFFFFF;
      position += 3;
      var bytes = referredToCount + 7 >> 3;
      retainBits[0] = data[position++];

      while (--bytes > 0) {
        retainBits.push(data[position++]);
      }
    } else if (referredFlags === 5 || referredFlags === 6) {
      throw new Jbig2Error('invalid referred-to flags');
    }

    segmentHeader.retainBits = retainBits;
    var referredToSegmentNumberSize = segmentHeader.number <= 256 ? 1 : segmentHeader.number <= 65536 ? 2 : 4;
    var referredTo = [];
    var i, ii;

    for (i = 0; i < referredToCount; i++) {
      var number = referredToSegmentNumberSize === 1 ? data[position] : referredToSegmentNumberSize === 2 ? (0, _util.readUint16)(data, position) : (0, _util.readUint32)(data, position);
      referredTo.push(number);
      position += referredToSegmentNumberSize;
    }

    segmentHeader.referredTo = referredTo;

    if (!pageAssociationFieldSize) {
      segmentHeader.pageAssociation = data[position++];
    } else {
      segmentHeader.pageAssociation = (0, _util.readUint32)(data, position);
      position += 4;
    }

    segmentHeader.length = (0, _util.readUint32)(data, position);
    position += 4;

    if (segmentHeader.length === 0xFFFFFFFF) {
      if (segmentType === 38) {
        var genericRegionInfo = readRegionSegmentInformation(data, position);
        var genericRegionSegmentFlags = data[position + RegionSegmentInformationFieldLength];
        var genericRegionMmr = !!(genericRegionSegmentFlags & 1);
        var searchPatternLength = 6;
        var searchPattern = new Uint8Array(searchPatternLength);

        if (!genericRegionMmr) {
          searchPattern[0] = 0xFF;
          searchPattern[1] = 0xAC;
        }

        searchPattern[2] = genericRegionInfo.height >>> 24 & 0xFF;
        searchPattern[3] = genericRegionInfo.height >> 16 & 0xFF;
        searchPattern[4] = genericRegionInfo.height >> 8 & 0xFF;
        searchPattern[5] = genericRegionInfo.height & 0xFF;

        for (i = position, ii = data.length; i < ii; i++) {
          var j = 0;

          while (j < searchPatternLength && searchPattern[j] === data[i + j]) {
            j++;
          }

          if (j === searchPatternLength) {
            segmentHeader.length = i + searchPatternLength;
            break;
          }
        }

        if (segmentHeader.length === 0xFFFFFFFF) {
          throw new Jbig2Error('segment end was not found');
        }
      } else {
        throw new Jbig2Error('invalid unknown segment length');
      }
    }

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

      if (segmentHeader.type === 51) {
        break;
      }
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

  function readRegionSegmentInformation(data, start) {
    return {
      width: (0, _util.readUint32)(data, start),
      height: (0, _util.readUint32)(data, start + 4),
      x: (0, _util.readUint32)(data, start + 8),
      y: (0, _util.readUint32)(data, start + 12),
      combinationOperator: data[start + 16] & 7
    };
  }

  var RegionSegmentInformationFieldLength = 17;

  function processSegment(segment, visitor) {
    var header = segment.header;
    var data = segment.data,
        position = segment.start,
        end = segment.end;
    var args, at, i, atLength;

    switch (header.type) {
      case 0:
        var dictionary = {};
        var dictionaryFlags = (0, _util.readUint16)(data, position);
        dictionary.huffman = !!(dictionaryFlags & 1);
        dictionary.refinement = !!(dictionaryFlags & 2);
        dictionary.huffmanDHSelector = dictionaryFlags >> 2 & 3;
        dictionary.huffmanDWSelector = dictionaryFlags >> 4 & 3;
        dictionary.bitmapSizeSelector = dictionaryFlags >> 6 & 1;
        dictionary.aggregationInstancesSelector = dictionaryFlags >> 7 & 1;
        dictionary.bitmapCodingContextUsed = !!(dictionaryFlags & 256);
        dictionary.bitmapCodingContextRetained = !!(dictionaryFlags & 512);
        dictionary.template = dictionaryFlags >> 10 & 3;
        dictionary.refinementTemplate = dictionaryFlags >> 12 & 1;
        position += 2;

        if (!dictionary.huffman) {
          atLength = dictionary.template === 0 ? 4 : 1;
          at = [];

          for (i = 0; i < atLength; i++) {
            at.push({
              x: (0, _util.readInt8)(data, position),
              y: (0, _util.readInt8)(data, position + 1)
            });
            position += 2;
          }

          dictionary.at = at;
        }

        if (dictionary.refinement && !dictionary.refinementTemplate) {
          at = [];

          for (i = 0; i < 2; i++) {
            at.push({
              x: (0, _util.readInt8)(data, position),
              y: (0, _util.readInt8)(data, position + 1)
            });
            position += 2;
          }

          dictionary.refinementAt = at;
        }

        dictionary.numberOfExportedSymbols = (0, _util.readUint32)(data, position);
        position += 4;
        dictionary.numberOfNewSymbols = (0, _util.readUint32)(data, position);
        position += 4;
        args = [dictionary, header.number, header.referredTo, data, position, end];
        break;

      case 6:
      case 7:
        var textRegion = {};
        textRegion.info = readRegionSegmentInformation(data, position);
        position += RegionSegmentInformationFieldLength;
        var textRegionSegmentFlags = (0, _util.readUint16)(data, position);
        position += 2;
        textRegion.huffman = !!(textRegionSegmentFlags & 1);
        textRegion.refinement = !!(textRegionSegmentFlags & 2);
        textRegion.logStripSize = textRegionSegmentFlags >> 2 & 3;
        textRegion.stripSize = 1 << textRegion.logStripSize;
        textRegion.referenceCorner = textRegionSegmentFlags >> 4 & 3;
        textRegion.transposed = !!(textRegionSegmentFlags & 64);
        textRegion.combinationOperator = textRegionSegmentFlags >> 7 & 3;
        textRegion.defaultPixelValue = textRegionSegmentFlags >> 9 & 1;
        textRegion.dsOffset = textRegionSegmentFlags << 17 >> 27;
        textRegion.refinementTemplate = textRegionSegmentFlags >> 15 & 1;

        if (textRegion.huffman) {
          var textRegionHuffmanFlags = (0, _util.readUint16)(data, position);
          position += 2;
          textRegion.huffmanFS = textRegionHuffmanFlags & 3;
          textRegion.huffmanDS = textRegionHuffmanFlags >> 2 & 3;
          textRegion.huffmanDT = textRegionHuffmanFlags >> 4 & 3;
          textRegion.huffmanRefinementDW = textRegionHuffmanFlags >> 6 & 3;
          textRegion.huffmanRefinementDH = textRegionHuffmanFlags >> 8 & 3;
          textRegion.huffmanRefinementDX = textRegionHuffmanFlags >> 10 & 3;
          textRegion.huffmanRefinementDY = textRegionHuffmanFlags >> 12 & 3;
          textRegion.huffmanRefinementSizeSelector = !!(textRegionHuffmanFlags & 0x4000);
        }

        if (textRegion.refinement && !textRegion.refinementTemplate) {
          at = [];

          for (i = 0; i < 2; i++) {
            at.push({
              x: (0, _util.readInt8)(data, position),
              y: (0, _util.readInt8)(data, position + 1)
            });
            position += 2;
          }

          textRegion.refinementAt = at;
        }

        textRegion.numberOfSymbolInstances = (0, _util.readUint32)(data, position);
        position += 4;
        args = [textRegion, header.referredTo, data, position, end];
        break;

      case 16:
        var patternDictionary = {};
        var patternDictionaryFlags = data[position++];
        patternDictionary.mmr = !!(patternDictionaryFlags & 1);
        patternDictionary.template = patternDictionaryFlags >> 1 & 3;
        patternDictionary.patternWidth = data[position++];
        patternDictionary.patternHeight = data[position++];
        patternDictionary.maxPatternIndex = (0, _util.readUint32)(data, position);
        position += 4;
        args = [patternDictionary, header.number, data, position, end];
        break;

      case 22:
      case 23:
        var halftoneRegion = {};
        halftoneRegion.info = readRegionSegmentInformation(data, position);
        position += RegionSegmentInformationFieldLength;
        var halftoneRegionFlags = data[position++];
        halftoneRegion.mmr = !!(halftoneRegionFlags & 1);
        halftoneRegion.template = halftoneRegionFlags >> 1 & 3;
        halftoneRegion.enableSkip = !!(halftoneRegionFlags & 8);
        halftoneRegion.combinationOperator = halftoneRegionFlags >> 4 & 7;
        halftoneRegion.defaultPixelValue = halftoneRegionFlags >> 7 & 1;
        halftoneRegion.gridWidth = (0, _util.readUint32)(data, position);
        position += 4;
        halftoneRegion.gridHeight = (0, _util.readUint32)(data, position);
        position += 4;
        halftoneRegion.gridOffsetX = (0, _util.readUint32)(data, position) & 0xFFFFFFFF;
        position += 4;
        halftoneRegion.gridOffsetY = (0, _util.readUint32)(data, position) & 0xFFFFFFFF;
        position += 4;
        halftoneRegion.gridVectorX = (0, _util.readUint16)(data, position);
        position += 2;
        halftoneRegion.gridVectorY = (0, _util.readUint16)(data, position);
        position += 2;
        args = [halftoneRegion, header.referredTo, data, position, end];
        break;

      case 38:
      case 39:
        var genericRegion = {};
        genericRegion.info = readRegionSegmentInformation(data, position);
        position += RegionSegmentInformationFieldLength;
        var genericRegionSegmentFlags = data[position++];
        genericRegion.mmr = !!(genericRegionSegmentFlags & 1);
        genericRegion.template = genericRegionSegmentFlags >> 1 & 3;
        genericRegion.prediction = !!(genericRegionSegmentFlags & 8);

        if (!genericRegion.mmr) {
          atLength = genericRegion.template === 0 ? 4 : 1;
          at = [];

          for (i = 0; i < atLength; i++) {
            at.push({
              x: (0, _util.readInt8)(data, position),
              y: (0, _util.readInt8)(data, position + 1)
            });
            position += 2;
          }

          genericRegion.at = at;
        }

        args = [genericRegion, data, position, end];
        break;

      case 48:
        var pageInfo = {
          width: (0, _util.readUint32)(data, position),
          height: (0, _util.readUint32)(data, position + 4),
          resolutionX: (0, _util.readUint32)(data, position + 8),
          resolutionY: (0, _util.readUint32)(data, position + 12)
        };

        if (pageInfo.height === 0xFFFFFFFF) {
          delete pageInfo.height;
        }

        var pageSegmentFlags = data[position + 16];
        (0, _util.readUint16)(data, position + 17);
        pageInfo.lossless = !!(pageSegmentFlags & 1);
        pageInfo.refinement = !!(pageSegmentFlags & 2);
        pageInfo.defaultPixelValue = pageSegmentFlags >> 2 & 1;
        pageInfo.combinationOperator = pageSegmentFlags >> 3 & 3;
        pageInfo.requiresBuffer = !!(pageSegmentFlags & 32);
        pageInfo.combinationOperatorOverride = !!(pageSegmentFlags & 64);
        args = [pageInfo];
        break;

      case 49:
        break;

      case 50:
        break;

      case 51:
        break;

      case 53:
        args = [header.number, data, position, end];
        break;

      case 62:
        break;

      default:
        throw new Jbig2Error("segment type ".concat(header.typeName, "(").concat(header.type, ")") + ' is not implemented');
    }

    var callbackName = 'on' + header.typeName;

    if (callbackName in visitor) {
      visitor[callbackName].apply(visitor, args);
    }
  }

  function processSegments(segments, visitor) {
    for (var i = 0, ii = segments.length; i < ii; i++) {
      processSegment(segments[i], visitor);
    }
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

  function parseJbig2(data) {
    var position = 0,
        end = data.length;

    if (data[position] !== 0x97 || data[position + 1] !== 0x4A || data[position + 2] !== 0x42 || data[position + 3] !== 0x32 || data[position + 4] !== 0x0D || data[position + 5] !== 0x0A || data[position + 6] !== 0x1A || data[position + 7] !== 0x0A) {
      throw new Jbig2Error('parseJbig2 - invalid header.');
    }

    var header = Object.create(null);
    position += 8;
    var flags = data[position++];
    header.randomAccess = !(flags & 1);

    if (!(flags & 2)) {
      header.numberOfPages = (0, _util.readUint32)(data, position);
      position += 4;
    }

    var segments = readSegments(header, data, position, end);
    var visitor = new SimpleSegmentVisitor();
    processSegments(segments, visitor);
    var _visitor$currentPageI = visitor.currentPageInfo,
        width = _visitor$currentPageI.width,
        height = _visitor$currentPageI.height;
    var bitPacked = visitor.buffer;
    var imgData = new Uint8ClampedArray(width * height);
    var q = 0,
        k = 0;

    for (var i = 0; i < height; i++) {
      var mask = 0,
          buffer = void 0;

      for (var j = 0; j < width; j++) {
        if (!mask) {
          mask = 128;
          buffer = bitPacked[k++];
        }

        imgData[q++] = buffer & mask ? 0 : 255;
        mask >>= 1;
      }
    }

    return {
      imgData: imgData,
      width: width,
      height: height
    };
  }

  function SimpleSegmentVisitor() {}

  SimpleSegmentVisitor.prototype = {
    onPageInformation: function SimpleSegmentVisitor_onPageInformation(info) {
      this.currentPageInfo = info;
      var rowSize = info.width + 7 >> 3;
      var buffer = new Uint8ClampedArray(rowSize * info.height);

      if (info.defaultPixelValue) {
        for (var i = 0, ii = buffer.length; i < ii; i++) {
          buffer[i] = 0xFF;
        }
      }

      this.buffer = buffer;
    },
    drawBitmap: function SimpleSegmentVisitor_drawBitmap(regionInfo, bitmap) {
      var pageInfo = this.currentPageInfo;
      var width = regionInfo.width,
          height = regionInfo.height;
      var rowSize = pageInfo.width + 7 >> 3;
      var combinationOperator = pageInfo.combinationOperatorOverride ? regionInfo.combinationOperator : pageInfo.combinationOperator;
      var buffer = this.buffer;
      var mask0 = 128 >> (regionInfo.x & 7);
      var offset0 = regionInfo.y * rowSize + (regionInfo.x >> 3);
      var i, j, mask, offset;

      switch (combinationOperator) {
        case 0:
          for (i = 0; i < height; i++) {
            mask = mask0;
            offset = offset0;

            for (j = 0; j < width; j++) {
              if (bitmap[i][j]) {
                buffer[offset] |= mask;
              }

              mask >>= 1;

              if (!mask) {
                mask = 128;
                offset++;
              }
            }

            offset0 += rowSize;
          }

          break;

        case 2:
          for (i = 0; i < height; i++) {
            mask = mask0;
            offset = offset0;

            for (j = 0; j < width; j++) {
              if (bitmap[i][j]) {
                buffer[offset] ^= mask;
              }

              mask >>= 1;

              if (!mask) {
                mask = 128;
                offset++;
              }
            }

            offset0 += rowSize;
          }

          break;

        default:
          throw new Jbig2Error("operator ".concat(combinationOperator, " is not supported"));
      }
    },
    onImmediateGenericRegion: function SimpleSegmentVisitor_onImmediateGenericRegion(region, data, start, end) {
      var regionInfo = region.info;
      var decodingContext = new DecodingContext(data, start, end);
      var bitmap = decodeBitmap(region.mmr, regionInfo.width, regionInfo.height, region.template, region.prediction, null, region.at, decodingContext);
      this.drawBitmap(regionInfo, bitmap);
    },
    onImmediateLosslessGenericRegion: function SimpleSegmentVisitor_onImmediateLosslessGenericRegion() {
      this.onImmediateGenericRegion.apply(this, arguments);
    },
    onSymbolDictionary: function SimpleSegmentVisitor_onSymbolDictionary(dictionary, currentSegment, referredSegments, data, start, end) {
      var huffmanTables, huffmanInput;

      if (dictionary.huffman) {
        huffmanTables = getSymbolDictionaryHuffmanTables(dictionary, referredSegments, this.customTables);
        huffmanInput = new Reader(data, start, end);
      }

      var symbols = this.symbols;

      if (!symbols) {
        this.symbols = symbols = {};
      }

      var inputSymbols = [];

      for (var i = 0, ii = referredSegments.length; i < ii; i++) {
        var referredSymbols = symbols[referredSegments[i]];

        if (referredSymbols) {
          inputSymbols = inputSymbols.concat(referredSymbols);
        }
      }

      var decodingContext = new DecodingContext(data, start, end);
      symbols[currentSegment] = decodeSymbolDictionary(dictionary.huffman, dictionary.refinement, inputSymbols, dictionary.numberOfNewSymbols, dictionary.numberOfExportedSymbols, huffmanTables, dictionary.template, dictionary.at, dictionary.refinementTemplate, dictionary.refinementAt, decodingContext, huffmanInput);
    },
    onImmediateTextRegion: function SimpleSegmentVisitor_onImmediateTextRegion(region, referredSegments, data, start, end) {
      var regionInfo = region.info;
      var huffmanTables, huffmanInput;
      var symbols = this.symbols;
      var inputSymbols = [];

      for (var i = 0, ii = referredSegments.length; i < ii; i++) {
        var referredSymbols = symbols[referredSegments[i]];

        if (referredSymbols) {
          inputSymbols = inputSymbols.concat(referredSymbols);
        }
      }

      var symbolCodeLength = (0, _util.log2)(inputSymbols.length);

      if (region.huffman) {
        huffmanInput = new Reader(data, start, end);
        huffmanTables = getTextRegionHuffmanTables(region, referredSegments, this.customTables, inputSymbols.length, huffmanInput);
      }

      var decodingContext = new DecodingContext(data, start, end);
      var bitmap = decodeTextRegion(region.huffman, region.refinement, regionInfo.width, regionInfo.height, region.defaultPixelValue, region.numberOfSymbolInstances, region.stripSize, inputSymbols, symbolCodeLength, region.transposed, region.dsOffset, region.referenceCorner, region.combinationOperator, huffmanTables, region.refinementTemplate, region.refinementAt, decodingContext, region.logStripSize, huffmanInput);
      this.drawBitmap(regionInfo, bitmap);
    },
    onImmediateLosslessTextRegion: function SimpleSegmentVisitor_onImmediateLosslessTextRegion() {
      this.onImmediateTextRegion.apply(this, arguments);
    },
    onPatternDictionary: function onPatternDictionary(dictionary, currentSegment, data, start, end) {
      var patterns = this.patterns;

      if (!patterns) {
        this.patterns = patterns = {};
      }

      var decodingContext = new DecodingContext(data, start, end);
      patterns[currentSegment] = decodePatternDictionary(dictionary.mmr, dictionary.patternWidth, dictionary.patternHeight, dictionary.maxPatternIndex, dictionary.template, decodingContext);
    },
    onImmediateHalftoneRegion: function onImmediateHalftoneRegion(region, referredSegments, data, start, end) {
      var patterns = this.patterns[referredSegments[0]];
      var regionInfo = region.info;
      var decodingContext = new DecodingContext(data, start, end);
      var bitmap = decodeHalftoneRegion(region.mmr, patterns, region.template, regionInfo.width, regionInfo.height, region.defaultPixelValue, region.enableSkip, region.combinationOperator, region.gridWidth, region.gridHeight, region.gridOffsetX, region.gridOffsetY, region.gridVectorX, region.gridVectorY, decodingContext);
      this.drawBitmap(regionInfo, bitmap);
    },
    onImmediateLosslessHalftoneRegion: function onImmediateLosslessHalftoneRegion() {
      this.onImmediateHalftoneRegion.apply(this, arguments);
    },
    onTables: function onTables(currentSegment, data, start, end) {
      var customTables = this.customTables;

      if (!customTables) {
        this.customTables = customTables = {};
      }

      customTables[currentSegment] = decodeTablesSegment(data, start, end);
    }
  };

  function HuffmanLine(lineData) {
    if (lineData.length === 2) {
      this.isOOB = true;
      this.rangeLow = 0;
      this.prefixLength = lineData[0];
      this.rangeLength = 0;
      this.prefixCode = lineData[1];
      this.isLowerRange = false;
    } else {
      this.isOOB = false;
      this.rangeLow = lineData[0];
      this.prefixLength = lineData[1];
      this.rangeLength = lineData[2];
      this.prefixCode = lineData[3];
      this.isLowerRange = lineData[4] === 'lower';
    }
  }

  function HuffmanTreeNode(line) {
    this.children = [];

    if (line) {
      this.isLeaf = true;
      this.rangeLength = line.rangeLength;
      this.rangeLow = line.rangeLow;
      this.isLowerRange = line.isLowerRange;
      this.isOOB = line.isOOB;
    } else {
      this.isLeaf = false;
    }
  }

  HuffmanTreeNode.prototype = {
    buildTree: function buildTree(line, shift) {
      var bit = line.prefixCode >> shift & 1;

      if (shift <= 0) {
        this.children[bit] = new HuffmanTreeNode(line);
      } else {
        var node = this.children[bit];

        if (!node) {
          this.children[bit] = node = new HuffmanTreeNode(null);
        }

        node.buildTree(line, shift - 1);
      }
    },
    decodeNode: function decodeNode(reader) {
      if (this.isLeaf) {
        if (this.isOOB) {
          return null;
        }

        var htOffset = reader.readBits(this.rangeLength);
        return this.rangeLow + (this.isLowerRange ? -htOffset : htOffset);
      }

      var node = this.children[reader.readBit()];

      if (!node) {
        throw new Jbig2Error('invalid Huffman data');
      }

      return node.decodeNode(reader);
    }
  };

  function HuffmanTable(lines, prefixCodesDone) {
    if (!prefixCodesDone) {
      this.assignPrefixCodes(lines);
    }

    this.rootNode = new HuffmanTreeNode(null);
    var i,
        ii = lines.length,
        line;

    for (i = 0; i < ii; i++) {
      line = lines[i];

      if (line.prefixLength > 0) {
        this.rootNode.buildTree(line, line.prefixLength - 1);
      }
    }
  }

  HuffmanTable.prototype = {
    decode: function decode(reader) {
      return this.rootNode.decodeNode(reader);
    },
    assignPrefixCodes: function assignPrefixCodes(lines) {
      var linesLength = lines.length,
          prefixLengthMax = 0,
          i;

      for (i = 0; i < linesLength; i++) {
        prefixLengthMax = Math.max(prefixLengthMax, lines[i].prefixLength);
      }

      var histogram = new Uint32Array(prefixLengthMax + 1);

      for (i = 0; i < linesLength; i++) {
        histogram[lines[i].prefixLength]++;
      }

      var currentLength = 1,
          firstCode = 0,
          currentCode,
          currentTemp,
          line;
      histogram[0] = 0;

      while (currentLength <= prefixLengthMax) {
        firstCode = firstCode + histogram[currentLength - 1] << 1;
        currentCode = firstCode;
        currentTemp = 0;

        while (currentTemp < linesLength) {
          line = lines[currentTemp];

          if (line.prefixLength === currentLength) {
            line.prefixCode = currentCode;
            currentCode++;
          }

          currentTemp++;
        }

        currentLength++;
      }
    }
  };

  function decodeTablesSegment(data, start, end) {
    var flags = data[start];
    var lowestValue = (0, _util.readUint32)(data, start + 1) & 0xFFFFFFFF;
    var highestValue = (0, _util.readUint32)(data, start + 5) & 0xFFFFFFFF;
    var reader = new Reader(data, start + 9, end);
    var prefixSizeBits = (flags >> 1 & 7) + 1;
    var rangeSizeBits = (flags >> 4 & 7) + 1;
    var lines = [];
    var prefixLength,
        rangeLength,
        currentRangeLow = lowestValue;

    do {
      prefixLength = reader.readBits(prefixSizeBits);
      rangeLength = reader.readBits(rangeSizeBits);
      lines.push(new HuffmanLine([currentRangeLow, prefixLength, rangeLength, 0]));
      currentRangeLow += 1 << rangeLength;
    } while (currentRangeLow < highestValue);

    prefixLength = reader.readBits(prefixSizeBits);
    lines.push(new HuffmanLine([lowestValue - 1, prefixLength, 32, 0, 'lower']));
    prefixLength = reader.readBits(prefixSizeBits);
    lines.push(new HuffmanLine([highestValue, prefixLength, 32, 0]));

    if (flags & 1) {
      prefixLength = reader.readBits(prefixSizeBits);
      lines.push(new HuffmanLine([prefixLength, 0]));
    }

    return new HuffmanTable(lines, false);
  }

  var standardTablesCache = {};

  function getStandardTable(number) {
    var table = standardTablesCache[number];

    if (table) {
      return table;
    }

    var lines;

    switch (number) {
      case 1:
        lines = [[0, 1, 4, 0x0], [16, 2, 8, 0x2], [272, 3, 16, 0x6], [65808, 3, 32, 0x7]];
        break;

      case 2:
        lines = [[0, 1, 0, 0x0], [1, 2, 0, 0x2], [2, 3, 0, 0x6], [3, 4, 3, 0xE], [11, 5, 6, 0x1E], [75, 6, 32, 0x3E], [6, 0x3F]];
        break;

      case 3:
        lines = [[-256, 8, 8, 0xFE], [0, 1, 0, 0x0], [1, 2, 0, 0x2], [2, 3, 0, 0x6], [3, 4, 3, 0xE], [11, 5, 6, 0x1E], [-257, 8, 32, 0xFF, 'lower'], [75, 7, 32, 0x7E], [6, 0x3E]];
        break;

      case 4:
        lines = [[1, 1, 0, 0x0], [2, 2, 0, 0x2], [3, 3, 0, 0x6], [4, 4, 3, 0xE], [12, 5, 6, 0x1E], [76, 5, 32, 0x1F]];
        break;

      case 5:
        lines = [[-255, 7, 8, 0x7E], [1, 1, 0, 0x0], [2, 2, 0, 0x2], [3, 3, 0, 0x6], [4, 4, 3, 0xE], [12, 5, 6, 0x1E], [-256, 7, 32, 0x7F, 'lower'], [76, 6, 32, 0x3E]];
        break;

      case 6:
        lines = [[-2048, 5, 10, 0x1C], [-1024, 4, 9, 0x8], [-512, 4, 8, 0x9], [-256, 4, 7, 0xA], [-128, 5, 6, 0x1D], [-64, 5, 5, 0x1E], [-32, 4, 5, 0xB], [0, 2, 7, 0x0], [128, 3, 7, 0x2], [256, 3, 8, 0x3], [512, 4, 9, 0xC], [1024, 4, 10, 0xD], [-2049, 6, 32, 0x3E, 'lower'], [2048, 6, 32, 0x3F]];
        break;

      case 7:
        lines = [[-1024, 4, 9, 0x8], [-512, 3, 8, 0x0], [-256, 4, 7, 0x9], [-128, 5, 6, 0x1A], [-64, 5, 5, 0x1B], [-32, 4, 5, 0xA], [0, 4, 5, 0xB], [32, 5, 5, 0x1C], [64, 5, 6, 0x1D], [128, 4, 7, 0xC], [256, 3, 8, 0x1], [512, 3, 9, 0x2], [1024, 3, 10, 0x3], [-1025, 5, 32, 0x1E, 'lower'], [2048, 5, 32, 0x1F]];
        break;

      case 8:
        lines = [[-15, 8, 3, 0xFC], [-7, 9, 1, 0x1FC], [-5, 8, 1, 0xFD], [-3, 9, 0, 0x1FD], [-2, 7, 0, 0x7C], [-1, 4, 0, 0xA], [0, 2, 1, 0x0], [2, 5, 0, 0x1A], [3, 6, 0, 0x3A], [4, 3, 4, 0x4], [20, 6, 1, 0x3B], [22, 4, 4, 0xB], [38, 4, 5, 0xC], [70, 5, 6, 0x1B], [134, 5, 7, 0x1C], [262, 6, 7, 0x3C], [390, 7, 8, 0x7D], [646, 6, 10, 0x3D], [-16, 9, 32, 0x1FE, 'lower'], [1670, 9, 32, 0x1FF], [2, 0x1]];
        break;

      case 9:
        lines = [[-31, 8, 4, 0xFC], [-15, 9, 2, 0x1FC], [-11, 8, 2, 0xFD], [-7, 9, 1, 0x1FD], [-5, 7, 1, 0x7C], [-3, 4, 1, 0xA], [-1, 3, 1, 0x2], [1, 3, 1, 0x3], [3, 5, 1, 0x1A], [5, 6, 1, 0x3A], [7, 3, 5, 0x4], [39, 6, 2, 0x3B], [43, 4, 5, 0xB], [75, 4, 6, 0xC], [139, 5, 7, 0x1B], [267, 5, 8, 0x1C], [523, 6, 8, 0x3C], [779, 7, 9, 0x7D], [1291, 6, 11, 0x3D], [-32, 9, 32, 0x1FE, 'lower'], [3339, 9, 32, 0x1FF], [2, 0x0]];
        break;

      case 10:
        lines = [[-21, 7, 4, 0x7A], [-5, 8, 0, 0xFC], [-4, 7, 0, 0x7B], [-3, 5, 0, 0x18], [-2, 2, 2, 0x0], [2, 5, 0, 0x19], [3, 6, 0, 0x36], [4, 7, 0, 0x7C], [5, 8, 0, 0xFD], [6, 2, 6, 0x1], [70, 5, 5, 0x1A], [102, 6, 5, 0x37], [134, 6, 6, 0x38], [198, 6, 7, 0x39], [326, 6, 8, 0x3A], [582, 6, 9, 0x3B], [1094, 6, 10, 0x3C], [2118, 7, 11, 0x7D], [-22, 8, 32, 0xFE, 'lower'], [4166, 8, 32, 0xFF], [2, 0x2]];
        break;

      case 11:
        lines = [[1, 1, 0, 0x0], [2, 2, 1, 0x2], [4, 4, 0, 0xC], [5, 4, 1, 0xD], [7, 5, 1, 0x1C], [9, 5, 2, 0x1D], [13, 6, 2, 0x3C], [17, 7, 2, 0x7A], [21, 7, 3, 0x7B], [29, 7, 4, 0x7C], [45, 7, 5, 0x7D], [77, 7, 6, 0x7E], [141, 7, 32, 0x7F]];
        break;

      case 12:
        lines = [[1, 1, 0, 0x0], [2, 2, 0, 0x2], [3, 3, 1, 0x6], [5, 5, 0, 0x1C], [6, 5, 1, 0x1D], [8, 6, 1, 0x3C], [10, 7, 0, 0x7A], [11, 7, 1, 0x7B], [13, 7, 2, 0x7C], [17, 7, 3, 0x7D], [25, 7, 4, 0x7E], [41, 8, 5, 0xFE], [73, 8, 32, 0xFF]];
        break;

      case 13:
        lines = [[1, 1, 0, 0x0], [2, 3, 0, 0x4], [3, 4, 0, 0xC], [4, 5, 0, 0x1C], [5, 4, 1, 0xD], [7, 3, 3, 0x5], [15, 6, 1, 0x3A], [17, 6, 2, 0x3B], [21, 6, 3, 0x3C], [29, 6, 4, 0x3D], [45, 6, 5, 0x3E], [77, 7, 6, 0x7E], [141, 7, 32, 0x7F]];
        break;

      case 14:
        lines = [[-2, 3, 0, 0x4], [-1, 3, 0, 0x5], [0, 1, 0, 0x0], [1, 3, 0, 0x6], [2, 3, 0, 0x7]];
        break;

      case 15:
        lines = [[-24, 7, 4, 0x7C], [-8, 6, 2, 0x3C], [-4, 5, 1, 0x1C], [-2, 4, 0, 0xC], [-1, 3, 0, 0x4], [0, 1, 0, 0x0], [1, 3, 0, 0x5], [2, 4, 0, 0xD], [3, 5, 1, 0x1D], [5, 6, 2, 0x3D], [9, 7, 4, 0x7D], [-25, 7, 32, 0x7E, 'lower'], [25, 7, 32, 0x7F]];
        break;

      default:
        throw new Jbig2Error("standard table B.".concat(number, " does not exist"));
    }

    var length = lines.length,
        i;

    for (i = 0; i < length; i++) {
      lines[i] = new HuffmanLine(lines[i]);
    }

    table = new HuffmanTable(lines, true);
    standardTablesCache[number] = table;
    return table;
  }

  function Reader(data, start, end) {
    this.data = data;
    this.start = start;
    this.end = end;
    this.position = start;
    this.shift = -1;
    this.currentByte = 0;
  }

  Reader.prototype = {
    readBit: function readBit() {
      if (this.shift < 0) {
        if (this.position >= this.end) {
          throw new Jbig2Error('end of data while reading bit');
        }

        this.currentByte = this.data[this.position++];
        this.shift = 7;
      }

      var bit = this.currentByte >> this.shift & 1;
      this.shift--;
      return bit;
    },
    readBits: function readBits(numBits) {
      var result = 0,
          i;

      for (i = numBits - 1; i >= 0; i--) {
        result |= this.readBit() << i;
      }

      return result;
    },
    byteAlign: function byteAlign() {
      this.shift = -1;
    },
    next: function next() {
      if (this.position >= this.end) {
        return -1;
      }

      return this.data[this.position++];
    }
  };

  function getCustomHuffmanTable(index, referredTo, customTables) {
    var currentIndex = 0,
        i,
        ii = referredTo.length,
        table;

    for (i = 0; i < ii; i++) {
      table = customTables[referredTo[i]];

      if (table) {
        if (index === currentIndex) {
          return table;
        }

        currentIndex++;
      }
    }

    throw new Jbig2Error('can\'t find custom Huffman table');
  }

  function getTextRegionHuffmanTables(textRegion, referredTo, customTables, numberOfSymbols, reader) {
    var codes = [],
        i,
        codeLength;

    for (i = 0; i <= 34; i++) {
      codeLength = reader.readBits(4);
      codes.push(new HuffmanLine([i, codeLength, 0, 0]));
    }

    var runCodesTable = new HuffmanTable(codes, false);
    codes.length = 0;

    for (i = 0; i < numberOfSymbols;) {
      codeLength = runCodesTable.decode(reader);

      if (codeLength >= 32) {
        var repeatedLength = void 0,
            numberOfRepeats = void 0,
            j = void 0;

        switch (codeLength) {
          case 32:
            if (i === 0) {
              throw new Jbig2Error('no previous value in symbol ID table');
            }

            numberOfRepeats = reader.readBits(2) + 3;
            repeatedLength = codes[i - 1].prefixLength;
            break;

          case 33:
            numberOfRepeats = reader.readBits(3) + 3;
            repeatedLength = 0;
            break;

          case 34:
            numberOfRepeats = reader.readBits(7) + 11;
            repeatedLength = 0;
            break;

          default:
            throw new Jbig2Error('invalid code length in symbol ID table');
        }

        for (j = 0; j < numberOfRepeats; j++) {
          codes.push(new HuffmanLine([i, repeatedLength, 0, 0]));
          i++;
        }
      } else {
        codes.push(new HuffmanLine([i, codeLength, 0, 0]));
        i++;
      }
    }

    reader.byteAlign();
    var symbolIDTable = new HuffmanTable(codes, false);
    var customIndex = 0,
        tableFirstS,
        tableDeltaS,
        tableDeltaT;

    switch (textRegion.huffmanFS) {
      case 0:
      case 1:
        tableFirstS = getStandardTable(textRegion.huffmanFS + 6);
        break;

      case 3:
        tableFirstS = getCustomHuffmanTable(customIndex, referredTo, customTables);
        customIndex++;
        break;

      default:
        throw new Jbig2Error('invalid Huffman FS selector');
    }

    switch (textRegion.huffmanDS) {
      case 0:
      case 1:
      case 2:
        tableDeltaS = getStandardTable(textRegion.huffmanDS + 8);
        break;

      case 3:
        tableDeltaS = getCustomHuffmanTable(customIndex, referredTo, customTables);
        customIndex++;
        break;

      default:
        throw new Jbig2Error('invalid Huffman DS selector');
    }

    switch (textRegion.huffmanDT) {
      case 0:
      case 1:
      case 2:
        tableDeltaT = getStandardTable(textRegion.huffmanDT + 11);
        break;

      case 3:
        tableDeltaT = getCustomHuffmanTable(customIndex, referredTo, customTables);
        customIndex++;
        break;

      default:
        throw new Jbig2Error('invalid Huffman DT selector');
    }

    if (textRegion.refinement) {
      throw new Jbig2Error('refinement with Huffman is not supported');
    }

    return {
      symbolIDTable: symbolIDTable,
      tableFirstS: tableFirstS,
      tableDeltaS: tableDeltaS,
      tableDeltaT: tableDeltaT
    };
  }

  function getSymbolDictionaryHuffmanTables(dictionary, referredTo, customTables) {
    var customIndex = 0,
        tableDeltaHeight,
        tableDeltaWidth;

    switch (dictionary.huffmanDHSelector) {
      case 0:
      case 1:
        tableDeltaHeight = getStandardTable(dictionary.huffmanDHSelector + 4);
        break;

      case 3:
        tableDeltaHeight = getCustomHuffmanTable(customIndex, referredTo, customTables);
        customIndex++;
        break;

      default:
        throw new Jbig2Error('invalid Huffman DH selector');
    }

    switch (dictionary.huffmanDWSelector) {
      case 0:
      case 1:
        tableDeltaWidth = getStandardTable(dictionary.huffmanDWSelector + 2);
        break;

      case 3:
        tableDeltaWidth = getCustomHuffmanTable(customIndex, referredTo, customTables);
        customIndex++;
        break;

      default:
        throw new Jbig2Error('invalid Huffman DW selector');
    }

    var tableBitmapSize, tableAggregateInstances;

    if (dictionary.bitmapSizeSelector) {
      tableBitmapSize = getCustomHuffmanTable(customIndex, referredTo, customTables);
      customIndex++;
    } else {
      tableBitmapSize = getStandardTable(1);
    }

    if (dictionary.aggregationInstancesSelector) {
      tableAggregateInstances = getCustomHuffmanTable(customIndex, referredTo, customTables);
    } else {
      tableAggregateInstances = getStandardTable(1);
    }

    return {
      tableDeltaHeight: tableDeltaHeight,
      tableDeltaWidth: tableDeltaWidth,
      tableBitmapSize: tableBitmapSize,
      tableAggregateInstances: tableAggregateInstances
    };
  }

  function readUncompressedBitmap(reader, width, height) {
    var bitmap = [],
        x,
        y,
        row;

    for (y = 0; y < height; y++) {
      row = new Uint8Array(width);
      bitmap.push(row);

      for (x = 0; x < width; x++) {
        row[x] = reader.readBit();
      }

      reader.byteAlign();
    }

    return bitmap;
  }

  function decodeMMRBitmap(input, width, height, endOfBlock) {
    var params = {
      K: -1,
      Columns: width,
      Rows: height,
      BlackIs1: true,
      EndOfBlock: endOfBlock
    };
    var decoder = new _ccitt.CCITTFaxDecoder(input, params);
    var bitmap = [],
        x,
        y,
        row,
        currentByte,
        shift,
        eof = false;

    for (y = 0; y < height; y++) {
      row = new Uint8Array(width);
      bitmap.push(row);
      shift = -1;

      for (x = 0; x < width; x++) {
        if (shift < 0) {
          currentByte = decoder.readNextChar();

          if (currentByte === -1) {
            currentByte = 0;
            eof = true;
          }

          shift = 7;
        }

        row[x] = currentByte >> shift & 1;
        shift--;
      }
    }

    if (endOfBlock && !eof) {
      var lookForEOFLimit = 5;

      for (var i = 0; i < lookForEOFLimit; i++) {
        if (decoder.readNextChar() === -1) {
          break;
        }
      }
    }

    return bitmap;
  }

  function Jbig2Image() {}

  Jbig2Image.prototype = {
    parseChunks: function parseChunks(chunks) {
      return parseJbig2Chunks(chunks);
    },
    parse: function parse(data) {
      var _parseJbig = parseJbig2(data),
          imgData = _parseJbig.imgData,
          width = _parseJbig.width,
          height = _parseJbig.height;

      this.width = width;
      this.height = height;
      return imgData;
    }
  };
  return Jbig2Image;
}();

exports.Jbig2Image = Jbig2Image;