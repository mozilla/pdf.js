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
import { CmykICCBasedCS, IccColorSpace } from "./icc_colorspace.js";
import { Dict, Name, Ref } from "./primitives.js";
import { MathClamp, shadow, unreachable, warn } from "../shared/util.js";
import { MissingDataException } from "./core_utils.js";

class ColorSpaceUtils {
  static parse({
    cs,
    xref,
    resources = null,
    pdfFunctionFactory,
    globalColorSpaceCache,
    localColorSpaceCache,
    asyncIfNotCached = false,
  }) {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      (!globalColorSpaceCache || !localColorSpaceCache)
    ) {
      unreachable(
        'ColorSpaceUtils.parse - expected "globalColorSpaceCache"/"localColorSpaceCache" argument.'
      );
    }
    const options = {
      xref,
      resources,
      pdfFunctionFactory,
      globalColorSpaceCache,
      localColorSpaceCache,
    };
    let csName, csRef, parsedCS;

    // Check if the ColorSpace is cached first, to avoid re-parsing it.
    if (cs instanceof Ref) {
      csRef = cs;

      const cachedCS =
        globalColorSpaceCache.getByRef(csRef) ||
        localColorSpaceCache.getByRef(csRef);
      if (cachedCS) {
        return cachedCS;
      }
      cs = xref.fetch(cs);
    }
    if (cs instanceof Name) {
      csName = cs.name;

      const cachedCS = localColorSpaceCache.getByName(csName);
      if (cachedCS) {
        return cachedCS;
      }
    }

    try {
      parsedCS = this.#parse(cs, options);
    } catch (ex) {
      if (asyncIfNotCached && !(ex instanceof MissingDataException)) {
        return Promise.reject(ex);
      }
      throw ex;
    }

    // Attempt to cache the parsed ColorSpace, by name and/or reference.
    if (csName || csRef) {
      localColorSpaceCache.set(csName, csRef, parsedCS);

      if (csRef) {
        globalColorSpaceCache.set(/* name = */ null, csRef, parsedCS);
      }
    }
    return asyncIfNotCached ? Promise.resolve(parsedCS) : parsedCS;
  }

  /**
   * NOTE: This method should *only* be invoked from `this.#parse`,
   *       when parsing "sub" ColorSpaces.
   */
  static #subParse(cs, options) {
    const { globalColorSpaceCache } = options;
    let csRef;

    // Check if the ColorSpace is cached first, to avoid re-parsing it.
    if (cs instanceof Ref) {
      csRef = cs;

      const cachedCS = globalColorSpaceCache.getByRef(csRef);
      if (cachedCS) {
        return cachedCS;
      }
    }
    const parsedCS = this.#parse(cs, options);

    // Only cache the parsed ColorSpace globally, by reference.
    if (csRef) {
      globalColorSpaceCache.set(/* name = */ null, csRef, parsedCS);
    }
    return parsedCS;
  }

  static #parse(cs, options) {
    const { xref, resources, pdfFunctionFactory, globalColorSpaceCache } =
      options;

    cs = xref.fetchIfRef(cs);
    if (cs instanceof Name) {
      switch (cs.name) {
        case "G":
        case "DeviceGray":
          return this.gray;
        case "RGB":
        case "DeviceRGB":
          return this.rgb;
        case "DeviceRGBA":
          return this.rgba;
        case "CMYK":
        case "DeviceCMYK":
          return this.cmyk;
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
          return this.gray;
      }
    }
    if (Array.isArray(cs)) {
      const mode = xref.fetchIfRef(cs[0]).name;
      let params, numComps, baseCS, whitePoint, blackPoint, gamma;

      switch (mode) {
        case "G":
        case "DeviceGray":
          return this.gray;
        case "RGB":
        case "DeviceRGB":
          return this.rgb;
        case "CMYK":
        case "DeviceCMYK":
          return this.cmyk;
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
              const iccCS = new IccColorSpace(
                stream.getBytes(),
                "ICCBased",
                numComps
              );
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
            return this.gray;
          } else if (numComps === 3) {
            return this.rgb;
          } else if (numComps === 4) {
            return this.cmyk;
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
          const hiVal = MathClamp(xref.fetchIfRef(cs[2]), 0, 255);
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
          return this.gray;
      }
    }
    // Fallback to the default gray color space.
    warn(`Unrecognized ColorSpace object: ${cs}`);
    return this.gray;
  }

  static get gray() {
    return shadow(this, "gray", new DeviceGrayCS());
  }

  static get rgb() {
    return shadow(this, "rgb", new DeviceRgbCS());
  }

  static get rgba() {
    return shadow(this, "rgba", new DeviceRgbaCS());
  }

  static get cmyk() {
    if (CmykICCBasedCS.isUsable) {
      try {
        return shadow(this, "cmyk", new CmykICCBasedCS());
      } catch {
        warn("CMYK fallback: DeviceCMYK");
      }
    }
    return shadow(this, "cmyk", new DeviceCmykCS());
  }
}

export { ColorSpaceUtils };
