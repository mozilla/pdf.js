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
/* globals PDFView, Hammer, MAX_SCALE, MIN_SCALE */

//#include ../external/hammer.js/hammer.js

'use strict';

var PINCH_TO_ZOOM_TIMEOUT = 150;
var PINCH_TO_ZOOM_SENSITIVITY = 0.5;

var TouchEvents = {
  initialize: function touchEventsInitialize(options) {
    this.container = options.container;
    this.pinchToZoom = options.pinchToZoom;
    this.pinchToZoomTimeout = null;

    if (this.pinchToZoom) {
      this.handlePinchToZoom();
    }
  },

  handlePinchToZoom: function touchEventsHandlePinchToZoom() {
    var listener = new Hammer(this.container, {
      transform_always_block: true
    });

    listener.on('touch drag transform', function(e) {
      if (!PDFView.isPresentationMode && e.type === 'transform') {
        if (this.pinchToZoomTimeout) {
          clearTimeout(this.pinchToZoomTimeout);
        }
        this.pinchToZoomTimeout = setTimeout(function() {
          var newScale = PDFView.currentScale * e.gesture.scale *
                         PINCH_TO_ZOOM_SENSITIVITY;
          var roundedScale = Math.floor(newScale * 100) / 100;
          if (roundedScale > MAX_SCALE) {
            roundedScale = MAX_SCALE;
          } else if (newScale < MIN_SCALE) {
            roundedScale = MIN_SCALE;
          }
          PDFView.parseScale(roundedScale);
        }, PINCH_TO_ZOOM_TIMEOUT);
      }
    });
  }
};
