/* Copyright 2026 Mozilla Foundation
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

import { getDocument, GlobalWorkerOptions } from "pdfjs-lib";
import { EventBus } from "../../web/event_utils.js";
import { GenericL10n } from "../../web/genericl10n.js";
import { PDFFindController } from "../../web/pdf_find_controller.js";
import { PDFLinkService } from "../../web/pdf_link_service.js";
import { PDFScriptingManager } from "../../web/pdf_scripting_manager.js";
import { PDFViewer } from "../../web/pdf_viewer.js";

// The workerSrc property shall be specified.
//
GlobalWorkerOptions.workerSrc =
  typeof PDFJSDev === "undefined"
    ? "../../src/pdf.worker.js"
    : "../../build/pdf.worker.mjs";

// Some PDFs need external cmaps.
//
const CMAP_URL =
  typeof PDFJSDev === "undefined"
    ? "../../external/bcmaps/"
    : "../../web/cmaps/";

const DEFAULT_URL = "../../web/compressed.tracemonkey-pldi-09.pdf";

const ENABLE_XFA = true;
const SEARCH_FOR = ""; // try "Mozilla";

const SANDBOX_BUNDLE_SRC = new URL(
  typeof PDFJSDev === "undefined"
    ? "../../src/pdf.sandbox.js"
    : "../../build/pdf.sandbox.mjs",
  window.location
);

const fileUrl = new URLSearchParams(location.search).get("file") ?? DEFAULT_URL;

const container = document.getElementById("viewerContainer");

const eventBus = new EventBus();

// (Optionally) enable hyperlinks within PDF files.
const pdfLinkService = new PDFLinkService({
  eventBus,
});

// (Optionally) enable find controller.
const pdfFindController = new PDFFindController({
  eventBus,
  linkService: pdfLinkService,
});

// (Optionally) enable scripting support.
const pdfScriptingManager = new PDFScriptingManager({
  eventBus,
  sandboxBundleSrc: SANDBOX_BUNDLE_SRC,
});

const pdfViewer = new PDFViewer({
  container,
  eventBus,
  l10n: new GenericL10n(navigator.language),
  linkService: pdfLinkService,
  findController: pdfFindController,
  scriptingManager: pdfScriptingManager,
});
pdfLinkService.setViewer(pdfViewer);
pdfScriptingManager.setViewer(pdfViewer);

eventBus.on("pagesinit", function () {
  // We can use pdfViewer now, e.g. let's change default scale.
  pdfViewer.currentScaleValue = "page-width";

  // We can try searching for things.
  if (SEARCH_FOR) {
    eventBus.dispatch("find", { type: "", query: SEARCH_FOR });
  }
});

// Loading document.
const loadingTask = getDocument({
  url: fileUrl,
  cMapUrl: CMAP_URL,
  enableXfa: ENABLE_XFA,
});

const pdfDocument = await loadingTask.promise;
// Document loaded, specifying document for the viewer and
// the (optional) linkService.
pdfViewer.setDocument(pdfDocument);

pdfLinkService.setDocument(pdfDocument, null);
