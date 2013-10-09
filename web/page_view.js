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
           TextLayerBuilder, cache, Stats, USE_ONLY_CSS_ZOOM */

'use strict';

var PageView = function pageView(container, id, scale,
                                 navigateTo, defaultViewport) {
  this.id = id;

  this.rotation = 0;
  this.scale = scale || 1.0;
  this.viewport = defaultViewport;
  this.pdfPageRotate = defaultViewport.rotate;

  this.renderingState = RenderingStates.INITIAL;
  this.resume = null;

  this.textContent = null;
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
    this.viewport = pdfPage.getViewport(this.scale * CSS_UNITS);
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

  this.reset = function pageViewReset() {
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
      if (this.zoomLayer && this.zoomLayer === node) {
        continue;
      }
      div.removeChild(node);
    }
    div.removeAttribute('data-loaded');

    this.annotationLayer = null;

    delete this.canvas;

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

    if (USE_ONLY_CSS_ZOOM && this.canvas) {
      this.cssZoom(this.canvas);
      return;
    } else if (this.canvas && !this.zoomLayer) {
      this.zoomLayer = this.canvas.parentNode;
      this.zoomLayer.style.position = 'absolute';
    }
    if (this.zoomLayer) {
      this.cssZoom(this.zoomLayer.firstChild);
    }
    this.reset();
  };

  this.cssZoom = function pageViewRescale(canvas) {
    // Need to adjust canvas, canvas wrapper, and page container.
    canvas.style.width = canvas.parentNode.style.width = div.style.width =
        Math.floor(this.viewport.width) + 'px';
    canvas.style.height = canvas.parentNode.style.height = div.style.height =
        Math.floor(this.viewport.height) + 'px';
    if (this.textLayer) {
      var scale = (this.viewport.width / canvas.width);
      var cssScale = 'scale(' + scale + ', ' + scale + ')';
      var textLayerDiv = this.textLayer.textLayerDiv;
      CustomStyle.setProp('transform', textLayerDiv, cssScale);
      CustomStyle.setProp('transformOrigin', textLayerDiv, '0% 0%');
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
      if (self.annotationLayer) {
        // If an annotationLayer already exists, delete it to avoid creating
        // duplicate annotations when rapidly re-zooming the document.
        pageDiv.removeChild(self.annotationLayer);
        self.annotationLayer = null;
      }
      viewport = viewport.clone({ dontFlip: true });
      for (var i = 0; i < annotationsData.length; i++) {
        var data = annotationsData[i];
        var annotation = PDFJS.Annotation.fromData(data);
        if (!annotation || !annotation.hasHtml()) {
          continue;
        }

        var element = annotation.getHtmlElement(pdfPage.commonObjs);
        mozL10n.translate(element);

        data = annotation.getData();
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

        var transform = viewport.transform;
        var transformStr = 'matrix(' + transform.join(',') + ')';
        CustomStyle.setProp('transform', element, transformStr);
        var transformOriginStr = -rect[0] + 'px ' + -rect[1] + 'px';
        CustomStyle.setProp('transformOrigin', element, transformOriginStr);

        if (data.subtype === 'Link' && !data.url) {
          if (data.action) {
            bindNamedAction(element, data.action);
          } else {
            bindLink(element, ('dest' in data) ? data.dest : null);
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
    });
  }

  this.getPagePoint = function pageViewGetPagePoint(x, y) {
    return this.viewport.convertToPdfPoint(x, y);
  };

  this.scrollIntoView = function pageViewScrollIntoView(dest) {
    if (PresentationMode.active) { // Avoid breaking presentation mode.
      dest = null;
    }
    if (!dest) {
      scrollIntoView(div);
      return;
    }

    var x = 0, y = 0;
    var width = 0, height = 0, widthScale, heightScale;
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
        y = y !== null ? y : this.height / this.scale;
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
        scale = Math.min(widthScale, heightScale);
        break;
      default:
        return;
    }

    if (scale && scale !== PDFView.currentScale) {
      PDFView.parseScale(scale, true, true);
    } else if (PDFView.currentScale === UNKNOWN_SCALE) {
      PDFView.parseScale(DEFAULT_SCALE, true, true);
    }

    if (scale === 'page-fit' && !dest[4]) {
      scrollIntoView(div);
      return;
    }

    var boundingRect = [
      this.viewport.convertToViewportPoint(x, y),
      this.viewport.convertToViewportPoint(x + width, y + height)
    ];
    setTimeout(function pageViewScrollIntoViewRelayout() {
      // letting page to re-layout before scrolling
      var scale = PDFView.currentScale;
      var x = Math.min(boundingRect[0][0], boundingRect[1][0]);
      var y = Math.min(boundingRect[0][1], boundingRect[1][1]);
      var width = Math.abs(boundingRect[0][0] - boundingRect[1][0]);
      var height = Math.abs(boundingRect[0][1] - boundingRect[1][1]);

      scrollIntoView(div, {left: x, top: y, width: width, height: height});
    }, 0);
  };

  this.getTextContent = function pageviewGetTextContent() {
    if (!this.textContent) {
      this.textContent = this.pdfPage.getTextContent();
    }
    return this.textContent;
  };

  this.draw = function pageviewDraw(callback) {
    var pdfPage = this.pdfPage;

    if (!pdfPage) {
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
    div.appendChild(canvasWrapper);
    this.canvas = canvas;

    var scale = this.scale;
    var ctx = canvas.getContext('2d');
    var outputScale = getOutputScale(ctx);

    if (USE_ONLY_CSS_ZOOM) {
      var actualSizeViewport = viewport.clone({ scale: CSS_UNITS });
      // Use a scale that will make the canvas be the original intended size
      // of the page.
      outputScale.sx *= actualSizeViewport.width / viewport.width;
      outputScale.sy *= actualSizeViewport.height / viewport.height;
      outputScale.scaled = true;
    }

    canvas.width = Math.floor(viewport.width * outputScale.sx);
    canvas.height = Math.floor(viewport.height * outputScale.sy);
    canvas.style.width = Math.floor(viewport.width) + 'px';
    canvas.style.height = Math.floor(viewport.height) + 'px';

    var textLayerDiv = null;
    if (!PDFJS.disableTextLayer) {
      textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      textLayerDiv.style.width = canvas.width + 'px';
      textLayerDiv.style.height = canvas.height + 'px';
      div.appendChild(textLayerDiv);
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
    if (outputScale.scaled && textLayerDiv) {
      var cssScale = 'scale(' + (1 / outputScale.sx) + ', ' +
                                (1 / outputScale.sy) + ')';
      CustomStyle.setProp('transform' , textLayerDiv, cssScale);
      CustomStyle.setProp('transformOrigin' , textLayerDiv, '0% 0%');
    }

//#if (FIREFOX || MOZCENTRAL)
//  // Checking if document fonts are used only once
//  var checkIfDocumentFontsUsed = !PDFView.pdfDocument.embeddedFontsUsed;
//#endif

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
//    if (checkIfDocumentFontsUsed && PDFView.pdfDocument.embeddedFontsUsed &&
//        PDFJS.disableFontFace) {
//      console.error(mozL10n.get('web_fonts_disabled', null,
//        'Web fonts are disabled: unable to use embedded PDF fonts.'));
//      PDFView.fallback();
//    }
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

      cache.push(self);

      var event = document.createEvent('CustomEvent');
      event.initCustomEvent('pagerender', true, true, {
        pageNumber: pdfPage.pageNumber
      });
      div.dispatchEvent(event);

//#if (FIREFOX || MOZCENTRAL)
//    FirefoxCom.request('reportTelemetry', JSON.stringify({
//      type: 'pageInfo'
//    }));
//    // TODO add stream types report here
//#endif
      callback();
    }

    var renderContext = {
      canvasContext: ctx,
      viewport: this.viewport,
      textLayer: textLayer,
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

    this.renderTask.then(
      function pdfPageRenderCallback() {
        pageViewDrawCallback(null);
      },
      function pdfPageRenderError(error) {
        pageViewDrawCallback(error);
      }
    );

    if (textLayer) {
      this.getTextContent().then(
        function textContentResolved(textContent) {
          textLayer.setTextContent(textContent);
        }
      );
    }

    setupAnnotations(div, pdfPage, this.viewport);
    div.setAttribute('data-loaded', true);
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

    var self = this;
    canvas.mozPrintCallback = function(obj) {
      var ctx = obj.context;

      ctx.save();
      ctx.fillStyle = 'rgb(255, 255, 255)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.scale(PRINT_OUTPUT_SCALE, PRINT_OUTPUT_SCALE);

      var renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };

      pdfPage.render(renderContext).then(function() {
        // Tell the printEngine that rendering this canvas/page has finished.
        obj.done();
        self.pdfPage.destroy();
      }, function(error) {
        console.error(error);
        // Tell the printEngine that rendering this canvas/page has failed.
        // This will make the print proces stop.
        if ('abort' in obj) {
          obj.abort();
        } else {
          obj.done();
        }
        self.pdfPage.destroy();
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
