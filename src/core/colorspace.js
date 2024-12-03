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

import {
  assert,
  FeatureTest,
  FormatError,
  info,
  shadow,
  unreachable,
  warn,
} from "../shared/util.js";
import { Dict, Name, Ref } from "./primitives.js";
import { BaseStream } from "./base_stream.js";
import { MissingDataException } from "./core_utils.js";

/**
 * Resizes an RGB image with 3 components.
 * @param {TypedArray} src - The source buffer.
 * @param {TypedArray} dest - The destination buffer.
 * @param {number} w1 - Original width.
 * @param {number} h1 - Original height.
 * @param {number} w2 - New width.
 * @param {number} h2 - New height.
 * @param {number} alpha01 - Size reserved for the alpha channel.
 */
function resizeRgbImage(src, dest, w1, h1, w2, h2, alpha01) {
  const COMPONENTS = 3;
  alpha01 = alpha01 !== 1 ? 0 : alpha01;
  const xRatio = w1 / w2;
  const yRatio = h1 / h2;
  let newIndex = 0,
    oldIndex;
  const xScaled = new Uint16Array(w2);
  const w1Scanline = w1 * COMPONENTS;

  for (let i = 0; i < w2; i++) {
    xScaled[i] = Math.floor(i * xRatio) * COMPONENTS;
  }
  for (let i = 0; i < h2; i++) {
    const py = Math.floor(i * yRatio) * w1Scanline;
    for (let j = 0; j < w2; j++) {
      oldIndex = py + xScaled[j];
      dest[newIndex++] = src[oldIndex++];
      dest[newIndex++] = src[oldIndex++];
      dest[newIndex++] = src[oldIndex++];
      newIndex += alpha01;
    }
  }
}

function resizeRgbaImage(src, dest, w1, h1, w2, h2, alpha01) {
  const xRatio = w1 / w2;
  const yRatio = h1 / h2;
  let newIndex = 0;
  const xScaled = new Uint16Array(w2);

  if (alpha01 === 1) {
    for (let i = 0; i < w2; i++) {
      xScaled[i] = Math.floor(i * xRatio);
    }
    const src32 = new Uint32Array(src.buffer);
    const dest32 = new Uint32Array(dest.buffer);
    const rgbMask = FeatureTest.isLittleEndian ? 0x00ffffff : 0xffffff00;
    for (let i = 0; i < h2; i++) {
      const buf = src32.subarray(Math.floor(i * yRatio) * w1);
      for (let j = 0; j < w2; j++) {
        dest32[newIndex++] |= buf[xScaled[j]] & rgbMask;
      }
    }
  } else {
    const COMPONENTS = 4;
    const w1Scanline = w1 * COMPONENTS;
    for (let i = 0; i < w2; i++) {
      xScaled[i] = Math.floor(i * xRatio) * COMPONENTS;
    }
    for (let i = 0; i < h2; i++) {
      const buf = src.subarray(Math.floor(i * yRatio) * w1Scanline);
      for (let j = 0; j < w2; j++) {
        const oldIndex = xScaled[j];
        dest[newIndex++] = buf[oldIndex];
        dest[newIndex++] = buf[oldIndex + 1];
        dest[newIndex++] = buf[oldIndex + 2];
      }
    }
  }
}

function copyRgbaImage(src, dest, alpha01) {
  if (alpha01 === 1) {
    const src32 = new Uint32Array(src.buffer);
    const dest32 = new Uint32Array(dest.buffer);
    const rgbMask = FeatureTest.isLittleEndian ? 0x00ffffff : 0xffffff00;
    for (let i = 0, ii = src32.length; i < ii; i++) {
      dest32[i] |= src32[i] & rgbMask;
    }
  } else {
    let j = 0;
    for (let i = 0, ii = src.length; i < ii; i += 4) {
      dest[j++] = src[i];
      dest[j++] = src[i + 1];
      dest[j++] = src[i + 2];
    }
  }
}

