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

import "../extensions/firefox/tools/l10n.js";
import { DefaultExternalServices, PDFViewerApplication } from "./app.js";
import { PDFDataRangeTransport, shadow } from "pdfjs-lib";
import { BasePreferences } from "./preferences.js";
import { DEFAULT_SCALE_VALUE } from "./ui_utils.js";

if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) {
  throw new Error(
    'Module "./firefoxcom.js" shall not be used outside MOZCENTRAL builds.'
  );
}

class FirefoxCom {
  /**
   * Creates an event that the extension is listening for and will
   * synchronously respond to.
   * NOTE: It is recommended to use requestAsync() instead since one day we may
   *       not be able to synchronously reply.
   * @param {string} action - The action to trigger.
   * @param {Object|string} [data] - The data to send.
   * @returns {*} The response.
   */
  static requestSync(action, data) {
    const request = document.createTextNode("");
    document.documentElement.appendChild(request);

    const sender = document.createEvent("CustomEvent");
    sender.initCustomEvent("pdf.js.message", true, false, {
      action,
      data,
      sync: true,
    });
    request.dispatchEvent(sender);
    const response = sender.detail.response;
    request.remove();

    return response;
  }

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
    document.documentElement.appendChild(request);

    const sender = document.createEvent("CustomEvent");
    sender.initCustomEvent("pdf.js.message", true, false, {
      action,
      data,
      sync: false,
      responseExpected: !!callback,
    });
    request.dispatchEvent(sender);
  }
}

class DownloadManager {
  downloadUrl(url, filename) {
    FirefoxCom.request("download", {
      originalUrl: url,
      filename,
    });
  }

  downloadData(data, filename, contentType) {
    const blobUrl = URL.createObjectURL(
      new Blob([data], { type: contentType })
    );

    FirefoxCom.requestAsync("download", {
      blobUrl,
      originalUrl: blobUrl,
      filename,
      isAttachment: true,
    }).then(error => {
      URL.revokeObjectURL(blobUrl);
    });
  }

  download(blob, url, filename, sourceEventType = "download") {
    const blobUrl = URL.createObjectURL(blob);

    FirefoxCom.requestAsync("download", {
      blobUrl,
      originalUrl: url,
      filename,
      sourceEventType,
    }).then(error => {
      if (error) {
        // If downloading failed in `PdfStreamConverter.jsm` it's very unlikely
        // that attempting to fallback and re-download would be helpful here.
        console.error("`ChromeActions.download` failed.");
      }
      URL.revokeObjectURL(blobUrl);
    });
  }
}

class FirefoxPreferences extends BasePreferences {
  async _writeToStorage(prefObj) {
    return FirefoxCom.requestAsync("setPreferences", prefObj);
  }

  async _readFromStorage(prefObj) {
    const prefStr = await FirefoxCom.requestAsync("getPreferences", prefObj);
    return JSON.parse(prefStr);
  }
}

class MozL10n {
  constructor(mozL10n) {
    this.mozL10n = mozL10n;
  }

  async getLanguage() {
    return this.mozL10n.getLanguage();
  }

  async getDirection() {
    return this.mozL10n.getDirection();
  }

  async get(property, args, fallback) {
    return this.mozL10n.get(property, args, fallback);
  }

  async translate(element) {
    this.mozL10n.translate(element);
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
  ];
  const handleEvent = function ({ type, detail }) {
    if (!PDFViewerApplication.initialized) {
      return;
    }
    if (type === "findbarclose") {
      PDFViewerApplication.eventBus.dispatch(type, { source: window });
      return;
    }
    PDFViewerApplication.eventBus.dispatch("find", {
      source: window,
      type: type.substring("find".length),
      query: detail.query,
      phraseSearch: true,
      caseSensitive: !!detail.caseSensitive,
      entireWord: !!detail.entireWord,
      highlightAll: !!detail.highlightAll,
      findPrevious: !!detail.findPrevious,
    });
  };

  for (const event of events) {
    window.addEventListener(event, handleEvent);
  }
})();

