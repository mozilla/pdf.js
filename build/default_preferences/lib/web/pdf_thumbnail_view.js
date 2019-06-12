"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFThumbnailView = void 0;

var _pdf = require("../pdf");

var _ui_utils = require("./ui_utils");

var _pdf_rendering_queue = require("./pdf_rendering_queue");

const MAX_NUM_SCALING_STEPS = 3;
const THUMBNAIL_CANVAS_BORDER_WIDTH = 1;
const THUMBNAIL_WIDTH = 98;

const TempImageFactory = function TempImageFactoryClosure() {
  let tempCanvasCache = null;
  return {
    getCanvas(width, height) {
      let tempCanvas = tempCanvasCache;

      if (!tempCanvas) {
        tempCanvas = document.createElement('canvas');
        tempCanvasCache = tempCanvas;
      }

      tempCanvas.width = width;
      tempCanvas.height = height;
      tempCanvas.mozOpaque = true;
      let ctx = tempCanvas.getContext('2d', {
        alpha: false
      });
      ctx.save();
      ctx.fillStyle = 'rgb(255, 255, 255)';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
      return tempCanvas;
    },

    destroyCanvas() {
      let tempCanvas = tempCanvasCache;

      if (tempCanvas) {
        tempCanvas.width = 0;
        tempCanvas.height = 0;
      }

      tempCanvasCache = null;
    }

  };
}();

class PDFThumbnailView {
  constructor({
    container,
    id,
    defaultViewport,
    linkService,
    renderingQueue,
    disableCanvasToImageConversion = false,
    l10n = _ui_utils.NullL10n
  }) {
    this.id = id;
    this.renderingId = 'thumbnail' + id;
    this.pageLabel = null;
    this.pdfPage = null;
    this.rotation = 0;
    this.viewport = defaultViewport;
    this.pdfPageRotate = defaultViewport.rotation;
    this.linkService = linkService;
    this.renderingQueue = renderingQueue;
    this.renderTask = null;
    this.renderingState = _pdf_rendering_queue.RenderingStates.INITIAL;
    this.resume = null;
    this.disableCanvasToImageConversion = disableCanvasToImageConversion;
    this.pageWidth = this.viewport.width;
    this.pageHeight = this.viewport.height;
    this.pageRatio = this.pageWidth / this.pageHeight;
    this.canvasWidth = THUMBNAIL_WIDTH;
    this.canvasHeight = this.canvasWidth / this.pageRatio | 0;
    this.scale = this.canvasWidth / this.pageWidth;
    this.l10n = l10n;
    let anchor = document.createElement('a');
    anchor.href = linkService.getAnchorUrl('#page=' + id);
    this.l10n.get('thumb_page_title', {
      page: id
    }, 'Page {{page}}').then(msg => {
      anchor.title = msg;
    });

    anchor.onclick = function () {
      linkService.page = id;
      return false;
    };

    this.anchor = anchor;
    let div = document.createElement('div');
    div.className = 'thumbnail';
    div.setAttribute('data-page-number', this.id);
    this.div = div;
    let ring = document.createElement('div');
    ring.className = 'thumbnailSelectionRing';
    let borderAdjustment = 2 * THUMBNAIL_CANVAS_BORDER_WIDTH;
    ring.style.width = this.canvasWidth + borderAdjustment + 'px';
    ring.style.height = this.canvasHeight + borderAdjustment + 'px';
    this.ring = ring;
    div.appendChild(ring);
    anchor.appendChild(div);
    container.appendChild(anchor);
  }

  setPdfPage(pdfPage) {
    this.pdfPage = pdfPage;
    this.pdfPageRotate = pdfPage.rotate;
    let totalRotation = (this.rotation + this.pdfPageRotate) % 360;
    this.viewport = pdfPage.getViewport({
      scale: 1,
      rotation: totalRotation
    });
    this.reset();
  }

