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

'use strict';

/* globals PDFFindBar, PDFJS, FindStates, FirefoxCom, Promise */

/**
 * Provides a "search" or "find" functionality for the PDF.
 * This object actually performs the search for a given string.
 */

var PDFFindController = {
  startedTextExtraction: false,

  extractTextPromises: [],

  pendingFindMatches: {},

  // If active, find results will be highlighted.
  active: false,

  // Stores the text for each page.
  pageContents: [],

  pageMatches: [],

  // Currently selected match.
  selected: {
    pageIdx: -1,
    matchIdx: -1
  },

  // Where find algorithm currently is in the document.
  offset: {
    pageIdx: null,
    matchIdx: null
  },

  resumePageIdx: null,

  state: null,

  dirtyMatch: false,

  findTimeout: null,

  pdfPageSource: null,

  integratedFind: false,

  initialize: function(options) {
    if(typeof PDFFindBar === 'undefined' || PDFFindBar === null) {
      throw 'PDFFindController cannot be initialized ' +
            'without a PDFFindController instance';
    }

    this.pdfPageSource = options.pdfPageSource;
    this.integratedFind = options.integratedFind;

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

    for (var i = 0; i < events.length; i++) {
      window.addEventListener(events[i], this.handleEvent);
    }

    // Initialize capability for passing pdf text content to external scripts
    this.firstPagePromise.then(function() {
      this.initExtTxtRequests();
    }.bind(this));
  },

  reset: function pdfFindControllerReset() {
    this.startedTextExtraction = false;
    this.extractTextPromises = [];
    this.active = false;
  },

  calcFindMatch: function(pageIndex) {
    var pageContent = this.pageContents[pageIndex];
    var query = this.state.query;
    var caseSensitive = this.state.caseSensitive;
    var queryLen = query.length;

    if (queryLen === 0) {
      // Do nothing the matches should be wiped out already.
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
    for (var i = 0, ii = this.pdfPageSource.pdfDocument.numPages; i < ii; i++) {
      this.extractTextPromises.push(new Promise(function (resolve) {
        extractTextPromisesResolves.push(resolve);
      }));
    }

    var self = this;
    function extractPageText(pageIndex) {
      self.pdfPageSource.pages[pageIndex].getTextContent().then(
        function textContentResolved(bidiTexts) {
          var str = '';

          for (var i = 0; i < bidiTexts.length; i++) {
            str += bidiTexts[i].str;
          }

          // Store the pageContent as a string.
          self.pageContents.push(str);

          extractTextPromisesResolves[pageIndex](pageIndex);
          if ((pageIndex + 1) < self.pdfPageSource.pages.length)
            extractPageText(pageIndex + 1);
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
        // The simple case, we just have advance the matchIdx to select the next
        // match on the page.
        this.hadMatch = true;
        offset.matchIdx = previous ? offset.matchIdx - 1 : offset.matchIdx + 1;
        this.updateMatch(true);
        return;
      }
      // We went beyond the current page's matches, so we advance to the next
      // page.
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
      offset.matchIdx = previous ? numMatches - 1 : 0;
      this.updateMatch(true);
      // matches were found
      return true;
    } else {
      // No matches attempt to search the next page.
      this.advanceOffsetPage(previous);
      if (offset.wrapped) {
        offset.matchIdx = null;
        if (!this.hadMatch) {
          // No point in wrapping there were no matches.
          this.updateMatch(false);
          // while matches were not found, searching for a page 
          // with matches should nevertheless halt.
          return true;
        }
      }
      // matches were not found (and searching is not done)
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
    offset.pageIdx = previous ? offset.pageIdx - 1 : offset.pageIdx + 1;
    offset.matchIdx = null;
    if (offset.pageIdx >= numPages || offset.pageIdx < 0) {
      offset.pageIdx = previous ? numPages - 1 : 0;
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
      state = wrapped ? FindStates.FIND_WRAPPED : FindStates.FIND_FOUND;
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
                         {result: state, findPrevious: previous});
      return;
    }
    PDFFindBar.updateUIState(state, previous);
  },

  initExtTxtRequests: function pdfInitExtTxtRequests() {
    // Prepare to service external requests for the text of the pdf
    this.handleGetTextEvent = this.handleGetTextEvent.bind(this);
    window.addEventListener('getPdfText', this.handleGetTextEvent , false );

    // Prepare to service external requests for a Ready Event
    this.handleReqReadyEvent = this.handleReqReadyEvent.bind(this);
    window.addEventListener('pdfRequestReadyEvent', this.handleReqReadyEvent,
      false );

    // Notify listeners that we can now service external text requests
    this.handleReqReadyEvent();
  },

  handleReqReadyEvent: function pdfReqReadyEvent() {
    var notifyEvent = document.createEvent('CustomEvent');
    notifyEvent.initCustomEvent('pdfTextReady', true, true, {
      numPages: this.pdfPageSource.pdfDocument.numPages,
      numPagesResolved: this.pageContents.length,
    });
    window.dispatchEvent(notifyEvent);
  },

  handleGetTextEvent: function pdfGetTextEvent(event) {
    var edet = event.detail;
    var fullPageCount = this.pdfPageSource.pdfDocument.numPages;

    // normalize output event name from passed parameter
    var outEvntName = typeof(edet.evntName) === 'string' ? edet.evntName : '';
    if (outEvntName.length === 0 || outEvntName === 'pdfTextContent') {
      // Use a default output event name, and we also use default parameters
      // so that all events having the default name have the same semantics.
      // Default semantics is to return all of the pdf text in one event.
      outEvntName = 'pdfTextContent';
      edet = {};
    }

    // normalize and default passed and undefined integer parameters
    var startPage = edet.startPage;
    if (typeof (startPage) !== 'number' || startPage < 0) {
      startPage = 0;
    }
    if (fullPageCount < startPage) {
      startPage = fullPageCount;
    }
    var pageCount = edet.pageCount;
    if (typeof (pageCount) !== 'number') {
      pageCount = fullPageCount;
    }
    if( pageCount < 0 ) {
      pageCount = 0;
    }
    if (fullPageCount - startPage < pageCount) {
      pageCount = fullPageCount - startPage;
    }
    // force these 'number' values to in fact be integers
    startPage = Math.floor(startPage);
    pageCount = Math.floor(pageCount);

    var txtReq = {
      startPage: startPage,
      pageCount: pageCount,
      outEvntName: outEvntName
    };

    // start text extraction if not yet started and if this request would wait
    // for the resolution of some text--i.e. startPage + pageCount > zero.
    if (!this.startedTextExtraction && (0 < (startPage + pageCount))) {
      this.extractText();
    }

    if (startPage + pageCount <= this.pageContents.length) {
      // send status and any text requested
      this.sendStatsAndText(txtReq);
    } else {
      // complete asynchronously when text sufficient to complete the request
      // is available, i.e. we have text for index (startPage + pageCount - 1)
      this.extractTextPromises[startPage + pageCount - 1].then(function() {
        this.sendStatsAndText(txtReq);
      }.bind(this));
    }
  },

  sendStatsAndText: function pdfSendStatsAndText(txtReq) {
    // build a text content array (empty if txtReq.pageCount is zero)
    var text = [];
    for (var i = txtReq.startPage, ii = i + txtReq.pageCount; i < ii; i++) {
      text.push(this.pageContents[i]);
    }

    // send status and any text via the designated event
    var evntOut = document.createEvent('CustomEvent');
    evntOut.initCustomEvent(txtReq.outEvntName, true, true, {
      numPages: this.pdfPageSource.pdfDocument.numPages,
      numPagesResolved: this.pageContents.length,
      startPage: txtReq.startPage,
      pdfTextContent: text
    });
    window.dispatchEvent(evntOut);
  }
};

