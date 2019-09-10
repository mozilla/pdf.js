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

import { getGlobalEventBus, scrollIntoView } from './ui_utils';
import { createPromiseCapability } from 'pdfjs-lib';
import { getCharacterType } from './pdf_find_utils';

const FindState = {
  FOUND: 0,
  NOT_FOUND: 1,
  WRAPPED: 2,
  PENDING: 3,
};

const FIND_TIMEOUT = 250; // ms
const MATCH_SCROLL_OFFSET_TOP = -50; // px
const MATCH_SCROLL_OFFSET_LEFT = -400; // px

const CHARACTERS_TO_NORMALIZE = {
  '\u2018': '\'', // Left single quotation mark
  '\u2019': '\'', // Right single quotation mark
  '\u201A': '\'', // Single low-9 quotation mark
  '\u201B': '\'', // Single high-reversed-9 quotation mark
  '\u201C': '"', // Left double quotation mark
  '\u201D': '"', // Right double quotation mark
  '\u201E': '"', // Double low-9 quotation mark
  '\u201F': '"', // Double high-reversed-9 quotation mark
  '\u00BC': '1/4', // Vulgar fraction one quarter
  '\u00BD': '1/2', // Vulgar fraction one half
  '\u00BE': '3/4', // Vulgar fraction three quarters
};

let normalizationRegex = null;
function normalize(text) {
  if (!normalizationRegex) {
    // Compile the regular expression for text normalization once.
    const replace = Object.keys(CHARACTERS_TO_NORMALIZE).join('');
    normalizationRegex = new RegExp(`[${replace}]`, 'g');
  }
  return text.replace(normalizationRegex, function(ch) {
    return CHARACTERS_TO_NORMALIZE[ch];
  });
}

/**
 * @typedef {Object} PDFFindControllerOptions
 * @property {IPDFLinkService} linkService - The navigation/linking service.
 * @property {EventBus} eventBus - The application event bus.
 */

/**
 * Provides search functionality to find a given string in a PDF document.
 */
class PDFFindController {
  /**
   * @param {PDFFindControllerOptions} options
   */
  constructor({ linkService, eventBus = getGlobalEventBus(), }) {
    this._linkService = linkService;
    this._eventBus = eventBus;

    this._reset();
    eventBus.on('findbarclose', this._onFindBarClose.bind(this));
  }

  get highlightMatches() {
    return this._highlightMatches;
  }

  get pageMatches() {
    return this._pageMatches;
  }

  get pageMatchesLength() {
    return this._pageMatchesLength;
  }

  get selected() {
    return this._selected;
  }

  get state() {
    return this._state;
  }

  /**
   * Set a reference to the PDF document in order to search it.
   * Note that searching is not possible if this method is not called.
   *
   * @param {PDFDocumentProxy} pdfDocument - The PDF document to search.
   */
  setDocument(pdfDocument) {
    if (this._pdfDocument) {
      this._reset();
    }
    if (!pdfDocument) {
      return;
    }
    this._pdfDocument = pdfDocument;
    this._firstPageCapability.resolve();
  }

  executeCommand(cmd, state) {
    if (!state) {
      return;
    }
    const pdfDocument = this._pdfDocument;

    if (this._state === null || this._shouldDirtyMatch(cmd, state)) {
      this._dirtyMatch = true;
    }
    this._state = state;
    if (cmd !== 'findhighlightallchange') {
      this._updateUIState(FindState.PENDING);
    }

    this._firstPageCapability.promise.then(() => {
      // If the document was closed before searching began, or if the search
      // operation was relevant for a previously opened document, do nothing.
      if (!this._pdfDocument ||
          (pdfDocument && this._pdfDocument !== pdfDocument)) {
        return;
      }
      this._extractText();

      const findbarClosed = !this._highlightMatches;
      const pendingTimeout = !!this._findTimeout;

      if (this._findTimeout) {
        clearTimeout(this._findTimeout);
        this._findTimeout = null;
      }
      if (cmd === 'find') {
        // Trigger the find action with a small delay to avoid starting the
        // search when the user is still typing (saving resources).
        this._findTimeout = setTimeout(() => {
          this._nextMatch();
          this._findTimeout = null;
        }, FIND_TIMEOUT);
      } else if (this._dirtyMatch) {
        // Immediately trigger searching for non-'find' operations, when the
        // current state needs to be reset and matches re-calculated.
        this._nextMatch();
      } else if (cmd === 'findagain') {
        this._nextMatch();

        // When the findbar was previously closed, and `highlightAll` is set,
        // ensure that the matches on all active pages are highlighted again.
        if (findbarClosed && this._state.highlightAll) {
          this._updateAllPages();
        }
      } else if (cmd === 'findhighlightallchange') {
        // If there was a pending search operation, synchronously trigger a new
        // search *first* to ensure that the correct matches are highlighted.
        if (pendingTimeout) {
          this._nextMatch();
        } else {
          this._highlightMatches = true;
        }
        this._updateAllPages(); // Update the highlighting on all active pages.
      } else {
        this._nextMatch();
      }
    });
  }

