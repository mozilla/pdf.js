/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
exports.PDFAttachmentViewer = void 0;

var _pdf = require("../pdf");

class PDFAttachmentViewer {
  constructor({
    container,
    eventBus,
    downloadManager
  }) {
    this.container = container;
    this.eventBus = eventBus;
    this.downloadManager = downloadManager;
    this.reset();

    this.eventBus._on("fileattachmentannotation", this._appendAttachment.bind(this));
  }

  reset(keepRenderedCapability = false) {
    this.attachments = null;
    this.container.textContent = "";

    if (!keepRenderedCapability) {
      this._renderedCapability = (0, _pdf.createPromiseCapability)();
    }
  }

  _dispatchEvent(attachmentsCount) {
    this._renderedCapability.resolve();

    this.eventBus.dispatch("attachmentsloaded", {
      source: this,
      attachmentsCount
    });
  }

  _bindPdfLink(button, content, filename) {
    if (this.downloadManager.disableCreateObjectURL) {
      throw new Error('bindPdfLink: Unsupported "disableCreateObjectURL" value.');
    }

    let blobUrl;

    button.onclick = function () {
      if (!blobUrl) {
        blobUrl = (0, _pdf.createObjectURL)(content, "application/pdf");
      }

      let viewerUrl;
      viewerUrl = "?file=" + encodeURIComponent(blobUrl + "#" + filename);
      window.open(viewerUrl);
      return false;
    };
  }

  _bindLink(button, content, filename) {
    button.onclick = () => {
      this.downloadManager.downloadData(content, filename, "");
      return false;
    };
  }

  render({
    attachments,
    keepRenderedCapability = false
  }) {
    let attachmentsCount = 0;

    if (this.attachments) {
      this.reset(keepRenderedCapability === true);
    }

    this.attachments = attachments || null;

    if (!attachments) {
      this._dispatchEvent(attachmentsCount);

      return;
    }

    const names = Object.keys(attachments).sort(function (a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
    attachmentsCount = names.length;

    for (let i = 0; i < attachmentsCount; i++) {
      const item = attachments[names[i]];
      const filename = (0, _pdf.removeNullCharacters)((0, _pdf.getFilenameFromUrl)(item.filename));
      const div = document.createElement("div");
      div.className = "attachmentsItem";
      const button = document.createElement("button");
      button.textContent = filename;

      if (/\.pdf$/i.test(filename) && !this.downloadManager.disableCreateObjectURL) {
        this._bindPdfLink(button, item.content, filename);
      } else {
        this._bindLink(button, item.content, filename);
      }

      div.appendChild(button);
      this.container.appendChild(div);
    }

    this._dispatchEvent(attachmentsCount);
  }

  _appendAttachment({
    id,
    filename,
    content
  }) {
    this._renderedCapability.promise.then(() => {
      let attachments = this.attachments;

      if (!attachments) {
        attachments = Object.create(null);
      } else {
        for (const name in attachments) {
          if (id === name) {
            return;
          }
        }
      }

      attachments[id] = {
        filename,
        content
      };
      this.render({
        attachments,
        keepRenderedCapability: true
      });
    });
  }

}

exports.PDFAttachmentViewer = PDFAttachmentViewer;