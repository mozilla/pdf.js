/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* Copyright 2013 Mozilla Foundation
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

/* globals chrome, PDFJS, PDFViewerApplication */
'use strict';

var ChromeCom = (function ChromeComClosure() {
  var ChromeCom = {};
  /**
   * Creates an event that the extension is listening for and will
   * asynchronously respond by calling the callback.
   *
   * @param {String} action The action to trigger.
   * @param {String} data Optional data to send.
   * @param {Function} callback Optional response callback that will be called
   * with one data argument. When the request cannot be handled, the callback
   * is immediately invoked with no arguments.
   */
  ChromeCom.request = function ChromeCom_request(action, data, callback) {
    var message = {
      action: action,
      data: data
    };
    if (!chrome.runtime) {
      console.error('chrome.runtime is undefined.');
      if (callback) {
        callback();
      }
    } else if (callback) {
      chrome.runtime.sendMessage(message, callback);
    } else {
      chrome.runtime.sendMessage(message);
    }
  };

  /**
   * Opens a PDF file with the PDF viewer.
   *
   * @param {String} file Absolute URL of PDF file.
   */
  ChromeCom.openPDFFile = function ChromeCom_openPDFFile(file) {
    // Expand drive:-URLs to filesystem URLs (Chrome OS)
    file = file.replace(/^drive:/i,
        'filesystem:' + location.origin + '/external/');

    ChromeCom.request('getPDFStream', file, function(response) {
      if (response) {
        // We will only get a response when the streamsPrivate API is available.

        var isFTPFile = /^ftp:/i.test(file);
        var streamUrl = response.streamUrl;
        if (streamUrl) {
          console.log('Found data stream for ' + file);
          PDFViewerApplication.open(streamUrl, 0, undefined, undefined, {
            length: response.contentLength
          });
          PDFViewerApplication.setTitleUsingUrl(file);
          return;
        }
        if (isFTPFile && !response.extensionSupportsFTP) {
          // Stream not found, and it's loaded from FTP.
          // When the browser does not support loading ftp resources over
          // XMLHttpRequest, just reload the page.
          // NOTE: This will not lead to an infinite redirect loop, because
          // if the file exists, then the streamsPrivate API will capture the
          // stream and send back the response. If the stream does not exist,
          // a "Webpage not available" error will be shown (not the PDF Viewer).
          location.replace(file);
          return;
        }
      }
      if (/^filesystem:/.test(file) && !PDFJS.disableWorker) {
        // The security origin of filesystem:-URLs are not preserved when the
        // URL is passed to a Web worker, (http://crbug.com/362061), so we have
        // to create an intermediate blob:-URL as a work-around.
        var resolveLocalFileSystemURL = window.resolveLocalFileSystemURL ||
                                        window.webkitResolveLocalFileSystemURL;
        resolveLocalFileSystemURL(file, function onResolvedFSURL(fileEntry) {
          fileEntry.file(function(fileObject) {
            var blobUrl = URL.createObjectURL(fileObject);
            PDFViewerApplication.open(blobUrl, 0, undefined, undefined, {
              length: fileObject.size
            });
          });
        }, function onFileSystemError(error) {
          // This should not happen. When it happens, just fall back to the
          // usual way of getting the File's data (via the Web worker).
          console.warn('Cannot resolve file ' + file + ', ' + error.name + ' ' +
                       error.message);
          PDFViewerApplication.open(file, 0);
        });
        return;
      }
      if (/^https?:/.test(file)) {
        // Assumption: The file being opened is the file that was requested.
        // There is no UI to input a different URL, so this assumption will hold
        // for now.
        setReferer(file, function() {
          PDFViewerApplication.open(file, 0);
        });
        return;
      }
      PDFViewerApplication.open(file, 0);
    });
  };

  // This port is used for several purposes:
  // 1. When disconnected, the background page knows that the frame has unload.
  // 2. When the referrer was saved in history.state.chromecomState, it is sent
  //    to the background page.
  // 3. When the background page knows the referrer of the page, the referrer is
  //    saved in history.state.chromecomState.
  var port;
  // Set the referer for the given URL.
  // 0. Background: If loaded via a http(s) URL: Save referer.
  // 1. Page -> background: send URL and referer from history.state
  // 2. Background: Bind referer to URL (via webRequest).
  // 3. Background -> page: Send latest referer and save to history.
  // 4. Page: Invoke callback.
  function setReferer(url, callback) {
    if (!port) {
      // The background page will accept the port, and keep adding the Referer
      // request header to requests to |url| until the port is disconnected.
      port = chrome.runtime.connect({name: 'chromecom-referrer'});
    }
    port.onDisconnect.addListener(onDisconnect);
    port.onMessage.addListener(onMessage);
    // Initiate the information exchange.
    port.postMessage({
      referer: window.history.state && window.history.state.chromecomState,
      requestUrl: url
    });

    function onMessage(referer) {
      if (referer) {
        // The background extracts the Referer from the initial HTTP request for
        // the PDF file. When the viewer is reloaded or when the user navigates
        // back and forward, the background page will not observe a HTTP request
        // with Referer. To make sure that the Referer is preserved, store it in
        // history.state, which is preserved accross reloads/navigations.
        var state = window.history.state || {};
        state.chromecomState = referer;
        window.history.replaceState(state, '');
      }
      onCompleted();
    }
    function onDisconnect() {
      // When the connection fails, ignore the error and call the callback.
      port = null;
      onCompleted();
    }
    function onCompleted() {
      port.onDisconnect.removeListener(onDisconnect);
      port.onMessage.removeListener(onMessage);
      callback();
    }
  }

  return ChromeCom;
})();
