/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2014 Mozilla Foundation
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
/* globals AnnotationType, AnnotationFlag, Util, Promise, OperatorList,
           AnnotationBorderStyleType, isDict, warn, isArray, DeviceGrayCS,
           DeviceRgbCS, DeviceCmykCS, isName, createPromiseCapability, OPS */

'use strict';

var DEFAULT_RECTANGLE = [0, 0, 0, 0];
var DEFAULT_DASH_ARRAY = [3];

/**
 * Contains basic data for each annotation type. Each annotation
 * type extends this class to obtain basic functionality.
 *
 * @class
 */
var Annotation = (function AnnotationClosure() {
  /*
   * @constructor
   * @private
   */
  function Annotation() {
    this.id = null;
    this.type = null;
    this.contents = null;
    this.name = null;
    this.date = null;
    this.rectangle = null;
    this.borderStyle = new AnnotationBorderStyle();
    this.color = null;
    this.flags = 0;
  }

  Annotation.prototype = {
    /**
     * Set the ID.
     *
     * @public
     * @memberof Annotation
     * @param id {integer} The ID
     */
    setId: function Annotation_setId(id) {
      if (id === (id | 0)) {
        this.id = id;
      }
    },

    /**
     * Get the ID.
     *
     * @public
     * @memberof Annotation
     * @default null
     * @return {integer|null} The ID, either a valid integer or null if
     *                        no (valid) ID has been set.
     */
    getId: function Annotation_getId() {
      return this.id;
    },

    /**
     * Set the type.
     *
     * @public
     * @memberof Annotation
     * @param type {integer} The type
     * @see {@link shared/util.js}
     */
    setType: function Annotation_setType(type) {
      if (type === (type | 0)) {
        if (type >= 1 && type <= Object.keys(AnnotationType).length) {
          this.type = type;
        }
      }
    },

    /**
     * Get the type.
     *
     * @public
     * @memberof Annotation
     * @default null
     * @return {integer|null} The type, either a valid integer or null if
     *                        no (valid) type has been set.
     * @see {@link shared/util.js}
     */
    getType: function Annotation_getType() {
      return this.type;
    },

    /**
     * Set the contents.
     *
     * @public
     * @memberof Annotation
     * @param contents {string} The contents
     */
    setContents: function Annotation_setContents(contents) {
      this.contents = contents || null;
    },

    /**
     * Get the contents.
     *
     * @public
     * @memberof Annotation
     * @default null
     * @return {string|null} The contents, either a valid string or null if
     *                       no (valid) contents have been set.
     */
    getContents: function Annotation_getContents() {
      return this.contents;
    },

    /**
     * Set the name.
     *
     * @public
     * @memberof Annotation
     * @param name {string} The name
     */
    setName: function Annotation_setName(name) {
      this.name = name || null;
    },

    /**
     * Get the name.
     *
     * @public
     * @memberof Annotation
     * @default null
     * @return {string|null} The name, either a valid string or null if
     *                       no (valid) name has been set.
     */
    getName: function Annotation_getName() {
      return this.name;
    },

    /**
     * Set the (modification) date. Note that this is a PDF date string
     * that needs conversion before being used.
     *
     * @public
     * @memberof Annotation
     * @param date {string} The (modification) date
     */
    setDate: function Annotation_setDate(date) {
      this.date = date || null;
    },

    /**
     * Get the (modification) date.
     *
     * @public
     * @memberof Annotation
     * @default null
     * @return {string|null} The (modification) date, either a valid PDF date
     *                       string or null if no (valid) date has been set.
     */
    getDate: function Annotation_getDate() {
      return this.date;
    },

    /**
     * Set the display rectangle.
     *
     * @public
     * @memberof Annotation
     * @param rectangle {Array} The display rectangle
     */
    setRectangle: function Annotation_setRectangle(rectangle) {
      if (isArray(rectangle) && rectangle.length === 4) {
        this.rectangle = Util.normalizeRect(rectangle);
      }
    },

    /**
     * Get the display rectangle.
     *
     * @public
     * @memberof Annotation
     * @default [0, 0, 0, 0]
     * @return {Array} The display rectangle
     */
    getRectangle: function Annotation_getRectangle() {
      return this.rectangle || DEFAULT_RECTANGLE;
    },

    /**
     * Set the border style (as AnnotationBorderStyle object).
     *
     * @public
     * @memberof Annotation
     * @param borderStyle {Dict} The border style dictionary
     */
    setBorderStyle: function Annotation_setBorderStyle(borderStyle) {
      if (isDict(borderStyle)) {
        if (borderStyle.has('BS')) {
          var dict = borderStyle.get('BS');

          if (!dict.has('Type') || (isName(dict.get('Type')) &&
                                    dict.get('Type').name === 'Border')) {
            this.borderStyle.setWidth(dict.get('W'));
            this.borderStyle.setStyle(dict.get('S').name);
            this.borderStyle.setDashArray(dict.get('D'));
          }
        } else if (borderStyle.has('Border')) {
          var array = borderStyle.get('Border');
          if (isArray(array) && array.length >= 3) {
            this.borderStyle.setHorizontalCornerRadius(array[0]);
            this.borderStyle.setVerticalCornerRadius(array[1]);
            this.borderStyle.setWidth(array[2]);
            this.borderStyle.setStyle('S');
            
            if (array.length === 4) { // Dash array available
              this.borderStyle.setDashArray(array[3]);
            }
          }
        }
      }
    },

    /**
     * Get the border style (as AnnotationBorderStyle object).
     *
     * @public
     * @memberof Annotation
     * @default defaults of AnnotationBorderStyle
     * @return {AnnotationBorderStyle} The border style object
     */
    getBorderStyle: function Annotation_getBorderStyle() {
      return this.borderStyle;
    },

    /**
     * Set the color and take care of color space conversion.
     *
     * @public
     * @memberof Annotation
     * @param color {Array} The color of a particular color space
     */
    setColor: function Annotation_setColorSpace(color) {
      if (isArray(color)) {
        var rgbColor = new Uint8Array(3);

        switch (color.length) {
          case 0: // Transparent border, so we do not need to draw it at all
            this.borderStyle.setWidth(0);
            break;

          case 1: // Convert gray to RGB
            var grayCS = new DeviceGrayCS();
            grayCS.getRgbItem(color, 0, rgbColor, 0);
            this.color = rgbColor;
            break;

          case 3: // Convert RGB percentages to RGB
            var rgbCS = new DeviceRgbCS();
            rgbCS.getRgbItem(color, 0, rgbColor, 0);
            this.color = rgbColor;
            break;

          case 4: // Convert CMYK to RGB
            var cmykCS = new DeviceCmykCS();
            cmykCS.getRgbItem(color, 0, rgbColor, 0);
            this.color = rgbColor;
            break;

          default:
            break;
        }
      }
    },

    /**
     * Get the color in RGB color space.
     *
     * @public
     * @memberof Annotation
     * @default null
     * @return {Array} The color in RGB color space
     */
    getColor: function Annotation_getColor() {
      return this.color;
    },

    /**
     * Set the flags.
     *
     * @public
     * @memberof Annotation
     * @param flags {integer} The flags
     * @see {@link shared/util.js}
     */
    setFlags: function Annotation_setFlag(flags) {
      if (flags === (flags | 0)) {
        this.flags = flags;
      }
    },

    /**
     * Check if a provided flag is set.
     *
     * @public
     * @memberof Annotation
     * @default false
     * @return {boolean} Whether or not the provided flag is set
     */
    hasFlag: function Annotation_hasFlag(bitMask) {
      if (this.flags) {
        return (this.flags & bitMask) > 0;
      }
      return false;
    },

    /**
     * Check if the annotation is viewable.
     *
     * @public
     * @memberof Annotation
     * @default true
     * @return {boolean} Whether or not the annotation is viewable
     */
    isViewable: function Annotation_isViewable() {
      if (this.flags) {
        return !this.hasFlag(AnnotationFlag.INVISIBLE) &&
               !this.hasFlag(AnnotationFlag.HIDDEN) &&
               !this.hasFlag(AnnotationFlag.NOVIEW);
      }
      return true;
    },

    /**
     * Check if the annotation is printable.
     *
     * @public
     * @memberof Annotation
     * @default false
     * @return {boolean} Whether or not the annotation is printable
     */
    isPrintable: function Annotation_isPrintable() {
      if (this.flags) {
        return this.hasFlag(AnnotationFlag.PRINT);
      }
      return false;
    }
  };

  return Annotation;
})();

