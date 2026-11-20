/* Copyright 2025 Mozilla Foundation
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

import { Util, warn } from "../shared/util.js";
import { ColorSpace } from "./colorspace.js";
import { QCMS } from "../../external/qcms/qcms_utils.js";
import { WasmLoader } from "./wasm_loader.js";

class IccColorSpace extends ColorSpace {
  #transformer;

  #convertPixel;

  static #loadPromises = new WeakMap();

  static #qcms = null;

  static #finalizer = null;

  constructor(iccProfile, name, numComps) {
    const qcms = IccColorSpace.#qcms;
    if (!qcms) {
      throw new Error("No ICC color space support");
    }

    super(name, numComps);

    let inType;
    switch (numComps) {
      case 1:
        inType = qcms.DataType.Gray8;
        this.#convertPixel = (src, srcOffset) =>
          qcms.qcms_convert_one(this.#transformer, src[srcOffset] * 255);
        break;
      case 3:
        inType = qcms.DataType.RGB8;
        this.#convertPixel = (src, srcOffset) =>
          qcms.qcms_convert_three(
            this.#transformer,
            src[srcOffset] * 255,
            src[srcOffset + 1] * 255,
            src[srcOffset + 2] * 255
          );
        break;
      case 4:
        inType = qcms.DataType.CMYK;
        this.#convertPixel = (src, srcOffset) =>
          qcms.qcms_convert_four(
            this.#transformer,
            src[srcOffset] * 255,
            src[srcOffset + 1] * 255,
            src[srcOffset + 2] * 255,
            src[srcOffset + 3] * 255
          );
        break;
      default:
        throw new Error(`Unsupported number of components: ${numComps}`);
    }
    this.#transformer = qcms.qcms_transformer_from_memory(
      iccProfile,
      inType,
      qcms.Intent.Perceptual
    );
    if (!this.#transformer) {
      throw new Error("Failed to create ICC color space");
    }
    IccColorSpace.#finalizer ||= new FinalizationRegistry(transformer => {
      qcms.qcms_drop_transformer(transformer);
    });
    IccColorSpace.#finalizer.register(this, this.#transformer);
  }

  getRgbHex(src, srcOffset) {
    const color = this.#convertPixel(src, srcOffset);
    return Util.makeHexColor(color >> 16, (color >> 8) & 0xff, color & 0xff);
  }

  getRgbItem(src, srcOffset, dest, destOffset) {
    const color = this.#convertPixel(src, srcOffset);
    dest[destOffset] = color >> 16;
    dest[destOffset + 1] = (color >> 8) & 0xff;
    dest[destOffset + 2] = color & 0xff;
  }

  getRgbItems(src, count, dest, destOffset, alpha01) {
    const { numComps } = this;
    const length = count * numComps;
    const scaled = new Uint8Array(length);
    // Uint8Array matches the truncation and wrapping of the scalar Wasm calls.
    for (let i = 0; i < length; i++) {
      scaled[i] = src[i] * 255;
    }
    QCMS._destBuffer = dest;
    QCMS._destOffset = destOffset;
    // `scaled` is freshly allocated, so unlike in getRgbBuffer it can never
    // alias `dest`: an RGBA destination always has an alpha channel to keep.
    QCMS._keepAlpha = alpha01 === 1;
    IccColorSpace.#qcms.qcms_convert_array(
      this.#transformer,
      scaled,
      alpha01 === 1
    );
    QCMS._destBuffer = null;
  }

  getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
    src = src.subarray(srcOffset, srcOffset + count * this.numComps);
    if (bits !== 8) {
      const scale = 255 / ((1 << bits) - 1);
      for (let i = 0, ii = src.length; i < ii; i++) {
        src[i] *= scale;
      }
    }
    QCMS._destBuffer = dest;
    QCMS._destOffset = destOffset;
    // The wasm side always fills alpha in, so say when the destination's own
    // alpha must survive: an /SMask has been decoded into it by now.
    QCMS._keepAlpha = alpha01 === 1 && dest.buffer !== src.buffer;
    IccColorSpace.#qcms.qcms_convert_array(
      this.#transformer,
      src,
      alpha01 === 1
    );
    QCMS._destBuffer = null;
  }

  static load(context) {
    if (!context?.options.useWasm) {
      return false;
    }
    // Keep the result for the lifetime of this document.
    return this.#loadPromises.getOrInsertComputed(context, async () => {
      try {
        const [qcms, module] = await Promise.all([
          this.#qcms ||
            import(
              /* webpackChunkName: "qcms" */ "../../external/qcms/qcms.js"
            ),
          WasmLoader.compile(context, "qcms_bg.wasm"),
        ]);
        if (!this.#qcms) {
          // initSync only instantiates the already compiled module.
          QCMS._memory = qcms.initSync({ module }).memory;
          this.#qcms = qcms;
        }
        return true;
      } catch (ex) {
        warn(`No ICC color space support: "${ex}".`);
        return false;
      }
    });
  }

  static async createCmyk(context) {
    if (!(await this.load(context))) {
      return null;
    }
    try {
      const iccProfile = await WasmLoader.fetch(
        context,
        "iccUrl",
        "CGATS001Compat-v2-micro.icc"
      );
      return new IccColorSpace(iccProfile, "DeviceCMYK", 4);
    } catch (ex) {
      warn(`No CMYK ICC profile support: "${ex}".`);
      return null;
    }
  }
}

export { IccColorSpace };
