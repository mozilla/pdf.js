/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["MockColorPicker"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cm = Components.manager;
const Cu = Components.utils;

const CONTRACT_ID = "@mozilla.org/colorpicker;1";

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

var registrar = Cm.QueryInterface(Ci.nsIComponentRegistrar);
var oldClassID = "", oldFactory = null;
var newClassID = Cc["@mozilla.org/uuid-generator;1"].getService(Ci.nsIUUIDGenerator).generateUUID();
var newFactory = function (window) {
  return {
    createInstance: function(aOuter, aIID) {
      if (aOuter)
        throw Components.results.NS_ERROR_NO_AGGREGATION;
      return new MockColorPickerInstance(window).QueryInterface(aIID);
    },
    lockFactory: function(aLock) {
      throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
    },
    QueryInterface: XPCOMUtils.generateQI([Ci.nsIFactory])
  };
}

this.MockColorPicker = {
  init: function(window) {
    this.reset();
    this.factory = newFactory(window);
    if (!registrar.isCIDRegistered(newClassID)) {
      try {
        oldClassID = registrar.contractIDToCID(CONTRACT_ID);
        oldFactory = Cm.getClassObject(Cc[CONTRACT_ID], Ci.nsIFactory);
      } catch(ex) {
        oldClassID = "";
        oldFactory = null;
        dump("TEST-INFO | can't get colorpicker registered component, " +
             "assuming there is none");
      }
      if (oldClassID != "" && oldFactory != null) {
        registrar.unregisterFactory(oldClassID, oldFactory);
      }
      registrar.registerFactory(newClassID, "", CONTRACT_ID, this.factory);
    }
  },

  reset: function() {
    this.returnColor = "";
    this.showCallback = null;
    this.shown = false;
    this.showing = false;
  },

  cleanup: function() {
    var previousFactory = this.factory;
    this.reset();
    this.factory = null;

    registrar.unregisterFactory(newClassID, previousFactory);
    if (oldClassID != "" && oldFactory != null) {
      registrar.registerFactory(oldClassID, "", CONTRACT_ID, oldFactory);
    }
  }
};

function MockColorPickerInstance(window) {
  this.window = window;
};
MockColorPickerInstance.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIColorPicker]),
  init: function(aParent, aTitle, aInitialColor) {
    this.parent = aParent;
    this.initialColor = aInitialColor;
  },
  initialColor: "",
  parent: null,
  open: function(aColorPickerShownCallback) {
    MockColorPicker.showing = true;
    MockColorPicker.shown = true;

    this.window.setTimeout(function() {
      let result = "";
      try {
        if (typeof MockColorPicker.showCallback == "function") {
          var updateCb = function(color) {
            result = color;
            aColorPickerShownCallback.update(color);
          };
          let returnColor = MockColorPicker.showCallback(this, updateCb);
          if (typeof returnColor === "string") {
            result = returnColor;
          }
        } else if (typeof MockColorPicker.returnColor === "string") {
          result = MockColorPicker.returnColor;
        }
      } catch(ex) {
        dump("TEST-UNEXPECTED-FAIL | Exception in MockColorPicker.jsm open() " +
             "method: " + ex + "\n");
      }
      if (aColorPickerShownCallback) {
        aColorPickerShownCallback.done(result);
      }
    }.bind(this), 0);
  }
};

// Expose everything to content. We call reset() here so that all of the
// relevant lazy expandos get added.
MockColorPicker.reset();
function exposeAll(obj) {
  var props = {};
  for (var prop in obj)
    props[prop] = 'rw';
  obj.__exposedProps__ = props;
}
exposeAll(MockColorPicker);
exposeAll(MockColorPickerInstance.prototype);
