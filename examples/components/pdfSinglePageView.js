'use strict';

if (!PDFJS.PDFSPViewer || !PDFJS.getDocument) {
  alert('Please build the pdfjs-dist library using\n' +
        '  `gulp dist-install`');
}

// The workerSrc property shall be specified.
//
PDFJS.workerSrc = '../../node_modules/pdfjs-dist/build/pdf.worker.js';


var DEFAULT_URL = '../../web/compressed.tracemonkey-pldi-09.pdf';
var SEARCH_FOR = ''; // try 'Mozilla';

var container = document.getElementById('viewerContainer');

// (Optionally) enable hyperlinks within PDF files.
var pdfLinkService = new PDFJS.PDFLinkService();

var pdfSinglePageViewer = new PDFJS.PDFSPViewer({
  container: container,
  linkService: pdfLinkService,
});
pdfLinkService.setViewer(pdfSinglePageViewer);

// (Optionally) enable find controller.
var pdfFindController = new PDFJS.PDFFindController({
  pdfSinglePageViewer: pdfSinglePageViewer
});
pdfSinglePageViewer.setFindController(pdfFindController);

container.addEventListener('pagesinit', function () {
  // We can use pdfSinglePageViewer now, e.g. let's change default scale.
  pdfSinglePageViewer.currentScaleValue = 'page-width';

  if (SEARCH_FOR) { // We can try search for things
    pdfFindController.executeCommand('find', {query: SEARCH_FOR});
  }
});

// Loading document.
PDFJS.getDocument(DEFAULT_URL).then(function (pdfDocument) {
  // Document loaded, specifying document for the viewer and
  // the (optional) linkService.
  pdfSinglePageViewer.setDocument(pdfDocument);

  pdfLinkService.setDocument(pdfDocument, null);
});
