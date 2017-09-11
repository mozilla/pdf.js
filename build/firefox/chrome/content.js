/* Copyright 2014 Mozilla Foundation
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
/* eslint-env mozilla/frame-script */

"use strict";

(function contentScriptClosure() {
  // we need to use closure here -- we are running in the global context

  const Cc = Components.classes;
  const Ci = Components.interfaces;
  const Cm = Components.manager;
  const Cu = Components.utils;
  const Cr = Components.results;

  Cu.import("resource://gre/modules/XPCOMUtils.jsm");
  Cu.import("resource://gre/modules/Services.jsm");

  var isRemote = Services.appinfo.processType ===
    Services.appinfo.PROCESS_TYPE_CONTENT;

  // Factory that registers/unregisters a constructor as a component.
  function Factory() {
  }

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
      if (aOuter !== null) {
        throw Cr.NS_ERROR_NO_AGGREGATION;
      }
      return (new (this._targetConstructor)()).QueryInterface(iid);
    },

    // nsIFactory
    lockFactory: function lockFactory(lock) {
      // No longer used as of gecko 1.7.
      throw Cr.NS_ERROR_NOT_IMPLEMENTED;
    },
  };

  var pdfStreamConverterFactory = new Factory();

  function startup() {
    Cu.import("resource://pdf.js/PdfjsContentUtils.jsm");
    PdfjsContentUtils.init();

    Cu.import("resource://pdf.js/PdfStreamConverter.jsm");
    pdfStreamConverterFactory.register(PdfStreamConverter);
  }

  function shutdown() {
    // Remove the contract/component.
    pdfStreamConverterFactory.unregister();
    // Unload the converter
    Cu.unload("resource://pdf.js/PdfStreamConverter.jsm");

    PdfjsContentUtils.uninit();
    Cu.unload("resource://pdf.js/PdfjsContentUtils.jsm");
  }

  if (isRemote) {
    startup();

    addMessageListener("PDFJS:Child:shutdown", function() {
      shutdown();
    });
  }
})();
