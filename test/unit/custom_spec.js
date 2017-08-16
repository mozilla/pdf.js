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

import { buildGetDocumentParams } from './test_utils';
import { DOMCanvasFactory } from '../../src/display/dom_utils';
import { getDocument } from '../../src/display/api';
import { isNodeJS } from '../../src/shared/util';
import { PDFJS } from '../../src/display/global';

function getTopLeftPixel(canvasContext) {
  let imgData = canvasContext.getImageData(0, 0, 1, 1);
  return {
    r: imgData.data[0],
    g: imgData.data[1],
    b: imgData.data[2],
    a: imgData.data[3],
  };
}

describe('custom canvas rendering', function() {
  let transparentGetDocumentParams = buildGetDocumentParams('transparent.pdf');

  let CanvasFactory;
  let loadingTask;
  let page;

  beforeAll(function(done) {
    if (isNodeJS()) {
      PDFJS.pdfjsNext = true;
      // NOTE: To support running the canvas-related tests in Node.js,
      // a `NodeCanvasFactory` would need to be added (in test_utils.js).
    } else {
      CanvasFactory = new DOMCanvasFactory();
    }
    loadingTask = getDocument(transparentGetDocumentParams);
    loadingTask.promise.then(function(doc) {
      return doc.getPage(1);
    }).then(function(data) {
      page = data;
      done();
    }).catch(function (reason) {
      done.fail(reason);
    });
  });

  afterAll(function(done) {
    CanvasFactory = null;
    page = null;
    loadingTask.destroy().then(done);
  });

  it('renders to canvas with a default white background', function(done) {
    if (isNodeJS()) {
      pending('TODO: Support Canvas testing in Node.js.');
    }
    var viewport = page.getViewport(1);
    var canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);

    page.render({
      canvasContext: canvasAndCtx.context,
      viewport,
    }).then(function() {
      var { r, g, b, a, } = getTopLeftPixel(canvasAndCtx.context);
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

  it('renders to canvas with a custom background', function(done) {
    if (isNodeJS()) {
      pending('TODO: Support Canvas testing in Node.js.');
    }
    var viewport = page.getViewport(1);
    var canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);

    page.render({
      canvasContext: canvasAndCtx.context,
      viewport,
      background: 'rgba(255,0,0,1.0)',
    }).then(function() {
      var { r, g, b, a, } = getTopLeftPixel(canvasAndCtx.context);
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