class ColorSpace {
  constructor(name, numComps) {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === ColorSpace
    ) {
      unreachable("Cannot initialize ColorSpace.");
    }
    this.name = name;
    this.numComps = numComps;
  }

  /**
   * Converts the color value to the RGB color. The color components are
   * located in the src array starting from the srcOffset. Returns the array
   * of the rgb components, each value ranging from [0,255].
   */
  getRgb(src, srcOffset) {
    const rgb = new Uint8ClampedArray(3);
    this.getRgbItem(src, srcOffset, rgb, 0);
    return rgb;
  }

  /**
   * Converts the color value to the RGB color, similar to the getRgb method.
   * The result placed into the dest array starting from the destOffset.
   */
  getRgbItem(src, srcOffset, dest, destOffset) {
    unreachable("Should not call ColorSpace.getRgbItem");
  }

  /**
   * Converts the specified number of the color values to the RGB colors.
   * The colors are located in the src array starting from the srcOffset.
   * The result is placed into the dest array starting from the destOffset.
   * The src array items shall be in [0,2^bits) range, the dest array items
   * will be in [0,255] range. alpha01 indicates how many alpha components
   * there are in the dest array; it will be either 0 (RGB array) or 1 (RGBA
   * array).
   */
  getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
    unreachable("Should not call ColorSpace.getRgbBuffer");
  }

  /**
   * Determines the number of bytes required to store the result of the
   * conversion done by the getRgbBuffer method. As in getRgbBuffer,
   * |alpha01| is either 0 (RGB output) or 1 (RGBA output).
   */
  getOutputLength(inputLength, alpha01) {
    unreachable("Should not call ColorSpace.getOutputLength");
  }

  /**
   * Returns true if source data will be equal the result/output data.
   */
  isPassthrough(bits) {
    return false;
  }

  /**
   * Refer to the static `ColorSpace.isDefaultDecode` method below.
   */
  isDefaultDecode(decodeMap, bpc) {
    return ColorSpace.isDefaultDecode(decodeMap, this.numComps);
  }

  /**
   * Fills in the RGB colors in the destination buffer.  alpha01 indicates
   * how many alpha components there are in the dest array; it will be either
   * 0 (RGB array) or 1 (RGBA array).
   */
  fillRgb(
    dest,
    originalWidth,
    originalHeight,
    width,
    height,
    actualHeight,
    bpc,
    comps,
    alpha01
  ) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        dest instanceof Uint8ClampedArray,
        'ColorSpace.fillRgb: Unsupported "dest" type.'
      );
    }
    const count = originalWidth * originalHeight;
    let rgbBuf = null;
    const numComponentColors = 1 << bpc;
    const needsResizing = originalHeight !== height || originalWidth !== width;

    if (this.isPassthrough(bpc)) {
      rgbBuf = comps;
    } else if (
      this.numComps === 1 &&
      count > numComponentColors &&
      this.name !== "DeviceGray" &&
      this.name !== "DeviceRGB"
    ) {
      // Optimization: create a color map when there is just one component and
      // we are converting more colors than the size of the color map. We
      // don't build the map if the colorspace is gray or rgb since those
      // methods are faster than building a map. This mainly offers big speed
      // ups for indexed and alternate colorspaces.
      //
      // TODO it may be worth while to cache the color map. While running
      // testing I never hit a cache so I will leave that out for now (perhaps
      // we are reparsing colorspaces too much?).
      const allColors =
        bpc <= 8
          ? new Uint8Array(numComponentColors)
          : new Uint16Array(numComponentColors);
      for (let i = 0; i < numComponentColors; i++) {
        allColors[i] = i;
      }
      const colorMap = new Uint8ClampedArray(numComponentColors * 3);
      this.getRgbBuffer(
        allColors,
        0,
        numComponentColors,
        colorMap,
        0,
        bpc,
        /* alpha01 = */ 0
      );

      if (!needsResizing) {
        // Fill in the RGB values directly into |dest|.
        let destPos = 0;
        for (let i = 0; i < count; ++i) {
          const key = comps[i] * 3;
          dest[destPos++] = colorMap[key];
          dest[destPos++] = colorMap[key + 1];
          dest[destPos++] = colorMap[key + 2];
          destPos += alpha01;
        }
      } else {
        rgbBuf = new Uint8Array(count * 3);
        let rgbPos = 0;
        for (let i = 0; i < count; ++i) {
          const key = comps[i] * 3;
          rgbBuf[rgbPos++] = colorMap[key];
          rgbBuf[rgbPos++] = colorMap[key + 1];
          rgbBuf[rgbPos++] = colorMap[key + 2];
        }
      }
    } else if (!needsResizing) {
      // Fill in the RGB values directly into |dest|.
      this.getRgbBuffer(comps, 0, width * actualHeight, dest, 0, bpc, alpha01);
    } else {
      rgbBuf = new Uint8ClampedArray(count * 3);
      this.getRgbBuffer(comps, 0, count, rgbBuf, 0, bpc, /* alpha01 = */ 0);
    }

    if (rgbBuf) {
      if (needsResizing) {
        resizeRgbImage(
          rgbBuf,
          dest,
          originalWidth,
          originalHeight,
          width,
          height,
          alpha01
        );
      } else {
        let destPos = 0,
          rgbPos = 0;
        for (let i = 0, ii = width * actualHeight; i < ii; i++) {
          dest[destPos++] = rgbBuf[rgbPos++];
          dest[destPos++] = rgbBuf[rgbPos++];
          dest[destPos++] = rgbBuf[rgbPos++];
          destPos += alpha01;
        }
      }
    }
  }

  /**
   * True if the colorspace has components in the default range of [0, 1].
   * This should be true for all colorspaces except for lab color spaces
   * which are [0,100], [-128, 127], [-128, 127].
   */
  get usesZeroToOneRange() {
    return shadow(this, "usesZeroToOneRange", true);
  }

  /**
   * @private
   */
  static _cache(cacheKey, xref, localColorSpaceCache, parsedColorSpace) {
    if (!localColorSpaceCache) {
      throw new Error(
        'ColorSpace._cache - expected "localColorSpaceCache" argument.'
      );
    }
    if (!parsedColorSpace) {
      throw new Error(
        'ColorSpace._cache - expected "parsedColorSpace" argument.'
      );
    }
    let csName, csRef;
    if (cacheKey instanceof Ref) {
      csRef = cacheKey;

      // If parsing succeeded, we know that this call cannot throw.
      cacheKey = xref.fetch(cacheKey);
    }
    if (cacheKey instanceof Name) {
      csName = cacheKey.name;
    }
    if (csName || csRef) {
      localColorSpaceCache.set(csName, csRef, parsedColorSpace);
    }
  }

  static getCached(cacheKey, xref, localColorSpaceCache) {
    if (!localColorSpaceCache) {
      throw new Error(
        'ColorSpace.getCached - expected "localColorSpaceCache" argument.'
      );
    }
    if (cacheKey instanceof Ref) {
      const localColorSpace = localColorSpaceCache.getByRef(cacheKey);
      if (localColorSpace) {
        return localColorSpace;
      }

      try {
        cacheKey = xref.fetch(cacheKey);
      } catch (ex) {
        if (ex instanceof MissingDataException) {
          throw ex;
        }
        // Any errors should be handled during parsing, rather than here.
      }
    }
    if (cacheKey instanceof Name) {
      const localColorSpace = localColorSpaceCache.getByName(cacheKey.name);
      if (localColorSpace) {
        return localColorSpace;
      }
    }
    return null;
  }

  static async parseAsync({
    cs,
    xref,
    resources = null,
    pdfFunctionFactory,
    localColorSpaceCache,
  }) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        !this.getCached(cs, xref, localColorSpaceCache),
        "Expected `ColorSpace.getCached` to have been manually checked " +
          "before calling `ColorSpace.parseAsync`."
      );
    }
    const parsedColorSpace = this._parse(
      cs,
      xref,
      resources,
      pdfFunctionFactory
    );

    // Attempt to cache the parsed ColorSpace, by name and/or reference.
    this._cache(cs, xref, localColorSpaceCache, parsedColorSpace);

    return parsedColorSpace;
  }

  static parse({
    cs,
    xref,
    resources = null,
    pdfFunctionFactory,
    localColorSpaceCache,
  }) {
    const cachedColorSpace = this.getCached(cs, xref, localColorSpaceCache);
    if (cachedColorSpace) {
      return cachedColorSpace;
    }
    const parsedColorSpace = this._parse(
      cs,
      xref,
      resources,
      pdfFunctionFactory
    );

    // Attempt to cache the parsed ColorSpace, by name and/or reference.
    this._cache(cs, xref, localColorSpaceCache, parsedColorSpace);

    return parsedColorSpace;
  }

  /**
   * @private
   */
  static _parse(cs, xref, resources = null, pdfFunctionFactory) {
    cs = xref.fetchIfRef(cs);
    if (cs instanceof Name) {
      switch (cs.name) {
        case "G":
        case "DeviceGray":
          return this.singletons.gray;
        case "RGB":
        case "DeviceRGB":
          return this.singletons.rgb;
        case "DeviceRGBA":
          return this.singletons.rgba;
        case "CMYK":
        case "DeviceCMYK":
          return this.singletons.cmyk;
        case "Pattern":
          return new PatternCS(/* baseCS = */ null);
        default:
          if (resources instanceof Dict) {
            const colorSpaces = resources.get("ColorSpace");
            if (colorSpaces instanceof Dict) {
              const resourcesCS = colorSpaces.get(cs.name);
              if (resourcesCS) {
                if (resourcesCS instanceof Name) {
                  return this._parse(
                    resourcesCS,
                    xref,
                    resources,
                    pdfFunctionFactory
                  );
                }
                cs = resourcesCS;
                break;
              }
            }
          }
          // Fallback to the default gray color space.
          warn(`Unrecognized ColorSpace: ${cs.name}`);
          return this.singletons.gray;
      }
    }
    if (Array.isArray(cs)) {
      const mode = xref.fetchIfRef(cs[0]).name;
      let params, numComps, baseCS, whitePoint, blackPoint, gamma;

      switch (mode) {
        case "G":
        case "DeviceGray":
          return this.singletons.gray;
        case "RGB":
        case "DeviceRGB":
          return this.singletons.rgb;
        case "CMYK":
        case "DeviceCMYK":
          return this.singletons.cmyk;
        case "CalGray":
          params = xref.fetchIfRef(cs[1]);
          whitePoint = params.getArray("WhitePoint");
          blackPoint = params.getArray("BlackPoint");
          gamma = params.get("Gamma");
          return new CalGrayCS(whitePoint, blackPoint, gamma);
        case "CalRGB":
          params = xref.fetchIfRef(cs[1]);
          whitePoint = params.getArray("WhitePoint");
          blackPoint = params.getArray("BlackPoint");
          gamma = params.getArray("Gamma");
          const matrix = params.getArray("Matrix");
          return new CalRGBCS(whitePoint, blackPoint, gamma, matrix);
        case "ICCBased":
          const stream = xref.fetchIfRef(cs[1]);
          const dict = stream.dict;
          numComps = dict.get("N");
          const alt = dict.get("Alternate");
          if (alt) {
            const altCS = this._parse(alt, xref, resources, pdfFunctionFactory);
            // Ensure that the number of components are correct,
            // and also (indirectly) that it is not a PatternCS.
            if (altCS.numComps === numComps) {
              return altCS;
            }
            warn("ICCBased color space: Ignoring incorrect /Alternate entry.");
          }
          if (numComps === 1) {
            return this.singletons.gray;
          } else if (numComps === 3) {
            return this.singletons.rgb;
          } else if (numComps === 4) {
            return this.singletons.cmyk;
          }
          break;
        case "Pattern":
          baseCS = cs[1] || null;
          if (baseCS) {
            baseCS = this._parse(baseCS, xref, resources, pdfFunctionFactory);
          }
          return new PatternCS(baseCS);
        case "I":
        case "Indexed":
          baseCS = this._parse(cs[1], xref, resources, pdfFunctionFactory);
          const hiVal = Math.max(0, Math.min(xref.fetchIfRef(cs[2]), 255));
          const lookup = xref.fetchIfRef(cs[3]);
          return new IndexedCS(baseCS, hiVal, lookup);
        case "Separation":
        case "DeviceN":
          const name = xref.fetchIfRef(cs[1]);
          numComps = Array.isArray(name) ? name.length : 1;
          baseCS = this._parse(cs[2], xref, resources, pdfFunctionFactory);
          const tintFn = pdfFunctionFactory.create(cs[3]);
          return new AlternateCS(numComps, baseCS, tintFn);
        case "Lab":
          params = xref.fetchIfRef(cs[1]);
          whitePoint = params.getArray("WhitePoint");
          blackPoint = params.getArray("BlackPoint");
          const range = params.getArray("Range");
          return new LabCS(whitePoint, blackPoint, range);
        default:
          // Fallback to the default gray color space.
          warn(`Unimplemented ColorSpace object: ${mode}`);
          return this.singletons.gray;
      }
    }
    // Fallback to the default gray color space.
    warn(`Unrecognized ColorSpace object: ${cs}`);
    return this.singletons.gray;
  }

  /**
   * Checks if a decode map matches the default decode map for a color space.
   * This handles the general decode maps where there are two values per
   * component, e.g. [0, 1, 0, 1, 0, 1] for a RGB color.
   * This does not handle Lab, Indexed, or Pattern decode maps since they are
   * slightly different.
   * @param {Array} decode - Decode map (usually from an image).
   * @param {number} numComps - Number of components the color space has.
   */
  static isDefaultDecode(decode, numComps) {
    if (!Array.isArray(decode)) {
      return true;
    }
    if (numComps * 2 !== decode.length) {
      warn("The decode map is not the correct length");
      return true;
    }
    for (let i = 0, ii = decode.length; i < ii; i += 2) {
      if (decode[i] !== 0 || decode[i + 1] !== 1) {
        return false;
      }
    }
    return true;
  }

  static get singletons() {
    return shadow(this, "singletons", {
      get gray() {
        return shadow(this, "gray", new DeviceGrayCS());
      },
      get rgb() {
        return shadow(this, "rgb", new DeviceRgbCS());
      },
      get rgba() {
        return shadow(this, "rgba", new DeviceRgbaCS());
      },
      get cmyk() {
        return shadow(this, "cmyk", new DeviceCmykCS());
      },
    });
  }
}

