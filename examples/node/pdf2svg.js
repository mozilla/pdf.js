/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

//
// Node tool to dump SVG output into a file.
//

var fs = require("fs");
var util = require("util");
var path = require("path");
var stream = require("stream");

// HACK few hacks to let PDF.js be loaded not as a module in global space.
require("./domstubs.js").setStubs(global);

// Run `gulp dist-install` to generate 'pdfjs-dist' npm package files.
var pdfjsLib = require("pdfjs-dist/es5/build/pdf.js");

// Some PDFs need external cmaps.
var CMAP_URL = "../../node_modules/pdfjs-dist/cmaps/";
var CMAP_PACKED = true;

// Loading file from file system into typed array
var pdfPath = process.argv[2] || "../../web/compressed.tracemonkey-pldi-09.pdf";
var data = new Uint8Array(fs.readFileSync(pdfPath));

var outputDirectory = "./svgdump";

try {
  // Note: This creates a directory only one level deep. If you want to create
  // multiple subdirectories on the fly, use the mkdirp module from npm.
  fs.mkdirSync(outputDirectory);
} catch (e) {
  if (e.code !== "EEXIST") {
    throw e;
  }
}

// Dumps svg outputs to a folder called svgdump
function getFilePathForPage(pageNum) {
  var name = path.basename(pdfPath, path.extname(pdfPath));
  return path.join(outputDirectory, name + "-" + pageNum + ".svg");
}

/**
 * A readable stream which offers a stream representing the serialization of a
 * given DOM element (as defined by domstubs.js).
 *
 * @param {object} options
 * @param {DOMElement} options.svgElement The element to serialize
 */
function ReadableSVGStream(options) {
  if (!(this instanceof ReadableSVGStream)) {
    return new ReadableSVGStream(options);
  }
  stream.Readable.call(this, options);
  this.serializer = options.svgElement.getSerializer();
}
util.inherits(ReadableSVGStream, stream.Readable);
// Implements https://nodejs.org/api/stream.html#stream_readable_read_size_1
ReadableSVGStream.prototype._read = function () {
  var chunk;
  while ((chunk = this.serializer.getNext()) !== null) {
    if (!this.push(chunk)) {
      return;
    }
  }
  this.push(null);
};

// Streams the SVG element to the given file path.
function writeSvgToFile(svgElement, filePath) {
  var readableSvgStream = new ReadableSVGStream({
    svgElement: svgElement,
  });
  var writableStream = fs.createWriteStream(filePath);
  return new Promise(function (resolve, reject) {
    readableSvgStream.once("error", reject);
    writableStream.once("error", reject);
    writableStream.once("finish", resolve);
    readableSvgStream.pipe(writableStream);
  }).catch(function (err) {
    readableSvgStream = null; // Explicitly null because of v8 bug 6512.
    writableStream.end();
    throw err;
  });
}

// Will be using promises to load document, pages and misc data instead of
// callback.
var loadingTask = pdfjsLib.getDocument({
  data: data,
  cMapUrl: CMAP_URL,
  cMapPacked: CMAP_PACKED,
  fontExtraProperties: true,
});
loadingTask.promise
  .then(function (doc) {
    var numPages = doc.numPages;
    console.log("# Document Loaded");
    console.log("Number of Pages: " + numPages);
    console.log();

    var lastPromise = Promise.resolve(); // will be used to chain promises
    var loadPage = function (pageNum) {
      return doc.getPage(pageNum).then(function (page) {
        console.log("# Page " + pageNum);
        var viewport = page.getViewport({ scale: 1.0 });
        console.log("Size: " + viewport.width + "x" + viewport.height);
        console.log();

        return page.getOperatorList().then(function (opList) {
          var svgGfx = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs);
          svgGfx.embedFonts = true;
          return svgGfx.getSVG(opList, viewport).then(function (svg) {
            return writeSvgToFile(svg, getFilePathForPage(pageNum)).then(
              function () {
                console.log("Page: " + pageNum);
              },
              function (err) {
                console.log("Error: " + err);
              }
            );
          });
        });
      });
    };

    for (var i = 1; i <= numPages; i++) {
      lastPromise = lastPromise.then(loadPage.bind(null, i));
    }
    return lastPromise;
  })
  .then(
    function () {
      console.log("# End of Document");
    },
    function (err) {
      console.error("Error: " + err);
    }
  );
