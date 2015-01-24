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
/* globals mozL10n, RenderingStates, Promise */

'use strict';

var THUMBNAIL_CANVAS_BORDER_WIDTH = 1;

/**
 * @typedef {Object} PDFThumbnailViewOptions
 * @property {HTMLDivElement} container - The viewer element.
 * @property {number} id - The thumbnail's unique ID (normally its number).
 * @property {PageViewport} defaultViewport - The page viewport.
 * @property {IPDFLinkService} linkService - The navigation/linking service.
 * @property {PDFRenderingQueue} renderingQueue - The rendering queue object.
 */

/**
 * @class
 * @implements {IRenderableView}
 */
var PDFThumbnailView = (function PDFThumbnailViewClosure() {
  function getTempCanvas(width, height) {
    var tempCanvas = PDFThumbnailView.tempImageCache;
    if (!tempCanvas) {
      tempCanvas = document.createElement('canvas');
      PDFThumbnailView.tempImageCache = tempCanvas;
    }
    tempCanvas.width = width;
    tempCanvas.height = height;

    // Since this is a temporary canvas, we need to fill
    // the canvas with a white background ourselves.
    // |getPageDrawContext| uses CSS rules for this.
    var ctx = tempCanvas.getContext('2d');
    ctx.save();
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    return tempCanvas;
  }

  /**
   * @constructs PDFThumbnailView
   * @param {PDFThumbnailViewOptions} options
   */
  function PDFThumbnailView(options) {
    var container = options.container;
    var id = options.id;
    var defaultViewport = options.defaultViewport;
    var linkService = options.linkService;
    var renderingQueue = options.renderingQueue;

    var anchor = document.createElement('a');
    anchor.href = linkService.getAnchorUrl('#page=' + id);
    anchor.title = mozL10n.get('thumb_page_title', {page: id}, 'Page {{page}}');
    anchor.onclick = function stopNavigation() {
      linkService.page = id;
      return false;
    };

    this.pdfPage = undefined;
    this.viewport = defaultViewport;
    this.pdfPageRotate = defaultViewport.rotation;

    this.rotation = 0;
    this.pageWidth = this.viewport.width;
    this.pageHeight = this.viewport.height;
    this.pageRatio = this.pageWidth / this.pageHeight;
    this.id = id;
    this.renderingId = 'thumbnail' + id;

    this.canvasWidth = 98;
    this.canvasHeight = (this.canvasWidth / this.pageRatio) | 0;
    this.scale = this.canvasWidth / this.pageWidth;

    var div = this.el = document.createElement('div');
    div.id = 'thumbnailContainer' + id;
    div.className = 'thumbnail';
    this.div = div;

    if (id === 1) {
      // Highlight the thumbnail of the first page when no page number is
      // specified (or exists in cache) when the document is loaded.
      div.classList.add('selected');
    }

    var ring = document.createElement('div');
    ring.className = 'thumbnailSelectionRing';
    ring.style.width =
      this.canvasWidth + 2 * THUMBNAIL_CANVAS_BORDER_WIDTH + 'px';
    ring.style.height =
      this.canvasHeight + 2 * THUMBNAIL_CANVAS_BORDER_WIDTH + 'px';
    this.ring = ring;

    div.appendChild(ring);
    anchor.appendChild(div);
    container.appendChild(anchor);

    this.hasImage = false;
    this.renderingState = RenderingStates.INITIAL;
    this.renderingQueue = renderingQueue;
  }

  PDFThumbnailView.prototype = {
    setPdfPage: function PDFThumbnailView_setPdfPage(pdfPage) {
      this.pdfPage = pdfPage;
      this.pdfPageRotate = pdfPage.rotate;
      var totalRotation = (this.rotation + this.pdfPageRotate) % 360;
      this.viewport = pdfPage.getViewport(1, totalRotation);
      this.update();
    },

    update: function PDFThumbnailView_update(rotation) {
      if (rotation !== undefined) {
        this.rotation = rotation;
      }
      var totalRotation = (this.rotation + this.pdfPageRotate) % 360;
      this.viewport = this.viewport.clone({
        scale: 1,
        rotation: totalRotation
      });
      this.pageWidth = this.viewport.width;
      this.pageHeight = this.viewport.height;
      this.pageRatio = this.pageWidth / this.pageHeight;

      this.canvasHeight = (this.canvasWidth / this.pageRatio) | 0;
      this.scale = (this.canvasWidth / this.pageWidth);

      this.div.removeAttribute('data-loaded');
      this.ring.textContent = '';
      this.ring.style.width =
        this.canvasWidth + 2 * THUMBNAIL_CANVAS_BORDER_WIDTH + 'px';
      this.ring.style.height =
        this.canvasHeight + 2 * THUMBNAIL_CANVAS_BORDER_WIDTH + 'px';

      this.hasImage = false;
      this.renderingState = RenderingStates.INITIAL;
      this.resume = null;
    },

    getPageDrawContext: function PDFThumbnailView_getPageDrawContext() {
      var canvas = document.createElement('canvas');
      canvas.id = 'thumbnail' + this.id;

      canvas.width = this.canvasWidth;
      canvas.height = this.canvasHeight;
      canvas.className = 'thumbnailImage';
      canvas.setAttribute('aria-label', mozL10n.get('thumb_page_canvas',
        {page: this.id}, 'Thumbnail of Page {{page}}'));

      this.div.setAttribute('data-loaded', true);

      this.ring.appendChild(canvas);

      return canvas.getContext('2d');
    },

    drawingRequired: function PDFThumbnailView_drawingRequired() {
      return !this.hasImage;
    },

    draw: function PDFThumbnailView_draw() {
      if (this.renderingState !== RenderingStates.INITIAL) {
        console.error('Must be in new state before drawing');
      }

      this.renderingState = RenderingStates.RUNNING;
      if (this.hasImage) {
        return Promise.resolve(undefined);
      }

      var resolveRenderPromise, rejectRenderPromise;
      var promise = new Promise(function (resolve, reject) {
          resolveRenderPromise = resolve;
          rejectRenderPromise = reject;
        });

      var self = this;
      var ctx = this.getPageDrawContext();
      var drawViewport = this.viewport.clone({ scale: this.scale });
      var renderContext = {
        canvasContext: ctx,
        viewport: drawViewport,
        continueCallback: function(cont) {
          if (!self.renderingQueue.isHighestPriority(self)) {
            self.renderingState = RenderingStates.PAUSED;
            self.resume = function() {
              self.renderingState = RenderingStates.RUNNING;
              cont();
            };
            return;
          }
          cont();
        }
      };
      this.pdfPage.render(renderContext).promise.then(
        function pdfPageRenderCallback() {
          self.renderingState = RenderingStates.FINISHED;
          resolveRenderPromise(undefined);
        },
        function pdfPageRenderError(error) {
          self.renderingState = RenderingStates.FINISHED;
          rejectRenderPromise(error);
        }
      );
      this.hasImage = true;
      return promise;
    },

    setImage: function PDFThumbnailView_setImage(pageView) {
      var img = pageView.canvas;
      if (this.hasImage || !img) {
        return;
      }
      if (!this.pdfPage) {
        this.setPdfPage(pageView.pdfPage);
      }
      this.renderingState = RenderingStates.FINISHED;
      var ctx = this.getPageDrawContext();
      var canvas = ctx.canvas;

      if (img.width <= 2 * canvas.width) {
        ctx.drawImage(img, 0, 0, img.width, img.height,
                      0, 0, canvas.width, canvas.height);
      } else {
        // drawImage does an awful job of rescaling the image,
        // doing it gradually.
        var MAX_NUM_SCALING_STEPS = 3;
        var reducedWidth = canvas.width << MAX_NUM_SCALING_STEPS;
        var reducedHeight = canvas.height << MAX_NUM_SCALING_STEPS;
        var reducedImage = getTempCanvas(reducedWidth, reducedHeight);
        var reducedImageCtx = reducedImage.getContext('2d');

        while (reducedWidth > img.width || reducedHeight > img.height) {
          reducedWidth >>= 1;
          reducedHeight >>= 1;
        }
        reducedImageCtx.drawImage(img, 0, 0, img.width, img.height,
                                  0, 0, reducedWidth, reducedHeight);
        while (reducedWidth > 2 * canvas.width) {
          reducedImageCtx.drawImage(reducedImage,
                                    0, 0, reducedWidth, reducedHeight,
                                    0, 0,
                                    reducedWidth >> 1, reducedHeight >> 1);
          reducedWidth >>= 1;
          reducedHeight >>= 1;
        }
        ctx.drawImage(reducedImage, 0, 0, reducedWidth, reducedHeight,
                      0, 0, canvas.width, canvas.height);
      }

      this.hasImage = true;
    }
  };

  return PDFThumbnailView;
})();

PDFThumbnailView.tempImageCache = null;
