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
  FONT_IDENTITY_MATRIX,
  IDENTITY_MATRIX,
  ImageKind,
  info,
  IsLittleEndianCached,
  isNum,
  OPS,
  shadow,
  TextRenderingMode,
  unreachable,
  Util,
  warn,
} from "../shared/util.js";
import { getShadingPattern, TilingPattern } from "./pattern_helper.js";
import { PixelsPerInch } from "./display_utils.js";

// <canvas> contexts store most of the state we need natively.
// However, PDF needs a bit more state, which we store here.
// Minimal font size that would be used during canvas fillText operations.
const MIN_FONT_SIZE = 16;
// Maximum font size that would be used during canvas fillText operations.
const MAX_FONT_SIZE = 100;
const MAX_GROUP_SIZE = 4096;

// This value comes from sampling a few PDFs that re-use patterns, there doesn't
// seem to be any that benefit from caching more than 2 patterns.
const MAX_CACHED_CANVAS_PATTERNS = 2;

// Defines the time the `executeOperatorList`-method is going to be executing
// before it stops and shedules a continue of execution.
const EXECUTION_TIME = 15; // ms
// Defines the number of steps before checking the execution time.
const EXECUTION_STEPS = 10;

const COMPILE_TYPE3_GLYPHS = true;
const MAX_SIZE_TO_COMPILE = 1000;

const FULL_CHUNK_HEIGHT = 16;

// Because of https://bugs.chromium.org/p/chromium/issues/detail?id=1170396
// some curves aren't rendered correctly.
// Multiplying lineWidth by this factor should help to have "correct"
// rendering with no artifacts.
// Once the bug is fixed upstream, we can remove this constant and its use.
const LINEWIDTH_SCALE_FACTOR = 1.000001;

/**
 * Overrides certain methods on a 2d ctx so that when they are called they
 * will also call the same method on the destCtx. The methods that are
 * overridden are all the transformation state modifiers, path creation, and
 * save/restore. We only forward these specific methods because they are the
 * only state modifiers that we cannot copy over when we switch contexts.
 *
 * To remove mirroring call `ctx._removeMirroring()`.
 *
 * @param {Object} ctx - The 2d canvas context that will duplicate its calls on
 *   the destCtx.
 * @param {Object} destCtx - The 2d canvas context that will receive the
 *   forwarded calls.
 */
function mirrorContextOperations(ctx, destCtx) {
  if (ctx._removeMirroring) {
    throw new Error("Context is already forwarding operations.");
  }
  ctx.__originalSave = ctx.save;
  ctx.__originalRestore = ctx.restore;
  ctx.__originalRotate = ctx.rotate;
  ctx.__originalScale = ctx.scale;
  ctx.__originalTranslate = ctx.translate;
  ctx.__originalTransform = ctx.transform;
  ctx.__originalSetTransform = ctx.setTransform;
  ctx.__originalResetTransform = ctx.resetTransform;
  ctx.__originalClip = ctx.clip;
  ctx.__originalMoveTo = ctx.moveTo;
  ctx.__originalLineTo = ctx.lineTo;
  ctx.__originalBezierCurveTo = ctx.bezierCurveTo;
  ctx.__originalRect = ctx.rect;
  ctx.__originalClosePath = ctx.closePath;
  ctx.__originalBeginPath = ctx.beginPath;

  ctx._removeMirroring = () => {
    ctx.save = ctx.__originalSave;
    ctx.restore = ctx.__originalRestore;
    ctx.rotate = ctx.__originalRotate;
    ctx.scale = ctx.__originalScale;
    ctx.translate = ctx.__originalTranslate;
    ctx.transform = ctx.__originalTransform;
    ctx.setTransform = ctx.__originalSetTransform;
    ctx.resetTransform = ctx.__originalResetTransform;

    ctx.clip = ctx.__originalClip;
    ctx.moveTo = ctx.__originalMoveTo;
    ctx.lineTo = ctx.__originalLineTo;
    ctx.bezierCurveTo = ctx.__originalBezierCurveTo;
    ctx.rect = ctx.__originalRect;
    ctx.closePath = ctx.__originalClosePath;
    ctx.beginPath = ctx.__originalBeginPath;
    delete ctx._removeMirroring;
  };

  ctx.save = function ctxSave() {
    destCtx.save();
    this.__originalSave();
  };

  ctx.restore = function ctxRestore() {
    destCtx.restore();
    this.__originalRestore();
  };

  ctx.translate = function ctxTranslate(x, y) {
    destCtx.translate(x, y);
    this.__originalTranslate(x, y);
  };

  ctx.scale = function ctxScale(x, y) {
    destCtx.scale(x, y);
    this.__originalScale(x, y);
  };

  ctx.transform = function ctxTransform(a, b, c, d, e, f) {
    destCtx.transform(a, b, c, d, e, f);
    this.__originalTransform(a, b, c, d, e, f);
  };

  ctx.setTransform = function ctxSetTransform(a, b, c, d, e, f) {
    destCtx.setTransform(a, b, c, d, e, f);
    this.__originalSetTransform(a, b, c, d, e, f);
  };

  ctx.resetTransform = function ctxResetTransform() {
    destCtx.resetTransform();
    this.__originalResetTransform();
  };

  ctx.rotate = function ctxRotate(angle) {
    destCtx.rotate(angle);
    this.__originalRotate(angle);
  };

  ctx.clip = function ctxRotate(rule) {
    destCtx.clip(rule);
    this.__originalClip(rule);
  };

  ctx.moveTo = function (x, y) {
    destCtx.moveTo(x, y);
    this.__originalMoveTo(x, y);
  };

  ctx.lineTo = function (x, y) {
    destCtx.lineTo(x, y);
    this.__originalLineTo(x, y);
  };

  ctx.bezierCurveTo = function (cp1x, cp1y, cp2x, cp2y, x, y) {
    destCtx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
    this.__originalBezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
  };

  ctx.rect = function (x, y, width, height) {
    destCtx.rect(x, y, width, height);
    this.__originalRect(x, y, width, height);
  };

  ctx.closePath = function () {
    destCtx.closePath();
    this.__originalClosePath();
  };

  ctx.beginPath = function () {
    destCtx.beginPath();
    this.__originalBeginPath();
  };
}

function addContextCurrentTransform(ctx) {
  // If the context doesn't expose a `mozCurrentTransform`, add a JS based one.
  if (ctx.mozCurrentTransform) {
    return;
  }
  ctx._originalSave = ctx.save;
  ctx._originalRestore = ctx.restore;
  ctx._originalRotate = ctx.rotate;
  ctx._originalScale = ctx.scale;
  ctx._originalTranslate = ctx.translate;
  ctx._originalTransform = ctx.transform;
  ctx._originalSetTransform = ctx.setTransform;
  ctx._originalResetTransform = ctx.resetTransform;

  ctx._transformMatrix = ctx._transformMatrix || [1, 0, 0, 1, 0, 0];
  ctx._transformStack = [];

  try {
    // The call to getOwnPropertyDescriptor throws an exception in Node.js:
    // "TypeError: Method lineWidth called on incompatible receiver
    //  #<CanvasRenderingContext2D>".
    const desc = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(ctx),
      "lineWidth"
    );

    ctx._setLineWidth = desc.set;
    ctx._getLineWidth = desc.get;

    Object.defineProperty(ctx, "lineWidth", {
      set: function setLineWidth(width) {
        this._setLineWidth(width * LINEWIDTH_SCALE_FACTOR);
      },
      get: function getLineWidth() {
        return this._getLineWidth();
      },
    });
  } catch (_) {}

  Object.defineProperty(ctx, "mozCurrentTransform", {
    get: function getCurrentTransform() {
      return this._transformMatrix;
    },
  });

  Object.defineProperty(ctx, "mozCurrentTransformInverse", {
    get: function getCurrentTransformInverse() {
      // Calculation done using WolframAlpha:
      // http://www.wolframalpha.com/input/?
      //   i=Inverse+{{a%2C+c%2C+e}%2C+{b%2C+d%2C+f}%2C+{0%2C+0%2C+1}}

      const [a, b, c, d, e, f] = this._transformMatrix;
      const ad_bc = a * d - b * c;
      const bc_ad = b * c - a * d;

      return [
        d / ad_bc,
        b / bc_ad,
        c / bc_ad,
        a / ad_bc,
        (d * e - c * f) / bc_ad,
        (b * e - a * f) / ad_bc,
      ];
    },
  });

  ctx.save = function ctxSave() {
    const old = this._transformMatrix;
    this._transformStack.push(old);
    this._transformMatrix = old.slice(0, 6);

    this._originalSave();
  };

  ctx.restore = function ctxRestore() {
    const prev = this._transformStack.pop();
    if (prev) {
      this._transformMatrix = prev;
      this._originalRestore();
    }
  };

  ctx.translate = function ctxTranslate(x, y) {
    const m = this._transformMatrix;
    m[4] = m[0] * x + m[2] * y + m[4];
    m[5] = m[1] * x + m[3] * y + m[5];

    this._originalTranslate(x, y);
  };

  ctx.scale = function ctxScale(x, y) {
    const m = this._transformMatrix;
    m[0] *= x;
    m[1] *= x;
    m[2] *= y;
    m[3] *= y;

    this._originalScale(x, y);
  };

  ctx.transform = function ctxTransform(a, b, c, d, e, f) {
    const m = this._transformMatrix;
    this._transformMatrix = [
      m[0] * a + m[2] * b,
      m[1] * a + m[3] * b,
      m[0] * c + m[2] * d,
      m[1] * c + m[3] * d,
      m[0] * e + m[2] * f + m[4],
      m[1] * e + m[3] * f + m[5],
    ];

    ctx._originalTransform(a, b, c, d, e, f);
  };

  ctx.setTransform = function ctxSetTransform(a, b, c, d, e, f) {
    this._transformMatrix = [a, b, c, d, e, f];

    ctx._originalSetTransform(a, b, c, d, e, f);
  };

  ctx.resetTransform = function ctxResetTransform() {
    this._transformMatrix = [1, 0, 0, 1, 0, 0];

    ctx._originalResetTransform();
  };

  ctx.rotate = function ctxRotate(angle) {
    const cosValue = Math.cos(angle);
    const sinValue = Math.sin(angle);

    const m = this._transformMatrix;
    this._transformMatrix = [
      m[0] * cosValue + m[2] * sinValue,
      m[1] * cosValue + m[3] * sinValue,
      m[0] * -sinValue + m[2] * cosValue,
      m[1] * -sinValue + m[3] * cosValue,
      m[4],
      m[5],
    ];

    this._originalRotate(angle);
  };
}

class CachedCanvases {
  constructor(canvasFactory) {
    this.canvasFactory = canvasFactory;
    this.cache = Object.create(null);
  }

  getCanvas(id, width, height, trackTransform) {
    let canvasEntry;
    if (this.cache[id] !== undefined) {
      canvasEntry = this.cache[id];
      this.canvasFactory.reset(canvasEntry, width, height);
      // reset canvas transform for emulated mozCurrentTransform, if needed
      canvasEntry.context.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      canvasEntry = this.canvasFactory.create(width, height);
      this.cache[id] = canvasEntry;
    }
    if (trackTransform) {
      addContextCurrentTransform(canvasEntry.context);
    }
    return canvasEntry;
  }

  clear() {
    for (const id in this.cache) {
      const canvasEntry = this.cache[id];
      this.canvasFactory.destroy(canvasEntry);
      delete this.cache[id];
    }
  }
}

/**
 * Least recently used cache implemented with a JS Map. JS Map keys are ordered
 * by last insertion.
 */
