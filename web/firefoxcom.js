/* Copyright 2012 Mozilla Foundation
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

import { isPdfFile, PDFDataRangeTransport } from "pdfjs-lib";
import { AppOptions } from "./app_options.js";
import { BaseExternalServices } from "./external_services.js";
import { BasePreferences } from "./preferences.js";
import { DEFAULT_SCALE_VALUE } from "./ui_utils.js";
import { L10n } from "./l10n.js";

if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) {
  throw new Error(
    'Module "./firefoxcom.js" shall not be used outside MOZCENTRAL builds.'
  );
}

let viewerApp = { initialized: false };
function initCom(app) {
  viewerApp = app;
}

class FirefoxCom {
  /**
   * Creates an event that the extension is listening for and will
   * asynchronously respond to.
   * @param {string} action - The action to trigger.
   * @param {Object|string} [data] - The data to send.
   * @returns {Promise<any>} A promise that is resolved with the response data.
   */
  static requestAsync(action, data) {
    return new Promise(resolve => {
      this.request(action, data, resolve);
    });
  }

  /**
   * Creates an event that the extension is listening for and will, optionally,
   * asynchronously respond to.
   * @param {string} action - The action to trigger.
   * @param {Object|string} [data] - The data to send.
   */
  static request(action, data, callback = null) {
    const request = document.createTextNode("");
    if (callback) {
      request.addEventListener(
        "pdf.js.response",
        event => {
          const response = event.detail.response;
          event.target.remove();

          callback(response);
        },
        { once: true }
      );
    }
    document.documentElement.append(request);

    const sender = new CustomEvent("pdf.js.message", {
      bubbles: true,
      cancelable: false,
      detail: {
        action,
        data,
        responseExpected: !!callback,
      },
    });
    request.dispatchEvent(sender);
  }
}

class DownloadManager {
  #openBlobUrls = new WeakMap();

  downloadData(data, filename, contentType) {
    const blobUrl = URL.createObjectURL(
      new Blob([data], { type: contentType })
    );

    FirefoxCom.request("download", {
      blobUrl,
      originalUrl: blobUrl,
      filename,
      isAttachment: true,
    });
  }

  /**
   * @returns {boolean} Indicating if the data was opened.
   */
  openOrDownloadData(data, filename, dest = null) {
    const isPdfData = isPdfFile(filename);
    const contentType = isPdfData ? "application/pdf" : "";

    if (isPdfData) {
      let blobUrl = this.#openBlobUrls.get(data);
      if (!blobUrl) {
        blobUrl = URL.createObjectURL(new Blob([data], { type: contentType }));
        this.#openBlobUrls.set(data, blobUrl);
      }
      // Let Firefox's content handler catch the URL and display the PDF.
      // NOTE: This cannot use a query string for the filename, see
      //       https://bugzilla.mozilla.org/show_bug.cgi?id=1632644#c5
      let viewerUrl = blobUrl + "#filename=" + encodeURIComponent(filename);
      if (dest) {
        viewerUrl += `&filedest=${escape(dest)}`;
      }

      try {
        window.open(viewerUrl);
        return true;
      } catch (ex) {
        console.error("openOrDownloadData:", ex);
        // Release the `blobUrl`, since opening it failed, and fallback to
        // downloading the PDF file.
        URL.revokeObjectURL(blobUrl);
        this.#openBlobUrls.delete(data);
      }
    }

    this.downloadData(data, filename, contentType);
    return false;
  }

  download(data, url, filename) {
    const blobUrl = data
      ? URL.createObjectURL(new Blob([data], { type: "application/pdf" }))
      : null;

    FirefoxCom.request("download", {
      blobUrl,
      originalUrl: url,
      filename,
    });
  }
}

class Preferences extends BasePreferences {
  async _readFromStorage(prefObj) {
    return FirefoxCom.requestAsync("getPreferences", prefObj);
  }

  async _writeToStorage(prefObj) {
    return FirefoxCom.requestAsync("setPreferences", prefObj);
  }
}

