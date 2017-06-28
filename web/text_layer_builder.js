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

import { getGlobalEventBus } from './dom_events';
import { renderTextLayer } from 'pdfjs-lib';

const EXPAND_DIVS_TIMEOUT = 300; // ms

/**
 * @typedef {Object} TextLayerBuilderOptions
 * @property {HTMLDivElement} textLayerDiv - The text layer container.
 * @property {EventBus} eventBus - The application event bus.
 * @property {number} pageIndex - The page index.
 * @property {PageViewport} viewport - The viewport of the text layer.
 * @property {PDFFindController} findController
 * @property {boolean} enhanceTextSelection - Option to turn on improved
 *   text selection.
 */

/**
 * The text layer builder provides text selection functionality for the PDF.
 * It does this by creating overlay divs over the PDF's text. These divs
 * contain text that matches the PDF text they are overlaying. This object
 * also provides a way to highlight text that is being searched for.
 */
class TextLayerBuilder {
  constructor({ textLayerDiv, eventBus, pageIndex, viewport,
                findController = null, enhanceTextSelection = false, }) {
    this.textLayerDiv = textLayerDiv;
    this.eventBus = eventBus || getGlobalEventBus();
    this.textContent = null;
    this.textContentItemsStr = [];
    this.textContentStream = null;
    this.renderingDone = false;
    this.pageIdx = pageIndex;
    this.pageNumber = this.pageIdx + 1;
    this.matches = [];
    this.viewport = viewport;
    this.textDivs = [];
    this.findController = findController;
    this.textLayerRenderTask = null;
    this.enhanceTextSelection = enhanceTextSelection;

    this._bindMouse();
  }

  /**
   * @private
   */
  _finishRendering() {
    this.renderingDone = true;

    if (!this.enhanceTextSelection) {
      let endOfContent = document.createElement('div');
      endOfContent.className = 'endOfContent';
      this.textLayerDiv.appendChild(endOfContent);
    }

    this.eventBus.dispatch('textlayerrendered', {
      source: this,
      pageNumber: this.pageNumber,
      numTextDivs: this.textDivs.length,
    });
  }

  /**
   * Renders the text layer.
   *
   * @param {number} timeout - (optional) wait for a specified amount of
   *                           milliseconds before rendering
   */
  render(timeout = 0) {
    if (!(this.textContent || this.textContentStream) || this.renderingDone) {
      return;
    }
    this.cancel();

    this.textDivs = [];
    let textLayerFrag = document.createDocumentFragment();
    this.textLayerRenderTask = renderTextLayer({
      textContent: this.textContent,
      textContentStream: this.textContentStream,
      container: textLayerFrag,
      viewport: this.viewport,
      textDivs: this.textDivs,
      textContentItemsStr: this.textContentItemsStr,
      timeout,
      enhanceTextSelection: this.enhanceTextSelection,
    });
    this.textLayerRenderTask.promise.then(() => {
      this.textLayerDiv.appendChild(textLayerFrag);
      this._finishRendering();
      this.updateMatches();
    }, function (reason) {
      // Cancelled or failed to render text layer; skipping errors.
    });
  }

  /**
   * Cancel rendering of the text layer.
   */
  cancel() {
    if (this.textLayerRenderTask) {
      this.textLayerRenderTask.cancel();
      this.textLayerRenderTask = null;
    }
  }

  setTextContentStream(readableStream) {
    this.cancel();
    this.textContentStream = readableStream;
  }

  setTextContent(textContent) {
    this.cancel();
    this.textContent = textContent;
  }

