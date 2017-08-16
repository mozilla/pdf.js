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

import { createPromiseCapability } from 'pdfjs-lib';
import { scrollIntoView } from './ui_utils';

const FindState = {
  FOUND: 0,
  NOT_FOUND: 1,
  WRAPPED: 2,
  PENDING: 3,
};

const FIND_SCROLL_OFFSET_TOP = -50;
const FIND_SCROLL_OFFSET_LEFT = -400;
const FIND_TIMEOUT = 250; // ms

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

/**
 * Provides search functionality to find a given string in a PDF document.
 */
class PDFFindController {
  constructor({ pdfViewer, }) {
    this.pdfViewer = pdfViewer;

    this.onUpdateResultsCount = null;
    this.onUpdateState = null;

    this.reset();

    // Compile the regular expression for text normalization once.
    let replace = Object.keys(CHARACTERS_TO_NORMALIZE).join('');
    this.normalizationRegex = new RegExp('[' + replace + ']', 'g');
  }

  reset() {
    this.startedTextExtraction = false;
    this.extractTextPromises = [];
    this.pendingFindMatches = Object.create(null);
    this.active = false; // If active, find results will be highlighted.
    this.pageContents = []; // Stores the text for each page.
    this.pageMatches = [];
    this.pageMatchesLength = null;
    this.matchCount = 0;
    this.selected = { // Currently selected match.
      pageIdx: -1,
      matchIdx: -1,
    };
    this.offset = { // Where the find algorithm currently is in the document.
      pageIdx: null,
      matchIdx: null,
    };
    this.pagesToSearch = null;
    this.resumePageIdx = null;
    this.state = null;
    this.dirtyMatch = false;
    this.findTimeout = null;

    this._firstPagePromise = new Promise((resolve) => {
      this.resolveFirstPage = resolve;
    });
  }

  normalize(text) {
    return text.replace(this.normalizationRegex, function (ch) {
      return CHARACTERS_TO_NORMALIZE[ch];
    });
  }

