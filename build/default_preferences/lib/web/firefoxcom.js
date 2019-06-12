"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FirefoxCom = exports.DownloadManager = void 0;

require("../extensions/firefox/tools/l10n");

var _pdf = require("../pdf");

var _preferences = require("./preferences");

var _app = require("./app");

{
  throw new Error('Module "pdfjs-web/firefoxcom" shall not be used outside ' + 'FIREFOX and MOZCENTRAL builds.');
}

let FirefoxCom = function FirefoxComClosure() {
  return {
    requestSync(action, data) {
      let request = document.createTextNode('');
      document.documentElement.appendChild(request);
      let sender = document.createEvent('CustomEvent');
      sender.initCustomEvent('pdf.js.message', true, false, {
        action,
        data,
        sync: true
      });
      request.dispatchEvent(sender);
      let response = sender.detail.response;
      document.documentElement.removeChild(request);
      return response;
    },

    request(action, data, callback) {
      let request = document.createTextNode('');

      if (callback) {
        document.addEventListener('pdf.js.response', function listener(event) {
          let node = event.target;
          let response = event.detail.response;
          document.documentElement.removeChild(node);
          document.removeEventListener('pdf.js.response', listener);
          return callback(response);
        });
      }

      document.documentElement.appendChild(request);
      let sender = document.createEvent('CustomEvent');
      sender.initCustomEvent('pdf.js.message', true, false, {
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
    FirefoxCom.request('download', {
      originalUrl: url,
      filename
    });
  }

  downloadData(data, filename, contentType) {
    let blobUrl = (0, _pdf.createObjectURL)(data, contentType);
    FirefoxCom.request('download', {
      blobUrl,
      originalUrl: blobUrl,
      filename,
      isAttachment: true
    });
  }

  download(blob, url, filename) {
    let blobUrl = _pdf.URL.createObjectURL(blob);

    let onResponse = err => {
      if (err && this.onerror) {
        this.onerror(err);
      }

      _pdf.URL.revokeObjectURL(blobUrl);
    };

    FirefoxCom.request('download', {
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
      FirefoxCom.request('setPreferences', prefObj, resolve);
    });
  }

  async _readFromStorage(prefObj) {
    return new Promise(function (resolve) {
      FirefoxCom.request('getPreferences', prefObj, function (prefStr) {
        let readPrefs = JSON.parse(prefStr);
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
  const events = ['find', 'findagain', 'findhighlightallchange', 'findcasesensitivitychange', 'findentirewordchange', 'findbarclose'];

  const handleEvent = function ({
    type,
    detail
  }) {
    if (!_app.PDFViewerApplication.initialized) {
      return;
    }

    if (type === 'findbarclose') {
      _app.PDFViewerApplication.eventBus.dispatch('findbarclose', {
        source: window
      });

      return;
    }

    _app.PDFViewerApplication.eventBus.dispatch('find', {
      source: window,
      type: type.substring('find'.length),
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
  const events = ['zoomin', 'zoomout', 'zoomreset'];

  const handleEvent = function ({
    type,
    detail
  }) {
    if (!_app.PDFViewerApplication.initialized) {
      return;
    }

    _app.PDFViewerApplication.eventBus.dispatch(type, {
      source: window,
      ignoreDuplicate: type === 'zoomreset' ? true : undefined
    });
  };

  for (const event of events) {
    window.addEventListener(event, handleEvent);
  }
})();

class FirefoxComDataRangeTransport extends _pdf.PDFDataRangeTransport {
  requestDataRange(begin, end) {
    FirefoxCom.request('requestDataRange', {
      begin,
      end
    });
  }

  abort() {
    FirefoxCom.requestSync('abortLoading', null);
  }

}

_app.PDFViewerApplication.externalServices = {
  updateFindControlState(data) {
    FirefoxCom.request('updateFindControlState', data);
  },

  updateFindMatchesCount(data) {
    FirefoxCom.request('updateFindMatchesCount', data);
  },

  initPassiveLoading(callbacks) {
    let pdfDataRangeTransport;
    window.addEventListener('message', function windowMessage(e) {
      if (e.source !== null) {
        console.warn('Rejected untrusted message from ' + e.origin);
        return;
      }

      let args = e.data;

      if (typeof args !== 'object' || !('pdfjsLoadAction' in args)) {
        return;
      }

      switch (args.pdfjsLoadAction) {
        case 'supportsRangedLoading':
          pdfDataRangeTransport = new FirefoxComDataRangeTransport(args.length, args.data, args.done);
          callbacks.onOpenWithTransport(args.pdfUrl, args.length, pdfDataRangeTransport);
          break;

        case 'range':
          pdfDataRangeTransport.onDataRange(args.begin, args.chunk);
          break;

        case 'rangeProgress':
          pdfDataRangeTransport.onDataProgress(args.loaded);
          break;

        case 'progressiveRead':
          pdfDataRangeTransport.onDataProgressiveRead(args.chunk);
          pdfDataRangeTransport.onDataProgress(args.loaded, args.total);
          break;

        case 'progressiveDone':
          if (pdfDataRangeTransport) {
            pdfDataRangeTransport.onDataProgressiveDone();
          }

          break;

        case 'progress':
          callbacks.onProgress(args.loaded, args.total);
          break;

        case 'complete':
          if (!args.data) {
            callbacks.onError(args.errorCode);
            break;
          }

          callbacks.onOpenWithData(args.data);
          break;
      }
    });
    FirefoxCom.requestSync('initPassiveLoading', null);
  },

  fallback(data, callback) {
    FirefoxCom.request('fallback', data, callback);
  },

  reportTelemetry(data) {
    FirefoxCom.request('reportTelemetry', JSON.stringify(data));
  },

  createDownloadManager(options) {
    return new DownloadManager(options);
  },

  createPreferences() {
    return new FirefoxPreferences();
  },

  createL10n(options) {
    let mozL10n = document.mozL10n;
    return new MozL10n(mozL10n);
  },

  get supportsIntegratedFind() {
    let support = FirefoxCom.requestSync('supportsIntegratedFind');
    return (0, _pdf.shadow)(this, 'supportsIntegratedFind', support);
  },

  get supportsDocumentFonts() {
    let support = FirefoxCom.requestSync('supportsDocumentFonts');
    return (0, _pdf.shadow)(this, 'supportsDocumentFonts', support);
  },

  get supportsDocumentColors() {
    let support = FirefoxCom.requestSync('supportsDocumentColors');
    return (0, _pdf.shadow)(this, 'supportsDocumentColors', support);
  },

  get supportedMouseWheelZoomModifierKeys() {
    let support = FirefoxCom.requestSync('supportedMouseWheelZoomModifierKeys');
    return (0, _pdf.shadow)(this, 'supportedMouseWheelZoomModifierKeys', support);
  }

};
document.mozL10n.setExternalLocalizerServices({
  getLocale() {
    return FirefoxCom.requestSync('getLocale', null);
  },

  getStrings(key) {
    return FirefoxCom.requestSync('getStrings', key);
  }

});