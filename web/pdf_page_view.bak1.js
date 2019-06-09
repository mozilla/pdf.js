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
import {
  approximateFraction, CSS_UNITS, DEFAULT_SCALE, getGlobalEventBus,
  getOutputScale, NullL10n, RendererType, roundToDivide, ScrollMode, SpreadMode, TextLayerMode
} from './ui_utils';
import {
  createPromiseCapability, RenderingCancelledException, SVGGraphics
} from 'pdfjs-lib';
import { RenderingStates } from './pdf_rendering_queue';
import { viewerCompatibilityParams } from './viewer_compatibility';

/**
 * @typedef {Object} PDFPageViewOptions
 * @property {HTMLDivElement} container - The viewer element.
 * @property {EventBus} eventBus - The application event bus.
 * @property {number} id - The page unique ID (normally its number).
 * @property {number} scale - The page scale display.
 * @property {PageViewport} defaultViewport - The page viewport.
 * @property {PDFRenderingQueue} renderingQueue - The rendering queue object.
 * @property {IPDFTextLayerFactory} textLayerFactory
 * @property {number} textLayerMode - (optional) Controls if the text layer used
 *   for selection and searching is created, and if the improved text selection
 *   behaviour is enabled. The constants from {TextLayerMode} should be used.
 *   The default value is `TextLayerMode.ENABLE`.
 * @property {IPDFAnnotationLayerFactory} annotationLayerFactory
 * @property {string} imageResourcesPath - (optional) Path for image resources,
 *   mainly for annotation icons. Include trailing slash.
 * @property {boolean} renderInteractiveForms - Turns on rendering of
 *   interactive form elements. The default is `false`.
 * @property {string} renderer - 'canvas' or 'svg'. The default is 'canvas'.
 * @property {boolean} enableWebGL - (optional) Enables WebGL accelerated
 *   rendering for some operations. The default value is `false`.
 * @property {boolean} useOnlyCssZoom - (optional) Enables CSS only zooming.
 *   The default value is `false`.
 * @property {number} maxCanvasPixels - (optional) The maximum supported canvas
 *   size in total pixels, i.e. width * height. Use -1 for no limit.
 *   The default value is 4096 * 4096 (16 mega-pixels).
 * @property {IL10n} l10n - Localization service.
 */

const MAX_CANVAS_PIXELS = viewerCompatibilityParams.maxCanvasPixels || 16777216;

/**
 * @implements {IRenderableView}
 */
class PDFPageView {
  /**
   * @param {PDFPageViewOptions} options
   */
  constructor(options) {
    let container = options.container;
    let defaultViewport = options.defaultViewport;

    this.id = options.id;
    this.renderingId = 'page' + this.id;

    this.pdfPage = null;
    this.pageLabel = null;
    this.rotation = 0;
    this.scale = options.scale || DEFAULT_SCALE;
    this.viewport = defaultViewport;
    this.pdfPageRotate = defaultViewport.rotation;
    this.hasRestrictedScaling = false;
    this.textLayerMode = Number.isInteger(options.textLayerMode) ?
      options.textLayerMode : TextLayerMode.ENABLE;
    this.imageResourcesPath = options.imageResourcesPath || '';
    this.renderInteractiveForms = options.renderInteractiveForms || false;
    this.useOnlyCssZoom = options.useOnlyCssZoom || false;
    this.maxCanvasPixels = options.maxCanvasPixels || MAX_CANVAS_PIXELS;

    this.eventBus = options.eventBus || getGlobalEventBus();
    this.renderingQueue = options.renderingQueue;
    this.textLayerFactory = options.textLayerFactory;
    this.annotationLayerFactory = options.annotationLayerFactory;
    this.renderer = options.renderer || RendererType.CANVAS;
    this.enableWebGL = options.enableWebGL || false;
    this.l10n = options.l10n || NullL10n;

    this.paintTask = null;
    this.paintedViewportMap = new WeakMap();
    this.renderingState = RenderingStates.INITIAL;
    this.resume = null;
    this.error = null;

    this.onBeforeDraw = null;
    this.onAfterDraw = null;

    this.annotationLayer = null;
    this.textLayer = null;
    this.zoomLayer = null;

    let div = document.createElement('div');
    div.className = 'page';
    //-------------------------tanglinhai 改造page布局成absolute,改善性能 start-------------------------
    this.isDivAddedToContainer = false;
    this.viewer = options.viewer;
    
    this.position = {
      top: 0,
      left: 0,
      transform: 'none',
      spread: {
        top: 0,
        left: 0,
        transform: 'none'
      }
    };

    var pageIndex_ = this.id -1;
    var containerW = this.viewer.container.clientWidth;
    //div.style.left = containerW <= Math.floor(this.viewport.width)? '0px' : (containerW - Math.floor(this.viewport.width))/2 + 'px';
    if(containerW > Math.floor(this.viewport.width)){
      div.style.left = this.position.left = '50%';
      div.style.transform = this.position.transform = 'translateX(-50%)';
    }else{
      div.style.left = this.position.left = '0px';
      div.style.transform = this.position.transform = 'none';
    }
    div.style.top = this.position.top = this.viewer.viewportTotalHeight + 'px';
    this.viewer.viewportTotalHeight += Math.floor(this.viewport.height) + 10;
    //-------------------------tanglinhai 改造page布局成absolute,改善性能 end-------------------------
    div.style.width = Math.floor(this.viewport.width) + 'px';
    div.style.height = Math.floor(this.viewport.height) + 'px';
    div.setAttribute('data-page-number', this.id);
    this.div = div;
    //-------------------------tanglinhai 改造page布局成absolute,改善性能 start-------------------------
    //container.appendChild(div);
    if(this.id == 1 || this.id == this.viewer.pdfDocument.numPages){
      container.appendChild(div);
      this.isDivAddedToContainer = true;
    }
    //-------------------------tanglinhai 改造page布局成absolute,改善性能 end-------------------------
  }

