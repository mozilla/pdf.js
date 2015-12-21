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
/* globals Components, Services, XPCOMUtils */

'use strict';

var EXPORTED_SYMBOLS = ['PdfjsContentUtils'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
Cu.import('resource://gre/modules/Services.jsm');

var PdfjsContentUtils = {
  _mm: null,

  /*
   * Public API
   */

  get isRemote() {
    return (Services.appinfo.processType ===
            Services.appinfo.PROCESS_TYPE_CONTENT);
  },

  init: function () {
    // child *process* mm, or when loaded into the parent for in-content
    // support the psuedo child process mm 'child PPMM'.
    if (!this._mm) {
      this._mm = Cc['@mozilla.org/childprocessmessagemanager;1'].
        getService(Ci.nsISyncMessageSender);
      this._mm.addMessageListener('PDFJS:Child:refreshSettings', this);
      Services.obs.addObserver(this, 'quit-application', false);
    }
  },

  uninit: function () {
    if (this._mm) {
      this._mm.removeMessageListener('PDFJS:Child:refreshSettings', this);
      Services.obs.removeObserver(this, 'quit-application');
    }
    this._mm = null;
  },

  /*
   * prefs utilities - the child does not have write access to prefs.
   * note, the pref names here are cross-checked against a list of
   * approved pdfjs prefs in chrome utils.
   */

  clearUserPref: function (aPrefName) {
    this._mm.sendSyncMessage('PDFJS:Parent:clearUserPref', {
      name: aPrefName
    });
  },

  setIntPref: function (aPrefName, aPrefValue) {
    this._mm.sendSyncMessage('PDFJS:Parent:setIntPref', {
      name: aPrefName,
      value: aPrefValue
    });
  },

  setBoolPref: function (aPrefName, aPrefValue) {
    this._mm.sendSyncMessage('PDFJS:Parent:setBoolPref', {
      name: aPrefName,
      value: aPrefValue
    });
  },

  setCharPref: function (aPrefName, aPrefValue) {
    this._mm.sendSyncMessage('PDFJS:Parent:setCharPref', {
      name: aPrefName,
      value: aPrefValue
    });
  },

  setStringPref: function (aPrefName, aPrefValue) {
    this._mm.sendSyncMessage('PDFJS:Parent:setStringPref', {
      name: aPrefName,
      value: aPrefValue
    });
  },

  /*
   * Forwards default app query to the parent where we check various
   * handler app settings only available in the parent process.
   */
  isDefaultHandlerApp: function () {
    return this._mm.sendSyncMessage('PDFJS:Parent:isDefaultHandlerApp')[0];
  },

  /*
   * Request the display of a notification warning in the associated window
   * when the renderer isn't sure a pdf displayed correctly.
   */
  displayWarning: function (aWindow, aMessage, aLabel, accessKey) {
    // the child's dom frame mm associated with the window.
    let winmm = aWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                       .getInterface(Ci.nsIDocShell)
                       .QueryInterface(Ci.nsIInterfaceRequestor)
                       .getInterface(Ci.nsIContentFrameMessageManager);
    winmm.sendAsyncMessage('PDFJS:Parent:displayWarning', {
      message: aMessage,
      label: aLabel,
      accessKey: accessKey
    });
  },

  /*
   * Events
   */

  observe: function(aSubject, aTopic, aData) {
    if (aTopic === 'quit-application') {
      this.uninit();
    }
  },

  receiveMessage: function (aMsg) {
    switch (aMsg.name) {
      case 'PDFJS:Child:refreshSettings':
        // Only react to this if we are remote.
        if (Services.appinfo.processType ===
            Services.appinfo.PROCESS_TYPE_CONTENT) {
          let jsm = 'resource://pdf.js/PdfJs.jsm';
          let pdfjs = Components.utils.import(jsm, {}).PdfJs;
          pdfjs.updateRegistration();
        }
        break;
    }
  }
};
