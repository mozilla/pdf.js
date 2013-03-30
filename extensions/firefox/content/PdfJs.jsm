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

var EXPORTED_SYMBOLS = ["PdfJs"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cm = Components.manager;
const Cu = Components.utils;

const PREF_PREFIX = 'pdfjs';
const PREF_DISABLED = PREF_PREFIX + '.disabled';
const PREF_MIGRATION_VERSION = PREF_PREFIX + '.migrationVersion';
const PREF_PREVIOUS_ACTION = PREF_PREFIX + '.previousHandler.preferredAction';
const PREF_PREVIOUS_ASK = PREF_PREFIX + '.previousHandler.alwaysAskBeforeHandling';
const PREF_DISABLED_PLUGIN_TYPES = 'plugin.disable_full_page_plugin_for_types';
const TOPIC_PDFJS_HANDLER_CHANGED = 'pdfjs:handlerChanged';
const PDF_CONTENT_TYPE = 'application/pdf';

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
Cu.import('resource://gre/modules/Services.jsm');
Cu.import('resource://pdf.js.components/PdfStreamConverter.js');
Cu.import('resource://pdf.js.components/PdfRedirector.js');

let Svc = {};
XPCOMUtils.defineLazyServiceGetter(Svc, 'mime',
                                   '@mozilla.org/mime;1',
                                   'nsIMIMEService');
XPCOMUtils.defineLazyServiceGetter(Svc, 'pluginHost',
                                   '@mozilla.org/plugin/host;1',
                                   'nsIPluginHost');

function getBoolPref(aPref, aDefaultValue) {
  try {
    return Services.prefs.getBoolPref(aPref);
  } catch (ex) {
    return aDefaultValue;
  }
}

function getIntPref(aPref, aDefaultValue) {
  try {
    return Services.prefs.getIntPref(aPref);
  } catch (ex) {
    return aDefaultValue;
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
    return (new (this._targetConstructor)).QueryInterface(iid);
  },

  // nsIFactory
  lockFactory: function lockFactory(lock) { 
    // No longer used as of gecko 1.7.
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  }
};

let PdfJs = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver]),
  _registered: false,

  init: function init() {
    if (!getBoolPref(PREF_DISABLED, true)) {
      this._migrate();
    }

    if (this.enabled)
      this._ensureRegistered();
    else
      this._ensureUnregistered();

    // Listen for when pdf.js is completely disabled or a different pdf handler
    // is chosen.
    Services.prefs.addObserver(PREF_DISABLED, this, false);
    Services.obs.addObserver(this, TOPIC_PDFJS_HANDLER_CHANGED, false);
  },

  _migrate: function migrate() {
    const VERSION = 1;
    var currentVersion = getIntPref(PREF_MIGRATION_VERSION, 0);
    if (currentVersion >= VERSION) {
      return;
    }
    // Make pdf.js the default pdf viewer on the first migration.
    if (currentVersion < 2) {
      this._becomeHandler();
    }
    Services.prefs.setIntPref(PREF_MIGRATION_VERSION, VERSION);
  },

  _becomeHandler: function _becomeHandler() {
    let handlerInfo = Svc.mime.getFromTypeAndExtension(PDF_CONTENT_TYPE, 'pdf');
    let prefs = Services.prefs;
    if (handlerInfo.preferredAction !== Ci.nsIHandlerInfo.handleInternally &&
        handlerInfo.preferredAction !== false) {
      // Store the previous settings of preferredAction and
      // alwaysAskBeforeHandling in case we need to revert them in a hotfix that
      // would turn pdf.js off.
      prefs.setIntPref(PREF_PREVIOUS_ACTION, handlerInfo.preferredAction);
      prefs.setBoolPref(PREF_PREVIOUS_ASK, handlerInfo.alwaysAskBeforeHandling);
    }

    let handlerService = Cc['@mozilla.org/uriloader/handler-service;1'].
                         getService(Ci.nsIHandlerService);

    // Change and save mime handler settings.
    handlerInfo.alwaysAskBeforeHandling = false;
    handlerInfo.preferredAction = Ci.nsIHandlerInfo.handleInternally;
    handlerService.store(handlerInfo);

    // Also disable any plugins for pdfs.
    var stringTypes = '';
    var types = [];
    if (prefs.prefHasUserValue(PREF_DISABLED_PLUGIN_TYPES)) {
      stringTypes = prefs.getCharPref(PREF_DISABLED_PLUGIN_TYPES);
    }
    if (stringTypes !== '') {
      types = stringTypes.split(',');
    }

    if (types.indexOf(PDF_CONTENT_TYPE) === -1) {
      types.push(PDF_CONTENT_TYPE);
    }
    prefs.setCharPref(PREF_DISABLED_PLUGIN_TYPES, types.join(','));

    // Update the category manager in case the plugins are already loaded.
    let categoryManager = Cc["@mozilla.org/categorymanager;1"];
    categoryManager.getService(Ci.nsICategoryManager).
                    deleteCategoryEntry("Gecko-Content-Viewers",
                                        PDF_CONTENT_TYPE,
                                        false);
  },

  // nsIObserver
  observe: function observe(aSubject, aTopic, aData) {
    if (this.enabled)
      this._ensureRegistered();
    else
      this._ensureUnregistered();
  },
  
  /**
   * pdf.js is only enabled if it is both selected as the pdf viewer and if the 
   * global switch enabling it is true.
   * @return {boolean} Wether or not it's enabled.
   */
  get enabled() {
    var disabled = getBoolPref(PREF_DISABLED, true);
    if (disabled)
      return false;

    var handlerInfo = Svc.mime.
                        getFromTypeAndExtension('application/pdf', 'pdf');
    return handlerInfo.alwaysAskBeforeHandling == false &&
           handlerInfo.plugin == null &&
           handlerInfo.preferredAction == Ci.nsIHandlerInfo.handleInternally;
  },

  _ensureRegistered: function _ensureRegistered() {
    if (this._registered)
      return;

    this._pdfStreamConverterFactory = new Factory();
    this._pdfStreamConverterFactory.register(PdfStreamConverter);

    this._pdfRedirectorFactory = new Factory();
    this._pdfRedirectorFactory.register(PdfRedirector);
    Svc.pluginHost.registerPlayPreviewMimeType('application/pdf', true,
      'data:application/x-moz-playpreview-pdfjs;,');

    this._registered = true;
  },

  _ensureUnregistered: function _ensureUnregistered() {
    if (!this._registered)
      return;

    this._pdfStreamConverterFactory.unregister();
    delete this._pdfStreamConverterFactory;

    this._pdfRedirectorFactory.unregister;
    delete this._pdfRedirectorFactory;
    Svc.pluginHost.unregisterPlayPreviewMimeType('application/pdf');

    this._registered = false;
  }
};
