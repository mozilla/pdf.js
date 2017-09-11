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
exports.PDFFindBar = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _pdf_find_controller = require('./pdf_find_controller');

var _ui_utils = require('./ui_utils');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var PDFFindBar = function () {
  function PDFFindBar(options) {
    var _this = this;

    var l10n = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : _ui_utils.NullL10n;

    _classCallCheck(this, PDFFindBar);

    this.opened = false;
    this.bar = options.bar || null;
    this.toggleButton = options.toggleButton || null;
    this.findField = options.findField || null;
    this.highlightAll = options.highlightAllCheckbox || null;
    this.caseSensitive = options.caseSensitiveCheckbox || null;
    this.findMsg = options.findMsg || null;
    this.findResultsCount = options.findResultsCount || null;
    this.findStatusIcon = options.findStatusIcon || null;
    this.findPreviousButton = options.findPreviousButton || null;
    this.findNextButton = options.findNextButton || null;
    this.findController = options.findController || null;
    this.eventBus = options.eventBus;
    this.l10n = l10n;
    if (this.findController === null) {
      throw new Error('PDFFindBar cannot be used without a ' + 'PDFFindController instance.');
    }
    this.toggleButton.addEventListener('click', function () {
      _this.toggle();
    });
    this.findField.addEventListener('input', function () {
      _this.dispatchEvent('');
    });
    this.bar.addEventListener('keydown', function (e) {
      switch (e.keyCode) {
        case 13:
          if (e.target === _this.findField) {
            _this.dispatchEvent('again', e.shiftKey);
          }
          break;
        case 27:
          _this.close();
          break;
      }
    });
    this.findPreviousButton.addEventListener('click', function () {
      _this.dispatchEvent('again', true);
    });
    this.findNextButton.addEventListener('click', function () {
      _this.dispatchEvent('again', false);
    });
    this.highlightAll.addEventListener('click', function () {
      _this.dispatchEvent('highlightallchange');
    });
    this.caseSensitive.addEventListener('click', function () {
      _this.dispatchEvent('casesensitivitychange');
    });
    this.eventBus.on('resize', this._adjustWidth.bind(this));
  }

  _createClass(PDFFindBar, [{
    key: 'reset',
    value: function reset() {
      this.updateUIState();
    }
  }, {
    key: 'dispatchEvent',
    value: function dispatchEvent(type, findPrev) {
      this.eventBus.dispatch('find', {
        source: this,
        type: type,
        query: this.findField.value,
        caseSensitive: this.caseSensitive.checked,
        phraseSearch: true,
        highlightAll: this.highlightAll.checked,
        findPrevious: findPrev
      });
    }
  }, {
    key: 'updateUIState',
    value: function updateUIState(state, previous, matchCount) {
      var _this2 = this;

      var notFound = false;
      var findMsg = '';
      var status = '';
      switch (state) {
        case _pdf_find_controller.FindState.FOUND:
          break;
        case _pdf_find_controller.FindState.PENDING:
          status = 'pending';
          break;
        case _pdf_find_controller.FindState.NOT_FOUND:
          findMsg = this.l10n.get('find_not_found', null, 'Phrase not found');
          notFound = true;
          break;
        case _pdf_find_controller.FindState.WRAPPED:
          if (previous) {
            findMsg = this.l10n.get('find_reached_top', null, 'Reached top of document, continued from bottom');
          } else {
            findMsg = this.l10n.get('find_reached_bottom', null, 'Reached end of document, continued from top');
          }
          break;
      }
      if (notFound) {
        this.findField.classList.add('notFound');
      } else {
        this.findField.classList.remove('notFound');
      }
      this.findField.setAttribute('data-status', status);
      Promise.resolve(findMsg).then(function (msg) {
        _this2.findMsg.textContent = msg;
        _this2._adjustWidth();
      });
      this.updateResultsCount(matchCount);
    }
  }, {
    key: 'updateResultsCount',
    value: function updateResultsCount(matchCount) {
      if (!this.findResultsCount) {
        return;
      }
      if (!matchCount) {
        this.findResultsCount.classList.add('hidden');
        this.findResultsCount.textContent = '';
      } else {
        this.findResultsCount.textContent = matchCount.toLocaleString();
        this.findResultsCount.classList.remove('hidden');
      }
      this._adjustWidth();
    }
  }, {
    key: 'open',
    value: function open() {
      if (!this.opened) {
        this.opened = true;
        this.toggleButton.classList.add('toggled');
        this.bar.classList.remove('hidden');
      }
      this.findField.select();
      this.findField.focus();
      this._adjustWidth();
    }
  }, {
    key: 'close',
    value: function close() {
      if (!this.opened) {
        return;
      }
      this.opened = false;
      this.toggleButton.classList.remove('toggled');
      this.bar.classList.add('hidden');
      this.findController.active = false;
    }
  }, {
    key: 'toggle',
    value: function toggle() {
      if (this.opened) {
        this.close();
      } else {
        this.open();
      }
    }
  }, {
    key: '_adjustWidth',
    value: function _adjustWidth() {
      if (!this.opened) {
        return;
      }
      this.bar.classList.remove('wrapContainers');
      var findbarHeight = this.bar.clientHeight;
      var inputContainerHeight = this.bar.firstElementChild.clientHeight;
      if (findbarHeight > inputContainerHeight) {
        this.bar.classList.add('wrapContainers');
      }
    }
  }]);

  return PDFFindBar;
}();

exports.PDFFindBar = PDFFindBar;