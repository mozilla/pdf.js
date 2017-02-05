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
 * @property {EventBus} eventBus - The application event bus.
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
    this.eventBus = options.eventBus;
    this.downloadManager = options.downloadManager;

    this._renderedCapability = pdfjsLib.createPromiseCapability();
    this.eventBus.on('fileattachmentannotation',
      this._appendAttachment.bind(this));
  }

  PDFAttachmentViewer.prototype = {
    reset: function PDFAttachmentViewer_reset(keepRenderedCapability) {
      this.attachments = null;

      var container = this.container;
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }

      if (!keepRenderedCapability) {
        // NOTE: The *only* situation in which the `_renderedCapability` should
        //       not be replaced is when appending file attachment annotations.
        this._renderedCapability = pdfjsLib.createPromiseCapability();
      }
    },

    /**
     * @private
     */
    _dispatchEvent:
        function PDFAttachmentViewer_dispatchEvent(attachmentsCount) {
      this.eventBus.dispatch('attachmentsloaded', {
        source: this,
        attachmentsCount: attachmentsCount,
      });

      this._renderedCapability.resolve();
    },

    /**
     * @private
     */
    _bindPdfLink:
        function PDFAttachmentViewer_bindPdfLink(button, content, filename) {
      var blobUrl;
      button.onclick = function() {
        if (!blobUrl) {
          blobUrl = pdfjsLib.createObjectURL(
            content, 'application/pdf', pdfjsLib.PDFJS.disableCreateObjectURL);
        }
        var viewerUrl;
        if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) {
          // The current URL is the viewer, let's use it and append the file.
          viewerUrl = '?file=' + encodeURIComponent(blobUrl + '#' + filename);
        } else if (PDFJSDev.test('CHROME')) {
          // In the Chrome extension, the URL is rewritten using the history API
          // in viewer.js, so an absolute URL must be generated.
          // eslint-disable-next-line no-undef
          viewerUrl = chrome.runtime.getURL('/content/web/viewer.html') +
            '?file=' + encodeURIComponent(blobUrl + '#' + filename);
        } else {
          // Let Firefox's content handler catch the URL and display the PDF.
          // In Firefox PDFJS.disableCreateObjectURL is always false, so
          // blobUrl is always a blob:-URL and never a data:-URL.
          viewerUrl = blobUrl + '?' + encodeURIComponent(filename);
        }
        window.open(viewerUrl);
        return false;
      };
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
      params = params || {};
      var attachments = params.attachments || null;
      var attachmentsCount = 0;

      if (this.attachments) {
        var keepRenderedCapability = params.keepRenderedCapability === true;
        this.reset(keepRenderedCapability);
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
        filename = pdfjsLib.removeNullCharacters(filename);

        var div = document.createElement('div');
        div.className = 'attachmentsItem';
        var button = document.createElement('button');
        button.textContent = filename;
        if (/\.pdf$/i.test(filename)) {
          this._bindPdfLink(button, item.content, filename);
        } else {
          this._bindLink(button, item.content, filename);
        }

        div.appendChild(button);
        this.container.appendChild(div);
      }

      this._dispatchEvent(attachmentsCount);
    },

    /**
     * Used to append FileAttachment annotations to the sidebar.
     * @private
     */
    _appendAttachment: function PDFAttachmentViewer_appendAttachment(item) {
      this._renderedCapability.promise.then(function (id, filename, content) {
        var attachments = this.attachments;

        if (!attachments) {
          attachments = Object.create(null);
        } else {
          for (var name in attachments) {
            if (id === name) {
              return; // Ignore the new attachment if it already exists.
            }
          }
        }
        attachments[id] = {
          filename: filename,
          content: content,
        };
        this.render({
          attachments: attachments,
          keepRenderedCapability: true,
        });
      }.bind(this, item.id, item.filename, item.content));
    },
  };

  return PDFAttachmentViewer;
})();

exports.PDFAttachmentViewer = PDFAttachmentViewer;
}));
