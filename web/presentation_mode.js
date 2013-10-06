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
/* globals PDFView, scrollIntoView */

'use strict';

var DELAY_BEFORE_HIDING_CONTROLS = 3000; // in ms
var SELECTOR = 'presentationControls';

var PresentationMode = {
  active: false,
  args: null,

  initialize: function presentationModeInitialize(options) {
    this.container = options.container;
  },

  get isFullscreen() {
    return (document.fullscreenElement ||
            document.mozFullScreen ||
            document.webkitIsFullScreen ||
            document.msFullscreenElement);
  },

  request: function presentationModeRequest() {
    if (!PDFView.supportsFullscreen || this.isFullscreen) {
      return false;
    }

    if (this.container.requestFullscreen) {
      this.container.requestFullscreen();
    } else if (this.container.mozRequestFullScreen) {
      this.container.mozRequestFullScreen();
    } else if (this.container.webkitRequestFullScreen) {
      this.container.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT);
    } else if (this.container.msRequestFullscreen) {
      this.container.msRequestFullscreen();
    } else {
      return false;
    }

    this.args = {
      page: PDFView.page,
      previousScale: PDFView.currentScaleValue
    };

    return true;
  },

  enter: function presentationModeEnter() {
    this.active = true;

    PDFView.page = this.args.page;
    PDFView.parseScale('page-fit', true);

    window.addEventListener('mousemove', this.mouseMove, false);
    window.addEventListener('mousedown', this.mouseDown, false);

    this.showControls();
    this.container.setAttribute('contextmenu', 'viewerContextMenu');
  },

  exit: function presentationModeExit() {
    this.active = false;

    var page = PDFView.page;
    PDFView.parseScale(this.args.previousScale);
    PDFView.page = page;

    window.removeEventListener('mousemove', this.mouseMove, false);
    window.removeEventListener('mousedown', this.mouseDown, false);

    this.hideControls();
    this.args = null;
    PDFView.clearMouseScrollState();
    this.container.removeAttribute('contextmenu');

    // Ensure that the thumbnail of the current page is visible
    // when exiting presentation mode.
    scrollIntoView(document.getElementById('thumbnailContainer' + page));
  },

  showControls: function presentationModeShowControls() {
    if (this.controlsTimeout) {
      clearTimeout(this.controlsTimeout);
    } else {
      this.container.classList.add(SELECTOR);
    }
    this.controlsTimeout = setTimeout(function hideControlsTimeout() {
      this.container.classList.remove(SELECTOR);
      delete this.controlsTimeout;
    }.bind(this), DELAY_BEFORE_HIDING_CONTROLS);
  },

  hideControls: function presentationModeHideControls() {
    if (!this.controlsTimeout) {
      return;
    }
    this.container.classList.remove(SELECTOR);
    clearTimeout(this.controlsTimeout);
    delete this.controlsTimeout;
  },

  mouseMove: function presentationModeMouseMove(evt) {
    PresentationMode.showControls();
  },

  mouseDown: function presentationModeMouseDown(evt) {
    if (evt.button === 0) {
      // Enable clicking of links in presentation mode. Please note:
      // Only links pointing to destinations in the current PDF document work.
      var isInternalLink = (evt.target.href &&
                            evt.target.classList.contains('internalLink'));
      if (!isInternalLink) {
        // Unless an internal link was clicked, advance one page.
        evt.preventDefault();
        PDFView.page += (evt.shiftKey ? -1 : 1);
      }
    }
  }
};

(function presentationModeClosure() {
  function presentationModeChange(e) {
    if (PresentationMode.isFullscreen) {
      PresentationMode.enter();
    } else {
      PresentationMode.exit();
    }
  }

  window.addEventListener('fullscreenchange', presentationModeChange, false);
  window.addEventListener('mozfullscreenchange', presentationModeChange, false);
  window.addEventListener('webkitfullscreenchange', presentationModeChange,
                          false);
  window.addEventListener('MSFullscreenChange', presentationModeChange, false);
})();
