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
/* globals Components, Services, dump, XPCOMUtils, PdfStreamConverter,
           PdfRedirector, APP_SHUTDOWN */

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

var Ph = Cc['@mozilla.org/plugin/host;1'].getService(Ci.nsIPluginHost);
var registerOverlayPreview = 'getPlayPreviewInfo' in Ph;

function getBoolPref(pref, def) {
  try {
    return Services.prefs.getBoolPref(pref);
  } catch (ex) {
    return def;
  }
}

function setStringPref(pref, value) {
  var str = Cc['@mozilla.org/supports-string;1']
              .createInstance(Ci.nsISupportsString);
  str.data = value;
  Services.prefs.setComplexValue(pref, Ci.nsISupportsString, str);
}

function log(str) {
  if (!getBoolPref(EXT_PREFIX + '.pdfBugEnabled', false))
    return;
  dump(str + '\n');
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
  },

  unregister: function unregister() {
    var proto = this._targetConstructor.prototype;
    var registrar = Cm.QueryInterface(Ci.nsIComponentRegistrar);
    registrar.unregisterFactory(proto.classID, this);
    this._targetConstructor = null;
  },

  // nsIFactory
  createInstance: function createInstance(aOuter, iid) {
    if (aOuter !== null)
      throw Cr.NS_ERROR_NO_AGGREGATION;
    return (new (this._targetConstructor)()).QueryInterface(iid);
  },

  // nsIFactory
  lockFactory: function lockFactory(lock) {
    // No longer used as of gecko 1.7.
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  }
};

var pdfStreamConverterUrl = null;
var pdfStreamConverterFactory = new Factory();
var pdfRedirectorUrl = null;
var pdfRedirectorFactory = new Factory();

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

  // Load the component and register it.
  pdfStreamConverterUrl = aData.resourceURI.spec +
                          'components/PdfStreamConverter.js';
  Cu.import(pdfStreamConverterUrl);
  pdfStreamConverterFactory.register(PdfStreamConverter);

  if (registerOverlayPreview) {
    pdfRedirectorUrl = aData.resourceURI.spec +
                       'components/PdfRedirector.js';
    Cu.import(pdfRedirectorUrl);
    pdfRedirectorFactory.register(PdfRedirector);

    Ph.registerPlayPreviewMimeType('application/pdf', true,
      'data:application/x-moz-playpreview-pdfjs;,');
  }
}

function shutdown(aData, aReason) {
  if (aReason == APP_SHUTDOWN)
    return;
  var ioService = Services.io;
  var resProt = ioService.getProtocolHandler('resource')
                  .QueryInterface(Ci.nsIResProtocolHandler);
  // Remove the resource url.
  resProt.setSubstitution(RESOURCE_NAME, null);
  // Remove the contract/component.
  pdfStreamConverterFactory.unregister();
  // Unload the converter
  Cu.unload(pdfStreamConverterUrl);
  pdfStreamConverterUrl = null;

  if (registerOverlayPreview) {
    pdfRedirectorFactory.unregister();
    Cu.unload(pdfRedirectorUrl);
    pdfRedirectorUrl = null;

    Ph.unregisterPlayPreviewMimeType('application/pdf');
  }
}

function install(aData, aReason) {
}

function uninstall(aData, aReason) {
  setStringPref(EXT_PREFIX + '.database', '{}');
}

