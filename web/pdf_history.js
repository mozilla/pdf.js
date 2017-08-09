/* Copyright 2017 Mozilla Foundation
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

import { cloneObj, parseQueryString } from './ui_utils';
import { getGlobalEventBus } from './dom_events';

// Heuristic value used when adding a temporary position to the browser history.
const UPDATE_VIEWAREA_TIMEOUT = 2000; // milliseconds

/**
 * @typedef {Object} PDFHistoryOptions
 * @property {IPDFLinkService} linkService - The navigation/linking service.
 * @property {EventBus} eventBus - The application event bus.
 */

/**
* @typedef {Object} PushParameters
* @property {string} namedDest - (optional) The named destination. If absent,
*   a stringified version of `explicitDest` is used.
* @property {Array} explicitDest - The explicit destination array.
* @property {number} pageNumber - The page to which the destination points.
*/

function getCurrentHash(linkService) {
  let hash = unescape(document.location.hash).substring(1);
  let params = parseQueryString(hash);

  let page = params.page | 0;
  if (!(Number.isInteger(page) && page > 0 && page <= linkService.pagesCount)) {
    page = null;
  }
  return { hash, page, };
}

class PDFHistory {
  /**
   * @param {PDFHistoryOptions} options
   */
  constructor({ linkService, eventBus, }) {
    this.linkService = linkService;
    this.eventBus = eventBus || getGlobalEventBus();

    this.initialized = false;
    this._isViewerInPresentationMode = false;
    this._boundEvents = {};
  }

  /**
   * @param {string} fingerprint - The PDF documents unique fingerprint.
   * @param {boolean} resetHistory - (optional) Reset the browsing history.
   */
  initialize(fingerprint, resetHistory = false) {
    if (!fingerprint || typeof fingerprint !== 'string') {
      console.error(
        'PDFHistory.initialize: The "fingerprint" must be a non-empty string.');
      return;
    }
    let reInitialized = this.initialized && this.fingerprint !== fingerprint;
    this.fingerprint = fingerprint;

    if (!this.initialized) {
      this._bindEvents();
    }
    let state = window.history.state;

    this.initialized = true;
    this.initialBookmark = null;
    this._popStateInProgress = false;

    this._currentUid = this._uid = 0;
    this._destination = null;
    this._position = null;

    if (!this._isValidState(state) || resetHistory) {
      let { hash, page, } = getCurrentHash(this.linkService);

      if (!hash || reInitialized || resetHistory) {
        // Ensure that the browser history is reset on PDF document load.
        this._pushOrReplaceState(null, /* forceReplace = */ true);
        return;
      }
      // Ensure that the browser history is initialized correctly when
      // the document hash is present on load.
      this._popStateInProgress = true;
      this._pushOrReplaceState({ hash, page, }, /* forceReplace = */ true);
      return;
    }

    // Prevent the browser history from updating until the initial
    // destination/position, as stored in the browser history, is visible.
    this._popStateInProgress = true;

    let destination = state.destination;
    this._resetSomeInternalState(destination, state.uid);

    if (destination.dest) {
      this.initialBookmark = JSON.stringify(destination.dest);
    } else if (destination.hash) {
      this.initialBookmark = destination.hash;
    } else if (destination.page) {
      this.initialBookmark = `page=${destination.page}`;
    }
  }

  /**
   * Push an internal destination to the browser history.
   * @param {PushParameters} params
   */
  push({ namedDest, explicitDest, pageNumber, }) {
    if (!this.initialized) {
      return;
    }
    if ((namedDest && typeof namedDest !== 'string') ||
        !(explicitDest instanceof Array) ||
        !(Number.isInteger(pageNumber) &&
          pageNumber > 0 && pageNumber <= this.linkService.pagesCount)) {
      console.error('PDFHistory.push: Invalid parameters.');
      return;
    }

    let hash = namedDest || JSON.stringify(explicitDest);
    if (!hash) {
      // The hash *should* never be undefined, but if that were to occur,
      // avoid any possible issues by not updating the browser history.
      return;
    }

    let forceReplace = false;
    if (this._destination && (hash === this._destination.hash ||
                              explicitDest === this._destination.dest)) {
      // When the new destination is identical to `this._destination`, and
      // its `page` is undefined, replace the current browser history entry.
      // NOTE: This can only occur if `this._destination` was set either:
      //  - through the document hash being specified on load.
      //  - through the user changing the hash of the document.
      if (this._destination.page) {
        return;
      }
      forceReplace = true;
    }
    if (this._popStateInProgress && !forceReplace) {
      return;
    }

    this._pushOrReplaceState({
      dest: explicitDest,
      hash,
      page: pageNumber,
    }, forceReplace);
  }

  /**
   * Push the current position to the browser history.
   */
  pushCurrentPosition() {
    if (!this.initialized || this._popStateInProgress) {
      return;
    }
    this._tryPushCurrentPosition();
  }