  scrollMatchIntoView({ element = null, pageIndex = -1, matchIndex = -1, }) {
    if (!this._scrollMatches || !element) {
      return;
    } else if (matchIndex === -1 || matchIndex !== this._selected.matchIdx) {
      return;
    } else if (pageIndex === -1 || pageIndex !== this._selected.pageIdx) {
      return;
    }
    this._scrollMatches = false; // Ensure that scrolling only happens once.

    const spot = {
      top: MATCH_SCROLL_OFFSET_TOP,
      left: MATCH_SCROLL_OFFSET_LEFT,
    };
    scrollIntoView(element, spot, /* skipOverflowHiddenElements = */ true);
  }

  _reset() {
    this._highlightMatches = false;
    this._scrollMatches = false;
    this._pdfDocument = null;
    this._pageMatches = [];
    this._pageMatchesLength = [];
    this._state = null;
    this._selected = { // Currently selected match.
      pageIdx: -1,
      matchIdx: -1,
    };
    this._offset = { // Where the find algorithm currently is in the document.
      pageIdx: null,
      matchIdx: null,
      wrapped: false,
    };
    this._extractTextPromises = [];
    this._pageContents = []; // Stores the normalized text for each page.
    this._matchesCountTotal = 0;
    this._pagesToSearch = null;
    this._pendingFindMatches = Object.create(null);
    this._resumePageIdx = null;
    this._dirtyMatch = false;
    clearTimeout(this._findTimeout);
    this._findTimeout = null;

    this._firstPageCapability = createPromiseCapability();
  }

  /**
   * @return {string} The (current) normalized search query.
   */
  get _query() {
    if (this._state.query !== this._rawQuery) {
      this._rawQuery = this._state.query;
      this._normalizedQuery = normalize(this._state.query);
    }
    return this._normalizedQuery;
  }

  _shouldDirtyMatch(cmd, state) {
    // When the search query changes, regardless of the actual search command
    // used, always re-calculate matches to avoid errors (fixes bug 1030622).
    if (state.query !== this._state.query) {
      return true;
    }
    switch (cmd) {
      case 'findagain':
        const pageNumber = this._selected.pageIdx + 1;
        const linkService = this._linkService;
        // Only treat a 'findagain' event as a new search operation when it's
        // *absolutely* certain that the currently selected match is no longer
        // visible, e.g. as a result of the user scrolling in the document.
        //
        // NOTE: If only a simple `this._linkService.page` check was used here,
        // there's a risk that consecutive 'findagain' operations could "skip"
        // over matches at the top/bottom of pages thus making them completely
        // inaccessible when there's multiple pages visible in the viewer.
        if (pageNumber >= 1 && pageNumber <= linkService.pagesCount &&
            pageNumber !== linkService.page &&
            !linkService.isPageVisible(pageNumber)) {
          return true;
        }
        return false;
      case 'findhighlightallchange':
        return false;
    }
    return true;
  }

  /**
   * Helper for multi-term search that fills the `matchesWithLength` array
   * and handles cases where one search term includes another search term (for
   * example, "tamed tame" or "this is"). It looks for intersecting terms in
   * the `matches` and keeps elements with a longer match length.
   */
  _prepareMatches(matchesWithLength, matches, matchesLength) {
    function isSubTerm(matchesWithLength, currentIndex) {
      const currentElem = matchesWithLength[currentIndex];
      const nextElem = matchesWithLength[currentIndex + 1];

      // Check for cases like "TAMEd TAME".
      if (currentIndex < matchesWithLength.length - 1 &&
          currentElem.match === nextElem.match) {
        currentElem.skipped = true;
        return true;
      }

      // Check for cases like "thIS IS".
      for (let i = currentIndex - 1; i >= 0; i--) {
        const prevElem = matchesWithLength[i];
        if (prevElem.skipped) {
          continue;
        }
        if (prevElem.match + prevElem.matchLength < currentElem.match) {
          break;
        }
        if (prevElem.match + prevElem.matchLength >=
            currentElem.match + currentElem.matchLength) {
          currentElem.skipped = true;
          return true;
        }
      }
      return false;
    }

    // Sort the array of `{ match: <match>, matchLength: <matchLength> }`
    // objects on increasing index first and on the length otherwise.
    matchesWithLength.sort(function(a, b) {
      return a.match === b.match ? a.matchLength - b.matchLength :
                                   a.match - b.match;
    });
    for (let i = 0, len = matchesWithLength.length; i < len; i++) {
      if (isSubTerm(matchesWithLength, i)) {
        continue;
      }
      matches.push(matchesWithLength[i].match);
      matchesLength.push(matchesWithLength[i].matchLength);
    }
  }

