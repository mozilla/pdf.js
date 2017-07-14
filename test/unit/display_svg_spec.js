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

import { isNodeJS, NativeImageDecoding } from '../../src/shared/util';
import { setStubs, unsetStubs } from '../../examples/node/domstubs';
import { buildGetDocumentParams } from './test_utils';
import { getDocument } from '../../src/display/api';
import { SVGGraphics } from '../../src/display/svg';

// withZlib(true, callback); = run test with require('zlib') if possible.
// withZlib(false, callback); = run test without require('zlib').deflateSync.
// The return value of callback is returned as-is.
function withZlib(isZlibRequired, callback) {
  if (isZlibRequired) {
    // We could try to polyfill zlib in the browser, e.g. using pako.
    // For now, only support zlib functionality on Node.js
    if (!isNodeJS()) {
      throw new Error('zlib test can only be run in Node.js');
    }

    return callback();
  }

  if (!isNodeJS()) {
    // Assume that require('zlib') is unavailable in non-Node.
    return callback();
  }

  var zlib = __non_webpack_require__('zlib');
  var deflateSync = zlib.deflateSync;
  zlib.deflateSync = function() {
    throw new Error('zlib.deflateSync is explicitly disabled for testing.');
  };
  try {
    return callback();
  } finally {
    zlib.deflateSync = deflateSync;
  }
}

describe('SVGGraphics', function () {
  var loadingTask;
  var page;
  beforeAll(function(done) {
    loadingTask = getDocument(buildGetDocumentParams('xobject-image.pdf', {
      nativeImageDecoderSupport: NativeImageDecoding.DISPLAY,
    }));
    loadingTask.promise.then(function(doc) {
      doc.getPage(1).then(function(firstPage) {
        page = firstPage;
        done();
      });
    });
  });
  afterAll(function(done) {
    loadingTask.destroy().then(done);
  });

  describe('paintImageXObject', function() {
    function getSVGImage() {
      var svgGfx;
      return page.getOperatorList().then(function(opList) {
        var forceDataSchema = true;
        svgGfx = new SVGGraphics(page.commonObjs, page.objs, forceDataSchema);
        return svgGfx.loadDependencies(opList);
      }).then(function() {
        var svgImg;
        // A mock to steal the svg:image element from paintInlineImageXObject.
        var elementContainer = {
          appendChild(element) {
            svgImg = element;
          },
        };

        // This points to the XObject image in xobject-image.pdf.
        var xobjectObjId = { ref: 4, gen: 0, };
        if (isNodeJS()) {
          setStubs(global);
        }
        try {
          svgGfx.paintImageXObject(xobjectObjId, elementContainer);
        } finally {
          if (isNodeJS()) {
            unsetStubs(global);
          }
        }
        return svgImg;
      });
    }

    it('should produce a reasonably small svg:image', function() {
      if (!isNodeJS()) {
        pending('zlib.deflateSync is not supported in non-Node environments.');
      }
      withZlib(true, getSVGImage).then(function(svgImg) {
        expect(svgImg.nodeName).toBe('svg:image');
        expect(svgImg.getAttribute('width')).toBe('200px');
        expect(svgImg.getAttribute('height')).toBe('100px');
        var imgUrl = svgImg.getAttribute('xlink:href');
        // forceDataSchema = true, so the generated URL should be a data:-URL.
        expect(imgUrl).toMatch(/^data:image\/png;base64,/);
        // Test whether the generated image has a reasonable file size.
        // I obtained a data URL of size 366 with Node 8.1.3 and zlib 1.2.11.
        // Without zlib (uncompressed), the size of the data URL was excessive
        // (80247).
        expect(imgUrl.length).toBeLessThan(367);
      });
    });

    it('should produce a svg:image even if zlib is unavailable', function() {
      withZlib(false, getSVGImage).then(function(svgImg) {
        expect(svgImg.nodeName).toBe('svg:image');
        expect(svgImg.getAttribute('width')).toBe('200px');
        expect(svgImg.getAttribute('height')).toBe('100px');
        var imgUrl = svgImg.getAttribute('xlink:href');
        expect(imgUrl).toMatch(/^data:image\/png;base64,/);
        // The size of our naively generated PNG file is excessive :(
        expect(imgUrl.length).toBe(80247);
      });
    });
  });
});
