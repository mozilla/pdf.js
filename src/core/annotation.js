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
  AnnotationBorderStyleType, AnnotationFieldFlag, AnnotationFlag,
  AnnotationType, OPS, stringToBytes, stringToPDFString, Util, warn
} from '../shared/util';
import { Catalog, FileSpec, ObjectLoader } from './obj';
import { Dict, isDict, isName, isRef, isStream } from './primitives';
import { ColorSpace } from './colorspace';
import { OperatorList } from './operator_list';
import { Stream } from './stream';

class AnnotationFactory {
  /**
   * @param {XRef} xref
   * @param {Object} ref
   * @param {PDFManager} pdfManager
   * @param {Object} idFactory
   * @returns {Annotation}
   */
  static create(xref, ref, pdfManager, idFactory) {
    let dict = xref.fetchIfRef(ref);
    if (!isDict(dict)) {
      return;
    }
    let id = isRef(ref) ? ref.toString() : 'annot_' + idFactory.createObjId();

    // Determine the annotation's subtype.
    let subtype = dict.get('Subtype');
    subtype = isName(subtype) ? subtype.name : null;

    // Return the right annotation object based on the subtype and field type.
    let parameters = {
      xref,
      dict,
      ref: isRef(ref) ? ref : null,
      subtype,
      id,
      pdfManager,
    };

    switch (subtype) {
      case 'Link':
        return new LinkAnnotation(parameters);

      case 'Text':
        return new TextAnnotation(parameters);

      case 'Widget':
        let fieldType = Util.getInheritableProperty(dict, 'FT');
        fieldType = isName(fieldType) ? fieldType.name : null;

        switch (fieldType) {
          case 'Tx':
            return new TextWidgetAnnotation(parameters);
          case 'Btn':
            return new ButtonWidgetAnnotation(parameters);
          case 'Ch':
            return new ChoiceWidgetAnnotation(parameters);
        }
        warn('Unimplemented widget field type "' + fieldType + '", ' +
             'falling back to base field type.');
        return new WidgetAnnotation(parameters);

      case 'Popup':
        return new PopupAnnotation(parameters);

      case 'Line':
        return new LineAnnotation(parameters);

      case 'Square':
        return new SquareAnnotation(parameters);

      case 'Circle':
        return new CircleAnnotation(parameters);

      case 'PolyLine':
        return new PolylineAnnotation(parameters);

      case 'Polygon':
        return new PolygonAnnotation(parameters);

      case 'Highlight':
        return new HighlightAnnotation(parameters);

      case 'Underline':
        return new UnderlineAnnotation(parameters);

      case 'Squiggly':
        return new SquigglyAnnotation(parameters);

      case 'StrikeOut':
        return new StrikeOutAnnotation(parameters);

      case 'Stamp':
        return new StampAnnotation(parameters);

      case 'FileAttachment':
        return new FileAttachmentAnnotation(parameters);

      default:
        if (!subtype) {
          warn('Annotation is missing the required /Subtype.');
        } else {
          warn('Unimplemented annotation type "' + subtype + '", ' +
               'falling back to base annotation.');
        }
        return new Annotation(parameters);
    }
  }
}

function getTransformMatrix(rect, bbox, matrix) {
  // 12.5.5: Algorithm: Appearance streams
  let bounds = Util.getAxialAlignedBoundingBox(bbox, matrix);
  let minX = bounds[0];
  let minY = bounds[1];
  let maxX = bounds[2];
  let maxY = bounds[3];

  if (minX === maxX || minY === maxY) {
    // From real-life file, bbox was [0, 0, 0, 0]. In this case,
    // just apply the transform for rect
    return [1, 0, 0, 1, rect[0], rect[1]];
  }

  let xRatio = (rect[2] - rect[0]) / (maxX - minX);
  let yRatio = (rect[3] - rect[1]) / (maxY - minY);
  return [
    xRatio,
    0,
    0,
    yRatio,
    rect[0] - minX * xRatio,
    rect[1] - minY * yRatio
  ];
}

