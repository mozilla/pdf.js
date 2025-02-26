/* Copyright 2024 Mozilla Foundation
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
  AlternateCS,
  CalGrayCS,
  CalRGBCS,
  DeviceCmykCS,
  DeviceGrayCS,
  DeviceRgbaCS,
  DeviceRgbCS,
  IndexedCS,
  LabCS,
  PatternCS,
} from "./colorspace.js";
import { assert, shadow, warn } from "../shared/util.js";
import { Dict, Name, Ref } from "./primitives.js";
import { IccColorSpace } from "./icc_colorspace.js";
import { MissingDataException } from "./core_utils.js";

class ColorSpaceUtils {
  /**
   * @private
   */
  static #cache(
    cacheKey,
    parsedCS,
    { xref, globalColorSpaceCache, localColorSpaceCache }
  ) {
    if (!globalColorSpaceCache || !localColorSpaceCache) {
      throw new Error(
        'ColorSpace.#cache - expected "globalColorSpaceCache"/"localColorSpaceCache" argument.'
      );
    }
    if (!parsedCS) {
      throw new Error('ColorSpace.#cache - expected "parsedCS" argument.');
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
      localColorSpaceCache.set(csName, csRef, parsedCS);

      if (csRef) {
        globalColorSpaceCache.set(/* name = */ null, csRef, parsedCS);
      }
    }
  }

  static getCached(
    cacheKey,
    xref,
    globalColorSpaceCache,
    localColorSpaceCache
  ) {
    if (!globalColorSpaceCache || !localColorSpaceCache) {
      throw new Error(
        'ColorSpace.getCached - expected "globalColorSpaceCache"/"localColorSpaceCache" argument.'
      );
    }
    if (cacheKey instanceof Ref) {
      const cachedCS =
        globalColorSpaceCache.getByRef(cacheKey) ||
        localColorSpaceCache.getByRef(cacheKey);
      if (cachedCS) {
        return cachedCS;
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
      return localColorSpaceCache.getByName(cacheKey.name) || null;
    }
    return null;
  }

  static async parseAsync({
    cs,
    xref,
    resources = null,
    pdfFunctionFactory,
    globalColorSpaceCache,
    localColorSpaceCache,
  }) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        !this.getCached(cs, xref, globalColorSpaceCache, localColorSpaceCache),
        "Expected `ColorSpace.getCached` to have been manually checked " +
          "before calling `ColorSpace.parseAsync`."
      );
    }

    const options = {
      xref,
      resources,
      pdfFunctionFactory,
      globalColorSpaceCache,
      localColorSpaceCache,
    };
    const parsedCS = this.#parse(cs, options);

    // Attempt to cache the parsed ColorSpace, by name and/or reference.
    this.#cache(cs, parsedCS, options);

    return parsedCS;
  }

  static parse({
    cs,
    xref,
    resources = null,
    pdfFunctionFactory,
    globalColorSpaceCache,
    localColorSpaceCache,
  }) {
    const cachedCS = this.getCached(
      cs,
      xref,
      globalColorSpaceCache,
      localColorSpaceCache
    );
    if (cachedCS) {
      return cachedCS;
    }

    const options = {
      xref,
      resources,
      pdfFunctionFactory,
      globalColorSpaceCache,
      localColorSpaceCache,
    };
    const parsedCS = this.#parse(cs, options);

    // Attempt to cache the parsed ColorSpace, by name and/or reference.
    this.#cache(cs, parsedCS, options);

    return parsedCS;
  }

  /**
   * NOTE: This method should *only* be invoked from `this.#parse`,
   *       when parsing "sub" ColorSpaces.
   */
  static #subParse(cs, options) {
    const { globalColorSpaceCache } = options;

    let csRef;
    if (cs instanceof Ref) {
      const cachedCS = globalColorSpaceCache.getByRef(cs);
      if (cachedCS) {
        return cachedCS;
      }
      csRef = cs;
    }
    const parsedCS = this.#parse(cs, options);

    // Only cache the parsed ColorSpace globally, by reference.
    if (csRef) {
      globalColorSpaceCache.set(/* name = */ null, csRef, parsedCS);
    }
    return parsedCS;
  }

  static #parse(cs, options) {
    const { xref, resources, pdfFunctionFactory } = options;

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
                  return this.#parse(resourcesCS, options);
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
          const { globalColorSpaceCache } = options;
          const isRef = cs[1] instanceof Ref;
          if (isRef) {
            const cachedCS = globalColorSpaceCache.getByRef(cs[1]);
            if (cachedCS) {
              return cachedCS;
            }
          }

          const stream = xref.fetchIfRef(cs[1]);
          const dict = stream.dict;
          numComps = dict.get("N");

          if (IccColorSpace.isUsable) {
            try {
              const iccCS = new IccColorSpace(stream.getBytes(), numComps);
              if (isRef) {
                globalColorSpaceCache.set(/* name = */ null, cs[1], iccCS);
              }
              return iccCS;
            } catch (ex) {
              if (ex instanceof MissingDataException) {
                throw ex;
              }
              warn(`ICCBased color space (${cs[1]}): "${ex}".`);
            }
          }

          const altRaw = dict.getRaw("Alternate");
          if (altRaw) {
            const altCS = this.#subParse(altRaw, options);
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
            baseCS = this.#subParse(baseCS, options);
          }
          return new PatternCS(baseCS);
        case "I":
        case "Indexed":
          baseCS = this.#subParse(cs[1], options);
          const hiVal = Math.max(0, Math.min(xref.fetchIfRef(cs[2]), 255));
          const lookup = xref.fetchIfRef(cs[3]);
          return new IndexedCS(baseCS, hiVal, lookup);
        case "Separation":
        case "DeviceN":
          const name = xref.fetchIfRef(cs[1]);
          numComps = Array.isArray(name) ? name.length : 1;
          baseCS = this.#subParse(cs[2], options);
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

export { ColorSpaceUtils };
