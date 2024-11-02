/* Copyright 2017 Mozilla Foundation
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

import { DOMCanvasFactory } from "../../src/display/canvas_factory.js";
import { isNodeJS } from "../../src/shared/util.js";

describe("canvas_factory", function () {
  describe("DOMCanvasFactory", function () {
    let canvasFactory;

    beforeAll(function () {
      canvasFactory = new DOMCanvasFactory({});
    });

    afterAll(function () {
      canvasFactory = null;
    });

    it("`create` should throw an error if the dimensions are invalid", function () {
      // Invalid width.
      expect(function () {
        return canvasFactory.create(-1, 1);
      }).toThrow(new Error("Invalid canvas size"));

      // Invalid height.
      expect(function () {
        return canvasFactory.create(1, -1);
      }).toThrow(new Error("Invalid canvas size"));
    });

    it("`create` should return a canvas if the dimensions are valid", function () {
      if (isNodeJS) {
        pending("Document is not supported in Node.js.");
      }

      const { canvas, context } = canvasFactory.create(20, 40);
      expect(canvas instanceof HTMLCanvasElement).toBe(true);
      expect(context instanceof CanvasRenderingContext2D).toBe(true);
      expect(canvas.width).toBe(20);
      expect(canvas.height).toBe(40);
    });

    it("`reset` should throw an error if no canvas is provided", function () {
      const canvasAndContext = { canvas: null, context: null };

      expect(function () {
        return canvasFactory.reset(canvasAndContext, 20, 40);
      }).toThrow(new Error("Canvas is not specified"));
    });

    it("`reset` should throw an error if the dimensions are invalid", function () {
      const canvasAndContext = { canvas: "foo", context: "bar" };

      // Invalid width.
      expect(function () {
        return canvasFactory.reset(canvasAndContext, -1, 1);
      }).toThrow(new Error("Invalid canvas size"));

      // Invalid height.
      expect(function () {
        return canvasFactory.reset(canvasAndContext, 1, -1);
      }).toThrow(new Error("Invalid canvas size"));
    });

    it("`reset` should alter the canvas/context if the dimensions are valid", function () {
      if (isNodeJS) {
        pending("Document is not supported in Node.js.");
      }

      const canvasAndContext = canvasFactory.create(20, 40);
      canvasFactory.reset(canvasAndContext, 60, 80);

      const { canvas, context } = canvasAndContext;
      expect(canvas instanceof HTMLCanvasElement).toBe(true);
      expect(context instanceof CanvasRenderingContext2D).toBe(true);
      expect(canvas.width).toBe(60);
      expect(canvas.height).toBe(80);
    });

    it("`destroy` should throw an error if no canvas is provided", function () {
      expect(function () {
        return canvasFactory.destroy({});
      }).toThrow(new Error("Canvas is not specified"));
    });

    it("`destroy` should clear the canvas/context", function () {
      if (isNodeJS) {
        pending("Document is not supported in Node.js.");
      }

      const canvasAndContext = canvasFactory.create(20, 40);
      canvasFactory.destroy(canvasAndContext);

      const { canvas, context } = canvasAndContext;
      expect(canvas).toBe(null);
      expect(context).toBe(null);
    });
  });
});
