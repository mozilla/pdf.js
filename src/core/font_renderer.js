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

import {
  assert,
  BBOX_INIT,
  bytesToString,
  DrawOPS,
  FeatureTest,
  FONT_IDENTITY_MATRIX,
  FormatError,
  shadow,
  unreachable,
  Util,
  warn,
} from "../shared/util.js";
import { CFFParser } from "./cff_parser.js";
import { compileFontPathInfo } from "./obj_bin_transform_core.js";
import { getGlyphsUnicode } from "./glyphlist.js";
import { GlyfTable } from "./glyf.js";
import { isNumberArray } from "./core_utils.js";
import { StandardEncoding } from "./encodings.js";
import { Stream } from "./stream.js";

function getSubroutineBias(subrs) {
  const numSubrs = subrs.length;
  if (numSubrs >= 33900) {
    return 32768;
  }
  return numSubrs < 1240 ? 107 : 1131;
}

function parseCmap(data, start, end) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const offset =
    view.getUint16(start + 2) === 1
      ? view.getUint32(start + 8)
      : view.getUint32(start + 16);
  const format = view.getUint16(start + offset);
  let ranges, p, i;
  if (format === 4) {
    // Skip length, at `start + offset + 2`.
    const segCount = view.getUint16(start + offset + 6) >> 1;
    p = start + offset + 14;
    ranges = [];
    for (i = 0; i < segCount; i++, p += 2) {
      ranges[i] = { end: view.getUint16(p) };
    }
    p += 2;
    for (i = 0; i < segCount; i++, p += 2) {
      ranges[i].start = view.getUint16(p);
    }
    for (i = 0; i < segCount; i++, p += 2) {
      ranges[i].idDelta = view.getUint16(p);
    }
    for (i = 0; i < segCount; i++, p += 2) {
      let idOffset = view.getUint16(p);
      if (idOffset === 0) {
        continue;
      }
      ranges[i].ids = [];
      for (let j = 0, jj = ranges[i].end - ranges[i].start + 1; j < jj; j++) {
        ranges[i].ids[j] = view.getUint16(p + idOffset);
        idOffset += 2;
      }
    }
    return ranges;
  } else if (format === 12) {
    const groups = view.getUint32(start + offset + 12);
    p = start + offset + 16;
    ranges = [];
    for (i = 0; i < groups; i++) {
      start = view.getUint32(p);
      ranges.push({
        start,
        end: view.getUint32(p + 4),
        idDelta: view.getUint32(p + 8) - start,
      });
      p += 12;
    }
    return ranges;
  }
  throw new FormatError(`unsupported cmap: ${format}`);
}

function parseCff(data, start, end, seacAnalysisEnabled, validate) {
  const properties = {};
  const parser = new CFFParser(
    new Stream(data, start, end - start),
    properties,
    seacAnalysisEnabled
  );
  const cff = parser.parse(validate);
  return {
    glyphs: cff.charStrings.objects,
    subrs: cff.topDict.privateDict?.subrsIndex?.objects,
    gsubrs: cff.globalSubrIndex?.objects,
    isCFFCIDFont: cff.isCIDFont,
    fdSelect: cff.fdSelect,
    fdArray: cff.fdArray,
  };
}

function parseGlyfTable(glyf, loca, isGlyphLocationsLong) {
  const view = new DataView(loca.buffer, loca.byteOffset, loca.byteLength);
  let itemSize, itemDecode;
  if (isGlyphLocationsLong) {
    itemSize = 4;
    itemDecode = (dv, offset) => dv.getUint32(offset);
  } else {
    itemSize = 2;
    itemDecode = (dv, offset) => 2 * dv.getUint16(offset);
  }
  const glyphs = [];
  let startOffset = itemDecode(view, 0);
  for (let j = itemSize; j < loca.length; j += itemSize) {
    const endOffset = itemDecode(view, j);
    glyphs.push(glyf.subarray(startOffset, endOffset));
    startOffset = endOffset;
  }
  return glyphs;
}

