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

import { captureCalls, processPdf } from "./capture_utils.js";
import {
  F32_BBOX_INIT,
  isArrayEqual,
  RenderingIntentFlag,
} from "../../src/shared/util.js";
import { OperatorList } from "../../src/core/operator_list.js";
import { PartialEvaluator } from "../../src/core/evaluator.js";

const STREAM_SINK = {
  ready: Promise.resolve(),
  enqueue() {},
};

function isEqual(a, b) {
  if (ArrayBuffer.isView(a)) {
    return ArrayBuffer.isView(b) && isArrayEqual(a, b);
  }
  if (Array.isArray(a)) {
    return (
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, i) => isEqual(value, b[i]))
    );
  }
  if (a && typeof a === "object") {
    const keys = Object.keys(a);
    return (
      !!b &&
      typeof b === "object" &&
      keys.length === Object.keys(b).length &&
      keys.every(key => isEqual(a[key], b[key]))
    );
  }
  return Object.is(a, b);
}

/**
 * A minimal deep copy of typed arrays, arrays and plain objects, since this
 * runs in every benchmark iteration and `structuredClone` is a few times slower
 * for the small arrays of the operator arguments.
 */
function copy(value) {
  if (ArrayBuffer.isView(value)) {
    return value.slice();
  }
  if (Array.isArray(value)) {
    return value.map(copy);
  }
  if (value && typeof value === "object") {
    const object = {};
    for (const key in value) {
      object[key] = copy(value[key]);
    }
    return object;
  }
  return value;
}

/**
 * @returns {OperatorList} An operator list with the rendering optimizer
 *   enabled.
 */
function createOperatorList() {
  return new OperatorList(RenderingIntentFlag.DISPLAY, STREAM_SINK);
}

class OperatorListInput {
  #argsArray;

  #fnArray;

  #modified;

  constructor(fnArray, argsArray) {
    this.#fnArray = fnArray;
    this.#argsArray = argsArray;

    // Add a copy of the operators to find the arguments which are modified in
    // place, e.g. by the optimizer, since only those must be copied before
    // every benchmark iteration.
    const argsArrayCopy = structuredClone(argsArray);
    const operatorList = createOperatorList();
    for (let i = 0, ii = fnArray.length; i < ii; i++) {
      operatorList.addOp(fnArray[i], argsArrayCopy[i]);
    }
    operatorList.flush(/* lastChunk = */ true);
    this.#modified = [];
    for (let i = 0, ii = argsArray.length; i < ii; i++) {
      if (!isEqual(argsArray[i], argsArrayCopy[i])) {
        this.#modified.push([i, argsArray[i]]);
      }
    }
  }

  /**
   * @returns {object} Operator arrays with mutable arguments copied.
   */
  args() {
    for (const [i, args] of this.#modified) {
      this.#argsArray[i] = copy(args);
    }
    return { fnArray: this.#fnArray, argsArray: this.#argsArray };
  }
}

/**
 * @param {string} filename
 * @param {object} [options] - See `processPdf`.
 * @returns {Promise<Array<OperatorListInput>>} Operator arrays captured before
 *   flushing.
 */
async function captureOperatorLists(filename, options) {
  const chunks = new Map();
  await captureCalls(
    OperatorList.prototype,
    "flush",
    () => processPdf(filename, { ...options, operatorList: true }),
    operatorList => {
      if (!operatorList._streamSink) {
        return;
      }
      const { fnArray, argsArray } = structuredClone({
        fnArray: operatorList.fnArray,
        argsArray: operatorList.argsArray,
      });
      const ops = chunks.get(operatorList);
      if (ops) {
        ops.fnArray.push(...fnArray);
        ops.argsArray.push(...argsArray);
      } else {
        chunks.set(operatorList, { fnArray, argsArray });
      }
    },
    { before: true }
  );
  if (chunks.size === 0) {
    throw new Error(`No operator list in "${filename}".`);
  }
  return Array.from(
    chunks.values(),
    ({ fnArray, argsArray }) => new OperatorListInput(fnArray, argsArray)
  );
}

/**
 * @returns {object} Initial state for `PartialEvaluator.buildPath`.
 */
function createPathState() {
  return {
    currentPointX: 0,
    currentPointY: 0,
    pathBuffer: [],
    pathMinMax: F32_BBOX_INIT.slice(),
  };
}

/**
 * @param {string} filename
 * @param {object} [options] - See `processPdf`.
 * @returns {Promise<object>} An evaluator and `buildPath` calls grouped by
 *   path.
 */
async function capturePaths(filename, options) {
  const paths = [];
  let evaluator = null;
  await captureCalls(
    PartialEvaluator.prototype,
    "buildPath",
    () => processPdf(filename, { ...options, operatorList: true }),
    (pathEvaluator, [fn, args, state]) => {
      evaluator ??= pathEvaluator;
      if (state.pathBuffer.length === 0) {
        paths.push([]);
      }
      paths.at(-1).push([fn, args.slice()]);
    },
    { before: true }
  );
  if (paths.length === 0) {
    throw new Error(`No path in "${filename}".`);
  }
  return { evaluator, paths };
}

export {
  captureOperatorLists,
  capturePaths,
  createOperatorList,
  createPathState,
};