  setPdfPage(pdfPage) {
    this.pdfPage = pdfPage;
    this.pdfPageRotate = pdfPage.rotate;

    let totalRotation = (this.rotation + this.pdfPageRotate) % 360;
    this.viewport = pdfPage.getViewport({ scale: this.scale * CSS_UNITS,
                                          rotation: totalRotation, });
    this.stats = pdfPage.stats;
    this.reset();
  }

  destroy() {
    this.reset();
    if (this.pdfPage) {
      this.pdfPage.cleanup();
    }
  }

  /**
   * @private
   */
  _resetZoomLayer(removeFromDOM = false) {
    if (!this.zoomLayer) {
      return;
    }
    let zoomLayerCanvas = this.zoomLayer.firstChild;
    this.paintedViewportMap.delete(zoomLayerCanvas);
    // Zeroing the width and height causes Firefox to release graphics
    // resources immediately, which can greatly reduce memory consumption.
    zoomLayerCanvas.width = 0;
    zoomLayerCanvas.height = 0;

    if (removeFromDOM) {
      // Note: `ChildNode.remove` doesn't throw if the parent node is undefined.
      this.zoomLayer.remove();
    }
    this.zoomLayer = null;
  }

  reset(keepZoomLayer = false, keepAnnotations = false) {
    this.cancelRendering(keepAnnotations);
    this.renderingState = RenderingStates.INITIAL;

    let div = this.div;
    //-------------------------tanglinhai 改造page布局成absolute,改善性能 start-------------------------
    var startTime = new Date().getTime();
    var pageIndex_ = this.id -1;
    var viewportTotalHeight = 0;
    //div.style.left = containerW <= Math.floor(this.viewport.width)? '0px' : (containerW - Math.floor(this.viewport.width))/2 + 'px';
    if(this.viewer.scrollMode == ScrollMode.WRAPPED){//平铺模式
      var containerW = this.viewer.container.clientWidth;
      var lineMaxH = 0;
      var lineMaxW = 0;
      var lineItemCount = 0;
      var lineItems = [];
      if(this.viewer.spreadMode == SpreadMode.NONE){//平铺+单页
        var isSizeChange = Math.floor(this.viewport.width) != parseInt(div.style.width) ||
                          Math.floor(this.viewport.height) != parseInt(div.style.height);

        if(isSizeChange)
        for(var i=0;i<this.viewer._pages.length;i++){
          var page_ = this.viewer._pages[i];
          /*if(i > pageIndex_){
            break;
          }*/
          var pageW_ = Math.floor(page_.viewport.width) + 10;
          var pageH_ = Math.floor(page_.viewport.height) + 10;
          var lineMaxW_ = lineMaxW + pageW_;
          if(lineMaxW_ > containerW){
            /*if(lineItemCount < 2){
              lineMaxH = pageH_;
            }else{
              lineMaxH = Math.max(lineMaxH, pageH_);
            }*/
            viewportTotalHeight += lineMaxH;
            //if (pageIndex_ == i/* || (isSizeChange && pageIndex_ < i)*/) {//
              page_.div.style.top = viewportTotalHeight+'px';
              page_.div.style.left = '0px';
              page_.div.style.transform = 'none';
              /*if(!isSizeChange)
                break;*/
            //}
            lineMaxH = pageH_;
            lineMaxW = pageW_;
            lineItemCount = 1;
          }else{
            lineItemCount++;
            if(lineItemCount < 2){
              lineMaxH = pageH_;
            }else{
              lineMaxH = Math.max(lineMaxH, pageH_);
            }
            //if (pageIndex_ == i/* || (isSizeChange && pageIndex_ < i)*/) {//
              page_.div.style.top = viewportTotalHeight+'px';
              page_.div.style.left = lineMaxW+'px';
              page_.div.style.transform = 'none';
              /*if(!isSizeChange)
                break;*/
            //}
            lineMaxW = lineMaxW_;
          }
        }
      }else{//平铺+双页或者书籍
        if(!div.nextSibling){
          /*var isSizeChange = (!div.previousSibling && 
                  (Math.floor(this.viewport.width) != parseInt(div.style.width) ||
                    Math.floor(this.viewport.height) != parseInt(div.style.height))) ||
                (div.previousSibling && 
                  (Math.floor(this.viewport.width) != parseInt(div.style.width) ||
                    Math.floor(this.viewport.height) > Math.floor(this.viewer._pages[pageIndex_-1].viewport.height)));*/
          const parity = this.viewer.spreadMode % 2;
          const iMax = this.viewer._pages.length;
          //if(pageIndex_ % 2 === parity || this.id == iMax){
            for (let i = 0; i < iMax; ++i) {
              /*if(i > pageIndex_){
                break;
              }*/
              var spreadMaxH;
              var spreadW;
              if(i % 2 === parity || i == iMax - 1){
                var page_ = this.viewer._pages[i];
                if(
                    ((i == iMax - 1 && iMax > 1) && 
                      ((this.viewer.spreadMode == SpreadMode.ODD && iMax%2 == 0) || 
                      (this.viewer.spreadMode == SpreadMode.EVEN && iMax%2 == 1)))   ||
                    (i < iMax - 1 && i - 1 > -1)
                  ){
                  spreadMaxH = Math.max(Math.floor(page_.viewport.height), Math.floor(this.viewer._pages[i-1].viewport.height)) + 10;
                  spreadW = Math.floor(page_.viewport.width) + Math.floor(this.viewer._pages[i-1].viewport.width) + 20;
                }else {
                  spreadMaxH = Math.floor(page_.viewport.height) + 10;
                  spreadW = Math.floor(page_.viewport.width) + 10;
                }
                var lineMaxW_ = lineMaxW + spreadW;
                if(lineMaxW_ > containerW){
                  /*if(i > parity){
                    lineMaxH = spreadMaxH;
                  }*/
                  viewportTotalHeight += lineMaxH;
                  //if (pageIndex_ == i/* || (isSizeChange && pageIndex_ < i)*/) {//
                    page_.div.parentNode.style.top = viewportTotalHeight+'px';
                    page_.div.parentNode.style.left = '0px';
                    page_.div.parentNode.style.transform = 'none';
                    /*if(!isSizeChange)
                      break;*/
                  //}
                  lineMaxH = spreadMaxH;
                  lineMaxW = spreadW;
                  lineItemCount = 1;
                }else{
                  lineItemCount++;
                  if(lineItemCount < 2){
                    lineMaxH = spreadMaxH;
                  }else{
                    lineMaxH = Math.max(lineMaxH, spreadMaxH);
                  }
                  /*if(i > parity && lineMaxW_ == spreadW){
                    lineMaxH = spreadMaxH;
                    viewportTotalHeight += lineMaxH;
                  }else{
                    lineMaxH = Math.max(lineMaxH, spreadMaxH);
                  }*/
                  //if (pageIndex_ == i/* || (isSizeChange && pageIndex_ < i)*/) {//
                    page_.div.parentNode.style.top = viewportTotalHeight+'px';
                    page_.div.parentNode.style.left = lineMaxW+'px';
                    page_.div.parentNode.style.transform = 'none';
                    /*if(!isSizeChange)
                      break;*/
                  //}
                  lineMaxW = lineMaxW_;
                }
              }
            }
          //}
        }
      }
    }else if(this.viewer.scrollMode == ScrollMode.HORIZONTAL){//水平滚动模式
      var containerH = this.viewer.container.clientHeight;
      /*if(containerH > Math.floor(this.viewport.height)){
        div.style.top = '50%';
        div.style.transform = 'translateY(-50%)';
      }else{
        div.style.top = '0px';
        div.style.transform = 'none';
      }*/

      //var isWidthChange = Math.floor(this.viewport.width) != parseInt(div.style.width);
      
      if(this.viewer.spreadMode == SpreadMode.NONE){//水平+单页
        for(var i=0;i<this.viewer._pages.length;i++){
          //if (pageIndex_ == i/* || (isWidthChange && pageIndex_ < i)*/) {
            var page_ = this.viewer._pages[i];
            page_.div.style.left = viewportTotalHeight + 'px';
            if(containerH > Math.floor(page_.viewport.height)){
              page_.div.style.top = '50%';
              page_.div.style.transform = 'translateY(-50%)';
            }else{
              page_.div.style.top = '0px';
              page_.div.style.transform = 'none';
            }
            /*if(!isWidthChange)
              break;*/
          //}
          viewportTotalHeight += Math.floor(this.viewer._pages[i].viewport.width) + 10;
        }
      }else{//水平+双页或者书籍
        if(!div.nextSibling){
          const parity = this.viewer.spreadMode % 2;
          const iMax = this.viewer._pages.length;
          var containerH = this.viewer.container.clientHeight;
          //if(pageIndex_ % 2 === parity || this.id == iMax){
            for (let i = 0; i < iMax; ++i) {
              var page_ = this.viewer._pages[i];
              var maxH = 0;
              if(i % 2 === parity || i == iMax - 1){
                var leftCss = 'left:'+viewportTotalHeight+'px;';
                if(
                    ((i == iMax - 1 && iMax > 1) && 
                      ((this.viewer.spreadMode == SpreadMode.ODD && iMax%2 == 0) || 
                      (this.viewer.spreadMode == SpreadMode.EVEN && iMax%2 == 1)))   ||
                    (i < iMax - 1 && i - 1 > -1)
                  ){
                  viewportTotalHeight += Math.floor(page_.viewport.width) + Math.floor(this.viewer._pages[i-1].viewport.width) + 20;
                  maxH = Math.max(Math.floor(page_.viewport.height), Math.floor(this.viewer._pages[i-1].viewport.height));
                }else{
                  viewportTotalHeight += Math.floor(page_.viewport.width) + 10;
                  maxH = Math.floor(page_.viewport.height);
                }
                var topCss = '';
                if(containerH > maxH){
                  topCss = 'top:50%;transform:translateY(-50%);';
                }
                page_.div.parentNode.style.cssText = leftCss + topCss;
              }
            }
          //}
        }
      }

      
    }else if(this.viewer.spreadMode == SpreadMode.NONE){//垂直+单页
      var containerW = this.viewer.container.clientWidth;
      /*if(containerW > Math.floor(this.viewport.width)){
        div.style.left = '50%';
        div.style.transform = 'translateX(-50%)';
      }else{
        div.style.left = '0px';
        div.style.transform = 'none';
      }*/

      //var isHeightChange = Math.floor(this.viewport.height) != parseInt(div.style.height);
      for(var i=0;i<this.viewer._pages.length;i++){
        var page_ = this.viewer._pages[i];
        //if (pageIndex_ == i/* || (isHeightChange && pageIndex_ < i)*/) {
          page_.div.style.top = viewportTotalHeight + 'px';
          if(containerW > Math.floor(page_.viewport.width)){
            page_.div.style.left = '50%';
            page_.div.style.transform = 'translateX(-50%)';
          }else{
            page_.div.style.left = '0px';
            page_.div.style.transform = 'none';
          }
          /*if(!isHeightChange)
            break;*/
        //}
        viewportTotalHeight += Math.floor(page_.viewport.height) + 10;
      }
    }else{//垂直+双页或者书籍
      var containerW = this.viewer.container.clientWidth;
      if(!div.nextSibling){
        const parity = this.viewer.spreadMode % 2;
        const iMax = this.viewer._pages.length;
        //if(pageIndex_ % 2 === parity || this.id == iMax){
          for (let i = 0; i < iMax; ++i) {
            /*if(i == pageIndex_){
              break;
            }*/
            if(i % 2 === parity || i == iMax - 1){
              var page_ = this.viewer._pages[i];
              var topCss = 'top:'+viewportTotalHeight+'px;';
              var leftCss = '';
              if(
                  ((i == iMax - 1 && iMax > 1) && 
                    ((this.viewer.spreadMode == SpreadMode.ODD && iMax%2 == 0) || 
                    (this.viewer.spreadMode == SpreadMode.EVEN && iMax%2 == 1)))   ||
                  (i < iMax - 1 && i - 1 > -1)
                ){
                var totalW = Math.floor(page_.viewport.width) + Math.floor(this.viewer._pages[i-1].viewport.width) + 20;
                viewportTotalHeight += Math.max(Math.floor(page_.viewport.height), Math.floor(this.viewer._pages[i-1].viewport.height)) + 10;
              }else{
                var totalW = Math.floor(page_.viewport.width) + 10;
                viewportTotalHeight += Math.floor(page_.viewport.height) + 10;
              }
              if(containerW > totalW){
                leftCss = 'left:50%;transform:translateX(-50%);';
              }
              page_.div.parentNode.style.cssText = topCss + leftCss;
            }
          }
        //}
      }
    }
    console.log('第'+pageIndex_+'页,reset耗时(秒)：'+(new Date().getTime()-startTime)/1000);
    //-------------------------tanglinhai 改造page布局成absolute,改善性能 end-------------------------
    div.style.width = Math.floor(this.viewport.width) + 'px';
    div.style.height = Math.floor(this.viewport.height) + 'px';

    let childNodes = div.childNodes;
    let currentZoomLayerNode = (keepZoomLayer && this.zoomLayer) || null;
    let currentAnnotationNode = (keepAnnotations && this.annotationLayer &&
                                 this.annotationLayer.div) || null;
    for (let i = childNodes.length - 1; i >= 0; i--) {
      let node = childNodes[i];
      if (currentZoomLayerNode === node || currentAnnotationNode === node) {
        continue;
      }
      div.removeChild(node);
    }
    div.removeAttribute('data-loaded');

    if (currentAnnotationNode) {
      // Hide the annotation layer until all elements are resized
      // so they are not displayed on the already resized page.
      this.annotationLayer.hide();
    } else if (this.annotationLayer) {
      this.annotationLayer.cancel();
      this.annotationLayer = null;
    }

    if (!currentZoomLayerNode) {
      if (this.canvas) {
        this.paintedViewportMap.delete(this.canvas);
        // Zeroing the width and height causes Firefox to release graphics
        // resources immediately, which can greatly reduce memory consumption.
        this.canvas.width = 0;
        this.canvas.height = 0;
        delete this.canvas;
      }
      this._resetZoomLayer();
    }
    if (this.svg) {
      this.paintedViewportMap.delete(this.svg);
      delete this.svg;
    }

    this.loadingIconDiv = document.createElement('div');
    this.loadingIconDiv.className = 'loadingIcon';
    div.appendChild(this.loadingIconDiv);
  }

