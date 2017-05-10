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

var PDF_PATH = '../../web/compressed.tracemonkey-pldi-09.pdf';
var PAGE_NUMBER = 1;
var PAGE_SCALE = 1.5;
var SVG_NS = 'http://www.w3.org/2000/svg';

PDFJS.workerSrc = '../../node_modules/pdfjs-dist/build/pdf.worker.js';

function buildSVG(viewport, textContent) {
  // Building SVG with size of the viewport (for simplicity)
  var svg = document.createElementNS(SVG_NS, 'svg:svg');
  svg.setAttribute('width', viewport.width + 'px');
  svg.setAttribute('height', viewport.height + 'px');
  // items are transformed to have 1px font size
  svg.setAttribute('font-size', 1);

  // processing all items
  textContent.items.forEach(function (textItem) {
    // we have to take in account viewport transform, which includes scale,
    // rotation and Y-axis flip, and not forgetting to flip text.
    var tx = PDFJS.Util.transform(
      PDFJS.Util.transform(viewport.transform, textItem.transform),
      [1, 0, 0, -1, 0, 0]);
    var style = textContent.styles[textItem.fontName];
    // adding text element
    var text = document.createElementNS(SVG_NS, 'svg:text');
    text.setAttribute('transform', 'matrix(' + tx.join(' ') + ')');
    text.setAttribute('font-family', style.fontFamily);
    text.textContent = textItem.str;
    svg.appendChild(text);
  });
  return svg;
}

function pageLoaded() {
  // Loading document and page text content
  PDFJS.getDocument({url: PDF_PATH}).then(function (pdfDocument) {
    pdfDocument.getPage(PAGE_NUMBER).then(function (page) {
      var viewport = page.getViewport(PAGE_SCALE);
      page.getTextContent().then(function (textContent) {
        // building SVG and adding that to the DOM
        var svg = buildSVG(viewport, textContent);
        document.getElementById('pageContainer').appendChild(svg);
      });
    });
  });
}

document.addEventListener('DOMContentLoaded', function () {
  if (typeof PDFJS === 'undefined') {
    alert('Built version of PDF.js was not found.\n' +
          'Please run `gulp dist-install`.');
    return;
  }
  pageLoaded();
});
