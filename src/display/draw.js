/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* 
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
/* globals PDFCustomFabricSetUp */

'use strict';

function pdfViewGetCanvas() {
  return this.pages[this.page].canvas;
};

var PDFCustomFabricSetUp = function customFabricSetUp(){
  fabric.Object.prototype.hasRotatingPoint = false;
  fabric.Object.prototype.orignX = 'left';
  fabric.Object.prototype.originY = 'top';
  fabric.pageCanvas = fabric.util.createClass(fabric.Canvas, {
    type: 'page-canvas',
    initialize: function(element, options) {
      this.callSuper('initialize', element, options);
      options && this.set('page', options.page);
    },
    toObject: function() {
      return fabric.util.object.extend(
	this.callSuper('toObject'),
	{page: this.page});
    },
    toJSON: function() {
      return fabric.util.object.extend(
	this.callSuper('toJSON'),
	{page: this.page});
    },
    fromObject: function(object, callback) {
      callback && callback(new fabric.pageCanvas());
    }
  });
  // Box renders field title when available and calculates
  // Height + the RML/SBT inches conversion based on pdf
  // scale factor
  fabric.TitledRect = fabric.util.createClass(fabric.Rect, {
    
    type: 'TitledRect',
    extraFields: [
      'title',
      'description',
      'field_type',
      'sbt_height',
      'left_inches',
      'top_inches'
    ],
    initialize: function(options) {
      options || (options = { });
      
      this.callSuper('initialize', options);
      var canvas = PDFView.getCanvas(PDFView.page);
      var pdfScale = PDFView.currentScale * 96;
      self = this;
      this.extraFields.forEach(function(field){
        self.set(field, options[field] || '');
      });
    },
    calculateSBTPos: function() {
      var canvas = PDFView.getCanvas(PDFView.page);
      var pdfScale = PDFView.currentScale * 96;
      this.sbt_height = Math.abs(canvas.height/pdfScale);
      this.left_inches = Math.abs(this.left/pdfScale);
      this.top_inches = Math.abs((canvas.height - this.top)/pdfScale);
    },
    toObject: function() {
      this.calculateSBTPos();
      var extraFieldDict = {};
      self = this;
      this.extraFields.forEach(function(field){
        extraFieldDict[field] = self.get(field);
      });
      return fabric.util.object.extend(this.callSuper('toObject'),
				       extraFieldDict);
    },
    fromObject: function(object, callback) {
      callback && callback(new fabricTitledRect());
    },
    _render: function(ctx) {
      this.callSuper('_render', ctx);
      ctx.font = '20px Helvetica';
      ctx.fillStyle = '#333';
      var left = this.width > 0 ? -this.width + 20: this.width + 20;
      var top = this.height < 0 ? -this.height - 20 : this.height + 20;
      ctx.fillText(this.title, left/2, top/2);
    }
  });
};

PDFCustomFabricSetUp();

function pdfViewFabricMouseMove(options) {
  self = this;
  if(this.lastObj != null) this.remove(this.lastObj);
  var e = options.e,
      rect = this._offset;
  this.state.lastMoveX = e.clientX - rect.left;
  this.state.lastMoveY = e.clientY - rect.top;
  var width = this.state.lastMoveX - this.state.lastClickX,
      length = this.state.lastMoveY - this.state.lastClickY,
      rectX =  this.state.LastMoveX < this.state.LastClickX ? this.state.lastMoveX : this.state.lastClickX,
      rectY =  this.state.LastMoveY < this.state.LastClickY ? this.state.lastMoveY : this.state.lastClickY,
      deleteObj = function(e){
        var key = e.which || e.keyCode || e.charCode;
        if(key === 46){
          self.remove(this);
        }
      };
  rect = new fabric.TitledRect({
    left: rectX,
    top: rectY + window.scrollY,
    width: width,
    height: length,
    stroke : 'red',
    strokeWidth: 3,
    fill : 'transparent',
  });
  this.lastObj = rect;
  this.add(rect);
  this.state.rectX = rectX;
  this.state.rectY = rectY;
  this.state.rectW = width;
  this.state.rectL = length;
  this.state.page = PDFView.page;
  //ADD CALLBACK FOR EXTERNAL API
};

function pdfViewFabricMouseDown(options){
  if (options.target.type === 'image'){
    self = this;
    var e = options.e;
    var rect = this._offset;
    this.state.lastClickX = e.clientX - rect.left;
    this.state.lastClickY = e.clientY - rect.top;
    this.on('mouse:move', PDFView.fabricMouseMove);
    this.on('mouse:up', PDFView.fabricMouseUp);
    //ADD CALLBACK FOR EXTERNAL API
  }
};