  /**
   * Go back one step in the browser history.
   * NOTE: Avoids navigating away from the document, useful for "named actions".
   */
  back() {
    if (!this.initialized || this._popStateInProgress) {
      return;
    }
    let state = window.history.state;
    if (this._isValidState(state) && state.uid > 0) {
      window.history.back();
    }
  }

  /**
   * Go forward one step in the browser history.
   * NOTE: Avoids navigating away from the document, useful for "named actions".
   */
  forward() {
    if (!this.initialized || this._popStateInProgress) {
      return;
    }
    let state = window.history.state;
    if (this._isValidState(state) && state.uid < (this._uid - 1)) {
      window.history.forward();
    }
  }

  /**
   * @returns {boolean} Indicating if the user is currently moving through the
   *   browser history, useful e.g. for skipping the next 'hashchange' event.
   */
  get popStateInProgress() {
    return this.initialized && this._popStateInProgress;
  }

  /**
   * @private
   */
  _pushOrReplaceState(destination, forceReplace = false) {
    let shouldReplace = forceReplace || !this._destination;
    let newState = {
      fingerprint: this.fingerprint,
      uid: shouldReplace ? this._currentUid : this._uid,
      destination,
    };

    if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('CHROME') &&
        window.history.state && window.history.state.chromecomState) {
      // history.state.chromecomState is managed by chromecom.js.
      newState.chromecomState = window.history.state.chromecomState;
    }
    this._destination = destination;
    this._currentUid = newState.uid;
    this._uid = this._currentUid + 1;

    if (shouldReplace) {
      if (typeof PDFJSDev !== 'undefined' &&
          PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
        // Providing the third argument causes a SecurityError for file:// URLs.
        window.history.replaceState(newState, '');
      } else {
        window.history.replaceState(newState, '', document.URL);
      }
    } else {
      if (typeof PDFJSDev !== 'undefined' &&
          PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
        // Providing the third argument causes a SecurityError for file:// URLs.
        window.history.pushState(newState, '');
      } else {
        window.history.pushState(newState, '', document.URL);
      }
    }

