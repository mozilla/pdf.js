/* Copyright 2014 Mozilla Foundation
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

if (!PDFJS.PDFViewer || !PDFJS.getDocument) {
  alert('Please build the pdfjs-dist library using\n' +
        '  `gulp dist-install`');
}

// The workerSrc property shall be specified.
//
PDFJS.workerSrc = '../../node_modules/pdfjs-dist/build/pdf.worker.js';

// Some PDFs need external cmaps.
//
// PDFJS.cMapUrl = '../../node_modules/pdfjs-dist/cmaps/';
// PDFJS.cMapPacked = true;

var DEFAULT_URL = '../../web/pdf_open_parameters.pdf';
var PAGE_TO_VIEW = 3;
var SCALE = 1.0;
var SEARCH_FOR = '';

var container = document.getElementById('pageContainer');
var pdfLinkService = new PDFJS.PDFLinkService();

// Loading document.
PDFJS.getDocument(DEFAULT_URL).then(function (pdfDocument) {
  // Document loaded, retrieving the page.
  return pdfDocument.getPage(PAGE_TO_VIEW).then(function (pdfPage) {
    // Creating the page view with default parameters.
    var pdfPageView = new PDFJS.PDFPageView({
			container: container,
			linkService: pdfLinkService,
      id: PAGE_TO_VIEW,
      scale: SCALE,
      defaultViewport: pdfPage.getViewport(SCALE),
      // We can enable text/annotations layers, if needed
      textLayerFactory: new PDFJS.DefaultTextLayerFactory(),
      annotationLayerFactory: new PDFJS.DefaultAnnotationLayerFactory()
		});
		pdfLinkService.setViewer(pdfPageView);

		var pdfFindController = new PDFJS.PDFFindController({
  		pdfPageView: pdfPageView
		});
	pdfPageView.setFindController(pdfFindController);
	
	container.addEventListener('pagesinit', function () {
  	// We can use pdfPageView now, e.g. let's change default scale.
 	 	pdfPageView.currentScaleValue = 'page-width';

  	if (SEARCH_FOR) { // We can try search for things
    	pdfFindController.executeCommand('find', {query: SEARCH_FOR});
 		}
	});

	PDFJS.getDocument(DEFAULT_URL).then(function (pdfDocument) {
  // Document loaded, specifying document for the viewer and
  // the (optional) linkService.
  pdfPageView.setDocument(pdfDocument);

  pdfLinkService.setDocument(pdfDocument, null);
});

    // Associates the actual page with the view, and drawing it
    pdfPageView.setPdfPage(pdfPage);
    return pdfPageView.draw();
  });
});
