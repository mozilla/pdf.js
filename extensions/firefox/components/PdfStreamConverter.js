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
           dump */

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

XPCOMUtils.defineLazyModuleGetter(this, 'PrivateBrowsingUtils',
  'resource://gre/modules/PrivateBrowsingUtils.jsm');

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

function isEnabled() {
  if (MOZ_CENTRAL) {
    var disabled = getBoolPref(PREF_PREFIX + '.disabled', false);
    if (disabled)
      return false;
    // To also be considered enabled the "Preview in Firefox" option must be
    // selected in the Application preferences.
    var handlerInfo = Svc.mime
                         .getFromTypeAndExtension('application/pdf', 'pdf');
    return !handlerInfo.alwaysAskBeforeHandling &&
           handlerInfo.preferredAction == Ci.nsIHandlerInfo.handleInternally;
  }
  // Always returns true for the extension since enabling/disabling is handled
  // by the add-on manager.
  return true;
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
function ChromeActions(domWindow, dataListener, contentDispositionFilename) {
  this.domWindow = domWindow;
  this.dataListener = dataListener;
  this.contentDispositionFilename = contentDispositionFilename;
}

ChromeActions.prototype = {
  isInPrivateBrowsing: function() {
    var docIsPrivate, privateBrowsing;
    try {
      docIsPrivate = PrivateBrowsingUtils.isWindowPrivate(this.domWindow);
    } catch (x) {
      // unable to use PrivateBrowsingUtils, e.g. FF15
    }
    if (typeof docIsPrivate === 'undefined') {
      // per-window Private Browsing is not supported, trying global service
      try {
        privateBrowsing = Cc['@mozilla.org/privatebrowsing;1']
                            .getService(Ci.nsIPrivateBrowsingService);
        docIsPrivate = privateBrowsing.privateBrowsingEnabled;
      } catch (x) {
        // unable to get nsIPrivateBrowsingService (e.g. not Firefox)
        docIsPrivate = false;
      }
    }
    // caching the result
    this.isInPrivateBrowsing = function isInPrivateBrowsingCached() {
      return docIsPrivate;
    };
    return docIsPrivate;
  },
  download: function(data, sendResponse) {
    var self = this;
    var originalUrl = data.originalUrl;
    // The data may not be downloaded so we need just retry getting the pdf with
    // the original url.
    var originalUri = NetUtil.newURI(data.originalUrl);
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
      channel.contentDisposition = Ci.nsIChannel.DISPOSITION_ATTACHMENT;
      if (self.contentDispositionFilename) {
        channel.contentDispositionFilename = self.contentDispositionFilename;
      }
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
  getLoadingType: function() {
    return this.dataListener ? 'passive' : 'active';
  },
  initPassiveLoading: function() {
    if (!this.dataListener)
      return false;

    var domWindow = this.domWindow;
    this.dataListener.onprogress =
      function ChromeActions_dataListenerProgress(loaded, total) {

      domWindow.postMessage({
        pdfjsLoadAction: 'progress',
        loaded: loaded,
        total: total
      }, '*');
    };

    this.dataListener.oncomplete =
      function ChromeActions_dataListenerComplete(data, errorCode) {

      domWindow.postMessage({
        pdfjsLoadAction: 'complete',
        data: data,
        errorCode: errorCode
      }, '*');

      delete this.dataListener;
    };

    return true;
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
    var pref = getIntPref('browser.display.use_document_fonts', 1);
    return !!pref;
  },
  fallback: function(url, sendResponse) {
    var self = this;
    var domWindow = this.domWindow;
    var strings = getLocalizedStrings('chrome.properties');
    var message = getLocalizedString(strings, 'unsupported_feature');

    var notificationBox = null;
    // Multiple browser windows can be opened, finding one for notification box
    var windowsEnum = Services.wm
                      .getZOrderDOMWindowEnumerator('navigator:browser', true);
    while (windowsEnum.hasMoreElements()) {
      var win = windowsEnum.getNext();
      if (win.closed)
        continue;
      var browser = win.gBrowser.getBrowserForDocument(domWindow.top.document);
      if (browser) {
        // right window/browser is found, getting the notification box
        notificationBox = win.gBrowser.getNotificationBox(browser);
        break;
      }
    }
    if (!notificationBox) {
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
                                       notificationBox.PRIORITY_WARNING_LOW,
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
   * 2. onStartRequest creates a new channel, streams the viewer and cancels
   *    the request so pdf.js can do the request
   * Since the request is cancelled onDataAvailable should not be called. The
   * onStopRequest does nothing. The convert function just returns the stream,
   * it's just the synchronous version of asyncConvertData.
   */

  // nsIStreamConverter::convert
  convert: function(aFromStream, aFromType, aToType, aCtxt) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  // nsIStreamConverter::asyncConvertData
  asyncConvertData: function(aFromType, aToType, aListener, aCtxt) {
    if (!isEnabled())
      throw Cr.NS_ERROR_NOT_IMPLEMENTED;

    // Store the listener passed to us
    this.listener = aListener;
  },

  // nsIStreamListener::onDataAvailable
  onDataAvailable: function(aRequest, aContext, aInputStream, aOffset, aCount) {
    if (!this.dataListener) {
      // Do nothing since all the data loading is handled by the viewer.
      return;
    }

    var binaryStream = this.binaryStream;
    binaryStream.setInputStream(aInputStream);
    this.dataListener.append(binaryStream.readByteArray(aCount));
  },

  // nsIRequestObserver::onStartRequest
  onStartRequest: function(aRequest, aContext) {
    // Setup the request so we can use it below.
    aRequest.QueryInterface(Ci.nsIChannel);
    aRequest.QueryInterface(Ci.nsIWritablePropertyBag);
    // Creating storage for PDF data
    var contentLength = aRequest.contentLength;
    var dataListener = new PdfDataListener(contentLength);
    var contentDispositionFilename;
    try {
      contentDispositionFilename = aRequest.contentDispositionFilename;
    } catch (e) {}
    this.dataListener = dataListener;
    this.binaryStream = Cc['@mozilla.org/binaryinputstream;1']
                        .createInstance(Ci.nsIBinaryInputStream);

    // Change the content type so we don't get stuck in a loop.
    aRequest.setProperty('contentType', aRequest.contentType);
    aRequest.contentType = 'text/html';

    // Create a new channel that is viewer loaded as a resource.
    var ioService = Services.io;
    var channel = ioService.newChannel(
                    PDF_VIEWER_WEB_PAGE, null, null);

    var listener = this.listener;
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
        // Double check the url is still the correct one.
        if (domWindow.document.documentURIObject.equals(aRequest.URI)) {
          var actions = new ChromeActions(domWindow, dataListener,
                                          contentDispositionFilename);
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
        } else {
          log('Dom window url did not match request url.');
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
