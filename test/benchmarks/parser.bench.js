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

import { bench, describe } from "vitest";
import { captureContentStreams } from "./capture_utils.js";
import { EOF } from "../../src/core/primitives.js";
import { EvaluatorPreprocessor } from "../../src/core/evaluator.js";
import { Lexer } from "../../src/core/parser.js";
import { readTestPdf } from "./bench_utils.js";
import { Stream } from "../../src/core/stream.js";
import { XRef } from "../../src/core/xref.js";

const CONTENT_STREAMS = [
  { kind: "text", filename: "issue12963.pdf" },
  { kind: "paths", filename: "bug1743245.pdf" },
  { kind: "inline images", filename: "bug1799927.pdf" },
];
for (const entry of CONTENT_STREAMS) {
  entry.streams = await captureContentStreams(entry.filename);
}
const BROKEN_XREF_PDF = readTestPdf("bug1795263.pdf");

describe("parser", () => {
  for (const { kind, filename, streams } of CONTENT_STREAMS) {
    if (kind === "inline images") {
      // Only the `Parser` skips the binary data of inline images (see
      // `Parser.makeInlineImage`), which the `Lexer` alone can't tokenize.
      continue;
    }
    bench(`Lexer.getObj: ${kind} (${filename})`, () => {
      let count = 0;
      for (const bytes of streams) {
        const lexer = new Lexer(new Stream(bytes), EvaluatorPreprocessor.opMap);
        while (lexer.getObj() !== EOF) {
          count++;
        }
      }
      return count;
    });
  }

  for (const { kind, filename, streams } of CONTENT_STREAMS) {
    bench(`EvaluatorPreprocessor.read: ${kind} (${filename})`, () => {
      let count = 0;
      for (const bytes of streams) {
        const preprocessor = new EvaluatorPreprocessor(new Stream(bytes), null);
        const operation = { args: null };
        while (preprocessor.read(operation)) {
          operation.args = null;
          count++;
        }
      }
      return count;
    });
  }

  bench("XRef.indexObjects (bug1795263.pdf)", () =>
    new XRef(new Stream(BROKEN_XREF_PDF), null).indexObjects()
  );
});
