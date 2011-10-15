/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

const PDF_CONTENT_TYPE = 'application/pdf';

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
Cu.import('resource://gre/modules/Services.jsm');

function log(aMsg) {
  let msg = 'pdfContentHandler.js: ' + (aMsg.join ? aMsg.join('') : aMsg);
  Cc['@mozilla.org/consoleservice;1'].getService(Ci.nsIConsoleService)
                                     .logStringMessage(msg);
  dump(msg + '\n');
}

function fireEventTo(aName, aData, aWindow) {
  let window = aWindow.wrappedJSObject;
  let evt = window.document.createEvent('CustomEvent');
  evt.initCustomEvent('pdf' + aName, false, false, aData);
  window.document.dispatchEvent(evt);
}

function loadDocument(aWindow, aDocumentUrl) {
  let xhr = Cc['@mozilla.org/xmlextras/xmlhttprequest;1']
              .createInstance(Ci.nsIXMLHttpRequest);
  xhr.onprogress = function updateProgress(evt) {
    if (evt.lengthComputable)
      fireEventTo(evt.type, evt.loaded / evt.total, aWindow);
  };

  xhr.onerror = function error(evt) {
    fireEventTo(evt.type, false, aWindow);
  };

  xhr.onload = function load(evt) {
    let data = (xhr.mozResponseArrayBuffer || xhr.mozResponse ||
                xhr.responseArrayBuffer || xhr.response);
    try {
      let view = new Uint8Array(data);

      let window = aWindow.wrappedJSObject;
      let arrayBuffer = new window.ArrayBuffer(data.byteLength);
      let view2 = new window.Uint8Array(arrayBuffer);
      view2.set(view);

      fireEventTo(evt.type, arrayBuffer, aWindow);
    } catch (e) {
      log('Error - ' + e);
    }
  };

  xhr.open('GET', aDocumentUrl);
  xhr.responseType = 'arraybuffer';
  xhr.send(null);
}

let WebProgressListener = {
  init: function WebProgressListenerInit(aWindow, aUrl) {
    this._locationHasChanged = false;
    this._documentUrl = aUrl;

    let flags = Ci.nsIWebProgress.NOTIFY_LOCATION |
                Ci.nsIWebProgress.NOTIFY_STATE_NETWORK |
                Ci.nsIWebProgress.NOTIFY_STATE_DOCUMENT;

    let docShell = aWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                          .getInterface(Ci.nsIWebNavigation)
                          .QueryInterface(Ci.nsIDocShell);
    let webProgress = docShell.QueryInterface(Ci.nsIInterfaceRequestor)
                              .getInterface(Ci.nsIWebProgress);
    try {
      webProgress.removeProgressListener(this);
    } catch (e) {}
    webProgress.addProgressListener(this, flags);
  },

  onStateChange: function onStateChange(aWebProgress, aRequest, aStateFlags,
                                        aStatus) {
    const complete = Ci.nsIWebProgressListener.STATE_IS_WINDOW +
                     Ci.nsIWebProgressListener.STATE_STOP;
    if ((aStateFlags & complete) == complete && this._locationHasChanged) {
      aWebProgress.removeProgressListener(this);
      loadDocument(aWebProgress.DOMWindow, this._documentUrl);
    }
  },

  onProgressChange: function onProgressChange(aWebProgress, aRequest, aCurSelf,
                                              aMaxSelf, aCurTotal, aMaxTotal) {
  },

  onLocationChange: function onLocationChange(aWebProgress, aRequest,
                                              aLocationURI) {
    this._locationHasChanged = true;
    aWebProgress.DOMWindow.wrappedJSObject.pdfjsIsChromeLoading = true;
  },

  onStatusChange: function onStatusChange(aWebProgress, aRequest, aStatus,
                                          aMessage) {
  },

  onSecurityChange: function onSecurityChange(aWebProgress, aRequest, aState) {
  },

  QueryInterface: function QueryInterface(aIID) {
    if (aIID.equals(Ci.nsIWebProgressListener) ||
        aIID.equals(Ci.nsISupportsWeakReference) ||
        aIID.equals(Ci.nsISupports)) {
        return this;
    }

    throw Components.results.NS_ERROR_NO_INTERFACE;
  }
};


function pdfContentHandler() {
}

pdfContentHandler.prototype = {
  handleContent: function handleContent(aMimetype, aContext, aRequest) {
    if (aMimetype != PDF_CONTENT_TYPE)
      throw Cr.NS_ERROR_WONT_HANDLE_CONTENT;

    if (!(aRequest instanceof Ci.nsIChannel))
      throw Cr.NS_ERROR_WONT_HANDLE_CONTENT;

    let window = null;
    let callbacks = aRequest.notificationCallbacks ?
                    aRequest.notificationCallbacks :
                    aRequest.loadGroup.notificationCallbacks;
    if (!callbacks)
      return;

    aRequest.cancel(Cr.NS_BINDING_ABORTED);
    let uri = aRequest.URI;

    window = callbacks.getInterface(Ci.nsIDOMWindow);
    WebProgressListener.init(window, uri.spec);

    try {
      let url = Services.prefs.getCharPref('extensions.pdf.js.url');
      url = url.replace('%s', uri.spec);
      window.location = url;
    } catch (e) {
      log('Error retrieving the pdf.js base url - ' + e);
    }
  },

  classID: Components.ID('{2278dfd0-b75c-11e0-8257-1ba3d93c9f1a}'),
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIContentHandler])
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([pdfContentHandler]);