function pdfViewFabricMouseUp(options){
  this.off('mouse:move', PDFView.fabricMouseMove);
  this.off('mouse:up', PDFView.fabricMouseUp);
  if(PDFView.lastSelectedObj &&
     PDFView.lastSelectedObj['type'] == 'TitledRect'){
    this.lastObj = null;
  }
  //ADD CALLBACK FOR EXTERNAL API
}

function pdfViewFabricStringifyParams(){
  var pages = {};
  PDFView.pages.forEach(function(page){
    pages[page.canvas.page] = page.canvas.toObject;
  });
  return pages;
};

function pdfViewSaveTemplate(){
    //NOTE: FabricJS apparently used to get top and left from the center of
    //a given object, but it looks like orignX and originY are already set to
    //left and top respectively.  It's possible this has just been changed but
    //it might be a good idea to explicity set them in case it changes again
    var params = [];
    for(var i = 0; i < PDFView.canvases.length; i++){
      var groups = PDFView.canvases[i].getObjects('group');

      //params.push(PDFView.canvases[i].toJSON());
      params.push({'objects' : []});
      for(var j = 0; j < groups.length; j++){
        var field = groups[j].getObjects('rect')[0];
        var data = field['fieldData'];
        params[i]['objects'].push(field.toJSON());
        var obj = params[i]['objects'][j];
        obj['left'] = groups[j]['left'];
        obj['top'] = groups[j]['top'];
        var scale = PDFView.currentScale * 96;
        var pHeight = PDFView.canvases[i].height;
        obj['height'] = Math.abs(obj['height']/(scale));
        obj['leftInches'] = Math.abs(obj['left']/(scale));
        obj['topInches'] = (pHeight - (obj['top']))/(scale);
        for (var k in data){
          obj[k] = data[k];
        }
        /*obj['fieldType'] = data['fieldType'];
        obj['fieldTitle'] = data['fieldTitle'];
        if(obj['fieldType'] == 'sig') obj['fieldTypeSigUser'] = data*/


      }
    }
    
    var xhr = new XMLHttpRequest();
    xhr.open('POST', 'hr-custom-form.html/generate', true);
    xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    xhr.onload = (function(d){
        return;
      });
    xhr.send('params=' + JSON.stringify(params) + '&template_id=' + PDFView.template_id);
};

function fabricCanvasSelected(options) {
  PDFView.lastSelectedObj = options.target;
  var otherCanvases = PDFView.pages.filter(function(el){
    return el.canvas != options.target.canvas &&
      typeof el.canvas === 'object' && 
      el.canvas.toString().indexOf('fabric.Canvas') > -1;
  });
  otherCanvases.forEach(function(page) {
    page.canvas.deactivateAll().renderAll();
  });
};

function fabricCanvasSelectionCleared(options) {
  PDFView.lastSelectedObj = null;
};

function fabricPageViewDraw(pageView) {
  var page = document.getElementById('page' + pageView.pageNumber),
      pageCtx = page.getContext('2d'),
      container = document.getElementById('pageContainer' + pageView.pageNumber),
      imgData = pageCtx.getImageData(0, 0, page.width, page.height),
      cloned = page.cloneNode(),
      clCtx = cloned.getContext('2d');
  clCtx.putImageData(imgData, 0, 0);
  addContextCurrentTransform(cloned.getContext('2d'));
  var background = new fabric.Image(cloned, {
    dx: 0,
    dy: 0,
    width: container.clientWidth,
    height: container.clientHeight,
    //scaleX: pageCtx._scaleX,
    //scaleY: pageCtx._scaleY,
    lockMovementX: true,
    lockMovementY: true,
    lockRotation: true
  }),
      fCanvas = new fabric.pageCanvas(page.id),
      pdfPage = PDFView.pages[pageView.pageNumber - 1];
  pdfPage.el = document.getElementById('pageContainer' + pageView.pageNumber);
  pdfPage.zoomLayer = fCanvas.wrapperEl;
  pdfPage.canvas = fCanvas;
  fCanvas.add(background);
  fCanvas.state = {};
  fCanvas.lastObj = null;
  fCanvas.on('mouse:down', PDFView.fabricMouseDown);
  fCanvas.on('object:selected', fabricCanvasSelected);
  fCanvas.on('selection:cleared', fabricCanvasSelectionCleared);
  return pdfPage;
}
