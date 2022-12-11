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

/** @typedef {import("./display_utils").PageViewport} PageViewport */
/** @typedef {import("./api").TextContent} TextContent */

import {
  AbortException,
  createPromiseCapability,
  FeatureTest,
  Util,
} from "../shared/util.js";
import { deprecated, setLayerDimensions } from "./display_utils.js";

/**
 * Text layer render parameters.
 *
 * @typedef {Object} TextLayerRenderParameters
 * @property {ReadableStream | TextContent} textContentSource - Text content to
 *   render, i.e. the value returned by the page's `streamTextContent` or
 *   `getTextContent` method.
 * @property {HTMLElement} container - The DOM node that will contain the text
 *   runs.
 * @property {PageViewport} viewport - The target viewport to properly layout
 *   the text runs.
 * @property {Array<HTMLElement>} [textDivs] - HTML elements that correspond to
 *   the text items of the textContent input.
 *   This is output and shall initially be set to an empty array.
 * @property {WeakMap<HTMLElement,Object>} [textDivProperties] - Some properties
 *   weakly mapped to the HTML elements used to render the text.
 * @property {Array<string>} [textContentItemsStr] - Strings that correspond to
 *   the `str` property of the text items of the textContent input.
 *   This is output and shall initially be set to an empty array.
 * @property {boolean} [isOffscreenCanvasSupported] true if we can use
 *   OffscreenCanvas to measure string widths.
 */

/**
 * Text layer update parameters.
 *
 * @typedef {Object} TextLayerUpdateParameters
 * @property {HTMLElement} container - The DOM node that will contain the text
 *   runs.
 * @property {PageViewport} viewport - The target viewport to properly layout
 *   the text runs.
 * @property {Array<HTMLElement>} [textDivs] - HTML elements that correspond to
 *   the text items of the textContent input.
 *   This is output and shall initially be set to an empty array.
 * @property {WeakMap<HTMLElement,Object>} [textDivProperties] - Some properties
 *   weakly mapped to the HTML elements used to render the text.
 * @property {boolean} [isOffscreenCanvasSupported] true if we can use
 *   OffscreenCanvas to measure string widths.
 * @property {boolean} [mustRotate] true if the text layer must be rotated.
 * @property {boolean} [refresh] true if the text layer contents must be
 *   updated.
 */

const MAX_TEXT_DIVS_TO_RENDER = 100000;

function getCtx(size, isOffscreenCanvasSupported) {
  let ctx;
  if (isOffscreenCanvasSupported && FeatureTest.isOffscreenCanvasSupported) {
    ctx = new OffscreenCanvas(size, size).getContext("2d", { alpha: true });
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    ctx = canvas.getContext("2d", { alpha: false });
  }

  return ctx;
}

function appendText(task, geom, styles) {
  // Initialize all used properties to keep the caches monomorphic.
  const textDiv = document.createElement("span");
  const textDivProperties = {
    angle: 0,
    canvasWidth: 0,
    hasText: geom.str !== "",
    hasEOL: geom.hasEOL,
    fontSize: 0,
  };
  task._textDivs.push(textDiv);

  const tx = Util.transform(task._transform, geom.transform);
  let angle = Math.atan2(tx[1], tx[0]);
  const style = styles[geom.fontName];
  if (style.vertical) {
    angle += Math.PI / 2;
    textDivProperties.width = geom.height;
    textDivProperties.height = geom.width;
  } else {
    textDivProperties.width = geom.width;
    textDivProperties.height = geom.height;
  }
  textDivProperties.angle = angle;
  textDivProperties.top = tx[5];
  textDivProperties.left = tx[4];

  const fontHeight = Math.hypot(tx[2], tx[3]);
  const divStyle = textDiv.style;
  divStyle.fontSize = `${fontHeight.toFixed(2)}px`;
  divStyle.fontFamily = style.fontFamily;

  textDivProperties.fontSize = fontHeight;

  // Keeps screen readers from pausing on every new text span.
  textDiv.setAttribute("role", "presentation");

  textDiv.textContent = geom.str;
  // geom.dir may be 'ttb' for vertical texts.
  textDiv.dir = geom.dir;

  // `fontName` is only used by the FontInspector, and we only use `dataset`
  // here to make the font name available in the debugger.
  if (task._fontInspectorEnabled) {
    textDiv.dataset.fontName = geom.fontName;
  }

  task._textDivProperties.set(textDiv, textDivProperties);
  if (task._isReadableStream) {
    task._layoutText(textDiv);
  }
}

