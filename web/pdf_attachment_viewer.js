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

import {
  createObjectURL, createPromiseCapability, getFilenameFromUrl, PDFJS,
  removeNullCharacters
} from 'pdfjs-lib';

/**
 * @typedef {Object} PDFAttachmentViewerOptions
 * @property {HTMLDivElement} container - The viewer element.
 * @property {EventBus} eventBus - The application event bus.
 * @property {DownloadManager} downloadManager - The download manager.
 */

/**
 * @typedef {Object} PDFAttachmentViewerRenderParameters
 * @property {Object|null} attachments - A lookup table of attachment objects.
 */

class PDFAttachmentViewer {
  /**
   * @param {PDFAttachmentViewerOptions} options
   */
  constructor({ container, eventBus, downloadManager, }) {
    this.attachments = null;

    this.container = container;
    this.eventBus = eventBus;
    this.downloadManager = downloadManager;

    this._renderedCapability = createPromiseCapability();
    this.eventBus.on('fileattachmentannotation',
      this._appendAttachment.bind(this));
  }

  reset(keepRenderedCapability = false) {
    this.attachments = null;

    // Remove the attachments from the DOM.
    this.container.textContent = '';

    if (!keepRenderedCapability) {
      // NOTE: The *only* situation in which the `_renderedCapability` should
      //       not be replaced is when appending file attachment annotations.
      this._renderedCapability = createPromiseCapability();
    }
  }

  /**
   * @private
   */
  _dispatchEvent(attachmentsCount) {
    this.eventBus.dispatch('attachmentsloaded', {
      source: this,
      attachmentsCount,
    });

    this._renderedCapability.resolve();
  }

  /**
   * @private
   */
  _bindPdfLink(button, content, filename) {
    if (PDFJS.disableCreateObjectURL) {
      throw new Error('bindPdfLink: ' +
                      'Unsupported "PDFJS.disableCreateObjectURL" value.');
    }
    let blobUrl;
    button.onclick = function() {
      if (!blobUrl) {
        blobUrl = createObjectURL(content, 'application/pdf');
      }
      let viewerUrl;
      if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) {
        // The current URL is the viewer, let's use it and append the file.
        viewerUrl = '?file=' + encodeURIComponent(blobUrl + '#' + filename);
      } else if (PDFJSDev.test('CHROME')) {
        // In the Chrome extension, the URL is rewritten using the history API
        // in viewer.js, so an absolute URL must be generated.
        // eslint-disable-next-line no-undef
        viewerUrl = chrome.runtime.getURL('/content/web/viewer.html') +
          '?file=' + encodeURIComponent(blobUrl + '#' + filename);
      } else if (PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
        // Let Firefox's content handler catch the URL and display the PDF.
        viewerUrl = blobUrl + '?' + encodeURIComponent(filename);
      }
      window.open(viewerUrl);
      return false;
    };
  }

  /**
   * @private
   */
  _bindLink(button, content, filename) {
    button.onclick = () => {
      this.downloadManager.downloadData(content, filename, '');
      return false;
    };
  }

  /**
   * @param {PDFAttachmentViewerRenderParameters} params
   */
  render({ attachments, keepRenderedCapability = false, }) {
    let attachmentsCount = 0;

    if (this.attachments) {
      this.reset(keepRenderedCapability === true);
    }
    this.attachments = attachments || null;

    if (!attachments) {
      this._dispatchEvent(attachmentsCount);
      return;
    }

    let names = Object.keys(attachments).sort(function(a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
    attachmentsCount = names.length;

    for (let i = 0; i < attachmentsCount; i++) {
      let item = attachments[names[i]];
      let filename = removeNullCharacters(getFilenameFromUrl(item.filename));

      let div = document.createElement('div');
      div.className = 'attachmentsItem';
      let button = document.createElement('button');
      button.textContent = filename;
      if (/\.pdf$/i.test(filename) && !PDFJS.disableCreateObjectURL) {
        this._bindPdfLink(button, item.content, filename);
      } else {
        this._bindLink(button, item.content, filename);
      }

      div.appendChild(button);
      this.container.appendChild(div);
    }

    this._dispatchEvent(attachmentsCount);
  }

  /**
   * Used to append FileAttachment annotations to the sidebar.
   * @private
   */
  _appendAttachment({ id, filename, content, }) {
    this._renderedCapability.promise.then(() => {
      let attachments = this.attachments;

      if (!attachments) {
        attachments = Object.create(null);
      } else {
        for (let name in attachments) {
          if (id === name) {
            return; // Ignore the new attachment if it already exists.
          }
        }
      }
      attachments[id] = {
        filename,
        content,
      };
      this.render({
        attachments,
        keepRenderedCapability: true,
      });
    });
  }
}

export {
  PDFAttachmentViewer,
};
