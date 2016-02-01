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
      var canvas = PDFView.findPage(PDFView.page);
      var pdfScale = PDFView.currentScale * 96;
      self = this;
      this.extraFields.forEach(function(field){
        self.set(field, options[field] || '');
      });
    },
    calculateSBTPos: function() {
      var canvas = PDFView.findPage(PDFView.page);
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

function fabricPageViewDraw(pageView) {
  var page = document.getElementById('page' + pageView.pageNumber),
      imgData = page.getContext('2d').getImageData(0, 0, page.width, page.height),
      cloned = page.cloneNode();
  cloned.getContext('2d').putImageData(imgData, 0, 0);
  // Set up canvas that will become fabric canvas
  // debugger
  // fc.id = 'page' + pageView.pageNumber + '-highlight';
  // fc.globalAlpha = '1';
  // fc.className = 'highlight';
  // addContextCurerentTransform(fc);
  // fc.style.opacity = '.5';
  // fc.width = parseInt(page.style.width);
  // fc.height = parseInt(page.style.height);
  // debugger;
  // // page.parentNode.insertBefore(fc, page);
  addContextCurrentTransform(cloned);
  var background = new fabric.Image(cloned, {
    dx: 0,
    dy: 0,
    width: page.width,
    height: page.height,
    lockMovementX: true,
    lockMovementY: true,
    lockRotation: true
  }),
      fCanvas = new fabric.Canvas(page.id);
  fCanvas.add(background);
  fCanvas.state = {};
  fCanvas.lastObj = null;
}
