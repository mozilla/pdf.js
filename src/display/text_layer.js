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
  FeatureTest,
  shadow,
  Util,
  warn,
} from "../shared/util.js";
import { setLayerDimensions } from "./display_utils.js";

/**
 * @typedef {Object} TextLayerParameters
 * @property {ReadableStream | TextContent} textContentSource - Text content to
 *   render, i.e. the value returned by the page's `streamTextContent` or
 *   `getTextContent` method.
 * @property {HTMLElement} container - The DOM node that will contain the text
 *   runs.
 * @property {PageViewport} viewport - The target viewport to properly layout
 *   the text runs.
 */

/**
 * @typedef {Object} TextLayerUpdateParameters
 * @property {PageViewport} viewport - The target viewport to properly layout
 *   the text runs.
 * @property {function} [onBefore] - Callback invoked before the textLayer is
 *   updated in the DOM.
 */

const MAX_TEXT_DIVS_TO_RENDER = 100000;
const DEFAULT_FONT_SIZE = 30;

class TextLayer {
  #capability = Promise.withResolvers();

  #container = null;

  #disableProcessItems = false;

  #fontInspectorEnabled = !!globalThis.FontInspector?.enabled;

  #lang = null;

  #layoutTextParams = null;

  #pageHeight = 0;

  #pageWidth = 0;

  #reader = null;

  #rootContainer = null;

  #rotation = 0;

  #scale = 0;

  #styleCache = Object.create(null);

  #textContentItemsStr = [];

  #textContentSource = null;

  #textDivs = [];

  #textDivProperties = new WeakMap();

  #transform = null;

  static #ascentCache = new Map();

  static #canvasContexts = new Map();

  static #canvasCtxFonts = new WeakMap();

  static #minFontSize = null;

  static #pendingTextLayers = new Set();