  update(scale, rotation) {
    this.scale = scale || this.scale;
    if (typeof rotation !== 'undefined') { // The rotation may be zero.
      this.rotation = rotation;
    }

    let totalRotation = (this.rotation + this.pdfPageRotate) % 360;
    this.viewport = this.viewport.clone({
      scale: this.scale * CSS_UNITS,
      rotation: totalRotation,
    });

    if (this.svg) {
      this.cssTransform(this.svg, true);

      this.eventBus.dispatch('pagerendered', {
        source: this,
        pageNumber: this.id,
        cssTransform: true,
      });
      return;
    }

    let isScalingRestricted = false;
    if (this.canvas && this.maxCanvasPixels > 0) {
      let outputScale = this.outputScale;
      if (((Math.floor(this.viewport.width) * outputScale.sx) | 0) *
          ((Math.floor(this.viewport.height) * outputScale.sy) | 0) >
          this.maxCanvasPixels) {
        isScalingRestricted = true;
      }
    }

    if (this.canvas) {
      if (this.useOnlyCssZoom ||
          (this.hasRestrictedScaling && isScalingRestricted)) {
        this.cssTransform(this.canvas, true);

        this.eventBus.dispatch('pagerendered', {
          source: this,
          pageNumber: this.id,
          cssTransform: true,
        });
        return;
      }
      if (!this.zoomLayer && !this.canvas.hasAttribute('hidden')) {
        this.zoomLayer = this.canvas.parentNode;
        this.zoomLayer.style.position = 'absolute';
      }
    }
    if (this.zoomLayer) {
      this.cssTransform(this.zoomLayer.firstChild);
    }
    this.reset(/* keepZoomLayer = */ true, /* keepAnnotations = */ true);
  }

