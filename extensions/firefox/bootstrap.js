/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

const RESOURCE_NAME = 'pdf.js';
const EXT_PREFIX = 'extensions.uriloader@pdf.js';

let Cc = Components.classes;
let Ci = Components.interfaces;
let Cm = Components.manager;
let Cu = Components.utils;

Cu.import('resource://gre/modules/Services.jsm');

function log(str) {
  dump(str + '\n');
}

// Register/unregister a class as a component.
let Factory = {
  registrar: null,
  aClass: null,
  register: function(aClass) {
    if (this.aClass) {
      log('Cannot register more than one class');
      return;
    }
    this.registrar = Cm.QueryInterface(Ci.nsIComponentRegistrar);
    this.aClass = aClass;
    var proto = aClass.prototype;
    this.registrar.registerFactory(proto.classID, proto.classDescription,
      proto.contractID, this);
  },
  unregister: function() {
    if (!this.aClass) {
      log('Class was never registered.');
      return;
    }
    var proto = this.aClass.prototype;
    this.registrar.unregisterFactory(proto.classID, this);
    this.aClass = null;
  },
  // nsIFactory::createInstance
  createInstance: function(outer, iid) {
    if (outer !== null)
      throw Cr.NS_ERROR_NO_AGGREGATION;
    return (new (this.aClass)).QueryInterface(iid);
  }
};

let pdfStreamConverterUrl = null;

// As of Firefox 13 bootstrapped add-ons don't support automatic registering and
// unregistering of resource urls and components/contracts. Until then we do
// it programatically. See ManifestDirective ManifestParser.cpp for support.

function startup(aData, aReason) {
  // Setup the resource url.
  var ioService = Services.io;
  var resProt = ioService.getProtocolHandler('resource')
                  .QueryInterface(Ci.nsIResProtocolHandler);
  var aliasFile = Cc['@mozilla.org/file/local;1']
                    .createInstance(Ci.nsILocalFile);
  var componentPath = aData.installPath.clone();
  componentPath.append('content');
  aliasFile.initWithPath(componentPath.path);
  var aliasURI = ioService.newFileURI(aliasFile);
  resProt.setSubstitution(RESOURCE_NAME, aliasURI);

  // Load the component and register it.
  pdfStreamConverterUrl = aData.resourceURI.spec +
                          'components/PdfStreamConverter.js';
  Cu.import(pdfStreamConverterUrl);
  Factory.register(PdfStreamConverter);
  Services.prefs.setBoolPref('extensions.pdf.js.active', true);
}

function shutdown(aData, aReason) {
  if (Services.prefs.getBoolPref('extensions.pdf.js.active'))
    Services.prefs.setBoolPref('extensions.pdf.js.active', false);
  var ioService = Services.io;
  var resProt = ioService.getProtocolHandler('resource')
                  .QueryInterface(Ci.nsIResProtocolHandler);
  // Remove the resource url.
  resProt.setSubstitution(RESOURCE_NAME, null);
  // Remove the contract/component.
  Factory.unregister();
  // Unload the converter
  if (pdfStreamConverterUrl) {
    Cu.unload(pdfStreamConverterUrl);
    pdfStreamConverterUrl = null;
  }
}

function install(aData, aReason) {
  Services.prefs.setBoolPref('extensions.pdf.js.active', false);
}

function uninstall(aData, aReason) {
  Services.prefs.clearUserPref('extensions.pdf.js.active');
  application.prefs.setValue(EXT_PREFIX + '.database', '{}');
}

