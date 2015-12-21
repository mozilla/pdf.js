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
/* globals Components, Services, XPCOMUtils, DEFAULT_PREFERENCES */

'use strict';

var EXPORTED_SYMBOLS = ['PdfjsChromeUtils'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

const PREF_PREFIX = 'PDFJSSCRIPT_PREF_PREFIX';
const PDF_CONTENT_TYPE = 'application/pdf';

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
Cu.import('resource://gre/modules/Services.jsm');

var Svc = {};
XPCOMUtils.defineLazyServiceGetter(Svc, 'mime',
                                   '@mozilla.org/mime;1',
                                   'nsIMIMEService');

//#include ../../../web/default_preferences.js

var PdfjsChromeUtils = {
  // For security purposes when running remote, we restrict preferences
  // content can access.
  _allowedPrefNames: Object.keys(DEFAULT_PREFERENCES),
  _ppmm: null,
  _mmg: null,

  /*
   * Public API
   */

  init: function () {
    this._browsers = new Set();
    if (!this._ppmm) {
      // global parent process message manager (PPMM)
      this._ppmm = Cc['@mozilla.org/parentprocessmessagemanager;1'].
        getService(Ci.nsIMessageBroadcaster);
      this._ppmm.addMessageListener('PDFJS:Parent:clearUserPref', this);
      this._ppmm.addMessageListener('PDFJS:Parent:setIntPref', this);
      this._ppmm.addMessageListener('PDFJS:Parent:setBoolPref', this);
      this._ppmm.addMessageListener('PDFJS:Parent:setCharPref', this);
      this._ppmm.addMessageListener('PDFJS:Parent:setStringPref', this);
      this._ppmm.addMessageListener('PDFJS:Parent:isDefaultHandlerApp', this);

      // global dom message manager (MMg)
      this._mmg = Cc['@mozilla.org/globalmessagemanager;1'].
        getService(Ci.nsIMessageListenerManager);
      this._mmg.addMessageListener('PDFJS:Parent:displayWarning', this);

      this._mmg.addMessageListener('PDFJS:Parent:addEventListener', this);
      this._mmg.addMessageListener('PDFJS:Parent:removeEventListener', this);
      this._mmg.addMessageListener('PDFJS:Parent:updateControlState', this);

      // observer to handle shutdown
      Services.obs.addObserver(this, 'quit-application', false);
    }
  },

  uninit: function () {
    if (this._ppmm) {
      this._ppmm.removeMessageListener('PDFJS:Parent:clearUserPref', this);
      this._ppmm.removeMessageListener('PDFJS:Parent:setIntPref', this);
      this._ppmm.removeMessageListener('PDFJS:Parent:setBoolPref', this);
      this._ppmm.removeMessageListener('PDFJS:Parent:setCharPref', this);
      this._ppmm.removeMessageListener('PDFJS:Parent:setStringPref', this);
      this._ppmm.removeMessageListener('PDFJS:Parent:isDefaultHandlerApp',
                                       this);

      this._mmg.removeMessageListener('PDFJS:Parent:displayWarning', this);

      this._mmg.removeMessageListener('PDFJS:Parent:addEventListener', this);
      this._mmg.removeMessageListener('PDFJS:Parent:removeEventListener', this);
      this._mmg.removeMessageListener('PDFJS:Parent:updateControlState', this);

      Services.obs.removeObserver(this, 'quit-application', false);

      this._mmg = null;
      this._ppmm = null;
    }
  },

  /*
   * Called by the main module when preference changes are picked up
   * in the parent process. Observers don't propagate so we need to
   * instruct the child to refresh its configuration and (possibly)
   * the module's registration.
   */
  notifyChildOfSettingsChange: function () {
    if (Services.appinfo.processType ===
        Services.appinfo.PROCESS_TYPE_DEFAULT && this._ppmm) {
      // XXX kinda bad, we want to get the parent process mm associated
      // with the content process. _ppmm is currently the global process
      // manager, which means this is going to fire to every child process
      // we have open. Unfortunately I can't find a way to get at that
      // process specific mm from js.
      this._ppmm.broadcastAsyncMessage('PDFJS:Child:refreshSettings', {});
    }
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
      case 'PDFJS:Parent:clearUserPref':
        this._clearUserPref(aMsg.data.name);
        break;
      case 'PDFJS:Parent:setIntPref':
        this._setIntPref(aMsg.data.name, aMsg.data.value);
        break;
      case 'PDFJS:Parent:setBoolPref':
        this._setBoolPref(aMsg.data.name, aMsg.data.value);
        break;
      case 'PDFJS:Parent:setCharPref':
        this._setCharPref(aMsg.data.name, aMsg.data.value);
        break;
      case 'PDFJS:Parent:setStringPref':
        this._setStringPref(aMsg.data.name, aMsg.data.value);
        break;
      case 'PDFJS:Parent:isDefaultHandlerApp':
        return this.isDefaultHandlerApp();
      case 'PDFJS:Parent:displayWarning':
        this._displayWarning(aMsg);
        break;


      case 'PDFJS:Parent:updateControlState':
        return this._updateControlState(aMsg);
      case 'PDFJS:Parent:addEventListener':
        return this._addEventListener(aMsg);
      case 'PDFJS:Parent:removeEventListener':
        return this._removeEventListener(aMsg);
    }
  },

  /*
   * Internal
   */

  _findbarFromMessage: function(aMsg) {
    let browser = aMsg.target;
    let tabbrowser = browser.getTabBrowser();
    let tab;
//#if MOZCENTRAL
    tab = tabbrowser.getTabForBrowser(browser);
//#else
    if (tabbrowser.getTabForBrowser) {
      tab = tabbrowser.getTabForBrowser(browser);
    } else {
      // _getTabForBrowser is deprecated in Firefox 35, see
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1039500.
      tab = tabbrowser._getTabForBrowser(browser);
    }
//#endif
    return tabbrowser.getFindBar(tab);
  },

  _updateControlState: function (aMsg) {
    let data = aMsg.data;
    this._findbarFromMessage(aMsg)
        .updateControlState(data.result, data.findPrevious);
  },

  handleEvent: function(aEvent) {
    // To avoid forwarding the message as a CPOW, create a structured cloneable
    // version of the event for both performance, and ease of usage, reasons.
    let type = aEvent.type;
    let detail = {
      query: aEvent.detail.query,
      caseSensitive: aEvent.detail.caseSensitive,
      highlightAll: aEvent.detail.highlightAll,
      findPrevious: aEvent.detail.findPrevious
    };

    let browser = aEvent.currentTarget.browser;
    if (!this._browsers.has(browser)) {
      throw new Error('FindEventManager was not bound ' +
                      'for the current browser.');
    }
    // Only forward the events if the current browser is a registered browser.
    let mm = browser.messageManager;
    mm.sendAsyncMessage('PDFJS:Child:handleEvent',
                        { type: type, detail: detail });
    aEvent.preventDefault();
  },

  _types: ['find',
           'findagain',
           'findhighlightallchange',
           'findcasesensitivitychange'],

  _addEventListener: function (aMsg) {
    let browser = aMsg.target;
    if (this._browsers.has(browser)) {
      throw new Error('FindEventManager was bound 2nd time ' +
                      'without unbinding it first.');
    }

    // Since this jsm is global, we need to store all the browsers
    // we have to forward the messages for.
    this._browsers.add(browser);

    // And we need to start listening to find events.
    for (var i = 0; i < this._types.length; i++) {
      var type = this._types[i];
      this._findbarFromMessage(aMsg)
          .addEventListener(type, this, true);
    }
  },

  _removeEventListener: function (aMsg) {
    let browser = aMsg.target;
    if (!this._browsers.has(browser)) {
      throw new Error('FindEventManager was unbound without binding it first.');
    }

    this._browsers.delete(browser);

    // No reason to listen to find events any longer.
    for (var i = 0; i < this._types.length; i++) {
      var type = this._types[i];
      this._findbarFromMessage(aMsg)
          .removeEventListener(type, this, true);
    }
  },

  _ensurePreferenceAllowed: function (aPrefName) {
    let unPrefixedName = aPrefName.split(PREF_PREFIX + '.');
    if (unPrefixedName[0] !== '' ||
        this._allowedPrefNames.indexOf(unPrefixedName[1]) === -1) {
      let msg = '"' + aPrefName + '" ' +
                'can\'t be accessed from content. See PdfjsChromeUtils.';
      throw new Error(msg);
    }
  },

  _clearUserPref: function (aPrefName) {
    this._ensurePreferenceAllowed(aPrefName);
    Services.prefs.clearUserPref(aPrefName);
  },

  _setIntPref: function (aPrefName, aPrefValue) {
    this._ensurePreferenceAllowed(aPrefName);
    Services.prefs.setIntPref(aPrefName, aPrefValue);
  },

  _setBoolPref: function (aPrefName, aPrefValue) {
    this._ensurePreferenceAllowed(aPrefName);
    Services.prefs.setBoolPref(aPrefName, aPrefValue);
  },

  _setCharPref: function (aPrefName, aPrefValue) {
    this._ensurePreferenceAllowed(aPrefName);
    Services.prefs.setCharPref(aPrefName, aPrefValue);
  },

  _setStringPref: function (aPrefName, aPrefValue) {
    this._ensurePreferenceAllowed(aPrefName);
    let str = Cc['@mozilla.org/supports-string;1']
                .createInstance(Ci.nsISupportsString);
    str.data = aPrefValue;
    Services.prefs.setComplexValue(aPrefName, Ci.nsISupportsString, str);
  },

  /*
   * Svc.mime doesn't have profile information in the child, so
   * we bounce this pdfjs enabled configuration check over to the
   * parent.
   */
  isDefaultHandlerApp: function () {
    var handlerInfo = Svc.mime.getFromTypeAndExtension(PDF_CONTENT_TYPE, 'pdf');
    return (!handlerInfo.alwaysAskBeforeHandling &&
            handlerInfo.preferredAction === Ci.nsIHandlerInfo.handleInternally);
  },

  /*
   * Display a notification warning when the renderer isn't sure
   * a pdf displayed correctly.
   */
  _displayWarning: function (aMsg) {
    let data = aMsg.data;
    let browser = aMsg.target;

    let tabbrowser = browser.getTabBrowser();
    let notificationBox = tabbrowser.getNotificationBox(browser);

    // Flag so we don't send the message twice, since if the user clicks
    // "open with different viewer" both the button callback and
    // eventCallback will be called.
    let messageSent = false;
    function sendMessage(download) {
      let mm = browser.messageManager;
      mm.sendAsyncMessage('PDFJS:Child:fallbackDownload',
                          { download: download });
    }
    let buttons = [{
      label: data.label,
      accessKey: data.accessKey,
      callback: function() {
        messageSent = true;
        sendMessage(true);
      }
    }];
    notificationBox.appendNotification(data.message, 'pdfjs-fallback', null,
                                       notificationBox.PRIORITY_INFO_LOW,
                                       buttons,
                                       function eventsCallback(eventType) {
      // Currently there is only one event "removed" but if there are any other
      // added in the future we still only care about removed at the moment.
      if (eventType !== 'removed') {
        return;
      }
      // Don't send a response again if we already responded when the button was
      // clicked.
      if (messageSent) {
        return;
      }
      sendMessage(false);
    });
  }
};