/**
 * Alternate color space handles both Separation and DeviceN color spaces.  A
 * Separation color space is actually just a DeviceN with one color component.
 * Both color spaces use a tinting function to convert colors to a base color
 * space.
 *
 * The default color is `new Float32Array(new Array(numComps).fill(1))`.
 */
class AlternateCS extends ColorSpace {
  constructor(numComps, base, tintFn) {
    super("Alternate", numComps);
    this.base = base;
    this.tintFn = tintFn;
    this.tmpBuf = new Float32Array(base.numComps);
  }

  getRgbItem(src, srcOffset, dest, destOffset) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        dest instanceof Uint8ClampedArray,
        'AlternateCS.getRgbItem: Unsupported "dest" type.'
      );
    }
    const tmpBuf = this.tmpBuf;
    this.tintFn(src, srcOffset, tmpBuf, 0);
    this.base.getRgbItem(tmpBuf, 0, dest, destOffset);
  }

  getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        dest instanceof Uint8ClampedArray,
        'AlternateCS.getRgbBuffer: Unsupported "dest" type.'
      );
    }
    const tintFn = this.tintFn;
    const base = this.base;
    const scale = 1 / ((1 << bits) - 1);
    const baseNumComps = base.numComps;
    const usesZeroToOneRange = base.usesZeroToOneRange;
    const isPassthrough =
      (base.isPassthrough(8) || !usesZeroToOneRange) && alpha01 === 0;
    let pos = isPassthrough ? destOffset : 0;
    const baseBuf = isPassthrough
      ? dest
      : new Uint8ClampedArray(baseNumComps * count);
    const numComps = this.numComps;

    const scaled = new Float32Array(numComps);
    const tinted = new Float32Array(baseNumComps);
    let i, j;

    for (i = 0; i < count; i++) {
      for (j = 0; j < numComps; j++) {
        scaled[j] = src[srcOffset++] * scale;
      }
      tintFn(scaled, 0, tinted, 0);
      if (usesZeroToOneRange) {
        for (j = 0; j < baseNumComps; j++) {
          baseBuf[pos++] = tinted[j] * 255;
        }
      } else {
        base.getRgbItem(tinted, 0, baseBuf, pos);
        pos += baseNumComps;
      }
    }

    if (!isPassthrough) {
      base.getRgbBuffer(baseBuf, 0, count, dest, destOffset, 8, alpha01);
    }
  }

  getOutputLength(inputLength, alpha01) {
    return this.base.getOutputLength(
      (inputLength * this.base.numComps) / this.numComps,
      alpha01
    );
  }
}

