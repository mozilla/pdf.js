/* Copyright 2026 Mozilla Foundation
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
  BBOX_INIT,
  FONT_IDENTITY_MATRIX,
  OPS,
  TextRenderingMode,
  Util,
} from "../shared/util.js";
import { IDENTITY_MATRIX } from "./core_utils.js";

const EMPTY_BBOX = new Uint32Array(new Uint8Array([255, 255, 0, 0]).buffer)[0];

const LINE_WIDTH = 0;
const LINE_CAP = 1;
const LINE_JOIN = 2;
const MITER_LIMIT = 3;
const DASH = 4;
const FONT = 5;
const STROKE_ALPHA = 6;
const FILL_ALPHA = 7;
const BLEND_MODE = 8;
const SMASK = 9;
const FILTER = 10;
const STROKE_COLOR = 11;
const FILL_COLOR = 12;
const CHAR_SPACING = 13;
const WORD_SPACING = 14;
const H_SCALE = 15;
const LEADING = 16;
const TEXT_RENDERING_MODE = 17;
const TEXT_RISE = 18;
const TEXT_MATRIX = 19;
const SLOT_COUNT = 20;

const FILL_DEPENDENCIES = [FILTER, FILL_COLOR, FILL_ALPHA, BLEND_MODE, SMASK];
const IMAGE_DEPENDENCIES = [
  FILTER,
  FILL_ALPHA,
  STROKE_ALPHA,
  BLEND_MODE,
  SMASK,
];
const STROKE_DEPENDENCIES = [
  FILTER,
  STROKE_COLOR,
  STROKE_ALPHA,
  LINE_WIDTH,
  LINE_CAP,
  LINE_JOIN,
  MITER_LIMIT,
  DASH,
  BLEND_MODE,
  SMASK,
];
const TEXT_DEPENDENCIES = [
  LEADING,
  CHAR_SPACING,
  WORD_SPACING,
  H_SCALE,
  TEXT_RISE,
  TEXT_MATRIX,
  FONT,
  FILTER,
  FILL_COLOR,
  TEXT_RENDERING_MODE,
  SMASK,
  FILL_ALPHA,
  STROKE_ALPHA,
  BLEND_MODE,
];
const FILL_STROKE_DEPENDENCIES = [
  ...new Set([...FILL_DEPENDENCIES, ...STROKE_DEPENDENCIES]),
];
const TEXT_STROKE_DEPENDENCIES = [
  ...new Set([...TEXT_DEPENDENCIES, ...STROKE_DEPENDENCIES]),
];
const GROUP_DEPENDENCIES = [FILL_ALPHA, STROKE_ALPHA, BLEND_MODE];

const PATH_DEPENDENCIES = new Map([
  [OPS.stroke, STROKE_DEPENDENCIES],
  [OPS.closeStroke, STROKE_DEPENDENCIES],
  [OPS.fill, FILL_DEPENDENCIES],
  [OPS.eoFill, FILL_DEPENDENCIES],
  [OPS.rawFillPath, FILL_DEPENDENCIES],
  [OPS.fillStroke, FILL_STROKE_DEPENDENCIES],
  [OPS.eoFillStroke, FILL_STROKE_DEPENDENCIES],
  [OPS.closeFillStroke, FILL_STROKE_DEPENDENCIES],
  [OPS.closeEOFillStroke, FILL_STROKE_DEPENDENCIES],
]);

function isValidBBox(bbox) {
  return (
    !!bbox &&
    bbox[0] <= bbox[2] &&
    bbox[1] <= bbox[3] &&
    bbox[0] > -Infinity &&
    bbox[1] > -Infinity &&
    bbox[2] < Infinity &&
    bbox[3] < Infinity
  );
}

/**
 * Writes the transformed rectangle's axis-aligned bounds into `output`.
 * @returns {boolean} Whether the result is a valid box.
 */
function transformRect(x0, y0, x1, y1, matrix, output) {
  output[0] = output[1] = Infinity;
  output[2] = output[3] = -Infinity;
  Util.transformedRectBoundingBox(x0, y0, x1, y1, matrix, output);
  return isValidBBox(output);
}

function transformBBox(bbox, matrix) {
  if (!isValidBBox(bbox)) {
    return null;
  }
  const output = [0, 0, 0, 0];
  return transformRect(bbox[0], bbox[1], bbox[2], bbox[3], matrix, output)
    ? output
    : null;
}

