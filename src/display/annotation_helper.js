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
/* globals PDFJS, Util, AnnotationType, AnnotationBorderStyleType,
           CustomStyle, warn */

'use strict';

var BORDER_SPACING = 2; // px
var UNDERLINE_PADDING = 1; // px

var AnnotationUtils = (function AnnotationUtilsClosure() {
  function getContainer(data, view, viewport) {
    var container = document.createElement('section');

    // Normalize rectangle
    data.rectangle = Util.normalizeRect([
      data.rectangle[0],
      view[3] - data.rectangle[1] + view[1],
      data.rectangle[2],
      view[3] - data.rectangle[3] + view[1]
    ]);

    // Initial top, left, width and height
    var left = data.rectangle[0];
    var top = data.rectangle[1];
    var width = data.rectangle[2] - data.rectangle[0];
    var height = data.rectangle[3] - data.rectangle[1];

    // Transform
    CustomStyle.setProp('transform', container,
                        'matrix(' + viewport.transform.join(',') + ')');
    CustomStyle.setProp('transformOrigin', container,
      -data.rectangle[0] + 'px ' + -data.rectangle[1] + 'px');

    // ID
    container.setAttribute('data-annotation-id', data.id);

    // Border
    var spacing = 0;
    if (data.borderStyle.width > 0) {
      // Border width
      container.style.borderWidth = data.borderStyle.width + 'px';

      // Horizontal and vertical border radius
      var radius = data.borderStyle.horizontalCornerRadius + 'px / ' +
                   data.borderStyle.verticalCornerRadius + 'px';
      CustomStyle.setProp('borderRadius', container, radius);

      // Border style
      switch (data.borderStyle.style) {
        case AnnotationBorderStyleType.SOLID:
          container.style.borderStyle = 'solid';

          // Make sure the borders are not too close to the text.
          spacing = BORDER_SPACING * data.borderStyle.width;
          left -= spacing;
          top -= spacing;
          width += data.borderStyle.width;
          height += data.borderStyle.width;
          break;

        case AnnotationBorderStyleType.DASHED:
          container.style.borderStyle = 'dashed';

          // Make sure the borders are not too close to the text.
          spacing = BORDER_SPACING * data.borderStyle.width;
          left -= spacing;
          top -= spacing;
          width += data.borderStyle.width;
          height += data.borderStyle.width;
          break;

        case AnnotationBorderStyleType.BEVELED:
          warn('Unimplemented border style: beveled');
          break;

        case AnnotationBorderStyleType.INSET:
          warn('Unimplemented border style: inset');
          break;

        case AnnotationBorderStyleType.UNDERLINE:
          container.style.borderBottomStyle = 'solid';
          container.style.paddingBottom = UNDERLINE_PADDING + 'px';
          break;

        default:
          break;
      }
    }

    // Set top, left, width and height as pixels
    container.style.top = top + 'px';
    container.style.left = left + 'px';
    container.style.width = width + 'px';
    container.style.height = height + 'px';

    return container;
  }

  function getHtmlElementForLinkAnnotation(data, view, viewport) {
    // Container
    var container = getContainer(data, view, viewport);
    container.className = 'linkAnnotation';

    // Link
    var link = document.createElement('a');
    if (data.action && data.action.type === 'URI') {
      link.href = link.title = data.action.url;
    }
    container.appendChild(link);

    // Border color
    if (data.color) {
      container.style.borderColor = Util.makeCssRgb(data.color);
    } else {
      // Default color is black, but that's not obvious from the spec.
      container.style.borderColor = 'rgb(0,0,0)';
    }

    return container;
  }

  function getHtmlElement(data, view, viewport) {
    switch (data.type) {
      case AnnotationType.LINK:
        return getHtmlElementForLinkAnnotation(data, view, viewport);

      default:
        return;
    }
  }

  return { getHtmlElement: getHtmlElement };
})();

PDFJS.AnnotationUtils = AnnotationUtils;
