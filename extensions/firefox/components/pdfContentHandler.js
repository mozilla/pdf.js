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

function pdfContentHandler() {
}

pdfContentHandler.prototype = {
  handleContent: function handleContent(aMimetype, aContext, aRequest) {
    if (aMimetype != PDF_CONTENT_TYPE)
      throw Cr.NS_ERROR_WONT_HANDLE_CONTENT;

    if (!(aRequest instanceof Ci.nsIChannel))
      throw Cr.NS_ERROR_WONT_HANDLE_CONTENT;

    let window = null;
    let callbacks = aRequest.notificationCallbacks ||
                    aRequest.loadGroup.notificationCallbacks;
    if (!callbacks)
      return;

    aRequest.cancel(Cr.NS_BINDING_ABORTED);
    let uri = aRequest.URI;

    try {
      let url = Services.prefs.getCharPref('extensions.pdf.js.url');
      url = url.replace('%s', uri.spec);

      window = callbacks.getInterface(Ci.nsIDOMWindow);
      window.location = url;
    } catch (e) {
      log('Error retrieving the pdf.js base url - ' + e);
    }
  },

  classID: Components.ID('{2278dfd0-b75c-11e0-8257-1ba3d93c9f1a}'),
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIContentHandler])
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([pdfContentHandler]);

