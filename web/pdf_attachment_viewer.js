/* Copyright 2012 Mozilla Foundation
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

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-web/pdf_attachment_viewer', ['exports', 'pdfjs-web/pdfjs'],
      factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./pdfjs.js'));
  } else {
    factory((root.pdfjsWebPDFAttachmentViewer = {}), root.pdfjsWebPDFJS);
  }
}(this, function (exports, pdfjsLib) {

/**
 * @typedef {Object} PDFAttachmentViewerOptions
 * @property {HTMLDivElement} container - The viewer element.
 * @property {DownloadManager} downloadManager - The download manager.
 */

/**
 * @typedef {Object} PDFAttachmentViewerRenderParameters
 * @property {Array|null} attachments - An array of attachment objects.
 */

/**
 * @class
 */
var PDFAttachmentViewer = (function PDFAttachmentViewerClosure() {
  /**
   * @constructs PDFAttachmentViewer
   * @param {PDFAttachmentViewerOptions} options
   */
  function PDFAttachmentViewer(options) {
    this.attachments = null;
    this.container = options.container;
    this.downloadManager = options.downloadManager;
  }

  PDFAttachmentViewer.prototype = {
    reset: function PDFAttachmentViewer_reset() {
      this.attachments = null;

      var container = this.container;
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    },

    /**
     * @private
     */
    _dispatchEvent:
        function PDFAttachmentViewer_dispatchEvent(attachmentsCount) {
      var event = document.createEvent('CustomEvent');
      event.initCustomEvent('attachmentsloaded', true, true, {
        attachmentsCount: attachmentsCount
      });
      this.container.dispatchEvent(event);
    },

    /**
     * @private
     */
    _bindLink:
        function PDFAttachmentViewer_bindLink(button, content, filename) {
      button.onclick = function downloadFile(e) {
        this.downloadManager.downloadData(content, filename, '');
        return false;
      }.bind(this);
    },

    /**
     * @param {PDFAttachmentViewerRenderParameters} params
     */
    render: function PDFAttachmentViewer_render(params) {
      var attachments = (params && params.attachments) || null;
      var attachmentsCount = 0;

      if (this.attachments) {
        this.reset();
      }
      this.attachments = attachments;

      if (!attachments) {
        this._dispatchEvent(attachmentsCount);
        return;
      }

      var names = Object.keys(attachments).sort(function(a, b) {
        return a.toLowerCase().localeCompare(b.toLowerCase());
      });
      attachmentsCount = names.length;

      for (var i = 0; i < attachmentsCount; i++) {
        var item = attachments[names[i]];
        var filename = pdfjsLib.getFilenameFromUrl(item.filename);
        var div = document.createElement('div');
        div.className = 'attachmentsItem';
        var button = document.createElement('button');
        this._bindLink(button, item.content, filename);
        button.textContent = pdfjsLib.removeNullCharacters(filename);
        div.appendChild(button);
        this.container.appendChild(div);
      }

      this._dispatchEvent(attachmentsCount);
    }
  };

  return PDFAttachmentViewer;
})();

exports.PDFAttachmentViewer = PDFAttachmentViewer;
}));