class Annotation {
  constructor(params) {
    let dict = params.dict;

    this.setFlags(dict.get('F'));
    this.setRectangle(dict.getArray('Rect'));
    this.setColor(dict.getArray('C'));
    this.setBorderStyle(dict);
    this.setAppearance(dict);

    // Expose public properties using a data object.
    this.data = {
      annotationFlags: this.flags,
      borderStyle: this.borderStyle,
      color: this.color,
      hasAppearance: !!this.appearance,
      id: params.id,
      rect: this.rectangle,
      subtype: params.subtype,
    };
  }

  /**
   * @private
   */
  _hasFlag(flags, flag) {
    return !!(flags & flag);
  }

  /**
   * @private
   */
  _isViewable(flags) {
    return !this._hasFlag(flags, AnnotationFlag.INVISIBLE) &&
           !this._hasFlag(flags, AnnotationFlag.HIDDEN) &&
           !this._hasFlag(flags, AnnotationFlag.NOVIEW);
  }

  /**
   * @private
   */
  _isPrintable(flags) {
    return this._hasFlag(flags, AnnotationFlag.PRINT) &&
           !this._hasFlag(flags, AnnotationFlag.INVISIBLE) &&
           !this._hasFlag(flags, AnnotationFlag.HIDDEN);
  }

  /**
   * @return {boolean}
   */
  get viewable() {
    if (this.flags === 0) {
      return true;
    }
    return this._isViewable(this.flags);
  }

  /**
   * @return {boolean}
   */
  get printable() {
    if (this.flags === 0) {
      return false;
    }
    return this._isPrintable(this.flags);
  }

  /**
   * Set the flags.
   *
   * @public
   * @memberof Annotation
   * @param {number} flags - Unsigned 32-bit integer specifying annotation
   *                         characteristics
   * @see {@link shared/util.js}
   */
  setFlags(flags) {
    this.flags = (Number.isInteger(flags) && flags > 0) ? flags : 0;
  }

  /**
   * Check if a provided flag is set.
   *
   * @public
   * @memberof Annotation
   * @param {number} flag - Hexadecimal representation for an annotation
   *                        characteristic
   * @return {boolean}
   * @see {@link shared/util.js}
   */
  hasFlag(flag) {
    return this._hasFlag(this.flags, flag);
  }

  /**
   * Set the rectangle.
   *
   * @public
   * @memberof Annotation
   * @param {Array} rectangle - The rectangle array with exactly four entries
   */
  setRectangle(rectangle) {
    if (Array.isArray(rectangle) && rectangle.length === 4) {
      this.rectangle = Util.normalizeRect(rectangle);
    } else {
      this.rectangle = [0, 0, 0, 0];
    }
  }

  /**
   * Set the color and take care of color space conversion.
   *
   * @public
   * @memberof Annotation
   * @param {Array} color - The color array containing either 0
   *                        (transparent), 1 (grayscale), 3 (RGB) or
   *                        4 (CMYK) elements
   */
  setColor(color) {
    let rgbColor = new Uint8Array(3); // Black in RGB color space (default)
    if (!Array.isArray(color)) {
      this.color = rgbColor;
      return;
    }

    switch (color.length) {
      case 0: // Transparent, which we indicate with a null value
        this.color = null;
        break;

      case 1: // Convert grayscale to RGB
        ColorSpace.singletons.gray.getRgbItem(color, 0, rgbColor, 0);
        this.color = rgbColor;
        break;

      case 3: // Convert RGB percentages to RGB
        ColorSpace.singletons.rgb.getRgbItem(color, 0, rgbColor, 0);
        this.color = rgbColor;
        break;

      case 4: // Convert CMYK to RGB
        ColorSpace.singletons.cmyk.getRgbItem(color, 0, rgbColor, 0);
        this.color = rgbColor;
        break;

      default:
        this.color = rgbColor;
        break;
    }
  }

