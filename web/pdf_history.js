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

import {
  getGlobalEventBus, isValidRotation, parseQueryString, waitOnEventOrTimeout
} from './ui_utils';

// Heuristic value used when force-resetting `this._blockHashChange`.
const HASH_CHANGE_TIMEOUT = 1000; // milliseconds
// Heuristic value used when adding the current position to the browser history.
const POSITION_UPDATED_THRESHOLD = 50;
// Heuristic value used when adding a temporary position to the browser history.
const UPDATE_VIEWAREA_TIMEOUT = 1000; // milliseconds

/**
 * @typedef {Object} PDFHistoryOptions
 * @property {IPDFLinkService} linkService - The navigation/linking service.
 * @property {EventBus} eventBus - The application event bus.
 */

/**
 * @typedef {Object} InitializeParameters
 * @property {string} fingerprint - The PDF document's unique fingerprint.
 * @property {boolean} resetHistory - (optional) Reset the browsing history.
 * @property {boolean} updateUrl - (optional) Attempt to update the document
 *   URL, with the current hash, when pushing/replacing browser history entries.
 */

/**
 * @typedef {Object} PushParameters
 * @property {string} namedDest - (optional) The named destination. If absent,
 *   a stringified version of `explicitDest` is used.
 * @property {Array} explicitDest - The explicit destination array.
 * @property {number} pageNumber - The page to which the destination points.
 */

function getCurrentHash() {
  return document.location.hash;
}

function parseCurrentHash(linkService) {
  let hash = unescape(getCurrentHash()).substring(1);
  let params = parseQueryString(hash);

  let page = params.page | 0;
  if (!(Number.isInteger(page) && page > 0 && page <= linkService.pagesCount)) {
    page = null;
  }
  return { hash, page, rotation: linkService.rotation, };
}

class PDFHistory {
  /**
   * @param {PDFHistoryOptions} options
   */
  constructor({ linkService, eventBus, }) {
    this.linkService = linkService;
    this.eventBus = eventBus || getGlobalEventBus();

    this.initialized = false;
    this.initialBookmark = null;
    this.initialRotation = null;

    this._boundEvents = Object.create(null);
    this._isViewerInPresentationMode = false;
    this._isPagesLoaded = false;

    // Ensure that we don't miss either a 'presentationmodechanged' or a
    // 'pagesloaded' event, by registering the listeners immediately.
    this.eventBus.on('presentationmodechanged', (evt) => {
      this._isViewerInPresentationMode = evt.active || evt.switchInProgress;
    });
    this.eventBus.on('pagesloaded', (evt) => {
      this._isPagesLoaded = !!evt.pagesCount;
    });
  }

  /**
   * Initialize the history for the PDF document, using either the current
   * browser history entry or the document hash, whichever is present.
   * @param {InitializeParameters} params
   */
  initialize({ fingerprint, resetHistory = false, updateUrl = false, }) {
    if (!fingerprint || typeof fingerprint !== 'string') {
      console.error(
        'PDFHistory.initialize: The "fingerprint" must be a non-empty string.');
      return;
    }
    let reInitialized = this.initialized && this.fingerprint !== fingerprint;
    this.fingerprint = fingerprint;
    this._updateUrl = (updateUrl === true);

    if (!this.initialized) {
      this._bindEvents();
    }
    let state = window.history.state;

    this.initialized = true;
    this.initialBookmark = null;
    this.initialRotation = null;

    this._popStateInProgress = false;
    this._blockHashChange = 0;
    this._currentHash = getCurrentHash();
    this._numPositionUpdates = 0;

    this._uid = this._maxUid = 0;
    this._destination = null;
    this._position = null;

    if (!this._isValidState(state, /* checkReload = */ true) || resetHistory) {
      let { hash, page, rotation, } = parseCurrentHash(this.linkService);

      if (!hash || reInitialized || resetHistory) {
        // Ensure that the browser history is reset on PDF document load.
        this._pushOrReplaceState(null, /* forceReplace = */ true);
        return;
      }
      // Ensure that the browser history is initialized correctly when
      // the document hash is present on PDF document load.
      this._pushOrReplaceState({ hash, page, rotation, },
                               /* forceReplace = */ true);
      return;
    }

    // The browser history contains a valid entry, ensure that the history is
    // initialized correctly on PDF document load.
    let destination = state.destination;
    this._updateInternalState(destination, state.uid,
                              /* removeTemporary = */ true);
    if (this._uid > this._maxUid) {
      this._maxUid = this._uid;
    }

    if (destination.rotation !== undefined) {
      this.initialRotation = destination.rotation;
    }
    if (destination.dest) {
      this.initialBookmark = JSON.stringify(destination.dest);

      // If the history is updated, e.g. through the user changing the hash,
      // before the initial destination has become visible, then we do *not*
      // want to potentially add `this._position` to the browser history.
      this._destination.page = null;
    } else if (destination.hash) {
      this.initialBookmark = destination.hash;
    } else if (destination.page) {
      // Fallback case; shouldn't be necessary, but better safe than sorry.
      this.initialBookmark = `page=${destination.page}`;
    }
  }