(function listenFindEvents() {
  const events = [
    "find",
    "findagain",
    "findhighlightallchange",
    "findcasesensitivitychange",
    "findentirewordchange",
    "findbarclose",
    "finddiacriticmatchingchange",
  ];
  const findLen = "find".length;

  const handleEvent = function ({ type, detail }) {
    if (!viewerApp.initialized) {
      return;
    }
    if (type === "findbarclose") {
      viewerApp.eventBus.dispatch(type, { source: window });
      return;
    }
    viewerApp.eventBus.dispatch("find", {
      source: window,
      type: type.substring(findLen),
      query: detail.query,
      caseSensitive: !!detail.caseSensitive,
      entireWord: !!detail.entireWord,
      highlightAll: !!detail.highlightAll,
      findPrevious: !!detail.findPrevious,
      matchDiacritics: !!detail.matchDiacritics,
    });
  };

  for (const event of events) {
    window.addEventListener(event, handleEvent);
  }
})();

(function listenZoomEvents() {
  const events = ["zoomin", "zoomout", "zoomreset"];
  const handleEvent = function ({ type, detail }) {
    if (!viewerApp.initialized) {
      return;
    }
    // Avoid attempting to needlessly reset the zoom level *twice* in a row,
    // when using the `Ctrl + 0` keyboard shortcut.
    if (
      type === "zoomreset" &&
      viewerApp.pdfViewer.currentScaleValue === DEFAULT_SCALE_VALUE
    ) {
      return;
    }
    viewerApp.eventBus.dispatch(type, { source: window });
  };

  for (const event of events) {
    window.addEventListener(event, handleEvent);
  }
})();

(function listenSaveEvent() {
  const handleEvent = function ({ type, detail }) {
    if (!viewerApp.initialized) {
      return;
    }
    viewerApp.eventBus.dispatch("download", { source: window });
  };

  window.addEventListener("save", handleEvent);
})();

(function listenEditingEvent() {
  const handleEvent = function ({ detail }) {
    if (!viewerApp.initialized) {
      return;
    }
    viewerApp.eventBus.dispatch("editingaction", {
      source: window,
      name: detail.name,
    });
  };

  window.addEventListener("editingaction", handleEvent);
})();

if (PDFJSDev.test("GECKOVIEW")) {
  (function listenQueryEvents() {
    window.addEventListener("pdf.js.query", async ({ detail: { queryId } }) => {
      let result = null;
      if (viewerApp.initialized && queryId === "canDownloadInsteadOfPrint") {
        result = false;
        const { pdfDocument, pdfViewer } = viewerApp;
        if (pdfDocument) {
          try {
            const hasUnchangedAnnotations =
              pdfDocument.annotationStorage.size === 0;
            // WillPrint is called just before printing the document and could
            // lead to have modified annotations.
            const hasWillPrint =
              pdfViewer.enableScripting &&
              !!(await pdfDocument.getJSActions())?.WillPrint;

            result = hasUnchangedAnnotations && !hasWillPrint;
          } catch {
            console.warn("Unable to check if the document can be downloaded.");
          }
        }
      }

      window.dispatchEvent(
        new CustomEvent("pdf.js.query.answer", {
          bubbles: true,
          cancelable: false,
          detail: {
            queryId,
            value: result,
          },
        })
      );
    });
  })();
}

class FirefoxComDataRangeTransport extends PDFDataRangeTransport {
  requestDataRange(begin, end) {
    FirefoxCom.request("requestDataRange", { begin, end });
  }

  // NOTE: This method is currently not invoked in the Firefox PDF Viewer.
  abort() {
    FirefoxCom.request("abortLoading", null);
  }
}

class FirefoxScripting {
  static async createSandbox(data) {
    const success = await FirefoxCom.requestAsync("createSandbox", data);
    if (!success) {
      throw new Error("Cannot create sandbox.");
    }
  }

  static async dispatchEventInSandbox(event) {
    FirefoxCom.request("dispatchEventInSandbox", event);
  }

  static async destroySandbox() {
    FirefoxCom.request("destroySandbox", null);
  }
}

class MLManager {
  #abortSignal = null;

  #enabled = null;

  #eventBus = null;

  #ready = null;

  #requestResolvers = null;

  hasProgress = false;

  static #AI_ALT_TEXT_MODEL_NAME = "moz-image-to-text";

  constructor({
    altTextLearnMoreUrl,
    enableGuessAltText,
    enableAltTextModelDownload,
  }) {
    // The `altTextLearnMoreUrl` is used to provide a link to the user to learn
    // more about the "alt text" feature.
    // The link is used in the Alt Text dialog or in the Image Settings.
    this.altTextLearnMoreUrl = altTextLearnMoreUrl;
    this.enableAltTextModelDownload = enableAltTextModelDownload;
    this.enableGuessAltText = enableGuessAltText;
  }

