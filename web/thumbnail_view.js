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
/* globals PDFView, mozL10n, RenderingStates */

'use strict';

var ThumbnailView = function thumbnailView(container, id, defaultViewport) {
  var anchor = document.createElement('a');
  anchor.href = PDFView.getAnchorUrl('#page=' + id);
  anchor.title = mozL10n.get('thumb_page_title', {page: id}, 'Page {{page}}');
  anchor.onclick = function stopNavigation() {
    PDFView.page = id;
    return false;
  };

  this.pdfPage = undefined;
  this.viewport = defaultViewport;
  this.pdfPageRotate = defaultViewport.rotate;

  this.rotation = 0;
  this.pageWidth = this.viewport.width;
  this.pageHeight = this.viewport.height;
  this.pageRatio = this.pageWidth / this.pageHeight;
  this.id = id;

  this.canvasWidth = 98;
  this.canvasHeight = this.canvasWidth / this.pageWidth * this.pageHeight;
  this.scale = (this.canvasWidth / this.pageWidth);

  var div = this.el = document.createElement('div');
  div.id = 'thumbnailContainer' + id;
  div.className = 'thumbnail';

  if (id === 1) {
    // Highlight the thumbnail of the first page when no page number is
    // specified (or exists in cache) when the document is loaded.
    div.classList.add('selected');
  }

  var ring = document.createElement('div');
  ring.className = 'thumbnailSelectionRing';
  ring.style.width = this.canvasWidth + 'px';
  ring.style.height = this.canvasHeight + 'px';

  div.appendChild(ring);
  anchor.appendChild(div);
  container.appendChild(anchor);

  this.hasImage = false;
  this.renderingState = RenderingStates.INITIAL;

  this.setPdfPage = function thumbnailViewSetPdfPage(pdfPage) {
    this.pdfPage = pdfPage;
    this.pdfPageRotate = pdfPage.rotate;
    this.viewport = pdfPage.getViewport(1);
    this.update();
  };

  this.update = function thumbnailViewUpdate(rot) {
    if (!this.pdfPage) {
      return;
    }

    if (rot !== undefined) {
      this.rotation = rot;
    }

    var totalRotation = (this.rotation + this.pdfPage.rotate) % 360;
    this.viewport = this.viewport.clone({
      scale: 1,
      rotation: totalRotation
    });
    this.pageWidth = this.viewport.width;
    this.pageHeight = this.viewport.height;
    this.pageRatio = this.pageWidth / this.pageHeight;

    this.canvasHeight = this.canvasWidth / this.pageWidth * this.pageHeight;
    this.scale = (this.canvasWidth / this.pageWidth);

    div.removeAttribute('data-loaded');
    ring.textContent = '';
    ring.style.width = this.canvasWidth + 'px';
    ring.style.height = this.canvasHeight + 'px';

    this.hasImage = false;
    this.renderingState = RenderingStates.INITIAL;
    this.resume = null;
  };

  this.getPageDrawContext = function thumbnailViewGetPageDrawContext() {
    var canvas = document.createElement('canvas');
    canvas.id = 'thumbnail' + id;

    canvas.width = this.canvasWidth;
    canvas.height = this.canvasHeight;
    canvas.className = 'thumbnailImage';
    canvas.setAttribute('aria-label', mozL10n.get('thumb_page_canvas',
      {page: id}, 'Thumbnail of Page {{page}}'));

    div.setAttribute('data-loaded', true);

    ring.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    ctx.save();
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    ctx.restore();
    return ctx;
  };

  this.drawingRequired = function thumbnailViewDrawingRequired() {
    return !this.hasImage;
  };

  this.draw = function thumbnailViewDraw(callback) {
    if (!this.pdfPage) {
      var promise = PDFView.getPage(this.id);
      promise.then(function(pdfPage) {
        this.setPdfPage(pdfPage);
        this.draw(callback);
      }.bind(this));
      return;
    }

    if (this.renderingState !== RenderingStates.INITIAL) {
      console.error('Must be in new state before drawing');
    }

    this.renderingState = RenderingStates.RUNNING;
    if (this.hasImage) {
      callback();
      return;
    }

    var self = this;
    var ctx = this.getPageDrawContext();
    var drawViewport = this.viewport.clone({ scale: this.scale });
    var renderContext = {
      canvasContext: ctx,
      viewport: drawViewport,
      continueCallback: function(cont) {
        if (PDFView.highestPriorityPage !== 'thumbnail' + self.id) {
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
    this.pdfPage.render(renderContext).then(
      function pdfPageRenderCallback() {
        self.renderingState = RenderingStates.FINISHED;
        callback();
      },
      function pdfPageRenderError(error) {
        self.renderingState = RenderingStates.FINISHED;
        callback();
      }
    );
    this.hasImage = true;
  };

  this.setImage = function thumbnailViewSetImage(img) {
    if (this.hasImage || !img)
      return;
    this.renderingState = RenderingStates.FINISHED;
    var ctx = this.getPageDrawContext();
    ctx.drawImage(img, 0, 0, img.width, img.height,
                  0, 0, ctx.canvas.width, ctx.canvas.height);

    this.hasImage = true;
  };
};
