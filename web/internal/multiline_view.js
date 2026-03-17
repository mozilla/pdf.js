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

// Number of rows rendered per batch (IntersectionObserver batching).
const BATCH_SIZE = 500;
// Maximum rows kept in the DOM at once (two batches).
const MAX_RENDERED = BATCH_SIZE * 2;

let _idCounter = 0;

/**
 * A scrollable multi-line panel combining:
 *   – a frozen line-number column on the left,
 *   – a scrollable content column on the right,
 *   – a search / go-to-line toolbar at the top,
 *   – IntersectionObserver-based virtual scroll.
 *
 * Usage:
 *   const mc = new MultilineView({ total, getText, makeLineEl });
 *   container.append(mc.element);
 */
class MultilineView {
  // -- DOM elements --
  #element;

  #numCol;

  #innerEl;

  #pre;

  #topSentinel;

  #bottomSentinel;

  #observer = null;

  #onScroll = null;

  #total;

  #getText;

  #makeLineEl;

  #startIndex = 0;

  #endIndex = 0;

  #highlightedIndex = -1;

  #searchMatches = [];

  #currentMatchIdx = -1;

  #searchInput;

  #searchError;

  #prevButton;

  #nextButton;

  #matchInfo;

  #ignoreCaseBtn;

  #regexBtn;

  /**
   * @param {object}      opts
   * @param {number}      opts.total       Total number of lines.
   * @param {Function}    opts.getText     (i) => string used for search.
   * @param {Function}    opts.makeLineEl  (i, isHighlighted) => HTMLElement.
   * @param {string}      [opts.lineClass] CSS class for the lines container.
   * @param {HTMLElement} [opts.actions]   Element prepended in the toolbar.
   */
  constructor({ total, getText, makeLineEl, lineClass = "", actions = null }) {
    this.#total = total;
    this.#getText = getText;
    this.#makeLineEl = makeLineEl;

    // Root element.
    this.#element = document.createElement("div");
    this.#element.className = "mlc-scroll";

    // Line-number column (frozen; scrollTop synced with the scroll pane).
    this.#numCol = document.createElement("div");
    this.#numCol.className = "mlc-line-nums-col";
    this.#numCol.style.setProperty(
      "--line-num-width",
      `${String(total).length}ch`
    );

