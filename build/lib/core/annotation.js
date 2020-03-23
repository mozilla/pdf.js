/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getQuadPoints = getQuadPoints;
exports.MarkupAnnotation = exports.AnnotationFactory = exports.AnnotationBorderStyle = exports.Annotation = void 0;

var _util = require("../shared/util.js");

var _obj = require("./obj.js");

var _primitives = require("./primitives.js");

var _colorspace = require("./colorspace.js");

var _core_utils = require("./core_utils.js");

var _operator_list = require("./operator_list.js");

var _stream = require("./stream.js");

class AnnotationFactory {
  static create(xref, ref, pdfManager, idFactory) {
    return pdfManager.ensure(this, "_create", [xref, ref, pdfManager, idFactory]);
  }

  static _create(xref, ref, pdfManager, idFactory) {
    const dict = xref.fetchIfRef(ref);

    if (!(0, _primitives.isDict)(dict)) {
      return undefined;
    }

    const id = (0, _primitives.isRef)(ref) ? ref.toString() : `annot_${idFactory.createObjId()}`;
    let subtype = dict.get("Subtype");
    subtype = (0, _primitives.isName)(subtype) ? subtype.name : null;
    const parameters = {
      xref,
      dict,
      subtype,
      id,
      pdfManager
    };

    switch (subtype) {
      case "Link":
        return new LinkAnnotation(parameters);

      case "Text":
        return new TextAnnotation(parameters);

      case "Widget":
        let fieldType = (0, _core_utils.getInheritableProperty)({
          dict,
          key: "FT"
        });
        fieldType = (0, _primitives.isName)(fieldType) ? fieldType.name : null;

        switch (fieldType) {
          case "Tx":
            return new TextWidgetAnnotation(parameters);

          case "Btn":
            return new ButtonWidgetAnnotation(parameters);

          case "Ch":
            return new ChoiceWidgetAnnotation(parameters);
        }

        (0, _util.warn)('Unimplemented widget field type "' + fieldType + '", ' + "falling back to base field type.");
        return new WidgetAnnotation(parameters);

      case "Popup":
        return new PopupAnnotation(parameters);

      case "FreeText":
        return new FreeTextAnnotation(parameters);

      case "Line":
        return new LineAnnotation(parameters);

      case "Square":
        return new SquareAnnotation(parameters);

      case "Circle":
        return new CircleAnnotation(parameters);

      case "PolyLine":
        return new PolylineAnnotation(parameters);

      case "Polygon":
        return new PolygonAnnotation(parameters);

      case "Caret":
        return new CaretAnnotation(parameters);

      case "Ink":
        return new InkAnnotation(parameters);

      case "Highlight":
        return new HighlightAnnotation(parameters);

      case "Underline":
        return new UnderlineAnnotation(parameters);

      case "Squiggly":
        return new SquigglyAnnotation(parameters);

      case "StrikeOut":
        return new StrikeOutAnnotation(parameters);

      case "Stamp":
        return new StampAnnotation(parameters);

      case "FileAttachment":
        return new FileAttachmentAnnotation(parameters);

      default:
        if (!subtype) {
          (0, _util.warn)("Annotation is missing the required /Subtype.");
        } else {
          (0, _util.warn)('Unimplemented annotation type "' + subtype + '", ' + "falling back to base annotation.");
        }

        return new Annotation(parameters);
    }
  }

}

exports.AnnotationFactory = AnnotationFactory;

function getQuadPoints(dict, rect) {
  if (!dict.has("QuadPoints")) {
    return null;
  }

  const quadPoints = dict.getArray("QuadPoints");

  if (!Array.isArray(quadPoints) || quadPoints.length % 8 > 0) {
    return null;
  }

  const quadPointsLists = [];

  for (let i = 0, ii = quadPoints.length / 8; i < ii; i++) {
    quadPointsLists.push([]);

    for (let j = i * 8, jj = i * 8 + 8; j < jj; j += 2) {
      const x = quadPoints[j];
      const y = quadPoints[j + 1];

      if (x < rect[0] || x > rect[2] || y < rect[1] || y > rect[3]) {
        return null;
      }

      quadPointsLists[i].push({
        x,
        y
      });
    }
  }

  return quadPointsLists;
}

