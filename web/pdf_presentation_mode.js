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

/**
 * @typedef {Object} PDFPresentationModeOptions
 * @property {HTMLDivElement} container - The container for the viewer element.
 * @property {HTMLDivElement} viewer - (optional) The viewer element.
 * @property {PDFThumbnailViewer} pdfThumbnailViewer - (optional) The thumbnail
 *   viewer.
 * @property {Array} contextMenuItems - (optional) The menuitems that are added
 *   to the context menu in Presentation Mode.
 */

var PDFPresentationMode = {
  initialized: false,
  active: false,
  args: null,
  contextMenuOpen: false,
  mouseScrollTimeStamp: 0,
  mouseScrollDelta: 0,

  /**
   * @param {PDFPresentationModeOptions} options
   */
  initialize: function pdfPresentationModeInitialize(options) {
    this.initialized = true;
    this.container = options.container;
    this.viewer = options.viewer || options.container.firstElementChild;
    this.pdfThumbnailViewer = options.pdfThumbnailViewer || null;
    var contextMenuItems = options.contextMenuItems || null;

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

  /**
   * Request the browser to enter fullscreen mode.
   * @returns {boolean} Indicating if the request was successful.
   */
  request: function pdfPresentationModeRequest() {
    if (!this.initialized || this.switchInProgress || this.active ||
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

  /**
   * Switches page when the user scrolls (using a scroll wheel or a touchpad)
   * with large enough motion, to prevent accidental page switches.
   * @param {number} delta - The delta value from the mouse event.
   */
  mouseScroll: function pdfPresentationModeMouseScroll(delta) {
    if (!this.initialized && !this.active) {
      return;
    }
    var MOUSE_SCROLL_COOLDOWN_TIME = 50;
    var PAGE_SWITCH_THRESHOLD = 120;
    var PageSwitchDirection = {
      UP: -1,
      DOWN: 1
    };

    var currentTime = (new Date()).getTime();
    var storedTime = this.mouseScrollTimeStamp;

    // If we've already switched page, avoid accidentally switching page again.
    if (currentTime > storedTime &&
        currentTime - storedTime < MOUSE_SCROLL_COOLDOWN_TIME) {
      return;
    }
    // If the user changes scroll direction, reset the accumulated scroll delta.
    if ((this.mouseScrollDelta > 0 && delta < 0) ||
        (this.mouseScrollDelta < 0 && delta > 0)) {
      this._resetMouseScrollState();
    }
    this.mouseScrollDelta += delta;

    if (Math.abs(this.mouseScrollDelta) >= PAGE_SWITCH_THRESHOLD) {
      var pageSwitchDirection = (this.mouseScrollDelta > 0) ?
        PageSwitchDirection.UP : PageSwitchDirection.DOWN;
      var page = PDFViewerApplication.page;
      this._resetMouseScrollState();

      // If we're already on the first/last page, we don't need to do anything.
      if ((page === 1 && pageSwitchDirection === PageSwitchDirection.UP) ||
          (page === PDFViewerApplication.pagesCount &&
           pageSwitchDirection === PageSwitchDirection.DOWN)) {
        return;
      }
      PDFViewerApplication.page = (page + pageSwitchDirection);
      this.mouseScrollTimeStamp = currentTime;
    }
  },

  get isFullscreen() {
    return !!(document.fullscreenElement ||
              document.mozFullScreen ||
              document.webkitIsFullScreen ||
              document.msFullscreenElement);
  },

  /**
   * @private
   */
  _fullscreenChange: function pdfPresentationModeFullscreenChange() {
    var self = PDFPresentationMode;
    if (self.isFullscreen) {
      self._enter();
    } else {
      self._exit();
    }
  },

  /**
   * @private
   */
  _notifyStateChange: function pdfPresentationModeNotifyStateChange() {
    var self = PDFPresentationMode;
    var event = document.createEvent('CustomEvent');
    event.initCustomEvent('presentationmodechanged', true, true, {
      active: self.active,
      switchInProgress: !!self.switchInProgress
    });
    window.dispatchEvent(event);
  },

  /**
   * Used to initialize a timeout when requesting Presentation Mode,
   * i.e. when the browser is requested to enter fullscreen mode.
   * This timeout is used to prevent the current page from being scrolled
   * partially, or completely, out of view when entering Presentation Mode.
   * NOTE: This issue seems limited to certain zoom levels (e.g. 'page-width').
   * @private
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

  /**
   * @private
   */
  _resetSwitchInProgress: function pdfPresentationMode_resetSwitchInProgress() {
    if (this.switchInProgress) {
      clearTimeout(this.switchInProgress);
      delete this.switchInProgress;
    }
  },

  /**
   * @private
   */
  _enter: function pdfPresentationModeEnter() {
    this.active = true;
    this._resetSwitchInProgress();
    this._notifyStateChange();

    // Ensure that the correct page is scrolled into view when entering
    // Presentation Mode, by waiting until fullscreen mode in enabled.
    setTimeout(function enterPresentationModeTimeout() {
      PDFViewerApplication.page = this.args.page;
      PDFViewerApplication.setScale('page-fit', true);
    }.bind(this), 0);

    window.addEventListener('mousemove', this._showControls, false);
    window.addEventListener('mousedown', this._mouseDown, false);
    window.addEventListener('keydown', this._resetMouseScrollState, false);
    window.addEventListener('contextmenu', this._contextMenu, false);

    this._showControls();
    this.contextMenuOpen = false;
    this.container.setAttribute('contextmenu', 'viewerContextMenu');

    // Text selection is disabled in Presentation Mode, thus it's not possible
    // for the user to deselect text that is selected (e.g. with "Select all")
    // when entering Presentation Mode, hence we remove any active selection.
    window.getSelection().removeAllRanges();
  },

  /**
   * @private
   */
  _exit: function pdfPresentationModeExit() {
    var page = PDFViewerApplication.page;

    // Ensure that the correct page is scrolled into view when exiting
    // Presentation Mode, by waiting until fullscreen mode is disabled.
    setTimeout(function exitPresentationModeTimeout() {
      this.active = false;
      this._notifyStateChange();

      PDFViewerApplication.setScale(this.args.previousScale, true);
      PDFViewerApplication.page = page;
      this.args = null;
    }.bind(this), 0);

    window.removeEventListener('mousemove', this._showControls, false);
    window.removeEventListener('mousedown', this._mouseDown, false);
    window.removeEventListener('keydown', this._resetMouseScrollState, false);
    window.removeEventListener('contextmenu', this._contextMenu, false);

    this._hideControls();
    this._resetMouseScrollState();
    this.container.removeAttribute('contextmenu');
    this.contextMenuOpen = false;

    if (this.pdfThumbnailViewer) {
      this.pdfThumbnailViewer.ensureThumbnailVisible(page);
    }
  },

  /**
   * @private
   */
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

  /**
   * @private
   */
  _contextMenu: function pdfPresentationModeContextMenu(evt) {
    PDFPresentationMode.contextMenuOpen = true;
  },

  /**
   * @private
   */
  _showControls: function pdfPresentationModeShowControls() {
    var self = PDFPresentationMode;
    if (self.controlsTimeout) {
      clearTimeout(self.controlsTimeout);
    } else {
      self.container.classList.add(SELECTOR);
    }
    self.controlsTimeout = setTimeout(function showControlsTimeout() {
      self.container.classList.remove(SELECTOR);
      delete self.controlsTimeout;
    }, DELAY_BEFORE_HIDING_CONTROLS);
  },

  /**
   * @private
   */
  _hideControls: function pdfPresentationModeHideControls() {
    var self = PDFPresentationMode;
    if (!self.controlsTimeout) {
      return;
    }
    clearTimeout(self.controlsTimeout);
    self.container.classList.remove(SELECTOR);
    delete self.controlsTimeout;
  },

  /**
   * Resets the properties used for tracking mouse scrolling events.
   * @private
   */
  _resetMouseScrollState: function pdfPresentationModeResetMouseScrollState() {
    var self = PDFPresentationMode;
    self.mouseScrollTimeStamp = 0;
    self.mouseScrollDelta = 0;
  }
};