  /**
   * PLEASE NOTE: Most likely you want to use the `this.reset()` method,
   *              rather than calling this one directly.
   */
  cancelRendering(keepAnnotations = false) {
    if (this.paintTask) {
      this.paintTask.cancel();
      this.paintTask = null;
    }
    this.resume = null;

    if (this.textLayer) {
      this.textLayer.cancel();
      this.textLayer = null;
    }
    if (!keepAnnotations && this.annotationLayer) {
      this.annotationLayer.cancel();
      this.annotationLayer = null;
    }
  }

  cssTransform(target, redrawAnnotations = false) {
    // Scale target (canvas or svg), its wrapper and page container.
    let width = this.viewport.width;
    let height = this.viewport.height;
    let div = this.div;
    target.style.width = target.parentNode.style.width = div.style.width =
      Math.floor(width) + 'px';
    target.style.height = target.parentNode.style.height = div.style.height =
      Math.floor(height) + 'px';

    //----------------------------------tanglinhai 页面放大缩小调整top值 start------------------------------------
    var containerW = this.viewer.container.clientWidth;
    //target.style.left = target.parentNode.style.left = div.style.left = containerW <= Math.floor(width)? '0px' : (containerW - Math.floor(width))/ + 'px';
    if(containerW > Math.floor(width)){
      div.style.left = '50%';
      div.style.transform = 'translateX(-50%)';
    }else{
      div.style.left = '0px';
      div.style.transform = 'none';
    }

    var pageIndex_ = this.id -1;

    /*var viewportTotalHeight = 0;
    for(var i=0;i<this.viewer._pages.length;i++){
      var tmpPage = this.viewer._pages[i];
      if(pageIndex_ < i)
        tmpPage.div.style.top = viewportTotalHeight + 'px';
      viewportTotalHeight += Math.floor(this.viewer._pages[i].viewport.height) + 10;
    }*/

    //target.style.top = target.parentNode.style.top = div.style.top =  pageIndex_ == 0 ? 0 : this.viewer.currPageTotalHeight[pageIndex_] + 'px';
    //----------------------------------tanglinhai 页面放大缩小调整top值 end------------------------------------
    
    // The canvas may have been originally rotated; rotate relative to that.
    let relativeRotation = this.viewport.rotation -
                           this.paintedViewportMap.get(target).rotation;
    let absRotation = Math.abs(relativeRotation);
    let scaleX = 1, scaleY = 1;
    if (absRotation === 90 || absRotation === 270) {
      // Scale x and y because of the rotation.
      scaleX = height / width;
      scaleY = width / height;
    }
    let cssTransform = 'rotate(' + relativeRotation + 'deg) ' +
      'scale(' + scaleX + ',' + scaleY + ')';
    target.style.transform = cssTransform;

    if (this.textLayer) {
      // Rotating the text layer is more complicated since the divs inside the
      // the text layer are rotated.
      // TODO: This could probably be simplified by drawing the text layer in
      // one orientation and then rotating overall.
      let textLayerViewport = this.textLayer.viewport;
      let textRelativeRotation = this.viewport.rotation -
        textLayerViewport.rotation;
      let textAbsRotation = Math.abs(textRelativeRotation);
      let scale = width / textLayerViewport.width;
      if (textAbsRotation === 90 || textAbsRotation === 270) {
        scale = width / textLayerViewport.height;
      }
      let textLayerDiv = this.textLayer.textLayerDiv;
      let transX, transY;
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

      textLayerDiv.style.transform =
        'rotate(' + textAbsRotation + 'deg) ' +
        'scale(' + scale + ', ' + scale + ') ' +
        'translate(' + transX + ', ' + transY + ')';
      textLayerDiv.style.transformOrigin = '0% 0%';
    }

    if (redrawAnnotations && this.annotationLayer) {
      this.annotationLayer.render(this.viewport, 'display');
    }
  }