  reset() {
    this.cancelRendering();
    this.renderingState = _pdf_rendering_queue.RenderingStates.INITIAL;
    this.pageWidth = this.viewport.width;
    this.pageHeight = this.viewport.height;
    this.pageRatio = this.pageWidth / this.pageHeight;
    this.canvasHeight = this.canvasWidth / this.pageRatio | 0;
    this.scale = this.canvasWidth / this.pageWidth;
    this.div.removeAttribute('data-loaded');
    let ring = this.ring;
    let childNodes = ring.childNodes;

    for (let i = childNodes.length - 1; i >= 0; i--) {
      ring.removeChild(childNodes[i]);
    }

    let borderAdjustment = 2 * THUMBNAIL_CANVAS_BORDER_WIDTH;
    ring.style.width = this.canvasWidth + borderAdjustment + 'px';
    ring.style.height = this.canvasHeight + borderAdjustment + 'px';

    if (this.canvas) {
      this.canvas.width = 0;
      this.canvas.height = 0;
      delete this.canvas;
    }

    if (this.image) {
      this.image.removeAttribute('src');
      delete this.image;
    }
  }

  update(rotation) {
    if (typeof rotation !== 'undefined') {
      this.rotation = rotation;
    }

    let totalRotation = (this.rotation + this.pdfPageRotate) % 360;
    this.viewport = this.viewport.clone({
      scale: 1,
      rotation: totalRotation
    });
    this.reset();
  }

  cancelRendering() {
    if (this.renderTask) {
      this.renderTask.cancel();
      this.renderTask = null;
    }

    this.resume = null;
  }

  _getPageDrawContext(noCtxScale = false) {
    let canvas = document.createElement('canvas');
    this.canvas = canvas;
    canvas.mozOpaque = true;
    let ctx = canvas.getContext('2d', {
      alpha: false
    });
    let outputScale = (0, _ui_utils.getOutputScale)(ctx);
    canvas.width = this.canvasWidth * outputScale.sx | 0;
    canvas.height = this.canvasHeight * outputScale.sy | 0;
    canvas.style.width = this.canvasWidth + 'px';
    canvas.style.height = this.canvasHeight + 'px';

    if (!noCtxScale && outputScale.scaled) {
      ctx.scale(outputScale.sx, outputScale.sy);
    }

    return ctx;
  }

  _convertCanvasToImage() {
    if (!this.canvas) {
      return;
    }

    if (this.renderingState !== _pdf_rendering_queue.RenderingStates.FINISHED) {
      return;
    }

    let id = this.renderingId;
    let className = 'thumbnailImage';

    if (this.disableCanvasToImageConversion) {
      this.canvas.id = id;
      this.canvas.className = className;
      this.l10n.get('thumb_page_canvas', {
        page: this.pageId
      }, 'Thumbnail of Page {{page}}').then(msg => {
        this.canvas.setAttribute('aria-label', msg);
      });
      this.div.setAttribute('data-loaded', true);
      this.ring.appendChild(this.canvas);
      return;
    }

    let image = document.createElement('img');
    image.id = id;
    image.className = className;
    this.l10n.get('thumb_page_canvas', {
      page: this.pageId
    }, 'Thumbnail of Page {{page}}').then(msg => {
      image.setAttribute('aria-label', msg);
    });
    image.style.width = this.canvasWidth + 'px';
    image.style.height = this.canvasHeight + 'px';
    image.src = this.canvas.toDataURL();
    this.image = image;
    this.div.setAttribute('data-loaded', true);
    this.ring.appendChild(image);
    this.canvas.width = 0;
    this.canvas.height = 0;
    delete this.canvas;
  }

