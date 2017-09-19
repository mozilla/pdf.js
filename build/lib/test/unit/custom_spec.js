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
'use strict';

var _test_utils = require('./test_utils');

var _dom_utils = require('../../display/dom_utils');

var _api = require('../../display/api');

var _util = require('../../shared/util');

var _global = require('../../display/global');

function getTopLeftPixel(canvasContext) {
  var imgData = canvasContext.getImageData(0, 0, 1, 1);
  return {
    r: imgData.data[0],
    g: imgData.data[1],
    b: imgData.data[2],
    a: imgData.data[3]
  };
}
describe('custom canvas rendering', function () {
  var transparentGetDocumentParams = (0, _test_utils.buildGetDocumentParams)('transparent.pdf');
  var CanvasFactory = void 0;
  var loadingTask = void 0;
  var page = void 0;
  beforeAll(function (done) {
    if ((0, _util.isNodeJS)()) {
      _global.PDFJS.pdfjsNext = true;
    } else {
      CanvasFactory = new _dom_utils.DOMCanvasFactory();
    }
    loadingTask = (0, _api.getDocument)(transparentGetDocumentParams);
    loadingTask.promise.then(function (doc) {
      return doc.getPage(1);
    }).then(function (data) {
      page = data;
      done();
    }).catch(function (reason) {
      done.fail(reason);
    });
  });
  afterAll(function (done) {
    CanvasFactory = null;
    page = null;
    loadingTask.destroy().then(done);
  });
  it('renders to canvas with a default white background', function (done) {
    if ((0, _util.isNodeJS)()) {
      pending('TODO: Support Canvas testing in Node.js.');
    }
    var viewport = page.getViewport(1);
    var canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);
    page.render({
      canvasContext: canvasAndCtx.context,
      viewport: viewport
    }).then(function () {
      var _getTopLeftPixel = getTopLeftPixel(canvasAndCtx.context),
          r = _getTopLeftPixel.r,
          g = _getTopLeftPixel.g,
          b = _getTopLeftPixel.b,
          a = _getTopLeftPixel.a;

      CanvasFactory.destroy(canvasAndCtx);
      expect(r).toEqual(255);
      expect(g).toEqual(255);
      expect(b).toEqual(255);
      expect(a).toEqual(255);
      done();
    }).catch(function (reason) {
      done(reason);
    });
  });
  it('renders to canvas with a custom background', function (done) {
    if ((0, _util.isNodeJS)()) {
      pending('TODO: Support Canvas testing in Node.js.');
    }
    var viewport = page.getViewport(1);
    var canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);
    page.render({
      canvasContext: canvasAndCtx.context,
      viewport: viewport,
      background: 'rgba(255,0,0,1.0)'
    }).then(function () {
      var _getTopLeftPixel2 = getTopLeftPixel(canvasAndCtx.context),
          r = _getTopLeftPixel2.r,
          g = _getTopLeftPixel2.g,
          b = _getTopLeftPixel2.b,
          a = _getTopLeftPixel2.a;

      CanvasFactory.destroy(canvasAndCtx);
      expect(r).toEqual(255);
      expect(g).toEqual(0);
      expect(b).toEqual(0);
      expect(a).toEqual(255);
      done();
    }).catch(function (reason) {
      done(reason);
    });
  });
});