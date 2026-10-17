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

import { buildGetDocumentParams, readTestPdf } from "./bench_utils.js";
import { getDocument } from "../../src/display/api.js";
import { PartialEvaluator } from "../../src/core/evaluator.js";

/**
 * Copy unread bytes and reset the stream.
 * @param {BaseStream} stream
 * @returns {Uint8Array}
 */
function readStream(stream) {
  const bytes = new Uint8Array(stream.getBytes());
  stream.reset();
  return bytes;
}

/**
 * Capture the calls of several methods during `run`.
 *
 * The benchmarks then replay the captured calls, i.e. they re-run them with
 * the captured inputs outside of the document, in order to only measure the
 * code under test.
 * @param {Function} run
 * @param {Array<object>} hooks - `{ target, name, snapshot, before }`, where
 *   `snapshot` is `(thisArg, args, result) => value`, skipping `undefined`,
 *   and `before` captures before the call, omitting `result`.
 * @returns {Promise<Array<Array>>} Captured values for each hook.
 */
async function captureMethodCalls(run, hooks) {
  const originals = [];
  const captures = hooks.map(({ target, name, snapshot, before = false }) => {
    const original = target[name];
    const captured = [];
    const record = value => {
      if (value !== undefined) {
        captured.push(value);
      }
    };
    target[name] = function (...args) {
      if (before) {
        record(snapshot(this, args));
        return original.apply(this, args);
      }
      const result = original.apply(this, args);
      record(snapshot(this, args, result));
      return result;
    };
    originals.push([target, name, original]);
    return captured;
  });
  try {
    await run();
  } finally {
    for (const [target, name, original] of originals) {
      target[name] = original;
    }
  }
  return Promise.all(captures.map(captured => Promise.all(captured)));
}

/**
 * Capture `target[name]` calls during `run`, see `captureMethodCalls`.
 * @param {object} target
 * @param {string} name
 * @param {Function} run
 * @param {Function} snapshot - `(thisArg, args, result) => value`; skip
 *   `undefined`.
 * @param {object} [options]
 * @param {boolean} [options.before] - Capture before the call; omit `result`.
 * @returns {Promise<Array>}
 */
async function captureCalls(target, name, run, snapshot, { before } = {}) {
  const [captured] = await captureMethodCalls(run, [
    { target, name, snapshot, before },
  ]);
  return captured;
}

/**
 * Read a test PDF's text or operator lists.
 * @param {string} filename
 * @param {object} [options] - Remaining options go to `getDocument`.
 * @param {Array<number>} [options.pages] - Page numbers; defaults to all pages.
 * @param {boolean} [options.operatorList]
 * @param {boolean} [options.metadata] - Read metadata before processing pages.
 */
async function processPdf(
  filename,
  { pages, operatorList = false, metadata = false, ...params } = {}
) {
  const loadingTask = getDocument({
    ...buildGetDocumentParams(readTestPdf(filename)),
    ...params,
  });
  try {
    const pdfDocument = await loadingTask.promise;
    if (metadata) {
      await pdfDocument.getMetadata();
    }
    pages ??= Array.from({ length: pdfDocument.numPages }, (_, i) => i + 1);

    for (const pageNumber of pages) {
      const page = await pdfDocument.getPage(pageNumber);
      await (operatorList ? page.getOperatorList() : page.getTextContent());
    }
  } finally {
    await loadingTask.destroy();
  }
}

/**
 * @param {string} filename
 * @param {object} [options] - See `processPdf`.
 * @returns {Promise<Array<Uint8Array>>} Content stream bytes.
 */
function captureContentStreams(filename, options) {
  return captureCalls(
    PartialEvaluator.prototype,
    "getTextContent",
    () => processPdf(filename, options),
    (evaluator, [{ stream }]) => readStream(stream),
    { before: true }
  );
}

export {
  captureCalls,
  captureContentStreams,
  captureMethodCalls,
  processPdf,
  readStream,
};