function lookupCmap(ranges, unicode) {
  const code = unicode.codePointAt(0);
  let gid = 0,
    l = 0,
    r = ranges.length - 1;
  while (l < r) {
    const c = (l + r + 1) >> 1;
    if (code < ranges[c].start) {
      r = c - 1;
    } else {
      l = c;
    }
  }
  if (ranges[l].start <= code && code <= ranges[l].end) {
    gid =
      (ranges[l].idDelta +
        (ranges[l].ids ? ranges[l].ids[code - ranges[l].start] : code)) &
      0xffff;
  }
  return {
    charCode: code,
    glyphId: gid,
  };
}

function compileGlyf(code, cmds, glyfTable, visitedGlyphs = new Set()) {
  if (!code?.length) {
    return;
  }
  if (visitedGlyphs.has(code)) {
    warn("compileGlyf: skipping recursive composite glyph reference.");
    return;
  }
  visitedGlyphs.add(code);

  const { contours, components } = glyfTable.getGlyph(code, visitedGlyphs);
  if (components) {
    for (const { glyph, transform } of components) {
      if (glyph) {
        cmds.save();
        cmds.transform(transform);
        compileGlyf(glyph, cmds, glyfTable, visitedGlyphs);
        cmds.restore();
      }
    }
    visitedGlyphs.delete(code);
    return;
  }

  let firstPoint = null;
  function moveTo(x, y) {
    if (firstPoint) {
      // Close the current subpath in adding a straight line to the first point.
      cmds.add(DrawOPS.lineTo, firstPoint);
    }
    firstPoint = [x, y];
    cmds.add(DrawOPS.moveTo, [x, y]);
  }
  function lineTo(x, y) {
    cmds.add(DrawOPS.lineTo, [x, y]);
  }
  function quadraticCurveTo(xa, ya, x, y) {
    cmds.add(DrawOPS.quadraticCurveTo, [xa, ya, x, y]);
  }

  // simple glyph
  for (const { flags, xCoordinates, yCoordinates } of contours) {
    // contours might have implicit points, which is located in the middle
    // between two neighboring off-curve points
    const contour = xCoordinates.map((x, i) => ({
      flags: flags[i],
      x,
      y: yCoordinates[i],
    }));
    if (contour[0].flags & 1) {
      contour.push(contour[0]); // using start point at the contour end
    } else if (contour.at(-1).flags & 1) {
      // first is off-curve point, trying to use one from the end
      contour.unshift(contour.at(-1));
    } else {
      // start and end are off-curve points, creating implicit one
      const p = {
        flags: 1,
        x: (contour[0].x + contour.at(-1).x) / 2,
        y: (contour[0].y + contour.at(-1).y) / 2,
      };
      contour.unshift(p);
      contour.push(p);
    }
    moveTo(contour[0].x, contour[0].y);
    for (let j = 1, jj = contour.length; j < jj; j++) {
      if (contour[j].flags & 1) {
        lineTo(contour[j].x, contour[j].y);
      } else if (contour[j + 1].flags & 1) {
        quadraticCurveTo(
          contour[j].x,
          contour[j].y,
          contour[j + 1].x,
          contour[j + 1].y
        );
        j++;
      } else {
        quadraticCurveTo(
          contour[j].x,
          contour[j].y,
          (contour[j].x + contour[j + 1].x) / 2,
          (contour[j].y + contour[j + 1].y) / 2
        );
      }
    }
  }
  visitedGlyphs.delete(code);
}