function layout(params) {
  const {
    div,
    scale,
    properties,
    ctx,
    prevFontSize,
    prevFontFamily,
    isRootContainer,
  } = params;
  const { angle, width, hasText, height } = properties;
  if (width === 0 || !hasText) {
    return;
  }

  const { style } = div;
  const calcStr = "calc(var(--scale-factor)*";
  const varStr = "var(--scale-factor)";
  const { fontFamily } = style;
  const { textContent } = div;
  let { left, top, fontSize } = properties;
  fontSize *= scale;

  if (prevFontSize !== fontSize || prevFontFamily !== fontFamily) {
    ctx.font = `${fontSize}px ${fontFamily}`;
    params.prevFontSize = fontSize;
    params.prevFontFamily = fontFamily;
  }

  // Only measure the width for multi-char text divs, see `appendText`.
  const metrics = ctx.measureText(textContent);
  // We can't cache the following values because they depend on textContent.
  let { fontBoundingBoxAscent: ascent, fontBoundingBoxDescent: descent } =
    metrics;
  const { width: contentWidth } = metrics;
  ascent ??= Math.ceil(0.8 * fontSize);
  descent ??= Math.ceil(0.2 * fontSize);

  const h = (ascent + descent) / scale;
  const extra = (height - h) / 2;
  const shift = ascent / scale + extra;

  if (angle) {
    left += shift * Math.sin(angle);
    top -= shift * Math.cos(angle);
  } else {
    top -= shift;
  }

  if (isRootContainer) {
    style.top = `${((100 * top) / params.pageHeight).toFixed(2)}%`;
    style.left = `${((100 * left) / params.pageWidth).toFixed(2)}%`;
  } else {
    // We're in a marked content span, hence we can't use percents.
    style.top = `${calcStr}${top.toFixed(2)}px)`;
    style.left = `${calcStr}${left.toFixed(2)}px)`;
  }

  let transform;
  if (contentWidth > 0 && textContent !== " ") {
    transform = `scale(${calcStr}${((width * scale) / contentWidth).toFixed(
      3
    )}),${varStr})`;
  } else {
    transform = `scale(${varStr})`;
  }
  if (angle) {
    transform = `rotate(${(180 * angle) / Math.PI}deg) ${transform}`;
  }

  style.transform = transform;
}

function render(task) {
  if (task._canceled) {
    return;
  }
  const textDivs = task._textDivs;
  const capability = task._capability;
  const textDivsLength = textDivs.length;

  // No point in rendering many divs as it would make the browser
  // unusable even after the divs are rendered.
  if (textDivsLength > MAX_TEXT_DIVS_TO_RENDER) {
    capability.resolve();
    return;
  }

  if (!task._isReadableStream) {
    for (const textDiv of textDivs) {
      task._layoutText(textDiv);
    }
  }
  capability.resolve();
}

class TextLayerRenderTask {
  constructor({
    textContentSource,
    container,
    viewport,
    textDivs,
    textDivProperties,
    textContentItemsStr,
    isOffscreenCanvasSupported,
  }) {
    this._textContentSource = textContentSource;
    this._isReadableStream = textContentSource instanceof ReadableStream;
    this._container = this._rootContainer = container;
    this._textDivs = textDivs || [];
    this._textContentItemsStr = textContentItemsStr || [];
    this._fontInspectorEnabled = !!globalThis.FontInspector?.enabled;

    this._reader = null;
    this._textDivProperties = textDivProperties || new WeakMap();
    this._canceled = false;
    this._capability = createPromiseCapability();
    const { pageWidth, pageHeight, pageX, pageY } = viewport.rawDims;
    this._transform = [1, 0, 0, -1, -pageX, pageY + pageHeight];
    this._pageWidth = pageWidth;
    this._pageHeight = pageHeight;

    this._layoutTextParams = {
      prevFontSize: null,
      prevFontFamily: null,
      div: null,
      scale: globalThis.devicePixelRatio || 1,
      properties: null,
      ctx: getCtx(0, isOffscreenCanvasSupported),
      pageHeight,
      pageWidth,
    };

    setLayerDimensions(container, viewport);

    // Always clean-up the temporary canvas once rendering is no longer pending.
    this._capability.promise
      .finally(() => {
        this._layoutTextParams = null;
      })
      .catch(() => {
        // Avoid "Uncaught promise" messages in the console.
      });
  }

