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
import { NullL10n } from "./ui_utils.js";

const MATCHES_COUNT_LIMIT = 1000;

/**
 * Creates a "search bar" given a set of DOM elements that act as controls
 * for searching or for setting search preferences in the UI. This object
 * also sets up the appropriate events for the controls. Actual searching
 * is done by PDFFindController.
 */
class PDFFindBar {
  constructor(options, eventBus, l10n = NullL10n) {
    this.opened = false;

    this.bar = options.bar || null;
    this.toggleButton = options.toggleButton || null;
    this.findField = options.findField || null;
    this.highlightAll = options.highlightAllCheckbox || null;
    this.caseSensitive = options.caseSensitiveCheckbox || null;
    this.entireWord = options.entireWordCheckbox || null;
    this.findMsg = options.findMsg || null;
    this.findResultsCount = options.findResultsCount || null;
    this.findPreviousButton = options.findPreviousButton || null;
    this.findNextButton = options.findNextButton || null;
    this.eventBus = eventBus;
    this.l10n = l10n;

    // Add event listeners to the DOM elements.
    this.toggleButton.addEventListener("click", () => {
      this.toggle();
    });

    this.findField.addEventListener("input", () => {
      this.dispatchEvent("");
    });

    this.bar.addEventListener("keydown", e => {
      switch (e.keyCode) {
        case 13: // Enter
          if (e.target === this.findField) {
            this.dispatchEvent("again", e.shiftKey);
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

    this.highlightAll.addEventListener("click", () => {
      this.dispatchEvent("highlightallchange");
    });

    this.caseSensitive.addEventListener("click", () => {
      this.dispatchEvent("casesensitivitychange");
    });

    this.entireWord.addEventListener("click", () => {
      this.dispatchEvent("entirewordchange");
    });

    this.eventBus._on("resize", this._adjustWidth.bind(this));
  }

  reset() {
    this.updateUIState();
  }

  dispatchEvent(type, findPrev) {
    this.eventBus.dispatch("find", {
      source: this,
      type,
      query: this.findField.value,
      phraseSearch: true,
      caseSensitive: this.caseSensitive.checked,
      entireWord: this.entireWord.checked,
      highlightAll: this.highlightAll.checked,
      findPrevious: findPrev,
    });
  }

  updateUIState(state, previous, matchesCount) {
    let findMsg = "";
    let status = "";

    switch (state) {
      case FindState.FOUND:
        break;

      case FindState.PENDING:
        status = "pending";
        break;

      case FindState.NOT_FOUND:
        findMsg = this.l10n.get("find_not_found", null, "Phrase not found");
        status = "notFound";
        break;

      case FindState.WRAPPED:
        if (previous) {
          findMsg = this.l10n.get(
            "find_reached_top",
            null,
            "Reached top of document, continued from bottom"
          );
        } else {
          findMsg = this.l10n.get(
            "find_reached_bottom",
            null,
            "Reached end of document, continued from top"
          );
        }
        break;
    }
    this.findField.setAttribute("data-status", status);

    Promise.resolve(findMsg).then(msg => {
      this.findMsg.textContent = msg;
      this._adjustWidth();
    });

    this.updateResultsCount(matchesCount);
  }

  updateResultsCount({ current = 0, total = 0 } = {}) {
    if (!this.findResultsCount) {
      return; // No UI control is provided.
    }
    const limit = MATCHES_COUNT_LIMIT;
    let matchesCountMsg = "";

    if (total > 0) {
      if (total > limit) {
        if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
          // TODO: Remove this hard-coded `[other]` form once plural support has
          // been implemented in the mozilla-central specific `l10n.js` file.
          matchesCountMsg = this.l10n.get(
            "find_match_count_limit[other]",
            {
              limit,
            },
            "More than {{limit}} matches"
          );
        } else {
          matchesCountMsg = this.l10n.get(
            "find_match_count_limit",
            {
              limit,
            },
            "More than {{limit}} match" + (limit !== 1 ? "es" : "")
          );
        }
      } else {
        if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
          // TODO: Remove this hard-coded `[other]` form once plural support has
          // been implemented in the mozilla-central specific `l10n.js` file.
          matchesCountMsg = this.l10n.get(
            "find_match_count[other]",
            {
              current,
              total,
            },
            "{{current}} of {{total}} matches"
          );
        } else {
          matchesCountMsg = this.l10n.get(
            "find_match_count",
            {
              current,
              total,
            },
            "{{current}} of {{total}} match" + (total !== 1 ? "es" : "")
          );
        }
      }
    }
    Promise.resolve(matchesCountMsg).then(msg => {
      this.findResultsCount.textContent = msg;
      this.findResultsCount.classList.toggle("hidden", !total);
      // Since `updateResultsCount` may be called from `PDFFindController`,
      // ensure that the width of the findbar is always updated correctly.
      this._adjustWidth();
    });
  }

  open() {
    if (!this.opened) {
      this.opened = true;
      this.toggleButton.classList.add("toggled");
      this.bar.classList.remove("hidden");
    }
    this.findField.select();
    this.findField.focus();

    this._adjustWidth();
  }

  close() {
    if (!this.opened) {
      return;
    }
    this.opened = false;
    this.toggleButton.classList.remove("toggled");
    this.bar.classList.add("hidden");

    this.eventBus.dispatch("findbarclose", { source: this });
  }

  toggle() {
    if (this.opened) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * @private
   */
  _adjustWidth() {
    if (!this.opened) {
      return;
    }

    // The find bar has an absolute position and thus the browser extends
    // its width to the maximum possible width once the find bar does not fit
    // entirely within the window anymore (and its elements are automatically
    // wrapped). Here we detect and fix that.
    this.bar.classList.remove("wrapContainers");

    const findbarHeight = this.bar.clientHeight;
    const inputContainerHeight = this.bar.firstElementChild.clientHeight;

    if (findbarHeight > inputContainerHeight) {
      // The findbar is taller than the input container, which means that
      // the browser wrapped some of the elements. For a consistent look,
      // wrap all of them to adjust the width of the find bar.
      this.bar.classList.add("wrapContainers");
    }
  }
}

export { PDFFindBar };
