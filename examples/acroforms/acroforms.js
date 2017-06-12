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

PDFJS.workerSrc = '../../node_modules/pdfjs-dist/build/pdf.worker.js';

var DEFAULT_URL = '../../test/pdfs/f1040.pdf';
var DEFAULT_SCALE = 1.0;

var container = document.getElementById('pageContainer');

// Fetch the PDF document from the URL using promises.
PDFJS.getDocument(DEFAULT_URL).then(function (doc) {
  // Use a promise to fetch and render the next page.
  var promise = Promise.resolve();

  for (var i = 1; i <= doc.numPages; i++) {
    promise = promise.then(function (pageNum) {
      return doc.getPage(pageNum).then(function (pdfPage) {
        // Create the page view.
        var pdfPageView = new PDFJS.PDFPageView({
          container: container,
          id: pageNum,
          scale: DEFAULT_SCALE,
          defaultViewport: pdfPage.getViewport(DEFAULT_SCALE),
          annotationLayerFactory: new PDFJS.DefaultAnnotationLayerFactory(),
          renderInteractiveForms: true,
        });

        // Associate the actual page with the view and draw it.
        pdfPageView.setPdfPage(pdfPage);
        return pdfPageView.draw();
      });
    }.bind(null, i));
  }
});