  /**
   * Set the border style (as AnnotationBorderStyle object).
   *
   * @public
   * @memberof Annotation
   * @param {Dict} borderStyle - The border style dictionary
   */
  setBorderStyle(borderStyle) {
    this.borderStyle = new AnnotationBorderStyle();
    if (!isDict(borderStyle)) {
      return;
    }
    if (borderStyle.has('BS')) {
      let dict = borderStyle.get('BS');
      let dictType = dict.get('Type');

      if (!dictType || isName(dictType, 'Border')) {
        this.borderStyle.setWidth(dict.get('W'));
        this.borderStyle.setStyle(dict.get('S'));
        this.borderStyle.setDashArray(dict.getArray('D'));
      }
    } else if (borderStyle.has('Border')) {
      let array = borderStyle.getArray('Border');
      if (Array.isArray(array) && array.length >= 3) {
        this.borderStyle.setHorizontalCornerRadius(array[0]);
        this.borderStyle.setVerticalCornerRadius(array[1]);
        this.borderStyle.setWidth(array[2]);

        if (array.length === 4) { // Dash array available
          this.borderStyle.setDashArray(array[3]);
        }
      }
    } else {
      // There are no border entries in the dictionary. According to the
      // specification, we should draw a solid border of width 1 in that
      // case, but Adobe Reader did not implement that part of the
      // specification and instead draws no border at all, so we do the same.
      // See also https://github.com/mozilla/pdf.js/issues/6179.
      this.borderStyle.setWidth(0);
    }
  }

  /**
   * Set the (normal) appearance.
   *
   * @public
   * @memberof Annotation
   * @param {Dict} dict - The annotation's data dictionary
   */
  setAppearance(dict) {
    this.appearance = null;

    let appearanceStates = dict.get('AP');
    if (!isDict(appearanceStates)) {
      return;
    }

    // In case the normal appearance is a stream, then it is used directly.
    let normalAppearanceState = appearanceStates.get('N');
    if (isStream(normalAppearanceState)) {
      this.appearance = normalAppearanceState;
      return;
    }
    if (!isDict(normalAppearanceState)) {
      return;
    }

    // In case the normal appearance is a dictionary, the `AS` entry provides
    // the key of the stream in this dictionary.
    let as = dict.get('AS');
    if (!isName(as) || !normalAppearanceState.has(as.name)) {
      return;
    }
    this.appearance = normalAppearanceState.get(as.name);
  }

  /**
   * Prepare the annotation for working with a popup in the display layer.
   *
   * @private
   * @memberof Annotation
   * @param {Dict} dict - The annotation's data dictionary
   */
  _preparePopup(dict) {
    if (!dict.has('C')) {
      // Fall back to the default background color.
      this.data.color = null;
    }

    this.data.hasPopup = dict.has('Popup');
    this.data.title = stringToPDFString(dict.get('T') || '');
    this.data.contents = stringToPDFString(dict.get('Contents') || '');
  }

  loadResources(keys) {
    return this.appearance.dict.getAsync('Resources').then((resources) => {
      if (!resources) {
        return;
      }
      let objectLoader = new ObjectLoader(resources, keys, resources.xref);

      return objectLoader.load().then(function() {
        return resources;
      });
    });
  }

  getOperatorList(evaluator, task, renderForms) {
    if (!this.appearance) {
      return Promise.resolve(new OperatorList());
    }

    let data = this.data;
    let appearanceDict = this.appearance.dict;
    let resourcesPromise = this.loadResources([
      'ExtGState',
      'ColorSpace',
      'Pattern',
      'Shading',
      'XObject',
      'Font',
      // ProcSet
      // Properties
    ]);
    let bbox = appearanceDict.getArray('BBox') || [0, 0, 1, 1];
    let matrix = appearanceDict.getArray('Matrix') || [1, 0, 0, 1, 0, 0];
    let transform = getTransformMatrix(data.rect, bbox, matrix);

    return resourcesPromise.then((resources) => {
      let opList = new OperatorList();
      opList.addOp(OPS.beginAnnotation, [data.rect, transform, matrix]);
      return evaluator.getOperatorList({
        stream: this.appearance,
        task,
        resources,
        operatorList: opList,
      }).then(() => {
        opList.addOp(OPS.endAnnotation, []);
        this.appearance.reset();
        return opList;
      });
    });
  }
}

/**
 * Contains all data regarding an annotation's border style.
 */
