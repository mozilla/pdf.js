'use strict';

var DEFAULT_SCALE = 1.5;

// Parse query string to extract some parameters (it can fail for some input)
var query = document.location.href.replace(/^[^?]*(\?([^#]*))?(#.*)?/, '$2');
var queryParams = query ? JSON.parse('{' + query.split('&').map(function (a) {
  return a.split('=').map(decodeURIComponent).map(JSON.stringify).join(': ');
}).join(',') + '}') : {};

var url = queryParams.file || '../../web/compressed.tracemonkey-pldi-09.pdf';

function renderDocument(pdf, svgLib) {
  var promise = Promise.resolve();
  for (var i = 1; i <= pdf.numPages; i++) {
    // Using promise to fetch and render the next page
    promise = promise.then(function (pageNum) {
      return pdf.getPage(pageNum).then(function (page) {
        var viewport = page.getViewport(DEFAULT_SCALE);

        var container = document.createElement('div');
        container.id = 'pageContainer' + pageNum;
        container.className = 'pageContainer';
        container.style.width = viewport.width + 'px';
        container.style.height = viewport.height + 'px';
        document.body.appendChild(container);

        return page.getOperatorList().then(function (opList) {
          var svgGfx = new svgLib.SVGGraphics(page.commonObjs, page.objs);
          return svgGfx.getSVG(opList, viewport).then(function (svg) {
            container.appendChild(svg);
          });
        });
      });
    }.bind(null, i));
  }
}

Promise.all([System.import('pdfjs/display/api'),
             System.import('pdfjs/display/svg'),
             System.import('pdfjs/display/global'),
             System.resolve('pdfjs/worker_loader')])
       .then(function (modules) {
  var api = modules[0], svg = modules[1], global = modules[2];
  // In production, change this to point to the built `pdf.worker.js` file.
  global.PDFJS.workerSrc = modules[3];

  // In production, change this to point to where the cMaps are placed.
  global.PDFJS.cMapUrl = '../../external/bcmaps/';
  global.PDFJS.cMapPacked = true;

  // Fetch the PDF document from the URL using promises.
  api.getDocument(url).then(function (doc) {
    renderDocument(doc, svg);
  });
});
