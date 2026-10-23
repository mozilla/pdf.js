import { PixelsPerInch, RenderingCancelledException } from "pdfjs-lib";
import { encodeGrayJpeg } from "./gray_jpeg_encoder.js";

// The resolution, in DPI, at which the pages are rasterized.
const SAVE_RESOLUTION = 300;
// The maximum (estimated) size of one output file; larger documents are split.
// It was calibrated against the base64 length of the embedded images.
const MAX_FILE_SIZE = 39000000;

const MSG_ANONYMIZING = "Anonimizē dokumentu...";
const MSG_SAVING = "Saglabā dokumentu...";
const MSG_ANONYMIZE_ERROR = "Neparedzēta kļūda anonimizējot dokumentu";
const MSG_SAVE_ERROR = "Neparedzēta kļūda saglabājot dokumentu";

let activeService = null;
let dialog = null;
let overlayPromise = null;

// Renders the page, with its redactions, to the scratch canvas of the given
// save service.
async function renderPage(service, pageNumber, size) {
  const { scratchCanvas } = service;
  const SAVE_UNITS = SAVE_RESOLUTION / PixelsPerInch.PDF;
  scratchCanvas.width = Math.floor(size.width * SAVE_UNITS);
  scratchCanvas.height = Math.floor(size.height * SAVE_UNITS);

  const ctx = scratchCanvas.getContext("2d");
  ctx.save();
  ctx.fillStyle = "rgb(255, 255, 255)";
  ctx.fillRect(0, 0, scratchCanvas.width, scratchCanvas.height);
  ctx.restore();

  const pdfPage = await service.pdfDocument.getPage(pageNumber);
  const viewport = pdfPage.getViewport({ scale: 1, rotation: size.rotation });
  const transform = [SAVE_UNITS, 0, 0, SAVE_UNITS, 0, 0];

  await pdfPage.render({
    canvas: scratchCanvas,
    transform,
    viewport,
    intent: "print",
  }).promise;

  // Paint the redactions with the very same viewport and transform as the
  // page itself, so that they cover exactly what was selected on screen.
  service.redactions.drawRedactions(ctx, pageNumber, viewport, transform);
}

function saveError(message, details) {
  return Object.assign(new Error(message), { details });
}

/**
 * @typedef {object} PDFSaveServiceOptions
 * @property {PDFDocumentProxy} pdfDocument
 * @property {Array<object>} pagesOverview - See `PDFViewer.getPagesOverview`.
 * @property {string} fileName - The name of the output file; when empty, it's
 *   derived from the document title.
 * @property {string} uploadUrl - Where the anonymized files are POSTed.
 * @property {EventBus} eventBus
 * @property {OverlayManager} overlayManager
 * @property {ProgressBar} [loadingBar]
 * @property {AnonymizationTool} redactions - Provides the redactions.
 */

class PDFSaveService {
  #pdfs = [];

  #renderingPages = false;

  #xhrs = [];

  /**
   * @param {PDFSaveServiceOptions} options
   */
  constructor({
    pdfDocument,
    pagesOverview,
    fileName,
    uploadUrl,
    eventBus,
    overlayManager,
    loadingBar = null,
    redactions,
  }) {
    this.pdfDocument = pdfDocument;
    this.pagesOverview = pagesOverview;
    this.fileName = fileName || `anon_${document.title}`;
    this.uploadUrl = uploadUrl;
    this.eventBus = eventBus;
    this.overlayManager = overlayManager;
    this.loadingBar = loadingBar;
    this.redactions = redactions;
    // The temporary canvas where renderPage paints one page at a time.
    this.scratchCanvas = document.createElement("canvas");
  }

  get active() {
    return this === activeService;
  }

  async performSave() {
    if (activeService) {
      return; // Only one save at a time.
    }
    activeService = this;
    this.redactions.forget();

    try {
      await ensureOverlay(this.overlayManager);
      setRenderAction(MSG_ANONYMIZING);
      this.#renderProgress(0, 1);
      await this.overlayManager.open(dialog);

      this.#renderingPages = true;
      this.eventBus.dispatch("beforesave", { source: this });
      await this.#renderPages();
    } catch (reason) {
      this.#fail(MSG_ANONYMIZE_ERROR, reason);
      return;
    } finally {
      this.#afterRendering();
    }

    try {
      await this.#uploadAll();
    } catch (reason) {
      this.#fail(MSG_SAVE_ERROR, reason);
      return;
    }
    this.destroy();
  }

  destroy() {
    if (activeService !== this) {
      // |activeService| cannot be replaced without calling destroy() first,
      // so if it differs then an external consumer has a stale reference to
      // us.
      return;
    }
    activeService = null;

    for (const xhr of this.#xhrs) {
      xhr.abort();
    }
    this.#xhrs.length = 0;
    this.#afterRendering();

    this.scratchCanvas.width = this.scratchCanvas.height = 0;
    this.loadingBar?.hide();
    ensureOverlay(this.overlayManager).then(() =>
      this.overlayManager.closeIfActive(dialog)
    );
  }

