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
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.BasePreferences = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ui_utils = require("./ui_utils");

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var defaultPreferences = null;
function getDefaultPreferences() {
  if (!defaultPreferences) {
    defaultPreferences = Promise.resolve({
      "showPreviousViewOnLoad": true,
      "defaultZoomValue": "",
      "sidebarViewOnLoad": 0,
      "enableHandToolOnLoad": false,
      "cursorToolOnLoad": 0,
      "enableWebGL": false,
      "pdfBugEnabled": false,
      "disableRange": false,
      "disableStream": false,
      "disableAutoFetch": false,
      "disableFontFace": false,
      "disableTextLayer": false,
      "useOnlyCssZoom": false,
      "externalLinkTarget": 0,
      "enhanceTextSelection": false,
      "renderer": "canvas",
      "renderInteractiveForms": false,
      "enablePrintAutoRotate": false,
      "disablePageMode": false,
      "disablePageLabels": false
    });
  }
  return defaultPreferences;
}

var BasePreferences = function () {
  function BasePreferences() {
    var _this = this;

    _classCallCheck(this, BasePreferences);

    if (this.constructor === BasePreferences) {
      throw new Error('Cannot initialize BasePreferences.');
    }
    this.prefs = null;
    this._initializedPromise = getDefaultPreferences().then(function (defaults) {
      Object.defineProperty(_this, 'defaults', {
        value: Object.freeze(defaults),
        writable: false,
        enumerable: true,
        configurable: false
      });
      _this.prefs = (0, _ui_utils.cloneObj)(defaults);
      return _this._readFromStorage(defaults);
    }).then(function (prefObj) {
      if (prefObj) {
        _this.prefs = prefObj;
      }
    });
  }

  _createClass(BasePreferences, [{
    key: "_writeToStorage",
    value: function _writeToStorage(prefObj) {
      return Promise.reject(new Error('Not implemented: _writeToStorage'));
    }
  }, {
    key: "_readFromStorage",
    value: function _readFromStorage(prefObj) {
      return Promise.reject(new Error('Not implemented: _readFromStorage'));
    }
  }, {
    key: "reset",
    value: function reset() {
      var _this2 = this;

      return this._initializedPromise.then(function () {
        _this2.prefs = (0, _ui_utils.cloneObj)(_this2.defaults);
        return _this2._writeToStorage(_this2.defaults);
      });
    }
  }, {
    key: "reload",
    value: function reload() {
      var _this3 = this;

      return this._initializedPromise.then(function () {
        return _this3._readFromStorage(_this3.defaults);
      }).then(function (prefObj) {
        if (prefObj) {
          _this3.prefs = prefObj;
        }
      });
    }
  }, {
    key: "set",
    value: function set(name, value) {
      var _this4 = this;

      return this._initializedPromise.then(function () {
        if (_this4.defaults[name] === undefined) {
          throw new Error("Set preference: \"" + name + "\" is undefined.");
        } else if (value === undefined) {
          throw new Error('Set preference: no value is specified.');
        }
        var valueType = typeof value === "undefined" ? "undefined" : _typeof(value);
        var defaultType = _typeof(_this4.defaults[name]);
        if (valueType !== defaultType) {
          if (valueType === 'number' && defaultType === 'string') {
            value = value.toString();
          } else {
            throw new Error("Set preference: \"" + value + "\" is a " + valueType + ", " + ("expected a " + defaultType + "."));
          }
        } else {
          if (valueType === 'number' && !Number.isInteger(value)) {
            throw new Error("Set preference: \"" + value + "\" must be an integer.");
          }
        }
        _this4.prefs[name] = value;
        return _this4._writeToStorage(_this4.prefs);
      });
    }
  }, {
    key: "get",
    value: function get(name) {
      var _this5 = this;

      return this._initializedPromise.then(function () {
        var defaultValue = _this5.defaults[name];
        if (defaultValue === undefined) {
          throw new Error("Get preference: \"" + name + "\" is undefined.");
        } else {
          var prefValue = _this5.prefs[name];
          if (prefValue !== undefined) {
            return prefValue;
          }
        }
        return defaultValue;
      });
    }
  }]);

  return BasePreferences;
}();

exports.BasePreferences = BasePreferences;