/**
 * Contains all data regarding an annotation's border style.
 *
 * @class
 */
var AnnotationBorderStyle = (function AnnotationBorderStyleClosure() {
  /**
   * @constructor
   * @private
   */
  function AnnotationBorderStyle() {
    this.width = 1;
    this.style = AnnotationBorderStyleType.SOLID;
    this.dashArray = null;
    this.horizontalCornerRadius = 0;
    this.verticalCornerRadius = 0;
  }

  AnnotationBorderStyle.prototype = {
    /**
     * Set the width.
     *
     * @public
     * @memberof AnnotationBorderStyle
     * @param width {integer} The width
     */
    setWidth: function Annotation_setWidth(width) {
      if (width === (width | 0)) {
        this.width = width;
      }
    },

    /**
     * Get the width.
     *
     * @public
     * @memberof AnnotationBorderStyle
     * @default 1
     * @return {integer} The width
     */
    getWidth: function Annotation_getWidth() {
      return this.width;
    },

    /**
     * Set the style.
     *
     * @public
     * @memberof AnnotationBorderStyle
     * @param style {string} The style
     * @see {@link shared/util.js}
     */
    setStyle: function Annotation_setStyle(style) {
      switch (style) {
        case 'S':
          this.style = AnnotationBorderStyleType.SOLID;
          break;

        case 'D':
          this.style = AnnotationBorderStyleType.DASHED;
          break;

        case 'B':
          this.style = AnnotationBorderStyleType.BEVELED;
          break;

        case 'I':
          this.style = AnnotationBorderStyleType.INSET;
          break;

        case 'U':
          this.style = AnnotationBorderStyleType.UNDERLINE;
          break;

        default:
          break;
      }
    },

    /**
     * Get the style.
     *
     * @public
     * @memberof AnnotationBorderStyle
     * @default AnnotationBorderStyleType.SOLID
     * @return {integer} The style
     * @see {@link shared/util.js}
     */
    getStyle: function Annotation_getStyle() {
      return this.style;
    },

    /**
     * Set the dash array.
     *
     * @public
     * @memberof AnnotationBorderStyle
     * @param dashArray {Array} The dash array with at least one element
     */
    setDashArray: function Annotation_setDashArray(dashArray) {
      if (isArray(dashArray) && dashArray.length > 0) {
        // According to the PDF specification: the elements in a dashArray
        // shall be numbers that are nonnegative and not all equal to zero.
        var isInvalid = false;
        var numPositive = 0;
        for (var i = 0, len = dashArray.length; i < len; i++) {
          var validNumber = (+dashArray[i] >= 0);
          if (!validNumber) {
            isInvalid = true;
            break;
          } else if (dashArray[i] > 0) {
            numPositive++;
          }
        }
        if (!isInvalid && numPositive > 0) {
          this.dashArray = dashArray;
        } else {
          this.width = 0; // Adobe behavior when the array is invalid.
        }
      } else if(dashArray) {
        this.width = 0; // Adobe behavior when the array is invalid.
      }
    },

    /**
     * Get the dash array.
     *
     * @public
     * @memberof AnnotationBorderStyle
     * @default [3]
     * @return {Array} The dash array
     */
    getDashArray: function Annotation_getDashArray() {
      return this.dashArray || DEFAULT_DASH_ARRAY;
    },

    /**
     * Set the horizontal corner radius (from a Border dictionary).
     *
     * @public
     * @memberof AnnotationBorderStyle
     * @param radius {integer} The horizontal corner radius
     */
    setHorizontalCornerRadius:
        function Annotation_setHorizontalCornerRadius(radius) {
      if (radius === (radius | 0)) {
        this.horizontalCornerRadius = radius;
      }
    },

    /**
     * Get the horizontal corner radius.
     *
     * @public
     * @memberof AnnotationBorderStyle
     * @default 0
     * @return {integer} The horizontal corner radius
     */
    getHorizontalCornerRadius:
        function Annotation_getHorizontalCornerRadius() {
      return this.horizontalCornerRadius;
    },

    /**
     * Set the vertical corner radius (from a Border dictionary).
     *
     * @public
     * @memberof AnnotationBorderStyle
     * @param radius {integer} The vertical corner radius
     */
    setVerticalCornerRadius:
        function Annotation_setVerticalCornerRadius(radius) {
      if (radius === (radius | 0)) {
        this.verticalCornerRadius = radius;
      }
    },

    /**
     * Get the vertical corner radius.
     *
     * @public
     * @memberof AnnotationBorderStyle
     * @default 0
     * @return {integer} The vertical corner radius
     */
    getVerticalCornerRadius:
        function Annotation_getVerticalCornerRadius() {
      return this.verticalCornerRadius;
    }
  };

  return AnnotationBorderStyle;
})();

