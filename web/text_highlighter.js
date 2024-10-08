/* Copyright 2021 Mozilla Foundation
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

/** @typedef {import("./event_utils").EventBus} EventBus */
// eslint-disable-next-line max-len
/** @typedef {import("./pdf_find_controller").PDFFindController} PDFFindController */

/**
 * @typedef {Object} TextHighlighterOptions
 * @property {PDFFindController} findController
 * @property {EventBus} eventBus - The application event bus.
 * @property {number} pageIndex - The page index.
 */

/**
 * TextHighlighter handles highlighting matches from the FindController in
 * either the text layer or XFA layer depending on the type of document.
 */
class TextHighlighter {
  #eventAbortController = null;

  /**
   * @param {TextHighlighterOptions} options
   */
  constructor({ findController, eventBus, pageIndex }) {
    this.findController = findController;
    this.matches = [];
    this.highlights = [];
    this.eventBus = eventBus;
    this.pageIdx = pageIndex;
    this.textDivs = null;
    this.textContentItemsStr = null;
    this.enabled = false;
  }

  /**
   * Store two arrays that will map DOM nodes to text they should contain.
   * The arrays should be of equal length and the array element at each index
   * should correspond to the other. e.g.
   * `items[0] = "<span>Item 0</span>" and texts[0] = "Item 0";
   *
   * @param {Array<Node>} divs
   * @param {Array<string>} texts
   */
  setTextMapping(divs, texts) {
    this.textDivs = divs;
    this.textContentItemsStr = texts;
  }

