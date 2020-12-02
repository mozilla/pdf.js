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
/* globals __non_webpack_require__ */

import {
  createObjectURL,
  FONT_IDENTITY_MATRIX,
  IDENTITY_MATRIX,
  ImageKind,
  isNum,
  OPS,
  TextRenderingMode,
  Util,
  warn,
} from "../shared/util.js";
import { DOMSVGFactory } from "./display_utils.js";
import { isNodeJS } from "../shared/is_node.js";

/** @type {any} */
let SVGGraphics = function () {
  throw new Error("Not implemented: SVGGraphics");
};

if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
  const SVG_DEFAULTS = {
    fontStyle: "normal",
    fontWeight: "normal",
    fillColor: "#000000",
  };
  const XML_NS = "http://www.w3.org/XML/1998/namespace";
  const XLINK_NS = "http://www.w3.org/1999/xlink";
  const LINE_CAP_STYLES = ["butt", "round", "square"];
  const LINE_JOIN_STYLES = ["miter", "round", "bevel"];

  const convertImgDataToPng = (function () {
    const PNG_HEADER = new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
    ]);
    const CHUNK_WRAPPER_SIZE = 12;

    const crcTable = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let h = 0; h < 8; h++) {
        if (c & 1) {
          c = 0xedb88320 ^ ((c >> 1) & 0x7fffffff);
        } else {
          c = (c >> 1) & 0x7fffffff;
        }
      }
      crcTable[i] = c;
    }

    function crc32(data, start, end) {
      let crc = -1;
      for (let i = start; i < end; i++) {
        const a = (crc ^ data[i]) & 0xff;
        const b = crcTable[a];
        crc = (crc >>> 8) ^ b;
      }
      return crc ^ -1;
    }

    function writePngChunk(type, body, data, offset) {
      let p = offset;
      const len = body.length;

      data[p] = (len >> 24) & 0xff;
      data[p + 1] = (len >> 16) & 0xff;
      data[p + 2] = (len >> 8) & 0xff;
      data[p + 3] = len & 0xff;
      p += 4;

      data[p] = type.charCodeAt(0) & 0xff;
      data[p + 1] = type.charCodeAt(1) & 0xff;
      data[p + 2] = type.charCodeAt(2) & 0xff;
      data[p + 3] = type.charCodeAt(3) & 0xff;
      p += 4;

      data.set(body, p);
      p += body.length;

      const crc = crc32(data, offset + 4, p);
      data[p] = (crc >> 24) & 0xff;
      data[p + 1] = (crc >> 16) & 0xff;
      data[p + 2] = (crc >> 8) & 0xff;
      data[p + 3] = crc & 0xff;
    }

    function adler32(data, start, end) {
      let a = 1;
      let b = 0;
      for (let i = start; i < end; ++i) {
        a = (a + (data[i] & 0xff)) % 65521;
        b = (b + a) % 65521;
      }
      return (b << 16) | a;
    }

    /**
     * @param {Uint8Array} literals The input data.
     * @returns {Uint8Array} The DEFLATE-compressed data stream in zlib format.
     *   This is the required format for compressed streams in the PNG format:
     *   http://www.libpng.org/pub/png/spec/1.2/PNG-Compression.html
     */
    function deflateSync(literals) {
      if (!isNodeJS) {
        // zlib is certainly not available outside of Node.js. We can either use
        // the pako library for client-side DEFLATE compression, or use the
        // canvas API of the browser to obtain a more optimal PNG file.
        return deflateSyncUncompressed(literals);
      }
      try {
        // NOTE: This implementation is far from perfect, but already way better
        // than not applying any compression.
        //
        // A better algorithm will try to choose a good predictor/filter and
        // then choose a suitable zlib compression strategy (e.g. 3,Z_RLE).
        //
        // Node v0.11.12 zlib.deflateSync is introduced (and returns a Buffer).
        // Node v3.0.0   Buffer inherits from Uint8Array.
        // Node v8.0.0   zlib.deflateSync accepts Uint8Array as input.
        let input;
        // eslint-disable-next-line no-undef
        if (parseInt(process.versions.node) >= 8) {
          input = literals;
        } else {
          // eslint-disable-next-line no-undef
          input = Buffer.from(literals);
        }
        const output = __non_webpack_require__("zlib").deflateSync(input, {
          level: 9,
        });
        return output instanceof Uint8Array ? output : new Uint8Array(output);
      } catch (e) {
        warn(
          "Not compressing PNG because zlib.deflateSync is unavailable: " + e
        );
      }

      return deflateSyncUncompressed(literals);
    }

    // An implementation of DEFLATE with compression level 0 (Z_NO_COMPRESSION).
    function deflateSyncUncompressed(literals) {
      let len = literals.length;
      const maxBlockLength = 0xffff;

      const deflateBlocks = Math.ceil(len / maxBlockLength);
      const idat = new Uint8Array(2 + len + deflateBlocks * 5 + 4);
      let pi = 0;
      idat[pi++] = 0x78; // compression method and flags
      idat[pi++] = 0x9c; // flags

      let pos = 0;
      while (len > maxBlockLength) {
        // writing non-final DEFLATE blocks type 0 and length of 65535
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

      // writing non-final DEFLATE blocks type 0
      idat[pi++] = 0x01;
      idat[pi++] = len & 0xff;
      idat[pi++] = (len >> 8) & 0xff;
      idat[pi++] = ~len & 0xffff & 0xff;
      idat[pi++] = ((~len & 0xffff) >> 8) & 0xff;
      idat.set(literals.subarray(pos), pi);
      pi += literals.length - pos;

      const adler = adler32(literals, 0, literals.length); // checksum
      idat[pi++] = (adler >> 24) & 0xff;
      idat[pi++] = (adler >> 16) & 0xff;
      idat[pi++] = (adler >> 8) & 0xff;
      idat[pi++] = adler & 0xff;
      return idat;
    }

    function encode(imgData, kind, forceDataSchema, isMask) {
      const width = imgData.width;
      const height = imgData.height;
      let bitDepth, colorType, lineSize;
      const bytes = imgData.data;

      switch (kind) {
        case ImageKind.GRAYSCALE_1BPP:
          colorType = 0;
          bitDepth = 1;
          lineSize = (width + 7) >> 3;
          break;
        case ImageKind.RGB_24BPP:
          colorType = 2;
          bitDepth = 8;
          lineSize = width * 3;
          break;
        case ImageKind.RGBA_32BPP:
          colorType = 6;
          bitDepth = 8;
          lineSize = width * 4;
          break;
        default:
          throw new Error("invalid format");
      }

      // prefix every row with predictor 0
      const literals = new Uint8Array((1 + lineSize) * height);
      let offsetLiterals = 0,
        offsetBytes = 0;
      for (let y = 0; y < height; ++y) {
        literals[offsetLiterals++] = 0; // no prediction
        literals.set(
          bytes.subarray(offsetBytes, offsetBytes + lineSize),
          offsetLiterals
        );
        offsetBytes += lineSize;
        offsetLiterals += lineSize;
      }

      if (kind === ImageKind.GRAYSCALE_1BPP && isMask) {
        // inverting for image masks
        offsetLiterals = 0;
        for (let y = 0; y < height; y++) {
          offsetLiterals++; // skipping predictor
          for (let i = 0; i < lineSize; i++) {
            literals[offsetLiterals++] ^= 0xff;
          }
        }
      }

      const ihdr = new Uint8Array([
        (width >> 24) & 0xff,
        (width >> 16) & 0xff,
        (width >> 8) & 0xff,
        width & 0xff,
        (height >> 24) & 0xff,
        (height >> 16) & 0xff,
        (height >> 8) & 0xff,
        height & 0xff,
        bitDepth, // bit depth
        colorType, // color type
        0x00, // compression method
        0x00, // filter method
        0x00, // interlace method
      ]);
      const idat = deflateSync(literals);

      // PNG consists of: header, IHDR+data, IDAT+data, and IEND.
      const pngLength =
        PNG_HEADER.length + CHUNK_WRAPPER_SIZE * 3 + ihdr.length + idat.length;
      const data = new Uint8Array(pngLength);
      let offset = 0;
      data.set(PNG_HEADER, offset);
      offset += PNG_HEADER.length;
      writePngChunk("IHDR", ihdr, data, offset);
      offset += CHUNK_WRAPPER_SIZE + ihdr.length;
      writePngChunk("IDATA", idat, data, offset);
      offset += CHUNK_WRAPPER_SIZE + idat.length;
      writePngChunk("IEND", new Uint8Array(0), data, offset);

      return createObjectURL(data, "image/png", forceDataSchema);
    }

    // eslint-disable-next-line no-shadow
    return function convertImgDataToPng(imgData, forceDataSchema, isMask) {
      const kind =
        imgData.kind === undefined ? ImageKind.GRAYSCALE_1BPP : imgData.kind;
      return encode(imgData, kind, forceDataSchema, isMask);
    };
  })();

  class SVGExtraState {
    constructor() {
      this.fontSizeScale = 1;
      this.fontWeight = SVG_DEFAULTS.fontWeight;
      this.fontSize = 0;

      this.textMatrix = IDENTITY_MATRIX;
      this.fontMatrix = FONT_IDENTITY_MATRIX;
      this.leading = 0;
      this.textRenderingMode = TextRenderingMode.FILL;
      this.textMatrixScale = 1;

      // Current point (in user coordinates)
      this.x = 0;
      this.y = 0;

      // Start of text line (in text coordinates)
      this.lineX = 0;
      this.lineY = 0;

      // Character and word spacing
      this.charSpacing = 0;
      this.wordSpacing = 0;
      this.textHScale = 1;
      this.textRise = 0;

      // Default foreground and background colors
      this.fillColor = SVG_DEFAULTS.fillColor;
      this.strokeColor = "#000000";

      this.fillAlpha = 1;
      this.strokeAlpha = 1;
      this.lineWidth = 1;
      this.lineJoin = "";
      this.lineCap = "";
      this.miterLimit = 0;

      this.dashArray = [];
      this.dashPhase = 0;

      this.dependencies = [];

      // Clipping
      this.activeClipUrl = null;
      this.clipGroup = null;

      this.maskId = "";
    }

    clone() {
      return Object.create(this);
    }

    setCurrentPoint(x, y) {
      this.x = x;
      this.y = y;
    }
  }

  // eslint-disable-next-line no-inner-declarations
  function opListToTree(opList) {
    let opTree = [];
    const tmp = [];

    for (const opListElement of opList) {
      if (opListElement.fn === "save") {
        opTree.push({ fnId: 92, fn: "group", items: [] });
        tmp.push(opTree);
        opTree = opTree[opTree.length - 1].items;
        continue;
      }

      if (opListElement.fn === "restore") {
        opTree = tmp.pop();
      } else {
        opTree.push(opListElement);
      }
    }
    return opTree;
  }

  /**
   * Format a float number as a string.
   *
   * @param value {number} - The float number to format.
   * @returns {string}
   */
  // eslint-disable-next-line no-inner-declarations
  function pf(value) {
    if (Number.isInteger(value)) {
      return value.toString();
    }
    const s = value.toFixed(10);
    let i = s.length - 1;
    if (s[i] !== "0") {
      return s;
    }

    // Remove trailing zeros.
    do {
      i--;
    } while (s[i] === "0");
    return s.substring(0, s[i] === "." ? i : i + 1);
  }

  /**
   * Format a transform matrix as a string. The standard rotation, scale and
   * translation matrices are replaced by their shorter forms, and for
   * identity matrices an empty string is returned to save memory.
   *
   * @param m {Array} - The transform matrix to format.
   * @returns {string}
   */
  // eslint-disable-next-line no-inner-declarations
  function pm(m) {
    if (m[4] === 0 && m[5] === 0) {
      if (m[1] === 0 && m[2] === 0) {
        if (m[0] === 1 && m[3] === 1) {
          return "";
        }
        return `scale(${pf(m[0])} ${pf(m[3])})`;
      }
      if (m[0] === m[3] && m[1] === -m[2]) {
        const a = (Math.acos(m[0]) * 180) / Math.PI;
        return `rotate(${pf(a)})`;
      }
    } else {
      if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1) {
        return `translate(${pf(m[4])} ${pf(m[5])})`;
      }
    }
    return (
      `matrix(${pf(m[0])} ${pf(m[1])} ${pf(m[2])} ${pf(m[3])} ${pf(m[4])} ` +
      `${pf(m[5])})`
    );
  }

  // The counts below are relevant for all pages, so they have to be global
  // instead of being members of `SVGGraphics` (which is recreated for
  // each page).
  let clipCount = 0;
  let maskCount = 0;
  let shadingCount = 0;

  // eslint-disable-next-line no-shadow
  SVGGraphics = class SVGGraphics {
    constructor(commonObjs, objs, forceDataSchema = false) {
      this.svgFactory = new DOMSVGFactory();

      this.current = new SVGExtraState();
      this.transformMatrix = IDENTITY_MATRIX; // Graphics state matrix
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

      // In `src/shared/util.js` the operator names are mapped to IDs.
      // The list below represents the reverse of that, i.e., it maps IDs
      // to operator names.
      this._operatorIdMapping = [];
      for (const op in OPS) {
        this._operatorIdMapping[OPS[op]] = op;
      }
    }

    save() {
      this.transformStack.push(this.transformMatrix);
      const old = this.current;
      this.extraStack.push(old);
      this.current = old.clone();
    }

    restore() {
      this.transformMatrix = this.transformStack.pop();
      this.current = this.extraStack.pop();
      this.pendingClip = null;
      this.tgrp = null;
    }

    group(items) {
      this.save();
      this.executeOpTree(items);
      this.restore();
    }

    loadDependencies(operatorList) {
      const fnArray = operatorList.fnArray;
      const argsArray = operatorList.argsArray;

      for (let i = 0, ii = fnArray.length; i < ii; i++) {
        if (fnArray[i] !== OPS.dependency) {
          continue;
        }

        for (const obj of argsArray[i]) {
          const objsPool = obj.startsWith("g_") ? this.commonObjs : this.objs;
          const promise = new Promise(resolve => {
            objsPool.get(obj, resolve);
          });
          this.current.dependencies.push(promise);
        }
      }
      return Promise.all(this.current.dependencies);
    }

    transform(a, b, c, d, e, f) {
      const transformMatrix = [a, b, c, d, e, f];
      this.transformMatrix = Util.transform(
        this.transformMatrix,
        transformMatrix
      );
      this.tgrp = null;
    }

    getSVG(operatorList, viewport) {
      this.viewport = viewport;

      const svgElement = this._initialize(viewport);
      return this.loadDependencies(operatorList).then(() => {
        this.transformMatrix = IDENTITY_MATRIX;
        this.executeOpTree(this.convertOpList(operatorList));
        return svgElement;
      });
    }

    convertOpList(operatorList) {
      const operatorIdMapping = this._operatorIdMapping;
      const argsArray = operatorList.argsArray;
      const fnArray = operatorList.fnArray;
      const opList = [];
      for (let i = 0, ii = fnArray.length; i < ii; i++) {
        const fnId = fnArray[i];
        opList.push({
          fnId,
          fn: operatorIdMapping[fnId],
          args: argsArray[i],
        });
      }
      return opListToTree(opList);
    }

    executeOpTree(opTree) {
      for (const opTreeElement of opTree) {
        const fn = opTreeElement.fn;
        const fnId = opTreeElement.fnId;
        const args = opTreeElement.args;

        switch (fnId | 0) {
          case OPS.beginText:
            this.beginText();
            break;
          case OPS.dependency:
            // Handled in `loadDependencies`, so no warning should be shown.
            break;
          case OPS.setLeading:
            this.setLeading(args);
            break;
          case OPS.setLeadingMoveText:
            this.setLeadingMoveText(args[0], args[1]);
            break;
          case OPS.setFont:
            this.setFont(args);
            break;
          case OPS.showText:
            this.showText(args[0]);
            break;
          case OPS.showSpacedText:
            this.showText(args[0]);
            break;
          case OPS.endText:
            this.endText();
            break;
          case OPS.moveText:
            this.moveText(args[0], args[1]);
            break;
          case OPS.setCharSpacing:
            this.setCharSpacing(args[0]);
            break;
          case OPS.setWordSpacing:
            this.setWordSpacing(args[0]);
            break;
          case OPS.setHScale:
            this.setHScale(args[0]);
            break;
          case OPS.setTextMatrix:
            this.setTextMatrix(
              args[0],
              args[1],
              args[2],
              args[3],
              args[4],
              args[5]
            );
            break;
          case OPS.setTextRise:
            this.setTextRise(args[0]);
            break;
          case OPS.setTextRenderingMode:
            this.setTextRenderingMode(args[0]);
            break;
          case OPS.setLineWidth:
            this.setLineWidth(args[0]);
            break;
          case OPS.setLineJoin:
            this.setLineJoin(args[0]);
            break;
          case OPS.setLineCap:
            this.setLineCap(args[0]);
            break;
          case OPS.setMiterLimit:
            this.setMiterLimit(args[0]);
            break;
          case OPS.setFillRGBColor:
            this.setFillRGBColor(args[0], args[1], args[2]);
            break;
          case OPS.setStrokeRGBColor:
            this.setStrokeRGBColor(args[0], args[1], args[2]);
            break;
          case OPS.setStrokeColorN:
            this.setStrokeColorN(args);
            break;
          case OPS.setFillColorN:
            this.setFillColorN(args);
            break;
          case OPS.shadingFill:
            this.shadingFill(args[0]);
            break;
          case OPS.setDash:
            this.setDash(args[0], args[1]);
            break;
          case OPS.setRenderingIntent:
            this.setRenderingIntent(args[0]);
            break;
          case OPS.setFlatness:
            this.setFlatness(args[0]);
            break;
          case OPS.setGState:
            this.setGState(args[0]);
            break;
          case OPS.fill:
            this.fill();
            break;
          case OPS.eoFill:
            this.eoFill();
            break;
          case OPS.stroke:
            this.stroke();
            break;
          case OPS.fillStroke:
            this.fillStroke();
            break;
          case OPS.eoFillStroke:
            this.eoFillStroke();
            break;
          case OPS.clip:
            this.clip("nonzero");
            break;
          case OPS.eoClip:
            this.clip("evenodd");
            break;
          case OPS.paintSolidColorImageMask:
            this.paintSolidColorImageMask();
            break;
          case OPS.paintImageXObject:
            this.paintImageXObject(args[0]);
            break;
          case OPS.paintInlineImageXObject:
            this.paintInlineImageXObject(args[0]);
            break;
          case OPS.paintImageMaskXObject:
            this.paintImageMaskXObject(args[0]);
            break;
          case OPS.paintFormXObjectBegin:
            this.paintFormXObjectBegin(args[0], args[1]);
            break;
          case OPS.paintFormXObjectEnd:
            this.paintFormXObjectEnd();
            break;
          case OPS.closePath:
            this.closePath();
            break;
          case OPS.closeStroke:
            this.closeStroke();
            break;
          case OPS.closeFillStroke:
            this.closeFillStroke();
            break;
          case OPS.closeEOFillStroke:
            this.closeEOFillStroke();
            break;
          case OPS.nextLine:
            this.nextLine();
            break;
          case OPS.transform:
            this.transform(
              args[0],
              args[1],
              args[2],
              args[3],
              args[4],
              args[5]
            );
            break;
          case OPS.constructPath:
            this.constructPath(args[0], args[1]);
            break;
          case OPS.endPath:
            this.endPath();
            break;
          case 92:
            this.group(opTreeElement.items);
            break;
          default:
            warn(`Unimplemented operator ${fn}`);
            break;
        }
      }
    }

    setWordSpacing(wordSpacing) {
      this.current.wordSpacing = wordSpacing;
    }

    setCharSpacing(charSpacing) {
      this.current.charSpacing = charSpacing;
    }

    nextLine() {
      this.moveText(0, this.current.leading);
    }

    setTextMatrix(a, b, c, d, e, f) {
      const current = this.current;
      current.textMatrix = current.lineMatrix = [a, b, c, d, e, f];
      current.textMatrixScale = Math.sqrt(a * a + b * b);

      current.x = current.lineX = 0;
      current.y = current.lineY = 0;

      current.xcoords = [];
      current.ycoords = [];
      current.tspan = this.svgFactory.createElement("svg:tspan");
      current.tspan.setAttributeNS(null, "font-family", current.fontFamily);
      current.tspan.setAttributeNS(
        null,
        "font-size",
        `${pf(current.fontSize)}px`
      );
      current.tspan.setAttributeNS(null, "y", pf(-current.y));

      current.txtElement = this.svgFactory.createElement("svg:text");
      current.txtElement.appendChild(current.tspan);
    }

    beginText() {
      const current = this.current;
      current.x = current.lineX = 0;
      current.y = current.lineY = 0;
      current.textMatrix = IDENTITY_MATRIX;
      current.lineMatrix = IDENTITY_MATRIX;
      current.textMatrixScale = 1;
      current.tspan = this.svgFactory.createElement("svg:tspan");
      current.txtElement = this.svgFactory.createElement("svg:text");
      current.txtgrp = this.svgFactory.createElement("svg:g");
      current.xcoords = [];
      current.ycoords = [];
    }

    moveText(x, y) {
      const current = this.current;
      current.x = current.lineX += x;
      current.y = current.lineY += y;

      current.xcoords = [];
      current.ycoords = [];
      current.tspan = this.svgFactory.createElement("svg:tspan");
      current.tspan.setAttributeNS(null, "font-family", current.fontFamily);
      current.tspan.setAttributeNS(
        null,
        "font-size",
        `${pf(current.fontSize)}px`
      );
      current.tspan.setAttributeNS(null, "y", pf(-current.y));
    }

    showText(glyphs) {
      const current = this.current;
      const font = current.font;
      const fontSize = current.fontSize;
      if (fontSize === 0) {
        return;
      }

      const fontSizeScale = current.fontSizeScale;
      const charSpacing = current.charSpacing;
      const wordSpacing = current.wordSpacing;
      const fontDirection = current.fontDirection;
      const textHScale = current.textHScale * fontDirection;
      const vertical = font.vertical;
      const spacingDir = vertical ? 1 : -1;
      const defaultVMetrics = font.defaultVMetrics;
      const widthAdvanceScale = fontSize * current.fontMatrix[0];

      let x = 0;
      for (const glyph of glyphs) {
        if (glyph === null) {
          // Word break
          x += fontDirection * wordSpacing;
          continue;
        } else if (isNum(glyph)) {
          x += (spacingDir * glyph * fontSize) / 1000;
          continue;
        }

        const spacing = (glyph.isSpace ? wordSpacing : 0) + charSpacing;
        const character = glyph.fontChar;
        let scaledX, scaledY;
        let width = glyph.width;
        if (vertical) {
          let vx;
          const vmetric = glyph.vmetric || defaultVMetrics;
          vx = glyph.vmetric ? vmetric[1] : width * 0.5;
          vx = -vx * widthAdvanceScale;
          const vy = vmetric[2] * widthAdvanceScale;

          width = vmetric ? -vmetric[0] : width;
          scaledX = vx / fontSizeScale;
          scaledY = (x + vy) / fontSizeScale;
        } else {
          scaledX = x / fontSizeScale;
          scaledY = 0;
        }

        if (glyph.isInFont || font.missingFile) {
          current.xcoords.push(current.x + scaledX);
          if (vertical) {
            current.ycoords.push(-current.y + scaledY);
          }
          current.tspan.textContent += character;
        } else {
          // TODO: To assist with text selection, we should replace the missing
          // character with a space character if charWidth is not zero.
          // But we cannot just do "character = ' '", because the ' ' character
          // might actually map to a different glyph.
        }

        let charWidth;
        if (vertical) {
          charWidth = width * widthAdvanceScale - spacing * fontDirection;
        } else {
          charWidth = width * widthAdvanceScale + spacing * fontDirection;
        }

        x += charWidth;
      }
      current.tspan.setAttributeNS(
        null,
        "x",
        current.xcoords.map(pf).join(" ")
      );
      if (vertical) {
        current.tspan.setAttributeNS(
          null,
          "y",
          current.ycoords.map(pf).join(" ")
        );
      } else {
        current.tspan.setAttributeNS(null, "y", pf(-current.y));
      }

      if (vertical) {
        current.y -= x;
      } else {
        current.x += x * textHScale;
      }

      current.tspan.setAttributeNS(null, "font-family", current.fontFamily);
      current.tspan.setAttributeNS(
        null,
        "font-size",
        `${pf(current.fontSize)}px`
      );
      if (current.fontStyle !== SVG_DEFAULTS.fontStyle) {
        current.tspan.setAttributeNS(null, "font-style", current.fontStyle);
      }
      if (current.fontWeight !== SVG_DEFAULTS.fontWeight) {
        current.tspan.setAttributeNS(null, "font-weight", current.fontWeight);
      }

      const fillStrokeMode =
        current.textRenderingMode & TextRenderingMode.FILL_STROKE_MASK;
      if (
        fillStrokeMode === TextRenderingMode.FILL ||
        fillStrokeMode === TextRenderingMode.FILL_STROKE
      ) {
        if (current.fillColor !== SVG_DEFAULTS.fillColor) {
          current.tspan.setAttributeNS(null, "fill", current.fillColor);
        }
        if (current.fillAlpha < 1) {
          current.tspan.setAttributeNS(null, "fill-opacity", current.fillAlpha);
        }
      } else if (current.textRenderingMode === TextRenderingMode.ADD_TO_PATH) {
        // Workaround for Firefox: We must set fill="transparent" because
        // fill="none" would generate an empty clipping path.
        current.tspan.setAttributeNS(null, "fill", "transparent");
      } else {
        current.tspan.setAttributeNS(null, "fill", "none");
      }

      if (
        fillStrokeMode === TextRenderingMode.STROKE ||
        fillStrokeMode === TextRenderingMode.FILL_STROKE
      ) {
        const lineWidthScale = 1 / (current.textMatrixScale || 1);
        this._setStrokeAttributes(current.tspan, lineWidthScale);
      }

      // Include the text rise in the text matrix since the `pm` function
      // creates the SVG element's `translate` entry (work on a copy to avoid
      // altering the original text matrix).
      let textMatrix = current.textMatrix;
      if (current.textRise !== 0) {
        textMatrix = textMatrix.slice();
        textMatrix[5] += current.textRise;
      }

      current.txtElement.setAttributeNS(
        null,
        "transform",
        `${pm(textMatrix)} scale(${pf(textHScale)}, -1)`
      );
      current.txtElement.setAttributeNS(XML_NS, "xml:space", "preserve");
      current.txtElement.appendChild(current.tspan);
      current.txtgrp.appendChild(current.txtElement);

      this._ensureTransformGroup().appendChild(current.txtElement);
    }

    setLeadingMoveText(x, y) {
      this.setLeading(-y);
      this.moveText(x, y);
    }

    addFontStyle(fontObj) {
      if (!fontObj.data) {
        throw new Error(
          "addFontStyle: No font data available, " +
            'ensure that the "fontExtraProperties" API parameter is set.'
        );
      }
      if (!this.cssStyle) {
        this.cssStyle = this.svgFactory.createElement("svg:style");
        this.cssStyle.setAttributeNS(null, "type", "text/css");
        this.defs.appendChild(this.cssStyle);
      }

      const url = createObjectURL(
        fontObj.data,
        fontObj.mimetype,
        this.forceDataSchema
      );
      this.cssStyle.textContent +=
        `@font-face { font-family: "${fontObj.loadedName}";` +
        ` src: url(${url}); }\n`;
    }

    setFont(details) {
      const current = this.current;
      const fontObj = this.commonObjs.get(details[0]);
      let size = details[1];
      current.font = fontObj;

      if (
        this.embedFonts &&
        !fontObj.missingFile &&
        !this.embeddedFonts[fontObj.loadedName]
      ) {
        this.addFontStyle(fontObj);
        this.embeddedFonts[fontObj.loadedName] = fontObj;
      }

      current.fontMatrix = fontObj.fontMatrix
        ? fontObj.fontMatrix
        : FONT_IDENTITY_MATRIX;

      let bold = "normal";
      if (fontObj.black) {
        bold = "900";
      } else if (fontObj.bold) {
        bold = "bold";
      }
      const italic = fontObj.italic ? "italic" : "normal";

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

      current.tspan = this.svgFactory.createElement("svg:tspan");
      current.tspan.setAttributeNS(null, "y", pf(-current.y));
      current.xcoords = [];
      current.ycoords = [];
    }

    endText() {
      const current = this.current;
      if (
        current.textRenderingMode & TextRenderingMode.ADD_TO_PATH_FLAG &&
        current.txtElement?.hasChildNodes()
      ) {
        // If no glyphs are shown (i.e. no child nodes), no clipping occurs.
        current.element = current.txtElement;
        this.clip("nonzero");
        this.endPath();
      }
    }

    // Path properties
    setLineWidth(width) {
      if (width > 0) {
        this.current.lineWidth = width;
      }
    }

    setLineCap(style) {
      this.current.lineCap = LINE_CAP_STYLES[style];
    }

    setLineJoin(style) {
      this.current.lineJoin = LINE_JOIN_STYLES[style];
    }

    setMiterLimit(limit) {
      this.current.miterLimit = limit;
    }

    setStrokeAlpha(strokeAlpha) {
      this.current.strokeAlpha = strokeAlpha;
    }

    setStrokeRGBColor(r, g, b) {
      this.current.strokeColor = Util.makeHexColor(r, g, b);
    }

    setFillAlpha(fillAlpha) {
      this.current.fillAlpha = fillAlpha;
    }

    setFillRGBColor(r, g, b) {
      this.current.fillColor = Util.makeHexColor(r, g, b);
      this.current.tspan = this.svgFactory.createElement("svg:tspan");
      this.current.xcoords = [];
      this.current.ycoords = [];
    }

    setStrokeColorN(args) {
      this.current.strokeColor = this._makeColorN_Pattern(args);
    }

    setFillColorN(args) {
      this.current.fillColor = this._makeColorN_Pattern(args);
    }

    shadingFill(args) {
      const width = this.viewport.width;
      const height = this.viewport.height;
      const inv = Util.inverseTransform(this.transformMatrix);
      const bl = Util.applyTransform([0, 0], inv);
      const br = Util.applyTransform([0, height], inv);
      const ul = Util.applyTransform([width, 0], inv);
      const ur = Util.applyTransform([width, height], inv);
      const x0 = Math.min(bl[0], br[0], ul[0], ur[0]);
      const y0 = Math.min(bl[1], br[1], ul[1], ur[1]);
      const x1 = Math.max(bl[0], br[0], ul[0], ur[0]);
      const y1 = Math.max(bl[1], br[1], ul[1], ur[1]);

      const rect = this.svgFactory.createElement("svg:rect");
      rect.setAttributeNS(null, "x", x0);
      rect.setAttributeNS(null, "y", y0);
      rect.setAttributeNS(null, "width", x1 - x0);
      rect.setAttributeNS(null, "height", y1 - y0);
      rect.setAttributeNS(null, "fill", this._makeShadingPattern(args));
      if (this.current.fillAlpha < 1) {
        rect.setAttributeNS(null, "fill-opacity", this.current.fillAlpha);
      }
      this._ensureTransformGroup().appendChild(rect);
    }

    /**
     * @private
     */
    _makeColorN_Pattern(args) {
      if (args[0] === "TilingPattern") {
        return this._makeTilingPattern(args);
      }
      return this._makeShadingPattern(args);
    }

    /**
     * @private
     */
    _makeTilingPattern(args) {
      const color = args[1];
      const operatorList = args[2];
      const matrix = args[3] || IDENTITY_MATRIX;
      const [x0, y0, x1, y1] = args[4];
      const xstep = args[5];
      const ystep = args[6];
      const paintType = args[7];

      const tilingId = `shading${shadingCount++}`;
      const [tx0, ty0] = Util.applyTransform([x0, y0], matrix);
      const [tx1, ty1] = Util.applyTransform([x1, y1], matrix);
      const [xscale, yscale] = Util.singularValueDecompose2dScale(matrix);
      const txstep = xstep * xscale;
      const tystep = ystep * yscale;

      const tiling = this.svgFactory.createElement("svg:pattern");
      tiling.setAttributeNS(null, "id", tilingId);
      tiling.setAttributeNS(null, "patternUnits", "userSpaceOnUse");
      tiling.setAttributeNS(null, "width", txstep);
      tiling.setAttributeNS(null, "height", tystep);
      tiling.setAttributeNS(null, "x", `${tx0}`);
      tiling.setAttributeNS(null, "y", `${ty0}`);

      // Save current state.
      const svg = this.svg;
      const transformMatrix = this.transformMatrix;
      const fillColor = this.current.fillColor;
      const strokeColor = this.current.strokeColor;

      const bbox = this.svgFactory.create(tx1 - tx0, ty1 - ty0);
      this.svg = bbox;
      this.transformMatrix = matrix;
      if (paintType === 2) {
        const cssColor = Util.makeHexColor(...color);
        this.current.fillColor = cssColor;
        this.current.strokeColor = cssColor;
      }
      this.executeOpTree(this.convertOpList(operatorList));

      // Restore saved state.
      this.svg = svg;
      this.transformMatrix = transformMatrix;
      this.current.fillColor = fillColor;
      this.current.strokeColor = strokeColor;

      tiling.appendChild(bbox.childNodes[0]);
      this.defs.appendChild(tiling);
      return `url(#${tilingId})`;
    }

    /**
     * @private
     */
    _makeShadingPattern(args) {
      switch (args[0]) {
        case "RadialAxial":
          const shadingId = `shading${shadingCount++}`;
          const colorStops = args[3];
          let gradient;

          switch (args[1]) {
            case "axial":
              const point0 = args[4];
              const point1 = args[5];
              gradient = this.svgFactory.createElement("svg:linearGradient");
              gradient.setAttributeNS(null, "id", shadingId);
              gradient.setAttributeNS(null, "gradientUnits", "userSpaceOnUse");
              gradient.setAttributeNS(null, "x1", point0[0]);
              gradient.setAttributeNS(null, "y1", point0[1]);
              gradient.setAttributeNS(null, "x2", point1[0]);
              gradient.setAttributeNS(null, "y2", point1[1]);
              break;
            case "radial":
              const focalPoint = args[4];
              const circlePoint = args[5];
              const focalRadius = args[6];
              const circleRadius = args[7];
              gradient = this.svgFactory.createElement("svg:radialGradient");
              gradient.setAttributeNS(null, "id", shadingId);
              gradient.setAttributeNS(null, "gradientUnits", "userSpaceOnUse");
              gradient.setAttributeNS(null, "cx", circlePoint[0]);
              gradient.setAttributeNS(null, "cy", circlePoint[1]);
              gradient.setAttributeNS(null, "r", circleRadius);
              gradient.setAttributeNS(null, "fx", focalPoint[0]);
              gradient.setAttributeNS(null, "fy", focalPoint[1]);
              gradient.setAttributeNS(null, "fr", focalRadius);
              break;
            default:
              throw new Error(`Unknown RadialAxial type: ${args[1]}`);
          }
          for (const colorStop of colorStops) {
            const stop = this.svgFactory.createElement("svg:stop");
            stop.setAttributeNS(null, "offset", colorStop[0]);
            stop.setAttributeNS(null, "stop-color", colorStop[1]);
            gradient.appendChild(stop);
          }
          this.defs.appendChild(gradient);
          return `url(#${shadingId})`;
        case "Mesh":
          warn("Unimplemented pattern Mesh");
          return null;
        case "Dummy":
          return "hotpink";
        default:
          throw new Error(`Unknown IR type: ${args[0]}`);
      }
    }

    setDash(dashArray, dashPhase) {
      this.current.dashArray = dashArray;
      this.current.dashPhase = dashPhase;
    }

    constructPath(ops, args) {
      const current = this.current;
      let x = current.x,
        y = current.y;
      let d = [];
      let j = 0;

      for (const op of ops) {
        switch (op | 0) {
          case OPS.rectangle:
            x = args[j++];
            y = args[j++];
            const width = args[j++];
            const height = args[j++];
            const xw = x + width;
            const yh = y + height;
            d.push(
              "M",
              pf(x),
              pf(y),
              "L",
              pf(xw),
              pf(y),
              "L",
              pf(xw),
              pf(yh),
              "L",
              pf(x),
              pf(yh),
              "Z"
            );
            break;
          case OPS.moveTo:
            x = args[j++];
            y = args[j++];
            d.push("M", pf(x), pf(y));
            break;
          case OPS.lineTo:
            x = args[j++];
            y = args[j++];
            d.push("L", pf(x), pf(y));
            break;
          case OPS.curveTo:
            x = args[j + 4];
            y = args[j + 5];
            d.push(
              "C",
              pf(args[j]),
              pf(args[j + 1]),
              pf(args[j + 2]),
              pf(args[j + 3]),
              pf(x),
              pf(y)
            );
            j += 6;
            break;
          case OPS.curveTo2:
            d.push(
              "C",
              pf(x),
              pf(y),
              pf(args[j]),
              pf(args[j + 1]),
              pf(args[j + 2]),
              pf(args[j + 3])
            );
            x = args[j + 2];
            y = args[j + 3];
            j += 4;
            break;
          case OPS.curveTo3:
            x = args[j + 2];
            y = args[j + 3];
            d.push(
              "C",
              pf(args[j]),
              pf(args[j + 1]),
              pf(x),
              pf(y),
              pf(x),
              pf(y)
            );
            j += 4;
            break;
          case OPS.closePath:
            d.push("Z");
            break;
        }
      }

      d = d.join(" ");

      if (
        current.path &&
        ops.length > 0 &&
        ops[0] !== OPS.rectangle &&
        ops[0] !== OPS.moveTo
      ) {
        // If a path does not start with an OPS.rectangle or OPS.moveTo, it has
        // probably been divided into two OPS.constructPath operators by
        // OperatorList. Append the commands to the previous path element.
        d = current.path.getAttributeNS(null, "d") + d;
      } else {
        current.path = this.svgFactory.createElement("svg:path");
        this._ensureTransformGroup().appendChild(current.path);
      }

      current.path.setAttributeNS(null, "d", d);
      current.path.setAttributeNS(null, "fill", "none");

      // Saving a reference in current.element so that it can be addressed
      // in 'fill' and 'stroke'
      current.element = current.path;
      current.setCurrentPoint(x, y);
    }

    endPath() {
      const current = this.current;

      // Painting operators end a path.
      current.path = null;

      if (!this.pendingClip) {
        return;
      }
      if (!current.element) {
        this.pendingClip = null;
        return;
      }

      // Add the current path to a clipping path.
      const clipId = `clippath${clipCount++}`;
      const clipPath = this.svgFactory.createElement("svg:clipPath");
      clipPath.setAttributeNS(null, "id", clipId);
      clipPath.setAttributeNS(null, "transform", pm(this.transformMatrix));

      // A deep clone is needed when text is used as a clipping path.
      const clipElement = current.element.cloneNode(true);
      if (this.pendingClip === "evenodd") {
        clipElement.setAttributeNS(null, "clip-rule", "evenodd");
      } else {
        clipElement.setAttributeNS(null, "clip-rule", "nonzero");
      }
      this.pendingClip = null;
      clipPath.appendChild(clipElement);
      this.defs.appendChild(clipPath);

      if (current.activeClipUrl) {
        // The previous clipping group content can go out of order -- resetting
        // cached clipGroups.
        current.clipGroup = null;
        this.extraStack.forEach(function (prev) {
          prev.clipGroup = null;
        });
        // Intersect with the previous clipping path.
        clipPath.setAttributeNS(null, "clip-path", current.activeClipUrl);
      }
      current.activeClipUrl = `url(#${clipId})`;

      this.tgrp = null;
    }

    clip(type) {
      this.pendingClip = type;
    }

    closePath() {
      const current = this.current;
      if (current.path) {
        const d = `${current.path.getAttributeNS(null, "d")}Z`;
        current.path.setAttributeNS(null, "d", d);
      }
    }

    setLeading(leading) {
      this.current.leading = -leading;
    }

    setTextRise(textRise) {
      this.current.textRise = textRise;
    }

    setTextRenderingMode(textRenderingMode) {
      this.current.textRenderingMode = textRenderingMode;
    }

    setHScale(scale) {
      this.current.textHScale = scale / 100;
    }

    setRenderingIntent(intent) {
      // This operation is ignored since we haven't found a use case for it yet.
    }

    setFlatness(flatness) {
      // This operation is ignored since we haven't found a use case for it yet.
    }

    setGState(states) {
      for (const [key, value] of states) {
        switch (key) {
          case "LW":
            this.setLineWidth(value);
            break;
          case "LC":
            this.setLineCap(value);
            break;
          case "LJ":
            this.setLineJoin(value);
            break;
          case "ML":
            this.setMiterLimit(value);
            break;
          case "D":
            this.setDash(value[0], value[1]);
            break;
          case "RI":
            this.setRenderingIntent(value);
            break;
          case "FL":
            this.setFlatness(value);
            break;
          case "Font":
            this.setFont(value);
            break;
          case "CA":
            this.setStrokeAlpha(value);
            break;
          case "ca":
            this.setFillAlpha(value);
            break;
          default:
            warn(`Unimplemented graphic state operator ${key}`);
            break;
        }
      }
    }

    fill() {
      const current = this.current;
      if (current.element) {
        current.element.setAttributeNS(null, "fill", current.fillColor);
        current.element.setAttributeNS(null, "fill-opacity", current.fillAlpha);
        this.endPath();
      }
    }

    stroke() {
      const current = this.current;
      if (current.element) {
        this._setStrokeAttributes(current.element);
        current.element.setAttributeNS(null, "fill", "none");
        this.endPath();
      }
    }

    /**
     * @private
     */
    _setStrokeAttributes(element, lineWidthScale = 1) {
      const current = this.current;
      let dashArray = current.dashArray;
      if (lineWidthScale !== 1 && dashArray.length > 0) {
        dashArray = dashArray.map(function (value) {
          return lineWidthScale * value;
        });
      }
      element.setAttributeNS(null, "stroke", current.strokeColor);
      element.setAttributeNS(null, "stroke-opacity", current.strokeAlpha);
      element.setAttributeNS(null, "stroke-miterlimit", pf(current.miterLimit));
      element.setAttributeNS(null, "stroke-linecap", current.lineCap);
      element.setAttributeNS(null, "stroke-linejoin", current.lineJoin);
      element.setAttributeNS(
        null,
        "stroke-width",
        pf(lineWidthScale * current.lineWidth) + "px"
      );
      element.setAttributeNS(
        null,
        "stroke-dasharray",
        dashArray.map(pf).join(" ")
      );
      element.setAttributeNS(
        null,
        "stroke-dashoffset",
        pf(lineWidthScale * current.dashPhase) + "px"
      );
    }

    eoFill() {
      if (this.current.element) {
        this.current.element.setAttributeNS(null, "fill-rule", "evenodd");
      }
      this.fill();
    }

    fillStroke() {
      // Order is important since stroke wants fill to be none.
      // First stroke, then if fill needed, it will be overwritten.
      this.stroke();
      this.fill();
    }

    eoFillStroke() {
      if (this.current.element) {
        this.current.element.setAttributeNS(null, "fill-rule", "evenodd");
      }
      this.fillStroke();
    }

    closeStroke() {
      this.closePath();
      this.stroke();
    }

    closeFillStroke() {
      this.closePath();
      this.fillStroke();
    }

    closeEOFillStroke() {
      this.closePath();
      this.eoFillStroke();
    }

    paintSolidColorImageMask() {
      const rect = this.svgFactory.createElement("svg:rect");
      rect.setAttributeNS(null, "x", "0");
      rect.setAttributeNS(null, "y", "0");
      rect.setAttributeNS(null, "width", "1px");
      rect.setAttributeNS(null, "height", "1px");
      rect.setAttributeNS(null, "fill", this.current.fillColor);

      this._ensureTransformGroup().appendChild(rect);
    }

    paintImageXObject(objId) {
      const imgData = objId.startsWith("g_")
        ? this.commonObjs.get(objId)
        : this.objs.get(objId);
      if (!imgData) {
        warn(`Dependent image with object ID ${objId} is not ready yet`);
        return;
      }
      this.paintInlineImageXObject(imgData);
    }

    paintInlineImageXObject(imgData, mask) {
      const width = imgData.width;
      const height = imgData.height;

      const imgSrc = convertImgDataToPng(imgData, this.forceDataSchema, !!mask);
      const cliprect = this.svgFactory.createElement("svg:rect");
      cliprect.setAttributeNS(null, "x", "0");
      cliprect.setAttributeNS(null, "y", "0");
      cliprect.setAttributeNS(null, "width", pf(width));
      cliprect.setAttributeNS(null, "height", pf(height));
      this.current.element = cliprect;
      this.clip("nonzero");

      const imgEl = this.svgFactory.createElement("svg:image");
      imgEl.setAttributeNS(XLINK_NS, "xlink:href", imgSrc);
      imgEl.setAttributeNS(null, "x", "0");
      imgEl.setAttributeNS(null, "y", pf(-height));
      imgEl.setAttributeNS(null, "width", pf(width) + "px");
      imgEl.setAttributeNS(null, "height", pf(height) + "px");
      imgEl.setAttributeNS(
        null,
        "transform",
        `scale(${pf(1 / width)} ${pf(-1 / height)})`
      );
      if (mask) {
        mask.appendChild(imgEl);
      } else {
        this._ensureTransformGroup().appendChild(imgEl);
      }
    }

    paintImageMaskXObject(imgData) {
      const current = this.current;
      const width = imgData.width;
      const height = imgData.height;
      const fillColor = current.fillColor;

      current.maskId = `mask${maskCount++}`;
      const mask = this.svgFactory.createElement("svg:mask");
      mask.setAttributeNS(null, "id", current.maskId);

      const rect = this.svgFactory.createElement("svg:rect");
      rect.setAttributeNS(null, "x", "0");
      rect.setAttributeNS(null, "y", "0");
      rect.setAttributeNS(null, "width", pf(width));
      rect.setAttributeNS(null, "height", pf(height));
      rect.setAttributeNS(null, "fill", fillColor);
      rect.setAttributeNS(null, "mask", `url(#${current.maskId})`);

      this.defs.appendChild(mask);
      this._ensureTransformGroup().appendChild(rect);

      this.paintInlineImageXObject(imgData, mask);
    }

    paintFormXObjectBegin(matrix, bbox) {
      if (Array.isArray(matrix) && matrix.length === 6) {
        this.transform(
          matrix[0],
          matrix[1],
          matrix[2],
          matrix[3],
          matrix[4],
          matrix[5]
        );
      }

      if (bbox) {
        const width = bbox[2] - bbox[0];
        const height = bbox[3] - bbox[1];

        const cliprect = this.svgFactory.createElement("svg:rect");
        cliprect.setAttributeNS(null, "x", bbox[0]);
        cliprect.setAttributeNS(null, "y", bbox[1]);
        cliprect.setAttributeNS(null, "width", pf(width));
        cliprect.setAttributeNS(null, "height", pf(height));
        this.current.element = cliprect;
        this.clip("nonzero");
        this.endPath();
      }
    }

    paintFormXObjectEnd() {}

    /**
     * @private
     */
    _initialize(viewport) {
      const svg = this.svgFactory.create(viewport.width, viewport.height);

      // Create the definitions element.
      const definitions = this.svgFactory.createElement("svg:defs");
      svg.appendChild(definitions);
      this.defs = definitions;

      // Create the root group element, which acts a container for all other
      // groups and applies the viewport transform.
      const rootGroup = this.svgFactory.createElement("svg:g");
      rootGroup.setAttributeNS(null, "transform", pm(viewport.transform));
      svg.appendChild(rootGroup);

      // For the construction of the SVG image we are only interested in the
      // root group, so we expose it as the entry point of the SVG image for
      // the other code in this class.
      this.svg = rootGroup;

      return svg;
    }

    /**
     * @private
     */
    _ensureClipGroup() {
      if (!this.current.clipGroup) {
        const clipGroup = this.svgFactory.createElement("svg:g");
        clipGroup.setAttributeNS(null, "clip-path", this.current.activeClipUrl);
        this.svg.appendChild(clipGroup);
        this.current.clipGroup = clipGroup;
      }
      return this.current.clipGroup;
    }

    /**
     * @private
     */
    _ensureTransformGroup() {
      if (!this.tgrp) {
        this.tgrp = this.svgFactory.createElement("svg:g");
        this.tgrp.setAttributeNS(null, "transform", pm(this.transformMatrix));
        if (this.current.activeClipUrl) {
          this._ensureClipGroup().appendChild(this.tgrp);
        } else {
          this.svg.appendChild(this.tgrp);
        }
      }
      return this.tgrp;
    }
  };
}

export { SVGGraphics };
