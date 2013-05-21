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
/* globals ColorSpace, DeviceCmykCS, DeviceGrayCS, DeviceRgbCS, error,
           FONT_IDENTITY_MATRIX, IDENTITY_MATRIX, ImageData, isArray, isNum,
           isString, Pattern, TilingPattern, TODO, Util, warn, assert, info */

'use strict';

// <canvas> contexts store most of the state we need natively.
// However, PDF needs a bit more state, which we store here.

var TextRenderingMode = {
  FILL: 0,
  STROKE: 1,
  FILL_STROKE: 2,
  INVISIBLE: 3,
  FILL_ADD_TO_PATH: 4,
  STROKE_ADD_TO_PATH: 5,
  FILL_STROKE_ADD_TO_PATH: 6,
  ADD_TO_PATH: 7,
  FILL_STROKE_MASK: 3,
  ADD_TO_PATH_FLAG: 4
};

// Minimal font size that would be used during canvas fillText operations.
var MIN_FONT_SIZE = 16;

var COMPILE_TYPE3_GLYPHS = true;

function createScratchCanvas(width, height) {
  var canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function addContextCurrentTransform(ctx) {
  // If the context doesn't expose a `mozCurrentTransform`, add a JS based on.
  if (!ctx.mozCurrentTransform) {
    // Store the original context
    ctx._scaleX = ctx._scaleX || 1.0;
    ctx._scaleY = ctx._scaleY || 1.0;
    ctx._originalSave = ctx.save;
    ctx._originalRestore = ctx.restore;
    ctx._originalRotate = ctx.rotate;
    ctx._originalScale = ctx.scale;
    ctx._originalTranslate = ctx.translate;
    ctx._originalTransform = ctx.transform;
    ctx._originalSetTransform = ctx.setTransform;

    ctx._transformMatrix = [ctx._scaleX, 0, 0, ctx._scaleY, 0, 0];
    ctx._transformStack = [];

    Object.defineProperty(ctx, 'mozCurrentTransform', {
      get: function getCurrentTransform() {
        return this._transformMatrix;
      }
    });

    Object.defineProperty(ctx, 'mozCurrentTransformInverse', {
      get: function getCurrentTransformInverse() {
        // Calculation done using WolframAlpha:
        // http://www.wolframalpha.com/input/?
        //   i=Inverse+{{a%2C+c%2C+e}%2C+{b%2C+d%2C+f}%2C+{0%2C+0%2C+1}}

        var m = this._transformMatrix;
        var a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5];

        var ad_bc = a * d - b * c;
        var bc_ad = b * c - a * d;

        return [
          d / ad_bc,
          b / bc_ad,
          c / bc_ad,
          a / ad_bc,
          (d * e - c * f) / bc_ad,
          (b * e - a * f) / ad_bc
        ];
      }
    });

    ctx.save = function ctxSave() {
      var old = this._transformMatrix;
      this._transformStack.push(old);
      this._transformMatrix = old.slice(0, 6);

      this._originalSave();
    };

    ctx.restore = function ctxRestore() {
      var prev = this._transformStack.pop();
      if (prev) {
        this._transformMatrix = prev;
        this._originalRestore();
      }
    };

    ctx.translate = function ctxTranslate(x, y) {
      var m = this._transformMatrix;
      m[4] = m[0] * x + m[2] * y + m[4];
      m[5] = m[1] * x + m[3] * y + m[5];

      this._originalTranslate(x, y);
    };

    ctx.scale = function ctxScale(x, y) {
      var m = this._transformMatrix;
      m[0] = m[0] * x;
      m[1] = m[1] * x;
      m[2] = m[2] * y;
      m[3] = m[3] * y;

      this._originalScale(x, y);
    };

    ctx.transform = function ctxTransform(a, b, c, d, e, f) {
      var m = this._transformMatrix;
      this._transformMatrix = [
        m[0] * a + m[2] * b,
        m[1] * a + m[3] * b,
        m[0] * c + m[2] * d,
        m[1] * c + m[3] * d,
        m[0] * e + m[2] * f + m[4],
        m[1] * e + m[3] * f + m[5]
      ];

      ctx._originalTransform(a, b, c, d, e, f);
    };

    ctx.setTransform = function ctxSetTransform(a, b, c, d, e, f) {
      this._transformMatrix = [a, b, c, d, e, f];

      ctx._originalSetTransform(a, b, c, d, e, f);
    };

    ctx.rotate = function ctxRotate(angle) {
      var cosValue = Math.cos(angle);
      var sinValue = Math.sin(angle);

      var m = this._transformMatrix;
      this._transformMatrix = [
        m[0] * cosValue + m[2] * sinValue,
        m[1] * cosValue + m[3] * sinValue,
        m[0] * (-sinValue) + m[2] * cosValue,
        m[1] * (-sinValue) + m[3] * cosValue,
        m[4],
        m[5]
      ];

      this._originalRotate(angle);
    };
  }
}

function compileType3Glyph(imgData) {
  var POINT_TO_PROCESS_LIMIT = 1000;

  var width = imgData.width, height = imgData.height;
  var i, j;
  // we need sparse arrays
  var points = [];
  for (i = 0; i <= height; i++) {
    points.push([]);
  }

  // finding iteresting points: every point is located between mask pixels,
  // so there will be points of the (width + 1)x(height + 1) grid. Every point
  // will have flags assigned based on neighboring mask pixels:
  //   4 | 8
  //   --P--
  //   2 | 1
  // We are interested only in points with the flags:
  //   - outside corners: 1, 2, 4, 8;
  //   - inside corners: 7, 11, 13, 14;
  //   - and, intersections: 5, 10.
  var pos = 3, data = imgData.data, lineSize = width * 4, count = 0;
  if (data[3] !== 0) {
    points[0][0] = 1;
    ++count;
  }
  for (j = 1; j < width; j++) {
    if (data[pos] !== data[pos + 4]) {
      points[0][j] = data[pos] ? 2 : 1;
      ++count;
    }
    pos += 4;
  }
  if (data[pos] !== 0) {
    points[0][j] = 2;
    ++count;
  }
  pos += 4;
  for (i = 1; i < height; i++) {
    if (data[pos - lineSize] !== data[pos]) {
      points[i][0] = data[pos] ? 1 : 8;
      ++count;
    }
    for (j = 1; j < width; j++) {
      var f1 = data[pos + 4] ? 1 : 0;
      var f2 = data[pos] ? 1 : 0;
      var f4 = data[pos - lineSize] ? 1 : 0;
      var f8 = data[pos - lineSize + 4] ? 1 : 0;
      var fSum = f1 + f2 + f4 + f8;
      if (fSum === 1 || fSum === 3 || (fSum === 2 && f1 === f4)) {
        points[i][j] = f1 | (f2 << 1) | (f4 << 2) | (f8 << 3);
        ++count;
      }
      pos += 4;
    }
    if (data[pos - lineSize] !== data[pos]) {
      points[i][j] = data[pos] ? 2 : 4;
      ++count;
    }
    pos += 4;

    if (count > POINT_TO_PROCESS_LIMIT) {
      return null;
    }
  }
  pos -= lineSize;
  if (data[pos] !== 0) {
    points[i][0] = 8;
    ++count;
  }
  for (j = 1; j < width; j++) {
    if (data[pos] !== data[pos + 4]) {
      points[i][j] = data[pos] ? 4 : 8;
      ++count;
    }
    pos += 4;
  }
  if (data[pos] !== 0) {
    points[i][j] = 4;
    ++count;
  }
  if (count > POINT_TO_PROCESS_LIMIT) {
    return null;
  }

  // building outlines
  var outline = [];
  outline.push('c.save();');
  // the path shall be painted in [0..1]x[0..1] space
  outline.push('c.scale(' + (1 / width) + ',' +  (-1 / height) + ');');
  outline.push('c.translate(0,-' + height + ');');
  outline.push('c.beginPath();');
  for (i = 0; i <= height; i++) {
    if (points[i].length === 0) {
      continue;
    }
    var js = null;
    for (js in points[i]) {
      break;
    }
    if (js === null) {
      continue;
    }
    var i0 = i, j0 = (j = +js);

    outline.push('c.moveTo(' + j + ',' + i + ');');
    var type = points[i][j], d = 0;
    do {
      if (type === 5 || type === 10) {
        // line crossed: following dirrection we followed
        points[i0][j0] = type | (15 ^ d); // changing direction for "future hit"
        type |= d;
      }

      switch (type) {
      case 1:
      case 13:
        do { i0++; } while (!points[i0][j0]);
        d = 9;
        break;
      case 4:
      case 7:
        do { i0--; } while (!points[i0][j0]);
        d = 6;
        break;
      case 8:
      case 14:
        do { j0++; } while (!points[i0][j0]);
        d = 12;
        break;
      case 2:
      case 11:
        do { j0--; } while (!points[i0][j0]);
        d = 3;
        break;
      }
      outline.push('c.lineTo(' + j0 + ',' + i0 + ');');

      type = points[i0][j0];
      delete points[i0][j0];
    } while (j0 !== j || i0 !== i);
    --i;
  }
  outline.push('c.fill();');
  outline.push('c.beginPath();');
  outline.push('c.restore();');

  /*jshint -W054 */
  return new Function('c', outline.join('\n'));
}