(function listenZoomEvents() {
  const events = ["zoomin", "zoomout", "zoomreset"];
  const handleEvent = function ({ type, detail }) {
    if (!PDFViewerApplication.initialized) {
      return;
    }
    // Avoid attempting to needlessly reset the zoom level *twice* in a row,
    // when using the `Ctrl + 0` keyboard shortcut.
    if (
      type === "zoomreset" &&
      PDFViewerApplication.pdfViewer.currentScaleValue === DEFAULT_SCALE_VALUE
    ) {
      return;
    }
    PDFViewerApplication.eventBus.dispatch(type, { source: window });
  };

  for (const event of events) {
    window.addEventListener(event, handleEvent);
  }
})();

(function listenSaveEvent() {
  const handleEvent = function ({ type, detail }) {
    if (!PDFViewerApplication.initialized) {
      return;
    }
    PDFViewerApplication.eventBus.dispatch(type, { source: window });
  };

  window.addEventListener("save", handleEvent);
})();

class FirefoxComDataRangeTransport extends PDFDataRangeTransport {
  requestDataRange(begin, end) {
    FirefoxCom.request("requestDataRange", { begin, end });
  }

  abort() {
    // Sync call to ensure abort is really started.
    FirefoxCom.requestSync("abortLoading", null);
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

class FirefoxExternalServices extends DefaultExternalServices {
  static updateFindControlState(data) {
    FirefoxCom.request("updateFindControlState", data);
  }

  static updateFindMatchesCount(data) {
    FirefoxCom.request("updateFindMatchesCount", data);
  }

  static initPassiveLoading(callbacks) {
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
          pdfDataRangeTransport = new FirefoxComDataRangeTransport(
            args.length,
            args.data,
            args.done
          );

          callbacks.onOpenWithTransport(
            args.pdfUrl,
            args.length,
            pdfDataRangeTransport
          );
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
          if (pdfDataRangeTransport) {
            pdfDataRangeTransport.onDataProgressiveDone();
          }
          break;
        case "progress":
          callbacks.onProgress(args.loaded, args.total);
          break;
        case "complete":
          if (!args.data) {
            callbacks.onError(args.errorCode);
            break;
          }
          callbacks.onOpenWithData(args.data);
          break;
      }
    });
    FirefoxCom.requestSync("initPassiveLoading", null);
  }

  static async fallback(data) {
    return FirefoxCom.requestAsync("fallback", data);
  }

  static reportTelemetry(data) {
    FirefoxCom.request("reportTelemetry", JSON.stringify(data));
  }

  static createDownloadManager(options) {
    return new DownloadManager();
  }

  static createPreferences() {
    return new FirefoxPreferences();
  }

  static createL10n(options) {
    const mozL10n = document.mozL10n;
    // TODO refactor mozL10n.setExternalLocalizerServices
    return new MozL10n(mozL10n);
  }

  static createScripting(options) {
    return FirefoxScripting;
  }

  static get supportsIntegratedFind() {
    const support = FirefoxCom.requestSync("supportsIntegratedFind");
    return shadow(this, "supportsIntegratedFind", support);
  }

  static get supportsDocumentFonts() {
    const support = FirefoxCom.requestSync("supportsDocumentFonts");
    return shadow(this, "supportsDocumentFonts", support);
  }

  static get supportedMouseWheelZoomModifierKeys() {
    const support = FirefoxCom.requestSync(
      "supportedMouseWheelZoomModifierKeys"
    );
    return shadow(this, "supportedMouseWheelZoomModifierKeys", support);
  }

  static get isInAutomation() {
    // Returns the value of `Cu.isInAutomation`, which is only `true` when e.g.
    // various test-suites are running in mozilla-central.
    const isInAutomation = FirefoxCom.requestSync("isInAutomation");
    return shadow(this, "isInAutomation", isInAutomation);
  }
}
PDFViewerApplication.externalServices = FirefoxExternalServices;

// l10n.js for Firefox extension expects services to be set.
document.mozL10n.setExternalLocalizerServices({
  getLocale() {
    return FirefoxCom.requestSync("getLocale", null);
  },

  getStrings(key) {
    return FirefoxCom.requestSync("getStrings", key);
  },
});

export { DownloadManager, FirefoxCom };