class PatternCS extends ColorSpace {
  constructor(baseCS) {
    super("Pattern", null);
    this.base = baseCS;
  }

  isDefaultDecode(decodeMap, bpc) {
    unreachable("Should not call PatternCS.isDefaultDecode");
  }
}

/**
 * The default color is `new Uint8Array([0])`.
 */
class IndexedCS extends ColorSpace {
  constructor(base, highVal, lookup) {
    super("Indexed", 1);
    this.base = base;

    const length = base.numComps * (highVal + 1);
    this.lookup = new Uint8Array(length);

    if (lookup instanceof BaseStream) {
      const bytes = lookup.getBytes(length);
      this.lookup.set(bytes);
    } else if (typeof lookup === "string") {
      for (let i = 0; i < length; ++i) {
        this.lookup[i] = lookup.charCodeAt(i) & 0xff;
      }
    } else {
      throw new FormatError(`IndexedCS - unrecognized lookup table: ${lookup}`);
    }
  }

  getRgbItem(src, srcOffset, dest, destOffset) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        dest instanceof Uint8ClampedArray,
        'IndexedCS.getRgbItem: Unsupported "dest" type.'
      );
    }
    const numComps = this.base.numComps;
    const start = src[srcOffset] * numComps;
    this.base.getRgbBuffer(this.lookup, start, 1, dest, destOffset, 8, 0);
  }

  getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        dest instanceof Uint8ClampedArray,
        'IndexedCS.getRgbBuffer: Unsupported "dest" type.'
      );
    }
    const base = this.base;
    const numComps = base.numComps;
    const outputDelta = base.getOutputLength(numComps, alpha01);
    const lookup = this.lookup;

    for (let i = 0; i < count; ++i) {
      const lookupPos = src[srcOffset++] * numComps;
      base.getRgbBuffer(lookup, lookupPos, 1, dest, destOffset, 8, alpha01);
      destOffset += outputDelta;
    }
  }

  getOutputLength(inputLength, alpha01) {
    return this.base.getOutputLength(inputLength * this.base.numComps, alpha01);
  }

  isDefaultDecode(decodeMap, bpc) {
    if (!Array.isArray(decodeMap)) {
      return true;
    }
    if (decodeMap.length !== 2) {
      warn("Decode map length is not correct");
      return true;
    }
    if (!Number.isInteger(bpc) || bpc < 1) {
      warn("Bits per component is not correct");
      return true;
    }
    return decodeMap[0] === 0 && decodeMap[1] === (1 << bpc) - 1;
  }
}

/**
 * The default color is `new Float32Array([0])`.
 */
class DeviceGrayCS extends ColorSpace {
  constructor() {
    super("DeviceGray", 1);
  }

  getRgbItem(src, srcOffset, dest, destOffset) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        dest instanceof Uint8ClampedArray,
        'DeviceGrayCS.getRgbItem: Unsupported "dest" type.'
      );
    }
    const c = src[srcOffset] * 255;
    dest[destOffset] = dest[destOffset + 1] = dest[destOffset + 2] = c;
  }

  getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        dest instanceof Uint8ClampedArray,
        'DeviceGrayCS.getRgbBuffer: Unsupported "dest" type.'
      );
    }
    const scale = 255 / ((1 << bits) - 1);
    let j = srcOffset,
      q = destOffset;
    for (let i = 0; i < count; ++i) {
      const c = scale * src[j++];
      dest[q++] = c;
      dest[q++] = c;
      dest[q++] = c;
      q += alpha01;
    }
  }

  getOutputLength(inputLength, alpha01) {
    return inputLength * (3 + alpha01);
  }
}

/**
 * The default color is `new Float32Array([0, 0, 0])`.
 */
class DeviceRgbCS extends ColorSpace {
  constructor() {
    super("DeviceRGB", 3);
  }

