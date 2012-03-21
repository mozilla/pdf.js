/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

const RESOURCE_NAME = 'pdf.js';
const EXT_PREFIX = 'extensions.uriloader@pdf.js';

let Cc = Components.classes;
let Ci = Components.interfaces;
let Cm = Components.manager;
let Cu = Components.utils;
let application = Cc['@mozilla.org/fuel/application;1']
                    .getService(Ci.fuelIApplication);

Cu.import('resource://gre/modules/Services.jsm');

function log(str) {
  if (!application.prefs.getValue(EXT_PREFIX + '.pdfBugEnabled', false))
    return;
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
  var aliasURI = ioService.newURI('content/', 'UTF-8', aData.resourceURI);
  resProt.setSubstitution(RESOURCE_NAME, aliasURI);

  // Load the component and register it.
  pdfStreamConverterUrl = aData.resourceURI.spec +
                          'components/PdfStreamConverter.js';
  Cu.import(pdfStreamConverterUrl);
  Factory.register(PdfStreamConverter);
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
  Factory.unregister();
  // Unload the converter
  Cu.unload(pdfStreamConverterUrl);
  pdfStreamConverterUrl = null;
}

function install(aData, aReason) {
}

function uninstall(aData, aReason) {
  application.prefs.setValue(EXT_PREFIX + '.database', '{}');
}

