/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Special Powers code
 *
 * The Initial Developer of the Original Code is
 * Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Clint Talbert cmtalbert@gmail.com
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK *****/
/* This code is loaded in every child process that is started by mochitest in
 * order to be used as a replacement for UniversalXPConnect
 */

var Ci = Components.interfaces;
var Cc = Components.classes;

function SpecialPowers(window) {
  this.window = window;
  bindDOMWindowUtils(this, window);
  this._encounteredCrashDumpFiles = [];
  this._unexpectedCrashDumpFiles = { };
  this._crashDumpDir = null;
  this._pongHandlers = [];
  this._messageListener = this._messageReceived.bind(this);
  addMessageListener("SPPingService", this._messageListener);
}

function bindDOMWindowUtils(sp, window) {
  var util = window.QueryInterface(Ci.nsIInterfaceRequestor)
                   .getInterface(Ci.nsIDOMWindowUtils);
  // This bit of magic brought to you by the letters
  // B Z, and E, S and the number 5.
  //
  // Take all of the properties on the nsIDOMWindowUtils-implementing
  // object, and rebind them onto a new object with a stub that uses
  // apply to call them from this privileged scope. This way we don't
  // have to explicitly stub out new methods that appear on
  // nsIDOMWindowUtils.
  var proto = Object.getPrototypeOf(util);
  var target = {};
  function rebind(desc, prop) {
    if (prop in desc && typeof(desc[prop]) == "function") {
      var oldval = desc[prop];
      desc[prop] = function() { return oldval.apply(util, arguments); };
    }
  }
  for (var i in proto) {
    var desc = Object.getOwnPropertyDescriptor(proto, i);
    rebind(desc, "get");
    rebind(desc, "set");
    rebind(desc, "value");
    Object.defineProperty(target, i, desc);
  }
  sp.DOMWindowUtils = target;
}

