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

import { createPromiseCapability, getFilenameFromUrl } from "pdfjs-lib";
import { BaseTreeViewer } from "./base_tree_viewer.js";
import { viewerCompatibilityParams } from "./viewer_compatibility.js";

const PdfFileRegExp = /\.pdf$/i;

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

class PDFAttachmentViewer extends BaseTreeViewer {
  /**
   * @param {PDFAttachmentViewerOptions} options
   */
  constructor(options) {
    super(options);
    this.downloadManager = options.downloadManager;

    this.eventBus._on(
      "fileattachmentannotation",
      this._appendAttachment.bind(this)
    );
  }

  reset(keepRenderedCapability = false) {
    super.reset();
    this._attachments = null;

    if (!keepRenderedCapability) {
      // The only situation in which the `_renderedCapability` should *not* be
      // replaced is when appending FileAttachment annotations.
      this._renderedCapability = createPromiseCapability();
    }
    if (this._pendingDispatchEvent) {
      clearTimeout(this._pendingDispatchEvent);
    }
    this._pendingDispatchEvent = null;
  }

  /**
   * @private
   */
  _dispatchEvent(attachmentsCount) {
    this._renderedCapability.resolve();

    if (this._pendingDispatchEvent) {
      clearTimeout(this._pendingDispatchEvent);
      this._pendingDispatchEvent = null;
    }
    if (attachmentsCount === 0) {
      // Delay the event when no "regular" attachments exist, to allow time for
      // parsing of any FileAttachment annotations that may be present on the
      // *initially* rendered page; this reduces the likelihood of temporarily
      // disabling the attachmentsView when the `PDFSidebar` handles the event.
      this._pendingDispatchEvent = setTimeout(() => {
        this.eventBus.dispatch("attachmentsloaded", {
          source: this,
          attachmentsCount: 0,
        });
        this._pendingDispatchEvent = null;
      });
      return;
    }

    this.eventBus.dispatch("attachmentsloaded", {
      source: this,
      attachmentsCount,
    });
  }

  /**
   * NOTE: Should only be used when `URL.createObjectURL` is natively supported.
   * @private
   */
  _bindPdfLink(element, { content, filename }) {
    let blobUrl;
    element.onclick = () => {
      if (!blobUrl) {
        blobUrl = URL.createObjectURL(
          new Blob([content], { type: "application/pdf" })
        );
      }
      let viewerUrl;
      if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
        // The current URL is the viewer, let's use it and append the file.
        viewerUrl = "?file=" + encodeURIComponent(blobUrl + "#" + filename);
      } else if (PDFJSDev.test("MOZCENTRAL")) {
        // Let Firefox's content handler catch the URL and display the PDF.
        viewerUrl = blobUrl + "#filename=" + encodeURIComponent(filename);
      } else if (PDFJSDev.test("CHROME")) {
        // In the Chrome extension, the URL is rewritten using the history API
        // in viewer.js, so an absolute URL must be generated.
        viewerUrl =
          // eslint-disable-next-line no-undef
          chrome.runtime.getURL("/content/web/viewer.html") +
          "?file=" +
          encodeURIComponent(blobUrl + "#" + filename);
      }
      try {
        window.open(viewerUrl);
      } catch (ex) {
        console.error(`_bindPdfLink: ${ex}`);
        // Release the `blobUrl`, since opening it failed...
        URL.revokeObjectURL(blobUrl);
        blobUrl = null;
        // ... and fallback to downloading the PDF file.
        this.downloadManager.downloadData(content, filename, "application/pdf");
      }
      return false;
    };
  }

  /**
   * @private
   */
  _bindLink(element, { content, filename }) {
    element.onclick = () => {
      const contentType = PdfFileRegExp.test(filename) ? "application/pdf" : "";
      this.downloadManager.downloadData(content, filename, contentType);
      return false;
    };
  }

  /**
   * @param {PDFAttachmentViewerRenderParameters} params
   */
  render({ attachments, keepRenderedCapability = false }) {
    if (this._attachments) {
      this.reset(keepRenderedCapability);
    }
    this._attachments = attachments || null;

    if (!attachments) {
      this._dispatchEvent(/* attachmentsCount = */ 0);
      return;
    }
    const names = Object.keys(attachments).sort(function (a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });

    const fragment = document.createDocumentFragment();
    let attachmentsCount = 0;
    for (const name of names) {
      const item = attachments[name];
      const filename = getFilenameFromUrl(item.filename);

      const div = document.createElement("div");
      div.className = "treeItem";

      const element = document.createElement("a");
      if (
        PdfFileRegExp.test(filename) &&
        !viewerCompatibilityParams.disableCreateObjectURL
      ) {
        this._bindPdfLink(element, { content: item.content, filename });
      } else {
        this._bindLink(element, { content: item.content, filename });
      }
      element.textContent = this._normalizeTextContent(filename);

      div.appendChild(element);

      fragment.appendChild(div);
      attachmentsCount++;
    }

    this.container.appendChild(fragment);

    this._dispatchEvent(attachmentsCount);
  }

  /**
   * Used to append FileAttachment annotations to the sidebar.
   * @private
   */
  _appendAttachment({ id, filename, content }) {
    const renderedPromise = this._renderedCapability.promise;

    renderedPromise.then(() => {
      if (renderedPromise !== this._renderedCapability.promise) {
        return; // The FileAttachment annotation belongs to a previous document.
      }
      let attachments = this._attachments;

      if (!attachments) {
        attachments = Object.create(null);
      } else {
        for (const name in attachments) {
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

export { PDFAttachmentViewer };
