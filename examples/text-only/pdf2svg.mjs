/* Copyright 2014 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const PDF_PATH = "../../web/compressed.tracemonkey-pldi-09.pdf";
const PAGE_NUMBER = 1;
const PAGE_SCALE = 1.5;
const SVG_NS = "http://www.w3.org/2000/svg";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "../../node_modules/pdfjs-dist/build/pdf.worker.mjs";

function buildSVG(viewport, textContent) {
  // Building SVG with size of the viewport (for simplicity)
  const svg = document.createElementNS(SVG_NS, "svg:svg");
  svg.setAttribute("width", viewport.width + "px");
  svg.setAttribute("height", viewport.height + "px");
  // items are transformed to have 1px font size
  svg.setAttribute("font-size", 1);

  // processing all items
  textContent.items.forEach(function (textItem) {
    // we have to take in account viewport transform, which includes scale,
    // rotation and Y-axis flip, and not forgetting to flip text.
    const tx = pdfjsLib.Util.transform(
      pdfjsLib.Util.transform(viewport.transform, textItem.transform),
      [1, 0, 0, -1, 0, 0]
    );
    const style = textContent.styles[textItem.fontName];
    // adding text element
    const text = document.createElementNS(SVG_NS, "svg:text");
    text.setAttribute("transform", "matrix(" + tx.join(" ") + ")");
    text.setAttribute("font-family", style.fontFamily);
    text.textContent = textItem.str;
    svg.append(text);
  });
  return svg;
}

async function pageLoaded() {
  // Loading document and page text content
  const loadingTask = pdfjsLib.getDocument({ url: PDF_PATH });
  const pdfDocument = await loadingTask.promise;
  const page = await pdfDocument.getPage(PAGE_NUMBER);
  const viewport = page.getViewport({ scale: PAGE_SCALE });
  const textContent = await page.getTextContent();
  // building SVG and adding that to the DOM
  const svg = buildSVG(viewport, textContent);
  document.getElementById("pageContainer").append(svg);
  // Release page resources.
  page.cleanup();
}

document.addEventListener("DOMContentLoaded", function () {
  if (typeof pdfjsLib === "undefined") {
    // eslint-disable-next-line no-alert
    alert("Please build the pdfjs-dist library using\n  `gulp dist-install`");
    return;
  }
  pageLoaded();
});