class BoundingBoxState {
  constructor(clipBox = null, state = null) {
    if (state) {
      this.ctm = state.ctm;
      this.clipBox = state.clipBox;
      this.lineWidth = state.lineWidth;
      this.lineCap = state.lineCap;
      this.lineJoin = state.lineJoin;
      this.miterLimit = state.miterLimit;
      this.font = state.font;
      this.fontSize = state.fontSize;
      this.fontDirection = state.fontDirection;
      this.charSpacing = state.charSpacing;
      this.wordSpacing = state.wordSpacing;
      this.textHScale = state.textHScale;
      this.leading = state.leading;
      this.textRise = state.textRise;
      this.textRenderingMode = state.textRenderingMode;
      this.textMatrix = state.textMatrix;
      this.x = state.x;
      this.y = state.y;
      this.lineX = state.lineX;
      this.lineY = state.lineY;
      this.clipDependency = state.clipDependency;
      this.simple = state.simple.slice();
      this.transform = state.transform;
      this.moveText = state.moveText;
      this.sameLineText = state.sameLineText;
      return;
    }
    this.ctm = IDENTITY_MATRIX;
    this.clipBox = clipBox?.slice() || [
      -Infinity,
      -Infinity,
      Infinity,
      Infinity,
    ];
    this.lineWidth = 1;
    this.lineCap = 0;
    this.lineJoin = 0;
    this.miterLimit = 10;
    this.font = null;
    this.fontSize = 0;
    this.fontDirection = 1;
    this.charSpacing = 0;
    this.wordSpacing = 0;
    this.textHScale = 1;
    this.leading = 0;
    this.textRise = 0;
    this.textRenderingMode = TextRenderingMode.FILL;
    this.textMatrix = null;
    this.x = 0;
    this.y = 0;
    this.lineX = 0;
    this.lineY = 0;
    this.clipDependency = -1;
    this.simple = new Array(SLOT_COUNT).fill(-1);
    this.transform = -1;
    this.moveText = -1;
    this.sameLineText = -1;
  }

  clone() {
    return new BoundingBoxState(null, this);
  }
}

/**
 * Computes operation bounds in page space, including dependent operations.
 * Stores four bytes per operation, quantized to 1/256 of the page box.
 */
class OperatorListBBoxTracker {
  #annotationStates = [];

  #baseTransform = [1, 0, 0, 1, 0, 0];

  #bbox = [0, 0, 0, 0];

  #boxes = new Uint8ClampedArray(0);

  #edgeCount = 0;

  #edges = new Int32Array(1024);

  #edgeStart = new Int32Array(1);

  #fontInfo = new Map();

  #groupEnds = [];

  #groupIndex = -1;

  #fonts;

  #index = 0;

  #keptIndices = [];

  #lastClosedSMaskGroup = null;

  #length = 0;

  #namedDependencies = new Map();

  #openGroups = [];

  #pageBBox;

  #pendingClip = -1;

  #scaleX;

  #scaleY;

  #state;

  #stateStack = [];

  #textClipBBox = null;

  #textClipOperations = null;

  #textClipOptional = false;

  #textClipPainted = false;

  #x0;

  #y0;

  /**
   * @param {Array<number>} pageBBox
   * @param {Map<string, object>} fonts - Fonts by loaded name.
   */
  constructor(pageBBox, fonts) {
    this.#pageBBox = isValidBBox(pageBBox) ? pageBBox.slice() : null;
    this.#fonts = fonts;
    this.#state = new BoundingBoxState(this.#pageBBox);
    const [x0, y0, x1, y1] = this.#pageBBox || [0, 0, 1, 1];
    this.#x0 = x0;
    this.#y0 = y0;
    this.#scaleX = 256 / (x1 - x0 || 1);
    this.#scaleY = 256 / (y1 - y0 || 1);
  }

