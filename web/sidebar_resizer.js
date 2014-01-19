/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2012 Mozilla Foundation
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
* http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
/* globals mozL10n */

'use strict';

var SidebarResizer = {
  initialize: function SidebarResizerInitialize(options) {
    this.mainContainer = options.mainContainer;
    this.sidebarContainer = options.sidebarContainer;
    this.sidebarContent = options.sidebarContent;
    this.sidebarResizer = options.sidebarResizer;
    this.outlineView = options.outlineView;
    this.minWidth = this.sidebarContent.offsetWidth;
    this.maxWidth = this.startWidth = this.startX = 0;
    this.direction = mozL10n.getDirection();

    if (this.direction === 'rtl') {
      this.startX = document.documentElement.clientWidth;
    }

    if (this.sidebarResizer) {
      this.sidebarResizer.addEventListener('mousedown',
        this.startDrag.bind(this));
    }
  },

  startDrag: function SidebarResizerStartDrag(e) {
    e.preventDefault();
    this.startX = e.clientX;
    this.startWidth = this.sidebarContent.offsetWidth;
    this.maxWidth = document.documentElement.clientWidth / 2;

    document.body.addEventListener('mousemove',
      SidebarResizer.dragging, false);
    document.body.addEventListener('mouseup',
      SidebarResizer.stopDrag, false);
  },

  dragging: function SidebarResizerDragging(e) {
    var targetWidth = 0;

    if (!document.body.classList.contains('sidebarResizing')) {
      document.body.classList.add('sidebarResizing');
    }

    if (SidebarResizer.direction === 'rtl') {
      targetWidth = (SidebarResizer.startWidth - e.clientX +
                     SidebarResizer.startX);

      SidebarResizer.sidebarResizer.style.left =
        -SidebarResizer.sidebarResizer.offsetWidth + 'px';

      if (targetWidth <= SidebarResizer.maxWidth &&
          targetWidth >= SidebarResizer.minWidth) {
        SidebarResizer.mainContainer.style.right = targetWidth + 'px';
        SidebarResizer.sidebarContainer.style.width = targetWidth + 'px';
        SidebarResizer.outlineView.style.width = targetWidth + 'px';
        SidebarResizer.sidebarContent.style.width = targetWidth + 'px';
      }
    } else {
      targetWidth = (SidebarResizer.startWidth + e.clientX -
                     SidebarResizer.startX);

      SidebarResizer.sidebarResizer.style.right =
        -SidebarResizer.sidebarResizer.offsetWidth + 'px';

      if (targetWidth <= SidebarResizer.maxWidth &&
          targetWidth >= SidebarResizer.minWidth) {
        SidebarResizer.mainContainer.style.left = targetWidth + 'px';
        SidebarResizer.sidebarContainer.style.width = targetWidth + 'px';
        SidebarResizer.outlineView.style.width = targetWidth + 'px';
        SidebarResizer.sidebarContent.style.width = targetWidth + 'px';
      }
    }
  },

  stopDrag: function SidebarResizerStopDrag() {
    document.body.classList.remove('sidebarResizing');
    document.body.removeEventListener('mousemove',
      SidebarResizer.dragging, false);
    document.body.removeEventListener('mouseup',
      SidebarResizer.stopDrag, false);

    var event = document.createEvent('UIEvents');
    event.initUIEvent('resize', false, false, window, 0);
    window.dispatchEvent(event);
  },

  revert: function SidebarResizerRevert() {
    if (this.direction === 'rtl') {
      SidebarResizer.mainContainer.style.removeProperty('right');
    } else {
      SidebarResizer.mainContainer.style.removeProperty('left');
    }
    SidebarResizer.sidebarContainer.style.width =
      SidebarResizer.sidebarContent.style.width =
      SidebarResizer.outlineView.style.width = SidebarResizer.minWidth + 'px';
  }
};
