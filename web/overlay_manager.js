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
  #overlays = Object.create(null);

  #active = null;

  #keyDownBound = null;

  get active() {
    return this.#active;
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
    } else if (this.#overlays[name]) {
      throw new Error("The overlay is already registered.");
    }
    this.#overlays[name] = {
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
    if (!this.#overlays[name]) {
      throw new Error("The overlay does not exist.");
    } else if (this.#active === name) {
      throw new Error("The overlay cannot be removed while it is active.");
    }
    delete this.#overlays[name];
  }

  /**
   * @param {string} name - The name of the overlay that should be opened.
   * @returns {Promise} A promise that is resolved when the overlay has been
   *                    opened.
   */
  async open(name) {
    if (!this.#overlays[name]) {
      throw new Error("The overlay does not exist.");
    } else if (this.#active) {
      if (this.#active === name) {
        throw new Error("The overlay is already active.");
      } else if (this.#overlays[name].canForceClose) {
        this.#closeThroughCaller();
      } else {
        throw new Error("Another overlay is currently active.");
      }
    }
    this.#active = name;
    this.#overlays[this.#active].element.classList.remove("hidden");
    this.#overlays[this.#active].container.classList.remove("hidden");

    this.#keyDownBound = this.#keyDown.bind(this);
    window.addEventListener("keydown", this.#keyDownBound);
  }

  /**
   * @param {string} name - The name of the overlay that should be closed.
   * @returns {Promise} A promise that is resolved when the overlay has been
   *                    closed.
   */
  async close(name) {
    if (!this.#overlays[name]) {
      throw new Error("The overlay does not exist.");
    } else if (!this.#active) {
      throw new Error("The overlay is currently not active.");
    } else if (this.#active !== name) {
      throw new Error("Another overlay is currently active.");
    }
    this.#overlays[this.#active].container.classList.add("hidden");
    this.#overlays[this.#active].element.classList.add("hidden");
    this.#active = null;

    window.removeEventListener("keydown", this.#keyDownBound);
    this.#keyDownBound = null;
  }

  #keyDown(evt) {
    if (this.#active && evt.keyCode === /* Esc = */ 27) {
      this.#closeThroughCaller();
      evt.preventDefault();
    }
  }

  #closeThroughCaller() {
    if (this.#overlays[this.#active].callerCloseMethod) {
      this.#overlays[this.#active].callerCloseMethod();
    }
    if (this.#active) {
      this.close(this.#active);
    }
  }
}

export { OverlayManager };
