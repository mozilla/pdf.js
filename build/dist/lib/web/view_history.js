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

var DEFAULT_VIEW_HISTORY_CACHE_SIZE = 20;

var ViewHistory = function () {
  function ViewHistory(fingerprint) {
    var _this = this;

    var cacheSize = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : DEFAULT_VIEW_HISTORY_CACHE_SIZE;

    _classCallCheck(this, ViewHistory);

    this.fingerprint = fingerprint;
    this.cacheSize = cacheSize;
    this._initializedPromise = this._readFromStorage().then(function (databaseStr) {
      var database = JSON.parse(databaseStr || '{}');
      if (!('files' in database)) {
        database.files = [];
      }
      if (database.files.length >= _this.cacheSize) {
        database.files.shift();
      }
      var index = void 0;
      for (var i = 0, length = database.files.length; i < length; i++) {
        var branch = database.files[i];
        if (branch.fingerprint === _this.fingerprint) {
          index = i;
          break;
        }
      }
      if (typeof index !== 'number') {
        index = database.files.push({ fingerprint: _this.fingerprint }) - 1;
      }
      _this.file = database.files[index];
      _this.database = database;
    });
  }

  _createClass(ViewHistory, [{
    key: '_writeToStorage',
    value: function _writeToStorage() {
      var _this2 = this;

      return new Promise(function (resolve) {
        var databaseStr = JSON.stringify(_this2.database);
        localStorage.setItem('pdfjs.history', databaseStr);
        resolve();
      });
    }
  }, {
    key: '_readFromStorage',
    value: function _readFromStorage() {
      return new Promise(function (resolve) {
        resolve(localStorage.getItem('pdfjs.history'));
      });
    }
  }, {
    key: 'set',
    value: function set(name, val) {
      var _this3 = this;

      return this._initializedPromise.then(function () {
        _this3.file[name] = val;
        return _this3._writeToStorage();
      });
    }
  }, {
    key: 'setMultiple',
    value: function setMultiple(properties) {
      var _this4 = this;

      return this._initializedPromise.then(function () {
        for (var name in properties) {
          _this4.file[name] = properties[name];
        }
        return _this4._writeToStorage();
      });
    }
  }, {
    key: 'get',
    value: function get(name, defaultValue) {
      var _this5 = this;

      return this._initializedPromise.then(function () {
        var val = _this5.file[name];
        return val !== undefined ? val : defaultValue;
      });
    }
  }, {
    key: 'getMultiple',
    value: function getMultiple(properties) {
      var _this6 = this;

      return this._initializedPromise.then(function () {
        var values = Object.create(null);
        for (var name in properties) {
          var val = _this6.file[name];
          values[name] = val !== undefined ? val : properties[name];
        }
        return values;
      });
    }
  }]);

  return ViewHistory;
}();

exports.ViewHistory = ViewHistory;