  /**
   * Determine if the search query constitutes a "whole word", by comparing the
   * first/last character type with the preceding/following character type.
   */
  _isEntireWord(content, startIdx, length) {
    if (startIdx > 0) {
      const first = content.charCodeAt(startIdx);
      const limit = content.charCodeAt(startIdx - 1);
      if (getCharacterType(first) === getCharacterType(limit)) {
        return false;
      }
    }
    const endIdx = (startIdx + length - 1);
    if (endIdx < (content.length - 1)) {
      const last = content.charCodeAt(endIdx);
      const limit = content.charCodeAt(endIdx + 1);
      if (getCharacterType(last) === getCharacterType(limit)) {
        return false;
      }
    }
    return true;
  }

  _calculatePhraseMatch(query, pageIndex, pageContent, entireWord) {
    const matches = [];
    const queryLen = query.length;

    let matchIdx = -queryLen;
    while (true) {
      matchIdx = pageContent.indexOf(query, matchIdx + queryLen);
      if (matchIdx === -1) {
        break;
      }
      if (entireWord && !this._isEntireWord(pageContent, matchIdx, queryLen)) {
        continue;
      }
      matches.push(matchIdx);
    }
    this._pageMatches[pageIndex] = matches;
  }

  _calculateWordMatch(query, pageIndex, pageContent, entireWord) {
    const matchesWithLength = [];

    // Divide the query into pieces and search for text in each piece.
    const queryArray = query.match(/\S+/g);
    for (let i = 0, len = queryArray.length; i < len; i++) {
      const subquery = queryArray[i];
      const subqueryLen = subquery.length;

      let matchIdx = -subqueryLen;
      while (true) {
        matchIdx = pageContent.indexOf(subquery, matchIdx + subqueryLen);
        if (matchIdx === -1) {
          break;
        }
        if (entireWord &&
            !this._isEntireWord(pageContent, matchIdx, subqueryLen)) {
          continue;
        }
        // Other searches do not, so we store the length.
        matchesWithLength.push({
          match: matchIdx,
          matchLength: subqueryLen,
          skipped: false,
        });
      }
    }

    // Prepare arrays for storing the matches.
    this._pageMatchesLength[pageIndex] = [];
    this._pageMatches[pageIndex] = [];

    // Sort `matchesWithLength`, remove intersecting terms and put the result
    // into the two arrays.
    this._prepareMatches(matchesWithLength, this._pageMatches[pageIndex],
      this._pageMatchesLength[pageIndex]);
  }

  _calculateMatch(pageIndex) {
    let pageContent = this._pageContents[pageIndex];
    let query = this._query;
    const { caseSensitive, entireWord, phraseSearch, } = this._state;

    if (query.length === 0) {
      // Do nothing: the matches should be wiped out already.
      return;
    }

    if (!caseSensitive) {
      pageContent = pageContent.toLowerCase();
      query = query.toLowerCase();
    }

    if (phraseSearch) {
      this._calculatePhraseMatch(query, pageIndex, pageContent, entireWord);
    } else {
      this._calculateWordMatch(query, pageIndex, pageContent, entireWord);
    }

    // When `highlightAll` is set, ensure that the matches on previously
    // rendered (and still active) pages are correctly highlighted.
    if (this._state.highlightAll) {
      this._updatePage(pageIndex);
    }
    if (this._resumePageIdx === pageIndex) {
      this._resumePageIdx = null;
      this._nextPageMatch();
    }

    // Update the match count.
    const pageMatchesCount = this._pageMatches[pageIndex].length;
    if (pageMatchesCount > 0) {
      this._matchesCountTotal += pageMatchesCount;
      this._updateUIResultsCount();
    }
  }