function getTransformMatrix(rect, bbox, matrix) {
  const [minX, minY, maxX, maxY] = _util.Util.getAxialAlignedBoundingBox(bbox, matrix);

  if (minX === maxX || minY === maxY) {
    return [1, 0, 0, 1, rect[0], rect[1]];
  }

  const xRatio = (rect[2] - rect[0]) / (maxX - minX);
  const yRatio = (rect[3] - rect[1]) / (maxY - minY);
  return [xRatio, 0, 0, yRatio, rect[0] - minX * xRatio, rect[1] - minY * yRatio];
}

class Annotation {
  constructor(params) {
    const dict = params.dict;
    this.setContents(dict.get("Contents"));
    this.setModificationDate(dict.get("M"));
    this.setFlags(dict.get("F"));
    this.setRectangle(dict.getArray("Rect"));
    this.setColor(dict.getArray("C"));
    this.setBorderStyle(dict);
    this.setAppearance(dict);
    this.data = {
      annotationFlags: this.flags,
      borderStyle: this.borderStyle,
      color: this.color,
      contents: this.contents,
      hasAppearance: !!this.appearance,
      id: params.id,
      modificationDate: this.modificationDate,
      rect: this.rectangle,
      subtype: params.subtype
    };
  }

  _hasFlag(flags, flag) {
    return !!(flags & flag);
  }

  _isViewable(flags) {
    return !this._hasFlag(flags, _util.AnnotationFlag.INVISIBLE) && !this._hasFlag(flags, _util.AnnotationFlag.HIDDEN) && !this._hasFlag(flags, _util.AnnotationFlag.NOVIEW);
  }

  _isPrintable(flags) {
    return this._hasFlag(flags, _util.AnnotationFlag.PRINT) && !this._hasFlag(flags, _util.AnnotationFlag.INVISIBLE) && !this._hasFlag(flags, _util.AnnotationFlag.HIDDEN);
  }

  get viewable() {
    if (this.flags === 0) {
      return true;
    }

    return this._isViewable(this.flags);
  }

  get printable() {
    if (this.flags === 0) {
      return false;
    }

    return this._isPrintable(this.flags);
  }

  setContents(contents) {
    this.contents = (0, _util.stringToPDFString)(contents || "");
  }

  setModificationDate(modificationDate) {
    this.modificationDate = (0, _util.isString)(modificationDate) ? modificationDate : null;
  }

  setFlags(flags) {
    this.flags = Number.isInteger(flags) && flags > 0 ? flags : 0;
  }

  hasFlag(flag) {
    return this._hasFlag(this.flags, flag);
  }

  setRectangle(rectangle) {
    if (Array.isArray(rectangle) && rectangle.length === 4) {
      this.rectangle = _util.Util.normalizeRect(rectangle);
    } else {
      this.rectangle = [0, 0, 0, 0];
    }
  }

  setColor(color) {
    const rgbColor = new Uint8ClampedArray(3);

    if (!Array.isArray(color)) {
      this.color = rgbColor;
      return;
    }

    switch (color.length) {
      case 0:
        this.color = null;
        break;

      case 1:
        _colorspace.ColorSpace.singletons.gray.getRgbItem(color, 0, rgbColor, 0);

        this.color = rgbColor;
        break;

      case 3:
        _colorspace.ColorSpace.singletons.rgb.getRgbItem(color, 0, rgbColor, 0);

        this.color = rgbColor;
        break;

      case 4:
        _colorspace.ColorSpace.singletons.cmyk.getRgbItem(color, 0, rgbColor, 0);

        this.color = rgbColor;
        break;

      default:
        this.color = rgbColor;
        break;
    }
  }

  setBorderStyle(borderStyle) {
    this.borderStyle = new AnnotationBorderStyle();

    if (!(0, _primitives.isDict)(borderStyle)) {
      return;
    }

    if (borderStyle.has("BS")) {
      const dict = borderStyle.get("BS");
      const dictType = dict.get("Type");

      if (!dictType || (0, _primitives.isName)(dictType, "Border")) {
        this.borderStyle.setWidth(dict.get("W"), this.rectangle);
        this.borderStyle.setStyle(dict.get("S"));
        this.borderStyle.setDashArray(dict.getArray("D"));
      }
    } else if (borderStyle.has("Border")) {
      const array = borderStyle.getArray("Border");

      if (Array.isArray(array) && array.length >= 3) {
        this.borderStyle.setHorizontalCornerRadius(array[0]);
        this.borderStyle.setVerticalCornerRadius(array[1]);
        this.borderStyle.setWidth(array[2], this.rectangle);

        if (array.length === 4) {
          this.borderStyle.setDashArray(array[3]);
        }
      }
    } else {
      this.borderStyle.setWidth(0);
    }
  }

