/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* jshint esnext:true */
/* globals Components, Services, XPCOMUtils, NetUtil, dump */

'use strict';

var EXPORTED_SYMBOLS = ['PdfRedirector'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

const PDF_CONTENT_TYPE = 'application/pdf';
const FIREFOX_ID = '{ec8030f7-c20a-464f-9b0e-13a3a9e97384}';

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
Cu.import('resource://gre/modules/Services.jsm');
Cu.import('resource://gre/modules/NetUtil.jsm');


function getDOMWindow(aChannel) {
  var requestor = aChannel.notificationCallbacks ?
                  aChannel.notificationCallbacks :
                  aChannel.loadGroup.notificationCallbacks;
  var win = requestor.getInterface(Components.interfaces.nsIDOMWindow);
  return win;
}

function getObjectUrl(window) {
  var url;
  var element = window.frameElement;
  var isOverlay = false;
  var params = {};
  if (element) {
    var tagName = element.nodeName;
    while (tagName != 'EMBED' && tagName != 'OBJECT') {
      // plugin overlay skipping until the target plugin is found
      isOverlay = true;
      element = element.parentNode;
      if (!element)
        throw 'Plugin element is not found';
      tagName = element.nodeName;
    }
    if (tagName == 'EMBED') {
      for (var i = 0; i < element.attributes.length; ++i) {
        params[element.attributes[i].localName] = element.attributes[i].value;
      }
      url = params.src;
    } else {
      for (var i = 0; i < element.childNodes.length; ++i) {
        var paramElement = element.childNodes[i];
        if (paramElement.nodeType != Ci.nsIDOMNode.ELEMENT_NODE ||
            paramElement.nodeName != 'PARAM') {
          continue;
        }

        params[paramElement.getAttribute('name')] =
          paramElement.getAttribute('value');
      }
      var dataAttribute = element.getAttribute('data');
      url = dataAttribute || params.movie || params.src;
    }
  }
  if (!url) {
    return url; // src is not specified
  }

  var element = window.frameElement;
  // XXX base uri?
  var baseUri = !element ? null :
    Services.io.newURI(element.ownerDocument.location.href, null, null);

  return Services.io.newURI(url, null, baseUri).spec;
}

function PdfRedirector() {
}

PdfRedirector.prototype = {

  // properties required for XPCOM registration:
  classID: Components.ID('{8cbfd8d0-2042-4976-b3ef-d9dee1efb975}'),
  classDescription: 'pdf.js Redirector',
  contractID:
    '@mozilla.org/streamconv;1?from=application/x-moz-playpreview-pdfjs&to=*/*',

  QueryInterface: XPCOMUtils.generateQI([
      Ci.nsIStreamConverter,
      Ci.nsIStreamListener,
      Ci.nsIRequestObserver
  ]),

  // nsIStreamConverter::convert
  convert: function(aFromStream, aFromType, aToType, aCtxt) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  // nsIStreamConverter::asyncConvertData
  asyncConvertData: function(aFromType, aToType, aListener, aCtxt) {
    // Store the listener passed to us
    this.listener = aListener;
  },

  // nsIStreamListener::onDataAvailable
  onDataAvailable: function(aRequest, aContext, aInputStream, aOffset, aCount) {
    // Do nothing since all the data loading is handled by the viewer.
  },

  // nsIRequestObserver::onStartRequest
  onStartRequest: function(aRequest, aContext) {
    // Setup the request so we can use it below.
    aRequest.QueryInterface(Ci.nsIChannel);
    // Cancel the request so the viewer can handle it.
    aRequest.cancel(Cr.NS_BINDING_ABORTED);

    var domWindow = getDOMWindow(aRequest);
    var pdfUrl = getObjectUrl(domWindow);
    if (!pdfUrl) {
      Services.console.logStringMessage(
        'PdfRedirector.js: PDF location is not specified for OBJECT/EMBED tag');
      return;
    }

    // Create a new channel that is viewer loaded as a resource.
    var ioService = Services.io;
    var channel = ioService.newChannel(pdfUrl, null, null);

    channel.loadGroup = aRequest.loadGroup;

    channel.asyncOpen(this.listener, aContext);
  },

  // nsIRequestObserver::onStopRequest
  onStopRequest: function(aRequest, aContext, aStatusCode) {
    // Do nothing
  }
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([PdfRedirector]);