SpecialPowers.prototype = {
  toString: function() { return "[SpecialPowers]"; },
  sanityCheck: function() { return "foo"; },

  // This gets filled in in the constructor.
  DOMWindowUtils: undefined,

  // Mimic the get*Pref API
  getBoolPref: function(aPrefName) {
    return (this._getPref(aPrefName, 'BOOL'));
  },
  getIntPref: function(aPrefName) {
    return (this._getPref(aPrefName, 'INT'));
  },
  getCharPref: function(aPrefName) {
    return (this._getPref(aPrefName, 'CHAR'));
  },
  getComplexValue: function(aPrefName, aIid) {
    return (this._getPref(aPrefName, 'COMPLEX', aIid));
  },

  // Mimic the set*Pref API
  setBoolPref: function(aPrefName, aValue) {
    return (this._setPref(aPrefName, 'BOOL', aValue));
  },
  setIntPref: function(aPrefName, aValue) {
    return (this._setPref(aPrefName, 'INT', aValue));
  },
  setCharPref: function(aPrefName, aValue) {
    return (this._setPref(aPrefName, 'CHAR', aValue));
  },
  setComplexValue: function(aPrefName, aIid, aValue) {
    return (this._setPref(aPrefName, 'COMPLEX', aValue, aIid));
  },

  // Mimic the clearUserPref API
  clearUserPref: function(aPrefName) {
    var msg = {'op':'clear', 'prefName': aPrefName, 'prefType': ""};
    sendSyncMessage('SPPrefService', msg);
  },

  // Private pref functions to communicate to chrome
  _getPref: function(aPrefName, aPrefType, aIid) {
    var msg = {};
    if (aIid) {
      // Overloading prefValue to handle complex prefs
      msg = {'op':'get', 'prefName': aPrefName, 'prefType':aPrefType, 'prefValue':[aIid]};
    } else {
      msg = {'op':'get', 'prefName': aPrefName,'prefType': aPrefType};
    }
    return(sendSyncMessage('SPPrefService', msg)[0]);
  },
  _setPref: function(aPrefName, aPrefType, aValue, aIid) {
    var msg = {};
    if (aIid) {
      msg = {'op':'set','prefName':aPrefName, 'prefType': aPrefType, 'prefValue': [aIid,aValue]};
    } else {
      msg = {'op':'set', 'prefName': aPrefName, 'prefType': aPrefType, 'prefValue': aValue};
    }
    return(sendSyncMessage('SPPrefService', msg)[0]);
  },

  //XXX: these APIs really ought to be removed, they're not e10s-safe.
  // (also they're pretty Firefox-specific)
  _getTopChromeWindow: function(window) {
    return window.QueryInterface(Ci.nsIInterfaceRequestor)
                 .getInterface(Ci.nsIWebNavigation)
                 .QueryInterface(Ci.nsIDocShellTreeItem)
                 .rootTreeItem
                 .QueryInterface(Ci.nsIInterfaceRequestor)
                 .getInterface(Ci.nsIDOMWindow)
                 .QueryInterface(Ci.nsIDOMChromeWindow);
  },
  _getDocShell: function(window) {
    return window.QueryInterface(Ci.nsIInterfaceRequestor)
                 .getInterface(Ci.nsIWebNavigation)
                 .QueryInterface(Ci.nsIDocShell);
  },
  _getMUDV: function(window) {
    return this._getDocShell(window).contentViewer
               .QueryInterface(Ci.nsIMarkupDocumentViewer);
  },
  _getAutoCompletePopup: function(window) {
    return this._getTopChromeWindow(window).document
                                           .getElementById("PopupAutoComplete");
  },
  addAutoCompletePopupEventListener: function(window, listener) {
    this._getAutoCompletePopup(window).addEventListener("popupshowing",
                                                        listener,
                                                        false);
  },
  removeAutoCompletePopupEventListener: function(window, listener) {
    this._getAutoCompletePopup(window).removeEventListener("popupshowing",
                                                           listener,
                                                           false);
  },
  isBackButtonEnabled: function(window) {
    return !this._getTopChromeWindow(window).document
                                      .getElementById("Browser:Back")
                                      .hasAttribute("disabled");
  },

  addChromeEventListener: function(type, listener, capture, allowUntrusted) {
    addEventListener(type, listener, capture, allowUntrusted);
  },
  removeChromeEventListener: function(type, listener, capture) {
    removeEventListener(type, listener, capture);
  },

  getFullZoom: function(window) {
    return this._getMUDV(window).fullZoom;
  },
  setFullZoom: function(window, zoom) {
    this._getMUDV(window).fullZoom = zoom;
  },
  getTextZoom: function(window) {
    return this._getMUDV(window).textZoom;
  },
  setTextZoom: function(window, zoom) {
    this._getMUDV(window).textZoom = zoom;
  },

  createSystemXHR: function() {
    return Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
             .createInstance(Ci.nsIXMLHttpRequest);
  },

  gc: function() {
    this.DOMWindowUtils.garbageCollect();
  },

  hasContentProcesses: function() {
    try {
      var rt = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULRuntime);
      return rt.processType != Ci.nsIXULRuntime.PROCESS_TYPE_DEFAULT;
    } catch (e) {
      return true;
    }
  },

  registerProcessCrashObservers: function() {
    addMessageListener("SPProcessCrashService", this._messageListener);
    sendSyncMessage("SPProcessCrashService", { op: "register-observer" });
  },

  _messageReceived: function(aMessage) {
    switch (aMessage.name) {
      case "SPProcessCrashService":
        if (aMessage.json.type == "crash-observed") {
          var self = this;
          aMessage.json.dumpIDs.forEach(function(id) {
            self._encounteredCrashDumpFiles.push(id + ".dmp");
            self._encounteredCrashDumpFiles.push(id + ".extra");
          });
        }
        break;

      case "SPPingService":
        if (aMessage.json.op == "pong") {
          var handler = this._pongHandlers.shift();
          if (handler) {
            handler();
          }
        }
        break;
    }
    return true;
  },

  removeExpectedCrashDumpFiles: function(aExpectingProcessCrash) {
    var success = true;
    if (aExpectingProcessCrash) {
      var message = {
        op: "delete-crash-dump-files",
        filenames: this._encounteredCrashDumpFiles 
      };
      if (!sendSyncMessage("SPProcessCrashService", message)[0]) {
        success = false;
      }
    }
    this._encounteredCrashDumpFiles.length = 0;
    return success;
  },

  findUnexpectedCrashDumpFiles: function() {
    var self = this;
    var message = {
      op: "find-crash-dump-files",
      crashDumpFilesToIgnore: this._unexpectedCrashDumpFiles
    };
    var crashDumpFiles = sendSyncMessage("SPProcessCrashService", message)[0];
    crashDumpFiles.forEach(function(aFilename) {
      self._unexpectedCrashDumpFiles[aFilename] = true;
    });
    return crashDumpFiles;
  },

  executeAfterFlushingMessageQueue: function(aCallback) {
    this._pongHandlers.push(aCallback);
    sendAsyncMessage("SPPingService", { op: "ping" });
  },

  executeSoon: function(aFunc) {
    var tm = Cc["@mozilla.org/thread-manager;1"].getService(Ci.nsIThreadManager);
    tm.mainThread.dispatch({
      run: function() {
        aFunc();
      }
    }, Ci.nsIThread.DISPATCH_NORMAL);
  },

  /* from http://mxr.mozilla.org/mozilla-central/source/testing/mochitest/tests/SimpleTest/quit.js
   * by Bob Clary, Jeff Walden, and Robert Sayre.
   */
  quitApplication: function() {
      function canQuitApplication()
      {
	  var os = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
	  if (!os)
	      return true;
  
	  try {
	      var cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(Ci.nsISupportsPRBool);
	      os.notifyObservers(cancelQuit, "quit-application-requested", null);
    
	      // Something aborted the quit process. 
	      if (cancelQuit.data)
		  return false;
	  } catch (ex) {}
	  return true;
      }

      if (!canQuitApplication())
	  return false;
	  
      var appService = Cc['@mozilla.org/toolkit/app-startup;1'].getService(Ci.nsIAppStartup);
      appService.quit(Ci.nsIAppStartup.eForceQuit);
      return true;
  }
};