  /**
   * @param {TextLayerParameters} options
   */
  constructor({ textContentSource, container, viewport }) {
    if (textContentSource instanceof ReadableStream) {
      this.#textContentSource = textContentSource;
    } else if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) &&
      typeof textContentSource === "object"
    ) {
      this.#textContentSource = new ReadableStream({
        start(controller) {
          controller.enqueue(textContentSource);
          controller.close();
        },
      });
    } else {
      throw new Error('No "textContentSource" parameter specified.');
    }
    this.#container = this.#rootContainer = container;

    this.#scale = viewport.scale * (globalThis.devicePixelRatio || 1);
    this.#rotation = viewport.rotation;
    this.#layoutTextParams = {
      div: null,
      properties: null,
      ctx: null,
    };
    const { pageWidth, pageHeight, pageX, pageY } = viewport.rawDims;
    this.#transform = [1, 0, 0, -1, -pageX, pageY + pageHeight];
    this.#pageWidth = pageWidth;
    this.#pageHeight = pageHeight;

    TextLayer.#ensureMinFontSizeComputed();

    setLayerDimensions(container, viewport);

    // Always clean-up the temporary canvas once rendering is no longer pending.
    this.#capability.promise
      .finally(() => {
        TextLayer.#pendingTextLayers.delete(this);
        this.#layoutTextParams = null;
        this.#styleCache = null;
      })
      .catch(() => {
        // Avoid "Uncaught promise" messages in the console.
      });

    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      // For testing purposes.
      Object.defineProperty(this, "pageWidth", {
        get() {
          return this.#pageWidth;
        },
      });
      Object.defineProperty(this, "pageHeight", {
        get() {
          return this.#pageHeight;
        },
      });
    }
  }

  static get fontFamilyMap() {
    const { isWindows, isFirefox } = FeatureTest.platform;
    return shadow(
      this,
      "fontFamilyMap",
      new Map([
        [
          "sans-serif",
          `${isWindows && isFirefox ? "Calibri, " : ""}sans-serif`,
        ],
        [
          "monospace",
          `${isWindows && isFirefox ? "Lucida Console, " : ""}monospace`,
        ],
      ])
    );
  }

  /**
   * Render the textLayer.
   * @returns {Promise}
   */
  render() {
    const pump = () => {
      this.#reader.read().then(({ value, done }) => {
        if (done) {
          this.#capability.resolve();
          return;
        }
        this.#lang ??= value.lang;
        Object.assign(this.#styleCache, value.styles);
        this.#processItems(value.items);
        pump();
      }, this.#capability.reject);
    };
    this.#reader = this.#textContentSource.getReader();
    TextLayer.#pendingTextLayers.add(this);
    pump();

    return this.#capability.promise;
  }

  /**
   * Update a previously rendered textLayer, if necessary.
   * @param {TextLayerUpdateParameters} options
   * @returns {undefined}
   */
  update({ viewport, onBefore = null }) {
    const scale = viewport.scale * (globalThis.devicePixelRatio || 1);
    const rotation = viewport.rotation;

    if (rotation !== this.#rotation) {
      onBefore?.();
      this.#rotation = rotation;
      setLayerDimensions(this.#rootContainer, { rotation });
    }

    if (scale !== this.#scale) {
      onBefore?.();
      this.#scale = scale;
      const params = {
        div: null,
        properties: null,
        ctx: TextLayer.#getCtx(this.#lang),
      };
      for (const div of this.#textDivs) {
        params.properties = this.#textDivProperties.get(div);
        params.div = div;
        this.#layout(params);
      }
    }
  }

  /**
   * Cancel rendering of the textLayer.
   * @returns {undefined}
   */
  cancel() {
    const abortEx = new AbortException("TextLayer task cancelled.");

    this.#reader?.cancel(abortEx).catch(() => {
      // Avoid "Uncaught promise" messages in the console.
    });
    this.#reader = null;

    this.#capability.reject(abortEx);
  }

  /**
   * @type {Array<HTMLElement>} HTML elements that correspond to the text items
   *   of the textContent input.
   *   This is output and will initially be set to an empty array.
   */
  get textDivs() {
    return this.#textDivs;
  }

  /**
   * @type {Array<string>} Strings that correspond to the `str` property of
   *   the text items of the textContent input.
   *   This is output and will initially be set to an empty array
   */
  get textContentItemsStr() {
    return this.#textContentItemsStr;
  }

  #processItems(items) {
    if (this.#disableProcessItems) {
      return;
    }
    this.#layoutTextParams.ctx ??= TextLayer.#getCtx(this.#lang);

    const textDivs = this.#textDivs,
      textContentItemsStr = this.#textContentItemsStr;

    for (const item of items) {
      // No point in rendering many divs as it would make the browser
      // unusable even after the divs are rendered.
      if (textDivs.length > MAX_TEXT_DIVS_TO_RENDER) {
        warn("Ignoring additional textDivs for performance reasons.");

        this.#disableProcessItems = true; // Avoid multiple warnings for one page.
        return;
      }

      if (item.str === undefined) {
        if (
          item.type === "beginMarkedContentProps" ||
          item.type === "beginMarkedContent"
        ) {
          const parent = this.#container;
          this.#container = document.createElement("span");
          this.#container.classList.add("markedContent");
          if (item.id !== null) {
            this.#container.setAttribute("id", `${item.id}`);
          }
          parent.append(this.#container);
        } else if (item.type === "endMarkedContent") {
          this.#container = this.#container.parentNode;
        }
        continue;
      }
      textContentItemsStr.push(item.str);
      this.#appendText(item);
    }
  }

  #appendText(geom) {
    // Initialize all used properties to keep the caches monomorphic.
    const textDiv = document.createElement("span");
    const textDivProperties = {
      angle: 0,
      canvasWidth: 0,
      hasText: geom.str !== "",
      hasEOL: geom.hasEOL,
      fontSize: 0,
    };
    this.#textDivs.push(textDiv);

    const tx = Util.transform(this.#transform, geom.transform);
    let angle = Math.atan2(tx[1], tx[0]);
    const style = this.#styleCache[geom.fontName];
    if (style.vertical) {
      angle += Math.PI / 2;
    }

    let fontFamily =
      (this.#fontInspectorEnabled && style.fontSubstitution) ||
      style.fontFamily;

    // Workaround for bug 1922063.
    fontFamily = TextLayer.fontFamilyMap.get(fontFamily) || fontFamily;
    const fontHeight = Math.hypot(tx[2], tx[3]);
    const fontAscent =
      fontHeight * TextLayer.#getAscent(fontFamily, style, this.#lang);

    let left, top;
    if (angle === 0) {
      left = tx[4];
      top = tx[5] - fontAscent;
    } else {
      left = tx[4] + fontAscent * Math.sin(angle);
      top = tx[5] - fontAscent * Math.cos(angle);
    }

    const scaleFactorStr = "calc(var(--total-scale-factor) *";
    const divStyle = textDiv.style;
    // Setting the style properties individually, rather than all at once,
    // should be OK since the `textDiv` isn't appended to the document yet.
    if (this.#container === this.#rootContainer) {
      divStyle.left = `${((100 * left) / this.#pageWidth).toFixed(2)}%`;
      divStyle.top = `${((100 * top) / this.#pageHeight).toFixed(2)}%`;
    } else {
      // We're in a marked content span, hence we can't use percents.
      divStyle.left = `${scaleFactorStr}${left.toFixed(2)}px)`;
      divStyle.top = `${scaleFactorStr}${top.toFixed(2)}px)`;
    }
    // We multiply the font size by #minFontSize, and then #layout will
    // scale the element by 1/#minFontSize. This allows us to effectively
    // ignore the minimum font size enforced by the browser, so that the text
    // layer <span>s can always match the size of the text in the canvas.
    divStyle.fontSize = `${scaleFactorStr}${(TextLayer.#minFontSize * fontHeight).toFixed(2)}px)`;
    divStyle.fontFamily = fontFamily;

    textDivProperties.fontSize = fontHeight;

    // Keeps screen readers from pausing on every new text span.
    textDiv.setAttribute("role", "presentation");

    textDiv.textContent = geom.str;
    // geom.dir may be 'ttb' for vertical texts.
    textDiv.dir = geom.dir;

    // `fontName` is only used by the FontInspector, and we only use `dataset`
    // here to make the font name available in the debugger.
    if (this.#fontInspectorEnabled) {
      textDiv.dataset.fontName =
        style.fontSubstitutionLoadedName || geom.fontName;
    }
    if (angle !== 0) {
      textDivProperties.angle = angle * (180 / Math.PI);
    }
    // We don't bother scaling single-char text divs, because it has very
    // little effect on text highlighting. This makes scrolling on docs with
    // lots of such divs a lot faster.
    let shouldScaleText = false;
    if (geom.str.length > 1) {
      shouldScaleText = true;
    } else if (geom.str !== " " && geom.transform[0] !== geom.transform[3]) {
      const absScaleX = Math.abs(geom.transform[0]),
        absScaleY = Math.abs(geom.transform[3]);
      // When the horizontal/vertical scaling differs significantly, also scale
      // even single-char text to improve highlighting (fixes issue11713.pdf).
      if (
        absScaleX !== absScaleY &&
        Math.max(absScaleX, absScaleY) / Math.min(absScaleX, absScaleY) > 1.5
      ) {
        shouldScaleText = true;
      }
    }
    if (shouldScaleText) {
      textDivProperties.canvasWidth = style.vertical ? geom.height : geom.width;
    }
    this.#textDivProperties.set(textDiv, textDivProperties);

    // Finally, layout and append the text to the DOM.
    this.#layoutTextParams.div = textDiv;
    this.#layoutTextParams.properties = textDivProperties;
    this.#layout(this.#layoutTextParams);

    if (textDivProperties.hasText) {
      this.#container.append(textDiv);
    }
    if (textDivProperties.hasEOL) {
      const br = document.createElement("br");
      br.setAttribute("role", "presentation");
      this.#container.append(br);
    }
  }

  #layout(params) {
    const { div, properties, ctx } = params;
    const { style } = div;

    let transform = "";
    if (TextLayer.#minFontSize > 1) {
      transform = `scale(${1 / TextLayer.#minFontSize})`;
    }

    if (properties.canvasWidth !== 0 && properties.hasText) {
      const { fontFamily } = style;
      const { canvasWidth, fontSize } = properties;

      TextLayer.#ensureCtxFont(ctx, fontSize * this.#scale, fontFamily);
      // Only measure the width for multi-char text divs, see `appendText`.
      const { width } = ctx.measureText(div.textContent);

      if (width > 0) {
        transform = `scaleX(${(canvasWidth * this.#scale) / width}) ${transform}`;
      }
    }
    if (properties.angle !== 0) {
      transform = `rotate(${properties.angle}deg) ${transform}`;
    }
    if (transform.length > 0) {
      style.transform = transform;
    }
  }

  /**
   * Clean-up global textLayer data.
   * @returns {undefined}
   */
  static cleanup() {
    if (this.#pendingTextLayers.size > 0) {
      return;
    }
    this.#ascentCache.clear();

    for (const { canvas } of this.#canvasContexts.values()) {
      canvas.remove();
    }
    this.#canvasContexts.clear();
  }

  static #getCtx(lang = null) {
    let ctx = this.#canvasContexts.get((lang ||= ""));
    if (!ctx) {
      // We don't use an OffscreenCanvas here because we use serif/sans serif
      // fonts with it and they depends on the locale.
      // In Firefox, the <html> element get a lang attribute that depends on
      // what Fluent returns for the locale and the OffscreenCanvas uses
      // the OS locale.
      // Those two locales can be different and consequently the used fonts will
      // be different (see bug 1869001).
      // Ideally, we should use in the text layer the fonts we've in the pdf (or
      // their replacements when they aren't embedded) and then we can use an
      // OffscreenCanvas.
      const canvas = document.createElement("canvas");
      canvas.className = "hiddenCanvasElement";
      canvas.lang = lang;
      document.body.append(canvas);
      ctx = canvas.getContext("2d", {
        alpha: false,
        willReadFrequently: true,
      });
      this.#canvasContexts.set(lang, ctx);

      // Also, initialize state for the `#ensureCtxFont` method.
      this.#canvasCtxFonts.set(ctx, { size: 0, family: "" });
    }
    return ctx;
  }

  static #ensureCtxFont(ctx, size, family) {
    const cached = this.#canvasCtxFonts.get(ctx);
    if (size === cached.size && family === cached.family) {
      return; // The font is already set.
    }
    ctx.font = `${size}px ${family}`;
    cached.size = size;
    cached.family = family;
  }

  /**
   * Compute the minimum font size enforced by the browser.
   */
  static #ensureMinFontSizeComputed() {
    if (this.#minFontSize !== null) {
      return;
    }
    const div = document.createElement("div");
    div.style.opacity = 0;
    div.style.lineHeight = 1;
    div.style.fontSize = "1px";
    div.style.position = "absolute";
    div.textContent = "X";
    document.body.append(div);
    // In `display:block` elements contain a single line of text,
    // the height matches the line height (which, when set to 1,
    // matches the actual font size).
    this.#minFontSize = div.getBoundingClientRect().height;
    div.remove();
  }

  static #getAscent(fontFamily, style, lang) {
    const cachedAscent = this.#ascentCache.get(fontFamily);
    if (cachedAscent) {
      return cachedAscent;
    }
    const ctx = this.#getCtx(lang);

    ctx.canvas.width = ctx.canvas.height = DEFAULT_FONT_SIZE;
    this.#ensureCtxFont(ctx, DEFAULT_FONT_SIZE, fontFamily);
    const metrics = ctx.measureText("");

    const ascent = metrics.fontBoundingBoxAscent;
    const descent = Math.abs(metrics.fontBoundingBoxDescent);

    ctx.canvas.width = ctx.canvas.height = 0;
    let ratio = 0.8; // DEFAULT_FONT_ASCENT

    if (ascent) {
      ratio = ascent / (ascent + descent);
    } else {
      if (
        (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) ||
        FeatureTest.platform.isFirefox
      ) {
        warn(
          "Enable the `dom.textMetrics.fontBoundingBox.enabled` preference " +
            "in `about:config` to improve TextLayer rendering."
        );
      }
      if (style.ascent) {
        ratio = style.ascent;
      } else if (style.descent) {
        ratio = 1 + style.descent;
      }
    }

    this.#ascentCache.set(fontFamily, ratio);
    return ratio;
  }
}

export { TextLayer };
