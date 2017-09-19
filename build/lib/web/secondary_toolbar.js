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
exports.SecondaryToolbar = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _pdf_cursor_tools = require('./pdf_cursor_tools');

var _ui_utils = require('./ui_utils');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var SecondaryToolbar = function () {
  function SecondaryToolbar(options, mainContainer, eventBus) {
    _classCallCheck(this, SecondaryToolbar);

    this.toolbar = options.toolbar;
    this.toggleButton = options.toggleButton;
    this.toolbarButtonContainer = options.toolbarButtonContainer;
    this.buttons = [{
      element: options.presentationModeButton,
      eventName: 'presentationmode',
      close: true
    }, {
      element: options.openFileButton,
      eventName: 'openfile',
      close: true
    }, {
      element: options.printButton,
      eventName: 'print',
      close: true
    }, {
      element: options.downloadButton,
      eventName: 'download',
      close: true
    }, {
      element: options.viewBookmarkButton,
      eventName: null,
      close: true
    }, {
      element: options.firstPageButton,
      eventName: 'firstpage',
      close: true
    }, {
      element: options.lastPageButton,
      eventName: 'lastpage',
      close: true
    }, {
      element: options.pageRotateCwButton,
      eventName: 'rotatecw',
      close: false
    }, {
      element: options.pageRotateCcwButton,
      eventName: 'rotateccw',
      close: false
    }, {
      element: options.cursorSelectToolButton,
      eventName: 'switchcursortool',
      eventDetails: { tool: _pdf_cursor_tools.CursorTool.SELECT },
      close: true
    }, {
      element: options.cursorHandToolButton,
      eventName: 'switchcursortool',
      eventDetails: { tool: _pdf_cursor_tools.CursorTool.HAND },
      close: true
    }, {
      element: options.documentPropertiesButton,
      eventName: 'documentproperties',
      close: true
    }];
    this.items = {
      firstPage: options.firstPageButton,
      lastPage: options.lastPageButton,
      pageRotateCw: options.pageRotateCwButton,
      pageRotateCcw: options.pageRotateCcwButton
    };
    this.mainContainer = mainContainer;
    this.eventBus = eventBus;
    this.opened = false;
    this.containerHeight = null;
    this.previousContainerHeight = null;
    this.reset();
    this._bindClickListeners();
    this._bindCursorToolsListener(options);
    this.eventBus.on('resize', this._setMaxHeight.bind(this));
  }

  _createClass(SecondaryToolbar, [{
    key: 'setPageNumber',
    value: function setPageNumber(pageNumber) {
      this.pageNumber = pageNumber;
      this._updateUIState();
    }
  }, {
    key: 'setPagesCount',
    value: function setPagesCount(pagesCount) {
      this.pagesCount = pagesCount;
      this._updateUIState();
    }
  }, {
    key: 'reset',
    value: function reset() {
      this.pageNumber = 0;
      this.pagesCount = 0;
      this._updateUIState();
    }
  }, {
    key: '_updateUIState',
    value: function _updateUIState() {
      this.items.firstPage.disabled = this.pageNumber <= 1;
      this.items.lastPage.disabled = this.pageNumber >= this.pagesCount;
      this.items.pageRotateCw.disabled = this.pagesCount === 0;
      this.items.pageRotateCcw.disabled = this.pagesCount === 0;
    }
  }, {
    key: '_bindClickListeners',
    value: function _bindClickListeners() {
      var _this = this;

      this.toggleButton.addEventListener('click', this.toggle.bind(this));

      var _loop = function _loop(button) {
        var _buttons$button = _this.buttons[button],
            element = _buttons$button.element,
            eventName = _buttons$button.eventName,
            close = _buttons$button.close,
            eventDetails = _buttons$button.eventDetails;

        element.addEventListener('click', function (evt) {
          if (eventName !== null) {
            var details = { source: _this };
            for (var property in eventDetails) {
              details[property] = eventDetails[property];
            }
            _this.eventBus.dispatch(eventName, details);
          }
          if (close) {
            _this.close();
          }
        });
      };

      for (var button in this.buttons) {
        _loop(button);
      }
    }
  }, {
    key: '_bindCursorToolsListener',
    value: function _bindCursorToolsListener(buttons) {
      this.eventBus.on('cursortoolchanged', function (evt) {
        buttons.cursorSelectToolButton.classList.remove('toggled');
        buttons.cursorHandToolButton.classList.remove('toggled');
        switch (evt.tool) {
          case _pdf_cursor_tools.CursorTool.SELECT:
            buttons.cursorSelectToolButton.classList.add('toggled');
            break;
          case _pdf_cursor_tools.CursorTool.HAND:
            buttons.cursorHandToolButton.classList.add('toggled');
            break;
        }
      });
    }
  }, {
    key: 'open',
    value: function open() {
      if (this.opened) {
        return;
      }
      this.opened = true;
      this._setMaxHeight();
      this.toggleButton.classList.add('toggled');
      this.toolbar.classList.remove('hidden');
    }
  }, {
    key: 'close',
    value: function close() {
      if (!this.opened) {
        return;
      }
      this.opened = false;
      this.toolbar.classList.add('hidden');
      this.toggleButton.classList.remove('toggled');
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
    key: '_setMaxHeight',
    value: function _setMaxHeight() {
      if (!this.opened) {
        return;
      }
      this.containerHeight = this.mainContainer.clientHeight;
      if (this.containerHeight === this.previousContainerHeight) {
        return;
      }
      this.toolbarButtonContainer.setAttribute('style', 'max-height: ' + (this.containerHeight - _ui_utils.SCROLLBAR_PADDING) + 'px;');
      this.previousContainerHeight = this.containerHeight;
    }
  }, {
    key: 'isOpen',
    get: function get() {
      return this.opened;
    }
  }]);

  return SecondaryToolbar;
}();

exports.SecondaryToolbar = SecondaryToolbar;