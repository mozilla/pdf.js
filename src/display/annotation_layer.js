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
  addLinkAttributes, CustomStyle, getDefaultSetting, getFilenameFromUrl,
  LinkTarget
} from './dom_utils';
import {
  AnnotationBorderStyleType, AnnotationType, stringToPDFString, Util, warn
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
 */

/**
 * @class
 * @alias AnnotationElementFactory
 */
function AnnotationElementFactory() {}
AnnotationElementFactory.prototype =
    /** @lends AnnotationElementFactory.prototype */ {
  /**
   * @param {AnnotationElementParameters} parameters
   * @returns {AnnotationElement}
   */
  create: function AnnotationElementFactory_create(parameters) {
    var subtype = parameters.data.annotationType;

    switch (subtype) {
      case AnnotationType.LINK:
        return new LinkAnnotationElement(parameters);

      case AnnotationType.TEXT:
        return new TextAnnotationElement(parameters);

      case AnnotationType.WIDGET:
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
            warn('Unimplemented button widget annotation: pushbutton');
            break;
          case 'Ch':
            return new ChoiceWidgetAnnotationElement(parameters);
        }
        return new WidgetAnnotationElement(parameters);

      case AnnotationType.POPUP:
        return new PopupAnnotationElement(parameters);

      case AnnotationType.LINE:
        return new LineAnnotationElement(parameters);

      case AnnotationType.HIGHLIGHT:
        return new HighlightAnnotationElement(parameters);

      case AnnotationType.UNDERLINE:
        return new UnderlineAnnotationElement(parameters);

      case AnnotationType.SQUIGGLY:
        return new SquigglyAnnotationElement(parameters);

      case AnnotationType.STRIKEOUT:
        return new StrikeOutAnnotationElement(parameters);

      case AnnotationType.FILEATTACHMENT:
        return new FileAttachmentAnnotationElement(parameters);

      default:
        return new AnnotationElement(parameters);
    }
  },
};

/**
 * @class
 * @alias AnnotationElement
 */