  /**
   * Start listening for events to update the highlighter and check if there are
   * any current matches that need be highlighted.
   */
  enable() {
    if (!this.textDivs || !this.textContentItemsStr) {
      throw new Error("Text divs and strings have not been set.");
    }
    if (this.enabled) {
      throw new Error("TextHighlighter is already enabled.");
    }
    this.enabled = true;

    if (!this.#eventAbortController) {
      this.#eventAbortController = new AbortController();

      this.eventBus._on(
        "updatetextlayermatches",
        evt => {
          if (evt.pageIndex === this.pageIdx || evt.pageIndex === -1) {
            this._updateMatches();
          }
        },
        { signal: this.#eventAbortController.signal }
      );
    }
    this._updateMatches();
  }

  disable() {
    if (!this.enabled) {
      return;
    }
    this.enabled = false;

    this.#eventAbortController?.abort();
    this.#eventAbortController = null;

    this._updateMatches(/* reset = */ true);
  }

  _convertMatches(matches) {
    // Early exit if there is nothing to convert.
    if (!matches) {
      return [];
    }
    const { textContentItemsStr } = this;

    let i = 0,
      iIndex = 0;
    const end = textContentItemsStr.length - 1;
    const result = [];

    matches.forEach(_match => {
      const startPos = _match.position;

      // Loop over the divIdxs.
      while (i !== end && startPos >= iIndex + textContentItemsStr[i].length) {
        iIndex += textContentItemsStr[i].length;
        i++;
      }

      if (i === textContentItemsStr.length) {
        console.error("Could not find a matching mapping");
      }

      const match = {
        color: _match.color,
        begin: {
          divIdx: i,
          offset: startPos - iIndex,
        },
      };

      const endPos = startPos + _match.length;

      // Somewhat the same array as above, but use > instead of >= to get
      // the end position right.
      while (i !== end && endPos > iIndex + textContentItemsStr[i].length) {
        iIndex += textContentItemsStr[i].length;
        i++;
      }

      match.end = {
        divIdx: i,
        offset: endPos - iIndex,
      };
      result.push(match);
    });

    return result;
  }

  _renderMatches(matches) {
    // Early exit if there is nothing to render.
    if (matches.length === 0) {
      return;
    }
    const { findController, pageIdx } = this;
    const { textContentItemsStr, textDivs } = this;

    const isSelectedPage = pageIdx === findController.selected.pageIdx;
    const selectedMatchIdx = findController.selected.matchIdx;
    const highlightAll = findController.state.highlightAll;
    let prevEnd = null;
    const infinity = {
      divIdx: -1,
      offset: undefined,
    };

    function beginText(begin, className, bgColor) {
      const divIdx = begin.divIdx;
      textDivs[divIdx].textContent = "";
      return appendTextToDiv(divIdx, 0, begin.offset, className, bgColor);
    }

    function styleSpan(span, backgroundColor) {
      span.style.background = backgroundColor; // backgroundColor is converted to rgb or rgba automatically
      setAlpha(span); // Override alpha value to ensure we have appropriate opacity on highlights
      span.style.margin = "-1px";
      span.style.padding = "1px";
      span.style.borderRadius = "0";
    }

    function setAlpha(span, alpha = ".25") {
      const backgroundElements = span.style.background
        .split(",")
        .slice(0, 3)
        .map(element => element.replace(")", "").trim());
      backgroundElements.push(".25)");
      span.style.background = backgroundElements.join(", ");
    }

    function appendTextToDiv(divIdx, fromOffset, toOffset, className, bgColor) {
      let div = textDivs[divIdx];
      if (div.nodeType === Node.TEXT_NODE) {
        const span = document.createElement("span");
        div.before(span);
        span.append(div);
        textDivs[divIdx] = span;
        div = span;
      }
      const content = textContentItemsStr[divIdx].substring(
        fromOffset,
        toOffset
      );
      const node = document.createTextNode(content);
      if (className || bgColor) {
        const span = document.createElement("span");

        if (className) {
          span.className = `${className} appended`;
        }

        if (bgColor) {
          styleSpan(span, bgColor);
        }

        span.append(node);
        div.append(span);
        return className.includes("selected") ? span.offsetLeft : 0;
      }
      div.append(node);
      return 0;
    }

    const i0 = 0;
    const i1 = matches.length;

    if (!highlightAll && !isSelectedPage) {
      // Not highlighting all and this isn't the selected page, so do nothing.
      return;
    }

    let lastDivIdx = -1;
    let lastOffset = -1;
    for (let i = i0; i < i1; i++) {
      const match = matches[i];

      // only highlight selected match or term highlighting matches
      if (!highlightAll && i !== selectedMatchIdx && match.color === null) {
        continue;
      }

      const begin = match.begin;
      if (begin.divIdx === lastDivIdx && begin.offset === lastOffset) {
        // It's possible to be in this situation if we searched for a 'f' and we
        // have a ligature 'ff' in the text. The 'ff' has to be highlighted two
        // times.
        continue;
      }
      lastDivIdx = begin.divIdx;
      lastOffset = begin.offset;

      const end = match.end;
      const isSelected = isSelectedPage && i === selectedMatchIdx;
      const highlightSuffix = isSelected ? " selected" : "";
      let selectedLeft = 0;

      // Match inside new div.
      if (!prevEnd || begin.divIdx !== prevEnd.divIdx) {
        // If there was a previous div, then add the text at the end.
        if (prevEnd !== null) {
          appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
        }
        // Clear the divs and set the content until the starting point.
        beginText(begin);
      } else {
        appendTextToDiv(prevEnd.divIdx, prevEnd.offset, begin.offset);
      }

      if (begin.divIdx === end.divIdx) {
        selectedLeft = appendTextToDiv(
          begin.divIdx,
          begin.offset,
          end.offset,
          "highlight" + highlightSuffix,
          isSelected ? null : match.color
        );
      } else {
        selectedLeft = appendTextToDiv(
          begin.divIdx,
          begin.offset,
          infinity.offset,
          "highlight begin" + highlightSuffix,
          isSelected ? null : match.color
        );
        for (let n0 = begin.divIdx + 1, n1 = end.divIdx; n0 < n1; n0++) {
          textDivs[n0].className = "highlight middle" + highlightSuffix;
          if (match.color) {
            styleSpan(textDivs[n0], match.color);
          }
        }
        beginText(
          end,
          "highlight end" + highlightSuffix,
          isSelected ? null : match.color
        );
      }
      prevEnd = end;

      if (isSelected) {
        // Attempt to scroll the selected match into view.
        findController.scrollMatchIntoView({
          element: textDivs[begin.divIdx],
          selectedLeft,
          pageIndex: pageIdx,
          matchIndex: selectedMatchIdx,
        });
      }
    }

    if (prevEnd) {
      appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
    }
  }

  _updateMatches(reset = false) {
    if (!this.enabled && !reset) {
      return;
    }
    const { findController, matches, pageIdx } = this;
    const { textContentItemsStr, textDivs } = this;
    let clearedUntilDivIdx = -1;

    // Clear all current matches.
    for (const match of matches) {
      const begin = Math.max(clearedUntilDivIdx, match.begin.divIdx);
      for (let n = begin, end = match.end.divIdx; n <= end; n++) {
        const div = textDivs[n];
        div.textContent = textContentItemsStr[n];
        if (div.className.includes("middle")) {
          div.style.background = "";
        }
        div.className = "";
      }
      clearedUntilDivIdx = match.end.divIdx + 1;
    }

    if (!findController?.highlightMatches || reset) {
      return;
    }
    // Convert the matches on the `findController` into the match format
    // used for the textLayer.
    const foundMatches = findController.getAllMatches(pageIdx);

    this.matches = this._convertMatches(foundMatches);
    this._renderMatches(this.matches);
  }
}

export { TextHighlighter };
