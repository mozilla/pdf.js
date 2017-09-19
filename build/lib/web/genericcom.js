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
exports.GenericCom = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _app = require('./app');

var _preferences = require('./preferences');

var _download_manager = require('./download_manager');

var _genericl10n = require('./genericl10n');

var _pdf = require('../pdf');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

;
var GenericCom = {};

var GenericPreferences = function (_BasePreferences) {
  _inherits(GenericPreferences, _BasePreferences);

  function GenericPreferences() {
    _classCallCheck(this, GenericPreferences);

    return _possibleConstructorReturn(this, (GenericPreferences.__proto__ || Object.getPrototypeOf(GenericPreferences)).apply(this, arguments));
  }

  _createClass(GenericPreferences, [{
    key: '_writeToStorage',
    value: function _writeToStorage(prefObj) {
      return new Promise(function (resolve) {
        localStorage.setItem('pdfjs.preferences', JSON.stringify(prefObj));
        resolve();
      });
    }
  }, {
    key: '_readFromStorage',
    value: function _readFromStorage(prefObj) {
      return new Promise(function (resolve) {
        var readPrefs = JSON.parse(localStorage.getItem('pdfjs.preferences'));
        resolve(readPrefs);
      });
    }
  }]);

  return GenericPreferences;
}(_preferences.BasePreferences);

var GenericExternalServices = Object.create(_app.DefaultExternalServices);
GenericExternalServices.createDownloadManager = function () {
  return new _download_manager.DownloadManager();
};
GenericExternalServices.createPreferences = function () {
  return new GenericPreferences();
};
GenericExternalServices.createL10n = function () {
  return new _genericl10n.GenericL10n(_pdf.PDFJS.locale);
};
_app.PDFViewerApplication.externalServices = GenericExternalServices;
exports.GenericCom = GenericCom;