    if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('CHROME') &&
        top === window) {
      // eslint-disable-next-line no-undef
      chrome.runtime.sendMessage('showPageAction');
    }
  }

  /**
   * @private
   */
  _tryPushCurrentPosition(temporary = false) {
    if (!this._position) {
      return;
    }
    let position = this._position;
    if (temporary) {
      position = cloneObj(this._position);
      position.temporary = true;
    }

    if (!this._destination) {
      this._pushOrReplaceState(position);
      return;
    }
    if (this._destination.temporary) {
      // Always replace a previous *temporary* position.
      this._pushOrReplaceState(position, /* forceReplace = */ true);
      return;
    }
    if (!this._destination.page) {
      // `this._destination` was set through the user changing the hash of
      // the document. Do not add `this._position` to the browser history,
      // to avoid "flooding" it with lots of (nearly) identical entries,
      // since we cannot ensure that the document position has changed.
      return;
    }
    if (this._destination.hash === position.hash) {
      // The current document position has not changed.
      return;
    }

    let forceReplace = false;
    if (this._destination.page === position.first ||
        this._destination.page === position.page) {
      // When the `page` of `this._destination` is still visible, do not
      // update the browsing history when `this._destination` either:
      //  - contains an internal destination, since in this case we
      //    cannot ensure that the document position has actually changed.
      //  - was set through the user changing the hash of the document.
      if (this._destination.dest || !this._destination.first) {
        return;
      }
      // To avoid "flooding" the browser history, replace the current entry.
      forceReplace = true;
    }
    this._pushOrReplaceState(position, forceReplace);
  }

  /**
   * @private
   */
  _isValidState(state) {
    if (!state) {
      return false;
    }
    if (state.fingerprint !== this.fingerprint) {
      // This should only occur in viewers with support for opening more than
      // one PDF document, e.g. the GENERIC viewer.
      return false;
    }
    if (!Number.isInteger(state.uid) || state.uid < 0) {
      return false;
    }
    if (typeof state.destination !== 'object' || state.destination === null) {
      return false;
    }
    return true;
  }

  /**
   * @private
   */
  _resetSomeInternalState(destination, uid) {
    if (destination.temporary) {
      // Since the destination comes from the browser history,
      // don't treat it as a *temporary* position any more.
      delete destination.temporary;
    }
    this._destination = destination;
    this._currentUid = uid;
    this._uid = this._currentUid + 1;
  }

  /**
   * Update the current document position, and reset `this._popStateInProgress`.
   * @private
   */
  _updateViewarea(evt) {
    if (this._updateViewareaTimeout) {
      clearTimeout(this._updateViewareaTimeout);
      this._updateViewareaTimeout = null;
    }
    let location = evt.location, previousPosition = this._position;

    this._position = {
      hash: this._isViewerInPresentationMode ?
        `page=${location.pageNumber}` : location.pdfOpenParams.substring(1),
      page: this.linkService.page,
      first: location.pageNumber,
    };

    if (!this._popStateInProgress) {
      if (UPDATE_VIEWAREA_TIMEOUT > 0) {
        // When closing the browser, a 'pagehide' event will be dispatched
        // which *should* allow us to push the current position to the browser
        // history. In practice, it seems that the event is arriving to late
        // in order for the session history to be successfully updated.
        // (For additional details, please refer to the discussion in
        //  https://bugzilla.mozilla.org/show_bug.cgi?id=1153393.)
        //
        // To workaround this we attempt to *temporarily* add the current
        // position to update the browser history when the viewer is *idle*,
        // i.e. when scrolling and/or zooming does not occur.
        //
        // PLEASE NOTE: It's absolutely imperative that the browser history is
        // *not* updated too often, since that would render the viewer more or
        // less unusable. Hence the use of a timeout to delay the update until
        // the viewer has been idle for `UPDATE_VIEWAREA_TIMEOUT` milliseconds.

        this._updateViewareaTimeout = setTimeout(() => {
          if (!this._popStateInProgress) {
            this._tryPushCurrentPosition(/* temporary = */ true);
          }
          this._updateViewareaTimeout = null;
        }, UPDATE_VIEWAREA_TIMEOUT);
      }
      return; // `this._popStateInProgress` was already reset.
    }
    if (!this._destination) {
      // The browser history is currently empty.
      this._popStateInProgress = false;
      return;
    }

    let destinationPage = this._destination.page;
    // Wait until the new destination/position is visible, before resetting
    // `this._popStateInProgress`, to avoid corrupting the browser history.
    // NOTE: If the zoom level of the document changes, the 'updateViewarea'
    //       event may fire *multiple* times before the reset occurs.

    if (destinationPage === this._position.first ||
        destinationPage === this._position.page) {
      // The new destination/position has been scrolled into view.
      this._popStateInProgress = false;
      return;
    }
    if (!previousPosition) {
      return;
    }
    if (destinationPage === previousPosition.first ||
        destinationPage === previousPosition.page) {
      // The new destination/position was already visible.
      this._popStateInProgress = false;
      return;
    }
    if (!destinationPage) {
      // `this._destination` was set through the user changing the hash of
      // the document, avoid accidentally disabling the history permanently.
      this._popStateInProgress = false;
    }
  }

  /**
   * @private
   */
  _popState(evt) {
    let state = evt.state;

    if (!state ||
        (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('CHROME') &&
         state.chromecomState && !this._isValidState(state))) {
      // This case corresponds to the user changing the hash of the document.
      this._currentUid = this._uid;

      let { hash, page, } = getCurrentHash(this.linkService);
      this._pushOrReplaceState({ hash, page, }, /* forceReplace */ true);
      return;
    }
    if (!this._isValidState(state)) {
      // This should only occur in viewers with support for opening more than
      // one PDF document, e.g. the GENERIC viewer.
      return;
    }

    // Prevent the browser history from updating until the new destination,
    // as stored in the browser history, have become visible.
    this._popStateInProgress = true;

    // This case corresponds to navigation backwards in the browser history.
    if (state.uid < this._currentUid && this._position && this._destination) {
      let shouldGoBack = false;

      if (this._destination.temporary) {
        // Always replace a previous *temporary* position, before moving back.
        this._pushOrReplaceState(this._position);
        shouldGoBack = true;
      } else if (this._destination.page &&
                 this._destination.page !== this._position.first &&
                 this._destination.page !== this._position.page) {
        // If the `page` of the `this._destination` is no longer visible,
        // push the `this._position` to the browser history before moving back.
        this._pushOrReplaceState(this._destination);
        this._pushOrReplaceState(this._position);
        shouldGoBack = true;
      }
      if (shouldGoBack) {
        // After `window.history.back()`, we must not enter this block on the
        // resulting `popstate` event, since that may cause an infinite loop.
        this._currentUid = state.uid;

        window.history.back();
        return;
      }
    }

    // Navigate to the new destination.
    let destination = state.destination;
    this._resetSomeInternalState(destination, state.uid);

    if (destination.dest) {
      this.linkService.navigateTo(destination.dest);
    } else if (destination.hash) {
      this.linkService.setHash(destination.hash);
    } else if (destination.page) {
      this.linkService.page = destination.page;
    }
  }

  _bindEvents() {
    let { _boundEvents, eventBus, } = this;

    _boundEvents.updateViewarea = this._updateViewarea.bind(this);
    _boundEvents.presentationModeChanged = (evt) => {
      this._isViewerInPresentationMode = evt.active || evt.switchInProgress;
    };

    eventBus.on('updateviewarea', _boundEvents.updateViewarea);
    eventBus.on('presentationmodechanged',
                _boundEvents.presentationModeChanged);

    _boundEvents.popState = this._popState.bind(this);
    _boundEvents.pageHide = (evt) => {
      // Attempt to push the `this._position` into the browser history when
      // navigating away from the document.
      this._tryPushCurrentPosition();
    };

    window.addEventListener('popstate', _boundEvents.popState);
    window.addEventListener('pagehide', _boundEvents.pageHide);
  }
}

export {
  PDFHistory,
};
