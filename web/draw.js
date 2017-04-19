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

import { RenderingStates } from './pdf_rendering_queue';

var PDFCustomFabricSetUp = function customFabricSetUp() {
  // fabric.Image.prototype.toObject = function(propertiesToInclude) {
  //     this._originalElement = this._originalElement || { src: '#' };
  //     this.callSuper('toObject', propertiesToInclude);
  // };
  fabric.Object.NUM_FRACTION_DIGITS = 20;
  fabric.Object.prototype.hasRotatingPoint = false;
  fabric.Object.prototype.orignX = 'left';
  fabric.Object.prototype.originY = 'top';
  //XXX hack for rotation and zooming with groups to make sure group spans the whole page
  fabric.AnchorRect = fabric.util.createClass(fabric.Rect, {
    type: 'AnchorRect'
  });

  fabric.AnchorRect.fromObject = function(object, callback) {
    var ar = new fabric.AnchorRect(object);
    callback(ar);
    return ar;
  };

  /*
   * @namespace fabric.TitledRect
   */
  fabric.TitledRect = fabric.util.createClass(fabric.Rect, {
    type: 'TitledRect',
    //camelCased properties are for fabric and underscored properties are for sbt
    extraFields: [
      'uuid',
      'left_inches',
      'top_inches',
      'height_inches',
      'width_inches',
      //'defaultObjRotation',
    ],
    initialize: function(options) {
      options || (options = {});

      this.callSuper('initialize', options);
      var canvas = fabricGlobalMethods.getCanvas(PDFViewerApplication.page);
      var pdfScale = PDFViewerApplication.pdfViewer.currentScale * 96;
      self = this;
      this.extraFields.forEach(function(field) {
        if ( field === 'defaultObjRotation' ) self.set(field, options[field] || 0);
        else self.set(field, options[field] || '');
      });
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
      // ctx.font = '20px Helvetica';
      // ctx.fillStyle = '#333';
      // var left = this.width > 0 ? -this.width + 20 : this.width + 20,
      //   top = this.height < 0 ? -this.height - 20 : this.height - 20;
      // ctx.fillText(this.title, left / 2, top / 2);
    }
  });

  fabric.TitledRect.fromObject = function(object, callback) {
    var tr = new fabric.TitledRect(object);
    callback(tr);
    return tr;
  };

  fabric.PageCanvas = fabric.util.createClass(fabric.Canvas, {
      type: 'page-canvas',
      uniScaleTransform: true,
      extraFields: [
          'page',
          'scale',
      ],
      centeredScaling: false,
      centeredRotation: false,
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
      fromObject: function(objs, callback) {
          var self = this,
              enl = [];
          fabric.util.enlivenObjects(objs.objects, function(enlivened) {
              enl = enlivened;
          });
          enl.forEach(function(obj) {
              self.add(obj);
          });
          return this;
      },
      toObject: function(propertiesToInclude) {
          var self = this,
              extra = {};
          this.extraFields.forEach(function(field) {
              extra[field] = self.get(field);
          });
          return fabric.util.object.extend(this.callSuper('toObject', propertiesToInclude), extra);
      },
  });

  // Box renders field title when available and calculates
  // Height + the RML/SBT inches conversion based on pdf
  // scale factor
  PDFJS.fabricGlobals = fabricGlobalMethods;
};
// got function to generate uuids from here https://gist.github.com/jed/982883
// add page id to the front so its page id:uuid
function fabricUUID(page, placeholder) {
  function uuid(placeholder) {
    if ( placeholder ) {
      return (placeholder ^ Math.random() * 16 >> placeholder / 4).toString(16);
    }
    else
      return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, uuid);
  }

  return page.toString() + ':' + uuid();
}
function fabricMouseMove(options) {
  var self = this,
    uuid;
  if ( this.lastObj != null ) {
    uuid = this.lastObj.uuid ? this.lastObj.uuid : fabricUUID(PDFViewerApplication.page);
    this.remove(this.lastObj);
  }
  var e = options.e,
    offset = this._offset;
  this.state.lastMoveX = e.clientX - offset.left;
  this.state.lastMoveY = e.clientY - offset.top;
  var width = Math.abs(this.state.lastMoveX - this.state.lastClickX),
    length = Math.abs(this.state.lastMoveY - this.state.lastClickY),
    rectX = Math.min(this.state.lastMoveX, this.state.lastClickX),
    rectY = Math.min(this.state.lastMoveY, this.state.lastClickY),
    deleteObj = function(e) {
      var key = e.which || e.keyCode || e.charCode;
      if ( key === 46 ) {
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
      centeredScaling: false,
      centeredTransform: false,
      lockUniScaling: false,
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
}
function fabricMouseDown(options) {
  if ( !PDFJS.fabricGlobals.drawMode ) return;
  if ( !options.target ||
    options.target.type != 'TitledRect' &&
    options.target.type != 'group' ) {
    self = this;
    var e = options.e;
    var rect = this._offset;
    this.state.lastClickX = e.clientX - rect.left;
    this.state.lastClickY = e.clientY - rect.top;
    this.on('mouse:move', fabricMouseMove);
    this.on('mouse:up', fabricMouseUp);
  }
}
function fabricMouseUp(options) {
  this.off('mouse:move', fabricMouseMove);
  this.off('mouse:up', fabricMouseUp);
  window.parent.postMessage(this.lastObj.uuid, window.location.origin);
  this.lastObj = null;
}
function fabricStringifyParams() {
  var pages = {};
  PDFViewerApplication.pdfViewer._pages.forEach(function(page) {
    pages[page.canvas.page] = page.canvas.toObject;
  });
  return pages;
}

function fabricCanvasSelected(options) {
  PDFViewerApplication.pdfViewer.lastSelectedObj = options.target;
  var otherCanvases = PDFViewerApplication.pdfViewer._pages.filter(function(el) {
    return el.canvas != options.target.canvas &&
      typeof el.canvas === 'object' &&
      el.canvas.toString().indexOf('fabric.Canvas') > -1;
  });
  otherCanvases.forEach(function(page) {
    page.canvas.deactivateAll().renderAll();
  });
}

function fabricCanvasSelectionCleared(options) {
  PDFViewerApplication.pdfViewer.lastSelectedObj = null;
}

var fabricMethods = {
    fabricPageViewDraw: function(pageView) {
        var pdfPage = PDFViewerApplication.pdfViewer._pages[pageView.pageNumber - 1];
        var page = document.getElementById('page' + pageView.pageNumber),
            pageCtx = page.getContext('2d'),
            container = document
            .querySelector('.page[data-page-number="' + pageView.pageNumber + '"] .canvasWrapper'),
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
        //pdfPage.zoomLayer = fCanvas.wrapperEl;
        fCanvas.state = {};
        fCanvas.lastObj = null;

        if ( !pdfPage.fabricState.objs ) pdfPage.fabricState.objs = fCanvas.toObject();
        else {
            fCanvas.backgroundImage = null;
            /*fCanvas.setObjScale(pdfPage.scale, pdfPage.fabricState.canvasScale);
              fCanvas.setObjRotation(pdfPage.rotation)*/
            fCanvas.fromObject(pdfPage.fabricState.objs);
            pdfPage.fabricState.rotation = pdfPage.rotation;
        }
        fCanvas.on('mouse:down', fabricMouseDown);
        fCanvas.on('object:selected', fabricCanvasSelected);
        fCanvas.on('selection:cleared', fabricCanvasSelectionCleared);
        fCanvas.on('after:render', function(options) {
            pdfPage.fabricState.objs = fCanvas.toObject();
        });
        // see comment in web/pdf_page_view for explanation of why we keep track of a separate canvasScale
        pdfPage.fabricState.canvasScale = pdfPage.scale;
        fCanvas.setBackgroundImage(background);
        pdfPage.canvas = fCanvas;
        fCanvas.renderAll();
        return pdfPage;
    },
    fabricStorePreTransformData: function(pageNumber, oldScale, oldRotation) {
      var page = PDFViewerApplication.pdfViewer.getPageView(pageNumber - 1);
      page.fabricState.preTransform = {
        scale: page.scale,
        rotation: page.rotation,
        height: page.height,
        width: page.width,
      };
    },
    fabricTransformCanvas: function(pageNumber) {
        var klass = fabricGlobalMethods.getCanvas(pageNumber),
            pdfPage = PDFViewerApplication.pdfViewer.getPageView(pageNumber - 1),
            fabricState = pdfPage.fabricState,
            pageRotation = fabricState.preTransform.rotation,
            scale = fabricState.preTransform.scale;
        if ( scale === pdfPage.fabricState.scale && pageRotation === pdfPage.fabricState.rotation ) return;
        var objs = klass.getObjects(),
            canvasScale = (pdfPage.fabricState.canvasScale / scale).toFixed(20),
            rotation = pdfPage.fabricState.rotation - pageRotation,
            rotationChanged = fabricState.preTransform.width != pdfPage.width,
            anchors = [ //mark all 4 corners of the group
                new fabric.AnchorRect({
                    left: 0,
                    top: 0,
                    height: 0,
                    width: 0,
                }),
                new fabric.AnchorRect({
                    left: fabricState.preTransform.width,
                    top: 0,
                    height: 0,
                    width: 0,
                }),
                new fabric.AnchorRect({
                    left: 0,
                    top: fabricState.preTransform.height,
                    height: 0,
                    width: 0,
                }),
                new fabric.AnchorRect({
                    left: fabricState.preTransform.width,
                    top: fabricState.preTransform.height,
                    height: 0,
                    width: 0,
                }),
            ],
            transformGroup = new fabric.Group(objs.concat(anchors), {
                left: 0,
                top: 0,
                width: fabricState.preTransform.width,
                height: fabricState.preTransform.height,
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
        if ( Math.abs(rotation) > 90 ) rotation = (rotation / Math.abs(rotation)) * -90;
        transformGroup.scale(canvasScale);
        transformGroup.setCoords();
        //transformGroup.rotate(rotation);
        transformGroup.setCoords();

        var tl = transformGroup.translateToOriginPoint(
            transformGroup.oCoords.tl, 'left', 'top');
        /*transform stuff*/
        var transformedObjs = [];
        transformGroup._restoreObjectsState();
        transformGroup._objects.forEach(function(obj, i) {
            if ( obj.type != 'anchor' ) transformedObjs.push(obj);
        });
        klass.remove(transformGroup);
        transformedObjs.forEach(function(transformed) {
            klass.add(transformed);
        });
        klass.getObjects('AnchorRect').forEach(function(ar){
            klass.remove(ar);
        });
        pdfPage.fabricState.objs = klass.toObject();
    },
};
var fabricGlobalMethods = {
    getObjByUUID: function(uuid) {
        var objs = PDFViewerApplication.pdfViewer._pages[uuid[0] - 1]
            .canvas._objects;
        for ( var i = 0; i < objs.length; i++ ) {
            if ( uuid === objs[i].uuid )
                return objs[i];
        }
        return null;
    },
    fabricSaveTemplate: function pdfViewSaveTemplate() {
        var fields = [],
            currentScale = PDFViewerApplication.pdfViewer.currentScale;
        for ( var i = 1; i <= PDFViewerApplication.pdfViewer.pagesCount; i++ ) {
            var canvas = this.getCanvas(i);
            if (!canvas || typeof(canvas) === undefined){
                fields.push({ 'objects': [], scale: currentScale });
                continue;
            }
            canvas.scale = currentScale;
            var objs = canvas.getObjects('TitledRect');
            for ( var j = 0; j < objs.length; j++ ) {
                var scale = currentScale * 96,
                    pHeight = PDFViewerApplication
                    .pdfViewer._pages[i - 1].viewport.height,
                    oHeight = Math.abs(objs[j]['height']);
                objs[j]['height_inches'] = Math.abs(objs[j]['height'] / (scale));
                objs[j]['left_inches'] = Math.abs(objs[j]['left'] / (scale));
                objs[j]['top_inches'] =
                    (pHeight - oHeight - objs[j]['top']) / (scale);
                objs[j]['width_inches'] = Math.abs(objs[j]['width'] / (scale));
                fields.push(canvas.toObject());
            }
        }
        return fields;
    },
    fabricLoadTemplate: function(json) {
        var scale = json[0].scale;
        PDFViewerApplication.pdfViewer.currentScale = scale;
        for (var i = 1; i <= PDFViewerApplication.pdfViewer.pagesCount; i++) {
            var canvas = this.getCanvas(i);
            if (!canvas || typeof(canvas) === undefined) continue;
            var renderFinishedPromise = new Promise(function(resolve, reject) {
                (function(i){
                    var interval = setInterval(function(){
                        if (PDFViewerApplication.pdfViewer.getPageView(i).rendnderingState == RenderingStates.FINISHED) {
                            resolve(i);
                            clearInterval(interval);
                        }
                    }, 10);
                })(i);
            });
            renderFinishedPromise.then(function(pageNum){
                var canvas = this.getCanvas(pageNum);
                var obj = json[pageNum - 1],
                    oldBg = obj.backgroundImage._originalElement,
                    container = document
                    .querySelector('.page[data-page-number="' + i + '"] .canvasWrapper');
                console.log(obj);
                canvas.loadFromJSON(obj);
                canvas.setBackgroundImage(new fabric.Image(oldBg, {
                    dx: 0,
                    dy: 0,
                    width: container.clientWidth,
                    height: container.clientHeight,
                    // scaleX: ctx._scaleX,
                    // scaleY: ctx._scaleY,
                    lockMovementX: true,
                    lockMovementY: true,
                    lockRotation: true,
                }), canvas.renderAll.bind(canvas), {originX: 'left', originY: 'top'}); 
            });
        }
    },
    getCanvas: function(page) {
        return PDFViewerApplication.pdfViewer._pages[page - 1].canvas;
    },
    drawMode: true,
};

PDFCustomFabricSetUp();
PDFJS.fabricGlobals = fabricGlobalMethods;
export { fabricMethods };
