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
exports.AnnotationLayer = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _dom_utils = require('./dom_utils');

var _util = require('../shared/util');

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var AnnotationElementFactory = function () {
  function AnnotationElementFactory() {
    _classCallCheck(this, AnnotationElementFactory);
  }

  _createClass(AnnotationElementFactory, null, [{
    key: 'create',
    value: function create(parameters) {
      var subtype = parameters.data.annotationType;
      switch (subtype) {
        case _util.AnnotationType.LINK:
          return new LinkAnnotationElement(parameters);
        case _util.AnnotationType.TEXT:
          return new TextAnnotationElement(parameters);
        case _util.AnnotationType.WIDGET:
          var fieldType = parameters.data.fieldType;
          switch (fieldType) {
            case 'Tx':
              return new TextWidgetAnnotationElement(parameters);
            case 'Btn':
              if (parameters.data.radioButton) {
                return new RadioButtonWidgetAnnotationElement(parameters);
              } else if (parameters.data.checkBox) {
                return new CheckboxWidgetAnnotationElement(parameters);
              }
              (0, _util.warn)('Unimplemented button widget annotation: pushbutton');
              break;
            case 'Ch':
              return new ChoiceWidgetAnnotationElement(parameters);
          }
          return new WidgetAnnotationElement(parameters);
        case _util.AnnotationType.POPUP:
          return new PopupAnnotationElement(parameters);
        case _util.AnnotationType.LINE:
          return new LineAnnotationElement(parameters);
        case _util.AnnotationType.SQUARE:
          return new SquareAnnotationElement(parameters);
        case _util.AnnotationType.CIRCLE:
          return new CircleAnnotationElement(parameters);
        case _util.AnnotationType.HIGHLIGHT:
          return new HighlightAnnotationElement(parameters);
        case _util.AnnotationType.UNDERLINE:
          return new UnderlineAnnotationElement(parameters);
        case _util.AnnotationType.SQUIGGLY:
          return new SquigglyAnnotationElement(parameters);
        case _util.AnnotationType.STRIKEOUT:
          return new StrikeOutAnnotationElement(parameters);
        case _util.AnnotationType.FILEATTACHMENT:
          return new FileAttachmentAnnotationElement(parameters);
        default:
          return new AnnotationElement(parameters);
      }
    }
  }]);

  return AnnotationElementFactory;
}();

