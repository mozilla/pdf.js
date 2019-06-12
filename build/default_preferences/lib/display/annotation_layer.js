"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AnnotationLayer = void 0;

var _display_utils = require("./display_utils");

var _util = require("../shared/util");

class AnnotationElementFactory {
  static create(parameters) {
    let subtype = parameters.data.annotationType;

    switch (subtype) {
      case _util.AnnotationType.LINK:
        return new LinkAnnotationElement(parameters);

      case _util.AnnotationType.TEXT:
        return new TextAnnotationElement(parameters);

      case _util.AnnotationType.WIDGET:
        let fieldType = parameters.data.fieldType;

        switch (fieldType) {
          case 'Tx':
            return new TextWidgetAnnotationElement(parameters);

          case 'Btn':
            if (parameters.data.radioButton) {
              return new RadioButtonWidgetAnnotationElement(parameters);
            } else if (parameters.data.checkBox) {
              return new CheckboxWidgetAnnotationElement(parameters);
            }

            return new PushButtonWidgetAnnotationElement(parameters);

          case 'Ch':
            return new ChoiceWidgetAnnotationElement(parameters);
        }

        return new WidgetAnnotationElement(parameters);

      case _util.AnnotationType.POPUP:
        return new PopupAnnotationElement(parameters);

      case _util.AnnotationType.FREETEXT:
        return new FreeTextAnnotationElement(parameters);

      case _util.AnnotationType.LINE:
        return new LineAnnotationElement(parameters);

      case _util.AnnotationType.SQUARE:
        return new SquareAnnotationElement(parameters);

      case _util.AnnotationType.CIRCLE:
        return new CircleAnnotationElement(parameters);

      case _util.AnnotationType.POLYLINE:
        return new PolylineAnnotationElement(parameters);

      case _util.AnnotationType.CARET:
        return new CaretAnnotationElement(parameters);

      case _util.AnnotationType.INK:
        return new InkAnnotationElement(parameters);

      case _util.AnnotationType.POLYGON:
        return new PolygonAnnotationElement(parameters);

      case _util.AnnotationType.HIGHLIGHT:
        return new HighlightAnnotationElement(parameters);

      case _util.AnnotationType.UNDERLINE:
        return new UnderlineAnnotationElement(parameters);

      case _util.AnnotationType.SQUIGGLY:
        return new SquigglyAnnotationElement(parameters);

      case _util.AnnotationType.STRIKEOUT:
        return new StrikeOutAnnotationElement(parameters);

      case _util.AnnotationType.STAMP:
        return new StampAnnotationElement(parameters);

      case _util.AnnotationType.FILEATTACHMENT:
        return new FileAttachmentAnnotationElement(parameters);

      default:
        return new AnnotationElement(parameters);
    }
  }

}

