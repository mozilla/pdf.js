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

  // properties required for XPCOM registration:
  classID: Components.ID('{2278dfd0-b75c-11e0-8257-1ba3d93c9f1a}'),
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
      return aFromStream;
  },

  // nsIStreamConverter::asyncConvertData
  asyncConvertData: function(aFromType, aToType, aListener, aCtxt) {
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

    // Create a new channel that is viewer loaded as a resource.
    var ioService = Cc['@mozilla.org/network/io-service;1']
                      .getService(Ci.nsIIOService);
    var channel = ioService.newChannel(
                    'resource://pdf.js/web/viewer.html', null, null);
    // Keep the URL the same so the browser sees it as the same.
    channel.originalURI = aRequest.originalURI;
    channel.asyncOpen(this.listener, aContext);

    // Cancel the request so the viewer can handle it.
    aRequest.cancel(Cr.NS_BINDING_ABORTED);
  },

  // nsIRequestObserver::onStopRequest
  onStopRequest: function(aRequest, aContext, aStatusCode) {
    // Do nothing.
    return;
  }
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([pdfContentHandler]);