  #ensureLength(length) {
    if (this.#boxes.length >= length * 4) {
      return;
    }
    const capacity = Math.max(length, 2 * (this.#boxes.length >> 2), 256);
    const boxes = new Uint8ClampedArray(capacity * 4);
    new Uint32Array(boxes.buffer).fill(EMPTY_BBOX);
    boxes.set(this.#boxes);
    this.#boxes = boxes;
    const edgeStart = new Int32Array(capacity + 1);
    edgeStart.set(this.#edgeStart);
    this.#edgeStart = edgeStart;
  }

  #expandIndex(index, minX, minY, maxX, maxY) {
    const boxes = this.#boxes;
    const offset = index * 4;
    boxes[offset] = Math.min(
      boxes[offset],
      Math.floor((minX - this.#x0) * this.#scaleX)
    );
    boxes[offset + 1] = Math.min(
      boxes[offset + 1],
      Math.floor((minY - this.#y0) * this.#scaleY)
    );
    boxes[offset + 2] = Math.max(
      boxes[offset + 2],
      Math.ceil((maxX - this.#x0) * this.#scaleX)
    );
    boxes[offset + 3] = Math.max(
      boxes[offset + 3],
      Math.ceil((maxY - this.#y0) * this.#scaleY)
    );
  }

  #addDependency(dependency) {
    if (dependency < 0 || dependency >= this.#index) {
      return;
    }
    if (this.#edgeCount === this.#edges.length) {
      const edges = new Int32Array(this.#edges.length * 2);
      edges.set(this.#edges);
      this.#edges = edges;
    }
    this.#edges[this.#edgeCount++] = dependency;
  }

  #recordIncrementalData(name, index) {
    const state = this.#state;
    this.#addDependency(state[name]);
    state[name] = index;
  }

  #recordOperation(index, bbox, slots, isText = false) {
    const state = this.#state;
    const { simple } = state;
    for (const slot of slots) {
      this.#addDependency(simple[slot]);
    }
    this.#addDependency(state.transform);
    if (isText) {
      this.#addDependency(state.moveText);
      this.#addDependency(state.sameLineText);
    }
    this.#addDependency(state.clipDependency);

    if (!isValidBBox(bbox)) {
      return;
    }
    const { clipBox } = state;
    const minX = Math.max(bbox[0], clipBox[0]);
    const minY = Math.max(bbox[1], clipBox[1]);
    const maxX = Math.min(bbox[2], clipBox[2]);
    const maxY = Math.min(bbox[3], clipBox[3]);
    if (!(minX <= maxX && minY <= maxY)) {
      return;
    }
    this.#expandIndex(index, minX, minY, maxX, maxY);
  }

  #updateClip(bbox) {
    const { clipBox } = this.#state;
    this.#state.clipBox =
      (clipBox[0] !== Infinity &&
        isValidBBox(bbox) &&
        Util.intersect(clipBox, bbox)) ||
      BBOX_INIT.slice();
  }

  #openGroup(type, index) {
    const group = { index, type, smask: false, optional: false };
    this.#openGroups.push(group);
    this.#groupIndex = index;
    return group;
  }

  #closeGroup(type, index) {
    const position = this.#openGroups.findLastIndex(
      group => group.type === type
    );
    if (position < 0) {
      return;
    }
    const [group] = this.#openGroups.splice(position, 1);
    this.#groupIndex = this.#openGroups.at(-1)?.index ?? -1;
    if (group.smask) {
      this.#lastClosedSMaskGroup = { begin: group.index, end: index };
    }
    if (group.optional) {
      this.#keptIndices.push(index);
    }
    this.#groupEnds.push(group.index, index);
  }

  #save(index, type) {
    this.#stateStack.push(this.#state);
    this.#state = this.#state.clone();
    return this.#openGroup(type, index);
  }

  #restore(index, type) {
    this.#pendingClip = -1;
    this.#closeGroup(type, index);
    this.#state = this.#stateStack.pop() || this.#state;
  }

  #recordPatternDependencies(args) {
    if (args[0] !== "TilingPattern") {
      this.#addDependency(this.#namedDependencies.get(args[1]) ?? -1);
      return;
    }
    // The evaluator hoists nested patterns' dependencies into this list.
    const { fnArray, argsArray } = args[2];
    for (let i = 0, ii = fnArray.length; i < ii; i++) {
      if (fnArray[i] === OPS.dependency) {
        for (const name of argsArray[i]) {
          this.#addDependency(this.#namedDependencies.get(name) ?? -1);
        }
      }
    }
  }

  #setFont(index, loadedName, size) {
    const state = this.#state;
    state.font = this.#fonts.get(loadedName) || null;
    state.fontDirection = size < 0 ? -1 : 1;
    state.fontSize = Math.abs(size);
    state.simple[FONT] = index;
    this.#addDependency(this.#namedDependencies.get(loadedName) ?? -1);
  }

  #setGState(index, entries) {
    const state = this.#state;
    const { simple } = state;
    for (const [key, value] of entries || []) {
      switch (key) {
        case "LW":
          state.lineWidth = value;
          simple[LINE_WIDTH] = index;
          break;
        case "LC":
          state.lineCap = value;
          simple[LINE_CAP] = index;
          break;
        case "LJ":
          state.lineJoin = value;
          simple[LINE_JOIN] = index;
          break;
        case "ML":
          state.miterLimit = value;
          simple[MITER_LIMIT] = index;
          break;
        case "D":
          simple[DASH] = index;
          break;
        case "Font":
          this.#setFont(index, value[0], value[1]);
          break;
        case "CA":
          simple[STROKE_ALPHA] = index;
          break;
        case "ca":
          simple[FILL_ALPHA] = index;
          break;
        case "BM":
          simple[BLEND_MODE] = index;
          break;
        case "SMask":
          simple[SMASK] = index;
          if (value && this.#lastClosedSMaskGroup) {
            const { begin, end } = this.#lastClosedSMaskGroup;
            for (let i = begin; i <= end; i++) {
              this.#addDependency(i);
            }
            this.#lastClosedSMaskGroup = null;
          }
          break;
        case "TR":
          simple[FILTER] = index;
          break;
      }
    }
  }

