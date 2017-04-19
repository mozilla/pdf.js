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
/* globals Components, Services, XPCOMUtils, NetUtil, PrivateBrowsingUtils,
           dump, NetworkManager, PdfJsTelemetry, PdfjsContentUtils */

"use strict";

var EXPORTED_SYMBOLS = ["PdfStreamConverter"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

const PDFJS_EVENT_ID = "pdf.js.message";
const PDF_CONTENT_TYPE = "application/pdf";
const PREF_PREFIX = "PDFJSSCRIPT_PREF_PREFIX";
const PDF_VIEWER_WEB_PAGE = "resource://pdf.js/web/viewer.html";
const MAX_NUMBER_OF_PREFS = 50;
const MAX_STRING_PREF_LENGTH = 128;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "NetUtil",
  "resource://gre/modules/NetUtil.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "NetworkManager",
  "resource://pdf.js/PdfJsNetwork.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "PrivateBrowsingUtils",
  "resource://gre/modules/PrivateBrowsingUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "PdfJsTelemetry",
  "resource://pdf.js/PdfJsTelemetry.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "PdfjsContentUtils",
  "resource://pdf.js/PdfjsContentUtils.jsm");

var Svc = {};
XPCOMUtils.defineLazyServiceGetter(Svc, "mime",
                                   "@mozilla.org/mime;1",
                                   "nsIMIMEService");

function getContainingBrowser(domWindow) {
  return domWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                  .getInterface(Ci.nsIWebNavigation)
                  .QueryInterface(Ci.nsIDocShell)
                  .chromeEventHandler;
}