  setAppearance(dict) {
    this.appearance = null;
    const appearanceStates = dict.get("AP");

    if (!(0, _primitives.isDict)(appearanceStates)) {
      return;
    }

    const normalAppearanceState = appearanceStates.get("N");

    if ((0, _primitives.isStream)(normalAppearanceState)) {
      this.appearance = normalAppearanceState;
      return;
    }

    if (!(0, _primitives.isDict)(normalAppearanceState)) {
      return;
    }

    const as = dict.get("AS");

    if (!(0, _primitives.isName)(as) || !normalAppearanceState.has(as.name)) {
      return;
    }

    this.appearance = normalAppearanceState.get(as.name);
  }

  loadResources(keys) {
    return this.appearance.dict.getAsync("Resources").then(resources => {
      if (!resources) {
        return undefined;
      }

      const objectLoader = new _obj.ObjectLoader(resources, keys, resources.xref);
      return objectLoader.load().then(function () {
        return resources;
      });
    });
  }

  getOperatorList(evaluator, task, renderForms) {
    if (!this.appearance) {
      return Promise.resolve(new _operator_list.OperatorList());
    }

    const data = this.data;
    const appearanceDict = this.appearance.dict;
    const resourcesPromise = this.loadResources(["ExtGState", "ColorSpace", "Pattern", "Shading", "XObject", "Font"]);
    const bbox = appearanceDict.getArray("BBox") || [0, 0, 1, 1];
    const matrix = appearanceDict.getArray("Matrix") || [1, 0, 0, 1, 0, 0];
    const transform = getTransformMatrix(data.rect, bbox, matrix);
    return resourcesPromise.then(resources => {
      const opList = new _operator_list.OperatorList();
      opList.addOp(_util.OPS.beginAnnotation, [data.rect, transform, matrix]);
      return evaluator.getOperatorList({
        stream: this.appearance,
        task,
        resources,
        operatorList: opList
      }).then(() => {
        opList.addOp(_util.OPS.endAnnotation, []);
        this.appearance.reset();
        return opList;
      });
    });
  }

}

exports.Annotation = Annotation;

class AnnotationBorderStyle {
  constructor() {
    this.width = 1;
    this.style = _util.AnnotationBorderStyleType.SOLID;
    this.dashArray = [3];
    this.horizontalCornerRadius = 0;
    this.verticalCornerRadius = 0;
  }

  setWidth(width, rect = [0, 0, 0, 0]) {
    if ((0, _primitives.isName)(width)) {
      this.width = 0;
      return;
    }

    if (Number.isInteger(width)) {
      if (width > 0) {
        const maxWidth = (rect[2] - rect[0]) / 2;
        const maxHeight = (rect[3] - rect[1]) / 2;

        if (maxWidth > 0 && maxHeight > 0 && (width > maxWidth || width > maxHeight)) {
          (0, _util.warn)(`AnnotationBorderStyle.setWidth - ignoring width: ${width}`);
          width = 1;
        }
      }

      this.width = width;
    }
  }

  setStyle(style) {
    if (!(0, _primitives.isName)(style)) {
      return;
    }

    switch (style.name) {
      case "S":
        this.style = _util.AnnotationBorderStyleType.SOLID;
        break;

      case "D":
        this.style = _util.AnnotationBorderStyleType.DASHED;
        break;

      case "B":
        this.style = _util.AnnotationBorderStyleType.BEVELED;
        break;

      case "I":
        this.style = _util.AnnotationBorderStyleType.INSET;
        break;

      case "U":
        this.style = _util.AnnotationBorderStyleType.UNDERLINE;
        break;

      default:
        break;
    }
  }

