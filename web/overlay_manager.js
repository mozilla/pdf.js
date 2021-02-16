/* Copyright 2014 Mozilla Foundation
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

class OverlayManager {
  constructor() {
    this._overlays = {};
    this._active = null;
    this._keyDownBound = this._keyDown.bind(this);
  }

  get active() {
    return this._active;
  }

  /**
   * @param {string} name - The name of the overlay that is registered.
   * @param {HTMLDivElement} element - The overlay's DOM element.
   * @param {function} [callerCloseMethod] - The method that, if present, calls
   *                   `OverlayManager.close` from the object registering the
   *                   overlay. Access to this method is necessary in order to
   *                   run cleanup code when e.g. the overlay is force closed.
   *                   The default is `null`.
   * @param {boolean} [canForceClose] - Indicates if opening the overlay closes
   *                  an active overlay. The default is `false`.
   * @returns {Promise} A promise that is resolved when the overlay has been
   *                    registered.
   */
  async register(
    name,
    element,
    callerCloseMethod = null,
    canForceClose = false
  ) {
    let container;
    if (!name || !element || !(container = element.parentNode)) {
      throw new Error("Not enough parameters.");
    } else if (this._overlays[name]) {
      throw new Error("The overlay is already registered.");
    }
    this._overlays[name] = {
      element,
      container,
      callerCloseMethod,
      canForceClose,
    };
  }

  /**
   * @param {string} name - The name of the overlay that is unregistered.
   * @returns {Promise} A promise that is resolved when the overlay has been
   *                    unregistered.
   */
  async unregister(name) {
    if (!this._overlays[name]) {
      throw new Error("The overlay does not exist.");
    } else if (this._active === name) {
      throw new Error("The overlay cannot be removed while it is active.");
    }
    delete this._overlays[name];
  }

  /**
   * @param {string} name - The name of the overlay that should be opened.
   * @returns {Promise} A promise that is resolved when the overlay has been
   *                    opened.
   */
  async open(name) {
    if (!this._overlays[name]) {
      throw new Error("The overlay does not exist.");
    } else if (this._active) {
      if (this._overlays[name].canForceClose) {
        this._closeThroughCaller();
      } else if (this._active === name) {
        throw new Error("The overlay is already active.");
      } else {
        throw new Error("Another overlay is currently active.");
      }
    }
    this._active = name;
    this._overlays[this._active].element.classList.remove("hidden");
    this._overlays[this._active].container.classList.remove("hidden");

    window.addEventListener("keydown", this._keyDownBound);
  }

  /**
   * @param {string} name - The name of the overlay that should be closed.
   * @returns {Promise} A promise that is resolved when the overlay has been
   *                    closed.
   */
  async close(name) {
    if (!this._overlays[name]) {
      throw new Error("The overlay does not exist.");
    } else if (!this._active) {
      throw new Error("The overlay is currently not active.");
    } else if (this._active !== name) {
      throw new Error("Another overlay is currently active.");
    }
    this._overlays[this._active].container.classList.add("hidden");
    this._overlays[this._active].element.classList.add("hidden");
    this._active = null;

    window.removeEventListener("keydown", this._keyDownBound);
  }

  /**
   * @private
   */
  _keyDown(evt) {
    if (this._active && evt.keyCode === /* Esc = */ 27) {
      this._closeThroughCaller();
      evt.preventDefault();
    }
  }

  /**
   * @private
   */
  _closeThroughCaller() {
    if (this._overlays[this._active].callerCloseMethod) {
      this._overlays[this._active].callerCloseMethod();
    }
    if (this._active) {
      this.close(this._active);
    }
  }
}

export { OverlayManager };
