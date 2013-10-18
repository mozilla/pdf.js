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
/* globals PDFView, updateViewarea, scrollIntoView */

'use strict';

var PageWiseScrollMode = {
  active: false,
  isScrollInProgress: false,
  stopScrollAtPageEdge: true,

  initialize: function pageWiseScrollModeInitialize(options) {
    this.presentationMode = options.presentationMode;

    this.continuousButton = options.scrollModeContinuous;
    this.pageWiseButton = options.scrollModePageWise;
  },

  _getPageTop: function pageWiseScrollMode_getPageTop(id) {
    return (PDFView.pages[id - 1].el.offsetTop +
            PDFView.pages[id - 1].el.clientTop);
  },

  _getPageHeight: function pageWiseScrollMode_getPageHeight(id) {
    return Math.floor(PDFView.pages[id - 1].height);
  },

  _goToBottomOfPage: function pageWiseScrollMode_goToBottomOfPage(
      id, pageHeight, viewHeight) {
    var hiddenHeight = ((pageHeight || this._getPageHeight(id)) -
                        (viewHeight || PDFView.container.clientHeight));
    if (hiddenHeight < 0) {
      PDFView.page = id;
      return;
    }
    var newPage = PDFView.pages[id - 1];
    var topLeft = newPage.getPagePoint(PDFView.container.scrollLeft,
                                       hiddenHeight);
    var dest = [null, { name: 'XYZ' }, Math.round(topLeft[0]),
                Math.round(topLeft[1]), null];
    newPage.scrollIntoView(dest);
  },

  attemptScrolling: function pageWiseScrollModeAttemptScrolling(state) {
    if (!this.active || this.presentationMode.active || !state) {
      return;
    } else if (this.isScrollInProgress) {
      this.isScrollInProgress = false;
      return;
    }
    var currentId = PDFView.page;
    var numPages = PDFView.pdfDocument.numPages;
    var viewHeight = PDFView.container.clientHeight;
    var pageTop = this._getPageTop(currentId);
    var pageHeight = this._getPageHeight(currentId);

    if (pageHeight < viewHeight) {
      // When more than one page is visible in the viewer,
      // every scroll event flips one page.

      if (state.down) {
        if (state.lastY > pageTop) {
          PDFView.page = (currentId === numPages) ? currentId : (currentId + 1);
        }
      } else {
        if (state.lastY < pageTop) {
          PDFView.page = (currentId === 1) ? currentId : (currentId - 1);
        }
      }
    } else {
      // When only one page is visible in the viewer,
      // a scroll event flips the page only if the top/bottom
      // of the current page has been reached.

      if (!this.stopScrollAtPageEdge && state.lastY > pageTop &&
          (state.lastY + viewHeight) < (pageTop + pageHeight)) {
        this.stopScrollAtPageEdge = true;
      }

      if (state.down) {
        if ((state.lastY + viewHeight) > (pageTop + pageHeight)) {
          if (this.stopScrollAtPageEdge || currentId === numPages) {
            this._goToBottomOfPage(currentId, pageHeight, viewHeight);
          } else {
            PDFView.page = currentId + 1;
          }
        }
      } else {
        if (state.lastY < pageTop) {
          if (this.stopScrollAtPageEdge || currentId === 1) {
            PDFView.page = currentId;
          } else {
            this._goToBottomOfPage(currentId - 1, pageHeight, viewHeight);
          }
        }
      }
    }
  },

  disable: function pageWiseScrollModeScrollSetContinuousMode() {
    if (!this.active || this.presentationMode.active) {
      return;
    }
    this.pageWiseButton.classList.remove('toggled');
    this.continuousButton.classList.add('toggled');

    this.active = false;
    updateViewarea();
  },

  enable: function pageWiseScrollModeSetPageWiseMode() {
    if (this.active || this.presentationMode.active) {
      return;
    }
    this.continuousButton.classList.remove('toggled');
    this.pageWiseButton.classList.add('toggled');

    this.active = true;
    this._resetScrollFlags();
    // Scroll the current page into view.
    this.scrollPageIntoView();
  },

  scrollPageIntoView: function pageWiseScrollModeScrollPageIntoView() {
    if (!this.active) {
      return;
    }
    var visiblePages = PDFView.getVisiblePages(), views = visiblePages.views;
    var mostVisible = views[0], firstVisible = visiblePages.first;
    if (views.length > 1) {
      if (firstVisible.id === mostVisible.id) {
        this._goToBottomOfPage(firstVisible.id);
      } else {
        PDFView.page = mostVisible.id;
      }
    } else {
      if (firstVisible.id === 1 ||
          firstVisible.id === PDFView.pdfDocument.numPages) {
        var pageHeight = this._getPageHeight(firstVisible.id);
        var viewHeight = PDFView.container.clientHeight;
        var maxVisiblePercent = ((viewHeight / pageHeight) * 100) | 0;
        if (firstVisible.percent < maxVisiblePercent) {
          if (firstVisible.id === 1) {
            PDFView.page = firstVisible.id;
          } else {
            this._goToBottomOfPage(firstVisible.id, pageHeight, viewHeight);
          }
        } else {
          updateViewarea();
        }
      }
    }
  },

  _resetScrollFlags: function pageWiseScrollMode_resetScrollFlags() {
    this.isScrollInProgress = false;
    this.stopScrollAtPageEdge = true;
  },

  setScrollFlags: function pageWiseScrollModeSetScrollFlags() {
    this.isScrollInProgress = true;
    this.stopScrollAtPageEdge = false;
  },

  get isContinuousScrollAllowed() {
    return (this._getPageHeight(PDFView.page) > PDFView.container.clientHeight);
  },

  scrollSearchResultIntoView:
      function pageWiseScrollModeScrollSearchResultIntoView(element, offset) {
    if (!this.active || !this.isContinuousScrollAllowed) {
      return;
    }
    setTimeout(function() {
      this._resetScrollFlags();
      scrollIntoView(element, offset);
    }.bind(this), 0);
  },

  /**
   * Enables the user to set the state of Page Wise Scroll Mode through
   * the hash parameter '#pageWiseScroll=value'.
   *
   * @param {Integer} value The current state of Page Wise Scroll Mode:
   *  - 0 - Continuous Scrolling.
   *  - 1 - Page Wise Scrolling.
   */
  set hashParams(value) {
    value |= 0;
    if (value === 1) {
      this.enable();
    } else {
      this.disable();
    }
  },

  /**
   * Returns the hash parameter corresponding to the current state
   * of Page Wise Scroll Mode.
   *
   * @return {Integer} (See above for explanation of the return values.)
   */
  get hashParams() {
    return (this.active | 0);
  }
};
