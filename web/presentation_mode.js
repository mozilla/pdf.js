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

var PresentationMode = {
  active: false,
  args: null,

  request: function presentationModeRequest() {
    if (!PDFView.supportsFullscreen) {
      return false;
    }
    var isPresentationMode = document.fullscreenElement ||
                             document.mozFullScreen ||
                             document.webkitIsFullScreen ||
                             document.msFullscreenElement;

    if (isPresentationMode) {
      return false;
    }

    var wrapper = document.getElementById('viewerContainer');
    if (document.documentElement.requestFullscreen) {
      wrapper.requestFullscreen();
    } else if (document.documentElement.mozRequestFullScreen) {
      wrapper.mozRequestFullScreen();
    } else if (document.documentElement.webkitRequestFullScreen) {
      wrapper.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT);
    } else if (document.documentElement.msRequestFullscreen) {
      wrapper.msRequestFullscreen();
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

    this.showControls();

    var viewer = document.getElementById('viewer');
    viewer.setAttribute('contextmenu', 'viewerContextMenu');
  },

  exit: function presentationModeExit() {
    this.active = false;

    var page = PDFView.page;
    PDFView.parseScale(this.args.previousScale);
    PDFView.page = page;

    this.hideControls();
    this.args = null;
    PDFView.clearMouseScrollState();

    var viewer = document.getElementById('viewer');
    viewer.removeAttribute('contextmenu');

    // Ensure that the thumbnail of the current page is visible
    // when exiting presentation mode.
    scrollIntoView(document.getElementById('thumbnailContainer' + page));
  },

  showControls: function presentationModeShowControls() {
    var DELAY_BEFORE_HIDING_CONTROLS = 3000;
    var wrapper = document.getElementById('viewerContainer');
    if (this.controlsTimeout) {
      clearTimeout(this.controlsTimeout);
    } else {
      wrapper.classList.add('presentationControls');
    }
    this.controlsTimeout = setTimeout(function hideControlsTimeout() {
      wrapper.classList.remove('presentationControls');
      delete this.controlsTimeout;
    }.bind(this), DELAY_BEFORE_HIDING_CONTROLS);
  },

  hideControls: function presentationModeHideControls() {
    if (!this.controlsTimeout) {
      return;
    }
    clearTimeout(this.controlsTimeout);
    delete this.controlsTimeout;

    var wrapper = document.getElementById('viewerContainer');
    wrapper.classList.remove('presentationControls');
  }
};

window.addEventListener('mousemove', function mousemove(evt) {
  if (PresentationMode.active) {
    PresentationMode.showControls();
  }
}, false);

window.addEventListener('mousedown', function mousedown(evt) {
  if (PresentationMode.active && evt.button === 0) {
    // Enable clicking of links in presentation mode.
    // Note: Only links that point to the currently loaded PDF document works.
    var targetHref = evt.target.href;
    var internalLink = targetHref && (targetHref.replace(/#.*$/, '') ===
                                      window.location.href.replace(/#.*$/, ''));
    if (!internalLink) {
      // Unless an internal link was clicked, advance a page in presentation
      // mode.
      evt.preventDefault();
      PDFView.page++;
    }
  }
}, false);

(function presentationModeClosure() {
  function presentationModeChange(e) {
    var isPresentationMode = document.fullscreenElement ||
                             document.mozFullScreen ||
                             document.webkitIsFullScreen ||
                             document.msFullscreenElement;

    if (isPresentationMode) {
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
