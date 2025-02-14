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

/** @typedef {import("./overlay_manager.js").OverlayManager} OverlayManager */

import { PasswordResponses } from "pdfjs-lib";

/**
 * @typedef {Object} PasswordPromptOptions
 * @property {HTMLDialogElement} dialog - The overlay's DOM element.
 * @property {HTMLParagraphElement} label - Label containing instructions for
 *                                          entering the password.
 * @property {HTMLInputElement} input - Input field for entering the password.
 * @property {HTMLButtonElement} submitButton - Button for submitting the
 *                                              password.
 * @property {HTMLButtonElement} cancelButton - Button for cancelling password
 *                                              entry.
 */

class PasswordPrompt {
  #activeCapability = null;

  #updateCallback = null;

  #reason = null;

  /**
   * @param {PasswordPromptOptions} options
   * @param {OverlayManager} overlayManager - Manager for the viewer overlays.
   * @param {boolean} [isViewerEmbedded] - If the viewer is embedded, in e.g.
   *   an <iframe> or an <object>. The default value is `false`.
   */
  constructor(options, overlayManager, isViewerEmbedded = false) {
    this.dialog = options.dialog;
    this.label = options.label;
    this.input = options.input;
    this.submitButton = options.submitButton;
    this.cancelButton = options.cancelButton;
    this.overlayManager = overlayManager;
    this._isViewerEmbedded = isViewerEmbedded;

    // Attach the event listeners.
    this.submitButton.addEventListener("click", this.#verify.bind(this));
    this.cancelButton.addEventListener("click", this.close.bind(this));
    this.input.addEventListener("keydown", e => {
      if (e.keyCode === /* Enter = */ 13) {
        this.#verify();
      }
    });

    this.overlayManager.register(this.dialog, /* canForceClose = */ true);

    this.dialog.addEventListener("close", this.#cancel.bind(this));
  }

  async open() {
    await this.#activeCapability?.promise;
    this.#activeCapability = Promise.withResolvers();

    try {
      await this.overlayManager.open(this.dialog);
    } catch (ex) {
      this.#activeCapability.resolve();
      throw ex;
    }

    const passwordIncorrect =
      this.#reason === PasswordResponses.INCORRECT_PASSWORD;

    if (!this._isViewerEmbedded || passwordIncorrect) {
      this.input.focus();
    }
    this.label.setAttribute(
      "data-l10n-id",
      passwordIncorrect ? "pdfjs-password-invalid" : "pdfjs-password-label"
    );
  }

  async close() {
    this.overlayManager.closeIfActive(this.dialog);
  }

  #verify() {
    const password = this.input.value;
    if (password?.length > 0) {
      this.#invokeCallback(password);
    }
  }

  #cancel() {
    this.#invokeCallback(new Error("PasswordPrompt cancelled."));
    this.#activeCapability.resolve();
  }

  #invokeCallback(password) {
    if (!this.#updateCallback) {
      return; // Ensure that the callback is only invoked once.
    }
    this.close();
    this.input.value = "";

    this.#updateCallback(password);
    this.#updateCallback = null;
  }

  async setUpdateCallback(updateCallback, reason) {
    if (this.#activeCapability) {
      await this.#activeCapability.promise;
    }
    this.#updateCallback = updateCallback;
    this.#reason = reason;
  }
}

export { PasswordPrompt };