  getRgbItem(src, srcOffset, dest, destOffset) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        dest instanceof Uint8ClampedArray,
        'DeviceRgbCS.getRgbItem: Unsupported "dest" type.'
      );
    }
    dest[destOffset] = src[srcOffset] * 255;
    dest[destOffset + 1] = src[srcOffset + 1] * 255;
    dest[destOffset + 2] = src[srcOffset + 2] * 255;
  }

  getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        dest instanceof Uint8ClampedArray,
        'DeviceRgbCS.getRgbBuffer: Unsupported "dest" type.'
      );
    }
    if (bits === 8 && alpha01 === 0) {
      dest.set(src.subarray(srcOffset, srcOffset + count * 3), destOffset);
      return;
    }
    const scale = 255 / ((1 << bits) - 1);
    let j = srcOffset,
      q = destOffset;
    for (let i = 0; i < count; ++i) {
      dest[q++] = scale * src[j++];
      dest[q++] = scale * src[j++];
      dest[q++] = scale * src[j++];
      q += alpha01;
    }
  }

  getOutputLength(inputLength, alpha01) {
    return ((inputLength * (3 + alpha01)) / 3) | 0;
  }

  isPassthrough(bits) {
    return bits === 8;
  }
}

/**
 * The default color is `new Float32Array([0, 0, 0, 1])`.
 */
class DeviceRgbaCS extends ColorSpace {
  constructor() {
    super("DeviceRGBA", 4);
  }

  getOutputLength(inputLength, _alpha01) {
    return inputLength * 4;
  }

  isPassthrough(bits) {
    return bits === 8;
  }

  fillRgb(
    dest,
    originalWidth,
    originalHeight,
    width,
    height,
    actualHeight,
    bpc,
    comps,
    alpha01
  ) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        dest instanceof Uint8ClampedArray,
        'DeviceRgbaCS.fillRgb: Unsupported "dest" type.'
      );
    }
    if (originalHeight !== height || originalWidth !== width) {
      resizeRgbaImage(
        comps,
        dest,
        originalWidth,
        originalHeight,
        width,
        height,
        alpha01
      );
    } else {
      copyRgbaImage(comps, dest, alpha01);
    }
  }
}

/**
 * The default color is `new Float32Array([0, 0, 0, 1])`.
 */
class DeviceCmykCS extends ColorSpace {
  constructor() {
    super("DeviceCMYK", 4);
  }

  // The coefficients below was found using numerical analysis: the method of
  // steepest descent for the sum((f_i - color_value_i)^2) for r/g/b colors,
  // where color_value is the tabular value from the table of sampled RGB colors
  // from CMYK US Web Coated (SWOP) colorspace, and f_i is the corresponding
  // CMYK color conversion using the estimation below:
  //   f(A, B,.. N) = Acc+Bcm+Ccy+Dck+c+Fmm+Gmy+Hmk+Im+Jyy+Kyk+Ly+Mkk+Nk+255
  #toRgb(src, srcOffset, srcScale, dest, destOffset) {
    const c = src[srcOffset] * srcScale;
    const m = src[srcOffset + 1] * srcScale;
    const y = src[srcOffset + 2] * srcScale;
    const k = src[srcOffset + 3] * srcScale;

    dest[destOffset] =
      255 +
      c *
        (-4.387332384609988 * c +
          54.48615194189176 * m +
          18.82290502165302 * y +
          212.25662451639585 * k +
          -285.2331026137004) +
      m *
        (1.7149763477362134 * m -
          5.6096736904047315 * y +
          -17.873870861415444 * k -
          5.497006427196366) +
      y *
        (-2.5217340131683033 * y - 21.248923337353073 * k + 17.5119270841813) +
      k * (-21.86122147463605 * k - 189.48180835922747);

    dest[destOffset + 1] =
      255 +
      c *
        (8.841041422036149 * c +
          60.118027045597366 * m +
          6.871425592049007 * y +
          31.159100130055922 * k +
          -79.2970844816548) +
      m *
        (-15.310361306967817 * m +
          17.575251261109482 * y +
          131.35250912493976 * k -
          190.9453302588951) +
      y * (4.444339102852739 * y + 9.8632861493405 * k - 24.86741582555878) +
      k * (-20.737325471181034 * k - 187.80453709719578);

    dest[destOffset + 2] =
      255 +
      c *
        (0.8842522430003296 * c +
          8.078677503112928 * m +
          30.89978309703729 * y -
          0.23883238689178934 * k +
          -14.183576799673286) +
      m *
        (10.49593273432072 * m +
          63.02378494754052 * y +
          50.606957656360734 * k -
          112.23884253719248) +
      y *
        (0.03296041114873217 * y +
          115.60384449646641 * k +
          -193.58209356861505) +
      k * (-22.33816807309886 * k - 180.12613974708367);
  }

  getRgbItem(src, srcOffset, dest, destOffset) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        dest instanceof Uint8ClampedArray,
        'DeviceCmykCS.getRgbItem: Unsupported "dest" type.'
      );
    }
    this.#toRgb(src, srcOffset, 1, dest, destOffset);
  }

  getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        dest instanceof Uint8ClampedArray,
        'DeviceCmykCS.getRgbBuffer: Unsupported "dest" type.'
      );
    }
    const scale = 1 / ((1 << bits) - 1);
    for (let i = 0; i < count; i++) {
      this.#toRgb(src, srcOffset, scale, dest, destOffset);
      srcOffset += 4;
      destOffset += 3 + alpha01;
    }
  }

  getOutputLength(inputLength, alpha01) {
    return ((inputLength / 4) * (3 + alpha01)) | 0;
  }
}

/**
 * CalGrayCS: Based on "PDF Reference, Sixth Ed", p.245
 *
 * The default color is `new Float32Array([0])`.
 */
class CalGrayCS extends ColorSpace {
  constructor(whitePoint, blackPoint, gamma) {
    super("CalGray", 1);

    if (!whitePoint) {
      throw new FormatError(
        "WhitePoint missing - required for color space CalGray"
      );
    }
    // Translate arguments to spec variables.
    [this.XW, this.YW, this.ZW] = whitePoint;
    [this.XB, this.YB, this.ZB] = blackPoint || [0, 0, 0];
    this.G = gamma || 1;

    // Validate variables as per spec.
    if (this.XW < 0 || this.ZW < 0 || this.YW !== 1) {
      throw new FormatError(
        `Invalid WhitePoint components for ${this.name}, no fallback available`
      );
    }

    if (this.XB < 0 || this.YB < 0 || this.ZB < 0) {
      info(`Invalid BlackPoint for ${this.name}, falling back to default.`);
      this.XB = this.YB = this.ZB = 0;
    }

    if (this.XB !== 0 || this.YB !== 0 || this.ZB !== 0) {
      warn(
        `${this.name}, BlackPoint: XB: ${this.XB}, YB: ${this.YB}, ` +
          `ZB: ${this.ZB}, only default values are supported.`
      );
    }

    if (this.G < 1) {
      info(
        `Invalid Gamma: ${this.G} for ${this.name}, falling back to default.`
      );
      this.G = 1;
    }
  }

