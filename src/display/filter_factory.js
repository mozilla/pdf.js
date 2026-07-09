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
  FeatureTest,
  SVG_NS,
  unreachable,
  updateUrlHash,
  Util,
  warn,
} from "../shared/util.js";
import { getRGB, getRGBA, isDataScheme } from "./display_utils.js";

class BaseFilterFactory {
  constructor() {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === BaseFilterFactory
    ) {
      unreachable("Cannot initialize BaseFilterFactory.");
    }
  }

  addFilter(maps) {
    return "none";
  }

  addHCMFilter(fgColor, bgColor) {
    return "none";
  }

  addAlphaFilter(map) {
    return "none";
  }

  addLuminosityFilter(map) {
    return "none";
  }

  addKnockoutFilter(alpha = 0) {
    return "none";
  }

  addHighlightHCMFilter(filterName, fgColor, bgColor, newFgColor, newBgColor) {
    return "none";
  }

  /**
   * Create a filter for the selection of text, given colors.
   *
   * @param {string} fgColor
   * @param {string} bgColor
   * @returns {string}
   */
  addSelectionHCMFilter(fgColor, bgColor) {
    return "none";
  }

  /**
   * Create a filter for the selection of text.
   *
   * @returns {string}
   */
  addSelectionFilter() {
    return "none";
  }

  /**
   * @param {Object} [pageColors]
   * @param {string} [pageColors.background]
   * @param {string} [pageColors.foreground]
   * @returns {Record<string, string> | null}
   */
  createSelectionStyle(pageColors = null) {
    return null;
  }

  destroy(keepHCM = false) {}
}

/**
 * FilterFactory aims to create some SVG filters we can use when drawing an
 * image (or whatever) on a canvas.
 * Filters aren't applied with ctx.putImageData because it just overwrites the
 * underlying pixels.
 * With these filters, it's possible for example to apply some transfer maps on
 * an image without the need to apply them on the pixel arrays: the renderer
 * does the magic for us.
 */
class DOMFilterFactory extends BaseFilterFactory {
  #baseUrl;

  #_cache;

  #_defs;

  #docId;

  #document;

  #_hcmCache;

  #id = 0;

  constructor({ docId, ownerDocument = globalThis.document }) {
    super();
    this.#docId = docId;
    this.#document = ownerDocument;
  }

  get #cache() {
    return (this.#_cache ||= new Map());
  }

  get #hcmCache() {
    return (this.#_hcmCache ||= new Map());
  }

  get #defs() {
    if (!this.#_defs) {
      const div = this.#document.createElement("div");
      const { style } = div;
      // The pdf colors are mostly in light mode (white background with a black
      // foreground), so the filters are created in light mode.
      style.colorScheme = "only light";
      style.visibility = "hidden";
      style.contain = "strict";
      style.width = style.height = 0;
      style.position = "absolute";
      style.top = style.left = 0;
      style.zIndex = -1;

      const svg = this.#document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("width", 0);
      svg.setAttribute("height", 0);
      this.#_defs = this.#document.createElementNS(SVG_NS, "defs");
      div.append(svg);
      svg.append(this.#_defs);
      this.#document.body.append(div);
    }
    return this.#_defs;
  }

  #createTables(maps) {
    if (maps.length === 1) {
      const mapR = maps[0];
      const buffer = new Array(256);
      for (let i = 0; i < 256; i++) {
        buffer[i] = mapR[i] / 255;
      }

      const table = buffer.join(",");
      return [table, table, table];
    }

