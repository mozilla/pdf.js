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
/* globals chrome */

import { getGlobalEventBus } from './dom_events';

function PDFHistory(options) {
  this.linkService = options.linkService;
  this.eventBus = options.eventBus || getGlobalEventBus();

  this.initialized = false;
  this.initialDestination = null;
  this.initialBookmark = null;
}

PDFHistory.prototype = {
  /**
   * @param {string} fingerprint
   */
  initialize: function pdfHistoryInitialize(fingerprint) {
    this.initialized = true;
    this.reInitialized = false;
    this.allowHashChange = true;
    this.historyUnlocked = true;
    this.isViewerInPresentationMode = false;

    this.previousHash = window.location.hash.substring(1);
    this.currentBookmark = '';
    this.currentPage = 0;
    this.updatePreviousBookmark = false;
    this.previousBookmark = '';
    this.previousPage = 0;
    this.nextHashParam = '';

    this.fingerprint = fingerprint;
    this.currentUid = this.uid = 0;
    this.current = {};

    var state = window.history.state;
    if (this._isStateObjectDefined(state)) {
      // This corresponds to navigating back to the document
      // from another page in the browser history.
      if (state.target.dest) {
        this.initialDestination = state.target.dest;
      } else {
        this.initialBookmark = state.target.hash;
      }
      this.currentUid = state.uid;
      this.uid = state.uid + 1;
      this.current = state.target;
    } else {
      // This corresponds to the loading of a new document.
      if (state && state.fingerprint &&
        this.fingerprint !== state.fingerprint) {
        // Reinitialize the browsing history when a new document
        // is opened in the web viewer.
        this.reInitialized = true;
      }
      this._pushOrReplaceState({fingerprint: this.fingerprint}, true);
    }

    var self = this;
    window.addEventListener('popstate', function pdfHistoryPopstate(evt) {
      if (!self.historyUnlocked) {
        return;
      }
      if (evt.state) {
        // Move back/forward in the history.
        self._goTo(evt.state);
        return;
      }

      // If the state is not set, then the user tried to navigate to a
      // different hash by manually editing the URL and pressing Enter, or by
      // clicking on an in-page link (e.g. the "current view" link).
      // Save the current view state to the browser history.

      // Note: In Firefox, history.null could also be null after an in-page
      // navigation to the same URL, and without dispatching the popstate
      // event: https://bugzilla.mozilla.org/show_bug.cgi?id=1183881

      if (self.uid === 0) {
        // Replace the previous state if it was not explicitly set.
        var previousParams = (self.previousHash && self.currentBookmark &&
          self.previousHash !== self.currentBookmark) ?
          {hash: self.currentBookmark, page: self.currentPage} :
          {page: 1};
        replacePreviousHistoryState(previousParams, function() {
          updateHistoryWithCurrentHash();
        });
      } else {
        updateHistoryWithCurrentHash();
      }
    });


    function updateHistoryWithCurrentHash() {
      self.previousHash = window.location.hash.slice(1);
      self._pushToHistory({hash: self.previousHash}, false, true);
      self._updatePreviousBookmark();
    }

    function replacePreviousHistoryState(params, callback) {
      // To modify the previous history entry, the following happens:
      // 1. history.back()
      // 2. _pushToHistory, which calls history.replaceState( ... )
      // 3. history.forward()
      // Because a navigation via the history API does not immediately update
      // the history state, the popstate event is used for synchronization.
      self.historyUnlocked = false;

      // Suppress the hashchange event to avoid side effects caused by
      // navigating back and forward.
      self.allowHashChange = false;
      window.addEventListener('popstate', rewriteHistoryAfterBack);
      history.back();

      function rewriteHistoryAfterBack() {
        window.removeEventListener('popstate', rewriteHistoryAfterBack);
        window.addEventListener('popstate', rewriteHistoryAfterForward);
        self._pushToHistory(params, false, true);
        history.forward();
      }
      function rewriteHistoryAfterForward() {
        window.removeEventListener('popstate', rewriteHistoryAfterForward);
        self.allowHashChange = true;
        self.historyUnlocked = true;
        callback();
      }
    }

    function pdfHistoryBeforeUnload() {
      var previousParams = self._getPreviousParams(null, true);
      if (previousParams) {
        var replacePrevious = (!self.current.dest &&
        self.current.hash !== self.previousHash);
        self._pushToHistory(previousParams, false, replacePrevious);
        self._updatePreviousBookmark();
      }
      // Remove the event listener when navigating away from the document,
      // since 'beforeunload' prevents Firefox from caching the document.
      window.removeEventListener('beforeunload', pdfHistoryBeforeUnload);
    }

    window.addEventListener('beforeunload', pdfHistoryBeforeUnload);

    window.addEventListener('pageshow', function pdfHistoryPageShow(evt) {
      // If the entire viewer (including the PDF file) is cached in
      // the browser, we need to reattach the 'beforeunload' event listener
      // since the 'DOMContentLoaded' event is not fired on 'pageshow'.
      window.addEventListener('beforeunload', pdfHistoryBeforeUnload);
    });

    self.eventBus.on('presentationmodechanged', function(e) {
      self.isViewerInPresentationMode = e.active;
    });
  },

  clearHistoryState: function pdfHistory_clearHistoryState() {
    this._pushOrReplaceState(null, true);
  },

  _isStateObjectDefined: function pdfHistory_isStateObjectDefined(state) {
    return (state && state.uid >= 0 &&
    state.fingerprint && this.fingerprint === state.fingerprint &&
    state.target && state.target.hash) ? true : false;
  },

  _pushOrReplaceState: function pdfHistory_pushOrReplaceState(stateObj,
                                                              replace) {
    // history.state.chromecomState is managed by chromecom.js.
    if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('CHROME') &&
        window.history.state && 'chromecomState' in window.history.state) {
      stateObj = stateObj || {};
      stateObj.chromecomState = window.history.state.chromecomState;
    }
    if (replace) {
      if (typeof PDFJSDev === 'undefined' ||
          PDFJSDev.test('GENERIC || CHROME')) {
        window.history.replaceState(stateObj, '', document.URL);
      } else {
        window.history.replaceState(stateObj, '');
      }
    } else {
      if (typeof PDFJSDev === 'undefined' ||
          PDFJSDev.test('GENERIC || CHROME')) {
        window.history.pushState(stateObj, '', document.URL);
      } else {
        window.history.pushState(stateObj, '');
      }
      if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('CHROME') &&
          top === window) {
        chrome.runtime.sendMessage('showPageAction');
      }
    }
  },

  get isHashChangeUnlocked() {
    if (!this.initialized) {
      return true;
    }
    return this.allowHashChange;
  },

  _updatePreviousBookmark: function pdfHistory_updatePreviousBookmark() {
    if (this.updatePreviousBookmark &&
      this.currentBookmark && this.currentPage) {
      this.previousBookmark = this.currentBookmark;
      this.previousPage = this.currentPage;
      this.updatePreviousBookmark = false;
    }
  },

  updateCurrentBookmark: function pdfHistoryUpdateCurrentBookmark(bookmark,
                                                                  pageNum) {
    if (this.initialized) {
      this.currentBookmark = bookmark.substring(1);
      this.currentPage = pageNum | 0;
      this._updatePreviousBookmark();
    }
  },

  updateNextHashParam: function pdfHistoryUpdateNextHashParam(param) {
    if (this.initialized) {
      this.nextHashParam = param;
    }
  },

  push: function pdfHistoryPush(params, isInitialBookmark) {
    if (!(this.initialized && this.historyUnlocked)) {
      return;
    }
    if (params.dest && !params.hash) {
      params.hash = (this.current.hash && this.current.dest &&
      this.current.dest === params.dest) ?
        this.current.hash :
        this.linkService.getDestinationHash(params.dest).split('#')[1];
    }
    if (params.page) {
      params.page |= 0;
    }
    if (isInitialBookmark) {
      var target = window.history.state.target;
      if (!target) {
        // Invoked when the user specifies an initial bookmark,
        // thus setting initialBookmark, when the document is loaded.
        this._pushToHistory(params, false);
        this.previousHash = window.location.hash.substring(1);
      }
      this.updatePreviousBookmark = this.nextHashParam ? false : true;
      if (target) {
        // If the current document is reloaded,
        // avoid creating duplicate entries in the history.
        this._updatePreviousBookmark();
      }
      return;
    }
    if (this.nextHashParam) {
      if (this.nextHashParam === params.hash) {
        this.nextHashParam = null;
        this.updatePreviousBookmark = true;
        return;
      }
      this.nextHashParam = null;
    }

    if (params.hash) {
      if (this.current.hash) {
        if (this.current.hash !== params.hash) {
          this._pushToHistory(params, true);
        } else {
          if (!this.current.page && params.page) {
            this._pushToHistory(params, false, true);
          }
          this.updatePreviousBookmark = true;
        }
      } else {
        this._pushToHistory(params, true);
      }
    } else if (this.current.page && params.page &&
      this.current.page !== params.page) {
      this._pushToHistory(params, true);
    }
  },

  _getPreviousParams: function pdfHistory_getPreviousParams(onlyCheckPage,
                                                            beforeUnload) {
    if (!(this.currentBookmark && this.currentPage)) {
      return null;
    } else if (this.updatePreviousBookmark) {
      this.updatePreviousBookmark = false;
    }
    if (this.uid > 0 && !(this.previousBookmark && this.previousPage)) {
      // Prevent the history from getting stuck in the current state,
      // effectively preventing the user from going back/forward in
      // the history.
      //
      // This happens if the current position in the document didn't change
      // when the history was previously updated. The reasons for this are
      // either:
      // 1. The current zoom value is such that the document does not need to,
      //    or cannot, be scrolled to display the destination.
      // 2. The previous destination is broken, and doesn't actally point to a
      //    position within the document.
      //    (This is either due to a bad PDF generator, or the user making a
      //     mistake when entering a destination in the hash parameters.)
      return null;
    }
    if ((!this.current.dest && !onlyCheckPage) || beforeUnload) {
      if (this.previousBookmark === this.currentBookmark) {
        return null;
      }
    } else if (this.current.page || onlyCheckPage) {
      if (this.previousPage === this.currentPage) {
        return null;
      }
    } else {
      return null;
    }
    var params = {hash: this.currentBookmark, page: this.currentPage};
    if (this.isViewerInPresentationMode) {
      params.hash = null;
    }
    return params;
  },

  _stateObj: function pdfHistory_stateObj(params) {
    return {fingerprint: this.fingerprint, uid: this.uid, target: params};
  },

  _pushToHistory: function pdfHistory_pushToHistory(params,
                                                    addPrevious, overwrite) {
    if (!this.initialized) {
      return;
    }
    if (!params.hash && params.page) {
      params.hash = ('page=' + params.page);
    }
    if (addPrevious && !overwrite) {
      var previousParams = this._getPreviousParams();
      if (previousParams) {
        var replacePrevious = (!this.current.dest &&
        this.current.hash !== this.previousHash);
        this._pushToHistory(previousParams, false, replacePrevious);
      }
    }
    this._pushOrReplaceState(this._stateObj(params),
      (overwrite || this.uid === 0));
    this.currentUid = this.uid++;
    this.current = params;
    this.updatePreviousBookmark = true;
  },

  _goTo: function pdfHistory_goTo(state) {
    if (!(this.initialized && this.historyUnlocked &&
      this._isStateObjectDefined(state))) {
      return;
    }
    if (!this.reInitialized && state.uid < this.currentUid) {
      var previousParams = this._getPreviousParams(true);
      if (previousParams) {
        this._pushToHistory(this.current, false);
        this._pushToHistory(previousParams, false);
        this.currentUid = state.uid;
        window.history.back();
        return;
      }
    }
    this.historyUnlocked = false;

    if (state.target.dest) {
      this.linkService.navigateTo(state.target.dest);
    } else {
      this.linkService.setHash(state.target.hash);
    }
    this.currentUid = state.uid;
    if (state.uid > this.uid) {
      this.uid = state.uid;
    }
    this.current = state.target;
    this.updatePreviousBookmark = true;

    var currentHash = window.location.hash.substring(1);
    if (this.previousHash !== currentHash) {
      this.allowHashChange = false;
    }
    this.previousHash = currentHash;

    this.historyUnlocked = true;
  },

  back: function pdfHistoryBack() {
    this.go(-1);
  },

  forward: function pdfHistoryForward() {
    this.go(1);
  },

  go: function pdfHistoryGo(direction) {
    if (this.initialized && this.historyUnlocked) {
      var state = window.history.state;
      if (direction === -1 && state && state.uid > 0) {
        window.history.back();
      } else if (direction === 1 && state && state.uid < (this.uid - 1)) {
        window.history.forward();
      }
    }
  }
};

export {
  PDFHistory,
};
