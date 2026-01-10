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
 * Fuzzer for CMap (Character Map) parsing.
 * CMaps define character code to glyph mappings.
 */

const MAX_INPUT_SIZE = 128 * 1024; // 128KB limit

let CMapFactory = null;

async function init() {
  if (CMapFactory) return;
  const cmapModule = await import("../../build/lib-legacy/core/cmap.js");
  CMapFactory = cmapModule.CMapFactory;
}

/**
 * @param { Buffer } data
 */
module.exports.fuzz = async function (data) {
  await init();

  if (data.length === 0 || data.length > MAX_INPUT_SIZE) {
    return;
  }

  try {
    // Create a minimal fetch function that returns our data
    const fetchBuiltInCMap = async () => ({
      cMapData: new Uint8Array(data),
      compressionType: 0,
    });

    const cmap = await CMapFactory.create({
      encoding: { name: "Identity-H" },
      fetchBuiltInCMap,
      useCMap: null,
    });

    // Try to use the cmap
    if (cmap) {
      cmap.lookup(0x0041);
      cmap.lookup(0x3000);
    }
  } catch (e) {
    // Expected exceptions for malformed CMap data
    if (e.message && (
      e.message.includes("out of memory") ||
      e.message.includes("Maximum call stack") ||
      e.message.includes("allocation failed")
    )) {
      throw e;
    }
  }
};
