/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

//
// Basic node example that prints document metadata and text content.
//

// Run `gulp dist-install` to generate 'pdfjs-dist' npm package files.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// Loading file from file system into typed array
const pdfPath =
  process.argv[2] || "../../web/compressed.tracemonkey-pldi-09.pdf";

// Will be using promises to load document, pages and misc data instead of
// callback.
const loadingTask = getDocument({ url: pdfPath });
try {
  const pdfDoc = await loadingTask.promise;

  const { numPages } = pdfDoc;
  console.log("# Document Loaded");
  console.log(`Number of Pages: ${numPages}`);
  console.log();

  const { info, metadata } = await pdfDoc.getMetadata();
  console.log("# Metadata is Loaded");
  console.log("## Info");
  console.log(JSON.stringify(info, null, 2));
  console.log();
  if (metadata) {
    console.log("## Metadata");
    console.log(JSON.stringify(Object.fromEntries(metadata), null, 2));
    console.log();
  }

  for (let i = 1; i <= numPages; i++) {
    const pdfPage = await pdfDoc.getPage(i);
    console.log(`# Page ${i}`);
    const viewport = pdfPage.getViewport({ scale: 1.0 });
    console.log(`Size: ${viewport.width}x${viewport.height}`);
    console.log();

    const { items } = await pdfPage.getTextContent();
    // Content contains lots of information about the text layout and
    // styles, but we need only strings at the moment
    console.log("## Text Content");
    console.log(items.map(item => item.str).join(" "));
    console.log();
    // Release page resources.
    pdfPage.cleanup();
  }

  await loadingTask.destroy();
  console.log("# End of Document");
} catch (ex) {
  console.error(`Error: ${ex}`);
}
