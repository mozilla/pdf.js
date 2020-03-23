/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FirefoxCom = exports.DownloadManager = void 0;

require("../extensions/firefox/tools/l10n.js");

var _pdf = require("../pdf");

var _app = require("./app.js");

var _preferences = require("./preferences.js");

var _ui_utils = require("./ui_utils.js");

{
  throw new Error('Module "./firefoxcom.js" shall not be used outside MOZCENTRAL builds.');
}

const FirefoxCom = function FirefoxComClosure() {
  return {
    requestSync(action, data) {
      const request = document.createTextNode("");
      document.documentElement.appendChild(request);
      const sender = document.createEvent("CustomEvent");
      sender.initCustomEvent("pdf.js.message", true, false, {
        action,
        data,
        sync: true
      });
      request.dispatchEvent(sender);
      const response = sender.detail.response;
      document.documentElement.removeChild(request);
      return response;
    },

    request(action, data, callback) {
      const request = document.createTextNode("");

      if (callback) {
        document.addEventListener("pdf.js.response", function listener(event) {
          const node = event.target;
          const response = event.detail.response;
          document.documentElement.removeChild(node);
          document.removeEventListener("pdf.js.response", listener);
          return callback(response);
        });
      }

      document.documentElement.appendChild(request);
      const sender = document.createEvent("CustomEvent");
      sender.initCustomEvent("pdf.js.message", true, false, {
        action,
        data,
        sync: false,
        responseExpected: !!callback
      });
      return request.dispatchEvent(sender);
    }

  };
}();

exports.FirefoxCom = FirefoxCom;

class DownloadManager {
  constructor(options) {
    this.disableCreateObjectURL = false;
  }

  downloadUrl(url, filename) {
    FirefoxCom.request("download", {
      originalUrl: url,
      filename
    });
  }

  downloadData(data, filename, contentType) {
    const blobUrl = (0, _pdf.createObjectURL)(data, contentType);
    FirefoxCom.request("download", {
      blobUrl,
      originalUrl: blobUrl,
      filename,
      isAttachment: true
    });
  }

  download(blob, url, filename) {
    const blobUrl = URL.createObjectURL(blob);

    const onResponse = err => {
      if (err && this.onerror) {
        this.onerror(err);
      }

      URL.revokeObjectURL(blobUrl);
    };

    FirefoxCom.request("download", {
      blobUrl,
      originalUrl: url,
      filename
    }, onResponse);
  }

}

exports.DownloadManager = DownloadManager;

class FirefoxPreferences extends _preferences.BasePreferences {
  async _writeToStorage(prefObj) {
    return new Promise(function (resolve) {
      FirefoxCom.request("setPreferences", prefObj, resolve);
    });
  }

  async _readFromStorage(prefObj) {
    return new Promise(function (resolve) {
      FirefoxCom.request("getPreferences", prefObj, function (prefStr) {
        const readPrefs = JSON.parse(prefStr);
        resolve(readPrefs);
      });
    });
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
  const events = ["find", "findagain", "findhighlightallchange", "findcasesensitivitychange", "findentirewordchange", "findbarclose"];

  const handleEvent = function ({
    type,
    detail
  }) {
    if (!_app.PDFViewerApplication.initialized) {
      return;
    }

    if (type === "findbarclose") {
      _app.PDFViewerApplication.eventBus.dispatch(type, {
        source: window
      });

      return;
    }

    _app.PDFViewerApplication.eventBus.dispatch("find", {
      source: window,
      type: type.substring("find".length),
      query: detail.query,
      phraseSearch: true,
      caseSensitive: !!detail.caseSensitive,
      entireWord: !!detail.entireWord,
      highlightAll: !!detail.highlightAll,
      findPrevious: !!detail.findPrevious
    });
  };

  for (const event of events) {
    window.addEventListener(event, handleEvent);
  }
})();

(function listenZoomEvents() {
  const events = ["zoomin", "zoomout", "zoomreset"];

  const handleEvent = function ({
    type,
    detail
  }) {
    if (!_app.PDFViewerApplication.initialized) {
      return;
    }

    if (type === "zoomreset" && _app.PDFViewerApplication.pdfViewer.currentScaleValue === _ui_utils.DEFAULT_SCALE_VALUE) {
      return;
    }

    _app.PDFViewerApplication.eventBus.dispatch(type, {
      source: window
    });
  };

  for (const event of events) {
    window.addEventListener(event, handleEvent);
  }
})();

class FirefoxComDataRangeTransport extends _pdf.PDFDataRangeTransport {
  requestDataRange(begin, end) {
    FirefoxCom.request("requestDataRange", {
      begin,
      end
    });
  }

  abort() {
    FirefoxCom.requestSync("abortLoading", null);
  }

}

class FirefoxExternalServices extends _app.DefaultExternalServices {
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
        console.warn("Rejected untrusted message from " + e.origin);
        return;
      }

      const args = e.data;

      if (typeof args !== "object" || !("pdfjsLoadAction" in args)) {
        return;
      }

      switch (args.pdfjsLoadAction) {
        case "supportsRangedLoading":
          pdfDataRangeTransport = new FirefoxComDataRangeTransport(args.length, args.data, args.done);
          callbacks.onOpenWithTransport(args.pdfUrl, args.length, pdfDataRangeTransport);
          break;

        case "range":
          pdfDataRangeTransport.onDataRange(args.begin, args.chunk);
          break;

        case "rangeProgress":
          pdfDataRangeTransport.onDataProgress(args.loaded);
          break;

        case "progressiveRead":
          pdfDataRangeTransport.onDataProgressiveRead(args.chunk);
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

  static fallback(data, callback) {
    FirefoxCom.request("fallback", data, callback);
  }

  static reportTelemetry(data) {
    FirefoxCom.request("reportTelemetry", JSON.stringify(data));
  }

  static createDownloadManager(options) {
    return new DownloadManager(options);
  }

  static createPreferences() {
    return new FirefoxPreferences();
  }

  static createL10n(options) {
    const mozL10n = document.mozL10n;
    return new MozL10n(mozL10n);
  }

  static get supportsIntegratedFind() {
    const support = FirefoxCom.requestSync("supportsIntegratedFind");
    return (0, _pdf.shadow)(this, "supportsIntegratedFind", support);
  }

  static get supportsDocumentFonts() {
    const support = FirefoxCom.requestSync("supportsDocumentFonts");
    return (0, _pdf.shadow)(this, "supportsDocumentFonts", support);
  }

  static get supportedMouseWheelZoomModifierKeys() {
    const support = FirefoxCom.requestSync("supportedMouseWheelZoomModifierKeys");
    return (0, _pdf.shadow)(this, "supportedMouseWheelZoomModifierKeys", support);
  }

}

_app.PDFViewerApplication.externalServices = FirefoxExternalServices;
document.mozL10n.setExternalLocalizerServices({
  getLocale() {
    return FirefoxCom.requestSync("getLocale", null);
  },

  getStrings(key) {
    return FirefoxCom.requestSync("getStrings", key);
  }

});