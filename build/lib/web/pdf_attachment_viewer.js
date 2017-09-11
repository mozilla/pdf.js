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
exports.PDFAttachmentViewer = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _pdf = require('../pdf');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var PDFAttachmentViewer = function () {
  function PDFAttachmentViewer(_ref) {
    var container = _ref.container,
        eventBus = _ref.eventBus,
        downloadManager = _ref.downloadManager;

    _classCallCheck(this, PDFAttachmentViewer);

    this.container = container;
    this.eventBus = eventBus;
    this.downloadManager = downloadManager;
    this.reset();
    this.eventBus.on('fileattachmentannotation', this._appendAttachment.bind(this));
  }

  _createClass(PDFAttachmentViewer, [{
    key: 'reset',
    value: function reset() {
      var keepRenderedCapability = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

      this.attachments = null;
      this.container.textContent = '';
      if (!keepRenderedCapability) {
        this._renderedCapability = (0, _pdf.createPromiseCapability)();
      }
    }
  }, {
    key: '_dispatchEvent',
    value: function _dispatchEvent(attachmentsCount) {
      this._renderedCapability.resolve();
      this.eventBus.dispatch('attachmentsloaded', {
        source: this,
        attachmentsCount: attachmentsCount
      });
    }
  }, {
    key: '_bindPdfLink',
    value: function _bindPdfLink(button, content, filename) {
      if (_pdf.PDFJS.disableCreateObjectURL) {
        throw new Error('bindPdfLink: ' + 'Unsupported "PDFJS.disableCreateObjectURL" value.');
      }
      var blobUrl = void 0;
      button.onclick = function () {
        if (!blobUrl) {
          blobUrl = (0, _pdf.createObjectURL)(content, 'application/pdf');
        }
        var viewerUrl = void 0;
        viewerUrl = '?file=' + encodeURIComponent(blobUrl + '#' + filename);
        window.open(viewerUrl);
        return false;
      };
    }
  }, {
    key: '_bindLink',
    value: function _bindLink(button, content, filename) {
      var _this = this;

      button.onclick = function () {
        _this.downloadManager.downloadData(content, filename, '');
        return false;
      };
    }
  }, {
    key: 'render',
    value: function render(_ref2) {
      var attachments = _ref2.attachments,
          _ref2$keepRenderedCap = _ref2.keepRenderedCapability,
          keepRenderedCapability = _ref2$keepRenderedCap === undefined ? false : _ref2$keepRenderedCap;

      var attachmentsCount = 0;
      if (this.attachments) {
        this.reset(keepRenderedCapability === true);
      }
      this.attachments = attachments || null;
      if (!attachments) {
        this._dispatchEvent(attachmentsCount);
        return;
      }
      var names = Object.keys(attachments).sort(function (a, b) {
        return a.toLowerCase().localeCompare(b.toLowerCase());
      });
      attachmentsCount = names.length;
      for (var i = 0; i < attachmentsCount; i++) {
        var item = attachments[names[i]];
        var filename = (0, _pdf.removeNullCharacters)((0, _pdf.getFilenameFromUrl)(item.filename));
        var div = document.createElement('div');
        div.className = 'attachmentsItem';
        var button = document.createElement('button');
        button.textContent = filename;
        if (/\.pdf$/i.test(filename) && !_pdf.PDFJS.disableCreateObjectURL) {
          this._bindPdfLink(button, item.content, filename);
        } else {
          this._bindLink(button, item.content, filename);
        }
        div.appendChild(button);
        this.container.appendChild(div);
      }
      this._dispatchEvent(attachmentsCount);
    }
  }, {
    key: '_appendAttachment',
    value: function _appendAttachment(_ref3) {
      var _this2 = this;

      var id = _ref3.id,
          filename = _ref3.filename,
          content = _ref3.content;

      this._renderedCapability.promise.then(function () {
        var attachments = _this2.attachments;
        if (!attachments) {
          attachments = Object.create(null);
        } else {
          for (var name in attachments) {
            if (id === name) {
              return;
            }
          }
        }
        attachments[id] = {
          filename: filename,
          content: content
        };
        _this2.render({
          attachments: attachments,
          keepRenderedCapability: true
        });
      });
    }
  }]);

  return PDFAttachmentViewer;
}();

exports.PDFAttachmentViewer = PDFAttachmentViewer;