// Expose everything but internal APIs (starting with underscores) to
// web content.
SpecialPowers.prototype.__exposedProps__ = {};
for each (i in Object.keys(SpecialPowers.prototype).filter(function(v) {return v.charAt(0) != "_";})) {
  SpecialPowers.prototype.__exposedProps__[i] = "r";
}

// Attach our API to the window.
function attachSpecialPowersToWindow(aWindow) {
  try {
    if ((aWindow !== null) &&
        (aWindow !== undefined) &&
        (aWindow.wrappedJSObject) &&
        !(aWindow.wrappedJSObject.SpecialPowers)) {
      aWindow.wrappedJSObject.SpecialPowers = new SpecialPowers(aWindow);
    }
  } catch(ex) {
    dump("TEST-INFO | specialpowers.js |  Failed to attach specialpowers to window exception: " + ex + "\n");
  }
}

// This is a frame script, so it may be running in a content process.
// In any event, it is targeted at a specific "tab", so we listen for
// the DOMWindowCreated event to be notified about content windows
// being created in this context.

function SpecialPowersManager() {
  addEventListener("DOMWindowCreated", this, false);
}

SpecialPowersManager.prototype = {
  handleEvent: function handleEvent(aEvent) {
    var window = aEvent.target.defaultView;

    // Need to make sure we are called on what we care about -
    // content windows. DOMWindowCreated is called on *all* HTMLDocuments,
    // some of which belong to chrome windows or other special content.
    //
    var uri = window.document.documentURIObject;
    if (uri.scheme === "chrome" || uri.spec.split(":")[0] == "about") {
      return;
    }

    attachSpecialPowersToWindow(window);
  }
};

var specialpowersmanager = new SpecialPowersManager();