class AnnotationBorderStyle {
  constructor() {
    this.width = 1;
    this.style = AnnotationBorderStyleType.SOLID;
    this.dashArray = [3];
    this.horizontalCornerRadius = 0;
    this.verticalCornerRadius = 0;
  }

  /**
   * Set the width.
   *
   * @public
   * @memberof AnnotationBorderStyle
   * @param {integer} width - The width
   */
  setWidth(width) {
    if (Number.isInteger(width)) {
      this.width = width;
    }
  }

  /**
   * Set the style.
   *
   * @public
   * @memberof AnnotationBorderStyle
   * @param {Object} style - The style object
   * @see {@link shared/util.js}
   */
  setStyle(style) {
    if (!style) {
      return;
    }
    switch (style.name) {
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
  }

  /**
   * Set the dash array.
   *
   * @public
   * @memberof AnnotationBorderStyle
   * @param {Array} dashArray - The dash array with at least one element
   */
  setDashArray(dashArray) {
    // We validate the dash array, but we do not use it because CSS does not
    // allow us to change spacing of dashes. For more information, visit
    // http://www.w3.org/TR/css3-background/#the-border-style.
    if (Array.isArray(dashArray) && dashArray.length > 0) {
      // According to the PDF specification: the elements in `dashArray`
      // shall be numbers that are nonnegative and not all equal to zero.
      let isValid = true;
      let allZeros = true;
      for (let i = 0, len = dashArray.length; i < len; i++) {
        let element = dashArray[i];
        let validNumber = (+element >= 0);
        if (!validNumber) {
          isValid = false;
          break;
        } else if (element > 0) {
          allZeros = false;
        }
      }
      if (isValid && !allZeros) {
        this.dashArray = dashArray;
      } else {
        this.width = 0; // Adobe behavior when the array is invalid.
      }
    } else if (dashArray) {
      this.width = 0; // Adobe behavior when the array is invalid.
    }
  }

  /**
   * Set the horizontal corner radius (from a Border dictionary).
   *
   * @public
   * @memberof AnnotationBorderStyle
   * @param {integer} radius - The horizontal corner radius
   */
  setHorizontalCornerRadius(radius) {
    if (Number.isInteger(radius)) {
      this.horizontalCornerRadius = radius;
    }
  }

  /**
   * Set the vertical corner radius (from a Border dictionary).
   *
   * @public
   * @memberof AnnotationBorderStyle
   * @param {integer} radius - The vertical corner radius
   */
  setVerticalCornerRadius(radius) {
    if (Number.isInteger(radius)) {
      this.verticalCornerRadius = radius;
    }
  }
}

class WidgetAnnotation extends Annotation {
  constructor(params) {
    super(params);

    let dict = params.dict;
    let data = this.data;

    data.annotationType = AnnotationType.WIDGET;
    data.fieldName = this._constructFieldName(dict);
    data.fieldValue = Util.getInheritableProperty(dict, 'V',
                                                  /* getArray = */ true);
    data.alternativeText = stringToPDFString(dict.get('TU') || '');
    data.defaultAppearance = Util.getInheritableProperty(dict, 'DA') || '';
    let fieldType = Util.getInheritableProperty(dict, 'FT');
    data.fieldType = isName(fieldType) ? fieldType.name : null;
    this.fieldResources = Util.getInheritableProperty(dict, 'DR') || Dict.empty;

    data.fieldFlags = Util.getInheritableProperty(dict, 'Ff');
    if (!Number.isInteger(data.fieldFlags) || data.fieldFlags < 0) {
      data.fieldFlags = 0;
    }

    data.readOnly = this.hasFieldFlag(AnnotationFieldFlag.READONLY);

    // Hide signatures because we cannot validate them.
    if (data.fieldType === 'Sig') {
      this.setFlags(AnnotationFlag.HIDDEN);
    }
  }

