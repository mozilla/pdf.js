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

import {
  addLinkAttributes, DOMSVGFactory, getDefaultSetting, getFilenameFromUrl,
  LinkTarget
} from './dom_utils';
import {
  AnnotationBorderStyleType, AnnotationType, stringToPDFString, unreachable,
  Util, warn
} from '../shared/util';

/**
 * @typedef {Object} AnnotationElementParameters
 * @property {Object} data
 * @property {HTMLDivElement} layer
 * @property {PDFPage} page
 * @property {PageViewport} viewport
 * @property {IPDFLinkService} linkService
 * @property {DownloadManager} downloadManager
 * @property {string} imageResourcesPath
 * @property {boolean} renderInteractiveForms
 * @property {Object} svgFactory
 */

class AnnotationElementFactory {
  /**
   * @param {AnnotationElementParameters} parameters
   * @returns {AnnotationElement}
   */
  static create(parameters) {
    let subtype = parameters.data.annotationType;

    switch (subtype) {
      case AnnotationType.LINK:
        return new LinkAnnotationElement(parameters);

      case AnnotationType.TEXT:
        return new TextAnnotationElement(parameters);

      case AnnotationType.WIDGET:
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

      case AnnotationType.POPUP:
        return new PopupAnnotationElement(parameters);

      case AnnotationType.LINE:
        return new LineAnnotationElement(parameters);

      case AnnotationType.SQUARE:
        return new SquareAnnotationElement(parameters);

      case AnnotationType.CIRCLE:
        return new CircleAnnotationElement(parameters);

      case AnnotationType.POLYLINE:
        return new PolylineAnnotationElement(parameters);

      case AnnotationType.POLYGON:
        return new PolygonAnnotationElement(parameters);

      case AnnotationType.HIGHLIGHT:
        return new HighlightAnnotationElement(parameters);

      case AnnotationType.UNDERLINE:
        return new UnderlineAnnotationElement(parameters);

      case AnnotationType.SQUIGGLY:
        return new SquigglyAnnotationElement(parameters);

      case AnnotationType.STRIKEOUT:
        return new StrikeOutAnnotationElement(parameters);

      case AnnotationType.STAMP:
        return new StampAnnotationElement(parameters);

      case AnnotationType.FILEATTACHMENT:
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

  /**
   * Create an empty container for the annotation's HTML element.
   *
   * @private
   * @param {boolean} ignoreBorder
   * @memberof AnnotationElement
   * @returns {HTMLSectionElement}
   */
  _createContainer(ignoreBorder = false) {
    let data = this.data, page = this.page, viewport = this.viewport;
    let container = document.createElement('section');
    let width = data.rect[2] - data.rect[0];
    let height = data.rect[3] - data.rect[1];

    container.setAttribute('data-annotation-id', data.id);

    // Do *not* modify `data.rect`, since that will corrupt the annotation
    // position on subsequent calls to `_createContainer` (see issue 6804).
    let rect = Util.normalizeRect([
      data.rect[0],
      page.view[3] - data.rect[1] + page.view[1],
      data.rect[2],
      page.view[3] - data.rect[3] + page.view[1]
    ]);

    container.style.transform = 'matrix(' + viewport.transform.join(',') + ')';
    container.style.transformOrigin = -rect[0] + 'px ' + -rect[1] + 'px';

    if (!ignoreBorder && data.borderStyle.width > 0) {
      container.style.borderWidth = data.borderStyle.width + 'px';
      if (data.borderStyle.style !== AnnotationBorderStyleType.UNDERLINE) {
        // Underline styles only have a bottom border, so we do not need
        // to adjust for all borders. This yields a similar result as
        // Adobe Acrobat/Reader.
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
        case AnnotationBorderStyleType.SOLID:
          container.style.borderStyle = 'solid';
          break;

        case AnnotationBorderStyleType.DASHED:
          container.style.borderStyle = 'dashed';
          break;

        case AnnotationBorderStyleType.BEVELED:
          warn('Unimplemented border style: beveled');
          break;

        case AnnotationBorderStyleType.INSET:
          warn('Unimplemented border style: inset');
          break;

        case AnnotationBorderStyleType.UNDERLINE:
          container.style.borderBottomStyle = 'solid';
          break;

        default:
          break;
      }

      if (data.color) {
        container.style.borderColor = Util.makeCssRgb(data.color[0] | 0,
                                                      data.color[1] | 0,
                                                      data.color[2] | 0);
      } else {
        // Transparent (invisible) border, so do not draw it at all.
        container.style.borderWidth = 0;
      }
    }

    container.style.left = rect[0] + 'px';
    container.style.top = rect[1] + 'px';

    container.style.width = width + 'px';
    container.style.height = height + 'px';

    return container;
  }

  /**
   * Create a popup for the annotation's HTML element. This is used for
   * annotations that do not have a Popup entry in the dictionary, but
   * are of a type that works with popups (such as Highlight annotations).
   *
   * @private
   * @param {HTMLSectionElement} container
   * @param {HTMLDivElement|HTMLImageElement|null} trigger
   * @param {Object} data
   * @memberof AnnotationElement
   */
  _createPopup(container, trigger, data) {
    // If no trigger element is specified, create it.
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
      contents: data.contents,
      hideWrapper: true,
    });
    let popup = popupElement.render();

    // Position the popup next to the annotation's container.
    popup.style.left = container.style.width;

    container.appendChild(popup);
  }

