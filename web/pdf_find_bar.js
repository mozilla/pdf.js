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

import { FindState } from "./pdf_find_controller.js";
import { toggleExpandedBtn } from "./ui_utils.js";

const MATCHES_COUNT_LIMIT = 1000;

/**
 * Creates a "search bar" given a set of DOM elements that act as controls
 * for searching or for setting search preferences in the UI. This object
 * also sets up the appropriate events for the controls. Actual searching
 * is done by PDFFindController.
 */
class PDFFindBar {
  #mainContainer;

  #resizeObserver = new ResizeObserver(this.#resizeObserverCallback.bind(this));

  constructor(options, mainContainer, eventBus) {
    this.opened = false;

    this.bar = options.bar;
    this.toggleButton = options.toggleButton;
    this.findField = options.findField;
    this.highlightAll = options.highlightAllCheckbox;
    this.caseSensitive = options.caseSensitiveCheckbox;
    this.matchDiacritics = options.matchDiacriticsCheckbox;
    this.entireWord = options.entireWordCheckbox;
    this.findMsg = options.findMsg;
    this.findResultsCount = options.findResultsCount;
    this.findPreviousButton = options.findPreviousButton;
    this.findNextButton = options.findNextButton;
    this.eventBus = eventBus;
    this.#mainContainer = mainContainer;

    const checkedInputs = new Map([
      [this.highlightAll, "highlightallchange"],
      [this.caseSensitive, "casesensitivitychange"],
      [this.entireWord, "entirewordchange"],
      [this.matchDiacritics, "diacriticmatchingchange"],
    ]);

    // Add event listeners to the DOM elements.
    this.toggleButton.addEventListener("click", () => {
      this.toggle();
    });

    this.findField.addEventListener("input", () => {
      this.dispatchEvent("");
    });

    this.bar.addEventListener("keydown", ({ keyCode, shiftKey, target }) => {
      switch (keyCode) {
        case 13: // Enter
          if (target === this.findField) {
            this.dispatchEvent("again", shiftKey);
          } else if (checkedInputs.has(target)) {
            target.checked = !target.checked;
            this.dispatchEvent(/* evtName = */ checkedInputs.get(target));
          }
          break;
        case 27: // Escape
          this.close();
          break;
      }
    });

    this.findPreviousButton.addEventListener("click", () => {
      this.dispatchEvent("again", true);
    });
    this.findNextButton.addEventListener("click", () => {
      this.dispatchEvent("again", false);
    });

    for (const [elem, evtName] of checkedInputs) {
      elem.addEventListener("click", () => {
        this.dispatchEvent(evtName);
      });
    }
  }

  reset() {
    this.updateUIState();
  }

  dispatchEvent(type, findPrev = false) {
    this.eventBus.dispatch("find", {
      source: this,
      type,
      query: this.findField.value,
      caseSensitive: this.caseSensitive.checked,
      entireWord: this.entireWord.checked,
      highlightAll: this.highlightAll.checked,
      findPrevious: findPrev,
      matchDiacritics: this.matchDiacritics.checked,
    });
  }

  updateUIState(state, previous, matchesCount) {
    const { findField, findMsg } = this;
    let findMsgId = "",
      status = "";

    switch (state) {
      case FindState.FOUND:
        break;
      case FindState.PENDING:
        status = "pending";
        break;
      case FindState.NOT_FOUND:
        findMsgId = "pdfjs-find-not-found";
        status = "notFound";
        break;
      case FindState.WRAPPED:
        findMsgId = previous
          ? "pdfjs-find-reached-top"
          : "pdfjs-find-reached-bottom";
        break;
    }
    findField.setAttribute("data-status", status);
    findField.setAttribute("aria-invalid", state === FindState.NOT_FOUND);

    findMsg.setAttribute("data-status", status);
    if (findMsgId) {
      findMsg.setAttribute("data-l10n-id", findMsgId);
    } else {
      findMsg.removeAttribute("data-l10n-id");
      findMsg.textContent = "";
    }

    this.updateResultsCount(matchesCount);
  }

  updateResultsCount({ current = 0, total = 0 } = {}) {
    const { findResultsCount } = this;

    if (total > 0) {
      const limit = MATCHES_COUNT_LIMIT;

      findResultsCount.setAttribute(
        "data-l10n-id",
        total > limit
          ? "pdfjs-find-match-count-limit"
          : "pdfjs-find-match-count"
      );
      findResultsCount.setAttribute(
        "data-l10n-args",
        JSON.stringify({ limit, current, total })
      );
    } else {
      findResultsCount.removeAttribute("data-l10n-id");
      findResultsCount.textContent = "";
    }
  }

  open() {
    if (!this.opened) {
      // Potentially update the findbar layout, row vs column, when:
      //  - The width of the viewer itself changes.
      //  - The width of the findbar changes, by toggling the visibility
      //    (or localization) of find count/status messages.
      this.#resizeObserver.observe(this.#mainContainer);
      this.#resizeObserver.observe(this.bar);

      this.opened = true;
      toggleExpandedBtn(this.toggleButton, true, this.bar);
    }
    this.findField.select();
    this.findField.focus();
  }

  close() {
    if (!this.opened) {
      return;
    }
    this.#resizeObserver.disconnect();

    this.opened = false;
    toggleExpandedBtn(this.toggleButton, false, this.bar);

    this.eventBus.dispatch("findbarclose", { source: this });
  }

  toggle() {
    if (this.opened) {
      this.close();
    } else {
      this.open();
    }
  }

  #resizeObserverCallback() {
    const { bar } = this;
    // The find bar has an absolute position and thus the browser extends
    // its width to the maximum possible width once the find bar does not fit
    // entirely within the window anymore (and its elements are automatically
    // wrapped). Here we detect and fix that.
    bar.classList.remove("wrapContainers");

    const findbarHeight = bar.clientHeight;
    const inputContainerHeight = bar.firstElementChild.clientHeight;

    if (findbarHeight > inputContainerHeight) {
      // The findbar is taller than the input container, which means that
      // the browser wrapped some of the elements. For a consistent look,
      // wrap all of them to adjust the width of the find bar.
      bar.classList.add("wrapContainers");
    }
  }
}

export { PDFFindBar };
