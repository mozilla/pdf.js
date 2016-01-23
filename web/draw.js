/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
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