var AnnotationElement = function () {
  function AnnotationElement(parameters) {
    var isRenderable = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
    var ignoreBorder = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

    _classCallCheck(this, AnnotationElement);

    this.isRenderable = isRenderable;
    this.data = parameters.data;
    this.layer = parameters.layer;
    this.page = parameters.page;
    this.viewport = parameters.viewport;
    this.linkService = parameters.linkService;
    this.downloadManager = parameters.downloadManager;
    this.imageResourcesPath = parameters.imageResourcesPath;
    this.renderInteractiveForms = parameters.renderInteractiveForms;
    this.svgFactory = parameters.svgFactory;
    if (isRenderable) {
      this.container = this._createContainer(ignoreBorder);
    }
  }

  _createClass(AnnotationElement, [{
    key: '_createContainer',
    value: function _createContainer() {
      var ignoreBorder = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

      var data = this.data,
          page = this.page,
          viewport = this.viewport;
      var container = document.createElement('section');
      var width = data.rect[2] - data.rect[0];
      var height = data.rect[3] - data.rect[1];
      container.setAttribute('data-annotation-id', data.id);
      var rect = _util.Util.normalizeRect([data.rect[0], page.view[3] - data.rect[1] + page.view[1], data.rect[2], page.view[3] - data.rect[3] + page.view[1]]);
      _dom_utils.CustomStyle.setProp('transform', container, 'matrix(' + viewport.transform.join(',') + ')');
      _dom_utils.CustomStyle.setProp('transformOrigin', container, -rect[0] + 'px ' + -rect[1] + 'px');
      if (!ignoreBorder && data.borderStyle.width > 0) {
        container.style.borderWidth = data.borderStyle.width + 'px';
        if (data.borderStyle.style !== _util.AnnotationBorderStyleType.UNDERLINE) {
          width = width - 2 * data.borderStyle.width;
          height = height - 2 * data.borderStyle.width;
        }
        var horizontalRadius = data.borderStyle.horizontalCornerRadius;
        var verticalRadius = data.borderStyle.verticalCornerRadius;
        if (horizontalRadius > 0 || verticalRadius > 0) {
          var radius = horizontalRadius + 'px / ' + verticalRadius + 'px';
          _dom_utils.CustomStyle.setProp('borderRadius', container, radius);
        }
        switch (data.borderStyle.style) {
          case _util.AnnotationBorderStyleType.SOLID:
            container.style.borderStyle = 'solid';
            break;
          case _util.AnnotationBorderStyleType.DASHED:
            container.style.borderStyle = 'dashed';
            break;
          case _util.AnnotationBorderStyleType.BEVELED:
            (0, _util.warn)('Unimplemented border style: beveled');
            break;
          case _util.AnnotationBorderStyleType.INSET:
            (0, _util.warn)('Unimplemented border style: inset');
            break;
          case _util.AnnotationBorderStyleType.UNDERLINE:
            container.style.borderBottomStyle = 'solid';
            break;
          default:
            break;
        }
        if (data.color) {
          container.style.borderColor = _util.Util.makeCssRgb(data.color[0] | 0, data.color[1] | 0, data.color[2] | 0);
        } else {
          container.style.borderWidth = 0;
        }
      }
      container.style.left = rect[0] + 'px';
      container.style.top = rect[1] + 'px';
      container.style.width = width + 'px';
      container.style.height = height + 'px';
      return container;
    }
  }, {
    key: '_createPopup',
    value: function _createPopup(container, trigger, data) {
      if (!trigger) {
        trigger = document.createElement('div');
        trigger.style.height = container.style.height;
        trigger.style.width = container.style.width;
        container.appendChild(trigger);
      }
      var popupElement = new PopupElement({
        container: container,
        trigger: trigger,
        color: data.color,
        title: data.title,
        contents: data.contents,
        hideWrapper: true
      });
      var popup = popupElement.render();
      popup.style.left = container.style.width;
      container.appendChild(popup);
    }
  }, {
    key: 'render',
    value: function render() {
      throw new Error('Abstract method `AnnotationElement.render` called');
    }
  }]);

  return AnnotationElement;
}();

var LinkAnnotationElement = function (_AnnotationElement) {
  _inherits(LinkAnnotationElement, _AnnotationElement);

  function LinkAnnotationElement(parameters) {
    _classCallCheck(this, LinkAnnotationElement);

    var isRenderable = !!(parameters.data.url || parameters.data.dest || parameters.data.action);
    return _possibleConstructorReturn(this, (LinkAnnotationElement.__proto__ || Object.getPrototypeOf(LinkAnnotationElement)).call(this, parameters, isRenderable));
  }

  _createClass(LinkAnnotationElement, [{
    key: 'render',
    value: function render() {
      this.container.className = 'linkAnnotation';
      var link = document.createElement('a');
      (0, _dom_utils.addLinkAttributes)(link, {
        url: this.data.url,
        target: this.data.newWindow ? _dom_utils.LinkTarget.BLANK : undefined
      });
      if (!this.data.url) {
        if (this.data.action) {
          this._bindNamedAction(link, this.data.action);
        } else {
          this._bindLink(link, this.data.dest);
        }
      }
      this.container.appendChild(link);
      return this.container;
    }
  }, {
    key: '_bindLink',
    value: function _bindLink(link, destination) {
      var _this2 = this;

      link.href = this.linkService.getDestinationHash(destination);
      link.onclick = function () {
        if (destination) {
          _this2.linkService.navigateTo(destination);
        }
        return false;
      };
      if (destination) {
        link.className = 'internalLink';
      }
    }
  }, {
    key: '_bindNamedAction',
    value: function _bindNamedAction(link, action) {
      var _this3 = this;

      link.href = this.linkService.getAnchorUrl('');
      link.onclick = function () {
        _this3.linkService.executeNamedAction(action);
        return false;
      };
      link.className = 'internalLink';
    }
  }]);

  return LinkAnnotationElement;
}(AnnotationElement);

