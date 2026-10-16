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
import {
  captureOperatorLists,
  capturePaths,
  createOperatorList,
  createPathState,
} from "./evaluator_utils.js";

const OPERATOR_LISTS = [
  { kind: "text", filename: "issue12963.pdf", options: { pages: [1] } },
  { kind: "paths and clips", filename: "bug1703683_page2_reduced.pdf" },
  { kind: "image masks", filename: "bug1799927.pdf" },
];
for (const entry of OPERATOR_LISTS) {
  entry.operatorLists = await captureOperatorLists(
    entry.filename,
    entry.options
  );
}

const PATHS = [
  { kind: "lines", filename: "bug1743245.pdf" },
  { kind: "curves", filename: "issue12705.pdf" },
];
for (const entry of PATHS) {
  Object.assign(entry, await capturePaths(entry.filename));
}

describe("evaluator", () => {
  for (const { kind, filename, operatorLists } of OPERATOR_LISTS) {
    bench(`OperatorList.addOp: ${kind} (${filename})`, () =>
      operatorLists.map(input => {
        const { fnArray, argsArray } = input.args();
        const operatorList = createOperatorList();
        for (let i = 0, ii = fnArray.length; i < ii; i++) {
          operatorList.addOp(fnArray[i], argsArray[i]);
        }
        operatorList.flush(/* lastChunk = */ true);
        return operatorList;
      })
    );
  }

  for (const { kind, filename, evaluator, paths } of PATHS) {
    bench(`PartialEvaluator.buildPath: ${kind} (${filename})`, () => {
      let length = 0;
      for (const path of paths) {
        const state = createPathState();
        for (const [fn, args] of path) {
          evaluator.buildPath(fn, args, state);
        }
        length += state.pathBuffer.length;
      }
      return length;
    });
  }
});
