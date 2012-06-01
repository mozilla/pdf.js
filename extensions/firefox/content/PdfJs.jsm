var EXPORTED_SYMBOLS = ["PdfJs"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cm = Components.manager;
const Cu = Components.utils;

const PREF_PREFIX = 'pdfjs';
const PREF_ENABLED = PREF_PREFIX + '.enabled';
const PREF_FIRST_RUN = PREF_PREFIX + '.firstRun';
const PREF_PREVIOUS_ACTION = PREF_PREFIX + '.previousAction';
const PREF_PREVIOUS_ASK = PREF_PREFIX + '.previousAsk';
const PDFJS_HANDLER_CHANGED = 'pdfjs:handlerChanged';

Cu.import('resource://gre/modules/Services.jsm');
Cu.import('resource://pdf.js.components/PdfStreamConverter.js');

let mimeService = Cc["@mozilla.org/mime;1"]
                    .getService(Ci.nsIMIMEService);

function getBoolPref(pref, def) {
  try {
    return Services.prefs.getBoolPref(pref);
  } catch (ex) {
    return def;
  }
}

// Register/unregister a class as a component.
let Factory = {
  registrar: null,
  aClass: null,
  register: function(aClass) {
    if (this.aClass) {
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

let PdfJs = {
  _registered: false,
  init: function() {
    // On first run make pdf.js the default handler.
    if (getBoolPref(PREF_ENABLED, false) && getBoolPref(PREF_FIRST_RUN, false)) {
      Services.prefs.setBoolPref(PREF_FIRST_RUN, false);

      let handlerService = Cc['@mozilla.org/uriloader/handler-service;1'].
                            getService(Ci.nsIHandlerService);
      let handlerInfo = mimeService.getFromTypeAndExtension('application/pdf', 'pdf');

      // Store the previous settings of preferredAction and
      // alwaysAskBeforeHandling in case we need to fall back to it.
      Services.prefs.setIntPref(PREF_PREVIOUS_ACTION, handlerInfo.preferredAction);
      Services.prefs.setBoolPref(PREF_PREVIOUS_ASK, handlerInfo.alwaysAskBeforeHandling);

      // Change and save mime handler settings.
      handlerInfo.alwaysAskBeforeHandling = false;
      handlerInfo.preferredAction = Ci.nsIHandlerInfo.handleInternally;
      handlerService.store(handlerInfo);
    }

    if (this.enabled)
      this._register();
    else
      this._unregister();

    // Listen for when pdf.js is completely disabled or a different pdf handler
    // is chosen.
    Services.prefs.addObserver(PREF_ENABLED, this, false);
    Services.obs.addObserver(this, PDFJS_HANDLER_CHANGED, false);
  },
  observe: function(subject, topic, data) {
    if (topic != 'nsPref:changed' && topic != PDFJS_HANDLER_CHANGED)
      return;

    if (this.enabled)
      this._register();
    else
      this._unregister();
  },
  // pdf.js is only enabled if we're both selected as the pdf viewer and if the 
  // global switch enabling it is true.
  get enabled() {
    var handlerInfo = mimeService.
                        getFromTypeAndExtension('application/pdf', 'pdf');

    var selectedAsHandler = handlerInfo && (handlerInfo.alwaysAskBeforeHandling == false &&
           handlerInfo.preferredAction == Ci.nsIHandlerInfo.handleInternally);
    return getBoolPref(PREF_ENABLED, false) && selectedAsHandler;
  },
  _register: function() {
    if (this._registered)
      return;

    Factory.register(PdfStreamConverter);
    this._registered = true;
  },
  _unregister: function() {
    if (!this._registered)
      return;

    Factory.unregister();
    this._registered = false;
  }
};
