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
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isDestsEqual = exports.PDFHistory = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ui_utils = require('./ui_utils');

var _dom_events = require('./dom_events');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var HASH_CHANGE_TIMEOUT = 1000;
var POSITION_UPDATED_THRESHOLD = 50;
var UPDATE_VIEWAREA_TIMEOUT = 1000;
function getCurrentHash() {
  return document.location.hash;
}
function parseCurrentHash(linkService) {
  var hash = unescape(getCurrentHash()).substring(1);
  var params = (0, _ui_utils.parseQueryString)(hash);
  var page = params.page | 0;
  if (!(Number.isInteger(page) && page > 0 && page <= linkService.pagesCount)) {
    page = null;
  }
  return {
    hash: hash,
    page: page,
    rotation: linkService.rotation
  };
}

var PDFHistory = function () {
  function PDFHistory(_ref) {
    var _this = this;

    var linkService = _ref.linkService,
        eventBus = _ref.eventBus;

    _classCallCheck(this, PDFHistory);

    this.linkService = linkService;
    this.eventBus = eventBus || (0, _dom_events.getGlobalEventBus)();
    this.initialized = false;
    this.initialBookmark = null;
    this.initialRotation = null;
    this._boundEvents = Object.create(null);
    this._isViewerInPresentationMode = false;
    this._isPagesLoaded = false;
    this.eventBus.on('presentationmodechanged', function (evt) {
      _this._isViewerInPresentationMode = evt.active || evt.switchInProgress;
    });
    this.eventBus.on('pagesloaded', function (evt) {
      _this._isPagesLoaded = !!evt.pagesCount;
    });
  }

  _createClass(PDFHistory, [{
    key: 'initialize',
    value: function initialize(fingerprint) {
      var resetHistory = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

      if (!fingerprint || typeof fingerprint !== 'string') {
        console.error('PDFHistory.initialize: The "fingerprint" must be a non-empty string.');
        return;
      }
      var reInitialized = this.initialized && this.fingerprint !== fingerprint;
      this.fingerprint = fingerprint;
      if (!this.initialized) {
        this._bindEvents();
      }
      var state = window.history.state;
      this.initialized = true;
      this.initialBookmark = null;
      this.initialRotation = null;
      this._popStateInProgress = false;
      this._blockHashChange = 0;
      this._currentHash = getCurrentHash();
      this._numPositionUpdates = 0;
      this._currentUid = this._uid = 0;
      this._destination = null;
      this._position = null;
      if (!this._isValidState(state) || resetHistory) {
        var _parseCurrentHash = parseCurrentHash(this.linkService),
            hash = _parseCurrentHash.hash,
            page = _parseCurrentHash.page,
            rotation = _parseCurrentHash.rotation;

        if (!hash || reInitialized || resetHistory) {
          this._pushOrReplaceState(null, true);
          return;
        }
        this._pushOrReplaceState({
          hash: hash,
          page: page,
          rotation: rotation
        }, true);
        return;
      }
      var destination = state.destination;
      this._updateInternalState(destination, state.uid, true);
      if (destination.rotation !== undefined) {
        this.initialRotation = destination.rotation;
      }
      if (destination.dest) {
        this.initialBookmark = JSON.stringify(destination.dest);
        this._destination.page = null;
      } else if (destination.hash) {
        this.initialBookmark = destination.hash;
      } else if (destination.page) {
        this.initialBookmark = 'page=' + destination.page;
      }
    }
  }, {
    key: 'push',
    value: function push(_ref2) {
      var _this2 = this;

      var namedDest = _ref2.namedDest,
          explicitDest = _ref2.explicitDest,
          pageNumber = _ref2.pageNumber;

      if (!this.initialized) {
        return;
      }
      if (namedDest && typeof namedDest !== 'string' || !(explicitDest instanceof Array) || !(Number.isInteger(pageNumber) && pageNumber > 0 && pageNumber <= this.linkService.pagesCount)) {
        console.error('PDFHistory.push: Invalid parameters.');
        return;
      }
      var hash = namedDest || JSON.stringify(explicitDest);
      if (!hash) {
        return;
      }
      var forceReplace = false;
      if (this._destination && (this._destination.hash === hash || isDestsEqual(this._destination.dest, explicitDest))) {
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
        hash: hash,
        page: pageNumber,
        rotation: this.linkService.rotation
      }, forceReplace);
      if (!this._popStateInProgress) {
        this._popStateInProgress = true;
        Promise.resolve().then(function () {
          _this2._popStateInProgress = false;
        });
      }
    }
  }, {
    key: 'pushCurrentPosition',
    value: function pushCurrentPosition() {
      if (!this.initialized || this._popStateInProgress) {
        return;
      }
      this._tryPushCurrentPosition();
    }
  }, {
    key: 'back',
    value: function back() {
      if (!this.initialized || this._popStateInProgress) {
        return;
      }
      var state = window.history.state;
      if (this._isValidState(state) && state.uid > 0) {
        window.history.back();
      }
    }
  }, {
    key: 'forward',
    value: function forward() {
      if (!this.initialized || this._popStateInProgress) {
        return;
      }
      var state = window.history.state;
      if (this._isValidState(state) && state.uid < this._uid - 1) {
        window.history.forward();
      }
    }
  }, {
    key: '_pushOrReplaceState',
    value: function _pushOrReplaceState(destination) {
      var forceReplace = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

      var shouldReplace = forceReplace || !this._destination;
      var newState = {
        fingerprint: this.fingerprint,
        uid: shouldReplace ? this._currentUid : this._uid,
        destination: destination
      };
      this._updateInternalState(destination, newState.uid);
      if (shouldReplace) {
        window.history.replaceState(newState, '', document.URL);
      } else {
        window.history.pushState(newState, '', document.URL);
      }
    }
  }, {
    key: '_tryPushCurrentPosition',
    value: function _tryPushCurrentPosition() {
      var temporary = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

      if (!this._position) {
        return;
      }
      var position = this._position;
      if (temporary) {
        position = (0, _ui_utils.cloneObj)(this._position);
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
      var forceReplace = false;
      if (this._destination.page === position.first || this._destination.page === position.page) {
        if (this._destination.dest || !this._destination.first) {
          return;
        }
        forceReplace = true;
      }
      this._pushOrReplaceState(position, forceReplace);
    }
  }, {
    key: '_isValidState',
    value: function _isValidState(state) {
      if (!state) {
        return false;
      }
      if (state.fingerprint !== this.fingerprint) {
        return false;
      }
      if (!Number.isInteger(state.uid) || state.uid < 0) {
        return false;
      }
      if (state.destination === null || _typeof(state.destination) !== 'object') {
        return false;
      }
      return true;
    }
  }, {
    key: '_updateInternalState',
    value: function _updateInternalState(destination, uid) {
      var removeTemporary = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

      if (this._updateViewareaTimeout) {
        clearTimeout(this._updateViewareaTimeout);
        this._updateViewareaTimeout = null;
      }
      if (removeTemporary && destination && destination.temporary) {
        delete destination.temporary;
      }
      this._destination = destination;
      this._currentUid = uid;
      this._uid = this._currentUid + 1;
      this._numPositionUpdates = 0;
    }
  }, {
    key: '_updateViewarea',
    value: function _updateViewarea(_ref3) {
      var _this3 = this;

      var location = _ref3.location;

      if (this._updateViewareaTimeout) {
        clearTimeout(this._updateViewareaTimeout);
        this._updateViewareaTimeout = null;
      }
      this._position = {
        hash: this._isViewerInPresentationMode ? 'page=' + location.pageNumber : location.pdfOpenParams.substring(1),
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
        this._updateViewareaTimeout = setTimeout(function () {
          if (!_this3._popStateInProgress) {
            _this3._tryPushCurrentPosition(true);
          }
          _this3._updateViewareaTimeout = null;
        }, UPDATE_VIEWAREA_TIMEOUT);
      }
    }
  }, {
    key: '_popState',
    value: function _popState(_ref4) {
      var _this4 = this;

      var state = _ref4.state;

      var newHash = getCurrentHash(),
          hashChanged = this._currentHash !== newHash;
      this._currentHash = newHash;
      if (!state || false) {
        this._currentUid = this._uid;

        var _parseCurrentHash2 = parseCurrentHash(this.linkService),
            hash = _parseCurrentHash2.hash,
            page = _parseCurrentHash2.page,
            rotation = _parseCurrentHash2.rotation;

        this._pushOrReplaceState({
          hash: hash,
          page: page,
          rotation: rotation
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
        }).then(function () {
          _this4._blockHashChange--;
        });
      }
      var destination = state.destination;
      this._updateInternalState(destination, state.uid, true);
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
      Promise.resolve().then(function () {
        _this4._popStateInProgress = false;
      });
    }
  }, {
    key: '_bindEvents',
    value: function _bindEvents() {
      var _this5 = this;

      var _boundEvents = this._boundEvents,
          eventBus = this.eventBus;

      _boundEvents.updateViewarea = this._updateViewarea.bind(this);
      _boundEvents.popState = this._popState.bind(this);
      _boundEvents.pageHide = function (evt) {
        if (!_this5._destination) {
          _this5._tryPushCurrentPosition();
        }
      };
      eventBus.on('updateviewarea', _boundEvents.updateViewarea);
      window.addEventListener('popstate', _boundEvents.popState);
      window.addEventListener('pagehide', _boundEvents.pageHide);
    }
  }, {
    key: 'popStateInProgress',
    get: function get() {
      return this.initialized && (this._popStateInProgress || this._blockHashChange > 0);
    }
  }]);

  return PDFHistory;
}();

function isDestsEqual(firstDest, secondDest) {
  function isEntryEqual(first, second) {
    if ((typeof first === 'undefined' ? 'undefined' : _typeof(first)) !== (typeof second === 'undefined' ? 'undefined' : _typeof(second))) {
      return false;
    }
    if (first instanceof Array || second instanceof Array) {
      return false;
    }
    if (first !== null && (typeof first === 'undefined' ? 'undefined' : _typeof(first)) === 'object' && second !== null) {
      if (Object.keys(first).length !== Object.keys(second).length) {
        return false;
      }
      for (var key in first) {
        if (!isEntryEqual(first[key], second[key])) {
          return false;
        }
      }
      return true;
    }
    return first === second || Number.isNaN(first) && Number.isNaN(second);
  }
  if (!(firstDest instanceof Array && secondDest instanceof Array)) {
    return false;
  }
  if (firstDest.length !== secondDest.length) {
    return false;
  }
  for (var i = 0, ii = firstDest.length; i < ii; i++) {
    if (!isEntryEqual(firstDest[i], secondDest[i])) {
      return false;
    }
  }
  return true;
}
exports.PDFHistory = PDFHistory;
exports.isDestsEqual = isDestsEqual;