  #toRgb(src, srcOffset, dest, destOffset, scale) {
    // A represents a gray component of a calibrated gray space.
    // A <---> AG in the spec
    const A = src[srcOffset] * scale;
    const AG = A ** this.G;

    // Computes L as per spec. ( = this.YW * AG )
    // Except if other than default BlackPoint values are used.
    const L = this.YW * AG;
    // http://www.poynton.com/notes/colour_and_gamma/ColorFAQ.html, Ch 4.
    // Convert values to rgb range [0, 255].
    const val = Math.max(295.8 * L ** 0.3333333333333333 - 40.8, 0);
    dest[destOffset] = val;
    dest[destOffset + 1] = val;
    dest[destOffset + 2] = val;
  }

  getRgbItem(src, srcOffset, dest, destOffset) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        dest instanceof Uint8ClampedArray,
        'CalGrayCS.getRgbItem: Unsupported "dest" type.'
      );
    }
    this.#toRgb(src, srcOffset, dest, destOffset, 1);
  }

  getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        dest instanceof Uint8ClampedArray,
        'CalGrayCS.getRgbBuffer: Unsupported "dest" type.'
      );
    }
    const scale = 1 / ((1 << bits) - 1);

    for (let i = 0; i < count; ++i) {
      this.#toRgb(src, srcOffset, dest, destOffset, scale);
      srcOffset += 1;
      destOffset += 3 + alpha01;
    }
  }

  getOutputLength(inputLength, alpha01) {
    return inputLength * (3 + alpha01);
  }
}

/**
 * CalRGBCS: Based on "PDF Reference, Sixth Ed", p.247
 *
 * The default color is `new Float32Array([0, 0, 0])`.
 */
