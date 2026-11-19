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

import { buildPostScriptJsFunction } from "./js_evaluator.js";
import { buildPostScriptWasmFunction } from "./wasm_compiler.js";
import { warn } from "../../shared/util.js";

function buildPostScriptFunction(code, domain, range, useWasm) {
  if (useWasm) {
    try {
      const wasmFunction = buildPostScriptWasmFunction(code, domain, range);
      if (wasmFunction) {
        return wasmFunction;
      }
    } catch {}
  }
  warn("Failed to compile PostScript function to wasm, falling back to JS");
  return buildPostScriptJsFunction(code, domain, range);
}

export { buildPostScriptFunction };
