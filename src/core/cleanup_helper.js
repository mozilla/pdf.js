/* Copyright 2022 Mozilla Foundation
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

import { clearPatternCaches } from "./pattern.js";
import { clearPrimitiveCaches } from "./primitives.js";
import { clearUnicodeCaches } from "./unicode.js";
import { JpxImage } from "./jpx.js";

function clearGlobalCaches() {
  clearPatternCaches();
  clearPrimitiveCaches();
  clearUnicodeCaches();

  // Remove the global `JpxImage` instance, since it may hold a reference to
  // the WebAssembly module.
  JpxImage.cleanup();
}

export { clearGlobalCaches };