var TextAnnotationElement = function (_AnnotationElement2) {
  _inherits(TextAnnotationElement, _AnnotationElement2);

  function TextAnnotationElement(parameters) {
    _classCallCheck(this, TextAnnotationElement);

    var isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    return _possibleConstructorReturn(this, (TextAnnotationElement.__proto__ || Object.getPrototypeOf(TextAnnotationElement)).call(this, parameters, isRenderable));
  }

  _createClass(TextAnnotationElement, [{
    key: 'render',
    value: function render() {
      this.container.className = 'textAnnotation';
      var image = document.createElement('img');
      image.style.height = this.container.style.height;
      image.style.width = this.container.style.width;
      image.src = this.imageResourcesPath + 'annotation-' + this.data.name.toLowerCase() + '.svg';
      image.alt = '[{{type}} Annotation]';
      image.dataset.l10nId = 'text_annotation_type';
      image.dataset.l10nArgs = JSON.stringify({ type: this.data.name });
      if (!this.data.hasPopup) {
        this._createPopup(this.container, image, this.data);
      }
      this.container.appendChild(image);
      return this.container;
    }
  }]);

  return TextAnnotationElement;
}(AnnotationElement);

var WidgetAnnotationElement = function (_AnnotationElement3) {
  _inherits(WidgetAnnotationElement, _AnnotationElement3);

  function WidgetAnnotationElement() {
    _classCallCheck(this, WidgetAnnotationElement);

    return _possibleConstructorReturn(this, (WidgetAnnotationElement.__proto__ || Object.getPrototypeOf(WidgetAnnotationElement)).apply(this, arguments));
  }

  _createClass(WidgetAnnotationElement, [{
    key: 'render',
    value: function render() {
      return this.container;
    }
  }]);

  return WidgetAnnotationElement;
}(AnnotationElement);

var TextWidgetAnnotationElement = function (_WidgetAnnotationElem) {
  _inherits(TextWidgetAnnotationElement, _WidgetAnnotationElem);

  function TextWidgetAnnotationElement(parameters) {
    _classCallCheck(this, TextWidgetAnnotationElement);

    var isRenderable = parameters.renderInteractiveForms || !parameters.data.hasAppearance && !!parameters.data.fieldValue;
    return _possibleConstructorReturn(this, (TextWidgetAnnotationElement.__proto__ || Object.getPrototypeOf(TextWidgetAnnotationElement)).call(this, parameters, isRenderable));
  }

  _createClass(TextWidgetAnnotationElement, [{
    key: 'render',
    value: function render() {
      var TEXT_ALIGNMENT = ['left', 'center', 'right'];
      this.container.className = 'textWidgetAnnotation';
      var element = null;
      if (this.renderInteractiveForms) {
        if (this.data.multiLine) {
          element = document.createElement('textarea');
          element.textContent = this.data.fieldValue;
        } else {
          element = document.createElement('input');
          element.type = 'text';
          element.setAttribute('value', this.data.fieldValue);
        }
        element.disabled = this.data.readOnly;
        if (this.data.maxLen !== null) {
          element.maxLength = this.data.maxLen;
        }
        if (this.data.comb) {
          var fieldWidth = this.data.rect[2] - this.data.rect[0];
          var combWidth = fieldWidth / this.data.maxLen;
          element.classList.add('comb');
          element.style.letterSpacing = 'calc(' + combWidth + 'px - 1ch)';
        }
      } else {
        element = document.createElement('div');
        element.textContent = this.data.fieldValue;
        element.style.verticalAlign = 'middle';
        element.style.display = 'table-cell';
        var font = null;
        if (this.data.fontRefName) {
          font = this.page.commonObjs.getData(this.data.fontRefName);
        }
        this._setTextStyle(element, font);
      }
      if (this.data.textAlignment !== null) {
        element.style.textAlign = TEXT_ALIGNMENT[this.data.textAlignment];
      }
      this.container.appendChild(element);
      return this.container;
    }
  }, {
    key: '_setTextStyle',
    value: function _setTextStyle(element, font) {
      var style = element.style;
      style.fontSize = this.data.fontSize + 'px';
      style.direction = this.data.fontDirection < 0 ? 'rtl' : 'ltr';
      if (!font) {
        return;
      }
      style.fontWeight = font.black ? font.bold ? '900' : 'bold' : font.bold ? 'bold' : 'normal';
      style.fontStyle = font.italic ? 'italic' : 'normal';
      var fontFamily = font.loadedName ? '"' + font.loadedName + '", ' : '';
      var fallbackName = font.fallbackName || 'Helvetica, sans-serif';
      style.fontFamily = fontFamily + fallbackName;
    }
  }]);

  return TextWidgetAnnotationElement;
}(WidgetAnnotationElement);