  /**
   * Construct the (fully qualified) field name from the (partial) field
   * names of the field and its ancestors.
   *
   * @private
   * @memberof WidgetAnnotation
   * @param {Dict} dict - Complete widget annotation dictionary
   * @return {string}
   */
  _constructFieldName(dict) {
    // Both the `Parent` and `T` fields are optional. While at least one of
    // them should be provided, bad PDF generators may fail to do so.
    if (!dict.has('T') && !dict.has('Parent')) {
      warn('Unknown field name, falling back to empty field name.');
      return '';
    }

    // If no parent exists, the partial and fully qualified names are equal.
    if (!dict.has('Parent')) {
      return stringToPDFString(dict.get('T'));
    }

    // Form the fully qualified field name by appending the partial name to
    // the parent's fully qualified name, separated by a period.
    let fieldName = [];
    if (dict.has('T')) {
      fieldName.unshift(stringToPDFString(dict.get('T')));
    }

    let loopDict = dict;
    while (loopDict.has('Parent')) {
      loopDict = loopDict.get('Parent');
      if (!isDict(loopDict)) {
        // Even though it is not allowed according to the PDF specification,
        // bad PDF generators may provide a `Parent` entry that is not a
        // dictionary, but `null` for example (issue 8143).
        break;
      }

      if (loopDict.has('T')) {
        fieldName.unshift(stringToPDFString(loopDict.get('T')));
      }
    }
    return fieldName.join('.');
  }

  /**
   * Check if a provided field flag is set.
   *
   * @public
   * @memberof WidgetAnnotation
   * @param {number} flag - Hexadecimal representation for an annotation
   *                        field characteristic
   * @return {boolean}
   * @see {@link shared/util.js}
   */
  hasFieldFlag(flag) {
    return !!(this.data.fieldFlags & flag);
  }

  getOperatorList(evaluator, task, renderForms) {
    // Do not render form elements on the canvas when interactive forms are
    // enabled. The display layer is responsible for rendering them instead.
    if (renderForms) {
      return Promise.resolve(new OperatorList());
    }
    return super.getOperatorList(evaluator, task, renderForms);
  }
}

class TextWidgetAnnotation extends WidgetAnnotation {
  constructor(params) {
    super(params);

    // The field value is always a string.
    this.data.fieldValue = stringToPDFString(this.data.fieldValue || '');

    // Determine the alignment of text in the field.
    let alignment = Util.getInheritableProperty(params.dict, 'Q');
    if (!Number.isInteger(alignment) || alignment < 0 || alignment > 2) {
      alignment = null;
    }
    this.data.textAlignment = alignment;

    // Determine the maximum length of text in the field.
    let maximumLength = Util.getInheritableProperty(params.dict, 'MaxLen');
    if (!Number.isInteger(maximumLength) || maximumLength < 0) {
      maximumLength = null;
    }
    this.data.maxLen = maximumLength;

    // Process field flags for the display layer.
    this.data.multiLine = this.hasFieldFlag(AnnotationFieldFlag.MULTILINE);
    this.data.comb = this.hasFieldFlag(AnnotationFieldFlag.COMB) &&
                     !this.hasFieldFlag(AnnotationFieldFlag.MULTILINE) &&
                     !this.hasFieldFlag(AnnotationFieldFlag.PASSWORD) &&
                     !this.hasFieldFlag(AnnotationFieldFlag.FILESELECT) &&
                     this.data.maxLen !== null;
  }

  getOperatorList(evaluator, task, renderForms) {
    if (renderForms || this.appearance) {
      return super.getOperatorList(evaluator, task, renderForms);
    }

    let operatorList = new OperatorList();

    // Even if there is an appearance stream, ignore it. This is the
    // behaviour used by Adobe Reader.
    if (!this.data.defaultAppearance) {
      return Promise.resolve(operatorList);
    }

    let stream = new Stream(stringToBytes(this.data.defaultAppearance));
    return evaluator.getOperatorList({
      stream,
      task,
      resources: this.fieldResources,
      operatorList,
    }).then(function () {
      return operatorList;
    });
  }
}

class ButtonWidgetAnnotation extends WidgetAnnotation {
  constructor(params) {
    super(params);

    this.data.checkBox = !this.hasFieldFlag(AnnotationFieldFlag.RADIO) &&
                         !this.hasFieldFlag(AnnotationFieldFlag.PUSHBUTTON);
    this.data.radioButton = this.hasFieldFlag(AnnotationFieldFlag.RADIO) &&
                            !this.hasFieldFlag(AnnotationFieldFlag.PUSHBUTTON);
    this.data.pushButton = this.hasFieldFlag(AnnotationFieldFlag.PUSHBUTTON);

    if (this.data.checkBox) {
      this._processCheckBox();
    } else if (this.data.radioButton) {
      this._processRadioButton(params);
    } else if (this.data.pushButton) {
      this._processPushButton(params);
    } else {
      warn('Invalid field flags for button widget annotation');
    }
  }

