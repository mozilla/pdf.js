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

import { buildGetDocumentParams, NodeCanvasFactory } from './test_utils';
import { DOMCanvasFactory } from '../../src/display/display_utils';
import { getDocument } from '../../src/display/api';
import isNodeJS from '../../src/shared/is_node';

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
      CanvasFactory = new NodeCanvasFactory();
    } else {
      CanvasFactory = new DOMCanvasFactory();
    }
    loadingTask = getDocument(transparentGetDocumentParams);
    loadingTask.promise.then(function(doc) {
      return doc.getPage(1);
    }).then(function(data) {
      page = data;
      done();
    }).catch(done.fail);
  });

  afterAll(function(done) {
    CanvasFactory = null;
    page = null;
    loadingTask.destroy().then(done);
  });

  it('renders to canvas with a default white background', function(done) {
    var viewport = page.getViewport({ scale: 1, });
    var canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);

    const renderTask = page.render({
      canvasContext: canvasAndCtx.context,
      viewport,
    });
    renderTask.promise.then(function() {
      expect(getTopLeftPixel(canvasAndCtx.context)).toEqual(
        { r: 255, g: 255, b: 255, a: 255, });
      CanvasFactory.destroy(canvasAndCtx);
      done();
    }).catch(done.fail);
  });

  it('renders to canvas with a custom background', function(done) {
    var viewport = page.getViewport({ scale: 1, });
    var canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);

    const renderTask = page.render({
      canvasContext: canvasAndCtx.context,
      viewport,
      background: 'rgba(255,0,0,1.0)',
    });
    renderTask.promise.then(function() {
      expect(getTopLeftPixel(canvasAndCtx.context)).toEqual(
        { r: 255, g: 0, b: 0, a: 255, });
      CanvasFactory.destroy(canvasAndCtx);
      done();
    }).catch(done.fail);
  });
});
