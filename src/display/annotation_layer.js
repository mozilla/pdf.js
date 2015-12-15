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
/* globals PDFJS, Util, AnnotationType, AnnotationBorderStyleType, warn,
           CustomStyle, isExternalLinkTargetSet, LinkTargetStringMap */

'use strict';

var ANNOT_MIN_SIZE = 10; // px

var AnnotationLayer = (function AnnotationLayerClosure() {
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

  function getContainer(data, page, viewport) {
    var container = document.createElement('section');
    var width = data.rect[2] - data.rect[0];
    var height = data.rect[3] - data.rect[1];

    container.setAttribute('data-annotation-id', data.id);

    data.rect = Util.normalizeRect([
      data.rect[0],
      page.view[3] - data.rect[1] + page.view[1],
      data.rect[2],
      page.view[3] - data.rect[3] + page.view[1]
    ]);

    CustomStyle.setProp('transform', container,
                        'matrix(' + viewport.transform.join(',') + ')');
    CustomStyle.setProp('transformOrigin', container,
                        -data.rect[0] + 'px ' + -data.rect[1] + 'px');

    if (data.borderStyle.width > 0) {
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

    container.style.left = data.rect[0] + 'px';
    container.style.top = data.rect[1] + 'px';

    container.style.width = width + 'px';
    container.style.height = height + 'px';

    return container;
  }

  function getHtmlElementForTextWidgetAnnotation(item, page) {
    var element = document.createElement('div');
    var width = item.rect[2] - item.rect[0];
    var height = item.rect[3] - item.rect[1];
    element.style.width = width + 'px';
    element.style.height = height + 'px';
    element.style.display = 'table';

    var content = document.createElement('div');
    content.textContent = item.fieldValue;
    var textAlignment = item.textAlignment;
    content.style.textAlign = ['left', 'center', 'right'][textAlignment];
    content.style.verticalAlign = 'middle';
    content.style.display = 'table-cell';

    var fontObj = item.fontRefName ?
      page.commonObjs.getData(item.fontRefName) : null;
    setTextStyles(content, item, fontObj);

    element.appendChild(content);

    return element;
  }

  function getHtmlElementForTextAnnotation(item, page, viewport) {
    var rect = item.rect;

    // sanity check because of OOo-generated PDFs
    if ((rect[3] - rect[1]) < ANNOT_MIN_SIZE) {
      rect[3] = rect[1] + ANNOT_MIN_SIZE;
    }
    if ((rect[2] - rect[0]) < ANNOT_MIN_SIZE) {
      rect[2] = rect[0] + (rect[3] - rect[1]); // make it square
    }

    var container = getContainer(item, page, viewport);
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
    if (item.hasBgColor && item.color) {
      var color = item.color;

      // Enlighten the color (70%)
      var BACKGROUND_ENLIGHT = 0.7;
      var r = BACKGROUND_ENLIGHT * (255 - color[0]) + color[0];
      var g = BACKGROUND_ENLIGHT * (255 - color[1]) + color[1];
      var b = BACKGROUND_ENLIGHT * (255 - color[2]) + color[2];
      content.style.backgroundColor = Util.makeCssRgb(r | 0, g | 0, b | 0);
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

  function getHtmlElementForLinkAnnotation(item, page, viewport, linkService) {
    function bindLink(link, dest) {
      link.href = linkService.getDestinationHash(dest);
      link.onclick = function annotationsLayerBuilderLinksOnclick() {
        if (dest) {
          linkService.navigateTo(dest);
        }
        return false;
      };
      if (dest) {
        link.className = 'internalLink';
      }
    }

    function bindNamedAction(link, action) {
      link.href = linkService.getAnchorUrl('');
      link.onclick = function annotationsLayerBuilderNamedActionOnClick() {
        linkService.executeNamedAction(action);
        return false;
      };
      link.className = 'internalLink';
    }

    var container = getContainer(item, page, viewport);
    container.className = 'annotLink';

    var link = document.createElement('a');
    link.href = link.title = item.url || '';

    if (item.url && isExternalLinkTargetSet()) {
      link.target = LinkTargetStringMap[PDFJS.externalLinkTarget];
    }

    if (!item.url) {
      if (item.action) {
        bindNamedAction(link, item.action);
      } else {
        bindLink(link, ('dest' in item) ? item.dest : null);
      }
    }

    container.appendChild(link);

    return container;
  }

  function getHtmlElement(data, page, viewport, linkService) {
    switch (data.annotationType) {
      case AnnotationType.WIDGET:
        return getHtmlElementForTextWidgetAnnotation(data, page);
      case AnnotationType.TEXT:
        return getHtmlElementForTextAnnotation(data, page, viewport);
      case AnnotationType.LINK:
        return getHtmlElementForLinkAnnotation(data, page, viewport,
                                               linkService);
      default:
        throw new Error('Unsupported annotationType: ' + data.annotationType);
    }
  }

  function render(viewport, div, annotations, page, linkService) {
    for (var i = 0, ii = annotations.length; i < ii; i++) {
      var data = annotations[i];
      if (!data || !data.hasHtml) {
        continue;
      }

      var element = getHtmlElement(data, page, viewport, linkService);
      div.appendChild(element);
    }
  }

  function update(viewport, div, annotations) {
    for (var i = 0, ii = annotations.length; i < ii; i++) {
      var data = annotations[i];
      var element = div.querySelector(
        '[data-annotation-id="' + data.id + '"]');
      if (element) {
        CustomStyle.setProp('transform', element,
          'matrix(' + viewport.transform.join(',') + ')');
      }
    }
    div.removeAttribute('hidden');
  }

  return {
    render: render,
    update: update
  };
})();

PDFJS.AnnotationLayer = AnnotationLayer;
