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
  CanvasNestedDependencyTracker,
  Dependencies,
} from "./canvas_dependency_tracker.js";
import {
  FeatureTest,
  FONT_IDENTITY_MATRIX,
  ImageKind,
  info,
  OPS,
  shadow,
  TextRenderingMode,
  unreachable,
  Util,
  warn,
} from "../shared/util.js";
import {
  getCurrentTransform,
  getCurrentTransformInverse,
  makePathFromDrawOPS,
  OutputScale,
  PixelsPerInch,
} from "./display_utils.js";
import {
  getShadingPattern,
  PathType,
  TilingPattern,
} from "./pattern_helper.js";
import { convertBlackAndWhiteToRGBA } from "../shared/image_utils.js";

// <canvas> contexts store most of the state we need natively.
// However, PDF needs a bit more state, which we store here.
// Minimal font size that would be used during canvas fillText operations.
const MIN_FONT_SIZE = 16;
// Maximum font size that would be used during canvas fillText operations.
const MAX_FONT_SIZE = 100;

// Defines the time the `executeOperatorList`-method is going to be executing
// before it stops and schedules a continue of execution.
const EXECUTION_TIME = 15; // ms
// Defines the number of steps before checking the execution time.
const EXECUTION_STEPS = 10;

const FULL_CHUNK_HEIGHT = 16;

// Only used in rescaleAndStroke. The goal is to avoid
// creating a new DOMMatrix object each time we need it.
const SCALE_MATRIX = new DOMMatrix();

// Used to get some coordinates.
const XY = new Float32Array(2);

