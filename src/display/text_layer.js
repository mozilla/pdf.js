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

/** @typedef {import("./page_viewport").PageViewport} PageViewport */
/** @typedef {import("./api").TextContent} TextContent */
/** @typedef {import("./api").TextStyle} TextStyle */
/** @typedef {import("./text_layer_images").TextLayerImages} TextLayerImages */

import {
  AbortException,
  createPromiseCapability,
  FeatureTest,
  makeMap,
  noopFn,
  shadow,
  Util,
  warn,
} from "../shared/util.js";
import { FontLoader } from "./font_loader.js";
import { OutputScale } from "./output_scale.js";
import { setLayerDimensions } from "./dom_utils.js";

/**
 * @typedef {object} TextLayerParameters
 * @property {ReadableStream | TextContent} textContentSource - Text content to
 *   render, i.e. the value returned by the page's `streamTextContent` or
 *   `getTextContent` method.
 * @property {HTMLElement} container - The DOM node that will contain the text
 *   runs.
 * @property {PageViewport} viewport - The target viewport to properly layout
 *   the text runs.
 * @property {TextLayerImages} [images] - An optional TextLayerImages instance
 *  that handles right clicking on images.
 */

/**
 * @typedef {object} TextLayerUpdateParameters
 * @property {PageViewport} viewport - The target viewport to properly layout
 *   the text runs.
 */

const MAX_TEXT_DIVS_TO_RENDER = 100000;
const DEFAULT_FONT_SIZE = 30;

// Used in the `#appendText` method.
const TX = new Float32Array(6);

class TextLayer {
  #capability = createPromiseCapability();

  #container = null;

  #disableProcessItems = false;

  #fontInspectorEnabled = !!globalThis.FontInspector?.enabled;

  #fonts = new Map();

  #imagesHandler = null;

  #lang = null;

  #layoutTextParams = null;

  #hasTextLayerFonts = false;

  #ownerDocument;

  #pageHeight = 0;

  #pageWidth = 0;

  #pixelRatio = OutputScale.pixelRatio;

  #reader = null;

  #rootContainer = null;

  #rotation = 0;

  #scale = 0;

  #styleCache = Object.create(null);

  #textContentItemsStr = [];

  #textContentSource = null;

  #textDivs = [];

  #transform = null;

  static #canvasContexts = new Map();

  static #canvasCtxFonts = new WeakMap();

  // Text layers in the same document share fonts by name.
  static #fontCache = new WeakMap();

  static #minFontSize = null;

  static #pendingTextLayers = new Set();

