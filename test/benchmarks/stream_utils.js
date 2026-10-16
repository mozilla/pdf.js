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

import { captureCalls, processPdf, readStream } from "./capture_utils.js";
import { ChunkedStream } from "../../src/core/chunked_stream.js";
import { Dict } from "../../src/core/primitives.js";
import { FlateStream } from "../../src/core/flate_stream.js";
import { Parser } from "../../src/core/parser.js";
import { Stream } from "../../src/core/stream.js";

const FILTER_ABBREVIATIONS = new Map([
  ["A85", "ASCII85Decode"],
  ["Fl", "FlateDecode"],
  ["LZW", "LZWDecode"],
  ["RL", "RunLengthDecode"],
]);

/**
 * @param {string} filename
 * @param {string} name - Filter name.
 * @param {Function} [filter] - Predicate on the stream dictionary and filter
 *   parameters.
 * @param {object} [options] - See `processPdf`.
 * @returns {Promise<Array<object>>} Filter bytes, length and parameters.
 */
async function captureFilterInputs(
  filename,
  name,
  filter = () => true,
  options
) {
  const inputs = await captureCalls(
    Parser.prototype,
    "makeFilter",
    () => processPdf(filename, options),
    (parser, [stream, filterName, maybeLength, params]) =>
      (FILTER_ABBREVIATIONS.get(filterName) ?? filterName) === name &&
      maybeLength !== 0 &&
      filter(stream.dict ?? Dict.empty, params)
        ? { bytes: readStream(stream), maybeLength, params }
        : undefined,
    { before: true }
  );
  if (inputs.length === 0) {
    throw new Error(`No matching "${name}" stream in "${filename}".`);
  }
  return inputs;
}

/**
 * @param {string} filename
 * @param {Function} [filter] - See `captureFilterInputs`.
 * @param {object} [options] - See `processPdf`.
 * @returns {Promise<Array<object>>} Flate-decoded PNG predictor inputs.
 */
async function capturePNGPredictorInputs(
  filename,
  filter = () => true,
  options
) {
  const inputs = await captureFilterInputs(
    filename,
    "FlateDecode",
    (dict, params) =>
      params instanceof Dict &&
      params.get("Predictor") >= 10 &&
      filter(dict, params),
    options
  );
  return inputs.map(({ bytes, maybeLength, params }) => ({
    bytes: new FlateStream(new Stream(bytes), maybeLength).getBytes(),
    maybeLength,
    params,
  }));
}

/**
 * @param {Uint8Array} bytes
 * @returns {ChunkedStream} A fully populated chunked stream.
 */
function createChunkedStream(bytes) {
  const stream = new ChunkedStream(bytes.length, 2 ** 16, null);
  stream.onReceiveProgressiveData(bytes.slice().buffer);
  return stream;
}

export { captureFilterInputs, capturePNGPredictorInputs, createChunkedStream };
