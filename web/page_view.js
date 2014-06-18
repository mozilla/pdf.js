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
/* globals RenderingStates, PDFView, PDFHistory, PDFFindBar, PDFJS, mozL10n,
           CustomStyle, PresentationMode, scrollIntoView, SCROLLBAR_PADDING,
           CSS_UNITS, UNKNOWN_SCALE, DEFAULT_SCALE, getOutputScale,
           TextLayerBuilder, cache, Stats */

'use strict';

var PageView = function pageView(container, id, scale,
                                 navigateTo, defaultViewport) {
  this.id = id;

  this.rotation = 0;
  this.scale = scale || 1.0;
  this.viewport = defaultViewport;
  this.pdfPageRotate = defaultViewport.rotation;
  this.hasRestrictedScaling = false;

  this.renderingState = RenderingStates.INITIAL;
  this.resume = null;

  this.textLayer = null;

  this.zoomLayer = null;

  this.annotationLayer = null;

  var anchor = document.createElement('a');
  anchor.name = '' + this.id;

  var div = this.el = document.createElement('div');
  div.id = 'pageContainer' + this.id;
  div.className = 'page';
  div.style.width = Math.floor(this.viewport.width) + 'px';
  div.style.height = Math.floor(this.viewport.height) + 'px';

  container.appendChild(anchor);
  container.appendChild(div);

  this.setPdfPage = function pageViewSetPdfPage(pdfPage) {
    this.pdfPage = pdfPage;
    this.pdfPageRotate = pdfPage.rotate;
    var totalRotation = (this.rotation + this.pdfPageRotate) % 360;
    this.viewport = pdfPage.getViewport(this.scale * CSS_UNITS, totalRotation);
    this.stats = pdfPage.stats;
    this.reset();
  };

  this.destroy = function pageViewDestroy() {
    this.zoomLayer = null;
    this.reset();
    if (this.pdfPage) {
      this.pdfPage.destroy();
    }
  };

  this.reset = function pageViewReset(keepAnnotations) {
    if (this.renderTask) {
      this.renderTask.cancel();
    }
    this.resume = null;
    this.renderingState = RenderingStates.INITIAL;

    div.style.width = Math.floor(this.viewport.width) + 'px';
    div.style.height = Math.floor(this.viewport.height) + 'px';

    var childNodes = div.childNodes;
    for (var i = div.childNodes.length - 1; i >= 0; i--) {
      var node = childNodes[i];
      if ((this.zoomLayer && this.zoomLayer === node) ||
          (keepAnnotations && this.annotationLayer === node)) {
        continue;
      }
      div.removeChild(node);
    }
    div.removeAttribute('data-loaded');

    if (keepAnnotations) {
      if (this.annotationLayer) {
        // Hide annotationLayer until all elements are resized
        // so they are not displayed on the already-resized page
        this.annotationLayer.setAttribute('hidden', 'true');
      }
    } else {
      this.annotationLayer = null;
    }

    if (this.canvas) {
      // Zeroing the width and height causes Firefox to release graphics
      // resources immediately, which can greatly reduce memory consumption.
      this.canvas.width = 0;
      this.canvas.height = 0;
      delete this.canvas;
    }

    this.loadingIconDiv = document.createElement('div');
    this.loadingIconDiv.className = 'loadingIcon';
    div.appendChild(this.loadingIconDiv);
  };

  this.update = function pageViewUpdate(scale, rotation) {
    this.scale = scale || this.scale;

    if (typeof rotation !== 'undefined') {
      this.rotation = rotation;
    }

    var totalRotation = (this.rotation + this.pdfPageRotate) % 360;
    this.viewport = this.viewport.clone({
      scale: this.scale * CSS_UNITS,
      rotation: totalRotation
    });

    var isScalingRestricted = false;
    if (this.canvas && PDFJS.maxCanvasPixels > 0) {
      var ctx = this.canvas.getContext('2d');
      var outputScale = getOutputScale(ctx);
      var pixelsInViewport = this.viewport.width * this.viewport.height;
      var maxScale = Math.sqrt(PDFJS.maxCanvasPixels / pixelsInViewport);
      if (((Math.floor(this.viewport.width) * outputScale.sx) | 0) *
          ((Math.floor(this.viewport.height) * outputScale.sy) | 0) >
          PDFJS.maxCanvasPixels) {
        isScalingRestricted = true;
      }
    }

    if (this.canvas &&
        (PDFJS.useOnlyCssZoom ||
          (this.hasRestrictedScaling && isScalingRestricted))) {
      this.cssTransform(this.canvas, true);
      return;
    } else if (this.canvas && !this.zoomLayer) {
      this.zoomLayer = this.canvas.parentNode;
      this.zoomLayer.style.position = 'absolute';
    }
    if (this.zoomLayer) {
      this.cssTransform(this.zoomLayer.firstChild);
    }
    this.reset(true);
  };

  this.cssTransform = function pageCssTransform(canvas, redrawAnnotations) {
    // Scale canvas, canvas wrapper, and page container.
    var width = this.viewport.width;
    var height = this.viewport.height;
    canvas.style.width = canvas.parentNode.style.width = div.style.width =
        Math.floor(width) + 'px';
    canvas.style.height = canvas.parentNode.style.height = div.style.height =
        Math.floor(height) + 'px';
    // The canvas may have been originally rotated, so rotate relative to that.
    var relativeRotation = this.viewport.rotation - canvas._viewport.rotation;
    var absRotation = Math.abs(relativeRotation);
    var scaleX = 1, scaleY = 1;
    if (absRotation === 90 || absRotation === 270) {
      // Scale x and y because of the rotation.
      scaleX = height / width;
      scaleY = width / height;
    }
    var cssTransform = 'rotate(' + relativeRotation + 'deg) ' +
                       'scale(' + scaleX + ',' + scaleY + ')';
    CustomStyle.setProp('transform', canvas, cssTransform);

    if (this.textLayer) {
      // Rotating the text layer is more complicated since the divs inside the
      // the text layer are rotated.
      // TODO: This could probably be simplified by drawing the text layer in
      // one orientation then rotating overall.
      var textLayerViewport = this.textLayer.viewport;
      var textRelativeRotation = this.viewport.rotation -
                                 textLayerViewport.rotation;
      var textAbsRotation = Math.abs(textRelativeRotation);
      var scale = width / textLayerViewport.width;
      if (textAbsRotation === 90 || textAbsRotation === 270) {
        scale = width / textLayerViewport.height;
      }
      var textLayerDiv = this.textLayer.textLayerDiv;
      var transX, transY;
      switch (textAbsRotation) {
        case 0:
          transX = transY = 0;
          break;
        case 90:
          transX = 0;
          transY = '-' + textLayerDiv.style.height;
          break;
        case 180:
          transX = '-' + textLayerDiv.style.width;
          transY = '-' + textLayerDiv.style.height;
          break;
        case 270:
          transX = '-' + textLayerDiv.style.width;
          transY = 0;
          break;
        default:
          console.error('Bad rotation value.');
          break;
      }
      CustomStyle.setProp('transform', textLayerDiv,
                          'rotate(' + textAbsRotation + 'deg) ' +
                            'scale(' + scale + ', ' + scale + ') ' +
                            'translate(' + transX + ', ' + transY + ')');
      CustomStyle.setProp('transformOrigin', textLayerDiv, '0% 0%');
    }

    if (redrawAnnotations && this.annotationLayer) {
      setupAnnotations(div, this.pdfPage, this.viewport);
    }
  };

  Object.defineProperty(this, 'width', {
    get: function PageView_getWidth() {
      return this.viewport.width;
    },
    enumerable: true
  });

  Object.defineProperty(this, 'height', {
    get: function PageView_getHeight() {
      return this.viewport.height;
    },
    enumerable: true
  });

  var self = this;

  function setupAnnotations(pageDiv, pdfPage, viewport) {

    function bindLink(link, dest) {
      link.href = PDFView.getDestinationHash(dest);
      link.onclick = function pageViewSetupLinksOnclick() {
        if (dest) {
          PDFView.navigateTo(dest);
        }
        return false;
      };
      if (dest) {
        link.className = 'internalLink';
      }
    }

    function bindNamedAction(link, action) {
      link.href = PDFView.getAnchorUrl('');
      link.onclick = function pageViewSetupNamedActionOnClick() {
        // See PDF reference, table 8.45 - Named action
        switch (action) {
          case 'GoToPage':
            document.getElementById('pageNumber').focus();
            break;

          case 'GoBack':
            PDFHistory.back();
            break;

          case 'GoForward':
            PDFHistory.forward();
            break;

          case 'Find':
            if (!PDFView.supportsIntegratedFind) {
              PDFFindBar.toggle();
            }
            break;

          case 'NextPage':
            PDFView.page++;
            break;

          case 'PrevPage':
            PDFView.page--;
            break;

          case 'LastPage':
            PDFView.page = PDFView.pages.length;
            break;

          case 'FirstPage':
            PDFView.page = 1;
            break;

          default:
            break; // No action according to spec
        }
        return false;
      };
      link.className = 'internalLink';
    }

    pdfPage.getAnnotations().then(function(annotationsData) {
      viewport = viewport.clone({ dontFlip: true });
      var transform = viewport.transform;
      var transformStr = 'matrix(' + transform.join(',') + ')';
      var data, element, i, ii;

      if (self.annotationLayer) {
        // If an annotationLayer already exists, refresh its children's
        // transformation matrices
        for (i = 0, ii = annotationsData.length; i < ii; i++) {
          data = annotationsData[i];
          element = self.annotationLayer.querySelector(
            '[data-annotation-id="' + data.id + '"]');
          if (element) {
            CustomStyle.setProp('transform', element, transformStr);
          }
        }
        // See this.reset()
        self.annotationLayer.removeAttribute('hidden');
      } else {
        for (i = 0, ii = annotationsData.length; i < ii; i++) {
          data = annotationsData[i];
          if (!data || !data.hasHtml) {
            continue;
          }

          element = PDFJS.AnnotationUtils.getHtmlElement(data,
                                                         pdfPage.commonObjs);
          element.setAttribute('data-annotation-id', data.id);
          mozL10n.translate(element);

          var rect = data.rect;
          var view = pdfPage.view;
          rect = PDFJS.Util.normalizeRect([
            rect[0],
            view[3] - rect[1] + view[1],
            rect[2],
            view[3] - rect[3] + view[1]
          ]);
          element.style.left = rect[0] + 'px';
          element.style.top = rect[1] + 'px';
          element.style.position = 'absolute';

          CustomStyle.setProp('transform', element, transformStr);
          var transformOriginStr = -rect[0] + 'px ' + -rect[1] + 'px';
          CustomStyle.setProp('transformOrigin', element, transformOriginStr);

          if (data.subtype === 'Link' && !data.url) {
            var link = element.getElementsByTagName('a')[0];
            if (link) {
              if (data.action) {
                bindNamedAction(link, data.action);
              } else {
                bindLink(link, ('dest' in data) ? data.dest : null);
              }
            }
          }

          if (!self.annotationLayer) {
            var annotationLayerDiv = document.createElement('div');
            annotationLayerDiv.className = 'annotationLayer';
            pageDiv.appendChild(annotationLayerDiv);
            self.annotationLayer = annotationLayerDiv;
          }

          self.annotationLayer.appendChild(element);
        }
      }
    });
  }

  this.getPagePoint = function pageViewGetPagePoint(x, y) {
    return this.viewport.convertToPdfPoint(x, y);
  };

  this.scrollIntoView = function pageViewScrollIntoView(dest) {
    if (PresentationMode.active) {
      if (PDFView.page !== this.id) {
        // Avoid breaking PDFView.getVisiblePages in presentation mode.
        PDFView.page = this.id;
        return;
      }
      dest = null;
      PDFView.setScale(PDFView.currentScaleValue, true, true);
    }
    if (!dest) {
      scrollIntoView(div);
      return;
    }

    var x = 0, y = 0;
    var width = 0, height = 0, widthScale, heightScale;
    var changeOrientation = (this.rotation % 180 === 0 ? false : true);
    var pageWidth = (changeOrientation ? this.height : this.width) /
      this.scale / CSS_UNITS;
    var pageHeight = (changeOrientation ? this.width : this.height) /
      this.scale / CSS_UNITS;
    var scale = 0;
    switch (dest[1].name) {
      case 'XYZ':
        x = dest[2];
        y = dest[3];
        scale = dest[4];
        // If x and/or y coordinates are not supplied, default to
        // _top_ left of the page (not the obvious bottom left,
        // since aligning the bottom of the intended page with the
        // top of the window is rarely helpful).
        x = x !== null ? x : 0;
        y = y !== null ? y : pageHeight;
        break;
      case 'Fit':
      case 'FitB':
        scale = 'page-fit';
        break;
      case 'FitH':
      case 'FitBH':
        y = dest[2];
        scale = 'page-width';
        break;
      case 'FitV':
      case 'FitBV':
        x = dest[2];
        width = pageWidth;
        height = pageHeight;
        scale = 'page-height';
        break;
      case 'FitR':
        x = dest[2];
        y = dest[3];
        width = dest[4] - x;
        height = dest[5] - y;
        widthScale = (PDFView.container.clientWidth - SCROLLBAR_PADDING) /
          width / CSS_UNITS;
        heightScale = (PDFView.container.clientHeight - SCROLLBAR_PADDING) /
          height / CSS_UNITS;
        scale = Math.min(Math.abs(widthScale), Math.abs(heightScale));
        break;
      default:
        return;
    }

    if (scale && scale !== PDFView.currentScale) {
      PDFView.setScale(scale, true, true);
    } else if (PDFView.currentScale === UNKNOWN_SCALE) {
      PDFView.setScale(DEFAULT_SCALE, true, true);
    }

    if (scale === 'page-fit' && !dest[4]) {
      scrollIntoView(div);
      return;
    }

    var boundingRect = [
      this.viewport.convertToViewportPoint(x, y),
      this.viewport.convertToViewportPoint(x + width, y + height)
    ];
    var left = Math.min(boundingRect[0][0], boundingRect[1][0]);
    var top = Math.min(boundingRect[0][1], boundingRect[1][1]);

    scrollIntoView(div, { left: left, top: top });
  };

  this.getTextContent = function pageviewGetTextContent() {
    return PDFView.getPage(this.id).then(function(pdfPage) {
      return pdfPage.getTextContent();
    });
  };

  this.draw = function pageviewDraw(callback) {
    var pdfPage = this.pdfPage;

    if (this.pagePdfPromise) {
      return;
    }
    if (!pdfPage) {
      var promise = PDFView.getPage(this.id);
      promise.then(function(pdfPage) {
        delete this.pagePdfPromise;
        this.setPdfPage(pdfPage);
        this.draw(callback);
      }.bind(this));
      this.pagePdfPromise = promise;
      return;
    }

    if (this.renderingState !== RenderingStates.INITIAL) {
      console.error('Must be in new state before drawing');
    }

    this.renderingState = RenderingStates.RUNNING;

    var viewport = this.viewport;
    // Wrap the canvas so if it has a css transform for highdpi the overflow
    // will be hidden in FF.
    var canvasWrapper = document.createElement('div');
    canvasWrapper.style.width = div.style.width;
    canvasWrapper.style.height = div.style.height;
    canvasWrapper.classList.add('canvasWrapper');

    var canvas = document.createElement('canvas');
    canvas.id = 'page' + this.id;
    canvasWrapper.appendChild(canvas);
    if (this.annotationLayer) {
      // annotationLayer needs to stay on top
      div.insertBefore(canvasWrapper, this.annotationLayer);
    } else {
      div.appendChild(canvasWrapper);
    }
    this.canvas = canvas;

    var ctx = canvas.getContext('2d');
    var outputScale = getOutputScale(ctx);

    if (PDFJS.useOnlyCssZoom) {
      var actualSizeViewport = viewport.clone({ scale: CSS_UNITS });
      // Use a scale that will make the canvas be the original intended size
      // of the page.
      outputScale.sx *= actualSizeViewport.width / viewport.width;
      outputScale.sy *= actualSizeViewport.height / viewport.height;
      outputScale.scaled = true;
    }

    if (PDFJS.maxCanvasPixels > 0) {
      var pixelsInViewport = viewport.width * viewport.height;
      var maxScale = Math.sqrt(PDFJS.maxCanvasPixels / pixelsInViewport);
      if (outputScale.sx > maxScale || outputScale.sy > maxScale) {
        outputScale.sx = maxScale;
        outputScale.sy = maxScale;
        outputScale.scaled = true;
        this.hasRestrictedScaling = true;
      } else {
        this.hasRestrictedScaling = false;
      }
    }

    canvas.width = (Math.floor(viewport.width) * outputScale.sx) | 0;
    canvas.height = (Math.floor(viewport.height) * outputScale.sy) | 0;
    canvas.style.width = Math.floor(viewport.width) + 'px';
    canvas.style.height = Math.floor(viewport.height) + 'px';
    // Add the viewport so it's known what it was originally drawn with.
    canvas._viewport = viewport;

    var textLayerDiv = null;
    if (!PDFJS.disableTextLayer) {
      textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      textLayerDiv.style.width = canvas.style.width;
      textLayerDiv.style.height = canvas.style.height;
      if (this.annotationLayer) {
        // annotationLayer needs to stay on top
        div.insertBefore(textLayerDiv, this.annotationLayer);
      } else {
        div.appendChild(textLayerDiv);
      }
    }
    var textLayer = this.textLayer =
      textLayerDiv ? new TextLayerBuilder({
        textLayerDiv: textLayerDiv,
        pageIndex: this.id - 1,
        lastScrollSource: PDFView,
        viewport: this.viewport,
        isViewerInPresentationMode: PresentationMode.active
      }) : null;
    // TODO(mack): use data attributes to store these
    ctx._scaleX = outputScale.sx;
    ctx._scaleY = outputScale.sy;
    if (outputScale.scaled) {
      ctx.scale(outputScale.sx, outputScale.sy);
    }

    // Rendering area

    var self = this;
    function pageViewDrawCallback(error) {
      // The renderTask may have been replaced by a new one, so only remove the
      // reference to the renderTask if it matches the one that is triggering
      // this callback.
      if (renderTask === self.renderTask) {
        self.renderTask = null;
      }

      if (error === 'cancelled') {
        return;
      }

      self.renderingState = RenderingStates.FINISHED;

      if (self.loadingIconDiv) {
        div.removeChild(self.loadingIconDiv);
        delete self.loadingIconDiv;
      }

      if (self.zoomLayer) {
        div.removeChild(self.zoomLayer);
        self.zoomLayer = null;
      }

//#if (FIREFOX || MOZCENTRAL)
//    if (self.textLayer && self.textLayer.textDivs &&
//        self.textLayer.textDivs.length > 0 &&
//        !PDFView.supportsDocumentColors) {
//      console.error(mozL10n.get('document_colors_disabled', null,
//        'PDF documents are not allowed to use their own colors: ' +
//        '\'Allow pages to choose their own colors\' ' +
//        'is deactivated in the browser.'));
//      PDFView.fallback();
//    }
//#endif
      if (error) {
        PDFView.error(mozL10n.get('rendering_error', null,
          'An error occurred while rendering the page.'), error);
      }

      self.stats = pdfPage.stats;
      self.updateStats();
      if (self.onAfterDraw) {
        self.onAfterDraw();
      }

      var event = document.createEvent('CustomEvent');
      event.initCustomEvent('pagerender', true, true, {
        pageNumber: pdfPage.pageNumber
      });
      div.dispatchEvent(event);

//#if (FIREFOX || MOZCENTRAL)
//    FirefoxCom.request('reportTelemetry', JSON.stringify({
//      type: 'pageInfo'
//    }));
//    // It is a good time to report stream and font types
//    PDFView.pdfDocument.getStats().then(function (stats) {
//      FirefoxCom.request('reportTelemetry', JSON.stringify({
//        type: 'documentStats',
//        stats: stats
//      }));
//    });
//#endif
      callback();
    }

    var renderContext = {
      canvasContext: ctx,
      viewport: this.viewport,
      textLayer: textLayer,
      // intent: 'default', // === 'display'
      continueCallback: function pdfViewcContinueCallback(cont) {
        if (PDFView.highestPriorityPage !== 'page' + self.id) {
          self.renderingState = RenderingStates.PAUSED;
          self.resume = function resumeCallback() {
            self.renderingState = RenderingStates.RUNNING;
            cont();
          };
          return;
        }
        cont();
      }
    };
    var renderTask = this.renderTask = this.pdfPage.render(renderContext);

    this.renderTask.promise.then(
      function pdfPageRenderCallback() {
        pageViewDrawCallback(null);
        if (textLayer) {
          self.getTextContent().then(
            function textContentResolved(textContent) {
              textLayer.setTextContent(textContent);
            }
          );
        }
      },
      function pdfPageRenderError(error) {
        pageViewDrawCallback(error);
      }
    );

    setupAnnotations(div, pdfPage, this.viewport);
    div.setAttribute('data-loaded', true);

    // Add the page to the cache at the start of drawing. That way it can be
    // evicted from the cache and destroyed even if we pause its rendering.
    cache.push(this);
  };

  this.beforePrint = function pageViewBeforePrint() {
    var pdfPage = this.pdfPage;

    var viewport = pdfPage.getViewport(1);
    // Use the same hack we use for high dpi displays for printing to get better
    // output until bug 811002 is fixed in FF.
    var PRINT_OUTPUT_SCALE = 2;
    var canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width) * PRINT_OUTPUT_SCALE;
    canvas.height = Math.floor(viewport.height) * PRINT_OUTPUT_SCALE;
    canvas.style.width = (PRINT_OUTPUT_SCALE * viewport.width) + 'pt';
    canvas.style.height = (PRINT_OUTPUT_SCALE * viewport.height) + 'pt';
    var cssScale = 'scale(' + (1 / PRINT_OUTPUT_SCALE) + ', ' +
                              (1 / PRINT_OUTPUT_SCALE) + ')';
    CustomStyle.setProp('transform' , canvas, cssScale);
    CustomStyle.setProp('transformOrigin' , canvas, '0% 0%');

    var printContainer = document.getElementById('printContainer');
    var canvasWrapper = document.createElement('div');
    canvasWrapper.style.width = viewport.width + 'pt';
    canvasWrapper.style.height = viewport.height + 'pt';
    canvasWrapper.appendChild(canvas);
    printContainer.appendChild(canvasWrapper);

    canvas.mozPrintCallback = function(obj) {
      var ctx = obj.context;

      ctx.save();
      ctx.fillStyle = 'rgb(255, 255, 255)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.scale(PRINT_OUTPUT_SCALE, PRINT_OUTPUT_SCALE);

      var renderContext = {
        canvasContext: ctx,
        viewport: viewport,
        intent: 'print'
      };

      pdfPage.render(renderContext).promise.then(function() {
        // Tell the printEngine that rendering this canvas/page has finished.
        obj.done();
      }, function(error) {
        console.error(error);
        // Tell the printEngine that rendering this canvas/page has failed.
        // This will make the print proces stop.
        if ('abort' in obj) {
          obj.abort();
        } else {
          obj.done();
        }
      });
    };
  };

  this.updateStats = function pageViewUpdateStats() {
    if (!this.stats) {
      return;
    }

    if (PDFJS.pdfBug && Stats.enabled) {
      var stats = this.stats;
      Stats.add(this.id, stats);
    }
  };
};