  setEventBus(eventBus, abortSignal) {
    this.#eventBus = eventBus;
    this.#abortSignal = abortSignal;
    eventBus._on(
      "enablealttextmodeldownload",
      ({ value }) => {
        if (this.enableAltTextModelDownload === value) {
          return;
        }
        if (value) {
          this.downloadModel("altText");
        } else {
          this.deleteModel("altText");
        }
      },
      { signal: abortSignal }
    );
    eventBus._on(
      "enableguessalttext",
      ({ value }) => {
        this.toggleService("altText", value);
      },
      { signal: abortSignal }
    );
  }

  async isEnabledFor(name) {
    return this.enableGuessAltText && !!(await this.#enabled?.get(name));
  }

  isReady(name) {
    return this.#ready?.has(name) ?? false;
  }

  async deleteModel(name) {
    if (name !== "altText" || !this.enableAltTextModelDownload) {
      return;
    }
    this.enableAltTextModelDownload = false;
    this.#ready?.delete(name);
    this.#enabled?.delete(name);
    await this.toggleService("altText", false);
    await FirefoxCom.requestAsync(
      "mlDelete",
      MLManager.#AI_ALT_TEXT_MODEL_NAME
    );
  }

  async loadModel(name) {
    if (name === "altText" && this.enableAltTextModelDownload) {
      await this.#loadAltTextEngine(false);
    }
  }

  async downloadModel(name) {
    if (name !== "altText" || this.enableAltTextModelDownload) {
      return null;
    }
    this.enableAltTextModelDownload = true;
    return this.#loadAltTextEngine(true);
  }

  async guess(data) {
    if (data?.name !== "altText") {
      return null;
    }
    const resolvers = (this.#requestResolvers ||= new Set());
    const resolver = Promise.withResolvers();
    resolvers.add(resolver);

    data.service = MLManager.#AI_ALT_TEXT_MODEL_NAME;

    FirefoxCom.requestAsync("mlGuess", data)
      .then(response => {
        if (resolvers.has(resolver)) {
          resolver.resolve(response);
          resolvers.delete(resolver);
        }
      })
      .catch(reason => {
        if (resolvers.has(resolver)) {
          resolver.reject(reason);
          resolvers.delete(resolver);
        }
      });

    return resolver.promise;
  }

  async #cancelAllRequests() {
    if (!this.#requestResolvers) {
      return;
    }
    for (const resolver of this.#requestResolvers) {
      resolver.resolve({ cancel: true });
    }
    this.#requestResolvers.clear();
    this.#requestResolvers = null;
  }

  async toggleService(name, enabled) {
    if (name !== "altText" || this.enableGuessAltText === enabled) {
      return;
    }

    this.enableGuessAltText = enabled;
    if (enabled) {
      if (this.enableAltTextModelDownload) {
        await this.#loadAltTextEngine(false);
      }
    } else {
      this.#cancelAllRequests();
    }
  }

  async #loadAltTextEngine(listenToProgress) {
    if (this.#enabled?.has("altText")) {
      // We already have a promise for the "altText" service.
      return;
    }
    this.#ready ||= new Set();
    const promise = FirefoxCom.requestAsync("loadAIEngine", {
      service: MLManager.#AI_ALT_TEXT_MODEL_NAME,
      listenToProgress,
    }).then(ok => {
      if (ok) {
        this.#ready.add("altText");
      }
      return ok;
    });
    (this.#enabled ||= new Map()).set("altText", promise);
    if (listenToProgress) {
      const ac = new AbortController();
      const signal = AbortSignal.any([this.#abortSignal, ac.signal]);

      this.hasProgress = true;
      window.addEventListener(
        "loadAIEngineProgress",
        ({ detail }) => {
          this.#eventBus.dispatch("loadaiengineprogress", {
            source: this,
            detail,
          });
          if (detail.finished) {
            ac.abort();
            this.hasProgress = false;
          }
        },
        { signal }
      );
      promise.then(ok => {
        if (!ok) {
          ac.abort();
          this.hasProgress = false;
        }
      });
    }
    await promise;
  }
}

class SignatureStorage {
  #eventBus = null;