class LRUCache {
  constructor(maxSize = 0) {
    this._cache = new Map();
    this._maxSize = maxSize;
  }

  has(key) {
    return this._cache.has(key);
  }

  get(key) {
    if (this._cache.has(key)) {
      // Delete and set the value so it's moved to the end of the map iteration.
      const value = this._cache.get(key);
      this._cache.delete(key);
      this._cache.set(key, value);
    }
    return this._cache.get(key);
  }

  set(key, value) {
    if (this._maxSize <= 0) {
      return;
    }
    if (this._cache.size + 1 > this._maxSize) {
      // Delete the least recently used.
      this._cache.delete(this._cache.keys().next().value);
    }
    this._cache.set(key, value);
  }

  clear() {
    this._cache.clear();
  }
}

function compileType3Glyph(imgData) {
  const POINT_TO_PROCESS_LIMIT = 1000;
  const POINT_TYPES = new Uint8Array([
    0, 2, 4, 0, 1, 0, 5, 4, 8, 10, 0, 8, 0, 2, 1, 0,
  ]);

  const width = imgData.width,
    height = imgData.height,
    width1 = width + 1;
  let i, ii, j, j0;
  const points = new Uint8Array(width1 * (height + 1));

  // decodes bit-packed mask data
  const lineSize = (width + 7) & ~7,
    data0 = imgData.data;
  const data = new Uint8Array(lineSize * height);
  let pos = 0;
  for (i = 0, ii = data0.length; i < ii; i++) {
    const elem = data0[i];
    let mask = 128;
    while (mask > 0) {
      data[pos++] = elem & mask ? 0 : 255;
      mask >>= 1;
    }
  }

  // finding interesting points: every point is located between mask pixels,
  // so there will be points of the (width + 1)x(height + 1) grid. Every point
  // will have flags assigned based on neighboring mask pixels:
  //   4 | 8
  //   --P--
  //   2 | 1
  // We are interested only in points with the flags:
  //   - outside corners: 1, 2, 4, 8;
  //   - inside corners: 7, 11, 13, 14;
  //   - and, intersections: 5, 10.
  let count = 0;
  pos = 0;
  if (data[pos] !== 0) {
    points[0] = 1;
    ++count;
  }
  for (j = 1; j < width; j++) {
    if (data[pos] !== data[pos + 1]) {
      points[j] = data[pos] ? 2 : 1;
      ++count;
    }
    pos++;
  }
  if (data[pos] !== 0) {
    points[j] = 2;
    ++count;
  }
  for (i = 1; i < height; i++) {
    pos = i * lineSize;
    j0 = i * width1;
    if (data[pos - lineSize] !== data[pos]) {
      points[j0] = data[pos] ? 1 : 8;
      ++count;
    }
    // 'sum' is the position of the current pixel configuration in the 'TYPES'
    // array (in order 8-1-2-4, so we can use '>>2' to shift the column).
    let sum = (data[pos] ? 4 : 0) + (data[pos - lineSize] ? 8 : 0);
    for (j = 1; j < width; j++) {
      sum =
        (sum >> 2) +
        (data[pos + 1] ? 4 : 0) +
        (data[pos - lineSize + 1] ? 8 : 0);
      if (POINT_TYPES[sum]) {
        points[j0 + j] = POINT_TYPES[sum];
        ++count;
      }
      pos++;
    }
    if (data[pos - lineSize] !== data[pos]) {
      points[j0 + j] = data[pos] ? 2 : 4;
      ++count;
    }

    if (count > POINT_TO_PROCESS_LIMIT) {
      return null;
    }
  }

  pos = lineSize * (height - 1);
  j0 = i * width1;
  if (data[pos] !== 0) {
    points[j0] = 8;
    ++count;
  }
  for (j = 1; j < width; j++) {
    if (data[pos] !== data[pos + 1]) {
      points[j0 + j] = data[pos] ? 4 : 8;
      ++count;
    }
    pos++;
  }
  if (data[pos] !== 0) {
    points[j0 + j] = 4;
    ++count;
  }
  if (count > POINT_TO_PROCESS_LIMIT) {
    return null;
  }

  // building outlines
  const steps = new Int32Array([0, width1, -1, 0, -width1, 0, 0, 0, 1]);
  const outlines = [];
  for (i = 0; count && i <= height; i++) {
    let p = i * width1;
    const end = p + width;
    while (p < end && !points[p]) {
      p++;
    }
    if (p === end) {
      continue;
    }
    const coords = [p % width1, i];

    const p0 = p;
    let type = points[p];
    do {
      const step = steps[type];
      do {
        p += step;
      } while (!points[p]);

      const pp = points[p];
      if (pp !== 5 && pp !== 10) {
        // set new direction
        type = pp;
        // delete mark
        points[p] = 0;
      } else {
        // type is 5 or 10, ie, a crossing
        // set new direction
        type = pp & ((0x33 * type) >> 4);
        // set new type for "future hit"
        points[p] &= (type >> 2) | (type << 2);
      }

      coords.push(p % width1, (p / width1) | 0);

      if (!points[p]) {
        --count;
      }
    } while (p0 !== p);
    outlines.push(coords);
    --i;
  }

  const drawOutline = function (c) {
    c.save();
    // the path shall be painted in [0..1]x[0..1] space
    c.scale(1 / width, -1 / height);
    c.translate(0, -height);
    c.beginPath();
    for (let k = 0, kk = outlines.length; k < kk; k++) {
      const o = outlines[k];
      c.moveTo(o[0], o[1]);
      for (let l = 2, ll = o.length; l < ll; l += 2) {
        c.lineTo(o[l], o[l + 1]);
      }
    }
    c.fill();
    c.beginPath();
    c.restore();
  };

  return drawOutline;
}

class CanvasExtraState {
  constructor(width, height) {
    // Are soft masks and alpha values shapes or opacities?
    this.alphaIsShape = false;
    this.fontSize = 0;
    this.fontSizeScale = 1;
    this.textMatrix = IDENTITY_MATRIX;
    this.textMatrixScale = 1;
    this.fontMatrix = FONT_IDENTITY_MATRIX;
    this.leading = 0;
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
    this.textRenderingMode = TextRenderingMode.FILL;
    this.textRise = 0;
    // Default fore and background colors
    this.fillColor = "#000000";
    this.strokeColor = "#000000";
    this.patternFill = false;
    // Note: fill alpha applies to all non-stroking operations
    this.fillAlpha = 1;
    this.strokeAlpha = 1;
    this.lineWidth = 1;
    this.activeSMask = null;
    this.transferMaps = null;

    this.startNewPathAndClipBox([0, 0, width, height]);
  }

  clone() {
    const clone = Object.create(this);
    clone.clipBox = this.clipBox.slice();
    return clone;
  }

  setCurrentPoint(x, y) {
    this.x = x;
    this.y = y;
  }

  updatePathMinMax(transform, x, y) {
    [x, y] = Util.applyTransform([x, y], transform);
    this.minX = Math.min(this.minX, x);
    this.minY = Math.min(this.minY, y);
    this.maxX = Math.max(this.maxX, x);
    this.maxY = Math.max(this.maxY, y);
  }

  updateCurvePathMinMax(transform, x0, y0, x1, y1, x2, y2, x3, y3) {
    const box = Util.bezierBoundingBox(x0, y0, x1, y1, x2, y2, x3, y3);
    this.updatePathMinMax(transform, box[0], box[1]);
    this.updatePathMinMax(transform, box[2], box[3]);
  }

  getPathBoundingBox() {
    return [this.minX, this.minY, this.maxX, this.maxY];
  }

  updateClipFromPath() {
    const intersect = Util.intersect(this.clipBox, this.getPathBoundingBox());
    this.startNewPathAndClipBox(intersect || [0, 0, 0, 0]);
  }

  startNewPathAndClipBox(box) {
    this.clipBox = box;
    this.minX = Infinity;
    this.minY = Infinity;
    this.maxX = 0;
    this.maxY = 0;
  }

  getClippedPathBoundingBox() {
    return Util.intersect(this.clipBox, this.getPathBoundingBox());
  }
}

