"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isDestHashesEqual = isDestHashesEqual;
exports.isDestArraysEqual = isDestArraysEqual;
exports.PDFHistory = void 0;

var _ui_utils = require("./ui_utils");

const HASH_CHANGE_TIMEOUT = 1000;
const POSITION_UPDATED_THRESHOLD = 50;
const UPDATE_VIEWAREA_TIMEOUT = 1000;

function getCurrentHash() {
  return document.location.hash;
}

function parseCurrentHash(linkService) {
  let hash = unescape(getCurrentHash()).substring(1);
  let params = (0, _ui_utils.parseQueryString)(hash);
  let page = params.page | 0;

  if (!(Number.isInteger(page) && page > 0 && page <= linkService.pagesCount)) {
    page = null;
  }

  return {
    hash,
    page,
    rotation: linkService.rotation
  };
}

class PDFHistory {
  constructor({
    linkService,
    eventBus
  }) {
    this.linkService = linkService;
    this.eventBus = eventBus || (0, _ui_utils.getGlobalEventBus)();
    this.initialized = false;
    this.initialBookmark = null;
    this.initialRotation = null;
    this._boundEvents = Object.create(null);
    this._isViewerInPresentationMode = false;
    this._isPagesLoaded = false;
    this.eventBus.on('presentationmodechanged', evt => {
      this._isViewerInPresentationMode = evt.active || evt.switchInProgress;
    });
    this.eventBus.on('pagesloaded', evt => {
      this._isPagesLoaded = !!evt.pagesCount;
    });
  }

  initialize({
    fingerprint,
    resetHistory = false,
    updateUrl = false
  }) {
    if (!fingerprint || typeof fingerprint !== 'string') {
      console.error('PDFHistory.initialize: The "fingerprint" must be a non-empty string.');
      return;
    }

    let reInitialized = this.initialized && this.fingerprint !== fingerprint;
    this.fingerprint = fingerprint;
    this._updateUrl = updateUrl === true;

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

    if (!this._isValidState(state, true) || resetHistory) {
      let {
        hash,
        page,
        rotation
      } = parseCurrentHash(this.linkService);

      if (!hash || reInitialized || resetHistory) {
        this._pushOrReplaceState(null, true);

        return;
      }

      this._pushOrReplaceState({
        hash,
        page,
        rotation
      }, true);

      return;
    }

    let destination = state.destination;

    this._updateInternalState(destination, state.uid, true);

    if (this._uid > this._maxUid) {
      this._maxUid = this._uid;
    }

    if (destination.rotation !== undefined) {
      this.initialRotation = destination.rotation;
    }

    if (destination.dest) {
      this.initialBookmark = JSON.stringify(destination.dest);
      this._destination.page = null;
    } else if (destination.hash) {
      this.initialBookmark = destination.hash;
    } else if (destination.page) {
      this.initialBookmark = `page=${destination.page}`;
    }
  }

  push({
    namedDest = null,
    explicitDest,
    pageNumber
  }) {
    if (!this.initialized) {
      return;
    }

    if (namedDest && typeof namedDest !== 'string') {
      console.error('PDFHistory.push: ' + `"${namedDest}" is not a valid namedDest parameter.`);
      return;
    } else if (!Array.isArray(explicitDest)) {
      console.error('PDFHistory.push: ' + `"${explicitDest}" is not a valid explicitDest parameter.`);
      return;
    } else if (!(Number.isInteger(pageNumber) && pageNumber > 0 && pageNumber <= this.linkService.pagesCount)) {
      if (pageNumber !== null || this._destination) {
        console.error('PDFHistory.push: ' + `"${pageNumber}" is not a valid pageNumber parameter.`);
        return;
      }
    }

    let hash = namedDest || JSON.stringify(explicitDest);

    if (!hash) {
      return;
    }

    let forceReplace = false;

    if (this._destination && (isDestHashesEqual(this._destination.hash, hash) || isDestArraysEqual(this._destination.dest, explicitDest))) {
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
      rotation: this.linkService.rotation
    }, forceReplace);

