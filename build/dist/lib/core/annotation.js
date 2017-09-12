/* Copyright 2017 Mozilla Foundation
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
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AnnotationFactory = exports.AnnotationBorderStyle = exports.Annotation = undefined;

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _util = require('../shared/util');

var _obj = require('./obj');

var _primitives = require('./primitives');

var _colorspace = require('./colorspace');

var _evaluator = require('./evaluator');

var _stream = require('./stream');

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var AnnotationFactory = function () {
  function AnnotationFactory() {
    _classCallCheck(this, AnnotationFactory);
  }

  _createClass(AnnotationFactory, null, [{
    key: 'create',
    value: function create(xref, ref, pdfManager, idFactory) {
      var dict = xref.fetchIfRef(ref);
      if (!(0, _primitives.isDict)(dict)) {
        return;
      }
      var id = (0, _primitives.isRef)(ref) ? ref.toString() : 'annot_' + idFactory.createObjId();
      var subtype = dict.get('Subtype');
      subtype = (0, _primitives.isName)(subtype) ? subtype.name : null;
      var parameters = {
        xref: xref,
        dict: dict,
        ref: (0, _primitives.isRef)(ref) ? ref : null,
        subtype: subtype,
        id: id,
        pdfManager: pdfManager
      };
      switch (subtype) {
        case 'Link':
          return new LinkAnnotation(parameters);
        case 'Text':
          return new TextAnnotation(parameters);
        case 'Widget':
          var fieldType = _util.Util.getInheritableProperty(dict, 'FT');
          fieldType = (0, _primitives.isName)(fieldType) ? fieldType.name : null;
          switch (fieldType) {
            case 'Tx':
              return new TextWidgetAnnotation(parameters);
            case 'Btn':
              return new ButtonWidgetAnnotation(parameters);
            case 'Ch':
              return new ChoiceWidgetAnnotation(parameters);
          }
          (0, _util.warn)('Unimplemented widget field type "' + fieldType + '", ' + 'falling back to base field type.');
          return new WidgetAnnotation(parameters);
        case 'Popup':
          return new PopupAnnotation(parameters);
        case 'Line':
          return new LineAnnotation(parameters);
        case 'Square':
          return new SquareAnnotation(parameters);
        case 'Circle':
          return new CircleAnnotation(parameters);
        case 'Highlight':
          return new HighlightAnnotation(parameters);
        case 'Underline':
          return new UnderlineAnnotation(parameters);
        case 'Squiggly':
          return new SquigglyAnnotation(parameters);
        case 'StrikeOut':
          return new StrikeOutAnnotation(parameters);
        case 'FileAttachment':
          return new FileAttachmentAnnotation(parameters);
        default:
          if (!subtype) {
            (0, _util.warn)('Annotation is missing the required /Subtype.');
          } else {
            (0, _util.warn)('Unimplemented annotation type "' + subtype + '", ' + 'falling back to base annotation.');
          }
          return new Annotation(parameters);
      }
    }
  }]);

  return AnnotationFactory;
}();

function getTransformMatrix(rect, bbox, matrix) {
  var bounds = _util.Util.getAxialAlignedBoundingBox(bbox, matrix);
  var minX = bounds[0];
  var minY = bounds[1];
  var maxX = bounds[2];
  var maxY = bounds[3];
  if (minX === maxX || minY === maxY) {
    return [1, 0, 0, 1, rect[0], rect[1]];
  }
  var xRatio = (rect[2] - rect[0]) / (maxX - minX);
  var yRatio = (rect[3] - rect[1]) / (maxY - minY);
  return [xRatio, 0, 0, yRatio, rect[0] - minX * xRatio, rect[1] - minY * yRatio];
}

var Annotation = function () {
  function Annotation(params) {
    _classCallCheck(this, Annotation);

    var dict = params.dict;
    this.setFlags(dict.get('F'));
    this.setRectangle(dict.getArray('Rect'));
    this.setColor(dict.getArray('C'));
    this.setBorderStyle(dict);
    this.setAppearance(dict);
    this.data = {
      annotationFlags: this.flags,
      borderStyle: this.borderStyle,
      color: this.color,
      hasAppearance: !!this.appearance,
      id: params.id,
      rect: this.rectangle,
      subtype: params.subtype
    };
  }

  _createClass(Annotation, [{
    key: '_hasFlag',
    value: function _hasFlag(flags, flag) {
      return !!(flags & flag);
    }
  }, {
    key: '_isViewable',
    value: function _isViewable(flags) {
      return !this._hasFlag(flags, _util.AnnotationFlag.INVISIBLE) && !this._hasFlag(flags, _util.AnnotationFlag.HIDDEN) && !this._hasFlag(flags, _util.AnnotationFlag.NOVIEW);
    }
  }, {
    key: '_isPrintable',
    value: function _isPrintable(flags) {
      return this._hasFlag(flags, _util.AnnotationFlag.PRINT) && !this._hasFlag(flags, _util.AnnotationFlag.INVISIBLE) && !this._hasFlag(flags, _util.AnnotationFlag.HIDDEN);
    }
  }, {
    key: 'setFlags',
    value: function setFlags(flags) {
      this.flags = Number.isInteger(flags) && flags > 0 ? flags : 0;
    }
  }, {
    key: 'hasFlag',
    value: function hasFlag(flag) {
      return this._hasFlag(this.flags, flag);
    }
  }, {
    key: 'setRectangle',
    value: function setRectangle(rectangle) {
      if (Array.isArray(rectangle) && rectangle.length === 4) {
        this.rectangle = _util.Util.normalizeRect(rectangle);
      } else {
        this.rectangle = [0, 0, 0, 0];
      }
    }
  }, {
    key: 'setColor',
    value: function setColor(color) {
      var rgbColor = new Uint8Array(3);
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
  }, {
    key: 'setBorderStyle',
    value: function setBorderStyle(borderStyle) {
      this.borderStyle = new AnnotationBorderStyle();
      if (!(0, _primitives.isDict)(borderStyle)) {
        return;
      }
      if (borderStyle.has('BS')) {
        var dict = borderStyle.get('BS');
        var dictType = dict.get('Type');
        if (!dictType || (0, _primitives.isName)(dictType, 'Border')) {
          this.borderStyle.setWidth(dict.get('W'));
          this.borderStyle.setStyle(dict.get('S'));
          this.borderStyle.setDashArray(dict.getArray('D'));
        }
      } else if (borderStyle.has('Border')) {
        var array = borderStyle.getArray('Border');
        if (Array.isArray(array) && array.length >= 3) {
          this.borderStyle.setHorizontalCornerRadius(array[0]);
          this.borderStyle.setVerticalCornerRadius(array[1]);
          this.borderStyle.setWidth(array[2]);
          if (array.length === 4) {
            this.borderStyle.setDashArray(array[3]);
          }
        }
      } else {
        this.borderStyle.setWidth(0);
      }
    }
  }, {
    key: 'setAppearance',
    value: function setAppearance(dict) {
      this.appearance = null;
      var appearanceStates = dict.get('AP');
      if (!(0, _primitives.isDict)(appearanceStates)) {
        return;
      }
      var normalAppearanceState = appearanceStates.get('N');
      if ((0, _primitives.isStream)(normalAppearanceState)) {
        this.appearance = normalAppearanceState;
        return;
      }
      if (!(0, _primitives.isDict)(normalAppearanceState)) {
        return;
      }
      var as = dict.get('AS');
      if (!(0, _primitives.isName)(as) || !normalAppearanceState.has(as.name)) {
        return;
      }
      this.appearance = normalAppearanceState.get(as.name);
    }
  }, {
    key: '_preparePopup',
    value: function _preparePopup(dict) {
      if (!dict.has('C')) {
        this.data.color = null;
      }
      this.data.hasPopup = dict.has('Popup');
      this.data.title = (0, _util.stringToPDFString)(dict.get('T') || '');
      this.data.contents = (0, _util.stringToPDFString)(dict.get('Contents') || '');
    }
  }, {
    key: 'loadResources',
    value: function loadResources(keys) {
      return this.appearance.dict.getAsync('Resources').then(function (resources) {
        if (!resources) {
          return;
        }
        var objectLoader = new _obj.ObjectLoader(resources, keys, resources.xref);
        return objectLoader.load().then(function () {
          return resources;
        });
      });
    }
  }, {
    key: 'getOperatorList',
    value: function getOperatorList(evaluator, task, renderForms) {
      var _this = this;

      if (!this.appearance) {
        return Promise.resolve(new _evaluator.OperatorList());
      }
      var data = this.data;
      var appearanceDict = this.appearance.dict;
      var resourcesPromise = this.loadResources(['ExtGState', 'ColorSpace', 'Pattern', 'Shading', 'XObject', 'Font']);
      var bbox = appearanceDict.getArray('BBox') || [0, 0, 1, 1];
      var matrix = appearanceDict.getArray('Matrix') || [1, 0, 0, 1, 0, 0];
      var transform = getTransformMatrix(data.rect, bbox, matrix);
      return resourcesPromise.then(function (resources) {
        var opList = new _evaluator.OperatorList();
        opList.addOp(_util.OPS.beginAnnotation, [data.rect, transform, matrix]);
        return evaluator.getOperatorList({
          stream: _this.appearance,
          task: task,
          resources: resources,
          operatorList: opList
        }).then(function () {
          opList.addOp(_util.OPS.endAnnotation, []);
          _this.appearance.reset();
          return opList;
        });
      });
    }
  }, {
    key: 'viewable',
    get: function get() {
      if (this.flags === 0) {
        return true;
      }
      return this._isViewable(this.flags);
    }
  }, {
    key: 'printable',
    get: function get() {
      if (this.flags === 0) {
        return false;
      }
      return this._isPrintable(this.flags);
    }
  }]);

  return Annotation;
}();

var AnnotationBorderStyle = function () {
  function AnnotationBorderStyle() {
    _classCallCheck(this, AnnotationBorderStyle);

    this.width = 1;
    this.style = _util.AnnotationBorderStyleType.SOLID;
    this.dashArray = [3];
    this.horizontalCornerRadius = 0;
    this.verticalCornerRadius = 0;
  }

  _createClass(AnnotationBorderStyle, [{
    key: 'setWidth',
    value: function setWidth(width) {
      if (Number.isInteger(width)) {
        this.width = width;
      }
    }
  }, {
    key: 'setStyle',
    value: function setStyle(style) {
      if (!style) {
        return;
      }
      switch (style.name) {
        case 'S':
          this.style = _util.AnnotationBorderStyleType.SOLID;
          break;
        case 'D':
          this.style = _util.AnnotationBorderStyleType.DASHED;
          break;
        case 'B':
          this.style = _util.AnnotationBorderStyleType.BEVELED;
          break;
        case 'I':
          this.style = _util.AnnotationBorderStyleType.INSET;
          break;
        case 'U':
          this.style = _util.AnnotationBorderStyleType.UNDERLINE;
          break;
        default:
          break;
      }
    }
  }, {
    key: 'setDashArray',
    value: function setDashArray(dashArray) {
      if (Array.isArray(dashArray) && dashArray.length > 0) {
        var isValid = true;
        var allZeros = true;
        for (var i = 0, len = dashArray.length; i < len; i++) {
          var element = dashArray[i];
          var validNumber = +element >= 0;
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
  }, {
    key: 'setHorizontalCornerRadius',
    value: function setHorizontalCornerRadius(radius) {
      if (Number.isInteger(radius)) {
        this.horizontalCornerRadius = radius;
      }
    }
  }, {
    key: 'setVerticalCornerRadius',
    value: function setVerticalCornerRadius(radius) {
      if (Number.isInteger(radius)) {
        this.verticalCornerRadius = radius;
      }
    }
  }]);

  return AnnotationBorderStyle;
}();

var WidgetAnnotation = function (_Annotation) {
  _inherits(WidgetAnnotation, _Annotation);

  function WidgetAnnotation(params) {
    _classCallCheck(this, WidgetAnnotation);

    var _this2 = _possibleConstructorReturn(this, (WidgetAnnotation.__proto__ || Object.getPrototypeOf(WidgetAnnotation)).call(this, params));

    var dict = params.dict;
    var data = _this2.data;
    data.annotationType = _util.AnnotationType.WIDGET;
    data.fieldName = _this2._constructFieldName(dict);
    data.fieldValue = _util.Util.getInheritableProperty(dict, 'V', true);
    data.alternativeText = (0, _util.stringToPDFString)(dict.get('TU') || '');
    data.defaultAppearance = _util.Util.getInheritableProperty(dict, 'DA') || '';
    var fieldType = _util.Util.getInheritableProperty(dict, 'FT');
    data.fieldType = (0, _primitives.isName)(fieldType) ? fieldType.name : null;
    _this2.fieldResources = _util.Util.getInheritableProperty(dict, 'DR') || _primitives.Dict.empty;
    data.fieldFlags = _util.Util.getInheritableProperty(dict, 'Ff');
    if (!Number.isInteger(data.fieldFlags) || data.fieldFlags < 0) {
      data.fieldFlags = 0;
    }
    data.readOnly = _this2.hasFieldFlag(_util.AnnotationFieldFlag.READONLY);
    if (data.fieldType === 'Sig') {
      _this2.setFlags(_util.AnnotationFlag.HIDDEN);
    }
    return _this2;
  }

  _createClass(WidgetAnnotation, [{
    key: '_constructFieldName',
    value: function _constructFieldName(dict) {
      if (!dict.has('T') && !dict.has('Parent')) {
        (0, _util.warn)('Unknown field name, falling back to empty field name.');
        return '';
      }
      if (!dict.has('Parent')) {
        return (0, _util.stringToPDFString)(dict.get('T'));
      }
      var fieldName = [];
      if (dict.has('T')) {
        fieldName.unshift((0, _util.stringToPDFString)(dict.get('T')));
      }
      var loopDict = dict;
      while (loopDict.has('Parent')) {
        loopDict = loopDict.get('Parent');
        if (!(0, _primitives.isDict)(loopDict)) {
          break;
        }
        if (loopDict.has('T')) {
          fieldName.unshift((0, _util.stringToPDFString)(loopDict.get('T')));
        }
      }
      return fieldName.join('.');
    }
  }, {
    key: 'hasFieldFlag',
    value: function hasFieldFlag(flag) {
      return !!(this.data.fieldFlags & flag);
    }
  }, {
    key: 'getOperatorList',
    value: function getOperatorList(evaluator, task, renderForms) {
      if (renderForms) {
        return Promise.resolve(new _evaluator.OperatorList());
      }
      return _get(WidgetAnnotation.prototype.__proto__ || Object.getPrototypeOf(WidgetAnnotation.prototype), 'getOperatorList', this).call(this, evaluator, task, renderForms);
    }
  }]);

  return WidgetAnnotation;
}(Annotation);

var TextWidgetAnnotation = function (_WidgetAnnotation) {
  _inherits(TextWidgetAnnotation, _WidgetAnnotation);

  function TextWidgetAnnotation(params) {
    _classCallCheck(this, TextWidgetAnnotation);

    var _this3 = _possibleConstructorReturn(this, (TextWidgetAnnotation.__proto__ || Object.getPrototypeOf(TextWidgetAnnotation)).call(this, params));

    _this3.data.fieldValue = (0, _util.stringToPDFString)(_this3.data.fieldValue || '');
    var alignment = _util.Util.getInheritableProperty(params.dict, 'Q');
    if (!Number.isInteger(alignment) || alignment < 0 || alignment > 2) {
      alignment = null;
    }
    _this3.data.textAlignment = alignment;
    var maximumLength = _util.Util.getInheritableProperty(params.dict, 'MaxLen');
    if (!Number.isInteger(maximumLength) || maximumLength < 0) {
      maximumLength = null;
    }
    _this3.data.maxLen = maximumLength;
    _this3.data.multiLine = _this3.hasFieldFlag(_util.AnnotationFieldFlag.MULTILINE);
    _this3.data.comb = _this3.hasFieldFlag(_util.AnnotationFieldFlag.COMB) && !_this3.hasFieldFlag(_util.AnnotationFieldFlag.MULTILINE) && !_this3.hasFieldFlag(_util.AnnotationFieldFlag.PASSWORD) && !_this3.hasFieldFlag(_util.AnnotationFieldFlag.FILESELECT) && _this3.data.maxLen !== null;
    return _this3;
  }

  _createClass(TextWidgetAnnotation, [{
    key: 'getOperatorList',
    value: function getOperatorList(evaluator, task, renderForms) {
      if (renderForms || this.appearance) {
        return _get(TextWidgetAnnotation.prototype.__proto__ || Object.getPrototypeOf(TextWidgetAnnotation.prototype), 'getOperatorList', this).call(this, evaluator, task, renderForms);
      }
      var operatorList = new _evaluator.OperatorList();
      if (!this.data.defaultAppearance) {
        return Promise.resolve(operatorList);
      }
      var stream = new _stream.Stream((0, _util.stringToBytes)(this.data.defaultAppearance));
      return evaluator.getOperatorList({
        stream: stream,
        task: task,
        resources: this.fieldResources,
        operatorList: operatorList
      }).then(function () {
        return operatorList;
      });
    }
  }]);

  return TextWidgetAnnotation;
}(WidgetAnnotation);

var ButtonWidgetAnnotation = function (_WidgetAnnotation2) {
  _inherits(ButtonWidgetAnnotation, _WidgetAnnotation2);

  function ButtonWidgetAnnotation(params) {
    _classCallCheck(this, ButtonWidgetAnnotation);

    var _this4 = _possibleConstructorReturn(this, (ButtonWidgetAnnotation.__proto__ || Object.getPrototypeOf(ButtonWidgetAnnotation)).call(this, params));

    _this4.data.checkBox = !_this4.hasFieldFlag(_util.AnnotationFieldFlag.RADIO) && !_this4.hasFieldFlag(_util.AnnotationFieldFlag.PUSHBUTTON);
    if (_this4.data.checkBox) {
      if (!(0, _primitives.isName)(_this4.data.fieldValue)) {
        return _possibleConstructorReturn(_this4);
      }
      _this4.data.fieldValue = _this4.data.fieldValue.name;
    }
    _this4.data.radioButton = _this4.hasFieldFlag(_util.AnnotationFieldFlag.RADIO) && !_this4.hasFieldFlag(_util.AnnotationFieldFlag.PUSHBUTTON);
    if (_this4.data.radioButton) {
      _this4.data.fieldValue = _this4.data.buttonValue = null;
      var fieldParent = params.dict.get('Parent');
      if ((0, _primitives.isDict)(fieldParent) && fieldParent.has('V')) {
        var fieldParentValue = fieldParent.get('V');
        if ((0, _primitives.isName)(fieldParentValue)) {
          _this4.data.fieldValue = fieldParentValue.name;
        }
      }
      var appearanceStates = params.dict.get('AP');
      if (!(0, _primitives.isDict)(appearanceStates)) {
        return _possibleConstructorReturn(_this4);
      }
      var normalAppearanceState = appearanceStates.get('N');
      if (!(0, _primitives.isDict)(normalAppearanceState)) {
        return _possibleConstructorReturn(_this4);
      }
      var keys = normalAppearanceState.getKeys();
      for (var i = 0, ii = keys.length; i < ii; i++) {
        if (keys[i] !== 'Off') {
          _this4.data.buttonValue = keys[i];
          break;
        }
      }
    }
    return _this4;
  }

  return ButtonWidgetAnnotation;
}(WidgetAnnotation);

var ChoiceWidgetAnnotation = function (_WidgetAnnotation3) {
  _inherits(ChoiceWidgetAnnotation, _WidgetAnnotation3);

  function ChoiceWidgetAnnotation(params) {
    _classCallCheck(this, ChoiceWidgetAnnotation);

    var _this5 = _possibleConstructorReturn(this, (ChoiceWidgetAnnotation.__proto__ || Object.getPrototypeOf(ChoiceWidgetAnnotation)).call(this, params));

    _this5.data.options = [];
    var options = _util.Util.getInheritableProperty(params.dict, 'Opt');
    if (Array.isArray(options)) {
      var xref = params.xref;
      for (var i = 0, ii = options.length; i < ii; i++) {
        var option = xref.fetchIfRef(options[i]);
        var isOptionArray = Array.isArray(option);
        _this5.data.options[i] = {
          exportValue: isOptionArray ? xref.fetchIfRef(option[0]) : option,
          displayValue: isOptionArray ? xref.fetchIfRef(option[1]) : option
        };
      }
    }
    if (!Array.isArray(_this5.data.fieldValue)) {
      _this5.data.fieldValue = [_this5.data.fieldValue];
    }
    _this5.data.combo = _this5.hasFieldFlag(_util.AnnotationFieldFlag.COMBO);
    _this5.data.multiSelect = _this5.hasFieldFlag(_util.AnnotationFieldFlag.MULTISELECT);
    return _this5;
  }

  return ChoiceWidgetAnnotation;
}(WidgetAnnotation);

var TextAnnotation = function (_Annotation2) {
  _inherits(TextAnnotation, _Annotation2);

  function TextAnnotation(parameters) {
    _classCallCheck(this, TextAnnotation);

    var DEFAULT_ICON_SIZE = 22;

    var _this6 = _possibleConstructorReturn(this, (TextAnnotation.__proto__ || Object.getPrototypeOf(TextAnnotation)).call(this, parameters));

    _this6.data.annotationType = _util.AnnotationType.TEXT;
    if (_this6.data.hasAppearance) {
      _this6.data.name = 'NoIcon';
    } else {
      _this6.data.rect[1] = _this6.data.rect[3] - DEFAULT_ICON_SIZE;
      _this6.data.rect[2] = _this6.data.rect[0] + DEFAULT_ICON_SIZE;
      _this6.data.name = parameters.dict.has('Name') ? parameters.dict.get('Name').name : 'Note';
    }
    _this6._preparePopup(parameters.dict);
    return _this6;
  }

  return TextAnnotation;
}(Annotation);

var LinkAnnotation = function (_Annotation3) {
  _inherits(LinkAnnotation, _Annotation3);

  function LinkAnnotation(params) {
    _classCallCheck(this, LinkAnnotation);

    var _this7 = _possibleConstructorReturn(this, (LinkAnnotation.__proto__ || Object.getPrototypeOf(LinkAnnotation)).call(this, params));

    _this7.data.annotationType = _util.AnnotationType.LINK;
    _obj.Catalog.parseDestDictionary({
      destDict: params.dict,
      resultObj: _this7.data,
      docBaseUrl: params.pdfManager.docBaseUrl
    });
    return _this7;
  }

  return LinkAnnotation;
}(Annotation);

var PopupAnnotation = function (_Annotation4) {
  _inherits(PopupAnnotation, _Annotation4);

  function PopupAnnotation(parameters) {
    _classCallCheck(this, PopupAnnotation);

    var _this8 = _possibleConstructorReturn(this, (PopupAnnotation.__proto__ || Object.getPrototypeOf(PopupAnnotation)).call(this, parameters));

    _this8.data.annotationType = _util.AnnotationType.POPUP;
    var dict = parameters.dict;
    var parentItem = dict.get('Parent');
    if (!parentItem) {
      (0, _util.warn)('Popup annotation has a missing or invalid parent annotation.');
      return _possibleConstructorReturn(_this8);
    }
    var parentSubtype = parentItem.get('Subtype');
    _this8.data.parentType = (0, _primitives.isName)(parentSubtype) ? parentSubtype.name : null;
    _this8.data.parentId = dict.getRaw('Parent').toString();
    _this8.data.title = (0, _util.stringToPDFString)(parentItem.get('T') || '');
    _this8.data.contents = (0, _util.stringToPDFString)(parentItem.get('Contents') || '');
    if (!parentItem.has('C')) {
      _this8.data.color = null;
    } else {
      _this8.setColor(parentItem.getArray('C'));
      _this8.data.color = _this8.color;
    }
    if (!_this8.viewable) {
      var parentFlags = parentItem.get('F');
      if (_this8._isViewable(parentFlags)) {
        _this8.setFlags(parentFlags);
      }
    }
    return _this8;
  }

  return PopupAnnotation;
}(Annotation);

var LineAnnotation = function (_Annotation5) {
  _inherits(LineAnnotation, _Annotation5);

  function LineAnnotation(parameters) {
    _classCallCheck(this, LineAnnotation);

    var _this9 = _possibleConstructorReturn(this, (LineAnnotation.__proto__ || Object.getPrototypeOf(LineAnnotation)).call(this, parameters));

    _this9.data.annotationType = _util.AnnotationType.LINE;
    var dict = parameters.dict;
    _this9.data.lineCoordinates = _util.Util.normalizeRect(dict.getArray('L'));
    _this9._preparePopup(dict);
    return _this9;
  }

  return LineAnnotation;
}(Annotation);

var SquareAnnotation = function (_Annotation6) {
  _inherits(SquareAnnotation, _Annotation6);

  function SquareAnnotation(parameters) {
    _classCallCheck(this, SquareAnnotation);

    var _this10 = _possibleConstructorReturn(this, (SquareAnnotation.__proto__ || Object.getPrototypeOf(SquareAnnotation)).call(this, parameters));

    _this10.data.annotationType = _util.AnnotationType.SQUARE;
    _this10._preparePopup(parameters.dict);
    return _this10;
  }

  return SquareAnnotation;
}(Annotation);

var CircleAnnotation = function (_Annotation7) {
  _inherits(CircleAnnotation, _Annotation7);

  function CircleAnnotation(parameters) {
    _classCallCheck(this, CircleAnnotation);

    var _this11 = _possibleConstructorReturn(this, (CircleAnnotation.__proto__ || Object.getPrototypeOf(CircleAnnotation)).call(this, parameters));

    _this11.data.annotationType = _util.AnnotationType.CIRCLE;
    _this11._preparePopup(parameters.dict);
    return _this11;
  }

  return CircleAnnotation;
}(Annotation);

var HighlightAnnotation = function (_Annotation8) {
  _inherits(HighlightAnnotation, _Annotation8);

  function HighlightAnnotation(parameters) {
    _classCallCheck(this, HighlightAnnotation);

    var _this12 = _possibleConstructorReturn(this, (HighlightAnnotation.__proto__ || Object.getPrototypeOf(HighlightAnnotation)).call(this, parameters));

    _this12.data.annotationType = _util.AnnotationType.HIGHLIGHT;
    _this12._preparePopup(parameters.dict);
    return _this12;
  }

  return HighlightAnnotation;
}(Annotation);

var UnderlineAnnotation = function (_Annotation9) {
  _inherits(UnderlineAnnotation, _Annotation9);

  function UnderlineAnnotation(parameters) {
    _classCallCheck(this, UnderlineAnnotation);

    var _this13 = _possibleConstructorReturn(this, (UnderlineAnnotation.__proto__ || Object.getPrototypeOf(UnderlineAnnotation)).call(this, parameters));

    _this13.data.annotationType = _util.AnnotationType.UNDERLINE;
    _this13._preparePopup(parameters.dict);
    return _this13;
  }

  return UnderlineAnnotation;
}(Annotation);

var SquigglyAnnotation = function (_Annotation10) {
  _inherits(SquigglyAnnotation, _Annotation10);

  function SquigglyAnnotation(parameters) {
    _classCallCheck(this, SquigglyAnnotation);

    var _this14 = _possibleConstructorReturn(this, (SquigglyAnnotation.__proto__ || Object.getPrototypeOf(SquigglyAnnotation)).call(this, parameters));

    _this14.data.annotationType = _util.AnnotationType.SQUIGGLY;
    _this14._preparePopup(parameters.dict);
    return _this14;
  }

  return SquigglyAnnotation;
}(Annotation);

var StrikeOutAnnotation = function (_Annotation11) {
  _inherits(StrikeOutAnnotation, _Annotation11);

  function StrikeOutAnnotation(parameters) {
    _classCallCheck(this, StrikeOutAnnotation);

    var _this15 = _possibleConstructorReturn(this, (StrikeOutAnnotation.__proto__ || Object.getPrototypeOf(StrikeOutAnnotation)).call(this, parameters));

    _this15.data.annotationType = _util.AnnotationType.STRIKEOUT;
    _this15._preparePopup(parameters.dict);
    return _this15;
  }

  return StrikeOutAnnotation;
}(Annotation);

var FileAttachmentAnnotation = function (_Annotation12) {
  _inherits(FileAttachmentAnnotation, _Annotation12);

  function FileAttachmentAnnotation(parameters) {
    _classCallCheck(this, FileAttachmentAnnotation);

    var _this16 = _possibleConstructorReturn(this, (FileAttachmentAnnotation.__proto__ || Object.getPrototypeOf(FileAttachmentAnnotation)).call(this, parameters));

    var file = new _obj.FileSpec(parameters.dict.get('FS'), parameters.xref);
    _this16.data.annotationType = _util.AnnotationType.FILEATTACHMENT;
    _this16.data.file = file.serializable;
    _this16._preparePopup(parameters.dict);
    return _this16;
  }

  return FileAttachmentAnnotation;
}(Annotation);

exports.Annotation = Annotation;
exports.AnnotationBorderStyle = AnnotationBorderStyle;
exports.AnnotationFactory = AnnotationFactory;