  /**
   * Push an internal destination to the browser history.
   * @param {PushParameters}
   */
  push({ namedDest = null, explicitDest, pageNumber, }) {
    if (!this.initialized) {
      return;
    }
    if (namedDest && typeof namedDest !== 'string') {
      console.error('PDFHistory.push: ' +
                    `"${namedDest}" is not a valid namedDest parameter.`);
      return;
    } else if (!Array.isArray(explicitDest)) {
      console.error('PDFHistory.push: ' +
                    `"${explicitDest}" is not a valid explicitDest parameter.`);
      return;
    } else if (!(Number.isInteger(pageNumber) &&
                 pageNumber > 0 && pageNumber <= this.linkService.pagesCount)) {
      // Allow an unset `pageNumber` if and only if the history is still empty;
      // please refer to the `this._destination.page = null;` comment above.
      if (pageNumber !== null || this._destination) {
        console.error('PDFHistory.push: ' +
                      `"${pageNumber}" is not a valid pageNumber parameter.`);
        return;
      }
    }

    let hash = namedDest || JSON.stringify(explicitDest);
    if (!hash) {
      // The hash *should* never be undefined, but if that were to occur,
      // avoid any possible issues by not updating the browser history.
      return;
    }

    let forceReplace = false;
    if (this._destination &&
        (isDestHashesEqual(this._destination.hash, hash) ||
         isDestArraysEqual(this._destination.dest, explicitDest))) {
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
      rotation: this.linkService.rotation,
    }, forceReplace);