  setDashArray(dashArray) {
    if (Array.isArray(dashArray) && dashArray.length > 0) {
      let isValid = true;
      let allZeros = true;

      for (const element of dashArray) {
        const validNumber = +element >= 0;

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
        this.width = 0;
      }
    } else if (dashArray) {
      this.width = 0;
    }
  }

  setHorizontalCornerRadius(radius) {
    if (Number.isInteger(radius)) {
      this.horizontalCornerRadius = radius;
    }
  }

  setVerticalCornerRadius(radius) {
    if (Number.isInteger(radius)) {
      this.verticalCornerRadius = radius;
    }
  }

}

exports.AnnotationBorderStyle = AnnotationBorderStyle;

class MarkupAnnotation extends Annotation {
  constructor(parameters) {
    super(parameters);
    const dict = parameters.dict;

    if (dict.has("IRT")) {
      const rawIRT = dict.getRaw("IRT");
      this.data.inReplyTo = (0, _primitives.isRef)(rawIRT) ? rawIRT.toString() : null;
      const rt = dict.get("RT");
      this.data.replyType = (0, _primitives.isName)(rt) ? rt.name : _util.AnnotationReplyType.REPLY;
    }

    if (this.data.replyType === _util.AnnotationReplyType.GROUP) {
      const parent = dict.get("IRT");
      this.data.title = (0, _util.stringToPDFString)(parent.get("T") || "");
      this.setContents(parent.get("Contents"));
      this.data.contents = this.contents;

      if (!parent.has("CreationDate")) {
        this.data.creationDate = null;
      } else {
        this.setCreationDate(parent.get("CreationDate"));
        this.data.creationDate = this.creationDate;
      }

      if (!parent.has("M")) {
        this.data.modificationDate = null;
      } else {
        this.setModificationDate(parent.get("M"));
        this.data.modificationDate = this.modificationDate;
      }

      this.data.hasPopup = parent.has("Popup");

      if (!parent.has("C")) {
        this.data.color = null;
      } else {
        this.setColor(parent.getArray("C"));
        this.data.color = this.color;
      }
    } else {
      this.data.title = (0, _util.stringToPDFString)(dict.get("T") || "");
      this.setCreationDate(dict.get("CreationDate"));
      this.data.creationDate = this.creationDate;
      this.data.hasPopup = dict.has("Popup");

      if (!dict.has("C")) {
        this.data.color = null;
      }
    }
  }

  setCreationDate(creationDate) {
    this.creationDate = (0, _util.isString)(creationDate) ? creationDate : null;
  }

}

exports.MarkupAnnotation = MarkupAnnotation;

class WidgetAnnotation extends Annotation {
  constructor(params) {
    super(params);
    const dict = params.dict;
    const data = this.data;
    data.annotationType = _util.AnnotationType.WIDGET;
    data.fieldName = this._constructFieldName(dict);
    data.fieldValue = (0, _core_utils.getInheritableProperty)({
      dict,
      key: "V",
      getArray: true
    });
    data.alternativeText = (0, _util.stringToPDFString)(dict.get("TU") || "");
    data.defaultAppearance = (0, _core_utils.getInheritableProperty)({
      dict,
      key: "DA"
    }) || "";
    const fieldType = (0, _core_utils.getInheritableProperty)({
      dict,
      key: "FT"
    });
    data.fieldType = (0, _primitives.isName)(fieldType) ? fieldType.name : null;
    this.fieldResources = (0, _core_utils.getInheritableProperty)({
      dict,
      key: "DR"
    }) || _primitives.Dict.empty;
    data.fieldFlags = (0, _core_utils.getInheritableProperty)({
      dict,
      key: "Ff"
    });

    if (!Number.isInteger(data.fieldFlags) || data.fieldFlags < 0) {
      data.fieldFlags = 0;
    }

    data.readOnly = this.hasFieldFlag(_util.AnnotationFieldFlag.READONLY);

    if (data.fieldType === "Sig") {
      data.fieldValue = null;
      this.setFlags(_util.AnnotationFlag.HIDDEN);
    }
  }

