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
  BaseCanvasFactory,
  BaseCMapReaderFactory,
  BaseFilterFactory,
  BaseStandardFontDataFactory,
  BaseSVGFactory,
} from "./base_factory.js";
import {
  BaseException,
  FeatureTest,
  shadow,
  stringToBytes,
  Util,
  warn,
} from "../shared/util.js";

const SVG_NS = "http://www.w3.org/2000/svg";

class PixelsPerInch {
  static CSS = 96.0;

  static PDF = 72.0;

  static PDF_TO_CSS_UNITS = this.CSS / this.PDF;
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
  #_cache;

  #_defs;

  #docId;

  #document;

  #hcmFilter;

  #hcmKey;

  #hcmUrl;

  #hcmHighlightFilter;

  #hcmHighlightKey;

  #hcmHighlightUrl;

  #id = 0;

  constructor({ docId, ownerDocument = globalThis.document } = {}) {
    super();
    this.#docId = docId;
    this.#document = ownerDocument;
  }

  get #cache() {
    return (this.#_cache ||= new Map());
  }

  get #defs() {
    if (!this.#_defs) {
      const div = this.#document.createElement("div");
      const { style } = div;
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

    let tableR, tableG, tableB, key;
    if (maps.length === 1) {
      const mapR = maps[0];
      const buffer = new Array(256);
      for (let i = 0; i < 256; i++) {
        buffer[i] = mapR[i] / 255;
      }
      key = tableR = tableG = tableB = buffer.join(",");
    } else {
      const [mapR, mapG, mapB] = maps;
      const bufferR = new Array(256);
      const bufferG = new Array(256);
      const bufferB = new Array(256);
      for (let i = 0; i < 256; i++) {
        bufferR[i] = mapR[i] / 255;
        bufferG[i] = mapG[i] / 255;
        bufferB[i] = mapB[i] / 255;
      }
      tableR = bufferR.join(",");
      tableG = bufferG.join(",");
      tableB = bufferB.join(",");
      key = `${tableR}${tableG}${tableB}`;
    }

    value = this.#cache.get(key);
    if (value) {
      this.#cache.set(maps, value);
      return value;
    }

    // We create a SVG filter: feComponentTransferElement
    //  https://www.w3.org/TR/SVG11/filters.html#feComponentTransferElement

    const id = `g_${this.#docId}_transfer_map_${this.#id++}`;
    const url = `url(#${id})`;
    this.#cache.set(maps, url);
    this.#cache.set(key, url);

    const filter = this.#createFilter(id);
    this.#addTransferMapConversion(tableR, tableG, tableB, filter);

    return url;
  }

