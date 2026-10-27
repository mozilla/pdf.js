/* Copyright 2026 Mozilla Foundation
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

import { internalOpt } from "./internal_evt.js";
import { MathClamp } from "pdfjs-lib";
import { RenderingStates } from "./renderable_view.js";

/** @typedef {import("./event_utils").EventBus} EventBus */
/** @typedef {import("./pdf_viewer").PDFViewer} PDFViewer */
/** @typedef {import("./view_history").ViewHistory} ViewHistory */

// Default, and allowed, number of marks to remember; the user's choice is
// kept in `localStorage`.
const DEFAULT_MAX_ENTRIES = 5;
const MAX_ENTRIES_CHOICES = [1, 2, 3, 4, 5];
const MAX_ENTRIES_STORAGE_KEY = "pdfjs.jumpHistoryMaxEntries";
// When marking the selected line, keep this much space (in PDF units) above it
// once returning there.
const MARK_MARGIN = 24;
// Marks on the same page whose tops are this close (in PDF units) are the same
// line, i.e. marking it again doesn't add another mark.
const SAME_LINE_DISTANCE = 2;
// Maximum length of the text shown for a mark in the list.
const MAX_TEXT_LENGTH = 80;
// How long (in milliseconds) the line is flashed when going to a position.
const FLASH_DURATION = 1600;

/**
 * Two independent ways of getting back to a reading position:
 *
 *  - Marks, set explicitly with `M` or from the floating toolbar shown when
 *    selecting text. Marked lines are highlighted on their page, and can be
 *    listed (to jump directly to any of them, or save them to a JSON file) and
 *    cycled through with `C` and `Shift+C`, wrapping around at either end.
 *    Nothing else ever adds to, or changes, the marks.
 *
 *  - A single return point, remembered when following a link, an outline
 *    item, a thumbnail or typing a page number. `B` (or the floating button)
 *    goes back to where that navigation started; pressing it again goes back
 *    to where it was pressed, i.e. it toggles between both places.
 *
 * The line of the position being gone to is briefly flashed.
 *
 * Unlike `PDFHistory` this is independent of the browser history.
 */
class PDFJumpHistory {
  // The marks, oldest first.
  #marks = [];

  // The index of the mark last gone to, or added; -1 if none.
  #markIndex = -1;

  // Where to go back to with `B`.
  #returnPosition = null;

  #currentLocation = null;

  #enabled = false;

  #maxEntries = DEFAULT_MAX_ENTRIES;

  #store = null;

  #filename = "document.pdf";

  #panelAbortController = null;

  #clearTimeout = null;

  /**
   * @param {object} options - The DOM elements of the floating buttons.
   * @param {HTMLDivElement} options.container
   * @param {HTMLButtonElement} options.backButton
   * @param {HTMLButtonElement} options.listButton
   * @param {HTMLDivElement} options.panel
   * @param {HTMLOListElement} options.entries
   * @param {HTMLButtonElement} options.saveButton
   * @param {HTMLSelectElement} options.maxEntriesSelect
   * @param {HTMLButtonElement} options.clearButton
   * @param {EventBus} eventBus - The application event bus.
   * @param {PDFViewer} pdfViewer - The PDF viewer.
   */
  constructor(
    {
      container,
      backButton,
      listButton,
      panel,
      entries,
      saveButton,
      maxEntriesSelect,
      clearButton,
    },
    eventBus,
    pdfViewer
  ) {
    this.container = container;
    this.backButton = backButton;
    this.listButton = listButton;
    this.panel = panel;
    this.entries = entries;
    this.eventBus = eventBus;
    this.pdfViewer = pdfViewer;

    backButton.addEventListener("click", () => this.toggleReturn());
    listButton.addEventListener("click", () => this.togglePanel());
    saveButton.addEventListener("click", () => this.saveToFile());

    // Clearing needs a second click, to confirm it.
    clearButton.addEventListener("click", () => {
      if (this.#clearTimeout) {
        this.#resetClearButton(clearButton);
        this.clearAll();
        return;
      }
      clearButton.classList.add("confirm");
      clearButton.setAttribute(
        "data-l10n-id",
        "pdfjs-jump-history-clear-button-confirm"
      );
      this.#clearTimeout = setTimeout(
        () => this.#resetClearButton(clearButton),
        3000
      );
    });
    this.clearButton = clearButton;

