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

import {
  captureCalls,
  captureMethodCalls,
  processPdf,
  readStream,
} from "./capture_utils.js";
import { BaseStream } from "../../src/core/base_stream.js";
import { CFFParser } from "../../src/core/cff_parser.js";
import { CharCodeMap } from "../../src/core/char_code_map.js";
import { CMapFactory } from "../../src/core/cmap.js";
import { Font } from "../../src/core/fonts.js";
import { isArrayEqual } from "../../src/shared/util.js";
import { Name } from "../../src/core/primitives.js";
import { OpenTypeFileBuilder } from "../../src/core/opentype_file_builder.js";
import { PartialEvaluator } from "../../src/core/evaluator.js";
import { PDFImage } from "../../src/core/image.js";
import { Stream } from "../../src/core/stream.js";
import { ToUnicodeMap } from "../../src/core/to_unicode_map.js";

function cloneToUnicode(toUnicode) {
  if (!(toUnicode instanceof ToUnicodeMap)) {
    return () => toUnicode;
  }
  const entries = [];
  toUnicode.forEach(charCode =>
    entries.push([charCode, toUnicode.get(charCode)])
  );
  return () => {
    const map = new CharCodeMap();
    for (const [charCode, value] of entries) {
      map.set(charCode, value);
    }
    return new ToUnicodeMap(map);
  };
}

class FontInput {
  #bytes;

  #options;

  #properties;

  #toUnicode;

  constructor(properties, options) {
    this.#bytes = readStream(properties.file);
    this.#options = options;
    this.#properties = { ...properties, widths: properties.widths?.slice() };
    this.#toUnicode = cloneToUnicode(properties.toUnicode);
  }

  /**
   * Check replayed font data; reuse ToUnicode maps if unmodified.
   * @returns {FontInput}
   */
  prepare() {
    const toUnicode = this.#toUnicode();
    let amended = false;
    if (toUnicode instanceof ToUnicodeMap) {
      toUnicode.amend = function (map) {
        amended = true;
        ToUnicodeMap.prototype.amend.call(this, map);
      };
    }
    const args = this.args();
    args[2].toUnicode = toUnicode;
    const { data } = new Font(...args);
    delete toUnicode.amend;
    if (!amended) {
      this.#toUnicode = () => toUnicode;
    }
    if (!isArrayEqual(data ?? [], new Font(...this.args()).data ?? [])) {
      throw new Error(`Font "${this.#properties.name}" can't be replayed.`);
    }
    return this;
  }