class AnnotationElement {
  constructor(parameters, isRenderable = false, ignoreBorder = false) {
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

  _createContainer(ignoreBorder = false) {
    let data = this.data,
        page = this.page,
        viewport = this.viewport;
    let container = document.createElement('section');
    let width = data.rect[2] - data.rect[0];
    let height = data.rect[3] - data.rect[1];
    container.setAttribute('data-annotation-id', data.id);

    let rect = _util.Util.normalizeRect([data.rect[0], page.view[3] - data.rect[1] + page.view[1], data.rect[2], page.view[3] - data.rect[3] + page.view[1]]);

    container.style.transform = 'matrix(' + viewport.transform.join(',') + ')';
    container.style.transformOrigin = -rect[0] + 'px ' + -rect[1] + 'px';

    if (!ignoreBorder && data.borderStyle.width > 0) {
      container.style.borderWidth = data.borderStyle.width + 'px';

      if (data.borderStyle.style !== _util.AnnotationBorderStyleType.UNDERLINE) {
        width = width - 2 * data.borderStyle.width;
        height = height - 2 * data.borderStyle.width;
      }

      let horizontalRadius = data.borderStyle.horizontalCornerRadius;
      let verticalRadius = data.borderStyle.verticalCornerRadius;

      if (horizontalRadius > 0 || verticalRadius > 0) {
        let radius = horizontalRadius + 'px / ' + verticalRadius + 'px';
        container.style.borderRadius = radius;
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

  _createPopup(container, trigger, data) {
    if (!trigger) {
      trigger = document.createElement('div');
      trigger.style.height = container.style.height;
      trigger.style.width = container.style.width;
      container.appendChild(trigger);
    }

    let popupElement = new PopupElement({
      container,
      trigger,
      color: data.color,
      title: data.title,
      modificationDate: data.modificationDate,
      contents: data.contents,
      hideWrapper: true
    });
    let popup = popupElement.render();
    popup.style.left = container.style.width;
    container.appendChild(popup);
  }

  render() {
    (0, _util.unreachable)('Abstract method `AnnotationElement.render` called');
  }

}

class LinkAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    let isRenderable = !!(parameters.data.url || parameters.data.dest || parameters.data.action);
    super(parameters, isRenderable);
  }

  render() {
    this.container.className = 'linkAnnotation';
    let {
      data,
      linkService
    } = this;
    let link = document.createElement('a');
    (0, _display_utils.addLinkAttributes)(link, {
      url: data.url,
      target: data.newWindow ? _display_utils.LinkTarget.BLANK : linkService.externalLinkTarget,
      rel: linkService.externalLinkRel
    });

    if (!data.url) {
      if (data.action) {
        this._bindNamedAction(link, data.action);
      } else {
        this._bindLink(link, data.dest);
      }
    }

    this.container.appendChild(link);
    return this.container;
  }

  _bindLink(link, destination) {
    link.href = this.linkService.getDestinationHash(destination);

    link.onclick = () => {
      if (destination) {
        this.linkService.navigateTo(destination);
      }

      return false;
    };

    if (destination) {
      link.className = 'internalLink';
    }
  }

  _bindNamedAction(link, action) {
    link.href = this.linkService.getAnchorUrl('');

    link.onclick = () => {
      this.linkService.executeNamedAction(action);
      return false;
    };

    link.className = 'internalLink';
  }

}

class TextAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    let isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable);
  }

  render() {
    this.container.className = 'textAnnotation';
    let image = document.createElement('img');
    image.style.height = this.container.style.height;
    image.style.width = this.container.style.width;
    image.src = this.imageResourcesPath + 'annotation-' + this.data.name.toLowerCase() + '.svg';
    image.alt = '[{{type}} Annotation]';
    image.dataset.l10nId = 'text_annotation_type';
    image.dataset.l10nArgs = JSON.stringify({
      type: this.data.name
    });

    if (!this.data.hasPopup) {
      this._createPopup(this.container, image, this.data);
    }

    this.container.appendChild(image);
    return this.container;
  }

}

class WidgetAnnotationElement extends AnnotationElement {
  render() {
    return this.container;
  }

}

class TextWidgetAnnotationElement extends WidgetAnnotationElement {
  constructor(parameters) {
    let isRenderable = parameters.renderInteractiveForms || !parameters.data.hasAppearance && !!parameters.data.fieldValue;
    super(parameters, isRenderable);
  }

  render() {
    const TEXT_ALIGNMENT = ['left', 'center', 'right'];
    this.container.className = 'textWidgetAnnotation';
    let element = null;

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
        let fieldWidth = this.data.rect[2] - this.data.rect[0];
        let combWidth = fieldWidth / this.data.maxLen;
        element.classList.add('comb');
        element.style.letterSpacing = 'calc(' + combWidth + 'px - 1ch)';
      }
    } else {
      element = document.createElement('div');
      element.textContent = this.data.fieldValue;
      element.style.verticalAlign = 'middle';
      element.style.display = 'table-cell';
      let font = null;

      if (this.data.fontRefName && this.page.commonObjs.has(this.data.fontRefName)) {
        font = this.page.commonObjs.get(this.data.fontRefName);
      }

      this._setTextStyle(element, font);
    }

    if (this.data.textAlignment !== null) {
      element.style.textAlign = TEXT_ALIGNMENT[this.data.textAlignment];
    }

    this.container.appendChild(element);
    return this.container;
  }

  _setTextStyle(element, font) {
    let style = element.style;
    style.fontSize = this.data.fontSize + 'px';
    style.direction = this.data.fontDirection < 0 ? 'rtl' : 'ltr';

    if (!font) {
      return;
    }

    style.fontWeight = font.black ? font.bold ? '900' : 'bold' : font.bold ? 'bold' : 'normal';
    style.fontStyle = font.italic ? 'italic' : 'normal';
    let fontFamily = font.loadedName ? '"' + font.loadedName + '", ' : '';
    let fallbackName = font.fallbackName || 'Helvetica, sans-serif';
    style.fontFamily = fontFamily + fallbackName;
  }

}

class CheckboxWidgetAnnotationElement extends WidgetAnnotationElement {
  constructor(parameters) {
    super(parameters, parameters.renderInteractiveForms);
  }

  render() {
    this.container.className = 'buttonWidgetAnnotation checkBox';
    let element = document.createElement('input');
    element.disabled = this.data.readOnly;
    element.type = 'checkbox';

    if (this.data.fieldValue && this.data.fieldValue !== 'Off') {
      element.setAttribute('checked', true);
    }

    this.container.appendChild(element);
    return this.container;
  }

}

