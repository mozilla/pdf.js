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
           Promise */

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

    var border = dict.get('BS');
    if (isDict(border)) {
      var borderWidth = border.has('W') ? border.get('W') : 1;
      data.border = {
        width: borderWidth,
        type: border.get('S') || 'S',
        rgb: dict.get('C') || [0, 0, 1]
      };
    }

    this.appearance = getDefaultAppearance(dict);
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

    getEmptyContainer: function Annotaiton_getEmptyContainer(tagName, rect) {
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

    getOperatorList: function Annotation_appendToOperatorList(evaluator) {

      var promise = new Promise();

      if (!this.appearance) {
        promise.resolve({
          queue: {
            fnArray: [],
            argsArray: []
          },
          dependency: {}
        });
        return promise;
      }

      var data = this.data;

      var appearanceDict = this.appearance.dict;
      var resources = appearanceDict.get('Resources');
      var bbox = appearanceDict.get('BBox') || [0, 0, 1, 1];
      var matrix = appearanceDict.get('Matrix') || [1, 0, 0, 1, 0 ,0];
      var transform = getTransformMatrix(data.rect, bbox, matrix);

      var border = data.border;

      var listPromise = evaluator.getOperatorList(this.appearance, resources);
      listPromise.then(function(appearanceStreamData) {
        var fnArray = appearanceStreamData.queue.fnArray;
        var argsArray = appearanceStreamData.queue.argsArray;

        fnArray.unshift('beginAnnotation');
        argsArray.unshift([data.rect, transform, matrix]);

        fnArray.push('endAnnotation');
        argsArray.push([]);

        promise.resolve(appearanceStreamData);
      });

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

      return WidgetAnnotation;
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
  var IMAGE_DIR = './images/';

  Util.inherit(TextAnnotation, Annotation, {

    getOperatorList: function TextAnnotation_getOperatorList(evaluator) {
      var promise = new Promise();
      promise.resolve({
        queue: {
          fnArray: [],
          argsArray: []
        },
        dependency: {}
      });
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
      image.style.width = container.style.width;
      image.style.height = container.style.height;
      var iconName = item.name;
      image.src = IMAGE_DIR + 'annotation-' +
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
        image.addEventListener('mouseover', function annotationImageOver() {
          container.style.zIndex += 1;
          content.removeAttribute('hidden');
        }, false);

        image.addEventListener('mouseout', function annotationImageOut() {
          container.style.zIndex -= 1;
          content.setAttribute('hidden', true);
        }, false);
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
  function isValidUrl(url) {
    if (!url)
      return false;
    var colon = url.indexOf(':');
    if (colon < 0)
      return false;
    var protocol = url.substr(0, colon);
    switch (protocol) {
      case 'http':
      case 'https':
      case 'ftp':
      case 'mailto':
        return true;
      default:
        return false;
    }
  }

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
        if (!isValidUrl(url)) {
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
        if (!isValidUrl(url)) {
          url = '';
        }
        data.url = url;
        data.dest = action.get('D');
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
      var element = this.getEmptyContainer('a');
      element.href = this.data.url || '';
      return element;
    }
  });

  return LinkAnnotation;
})();
