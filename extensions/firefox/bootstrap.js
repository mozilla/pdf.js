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
/* globals Components, Services, dump, XPCOMUtils, PdfStreamConverter,
           APP_SHUTDOWN, PdfjsChromeUtils, PdfjsContentUtils,
           DEFAULT_PREFERENCES */

'use strict';

const RESOURCE_NAME = 'pdf.js';
const EXT_PREFIX = 'extensions.uriloader@pdf.js';

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cm = Components.manager;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
Cu.import('resource://gre/modules/Services.jsm');

function getBoolPref(pref, def) {
  try {
    return Services.prefs.getBoolPref(pref);
  } catch (ex) {
    return def;
  }
}

function log(str) {
  if (!getBoolPref(EXT_PREFIX + '.pdfBugEnabled', false)) {
    return;
  }
  dump(str + '\n');
}

function initializeDefaultPreferences() {
//#include ../../web/default_preferences.js

  var defaultBranch = Services.prefs.getDefaultBranch(EXT_PREFIX + '.');
  var defaultValue;
  for (var key in DEFAULT_PREFERENCES) {
    defaultValue = DEFAULT_PREFERENCES[key];
    switch (typeof defaultValue) {
      case 'boolean':
        defaultBranch.setBoolPref(key, defaultValue);
        break;
      case 'number':
        defaultBranch.setIntPref(key, defaultValue);
        break;
      case 'string':
        defaultBranch.setCharPref(key, defaultValue);
        break;
    }
  }
}

// Factory that registers/unregisters a constructor as a component.
function Factory() {}

Factory.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIFactory]),
  _targetConstructor: null,

  register: function register(targetConstructor) {
    this._targetConstructor = targetConstructor;
    var proto = targetConstructor.prototype;
    var registrar = Cm.QueryInterface(Ci.nsIComponentRegistrar);
    registrar.registerFactory(proto.classID, proto.classDescription,
                              proto.contractID, this);

    if (proto.classID2) {
      this._classID2 = proto.classID2;
      registrar.registerFactory(proto.classID2, proto.classDescription,
                                proto.contractID2, this);
    }
  },

  unregister: function unregister() {
    var proto = this._targetConstructor.prototype;
    var registrar = Cm.QueryInterface(Ci.nsIComponentRegistrar);
    registrar.unregisterFactory(proto.classID, this);
    if (this._classID2) {
      registrar.unregisterFactory(this._classID2, this);
    }
    this._targetConstructor = null;
  },

  // nsIFactory
  createInstance: function createInstance(aOuter, iid) {
    if (aOuter !== null) {
      throw Cr.NS_ERROR_NO_AGGREGATION;
    }
    return (new (this._targetConstructor)()).QueryInterface(iid);
  },

  // nsIFactory
  lockFactory: function lockFactory(lock) {
    // No longer used as of gecko 1.7.
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  }
};

var pdfStreamConverterFactory = new Factory();
var pdfBaseUrl = null;
var e10sEnabled = false;

// As of Firefox 13 bootstrapped add-ons don't support automatic registering and
// unregistering of resource urls and components/contracts. Until then we do
// it programatically. See ManifestDirective ManifestParser.cpp for support.

function startup(aData, aReason) {
  // Setup the resource url.
  var ioService = Services.io;
  var resProt = ioService.getProtocolHandler('resource')
                  .QueryInterface(Ci.nsIResProtocolHandler);
  var aliasURI = ioService.newURI('content/', 'UTF-8', aData.resourceURI);
  resProt.setSubstitution(RESOURCE_NAME, aliasURI);

  pdfBaseUrl = aData.resourceURI.spec;

  Cu.import(pdfBaseUrl + 'content/PdfjsChromeUtils.jsm');
  PdfjsChromeUtils.init();
  Cu.import(pdfBaseUrl + 'content/PdfjsContentUtils.jsm');
  PdfjsContentUtils.init();

  // Load the component and register it.
  var pdfStreamConverterUrl = pdfBaseUrl + 'content/PdfStreamConverter.jsm';
  Cu.import(pdfStreamConverterUrl);
  pdfStreamConverterFactory.register(PdfStreamConverter);

  try {
    let globalMM = Cc['@mozilla.org/globalmessagemanager;1']
                     .getService(Ci.nsIFrameScriptLoader);
    globalMM.loadFrameScript('chrome://pdf.js/content/content.js', true);
    e10sEnabled = true;
  } catch (ex) {
  }

  initializeDefaultPreferences();
}

function shutdown(aData, aReason) {
  if (aReason === APP_SHUTDOWN) {
    return;
  }

  if (e10sEnabled) {
    let globalMM = Cc['@mozilla.org/globalmessagemanager;1']
                     .getService(Ci.nsIMessageBroadcaster);
    globalMM.broadcastAsyncMessage('PDFJS:Child:shutdown');
    globalMM.removeDelayedFrameScript('chrome://pdf.js/content/content.js');
  }

  var ioService = Services.io;
  var resProt = ioService.getProtocolHandler('resource')
                  .QueryInterface(Ci.nsIResProtocolHandler);
  // Remove the resource url.
  resProt.setSubstitution(RESOURCE_NAME, null);
  // Remove the contract/component.
  pdfStreamConverterFactory.unregister();
  // Unload the converter
  var pdfStreamConverterUrl = pdfBaseUrl + 'content/PdfStreamConverter.jsm';
  Cu.unload(pdfStreamConverterUrl);

  PdfjsContentUtils.uninit();
  Cu.unload(pdfBaseUrl + 'content/PdfjsContentUtils.jsm');
  PdfjsChromeUtils.uninit();
  Cu.unload(pdfBaseUrl + 'content/PdfjsChromeUtils.jsm');
}

function install(aData, aReason) {
  // TODO remove after some time -- cleanup of unused preferences
  Services.prefs.clearUserPref(EXT_PREFIX + '.database');
}

function uninstall(aData, aReason) {
}