  _constructFieldName(dict) {
    if (!dict.has("T") && !dict.has("Parent")) {
      (0, _util.warn)("Unknown field name, falling back to empty field name.");
      return "";
    }

    if (!dict.has("Parent")) {
      return (0, _util.stringToPDFString)(dict.get("T"));
    }

    const fieldName = [];

    if (dict.has("T")) {
      fieldName.unshift((0, _util.stringToPDFString)(dict.get("T")));
    }

    let loopDict = dict;

    while (loopDict.has("Parent")) {
      loopDict = loopDict.get("Parent");

      if (!(0, _primitives.isDict)(loopDict)) {
        break;
      }

      if (loopDict.has("T")) {
        fieldName.unshift((0, _util.stringToPDFString)(loopDict.get("T")));
      }
    }

    return fieldName.join(".");
  }

  hasFieldFlag(flag) {
    return !!(this.data.fieldFlags & flag);
  }

  getOperatorList(evaluator, task, renderForms) {
    if (renderForms) {
      return Promise.resolve(new _operator_list.OperatorList());
    }

    return super.getOperatorList(evaluator, task, renderForms);
  }

}

class TextWidgetAnnotation extends WidgetAnnotation {
  constructor(params) {
    super(params);
    const dict = params.dict;
    this.data.fieldValue = (0, _util.stringToPDFString)(this.data.fieldValue || "");
    let alignment = (0, _core_utils.getInheritableProperty)({
      dict,
      key: "Q"
    });

    if (!Number.isInteger(alignment) || alignment < 0 || alignment > 2) {
      alignment = null;
    }

    this.data.textAlignment = alignment;
    let maximumLength = (0, _core_utils.getInheritableProperty)({
      dict,
      key: "MaxLen"
    });

    if (!Number.isInteger(maximumLength) || maximumLength < 0) {
      maximumLength = null;
    }

    this.data.maxLen = maximumLength;
    this.data.multiLine = this.hasFieldFlag(_util.AnnotationFieldFlag.MULTILINE);
    this.data.comb = this.hasFieldFlag(_util.AnnotationFieldFlag.COMB) && !this.hasFieldFlag(_util.AnnotationFieldFlag.MULTILINE) && !this.hasFieldFlag(_util.AnnotationFieldFlag.PASSWORD) && !this.hasFieldFlag(_util.AnnotationFieldFlag.FILESELECT) && this.data.maxLen !== null;
  }

  getOperatorList(evaluator, task, renderForms) {
    if (renderForms || this.appearance) {
      return super.getOperatorList(evaluator, task, renderForms);
    }

    const operatorList = new _operator_list.OperatorList();

    if (!this.data.defaultAppearance) {
      return Promise.resolve(operatorList);
    }

    const stream = new _stream.Stream((0, _util.stringToBytes)(this.data.defaultAppearance));
    return evaluator.getOperatorList({
      stream,
      task,
      resources: this.fieldResources,
      operatorList
    }).then(function () {
      return operatorList;
    });
  }

}

class ButtonWidgetAnnotation extends WidgetAnnotation {
  constructor(params) {
    super(params);
    this.data.checkBox = !this.hasFieldFlag(_util.AnnotationFieldFlag.RADIO) && !this.hasFieldFlag(_util.AnnotationFieldFlag.PUSHBUTTON);
    this.data.radioButton = this.hasFieldFlag(_util.AnnotationFieldFlag.RADIO) && !this.hasFieldFlag(_util.AnnotationFieldFlag.PUSHBUTTON);
    this.data.pushButton = this.hasFieldFlag(_util.AnnotationFieldFlag.PUSHBUTTON);

    if (this.data.checkBox) {
      this._processCheckBox(params);
    } else if (this.data.radioButton) {
      this._processRadioButton(params);
    } else if (this.data.pushButton) {
      this._processPushButton(params);
    } else {
      (0, _util.warn)("Invalid field flags for button widget annotation");
    }
  }

  _processCheckBox(params) {
    if ((0, _primitives.isName)(this.data.fieldValue)) {
      this.data.fieldValue = this.data.fieldValue.name;
    }

    const customAppearance = params.dict.get("AP");

    if (!(0, _primitives.isDict)(customAppearance)) {
      return;
    }

    const exportValueOptionsDict = customAppearance.get("D");

    if (!(0, _primitives.isDict)(exportValueOptionsDict)) {
      return;
    }

    const exportValues = exportValueOptionsDict.getKeys();
    const hasCorrectOptionCount = exportValues.length === 2;

    if (!hasCorrectOptionCount) {
      return;
    }

    this.data.exportValue = exportValues[0] === "Off" ? exportValues[1] : exportValues[0];
  }

