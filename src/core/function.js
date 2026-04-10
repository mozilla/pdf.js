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

import { Dict, Ref } from "./primitives.js";
import { FormatError, info, shadow, warn } from "../shared/util.js";
import { BaseStream } from "./base_stream.js";
import { buildPostScriptJsFunction } from "./postscript/js_evaluator.js";
import { buildPostScriptWasmFunction } from "./postscript/wasm_compiler.js";
import { isNumberArray } from "./core_utils.js";
import { LocalFunctionCache } from "./image_utils.js";
import { MathClamp } from "../shared/math_clamp.js";

const FunctionType = {
  SAMPLED: 0,
  EXPONENTIAL_INTERPOLATION: 2,
  STITCHING: 3,
  POSTSCRIPT_CALCULATOR: 4,
};

class PDFFunctionFactory {
  static #useWasm = true;

  static setOptions({ useWasm }) {
    this.#useWasm = useWasm;
  }

  constructor({ xref }) {
    this.xref = xref;
  }

  get useWasm() {
    return PDFFunctionFactory.#useWasm;
  }

  create(fn, parseArray = false) {
    let fnRef, parsedFn;

    // Check if the Function is cached first, to avoid re-parsing it.
    if (fn instanceof Ref) {
      fnRef = fn;
    } else if (fn instanceof Dict) {
      fnRef = fn.objId;
    } else if (fn instanceof BaseStream) {
      fnRef = fn.dict?.objId;
    }
    if (fnRef) {
      const cachedFn = this._localFunctionCache.getByRef(fnRef);
      if (cachedFn) {
        return cachedFn;
      }
    }

    const fnObj = this.xref.fetchIfRef(fn);
    if (Array.isArray(fnObj)) {
      if (!parseArray) {
        throw new Error(
          'PDFFunctionFactory.create - expected "parseArray" argument.'
        );
      }
      parsedFn = PDFFunction.parseArray(this, fnObj);
    } else {
      parsedFn = PDFFunction.parse(this, fnObj);
    }

    // Attempt to cache the parsed Function, by reference.
    if (fnRef) {
      this._localFunctionCache.set(/* name = */ null, fnRef, parsedFn);
    }
    return parsedFn;
  }

  /**
   * @private
   */
  get _localFunctionCache() {
    return shadow(this, "_localFunctionCache", new LocalFunctionCache());
  }
}

function toNumberArray(arr) {
  if (!Array.isArray(arr)) {
    return null;
  }
  if (!isNumberArray(arr, null)) {
    // Non-number is found -- convert all items to numbers.
    return arr.map(x => +x);
  }
  return arr;
}

function getSampleArray(size, outputSize, bps, stream) {
  let length = outputSize;
  for (const s of size) {
    length *= s;
  }

  const array = new Array(length);
  let codeSize = 0;
  let codeBuf = 0;
  // 32 is a valid bps so shifting won't work
  const sampleMul = 1.0 / (2.0 ** bps - 1);

  const strBytes = stream.getBytes((length * bps + 7) / 8);
  let strIdx = 0;
  for (let i = 0; i < length; i++) {
    while (codeSize < bps) {
      codeBuf <<= 8;
      codeBuf |= strBytes[strIdx++];
      codeSize += 8;
    }
    codeSize -= bps;
    array[i] = (codeBuf >> codeSize) * sampleMul;
    codeBuf &= (1 << codeSize) - 1;
  }
  return array;
}

class PDFFunction {
  static parse(factory, fn) {
    const dict = fn.dict || fn;
    const typeNum = dict.get("FunctionType");

    switch (typeNum) {
      case FunctionType.SAMPLED:
        return this.constructSampled(factory, fn, dict);
      case FunctionType.EXPONENTIAL_INTERPOLATION:
        return this.constructInterpolated(factory, dict);
      case FunctionType.STITCHING:
        return this.constructStiched(factory, dict);
      case FunctionType.POSTSCRIPT_CALCULATOR:
        return this.constructPostScript(factory, fn, dict);
    }
    throw new FormatError(`Unknown function type: ${typeNum}`);
  }

