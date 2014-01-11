/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2013 Mozilla Foundation
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
/* globals PDFView, SCROLLBAR_PADDING, CSS_UNITS */

'use strict';

var TWO_PAGE_CONTAINER = 'twoPageContainer';

var TwoPageViewMode = {
  active: false,
  showCoverPage: true,
  numPages: 0,
  numTwoPageContainers: 0,
  containers: {},
  isPagePlacedOnRightSideInContainer: {},
  previousPageNumber: null,

  initialize: function twoPageViewModeInitialize(options) {
    this.container = options.container;
    this.viewer = this.container.firstElementChild;

    this.onePageView = options.onePageView;
    this.twoPageView = options.twoPageView;
    this.twoPageViewShowCoverPage = options.twoPageViewShowCoverPage;
  },

  _createTwoPageView: function twoPageViewMode_createTwoPageView() {
    this.previousPageNumber = PDFView.page;

    this.numPages = PDFView.pages.length;
    if ((this.numPages & 1) === 0) { // Even number of pages.
      this.numTwoPageContainers = (this.numPages / 2 +
                                   (this.showCoverPage ? 1 : 0));
    } else { // Odd number of pages.
      this.numTwoPageContainers = Math.ceil(this.numPages / 2);
    }
    var uid, twoPageContainer;
    for (var i = 1; i <= this.numTwoPageContainers; i++) {
      uid = (2 * i - 1);
      twoPageContainer = this.containers[uid] = document.createElement('div');
      twoPageContainer.id = TWO_PAGE_CONTAINER + uid;
      twoPageContainer.className = TWO_PAGE_CONTAINER;
      this.viewer.appendChild(twoPageContainer);
    }
    var pageDiv, index;
    for (var i = 1; i <= this.numPages; i++) {
      pageDiv = PDFView.pages[i - 1].el;
      index = i + (this.containers[i] ? 0 : (this.showCoverPage ? 1 : -1));
      this.containers[index].appendChild(pageDiv);

      if ((i & 1) === 0) { // Even page number.
        this.isPagePlacedOnRightSideInContainer[i] = !this.showCoverPage;
      } else { // Odd page number.
        this.isPagePlacedOnRightSideInContainer[i] = (this.showCoverPage &&
                                                      i !== 1);
      }
    }

    this.active = true;
  },

  _destroyTwoPageView: function twoPageViewMode_destroyTwoPageView() {
    this.previousPageNumber = PDFView.page;

    var pageDiv;
    for (var i = 1, ii = this.numPages; i <= ii; i++) {
      pageDiv = PDFView.pages[i - 1].el;
      this.viewer.appendChild(pageDiv);
    }
    for (var uid in this.containers) {
      this.viewer.removeChild(this.containers[uid]);
    }

    this._resetParameters();
  },

  _resetParameters: function twoPageViewMode_resetParameters() {
    this.active = false;
    this.numPages = 0;
    this.numTwoPageContainers = 0;
    this.containers = {};
    this.isPagePlacedOnRightSideInContainer = {};
  },

  _updateViewarea: function twoPageViewMode_updateViewarea(noResize) {
    if (PDFView.currentScaleValue) {
      if (!noResize) {
        PDFView.setScale(PDFView.currentScaleValue, true, true);
      }
      PDFView.page = this.previousPageNumber;
      PDFView.renderHighestPriority();
    }
    this.previousPageNumber = null;
  },

  disable: function twoPageViewModeDisable() {
    if (!this.active) {
      return;
    }
    this.twoPageView.classList.remove('toggled');
    this.onePageView.classList.add('toggled');
    this.twoPageViewShowCoverPage.classList.add('hidden');

    if (this.viewer.hasChildNodes()) {
      this._destroyTwoPageView();
      this._updateViewarea();
    } else {
      this._resetParameters();
    }
  },

  enable: function twoPageViewModeEnable() {
    if (this.active || !this.viewer.hasChildNodes()) {
      return;
    }
    this.onePageView.classList.remove('toggled');
    this.twoPageView.classList.add('toggled');
    this.twoPageViewShowCoverPage.classList.remove('hidden');

    this._createTwoPageView();
    this._updateViewarea();
  },

  toggleCoverPage: function twoPageViewModeToggleCoverPage() {
    if (this.showCoverPage) {
      this.twoPageViewShowCoverPage.classList.remove('toggled');
      this.showCoverPage = false;
    } else {
      this.twoPageViewShowCoverPage.classList.add('toggled');
      this.showCoverPage = true;
    }
    if (this.active) {
      this._destroyTwoPageView();
      this._createTwoPageView();
      this._updateViewarea(true);
    }
  },

  scrollIntoViewPageNumber: function twoPageViewScrollIntoViewPageNumber(id) {
    var dest;

    if (PDFView.isHorizontalScrollbarEnabled) {
      dest = [null, { name: 'XYZ' }, 0, null, null];

      if ((id === 1 && this.showCoverPage) || (id === this.numPages &&
                              !this.isPagePlacedOnRightSideInContainer[id])) {
        var newPage = PDFView.pages[id - 1];
        if ((newPage.width | 0) <
            (this.container.clientWidth - SCROLLBAR_PADDING)) {
          dest[2] = -(newPage.el.offsetLeft + newPage.el.clientLeft);
        }
      }
    }
    PDFView.pages[id - 1].scrollIntoView(dest);
  },

  previousPage: function twoPageViewModePreviousPage() {
    var newPageNumber = PDFView.page - 1, firstPage = 1;

    if (!PDFView.isHorizontalScrollbarEnabled) {
      newPageNumber--;
      if (this.isPagePlacedOnRightSideInContainer[newPageNumber]) {
        newPageNumber--;
      }
    }
    PDFView.page = (newPageNumber < firstPage) ? firstPage : newPageNumber;
  },

  nextPage: function twoPageViewModeNextPage() {
    var newPageNumber = PDFView.page + 1, lastPage = this.getLastPageNumber();

    if (!PDFView.isHorizontalScrollbarEnabled) {
      if (this.isPagePlacedOnRightSideInContainer[newPageNumber]) {
        newPageNumber++;
      }
    }
    PDFView.page = (newPageNumber > lastPage) ? lastPage : newPageNumber;
  },

  getLastPageNumber: function twoPageViewGetLastPageNumber() {
    var lastPage = this.numPages;

    if (!PDFView.isHorizontalScrollbarEnabled &&
        this.isPagePlacedOnRightSideInContainer[lastPage]) {
      lastPage--;
    }
    return lastPage;
  },

  /**
   * Enables the user to set the state of Two Page View Mode through
   * the hash parameter '#twoPageView=value'.
   *
   * @param {Integer} value The current state of Two Page View Mode:
   *  - 0 - One Page View.
   *  - 1 - Two Page View.
   *  - 2 - Two Page View, with separate Cover Page.
   */
  set hashParams(value) {
    value |= 0;
    if (value === 2) {
      if (!this.showCoverPage) {
        this.toggleCoverPage();
      }
      this.enable();
    } else if (value === 1) {
      if (this.showCoverPage) {
        this.toggleCoverPage();
      }
      this.enable();
    } else {
      this.disable();
    }
  },

  /**
   * Returns the hash parameter corresponding to the current state
   * of Two Page View Mode.
   *
   * @return {Integer} (See above for explanation of the return values.)
   */
  get hashParams() {
    return ((this.active | 0) + (this.active && (this.showCoverPage | 0)));
  }
};