var CanvasExtraState = (function CanvasExtraStateClosure() {
  function CanvasExtraState(old) {
    // Are soft masks and alpha values shapes or opacities?
    this.alphaIsShape = false;
    this.fontSize = 0;
    this.fontSizeScale = 1;
    this.textMatrix = IDENTITY_MATRIX;
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
    // Color spaces
    this.fillColorSpace = new DeviceGrayCS();
    this.fillColorSpaceObj = null;
    this.strokeColorSpace = new DeviceGrayCS();
    this.strokeColorSpaceObj = null;
    this.fillColorObj = null;
    this.strokeColorObj = null;
    // Default fore and background colors
    this.fillColor = '#000000';
    this.strokeColor = '#000000';
    // Note: fill alpha applies to all non-stroking operations
    this.fillAlpha = 1;
    this.strokeAlpha = 1;
    this.lineWidth = 1;
    this.paintFormXObjectDepth = 0;

    this.old = old;
  }

  CanvasExtraState.prototype = {
    clone: function CanvasExtraState_clone() {
      return Object.create(this);
    },
    setCurrentPoint: function CanvasExtraState_setCurrentPoint(x, y) {
      this.x = x;
      this.y = y;
    }
  };
  return CanvasExtraState;
})();

var CanvasGraphics = (function CanvasGraphicsClosure() {
  // Defines the time the executeOperatorList is going to be executing
  // before it stops and shedules a continue of execution.
  var EXECUTION_TIME = 15;

  function CanvasGraphics(canvasCtx, commonObjs, objs, textLayer, imageLayer) {
    this.ctx = canvasCtx;
    this.current = new CanvasExtraState();
    this.stateStack = [];
    this.pendingClip = null;
    this.pendingEOFill = false;
    this.res = null;
    this.xobjs = null;
    this.commonObjs = commonObjs;
    this.objs = objs;
    this.textLayer = textLayer;
    this.imageLayer = imageLayer;
    this.groupStack = [];
    this.processingType3 = null;
    if (canvasCtx) {
      addContextCurrentTransform(canvasCtx);
    }
  }

  function applyStencilMask(imgArray, width, height, inverseDecode, buffer) {
    var imgArrayPos = 0;
    var i, j, mask, buf;
    // removing making non-masked pixels transparent
    var bufferPos = 3; // alpha component offset
    for (i = 0; i < height; i++) {
      mask = 0;
      for (j = 0; j < width; j++) {
        if (!mask) {
          buf = imgArray[imgArrayPos++];
          mask = 128;
        }
        if (!(buf & mask) === inverseDecode) {
          buffer[bufferPos] = 0;
        }
        bufferPos += 4;
        mask >>= 1;
      }
    }
  }

  function putBinaryImageData(ctx, data, w, h) {
    var tmpImgData = 'createImageData' in ctx ? ctx.createImageData(w, h) :
      ctx.getImageData(0, 0, w, h);

    var tmpImgDataPixels = tmpImgData.data;
    if ('set' in tmpImgDataPixels)
      tmpImgDataPixels.set(data);
    else {
      // Copy over the imageData pixel by pixel.
      for (var i = 0, ii = tmpImgDataPixels.length; i < ii; i++)
        tmpImgDataPixels[i] = data[i];
    }

    ctx.putImageData(tmpImgData, 0, 0);
  }

  function prescaleImage(pixels, width, height, widthScale, heightScale) {
    pixels = new Uint8Array(pixels); // creating a copy
    while (widthScale > 2 || heightScale > 2) {
      if (heightScale > 2) {
        // scaling image twice vertically
        var rowSize = width * 4;
        var k = 0, l = 0;
        for (var i = 0; i < height - 1; i += 2) {
          for (var j = 0; j < width; j++) {
            var alpha1 = pixels[k + 3], alpha2 = pixels[k + 3 + rowSize];
            if (alpha1 === alpha2) {
              pixels[l] = (pixels[k] + pixels[k + rowSize]) >> 1;
              pixels[l + 1] = (pixels[k + 1] + pixels[k + 1 + rowSize]) >> 1;
              pixels[l + 2] = (pixels[k + 2] + pixels[k + 2 + rowSize]) >> 1;
              pixels[l + 3] = alpha1;
            } else if (alpha1 < alpha2) {
              var d = 256 - alpha2 + alpha1;
              pixels[l] = (pixels[k] * d + (pixels[k + rowSize] << 8)) >> 9;
              pixels[l + 1] = (pixels[k + 1] * d +
                              (pixels[k + 1 + rowSize] << 8)) >> 9;
              pixels[l + 2] = (pixels[k + 2] * d +
                              (pixels[k + 2 + rowSize] << 8)) >> 9;
              pixels[l + 3] = alpha2;
            } else {
              var d = 256 - alpha1 + alpha2;
              pixels[l] = ((pixels[k] << 8) + pixels[k + rowSize] * d) >> 9;
              pixels[l + 1] = ((pixels[k + 1] << 8) +
                              pixels[k + 1 + rowSize] * d) >> 9;
              pixels[l + 2] = ((pixels[k + 2] << 8) +
                              pixels[k + 2 + rowSize] * d) >> 9;
              pixels[l + 3] = alpha1;
            }
            k += 4; l += 4;
          }
          k += rowSize;
        }
        if (height & 1) {
          for (var i = 0; i < rowSize; i++) {
            pixels[l++] = pixels[k++];
          }
        }
        height = (height + 1) >> 1;
        heightScale /= 2;
      }
      if (widthScale > 2) {
        // scaling image twice horizontally
        var k = 0, l = 0;
        for (var i = 0; i < height; i++) {
          for (var j = 0; j < width - 1; j += 2) {
            var alpha1 = pixels[k + 3], alpha2 = pixels[k + 7];
            if (alpha1 === alpha2) {
              pixels[l] = (pixels[k] + pixels[k + 4]) >> 1;
              pixels[l + 1] = (pixels[k + 1] + pixels[k + 5]) >> 1;
              pixels[l + 2] = (pixels[k + 2] + pixels[k + 6]) >> 1;
              pixels[l + 3] = alpha1;
            } else if (alpha1 < alpha2) {
              var d = 256 - alpha2 + alpha1;
              pixels[l] = (pixels[k] * d + (pixels[k + 4] << 8)) >> 9;
              pixels[l + 1] = (pixels[k + 1] * d + (pixels[k + 5] << 8)) >> 9;
              pixels[l + 2] = (pixels[k + 2] * d + (pixels[k + 6] << 8)) >> 9;
              pixels[l + 3] = alpha2;
            } else {
              var d = 256 - alpha1 + alpha2;
              pixels[l] = ((pixels[k] << 8) + pixels[k + 4] * d) >> 9;
              pixels[l + 1] = ((pixels[k + 1] << 8) + pixels[k + 5] * d) >> 9;
              pixels[l + 2] = ((pixels[k + 2] << 8) + pixels[k + 6] * d) >> 9;
              pixels[l + 3] = alpha1;
            }
            k += 8; l += 4;
          }
          if (width & 1) {
            pixels[l++] = pixels[k++];
            pixels[l++] = pixels[k++];
            pixels[l++] = pixels[k++];
            pixels[l++] = pixels[k++];
          }
        }
        width = (width + 1) >> 1;
        widthScale /= 2;
      }
    }

    var tmpCanvas = createScratchCanvas(width, height);
    var tmpCtx = tmpCanvas.getContext('2d');
    putBinaryImageData(tmpCtx, pixels.subarray(0, width * height * 4),
                               width, height);

    return tmpCanvas;
  }

  function copyCtxState(sourceCtx, destCtx) {
    var properties = ['strokeStyle', 'fillStyle', 'fillRule', 'globalAlpha',
                      'lineWidth', 'lineCap', 'lineJoin', 'miterLimit',
                      'globalCompositeOperation', 'font'];
    for (var i = 0, ii = properties.length; i < ii; i++) {
      var property = properties[i];
      if (property in sourceCtx) {
        destCtx[property] = sourceCtx[property];
      }
    }
    if ('setLineDash' in sourceCtx) {
      destCtx.setLineDash(sourceCtx.getLineDash());
      destCtx.lineDashOffset =  sourceCtx.lineDashOffset;
    } else if ('mozDash' in sourceCtx) {
      destCtx.mozDash = sourceCtx.mozDash;
      destCtx.mozDashOffset = sourceCtx.mozDashOffset;
    }
  }

  var LINE_CAP_STYLES = ['butt', 'round', 'square'];
  var LINE_JOIN_STYLES = ['miter', 'round', 'bevel'];
  var NORMAL_CLIP = {};
  var EO_CLIP = {};

  CanvasGraphics.prototype = {
    slowCommands: {
      'stroke': true,
      'closeStroke': true,
      'fill': true,
      'eoFill': true,
      'fillStroke': true,
      'eoFillStroke': true,
      'closeFillStroke': true,
      'closeEOFillStroke': true,
      'showText': true,
      'showSpacedText': true,
      'setStrokeColorSpace': true,
      'setFillColorSpace': true,
      'setStrokeColor': true,
      'setStrokeColorN': true,
      'setFillColor': true,
      'setFillColorN': true,
      'setStrokeGray': true,
      'setFillGray': true,
      'setStrokeRGBColor': true,
      'setFillRGBColor': true,
      'setStrokeCMYKColor': true,
      'setFillCMYKColor': true,
      'paintJpegXObject': true,
      'paintImageXObject': true,
      'paintInlineImageXObject': true,
      'paintInlineImageXObjectGroup': true,
      'paintImageMaskXObject': true,
      'paintImageMaskXObjectGroup': true,
      'shadingFill': true
    },

    beginDrawing: function CanvasGraphics_beginDrawing(viewport, transparency) {
      // For pdfs that use blend modes we have to clear the canvas else certain
      // blend modes can look wrong since we'd be blending with a white
      // backdrop. The problem with a transparent backdrop though is we then
      // don't get sub pixel anti aliasing on text, so we fill with white if
      // we can.
      var width = this.ctx.canvas.width;
      var height = this.ctx.canvas.height;
      if (transparency) {
        this.ctx.clearRect(0, 0, width, height);
      } else {
        this.ctx.mozOpaque = true;
        this.ctx.save();
        this.ctx.fillStyle = 'rgb(255, 255, 255)';
        this.ctx.fillRect(0, 0, width, height);
        this.ctx.restore();
      }

      var transform = viewport.transform;
      this.ctx.save();
      this.ctx.transform.apply(this.ctx, transform);

      if (this.textLayer) {
        this.textLayer.beginLayout();
      }
      if (this.imageLayer) {
        this.imageLayer.beginLayout();
      }
    },

    executeOperatorList: function CanvasGraphics_executeOperatorList(
                                    operatorList,
                                    executionStartIdx, continueCallback,
                                    stepper) {
      var argsArray = operatorList.argsArray;
      var fnArray = operatorList.fnArray;
      var i = executionStartIdx || 0;
      var argsArrayLen = argsArray.length;

      // Sometimes the OperatorList to execute is empty.
      if (argsArrayLen == i) {
        return i;
      }

      var executionEndIdx;
      var endTime = Date.now() + EXECUTION_TIME;

      var commonObjs = this.commonObjs;
      var objs = this.objs;
      var fnName;
      var slowCommands = this.slowCommands;

      while (true) {
        if (stepper && i === stepper.nextBreakPoint) {
          stepper.breakIt(i, continueCallback);
          return i;
        }

        fnName = fnArray[i];

        if (fnName !== 'dependency') {
          this[fnName].apply(this, argsArray[i]);
        } else {
          var deps = argsArray[i];
          for (var n = 0, nn = deps.length; n < nn; n++) {
            var depObjId = deps[n];
            var common = depObjId.substring(0, 2) == 'g_';

            // If the promise isn't resolved yet, add the continueCallback
            // to the promise and bail out.
            if (!common && !objs.isResolved(depObjId)) {
              objs.get(depObjId, continueCallback);
              return i;
            }
            if (common && !commonObjs.isResolved(depObjId)) {
              commonObjs.get(depObjId, continueCallback);
              return i;
            }
          }
        }

        i++;

        // If the entire operatorList was executed, stop as were done.
        if (i == argsArrayLen) {
          return i;
        }

        // If the execution took longer then a certain amount of time, shedule
        // to continue exeution after a short delay.
        // However, this is only possible if a 'continueCallback' is passed in.
        if (continueCallback && slowCommands[fnName] && Date.now() > endTime) {
          setTimeout(continueCallback, 0);
          return i;
        }

        // If the operatorList isn't executed completely yet OR the execution
        // time was short enough, do another execution round.
      }
    },

    endDrawing: function CanvasGraphics_endDrawing() {
      this.ctx.restore();

      if (this.textLayer) {
        this.textLayer.endLayout();
      }
      if (this.imageLayer) {
        this.imageLayer.endLayout();
      }
    },

    // Graphics state
    setLineWidth: function CanvasGraphics_setLineWidth(width) {
      this.current.lineWidth = width;
      this.ctx.lineWidth = width;
    },
    setLineCap: function CanvasGraphics_setLineCap(style) {
      this.ctx.lineCap = LINE_CAP_STYLES[style];
    },
    setLineJoin: function CanvasGraphics_setLineJoin(style) {
      this.ctx.lineJoin = LINE_JOIN_STYLES[style];
    },
    setMiterLimit: function CanvasGraphics_setMiterLimit(limit) {
      this.ctx.miterLimit = limit;
    },
    setDash: function CanvasGraphics_setDash(dashArray, dashPhase) {
      var ctx = this.ctx;
      if ('setLineDash' in ctx) {
        ctx.setLineDash(dashArray);
        ctx.lineDashOffset = dashPhase;
      } else {
        ctx.mozDash = dashArray;
        ctx.mozDashOffset = dashPhase;
      }
    },
    setRenderingIntent: function CanvasGraphics_setRenderingIntent(intent) {
      // Maybe if we one day fully support color spaces this will be important
      // for now we can ignore.
      // TODO set rendering intent?
    },
    setFlatness: function CanvasGraphics_setFlatness(flatness) {
      // There's no way to control this with canvas, but we can safely ignore.
      // TODO set flatness?
    },
    setGState: function CanvasGraphics_setGState(states) {
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
          case 'RI':
            this.setRenderingIntent(value);
            break;
          case 'FL':
            this.setFlatness(value);
            break;
          case 'Font':
            this.setFont(state[1], state[2]);
            break;
          case 'CA':
            this.current.strokeAlpha = state[1];
            break;
          case 'ca':
            this.current.fillAlpha = state[1];
            this.ctx.globalAlpha = state[1];
            break;
          case 'BM':
            if (value && value.name && (value.name !== 'Normal')) {
              var mode = value.name.replace(/([A-Z])/g,
                function(c) {
                  return '-' + c.toLowerCase();
                }
              ).substring(1);
              this.ctx.globalCompositeOperation = mode;
              if (this.ctx.globalCompositeOperation !== mode) {
                warn('globalCompositeOperation "' + mode +
                     '" is not supported');
              }
            } else {
              this.ctx.globalCompositeOperation = 'source-over';
            }
            break;
        }
      }
    },
    save: function CanvasGraphics_save() {
      this.ctx.save();
      var old = this.current;
      this.stateStack.push(old);
      this.current = old.clone();
    },
    restore: function CanvasGraphics_restore() {
      var prev = this.stateStack.pop();
      if (prev) {
        this.current = prev;
        this.ctx.restore();
      }
    },
    transform: function CanvasGraphics_transform(a, b, c, d, e, f) {
      this.ctx.transform(a, b, c, d, e, f);
    },

    // Path
    moveTo: function CanvasGraphics_moveTo(x, y) {
      this.ctx.moveTo(x, y);
      this.current.setCurrentPoint(x, y);
    },
    lineTo: function CanvasGraphics_lineTo(x, y) {
      this.ctx.lineTo(x, y);
      this.current.setCurrentPoint(x, y);
    },
    curveTo: function CanvasGraphics_curveTo(x1, y1, x2, y2, x3, y3) {
      this.ctx.bezierCurveTo(x1, y1, x2, y2, x3, y3);
      this.current.setCurrentPoint(x3, y3);
    },
    curveTo2: function CanvasGraphics_curveTo2(x2, y2, x3, y3) {
      var current = this.current;
      this.ctx.bezierCurveTo(current.x, current.y, x2, y2, x3, y3);
      current.setCurrentPoint(x3, y3);
    },
    curveTo3: function CanvasGraphics_curveTo3(x1, y1, x3, y3) {
      this.curveTo(x1, y1, x3, y3, x3, y3);
      this.current.setCurrentPoint(x3, y3);
    },
    closePath: function CanvasGraphics_closePath() {
      this.ctx.closePath();
    },
    rectangle: function CanvasGraphics_rectangle(x, y, width, height) {
      this.ctx.rect(x, y, width, height);
    },
    stroke: function CanvasGraphics_stroke(consumePath) {
      consumePath = typeof consumePath !== 'undefined' ? consumePath : true;
      var ctx = this.ctx;
      var strokeColor = this.current.strokeColor;
      if (this.current.lineWidth === 0)
        ctx.lineWidth = this.getSinglePixelWidth();
      // For stroke we want to temporarily change the global alpha to the
      // stroking alpha.
      ctx.globalAlpha = this.current.strokeAlpha;
      if (strokeColor && strokeColor.hasOwnProperty('type') &&
          strokeColor.type === 'Pattern') {
        // for patterns, we transform to pattern space, calculate
        // the pattern, call stroke, and restore to user space
        ctx.save();
        ctx.strokeStyle = strokeColor.getPattern(ctx);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.stroke();
      }
      if (consumePath)
        this.consumePath();
      // Restore the global alpha to the fill alpha
      ctx.globalAlpha = this.current.fillAlpha;
    },
    closeStroke: function CanvasGraphics_closeStroke() {
      this.closePath();
      this.stroke();
    },
    fill: function CanvasGraphics_fill(consumePath) {
      consumePath = typeof consumePath !== 'undefined' ? consumePath : true;
      var ctx = this.ctx;
      var fillColor = this.current.fillColor;
      var needRestore = false;

      if (fillColor && fillColor.hasOwnProperty('type') &&
          fillColor.type === 'Pattern') {
        ctx.save();
        ctx.fillStyle = fillColor.getPattern(ctx);
        needRestore = true;
      }

      if (this.pendingEOFill) {
        if ('mozFillRule' in this.ctx) {
          this.ctx.mozFillRule = 'evenodd';
          this.ctx.fill();
          this.ctx.mozFillRule = 'nonzero';
        } else {
          try {
            this.ctx.fill('evenodd');
          } catch (ex) {
            // shouldn't really happen, but browsers might think differently
            this.ctx.fill();
          }
        }
        this.pendingEOFill = false;
      } else {
        this.ctx.fill();
      }

      if (needRestore) {
        ctx.restore();
      }
      if (consumePath) {
        this.consumePath();
      }
    },
    eoFill: function CanvasGraphics_eoFill() {
      this.pendingEOFill = true;
      this.fill();
    },
    fillStroke: function CanvasGraphics_fillStroke() {
      this.fill(false);
      this.stroke(false);

      this.consumePath();
    },
    eoFillStroke: function CanvasGraphics_eoFillStroke() {
      this.pendingEOFill = true;
      this.fillStroke();
    },
    closeFillStroke: function CanvasGraphics_closeFillStroke() {
      this.closePath();
      this.fillStroke();
    },
    closeEOFillStroke: function CanvasGraphics_closeEOFillStroke() {
      this.pendingEOFill = true;
      this.closePath();
      this.fillStroke();
    },
    endPath: function CanvasGraphics_endPath() {
      this.consumePath();
    },

    // Clipping
    clip: function CanvasGraphics_clip() {
      this.pendingClip = NORMAL_CLIP;
    },
    eoClip: function CanvasGraphics_eoClip() {
      this.pendingClip = EO_CLIP;
    },

    // Text
    beginText: function CanvasGraphics_beginText() {
      this.current.textMatrix = IDENTITY_MATRIX;
      this.current.x = this.current.lineX = 0;
      this.current.y = this.current.lineY = 0;
    },
    endText: function CanvasGraphics_endText() {
      if (!('pendingTextPaths' in this)) {
        this.ctx.beginPath();
        return;
      }
      var paths = this.pendingTextPaths;
      var ctx = this.ctx;

      ctx.save();
      ctx.beginPath();
      for (var i = 0; i < paths.length; i++) {
        var path = paths[i];
        ctx.setTransform.apply(ctx, path.transform);
        ctx.translate(path.x, path.y);
        path.addToPath(ctx, path.fontSize);
      }
      ctx.restore();
      ctx.clip();
      ctx.beginPath();
      delete this.pendingTextPaths;
    },
    setCharSpacing: function CanvasGraphics_setCharSpacing(spacing) {
      this.current.charSpacing = spacing;
    },
    setWordSpacing: function CanvasGraphics_setWordSpacing(spacing) {
      this.current.wordSpacing = spacing;
    },
    setHScale: function CanvasGraphics_setHScale(scale) {
      this.current.textHScale = scale / 100;
    },
    setLeading: function CanvasGraphics_setLeading(leading) {
      this.current.leading = -leading;
    },
    setFont: function CanvasGraphics_setFont(fontRefName, size) {
      var fontObj = this.commonObjs.get(fontRefName);
      var current = this.current;

      if (!fontObj)
        error('Can\'t find font for ' + fontRefName);

      current.fontMatrix = fontObj.fontMatrix ? fontObj.fontMatrix :
                                                FONT_IDENTITY_MATRIX;

      // A valid matrix needs all main diagonal elements to be non-zero
      // This also ensures we bypass FF bugzilla bug #719844.
      if (current.fontMatrix[0] === 0 ||
          current.fontMatrix[3] === 0) {
        warn('Invalid font matrix for font ' + fontRefName);
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

      if (fontObj.coded)
        return; // we don't need ctx.font for Type3 fonts

      var name = fontObj.loadedName || 'sans-serif';
      var bold = fontObj.black ? (fontObj.bold ? 'bolder' : 'bold') :
                                 (fontObj.bold ? 'bold' : 'normal');

      var italic = fontObj.italic ? 'italic' : 'normal';
      var typeface = '"' + name + '", ' + fontObj.fallbackName;

      // Some font backends cannot handle fonts below certain size.
      // Keeping the font at minimal size and using the fontSizeScale to change
      // the current transformation matrix before the fillText/strokeText.
      // See https://bugzilla.mozilla.org/show_bug.cgi?id=726227
      var browserFontSize = size >= MIN_FONT_SIZE ? size : MIN_FONT_SIZE;
      this.current.fontSizeScale = browserFontSize != MIN_FONT_SIZE ? 1.0 :
                                   size / MIN_FONT_SIZE;

      var rule = italic + ' ' + bold + ' ' + browserFontSize + 'px ' + typeface;
      this.ctx.font = rule;
    },
    setTextRenderingMode: function CanvasGraphics_setTextRenderingMode(mode) {
      this.current.textRenderingMode = mode;
    },
    setTextRise: function CanvasGraphics_setTextRise(rise) {
      this.current.textRise = rise;
    },
    moveText: function CanvasGraphics_moveText(x, y) {
      this.current.x = this.current.lineX += x;
      this.current.y = this.current.lineY += y;
    },
    setLeadingMoveText: function CanvasGraphics_setLeadingMoveText(x, y) {
      this.setLeading(-y);
      this.moveText(x, y);
    },
    setTextMatrix: function CanvasGraphics_setTextMatrix(a, b, c, d, e, f) {
      this.current.textMatrix = [a, b, c, d, e, f];

      this.current.x = this.current.lineX = 0;
      this.current.y = this.current.lineY = 0;
    },
    nextLine: function CanvasGraphics_nextLine() {
      this.moveText(0, this.current.leading);
    },
    applyTextTransforms: function CanvasGraphics_applyTextTransforms() {
      var ctx = this.ctx;
      var current = this.current;
      ctx.transform.apply(ctx, current.textMatrix);
      ctx.translate(current.x, current.y + current.textRise);
      if (current.fontDirection > 0) {
        ctx.scale(current.textHScale, -1);
      } else {
        ctx.scale(-current.textHScale, 1);
      }
    },
    createTextGeometry: function CanvasGraphics_createTextGeometry() {
      var geometry = {};
      var ctx = this.ctx;
      var font = this.current.font;
      var ctxMatrix = ctx.mozCurrentTransform;
      if (ctxMatrix) {
        var bl = Util.applyTransform([0, 0], ctxMatrix);
        var tr = Util.applyTransform([1, 1], ctxMatrix);
        geometry.x = bl[0];
        geometry.y = bl[1];
        geometry.hScale = tr[0] - bl[0];
        geometry.vScale = tr[1] - bl[1];
      }
      geometry.spaceWidth = font.spaceWidth;
      geometry.fontName = font.loadedName;
      geometry.fontFamily = font.fallbackName;
      geometry.fontSize = this.current.fontSize;
      return geometry;
    },

    paintChar: function (character, x, y) {
      var ctx = this.ctx;
      var current = this.current;
      var font = current.font;
      var fontSize = current.fontSize / current.fontSizeScale;
      var textRenderingMode = current.textRenderingMode;
      var fillStrokeMode = textRenderingMode &
        TextRenderingMode.FILL_STROKE_MASK;
      var isAddToPathSet = !!(textRenderingMode &
        TextRenderingMode.ADD_TO_PATH_FLAG);

      var addToPath;
      if (font.disableFontFace || isAddToPathSet) {
        addToPath = font.renderer.getPathGenerator(character);
      }

      if (font.disableFontFace) {
        ctx.save();
        ctx.translate(x, y);
        ctx.beginPath();
        addToPath(ctx, fontSize);
        if (fillStrokeMode === TextRenderingMode.FILL ||
            fillStrokeMode === TextRenderingMode.FILL_STROKE) {
          ctx.fill();
        }
        if (fillStrokeMode === TextRenderingMode.STROKE ||
            fillStrokeMode === TextRenderingMode.FILL_STROKE) {
          ctx.stroke();
        }
        ctx.restore();
      } else {
        if (fillStrokeMode === TextRenderingMode.FILL ||
            fillStrokeMode === TextRenderingMode.FILL_STROKE) {
          ctx.fillText(character, x, y);
        }
        if (fillStrokeMode === TextRenderingMode.STROKE ||
            fillStrokeMode === TextRenderingMode.FILL_STROKE) {
          ctx.strokeText(character, x, y);
        }
      }

      if (isAddToPathSet) {
        var paths = this.pendingTextPaths || (this.pendingTextPaths = []);
        paths.push({
          transform: ctx.mozCurrentTransform,
          x: x,
          y: y,
          fontSize: fontSize,
          addToPath: addToPath
        });
      }
    },

    showText: function CanvasGraphics_showText(str, skipTextSelection) {
      var ctx = this.ctx;
      var current = this.current;
      var font = current.font;
      var glyphs = font.charsToGlyphs(str);
      var fontSize = current.fontSize;
      var fontSizeScale = current.fontSizeScale;
      var charSpacing = current.charSpacing;
      var wordSpacing = current.wordSpacing;
      var textHScale = current.textHScale * current.fontDirection;
      var fontMatrix = current.fontMatrix || FONT_IDENTITY_MATRIX;
      var glyphsLength = glyphs.length;
      var textLayer = this.textLayer;
      var geom;
      var textSelection = textLayer && !skipTextSelection ? true : false;
      var canvasWidth = 0.0;
      var vertical = font.vertical;
      var defaultVMetrics = font.defaultVMetrics;

      // Type3 fonts - each glyph is a "mini-PDF"
      if (font.coded) {
        ctx.save();
        ctx.transform.apply(ctx, current.textMatrix);
        ctx.translate(current.x, current.y);

        ctx.scale(textHScale, 1);

        if (textSelection) {
          this.save();
          ctx.scale(1, -1);
          geom = this.createTextGeometry();
          this.restore();
        }
        for (var i = 0; i < glyphsLength; ++i) {

          var glyph = glyphs[i];
          if (glyph === null) {
            // word break
            this.ctx.translate(wordSpacing, 0);
            current.x += wordSpacing * textHScale;
            continue;
          }

          this.processingType3 = glyph;
          this.save();
          ctx.scale(fontSize, fontSize);
          ctx.transform.apply(ctx, fontMatrix);
          this.executeOperatorList(glyph.operatorList);
          this.restore();

          var transformed = Util.applyTransform([glyph.width, 0], fontMatrix);
          var width = (transformed[0] * fontSize + charSpacing) *
                      current.fontDirection;

          ctx.translate(width, 0);
          current.x += width * textHScale;

          canvasWidth += width;
        }
        ctx.restore();
        this.processingType3 = null;
      } else {
        ctx.save();
        this.applyTextTransforms();

        var lineWidth = current.lineWidth;
        var a1 = current.textMatrix[0], b1 = current.textMatrix[1];
        var scale = Math.sqrt(a1 * a1 + b1 * b1);
        if (scale === 0 || lineWidth === 0)
          lineWidth = this.getSinglePixelWidth();
        else
          lineWidth /= scale;

        if (textSelection)
          geom = this.createTextGeometry();

        if (fontSizeScale != 1.0) {
          ctx.scale(fontSizeScale, fontSizeScale);
          lineWidth /= fontSizeScale;
        }

        ctx.lineWidth = lineWidth;

        var x = 0;
        for (var i = 0; i < glyphsLength; ++i) {
          var glyph = glyphs[i];
          if (glyph === null) {
            // word break
            x += current.fontDirection * wordSpacing;
            continue;
          }

          var restoreNeeded = false;
          var character = glyph.fontChar;
          var vmetric = glyph.vmetric || defaultVMetrics;
          if (vertical) {
            var vx = glyph.vmetric ? vmetric[1] : glyph.width * 0.5;
            vx = -vx * fontSize * current.fontMatrix[0];
            var vy = vmetric[2] * fontSize * current.fontMatrix[0];
          }
          var width = vmetric ? -vmetric[0] : glyph.width;
          var charWidth = width * fontSize * current.fontMatrix[0] +
                          charSpacing * current.fontDirection;
          var accent = glyph.accent;

          var scaledX, scaledY, scaledAccentX, scaledAccentY;
          if (!glyph.disabled) {
            if (vertical) {
              scaledX = vx / fontSizeScale;
              scaledY = (x + vy) / fontSizeScale;
            } else {
              scaledX = x / fontSizeScale;
              scaledY = 0;
            }

            if (font.remeasure && width > 0) {
              // some standard fonts may not have the exact width, trying to
              // rescale per character
              var measuredWidth = ctx.measureText(character).width * 1000 /
                current.fontSize * current.fontSizeScale;
              var characterScaleX = width / measuredWidth;
              restoreNeeded = true;
              ctx.save();
              ctx.scale(characterScaleX, 1);
              scaledX /= characterScaleX;
              if (accent) {
                scaledAccentX /= characterScaleX;
              }
            }

            this.paintChar(character, scaledX, scaledY);
            if (accent) {
              scaledAccentX = scaledX + accent.offset.x / fontSizeScale;
              scaledAccentY = scaledY - accent.offset.y / fontSizeScale;
              this.paintChar(accent.fontChar, scaledAccentX, scaledAccentY);
            }
          }

          x += charWidth;

          canvasWidth += charWidth;

          if (restoreNeeded) {
            ctx.restore();
          }
        }
        if (vertical) {
          current.y -= x * textHScale;
        } else {
          current.x += x * textHScale;
        }
        ctx.restore();
      }

      if (textSelection) {
        geom.canvasWidth = canvasWidth;
        if (vertical) {
          var vmetric = font.defaultVMetrics;
          geom.x += vmetric[1] * fontSize * current.fontMatrix[0] /
                    fontSizeScale * geom.hScale;
          geom.y += vmetric[2] * fontSize * current.fontMatrix[0] /
                    fontSizeScale * geom.vScale;
        }
        this.textLayer.appendText(geom);
      }

      return canvasWidth;
    },
    showSpacedText: function CanvasGraphics_showSpacedText(arr) {
      var ctx = this.ctx;
      var current = this.current;
      var font = current.font;
      var fontSize = current.fontSize;
      // TJ array's number is independent from fontMatrix
      var textHScale = current.textHScale * 0.001 * current.fontDirection;
      var arrLength = arr.length;
      var textLayer = this.textLayer;
      var geom;
      var canvasWidth = 0.0;
      var textSelection = textLayer ? true : false;
      var vertical = font.vertical;
      var spacingAccumulator = 0;

      if (textSelection) {
        ctx.save();
        this.applyTextTransforms();
        geom = this.createTextGeometry();
        ctx.restore();
      }

      for (var i = 0; i < arrLength; ++i) {
        var e = arr[i];
        if (isNum(e)) {
          var spacingLength = -e * fontSize * textHScale;
          if (vertical) {
            current.y += spacingLength;
          } else {
            current.x += spacingLength;
          }

          if (textSelection)
            spacingAccumulator += spacingLength;
        } else if (isString(e)) {
          var shownCanvasWidth = this.showText(e, true);

          if (textSelection) {
            canvasWidth += spacingAccumulator + shownCanvasWidth;
            spacingAccumulator = 0;
          }
        } else {
          error('TJ array element ' + e + ' is not string or num');
        }
      }

      if (textSelection) {
        geom.canvasWidth = canvasWidth;
        if (vertical) {
          var fontSizeScale = current.fontSizeScale;
          var vmetric = font.defaultVMetrics;
          geom.x += vmetric[1] * fontSize * current.fontMatrix[0] /
                    fontSizeScale * geom.hScale;
          geom.y += vmetric[2] * fontSize * current.fontMatrix[0] /
                    fontSizeScale * geom.vScale;
        }
        this.textLayer.appendText(geom);
      }
    },
    nextLineShowText: function CanvasGraphics_nextLineShowText(text) {
      this.nextLine();
      this.showText(text);
    },
    nextLineSetSpacingShowText:
      function CanvasGraphics_nextLineSetSpacingShowText(wordSpacing,
                                                         charSpacing,
                                                         text) {
      this.setWordSpacing(wordSpacing);
      this.setCharSpacing(charSpacing);
      this.nextLineShowText(text);
    },

    // Type3 fonts
    setCharWidth: function CanvasGraphics_setCharWidth(xWidth, yWidth) {
      // We can safely ignore this since the width should be the same
      // as the width in the Widths array.
    },
    setCharWidthAndBounds: function CanvasGraphics_setCharWidthAndBounds(xWidth,
                                                                        yWidth,
                                                                        llx,
                                                                        lly,
                                                                        urx,
                                                                        ury) {
      // TODO According to the spec we're also suppose to ignore any operators
      // that set color or include images while processing this type3 font.
      this.rectangle(llx, lly, urx - llx, ury - lly);
      this.clip();
      this.endPath();
    },

    // Color
    setStrokeColorSpace: function CanvasGraphics_setStrokeColorSpace(raw) {
      this.current.strokeColorSpace = ColorSpace.fromIR(raw);
    },
    setFillColorSpace: function CanvasGraphics_setFillColorSpace(raw) {
      this.current.fillColorSpace = ColorSpace.fromIR(raw);
    },
    setStrokeColor: function CanvasGraphics_setStrokeColor(/*...*/) {
      var cs = this.current.strokeColorSpace;
      var rgbColor = cs.getRgb(arguments, 0);
      var color = Util.makeCssRgb(rgbColor);
      this.ctx.strokeStyle = color;
      this.current.strokeColor = color;
    },
    getColorN_Pattern: function CanvasGraphics_getColorN_Pattern(IR, cs) {
      if (IR[0] == 'TilingPattern') {
        var args = IR[1];
        var base = cs.base;
        var color;
        if (base) {
          var baseComps = base.numComps;

          color = base.getRgb(args, 0);
        }
        var pattern = new TilingPattern(IR, color, this.ctx, this.objs,
                                        this.commonObjs);
      } else if (IR[0] == 'RadialAxial' || IR[0] == 'Dummy') {
        var pattern = Pattern.shadingFromIR(IR);
      } else {
        error('Unkown IR type ' + IR[0]);
      }
      return pattern;
    },
    setStrokeColorN: function CanvasGraphics_setStrokeColorN(/*...*/) {
      var cs = this.current.strokeColorSpace;

      if (cs.name == 'Pattern') {
        this.current.strokeColor = this.getColorN_Pattern(arguments, cs);
      } else {
        this.setStrokeColor.apply(this, arguments);
      }
    },
    setFillColor: function CanvasGraphics_setFillColor(/*...*/) {
      var cs = this.current.fillColorSpace;
      var rgbColor = cs.getRgb(arguments, 0);
      var color = Util.makeCssRgb(rgbColor);
      this.ctx.fillStyle = color;
      this.current.fillColor = color;
    },
    setFillColorN: function CanvasGraphics_setFillColorN(/*...*/) {
      var cs = this.current.fillColorSpace;

      if (cs.name == 'Pattern') {
        this.current.fillColor = this.getColorN_Pattern(arguments, cs);
      } else {
        this.setFillColor.apply(this, arguments);
      }
    },
    setStrokeGray: function CanvasGraphics_setStrokeGray(gray) {
      if (!(this.current.strokeColorSpace instanceof DeviceGrayCS))
        this.current.strokeColorSpace = new DeviceGrayCS();

      var rgbColor = this.current.strokeColorSpace.getRgb(arguments, 0);
      var color = Util.makeCssRgb(rgbColor);
      this.ctx.strokeStyle = color;
      this.current.strokeColor = color;
    },
    setFillGray: function CanvasGraphics_setFillGray(gray) {
      if (!(this.current.fillColorSpace instanceof DeviceGrayCS))
        this.current.fillColorSpace = new DeviceGrayCS();

      var rgbColor = this.current.fillColorSpace.getRgb(arguments, 0);
      var color = Util.makeCssRgb(rgbColor);
      this.ctx.fillStyle = color;
      this.current.fillColor = color;
    },
    setStrokeRGBColor: function CanvasGraphics_setStrokeRGBColor(r, g, b) {
      if (!(this.current.strokeColorSpace instanceof DeviceRgbCS))
        this.current.strokeColorSpace = new DeviceRgbCS();

      var rgbColor = this.current.strokeColorSpace.getRgb(arguments, 0);
      var color = Util.makeCssRgb(rgbColor);
      this.ctx.strokeStyle = color;
      this.current.strokeColor = color;
    },
    setFillRGBColor: function CanvasGraphics_setFillRGBColor(r, g, b) {
      if (!(this.current.fillColorSpace instanceof DeviceRgbCS))
        this.current.fillColorSpace = new DeviceRgbCS();

      var rgbColor = this.current.fillColorSpace.getRgb(arguments, 0);
      var color = Util.makeCssRgb(rgbColor);
      this.ctx.fillStyle = color;
      this.current.fillColor = color;
    },
    setStrokeCMYKColor: function CanvasGraphics_setStrokeCMYKColor(c, m, y, k) {
      if (!(this.current.strokeColorSpace instanceof DeviceCmykCS))
        this.current.strokeColorSpace = new DeviceCmykCS();

      var color = Util.makeCssCmyk(arguments);
      this.ctx.strokeStyle = color;
      this.current.strokeColor = color;
    },
    setFillCMYKColor: function CanvasGraphics_setFillCMYKColor(c, m, y, k) {
      if (!(this.current.fillColorSpace instanceof DeviceCmykCS))
        this.current.fillColorSpace = new DeviceCmykCS();

      var color = Util.makeCssCmyk(arguments);
      this.ctx.fillStyle = color;
      this.current.fillColor = color;
    },

    shadingFill: function CanvasGraphics_shadingFill(patternIR) {
      var ctx = this.ctx;

      this.save();
      var pattern = Pattern.shadingFromIR(patternIR);
      ctx.fillStyle = pattern.getPattern(ctx);

      var inv = ctx.mozCurrentTransformInverse;
      if (inv) {
        var canvas = ctx.canvas;
        var width = canvas.width;
        var height = canvas.height;

        var bl = Util.applyTransform([0, 0], inv);
        var br = Util.applyTransform([0, height], inv);
        var ul = Util.applyTransform([width, 0], inv);
        var ur = Util.applyTransform([width, height], inv);

        var x0 = Math.min(bl[0], br[0], ul[0], ur[0]);
        var y0 = Math.min(bl[1], br[1], ul[1], ur[1]);
        var x1 = Math.max(bl[0], br[0], ul[0], ur[0]);
        var y1 = Math.max(bl[1], br[1], ul[1], ur[1]);

        this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      } else {
        // HACK to draw the gradient onto an infinite rectangle.
        // PDF gradients are drawn across the entire image while
        // Canvas only allows gradients to be drawn in a rectangle
        // The following bug should allow us to remove this.
        // https://bugzilla.mozilla.org/show_bug.cgi?id=664884

        this.ctx.fillRect(-1e10, -1e10, 2e10, 2e10);
      }

      this.restore();
    },

    // Images
    beginInlineImage: function CanvasGraphics_beginInlineImage() {
      error('Should not call beginInlineImage');
    },
    beginImageData: function CanvasGraphics_beginImageData() {
      error('Should not call beginImageData');
    },

    paintFormXObjectBegin: function CanvasGraphics_paintFormXObjectBegin(matrix,
                                                                        bbox) {
      this.save();
      this.current.paintFormXObjectDepth++;

      if (matrix && isArray(matrix) && 6 == matrix.length)
        this.transform.apply(this, matrix);

      if (bbox && isArray(bbox) && 4 == bbox.length) {
        var width = bbox[2] - bbox[0];
        var height = bbox[3] - bbox[1];
        this.rectangle(bbox[0], bbox[1], width, height);
        this.clip();
        this.endPath();
      }
    },

    paintFormXObjectEnd: function CanvasGraphics_paintFormXObjectEnd() {
      var depth = this.current.paintFormXObjectDepth;
      do {
        this.restore();
        // some pdf don't close all restores inside object
        // closing those for them
      } while (this.current.paintFormXObjectDepth >= depth);
    },

    beginGroup: function CanvasGraphics_beginGroup(group) {
      this.save();
      var currentCtx = this.ctx;
      // TODO non-isolated groups - according to Rik at adobe non-isolated
      // group results aren't usually that different and they even have tools
      // that ignore this setting. Notes from Rik on implmenting:
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
        info('TODO: Support non-isolated groups.');
      }

      // TODO knockout - supposedly possible with the clever use of compositing
      // modes.
      if (group.knockout) {
        TODO('Support knockout groups.');
      }

      var currentTransform = currentCtx.mozCurrentTransform;
      if (group.matrix) {
        currentCtx.transform.apply(currentCtx, group.matrix);
      }
      assert(group.bbox, 'Bounding box is required.');

      // Based on the current transform figure out how big the bounding box
      // will actually be.
      var bounds = Util.getAxialAlignedBoundingBox(
                    group.bbox,
                    currentCtx.mozCurrentTransform);
      // Use ceil in case we're between sizes so we don't create canvas that is
      // too small and make the canvas at least 1x1 pixels.
      var drawnWidth = Math.max(Math.ceil(bounds[2] - bounds[0]), 1);
      var drawnHeight = Math.max(Math.ceil(bounds[3] - bounds[1]), 1);

      var scratchCanvas = createScratchCanvas(drawnWidth, drawnHeight);
      var groupCtx = scratchCanvas.getContext('2d');
      addContextCurrentTransform(groupCtx);
      // Since we created a new canvas that is just the size of the bounding box
      // we have to translate the group ctx.
      var offsetX = bounds[0];
      var offsetY = bounds[1];
      groupCtx.translate(-offsetX, -offsetY);
      groupCtx.transform.apply(groupCtx, currentTransform);

      // Setup the current ctx so when the group is popped we draw it the right
      // location.
      currentCtx.setTransform(1, 0, 0, 1, 0, 0);
      currentCtx.translate(offsetX, offsetY);

      // The transparency group inherits all off the current graphics state
      // except the blend mode, soft mask, and alpha constants.
      copyCtxState(currentCtx, groupCtx);
      this.ctx = groupCtx;
      this.setGState([
        ['SMask', 'None'],
        ['BM', 'Normal'],
        ['ca', 1],
        ['CA', 1]
      ]);
      this.groupStack.push(currentCtx);
    },

    endGroup: function CanvasGraphics_endGroup(group) {
      var groupCtx = this.ctx;
      this.ctx = this.groupStack.pop();
      // Turn off image smoothing to avoid sub pixel interpolation which can
      // look kind of blurry for some pdfs.
      if ('imageSmoothingEnabled' in this.ctx) {
        this.ctx.imageSmoothingEnabled = false;
      } else {
        this.ctx.mozImageSmoothingEnabled = false;
      }
      this.ctx.drawImage(groupCtx.canvas, 0, 0);
      this.restore();
    },

    beginAnnotation: function CanvasGraphics_beginAnnotation(rect, transform,
                                                             matrix) {
      this.save();

      if (rect && isArray(rect) && 4 == rect.length) {
        var width = rect[2] - rect[0];
        var height = rect[3] - rect[1];
        this.rectangle(rect[0], rect[1], width, height);
        this.clip();
        this.endPath();
      }

      this.transform.apply(this, transform);
      this.transform.apply(this, matrix);
    },

    endAnnotation: function CanvasGraphics_endAnnotation() {
      this.restore();
    },

    paintJpegXObject: function CanvasGraphics_paintJpegXObject(objId, w, h) {
      var domImage = this.objs.get(objId);
      if (!domImage) {
        error('Dependent image isn\'t ready yet');
      }

      this.save();

      var ctx = this.ctx;
      // scale the image to the unit square
      ctx.scale(1 / w, -1 / h);

      ctx.drawImage(domImage, 0, 0, domImage.width, domImage.height,
                    0, -h, w, h);
      if (this.imageLayer) {
        var currentTransform = ctx.mozCurrentTransformInverse;
        var position = this.getCanvasPosition(0, 0);
        this.imageLayer.appendImage({
          objId: objId,
          left: position[0],
          top: position[1],
          width: w / currentTransform[0],
          height: h / currentTransform[3]
        });
      }
      this.restore();
    },

    paintImageMaskXObject: function CanvasGraphics_paintImageMaskXObject(
                             imgArray, inverseDecode, width, height) {
      var ctx = this.ctx;
      var glyph = this.processingType3;

      if (COMPILE_TYPE3_GLYPHS && glyph && !('compiled' in glyph)) {
        var MAX_SIZE_TO_COMPILE = 1000;
        if (width <= MAX_SIZE_TO_COMPILE && height <= MAX_SIZE_TO_COMPILE) {
          var pixels = new Uint8Array(width * height * 4);
          for (var i = 3, ii = pixels.length; i < ii; i += 4) {
            pixels[i] = 255;
          }
          applyStencilMask(imgArray, width, height, inverseDecode, pixels);
          glyph.compiled =
            compileType3Glyph({data: pixels, width: width, height: height});
        } else {
          glyph.compiled = null;
        }
      }

      if (glyph && glyph.compiled) {
        glyph.compiled(ctx);
        return;
      }


      var tmpCanvas = createScratchCanvas(width, height);
      var tmpCtx = tmpCanvas.getContext('2d');

      var fillColor = this.current.fillColor;
      tmpCtx.fillStyle = (fillColor && fillColor.hasOwnProperty('type') &&
                          fillColor.type === 'Pattern') ?
                          fillColor.getPattern(tmpCtx) : fillColor;
      tmpCtx.fillRect(0, 0, width, height);

      var imgData = tmpCtx.getImageData(0, 0, width, height);
      var pixels = imgData.data;

      applyStencilMask(imgArray, width, height, inverseDecode, pixels);

      this.paintInlineImageXObject(imgData);
    },

    paintImageMaskXObjectGroup:
      function CanvasGraphics_paintImageMaskXObjectGroup(images) {
      var ctx = this.ctx;
      var tmpCanvasWidth = 0, tmpCanvasHeight = 0, tmpCanvas, tmpCtx;
      for (var i = 0, ii = images.length; i < ii; i++) {
        var image = images[i];
        var w = image.width, h = image.height;
        if (w > tmpCanvasWidth || h > tmpCanvasHeight) {
          tmpCanvasWidth = Math.max(w, tmpCanvasWidth);
          tmpCanvasHeight = Math.max(h, tmpCanvasHeight);
          tmpCanvas = createScratchCanvas(tmpCanvasWidth, tmpCanvasHeight);
          tmpCtx = tmpCanvas.getContext('2d');

          var fillColor = this.current.fillColor;
          tmpCtx.fillStyle = (fillColor && fillColor.hasOwnProperty('type') &&
                              fillColor.type === 'Pattern') ?
                              fillColor.getPattern(tmpCtx) : fillColor;
        }
        tmpCtx.fillRect(0, 0, w, h);

        var imgData = tmpCtx.getImageData(0, 0, w, h);
        var pixels = imgData.data;

        applyStencilMask(image.data, w, h, image.inverseDecode, pixels);

        tmpCtx.putImageData(imgData, 0, 0);

        ctx.save();
        ctx.transform.apply(ctx, image.transform);
        ctx.scale(1, -1);
        ctx.drawImage(tmpCanvas, 0, 0, w, h,
                      0, -1, 1, 1);
        ctx.restore();
      }
    },

    paintImageXObject: function CanvasGraphics_paintImageXObject(objId) {
      var imgData = this.objs.get(objId);
      if (!imgData)
        error('Dependent image isn\'t ready yet');

      this.paintInlineImageXObject(imgData);
    },

    paintInlineImageXObject:
      function CanvasGraphics_paintInlineImageXObject(imgData) {
      var width = imgData.width;
      var height = imgData.height;
      var ctx = this.ctx;
      this.save();
      // scale the image to the unit square
      ctx.scale(1 / width, -1 / height);

      var currentTransform = ctx.mozCurrentTransformInverse;
      var widthScale = Math.max(Math.abs(currentTransform[0]), 1);
      var heightScale = Math.max(Math.abs(currentTransform[3]), 1);
      var tmpCanvas = createScratchCanvas(width, height);
      var tmpCtx = tmpCanvas.getContext('2d');

      if (widthScale > 2 || heightScale > 2) {
        // canvas does not resize well large images to small -- using simple
        // algorithm to perform pre-scaling
        tmpCanvas = prescaleImage(imgData.data,
                                 width, height,
                                 widthScale, heightScale);
        ctx.drawImage(tmpCanvas, 0, 0, tmpCanvas.width, tmpCanvas.height,
                                 0, -height, width, height);
      } else {
        if (typeof ImageData !== 'undefined' && imgData instanceof ImageData) {
          tmpCtx.putImageData(imgData, 0, 0);
        } else {
          putBinaryImageData(tmpCtx, imgData.data, width, height);
        }
        ctx.drawImage(tmpCanvas, 0, -height);
      }

      if (this.imageLayer) {
        var position = this.getCanvasPosition(0, -height);
        this.imageLayer.appendImage({
          imgData: imgData,
          left: position[0],
          top: position[1],
          width: width / currentTransform[0],
          height: height / currentTransform[3]
        });
      }
      this.restore();
    },

    paintInlineImageXObjectGroup:
      function CanvasGraphics_paintInlineImageXObjectGroup(imgData, map) {
      var ctx = this.ctx;
      var w = imgData.width;
      var h = imgData.height;

      var tmpCanvas = createScratchCanvas(w, h);
      var tmpCtx = tmpCanvas.getContext('2d');
      putBinaryImageData(tmpCtx, imgData.data, w, h);

      for (var i = 0, ii = map.length; i < ii; i++) {
        var entry = map[i];
        ctx.save();
        ctx.transform.apply(ctx, entry.transform);
        ctx.scale(1, -1);
        ctx.drawImage(tmpCanvas, entry.x, entry.y, entry.w, entry.h,
                      0, -1, 1, 1);
        if (this.imageLayer) {
          var position = this.getCanvasPosition(entry.x, entry.y);
          this.imageLayer.appendImage({
            imgData: imgData,
            left: position[0],
            top: position[1],
            width: w,
            height: h
          });
        }
        ctx.restore();
      }
    },

    // Marked content

    markPoint: function CanvasGraphics_markPoint(tag) {
      // TODO Marked content.
    },
    markPointProps: function CanvasGraphics_markPointProps(tag, properties) {
      // TODO Marked content.
    },
    beginMarkedContent: function CanvasGraphics_beginMarkedContent(tag) {
      // TODO Marked content.
    },
    beginMarkedContentProps: function CanvasGraphics_beginMarkedContentProps(
                                        tag, properties) {
      // TODO Marked content.
    },
    endMarkedContent: function CanvasGraphics_endMarkedContent() {
      // TODO Marked content.
    },

    // Compatibility

    beginCompat: function CanvasGraphics_beginCompat() {
      // TODO ignore undefined operators (should we do that anyway?)
    },
    endCompat: function CanvasGraphics_endCompat() {
      // TODO stop ignoring undefined operators
    },

    // Helper functions

    consumePath: function CanvasGraphics_consumePath() {
      if (this.pendingClip) {
        if (this.pendingClip == EO_CLIP) {
          if ('mozFillRule' in this.ctx) {
            this.ctx.mozFillRule = 'evenodd';
            this.ctx.clip();
            this.ctx.mozFillRule = 'nonzero';
          } else {
            try {
              this.ctx.clip('evenodd');
            } catch (ex) {
              // shouldn't really happen, but browsers might think differently
              this.ctx.clip();
            }
          }
        } else {
          this.ctx.clip();
        }
        this.pendingClip = null;
      }
      this.ctx.beginPath();
    },
    getSinglePixelWidth: function CanvasGraphics_getSinglePixelWidth(scale) {
      var inverse = this.ctx.mozCurrentTransformInverse;
      // max of the current horizontal and vertical scale
      return Math.sqrt(Math.max(
        (inverse[0] * inverse[0] + inverse[1] * inverse[1]),
        (inverse[2] * inverse[2] + inverse[3] * inverse[3])));
    },
    getCanvasPosition: function CanvasGraphics_getCanvasPosition(x, y) {
        var transform = this.ctx.mozCurrentTransform;
        return [
          transform[0] * x + transform[2] * y + transform[4],
          transform[1] * x + transform[3] * y + transform[5]
        ];
    }
  };

  return CanvasGraphics;
})();