var AnnotationElement = (function AnnotationElementClosure() {
  function AnnotationElement(parameters, isRenderable, ignoreBorder) {
    this.isRenderable = isRenderable || false;
    this.data = parameters.data;
    this.layer = parameters.layer;
    this.page = parameters.page;
    this.viewport = parameters.viewport;
    this.linkService = parameters.linkService;
    this.downloadManager = parameters.downloadManager;
    this.imageResourcesPath = parameters.imageResourcesPath;
    this.renderInteractiveForms = parameters.renderInteractiveForms;

    if (isRenderable) {
      this.container = this._createContainer(ignoreBorder);
    }
  }

  AnnotationElement.prototype = /** @lends AnnotationElement.prototype */ {
    /**
     * Create an empty container for the annotation's HTML element.
     *
     * @private
     * @param {boolean} ignoreBorder
     * @memberof AnnotationElement
     * @returns {HTMLSectionElement}
     */
    _createContainer:
        function AnnotationElement_createContainer(ignoreBorder) {
      var data = this.data, page = this.page, viewport = this.viewport;
      var container = document.createElement('section');
      var width = data.rect[2] - data.rect[0];
      var height = data.rect[3] - data.rect[1];

      container.setAttribute('data-annotation-id', data.id);

      // Do *not* modify `data.rect`, since that will corrupt the annotation
      // position on subsequent calls to `_createContainer` (see issue 6804).
      var rect = Util.normalizeRect([
        data.rect[0],
        page.view[3] - data.rect[1] + page.view[1],
        data.rect[2],
        page.view[3] - data.rect[3] + page.view[1]
      ]);

      CustomStyle.setProp('transform', container,
                          'matrix(' + viewport.transform.join(',') + ')');
      CustomStyle.setProp('transformOrigin', container,
                          -rect[0] + 'px ' + -rect[1] + 'px');

      if (!ignoreBorder && data.borderStyle.width > 0) {
        container.style.borderWidth = data.borderStyle.width + 'px';
        if (data.borderStyle.style !== AnnotationBorderStyleType.UNDERLINE) {
          // Underline styles only have a bottom border, so we do not need
          // to adjust for all borders. This yields a similar result as
          // Adobe Acrobat/Reader.
          width = width - 2 * data.borderStyle.width;
          height = height - 2 * data.borderStyle.width;
        }

        var horizontalRadius = data.borderStyle.horizontalCornerRadius;
        var verticalRadius = data.borderStyle.verticalCornerRadius;
        if (horizontalRadius > 0 || verticalRadius > 0) {
          var radius = horizontalRadius + 'px / ' + verticalRadius + 'px';
          CustomStyle.setProp('borderRadius', container, radius);
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
          container.style.borderColor =
            Util.makeCssRgb(data.color[0] | 0,
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
    },

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
    _createPopup:
        function AnnotationElement_createPopup(container, trigger, data) {
      // If no trigger element is specified, create it.
      if (!trigger) {
        trigger = document.createElement('div');
        trigger.style.height = container.style.height;
        trigger.style.width = container.style.width;
        container.appendChild(trigger);
      }

      var popupElement = new PopupElement({
        container,
        trigger,
        color: data.color,
        title: data.title,
        contents: data.contents,
        hideWrapper: true,
      });
      var popup = popupElement.render();

      // Position the popup next to the annotation's container.
      popup.style.left = container.style.width;

      container.appendChild(popup);
    },

    /**
     * Render the annotation's HTML element in the empty container.
     *
     * @public
     * @memberof AnnotationElement
     */
    render: function AnnotationElement_render() {
      throw new Error('Abstract method AnnotationElement.render called');
    },
  };

  return AnnotationElement;
})();

/**
 * @class
 * @alias LinkAnnotationElement
 */
var LinkAnnotationElement = (function LinkAnnotationElementClosure() {
  function LinkAnnotationElement(parameters) {
    AnnotationElement.call(this, parameters, true);
  }

  Util.inherit(LinkAnnotationElement, AnnotationElement, {
    /**
     * Render the link annotation's HTML element in the empty container.
     *
     * @public
     * @memberof LinkAnnotationElement
     * @returns {HTMLSectionElement}
     */
    render: function LinkAnnotationElement_render() {
      this.container.className = 'linkAnnotation';

      var link = document.createElement('a');
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
    },

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
    },

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
    },
  });

  return LinkAnnotationElement;
})();

/**
 * @class
 * @alias TextAnnotationElement
 */
var TextAnnotationElement = (function TextAnnotationElementClosure() {
  function TextAnnotationElement(parameters) {
    var isRenderable = !!(parameters.data.hasPopup ||
                          parameters.data.title || parameters.data.contents);
    AnnotationElement.call(this, parameters, isRenderable);
  }

  Util.inherit(TextAnnotationElement, AnnotationElement, {
    /**
     * Render the text annotation's HTML element in the empty container.
     *
     * @public
     * @memberof TextAnnotationElement
     * @returns {HTMLSectionElement}
     */
    render: function TextAnnotationElement_render() {
      this.container.className = 'textAnnotation';

      var image = document.createElement('img');
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
    },
  });

  return TextAnnotationElement;
})();

/**
 * @class
 * @alias WidgetAnnotationElement
 */
var WidgetAnnotationElement = (function WidgetAnnotationElementClosure() {
  function WidgetAnnotationElement(parameters, isRenderable) {
    AnnotationElement.call(this, parameters, isRenderable);
  }

  Util.inherit(WidgetAnnotationElement, AnnotationElement, {
    /**
     * Render the widget annotation's HTML element in the empty container.
     *
     * @public
     * @memberof WidgetAnnotationElement
     * @returns {HTMLSectionElement}
     */
    render: function WidgetAnnotationElement_render() {
      // Show only the container for unsupported field types.
      return this.container;
    },
  });

  return WidgetAnnotationElement;
})();

/**
 * @class
 * @alias TextWidgetAnnotationElement
 */
var TextWidgetAnnotationElement = (
    function TextWidgetAnnotationElementClosure() {
  var TEXT_ALIGNMENT = ['left', 'center', 'right'];

  function TextWidgetAnnotationElement(parameters) {
    var isRenderable = parameters.renderInteractiveForms ||
      (!parameters.data.hasAppearance && !!parameters.data.fieldValue);
    WidgetAnnotationElement.call(this, parameters, isRenderable);
  }

  Util.inherit(TextWidgetAnnotationElement, WidgetAnnotationElement, {
    /**
     * Render the text widget annotation's HTML element in the empty container.
     *
     * @public
     * @memberof TextWidgetAnnotationElement
     * @returns {HTMLSectionElement}
     */
    render: function TextWidgetAnnotationElement_render() {
      this.container.className = 'textWidgetAnnotation';

      var element = null;
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
    },

    /**
     * Apply text styles to the text in the element.
     *
     * @private
     * @param {HTMLDivElement} element
     * @param {Object} font
     * @memberof TextWidgetAnnotationElement
     */
    _setTextStyle:
        function TextWidgetAnnotationElement_setTextStyle(element, font) {
      // TODO: This duplicates some of the logic in CanvasGraphics.setFont().
      var style = element.style;
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
      var fontFamily = font.loadedName ? '"' + font.loadedName + '", ' : '';
      var fallbackName = font.fallbackName || 'Helvetica, sans-serif';
      style.fontFamily = fontFamily + fallbackName;
    },
  });

  return TextWidgetAnnotationElement;
})();

/**
 * @class
 * @alias CheckboxWidgetAnnotationElement
 */
var CheckboxWidgetAnnotationElement =
    (function CheckboxWidgetAnnotationElementClosure() {
  function CheckboxWidgetAnnotationElement(parameters) {
    WidgetAnnotationElement.call(this, parameters,
                                 parameters.renderInteractiveForms);
  }

  Util.inherit(CheckboxWidgetAnnotationElement, WidgetAnnotationElement, {
    /**
     * Render the checkbox widget annotation's HTML element
     * in the empty container.
     *
     * @public
     * @memberof CheckboxWidgetAnnotationElement
     * @returns {HTMLSectionElement}
     */
    render: function CheckboxWidgetAnnotationElement_render() {
      this.container.className = 'buttonWidgetAnnotation checkBox';

      var element = document.createElement('input');
      element.disabled = this.data.readOnly;
      element.type = 'checkbox';
      if (this.data.fieldValue && this.data.fieldValue !== 'Off') {
        element.setAttribute('checked', true);
      }

      this.container.appendChild(element);
      return this.container;
    },
  });

  return CheckboxWidgetAnnotationElement;
})();

/**
 * @class
 * @alias RadioButtonWidgetAnnotationElement
 */
var RadioButtonWidgetAnnotationElement =
    (function RadioButtonWidgetAnnotationElementClosure() {
  function RadioButtonWidgetAnnotationElement(parameters) {
    WidgetAnnotationElement.call(this, parameters,
                                 parameters.renderInteractiveForms);
  }

  Util.inherit(RadioButtonWidgetAnnotationElement, WidgetAnnotationElement, {
    /**
     * Render the radio button widget annotation's HTML element
     * in the empty container.
     *
     * @public
     * @memberof RadioButtonWidgetAnnotationElement
     * @returns {HTMLSectionElement}
     */
    render: function RadioButtonWidgetAnnotationElement_render() {
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
    },
  });

  return RadioButtonWidgetAnnotationElement;
})();

 /**
 * @class
 * @alias ChoiceWidgetAnnotationElement
 */
var ChoiceWidgetAnnotationElement = (
    function ChoiceWidgetAnnotationElementClosure() {
  function ChoiceWidgetAnnotationElement(parameters) {
    WidgetAnnotationElement.call(this, parameters,
                                 parameters.renderInteractiveForms);
  }

  Util.inherit(ChoiceWidgetAnnotationElement, WidgetAnnotationElement, {
    /**
     * Render the choice widget annotation's HTML element in the empty
     * container.
     *
     * @public
     * @memberof ChoiceWidgetAnnotationElement
     * @returns {HTMLSectionElement}
     */
    render: function ChoiceWidgetAnnotationElement_render() {
      this.container.className = 'choiceWidgetAnnotation';

      var selectElement = document.createElement('select');
      selectElement.disabled = this.data.readOnly;

      if (!this.data.combo) {
        // List boxes have a size and (optionally) multiple selection.
        selectElement.size = this.data.options.length;

        if (this.data.multiSelect) {
          selectElement.multiple = true;
        }
      }

      // Insert the options into the choice field.
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
    },
  });

  return ChoiceWidgetAnnotationElement;
})();

/**
 * @class
 * @alias PopupAnnotationElement
 */
var PopupAnnotationElement = (function PopupAnnotationElementClosure() {
  // Do not render popup annotations for parent elements with these types as
  // they create the popups themselves (because of custom trigger divs).
  var IGNORE_TYPES = ['Line'];

  function PopupAnnotationElement(parameters) {
    var isRenderable = !!(parameters.data.title || parameters.data.contents);
    AnnotationElement.call(this, parameters, isRenderable);
  }

  Util.inherit(PopupAnnotationElement, AnnotationElement, {
    /**
     * Render the popup annotation's HTML element in the empty container.
     *
     * @public
     * @memberof PopupAnnotationElement
     * @returns {HTMLSectionElement}
     */
    render: function PopupAnnotationElement_render() {
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
        contents: this.data.contents,
      });

      // Position the popup next to the parent annotation's container.
      // PDF viewers ignore a popup annotation's rectangle.
      var parentLeft = parseFloat(parentElement.style.left);
      var parentWidth = parseFloat(parentElement.style.width);
      CustomStyle.setProp('transformOrigin', this.container,
                          -(parentLeft + parentWidth) + 'px -' +
                          parentElement.style.top);
      this.container.style.left = (parentLeft + parentWidth) + 'px';

      this.container.appendChild(popup.render());
      return this.container;
    },
  });

  return PopupAnnotationElement;
})();

