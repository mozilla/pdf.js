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
/* globals PDFJS, Util, AnnotationType */

'use strict';

var HIGHLIGHT_OFFSET = 4; // px
var ANNOT_MIN_SIZE = 10; // px

var AnnotationUtils = (function AnnotationUtilsClosure() {
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

  // TODO(mack): Remove this, it's not really that helpful.
  function getEmptyContainer(tagName, rect, borderWidth) {
    var bWidth = borderWidth || 0;
    var element = document.createElement(tagName);
    element.style.borderWidth = bWidth + 'px';
    var width = rect[2] - rect[0] - 2 * bWidth;
    var height = rect[3] - rect[1] - 2 * bWidth;
    element.style.width = width + 'px';
    element.style.height = height + 'px';
    return element;
  }

  function initContainer(item) {
    var container = getEmptyContainer('section', item.rect, item.borderWidth);
    container.style.backgroundColor = item.color;

    var color = item.color;
    var rgb = [];
    for (var i = 0; i < 3; ++i) {
      rgb[i] = Math.round(color[i] * 255);
    }
    item.colorCssRgb = Util.makeCssRgb(rgb);

    var highlight = document.createElement('div');
    highlight.className = 'annotationHighlight';
    highlight.style.left = highlight.style.top = -HIGHLIGHT_OFFSET + 'px';
    highlight.style.right = highlight.style.bottom = -HIGHLIGHT_OFFSET + 'px';
    highlight.setAttribute('hidden', true);

    item.highlightElement = highlight;
    container.appendChild(item.highlightElement);

    return container;
  }

  function getHtmlElementForTextWidgetAnnotation(item, commonObjs) {
    var element = getEmptyContainer('div', item.rect, 0);
    element.style.display = 'table';

    var content = document.createElement('div');
    content.textContent = item.fieldValue;
    var textAlignment = item.textAlignment;
    content.style.textAlign = ['left', 'center', 'right'][textAlignment];
    content.style.verticalAlign = 'middle';
    content.style.display = 'table-cell';

    var fontObj = item.fontRefName ?
      commonObjs.getData(item.fontRefName) : null;
    setTextStyles(content, item, fontObj);

    element.appendChild(content);

    return element;
  }

  function getHtmlElementForTextAnnotation(item) {
    var rect = item.rect;

    // sanity check because of OOo-generated PDFs
    if ((rect[3] - rect[1]) < ANNOT_MIN_SIZE) {
      rect[3] = rect[1] + ANNOT_MIN_SIZE;
    }
    if ((rect[2] - rect[0]) < ANNOT_MIN_SIZE) {
      rect[2] = rect[0] + (rect[3] - rect[1]); // make it square
    }

    var container = initContainer(item);
    container.className = 'annotText';

    var image  = document.createElement('img');
    image.style.height = container.style.height;
    image.style.width = container.style.width;
    var iconName = item.name;
    image.src = PDFJS.imageResourcesPath + 'annotation-' +
      iconName.toLowerCase() + '.svg';
    image.alt = '[{{type}} Annotation]';
    image.dataset.l10nId = 'text_annotation_type';
    image.dataset.l10nArgs = JSON.stringify({type: iconName});

    var contentWrapper = document.createElement('div');
    contentWrapper.className = 'annotTextContentWrapper';
    contentWrapper.style.left = Math.floor(rect[2] - rect[0] + 5) + 'px';
    contentWrapper.style.top = '-10px';

    var content = document.createElement('div');
    content.className = 'annotTextContent';
    content.setAttribute('hidden', true);

    var i, ii;
    if (item.hasBgColor) {
      var color = item.color;
      var rgb = [];
      for (i = 0; i < 3; ++i) {
        // Enlighten the color (70%)
        var c = Math.round(color[i] * 255);
        rgb[i] = Math.round((255 - c) * 0.7) + c;
      }
      content.style.backgroundColor = Util.makeCssRgb(rgb);
    }

    var title = document.createElement('h1');
    var text = document.createElement('p');
    title.textContent = item.title;

    if (!item.content && !item.title) {
      content.setAttribute('hidden', true);
    } else {
      var e = document.createElement('span');
      var lines = item.content.split(/(?:\r\n?|\n)/);
      for (i = 0, ii = lines.length; i < ii; ++i) {
        var line = lines[i];
        e.appendChild(document.createTextNode(line));
        if (i < (ii - 1)) {
          e.appendChild(document.createElement('br'));
        }
      }
      text.appendChild(e);

      var pinned = false;

      var showAnnotation = function showAnnotation(pin) {
        if (pin) {
          pinned = true;
        }
        if (content.hasAttribute('hidden')) {
          container.style.zIndex += 1;
          content.removeAttribute('hidden');
        }
      };

      var hideAnnotation = function hideAnnotation(unpin) {
        if (unpin) {
          pinned = false;
        }
        if (!content.hasAttribute('hidden') && !pinned) {
          container.style.zIndex -= 1;
          content.setAttribute('hidden', true);
        }
      };

      var toggleAnnotation = function toggleAnnotation() {
        if (pinned) {
          hideAnnotation(true);
        } else {
          showAnnotation(true);
        }
      };

      image.addEventListener('click', function image_clickHandler() {
        toggleAnnotation();
      }, false);
      image.addEventListener('mouseover', function image_mouseOverHandler() {
        showAnnotation();
      }, false);
      image.addEventListener('mouseout', function image_mouseOutHandler() {
        hideAnnotation();
      }, false);

      content.addEventListener('click', function content_clickHandler() {
        hideAnnotation(true);
      }, false);
    }

    content.appendChild(title);
    content.appendChild(text);
    contentWrapper.appendChild(content);
    container.appendChild(image);
    container.appendChild(contentWrapper);

    return container;
  }

  function getHtmlElementForLinkAnnotation(item) {
    var container = initContainer(item);
    container.className = 'annotLink';

    container.style.borderColor = item.colorCssRgb;
    container.style.borderStyle = 'solid';

    var link = document.createElement('a');
    link.href = link.title = item.url || '';

    container.appendChild(link);

    return container;
  }

  function getHtmlElement(data, objs) {
    switch (data.annotationType) {
      case AnnotationType.WIDGET:
        return getHtmlElementForTextWidgetAnnotation(data, objs);
      case AnnotationType.TEXT:
        return getHtmlElementForTextAnnotation(data);
      case AnnotationType.LINK:
        return getHtmlElementForLinkAnnotation(data);
      default:
        throw new Error('Unsupported annotationType: ' + data.annotationType);
    }
  }

  return {
    getHtmlElement: getHtmlElement
  };
})();
PDFJS.AnnotationUtils = AnnotationUtils;