  #signatures = null;

  #signal = null;

  constructor(eventBus, signal) {
    this.#eventBus = eventBus;
    this.#signal = signal;
  }

  #handleSignature(data) {
    return FirefoxCom.requestAsync("handleSignature", data);
  }

  async getAll() {
    if (this.#signal) {
      window.addEventListener(
        "storedSignaturesChanged",
        () => {
          this.#signatures = null;
          this.#eventBus?.dispatch("storedsignatureschanged", { source: this });
        },
        { signal: this.#signal }
      );
      this.#signal = null;
    }
    if (!this.#signatures) {
      this.#signatures = new Map();
      const data = await this.#handleSignature({ action: "get" });
      if (data) {
        for (const { uuid, description, signatureData } of data) {
          this.#signatures.set(uuid, { description, signatureData });
        }
      }
    }
    return this.#signatures;
  }

  async isFull() {
    // We want to store at most 5 signatures.
    return (await this.size()) === 5;
  }

  async size() {
    return (await this.getAll()).size;
  }

  async create(data) {
    if (await this.isFull()) {
      return null;
    }
    const uuid = await this.#handleSignature({
      action: "create",
      ...data,
    });
    if (!uuid) {
      return null;
    }
    this.#signatures.set(uuid, data);
    return uuid;
  }

  async delete(uuid) {
    const signatures = await this.getAll();
    if (!signatures.has(uuid)) {
      return false;
    }
    if (await this.#handleSignature({ action: "delete", uuid })) {
      signatures.delete(uuid);
      return true;
    }
    return false;
  }
}

class ExternalServices extends BaseExternalServices {
  updateFindControlState(data) {
    FirefoxCom.request("updateFindControlState", data);
  }

  updateFindMatchesCount(data) {
    FirefoxCom.request("updateFindMatchesCount", data);
  }

  initPassiveLoading() {
    let pdfDataRangeTransport;

    window.addEventListener("message", function windowMessage(e) {
      if (e.source !== null) {
        // The message MUST originate from Chrome code.
        console.warn("Rejected untrusted message from " + e.origin);
        return;
      }
      const args = e.data;

      if (typeof args !== "object" || !("pdfjsLoadAction" in args)) {
        return;
      }
      switch (args.pdfjsLoadAction) {
        case "supportsRangedLoading":
          if (args.done && !args.data) {
            viewerApp._documentError(null);
            break;
          }
          pdfDataRangeTransport = new FirefoxComDataRangeTransport(
            args.length,
            args.data,
            args.done,
            args.filename
          );

          viewerApp.open({ range: pdfDataRangeTransport });
          break;
        case "range":
          pdfDataRangeTransport.onDataRange(args.begin, args.chunk);
          break;
        case "rangeProgress":
          pdfDataRangeTransport.onDataProgress(args.loaded);
          break;
        case "progressiveRead":
          pdfDataRangeTransport.onDataProgressiveRead(args.chunk);

          // Don't forget to report loading progress as well, since otherwise
          // the loadingBar won't update when `disableRange=true` is set.
          pdfDataRangeTransport.onDataProgress(args.loaded, args.total);
          break;
        case "progressiveDone":
          pdfDataRangeTransport?.onDataProgressiveDone();
          break;
        case "progress":
          viewerApp.progress(args.loaded / args.total);
          break;
        case "complete":
          if (!args.data) {
            viewerApp._documentError(null, { message: args.errorCode });
            break;
          }
          viewerApp.open({ data: args.data, filename: args.filename });
          break;
      }
    });
    FirefoxCom.request("initPassiveLoading", null);
  }

  reportTelemetry(data) {
    FirefoxCom.request("reportTelemetry", data);
  }

  updateEditorStates(data) {
    FirefoxCom.request("updateEditorStates", data);
  }

  async createL10n() {
    await document.l10n.ready;
    return new L10n(AppOptions.get("localeProperties"), document.l10n);
  }

  createScripting() {
    return FirefoxScripting;
  }

  createSignatureStorage(eventBus, signal) {
    return new SignatureStorage(eventBus, signal);
  }

  dispatchGlobalEvent(event) {
    FirefoxCom.request("dispatchGlobalEvent", event);
  }
}

export { DownloadManager, ExternalServices, initCom, MLManager, Preferences };
