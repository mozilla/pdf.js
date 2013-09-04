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
/* globals PDFView, SCROLLBAR_PADDING */

'use strict';

var SecondaryToolbar = {
  opened: false,
  previousContainerHeight: null,
  newContainerHeight: null,

  initialize: function secondaryToolbarInitialize(options) {
    this.toolbar = options.toolbar;
    this.toggleButton = options.toggleButton;

    this.buttonContainer = this.toolbar.firstElementChild;

    // Define the toolbar buttons.
    this.presentationMode = options.presentationMode;
    this.openFile = options.openFile;
    this.print = options.print;
    this.download = options.download;
    this.firstPage = options.firstPage;
    this.lastPage = options.lastPage;
    this.pageRotateCw = options.pageRotateCw;
    this.pageRotateCcw = options.pageRotateCcw;

    // Attach the event listeners.
    this.toggleButton.addEventListener('click', this.toggle.bind(this));

    this.presentationMode.addEventListener('click',
      this.presentationModeClick.bind(this));
    this.openFile.addEventListener('click', this.openFileClick.bind(this));
    this.print.addEventListener('click', this.printClick.bind(this));
    this.download.addEventListener('click', this.downloadClick.bind(this));

    this.firstPage.addEventListener('click', this.firstPageClick.bind(this));
    this.lastPage.addEventListener('click', this.lastPageClick.bind(this));

    this.pageRotateCw.addEventListener('click',
      this.pageRotateCwClick.bind(this));
    this.pageRotateCcw.addEventListener('click',
      this.pageRotateCcwClick.bind(this));
  },

  // Event handling functions.
  presentationModeClick: function secondaryToolbarPresentationModeClick(evt) {
    PDFView.presentationMode();
    this.close();
  },

  openFileClick: function secondaryToolbarOpenFileClick(evt) {
    document.getElementById('fileInput').click();
    this.close(evt.target);
  },

  printClick: function secondaryToolbarPrintClick(evt) {
    window.print();
    this.close(evt.target);
  },

  downloadClick: function secondaryToolbarDownloadClick(evt) {
    PDFView.download();
    this.close(evt.target);
  },

  firstPageClick: function secondaryToolbarFirstPageClick(evt) {
    PDFView.page = 1;
  },

  lastPageClick: function secondaryToolbarLastPageClick(evt) {
    PDFView.page = PDFView.pdfDocument.numPages;
  },

  pageRotateCwClick: function secondaryToolbarPageRotateCwClick(evt) {
    PDFView.rotatePages(90);
  },

  pageRotateCcwClick: function secondaryToolbarPageRotateCcwClick(evt) {
    PDFView.rotatePages(-90);
  },

  // Misc. functions for interacting with the toolbar.
  setMaxHeight: function secondaryToolbarSetMaxHeight(container) {
    this.newContainerHeight = container.clientHeight;
    if (this.previousContainerHeight === this.newContainerHeight) {
      return;
    }
    this.buttonContainer.setAttribute('style',
      'max-height: ' + (this.newContainerHeight - SCROLLBAR_PADDING) + 'px;');
    this.previousContainerHeight = this.newContainerHeight;
  },

  open: function secondaryToolbarOpen() {
    if (this.opened) {
      return;
    }
    this.opened = true;
    this.toggleButton.classList.add('toggled');
    this.toolbar.classList.remove('hidden');
  },

  close: function secondaryToolbarClose(target) {
    if (!this.opened) {
      return;
    } else if (target && !this.toolbar.contains(target)) {
      return;
    }
    this.opened = false;
    this.toolbar.classList.add('hidden');
    this.toggleButton.classList.remove('toggled');
  },

  toggle: function secondaryToolbarToggle() {
    if (this.opened) {
      this.close();
    } else {
      this.open();
    }
  },

  get isOpen() {
    return this.opened;
  }
};