  #afterRendering() {
    if (this.#renderingPages) {
      this.#renderingPages = false;
      this.eventBus.dispatch("aftersave", { source: this });
    }
  }

  #fail(message, reason) {
    if (!this.active) {
      return; // The save was cancelled, which isn't an error.
    }
    this.destroy();

    const details = reason?.details ?? reason?.message ?? reason;
    const text = reason?.details !== undefined ? reason.message : message;
    console.error(`${text}:`, details);
    // eslint-disable-next-line no-alert
    window.alert(text);
  }

  #throwIfInactive() {
    if (!this.active) {
      throw new Error("This request was cancelled or completed.");
    }
  }

  async #renderPages() {
    const pageCount = this.pagesOverview.length;

    for (let i = 0; i < pageCount; i++) {
      this.#throwIfInactive();
      this.#renderProgress(i, pageCount);
      try {
        await renderPage(this, i + 1, this.pagesOverview[i]);
      } catch (reason) {
        if (!(reason instanceof RenderingCancelledException)) {
          console.error(reason);
        }
        throw reason;
      }
      this.#throwIfInactive();
      this.#addRenderedPage();

      // Yield, so that the progress is painted and cancelling is possible.
      await new Promise(resolve => {
        setTimeout(resolve, 0);
      });
    }
  }

  #addRenderedPage() {
    const { scratchCanvas } = this;
    const orientation = scratchCanvas.width > scratchCanvas.height ? "l" : "p";
    let pdf = this.#pdfs.at(-1);

    if (pdf && this.fileSize < MAX_FILE_SIZE) {
      pdf.addPage("a4", orientation);
    } else {
      // Provided by the jsPDF <script> in viewer.html.
      const JsPDF = window.jsPDF;
      if (!JsPDF) {
        throw new Error("jsPDF is not loaded.");
      }
      pdf = new JsPDF({ orientation, compress: true });
      this.#pdfs.push(pdf);
      this.fileSize = 0;
    }
    const { width, height } = pdf.internal.pageSize;
    const jpeg = encodeGrayJpeg(scratchCanvas, 50);
    pdf.addImage(jpeg, "JPEG", 0, 0, width, height);
    // MAX_FILE_SIZE was calibrated against base64 length.
    this.fileSize += (jpeg.length * 4) / 3;
  }

  #getFileName(index) {
    const { fileName } = this;
    if (this.#pdfs.length === 1) {
      return fileName;
    }
    const dot = fileName.lastIndexOf(".");
    return dot > 0
      ? `${fileName.slice(0, dot)}_${index + 1}${fileName.slice(dot)}`
      : `${fileName}_${index + 1}`;
  }

  async #uploadAll() {
    setRenderAction(MSG_SAVING);
    const fileCount = this.#pdfs.length;
    const progress = new Array(fileCount).fill(0);
    const updateProgress = () =>
      this.#renderProgress(
        progress.reduce((a, b) => a + b, 0),
        fileCount
      );
    updateProgress();

    let left = fileCount;
    await Promise.all(
      this.#pdfs.map(async (pdf, index) => {
        const fileName = this.#getFileName(index);
        const { guid } = await this.#upload(pdf, fileName, fraction => {
          progress[index] = fraction;
          updateProgress();
        });
        this.#throwIfInactive();
        this.eventBus.dispatch("documentsaved", {
          source: this,
          guid,
          fileName,
          left: --left,
        });
      })
    );
  }

  #upload(pdf, fileName, onProgress) {
    return new Promise((resolve, reject) => {
      const data = new FormData();
      data.append("fname", fileName);
      data.append("data", pdf.output("blob"), fileName);

      const xhr = new XMLHttpRequest();
      this.#xhrs.push(xhr);

      xhr.upload.onprogress = evt => {
        if (evt.lengthComputable) {
          onProgress(evt.loaded / evt.total);
        }
      };
      xhr.onload = () => {
        if (xhr.status !== 200) {
          reject(saveError(MSG_SAVE_ERROR, `${xhr.status} ${xhr.statusText}`));
          return;
        }
        let response;
        try {
          response = JSON.parse(xhr.responseText);
        } catch {
          reject(saveError(MSG_SAVE_ERROR, xhr.responseText));
          return;
        }
        if (response.status !== "ok") {
          reject(
            saveError(response.message || MSG_SAVE_ERROR, response.message)
          );
          return;
        }
        resolve(response);
      };
      xhr.onerror = () => reject(saveError(MSG_SAVE_ERROR, "Network error"));
      xhr.onabort = () => reject(new Error("The upload was aborted."));

      xhr.open("POST", this.uploadUrl, true);
      xhr.send(data);
    });
  }

  #renderProgress(index, total) {
    const progress = Math.round((100 * index) / total);
    dialog.querySelector("progress").value = progress;
    dialog
      .querySelector(".relative-progress")
      .setAttribute("data-l10n-args", JSON.stringify({ progress }));

    if (this.loadingBar) {
      this.loadingBar.show();
      this.loadingBar.percent = progress;
    }
  }
}

function abort() {
  activeService?.destroy();
}

function ensureOverlay(overlayManager) {
  if (!overlayPromise) {
    dialog = document.getElementById("saveOverlay");
    overlayPromise = overlayManager.register(
      dialog,
      /* canForceClose = */ true
    );
    document.getElementById("saveCancel").onclick = abort;
    // Unlike "close", which is also (asynchronously) dispatched when the
    // dialog is closed programmatically and could then abort the *next* save,
    // "cancel" is only dispatched when the user closes the dialog, e.g. with
    // the Escape key.
    dialog.addEventListener("cancel", abort);
  }
  return overlayPromise;
}

function setRenderAction(text) {
  dialog.querySelector(".progress-action").textContent = text;
}

export { PDFSaveService };
