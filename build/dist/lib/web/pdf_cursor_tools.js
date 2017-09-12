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
exports.PDFCursorTools = exports.CursorTool = undefined;

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _grab_to_pan = require('./grab_to_pan');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var CursorTool = {
  SELECT: 0,
  HAND: 1,
  ZOOM: 2
};

var PDFCursorTools = function () {
  function PDFCursorTools(_ref) {
    var _this = this;

    var container = _ref.container,
        eventBus = _ref.eventBus,
        preferences = _ref.preferences;

    _classCallCheck(this, PDFCursorTools);

    this.container = container;
    this.eventBus = eventBus;
    this.active = CursorTool.SELECT;
    this.activeBeforePresentationMode = null;
    this.handTool = new _grab_to_pan.GrabToPan({ element: this.container });
    this._addEventListeners();
    Promise.all([preferences.get('cursorToolOnLoad'), preferences.get('enableHandToolOnLoad')]).then(function (_ref2) {
      var _ref3 = _slicedToArray(_ref2, 2),
          cursorToolPref = _ref3[0],
          handToolPref = _ref3[1];

      if (handToolPref === true) {
        preferences.set('enableHandToolOnLoad', false);
        if (cursorToolPref === CursorTool.SELECT) {
          cursorToolPref = CursorTool.HAND;
          preferences.set('cursorToolOnLoad', cursorToolPref).catch(function () {});
        }
      }
      _this.switchTool(cursorToolPref);
    }).catch(function () {});
  }

  _createClass(PDFCursorTools, [{
    key: 'switchTool',
    value: function switchTool(tool) {
      var _this2 = this;

      if (this.activeBeforePresentationMode !== null) {
        return;
      }
      if (tool === this.active) {
        return;
      }
      var disableActiveTool = function disableActiveTool() {
        switch (_this2.active) {
          case CursorTool.SELECT:
            break;
          case CursorTool.HAND:
            _this2.handTool.deactivate();
            break;
          case CursorTool.ZOOM:
        }
      };
      switch (tool) {
        case CursorTool.SELECT:
          disableActiveTool();
          break;
        case CursorTool.HAND:
          disableActiveTool();
          this.handTool.activate();
          break;
        case CursorTool.ZOOM:
        default:
          console.error('switchTool: "' + tool + '" is an unsupported value.');
          return;
      }
      this.active = tool;
      this._dispatchEvent();
    }
  }, {
    key: '_dispatchEvent',
    value: function _dispatchEvent() {
      this.eventBus.dispatch('cursortoolchanged', {
        source: this,
        tool: this.active
      });
    }
  }, {
    key: '_addEventListeners',
    value: function _addEventListeners() {
      var _this3 = this;

      this.eventBus.on('switchcursortool', function (evt) {
        _this3.switchTool(evt.tool);
      });
      this.eventBus.on('presentationmodechanged', function (evt) {
        if (evt.switchInProgress) {
          return;
        }
        var previouslyActive = void 0;
        if (evt.active) {
          previouslyActive = _this3.active;
          _this3.switchTool(CursorTool.SELECT);
          _this3.activeBeforePresentationMode = previouslyActive;
        } else {
          previouslyActive = _this3.activeBeforePresentationMode;
          _this3.activeBeforePresentationMode = null;
          _this3.switchTool(previouslyActive);
        }
      });
    }
  }, {
    key: 'activeTool',
    get: function get() {
      return this.active;
    }
  }]);

  return PDFCursorTools;
}();

exports.CursorTool = CursorTool;
exports.PDFCursorTools = PDFCursorTools;