class CalRGBCS extends ColorSpace {
  // See http://www.brucelindbloom.com/index.html?Eqn_ChromAdapt.html for these
  // matrices.
  // prettier-ignore
  static #BRADFORD_SCALE_MATRIX = new Float32Array([
    0.8951, 0.2664, -0.1614,
    -0.7502, 1.7135, 0.0367,
    0.0389, -0.0685, 1.0296]);

  // prettier-ignore
  static #BRADFORD_SCALE_INVERSE_MATRIX = new Float32Array([
    0.9869929, -0.1470543, 0.1599627,
    0.4323053, 0.5183603, 0.0492912,
    -0.0085287, 0.0400428, 0.9684867]);

  // See http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html.
  // prettier-ignore
  static #SRGB_D65_XYZ_TO_RGB_MATRIX = new Float32Array([
    3.2404542, -1.5371385, -0.4985314,
    -0.9692660, 1.8760108, 0.0415560,
    0.0556434, -0.2040259, 1.0572252]);

  static #FLAT_WHITEPOINT_MATRIX = new Float32Array([1, 1, 1]);

  static #tempNormalizeMatrix = new Float32Array(3);

  static #tempConvertMatrix1 = new Float32Array(3);

  static #tempConvertMatrix2 = new Float32Array(3);

  static #DECODE_L_CONSTANT = ((8 + 16) / 116) ** 3 / 8.0;

  constructor(whitePoint, blackPoint, gamma, matrix) {
    super("CalRGB", 3);

    if (!whitePoint) {
      throw new FormatError(
        "WhitePoint missing - required for color space CalRGB"
      );
    }
    // Translate arguments to spec variables.
    const [XW, YW, ZW] = (this.whitePoint = whitePoint);
    const [XB, YB, ZB] = (this.blackPoint = blackPoint || new Float32Array(3));

    [this.GR, this.GG, this.GB] = gamma || new Float32Array([1, 1, 1]);
    [
      this.MXA,
      this.MYA,
      this.MZA,
      this.MXB,
      this.MYB,
      this.MZB,
      this.MXC,
      this.MYC,
      this.MZC,
    ] = matrix || new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

    // Validate variables as per spec.
    if (XW < 0 || ZW < 0 || YW !== 1) {
      throw new FormatError(
        `Invalid WhitePoint components for ${this.name}, no fallback available`
      );
    }

    if (XB < 0 || YB < 0 || ZB < 0) {
      info(
        `Invalid BlackPoint for ${this.name} [${XB}, ${YB}, ${ZB}], ` +
          "falling back to default."
      );
      this.blackPoint = new Float32Array(3);
    }

    if (this.GR < 0 || this.GG < 0 || this.GB < 0) {
      info(
        `Invalid Gamma [${this.GR}, ${this.GG}, ${this.GB}] for ` +
          `${this.name}, falling back to default.`
      );
      this.GR = this.GG = this.GB = 1;
    }
  }

  #matrixProduct(a, b, result) {
    result[0] = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    result[1] = a[3] * b[0] + a[4] * b[1] + a[5] * b[2];
    result[2] = a[6] * b[0] + a[7] * b[1] + a[8] * b[2];
  }

  #toFlat(sourceWhitePoint, LMS, result) {
    result[0] = (LMS[0] * 1) / sourceWhitePoint[0];
    result[1] = (LMS[1] * 1) / sourceWhitePoint[1];
    result[2] = (LMS[2] * 1) / sourceWhitePoint[2];
  }

  #toD65(sourceWhitePoint, LMS, result) {
    const D65X = 0.95047;
    const D65Y = 1;
    const D65Z = 1.08883;

    result[0] = (LMS[0] * D65X) / sourceWhitePoint[0];
    result[1] = (LMS[1] * D65Y) / sourceWhitePoint[1];
    result[2] = (LMS[2] * D65Z) / sourceWhitePoint[2];
  }

  #sRGBTransferFunction(color) {
    // See http://en.wikipedia.org/wiki/SRGB.
    if (color <= 0.0031308) {
      return this.#adjustToRange(0, 1, 12.92 * color);
    }
    // Optimization:
    // If color is close enough to 1, skip calling the following transform
    // since calling Math.pow is expensive. If color is larger than
    // the threshold, the final result is larger than 254.5 since
    // ((1 + 0.055) * 0.99554525 ** (1 / 2.4) - 0.055) * 255 ===
    // 254.50000003134699
    if (color >= 0.99554525) {
      return 1;
    }
    return this.#adjustToRange(0, 1, (1 + 0.055) * color ** (1 / 2.4) - 0.055);
  }

  #adjustToRange(min, max, value) {
    return Math.max(min, Math.min(max, value));
  }

  #decodeL(L) {
    if (L < 0) {
      return -this.#decodeL(-L);
    }
    if (L > 8.0) {
      return ((L + 16) / 116) ** 3;
    }
    return L * CalRGBCS.#DECODE_L_CONSTANT;
  }

  #compensateBlackPoint(sourceBlackPoint, XYZ_Flat, result) {
    // In case the blackPoint is already the default blackPoint then there is
    // no need to do compensation.
    if (
      sourceBlackPoint[0] === 0 &&
      sourceBlackPoint[1] === 0 &&
      sourceBlackPoint[2] === 0
    ) {
      result[0] = XYZ_Flat[0];
      result[1] = XYZ_Flat[1];
      result[2] = XYZ_Flat[2];
      return;
    }

    // For the blackPoint calculation details, please see
    // http://www.adobe.com/content/dam/Adobe/en/devnet/photoshop/sdk/
    // AdobeBPC.pdf.
    // The destination blackPoint is the default blackPoint [0, 0, 0].
    const zeroDecodeL = this.#decodeL(0);

    const X_DST = zeroDecodeL;
    const X_SRC = this.#decodeL(sourceBlackPoint[0]);

    const Y_DST = zeroDecodeL;
    const Y_SRC = this.#decodeL(sourceBlackPoint[1]);

    const Z_DST = zeroDecodeL;
    const Z_SRC = this.#decodeL(sourceBlackPoint[2]);

    const X_Scale = (1 - X_DST) / (1 - X_SRC);
    const X_Offset = 1 - X_Scale;

    const Y_Scale = (1 - Y_DST) / (1 - Y_SRC);
    const Y_Offset = 1 - Y_Scale;

    const Z_Scale = (1 - Z_DST) / (1 - Z_SRC);
    const Z_Offset = 1 - Z_Scale;

    result[0] = XYZ_Flat[0] * X_Scale + X_Offset;
    result[1] = XYZ_Flat[1] * Y_Scale + Y_Offset;
    result[2] = XYZ_Flat[2] * Z_Scale + Z_Offset;
  }

  #normalizeWhitePointToFlat(sourceWhitePoint, XYZ_In, result) {
    // In case the whitePoint is already flat then there is no need to do
    // normalization.
    if (sourceWhitePoint[0] === 1 && sourceWhitePoint[2] === 1) {
      result[0] = XYZ_In[0];
      result[1] = XYZ_In[1];
      result[2] = XYZ_In[2];
      return;
    }

    const LMS = result;
    this.#matrixProduct(CalRGBCS.#BRADFORD_SCALE_MATRIX, XYZ_In, LMS);

    const LMS_Flat = CalRGBCS.#tempNormalizeMatrix;
    this.#toFlat(sourceWhitePoint, LMS, LMS_Flat);

    this.#matrixProduct(
      CalRGBCS.#BRADFORD_SCALE_INVERSE_MATRIX,
      LMS_Flat,
      result
    );
  }

  #normalizeWhitePointToD65(sourceWhitePoint, XYZ_In, result) {
    const LMS = result;
    this.#matrixProduct(CalRGBCS.#BRADFORD_SCALE_MATRIX, XYZ_In, LMS);

    const LMS_D65 = CalRGBCS.#tempNormalizeMatrix;
    this.#toD65(sourceWhitePoint, LMS, LMS_D65);

    this.#matrixProduct(
      CalRGBCS.#BRADFORD_SCALE_INVERSE_MATRIX,
      LMS_D65,
      result
    );
  }

  #toRgb(src, srcOffset, dest, destOffset, scale) {
    // A, B and C represent a red, green and blue components of a calibrated
    // rgb space.
    const A = this.#adjustToRange(0, 1, src[srcOffset] * scale);
    const B = this.#adjustToRange(0, 1, src[srcOffset + 1] * scale);
    const C = this.#adjustToRange(0, 1, src[srcOffset + 2] * scale);

    // A <---> AGR in the spec
    // B <---> BGG in the spec
    // C <---> CGB in the spec
    const AGR = A === 1 ? 1 : A ** this.GR;
    const BGG = B === 1 ? 1 : B ** this.GG;
    const CGB = C === 1 ? 1 : C ** this.GB;

    // Computes intermediate variables L, M, N as per spec.
    // To decode X, Y, Z values map L, M, N directly to them.
    const X = this.MXA * AGR + this.MXB * BGG + this.MXC * CGB;
    const Y = this.MYA * AGR + this.MYB * BGG + this.MYC * CGB;
    const Z = this.MZA * AGR + this.MZB * BGG + this.MZC * CGB;

    // The following calculations are based on this document:
    // http://www.adobe.com/content/dam/Adobe/en/devnet/photoshop/sdk/
    // AdobeBPC.pdf.
    const XYZ = CalRGBCS.#tempConvertMatrix1;
    XYZ[0] = X;
    XYZ[1] = Y;
    XYZ[2] = Z;
    const XYZ_Flat = CalRGBCS.#tempConvertMatrix2;

    this.#normalizeWhitePointToFlat(this.whitePoint, XYZ, XYZ_Flat);

    const XYZ_Black = CalRGBCS.#tempConvertMatrix1;
    this.#compensateBlackPoint(this.blackPoint, XYZ_Flat, XYZ_Black);

    const XYZ_D65 = CalRGBCS.#tempConvertMatrix2;
    this.#normalizeWhitePointToD65(
      CalRGBCS.#FLAT_WHITEPOINT_MATRIX,
      XYZ_Black,
      XYZ_D65
    );

    const SRGB = CalRGBCS.#tempConvertMatrix1;
    this.#matrixProduct(CalRGBCS.#SRGB_D65_XYZ_TO_RGB_MATRIX, XYZ_D65, SRGB);

    // Convert the values to rgb range [0, 255].
    dest[destOffset] = this.#sRGBTransferFunction(SRGB[0]) * 255;
    dest[destOffset + 1] = this.#sRGBTransferFunction(SRGB[1]) * 255;
    dest[destOffset + 2] = this.#sRGBTransferFunction(SRGB[2]) * 255;
  }

  getRgbItem(src, srcOffset, dest, destOffset) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        dest instanceof Uint8ClampedArray,
        'CalRGBCS.getRgbItem: Unsupported "dest" type.'
      );
    }
    this.#toRgb(src, srcOffset, dest, destOffset, 1);
  }

  getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        dest instanceof Uint8ClampedArray,
        'CalRGBCS.getRgbBuffer: Unsupported "dest" type.'
      );
    }
    const scale = 1 / ((1 << bits) - 1);

    for (let i = 0; i < count; ++i) {
      this.#toRgb(src, srcOffset, dest, destOffset, scale);
      srcOffset += 3;
      destOffset += 3 + alpha01;
    }
  }

  getOutputLength(inputLength, alpha01) {
    return ((inputLength * (3 + alpha01)) / 3) | 0;
  }
}

