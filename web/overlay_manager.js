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

  get active() {
    return this.#active;
  }

  /**
   * @param {string} name - The name of the overlay that is registered.
   * @param {HTMLDialogElement} dialog - The overlay's DOM element.
   * @param {boolean} [canForceClose] - Indicates if opening the overlay closes
   *                  an active overlay. The default is `false`.
   * @returns {Promise} A promise that is resolved when the overlay has been
   *                    registered.
   */
  async register(name, dialog, canForceClose = false) {
    if (!name || !dialog) {
      throw new Error("Not enough parameters.");
    } else if (this.#overlays[name]) {
      throw new Error("The overlay is already registered.");
    }
    this.#overlays[name] = { dialog, canForceClose };

    dialog.addEventListener("cancel", evt => {
      this.#active = null;
    });
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
        await this.close();
      } else {
        throw new Error("Another overlay is currently active.");
      }
    }
    this.#active = name;
    this.#overlays[this.#active].dialog.showModal();
  }

  /**
   * @param {string} name - The name of the overlay that should be closed.
   * @returns {Promise} A promise that is resolved when the overlay has been
   *                    closed.
   */
  async close(name = this.#active) {
    if (!this.#overlays[name]) {
      throw new Error("The overlay does not exist.");
    } else if (!this.#active) {
      throw new Error("The overlay is currently not active.");
    } else if (this.#active !== name) {
      throw new Error("Another overlay is currently active.");
    }
    this.#overlays[this.#active].dialog.close();
    this.#active = null;
  }
}

export { OverlayManager };
