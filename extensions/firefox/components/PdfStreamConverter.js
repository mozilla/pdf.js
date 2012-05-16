/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var EXPORTED_SYMBOLS = ['PdfStreamConverter'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const PDFJS_EVENT_ID = 'pdf.js.message';
const PDF_CONTENT_TYPE = 'application/pdf';
const EXT_PREFIX = 'extensions.uriloader@pdf.js';
const MAX_DATABASE_LENGTH = 4096;
const FIREFOX_ID = '{ec8030f7-c20a-464f-9b0e-13a3a9e97384}';
const SEAMONKEY_ID = '{92650c4d-4b8e-4d2a-b7eb-24ecf4f6b63a}';

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
Cu.import('resource://gre/modules/Services.jsm');
Cu.import('resource://gre/modules/NetUtil.jsm');

let appInfo = Cc['@mozilla.org/xre/app-info;1']
                  .getService(Ci.nsIXULAppInfo);
let privateBrowsing, inPrivateBrowsing;

if (appInfo.ID === FIREFOX_ID) {
  privateBrowsing = Cc['@mozilla.org/privatebrowsing;1']
                          .getService(Ci.nsIPrivateBrowsingService);
  inPrivateBrowsing = privateBrowsing.privateBrowsingEnabled;
} else if (appInfo.ID === SEAMONKEY_ID) {
  privateBrowsing = null;
  inPrivateBrowsing = false;
}

function getBoolPref(pref, def) {
  try {
    return Services.prefs.getBoolPref(pref);
  } catch (ex) {
    return def;
  }
}

function setStringPref(pref, value) {
  let str = Cc['@mozilla.org/supports-string;1']
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
  if (!getBoolPref(EXT_PREFIX + '.pdfBugEnabled', false))
    return;
  let msg = 'PdfStreamConverter.js: ' + (aMsg.join ? aMsg.join('') : aMsg);
  Services.console.logStringMessage(msg);
  dump(msg + '\n');
}

function getDOMWindow(aChannel) {
  var requestor = aChannel.notificationCallbacks;
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

// All the priviledged actions.
function ChromeActions() {
}

ChromeActions.prototype = {
  download: function(data) {
    let mimeService = Cc['@mozilla.org/mime;1'].getService(Ci.nsIMIMEService);
    var handlerInfo = mimeService.
                        getFromTypeAndExtension('application/pdf', 'pdf');
    var uri = NetUtil.newURI(data);

    var extHelperAppSvc =
          Cc['@mozilla.org/uriloader/external-helper-app-service;1'].
            getService(Ci.nsIExternalHelperAppService);
    var frontWindow = Cc['@mozilla.org/embedcomp/window-watcher;1'].
                        getService(Ci.nsIWindowWatcher).activeWindow;
    var ioService = Services.io;
    var channel = ioService.newChannel(data, null, null);
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
      },
      onDataAvailable: function(aRequest, aContext, aInputStream, aOffset,
                                aCount) {
        this.extListener.onDataAvailable(aRequest, aContext, aInputStream,
                                         aOffset, aCount);
      }
    };

    channel.asyncOpen(listener, null);
  },
  setDatabase: function(data) {
    if (inPrivateBrowsing)
      return;
    // Protect against something sending tons of data to setDatabase.
    if (data.length > MAX_DATABASE_LENGTH)
      return;
    setStringPref(EXT_PREFIX + '.database', data);
  },
  getDatabase: function() {
    if (inPrivateBrowsing)
      return '{}';
    return getStringPref(EXT_PREFIX + '.database', '{}');
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
    return getBoolPref(EXT_PREFIX + '.pdfBugEnabled', false);
  }
};


// Event listener to trigger chrome privedged code.
function RequestListener(actions) {
  this.actions = actions;
}
// Receive an event and synchronously responds.
RequestListener.prototype.receive = function(event) {
  var message = event.target;
  var action = message.getUserData('action');
  var data = message.getUserData('data');
  var actions = this.actions;
  if (!(action in actions)) {
    log('Unknown action: ' + action);
    return;
  }
  var response = actions[action].call(this.actions, data);
  message.setUserData('response', response, null);
};


function PdfStreamConverter() {
}

PdfStreamConverter.prototype = {

  // properties required for XPCOM registration:
  classID: Components.ID('{6457a96b-2d68-439a-bcfa-44465fbcdbb1}'),
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
    // Ignoring HTTP POST requests -- pdf.js has to repeat the request.
    var skipConversion = false;
    try {
      var request = aCtxt;
      request.QueryInterface(Ci.nsIHttpChannel);
      skipConversion = (request.requestMethod !== 'GET');
    } catch (e) {
      // Non-HTTP request... continue normally.
    }
    if (skipConversion)
      throw Cr.NS_ERROR_NOT_IMPLEMENTED;

    // Store the listener passed to us
    this.listener = aListener;
  },

  // nsIStreamListener::onDataAvailable
  onDataAvailable: function(aRequest, aContext, aInputStream, aOffset, aCount) {
    // Do nothing since all the data loading is handled by the viewer.
    log('SANITY CHECK: onDataAvailable SHOULD NOT BE CALLED!');
  },

  // nsIRequestObserver::onStartRequest
  onStartRequest: function(aRequest, aContext) {

    // Setup the request so we can use it below.
    aRequest.QueryInterface(Ci.nsIChannel);
    // Cancel the request so the viewer can handle it.
    aRequest.cancel(Cr.NS_BINDING_ABORTED);

    // Create a new channel that is viewer loaded as a resource.
    var ioService = Services.io;
    var channel = ioService.newChannel(
                    'resource://pdf.js/web/viewer.html', null, null);

    var listener = this.listener;
    // Proxy all the request observer calls, when it gets to onStopRequest
    // we can get the dom window.
    var proxy = {
      onStartRequest: function() {
        listener.onStartRequest.apply(listener, arguments);
      },
      onDataAvailable: function() {
        listener.onDataAvailable.apply(listener, arguments);
      },
      onStopRequest: function() {
        var domWindow = getDOMWindow(channel);
        // Double check the url is still the correct one.
        if (domWindow.document.documentURIObject.equals(aRequest.URI)) {
          let requestListener = new RequestListener(new ChromeActions);
          domWindow.addEventListener(PDFJS_EVENT_ID, function(event) {
            requestListener.receive(event);
          }, false, true);
        }
        listener.onStopRequest.apply(listener, arguments);
      }
    };

    // Keep the URL the same so the browser sees it as the same.
    channel.originalURI = aRequest.URI;
    channel.asyncOpen(proxy, aContext);
  },

  // nsIRequestObserver::onStopRequest
  onStopRequest: function(aRequest, aContext, aStatusCode) {
    // Do nothing.
  }
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([PdfStreamConverter]);
