var EXPORTED_SYMBOLS = ["PdfJs"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cm = Components.manager;
const Cu = Components.utils;

const PREF_PREFIX = 'pdfjs';
const PREF_ENABLED = PREF_PREFIX + '.enabled';
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
      dump('Cannot register more than one class');
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
      dump('Class was never registered.');
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
  // global switch enabling us is true.
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