/**
 * LabCS: Based on "PDF Reference, Sixth Ed", p.250
 *
 * The default color is `new Float32Array([0, 0, 0])`.
 */
class LabCS extends ColorSpace {
  constructor(whitePoint, blackPoint, range) {
    super("Lab", 3);

    if (!whitePoint) {
      throw new FormatError(
        "WhitePoint missing - required for color space Lab"
      );
    }
    // Translate args to spec variables
    [this.XW, this.YW, this.ZW] = whitePoint;
    [this.amin, this.amax, this.bmin, this.bmax] = range || [
      -100, 100, -100, 100,
    ];

    // These are here just for completeness - the spec doesn't offer any
    // formulas that use BlackPoint in Lab
    [this.XB, this.YB, this.ZB] = blackPoint || [0, 0, 0];

    // Validate vars as per spec
    if (this.XW < 0 || this.ZW < 0 || this.YW !== 1) {
      throw new FormatError(
        "Invalid WhitePoint components, no fallback available"
      );
    }

    if (this.XB < 0 || this.YB < 0 || this.ZB < 0) {
      info("Invalid BlackPoint, falling back to default");
      this.XB = this.YB = this.ZB = 0;
    }

    if (this.amin > this.amax || this.bmin > this.bmax) {
      info("Invalid Range, falling back to defaults");
      this.amin = -100;
      this.amax = 100;
      this.bmin = -100;
      this.bmax = 100;
    }
  }

  // Function g(x) from spec
  #fn_g(x) {
    return x >= 6 / 29 ? x ** 3 : (108 / 841) * (x - 4 / 29);
  }

  #decode(value, high1, low2, high2) {
    return low2 + (value * (high2 - low2)) / high1;
  }

  // If decoding is needed maxVal should be 2^bits per component - 1.
  #toRgb(src, srcOffset, maxVal, dest, destOffset) {
    // XXX: Lab input is in the range of [0, 100], [amin, amax], [bmin, bmax]
    // not the usual [0, 1]. If a command like setFillColor is used the src
    // values will already be within the correct range. However, if we are
    // converting an image we have to map the values to the correct range given
    // above.
    // Ls,as,bs <---> L*,a*,b* in the spec
    let Ls = src[srcOffset];
    let as = src[srcOffset + 1];
    let bs = src[srcOffset + 2];
    if (maxVal !== false) {
      Ls = this.#decode(Ls, maxVal, 0, 100);
      as = this.#decode(as, maxVal, this.amin, this.amax);
      bs = this.#decode(bs, maxVal, this.bmin, this.bmax);
    }

    // Adjust limits of 'as' and 'bs'
    if (as > this.amax) {
      as = this.amax;
    } else if (as < this.amin) {
      as = this.amin;
    }
    if (bs > this.bmax) {
      bs = this.bmax;
    } else if (bs < this.bmin) {
      bs = this.bmin;
    }

    // Computes intermediate variables X,Y,Z as per spec
    const M = (Ls + 16) / 116;
    const L = M + as / 500;
    const N = M - bs / 200;

    const X = this.XW * this.#fn_g(L);
    const Y = this.YW * this.#fn_g(M);
    const Z = this.ZW * this.#fn_g(N);

    let r, g, b;
    // Using different conversions for D50 and D65 white points,
    // per http://www.color.org/srgb.pdf
    if (this.ZW < 1) {
      // Assuming D50 (X=0.9642, Y=1.00, Z=0.8249)
      r = X * 3.1339 + Y * -1.617 + Z * -0.4906;
      g = X * -0.9785 + Y * 1.916 + Z * 0.0333;
      b = X * 0.072 + Y * -0.229 + Z * 1.4057;
    } else {
      // Assuming D65 (X=0.9505, Y=1.00, Z=1.0888)
      r = X * 3.2406 + Y * -1.5372 + Z * -0.4986;
      g = X * -0.9689 + Y * 1.8758 + Z * 0.0415;
      b = X * 0.0557 + Y * -0.204 + Z * 1.057;
    }
    // Convert the color values to the [0,255] range (clamping is automatic).
    dest[destOffset] = Math.sqrt(r) * 255;
    dest[destOffset + 1] = Math.sqrt(g) * 255;
    dest[destOffset + 2] = Math.sqrt(b) * 255;
  }

  getRgbItem(src, srcOffset, dest, destOffset) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        dest instanceof Uint8ClampedArray,
        'LabCS.getRgbItem: Unsupported "dest" type.'
      );
    }
    this.#toRgb(src, srcOffset, false, dest, destOffset);
  }

  getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        dest instanceof Uint8ClampedArray,
        'LabCS.getRgbBuffer: Unsupported "dest" type.'
      );
    }
    const maxVal = (1 << bits) - 1;
    for (let i = 0; i < count; i++) {
      this.#toRgb(src, srcOffset, maxVal, dest, destOffset);
      srcOffset += 3;
      destOffset += 3 + alpha01;
    }
  }

  getOutputLength(inputLength, alpha01) {
    return ((inputLength * (3 + alpha01)) / 3) | 0;
  }

  isDefaultDecode(decodeMap, bpc) {
    // XXX: Decoding is handled with the lab conversion because of the strange
    // ranges that are used.
    return true;
  }

  get usesZeroToOneRange() {
    return shadow(this, "usesZeroToOneRange", false);
  }
}

export { ColorSpace };