function putBinaryImageData(ctx, imgData, transferMaps = null) {
  if (typeof ImageData !== "undefined" && imgData instanceof ImageData) {
    ctx.putImageData(imgData, 0, 0);
    return;
  }

  // Put the image data to the canvas in chunks, rather than putting the
  // whole image at once.  This saves JS memory, because the ImageData object
  // is smaller. It also possibly saves C++ memory within the implementation
  // of putImageData(). (E.g. in Firefox we make two short-lived copies of
  // the data passed to putImageData()). |n| shouldn't be too small, however,
  // because too many putImageData() calls will slow things down.
  //
  // Note: as written, if the last chunk is partial, the putImageData() call
  // will (conceptually) put pixels past the bounds of the canvas.  But
  // that's ok; any such pixels are ignored.

  const height = imgData.height,
    width = imgData.width;
  const partialChunkHeight = height % FULL_CHUNK_HEIGHT;
  const fullChunks = (height - partialChunkHeight) / FULL_CHUNK_HEIGHT;
  const totalChunks = partialChunkHeight === 0 ? fullChunks : fullChunks + 1;

  const chunkImgData = ctx.createImageData(width, FULL_CHUNK_HEIGHT);
  let srcPos = 0,
    destPos;
  const src = imgData.data;
  const dest = chunkImgData.data;
  let i, j, thisChunkHeight, elemsInThisChunk;

  let transferMapRed, transferMapGreen, transferMapBlue, transferMapGray;
  if (transferMaps) {
    switch (transferMaps.length) {
      case 1:
        transferMapRed = transferMaps[0];
        transferMapGreen = transferMaps[0];
        transferMapBlue = transferMaps[0];
        transferMapGray = transferMaps[0];
        break;
      case 4:
        transferMapRed = transferMaps[0];
        transferMapGreen = transferMaps[1];
        transferMapBlue = transferMaps[2];
        transferMapGray = transferMaps[3];
        break;
    }
  }

  // There are multiple forms in which the pixel data can be passed, and
  // imgData.kind tells us which one this is.
  if (imgData.kind === ImageKind.GRAYSCALE_1BPP) {
    // Grayscale, 1 bit per pixel (i.e. black-and-white).
    const srcLength = src.byteLength;
    const dest32 = new Uint32Array(dest.buffer, 0, dest.byteLength >> 2);
    const dest32DataLength = dest32.length;
    const fullSrcDiff = (width + 7) >> 3;
    let white = 0xffffffff;
    let black = IsLittleEndianCached.value ? 0xff000000 : 0x000000ff;

    if (transferMapGray) {
      if (transferMapGray[0] === 0xff && transferMapGray[0xff] === 0) {
        [white, black] = [black, white];
      }
    }

    for (i = 0; i < totalChunks; i++) {
      thisChunkHeight = i < fullChunks ? FULL_CHUNK_HEIGHT : partialChunkHeight;
      destPos = 0;
      for (j = 0; j < thisChunkHeight; j++) {
        const srcDiff = srcLength - srcPos;
        let k = 0;
        const kEnd = srcDiff > fullSrcDiff ? width : srcDiff * 8 - 7;
        const kEndUnrolled = kEnd & ~7;
        let mask = 0;
        let srcByte = 0;
        for (; k < kEndUnrolled; k += 8) {
          srcByte = src[srcPos++];
          dest32[destPos++] = srcByte & 128 ? white : black;
          dest32[destPos++] = srcByte & 64 ? white : black;
          dest32[destPos++] = srcByte & 32 ? white : black;
          dest32[destPos++] = srcByte & 16 ? white : black;
          dest32[destPos++] = srcByte & 8 ? white : black;
          dest32[destPos++] = srcByte & 4 ? white : black;
          dest32[destPos++] = srcByte & 2 ? white : black;
          dest32[destPos++] = srcByte & 1 ? white : black;
        }
        for (; k < kEnd; k++) {
          if (mask === 0) {
            srcByte = src[srcPos++];
            mask = 128;
          }

          dest32[destPos++] = srcByte & mask ? white : black;
          mask >>= 1;
        }
      }
      // We ran out of input. Make all remaining pixels transparent.
      while (destPos < dest32DataLength) {
        dest32[destPos++] = 0;
      }

      ctx.putImageData(chunkImgData, 0, i * FULL_CHUNK_HEIGHT);
    }
  } else if (imgData.kind === ImageKind.RGBA_32BPP) {
    // RGBA, 32-bits per pixel.
    const hasTransferMaps = !!(
      transferMapRed ||
      transferMapGreen ||
      transferMapBlue
    );

    j = 0;
    elemsInThisChunk = width * FULL_CHUNK_HEIGHT * 4;
    for (i = 0; i < fullChunks; i++) {
      dest.set(src.subarray(srcPos, srcPos + elemsInThisChunk));
      srcPos += elemsInThisChunk;

      if (hasTransferMaps) {
        for (let k = 0; k < elemsInThisChunk; k += 4) {
          if (transferMapRed) {
            dest[k + 0] = transferMapRed[dest[k + 0]];
          }
          if (transferMapGreen) {
            dest[k + 1] = transferMapGreen[dest[k + 1]];
          }
          if (transferMapBlue) {
            dest[k + 2] = transferMapBlue[dest[k + 2]];
          }
        }
      }

      ctx.putImageData(chunkImgData, 0, j);
      j += FULL_CHUNK_HEIGHT;
    }
    if (i < totalChunks) {
      elemsInThisChunk = width * partialChunkHeight * 4;
      dest.set(src.subarray(srcPos, srcPos + elemsInThisChunk));

      if (hasTransferMaps) {
        for (let k = 0; k < elemsInThisChunk; k += 4) {
          if (transferMapRed) {
            dest[k + 0] = transferMapRed[dest[k + 0]];
          }
          if (transferMapGreen) {
            dest[k + 1] = transferMapGreen[dest[k + 1]];
          }
          if (transferMapBlue) {
            dest[k + 2] = transferMapBlue[dest[k + 2]];
          }
        }
      }

      ctx.putImageData(chunkImgData, 0, j);
    }
  } else if (imgData.kind === ImageKind.RGB_24BPP) {
    // RGB, 24-bits per pixel.
    const hasTransferMaps = !!(
      transferMapRed ||
      transferMapGreen ||
      transferMapBlue
    );

    thisChunkHeight = FULL_CHUNK_HEIGHT;
    elemsInThisChunk = width * thisChunkHeight;
    for (i = 0; i < totalChunks; i++) {
      if (i >= fullChunks) {
        thisChunkHeight = partialChunkHeight;
        elemsInThisChunk = width * thisChunkHeight;
      }

      destPos = 0;
      for (j = elemsInThisChunk; j--; ) {
        dest[destPos++] = src[srcPos++];
        dest[destPos++] = src[srcPos++];
        dest[destPos++] = src[srcPos++];
        dest[destPos++] = 255;
      }

      if (hasTransferMaps) {
        for (let k = 0; k < destPos; k += 4) {
          if (transferMapRed) {
            dest[k + 0] = transferMapRed[dest[k + 0]];
          }
          if (transferMapGreen) {
            dest[k + 1] = transferMapGreen[dest[k + 1]];
          }
          if (transferMapBlue) {
            dest[k + 2] = transferMapBlue[dest[k + 2]];
          }
        }
      }

      ctx.putImageData(chunkImgData, 0, i * FULL_CHUNK_HEIGHT);
    }
  } else {
    throw new Error(`bad image kind: ${imgData.kind}`);
  }
}

function putBinaryImageMask(ctx, imgData) {
  const height = imgData.height,
    width = imgData.width;
  const partialChunkHeight = height % FULL_CHUNK_HEIGHT;
  const fullChunks = (height - partialChunkHeight) / FULL_CHUNK_HEIGHT;
  const totalChunks = partialChunkHeight === 0 ? fullChunks : fullChunks + 1;

  const chunkImgData = ctx.createImageData(width, FULL_CHUNK_HEIGHT);
  let srcPos = 0;
  const src = imgData.data;
  const dest = chunkImgData.data;

  for (let i = 0; i < totalChunks; i++) {
    const thisChunkHeight =
      i < fullChunks ? FULL_CHUNK_HEIGHT : partialChunkHeight;

    // Expand the mask so it can be used by the canvas.  Any required
    // inversion has already been handled.
    let destPos = 3; // alpha component offset
    for (let j = 0; j < thisChunkHeight; j++) {
      let elem,
        mask = 0;
      for (let k = 0; k < width; k++) {
        if (!mask) {
          elem = src[srcPos++];
          mask = 128;
        }
        dest[destPos] = elem & mask ? 0 : 255;
        destPos += 4;
        mask >>= 1;
      }
    }
    ctx.putImageData(chunkImgData, 0, i * FULL_CHUNK_HEIGHT);
  }
}

function copyCtxState(sourceCtx, destCtx) {
  const properties = [
    "strokeStyle",
    "fillStyle",
    "fillRule",
    "globalAlpha",
    "lineWidth",
    "lineCap",
    "lineJoin",
    "miterLimit",
    "globalCompositeOperation",
    "font",
  ];
  for (let i = 0, ii = properties.length; i < ii; i++) {
    const property = properties[i];
    if (sourceCtx[property] !== undefined) {
      destCtx[property] = sourceCtx[property];
    }
  }
  if (sourceCtx.setLineDash !== undefined) {
    destCtx.setLineDash(sourceCtx.getLineDash());
    destCtx.lineDashOffset = sourceCtx.lineDashOffset;
  }
}

function resetCtxToDefault(ctx) {
  ctx.strokeStyle = "#000000";
  ctx.fillStyle = "#000000";
  ctx.fillRule = "nonzero";
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.miterLimit = 10;
  ctx.globalCompositeOperation = "source-over";
  ctx.font = "10px sans-serif";
  if (ctx.setLineDash !== undefined) {
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }
}

function composeSMaskBackdrop(bytes, r0, g0, b0) {
  const length = bytes.length;
  for (let i = 3; i < length; i += 4) {
    const alpha = bytes[i];
    if (alpha === 0) {
      bytes[i - 3] = r0;
      bytes[i - 2] = g0;
      bytes[i - 1] = b0;
    } else if (alpha < 255) {
      const alpha_ = 255 - alpha;
      bytes[i - 3] = (bytes[i - 3] * alpha + r0 * alpha_) >> 8;
      bytes[i - 2] = (bytes[i - 2] * alpha + g0 * alpha_) >> 8;
      bytes[i - 1] = (bytes[i - 1] * alpha + b0 * alpha_) >> 8;
    }
  }
}

function composeSMaskAlpha(maskData, layerData, transferMap) {
  const length = maskData.length;
  const scale = 1 / 255;
  for (let i = 3; i < length; i += 4) {
    const alpha = transferMap ? transferMap[maskData[i]] : maskData[i];
    layerData[i] = (layerData[i] * alpha * scale) | 0;
  }
}

function composeSMaskLuminosity(maskData, layerData, transferMap) {
  const length = maskData.length;
  for (let i = 3; i < length; i += 4) {
    const y =
      maskData[i - 3] * 77 + // * 0.3 / 255 * 0x10000
      maskData[i - 2] * 152 + // * 0.59 ....
      maskData[i - 1] * 28; // * 0.11 ....
    layerData[i] = transferMap
      ? (layerData[i] * transferMap[y >> 8]) >> 8
      : (layerData[i] * y) >> 16;
  }
}

function genericComposeSMask(
  maskCtx,
  layerCtx,
  width,
  height,
  subtype,
  backdrop,
  transferMap,
  layerOffsetX,
  layerOffsetY,
  maskOffsetX,
  maskOffsetY
) {
  const hasBackdrop = !!backdrop;
  const r0 = hasBackdrop ? backdrop[0] : 0;
  const g0 = hasBackdrop ? backdrop[1] : 0;
  const b0 = hasBackdrop ? backdrop[2] : 0;

  let composeFn;
  if (subtype === "Luminosity") {
    composeFn = composeSMaskLuminosity;
  } else {
    composeFn = composeSMaskAlpha;
  }

  // processing image in chunks to save memory
  const PIXELS_TO_PROCESS = 1048576;
  const chunkSize = Math.min(height, Math.ceil(PIXELS_TO_PROCESS / width));
  for (let row = 0; row < height; row += chunkSize) {
    const chunkHeight = Math.min(chunkSize, height - row);
    const maskData = maskCtx.getImageData(
      layerOffsetX - maskOffsetX,
      row + (layerOffsetY - maskOffsetY),
      width,
      chunkHeight
    );
    const layerData = layerCtx.getImageData(
      layerOffsetX,
      row + layerOffsetY,
      width,
      chunkHeight
    );

    if (hasBackdrop) {
      composeSMaskBackdrop(maskData.data, r0, g0, b0);
    }
    composeFn(maskData.data, layerData.data, transferMap);

    layerCtx.putImageData(layerData, layerOffsetX, row + layerOffsetY);
  }
}

function composeSMask(ctx, smask, layerCtx, layerBox) {
  const layerOffsetX = layerBox[0];
  const layerOffsetY = layerBox[1];
  const layerWidth = layerBox[2] - layerOffsetX;
  const layerHeight = layerBox[3] - layerOffsetY;
  if (layerWidth === 0 || layerHeight === 0) {
    return;
  }
  genericComposeSMask(
    smask.context,
    layerCtx,
    layerWidth,
    layerHeight,
    smask.subtype,
    smask.backdrop,
    smask.transferMap,
    layerOffsetX,
    layerOffsetY,
    smask.offsetX,
    smask.offsetY
  );
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layerCtx.canvas, 0, 0);
  ctx.restore();
}

function getImageSmoothingEnabled(transform, interpolate) {
  const scale = Util.singularValueDecompose2dScale(transform);
  // Round to a 32bit float so that `<=` check below will pass for numbers that
  // are very close, but not exactly the same 64bit floats.
  scale[0] = Math.fround(scale[0]);
  scale[1] = Math.fround(scale[1]);
  const actualScale = Math.fround(
    (globalThis.devicePixelRatio || 1) * PixelsPerInch.PDF_TO_CSS_UNITS
  );
  if (interpolate !== undefined) {
    // If the value is explicitly set use it.
    return interpolate;
  } else if (scale[0] <= actualScale || scale[1] <= actualScale) {
    // Smooth when downscaling.
    return true;
  }
  // Don't smooth when upscaling.
  return false;
}

const LINE_CAP_STYLES = ["butt", "round", "square"];
const LINE_JOIN_STYLES = ["miter", "round", "bevel"];
const NORMAL_CLIP = {};
const EO_CLIP = {};

