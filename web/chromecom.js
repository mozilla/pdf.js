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

/* globals chrome, PDFJS, PDFViewerApplication, OverlayManager */
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
          PDFViewerApplication.open(streamUrl, {
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
            PDFViewerApplication.open(blobUrl, {
              length: fileObject.size
            });
          });
        }, function onFileSystemError(error) {
          // This should not happen. When it happens, just fall back to the
          // usual way of getting the File's data (via the Web worker).
          console.warn('Cannot resolve file ' + file + ', ' + error.name + ' ' +
                       error.message);
          PDFViewerApplication.open(file);
        });
        return;
      }
      if (/^https?:/.test(file)) {
        // Assumption: The file being opened is the file that was requested.
        // There is no UI to input a different URL, so this assumption will hold
        // for now.
        setReferer(file, function() {
          PDFViewerApplication.open(file);
        });
        return;
      }
      if (/^file?:/.test(file)) {
        if (top !== window && !/^file:/i.test(location.ancestorOrigins[0])) {
          PDFViewerApplication.error('Blocked ' + location.ancestorOrigins[0] +
              ' from loading ' + file + '. Refused to load a local file in a ' +
              ' non-local page for security reasons.');
          return;
        }
        isAllowedFileSchemeAccess(function(isAllowedAccess) {
          if (isAllowedAccess) {
            PDFViewerApplication.open(file);
          } else {
            requestAccessToLocalFile(file);
          }
        });
        return;
      }
      PDFViewerApplication.open(file);
    });
  };

  function isAllowedFileSchemeAccess(callback) {
    ChromeCom.request('isAllowedFileSchemeAccess', null, callback);
  }

  function isRuntimeAvailable() {
    try {
      // When the extension is reloaded, the extension runtime is destroyed and
      // the extension APIs become unavailable.
      if (chrome.runtime && chrome.runtime.getManifest()) {
        return true;
      }
    } catch (e) {}
    return false;
  }

  function reloadIfRuntimeIsUnavailable() {
    if (!isRuntimeAvailable()) {
      location.reload();
    }
  }

  var chromeFileAccessOverlayPromise;
  function requestAccessToLocalFile(fileUrl) {
    var onCloseOverlay = null;
    if (top !== window) {
      // When the extension reloads after receiving new permissions, the pages
      // have to be reloaded to restore the extension runtime. Auto-reload
      // frames, because users should not have to reload the whole page just to
      // update the viewer.
      // Top-level frames are closed by Chrome upon reload, so there is no need
      // for detecting unload of the top-level frame. Should this ever change
      // (crbug.com/511670), then the user can just reload the tab.
      window.addEventListener('focus', reloadIfRuntimeIsUnavailable);
      onCloseOverlay = function() {
        window.removeEventListener('focus', reloadIfRuntimeIsUnavailable);
        reloadIfRuntimeIsUnavailable();
        OverlayManager.close('chromeFileAccessOverlay');
      };
    }
    if (!chromeFileAccessOverlayPromise) {
      chromeFileAccessOverlayPromise = OverlayManager.register(
          'chromeFileAccessOverlay', onCloseOverlay, true);
    }
    chromeFileAccessOverlayPromise.then(function() {
      var iconPath = chrome.runtime.getManifest().icons[48];
      document.getElementById('chrome-pdfjs-logo-bg').style.backgroundImage =
        'url(' + chrome.runtime.getURL(iconPath) + ')';

      // Use Chrome's definition of UI language instead of PDF.js's #lang=...,
      // because the shown string should match the UI at chrome://extensions.
      // These strings are from chrome/app/resources/generated_resources_*.xtb.
      var i18nFileAccessLabel =
//#include chrome-i18n-allow-access-to-file-urls.json
        [chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()];

      if (i18nFileAccessLabel) {
        document.getElementById('chrome-file-access-label').textContent =
          i18nFileAccessLabel;
      }

      var link = document.getElementById('chrome-link-to-extensions-page');
      link.href = 'chrome://extensions/?id=' + chrome.runtime.id;
      link.onclick = function(e) {
        // Direct navigation to chrome:// URLs is blocked by Chrome, so we
        // have to ask the background page to open chrome://extensions/?id=...
        e.preventDefault();
        // Open in the current tab by default, because toggling the file access
        // checkbox causes the extension to reload, and Chrome will close all
        // tabs upon reload.
        ChromeCom.request('openExtensionsPageForFileAccess', {
          newTab: e.ctrlKey || e.metaKey || e.button === 1 || window !== top
        });
      };

      // Show which file is being opened to help the user with understanding
      // why this permission request is shown.
      document.getElementById('chrome-url-of-local-file').textContent = fileUrl;

      OverlayManager.open('chromeFileAccessOverlay');
    });
  }

  if (window === top) {
    // Chrome closes all extension tabs (crbug.com/511670) when the extension
    // reloads. To counter this, the tab URL and history state is saved to
    // localStorage and restored by extension-router.js.
    // Unfortunately, the window and tab index are not restored. And if it was
    // the only tab in an incognito window, then the tab is not restored either.
    addEventListener('unload', function() {
      // If the runtime is still available, the unload is most likely a normal
      // tab closure. Otherwise it is most likely an extension reload.
      if (!isRuntimeAvailable()) {
        localStorage.setItem(
          'unload-' + Date.now() + '-' + document.hidden + '-' + location.href,
          JSON.stringify(history.state));
      }
    });
  }

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
      callback();
    }
    function onCompleted() {
      port.onDisconnect.removeListener(onDisconnect);
      port.onMessage.removeListener(onMessage);
      callback();
    }
  }

  return ChromeCom;
})();