  addHCMFilter(fgColor, bgColor) {
    const key = `${fgColor}-${bgColor}`;
    if (this.#hcmKey === key) {
      return this.#hcmUrl;
    }

    this.#hcmKey = key;
    this.#hcmUrl = "none";
    this.#hcmFilter?.remove();

    if (!fgColor || !bgColor) {
      return this.#hcmUrl;
    }

    const fgRGB = this.#getRGB(fgColor);
    fgColor = Util.makeHexColor(...fgRGB);
    const bgRGB = this.#getRGB(bgColor);
    bgColor = Util.makeHexColor(...bgRGB);
    this.#defs.style.color = "";

    if (
      (fgColor === "#000000" && bgColor === "#ffffff") ||
      fgColor === bgColor
    ) {
      return this.#hcmUrl;
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
    const filter = (this.#hcmHighlightFilter = this.#createFilter(id));
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

    this.#hcmUrl = `url(#${id})`;
    return this.#hcmUrl;
  }

  addHighlightHCMFilter(fgColor, bgColor, newFgColor, newBgColor) {
    const key = `${fgColor}-${bgColor}-${newFgColor}-${newBgColor}`;
    if (this.#hcmHighlightKey === key) {
      return this.#hcmHighlightUrl;
    }

    this.#hcmHighlightKey = key;
    this.#hcmHighlightUrl = "none";
    this.#hcmHighlightFilter?.remove();

    if (!fgColor || !bgColor) {
      return this.#hcmHighlightUrl;
    }

    const [fgRGB, bgRGB] = [fgColor, bgColor].map(this.#getRGB.bind(this));
    let fgGray = Math.round(
      0.2126 * fgRGB[0] + 0.7152 * fgRGB[1] + 0.0722 * fgRGB[2]
    );
    let bgGray = Math.round(
      0.2126 * bgRGB[0] + 0.7152 * bgRGB[1] + 0.0722 * bgRGB[2]
    );
    let [newFgRGB, newBgRGB] = [newFgColor, newBgColor].map(
      this.#getRGB.bind(this)
    );
    if (bgGray < fgGray) {
      [fgGray, bgGray, newFgRGB, newBgRGB] = [
        bgGray,
        fgGray,
        newBgRGB,
        newFgRGB,
      ];
    }
    this.#defs.style.color = "";

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

    const id = `g_${this.#docId}_hcm_highlight_filter`;
    const filter = (this.#hcmHighlightFilter = this.#createFilter(id));

    this.#addGrayConversion(filter);
    this.#addTransferMapConversion(
      getSteps(newFgRGB[0], newBgRGB[0], 5),
      getSteps(newFgRGB[1], newBgRGB[1], 5),
      getSteps(newFgRGB[2], newBgRGB[2], 5),
      filter
    );

    this.#hcmHighlightUrl = `url(#${id})`;
    return this.#hcmHighlightUrl;
  }

  destroy(keepHCM = false) {
    if (keepHCM && (this.#hcmUrl || this.#hcmHighlightUrl)) {
      return;
    }
    if (this.#_defs) {
      this.#_defs.parentNode.parentNode.remove();
      this.#_defs = null;
    }
    if (this.#_cache) {
      this.#_cache.clear();
      this.#_cache = null;
    }
    this.#id = 0;
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

  #getRGB(color) {
    this.#defs.style.color = color;
    return getRGB(getComputedStyle(this.#defs).getPropertyValue("color"));
  }
}

class DOMCanvasFactory extends BaseCanvasFactory {
  constructor({ ownerDocument = globalThis.document } = {}) {
    super();
    this._document = ownerDocument;
  }

  /**
   * @ignore
   */
  _createCanvas(width, height) {
    const canvas = this._document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
}

async function fetchData(url, asTypedArray = false) {
  if (
    (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) ||
    isValidFetchUrl(url, document.baseURI)
  ) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    return asTypedArray
      ? new Uint8Array(await response.arrayBuffer())
      : stringToBytes(await response.text());
  }

  // The Fetch API is not supported.
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url, /* asTypedArray = */ true);

    if (asTypedArray) {
      request.responseType = "arraybuffer";
    }
    request.onreadystatechange = () => {
      if (request.readyState !== XMLHttpRequest.DONE) {
        return;
      }
      if (request.status === 200 || request.status === 0) {
        let data;
        if (asTypedArray && request.response) {
          data = new Uint8Array(request.response);
        } else if (!asTypedArray && request.responseText) {
          data = stringToBytes(request.responseText);
        }
        if (data) {
          resolve(data);
          return;
        }
      }
      reject(new Error(request.statusText));
    };

    request.send(null);
  });
}

class DOMCMapReaderFactory extends BaseCMapReaderFactory {
  /**
   * @ignore
   */
  _fetchData(url, compressionType) {
    return fetchData(url, /* asTypedArray = */ this.isCompressed).then(data => {
      return { cMapData: data, compressionType };
    });
  }
}

class DOMStandardFontDataFactory extends BaseStandardFontDataFactory {
  /**
   * @ignore
   */
  _fetchData(url) {
    return fetchData(url, /* asTypedArray = */ true);
  }
}

class DOMSVGFactory extends BaseSVGFactory {
  /**
   * @ignore
   */
  _createSVG(type) {
    return document.createElementNS(SVG_NS, type);
  }
}

/**
 * @typedef {Object} PageViewportParameters
 * @property {Array<number>} viewBox - The xMin, yMin, xMax and
 *   yMax coordinates.
 * @property {number} scale - The scale of the viewport.
 * @property {number} rotation - The rotation, in degrees, of the viewport.
 * @property {number} [offsetX] - The horizontal, i.e. x-axis, offset. The
 *   default value is `0`.
 * @property {number} [offsetY] - The vertical, i.e. y-axis, offset. The
 *   default value is `0`.
 * @property {boolean} [dontFlip] - If true, the y-axis will not be flipped.
 *   The default value is `false`.
 */

/**
 * @typedef {Object} PageViewportCloneParameters
 * @property {number} [scale] - The scale, overriding the one in the cloned
 *   viewport. The default value is `this.scale`.
 * @property {number} [rotation] - The rotation, in degrees, overriding the one
 *   in the cloned viewport. The default value is `this.rotation`.
 * @property {number} [offsetX] - The horizontal, i.e. x-axis, offset.
 *   The default value is `this.offsetX`.
 * @property {number} [offsetY] - The vertical, i.e. y-axis, offset.
 *   The default value is `this.offsetY`.
 * @property {boolean} [dontFlip] - If true, the x-axis will not be flipped.
 *   The default value is `false`.
 */

/**
 * PDF page viewport created based on scale, rotation and offset.
 */
class PageViewport {
  /**
   * @param {PageViewportParameters}
   */
  constructor({
    viewBox,
    scale,
    rotation,
    offsetX = 0,
    offsetY = 0,
    dontFlip = false,
  }) {
    this.viewBox = viewBox;
    this.scale = scale;
    this.rotation = rotation;
    this.offsetX = offsetX;
    this.offsetY = offsetY;

    // creating transform to convert pdf coordinate system to the normal
    // canvas like coordinates taking in account scale and rotation
    const centerX = (viewBox[2] + viewBox[0]) / 2;
    const centerY = (viewBox[3] + viewBox[1]) / 2;
    let rotateA, rotateB, rotateC, rotateD;
    // Normalize the rotation, by clamping it to the [0, 360) range.
    rotation %= 360;
    if (rotation < 0) {
      rotation += 360;
    }
    switch (rotation) {
      case 180:
        rotateA = -1;
        rotateB = 0;
        rotateC = 0;
        rotateD = 1;
        break;
      case 90:
        rotateA = 0;
        rotateB = 1;
        rotateC = 1;
        rotateD = 0;
        break;
      case 270:
        rotateA = 0;
        rotateB = -1;
        rotateC = -1;
        rotateD = 0;
        break;
      case 0:
        rotateA = 1;
        rotateB = 0;
        rotateC = 0;
        rotateD = -1;
        break;
      default:
        throw new Error(
          "PageViewport: Invalid rotation, must be a multiple of 90 degrees."
        );
    }

    if (dontFlip) {
      rotateC = -rotateC;
      rotateD = -rotateD;
    }

    let offsetCanvasX, offsetCanvasY;
    let width, height;
    if (rotateA === 0) {
      offsetCanvasX = Math.abs(centerY - viewBox[1]) * scale + offsetX;
      offsetCanvasY = Math.abs(centerX - viewBox[0]) * scale + offsetY;
      width = (viewBox[3] - viewBox[1]) * scale;
      height = (viewBox[2] - viewBox[0]) * scale;
    } else {
      offsetCanvasX = Math.abs(centerX - viewBox[0]) * scale + offsetX;
      offsetCanvasY = Math.abs(centerY - viewBox[1]) * scale + offsetY;
      width = (viewBox[2] - viewBox[0]) * scale;
      height = (viewBox[3] - viewBox[1]) * scale;
    }
    // creating transform for the following operations:
    // translate(-centerX, -centerY), rotate and flip vertically,
    // scale, and translate(offsetCanvasX, offsetCanvasY)
    this.transform = [
      rotateA * scale,
      rotateB * scale,
      rotateC * scale,
      rotateD * scale,
      offsetCanvasX - rotateA * scale * centerX - rotateC * scale * centerY,
      offsetCanvasY - rotateB * scale * centerX - rotateD * scale * centerY,
    ];

    this.width = width;
    this.height = height;
  }

  /**
   * The original, un-scaled, viewport dimensions.
   * @type {Object}
   */
  get rawDims() {
    const { viewBox } = this;
    return shadow(this, "rawDims", {
      pageWidth: viewBox[2] - viewBox[0],
      pageHeight: viewBox[3] - viewBox[1],
      pageX: viewBox[0],
      pageY: viewBox[1],
    });
  }

  /**
   * Clones viewport, with optional additional properties.
   * @param {PageViewportCloneParameters} [params]
   * @returns {PageViewport} Cloned viewport.
   */
  clone({
    scale = this.scale,
    rotation = this.rotation,
    offsetX = this.offsetX,
    offsetY = this.offsetY,
    dontFlip = false,
  } = {}) {
    return new PageViewport({
      viewBox: this.viewBox.slice(),
      scale,
      rotation,
      offsetX,
      offsetY,
      dontFlip,
    });
  }

  /**
   * Converts PDF point to the viewport coordinates. For examples, useful for
   * converting PDF location into canvas pixel coordinates.
   * @param {number} x - The x-coordinate.
   * @param {number} y - The y-coordinate.
   * @returns {Array} Array containing `x`- and `y`-coordinates of the
   *   point in the viewport coordinate space.
   * @see {@link convertToPdfPoint}
   * @see {@link convertToViewportRectangle}
   */
  convertToViewportPoint(x, y) {
    return Util.applyTransform([x, y], this.transform);
  }

  /**
   * Converts PDF rectangle to the viewport coordinates.
   * @param {Array} rect - The xMin, yMin, xMax and yMax coordinates.
   * @returns {Array} Array containing corresponding coordinates of the
   *   rectangle in the viewport coordinate space.
   * @see {@link convertToViewportPoint}
   */
  convertToViewportRectangle(rect) {
    const topLeft = Util.applyTransform([rect[0], rect[1]], this.transform);
    const bottomRight = Util.applyTransform([rect[2], rect[3]], this.transform);
    return [topLeft[0], topLeft[1], bottomRight[0], bottomRight[1]];
  }

  /**
   * Converts viewport coordinates to the PDF location. For examples, useful
   * for converting canvas pixel location into PDF one.
   * @param {number} x - The x-coordinate.
   * @param {number} y - The y-coordinate.
   * @returns {Array} Array containing `x`- and `y`-coordinates of the
   *   point in the PDF coordinate space.
   * @see {@link convertToViewportPoint}
   */
  convertToPdfPoint(x, y) {
    return Util.applyInverseTransform([x, y], this.transform);
  }
}

class RenderingCancelledException extends BaseException {
  constructor(msg, extraDelay = 0) {
    super(msg, "RenderingCancelledException");
    this.extraDelay = extraDelay;
  }
}

function isDataScheme(url) {
  const ii = url.length;
  let i = 0;
  while (i < ii && url[i].trim() === "") {
    i++;
  }
  return url.substring(i, i + 5).toLowerCase() === "data:";
}

function isPdfFile(filename) {
  return typeof filename === "string" && /\.pdf$/i.test(filename);
}

/**
 * Gets the filename from a given URL.
 * @param {string} url
 * @param {boolean} [onlyStripPath]
 * @returns {string}
 */
function getFilenameFromUrl(url, onlyStripPath = false) {
  if (!onlyStripPath) {
    [url] = url.split(/[#?]/, 1);
  }
  return url.substring(url.lastIndexOf("/") + 1);
}

/**
 * Returns the filename or guessed filename from the url (see issue 3455).
 * @param {string} url - The original PDF location.
 * @param {string} defaultFilename - The value returned if the filename is
 *   unknown, or the protocol is unsupported.
 * @returns {string} Guessed PDF filename.
 */
function getPdfFilenameFromUrl(url, defaultFilename = "document.pdf") {
  if (typeof url !== "string") {
    return defaultFilename;
  }
  if (isDataScheme(url)) {
    warn('getPdfFilenameFromUrl: ignore "data:"-URL for performance reasons.');
    return defaultFilename;
  }
  const reURI = /^(?:(?:[^:]+:)?\/\/[^/]+)?([^?#]*)(\?[^#]*)?(#.*)?$/;
  //              SCHEME        HOST        1.PATH  2.QUERY   3.REF
  // Pattern to get last matching NAME.pdf
  const reFilename = /[^/?#=]+\.pdf\b(?!.*\.pdf\b)/i;
  const splitURI = reURI.exec(url);
  let suggestedFilename =
    reFilename.exec(splitURI[1]) ||
    reFilename.exec(splitURI[2]) ||
    reFilename.exec(splitURI[3]);
  if (suggestedFilename) {
    suggestedFilename = suggestedFilename[0];
    if (suggestedFilename.includes("%")) {
      // URL-encoded %2Fpath%2Fto%2Ffile.pdf should be file.pdf
      try {
        suggestedFilename = reFilename.exec(
          decodeURIComponent(suggestedFilename)
        )[0];
      } catch {
        // Possible (extremely rare) errors:
        // URIError "Malformed URI", e.g. for "%AA.pdf"
        // TypeError "null has no properties", e.g. for "%2F.pdf"
      }
    }
  }
  return suggestedFilename || defaultFilename;
}

class StatTimer {
  started = Object.create(null);

  times = [];

  time(name) {
    if (name in this.started) {
      warn(`Timer is already running for ${name}`);
    }
    this.started[name] = Date.now();
  }

  timeEnd(name) {
    if (!(name in this.started)) {
      warn(`Timer has not been started for ${name}`);
    }
    this.times.push({
      name,
      start: this.started[name],
      end: Date.now(),
    });
    // Remove timer from started so it can be called again.
    delete this.started[name];
  }

  toString() {
    // Find the longest name for padding purposes.
    const outBuf = [];
    let longest = 0;
    for (const { name } of this.times) {
      longest = Math.max(name.length, longest);
    }
    for (const { name, start, end } of this.times) {
      outBuf.push(`${name.padEnd(longest)} ${end - start}ms\n`);
    }
    return outBuf.join("");
  }
}

function isValidFetchUrl(url, baseUrl) {
  if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
    throw new Error("Not implemented: isValidFetchUrl");
  }
  try {
    const { protocol } = baseUrl ? new URL(url, baseUrl) : new URL(url);
    // The Fetch API only supports the http/https protocols, and not file/ftp.
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false; // `new URL()` will throw on incorrect data.
  }
}

/**
 * Event handler to suppress context menu.
 */
function noContextMenu(e) {
  e.preventDefault();
}

/**
 * @param {string} src
 * @param {boolean} [removeScriptElement]
 * @returns {Promise<void>}
 */
function loadScript(src, removeScriptElement = false) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;

    script.onload = function (evt) {
      if (removeScriptElement) {
        script.remove();
      }
      resolve(evt);
    };
    script.onerror = function () {
      reject(new Error(`Cannot load script at: ${script.src}`));
    };
    (document.head || document.documentElement).append(script);
  });
}

// Deprecated API function -- display regardless of the `verbosity` setting.
function deprecated(details) {
  console.log("Deprecated API usage: " + details);
}

let pdfDateStringRegex;

class PDFDateString {
  /**
   * Convert a PDF date string to a JavaScript `Date` object.
   *
   * The PDF date string format is described in section 7.9.4 of the official
   * PDF 32000-1:2008 specification. However, in the PDF 1.7 reference (sixth
   * edition) Adobe describes the same format including a trailing apostrophe.
   * This syntax in incorrect, but Adobe Acrobat creates PDF files that contain
   * them. We ignore all apostrophes as they are not necessary for date parsing.
   *
   * Moreover, Adobe Acrobat doesn't handle changing the date to universal time
   * and doesn't use the user's time zone (effectively ignoring the HH' and mm'
   * parts of the date string).
   *
   * @param {string} input
   * @returns {Date|null}
   */
  static toDateObject(input) {
    if (!input || typeof input !== "string") {
      return null;
    }

    // Lazily initialize the regular expression.
    pdfDateStringRegex ||= new RegExp(
      "^D:" + // Prefix (required)
        "(\\d{4})" + // Year (required)
        "(\\d{2})?" + // Month (optional)
        "(\\d{2})?" + // Day (optional)
        "(\\d{2})?" + // Hour (optional)
        "(\\d{2})?" + // Minute (optional)
        "(\\d{2})?" + // Second (optional)
        "([Z|+|-])?" + // Universal time relation (optional)
        "(\\d{2})?" + // Offset hour (optional)
        "'?" + // Splitting apostrophe (optional)
        "(\\d{2})?" + // Offset minute (optional)
        "'?" // Trailing apostrophe (optional)
    );

    // Optional fields that don't satisfy the requirements from the regular
    // expression (such as incorrect digit counts or numbers that are out of
    // range) will fall back the defaults from the specification.
    const matches = pdfDateStringRegex.exec(input);
    if (!matches) {
      return null;
    }

    // JavaScript's `Date` object expects the month to be between 0 and 11
    // instead of 1 and 12, so we have to correct for that.
    const year = parseInt(matches[1], 10);
    let month = parseInt(matches[2], 10);
    month = month >= 1 && month <= 12 ? month - 1 : 0;
    let day = parseInt(matches[3], 10);
    day = day >= 1 && day <= 31 ? day : 1;
    let hour = parseInt(matches[4], 10);
    hour = hour >= 0 && hour <= 23 ? hour : 0;
    let minute = parseInt(matches[5], 10);
    minute = minute >= 0 && minute <= 59 ? minute : 0;
    let second = parseInt(matches[6], 10);
    second = second >= 0 && second <= 59 ? second : 0;
    const universalTimeRelation = matches[7] || "Z";
    let offsetHour = parseInt(matches[8], 10);
    offsetHour = offsetHour >= 0 && offsetHour <= 23 ? offsetHour : 0;
    let offsetMinute = parseInt(matches[9], 10) || 0;
    offsetMinute = offsetMinute >= 0 && offsetMinute <= 59 ? offsetMinute : 0;

    // Universal time relation 'Z' means that the local time is equal to the
    // universal time, whereas the relations '+'/'-' indicate that the local
    // time is later respectively earlier than the universal time. Every date
    // is normalized to universal time.
    if (universalTimeRelation === "-") {
      hour += offsetHour;
      minute += offsetMinute;
    } else if (universalTimeRelation === "+") {
      hour -= offsetHour;
      minute -= offsetMinute;
    }

    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }
}

/**
 * NOTE: This is (mostly) intended to support printing of XFA forms.
 */
function getXfaPageViewport(xfaPage, { scale = 1, rotation = 0 }) {
  const { width, height } = xfaPage.attributes.style;
  const viewBox = [0, 0, parseInt(width), parseInt(height)];

  return new PageViewport({
    viewBox,
    scale,
    rotation,
  });
}

function getRGB(color) {
  if (color.startsWith("#")) {
    const colorRGB = parseInt(color.slice(1), 16);
    return [
      (colorRGB & 0xff0000) >> 16,
      (colorRGB & 0x00ff00) >> 8,
      colorRGB & 0x0000ff,
    ];
  }

  if (color.startsWith("rgb(")) {
    // getComputedStyle(...).color returns a `rgb(R, G, B)` color.
    return color
      .slice(/* "rgb(".length */ 4, -1) // Strip out "rgb(" and ")".
      .split(",")
      .map(x => parseInt(x));
  }

  if (color.startsWith("rgba(")) {
    return color
      .slice(/* "rgba(".length */ 5, -1) // Strip out "rgba(" and ")".
      .split(",")
      .map(x => parseInt(x))
      .slice(0, 3);
  }

  warn(`Not a valid color format: "${color}"`);
  return [0, 0, 0];
}

function getColorValues(colors) {
  const span = document.createElement("span");
  span.style.visibility = "hidden";
  document.body.append(span);
  for (const name of colors.keys()) {
    span.style.color = name;
    const computedColor = window.getComputedStyle(span).color;
    colors.set(name, getRGB(computedColor));
  }
  span.remove();
}

function getCurrentTransform(ctx) {
  const { a, b, c, d, e, f } = ctx.getTransform();
  return [a, b, c, d, e, f];
}

function getCurrentTransformInverse(ctx) {
  const { a, b, c, d, e, f } = ctx.getTransform().invertSelf();
  return [a, b, c, d, e, f];
}

/**
 * @param {HTMLDivElement} div
 * @param {PageViewport} viewport
 * @param {boolean} mustFlip
 * @param {boolean} mustRotate
 */
function setLayerDimensions(
  div,
  viewport,
  mustFlip = false,
  mustRotate = true
) {
  if (viewport instanceof PageViewport) {
    const { pageWidth, pageHeight } = viewport.rawDims;
    const { style } = div;
    const useRound = FeatureTest.isCSSRoundSupported;

    const w = `var(--scale-factor) * ${pageWidth}px`,
      h = `var(--scale-factor) * ${pageHeight}px`;
    const widthStr = useRound ? `round(${w}, 1px)` : `calc(${w})`,
      heightStr = useRound ? `round(${h}, 1px)` : `calc(${h})`;

    if (!mustFlip || viewport.rotation % 180 === 0) {
      style.width = widthStr;
      style.height = heightStr;
    } else {
      style.width = heightStr;
      style.height = widthStr;
    }
  }

  if (mustRotate) {
    div.setAttribute("data-main-rotation", viewport.rotation);
  }
}

export {
  deprecated,
  DOMCanvasFactory,
  DOMCMapReaderFactory,
  DOMFilterFactory,
  DOMStandardFontDataFactory,
  DOMSVGFactory,
  getColorValues,
  getCurrentTransform,
  getCurrentTransformInverse,
  getFilenameFromUrl,
  getPdfFilenameFromUrl,
  getRGB,
  getXfaPageViewport,
  isDataScheme,
  isPdfFile,
  isValidFetchUrl,
  loadScript,
  noContextMenu,
  PageViewport,
  PDFDateString,
  PixelsPerInch,
  RenderingCancelledException,
  setLayerDimensions,
  StatTimer,
};