  static parseArray(factory, fnObj) {
    const { xref } = factory;

    const fnArray = [];
    for (const fn of fnObj) {
      fnArray.push(this.parse(factory, xref.fetchIfRef(fn)));
    }
    return function (src, srcOffset, dest, destOffset) {
      for (let i = 0, ii = fnArray.length; i < ii; i++) {
        fnArray[i](src, srcOffset, dest, destOffset + i);
      }
    };
  }

  static constructSampled(factory, fn, dict) {
    // See chapter 3, page 109 of the PDF reference
    function interpolate(x, xmin, xmax, ymin, ymax) {
      return ymin + (x - xmin) * ((ymax - ymin) / (xmax - xmin));
    }

    const domain = toNumberArray(dict.getArray("Domain"));
    const range = toNumberArray(dict.getArray("Range"));

    if (!domain || !range) {
      throw new FormatError("No domain or range");
    }

    const inputSize = domain.length / 2;
    const outputSize = range.length / 2;

    const size = toNumberArray(dict.getArray("Size"));
    const bps = dict.get("BitsPerSample");
    const order = dict.get("Order") || 1;
    if (order !== 1) {
      // No description how cubic spline interpolation works in PDF32000:2008
      // As in poppler, ignoring order, linear interpolation may work as good
      info("No support for cubic spline interpolation: " + order);
    }

    let encode = toNumberArray(dict.getArray("Encode"));
    if (!encode) {
      encode = [];
      for (let i = 0; i < inputSize; ++i) {
        encode.push(0, size[i] - 1);
      }
    }

    const decode = toNumberArray(dict.getArray("Decode")) || range;

    const samples = getSampleArray(size, outputSize, bps, fn);
    // const mask = 2 ** bps - 1;

    return function constructSampledFn(src, srcOffset, dest, destOffset) {
      // See chapter 3, page 110 of the PDF reference.

      // Building the cube vertices: its part and sample index
      // http://rjwagner49.com/Mathematics/Interpolation.pdf
      const cubeVertices = 1 << inputSize;
      const cubeN = new Float64Array(cubeVertices).fill(1);
      const cubeVertex = new Uint32Array(cubeVertices);
      let i, j;

      let k = outputSize,
        pos = 1;
      // Map x_i to y_j for 0 <= i < m using the sampled function.
      for (i = 0; i < inputSize; ++i) {
        // x_i' = min(max(x_i, Domain_2i), Domain_2i+1)
        const domain_2i = domain[2 * i];
        const domain_2i_1 = domain[2 * i + 1];
        const xi = MathClamp(src[srcOffset + i], domain_2i, domain_2i_1);

        // e_i = Interpolate(x_i', Domain_2i, Domain_2i+1,
        //                   Encode_2i, Encode_2i+1)
        let e = interpolate(
          xi,
          domain_2i,
          domain_2i_1,
          encode[2 * i],
          encode[2 * i + 1]
        );

        // e_i' = min(max(e_i, 0), Size_i - 1)
        const size_i = size[i];
        e = MathClamp(e, 0, size_i - 1);

        // Adjusting the cube: N and vertex sample index
        const e0 = e < size_i - 1 ? Math.floor(e) : e - 1; // e1 = e0 + 1;
        const n0 = e0 + 1 - e; // (e1 - e) / (e1 - e0);
        const n1 = e - e0; // (e - e0) / (e1 - e0);
        const offset0 = e0 * k;
        const offset1 = offset0 + k; // e1 * k
        for (j = 0; j < cubeVertices; j++) {
          if (j & pos) {
            cubeN[j] *= n1;
            cubeVertex[j] += offset1;
          } else {
            cubeN[j] *= n0;
            cubeVertex[j] += offset0;
          }
        }

        k *= size_i;
        pos <<= 1;
      }

      for (j = 0; j < outputSize; ++j) {
        // Sum all cube vertices' samples portions
        let rj = 0;
        for (i = 0; i < cubeVertices; i++) {
          rj += samples[cubeVertex[i] + j] * cubeN[i];
        }

        // r_j' = Interpolate(r_j, 0, 2^BitsPerSample - 1,
        //                    Decode_2j, Decode_2j+1)
        rj = interpolate(rj, 0, 1, decode[2 * j], decode[2 * j + 1]);

        // y_j = min(max(r_j, range_2j), range_2j+1)
        dest[destOffset + j] = MathClamp(rj, range[2 * j], range[2 * j + 1]);
      }
    };
  }