  _processCheckBox() {
    if (!isName(this.data.fieldValue)) {
      return;
    }
    this.data.fieldValue = this.data.fieldValue.name;
  }

  _processRadioButton(params) {
    this.data.fieldValue = this.data.buttonValue = null;

    // The parent field's `V` entry holds a `Name` object with the appearance
    // state of whichever child field is currently in the "on" state.
    let fieldParent = params.dict.get('Parent');
    if (isDict(fieldParent) && fieldParent.has('V')) {
      let fieldParentValue = fieldParent.get('V');
      if (isName(fieldParentValue)) {
        this.data.fieldValue = fieldParentValue.name;
      }
    }

    // The button's value corresponds to its appearance state.
    let appearanceStates = params.dict.get('AP');
    if (!isDict(appearanceStates)) {
      return;
    }
    let normalAppearanceState = appearanceStates.get('N');
    if (!isDict(normalAppearanceState)) {
      return;
    }
    let keys = normalAppearanceState.getKeys();
    for (let i = 0, ii = keys.length; i < ii; i++) {
      if (keys[i] !== 'Off') {
        this.data.buttonValue = keys[i];
        break;
      }
    }
  }

  _processPushButton(params) {
    if (!params.dict.has('A')) {
      warn('Push buttons without action dictionaries are not supported');
      return;
    }

    Catalog.parseDestDictionary({
      destDict: params.dict,
      resultObj: this.data,
      docBaseUrl: params.pdfManager.docBaseUrl,
    });
  }
}

class ChoiceWidgetAnnotation extends WidgetAnnotation {
  constructor(params) {
    super(params);

    // Determine the options. The options array may consist of strings or
    // arrays. If the array consists of arrays, then the first element of
    // each array is the export value and the second element of each array is
    // the display value. If the array consists of strings, then these
    // represent both the export and display value. In this case, we convert
    // it to an array of arrays as well for convenience in the display layer.
    // Note that the specification does not state that the `Opt` field is
    // inheritable, but in practice PDF generators do make annotations
    // inherit the options from a parent annotation (issue 8094).
    this.data.options = [];

    let options = Util.getInheritableProperty(params.dict, 'Opt');
    if (Array.isArray(options)) {
      let xref = params.xref;
      for (let i = 0, ii = options.length; i < ii; i++) {
        let option = xref.fetchIfRef(options[i]);
        let isOptionArray = Array.isArray(option);

        this.data.options[i] = {
          exportValue: isOptionArray ? xref.fetchIfRef(option[0]) : option,
          displayValue: stringToPDFString(isOptionArray ?
                                          xref.fetchIfRef(option[1]) : option),
        };
      }
    }

    // Determine the field value. In this case, it may be a string or an
    // array of strings. For convenience in the display layer, convert the
    // string to an array of one string as well.
    if (!Array.isArray(this.data.fieldValue)) {
      this.data.fieldValue = [this.data.fieldValue];
    }

    // Process field flags for the display layer.
    this.data.combo = this.hasFieldFlag(AnnotationFieldFlag.COMBO);
    this.data.multiSelect = this.hasFieldFlag(AnnotationFieldFlag.MULTISELECT);
  }
}

class TextAnnotation extends Annotation {
  constructor(parameters) {
    const DEFAULT_ICON_SIZE = 22; // px

    super(parameters);

    this.data.annotationType = AnnotationType.TEXT;

    if (this.data.hasAppearance) {
      this.data.name = 'NoIcon';
    } else {
      this.data.rect[1] = this.data.rect[3] - DEFAULT_ICON_SIZE;
      this.data.rect[2] = this.data.rect[0] + DEFAULT_ICON_SIZE;
      this.data.name = parameters.dict.has('Name') ?
                       parameters.dict.get('Name').name : 'Note';
    }
    this._preparePopup(parameters.dict);
  }
}

class LinkAnnotation extends Annotation {
  constructor(params) {
    super(params);

    this.data.annotationType = AnnotationType.LINK;

    Catalog.parseDestDictionary({
      destDict: params.dict,
      resultObj: this.data,
      docBaseUrl: params.pdfManager.docBaseUrl,
    });
  }
}

class PopupAnnotation extends Annotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.POPUP;