    if (!this._popStateInProgress) {
      this._popStateInProgress = true;
      Promise.resolve().then(() => {
        this._popStateInProgress = false;
      });
    }
  }

  pushCurrentPosition() {
    if (!this.initialized || this._popStateInProgress) {
      return;
    }

    this._tryPushCurrentPosition();
  }

  back() {
    if (!this.initialized || this._popStateInProgress) {
      return;
    }

    let state = window.history.state;

    if (this._isValidState(state) && state.uid > 0) {
      window.history.back();
    }
  }

  forward() {
    if (!this.initialized || this._popStateInProgress) {
      return;
    }

    let state = window.history.state;

    if (this._isValidState(state) && state.uid < this._maxUid) {
      window.history.forward();
    }
  }

  get popStateInProgress() {
    return this.initialized && (this._popStateInProgress || this._blockHashChange > 0);
  }

  _pushOrReplaceState(destination, forceReplace = false) {
    let shouldReplace = forceReplace || !this._destination;
    let newState = {
      fingerprint: this.fingerprint,
      uid: shouldReplace ? this._uid : this._uid + 1,
      destination
    };

    this._updateInternalState(destination, newState.uid);

    let newUrl;

    if (this._updateUrl && destination && destination.hash) {
      const baseUrl = document.location.href.split('#')[0];

      if (!baseUrl.startsWith('file://')) {
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
  }

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
      this._pushOrReplaceState(position, true);

      return;
    }

    if (this._destination.hash === position.hash) {
      return;
    }

    if (!this._destination.page && (POSITION_UPDATED_THRESHOLD <= 0 || this._numPositionUpdates <= POSITION_UPDATED_THRESHOLD)) {
      return;
    }

    let forceReplace = false;

    if (this._destination.page >= position.first && this._destination.page <= position.page) {
      if (this._destination.dest || !this._destination.first) {
        return;
      }

      forceReplace = true;
    }

    this._pushOrReplaceState(position, forceReplace);
  }

  _isValidState(state, checkReload = false) {
    if (!state) {
      return false;
    }

    if (state.fingerprint !== this.fingerprint) {
      if (checkReload) {
        if (typeof state.fingerprint !== 'string' || state.fingerprint.length !== this.fingerprint.length) {
          return false;
        }

        const [perfEntry] = performance.getEntriesByType('navigation');

        if (!perfEntry || perfEntry.type !== 'reload') {
          return false;
        }
      } else {
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

  _updateInternalState(destination, uid, removeTemporary = false) {
    if (this._updateViewareaTimeout) {
      clearTimeout(this._updateViewareaTimeout);
      this._updateViewareaTimeout = null;
    }

    if (removeTemporary && destination && destination.temporary) {
      delete destination.temporary;
    }

    this._destination = destination;
    this._uid = uid;
    this._numPositionUpdates = 0;
  }

  _updateViewarea({
    location
  }) {
    if (this._updateViewareaTimeout) {
      clearTimeout(this._updateViewareaTimeout);
      this._updateViewareaTimeout = null;
    }

    this._position = {
      hash: this._isViewerInPresentationMode ? `page=${location.pageNumber}` : location.pdfOpenParams.substring(1),
      page: this.linkService.page,
      first: location.pageNumber,
      rotation: location.rotation
    };

    if (this._popStateInProgress) {
      return;
    }

    if (POSITION_UPDATED_THRESHOLD > 0 && this._isPagesLoaded && this._destination && !this._destination.page) {
      this._numPositionUpdates++;
    }

    if (UPDATE_VIEWAREA_TIMEOUT > 0) {
      this._updateViewareaTimeout = setTimeout(() => {
        if (!this._popStateInProgress) {
          this._tryPushCurrentPosition(true);
        }

        this._updateViewareaTimeout = null;
      }, UPDATE_VIEWAREA_TIMEOUT);
    }
  }

  _popState({
    state
  }) {
    let newHash = getCurrentHash(),
        hashChanged = this._currentHash !== newHash;
    this._currentHash = newHash;

    if (!state || false) {
      this._uid++;
      let {
        hash,
        page,
        rotation
      } = parseCurrentHash(this.linkService);

      this._pushOrReplaceState({
        hash,
        page,
        rotation
      }, true);

      return;
    }

    if (!this._isValidState(state)) {
      return;
    }

    this._popStateInProgress = true;

    if (hashChanged) {
      this._blockHashChange++;
      (0, _ui_utils.waitOnEventOrTimeout)({
        target: window,
        name: 'hashchange',
        delay: HASH_CHANGE_TIMEOUT
      }).then(() => {
        this._blockHashChange--;
      });
    }

    let destination = state.destination;

    this._updateInternalState(destination, state.uid, true);

    if (this._uid > this._maxUid) {
      this._maxUid = this._uid;
    }

    if ((0, _ui_utils.isValidRotation)(destination.rotation)) {
      this.linkService.rotation = destination.rotation;
    }

    if (destination.dest) {
      this.linkService.navigateTo(destination.dest);
    } else if (destination.hash) {
      this.linkService.setHash(destination.hash);
    } else if (destination.page) {
      this.linkService.page = destination.page;
    }

    Promise.resolve().then(() => {
      this._popStateInProgress = false;
    });
  }

  _bindEvents() {
    let {
      _boundEvents,
      eventBus
    } = this;
    _boundEvents.updateViewarea = this._updateViewarea.bind(this);
    _boundEvents.popState = this._popState.bind(this);

    _boundEvents.pageHide = evt => {
      if (!this._destination || this._destination.temporary) {
        this._tryPushCurrentPosition();
      }
    };

    eventBus.on('updateviewarea', _boundEvents.updateViewarea);
    window.addEventListener('popstate', _boundEvents.popState);
    window.addEventListener('pagehide', _boundEvents.pageHide);
  }

}

exports.PDFHistory = PDFHistory;

function isDestHashesEqual(destHash, pushHash) {
  if (typeof destHash !== 'string' || typeof pushHash !== 'string') {
    return false;
  }

  if (destHash === pushHash) {
    return true;
  }

  let {
    nameddest
  } = (0, _ui_utils.parseQueryString)(destHash);

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

    return first === second || Number.isNaN(first) && Number.isNaN(second);
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