  /**
   * @param {TextLayerParameters} options
   */
  constructor({ textContentSource, images, container, viewport }) {
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
    this.#ownerDocument = container.ownerDocument || globalThis.document;

    this.#imagesHandler = images;

    this.#scale = viewport.scale * this.#pixelRatio;
    this.#rotation = viewport.rotation;
    this.#layoutTextParams = {
      div: null,
      properties: null,
      ctx: null,
    };
    const { pageWidth, pageHeight, pageX, pageY } = viewport.rawDims;
    this.#transform = new Float32Array([
      1,
      0,
      0,
      -1,
      -pageX,
      pageY + pageHeight,
    ]);
    this.#pageWidth = pageWidth;
    this.#pageHeight = pageHeight;

    TextLayer.#ensureMinFontSizeComputed();
    container.style.setProperty("--min-font-size", TextLayer.#minFontSize);

    setLayerDimensions(container, viewport);

    // Always clean-up the temporary canvas once rendering is no longer pending.
    this.#capability.promise
      .finally(() => {
        TextLayer.#pendingTextLayers.delete(this);
        this.#layoutTextParams = null;
        this.#styleCache = null;
      })
      .catch(noopFn);

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
  async render() {
    if (this.#imagesHandler) {
      this.#container.append(this.#imagesHandler.render());
    }

    this.#reader = this.#textContentSource.getReader();
    TextLayer.#pendingTextLayers.add(this);

    try {
      while (this.#reader) {
        const { value, done } = await this.#reader.read();
        if (!this.#reader) {
          break; // Cancelled.
        }
        if (done) {
          this.#capability.resolve();
          break;
        }
        this.#lang ??= value.lang;
        Object.assign(this.#styleCache, value.styles);
        const fontsPromise = this.#loadFonts(value.styles);
        if (fontsPromise) {
          // Cancellation should also interrupt the wait for fonts.
          await Promise.race([fontsPromise, this.#capability.promise]);
          if (!this.#reader) {
            break;
          }
          if (
            !this.#hasTextLayerFonts &&
            this.#fonts
              .values()
              .some(({ fontFace }) => fontFace.status === "loaded")
          ) {
            this.#hasTextLayerFonts = true;
            this.#rootContainer.classList.add("textLayerFonts");
          }
        }
        this.#processItems(value.items);
      }
    } catch (reason) {
      this.#capability.reject(reason);
    }

    return this.#capability.promise;
  }

  /**
   * Update a previously rendered textLayer, if necessary.
   * @param {TextLayerUpdateParameters} options
   * @returns {undefined}
   */
  update({ viewport }) {
    const scale = viewport.scale * OutputScale.pixelRatio;
    const rotation = viewport.rotation;

    if (rotation !== this.#rotation) {
      this.#rotation = rotation;
      setLayerDimensions(this.#rootContainer, { rotation });
    }
    if (scale !== this.#scale) {
      this.#scale = scale;
      this.#pixelRatio = OutputScale.pixelRatio;
    }
  }

  /**
   * Cancel rendering of the textLayer, and release its fonts.
   * @returns {undefined}
   */
  cancel() {
    const abortEx = new AbortException("TextLayer task cancelled.");

    this.#reader?.cancel(abortEx).catch(noopFn);
    this.#reader = null;

    this.#capability.reject(abortEx);

    const fontSet = this.#ownerDocument.fonts;
    const fontCache = TextLayer.#fontCache.get(fontSet);
    for (const [name, font] of this.#fonts) {
      if (--font.count === 0) {
        fontSet.delete(font.fontFace);
        fontCache.delete(name);
      }
    }
    this.#fonts.clear();
    this.#rootContainer.classList.remove("textLayerFonts");
  }

  /**
   * @param {Record<string, TextStyle>} styles
   * @returns {Promise|null} Resolved when the fonts are loaded, or failed to.
   */
  #loadFonts(styles) {
    const fontSet = this.#ownerDocument.fonts;
    if (!fontSet || typeof FontFace === "undefined") {
      return null;
    }
    const promises = [];
    let fontCache;
    for (const { textLayerFont } of Object.values(styles)) {
      if (!textLayerFont || this.#fonts.has(textLayerFont.name)) {
        continue;
      }
      fontCache ??= TextLayer.#fontCache.getOrInsertComputed(fontSet, makeMap);
      const { name, data } = textLayerFont;
      const font = fontCache.getOrInsertComputed(name, () => {
        const fontFace = new FontFace(name, data);
        return {
          fontFace,
          count: 0,
          promise: FontLoader.loadBinaryFontFace(fontSet, fontFace).catch(
            reason => {
              warn(`Cannot load the text layer font "${name}": "${reason}".`);
            }
          ),
        };
      });
      this.#fonts.set(name, font);
      font.count++;
      promises.push(font.promise);
    }
    return promises.length ? Promise.all(promises) : null;
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
    this.#layoutTextParams.ctx ??= TextLayer.#getCtx(
      this.#ownerDocument,
      this.#lang
    );

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
          this.#container = this.#ownerDocument.createElement("span");
          this.#container.classList.add("markedContent");
          if (item.id) {
            this.#container.setAttribute("id", item.id);
          }
          if (item.tag === "Artifact") {
            this.#container.ariaHidden = true;
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
    const textDiv = this.#ownerDocument.createElement("span");
    const isSpace = geom.str === " ";
    const textDivProperties = {
      angle: 0,
      canvasWidth: 0,
      hasText: geom.str !== "",
      hasEOL: geom.hasEOL,
      fontSize: 0,
      fontAdvance: 0,
      scaleX: 1,
    };
    this.#textDivs.push(textDiv);

    Util.transform(this.#transform, geom.transform, TX);
    let angle = Math.atan2(TX[1], TX[0]);
    const style = this.#styleCache[geom.fontName];
    if (style.vertical) {
      angle += Math.PI / 2;
    }

    const { textLayerFont } = style;
    let fontFamily,
      ascent,
      advanceScale = 1;
    const hasTextLayerFont =
      textLayerFont &&
      this.#fonts.get(textLayerFont.name)?.fontFace.status === "loaded";
    if (hasTextLayerFont) {
      fontFamily = textLayerFont.name;
      ascent = textLayerFont.ascent;
      advanceScale = textLayerFont.advanceScale;
      textDivProperties.fontAdvance =
        (geom.textLayerAdvance ?? 0) / advanceScale;
    } else {
      fontFamily =
        (this.#fontInspectorEnabled && style.fontSubstitution) ||
        style.fontFamily;
      // Workaround for bug 1922063.
      fontFamily = TextLayer.fontFamilyMap.get(fontFamily) || fontFamily;
    }
    const fontHeight = Math.hypot(TX[2], TX[3]);
    const fontAscent =
      fontHeight *
      (ascent ??
        TextLayer.#getAscent(fontFamily, style, this.#layoutTextParams.ctx));

    let left, top;
    if (angle === 0) {
      left = TX[4];
      top = TX[5] - fontAscent;
    } else {
      left = TX[4] + fontAscent * Math.sin(angle);
      top = TX[5] - fontAscent * Math.cos(angle);
    }

    const divStyle = textDiv.style;
    // Setting the style properties individually, rather than all at once,
    // should be OK since the `textDiv` isn't appended to the document yet.
    divStyle.left = `${((100 * left) / this.#pageWidth).toFixed(3)}%`;
    divStyle.top = `${((100 * top) / this.#pageHeight).toFixed(3)}%`;
    // The text is laid out with the rounded value, hence keep it around in
    // order to measure the text with the very same size, see `#layout`.
    const roundedFontHeight = Math.round(fontHeight * 100) / 100;
    divStyle.setProperty("--font-height", `${roundedFontHeight}px`);
    divStyle.fontFamily = fontFamily;

    textDivProperties.fontSize = roundedFontHeight;

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
    // Different PDF glyphs can map to the same character. The generated font
    // has one advance for it, so even an isolated glyph may need width fitting.
    let shouldScaleText =
      geom.str.length > 1 ||
      (hasTextLayerFont && (!isSpace || advanceScale !== 1));
    const scaleX = geom.transform[0],
      scaleY = geom.transform[3];
    if (!shouldScaleText && !isSpace && scaleX !== scaleY) {
      // When the horizontal/vertical scaling differs significantly, also scale
      // even single-char text to improve highlighting (fixes issue11713.pdf).
      const absScaleX = Math.abs(scaleX),
        absScaleY = Math.abs(scaleY);
      shouldScaleText =
        Math.max(absScaleX, absScaleY) > 1.5 * Math.min(absScaleX, absScaleY);
    }
    if (shouldScaleText) {
      textDivProperties.canvasWidth = style.vertical ? geom.height : geom.width;
      if (!textDivProperties.canvasWidth && textDivProperties.fontAdvance > 0) {
        textDivProperties.scaleX = 0;
      }
    }

    // Finally, layout and append the text to the DOM.
    this.#layoutTextParams.div = textDiv;
    this.#layoutTextParams.properties = textDivProperties;
    this.#layout(this.#layoutTextParams);

    if (textDivProperties.hasText) {
      this.#container.append(textDiv);
    }
    if (textDivProperties.hasEOL) {
      const br = this.#ownerDocument.createElement("br");
      br.setAttribute("role", "presentation");
      this.#container.append(br);
    }
  }

  #layout(params) {
    const { div, properties, ctx } = params;
    const { style } = div;
    const { canvasWidth, fontSize, fontAdvance } = properties;
    let { scaleX } = properties;

    if (canvasWidth !== 0 && fontSize !== 0 && properties.hasText) {
      let width = fontAdvance * fontSize;
      if (!width) {
        // Firefox quantizes canvas font sizes after dividing by the
        // device-pixel ratio. Measure at a quantized size, then rescale the
        // width.
        const pixelRatio = this.#pixelRatio;
        const measuredSize =
          TextLayer.#quantizeFontSize((fontSize * this.#scale) / pixelRatio) *
          pixelRatio;

        TextLayer.#ensureCtxFont(ctx, measuredSize, style.fontFamily);
        width =
          (ctx.measureText(div.textContent).width * fontSize) / measuredSize;
      }

      if (width > 0) {
        scaleX = canvasWidth / width;
      }
    }
    if (scaleX !== 1) {
      style.setProperty("--scale-x", scaleX);
    }
    if (properties.angle !== 0) {
      style.setProperty("--rotate", `${properties.angle}deg`);
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
    for (const contexts of this.#canvasContexts.values()) {
      for (const { canvas } of contexts.values()) {
        canvas.remove();
      }
    }
    this.#canvasContexts.clear();
  }

  static #getCtx(ownerDocument, lang = null) {
    const contexts = this.#canvasContexts.getOrInsertComputed(
      ownerDocument,
      makeMap
    );
    let ctx = contexts.get((lang ||= ""));
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
      const canvas = ownerDocument.createElement("canvas");
      canvas.style.cssText =
        "position:absolute;top:0;left:0;width:0;height:0;display:none;" +
        "letter-spacing:normal;word-spacing:normal";
      canvas.lang = lang;
      ownerDocument.body.append(canvas);
      ctx = canvas.getContext("2d", {
        alpha: false,
        willReadFrequently: true,
      });
      contexts.set(lang, ctx);

      // Also, initialize state for the `#ensureCtxFont` method.
      // Resizing the canvas resets ctx.font but leaves this cache stale.
      this.#canvasCtxFonts.set(ctx, {
        size: 0,
        family: "",
        ascents: new Map(),
      });
    }
    return ctx;
  }

  // Match Firefox's 7-bit `QuantizeFontSize` implementation:
  // https://searchfox.org/firefox-main/rev/04b29f9c2d2dbf5639c3f45ea812bb4c21dc81c6/dom/canvas/CanvasRenderingContext2D.cpp#4205-4215
  static #quantizeFontSize(size) {
    size = Math.fround(size);
    const d = Math.fround(size * ((1 << 17) + 1));
    return Math.fround(d - Math.fround(d - size));
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

  static #getAscent(fontFamily, style, ctx) {
    const { ascents } = this.#canvasCtxFonts.get(ctx);
    const cachedAscent = ascents.get(fontFamily);
    if (cachedAscent) {
      return cachedAscent;
    }
    this.#ensureCtxFont(ctx, DEFAULT_FONT_SIZE, fontFamily);
    const metrics = ctx.measureText("");

    const ascent = metrics.fontBoundingBoxAscent;
    const descent = Math.abs(metrics.fontBoundingBoxDescent);

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

    ascents.set(fontFamily, ratio);
    return ratio;
  }
}

export { DEFAULT_FONT_SIZE, TextLayer };
