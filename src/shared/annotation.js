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
/* globals Util, isDict, isName, stringToPDFString, TODO, Dict, Stream,
           stringToBytes, PDFJS, isWorker, assert, NotImplementedException,
           Promise, isArray, ObjectLoader, isValidUrl, OperatorList */

'use strict';

var Annotation = (function AnnotationClosure() {
  // 12.5.5: Algorithm: Appearance streams
  function getTransformMatrix(rect, bbox, matrix) {
    var bounds = Util.getAxialAlignedBoundingBox(bbox, matrix);
    var minX = bounds[0];
    var minY = bounds[1];
    var maxX = bounds[2];
    var maxY = bounds[3];

    if (minX === maxX || minY === maxY) {
      // From real-life file, bbox was [0, 0, 0, 0]. In this case,
      // just apply the transform for rect
      return [1, 0, 0, 1, rect[0], rect[1]];
    }

    var xRatio = (rect[2] - rect[0]) / (maxX - minX);
    var yRatio = (rect[3] - rect[1]) / (maxY - minY);
    return [
      xRatio,
      0,
      0,
      yRatio,
      rect[0] - minX * xRatio,
      rect[1] - minY * yRatio
    ];
  }

  function getDefaultAppearance(dict) {
    var appearanceState = dict.get('AP');
    if (!isDict(appearanceState)) {
      return;
    }

    var appearance;
    var appearances = appearanceState.get('N');
    if (isDict(appearances)) {
      var as = dict.get('AS');
      if (as && appearances.has(as.name)) {
        appearance = appearances.get(as.name);
      }
    } else {
      appearance = appearances;
    }
    return appearance;
  }

  function Annotation(params) {
    if (params.data) {
      this.data = params.data;
      return;
    }

    var dict = params.dict;
    var data = this.data = {};

    data.subtype = dict.get('Subtype').name;
    var rect = dict.get('Rect');
    data.rect = Util.normalizeRect(rect);
    data.annotationFlags = dict.get('F');

    var color = dict.get('C');
    if (isArray(color) && color.length === 3) {
      // TODO(mack): currently only supporting rgb; need support different
      // colorspaces
      data.color = color;
    } else {
      data.color = [0, 0, 0];
    }

    // Some types of annotations have border style dict which has more
    // info than the border array
    if (dict.has('BS')) {
      var borderStyle = dict.get('BS');
      data.borderWidth = borderStyle.has('W') ? borderStyle.get('W') : 1;
    } else {
      var borderArray = dict.get('Border') || [0, 0, 1];
      data.borderWidth = borderArray[2] || 0;
    }

    this.appearance = getDefaultAppearance(dict);
    data.hasAppearance = !!this.appearance;
  }

  Annotation.prototype = {

    getData: function Annotation_getData() {
      return this.data;
    },

    hasHtml: function Annotation_hasHtml() {
      return false;
    },

    getHtmlElement: function Annotation_getHtmlElement(commonObjs) {
      throw new NotImplementedException(
        'getHtmlElement() should be implemented in subclass');
    },

    // TODO(mack): Remove this, it's not really that helpful.
    getEmptyContainer: function Annotation_getEmptyContainer(tagName, rect) {
      assert(!isWorker,
        'getEmptyContainer() should be called from main thread');

      rect = rect || this.data.rect;
      var element = document.createElement(tagName);
      element.style.width = Math.ceil(rect[2] - rect[0]) + 'px';
      element.style.height = Math.ceil(rect[3] - rect[1]) + 'px';
      return element;
    },

    isViewable: function Annotation_isViewable() {
      var data = this.data;
      return !!(
        data &&
        (!data.annotationFlags ||
         !(data.annotationFlags & 0x22)) && // Hidden or NoView
        data.rect                            // rectangle is nessessary
      );
    },

    loadResources: function(keys) {
      var promise = new Promise();
      this.appearance.dict.getAsync('Resources').then(function(resources) {
        if (!resources) {
          promise.resolve();
          return;
        }
        var objectLoader = new ObjectLoader(resources.map,
                                            keys,
                                            resources.xref);
        objectLoader.load().then(function() {
          promise.resolve(resources);
        });
      }.bind(this));

      return promise;
    },

    getOperatorList: function Annotation_getToOperatorList(evaluator) {

      var promise = new Promise();

      if (!this.appearance) {
        promise.resolve(new OperatorList());
        return promise;
      }

      var data = this.data;

      var appearanceDict = this.appearance.dict;
      var resourcesPromise = this.loadResources([
        'ExtGState',
        'ColorSpace',
        'Pattern',
        'Shading',
        'XObject',
        'Font'
        // ProcSet
        // Properties
      ]);
      var bbox = appearanceDict.get('BBox') || [0, 0, 1, 1];
      var matrix = appearanceDict.get('Matrix') || [1, 0, 0, 1, 0 ,0];
      var transform = getTransformMatrix(data.rect, bbox, matrix);

      var border = data.border;

      resourcesPromise.then(function(resources) {
        var opList = new OperatorList();
        opList.addOp('beginAnnotation', [data.rect, transform, matrix]);
        evaluator.getOperatorList(this.appearance, resources, opList);
        opList.addOp('endAnnotation', []);
        promise.resolve(opList);
      }.bind(this));

      return promise;
    }
  };

  Annotation.getConstructor =
      function Annotation_getConstructor(subtype, fieldType) {

    if (!subtype) {
      return;
    }

    // TODO(mack): Implement FreeText annotations
    if (subtype === 'Link') {
      return LinkAnnotation;
    } else if (subtype === 'Text') {
      return TextAnnotation;
    } else if (subtype === 'Widget') {
      if (!fieldType) {
        return;
      }

      if (fieldType === 'Tx') {
        return TextWidgetAnnotation;
      } else {
        return WidgetAnnotation;
      }
    } else {
      return Annotation;
    }
  };

  // TODO(mack): Support loading annotation from data
  Annotation.fromData = function Annotation_fromData(data) {
    var subtype = data.subtype;
    var fieldType = data.fieldType;
    var Constructor = Annotation.getConstructor(subtype, fieldType);
    if (Constructor) {
      return new Constructor({ data: data });
    }
  };

  Annotation.fromRef = function Annotation_fromRef(xref, ref) {

    var dict = xref.fetchIfRef(ref);
    if (!isDict(dict)) {
      return;
    }

    var subtype = dict.get('Subtype');
    subtype = isName(subtype) ? subtype.name : '';
    if (!subtype) {
      return;
    }

    var fieldType = Util.getInheritableProperty(dict, 'FT');
    fieldType = isName(fieldType) ? fieldType.name : '';

    var Constructor = Annotation.getConstructor(subtype, fieldType);
    if (!Constructor) {
      return;
    }

    var params = {
      dict: dict,
      ref: ref,
    };

    var annotation = new Constructor(params);

    if (annotation.isViewable()) {
      return annotation;
    } else {
      TODO('unimplemented annotation type: ' + subtype);
    }
  };

  Annotation.appendToOperatorList = function Annotation_appendToOperatorList(
      annotations, opList, pdfManager, partialEvaluator) {

    function reject(e) {
      annotationsReadyPromise.reject(e);
    }

    var annotationsReadyPromise = new Promise();

    var annotationPromises = [];
    for (var i = 0, n = annotations.length; i < n; ++i) {
      annotationPromises.push(annotations[i].getOperatorList(partialEvaluator));
    }
    Promise.all(annotationPromises).then(function(datas) {
      opList.addOp('beginAnnotations', []);
      for (var i = 0, n = datas.length; i < n; ++i) {
        var annotOpList = datas[i];
        opList.addOpList(annotOpList);
      }
      opList.addOp('endAnnotations', []);
      annotationsReadyPromise.resolve();
    }, reject);

    return annotationsReadyPromise;
  };

  return Annotation;
})();
PDFJS.Annotation = Annotation;


