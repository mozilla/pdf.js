/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2015 Mozilla Foundation
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
/* globals parseQueryString, chrome */

'use strict';

/**
 * @typedef {Object} PDFHistoryOptions
 * @property {IPDFLinkService} linkService - The navigation/linking service.
 */

/**
 * @class
 * @implements {IPDFHistory}
 */
var PDFHistory = (function PDFHistoryClosure() {
  /**
   * @contructs PDFHistory
   * @param {PDFHistoryOptions} options
   */
  function PDFHistory(options) {
    this.linkService = options.linkService;
    this.initialized = false;

    this.initialDestination = null;
    this.initialBookmark = null;
  }

  PDFHistory.prototype = /** @lends PDFHistory.prototype */ {
    /**
     * @param {string} fingerprint - The PDF document's unique fingerprint.
     * @param {boolean} resetHistory - (optional) Reset the browsing history.
     */
    initialize: function PDFHistory_initialize(fingerprint, resetHistory) {
      if (!fingerprint || (typeof fingerprint !== 'string')) {
        console.error('PDFHistory_initialize: Not enough parameters.');
        return;
      }
      var reInitialized = this.initialized && this.fingerprint !== fingerprint;
      this.fingerprint = fingerprint;
      this.initialized = true;

      this.popStateInProgress = false;
      this.isViewerInPresentationMode = false;

      this.currentId = this.id = 0;
      this.currentDestination = null;
      this.currentPosition = null;

      this._addWindowListeners();
      var stateObj = window.history.state, destObj;

      if (!this._isValidStateObj(stateObj) || resetHistory) {
        var hash = unescape(document.location.hash).substring(1);

        if (!hash || reInitialized || resetHistory) {
          // Ensure that the browser history is reset on load.
          this._pushOrReplaceState(null, true);
          return;
        }
        // Ensure that the browser history is initialized correctly
        // when the document hash is specified on load.
        this.popStateInProgress = true;

        var hashParams = parseQueryString(hash);
        destObj = {
          hash: hash,
          page: hashParams.page && (hashParams.page | 0),
        };
        this._pushOrReplaceState(destObj, true);
        return;
      }
      // Prevent the browser history from updating until the initial
      // destination/position, as stored in the browser history, is visible.
      this.popStateInProgress = true;

      destObj = this.currentDestination = stateObj.destination;
      this.currentId = stateObj.id;
      this.id = this.currentId + 1;

      if (destObj.dest) {
        this.initialDestination = destObj.dest;
      } else if (destObj.hash) {
        this.initialBookmark = destObj.hash;
      } else if (destObj.page) {
        this.initialBookmark = 'page=' + destObj.page;
      }
    },

    /**
     * Push an internal destination to the browser history.
     * @param {Array} destArray - The explicit destination array.
     * @param {string} destString - The named destination, or for explicit
     *   destinations a stringified version of `destArray`.
     * @param {number} destPage - The page to which the destination points.
     */
    push: function PDFHistory_push(destArray, destString, destPage) {
      if (!this.initialized) {
        return;
      }
      if (!(destArray instanceof Array) ||
          (destString && typeof destString !== 'string')) {
        console.error('PDFHistory_push: Not enough parameters.');
        return;
      }
      var hash = destString ||
        unescape(this.linkService.getDestinationHash(destArray)).split('#')[1];
      if (!hash) {
        // The hash *should* never be undefined, but if that were to occur,
        // attempt to avoid issues by not updating the browser history.
        return;
      }
      var shouldReplace = false;
      if (this.currentDestination && hash === this.currentDestination.hash) {
        // When the new destination is identical to `currentDestination`, and
        // its `page` is undefined, replace the current browser history entry.
        // NOTE: This can only occur if `currentDestination` was set either:
        //        - from the document hash being specified on load.
        //        - from the user changing the hash of the document.
        if (this.currentDestination.page) {
          return;
        }
        shouldReplace = true;
      }
      if (this.popStateInProgress && !shouldReplace) {
        return;
      }
      var destObj = {
        dest: destArray,
        hash: hash,
        page: destPage | 0,
      };
      this._pushOrReplaceState(destObj, shouldReplace);
    },

    /**
     * Push the current position to the browser history.
     */
    pushCurrentPosition: function PDFHistory_pushCurrentPosition() {
      if (!this.initialized || this.popStateInProgress) {
        return;
      }
      this._tryPushCurrentPosition();
    },

    /**
     * Go back one step in the browser history.
     * NOTE: This method avoids accidentally navigating away from the document,
     *       useful for e.g. "named actions".
     */
    back: function PDFHistory_back() {
      if (!this.initialized || this.popStateInProgress) {
        return;
      }
      var stateObj = window.history.state;
      if (this._isValidStateObj(stateObj) && stateObj.id > 0) {
        window.history.back();
      }
    },

    /**
     * Go forward one step in the browser history.
     * NOTE: This method avoids accidentally navigating away from the document,
     *       useful for e.g. "named actions".
     */
    forward: function PDFHistory_forward() {
      if (!this.initialized || this.popStateInProgress) {
        return;
      }
      var stateObj = window.history.state;
      if (this._isValidStateObj(stateObj) && stateObj.id < (this.id - 1)) {
        window.history.forward();
      }
    },

    /**
     * @param {Object} destObj - The new destination/position.
     * @param {boolean} forceReplace - (optional) Replace the current browser
     *   history entry. 
     * @private
     */
    _pushOrReplaceState: function PDFHistory_pushOrReplaceState(destObj,
                                                                forceReplace) {
      var shouldReplace = (forceReplace || !this.currentDestination);
      var stateObj = {
        fingerprint: this.fingerprint,
        id: shouldReplace ? this.currentId : this.id,
        destination: destObj,
      };
//#if CHROME
      // history.state.chromecomState is managed by chromecom.js.
      if (window.history.state && window.history.state.chromecomState) {
        stateObj.chromecomState = window.history.state.chromecomState;
      }
//#endif
      this.currentDestination = destObj;
      this.currentId = stateObj.id;
      this.id = this.currentId + 1;

      if (shouldReplace) {
//#if (FIREFOX || MOZCENTRAL)
//      // Providing the third argument causes a SecurityError for file:// URLs.
//      window.history.replaceState(stateObj, '');
//#else
        window.history.replaceState(stateObj, '', document.URL);
//#endif
      } else {
//#if (FIREFOX || MOZCENTRAL)
//      // Providing the third argument causes a SecurityError for file:// URLs.
//      window.history.pushState(stateObj, '');
//#else
        window.history.pushState(stateObj, '', document.URL);
//#endif
      }

//#if !PRODUCTION
      if (true) {
        return;
      }
//#endif
//#if CHROME
      if (top === window) {
        chrome.runtime.sendMessage('showPageAction');
      }
//#endif
    },

    /**
     * @private
     */
    _tryPushCurrentPosition: function PDFHistory_tryPushCurrentPosition() {
      if (!this.currentPosition) {
        return;
      }
      if (!this.currentDestination) {
        this._pushOrReplaceState(this.currentPosition, false);
        return;
      }
      if (!this.currentDestination.page) {
        // `currentDestination` was set through the user changing the hash of
        // the document. Do not add `currentPosition` to the browser history,
        // to avoid "flooding" it with lots of (nearly) identical entries,
        // since we cannot ensure that the document position has changed.
        return;
      }
      if (this.currentDestination.hash === this.currentPosition.hash) {
        // The current document position has not changed.
        return;
      }
      var shouldReplace = false;
      if (this.currentDestination.page === this.currentPosition.first ||
          this.currentDestination.page === this.currentPosition.page) {
        // When the `page` of `currentDestination` is still visible, do not
        // update the browsing history when `currentDestination` either:
        //  - contains an internal destination, since in this case we
        //    cannot ensure that the document position has changed.
        //  - was set through the user changing the hash of the document.
        if (this.currentDestination.dest || !this.currentDestination.first) {
          return;
        }
        // To avoid "flooding" the browser history, replace the current entry.
        shouldReplace = true;
      }
      this._pushOrReplaceState(this.currentPosition, shouldReplace);
    },

    /**
     * @param {Object} stateObj - The current `window.history.state` entry.
     * @returns {boolean}
     * @private
     */
    _isValidStateObj: function PDFHistory_isValidStateObj(stateObj) {
      if (!stateObj) {
        return false;
      }
      if (stateObj.fingerprint !== this.fingerprint) {
        // This could only occur in viewers with support for opening
        // more than one document, e.g. the GENERIC viewer.
        return false;
      }
      if ((typeof stateObj.id !== 'number') || stateObj.id < 0) {
        return false;
      }
      if (!stateObj.destination || (typeof stateObj.destination !== 'object')) {
        return false;
      }
      return true;
    },

    /**
     * Update the current document position, and reset `popStateInProgress`.
     * @private
     */
    _updateViewarea: function PDFHistory_updateViewarea(evt) {
      var location = evt.location;
      var previousPosition = this.currentPosition;

      this.currentPosition = {
        hash: this.isViewerInPresentationMode ?
          'page=' + location.pageNumber : location.pdfOpenParams.substring(1),
        page: this.linkService.page,
        first: location.pageNumber,
      };

      if (!this.popStateInProgress) {
        return;
      }
      if (!this.currentDestination) {
        this.popStateInProgress = false;
        return;
      }
      var currentPage = this.currentDestination.page;
      // Wait until the new destination/position is visible, before resetting
      // `popStateInProgress`, to avoid corrupting the browser history.
      // NOTE: If the zoom level of the document changes, the `updateViewarea`
      //       event may fire *multiple* times before the reset occurs.

      if (currentPage === this.currentPosition.first ||
          currentPage === this.currentPosition.page) {
        // The new destination/position has been scrolled into view.
        this.popStateInProgress = false;
        return;
      }
      if (!previousPosition) {
        return;
      }
      if (currentPage === previousPosition.first ||
          currentPage === previousPosition.page) {
        // The new destination/position was already visible.
        this.popStateInProgress = false;
        return;
      }
      if (!currentPage) {
        // `currentDestination` was set through the user changing the hash of
        // the document, avoid accidentally disabling the history.
        this.popStateInProgress = false;
      }
    },

    /**
     * @private
     */
    _presentationModeChanged: function PDFHistory_presentationModeChanged(evt) {
      this.isViewerInPresentationMode = !!evt.detail.active;
    },

    /**
     * @private
     */
    _popState: function PDFHistory_popState(evt) {
      var stateObj = evt.state, destObj;
//#if CHROME
//    if (!stateObj ||
//        (stateObj.chromecomState && !this._isValidStateObj(stateObj))) {
//#else
      if (!stateObj) {
//#endif
        // This case corresponds to the user changing the hash of the document.
        this.currentId = this.id;

        var hash = unescape(document.location.hash).substring(1);
        var hashParams = parseQueryString(hash);
        destObj = {
          hash: hash,
          page: hashParams.page && (hashParams.page | 0),
        };
        this._pushOrReplaceState(destObj, true);
        return;
      }
      if (!this._isValidStateObj(stateObj)) {
        return;
      }
      // Prevent the browser history from updating until the new
      // destination/position, as stored in the browser history, is visible.
      this.popStateInProgress = true;

      if (stateObj.id < this.currentId && this.currentPosition &&
          (this.currentDestination && this.currentDestination.page)) {
        // This case corresponds to moving backwards in the history.

        if (this.currentDestination.page !== this.currentPosition.first &&
            this.currentDestination.page !== this.currentPosition.page) {
          // If the `page` of the `currentDestination` is no longer visible,
          // push `currentPosition` to the browser history before moving back.
          this._pushOrReplaceState(this.currentDestination, false);
          this._pushOrReplaceState(this.currentPosition, false);

          // After `window.history.back()`, we must not enter this block on the
          // resulting `popstate` event, since that may cause an infinite loop.
          this.currentId = stateObj.id;

          window.history.back();
          return;
        }
      }
      destObj = this.currentDestination = stateObj.destination;
      this.currentId = stateObj.id;
      this.id = this.currentId + 1;

      if (destObj.dest) {
        this.linkService.navigateTo(destObj.dest);
      } else if (destObj.hash) {
        this.linkService.setHash(destObj.hash);
      } else if (destObj.page) {
        this.linkService.page = destObj.page;
      }
    },

    /**
     * @private
     */
    _pageShow: function PDFHistory_pageShow(evt) {
      // If the entire viewer was cached in the browser, ensure that the
      // 'beforeunload' event listener is re-added when navigating back to it.
      // (Since no 'DOMContentLoaded' event is fired in this case.)
      this._addBeforeUnloadListener();
    },

    /**
     * @private
     */
    _beforeUnload: function PDFHistory_beforeUnload(evt) {
      if (this.isViewerInPresentationMode) {
        // Prevent the user from accidentally navigating away from the document
        // while PresentationMode is active.
        evt.preventDefault();
        return;
      }
      // Attempt to push `currentPosition` to the browser history when
      // navigating away from the document.
      this._tryPushCurrentPosition();

      // Remove the 'beforeunload' event listener when navigating away from the
      // document, because otherwise caching will be disabled in the browser.
      window.removeEventListener('beforeunload', this.beforeUnloadBound);
      delete this.beforeUnloadBound;
    },

    /**
     * @private
     */
    _addWindowListeners: function PDFHistory_addWindowListeners() {
      this.updateViewareaBound = this._updateViewarea.bind(this);
      this.presentationModeChangedBound =
        this._presentationModeChanged.bind(this);
      this.popStateBound = this._popState.bind(this);
      this.pageShowBound = this._pageShow.bind(this);

      window.addEventListener('updateviewarea', this.updateViewareaBound);
      window.addEventListener('presentationmodechanged',
                              this.presentationModeChangedBound);
      window.addEventListener('popstate', this.popStateBound);
      window.addEventListener('pageshow', this.pageShowBound);

      // We cannot use the 'pagehide' event, since it fires to late in order to
      // correctly update the browser history when the document is unloaded.
      this._addBeforeUnloadListener();
    },

    /**
     * @private
     */
    _addBeforeUnloadListener: function PDFHistory_addBeforeUnloadListener() {
      if (this.beforeUnloadBound) {
        return;
      }
      this.beforeUnloadBound = this._beforeUnload.bind(this);
      window.addEventListener('beforeunload', this.beforeUnloadBound);
    },
  };

  return PDFHistory;
})();
