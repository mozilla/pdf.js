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

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var OverlayManager = function () {
  function OverlayManager() {
    _classCallCheck(this, OverlayManager);

    this._overlays = {};
    this._active = null;
    this._keyDownBound = this._keyDown.bind(this);
  }

  _createClass(OverlayManager, [{
    key: 'register',
    value: function register(name, element) {
      var _this = this;

      var callerCloseMethod = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
      var canForceClose = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;

      return new Promise(function (resolve) {
        var container = void 0;
        if (!name || !element || !(container = element.parentNode)) {
          throw new Error('Not enough parameters.');
        } else if (_this._overlays[name]) {
          throw new Error('The overlay is already registered.');
        }
        _this._overlays[name] = {
          element: element,
          container: container,
          callerCloseMethod: callerCloseMethod,
          canForceClose: canForceClose
        };
        resolve();
      });
    }
  }, {
    key: 'unregister',
    value: function unregister(name) {
      var _this2 = this;

      return new Promise(function (resolve) {
        if (!_this2._overlays[name]) {
          throw new Error('The overlay does not exist.');
        } else if (_this2._active === name) {
          throw new Error('The overlay cannot be removed while it is active.');
        }
        delete _this2._overlays[name];
        resolve();
      });
    }
  }, {
    key: 'open',
    value: function open(name) {
      var _this3 = this;

      return new Promise(function (resolve) {
        if (!_this3._overlays[name]) {
          throw new Error('The overlay does not exist.');
        } else if (_this3._active) {
          if (_this3._overlays[name].canForceClose) {
            _this3._closeThroughCaller();
          } else if (_this3._active === name) {
            throw new Error('The overlay is already active.');
          } else {
            throw new Error('Another overlay is currently active.');
          }
        }
        _this3._active = name;
        _this3._overlays[_this3._active].element.classList.remove('hidden');
        _this3._overlays[_this3._active].container.classList.remove('hidden');
        window.addEventListener('keydown', _this3._keyDownBound);
        resolve();
      });
    }
  }, {
    key: 'close',
    value: function close(name) {
      var _this4 = this;

      return new Promise(function (resolve) {
        if (!_this4._overlays[name]) {
          throw new Error('The overlay does not exist.');
        } else if (!_this4._active) {
          throw new Error('The overlay is currently not active.');
        } else if (_this4._active !== name) {
          throw new Error('Another overlay is currently active.');
        }
        _this4._overlays[_this4._active].container.classList.add('hidden');
        _this4._overlays[_this4._active].element.classList.add('hidden');
        _this4._active = null;
        window.removeEventListener('keydown', _this4._keyDownBound);
        resolve();
      });
    }
  }, {
    key: '_keyDown',
    value: function _keyDown(evt) {
      if (this._active && evt.keyCode === 27) {
        this._closeThroughCaller();
        evt.preventDefault();
      }
    }
  }, {
    key: '_closeThroughCaller',
    value: function _closeThroughCaller() {
      if (this._overlays[this._active].callerCloseMethod) {
        this._overlays[this._active].callerCloseMethod();
      }
      if (this._active) {
        this.close(this._active);
      }
    }
  }, {
    key: 'active',
    get: function get() {
      return this._active;
    }
  }]);

  return OverlayManager;
}();

exports.OverlayManager = OverlayManager;