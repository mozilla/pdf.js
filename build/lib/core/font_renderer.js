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
exports.FontRendererFactory = undefined;

var _util = require('../shared/util');

var _cff_parser = require('./cff_parser');

var _glyphlist = require('./glyphlist');

var _encodings = require('./encodings');

var _stream = require('./stream');

var FontRendererFactory = function FontRendererFactoryClosure() {
  function getLong(data, offset) {
    return data[offset] << 24 | data[offset + 1] << 16 | data[offset + 2] << 8 | data[offset + 3];
  }
  function getUshort(data, offset) {
    return data[offset] << 8 | data[offset + 1];
  }
  function parseCmap(data, start, end) {
    var offset = getUshort(data, start + 2) === 1 ? getLong(data, start + 8) : getLong(data, start + 16);
    var format = getUshort(data, start + offset);
    var ranges, p, i;
    if (format === 4) {
      getUshort(data, start + offset + 2);
      var segCount = getUshort(data, start + offset + 6) >> 1;
      p = start + offset + 14;
      ranges = [];
      for (i = 0; i < segCount; i++, p += 2) {
        ranges[i] = { end: getUshort(data, p) };
      }
      p += 2;
      for (i = 0; i < segCount; i++, p += 2) {
        ranges[i].start = getUshort(data, p);
      }
      for (i = 0; i < segCount; i++, p += 2) {
        ranges[i].idDelta = getUshort(data, p);
      }
      for (i = 0; i < segCount; i++, p += 2) {
        var idOffset = getUshort(data, p);
        if (idOffset === 0) {
          continue;
        }
        ranges[i].ids = [];
        for (var j = 0, jj = ranges[i].end - ranges[i].start + 1; j < jj; j++) {
          ranges[i].ids[j] = getUshort(data, p + idOffset);
          idOffset += 2;
        }
      }
      return ranges;
    } else if (format === 12) {
      getLong(data, start + offset + 4);
      var groups = getLong(data, start + offset + 12);
      p = start + offset + 16;
      ranges = [];
      for (i = 0; i < groups; i++) {
        ranges.push({
          start: getLong(data, p),
          end: getLong(data, p + 4),
          idDelta: getLong(data, p + 8) - getLong(data, p)
        });
        p += 12;
      }
      return ranges;
    }
    throw new _util.FormatError('unsupported cmap: ' + format);
  }
  function parseCff(data, start, end, seacAnalysisEnabled) {
    var properties = {};
    var parser = new _cff_parser.CFFParser(new _stream.Stream(data, start, end - start), properties, seacAnalysisEnabled);
    var cff = parser.parse();
    return {
      glyphs: cff.charStrings.objects,
      subrs: cff.topDict.privateDict && cff.topDict.privateDict.subrsIndex && cff.topDict.privateDict.subrsIndex.objects,
      gsubrs: cff.globalSubrIndex && cff.globalSubrIndex.objects
    };
  }
  function parseGlyfTable(glyf, loca, isGlyphLocationsLong) {
    var itemSize, itemDecode;
    if (isGlyphLocationsLong) {
      itemSize = 4;
      itemDecode = function fontItemDecodeLong(data, offset) {
        return data[offset] << 24 | data[offset + 1] << 16 | data[offset + 2] << 8 | data[offset + 3];
      };
    } else {
      itemSize = 2;
      itemDecode = function fontItemDecode(data, offset) {
        return data[offset] << 9 | data[offset + 1] << 1;
      };
    }
    var glyphs = [];
    var startOffset = itemDecode(loca, 0);
    for (var j = itemSize; j < loca.length; j += itemSize) {
      var endOffset = itemDecode(loca, j);
      glyphs.push(glyf.subarray(startOffset, endOffset));
      startOffset = endOffset;
    }
    return glyphs;
  }
  function lookupCmap(ranges, unicode) {
    var code = unicode.charCodeAt(0),
        gid = 0;
    var l = 0,
        r = ranges.length - 1;
    while (l < r) {
      var c = l + r + 1 >> 1;
      if (code < ranges[c].start) {
        r = c - 1;
      } else {
        l = c;
      }
    }
    if (ranges[l].start <= code && code <= ranges[l].end) {
      gid = ranges[l].idDelta + (ranges[l].ids ? ranges[l].ids[code - ranges[l].start] : code) & 0xFFFF;
    }
    return {
      charCode: code,
      glyphId: gid
    };
  }
  function compileGlyf(code, cmds, font) {
    function moveTo(x, y) {
      cmds.push({
        cmd: 'moveTo',
        args: [x, y]
      });
    }
    function lineTo(x, y) {
      cmds.push({
        cmd: 'lineTo',
        args: [x, y]
      });
    }
    function quadraticCurveTo(xa, ya, x, y) {
      cmds.push({
        cmd: 'quadraticCurveTo',
        args: [xa, ya, x, y]
      });
    }
    var i = 0;
    var numberOfContours = (code[i] << 24 | code[i + 1] << 16) >> 16;
    var flags;
    var x = 0,
        y = 0;
    i += 10;
    if (numberOfContours < 0) {
      do {
        flags = code[i] << 8 | code[i + 1];
        var glyphIndex = code[i + 2] << 8 | code[i + 3];
        i += 4;
        var arg1, arg2;
        if (flags & 0x01) {
          arg1 = (code[i] << 24 | code[i + 1] << 16) >> 16;
          arg2 = (code[i + 2] << 24 | code[i + 3] << 16) >> 16;
          i += 4;
        } else {
          arg1 = code[i++];
          arg2 = code[i++];
        }
        if (flags & 0x02) {
          x = arg1;
          y = arg2;
        } else {
          x = 0;
          y = 0;
        }
        var scaleX = 1,
            scaleY = 1,
            scale01 = 0,
            scale10 = 0;
        if (flags & 0x08) {
          scaleX = scaleY = (code[i] << 24 | code[i + 1] << 16) / 1073741824;
          i += 2;
        } else if (flags & 0x40) {
          scaleX = (code[i] << 24 | code[i + 1] << 16) / 1073741824;
          scaleY = (code[i + 2] << 24 | code[i + 3] << 16) / 1073741824;
          i += 4;
        } else if (flags & 0x80) {
          scaleX = (code[i] << 24 | code[i + 1] << 16) / 1073741824;
          scale01 = (code[i + 2] << 24 | code[i + 3] << 16) / 1073741824;
          scale10 = (code[i + 4] << 24 | code[i + 5] << 16) / 1073741824;
          scaleY = (code[i + 6] << 24 | code[i + 7] << 16) / 1073741824;
          i += 8;
        }
        var subglyph = font.glyphs[glyphIndex];
        if (subglyph) {
          cmds.push({ cmd: 'save' });
          cmds.push({
            cmd: 'transform',
            args: [scaleX, scale01, scale10, scaleY, x, y]
          });
          compileGlyf(subglyph, cmds, font);
          cmds.push({ cmd: 'restore' });
        }
      } while (flags & 0x20);
    } else {
      var endPtsOfContours = [];
      var j, jj;
      for (j = 0; j < numberOfContours; j++) {
        endPtsOfContours.push(code[i] << 8 | code[i + 1]);
        i += 2;
      }
      var instructionLength = code[i] << 8 | code[i + 1];
      i += 2 + instructionLength;
      var numberOfPoints = endPtsOfContours[endPtsOfContours.length - 1] + 1;
      var points = [];
      while (points.length < numberOfPoints) {
        flags = code[i++];
        var repeat = 1;
        if (flags & 0x08) {
          repeat += code[i++];
        }
        while (repeat-- > 0) {
          points.push({ flags: flags });
        }
      }
      for (j = 0; j < numberOfPoints; j++) {
        switch (points[j].flags & 0x12) {
          case 0x00:
            x += (code[i] << 24 | code[i + 1] << 16) >> 16;
            i += 2;
            break;
          case 0x02:
            x -= code[i++];
            break;
          case 0x12:
            x += code[i++];
            break;
        }
        points[j].x = x;
      }
      for (j = 0; j < numberOfPoints; j++) {
        switch (points[j].flags & 0x24) {
          case 0x00:
            y += (code[i] << 24 | code[i + 1] << 16) >> 16;
            i += 2;
            break;
          case 0x04:
            y -= code[i++];
            break;
          case 0x24:
            y += code[i++];
            break;
        }
        points[j].y = y;
      }
      var startPoint = 0;
      for (i = 0; i < numberOfContours; i++) {
        var endPoint = endPtsOfContours[i];
        var contour = points.slice(startPoint, endPoint + 1);
        if (contour[0].flags & 1) {
          contour.push(contour[0]);
        } else if (contour[contour.length - 1].flags & 1) {
          contour.unshift(contour[contour.length - 1]);
        } else {
          var p = {
            flags: 1,
            x: (contour[0].x + contour[contour.length - 1].x) / 2,
            y: (contour[0].y + contour[contour.length - 1].y) / 2
          };
          contour.unshift(p);
          contour.push(p);
        }
        moveTo(contour[0].x, contour[0].y);
        for (j = 1, jj = contour.length; j < jj; j++) {
          if (contour[j].flags & 1) {
            lineTo(contour[j].x, contour[j].y);
          } else if (contour[j + 1].flags & 1) {
            quadraticCurveTo(contour[j].x, contour[j].y, contour[j + 1].x, contour[j + 1].y);
            j++;
          } else {
            quadraticCurveTo(contour[j].x, contour[j].y, (contour[j].x + contour[j + 1].x) / 2, (contour[j].y + contour[j + 1].y) / 2);
          }
        }
        startPoint = endPoint + 1;
      }
    }
  }
  function compileCharString(code, cmds, font) {
    var stack = [];
    var x = 0,
        y = 0;
    var stems = 0;
    function moveTo(x, y) {
      cmds.push({
        cmd: 'moveTo',
        args: [x, y]
      });
    }
    function lineTo(x, y) {
      cmds.push({
        cmd: 'lineTo',
        args: [x, y]
      });
    }
    function bezierCurveTo(x1, y1, x2, y2, x, y) {
      cmds.push({
        cmd: 'bezierCurveTo',
        args: [x1, y1, x2, y2, x, y]
      });
    }
    function parse(code) {
      var i = 0;
      while (i < code.length) {
        var stackClean = false;
        var v = code[i++];
        var xa, xb, ya, yb, y1, y2, y3, n, subrCode;
        switch (v) {
          case 1:
            stems += stack.length >> 1;
            stackClean = true;
            break;
          case 3:
            stems += stack.length >> 1;
            stackClean = true;
            break;
          case 4:
            y += stack.pop();
            moveTo(x, y);
            stackClean = true;
            break;
          case 5:
            while (stack.length > 0) {
              x += stack.shift();
              y += stack.shift();
              lineTo(x, y);
            }
            break;
          case 6:
            while (stack.length > 0) {
              x += stack.shift();
              lineTo(x, y);
              if (stack.length === 0) {
                break;
              }
              y += stack.shift();
              lineTo(x, y);
            }
            break;
          case 7:
            while (stack.length > 0) {
              y += stack.shift();
              lineTo(x, y);
              if (stack.length === 0) {
                break;
              }
              x += stack.shift();
              lineTo(x, y);
            }
            break;
          case 8:
            while (stack.length > 0) {
              xa = x + stack.shift();
              ya = y + stack.shift();
              xb = xa + stack.shift();
              yb = ya + stack.shift();
              x = xb + stack.shift();
              y = yb + stack.shift();
              bezierCurveTo(xa, ya, xb, yb, x, y);
            }
            break;
          case 10:
            n = stack.pop() + font.subrsBias;
            subrCode = font.subrs[n];
            if (subrCode) {
              parse(subrCode);
            }
            break;
          case 11:
            return;
          case 12:
            v = code[i++];
            switch (v) {
              case 34:
                xa = x + stack.shift();
                xb = xa + stack.shift();
                y1 = y + stack.shift();
                x = xb + stack.shift();
                bezierCurveTo(xa, y, xb, y1, x, y1);
                xa = x + stack.shift();
                xb = xa + stack.shift();
                x = xb + stack.shift();
                bezierCurveTo(xa, y1, xb, y, x, y);
                break;
              case 35:
                xa = x + stack.shift();
                ya = y + stack.shift();
                xb = xa + stack.shift();
                yb = ya + stack.shift();
                x = xb + stack.shift();
                y = yb + stack.shift();
                bezierCurveTo(xa, ya, xb, yb, x, y);
                xa = x + stack.shift();
                ya = y + stack.shift();
                xb = xa + stack.shift();
                yb = ya + stack.shift();
                x = xb + stack.shift();
                y = yb + stack.shift();
                bezierCurveTo(xa, ya, xb, yb, x, y);
                stack.pop();
                break;
              case 36:
                xa = x + stack.shift();
                y1 = y + stack.shift();
                xb = xa + stack.shift();
                y2 = y1 + stack.shift();
                x = xb + stack.shift();
                bezierCurveTo(xa, y1, xb, y2, x, y2);
                xa = x + stack.shift();
                xb = xa + stack.shift();
                y3 = y2 + stack.shift();
                x = xb + stack.shift();
                bezierCurveTo(xa, y2, xb, y3, x, y);
                break;
              case 37:
                var x0 = x,
                    y0 = y;
                xa = x + stack.shift();
                ya = y + stack.shift();
                xb = xa + stack.shift();
                yb = ya + stack.shift();
                x = xb + stack.shift();
                y = yb + stack.shift();
                bezierCurveTo(xa, ya, xb, yb, x, y);
                xa = x + stack.shift();
                ya = y + stack.shift();
                xb = xa + stack.shift();
                yb = ya + stack.shift();
                x = xb;
                y = yb;
                if (Math.abs(x - x0) > Math.abs(y - y0)) {
                  x += stack.shift();
                } else {
                  y += stack.shift();
                }
                bezierCurveTo(xa, ya, xb, yb, x, y);
                break;
              default:
                throw new _util.FormatError('unknown operator: 12 ' + v);
            }
            break;
          case 14:
            if (stack.length >= 4) {
              var achar = stack.pop();
              var bchar = stack.pop();
              y = stack.pop();
              x = stack.pop();
              cmds.push({ cmd: 'save' });
              cmds.push({
                cmd: 'translate',
                args: [x, y]
              });
              var cmap = lookupCmap(font.cmap, String.fromCharCode(font.glyphNameMap[_encodings.StandardEncoding[achar]]));
              compileCharString(font.glyphs[cmap.glyphId], cmds, font);
              cmds.push({ cmd: 'restore' });
              cmap = lookupCmap(font.cmap, String.fromCharCode(font.glyphNameMap[_encodings.StandardEncoding[bchar]]));
              compileCharString(font.glyphs[cmap.glyphId], cmds, font);
            }
            return;
          case 18:
            stems += stack.length >> 1;
            stackClean = true;
            break;
          case 19:
            stems += stack.length >> 1;
            i += stems + 7 >> 3;
            stackClean = true;
            break;
          case 20:
            stems += stack.length >> 1;
            i += stems + 7 >> 3;
            stackClean = true;
            break;
          case 21:
            y += stack.pop();
            x += stack.pop();
            moveTo(x, y);
            stackClean = true;
            break;
          case 22:
            x += stack.pop();
            moveTo(x, y);
            stackClean = true;
            break;
          case 23:
            stems += stack.length >> 1;
            stackClean = true;
            break;
          case 24:
            while (stack.length > 2) {
              xa = x + stack.shift();
              ya = y + stack.shift();
              xb = xa + stack.shift();
              yb = ya + stack.shift();
              x = xb + stack.shift();
              y = yb + stack.shift();
              bezierCurveTo(xa, ya, xb, yb, x, y);
            }
            x += stack.shift();
            y += stack.shift();
            lineTo(x, y);
            break;
          case 25:
            while (stack.length > 6) {
              x += stack.shift();
              y += stack.shift();
              lineTo(x, y);
            }
            xa = x + stack.shift();
            ya = y + stack.shift();
            xb = xa + stack.shift();
            yb = ya + stack.shift();
            x = xb + stack.shift();
            y = yb + stack.shift();
            bezierCurveTo(xa, ya, xb, yb, x, y);
            break;
          case 26:
            if (stack.length % 2) {
              x += stack.shift();
            }
            while (stack.length > 0) {
              xa = x;
              ya = y + stack.shift();
              xb = xa + stack.shift();
              yb = ya + stack.shift();
              x = xb;
              y = yb + stack.shift();
              bezierCurveTo(xa, ya, xb, yb, x, y);
            }
            break;
          case 27:
            if (stack.length % 2) {
              y += stack.shift();
            }
            while (stack.length > 0) {
              xa = x + stack.shift();
              ya = y;
              xb = xa + stack.shift();
              yb = ya + stack.shift();
              x = xb + stack.shift();
              y = yb;
              bezierCurveTo(xa, ya, xb, yb, x, y);
            }
            break;
          case 28:
            stack.push((code[i] << 24 | code[i + 1] << 16) >> 16);
            i += 2;
            break;
          case 29:
            n = stack.pop() + font.gsubrsBias;
            subrCode = font.gsubrs[n];
            if (subrCode) {
              parse(subrCode);
            }
            break;
          case 30:
            while (stack.length > 0) {
              xa = x;
              ya = y + stack.shift();
              xb = xa + stack.shift();
              yb = ya + stack.shift();
              x = xb + stack.shift();
              y = yb + (stack.length === 1 ? stack.shift() : 0);
              bezierCurveTo(xa, ya, xb, yb, x, y);
              if (stack.length === 0) {
                break;
              }
              xa = x + stack.shift();
              ya = y;
              xb = xa + stack.shift();
              yb = ya + stack.shift();
              y = yb + stack.shift();
              x = xb + (stack.length === 1 ? stack.shift() : 0);
              bezierCurveTo(xa, ya, xb, yb, x, y);
            }
            break;
          case 31:
            while (stack.length > 0) {
              xa = x + stack.shift();
              ya = y;
              xb = xa + stack.shift();
              yb = ya + stack.shift();
              y = yb + stack.shift();
              x = xb + (stack.length === 1 ? stack.shift() : 0);
              bezierCurveTo(xa, ya, xb, yb, x, y);
              if (stack.length === 0) {
                break;
              }
              xa = x;
              ya = y + stack.shift();
              xb = xa + stack.shift();
              yb = ya + stack.shift();
              x = xb + stack.shift();
              y = yb + (stack.length === 1 ? stack.shift() : 0);
              bezierCurveTo(xa, ya, xb, yb, x, y);
            }
            break;
          default:
            if (v < 32) {
              throw new _util.FormatError('unknown operator: ' + v);
            }
            if (v < 247) {
              stack.push(v - 139);
            } else if (v < 251) {
              stack.push((v - 247) * 256 + code[i++] + 108);
            } else if (v < 255) {
              stack.push(-(v - 251) * 256 - code[i++] - 108);
            } else {
              stack.push((code[i] << 24 | code[i + 1] << 16 | code[i + 2] << 8 | code[i + 3]) / 65536);
              i += 4;
            }
            break;
        }
        if (stackClean) {
          stack.length = 0;
        }
      }
    }
    parse(code);
  }
  var noop = '';
  function CompiledFont(fontMatrix) {
    this.compiledGlyphs = Object.create(null);
    this.compiledCharCodeToGlyphId = Object.create(null);
    this.fontMatrix = fontMatrix;
  }
  CompiledFont.prototype = {
    getPathJs: function getPathJs(unicode) {
      var cmap = lookupCmap(this.cmap, unicode);
      var fn = this.compiledGlyphs[cmap.glyphId];
      if (!fn) {
        fn = this.compileGlyph(this.glyphs[cmap.glyphId]);
        this.compiledGlyphs[cmap.glyphId] = fn;
      }
      if (this.compiledCharCodeToGlyphId[cmap.charCode] === undefined) {
        this.compiledCharCodeToGlyphId[cmap.charCode] = cmap.glyphId;
      }
      return fn;
    },
    compileGlyph: function compileGlyph(code) {
      if (!code || code.length === 0 || code[0] === 14) {
        return noop;
      }
      var cmds = [];
      cmds.push({ cmd: 'save' });
      cmds.push({
        cmd: 'transform',
        args: this.fontMatrix.slice()
      });
      cmds.push({
        cmd: 'scale',
        args: ['size', '-size']
      });
      this.compileGlyphImpl(code, cmds);
      cmds.push({ cmd: 'restore' });
      return cmds;
    },
    compileGlyphImpl: function compileGlyphImpl() {
      throw new Error('Children classes should implement this.');
    },
    hasBuiltPath: function hasBuiltPath(unicode) {
      var cmap = lookupCmap(this.cmap, unicode);
      return this.compiledGlyphs[cmap.glyphId] !== undefined && this.compiledCharCodeToGlyphId[cmap.charCode] !== undefined;
    }
  };
  function TrueTypeCompiled(glyphs, cmap, fontMatrix) {
    fontMatrix = fontMatrix || [0.000488, 0, 0, 0.000488, 0, 0];
    CompiledFont.call(this, fontMatrix);
    this.glyphs = glyphs;
    this.cmap = cmap;
  }
  _util.Util.inherit(TrueTypeCompiled, CompiledFont, {
    compileGlyphImpl: function compileGlyphImpl(code, cmds) {
      compileGlyf(code, cmds, this);
    }
  });
  function Type2Compiled(cffInfo, cmap, fontMatrix, glyphNameMap) {
    fontMatrix = fontMatrix || [0.001, 0, 0, 0.001, 0, 0];
    CompiledFont.call(this, fontMatrix);
    this.glyphs = cffInfo.glyphs;
    this.gsubrs = cffInfo.gsubrs || [];
    this.subrs = cffInfo.subrs || [];
    this.cmap = cmap;
    this.glyphNameMap = glyphNameMap || (0, _glyphlist.getGlyphsUnicode)();
    this.gsubrsBias = this.gsubrs.length < 1240 ? 107 : this.gsubrs.length < 33900 ? 1131 : 32768;
    this.subrsBias = this.subrs.length < 1240 ? 107 : this.subrs.length < 33900 ? 1131 : 32768;
  }
  _util.Util.inherit(Type2Compiled, CompiledFont, {
    compileGlyphImpl: function compileGlyphImpl(code, cmds) {
      compileCharString(code, cmds, this);
    }
  });
  return {
    create: function FontRendererFactory_create(font, seacAnalysisEnabled) {
      var data = new Uint8Array(font.data);
      var cmap, glyf, loca, cff, indexToLocFormat, unitsPerEm;
      var numTables = getUshort(data, 4);
      for (var i = 0, p = 12; i < numTables; i++, p += 16) {
        var tag = (0, _util.bytesToString)(data.subarray(p, p + 4));
        var offset = getLong(data, p + 8);
        var length = getLong(data, p + 12);
        switch (tag) {
          case 'cmap':
            cmap = parseCmap(data, offset, offset + length);
            break;
          case 'glyf':
            glyf = data.subarray(offset, offset + length);
            break;
          case 'loca':
            loca = data.subarray(offset, offset + length);
            break;
          case 'head':
            unitsPerEm = getUshort(data, offset + 18);
            indexToLocFormat = getUshort(data, offset + 50);
            break;
          case 'CFF ':
            cff = parseCff(data, offset, offset + length, seacAnalysisEnabled);
            break;
        }
      }
      if (glyf) {
        var fontMatrix = !unitsPerEm ? font.fontMatrix : [1 / unitsPerEm, 0, 0, 1 / unitsPerEm, 0, 0];
        return new TrueTypeCompiled(parseGlyfTable(glyf, loca, indexToLocFormat), cmap, fontMatrix);
      }
      return new Type2Compiled(cff, cmap, font.fontMatrix, font.glyphNameMap);
    }
  };
}();
exports.FontRendererFactory = FontRendererFactory;