  get width() {
    return this.viewport.width;
  }

  get height() {
    return this.viewport.height;
  }

  getPagePoint(x, y) {
    return this.viewport.convertToPdfPoint(x, y);
  }

  draw() {
    if (this.renderingState !== RenderingStates.INITIAL) {
      console.error('Must be in new state before drawing');
      this.reset(); // Ensure that we reset all state to prevent issues.
    }

    if (!this.pdfPage) {
      this.renderingState = RenderingStates.FINISHED;
      return Promise.reject(new Error('Page is not loaded'));
    }

    this.renderingState = RenderingStates.RUNNING;

    let pdfPage = this.pdfPage;
    let div = this.div;
    // Wrap the canvas so that if it has a CSS transform for high DPI the
    // overflow will be hidden in Firefox.
    let canvasWrapper = document.createElement('div');
    canvasWrapper.style.width = div.style.width;
    canvasWrapper.style.height = div.style.height;
    canvasWrapper.classList.add('canvasWrapper');

    if (this.annotationLayer && this.annotationLayer.div) {
      // The annotation layer needs to stay on top.
      div.insertBefore(canvasWrapper, this.annotationLayer.div);
    } else {
      div.appendChild(canvasWrapper);
    }

    let textLayer = null;
    if (this.textLayerMode !== TextLayerMode.DISABLE && this.textLayerFactory) {
      let textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      textLayerDiv.style.width = canvasWrapper.style.width;
      textLayerDiv.style.height = canvasWrapper.style.height;
      if (this.annotationLayer && this.annotationLayer.div) {
        // The annotation layer needs to stay on top.
        div.insertBefore(textLayerDiv, this.annotationLayer.div);
      } else {
        div.appendChild(textLayerDiv);
      }

      textLayer = this.textLayerFactory.
        createTextLayerBuilder(textLayerDiv, this.id - 1, this.viewport,
            this.textLayerMode === TextLayerMode.ENABLE_ENHANCE);
    }
    this.textLayer = textLayer;

    let renderContinueCallback = null;
    if (this.renderingQueue) {
      renderContinueCallback = (cont) => {
        if (!this.renderingQueue.isHighestPriority(this)) {
          this.renderingState = RenderingStates.PAUSED;
          this.resume = () => {
            this.renderingState = RenderingStates.RUNNING;
            cont();
          };
          return;
        }
        cont();
      };
    }

    const finishPaintTask = async (error) => {
      // The paintTask may have been replaced by a new one, so only remove
      // the reference to the paintTask if it matches the one that is
      // triggering this callback.
      if (paintTask === this.paintTask) {
        this.paintTask = null;
      }

      if (error instanceof RenderingCancelledException) {
        this.error = null;
        return;
      }

      this.renderingState = RenderingStates.FINISHED;

      if (this.loadingIconDiv) {
        div.removeChild(this.loadingIconDiv);
        delete this.loadingIconDiv;
      }
      this._resetZoomLayer(/* removeFromDOM = */ true);

      this.error = error;
      this.stats = pdfPage.stats;
      if (this.onAfterDraw) {
        this.onAfterDraw();
      }
      this.eventBus.dispatch('pagerendered', {
        source: this,
        pageNumber: this.id,
        cssTransform: false,
      });

      if (error) {
        throw error;
      }
    };

    let paintTask = this.renderer === RendererType.SVG ?
      this.paintOnSvg(canvasWrapper) :
      this.paintOnCanvas(canvasWrapper);
    paintTask.onRenderContinue = renderContinueCallback;
    this.paintTask = paintTask;


    //-------------------------tanglinhai 改造page布局成absolute,改善性能 start-------------------------
    //var this_ = this;
    //-------------------------tanglinhai 改造page布局成absolute,改善性能 end-------------------------

    let resultPromise = paintTask.promise.then(function() {
      return finishPaintTask(null).then(function () {
        if (textLayer) {
          let readableStream = pdfPage.streamTextContent({
            normalizeWhitespace: true,
          });
          textLayer.setTextContentStream(readableStream);
          textLayer.render();

          //-------------------------tanglinhai 改造page布局成absolute,改善性能 start-------------------------
          //this_.viewer.container.appendChild(div);
          //-------------------------tanglinhai 改造page布局成absolute,改善性能 end-------------------------
        }
      });
    }, function(reason) {
      return finishPaintTask(reason);
    });

    if (this.annotationLayerFactory) {
      if (!this.annotationLayer) {
        this.annotationLayer = this.annotationLayerFactory.
          createAnnotationLayerBuilder(div, pdfPage, this.imageResourcesPath,
                                       this.renderInteractiveForms, this.l10n);
      }
      this.annotationLayer.render(this.viewport, 'display');
    }
    div.setAttribute('data-loaded', true);

    if (this.onBeforeDraw) {
      this.onBeforeDraw();
    }
    return resultPromise;
  }