var WidgetAnnotation = (function WidgetAnnotationClosure() {

  function WidgetAnnotation(params) {
    Annotation.call(this, params);

    if (params.data) {
      return;
    }

    var dict = params.dict;
    var data = this.data;

    data.fieldValue = stringToPDFString(
      Util.getInheritableProperty(dict, 'V') || '');
    data.alternativeText = stringToPDFString(dict.get('TU') || '');
    data.defaultAppearance = Util.getInheritableProperty(dict, 'DA') || '';
    var fieldType = Util.getInheritableProperty(dict, 'FT');
    data.fieldType = isName(fieldType) ? fieldType.name : '';
    data.fieldFlags = Util.getInheritableProperty(dict, 'Ff') || 0;
    this.fieldResources = Util.getInheritableProperty(dict, 'DR') || new Dict();

    // Building the full field name by collecting the field and
    // its ancestors 'T' data and joining them using '.'.
    var fieldName = [];
    var namedItem = dict;
    var ref = params.ref;
    while (namedItem) {
      var parent = namedItem.get('Parent');
      var parentRef = namedItem.getRaw('Parent');
      var name = namedItem.get('T');
      if (name) {
        fieldName.unshift(stringToPDFString(name));
      } else {
        // The field name is absent, that means more than one field
        // with the same name may exist. Replacing the empty name
        // with the '`' plus index in the parent's 'Kids' array.
        // This is not in the PDF spec but necessary to id the
        // the input controls.
        var kids = parent.get('Kids');
        var j, jj;
        for (j = 0, jj = kids.length; j < jj; j++) {
          var kidRef = kids[j];
          if (kidRef.num == ref.num && kidRef.gen == ref.gen)
            break;
        }
        fieldName.unshift('`' + j);
      }
      namedItem = parent;
      ref = parentRef;
    }
    data.fullName = fieldName.join('.');
  }

  var parent = Annotation.prototype;
  Util.inherit(WidgetAnnotation, Annotation, {
    isViewable: function WidgetAnnotation_isViewable() {
      if (this.data.fieldType === 'Sig') {
        TODO('unimplemented annotation type: Widget signature');
        return false;
      }

      return parent.isViewable.call(this);
    }
  });

  return WidgetAnnotation;
})();

