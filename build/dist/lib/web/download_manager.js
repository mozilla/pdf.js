/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2019 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DownloadManager = void 0;

var _pdf = require("../pdf");

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

;
var DISABLE_CREATE_OBJECT_URL = _pdf.apiCompatibilityParams.disableCreateObjectURL || false;

function _download(blobUrl, filename) {
  var a = document.createElement('a');

  if (!a.click) {
    throw new Error('DownloadManager: "a.click()" is not supported.');
  }

  a.href = blobUrl;
  a.target = '_parent';

  if ('download' in a) {
    a.download = filename;
  }

  (document.body || document.documentElement).appendChild(a);
  a.click();
  a.remove();
}

var DownloadManager =
/*#__PURE__*/
function () {
  function DownloadManager(_ref) {
    var _ref$disableCreateObj = _ref.disableCreateObjectURL,
        disableCreateObjectURL = _ref$disableCreateObj === void 0 ? DISABLE_CREATE_OBJECT_URL : _ref$disableCreateObj;

    _classCallCheck(this, DownloadManager);

    this.disableCreateObjectURL = disableCreateObjectURL;
  }

  _createClass(DownloadManager, [{
    key: "downloadUrl",
    value: function downloadUrl(url, filename) {
      if (!(0, _pdf.createValidAbsoluteUrl)(url, 'http://example.com')) {
        return;
      }

      _download(url + '#pdfjs.action=download', filename);
    }
  }, {
    key: "downloadData",
    value: function downloadData(data, filename, contentType) {
      if (navigator.msSaveBlob) {
        navigator.msSaveBlob(new Blob([data], {
          type: contentType
        }), filename);
        return;
      }

      var blobUrl = (0, _pdf.createObjectURL)(data, contentType, this.disableCreateObjectURL);

      _download(blobUrl, filename);
    }
  }, {
    key: "download",
    value: function download(blob, url, filename) {
      if (navigator.msSaveBlob) {
        if (!navigator.msSaveBlob(blob, filename)) {
          this.downloadUrl(url, filename);
        }

        return;
      }

      if (this.disableCreateObjectURL) {
        this.downloadUrl(url, filename);
        return;
      }

      var blobUrl = _pdf.URL.createObjectURL(blob);

      _download(blobUrl, filename);
    }
  }]);

  return DownloadManager;
}();

exports.DownloadManager = DownloadManager;