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

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs/display/draw', ['exports'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports);
  } else {
    factory((root.pdfjsDraw = {}));
  }
}(this, function (exports) {

  var PDFCustomFabricSetUp = function customFabricSetUp(){
    fabric.Image.prototype.toObject = function(propertiesToInclude) {
      this._originalElement = this._originalElement || {src: '#'};
      this.callSuper('toObject', propertiesToInclude);
    };
    fabric.Object.NUM_FRACTION_DIGITS = 20;
    fabric.Object.prototype.hasRotatingPoint = false;
    fabric.Object.prototype.orignX = 'left';
    fabric.Object.prototype.originY = 'top';
    //XXX hack for rotation and zooming with groups to make sure group spans the whole page
    fabric.AnchorRect = fabric.util.createClass(fabric.Rect, {
      type: 'anchor'
    });
     /*
     * @namespace fabric.TitledRect
     */
    fabric.TitledRect = fabric.util.createClass(fabric.Rect, {
      type: 'TitledRect',
      //camelCased properties are for fabric and underscored properties are for sbt
      extraFields: [
        'title',
        'uuid',
        'description',
        'field_type',
        'sbt_height',
        'left_inches',
        'top_inches',
        'defaultObjRotation',
        'role', //role of person filling out the form
      ],
      initialize: function(options) {
        options || (options = { });

        this.callSuper('initialize', options);
        var canvas = fabricViewerMethods.getCanvas(PDFViewerApplication.page);
        var pdfScale = PDFViewerApplication.pdfViewer.currentScale * 96;
        self = this;
        this.extraFields.forEach(function(field){
          if (field === 'defaultObjRotation') self.set(field, options[field] || 0);
          else self.set(field, options[field] || '');
        });
      },
      calculateSBTPos: function() {
        var canvas = fabricViewerMethods.getCanvas(PDFViewerApplication.page);
        var pdfScale = PDFViewerApplication.pdfViewer.currentScale * 96;
        this.sbt_height = Math.abs(canvas.height/pdfScale);
        this.left_inches = Math.abs(this.left/pdfScale);
        this.top_inches = Math.abs((canvas.height - this.top)/pdfScale);
      },
      toObject: function(propertiesToInclude) {
        var self = this,
            extra = {};
        this.extraFields.forEach(function(field) {
          extra[field] = self.get(field);
        });
        return fabric.util.object.extend(this.callSuper('toObject', propertiesToInclude), extra);
      },
      render: function(ctx) {
        this.callSuper('render', ctx);
      },
      _render: function(ctx) {
        this.callSuper('_render', ctx);
        ctx.font = '20px Helvetica';
        ctx.fillStyle = '#333';
        var left = this.width > 0 ? - this.width + 20: this.width + 20;
        var top = this.height < 0 ? - this.height - 20 : this.height + 20;
        ctx.fillText(this.title, left/2, top/2);
      }
    });

    fabric.TitledRect.fromObject = function(object) {
      return new fabric.TitledRect(object);
    };

    fabric.PageCanvas = fabric.util.createClass(fabric.Canvas, {
      type: 'page-canvas',
      extraFields: [
        'page',
      ],
      centeredScaling: true,
      centeredRotation: true,
      initialize: function(elements, options) {
        var self = this;
        this.callSuper('initialize', elements, options);
        /*options && this.extraFields.forEach(function(field){
          if (field === '_objRotation') self.set(field, options[field] || 0);
          else self.set(field, options[field] || '');
        });*/
      },
      /* takes a PDFPageView object because there is a bunch of info stored on the page
       * which the canvas object doesn't have, like rotation
       */
      fromObject: function(pdfPage, callback) {
        var self = this,
            enl = [];
        fabric.util.enlivenObjects(
          pdfPage.fabricState.objs.objects, function (enlivened) {
            enl = enlivened;
          });
        enl.forEach(function(obj) {
          self.add(obj);
        });
        return this;
      },
    });

    // Box renders field title when available and calculates
    // Height + the RML/SBT inches conversion based on pdf
    // scale factor

  };
  // got function to generate uuids from here https://gist.github.com/jed/982883
  // add page id to the front so its page id:uuid
  var fabricUUID = function(page, placeholder) {
    function uuid(placeholder){
      if(placeholder) {
        return (placeholder^Math.random()*16 >> placeholder / 4).toString(16);
      }
      else
        return  ([1e7]+-1e3+-4e3+-8e3+-1e11).replace( /[018]/g, uuid);
    }
    return page.toString() + ':' + uuid();
  };
  var fabricViewerMethods = {
    getCanvas: function pdfViewGetCanvas(page) {
      return PDFViewerApplication.pdfViewer._pages[page - 1].canvas;
    },
    fabricMouseMove: function pdfViewFabricMouseMove(options) {
      var self = this,
          uuid;
      if(this.lastObj != null) {
        uuid = this.lastObj.uuid ? this.lastObj.uuid: fabricUUID(PDFViewerApplication.page);
        this.remove(this.lastObj);
      }
      console.log(uuid);
      var e = options.e,
          offset = this._offset;
      this.state.lastMoveX = e.clientX - offset.left;
      this.state.lastMoveY = e.clientY - offset.top;
      var width = this.state.lastMoveX - this.state.lastClickX,
          length = this.state.lastMoveY - this.state.lastClickY,
          rectX =  this.state.lastMoveX < this.state.lastClickX ? this.state.lastMoveX : this.state.lastClickX,
          rectY =  this.state.lastMoveY < this.state.lastClickY ? this.state.lastMoveY : this.state.lastClickY,
          deleteObj = function(e){
            var key = e.which || e.keyCode || e.charCode;
            console.log(key);
            if(key === 46){
              self.remove(self.relatedTarget);
            }
          },
          page = PDFViewerApplication.pdfViewer._pages[PDFViewerApplication.page - 1],
          rect = new fabric.TitledRect({
            left: rectX,
            top: rectY + window.scrollY,
            width: width,
            height: length,
            stroke: 'red',
            strokeWidth: 3,
            fill: 'transparent',
            defaultObjRotation: page.rotation,
            uuid: uuid,
          });
      window.addEventListener('keyup', deleteObj, false);
      this.lastObj = rect;
      this.add(rect);
      this.state.rectX = rectX;
      this.state.rectY = rectY;
      this.state.rectW = width;
      this.state.rectL = length;
      this.state.page = page;
      //ADD CALLBACK FOR EXTERNAL API
    },
    fabricMouseDown: function pdfViewFabricMouseDown(options){
      if (!options.target ||
          options.target.type != 'TitledRect' &&
          options.target.type != 'group'){
        self = this;
        var e = options.e;
        var rect = this._offset;
        this.state.lastClickX = e.clientX - rect.left;
        this.state.lastClickY = e.clientY - rect.top;
        this.on('mouse:move', fabricViewerMethods.fabricMouseMove);
        this.on('mouse:up', fabricViewerMethods.fabricMouseUp);
        //ADD CALLBACK FOR EXTERNAL API
      }
    },
    fabricMouseUp: function pdfViewFabricMouseUp(options){
      this.off('mouse:move', fabricViewerMethods.fabricMouseMove);
      this.off('mouse:up', fabricViewerMethods.fabricMouseUp);
      window.parent.postMessage(this.lastObj.uuid, window.location.origin);
      this.lastObj = null;
    },
    fabricStringifyParams: function pdfViewFabricStringifyParams(){
      var pages = {};
     PDFViewerApplication.pdfViewer._pages.forEach(function(page){
        pages[page.canvas.page] = page.canvas.toObject;
      });
      return pages;
    },
    fabricSaveTemplate: function pdfViewSaveTemplate(){
      //NOTE: FabricJS apparently used to get top and left from the center of
      //a given object, but it looks like orignX and originY are already set to
      //left and top respectively.  It's possible this has just been changed but
      //it might be a good idea to explicity set them in case it changes again
      var params = [];
      for(var i = 0; i < PDFViewerApplication.pdfViewer.canvases.length; i++){
        var groups = PDFViewerApplication.pdfViewer.canvases[i].getObjects('group');

        //params.push PDFViewerApplication.pdfViewer.canvases[i].toJSON());
        params.push({'objects' : []});
        for(var j = 0; j < groups.length; j++){
          var field = groups[j].getObjects('rect')[0];
          var data = field['fieldData'];
          params[i]['objects'].push(field.toJSON());
          var obj = params[i]['objects'][j];
          obj['left'] = groups[j]['left'];
          obj['top'] = groups[j]['top'];
          var scale = fabricViewerMethod.currentScale * 96;
          var pHeight = PDFViewerApplication.pdfViewer.canvases[i].height;
          obj['height'] = Math.abs(obj['height']/(scale));
          obj['leftInches'] = Math.abs(obj['left']/(scale));
          obj['topInches'] = (pHeight - (obj['top']))/(scale);
          for (var k in data){
            obj[k] = data[k];
          }
          //obj['fieldType'] = data['fieldType'];
          //obj['fieldTitle'] = data['fieldTitle'];
          //if(obj['fieldType'] == 'sig') obj['fieldTypeSigUser'] = data
        }
      }
      var xhr = new XMLHttpRequest();
      xhr.open('POST', 'hr-custom-form.html/generate', true);
      xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
      xhr.onload = (function(d){
        return;
      });
      xhr.send('params=' + JSON.stringify(params) + '&template_id=' + fabricViewerMethod.template_id);
    }
  },
      fabricGlobalMethods = {
        fabricPageViewDraw: function(pageView) {
          var pdfPage = PDFViewerApplication.pdfViewer._pages[pageView.pageNumber - 1];
          var page = document.getElementById('page' + pageView.pageNumber),
              pageCtx = page.getContext('2d'),
              container = document.getElementById('pageContainer' + pageView.pageNumber),
              imgData = pageCtx.getImageData(0, 0, page.width, page.height),
              cloned = page.cloneNode(),
              clCtx = cloned.getContext('2d');
          clCtx.putImageData(imgData, 0, 0);

          var background = new fabric.Image(cloned, {
            dx: 0,
            dy: 0,
            width: container.clientWidth,
            height: container.clientHeight,
            //scaleX: pageCtx._scaleX,
            //scaleY: pageCtx._scaleY,
            lockMovementX: true,
            lockMovementY: true,
            lockRotation: true,
          }),
              fCanvas = new fabric.PageCanvas(page.id);

          pdfPage.el = container;
          pdfPage.zoomLayer = fCanvas.wrapperEl;
          fCanvas.state = {};
          fCanvas.lastObj = null;

          if (!pdfPage.fabricState.objs) pdfPage.fabricState.objs = fCanvas.toObject();
          else{
            fCanvas.backgroundImage = null;
            /*fCanvas.setObjScale(pdfPage.scale, pdfPage.fabricState.canvasScale);
             fCanvas.setObjRotation(pdfPage.rotation)*/;
            fCanvas.fromObject(pdfPage);
            pdfPage.fabricState.rotation = pdfPage.rotation;
          }
          fCanvas.on('mouse:down', fabricViewerMethods.fabricMouseDown);
          fCanvas.on('object:selected', fabricCanvasSelected);
          fCanvas.on('selection:cleared', fabricCanvasSelectionCleared);
          fCanvas.on('after:render', function(options){
            pdfPage.fabricState.objs = fCanvas.toObject();
          });
          // see comment in web/pdf_page_view for explanation of why we keep track of a separate canvasScale
          pdfPage.fabricState.canvasScale = pdfPage.scale;
          fCanvas.setBackgroundImage(background);
          pdfPage.canvas = fCanvas;
          fCanvas.renderAll();
          return pdfPage;
        },
        fabricTransformCanvas: function (pageNumber, pageRotation, scale) {
          var klass = fabricViewerMethods.getCanvas(pageNumber),
              pdfPage = PDFViewerApplication.pdfViewer._pages[pageNumber - 1],
              objs = klass._objects,
              canvasScale = (scale / pdfPage.fabricState.canvasScale).toFixed(20),
              rotation = pageRotation - pdfPage.fabricState.rotation,
              rotationChanged = pageRotation != pdfPage.fabricState.rotation,
              anchors = [ //mark all 4 corners of the group
                new fabric.AnchorRect({
                  left: 0,
                  top: 0,
                  height: 0,
                  width: 0,
                }),
                new fabric.AnchorRect({
                  left: pdfPage.width,
                  top: 0,
                  height: 0,
                  width: 0,
                }),
                new fabric.AnchorRect({
                  left: 0,
                  top: pdfPage.height,
                  height: 0,
                  width: 0,
                }),
                new fabric.AnchorRect({
                  left: pdfPage.width,
                  top: pdfPage.height,
                  height: 0,
                  width: 0,
                }),
              ],
              transformGroup = new fabric.Group(objs.concat(anchors), {
                left: 0,
                top: 0,
                width: rotationChanged ? pdfPage.height: pdfPage.width,
                height: rotationChanged ? pdfPage.width: pdfPage.height,
                originX: 'left',
                originY: 'top',
                centeredScaling: true,
                centeredRotation: true,
              });
          klass._objects = [];
          klass.add(transformGroup);
          /*transform stuff*/
          // XXX a litte bit of a hack. if abs val of rotation is > 90 (it's 270), figure out which
          // way we want to rotate to get to or from 0
          if(Math.abs(rotation) > 90) rotation = (rotation/Math.abs(rotation)) * - 90;
          transformGroup.scale(canvasScale);
          transformGroup.setCoords();
          transformGroup.rotate(rotation);
          transformGroup.setCoords();
          var tl = transformGroup.translateToOriginPoint(
            transformGroup.oCoords.tl, 'left', 'top');
          //transformGroup.setTop(0);
          //transformGroup.setLeft(0);
          // transformGroup.setCoords();
          /*transform stuff*/
          var transformedObjs = [];
          transformGroup._restoreObjectsState();

          transformGroup._objects.forEach(function(obj, i) {
            if(obj.type != 'anchor') transformedObjs.push(obj);
          });
          klass.remove(transformGroup);
          transformedObjs.forEach(function(transformed) {
            klass.add(transformed);
          });
          // });
          pdfPage.fabricState.objs = klass.toObject();
        },
        getObjByUUID: function(uuid) {
          var objs = PDFViewerApplication.pdfViewer._pages[uuid[0] - 1]
            .canvas._objects;
          for(var i = 0; i < objs.length; i++) {
            if(uuid === objs[i].uuid)
              return objs[i];
          }
        },
      };

  function fabricCanvasSelected(options) {
   PDFViewerApplication.pdfViewer.lastSelectedObj = options.target;
    var otherCanvases = PDFViewerApplication.pdfViewer._pages.filter(function(el){
      return el.canvas != options.target.canvas &&
        typeof el.canvas === 'object' &&
        el.canvas.toString().indexOf('fabric.Canvas') > -1;
    });
    otherCanvases.forEach(function(page) {
      page.canvas.deactivateAll().renderAll();
    });
  };

  function fabricCanvasSelectionCleared(options) {
   PDFViewerApplication.pdfViewer.lastSelectedObj = null;
  };

  PDFCustomFabricSetUp();
  exports.fabricViewerMethods = fabricViewerMethods;
  exports.fabricGlobalMethods = fabricGlobalMethods;
}));
