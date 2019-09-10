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

import '../extensions/firefox/tools/l10n';
import { createObjectURL, PDFDataRangeTransport, shadow, URL } from 'pdfjs-lib';
import { BasePreferences } from './preferences';
import { DEFAULT_SCALE_VALUE } from './ui_utils';
import { PDFViewerApplication } from './app';

if (typeof PDFJSDev === 'undefined' ||
    !PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
  throw new Error('Module "pdfjs-web/firefoxcom" shall not be used outside ' +
                  'FIREFOX and MOZCENTRAL builds.');
}

let FirefoxCom = (function FirefoxComClosure() {
  return {
    /**
     * Creates an event that the extension is listening for and will
     * synchronously respond to.
     * NOTE: It is reccomended to use request() instead since one day we may not
     * be able to synchronously reply.
     * @param {String} action The action to trigger.
     * @param {String} data Optional data to send.
     * @return {*} The response.
     */
    requestSync(action, data) {
      let request = document.createTextNode('');
      document.documentElement.appendChild(request);

      let sender = document.createEvent('CustomEvent');
      sender.initCustomEvent('pdf.js.message', true, false,
                             { action, data, sync: true, });
      request.dispatchEvent(sender);
      let response = sender.detail.response;
      document.documentElement.removeChild(request);
      return response;
    },

    /**
     * Creates an event that the extension is listening for and will
     * asynchronously respond by calling the callback.
     * @param {String} action The action to trigger.
     * @param {String} data Optional data to send.
     * @param {Function} callback Optional response callback that will be called
     * with one data argument.
     */
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
        responseExpected: !!callback,
      });
      return request.dispatchEvent(sender);
    },
  };
})();

class DownloadManager {
  constructor(options) {
    this.disableCreateObjectURL = false;
  }

  downloadUrl(url, filename) {
    FirefoxCom.request('download', {
      originalUrl: url,
      filename,
    });
  }

  downloadData(data, filename, contentType) {
    let blobUrl = createObjectURL(data, contentType);

    FirefoxCom.request('download', {
      blobUrl,
      originalUrl: blobUrl,
      filename,
      isAttachment: true,
    });
  }

  download(blob, url, filename) {
    let blobUrl = URL.createObjectURL(blob);
    let onResponse = (err) => {
      if (err && this.onerror) {
        this.onerror(err);
      }
      URL.revokeObjectURL(blobUrl);
    };

    FirefoxCom.request('download', {
      blobUrl,
      originalUrl: url,
      filename,
    }, onResponse);
  }
}

class FirefoxPreferences extends BasePreferences {
  async _writeToStorage(prefObj) {
    return new Promise(function(resolve) {
      FirefoxCom.request('setPreferences', prefObj, resolve);
    });
  }

  async _readFromStorage(prefObj) {
    return new Promise(function(resolve) {
      FirefoxCom.request('getPreferences', prefObj, function(prefStr) {
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
  const events = [
    'find',
    'findagain',
    'findhighlightallchange',
    'findcasesensitivitychange',
    'findentirewordchange',
    'findbarclose',
  ];
  const handleEvent = function({ type, detail, }) {
    if (!PDFViewerApplication.initialized) {
      return;
    }
    if (type === 'findbarclose') {
      PDFViewerApplication.eventBus.dispatch(type, { source: window, });
      return;
    }
    PDFViewerApplication.eventBus.dispatch('find', {
      source: window,
      type: type.substring('find'.length),
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
  const events = [
    'zoomin',
    'zoomout',
    'zoomreset',
  ];
  const handleEvent = function({ type, detail, }) {
    if (!PDFViewerApplication.initialized) {
      return;
    }
    // Avoid attempting to needlessly reset the zoom level *twice* in a row,
    // when using the `Ctrl + 0` keyboard shortcut.
    if (type === 'zoomreset' && // eslint-disable-next-line max-len
        PDFViewerApplication.pdfViewer.currentScaleValue === DEFAULT_SCALE_VALUE) {
      return;
    }
    PDFViewerApplication.eventBus.dispatch(type, { source: window, });
  };

  for (const event of events) {
    window.addEventListener(event, handleEvent);
  }
})();

class FirefoxComDataRangeTransport extends PDFDataRangeTransport {
  requestDataRange(begin, end) {
    FirefoxCom.request('requestDataRange', { begin, end, });
  }

  abort() {
    // Sync call to ensure abort is really started.
    FirefoxCom.requestSync('abortLoading', null);
  }
}

PDFViewerApplication.externalServices = {
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
        // The message MUST originate from Chrome code.
        console.warn('Rejected untrusted message from ' + e.origin);
        return;
      }
      let args = e.data;

      if (typeof args !== 'object' || !('pdfjsLoadAction' in args)) {
        return;
      }
      switch (args.pdfjsLoadAction) {
        case 'supportsRangedLoading':
          pdfDataRangeTransport =
            new FirefoxComDataRangeTransport(args.length, args.data, args.done);

          callbacks.onOpenWithTransport(args.pdfUrl, args.length,
                                        pdfDataRangeTransport);
          break;
        case 'range':
          pdfDataRangeTransport.onDataRange(args.begin, args.chunk);
          break;
        case 'rangeProgress':
          pdfDataRangeTransport.onDataProgress(args.loaded);
          break;
        case 'progressiveRead':
          pdfDataRangeTransport.onDataProgressiveRead(args.chunk);

          // Don't forget to report loading progress as well, since otherwise
          // the loadingBar won't update when `disableRange=true` is set.
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
    // TODO refactor mozL10n.setExternalLocalizerServices
    return new MozL10n(mozL10n);
  },

  get supportsIntegratedFind() {
    let support = FirefoxCom.requestSync('supportsIntegratedFind');
    return shadow(this, 'supportsIntegratedFind', support);
  },

  get supportsDocumentFonts() {
    let support = FirefoxCom.requestSync('supportsDocumentFonts');
    return shadow(this, 'supportsDocumentFonts', support);
  },

  get supportsDocumentColors() {
    let support = FirefoxCom.requestSync('supportsDocumentColors');
    return shadow(this, 'supportsDocumentColors', support);
  },

  get supportedMouseWheelZoomModifierKeys() {
    let support = FirefoxCom.requestSync('supportedMouseWheelZoomModifierKeys');
    return shadow(this, 'supportedMouseWheelZoomModifierKeys', support);
  },
};

// l10n.js for Firefox extension expects services to be set.
document.mozL10n.setExternalLocalizerServices({
  getLocale() {
    return FirefoxCom.requestSync('getLocale', null);
  },

  getStrings(key) {
    return FirefoxCom.requestSync('getStrings', key);
  },
});

export {
  DownloadManager,
  FirefoxCom,
};
