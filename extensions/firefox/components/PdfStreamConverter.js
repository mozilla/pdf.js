/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const PDFJS_EVENT_ID = 'pdf.js.message';
const PDF_CONTENT_TYPE = 'application/pdf';
const NS_ERROR_NOT_IMPLEMENTED = 0x80004001;
const EXT_PREFIX = 'extensions.uriloader@pdf.js';

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
Cu.import('resource://gre/modules/Services.jsm');

function log(aMsg) {
  let msg = 'PdfStreamConverter.js: ' + (aMsg.join ? aMsg.join('') : aMsg);
  Cc['@mozilla.org/consoleservice;1'].getService(Ci.nsIConsoleService)
                                     .logStringMessage(msg);
  dump(msg + '\n');
}
let application = Cc['@mozilla.org/fuel/application;1']
                    .getService(Ci.fuelIApplication);
let privateBrowsing = Cc['@mozilla.org/privatebrowsing;1']
                        .getService(Ci.nsIPrivateBrowsingService);
let inPrivateBrowswing = privateBrowsing.privateBrowsingEnabled;

// All the priviledged actions.
function ChromeActions() {
  this.inPrivateBrowswing = privateBrowsing.privateBrowsingEnabled;
}
ChromeActions.prototype = {
  download: function(data) {
    Services.wm.getMostRecentWindow('navigator:browser').saveURL(data);
  },
  setDatabase: function(data) {
    if (this.inPrivateBrowswing)
      return;
    application.prefs.setValue(EXT_PREFIX + '.database', data);
  },
  getDatabase: function() {
    if (this.inPrivateBrowswing)
      return '{}';
    return application.prefs.getValue(EXT_PREFIX + '.database', '{}');
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
    return aFromStream;
  },

  // nsIStreamConverter::asyncConvertData
  asyncConvertData: function(aFromType, aToType, aListener, aCtxt) {
    if (!Services.prefs.getBoolPref('extensions.pdf.js.active'))
      throw NS_ERROR_NOT_IMPLEMENTED;
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
    var ioService = Cc['@mozilla.org/network/io-service;1']
                      .getService(Ci.nsIIOService);
    var channel = ioService.newChannel(
                    'resource://pdf.js/web/viewer.html', null, null);

    // Keep the URL the same so the browser sees it as the same.
    channel.originalURI = aRequest.originalURI;
    channel.asyncOpen(this.listener, aContext);

    // Setup a global listener waiting for the next DOM to be created and verfiy
    // that its the one we want by its URL. When the correct DOM is found create
    // an event listener on that window for the pdf.js events that require
    // chrome priviledges.
    var url = aRequest.originalURI.spec;
    var gb = Services.wm.getMostRecentWindow('navigator:browser');
    var domListener = function domListener(event) {
      var doc = event.originalTarget;
      var win = doc.defaultView;
      if (doc.location.href === url) {
        gb.removeEventListener('DOMContentLoaded', domListener);
        var requestListener = new RequestListener(new ChromeActions());
        win.addEventListener(PDFJS_EVENT_ID, function(event) {
          requestListener.receive(event);
        }, false, true);
      }
    };
    gb.addEventListener('DOMContentLoaded', domListener, false);
  },

  // nsIRequestObserver::onStopRequest
  onStopRequest: function(aRequest, aContext, aStatusCode) {
    // Do nothing.
  }
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([PdfStreamConverter]);