    if (!this._popStateInProgress) {
      // Prevent the browser history from updating while the new destination is
      // being scrolled into view, to avoid potentially inconsistent state.
      this._popStateInProgress = true;
      // We defer the resetting of `this._popStateInProgress`, to account for
      // e.g. zooming occuring when the new destination is being navigated to.
      Promise.resolve().then(() => {
        this._popStateInProgress = false;
      });
    }
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
    if (this._isValidState(state) && state.uid < this._maxUid) {
      window.history.forward();
    }
  }

  /**
   * @returns {boolean} Indicating if the user is currently moving through the
   *   browser history, useful e.g. for skipping the next 'hashchange' event.
   */
  get popStateInProgress() {
    return this.initialized &&
           (this._popStateInProgress || this._blockHashChange > 0);
  }

  /**
   * @private
   */
  _pushOrReplaceState(destination, forceReplace = false) {
    let shouldReplace = forceReplace || !this._destination;
    let newState = {
      fingerprint: this.fingerprint,
      uid: shouldReplace ? this._uid : (this._uid + 1),
      destination,
    };

    if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('CHROME') &&
        window.history.state && window.history.state.chromecomState) {
      // history.state.chromecomState is managed by chromecom.js.
      newState.chromecomState = window.history.state.chromecomState;
    }
    this._updateInternalState(destination, newState.uid);

    let newUrl;
    if (this._updateUrl && destination && destination.hash) {
      const baseUrl = document.location.href.split('#')[0];
      if (!baseUrl.startsWith('file://')) { // Prevent errors in Firefox.
        newUrl = `${baseUrl}#${destination.hash}`;
      }
    }
    if (shouldReplace) {
      if (newUrl) {
        window.history.replaceState(newState, '', newUrl);
      } else {
        window.history.replaceState(newState, '');
      }
    } else {
      this._maxUid = this._uid;
      if (newUrl) {
        window.history.pushState(newState, '', newUrl);
      } else {
        window.history.pushState(newState, '');
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
      position = Object.assign(Object.create(null), this._position);
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
    if (this._destination.hash === position.hash) {
      return; // The current document position has not changed.
    }
    if (!this._destination.page &&
        (POSITION_UPDATED_THRESHOLD <= 0 ||
         this._numPositionUpdates <= POSITION_UPDATED_THRESHOLD)) {
      // `this._destination` was set through the user changing the hash of
      // the document. Do not add `this._position` to the browser history,
      // to avoid "flooding" it with lots of (nearly) identical entries,
      // since we cannot ensure that the document position has changed.
      return;
    }

    let forceReplace = false;
    if (this._destination.page >= position.first &&
        this._destination.page <= position.page) {
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
  _isValidState(state, checkReload = false) {
    if (!state) {
      return false;
    }
    if (state.fingerprint !== this.fingerprint) {
      if (checkReload) {
        // Potentially accept the history entry, even if the fingerprints don't
        // match, when the viewer was reloaded (see issue 6847).
        if (typeof state.fingerprint !== 'string' ||
            state.fingerprint.length !== this.fingerprint.length) {
          return false;
        }
        const [perfEntry] = performance.getEntriesByType('navigation');
        if (!perfEntry || perfEntry.type !== 'reload') {
          return false;
        }
      } else {
        // This should only occur in viewers with support for opening more than
        // one PDF document, e.g. the GENERIC viewer.
        return false;
      }
    }
    if (!Number.isInteger(state.uid) || state.uid < 0) {
      return false;
    }
    if (state.destination === null || typeof state.destination !== 'object') {
      return false;
    }
    return true;
  }

  /**
   * @private
   */
  _updateInternalState(destination, uid, removeTemporary = false) {
    if (this._updateViewareaTimeout) {
      // When updating `this._destination`, make sure that we always wait for
      // the next 'updateviewarea' event before (potentially) attempting to
      // push the current position to the browser history.
      clearTimeout(this._updateViewareaTimeout);
      this._updateViewareaTimeout = null;
    }
    if (removeTemporary && destination && destination.temporary) {
      // When the `destination` comes from the browser history,
      // we no longer treat it as a *temporary* position.
      delete destination.temporary;
    }
    this._destination = destination;
    this._uid = uid;
    // This should always be reset when `this._destination` is updated.
    this._numPositionUpdates = 0;
  }

  /**
   * @private
   */
  _updateViewarea({ location, }) {
    if (this._updateViewareaTimeout) {
      clearTimeout(this._updateViewareaTimeout);
      this._updateViewareaTimeout = null;
    }

    this._position = {
      hash: this._isViewerInPresentationMode ?
        `page=${location.pageNumber}` : location.pdfOpenParams.substring(1),
      page: this.linkService.page,
      first: location.pageNumber,
      rotation: location.rotation,
    };

    if (this._popStateInProgress) {
      return;
    }

    if (POSITION_UPDATED_THRESHOLD > 0 && this._isPagesLoaded &&
        this._destination && !this._destination.page) {
      // If the current destination was set through the user changing the hash
      // of the document, we will usually not try to push the current position
      // to the browser history; see `this._tryPushCurrentPosition()`.
      //
      // To prevent `this._tryPushCurrentPosition()` from effectively being
      // reduced to a no-op in this case, we will assume that the position
      // *did* in fact change if the 'updateviewarea' event was dispatched
      // more than `POSITION_UPDATED_THRESHOLD` times.
      this._numPositionUpdates++;
    }

    if (UPDATE_VIEWAREA_TIMEOUT > 0) {
      // When closing the browser, a 'pagehide' event will be dispatched which
      // *should* allow us to push the current position to the browser history.
      // In practice, it seems that the event is arriving too late in order for
      // the session history to be successfully updated.
      // (For additional details, please refer to the discussion in
      //  https://bugzilla.mozilla.org/show_bug.cgi?id=1153393.)
      //
      // To workaround this we attempt to *temporarily* add the current position
      // to the browser history only when the viewer is *idle*,
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
  }

  /**
   * @private
   */
  _popState({ state, }) {
    let newHash = getCurrentHash(), hashChanged = this._currentHash !== newHash;
    this._currentHash = newHash;

    if (!state ||
        (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('CHROME') &&
         state.chromecomState && !this._isValidState(state))) {
      // This case corresponds to the user changing the hash of the document.
      this._uid++;

      let { hash, page, rotation, } = parseCurrentHash(this.linkService);
      this._pushOrReplaceState({ hash, page, rotation, },
                               /* forceReplace = */ true);
      return;
    }
    if (!this._isValidState(state)) {
      // This should only occur in viewers with support for opening more than
      // one PDF document, e.g. the GENERIC viewer.
      return;
    }

    // Prevent the browser history from updating until the new destination,
    // as stored in the browser history, has been scrolled into view.
    this._popStateInProgress = true;

    if (hashChanged) {
      // When the hash changed, implying that the 'popstate' event will be
      // followed by a 'hashchange' event, then we do *not* want to update the
      // browser history when handling the 'hashchange' event (in web/app.js)
      // since that would *overwrite* the new destination navigated to below.
      //
      // To avoid accidentally disabling all future user-initiated hash changes,
      // if there's e.g. another 'hashchange' listener that stops the event
      // propagation, we make sure to always force-reset `this._blockHashChange`
      // after `HASH_CHANGE_TIMEOUT` milliseconds have passed.
      this._blockHashChange++;
      waitOnEventOrTimeout({
        target: window,
        name: 'hashchange',
        delay: HASH_CHANGE_TIMEOUT,
      }).then(() => {
        this._blockHashChange--;
      });
    }

    // Navigate to the new destination.
    let destination = state.destination;
    this._updateInternalState(destination, state.uid,
                              /* removeTemporary = */ true);
    if (this._uid > this._maxUid) {
      this._maxUid = this._uid;
    }

    if (isValidRotation(destination.rotation)) {
      this.linkService.rotation = destination.rotation;
    }
    if (destination.dest) {
      this.linkService.navigateTo(destination.dest);
    } else if (destination.hash) {
      this.linkService.setHash(destination.hash);
    } else if (destination.page) {
      // Fallback case; shouldn't be necessary, but better safe than sorry.
      this.linkService.page = destination.page;
    }

    // Since `PDFLinkService.navigateTo` is asynchronous, we thus defer the
    // resetting of `this._popStateInProgress` slightly.
    Promise.resolve().then(() => {
      this._popStateInProgress = false;
    });
  }

  /**
   * @private
   */
  _bindEvents() {
    let { _boundEvents, eventBus, } = this;

    _boundEvents.updateViewarea = this._updateViewarea.bind(this);
    _boundEvents.popState = this._popState.bind(this);
    _boundEvents.pageHide = (evt) => {
      // Attempt to push the `this._position` into the browser history when
      // navigating away from the document. This is *only* done if the history
      // is empty/temporary, since otherwise an existing browser history entry
      // will end up being overwritten (given that new entries cannot be pushed
      // into the browser history when the 'unload' event has already fired).
      if (!this._destination || this._destination.temporary) {
        this._tryPushCurrentPosition();
      }
    };

    eventBus.on('updateviewarea', _boundEvents.updateViewarea);
    window.addEventListener('popstate', _boundEvents.popState);
    window.addEventListener('pagehide', _boundEvents.pageHide);
  }
}

function isDestHashesEqual(destHash, pushHash) {
  if (typeof destHash !== 'string' || typeof pushHash !== 'string') {
    return false;
  }
  if (destHash === pushHash) {
    return true;
  }
  let { nameddest, } = parseQueryString(destHash);
  if (nameddest === pushHash) {
    return true;
  }
  return false;
}

function isDestArraysEqual(firstDest, secondDest) {
  function isEntryEqual(first, second) {
    if (typeof first !== typeof second) {
      return false;
    }
    if (Array.isArray(first) || Array.isArray(second)) {
      return false;
    }
    if (first !== null && typeof first === 'object' && second !== null) {
      if (Object.keys(first).length !== Object.keys(second).length) {
        return false;
      }
      for (let key in first) {
        if (!isEntryEqual(first[key], second[key])) {
          return false;
        }
      }
      return true;
    }
    return first === second || (Number.isNaN(first) && Number.isNaN(second));
  }

  if (!(Array.isArray(firstDest) && Array.isArray(secondDest))) {
    return false;
  }
  if (firstDest.length !== secondDest.length) {
    return false;
  }
  for (let i = 0, ii = firstDest.length; i < ii; i++) {
    if (!isEntryEqual(firstDest[i], secondDest[i])) {
      return false;
    }
  }
  return true;
}

export {
  PDFHistory,
  isDestHashesEqual,
  isDestArraysEqual,
};
