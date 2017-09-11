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
exports.DownloadManager = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _pdf = require('../pdf');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

;
function _download(blobUrl, filename) {
  var a = document.createElement('a');
  if (a.click) {
    a.href = blobUrl;
    a.target = '_parent';
    if ('download' in a) {
      a.download = filename;
    }
    (document.body || document.documentElement).appendChild(a);
    a.click();
    a.parentNode.removeChild(a);
  } else {
    if (window.top === window && blobUrl.split('#')[0] === window.location.href.split('#')[0]) {
      var padCharacter = blobUrl.indexOf('?') === -1 ? '?' : '&';
      blobUrl = blobUrl.replace(/#|$/, padCharacter + '$&');
    }
    window.open(blobUrl, '_parent');
  }
}

var DownloadManager = function () {
  function DownloadManager() {
    _classCallCheck(this, DownloadManager);
  }

  _createClass(DownloadManager, [{
    key: 'downloadUrl',
    value: function downloadUrl(url, filename) {
      if (!(0, _pdf.createValidAbsoluteUrl)(url, 'http://example.com')) {
        return;
      }
      _download(url + '#pdfjs.action=download', filename);
    }
  }, {
    key: 'downloadData',
    value: function downloadData(data, filename, contentType) {
      if (navigator.msSaveBlob) {
        return navigator.msSaveBlob(new Blob([data], { type: contentType }), filename);
      }
      var blobUrl = (0, _pdf.createObjectURL)(data, contentType, _pdf.PDFJS.disableCreateObjectURL);
      _download(blobUrl, filename);
    }
  }, {
    key: 'download',
    value: function download(blob, url, filename) {
      if (navigator.msSaveBlob) {
        if (!navigator.msSaveBlob(blob, filename)) {
          this.downloadUrl(url, filename);
        }
        return;
      }
      if (_pdf.PDFJS.disableCreateObjectURL) {
        this.downloadUrl(url, filename);
        return;
      }
      var blobUrl = URL.createObjectURL(blob);
      _download(blobUrl, filename);
    }
  }]);

  return DownloadManager;
}();

exports.DownloadManager = DownloadManager;