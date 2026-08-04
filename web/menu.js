/* Copyright 2025 Mozilla Foundation
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

import { noContextMenu, stopEvent } from "pdfjs-lib";

class Menu {
  #triggeringButton;

  #menu;

  #menuItems;

  #openMenuAC = null;

  #menuAC = new AbortController();

  #lastIndex = -1;

  #onFocusOutBound = this.#onFocusOut.bind(this);

  /**
   * Create a menu for the given button.
   * @param {HTMLElement} menuContainer
   * @param {HTMLElement} triggeringButton
   * @param {Array<HTMLElement>|null} menuItems
   */
  constructor(menuContainer, triggeringButton, menuItems) {
    this.#menu = menuContainer;
    this.#triggeringButton = triggeringButton;
    this.#menuItems = Array.isArray(menuItems)
      ? menuItems
      : [...this.#menu.querySelectorAll("button")];
    this.#setUpMenu();
  }

  /**
   * Close the menu.
   */
  #closeMenu() {
    if (!this.#openMenuAC) {
      return;
    }
    const menu = this.#menu;
    this.#triggeringButton.ariaExpanded = "false";
    this.#openMenuAC.abort();
    this.#openMenuAC = null;
    if (menu.contains(document.activeElement)) {
      // If the menu is closed while focused, focus the actions button.
      setTimeout(() => {
        if (!menu.contains(document.activeElement)) {
          this.#triggeringButton.focus();
        }
      }, 0);
    }
    this.#lastIndex = -1;
  }

  /**
   * Open the menu.
   */
  #openMenu() {
    if (this.#openMenuAC) {
      return;
    }

    const menu = this.#menu;
    this.#triggeringButton.ariaExpanded = "true";
    this.#openMenuAC = new AbortController();
    const signal = AbortSignal.any([
      this.#menuAC.signal,
      this.#openMenuAC.signal,
    ]);
    window.addEventListener(
      "pointerdown",
      ({ target }) => {
        if (
          !this.#triggeringButton.contains(target) &&
          !menu.contains(target)
        ) {
          this.#closeMenu();
        }
      },
      { signal }
    );
    const closeMenu = this.#closeMenu.bind(this);
    window.addEventListener("blur", closeMenu, { signal });
    menu.addEventListener("focusout", this.#onFocusOutBound, { signal });
  }

  #onFocusOut({ relatedTarget }) {
    if (
      !this.#triggeringButton.contains(relatedTarget) &&
      !this.#menu.contains(relatedTarget)
    ) {
      this.#closeMenu();
    }
  }

  /**
   * Set up the menu.
   */
  #setUpMenu() {
    this.#triggeringButton.addEventListener("click", e => {
      if (this.#openMenuAC) {
        this.#closeMenu();
        return;
      }

      this.#openMenu();
    });
    this.#triggeringButton.addEventListener("focusout", this.#onFocusOutBound);

    const { signal } = this.#menuAC;

    this.#menu.addEventListener(
      "keydown",
      e => {
        switch (e.key) {
          case "Escape":
            this.#closeMenu();
            stopEvent(e);
            break;
          case "ArrowDown":
            this.#goToNextItem(e.target, true);
            stopEvent(e);
            break;
          case "ArrowUp":
            this.#goToNextItem(e.target, false);
            stopEvent(e);
            break;
          case "Home":
            this.#goToFirstLast(false);
            stopEvent(e);
            break;
          case "End":
            this.#goToFirstLast(true);
            stopEvent(e);
            break;
          default:
            const { key } = e;
            if (!/^\p{L}$/u.test(key)) {
              // It isn't a single letter, so ignore it.
              break;
            }
            const char = key.toLocaleLowerCase();
            this.#goToNextItem(e.target, true, item =>
              item.textContent.trim().toLowerCase().startsWith(char)
            );
            stopEvent(e);
            break;
        }
      },
      { signal, capture: true }
    );
    this.#menu.addEventListener("contextmenu", noContextMenu, { signal });
    this.#menu.addEventListener("click", this.#closeMenu.bind(this), {
      signal,
      capture: true,
    });
    this.#triggeringButton.addEventListener(
      "keydown",
      e => {
        switch (e.key) {
          case " ":
          case "Enter":
          case "ArrowDown":
          case "Home":
            stopEvent(e);
            if (!this.#openMenuAC) {
              this.#openMenu();
            }
            this.#goToFirstLast(false);
            break;
          case "ArrowUp":
          case "End":
            stopEvent(e);
            if (!this.#openMenuAC) {
              this.#openMenu();
            }
            this.#goToFirstLast(true);
            break;
          case "Escape":
            this.#closeMenu();
            stopEvent(e);
            break;
        }
      },
      { signal }
    );
  }

  /**
   * Go to the next/previous menu item.
   * @param {HTMLElement} element
   * @param {boolean} forward
   */
  #goToNextItem(element, forward, check = () => true) {
    const index =
      this.#lastIndex === -1
        ? this.#menuItems.indexOf(element)
        : this.#lastIndex;
    const len = this.#menuItems.length;
    const increment = forward ? 1 : len - 1;
    for (
      let i = (index + increment) % len;
      i !== index;
      i = (i + increment) % len
    ) {
      const menuItem = this.#menuItems[i];
      if (
        !menuItem.disabled &&
        !menuItem.classList.contains("hidden") &&
        check(menuItem)
      ) {
        menuItem.focus();
        this.#lastIndex = i;
        break;
      }
    }
  }

  /**
   * Go to the first/last menu item.
   * @param {boolean} [last]
   */
  #goToFirstLast(last = false) {
    const i = this.#menuItems[last ? "findLastIndex" : "findIndex"](
      item => !item.disabled && !item.classList.contains("hidden")
    );
    if (i >= 0) {
      this.#menuItems[i].focus();
      this.#lastIndex = i;
    }
  }

  destroy() {
    this.#closeMenu();
    this.#menuAC?.abort();
    this.#menuAC = null;
  }
}

export { Menu };