  /**
   * Render the annotation's HTML element in the empty container.
   *
   * @public
   * @memberof AnnotationElement
   */
  render() {
    unreachable('Abstract method `AnnotationElement.render` called');
  }
}

class LinkAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    let isRenderable = !!(parameters.data.url || parameters.data.dest ||
                          parameters.data.action);
    super(parameters, isRenderable);
  }

  /**
   * Render the link annotation's HTML element in the empty container.
   *
   * @public
   * @memberof LinkAnnotationElement
   * @returns {HTMLSectionElement}
   */
  render() {
    this.container.className = 'linkAnnotation';

    let link = document.createElement('a');
    addLinkAttributes(link, {
      url: this.data.url,
      target: (this.data.newWindow ? LinkTarget.BLANK : undefined),
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

  /**
   * Bind internal links to the link element.
   *
   * @private
   * @param {Object} link
   * @param {Object} destination
   * @memberof LinkAnnotationElement
   */
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

  /**
   * Bind named actions to the link element.
   *
   * @private
   * @param {Object} link
   * @param {Object} action
   * @memberof LinkAnnotationElement
   */
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
    let isRenderable = !!(parameters.data.hasPopup ||
                          parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable);
  }

  /**
   * Render the text annotation's HTML element in the empty container.
   *
   * @public
   * @memberof TextAnnotationElement
   * @returns {HTMLSectionElement}
   */
  render() {
    this.container.className = 'textAnnotation';

    let image = document.createElement('img');
    image.style.height = this.container.style.height;
    image.style.width = this.container.style.width;
    image.src = this.imageResourcesPath + 'annotation-' +
      this.data.name.toLowerCase() + '.svg';
    image.alt = '[{{type}} Annotation]';
    image.dataset.l10nId = 'text_annotation_type';
    image.dataset.l10nArgs = JSON.stringify({ type: this.data.name, });

    if (!this.data.hasPopup) {
      this._createPopup(this.container, image, this.data);
    }

    this.container.appendChild(image);
    return this.container;
  }
}

class WidgetAnnotationElement extends AnnotationElement {
  /**
   * Render the widget annotation's HTML element in the empty container.
   *
   * @public
   * @memberof WidgetAnnotationElement
   * @returns {HTMLSectionElement}
   */
  render() {
    // Show only the container for unsupported field types.
    return this.container;
  }
}

class TextWidgetAnnotationElement extends WidgetAnnotationElement {
  constructor(parameters) {
    let isRenderable = parameters.renderInteractiveForms ||
      (!parameters.data.hasAppearance && !!parameters.data.fieldValue);
    super(parameters, isRenderable);
  }

  /**
   * Render the text widget annotation's HTML element in the empty container.
   *
   * @public
   * @memberof TextWidgetAnnotationElement
   * @returns {HTMLSectionElement}
   */
  render() {
    const TEXT_ALIGNMENT = ['left', 'center', 'right'];

    this.container.className = 'textWidgetAnnotation';

    let element = null;
    if (this.renderInteractiveForms) {
      // NOTE: We cannot set the values using `element.value` below, since it
      //       prevents the AnnotationLayer rasterizer in `test/driver.js`
      //       from parsing the elements correctly for the reference tests.
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

  /**
   * Apply text styles to the text in the element.
   *
   * @private
   * @param {HTMLDivElement} element
   * @param {Object} font
   * @memberof TextWidgetAnnotationElement
   */
  _setTextStyle(element, font) {
    // TODO: This duplicates some of the logic in CanvasGraphics.setFont().
    let style = element.style;
    style.fontSize = this.data.fontSize + 'px';
    style.direction = (this.data.fontDirection < 0 ? 'rtl' : 'ltr');

    if (!font) {
      return;
    }

    style.fontWeight = (font.black ?
      (font.bold ? '900' : 'bold') :
      (font.bold ? 'bold' : 'normal'));
    style.fontStyle = (font.italic ? 'italic' : 'normal');

    // Use a reasonable default font if the font doesn't specify a fallback.
    let fontFamily = font.loadedName ? '"' + font.loadedName + '", ' : '';
    let fallbackName = font.fallbackName || 'Helvetica, sans-serif';
    style.fontFamily = fontFamily + fallbackName;
  }
}

class CheckboxWidgetAnnotationElement extends WidgetAnnotationElement {
  constructor(parameters) {
    super(parameters, parameters.renderInteractiveForms);
  }

  /**
   * Render the checkbox widget annotation's HTML element
   * in the empty container.
   *
   * @public
   * @memberof CheckboxWidgetAnnotationElement
   * @returns {HTMLSectionElement}
   */
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

  /**
   * Render the radio button widget annotation's HTML element
   * in the empty container.
   *
   * @public
   * @memberof RadioButtonWidgetAnnotationElement
   * @returns {HTMLSectionElement}
   */
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
  /**
   * Render the push button widget annotation's HTML element
   * in the empty container.
   *
   * @public
   * @memberof PushButtonWidgetAnnotationElement
   * @returns {HTMLSectionElement}
   */
  render() {
    // The rendering and functionality of a push button widget annotation is
    // equal to that of a link annotation, but may have more functionality, such
    // as performing actions on form fields (resetting, submitting, et cetera).
    let container = super.render();
    container.className = 'buttonWidgetAnnotation pushButton';
    return container;
  }
}

class ChoiceWidgetAnnotationElement extends WidgetAnnotationElement {
  constructor(parameters) {
    super(parameters, parameters.renderInteractiveForms);
  }

  /**
   * Render the choice widget annotation's HTML element in the empty
   * container.
   *
   * @public
   * @memberof ChoiceWidgetAnnotationElement
   * @returns {HTMLSectionElement}
   */
  render() {
    this.container.className = 'choiceWidgetAnnotation';

    let selectElement = document.createElement('select');
    selectElement.disabled = this.data.readOnly;

    if (!this.data.combo) {
      // List boxes have a size and (optionally) multiple selection.
      selectElement.size = this.data.options.length;

      if (this.data.multiSelect) {
        selectElement.multiple = true;
      }
    }

    // Insert the options into the choice field.
    for (let i = 0, ii = this.data.options.length; i < ii; i++) {
      let option = this.data.options[i];

      let optionElement = document.createElement('option');
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
}

class PopupAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    let isRenderable = !!(parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable);
  }

  /**
   * Render the popup annotation's HTML element in the empty container.
   *
   * @public
   * @memberof PopupAnnotationElement
   * @returns {HTMLSectionElement}
   */
  render() {
    // Do not render popup annotations for parent elements with these types as
    // they create the popups themselves (because of custom trigger divs).
    const IGNORE_TYPES = ['Line', 'Square', 'Circle', 'PolyLine', 'Polygon'];

    this.container.className = 'popupAnnotation';

    if (IGNORE_TYPES.indexOf(this.data.parentType) >= 0) {
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
      contents: this.data.contents,
    });

    // Position the popup next to the parent annotation's container.
    // PDF viewers ignore a popup annotation's rectangle.
    let parentLeft = parseFloat(parentElement.style.left);
    let parentWidth = parseFloat(parentElement.style.width);
    this.container.style.transformOrigin =
      -(parentLeft + parentWidth) + 'px -' + parentElement.style.top;
    this.container.style.left = (parentLeft + parentWidth) + 'px';

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
    this.contents = parameters.contents;
    this.hideWrapper = parameters.hideWrapper || false;

    this.pinned = false;
  }

  /**
   * Render the popup's HTML element.
   *
   * @public
   * @memberof PopupElement
   * @returns {HTMLSectionElement}
   */
  render() {
    const BACKGROUND_ENLIGHT = 0.7;

    let wrapper = document.createElement('div');
    wrapper.className = 'popupWrapper';

    // For Popup annotations we hide the entire section because it contains
    // only the popup. However, for Text annotations without a separate Popup
    // annotation, we cannot hide the entire container as the image would
    // disappear too. In that special case, hiding the wrapper suffices.
    this.hideElement = (this.hideWrapper ? wrapper : this.container);
    this.hideElement.setAttribute('hidden', true);

    let popup = document.createElement('div');
    popup.className = 'popup';

    let color = this.color;
    if (color) {
      // Enlighten the color.
      let r = BACKGROUND_ENLIGHT * (255 - color[0]) + color[0];
      let g = BACKGROUND_ENLIGHT * (255 - color[1]) + color[1];
      let b = BACKGROUND_ENLIGHT * (255 - color[2]) + color[2];
      popup.style.backgroundColor = Util.makeCssRgb(r | 0, g | 0, b | 0);
    }

    let contents = this._formatContents(this.contents);
    let title = document.createElement('h1');
    title.textContent = this.title;

    // Attach the event listeners to the trigger element.
    this.trigger.addEventListener('click', this._toggle.bind(this));
    this.trigger.addEventListener('mouseover', this._show.bind(this, false));
    this.trigger.addEventListener('mouseout', this._hide.bind(this, false));
    popup.addEventListener('click', this._hide.bind(this, true));

    popup.appendChild(title);
    popup.appendChild(contents);
    wrapper.appendChild(popup);
    return wrapper;
  }

  /**
   * Format the contents of the popup by adding newlines where necessary.
   *
   * @private
   * @param {string} contents
   * @memberof PopupElement
   * @returns {HTMLParagraphElement}
   */
  _formatContents(contents) {
    let p = document.createElement('p');
    let lines = contents.split(/(?:\r\n?|\n)/);
    for (let i = 0, ii = lines.length; i < ii; ++i) {
      let line = lines[i];
      p.appendChild(document.createTextNode(line));
      if (i < (ii - 1)) {
        p.appendChild(document.createElement('br'));
      }
    }
    return p;
  }

  /**
   * Toggle the visibility of the popup.
   *
   * @private
   * @memberof PopupElement
   */
  _toggle() {
    if (this.pinned) {
      this._hide(true);
    } else {
      this._show(true);
    }
  }

  /**
   * Show the popup.
   *
   * @private
   * @param {boolean} pin
   * @memberof PopupElement
   */
  _show(pin = false) {
    if (pin) {
      this.pinned = true;
    }
    if (this.hideElement.hasAttribute('hidden')) {
      this.hideElement.removeAttribute('hidden');
      this.container.style.zIndex += 1;
    }
  }

  /**
   * Hide the popup.
   *
   * @private
   * @param {boolean} unpin
   * @memberof PopupElement
   */
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

class LineAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    let isRenderable = !!(parameters.data.hasPopup ||
                          parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, /* ignoreBorder = */ true);
  }

  /**
   * Render the line annotation's HTML element in the empty container.
   *
   * @public
   * @memberof LineAnnotationElement
   * @returns {HTMLSectionElement}
   */
  render() {
    this.container.className = 'lineAnnotation';

    // Create an invisible line with the same starting and ending coordinates
    // that acts as the trigger for the popup. Only the line itself should
    // trigger the popup, not the entire container.
    let data = this.data;
    let width = data.rect[2] - data.rect[0];
    let height = data.rect[3] - data.rect[1];
    let svg = this.svgFactory.create(width, height);

    // PDF coordinates are calculated from a bottom left origin, so transform
    // the line coordinates to a top left origin for the SVG element.
    let line = this.svgFactory.createElement('svg:line');
    line.setAttribute('x1', data.rect[2] - data.lineCoordinates[0]);
    line.setAttribute('y1', data.rect[3] - data.lineCoordinates[1]);
    line.setAttribute('x2', data.rect[2] - data.lineCoordinates[2]);
    line.setAttribute('y2', data.rect[3] - data.lineCoordinates[3]);
    line.setAttribute('stroke-width', data.borderStyle.width);
    line.setAttribute('stroke', 'transparent');

    svg.appendChild(line);
    this.container.append(svg);

    // Create the popup ourselves so that we can bind it to the line instead
    // of to the entire container (which is the default).
    this._createPopup(this.container, line, data);

    return this.container;
  }
}

class SquareAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    let isRenderable = !!(parameters.data.hasPopup ||
                          parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, /* ignoreBorder = */ true);
  }

  /**
   * Render the square annotation's HTML element in the empty container.
   *
   * @public
   * @memberof SquareAnnotationElement
   * @returns {HTMLSectionElement}
   */
  render() {
    this.container.className = 'squareAnnotation';

    // Create an invisible square with the same rectangle that acts as the
    // trigger for the popup. Only the square itself should trigger the
    // popup, not the entire container.
    let data = this.data;
    let width = data.rect[2] - data.rect[0];
    let height = data.rect[3] - data.rect[1];
    let svg = this.svgFactory.create(width, height);

    // The browser draws half of the borders inside the square and half of
    // the borders outside the square by default. This behavior cannot be
    // changed programmatically, so correct for that here.
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

    // Create the popup ourselves so that we can bind it to the square instead
    // of to the entire container (which is the default).
    this._createPopup(this.container, square, data);

    return this.container;
  }
}

class CircleAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    let isRenderable = !!(parameters.data.hasPopup ||
                          parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, /* ignoreBorder = */ true);
  }

  /**
   * Render the circle annotation's HTML element in the empty container.
   *
   * @public
   * @memberof CircleAnnotationElement
   * @returns {HTMLSectionElement}
   */
  render() {
    this.container.className = 'circleAnnotation';

    // Create an invisible circle with the same ellipse that acts as the
    // trigger for the popup. Only the circle itself should trigger the
    // popup, not the entire container.
    let data = this.data;
    let width = data.rect[2] - data.rect[0];
    let height = data.rect[3] - data.rect[1];
    let svg = this.svgFactory.create(width, height);

    // The browser draws half of the borders inside the circle and half of
    // the borders outside the circle by default. This behavior cannot be
    // changed programmatically, so correct for that here.
    let borderWidth = data.borderStyle.width;
    let circle = this.svgFactory.createElement('svg:ellipse');
    circle.setAttribute('cx', width / 2);
    circle.setAttribute('cy', height / 2);
    circle.setAttribute('rx', (width / 2) - (borderWidth / 2));
    circle.setAttribute('ry', (height / 2) - (borderWidth / 2));
    circle.setAttribute('stroke-width', borderWidth);
    circle.setAttribute('stroke', 'transparent');
    circle.setAttribute('fill', 'none');

    svg.appendChild(circle);
    this.container.append(svg);

    // Create the popup ourselves so that we can bind it to the circle instead
    // of to the entire container (which is the default).
    this._createPopup(this.container, circle, data);

    return this.container;
  }
}

class PolylineAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    let isRenderable = !!(parameters.data.hasPopup ||
                          parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, /* ignoreBorder = */ true);

    this.containerClassName = 'polylineAnnotation';
    this.svgElementName = 'svg:polyline';
  }

  /**
   * Render the polyline annotation's HTML element in the empty container.
   *
   * @public
   * @memberof PolylineAnnotationElement
   * @returns {HTMLSectionElement}
   */
  render() {
    this.container.className = this.containerClassName;

    // Create an invisible polyline with the same points that acts as the
    // trigger for the popup. Only the polyline itself should trigger the
    // popup, not the entire container.
    let data = this.data;
    let width = data.rect[2] - data.rect[0];
    let height = data.rect[3] - data.rect[1];
    let svg = this.svgFactory.create(width, height);

    // Convert the vertices array to a single points string that the SVG
    // polyline element expects ("x1,y1 x2,y2 ..."). PDF coordinates are
    // calculated from a bottom left origin, so transform the polyline
    // coordinates to a top left origin for the SVG element.
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

    // Create the popup ourselves so that we can bind it to the polyline
    // instead of to the entire container (which is the default).
    this._createPopup(this.container, polyline, data);

    return this.container;
  }
}

class PolygonAnnotationElement extends PolylineAnnotationElement {
  constructor(parameters) {
    // Polygons are specific forms of polylines, so reuse their logic.
    super(parameters);

    this.containerClassName = 'polygonAnnotation';
    this.svgElementName = 'svg:polygon';
  }
}

class HighlightAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    let isRenderable = !!(parameters.data.hasPopup ||
                          parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, /* ignoreBorder = */ true);
  }

  /**
   * Render the highlight annotation's HTML element in the empty container.
   *
   * @public
   * @memberof HighlightAnnotationElement
   * @returns {HTMLSectionElement}
   */
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
    let isRenderable = !!(parameters.data.hasPopup ||
                          parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, /* ignoreBorder = */ true);
  }

  /**
   * Render the underline annotation's HTML element in the empty container.
   *
   * @public
   * @memberof UnderlineAnnotationElement
   * @returns {HTMLSectionElement}
   */
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
    let isRenderable = !!(parameters.data.hasPopup ||
                          parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, /* ignoreBorder = */ true);
  }

  /**
   * Render the squiggly annotation's HTML element in the empty container.
   *
   * @public
   * @memberof SquigglyAnnotationElement
   * @returns {HTMLSectionElement}
   */
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
    let isRenderable = !!(parameters.data.hasPopup ||
                          parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, /* ignoreBorder = */ true);
  }

  /**
   * Render the strikeout annotation's HTML element in the empty container.
   *
   * @public
   * @memberof StrikeOutAnnotationElement
   * @returns {HTMLSectionElement}
   */
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
    let isRenderable = !!(parameters.data.hasPopup ||
                          parameters.data.title || parameters.data.contents);
    super(parameters, isRenderable, /* ignoreBorder = */ true);
  }

  /**
   * Render the stamp annotation's HTML element in the empty container.
   *
   * @public
   * @memberof StampAnnotationElement
   * @returns {HTMLSectionElement}
   */
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
    super(parameters, /* isRenderable = */ true);

    let file = this.data.file;
    this.filename = getFilenameFromUrl(file.filename);
    this.content = file.content;

    this.linkService.onFileAttachmentAnnotation({
      id: stringToPDFString(file.filename),
      filename: file.filename,
      content: file.content,
    });
  }

  /**
   * Render the file attachment annotation's HTML element in the empty
   * container.
   *
   * @public
   * @memberof FileAttachmentAnnotationElement
   * @returns {HTMLSectionElement}
   */
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

  /**
   * Download the file attachment associated with this annotation.
   *
   * @private
   * @memberof FileAttachmentAnnotationElement
   */
  _download() {
    if (!this.downloadManager) {
      warn('Download cannot be started due to unavailable download manager');
      return;
    }
    this.downloadManager.downloadData(this.content, this.filename, '');
  }
}