/**
 * Provides an interface to annotations (used by
 * src/core/core.js).
 *
 * @class
 */
var AnnotationLayer = (function AnnotationLayerClosure() {
  /**
   * @constructor
   * @private
   */
  function AnnotationLayer() {
    this.annotationHandler = new AnnotationHandler();
  }

  AnnotationLayer.prototype = {
    /**
     * Creates a single annotation of a requested type.
     *
     * @public
     * @memberof AnnotationLayer
     * @param params {Object} Parameters (such as ID) for creating
     *                        the annotation.
     * @return {Annotation|null} Either an annotation object of a supported
     *                           type or null if the requested type is not
     *                           supported or the annotation is not viewable 
     *                           or printable.
     */
    getAnnotation: function AnnotationLayer_getAnnotation(dict, ref) {
      // Make sure we are dealing with a valid annotation dictionary.
      if (!isDict(dict) || (isDict(dict) && isName(dict.get('Type')) &&
                            dict.get('Type').name !== 'Annot')) {
        warn('Invalid annotation dictionary');
        return;
      }

      var subType = dict.get('Subtype');
      if (!isName(subType)) {
        return;
      }
      subType = subType.name;

      // Create and configure the annotation object.
      var annotation = null;
      var params = {
        dict: dict,
        ref: ref
      };

      switch (subType) {
        case 'Link':
          annotation = this.annotationHandler.createLinkAnnotation(params);
          break;

        default:
          warn('Unimplemented annotation type: ' + subType);
          return null;
      }

      if (annotation.isViewable() || annotation.isPrintable()) {
        return annotation;
      }
      return null;
    },

    /**
     * Appends annotations to the operator list.
     *
     * @public
     * @memberof AnnotationLayer
     * @param annotations {Array} All available annotations
     * @param opList {OperatorList} The current operator list
     * @param partialEvaluator {PartialEvaluator} The partial evaluator
     * @param intent {string} The rendering intent (display or print)
     * @return {Promise} Promise indicating that the annotations are ready.
     */
    appendToOperatorList:
        function AnnotationLayer_appendToOperatorList(annotations, opList,
                                                      partialEvaluator,
                                                      intent) {
      function reject(e) {
        annotationsReadyCapability.reject(e);
      }

      var annotationsReadyCapability = createPromiseCapability();

      var annotationPromises = [];
      for (var i = 0, n = annotations.length; i < n; ++i) {
        if (intent === 'display' && annotations[i].isViewable() ||
            intent === 'print' && annotations[i].isPrintable()) {
          annotationPromises.push(new OperatorList());
        }
      }
      Promise.all(annotationPromises).then(function(data) {
        opList.addOp(OPS.beginAnnotations, []);
        for (var i = 0, n = data.length; i < n; ++i) {
          var annotOpList = data[i];
          opList.addOpList(annotOpList);
        }
        opList.addOp(OPS.endAnnotations, []);
        annotationsReadyCapability.resolve();
      }, reject);

      return annotationsReadyCapability.promise;
    }
  };

  return AnnotationLayer;
})();