  #getStrokeExtra() {
    const { lineCap, lineJoin, lineWidth, miterLimit } = this.#state;
    const width = Math.abs(lineWidth);
    const halfWidth = width / 2;
    const joinExtra =
      lineJoin === 0 ? width * Math.max(miterLimit, 0.5) : halfWidth;
    const capExtra = lineCap === 2 ? halfWidth * Math.SQRT2 : halfWidth;
    return Math.max(joinExtra, capExtra);
  }

  #recordPath(index, args) {
    const minMax = args?.[2];
    const state = this.#state;
    const slots = PATH_DEPENDENCIES.get(args?.[0]);
    if (slots) {
      let bbox = null;
      if (minMax) {
        let x0 = minMax[0];
        let y0 = minMax[1];
        let x1 = minMax[2];
        let y1 = minMax[3];
        if (
          slots === STROKE_DEPENDENCIES ||
          slots === FILL_STROKE_DEPENDENCIES
        ) {
          const extra = this.#getStrokeExtra();
          x0 -= extra;
          y0 -= extra;
          x1 += extra;
          y1 += extra;
        }
        bbox = transformRect(x0, y0, x1, y1, state.ctm, this.#bbox)
          ? this.#bbox
          : null;
      }
      this.#recordOperation(index, bbox, slots);
    }

    if (this.#pendingClip !== -1) {
      const clipBBox = transformBBox(minMax, state.ctm);
      this.#addDependency(this.#pendingClip);
      this.#addDependency(state.clipDependency);
      this.#addDependency(state.transform);
      state.clipDependency = index;
      if (clipBBox) {
        this.#updateClip(clipBBox);
      }
      this.#pendingClip = -1;
    }
  }

  #getFontInfo(font) {
    let info = this.#fontInfo.get(font);
    if (info) {
      return info;
    }
    const fontMatrix = font?.fontMatrix || FONT_IDENTITY_MATRIX;
    const fontBBox = font?.bbox;
    info = {
      fontMatrix,
      bbox:
        fontBBox && fontBBox[0] !== fontBBox[2] && fontBBox[1] !== fontBBox[3]
          ? transformBBox(fontBBox, fontMatrix)
          : null,
      type3BBoxes: font?.isType3Font ? new Map() : null,
      ascent:
        Number.isFinite(font?.ascent) && font.ascent > 0
          ? Math.max(font.ascent, 1)
          : 1,
      descent:
        Number.isFinite(font?.descent) && font.descent < 0
          ? Math.min(font.descent, -0.25)
          : -0.25,
    };
    this.#fontInfo.set(font, info);
    return info;
  }

  #getType3GlyphBBox(font, info, id) {
    let bbox = info.type3BBoxes.get(id);
    if (bbox !== undefined) {
      return bbox;
    }
    const operatorList = font.charProcOperatorList?.get(id);
    const index = operatorList?.fnArray.indexOf(OPS.setCharWidthAndBounds);
    bbox = false;
    if (index >= 0) {
      const bounds = operatorList.argsArray[index].slice(2, 6);
      if (bounds[0] !== bounds[2] && bounds[1] !== bounds[3]) {
        bbox = transformBBox(bounds, info.fontMatrix);
      }
    }
    if (font.charProcOperatorList) {
      info.type3BBoxes.set(id, bbox);
    }
    return bbox;
  }

  /**
   * @returns {boolean} Whether font or Type3 glyph bounds are available.
   */
  #getGlyphBBox(font, info, glyph, output) {
    let bbox = info.bbox;
    if (info.type3BBoxes) {
      const type3BBox = this.#getType3GlyphBBox(
        font,
        info,
        glyph.operatorListId
      );
      if (type3BBox !== false) {
        bbox = type3BBox;
      }
    }
    if (!bbox) {
      return false;
    }
    output[0] = bbox[0];
    output[1] = bbox[1];
    output[2] = bbox[2];
    output[3] = bbox[3];
    const right =
      (Math.abs(
        (glyph.width || font?.defaultWidth || 0) * info.fontMatrix[0]
      ) || 0) + 1;
    if (right < Infinity) {
      Util.rectBoundingBox(-1, info.descent, right, info.ascent, output);
    }
    return true;
  }

  #showText(index, glyphs) {
    const state = this.#state;
    const { font, fontSize, textRenderingMode } = state;
    const isType3 = !!font?.isType3Font;
    const fillStrokeMode =
      textRenderingMode & TextRenderingMode.FILL_STROKE_MASK;
    const isStroke =
      !isType3 &&
      (fillStrokeMode === TextRenderingMode.STROKE ||
        fillStrokeMode === TextRenderingMode.FILL_STROKE);
    const isVisible = isType3
      ? textRenderingMode !== TextRenderingMode.INVISIBLE
      : fillStrokeMode !== TextRenderingMode.INVISIBLE;
    const isClip =
      !isType3 &&
      (textRenderingMode & TextRenderingMode.ADD_TO_PATH_FLAG) !== 0;
    let bbox = null;

    if (fontSize !== 0) {
      const info = this.#getFontInfo(font);
      const vertical = !!font?.vertical;
      const spacingDirection = vertical ? 1 : -1;
      const t = state.textMatrix || IDENTITY_MATRIX;
      const c = state.ctm;
      const a0 = c[0] * t[0] + c[2] * t[1];
      const a1 = c[1] * t[0] + c[3] * t[1];
      const a2 = c[0] * t[2] + c[2] * t[3];
      const a3 = c[1] * t[2] + c[3] * t[3];
      const tx = state.x;
      const ty = state.y + state.textRise;
      const sx = state.textHScale * state.fontDirection;
      let sy = state.fontDirection;
      if (!isType3) {
        sy = state.fontDirection > 0 ? -1 : 1;
      }
      const baseTransform = this.#baseTransform;
      baseTransform[0] = a0 * sx;
      baseTransform[1] = a1 * sx;
      baseTransform[2] = a2 * sy;
      baseTransform[3] = a3 * sy;
      baseTransform[4] = a0 * tx + a2 * ty + (c[0] * t[4] + c[2] * t[5] + c[4]);
      baseTransform[5] = a1 * tx + a3 * ty + (c[1] * t[4] + c[3] * t[5] + c[5]);
      const axisAligned = baseTransform[1] === 0 && baseTransform[2] === 0;

      const widthAdvanceScale = fontSize * info.fontMatrix[0];
      const glyphBBox = [0, 0, 0, 0];
      const glyphTransform = [
        fontSize,
        0,
        0,
        isType3 ? fontSize : -fontSize,
        0,
        0,
      ];
      const box = this.#bbox;
      const runBBox = BBOX_INIT.slice();
      let hasGlyphBBox = false;
      let advance = 0;
      let untrusted = false;
      for (const glyph of glyphs || []) {
        if (typeof glyph === "number") {
          advance += (spacingDirection * glyph * fontSize) / 1000;
          continue;
        }

        const spacing =
          (glyph.isSpace ? state.wordSpacing : 0) + state.charSpacing;
        let glyphWidth = glyph.width;
        let x = advance;
        let y = 0;
        if (vertical) {
          const vmetric = glyph.vmetric || font?.defaultVMetrics;
          x = -(glyph.vmetric ? vmetric[1] : glyphWidth * 0.5);
          x *= widthAdvanceScale;
          y = advance + (vmetric ? vmetric[2] : 0) * widthAdvanceScale;
          glyphWidth = -(vmetric ? vmetric[0] : glyphWidth);
        }

        if (this.#getGlyphBBox(font, info, glyph, glyphBBox)) {
          hasGlyphBBox = true;
          for (let i = 0, ii = glyph.accent ? 2 : 1; i < ii; i++) {
            if (i === 0) {
              glyphTransform[4] = x;
              glyphTransform[5] = y;
            } else {
              glyphTransform[4] = x + fontSize * glyph.accent.offset.x;
              glyphTransform[5] = y - fontSize * glyph.accent.offset.y;
            }
            if (axisAligned) {
              Util.transformedRectBoundingBox(
                glyphBBox[0],
                glyphBBox[1],
                glyphBBox[2],
                glyphBBox[3],
                glyphTransform,
                runBBox
              );
            } else {
              transformRect(
                glyphBBox[0],
                glyphBBox[1],
                glyphBBox[2],
                glyphBBox[3],
                glyphTransform,
                box
              );
              Util.transformedRectBoundingBox(
                box[0],
                box[1],
                box[2],
                box[3],
                baseTransform,
                runBBox
              );
            }
          }
        } else {
          untrusted = true;
        }

        advance += vertical
          ? glyphWidth * widthAdvanceScale - spacing * state.fontDirection
          : glyphWidth * widthAdvanceScale + spacing * state.fontDirection;
      }

      if (hasGlyphBBox) {
        bbox = runBBox;
        if (
          axisAligned
            ? !transformRect(
                runBBox[0],
                runBBox[1],
                runBBox[2],
                runBBox[3],
                baseTransform,
                runBBox
              )
            : !isValidBBox(runBBox)
        ) {
          untrusted = true;
        }
      }
      if (untrusted && isValidBBox(state.clipBox)) {
        bbox = state.clipBox.slice();
      }

      if (vertical) {
        state.y -= advance;
      } else {
        state.x += advance * state.textHScale * state.fontDirection;
      }
    }

    if (isStroke && isValidBBox(bbox)) {
      const t = state.textMatrix;
      const extra =
        this.#getStrokeExtra() / ((t && Math.hypot(t[0], t[1])) || 1);
      const m = this.#baseTransform;
      const paddingX = extra * (Math.abs(m[0]) + Math.abs(m[2]));
      const paddingY = extra * (Math.abs(m[1]) + Math.abs(m[3]));
      bbox[0] -= paddingX;
      bbox[1] -= paddingY;
      bbox[2] += paddingX;
      bbox[3] += paddingY;
    }

    this.#recordOperation(
      index,
      isVisible ? bbox : null,
      isType3 || isStroke ? TEXT_STROKE_DEPENDENCIES : TEXT_DEPENDENCIES,
      /* isText = */ true
    );

    if (isClip && bbox) {
      if (isValidBBox(bbox)) {
        this.#textClipBBox ??= BBOX_INIT.slice();
        Util.rectBoundingBox(
          bbox[0],
          bbox[1],
          bbox[2],
          bbox[3],
          this.#textClipBBox
        );
      }
      (this.#textClipOperations ||= []).push(index);
      if (this.#openGroups.some(group => group.optional)) {
        this.#textClipOptional = true;
      }
      if (
        glyphs?.some(
          glyph =>
            typeof glyph !== "number" && (glyph.isInFont || font?.missingFile)
        )
      ) {
        this.#textClipPainted = true;
      }
    }
    state.sameLineText = index;
  }

  #endText(index) {
    const state = this.#state;
    if (isValidBBox(this.#textClipBBox)) {
      for (const dependency of this.#textClipOperations) {
        this.#addDependency(dependency);
      }
      this.#addDependency(state.clipDependency);
      state.clipDependency = index;
      if (this.#textClipPainted && !this.#textClipOptional) {
        this.#updateClip(this.#textClipBBox);
      }
    }
    this.#textClipBBox = this.#textClipOperations = null;
    this.#textClipOptional = this.#textClipPainted = false;
    this.#closeGroup("text", index);
  }

  #recordImage(index, bbox, slots, args) {
    const arg = args?.[0];
    const name = typeof arg === "string" ? arg : arg?.data;
    this.#addDependency(this.#namedDependencies.get(name) ?? -1);
    this.#recordOperation(index, bbox, slots);
  }

  #getUnitSquareBBox() {
    return transformRect(0, 0, 1, 1, this.#state.ctm, this.#bbox)
      ? this.#bbox
      : null;
  }

  #getImageGroupBBox(images) {
    const { ctm } = this.#state;
    const bbox = BBOX_INIT.slice();
    for (const { transform } of images || []) {
      Util.transformedRectBoundingBox(
        0,
        0,
        1,
        1,
        Util.transform(ctm, transform),
        bbox
      );
    }
    return isValidBBox(bbox) ? bbox : null;
  }

  #getRepeatBBox(a, b, c, d, positions) {
    const { ctm } = this.#state;
    const transform = Util.transform(ctm, [a, b, c, d, 0, 0]);
    const bbox = BBOX_INIT.slice();
    for (let i = 0, ii = positions.length; i < ii; i += 2) {
      const x = positions[i];
      const y = positions[i + 1];
      transform[4] = ctm[0] * x + ctm[2] * y + ctm[4];
      transform[5] = ctm[1] * x + ctm[3] * y + ctm[5];
      Util.transformedRectBoundingBox(0, 0, 1, 1, transform, bbox);
    }
    return isValidBBox(bbox) ? bbox : null;
  }

  #processOperation(fn, args, index) {
    const state = this.#state;
    const { simple } = state;
    switch (fn) {
      case OPS.dependency:
        for (const name of args || []) {
          this.#namedDependencies.set(name, index);
        }
        break;
      case OPS.setLineWidth:
        state.lineWidth = args[0];
        simple[LINE_WIDTH] = index;
        break;
      case OPS.setLineCap:
        state.lineCap = args[0];
        simple[LINE_CAP] = index;
        break;
      case OPS.setLineJoin:
        state.lineJoin = args[0];
        simple[LINE_JOIN] = index;
        break;
      case OPS.setMiterLimit:
        state.miterLimit = args[0];
        simple[MITER_LIMIT] = index;
        break;
      case OPS.setDash:
        simple[DASH] = index;
        break;
      case OPS.setGState:
        this.#setGState(index, args?.[0]);
        break;
      case OPS.save:
        this.#save(index, "save");
        break;
      case OPS.restore:
        this.#restore(index, "save");
        break;
      case OPS.transform:
        state.ctm = Util.transform(state.ctm, args);
        this.#recordIncrementalData("transform", index);
        break;
      case OPS.constructPath:
        this.#recordPath(index, args);
        break;
      case OPS.clip:
      case OPS.eoClip:
        this.#pendingClip = index;
        break;
      case OPS.beginText:
        state.textMatrix = null;
        state.x = state.lineX = 0;
        state.y = state.lineY = 0;
        state.sameLineText = state.moveText = -1;
        this.#openGroup("text", index);
        break;
      case OPS.endText:
        this.#endText(index);
        break;
      case OPS.setCharSpacing:
        state.charSpacing = args[0];
        simple[CHAR_SPACING] = index;
        break;
      case OPS.setWordSpacing:
        state.wordSpacing = args[0];
        simple[WORD_SPACING] = index;
        break;
      case OPS.setHScale:
        state.textHScale = args[0] / 100;
        simple[H_SCALE] = index;
        break;
      case OPS.setLeading:
        state.leading = -args[0];
        simple[LEADING] = index;
        break;
      case OPS.setFont:
        this.#setFont(index, args[0], args[1]);
        break;
      case OPS.setTextRenderingMode:
        state.textRenderingMode = args[0];
        simple[TEXT_RENDERING_MODE] = index;
        break;
      case OPS.setTextRise:
        state.textRise = args[0];
        simple[TEXT_RISE] = index;
        break;
      case OPS.setLeadingMoveText:
        state.leading = args[1];
        simple[LEADING] = index;
      // falls through
      case OPS.moveText:
        state.x = state.lineX += args[0];
        state.y = state.lineY += args[1];
        state.sameLineText = -1;
        this.#recordIncrementalData("moveText", index);
        break;
      case OPS.setTextMatrix:
        state.textMatrix = args[0].slice();
        state.x = state.lineX = 0;
        state.y = state.lineY = 0;
        state.sameLineText = state.moveText = -1;
        simple[TEXT_MATRIX] = index;
        break;
      case OPS.nextLine:
        state.x = state.lineX;
        state.y = state.lineY += state.leading;
        state.sameLineText = -1;
        this.#addDependency(simple[LEADING]);
        this.#recordIncrementalData("moveText", index);
        break;
      case OPS.showText:
        this.#showText(index, args[0]);
        break;
      case OPS.setStrokeRGBColor:
      case OPS.setStrokeTransparent:
        simple[STROKE_COLOR] = index;
        break;
      case OPS.setStrokeColorN:
        simple[STROKE_COLOR] = index;
        this.#recordPatternDependencies(args);
        break;
      case OPS.setFillRGBColor:
      case OPS.setFillTransparent:
        simple[FILL_COLOR] = index;
        break;
      case OPS.setFillColorN:
        simple[FILL_COLOR] = index;
        this.#recordPatternDependencies(args);
        break;
      case OPS.shadingFill:
        this.#recordImage(
          index,
          isValidBBox(state.clipBox) ? state.clipBox : this.#pageBBox,
          FILL_DEPENDENCIES,
          args
        );
        break;
      case OPS.paintFormXObjectBegin:
        this.#save(index, "form");
        if (args?.[0]) {
          this.#state.ctm = Util.transform(this.#state.ctm, args[0]);
        }
        if (args?.[1]) {
          this.#updateClip(transformBBox(args[1], this.#state.ctm));
        }
        break;
      case OPS.paintFormXObjectEnd:
        this.#restore(index, "form");
        break;
      case OPS.beginGroup: {
        const group = args[0];
        const trackerGroup = this.#save(index, "group");
        trackerGroup.smask = !!group?.smask;
        for (const slot of GROUP_DEPENDENCIES) {
          this.#addDependency(simple[slot]);
        }
        if (group?.bbox) {
          const matrix = group.matrix
            ? Util.transform(this.#state.ctm, group.matrix)
            : this.#state.ctm;
          this.#updateClip(transformBBox(group.bbox, matrix));
        }
        break;
      }
      case OPS.endGroup:
        this.#restore(index, "group");
        break;
      case OPS.beginAnnotation:
        this.#annotationStates.push(state);
        this.#openGroup("annotation", index);
        this.#state = new BoundingBoxState(this.#pageBBox);
        if (args[1]) {
          this.#updateClip(args[1]);
        }
        this.#state.ctm = Util.transform(
          args[2] || IDENTITY_MATRIX,
          args[3] || IDENTITY_MATRIX
        );
        break;
      case OPS.endAnnotation:
        this.#closeGroup("annotation", index);
        this.#state = this.#annotationStates.pop() || this.#state;
        break;
      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject:
        this.#recordImage(
          index,
          this.#getUnitSquareBBox(),
          IMAGE_DEPENDENCIES,
          args
        );
        break;
      case OPS.paintImageMaskXObject:
      case OPS.paintSolidColorImageMask:
        this.#recordImage(
          index,
          this.#getUnitSquareBBox(),
          FILL_DEPENDENCIES,
          args
        );
        break;
      case OPS.paintInlineImageXObjectGroup:
        this.#recordImage(
          index,
          this.#getImageGroupBBox(args[1]),
          IMAGE_DEPENDENCIES,
          args
        );
        break;
      case OPS.paintImageMaskXObjectGroup:
        this.#recordImage(
          index,
          this.#getImageGroupBBox(args[0]),
          FILL_DEPENDENCIES,
          args
        );
        break;
      case OPS.paintImageXObjectRepeat: {
        const [, scaleX, scaleY, positions] = args;
        this.#recordImage(
          index,
          this.#getRepeatBBox(scaleX, 0, 0, scaleY, positions),
          IMAGE_DEPENDENCIES,
          args
        );
        break;
      }
      case OPS.paintImageMaskXObjectRepeat: {
        const [, a, b, c, d, positions] = args;
        this.#recordImage(
          index,
          this.#getRepeatBBox(a, b, c, d, positions),
          FILL_DEPENDENCIES,
          args
        );
        break;
      }
      case OPS.beginMarkedContent:
      case OPS.beginMarkedContentProps: {
        const group = this.#openGroup("markedContent", index);
        if (fn === OPS.beginMarkedContentProps && args?.[0] === "OC") {
          group.optional = true;
          this.#keptIndices.push(index);
        }
        break;
      }
      case OPS.endMarkedContent:
        this.#closeGroup("markedContent", index);
        break;
      case OPS.setCharWidthAndBounds:
        this.#updateClip(transformBBox(args.slice(2, 6), this.#state.ctm));
        break;
    }
  }

  /**
   * Tracks the next operator-list chunk.
   * @param {Array<number>} fnArray
   * @param {Array<any>} argsArray
   */
  process(fnArray, argsArray) {
    const start = this.#length;
    const end = start + fnArray.length;
    this.#ensureLength(end);
    for (let i = 0, ii = fnArray.length; i < ii; i++) {
      const index = start + i;
      this.#index = index;
      this.#edgeStart[index] = this.#edgeCount;
      const group = this.#groupIndex;
      if (fnArray[i] !== OPS.dependency) {
        this.#addDependency(group);
      }
      this.#processOperation(fnArray[i], argsArray[i], index);
    }
    this.#length = end;
    this.#edgeStart[end] = this.#edgeCount;
  }

  /**
   * @returns {Uint8ClampedArray} Packed `[minX, minY, maxX, maxY]` bounds,
   *   expanded to include dependent operations.
   */
  finish() {
    const length = this.#length;
    const boxes = this.#boxes.slice(0, length * 4);
    const edgeStart = this.#edgeStart;
    const edges = this.#edges;
    for (let index = length - 1; index >= 0; index--) {
      const offset = index * 4;
      const minX = boxes[offset];
      const maxX = boxes[offset + 2];
      if (minX > maxX) {
        continue;
      }
      const minY = boxes[offset + 1];
      const maxY = boxes[offset + 3];
      for (let i = edgeStart[index], ii = edgeStart[index + 1]; i < ii; i++) {
        const parent = edges[i] * 4;
        boxes[parent] = Math.min(boxes[parent], minX);
        boxes[parent + 1] = Math.min(boxes[parent + 1], minY);
        boxes[parent + 2] = Math.max(boxes[parent + 2], maxX);
        boxes[parent + 3] = Math.max(boxes[parent + 3], maxY);
      }
    }
    const ends = this.#groupEnds;
    for (let i = 0, ii = ends.length; i < ii; i += 2) {
      const begin = ends[i] * 4;
      const end = ends[i + 1] * 4;
      boxes[end] = Math.min(boxes[end], boxes[begin]);
      boxes[end + 1] = Math.min(boxes[end + 1], boxes[begin + 1]);
      boxes[end + 2] = Math.max(boxes[end + 2], boxes[begin + 2]);
      boxes[end + 3] = Math.max(boxes[end + 3], boxes[begin + 3]);
    }
    for (const index of this.#keptIndices) {
      const offset = index * 4;
      boxes[offset] = boxes[offset + 1] = 0;
      boxes[offset + 2] = boxes[offset + 3] = 255;
    }
    return boxes;
  }
}

export { OperatorListBBoxTracker };