/**
 * @typedef {Object} AnnotationLayerParameters
 * @property {PageViewport} viewport
 * @property {HTMLDivElement} div
 * @property {Array} annotations
 * @property {PDFPage} page
 * @property {IPDFLinkService} linkService
 * @property {string} imageResourcesPath
 * @property {boolean} renderInteractiveForms
 */

class AnnotationLayer {
  /**
   * Render a new annotation layer with all annotation elements.
   *
   * @public
   * @param {AnnotationLayerParameters} parameters
   * @memberof AnnotationLayer
   */
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
        imageResourcesPath: parameters.imageResourcesPath ||
                            getDefaultSetting('imageResourcesPath'),
        renderInteractiveForms: parameters.renderInteractiveForms || false,
        svgFactory: new DOMSVGFactory(),
      });
      if (element.isRenderable) {
        parameters.div.appendChild(element.render());
      }
    }
  }

  /**
   * Update the annotation elements on existing annotation layer.
   *
   * @public
   * @param {AnnotationLayerParameters} parameters
   * @memberof AnnotationLayer
   */
  static update(parameters) {
    for (let i = 0, ii = parameters.annotations.length; i < ii; i++) {
      let data = parameters.annotations[i];
      let element = parameters.div.querySelector(
        '[data-annotation-id="' + data.id + '"]');
      if (element) {
        element.style.transform =
          'matrix(' + parameters.viewport.transform.join(',') + ')';
      }
    }
    parameters.div.removeAttribute('hidden');
  }
}

export {
  AnnotationLayer,
};