/**
 * Handles creation and configuration of annotation
 * objects of all types.
 *
 * @class
 */
var AnnotationHandler = (function AnnotationHandlerClosure() {
  /**
   * @constructor
   * @private
   */
  function AnnotationHandler() {}

  AnnotationHandler.prototype = {
    /**
     * Creates and configures a link annotation.
     *
     * @public
     * @memberof AnnotationHandler
     * @param params {Object} Parameters (such as ID) for creating
     *                        the link annotation.
     * @return {LinkAnnotation} Configured link annotation object.
     */
    createLinkAnnotation:
        function AnnotationLayer_createLinkAnnotation(params) {
      var dict = params.dict;
      var annotation = new LinkAnnotation();
      var action = null;

      annotation.setId(params.ref.num);
      annotation.setType(AnnotationType.LINK);
      annotation.setContents(dict.get('Contents'));
      annotation.setName(dict.get('NM'));
      annotation.setDate(dict.get('M'));
      annotation.setRectangle(dict.get('Rect'));
      annotation.setBorderStyle(dict);
      annotation.setColor(dict.get('C'));
      annotation.setFlags(dict.get('F'));
      if (dict.has('A')) {
        annotation.setAction(dict.get('A'));
      } else if (dict.has('Dest')) {
        annotation.setDestination(dict.get('Dest'));
      }

      return annotation;
    }
  };

  return AnnotationHandler;
})();

