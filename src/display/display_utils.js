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

import { BaseException, DrawOPS, Util, warn } from "../shared/util.js";
import { MathClamp } from "../shared/math_clamp.js";

class PixelsPerInch {
  static CSS = 96.0;

  static PDF = 72.0;

  static PDF_TO_CSS_UNITS = this.CSS / this.PDF;
}

class RenderingCancelledException extends BaseException {
  constructor(msg, extraDelay = 0) {
    super(msg, "RenderingCancelledException");
    this.extraDelay = extraDelay;
  }
}

function getRGBA(color) {
  if (color.startsWith("#")) {
    // #RRGGBB or #RRGGBBAA
    const hex = color.slice(1);
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
      hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
    ];
  }

  if (color.startsWith("rgb(")) {
    // getComputedStyle(...).color returns a `rgb(R, G, B)` color.
    const [r, g, b] = color
      .slice(/* "rgb(".length */ 4, -1) // Strip out "rgb(" and ")".
      .split(",")
      .map(x => parseInt(x, 10));
    return [r, g, b, 1];
  }

  if (color.startsWith("rgba(")) {
    const parts = color
      .slice(/* "rgba(".length */ 5, -1) // Strip out "rgba(" and ")".
      .split(",");
    return [
      parseInt(parts[0], 10),
      parseInt(parts[1], 10),
      parseInt(parts[2], 10),
      parseFloat(parts[3]),
    ];
  }

  // color(srgb r g b / a) — CSS Color 4, used e.g. by Firefox alpha inputs.
  // Components are in [0, 1]; alpha may be "none" (treated as fully opaque).
  const m = color.match(
    /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+|none))?\)$/
  );
  if (m) {
    return [
      Math.round(parseFloat(m[1]) * 255),
      Math.round(parseFloat(m[2]) * 255),
      Math.round(parseFloat(m[3]) * 255),
      m[4] !== undefined && m[4] !== "none" ? parseFloat(m[4]) : 1,
    ];
  }

  return null;
}

function getRGB(color) {
  const rgba = getRGBA(color);
  if (!rgba) {
    warn(`Not a valid color format: "${color}"`);
    return [0, 0, 0];
  }
  return rgba.slice(0, 3);
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
    if (
      (typeof PDFJSDev === "undefined" || !PDFJSDev.test("WORKER_THREAD")) &&
      capAreaFactor >= 0
    ) {
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
const SupportedImageMimeTypes = new Set([
  "image/apng",
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
  "image/x-icon",
]);

function applyOpacity(color, opacity) {
  opacity = MathClamp(opacity ?? 1, 0, 1);
  const white = 255 * (1 - opacity);
  return color.map(c => Math.round(c * opacity + white));
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

function makePathFromDrawOPS(data) {
  // Using a SVG string is slightly slower than using the following loop.
  const path = new Path2D();
  if (!data) {
    return path;
  }
  for (let i = 0, ii = data.length; i < ii;) {
    switch (data[i++]) {
      case DrawOPS.moveTo:
        path.moveTo(data[i++], data[i++]);
        break;
      case DrawOPS.lineTo:
        path.lineTo(data[i++], data[i++]);
        break;
      case DrawOPS.curveTo:
        path.bezierCurveTo(
          data[i++],
          data[i++],
          data[i++],
          data[i++],
          data[i++],
          data[i++]
        );
        break;
      case DrawOPS.quadraticCurveTo:
        path.quadraticCurveTo(data[i++], data[i++], data[i++], data[i++]);
        break;
      case DrawOPS.closePath:
        path.closePath();
        break;
      default:
        warn(`Unrecognized drawing path operator: ${data[i - 1]}`);
        break;
    }
  }
  return path;
}

export {
  applyOpacity,
  computeLuminance,
  findContrastColor,
  getCurrentTransform,
  getCurrentTransformInverse,
  getRGB,
  getRGBA,
  makePathFromDrawOPS,
  OutputScale,
  PixelsPerInch,
  RenderingCancelledException,
  SupportedImageMimeTypes,
};
