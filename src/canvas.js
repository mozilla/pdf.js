/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

// <canvas> contexts store most of the state we need natively.
// However, PDF needs a bit more state, which we store here.

var CanvasExtraState = (function canvasExtraState() {
  function constructor(old) {
    // Are soft masks and alpha values shapes or opacities?
    this.alphaIsShape = false;
    this.fontSize = 0;
    this.textMatrix = IDENTITY_MATRIX;
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

    this.old = old;
  }

  constructor.prototype = {
    clone: function canvasextra_clone() {
      return Object.create(this);
    },
    setCurrentPoint: function canvasextra_setCurrentPoint(x, y) {
      this.x = x;
      this.y = y;
    }
  };
  return constructor;
})();

function ScratchCanvas(width, height) {
  var canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function addContextCurrentTransform(ctx) {
  // If the context doesn't expose a `mozCurrentTransform`, add a JS based on.
  if (!ctx.mozCurrentTransform) {
    // Store the original context
    ctx._originalSave = ctx.save;
    ctx._originalRestore = ctx.restore;
    ctx._originalRotate = ctx.rotate;
    ctx._originalScale = ctx.scale;
    ctx._originalTranslate = ctx.translate;
    ctx._originalTransform = ctx.transform;

    ctx._transformMatrix = [1, 0, 0, 1, 0, 0];
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

var CanvasGraphics = (function canvasGraphics() {
  // Defines the time the executeIRQueue is going to be executing
  // before it stops and shedules a continue of execution.
  var kExecutionTime = 50;

  function constructor(canvasCtx, objs, textLayer) {
    this.ctx = canvasCtx;
    this.current = new CanvasExtraState();
    this.stateStack = [];
    this.pendingClip = null;
    this.res = null;
    this.xobjs = null;
    this.ScratchCanvas = ScratchCanvas;
    this.objs = objs;
    this.textLayer = textLayer;
    if (canvasCtx) {
      addContextCurrentTransform(canvasCtx);
    }
  }

  var LINE_CAP_STYLES = ['butt', 'round', 'square'];
  var LINE_JOIN_STYLES = ['miter', 'round', 'bevel'];
  var NORMAL_CLIP = {};
  var EO_CLIP = {};

  constructor.prototype = {
    beginDrawing: function canvasGraphicsBeginDrawing(mediaBox) {
      var cw = this.ctx.canvas.width, ch = this.ctx.canvas.height;
      this.ctx.save();
      switch (mediaBox.rotate) {
        case 0:
          this.ctx.transform(1, 0, 0, -1, 0, ch);
          break;
        case 90:
          this.ctx.transform(0, 1, 1, 0, 0, 0);
          break;
        case 180:
          this.ctx.transform(-1, 0, 0, 1, cw, 0);
          break;
        case 270:
          this.ctx.transform(0, -1, -1, 0, cw, ch);
          break;
      }
      // Scale so that canvas units are the same as PDF user space units
      this.ctx.scale(cw / mediaBox.width, ch / mediaBox.height);
      this.textDivs = [];
      this.textLayerQueue = [];
      // Prevent textLayerQueue from being rendered while rendering a new page
      if (this.textLayerTimer)
        clearTimeout(this.textLayerTimer);
    },

    executeIRQueue: function canvasGraphicsExecuteIRQueue(codeIR,
                                  executionStartIdx, continueCallback) {
      var argsArray = codeIR.argsArray;
      var fnArray = codeIR.fnArray;
      var i = executionStartIdx || 0;
      var argsArrayLen = argsArray.length;

      // Sometimes the IRQueue to execute is empty.
      if (argsArrayLen == i) {
        return i;
      }

      var executionEndIdx;
      var startTime = Date.now();

      var objs = this.objs;

      while (true) {
        if (fnArray[i] !== 'dependency') {
          this[fnArray[i]].apply(this, argsArray[i]);
        } else {
          var deps = argsArray[i];
          for (var n = 0, nn = deps.length; n < nn; n++) {
            var depObjId = deps[n];

            // If the promise isn't resolved yet, add the continueCallback
            // to the promise and bail out.
            if (!objs.isResolved(depObjId)) {
              objs.get(depObjId, continueCallback);
              return i;
            }
          }
        }
        i++;

        // If the entire IRQueue was executed, stop as were done.
        if (i == argsArrayLen) {
          return i;
        }

        // If the execution took longer then a certain amount of time, shedule
        // to continue exeution after a short delay.
        // However, this is only possible if a 'continueCallback' is passed in.
        if (continueCallback && (Date.now() - startTime) > kExecutionTime) {
          setTimeout(continueCallback, 0);
          return i;
        }

        // If the IRQueue isn't executed completly yet OR the execution time
        // was short enough, do another execution round.
      }
    },

    endDrawing: function canvasGraphicsEndDrawing() {
      this.ctx.restore();

      var textLayer = this.textLayer;
      if (!textLayer)
        return;

      var self = this;
      var renderTextLayer = function canvasRenderTextLayer() {
        var textDivs = self.textDivs;
        for (var i = 0, length = textDivs.length; i < length; ++i) {
          if (textDivs[i].dataset.textLength > 1) { // avoid div by zero
            textLayer.appendChild(textDivs[i]);
            // Adjust div width (via letterSpacing) to match canvas text
            // Due to the .offsetWidth calls, this is slow
            textDivs[i].style.letterSpacing =
              ((textDivs[i].dataset.canvasWidth - textDivs[i].offsetWidth) /
               (textDivs[i].dataset.textLength - 1)) + 'px';
          }
        }
      }
      var textLayerQueue = this.textLayerQueue;
      textLayerQueue.push(renderTextLayer);

      // Lazy textLayer rendering (to prevent UI hangs)
      // Only render queue if activity has stopped, where "no activity" ==
      // "no beginDrawing() calls in the last N ms"
      this.textLayerTimer = setTimeout(function renderTextLayerQueue() {
        // Render most recent (==most relevant) layers first
        for (var i = textLayerQueue.length - 1; i >= 0; i--) {
          textLayerQueue.pop().call();
        }
      }, 500);
    },

    // Graphics state
    setLineWidth: function canvasGraphicsSetLineWidth(width) {
      this.ctx.lineWidth = width;
    },
    setLineCap: function canvasGraphicsSetLineCap(style) {
      this.ctx.lineCap = LINE_CAP_STYLES[style];
    },
    setLineJoin: function canvasGraphicsSetLineJoin(style) {
      this.ctx.lineJoin = LINE_JOIN_STYLES[style];
    },
    setMiterLimit: function canvasGraphicsSetMiterLimit(limit) {
      this.ctx.miterLimit = limit;
    },
    setDash: function canvasGraphicsSetDash(dashArray, dashPhase) {
      this.ctx.mozDash = dashArray;
      this.ctx.mozDashOffset = dashPhase;
    },
    setRenderingIntent: function canvasGraphicsSetRenderingIntent(intent) {
      TODO('set rendering intent: ' + intent);
    },
    setFlatness: function canvasGraphicsSetFlatness(flatness) {
      TODO('set flatness: ' + flatness);
    },
    setGState: function canvasGraphicsSetGState(states) {
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
        }
      }
    },
    save: function canvasGraphicsSave() {
      this.ctx.save();
      var old = this.current;
      this.stateStack.push(old);
      this.current = old.clone();
    },
    restore: function canvasGraphicsRestore() {
      var prev = this.stateStack.pop();
      if (prev) {
        this.current = prev;
        this.ctx.restore();
      }
    },
    transform: function canvasGraphicsTransform(a, b, c, d, e, f) {
      this.ctx.transform(a, b, c, d, e, f);
    },

    // Path
    moveTo: function canvasGraphicsMoveTo(x, y) {
      this.ctx.moveTo(x, y);
      this.current.setCurrentPoint(x, y);
    },
    lineTo: function canvasGraphicsLineTo(x, y) {
      this.ctx.lineTo(x, y);
      this.current.setCurrentPoint(x, y);
    },
    curveTo: function canvasGraphicsCurveTo(x1, y1, x2, y2, x3, y3) {
      this.ctx.bezierCurveTo(x1, y1, x2, y2, x3, y3);
      this.current.setCurrentPoint(x3, y3);
    },
    curveTo2: function canvasGraphicsCurveTo2(x2, y2, x3, y3) {
      var current = this.current;
      this.ctx.bezierCurveTo(current.x, current.y, x2, y2, x3, y3);
      current.setCurrentPoint(x3, y3);
    },
    curveTo3: function canvasGraphicsCurveTo3(x1, y1, x3, y3) {
      this.curveTo(x1, y1, x3, y3, x3, y3);
      this.current.setCurrentPoint(x3, y3);
    },
    closePath: function canvasGraphicsClosePath() {
      this.ctx.closePath();
    },
    rectangle: function canvasGraphicsRectangle(x, y, width, height) {
      this.ctx.rect(x, y, width, height);
    },
    stroke: function canvasGraphicsStroke(consumePath) {
      consumePath = typeof consumePath !== 'undefined' ? consumePath : true;
      var ctx = this.ctx;
      var strokeColor = this.current.strokeColor;
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
    closeStroke: function canvasGraphicsCloseStroke() {
      this.closePath();
      this.stroke();
    },
    fill: function canvasGraphicsFill(consumePath) {
      consumePath = typeof consumePath !== 'undefined' ? consumePath : true;
      var ctx = this.ctx;
      var fillColor = this.current.fillColor;

      if (fillColor && fillColor.hasOwnProperty('type') &&
          fillColor.type === 'Pattern') {
        ctx.save();
        ctx.fillStyle = fillColor.getPattern(ctx);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fill();
      }
      if (consumePath)
        this.consumePath();
    },
    eoFill: function canvasGraphicsEoFill() {
      var savedFillRule = this.setEOFillRule();
      this.fill();
      this.restoreFillRule(savedFillRule);
    },
    fillStroke: function canvasGraphicsFillStroke() {
      this.fill(false);
      this.stroke(false);

      this.consumePath();
    },
    eoFillStroke: function canvasGraphicsEoFillStroke() {
      var savedFillRule = this.setEOFillRule();
      this.fillStroke();
      this.restoreFillRule(savedFillRule);
    },
    closeFillStroke: function canvasGraphicsCloseFillStroke() {
      this.closePath();
      this.fillStroke();
    },
    closeEOFillStroke: function canvasGraphicsCloseEOFillStroke() {
      var savedFillRule = this.setEOFillRule();
      this.closePath();
      this.fillStroke();
      this.restoreFillRule(savedFillRule);
    },
    endPath: function canvasGraphicsEndPath() {
      this.consumePath();
    },

    // Clipping
    clip: function canvasGraphicsClip() {
      this.pendingClip = NORMAL_CLIP;
    },
    eoClip: function canvasGraphicsEoClip() {
      this.pendingClip = EO_CLIP;
    },

    // Text
    beginText: function canvasGraphicsBeginText() {
      this.current.textMatrix = IDENTITY_MATRIX;
      this.current.x = this.current.lineX = 0;
      this.current.y = this.current.lineY = 0;
    },
    endText: function canvasGraphicsEndText() {
    },
    setCharSpacing: function canvasGraphicsSetCharSpacing(spacing) {
      this.current.charSpacing = spacing;
    },
    setWordSpacing: function canvasGraphicsSetWordSpacing(spacing) {
      this.current.wordSpacing = spacing;
    },
    setHScale: function canvasGraphicsSetHScale(scale) {
      this.current.textHScale = scale / 100;
    },
    setLeading: function canvasGraphicsSetLeading(leading) {
      this.current.leading = -leading;
    },
    setFont: function canvasGraphicsSetFont(fontRefName, size) {
      var fontObj = this.objs.get(fontRefName).fontObj;

      if (!fontObj) {
        throw 'Can\'t find font for ' + fontRefName;
      }

      var name = fontObj.loadedName || 'sans-serif';

      this.current.font = fontObj;
      this.current.fontSize = size;

      var name = fontObj.loadedName || 'sans-serif';
      var bold = fontObj.black ? (fontObj.bold ? 'bolder' : 'bold') :
                                 (fontObj.bold ? 'bold' : 'normal');

      var italic = fontObj.italic ? 'italic' : 'normal';
      var serif = fontObj.serif ? 'serif' : 'sans-serif';
      var typeface = '"' + name + '", ' + serif;
      var rule = italic + ' ' + bold + ' ' + size + 'px ' + typeface;
      this.ctx.font = rule;
    },
    setTextRenderingMode: function canvasGraphicsSetTextRenderingMode(mode) {
      TODO('text rendering mode: ' + mode);
    },
    setTextRise: function canvasGraphicsSetTextRise(rise) {
      TODO('text rise: ' + rise);
    },
    moveText: function canvasGraphicsMoveText(x, y) {
      this.current.x = this.current.lineX += x;
      this.current.y = this.current.lineY += y;
    },
    setLeadingMoveText: function canvasGraphicsSetLeadingMoveText(x, y) {
      this.setLeading(-y);
      this.moveText(x, y);
    },
    setTextMatrix: function canvasGraphicsSetTextMatrix(a, b, c, d, e, f) {
      this.current.textMatrix = [a, b, c, d, e, f];

      this.current.x = this.current.lineX = 0;
      this.current.y = this.current.lineY = 0;
    },
    nextLine: function canvasGraphicsNextLine() {
      this.moveText(0, this.current.leading);
    },
    applyTextTransforms: function canvasApplyTransforms() {
      var ctx = this.ctx;
      var current = this.current;
      var textHScale = current.textHScale;
      var fontMatrix = current.font.fontMatrix || IDENTITY_MATRIX;

      ctx.transform.apply(ctx, current.textMatrix);
      ctx.scale(1, -1);
      ctx.translate(current.x, -1 * current.y);
      ctx.transform.apply(ctx, fontMatrix);
      ctx.scale(textHScale, 1);
    },
    getTextGeometry: function canvasGetTextGeometry() {
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
      var spaceGlyph = font.charsToGlyphs(' ');

      // Hack (sometimes space is not encoded)
      if (spaceGlyph.length === 0 || spaceGlyph[0].width === 0)
        spaceGlyph = font.charsToGlyphs('i');

      // Fallback
      if (spaceGlyph.length === 0 || spaceGlyph[0].width === 0)
        spaceGlyph = [{width: 0}];

      geometry.spaceWidth = spaceGlyph[0].width;
      return geometry;
    },

    pushTextDivs: function canvasGraphicsPushTextDivs(text) {
      var div = document.createElement('div');
      var fontSize = this.current.fontSize;

      // vScale and hScale already contain the scaling to pixel units
      // as mozCurrentTransform reflects ctx.scale() changes
      // (see beginDrawing())
      var fontHeight = fontSize * text.geom.vScale;
      div.dataset.canvasWidth = text.canvasWidth * text.geom.hScale;

      div.style.fontSize = fontHeight + 'px';
      div.style.fontFamily = this.current.font.loadedName || 'sans-serif';
      div.style.left = text.geom.x + 'px';
      div.style.top = (text.geom.y - fontHeight) + 'px';
      div.innerHTML = text.str;
      div.dataset.textLength = text.length;
      this.textDivs.push(div);
    },
    showText: function canvasGraphicsShowText(str, skipTextSelection) {
      var ctx = this.ctx;
      var current = this.current;
      var font = current.font;
      var glyphs = font.charsToGlyphs(str);
      var fontSize = current.fontSize;
      var charSpacing = current.charSpacing;
      var wordSpacing = current.wordSpacing;
      var textHScale = current.textHScale;
      var fontMatrix = font.fontMatrix || IDENTITY_MATRIX;
      var textHScale2 = textHScale * fontMatrix[0];
      var glyphsLength = glyphs.length;
      var textLayer = this.textLayer;
      var text = {str: '', length: 0, canvasWidth: 0, geom: {}};
      var textSelection = textLayer && !skipTextSelection ? true : false;

      if (textSelection) {
        ctx.save();
        this.applyTextTransforms();
        text.geom = this.getTextGeometry();
        ctx.restore();
      }

      // Type3 fonts - each glyph is a "mini-PDF"
      if (font.coded) {
        ctx.save();
        ctx.transform.apply(ctx, current.textMatrix);
        ctx.translate(current.x, current.y);

        ctx.scale(textHScale, 1);
        for (var i = 0; i < glyphsLength; ++i) {

          var glyph = glyphs[i];
          if (glyph === null) {
            // word break
            this.ctx.translate(wordSpacing, 0);
            continue;
          }

          this.save();
          ctx.scale(fontSize, fontSize);
          ctx.transform.apply(ctx, fontMatrix);
          this.executeIRQueue(glyph.codeIRQueue);
          this.restore();

          var transformed = Util.applyTransform([glyph.width, 0], fontMatrix);
          var width = transformed[0] * fontSize + charSpacing;

          ctx.translate(width, 0);
          current.x += width * textHScale2;

          text.str += glyph.unicode;
          text.length++;
          text.canvasWidth += width;
        }
        ctx.restore();
      } else {
        ctx.save();
        this.applyTextTransforms();

        var width = 0;
        for (var i = 0; i < glyphsLength; ++i) {
          var glyph = glyphs[i];
          if (glyph === null) {
            // word break
            width += wordSpacing;
            continue;
          }

          var char = glyph.fontChar;
          var charWidth = glyph.width * fontSize * 0.001 + charSpacing;
          ctx.fillText(char, width, 0);
          width += charWidth;

          text.str += glyph.unicode === ' ' ? '&nbsp;' : glyph.unicode;
          text.length++;
          text.canvasWidth += charWidth;
        }
        current.x += width * textHScale2;
        ctx.restore();
      }

      if (textSelection)
        this.pushTextDivs(text);

      return text;
    },
    showSpacedText: function canvasGraphicsShowSpacedText(arr) {
      var ctx = this.ctx;
      var current = this.current;
      var fontSize = current.fontSize;
      var textHScale2 = current.textHScale *
        (current.font.fontMatrix || IDENTITY_MATRIX)[0];
      var arrLength = arr.length;
      var textLayer = this.textLayer;
      var font = current.font;
      var text = {str: '', length: 0, canvasWidth: 0, geom: {}};
      var textSelection = textLayer ? true : false;

      if (textSelection) {
        ctx.save();
        this.applyTextTransforms();
        text.geom = this.getTextGeometry();
        ctx.restore();
      }

      for (var i = 0; i < arrLength; ++i) {
        var e = arr[i];
        if (isNum(e)) {
          var spacingLength = -e * 0.001 * fontSize * textHScale2;
          current.x += spacingLength;

          if (textSelection) {
            // Emulate precise spacing via HTML spaces
            text.canvasWidth += spacingLength;
            if (e < 0 && text.geom.spaceWidth > 0) { // avoid div by zero
              var numFakeSpaces = Math.round(-e / text.geom.spaceWidth);
              for (var j = 0; j < numFakeSpaces; ++j)
                text.str += '&nbsp;';
              text.length += numFakeSpaces > 0 ? 1 : 0;
            }
          }
        } else if (isString(e)) {
          var shownText = this.showText(e, true);

          if (textSelection) {
            if (shownText.str === ' ') {
              text.str += '&nbsp;';
            } else {
              text.str += shownText.str;
            }
            text.canvasWidth += shownText.canvasWidth;
            text.length += e.length;
          }
        } else {
          malformed('TJ array element ' + e + ' is not string or num');
        }
      }

      if (textSelection)
        this.pushTextDivs(text);
    },
    nextLineShowText: function canvasGraphicsNextLineShowText(text) {
      this.nextLine();
      this.showText(text);
    },
    nextLineSetSpacingShowText:
      function canvasGraphicsNextLineSetSpacingShowText(wordSpacing,
                                                        charSpacing,
                                                        text) {
      this.setWordSpacing(wordSpacing);
      this.setCharSpacing(charSpacing);
      this.nextLineShowText(text);
    },

    // Type3 fonts
    setCharWidth: function canvasGraphicsSetCharWidth(xWidth, yWidth) {
      // We can safely ignore this since the width should be the same
      // as the width in the Widths array.
    },
    setCharWidthAndBounds: function canvasGraphicsSetCharWidthAndBounds(xWidth,
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
    setStrokeColorSpace: function canvasGraphicsSetStrokeColorSpace(raw) {
      this.current.strokeColorSpace = ColorSpace.fromIR(raw);
    },
    setFillColorSpace: function canvasGraphicsSetFillColorSpace(raw) {
      this.current.fillColorSpace = ColorSpace.fromIR(raw);
    },
    setStrokeColor: function canvasGraphicsSetStrokeColor(/*...*/) {
      var cs = this.current.strokeColorSpace;
      var color = cs.getRgb(arguments);
      var color = Util.makeCssRgb.apply(null, cs.getRgb(arguments));
      this.ctx.strokeStyle = color;
      this.current.strokeColor = color;
    },
    getColorN_IR_Pattern: function canvasGraphicsGetColorN_IR_Pattern(IR, cs) {
      if (IR[0] == 'TilingPattern') {
        var args = IR[1];
        var base = cs.base;
        var color;
        if (base) {
          var baseComps = base.numComps;

          color = [];
          for (var i = 0; i < baseComps; ++i)
            color.push(args[i]);

          color = base.getRgb(color);
        }
        var pattern = new TilingPattern(IR, color, this.ctx, this.objs);
      } else if (IR[0] == 'RadialAxial' || IR[0] == 'Dummy') {
        var pattern = Pattern.shadingFromIR(this.ctx, IR);
      } else {
        throw 'Unkown IR type';
      }
      return pattern;
    },
    setStrokeColorN_IR: function canvasGraphicsSetStrokeColorN(/*...*/) {
      var cs = this.current.strokeColorSpace;

      if (cs.name == 'Pattern') {
        this.current.strokeColor = this.getColorN_IR_Pattern(arguments, cs);
      } else {
        this.setStrokeColor.apply(this, arguments);
      }
    },
    setFillColor: function canvasGraphicsSetFillColor(/*...*/) {
      var cs = this.current.fillColorSpace;
      var color = Util.makeCssRgb.apply(null, cs.getRgb(arguments));
      this.ctx.fillStyle = color;
      this.current.fillColor = color;
    },
    setFillColorN_IR: function canvasGraphicsSetFillColorN(/*...*/) {
      var cs = this.current.fillColorSpace;

      if (cs.name == 'Pattern') {
        this.current.fillColor = this.getColorN_IR_Pattern(arguments, cs);
      } else {
        this.setFillColor.apply(this, arguments);
      }
    },
    setStrokeGray: function canvasGraphicsSetStrokeGray(gray) {
      if (!(this.current.strokeColorSpace instanceof DeviceGrayCS))
        this.current.strokeColorSpace = new DeviceGrayCS();

      var color = Util.makeCssRgb(gray, gray, gray);
      this.ctx.strokeStyle = color;
      this.current.strokeColor = color;
    },
    setFillGray: function canvasGraphicsSetFillGray(gray) {
      if (!(this.current.fillColorSpace instanceof DeviceGrayCS))
        this.current.fillColorSpace = new DeviceGrayCS();

      var color = Util.makeCssRgb(gray, gray, gray);
      this.ctx.fillStyle = color;
      this.current.fillColor = color;
    },
    setStrokeRGBColor: function canvasGraphicsSetStrokeRGBColor(r, g, b) {
      if (!(this.current.strokeColorSpace instanceof DeviceRgbCS))
        this.current.strokeColorSpace = new DeviceRgbCS();

      var color = Util.makeCssRgb(r, g, b);
      this.ctx.strokeStyle = color;
      this.current.strokeColor = color;
    },
    setFillRGBColor: function canvasGraphicsSetFillRGBColor(r, g, b) {
      if (!(this.current.fillColorSpace instanceof DeviceRgbCS))
        this.current.fillColorSpace = new DeviceRgbCS();

      var color = Util.makeCssRgb(r, g, b);
      this.ctx.fillStyle = color;
      this.current.fillColor = color;
    },
    setStrokeCMYKColor: function canvasGraphicsSetStrokeCMYKColor(c, m, y, k) {
      if (!(this.current.strokeColorSpace instanceof DeviceCmykCS))
        this.current.strokeColorSpace = new DeviceCmykCS();

      var color = Util.makeCssCmyk(c, m, y, k);
      this.ctx.strokeStyle = color;
      this.current.strokeColor = color;
    },
    setFillCMYKColor: function canvasGraphicsSetFillCMYKColor(c, m, y, k) {
      if (!(this.current.fillColorSpace instanceof DeviceCmykCS))
        this.current.fillColorSpace = new DeviceCmykCS();

      var color = Util.makeCssCmyk(c, m, y, k);
      this.ctx.fillStyle = color;
      this.current.fillColor = color;
    },

    shadingFill: function canvasGraphicsShadingFill(patternIR) {
      var ctx = this.ctx;

      this.save();
      ctx.fillStyle = Pattern.shadingFromIR(ctx, patternIR);

      var inv = ctx.mozCurrentTransformInverse;
      if (inv) {
        var canvas = ctx.canvas;
        var width = canvas.width;
        var height = canvas.height;

        var bl = Util.applyTransform([0, 0], inv);
        var br = Util.applyTransform([0, width], inv);
        var ul = Util.applyTransform([height, 0], inv);
        var ur = Util.applyTransform([height, width], inv);

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
    beginInlineImage: function canvasGraphicsBeginInlineImage() {
      error('Should not call beginInlineImage');
    },
    beginImageData: function canvasGraphicsBeginImageData() {
      error('Should not call beginImageData');
    },

    paintFormXObjectBegin: function canvasGraphicsPaintFormXObjectBegin(matrix,
                                                                        bbox) {
      this.save();

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

    paintFormXObjectEnd: function canvasGraphicsPaintFormXObjectEnd() {
      this.restore();
    },

    paintJpegXObject: function canvasGraphicsPaintJpegXObject(objId, w, h) {
      var image = this.objs.get(objId);
      if (!image) {
        error('Dependent image isn\'t ready yet');
      }

      this.save();

      var ctx = this.ctx;
      // scale the image to the unit square
      ctx.scale(1 / w, -1 / h);

      var domImage = image.getImage();
      ctx.drawImage(domImage, 0, 0, domImage.width, domImage.height,
                    0, -h, w, h);

      this.restore();
    },

    paintImageMaskXObject: function canvasGraphicsPaintImageMaskXObject(
                             imgArray, inverseDecode, width, height) {
      function applyStencilMask(buffer, inverseDecode) {
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
            if (!(buf & mask) == inverseDecode) {
              buffer[bufferPos] = 0;
            }
            bufferPos += 4;
            mask >>= 1;
          }
        }
      }

      this.save();

      var ctx = this.ctx;
      var w = width, h = height;
      // scale the image to the unit square
      ctx.scale(1 / w, -1 / h);

      var tmpCanvas = new this.ScratchCanvas(w, h);
      var tmpCtx = tmpCanvas.getContext('2d');

      var fillColor = this.current.fillColor;
      tmpCtx.fillStyle = (fillColor && fillColor.hasOwnProperty('type') &&
                          fillColor.type === 'Pattern') ?
                          fillColor.getPattern(tmpCtx) : fillColor;
      tmpCtx.fillRect(0, 0, w, h);

      var imgData = tmpCtx.getImageData(0, 0, w, h);
      var pixels = imgData.data;

      applyStencilMask(pixels, inverseDecode);

      tmpCtx.putImageData(imgData, 0, 0);
      ctx.drawImage(tmpCanvas, 0, -h);
      this.restore();
    },

    paintImageXObject: function canvasGraphicsPaintImageXObject(imgData) {
      this.save();
      var ctx = this.ctx;
      var w = imgData.width;
      var h = imgData.height;
      // scale the image to the unit square
      ctx.scale(1 / w, -1 / h);

      var tmpCanvas = new this.ScratchCanvas(w, h);
      var tmpCtx = tmpCanvas.getContext('2d');
      var tmpImgData;

      // Some browsers can set an UInt8Array directly as imageData, some
      // can't. As long as we don't have proper feature detection, just
      // copy over each pixel and set the imageData that way.
      tmpImgData = tmpCtx.getImageData(0, 0, w, h);

      // Copy over the imageData.
      var tmpImgDataPixels = tmpImgData.data;
      var len = tmpImgDataPixels.length;

      while (len--) {
        tmpImgDataPixels[len] = imgData.data[len];
      }

      tmpCtx.putImageData(tmpImgData, 0, 0);
      ctx.drawImage(tmpCanvas, 0, -h);
      this.restore();
    },

    // Marked content

    markPoint: function canvasGraphicsMarkPoint(tag) {
      TODO('Marked content');
    },
    markPointProps: function canvasGraphicsMarkPointProps(tag, properties) {
      TODO('Marked content');
    },
    beginMarkedContent: function canvasGraphicsBeginMarkedContent(tag) {
      TODO('Marked content');
    },
    beginMarkedContentProps:
      function canvasGraphicsBeginMarkedContentProps(tag, properties) {
      TODO('Marked content');
    },
    endMarkedContent: function canvasGraphicsEndMarkedContent() {
      TODO('Marked content');
    },

    // Compatibility

    beginCompat: function canvasGraphicsBeginCompat() {
      TODO('ignore undefined operators (should we do that anyway?)');
    },
    endCompat: function canvasGraphicsEndCompat() {
      TODO('stop ignoring undefined operators');
    },

    // Helper functions

    consumePath: function canvasGraphicsConsumePath() {
      if (this.pendingClip) {
        var savedFillRule = null;
        if (this.pendingClip == EO_CLIP)
          savedFillRule = this.setEOFillRule();

        this.ctx.clip();

        this.pendingClip = null;
        if (savedFillRule !== null)
          this.restoreFillRule(savedFillRule);
      }
      this.ctx.beginPath();
    },
    // We generally keep the canvas context set for
    // nonzero-winding, and just set evenodd for the operations
    // that need them.
    setEOFillRule: function canvasGraphicsSetEOFillRule() {
      var savedFillRule = this.ctx.mozFillRule;
      this.ctx.mozFillRule = 'evenodd';
      return savedFillRule;
    },
    restoreFillRule: function canvasGraphicsRestoreFillRule(rule) {
      this.ctx.mozFillRule = rule;
    }
  };

  return constructor;
})();

