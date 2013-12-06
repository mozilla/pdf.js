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
/* globals Preferences */

'use strict';

var PreferencesUI = {
  opened: false,

  initialize: function() {
    this.container = document.getElementById('preferencesContainer'),
    this.overlayContainer = this.container.parentNode;

    this.preferenceNames = [
      { name: 'showPreviousViewOnLoad', type: 'checkbox' },
      { name: 'ifAvailableShowOutlineOnLoad', type: 'checkbox' },
      { name: 'defaultZoomValue', type: 'text' }
    ];

    this.resetButton = document.getElementById('preferencesReset');
    this.closeButton = document.getElementById('preferencesClose');

    this.resetButton.addEventListener('click', function(evt) {
      this._resetPreferences();
    }.bind(this));

    this.closeButton.addEventListener('click', function(evt) {
      this.close();
    }.bind(this));
  },

  _update: function() {
    var entry, prefName, prefValue, element;

    for (var item in this.preferenceNames) {
      entry = this.preferenceNames[item];
      prefName = entry.name;
      prefValue = this.prefs.get(prefName);
      element = document.getElementById(prefName);

      switch (entry.type) {
        case 'checkbox':
          element.checked = prefValue;
          break;
        case 'text':
          element.value = prefValue;
          break;
        default:
          break;
      }
    }
  },

  _resetPreferences: function() {
    this.prefs.reset();
    this._update();
  },

  _savePreferences: function() {
    var entry, prefName, newPrefValue, element;

    for (var item in this.preferenceNames) {
      entry = this.preferenceNames[item];
      prefName = entry.name;
      element = document.getElementById(prefName);

      switch (entry.type) {
        case 'checkbox':
          newPrefValue = element.checked;
          break;
        case 'text':
          newPrefValue = element.value;
          break;
        default:
          break;
      }
      this.prefs.set(prefName, newPrefValue);
    }
  },

  open: function() {
    if (this.opened) {
      return;
    }
    // Since the preferences might have been changed manually by the user
    // (by editing about:config in Firefox) after the file was loaded,
    // fetch the current preferences from storage by creating a new instance.
    this.prefs = new Preferences();

    this.prefs.initializedPromise.then(function() {
      this.opened = true;
      this.container.classList.remove('hidden');
      this.overlayContainer.classList.remove('hidden');

      this._update();
    }.bind(this));
  },

  close: function() {
    if (!this.opened) {
      return;
    }
    this._savePreferences();
    delete this.prefs;

    this.container.classList.add('hidden');
    this.overlayContainer.classList.add('hidden');
    this.opened = false;
  }
};