class CanvasGraphics {
  constructor(
    canvasCtx,
    commonObjs,
    objs,
    canvasFactory,
    imageLayer,
    optionalContentConfig
  ) {
    this.ctx = canvasCtx;
    this.current = new CanvasExtraState(
      this.ctx.canvas.width,
      this.ctx.canvas.height
    );
    this.stateStack = [];
    this.pendingClip = null;
    this.pendingEOFill = false;
    this.res = null;
    this.xobjs = null;
    this.commonObjs = commonObjs;
    this.objs = objs;
    this.canvasFactory = canvasFactory;
    this.imageLayer = imageLayer;
    this.groupStack = [];
    this.processingType3 = null;
    // Patterns are painted relative to the initial page/form transform, see
    // PDF spec 8.7.2 NOTE 1.
    this.baseTransform = null;
    this.baseTransformStack = [];
    this.groupLevel = 0;
    this.smaskStack = [];
    this.smaskCounter = 0;
    this.tempSMask = null;
    this.suspendedCtx = null;
    this.contentVisible = true;
    this.markedContentStack = [];
    this.optionalContentConfig = optionalContentConfig;
    this.cachedCanvases = new CachedCanvases(this.canvasFactory);
    this.cachedCanvasPatterns = new LRUCache(MAX_CACHED_CANVAS_PATTERNS);
    this.cachedPatterns = new Map();
    if (canvasCtx) {
      // NOTE: if mozCurrentTransform is polyfilled, then the current state of
      // the transformation must already be set in canvasCtx._transformMatrix.
      addContextCurrentTransform(canvasCtx);
    }
    this._cachedGetSinglePixelWidth = null;
  }

  beginDrawing({
    transform,
    viewport,
    transparency = false,
    background = null,
  }) {
    // For pdfs that use blend modes we have to clear the canvas else certain
    // blend modes can look wrong since we'd be blending with a white
    // backdrop. The problem with a transparent backdrop though is we then
    // don't get sub pixel anti aliasing on text, creating temporary
    // transparent canvas when we have blend modes.
    const width = this.ctx.canvas.width;
    const height = this.ctx.canvas.height;

    this.ctx.save();
    this.ctx.fillStyle = background || "rgb(255, 255, 255)";
    this.ctx.fillRect(0, 0, width, height);
    this.ctx.restore();

    if (transparency) {
      const transparentCanvas = this.cachedCanvases.getCanvas(
        "transparent",
        width,
        height,
        true
      );
      this.compositeCtx = this.ctx;
      this.transparentCanvas = transparentCanvas.canvas;
      this.ctx = transparentCanvas.context;
      this.ctx.save();
      // The transform can be applied before rendering, transferring it to
      // the new canvas.
      this.ctx.transform.apply(this.ctx, this.compositeCtx.mozCurrentTransform);
    }

    this.ctx.save();
    resetCtxToDefault(this.ctx);
    if (transform) {
      this.ctx.transform.apply(this.ctx, transform);
    }
    this.ctx.transform.apply(this.ctx, viewport.transform);

    this.baseTransform = this.ctx.mozCurrentTransform.slice();
    this._combinedScaleFactor = Math.hypot(
      this.baseTransform[0],
      this.baseTransform[2]
    );

    if (this.imageLayer) {
      this.imageLayer.beginLayout();
    }
  }

  executeOperatorList(
    operatorList,
    executionStartIdx,
    continueCallback,
    stepper
  ) {
    const argsArray = operatorList.argsArray;
    const fnArray = operatorList.fnArray;
    let i = executionStartIdx || 0;
    const argsArrayLen = argsArray.length;

    // Sometimes the OperatorList to execute is empty.
    if (argsArrayLen === i) {
      return i;
    }

    const chunkOperations =
      argsArrayLen - i > EXECUTION_STEPS &&
      typeof continueCallback === "function";
    const endTime = chunkOperations ? Date.now() + EXECUTION_TIME : 0;
    let steps = 0;

    const commonObjs = this.commonObjs;
    const objs = this.objs;
    let fnId;

    while (true) {
      if (stepper !== undefined && i === stepper.nextBreakPoint) {
        stepper.breakIt(i, continueCallback);
        return i;
      }

      fnId = fnArray[i];

      if (fnId !== OPS.dependency) {
        this[fnId].apply(this, argsArray[i]);
      } else {
        for (const depObjId of argsArray[i]) {
          const objsPool = depObjId.startsWith("g_") ? commonObjs : objs;

          // If the promise isn't resolved yet, add the continueCallback
          // to the promise and bail out.
          if (!objsPool.has(depObjId)) {
            objsPool.get(depObjId, continueCallback);
            return i;
          }
        }
      }

      i++;

      // If the entire operatorList was executed, stop as were done.
      if (i === argsArrayLen) {
        return i;
      }

      // If the execution took longer then a certain amount of time and
      // `continueCallback` is specified, interrupt the execution.
      if (chunkOperations && ++steps > EXECUTION_STEPS) {
        if (Date.now() > endTime) {
          continueCallback();
          return i;
        }
        steps = 0;
      }

      // If the operatorList isn't executed completely yet OR the execution
      // time was short enough, do another execution round.
    }
  }

  endDrawing() {
    // Finishing all opened operations such as SMask group painting.
    while (this.stateStack.length || this.current.activeSMask !== null) {
      this.restore();
    }

    this.ctx.restore();

    if (this.transparentCanvas) {
      this.ctx = this.compositeCtx;
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Avoid apply transform twice
      this.ctx.drawImage(this.transparentCanvas, 0, 0);
      this.ctx.restore();
      this.transparentCanvas = null;
    }

    this.cachedCanvases.clear();
    this.cachedCanvasPatterns.clear();
    this.cachedPatterns.clear();

    if (this.imageLayer) {
      this.imageLayer.endLayout();
    }
  }

  _scaleImage(img, inverseTransform) {
    // Vertical or horizontal scaling shall not be more than 2 to not lose the
    // pixels during drawImage operation, painting on the temporary canvas(es)
    // that are twice smaller in size.
    const width = img.width;
    const height = img.height;
    let widthScale = Math.max(
      Math.hypot(inverseTransform[0], inverseTransform[1]),
      1
    );
    let heightScale = Math.max(
      Math.hypot(inverseTransform[2], inverseTransform[3]),
      1
    );

    let paintWidth = width,
      paintHeight = height;
    let tmpCanvasId = "prescale1";
    let tmpCanvas, tmpCtx;
    while (
      (widthScale > 2 && paintWidth > 1) ||
      (heightScale > 2 && paintHeight > 1)
    ) {
      let newWidth = paintWidth,
        newHeight = paintHeight;
      if (widthScale > 2 && paintWidth > 1) {
        newWidth = Math.ceil(paintWidth / 2);
        widthScale /= paintWidth / newWidth;
      }
      if (heightScale > 2 && paintHeight > 1) {
        newHeight = Math.ceil(paintHeight / 2);
        heightScale /= paintHeight / newHeight;
      }
      tmpCanvas = this.cachedCanvases.getCanvas(
        tmpCanvasId,
        newWidth,
        newHeight
      );
      tmpCtx = tmpCanvas.context;
      tmpCtx.clearRect(0, 0, newWidth, newHeight);
      tmpCtx.drawImage(
        img,
        0,
        0,
        paintWidth,
        paintHeight,
        0,
        0,
        newWidth,
        newHeight
      );
      img = tmpCanvas.canvas;
      paintWidth = newWidth;
      paintHeight = newHeight;
      tmpCanvasId = tmpCanvasId === "prescale1" ? "prescale2" : "prescale1";
    }
    return {
      img,
      paintWidth,
      paintHeight,
    };
  }

  _createMaskCanvas(img) {
    const ctx = this.ctx;
    const width = img.width,
      height = img.height;
    const fillColor = this.current.fillColor;
    const isPatternFill = this.current.patternFill;
    const maskCanvas = this.cachedCanvases.getCanvas(
      "maskCanvas",
      width,
      height
    );
    const maskCtx = maskCanvas.context;
    putBinaryImageMask(maskCtx, img);

    // Create the mask canvas at the size it will be drawn at and also set
    // its transform to match the current transform so if there are any
    // patterns applied they will be applied relative to the correct
    // transform.
    const objToCanvas = ctx.mozCurrentTransform;
    let maskToCanvas = Util.transform(objToCanvas, [
      1 / width,
      0,
      0,
      -1 / height,
      0,
      0,
    ]);
    maskToCanvas = Util.transform(maskToCanvas, [1, 0, 0, 1, 0, -height]);
    const cord1 = Util.applyTransform([0, 0], maskToCanvas);
    const cord2 = Util.applyTransform([width, height], maskToCanvas);
    const rect = Util.normalizeRect([cord1[0], cord1[1], cord2[0], cord2[1]]);
    const drawnWidth = Math.ceil(rect[2] - rect[0]);
    const drawnHeight = Math.ceil(rect[3] - rect[1]);
    const fillCanvas = this.cachedCanvases.getCanvas(
      "fillCanvas",
      drawnWidth,
      drawnHeight,
      true
    );
    const fillCtx = fillCanvas.context;
    // The offset will be the top-left cordinate mask.
    const offsetX = Math.min(cord1[0], cord2[0]);
    const offsetY = Math.min(cord1[1], cord2[1]);
    fillCtx.translate(-offsetX, -offsetY);
    fillCtx.transform.apply(fillCtx, maskToCanvas);
    // Pre-scale if needed to improve image smoothing.
    const scaled = this._scaleImage(
      maskCanvas.canvas,
      fillCtx.mozCurrentTransformInverse
    );
    fillCtx.imageSmoothingEnabled = getImageSmoothingEnabled(
      fillCtx.mozCurrentTransform,
      img.interpolate
    );
    fillCtx.drawImage(
      scaled.img,
      0,
      0,
      scaled.img.width,
      scaled.img.height,
      0,
      0,
      width,
      height
    );
    fillCtx.globalCompositeOperation = "source-in";

    const inverse = Util.transform(fillCtx.mozCurrentTransformInverse, [
      1,
      0,
      0,
      1,
      -offsetX,
      -offsetY,
    ]);
    fillCtx.fillStyle = isPatternFill
      ? fillColor.getPattern(ctx, this, inverse, false)
      : fillColor;

    fillCtx.fillRect(0, 0, width, height);

    // Round the offsets to avoid drawing fractional pixels.
    return {
      canvas: fillCanvas.canvas,
      offsetX: Math.round(offsetX),
      offsetY: Math.round(offsetY),
    };
  }

  // Graphics state
  setLineWidth(width) {
    this.current.lineWidth = width;
    this.ctx.lineWidth = width;
  }

  setLineCap(style) {
    this.ctx.lineCap = LINE_CAP_STYLES[style];
  }

  setLineJoin(style) {
    this.ctx.lineJoin = LINE_JOIN_STYLES[style];
  }

  setMiterLimit(limit) {
    this.ctx.miterLimit = limit;
  }

  setDash(dashArray, dashPhase) {
    const ctx = this.ctx;
    if (ctx.setLineDash !== undefined) {
      ctx.setLineDash(dashArray);
      ctx.lineDashOffset = dashPhase;
    }
  }

  setRenderingIntent(intent) {
    // This operation is ignored since we haven't found a use case for it yet.
  }

  setFlatness(flatness) {
    // This operation is ignored since we haven't found a use case for it yet.
  }