  convertMatches(matches, matchesLength) {
    let i = 0;
    let iIndex = 0;
    let textContentItemsStr = this.textContentItemsStr;
    let end = textContentItemsStr.length - 1;
    let queryLen = (this.findController === null ?
                    0 : this.findController.state.query.length);
    let ret = [];
    if (!matches) {
      return ret;
    }
    for (let m = 0, len = matches.length; m < len; m++) {
      // Calculate the start position.
      let matchIdx = matches[m];

      // Loop over the divIdxs.
      while (i !== end && matchIdx >=
             (iIndex + textContentItemsStr[i].length)) {
        iIndex += textContentItemsStr[i].length;
        i++;
      }

      if (i === textContentItemsStr.length) {
        console.error('Could not find a matching mapping');
      }

      let match = {
        begin: {
          divIdx: i,
          offset: matchIdx - iIndex,
        },
      };

      // Calculate the end position.
      if (matchesLength) { // Multiterm search.
        matchIdx += matchesLength[m];
      } else { // Phrase search.
        matchIdx += queryLen;
      }

      // Somewhat the same array as above, but use > instead of >= to get
      // the end position right.
      while (i !== end && matchIdx >
             (iIndex + textContentItemsStr[i].length)) {
        iIndex += textContentItemsStr[i].length;
        i++;
      }

      match.end = {
        divIdx: i,
        offset: matchIdx - iIndex,
      };
      ret.push(match);
    }

    return ret;
  }

  renderMatches(matches) {
    // Early exit if there is nothing to render.
    if (matches.length === 0) {
      return;
    }

    let textContentItemsStr = this.textContentItemsStr;
    let textDivs = this.textDivs;
    let prevEnd = null;
    let pageIdx = this.pageIdx;
    let isSelectedPage = (this.findController === null ?
      false : (pageIdx === this.findController.selected.pageIdx));
    let selectedMatchIdx = (this.findController === null ?
                            -1 : this.findController.selected.matchIdx);
    let highlightAll = (this.findController === null ?
                        false : this.findController.state.highlightAll);
    let infinity = {
      divIdx: -1,
      offset: undefined,
    };

    function beginText(begin, className) {
      let divIdx = begin.divIdx;
      textDivs[divIdx].textContent = '';
      appendTextToDiv(divIdx, 0, begin.offset, className);
    }

    function appendTextToDiv(divIdx, fromOffset, toOffset, className) {
      let div = textDivs[divIdx];
      let content = textContentItemsStr[divIdx].substring(fromOffset, toOffset);
      let node = document.createTextNode(content);
      if (className) {
        let span = document.createElement('span');
        span.className = className;
        span.appendChild(node);
        div.appendChild(span);
        return;
      }
      div.appendChild(node);
    }

    let i0 = selectedMatchIdx, i1 = i0 + 1;
    if (highlightAll) {
      i0 = 0;
      i1 = matches.length;
    } else if (!isSelectedPage) {
      // Not highlighting all and this isn't the selected page, so do nothing.
      return;
    }

    for (let i = i0; i < i1; i++) {
      let match = matches[i];
      let begin = match.begin;
      let end = match.end;
      let isSelected = (isSelectedPage && i === selectedMatchIdx);
      let highlightSuffix = (isSelected ? ' selected' : '');

      if (this.findController) {
        this.findController.updateMatchPosition(pageIdx, i, textDivs,
                                                begin.divIdx);
      }

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
        appendTextToDiv(begin.divIdx, begin.offset, end.offset,
                        'highlight' + highlightSuffix);
      } else {
        appendTextToDiv(begin.divIdx, begin.offset, infinity.offset,
                        'highlight begin' + highlightSuffix);
        for (let n0 = begin.divIdx + 1, n1 = end.divIdx; n0 < n1; n0++) {
          textDivs[n0].className = 'highlight middle' + highlightSuffix;
        }
        beginText(end, 'highlight end' + highlightSuffix);
      }
      prevEnd = end;
    }

