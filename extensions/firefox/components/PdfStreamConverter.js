/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
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
/* jshint esnext:true */
/* globals Components, Services, XPCOMUtils, NetUtil, PrivateBrowsingUtils,
           dump, NetworkManager, PdfJsTelemetry */

'use strict';

var EXPORTED_SYMBOLS = ['PdfStreamConverter'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
// True only if this is the version of pdf.js that is included with firefox.
const MOZ_CENTRAL = JSON.parse('PDFJSSCRIPT_MOZ_CENTRAL');
const PDFJS_EVENT_ID = 'pdf.js.message';
const PDF_CONTENT_TYPE = 'application/pdf';
const PREF_PREFIX = 'PDFJSSCRIPT_PREF_PREFIX';
const PDF_VIEWER_WEB_PAGE = 'resource://pdf.js/web/viewer.html';
const MAX_DATABASE_LENGTH = 4096;

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
Cu.import('resource://gre/modules/Services.jsm');
Cu.import('resource://gre/modules/NetUtil.jsm');
Cu.import('resource://pdf.js/network.js');

XPCOMUtils.defineLazyModuleGetter(this, 'PrivateBrowsingUtils',
  'resource://gre/modules/PrivateBrowsingUtils.jsm');

XPCOMUtils.defineLazyModuleGetter(this, 'PdfJsTelemetry',
  'resource://pdf.js/PdfJsTelemetry.jsm');

var Svc = {};
XPCOMUtils.defineLazyServiceGetter(Svc, 'mime',
                                   '@mozilla.org/mime;1',
                                   'nsIMIMEService');

function getChromeWindow(domWindow) {
  var containingBrowser = domWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                                   .getInterface(Ci.nsIWebNavigation)
                                   .QueryInterface(Ci.nsIDocShell)
                                   .chromeEventHandler;
  return containingBrowser.ownerDocument.defaultView;
}

function getBoolPref(pref, def) {
  try {
    return Services.prefs.getBoolPref(pref);
  } catch (ex) {
    return def;
  }
}

function getIntPref(pref, def) {
  try {
    return Services.prefs.getIntPref(pref);
  } catch (ex) {
    return def;
  }
}

function setStringPref(pref, value) {
  var str = Cc['@mozilla.org/supports-string;1']
              .createInstance(Ci.nsISupportsString);
  str.data = value;
  Services.prefs.setComplexValue(pref, Ci.nsISupportsString, str);
}

function getStringPref(pref, def) {
  try {
    return Services.prefs.getComplexValue(pref, Ci.nsISupportsString).data;
  } catch (ex) {
    return def;
  }
}

function log(aMsg) {
  if (!getBoolPref(PREF_PREFIX + '.pdfBugEnabled', false))
    return;
  var msg = 'PdfStreamConverter.js: ' + (aMsg.join ? aMsg.join('') : aMsg);
  Services.console.logStringMessage(msg);
  dump(msg + '\n');
}

function getDOMWindow(aChannel) {
  var requestor = aChannel.notificationCallbacks ?
                  aChannel.notificationCallbacks :
                  aChannel.loadGroup.notificationCallbacks;
  var win = requestor.getInterface(Components.interfaces.nsIDOMWindow);
  return win;
}

function getLocalizedStrings(path) {
  var stringBundle = Cc['@mozilla.org/intl/stringbundle;1'].
      getService(Ci.nsIStringBundleService).
      createBundle('chrome://pdf.js/locale/' + path);

  var map = {};
  var enumerator = stringBundle.getSimpleEnumeration();
  while (enumerator.hasMoreElements()) {
    var string = enumerator.getNext().QueryInterface(Ci.nsIPropertyElement);
    var key = string.key, property = 'textContent';
    var i = key.lastIndexOf('.');
    if (i >= 0) {
      property = key.substring(i + 1);
      key = key.substring(0, i);
    }
    if (!(key in map))
      map[key] = {};
    map[key][property] = string.value;
  }
  return map;
}
function getLocalizedString(strings, id, property) {
  property = property || 'textContent';
  if (id in strings)
    return strings[id][property];
  return id;
}

// PDF data storage
function PdfDataListener(length) {
  this.length = length; // less than 0, if length is unknown
  this.data = new Uint8Array(length >= 0 ? length : 0x10000);
  this.loaded = 0;
}

PdfDataListener.prototype = {
  append: function PdfDataListener_append(chunk) {
    var willBeLoaded = this.loaded + chunk.length;
    if (this.length >= 0 && this.length < willBeLoaded) {
      this.length = -1; // reset the length, server is giving incorrect one
    }
    if (this.length < 0 && this.data.length < willBeLoaded) {
      // data length is unknown and new chunk will not fit in the existing
      // buffer, resizing the buffer by doubling the its last length
      var newLength = this.data.length;
      for (; newLength < willBeLoaded; newLength *= 2) {}
      var newData = new Uint8Array(newLength);
      newData.set(this.data);
      this.data = newData;
    }
    this.data.set(chunk, this.loaded);
    this.loaded = willBeLoaded;
    this.onprogress(this.loaded, this.length >= 0 ? this.length : void(0));
  },
  getData: function PdfDataListener_getData() {
    var data = this.data;
    if (this.loaded != data.length)
      data = data.subarray(0, this.loaded);
    delete this.data; // releasing temporary storage
    return data;
  },
  finish: function PdfDataListener_finish() {
    this.isDataReady = true;
    if (this.oncompleteCallback) {
      this.oncompleteCallback(this.getData());
    }
  },
  error: function PdfDataListener_error(errorCode) {
    this.errorCode = errorCode;
    if (this.oncompleteCallback) {
      this.oncompleteCallback(null, errorCode);
    }
  },
  onprogress: function() {},
  get oncomplete() {
    return this.oncompleteCallback;
  },
  set oncomplete(value) {
    this.oncompleteCallback = value;
    if (this.isDataReady) {
      value(this.getData());
    }
    if (this.errorCode) {
      value(null, this.errorCode);
    }
  }
};

// All the priviledged actions.
function ChromeActions(domWindow, contentDispositionFilename) {
  this.domWindow = domWindow;
  this.contentDispositionFilename = contentDispositionFilename;
  this.telemetryState = {
    documentInfo: false,
    firstPageInfo: false,
    streamTypesUsed: [],
    startAt: Date.now()
  };
}

ChromeActions.prototype = {
  isInPrivateBrowsing: function() {
    return PrivateBrowsingUtils.isWindowPrivate(this.domWindow);
  },
  download: function(data, sendResponse) {
    var self = this;
    var originalUrl = data.originalUrl;
    // The data may not be downloaded so we need just retry getting the pdf with
    // the original url.
    var originalUri = NetUtil.newURI(data.originalUrl);
    var filename = data.filename;
    if (typeof filename !== 'string' || !/\.pdf$/i.test(filename)) {
      filename = 'document.pdf';
    }
    var blobUri = data.blobUrl ? NetUtil.newURI(data.blobUrl) : originalUri;
    var extHelperAppSvc =
          Cc['@mozilla.org/uriloader/external-helper-app-service;1'].
             getService(Ci.nsIExternalHelperAppService);
    var frontWindow = Cc['@mozilla.org/embedcomp/window-watcher;1'].
                         getService(Ci.nsIWindowWatcher).activeWindow;

    var docIsPrivate = this.isInPrivateBrowsing();
    var netChannel = NetUtil.newChannel(blobUri);
    if ('nsIPrivateBrowsingChannel' in Ci &&
        netChannel instanceof Ci.nsIPrivateBrowsingChannel) {
      netChannel.setPrivate(docIsPrivate);
    }
    NetUtil.asyncFetch(netChannel, function(aInputStream, aResult) {
      if (!Components.isSuccessCode(aResult)) {
        if (sendResponse)
          sendResponse(true);
        return;
      }
      // Create a nsIInputStreamChannel so we can set the url on the channel
      // so the filename will be correct.
      var channel = Cc['@mozilla.org/network/input-stream-channel;1'].
                       createInstance(Ci.nsIInputStreamChannel);
      channel.QueryInterface(Ci.nsIChannel);
      try {
        // contentDisposition/contentDispositionFilename is readonly before FF18
        channel.contentDisposition = Ci.nsIChannel.DISPOSITION_ATTACHMENT;
        if (self.contentDispositionFilename) {
          channel.contentDispositionFilename = self.contentDispositionFilename;
        } else {
          channel.contentDispositionFilename = filename;
        }
      } catch (e) {}
      channel.setURI(originalUri);
      channel.contentStream = aInputStream;
      if ('nsIPrivateBrowsingChannel' in Ci &&
          channel instanceof Ci.nsIPrivateBrowsingChannel) {
        channel.setPrivate(docIsPrivate);
      }

      var listener = {
        extListener: null,
        onStartRequest: function(aRequest, aContext) {
          this.extListener = extHelperAppSvc.doContent('application/pdf',
                                aRequest, frontWindow, false);
          this.extListener.onStartRequest(aRequest, aContext);
        },
        onStopRequest: function(aRequest, aContext, aStatusCode) {
          if (this.extListener)
            this.extListener.onStopRequest(aRequest, aContext, aStatusCode);
          // Notify the content code we're done downloading.
          if (sendResponse)
            sendResponse(false);
        },
        onDataAvailable: function(aRequest, aContext, aInputStream, aOffset,
                                  aCount) {
          this.extListener.onDataAvailable(aRequest, aContext, aInputStream,
                                           aOffset, aCount);
        }
      };

      channel.asyncOpen(listener, null);
    });
  },
  setDatabase: function(data) {
    if (this.isInPrivateBrowsing())
      return;
    // Protect against something sending tons of data to setDatabase.
    if (data.length > MAX_DATABASE_LENGTH)
      return;
    setStringPref(PREF_PREFIX + '.database', data);
  },
  getDatabase: function() {
    if (this.isInPrivateBrowsing())
      return '{}';
    return getStringPref(PREF_PREFIX + '.database', '{}');
  },
  getLocale: function() {
    return getStringPref('general.useragent.locale', 'en-US');
  },
  getStrings: function(data) {
    try {
      // Lazy initialization of localizedStrings
      if (!('localizedStrings' in this))
        this.localizedStrings = getLocalizedStrings('viewer.properties');

      var result = this.localizedStrings[data];
      return JSON.stringify(result || null);
    } catch (e) {
      log('Unable to retrive localized strings: ' + e);
      return 'null';
    }
  },
  pdfBugEnabled: function() {
    return getBoolPref(PREF_PREFIX + '.pdfBugEnabled', false);
  },
  supportsIntegratedFind: function() {
    // Integrated find is only supported when we're not in a frame and when the
    // new find events code exists.
    return this.domWindow.frameElement === null &&
           getChromeWindow(this.domWindow).gFindBar &&
           'updateControlState' in getChromeWindow(this.domWindow).gFindBar;
  },
  supportsDocumentFonts: function() {
    var prefBrowser = getIntPref('browser.display.use_document_fonts', 1);
    var prefGfx = getBoolPref('gfx.downloadable_fonts.enabled', true);
    return (!!prefBrowser && prefGfx);
  },
  supportsDocumentColors: function() {
    return getBoolPref('browser.display.use_document_colors', true);
  },
  reportTelemetry: function (data) {
    var probeInfo = JSON.parse(data);
    switch (probeInfo.type) {
      case 'documentInfo':
        if (!this.telemetryState.documentInfo) {
          PdfJsTelemetry.onDocumentVersion(probeInfo.version | 0);
          PdfJsTelemetry.onDocumentGenerator(probeInfo.generator | 0);
          if (probeInfo.formType) {
            PdfJsTelemetry.onForm(probeInfo.formType === 'acroform');
          }
          this.telemetryState.documentInfo = true;
        }
        break;
      case 'pageInfo':
        if (!this.telemetryState.firstPageInfo) {
          var duration = Date.now() - this.telemetryState.startAt;
          PdfJsTelemetry.onTimeToView(duration);
          this.telemetryState.firstPageInfo = true;
        }
        break;
      case 'streamInfo':
        if (!Array.isArray(probeInfo.streamTypes)) {
          break;
        }
        for (var i = 0; i < probeInfo.streamTypes.length; i++) {
          var streamTypeId = probeInfo.streamTypes[i] | 0;
          if (streamTypeId >= 0 && streamTypeId < 10 &&
              !this.telemetryState.streamTypesUsed[streamTypeId]) {
            PdfJsTelemetry.onStreamType(streamTypeId);
            this.telemetryState.streamTypesUsed[streamTypeId] = true;
          }
        }
        break;
    }
  },
  fallback: function(url, sendResponse) {
    var self = this;
    var domWindow = this.domWindow;
    var strings = getLocalizedStrings('chrome.properties');
    var message = getLocalizedString(strings, 'unsupported_feature');

    PdfJsTelemetry.onFallback();

    var notificationBox = null;
    try {
      // Based on MDN's "Working with windows in chrome code"
      var mainWindow = domWindow
        .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
        .getInterface(Components.interfaces.nsIWebNavigation)
        .QueryInterface(Components.interfaces.nsIDocShellTreeItem)
        .rootTreeItem
        .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
        .getInterface(Components.interfaces.nsIDOMWindow);
      var browser = mainWindow.gBrowser
                              .getBrowserForDocument(domWindow.top.document);
      notificationBox = mainWindow.gBrowser.getNotificationBox(browser);
    } catch (e) {
      log('Unable to get a notification box for the fallback message');
      return;
    }

    // Flag so we don't call the response callback twice, since if the user
    // clicks open with different viewer both the button callback and
    // eventCallback will be called.
    var sentResponse = false;
    var buttons = [{
      label: getLocalizedString(strings, 'open_with_different_viewer'),
      accessKey: getLocalizedString(strings, 'open_with_different_viewer',
                                    'accessKey'),
      callback: function() {
        sentResponse = true;
        sendResponse(true);
      }
    }];
    notificationBox.appendNotification(message, 'pdfjs-fallback', null,
                                       notificationBox.PRIORITY_INFO_LOW,
                                       buttons,
                                       function eventsCallback(eventType) {
      // Currently there is only one event "removed" but if there are any other
      // added in the future we still only care about removed at the moment.
      if (eventType !== 'removed')
        return;
      // Don't send a response again if we already responded when the button was
      // clicked.
      if (!sentResponse)
        sendResponse(false);
    });
  },
  updateFindControlState: function(data) {
    if (!this.supportsIntegratedFind())
      return;
    // Verify what we're sending to the findbar.
    var result = data.result;
    var findPrevious = data.findPrevious;
    var findPreviousType = typeof findPrevious;
    if ((typeof result !== 'number' || result < 0 || result > 3) ||
        (findPreviousType !== 'undefined' && findPreviousType !== 'boolean')) {
      return;
    }
    getChromeWindow(this.domWindow).gFindBar
                                   .updateControlState(result, findPrevious);
  }
};

var RangedChromeActions = (function RangedChromeActionsClosure() {
  /**
   * This is for range requests
   */
  function RangedChromeActions(
              domWindow, contentDispositionFilename, originalRequest) {

    ChromeActions.call(this, domWindow, contentDispositionFilename);

    this.pdfUrl = originalRequest.URI.spec;
    this.contentLength = originalRequest.contentLength;

    // Pass all the headers from the original request through
    var httpHeaderVisitor = {
      headers: {},
      visitHeader: function(aHeader, aValue) {
        if (aHeader === 'Range') {
          // When loading the PDF from cache, firefox seems to set the Range
          // request header to fetch only the unfetched portions of the file
          // (e.g. 'Range: bytes=1024-'). However, we want to set this header
          // manually to fetch the PDF in chunks.
          return;
        }
        this.headers[aHeader] = aValue;
      }
    };
    originalRequest.visitRequestHeaders(httpHeaderVisitor);

    var getXhr = function getXhr() {
      const XMLHttpRequest = Components.Constructor(
          '@mozilla.org/xmlextras/xmlhttprequest;1');
      return new XMLHttpRequest();
    };

    this.networkManager = new NetworkManager(this.pdfUrl, {
      httpHeaders: httpHeaderVisitor.headers,
      getXhr: getXhr
    });

    var self = this;
    // If we are in range request mode, this means we manually issued xhr
    // requests, which we need to abort when we leave the page
    domWindow.addEventListener('unload', function unload(e) {
      self.networkManager.abortAllRequests();
      domWindow.removeEventListener(e.type, unload);
    });
  }

  RangedChromeActions.prototype = Object.create(ChromeActions.prototype);
  var proto = RangedChromeActions.prototype;
  proto.constructor = RangedChromeActions;

  proto.initPassiveLoading = function RangedChromeActions_initPassiveLoading() {
    this.domWindow.postMessage({
      pdfjsLoadAction: 'supportsRangedLoading',
      pdfUrl: this.pdfUrl,
      length: this.contentLength
    }, '*');

    return true;
  };

  proto.requestDataRange = function RangedChromeActions_requestDataRange(args) {
    var begin = args.begin;
    var end = args.end;
    var domWindow = this.domWindow;
    // TODO(mack): Support error handler. We're not currently not handling
    // errors from chrome code for non-range requests, so this doesn't
    // seem high-pri
    this.networkManager.requestRange(begin, end, {
      onDone: function RangedChromeActions_onDone(args) {
        domWindow.postMessage({
          pdfjsLoadAction: 'range',
          begin: args.begin,
          chunk: args.chunk
        }, '*');
      },
      onProgress: function RangedChromeActions_onProgress(evt) {
        domWindow.postMessage({
          pdfjsLoadAction: 'rangeProgress',
          loaded: evt.loaded,
        }, '*');
      }
    });
  };

  return RangedChromeActions;
})();

var StandardChromeActions = (function StandardChromeActionsClosure() {

  /**
   * This is for a single network stream
   */
  function StandardChromeActions(domWindow, contentDispositionFilename,
                                 dataListener) {

    ChromeActions.call(this, domWindow, contentDispositionFilename);
    this.dataListener = dataListener;
  }

  StandardChromeActions.prototype = Object.create(ChromeActions.prototype);
  var proto = StandardChromeActions.prototype;
  proto.constructor = StandardChromeActions;

  proto.initPassiveLoading =
      function StandardChromeActions_initPassiveLoading() {

    if (!this.dataListener) {
      return false;
    }

    var self = this;

    this.dataListener.onprogress = function ChromeActions_dataListenerProgress(
                                      loaded, total) {
      self.domWindow.postMessage({
        pdfjsLoadAction: 'progress',
        loaded: loaded,
        total: total
      }, '*');
    };

    this.dataListener.oncomplete = function ChromeActions_dataListenerComplete(
                                      data, errorCode) {
      self.domWindow.postMessage({
        pdfjsLoadAction: 'complete',
        data: data,
        errorCode: errorCode
      }, '*');

      delete self.dataListener;
    };

    return true;
  };

  return StandardChromeActions;
})();

// Event listener to trigger chrome privedged code.
function RequestListener(actions) {
  this.actions = actions;
}
// Receive an event and synchronously or asynchronously responds.
RequestListener.prototype.receive = function(event) {
  var message = event.target;
  var doc = message.ownerDocument;
  var action = event.detail.action;
  var data = event.detail.data;
  var sync = event.detail.sync;
  var actions = this.actions;
  if (!(action in actions)) {
    log('Unknown action: ' + action);
    return;
  }
  if (sync) {
    var response = actions[action].call(this.actions, data);
    var detail = event.detail;
    detail.__exposedProps__ = {response: 'r'};
    detail.response = response;
  } else {
    var response;
    if (!event.detail.callback) {
      doc.documentElement.removeChild(message);
      response = null;
    } else {
      response = function sendResponse(response) {
        try {
          var listener = doc.createEvent('CustomEvent');
          listener.initCustomEvent('pdf.js.response', true, false,
                                   {response: response,
                                    __exposedProps__: {response: 'r'}});
          return message.dispatchEvent(listener);
        } catch (e) {
          // doc is no longer accessible because the requestor is already
          // gone. unloaded content cannot receive the response anyway.
          return false;
        }
      };
    }
    actions[action].call(this.actions, data, response);
  }
};

// Forwards events from the eventElement to the contentWindow only if the
// content window matches the currently selected browser window.
function FindEventManager(eventElement, contentWindow, chromeWindow) {
  this.types = ['find',
                'findagain',
                'findhighlightallchange',
                'findcasesensitivitychange'];
  this.chromeWindow = chromeWindow;
  this.contentWindow = contentWindow;
  this.eventElement = eventElement;
}

FindEventManager.prototype.bind = function() {
  var unload = function(e) {
    this.unbind();
    this.contentWindow.removeEventListener(e.type, unload);
  }.bind(this);
  this.contentWindow.addEventListener('unload', unload);

  for (var i = 0; i < this.types.length; i++) {
    var type = this.types[i];
    this.eventElement.addEventListener(type, this, true);
  }
};

FindEventManager.prototype.handleEvent = function(e) {
  var chromeWindow = this.chromeWindow;
  var contentWindow = this.contentWindow;
  // Only forward the events if they are for our dom window.
  if (chromeWindow.gBrowser.selectedBrowser.contentWindow === contentWindow) {
    var detail = e.detail;
    detail.__exposedProps__ = {
      query: 'r',
      caseSensitive: 'r',
      highlightAll: 'r',
      findPrevious: 'r'
    };
    var forward = contentWindow.document.createEvent('CustomEvent');
    forward.initCustomEvent(e.type, true, true, detail);
    contentWindow.dispatchEvent(forward);
    e.preventDefault();
  }
};

FindEventManager.prototype.unbind = function() {
  for (var i = 0; i < this.types.length; i++) {
    var type = this.types[i];
    this.eventElement.removeEventListener(type, this, true);
  }
};

function PdfStreamConverter() {
}

PdfStreamConverter.prototype = {

  // properties required for XPCOM registration:
  classID: Components.ID('{PDFJSSCRIPT_STREAM_CONVERTER_ID}'),
  classDescription: 'pdf.js Component',
  contractID: '@mozilla.org/streamconv;1?from=application/pdf&to=*/*',

  QueryInterface: XPCOMUtils.generateQI([
      Ci.nsISupports,
      Ci.nsIStreamConverter,
      Ci.nsIStreamListener,
      Ci.nsIRequestObserver
  ]),

  /*
   * This component works as such:
   * 1. asyncConvertData stores the listener
   * 2. onStartRequest creates a new channel, streams the viewer
   * 3. If range requests are supported:
   *      3.1. Suspends and cancels the request so we can issue range
   *          requests instead.
   *
   *    If range rquests are not supported:
   *      3.1. Read the stream as it's loaded in onDataAvailable to send
   *           to the viewer
   *
   * The convert function just returns the stream, it's just the synchronous
   * version of asyncConvertData.
   */

  // nsIStreamConverter::convert
  convert: function(aFromStream, aFromType, aToType, aCtxt) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  // nsIStreamConverter::asyncConvertData
  asyncConvertData: function(aFromType, aToType, aListener, aCtxt) {
    // Store the listener passed to us
    this.listener = aListener;
  },

  // nsIStreamListener::onDataAvailable
  onDataAvailable: function(aRequest, aContext, aInputStream, aOffset, aCount) {
    if (!this.dataListener) {
      return;
    }

    var binaryStream = this.binaryStream;
    binaryStream.setInputStream(aInputStream);
    var chunk = binaryStream.readByteArray(aCount);
    this.dataListener.append(chunk);
  },

  // nsIRequestObserver::onStartRequest
  onStartRequest: function(aRequest, aContext) {
    // Setup the request so we can use it below.
    var isHttpRequest = false;
    try {
      aRequest.QueryInterface(Ci.nsIHttpChannel);
      isHttpRequest = true;
    } catch (e) {}

    var rangeRequest = false;
    if (isHttpRequest) {
      var contentEncoding = 'identity';
      try {
        contentEncoding = aRequest.getResponseHeader('Content-Encoding');
      } catch (e) {}

      var acceptRanges;
      try {
        acceptRanges = aRequest.getResponseHeader('Accept-Ranges');
      } catch (e) {}

      var hash = aRequest.URI.ref;
      rangeRequest = contentEncoding === 'identity' &&
                     acceptRanges === 'bytes' &&
                     aRequest.contentLength >= 0 &&
                     hash.indexOf('disableRange=true') < 0;
    }

    aRequest.QueryInterface(Ci.nsIChannel);

    aRequest.QueryInterface(Ci.nsIWritablePropertyBag);

    var contentDispositionFilename;
    try {
      contentDispositionFilename = aRequest.contentDispositionFilename;
    } catch (e) {}

    // Change the content type so we don't get stuck in a loop.
    aRequest.setProperty('contentType', aRequest.contentType);
    aRequest.contentType = 'text/html';
    if (isHttpRequest) {
      // We trust PDF viewer, using no CSP
      aRequest.setResponseHeader('Content-Security-Policy', '', false);
      aRequest.setResponseHeader('Content-Security-Policy-Report-Only', '',
                                 false);
      aRequest.setResponseHeader('X-Content-Security-Policy', '', false);
      aRequest.setResponseHeader('X-Content-Security-Policy-Report-Only', '',
                                 false);
    }

    PdfJsTelemetry.onViewerIsUsed();
    PdfJsTelemetry.onDocumentSize(aRequest.contentLength);

    if (!rangeRequest) {
      // Creating storage for PDF data
      var contentLength = aRequest.contentLength;
      this.dataListener = new PdfDataListener(contentLength);
      this.binaryStream = Cc['@mozilla.org/binaryinputstream;1']
                          .createInstance(Ci.nsIBinaryInputStream);
    } else {
      // Suspend the request so we're not consuming any of the stream,
      // but we can't cancel the request yet. Otherwise, the original
      // listener will think we do not want to go the new PDF url
      aRequest.suspend();
    }

    // Create a new channel that is viewer loaded as a resource.
    var ioService = Services.io;
    var channel = ioService.newChannel(
                    PDF_VIEWER_WEB_PAGE, null, null);

    var listener = this.listener;
    var dataListener = this.dataListener;
    // Proxy all the request observer calls, when it gets to onStopRequest
    // we can get the dom window.  We also intentionally pass on the original
    // request(aRequest) below so we don't overwrite the original channel and
    // trigger an assertion.
    var proxy = {
      onStartRequest: function(request, context) {
        listener.onStartRequest(aRequest, context);
      },
      onDataAvailable: function(request, context, inputStream, offset, count) {
        listener.onDataAvailable(aRequest, context, inputStream, offset, count);
      },
      onStopRequest: function(request, context, statusCode) {
        // We get the DOM window here instead of before the request since it
        // may have changed during a redirect.
        var domWindow = getDOMWindow(channel);
        var actions;
        if (rangeRequest) {
          // We are going to be issuing range requests, so cancel the
          // original request
          aRequest.resume();
          aRequest.cancel(Cr.NS_BINDING_ABORTED);
          actions = new RangedChromeActions(domWindow,
              contentDispositionFilename, aRequest);
        } else {
          actions = new StandardChromeActions(
              domWindow, contentDispositionFilename, dataListener);
        }
        var requestListener = new RequestListener(actions);
        domWindow.addEventListener(PDFJS_EVENT_ID, function(event) {
          requestListener.receive(event);
        }, false, true);
        if (actions.supportsIntegratedFind()) {
          var chromeWindow = getChromeWindow(domWindow);
          var findEventManager = new FindEventManager(chromeWindow.gFindBar,
                                                      domWindow,
                                                      chromeWindow);
          findEventManager.bind();
        }
        listener.onStopRequest(aRequest, context, statusCode);
      }
    };

    // Keep the URL the same so the browser sees it as the same.
    channel.originalURI = aRequest.URI;
    channel.loadGroup = aRequest.loadGroup;

    // We can use resource principal when data is fetched by the chrome
    // e.g. useful for NoScript
    var securityManager = Cc['@mozilla.org/scriptsecuritymanager;1']
                          .getService(Ci.nsIScriptSecurityManager);
    var uri = ioService.newURI(PDF_VIEWER_WEB_PAGE, null, null);
    // FF16 and below had getCodebasePrincipal, it was replaced by
    // getNoAppCodebasePrincipal (bug 758258).
    var resourcePrincipal = 'getNoAppCodebasePrincipal' in securityManager ?
                            securityManager.getNoAppCodebasePrincipal(uri) :
                            securityManager.getCodebasePrincipal(uri);
    aRequest.owner = resourcePrincipal;
    channel.asyncOpen(proxy, aContext);
  },

  // nsIRequestObserver::onStopRequest
  onStopRequest: function(aRequest, aContext, aStatusCode) {
    if (!this.dataListener) {
      // Do nothing
      return;
    }

    if (Components.isSuccessCode(aStatusCode))
      this.dataListener.finish();
    else
      this.dataListener.error(aStatusCode);
    delete this.dataListener;
    delete this.binaryStream;
  }
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([PdfStreamConverter]);
