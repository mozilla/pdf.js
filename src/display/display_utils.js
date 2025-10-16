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
  BaseException,
  FeatureTest,
  shadow,
  Util,
  warn,
} from "../shared/util.js";
import { XfaLayer } from "./xfa_layer.js";

const SVG_NS = "http://www.w3.org/2000/svg";

class PixelsPerInch {
  static CSS = 96.0;

  static PDF = 72.0;

  static PDF_TO_CSS_UNITS = this.CSS / this.PDF;
}

async function fetchData(url, type = "text") {
  if (
    (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) ||
    isValidFetchUrl(url, document.baseURI)
  ) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    switch (type) {
      case "arraybuffer":
        return response.arrayBuffer();
      case "blob":
        return response.blob();
      case "json":
        return response.json();
    }
    return response.text();
  }

  // The Fetch API is not supported.
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url, /* async = */ true);
    request.responseType = type;

    request.onreadystatechange = () => {
      if (request.readyState !== XMLHttpRequest.DONE) {
        return;
      }
      if (request.status === 200 || request.status === 0) {
        switch (type) {
          case "arraybuffer":
          case "blob":
          case "json":
            resolve(request.response);
            return;
        }
        resolve(request.responseText);
        return;
      }
      reject(new Error(request.statusText));
    };

    request.send(null);
  });
}