  _extractText() {
    // Perform text extraction once if this method is called multiple times.
    if (this._extractTextPromises.length > 0) {
      return;
    }

    let promise = Promise.resolve();
    for (let i = 0, ii = this._linkService.pagesCount; i < ii; i++) {
      const extractTextCapability = createPromiseCapability();
      this._extractTextPromises[i] = extractTextCapability.promise;

      promise = promise.then(() => {
        return this._pdfDocument.getPage(i + 1).then((pdfPage) => {
          return pdfPage.getTextContent({
            normalizeWhitespace: true,
          });
        }).then((textContent) => {
          const textItems = textContent.items;
          const strBuf = [];

          for (let j = 0, jj = textItems.length; j < jj; j++) {
            strBuf.push(textItems[j].str);
          }

          // Store the normalized page content (text items) as one string.
          this._pageContents[i] = normalize(strBuf.join(''));
          extractTextCapability.resolve(i);
        }, (reason) => {
          console.error(`Unable to get text content for page ${i + 1}`, reason);
          // Page error -- assuming no text content.
          this._pageContents[i] = '';
          extractTextCapability.resolve(i);
        });
      });
    }
  }

  _updatePage(index) {
    if (this._scrollMatches && this._selected.pageIdx === index) {
      // If the page is selected, scroll the page into view, which triggers
      // rendering the page, which adds the text layer. Once the text layer
      // is built, it will attempt to scroll the selected match into view.
      this._linkService.page = index + 1;
    }

    this._eventBus.dispatch('updatetextlayermatches', {
      source: this,
      pageIndex: index,
    });
  }

  _updateAllPages() {
    this._eventBus.dispatch('updatetextlayermatches', {
      source: this,
      pageIndex: -1,
    });
  }

  _nextMatch() {
    const previous = this._state.findPrevious;
    const currentPageIndex = this._linkService.page - 1;
    const numPages = this._linkService.pagesCount;

    this._highlightMatches = true;

    if (this._dirtyMatch) {
      // Need to recalculate the matches, reset everything.
      this._dirtyMatch = false;
      this._selected.pageIdx = this._selected.matchIdx = -1;
      this._offset.pageIdx = currentPageIndex;
      this._offset.matchIdx = null;
      this._offset.wrapped = false;
      this._resumePageIdx = null;
      this._pageMatches.length = 0;
      this._pageMatchesLength.length = 0;
      this._matchesCountTotal = 0;

      this._updateAllPages(); // Wipe out any previously highlighted matches.

      for (let i = 0; i < numPages; i++) {
        // Start finding the matches as soon as the text is extracted.
        if (this._pendingFindMatches[i] === true) {
          continue;
        }
        this._pendingFindMatches[i] = true;
        this._extractTextPromises[i].then((pageIdx) => {
          delete this._pendingFindMatches[pageIdx];
          this._calculateMatch(pageIdx);
        });
      }
    }

    // If there's no query there's no point in searching.
    if (this._query === '') {
      this._updateUIState(FindState.FOUND);
      return;
    }
    // If we're waiting on a page, we return since we can't do anything else.
    if (this._resumePageIdx) {
      return;
    }

    const offset = this._offset;
    // Keep track of how many pages we should maximally iterate through.
    this._pagesToSearch = numPages;
    // If there's already a `matchIdx` that means we are iterating through a
    // page's matches.
    if (offset.matchIdx !== null) {
      const numPageMatches = this._pageMatches[offset.pageIdx].length;
      if ((!previous && offset.matchIdx + 1 < numPageMatches) ||
          (previous && offset.matchIdx > 0)) {
        // The simple case; we just have advance the matchIdx to select
        // the next match on the page.
        offset.matchIdx = (previous ? offset.matchIdx - 1 :
                                      offset.matchIdx + 1);
        this._updateMatch(/* found = */ true);
        return;
      }
      // We went beyond the current page's matches, so we advance to
      // the next page.
      this._advanceOffsetPage(previous);
    }
    // Start searching through the page.
    this._nextPageMatch();
  }

  _matchesReady(matches) {
    const offset = this._offset;
    const numMatches = matches.length;
    const previous = this._state.findPrevious;

    if (numMatches) {
      // There were matches for the page, so initialize `matchIdx`.
      offset.matchIdx = (previous ? numMatches - 1 : 0);
      this._updateMatch(/* found = */ true);
      return true;
    }
    // No matches, so attempt to search the next page.
    this._advanceOffsetPage(previous);
    if (offset.wrapped) {
      offset.matchIdx = null;
      if (this._pagesToSearch < 0) {
        // No point in wrapping again, there were no matches.
        this._updateMatch(/* found = */ false);
        // While matches were not found, searching for a page
        // with matches should nevertheless halt.
        return true;
      }
    }
    // Matches were not found (and searching is not done).
    return false;
  }