    if (prevEnd) {
      appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
    }
  }

  updateMatches() {
    // Only show matches when all rendering is done.
    if (!this.renderingDone) {
      return;
    }

    // Clear all matches.
    let matches = this.matches;
    let textDivs = this.textDivs;
    let textContentItemsStr = this.textContentItemsStr;
    let clearedUntilDivIdx = -1;

    // Clear all current matches.
    for (let i = 0, len = matches.length; i < len; i++) {
      let match = matches[i];
      let begin = Math.max(clearedUntilDivIdx, match.begin.divIdx);
      for (let n = begin, end = match.end.divIdx; n <= end; n++) {
        let div = textDivs[n];
        div.textContent = textContentItemsStr[n];
        div.className = '';
      }
      clearedUntilDivIdx = match.end.divIdx + 1;
    }

    if (this.findController === null || !this.findController.active) {
      return;
    }

    // Convert the matches on the page controller into the match format
    // used for the textLayer.
    let pageMatches, pageMatchesLength;
    if (this.findController !== null) {
      pageMatches = this.findController.pageMatches[this.pageIdx] || null;
      pageMatchesLength = (this.findController.pageMatchesLength) ?
        this.findController.pageMatchesLength[this.pageIdx] || null : null;
    }

    this.matches = this.convertMatches(pageMatches, pageMatchesLength);
    this.renderMatches(this.matches);
  }

  /**
   * Improves text selection by adding an additional div where the mouse was
   * clicked. This reduces flickering of the content if the mouse is slowly
   * dragged up or down.
   *
   * @private
   */
  _bindMouse() {
    let div = this.textLayerDiv;
    let expandDivsTimer = null;

    div.addEventListener('mousedown', (evt) => {
      if (this.enhanceTextSelection && this.textLayerRenderTask) {
        this.textLayerRenderTask.expandTextDivs(true);
        if ((typeof PDFJSDev === 'undefined' ||
             !PDFJSDev.test('FIREFOX || MOZCENTRAL')) &&
            expandDivsTimer) {
          clearTimeout(expandDivsTimer);
          expandDivsTimer = null;
        }
        return;
      }

      let end = div.querySelector('.endOfContent');
      if (!end) {
        return;
      }
      if (typeof PDFJSDev === 'undefined' ||
          !PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
        // On non-Firefox browsers, the selection will feel better if the height
        // of the `endOfContent` div is adjusted to start at mouse click
        // location. This avoids flickering when the selection moves up.
        // However it does not work when selection is started on empty space.
        let adjustTop = evt.target !== div;
        if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) {
          adjustTop = adjustTop && window.getComputedStyle(end).
            getPropertyValue('-moz-user-select') !== 'none';
        }
        if (adjustTop) {
          let divBounds = div.getBoundingClientRect();
          let r = Math.max(0, (evt.pageY - divBounds.top) / divBounds.height);
          end.style.top = (r * 100).toFixed(2) + '%';
        }
      }
      end.classList.add('active');
    });

    div.addEventListener('mouseup', () => {
      if (this.enhanceTextSelection && this.textLayerRenderTask) {
        if (typeof PDFJSDev === 'undefined' ||
            !PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
          expandDivsTimer = setTimeout(() => {
            if (this.textLayerRenderTask) {
              this.textLayerRenderTask.expandTextDivs(false);
            }
            expandDivsTimer = null;
          }, EXPAND_DIVS_TIMEOUT);
        } else {
          this.textLayerRenderTask.expandTextDivs(false);
        }
        return;
      }

      let end = div.querySelector('.endOfContent');
      if (!end) {
        return;
      }
      if (typeof PDFJSDev === 'undefined' ||
          !PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
        end.style.top = '';
      }
      end.classList.remove('active');
    });
  }
}

/**
 * @implements IPDFTextLayerFactory
 */
class DefaultTextLayerFactory {
  /**
   * @param {HTMLDivElement} textLayerDiv
   * @param {number} pageIndex
   * @param {PageViewport} viewport
   * @param {boolean} enhanceTextSelection
   * @returns {TextLayerBuilder}
   */
  createTextLayerBuilder(textLayerDiv, pageIndex, viewport,
                         enhanceTextSelection = false) {
    return new TextLayerBuilder({
      textLayerDiv,
      pageIndex,
      viewport,
      enhanceTextSelection,
    });
  }
}

export {
  TextLayerBuilder,
  DefaultTextLayerFactory,
};