/**
 * @typedef {Object} PageViewportParameters
 * @property {Array<number>} viewBox - The xMin, yMin, xMax and
 *   yMax coordinates.
 * @property {number} userUnit - The size of units.
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
    userUnit,
    scale,
    rotation,
    offsetX = 0,
    offsetY = 0,
    dontFlip = false,
  }) {
    this.viewBox = viewBox;
    this.userUnit = userUnit;
    this.scale = scale;
    this.rotation = rotation;
    this.offsetX = offsetX;
    this.offsetY = offsetY;

    scale *= userUnit; // Take the userUnit into account.

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
    const dims = this.viewBox;

    return shadow(this, "rawDims", {
      pageWidth: dims[2] - dims[0],
      pageHeight: dims[3] - dims[1],
      pageX: dims[0],
      pageY: dims[1],
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
      userUnit: this.userUnit,
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
    const p = [x, y];
    Util.applyTransform(p, this.transform);
    return p;
  }

  /**
   * Converts PDF rectangle to the viewport coordinates.
   * @param {Array} rect - The xMin, yMin, xMax and yMax coordinates.
   * @returns {Array} Array containing corresponding coordinates of the
   *   rectangle in the viewport coordinate space.
   * @see {@link convertToViewportPoint}
   */
  convertToViewportRectangle(rect) {
    const topLeft = [rect[0], rect[1]];
    Util.applyTransform(topLeft, this.transform);
    const bottomRight = [rect[2], rect[3]];
    Util.applyTransform(bottomRight, this.transform);
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
    const p = [x, y];
    Util.applyInverseTransform(p, this.transform);
    return p;
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
 * @returns {string}
 */
function getFilenameFromUrl(url) {
  [url] = url.split(/[#?]/, 1);
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

  const getURL = urlString => {
    try {
      return new URL(urlString);
    } catch {
      try {
        return new URL(decodeURIComponent(urlString));
      } catch {
        try {
          // Attempt to parse the URL using the document's base URI.
          return new URL(urlString, "https://foo.bar");
        } catch {
          try {
            return new URL(decodeURIComponent(urlString), "https://foo.bar");
          } catch {
            return null;
          }
        }
      }
    }
  };

  const newURL = getURL(url);
  if (!newURL) {
    // If the URL is invalid, return the default filename.
    return defaultFilename;
  }

  const decode = name => {
    try {
      let decoded = decodeURIComponent(name);
      if (decoded.includes("/")) {
        decoded = decoded.split("/").at(-1);
        if (decoded.test(/^\.pdf$/i)) {
          return decoded;
        }
        return name;
      }
      return decoded;
    } catch {
      return name;
    }
  };

  const pdfRegex = /\.pdf$/i;
  const filename = newURL.pathname.split("/").at(-1);
  if (pdfRegex.test(filename)) {
    return decode(filename);
  }

  if (newURL.searchParams.size > 0) {
    const values = Array.from(newURL.searchParams.values()).reverse();
    for (const value of values) {
      if (pdfRegex.test(value)) {
        // If any of the search parameters ends with ".pdf", return it.
        return decode(value);
      }
    }
    const keys = Array.from(newURL.searchParams.keys()).reverse();
    for (const key of keys) {
      if (pdfRegex.test(key)) {
        // If any of the search parameter keys ends with ".pdf", return it.
        return decode(key);
      }
    }
  }

  if (newURL.hash) {
    const reFilename = /[^/?#=]+\.pdf\b(?!.*\.pdf\b)/i;
    const hashFilename = reFilename.exec(newURL.hash);
    if (hashFilename) {
      return decode(hashFilename[0]);
    }
  }

  return defaultFilename;
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
  const res = baseUrl ? URL.parse(url, baseUrl) : URL.parse(url);
  // The Fetch API only supports the http/https protocols, and not file/ftp.
  return res?.protocol === "http:" || res?.protocol === "https:";
}

/**
 * Event handler to suppress context menu.
 */
function noContextMenu(e) {
  e.preventDefault();
}

function stopEvent(e) {
  e.preventDefault();
  e.stopPropagation();
}

// Deprecated API function -- display regardless of the `verbosity` setting.
function deprecated(details) {
  // eslint-disable-next-line no-console
  console.log("Deprecated API usage: " + details);
}

class PDFDateString {
  static #regex;

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
    if (input instanceof Date) {
      return input;
    }
    if (!input || typeof input !== "string") {
      return null;
    }

    // Lazily initialize the regular expression.
    this.#regex ||= new RegExp(
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
    const matches = this.#regex.exec(input);
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
    userUnit: 1,
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
  // NOTE: The following does *not* affect `forced-colors: active` mode.
  span.style.colorScheme = "only light";
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

    const w = `var(--total-scale-factor) * ${pageWidth}px`,
      h = `var(--total-scale-factor) * ${pageHeight}px`;
    const widthStr = useRound
        ? `round(down, ${w}, var(--scale-round-x))`
        : `calc(${w})`,
      heightStr = useRound
        ? `round(down, ${h}, var(--scale-round-y))`
        : `calc(${h})`;

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

/**
 * Scale factors for the canvas, necessary with HiDPI displays.
 */
class OutputScale {
  constructor() {
    const { pixelRatio } = OutputScale;

    /**
     * @type {number} Horizontal scale.
     */
    this.sx = pixelRatio;

    /**
     * @type {number} Vertical scale.
     */
    this.sy = pixelRatio;
  }

  /**
   * @type {boolean} Returns `true` when scaling is required, `false` otherwise.
   */
  get scaled() {
    return this.sx !== 1 || this.sy !== 1;
  }

  /**
   * @type {boolean} Returns `true` when scaling is symmetric,
   *   `false` otherwise.
   */
  get symmetric() {
    return this.sx === this.sy;
  }

  /**
   * @returns {boolean} Returns `true` if scaling was limited,
   *   `false` otherwise.
   */
  limitCanvas(width, height, maxPixels, maxDim, capAreaFactor = -1) {
    let maxAreaScale = Infinity,
      maxWidthScale = Infinity,
      maxHeightScale = Infinity;

    maxPixels = OutputScale.capPixels(maxPixels, capAreaFactor);
    if (maxPixels > 0) {
      maxAreaScale = Math.sqrt(maxPixels / (width * height));
    }
    if (maxDim !== -1) {
      maxWidthScale = maxDim / width;
      maxHeightScale = maxDim / height;
    }
    const maxScale = Math.min(maxAreaScale, maxWidthScale, maxHeightScale);

    if (this.sx > maxScale || this.sy > maxScale) {
      this.sx = maxScale;
      this.sy = maxScale;
      return true;
    }
    return false;
  }

  static get pixelRatio() {
    return globalThis.devicePixelRatio || 1;
  }

  static capPixels(maxPixels, capAreaFactor) {
    if (capAreaFactor >= 0) {
      const winPixels = Math.ceil(
        (typeof PDFJSDev !== "undefined" && PDFJSDev.test("TESTING")
          ? window.innerWidth * window.innerHeight
          : window.screen.availWidth * window.screen.availHeight) *
          this.pixelRatio ** 2 *
          (1 + capAreaFactor / 100)
      );
      return maxPixels > 0 ? Math.min(maxPixels, winPixels) : winPixels;
    }
    return maxPixels;
  }
}

// See https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Image_types
// to know which types are supported by the browser.
const SupportedImageMimeTypes = [
  "image/apng",
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
  "image/x-icon",
];

class ColorScheme {
  static get isDarkMode() {
    return shadow(
      this,
      "isDarkMode",
      !!window?.matchMedia?.("(prefers-color-scheme: dark)").matches
    );
  }
}

class CSSConstants {
  static get commentForegroundColor() {
    const element = document.createElement("span");
    element.classList.add("comment", "sidebar");
    const { style } = element;
    style.width = style.height = "0";
    style.display = "none";
    style.color = "var(--comment-fg-color)";
    document.body.append(element);
    const { color } = window.getComputedStyle(element);
    element.remove();
    return shadow(this, "commentForegroundColor", getRGB(color));
  }
}

function applyOpacity(r, g, b, opacity) {
  opacity = Math.min(Math.max(opacity ?? 1, 0), 1);
  const white = 255 * (1 - opacity);
  r = Math.round(r * opacity + white);
  g = Math.round(g * opacity + white);
  b = Math.round(b * opacity + white);
  return [r, g, b];
}

function RGBToHSL(rgb, output) {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    // achromatic
    output[0] = output[1] = 0; // hue and saturation are 0
  } else {
    const d = max - min;
    output[1] = l < 0.5 ? d / (max + min) : d / (2 - max - min);
    // hue
    switch (max) {
      case r:
        output[0] = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        output[0] = ((b - r) / d + 2) * 60;
        break;
      case b:
        output[0] = ((r - g) / d + 4) * 60;
        break;
    }
  }
  output[2] = l;
}

function HSLToRGB(hsl, output) {
  const h = hsl[0];
  const s = hsl[1];
  const l = hsl[2];
  const c = (1 - Math.abs(2 * l - 1)) * s; // chroma
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  switch (Math.floor(h / 60)) {
    case 0:
      output[0] = c + m;
      output[1] = x + m;
      output[2] = m;
      break;
    case 1:
      output[0] = x + m;
      output[1] = c + m;
      output[2] = m;
      break;
    case 2:
      output[0] = m;
      output[1] = c + m;
      output[2] = x + m;
      break;
    case 3:
      output[0] = m;
      output[1] = x + m;
      output[2] = c + m;
      break;
    case 4:
      output[0] = x + m;
      output[1] = m;
      output[2] = c + m;
      break;
    case 5:
    case 6:
      output[0] = c + m;
      output[1] = m;
      output[2] = x + m;
      break;
  }
}

function computeLuminance(x) {
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(hsl1, hsl2, output) {
  HSLToRGB(hsl1, output);
  output.map(computeLuminance);
  const lum1 = 0.2126 * output[0] + 0.7152 * output[1] + 0.0722 * output[2];
  HSLToRGB(hsl2, output);
  output.map(computeLuminance);
  const lum2 = 0.2126 * output[0] + 0.7152 * output[1] + 0.0722 * output[2];
  return lum1 > lum2
    ? (lum1 + 0.05) / (lum2 + 0.05)
    : (lum2 + 0.05) / (lum1 + 0.05);
}

// Cache for the findContrastColor function, to improve performance.
const contrastCache = new Map();

/**
 * Find a color that has sufficient contrast against a fixed color.
 * The luminance (in HSL color space) of the base color is adjusted
 * until the contrast ratio between the base color and the fixed color
 * is at least the minimum contrast ratio required by WCAG 2.1.
 * @param {Array<number>} baseColor
 * @param {Array<number>} fixedColor
 * @returns {string}
 */
function findContrastColor(baseColor, fixedColor) {
  const key =
    baseColor[0] +
    baseColor[1] * 0x100 +
    baseColor[2] * 0x10000 +
    fixedColor[0] * 0x1000000 +
    fixedColor[1] * 0x100000000 +
    fixedColor[2] * 0x10000000000;
  let cachedValue = contrastCache.get(key);
  if (cachedValue) {
    return cachedValue;
  }
  const array = new Float32Array(9);
  const output = array.subarray(0, 3);
  const baseHSL = array.subarray(3, 6);
  RGBToHSL(baseColor, baseHSL);
  const fixedHSL = array.subarray(6, 9);
  RGBToHSL(fixedColor, fixedHSL);
  const isFixedColorDark = fixedHSL[2] < 0.5;

  // Use the contrast ratio requirements from WCAG 2.1.
  // https://www.w3.org/TR/WCAG21/#contrast-minimum
  // https://www.w3.org/TR/WCAG21/#contrast-enhanced
  const minContrast = isFixedColorDark ? 12 : 4.5;

  baseHSL[2] = isFixedColorDark
    ? Math.sqrt(baseHSL[2])
    : 1 - Math.sqrt(1 - baseHSL[2]);

  if (contrastRatio(baseHSL, fixedHSL, output) < minContrast) {
    let start, end;
    if (isFixedColorDark) {
      start = baseHSL[2];
      end = 1;
    } else {
      start = 0;
      end = baseHSL[2];
    }
    const PRECISION = 0.005;
    while (end - start > PRECISION) {
      const mid = (baseHSL[2] = (start + end) / 2);
      if (
        isFixedColorDark ===
        contrastRatio(baseHSL, fixedHSL, output) < minContrast
      ) {
        start = mid;
      } else {
        end = mid;
      }
    }
    baseHSL[2] = isFixedColorDark ? end : start;
  }

  HSLToRGB(baseHSL, output);
  cachedValue = Util.makeHexColor(
    Math.round(output[0] * 255),
    Math.round(output[1] * 255),
    Math.round(output[2] * 255)
  );
  contrastCache.set(key, cachedValue);
  return cachedValue;
}

function renderRichText({ html, dir, className }, container) {
  const fragment = document.createDocumentFragment();
  if (typeof html === "string") {
    const p = document.createElement("p");
    p.dir = dir || "auto";
    const lines = html.split(/(?:\r\n?|\n)/);
    for (let i = 0, ii = lines.length; i < ii; ++i) {
      const line = lines[i];
      p.append(document.createTextNode(line));
      if (i < ii - 1) {
        p.append(document.createElement("br"));
      }
    }
    fragment.append(p);
  } else {
    XfaLayer.render({
      xfaHtml: html,
      div: fragment,
      intent: "richText",
    });
  }
  fragment.firstChild.classList.add("richText", className);
  container.append(fragment);
}

const INITIAL_DATA = Symbol("INITIAL_DATA");

/**
 * A PDF document and page is built of many objects. E.g. there are objects for
 * fonts, images, rendering code, etc. These objects may get processed inside of
 * a worker. This class implements some basic methods to manage these objects.
 */
class PDFObjects {
  #objs = Object.create(null);

  /**
   * Ensures there is an object defined for `objId`.
   *
   * @param {string} objId
   * @returns {Object}
   */
  #ensureObj(objId) {
    return (this.#objs[objId] ||= {
      ...Promise.withResolvers(),
      data: INITIAL_DATA,
    });
  }

  /**
   * If called *without* callback, this returns the data of `objId` but the
   * object needs to be resolved. If it isn't, this method throws.
   *
   * If called *with* a callback, the callback is called with the data of the
   * object once the object is resolved. That means, if you call this method
   * and the object is already resolved, the callback gets called right away.
   *
   * @param {string} objId
   * @param {function} [callback]
   * @returns {any}
   */
  get(objId, callback = null) {
    // If there is a callback, then the get can be async and the object is
    // not required to be resolved right now.
    if (callback) {
      const obj = this.#ensureObj(objId);
      obj.promise.then(() => callback(obj.data));
      return null;
    }
    // If there isn't a callback, the user expects to get the resolved data
    // directly.
    const obj = this.#objs[objId];
    // If there isn't an object yet or the object isn't resolved, then the
    // data isn't ready yet!
    if (!obj || obj.data === INITIAL_DATA) {
      throw new Error(`Requesting object that isn't resolved yet ${objId}.`);
    }
    return obj.data;
  }

  /**
   * @param {string} objId
   * @returns {boolean}
   */
  has(objId) {
    const obj = this.#objs[objId];
    return !!obj && obj.data !== INITIAL_DATA;
  }

  /**
   * @param {string} objId
   * @returns {boolean}
   */
  delete(objId) {
    const obj = this.#objs[objId];
    if (!obj || obj.data === INITIAL_DATA) {
      // Only allow removing the object *after* it's been resolved.
      return false;
    }
    delete this.#objs[objId];
    return true;
  }

  /**
   * Resolves the object `objId` with optional `data`.
   *
   * @param {string} objId
   * @param {any} [data]
   */
  resolve(objId, data = null) {
    const obj = this.#ensureObj(objId);
    obj.data = data;
    obj.resolve();
  }

  clear() {
    for (const objId in this.#objs) {
      const { data } = this.#objs[objId];
      data?.bitmap?.close(); // Release any `ImageBitmap` data.
    }
    this.#objs = Object.create(null);
  }

  *[Symbol.iterator]() {
    for (const objId in this.#objs) {
      const { data } = this.#objs[objId];

      if (data === INITIAL_DATA) {
        continue;
      }
      yield [objId, data];
    }
  }
}

export {
  applyOpacity,
  ColorScheme,
  CSSConstants,
  deprecated,
  fetchData,
  findContrastColor,
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
  noContextMenu,
  OutputScale,
  PageViewport,
  PDFDateString,
  PDFObjects,
  PixelsPerInch,
  RenderingCancelledException,
  renderRichText,
  setLayerDimensions,
  StatTimer,
  stopEvent,
  SupportedImageMimeTypes,
  SVG_NS,
};