    // Add the buttons to the toolbar shown when selecting text, next to the
    // highlight and comment ones.
    eventBus.on(
      "annotationeditoruimanager",
      ({ uiManager }) => {
        uiManager.addFloatingToolbarButton({
          className: "jumpHistoryMarkButton",
          l10nId: "pdfjs-jump-history-mark-floating-button",
          labelL10nId: "pdfjs-jump-history-mark-floating-button-label",
          onClick: () => this.markSelection(),
        });
        uiManager.addFloatingToolbarButton({
          className: "jumpHistoryListButton",
          l10nId: "pdfjs-jump-history-list-floating-button",
          labelL10nId: "pdfjs-jump-history-list-floating-button-label",
          onClick: () => {
            document.getSelection()?.removeAllRanges();
            this.openPanel();
          },
        });
      },
      internalOpt
    );

    try {
      const stored = parseInt(
        localStorage.getItem(MAX_ENTRIES_STORAGE_KEY),
        10
      );
      if (MAX_ENTRIES_CHOICES.includes(stored)) {
        this.#maxEntries = stored;
      }
    } catch {
      // Unable to read from storage; ignoring errors.
    }
    maxEntriesSelect.replaceChildren(
      ...MAX_ENTRIES_CHOICES.map(n => new Option(n, n))
    );
    maxEntriesSelect.value = this.#maxEntries;
    maxEntriesSelect.addEventListener("change", () =>
      this.setMaxEntries(parseInt(maxEntriesSelect.value, 10))
    );

    eventBus.on(
      "updateviewarea",
      ({ location }) => {
        this.#currentLocation = location;
      },
      internalOpt
    );
    eventBus.on(
      "beforenavigate",
      this.#onBeforeNavigate.bind(this),
      internalOpt
    );
    // Rendering a page (e.g. after zooming or rotating) removes the
    // highlights from it.
    eventBus.on(
      "pagerendered",
      ({ pageNumber }) => this.#renderHighlights(pageNumber),
      internalOpt
    );

