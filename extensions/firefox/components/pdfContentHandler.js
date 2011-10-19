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

const NS_ERROR_WONT_HANDLE_CONTENT = 0x805d0001;
function pdfContentHandler() {
}

pdfContentHandler.prototype = {
  handleContent: function handleContent(aMimetype, aContext, aRequest) {
    if (aMimetype != PDF_CONTENT_TYPE)
      throw NS_ERROR_WONT_HANDLE_CONTENT;

    if (!(aRequest instanceof Ci.nsIChannel))
      throw NS_ERROR_WONT_HANDLE_CONTENT;

    let window = null;
    let callbacks = aRequest.notificationCallbacks ||
                    aRequest.loadGroup.notificationCallbacks;
    if (!callbacks)
      return;

    window = callbacks.getInterface(Ci.nsIDOMWindow);

    let url = null;
    try {
      url = Services.prefs.getCharPref('extensions.pdf.js.url');
    } catch(e) {
      log('Error retrieving the pdf.js base url - ' + e);
      throw NS_ERROR_WONT_HANDLE_CONTENT;
    }

    // To allow a Download feature we need to ensure pdf.js
    // is not opened again if the request for opening an
    // application/pdf document has been done by itself.
    let location = window.location.toString();
    if (location.indexOf(url.replace('%s', '')) == 0)
      throw NS_ERROR_WONT_HANDLE_CONTENT;

    aRequest.cancel(Cr.NS_BINDING_ABORTED);
    let uri = aRequest.URI;
    window.location = url.replace('%s', uri.spec);
  },

  classID: Components.ID('{2278dfd0-b75c-11e0-8257-1ba3d93c9f1a}'),
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIContentHandler])
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([pdfContentHandler]);

