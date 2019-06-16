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
    this.div = div;
    //-------------------------tanglinhai 改造page布局成absolute,改善性能 start-------------------------
    this.container = container;
    this.viewer = options.viewer;
    this.isDivAddedToContainer = false;
    this.position = {
      width: Math.floor(this.viewport.width) + 10,
      height: Math.floor(this.viewport.height) + 10,
      row: 0,
      column: 0,
      top: 0,
      realTop: 0,
      left: 0,
      spread: this.getClonePositionSpreadObj()
    };
    //this.setInitPosition();
    //-------------------------tanglinhai 改造page布局成absolute,改善性能 end-------------------------
    div.style.width = Math.floor(this.viewport.width) + 'px';
    div.style.height = Math.floor(this.viewport.height) + 'px';
    div.setAttribute('data-page-number', this.id);
    //-------------------------tanglinhai 改造page布局成absolute,改善性能 start-------------------------
    //container.appendChild(div);
    if(this.id == 1 || this.id == this.viewer.pdfDocument.numPages){
      container.appendChild(div);
      this.isDivAddedToContainer = true;
      this.viewer._buffer.push(this);
    }
    //-------------------------tanglinhai 改造page布局成absolute,改善性能 end-------------------------
  }

  //-------------------------tanglinhai 改造page布局成absolute,改善性能 start-------------------------
  getClonePositionSpreadObj(spread) {
    if(spread){
      return {
          width: spread.width,
          height: spread.height,
          row: spread.row,
          column: spread.column,
          top: spread.top,
          realTop: spread.realTop,
          left: spread.left,
        }
    }else
      return {
          width: 0,
          height: 0,
          row: 0,
          column: 0,
          top: 0,
          realTop: 0,
          left: 0,
        }
  }

  setInitPosition() {
    var pageIndex_ = this.id -1;
    var containerW = this.container.clientWidth;
    var containerH = this.container.clientHeight;
    var pages = this.viewer._pages;
    const iMax = this.viewer.pdfDocument.numPages;
    if(this.viewer.scrollMode == ScrollMode.WRAPPED){//平铺模式
      var lineMaxH = 0;
      var lineMaxW = 0;
      if(this.viewer.spreadMode == SpreadMode.NONE){//平铺+单页
        if(this.id == 1){
          this.position.row = 0;
          this.position.column = 0;
          this.position.realTop = this.position.top = 0;
          this.position.realLeft = this.position.left = 0;
        }else{
          var lastPage = pages[pageIndex_-1];
          var column0Idx = pageIndex_-(lastPage.position.column+1);
          for(var i=column0Idx;i <= pageIndex_;i++){
            lineMaxW += pages[i].position.width;
            if(i < pageIndex_){
              lineMaxH = Math.max(lineMaxH, pages[i].position.height);
            }
          }
          if(lineMaxW > containerW){
            this.position.row = lastPage.position.row + 1;
            this.position.column = 0;
            this.position.realTop = this.position.top = lastPage.position.top + lineMaxH;
            this.position.realLeft = this.position.left = 0;
            //以上新的一行开始，可以 TODO 处理上一行左右居中问题待完成 。。。。
            this.adjustLastLineLeft(this.id - 2, containerW);
          }else{
            this.position.row = lastPage.position.row;
            this.position.column = lastPage.position.column + 1;
            this.position.realTop = this.position.top = lastPage.position.top;
            if(lineMaxH > this.position.height){
              this.position.realTop = this.position.top + (lineMaxH - this.position.height)/2
            }else if(lineMaxH < this.position.height){
              for(var i=column0Idx;i < pageIndex_;i++){
                if(pages[i].position.height < this.position.height){
                  pages[i].position.realTop = this.position.top + (this.position.height - pages[i].position.height)/2
                }
              }
            }
            this.position.realLeft = this.position.left = lastPage.position.left + lastPage.position.width;
          }
        }
        //console.log('=====================',this.id,'=====',this.position.top, this.position.left, this.position.column);
        this.setDivStyle(this);
        //以上新的一行开始，可以 TODO 处理上一行左右居中问题待完成 。。。。
        if(this.id == iMax)
          this.adjustLastLineLeft(this.id - 1, containerW);
      }else{//平铺+双页或者书籍
        const parity = this.viewer.spreadMode % 2;
        var spreadMaxH;
        var spreadW;
        if(pageIndex_ % 2 === parity || this.id == iMax){
          if(
                ((this.id == iMax && iMax > 1) && 
                  ((this.viewer.spreadMode == SpreadMode.ODD && iMax%2 == 0) || 
                  (this.viewer.spreadMode == SpreadMode.EVEN && iMax%2 == 1)))    ||
                (this.id < iMax && this.id > 1)
              ){
            spreadMaxH = Math.max(this.position.height, pages[pageIndex_ - 1].position.height);
            spreadW = this.position.width + pages[pageIndex_ - 1].position.width;

            pages[pageIndex_ - 1].position.spread.width = spreadW;
            pages[pageIndex_ - 1].position.spread.height = spreadMaxH;
          } else {
            spreadMaxH = this.position.height;
            spreadW = this.position.width;
          }
          this.position.spread.width = spreadW;
          this.position.spread.height = spreadMaxH;

          if(iMax == 1 || this.viewer.spreadMode == SpreadMode.ODD && this.id == 2 ||
              this.viewer.spreadMode == SpreadMode.EVEN && this.id == 1){
            this.position.spread.row = 0;
            this.position.spread.column = 0;
            this.position.spread.realTop = this.position.spread.top = 0;
            this.position.spread.realLeft = this.position.spread.left = 0;
            if(this.viewer.spreadMode == SpreadMode.ODD && this.id == 2){
              pages[0].position.spread = this.position.spread;
              //console.log('=====================',pages[0].id,'=====',pages[0].position.spread.top, pages[0].position.spread.left, pages[0].position.spread.row, pages[0].position.spread.column);
              pages[0].setDivStyle(pages[0], 'spread');
            }
          }else{
            var lastSpreadIdxDiff = pageIndex_ % 2 != parity ? 1 : 2;
            var lastSpreadView = pages[pageIndex_ - lastSpreadIdxDiff];
            var spreadColumn0Idx = pageIndex_ - lastSpreadView.position.spread.column * 2 - lastSpreadIdxDiff;
            var maxI = pageIndex_ - lastSpreadIdxDiff;
            for(var i = spreadColumn0Idx;i <= maxI;i+=2){
              lineMaxW += pages[i].position.spread.width;
              lineMaxH = Math.max(lineMaxH, pages[i].position.spread.height);
            }
            lineMaxW += spreadW;
            if(lineMaxW > containerW){
              this.position.spread.row = lastSpreadView.position.spread.row + 1;
              this.position.spread.column = 0;
              this.position.spread.realTop = this.position.spread.top = lastSpreadView.position.spread.top + lineMaxH;
              this.position.spread.realLeft = this.position.spread.left = 0;
              //以上新的一行开始，可以 TODO 处理上一行左右居中问题待完成 。。。。
              this.adjustLastLineLeft(lastSpreadView.id - 1, containerW, 'spread');
            }else{
              this.position.spread.row = lastSpreadView.position.spread.row;
              this.position.spread.column = lastSpreadView.position.spread.column + 1;
              this.position.spread.realTop = this.position.spread.top = lastSpreadView.position.spread.top;
              this.position.spread.realLeft = this.position.spread.left = lastSpreadView.position.spread.left + lastSpreadView.position.spread.width;
              if(lineMaxH > this.position.spread.height){
                this.position.spread.realTop = this.position.spread.top + (lineMaxH - this.position.spread.height)/2
              }else if(lineMaxH < this.position.spread.height){
                for(var i = spreadColumn0Idx;i <= maxI;i+=2){
                  if(pages[i].position.spread.height < this.position.spread.height){
                    pages[i].position.spread.realTop = this.position.spread.top + (this.position.spread.height - pages[i].position.spread.height)/2
                  }
                }
              }
            }
            if(pageIndex_ > 0 && lastSpreadIdxDiff == 2){
              pages[pageIndex_ - 1].position.spread = this.position.spread;
              //console.log('=====================',pages[pageIndex_ - 1].id,'=====',pages[pageIndex_ - 1].position.spread.top, pages[pageIndex_ - 1].position.spread.left, pages[pageIndex_ - 1].position.spread.row, pages[pageIndex_ - 1].position.spread.column);
              pages[pageIndex_ - 1].setDivStyle(pages[pageIndex_ - 1], 'spread');
            }
          }
          //console.log('=====================',this.id,'=====',this.position.spread.top, this.position.spread.left, this.position.spread.row, this.position.spread.column);
          this.setDivStyle(this, 'spread');
          //以上新的一行开始，可以 TODO 处理上一行左右居中问题待完成 。。。。
          if(this.id == iMax)
            this.adjustLastLineLeft(this.id - 1, containerW, 'spread');
        }
      }
    }else if(this.viewer.scrollMode == ScrollMode.HORIZONTAL){//水平滚动模式
      if(this.viewer.spreadMode == SpreadMode.NONE) {//水平+单页
        if(this.id == 1) {
          this.position.column = 0;
          this.position.realLeft = this.position.left = 0;
        }else{
          var lastPageView = pages[pageIndex_ - 1];
          this.position.column = lastPageView.position.column + 1;
          this.position.realLeft = this.position.left = lastPageView.position.left + lastPageView.position.width;
        }
        this.position.realTop = this.position.top = containerH > this.position.height ? (containerH - this.position.height)/2 : 0;
        this.setDivStyle(this);
      }else{//水平+双页或者书籍
        const parity = this.viewer.spreadMode % 2;
        var spreadMaxH;
        var spreadW;
        if(pageIndex_ % 2 === parity || this.id == iMax){
          if(
                ((this.id == iMax && iMax > 1) && 
                  ((this.viewer.spreadMode == SpreadMode.ODD && iMax%2 == 0) || 
                  (this.viewer.spreadMode == SpreadMode.EVEN && iMax%2 == 1)))    ||
                (this.id < iMax && this.id > 1)
              ){
            spreadMaxH = Math.max(this.position.height, pages[pageIndex_ - 1].position.height);
            spreadW = this.position.width + pages[pageIndex_ - 1].position.width;

            pages[pageIndex_ - 1].position.spread.width = spreadW;
            pages[pageIndex_ - 1].position.spread.height = spreadMaxH;
          } else {
            spreadMaxH = this.position.height;
            spreadW = this.position.width;
          }
          this.position.spread.width = spreadW;
          this.position.spread.height = spreadMaxH;

          if(iMax == 1 || this.viewer.spreadMode == SpreadMode.ODD && this.id == 2 ||
              this.viewer.spreadMode == SpreadMode.EVEN && this.id == 1){
            this.position.spread.column = 0;
            this.position.spread.realLeft = this.position.spread.left = 0;
            if(this.viewer.spreadMode == SpreadMode.ODD && this.id == 2){
              pages[0].position.spread = this.position.spread;
            }
          }else{
            var lastSpreadIdxDiff = pageIndex_ % 2 != parity ? 1 : 2;
            var lastSpreadView = pages[pageIndex_ - lastSpreadIdxDiff];
            this.position.spread.column = lastSpreadView.position.spread.column + 1;
            this.position.spread.realLeft = this.position.spread.left = lastSpreadView.position.spread.left + lastSpreadView.position.spread.width;
            if(pageIndex_ > 0 && lastSpreadIdxDiff == 2){
              pages[pageIndex_ - 1].position.spread = this.position.spread;
            }
          }
          this.position.spread.realTop = this.position.spread.top = containerH > this.position.spread.height ? (containerH - this.position.spread.height)/2 : 0;
        }
        this.setDivStyle(this, 'spread');
      }
    }else if(this.viewer.spreadMode == SpreadMode.NONE){//垂直+单页
      if(this.id == 1) {
        this.position.row = 0;
        this.position.realTop = this.position.top = 0;
      }else{
        var lastPageView = pages[pageIndex_ - 1];
        this.position.row = lastPageView.position.row + 1;
        this.position.realTop = this.position.top = lastPageView.position.top + lastPageView.position.height;
      }
      this.position.realLeft = this.position.left = containerW > this.position.width ? (containerW - this.position.width)/2 : 0;
      this.setDivStyle(this);
    }else{//垂直+双页或者书籍

      const parity = this.viewer.spreadMode % 2;
      var spreadMaxH;
      var spreadW;
      if(pageIndex_ % 2 === parity || this.id == iMax){
        if(
              ((this.id == iMax && iMax > 1) && 
                ((this.viewer.spreadMode == SpreadMode.ODD && iMax%2 == 0) || 
                (this.viewer.spreadMode == SpreadMode.EVEN && iMax%2 == 1)))    ||
              (this.id < iMax && this.id > 1)
            ){
          spreadMaxH = Math.max(this.position.height, pages[pageIndex_ - 1].position.height);
          spreadW = this.position.width + pages[pageIndex_ - 1].position.width;

          pages[pageIndex_ - 1].position.spread.width = spreadW;
          pages[pageIndex_ - 1].position.spread.height = spreadMaxH;
        } else {
          spreadMaxH = this.position.height;
          spreadW = this.position.width;
        }
        this.position.spread.width = spreadW;
        this.position.spread.height = spreadMaxH;

        if(iMax == 1 || this.viewer.spreadMode == SpreadMode.ODD && this.id == 2 ||
            this.viewer.spreadMode == SpreadMode.EVEN && this.id == 1){
          this.position.spread.row = 0;
          this.position.spread.realTop = this.position.spread.top = 0;
          if(this.viewer.spreadMode == SpreadMode.ODD && this.id == 2){
            pages[0].position.spread = this.position.spread;
          }
        }else{
          var lastSpreadIdxDiff = pageIndex_ % 2 != parity ? 1 : 2;
          var lastSpreadView = pages[pageIndex_ - lastSpreadIdxDiff];
          this.position.spread.row = lastSpreadView.position.spread.row + 1;
          this.position.spread.realTop = this.position.spread.top = lastSpreadView.position.spread.top + lastSpreadView.position.spread.height;
          if(pageIndex_ > 0 && lastSpreadIdxDiff == 2){
            pages[pageIndex_ - 1].position.spread = this.position.spread;
          }
        }
        this.position.spread.realLeft = this.position.spread.left = containerW > this.position.spread.width ? (containerW - this.position.spread.width)/2 : 0;
      }
      this.setDivStyle(this, 'spread');
    }
  }



  setDivStyle(pageView, type) {
    if(type != 'spread'){
      var div = pageView.div;
      var cssStyle = pageView.position;
      div.style.left = cssStyle.realLeft + 'px';
      div.style.top = cssStyle.realTop + 'px';
    }else{
      var div = pageView.div.parentNode;
      if(div){
        var cssStyle = pageView.position.spread;
        div.style.left = cssStyle.realLeft + 'px';
        div.style.top = cssStyle.realTop + 'px';
      }
    }
    
  }
  //-------------------------tanglinhai 改造page布局成absolute,改善性能 end-------------------------

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
    //-------------------------tanglinhai 改造page布局成absolute,改善性能 start-------------------------
    if(this.isDivAddedToContainer){
      if (this._spreadMode === SpreadMode.NONE) {
        this.div = this.viewer.viewer.removeChild(this.div);
      } else {
        var spreadDiv = this.div.parentNode;
        this.div = spreadDiv.removeChild(this.div);
        if(spreadDiv.childNodes.length == 0){
          this.viewer.viewer.removeChild(spreadDiv);
        }
      }
    }
    this.isDivAddedToContainer = false;
    //-------------------------tanglinhai 改造page布局成absolute,改善性能 end-------------------------
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




  //----------------tanglinhai 上一行居中代码 start -------------------------- 
  adjustLastLineLeft(lastLineLastEleIdx, containerW, type){
    var pages = this.viewer._pages;
    var pagesLen = pages.length;
    var lastLineMaxW = 0;
    if(type == 'spread'){
      for(var j = lastLineLastEleIdx;j > -1;j-=2){
        lastLineMaxW += pages[j].position.spread.width;
        if(pages[j].position.spread.column == 0){
          break;
        }
      }
      /*var i=lastLineLastEleIdx+2;
      if(i<pagesLen){
        while(i<pagesLen){
          if(pages[i].position.spread.column != 0){
            lastLineMaxW += pages[i].position.spread.width;
          }else{
            break;
          }
          i+=2;
        }
      }else if(i - 1 < pagesLen && pages[i - 1].position.spread.column != 0){
        lastLineMaxW += pages[i - 1].position.spread.width;
      }*/


      var leftDiff = (containerW - lastLineMaxW)/2;
      //console.log('lastLineLastEleIdx:'+lastLineLastEleIdx,'containerW:'+containerW,'lastLineMaxW:'+lastLineMaxW,'leftDiff:'+leftDiff);
      if(leftDiff > 0){
        for(var j = lastLineLastEleIdx;j > -1;j-=2){
          pages[j].position.spread.realLeft = pages[j].position.spread.left + leftDiff;
          //console.log('pageIndex:'+j,pages[j].position.spread.left+'=================='+leftDiff+'-----------:'+pages[j].position.spread.realLeft);
          if(pages[j].isDivAddedToContainer)
            pages[j].div.parentNode.style.left = pages[j].position.spread.realLeft+'px';
          if(pages[j].position.spread.column == 0){
            break;
          }
        }

        /*var i=lastLineLastEleIdx+2;
        if(i<pagesLen){
          while(i<pagesLen){
            if(pages[i].position.spread.column != 0){
              pages[i].position.spread.realLeft = pages[i].position.spread.left + leftDiff;
              if(pages[i].isDivAddedToContainer)
                pages[i].div.parentNode.style.left = pages[i].position.spread.realLeft+'px';
            }else{
              break;
            }
            i+=2;
          }
        }else if(i - 1 < pagesLen && pages[i - 1].position.spread.column != 0){
          pages[i - 1].position.spread.realLeft = pages[i - 1].position.spread.left + leftDiff;
          if(pages[i - 1].isDivAddedToContainer)
            pages[i - 1].div.parentNode.style.left = pages[i - 1].position.spread.realLeft+'px';
        }*/

      }
    } else {
      for(var j = lastLineLastEleIdx;j > -1;j--){
        lastLineMaxW += pages[j].position.width;
        if(pages[j].position.column == 0){
          break;
        }
      }
      var leftDiff = (containerW - lastLineMaxW)/2;
      if(leftDiff > 0)
      for(var j = lastLineLastEleIdx;j > -1;j--){
        pages[j].position.realLeft = pages[j].position.left += leftDiff;
        pages[j].div.style.left = pages[j].position.realLeft+'px';
        if(pages[j].position.column == 0){
          break;
        }
      }
    }
  }
  //----------------tanglinhai 上一行居中代码 end --------------------------

  //-------------------------tanglinhai 改造page布局成absolute,改善性能 start-------------------------
  repositionAllPages(){
    this.reposition(0);
  }


  reposition(pageIdx){
    //var startTime = new Date().getTime();
    var pages = this.viewer._pages;
    var pagesLen = pages.length;
    var pageIndex_ = pageIdx > -1 ? pageIdx : this.id -1;
    var viewportTotalHeight = 0;
    var containerW = this.viewer.container.clientWidth;
    var containerH = this.viewer.container.clientHeight;

    /*var newW = Math.floor(this.viewport.width) + 10;
    var newH = Math.floor(this.viewport.height) + 10;
    var isWidthChange = newW != this.position.width;
    var isHeightChange = newH != this.position.height;*/


    //div.style.left = containerW <= Math.floor(this.viewport.width)? '0px' : (containerW - Math.floor(this.viewport.width))/2 + 'px';
    if(this.viewer.scrollMode == ScrollMode.WRAPPED){//平铺模式
      var lineMaxH = 0;
      var lineMaxW = 0;
      var lineItemCount = 0;

      if(this.viewer.spreadMode == SpreadMode.NONE){//平铺+单页
        //if(isWidthChange || isHeightChange) {
          var column0Idx = pageIndex_ - this.position.column;
          //console.log('pageIndex_='+pageIndex_+',column0Idx='+column0Idx, ',column='+this.position.column);
          for(var i=column0Idx;i<pagesLen;i++){
            var page_ = pages[i];
            var lastPage_ = i == 0 ? null : pages[i-1];
            var pageW_ = page_.position.width;
            var pageH_ = page_.position.height;
            var lineMaxW_ = lineMaxW + pageW_;

            if(i > 0 && lineMaxW_ > containerW){
              page_.position.row = lastPage_ ? lastPage_.position.row + 1 : 0;
              page_.position.column = 0;
              page_.position.realTop = page_.position.top = lastPage_ ? lastPage_.position.top + lineMaxH : 0;
              page_.position.realLeft = page_.position.left = 0;
              lineMaxH = pageH_;
              lineMaxW = pageW_;
              lineItemCount = 1;
              column0Idx = i;

              this.adjustLastLineLeft(i - 1, containerW);
            }else{
              lineItemCount++;

              if(lastPage_){
                page_.position.row = lastPage_.position.row;
                page_.position.column = lineItemCount - 1;
                if(lineItemCount == 1){
                  var lastLineMaxH = 0;
                  for(var j = i - 1;j > -1;j--){
                    lastLineMaxH = Math.max(pages[j].position.height, lastLineMaxH);
                    if(pages[j].position.column == 0){
                      break;
                    }
                  }
                  page_.position.realTop = page_.position.top = lastPage_.position.top + lastLineMaxH;
                  page_.position.realLeft = page_.position.left = 0;
                }else{
                  page_.position.realTop = page_.position.top = lastPage_.position.top;  
                  page_.position.realLeft = page_.position.left = lastPage_.position.left + lastPage_.position.width;

                  if(lineMaxH > page_.position.height){
                    page_.position.realTop = page_.position.top + (lineMaxH - page_.position.height)/2
                  }else if(lineMaxH < page_.position.height){
                    //console.log('-------111----------',page_.id,'-------',page_.position.top, page_.position.left, page_.position.column);
                    for(var j=column0Idx;j < i;j++){
                      if(pages[j].position.height < page_.position.height){
                        pages[j].position.realTop = page_.position.top + (page_.position.height - pages[j].position.height)/2
                        pages[j].div.style.top = pages[j].position.realTop+'px';
                      }
                    }
                  }
                }
              } else {
                page_.position.row = 0;
                page_.position.column = 0;
                page_.position.realTop = page_.position.top = 0;
                page_.position.realLeft = page_.position.left = 0;
              }
              /*if(page_.id == 43 || page_.id == 44)
              console.log(lineMaxH+'==========='+page_.id+'========='+page_.position.height+',===='+(lineMaxH < page_.position.height));*/

              
              if(lineItemCount < 2){
                lineMaxH = pageH_;
              }else{
                lineMaxH = Math.max(lineMaxH, pageH_);
              }
              lineMaxW = lineMaxW_;
            }
            this.setDivStyle(page_);
            //最后一行开始，可以 TODO 处理上一行左右居中问题待完成 。。。。
            if(page_.id == pagesLen)
              this.adjustLastLineLeft(pagesLen - 1, containerW);
          }
        //}
      }else{//平铺+双页或者书籍

        //if(isWidthChange || isHeightChange) {
          const parity = this.viewer.spreadMode % 2;
          var lastSpreadIdxDiff = pageIndex_ % 2 != parity ? 1 : 2;
          var lastSpreadView = this.viewer.spreadMode == SpreadMode.ODD && pageIndex_ < 2 ||
            this.viewer.spreadMode == SpreadMode.EVEN && pageIndex_ < 1 ? null : pages[pageIndex_ - lastSpreadIdxDiff];

          var spreadColumn0Idx = !lastSpreadView ? 0 : pageIndex_ - lastSpreadView.position.spread.column * 2 - lastSpreadIdxDiff;
          //console.log('=====lastSpreadView1=====',spreadColumn0Idx,'pageIndex_:'+pageIndex_,'lastSpreadIdxDiff:'+lastSpreadIdxDiff)
          spreadColumn0Idx = spreadColumn0Idx % 2 == parity ? spreadColumn0Idx : spreadColumn0Idx - 1;
          //console.log('=====lastSpreadView2=====',spreadColumn0Idx,this.id,this.position.spread.width,this.position.spread.height,this.position.spread.top,this.position.spread.left,this.position.spread.row,this.position.spread.column)
          if(spreadColumn0Idx > -1){
            var maxI = pageIndex_ - lastSpreadIdxDiff;
            for(var i = spreadColumn0Idx;i <= maxI;i+=2){
              lineMaxW += pages[i].position.spread.width;
              lineMaxH = Math.max(lineMaxH, pages[i].position.spread.height);
              lineItemCount++;
            }
          }
          /*if(lastSpreadView)
            console.log('=====lastSpreadView3=====',lastSpreadView.id,'-----',lastSpreadView.position,', lastLine:'+lineMaxW+','+lineMaxH);
          else
            console.log('=====lastSpreadView4===== lastLine:'+lineMaxW+','+lineMaxH);*/
          /*var lineMaxW_ = lineMaxW + spreadW;
          if(lineMaxW_ > containerW){
            viewportTotalHeight += lineMaxH;
              page_.div.parentNode.style.top = viewportTotalHeight+'px';
              page_.div.parentNode.style.left = '0px';
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
              page_.div.parentNode.style.top = viewportTotalHeight+'px';
              page_.div.parentNode.style.left = lineMaxW+'px';
            lineMaxW = lineMaxW_;
          }*/
          for (var i = pageIndex_; i < pagesLen; ++i) {
            if(i % 2 === parity || i == pagesLen - 1){
              var spreadMaxH;
              var spreadW;
              var page_ = pages[i];
              page_.position.spread = this.getClonePositionSpreadObj(page_.position.spread);
              if(
                  ((i == pagesLen - 1 && pagesLen > 1) && 
                    ((this.viewer.spreadMode == SpreadMode.ODD && pagesLen%2 == 0) || 
                    (this.viewer.spreadMode == SpreadMode.EVEN && pagesLen%2 == 1)))   ||
                  (i < pagesLen - 1 && i > 0)
                ){
                spreadMaxH = Math.max(page_.position.height, pages[i-1].position.height);
                spreadW = page_.position.width + pages[i-1].position.width;
              }else {
                spreadMaxH = page_.position.height;
                spreadW = page_.position.width;
              }
              
              page_.position.spread.width = spreadW;
              page_.position.spread.height = spreadMaxH;
              var lastSpreadIdxDiff = i % 2 != parity ? 1 : 2;
              lastSpreadView = pages[i - lastSpreadIdxDiff];

              

              var lineMaxW_ = lineMaxW + spreadW;
              if(lastSpreadView && lineMaxW_ > containerW){
                page_.position.spread.row = lastSpreadView.position.spread.row + 1;
                page_.position.spread.column = 0;
                page_.position.spread.realTop = page_.position.spread.top = lastSpreadView.position.spread.top + lineMaxH;
                page_.position.spread.realLeft = page_.position.spread.left = 0;

                lineMaxH = spreadMaxH;
                lineMaxW = spreadW;
                lineItemCount = 1;
                spreadColumn0Idx = i;
                //以上新的一行开始，可以 TODO 处理上一行左右居中问题待完成 。。。。
                this.adjustLastLineLeft(lastSpreadView.id - 1, containerW, 'spread');
              }else{
                lineItemCount++;
                if(lineItemCount < 2){
                  lineMaxH = spreadMaxH;
                }else{
                  lineMaxH = Math.max(lineMaxH, spreadMaxH);
                }
                if(lastSpreadView){
                  page_.position.spread.row = lastSpreadView.position.spread.row;
                  page_.position.spread.column = lastSpreadView.position.spread.column + 1;
                  page_.position.spread.realTop = page_.position.spread.top = lastSpreadView.position.spread.top;
                  //console.log('-----------lastSpreadView5---------',lastSpreadView.id);
                  page_.position.spread.realLeft = page_.position.spread.left = lastSpreadView.position.spread.left + lastSpreadView.position.spread.width;
                  //console.log(lineMaxH+'------------'+lineItemCount+'------------------',pageIndex_,page_.position.spread.height,JSON.stringify(page_.position.spread),page_.id);
                  if(lineMaxH > page_.position.spread.height){
                    page_.position.spread.realTop = page_.position.spread.top + (lineMaxH - page_.position.spread.height)/2
                  }else if(lineMaxH < page_.position.spread.height){
                    for(var j = spreadColumn0Idx;j <= i;j+=2){
                      if(pages[j].position.spread.height < page_.position.spread.height){
                        pages[j].position.spread.realTop = pages[j].position.spread.top + (page_.position.spread.height - pages[j].position.spread.height)/2
                        pages[j].parentNode.style.top = pages[j].position.spread.realTop+'px';
                      }
                    }
                  }
                }else{
                  page_.position.spread.row = 0;
                  page_.position.spread.column = 0;
                  page_.position.spread.realTop = page_.position.spread.top = 0;
                  page_.position.spread.realLeft = page_.position.spread.left = 0;
                }
                lineMaxW = lineMaxW_;
              }
              if(i > 0 && lastSpreadIdxDiff == 2){
                pages[i - 1].position.spread = page_.position.spread;
                //console.log('-----------1---------',(this == pages[i - 1]),pages[i - 1].id,'-----',pages[i - 1].position.spread.width,pages[i - 1].position.spread.height,pages[i - 1].position.spread.top, pages[i - 1].position.spread.left, pages[i - 1].position.spread.row, pages[i - 1].position.spread.column);
              }
              this.setDivStyle(page_, 'spread');
              //console.log('-----------2---------',(this == page_),page_.id,'-----',page_.position.spread.width,page_.position.spread.height,page_.position.spread.top, page_.position.spread.left, page_.position.spread.row, page_.position.spread.column);
              //最后一行开始，可以 TODO 处理上一行左右居中问题待完成 。。。。
              if(page_.id == pagesLen)
                this.adjustLastLineLeft(page_.id - 1, containerW, 'spread');
            }
          }
        //}
      }
    }else if(this.viewer.scrollMode == ScrollMode.HORIZONTAL){//水平滚动模式
      
      if(this.viewer.spreadMode == SpreadMode.NONE){//水平+单页

        for(var i=pageIndex_;i<pagesLen;i++){
          var page_ = pages[i];
          if(i == 0){
            page_.position.column = 0;
            page_.position.realLeft = page_.position.left = 0;
          }else{
            var lastPageView = pages[i - 1];
            page_.position.column = lastPageView.position.column + 1;
            page_.position.realLeft = page_.position.left = lastPageView.position.left + lastPageView.position.width;
          }
          page_.position.realTop = page_.position.top = containerH > page_.position.height ? (containerH - page_.position.height)/2 : 0;
          this.setDivStyle(page_);
        }
      }else{//水平+双页或者书籍
        const parity = this.viewer.spreadMode % 2;
        for (let i = pageIndex_; i < pagesLen; ++i) {
          var page_ = pages[i];
          var spreadMaxH;
          var spreadW;
          if(i % 2 === parity || i == pagesLen - 1){
            page_.position.spread = this.getClonePositionSpreadObj(page_.position.spread);
            if(
                  ((i == pagesLen && pagesLen > 1) && 
                    ((this.viewer.spreadMode == SpreadMode.ODD && pagesLen%2 == 0) || 
                    (this.viewer.spreadMode == SpreadMode.EVEN && pagesLen%2 == 1)))    ||
                  (i < pagesLen - 1 && i > 0)
                ){
              spreadMaxH = Math.max(page_.position.height, pages[i - 1].position.height);
              spreadW = page_.position.width + pages[i - 1].position.width;

              pages[i - 1].position.spread.width = spreadW;
              pages[i - 1].position.spread.height = spreadMaxH;
            } else {
              spreadMaxH = page_.position.height;
              spreadW = page_.position.width;
            }
            page_.position.spread.width = spreadW;
            page_.position.spread.height = spreadMaxH;

            if(pagesLen == 1 || this.viewer.spreadMode == SpreadMode.ODD && i == 1 ||
                this.viewer.spreadMode == SpreadMode.EVEN && i == 0){
              page_.position.spread.column = 0;
              page_.position.spread.realLeft = page_.position.spread.left = 0;
              if(this.viewer.spreadMode == SpreadMode.ODD && i == 1){
                pages[0].position.spread = page_.position.spread;
              }
            }else{
              var lastSpreadIdxDiff = i % 2 != parity ? 1 : 2;
              var lastSpreadView = pages[i - lastSpreadIdxDiff];
              page_.position.spread.column = lastSpreadView.position.spread.column + 1;
              page_.position.spread.realLeft = page_.position.spread.left = lastSpreadView.position.spread.left + lastSpreadView.position.spread.width;
              if(i > 0 && lastSpreadIdxDiff == 2){
                pages[i - 1].position.spread = page_.position.spread;
              }
            }
            page_.position.spread.realTop = page_.position.spread.top = containerH > page_.position.spread.height ? (containerH - page_.position.spread.height)/2 : 0;
            this.setDivStyle(page_, 'spread');
          }
        }
      }
    }else if(this.viewer.spreadMode == SpreadMode.NONE){//垂直+单页
      for(var i=pageIndex_;i<pagesLen;i++){
        var page_ = pages[i];
        if(i == 0) {
          page_.position.row = 0;
          page_.position.realTop = page_.position.top = 0;
        }else{
          var lastPageView = pages[i - 1];
          page_.position.row = lastPageView.position.row + 1;
          page_.position.realTop = page_.position.top = lastPageView.position.top + lastPageView.position.height;
        }
        page_.position.realLeft = page_.position.left = containerW > page_.position.width ? (containerW - page_.position.width)/2 : 0;
        this.setDivStyle(page_);
      }
    }else{//垂直+双页或者书籍
      const parity = this.viewer.spreadMode % 2;
      for (let i = pageIndex_; i < pagesLen; ++i) {
        var page_ = pages[i];
        var spreadMaxH;
        var spreadW;
        if(i % 2 === parity || i == pagesLen - 1){
          page_.position.spread = this.getClonePositionSpreadObj(page_.position.spread);
          if(
                ((i == pagesLen - 1 && pagesLen > 1) && 
                  ((this.viewer.spreadMode == SpreadMode.ODD && pagesLen%2 == 0) || 
                  (this.viewer.spreadMode == SpreadMode.EVEN && pagesLen%2 == 1)))    ||
                (i < pagesLen - 1 && i > 0)
              ){
            spreadMaxH = Math.max(page_.position.height, pages[i - 1].position.height);
            spreadW = page_.position.width + pages[i - 1].position.width;

            /*pages[i - 1].position.spread.width = spreadW;
            pages[i - 1].position.spread.height = spreadMaxH;*/
          } else {
            spreadMaxH = page_.position.height;
            spreadW = page_.position.width;
          }
          page_.position.spread.width = spreadW;
          page_.position.spread.height = spreadMaxH;

          if(pagesLen == 1 || this.viewer.spreadMode == SpreadMode.ODD && i == 1 ||
              this.viewer.spreadMode == SpreadMode.EVEN && i == 0){
            page_.position.spread.row = 0;
            page_.position.spread.realTop = page_.position.spread.top = 0;
            if(this.viewer.spreadMode == SpreadMode.ODD && i == 1){
              pages[0].position.spread = page_.position.spread;
            }
          }else{
            var lastSpreadIdxDiff = i % 2 != parity ? 1 : 2;
            var lastSpreadView = pages[i - lastSpreadIdxDiff];
            page_.position.spread.row = lastSpreadView.position.spread.row + 1;
            page_.position.spread.realTop = page_.position.spread.top = lastSpreadView.position.spread.top + lastSpreadView.position.spread.height;
            if(i > 0 && lastSpreadIdxDiff == 2){
              pages[i - 1].position.spread = page_.position.spread;
            }
          }
          page_.position.spread.realLeft = page_.position.spread.left = containerW > page_.position.spread.width ? (containerW - page_.position.spread.width)/2 : 0;
          this.setDivStyle(page_, 'spread');
        }
      }
    }
    //console.log('第'+pageIndex_+'页,reset耗时(秒)：'+(new Date().getTime()-startTime)/1000);
  }
  //-------------------------tanglinhai 改造page布局成absolute,改善性能 end-------------------------
  reset(keepZoomLayer = false, keepAnnotations = false) {
    this.cancelRendering(keepAnnotations);
    this.renderingState = RenderingStates.INITIAL;

    let div = this.div;


    //-------------------------tanglinhai 改造page布局成absolute,改善性能 start-------------------------
    /*div.style.width = Math.floor(this.viewport.width) + 'px';
    div.style.height = Math.floor(this.viewport.height) + 'px';*/

    var newW = Math.floor(this.viewport.width);
    var newH = Math.floor(this.viewport.height);
    div.style.width = newW + 'px';
    div.style.height = newH + 'px';

    //console.log(this.id,Math.floor(this.viewport.width),Math.floor(this.viewport.height),'=========reset========',this.position.width,this.position.height);
    //if(isWidthChange){
      /*if(this.viewer.spreadMode == SpreadMode.ODD || this.viewer.spreadMode == SpreadMode.EVEN){
        this.position.spread.width = this.position.spread.width - this.position.width + newW;
        var brotherPages = [pages[pageIndex_-1],pages[pageIndex_+1]];
        for(var i=0;i<brotherPages.length;i++){
          if(brotherPages[i].position.spread.row == this.position.spread.row &&
                brotherPages[i].position.spread.column == this.position.spread.column){
            brotherPages[i].position.spread = this.position.spread;
          }
        }
      }*/
      this.position.width = newW + 10;
    //}
    //if(isHeightChange){
      /*var pages = this.viewer._pages;
      var pageIndex_ = this.id - 1;
      if(this.viewer.spreadMode == SpreadMode.ODD || this.viewer.spreadMode == SpreadMode.EVEN){
        var brotherPages = [pages[pageIndex_-1],pages[pageIndex_+1]];
        for(var i=0;i<brotherPages.length;i++){
          if(brotherPages[i] && brotherPages[i].position.spread.row == this.position.spread.row &&
                brotherPages[i].position.spread.column == this.position.spread.column){
            this.position.spread.height = Math.max(brotherPages[i].position.height, newH);
          }
        }
      }*/
      this.position.height = newH + 10;
    //}

    //this.reposition();
    //-------------------------tanglinhai 改造page布局成absolute,改善性能 end-------------------------
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
    div.style.left = containerW > Math.floor(width) ? (containerW - Math.floor(width))/2 + 'px' : 0;

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


    //-------------------------tanglinhai test start-------------------------
    var this_ = this;
    //-------------------------tanglinhai test end-------------------------
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

    //console.log(this.id , outputScale);
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
