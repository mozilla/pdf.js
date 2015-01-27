/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
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
/* globals DownloadManager, getFileName */

'use strict';

var PDFAttachmentView = (function PDFAttachmentViewClosure() {
  function PDFAttachmentView(options) {
    this.container = options.container;
    this.attachments = options.attachments;
  }

  PDFAttachmentView.prototype = {
    reset: function PDFAttachmentView_reset() {
      var container = this.container;
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    },

    _bindLink: function PDFAttachmentView_bindLink(button, item) {
      button.onclick = function downloadFile(e) {
        var downloadManager = new DownloadManager();
        var content = item.content;
        var filename = item.filename;
        downloadManager.downloadData(content, getFileName(filename), '');
        return false;
      };
    },

    render: function PDFAttachmentView_render() {
      var attachments = this.attachments;

      this.reset();

      if (!attachments) {
        return;
      }

      var names = Object.keys(attachments).sort(function(a, b) {
        return a.toLowerCase().localeCompare(b.toLowerCase());
      });
      for (var i = 0, len = names.length; i < len; i++) {
        var item = attachments[names[i]];
        var div = document.createElement('div');
        div.className = 'attachmentsItem';
        var button = document.createElement('button');
        this._bindLink(button, item);
        button.textContent = getFileName(item.filename);
        div.appendChild(button);
        this.container.appendChild(div);
      }
    }
  };

  return PDFAttachmentView;
})();