/**
 * @class
 * @alias PopupElement
 */
var PopupElement = (function PopupElementClosure() {
  var BACKGROUND_ENLIGHT = 0.7;

  function PopupElement(parameters) {
    this.container = parameters.container;
    this.trigger = parameters.trigger;
    this.color = parameters.color;
    this.title = parameters.title;
    this.contents = parameters.contents;
    this.hideWrapper = parameters.hideWrapper || false;

    this.pinned = false;
  }

  PopupElement.prototype = /** @lends PopupElement.prototype */ {
    /**
     * Render the popup's HTML element.
     *
     * @public
     * @memberof PopupElement
     * @returns {HTMLSectionElement}
     */
    render: function PopupElement_render() {
      var wrapper = document.createElement('div');
      wrapper.className = 'popupWrapper';

      // For Popup annotations we hide the entire section because it contains
      // only the popup. However, for Text annotations without a separate Popup
      // annotation, we cannot hide the entire container as the image would
      // disappear too. In that special case, hiding the wrapper suffices.
      this.hideElement = (this.hideWrapper ? wrapper : this.container);
      this.hideElement.setAttribute('hidden', true);

      var popup = document.createElement('div');
      popup.className = 'popup';

      var color = this.color;
      if (color) {
        // Enlighten the color.
        var r = BACKGROUND_ENLIGHT * (255 - color[0]) + color[0];
        var g = BACKGROUND_ENLIGHT * (255 - color[1]) + color[1];
        var b = BACKGROUND_ENLIGHT * (255 - color[2]) + color[2];
        popup.style.backgroundColor = Util.makeCssRgb(r | 0, g | 0, b | 0);
      }

      var contents = this._formatContents(this.contents);
      var title = document.createElement('h1');
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
    },

    /**
     * Format the contents of the popup by adding newlines where necessary.
     *
     * @private
     * @param {string} contents
     * @memberof PopupElement
     * @returns {HTMLParagraphElement}
     */
    _formatContents: function PopupElement_formatContents(contents) {
      var p = document.createElement('p');
      var lines = contents.split(/(?:\r\n?|\n)/);
      for (var i = 0, ii = lines.length; i < ii; ++i) {
        var line = lines[i];
        p.appendChild(document.createTextNode(line));
        if (i < (ii - 1)) {
          p.appendChild(document.createElement('br'));
        }
      }
      return p;
    },

    /**
     * Toggle the visibility of the popup.
     *
     * @private
     * @memberof PopupElement
     */
    _toggle: function PopupElement_toggle() {
      if (this.pinned) {
        this._hide(true);
      } else {
        this._show(true);
      }
    },

    /**
     * Show the popup.
     *
     * @private
     * @param {boolean} pin
     * @memberof PopupElement
     */
    _show: function PopupElement_show(pin) {
      if (pin) {
        this.pinned = true;
      }
      if (this.hideElement.hasAttribute('hidden')) {
        this.hideElement.removeAttribute('hidden');
        this.container.style.zIndex += 1;
      }
    },

    /**
     * Hide the popup.
     *
     * @private
     * @param {boolean} unpin
     * @memberof PopupElement
     */
    _hide: function PopupElement_hide(unpin) {
      if (unpin) {
        this.pinned = false;
      }
      if (!this.hideElement.hasAttribute('hidden') && !this.pinned) {
        this.hideElement.setAttribute('hidden', true);
        this.container.style.zIndex -= 1;
      }
    },
  };

  return PopupElement;
})();