  _processRadioButton(params) {
    this.data.fieldValue = this.data.buttonValue = null;
    const fieldParent = params.dict.get("Parent");

    if ((0, _primitives.isDict)(fieldParent) && fieldParent.has("V")) {
      const fieldParentValue = fieldParent.get("V");

      if ((0, _primitives.isName)(fieldParentValue)) {
        this.data.fieldValue = fieldParentValue.name;
      }
    }

    const appearanceStates = params.dict.get("AP");

    if (!(0, _primitives.isDict)(appearanceStates)) {
      return;
    }

    const normalAppearanceState = appearanceStates.get("N");

    if (!(0, _primitives.isDict)(normalAppearanceState)) {
      return;
    }

    for (const key of normalAppearanceState.getKeys()) {
      if (key !== "Off") {
        this.data.buttonValue = key;
        break;
      }
    }
  }

  _processPushButton(params) {
    if (!params.dict.has("A")) {
      (0, _util.warn)("Push buttons without action dictionaries are not supported");
      return;
    }

    _obj.Catalog.parseDestDictionary({
      destDict: params.dict,
      resultObj: this.data,
      docBaseUrl: params.pdfManager.docBaseUrl
    });
  }

}

class ChoiceWidgetAnnotation extends WidgetAnnotation {
  constructor(params) {
    super(params);
    this.data.options = [];
    const options = (0, _core_utils.getInheritableProperty)({
      dict: params.dict,
      key: "Opt"
    });

    if (Array.isArray(options)) {
      const xref = params.xref;

      for (let i = 0, ii = options.length; i < ii; i++) {
        const option = xref.fetchIfRef(options[i]);
        const isOptionArray = Array.isArray(option);
        this.data.options[i] = {
          exportValue: isOptionArray ? xref.fetchIfRef(option[0]) : option,
          displayValue: (0, _util.stringToPDFString)(isOptionArray ? xref.fetchIfRef(option[1]) : option)
        };
      }
    }

    if (!Array.isArray(this.data.fieldValue)) {
      this.data.fieldValue = [this.data.fieldValue];
    }

    this.data.combo = this.hasFieldFlag(_util.AnnotationFieldFlag.COMBO);
    this.data.multiSelect = this.hasFieldFlag(_util.AnnotationFieldFlag.MULTISELECT);
  }

}

class TextAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    const DEFAULT_ICON_SIZE = 22;
    super(parameters);
    const dict = parameters.dict;
    this.data.annotationType = _util.AnnotationType.TEXT;

    if (this.data.hasAppearance) {
      this.data.name = "NoIcon";
    } else {
      this.data.rect[1] = this.data.rect[3] - DEFAULT_ICON_SIZE;
      this.data.rect[2] = this.data.rect[0] + DEFAULT_ICON_SIZE;
      this.data.name = dict.has("Name") ? dict.get("Name").name : "Note";
    }

    if (dict.has("State")) {
      this.data.state = dict.get("State") || null;
      this.data.stateModel = dict.get("StateModel") || null;
    } else {
      this.data.state = null;
      this.data.stateModel = null;
    }
  }

}

class LinkAnnotation extends Annotation {
  constructor(params) {
    super(params);
    this.data.annotationType = _util.AnnotationType.LINK;
    const quadPoints = getQuadPoints(params.dict, this.rectangle);

    if (quadPoints) {
      this.data.quadPoints = quadPoints;
    }

    _obj.Catalog.parseDestDictionary({
      destDict: params.dict,
      resultObj: this.data,
      docBaseUrl: params.pdfManager.docBaseUrl
    });
  }

}