var CheckboxWidgetAnnotationElement = function (_WidgetAnnotationElem2) {
  _inherits(CheckboxWidgetAnnotationElement, _WidgetAnnotationElem2);

  function CheckboxWidgetAnnotationElement(parameters) {
    _classCallCheck(this, CheckboxWidgetAnnotationElement);

    return _possibleConstructorReturn(this, (CheckboxWidgetAnnotationElement.__proto__ || Object.getPrototypeOf(CheckboxWidgetAnnotationElement)).call(this, parameters, parameters.renderInteractiveForms));
  }

  _createClass(CheckboxWidgetAnnotationElement, [{
    key: 'render',
    value: function render() {
      this.container.className = 'buttonWidgetAnnotation checkBox';
      var element = document.createElement('input');
      element.disabled = this.data.readOnly;
      element.type = 'checkbox';
      if (this.data.fieldValue && this.data.fieldValue !== 'Off') {
        element.setAttribute('checked', true);
      }
      this.container.appendChild(element);
      return this.container;
    }
  }]);

  return CheckboxWidgetAnnotationElement;
}(WidgetAnnotationElement);

var RadioButtonWidgetAnnotationElement = function (_WidgetAnnotationElem3) {
  _inherits(RadioButtonWidgetAnnotationElement, _WidgetAnnotationElem3);

  function RadioButtonWidgetAnnotationElement(parameters) {
    _classCallCheck(this, RadioButtonWidgetAnnotationElement);

    return _possibleConstructorReturn(this, (RadioButtonWidgetAnnotationElement.__proto__ || Object.getPrototypeOf(RadioButtonWidgetAnnotationElement)).call(this, parameters, parameters.renderInteractiveForms));
  }

  _createClass(RadioButtonWidgetAnnotationElement, [{
    key: 'render',
    value: function render() {
      this.container.className = 'buttonWidgetAnnotation radioButton';
      var element = document.createElement('input');
      element.disabled = this.data.readOnly;
      element.type = 'radio';
      element.name = this.data.fieldName;
      if (this.data.fieldValue === this.data.buttonValue) {
        element.setAttribute('checked', true);
      }
      this.container.appendChild(element);
      return this.container;
    }
  }]);

  return RadioButtonWidgetAnnotationElement;
}(WidgetAnnotationElement);

var ChoiceWidgetAnnotationElement = function (_WidgetAnnotationElem4) {
  _inherits(ChoiceWidgetAnnotationElement, _WidgetAnnotationElem4);

  function ChoiceWidgetAnnotationElement(parameters) {
    _classCallCheck(this, ChoiceWidgetAnnotationElement);

    return _possibleConstructorReturn(this, (ChoiceWidgetAnnotationElement.__proto__ || Object.getPrototypeOf(ChoiceWidgetAnnotationElement)).call(this, parameters, parameters.renderInteractiveForms));
  }

  _createClass(ChoiceWidgetAnnotationElement, [{
    key: 'render',
    value: function render() {
      this.container.className = 'choiceWidgetAnnotation';
      var selectElement = document.createElement('select');
      selectElement.disabled = this.data.readOnly;
      if (!this.data.combo) {
        selectElement.size = this.data.options.length;
        if (this.data.multiSelect) {
          selectElement.multiple = true;
        }
      }
      for (var i = 0, ii = this.data.options.length; i < ii; i++) {
        var option = this.data.options[i];
        var optionElement = document.createElement('option');
        optionElement.textContent = option.displayValue;
        optionElement.value = option.exportValue;
        if (this.data.fieldValue.indexOf(option.displayValue) >= 0) {
          optionElement.setAttribute('selected', true);
        }
        selectElement.appendChild(optionElement);
      }
      this.container.appendChild(selectElement);
      return this.container;
    }
  }]);

  return ChoiceWidgetAnnotationElement;
}(WidgetAnnotationElement);