/**
 * @class
 * @alias LineAnnotationElement
 */
var LineAnnotationElement = (function LineAnnotationElementClosure() {
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function LineAnnotationElement(parameters) {
    var isRenderable = !!(parameters.data.hasPopup ||
                          parameters.data.title || parameters.data.contents);
    AnnotationElement.call(this, parameters, isRenderable,
                           /* ignoreBorder = */ true);
  }

  Util.inherit(LineAnnotationElement, AnnotationElement, {
    /**
     * Render the line annotation's HTML element in the empty container.
     *
     * @public
     * @memberof LineAnnotationElement
     * @returns {HTMLSectionElement}
     */
    render: function LineAnnotationElement_render() {
      this.container.className = 'lineAnnotation';

      // Create an invisible line with the same starting and ending coordinates
      // that acts as the trigger for the popup. Only the line itself should
      // trigger the popup, not the entire container.
      var data = this.data;
      var width = data.rect[2] - data.rect[0];
      var height = data.rect[3] - data.rect[1];

      var svg = document.createElementNS(SVG_NS, 'svg:svg');
      svg.setAttributeNS(null, 'version', '1.1');
      svg.setAttributeNS(null, 'width', width + 'px');
      svg.setAttributeNS(null, 'height', height + 'px');
      svg.setAttributeNS(null, 'preserveAspectRatio', 'none');
      svg.setAttributeNS(null, 'viewBox', '0 0 ' + width + ' ' + height);

      // PDF coordinates are calculated from a bottom left origin, so transform
      // the line coordinates to a top left origin for the SVG element.
      var line = document.createElementNS(SVG_NS, 'svg:line');
      line.setAttributeNS(null, 'x1', data.rect[2] - data.lineCoordinates[0]);
      line.setAttributeNS(null, 'y1', data.rect[3] - data.lineCoordinates[1]);
      line.setAttributeNS(null, 'x2', data.rect[2] - data.lineCoordinates[2]);
      line.setAttributeNS(null, 'y2', data.rect[3] - data.lineCoordinates[3]);
      line.setAttributeNS(null, 'stroke-width', data.borderStyle.width);
      line.setAttributeNS(null, 'stroke', 'transparent');

      svg.appendChild(line);
      this.container.append(svg);

      // Create the popup ourselves so that we can bind it to the line instead
      // of to the entire container (which is the default).
      this._createPopup(this.container, line, this.data);

      return this.container;
    },
  });

  return LineAnnotationElement;
})();

