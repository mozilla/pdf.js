/* Copyright 2023 Mozilla Foundation
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

/**
 * @typedef {Object} ToolbarOptions
 * @property {HTMLDivElement} mainContainer - Main container.
 * @property {HTMLDivElement} container - Container for the toolbar.
 * @property {HTMLButtonElement} download - Button to download the document.
 */

const TIME_BEFORE_SHOWING_TOOLBAR = 200;

class Toolbar {
  #buttons;

  #checkForScrollEndBound = this.#checkForScrollEnd.bind(this);

  #eventBus;

  #hideBound = this.#hide.bind(this);

  #mainContainer;

  #scrollEndTimeoutId = null;

  #showBound = this.#show.bind(this);

  #toolbar;

  /**
   * @param {ToolbarOptions} options
   * @param {EventBus} eventBus
   * @param {IL10n} _l10n - Localization service.
   */
  constructor(options, eventBus, _l10n) {
    this.#toolbar = options.container;
    this.#mainContainer = options.mainContainer;
    this.#eventBus = eventBus;
    this.#buttons = [{ element: options.download, eventName: "download" }];

    // Bind the event listeners for click and various other actions.
    this.#bindListeners(options);
    this.#checkForScrollEnd();
  }

  setPageNumber(pageNumber, pageLabel) {}

  setPagesCount(pagesCount, hasPageLabels) {}

  setPageScale(pageScaleValue, pageScale) {}

  reset() {}

  #bindListeners(options) {
    // The buttons within the toolbar.
    for (const { element, eventName, eventDetails } of this.#buttons) {
      element.addEventListener("click", evt => {
        if (eventName !== null) {
          this.#eventBus.dispatch(eventName, { source: this, ...eventDetails });
        }
      });
    }
  }

  updateLoadingIndicatorState(loading = false) {}

  #checkForScrollEnd() {
    if (this.#scrollEndTimeoutId !== null) {
      clearTimeout(this.#scrollEndTimeoutId);
    }
    this.#scrollEndTimeoutId = setTimeout(
      this.#showBound,
      TIME_BEFORE_SHOWING_TOOLBAR
    );
  }

  #show() {
    this.#toolbar.classList.toggle("show", true);
    this.#mainContainer.removeEventListener(
      "scroll",
      this.#checkForScrollEndBound
    );
    this.#scrollEndTimeoutId = null;
    this.#mainContainer.addEventListener("scroll", this.#hideBound);
  }

  #hide() {
    this.#toolbar.classList.toggle("show", false);
    this.#mainContainer.removeEventListener("scroll", this.#hideBound);
    this.#mainContainer.addEventListener(
      "scroll",
      this.#checkForScrollEndBound
    );
    this.#checkForScrollEnd();
  }
}

export { Toolbar };
