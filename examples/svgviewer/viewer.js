/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

//
// See README for overview
//

'use strict';

//
// Fetch the PDF document from the URL using promises
//
PDFJS.getDocument('../../test/pdfs/liveprogramming.pdf').then(function(pdf) {
  var numPages = pdf.numPages;
  // Using promise to fetch the page

  // For testing only.
  var MAX_NUM_PAGES = 50;
  var ii = Math.min(MAX_NUM_PAGES, numPages);
  
  var promise = Promise.resolve();
  for (var i = 1; i <= ii; i++) {
    // Using promise to fetch the page
    promise = promise.then(function (pageNum) {
      return pdf.getPage(pageNum).then(function (page) {
        var scale = 1.5;
        var viewport = page.getViewport(scale);

        var container = document.createElement('div');
        container.id = 'pageContainer' + pageNum;
        container.className = 'pageContainer';
        container.style.width = viewport.width + 'px';
        container.style.height = viewport.height + 'px';
        document.body.appendChild(container);

        var renderContext = {
          viewport: viewport,
          pageNum: pageNum,
          container: container
        };
        // run rendering only when all pages are loaded
        promise.then(function () {
          page.getOperatorList().then(function (opList) {
            var svgGfx = new SVGGraphics(page.commonObjs);
            svgGfx.loadDependencies(opList).then(function (values) {
              svgGfx.beginDrawing(renderContext.viewport, renderContext.pageNum,
                renderContext.container, opList);
            });
          });
        });
      });
    }.bind(null, i));
  }
});

