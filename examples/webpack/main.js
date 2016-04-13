// Any copyright is dedicated to the Public Domain.
// http://creativecommons.org/licenses/publicdomain/

// Hello world example for webpack.

var pdfjsLib = require('pdfjs-dist');

var pdfPath = '../helloworld/helloworld.pdf';

// Setting worker path to worker bundle.
pdfjsLib.PDFJS.workerSrc = '../../build/webpack/pdf.worker.bundle.js';

// It is also possible to disable workers via `PDFJS.disableWorker = true`,
// however that might degrade the UI performance in web browsers.

// Loading a document.
var loadingTask = pdfjsLib.getDocument(pdfPath);
loadingTask.promise.then(function (pdfDocument) {
  // Request a first page
  return pdfDocument.getPage(1).then(function (pdfPage) {
    // Display page on the existing canvas with 100% scale.
    var viewport = pdfPage.getViewport(1.0);
    var canvas = document.getElementById('theCanvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    var ctx = canvas.getContext('2d');
    var renderTask = pdfPage.render({
      canvasContext: ctx,
      viewport: viewport
    });
    return renderTask.promise;
  });
}).catch(function (reason) {
  console.error('Error: ' + reason);
});
