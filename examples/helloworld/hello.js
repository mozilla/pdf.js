'use strict';

// In production, the bundled pdf.js shall be used instead of SystemJS.
Promise.all([System.import('pdfjs/display/api'),
             System.import('pdfjs/display/global'),
             System.import('pdfjs/display/network'),
             System.resolve('pdfjs/worker_loader')])
       .then(function (modules) {
  var api = modules[0], global = modules[1];
  // In production, change this to point to the built `pdf.worker.js` file.
  global.PDFJS.workerSrc = modules[3];

  // Fetch the PDF document from the URL using promises.
  api.getDocument('helloworld.pdf').then(function (pdf) {
    // Fetch the page.
    pdf.getPage(1).then(function (page) {
      var scale = 1.5;
      var viewport = page.getViewport(scale);

      // Prepare canvas using PDF page dimensions.
      var canvas = document.getElementById('the-canvas');
      var context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Render PDF page into canvas context.
      var renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      page.render(renderContext);
    });
  });
});