/**
 * Contains all data specific to Link annotations as
 * described in section 8.4.5 of the PDF specification.
 *
 * @class
 * @extends Annotation
 */
var LinkAnnotation = (function LinkAnnotationClosure() {
  /**
   * @constructor
   * @private
   */
  function LinkAnnotation() {
    Annotation.call(this);

    this.action = null;
    this.destination = null;
  }

  LinkAnnotation.prototype = {
    /**
     * Set the action.
     *
     * @public
     * @memberof LinkAnnotation
     * @param action {Dict} Object containing details for
     *                      the action to be set
     */
    setAction: function LinkAnnotation_setAction(action) {
      if (isDict(action)) {
        if (isName(action.get('Type')) &&
            action.get('Type').name !== 'Action') {
          return;
        }

        var linkType = action.get('S').name;
        var destination = action.get('D');

        switch (linkType) {
          case 'URI':
            var url = action.get('URI') || '';

            if (isName(url)) {
              // Some bad PDFs do not put parentheses around relative URLs.
              url = '/' + url.name;
            }
            
            // Add default protocol to URL.
            if (url && url.indexOf('www.') === 0) {
              url = 'http://' + url;
            }

            this.action = {
              type: 'URI',
              url: url
            };
            break;

          case 'GoTo':
            this.action = {
              type: 'GoTo',
              destination: (isName(destination) ? destination.name :
                            (!isArray(destination) ? destination : ''))
            };
            break;

          case 'GoToR':
            this.action = {
              type: 'GoToR',
              destination: (isName(destination) ? destination.name :
                            (!isArray(destination) ? destination : '')),
              url: action.get('F'),
              newWindow: (action.get('NewWindow') ? true : false)
            };
            break;

          case 'Named':
            this.action = {
              type: 'Named',
              action: action.get('N').name
            };
            break;

          default:
            warn('Unrecognized link type: ' + linkType);
            break;
        }
      }
    },

    /**
     * Get the action.
     *
     * @public
     * @memberof LinkAnnotation
     * @default null
     * @return {Object|null} The annotation's action details, either an object
     *                       (that can contain type, url, destination,
     *                       newWindow or action fields depending on the
     *                       link type) or null if no (valid) action has been
     *                       set.
     */
    getAction: function Annotation_getAction() {
      return this.action;
    },

    /**
     * Set the destination.
     *
     * @public
     * @memberof LinkAnnotation
     * @param destination {Name|string} The annotation's destination
     */
    setDestination: function LinkAnnotation_setDestination(destination) {
      if (destination) {
        this.destination = (isName(destination) ? destination.name :
                            (!isArray(destination) ? destination : ''));
      }
    },

    /**
     * Get the destination.
     *
     * @public
     * @memberof LinkAnnotation
     * @default null
     * @return {string|null} The annotation's destination, either a string or
     *                       null if no (valid) destination has been set.
     */
    getDestination: function Annotation_getDestination() {
      return this.destination;
    }
  };

  Util.inherit(LinkAnnotation, Annotation, LinkAnnotation.prototype);

  return LinkAnnotation;
})();