  static constructInterpolated(factory, dict) {
    const c0 = toNumberArray(dict.getArray("C0")) || [0];
    const c1 = toNumberArray(dict.getArray("C1")) || [1];
    const n = dict.get("N");
    const domain = toNumberArray(dict.getArray("Domain")) || [0, 1];
    const range = toNumberArray(dict.getArray("Range"));

    const diff = [];
    for (let i = 0, ii = c0.length; i < ii; ++i) {
      diff.push(c1[i] - c0[i]);
    }
    const length = diff.length;

    return function constructInterpolatedFn(src, srcOffset, dest, destOffset) {
      const clampedX = MathClamp(src[srcOffset], domain[0], domain[1]);
      const x = n === 1 ? clampedX : clampedX ** n;

      for (let j = 0; j < length; ++j) {
        let v = c0[j] + x * diff[j];
        if (range) {
          v = MathClamp(v, range[2 * j], range[2 * j + 1]);
        }
        dest[destOffset + j] = v;
      }
    };
  }

  static constructStiched(factory, dict) {
    const domain = toNumberArray(dict.getArray("Domain"));

    if (!domain) {
      throw new FormatError("No domain");
    }

    const inputSize = domain.length / 2;
    if (inputSize !== 1) {
      throw new FormatError("Bad domain for stiched function");
    }
    const { xref } = factory;

    const fns = [];
    for (const fn of dict.get("Functions")) {
      fns.push(this.parse(factory, xref.fetchIfRef(fn)));
    }

    const bounds = toNumberArray(dict.getArray("Bounds"));
    const encode = toNumberArray(dict.getArray("Encode"));
    const tmpBuf = new Float32Array(1);

    return function constructStichedFn(src, srcOffset, dest, destOffset) {
      // Clamp to domain.
      const v = MathClamp(src[srcOffset], domain[0], domain[1]);
      // calculate which bound the value is in
      const length = bounds.length;
      let i;
      for (i = 0; i < length; ++i) {
        if (v < bounds[i]) {
          break;
        }
      }

      // encode value into domain of function
      const dmin = i > 0 ? bounds[i - 1] : domain[0];
      const dmax = i < length ? bounds[i] : domain[1];

      const rmin = encode[2 * i];
      const rmax = encode[2 * i + 1];

      // Prevent the value from becoming NaN as a result
      // of division by zero (fixes issue6113.pdf).
      tmpBuf[0] =
        dmin === dmax
          ? rmin
          : rmin + ((v - dmin) * (rmax - rmin)) / (dmax - dmin);

      // call the appropriate function
      fns[i](tmpBuf, 0, dest, destOffset);
    };
  }

  static constructPostScript(factory, fn, dict) {
    const domain = toNumberArray(dict.getArray("Domain"));
    const range = toNumberArray(dict.getArray("Range"));

    if (!domain) {
      throw new FormatError("No domain.");
    }

    if (!range) {
      throw new FormatError("No range.");
    }

    const psCode = fn.getString();

    try {
      if (factory.useWasm) {
        const wasmFn = buildPostScriptWasmFunction(psCode, domain, range);
        if (wasmFn) {
          return wasmFn; // (src, srcOffset, dest, destOffset) → void
        }
      }
    } catch {}

    warn("Failed to compile PostScript function to wasm, falling back to JS");

    return buildPostScriptJsFunction(psCode, domain, range);
  }
}

function isPDFFunction(v) {
  let fnDict;
  if (v instanceof Dict) {
    fnDict = v;
  } else if (v instanceof BaseStream) {
    fnDict = v.dict;
  } else {
    return false;
  }
  return fnDict.has("FunctionType");
}

export { FunctionType, getSampleArray, isPDFFunction, PDFFunctionFactory };
