/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
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
/* globals PDFFindBar, PDFJS, FindStates, FirefoxCom, Promise */

'use strict';

/**
 * Provides a "search" or "find" functionality for the PDF.
 * This object actually performs the search for a given string.
 */

var PDFFindController = {
  startedTextExtraction: false,
  extractTextPromises: [],
  pendingFindMatches: {},
  active: false, // If active, find results will be highlighted.
  pageContents: [], // Stores the text for each page.
  pageMatches: [],
  selected: { // Currently selected match.
    pageIdx: -1,
    matchIdx: -1
  },
  offset: { // Where the find algorithm currently is in the document.
    pageIdx: null,
    matchIdx: null
  },
  resumePageIdx: null,
  state: null,
  dirtyMatch: false,
  findTimeout: null,
  pdfPageSource: null,
  integratedFind: false,
  charactersToNormalize: {
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
    '\u00BE': '3/4' // Vulgar fraction three quarters
  },

  initialize: function(options) {
    if (typeof PDFFindBar === 'undefined' || PDFFindBar === null) {
      throw 'PDFFindController cannot be initialized ' +
            'without a PDFFindBar instance';
    }

    this.pdfPageSource = options.pdfPageSource;
    this.integratedFind = options.integratedFind;

    // Compile the regular expression for text normalization once
    var replace = Object.keys(this.charactersToNormalize).join('');
    this.normalizationRegex = new RegExp('[' + replace + ']', 'g');

    var events = [
      'find',
      'findagain',
      'findhighlightallchange',
      'findcasesensitivitychange'
    ];

    this.firstPagePromise = new Promise(function (resolve) {
      this.resolveFirstPage = resolve;
    }.bind(this));
    this.handleEvent = this.handleEvent.bind(this);

    for (var i = 0, len = events.length; i < len; i++) {
      window.addEventListener(events[i], this.handleEvent);
    }
  },

  reset: function pdfFindControllerReset() {
    this.startedTextExtraction = false;
    this.extractTextPromises = [];
    this.active = false;
  },

  normalize: function pdfFindControllerNormalize(text) {
    return text.replace(this.normalizationRegex, function (ch) {
      return PDFFindController.charactersToNormalize[ch];
    });
  },

  calcFindMatch: function(pageIndex) {
    var pageContent = this.normalize(this.pageContents[pageIndex]);
    var query = this.normalize(this.state.query);
    var caseSensitive = this.state.caseSensitive;
    var queryLen = query.length;

    if (queryLen === 0) {
      // Do nothing: the matches should be wiped out already.
      return;
    }

    if (!caseSensitive) {
      pageContent = pageContent.toLowerCase();
      query = query.toLowerCase();
    }

    var matches = [];
    var matchIdx = -queryLen;
    while (true) {
      matchIdx = pageContent.indexOf(query, matchIdx + queryLen);
      if (matchIdx === -1) {
        break;
      }
      matches.push(matchIdx);
    }
    this.pageMatches[pageIndex] = matches;
    this.updatePage(pageIndex);
    if (this.resumePageIdx === pageIndex) {
      this.resumePageIdx = null;
      this.nextPageMatch();
    }
  },

  extractText: function() {
    if (this.startedTextExtraction) {
      return;
    }
    this.startedTextExtraction = true;

    this.pageContents = [];
    var extractTextPromisesResolves = [];
    var numPages = this.pdfPageSource.pdfDocument.numPages;
    for (var i = 0; i < numPages; i++) {
      this.extractTextPromises.push(new Promise(function (resolve) {
        extractTextPromisesResolves.push(resolve);
      }));
    }

    var self = this;
    function extractPageText(pageIndex) {
      self.pdfPageSource.pages[pageIndex].getTextContent().then(
        function textContentResolved(textContent) {
          var textItems = textContent.items;
          var str = [];

          for (var i = 0, len = textItems.length; i < len; i++) {
            str.push(textItems[i].str);
          }

          // Store the pageContent as a string.
          self.pageContents.push(str.join(''));

          extractTextPromisesResolves[pageIndex](pageIndex);
          if ((pageIndex + 1) < self.pdfPageSource.pages.length) {
            extractPageText(pageIndex + 1);
          }
        }
      );
    }
    extractPageText(0);
  },

  handleEvent: function(e) {
    if (this.state === null || e.type !== 'findagain') {
      this.dirtyMatch = true;
    }
    this.state = e.detail;
    this.updateUIState(FindStates.FIND_PENDING);

    this.firstPagePromise.then(function() {
      this.extractText();

      clearTimeout(this.findTimeout);
      if (e.type === 'find') {
        // Only trigger the find action after 250ms of silence.
        this.findTimeout = setTimeout(this.nextMatch.bind(this), 250);
      } else {
        this.nextMatch();
      }
    }.bind(this));
  },

  updatePage: function(idx) {
    var page = this.pdfPageSource.pages[idx];

    if (this.selected.pageIdx === idx) {
      // If the page is selected, scroll the page into view, which triggers
      // rendering the page, which adds the textLayer. Once the textLayer is
      // build, it will scroll onto the selected match.
      page.scrollIntoView();
    }

    if (page.textLayer) {
      page.textLayer.updateMatches();
    }
  },

  nextMatch: function() {
    var previous = this.state.findPrevious;
    var currentPageIndex = this.pdfPageSource.page - 1;
    var numPages = this.pdfPageSource.pages.length;

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
      var self = this;

      for (var i = 0; i < numPages; i++) {
        // Wipe out any previous highlighted matches.
        this.updatePage(i);

        // As soon as the text is extracted start finding the matches.
        if (!(i in this.pendingFindMatches)) {
          this.pendingFindMatches[i] = true;
          this.extractTextPromises[i].then(function(pageIdx) {
            delete self.pendingFindMatches[pageIdx];
            self.calcFindMatch(pageIdx);
          });
        }
      }
    }

    // If there's no query there's no point in searching.
    if (this.state.query === '') {
      this.updateUIState(FindStates.FIND_FOUND);
      return;
    }

    // If we're waiting on a page, we return since we can't do anything else.
    if (this.resumePageIdx) {
      return;
    }

    var offset = this.offset;
    // If there's already a matchIdx that means we are iterating through a
    // page's matches.
    if (offset.matchIdx !== null) {
      var numPageMatches = this.pageMatches[offset.pageIdx].length;
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
  },

  matchesReady: function(matches) {
    var offset = this.offset;
    var numMatches = matches.length;
    var previous = this.state.findPrevious;
    if (numMatches) {
      // There were matches for the page, so initialize the matchIdx.
      this.hadMatch = true;
      offset.matchIdx = (previous ? numMatches - 1 : 0);
      this.updateMatch(true);
      return true;
    } else {
      // No matches, so attempt to search the next page.
      this.advanceOffsetPage(previous);
      if (offset.wrapped) {
        offset.matchIdx = null;
        if (!this.hadMatch) {
          // No point in wrapping, there were no matches.
          this.updateMatch(false);
          // while matches were not found, searching for a page 
          // with matches should nevertheless halt.
          return true;
        }
      }
      // Matches were not found (and searching is not done).
      return false;
    }
  },

  nextPageMatch: function() {
    if (this.resumePageIdx !== null) {
      console.error('There can only be one pending page.');
    }
    do {
      var pageIdx = this.offset.pageIdx;
      var matches = this.pageMatches[pageIdx];
      if (!matches) {
        // The matches don't exist yet for processing by "matchesReady",
        // so set a resume point for when they do exist.
        this.resumePageIdx = pageIdx;
        break;
      }
    } while (!this.matchesReady(matches));
  },

  advanceOffsetPage: function(previous) {
    var offset = this.offset;
    var numPages = this.extractTextPromises.length;
    offset.pageIdx = (previous ? offset.pageIdx - 1 : offset.pageIdx + 1);
    offset.matchIdx = null;
    if (offset.pageIdx >= numPages || offset.pageIdx < 0) {
      offset.pageIdx = (previous ? numPages - 1 : 0);
      offset.wrapped = true;
      return;
    }
  },

  updateMatch: function(found) {
    var state = FindStates.FIND_NOTFOUND;
    var wrapped = this.offset.wrapped;
    this.offset.wrapped = false;
    if (found) {
      var previousPage = this.selected.pageIdx;
      this.selected.pageIdx = this.offset.pageIdx;
      this.selected.matchIdx = this.offset.matchIdx;
      state = (wrapped ? FindStates.FIND_WRAPPED : FindStates.FIND_FOUND);
      // Update the currently selected page to wipe out any selected matches.
      if (previousPage !== -1 && previousPage !== this.selected.pageIdx) {
        this.updatePage(previousPage);
      }
    }
    this.updateUIState(state, this.state.findPrevious);
    if (this.selected.pageIdx !== -1) {
      this.updatePage(this.selected.pageIdx, true);
    }
  },

  updateUIState: function(state, previous) {
    if (this.integratedFind) {
      FirefoxCom.request('updateFindControlState',
                         { result: state, findPrevious: previous });
      return;
    }
    PDFFindBar.updateUIState(state, previous);
  }
};