  /**
   * Promise for textLayer rendering task completion.
   * @type {Promise<void>}
   */
  get promise() {
    return this._capability.promise;
  }

  /**
   * Cancel rendering of the textLayer.
   */
  cancel() {
    this._canceled = true;
    if (this._reader) {
      this._reader
        .cancel(new AbortException("TextLayer task cancelled."))
        .catch(() => {
          // Avoid "Uncaught promise" messages in the console.
        });
      this._reader = null;
    }
    this._capability.reject(new AbortException("TextLayer task cancelled."));
  }

  /**
   * @private
   */
  _processItems(items, styleCache) {
    for (const item of items) {
      if (item.str === undefined) {
        if (
          item.type === "beginMarkedContentProps" ||
          item.type === "beginMarkedContent"
        ) {
          const parent = this._container;
          this._container = document.createElement("span");
          this._container.classList.add("markedContent");
          if (item.id !== null) {
            this._container.setAttribute("id", `${item.id}`);
          }
          parent.append(this._container);
        } else if (item.type === "endMarkedContent") {
          this._container = this._container.parentNode;
        }
        continue;
      }
      this._textContentItemsStr.push(item.str);
      appendText(this, item, styleCache);
    }
  }

  /**
   * @private
   */
  _layoutText(textDiv) {
    const textDivProperties = (this._layoutTextParams.properties =
      this._textDivProperties.get(textDiv));
    this._layoutTextParams.div = textDiv;
    this._layoutTextParams.isRootContainer =
      this._container === this._rootContainer;
    layout(this._layoutTextParams);

    if (textDivProperties.hasText) {
      this._container.append(textDiv);
    }
    if (textDivProperties.hasEOL) {
      const br = document.createElement("br");
      br.setAttribute("role", "presentation");
      this._container.append(br);
    }
  }

  /**
   * @private
   */
  _render() {
    const capability = createPromiseCapability();
    let styleCache = Object.create(null);

    if (this._isReadableStream) {
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

      this._reader = this._textContentSource.getReader();
      pump();
    } else if (this._textContentSource) {
      const { items, styles } = this._textContentSource;
      this._processItems(items, styles);
      capability.resolve();
    } else {
      throw new Error('No "textContentSource" parameter specified.');
    }

    capability.promise.then(() => {
      styleCache = null;
      render(this);
    }, this._capability.reject);
  }
}

/**
 * @param {TextLayerRenderParameters} params
 * @returns {TextLayerRenderTask}
 */
function renderTextLayer(params) {
  if (
    (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) &&
    !params.textContentSource &&
    (params.textContent || params.textContentStream)
  ) {
    deprecated(
      "The TextLayerRender `textContent`/`textContentStream` parameters " +
        "will be removed in the future, please use `textContentSource` instead."
    );
    params.textContentSource = params.textContent || params.textContentStream;
  }
  const task = new TextLayerRenderTask(params);
  task._render();
  return task;
}

/**
 * @param {TextLayerUpdateParameters} params
 * @returns {undefined}
 */
function updateTextLayer({
  container,
  viewport,
  textDivs,
  textDivProperties,
  isOffscreenCanvasSupported,
  mustRotate = true,
  refresh = true,
}) {
  if (mustRotate) {
    setLayerDimensions(container, { rotation: viewport.rotation });
  }

  if (refresh) {
    const ctx = getCtx(0, isOffscreenCanvasSupported);
    const params = {
      prevFontSize: null,
      prevFontFamily: null,
      div: null,
      scale: globalThis.devicePixelRatio || 1,
      properties: null,
      ctx,
    };
    for (const div of textDivs) {
      params.properties = textDivProperties.get(div);
      params.div = div;
      layout(params);
    }
  }
}

export { renderTextLayer, TextLayerRenderTask, updateTextLayer };