function compileCharString(charStringCode, cmds, font, glyphId) {
  function moveTo(x, y) {
    if (firstPoint) {
      // Close the current subpath in adding a straight line to the first point.
      cmds.add(DrawOPS.lineTo, firstPoint);
    }
    firstPoint = [x, y];
    cmds.add(DrawOPS.moveTo, [x, y]);
  }
  function lineTo(x, y) {
    cmds.add(DrawOPS.lineTo, [x, y]);
  }
  function bezierCurveTo(x1, y1, x2, y2, x, y) {
    cmds.add(DrawOPS.curveTo, [x1, y1, x2, y2, x, y]);
  }

  const stack = [];
  let x = 0,
    y = 0;
  let stems = 0;
  let firstPoint = null;

  function parse(code) {
    const view = new DataView(code.buffer, code.byteOffset, code.byteLength);
    let i = 0;
    while (i < code.length) {
      let stackClean = false;
      let v = code[i++];
      let xa, xb, ya, yb, y1, y2, y3, n, subrCode;
      switch (v) {
        case 1: // hstem
          stems += stack.length >> 1;
          stackClean = true;
          break;
        case 3: // vstem
          stems += stack.length >> 1;
          stackClean = true;
          break;
        case 4: // vmoveto
          y += stack.pop();
          moveTo(x, y);
          stackClean = true;
          break;
        case 5: // rlineto
          while (stack.length > 0) {
            x += stack.shift();
            y += stack.shift();
            lineTo(x, y);
          }
          break;
        case 6: // hlineto
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
        case 7: // vlineto
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
        case 8: // rrcurveto
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
        case 10: // callsubr
          n = stack.pop();
          subrCode = null;
          if (font.isCFFCIDFont) {
            const fdIndex = font.fdSelect.getFDIndex(glyphId);
            if (fdIndex >= 0 && fdIndex < font.fdArray.length) {
              const fontDict = font.fdArray[fdIndex];
              let subrs;
              if (fontDict.privateDict?.subrsIndex) {
                subrs = fontDict.privateDict.subrsIndex.objects;
              }
              if (subrs) {
                // Add subroutine bias.
                n += getSubroutineBias(subrs);
                subrCode = subrs[n];
              }
            } else {
              warn("Invalid fd index for glyph index.");
            }
          } else {
            subrCode = font.subrs[n + font.subrsBias];
          }
          if (subrCode) {
            parse(subrCode);
          }
          break;
        case 11: // return
          return;
        case 12:
          v = code[i++];
          switch (v) {
            case 34: // flex
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
            case 35: // flex
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
              stack.pop(); // fd
              break;
            case 36: // hflex1
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
            case 37: // flex1
              const x0 = x,
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
              throw new FormatError(`unknown operator: 12 ${v}`);
          }
          break;
        case 14: // endchar
          if (stack.length >= 4) {
            const achar = stack.pop();
            const bchar = stack.pop();
            y = stack.pop();
            x = stack.pop();
            cmds.save();
            cmds.translate(x, y);
            let cmap = lookupCmap(
              font.cmap,
              String.fromCharCode(font.glyphNameMap[StandardEncoding[achar]])
            );
            compileCharString(
              font.glyphs[cmap.glyphId],
              cmds,
              font,
              cmap.glyphId
            );
            cmds.restore();

            cmap = lookupCmap(
              font.cmap,
              String.fromCharCode(font.glyphNameMap[StandardEncoding[bchar]])
            );
            compileCharString(
              font.glyphs[cmap.glyphId],
              cmds,
              font,
              cmap.glyphId
            );
          }
          return;
        case 18: // hstemhm
          stems += stack.length >> 1;
          stackClean = true;
          break;
        case 19: // hintmask
          stems += stack.length >> 1;
          i += (stems + 7) >> 3;
          stackClean = true;
          break;
        case 20: // cntrmask
          stems += stack.length >> 1;
          i += (stems + 7) >> 3;
          stackClean = true;
          break;
        case 21: // rmoveto
          y += stack.pop();
          x += stack.pop();
          moveTo(x, y);
          stackClean = true;
          break;
        case 22: // hmoveto
          x += stack.pop();
          moveTo(x, y);
          stackClean = true;
          break;
        case 23: // vstemhm
          stems += stack.length >> 1;
          stackClean = true;
          break;
        case 24: // rcurveline
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
        case 25: // rlinecurve
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
        case 26: // vvcurveto
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
        case 27: // hhcurveto
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
          stack.push(view.getInt16(i));
          i += 2;
          break;
        case 29: // callgsubr
          n = stack.pop() + font.gsubrsBias;
          subrCode = font.gsubrs[n];
          if (subrCode) {
            parse(subrCode);
          }
          break;
        case 30: // vhcurveto
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
        case 31: // hvcurveto
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
            throw new FormatError(`unknown operator: ${v}`);
          }
          if (v < 247) {
            stack.push(v - 139);
          } else if (v < 251) {
            stack.push((v - 247) * 256 + code[i++] + 108);
          } else if (v < 255) {
            stack.push(-(v - 251) * 256 - code[i++] - 108);
          } else {
            stack.push(view.getInt32(i) / 65536);
            i += 4;
          }
          break;
      }
      if (stackClean) {
        stack.length = 0;
      }
    }
  }
  parse(charStringCode);
}