  setGState(states) {
    for (let i = 0, ii = states.length; i < ii; i++) {
      const state = states[i];
      const key = state[0];
      const value = state[1];

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
          this.setFont(value[0], value[1]);
          break;
        case "CA":
          this.current.strokeAlpha = state[1];
          break;
        case "ca":
          this.current.fillAlpha = state[1];
          this.ctx.globalAlpha = state[1];
          break;
        case "BM":
          this.ctx.globalCompositeOperation = value;
          break;
        case "SMask":
          this.current.activeSMask = value ? this.tempSMask : null;
          this.tempSMask = null;
          this.checkSMaskState();
          break;
        case "TR":
          this.current.transferMaps = value;
      }
    }
  }

  checkSMaskState() {
    const inSMaskMode = !!this.suspendedCtx;
    if (this.current.activeSMask && !inSMaskMode) {
      this.beginSMaskMode();
    } else if (!this.current.activeSMask && inSMaskMode) {
      this.endSMaskMode();
    }
    // Else, the state is okay and nothing needs to be done.
  }

  /**
   * Soft mask mode takes the current main drawing canvas and replaces it with
   * a temporary canvas. Any drawing operations that happen on the temporary
   * canvas need to be composed with the main canvas that was suspended (see
   * `compose()`). The temporary canvas also duplicates many of its operations
   * on the suspended canvas to keep them in sync, so that when the soft mask
   * mode ends any clipping paths or transformations will still be active and in
   * the right order on the canvas' graphics state stack.
   */
  beginSMaskMode() {
    if (this.suspendedCtx) {
      throw new Error("beginSMaskMode called while already in smask mode");
    }
    const drawnWidth = this.ctx.canvas.width;
    const drawnHeight = this.ctx.canvas.height;
    const cacheId = "smaskGroupAt" + this.groupLevel;
    const scratchCanvas = this.cachedCanvases.getCanvas(
      cacheId,
      drawnWidth,
      drawnHeight,
      true
    );
    this.suspendedCtx = this.ctx;
    this.ctx = scratchCanvas.context;
    const ctx = this.ctx;
    ctx.setTransform.apply(ctx, this.suspendedCtx.mozCurrentTransform);
    copyCtxState(this.suspendedCtx, ctx);
    mirrorContextOperations(ctx, this.suspendedCtx);

    this.setGState([
      ["BM", "source-over"],
      ["ca", 1],
      ["CA", 1],
    ]);
  }

  endSMaskMode() {
    if (!this.suspendedCtx) {
      throw new Error("endSMaskMode called while not in smask mode");
    }
    // The soft mask is done, now restore the suspended canvas as the main
    // drawing canvas.
    this.ctx._removeMirroring();
    copyCtxState(this.ctx, this.suspendedCtx);
    this.ctx = this.suspendedCtx;

    this.current.activeSMask = null;
    this.suspendedCtx = null;
  }

  compose(dirtyBox) {
    if (!this.current.activeSMask) {
      return;
    }

    if (!dirtyBox) {
      dirtyBox = [0, 0, this.ctx.canvas.width, this.ctx.canvas.height];
    } else {
      dirtyBox[0] = Math.floor(dirtyBox[0]);
      dirtyBox[1] = Math.floor(dirtyBox[1]);
      dirtyBox[2] = Math.ceil(dirtyBox[2]);
      dirtyBox[3] = Math.ceil(dirtyBox[3]);
    }
    const smask = this.current.activeSMask;
    const suspendedCtx = this.suspendedCtx;

    composeSMask(suspendedCtx, smask, this.ctx, dirtyBox);
    // Whatever was drawn has been moved to the suspended canvas, now clear it
    // out of the current canvas.
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    this.ctx.restore();
  }

  save() {
    this.ctx.save();
    const old = this.current;
    this.stateStack.push(old);
    this.current = old.clone();
  }

  restore() {
    if (this.stateStack.length === 0 && this.current.activeSMask) {
      this.endSMaskMode();
    }

    if (this.stateStack.length !== 0) {
      this.current = this.stateStack.pop();
      this.ctx.restore();
      this.checkSMaskState();

      // Ensure that the clipping path is reset (fixes issue6413.pdf).
      this.pendingClip = null;

      this._cachedGetSinglePixelWidth = null;
    }
  }

  transform(a, b, c, d, e, f) {
    this.ctx.transform(a, b, c, d, e, f);

    this._cachedGetSinglePixelWidth = null;
  }

  // Path
  constructPath(ops, args) {
    const ctx = this.ctx;
    const current = this.current;
    let x = current.x,
      y = current.y;
    let startX, startY;
    for (let i = 0, j = 0, ii = ops.length; i < ii; i++) {
      switch (ops[i] | 0) {
        case OPS.rectangle:
          x = args[j++];
          y = args[j++];
          const width = args[j++];
          const height = args[j++];

          const xw = x + width;
          const yh = y + height;
          ctx.moveTo(x, y);
          if (width === 0 || height === 0) {
            ctx.lineTo(xw, yh);
          } else {
            ctx.lineTo(xw, y);
            ctx.lineTo(xw, yh);
            ctx.lineTo(x, yh);
          }
          current.updatePathMinMax(ctx.mozCurrentTransform, x, y);
          current.updatePathMinMax(ctx.mozCurrentTransform, xw, yh);
          ctx.closePath();
          break;
        case OPS.moveTo:
          x = args[j++];
          y = args[j++];
          ctx.moveTo(x, y);
          current.updatePathMinMax(ctx.mozCurrentTransform, x, y);
          break;
        case OPS.lineTo:
          x = args[j++];
          y = args[j++];
          ctx.lineTo(x, y);
          current.updatePathMinMax(ctx.mozCurrentTransform, x, y);
          break;
        case OPS.curveTo:
          startX = x;
          startY = y;
          x = args[j + 4];
          y = args[j + 5];
          ctx.bezierCurveTo(
            args[j],
            args[j + 1],
            args[j + 2],
            args[j + 3],
            x,
            y
          );
          current.updateCurvePathMinMax(
            ctx.mozCurrentTransform,
            startX,
            startY,
            args[j],
            args[j + 1],
            args[j + 2],
            args[j + 3],
            x,
            y
          );
          j += 6;
          break;
        case OPS.curveTo2:
          startX = x;
          startY = y;
          ctx.bezierCurveTo(
            x,
            y,
            args[j],
            args[j + 1],
            args[j + 2],
            args[j + 3]
          );
          current.updateCurvePathMinMax(
            ctx.mozCurrentTransform,
            startX,
            startY,
            x,
            y,
            args[j],
            args[j + 1],
            args[j + 2],
            args[j + 3]
          );
          x = args[j + 2];
          y = args[j + 3];
          j += 4;
          break;
        case OPS.curveTo3:
          startX = x;
          startY = y;
          x = args[j + 2];
          y = args[j + 3];
          ctx.bezierCurveTo(args[j], args[j + 1], x, y, x, y);
          current.updateCurvePathMinMax(
            ctx.mozCurrentTransform,
            startX,
            startY,
            args[j],
            args[j + 1],
            x,
            y,
            x,
            y
          );
          j += 4;
          break;
        case OPS.closePath:
          ctx.closePath();
          break;
      }
    }
    current.setCurrentPoint(x, y);
  }

  closePath() {
    this.ctx.closePath();
  }

  stroke(consumePath) {
    consumePath = typeof consumePath !== "undefined" ? consumePath : true;
    const ctx = this.ctx;
    const strokeColor = this.current.strokeColor;
    // For stroke we want to temporarily change the global alpha to the
    // stroking alpha.
    ctx.globalAlpha = this.current.strokeAlpha;
    if (this.contentVisible) {
      if (typeof strokeColor === "object" && strokeColor?.getPattern) {
        const lineWidth = this.getSinglePixelWidth();
        ctx.save();
        ctx.strokeStyle = strokeColor.getPattern(
          ctx,
          this,
          ctx.mozCurrentTransformInverse
        );
        // Prevent drawing too thin lines by enforcing a minimum line width.
        ctx.lineWidth = Math.max(lineWidth, this.current.lineWidth);
        ctx.stroke();
        ctx.restore();
      } else {
        const lineWidth = this.getSinglePixelWidth();
        if (lineWidth < 0 && -lineWidth >= this.current.lineWidth) {
          // The current transform will transform a square pixel into a
          // parallelogram where both heights are lower than 1 and not equal.
          ctx.save();
          ctx.resetTransform();
          ctx.lineWidth = Math.round(this._combinedScaleFactor);
          ctx.stroke();
          ctx.restore();
        } else {
          // Prevent drawing too thin lines by enforcing a minimum line width.
          ctx.lineWidth = Math.max(lineWidth, this.current.lineWidth);
          ctx.stroke();
        }
      }
    }
    if (consumePath) {
      this.consumePath(this.current.getClippedPathBoundingBox());
    }
    // Restore the global alpha to the fill alpha
    ctx.globalAlpha = this.current.fillAlpha;
  }

  closeStroke() {
    this.closePath();
    this.stroke();
  }

  fill(consumePath) {
    consumePath = typeof consumePath !== "undefined" ? consumePath : true;
    const ctx = this.ctx;
    const fillColor = this.current.fillColor;
    const isPatternFill = this.current.patternFill;
    let needRestore = false;

    if (isPatternFill) {
      ctx.save();
      ctx.fillStyle = fillColor.getPattern(
        ctx,
        this,
        ctx.mozCurrentTransformInverse
      );
      needRestore = true;
    }

    const intersect = this.current.getClippedPathBoundingBox();
    if (this.contentVisible && intersect !== null) {
      if (this.pendingEOFill) {
        ctx.fill("evenodd");
        this.pendingEOFill = false;
      } else {
        ctx.fill();
      }
    }

    if (needRestore) {
      ctx.restore();
    }
    if (consumePath) {
      this.consumePath(intersect);
    }
  }

  eoFill() {
    this.pendingEOFill = true;
    this.fill();
  }

  fillStroke() {
    this.fill(false);
    this.stroke(false);

    this.consumePath();
  }

  eoFillStroke() {
    this.pendingEOFill = true;
    this.fillStroke();
  }

  closeFillStroke() {
    this.closePath();
    this.fillStroke();
  }

  closeEOFillStroke() {
    this.pendingEOFill = true;
    this.closePath();
    this.fillStroke();
  }

  endPath() {
    this.consumePath();
  }

  // Clipping
  clip() {
    this.pendingClip = NORMAL_CLIP;
  }

  eoClip() {
    this.pendingClip = EO_CLIP;
  }

  // Text
  beginText() {
    this.current.textMatrix = IDENTITY_MATRIX;
    this.current.textMatrixScale = 1;
    this.current.x = this.current.lineX = 0;
    this.current.y = this.current.lineY = 0;
  }

  endText() {
    const paths = this.pendingTextPaths;
    const ctx = this.ctx;
    if (paths === undefined) {
      ctx.beginPath();
      return;
    }

    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      ctx.setTransform.apply(ctx, path.transform);
      ctx.translate(path.x, path.y);
      path.addToPath(ctx, path.fontSize);
    }
    ctx.restore();
    ctx.clip();
    ctx.beginPath();
    delete this.pendingTextPaths;
  }

  setCharSpacing(spacing) {
    this.current.charSpacing = spacing;
  }

  setWordSpacing(spacing) {
    this.current.wordSpacing = spacing;
  }

  setHScale(scale) {
    this.current.textHScale = scale / 100;
  }

  setLeading(leading) {
    this.current.leading = -leading;
  }

  setFont(fontRefName, size) {
    const fontObj = this.commonObjs.get(fontRefName);
    const current = this.current;

    if (!fontObj) {
      throw new Error(`Can't find font for ${fontRefName}`);
    }
    current.fontMatrix = fontObj.fontMatrix || FONT_IDENTITY_MATRIX;

    // A valid matrix needs all main diagonal elements to be non-zero
    // This also ensures we bypass FF bugzilla bug #719844.
    if (current.fontMatrix[0] === 0 || current.fontMatrix[3] === 0) {
      warn("Invalid font matrix for font " + fontRefName);
    }

    // The spec for Tf (setFont) says that 'size' specifies the font 'scale',
    // and in some docs this can be negative (inverted x-y axes).
    if (size < 0) {
      size = -size;
      current.fontDirection = -1;
    } else {
      current.fontDirection = 1;
    }

    this.current.font = fontObj;
    this.current.fontSize = size;

    if (fontObj.isType3Font) {
      return; // we don't need ctx.font for Type3 fonts
    }

    const name = fontObj.loadedName || "sans-serif";

    let bold = "normal";
    if (fontObj.black) {
      bold = "900";
    } else if (fontObj.bold) {
      bold = "bold";
    }
    const italic = fontObj.italic ? "italic" : "normal";
    const typeface = `"${name}", ${fontObj.fallbackName}`;

    // Some font backends cannot handle fonts below certain size.
    // Keeping the font at minimal size and using the fontSizeScale to change
    // the current transformation matrix before the fillText/strokeText.
    // See https://bugzilla.mozilla.org/show_bug.cgi?id=726227
    let browserFontSize = size;
    if (size < MIN_FONT_SIZE) {
      browserFontSize = MIN_FONT_SIZE;
    } else if (size > MAX_FONT_SIZE) {
      browserFontSize = MAX_FONT_SIZE;
    }
    this.current.fontSizeScale = size / browserFontSize;

    this.ctx.font = `${italic} ${bold} ${browserFontSize}px ${typeface}`;
  }

  setTextRenderingMode(mode) {
    this.current.textRenderingMode = mode;
  }

  setTextRise(rise) {
    this.current.textRise = rise;
  }

  moveText(x, y) {
    this.current.x = this.current.lineX += x;
    this.current.y = this.current.lineY += y;
  }

  setLeadingMoveText(x, y) {
    this.setLeading(-y);
    this.moveText(x, y);
  }

  setTextMatrix(a, b, c, d, e, f) {
    this.current.textMatrix = [a, b, c, d, e, f];
    this.current.textMatrixScale = Math.hypot(a, b);

    this.current.x = this.current.lineX = 0;
    this.current.y = this.current.lineY = 0;
  }

  nextLine() {
    this.moveText(0, this.current.leading);
  }

  paintChar(character, x, y, patternTransform, resetLineWidthToOne) {
    const ctx = this.ctx;
    const current = this.current;
    const font = current.font;
    const textRenderingMode = current.textRenderingMode;
    const fontSize = current.fontSize / current.fontSizeScale;
    const fillStrokeMode =
      textRenderingMode & TextRenderingMode.FILL_STROKE_MASK;
    const isAddToPathSet = !!(
      textRenderingMode & TextRenderingMode.ADD_TO_PATH_FLAG
    );
    const patternFill = current.patternFill && !font.missingFile;

    let addToPath;
    if (font.disableFontFace || isAddToPathSet || patternFill) {
      addToPath = font.getPathGenerator(this.commonObjs, character);
    }

    if (font.disableFontFace || patternFill) {
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      addToPath(ctx, fontSize);
      if (patternTransform) {
        ctx.setTransform.apply(ctx, patternTransform);
      }
      if (
        fillStrokeMode === TextRenderingMode.FILL ||
        fillStrokeMode === TextRenderingMode.FILL_STROKE
      ) {
        ctx.fill();
      }
      if (
        fillStrokeMode === TextRenderingMode.STROKE ||
        fillStrokeMode === TextRenderingMode.FILL_STROKE
      ) {
        if (resetLineWidthToOne) {
          ctx.resetTransform();
          ctx.lineWidth = Math.round(this._combinedScaleFactor);
        }
        ctx.stroke();
      }
      ctx.restore();
    } else {
      if (
        fillStrokeMode === TextRenderingMode.FILL ||
        fillStrokeMode === TextRenderingMode.FILL_STROKE
      ) {
        ctx.fillText(character, x, y);
      }
      if (
        fillStrokeMode === TextRenderingMode.STROKE ||
        fillStrokeMode === TextRenderingMode.FILL_STROKE
      ) {
        if (resetLineWidthToOne) {
          ctx.save();
          ctx.moveTo(x, y);
          ctx.resetTransform();
          ctx.lineWidth = Math.round(this._combinedScaleFactor);
          ctx.strokeText(character, 0, 0);
          ctx.restore();
        } else {
          ctx.strokeText(character, x, y);
        }
      }
    }

    if (isAddToPathSet) {
      const paths = this.pendingTextPaths || (this.pendingTextPaths = []);
      paths.push({
        transform: ctx.mozCurrentTransform,
        x,
        y,
        fontSize,
        addToPath,
      });
    }
  }

  get isFontSubpixelAAEnabled() {
    // Checks if anti-aliasing is enabled when scaled text is painted.
    // On Windows GDI scaled fonts looks bad.
    const { context: ctx } = this.cachedCanvases.getCanvas(
      "isFontSubpixelAAEnabled",
      10,
      10
    );
    ctx.scale(1.5, 1);
    ctx.fillText("I", 0, 10);
    const data = ctx.getImageData(0, 0, 10, 10).data;
    let enabled = false;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0 && data[i] < 255) {
        enabled = true;
        break;
      }
    }
    return shadow(this, "isFontSubpixelAAEnabled", enabled);
  }

  showText(glyphs) {
    const current = this.current;
    const font = current.font;
    if (font.isType3Font) {
      return this.showType3Text(glyphs);
    }

    const fontSize = current.fontSize;
    if (fontSize === 0) {
      return undefined;
    }

    const ctx = this.ctx;
    const fontSizeScale = current.fontSizeScale;
    const charSpacing = current.charSpacing;
    const wordSpacing = current.wordSpacing;
    const fontDirection = current.fontDirection;
    const textHScale = current.textHScale * fontDirection;
    const glyphsLength = glyphs.length;
    const vertical = font.vertical;
    const spacingDir = vertical ? 1 : -1;
    const defaultVMetrics = font.defaultVMetrics;
    const widthAdvanceScale = fontSize * current.fontMatrix[0];

    const simpleFillText =
      current.textRenderingMode === TextRenderingMode.FILL &&
      !font.disableFontFace &&
      !current.patternFill;

    ctx.save();
    let patternTransform;
    if (current.patternFill) {
      // TODO: Patterns are not applied correctly to text if a non-embedded
      // font is used. E.g. issue 8111 and ShowText-ShadingPattern.pdf.
      ctx.save();
      const pattern = current.fillColor.getPattern(
        ctx,
        this,
        ctx.mozCurrentTransformInverse
      );
      patternTransform = ctx.mozCurrentTransform;
      ctx.restore();
      ctx.fillStyle = pattern;
    }
    ctx.transform.apply(ctx, current.textMatrix);
    ctx.translate(current.x, current.y + current.textRise);

    if (fontDirection > 0) {
      ctx.scale(textHScale, -1);
    } else {
      ctx.scale(textHScale, 1);
    }

    let lineWidth = current.lineWidth;
    let resetLineWidthToOne = false;
    const scale = current.textMatrixScale;
    if (scale === 0 || lineWidth === 0) {
      const fillStrokeMode =
        current.textRenderingMode & TextRenderingMode.FILL_STROKE_MASK;
      if (
        fillStrokeMode === TextRenderingMode.STROKE ||
        fillStrokeMode === TextRenderingMode.FILL_STROKE
      ) {
        this._cachedGetSinglePixelWidth = null;
        lineWidth = this.getSinglePixelWidth();
        resetLineWidthToOne = lineWidth < 0;
      }
    } else {
      lineWidth /= scale;
    }

    if (fontSizeScale !== 1.0) {
      ctx.scale(fontSizeScale, fontSizeScale);
      lineWidth /= fontSizeScale;
    }

    ctx.lineWidth = lineWidth;

    let x = 0,
      i;
    for (i = 0; i < glyphsLength; ++i) {
      const glyph = glyphs[i];
      if (isNum(glyph)) {
        x += (spacingDir * glyph * fontSize) / 1000;
        continue;
      }

      let restoreNeeded = false;
      const spacing = (glyph.isSpace ? wordSpacing : 0) + charSpacing;
      const character = glyph.fontChar;
      const accent = glyph.accent;
      let scaledX, scaledY;
      let width = glyph.width;
      if (vertical) {
        const vmetric = glyph.vmetric || defaultVMetrics;
        const vx =
          -(glyph.vmetric ? vmetric[1] : width * 0.5) * widthAdvanceScale;
        const vy = vmetric[2] * widthAdvanceScale;

        width = vmetric ? -vmetric[0] : width;
        scaledX = vx / fontSizeScale;
        scaledY = (x + vy) / fontSizeScale;
      } else {
        scaledX = x / fontSizeScale;
        scaledY = 0;
      }

      if (font.remeasure && width > 0) {
        // Some standard fonts may not have the exact width: rescale per
        // character if measured width is greater than expected glyph width
        // and subpixel-aa is enabled, otherwise just center the glyph.
        const measuredWidth =
          ((ctx.measureText(character).width * 1000) / fontSize) *
          fontSizeScale;
        if (width < measuredWidth && this.isFontSubpixelAAEnabled) {
          const characterScaleX = width / measuredWidth;
          restoreNeeded = true;
          ctx.save();
          ctx.scale(characterScaleX, 1);
          scaledX /= characterScaleX;
        } else if (width !== measuredWidth) {
          scaledX +=
            (((width - measuredWidth) / 2000) * fontSize) / fontSizeScale;
        }
      }

      // Only attempt to draw the glyph if it is actually in the embedded font
      // file or if there isn't a font file so the fallback font is shown.
      if (this.contentVisible && (glyph.isInFont || font.missingFile)) {
        if (simpleFillText && !accent) {
          // common case
          ctx.fillText(character, scaledX, scaledY);
        } else {
          this.paintChar(
            character,
            scaledX,
            scaledY,
            patternTransform,
            resetLineWidthToOne
          );
          if (accent) {
            const scaledAccentX =
              scaledX + (fontSize * accent.offset.x) / fontSizeScale;
            const scaledAccentY =
              scaledY - (fontSize * accent.offset.y) / fontSizeScale;
            this.paintChar(
              accent.fontChar,
              scaledAccentX,
              scaledAccentY,
              patternTransform,
              resetLineWidthToOne
            );
          }
        }
      }

      let charWidth;
      if (vertical) {
        charWidth = width * widthAdvanceScale - spacing * fontDirection;
      } else {
        charWidth = width * widthAdvanceScale + spacing * fontDirection;
      }
      x += charWidth;

      if (restoreNeeded) {
        ctx.restore();
      }
    }
    if (vertical) {
      current.y -= x;
    } else {
      current.x += x * textHScale;
    }
    ctx.restore();
    this.compose();
    return undefined;
  }

  showType3Text(glyphs) {
    // Type3 fonts - each glyph is a "mini-PDF"
    const ctx = this.ctx;
    const current = this.current;
    const font = current.font;
    const fontSize = current.fontSize;
    const fontDirection = current.fontDirection;
    const spacingDir = font.vertical ? 1 : -1;
    const charSpacing = current.charSpacing;
    const wordSpacing = current.wordSpacing;
    const textHScale = current.textHScale * fontDirection;
    const fontMatrix = current.fontMatrix || FONT_IDENTITY_MATRIX;
    const glyphsLength = glyphs.length;
    const isTextInvisible =
      current.textRenderingMode === TextRenderingMode.INVISIBLE;
    let i, glyph, width, spacingLength;

    if (isTextInvisible || fontSize === 0) {
      return;
    }
    this._cachedGetSinglePixelWidth = null;

    ctx.save();
    ctx.transform.apply(ctx, current.textMatrix);
    ctx.translate(current.x, current.y);

    ctx.scale(textHScale, fontDirection);

    for (i = 0; i < glyphsLength; ++i) {
      glyph = glyphs[i];
      if (isNum(glyph)) {
        spacingLength = (spacingDir * glyph * fontSize) / 1000;
        this.ctx.translate(spacingLength, 0);
        current.x += spacingLength * textHScale;
        continue;
      }

      const spacing = (glyph.isSpace ? wordSpacing : 0) + charSpacing;
      const operatorList = font.charProcOperatorList[glyph.operatorListId];
      if (!operatorList) {
        warn(`Type3 character "${glyph.operatorListId}" is not available.`);
        continue;
      }
      if (this.contentVisible) {
        this.processingType3 = glyph;
        this.save();
        ctx.scale(fontSize, fontSize);
        ctx.transform.apply(ctx, fontMatrix);
        this.executeOperatorList(operatorList);
        this.restore();
      }

      const transformed = Util.applyTransform([glyph.width, 0], fontMatrix);
      width = transformed[0] * fontSize + spacing;

      ctx.translate(width, 0);
      current.x += width * textHScale;
    }
    ctx.restore();
    this.processingType3 = null;
  }

  // Type3 fonts
  setCharWidth(xWidth, yWidth) {
    // We can safely ignore this since the width should be the same
    // as the width in the Widths array.
  }

  setCharWidthAndBounds(xWidth, yWidth, llx, lly, urx, ury) {
    // TODO According to the spec we're also suppose to ignore any operators
    // that set color or include images while processing this type3 font.
    this.ctx.rect(llx, lly, urx - llx, ury - lly);
    this.clip();
    this.endPath();
  }

  // Color
  getColorN_Pattern(IR) {
    let pattern;
    if (IR[0] === "TilingPattern") {
      const color = IR[1];
      const baseTransform =
        this.baseTransform || this.ctx.mozCurrentTransform.slice();
      const canvasGraphicsFactory = {
        createCanvasGraphics: ctx => {
          return new CanvasGraphics(
            ctx,
            this.commonObjs,
            this.objs,
            this.canvasFactory
          );
        },
      };
      pattern = new TilingPattern(
        IR,
        color,
        this.ctx,
        canvasGraphicsFactory,
        baseTransform
      );
    } else {
      pattern = this._getPattern(IR[1], IR[2]);
    }
    return pattern;
  }

  setStrokeColorN() {
    this.current.strokeColor = this.getColorN_Pattern(arguments);
  }

  setFillColorN() {
    this.current.fillColor = this.getColorN_Pattern(arguments);
    this.current.patternFill = true;
  }

  setStrokeRGBColor(r, g, b) {
    const color = Util.makeHexColor(r, g, b);
    this.ctx.strokeStyle = color;
    this.current.strokeColor = color;
  }

  setFillRGBColor(r, g, b) {
    const color = Util.makeHexColor(r, g, b);
    this.ctx.fillStyle = color;
    this.current.fillColor = color;
    this.current.patternFill = false;
  }

  _getPattern(objId, matrix = null) {
    let pattern;
    if (this.cachedPatterns.has(objId)) {
      pattern = this.cachedPatterns.get(objId);
    } else {
      pattern = getShadingPattern(
        this.objs.get(objId),
        this.cachedCanvasPatterns
      );
      this.cachedPatterns.set(objId, pattern);
    }
    if (matrix) {
      pattern.matrix = matrix;
    }
    return pattern;
  }

  shadingFill(objId) {
    if (!this.contentVisible) {
      return;
    }
    const ctx = this.ctx;

    this.save();
    const pattern = this._getPattern(objId);
    ctx.fillStyle = pattern.getPattern(
      ctx,
      this,
      ctx.mozCurrentTransformInverse,
      true
    );

    const inv = ctx.mozCurrentTransformInverse;
    if (inv) {
      const canvas = ctx.canvas;
      const width = canvas.width;
      const height = canvas.height;

      const bl = Util.applyTransform([0, 0], inv);
      const br = Util.applyTransform([0, height], inv);
      const ul = Util.applyTransform([width, 0], inv);
      const ur = Util.applyTransform([width, height], inv);

      const x0 = Math.min(bl[0], br[0], ul[0], ur[0]);
      const y0 = Math.min(bl[1], br[1], ul[1], ur[1]);
      const x1 = Math.max(bl[0], br[0], ul[0], ur[0]);
      const y1 = Math.max(bl[1], br[1], ul[1], ur[1]);

      this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    } else {
      // HACK to draw the gradient onto an infinite rectangle.
      // PDF gradients are drawn across the entire image while
      // Canvas only allows gradients to be drawn in a rectangle
      // The following bug should allow us to remove this.
      // https://bugzilla.mozilla.org/show_bug.cgi?id=664884

      this.ctx.fillRect(-1e10, -1e10, 2e10, 2e10);
    }

    this.compose(this.current.getClippedPathBoundingBox());
    this.restore();
  }

  // Images
  beginInlineImage() {
    unreachable("Should not call beginInlineImage");
  }

  beginImageData() {
    unreachable("Should not call beginImageData");
  }

  paintFormXObjectBegin(matrix, bbox) {
    if (!this.contentVisible) {
      return;
    }
    this.save();
    this.baseTransformStack.push(this.baseTransform);

    if (Array.isArray(matrix) && matrix.length === 6) {
      this.transform.apply(this, matrix);
    }

    this.baseTransform = this.ctx.mozCurrentTransform;

    if (bbox) {
      const width = bbox[2] - bbox[0];
      const height = bbox[3] - bbox[1];
      this.ctx.rect(bbox[0], bbox[1], width, height);
      this.current.updatePathMinMax(
        this.ctx.mozCurrentTransform,
        bbox[0],
        bbox[1]
      );
      this.current.updatePathMinMax(
        this.ctx.mozCurrentTransform,
        bbox[2],
        bbox[3]
      );
      this.clip();
      this.endPath();
    }
  }

  paintFormXObjectEnd() {
    if (!this.contentVisible) {
      return;
    }
    this.restore();
    this.baseTransform = this.baseTransformStack.pop();
  }

  beginGroup(group) {
    if (!this.contentVisible) {
      return;
    }

    this.save();
    // If there's an active soft mask we don't want it enabled for the group, so
    // clear it out. The mask and suspended canvas will be restored in endGroup.
    const suspendedCtx = this.suspendedCtx;
    if (this.current.activeSMask) {
      this.suspendedCtx = null;
      this.current.activeSMask = null;
    }

    const currentCtx = this.ctx;
    // TODO non-isolated groups - according to Rik at adobe non-isolated
    // group results aren't usually that different and they even have tools
    // that ignore this setting. Notes from Rik on implementing:
    // - When you encounter an transparency group, create a new canvas with
    // the dimensions of the bbox
    // - copy the content from the previous canvas to the new canvas
    // - draw as usual
    // - remove the backdrop alpha:
    // alphaNew = 1 - (1 - alpha)/(1 - alphaBackdrop) with 'alpha' the alpha
    // value of your transparency group and 'alphaBackdrop' the alpha of the
    // backdrop
    // - remove background color:
    // colorNew = color - alphaNew *colorBackdrop /(1 - alphaNew)
    if (!group.isolated) {
      info("TODO: Support non-isolated groups.");
    }

    // TODO knockout - supposedly possible with the clever use of compositing
    // modes.
    if (group.knockout) {
      warn("Knockout groups not supported.");
    }

    const currentTransform = currentCtx.mozCurrentTransform;
    if (group.matrix) {
      currentCtx.transform.apply(currentCtx, group.matrix);
    }
    if (!group.bbox) {
      throw new Error("Bounding box is required.");
    }

    // Based on the current transform figure out how big the bounding box
    // will actually be.
    let bounds = Util.getAxialAlignedBoundingBox(
      group.bbox,
      currentCtx.mozCurrentTransform
    );
    // Clip the bounding box to the current canvas.
    const canvasBounds = [
      0,
      0,
      currentCtx.canvas.width,
      currentCtx.canvas.height,
    ];
    bounds = Util.intersect(bounds, canvasBounds) || [0, 0, 0, 0];
    // Use ceil in case we're between sizes so we don't create canvas that is
    // too small and make the canvas at least 1x1 pixels.
    const offsetX = Math.floor(bounds[0]);
    const offsetY = Math.floor(bounds[1]);
    let drawnWidth = Math.max(Math.ceil(bounds[2]) - offsetX, 1);
    let drawnHeight = Math.max(Math.ceil(bounds[3]) - offsetY, 1);
    let scaleX = 1,
      scaleY = 1;
    if (drawnWidth > MAX_GROUP_SIZE) {
      scaleX = drawnWidth / MAX_GROUP_SIZE;
      drawnWidth = MAX_GROUP_SIZE;
    }
    if (drawnHeight > MAX_GROUP_SIZE) {
      scaleY = drawnHeight / MAX_GROUP_SIZE;
      drawnHeight = MAX_GROUP_SIZE;
    }

    this.current.startNewPathAndClipBox([0, 0, drawnWidth, drawnHeight]);

    let cacheId = "groupAt" + this.groupLevel;
    if (group.smask) {
      // Using two cache entries is case if masks are used one after another.
      cacheId += "_smask_" + (this.smaskCounter++ % 2);
    }
    const scratchCanvas = this.cachedCanvases.getCanvas(
      cacheId,
      drawnWidth,
      drawnHeight,
      true
    );
    const groupCtx = scratchCanvas.context;

    // Since we created a new canvas that is just the size of the bounding box
    // we have to translate the group ctx.
    groupCtx.scale(1 / scaleX, 1 / scaleY);
    groupCtx.translate(-offsetX, -offsetY);
    groupCtx.transform.apply(groupCtx, currentTransform);

    if (group.smask) {
      // Saving state and cached mask to be used in setGState.
      this.smaskStack.push({
        canvas: scratchCanvas.canvas,
        context: groupCtx,
        offsetX,
        offsetY,
        scaleX,
        scaleY,
        subtype: group.smask.subtype,
        backdrop: group.smask.backdrop,
        transferMap: group.smask.transferMap || null,
        startTransformInverse: null, // used during suspend operation
      });
    } else {
      // Setup the current ctx so when the group is popped we draw it at the
      // right location.
      currentCtx.setTransform(1, 0, 0, 1, 0, 0);
      currentCtx.translate(offsetX, offsetY);
      currentCtx.scale(scaleX, scaleY);
      currentCtx.save();
    }
    // The transparency group inherits all off the current graphics state
    // except the blend mode, soft mask, and alpha constants.
    copyCtxState(currentCtx, groupCtx);
    this.ctx = groupCtx;
    this.setGState([
      ["BM", "source-over"],
      ["ca", 1],
      ["CA", 1],
    ]);
    this.groupStack.push({
      ctx: currentCtx,
      suspendedCtx,
    });
    this.groupLevel++;
  }

  endGroup(group) {
    if (!this.contentVisible) {
      return;
    }
    this.groupLevel--;
    const groupCtx = this.ctx;
    const { ctx, suspendedCtx } = this.groupStack.pop();
    this.ctx = ctx;
    // Turn off image smoothing to avoid sub pixel interpolation which can
    // look kind of blurry for some pdfs.
    this.ctx.imageSmoothingEnabled = false;

    if (suspendedCtx) {
      this.suspendedCtx = suspendedCtx;
    }

    if (group.smask) {
      this.tempSMask = this.smaskStack.pop();
      this.restore();
    } else {
      this.ctx.restore();
      const currentMtx = this.ctx.mozCurrentTransform;
      this.restore();
      this.ctx.save();
      this.ctx.setTransform.apply(this.ctx, currentMtx);
      const dirtyBox = Util.getAxialAlignedBoundingBox(
        [0, 0, groupCtx.canvas.width, groupCtx.canvas.height],
        currentMtx
      );
      this.ctx.drawImage(groupCtx.canvas, 0, 0);
      this.ctx.restore();
      this.compose(dirtyBox);
    }
  }

  beginAnnotations() {
    this.save();
    if (this.baseTransform) {
      this.ctx.setTransform.apply(this.ctx, this.baseTransform);
    }
  }

  endAnnotations() {
    this.restore();
  }

  beginAnnotation(id, rect, transform, matrix) {
    this.save();
    resetCtxToDefault(this.ctx);
    this.current = new CanvasExtraState(
      this.ctx.canvas.width,
      this.ctx.canvas.height
    );

    if (Array.isArray(rect) && rect.length === 4) {
      const width = rect[2] - rect[0];
      const height = rect[3] - rect[1];
      this.ctx.rect(rect[0], rect[1], width, height);
      this.clip();
      this.endPath();
    }

    this.transform.apply(this, transform);
    this.transform.apply(this, matrix);
  }

  endAnnotation() {
    this.restore();
  }

  paintImageMaskXObject(img) {
    if (!this.contentVisible) {
      return;
    }
    const ctx = this.ctx;
    const width = img.width,
      height = img.height;

    const glyph = this.processingType3;

    if (COMPILE_TYPE3_GLYPHS && glyph && glyph.compiled === undefined) {
      if (width <= MAX_SIZE_TO_COMPILE && height <= MAX_SIZE_TO_COMPILE) {
        glyph.compiled = compileType3Glyph({ data: img.data, width, height });
      } else {
        glyph.compiled = null;
      }
    }

    if (glyph?.compiled) {
      glyph.compiled(ctx);
      return;
    }
    const mask = this._createMaskCanvas(img);
    const maskCanvas = mask.canvas;

    ctx.save();
    // The mask is drawn with the transform applied. Reset the current
    // transform to draw to the identity.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(maskCanvas, mask.offsetX, mask.offsetY);
    ctx.restore();
    this.compose();
  }

  paintImageMaskXObjectRepeat(
    imgData,
    scaleX,
    skewX = 0,
    skewY = 0,
    scaleY,
    positions
  ) {
    if (!this.contentVisible) {
      return;
    }
    const ctx = this.ctx;
    ctx.save();
    const currentTransform = ctx.mozCurrentTransform;
    ctx.transform(scaleX, skewX, skewY, scaleY, 0, 0);
    const mask = this._createMaskCanvas(imgData);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0, ii = positions.length; i < ii; i += 2) {
      const trans = Util.transform(currentTransform, [
        scaleX,
        skewX,
        skewY,
        scaleY,
        positions[i],
        positions[i + 1],
      ]);

      const [x, y] = Util.applyTransform([0, 0], trans);
      ctx.drawImage(mask.canvas, x, y);
    }
    ctx.restore();
    this.compose();
  }

  paintImageMaskXObjectGroup(images) {
    if (!this.contentVisible) {
      return;
    }
    const ctx = this.ctx;

    const fillColor = this.current.fillColor;
    const isPatternFill = this.current.patternFill;
    for (let i = 0, ii = images.length; i < ii; i++) {
      const image = images[i];
      const width = image.width,
        height = image.height;

      const maskCanvas = this.cachedCanvases.getCanvas(
        "maskCanvas",
        width,
        height
      );
      const maskCtx = maskCanvas.context;
      maskCtx.save();

      putBinaryImageMask(maskCtx, image);

      maskCtx.globalCompositeOperation = "source-in";

      maskCtx.fillStyle = isPatternFill
        ? fillColor.getPattern(
            maskCtx,
            this,
            ctx.mozCurrentTransformInverse,
            false
          )
        : fillColor;
      maskCtx.fillRect(0, 0, width, height);

      maskCtx.restore();

      ctx.save();
      ctx.transform.apply(ctx, image.transform);
      ctx.scale(1, -1);
      ctx.drawImage(maskCanvas.canvas, 0, 0, width, height, 0, -1, 1, 1);
      ctx.restore();
    }
    this.compose();
  }

  paintImageXObject(objId) {
    if (!this.contentVisible) {
      return;
    }
    const imgData = objId.startsWith("g_")
      ? this.commonObjs.get(objId)
      : this.objs.get(objId);
    if (!imgData) {
      warn("Dependent image isn't ready yet");
      return;
    }

    this.paintInlineImageXObject(imgData);
  }

  paintImageXObjectRepeat(objId, scaleX, scaleY, positions) {
    if (!this.contentVisible) {
      return;
    }
    const imgData = objId.startsWith("g_")
      ? this.commonObjs.get(objId)
      : this.objs.get(objId);
    if (!imgData) {
      warn("Dependent image isn't ready yet");
      return;
    }

    const width = imgData.width;
    const height = imgData.height;
    const map = [];
    for (let i = 0, ii = positions.length; i < ii; i += 2) {
      map.push({
        transform: [scaleX, 0, 0, scaleY, positions[i], positions[i + 1]],
        x: 0,
        y: 0,
        w: width,
        h: height,
      });
    }
    this.paintInlineImageXObjectGroup(imgData, map);
  }

  paintInlineImageXObject(imgData) {
    if (!this.contentVisible) {
      return;
    }
    const width = imgData.width;
    const height = imgData.height;
    const ctx = this.ctx;

    this.save();
    // scale the image to the unit square
    ctx.scale(1 / width, -1 / height);

    let imgToPaint;
    // typeof check is needed due to node.js support, see issue #8489
    if (
      (typeof HTMLElement === "function" && imgData instanceof HTMLElement) ||
      !imgData.data
    ) {
      imgToPaint = imgData;
    } else {
      const tmpCanvas = this.cachedCanvases.getCanvas(
        "inlineImage",
        width,
        height
      );
      const tmpCtx = tmpCanvas.context;
      putBinaryImageData(tmpCtx, imgData, this.current.transferMaps);
      imgToPaint = tmpCanvas.canvas;
    }

    const scaled = this._scaleImage(imgToPaint, ctx.mozCurrentTransformInverse);
    ctx.imageSmoothingEnabled = getImageSmoothingEnabled(
      ctx.mozCurrentTransform,
      imgData.interpolate
    );
    ctx.drawImage(
      scaled.img,
      0,
      0,
      scaled.paintWidth,
      scaled.paintHeight,
      0,
      -height,
      width,
      height
    );

    if (this.imageLayer) {
      const position = this.getCanvasPosition(0, -height);
      this.imageLayer.appendImage({
        imgData,
        left: position[0],
        top: position[1],
        width: width / ctx.mozCurrentTransformInverse[0],
        height: height / ctx.mozCurrentTransformInverse[3],
      });
    }
    this.compose();
    this.restore();
  }

  paintInlineImageXObjectGroup(imgData, map) {
    if (!this.contentVisible) {
      return;
    }
    const ctx = this.ctx;
    const w = imgData.width;
    const h = imgData.height;

    const tmpCanvas = this.cachedCanvases.getCanvas("inlineImage", w, h);
    const tmpCtx = tmpCanvas.context;
    putBinaryImageData(tmpCtx, imgData, this.current.transferMaps);

    for (let i = 0, ii = map.length; i < ii; i++) {
      const entry = map[i];
      ctx.save();
      ctx.transform.apply(ctx, entry.transform);
      ctx.scale(1, -1);
      ctx.drawImage(
        tmpCanvas.canvas,
        entry.x,
        entry.y,
        entry.w,
        entry.h,
        0,
        -1,
        1,
        1
      );
      if (this.imageLayer) {
        const position = this.getCanvasPosition(entry.x, entry.y);
        this.imageLayer.appendImage({
          imgData,
          left: position[0],
          top: position[1],
          width: w,
          height: h,
        });
      }
      ctx.restore();
    }
    this.compose();
  }

  paintSolidColorImageMask() {
    if (!this.contentVisible) {
      return;
    }
    this.ctx.fillRect(0, 0, 1, 1);
    this.compose();
  }

  // Marked content

  markPoint(tag) {
    // TODO Marked content.
  }

  markPointProps(tag, properties) {
    // TODO Marked content.
  }

  beginMarkedContent(tag) {
    this.markedContentStack.push({
      visible: true,
    });
  }

  beginMarkedContentProps(tag, properties) {
    if (tag === "OC") {
      this.markedContentStack.push({
        visible: this.optionalContentConfig.isVisible(properties),
      });
    } else {
      this.markedContentStack.push({
        visible: true,
      });
    }
    this.contentVisible = this.isContentVisible();
  }

  endMarkedContent() {
    this.markedContentStack.pop();
    this.contentVisible = this.isContentVisible();
  }

  // Compatibility

  beginCompat() {
    // TODO ignore undefined operators (should we do that anyway?)
  }

  endCompat() {
    // TODO stop ignoring undefined operators
  }

  // Helper functions

  consumePath(clipBox) {
    if (this.pendingClip) {
      this.current.updateClipFromPath();
    }
    if (!this.pendingClip) {
      this.compose(clipBox);
    }
    const ctx = this.ctx;
    if (this.pendingClip) {
      if (this.pendingClip === EO_CLIP) {
        ctx.clip("evenodd");
      } else {
        ctx.clip();
      }
      this.pendingClip = null;
    }
    ctx.beginPath();
  }

  getSinglePixelWidth() {
    if (this._cachedGetSinglePixelWidth === null) {
      // If transform is [a b] then a pixel (square) is transformed
      //                 [c d]
      // into a parallelogram: its area is the abs value of the determinant.
      // This parallelogram has 2 heights:
      //  - Area / |col_1|;
      //  - Area / |col_2|.
      // so in order to get a height of at least 1, pixel height
      // must be computed as followed:
      //  h = max(sqrt(a² + c²) / |det(M)|, sqrt(b² + d²) / |det(M)|).
      // This is equivalent to:
      //  h = max(|line_1_inv(M)|, |line_2_inv(M)|)
      const m = this.ctx.mozCurrentTransform;

      const absDet = Math.abs(m[0] * m[3] - m[2] * m[1]);
      const sqNorm1 = m[0] ** 2 + m[2] ** 2;
      const sqNorm2 = m[1] ** 2 + m[3] ** 2;
      const pixelHeight = Math.sqrt(Math.max(sqNorm1, sqNorm2)) / absDet;
      if (sqNorm1 !== sqNorm2 && this._combinedScaleFactor * pixelHeight > 1) {
        // The parallelogram isn't a square and at least one height
        // is lower than 1 so the resulting line width must be 1
        // but it cannot be achieved with one scale: when scaling a pixel
        // we'll get a rectangle (see issue #12295).
        // For example with matrix [0.001 0, 0, 100], a pixel is transformed
        // in a rectangle 0.001x100. If we just scale by 1000 (to have a 1)
        // then we'll get a rectangle 1x1e5 which is wrong.
        // In this case, we must reset the transform, set linewidth to 1
        // and then stroke.
        this._cachedGetSinglePixelWidth = -(
          this._combinedScaleFactor * pixelHeight
        );
      } else if (absDet > Number.EPSILON) {
        this._cachedGetSinglePixelWidth = pixelHeight;
      } else {
        // Matrix is non-invertible.
        this._cachedGetSinglePixelWidth = 1;
      }
    }

    return this._cachedGetSinglePixelWidth;
  }

  getCanvasPosition(x, y) {
    const transform = this.ctx.mozCurrentTransform;
    return [
      transform[0] * x + transform[2] * y + transform[4],
      transform[1] * x + transform[3] * y + transform[5],
    ];
  }

  isContentVisible() {
    for (let i = this.markedContentStack.length - 1; i >= 0; i--) {
      if (!this.markedContentStack[i].visible) {
        return false;
      }
    }
    return true;
  }
}

for (const op in OPS) {
  if (CanvasGraphics.prototype[op] !== undefined) {
    CanvasGraphics.prototype[OPS[op]] = CanvasGraphics.prototype[op];
  }
}

export { CanvasGraphics };