var TextWidgetAnnotation = (function TextWidgetAnnotationClosure() {
  function TextWidgetAnnotation(params) {
    WidgetAnnotation.call(this, params);

    if (params.data) {
      return;
    }

    this.data.textAlignment = Util.getInheritableProperty(params.dict, 'Q');
  }

  // TODO(mack): This dupes some of the logic in CanvasGraphics.setFont()
  function setTextStyles(element, item, fontObj) {

    var style = element.style;
    style.fontSize = item.fontSize + 'px';
    style.direction = item.fontDirection < 0 ? 'rtl': 'ltr';

    if (!fontObj) {
      return;
    }

    style.fontWeight = fontObj.black ?
                            (fontObj.bold ? 'bolder' : 'bold') :
                            (fontObj.bold ? 'bold' : 'normal');
    style.fontStyle = fontObj.italic ? 'italic' : 'normal';

    var fontName = fontObj.loadedName;
    var fontFamily = fontName ? '"' + fontName + '", ' : '';
    // Use a reasonable default font if the font doesn't specify a fallback
    var fallbackName = fontObj.fallbackName || 'Helvetica, sans-serif';
    style.fontFamily = fontFamily + fallbackName;
  }


  var parent = WidgetAnnotation.prototype;
  Util.inherit(TextWidgetAnnotation, WidgetAnnotation, {
    hasHtml: function TextWidgetAnnotation_hasHtml() {
      return !this.data.hasAppearance && !!this.data.fieldValue;
    },

    getHtmlElement: function TextWidgetAnnotation_getHtmlElement(commonObjs) {
      assert(!isWorker, 'getHtmlElement() shall be called from main thread');

      var item = this.data;

      var element = this.getEmptyContainer('div');
      element.style.display = 'table';

      var content = document.createElement('div');
      content.textContent = item.fieldValue;
      var textAlignment = item.textAlignment;
      content.style.textAlign = ['left', 'center', 'right'][textAlignment];
      content.style.verticalAlign = 'middle';
      content.style.display = 'table-cell';

      var fontObj = item.fontRefName ?
                    commonObjs.getData(item.fontRefName) : null;
      var cssRules = setTextStyles(content, item, fontObj);

      element.appendChild(content);

      return element;
    },

    getOperatorList: function TextWidgetAnnotation_getOperatorList(evaluator) {
      if (this.appearance) {
        return Annotation.prototype.getOperatorList.call(this, evaluator);
      }

      var promise = new Promise();
      var opList = new OperatorList();
      var data = this.data;

      // Even if there is an appearance stream, ignore it. This is the
      // behaviour used by Adobe Reader.

      var defaultAppearance = data.defaultAppearance;
      if (!defaultAppearance) {
        promise.resolve(opList);
        return promise;
      }

      // Include any font resources found in the default appearance

      var stream = new Stream(stringToBytes(defaultAppearance));
      evaluator.getOperatorList(stream, this.fieldResources, opList);
      var appearanceFnArray = opList.fnArray;
      var appearanceArgsArray = opList.argsArray;
      var fnArray = [];
      var argsArray = [];

      // TODO(mack): Add support for stroke color
      data.rgb = [0, 0, 0];
      // TODO THIS DOESN'T MAKE ANY SENSE SINCE THE fnArray IS EMPTY!
      for (var i = 0, n = fnArray.length; i < n; ++i) {
        var fnName = appearanceFnArray[i];
        var args = appearanceArgsArray[i];

        if (fnName === 'setFont') {
          data.fontRefName = args[0];
          var size = args[1];
          if (size < 0) {
            data.fontDirection = -1;
            data.fontSize = -size;
          } else {
            data.fontDirection = 1;
            data.fontSize = size;
          }
        } else if (fnName === 'setFillRGBColor') {
          data.rgb = args;
        } else if (fnName === 'setFillGray') {
          var rgbValue = args[0] * 255;
          data.rgb = [rgbValue, rgbValue, rgbValue];
        }
      }
      promise.resolve(opList);
      return promise;
    }
  });

  return TextWidgetAnnotation;
})();

