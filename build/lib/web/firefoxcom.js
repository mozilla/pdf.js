/* Copyright 2017 Mozilla Foundation
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
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FirefoxCom = exports.DownloadManager = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

require('../extensions/firefox/tools/l10n');

var _pdf = require('../pdf');

var _preferences = require('./preferences');

var _app = require('./app');

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

{
  throw new Error('Module "pdfjs-web/firefoxcom" shall not be used outside ' + 'FIREFOX and MOZCENTRAL builds.');
}
var FirefoxCom = function FirefoxComClosure() {
  return {
    requestSync: function requestSync(action, data) {
      var request = document.createTextNode('');
      document.documentElement.appendChild(request);
      var sender = document.createEvent('CustomEvent');
      sender.initCustomEvent('pdf.js.message', true, false, {
        action: action,
        data: data,
        sync: true
      });
      request.dispatchEvent(sender);
      var response = sender.detail.response;
      document.documentElement.removeChild(request);
      return response;
    },
    request: function request(action, data, callback) {
      var request = document.createTextNode('');
      if (callback) {
        document.addEventListener('pdf.js.response', function listener(event) {
          var node = event.target;
          var response = event.detail.response;
          document.documentElement.removeChild(node);
          document.removeEventListener('pdf.js.response', listener);
          return callback(response);
        });
      }
      document.documentElement.appendChild(request);
      var sender = document.createEvent('CustomEvent');
      sender.initCustomEvent('pdf.js.message', true, false, {
        action: action,
        data: data,
        sync: false,
        responseExpected: !!callback
      });
      return request.dispatchEvent(sender);
    }
  };
}();

var DownloadManager = function () {
  function DownloadManager() {
    _classCallCheck(this, DownloadManager);
  }

  _createClass(DownloadManager, [{
    key: 'downloadUrl',
    value: function downloadUrl(url, filename) {
      FirefoxCom.request('download', {
        originalUrl: url,
        filename: filename
      });
    }
  }, {
    key: 'downloadData',
    value: function downloadData(data, filename, contentType) {
      var blobUrl = (0, _pdf.createObjectURL)(data, contentType, false);
      FirefoxCom.request('download', {
        blobUrl: blobUrl,
        originalUrl: blobUrl,
        filename: filename,
        isAttachment: true
      });
    }
  }, {
    key: 'download',
    value: function download(blob, url, filename) {
      var _this = this;

      var blobUrl = URL.createObjectURL(blob);
      var onResponse = function onResponse(err) {
        if (err && _this.onerror) {
          _this.onerror(err);
        }
        URL.revokeObjectURL(blobUrl);
      };
      FirefoxCom.request('download', {
        blobUrl: blobUrl,
        originalUrl: url,
        filename: filename
      }, onResponse);
    }
  }]);

  return DownloadManager;
}();

var FirefoxPreferences = function (_BasePreferences) {
  _inherits(FirefoxPreferences, _BasePreferences);

  function FirefoxPreferences() {
    _classCallCheck(this, FirefoxPreferences);

    return _possibleConstructorReturn(this, (FirefoxPreferences.__proto__ || Object.getPrototypeOf(FirefoxPreferences)).apply(this, arguments));
  }

  _createClass(FirefoxPreferences, [{
    key: '_writeToStorage',
    value: function _writeToStorage(prefObj) {
      return new Promise(function (resolve) {
        FirefoxCom.request('setPreferences', prefObj, resolve);
      });
    }
  }, {
    key: '_readFromStorage',
    value: function _readFromStorage(prefObj) {
      return new Promise(function (resolve) {
        FirefoxCom.request('getPreferences', prefObj, function (prefStr) {
          var readPrefs = JSON.parse(prefStr);
          resolve(readPrefs);
        });
      });
    }
  }]);

  return FirefoxPreferences;
}(_preferences.BasePreferences);

var MozL10n = function () {
  function MozL10n(mozL10n) {
    _classCallCheck(this, MozL10n);

    this.mozL10n = mozL10n;
  }

  _createClass(MozL10n, [{
    key: 'getDirection',
    value: function getDirection() {
      return Promise.resolve(this.mozL10n.getDirection());
    }
  }, {
    key: 'get',
    value: function get(property, args, fallback) {
      return Promise.resolve(this.mozL10n.get(property, args, fallback));
    }
  }, {
    key: 'translate',
    value: function translate(element) {
      this.mozL10n.translate(element);
      return Promise.resolve();
    }
  }]);

  return MozL10n;
}();

(function listenFindEvents() {
  var events = ['find', 'findagain', 'findhighlightallchange', 'findcasesensitivitychange'];
  var handleEvent = function handleEvent(evt) {
    if (!_app.PDFViewerApplication.initialized) {
      return;
    }
    _app.PDFViewerApplication.eventBus.dispatch('find', {
      source: window,
      type: evt.type.substring('find'.length),
      query: evt.detail.query,
      phraseSearch: true,
      caseSensitive: !!evt.detail.caseSensitive,
      highlightAll: !!evt.detail.highlightAll,
      findPrevious: !!evt.detail.findPrevious
    });
  };
  for (var i = 0, len = events.length; i < len; i++) {
    window.addEventListener(events[i], handleEvent);
  }
})();
function FirefoxComDataRangeTransport(length, initialData) {
  _pdf.PDFDataRangeTransport.call(this, length, initialData);
}
FirefoxComDataRangeTransport.prototype = Object.create(_pdf.PDFDataRangeTransport.prototype);
FirefoxComDataRangeTransport.prototype.requestDataRange = function FirefoxComDataRangeTransport_requestDataRange(begin, end) {
  FirefoxCom.request('requestDataRange', {
    begin: begin,
    end: end
  });
};
FirefoxComDataRangeTransport.prototype.abort = function FirefoxComDataRangeTransport_abort() {
  FirefoxCom.requestSync('abortLoading', null);
};
_app.PDFViewerApplication.externalServices = {
  updateFindControlState: function updateFindControlState(data) {
    FirefoxCom.request('updateFindControlState', data);
  },
  initPassiveLoading: function initPassiveLoading(callbacks) {
    var pdfDataRangeTransport = void 0;
    window.addEventListener('message', function windowMessage(e) {
      if (e.source !== null) {
        console.warn('Rejected untrusted message from ' + e.origin);
        return;
      }
      var args = e.data;
      if ((typeof args === 'undefined' ? 'undefined' : _typeof(args)) !== 'object' || !('pdfjsLoadAction' in args)) {
        return;
      }
      switch (args.pdfjsLoadAction) {
        case 'supportsRangedLoading':
          pdfDataRangeTransport = new FirefoxComDataRangeTransport(args.length, args.data);
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
  fallback: function fallback(data, callback) {
    FirefoxCom.request('fallback', data, callback);
  },
  reportTelemetry: function reportTelemetry(data) {
    FirefoxCom.request('reportTelemetry', JSON.stringify(data));
  },
  createDownloadManager: function createDownloadManager() {
    return new DownloadManager();
  },
  createPreferences: function createPreferences() {
    return new FirefoxPreferences();
  },
  createL10n: function createL10n() {
    var mozL10n = document.mozL10n;
    return new MozL10n(mozL10n);
  },

  get supportsIntegratedFind() {
    var support = FirefoxCom.requestSync('supportsIntegratedFind');
    return (0, _pdf.shadow)(this, 'supportsIntegratedFind', support);
  },
  get supportsDocumentFonts() {
    var support = FirefoxCom.requestSync('supportsDocumentFonts');
    return (0, _pdf.shadow)(this, 'supportsDocumentFonts', support);
  },
  get supportsDocumentColors() {
    var support = FirefoxCom.requestSync('supportsDocumentColors');
    return (0, _pdf.shadow)(this, 'supportsDocumentColors', support);
  },
  get supportedMouseWheelZoomModifierKeys() {
    var support = FirefoxCom.requestSync('supportedMouseWheelZoomModifierKeys');
    return (0, _pdf.shadow)(this, 'supportedMouseWheelZoomModifierKeys', support);
  }
};
document.mozL10n.setExternalLocalizerServices({
  getLocale: function getLocale() {
    return FirefoxCom.requestSync('getLocale', null);
  },
  getStrings: function getStrings(key) {
    return FirefoxCom.requestSync('getStrings', key);
  }
});
exports.DownloadManager = DownloadManager;
exports.FirefoxCom = FirefoxCom;