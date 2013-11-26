/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2013 Mozilla Foundation
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
/* globals DEFAULT_PREFERENCES, PDFJS, isLocalStorageEnabled */

'use strict';

//#include default_preferences.js

var Preferences = (function PreferencesClosure() {
  function Preferences() {
    this.prefs = {};
    this.initializedPromise = this.readFromStorage().then(function(prefObj) {
      if (prefObj) {
        this.prefs = prefObj;
      }
    }.bind(this));
  }

  Preferences.prototype = {
    writeToStorage: function Preferences_writeToStorage(prefObj) {
      return;
    },

    readFromStorage: function Preferences_readFromStorage() {
      var readFromStoragePromise = new PDFJS.Promise();
      return readFromStoragePromise;
    },

    reset: function Preferences_reset() {
      if (this.initializedPromise.isResolved) {
        this.prefs = {};
        this.writeToStorage(this.prefs);
      }
    },

    set: function Preferences_set(name, value) {
      if (!this.initializedPromise.isResolved) {
        return;
      } else if (DEFAULT_PREFERENCES[name] === undefined) {
        console.error('Preferences_set: \'' + name + '\' is undefined.');
        return;
      } else if (value === undefined) {
        console.error('Preferences_set: no value is specified.');
        return;
      }
      var valueType = typeof value;
      var defaultType = typeof DEFAULT_PREFERENCES[name];

      if (valueType !== defaultType) {
        if (valueType === 'number' && defaultType === 'string') {
          value = value.toString();
        } else {
          console.error('Preferences_set: \'' + value + '\' is a \"' +
                        valueType + '\", expected a \"' + defaultType + '\".');
          return;
        }
      }
      this.prefs[name] = value;
      this.writeToStorage(this.prefs);
    },

    get: function Preferences_get(name) {
      var defaultPref = DEFAULT_PREFERENCES[name];

      if (defaultPref === undefined) {
        console.error('Preferences_get: \'' + name + '\' is undefined.');
        return;
      } else if (this.initializedPromise.isResolved) {
        var pref = this.prefs[name];

        if (pref !== undefined) {
          return pref;
        }
      }
      return defaultPref;
    }
  };

  return Preferences;
})();

//#if B2G
//Preferences.prototype.writeToStorage = function(prefObj) {
//  asyncStorage.setItem('preferences', JSON.stringify(prefObj));
//};
//
//Preferences.prototype.readFromStorage = function() {
//  var readFromStoragePromise = new PDFJS.Promise();
//  asyncStorage.getItem('preferences', function(prefString) {
//    var readPrefs = JSON.parse(prefString);
//    readFromStoragePromise.resolve(readPrefs);
//  });
//  return readFromStoragePromise;
//};
//#endif

//#if !(FIREFOX || MOZCENTRAL || B2G)
Preferences.prototype.writeToStorage = function(prefObj) {
  if (isLocalStorageEnabled) {
    localStorage.setItem('preferences', JSON.stringify(prefObj));
  }
};

Preferences.prototype.readFromStorage = function() {
  var readFromStoragePromise = new PDFJS.Promise();
  if (isLocalStorageEnabled) {
    var readPrefs = JSON.parse(localStorage.getItem('preferences'));
    readFromStoragePromise.resolve(readPrefs);
  }
  return readFromStoragePromise;
};
//#endif
