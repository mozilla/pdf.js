/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PasswordPrompt = void 0;

var _ui_utils = require("./ui_utils.js");

var _pdf = require("../pdf");

class PasswordPrompt {
  constructor(options, overlayManager, l10n = _ui_utils.NullL10n) {
    this.overlayName = options.overlayName;
    this.container = options.container;
    this.label = options.label;
    this.input = options.input;
    this.submitButton = options.submitButton;
    this.cancelButton = options.cancelButton;
    this.overlayManager = overlayManager;
    this.l10n = l10n;
    this.updateCallback = null;
    this.reason = null;
    this.submitButton.addEventListener("click", this.verify.bind(this));
    this.cancelButton.addEventListener("click", this.close.bind(this));
    this.input.addEventListener("keydown", e => {
      if (e.keyCode === 13) {
        this.verify();
      }
    });
    this.overlayManager.register(this.overlayName, this.container, this.close.bind(this), true);
  }

  open() {
    this.overlayManager.open(this.overlayName).then(() => {
      this.input.focus();
      let promptString;

      if (this.reason === _pdf.PasswordResponses.INCORRECT_PASSWORD) {
        promptString = this.l10n.get("password_invalid", null, "Invalid password. Please try again.");
      } else {
        promptString = this.l10n.get("password_label", null, "Enter the password to open this PDF file.");
      }

      promptString.then(msg => {
        this.label.textContent = msg;
      });
    });
  }

  close() {
    this.overlayManager.close(this.overlayName).then(() => {
      this.input.value = "";
    });
  }

  verify() {
    const password = this.input.value;

    if (password && password.length > 0) {
      this.close();
      this.updateCallback(password);
    }
  }

  setUpdateCallback(updateCallback, reason) {
    this.updateCallback = updateCallback;
    this.reason = reason;
  }

}

exports.PasswordPrompt = PasswordPrompt;