  /**
   * Helper for multi-term search that fills the `matchesWithLength` array
   * and handles cases where one search term includes another search term (for
   * example, "tamed tame" or "this is"). It looks for intersecting terms in
   * the `matches` and keeps elements with a longer match length.
   */
  _prepareMatches(matchesWithLength, matches, matchesLength) {
    function isSubTerm(matchesWithLength, currentIndex) {
      let currentElem = matchesWithLength[currentIndex];
      let nextElem = matchesWithLength[currentIndex + 1];

      // Check for cases like "TAMEd TAME".
      if (currentIndex < matchesWithLength.length - 1 &&
          currentElem.match === nextElem.match) {
        currentElem.skipped = true;
        return true;
      }

      // Check for cases like "thIS IS".
      for (let i = currentIndex - 1; i >= 0; i--) {
        let prevElem = matchesWithLength[i];
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

  calcFindPhraseMatch(query, pageIndex, pageContent) {
    let matches = [];
    let queryLen = query.length;
    let matchIdx = -queryLen;
    while (true) {
      matchIdx = pageContent.indexOf(query, matchIdx + queryLen);
      if (matchIdx === -1) {
        break;
      }
      matches.push(matchIdx);
    }
    this.pageMatches[pageIndex] = matches;
  }

  calcFindWordMatch(query, pageIndex, pageContent) {
    let matchesWithLength = [];
    // Divide the query into pieces and search for text in each piece.
    let queryArray = query.match(/\S+/g);
    for (let i = 0, len = queryArray.length; i < len; i++) {
      let subquery = queryArray[i];
      let subqueryLen = subquery.length;
      let matchIdx = -subqueryLen;
      while (true) {
        matchIdx = pageContent.indexOf(subquery, matchIdx + subqueryLen);
        if (matchIdx === -1) {
          break;
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
    if (!this.pageMatchesLength) {
      this.pageMatchesLength = [];
    }
    this.pageMatchesLength[pageIndex] = [];
    this.pageMatches[pageIndex] = [];

    // Sort `matchesWithLength`, remove intersecting terms and put the result
    // into the two arrays.
    this._prepareMatches(matchesWithLength, this.pageMatches[pageIndex],
      this.pageMatchesLength[pageIndex]);
  }

  calcFindMatch(pageIndex) {
    let pageContent = this.normalize(this.pageContents[pageIndex]);
    let query = this.normalize(this.state.query);
    let caseSensitive = this.state.caseSensitive;
    let phraseSearch = this.state.phraseSearch;
    let queryLen = query.length;

    if (queryLen === 0) {
      // Do nothing: the matches should be wiped out already.
      return;
    }

    if (!caseSensitive) {
      pageContent = pageContent.toLowerCase();
      query = query.toLowerCase();
    }

    if (phraseSearch) {
      this.calcFindPhraseMatch(query, pageIndex, pageContent);
    } else {
      this.calcFindWordMatch(query, pageIndex, pageContent);
    }

    this.updatePage(pageIndex);
    if (this.resumePageIdx === pageIndex) {
      this.resumePageIdx = null;
      this.nextPageMatch();
    }

    // Update the match count.
    if (this.pageMatches[pageIndex].length > 0) {
      this.matchCount += this.pageMatches[pageIndex].length;
      this.updateUIResultsCount();
    }
  }

  extractText() {
    if (this.startedTextExtraction) {
      return;
    }
    this.startedTextExtraction = true;
    this.pageContents.length = 0;

    let promise = Promise.resolve();
    for (let i = 0, ii = this.pdfViewer.pagesCount; i < ii; i++) {
      let extractTextCapability = createPromiseCapability();
      this.extractTextPromises[i] = extractTextCapability.promise;

      promise = promise.then(() => {
        return this.pdfViewer.getPageTextContent(i).then((textContent) => {
          let textItems = textContent.items;
          let strBuf = [];

          for (let j = 0, jj = textItems.length; j < jj; j++) {
            strBuf.push(textItems[j].str);
          }
          // Store the pageContent as a string.
          this.pageContents[i] = strBuf.join('');
          extractTextCapability.resolve(i);
        }, (reason) => {
          console.error(`Unable to get page ${i + 1} text content`, reason);
          // Page error -- assuming no text content.
          this.pageContents[i] = '';
          extractTextCapability.resolve(i);
        });
      });
    }
  }

  executeCommand(cmd, state) {
    if (this.state === null || cmd !== 'findagain') {
      this.dirtyMatch = true;
    }
    this.state = state;
    this.updateUIState(FindState.PENDING);

    this._firstPagePromise.then(() => {
      this.extractText();

      clearTimeout(this.findTimeout);
      if (cmd === 'find') {
        // Trigger the find action with a small delay to avoid starting the
        // search when the user is still typing (saving resources).
        this.findTimeout = setTimeout(this.nextMatch.bind(this), FIND_TIMEOUT);
      } else {
        this.nextMatch();
      }
    });
  }

  updatePage(index) {
    if (this.selected.pageIdx === index) {
      // If the page is selected, scroll the page into view, which triggers
      // rendering the page, which adds the textLayer. Once the textLayer is
      // build, it will scroll onto the selected match.
      this.pdfViewer.currentPageNumber = index + 1;
    }

    let page = this.pdfViewer.getPageView(index);
    if (page.textLayer) {
      page.textLayer.updateMatches();
    }
  }

  nextMatch() {
    let previous = this.state.findPrevious;
    let currentPageIndex = this.pdfViewer.currentPageNumber - 1;
    let numPages = this.pdfViewer.pagesCount;

    this.active = true;

    if (this.dirtyMatch) {
      // Need to recalculate the matches, reset everything.
      this.dirtyMatch = false;
      this.selected.pageIdx = this.selected.matchIdx = -1;
      this.offset.pageIdx = currentPageIndex;
      this.offset.matchIdx = null;
      this.hadMatch = false;
      this.resumePageIdx = null;
      this.pageMatches = [];
      this.matchCount = 0;
      this.pageMatchesLength = null;

      for (let i = 0; i < numPages; i++) {
        // Wipe out any previously highlighted matches.
        this.updatePage(i);

        // Start finding the matches as soon as the text is extracted.
        if (!(i in this.pendingFindMatches)) {
          this.pendingFindMatches[i] = true;
          this.extractTextPromises[i].then((pageIdx) => {
            delete this.pendingFindMatches[pageIdx];
            this.calcFindMatch(pageIdx);
          });
        }
      }
    }

    // If there's no query there's no point in searching.
    if (this.state.query === '') {
      this.updateUIState(FindState.FOUND);
      return;
    }

    // If we're waiting on a page, we return since we can't do anything else.
    if (this.resumePageIdx) {
      return;
    }

    let offset = this.offset;
    // Keep track of how many pages we should maximally iterate through.
    this.pagesToSearch = numPages;
    // If there's already a `matchIdx` that means we are iterating through a
    // page's matches.
    if (offset.matchIdx !== null) {
      let numPageMatches = this.pageMatches[offset.pageIdx].length;
      if ((!previous && offset.matchIdx + 1 < numPageMatches) ||
          (previous && offset.matchIdx > 0)) {
        // The simple case; we just have advance the matchIdx to select
        // the next match on the page.
        this.hadMatch = true;
        offset.matchIdx = (previous ? offset.matchIdx - 1 :
                                      offset.matchIdx + 1);
        this.updateMatch(true);
        return;
      }
      // We went beyond the current page's matches, so we advance to
      // the next page.
      this.advanceOffsetPage(previous);
    }
    // Start searching through the page.
    this.nextPageMatch();
  }

  matchesReady(matches) {
    let offset = this.offset;
    let numMatches = matches.length;
    let previous = this.state.findPrevious;

    if (numMatches) {
      // There were matches for the page, so initialize `matchIdx`.
      this.hadMatch = true;
      offset.matchIdx = (previous ? numMatches - 1 : 0);
      this.updateMatch(true);
      return true;
    }
    // No matches, so attempt to search the next page.
    this.advanceOffsetPage(previous);
    if (offset.wrapped) {
      offset.matchIdx = null;
      if (this.pagesToSearch < 0) {
        // No point in wrapping again, there were no matches.
        this.updateMatch(false);
        // While matches were not found, searching for a page
        // with matches should nevertheless halt.
        return true;
      }
    }
    // Matches were not found (and searching is not done).
    return false;
  }

  /**
   * Called from the text layer when match presentation is updated.
   *
   * @param {number} pageIndex - The index of the page.
   * @param {number} matchIndex - The index of the match.
   * @param {Array} elements - Text layer `div` elements.
   * @param {number} beginIdx - Start index of the `div` array for the match.
   */
  updateMatchPosition(pageIndex, matchIndex, elements, beginIdx) {
    if (this.selected.matchIdx === matchIndex &&
        this.selected.pageIdx === pageIndex) {
      let spot = {
        top: FIND_SCROLL_OFFSET_TOP,
        left: FIND_SCROLL_OFFSET_LEFT,
      };
      scrollIntoView(elements[beginIdx], spot,
                     /* skipOverflowHiddenElements = */ true);
    }
  }

  nextPageMatch() {
    if (this.resumePageIdx !== null) {
      console.error('There can only be one pending page.');
    }

    let matches = null;
    do {
      let pageIdx = this.offset.pageIdx;
      matches = this.pageMatches[pageIdx];
      if (!matches) {
        // The matches don't exist yet for processing by `matchesReady`,
        // so set a resume point for when they do exist.
        this.resumePageIdx = pageIdx;
        break;
      }
    } while (!this.matchesReady(matches));
  }

  advanceOffsetPage(previous) {
    let offset = this.offset;
    let numPages = this.extractTextPromises.length;
    offset.pageIdx = (previous ? offset.pageIdx - 1 : offset.pageIdx + 1);
    offset.matchIdx = null;

    this.pagesToSearch--;

    if (offset.pageIdx >= numPages || offset.pageIdx < 0) {
      offset.pageIdx = (previous ? numPages - 1 : 0);
      offset.wrapped = true;
    }
  }

  updateMatch(found = false) {
    let state = FindState.NOT_FOUND;
    let wrapped = this.offset.wrapped;
    this.offset.wrapped = false;

    if (found) {
      let previousPage = this.selected.pageIdx;
      this.selected.pageIdx = this.offset.pageIdx;
      this.selected.matchIdx = this.offset.matchIdx;
      state = (wrapped ? FindState.WRAPPED : FindState.FOUND);

      // Update the currently selected page to wipe out any selected matches.
      if (previousPage !== -1 && previousPage !== this.selected.pageIdx) {
        this.updatePage(previousPage);
      }
    }

    this.updateUIState(state, this.state.findPrevious);
    if (this.selected.pageIdx !== -1) {
      this.updatePage(this.selected.pageIdx);
    }
  }

  updateUIResultsCount() {
    if (this.onUpdateResultsCount) {
      this.onUpdateResultsCount(this.matchCount);
    }
  }

  updateUIState(state, previous) {
    if (this.onUpdateState) {
      this.onUpdateState(state, previous, this.matchCount);
    }
  }
}

export {
  FindState,
  PDFFindController,
};