class RadioButtonWidgetAnnotationElement extends WidgetAnnotationElement {
  constructor(parameters) {
    super(parameters, parameters.renderInteractiveForms);
  }

  render() {
    this.container.className = 'buttonWidgetAnnotation radioButton';
    let element = document.createElement('input');
    element.disabled = this.data.readOnly;
    element.type = 'radio';
    element.name = this.data.fieldName;

    if (this.data.fieldValue === this.data.buttonValue) {
      element.setAttribute('checked', true);
    }

    this.container.appendChild(element);
    return this.container;
  }

}

class PushButtonWidgetAnnotationElement extends LinkAnnotationElement {
  render() {
    let container = super.render();
    container.className = 'buttonWidgetAnnotation pushButton';
    return container;
  }

}

class ChoiceWidgetAnnotationElement extends WidgetAnnotationElement {
  constructor(parameters) {
    super(parameters, parameters.renderInteractiveForms);
  }

  render() {
    this.container.className = 'choiceWidgetAnnotation';
    let selectElement = document.createElement('select');
    selectElement.disabled = this.data.readOnly;

    if (!this.data.combo) {
      selectElement.size = this.data.options.length;

      if (this.data.multiSelect) {
        selectElement.multiple = true;
      }
    }

    for (let i = 0, ii = this.data.options.length; i < ii; i++) {
      let option = this.data.options[i];
      let optionElement = document.createElement('option');
      optionElement.textContent = option.displayValue;
      optionElement.value = option.exportValue;

      if (this.data.fieldValue.includes(option.displayValue)) {
        optionElement.setAttribute('selected', true);
      }

      selectElement.appendChild(optionElement);
    }

    this.container.appendChild(selectElement);
    return this.container;
  }

}

class PopupAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    let isRenderable = !!(parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable);
  }

  render() {
    const IGNORE_TYPES = ['Line', 'Square', 'Circle', 'PolyLine', 'Polygon', 'Ink'];
    this.container.className = 'popupAnnotation';

    if (IGNORE_TYPES.includes(this.data.parentType)) {
      return this.container;
    }

    let selector = '[data-annotation-id="' + this.data.parentId + '"]';
    let parentElement = this.layer.querySelector(selector);

    if (!parentElement) {
      return this.container;
    }

    let popup = new PopupElement({
      container: this.container,
      trigger: parentElement,
      color: this.data.color,
      title: this.data.title,
      modificationDate: this.data.modificationDate,
      contents: this.data.contents
    });
    let parentLeft = parseFloat(parentElement.style.left);
    let parentWidth = parseFloat(parentElement.style.width);
    this.container.style.transformOrigin = -(parentLeft + parentWidth) + 'px -' + parentElement.style.top;
    this.container.style.left = parentLeft + parentWidth + 'px';
    this.container.appendChild(popup.render());
    return this.container;
  }

}

class PopupElement {
  constructor(parameters) {
    this.container = parameters.container;
    this.trigger = parameters.trigger;
    this.color = parameters.color;
    this.title = parameters.title;
    this.modificationDate = parameters.modificationDate;
    this.contents = parameters.contents;
    this.hideWrapper = parameters.hideWrapper || false;
    this.pinned = false;
  }

  render() {
    const BACKGROUND_ENLIGHT = 0.7;
    let wrapper = document.createElement('div');
    wrapper.className = 'popupWrapper';
    this.hideElement = this.hideWrapper ? wrapper : this.container;
    this.hideElement.setAttribute('hidden', true);
    let popup = document.createElement('div');
    popup.className = 'popup';
    let color = this.color;

    if (color) {
      let r = BACKGROUND_ENLIGHT * (255 - color[0]) + color[0];
      let g = BACKGROUND_ENLIGHT * (255 - color[1]) + color[1];
      let b = BACKGROUND_ENLIGHT * (255 - color[2]) + color[2];
      popup.style.backgroundColor = _util.Util.makeCssRgb(r | 0, g | 0, b | 0);
    }

    let title = document.createElement('h1');
    title.textContent = this.title;
    popup.appendChild(title);

    const dateObject = _display_utils.PDFDateString.toDateObject(this.modificationDate);

    if (dateObject) {
      const modificationDate = document.createElement('span');
      modificationDate.textContent = '{{date}}, {{time}}';
      modificationDate.dataset.l10nId = 'annotation_date_string';
      modificationDate.dataset.l10nArgs = JSON.stringify({
        date: dateObject.toLocaleDateString(),
        time: dateObject.toLocaleTimeString()
      });
      popup.appendChild(modificationDate);
    }

    let contents = this._formatContents(this.contents);

    popup.appendChild(contents);
    this.trigger.addEventListener('click', this._toggle.bind(this));
    this.trigger.addEventListener('mouseover', this._show.bind(this, false));
    this.trigger.addEventListener('mouseout', this._hide.bind(this, false));
    popup.addEventListener('click', this._hide.bind(this, true));
    wrapper.appendChild(popup);
    return wrapper;
  }