  paintOnCanvas(canvasWrapper) {
    let renderCapability = createPromiseCapability();
    let result = {
      promise: renderCapability.promise,
      onRenderContinue(cont) {
        cont();
      },
      cancel() {
        renderTask.cancel();
      },
    };

    let viewport = this.viewport;
    let canvas = document.createElement('canvas');
    canvas.id = this.renderingId;

    // Keep the canvas hidden until the first draw callback, or until drawing
    // is complete when `!this.renderingQueue`, to prevent black flickering.
    canvas.setAttribute('hidden', 'hidden');
    let isCanvasHidden = true;
    let showCanvas = function () {
      if (isCanvasHidden) {
        canvas.removeAttribute('hidden');
        isCanvasHidden = false;
      }
    };

    canvasWrapper.appendChild(canvas);
    this.canvas = canvas;

    if (typeof PDFJSDev === 'undefined' ||
        PDFJSDev.test('MOZCENTRAL || FIREFOX || GENERIC')) {
      canvas.mozOpaque = true;
    }

    let ctx = canvas.getContext('2d', { alpha: false, });
    let outputScale = getOutputScale(ctx);
    this.outputScale = outputScale;

    if (this.useOnlyCssZoom) {
      let actualSizeViewport = viewport.clone({ scale: CSS_UNITS, });
      // Use a scale that makes the canvas have the originally intended size
      // of the page.
      outputScale.sx *= actualSizeViewport.width / viewport.width;
      outputScale.sy *= actualSizeViewport.height / viewport.height;
      outputScale.scaled = true;
    }

    if (this.maxCanvasPixels > 0) {
      let pixelsInViewport = viewport.width * viewport.height;
      let maxScale = Math.sqrt(this.maxCanvasPixels / pixelsInViewport);
      if (outputScale.sx > maxScale || outputScale.sy > maxScale) {
        outputScale.sx = maxScale;
        outputScale.sy = maxScale;
        outputScale.scaled = true;
        this.hasRestrictedScaling = true;
      } else {
        this.hasRestrictedScaling = false;
      }
    }

    let sfx = approximateFraction(outputScale.sx);
    let sfy = approximateFraction(outputScale.sy);
    canvas.width = roundToDivide(viewport.width * outputScale.sx, sfx[0]);
    canvas.height = roundToDivide(viewport.height * outputScale.sy, sfy[0]);
    canvas.style.width = roundToDivide(viewport.width, sfx[1]) + 'px';
    canvas.style.height = roundToDivide(viewport.height, sfy[1]) + 'px';
    // Add the viewport so it's known what it was originally drawn with.
    this.paintedViewportMap.set(canvas, viewport);

    // Rendering area
    let transform = !outputScale.scaled ? null :
      [outputScale.sx, 0, 0, outputScale.sy, 0, 0];
    let renderContext = {
      canvasContext: ctx,
      transform,
      viewport: this.viewport,
      enableWebGL: this.enableWebGL,
      renderInteractiveForms: this.renderInteractiveForms,
    };
    let renderTask = this.pdfPage.render(renderContext);
    renderTask.onContinue = function (cont) {
      showCanvas();
      if (result.onRenderContinue) {
        result.onRenderContinue(cont);
      } else {
        cont();
      }
    };

    renderTask.promise.then(function() {
      showCanvas();
      renderCapability.resolve(undefined);
    }, function(error) {
      showCanvas();
      renderCapability.reject(error);
    });
    return result;
  }

