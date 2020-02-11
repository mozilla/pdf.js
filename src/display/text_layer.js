/* Copyright 2015 Mozilla Foundation
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
  AbortException,
  createPromiseCapability,
  Util,
} from "../shared/util.js";

/**
 * Text layer render parameters.
 *
 * @typedef {Object} TextLayerRenderParameters
 * @property {TextContent} [textContent] - Text content to render (the object
 *   is returned by the page's `getTextContent` method).
 * @property {ReadableStream} [textContentStream] - Text content stream to
 *   render (the stream is returned by the page's `streamTextContent` method).
 * @property {HTMLElement} container - HTML element that will contain text runs.
 * @property {PageViewport} viewport - The target viewport to properly
 *   layout the text runs.
 * @property {Array} [textDivs] - HTML elements that are correspond to the
 *   text items of the textContent input. This is output and shall be
 *   initially be set to empty array.
 * @property {Array} [textContentItemsStr] - Strings that correspond to the
 *   `str` property of the text items of textContent input. This is output
 *   and shall be initially be set to empty array.
 * @property {number} [timeout] - Delay in milliseconds before rendering of the
 *   text runs occurs.
 * @property {boolean} [enhanceTextSelection] - Whether to turn on the text
 *   selection enhancement.
 */
var renderTextLayer = (function renderTextLayerClosure() {
  var MAX_TEXT_DIVS_TO_RENDER = 100000;

  var NonWhitespaceRegexp = /\S/;

  function isAllWhitespace(str) {
    return !NonWhitespaceRegexp.test(str);
  }

  function appendText(task, geom, styles) {
    // Initialize all used properties to keep the caches monomorphic.
    var textDiv = document.createElement("span");
    var textDivProperties = {
      angle: 0,
      canvasWidth: 0,
      isWhitespace: false,
      originalTransform: null,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: 0,
      scale: 1,
    };

    task._textDivs.push(textDiv);
    if (isAllWhitespace(geom.str)) {
      textDivProperties.isWhitespace = true;
      task._textDivProperties.set(textDiv, textDivProperties);
      return;
    }

    var tx = Util.transform(task._viewport.transform, geom.transform);
    var angle = Math.atan2(tx[1], tx[0]);
    var style = styles[geom.fontName];
    if (style.vertical) {
      angle += Math.PI / 2;
    }
    var fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
    var fontAscent = fontHeight;
    if (style.ascent) {
      fontAscent = style.ascent * fontAscent;
    } else if (style.descent) {
      fontAscent = (1 + style.descent) * fontAscent;
    }

    let left, top;
    if (angle === 0) {
      left = tx[4];
      top = tx[5] - fontAscent;
    } else {
      left = tx[4] + fontAscent * Math.sin(angle);
      top = tx[5] - fontAscent * Math.cos(angle);
    }
    // Setting the style properties individually, rather than all at once,
    // should be OK since the `textDiv` isn't appended to the document yet.
    textDiv.style.left = `${left}px`;
    textDiv.style.top = `${top}px`;
    textDiv.style.fontSize = `${fontHeight}px`;
    textDiv.style.fontFamily = style.fontFamily;

    textDiv.textContent = geom.str;
    // `fontName` is only used by the FontInspector, and we only use `dataset`
    // here to make the font name available in the debugger.
    if (task._fontInspectorEnabled) {
      textDiv.dataset.fontName = geom.fontName;
    }
    if (angle !== 0) {
      textDivProperties.angle = angle * (180 / Math.PI);
    }
    // We don't bother scaling single-char text divs, because it has very
    // little effect on text highlighting. This makes scrolling on docs with
    // lots of such divs a lot faster.
    if (geom.str.length > 1) {
      if (style.vertical) {
        textDivProperties.canvasWidth = geom.height * task._viewport.scale;
      } else {
        textDivProperties.canvasWidth = geom.width * task._viewport.scale;
      }
    }
    task._textDivProperties.set(textDiv, textDivProperties);
    if (task._textContentStream) {
      task._layoutText(textDiv);
    }

    if (task._enhanceTextSelection) {
      var angleCos = 1,
        angleSin = 0;
      if (angle !== 0) {
        angleCos = Math.cos(angle);
        angleSin = Math.sin(angle);
      }
      var divWidth =
        (style.vertical ? geom.height : geom.width) * task._viewport.scale;
      var divHeight = fontHeight;

      var m, b;
      if (angle !== 0) {
        m = [angleCos, angleSin, -angleSin, angleCos, left, top];
        b = Util.getAxialAlignedBoundingBox([0, 0, divWidth, divHeight], m);
      } else {
        b = [left, top, left + divWidth, top + divHeight];
      }

      task._bounds.push({
        left: b[0],
        top: b[1],
        right: b[2],
        bottom: b[3],
        div: textDiv,
        size: [divWidth, divHeight],
        m,
      });
    }
  }

  function render(task) {
    if (task._canceled) {
      return;
    }
    var textDivs = task._textDivs;
    var capability = task._capability;
    var textDivsLength = textDivs.length;

    // No point in rendering many divs as it would make the browser
    // unusable even after the divs are rendered.
    if (textDivsLength > MAX_TEXT_DIVS_TO_RENDER) {
      task._renderingDone = true;
      capability.resolve();
      return;
    }

    if (!task._textContentStream) {
      for (var i = 0; i < textDivsLength; i++) {
        task._layoutText(textDivs[i]);
      }
    }

    task._renderingDone = true;
    capability.resolve();
  }

  function expand(task) {
    var bounds = task._bounds;
    var viewport = task._viewport;

    var expanded = expandBounds(viewport.width, viewport.height, bounds);
    for (var i = 0; i < expanded.length; i++) {
      var div = bounds[i].div;
      var divProperties = task._textDivProperties.get(div);
      if (divProperties.angle === 0) {
        divProperties.paddingLeft = bounds[i].left - expanded[i].left;
        divProperties.paddingTop = bounds[i].top - expanded[i].top;
        divProperties.paddingRight = expanded[i].right - bounds[i].right;
        divProperties.paddingBottom = expanded[i].bottom - bounds[i].bottom;
        task._textDivProperties.set(div, divProperties);
        continue;
      }
      // Box is rotated -- trying to find padding so rotated div will not
      // exceed its expanded bounds.
      var e = expanded[i],
        b = bounds[i];
      var m = b.m,
        c = m[0],
        s = m[1];
      // Finding intersections with expanded box.
      var points = [[0, 0], [0, b.size[1]], [b.size[0], 0], b.size];
      var ts = new Float64Array(64);
      points.forEach(function(p, i) {
        var t = Util.applyTransform(p, m);
        ts[i + 0] = c && (e.left - t[0]) / c;
        ts[i + 4] = s && (e.top - t[1]) / s;
        ts[i + 8] = c && (e.right - t[0]) / c;
        ts[i + 12] = s && (e.bottom - t[1]) / s;

        ts[i + 16] = s && (e.left - t[0]) / -s;
        ts[i + 20] = c && (e.top - t[1]) / c;
        ts[i + 24] = s && (e.right - t[0]) / -s;
        ts[i + 28] = c && (e.bottom - t[1]) / c;

        ts[i + 32] = c && (e.left - t[0]) / -c;
        ts[i + 36] = s && (e.top - t[1]) / -s;
        ts[i + 40] = c && (e.right - t[0]) / -c;
        ts[i + 44] = s && (e.bottom - t[1]) / -s;

        ts[i + 48] = s && (e.left - t[0]) / s;
        ts[i + 52] = c && (e.top - t[1]) / -c;
        ts[i + 56] = s && (e.right - t[0]) / s;
        ts[i + 60] = c && (e.bottom - t[1]) / -c;
      });
      var findPositiveMin = function(ts, offset, count) {
        var result = 0;
        for (var i = 0; i < count; i++) {
          var t = ts[offset++];
          if (t > 0) {
            result = result ? Math.min(t, result) : t;
          }
        }
        return result;
      };
      // Not based on math, but to simplify calculations, using cos and sin
      // absolute values to not exceed the box (it can but insignificantly).
      var boxScale = 1 + Math.min(Math.abs(c), Math.abs(s));
      divProperties.paddingLeft = findPositiveMin(ts, 32, 16) / boxScale;
      divProperties.paddingTop = findPositiveMin(ts, 48, 16) / boxScale;
      divProperties.paddingRight = findPositiveMin(ts, 0, 16) / boxScale;
      divProperties.paddingBottom = findPositiveMin(ts, 16, 16) / boxScale;
      task._textDivProperties.set(div, divProperties);
    }
  }

  function expandBounds(width, height, boxes) {
    var bounds = boxes.map(function(box, i) {
      return {
        x1: box.left,
        y1: box.top,
        x2: box.right,
        y2: box.bottom,
        index: i,
        x1New: undefined,
        x2New: undefined,
      };
    });
    expandBoundsLTR(width, bounds);
    var expanded = new Array(boxes.length);
    bounds.forEach(function(b) {
      var i = b.index;
      expanded[i] = {
        left: b.x1New,
        top: 0,
        right: b.x2New,
        bottom: 0,
      };
    });

    // Rotating on 90 degrees and extending extended boxes. Reusing the bounds
    // array and objects.
    boxes.map(function(box, i) {
      var e = expanded[i],
        b = bounds[i];
      b.x1 = box.top;
      b.y1 = width - e.right;
      b.x2 = box.bottom;
      b.y2 = width - e.left;
      b.index = i;
      b.x1New = undefined;
      b.x2New = undefined;
    });
    expandBoundsLTR(height, bounds);

    bounds.forEach(function(b) {
      var i = b.index;
      expanded[i].top = b.x1New;
      expanded[i].bottom = b.x2New;
    });
    return expanded;
  }

  function expandBoundsLTR(width, bounds) {
    // Sorting by x1 coordinate and walk by the bounds in the same order.
    bounds.sort(function(a, b) {
      return a.x1 - b.x1 || a.index - b.index;
    });

    // First we see on the horizon is a fake boundary.
    var fakeBoundary = {
      x1: -Infinity,
      y1: -Infinity,
      x2: 0,
      y2: Infinity,
      index: -1,
      x1New: 0,
      x2New: 0,
    };
    var horizon = [
      {
        start: -Infinity,
        end: Infinity,
        boundary: fakeBoundary,
      },
    ];

    bounds.forEach(function(boundary) {
      // Searching for the affected part of horizon.
      // TODO red-black tree or simple binary search
      var i = 0;
      while (i < horizon.length && horizon[i].end <= boundary.y1) {
        i++;
      }
      var j = horizon.length - 1;
      while (j >= 0 && horizon[j].start >= boundary.y2) {
        j--;
      }

      var horizonPart, affectedBoundary;
      var q,
        k,
        maxXNew = -Infinity;
      for (q = i; q <= j; q++) {
        horizonPart = horizon[q];
        affectedBoundary = horizonPart.boundary;
        var xNew;
        if (affectedBoundary.x2 > boundary.x1) {
          // In the middle of the previous element, new x shall be at the
          // boundary start. Extending if further if the affected boundary
          // placed on top of the current one.
          xNew =
            affectedBoundary.index > boundary.index
              ? affectedBoundary.x1New
              : boundary.x1;
        } else if (affectedBoundary.x2New === undefined) {
          // We have some space in between, new x in middle will be a fair
          // choice.
          xNew = (affectedBoundary.x2 + boundary.x1) / 2;
        } else {
          // Affected boundary has x2new set, using it as new x.
          xNew = affectedBoundary.x2New;
        }
        if (xNew > maxXNew) {
          maxXNew = xNew;
        }
      }

      // Set new x1 for current boundary.
      boundary.x1New = maxXNew;

      // Adjusts new x2 for the affected boundaries.
      for (q = i; q <= j; q++) {
        horizonPart = horizon[q];
        affectedBoundary = horizonPart.boundary;
        if (affectedBoundary.x2New === undefined) {
          // Was not set yet, choosing new x if possible.
          if (affectedBoundary.x2 > boundary.x1) {
            // Current and affected boundaries intersect. If affected boundary
            // is placed on top of the current, shrinking the affected.
            if (affectedBoundary.index > boundary.index) {
              affectedBoundary.x2New = affectedBoundary.x2;
            }
          } else {
            affectedBoundary.x2New = maxXNew;
          }
        } else if (affectedBoundary.x2New > maxXNew) {
          // Affected boundary is touching new x, pushing it back.
          affectedBoundary.x2New = Math.max(maxXNew, affectedBoundary.x2);
        }
      }

      // Fixing the horizon.
      var changedHorizon = [],
        lastBoundary = null;
      for (q = i; q <= j; q++) {
        horizonPart = horizon[q];
        affectedBoundary = horizonPart.boundary;
        // Checking which boundary will be visible.
        var useBoundary =
          affectedBoundary.x2 > boundary.x2 ? affectedBoundary : boundary;
        if (lastBoundary === useBoundary) {
          // Merging with previous.
          changedHorizon[changedHorizon.length - 1].end = horizonPart.end;
        } else {
          changedHorizon.push({
            start: horizonPart.start,
            end: horizonPart.end,
            boundary: useBoundary,
          });
          lastBoundary = useBoundary;
        }
      }
      if (horizon[i].start < boundary.y1) {
        changedHorizon[0].start = boundary.y1;
        changedHorizon.unshift({
          start: horizon[i].start,
          end: boundary.y1,
          boundary: horizon[i].boundary,
        });
      }
      if (boundary.y2 < horizon[j].end) {
        changedHorizon[changedHorizon.length - 1].end = boundary.y2;
        changedHorizon.push({
          start: boundary.y2,
          end: horizon[j].end,
          boundary: horizon[j].boundary,
        });
      }

      // Set x2 new of boundary that is no longer visible (see overlapping case
      // above).
      // TODO more efficient, e.g. via reference counting.
      for (q = i; q <= j; q++) {
        horizonPart = horizon[q];
        affectedBoundary = horizonPart.boundary;
        if (affectedBoundary.x2New !== undefined) {
          continue;
        }
        var used = false;
        for (
          k = i - 1;
          !used && k >= 0 && horizon[k].start >= affectedBoundary.y1;
          k--
        ) {
          used = horizon[k].boundary === affectedBoundary;
        }
        for (
          k = j + 1;
          !used && k < horizon.length && horizon[k].end <= affectedBoundary.y2;
          k++
        ) {
          used = horizon[k].boundary === affectedBoundary;
        }
        for (k = 0; !used && k < changedHorizon.length; k++) {
          used = changedHorizon[k].boundary === affectedBoundary;
        }
        if (!used) {
          affectedBoundary.x2New = maxXNew;
        }
      }

      Array.prototype.splice.apply(
        horizon,
        [i, j - i + 1].concat(changedHorizon)
      );
    });

    // Set new x2 for all unset boundaries.
    horizon.forEach(function(horizonPart) {
      var affectedBoundary = horizonPart.boundary;
      if (affectedBoundary.x2New === undefined) {
        affectedBoundary.x2New = Math.max(width, affectedBoundary.x2);
      }
    });
  }

  /**
   * Text layer rendering task.
   *
   * @param {TextContent} textContent
   * @param {HTMLElement} container
   * @param {PageViewport} viewport
   * @param {Array} textDivs
   * @param {boolean} enhanceTextSelection
   * @private
   */
  function TextLayerRenderTask({
    textContent,
    textContentStream,
    container,
    viewport,
    textDivs,
    textContentItemsStr,
    enhanceTextSelection,
  }) {
    this._textContent = textContent;
    this._textContentStream = textContentStream;
    this._container = container;
    this._viewport = viewport;
    this._textDivs = textDivs || [];
    this._textContentItemsStr = textContentItemsStr || [];
    this._enhanceTextSelection = !!enhanceTextSelection;
    this._fontInspectorEnabled = !!(
      globalThis.FontInspector && globalThis.FontInspector.enabled
    );

    this._reader = null;
    this._layoutTextLastFontSize = null;
    this._layoutTextLastFontFamily = null;
    this._layoutTextCtx = null;
    this._textDivProperties = new WeakMap();
    this._renderingDone = false;
    this._canceled = false;
    this._capability = createPromiseCapability();
    this._renderTimer = null;
    this._bounds = [];

    // Always clean-up the temporary canvas once rendering is no longer pending.
    this._capability.promise
      .finally(() => {
        if (this._layoutTextCtx) {
          // Zeroing the width and height cause Firefox to release graphics
          // resources immediately, which can greatly reduce memory consumption.
          this._layoutTextCtx.canvas.width = 0;
          this._layoutTextCtx.canvas.height = 0;
          this._layoutTextCtx = null;
        }
      })
      .catch(() => {
        /* Avoid "Uncaught promise" messages in the console. */
      });
  }
  TextLayerRenderTask.prototype = {
    get promise() {
      return this._capability.promise;
    },

    cancel: function TextLayer_cancel() {
      this._canceled = true;
      if (this._reader) {
        this._reader.cancel(new AbortException("TextLayer task cancelled."));
        this._reader = null;
      }
      if (this._renderTimer !== null) {
        clearTimeout(this._renderTimer);
        this._renderTimer = null;
      }
      this._capability.reject(new Error("TextLayer task cancelled."));
    },

    _processItems(items, styleCache) {
      for (let i = 0, len = items.length; i < len; i++) {
        this._textContentItemsStr.push(items[i].str);
        appendText(this, items[i], styleCache);
      }
    },

    _layoutText(textDiv) {
      const textDivProperties = this._textDivProperties.get(textDiv);
      if (textDivProperties.isWhitespace) {
        return;
      }

      let transform = "";
      if (textDivProperties.canvasWidth !== 0) {
        const { fontSize, fontFamily } = textDiv.style;

        // Only build font string and set to context if different from last.
        if (
          fontSize !== this._layoutTextLastFontSize ||
          fontFamily !== this._layoutTextLastFontFamily
        ) {
          this._layoutTextCtx.font = `${fontSize} ${fontFamily}`;
          this._layoutTextLastFontSize = fontSize;
          this._layoutTextLastFontFamily = fontFamily;
        }
        // Only measure the width for multi-char text divs, see `appendText`.
        const { width } = this._layoutTextCtx.measureText(textDiv.textContent);

        if (width > 0) {
          textDivProperties.scale = textDivProperties.canvasWidth / width;
          transform = `scaleX(${textDivProperties.scale})`;
        }
      }
      if (textDivProperties.angle !== 0) {
        transform = `rotate(${textDivProperties.angle}deg) ${transform}`;
      }
      if (transform.length > 0) {
        if (this._enhanceTextSelection) {
          textDivProperties.originalTransform = transform;
        }
        textDiv.style.transform = transform;
      }
      this._textDivProperties.set(textDiv, textDivProperties);
      this._container.appendChild(textDiv);
    },

    _render: function TextLayer_render(timeout) {
      const capability = createPromiseCapability();
      let styleCache = Object.create(null);

      // The temporary canvas is used to measure text length in the DOM.
      const canvas = document.createElement("canvas");
      if (
        typeof PDFJSDev === "undefined" ||
        PDFJSDev.test("MOZCENTRAL || GENERIC")
      ) {
        canvas.mozOpaque = true;
      }
      this._layoutTextCtx = canvas.getContext("2d", { alpha: false });

      if (this._textContent) {
        const textItems = this._textContent.items;
        const textStyles = this._textContent.styles;
        this._processItems(textItems, textStyles);
        capability.resolve();
      } else if (this._textContentStream) {
        const pump = () => {
          this._reader.read().then(({ value, done }) => {
            if (done) {
              capability.resolve();
              return;
            }

            Object.assign(styleCache, value.styles);
            this._processItems(value.items, styleCache);
            pump();
          }, capability.reject);
        };

        this._reader = this._textContentStream.getReader();
        pump();
      } else {
        throw new Error(
          'Neither "textContent" nor "textContentStream"' +
            " parameters specified."
        );
      }

      capability.promise.then(() => {
        styleCache = null;
        if (!timeout) {
          // Render right away
          render(this);
        } else {
          // Schedule
          this._renderTimer = setTimeout(() => {
            render(this);
            this._renderTimer = null;
          }, timeout);
        }
      }, this._capability.reject);
    },

    expandTextDivs: function TextLayer_expandTextDivs(expandDivs) {
      if (!this._enhanceTextSelection || !this._renderingDone) {
        return;
      }
      if (this._bounds !== null) {
        expand(this);
        this._bounds = null;
      }
      const transformBuf = [],
        paddingBuf = [];

      for (var i = 0, ii = this._textDivs.length; i < ii; i++) {
        const div = this._textDivs[i];
        const divProps = this._textDivProperties.get(div);

        if (divProps.isWhitespace) {
          continue;
        }
        if (expandDivs) {
          transformBuf.length = 0;
          paddingBuf.length = 0;

          if (divProps.originalTransform) {
            transformBuf.push(divProps.originalTransform);
          }
          if (divProps.paddingTop > 0) {
            paddingBuf.push(`${divProps.paddingTop}px`);
            transformBuf.push(`translateY(${-divProps.paddingTop}px)`);
          } else {
            paddingBuf.push(0);
          }
          if (divProps.paddingRight > 0) {
            paddingBuf.push(`${divProps.paddingRight / divProps.scale}px`);
          } else {
            paddingBuf.push(0);
          }
          if (divProps.paddingBottom > 0) {
            paddingBuf.push(`${divProps.paddingBottom}px`);
          } else {
            paddingBuf.push(0);
          }
          if (divProps.paddingLeft > 0) {
            paddingBuf.push(`${divProps.paddingLeft / divProps.scale}px`);
            transformBuf.push(
              `translateX(${-divProps.paddingLeft / divProps.scale}px)`
            );
          } else {
            paddingBuf.push(0);
          }

          div.style.padding = paddingBuf.join(" ");
          if (transformBuf.length) {
            div.style.transform = transformBuf.join(" ");
          }
        } else {
          div.style.padding = null;
          div.style.transform = divProps.originalTransform;
        }
      }
    },
  };

  /**
   * Starts rendering of the text layer.
   *
   * @param {TextLayerRenderParameters} renderParameters
   * @returns {TextLayerRenderTask}
   */
  function renderTextLayer(renderParameters) {
    var task = new TextLayerRenderTask({
      textContent: renderParameters.textContent,
      textContentStream: renderParameters.textContentStream,
      container: renderParameters.container,
      viewport: renderParameters.viewport,
      textDivs: renderParameters.textDivs,
      textContentItemsStr: renderParameters.textContentItemsStr,
      enhanceTextSelection: renderParameters.enhanceTextSelection,
    });
    task._render(renderParameters.timeout);
    return task;
  }

  return renderTextLayer;
})();

export { renderTextLayer };
