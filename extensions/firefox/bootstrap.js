/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

const EXT_PREFIX = 'extensions.uriloader@pdf.js';
const PDFJS_EVENT_ID = 'pdf.js.message';
let Cc = Components.classes;
let Ci = Components.interfaces;
let Cm = Components.manager;
let Cu = Components.utils;
let application = Cc['@mozilla.org/fuel/application;1']
                    .getService(Ci.fuelIApplication);
let privateBrowsing = Cc['@mozilla.org/privatebrowsing;1']
                        .getService(Ci.nsIPrivateBrowsingService);

Cu.import('resource://gre/modules/Services.jsm');

function log(str) {
  dump(str + '\n');
}
// watchWindows() and unload() are from Ed Lee's examples at
// https://github.com/Mardak/restartless/blob/watchWindows/bootstrap.js
/**
 * Apply a callback to each open and new browser windows.
 *
 * @param {function} callback 1-parameter function that gets a browser window.
 */
function watchWindows(callback) {
  // Wrap the callback in a function that ignores failures
  function watcher(window) {
    try {
      // Now that the window has loaded, only handle browser windows
      let {documentElement} = window.document;
      if (documentElement.getAttribute('windowtype') == 'navigator:browser')
        callback(window);
    }
    catch (ex) {}
  }

  // Wait for the window to finish loading before running the callback
  function runOnLoad(window) {
    // Listen for one load event before checking the window type
    window.addEventListener('load', function runOnce() {
      window.removeEventListener('load', runOnce, false);
      watcher(window);
    }, false);
  }

  // Add functionality to existing windows
  let windows = Services.wm.getEnumerator(null);
  while (windows.hasMoreElements()) {
    // Only run the watcher immediately if the window is completely loaded
    let window = windows.getNext();
    if (window.document.readyState == 'complete')
      watcher(window);
    // Wait for the window to load before continuing
    else
      runOnLoad(window);
  }

  // Watch for new browser windows opening then wait for it to load
  function windowWatcher(subject, topic) {
    if (topic == 'domwindowopened')
      runOnLoad(subject);
  }
  Services.ww.registerNotification(windowWatcher);

  // Make sure to stop watching for windows if we're unloading
  unload(function() Services.ww.unregisterNotification(windowWatcher));
}

/**
 * Save callbacks to run when unloading. Optionally scope the callback to a
 * container, e.g., window. Provide a way to run all the callbacks.
 *
 * @param {function} callback 0-parameter function to call on unload.
 * @param {node} container Remove the callback when this container unloads.
 * @return {function} A 0-parameter function that undoes adding the callback.
 */
function unload(callback, container) {
  // Initialize the array of unloaders on the first usage
  let unloaders = unload.unloaders;
  if (unloaders == null)
    unloaders = unload.unloaders = [];

  // Calling with no arguments runs all the unloader callbacks
  if (callback == null) {
    unloaders.slice().forEach(function(unloader) unloader());
    unloaders.length = 0;
    return;
  }

  // The callback is bound to the lifetime of the container if we have one
  if (container != null) {
    // Remove the unloader when the container unloads
    container.addEventListener('unload', removeUnloader, false);

    // Wrap the callback to additionally remove the unload listener
    let origCallback = callback;
    callback = function() {
      container.removeEventListener('unload', removeUnloader, false);
      origCallback();
    }
  }

  // Wrap the callback in a function that ignores failures
  function unloader() {
    try {
      callback();
    }
    catch (ex) {}
  }
  unloaders.push(unloader);

  // Provide a way to remove the unloader
  function removeUnloader() {
    let index = unloaders.indexOf(unloader);
    if (index != -1)
      unloaders.splice(index, 1);
  }
  return removeUnloader;
}

function messageCallback(event) {
  log(event.target.ownerDocument.currentScript);
  var message = event.target, doc = message.ownerDocument;
  var inPrivateBrowswing = privateBrowsing.privateBrowsingEnabled;
  // Verify the message came from a PDF.
  // TODO
  var action = message.getUserData('action');
  var data = message.getUserData('data');
  switch (action) {
    case 'download':
      Services.wm.getMostRecentWindow('navigator:browser').saveURL(data);
      break;
    case 'setDatabase':
      if (inPrivateBrowswing)
        return;
      application.prefs.setValue(EXT_PREFIX + '.database', data);
      break;
    case 'getDatabase':
      var response;
      if (inPrivateBrowswing)
        response = '{}';
      else
        response = application.prefs.getValue(EXT_PREFIX + '.database', '{}');
      message.setUserData('response', response, null);
      break;
  }
}


// All the boostrap functions:
function startup(aData, aReason) {
  let manifestPath = 'chrome.manifest';
  let manifest = Cc['@mozilla.org/file/local;1']
                   .createInstance(Ci.nsILocalFile);
  try {
    manifest.initWithPath(aData.installPath.path);
    manifest.append(manifestPath);
    Cm.QueryInterface(Ci.nsIComponentRegistrar).autoRegister(manifest);
    Services.prefs.setBoolPref('extensions.pdf.js.active', true);
  } catch (e) {
    log(e);
  }

  watchWindows(function(window) {
    window.addEventListener(PDFJS_EVENT_ID, messageCallback, false, true);
    unload(function() {
      window.removeEventListener(PDFJS_EVENT_ID, messageCallback, false, true);
    });
  });
}

function shutdown(aData, aReason) {
  if (Services.prefs.getBoolPref('extensions.pdf.js.active')) {
    Services.prefs.setBoolPref('extensions.pdf.js.active', false);
    // Clean up with unloaders when we're deactivating
    if (aReason != APP_SHUTDOWN)
      unload();
  }
}

function install(aData, aReason) {
  Services.prefs.setBoolPref('extensions.pdf.js.active', false);
}

function uninstall(aData, aReason) {
  Services.prefs.clearUserPref('extensions.pdf.js.active');
  application.prefs.setValue(EXT_PREFIX + '.database', '{}');
}

