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

import { Dict } from "../../src/core/primitives.js";
import { FormatError } from "../../src/shared/util.js";
import { PDFFunctionFactory } from "../../src/core/function.js";
import { Stream } from "../../src/core/stream.js";
import { XRefMock } from "./test_utils.js";

describe("function", function () {
  let factory;

  beforeAll(function () {
    factory = new PDFFunctionFactory({ xref: new XRefMock() });
  });

  afterAll(function () {
    factory = null;
  });

  function createSampledStream({ domain, range, size, samples }) {
    const dict = new Dict();
    dict.set("FunctionType", 0);
    dict.set("Domain", domain);
    dict.set("Range", range);
    dict.set("Size", size);
    dict.set("BitsPerSample", 8);
    const bytes = new Uint8Array(samples);
    return new Stream(bytes, 0, bytes.length, dict);
  }

  function createSampledFunction(params) {
    return factory.create(createSampledStream(params));
  }

  function createExponentialFunction(c0, c1) {
    const dict = new Dict();
    dict.set("FunctionType", 2);
    dict.set("Domain", [0, 1]);
    dict.set("C0", c0);
    dict.set("C1", c1);
    dict.set("N", 1);
    return dict;
  }

  function createStitchedFunction(fns) {
    const dict = new Dict();
    dict.set("FunctionType", 3);
    dict.set("Domain", [0, 1]);
    dict.set("Functions", fns);
    dict.set("Bounds", [0.5]);
    dict.set("Encode", [0, 1, 0, 1]);
    return factory.create(dict);
  }

  function evaluate(fn, ...src) {
    const dest = new Float64Array(fn.numOutputs);
    fn(new Float64Array(src), 0, dest, 0);
    return Array.from(dest);
  }

  // Samples are 255 where the first two inputs are both 1, and 0 elsewhere.
  function createAndFunction(numInputs) {
    const count = 1 << numInputs;
    const samples = new Array(count).fill(0);
    for (let i = 3; i < count; i += 4) {
      samples[i] = 255;
    }
    return createSampledFunction({
      domain: new Array(numInputs).fill([0, 1]).flat(),
      range: [0, 1],
      size: new Array(numInputs).fill(2),
      samples,
    });
  }

  describe("Sampled function", function () {
    it("must interpolate multilinearly", function () {
      const fn = createAndFunction(2);

      expect(fn.numInputs).toEqual(2);
      expect(fn.numOutputs).toEqual(1);
      expect(evaluate(fn, 0.5, 0.25)).toEqual([0.125]);
      expect(evaluate(fn, 1, 0.5)).toEqual([0.5]);
      expect(evaluate(fn, 1, 1)).toEqual([1]);
    });

    it("must use simplex interpolation for many inputs", function () {
      const fn = createAndFunction(9);

      expect(fn.numInputs).toEqual(9);
      expect(evaluate(fn, 0.5, 0.25, 0, 0, 0, 0, 0, 0, 0)).toEqual([0.25]);
      expect(evaluate(fn, 1, 0.5, 0, 0, 0, 0, 0, 0, 0)).toEqual([0.5]);
      expect(evaluate(fn, 1, 1, 0, 1, 0, 1, 0, 1, 0)).toEqual([1]);
    });

    it("must handle inputs with a single sample", function () {
      const fn = createSampledFunction({
        domain: [0, 1, 0, 1, 0, 1],
        range: [0, 1],
        size: [2, 1, 2],
        samples: [0, 51, 102, 255],
      });

      expect(evaluate(fn, 0.5, 0.3, 0)).toEqual([0.1]);
      expect(evaluate(fn, 1, 0.3, 1)).toEqual([1]);
    });

    it("must evaluate functions with many single-sample inputs", function () {
      const numInputs = 18;
      const fn = createSampledFunction({
        domain: new Array(numInputs).fill([0, 1]).flat(),
        range: [0, 1],
        size: new Array(numInputs).fill(1),
        samples: [51],
      });

      expect(evaluate(fn, ...new Array(numInputs).fill(0.5))).toEqual([0.2]);
    });
  });

  describe("Array of functions", function () {
    it("must combine 1-out functions", function () {
      const fn = factory.create(
        [
          createExponentialFunction([0], [1]),
          createExponentialFunction([1], [0]),
        ],
        /* parseArray = */ true
      );

      expect(fn.numInputs).toEqual(1);
      expect(fn.numOutputs).toEqual(2);
      expect(evaluate(fn, 0.25)).toEqual([0.25, 0.75]);
    });

    it("must accept a single n-out function", function () {
      const fn = factory.create(
        [createExponentialFunction([0, 0, 0], [1, 1, 1])],
        /* parseArray = */ true
      );

      expect(fn.numInputs).toEqual(1);
      expect(fn.numOutputs).toEqual(3);
    });

    it("must reject several n-out functions", function () {
      expect(() =>
        factory.create(
          [
            createExponentialFunction([0, 0], [1, 1]),
            createExponentialFunction([0, 0], [1, 1]),
          ],
          /* parseArray = */ true
        )
      ).toThrowError(FormatError, "Invalid array of functions.");
    });
  });

  describe("Stitching function", function () {
    it("must have the outputs of its sub-functions", function () {
      const fn = createStitchedFunction([
        createExponentialFunction([0, 0, 0], [1, 1, 1]),
        createExponentialFunction([1, 0, 0], [0, 0, 1]),
      ]);

      expect(fn.numInputs).toEqual(1);
      expect(fn.numOutputs).toEqual(3);
      expect(evaluate(fn, 0.25)).toEqual([0.5, 0.5, 0.5]);
      expect(evaluate(fn, 0.75)).toEqual([0.5, 0, 0.5]);
    });

    it("must reject sub-functions with several inputs", function () {
      expect(() =>
        createStitchedFunction([
          createExponentialFunction([0, 0, 0], [1, 1, 1]),
          createSampledStream({
            domain: [0, 1, 0, 1],
            range: [0, 1, 0, 1, 0, 1],
            size: [2, 2],
            samples: new Array(12).fill(0),
          }),
        ])
      ).toThrowError(
        FormatError,
        "Incompatible sub-functions for stitched function"
      );
    });

    it("must reject sub-functions with different outputs", function () {
      expect(() =>
        createStitchedFunction([
          createExponentialFunction([0, 0, 0], [1, 1, 1]),
          createExponentialFunction([0], [1]),
        ])
      ).toThrowError(
        FormatError,
        "Incompatible sub-functions for stitched function"
      );
    });

    it("must reject an empty array of sub-functions", function () {
      expect(() => createStitchedFunction([])).toThrowError(
        FormatError,
        "Incompatible sub-functions for stitched function"
      );
    });
  });
});
