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

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
Cu.import('resource://gre/modules/Services.jsm');

let application = Cc['@mozilla.org/fuel/application;1']
                    .getService(Ci.fuelIApplication);
let privateBrowsing = Cc['@mozilla.org/privatebrowsing;1']
                        .getService(Ci.nsIPrivateBrowsingService);
let inPrivateBrowswing = privateBrowsing.privateBrowsingEnabled;

function log(aMsg) {
  if (!application.prefs.getValue(EXT_PREFIX + '.pdfBugEnabled', false))
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
    // Protect against something sending tons of data to setDatabase.
    if (data.length > MAX_DATABASE_LENGTH)
      return;
    application.prefs.setValue(EXT_PREFIX + '.database', data);
  },
  getDatabase: function() {
    if (this.inPrivateBrowswing)
      return '{}';
    return application.prefs.getValue(EXT_PREFIX + '.database', '{}');
  },
  pdfBugEnabled: function() {
    return application.prefs.getValue(EXT_PREFIX + '.pdfBugEnabled', false);
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