    this.#render();
  }

  /**
   * Start tracking positions, once the initial view of the document is set.
   * @param {ViewHistory|null} store - Used to persist the marks per file.
   * @param {string} filename - Used to name the file the marks are saved to.
   */
  async initialize(store, filename) {
    this.#enabled = true;
    this.#store = store;
    this.#filename = filename || "document.pdf";
    this.#render();
    if (!store) {
      return;
    }
    try {
      const {
        jumpHistoryMarks,
        jumpHistory,
        jumpHistoryForward,
        jumpHistoryMark,
      } = await store.getMultiple({
        jumpHistoryMarks: null,
        // Previously, the marks were stored along with the other positions.
        jumpHistory: null,
        jumpHistoryForward: null,
        jumpHistoryMark: null,
      });
      if (this.#store !== store) {
        return;
      }
      const stored = Array.isArray(jumpHistoryMarks)
        ? jumpHistoryMarks
        : [
            ...(Array.isArray(jumpHistory) ? jumpHistory : []),
            ...(Array.isArray(jumpHistoryForward)
              ? jumpHistoryForward.toReversed()
              : []),
            jumpHistoryMark,
          ].filter(pos => pos?.marked);

      const pagesCount = this.pdfViewer.pagesCount;
      const marks = stored
        .filter(
          pos =>
            Number.isInteger(pos?.pageNumber) &&
            pos.pageNumber >= 1 &&
            pos.pageNumber <= pagesCount
        )
        .map(pos => this.#toPosition(pos));
      // Marks added before the stored ones were loaded are the newest.
      this.#marks.unshift(...marks);
      this.#markIndex = this.#marks.length ? this.#marks.length - 1 : -1;
      this.#trim();
      this.#render();
    } catch {
      // Unable to read from storage; ignoring errors.
    }
  }

  reset() {
    this.#marks.length = 0;
    this.#markIndex = -1;
    this.#returnPosition = null;
    this.#currentLocation = null;
    this.#enabled = false;
    this.#store = null;
    this.closePanel();
    this.#resetClearButton(this.clearButton);
    this.#render();
  }

  get canReturn() {
    return !!this.#returnPosition;
  }

  get hasMarks() {
    return this.#marks.length > 0;
  }

  get maxEntries() {
    return this.#maxEntries;
  }

  /**
   * Change how many marks are remembered, dropping the oldest ones when there
   * are now too many.
   * @param {number} value
   */
  setMaxEntries(value) {
    if (!MAX_ENTRIES_CHOICES.includes(value)) {
      return;
    }
    this.#maxEntries = value;
    try {
      localStorage.setItem(MAX_ENTRIES_STORAGE_KEY, value);
    } catch {
      // Unable to write to storage.
    }
    this.#trim();
    this.#render();
    this.#save();
  }

  get isPanelOpen() {
    return !this.panel.hidden;
  }

  /**
   * Go back to where the last navigation (link, outline, ...) started; doing
   * it again returns to where this was done.
   */
  toggleReturn() {
    const target = this.#returnPosition;
    if (!target) {
      return;
    }
    const location = this.#currentLocation;
    this.#returnPosition = location ? this.#toPosition(location) : null;

    this.#goTo(target);
    this.#render();
    this.#flash(target);
  }

  /**
   * Go to the previous (older) mark, or wrap around to the newest one.
   */
  cycleBack() {
    const count = this.#marks.length;
    if (count) {
      this.#goToMark(
        this.#markIndex < 0 ? count - 1 : (this.#markIndex - 1 + count) % count
      );
    }
  }

  /**
   * Go to the next (newer) mark, or wrap around to the oldest one.
   */
  cycleForward() {
    const count = this.#marks.length;
    if (count) {
      this.#goToMark((this.#markIndex + 1) % count);
    }
  }

  #goToMark(index) {
    const mark = this.#marks[index];
    if (!mark) {
      return;
    }
    this.#markIndex = index;
    this.#goTo(mark);
    this.#render();
    this.#flash(mark);
  }

  #toPosition({ pageNumber, left, top, text, textTop, textLeft, line }) {
    const position = {
      pageNumber,
      left: Math.round(left),
      top: Math.round(top),
      text: text ?? null,
      // The bounds of the line, in PDF units: [x1, y1, x2, y2].
      line: line ?? null,
    };
    if (position.text === null || position.line === null) {
      const ready = this.#getLine(
        pageNumber,
        textTop ?? top,
        textLeft ?? null
      ).then(({ text: lineText, line: lineRect }) => {
        position.text ??= lineText;
        position.line = lineRect;
        this.#render();
        this.#save();
      });
      // Not enumerable, such that it's not saved along with the position.
      Object.defineProperty(position, "ready", { value: ready });
    }
    return position;
  }

  /**
   * Get the text, and bounds, of the first line at, or below, `top` (in PDF
   * units).
   * @returns {Promise<{text: string, line: Array<number>|undefined}>}
   */
  async #getLine(pageNumber, top, x = null) {
    try {
      const page = await this.pdfViewer.pdfDocument.getPage(pageNumber);
      const { items } = await page.getTextContent();
      // When `x` is known, only consider the text at that horizontal position,
      // since the lines of different columns are often at similar heights.
      const isAtX = ({ transform, width }) =>
        x === null || (transform[4] <= x + 1 && transform[4] + width >= x - 1);

      // Find the line: the nearest baseline at, or below, `top`. When guessing
      // (i.e. without `x`), ignore lone characters such as footnote markers;
      // otherwise a single selected character (e.g. in an equation) is fine.
      let lineY = -Infinity,
        lineHeight = 10;
      for (const item of items) {
        const y = item.transform[5];
        const length = item.str.trim().length;
        if (
          length > (x === null ? 1 : 0) &&
          y <= top &&
          y > lineY &&
          isAtX(item)
        ) {
          lineY = y;
          lineHeight = item.height || 10;
        }
      }
      // Find the column at `x` (or at the start of the line), such that the
      // lines of neighbouring columns aren't merged. Count, for each position,
      // how many nearby text items cover it: a gutter between columns is
      // covered much less than the column itself (only by e.g. a title over
      // all of them), whereas the gaps within e.g. an equation are covered by
      // the lines of the paragraphs around it.
      const nearbyItems = items.filter(
        ({ transform, width }) =>
          width > 0 && Math.abs(transform[5] - lineY) < 8 * lineHeight
      );
      const minX = Math.floor(
        Math.min(...nearbyItems.map(({ transform }) => transform[4]))
      );
      const maxX = Math.ceil(
        Math.max(...nearbyItems.map(i => i.transform[4] + i.width))
      );
      const coverage = new Uint16Array(Math.max(maxX - minX + 1, 1));
      for (const { transform, width } of nearbyItems) {
        const from = Math.floor(transform[4]) - minX;
        const to = Math.ceil(transform[4] + width) - minX;
        for (let i = from; i < to; i++) {
          coverage[i]++;
        }
      }
      const startX =
        x ??
        Math.min(
          ...items
            .filter(({ transform }) => Math.abs(transform[5] - lineY) < 2)
            .map(({ transform }) => transform[4])
        );
      const at = MathClamp(Math.round(startX) - minX, 0, maxX - minX);
      const threshold = 0.4 * coverage[at];
      let colStart = at,
        colEnd = at;
      while (colStart > 0 && coverage[colStart - 1] > threshold) {
        colStart--;
      }
      while (colEnd < maxX - minX && coverage[colEnd + 1] > threshold) {
        colEnd++;
      }
      colStart += minX;
      colEnd += minX;

      // Besides the text on the same baseline, include what's slightly above
      // or below it: super/subscripts, fractions, operators of equations...
      const lineRun = items
        .filter(({ str, transform, width }) => {
          const dy = transform[5] - lineY;
          const middle = transform[4] + width / 2;
          return (
            middle >= colStart - 1 &&
            middle <= colEnd + 1 &&
            (Math.abs(dy) < 2 ||
              (str.trim() && dy > -0.6 * lineHeight && dy < 0.8 * lineHeight))
          );
        })
        .sort((a, b) => a.transform[4] - b.transform[4]);

      const parts = [];
      let x1 = Infinity,
        y1 = Infinity,
        x2 = -Infinity,
        y2 = -Infinity;
      for (const { str, transform, width, height } of lineRun) {
        parts.push(str);
        // Cover the descenders below, and the ascenders above, the baseline.
        const h = height || lineHeight;
        x1 = Math.min(x1, transform[4]);
        x2 = Math.max(x2, transform[4] + width);
        y1 = Math.min(y1, transform[5] - 0.3 * h);
        y2 = Math.max(y2, transform[5] + 0.95 * h);
      }
      const text = parts.join(" ").replaceAll(/\s+/g, " ").trim();
      const line = parts.length
        ? [x1 - 2, y1, x2 + 2, y2].map(Math.round)
        : undefined;
      return {
        text:
          text.length > MAX_TEXT_LENGTH
            ? `${text.slice(0, MAX_TEXT_LENGTH - 1)}…`
            : text,
        line,
      };
    } catch {
      return { text: "", line: undefined };
    }
  }

  /**
   * Draw `position`'s line on its page, if that page is currently rendered.
   * @returns {HTMLDivElement|null}
   */
  #drawLine(position, className) {
    const pageView = this.pdfViewer.getPageView(position.pageNumber - 1);
    if (!position.line || !pageView?.div) {
      return null;
    }
    const { viewport } = pageView;
    const [px1, py1, px2, py2] = position.line;
    const [x1, y1] = viewport.convertToViewportPoint(px1, py1);
    const [x2, y2] = viewport.convertToViewportPoint(px2, py2);
    const div = document.createElement("div");
    div.className = className;
    div.setAttribute("aria-hidden", "true");
    // Percentages keep it in place while zooming, before the page re-renders.
    const { width, height } = viewport;
    Object.assign(div.style, {
      left: `${(100 * Math.min(x1, x2)) / width}%`,
      top: `${(100 * Math.min(y1, y2)) / height}%`,
      width: `${(100 * Math.abs(x2 - x1)) / width}%`,
      height: `${(100 * Math.abs(y2 - y1)) / height}%`,
    });
    pageView.div.append(div);
    return div;
  }

  /**
   * Highlight the marked lines; on the given page only, or on all pages.
   * @param {number} [pageNumber]
   */
  #renderHighlights(pageNumber = 0) {
    const selector = pageNumber
      ? `.page[data-page-number="${pageNumber}"] .jumpHistoryHighlight`
      : ".jumpHistoryHighlight";
    for (const div of this.pdfViewer.viewer.querySelectorAll(selector)) {
      div.remove();
    }
    if (!this.#enabled) {
      return;
    }
    for (const mark of this.#marks) {
      if (!pageNumber || mark.pageNumber === pageNumber) {
        this.#drawLine(mark, "jumpHistoryHighlight");
      }
    }
  }

  /**
   * Briefly flash the line of `position`, to make it easy to spot.
   */
  async #flash(position) {
    await position.ready;
    // Wait for the page to be scrolled into view, and rendered if it wasn't
    // already since that removes anything drawn on it.
    await new Promise(resolve => {
      setTimeout(resolve, 50);
    });
    const pageView = this.pdfViewer.getPageView(position.pageNumber - 1);
    if (pageView && pageView.renderingState !== RenderingStates.FINISHED) {
      await new Promise(resolve => {
        const ac = new AbortController();
        const done = () => {
          ac.abort();
          resolve();
        };
        this.eventBus.on(
          "pagerendered",
          evt => evt.pageNumber === position.pageNumber && done(),
          { signal: ac.signal, ...internalOpt }
        );
        setTimeout(done, 2000);
      });
    }
    const div = this.#drawLine(position, "jumpHistoryFlash");
    if (div) {
      setTimeout(() => div.remove(), FLASH_DURATION);
    }
  }

  togglePanel() {
    if (this.isPanelOpen) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  openPanel() {
    if (this.isPanelOpen || this.container.hidden) {
      return;
    }
    this.panel.hidden = false;
    this.listButton.setAttribute("aria-expanded", "true");
    this.#renderPanel();

    this.#panelAbortController = new AbortController();
    const { signal } = this.#panelAbortController;
    window.addEventListener(
      "pointerdown",
      evt => {
        if (
          !this.panel.contains(evt.target) &&
          !this.listButton.contains(evt.target)
        ) {
          this.closePanel();
        }
      },
      { signal }
    );
    window.addEventListener(
      "keydown",
      evt => {
        if (evt.key === "Escape") {
          this.closePanel();
          this.listButton.focus();
          evt.preventDefault();
          evt.stopPropagation();
        }
      },
      { signal, capture: true }
    );
    this.panel.querySelector("[aria-current] button, button")?.focus();
  }

  #resetClearButton(button) {
    clearTimeout(this.#clearTimeout);
    this.#clearTimeout = null;
    button.classList.remove("confirm");
    button.setAttribute("data-l10n-id", "pdfjs-jump-history-clear-button");
  }

  closePanel() {
    this.#panelAbortController?.abort();
    this.#panelAbortController = null;
    this.panel.hidden = true;
    this.listButton.setAttribute("aria-expanded", "false");
  }

  #renderPanel() {
    if (!this.isPanelOpen) {
      return;
    }
    if (!this.#marks.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.setAttribute("data-l10n-id", "pdfjs-jump-history-entry-empty");
      this.entries.replaceChildren(li);
      return;
    }
    const items = this.#marks.map((mark, index) => {
      const li = document.createElement("li");
      if (index === this.#markIndex) {
        li.setAttribute("aria-current", "true");
      }

      const button = document.createElement("button");
      button.type = "button";

      const page = document.createElement("span");
      page.className = "jumpHistoryEntryPage";
      page.setAttribute("data-l10n-id", "pdfjs-jump-history-entry-page");
      page.setAttribute(
        "data-l10n-args",
        JSON.stringify({ page: mark.pageNumber })
      );

      const text = document.createElement("span");
      text.className = "jumpHistoryEntryText";
      if (mark.text) {
        text.textContent = mark.text;
      } else {
        text.setAttribute(
          "data-l10n-id",
          mark.text === null
            ? "pdfjs-jump-history-entry-loading"
            : "pdfjs-jump-history-entry-no-text"
        );
      }
      button.append(page, text);
      button.addEventListener("click", () => {
        this.closePanel();
        this.#goToMark(index);
      });
      li.append(button);
      return li;
    });
    this.entries.replaceChildren(...items);
  }

  /**
   * Download all the marks, oldest first, as a JSON file.
   */
  saveToFile() {
    const marks = this.#marks.map((mark, i) => ({
      order: i + 1,
      page: mark.pageNumber,
      left: mark.left,
      top: mark.top,
      text: mark.text || "",
    }));
    const data = {
      document: this.#filename,
      fingerprint: this.pdfViewer.pdfDocument?.fingerprints[0] ?? null,
      savedAt: new Date().toISOString(),
      marks,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${this.#filename.replace(/\.pdf$/i, "")}-marks.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  #goTo({ pageNumber, left, top }) {
    // Not using the link service, hence this isn't a navigation to return
    // from.
    this.pdfViewer.scrollPageIntoView({
      pageNumber,
      destArray: [null, { name: "XYZ" }, left, top, null],
      allowNegativeOffset: true,
      ignoreDestinationZoom: true,
    });
    this.pdfViewer.focus();
  }

  /**
   * Mark the position at the top of the view.
   */
  markCurrentPosition() {
    const location = this.#currentLocation;
    if (location) {
      this.#addMark({ ...location, text: null });
    }
  }

  /**
   * Mark the line at the given height of a page.
   * @param {number} pageNumber
   * @param {number} top - The top of the line, in PDF units.
   * @param {number} textTop - Somewhere within the line (e.g. its middle),
   *   which must be above its baseline, in PDF units.
   * @param {number} [textLeft] - A horizontal position within the line, in
   *   PDF units; used to find the right column in multi-column layouts.
   */
  markAt(pageNumber, top, textTop, textLeft = null) {
    const location = this.#currentLocation;
    if (!location || !Number.isInteger(pageNumber)) {
      return;
    }
    // Don't go above the page, otherwise the end of the previous one would be
    // shown when returning to the mark.
    const pageTop =
      this.pdfViewer.getPageView(pageNumber - 1)?.pdfPage?.view[3] ?? Infinity;
    this.#addMark({
      pageNumber,
      left: location.left,
      top: Math.min(top + MARK_MARGIN, pageTop),
      textTop,
      textLeft,
      text: null,
    });
  }

  #addMark(location) {
    const mark = this.#toPosition(location);
    // Marking the same line again moves it to the end, rather than adding it
    // twice.
    this.#marks = this.#marks.filter(
      ({ pageNumber, top }) =>
        pageNumber !== mark.pageNumber ||
        Math.abs(top - mark.top) > SAME_LINE_DISTANCE
    );
    this.#marks.push(mark);
    this.#markIndex = this.#marks.length - 1;
    this.#trim();
    this.#render();
    this.#save();
    this.#flash(mark);
  }

  /**
   * Mark the line of the selected text, from the floating toolbar shown when
   * selecting text.
   */
  markSelection() {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }
    const range = selection.getRangeAt(0);
    const node = range.startContainer;
    const pageDiv = (
      node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
    )?.closest(".page");
    const rect = [...range.getClientRects()].find(r => r.width && r.height);
    if (!pageDiv || !rect) {
      return;
    }
    const pageNumber = parseInt(pageDiv.getAttribute("data-page-number"), 10);
    const pageView = this.pdfViewer.getPageView(pageNumber - 1);
    if (!pageView) {
      return;
    }
    // Relative to the content of the page, i.e. without its border.
    const { div } = pageView;
    const pageRect = div.getBoundingClientRect();
    const originX = pageRect.left + div.clientLeft,
      originY = pageRect.top + div.clientTop;
    const [, top] = pageView.getPagePoint(
      rect.left - originX,
      rect.top - originY
    );
    const [left, middle] = pageView.getPagePoint(
      rect.left + 2 - originX,
      rect.top + rect.height / 2 - originY
    );
    // Remove the selection, which hides the floating toolbar.
    selection.removeAllRanges();
    this.markAt(pageNumber, top, middle, left);
  }

  /**
   * Remove all the marks of the document.
   */
  clearAll() {
    this.#marks.length = 0;
    this.#markIndex = -1;
    this.#render();
    this.#save();
  }

  #onBeforeNavigate() {
    if (!this.#enabled) {
      return;
    }
    // Also when staying on the same page, e.g. a link to a section further
    // down, since that's a jump as well.
    const location = this.#currentLocation;
    if (location) {
      this.#returnPosition = this.#toPosition(location);
      this.#render();
    }
  }

  /**
   * Drop the oldest marks when there are more than the user wants.
   */
  #trim() {
    const excess = this.#marks.length - this.#maxEntries;
    if (excess > 0) {
      this.#marks.splice(0, excess);
      this.#markIndex = Math.max(this.#markIndex - excess, -1);
    }
  }

  #save() {
    this.#store
      ?.setMultiple({
        jumpHistoryMarks: this.#marks,
      })
      .catch(() => {
        // Unable to write to storage.
      });
  }

  #render() {
    const target = this.#returnPosition;

    // Always shown once a document is loaded, even before any navigation.
    this.container.hidden = !this.#enabled;
    if (this.container.hidden) {
      this.closePanel();
    }
    this.#renderPanel();
    this.#renderHighlights();

    this.backButton.disabled = !target;
    this.backButton.querySelector(".jumpHistoryPage").textContent =
      target?.pageNumber ?? "";
    if (target) {
      this.backButton.setAttribute(
        "data-l10n-id",
        "pdfjs-jump-history-back-button"
      );
      this.backButton.setAttribute(
        "data-l10n-args",
        JSON.stringify({ page: target.pageNumber })
      );
    } else {
      this.backButton.setAttribute(
        "data-l10n-id",
        "pdfjs-jump-history-back-button-empty"
      );
      this.backButton.removeAttribute("data-l10n-args");
    }
  }
}

export { PDFJumpHistory };