  /**
   * @returns {Array} Font arguments with copied bytes, widths and properties.
   */
  args() {
    const file = new Stream(this.#bytes.slice());
    const properties = {
      ...this.#properties,
      file,
      widths: this.#properties.widths?.slice(),
      toUnicode: this.#toUnicode(),
    };
    properties.systemFontInfo &&= { ...properties.systemFontInfo };
    return [properties.name, file, properties, this.#options];
  }
}

/**
 * @param {string} filename
 * @param {Function} filter - Predicate on font properties.
 * @param {object} [options] - See `processPdf`.
 * @returns {Promise<Array<FontInput>>} Matching embedded font inputs.
 */
async function captureFonts(filename, filter, options) {
  const fonts = await captureCalls(
    PartialEvaluator.prototype,
    "extractWidths",
    () => processPdf(filename, options),
    (evaluator, [, , properties]) =>
      properties.file && !properties.isInternalFont && filter(properties)
        ? new FontInput(properties, evaluator.options)
        : undefined
  );
  if (fonts.length === 0) {
    throw new Error(`No matching font in "${filename}".`);
  }
  return fonts.map(font => font.prepare());
}

function createFonts(fonts) {
  return fonts.map(font => new Font(...font.args()));
}

/**
 * @param {string} filename
 * @param {Function} filter - See `captureFonts`.
 * @returns {Promise<Array<Array<number>>>} `toFontChar` values for each font.
 */
async function captureFontCharCodes(filename, filter) {
  const fonts = await captureFonts(filename, filter);
  return createFonts(fonts).map(({ toFontChar }) => [...toFontChar.values()]);
}

/**
 * @param {Array<FontInput>} fonts
 * @returns {Promise<Array<object>>} CFF inputs with fresh bytes per `args()`
 *   call.
 */
function captureCFFPrograms(fonts) {
  return captureCalls(
    CFFParser.prototype,
    "parse",
    () => createFonts(fonts),
    ({ bytes, properties, seacAnalysisEnabled }) => {
      bytes = bytes.slice();
      return {
        args: () => [
          // Parsing repairs charstrings in place.
          new Stream(bytes.slice()),
          { ...properties },
          seacAnalysisEnabled,
        ],
      };
    },
    { before: true }
  );
}

/**
 * @param {Array<FontInput>} fonts
 * @returns {Promise<Array<object>>} SFNT version and tables per builder.
 */
async function captureOpenTypeTables(fonts) {
  const tables = await captureCalls(
    OpenTypeFileBuilder.prototype,
    "addTable",
    () => createFonts(fonts),
    (builder, [tag, data]) => ({ builder, tag, data: data.slice() }),
    { before: true }
  );
  const builders = new Map();
  for (const { builder, tag, data } of tables) {
    if (!builders.has(builder)) {
      builders.set(builder, { sfnt: builder.sfnt, tables: [] });
    }
    builders.get(builder).tables.push([tag, data]);
  }
  return [...builders.values()];
}

/**
 * @param {string} filename
 * @param {object} [options] - See `processPdf`.
 * @returns {Promise<Array<object>>} ToUnicode stream bytes and evaluators.
 */
function captureToUnicodeStreams(filename, options) {
  return captureCalls(
    PartialEvaluator.prototype,
    "readToUnicode",
    () => processPdf(filename, options),
    (evaluator, [cmapObj]) =>
      cmapObj instanceof BaseStream
        ? { evaluator, bytes: readStream(cmapObj) }
        : undefined,
    { before: true }
  );
}

/**
 * @param {string} filename
 * @param {object} [options] - See `processPdf`.
 * @returns {Promise<object>} Non-identity CMap names and a fetcher using
 *   captured bytes.
 */
async function captureBuiltInCMaps(filename, options) {
  const data = new Map();
  const [names] = await captureMethodCalls(
    () => processPdf(filename, options),
    [
      {
        target: CMapFactory,
        name: "create",
        snapshot: (factory, [{ encoding }]) =>
          encoding instanceof Name && !encoding.name.startsWith("Identity-")
            ? encoding.name
            : undefined,
        before: true,
      },
      {
        target: PartialEvaluator.prototype,
        name: "fetchBuiltInCMap",
        snapshot: (evaluator, [name], result) =>
          result.then(cMapData => data.set(name, cMapData)),
      },
    ]
  );
  return {
    names: [...new Set(names)],
    fetchBuiltInCMap: async name => data.get(name),
  };
}

/**
 * @param {string} filename
 * @param {object} [options] - See `processPdf`.
 * @returns {Promise<Array<object>>} Type3 masks, excluding single opaque
 *   pixels.
 */
async function captureType3GlyphMasks(filename, options) {
  const images = await captureCalls(
    PartialEvaluator.prototype,
    "buildPaintImageXObject",
    () => processPdf(filename, options),
    (evaluator, [{ image }]) =>
      evaluator.parsingType3Font && image.dict.get("IM", "ImageMask")
        ? image
        : undefined,
    { before: true }
  );
  const masks = [];
  for (const image of images) {
    image.reset();
    const imgData = await PDFImage.createMask({ image });
    if (!imgData.isSingleOpaquePixel) {
      masks.push(imgData);
    }
  }
  return masks;
}

export {
  captureBuiltInCMaps,
  captureCFFPrograms,
  captureFontCharCodes,
  captureFonts,
  captureOpenTypeTables,
  captureToUnicodeStreams,
  captureType3GlyphMasks,
};