    let dict = parameters.dict;
    let parentItem = dict.get('Parent');
    if (!parentItem) {
      warn('Popup annotation has a missing or invalid parent annotation.');
      return;
    }

    let parentSubtype = parentItem.get('Subtype');
    this.data.parentType = isName(parentSubtype) ? parentSubtype.name : null;
    this.data.parentId = dict.getRaw('Parent').toString();
    this.data.title = stringToPDFString(parentItem.get('T') || '');
    this.data.contents = stringToPDFString(parentItem.get('Contents') || '');

    if (!parentItem.has('C')) {
      // Fall back to the default background color.
      this.data.color = null;
    } else {
      this.setColor(parentItem.getArray('C'));
      this.data.color = this.color;
    }

    // If the Popup annotation is not viewable, but the parent annotation is,
    // that is most likely a bug. Fallback to inherit the flags from the parent
    // annotation (this is consistent with the behaviour in Adobe Reader).
    if (!this.viewable) {
      let parentFlags = parentItem.get('F');
      if (this._isViewable(parentFlags)) {
        this.setFlags(parentFlags);
      }
    }
  }
}

class LineAnnotation extends Annotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.LINE;

    let dict = parameters.dict;
    this.data.lineCoordinates = Util.normalizeRect(dict.getArray('L'));
    this._preparePopup(dict);
  }
}

class SquareAnnotation extends Annotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.SQUARE;
    this._preparePopup(parameters.dict);
  }
}

class CircleAnnotation extends Annotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.CIRCLE;
    this._preparePopup(parameters.dict);
  }
}

class PolylineAnnotation extends Annotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.POLYLINE;

    // The vertices array is an array of numbers representing the alternating
    // horizontal and vertical coordinates, respectively, of each vertex.
    // Convert this to an array of objects with x and y coordinates.
    let dict = parameters.dict;
    let rawVertices = dict.getArray('Vertices');

    this.data.vertices = [];
    for (let i = 0, ii = rawVertices.length; i < ii; i += 2) {
      this.data.vertices.push({
        x: rawVertices[i],
        y: rawVertices[i + 1],
      });
    }

    this._preparePopup(dict);
  }
}

class PolygonAnnotation extends PolylineAnnotation {
  constructor(parameters) {
    // Polygons are specific forms of polylines, so reuse their logic.
    super(parameters);

    this.data.annotationType = AnnotationType.POLYGON;
  }
}

class HighlightAnnotation extends Annotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.HIGHLIGHT;
    this._preparePopup(parameters.dict);
  }
}

class UnderlineAnnotation extends Annotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.UNDERLINE;
    this._preparePopup(parameters.dict);
  }
}

class SquigglyAnnotation extends Annotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.SQUIGGLY;
    this._preparePopup(parameters.dict);
  }
}

class StrikeOutAnnotation extends Annotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.STRIKEOUT;
    this._preparePopup(parameters.dict);
  }
}

class StampAnnotation extends Annotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.STAMP;
    this._preparePopup(parameters.dict);
  }
}

class FileAttachmentAnnotation extends Annotation {
  constructor(parameters) {
    super(parameters);

    let file = new FileSpec(parameters.dict.get('FS'), parameters.xref);

    this.data.annotationType = AnnotationType.FILEATTACHMENT;
    this.data.file = file.serializable;
    this._preparePopup(parameters.dict);
  }
}

export {
  Annotation,
  AnnotationBorderStyle,
  AnnotationFactory,
};
