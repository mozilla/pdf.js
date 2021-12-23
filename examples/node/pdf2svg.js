/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

//
// Node tool to dump SVG output into a file.
//

const fs = require("fs");
const util = require("util");
const path = require("path");
const stream = require("stream");

// HACK few hacks to let PDF.js be loaded not as a module in global space.
require("./domstubs.js").setStubs(global);

// Run `gulp dist-install` to generate 'pdfjs-dist' npm package files.
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

// Some PDFs need external cmaps.
const CMAP_URL = "../../node_modules/pdfjs-dist/cmaps/";
const CMAP_PACKED = true;

// Loading file from file system into typed array
const pdfPath =
  process.argv[2] || "../../web/compressed.tracemonkey-pldi-09.pdf";
const data = new Uint8Array(fs.readFileSync(pdfPath));

const outputDirectory = "./svgdump";

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
  const name = path.basename(pdfPath, path.extname(pdfPath));
  return path.join(outputDirectory, `${name}-${pageNum}.svg`);
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
  let chunk;
  while ((chunk = this.serializer.getNext()) !== null) {
    if (!this.push(chunk)) {
      return;
    }
  }
  this.push(null);
};

// Streams the SVG element to the given file path.
function writeSvgToFile(svgElement, filePath) {
  let readableSvgStream = new ReadableSVGStream({
    svgElement,
  });
  const writableStream = fs.createWriteStream(filePath);
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

// Will be using async/await to load document, pages and misc data.
const loadingTask = pdfjsLib.getDocument({
  data,
  cMapUrl: CMAP_URL,
  cMapPacked: CMAP_PACKED,
  fontExtraProperties: true,
});
(async function () {
  const doc = await loadingTask.promise;
  const numPages = doc.numPages;
  console.log("# Document Loaded");
  console.log(`Number of Pages: ${numPages}`);
  console.log();

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    try {
      const page = await doc.getPage(pageNum);
      console.log(`# Page ${pageNum}`);
      const viewport = page.getViewport({ scale: 1.0 });
      console.log(`Size: ${viewport.width}x${viewport.height}`);
      console.log();

      const opList = await page.getOperatorList();
      const svgGfx = new pdfjsLib.SVGGraphics(
        page.commonObjs,
        page.objs,
        /* forceDataSchema = */ true
      );
      svgGfx.embedFonts = true;
      const svg = await svgGfx.getSVG(opList, viewport);
      await writeSvgToFile(svg, getFilePathForPage(pageNum));
      // Release page resources.
      page.cleanup();
    } catch (err) {
      console.log(`Error: ${err}`);
    }
  }
  console.log("# End of Document");
})();
