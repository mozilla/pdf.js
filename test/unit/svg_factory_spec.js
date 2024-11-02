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

import { DOMSVGFactory } from "../../src/display/svg_factory.js";
import { isNodeJS } from "../../src/shared/util.js";

describe("svg_factory", function () {
  describe("DOMSVGFactory", function () {
    let svgFactory;

    beforeAll(function () {
      svgFactory = new DOMSVGFactory();
    });

    afterAll(function () {
      svgFactory = null;
    });

    it("`create` should throw an error if the dimensions are invalid", function () {
      // Invalid width.
      expect(function () {
        return svgFactory.create(-1, 0);
      }).toThrow(new Error("Invalid SVG dimensions"));

      // Invalid height.
      expect(function () {
        return svgFactory.create(0, -1);
      }).toThrow(new Error("Invalid SVG dimensions"));
    });

    it("`create` should return an SVG element if the dimensions are valid", function () {
      if (isNodeJS) {
        pending("Document is not supported in Node.js.");
      }

      const svg = svgFactory.create(20, 40);
      expect(svg instanceof SVGSVGElement).toBe(true);
      expect(svg.getAttribute("version")).toBe("1.1");
      expect(svg.getAttribute("width")).toBe("20px");
      expect(svg.getAttribute("height")).toBe("40px");
      expect(svg.getAttribute("preserveAspectRatio")).toBe("none");
      expect(svg.getAttribute("viewBox")).toBe("0 0 20 40");
    });

    it("`createElement` should throw an error if the type is not a string", function () {
      expect(function () {
        return svgFactory.createElement(true);
      }).toThrow(new Error("Invalid SVG element type"));
    });

    it("`createElement` should return an SVG element if the type is valid", function () {
      if (isNodeJS) {
        pending("Document is not supported in Node.js.");
      }

      const svg = svgFactory.createElement("svg:rect");
      expect(svg instanceof SVGRectElement).toBe(true);
    });
  });
});
