var EXPORTED_SYMBOLS = ["PdfJs"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cm = Components.manager;
const Cu = Components.utils;

const PREF_PREFIX = 'pdfjs';
const PREF_DISABLED = PREF_PREFIX + '.disabled';
const PREF_FIRST_RUN = PREF_PREFIX + '.firstRun';
const PREF_PREVIOUS_ACTION = PREF_PREFIX + '.previousHandler.preferredAction';
const PREF_PREVIOUS_ASK = PREF_PREFIX + '.previousHandler.alwaysAskBeforeHandling';
const TOPIC_PDFJS_HANDLER_CHANGED = 'pdfjs:handlerChanged';

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
Cu.import('resource://gre/modules/Services.jsm');
Cu.import('resource://pdf.js.components/PdfStreamConverter.js');

let Svc = {};
XPCOMUtils.defineLazyServiceGetter(Svc, 'mime',
                                   '@mozilla.org/mime;1',
                                   'nsIMIMEService');

function getBoolPref(aPref, aDefaultValue) {
  try {
    return Services.prefs.getBoolPref(aPref);
  } catch (ex) {
    return aDefaultValue;
  }
}

// Register/unregister a constructor as a component.
let Factory = {
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
    // On first run make pdf.js the default handler.
    if (!getBoolPref(PREF_DISABLED, true) && getBoolPref(PREF_FIRST_RUN, false)) {
      Services.prefs.setBoolPref(PREF_FIRST_RUN, false);

      let handlerInfo = Svc.mime.getFromTypeAndExtension('application/pdf', 'pdf');
      // Store the previous settings of preferredAction and
      // alwaysAskBeforeHandling in case we need to revert them in a hotfix that
      // would turn pdf.js off.
      Services.prefs.setIntPref(PREF_PREVIOUS_ACTION, handlerInfo.preferredAction);
      Services.prefs.setBoolPref(PREF_PREVIOUS_ASK, handlerInfo.alwaysAskBeforeHandling);

      let handlerService = Cc['@mozilla.org/uriloader/handler-service;1'].
                           getService(Ci.nsIHandlerService);

      // Change and save mime handler settings.
      handlerInfo.alwaysAskBeforeHandling = false;
      handlerInfo.preferredAction = Ci.nsIHandlerInfo.handleInternally;
      handlerService.store(handlerInfo);
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
           handlerInfo.preferredAction == Ci.nsIHandlerInfo.handleInternally;
  },

  _ensureRegistered: function _ensureRegistered() {
    if (this._registered)
      return;

    Factory.register(PdfStreamConverter);
    this._registered = true;
  },

  _ensureUnregistered: function _ensureUnregistered() {
    if (!this._registered)
      return;

    Factory.unregister();
    this._registered = false;
  }
};
