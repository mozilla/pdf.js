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
/* globals PDFView, Promise, mozL10n, OverlayManager */

'use strict';

var Help = {
  overlayName: null,
  lastSlide: 10,
  highlightOffset: 2, // px

  initialize: function helpInitialize(options) {
    this.overlayName = options.overlayName;
    this.startButton = options.startButton;
    this.nextButton = options.nextButton;
    this.currentSlide = 0;
    this.uiElements = [];
    
    this.overlay = document.getElementById(this.overlayName);
    this.highlight = document.createElement('div');
    this.highlight.classList.add('helpUIHighlight');

    // Bind the event listener for the buttons.
    if (options.closeButton) {
      options.closeButton.addEventListener('click', this.close.bind(this));
    }
    if (this.startButton) {
      this.startButton.addEventListener('click', this.next.bind(this));
    }
    if (this.nextButton) {
      this.nextButton.addEventListener('click', this.next.bind(this));
    }

    OverlayManager.register(this.overlayName, this.close.bind(this));
  },

  open: function helpOpen() {
    this.currentSlide = 0;
    this.initButtons();
    this.updateDisplay();
    if (this.uiElements.length === 0) {
      this.initUIElements();
    }
    OverlayManager.open(this.overlayName).then(function () {
      this.highlightUI();
    }.bind(this));
  },

  close: function helpClose() {
    this.unHighlightUI();
    OverlayManager.close(this.overlayName);
  },

  next: function helpNext() {
    this.unHighlightUI();
    this.currentSlide = this.getNextSlide();
    this.updateButtons(this.currentSlide === this.lastSlide);
    this.updateDisplay();
    this.highlightUI();
  },

  initButtons: function helpInitButtons() {
    if (this.startButton) {
      this.startButton.removeAttribute('hidden', true);
    }
    if (this.nextButton) {
      this.nextButton.setAttribute('hidden', true);
    }
  },

  updateButtons: function helpInitButtons(last) {
    if (this.startButton) {
      this.startButton.setAttribute('hidden', true);
    }
    if (this.nextButton) {
      if (!last) {
        this.nextButton.removeAttribute('hidden', true);
      } else {
        this.nextButton.setAttribute('hidden', true);
      }
    }
  },

  getNextSlide: function helpGetNextSlide() {
    var nextSlide = this.currentSlide;
    do {
      nextSlide++;
    } while (!this.isAvailable(this.uiElements[nextSlide]) &&
              nextSlide !== this.lastSlide);
    return nextSlide;
  },

  updateDisplay: function helpUpdateDisplay() {
    for (var i = 0; i <= this.lastSlide; ++i) {
      var slide = document.getElementById('help_' + i);
      if (slide) {
        if (i === this.currentSlide) {
          slide.removeAttribute('hidden', true);
        } else {
          slide.setAttribute('hidden', true);
        }
      }
    }
  },

  initUIElements: function helpinitUIElements() {
    // 0: Start tour
    this.uiElements.push(null);
    // 1: Left sidebar
    this.uiElements.push(document.getElementById('sidebarToggle'));
    // 2: Find in document
    this.uiElements.push(document.getElementById('viewFind'));
    // 3: Navigation
    this.uiElements.push([
      document.getElementById('previous'),
      document.getElementById('next'),
      document.getElementById('pageNumber')
    ]);
    // 4: Zoom
    this.uiElements.push([
      document.getElementById('zoomOut'),
      document.getElementById('zoomIn'),
      document.getElementById('scaleSelect')
    ]);
    // 5: Presentation mode
    this.uiElements.push([
      document.getElementById('presentationMode'),
      document.getElementById('secondaryPresentationMode')
    ]);
    // 6: Open
    this.uiElements.push([
      document.getElementById('openFile'),
      document.getElementById('secondaryOpenFile')
    ]);
    // 7: Print
    this.uiElements.push([
      document.getElementById('print'),
      document.getElementById('secondaryPrint')
    ]);
    // 8: Download
    this.uiElements.push([
      document.getElementById('download'),
      document.getElementById('secondaryDownload')
    ]);
    // 9: Current view
    this.uiElements.push([
      document.getElementById('viewBookmark'),
      document.getElementById('secondaryViewBookmark')
    ]);
    // 10: Menu
    this.uiElements.push(document.getElementById('secondaryToolbarToggle'));
  },

  highlightUI: function helpHighlightUI() {
    function openTool(button) {
      if (button && !button.classList.contains('toggled')) {
        button.click();
      }
    }
    var showHighlight = function (left, top, width, height) {
      this.highlight.style.left = (left - this.highlightOffset) + 'px';
      this.highlight.style.top = (top - this.highlightOffset) + 'px';
      this.highlight.style.width = (width + 2 * this.highlightOffset) + 'px';
      this.highlight.style.height = (height + 2 * this.highlightOffset) + 'px';
      this.highlight.style.borderRadius =
        ((height + 2 * this.highlightOffset) / 2) + 'px';
      this.overlay.appendChild(this.highlight);
    }.bind(this);
    var rect1, rect2;
    switch (this.currentSlide) {
    case 2:
      if (this.uiElements[2] && this.isAvailable(this.uiElements[2])) {
        rect1 = this.uiElements[2].getBoundingClientRect();
        if (rect1) {
          openTool(this.uiElements[2]);
          showHighlight(rect1.left, rect1.top, rect1.width, rect1.height);
        }
      }
      break;
    case 3:
      if (this.uiElements[3][0] && this.isAvailable(this.uiElements[3][0]) &&
          this.uiElements[3][2] && this.isAvailable(this.uiElements[3][2])) {
        rect1 = this.uiElements[3][0].getBoundingClientRect();
        rect2 = this.uiElements[3][2].getBoundingClientRect();
        if (rect1 && rect2) {
          showHighlight(rect1.left, rect1.top,
                        rect2.left - rect1.left + rect2.width, rect1.height);
        }
      }
      break;
    case 4:
      if (this.uiElements[4][0] && this.isAvailable(this.uiElements[4][0])) {
        rect1 = this.uiElements[4][0].getBoundingClientRect();
      }
      if (this.uiElements[4][2] && this.isAvailable(this.uiElements[4][2])) {
        rect2 = this.uiElements[4][2].getBoundingClientRect();
      } else if (this.uiElements[4][1] &&
                 this.isAvailable(this.uiElements[4][1])) {
        rect2 = this.uiElements[4][1].getBoundingClientRect();
      }
      if (rect1 && rect2) {
        showHighlight(rect1.left, rect1.top,
                      rect2.left - rect1.left + rect2.width, rect1.height);
      }
      break;
    case 5:
    case 6:
    case 7:
    case 8:
    case 9:
      // Open the menu if the primary button is not visible
      if (this.uiElements[this.currentSlide][0] &&
          this.isAvailable(this.uiElements[this.currentSlide][0])) {
        rect1 = this.uiElements[this.currentSlide][0].getBoundingClientRect();
        if (rect1) {
          showHighlight(rect1.left, rect1.top, rect1.width, rect1.height);
        }
      } else {
        openTool(this.uiElements[10]);
        if (this.uiElements[this.currentSlide][1] &&
            this.isAvailable(this.uiElements[this.currentSlide][1])) {
          rect1 = this.uiElements[this.currentSlide][1].getBoundingClientRect();
          if (rect1) {
            showHighlight(rect1.left, rect1.top, rect1.width, rect1.height);
          }
        }
      }
      break;
    case 10:
      // Open the menu
      openTool(this.uiElements[10]);
      /* falls through */
    case 1:
      if (this.uiElements[this.currentSlide] &&
          this.isAvailable(this.uiElements[this.currentSlide])) {
        rect1 = this.uiElements[this.currentSlide].getBoundingClientRect();
        if (rect1) {
          showHighlight(rect1.left, rect1.top, rect1.width, rect1.height);
        }
      }
      break;
    default:
      break;
    }
  },

  unHighlightUI: function helpUnHighlightUI() {
    function closeTool(button) {
      if (button && button.classList.contains('toggled')) {
        button.click();
      }
    }
    // Hide highlight
    if (this.highlight.parentNode === this.overlay) {
      this.overlay.removeChild(this.highlight);
    }
    switch (this.currentSlide) {
    case 2:
      closeTool(this.uiElements[2]);
      break;
    case 5:
    case 6:
    case 7:
    case 8:
    case 9:
      // Close the menu if the primary button is not visible
      if (!this.isAvailable(this.uiElements[this.currentSlide][0])) {
        closeTool(this.uiElements[10]);
      }
      break;
    case 10:
      // Close the menu
      closeTool(this.uiElements[10]);
      break;
    default:
      break;
    }
  },

  isAvailable: function helpIsAvailable(element) {
    if (!element) {
      return false;
    }
    function isElementAvailable(el, onlyVisible) {
      return (el &&
              (el.offsetParent !== null ||
                (!onlyVisible && !el.hasAttribute('hidden') &&
                  !el.classList.contains('hidden'))));
    }
    if (element instanceof Array) {
      return element.some(function (el) {
        return isElementAvailable(el, false);
      });
    } else {
      return isElementAvailable(element, true);
    }
  }
};
