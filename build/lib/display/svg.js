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
exports.SVGGraphics = undefined;

var _util = require('../shared/util');

var _dom_utils = require('./dom_utils');

var SVGGraphics = function SVGGraphics() {
  throw new Error('Not implemented: SVGGraphics');
};
{
  var SVG_DEFAULTS = {
    fontStyle: 'normal',
    fontWeight: 'normal',
    fillColor: '#000000'
  };
  var convertImgDataToPng = function convertImgDataToPngClosure() {
    var PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    var CHUNK_WRAPPER_SIZE = 12;
    var crcTable = new Int32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var h = 0; h < 8; h++) {
        if (c & 1) {
          c = 0xedB88320 ^ c >> 1 & 0x7fffffff;
        } else {
          c = c >> 1 & 0x7fffffff;
        }
      }
      crcTable[i] = c;
    }
    function crc32(data, start, end) {
      var crc = -1;
      for (var i = start; i < end; i++) {
        var a = (crc ^ data[i]) & 0xff;
        var b = crcTable[a];
        crc = crc >>> 8 ^ b;
      }
      return crc ^ -1;
    }
    function writePngChunk(type, body, data, offset) {
      var p = offset;
      var len = body.length;
      data[p] = len >> 24 & 0xff;
      data[p + 1] = len >> 16 & 0xff;
      data[p + 2] = len >> 8 & 0xff;
      data[p + 3] = len & 0xff;
      p += 4;
      data[p] = type.charCodeAt(0) & 0xff;
      data[p + 1] = type.charCodeAt(1) & 0xff;
      data[p + 2] = type.charCodeAt(2) & 0xff;
      data[p + 3] = type.charCodeAt(3) & 0xff;
      p += 4;
      data.set(body, p);
      p += body.length;
      var crc = crc32(data, offset + 4, p);
      data[p] = crc >> 24 & 0xff;
      data[p + 1] = crc >> 16 & 0xff;
      data[p + 2] = crc >> 8 & 0xff;
      data[p + 3] = crc & 0xff;
    }
    function adler32(data, start, end) {
      var a = 1;
      var b = 0;
      for (var i = start; i < end; ++i) {
        a = (a + (data[i] & 0xff)) % 65521;
        b = (b + a) % 65521;
      }
      return b << 16 | a;
    }
    function deflateSync(literals) {
      if (!(0, _util.isNodeJS)()) {
        return deflateSyncUncompressed(literals);
      }
      try {
        var input;
        if (parseInt(process.versions.node) >= 8) {
          input = literals;
        } else {
          input = new Buffer(literals);
        }
        var output = require('zlib').deflateSync(input, { level: 9 });
        return output instanceof Uint8Array ? output : new Uint8Array(output);
      } catch (e) {
        (0, _util.warn)('Not compressing PNG because zlib.deflateSync is unavailable: ' + e);
      }
      return deflateSyncUncompressed(literals);
    }
    function deflateSyncUncompressed(literals) {
      var len = literals.length;
      var maxBlockLength = 0xFFFF;
      var deflateBlocks = Math.ceil(len / maxBlockLength);
      var idat = new Uint8Array(2 + len + deflateBlocks * 5 + 4);
      var pi = 0;
      idat[pi++] = 0x78;
      idat[pi++] = 0x9c;
      var pos = 0;
      while (len > maxBlockLength) {
        idat[pi++] = 0x00;
        idat[pi++] = 0xff;
        idat[pi++] = 0xff;
        idat[pi++] = 0x00;
        idat[pi++] = 0x00;
        idat.set(literals.subarray(pos, pos + maxBlockLength), pi);
        pi += maxBlockLength;
        pos += maxBlockLength;
        len -= maxBlockLength;
      }
      idat[pi++] = 0x01;
      idat[pi++] = len & 0xff;
      idat[pi++] = len >> 8 & 0xff;
      idat[pi++] = ~len & 0xffff & 0xff;
      idat[pi++] = (~len & 0xffff) >> 8 & 0xff;
      idat.set(literals.subarray(pos), pi);
      pi += literals.length - pos;
      var adler = adler32(literals, 0, literals.length);
      idat[pi++] = adler >> 24 & 0xff;
      idat[pi++] = adler >> 16 & 0xff;
      idat[pi++] = adler >> 8 & 0xff;
      idat[pi++] = adler & 0xff;
      return idat;
    }
    function encode(imgData, kind, forceDataSchema) {
      var width = imgData.width;
      var height = imgData.height;
      var bitDepth, colorType, lineSize;
      var bytes = imgData.data;
      switch (kind) {
        case _util.ImageKind.GRAYSCALE_1BPP:
          colorType = 0;
          bitDepth = 1;
          lineSize = width + 7 >> 3;
          break;
        case _util.ImageKind.RGB_24BPP:
          colorType = 2;
          bitDepth = 8;
          lineSize = width * 3;
          break;
        case _util.ImageKind.RGBA_32BPP:
          colorType = 6;
          bitDepth = 8;
          lineSize = width * 4;
          break;
        default:
          throw new Error('invalid format');
      }
      var literals = new Uint8Array((1 + lineSize) * height);
      var offsetLiterals = 0,
          offsetBytes = 0;
      var y, i;
      for (y = 0; y < height; ++y) {
        literals[offsetLiterals++] = 0;
        literals.set(bytes.subarray(offsetBytes, offsetBytes + lineSize), offsetLiterals);
        offsetBytes += lineSize;
        offsetLiterals += lineSize;
      }
      if (kind === _util.ImageKind.GRAYSCALE_1BPP) {
        offsetLiterals = 0;
        for (y = 0; y < height; y++) {
          offsetLiterals++;
          for (i = 0; i < lineSize; i++) {
            literals[offsetLiterals++] ^= 0xFF;
          }
        }
      }
      var ihdr = new Uint8Array([width >> 24 & 0xff, width >> 16 & 0xff, width >> 8 & 0xff, width & 0xff, height >> 24 & 0xff, height >> 16 & 0xff, height >> 8 & 0xff, height & 0xff, bitDepth, colorType, 0x00, 0x00, 0x00]);
      var idat = deflateSync(literals);
      var pngLength = PNG_HEADER.length + CHUNK_WRAPPER_SIZE * 3 + ihdr.length + idat.length;
      var data = new Uint8Array(pngLength);
      var offset = 0;
      data.set(PNG_HEADER, offset);
      offset += PNG_HEADER.length;
      writePngChunk('IHDR', ihdr, data, offset);
      offset += CHUNK_WRAPPER_SIZE + ihdr.length;
      writePngChunk('IDATA', idat, data, offset);
      offset += CHUNK_WRAPPER_SIZE + idat.length;
      writePngChunk('IEND', new Uint8Array(0), data, offset);
      return (0, _util.createObjectURL)(data, 'image/png', forceDataSchema);
    }
    return function convertImgDataToPng(imgData, forceDataSchema) {
      var kind = imgData.kind === undefined ? _util.ImageKind.GRAYSCALE_1BPP : imgData.kind;
      return encode(imgData, kind, forceDataSchema);
    };
  }();
  var SVGExtraState = function SVGExtraStateClosure() {
    function SVGExtraState() {
      this.fontSizeScale = 1;
      this.fontWeight = SVG_DEFAULTS.fontWeight;
      this.fontSize = 0;
      this.textMatrix = _util.IDENTITY_MATRIX;
      this.fontMatrix = _util.FONT_IDENTITY_MATRIX;
      this.leading = 0;
      this.x = 0;
      this.y = 0;
      this.lineX = 0;
      this.lineY = 0;
      this.charSpacing = 0;
      this.wordSpacing = 0;
      this.textHScale = 1;
      this.textRise = 0;
      this.fillColor = SVG_DEFAULTS.fillColor;
      this.strokeColor = '#000000';
      this.fillAlpha = 1;
      this.strokeAlpha = 1;
      this.lineWidth = 1;
      this.lineJoin = '';
      this.lineCap = '';
      this.miterLimit = 0;
      this.dashArray = [];
      this.dashPhase = 0;
      this.dependencies = [];
      this.activeClipUrl = null;
      this.clipGroup = null;
      this.maskId = '';
    }
    SVGExtraState.prototype = {
      clone: function SVGExtraState_clone() {
        return Object.create(this);
      },
      setCurrentPoint: function SVGExtraState_setCurrentPoint(x, y) {
        this.x = x;
        this.y = y;
      }
    };
    return SVGExtraState;
  }();
  exports.SVGGraphics = SVGGraphics = function SVGGraphicsClosure() {
    function opListToTree(opList) {
      var opTree = [];
      var tmp = [];
      var opListLen = opList.length;
      for (var x = 0; x < opListLen; x++) {
        if (opList[x].fn === 'save') {
          opTree.push({
            'fnId': 92,
            'fn': 'group',
            'items': []
          });
          tmp.push(opTree);
          opTree = opTree[opTree.length - 1].items;
          continue;
        }
        if (opList[x].fn === 'restore') {
          opTree = tmp.pop();
        } else {
          opTree.push(opList[x]);
        }
      }
      return opTree;
    }
    function pf(value) {
      if (Number.isInteger(value)) {
        return value.toString();
      }
      var s = value.toFixed(10);
      var i = s.length - 1;
      if (s[i] !== '0') {
        return s;
      }
      do {
        i--;
      } while (s[i] === '0');
      return s.substr(0, s[i] === '.' ? i : i + 1);
    }
    function pm(m) {
      if (m[4] === 0 && m[5] === 0) {
        if (m[1] === 0 && m[2] === 0) {
          if (m[0] === 1 && m[3] === 1) {
            return '';
          }
          return 'scale(' + pf(m[0]) + ' ' + pf(m[3]) + ')';
        }
        if (m[0] === m[3] && m[1] === -m[2]) {
          var a = Math.acos(m[0]) * 180 / Math.PI;
          return 'rotate(' + pf(a) + ')';
        }
      } else {
        if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1) {
          return 'translate(' + pf(m[4]) + ' ' + pf(m[5]) + ')';
        }
      }
      return 'matrix(' + pf(m[0]) + ' ' + pf(m[1]) + ' ' + pf(m[2]) + ' ' + pf(m[3]) + ' ' + pf(m[4]) + ' ' + pf(m[5]) + ')';
    }
    function SVGGraphics(commonObjs, objs, forceDataSchema) {
      this.svgFactory = new _dom_utils.DOMSVGFactory();
      this.current = new SVGExtraState();
      this.transformMatrix = _util.IDENTITY_MATRIX;
      this.transformStack = [];
      this.extraStack = [];
      this.commonObjs = commonObjs;
      this.objs = objs;
      this.pendingClip = null;
      this.pendingEOFill = false;
      this.embedFonts = false;
      this.embeddedFonts = Object.create(null);
      this.cssStyle = null;
      this.forceDataSchema = !!forceDataSchema;
    }
    var XML_NS = 'http://www.w3.org/XML/1998/namespace';
    var XLINK_NS = 'http://www.w3.org/1999/xlink';
    var LINE_CAP_STYLES = ['butt', 'round', 'square'];
    var LINE_JOIN_STYLES = ['miter', 'round', 'bevel'];
    var clipCount = 0;
    var maskCount = 0;
    SVGGraphics.prototype = {
      save: function SVGGraphics_save() {
        this.transformStack.push(this.transformMatrix);
        var old = this.current;
        this.extraStack.push(old);
        this.current = old.clone();
      },
      restore: function SVGGraphics_restore() {
        this.transformMatrix = this.transformStack.pop();
        this.current = this.extraStack.pop();
        this.pendingClip = null;
        this.tgrp = null;
      },
      group: function SVGGraphics_group(items) {
        this.save();
        this.executeOpTree(items);
        this.restore();
      },
      loadDependencies: function SVGGraphics_loadDependencies(operatorList) {
        var _this = this;

        var fnArray = operatorList.fnArray;
        var fnArrayLen = fnArray.length;
        var argsArray = operatorList.argsArray;
        for (var i = 0; i < fnArrayLen; i++) {
          if (_util.OPS.dependency === fnArray[i]) {
            var deps = argsArray[i];
            for (var n = 0, nn = deps.length; n < nn; n++) {
              var obj = deps[n];
              var common = obj.substring(0, 2) === 'g_';
              var promise;
              if (common) {
                promise = new Promise(function (resolve) {
                  _this.commonObjs.get(obj, resolve);
                });
              } else {
                promise = new Promise(function (resolve) {
                  _this.objs.get(obj, resolve);
                });
              }
              this.current.dependencies.push(promise);
            }
          }
        }
        return Promise.all(this.current.dependencies);
      },
      transform: function SVGGraphics_transform(a, b, c, d, e, f) {
        var transformMatrix = [a, b, c, d, e, f];
        this.transformMatrix = _util.Util.transform(this.transformMatrix, transformMatrix);
        this.tgrp = null;
      },
      getSVG: function SVGGraphics_getSVG(operatorList, viewport) {
        var _this2 = this;

        this.viewport = viewport;
        var svgElement = this._initialize(viewport);
        return this.loadDependencies(operatorList).then(function () {
          _this2.transformMatrix = _util.IDENTITY_MATRIX;
          var opTree = _this2.convertOpList(operatorList);
          _this2.executeOpTree(opTree);
          return svgElement;
        });
      },
      convertOpList: function SVGGraphics_convertOpList(operatorList) {
        var argsArray = operatorList.argsArray;
        var fnArray = operatorList.fnArray;
        var fnArrayLen = fnArray.length;
        var REVOPS = [];
        var opList = [];
        for (var op in _util.OPS) {
          REVOPS[_util.OPS[op]] = op;
        }
        for (var x = 0; x < fnArrayLen; x++) {
          var fnId = fnArray[x];
          opList.push({
            'fnId': fnId,
            'fn': REVOPS[fnId],
            'args': argsArray[x]
          });
        }
        return opListToTree(opList);
      },
      executeOpTree: function SVGGraphics_executeOpTree(opTree) {
        var opTreeLen = opTree.length;
        for (var x = 0; x < opTreeLen; x++) {
          var fn = opTree[x].fn;
          var fnId = opTree[x].fnId;
          var args = opTree[x].args;
          switch (fnId | 0) {
            case _util.OPS.beginText:
              this.beginText();
              break;
            case _util.OPS.setLeading:
              this.setLeading(args);
              break;
            case _util.OPS.setLeadingMoveText:
              this.setLeadingMoveText(args[0], args[1]);
              break;
            case _util.OPS.setFont:
              this.setFont(args);
              break;
            case _util.OPS.showText:
              this.showText(args[0]);
              break;
            case _util.OPS.showSpacedText:
              this.showText(args[0]);
              break;
            case _util.OPS.endText:
              this.endText();
              break;
            case _util.OPS.moveText:
              this.moveText(args[0], args[1]);
              break;
            case _util.OPS.setCharSpacing:
              this.setCharSpacing(args[0]);
              break;
            case _util.OPS.setWordSpacing:
              this.setWordSpacing(args[0]);
              break;
            case _util.OPS.setHScale:
              this.setHScale(args[0]);
              break;
            case _util.OPS.setTextMatrix:
              this.setTextMatrix(args[0], args[1], args[2], args[3], args[4], args[5]);
              break;
            case _util.OPS.setTextRise:
              this.setTextRise(args[0]);
              break;
            case _util.OPS.setLineWidth:
              this.setLineWidth(args[0]);
              break;
            case _util.OPS.setLineJoin:
              this.setLineJoin(args[0]);
              break;
            case _util.OPS.setLineCap:
              this.setLineCap(args[0]);
              break;
            case _util.OPS.setMiterLimit:
              this.setMiterLimit(args[0]);
              break;
            case _util.OPS.setFillRGBColor:
              this.setFillRGBColor(args[0], args[1], args[2]);
              break;
            case _util.OPS.setStrokeRGBColor:
              this.setStrokeRGBColor(args[0], args[1], args[2]);
              break;
            case _util.OPS.setDash:
              this.setDash(args[0], args[1]);
              break;
            case _util.OPS.setGState:
              this.setGState(args[0]);
              break;
            case _util.OPS.fill:
              this.fill();
              break;
            case _util.OPS.eoFill:
              this.eoFill();
              break;
            case _util.OPS.stroke:
              this.stroke();
              break;
            case _util.OPS.fillStroke:
              this.fillStroke();
              break;
            case _util.OPS.eoFillStroke:
              this.eoFillStroke();
              break;
            case _util.OPS.clip:
              this.clip('nonzero');
              break;
            case _util.OPS.eoClip:
              this.clip('evenodd');
              break;
            case _util.OPS.paintSolidColorImageMask:
              this.paintSolidColorImageMask();
              break;
            case _util.OPS.paintJpegXObject:
              this.paintJpegXObject(args[0], args[1], args[2]);
              break;
            case _util.OPS.paintImageXObject:
              this.paintImageXObject(args[0]);
              break;
            case _util.OPS.paintInlineImageXObject:
              this.paintInlineImageXObject(args[0]);
              break;
            case _util.OPS.paintImageMaskXObject:
              this.paintImageMaskXObject(args[0]);
              break;
            case _util.OPS.paintFormXObjectBegin:
              this.paintFormXObjectBegin(args[0], args[1]);
              break;
            case _util.OPS.paintFormXObjectEnd:
              this.paintFormXObjectEnd();
              break;
            case _util.OPS.closePath:
              this.closePath();
              break;
            case _util.OPS.closeStroke:
              this.closeStroke();
              break;
            case _util.OPS.closeFillStroke:
              this.closeFillStroke();
              break;
            case _util.OPS.nextLine:
              this.nextLine();
              break;
            case _util.OPS.transform:
              this.transform(args[0], args[1], args[2], args[3], args[4], args[5]);
              break;
            case _util.OPS.constructPath:
              this.constructPath(args[0], args[1]);
              break;
            case _util.OPS.endPath:
              this.endPath();
              break;
            case 92:
              this.group(opTree[x].items);
              break;
            default:
              (0, _util.warn)('Unimplemented operator ' + fn);
              break;
          }
        }
      },
      setWordSpacing: function SVGGraphics_setWordSpacing(wordSpacing) {
        this.current.wordSpacing = wordSpacing;
      },
      setCharSpacing: function SVGGraphics_setCharSpacing(charSpacing) {
        this.current.charSpacing = charSpacing;
      },
      nextLine: function SVGGraphics_nextLine() {
        this.moveText(0, this.current.leading);
      },
      setTextMatrix: function SVGGraphics_setTextMatrix(a, b, c, d, e, f) {
        var current = this.current;
        this.current.textMatrix = this.current.lineMatrix = [a, b, c, d, e, f];
        this.current.x = this.current.lineX = 0;
        this.current.y = this.current.lineY = 0;
        current.xcoords = [];
        current.tspan = this.svgFactory.createElement('svg:tspan');
        current.tspan.setAttributeNS(null, 'font-family', current.fontFamily);
        current.tspan.setAttributeNS(null, 'font-size', pf(current.fontSize) + 'px');
        current.tspan.setAttributeNS(null, 'y', pf(-current.y));
        current.txtElement = this.svgFactory.createElement('svg:text');
        current.txtElement.appendChild(current.tspan);
      },
      beginText: function SVGGraphics_beginText() {
        this.current.x = this.current.lineX = 0;
        this.current.y = this.current.lineY = 0;
        this.current.textMatrix = _util.IDENTITY_MATRIX;
        this.current.lineMatrix = _util.IDENTITY_MATRIX;
        this.current.tspan = this.svgFactory.createElement('svg:tspan');
        this.current.txtElement = this.svgFactory.createElement('svg:text');
        this.current.txtgrp = this.svgFactory.createElement('svg:g');
        this.current.xcoords = [];
      },
      moveText: function SVGGraphics_moveText(x, y) {
        var current = this.current;
        this.current.x = this.current.lineX += x;
        this.current.y = this.current.lineY += y;
        current.xcoords = [];
        current.tspan = this.svgFactory.createElement('svg:tspan');
        current.tspan.setAttributeNS(null, 'font-family', current.fontFamily);
        current.tspan.setAttributeNS(null, 'font-size', pf(current.fontSize) + 'px');
        current.tspan.setAttributeNS(null, 'y', pf(-current.y));
      },
      showText: function SVGGraphics_showText(glyphs) {
        var current = this.current;
        var font = current.font;
        var fontSize = current.fontSize;
        if (fontSize === 0) {
          return;
        }
        var charSpacing = current.charSpacing;
        var wordSpacing = current.wordSpacing;
        var fontDirection = current.fontDirection;
        var textHScale = current.textHScale * fontDirection;
        var glyphsLength = glyphs.length;
        var vertical = font.vertical;
        var widthAdvanceScale = fontSize * current.fontMatrix[0];
        var x = 0,
            i;
        for (i = 0; i < glyphsLength; ++i) {
          var glyph = glyphs[i];
          if (glyph === null) {
            x += fontDirection * wordSpacing;
            continue;
          } else if ((0, _util.isNum)(glyph)) {
            x += -glyph * fontSize * 0.001;
            continue;
          }
          var width = glyph.width;
          var character = glyph.fontChar;
          var spacing = (glyph.isSpace ? wordSpacing : 0) + charSpacing;
          var charWidth = width * widthAdvanceScale + spacing * fontDirection;
          if (!glyph.isInFont && !font.missingFile) {
            x += charWidth;
            continue;
          }
          current.xcoords.push(current.x + x * textHScale);
          current.tspan.textContent += character;
          x += charWidth;
        }
        if (vertical) {
          current.y -= x * textHScale;
        } else {
          current.x += x * textHScale;
        }
        current.tspan.setAttributeNS(null, 'x', current.xcoords.map(pf).join(' '));
        current.tspan.setAttributeNS(null, 'y', pf(-current.y));
        current.tspan.setAttributeNS(null, 'font-family', current.fontFamily);
        current.tspan.setAttributeNS(null, 'font-size', pf(current.fontSize) + 'px');
        if (current.fontStyle !== SVG_DEFAULTS.fontStyle) {
          current.tspan.setAttributeNS(null, 'font-style', current.fontStyle);
        }
        if (current.fontWeight !== SVG_DEFAULTS.fontWeight) {
          current.tspan.setAttributeNS(null, 'font-weight', current.fontWeight);
        }
        if (current.fillColor !== SVG_DEFAULTS.fillColor) {
          current.tspan.setAttributeNS(null, 'fill', current.fillColor);
        }
        var textMatrix = current.textMatrix;
        if (current.textRise !== 0) {
          textMatrix = textMatrix.slice();
          textMatrix[5] += current.textRise;
        }
        current.txtElement.setAttributeNS(null, 'transform', pm(textMatrix) + ' scale(1, -1)');
        current.txtElement.setAttributeNS(XML_NS, 'xml:space', 'preserve');
        current.txtElement.appendChild(current.tspan);
        current.txtgrp.appendChild(current.txtElement);
        this._ensureTransformGroup().appendChild(current.txtElement);
      },
      setLeadingMoveText: function SVGGraphics_setLeadingMoveText(x, y) {
        this.setLeading(-y);
        this.moveText(x, y);
      },
      addFontStyle: function SVGGraphics_addFontStyle(fontObj) {
        if (!this.cssStyle) {
          this.cssStyle = this.svgFactory.createElement('svg:style');
          this.cssStyle.setAttributeNS(null, 'type', 'text/css');
          this.defs.appendChild(this.cssStyle);
        }
        var url = (0, _util.createObjectURL)(fontObj.data, fontObj.mimetype, this.forceDataSchema);
        this.cssStyle.textContent += '@font-face { font-family: "' + fontObj.loadedName + '";' + ' src: url(' + url + '); }\n';
      },
      setFont: function SVGGraphics_setFont(details) {
        var current = this.current;
        var fontObj = this.commonObjs.get(details[0]);
        var size = details[1];
        this.current.font = fontObj;
        if (this.embedFonts && fontObj.data && !this.embeddedFonts[fontObj.loadedName]) {
          this.addFontStyle(fontObj);
          this.embeddedFonts[fontObj.loadedName] = fontObj;
        }
        current.fontMatrix = fontObj.fontMatrix ? fontObj.fontMatrix : _util.FONT_IDENTITY_MATRIX;
        var bold = fontObj.black ? fontObj.bold ? 'bolder' : 'bold' : fontObj.bold ? 'bold' : 'normal';
        var italic = fontObj.italic ? 'italic' : 'normal';
        if (size < 0) {
          size = -size;
          current.fontDirection = -1;
        } else {
          current.fontDirection = 1;
        }
        current.fontSize = size;
        current.fontFamily = fontObj.loadedName;
        current.fontWeight = bold;
        current.fontStyle = italic;
        current.tspan = this.svgFactory.createElement('svg:tspan');
        current.tspan.setAttributeNS(null, 'y', pf(-current.y));
        current.xcoords = [];
      },
      endText: function SVGGraphics_endText() {},
      setLineWidth: function SVGGraphics_setLineWidth(width) {
        this.current.lineWidth = width;
      },
      setLineCap: function SVGGraphics_setLineCap(style) {
        this.current.lineCap = LINE_CAP_STYLES[style];
      },
      setLineJoin: function SVGGraphics_setLineJoin(style) {
        this.current.lineJoin = LINE_JOIN_STYLES[style];
      },
      setMiterLimit: function SVGGraphics_setMiterLimit(limit) {
        this.current.miterLimit = limit;
      },
      setStrokeAlpha: function SVGGraphics_setStrokeAlpha(strokeAlpha) {
        this.current.strokeAlpha = strokeAlpha;
      },
      setStrokeRGBColor: function SVGGraphics_setStrokeRGBColor(r, g, b) {
        var color = _util.Util.makeCssRgb(r, g, b);
        this.current.strokeColor = color;
      },
      setFillAlpha: function SVGGraphics_setFillAlpha(fillAlpha) {
        this.current.fillAlpha = fillAlpha;
      },
      setFillRGBColor: function SVGGraphics_setFillRGBColor(r, g, b) {
        var color = _util.Util.makeCssRgb(r, g, b);
        this.current.fillColor = color;
        this.current.tspan = this.svgFactory.createElement('svg:tspan');
        this.current.xcoords = [];
      },
      setDash: function SVGGraphics_setDash(dashArray, dashPhase) {
        this.current.dashArray = dashArray;
        this.current.dashPhase = dashPhase;
      },
      constructPath: function SVGGraphics_constructPath(ops, args) {
        var current = this.current;
        var x = current.x,
            y = current.y;
        current.path = this.svgFactory.createElement('svg:path');
        var d = [];
        var opLength = ops.length;
        for (var i = 0, j = 0; i < opLength; i++) {
          switch (ops[i] | 0) {
            case _util.OPS.rectangle:
              x = args[j++];
              y = args[j++];
              var width = args[j++];
              var height = args[j++];
              var xw = x + width;
              var yh = y + height;
              d.push('M', pf(x), pf(y), 'L', pf(xw), pf(y), 'L', pf(xw), pf(yh), 'L', pf(x), pf(yh), 'Z');
              break;
            case _util.OPS.moveTo:
              x = args[j++];
              y = args[j++];
              d.push('M', pf(x), pf(y));
              break;
            case _util.OPS.lineTo:
              x = args[j++];
              y = args[j++];
              d.push('L', pf(x), pf(y));
              break;
            case _util.OPS.curveTo:
              x = args[j + 4];
              y = args[j + 5];
              d.push('C', pf(args[j]), pf(args[j + 1]), pf(args[j + 2]), pf(args[j + 3]), pf(x), pf(y));
              j += 6;
              break;
            case _util.OPS.curveTo2:
              x = args[j + 2];
              y = args[j + 3];
              d.push('C', pf(x), pf(y), pf(args[j]), pf(args[j + 1]), pf(args[j + 2]), pf(args[j + 3]));
              j += 4;
              break;
            case _util.OPS.curveTo3:
              x = args[j + 2];
              y = args[j + 3];
              d.push('C', pf(args[j]), pf(args[j + 1]), pf(x), pf(y), pf(x), pf(y));
              j += 4;
              break;
            case _util.OPS.closePath:
              d.push('Z');
              break;
          }
        }
        current.path.setAttributeNS(null, 'd', d.join(' '));
        current.path.setAttributeNS(null, 'fill', 'none');
        this._ensureTransformGroup().appendChild(current.path);
        current.element = current.path;
        current.setCurrentPoint(x, y);
      },
      endPath: function SVGGraphics_endPath() {
        if (!this.pendingClip) {
          return;
        }
        var current = this.current;
        var clipId = 'clippath' + clipCount;
        clipCount++;
        var clipPath = this.svgFactory.createElement('svg:clipPath');
        clipPath.setAttributeNS(null, 'id', clipId);
        clipPath.setAttributeNS(null, 'transform', pm(this.transformMatrix));
        var clipElement = current.element.cloneNode();
        if (this.pendingClip === 'evenodd') {
          clipElement.setAttributeNS(null, 'clip-rule', 'evenodd');
        } else {
          clipElement.setAttributeNS(null, 'clip-rule', 'nonzero');
        }
        this.pendingClip = null;
        clipPath.appendChild(clipElement);
        this.defs.appendChild(clipPath);
        if (current.activeClipUrl) {
          current.clipGroup = null;
          this.extraStack.forEach(function (prev) {
            prev.clipGroup = null;
          });
        }
        current.activeClipUrl = 'url(#' + clipId + ')';
        this.tgrp = null;
      },
      clip: function SVGGraphics_clip(type) {
        this.pendingClip = type;
      },
      closePath: function SVGGraphics_closePath() {
        var current = this.current;
        var d = current.path.getAttributeNS(null, 'd');
        d += 'Z';
        current.path.setAttributeNS(null, 'd', d);
      },
      setLeading: function SVGGraphics_setLeading(leading) {
        this.current.leading = -leading;
      },
      setTextRise: function SVGGraphics_setTextRise(textRise) {
        this.current.textRise = textRise;
      },
      setHScale: function SVGGraphics_setHScale(scale) {
        this.current.textHScale = scale / 100;
      },
      setGState: function SVGGraphics_setGState(states) {
        for (var i = 0, ii = states.length; i < ii; i++) {
          var state = states[i];
          var key = state[0];
          var value = state[1];
          switch (key) {
            case 'LW':
              this.setLineWidth(value);
              break;
            case 'LC':
              this.setLineCap(value);
              break;
            case 'LJ':
              this.setLineJoin(value);
              break;
            case 'ML':
              this.setMiterLimit(value);
              break;
            case 'D':
              this.setDash(value[0], value[1]);
              break;
            case 'Font':
              this.setFont(value);
              break;
            case 'CA':
              this.setStrokeAlpha(value);
              break;
            case 'ca':
              this.setFillAlpha(value);
              break;
            default:
              (0, _util.warn)('Unimplemented graphic state ' + key);
              break;
          }
        }
      },
      fill: function SVGGraphics_fill() {
        var current = this.current;
        current.element.setAttributeNS(null, 'fill', current.fillColor);
        current.element.setAttributeNS(null, 'fill-opacity', current.fillAlpha);
      },
      stroke: function SVGGraphics_stroke() {
        var current = this.current;
        current.element.setAttributeNS(null, 'stroke', current.strokeColor);
        current.element.setAttributeNS(null, 'stroke-opacity', current.strokeAlpha);
        current.element.setAttributeNS(null, 'stroke-miterlimit', pf(current.miterLimit));
        current.element.setAttributeNS(null, 'stroke-linecap', current.lineCap);
        current.element.setAttributeNS(null, 'stroke-linejoin', current.lineJoin);
        current.element.setAttributeNS(null, 'stroke-width', pf(current.lineWidth) + 'px');
        current.element.setAttributeNS(null, 'stroke-dasharray', current.dashArray.map(pf).join(' '));
        current.element.setAttributeNS(null, 'stroke-dashoffset', pf(current.dashPhase) + 'px');
        current.element.setAttributeNS(null, 'fill', 'none');
      },
      eoFill: function SVGGraphics_eoFill() {
        this.current.element.setAttributeNS(null, 'fill-rule', 'evenodd');
        this.fill();
      },
      fillStroke: function SVGGraphics_fillStroke() {
        this.stroke();
        this.fill();
      },
      eoFillStroke: function SVGGraphics_eoFillStroke() {
        this.current.element.setAttributeNS(null, 'fill-rule', 'evenodd');
        this.fillStroke();
      },
      closeStroke: function SVGGraphics_closeStroke() {
        this.closePath();
        this.stroke();
      },
      closeFillStroke: function SVGGraphics_closeFillStroke() {
        this.closePath();
        this.fillStroke();
      },
      paintSolidColorImageMask: function SVGGraphics_paintSolidColorImageMask() {
        var current = this.current;
        var rect = this.svgFactory.createElement('svg:rect');
        rect.setAttributeNS(null, 'x', '0');
        rect.setAttributeNS(null, 'y', '0');
        rect.setAttributeNS(null, 'width', '1px');
        rect.setAttributeNS(null, 'height', '1px');
        rect.setAttributeNS(null, 'fill', current.fillColor);
        this._ensureTransformGroup().appendChild(rect);
      },
      paintJpegXObject: function SVGGraphics_paintJpegXObject(objId, w, h) {
        var imgObj = this.objs.get(objId);
        var imgEl = this.svgFactory.createElement('svg:image');
        imgEl.setAttributeNS(XLINK_NS, 'xlink:href', imgObj.src);
        imgEl.setAttributeNS(null, 'width', pf(w));
        imgEl.setAttributeNS(null, 'height', pf(h));
        imgEl.setAttributeNS(null, 'x', '0');
        imgEl.setAttributeNS(null, 'y', pf(-h));
        imgEl.setAttributeNS(null, 'transform', 'scale(' + pf(1 / w) + ' ' + pf(-1 / h) + ')');
        this._ensureTransformGroup().appendChild(imgEl);
      },
      paintImageXObject: function SVGGraphics_paintImageXObject(objId) {
        var imgData = this.objs.get(objId);
        if (!imgData) {
          (0, _util.warn)('Dependent image isn\'t ready yet');
          return;
        }
        this.paintInlineImageXObject(imgData);
      },
      paintInlineImageXObject: function SVGGraphics_paintInlineImageXObject(imgData, mask) {
        var width = imgData.width;
        var height = imgData.height;
        var imgSrc = convertImgDataToPng(imgData, this.forceDataSchema);
        var cliprect = this.svgFactory.createElement('svg:rect');
        cliprect.setAttributeNS(null, 'x', '0');
        cliprect.setAttributeNS(null, 'y', '0');
        cliprect.setAttributeNS(null, 'width', pf(width));
        cliprect.setAttributeNS(null, 'height', pf(height));
        this.current.element = cliprect;
        this.clip('nonzero');
        var imgEl = this.svgFactory.createElement('svg:image');
        imgEl.setAttributeNS(XLINK_NS, 'xlink:href', imgSrc);
        imgEl.setAttributeNS(null, 'x', '0');
        imgEl.setAttributeNS(null, 'y', pf(-height));
        imgEl.setAttributeNS(null, 'width', pf(width) + 'px');
        imgEl.setAttributeNS(null, 'height', pf(height) + 'px');
        imgEl.setAttributeNS(null, 'transform', 'scale(' + pf(1 / width) + ' ' + pf(-1 / height) + ')');
        if (mask) {
          mask.appendChild(imgEl);
        } else {
          this._ensureTransformGroup().appendChild(imgEl);
        }
      },
      paintImageMaskXObject: function SVGGraphics_paintImageMaskXObject(imgData) {
        var current = this.current;
        var width = imgData.width;
        var height = imgData.height;
        var fillColor = current.fillColor;
        current.maskId = 'mask' + maskCount++;
        var mask = this.svgFactory.createElement('svg:mask');
        mask.setAttributeNS(null, 'id', current.maskId);
        var rect = this.svgFactory.createElement('svg:rect');
        rect.setAttributeNS(null, 'x', '0');
        rect.setAttributeNS(null, 'y', '0');
        rect.setAttributeNS(null, 'width', pf(width));
        rect.setAttributeNS(null, 'height', pf(height));
        rect.setAttributeNS(null, 'fill', fillColor);
        rect.setAttributeNS(null, 'mask', 'url(#' + current.maskId + ')');
        this.defs.appendChild(mask);
        this._ensureTransformGroup().appendChild(rect);
        this.paintInlineImageXObject(imgData, mask);
      },
      paintFormXObjectBegin: function SVGGraphics_paintFormXObjectBegin(matrix, bbox) {
        if (Array.isArray(matrix) && matrix.length === 6) {
          this.transform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
        }
        if (Array.isArray(bbox) && bbox.length === 4) {
          var width = bbox[2] - bbox[0];
          var height = bbox[3] - bbox[1];
          var cliprect = this.svgFactory.createElement('svg:rect');
          cliprect.setAttributeNS(null, 'x', bbox[0]);
          cliprect.setAttributeNS(null, 'y', bbox[1]);
          cliprect.setAttributeNS(null, 'width', pf(width));
          cliprect.setAttributeNS(null, 'height', pf(height));
          this.current.element = cliprect;
          this.clip('nonzero');
          this.endPath();
        }
      },
      paintFormXObjectEnd: function SVGGraphics_paintFormXObjectEnd() {},
      _initialize: function _initialize(viewport) {
        var svg = this.svgFactory.create(viewport.width, viewport.height);
        var definitions = this.svgFactory.createElement('svg:defs');
        svg.appendChild(definitions);
        this.defs = definitions;
        var rootGroup = this.svgFactory.createElement('svg:g');
        rootGroup.setAttributeNS(null, 'transform', pm(viewport.transform));
        svg.appendChild(rootGroup);
        this.svg = rootGroup;
        return svg;
      },

      _ensureClipGroup: function SVGGraphics_ensureClipGroup() {
        if (!this.current.clipGroup) {
          var clipGroup = this.svgFactory.createElement('svg:g');
          clipGroup.setAttributeNS(null, 'clip-path', this.current.activeClipUrl);
          this.svg.appendChild(clipGroup);
          this.current.clipGroup = clipGroup;
        }
        return this.current.clipGroup;
      },
      _ensureTransformGroup: function SVGGraphics_ensureTransformGroup() {
        if (!this.tgrp) {
          this.tgrp = this.svgFactory.createElement('svg:g');
          this.tgrp.setAttributeNS(null, 'transform', pm(this.transformMatrix));
          if (this.current.activeClipUrl) {
            this._ensureClipGroup().appendChild(this.tgrp);
          } else {
            this.svg.appendChild(this.tgrp);
          }
        }
        return this.tgrp;
      }
    };
    return SVGGraphics;
  }();
}
exports.SVGGraphics = SVGGraphics;