// Initial rectangle values for the minMax array.
const MIN_MAX_INIT = new Float32Array([
  Infinity,
  Infinity,
  -Infinity,
  -Infinity,
]);

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

  ctx.save = function () {
    destCtx.save();
    this.__originalSave();
  };

  ctx.restore = function () {
    destCtx.restore();
    this.__originalRestore();
  };

  ctx.translate = function (x, y) {
    destCtx.translate(x, y);
    this.__originalTranslate(x, y);
  };

  ctx.scale = function (x, y) {
    destCtx.scale(x, y);
    this.__originalScale(x, y);
  };

  ctx.transform = function (a, b, c, d, e, f) {
    destCtx.transform(a, b, c, d, e, f);
    this.__originalTransform(a, b, c, d, e, f);
  };

  ctx.setTransform = function (a, b, c, d, e, f) {
    destCtx.setTransform(a, b, c, d, e, f);
    this.__originalSetTransform(a, b, c, d, e, f);
  };

  ctx.resetTransform = function () {
    destCtx.resetTransform();
    this.__originalResetTransform();
  };

  ctx.rotate = function (angle) {
    destCtx.rotate(angle);
    this.__originalRotate(angle);
  };

  ctx.clip = function (rule) {
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

class CachedCanvases {
  constructor(canvasFactory) {
    this.canvasFactory = canvasFactory;
    this.cache = Object.create(null);
  }

  getCanvas(id, width, height) {
    let canvasEntry;
    if (this.cache[id] !== undefined) {
      canvasEntry = this.cache[id];
      this.canvasFactory.reset(canvasEntry, width, height);
    } else {
      canvasEntry = this.canvasFactory.create(width, height);
      this.cache[id] = canvasEntry;
    }
    return canvasEntry;
  }

  delete(id) {
    delete this.cache[id];
  }

  clear() {
    for (const id in this.cache) {
      const canvasEntry = this.cache[id];
      this.canvasFactory.destroy(canvasEntry);
      delete this.cache[id];
    }
  }
}

function drawImageAtIntegerCoords(
  ctx,
  srcImg,
  srcX,
  srcY,
  srcW,
  srcH,
  destX,
  destY,
  destW,
  destH
) {
  const [a, b, c, d, tx, ty] = getCurrentTransform(ctx);
  if (b === 0 && c === 0) {
    // top-left corner is at (X, Y) and
    // bottom-right one is at (X + width, Y + height).

    // If leftX is 4.321 then it's rounded to 4.
    // If width is 10.432 then it's rounded to 11 because
    // rightX = leftX + width = 14.753 which is rounded to 15
    // so after rounding the total width is 11 (15 - 4).
    // It's why we can't just floor/ceil uniformly, it just depends
    // on the values we've.

    const tlX = destX * a + tx;
    const rTlX = Math.round(tlX);
    const tlY = destY * d + ty;
    const rTlY = Math.round(tlY);
    const brX = (destX + destW) * a + tx;

    // Some pdf contains images with 1x1 images so in case of 0-width after
    // scaling we must fallback on 1 to be sure there is something.
    const rWidth = Math.abs(Math.round(brX) - rTlX) || 1;
    const brY = (destY + destH) * d + ty;
    const rHeight = Math.abs(Math.round(brY) - rTlY) || 1;

    // We must apply a transformation in order to apply it on the image itself.
    // For example if a == 1 && d == -1, it means that the image itself is
    // mirrored w.r.t. the x-axis.
    ctx.setTransform(Math.sign(a), 0, 0, Math.sign(d), rTlX, rTlY);
    ctx.drawImage(srcImg, srcX, srcY, srcW, srcH, 0, 0, rWidth, rHeight);
    ctx.setTransform(a, b, c, d, tx, ty);

    return [rWidth, rHeight];
  }

  if (a === 0 && d === 0) {
    // This path is taken in issue9462.pdf (page 3).
    const tlX = destY * c + tx;
    const rTlX = Math.round(tlX);
    const tlY = destX * b + ty;
    const rTlY = Math.round(tlY);
    const brX = (destY + destH) * c + tx;
    const rWidth = Math.abs(Math.round(brX) - rTlX) || 1;
    const brY = (destX + destW) * b + ty;
    const rHeight = Math.abs(Math.round(brY) - rTlY) || 1;

    ctx.setTransform(0, Math.sign(b), Math.sign(c), 0, rTlX, rTlY);
    ctx.drawImage(srcImg, srcX, srcY, srcW, srcH, 0, 0, rHeight, rWidth);
    ctx.setTransform(a, b, c, d, tx, ty);

    return [rHeight, rWidth];
  }

  // Not a scale matrix so let the render handle the case without rounding.
  ctx.drawImage(srcImg, srcX, srcY, srcW, srcH, destX, destY, destW, destH);

  const scaleX = Math.hypot(a, b);
  const scaleY = Math.hypot(c, d);
  return [scaleX * destW, scaleY * destH];
}

class CanvasExtraState {
  // Are soft masks and alpha values shapes or opacities?
  alphaIsShape = false;

  fontSize = 0;

  fontSizeScale = 1;

  textMatrix = null;

  textMatrixScale = 1;

  fontMatrix = FONT_IDENTITY_MATRIX;

  leading = 0;

  // Current point (in user coordinates)
  x = 0;

  y = 0;

  // Start of text line (in text coordinates)
  lineX = 0;

  lineY = 0;

  // Character and word spacing
  charSpacing = 0;

  wordSpacing = 0;

  textHScale = 1;

  textRenderingMode = TextRenderingMode.FILL;

  textRise = 0;

  // Default fore and background colors
  fillColor = "#000000";

  strokeColor = "#000000";

  patternFill = false;

  patternStroke = false;

  // Note: fill alpha applies to all non-stroking operations
  fillAlpha = 1;

  strokeAlpha = 1;

  lineWidth = 1;

  activeSMask = null;

  transferMaps = "none";

  constructor(width, height, preInit) {
    preInit?.(this);

    this.clipBox = new Float32Array([0, 0, width, height]);
    this.minMax = MIN_MAX_INIT.slice();
  }

  clone() {
    const clone = Object.create(this);
    clone.clipBox = this.clipBox.slice();
    clone.minMax = this.minMax.slice();
    return clone;
  }

  getPathBoundingBox(pathType = PathType.FILL, transform = null) {
    const box = this.minMax.slice();
    if (pathType === PathType.STROKE) {
      if (!transform) {
        unreachable("Stroke bounding box must include transform.");
      }
      // Stroked paths can be outside of the path bounding box by 1/2 the line
      // width.
      Util.singularValueDecompose2dScale(transform, XY);
      const xStrokePad = (XY[0] * this.lineWidth) / 2;
      const yStrokePad = (XY[1] * this.lineWidth) / 2;
      box[0] -= xStrokePad;
      box[1] -= yStrokePad;
      box[2] += xStrokePad;
      box[3] += yStrokePad;
    }
    return box;
  }

  updateClipFromPath() {
    const intersect = Util.intersect(this.clipBox, this.getPathBoundingBox());
    this.startNewPathAndClipBox(intersect || [0, 0, 0, 0]);
  }

  isEmptyClip() {
    return this.minMax[0] === Infinity;
  }

  startNewPathAndClipBox(box) {
    this.clipBox.set(box, 0);
    this.minMax.set(MIN_MAX_INIT, 0);
  }

  getClippedPathBoundingBox(pathType = PathType.FILL, transform = null) {
    return Util.intersect(
      this.clipBox,
      this.getPathBoundingBox(pathType, transform)
    );
  }
}

function putBinaryImageData(ctx, imgData) {
  if (imgData instanceof ImageData) {
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

  // There are multiple forms in which the pixel data can be passed, and
  // imgData.kind tells us which one this is.
  if (imgData.kind === ImageKind.GRAYSCALE_1BPP) {
    // Grayscale, 1 bit per pixel (i.e. black-and-white).
    const srcLength = src.byteLength;
    const dest32 = new Uint32Array(dest.buffer, 0, dest.byteLength >> 2);
    const dest32DataLength = dest32.length;
    const fullSrcDiff = (width + 7) >> 3;
    const white = 0xffffffff;
    const black = FeatureTest.isLittleEndian ? 0xff000000 : 0x000000ff;

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
    j = 0;
    elemsInThisChunk = width * FULL_CHUNK_HEIGHT * 4;
    for (i = 0; i < fullChunks; i++) {
      dest.set(src.subarray(srcPos, srcPos + elemsInThisChunk));
      srcPos += elemsInThisChunk;

      ctx.putImageData(chunkImgData, 0, j);
      j += FULL_CHUNK_HEIGHT;
    }
    if (i < totalChunks) {
      elemsInThisChunk = width * partialChunkHeight * 4;
      dest.set(src.subarray(srcPos, srcPos + elemsInThisChunk));

      ctx.putImageData(chunkImgData, 0, j);
    }
  } else if (imgData.kind === ImageKind.RGB_24BPP) {
    // RGB, 24-bits per pixel.
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

      ctx.putImageData(chunkImgData, 0, i * FULL_CHUNK_HEIGHT);
    }
  } else {
    throw new Error(`bad image kind: ${imgData.kind}`);
  }
}

function putBinaryImageMask(ctx, imgData) {
  if (imgData.bitmap) {
    // The bitmap has been created in the worker.
    ctx.drawImage(imgData.bitmap, 0, 0);
    return;
  }

  // Slow path: OffscreenCanvas isn't available in the worker.
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

    ({ srcPos } = convertBlackAndWhiteToRGBA({
      src,
      srcPos,
      dest,
      width,
      height: thisChunkHeight,
      nonBlackColor: 0,
    }));

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
    "filter",
  ];
  for (const property of properties) {
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
  ctx.strokeStyle = ctx.fillStyle = "#000000";
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
  const { filter } = ctx;
  if (filter !== "none" && filter !== "") {
    ctx.filter = "none";
  }
}

function getImageSmoothingEnabled(transform, interpolate) {
  // In section 8.9.5.3 of the PDF spec, it's mentioned that the interpolate
  // flag should be used when the image is upscaled.
  // In Firefox, smoothing is always used when downscaling images (bug 1360415).

  if (interpolate) {
    return true;
  }

  Util.singularValueDecompose2dScale(transform, XY);
  // Round to a 32bit float so that `<=` check below will pass for numbers that
  // are very close, but not exactly the same 64bit floats.
  const actualScale = Math.fround(
    OutputScale.pixelRatio * PixelsPerInch.PDF_TO_CSS_UNITS
  );
  // `XY` is a Float32Array.
  return XY[0] <= actualScale && XY[1] <= actualScale;
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
    filterFactory,
    { optionalContentConfig, markedContentStack = null },
    annotationCanvasMap,
    pageColors,
    dependencyTracker
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
    this.filterFactory = filterFactory;
    this.groupStack = [];
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
    this.markedContentStack = markedContentStack || [];
    this.optionalContentConfig = optionalContentConfig;
    this.cachedCanvases = new CachedCanvases(this.canvasFactory);
    this.cachedPatterns = new Map();
    this.annotationCanvasMap = annotationCanvasMap;
    this.viewportScale = 1;
    this.outputScaleX = 1;
    this.outputScaleY = 1;
    this.pageColors = pageColors;

    this._cachedScaleForStroking = [-1, 0];
    this._cachedGetSinglePixelWidth = null;
    this._cachedBitmapsMap = new Map();

    this.dependencyTracker = dependencyTracker ?? null;
  }

  getObject(opIdx, data, fallback = null) {
    if (typeof data === "string") {
      this.dependencyTracker?.recordNamedDependency(opIdx, data);
      return data.startsWith("g_")
        ? this.commonObjs.get(data)
        : this.objs.get(data);
    }
    return fallback;
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

    const savedFillStyle = this.ctx.fillStyle;
    this.ctx.fillStyle = background || "#ffffff";
    this.ctx.fillRect(0, 0, width, height);
    this.ctx.fillStyle = savedFillStyle;

    if (transparency) {
      const transparentCanvas = this.cachedCanvases.getCanvas(
        "transparent",
        width,
        height
      );
      this.compositeCtx = this.ctx;
      this.transparentCanvas = transparentCanvas.canvas;
      this.ctx = transparentCanvas.context;
      this.ctx.save();
      // The transform can be applied before rendering, transferring it to
      // the new canvas.
      this.ctx.transform(...getCurrentTransform(this.compositeCtx));
    }

    this.ctx.save();
    resetCtxToDefault(this.ctx);
    if (transform) {
      this.ctx.transform(...transform);
      this.outputScaleX = transform[0];
      this.outputScaleY = transform[0];
    }
    this.ctx.transform(...viewport.transform);
    this.viewportScale = viewport.scale;

    this.baseTransform = getCurrentTransform(this.ctx);
  }

  executeOperatorList(
    operatorList,
    executionStartIdx,
    continueCallback,
    stepper,
    operationsFilter
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
    let fnId, fnArgs;

    while (true) {
      if (stepper !== undefined && i === stepper.nextBreakPoint) {
        stepper.breakIt(i, continueCallback);
        return i;
      }

      if (!operationsFilter || operationsFilter(i)) {
        fnId = fnArray[i];
        // TODO: There is a `undefined` coming from somewhere.
        fnArgs = argsArray[i] ?? null;

        if (fnId !== OPS.dependency) {
          if (fnArgs === null) {
            this[fnId](i);
          } else {
            this[fnId](i, ...fnArgs);
          }
        } else {
          for (const depObjId of fnArgs) {
            this.dependencyTracker?.recordNamedData(depObjId, i);
            const objsPool = depObjId.startsWith("g_") ? commonObjs : objs;

            // If the promise isn't resolved yet, add the continueCallback
            // to the promise and bail out.
            if (!objsPool.has(depObjId)) {
              objsPool.get(depObjId, continueCallback);
              return i;
            }
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

  #restoreInitialState() {
    // Finishing all opened operations such as SMask group painting.
    while (this.stateStack.length || this.inSMaskMode) {
      this.restore();
    }

    this.current.activeSMask = null;
    this.ctx.restore();

    if (this.transparentCanvas) {
      this.ctx = this.compositeCtx;
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Avoid apply transform twice
      this.ctx.drawImage(this.transparentCanvas, 0, 0);
      this.ctx.restore();
      this.transparentCanvas = null;
    }
  }

  endDrawing() {
    this.#restoreInitialState();

    this.cachedCanvases.clear();
    this.cachedPatterns.clear();

    for (const cache of this._cachedBitmapsMap.values()) {
      for (const canvas of cache.values()) {
        if (
          typeof HTMLCanvasElement !== "undefined" &&
          canvas instanceof HTMLCanvasElement
        ) {
          canvas.width = canvas.height = 0;
        }
      }
      cache.clear();
    }
    this._cachedBitmapsMap.clear();
    this.#drawFilter();
  }

  #drawFilter() {
    if (this.pageColors) {
      const hcmFilterId = this.filterFactory.addHCMFilter(
        this.pageColors.foreground,
        this.pageColors.background
      );
      if (hcmFilterId !== "none") {
        const savedFilter = this.ctx.filter;
        this.ctx.filter = hcmFilterId;
        this.ctx.drawImage(this.ctx.canvas, 0, 0);
        this.ctx.filter = savedFilter;
      }
    }
  }

  _scaleImage(img, inverseTransform) {
    // Vertical or horizontal scaling shall not be more than 2 to not lose the
    // pixels during drawImage operation, painting on the temporary canvas(es)
    // that are twice smaller in size.

    // displayWidth and displayHeight are used for VideoFrame.
    const width = img.width ?? img.displayWidth;
    const height = img.height ?? img.displayHeight;
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
        // See bug 1820511 (Windows specific bug).
        // TODO: once the above bug is fixed we could revert to:
        // newWidth = Math.ceil(paintWidth / 2);
        newWidth =
          paintWidth >= 16384
            ? Math.floor(paintWidth / 2) - 1 || 1
            : Math.ceil(paintWidth / 2);
        widthScale /= paintWidth / newWidth;
      }
      if (heightScale > 2 && paintHeight > 1) {
        // TODO: see the comment above.
        newHeight =
          paintHeight >= 16384
            ? Math.floor(paintHeight / 2) - 1 || 1
            : Math.ceil(paintHeight) / 2;
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

  _createMaskCanvas(opIdx, img) {
    const ctx = this.ctx;
    const { width, height } = img;
    const fillColor = this.current.fillColor;
    const isPatternFill = this.current.patternFill;
    const currentTransform = getCurrentTransform(ctx);

    let cache, cacheKey, scaled, maskCanvas;
    if ((img.bitmap || img.data) && img.count > 1) {
      const mainKey = img.bitmap || img.data.buffer;
      // We're reusing the same image several times, so we can cache it.
      // In case we've a pattern fill we just keep the scaled version of
      // the image.
      // Only the scaling part matters, the translation part is just used
      // to compute offsets (but not when filling patterns see #15573).
      // TODO: handle the case of a pattern fill if it's possible.
      cacheKey = JSON.stringify(
        isPatternFill
          ? currentTransform
          : [currentTransform.slice(0, 4), fillColor]
      );

      cache = this._cachedBitmapsMap.get(mainKey);
      if (!cache) {
        cache = new Map();
        this._cachedBitmapsMap.set(mainKey, cache);
      }
      const cachedImage = cache.get(cacheKey);
      if (cachedImage && !isPatternFill) {
        const offsetX = Math.round(
          Math.min(currentTransform[0], currentTransform[2]) +
            currentTransform[4]
        );
        const offsetY = Math.round(
          Math.min(currentTransform[1], currentTransform[3]) +
            currentTransform[5]
        );

        this.dependencyTracker?.recordDependencies(
          opIdx,
          Dependencies.transformAndFill
        );
        return {
          canvas: cachedImage,
          offsetX,
          offsetY,
        };
      }
      scaled = cachedImage;
    }

    if (!scaled) {
      maskCanvas = this.cachedCanvases.getCanvas("maskCanvas", width, height);
      putBinaryImageMask(maskCanvas.context, img);
    }

    // Create the mask canvas at the size it will be drawn at and also set
    // its transform to match the current transform so if there are any
    // patterns applied they will be applied relative to the correct
    // transform.

    let maskToCanvas = Util.transform(currentTransform, [
      1 / width,
      0,
      0,
      -1 / height,
      0,
      0,
    ]);
    maskToCanvas = Util.transform(maskToCanvas, [1, 0, 0, 1, 0, -height]);
    const minMax = MIN_MAX_INIT.slice();
    Util.axialAlignedBoundingBox([0, 0, width, height], maskToCanvas, minMax);
    const [minX, minY, maxX, maxY] = minMax;
    const drawnWidth = Math.round(maxX - minX) || 1;
    const drawnHeight = Math.round(maxY - minY) || 1;
    const fillCanvas = this.cachedCanvases.getCanvas(
      "fillCanvas",
      drawnWidth,
      drawnHeight
    );
    const fillCtx = fillCanvas.context;

    // The offset will be the top-left coordinate mask.
    // If objToCanvas is [a,b,c,d,e,f] then:
    //   - offsetX = min(a, c) + e
    //   - offsetY = min(b, d) + f
    const offsetX = minX;
    const offsetY = minY;
    fillCtx.translate(-offsetX, -offsetY);
    fillCtx.transform(...maskToCanvas);

    if (!scaled) {
      // Pre-scale if needed to improve image smoothing.
      scaled = this._scaleImage(
        maskCanvas.canvas,
        getCurrentTransformInverse(fillCtx)
      );
      scaled = scaled.img;
      if (cache && isPatternFill) {
        cache.set(cacheKey, scaled);
      }
    }

    fillCtx.imageSmoothingEnabled = getImageSmoothingEnabled(
      getCurrentTransform(fillCtx),
      img.interpolate
    );

    drawImageAtIntegerCoords(
      fillCtx,
      scaled,
      0,
      0,
      scaled.width,
      scaled.height,
      0,
      0,
      width,
      height
    );
    fillCtx.globalCompositeOperation = "source-in";

    const inverse = Util.transform(getCurrentTransformInverse(fillCtx), [
      1,
      0,
      0,
      1,
      -offsetX,
      -offsetY,
    ]);
    fillCtx.fillStyle = isPatternFill
      ? fillColor.getPattern(ctx, this, inverse, PathType.FILL, opIdx)
      : fillColor;

    fillCtx.fillRect(0, 0, width, height);

    if (cache && !isPatternFill) {
      // The fill canvas is put in the cache associated to the mask image
      // so we must remove from the cached canvas: it mustn't be used again.
      this.cachedCanvases.delete("fillCanvas");
      cache.set(cacheKey, fillCanvas.canvas);
    }

    this.dependencyTracker?.recordDependencies(
      opIdx,
      Dependencies.transformAndFill
    );

    // Round the offsets to avoid drawing fractional pixels.
    return {
      canvas: fillCanvas.canvas,
      offsetX: Math.round(offsetX),
      offsetY: Math.round(offsetY),
    };
  }

  // Graphics state
  setLineWidth(opIdx, width) {
    this.dependencyTracker?.recordSimpleData("lineWidth", opIdx);
    if (width !== this.current.lineWidth) {
      this._cachedScaleForStroking[0] = -1;
    }
    this.current.lineWidth = width;
    this.ctx.lineWidth = width;
  }

  setLineCap(opIdx, style) {
    this.dependencyTracker?.recordSimpleData("lineCap", opIdx);
    this.ctx.lineCap = LINE_CAP_STYLES[style];
  }

  setLineJoin(opIdx, style) {
    this.dependencyTracker?.recordSimpleData("lineJoin", opIdx);
    this.ctx.lineJoin = LINE_JOIN_STYLES[style];
  }

  setMiterLimit(opIdx, limit) {
    this.dependencyTracker?.recordSimpleData("miterLimit", opIdx);
    this.ctx.miterLimit = limit;
  }

  setDash(opIdx, dashArray, dashPhase) {
    this.dependencyTracker?.recordSimpleData("dash", opIdx);
    const ctx = this.ctx;
    if (ctx.setLineDash !== undefined) {
      ctx.setLineDash(dashArray);
      ctx.lineDashOffset = dashPhase;
    }
  }

  setRenderingIntent(opIdx, intent) {
    // This operation is ignored since we haven't found a use case for it yet.
  }

  setFlatness(opIdx, flatness) {
    // This operation is ignored since we haven't found a use case for it yet.
  }

  setGState(opIdx, states) {
    for (const [key, value] of states) {
      switch (key) {
        case "LW":
          this.setLineWidth(opIdx, value);
          break;
        case "LC":
          this.setLineCap(opIdx, value);
          break;
        case "LJ":
          this.setLineJoin(opIdx, value);
          break;
        case "ML":
          this.setMiterLimit(opIdx, value);
          break;
        case "D":
          this.setDash(opIdx, value[0], value[1]);
          break;
        case "RI":
          this.setRenderingIntent(opIdx, value);
          break;
        case "FL":
          this.setFlatness(opIdx, value);
          break;
        case "Font":
          this.setFont(opIdx, value[0], value[1]);
          break;
        case "CA":
          this.dependencyTracker?.recordSimpleData("strokeAlpha", opIdx);
          this.current.strokeAlpha = value;
          break;
        case "ca":
          this.dependencyTracker?.recordSimpleData("fillAlpha", opIdx);
          this.ctx.globalAlpha = this.current.fillAlpha = value;
          break;
        case "BM":
          this.dependencyTracker?.recordSimpleData(
            "globalCompositeOperation",
            opIdx
          );
          this.ctx.globalCompositeOperation = value;
          break;
        case "SMask":
          this.dependencyTracker?.recordSimpleData("SMask", opIdx);
          this.current.activeSMask = value ? this.tempSMask : null;
          this.tempSMask = null;
          this.checkSMaskState();
          break;
        case "TR":
          this.dependencyTracker?.recordSimpleData("filter", opIdx);
          this.ctx.filter = this.current.transferMaps =
            this.filterFactory.addFilter(value);
          break;
      }
    }
  }

  get inSMaskMode() {
    return !!this.suspendedCtx;
  }

  checkSMaskState() {
    const inSMaskMode = this.inSMaskMode;
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
  beginSMaskMode(opIdx) {
    if (this.inSMaskMode) {
      throw new Error("beginSMaskMode called while already in smask mode");
    }
    const drawnWidth = this.ctx.canvas.width;
    const drawnHeight = this.ctx.canvas.height;
    const cacheId = "smaskGroupAt" + this.groupLevel;
    const scratchCanvas = this.cachedCanvases.getCanvas(
      cacheId,
      drawnWidth,
      drawnHeight
    );
    this.suspendedCtx = this.ctx;
    const ctx = (this.ctx = scratchCanvas.context);
    ctx.setTransform(this.suspendedCtx.getTransform());
    copyCtxState(this.suspendedCtx, ctx);
    mirrorContextOperations(ctx, this.suspendedCtx);

    this.setGState(opIdx, [["BM", "source-over"]]);
  }

  endSMaskMode() {
    if (!this.inSMaskMode) {
      throw new Error("endSMaskMode called while not in smask mode");
    }
    // The soft mask is done, now restore the suspended canvas as the main
    // drawing canvas.
    this.ctx._removeMirroring();
    copyCtxState(this.ctx, this.suspendedCtx);
    this.ctx = this.suspendedCtx;

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

    this.composeSMask(suspendedCtx, smask, this.ctx, dirtyBox);
    // Whatever was drawn has been moved to the suspended canvas, now clear it
    // out of the current canvas.
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    this.ctx.restore();
  }

  composeSMask(ctx, smask, layerCtx, layerBox) {
    const layerOffsetX = layerBox[0];
    const layerOffsetY = layerBox[1];
    const layerWidth = layerBox[2] - layerOffsetX;
    const layerHeight = layerBox[3] - layerOffsetY;
    if (layerWidth === 0 || layerHeight === 0) {
      return;
    }
    this.genericComposeSMask(
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

  genericComposeSMask(
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
    let maskCanvas = maskCtx.canvas;
    let maskX = layerOffsetX - maskOffsetX;
    let maskY = layerOffsetY - maskOffsetY;

    if (backdrop) {
      if (
        maskX < 0 ||
        maskY < 0 ||
        maskX + width > maskCanvas.width ||
        maskY + height > maskCanvas.height
      ) {
        const canvas = this.cachedCanvases.getCanvas(
          "maskExtension",
          width,
          height
        );
        const ctx = canvas.context;
        ctx.drawImage(maskCanvas, -maskX, -maskY);
        ctx.globalCompositeOperation = "destination-atop";
        ctx.fillStyle = backdrop;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";

        maskCanvas = canvas.canvas;
        maskX = maskY = 0;
      } else {
        maskCtx.save();
        maskCtx.globalAlpha = 1;
        maskCtx.setTransform(1, 0, 0, 1, 0, 0);
        const clip = new Path2D();
        clip.rect(maskX, maskY, width, height);
        maskCtx.clip(clip);
        maskCtx.globalCompositeOperation = "destination-atop";
        maskCtx.fillStyle = backdrop;
        maskCtx.fillRect(maskX, maskY, width, height);
        maskCtx.restore();
      }
    }

    layerCtx.save();
    layerCtx.globalAlpha = 1;
    layerCtx.setTransform(1, 0, 0, 1, 0, 0);

    if (subtype === "Alpha" && transferMap) {
      layerCtx.filter = this.filterFactory.addAlphaFilter(transferMap);
    } else if (subtype === "Luminosity") {
      layerCtx.filter = this.filterFactory.addLuminosityFilter(transferMap);
    }

    const clip = new Path2D();
    clip.rect(layerOffsetX, layerOffsetY, width, height);
    layerCtx.clip(clip);
    layerCtx.globalCompositeOperation = "destination-in";
    layerCtx.drawImage(
      maskCanvas,
      maskX,
      maskY,
      width,
      height,
      layerOffsetX,
      layerOffsetY,
      width,
      height
    );
    layerCtx.restore();
  }

  save(opIdx) {
    if (this.inSMaskMode) {
      // SMask mode may be turned on/off causing us to lose graphics state.
      // Copy the temporary canvas state to the main(suspended) canvas to keep
      // it in sync.
      copyCtxState(this.ctx, this.suspendedCtx);
    }
    this.ctx.save();
    const old = this.current;
    this.stateStack.push(old);
    this.current = old.clone();
    this.dependencyTracker?.save(opIdx);
  }

  restore(opIdx) {
    this.dependencyTracker?.restore(opIdx);

    if (this.stateStack.length === 0) {
      if (this.inSMaskMode) {
        this.endSMaskMode();
      }
      return;
    }

    this.current = this.stateStack.pop();
    this.ctx.restore();
    if (this.inSMaskMode) {
      // Graphics state is stored on the main(suspended) canvas. Restore its
      // state then copy it over to the temporary canvas.
      copyCtxState(this.suspendedCtx, this.ctx);
    }
    this.checkSMaskState();

    // Ensure that the clipping path is reset (fixes issue6413.pdf).
    this.pendingClip = null;

    this._cachedScaleForStroking[0] = -1;
    this._cachedGetSinglePixelWidth = null;
  }

  transform(opIdx, a, b, c, d, e, f) {
    this.dependencyTracker?.recordIncrementalData("transform", opIdx);
    this.ctx.transform(a, b, c, d, e, f);

    this._cachedScaleForStroking[0] = -1;
    this._cachedGetSinglePixelWidth = null;
  }

  // Path
  constructPath(opIdx, op, data, minMax) {
    let [path] = data;
    if (!minMax) {
      // The path is empty, so no need to update the current minMax.
      path ||= data[0] = new Path2D();
      this[op](opIdx, path);
      return;
    }

    if (this.dependencyTracker !== null) {
      const outerExtraSize = op === OPS.stroke ? this.current.lineWidth / 2 : 0;
      this.dependencyTracker
        .resetBBox(opIdx)
        .recordBBox(
          opIdx,
          this.ctx,
          minMax[0] - outerExtraSize,
          minMax[2] + outerExtraSize,
          minMax[1] - outerExtraSize,
          minMax[3] + outerExtraSize
        )
        .recordDependencies(opIdx, ["transform"]);
    }

    if (!(path instanceof Path2D)) {
      path = data[0] = makePathFromDrawOPS(path);
    }
    Util.axialAlignedBoundingBox(
      minMax,
      getCurrentTransform(this.ctx),
      this.current.minMax
    );
    this[op](opIdx, path);

    this._pathStartIdx = opIdx;
  }

  closePath(opIdx) {
    this.ctx.closePath();
  }

  stroke(opIdx, path, consumePath = true) {
    const ctx = this.ctx;
    const strokeColor = this.current.strokeColor;
    // For stroke we want to temporarily change the global alpha to the
    // stroking alpha.
    ctx.globalAlpha = this.current.strokeAlpha;
    if (this.contentVisible) {
      if (typeof strokeColor === "object" && strokeColor?.getPattern) {
        const baseTransform = strokeColor.isModifyingCurrentTransform()
          ? ctx.getTransform()
          : null;
        ctx.save();
        ctx.strokeStyle = strokeColor.getPattern(
          ctx,
          this,
          getCurrentTransformInverse(ctx),
          PathType.STROKE,
          opIdx
        );
        if (baseTransform) {
          const newPath = new Path2D();
          newPath.addPath(
            path,
            ctx.getTransform().invertSelf().multiplySelf(baseTransform)
          );
          path = newPath;
        }
        this.rescaleAndStroke(path, /* saveRestore */ false);
        ctx.restore();
      } else {
        this.rescaleAndStroke(path, /* saveRestore */ true);
      }
    }

    this.dependencyTracker?.recordDependencies(opIdx, Dependencies.stroke);

    if (consumePath) {
      this.consumePath(
        opIdx,
        path,
        this.current.getClippedPathBoundingBox(
          PathType.STROKE,
          getCurrentTransform(this.ctx)
        )
      );
    }

    // Restore the global alpha to the fill alpha
    ctx.globalAlpha = this.current.fillAlpha;
  }

  closeStroke(opIdx, path) {
    this.stroke(opIdx, path);
  }

  fill(opIdx, path, consumePath = true) {
    const ctx = this.ctx;
    const fillColor = this.current.fillColor;
    const isPatternFill = this.current.patternFill;
    let needRestore = false;

    if (isPatternFill) {
      const baseTransform = fillColor.isModifyingCurrentTransform()
        ? ctx.getTransform()
        : null;
      this.dependencyTracker?.save(opIdx);
      ctx.save();
      ctx.fillStyle = fillColor.getPattern(
        ctx,
        this,
        getCurrentTransformInverse(ctx),
        PathType.FILL,
        opIdx
      );
      if (baseTransform) {
        const newPath = new Path2D();
        newPath.addPath(
          path,
          ctx.getTransform().invertSelf().multiplySelf(baseTransform)
        );
        path = newPath;
      }
      needRestore = true;
    }

    const intersect = this.current.getClippedPathBoundingBox();
    if (this.contentVisible && intersect !== null) {
      if (this.pendingEOFill) {
        ctx.fill(path, "evenodd");
        this.pendingEOFill = false;
      } else {
        ctx.fill(path);
      }
    }

    this.dependencyTracker?.recordDependencies(opIdx, Dependencies.fill);

    if (needRestore) {
      ctx.restore();
      this.dependencyTracker?.restore(opIdx);
    }
    if (consumePath) {
      this.consumePath(opIdx, path, intersect);
    }
  }

  eoFill(opIdx, path) {
    this.pendingEOFill = true;
    this.fill(opIdx, path);
  }

  fillStroke(opIdx, path) {
    this.fill(opIdx, path, false);
    this.stroke(opIdx, path, false);

    this.consumePath(opIdx, path);
  }

  eoFillStroke(opIdx, path) {
    this.pendingEOFill = true;
    this.fillStroke(opIdx, path);
  }

  closeFillStroke(opIdx, path) {
    this.fillStroke(opIdx, path);
  }

  closeEOFillStroke(opIdx, path) {
    this.pendingEOFill = true;
    this.fillStroke(opIdx, path);
  }

  endPath(opIdx, path) {
    this.consumePath(opIdx, path);
  }

  rawFillPath(opIdx, path) {
    this.ctx.fill(path);
    this.dependencyTracker
      ?.recordDependencies(opIdx, Dependencies.rawFillPath)
      .recordOperation(opIdx);
  }

  // Clipping
  clip(opIdx) {
    this.dependencyTracker?.recordFutureForcedDependency("clipMode", opIdx);
    this.pendingClip = NORMAL_CLIP;
  }

  eoClip(opIdx) {
    this.dependencyTracker?.recordFutureForcedDependency("clipMode", opIdx);
    this.pendingClip = EO_CLIP;
  }

  // Text
  beginText(opIdx) {
    this.current.textMatrix = null;
    this.current.textMatrixScale = 1;
    this.current.x = this.current.lineX = 0;
    this.current.y = this.current.lineY = 0;

    this.dependencyTracker
      ?.recordOpenMarker(opIdx)
      .resetIncrementalData("sameLineText")
      .resetIncrementalData("moveText", opIdx);
  }

  endText(opIdx) {
    const paths = this.pendingTextPaths;
    const ctx = this.ctx;

    if (this.dependencyTracker) {
      const { dependencyTracker } = this;
      if (paths !== undefined) {
        dependencyTracker
          .recordFutureForcedDependency(
            "textClip",
            dependencyTracker.getOpenMarker()
          )
          .recordFutureForcedDependency("textClip", opIdx);
      }
      dependencyTracker.recordCloseMarker(opIdx);
    }

    if (paths !== undefined) {
      const newPath = new Path2D();
      const invTransf = ctx.getTransform().invertSelf();
      for (const { transform, x, y, fontSize, path } of paths) {
        if (!path) {
          continue; // Skip empty paths.
        }
        newPath.addPath(
          path,
          new DOMMatrix(transform)
            .preMultiplySelf(invTransf)
            .translate(x, y)
            .scale(fontSize, -fontSize)
        );
      }

      ctx.clip(newPath);
    }
    delete this.pendingTextPaths;
  }

  setCharSpacing(opIdx, spacing) {
    this.dependencyTracker?.recordSimpleData("charSpacing", opIdx);
    this.current.charSpacing = spacing;
  }

  setWordSpacing(opIdx, spacing) {
    this.dependencyTracker?.recordSimpleData("wordSpacing", opIdx);
    this.current.wordSpacing = spacing;
  }

  setHScale(opIdx, scale) {
    this.dependencyTracker?.recordSimpleData("hScale", opIdx);
    this.current.textHScale = scale / 100;
  }

  setLeading(opIdx, leading) {
    this.dependencyTracker?.recordSimpleData("leading", opIdx);
    this.current.leading = -leading;
  }

  setFont(opIdx, fontRefName, size) {
    this.dependencyTracker
      ?.recordSimpleData("font", opIdx)
      .recordSimpleDataFromNamed("fontObj", fontRefName, opIdx);
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
    const typeface =
      fontObj.systemFontInfo?.css || `"${name}", ${fontObj.fallbackName}`;

    let bold = "normal";
    if (fontObj.black) {
      bold = "900";
    } else if (fontObj.bold) {
      bold = "bold";
    }
    const italic = fontObj.italic ? "italic" : "normal";

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

  setTextRenderingMode(opIdx, mode) {
    this.dependencyTracker?.recordSimpleData("textRenderingMode", opIdx);
    this.current.textRenderingMode = mode;
  }

  setTextRise(opIdx, rise) {
    this.dependencyTracker?.recordSimpleData("textRise", opIdx);
    this.current.textRise = rise;
  }

  moveText(opIdx, x, y) {
    this.dependencyTracker
      ?.resetIncrementalData("sameLineText")
      .recordIncrementalData("moveText", opIdx);
    this.current.x = this.current.lineX += x;
    this.current.y = this.current.lineY += y;
  }

  setLeadingMoveText(opIdx, x, y) {
    this.setLeading(opIdx, -y);
    this.moveText(opIdx, x, y);
  }

  setTextMatrix(opIdx, matrix) {
    this.dependencyTracker
      ?.resetIncrementalData("sameLineText")
      .recordSimpleData("textMatrix", opIdx);
    const { current } = this;
    current.textMatrix = matrix;
    current.textMatrixScale = Math.hypot(matrix[0], matrix[1]);

    current.x = current.lineX = 0;
    current.y = current.lineY = 0;
  }

  nextLine(opIdx) {
    this.moveText(opIdx, 0, this.current.leading);

    this.dependencyTracker?.recordIncrementalData(
      "moveText",
      // 'leading' affects 'nextLine' operations. Rather than dealing
      // with transitive dependencies, just mark everything that depends on
      // the 'moveText' operation as depending on the 'leading' value.
      this.dependencyTracker.getSimpleIndex("leading") ?? opIdx
    );
  }

  #getScaledPath(path, currentTransform, transform) {
    const newPath = new Path2D();
    newPath.addPath(
      path,
      new DOMMatrix(transform).invertSelf().multiplySelf(currentTransform)
    );
    return newPath;
  }

  paintChar(
    opIdx,
    character,
    x,
    y,
    patternFillTransform,
    patternStrokeTransform
  ) {
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
    const patternStroke = current.patternStroke && !font.missingFile;

    let path;
    if (
      (font.disableFontFace ||
        isAddToPathSet ||
        patternFill ||
        patternStroke) &&
      !font.missingFile
    ) {
      path = font.getPathGenerator(this.commonObjs, character);
    }

    if (path && (font.disableFontFace || patternFill || patternStroke)) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(fontSize, -fontSize);

      this.dependencyTracker?.recordCharacterBBox(opIdx, ctx, font);

      let currentTransform;
      if (
        fillStrokeMode === TextRenderingMode.FILL ||
        fillStrokeMode === TextRenderingMode.FILL_STROKE
      ) {
        if (patternFillTransform) {
          currentTransform = ctx.getTransform();
          ctx.setTransform(...patternFillTransform);
          const scaledPath = this.#getScaledPath(
            path,
            currentTransform,
            patternFillTransform
          );
          ctx.fill(scaledPath);
        } else {
          ctx.fill(path);
        }
      }
      if (
        fillStrokeMode === TextRenderingMode.STROKE ||
        fillStrokeMode === TextRenderingMode.FILL_STROKE
      ) {
        if (patternStrokeTransform) {
          currentTransform ||= ctx.getTransform();
          ctx.setTransform(...patternStrokeTransform);
          const { a, b, c, d } = currentTransform;
          const invPatternTransform = Util.inverseTransform(
            patternStrokeTransform
          );
          const transf = Util.transform(
            [a, b, c, d, 0, 0],
            invPatternTransform
          );
          Util.singularValueDecompose2dScale(transf, XY);

          // Cancel the pattern scaling of the line width.
          // If sx and sy are different, unfortunately we can't do anything and
          // we'll have a rendering bug.
          ctx.lineWidth *= Math.max(XY[0], XY[1]) / fontSize;
          ctx.stroke(
            this.#getScaledPath(path, currentTransform, patternStrokeTransform)
          );
        } else {
          ctx.lineWidth /= fontSize;
          ctx.stroke(path);
        }
      }
      ctx.restore();
    } else {
      if (
        fillStrokeMode === TextRenderingMode.FILL ||
        fillStrokeMode === TextRenderingMode.FILL_STROKE
      ) {
        ctx.fillText(character, x, y);
        this.dependencyTracker?.recordCharacterBBox(
          opIdx,
          ctx,
          font,
          fontSize,
          x,
          y,
          () => ctx.measureText(character)
        );
      }
      if (
        fillStrokeMode === TextRenderingMode.STROKE ||
        fillStrokeMode === TextRenderingMode.FILL_STROKE
      ) {
        if (this.dependencyTracker) {
          this.dependencyTracker
            ?.recordCharacterBBox(opIdx, ctx, font, fontSize, x, y, () =>
              ctx.measureText(character)
            )
            .recordDependencies(opIdx, Dependencies.stroke);
        }
        ctx.strokeText(character, x, y);
      }
    }

    if (isAddToPathSet) {
      const paths = (this.pendingTextPaths ||= []);
      paths.push({
        transform: getCurrentTransform(ctx),
        x,
        y,
        fontSize,
        path,
      });
      this.dependencyTracker?.recordCharacterBBox(
        opIdx,
        ctx,
        font,
        fontSize,
        x,
        y
      );
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

  showText(opIdx, glyphs) {
    if (this.dependencyTracker) {
      this.dependencyTracker
        .recordDependencies(opIdx, Dependencies.showText)
        .resetBBox(opIdx);
      if (this.current.textRenderingMode & TextRenderingMode.ADD_TO_PATH_FLAG) {
        this.dependencyTracker
          .recordFutureForcedDependency("textClip", opIdx)
          .inheritPendingDependenciesAsFutureForcedDependencies();
      }
    }

    const current = this.current;
    const font = current.font;
    if (font.isType3Font) {
      this.showType3Text(opIdx, glyphs);
      this.dependencyTracker?.recordShowTextOperation(opIdx);
      return undefined;
    }

    const fontSize = current.fontSize;
    if (fontSize === 0) {
      this.dependencyTracker?.recordOperation(opIdx);
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
    if (current.textMatrix) {
      ctx.transform(...current.textMatrix);
    }
    ctx.translate(current.x, current.y + current.textRise);

    if (fontDirection > 0) {
      ctx.scale(textHScale, -1);
    } else {
      ctx.scale(textHScale, 1);
    }

    let patternFillTransform, patternStrokeTransform;
    if (current.patternFill) {
      ctx.save();
      const pattern = current.fillColor.getPattern(
        ctx,
        this,
        getCurrentTransformInverse(ctx),
        PathType.FILL,
        opIdx
      );
      patternFillTransform = getCurrentTransform(ctx);
      ctx.restore();
      ctx.fillStyle = pattern;
    }

    if (current.patternStroke) {
      ctx.save();
      const pattern = current.strokeColor.getPattern(
        ctx,
        this,
        getCurrentTransformInverse(ctx),
        PathType.STROKE,
        opIdx
      );
      patternStrokeTransform = getCurrentTransform(ctx);
      ctx.restore();
      ctx.strokeStyle = pattern;
    }

    let lineWidth = current.lineWidth;
    const scale = current.textMatrixScale;
    if (scale === 0 || lineWidth === 0) {
      const fillStrokeMode =
        current.textRenderingMode & TextRenderingMode.FILL_STROKE_MASK;
      if (
        fillStrokeMode === TextRenderingMode.STROKE ||
        fillStrokeMode === TextRenderingMode.FILL_STROKE
      ) {
        lineWidth = this.getSinglePixelWidth();
      }
    } else {
      lineWidth /= scale;
    }

    if (fontSizeScale !== 1.0) {
      ctx.scale(fontSizeScale, fontSizeScale);
      lineWidth /= fontSizeScale;
    }

    ctx.lineWidth = lineWidth;

    if (font.isInvalidPDFjsFont) {
      const chars = [];
      let width = 0;
      for (const glyph of glyphs) {
        chars.push(glyph.unicode);
        width += glyph.width;
      }
      const joinedChars = chars.join("");
      ctx.fillText(joinedChars, 0, 0);
      if (this.dependencyTracker !== null) {
        const measure = ctx.measureText(joinedChars);
        this.dependencyTracker
          .recordBBox(
            opIdx,
            this.ctx,
            -measure.actualBoundingBoxLeft,
            measure.actualBoundingBoxRight,
            -measure.actualBoundingBoxAscent,
            measure.actualBoundingBoxDescent
          )
          .recordShowTextOperation(opIdx);
      }
      current.x += width * widthAdvanceScale * textHScale;
      ctx.restore();
      this.compose();
      return undefined;
    }

    let x = 0,
      i;
    for (i = 0; i < glyphsLength; ++i) {
      const glyph = glyphs[i];
      if (typeof glyph === "number") {
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

      let measure;

      if (font.remeasure && width > 0) {
        measure = ctx.measureText(character);

        // Some standard fonts may not have the exact width: rescale per
        // character if measured width is greater than expected glyph width
        // and subpixel-aa is enabled, otherwise just center the glyph.
        const measuredWidth =
          ((measure.width * 1000) / fontSize) * fontSizeScale;
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

          this.dependencyTracker?.recordCharacterBBox(
            opIdx,
            ctx,
            // If we already measured the character, force usage of that
            measure ? { bbox: null } : font,
            fontSize / fontSizeScale,
            scaledX,
            scaledY,
            () => measure ?? ctx.measureText(character)
          );
        } else {
          this.paintChar(
            opIdx,
            character,
            scaledX,
            scaledY,
            patternFillTransform,
            patternStrokeTransform
          );
          if (accent) {
            const scaledAccentX =
              scaledX + (fontSize * accent.offset.x) / fontSizeScale;
            const scaledAccentY =
              scaledY - (fontSize * accent.offset.y) / fontSizeScale;
            this.paintChar(
              opIdx,
              accent.fontChar,
              scaledAccentX,
              scaledAccentY,
              patternFillTransform,
              patternStrokeTransform
            );
          }
        }
      }

      const charWidth = vertical
        ? width * widthAdvanceScale - spacing * fontDirection
        : width * widthAdvanceScale + spacing * fontDirection;
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

    this.dependencyTracker?.recordShowTextOperation(opIdx);
    return undefined;
  }

  showType3Text(opIdx, glyphs) {
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
    this._cachedScaleForStroking[0] = -1;
    this._cachedGetSinglePixelWidth = null;

    ctx.save();
    if (current.textMatrix) {
      ctx.transform(...current.textMatrix);
    }
    ctx.translate(current.x, current.y + current.textRise);

    ctx.scale(textHScale, fontDirection);

    // Type3 fonts have their own operator list. Avoid mixing it up with the
    // dependency tracker of the main operator list.
    const dependencyTracker = this.dependencyTracker;
    this.dependencyTracker = dependencyTracker
      ? new CanvasNestedDependencyTracker(dependencyTracker, opIdx)
      : null;

    for (i = 0; i < glyphsLength; ++i) {
      glyph = glyphs[i];
      if (typeof glyph === "number") {
        spacingLength = (spacingDir * glyph * fontSize) / 1000;
        this.ctx.translate(spacingLength, 0);
        current.x += spacingLength * textHScale;
        continue;
      }

      const spacing = (glyph.isSpace ? wordSpacing : 0) + charSpacing;
      const operatorList = font.charProcOperatorList[glyph.operatorListId];
      if (!operatorList) {
        warn(`Type3 character "${glyph.operatorListId}" is not available.`);
      } else if (this.contentVisible) {
        this.save();
        ctx.scale(fontSize, fontSize);
        ctx.transform(...fontMatrix);
        this.executeOperatorList(operatorList);
        this.restore();
      }

      const p = [glyph.width, 0];
      Util.applyTransform(p, fontMatrix);
      width = p[0] * fontSize + spacing;

      ctx.translate(width, 0);
      current.x += width * textHScale;
    }
    ctx.restore();
    if (dependencyTracker) {
      this.dependencyTracker = dependencyTracker;
    }
  }

  // Type3 fonts
  setCharWidth(opIdx, xWidth, yWidth) {
    // We can safely ignore this since the width should be the same
    // as the width in the Widths array.
  }

  setCharWidthAndBounds(opIdx, xWidth, yWidth, llx, lly, urx, ury) {
    const clip = new Path2D();
    clip.rect(llx, lly, urx - llx, ury - lly);
    this.ctx.clip(clip);
    this.dependencyTracker
      ?.recordBBox(opIdx, this.ctx, llx, urx, lly, ury)
      .recordClipBox(opIdx, this.ctx, llx, urx, lly, ury);
    this.endPath(opIdx);
  }

  // Color
  getColorN_Pattern(opIdx, IR) {
    let pattern;
    if (IR[0] === "TilingPattern") {
      const baseTransform = this.baseTransform || getCurrentTransform(this.ctx);
      const canvasGraphicsFactory = {
        createCanvasGraphics: (ctx, renderingOpIdx) =>
          new CanvasGraphics(
            ctx,
            this.commonObjs,
            this.objs,
            this.canvasFactory,
            this.filterFactory,
            {
              optionalContentConfig: this.optionalContentConfig,
              markedContentStack: this.markedContentStack,
            },
            undefined,
            undefined,
            this.dependencyTracker
              ? new CanvasNestedDependencyTracker(
                  this.dependencyTracker,
                  renderingOpIdx,
                  /* ignoreBBoxes */ true
                )
              : null
          ),
      };
      pattern = new TilingPattern(
        IR,
        this.ctx,
        canvasGraphicsFactory,
        baseTransform
      );
    } else {
      pattern = this._getPattern(opIdx, IR[1], IR[2]);
    }
    return pattern;
  }

  setStrokeColorN(opIdx, ...args) {
    this.dependencyTracker?.recordSimpleData("strokeColor", opIdx);
    this.current.strokeColor = this.getColorN_Pattern(opIdx, args);
    this.current.patternStroke = true;
  }

  setFillColorN(opIdx, ...args) {
    this.dependencyTracker?.recordSimpleData("fillColor", opIdx);
    this.current.fillColor = this.getColorN_Pattern(opIdx, args);
    this.current.patternFill = true;
  }

  setStrokeRGBColor(opIdx, color) {
    this.dependencyTracker?.recordSimpleData("strokeColor", opIdx);
    this.ctx.strokeStyle = this.current.strokeColor = color;
    this.current.patternStroke = false;
  }

  setStrokeTransparent(opIdx) {
    this.dependencyTracker?.recordSimpleData("strokeColor", opIdx);
    this.ctx.strokeStyle = this.current.strokeColor = "transparent";
    this.current.patternStroke = false;
  }

  setFillRGBColor(opIdx, color) {
    this.dependencyTracker?.recordSimpleData("fillColor", opIdx);
    this.ctx.fillStyle = this.current.fillColor = color;
    this.current.patternFill = false;
  }

  setFillTransparent(opIdx) {
    this.dependencyTracker?.recordSimpleData("fillColor", opIdx);
    this.ctx.fillStyle = this.current.fillColor = "transparent";
    this.current.patternFill = false;
  }

  _getPattern(opIdx, objId, matrix = null) {
    let pattern;
    if (this.cachedPatterns.has(objId)) {
      pattern = this.cachedPatterns.get(objId);
    } else {
      pattern = getShadingPattern(this.getObject(opIdx, objId));
      this.cachedPatterns.set(objId, pattern);
    }
    if (matrix) {
      pattern.matrix = matrix;
    }
    return pattern;
  }

  shadingFill(opIdx, objId) {
    if (!this.contentVisible) {
      return;
    }
    const ctx = this.ctx;

    this.save(opIdx);
    const pattern = this._getPattern(opIdx, objId);
    ctx.fillStyle = pattern.getPattern(
      ctx,
      this,
      getCurrentTransformInverse(ctx),
      PathType.SHADING,
      opIdx
    );

    const inv = getCurrentTransformInverse(ctx);
    if (inv) {
      const { width, height } = ctx.canvas;
      const minMax = MIN_MAX_INIT.slice();
      Util.axialAlignedBoundingBox([0, 0, width, height], inv, minMax);
      const [x0, y0, x1, y1] = minMax;

      this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    } else {
      // HACK to draw the gradient onto an infinite rectangle.
      // PDF gradients are drawn across the entire image while
      // Canvas only allows gradients to be drawn in a rectangle
      // The following bug should allow us to remove this.
      // https://bugzilla.mozilla.org/show_bug.cgi?id=664884

      this.ctx.fillRect(-1e10, -1e10, 2e10, 2e10);
    }

    this.dependencyTracker
      ?.resetBBox(opIdx)
      // TODO: Track proper bbox
      .recordFullPageBBox(opIdx)
      .recordDependencies(opIdx, Dependencies.transform)
      .recordDependencies(opIdx, Dependencies.fill)
      .recordOperation(opIdx);

    this.compose(this.current.getClippedPathBoundingBox());
    this.restore(opIdx);
  }

  // Images
  beginInlineImage() {
    unreachable("Should not call beginInlineImage");
  }

  beginImageData() {
    unreachable("Should not call beginImageData");
  }

  paintFormXObjectBegin(opIdx, matrix, bbox) {
    if (!this.contentVisible) {
      return;
    }
    this.save(opIdx);
    this.baseTransformStack.push(this.baseTransform);

    if (matrix) {
      this.transform(opIdx, ...matrix);
    }
    this.baseTransform = getCurrentTransform(this.ctx);

    if (bbox) {
      Util.axialAlignedBoundingBox(
        bbox,
        this.baseTransform,
        this.current.minMax
      );
      const [x0, y0, x1, y1] = bbox;
      const clip = new Path2D();
      clip.rect(x0, y0, x1 - x0, y1 - y0);
      this.ctx.clip(clip);
      this.dependencyTracker?.recordClipBox(opIdx, this.ctx, x0, x1, y0, y1);
      this.endPath(opIdx);
    }
  }

  paintFormXObjectEnd(opIdx) {
    if (!this.contentVisible) {
      return;
    }
    this.restore(opIdx);
    this.baseTransform = this.baseTransformStack.pop();
  }

  beginGroup(opIdx, group) {
    if (!this.contentVisible) {
      return;
    }

    this.save(opIdx);
    // If there's an active soft mask we don't want it enabled for the group, so
    // clear it out. The mask and suspended canvas will be restored in endGroup.
    if (this.inSMaskMode) {
      this.endSMaskMode();
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

    const currentTransform = getCurrentTransform(currentCtx);
    if (group.matrix) {
      currentCtx.transform(...group.matrix);
    }
    if (!group.bbox) {
      throw new Error("Bounding box is required.");
    }

    // Based on the current transform figure out how big the bounding box
    // will actually be.
    let bounds = MIN_MAX_INIT.slice();
    Util.axialAlignedBoundingBox(
      group.bbox,
      getCurrentTransform(currentCtx),
      bounds
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
    const drawnWidth = Math.max(Math.ceil(bounds[2]) - offsetX, 1);
    const drawnHeight = Math.max(Math.ceil(bounds[3]) - offsetY, 1);

    this.current.startNewPathAndClipBox([0, 0, drawnWidth, drawnHeight]);

    let cacheId = "groupAt" + this.groupLevel;
    if (group.smask) {
      // Using two cache entries is case if masks are used one after another.
      cacheId += "_smask_" + (this.smaskCounter++ % 2);
    }
    const scratchCanvas = this.cachedCanvases.getCanvas(
      cacheId,
      drawnWidth,
      drawnHeight
    );
    const groupCtx = scratchCanvas.context;

    // Since we created a new canvas that is just the size of the bounding box
    // we have to translate the group ctx.
    groupCtx.translate(-offsetX, -offsetY);
    groupCtx.transform(...currentTransform);

    // Apply the bbox to the group context.
    let clip = new Path2D();
    const [x0, y0, x1, y1] = group.bbox;
    clip.rect(x0, y0, x1 - x0, y1 - y0);
    if (group.matrix) {
      const path = new Path2D();
      path.addPath(clip, new DOMMatrix(group.matrix));
      clip = path;
    }
    groupCtx.clip(clip);

    if (group.smask) {
      // Saving state and cached mask to be used in setGState.
      this.smaskStack.push({
        canvas: scratchCanvas.canvas,
        context: groupCtx,
        offsetX,
        offsetY,
        subtype: group.smask.subtype,
        backdrop: group.smask.backdrop,
        transferMap: group.smask.transferMap || null,
        startTransformInverse: null, // used during suspend operation
      });
    }
    if (
      !group.smask ||
      // When this is not an SMask group, we only need to update the current
      // transform if recording operations bboxes, so they the bboxes have the
      // correct transform applied.
      this.dependencyTracker
    ) {
      // Setup the current ctx so when the group is popped we draw it at the
      // right location.
      currentCtx.setTransform(1, 0, 0, 1, 0, 0);
      currentCtx.translate(offsetX, offsetY);
      currentCtx.save();
    }
    // The transparency group inherits all off the current graphics state
    // except the blend mode, soft mask, and alpha constants.
    copyCtxState(currentCtx, groupCtx);
    this.ctx = groupCtx;
    this.dependencyTracker
      ?.inheritSimpleDataAsFutureForcedDependencies([
        "fillAlpha",
        "strokeAlpha",
        "globalCompositeOperation",
      ])
      .pushBaseTransform(currentCtx);
    this.setGState(opIdx, [
      ["BM", "source-over"],
      ["ca", 1],
      ["CA", 1],
    ]);
    this.groupStack.push(currentCtx);
    this.groupLevel++;
  }

  endGroup(opIdx, group) {
    if (!this.contentVisible) {
      return;
    }
    this.groupLevel--;
    const groupCtx = this.ctx;
    const ctx = this.groupStack.pop();
    this.ctx = ctx;
    // Turn off image smoothing to avoid sub pixel interpolation which can
    // look kind of blurry for some pdfs.
    this.ctx.imageSmoothingEnabled = false;

    this.dependencyTracker?.popBaseTransform();

    if (group.smask) {
      this.tempSMask = this.smaskStack.pop();
      this.restore(opIdx);
      if (this.dependencyTracker) {
        this.ctx.restore();
      }
    } else {
      this.ctx.restore();
      const currentMtx = getCurrentTransform(this.ctx);
      this.restore(opIdx);
      this.ctx.save();
      this.ctx.setTransform(...currentMtx);
      const dirtyBox = MIN_MAX_INIT.slice();
      Util.axialAlignedBoundingBox(
        [0, 0, groupCtx.canvas.width, groupCtx.canvas.height],
        currentMtx,
        dirtyBox
      );
      this.ctx.drawImage(groupCtx.canvas, 0, 0);
      this.ctx.restore();
      this.compose(dirtyBox);
    }
  }

  beginAnnotation(opIdx, id, rect, transform, matrix, hasOwnCanvas) {
    // The annotations are drawn just after the page content.
    // The page content drawing can potentially have set a transform,
    // a clipping path, whatever...
    // So in order to have something clean, we restore the initial state.
    this.#restoreInitialState();
    resetCtxToDefault(this.ctx);

    this.ctx.save();
    this.save(opIdx);

    if (this.baseTransform) {
      this.ctx.setTransform(...this.baseTransform);
    }

    if (rect) {
      const width = rect[2] - rect[0];
      const height = rect[3] - rect[1];

      if (hasOwnCanvas && this.annotationCanvasMap) {
        transform = transform.slice();
        transform[4] -= rect[0];
        transform[5] -= rect[1];

        rect = rect.slice();
        rect[0] = rect[1] = 0;
        rect[2] = width;
        rect[3] = height;

        Util.singularValueDecompose2dScale(getCurrentTransform(this.ctx), XY);
        const { viewportScale } = this;
        const canvasWidth = Math.ceil(
          width * this.outputScaleX * viewportScale
        );
        const canvasHeight = Math.ceil(
          height * this.outputScaleY * viewportScale
        );

        this.annotationCanvas = this.canvasFactory.create(
          canvasWidth,
          canvasHeight
        );
        const { canvas, context } = this.annotationCanvas;
        this.annotationCanvasMap.set(id, canvas);
        this.annotationCanvas.savedCtx = this.ctx;
        this.ctx = context;
        this.ctx.save();
        this.ctx.setTransform(XY[0], 0, 0, -XY[1], 0, height * XY[1]);

        resetCtxToDefault(this.ctx);
      } else {
        resetCtxToDefault(this.ctx);

        // Consume a potential path before clipping.
        this.endPath(opIdx);

        const clip = new Path2D();
        clip.rect(rect[0], rect[1], width, height);
        this.ctx.clip(clip);
      }
    }

    this.current = new CanvasExtraState(
      this.ctx.canvas.width,
      this.ctx.canvas.height
    );

    this.transform(opIdx, ...transform);
    this.transform(opIdx, ...matrix);
  }

  endAnnotation(opIdx) {
    if (this.annotationCanvas) {
      this.ctx.restore();
      this.#drawFilter();

      this.ctx = this.annotationCanvas.savedCtx;
      delete this.annotationCanvas.savedCtx;
      delete this.annotationCanvas;
    }
  }

  paintImageMaskXObject(opIdx, img) {
    if (!this.contentVisible) {
      return;
    }

    const count = img.count;
    img = this.getObject(opIdx, img.data, img);
    img.count = count;

    const ctx = this.ctx;
    const mask = this._createMaskCanvas(opIdx, img);
    const maskCanvas = mask.canvas;

    ctx.save();
    // The mask is drawn with the transform applied. Reset the current
    // transform to draw to the identity.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(maskCanvas, mask.offsetX, mask.offsetY);
    this.dependencyTracker
      ?.resetBBox(opIdx)
      .recordBBox(
        opIdx,
        this.ctx,
        mask.offsetX,
        mask.offsetX + maskCanvas.width,
        mask.offsetY,
        mask.offsetY + maskCanvas.height
      )
      .recordOperation(opIdx);
    ctx.restore();
    this.compose();
  }

  paintImageMaskXObjectRepeat(
    opIdx,
    img,
    scaleX,
    skewX = 0,
    skewY = 0,
    scaleY,
    positions
  ) {
    if (!this.contentVisible) {
      return;
    }

    img = this.getObject(opIdx, img.data, img);

    const ctx = this.ctx;
    ctx.save();
    const currentTransform = getCurrentTransform(ctx);
    ctx.transform(scaleX, skewX, skewY, scaleY, 0, 0);
    const mask = this._createMaskCanvas(opIdx, img);

    ctx.setTransform(
      1,
      0,
      0,
      1,
      mask.offsetX - currentTransform[4],
      mask.offsetY - currentTransform[5]
    );
    this.dependencyTracker?.resetBBox(opIdx);
    for (let i = 0, ii = positions.length; i < ii; i += 2) {
      const trans = Util.transform(currentTransform, [
        scaleX,
        skewX,
        skewY,
        scaleY,
        positions[i],
        positions[i + 1],
      ]);

      // Here we want to apply the transform at the origin,
      // hence no additional computation is necessary.
      ctx.drawImage(mask.canvas, trans[4], trans[5]);
      this.dependencyTracker?.recordBBox(
        opIdx,
        this.ctx,
        trans[4],
        trans[4] + mask.canvas.width,
        trans[5],
        trans[5] + mask.canvas.height
      );
    }
    ctx.restore();
    this.compose();

    this.dependencyTracker?.recordOperation(opIdx);
  }

  paintImageMaskXObjectGroup(opIdx, images) {
    if (!this.contentVisible) {
      return;
    }
    const ctx = this.ctx;

    const fillColor = this.current.fillColor;
    const isPatternFill = this.current.patternFill;

    this.dependencyTracker
      ?.resetBBox(opIdx)
      .recordDependencies(opIdx, Dependencies.transformAndFill);

    for (const image of images) {
      const { data, width, height, transform } = image;

      const maskCanvas = this.cachedCanvases.getCanvas(
        "maskCanvas",
        width,
        height
      );
      const maskCtx = maskCanvas.context;
      maskCtx.save();

      const img = this.getObject(opIdx, data, image);
      putBinaryImageMask(maskCtx, img);

      maskCtx.globalCompositeOperation = "source-in";

      maskCtx.fillStyle = isPatternFill
        ? fillColor.getPattern(
            maskCtx,
            this,
            getCurrentTransformInverse(ctx),
            PathType.FILL,
            opIdx
          )
        : fillColor;
      maskCtx.fillRect(0, 0, width, height);

      maskCtx.restore();

      ctx.save();
      ctx.transform(...transform);
      ctx.scale(1, -1);
      drawImageAtIntegerCoords(
        ctx,
        maskCanvas.canvas,
        0,
        0,
        width,
        height,
        0,
        -1,
        1,
        1
      );

      this.dependencyTracker?.recordBBox(opIdx, ctx, 0, width, 0, height);
      ctx.restore();
    }
    this.compose();
    this.dependencyTracker?.recordOperation(opIdx);
  }

  paintImageXObject(opIdx, objId) {
    if (!this.contentVisible) {
      return;
    }
    const imgData = this.getObject(opIdx, objId);
    if (!imgData) {
      warn("Dependent image isn't ready yet");
      return;
    }

    this.paintInlineImageXObject(opIdx, imgData);
  }

  paintImageXObjectRepeat(opIdx, objId, scaleX, scaleY, positions) {
    if (!this.contentVisible) {
      return;
    }
    const imgData = this.getObject(opIdx, objId);
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
    this.paintInlineImageXObjectGroup(opIdx, imgData, map);
  }

  applyTransferMapsToCanvas(ctx) {
    if (this.current.transferMaps !== "none") {
      ctx.filter = this.current.transferMaps;
      ctx.drawImage(ctx.canvas, 0, 0);
      ctx.filter = "none";
    }
    return ctx.canvas;
  }

  applyTransferMapsToBitmap(imgData) {
    if (this.current.transferMaps === "none") {
      return imgData.bitmap;
    }
    const { bitmap, width, height } = imgData;
    const tmpCanvas = this.cachedCanvases.getCanvas(
      "inlineImage",
      width,
      height
    );
    const tmpCtx = tmpCanvas.context;
    tmpCtx.filter = this.current.transferMaps;
    tmpCtx.drawImage(bitmap, 0, 0);
    tmpCtx.filter = "none";

    return tmpCanvas.canvas;
  }

  paintInlineImageXObject(opIdx, imgData) {
    if (!this.contentVisible) {
      return;
    }
    const width = imgData.width;
    const height = imgData.height;
    const ctx = this.ctx;

    this.save(opIdx);

    // The filter, if any, will be applied in applyTransferMapsToBitmap.
    // It must be applied to the image before rescaling else some artifacts
    // could appear.
    // The final restore will reset it to its value.
    const { filter } = ctx;
    if (filter !== "none" && filter !== "") {
      ctx.filter = "none";
    }

    // scale the image to the unit square
    ctx.scale(1 / width, -1 / height);

    let imgToPaint;
    if (imgData.bitmap) {
      imgToPaint = this.applyTransferMapsToBitmap(imgData);
    } else if (
      (typeof HTMLElement === "function" && imgData instanceof HTMLElement) ||
      !imgData.data
    ) {
      // typeof check is needed due to node.js support, see issue #8489
      imgToPaint = imgData;
    } else {
      const tmpCanvas = this.cachedCanvases.getCanvas(
        "inlineImage",
        width,
        height
      );
      const tmpCtx = tmpCanvas.context;
      putBinaryImageData(tmpCtx, imgData);
      imgToPaint = this.applyTransferMapsToCanvas(tmpCtx);
    }

    const scaled = this._scaleImage(
      imgToPaint,
      getCurrentTransformInverse(ctx)
    );
    ctx.imageSmoothingEnabled = getImageSmoothingEnabled(
      getCurrentTransform(ctx),
      imgData.interpolate
    );

    this.dependencyTracker
      ?.resetBBox(opIdx)
      .recordBBox(opIdx, ctx, 0, width, -height, 0)
      .recordDependencies(opIdx, Dependencies.imageXObject)
      .recordOperation(opIdx);

    drawImageAtIntegerCoords(
      ctx,
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
    this.compose();
    this.restore(opIdx);
  }

  paintInlineImageXObjectGroup(opIdx, imgData, map) {
    if (!this.contentVisible) {
      return;
    }
    const ctx = this.ctx;
    let imgToPaint;
    if (imgData.bitmap) {
      imgToPaint = imgData.bitmap;
    } else {
      const w = imgData.width;
      const h = imgData.height;

      const tmpCanvas = this.cachedCanvases.getCanvas("inlineImage", w, h);
      const tmpCtx = tmpCanvas.context;
      putBinaryImageData(tmpCtx, imgData);
      imgToPaint = this.applyTransferMapsToCanvas(tmpCtx);
    }

    this.dependencyTracker?.resetBBox(opIdx);

    for (const entry of map) {
      ctx.save();
      ctx.transform(...entry.transform);
      ctx.scale(1, -1);
      drawImageAtIntegerCoords(
        ctx,
        imgToPaint,
        entry.x,
        entry.y,
        entry.w,
        entry.h,
        0,
        -1,
        1,
        1
      );
      this.dependencyTracker?.recordBBox(opIdx, ctx, 0, 1, -1, 0);
      ctx.restore();
    }
    this.dependencyTracker?.recordOperation(opIdx);
    this.compose();
  }

  paintSolidColorImageMask(opIdx) {
    if (!this.contentVisible) {
      return;
    }
    this.dependencyTracker
      ?.resetBBox(opIdx)
      .recordBBox(opIdx, this.ctx, 0, 1, 0, 1)
      .recordDependencies(opIdx, Dependencies.fill)
      .recordOperation(opIdx);
    this.ctx.fillRect(0, 0, 1, 1);
    this.compose();
  }

  // Marked content

  markPoint(opIdx, tag) {
    // TODO Marked content.
  }

  markPointProps(opIdx, tag, properties) {
    // TODO Marked content.
  }

  beginMarkedContent(opIdx, tag) {
    this.dependencyTracker?.beginMarkedContent(opIdx);
    this.markedContentStack.push({
      visible: true,
    });
  }

  beginMarkedContentProps(opIdx, tag, properties) {
    this.dependencyTracker?.beginMarkedContent(opIdx);
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

  endMarkedContent(opIdx) {
    this.dependencyTracker?.endMarkedContent(opIdx);
    this.markedContentStack.pop();
    this.contentVisible = this.isContentVisible();
  }

  // Compatibility

  beginCompat(opIdx) {
    // TODO ignore undefined operators (should we do that anyway?)
  }

  endCompat(opIdx) {
    // TODO stop ignoring undefined operators
  }

  // Helper functions

  consumePath(opIdx, path, clipBox) {
    const isEmpty = this.current.isEmptyClip();
    if (this.pendingClip) {
      this.current.updateClipFromPath();
    }
    if (!this.pendingClip) {
      this.compose(clipBox);
    }
    const ctx = this.ctx;
    if (this.pendingClip) {
      if (!isEmpty) {
        if (this.pendingClip === EO_CLIP) {
          ctx.clip(path, "evenodd");
        } else {
          ctx.clip(path);
        }
      }
      this.pendingClip = null;
      this.dependencyTracker
        ?.bboxToClipBoxDropOperation(opIdx)
        .recordFutureForcedDependency("clipPath", opIdx);
    } else {
      this.dependencyTracker?.recordOperation(opIdx);
    }

    this.current.startNewPathAndClipBox(this.current.clipBox);
  }

  getSinglePixelWidth() {
    if (!this._cachedGetSinglePixelWidth) {
      const m = getCurrentTransform(this.ctx);
      if (m[1] === 0 && m[2] === 0) {
        // Fast path
        this._cachedGetSinglePixelWidth =
          1 / Math.min(Math.abs(m[0]), Math.abs(m[3]));
      } else {
        const absDet = Math.abs(m[0] * m[3] - m[2] * m[1]);
        const normX = Math.hypot(m[0], m[2]);
        const normY = Math.hypot(m[1], m[3]);
        this._cachedGetSinglePixelWidth = Math.max(normX, normY) / absDet;
      }
    }
    return this._cachedGetSinglePixelWidth;
  }

  getScaleForStroking() {
    // A pixel has thicknessX = thicknessY = 1;
    // A transformed pixel is a parallelogram and the thicknesses
    // corresponds to the heights.
    // The goal of this function is to rescale before setting the
    // lineWidth in order to have both thicknesses greater or equal
    // to 1 after transform.
    if (this._cachedScaleForStroking[0] === -1) {
      const { lineWidth } = this.current;
      const { a, b, c, d } = this.ctx.getTransform();
      let scaleX, scaleY;

      if (b === 0 && c === 0) {
        // Fast path
        const normX = Math.abs(a);
        const normY = Math.abs(d);
        if (normX === normY) {
          if (lineWidth === 0) {
            scaleX = scaleY = 1 / normX;
          } else {
            const scaledLineWidth = normX * lineWidth;
            scaleX = scaleY = scaledLineWidth < 1 ? 1 / scaledLineWidth : 1;
          }
        } else if (lineWidth === 0) {
          scaleX = 1 / normX;
          scaleY = 1 / normY;
        } else {
          const scaledXLineWidth = normX * lineWidth;
          const scaledYLineWidth = normY * lineWidth;
          scaleX = scaledXLineWidth < 1 ? 1 / scaledXLineWidth : 1;
          scaleY = scaledYLineWidth < 1 ? 1 / scaledYLineWidth : 1;
        }
      } else {
        // A pixel (base (x, y)) is transformed by M into a parallelogram:
        //  - its area is |det(M)|;
        //  - heightY (orthogonal to Mx) has a length: |det(M)| / norm(Mx);
        //  - heightX (orthogonal to My) has a length: |det(M)| / norm(My).
        // heightX and heightY are the thicknesses of the transformed pixel
        // and they must be both greater or equal to 1.
        const absDet = Math.abs(a * d - b * c);
        const normX = Math.hypot(a, b);
        const normY = Math.hypot(c, d);
        if (lineWidth === 0) {
          scaleX = normY / absDet;
          scaleY = normX / absDet;
        } else {
          const baseArea = lineWidth * absDet;
          scaleX = normY > baseArea ? normY / baseArea : 1;
          scaleY = normX > baseArea ? normX / baseArea : 1;
        }
      }
      this._cachedScaleForStroking[0] = scaleX;
      this._cachedScaleForStroking[1] = scaleY;
    }
    return this._cachedScaleForStroking;
  }

  // Rescale before stroking in order to have a final lineWidth
  // with both thicknesses greater or equal to 1.
  rescaleAndStroke(path, saveRestore) {
    const {
      ctx,
      current: { lineWidth },
    } = this;
    const [scaleX, scaleY] = this.getScaleForStroking();

    if (scaleX === scaleY) {
      ctx.lineWidth = (lineWidth || 1) * scaleX;
      ctx.stroke(path);
      return;
    }

    const dashes = ctx.getLineDash();
    if (saveRestore) {
      ctx.save();
    }

    ctx.scale(scaleX, scaleY);
    SCALE_MATRIX.a = 1 / scaleX;
    SCALE_MATRIX.d = 1 / scaleY;
    const newPath = new Path2D();
    newPath.addPath(path, SCALE_MATRIX);

    // How the dashed line is rendered depends on the current transform...
    // so we added a rescale to handle too thin lines and consequently
    // the way the line is dashed will be modified.
    // If scaleX === scaleY, the dashed lines will be rendered correctly
    // else we'll have some bugs (but only with too thin lines).
    // Here we take the max... why not taking the min... or something else.
    // Anyway, as said it's buggy when scaleX !== scaleY.
    if (dashes.length > 0) {
      const scale = Math.max(scaleX, scaleY);
      ctx.setLineDash(dashes.map(x => x / scale));
      ctx.lineDashOffset /= scale;
    }

    ctx.lineWidth = lineWidth || 1;
    ctx.stroke(newPath);

    if (saveRestore) {
      ctx.restore();
    }
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
