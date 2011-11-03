// Jetpack addon for pdf.js.

const { Cc, Ci, Cr, Cu } = require('chrome');
const viewerURL = require('self').data.url('web/viewer.html');

const PDF_CONTENT_TYPE = 'application/pdf';

let imports = {};
Cu.import('resource://gre/modules/XPCOMUtils.jsm', imports);
Cu.import('resource://gre/modules/Services.jsm', imports);
let { Services, XPCOMUtils } = imports;


// Miscellaneous utilities

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
    // TODO: Having to load as a string is unfortunate, but it seems to be
    // required to avoid cross-compartment weirdness (views can't be created
    // from cross-compartment ArrayBuffers, I guess?).

    let data = xhr.responseText;
    let window = aWindow.wrappedJSObject;
    let arrayBuffer = new window.ArrayBuffer(data.length);
    let view = new window.Uint8Array(arrayBuffer);
    for (let i = 0; i < data.length; i++)
      view[i] = data.charCodeAt(i);

    fireEventTo(evt.type, arrayBuffer, aWindow);
  };

  xhr.open('GET', aDocumentUrl);
  xhr.overrideMimeType('text/plain; charset=x-user-defined');
  xhr.send(null);
}

// The Web progress listener

let PDFWebProgressListener = {
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
  },

  onStatusChange: function onStatusChange(aWebProgress, aRequest, aStatus,
                                          aMessage) {
  },

  onSecurityChange: function onSecurityChange(aWebProgress, aRequest, aState) {
  },

  QueryInterface: function QueryInterface(aIID) {
    // TODO: Use XPCOMUtils.generateQI()?
    if (aIID.equals(Ci.nsIWebProgressListener) ||
        aIID.equals(Ci.nsISupportsWeakReference) ||
        aIID.equals(Ci.nsISupports)) {
        return this;
    }

    throw Cr.NS_ERROR_NO_INTERFACE;
  }
};


// The content handler

function PDFContentHandler() {
}

PDFContentHandler.prototype = {
  handleContent: function handleContent(aMimetype, aContext, aRequest) {
    if (aMimetype != PDF_CONTENT_TYPE || !(aRequest instanceof Ci.nsIChannel))
      throw Cr.NS_ERROR_WONT_HANDLE_CONTENT;

    let callbacks = aRequest.notificationCallbacks ||
                    aRequest.loadGroup.notificationCallbacks;
    if (!callbacks)
      return;

    aRequest.cancel(Cr.NS_BINDING_ABORTED);

    let uri = aRequest.URI;
    let window = callbacks.getInterface(Ci.nsIDOMWindow);
    PDFWebProgressListener.init(window, uri.spec);

    window.location = viewerURL;
  },

  classDescription: "pdf.js content handler",
  classID: Components.ID('{506c40f4-5fe1-4a6c-aeaf-d98004ff5153}'),
  contractID: "@mozilla.org/uriloader/content-handler;1?type=application/pdf",
  QueryInterface: XPCOMUtils.generateQI([ Ci.nsIContentHandler ])
};


// Initialization code

let factory = XPCOMUtils.generateNSGetFactory([ PDFContentHandler ]);

let registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
registrar.registerFactory(PDFContentHandler.prototype.classID,
                          "PDFContentHandler",
                          PDFContentHandler.prototype.contractID,
                          factory(PDFContentHandler.prototype.classID));

