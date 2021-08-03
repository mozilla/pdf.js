/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

//
// Basic node example that prints document metadata and text content.
// Requires single file built version of PDF.js -- please run
// `gulp singlefile` before running the example.
//

// Run `gulp dist-install` to generate 'pdfjs-dist' npm package files.
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

// Loading file from file system into typed array
const pdfPath =
  process.argv[2] || "../../web/compressed.tracemonkey-pldi-09.pdf";

// Will be using promises to load document, pages and misc data instead of
// callback.
const loadingTask = pdfjsLib.getDocument(pdfPath);
loadingTask.promise
  .then(function (doc) {
    const numPages = doc.numPages;
    console.log("# Document Loaded");
    console.log("Number of Pages: " + numPages);
    console.log();

    let lastPromise; // will be used to chain promises
    lastPromise = doc.getMetadata().then(function (data) {
      console.log("# Metadata Is Loaded");
      console.log("## Info");
      console.log(JSON.stringify(data.info, null, 2));
      console.log();
      if (data.metadata) {
        console.log("## Metadata");
        console.log(JSON.stringify(data.metadata.getAll(), null, 2));
        console.log();
      }
    });

    const loadPage = function (pageNum) {
      return doc.getPage(pageNum).then(function (page) {
        console.log("# Page " + pageNum);
        const viewport = page.getViewport({ scale: 1.0 });
        console.log("Size: " + viewport.width + "x" + viewport.height);
        console.log();
        return page
          .getTextContent()
          .then(function (content) {
            // Content contains lots of information about the text layout and
            // styles, but we need only strings at the moment
            const strings = content.items.map(function (item) {
              return item.str;
            });
            console.log("## Text Content");
            console.log(strings.join(" "));
          })
          .then(function () {
            console.log();
          });
      });
    };
    // Loading of the first page will wait on metadata and subsequent loadings
    // will wait on the previous pages.
    for (let i = 1; i <= numPages; i++) {
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
