/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let Cc = Components.classes;
let Ci = Components.interfaces;
let Cm = Components.manager;
let Cu = Components.utils;

Cu.import('resource://gre/modules/Services.jsm');

function log(str) {
  dump(str + '\n');
}

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
}

function shutdown(aData, aReason) {
  if (Services.prefs.getBoolPref('extensions.pdf.js.active'))
    Services.prefs.setBoolPref('extensions.pdf.js.active', false);
}

function install(aData, aReason) {
  let url = 'chrome://pdf.js/content/web/viewer.html?file=%s';
  Services.prefs.setCharPref('extensions.pdf.js.url', url);
  Services.prefs.setBoolPref('extensions.pdf.js.active', false);
}

function uninstall(aData, aReason) {
  Services.prefs.clearUserPref('extensions.pdf.js.url');
  Services.prefs.clearUserPref('extensions.pdf.js.active');
}

