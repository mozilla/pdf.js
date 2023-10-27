// Any copyright is dedicated to the Public Domain.
// http://creativecommons.org/licenses/publicdomain/

// Hello world example for webpack.

import * as pdfjsLib from "pdfjs-dist";

const pdfPath = "../learning/helloworld.pdf";

// Setting worker path to worker bundle.
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "../../build/webpack/pdf.worker.bundle.js";

// Loading a document.
const loadingTask = pdfjsLib.getDocument(pdfPath);
const pdfDocument = await loadingTask.promise;
// Request a first page
const pdfPage = await pdfDocument.getPage(1);
// Display page on the existing canvas with 100% scale.
const viewport = pdfPage.getViewport({ scale: 1.0 });
const canvas = document.getElementById("theCanvas");
canvas.width = viewport.width;
canvas.height = viewport.height;
const ctx = canvas.getContext("2d");
const renderTask = pdfPage.render({
  canvasContext: ctx,
  viewport,
});
await renderTask.promise;
