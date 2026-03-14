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

import { getDocument, GlobalWorkerOptions, PasswordResponses } from "pdfjs-lib";
import { PageView } from "./page_view.js";
import { TreeView } from "./tree_view.js";

GlobalWorkerOptions.workerSrc =
  typeof PDFJSDev === "undefined"
    ? "../../src/pdf.worker.js"
    : "../build/pdf.worker.mjs";

// Parses "num" into { page: num }, or "numR"/"numRgen" into { ref: {num,gen} }.
// Returns null for invalid input.
function parseGoToInput(str) {
  const match = str.trim().match(/^(\d+)(R(\d+)?)?$/i);
  if (!match) {
    return null;
  }
  if (!match[2]) {
    return { page: parseInt(match[1], 10) };
  }
  return {
    ref: {
      num: parseInt(match[1], 10),
      gen: match[3] !== undefined ? parseInt(match[3], 10) : 0,
    },
  };
}

// Parses "num", "numR" or "numRgen" into { num, gen }, or returns null.
// Used for URL hash param parsing where a bare number means a ref, not a page.
function parseRefInput(str) {
  const match = str.trim().match(/^(\d+)(?:R(\d+)?)?$/i);
  if (!match) {
    return null;
  }
  return {
    num: parseInt(match[1], 10),
    gen: match[2] !== undefined ? parseInt(match[2], 10) : 0,
  };
}

let pdfDoc = null;

// Page number currently displayed in the tree (null when showing a
// ref/trailer).
let currentPage = null;

// Count of in-flight getRawData calls; drives the body "loading" cursor.
let loadingCount = 0;
function markLoading(delta) {
  loadingCount += delta;
  document.body.classList.toggle("loading", loadingCount > 0);
}

// Cache frequently accessed elements.
const debugButton = document.getElementById("debug-button");
const debugBackButton = document.getElementById("debug-back-button");
const debugViewEl = document.getElementById("debug-view");
const treeEl = document.getElementById("tree");
const statusEl = document.getElementById("status");
const gotoInput = document.getElementById("goto-input");
const pdfInfoEl = document.getElementById("pdf-info");

const pageView = new PageView({ onMarkLoading: markLoading });

const treeView = new TreeView(treeEl, { onMarkLoading: markLoading });

async function loadTree(data, rootLabel = null) {
  currentPage = typeof data.page === "number" ? data.page : null;
  debugButton.hidden = currentPage === null;
  debugBackButton.hidden = true;
  pageView.reset();
  debugViewEl.hidden = true;
  treeEl.hidden = false;
  await treeView.load(data, rootLabel, pdfDoc);
}

async function openDocument(source, name) {
  statusEl.textContent = `Loading ${name}…`;
  pdfInfoEl.textContent = "";
  treeView.clearCache();

  if (pdfDoc) {
    pageView.reset();
    await pdfDoc.destroy();
    pdfDoc = null;
  }

  const loadingTask = getDocument({
    ...source,
    cMapUrl:
      typeof PDFJSDev === "undefined" ? "../external/bcmaps/" : "../web/cmaps/",
    iccUrl:
      typeof PDFJSDev === "undefined" ? "../external/iccs/" : "../web/iccs/",
    standardFontDataUrl:
      typeof PDFJSDev === "undefined"
        ? "../external/standard_fonts/"
        : "../web/standard_fonts/",
    wasmUrl: "../web/wasm/",
    useWorkerFetch: true,
    pdfBug: true,
    CanvasFactory: pageView.DebugCanvasFactory,
  });
  loadingTask.onPassword = (updateCallback, reason) => {
    const dialog = document.getElementById("password-dialog");
    const title = document.getElementById("password-dialog-title");
    const input = document.getElementById("password-input");
    const cancelButton = document.getElementById("password-cancel");

    title.textContent =
      reason === PasswordResponses.INCORRECT_PASSWORD
        ? "Incorrect password. Please try again:"
        : "This PDF is password-protected. Please enter the password:";
    input.value = "";
    dialog.showModal();

    const cleanup = () => {
      dialog.removeEventListener("close", onSubmit);
      cancelButton.removeEventListener("click", onCancel);
    };
    const onSubmit = () => {
      cleanup();
      updateCallback(input.value);
    };
    const onCancel = () => {
      cleanup();
      dialog.close();
      updateCallback(new Error("Password prompt cancelled."));
    };

    dialog.addEventListener("close", onSubmit, { once: true });
    cancelButton.addEventListener("click", onCancel, { once: true });
  };
  pdfDoc = await loadingTask.promise;
  const plural = pdfDoc.numPages !== 1 ? "s" : "";
  pdfInfoEl.textContent = `${name} — ${pdfDoc.numPages} page${plural}`;
  statusEl.textContent = "";
  gotoInput.disabled = false;
  gotoInput.value = "";
}

function showError(err) {
  statusEl.textContent = `Error: ${err.message}`;
  treeView.showError(err.message);
}

document.getElementById("file-input").value = "";

document
  .getElementById("file-input")
  .addEventListener("change", async ({ target }) => {
    const file = target.files[0];
    if (!file) {
      return;
    }
    try {
      await openDocument({ data: await file.arrayBuffer() }, file.name);
      await loadTree({ ref: null }, "Trailer");
    } catch (err) {
      showError(err);
    }
  });

(async () => {
  const searchParams = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.slice(1));
  const fileUrl = searchParams.get("file");
  if (!fileUrl) {
    return;
  }
  try {
    await openDocument({ url: fileUrl }, fileUrl.split("/").pop());
    const refStr = hashParams.get("ref");
    const pageStr = hashParams.get("page");
    if (refStr) {
      const ref = parseRefInput(refStr);
      if (ref) {
        gotoInput.value = refStr;
        await loadTree({ ref });
        return;
      }
    }
    if (pageStr) {
      const page = parseInt(pageStr, 10);
      if (Number.isInteger(page) && page >= 1 && page <= pdfDoc.numPages) {
        gotoInput.value = pageStr;
        await loadTree({ page });
        return;
      }
    }
    await loadTree({ ref: null }, "Trailer");
  } catch (err) {
    showError(err);
  }
})();

gotoInput.addEventListener("keydown", async ({ key, target }) => {
  if (key !== "Enter" || !pdfDoc) {
    return;
  }
  if (target.value.trim() === "") {
    target.removeAttribute("aria-invalid");
    await loadTree({ ref: null }, "Trailer");
    return;
  }
  const result = parseGoToInput(target.value);
  if (!result) {
    target.setAttribute("aria-invalid", "true");
    return;
  }
  if (
    result.page !== undefined &&
    (result.page < 1 || result.page > pdfDoc.numPages)
  ) {
    target.setAttribute("aria-invalid", "true");
    return;
  }
  target.removeAttribute("aria-invalid");
  await (result.page !== undefined
    ? loadTree({ page: result.page })
    : loadTree({ ref: result.ref }));
});

gotoInput.addEventListener("input", ({ target }) => {
  if (target.value.trim() === "") {
    target.removeAttribute("aria-invalid");
  }
});

debugButton.addEventListener("click", async () => {
  debugButton.hidden = treeEl.hidden = true;
  debugBackButton.hidden = debugViewEl.hidden = false;
  // Only render if not already loaded for this page; re-entering from the
  // back button keeps the existing debug state (op-list, canvas, breakpoints).
  await pageView.show(pdfDoc, currentPage);
});

debugBackButton.addEventListener("click", () => {
  debugBackButton.hidden = debugViewEl.hidden = true;
  debugButton.hidden = treeEl.hidden = false;
});
