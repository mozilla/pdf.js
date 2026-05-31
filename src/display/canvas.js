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
  F32_BBOX_INIT,
  FeatureTest,
  FONT_IDENTITY_MATRIX,
  ImageKind,
  info,
  makeMap,
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
  getRGBA,
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
import { MathClamp } from "../shared/math_clamp.js";

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
  const originalMethods = new Map();
  for (const name of [
    "save",
    "restore",
    "rotate",
    "scale",
    "translate",
    "transform",
    "setTransform",
    "resetTransform",
    "clip",
    "moveTo",
    "lineTo",
    "bezierCurveTo",
    "quadraticCurveTo",
    "arc",
    "arcTo",
    "ellipse",
    "rect",
    "roundRect",
    "closePath",
    "beginPath",
  ]) {
    const original = ctx[name];
    if (typeof original !== "function" || typeof destCtx[name] !== "function") {
      continue;
    }
    originalMethods.set(name, original);
    ctx[name] = function (...args) {
      destCtx[name](...args);
      return original.apply(this, args);
    };
  }

  ctx._removeMirroring = () => {
    for (const [name, original] of originalMethods) {
      ctx[name] = original;
    }
    delete ctx._removeMirroring;
  };
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

  tilingPatternDims = null;

  patternFill = false;

  patternStroke = false;

  // Note: fill alpha applies to all non-stroking operations
  fillAlpha = 1;

  strokeAlpha = 1;

  lineWidth = 1;

  activeSMask = null;

  transferMaps = "none";

  minMax = F32_BBOX_INIT.slice();

  constructor(width, height) {
    this.clipBox = new Float32Array([0, 0, width, height]);
  }

  clone() {
    const clone = Object.create(this);
    clone.clipBox = this.clipBox.slice();
    clone.minMax = this.minMax.slice();
    clone.tilingPatternDims = this.tilingPatternDims?.slice();
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
    this.minMax.set(F32_BBOX_INIT, 0);
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
  // Knockout group support fields.
  #knockoutGroupLevel = 0;

  #knockoutElementDepth = 0;

  #knockoutTempCanvasEntry = null;

  #knockoutSavedCtx = null;

  #knockoutSavedSMaskCtx = null;

  // Parent ctx globalCompositeOperation (GCO) at element start. Restored on
  // tempCtx before the post-element copyCtxState so the saved ctx keeps its
  // blend mode.
  #knockoutSavedGCO = null;

  #knockoutElementAlpha = 1;

  /**
   * Lazy alpha-scaling filter cache, populated on the first translucent
   * knockout element. One of:
   *   - `Map<alpha, url>` - when `ctx.filter` is supported; one SVG filter
   *     per quantised alpha_s value (cache bounded by 8-bit alpha precision).
   *   - `"none"` - no DOM available; the JS pixel-loop fallback handles
   *     scaling instead.
   * Stays `undefined` until the first translucent element forces a resolve.
   * @type {Map<number, string> | "none" | undefined}
   */
  #knockoutFilterCache;

  // Snapshot of #groupStackMeta.at(-1) at element-begin so the right backdrop
  // is used even if nested groups push/pop during the element's lifetime.
  #knockoutElementGroupMeta = null;

  // Per-group metadata, aligned with `groupStack`. `null` for the no-canvas
  // fast path. Otherwise: `backdropCtx` (parent ctx for non-isolated KO,
  // read directly since it's frozen), `hasInnerBackdrop` (non-isolated
  // non-KO subgroup inside a KO parent), `savedKnockoutLevel` (level to
  // restore on exit), pixel offsets, and pooled scratch entries.
  #groupStackMeta = [];

  constructor(
    canvasCtx,
    commonObjs,
    objs,
    canvasFactory,
    filterFactory,
    { optionalContentConfig, markedContentStack = null },
    annotationCanvasMap,
    pageColors,
    dependencyTracker,
    imagesTracker
  ) {
    this.ctx = canvasCtx;
    this.current = new CanvasExtraState(
      this.ctx.canvas.width,
      this.ctx.canvas.height
    );
    this.stateStack = [];
    this.pendingClip = null;
    this.pendingEOFill = false;
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
    this.tempSMask = null;
    this.smaskGroupCanvases = [];
    this.smaskPreparedEntry = null;
    this.smaskPreparedFor = null;
    this.smaskPreparedOffsetX = 0;
    this.smaskPreparedOffsetY = 0;
    // For mask-size prebakes with non-zero OOB alpha, the constant
    // alpha applied to OOB pixels (dirty box outside the mask canvas)
    // at compose time. Null when no compose-time OOB work is needed:
    //   - layer-size prebake bakes OOB inline; or
    //   - OOB alpha is 0 and destination-in's transparent source
    //     samples clear OOB layer pixels for free.
    // Compose-time behavior splits on this:
    //   null         -> clip = full dirty box; OOB cleared or baked.
    //   255          -> clip excludes OOB; OOB survives unchanged.
    //   intermediate -> clip excludes OOB, then a fade pass applies
    //                   this constant alpha.
    this.smaskPreparedOOBAlpha = null;
    this.suspendedCtx = null;
    this.contentVisible = true;
    this.markedContentStack = markedContentStack || [];
    this.optionalContentConfig = optionalContentConfig;
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
    this.imagesTracker = imagesTracker ?? null;
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
      const transparentCanvas = (this.transparentCanvasEntry =
        this.canvasFactory.create(width, height));
      this.compositeCtx = this.ctx;
      ({ canvas: this.transparentCanvas, context: this.ctx } =
        transparentCanvas);
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
      this.outputScaleY = transform[3];
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
      if (stepper !== undefined) {
        if (i === stepper.nextBreakPoint) {
          stepper.breakIt(i, continueCallback);
          return i;
        }
        if (stepper.shouldSkip(i)) {
          if (++i === argsArrayLen) {
            return i;
          }
          continue;
        }
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
      this.canvasFactory.destroy(this.transparentCanvasEntry);
      this.transparentCanvas = null;
      this.transparentCanvasEntry = null;
    }
  }

  endDrawing() {
    this.#restoreInitialState();

    // Destroy all smask group canvases now that rendering is complete.
    // These cannot be destroyed eagerly because activeSMask is part of
    // CanvasExtraState and is shared (via Object.create prototype chain) across
    // save/restore state copies.
    for (const canvas of this.smaskGroupCanvases) {
      this.canvasFactory.destroy(canvas);
    }
    this.smaskGroupCanvases.length = 0;
    this._clearPreparedSMask();
    this.tempSMask = null;
    this.smaskStack.length = 0;

    // Drop knockout state in case rendering was cancelled mid-group. Pooled
    // temp/backdrop entries are owned by the meta and freed there; the
    // active-element fields just alias into the meta, so only clear them.
    for (const meta of this.#groupStackMeta) {
      this.#destroyKnockoutPools(meta);
    }
    this.#groupStackMeta.length = 0;
    this.#knockoutTempCanvasEntry = null;
    this.#knockoutSavedCtx = null;
    this.#knockoutSavedSMaskCtx = null;
    this.#knockoutSavedGCO = null;
    this.#knockoutElementAlpha = 1;
    this.#knockoutElementGroupMeta = null;
    this.#knockoutElementDepth = 0;
    this.#knockoutGroupLevel = 0;

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
    const widthScale = Math.max(
      Math.hypot(inverseTransform[0], inverseTransform[1]),
      1
    );
    const heightScale = Math.max(
      Math.hypot(inverseTransform[2], inverseTransform[3]),
      1
    );

    // Pre-compute each step's output dimensions.
    const scaleSteps = [];
    let ws = widthScale,
      hs = heightScale,
      pw = width,
      ph = height;
    while ((ws > 2 && pw > 1) || (hs > 2 && ph > 1)) {
      let nw = pw,
        nh = ph;
      if (ws > 2 && pw > 1) {
        nw = Math.ceil(pw / 2);
        ws /= pw / nw;
      }
      if (hs > 2 && ph > 1) {
        nh = Math.ceil(ph / 2);
        hs /= ph / nh;
      }
      scaleSteps.push({ newWidth: nw, newHeight: nh });
      pw = nw;
      ph = nh;
    }

    if (scaleSteps.length === 0) {
      return { img, paintWidth: width, paintHeight: height, tmpCanvas: null };
    }

    if (scaleSteps.length === 1) {
      const { newWidth, newHeight } = scaleSteps[0];
      const tmpCanvas = this.canvasFactory.create(newWidth, newHeight);
      tmpCanvas.context.drawImage(
        img,
        0,
        0,
        width,
        height,
        0,
        0,
        newWidth,
        newHeight
      );
      return {
        img: tmpCanvas.canvas,
        paintWidth: newWidth,
        paintHeight: newHeight,
        tmpCanvas,
      };
    }

    // More than 2 steps: ping-pong between two reused canvas entries.
    // canvasFactory.reset() resizes (and implicitly clears) a canvas without
    // creating a new JS object or calling getContext() again.
    let readEntry = this.canvasFactory.create(1, 1);
    let writeEntry = this.canvasFactory.create(1, 1);
    let paintWidth = width,
      paintHeight = height;
    let source = img;

    for (const { newWidth, newHeight } of scaleSteps) {
      this.canvasFactory.reset(writeEntry, newWidth, newHeight);
      writeEntry.context.drawImage(
        source,
        0,
        0,
        paintWidth,
        paintHeight,
        0,
        0,
        newWidth,
        newHeight
      );
      [readEntry, writeEntry] = [writeEntry, readEntry];
      source = readEntry.canvas;
      paintWidth = newWidth;
      paintHeight = newHeight;
    }

    // writeEntry is now the stale buffer; destroy it.
    this.canvasFactory.destroy(writeEntry);
    return {
      img: readEntry.canvas,
      paintWidth,
      paintHeight,
      tmpCanvas: readEntry,
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

      cache = this._cachedBitmapsMap.getOrInsertComputed(mainKey, makeMap);
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
      maskCanvas = this.canvasFactory.create(width, height);
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
    const minMax = F32_BBOX_INIT.slice();
    Util.axialAlignedBoundingBox([0, 0, width, height], maskToCanvas, minMax);
    const [minX, minY, maxX, maxY] = minMax;
    const drawnWidth = Math.round(maxX - minX) || 1;
    const drawnHeight = Math.round(maxY - minY) || 1;
    const fillCanvas = this.canvasFactory.create(drawnWidth, drawnHeight);
    const fillCtx = fillCanvas.context;

    // The offset will be the top-left coordinate mask.
    // If objToCanvas is [a,b,c,d,e,f] then:
    //   - offsetX = min(a, c) + e
    //   - offsetY = min(b, d) + f
    const offsetX = minX;
    const offsetY = minY;
    fillCtx.translate(-offsetX, -offsetY);
    fillCtx.transform(...maskToCanvas);

    let scaledEntry = null;
    if (!scaled) {
      // Pre-scale if needed to improve image smoothing.
      const scaleResult = this._scaleImage(
        maskCanvas.canvas,
        getCurrentTransformInverse(fillCtx)
      );
      scaled = scaleResult.img;
      scaledEntry = scaleResult.tmpCanvas;
      if (scaled !== maskCanvas.canvas) {
        // _scaleImage created a new canvas; maskCanvas is no longer needed.
        this.canvasFactory.destroy(maskCanvas);
        maskCanvas = null;
      }
      if (cache && isPatternFill) {
        cache.set(cacheKey, scaled);
        scaledEntry = null; // bitmap cache owns the canvas now
        maskCanvas = null; // bitmap cache may own maskCanvas.canvas (= scaled)
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
    if (scaledEntry) {
      this.canvasFactory.destroy(scaledEntry);
    }
    if (maskCanvas) {
      // scaled === maskCanvas.canvas and not owned by the bitmap cache.
      this.canvasFactory.destroy(maskCanvas);
    }
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
      // so it mustn't be used again.
      cache.set(cacheKey, fillCanvas.canvas);
    }

    this.dependencyTracker?.recordDependencies(
      opIdx,
      Dependencies.transformAndFill
    );

    // Round the offsets to avoid drawing fractional pixels.
    return {
      canvas: fillCanvas.canvas,
      // canvasEntry is null when the bitmap cache owns the canvas.
      canvasEntry: cache && !isPatternFill ? null : fillCanvas,
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
          if (this.current.activeSMask) {
            // Save the current blend mode so that it can be applied when
            // compositing the SMask result back to the main canvas.
            this.current.activeSMask.blendMode =
              this.ctx.globalCompositeOperation;
          }
          this.tempSMask = null;
          this.checkSMaskState(opIdx);
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

  _clearPreparedSMask() {
    if (this.smaskPreparedEntry) {
      this.canvasFactory.destroy(this.smaskPreparedEntry);
      this.smaskPreparedEntry = null;
    }
    this.smaskPreparedFor = null;
    this.smaskPreparedOffsetX = 0;
    this.smaskPreparedOffsetY = 0;
    this.smaskPreparedOOBAlpha = null;
  }

  _ensurePreparedSMask(smask) {
    if (smask === this.smaskPreparedFor) {
      return;
    }
    this._clearPreparedSMask();
    this._prepareSMaskCanvas(smask);
  }

  checkSMaskState(opIdx) {
    const inSMaskMode = this.inSMaskMode;
    if (this.current.activeSMask && !inSMaskMode) {
      this.beginSMaskMode(opIdx);
    } else if (!this.current.activeSMask && inSMaskMode) {
      this.endSMaskMode();
    } else if (this.current.activeSMask && inSMaskMode) {
      // The active SMask may have changed while SMask mode stayed active
      // (e.g. a direct SMask A->B replacement, or a restore() that surfaces
      // a different saved mask). _ensurePreparedSMask is a no-op when the
      // same mask object is re-encountered.
      this._ensurePreparedSMask(this.current.activeSMask);
    }
  }

  _prepareSMaskCanvas(smask) {
    const { canvas: maskCanvas, subtype, backdrop, transferMap } = smask;
    const hasFilter =
      subtype === "Luminosity" || (subtype === "Alpha" && transferMap);

    // Nothing to amortize unless we have a filter or a Luminosity
    // backdrop -- Alpha SMasks ignore /BC for the alpha output, and
    // unknown subtypes have no defined backdrop semantics. Record the
    // mask so checkSMaskState's identity check skips the rebuild path
    // on subsequent restore()/setGState() calls.
    if (!hasFilter && !(subtype === "Luminosity" && backdrop)) {
      this.smaskPreparedFor = smask;
      return;
    }

    // Constant alpha OOB pixels receive after the spec backdrop+filter
    // chain (see smaskPreparedOOBAlpha field doc for the compose-time
    // table). /BC only feeds the alpha output for Luminosity (its
    // color enters the luminance computation). Alpha SMasks treat /BC
    // as a pure color-space backdrop and must not bake it into the
    // alpha output.
    let filteredOOBAlpha;
    if (subtype === "Luminosity" && backdrop) {
      // backdrop is "#RRGGBB" (see Evaluator#handleSMask).
      const [r, g, b] = getRGBA(backdrop);
      const inputAlpha = Math.round(0.3 * r + 0.59 * g + 0.11 * b);
      filteredOOBAlpha = transferMap?.[inputAlpha] ?? inputAlpha;
    } else {
      // Alpha, or Luminosity with no backdrop: OOB input is transparent,
      // and both filters map alpha=0 to alpha=0; only transferMap[0] can
      // produce a non-zero result.
      filteredOOBAlpha = transferMap?.[0] ?? 0;
    }

    // Use a layer-size prebake when the layer is at most this many
    // times bigger than the mask: layer-size avoids compose-time OOB
    // work and hits the same-size drawImage GPU fast path, but the
    // alloc cost grows with the layer. The crossover is empirical;
    // tuned against the bug-2033095 corpus.
    const SMASK_LAYER_TO_MASK_AREA_RATIO = 4;
    const { width: layerW, height: layerH } = this.ctx.canvas;
    const maskArea = maskCanvas.width * maskCanvas.height;
    const useLayerSize =
      layerW * layerH < SMASK_LAYER_TO_MASK_AREA_RATIO * maskArea;

    // Bundle the filter URL with the spec needed for the pixel-buffer
    // fallback (see _bakeSMaskCanvas). subtype + transferMap let the
    // fallback reproduce the SVG filter without an extra round-trip
    // through the filter factory.
    const filterSpec = hasFilter
      ? {
          url:
            subtype === "Alpha"
              ? this.filterFactory.addAlphaFilter(transferMap)
              : this.filterFactory.addLuminosityFilter(transferMap),
          subtype,
          transferMap,
        }
      : null;

    // Alpha SMasks must not bake /BC into the prepared canvas (see
    // filteredOOBAlpha comment above).
    const bakedBackdrop = subtype === "Luminosity" ? backdrop : null;

    let preparedEntry, offsetX, offsetY;
    if (useLayerSize) {
      preparedEntry = this._bakeSMaskCanvas(
        maskCanvas,
        smask.offsetX,
        smask.offsetY,
        layerW,
        layerH,
        bakedBackdrop,
        filterSpec
      );
      offsetX = 0;
      offsetY = 0;
    } else {
      preparedEntry = this._bakeSMaskCanvas(
        maskCanvas,
        0,
        0,
        maskCanvas.width,
        maskCanvas.height,
        bakedBackdrop,
        filterSpec
      );
      offsetX = smask.offsetX;
      offsetY = smask.offsetY;
    }

    this.smaskPreparedEntry = preparedEntry;
    this.smaskPreparedFor = smask;
    this.smaskPreparedOffsetX = offsetX;
    this.smaskPreparedOffsetY = offsetY;
    // Only mask-size prebakes with non-zero OOB alpha need compose-time
    // OOB work (see field doc).
    this.smaskPreparedOOBAlpha =
      !useLayerSize && filteredOOBAlpha !== 0 ? filteredOOBAlpha : null;
  }

  /**
   * Bake the mask plus optional backdrop into a (w x h) canvas with the
   * mask drawn at (drawX, drawY), then optionally pipe through the SVG
   * filter described by `filterSpec`. Returns the prepared canvas-
   * factory entry.
   *
   * The backdrop fill uses destination-atop so transparent / partial-
   * alpha pixels inside the mask see the backdrop *before* filtering
   * (per PDF spec). Filtering the raw mask would yield filter(0)
   * instead of filter(backdrop) -- wrong for "keep" Luminosity and for
   * Alpha masks whose transferMap[255] differs from transferMap[0].
   *
   * In the no-backdrop layer-size case the OOB region of srcEntry
   * stays transparent and the filter outputs filter(transparent) =
   * transferMap[0], matching the spec's transparent extension of the
   * mask group. No-backdrop mask-size prebakes have no OOB region;
   * destination-in handles OOB at compose time.
   *
   * Some browsers (e.g. older Safari) silently ignore SVG `url(#id)`
   * filters on a 2D canvas: the assignment is accepted but
   * `ctx.filter` reads back as "none" and `drawImage` produces an
   * unfiltered copy. We detect that and fall back to a pixel-buffer
   * loop that reproduces the SVG filter exactly (matrix luminance and
   * `feFuncA` transferMap, both with sRGB color-interpolation, i.e.
   * straight on gamma-encoded byte values).
   */
  _bakeSMaskCanvas(maskCanvas, drawX, drawY, w, h, backdrop, filterSpec) {
    if (!backdrop && !filterSpec) {
      // Caller (_prepareSMaskCanvas) gates on this; without either,
      // the prebake would just be a wasted copy of the mask.
      unreachable("_bakeSMaskCanvas with neither backdrop nor filter");
    }
    const srcEntry = this.canvasFactory.create(w, h);
    const sCtx = srcEntry.context;
    sCtx.drawImage(maskCanvas, drawX, drawY);
    if (backdrop) {
      sCtx.globalCompositeOperation = "destination-atop";
      sCtx.fillStyle = backdrop;
      sCtx.fillRect(0, 0, w, h);
    }
    if (!filterSpec) {
      return srcEntry;
    }
    const preparedEntry = this.canvasFactory.create(w, h);
    const pCtx = preparedEntry.context;
    // Post-assign "none"/"" means the URL was rejected (Firefox
    // normalizes accepted url(#id) to an absolute URL).
    pCtx.filter = filterSpec.url;
    const filterApplied =
      FeatureTest.isCanvasFilterSupported &&
      pCtx.filter !== "none" &&
      pCtx.filter !== "";
    pCtx.drawImage(srcEntry.canvas, 0, 0);
    if (FeatureTest.isCanvasFilterSupported) {
      pCtx.filter = "none";
    }
    if (!filterApplied) {
      const img = pCtx.getImageData(0, 0, w, h);
      const { data } = img;
      const { transferMap } = filterSpec;
      if (filterSpec.subtype === "Luminosity") {
        for (let i = 0, ii = data.length; i < ii; i += 4) {
          // Match #addLuminosityConversion: a' = 0.3*R + 0.59*G + 0.11*B,
          // RGB -> 0; then optional transferMap on alpha.
          const a =
            (0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2] + 0.5) | 0;
          data[i] = data[i + 1] = data[i + 2] = 0;
          data[i + 3] = transferMap?.[a] ?? a;
        }
      } else {
        // Alpha: transferMap is guaranteed by _prepareSMaskCanvas's
        // hasFilter gate.
        for (let i = 3, ii = data.length; i < ii; i += 4) {
          data[i] = transferMap[data[i]];
        }
      }
      pCtx.putImageData(img, 0, 0);
    }
    this.canvasFactory.destroy(srcEntry);
    return preparedEntry;
  }

  /**
   * Replaces the current drawing canvas with a temporary scratch canvas and
   * suspends the main context. Drawing operations on the scratch canvas are
   * composited back via `compose()`. The scratch canvas mirrors many operations
   * onto the suspended canvas to keep their graphics-state stacks in sync, so
   * that clipping paths and transformations remain correct when soft mask mode
   * ends.
   */
  beginSMaskMode(opIdx) {
    if (this.inSMaskMode) {
      throw new Error("beginSMaskMode called while already in smask mode");
    }
    const { width: drawnWidth, height: drawnHeight } = this.ctx.canvas;
    const scratchCanvas = this.canvasFactory.create(drawnWidth, drawnHeight);
    this.smaskScratchCanvas = scratchCanvas;
    this.suspendedCtx = this.ctx;
    const ctx = (this.ctx = scratchCanvas.context);
    ctx.setTransform(this.suspendedCtx.getTransform());
    copyCtxState(this.suspendedCtx, ctx);
    mirrorContextOperations(ctx, this.suspendedCtx);

    this._ensurePreparedSMask(this.current.activeSMask);

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
    this.canvasFactory.destroy(this.smaskScratchCanvas);
    this.smaskScratchCanvas = null;
    this._clearPreparedSMask();
  }

  #createKnockoutMaskCanvas(sourceCanvas, reuseEntry = null, alpha = 1) {
    const { width, height } = sourceCanvas;
    // reuseEntry is assumed to match sourceCanvas in size (all current call
    // sites guarantee this); the mask is rebuilt in-place.
    const maskEntry = reuseEntry ?? this.canvasFactory.create(width, height);
    const maskCtx = maskEntry.context;
    // Snap alpha_s to 8-bit precision: the painted alpha we're scaling is
    // already 8-bit, so any finer-grained alpha_s is indistinguishable. Caps
    // both the local Map and the filter-factory cache at <=256 entries
    // regardless of how many distinct gstate alpha values the PDF uses.
    alpha = Math.round(alpha * 255) / 255;
    const needsAlphaScaling = alpha < 1;
    if (needsAlphaScaling && this.#knockoutFilterCache === undefined) {
      // On Safari `ctx.filter` is settable but inert: the filter URL would
      // be stored without being applied, leaving the mask unscaled.
      // Force the JS fallback there.
      this.#knockoutFilterCache = FeatureTest.isCanvasFilterSupported
        ? new Map()
        : "none";
    }
    let knockoutFilter = "none";
    if (needsAlphaScaling && this.#knockoutFilterCache instanceof Map) {
      knockoutFilter = this.#knockoutFilterCache.get(alpha);
      if (!knockoutFilter) {
        knockoutFilter = this.filterFactory.addKnockoutFilter(alpha);
        this.#knockoutFilterCache.set(alpha, knockoutFilter);
      }
    }

    if (!needsAlphaScaling || knockoutFilter !== "none") {
      // Reused entries may carry stale pixels. Avoid the
      // globalCompositeOperation = "copy" + filter combo: that pair is
      // browser-divergent.
      if (reuseEntry) {
        maskCtx.save();
        maskCtx.setTransform(1, 0, 0, 1, 0, 0);
        maskCtx.clearRect(0, 0, width, height);
        maskCtx.restore();
      }
      maskCtx.filter = knockoutFilter;
      maskCtx.drawImage(sourceCanvas, 0, 0);
      maskCtx.filter = "none";
      return maskEntry;
    }

    // No-DOM fallback (Node/embedded). Scale painted alpha back to shape
    // coverage; color channels are irrelevant for destination-out/in.
    const sourceData = sourceCanvas
      .getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, width, height);
    const maskData = maskCtx.createImageData(width, height);
    const sourcePixels = sourceData.data,
      maskPixels = maskData.data;
    const alphaScale = alpha > 0 ? 1 / alpha : 1e6;
    for (let i = 3, ii = sourcePixels.length; i < ii; i += 4) {
      maskPixels[i] = Math.min(Math.round(sourcePixels[i] * alphaScale), 255);
    }
    maskCtx.putImageData(maskData, 0, 0);
    return maskEntry;
  }

  #getOrCreatePooledEntry(meta, key, width, height) {
    let entry = meta?.[key] ?? null;
    if (
      entry &&
      (entry.canvas.width !== width || entry.canvas.height !== height)
    ) {
      this.canvasFactory.destroy(entry);
      entry = null;
    }
    if (!entry) {
      entry = this.canvasFactory.create(width, height);
      if (meta) {
        meta[key] = entry;
      }
      return entry;
    }
    // Reused entry: clear any stale pixels before the caller refills it.
    const ctx = entry.context;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.restore();
    return entry;
  }

  #compositeKnockoutSurface(destCtx, surfaceCanvas, options = {}) {
    const {
      // Backdrop canvas for non-isolated groups, or null for isolated.
      // Passed directly (no copy) since the parent canvas is frozen while
      // the group renders.
      backdropCanvas = null,
      // Transform for destCtx before the final draw. Identity is correct
      // when destCtx and surfaceCanvas share pixel coords (per-element
      // path); pass currentMtx for the endGroup subgroup-into-parent path.
      destTransform = [1, 0, 0, 1, 0, 0],
      // Pixel origin within backdropCanvas of the region that maps onto
      // surfaceCanvas. [0,0] when the backdrop is already pre-cropped;
      // pass the (possibly compounded) group offsets in endGroup.
      backdropOffset = [0, 0],
      // Pool entry to refill in place for the knockout mask. Caller owns
      // its lifetime when provided.
      reuseMaskEntry = null,
      // Group meta to pool the backdrop scratch on. Without it the scratch
      // is allocated and destroyed locally.
      poolMeta = null,
      // Per-element surfaces already have alpha/filter baked in (defaults
      // 1/"none"). Subgroup canvases don't, so endGroup passes the parent
      // values to apply only at the final draw.
      sourceAlpha = 1,
      sourceFilter = "none",
      knockoutAlpha = 1,
    } = options;
    const { width, height } = surfaceCanvas;
    const knockoutMaskEntry = this.#createKnockoutMaskCanvas(
      surfaceCanvas,
      reuseMaskEntry,
      knockoutAlpha
    );
    const sourceCompositeOperation = destCtx.globalCompositeOperation;

    destCtx.save();
    destCtx.setTransform(...destTransform);
    destCtx.globalAlpha = 1;
    if (FeatureTest.isCanvasFilterSupported) {
      destCtx.filter = "none";
    }

    // Erase prior group content wherever the new surface has any coverage.
    destCtx.globalCompositeOperation = "destination-out";
    destCtx.drawImage(knockoutMaskEntry.canvas, 0, 0);

    if (backdropCanvas) {
      // Non-isolated: refill the just-erased footprint with the backdrop,
      // pre-clipped to the same shape mask so non-element pixels stay
      // transparent (otherwise sparse groups bleed the backdrop rect).
      const [bx, by] = backdropOffset;
      const backdropEntry = this.#getOrCreatePooledEntry(
        poolMeta,
        "knockoutBackdropEntry",
        width,
        height
      );
      const backdropCtx = backdropEntry.context;
      backdropCtx.drawImage(
        backdropCanvas,
        bx,
        by,
        width,
        height,
        0,
        0,
        width,
        height
      );
      backdropCtx.globalCompositeOperation = "destination-in";
      backdropCtx.drawImage(knockoutMaskEntry.canvas, 0, 0);
      // Reset the GCO so the pooled entry is in a known state for next use.
      backdropCtx.globalCompositeOperation = "source-over";

      destCtx.globalCompositeOperation = "destination-over";
      destCtx.drawImage(backdropEntry.canvas, 0, 0);
      if (!poolMeta) {
        this.canvasFactory.destroy(backdropEntry);
      }
    }
    destCtx.globalCompositeOperation = sourceCompositeOperation;
    destCtx.globalAlpha = sourceAlpha;
    if (FeatureTest.isCanvasFilterSupported) {
      destCtx.filter = sourceFilter ?? "none";
    }
    destCtx.drawImage(surfaceCanvas, 0, 0);

    destCtx.restore();
    if (!reuseMaskEntry) {
      this.canvasFactory.destroy(knockoutMaskEntry);
    }
  }

  /**
   * Begin a knockout element. In a KO group each element composites against
   * the initial group backdrop (transparent if isolated, parent canvas if
   * not) rather than against the running group result. We render onto a temp
   * canvas; path/clip/transform ops are mirrored back to the group canvas so
   * its state stays in sync for the next element.
   *
   * @returns {boolean} true if a knockout element was started.
   */
  #beginKnockoutElement(alpha = 1) {
    if (
      this.#knockoutGroupLevel === 0 ||
      this.#knockoutElementDepth > 0 ||
      !this.contentVisible
    ) {
      return false;
    }
    this.#knockoutElementDepth++;
    this.#knockoutElementAlpha = alpha;
    const groupMeta = this.#groupStackMeta.at(-1);
    const { canvas } = this.ctx;
    const tempEntry = this.#getOrCreatePooledEntry(
      groupMeta,
      "knockoutTempEntry",
      canvas.width,
      canvas.height
    );
    this.#knockoutTempCanvasEntry = tempEntry;
    const tempCtx = tempEntry.context;
    // Bracket-save before installing mirroring so #endKnockoutElement can
    // restore() the pooled canvas to a clean clip+transform without
    // propagating that save through the mirror.
    tempCtx.save();
    tempCtx.setTransform(this.ctx.getTransform());
    copyCtxState(this.ctx, tempCtx);
    // Force source-over for the element raster: the parent's blend mode is
    // meant for the final composite back onto the group canvas (done by
    // #compositeKnockoutSurface), not for drawing onto a transparent temp
    // (e.g. multiply on alpha=0 zeros the element's colour). Stash the
    // parent GCO and re-apply it on tempCtx before the post-element
    // copyCtxState so the saved ctx keeps the parent blend mode.
    this.#knockoutSavedGCO = tempCtx.globalCompositeOperation;
    tempCtx.globalCompositeOperation = "source-over";
    mirrorContextOperations(tempCtx, this.ctx);
    this.#knockoutElementGroupMeta = groupMeta;
    this.#knockoutSavedCtx = this.ctx;
    this.#knockoutSavedSMaskCtx = this.suspendedCtx;
    this.ctx = tempCtx;
    if (this.inSMaskMode) {
      this.suspendedCtx = tempCtx;
    }
    return true;
  }

  /**
   * End a knockout element started by `#beginKnockoutElement`. Composites
   * the rendered surface onto the group canvas with KO semantics: build a
   * shape mask from the element (painted alpha scaled back to geometric
   * coverage when alpha_s < 1), destination-out the group canvas over that
   * mask, restore the initial backdrop into the cleared footprint
   * (non-isolated only), then paint the element on top.
   *
   * @param {boolean} started - the value returned by `#beginKnockoutElement`.
   */
  #endKnockoutElement(started) {
    if (!started) {
      return;
    }
    const tempEntry = this.#knockoutTempCanvasEntry;
    const savedCtx = this.#knockoutSavedCtx;
    const savedSMaskCtx = this.#knockoutSavedSMaskCtx;
    const tempCtx = tempEntry.context;
    this.#knockoutTempCanvasEntry = null;
    this.#knockoutSavedCtx = null;
    this.#knockoutSavedSMaskCtx = null;
    if (
      this.inSMaskMode &&
      this.suspendedCtx === tempCtx &&
      this.ctx !== tempCtx
    ) {
      this.endSMaskMode();
    }
    if (this.inSMaskMode) {
      this.suspendedCtx = savedSMaskCtx;
    }
    this.ctx._removeMirroring();
    // Re-apply the parent GCO before copyCtxState writes it back to
    // savedCtx so #compositeKnockoutSurface sees the original blend mode.
    this.ctx.globalCompositeOperation = this.#knockoutSavedGCO;
    this.#knockoutSavedGCO = null;
    copyCtxState(this.ctx, savedCtx);
    this.ctx = savedCtx;
    const groupMeta = this.#knockoutElementGroupMeta;
    this.#knockoutElementGroupMeta = null;
    const knockoutAlpha = this.#knockoutElementAlpha;
    this.#knockoutElementAlpha = 1;
    try {
      this.#compositeKnockoutSurface(
        savedSMaskCtx ?? savedCtx,
        tempEntry.canvas,
        {
          backdropCanvas: groupMeta?.backdropCtx?.canvas ?? null,
          backdropOffset: groupMeta?.backdropCtx
            ? [groupMeta.offsetX, groupMeta.offsetY]
            : [0, 0],
          reuseMaskEntry: groupMeta?.knockoutMaskEntry ?? null,
          poolMeta: groupMeta,
          knockoutAlpha,
        }
      );
    } finally {
      // Pop the begin-element bracket save so the pooled canvas re-enters
      // with a clean clip+transform stack.
      tempCtx.restore();
      // Decrement only after the canvas is fully reset, so a re-entry from
      // a compositing callback sees depth>0 and bails out.
      this.#knockoutElementDepth--;
      // Defensive: groupMeta is non-null in practice for any active KO
      // element, but if it isn't we must release the unpooled entry.
      if (!groupMeta) {
        this.canvasFactory.destroy(tempEntry);
      }
    }
  }

  compose(dirtyBox) {
    if (!this.current.activeSMask) {
      return;
    }

    // Don't mutate the caller's box -- callers (e.g. consumePath) may
    // hold on to it.
    dirtyBox = dirtyBox
      ? [
          Math.floor(dirtyBox[0]),
          Math.floor(dirtyBox[1]),
          Math.ceil(dirtyBox[2]),
          Math.ceil(dirtyBox[3]),
        ]
      : [0, 0, this.ctx.canvas.width, this.ctx.canvas.height];
    const smask = this.current.activeSMask;
    const suspendedCtx = this.suspendedCtx;
    const applySMaskInPlace =
      this.#knockoutElementDepth > 0 && suspendedCtx === this.ctx;

    this.composeSMask(
      applySMaskInPlace ? null : suspendedCtx,
      smask,
      this.ctx,
      dirtyBox
    );
    if (applySMaskInPlace) {
      return;
    }

    // Clear the full scratch canvas, not just the dirty box. Pixels left
    // outside dirtyBox can leak into a later compose() whose destination-in
    // pass doesn't overwrite them, producing stale output -- this is what
    // breaks `firefox-issue17779-partial` (issue #21276).
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

    const preparedEntry = this.smaskPreparedEntry;
    if (preparedEntry) {
      // Fast path: prepared-mask destination-in drawImage. See
      // smaskPreparedOOBAlpha field doc for the OOB handling table.
      let clipX = layerOffsetX;
      let clipY = layerOffsetY;
      let clipW = layerWidth;
      let clipH = layerHeight;
      const oobAlpha = this.smaskPreparedOOBAlpha;
      const hasOOBAlpha = oobAlpha !== null;
      if (hasOOBAlpha) {
        clipX = Math.max(layerOffsetX, smask.offsetX);
        clipY = Math.max(layerOffsetY, smask.offsetY);
        const x1 = Math.min(
          layerOffsetX + layerWidth,
          smask.offsetX + smask.canvas.width
        );
        const y1 = Math.min(
          layerOffsetY + layerHeight,
          smask.offsetY + smask.canvas.height
        );
        clipW = x1 - clipX;
        clipH = y1 - clipY;
      }
      if (clipW > 0 && clipH > 0) {
        const srcX = clipX - this.smaskPreparedOffsetX;
        const srcY = clipY - this.smaskPreparedOffsetY;
        layerCtx.save();
        layerCtx.globalAlpha = 1;
        layerCtx.setTransform(1, 0, 0, 1, 0, 0);
        const clip = new Path2D();
        clip.rect(clipX, clipY, clipW, clipH);
        layerCtx.clip(clip);
        layerCtx.globalCompositeOperation = "destination-in";
        layerCtx.drawImage(
          preparedEntry.canvas,
          srcX,
          srcY,
          clipW,
          clipH,
          clipX,
          clipY,
          clipW,
          clipH
        );
        layerCtx.restore();
      }
      if (hasOOBAlpha && oobAlpha < 255) {
        this._applySMaskOOBAlpha(
          layerCtx,
          layerOffsetX,
          layerOffsetY,
          layerWidth,
          layerHeight,
          clipX,
          clipY,
          clipX + clipW,
          clipY + clipH,
          oobAlpha
        );
      }
    } else {
      this.genericComposeSMask(
        smask,
        layerCtx,
        layerWidth,
        layerHeight,
        layerOffsetX,
        layerOffsetY
      );
    }

    if (!ctx) {
      return;
    }

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = smask.blendMode || "source-over";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Blit only the dirty box -- the rest of the scratch canvas was
    // cleared in compose().
    ctx.drawImage(
      layerCtx.canvas,
      layerOffsetX,
      layerOffsetY,
      layerWidth,
      layerHeight,
      layerOffsetX,
      layerOffsetY,
      layerWidth,
      layerHeight
    );
    ctx.restore();
  }

  /**
   * Fade the dirty box's OOB region by a constant alpha. Called from
   * composeSMask when smaskPreparedOOBAlpha is in (0, 255).
   *
   * destination-in clears every destination pixel outside the source's
   * footprint, so four fillRects (one per strip) would each clear the
   * others. Instead one fillRect covers the dirty box, restricted by
   * an even-odd clip enclosing exactly (dirty_box XOR mask_region);
   * within the clip the source covers everything so no "outside
   * source" pixels exist.
   */
  _applySMaskOOBAlpha(
    layerCtx,
    layerOffsetX,
    layerOffsetY,
    layerWidth,
    layerHeight,
    maskX0,
    maskY0,
    maskX1,
    maskY1,
    alpha
  ) {
    const hasInnerCutout = maskX0 < maskX1 && maskY0 < maskY1;
    if (
      hasInnerCutout &&
      maskX0 === layerOffsetX &&
      maskY0 === layerOffsetY &&
      maskX1 === layerOffsetX + layerWidth &&
      maskY1 === layerOffsetY + layerHeight
    ) {
      // Dirty box is entirely inside the mask -- no OOB region to fade.
      return;
    }
    const path = new Path2D();
    path.rect(layerOffsetX, layerOffsetY, layerWidth, layerHeight);
    if (hasInnerCutout) {
      path.rect(maskX0, maskY0, maskX1 - maskX0, maskY1 - maskY0);
    }

    layerCtx.save();
    layerCtx.globalAlpha = alpha / 255;
    layerCtx.setTransform(1, 0, 0, 1, 0, 0);
    layerCtx.clip(path, "evenodd");
    layerCtx.globalCompositeOperation = "destination-in";
    // MUST be fully opaque -- destination-in scales dst_a by src_a, and
    // globalAlpha must be the only thing scaling source alpha.
    layerCtx.fillStyle = "#000000";
    layerCtx.fillRect(layerOffsetX, layerOffsetY, layerWidth, layerHeight);
    layerCtx.restore();
  }

  genericComposeSMask(
    smask,
    layerCtx,
    width,
    height,
    layerOffsetX,
    layerOffsetY
  ) {
    // composeSMask helper, reached only for plain-alpha masks (no
    // filter, no backdrop); every backdrop/filter case prebakes in
    // _prepareSMaskCanvas. A single destination-in blit suffices:
    // transparent OOB mask samples clear OOB layer pixels.
    const {
      context: maskCtx,
      offsetX: maskOffsetX,
      offsetY: maskOffsetY,
    } = smask;

    layerCtx.save();
    layerCtx.globalAlpha = 1;
    layerCtx.setTransform(1, 0, 0, 1, 0, 0);
    const clip = new Path2D();
    clip.rect(layerOffsetX, layerOffsetY, width, height);
    layerCtx.clip(clip);
    layerCtx.globalCompositeOperation = "destination-in";
    layerCtx.drawImage(
      maskCtx.canvas,
      layerOffsetX - maskOffsetX,
      layerOffsetY - maskOffsetY,
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
      // The scratch canvas may have been freshly created by beginSMaskMode
      // (called from checkSMaskState during a previous endGroup), in which
      // case its save/restore stack is empty and ctx.restore() above was a
      // no-op. Explicitly sync the CTM from the main canvas so that any CTM
      // change that the mirrored restore applied to the main canvas is also
      // reflected on the scratch canvas.
      this.ctx.setTransform(this.suspendedCtx.getTransform());
    }
    this.checkSMaskState(opIdx);

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
      if (op !== OPS.stroke && op !== OPS.closeStroke) {
        this.current.tilingPatternDims = null;
      }
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

    const tilingDims = this.current.tilingPatternDims;
    if (
      tilingDims &&
      op !== OPS.stroke &&
      op !== OPS.closeStroke &&
      this.current.fillColor instanceof TilingPattern
    ) {
      // Intersect with clip box to get the actual fill area, then convert
      // to pattern space.
      const clippedBBox = Util.intersect(
        this.current.clipBox,
        this.current.minMax
      );
      if (!clippedBBox) {
        this.current.tilingPatternDims = null;
      } else {
        this.current.fillColor.updatePatternDims(clippedBBox, tilingDims);
      }
    }

    this[op](opIdx, path);

    this._pathStartIdx = opIdx;
  }

  closePath(opIdx) {
    this.ctx.closePath();
  }

  stroke(opIdx, path, consumePath = true) {
    const started =
      consumePath && this.#beginKnockoutElement(this.current.strokeAlpha);
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
    this.#endKnockoutElement(started);
  }

  closeStroke(opIdx, path) {
    this.stroke(opIdx, path);
  }

  fill(opIdx, path, consumePath = true) {
    const started =
      consumePath && this.#beginKnockoutElement(this.current.fillAlpha);
    const ctx = this.ctx;
    const fillColor = this.current.fillColor;
    const isPatternFill = this.current.patternFill;
    let needRestore = false;
    const intersect = this.current.getClippedPathBoundingBox();

    this.dependencyTracker?.recordDependencies(opIdx, Dependencies.fill);

    if (isPatternFill) {
      const dims = this.current.tilingPatternDims;
      const tileIdx = dims && fillColor.canSkipPatternCanvas(dims);
      if (tileIdx) {
        // Draw the tile directly, skipping the pattern canvas.
        fillColor.drawPattern(this, path, this.pendingEOFill, tileIdx, opIdx);
        this.pendingEOFill = false;
        if (consumePath) {
          this.consumePath(opIdx, path, intersect);
        }
        this.current.tilingPatternDims = null;
        this.#endKnockoutElement(started);
        return;
      }
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

    if (this.contentVisible && intersect !== null) {
      if (this.pendingEOFill) {
        ctx.fill(path, "evenodd");
        this.pendingEOFill = false;
      } else {
        ctx.fill(path);
      }
    }

    if (needRestore) {
      ctx.restore();
      this.dependencyTracker?.restore(opIdx);
    }
    if (consumePath) {
      this.consumePath(opIdx, path, intersect);
    }
    this.#endKnockoutElement(started);
  }

  eoFill(opIdx, path) {
    this.pendingEOFill = true;
    this.fill(opIdx, path);
  }

  fillStroke(opIdx, path) {
    // Fill and stroke share one KO element so they composite against the
    // initial backdrop once, not twice. Use the smaller of the two alpha_s as
    // the mask divisor: it's conservative (over-clamps the other pass's
    // mask towards 1) but keeps the mask coverage at least as large as the
    // union of fill+stroke shapes, which is what KO erasure wants.
    const started = this.#beginKnockoutElement(
      Math.min(this.current.fillAlpha, this.current.strokeAlpha)
    );
    this.fill(opIdx, path, false);
    this.stroke(opIdx, path, false);
    this.consumePath(opIdx, path);
    this.#endKnockoutElement(started);
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
    const started = this.#beginKnockoutElement(this.current.fillAlpha);
    this.ctx.fill(path);
    this.dependencyTracker
      ?.recordDependencies(opIdx, Dependencies.rawFillPath)
      .recordOperation(opIdx);
    this.#endKnockoutElement(started);
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
    const browserFontSize = MathClamp(size, MIN_FONT_SIZE, MAX_FONT_SIZE);
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
    const tmpCanvas = this.canvasFactory.create(10, 10);
    const ctx = tmpCanvas.context;
    ctx.scale(1.5, 1);
    ctx.fillText("I", 0, 10);
    const data = ctx.getImageData(0, 0, 10, 10).data;
    this.canvasFactory.destroy(tmpCanvas);
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
      const started = this.#beginKnockoutElement(current.fillAlpha);
      this.showType3Text(opIdx, glyphs);
      this.dependencyTracker?.recordShowTextOperation(opIdx);
      this.#endKnockoutElement(started);
      return undefined;
    }

    const fontSize = current.fontSize;
    if (fontSize === 0) {
      this.dependencyTracker?.recordOperation(opIdx);
      return undefined;
    }

    const started = this.#beginKnockoutElement(current.fillAlpha);
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

    // Only compute pattern transforms if the text rendering mode actually
    // uses fill/stroke. This avoids expensive pattern calculations each call
    // when a patternFill/patternStroke is set, but unused.
    const fillStrokeMode =
      current.textRenderingMode & TextRenderingMode.FILL_STROKE_MASK;
    const needsFill =
      fillStrokeMode === TextRenderingMode.FILL ||
      fillStrokeMode === TextRenderingMode.FILL_STROKE;
    const needsStroke =
      fillStrokeMode === TextRenderingMode.STROKE ||
      fillStrokeMode === TextRenderingMode.FILL_STROKE;

    let lineWidth = current.lineWidth;
    const scale = current.textMatrixScale;
    if (scale === 0 || lineWidth === 0) {
      if (needsStroke) {
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

    if (needsFill && current.patternFill) {
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

    if (needsStroke && current.patternStroke) {
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
      this.#endKnockoutElement(started);
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
    this.#endKnockoutElement(started);
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
    const pattern = (this.current.fillColor = this.getColorN_Pattern(
      opIdx,
      args
    ));
    this.current.patternFill = true;
    this.current.tilingPatternDims =
      pattern instanceof TilingPattern ? [0, 0, 0, 0] : null;
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
    this.current.tilingPatternDims = null;
  }

  setFillTransparent(opIdx) {
    this.dependencyTracker?.recordSimpleData("fillColor", opIdx);
    this.ctx.fillStyle = this.current.fillColor = "transparent";
    this.current.patternFill = false;
    this.current.tilingPatternDims = null;
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
    const started = this.#beginKnockoutElement(this.current.fillAlpha);
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
      const minMax = F32_BBOX_INIT.slice();
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
    this.#endKnockoutElement(started);
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
    const { inSMaskMode } = this;
    if (inSMaskMode) {
      this.endSMaskMode();
      this.current.activeSMask = null;
    }

    const currentCtx = this.ctx;
    if (!group.isolated && !group.knockout && this.#knockoutGroupLevel === 0) {
      info("TODO: Fully support non-isolated non-knockout groups.");
    }

    if (
      !group.needsIsolation &&
      !group.knockout &&
      this.#knockoutGroupLevel === 0 &&
      currentCtx.globalAlpha === 1 &&
      currentCtx.globalCompositeOperation === "source-over" &&
      !inSMaskMode
    ) {
      if (group.bbox) {
        let clip = new Path2D();
        const [x0, y0, x1, y1] = group.bbox;
        clip.rect(x0, y0, x1 - x0, y1 - y0);
        if (group.matrix) {
          const path = new Path2D();
          path.addPath(clip, new DOMMatrix(group.matrix));
          clip = path;
        }
        currentCtx.clip(clip);
      }
      this.groupStack.push(null); // null = no intermediate canvas
      this.#groupStackMeta.push(null);
      this.groupLevel++;
      return;
    }

    const currentTransform = getCurrentTransform(currentCtx);
    if (group.matrix) {
      currentCtx.transform(...group.matrix);
    }

    // Clip the bounding box to the current canvas.
    const canvasBounds = [
      0,
      0,
      currentCtx.canvas.width,
      currentCtx.canvas.height,
    ];

    let bounds;
    if (group.bbox) {
      bounds = F32_BBOX_INIT.slice();
      Util.axialAlignedBoundingBox(
        group.bbox,
        getCurrentTransform(currentCtx),
        bounds
      );

      bounds = Util.intersect(bounds, canvasBounds) || [0, 0, 0, 0];
    } else {
      bounds = canvasBounds;
    }

    // Based on the current transform figure out how big the bounding box
    // will actually be.
    // Use ceil in case we're between sizes so we don't create canvas that is
    // too small and make the canvas at least 1x1 pixels.
    const offsetX = Math.floor(bounds[0]);
    const offsetY = Math.floor(bounds[1]);
    const drawnWidth = Math.max(Math.ceil(bounds[2]) - offsetX, 1);
    const drawnHeight = Math.max(Math.ceil(bounds[3]) - offsetY, 1);

    this.current.startNewPathAndClipBox([0, 0, drawnWidth, drawnHeight]);

    const scratchCanvas = this.canvasFactory.create(drawnWidth, drawnHeight);
    if (group.smask) {
      this.smaskGroupCanvases.push(scratchCanvas);
    }
    const groupCtx = scratchCanvas.context;
    // Non-isolated KO: keep a reference to the parent ctx (not a copy). It's
    // frozen while the group renders, so we can read from it on demand. The
    // backdrop is only restored under each element's footprint in
    // #compositeKnockoutSurface so it doesn't become part of the group
    // source itself.
    const backdropCtx = group.knockout && !group.isolated ? currentCtx : null;
    // Non-isolated non-KO subgroup inside a KO parent, with inner compositing
    // of its own: at endGroup we'll blend its elements against the outer KO
    // running canvas (also frozen), so just record the flag here and read
    // ctx.canvas at composite time.
    const hasInnerBackdrop =
      !group.isolated &&
      !group.knockout &&
      !group.smask &&
      group.needsIsolation &&
      this.#knockoutGroupLevel > 0;

    // Pool the per-element shape mask for the lifetime of this KO group.
    // Non-KO groups never call #compositeKnockoutSurface for their own
    // elements so the entry is unused there.
    const knockoutMaskEntry = group.knockout
      ? this.canvasFactory.create(drawnWidth, drawnHeight)
      : null;

    // For KO groups bump the level so inner elements get KO treatment; for
    // non-KO groups reset to 0 so an ancestor KO group doesn't apply to
    // them. Restored on endGroup.
    const savedKnockoutLevel = this.#knockoutGroupLevel;
    if (group.knockout) {
      this.#knockoutGroupLevel++;
    } else {
      this.#knockoutGroupLevel = 0;
    }

    // Since we created a new canvas that is just the size of the bounding box
    // we have to translate the group ctx.
    groupCtx.translate(-offsetX, -offsetY);
    groupCtx.transform(...currentTransform);

    if (
      !group.isolated &&
      !group.smask &&
      inSMaskMode &&
      group.needsIsolation
    ) {
      // For non-isolated groups that need isolation and are entered from SMask
      // mode, copy the current canvas background so that inner blend modes
      // (e.g. "screen") interact correctly with the background rather than
      // compositing onto a transparent canvas.
      // Groups without needsIsolation have no inner blend modes; their content
      // is composited correctly via the SMask in endGroup without a copy.
      groupCtx.save();
      groupCtx.setTransform(1, 0, 0, 1, 0, 0);
      groupCtx.drawImage(currentCtx.canvas, -offsetX, -offsetY);
      groupCtx.restore();
    }

    // Apply the bbox to the group context.
    if (group.bbox) {
      let clip = new Path2D();
      const [x0, y0, x1, y1] = group.bbox;
      clip.rect(x0, y0, x1 - x0, y1 - y0);
      if (group.matrix) {
        const path = new Path2D();
        path.addPath(clip, new DOMMatrix(group.matrix));
        clip = path;
      }
      groupCtx.clip(clip);
    }

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
      ["TR", null],
    ]);
    this.groupStack.push(currentCtx);
    this.#groupStackMeta.push({
      backdropCtx,
      savedKnockoutLevel,
      offsetX,
      offsetY,
      hasInnerBackdrop,
      knockoutMaskEntry,
      // Per-group scratch pools, lazily filled and freed in endGroup.
      knockoutTempEntry: null,
      knockoutBackdropEntry: null,
    });
    this.groupLevel++;
  }

  endGroup(opIdx, group) {
    if (!this.contentVisible) {
      return;
    }
    this.groupLevel--;
    const groupCtx = this.ctx;
    const ctx = this.groupStack.pop();
    const groupMeta = this.#groupStackMeta.pop();
    // Restore the knockout level that was in effect before this group began.
    // Simple groups (groupMeta === null) never modify the level, so skip them.
    if (groupMeta) {
      this.#knockoutGroupLevel = groupMeta.savedKnockoutLevel;
    }
    if (ctx === null) {
      // Simple group: content was drawn directly on the parent canvas.
      this.restore(opIdx);
      return;
    }

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
        // beginSMaskMode() may have been called inside restore(opIdx) above
        // (via checkSMaskState), creating a fresh scratch canvas. If so,
        // the mirrored ctx.restore() just synced main's CTM but left the
        // scratch at the stale CTM set by beginSMaskMode(). Re-sync it.
        if (this.inSMaskMode) {
          this.ctx.setTransform(this.suspendedCtx.getTransform());
        }
      }
      this.#destroyKnockoutPools(groupMeta);
    } else {
      this.ctx.restore();
      const currentMtx = getCurrentTransform(this.ctx);
      this.restore(opIdx);
      this.ctx.save();
      this.ctx.setTransform(...currentMtx);
      const dirtyBox = F32_BBOX_INIT.slice();
      Util.axialAlignedBoundingBox(
        [0, 0, groupCtx.canvas.width, groupCtx.canvas.height],
        currentMtx,
        dirtyBox
      );
      const parentGroupMeta = this.#groupStackMeta.at(-1);
      if (this.#knockoutGroupLevel > 0) {
        // The subgroup is one element of the enclosing KO group, so
        // composite it with KO semantics. Two coord systems below:
        //  - `currentMtx` (`destTransform`) places the subgroup canvas in
        //    the parent on the final draw, like the non-KO `drawImage`.
        //  - `groupMeta.offsetX/Y` are the pixel origins beginGroup stored
        //    when sizing the scratch; we use them (not `currentMtx[4]/[5]`,
        //    which are PDF-transform components) to crop the backdrop.
        if (groupMeta.hasInnerBackdrop) {
          // Non-isolated subgroup inside a KO parent: blend the elements
          // against the subgroup's own initial backdrop for colour, but use
          // the elements-only scratch as the alpha mask so transparent
          // areas don't erase the parent. `ctx` is the outer KO canvas
          // (just popped); its pixels still match the subgroup's
          // beginGroup state since the subgroup draws to its own scratch.
          const { width, height } = groupCtx.canvas;
          const colorEntry = this.canvasFactory.create(width, height);
          const colorCtx = colorEntry.context;
          colorCtx.drawImage(
            ctx.canvas,
            groupMeta.offsetX,
            groupMeta.offsetY,
            width,
            height,
            0,
            0,
            width,
            height
          );
          colorCtx.globalCompositeOperation = "source-over";
          colorCtx.drawImage(groupCtx.canvas, 0, 0);
          // Clip colorEntry to the subgroup's element footprint so
          // backdrop pixels outside the elements don't bleed onto the
          // parent. Built with alpha=1 (no scaling) so the mask uses the
          // subgroup's composited painted alpha directly as shape - its
          // global gstate alpha gets applied at the final draw below. The
          // mask is sized to the subgroup canvas, so we can't reuse the
          // parent KO group's pooled mask here; allocate a fresh entry
          // and reuse it for both the destination-in and the
          // destination-out below.
          const shapeMaskEntry = this.#createKnockoutMaskCanvas(
            groupCtx.canvas
          );
          colorCtx.globalCompositeOperation = "destination-in";
          colorCtx.drawImage(shapeMaskEntry.canvas, 0, 0);
          // Inline the isolated-path compositing here so we can share
          // shapeMaskEntry with the destination-in above.
          const sourceCompositeOperation = this.ctx.globalCompositeOperation;
          const sourceAlpha = this.ctx.globalAlpha;
          const sourceFilter = this.ctx.filter;
          this.ctx.save();
          this.ctx.setTransform(...currentMtx);
          this.ctx.globalAlpha = 1;
          if (FeatureTest.isCanvasFilterSupported) {
            this.ctx.filter = "none";
          }
          this.ctx.globalCompositeOperation = "destination-out";
          this.ctx.drawImage(shapeMaskEntry.canvas, 0, 0);
          this.ctx.globalCompositeOperation = sourceCompositeOperation;
          this.ctx.globalAlpha = sourceAlpha;
          if (FeatureTest.isCanvasFilterSupported) {
            this.ctx.filter = sourceFilter ?? "none";
          }
          this.ctx.drawImage(colorEntry.canvas, 0, 0);
          this.ctx.restore();
          this.canvasFactory.destroy(shapeMaskEntry);
          this.canvasFactory.destroy(colorEntry);
        } else {
          // For a non-isolated KO parent the backdrop lives one level up.
          // Compound the parent's and subgroup's offsets to crop it.
          const backdropCtx = parentGroupMeta?.backdropCtx ?? null;
          this.#compositeKnockoutSurface(this.ctx, groupCtx.canvas, {
            backdropCanvas: backdropCtx?.canvas ?? null,
            destTransform: currentMtx,
            backdropOffset: backdropCtx
              ? [
                  parentGroupMeta.offsetX + groupMeta.offsetX,
                  parentGroupMeta.offsetY + groupMeta.offsetY,
                ]
              : [0, 0],
            sourceAlpha: this.ctx.globalAlpha,
            sourceFilter: this.ctx.filter,
          });
        }
      } else {
        this.ctx.drawImage(groupCtx.canvas, 0, 0);
      }
      this.ctx.restore();
      this.canvasFactory.destroy({
        canvas: groupCtx.canvas,
        context: groupCtx,
      });
      this.#destroyKnockoutPools(groupMeta);
      this.compose(dirtyBox);
    }
  }

  #destroyKnockoutPools(groupMeta) {
    if (!groupMeta) {
      return;
    }
    if (groupMeta.knockoutMaskEntry) {
      this.canvasFactory.destroy(groupMeta.knockoutMaskEntry);
      groupMeta.knockoutMaskEntry = null;
    }
    if (groupMeta.knockoutTempEntry) {
      this.canvasFactory.destroy(groupMeta.knockoutTempEntry);
      groupMeta.knockoutTempEntry = null;
    }
    if (groupMeta.knockoutBackdropEntry) {
      this.canvasFactory.destroy(groupMeta.knockoutBackdropEntry);
      groupMeta.knockoutBackdropEntry = null;
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

    this.baseTransformStack.push(this.baseTransform);
    this.transform(opIdx, ...transform);
    this.transform(opIdx, ...matrix);
    this.baseTransform = getCurrentTransform(this.ctx);
  }

  endAnnotation(opIdx) {
    if (this.annotationCanvas) {
      this.ctx.restore();
      this.#drawFilter();

      this.ctx = this.annotationCanvas.savedCtx;
      delete this.annotationCanvas.savedCtx;
      delete this.annotationCanvas;
    }
    this.baseTransform = this.baseTransformStack.pop();
  }

  paintImageMaskXObject(opIdx, img) {
    if (!this.contentVisible) {
      return;
    }

    const count = img.count;
    img = this.getObject(opIdx, img.data, img);
    img.count = count;

    const started = this.#beginKnockoutElement(this.current.fillAlpha);
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
    if (mask.canvasEntry) {
      this.canvasFactory.destroy(mask.canvasEntry);
    }
    this.compose();
    this.#endKnockoutElement(started);
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

    const started = this.#beginKnockoutElement(this.current.fillAlpha);
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
    if (mask.canvasEntry) {
      this.canvasFactory.destroy(mask.canvasEntry);
    }
    this.compose();

    this.dependencyTracker?.recordOperation(opIdx);
    this.#endKnockoutElement(started);
  }

  paintImageMaskXObjectGroup(opIdx, images) {
    if (!this.contentVisible) {
      return;
    }
    const started = this.#beginKnockoutElement(this.current.fillAlpha);
    const ctx = this.ctx;

    const fillColor = this.current.fillColor;
    const isPatternFill = this.current.patternFill;

    this.dependencyTracker
      ?.resetBBox(opIdx)
      .recordDependencies(opIdx, Dependencies.transformAndFill);

    for (const image of images) {
      const { data, width, height, transform } = image;

      const maskCanvas = this.canvasFactory.create(width, height);
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
      this.canvasFactory.destroy(maskCanvas);

      this.dependencyTracker?.recordBBox(opIdx, ctx, 0, width, 0, height);
      ctx.restore();
    }
    this.compose();
    this.dependencyTracker?.recordOperation(opIdx);
    this.#endKnockoutElement(started);
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
      return { img: imgData.bitmap, canvasEntry: null };
    }
    const { bitmap, width, height } = imgData;
    const tmpCanvas = this.canvasFactory.create(width, height);
    const tmpCtx = tmpCanvas.context;
    tmpCtx.filter = this.current.transferMaps;
    tmpCtx.drawImage(bitmap, 0, 0);
    tmpCtx.filter = "none";

    return { img: tmpCanvas.canvas, canvasEntry: tmpCanvas };
  }

  paintInlineImageXObject(opIdx, imgData) {
    if (!this.contentVisible) {
      return;
    }
    const width = imgData.width;
    const height = imgData.height;
    const started = this.#beginKnockoutElement(this.current.fillAlpha);
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
    let inlineImgCanvas = null;
    if (imgData.bitmap) {
      const result = this.applyTransferMapsToBitmap(imgData);
      imgToPaint = result.img;
      inlineImgCanvas = result.canvasEntry;
    } else if (
      (typeof HTMLElement === "function" && imgData instanceof HTMLElement) ||
      !imgData.data
    ) {
      // typeof check is needed due to node.js support, see issue #8489
      imgToPaint = imgData;
    } else {
      const tmpCanvas = this.canvasFactory.create(width, height);
      putBinaryImageData(tmpCanvas.context, imgData);
      imgToPaint = this.applyTransferMapsToCanvas(tmpCanvas.context);
      inlineImgCanvas = tmpCanvas;
    }

    const scaled = this._scaleImage(
      imgToPaint,
      getCurrentTransformInverse(ctx)
    );
    ctx.imageSmoothingEnabled = getImageSmoothingEnabled(
      getCurrentTransform(ctx),
      imgData.interpolate
    );

    if (this.dependencyTracker) {
      this.dependencyTracker
        .resetBBox(opIdx)
        .recordBBox(opIdx, ctx, 0, width, -height, 0)
        .recordDependencies(opIdx, Dependencies.imageXObject)
        .recordOperation(opIdx);
      this.imagesTracker?.record(
        ctx,
        width,
        height,
        this.dependencyTracker.clipBox
      );
    }

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
    if (scaled.tmpCanvas) {
      this.canvasFactory.destroy(scaled.tmpCanvas);
    }
    if (inlineImgCanvas) {
      this.canvasFactory.destroy(inlineImgCanvas);
    }
    this.compose();
    this.restore(opIdx);
    this.#endKnockoutElement(started);
  }

  paintInlineImageXObjectGroup(opIdx, imgData, map) {
    if (!this.contentVisible) {
      return;
    }
    const started = this.#beginKnockoutElement(this.current.fillAlpha);
    const ctx = this.ctx;
    let imgToPaint;
    let inlineImgCanvas = null;
    if (imgData.bitmap) {
      imgToPaint = imgData.bitmap;
    } else {
      const w = imgData.width;
      const h = imgData.height;

      const tmpCanvas = this.canvasFactory.create(w, h);
      putBinaryImageData(tmpCanvas.context, imgData);
      imgToPaint = this.applyTransferMapsToCanvas(tmpCanvas.context);
      inlineImgCanvas = tmpCanvas;
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
    if (inlineImgCanvas) {
      this.canvasFactory.destroy(inlineImgCanvas);
    }
    this.dependencyTracker?.recordOperation(opIdx);
    this.compose();
    this.#endKnockoutElement(started);
  }

  paintSolidColorImageMask(opIdx) {
    if (!this.contentVisible) {
      return;
    }
    const started = this.#beginKnockoutElement(this.current.fillAlpha);
    this.dependencyTracker
      ?.resetBBox(opIdx)
      .recordBBox(opIdx, this.ctx, 0, 1, 0, 1)
      .recordDependencies(opIdx, Dependencies.fill)
      .recordOperation(opIdx);
    this.ctx.fillRect(0, 0, 1, 1);
    this.compose();
    this.#endKnockoutElement(started);
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