class PopupAnnotation extends Annotation {
  constructor(parameters) {
    super(parameters);
    this.data.annotationType = _util.AnnotationType.POPUP;
    let parentItem = parameters.dict.get("Parent");

    if (!parentItem) {
      (0, _util.warn)("Popup annotation has a missing or invalid parent annotation.");
      return;
    }

    const parentSubtype = parentItem.get("Subtype");
    this.data.parentType = (0, _primitives.isName)(parentSubtype) ? parentSubtype.name : null;
    const rawParent = parameters.dict.getRaw("Parent");
    this.data.parentId = (0, _primitives.isRef)(rawParent) ? rawParent.toString() : null;
    const rt = parentItem.get("RT");

    if ((0, _primitives.isName)(rt, _util.AnnotationReplyType.GROUP)) {
      parentItem = parentItem.get("IRT");
    }

    if (!parentItem.has("M")) {
      this.data.modificationDate = null;
    } else {
      this.setModificationDate(parentItem.get("M"));
      this.data.modificationDate = this.modificationDate;
    }

    if (!parentItem.has("C")) {
      this.data.color = null;
    } else {
      this.setColor(parentItem.getArray("C"));
      this.data.color = this.color;
    }

    if (!this.viewable) {
      const parentFlags = parentItem.get("F");

      if (this._isViewable(parentFlags)) {
        this.setFlags(parentFlags);
      }
    }

    this.data.title = (0, _util.stringToPDFString)(parentItem.get("T") || "");
    this.data.contents = (0, _util.stringToPDFString)(parentItem.get("Contents") || "");
  }

}

class FreeTextAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);
    this.data.annotationType = _util.AnnotationType.FREETEXT;
  }

}

class LineAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);
    this.data.annotationType = _util.AnnotationType.LINE;
    this.data.lineCoordinates = _util.Util.normalizeRect(parameters.dict.getArray("L"));
  }

}

class SquareAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);
    this.data.annotationType = _util.AnnotationType.SQUARE;
  }

}

class CircleAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);
    this.data.annotationType = _util.AnnotationType.CIRCLE;
  }

}

class PolylineAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);
    this.data.annotationType = _util.AnnotationType.POLYLINE;
    const rawVertices = parameters.dict.getArray("Vertices");
    this.data.vertices = [];

    for (let i = 0, ii = rawVertices.length; i < ii; i += 2) {
      this.data.vertices.push({
        x: rawVertices[i],
        y: rawVertices[i + 1]
      });
    }
  }

}

class PolygonAnnotation extends PolylineAnnotation {
  constructor(parameters) {
    super(parameters);
    this.data.annotationType = _util.AnnotationType.POLYGON;
  }

}

class CaretAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);
    this.data.annotationType = _util.AnnotationType.CARET;
  }

}

class InkAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);
    this.data.annotationType = _util.AnnotationType.INK;
    const xref = parameters.xref;
    const originalInkLists = parameters.dict.getArray("InkList");
    this.data.inkLists = [];

    for (let i = 0, ii = originalInkLists.length; i < ii; ++i) {
      this.data.inkLists.push([]);

      for (let j = 0, jj = originalInkLists[i].length; j < jj; j += 2) {
        this.data.inkLists[i].push({
          x: xref.fetchIfRef(originalInkLists[i][j]),
          y: xref.fetchIfRef(originalInkLists[i][j + 1])
        });
      }
    }
  }

}

class HighlightAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);
    this.data.annotationType = _util.AnnotationType.HIGHLIGHT;
    const quadPoints = getQuadPoints(parameters.dict, this.rectangle);

    if (quadPoints) {
      this.data.quadPoints = quadPoints;
    }
  }

}

class UnderlineAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);
    this.data.annotationType = _util.AnnotationType.UNDERLINE;
    const quadPoints = getQuadPoints(parameters.dict, this.rectangle);

    if (quadPoints) {
      this.data.quadPoints = quadPoints;
    }
  }

}

class SquigglyAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);
    this.data.annotationType = _util.AnnotationType.SQUIGGLY;
    const quadPoints = getQuadPoints(parameters.dict, this.rectangle);

    if (quadPoints) {
      this.data.quadPoints = quadPoints;
    }
  }

}

class StrikeOutAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);
    this.data.annotationType = _util.AnnotationType.STRIKEOUT;
    const quadPoints = getQuadPoints(parameters.dict, this.rectangle);

    if (quadPoints) {
      this.data.quadPoints = quadPoints;
    }
  }

}

class StampAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);
    this.data.annotationType = _util.AnnotationType.STAMP;
  }

}

class FileAttachmentAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);
    const file = new _obj.FileSpec(parameters.dict.get("FS"), parameters.xref);
    this.data.annotationType = _util.AnnotationType.FILEATTACHMENT;
    this.data.file = file.serializable;
  }

}