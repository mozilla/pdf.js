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

"use strict";

if (!pdfjsLib.getDocument || !pdfjsViewer.PDFSinglePageViewer) {
  alert("Please build the pdfjs-dist library using\n  `gulp dist-install`");
}

// The workerSrc property shall be specified.
//
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "../../node_modules/pdfjs-dist/build/pdf.worker.js";

// Some PDFs need external cmaps.
//
var CMAP_URL = "../../node_modules/pdfjs-dist/cmaps/";
var CMAP_PACKED = true;

var DEFAULT_URL = "../../web/compressed.tracemonkey-pldi-09.pdf";
var SEARCH_FOR = ""; // try 'Mozilla';

var container = document.getElementById("viewerContainer");

// (Optionally) enable hyperlinks within PDF files.
var pdfLinkService = new pdfjsViewer.PDFLinkService();

// (Optionally) enable find controller.
var pdfFindController = new pdfjsViewer.PDFFindController({
  linkService: pdfLinkService,
});

var pdfSinglePageViewer = new pdfjsViewer.PDFSinglePageViewer({
  container: container,
  linkService: pdfLinkService,
  findController: pdfFindController,
});
pdfLinkService.setViewer(pdfSinglePageViewer);

document.addEventListener("pagesinit", function() {
  // We can use pdfSinglePageViewer now, e.g. let's change default scale.
  pdfSinglePageViewer.currentScaleValue = "page-width";

  // We can try searching for things.
  if (SEARCH_FOR) {
    pdfFindController.executeCommand("find", { query: SEARCH_FOR });
  }
});

// Loading document.
var loadingTask = pdfjsLib.getDocument({
  url: DEFAULT_URL,
  cMapUrl: CMAP_URL,
  cMapPacked: CMAP_PACKED,
});
loadingTask.promise.then(function(pdfDocument) {
  // Document loaded, specifying document for the viewer and
  // the (optional) linkService.
  pdfSinglePageViewer.setDocument(pdfDocument);

  pdfLinkService.setDocument(pdfDocument, null);
});