var PopupAnnotationElement = function (_AnnotationElement4) {
  _inherits(PopupAnnotationElement, _AnnotationElement4);

  function PopupAnnotationElement(parameters) {
    _classCallCheck(this, PopupAnnotationElement);

    var isRenderable = !!(parameters.data.title || parameters.data.contents);
    return _possibleConstructorReturn(this, (PopupAnnotationElement.__proto__ || Object.getPrototypeOf(PopupAnnotationElement)).call(this, parameters, isRenderable));
  }

  _createClass(PopupAnnotationElement, [{
    key: 'render',
    value: function render() {
      var IGNORE_TYPES = ['Line', 'Square', 'Circle'];
      this.container.className = 'popupAnnotation';
      if (IGNORE_TYPES.indexOf(this.data.parentType) >= 0) {
        return this.container;
      }
      var selector = '[data-annotation-id="' + this.data.parentId + '"]';
      var parentElement = this.layer.querySelector(selector);
      if (!parentElement) {
        return this.container;
      }
      var popup = new PopupElement({
        container: this.container,
        trigger: parentElement,
        color: this.data.color,
        title: this.data.title,
        contents: this.data.contents
      });
      var parentLeft = parseFloat(parentElement.style.left);
      var parentWidth = parseFloat(parentElement.style.width);
      _dom_utils.CustomStyle.setProp('transformOrigin', this.container, -(parentLeft + parentWidth) + 'px -' + parentElement.style.top);
      this.container.style.left = parentLeft + parentWidth + 'px';
      this.container.appendChild(popup.render());
      return this.container;
    }
  }]);

  return PopupAnnotationElement;
}(AnnotationElement);

var PopupElement = function () {
  function PopupElement(parameters) {
    _classCallCheck(this, PopupElement);

    this.container = parameters.container;
    this.trigger = parameters.trigger;
    this.color = parameters.color;
    this.title = parameters.title;
    this.contents = parameters.contents;
    this.hideWrapper = parameters.hideWrapper || false;
    this.pinned = false;
  }

  _createClass(PopupElement, [{
    key: 'render',
    value: function render() {
      var BACKGROUND_ENLIGHT = 0.7;
      var wrapper = document.createElement('div');
      wrapper.className = 'popupWrapper';
      this.hideElement = this.hideWrapper ? wrapper : this.container;
      this.hideElement.setAttribute('hidden', true);
      var popup = document.createElement('div');
      popup.className = 'popup';
      var color = this.color;
      if (color) {
        var r = BACKGROUND_ENLIGHT * (255 - color[0]) + color[0];
        var g = BACKGROUND_ENLIGHT * (255 - color[1]) + color[1];
        var b = BACKGROUND_ENLIGHT * (255 - color[2]) + color[2];
        popup.style.backgroundColor = _util.Util.makeCssRgb(r | 0, g | 0, b | 0);
      }
      var contents = this._formatContents(this.contents);
      var title = document.createElement('h1');
      title.textContent = this.title;
      this.trigger.addEventListener('click', this._toggle.bind(this));
      this.trigger.addEventListener('mouseover', this._show.bind(this, false));
      this.trigger.addEventListener('mouseout', this._hide.bind(this, false));
      popup.addEventListener('click', this._hide.bind(this, true));
      popup.appendChild(title);
      popup.appendChild(contents);
      wrapper.appendChild(popup);
      return wrapper;
    }
  }, {
    key: '_formatContents',
    value: function _formatContents(contents) {
      var p = document.createElement('p');
      var lines = contents.split(/(?:\r\n?|\n)/);
      for (var i = 0, ii = lines.length; i < ii; ++i) {
        var line = lines[i];
        p.appendChild(document.createTextNode(line));
        if (i < ii - 1) {
          p.appendChild(document.createElement('br'));
        }
      }
      return p;
    }
  }, {
    key: '_toggle',
    value: function _toggle() {
      if (this.pinned) {
        this._hide(true);
      } else {
        this._show(true);
      }
    }
  }, {
    key: '_show',
    value: function _show() {
      var pin = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

      if (pin) {
        this.pinned = true;
      }
      if (this.hideElement.hasAttribute('hidden')) {
        this.hideElement.removeAttribute('hidden');
        this.container.style.zIndex += 1;
      }
    }
  }, {
    key: '_hide',
    value: function _hide() {
      var unpin = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : true;

      if (unpin) {
        this.pinned = false;
      }
      if (!this.hideElement.hasAttribute('hidden') && !this.pinned) {
        this.hideElement.setAttribute('hidden', true);
        this.container.style.zIndex -= 1;
      }
    }
  }]);

  return PopupElement;
}();