var TextAnnotation = (function TextAnnotationClosure() {
  function TextAnnotation(params) {
    Annotation.call(this, params);

    if (params.data) {
      return;
    }

    var dict = params.dict;
    var data = this.data;

    var content = dict.get('Contents');
    var title = dict.get('T');
    data.content = stringToPDFString(content || '');
    data.title = stringToPDFString(title || '');
    data.name = !dict.has('Name') ? 'Note' : dict.get('Name').name;
  }

  var ANNOT_MIN_SIZE = 10;

  Util.inherit(TextAnnotation, Annotation, {

    getOperatorList: function TextAnnotation_getOperatorList(evaluator) {
      var promise = new Promise();
      promise.resolve(new OperatorList());
      return promise;
    },

    hasHtml: function TextAnnotation_hasHtml() {
      return true;
    },

    getHtmlElement: function TextAnnotation_getHtmlElement(commonObjs) {
      assert(!isWorker, 'getHtmlElement() shall be called from main thread');

      var item = this.data;
      var rect = item.rect;

      // sanity check because of OOo-generated PDFs
      if ((rect[3] - rect[1]) < ANNOT_MIN_SIZE) {
        rect[3] = rect[1] + ANNOT_MIN_SIZE;
      }
      if ((rect[2] - rect[0]) < ANNOT_MIN_SIZE) {
        rect[2] = rect[0] + (rect[3] - rect[1]); // make it square
      }

      var container = this.getEmptyContainer('section', rect);
      container.className = 'annotText';

      var image = document.createElement('img');
      image.style.height = container.style.height;
      var iconName = item.name;
      image.src = PDFJS.imageResourcesPath + 'annotation-' +
        iconName.toLowerCase() + '.svg';
      image.alt = '[{{type}} Annotation]';
      image.dataset.l10nId = 'text_annotation_type';
      image.dataset.l10nArgs = JSON.stringify({type: iconName});
      var content = document.createElement('div');
      content.setAttribute('hidden', true);
      var title = document.createElement('h1');
      var text = document.createElement('p');
      content.style.left = Math.floor(rect[2] - rect[0]) + 'px';
      content.style.top = '0px';
      title.textContent = item.title;

      if (!item.content && !item.title) {
        content.setAttribute('hidden', true);
      } else {
        var e = document.createElement('span');
        var lines = item.content.split(/(?:\r\n?|\n)/);
        for (var i = 0, ii = lines.length; i < ii; ++i) {
          var line = lines[i];
          e.appendChild(document.createTextNode(line));
          if (i < (ii - 1))
            e.appendChild(document.createElement('br'));
        }
        text.appendChild(e);

        var showAnnotation = function showAnnotation() {
          container.style.zIndex += 1;
          content.removeAttribute('hidden');
        };

        var hideAnnotation = function hideAnnotation(e) {
          if (e.toElement || e.relatedTarget) { // No context menu is used
            container.style.zIndex -= 1;
            content.setAttribute('hidden', true);
          }
        };

        content.addEventListener('mouseover', showAnnotation, false);
        content.addEventListener('mouseout', hideAnnotation, false);
        image.addEventListener('mouseover', showAnnotation, false);
        image.addEventListener('mouseout', hideAnnotation, false);
      }

      content.appendChild(title);
      content.appendChild(text);
      container.appendChild(image);
      container.appendChild(content);

      return container;
    }
  });

  return TextAnnotation;
})();

