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

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-web/password_prompt', ['exports',
      'pdfjs-web/ui_utils', 'pdfjs-web/overlay_manager', 'pdfjs-web/pdfjs'],
      factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./ui_utils.js'), require('./overlay_manager.js'),
      require('./pdfjs.js'));
  } else {
    factory((root.pdfjsWebPasswordPrompt = {}), root.pdfjsWebUIUtils,
      root.pdfjsWebOverlayManager, root.pdfjsWebPDFJS);
  }
}(this, function (exports, uiUtils, overlayManager, pdfjsLib) {

var mozL10n = uiUtils.mozL10n;
var OverlayManager = overlayManager.OverlayManager;

/**
 * @typedef {Object} PasswordPromptOptions
 * @property {string} overlayName - Name of the overlay for the overlay manager.
 * @property {HTMLDivElement} container - Div container for the overlay.
 * @property {HTMLParagraphElement} label - Label containing instructions for
 *                                          entering the password.
 * @property {HTMLInputElement} input - Input field for entering the password.
 * @property {HTMLButtonElement} submitButton - Button for submitting the
 *                                              password.
 * @property {HTMLButtonElement} cancelButton - Button for cancelling password
 *                                              entry.
 */

/**
 * @class
 */
var PasswordPrompt = (function PasswordPromptClosure() {
  /**
   * @constructs PasswordPrompt
   * @param {PasswordPromptOptions} options
   */
  function PasswordPrompt(options) {
    this.overlayName = options.overlayName;
    this.container = options.container;
    this.label = options.label;
    this.input = options.input;
    this.submitButton = options.submitButton;
    this.cancelButton = options.cancelButton;

    this.updateCallback = null;
    this.reason = null;

    // Attach the event listeners.
    this.submitButton.addEventListener('click', this.verify.bind(this));
    this.cancelButton.addEventListener('click', this.close.bind(this));
    this.input.addEventListener('keydown', function (e) {
      if (e.keyCode === 13) { // Enter key
        this.verify();
      }
    }.bind(this));

    OverlayManager.register(this.overlayName, this.container,
                            this.close.bind(this), true);
  }

  PasswordPrompt.prototype = {
    open: function PasswordPrompt_open() {
      OverlayManager.open(this.overlayName).then(function () {
        this.input.type = 'password';
        this.input.focus();

        var promptString = mozL10n.get('password_label', null,
          'Enter the password to open this PDF file.');

        if (this.reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD) {
          promptString = mozL10n.get('password_invalid', null,
            'Invalid password. Please try again.');
        }

        this.label.textContent = promptString;
      }.bind(this));
    },

    close: function PasswordPrompt_close() {
      OverlayManager.close(this.overlayName).then(function () {
        this.input.value = '';
        this.input.type = '';
      }.bind(this));
    },

    verify: function PasswordPrompt_verify() {
      var password = this.input.value;
      if (password && password.length > 0) {
        this.close();
        return this.updateCallback(password);
      }
    },

    setUpdateCallback:
        function PasswordPrompt_setUpdateCallback(updateCallback, reason) {
      this.updateCallback = updateCallback;
      this.reason = reason;
    }
  };

  return PasswordPrompt;
})();

exports.PasswordPrompt = PasswordPrompt;
}));
