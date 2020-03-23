/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

var _domstubs = require("../../examples/node/domstubs.js");

var _test_utils = require("./test_utils.js");

var _api = require("../../display/api.js");

var _is_node = require("../../shared/is_node.js");

var _util = require("../../shared/util.js");

var _svg = require("../../display/svg.js");

const XLINK_NS = "http://www.w3.org/1999/xlink";

function withZlib(isZlibRequired, callback) {
  if (isZlibRequired) {
    if (!_is_node.isNodeJS) {
      throw new Error("zlib test can only be run in Node.js");
    }

    return callback();
  }

  if (!_is_node.isNodeJS) {
    return callback();
  }

  var zlib = require("zlib");

  var deflateSync = zlib.deflateSync;
  zlib.deflateSync = disabledDeflateSync;

  function disabledDeflateSync() {
    throw new Error("zlib.deflateSync is explicitly disabled for testing.");
  }

  function restoreDeflateSync() {
    if (zlib.deflateSync === disabledDeflateSync) {
      zlib.deflateSync = deflateSync;
    }
  }

  var promise = callback();
  promise.then(restoreDeflateSync, restoreDeflateSync);
  return promise;
}

describe("SVGGraphics", function () {
  var loadingTask;
  var page;
  beforeAll(function (done) {
    loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)("xobject-image.pdf", {
      nativeImageDecoderSupport: _util.NativeImageDecoding.DISPLAY
    }));
    loadingTask.promise.then(function (doc) {
      doc.getPage(1).then(function (firstPage) {
        page = firstPage;
        done();
      });
    });
  });
  afterAll(function (done) {
    loadingTask.destroy().then(done);
  });
  describe("paintImageXObject", function () {
    function getSVGImage() {
      var svgGfx;
      return page.getOperatorList().then(function (opList) {
        var forceDataSchema = true;
        svgGfx = new _svg.SVGGraphics(page.commonObjs, page.objs, forceDataSchema);
        return svgGfx.loadDependencies(opList);
      }).then(function () {
        var svgImg;
        var elementContainer = {
          appendChild(element) {
            svgImg = element;
          }

        };
        var xobjectObjId = "img_p0_1";

        if (_is_node.isNodeJS) {
          (0, _domstubs.setStubs)(global);
        }

        try {
          var imgData = svgGfx.objs.get(xobjectObjId);
          svgGfx.paintInlineImageXObject(imgData, elementContainer);
        } finally {
          if (_is_node.isNodeJS) {
            (0, _domstubs.unsetStubs)(global);
          }
        }

        return svgImg;
      });
    }

    it('should fail require("zlib") unless in Node.js', function () {
      function testFunc() {
        require("zlib");
      }

      expect(testFunc.toString()).toMatch(/\srequire\(["']zlib["']\)/);

      if (_is_node.isNodeJS) {
        expect(testFunc).not.toThrow();
      } else {
        expect(testFunc).toThrow();
      }
    });
    it("should produce a reasonably small svg:image", function (done) {
      if (!_is_node.isNodeJS) {
        pending("zlib.deflateSync is not supported in non-Node environments.");
      }

      withZlib(true, getSVGImage).then(function (svgImg) {
        expect(svgImg.nodeName).toBe("svg:image");
        expect(svgImg.getAttributeNS(null, "width")).toBe("200px");
        expect(svgImg.getAttributeNS(null, "height")).toBe("100px");
        var imgUrl = svgImg.getAttributeNS(XLINK_NS, "href");
        expect(imgUrl).toMatch(/^data:image\/png;base64,/);
        expect(imgUrl.length).toBeLessThan(367);
      }).then(done, done.fail);
    });
    it("should be able to produce a svg:image without zlib", function (done) {
      withZlib(false, getSVGImage).then(function (svgImg) {
        expect(svgImg.nodeName).toBe("svg:image");
        expect(svgImg.getAttributeNS(null, "width")).toBe("200px");
        expect(svgImg.getAttributeNS(null, "height")).toBe("100px");
        var imgUrl = svgImg.getAttributeNS(XLINK_NS, "href");
        expect(imgUrl).toMatch(/^data:image\/png;base64,/);
        expect(imgUrl.length).toBe(80246);
      }).then(done, done.fail);
    });
  });
});