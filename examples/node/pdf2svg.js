/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

//
// Node tool to dump SVG output into a file.
//

var fs = require('fs');

// HACK few hacks to let PDF.js be loaded not as a module in global space.
require('./domstubs.js');

// Run `gulp dist` to generate 'pdfjs-dist' npm package files.
var pdfjsLib = require('../../build/dist');

// Loading file from file system into typed array
var pdfPath = process.argv[2] || '../../web/compressed.tracemonkey-pldi-09.pdf';
var data = new Uint8Array(fs.readFileSync(pdfPath));

// Dumps svg outputs to a folder called svgdump
function writeToFile(svgdump, pageNum) {
  var name = getFileNameFromPath(pdfPath);
  fs.mkdir('./svgdump/', function(err) {
    if (!err || err.code === 'EEXIST') {
      fs.writeFile('./svgdump/' + name + "-" + pageNum + '.svg', svgdump,
        function(err) {
          if (err) {
            console.log('Error: ' + err);
          } else {
            console.log('Page: ' + pageNum);
          }
        });
    }
  });
}

// Get filename from the path

function getFileNameFromPath(path) {
  var index = path.lastIndexOf('/');
  var extIndex = path.lastIndexOf('.');
  return path.substring(index , extIndex);
}

// Will be using promises to load document, pages and misc data instead of
// callback.
pdfjsLib.getDocument({
  data: data,
  disableNativeImageDecoder: true,
}).then(function (doc) {
  var numPages = doc.numPages;
  console.log('# Document Loaded');
  console.log('Number of Pages: ' + numPages);
  console.log();

  var lastPromise = Promise.resolve(); // will be used to chain promises
  var loadPage = function (pageNum) {
    return doc.getPage(pageNum).then(function (page) {
      console.log('# Page ' + pageNum);
      var viewport = page.getViewport(1.0 /* scale */);
      console.log('Size: ' + viewport.width + 'x' + viewport.height);
      console.log();

      return page.getOperatorList().then(function (opList) {
        var svgGfx = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs);
        svgGfx.embedFonts = true;
        return svgGfx.getSVG(opList, viewport).then(function (svg) {
          var svgDump = svg.toString();
          writeToFile(svgDump, pageNum);
        });
      });
    })
  };

  for (var i = 1; i <= numPages; i++) {
    lastPromise = lastPromise.then(loadPage.bind(null, i));
  }
  return lastPromise;
}).then(function () {
  console.log('# End of Document');
}, function (err) {
  console.error('Error: ' + err);
});
