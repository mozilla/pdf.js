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

import { FontPathInfo } from "../../src/shared/obj-bin-transform.js";

const path = [
  "M0.214 0.27",
  "L0.23 0.33",
  "C0.248 0.395 0.265 0.47100000000000003 0.281 0.54",
  "L0.28500000000000003 0.54",
  "C0.302 0.47200000000000003 0.32 0.395 0.338 0.33",
  "L0.353 0.27",
  "L0.214 0.27",
  "M0.423 0",
  "L0.579 0",
  "L0.375 0.652",
  "L0.198 0.652",
  "L-0.006 0",
  "L0.14400000000000002 0",
  "L0.184 0.155",
  "L0.383 0.155",
  "Z",
];

describe("obj-bin-transform FontPathInfo", function () {
  it("should create a FontPathInfo instance from an array of path commands", function () {
    const buffer = FontPathInfo.write(path);
    const fontPathInfo = new FontPathInfo(buffer);
    expect(fontPathInfo.getSVG()).toEqual(path.join(""));
  });
});