  _nextPageMatch() {
    if (this._resumePageIdx !== null) {
      console.error('There can only be one pending page.');
    }

    let matches = null;
    do {
      const pageIdx = this._offset.pageIdx;
      matches = this._pageMatches[pageIdx];
      if (!matches) {
        // The matches don't exist yet for processing by `_matchesReady`,
        // so set a resume point for when they do exist.
        this._resumePageIdx = pageIdx;
        break;
      }
    } while (!this._matchesReady(matches));
  }

  _advanceOffsetPage(previous) {
    const offset = this._offset;
    const numPages = this._linkService.pagesCount;
    offset.pageIdx = (previous ? offset.pageIdx - 1 : offset.pageIdx + 1);
    offset.matchIdx = null;

    this._pagesToSearch--;

    if (offset.pageIdx >= numPages || offset.pageIdx < 0) {
      offset.pageIdx = (previous ? numPages - 1 : 0);
      offset.wrapped = true;
    }
  }

  _updateMatch(found = false) {
    let state = FindState.NOT_FOUND;
    const wrapped = this._offset.wrapped;
    this._offset.wrapped = false;

    if (found) {
      const previousPage = this._selected.pageIdx;
      this._selected.pageIdx = this._offset.pageIdx;
      this._selected.matchIdx = this._offset.matchIdx;
      state = (wrapped ? FindState.WRAPPED : FindState.FOUND);

      // Update the currently selected page to wipe out any selected matches.
      if (previousPage !== -1 && previousPage !== this._selected.pageIdx) {
        this._updatePage(previousPage);
      }
    }

    this._updateUIState(state, this._state.findPrevious);
    if (this._selected.pageIdx !== -1) {
      // Ensure that the match will be scrolled into view.
      this._scrollMatches = true;

      this._updatePage(this._selected.pageIdx);
    }
  }

  _onFindBarClose(evt) {
    const pdfDocument = this._pdfDocument;
    // Since searching is asynchronous, ensure that the removal of highlighted
    // matches (from the UI) is async too such that the 'updatetextlayermatches'
    // events will always be dispatched in the expected order.
    this._firstPageCapability.promise.then(() => {
      // Only update the UI if the document is open, and is the current one.
      if (!this._pdfDocument ||
          (pdfDocument && this._pdfDocument !== pdfDocument)) {
        return;
      }
      // Ensure that a pending, not yet started, search operation is aborted.
      if (this._findTimeout) {
        clearTimeout(this._findTimeout);
        this._findTimeout = null;
      }
      // Abort any long running searches, to avoid a match being scrolled into
      // view *after* the findbar has been closed. In this case `this._offset`
      // will most likely differ from `this._selected`, hence we also ensure
      // that any new search operation will always start with a clean slate.
      if (this._resumePageIdx) {
        this._resumePageIdx = null;
        this._dirtyMatch = true;
      }
      // Avoid the UI being in a pending state when the findbar is re-opened.
      this._updateUIState(FindState.FOUND);

      this._highlightMatches = false;
      this._updateAllPages(); // Wipe out any previously highlighted matches.
    });
  }

  _requestMatchesCount() {
    const { pageIdx, matchIdx, } = this._selected;
    let current = 0, total = this._matchesCountTotal;
    if (matchIdx !== -1) {
      for (let i = 0; i < pageIdx; i++) {
        current += (this._pageMatches[i] && this._pageMatches[i].length) || 0;
      }
      current += matchIdx + 1;
    }
    // When searching starts, this method may be called before the `pageMatches`
    // have been counted (in `_calculateMatch`). Ensure that the UI won't show
    // temporarily broken state when the active find result doesn't make sense.
    if (current < 1 || current > total) {
      current = total = 0;
    }
    return { current, total, };
  }

  _updateUIResultsCount() {
    this._eventBus.dispatch('updatefindmatchescount', {
      source: this,
      matchesCount: this._requestMatchesCount(),
    });
  }

  _updateUIState(state, previous) {
    this._eventBus.dispatch('updatefindcontrolstate', {
      source: this,
      state,
      previous,
      matchesCount: this._requestMatchesCount(),
    });
  }
}

export {
  FindState,
  PDFFindController,
};
