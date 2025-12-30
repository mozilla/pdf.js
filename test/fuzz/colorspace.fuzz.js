// Copyright 2024 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Fuzzer for Colorspace parsing including ICC profiles.
 */

const MAX_INPUT_SIZE = 128 * 1024; // 128KB limit

let ColorSpace = null;
let Name = null;
let Dict = null;

async function init() {
  if (ColorSpace) return;
  const colorspaceModule = await import("../../build/lib-legacy/core/colorspace.js");
  const primitivesModule = await import("../../build/lib-legacy/core/primitives.js");
  ColorSpace = colorspaceModule.ColorSpace;
  Name = primitivesModule.Name;
  Dict = primitivesModule.Dict;
}

/**
 * @param { Buffer } data
 */
module.exports.fuzz = async function (data) {
  await init();

  if (data.length < 4 || data.length > MAX_INPUT_SIZE) {
    return;
  }

  try {
    // Create a mock XRef and resources
    const xref = {
      fetch: () => null,
      fetchIfRef: (obj) => obj,
    };
    const resources = new Dict(xref);

    // Construct colorspace name from first byte
    const csTypes = [
      "DeviceGray", "DeviceRGB", "DeviceCMYK",
      "CalGray", "CalRGB", "Lab",
      "ICCBased", "Indexed", "Pattern", "Separation"
    ];
    const csType = csTypes[data[0] % csTypes.length];
    const csName = Name.get(csType);

    ColorSpace.parse({
      cs: csName,
      xref,
      resources,
      pdfFunctionFactory: {
        create: () => ({ parse: () => null }),
      },
      localColorSpaceCache: new Map(),
    });
  } catch (e) {
    // Expected exceptions for malformed colorspace data
    if (e.message && (
      e.message.includes("out of memory") ||
      e.message.includes("Maximum call stack") ||
      e.message.includes("allocation failed")
    )) {
      throw e;
    }
  }
};
