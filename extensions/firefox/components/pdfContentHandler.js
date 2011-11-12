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

    if (!Services.prefs.getBoolPref('extensions.pdf.js.active'))
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
    } catch (e) {
      log('Error retrieving the pdf.js base url - ' + e);
      throw NS_ERROR_WONT_HANDLE_CONTENT;
    }

    let targetUrl = aRequest.URI.spec;
    if (targetUrl.indexOf('#pdfjs.action=download') >= 0)
      throw NS_ERROR_WONT_HANDLE_CONTENT;

    aRequest.cancel(Cr.NS_BINDING_ABORTED);
    window.location = url.replace('%s', encodeURIComponent(targetUrl));
  },

  classID: Components.ID('{2278dfd0-b75c-11e0-8257-1ba3d93c9f1a}'),
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIContentHandler])
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([pdfContentHandler]);