class Commands {
  cmds = [];

  transformStack = [];

  currentTransform = [1, 0, 0, 1, 0, 0];

  add(cmd, args) {
    if (args) {
      const { currentTransform } = this;
      for (let i = 0, ii = args.length; i < ii; i += 2) {
        Util.applyTransform(args, currentTransform, i);
      }
      this.cmds.push(cmd, ...args);
    } else {
      this.cmds.push(cmd);
    }
  }

  transform(transf) {
    this.currentTransform = Util.transform(this.currentTransform, transf);
  }

  translate(x, y) {
    this.transform([1, 0, 0, 1, x, y]);
  }

  save() {
    this.transformStack.push(this.currentTransform);
  }

  restore() {
    this.currentTransform = this.transformStack.pop() || [1, 0, 0, 1, 0, 0];
  }

  getPath() {
    if (
      (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) ||
      FeatureTest.isFloat16ArraySupported
    ) {
      return new Float16Array(this.cmds);
    }
    return new Float32Array(this.cmds);
  }
}

// Only keeps the bounds of the outline points.
class BBoxCommands extends Commands {
  bbox = BBOX_INIT.slice();

  add(cmd, args) {
    if (!args) {
      return;
    }
    const { bbox, currentTransform } = this;
    for (let i = 0, ii = args.length; i < ii; i += 2) {
      Util.applyTransform(args, currentTransform, i);
      Util.pointBoundingBox(args[i], args[i + 1], bbox);
    }
  }
}

class CompiledFont {
  #compiledCharCodes = new Set();

  #compiledGlyphs = new Map();

  #charBBoxes = new Map();

  #glyphBBoxes = new Map();

  constructor(fontMatrix) {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === CompiledFont
    ) {
      unreachable("Cannot initialize CompiledFont.");
    }
    this.fontMatrix = fontMatrix;
  }

  static get NOOP() {
    return shadow(
      this,
      "NOOP",
      (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) ||
        FeatureTest.isFloat16ArraySupported
        ? new Float16Array(0)
        : new Float32Array(0)
    );
  }

  getPath(unicode) {
    const { charCode, glyphId } = lookupCmap(this.cmap, unicode);

    if (
      this.#compiledGlyphs.has(glyphId) &&
      this.#compiledCharCodes.has(charCode)
    ) {
      return null; // Previously compiled.
    }

    const path = this.#compiledGlyphs.getOrInsertComputed(glyphId, () => {
      try {
        return this.compileGlyph(this.glyphs[glyphId], glyphId);
      } catch (ex) {
        return ex; // Avoid attempting to re-compile a corrupt glyph.
      }
    });
    this.#compiledCharCodes.add(charCode);

    if (path instanceof Error) {
      throw path;
    }
    return compileFontPathInfo(path);
  }

  /**
   * @param {string} unicode
   * @returns {Array<number> | null | false} Bounds of the outline points in
   *   text space, null for an empty glyph, or false if it can't be compiled.
   */
  getGlyphBBox(unicode) {
    return this.#charBBoxes.getOrInsertComputed(unicode, () =>
      this.#getGlyphIdBBox(lookupCmap(this.cmap, unicode).glyphId)
    );
  }

  #getGlyphIdBBox(glyphId) {
    return this.#glyphBBoxes.getOrInsertComputed(glyphId, () => {
      const code = this.glyphs[glyphId];
      if (!code?.length || code[0] === 14) {
        return null;
      }
      const cmds = new BBoxCommands();
      try {
        this.#compileCommands(code, glyphId, cmds);
      } catch (ex) {
        warn(`getGlyphBBox: "${ex}".`);
        return false;
      }
      const { bbox } = cmds;
      return bbox[0] <= bbox[2] ? bbox : null;
    });
  }

  compileGlyph(code, glyphId) {
    if (!code?.length || code[0] === 14) {
      return CompiledFont.NOOP;
    }

    const cmds = new Commands();
    this.#compileCommands(code, glyphId, cmds);
    cmds.add(DrawOPS.closePath);

    return cmds.getPath();
  }

  #compileCommands(code, glyphId, cmds) {
    let fontMatrix = this.fontMatrix;
    if (this.isCFFCIDFont) {
      // Top DICT's FontMatrix can be ignored because CFFCompiler always
      // removes it and copies to FDArray DICTs.
      const fdIndex = this.fdSelect.getFDIndex(glyphId);
      if (fdIndex >= 0 && fdIndex < this.fdArray.length) {
        const fontDict = this.fdArray[fdIndex];
        fontMatrix = fontDict.getByName("FontMatrix") || FONT_IDENTITY_MATRIX;
      } else {
        warn("Invalid fd index for glyph index.");
      }
    }
    assert(isNumberArray(fontMatrix, 6), "Expected a valid fontMatrix.");

    cmds.transform(fontMatrix);
    this.compileGlyphImpl(code, cmds, glyphId);
  }

  compileGlyphImpl() {
    unreachable("Children classes should implement this.");
  }
}