    // Scrollable content column.
    this.#innerEl = document.createElement("div");
    this.#innerEl.className = "mlc-inner";
    this.#onScroll = () => {
      this.#numCol.scrollTop = this.#innerEl.scrollTop;
    };
    this.#innerEl.addEventListener("scroll", this.#onScroll);

    // Item container inside the scroll column.
    this.#pre = document.createElement("div");
    if (lineClass) {
      this.#pre.className = lineClass;
    }
    this.#innerEl.append(this.#pre);

    const body = document.createElement("div");
    body.className = "mlc-body";
    body.append(this.#numCol, this.#innerEl);

    this.#element.append(this.#buildToolbar(actions), body);

    // Sentinels bracket the rendered window inside #pre:
    //   topSentinel  [startIndex .. endIndex)  bottomSentinel
    this.#topSentinel = document.createElement("div");
    this.#topSentinel.className = "mlc-load-sentinel";
    this.#bottomSentinel = document.createElement("div");
    this.#bottomSentinel.className = "mlc-load-sentinel";

    this.#endIndex = Math.min(BATCH_SIZE, total);
    this.#pre.append(
      this.#topSentinel,
      this.#renderRange(0, this.#endIndex),
      this.#bottomSentinel
    );
    this.#numCol.append(this.#renderNumRange(0, this.#endIndex));

    if (total > BATCH_SIZE) {
      this.#setupObserver();
    }
  }

  /** The root element — append to the DOM to display the component. */
  get element() {
    return this.#element;
  }

  /** The inner content container (between the sentinels). Useful for setting
   *  ARIA attributes and attaching keyboard listeners. */
  get inner() {
    return this.#pre;
  }

  /**
   * Scroll to ensure line i (0-based) is visible without changing the current
   * search highlight. Useful for programmatic navigation (e.g. a debugger).
   */
  scrollToLine(i) {
    if (i < 0 || i >= this.#total) {
      return;
    }
    if (i >= this.#startIndex && i < this.#endIndex) {
      this.#scrollRenderedTargetIntoView(i);
    } else {
      this.#jumpToTarget(i);
    }
  }

  destroy() {
    this.#observer?.disconnect();
    this.#observer = null;

    if (this.#onScroll) {
      this.#innerEl.removeEventListener("scroll", this.#onScroll);
      this.#onScroll = null;
    }
  }

  /**
   * Scroll to line i (0-based) and mark it as the current search highlight.
   * Pass i = -1 to clear the highlight.
   */
  jumpToLine(i) {
    this.#pre.querySelector(".mlc-match")?.classList.remove("mlc-match");
    this.#numCol.querySelector(".mlc-match")?.classList.remove("mlc-match");
    if (i < 0) {
      this.#highlightedIndex = -1;
      return;
    }
    if (i >= this.#total) {
      return;
    }
    this.#highlightedIndex = i;
    if (i >= this.#startIndex && i < this.#endIndex) {
      this.#scrollRenderedTargetIntoView(i);
    } else {
      this.#jumpToTarget(i);
    }
    this.#pre.children[i - this.#startIndex + 1]?.classList.add("mlc-match");
    this.#numCol.children[i - this.#startIndex]?.classList.add("mlc-match");
  }

  #renderRange(from, to) {
    const frag = document.createDocumentFragment();
    for (let i = from; i < to; i++) {
      frag.append(this.#makeLineEl(i, i === this.#highlightedIndex));
    }
    return frag;
  }

  #renderNumRange(from, to) {
    const frag = document.createDocumentFragment();
    for (let i = from; i < to; i++) {
      const item = document.createElement("div");
      item.className = "mlc-num-item";
      if (i === this.#highlightedIndex) {
        item.classList.add("mlc-match");
      }
      item.textContent = String(i + 1);
      frag.append(item);
    }
    return frag;
  }

  // Re-render a window centred on targetIndex and scroll to it.
  #jumpToTarget(targetIndex) {
    // Remove all rendered rows between the sentinels.
    const firstRow = this.#topSentinel.nextSibling;
    const lastRow = this.#bottomSentinel.previousSibling;
    if (firstRow && lastRow && firstRow !== this.#bottomSentinel) {
      const range = document.createRange();
      range.setStartBefore(firstRow);
      range.setEndAfter(lastRow);
      range.deleteContents();
    }

    const half = Math.floor(MAX_RENDERED / 2);
    this.#startIndex = Math.max(0, targetIndex - half);
    this.#endIndex = Math.min(this.#total, this.#startIndex + MAX_RENDERED);
    this.#startIndex = Math.max(0, this.#endIndex - MAX_RENDERED);

    this.#topSentinel.after(
      this.#renderRange(this.#startIndex, this.#endIndex)
    );
    this.#numCol.replaceChildren(
      this.#renderNumRange(this.#startIndex, this.#endIndex)
    );

    this.#scrollRenderedTargetIntoView(targetIndex);
  }

  #scrollRenderedTargetIntoView(targetIndex) {
    // #pre.children: [0]=topSentinel, [1..n]=rows, [n+1]=bottomSentinel
    const targetEl = this.#pre.children[targetIndex - this.#startIndex + 1];
    if (!targetEl) {
      return;
    }
    const targetRect = targetEl.getBoundingClientRect();
    const innerRect = this.#innerEl.getBoundingClientRect();
    this.#innerEl.scrollTop +=
      targetRect.top -
      innerRect.top -
      this.#innerEl.clientHeight / 2 +
      targetEl.clientHeight / 2;
  }

  #setupObserver() {
    const observer = (this.#observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }
          if (entry.target === this.#bottomSentinel) {
            this.#loadBottom();
          } else {
            this.#loadTop();
          }
        }
      },
      { root: this.#innerEl, rootMargin: "200px" }
    ));
    observer.observe(this.#topSentinel);
    observer.observe(this.#bottomSentinel);
  }

  // Remove `count` children from `parent` starting at `firstChild`, in one
  // Range operation instead of N individual remove() calls.
  #removeChildren(parent, firstChild, count, fromEnd = false) {
    if (count <= 0 || !firstChild) {
      return;
    }
    const range = document.createRange();
    if (fromEnd) {
      // Remove the last `count` children ending at firstChild
      // (=lastChild here).
      let startChild = firstChild;
      for (let i = 1; i < count; i++) {
        startChild = startChild.previousElementSibling;
        if (!startChild) {
          return;
        }
      }
      range.setStartBefore(startChild);
      range.setEndAfter(firstChild);
    } else {
      let endChild = firstChild;
      for (let i = 1; i < count; i++) {
        endChild = endChild.nextElementSibling;
        if (!endChild) {
          return;
        }
      }
      range.setStartBefore(firstChild);
      range.setEndAfter(endChild);
    }
    range.deleteContents();
  }

  #loadBottom() {
    const newEnd = Math.min(this.#endIndex + BATCH_SIZE, this.#total);
    if (newEnd === this.#endIndex) {
      return;
    }
    this.#bottomSentinel.before(this.#renderRange(this.#endIndex, newEnd));
    this.#numCol.append(this.#renderNumRange(this.#endIndex, newEnd));
    this.#endIndex = newEnd;

    // Trim from top if the window exceeds MAX_RENDERED.
    if (this.#endIndex - this.#startIndex > MAX_RENDERED) {
      const removeCount = this.#endIndex - this.#startIndex - MAX_RENDERED;
      const heightBefore = this.#pre.scrollHeight;
      this.#removeChildren(
        this.#pre,
        this.#topSentinel.nextElementSibling,
        removeCount
      );
      this.#removeChildren(
        this.#numCol,
        this.#numCol.firstElementChild,
        removeCount
      );
      this.#startIndex += removeCount;
      // Compensate so visible content doesn't jump upward.
      this.#innerEl.scrollTop -= heightBefore - this.#pre.scrollHeight;
    }
  }

  #loadTop() {
    if (this.#startIndex === 0) {
      return;
    }
    const newStart = Math.max(0, this.#startIndex - BATCH_SIZE);
    const scrollBefore = this.#innerEl.scrollTop;
    const heightBefore = this.#pre.scrollHeight;
    this.#topSentinel.after(this.#renderRange(newStart, this.#startIndex));
    this.#numCol.prepend(this.#renderNumRange(newStart, this.#startIndex));
    // Compensate so visible content doesn't jump downward.
    this.#innerEl.scrollTop =
      scrollBefore + (this.#pre.scrollHeight - heightBefore);
    this.#startIndex = newStart;

    // Trim from bottom if the window exceeds MAX_RENDERED.
    if (this.#endIndex - this.#startIndex > MAX_RENDERED) {
      const removeCount = this.#endIndex - this.#startIndex - MAX_RENDERED;
      this.#removeChildren(
        this.#pre,
        this.#bottomSentinel.previousElementSibling,
        removeCount,
        true
      );
      this.#removeChildren(
        this.#numCol,
        this.#numCol.lastElementChild,
        removeCount,
        true
      );
      this.#endIndex -= removeCount;
    }
  }

  #buildToolbar(actions) {
    const id = ++_idCounter;
    const bar = document.createElement("div");
    bar.className = "mlc-goto-bar";

    const searchGroup = document.createElement("div");
    searchGroup.className = "mlc-search-group";

    const searchErrorId = `mlc-err-${id}`;

    const searchInput = (this.#searchInput = document.createElement("input"));
    searchInput.type = "search";
    searchInput.className = "mlc-search-input";
    searchInput.placeholder = "Search for\u2026";
    searchInput.ariaLabel = "Search";
    searchInput.setAttribute("aria-describedby", searchErrorId);

    const searchError = (this.#searchError = document.createElement("span"));
    searchError.id = searchErrorId;
    searchError.className = "sr-only";
    searchError.role = "alert";

    const prevButton = (this.#prevButton = document.createElement("button"));
    prevButton.className = "mlc-nav-button";
    prevButton.textContent = "↑";
    prevButton.title = "Previous match";
    prevButton.disabled = true;

    const nextButton = (this.#nextButton = document.createElement("button"));
    nextButton.className = "mlc-nav-button";
    nextButton.textContent = "↓";
    nextButton.title = "Next match";
    nextButton.disabled = true;

    const matchInfo = (this.#matchInfo = document.createElement("span"));
    matchInfo.className = "mlc-match-info";

    const ignoreCaseBtn = (this.#ignoreCaseBtn = this.#makeToggleButton(
      "Aa",
      "Ignore case"
    ));
    const regexBtn = (this.#regexBtn = this.#makeToggleButton(".*", "Regex"));

    searchGroup.append(
      searchInput,
      searchError,
      prevButton,
      nextButton,
      ignoreCaseBtn,
      regexBtn,
      matchInfo
    );

    const gotoInput = document.createElement("input");
    gotoInput.type = "number";
    gotoInput.className = "mlc-goto";
    gotoInput.placeholder = "Go to line\u2026";
    gotoInput.min = "1";
    gotoInput.max = String(this.#total);
    gotoInput.step = "1";
    gotoInput.ariaLabel = "Go to line";

    if (actions) {
      bar.append(actions);
    }
    bar.append(searchGroup, gotoInput);

    searchInput.addEventListener("input", () => this.#runSearch());
    searchInput.addEventListener("keydown", ({ key, shiftKey }) => {
      if (key === "Enter") {
        this.#navigateMatch(shiftKey ? -1 : 1);
      }
    });
    prevButton.addEventListener("click", () => this.#navigateMatch(-1));
    nextButton.addEventListener("click", () => this.#navigateMatch(1));
    this.#ignoreCaseBtn.addEventListener("click", () => {
      this.#ignoreCaseBtn.ariaPressed =
        this.#ignoreCaseBtn.ariaPressed === "true" ? "false" : "true";
      this.#runSearch();
    });
    this.#regexBtn.addEventListener("click", () => {
      this.#regexBtn.ariaPressed =
        this.#regexBtn.ariaPressed === "true" ? "false" : "true";
      this.#runSearch();
    });

    gotoInput.addEventListener("keydown", ({ key }) => {
      if (key !== "Enter") {
        return;
      }
      const value = gotoInput.value.trim();
      const n = Number(value);
      if (!value || !Number.isInteger(n) || n < 1 || n > this.#total) {
        gotoInput.setAttribute("aria-invalid", "true");
        return;
      }
      gotoInput.removeAttribute("aria-invalid");
      this.jumpToLine(n - 1);
    });

    return bar;
  }

  #makeToggleButton(text, title) {
    const btn = document.createElement("button");
    btn.className = "mlc-nav-button";
    btn.textContent = text;
    btn.title = title;
    btn.ariaPressed = "false";
    return btn;
  }

  #updateMatchInfo() {
    if (!this.#searchInput.value) {
      this.#matchInfo.textContent = "";
      this.#prevButton.disabled = this.#nextButton.disabled = true;
    } else if (this.#searchMatches.length === 0) {
      this.#matchInfo.textContent = "No results";
      this.#prevButton.disabled = this.#nextButton.disabled = true;
    } else {
      this.#matchInfo.textContent = `${this.#currentMatchIdx + 1} / ${this.#searchMatches.length}`;
      this.#prevButton.disabled = this.#nextButton.disabled = false;
    }
  }

  #computeMatches() {
    this.jumpToLine(-1);
    this.#searchMatches = [];
    this.#currentMatchIdx = -1;

    const query = this.#searchInput.value;
    if (!query) {
      this.#updateMatchInfo();
      return false;
    }

    let test;
    if (this.#regexBtn.ariaPressed === "true") {
      try {
        const re = new RegExp(
          query,
          this.#ignoreCaseBtn.ariaPressed === "true" ? "i" : ""
        );
        test = str => re.test(str);
        this.#searchInput.removeAttribute("aria-invalid");
        this.#searchError.textContent = "";
      } catch {
        this.#searchInput.setAttribute("aria-invalid", "true");
        this.#searchError.textContent = "Invalid regular expression";
        this.#updateMatchInfo();
        return false;
      }
    } else {
      const ignoreCase = this.#ignoreCaseBtn.ariaPressed === "true";
      const needle = ignoreCase ? query.toLowerCase() : query;
      test = str => (ignoreCase ? str.toLowerCase() : str).includes(needle);
    }
    this.#searchInput.removeAttribute("aria-invalid");
    this.#searchError.textContent = "";

    for (let i = 0, ii = this.#total; i < ii; i++) {
      if (test(this.#getText(i))) {
        this.#searchMatches.push(i);
      }
    }
    return this.#searchMatches.length > 0;
  }

  #navigateMatch(delta) {
    if (!this.#searchMatches.length) {
      return;
    }
    this.#currentMatchIdx =
      (this.#currentMatchIdx + delta + this.#searchMatches.length) %
      this.#searchMatches.length;
    this.jumpToLine(this.#searchMatches[this.#currentMatchIdx]);
    this.#updateMatchInfo();
  }

  #runSearch() {
    if (this.#computeMatches() && this.#searchMatches.length) {
      this.#currentMatchIdx = 0;
      this.jumpToLine(this.#searchMatches[0]);
    }
    this.#updateMatchInfo();
  }
}

export { MultilineView };