/**
 * @class
 * @alias HighlightAnnotationElement
 */
var HighlightAnnotationElement = (
    function HighlightAnnotationElementClosure() {
  function HighlightAnnotationElement(parameters) {
    var isRenderable = !!(parameters.data.hasPopup ||
                          parameters.data.title || parameters.data.contents);
    AnnotationElement.call(this, parameters, isRenderable,
                           /* ignoreBorder = */ true);
  }

  Util.inherit(HighlightAnnotationElement, AnnotationElement, {
    /**
     * Render the highlight annotation's HTML element in the empty container.
     *
     * @public
     * @memberof HighlightAnnotationElement
     * @returns {HTMLSectionElement}
     */
    render: function HighlightAnnotationElement_render() {
      this.container.className = 'highlightAnnotation';

      if (!this.data.hasPopup) {
        this._createPopup(this.container, null, this.data);
      }
      return this.container;
    },
  });

  return HighlightAnnotationElement;
})();

/**
 * @class
 * @alias UnderlineAnnotationElement
 */
var UnderlineAnnotationElement = (
    function UnderlineAnnotationElementClosure() {
  function UnderlineAnnotationElement(parameters) {
    var isRenderable = !!(parameters.data.hasPopup ||
                          parameters.data.title || parameters.data.contents);
    AnnotationElement.call(this, parameters, isRenderable,
                           /* ignoreBorder = */ true);
  }

  Util.inherit(UnderlineAnnotationElement, AnnotationElement, {
    /**
     * Render the underline annotation's HTML element in the empty container.
     *
     * @public
     * @memberof UnderlineAnnotationElement
     * @returns {HTMLSectionElement}
     */
    render: function UnderlineAnnotationElement_render() {
      this.container.className = 'underlineAnnotation';

      if (!this.data.hasPopup) {
        this._createPopup(this.container, null, this.data);
      }
      return this.container;
    },
  });

  return UnderlineAnnotationElement;
})();