var LineAnnotationElement = function (_AnnotationElement5) {
  _inherits(LineAnnotationElement, _AnnotationElement5);

  function LineAnnotationElement(parameters) {
    _classCallCheck(this, LineAnnotationElement);

    var isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    return _possibleConstructorReturn(this, (LineAnnotationElement.__proto__ || Object.getPrototypeOf(LineAnnotationElement)).call(this, parameters, isRenderable, true));
  }

  _createClass(LineAnnotationElement, [{
    key: 'render',
    value: function render() {
      this.container.className = 'lineAnnotation';
      var data = this.data;
      var width = data.rect[2] - data.rect[0];
      var height = data.rect[3] - data.rect[1];
      var svg = this.svgFactory.create(width, height);
      var line = this.svgFactory.createElement('svg:line');
      line.setAttribute('x1', data.rect[2] - data.lineCoordinates[0]);
      line.setAttribute('y1', data.rect[3] - data.lineCoordinates[1]);
      line.setAttribute('x2', data.rect[2] - data.lineCoordinates[2]);
      line.setAttribute('y2', data.rect[3] - data.lineCoordinates[3]);
      line.setAttribute('stroke-width', data.borderStyle.width);
      line.setAttribute('stroke', 'transparent');
      svg.appendChild(line);
      this.container.append(svg);
      this._createPopup(this.container, line, data);
      return this.container;
    }
  }]);

  return LineAnnotationElement;
}(AnnotationElement);

var SquareAnnotationElement = function (_AnnotationElement6) {
  _inherits(SquareAnnotationElement, _AnnotationElement6);

  function SquareAnnotationElement(parameters) {
    _classCallCheck(this, SquareAnnotationElement);

    var isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    return _possibleConstructorReturn(this, (SquareAnnotationElement.__proto__ || Object.getPrototypeOf(SquareAnnotationElement)).call(this, parameters, isRenderable, true));
  }

  _createClass(SquareAnnotationElement, [{
    key: 'render',
    value: function render() {
      this.container.className = 'squareAnnotation';
      var data = this.data;
      var width = data.rect[2] - data.rect[0];
      var height = data.rect[3] - data.rect[1];
      var svg = this.svgFactory.create(width, height);
      var borderWidth = data.borderStyle.width;
      var square = this.svgFactory.createElement('svg:rect');
      square.setAttribute('x', borderWidth / 2);
      square.setAttribute('y', borderWidth / 2);
      square.setAttribute('width', width - borderWidth);
      square.setAttribute('height', height - borderWidth);
      square.setAttribute('stroke-width', borderWidth);
      square.setAttribute('stroke', 'transparent');
      square.setAttribute('fill', 'none');
      svg.appendChild(square);
      this.container.append(svg);
      this._createPopup(this.container, square, data);
      return this.container;
    }
  }]);

  return SquareAnnotationElement;
}(AnnotationElement);

