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

  /**
   * Create a menu for the given button.
   * @param {HTMLElement} menuContainer
   * @param {HTMLElement} triggeringButton
   * @param {Array<HTMLElement>|null} menuItems
   */
  constructor(menuContainer, triggeringButton, menuItems) {
    this.#menu = menuContainer;
    this.#triggeringButton = triggeringButton;
    if (Array.isArray(menuItems)) {
      this.#menuItems = menuItems;
    } else {
      this.#menuItems = [];
      for (const button of this.#menu.querySelectorAll("button")) {
        this.#menuItems.push(button);
      }
    }
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
   * Set up the menu.
   */
  #setUpMenu() {
    this.#triggeringButton.addEventListener("click", e => {
      if (this.#openMenuAC) {
        this.#closeMenu();
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
          if (target !== this.#triggeringButton && !menu.contains(target)) {
            this.#closeMenu();
          }
        },
        { signal }
      );
      window.addEventListener("blur", this.#closeMenu.bind(this), { signal });
    });

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
          case "Tab":
            this.#goToNextItem(e.target, true);
            stopEvent(e);
            break;
          case "ArrowUp":
          case "ShiftTab":
            this.#goToNextItem(e.target, false);
            stopEvent(e);
            break;
          case "Home":
            this.#menuItems
              .find(
                item => !item.disabled && !item.classList.contains("hidden")
              )
              .focus();
            stopEvent(e);
            break;
          case "End":
            this.#menuItems
              .findLast(
                item => !item.disabled && !item.classList.contains("hidden")
              )
              .focus();
            stopEvent(e);
            break;
          default:
            const char = e.key.toLocaleLowerCase();
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
            if (!this.#openMenuAC) {
              this.#triggeringButton.click();
            }
            this.#menuItems
              .find(
                item => !item.disabled && !item.classList.contains("hidden")
              )
              .focus();
            stopEvent(e);
            break;
          case "ArrowUp":
          case "End":
            if (!this.#openMenuAC) {
              this.#triggeringButton.click();
            }
            this.#menuItems
              .findLast(
                item => !item.disabled && !item.classList.contains("hidden")
              )
              .focus();
            stopEvent(e);
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

  destroy() {
    this.#closeMenu();
    this.#menuAC?.abort();
    this.#menuAC = null;
  }
}

export { Menu };
