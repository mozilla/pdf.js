'use strict';

if (!PDFJS.PDFViewer || !PDFJS.getDocument) {
    alert('Please build the pdfjs-dist library using\n' +
        '  `gulp dist`');
}

// The workerSrc property shall be specified.
//
PDFJS.workerSrc = '../../build/dist/build/pdf.worker.js';

var DEFAULT_URL = '../../web/pdf_open_parameters.pdf';
var PAGE_TO_VIEW = 3;
var SCALE = 1.0;

var container = document.getElementById('pageContainer');


// Loading document.
PDFJS.getDocument(DEFAULT_URL).then(function(pdfDocument) {

    // Document loaded, retrieving the page.
    return pdfDocument.getPage(PAGE_TO_VIEW).then(function(pdfPage) {
        // Creating the page view with default parameters.
        var pdfPageView = new PDFJS.PDFPageView({
            container: container,
            id: PAGE_TO_VIEW,
            scale: SCALE,
            defaultViewport: pdfPage.getViewport(SCALE),
            // We can enable text/annotations layers, if needed
            textLayerFactory: new PDFJS.DefaultTextLayerFactory(),
            annotationLayerFactory: new PDFJS.DefaultAnnotationLayerFactory()
        });
        // Associates the actual page with the view, and drawing it
        pdfPageView.setPdfPage(pdfPage);
        return pdfPageView.draw();
    });
});

// enable hyperlinks within PDF files.
var pdfLinkService = new PDFJS.PDFLinkService();

var pdfViewer = new PDFJS.PDFViewer({
    container: container,
    linkService: pdfLinkService,
});
pdfLinkService.setViewer(pdfViewer);

// enable find controller.
var pdfFindController = new PDFJS.PDFFindController({
    pdfViewer: pdfViewer
});
pdfViewer.setFindController(pdfFindController);

container.addEventListener('pagesinit', function() {
    // We can use pdfViewer now, e.g. let's change default scale.
    pdfViewer.currentScaleValue = 'page-width';

    if (SEARCH_FOR) { // We can try search for things
        pdfFindController.executeCommand('find', { query: SEARCH_FOR });
    }
});