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

if (!pdfjsLib.getDocument || !pdfjsViewer.PDFPageView) {
  alert("Please build the pdfjs-dist library using\n  `gulp dist-install`");
}

// The workerSrc property shall be specified.
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "../../node_modules/pdfjs-dist/build/pdf.worker.mjs";

// Some PDFs need external cmaps.
const CMAP_URL = "../../node_modules/pdfjs-dist/cmaps/";
const CMAP_PACKED = true;

const DEFAULT_URL = "../../web/compressed.tracemonkey-pldi-09.pdf";
const PAGE_TO_VIEW = 1;

const ENABLE_XFA = true;

const container = document.getElementById("pageContainer");
const eventBus = new pdfjsViewer.EventBus();

// ---- ZOOM STATE (FIX) ----
let currentScale = 1.0;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;

// Loading document.
const loadingTask = pdfjsLib.getDocument({
  url: DEFAULT_URL,
  cMapUrl: CMAP_URL,
  cMapPacked: CMAP_PACKED,
  enableXfa: ENABLE_XFA,
});

const pdfDocument = await loadingTask.promise;
const pdfPage = await pdfDocument.getPage(PAGE_TO_VIEW);

// Creating the page view with default parameters.
const pdfPageView = new pdfjsViewer.PDFPageView({
  container,
  id: PAGE_TO_VIEW,
  scale: currentScale,
  defaultViewport: pdfPage.getViewport({ scale: currentScale }),
  eventBus,
});

// Associate the actual page with the view, and draw it.
pdfPageView.setPdfPage(pdfPage);
pdfPageView.draw();

// ---------- ZOOM UPDATE FUNCTION ----------
function updateZoom(scale) {
  currentScale = Math.min(Math.max(MIN_SCALE, scale), MAX_SCALE);

  pdfPageView.update({
    scale: currentScale,
    viewport: pdfPage.getViewport({ scale: currentScale }),
  });
}

// ---------- MOUSE WHEEL ZOOM ----------
container.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    updateZoom(currentScale + delta);
  },
  { passive: false }
);

// ---------- PINCH ZOOM (TOUCH) ----------
let lastDistance = null;

container.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();

      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (lastDistance) {
        const zoomFactor = distance / lastDistance;
        updateZoom(currentScale * zoomFactor);
      }

      lastDistance = distance;
    }
  },
  { passive: false }
);

container.addEventListener("touchend", () => {
  lastDistance = null;
});