var LinkAnnotation = (function LinkAnnotationClosure() {
  function LinkAnnotation(params) {
    Annotation.call(this, params);

    if (params.data) {
      return;
    }

    var dict = params.dict;
    var data = this.data;

    var action = dict.get('A');
    if (action) {
      var linkType = action.get('S').name;
      if (linkType === 'URI') {
        var url = action.get('URI');
        // TODO: pdf spec mentions urls can be relative to a Base
        // entry in the dictionary.
        if (!isValidUrl(url, false)) {
          url = '';
        }
        data.url = url;
      } else if (linkType === 'GoTo') {
        data.dest = action.get('D');
      } else if (linkType === 'GoToR') {
        var urlDict = action.get('F');
        if (isDict(urlDict)) {
          // We assume that the 'url' is a Filspec dictionary
          // and fetch the url without checking any further
          url = urlDict.get('F') || '';
        }

        // TODO: pdf reference says that GoToR
        // can also have 'NewWindow' attribute
        if (!isValidUrl(url, false)) {
          url = '';
        }
        data.url = url;
        data.dest = action.get('D');
      } else if (linkType === 'Named') {
        data.action = action.get('N').name;
      } else {
        TODO('unrecognized link type: ' + linkType);
      }
    } else if (dict.has('Dest')) {
      // simple destination link
      var dest = dict.get('Dest');
      data.dest = isName(dest) ? dest.name : dest;
    }
  }

  Util.inherit(LinkAnnotation, Annotation, {
    hasOperatorList: function LinkAnnotation_hasOperatorList() {
      return false;
    },

    hasHtml: function LinkAnnotation_hasHtml() {
      return true;
    },

    getHtmlElement: function LinkAnnotation_getHtmlElement(commonObjs) {
      var rect = this.data.rect;
      var element = document.createElement('a');
      var borderWidth = this.data.borderWidth;

      element.style.borderWidth = borderWidth + 'px';
      var color = this.data.color;
      var rgb = [];
      for (var i = 0; i < 3; ++i) {
        rgb[i] = Math.round(color[i] * 255);
      }
      element.style.borderColor = Util.makeCssRgb(rgb);
      element.style.borderStyle = 'solid';

      var width = rect[2] - rect[0] - 2 * borderWidth;
      var height = rect[3] - rect[1] - 2 * borderWidth;
      element.style.width = width + 'px';
      element.style.height = height + 'px';

      element.href = this.data.url || '';
      return element;
    }
  });

  return LinkAnnotation;
})();