  _formatContents(contents) {
    let p = document.createElement('p');
    let lines = contents.split(/(?:\r\n?|\n)/);

    for (let i = 0, ii = lines.length; i < ii; ++i) {
      let line = lines[i];
      p.appendChild(document.createTextNode(line));

      if (i < ii - 1) {
        p.appendChild(document.createElement('br'));
      }
    }

    return p;
  }

  _toggle() {
    if (this.pinned) {
      this._hide(true);
    } else {
      this._show(true);
    }
  }

  _show(pin = false) {
    if (pin) {
      this.pinned = true;
    }

    if (this.hideElement.hasAttribute('hidden')) {
      this.hideElement.removeAttribute('hidden');
      this.container.style.zIndex += 1;
    }
  }

  _hide(unpin = true) {
    if (unpin) {
      this.pinned = false;
    }

    if (!this.hideElement.hasAttribute('hidden') && !this.pinned) {
      this.hideElement.setAttribute('hidden', true);
      this.container.style.zIndex -= 1;
    }
  }

}

class FreeTextAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    const isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
  }

  render() {
    this.container.className = 'freeTextAnnotation';

    if (!this.data.hasPopup) {
      this._createPopup(this.container, null, this.data);
    }

    return this.container;
  }

}

class LineAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    let isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
  }

  render() {
    this.container.className = 'lineAnnotation';
    let data = this.data;
    let width = data.rect[2] - data.rect[0];
    let height = data.rect[3] - data.rect[1];
    let svg = this.svgFactory.create(width, height);
    let line = this.svgFactory.createElement('svg:line');
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

}

class SquareAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    let isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
  }

  render() {
    this.container.className = 'squareAnnotation';
    let data = this.data;
    let width = data.rect[2] - data.rect[0];
    let height = data.rect[3] - data.rect[1];
    let svg = this.svgFactory.create(width, height);
    let borderWidth = data.borderStyle.width;
    let square = this.svgFactory.createElement('svg:rect');
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

}

class CircleAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    let isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
  }

  render() {
    this.container.className = 'circleAnnotation';
    let data = this.data;
    let width = data.rect[2] - data.rect[0];
    let height = data.rect[3] - data.rect[1];
    let svg = this.svgFactory.create(width, height);
    let borderWidth = data.borderStyle.width;
    let circle = this.svgFactory.createElement('svg:ellipse');
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

}

class PolylineAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    let isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
    this.containerClassName = 'polylineAnnotation';
    this.svgElementName = 'svg:polyline';
  }

  render() {
    this.container.className = this.containerClassName;
    let data = this.data;
    let width = data.rect[2] - data.rect[0];
    let height = data.rect[3] - data.rect[1];
    let svg = this.svgFactory.create(width, height);
    let vertices = data.vertices;
    let points = [];

    for (let i = 0, ii = vertices.length; i < ii; i++) {
      let x = vertices[i].x - data.rect[0];
      let y = data.rect[3] - vertices[i].y;
      points.push(x + ',' + y);
    }

    points = points.join(' ');
    let borderWidth = data.borderStyle.width;
    let polyline = this.svgFactory.createElement(this.svgElementName);
    polyline.setAttribute('points', points);
    polyline.setAttribute('stroke-width', borderWidth);
    polyline.setAttribute('stroke', 'transparent');
    polyline.setAttribute('fill', 'none');
    svg.appendChild(polyline);
    this.container.append(svg);

    this._createPopup(this.container, polyline, data);

    return this.container;
  }

}

class PolygonAnnotationElement extends PolylineAnnotationElement {
  constructor(parameters) {
    super(parameters);
    this.containerClassName = 'polygonAnnotation';
    this.svgElementName = 'svg:polygon';
  }

}

class CaretAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    const isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
  }

  render() {
    this.container.className = 'caretAnnotation';

    if (!this.data.hasPopup) {
      this._createPopup(this.container, null, this.data);
    }

    return this.container;
  }

}

class InkAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    let isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
    this.containerClassName = 'inkAnnotation';
    this.svgElementName = 'svg:polyline';
  }

  render() {
    this.container.className = this.containerClassName;
    let data = this.data;
    let width = data.rect[2] - data.rect[0];
    let height = data.rect[3] - data.rect[1];
    let svg = this.svgFactory.create(width, height);
    let inkLists = data.inkLists;

    for (let i = 0, ii = inkLists.length; i < ii; i++) {
      let inkList = inkLists[i];
      let points = [];

      for (let j = 0, jj = inkList.length; j < jj; j++) {
        let x = inkList[j].x - data.rect[0];
        let y = data.rect[3] - inkList[j].y;
        points.push(x + ',' + y);
      }

      points = points.join(' ');
      let borderWidth = data.borderStyle.width;
      let polyline = this.svgFactory.createElement(this.svgElementName);
      polyline.setAttribute('points', points);
      polyline.setAttribute('stroke-width', borderWidth);
      polyline.setAttribute('stroke', 'transparent');
      polyline.setAttribute('fill', 'none');

      this._createPopup(this.container, polyline, data);

      svg.appendChild(polyline);
    }

    this.container.append(svg);
    return this.container;
  }

}

class HighlightAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    let isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
  }

  render() {
    this.container.className = 'highlightAnnotation';

    if (!this.data.hasPopup) {
      this._createPopup(this.container, null, this.data);
    }

    return this.container;
  }

}

class UnderlineAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    let isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
  }

  render() {
    this.container.className = 'underlineAnnotation';

    if (!this.data.hasPopup) {
      this._createPopup(this.container, null, this.data);
    }

    return this.container;
  }

}

class SquigglyAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    let isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
  }

  render() {
    this.container.className = 'squigglyAnnotation';

    if (!this.data.hasPopup) {
      this._createPopup(this.container, null, this.data);
    }

    return this.container;
  }

}

class StrikeOutAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    let isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
  }

  render() {
    this.container.className = 'strikeoutAnnotation';

    if (!this.data.hasPopup) {
      this._createPopup(this.container, null, this.data);
    }

    return this.container;
  }

}

class StampAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    let isRenderable = !!(parameters.data.hasPopup || parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, true);
  }

  render() {
    this.container.className = 'stampAnnotation';

    if (!this.data.hasPopup) {
      this._createPopup(this.container, null, this.data);
    }

    return this.container;
  }

}

class FileAttachmentAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    super(parameters, true);
    const {
      filename,
      content
    } = this.data.file;
    this.filename = (0, _display_utils.getFilenameFromUrl)(filename);
    this.content = content;

    if (this.linkService.eventBus) {
      this.linkService.eventBus.dispatch('fileattachmentannotation', {
        source: this,
        id: (0, _util.stringToPDFString)(filename),
        filename,
        content
      });
    }
  }

  render() {
    this.container.className = 'fileAttachmentAnnotation';
    let trigger = document.createElement('div');
    trigger.style.height = this.container.style.height;
    trigger.style.width = this.container.style.width;
    trigger.addEventListener('dblclick', this._download.bind(this));

    if (!this.data.hasPopup && (this.data.title || this.data.contents)) {
      this._createPopup(this.container, trigger, this.data);
    }

    this.container.appendChild(trigger);
    return this.container;
  }

  _download() {
    if (!this.downloadManager) {
      (0, _util.warn)('Download cannot be started due to unavailable download manager');
      return;
    }

    this.downloadManager.downloadData(this.content, this.filename, '');
  }

}

class AnnotationLayer {
  static render(parameters) {
    for (let i = 0, ii = parameters.annotations.length; i < ii; i++) {
      let data = parameters.annotations[i];

      if (!data) {
        continue;
      }

      let element = AnnotationElementFactory.create({
        data,
        layer: parameters.div,
        page: parameters.page,
        viewport: parameters.viewport,
        linkService: parameters.linkService,
        downloadManager: parameters.downloadManager,
        imageResourcesPath: parameters.imageResourcesPath || '',
        renderInteractiveForms: parameters.renderInteractiveForms || false,
        svgFactory: new _display_utils.DOMSVGFactory()
      });

      if (element.isRenderable) {
        parameters.div.appendChild(element.render());
      }
    }
  }

  static update(parameters) {
    for (let i = 0, ii = parameters.annotations.length; i < ii; i++) {
      let data = parameters.annotations[i];
      let element = parameters.div.querySelector('[data-annotation-id="' + data.id + '"]');

      if (element) {
        element.style.transform = 'matrix(' + parameters.viewport.transform.join(',') + ')';
      }
    }

    parameters.div.removeAttribute('hidden');
  }

}

exports.AnnotationLayer = AnnotationLayer;