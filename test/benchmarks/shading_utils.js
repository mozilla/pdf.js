/* Copyright 2026 Mozilla Foundation
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

import { captureCalls, processPdf } from "./capture_utils.js";
import {
  GlobalColorSpaceCache,
  LocalColorSpaceCache,
} from "../../src/core/image_utils.js";
import { BaseStream } from "../../src/core/base_stream.js";
import { Pattern } from "../../src/core/pattern.js";
import { PDFFunctionFactory } from "../../src/core/function.js";

class ShadingInput {
  #resources;

  #shading;

  #xref;

  constructor(shading, xref, resources) {
    this.#shading = shading;
    this.#xref = xref;
    this.#resources = resources;
  }

  get dict() {
    const shading = this.#shading;
    return shading instanceof BaseStream ? shading.dict : shading;
  }

  /**
   * @returns {Array} Shading arguments with a reset stream and fresh caches.
   */
  args() {
    const shading = this.#shading;
    if (shading instanceof BaseStream) {
      shading.reset();
    }
    return [
      shading,
      this.#xref,
      this.#resources,
      new PDFFunctionFactory({ xref: this.#xref }),
      new GlobalColorSpaceCache(),
      new LocalColorSpaceCache(),
    ];
  }
}

/**
 * @param {string} filename
 * @param {Function} [filter] - Predicate on the shading dictionary.
 * @param {object} [options] - See `processPdf`.
 * @returns {Promise<Array<ShadingInput>>}
 */
async function captureShadings(filename, filter = () => true, options) {
  const shadings = await captureCalls(
    Pattern,
    "parseShading",
    () => processPdf(filename, { ...options, operatorList: true }),
    (target, [shading, xref, resources]) => {
      const input = new ShadingInput(shading, xref, resources);
      return filter(input.dict) ? input : undefined;
    },
    { before: true }
  );
  if (shadings.length === 0) {
    throw new Error(`No matching shading in "${filename}".`);
  }
  for (const input of shadings) {
    if (Pattern.parseShading(...input.args()).getIR()[0] === "Dummy") {
      throw new Error(`Shading in "${filename}" can't be replayed.`);
    }
  }
  return shadings;
}

export { captureShadings };
