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

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-web/hand_tool', ['exports', 'pdfjs-web/grab_to_pan',
      'pdfjs-web/preferences'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./grab_to_pan.js'), require('./preferences.js'));
  } else {
    factory((root.pdfjsWebHandTool = {}), root.pdfjsWebGrabToPan,
      root.pdfjsWebPreferences);
  }
}(this, function (exports, grabToPan, preferences) {

var GrabToPan = grabToPan.GrabToPan;
var Preferences = preferences.Preferences;

/**
 * @typedef {Object} HandToolOptions
 * @property {HTMLDivElement} container - The document container.
 * @property {EventBus} eventBus - The application event bus.
 */

/**
 * @class
 */
var HandTool = (function HandToolClosure() {
  /**
   * @constructs HandTool
   * @param {HandToolOptions} options
   */
  function HandTool(options) {
    this.container = options.container;
    this.eventBus = options.eventBus;

    this.wasActive = false;

    this.handTool = new GrabToPan({
      element: this.container,
      onActiveChanged: function(isActive) {
        this.eventBus.dispatch('handtoolchanged', {isActive: isActive});
      }.bind(this)
    });

    this.eventBus.on('togglehandtool', this.toggle.bind(this));

    this.eventBus.on('localized', function (e) {
      Preferences.get('enableHandToolOnLoad').then(function resolved(value) {
        if (value) {
          this.handTool.activate();
        }
      }.bind(this), function rejected(reason) {});
    }.bind(this));

    this.eventBus.on('presentationmodechanged', function (e) {
      if (e.switchInProgress) {
        return;
      }
      if (e.active) {
        this.enterPresentationMode();
      } else {
        this.exitPresentationMode();
      }
    }.bind(this));
  }

  HandTool.prototype = {
    /**
     * @return {boolean}
     */
    get isActive() {
      return !!this.handTool.active;
    },

    toggle: function HandTool_toggle() {
      this.handTool.toggle();
    },

    enterPresentationMode: function HandTool_enterPresentationMode() {
      if (this.isActive) {
        this.wasActive = true;
        this.handTool.deactivate();
      }
    },

    exitPresentationMode: function HandTool_exitPresentationMode() {
      if (this.wasActive) {
        this.wasActive = false;
        this.handTool.activate();
      }
    }
  };

  return HandTool;
})();

exports.HandTool = HandTool;
}));