  paintOnSvg(wrapper) {
    if (typeof PDFJSDev !== 'undefined' &&
        PDFJSDev.test('FIREFOX || MOZCENTRAL || CHROME')) {
      // Return a mock object, to prevent errors such as e.g.
      // "TypeError: paintTask.promise is undefined".
      return {
        promise: Promise.reject(new Error('SVG rendering is not supported.')),
        onRenderContinue(cont) { },
        cancel() { },
      };
    }

    let cancelled = false;
    let ensureNotCancelled = () => {
      if (cancelled) {
        throw new RenderingCancelledException(
          'Rendering cancelled, page ' + this.id, 'svg');
      }
    };

    let pdfPage = this.pdfPage;
    let actualSizeViewport = this.viewport.clone({ scale: CSS_UNITS, });
    let promise = pdfPage.getOperatorList().then((opList) => {
      ensureNotCancelled();
      let svgGfx = new SVGGraphics(pdfPage.commonObjs, pdfPage.objs);
      return svgGfx.getSVG(opList, actualSizeViewport).then((svg) => {
        ensureNotCancelled();
        this.svg = svg;
        this.paintedViewportMap.set(svg, actualSizeViewport);

        svg.style.width = wrapper.style.width;
        svg.style.height = wrapper.style.height;
        this.renderingState = RenderingStates.FINISHED;
        wrapper.appendChild(svg);
      });
    });

    return {
      promise,
      onRenderContinue(cont) {
        cont();
      },
      cancel() {
        cancelled = true;
      },
    };
  }

  /**
   * @param {string|null} label
   */
  setPageLabel(label) {
    this.pageLabel = (typeof label === 'string' ? label : null);

    if (this.pageLabel !== null) {
      this.div.setAttribute('data-page-label', this.pageLabel);
    } else {
      this.div.removeAttribute('data-page-label');
    }
  }
}

export {
  PDFPageView,
};