class TrueTypeCompiled extends CompiledFont {
  constructor(glyphs, cmap, fontMatrix) {
    super(fontMatrix || [0.000488, 0, 0, 0.000488, 0, 0]);

    this.glyphs = glyphs;
    this.cmap = cmap;
    this.glyfTable = new GlyfTable(glyphs);
  }

  compileGlyphImpl(code, cmds) {
    compileGlyf(code, cmds, this.glyfTable);
  }
}

class Type2Compiled extends CompiledFont {
  constructor(cffInfo, cmap, fontMatrix) {
    super(fontMatrix || [0.001, 0, 0, 0.001, 0, 0]);

    this.glyphs = cffInfo.glyphs;
    this.gsubrs = cffInfo.gsubrs || [];
    this.subrs = cffInfo.subrs || [];
    this.cmap = cmap;
    this.glyphNameMap = getGlyphsUnicode();

    this.gsubrsBias = getSubroutineBias(this.gsubrs);
    this.subrsBias = getSubroutineBias(this.subrs);

    this.isCFFCIDFont = cffInfo.isCFFCIDFont;
    this.fdSelect = cffInfo.fdSelect;
    this.fdArray = cffInfo.fdArray;
  }

  compileGlyphImpl(code, cmds, glyphId) {
    compileCharString(code, cmds, this, glyphId);
  }
}

class FontRendererFactory {
  static create(font, seacAnalysisEnabled, validate = true) {
    const data =
        font.data instanceof Uint8Array ? font.data : new Uint8Array(font.data),
      view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let cmap, glyf, loca, cff, indexToLocFormat, unitsPerEm;
    const numTables = view.getUint16(4);
    for (let i = 0, p = 12; i < numTables; i++, p += 16) {
      const tag = bytesToString(data.subarray(p, p + 4));
      const offset = view.getUint32(p + 8);
      const length = view.getUint32(p + 12);
      switch (tag) {
        case "cmap":
          cmap = parseCmap(data, offset, offset + length);
          break;
        case "glyf":
          glyf = data.subarray(offset, offset + length);
          break;
        case "loca":
          loca = data.subarray(offset, offset + length);
          break;
        case "head":
          unitsPerEm = view.getUint16(offset + 18);
          indexToLocFormat = view.getUint16(offset + 50);
          break;
        case "CFF ":
          cff = parseCff(
            data,
            offset,
            offset + length,
            seacAnalysisEnabled,
            validate
          );
          break;
      }
    }

    if (glyf) {
      const fontMatrix = !unitsPerEm
        ? font.fontMatrix
        : [1 / unitsPerEm, 0, 0, 1 / unitsPerEm, 0, 0];
      return new TrueTypeCompiled(
        parseGlyfTable(glyf, loca, indexToLocFormat),
        cmap,
        fontMatrix
      );
    }
    return new Type2Compiled(cff, cmap, font.fontMatrix);
  }
}

export { FontRendererFactory };