  draw() {
    if (this.renderingState !== _pdf_rendering_queue.RenderingStates.INITIAL) {
      console.error('Must be in new state before drawing');
      return Promise.resolve(undefined);
    }

    this.renderingState = _pdf_rendering_queue.RenderingStates.RUNNING;
    let renderCapability = (0, _pdf.createPromiseCapability)();

    let finishRenderTask = error => {
      if (renderTask === this.renderTask) {
        this.renderTask = null;
      }

      if (error instanceof _pdf.RenderingCancelledException) {
        renderCapability.resolve(undefined);
        return;
      }

      this.renderingState = _pdf_rendering_queue.RenderingStates.FINISHED;

      this._convertCanvasToImage();

      if (!error) {
        renderCapability.resolve(undefined);
      } else {
        renderCapability.reject(error);
      }
    };

    let ctx = this._getPageDrawContext();

    let drawViewport = this.viewport.clone({
      scale: this.scale
    });

    let renderContinueCallback = cont => {
      if (!this.renderingQueue.isHighestPriority(this)) {
        this.renderingState = _pdf_rendering_queue.RenderingStates.PAUSED;

        this.resume = () => {
          this.renderingState = _pdf_rendering_queue.RenderingStates.RUNNING;
          cont();
        };

        return;
      }

      cont();
    };

    let renderContext = {
      canvasContext: ctx,
      viewport: drawViewport
    };
    let renderTask = this.renderTask = this.pdfPage.render(renderContext);
    renderTask.onContinue = renderContinueCallback;
    renderTask.promise.then(function () {
      finishRenderTask(null);
    }, function (error) {
      finishRenderTask(error);
    });
    return renderCapability.promise;
  }

  setImage(pageView) {
    if (this.renderingState !== _pdf_rendering_queue.RenderingStates.INITIAL) {
      return;
    }

    let img = pageView.canvas;

    if (!img) {
      return;
    }

    if (!this.pdfPage) {
      this.setPdfPage(pageView.pdfPage);
    }

    this.renderingState = _pdf_rendering_queue.RenderingStates.FINISHED;

    let ctx = this._getPageDrawContext(true);

    let canvas = ctx.canvas;

    if (img.width <= 2 * canvas.width) {
      ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, canvas.width, canvas.height);

      this._convertCanvasToImage();

      return;
    }

    let reducedWidth = canvas.width << MAX_NUM_SCALING_STEPS;
    let reducedHeight = canvas.height << MAX_NUM_SCALING_STEPS;
    let reducedImage = TempImageFactory.getCanvas(reducedWidth, reducedHeight);
    let reducedImageCtx = reducedImage.getContext('2d');

    while (reducedWidth > img.width || reducedHeight > img.height) {
      reducedWidth >>= 1;
      reducedHeight >>= 1;
    }

    reducedImageCtx.drawImage(img, 0, 0, img.width, img.height, 0, 0, reducedWidth, reducedHeight);

    while (reducedWidth > 2 * canvas.width) {
      reducedImageCtx.drawImage(reducedImage, 0, 0, reducedWidth, reducedHeight, 0, 0, reducedWidth >> 1, reducedHeight >> 1);
      reducedWidth >>= 1;
      reducedHeight >>= 1;
    }

    ctx.drawImage(reducedImage, 0, 0, reducedWidth, reducedHeight, 0, 0, canvas.width, canvas.height);

    this._convertCanvasToImage();
  }

  get pageId() {
    return this.pageLabel !== null ? this.pageLabel : this.id;
  }

  setPageLabel(label) {
    this.pageLabel = typeof label === 'string' ? label : null;
    this.l10n.get('thumb_page_title', {
      page: this.pageId
    }, 'Page {{page}}').then(msg => {
      this.anchor.title = msg;
    });

    if (this.renderingState !== _pdf_rendering_queue.RenderingStates.FINISHED) {
      return;
    }

    this.l10n.get('thumb_page_canvas', {
      page: this.pageId
    }, 'Thumbnail of Page {{page}}').then(ariaLabel => {
      if (this.image) {
        this.image.setAttribute('aria-label', ariaLabel);
      } else if (this.disableCanvasToImageConversion && this.canvas) {
        this.canvas.setAttribute('aria-label', ariaLabel);
      }
    });
  }

  static cleanup() {
    TempImageFactory.destroyCanvas();
  }

}

exports.PDFThumbnailView = PDFThumbnailView;