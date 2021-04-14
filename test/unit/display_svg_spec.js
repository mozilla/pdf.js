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
/* globals __non_webpack_require__ */

import { buildGetDocumentParams } from "./test_utils.js";
import { getDocument } from "../../src/display/api.js";
import { isNodeJS } from "../../src/shared/is_node.js";
import { SVGGraphics } from "../../src/display/svg.js";

const XLINK_NS = "http://www.w3.org/1999/xlink";

// withZlib(true, callback); = run test with require('zlib') if possible.
// withZlib(false, callback); = run test without require('zlib').deflateSync.
// The return value of callback is returned as-is.
function withZlib(isZlibRequired, callback) {
  if (isZlibRequired) {
    // We could try to polyfill zlib in the browser, e.g. using pako.
    // For now, only support zlib functionality on Node.js
    if (!isNodeJS) {
      throw new Error("zlib test can only be run in Node.js");
    }

    return callback();
  }

  if (!isNodeJS) {
    // Assume that require('zlib') is unavailable in non-Node.
    return callback();
  }

  const zlib = __non_webpack_require__("zlib");
  const deflateSync = zlib.deflateSync;
  zlib.deflateSync = disabledDeflateSync;
  function disabledDeflateSync() {
    throw new Error("zlib.deflateSync is explicitly disabled for testing.");
  }
  function restoreDeflateSync() {
    if (zlib.deflateSync === disabledDeflateSync) {
      zlib.deflateSync = deflateSync;
    }
  }
  const promise = callback();
  promise.then(restoreDeflateSync, restoreDeflateSync);
  return promise;
}

describe("SVGGraphics", function () {
  let loadingTask;
  let page;

  beforeAll(async function () {
    loadingTask = getDocument(buildGetDocumentParams("xobject-image.pdf"));
    const doc = await loadingTask.promise;
    page = await doc.getPage(1);
  });

  afterAll(async function () {
    await loadingTask.destroy();
  });

  describe("paintImageXObject", function () {
    function getSVGImage() {
      let svgGfx;
      return page
        .getOperatorList()
        .then(function (opList) {
          const forceDataSchema = true;
          svgGfx = new SVGGraphics(page.commonObjs, page.objs, forceDataSchema);
          return svgGfx.loadDependencies(opList);
        })
        .then(function () {
          let svgImg;
          // A mock to steal the svg:image element from paintInlineImageXObject.
          const elementContainer = {
            appendChild(element) {
              svgImg = element;
            },
          };

          // This points to the XObject image in xobject-image.pdf.
          const xobjectObjId = "img_p0_1";
          if (isNodeJS) {
            const { setStubs } = __non_webpack_require__(
              "../../examples/node/domstubs.js"
            );
            setStubs(global);
          }
          try {
            const imgData = svgGfx.objs.get(xobjectObjId);
            svgGfx.paintInlineImageXObject(imgData, elementContainer);
          } finally {
            if (isNodeJS) {
              const { unsetStubs } = __non_webpack_require__(
                "../../examples/node/domstubs.js"
              );
              unsetStubs(global);
            }
          }
          return svgImg;
        });
    }

    it('should fail require("zlib") unless in Node.js', function () {
      function testFunc() {
        __non_webpack_require__("zlib");
      }
      if (isNodeJS) {
        // Verifies that the script loader replaces __non_webpack_require__ with
        // require.
        expect(testFunc.toString()).toMatch(/\srequire\(["']zlib["']\)/);
        expect(testFunc).not.toThrow();
      } else {
        // require not defined, require('zlib') not a module, etc.
        expect(testFunc).toThrow();
      }
    });

    it("should produce a reasonably small svg:image", async function () {
      if (!isNodeJS) {
        pending("zlib.deflateSync is not supported in non-Node environments.");
      }
      const svgImg = await withZlib(true, getSVGImage);
      expect(svgImg.nodeName).toBe("svg:image");
      expect(svgImg.getAttributeNS(null, "width")).toBe("200px");
      expect(svgImg.getAttributeNS(null, "height")).toBe("100px");
      const imgUrl = svgImg.getAttributeNS(XLINK_NS, "href");
      // forceDataSchema = true, so the generated URL should be a data:-URL.
      expect(imgUrl).toMatch(/^data:image\/png;base64,/);
      // Test whether the generated image has a reasonable file size.
      // I obtained a data URL of size 366 with Node 8.1.3 and zlib 1.2.11.
      // Without zlib (uncompressed), the size of the data URL was excessive
      // (80246).
      expect(imgUrl.length).toBeLessThan(367);
    });

    it("should be able to produce a svg:image without zlib", async function () {
      const svgImg = await withZlib(false, getSVGImage);
      expect(svgImg.nodeName).toBe("svg:image");
      expect(svgImg.getAttributeNS(null, "width")).toBe("200px");
      expect(svgImg.getAttributeNS(null, "height")).toBe("100px");
      const imgUrl = svgImg.getAttributeNS(XLINK_NS, "href");
      expect(imgUrl).toMatch(/^data:image\/png;base64,/);
      // The size of our naively generated PNG file is excessive :(
      expect(imgUrl.length).toBe(80246);
    });
  });
});