var CircleAnnotationElement = function (_AnnotationElement7) {
  _inherits(CircleAnnotationElement, _AnnotationElement7);

  function CircleAnnotationElement(parameters) {
    _classCallCheck(this, CircleAnnotationElement);

    var isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    return _possibleConstructorReturn(this, (CircleAnnotationElement.__proto__ || Object.getPrototypeOf(CircleAnnotationElement)).call(this, parameters, isRenderable, true));
  }

  _createClass(CircleAnnotationElement, [{
    key: 'render',
    value: function render() {
      this.container.className = 'circleAnnotation';
      var data = this.data;
      var width = data.rect[2] - data.rect[0];
      var height = data.rect[3] - data.rect[1];
      var svg = this.svgFactory.create(width, height);
      var borderWidth = data.borderStyle.width;
      var circle = this.svgFactory.createElement('svg:ellipse');
      circle.setAttribute('cx', width / 2);
      circle.setAttribute('cy', height / 2);
      circle.setAttribute('rx', width / 2 - borderWidth / 2);
      circle.setAttribute('ry', height / 2 - borderWidth / 2);
      circle.setAttribute('stroke-width', borderWidth);
      circle.setAttribute('stroke', 'transparent');
      circle.setAttribute('fill', 'none');
      svg.appendChild(circle);
      this.container.append(svg);
      this._createPopup(this.container, circle, data);
      return this.container;
    }
  }]);

  return CircleAnnotationElement;
}(AnnotationElement);

var HighlightAnnotationElement = function (_AnnotationElement8) {
  _inherits(HighlightAnnotationElement, _AnnotationElement8);

  function HighlightAnnotationElement(parameters) {
    _classCallCheck(this, HighlightAnnotationElement);

    var isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    return _possibleConstructorReturn(this, (HighlightAnnotationElement.__proto__ || Object.getPrototypeOf(HighlightAnnotationElement)).call(this, parameters, isRenderable, true));
  }

  _createClass(HighlightAnnotationElement, [{
    key: 'render',
    value: function render() {
      this.container.className = 'highlightAnnotation';
      if (!this.data.hasPopup) {
        this._createPopup(this.container, null, this.data);
      }
      return this.container;
    }
  }]);

  return HighlightAnnotationElement;
}(AnnotationElement);

var UnderlineAnnotationElement = function (_AnnotationElement9) {
  _inherits(UnderlineAnnotationElement, _AnnotationElement9);

  function UnderlineAnnotationElement(parameters) {
    _classCallCheck(this, UnderlineAnnotationElement);

    var isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    return _possibleConstructorReturn(this, (UnderlineAnnotationElement.__proto__ || Object.getPrototypeOf(UnderlineAnnotationElement)).call(this, parameters, isRenderable, true));
  }

  _createClass(UnderlineAnnotationElement, [{
    key: 'render',
    value: function render() {
      this.container.className = 'underlineAnnotation';
      if (!this.data.hasPopup) {
        this._createPopup(this.container, null, this.data);
      }
      return this.container;
    }
  }]);

  return UnderlineAnnotationElement;
}(AnnotationElement);

var SquigglyAnnotationElement = function (_AnnotationElement10) {
  _inherits(SquigglyAnnotationElement, _AnnotationElement10);

  function SquigglyAnnotationElement(parameters) {
    _classCallCheck(this, SquigglyAnnotationElement);

    var isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    return _possibleConstructorReturn(this, (SquigglyAnnotationElement.__proto__ || Object.getPrototypeOf(SquigglyAnnotationElement)).call(this, parameters, isRenderable, true));
  }

  _createClass(SquigglyAnnotationElement, [{
    key: 'render',
    value: function render() {
      this.container.className = 'squigglyAnnotation';
      if (!this.data.hasPopup) {
        this._createPopup(this.container, null, this.data);
      }
      return this.container;
    }
  }]);

  return SquigglyAnnotationElement;
}(AnnotationElement);