/**
 * @class
 * @alias SquigglyAnnotationElement
 */
var SquigglyAnnotationElement = (function SquigglyAnnotationElementClosure() {
  function SquigglyAnnotationElement(parameters) {
    var isRenderable = !!(parameters.data.hasPopup ||
                          parameters.data.title || parameters.data.contents);
    AnnotationElement.call(this, parameters, isRenderable,
                           /* ignoreBorder = */ true);
  }

  Util.inherit(SquigglyAnnotationElement, AnnotationElement, {
    /**
     * Render the squiggly annotation's HTML element in the empty container.
     *
     * @public
     * @memberof SquigglyAnnotationElement
     * @returns {HTMLSectionElement}
     */
    render: function SquigglyAnnotationElement_render() {
      this.container.className = 'squigglyAnnotation';

      if (!this.data.hasPopup) {
        this._createPopup(this.container, null, this.data);
      }
      return this.container;
    },
  });

  return SquigglyAnnotationElement;
})();

/**
 * @class
 * @alias StrikeOutAnnotationElement
 */
var StrikeOutAnnotationElement = (
    function StrikeOutAnnotationElementClosure() {
  function StrikeOutAnnotationElement(parameters) {
    var isRenderable = !!(parameters.data.hasPopup ||
                          parameters.data.title || parameters.data.contents);
    AnnotationElement.call(this, parameters, isRenderable,
                           /* ignoreBorder = */ true);
  }

  Util.inherit(StrikeOutAnnotationElement, AnnotationElement, {
    /**
     * Render the strikeout annotation's HTML element in the empty container.
     *
     * @public
     * @memberof StrikeOutAnnotationElement
     * @returns {HTMLSectionElement}
     */
    render: function StrikeOutAnnotationElement_render() {
      this.container.className = 'strikeoutAnnotation';

      if (!this.data.hasPopup) {
        this._createPopup(this.container, null, this.data);
      }
      return this.container;
    },
  });

  return StrikeOutAnnotationElement;
})();

