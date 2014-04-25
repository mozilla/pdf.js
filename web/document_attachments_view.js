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
/* globals PDFView, DownloadManager, getFileName */

'use strict';

var DocumentAttachmentsView = function documentAttachmentsView(attachments) {
  var attachmentsView = document.getElementById('attachmentsView');
  while (attachmentsView.firstChild) {
    attachmentsView.removeChild(attachmentsView.firstChild);
  }

  if (!attachments) {
    if (!attachmentsView.classList.contains('hidden')) {
      PDFView.switchSidebarView('thumbs');
    }
    return;
  }

  function bindItemLink(domObj, item) {
    domObj.onclick = function documentAttachmentsViewOnclick(e) {
      var downloadManager = new DownloadManager();
      downloadManager.downloadData(item.content, getFileName(item.filename),
                                   '');
      return false;
    };
  }

  var names = Object.keys(attachments).sort(function(a,b) {
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });
  for (var i = 0, ii = names.length; i < ii; i++) {
    var item = attachments[names[i]];
    var div = document.createElement('div');
    div.className = 'attachmentsItem';
    var button = document.createElement('button');
    bindItemLink(button, item);
    button.textContent = getFileName(item.filename);
    div.appendChild(button);
    attachmentsView.appendChild(div);
  }
};
