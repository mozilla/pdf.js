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
/* globals PDFViewerApplication */

'use strict';

var DELAY_BEFORE_HIDING_CONTROLS = 3000; // in ms
var SELECTOR = 'presentationControls';
var DELAY_BEFORE_RESETTING_SWITCH_IN_PROGRESS = 1000; // in ms

var PDFPresentationMode = {
  initialized: false,
  active: false,
  args: null,
  contextMenuOpen: false,
  mouseScrollTimeStamp: 0,
  mouseScrollDelta: 0,

  initialize: function pdfPresentationModeInitialize(options) {
    this.initialized = true;
    this.container = options.container;
    this.pdfThumbnailViewer = options.pdfThumbnailViewer || null;
    var contextMenuItems = options.contextMenuItems || null;

    this.viewer = this.container.firstElementChild;

    window.addEventListener('fullscreenchange', this._fullscreenChange);
    window.addEventListener('mozfullscreenchange', this._fullscreenChange);
//#if !(FIREFOX || MOZCENTRAL)
    window.addEventListener('webkitfullscreenchange', this._fullscreenChange);
    window.addEventListener('MSFullscreenChange', this._fullscreenChange);
//#endif

    if (contextMenuItems) {
      for (var i = 0, ii = contextMenuItems.length; i < ii; i++) {
        var item = contextMenuItems[i];
        item.element.addEventListener('click', function (handler) {
          this.contextMenuOpen = false;
          handler();
        }.bind(this, item.handler));
      }
    }
  },

  get isFullscreen() {
    return (document.fullscreenElement ||
            document.mozFullScreen ||
            document.webkitIsFullScreen ||
            document.msFullscreenElement);
  },

  _fullscreenChange: function pdfPresentationModeFullscreenChange() {
    var self = PDFPresentationMode;
    if (self.isFullscreen) {
      self._enter();
    } else {
      self._exit();
    }
  },

  /**
   * Initialize a timeout that is used to specify switchInProgress when the
   * browser transitions to fullscreen mode. Since resize events are triggered
   * multiple times during the switch to fullscreen mode, this is necessary in
   * order to prevent the page from being scrolled partially, or completely,
   * out of view when Presentation Mode is enabled.
   * Note: This is only an issue at certain zoom levels, e.g. 'page-width'.
   */
  _setSwitchInProgress: function pdfPresentationMode_setSwitchInProgress() {
    if (this.switchInProgress) {
      clearTimeout(this.switchInProgress);
    }
    this.switchInProgress = setTimeout(function switchInProgressTimeout() {
      delete this.switchInProgress;
      this._notifyStateChange();
    }.bind(this), DELAY_BEFORE_RESETTING_SWITCH_IN_PROGRESS);
  },

  _resetSwitchInProgress: function pdfPresentationMode_resetSwitchInProgress() {
    if (this.switchInProgress) {
      clearTimeout(this.switchInProgress);
      delete this.switchInProgress;
    }
  },

  request: function pdfPresentationModeRequest() {
    if (!this.initialized || this.isFullscreen ||
        !this.viewer.hasChildNodes()) {
      return false;
    }
    this._setSwitchInProgress();
    this._notifyStateChange();

    if (this.container.requestFullscreen) {
      this.container.requestFullscreen();
    } else if (this.container.mozRequestFullScreen) {
      this.container.mozRequestFullScreen();
    } else if (this.container.webkitRequestFullscreen) {
      this.container.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
    } else if (this.container.msRequestFullscreen) {
      this.container.msRequestFullscreen();
    } else {
      return false;
    }

    this.args = {
      page: PDFViewerApplication.page,
      previousScale: PDFViewerApplication.currentScaleValue
    };

    return true;
  },

  _notifyStateChange: function pdfPresentationModeNotifyStateChange() {
    var self = PDFPresentationMode;
    var event = document.createEvent('CustomEvent');
    event.initCustomEvent('presentationmodechanged', true, true, {
      active: self.active,
      switchInProgress: !!self.switchInProgress
    });
    window.dispatchEvent(event);
  },

  _enter: function pdfPresentationModeEnter() {
    this.active = true;
    this._resetSwitchInProgress();
    this._notifyStateChange();

    // Ensure that the correct page is scrolled into view when entering
    // Presentation Mode, by waiting until fullscreen mode in enabled.
    // Note: This is only necessary in non-Mozilla browsers.
    setTimeout(function enterPresentationModeTimeout() {
      PDFViewerApplication.page = this.args.page;
      PDFViewerApplication.setScale('page-fit', true);
    }.bind(this), 0);

    window.addEventListener('mousemove', this._mouseMove, false);
    window.addEventListener('mousedown', this._mouseDown, false);
    window.addEventListener('keydown', this._keyDown, false);
    window.addEventListener('contextmenu', this._contextMenu, false);

    this._showControls();
    this.contextMenuOpen = false;
    this.container.setAttribute('contextmenu', 'viewerContextMenu');

    // Text selection is disabled in Presentation Mode, thus it's not possible
    // for the user to deselect text that is selected (e.g. with "Select all")
    // when entering Presentation Mode, hence we remove any active selection.
    window.getSelection().removeAllRanges();
  },

  _exit: function pdfPresentationModeExit() {
    var page = PDFViewerApplication.page;

    // Ensure that the correct page is scrolled into view when exiting
    // Presentation Mode, by waiting until fullscreen mode is disabled.
    // Note: This is only necessary in non-Mozilla browsers.
    setTimeout(function exitPresentationModeTimeout() {
      this.active = false;
      this._notifyStateChange();

      PDFViewerApplication.setScale(this.args.previousScale, true);
      PDFViewerApplication.page = page;
      this.args = null;
    }.bind(this), 0);

    window.removeEventListener('mousemove', this._mouseMove, false);
    window.removeEventListener('mousedown', this._mouseDown, false);
    window.removeEventListener('keydown', this._keyDown, false);
    window.removeEventListener('contextmenu', this._contextMenu, false);

    this._hideControls();
    this._clearMouseScrollState();
    this.container.removeAttribute('contextmenu');
    this.contextMenuOpen = false;

    if (this.pdfThumbnailViewer) {
      // Ensure that the thumbnail of the current page is visible
      // when exiting presentation mode.
      this.pdfThumbnailViewer.ensureThumbnailVisible(page);
    }
  },

  _showControls: function pdfPresentationModeShowControls() {
    if (this.controlsTimeout) {
      clearTimeout(this.controlsTimeout);
    } else {
      this.container.classList.add(SELECTOR);
    }
    this.controlsTimeout = setTimeout(function showControlsTimeout() {
      this.container.classList.remove(SELECTOR);
      delete this.controlsTimeout;
    }.bind(this), DELAY_BEFORE_HIDING_CONTROLS);
  },

  _hideControls: function pdfPresentationModeHideControls() {
    if (!this.controlsTimeout) {
      return;
    }
    this.container.classList.remove(SELECTOR);
    clearTimeout(this.controlsTimeout);
    delete this.controlsTimeout;
  },

  _mouseMove: function pdfPresentationModeMouseMove(evt) {
    PDFPresentationMode._showControls();
  },

  _mouseDown: function pdfPresentationModeMouseDown(evt) {
    var self = PDFPresentationMode;
    if (self.contextMenuOpen) {
      self.contextMenuOpen = false;
      evt.preventDefault();
      return;
    }

    if (evt.button === 0) {
      // Enable clicking of links in presentation mode. Please note:
      // Only links pointing to destinations in the current PDF document work.
      var isInternalLink = (evt.target.href &&
                            evt.target.classList.contains('internalLink'));
      if (!isInternalLink) {
        // Unless an internal link was clicked, advance one page.
        evt.preventDefault();
        PDFViewerApplication.page += (evt.shiftKey ? -1 : 1);
      }
    }
  },

  _keyDown: function pdfPresentationModeKeyDown(evt) {
    PDFPresentationMode._clearMouseScrollState();
  },

  _contextMenu: function pdfPresentationModeContextMenu(evt) {
    PDFPresentationMode.contextMenuOpen = true;
  },

  /**
   * This function flips the page in presentation mode if the user scrolls up
   * or down with large enough motion and prevents page flipping too often.
   * @param {number} mouseScrollDelta The delta value from the mouse event.
   */
  mouseScroll: function pdfPresentationModeMouseScroll(mouseScrollDelta) {
    if (!this.initialized) {
      return;
    }
    var MOUSE_SCROLL_COOLDOWN_TIME = 50;

    var currentTime = (new Date()).getTime();
    var storedTime = this.mouseScrollTimeStamp;

    // In case one page has already been flipped there is a cooldown time
    // which has to expire before next page can be scrolled on to.
    if (currentTime > storedTime &&
        currentTime - storedTime < MOUSE_SCROLL_COOLDOWN_TIME) {
      return;
    }

    // In case the user decides to scroll to the opposite direction than before
    // clear the accumulated delta.
    if ((this.mouseScrollDelta > 0 && mouseScrollDelta < 0) ||
        (this.mouseScrollDelta < 0 && mouseScrollDelta > 0)) {
      this._clearMouseScrollState();
    }

    this.mouseScrollDelta += mouseScrollDelta;

    var PAGE_FLIP_THRESHOLD = 120;
    if (Math.abs(this.mouseScrollDelta) >= PAGE_FLIP_THRESHOLD) {

      var PageFlipDirection = {
        UP: -1,
        DOWN: 1
      };

      // In presentation mode scroll one page at a time.
      var pageFlipDirection = (this.mouseScrollDelta > 0) ?
        PageFlipDirection.UP :
        PageFlipDirection.DOWN;
      this._clearMouseScrollState();
      var currentPage = PDFViewerApplication.page;

      // In case we are already on the first or the last page there is no need
      // to do anything.
      if ((currentPage === 1 && pageFlipDirection === PageFlipDirection.UP) ||
          (currentPage === PDFViewerApplication.pagesCount &&
           pageFlipDirection === PageFlipDirection.DOWN)) {
        return;
      }

      PDFViewerApplication.page += pageFlipDirection;
      this.mouseScrollTimeStamp = currentTime;
    }
  },

  /**
   * This function clears the member attributes used with mouse scrolling in
   * presentation mode.
   */
  _clearMouseScrollState: function pdfPresentationModeClearMouseScrollState() {
    this.mouseScrollTimeStamp = 0;
    this.mouseScrollDelta = 0;
  }
};
