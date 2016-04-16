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
    define('pdfjs-web/hand_tool', ['exports', 'pdfjs-web/ui_utils',
      'pdfjs-web/grab_to_pan', 'pdfjs-web/preferences',
      'pdfjs-web/secondary_toolbar'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./ui_utils.js'), require('./grab_to_pan.js'),
      require('./preferences.js'), require('./secondary_toolbar.js'));
  } else {
    factory((root.pdfjsWebHandTool = {}), root.pdfjsWebUIUtils,
      root.pdfjsWebGrabToPan, root.pdfjsWebPreferences,
      root.pdfjsWebSecondaryToolbar);
  }
}(this, function (exports, uiUtils, grabToPan, preferences, secondaryToolbar) {

var mozL10n = uiUtils.mozL10n;
var GrabToPan = grabToPan.GrabToPan;
var Preferences = preferences.Preferences;
var SecondaryToolbar = secondaryToolbar.SecondaryToolbar;

/**
 * @typedef {Object} HandToolOptions
 * @property {HTMLDivElement} container - The document container.
 * @property {HTMLButtonElement} toggleHandTool - The button element for
 *                                                toggling the hand tool.
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
    this.toggleHandTool = options.toggleHandTool;

    this.wasActive = false;

    this.handTool = new GrabToPan({
      element: this.container,
      onActiveChanged: function(isActive) {
        if (!this.toggleHandTool) {
          return;
        }
        if (isActive) {
          this.toggleHandTool.title =
            mozL10n.get('hand_tool_disable.title', null, 'Disable hand tool');
          this.toggleHandTool.firstElementChild.textContent =
            mozL10n.get('hand_tool_disable_label', null, 'Disable hand tool');
        } else {
          this.toggleHandTool.title =
            mozL10n.get('hand_tool_enable.title', null, 'Enable hand tool');
          this.toggleHandTool.firstElementChild.textContent =
            mozL10n.get('hand_tool_enable_label', null, 'Enable hand tool');
        }
      }.bind(this)
    });

    if (this.toggleHandTool) {
      this.toggleHandTool.addEventListener('click', this.toggle.bind(this));

      window.addEventListener('localized', function (evt) {
        Preferences.get('enableHandToolOnLoad').then(function resolved(value) {
          if (value) {
            this.handTool.activate();
          }
        }.bind(this), function rejected(reason) {});
      }.bind(this));

      window.addEventListener('presentationmodechanged', function (evt) {
        if (evt.detail.switchInProgress) {
          return;
        }
        if (evt.detail.active) {
          this.enterPresentationMode();
        } else {
          this.exitPresentationMode();
        }
      }.bind(this));
    }
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
      SecondaryToolbar.close();
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