/**
 * @class
 * @alias FileAttachmentAnnotationElement
 */
var FileAttachmentAnnotationElement = (
    function FileAttachmentAnnotationElementClosure() {
  function FileAttachmentAnnotationElement(parameters) {
    AnnotationElement.call(this, parameters, true);

    var file = this.data.file;
    this.filename = getFilenameFromUrl(file.filename);
    this.content = file.content;

    this.linkService.onFileAttachmentAnnotation({
      id: stringToPDFString(file.filename),
      filename: file.filename,
      content: file.content,
    });
  }

  Util.inherit(FileAttachmentAnnotationElement, AnnotationElement, {
    /**
     * Render the file attachment annotation's HTML element in the empty
     * container.
     *
     * @public
     * @memberof FileAttachmentAnnotationElement
     * @returns {HTMLSectionElement}
     */
    render: function FileAttachmentAnnotationElement_render() {
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
    },

    /**
     * Download the file attachment associated with this annotation.
     *
     * @private
     * @memberof FileAttachmentAnnotationElement
     */
    _download: function FileAttachmentAnnotationElement_download() {
      if (!this.downloadManager) {
        warn('Download cannot be started due to unavailable download manager');
        return;
      }
      this.downloadManager.downloadData(this.content, this.filename, '');
    },
  });

  return FileAttachmentAnnotationElement;
})();

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

/**
 * @class
 * @alias AnnotationLayer
 */
var AnnotationLayer = (function AnnotationLayerClosure() {
  return {
    /**
     * Render a new annotation layer with all annotation elements.
     *
     * @public
     * @param {AnnotationLayerParameters} parameters
     * @memberof AnnotationLayer
     */
    render: function AnnotationLayer_render(parameters) {
      var annotationElementFactory = new AnnotationElementFactory();

      for (var i = 0, ii = parameters.annotations.length; i < ii; i++) {
        var data = parameters.annotations[i];
        if (!data) {
          continue;
        }
        var element = annotationElementFactory.create({
          data,
          layer: parameters.div,
          page: parameters.page,
          viewport: parameters.viewport,
          linkService: parameters.linkService,
          downloadManager: parameters.downloadManager,
          imageResourcesPath: parameters.imageResourcesPath ||
                              getDefaultSetting('imageResourcesPath'),
          renderInteractiveForms: parameters.renderInteractiveForms || false,
        });
        if (element.isRenderable) {
          parameters.div.appendChild(element.render());
        }
      }
    },

    /**
     * Update the annotation elements on existing annotation layer.
     *
     * @public
     * @param {AnnotationLayerParameters} parameters
     * @memberof AnnotationLayer
     */
    update: function AnnotationLayer_update(parameters) {
      for (var i = 0, ii = parameters.annotations.length; i < ii; i++) {
        var data = parameters.annotations[i];
        var element = parameters.div.querySelector(
          '[data-annotation-id="' + data.id + '"]');
        if (element) {
          CustomStyle.setProp('transform', element,
            'matrix(' + parameters.viewport.transform.join(',') + ')');
        }
      }
      parameters.div.removeAttribute('hidden');
    },
  };
})();

export {
  AnnotationLayer,
};