var StrikeOutAnnotationElement = function (_AnnotationElement11) {
  _inherits(StrikeOutAnnotationElement, _AnnotationElement11);

  function StrikeOutAnnotationElement(parameters) {
    _classCallCheck(this, StrikeOutAnnotationElement);

    var isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    return _possibleConstructorReturn(this, (StrikeOutAnnotationElement.__proto__ || Object.getPrototypeOf(StrikeOutAnnotationElement)).call(this, parameters, isRenderable, true));
  }

  _createClass(StrikeOutAnnotationElement, [{
    key: 'render',
    value: function render() {
      this.container.className = 'strikeoutAnnotation';
      if (!this.data.hasPopup) {
        this._createPopup(this.container, null, this.data);
      }
      return this.container;
    }
  }]);

  return StrikeOutAnnotationElement;
}(AnnotationElement);

var FileAttachmentAnnotationElement = function (_AnnotationElement12) {
  _inherits(FileAttachmentAnnotationElement, _AnnotationElement12);

  function FileAttachmentAnnotationElement(parameters) {
    _classCallCheck(this, FileAttachmentAnnotationElement);

    var _this18 = _possibleConstructorReturn(this, (FileAttachmentAnnotationElement.__proto__ || Object.getPrototypeOf(FileAttachmentAnnotationElement)).call(this, parameters, true));

    var file = _this18.data.file;
    _this18.filename = (0, _dom_utils.getFilenameFromUrl)(file.filename);
    _this18.content = file.content;
    _this18.linkService.onFileAttachmentAnnotation({
      id: (0, _util.stringToPDFString)(file.filename),
      filename: file.filename,
      content: file.content
    });
    return _this18;
  }

  _createClass(FileAttachmentAnnotationElement, [{
    key: 'render',
    value: function render() {
      this.container.className = 'fileAttachmentAnnotation';
      var trigger = document.createElement('div');
      trigger.style.height = this.container.style.height;
      trigger.style.width = this.container.style.width;
      trigger.addEventListener('dblclick', this._download.bind(this));
      if (!this.data.hasPopup && (this.data.title || this.data.contents)) {
        this._createPopup(this.container, trigger, this.data);
      }
      this.container.appendChild(trigger);
      return this.container;
    }
  }, {
    key: '_download',
    value: function _download() {
      if (!this.downloadManager) {
        (0, _util.warn)('Download cannot be started due to unavailable download manager');
        return;
      }
      this.downloadManager.downloadData(this.content, this.filename, '');
    }
  }]);

  return FileAttachmentAnnotationElement;
}(AnnotationElement);

var AnnotationLayer = function () {
  function AnnotationLayer() {
    _classCallCheck(this, AnnotationLayer);
  }

  _createClass(AnnotationLayer, null, [{
    key: 'render',
    value: function render(parameters) {
      for (var i = 0, ii = parameters.annotations.length; i < ii; i++) {
        var data = parameters.annotations[i];
        if (!data) {
          continue;
        }
        var element = AnnotationElementFactory.create({
          data: data,
          layer: parameters.div,
          page: parameters.page,
          viewport: parameters.viewport,
          linkService: parameters.linkService,
          downloadManager: parameters.downloadManager,
          imageResourcesPath: parameters.imageResourcesPath || (0, _dom_utils.getDefaultSetting)('imageResourcesPath'),
          renderInteractiveForms: parameters.renderInteractiveForms || false,
          svgFactory: new _dom_utils.DOMSVGFactory()
        });
        if (element.isRenderable) {
          parameters.div.appendChild(element.render());
        }
      }
    }
  }, {
    key: 'update',
    value: function update(parameters) {
      for (var i = 0, ii = parameters.annotations.length; i < ii; i++) {
        var data = parameters.annotations[i];
        var element = parameters.div.querySelector('[data-annotation-id="' + data.id + '"]');
        if (element) {
          _dom_utils.CustomStyle.setProp('transform', element, 'matrix(' + parameters.viewport.transform.join(',') + ')');
        }
      }
      parameters.div.removeAttribute('hidden');
    }
  }]);

  return AnnotationLayer;
}();

exports.AnnotationLayer = AnnotationLayer;