const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

const PDF_CONTENT_TYPE = "application/pdf";

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

// TODO
// Add some download progress event

function log(aMsg) {
  let msg = "pdfContentHandler.js: " + (aMsg.join ? aMsg.join("") : aMsg);
  Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService)
                                     .logStringMessage(msg);
  dump(msg + "\n");
};

function loadDocument(aWindow, aDocumentUrl) {
  let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
              .createInstance(Ci.nsIXMLHttpRequest);
  xhr.open("GET", aDocumentUrl);
  xhr.mozResponseType = xhr.responseType = "arraybuffer";
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4 && xhr.status == 200) {
      let data = (xhr.mozResponseArrayBuffer || xhr.mozResponse ||
                  xhr.responseArrayBuffer || xhr.response);
      try {
        var view = new Uint8Array(data);

        // I think accessing aWindow.wrappedJSObject returns a 
        // XPCSafeJSObjectWrapper and so it is safe but mrbkap can confirm that
        let window = aWindow.wrappedJSObject;
        var arrayBuffer = new window.ArrayBuffer(data.byteLength);
        var view2 = new window.Uint8Array(arrayBuffer);
        view2.set(view);

        let evt = window.document.createEvent("CustomEvent");
        evt.initCustomEvent("pdfloaded", false, false, arrayBuffer);
        window.document.dispatchEvent(evt);
      } catch(e) {
        log("Error - " + e);
      }
    }
  };
  xhr.send(null);
};

let WebProgressListener = {
  init: function(aWindow, aUrl) {
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
    } catch(e) {}
    webProgress.addProgressListener(this, flags);
  },

  onStateChange: function onStateChange(aWebProgress, aRequest, aStateFlags, aStatus) {
    const complete = Ci.nsIWebProgressListener.STATE_IS_WINDOW +
                     Ci.nsIWebProgressListener.STATE_STOP;
    if ((aStateFlags & complete) == complete && this._locationHasChanged) {
      aWebProgress.removeProgressListener(this);
      loadDocument(aWebProgress.DOMWindow, this._documentUrl);
    }
  },

  onProgressChange: function onProgressChange(aWebProgress, aRequest, aCurSelf, aMaxSelf, aCurTotal, aMaxTotal) {
  },

  onLocationChange: function onLocationChange(aWebProgress, aRequest, aLocationURI) {
    this._locationHasChanged = true;
  },

  onStatusChange: function onStatusChange(aWebProgress, aRequest, aStatus, aMessage) {
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
      let url = Services.prefs.getCharPref("extensions.pdf.js.url");
      url = url.replace("%s", uri.spec);
      window.location = url;
    } catch(e) {
      log("Error - " + e);
    }
  },

  classID: Components.ID("{2278dfd0-b75c-11e0-8257-1ba3d93c9f1a}"),
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIContentHandler]),
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([pdfContentHandler]);