    const [mapR, mapG, mapB] = maps;
    const bufferR = new Array(256);
    const bufferG = new Array(256);
    const bufferB = new Array(256);
    for (let i = 0; i < 256; i++) {
      bufferR[i] = mapR[i] / 255;
      bufferG[i] = mapG[i] / 255;
      bufferB[i] = mapB[i] / 255;
    }
    return [bufferR.join(","), bufferG.join(","), bufferB.join(",")];
  }

  #createUrl(id) {
    if (this.#baseUrl === undefined) {
      // Unless a `<base>`-element is present a relative URL should work.
      this.#baseUrl = "";

      const url = this.#document.URL;
      if (url !== this.#document.baseURI) {
        if (isDataScheme(url)) {
          warn('#createUrl: ignore "data:"-URL for performance reasons.');
        } else {
          this.#baseUrl = updateUrlHash(url, "");
        }
      }
    }
    return `url(${this.#baseUrl}#${id})`;
  }

  addFilter(maps) {
    if (!maps) {
      return "none";
    }

    // When a page is zoomed the page is re-drawn but the maps are likely
    // the same.
    let value = this.#cache.get(maps);
    if (value) {
      return value;
    }

    const [tableR, tableG, tableB] = this.#createTables(maps);
    const key = maps.length === 1 ? tableR : `${tableR}${tableG}${tableB}`;

    value = this.#cache.get(key);
    if (value) {
      this.#cache.set(maps, value);
      return value;
    }

    // We create a SVG filter: feComponentTransferElement
    //  https://www.w3.org/TR/SVG11/filters.html#feComponentTransferElement

    const id = `g_${this.#docId}_transfer_map_${this.#id++}`;
    const url = this.#createUrl(id);
    this.#cache.set(maps, url);
    this.#cache.set(key, url);

    const filter = this.#createFilter(id);
    this.#addTransferMapConversion(tableR, tableG, tableB, filter);

    return url;
  }

  addHCMFilter(fgColor, bgColor) {
    const key = `${fgColor}-${bgColor}`;
    const filterName = "base";
    let info = this.#hcmCache.get(filterName);
    if (info?.key === key) {
      return info.url;
    }

    if (info) {
      info.filter?.remove();
      info.key = key;
      info.url = "none";
      info.filter = null;
    } else {
      info = {
        key,
        url: "none",
        filter: null,
      };
      this.#hcmCache.set(filterName, info);
    }

    if (!fgColor || !bgColor) {
      return info.url;
    }

    const fgRGB = this.#getRGB(fgColor);
    fgColor = Util.makeHexColor(...fgRGB);
    const bgRGB = this.#getRGB(bgColor);
    bgColor = Util.makeHexColor(...bgRGB);
    this.#resetDefsColor();

    if (
      (fgColor === "#000000" && bgColor === "#ffffff") ||
      fgColor === bgColor
    ) {
      return info.url;
    }

    // https://developer.mozilla.org/en-US/docs/Web/Accessibility/Understanding_Colors_and_Luminance
    //
    // Relative luminance:
    // https://www.w3.org/TR/WCAG20/#relativeluminancedef
    //
    // We compute the rounded luminance of the default background color.
    // Then for every color in the pdf, if its rounded luminance is the
    // same as the background one then it's replaced by the new
    // background color else by the foreground one.
    const map = new Array(256);
    for (let i = 0; i <= 255; i++) {
      const x = i / 255;
      map[i] = x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    }
    const table = map.join(",");

    const id = `g_${this.#docId}_hcm_filter`;
    const filter = (info.filter = this.#createFilter(id));
    this.#addTransferMapConversion(table, table, table, filter);
    this.#addGrayConversion(filter);

    const getSteps = (c, n) => {
      const start = fgRGB[c] / 255;
      const end = bgRGB[c] / 255;
      const arr = new Array(n + 1);
      for (let i = 0; i <= n; i++) {
        arr[i] = start + (i / n) * (end - start);
      }
      return arr.join(",");
    };
    this.#addTransferMapConversion(
      getSteps(0, 5),
      getSteps(1, 5),
      getSteps(2, 5),
      filter
    );

    info.url = this.#createUrl(id);
    return info.url;
  }

  /**
   * Create a filter for the selection of text, given colors.
   *
   * @param {string} fgColor
   * @param {string} bgColor
   * @returns {string}
   */
  addSelectionHCMFilter(fgColor, bgColor) {
    return this.addHighlightHCMFilter(
      "selection",
      fgColor,
      bgColor,
      // Background becomes foreground so these are flipped.
      "HighlightText",
      "Highlight"
    );
  }

  /**
   * Create a filter for the selection of text.
   *
   * @param {string} fgColor
   * @param {string} bgColor
   * @returns {string}
   */
  addSelectionFilter() {
    return this.addHighlightHCMFilter(
      "selection_default",
      "black",
      "white",
      "HighlightText",
      "Highlight"
    );
  }

  /**
   * @param {Object} [pageColors]
   * @param {string} [pageColors.background]
   * @param {string} [pageColors.foreground]
   * @returns {Record<string, string> | null}
   */
  createSelectionStyle(pageColors = null) {
    const filter = pageColors
      ? this.addSelectionHCMFilter(pageColors.foreground, pageColors.background)
      : this.addSelectionFilter();

    // Safari does not supported SVG filters in `backdrop-filter`:
    // <https://bugs.webkit.org/show_bug.cgi?id=245510>.
    // Chrome *and* Safari do not use the user’s preferred text selection color.
    // So this is Firefox-specific for now.
    if (filter === "none" || !FeatureTest.platform.isFirefox) {
      return null;
    }

    return {
      "backdrop-filter": filter,
      "background-color": "transparent",
    };
  }

  addAlphaFilter(map) {
    // When a page is zoomed the page is re-drawn but the maps are likely
    // the same.
    let value = this.#cache.get(map);
    if (value) {
      return value;
    }

    const [tableA] = this.#createTables([map]);
    const key = `alpha_${tableA}`;

    value = this.#cache.get(key);
    if (value) {
      this.#cache.set(map, value);
      return value;
    }

    const id = `g_${this.#docId}_alpha_map_${this.#id++}`;
    const url = this.#createUrl(id);
    this.#cache.set(map, url);
    this.#cache.set(key, url);

    const filter = this.#createFilter(id);
    this.#addTransferMapAlphaConversion(tableA, filter);

    return url;
  }

  addLuminosityFilter(map) {
    // When a page is zoomed the page is re-drawn but the maps are likely
    // the same.
    let value = this.#cache.get(map || "luminosity");
    if (value) {
      return value;
    }

    let tableA, key;
    if (map) {
      [tableA] = this.#createTables([map]);
      key = `luminosity_${tableA}`;
    } else {
      key = "luminosity";
    }

    value = this.#cache.get(key);
    if (value) {
      this.#cache.set(map, value);
      return value;
    }

    const id = `g_${this.#docId}_luminosity_map_${this.#id++}`;
    const url = this.#createUrl(id);
    this.#cache.set(map, url);
    this.#cache.set(key, url);

    const filter = this.#createFilter(id);
    this.#addLuminosityConversion(filter);
    if (map) {
      this.#addTransferMapAlphaConversion(tableA, filter);
    }

    return url;
  }

  addKnockoutFilter(alpha = 0) {
    // Shape alpha mask: for translucent elements, remove the opacity constant
    // from the painted alpha while preserving antialias coverage. With no
    // usable opacity, fall back to a binary mask.
    const slope = alpha > 0 ? Math.min(1 / alpha, 1e6) : 1e6;
    const key = `knockout_${slope}`;
    const value = this.#cache.get(key);
    if (value) {
      return value;
    }

    const id = `g_${this.#docId}_knockout_filter_${this.#id++}`;
    const url = this.#createUrl(id);
    this.#cache.set(key, url);

    const filter = this.#createFilter(id);
    const feComponentTransfer = this.#document.createElementNS(
      SVG_NS,
      "feComponentTransfer"
    );
    filter.append(feComponentTransfer);
    const feFuncA = this.#document.createElementNS(SVG_NS, "feFuncA");
    // Linear feFunc clamps to [0, 1].
    feFuncA.setAttribute("type", "linear");
    feFuncA.setAttribute("slope", `${slope}`);
    feFuncA.setAttribute("intercept", "0");
    feComponentTransfer.append(feFuncA);

    return url;
  }

  addHighlightHCMFilter(filterName, fgColor, bgColor, newFgColor, newBgColor) {
    const key = `${fgColor}-${bgColor}-${newFgColor}-${newBgColor}`;
    let info = this.#hcmCache.get(filterName);
    if (info?.key === key) {
      return info.url;
    }

    if (info) {
      info.filter?.remove();
      info.key = key;
      info.url = "none";
      info.filter = null;
    } else {
      info = {
        key,
        url: "none",
        filter: null,
      };
      this.#hcmCache.set(filterName, info);
    }

    if (!fgColor || !bgColor) {
      return info.url;
    }

    const [fgRGB, bgRGB] = [fgColor, bgColor].map(this.#getRGB.bind(this));
    let fgGray = Math.round(
      0.2126 * fgRGB[0] + 0.7152 * fgRGB[1] + 0.0722 * fgRGB[2]
    );
    let bgGray = Math.round(
      0.2126 * bgRGB[0] + 0.7152 * bgRGB[1] + 0.0722 * bgRGB[2]
    );
    let [newFgRGB, newBgRGB] = [newFgColor, newBgColor].map(
      this.#getOpaqueTextColor.bind(this)
    );
    if (bgGray < fgGray) {
      [fgGray, bgGray, newFgRGB, newBgRGB] = [
        bgGray,
        fgGray,
        newBgRGB,
        newFgRGB,
      ];
    }
    this.#resetDefsColor();

    // Now we can create the filters to highlight some canvas parts.
    // The colors in the pdf will almost be Canvas and CanvasText, hence we
    // want to filter them to finally get Highlight and HighlightText.
    // Since we're in HCM the background color and the foreground color should
    // be really different when converted to grayscale (if they're not then it
    // means that we've a poor contrast). Once the canvas colors are converted
    // to grayscale we can easily map them on their new colors.
    // The grayscale step is important because if we've something like:
    //   fgColor = #FF....
    //   bgColor = #FF....
    //   then we are enable to map the red component on the new red components
    //   which can be different.

    const getSteps = (fg, bg, n) => {
      const arr = new Array(256);
      const step = (bgGray - fgGray) / n;
      const newStart = fg / 255;
      const newStep = (bg - fg) / (255 * n);
      let prev = 0;
      for (let i = 0; i <= n; i++) {
        const k = Math.round(fgGray + i * step);
        const value = newStart + i * newStep;
        for (let j = prev; j <= k; j++) {
          arr[j] = value;
        }
        prev = k + 1;
      }
      for (let i = prev; i < 256; i++) {
        arr[i] = arr[prev - 1];
      }
      return arr.join(",");
    };

    const id = `g_${this.#docId}_hcm_${filterName}_filter`;
    const filter = (info.filter = this.#createFilter(id));

    this.#addGrayConversion(filter);
    this.#addTransferMapConversion(
      getSteps(newFgRGB[0], newBgRGB[0], 5),
      getSteps(newFgRGB[1], newBgRGB[1], 5),
      getSteps(newFgRGB[2], newBgRGB[2], 5),
      filter
    );

    info.url = this.#createUrl(id);
    return info.url;
  }

  destroy(keepHCM = false) {
    if (keepHCM && this.#_hcmCache?.size) {
      return;
    }
    this.#_defs?.parentNode.parentNode.remove();
    this.#_defs = null;

    this.#_cache?.clear();
    this.#_cache = null;

    this.#_hcmCache?.clear();
    this.#_hcmCache = null;

    this.#id = 0;
  }

  #addLuminosityConversion(filter) {
    const feColorMatrix = this.#document.createElementNS(
      SVG_NS,
      "feColorMatrix"
    );
    feColorMatrix.setAttribute("type", "matrix");
    feColorMatrix.setAttribute(
      "values",
      "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.3 0.59 0.11 0 0"
    );
    filter.append(feColorMatrix);
  }

  #addGrayConversion(filter) {
    const feColorMatrix = this.#document.createElementNS(
      SVG_NS,
      "feColorMatrix"
    );
    feColorMatrix.setAttribute("type", "matrix");
    feColorMatrix.setAttribute(
      "values",
      "0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0"
    );
    filter.append(feColorMatrix);
  }

  #createFilter(id) {
    const filter = this.#document.createElementNS(SVG_NS, "filter");
    filter.setAttribute("color-interpolation-filters", "sRGB");
    filter.setAttribute("id", id);
    this.#defs.append(filter);

    return filter;
  }

  #appendFeFunc(feComponentTransfer, func, table) {
    const feFunc = this.#document.createElementNS(SVG_NS, func);
    feFunc.setAttribute("type", "discrete");
    feFunc.setAttribute("tableValues", table);
    feComponentTransfer.append(feFunc);
  }

  #addTransferMapConversion(rTable, gTable, bTable, filter) {
    const feComponentTransfer = this.#document.createElementNS(
      SVG_NS,
      "feComponentTransfer"
    );
    filter.append(feComponentTransfer);
    this.#appendFeFunc(feComponentTransfer, "feFuncR", rTable);
    this.#appendFeFunc(feComponentTransfer, "feFuncG", gTable);
    this.#appendFeFunc(feComponentTransfer, "feFuncB", bTable);
  }

  #addTransferMapAlphaConversion(aTable, filter) {
    const feComponentTransfer = this.#document.createElementNS(
      SVG_NS,
      "feComponentTransfer"
    );
    filter.append(feComponentTransfer);
    this.#appendFeFunc(feComponentTransfer, "feFuncA", aTable);
  }

  /**
   * Get the RGB channels of a color.
   *
   * @param {string} color
   *   Color in any valid CSS format (such as `x` in `color: x`).
   * @returns {[number, number, number, number]}
   *   RGBA values of the color;
   *   the RGB channels are in the range `[0, 255]`;
   *   the alpha channel is in the range `[0, 1]`.
   */
  #getRGB(color) {
    // Some colors on some OSes (e.g. HighlightText in Firefox on macOS)
    // are affected by the current text color. Ensure consistent behavior by
    // setting it to CanvasText.
    this.#defs.style.color = "CanvasText";
    this.#defs.style.backgroundColor = color;
    return getRGB(
      getComputedStyle(this.#defs).getPropertyValue("background-color")
    );
  }

  #getRGBA(color) {
    // Some colors on some OSes (e.g. HighlightText in Firefox on macOS)
    // are affected by the current text color. Ensure consistent behavior by
    // setting it to CanvasText.
    this.#defs.style.color = "CanvasText";
    this.#defs.style.backgroundColor = color;
    return getRGBA(
      getComputedStyle(this.#defs).getPropertyValue("background-color")
    );
  }

  #resetDefsColor() {
    this.#defs.style.color = "";
    this.#defs.style.backgroundColor = "";
  }

  /**
   * Get the opaque text color by, if it has an alpha layer, blending it with
   * the `Canvas` background.
   *
   * @param {string} color
   *   Color in any valid CSS format (such as `x` in `color: x`).
   * @returns {[number, number, number]}
   *   RGB values of the opaque color.
   */
  #getOpaqueTextColor(color) {
    const [r, g, b, alpha] = this.#getRGBA(color);

    if (alpha === 1) {
      return [r, g, b];
    }

    const [canvasR, canvasG, canvasB] = this.#getRGB("Canvas");

    return [
      blend(r, canvasR, alpha),
      blend(g, canvasG, alpha),
      blend(b, canvasB, alpha),
    ];
  }
}

/**
 * Blend a foreground color with a background color using the alpha value.
 *
 * @param {number} fg
 *   Foreground color channel value in the range `[0, 255]`.
 * @param {number} bg
 *   Background color channel value in the range `[0, 255]`.
 * @param {number} alpha
 *   Alpha value in the range `[0, 1]`.
 * @returns {number}
 *   Blended color channel value in the range `[0, 255]`.
 */
function blend(fg, bg, alpha) {
  return Math.round(alpha * fg + (1 - alpha) * bg);
}

export { BaseFilterFactory, DOMFilterFactory };