function getFindBar(domWindow) {
  if (PdfjsContentUtils.isRemote) {
    throw new Error("FindBar is not accessible from the content process.");
  }
  try {
    var browser = getContainingBrowser(domWindow);
    var tabbrowser = browser.getTabBrowser();
    var tab = tabbrowser.getTabForBrowser(browser);
    return tabbrowser.getFindBar(tab);
  } catch (e) {
    // Suppress errors for PDF files opened in the bookmark sidebar, see
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1248959.
    return null;
  }
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

function getStringPref(pref, def) {
  try {
//#if !MOZCENTRAL
    if (!Services.prefs.getStringPref) {
      return Services.prefs.getComplexValue(pref, Ci.nsISupportsString).data;
    }
//#endif
    return Services.prefs.getStringPref(pref);
  } catch (ex) {
    return def;
  }
}

function log(aMsg) {
  if (!getBoolPref(PREF_PREFIX + ".pdfBugEnabled", false)) {
    return;
  }
  var msg = "PdfStreamConverter.js: " + (aMsg.join ? aMsg.join("") : aMsg);
  Services.console.logStringMessage(msg);
  dump(msg + "\n");
}

function getDOMWindow(aChannel) {
  var requestor = aChannel.notificationCallbacks ?
                  aChannel.notificationCallbacks :
                  aChannel.loadGroup.notificationCallbacks;
  var win = requestor.getInterface(Components.interfaces.nsIDOMWindow);
  return win;
}

function getLocalizedStrings(path) {
  var stringBundle = Cc["@mozilla.org/intl/stringbundle;1"].
      getService(Ci.nsIStringBundleService).
      createBundle("chrome://pdf.js/locale/" + path);

  var map = {};
  var enumerator = stringBundle.getSimpleEnumeration();
  while (enumerator.hasMoreElements()) {
    var string = enumerator.getNext().QueryInterface(Ci.nsIPropertyElement);
    var key = string.key, property = "textContent";
    var i = key.lastIndexOf(".");
    if (i >= 0) {
      property = key.substring(i + 1);
      key = key.substring(0, i);
    }
    if (!(key in map)) {
      map[key] = {};
    }
    map[key][property] = string.value;
  }
  return map;
}
function getLocalizedString(strings, id, property) {
  property = property || "textContent";
  if (id in strings) {
    return strings[id][property];
  }
  return id;
}

// PDF data storage
function PdfDataListener(length) {
  this.length = length; // less than 0, if length is unknown
  this.buffer = null;
  this.loaded = 0;
}

PdfDataListener.prototype = {
  append: function PdfDataListener_append(chunk) {
    // In most of the cases we will pass data as we receive it, but at the
    // beginning of the loading we may accumulate some data.
    if (!this.buffer) {
      this.buffer = new Uint8Array(chunk);
    } else {
      var buffer = this.buffer;
      var newBuffer = new Uint8Array(buffer.length + chunk.length);
      newBuffer.set(buffer);
      newBuffer.set(chunk, buffer.length);
      this.buffer = newBuffer;
    }
    this.loaded += chunk.length;
    if (this.length >= 0 && this.length < this.loaded) {
      this.length = -1; // reset the length, server is giving incorrect one
    }
    this.onprogress(this.loaded, this.length >= 0 ? this.length : void 0);
  },
  readData: function PdfDataListener_readData() {
    var result = this.buffer;
    this.buffer = null;
    return result;
  },
  finish: function PdfDataListener_finish() {
    this.isDataReady = true;
    if (this.oncompleteCallback) {
      this.oncompleteCallback(this.readData());
    }
  },
  error: function PdfDataListener_error(errorCode) {
    this.errorCode = errorCode;
    if (this.oncompleteCallback) {
      this.oncompleteCallback(null, errorCode);
    }
  },
  onprogress() {},
  get oncomplete() {
    return this.oncompleteCallback;
  },
  set oncomplete(value) {
    this.oncompleteCallback = value;
    if (this.isDataReady) {
      value(this.readData());
    }
    if (this.errorCode) {
      value(null, this.errorCode);
    }
  }
};

/**
 * All the privileged actions.
 */
class ChromeActions {
  constructor(domWindow, contentDispositionFilename) {
    this.domWindow = domWindow;
    this.contentDispositionFilename = contentDispositionFilename;
    this.telemetryState = {
      documentInfo: false,
      firstPageInfo: false,
      streamTypesUsed: [],
      fontTypesUsed: [],
      startAt: Date.now()
    };
  }

  isInPrivateBrowsing() {
    return PrivateBrowsingUtils.isContentWindowPrivate(this.domWindow);
  }

  download(data, sendResponse) {
    var self = this;
    var originalUrl = data.originalUrl;
    var blobUrl = data.blobUrl || originalUrl;
    // The data may not be downloaded so we need just retry getting the pdf with
    // the original url.
    var originalUri = NetUtil.newURI(originalUrl);
    var filename = data.filename;
    if (typeof filename !== "string" ||
        (!/\.pdf$/i.test(filename) && !data.isAttachment)) {
      filename = "document.pdf";
    }
    var blobUri = NetUtil.newURI(blobUrl);
    var extHelperAppSvc =
          Cc["@mozilla.org/uriloader/external-helper-app-service;1"].
             getService(Ci.nsIExternalHelperAppService);

    var docIsPrivate = this.isInPrivateBrowsing();
    var netChannel = NetUtil.newChannel({
      uri: blobUri,
      loadUsingSystemPrincipal: true,
    });
    if ("nsIPrivateBrowsingChannel" in Ci &&
        netChannel instanceof Ci.nsIPrivateBrowsingChannel) {
      netChannel.setPrivate(docIsPrivate);
    }
    NetUtil.asyncFetch(netChannel, function(aInputStream, aResult) {
      if (!Components.isSuccessCode(aResult)) {
        if (sendResponse) {
          sendResponse(true);
        }
        return;
      }
      // Create a nsIInputStreamChannel so we can set the url on the channel
      // so the filename will be correct.
      var channel = Cc["@mozilla.org/network/input-stream-channel;1"].
                       createInstance(Ci.nsIInputStreamChannel);
      channel.QueryInterface(Ci.nsIChannel);
      try {
        // contentDisposition/contentDispositionFilename is readonly before FF18
        channel.contentDisposition = Ci.nsIChannel.DISPOSITION_ATTACHMENT;
        if (self.contentDispositionFilename && !data.isAttachment) {
          channel.contentDispositionFilename = self.contentDispositionFilename;
        } else {
          channel.contentDispositionFilename = filename;
        }
      } catch (e) {}
      channel.setURI(originalUri);
      channel.loadInfo = netChannel.loadInfo;
      channel.contentStream = aInputStream;
      if ("nsIPrivateBrowsingChannel" in Ci &&
          channel instanceof Ci.nsIPrivateBrowsingChannel) {
        channel.setPrivate(docIsPrivate);
      }

      var listener = {
        extListener: null,
        onStartRequest(aRequest, aContext) {
          var loadContext = self.domWindow
                                .QueryInterface(Ci.nsIInterfaceRequestor)
                                .getInterface(Ci.nsIWebNavigation)
                                .QueryInterface(Ci.nsILoadContext);
          this.extListener = extHelperAppSvc.doContent(
            (data.isAttachment ? "application/octet-stream" :
                                 "application/pdf"),
            aRequest, loadContext, false);
          this.extListener.onStartRequest(aRequest, aContext);
        },
        onStopRequest(aRequest, aContext, aStatusCode) {
          if (this.extListener) {
            this.extListener.onStopRequest(aRequest, aContext, aStatusCode);
          }
          // Notify the content code we're done downloading.
          if (sendResponse) {
            sendResponse(false);
          }
        },
        onDataAvailable(aRequest, aContext, aDataInputStream, aOffset, aCount) {
          this.extListener.onDataAvailable(aRequest, aContext, aDataInputStream,
                                           aOffset, aCount);
        }
      };

      channel.asyncOpen2(listener);
    });
  }

  getLocale() {
//#if !MOZCENTRAL
    if (!Services.locale.getRequestedLocale) {
      return getStringPref("general.useragent.locale", "en-US");
    }
//#endif
    return Services.locale.getRequestedLocale() || "en-US";
  }

  getStrings(data) {
    try {
      // Lazy initialization of localizedStrings
      if (!("localizedStrings" in this)) {
        this.localizedStrings = getLocalizedStrings("viewer.properties");
      }
      var result = this.localizedStrings[data];
      return JSON.stringify(result || null);
    } catch (e) {
      log("Unable to retrieve localized strings: " + e);
      return "null";
    }
  }

  supportsIntegratedFind() {
    // Integrated find is only supported when we're not in a frame
    if (this.domWindow.frameElement !== null) {
      return false;
    }

    // ... and we are in a child process
    if (PdfjsContentUtils.isRemote) {
      return true;
    }

    // ... or when the new find events code exists.
    var findBar = getFindBar(this.domWindow);
    return !!findBar && ("updateControlState" in findBar);
  }

  supportsDocumentFonts() {
    var prefBrowser = getIntPref("browser.display.use_document_fonts", 1);
    var prefGfx = getBoolPref("gfx.downloadable_fonts.enabled", true);
    return (!!prefBrowser && prefGfx);
  }

  supportsDocumentColors() {
    return getIntPref("browser.display.document_color_use", 0) !== 2;
  }

  supportedMouseWheelZoomModifierKeys() {
    return {
      ctrlKey: getIntPref("mousewheel.with_control.action", 3) === 3,
      metaKey: getIntPref("mousewheel.with_meta.action", 1) === 3,
    };
  }

  reportTelemetry(data) {
    var probeInfo = JSON.parse(data);
    switch (probeInfo.type) {
      case "documentInfo":
        if (!this.telemetryState.documentInfo) {
          PdfJsTelemetry.onDocumentVersion(probeInfo.version | 0);
          PdfJsTelemetry.onDocumentGenerator(probeInfo.generator | 0);
          if (probeInfo.formType) {
            PdfJsTelemetry.onForm(probeInfo.formType === "acroform");
          }
          this.telemetryState.documentInfo = true;
        }
        break;
      case "pageInfo":
        if (!this.telemetryState.firstPageInfo) {
          var duration = Date.now() - this.telemetryState.startAt;
          PdfJsTelemetry.onTimeToView(duration);
          this.telemetryState.firstPageInfo = true;
        }
        break;
      case "documentStats":
        // documentStats can be called several times for one documents.
        // if stream/font types are reported, trying not to submit the same
        // enumeration value multiple times.
        var documentStats = probeInfo.stats;
        if (!documentStats || typeof documentStats !== "object") {
          break;
        }
        var i, streamTypes = documentStats.streamTypes;
        if (Array.isArray(streamTypes)) {
          var STREAM_TYPE_ID_LIMIT = 20;
          for (i = 0; i < STREAM_TYPE_ID_LIMIT; i++) {
            if (streamTypes[i] &&
                !this.telemetryState.streamTypesUsed[i]) {
              PdfJsTelemetry.onStreamType(i);
              this.telemetryState.streamTypesUsed[i] = true;
            }
          }
        }
        var fontTypes = documentStats.fontTypes;
        if (Array.isArray(fontTypes)) {
          var FONT_TYPE_ID_LIMIT = 20;
          for (i = 0; i < FONT_TYPE_ID_LIMIT; i++) {
            if (fontTypes[i] &&
                !this.telemetryState.fontTypesUsed[i]) {
              PdfJsTelemetry.onFontType(i);
              this.telemetryState.fontTypesUsed[i] = true;
            }
          }
        }
        break;
      case "print":
        PdfJsTelemetry.onPrint();
        break;
    }
  }

  /**
   * @param {Object} args - Object with `featureId` and `url` properties.
   * @param {function} sendResponse - Callback function.
   */
  fallback(args, sendResponse) {
    var featureId = args.featureId;

    var domWindow = this.domWindow;
    var strings = getLocalizedStrings("chrome.properties");
    var message;
    if (featureId === "forms") {
      message = getLocalizedString(strings, "unsupported_feature_forms");
    } else {
      message = getLocalizedString(strings, "unsupported_feature");
    }
    PdfJsTelemetry.onFallback();
    PdfjsContentUtils.displayWarning(domWindow, message,
      getLocalizedString(strings, "open_with_different_viewer"),
      getLocalizedString(strings, "open_with_different_viewer", "accessKey"));

    let winmm = domWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                         .getInterface(Ci.nsIDocShell)
                         .QueryInterface(Ci.nsIInterfaceRequestor)
                         .getInterface(Ci.nsIContentFrameMessageManager);

    winmm.addMessageListener("PDFJS:Child:fallbackDownload",
      function fallbackDownload(msg) {
        let data = msg.data;
        sendResponse(data.download);

        winmm.removeMessageListener("PDFJS:Child:fallbackDownload",
                                    fallbackDownload);
      });
  }

  updateFindControlState(data) {
    if (!this.supportsIntegratedFind()) {
      return;
    }
    // Verify what we're sending to the findbar.
    var result = data.result;
    var findPrevious = data.findPrevious;
    var findPreviousType = typeof findPrevious;
    if ((typeof result !== "number" || result < 0 || result > 3) ||
        (findPreviousType !== "undefined" && findPreviousType !== "boolean")) {
      return;
    }

    var winmm = this.domWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                              .getInterface(Ci.nsIDocShell)
                              .QueryInterface(Ci.nsIInterfaceRequestor)
                              .getInterface(Ci.nsIContentFrameMessageManager);

    winmm.sendAsyncMessage("PDFJS:Parent:updateControlState", data);
  }

  setPreferences(prefs, sendResponse) {
    var defaultBranch = Services.prefs.getDefaultBranch(PREF_PREFIX + ".");
    var numberOfPrefs = 0;
    var prefValue, prefName;
    for (var key in prefs) {
      if (++numberOfPrefs > MAX_NUMBER_OF_PREFS) {
        log("setPreferences - Exceeded the maximum number of preferences " +
            "that is allowed to be set at once.");
        break;
      } else if (!defaultBranch.getPrefType(key)) {
        continue;
      }
      prefValue = prefs[key];
      prefName = (PREF_PREFIX + "." + key);
      switch (typeof prefValue) {
        case "boolean":
          PdfjsContentUtils.setBoolPref(prefName, prefValue);
          break;
        case "number":
          PdfjsContentUtils.setIntPref(prefName, prefValue);
          break;
        case "string":
          if (prefValue.length > MAX_STRING_PREF_LENGTH) {
            log("setPreferences - Exceeded the maximum allowed length " +
                "for a string preference.");
          } else {
            PdfjsContentUtils.setStringPref(prefName, prefValue);
          }
          break;
      }
    }
    if (sendResponse) {
      sendResponse(true);
    }
  }

  getPreferences(prefs, sendResponse) {
    var defaultBranch = Services.prefs.getDefaultBranch(PREF_PREFIX + ".");
    var currentPrefs = {}, numberOfPrefs = 0;
    var prefValue, prefName;
    for (var key in prefs) {
      if (++numberOfPrefs > MAX_NUMBER_OF_PREFS) {
        log("getPreferences - Exceeded the maximum number of preferences " +
            "that is allowed to be fetched at once.");
        break;
      } else if (!defaultBranch.getPrefType(key)) {
        continue;
      }
      prefValue = prefs[key];
      prefName = (PREF_PREFIX + "." + key);
      switch (typeof prefValue) {
        case "boolean":
          currentPrefs[key] = getBoolPref(prefName, prefValue);
          break;
        case "number":
          currentPrefs[key] = getIntPref(prefName, prefValue);
          break;
        case "string":
          currentPrefs[key] = getStringPref(prefName, prefValue);
          break;
      }
    }
    let result = JSON.stringify(currentPrefs);
    if (sendResponse) {
      sendResponse(result);
    }
    return result;
  }
}

/**
 * This is for range requests.
 */
class RangedChromeActions extends ChromeActions {
  constructor(domWindow, contentDispositionFilename, originalRequest,
              rangeEnabled, streamingEnabled, dataListener) {

    super(domWindow, contentDispositionFilename);
    this.dataListener = dataListener;
    this.originalRequest = originalRequest;
    this.rangeEnabled = rangeEnabled;
    this.streamingEnabled = streamingEnabled;

    this.pdfUrl = originalRequest.URI.spec;
    this.contentLength = originalRequest.contentLength;

    // Pass all the headers from the original request through
    var httpHeaderVisitor = {
      headers: {},
      visitHeader(aHeader, aValue) {
        if (aHeader === "Range") {
          // When loading the PDF from cache, firefox seems to set the Range
          // request header to fetch only the unfetched portions of the file
          // (e.g. 'Range: bytes=1024-'). However, we want to set this header
          // manually to fetch the PDF in chunks.
          return;
        }
        this.headers[aHeader] = aValue;
      }
    };
    if (originalRequest.visitRequestHeaders) {
      originalRequest.visitRequestHeaders(httpHeaderVisitor);
    }

    var self = this;
    var xhr_onreadystatechange = function xhr_onreadystatechange() {
      if (this.readyState === 1) { // LOADING
        var netChannel = this.channel;
        if ("nsIPrivateBrowsingChannel" in Ci &&
            netChannel instanceof Ci.nsIPrivateBrowsingChannel) {
          var docIsPrivate = self.isInPrivateBrowsing();
          netChannel.setPrivate(docIsPrivate);
        }
      }
    };
    var getXhr = function getXhr() {
      const XMLHttpRequest = Components.Constructor(
          "@mozilla.org/xmlextras/xmlhttprequest;1");
      var xhr = new XMLHttpRequest();
      xhr.addEventListener("readystatechange", xhr_onreadystatechange);
      return xhr;
    };

    this.networkManager = new NetworkManager(this.pdfUrl, {
      httpHeaders: httpHeaderVisitor.headers,
      getXhr,
    });

    // If we are in range request mode, this means we manually issued xhr
    // requests, which we need to abort when we leave the page
    domWindow.addEventListener("unload", function unload(e) {
      domWindow.removeEventListener(e.type, unload);
      self.abortLoading();
    });
  }

  initPassiveLoading() {
    var data;
    if (!this.streamingEnabled) {
      this.originalRequest.cancel(Cr.NS_BINDING_ABORTED);
      this.originalRequest = null;
      data = this.dataListener.readData();
      this.dataListener = null;
    } else {
      data = this.dataListener.readData();

      this.dataListener.onprogress = (loaded, total) => {
        this.domWindow.postMessage({
          pdfjsLoadAction: "progressiveRead",
          loaded,
          total,
          chunk: this.dataListener.readData(),
        }, "*");
      };
      this.dataListener.oncomplete = () => {
        this.dataListener = null;
      };
    }

    this.domWindow.postMessage({
      pdfjsLoadAction: "supportsRangedLoading",
      rangeEnabled: this.rangeEnabled,
      streamingEnabled: this.streamingEnabled,
      pdfUrl: this.pdfUrl,
      length: this.contentLength,
      data,
    }, "*");

    return true;
  }

  requestDataRange(args) {
    if (!this.rangeEnabled) {
      return;
    }

    var begin = args.begin;
    var end = args.end;
    var domWindow = this.domWindow;
    // TODO(mack): Support error handler. We're not currently not handling
    // errors from chrome code for non-range requests, so this doesn't
    // seem high-pri
    this.networkManager.requestRange(begin, end, {
      onDone: function RangedChromeActions_onDone(aArgs) {
        domWindow.postMessage({
          pdfjsLoadAction: "range",
          begin: aArgs.begin,
          chunk: aArgs.chunk,
        }, "*");
      },
      onProgress: function RangedChromeActions_onProgress(evt) {
        domWindow.postMessage({
          pdfjsLoadAction: "rangeProgress",
          loaded: evt.loaded,
        }, "*");
      }
    });
  }

  abortLoading() {
    this.networkManager.abortAllRequests();
    if (this.originalRequest) {
      this.originalRequest.cancel(Cr.NS_BINDING_ABORTED);
      this.originalRequest = null;
    }
    this.dataListener = null;
  }
}

/**
 * This is for a single network stream.
 */
class StandardChromeActions extends ChromeActions {
  constructor(domWindow, contentDispositionFilename, originalRequest,
              dataListener) {
    super(domWindow, contentDispositionFilename);
    this.originalRequest = originalRequest;
    this.dataListener = dataListener;
  }

  initPassiveLoading() {
    if (!this.dataListener) {
      return false;
    }

    this.dataListener.onprogress = (loaded, total) => {
      this.domWindow.postMessage({
        pdfjsLoadAction: "progress",
        loaded,
        total,
      }, "*");
    };

    this.dataListener.oncomplete = (data, errorCode) => {
      this.domWindow.postMessage({
        pdfjsLoadAction: "complete",
        data,
        errorCode,
      }, "*");

      this.dataListener = null;
      this.originalRequest = null;
    };

    return true;
  }

  abortLoading() {
    if (this.originalRequest) {
      this.originalRequest.cancel(Cr.NS_BINDING_ABORTED);
      this.originalRequest = null;
    }
    this.dataListener = null;
  }
}

/**
 * Event listener to trigger chrome privileged code.
 */
class RequestListener {
  constructor(actions) {
    this.actions = actions;
  }

  // Receive an event and synchronously or asynchronously responds.
  receive(event) {
    var message = event.target;
    var doc = message.ownerDocument;
    var action = event.detail.action;
    var data = event.detail.data;
    var sync = event.detail.sync;
    var actions = this.actions;
    if (!(action in actions)) {
      log("Unknown action: " + action);
      return;
    }
    var response;
    if (sync) {
      response = actions[action].call(this.actions, data);
      event.detail.response = Cu.cloneInto(response, doc.defaultView);
    } else {
      if (!event.detail.responseExpected) {
        doc.documentElement.removeChild(message);
        response = null;
      } else {
        response = function sendResponse(aResponse) {
          try {
            var listener = doc.createEvent("CustomEvent");
            let detail = Cu.cloneInto({ response: aResponse }, doc.defaultView);
            listener.initCustomEvent("pdf.js.response", true, false, detail);
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
  }
}

/**
 * Forwards events from the eventElement to the contentWindow only if the
 * content window matches the currently selected browser window.
 */
class FindEventManager {
  constructor(contentWindow) {
    this.contentWindow = contentWindow;
    this.winmm = contentWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                              .getInterface(Ci.nsIDocShell)
                              .QueryInterface(Ci.nsIInterfaceRequestor)
                              .getInterface(Ci.nsIContentFrameMessageManager);
  }

  bind() {
    var unload = function(e) {
      this.unbind();
      this.contentWindow.removeEventListener(e.type, unload);
    }.bind(this);
    this.contentWindow.addEventListener("unload", unload);

    // We cannot directly attach listeners to for the find events
    // since the FindBar is in the parent process. Instead we're
    // asking the PdfjsChromeUtils to do it for us and forward
    // all the find events to us.
    this.winmm.sendAsyncMessage("PDFJS:Parent:addEventListener");
    this.winmm.addMessageListener("PDFJS:Child:handleEvent", this);
  }

  receiveMessage(msg) {
    var detail = msg.data.detail;
    var type = msg.data.type;
    var contentWindow = this.contentWindow;

    detail = Cu.cloneInto(detail, contentWindow);
    var forward = contentWindow.document.createEvent("CustomEvent");
    forward.initCustomEvent(type, true, true, detail);
    contentWindow.dispatchEvent(forward);
  }

  unbind() {
    this.winmm.sendAsyncMessage("PDFJS:Parent:removeEventListener");
  }
}

function PdfStreamConverter() {
}

PdfStreamConverter.prototype = {

  // properties required for XPCOM registration:
  classID: Components.ID("{PDFJSSCRIPT_STREAM_CONVERTER_ID}"),
  classDescription: "pdf.js Component",
  contractID: "@mozilla.org/streamconv;1?from=application/pdf&to=*/*",

  classID2: Components.ID("{PDFJSSCRIPT_STREAM_CONVERTER2_ID}"),
  contractID2: "@mozilla.org/streamconv;1?from=application/pdf&to=text/html",

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
   *      3.1. Leave the request open until the viewer is ready to switch to
   *           range requests.
   *
   *    If range rquests are not supported:
   *      3.1. Read the stream as it's loaded in onDataAvailable to send
   *           to the viewer
   *
   * The convert function just returns the stream, it's just the synchronous
   * version of asyncConvertData.
   */

  // nsIStreamConverter::convert
  convert(aFromStream, aFromType, aToType, aCtxt) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  // nsIStreamConverter::asyncConvertData
  asyncConvertData(aFromType, aToType, aListener, aCtxt) {
    // Store the listener passed to us
    this.listener = aListener;
  },

  // nsIStreamListener::onDataAvailable
  onDataAvailable(aRequest, aContext, aInputStream, aOffset, aCount) {
    if (!this.dataListener) {
      return;
    }

    var binaryStream = this.binaryStream;
    binaryStream.setInputStream(aInputStream);
    var chunk = binaryStream.readByteArray(aCount);
    this.dataListener.append(chunk);
  },

  // nsIRequestObserver::onStartRequest
  onStartRequest(aRequest, aContext) {
    // Setup the request so we can use it below.
    var isHttpRequest = false;
    try {
      aRequest.QueryInterface(Ci.nsIHttpChannel);
      isHttpRequest = true;
    } catch (e) {}

    var rangeRequest = false;
    var streamRequest = false;
    if (isHttpRequest) {
      var contentEncoding = "identity";
      try {
        contentEncoding = aRequest.getResponseHeader("Content-Encoding");
      } catch (e) {}

      var acceptRanges;
      try {
        acceptRanges = aRequest.getResponseHeader("Accept-Ranges");
      } catch (e) {}

      var hash = aRequest.URI.ref;
      var isPDFBugEnabled = getBoolPref(PREF_PREFIX + ".pdfBugEnabled", false);
      rangeRequest = contentEncoding === "identity" &&
                     acceptRanges === "bytes" &&
                     aRequest.contentLength >= 0 &&
                     !getBoolPref(PREF_PREFIX + ".disableRange", false) &&
                     (!isPDFBugEnabled ||
                      hash.toLowerCase().indexOf("disablerange=true") < 0);
      streamRequest = contentEncoding === "identity" &&
                      aRequest.contentLength >= 0 &&
                      !getBoolPref(PREF_PREFIX + ".disableStream", false) &&
                      (!isPDFBugEnabled ||
                       hash.toLowerCase().indexOf("disablestream=true") < 0);
    }

    aRequest.QueryInterface(Ci.nsIChannel);

    aRequest.QueryInterface(Ci.nsIWritablePropertyBag);

    var contentDispositionFilename;
    try {
      contentDispositionFilename = aRequest.contentDispositionFilename;
    } catch (e) {}

    // Change the content type so we don't get stuck in a loop.
    aRequest.setProperty("contentType", aRequest.contentType);
    aRequest.contentType = "text/html";
    if (isHttpRequest) {
      // We trust PDF viewer, using no CSP
      aRequest.setResponseHeader("Content-Security-Policy", "", false);
      aRequest.setResponseHeader("Content-Security-Policy-Report-Only", "",
                                 false);
      // The viewer does not need to handle HTTP Refresh header.
      aRequest.setResponseHeader("Refresh", "", false);
    }

    PdfJsTelemetry.onViewerIsUsed();
    PdfJsTelemetry.onDocumentSize(aRequest.contentLength);

    // Creating storage for PDF data
    var contentLength = aRequest.contentLength;
    this.dataListener = new PdfDataListener(contentLength);
    this.binaryStream = Cc["@mozilla.org/binaryinputstream;1"]
                        .createInstance(Ci.nsIBinaryInputStream);

    // Create a new channel that is viewer loaded as a resource.
    var channel = NetUtil.newChannel({
      uri: PDF_VIEWER_WEB_PAGE,
      loadUsingSystemPrincipal: true,
    });

    var listener = this.listener;
    var dataListener = this.dataListener;
    // Proxy all the request observer calls, when it gets to onStopRequest
    // we can get the dom window.  We also intentionally pass on the original
    // request(aRequest) below so we don't overwrite the original channel and
    // trigger an assertion.
    var proxy = {
      onStartRequest(request, context) {
        listener.onStartRequest(aRequest, aContext);
      },
      onDataAvailable(request, context, inputStream, offset, count) {
        listener.onDataAvailable(aRequest, aContext, inputStream,
                                 offset, count);
      },
      onStopRequest(request, context, statusCode) {
        // We get the DOM window here instead of before the request since it
        // may have changed during a redirect.
        var domWindow = getDOMWindow(channel);
        var actions;
        if (rangeRequest || streamRequest) {
          actions = new RangedChromeActions(
            domWindow, contentDispositionFilename, aRequest,
            rangeRequest, streamRequest, dataListener);
        } else {
          actions = new StandardChromeActions(
            domWindow, contentDispositionFilename, aRequest, dataListener);
        }
        var requestListener = new RequestListener(actions);
        domWindow.addEventListener(PDFJS_EVENT_ID, function(event) {
          requestListener.receive(event);
        }, false, true);
        if (actions.supportsIntegratedFind()) {
          var findEventManager = new FindEventManager(domWindow);
          findEventManager.bind();
        }
        listener.onStopRequest(aRequest, aContext, statusCode);

        if (domWindow.frameElement) {
          var isObjectEmbed = domWindow.frameElement.tagName !== "IFRAME" ||
            domWindow.frameElement.className === "previewPluginContentFrame";
          PdfJsTelemetry.onEmbed(isObjectEmbed);
        }
      }
    };

    // Keep the URL the same so the browser sees it as the same.
    channel.originalURI = aRequest.URI;
    channel.loadGroup = aRequest.loadGroup;
    channel.loadInfo.originAttributes = aRequest.loadInfo.originAttributes;

    // We can use the resource principal when data is fetched by the chrome,
    // e.g. useful for NoScript. Make make sure we reuse the origin attributes
    // from the request channel to keep isolation consistent.
    var ssm = Cc["@mozilla.org/scriptsecuritymanager;1"]
                .getService(Ci.nsIScriptSecurityManager);
    var uri = NetUtil.newURI(PDF_VIEWER_WEB_PAGE);
    var resourcePrincipal =
      ssm.createCodebasePrincipal(uri, aRequest.loadInfo.originAttributes);
    aRequest.owner = resourcePrincipal;

    channel.asyncOpen2(proxy);
  },

  // nsIRequestObserver::onStopRequest
  onStopRequest(aRequest, aContext, aStatusCode) {
    if (!this.dataListener) {
      // Do nothing
      return;
    }

    if (Components.isSuccessCode(aStatusCode)) {
      this.dataListener.finish();
    } else {
      this.dataListener.error(aStatusCode);
    }
    delete this.dataListener;
    delete this.binaryStream;
  }
};
