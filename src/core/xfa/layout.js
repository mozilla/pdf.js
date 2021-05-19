/* Copyright 2021 Mozilla Foundation
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

import { $extra, $flushHTML } from "./xfa_object.js";
import { measureToString } from "./html_utils.js";

// Subform and ExclGroup have a layout so they share these functions.

/**
 * How layout works ?
 *
 * A container has an initial space (with a width and a height) to fit in,
 * which means that once all the children have been added then
 * the total width/height must be lower than the given ones in
 * the initial space.
 * So if the container has known dimensions and these ones are ok with the
 * space then continue else we return HTMLResult.FAILURE: it's up to the
 * parent to deal with this failure (e.g. if parent layout is lr-tb and
 * we fail to add a child at end of line (lr) then we try to add it on the
 * next line).
 * And then we run through the children, each child gets its initial space
 * in calling its parent $getAvailableSpace method
 * (see _filteredChildrenGenerator and $childrenToHTML in xfa_object.js)
 * then we try to layout child in its space. If everything is ok then we add
 * the result to its parent through $addHTML which will recompute the available
 * space in parent according to its layout property else we return
 * HTMLResult.Failure.
 * Before a failure some children may have been layed out: they've been saved in
 * [$extra].children and [$extra] has properties generator and failingNode
 * in order to save the state where we were before a failure.
 * This [$extra].children property is useful when a container has to be splited.
 * So if a container is unbreakable, we must delete its [$extra] property before
 * returning.
 */

function flushHTML(node) {
  const attributes = node[$extra].attributes;
  const html = {
    name: "div",
    attributes,
    children: node[$extra].children,
  };

  if (node[$extra].failingNode) {
    const htmlFromFailing = node[$extra].failingNode[$flushHTML]();
    if (htmlFromFailing) {
      html.children.push(htmlFromFailing);
    }
  }

  if (html.children.length === 0) {
    return null;
  }

  node[$extra].children = [];
  delete node[$extra].line;

  return html;
}

function addHTML(node, html, bbox) {
  const extra = node[$extra];
  const availableSpace = extra.availableSpace;

  switch (node.layout) {
    case "position": {
      const [x, y, w, h] = bbox;
      extra.width = Math.max(extra.width, x + w);
      extra.height = Math.max(extra.height, y + h);
      extra.children.push(html);
      break;
    }
    case "lr-tb":
    case "rl-tb":
      if (!extra.line || extra.attempt === 1) {
        extra.line = {
          name: "div",
          attributes: {
            class: node.layout === "lr-tb" ? "xfaLr" : "xfaRl",
          },
          children: [],
        };
        extra.children.push(extra.line);
      }
      extra.line.children.push(html);

      if (extra.attempt === 0) {
        // Add the element on the line
        const [, , w, h] = bbox;
        extra.currentWidth += w;
        extra.height = Math.max(extra.height, extra.prevHeight + h);
      } else {
        const [, , w, h] = bbox;
        extra.width = Math.max(extra.width, extra.currentWidth);
        extra.currentWidth = w;
        extra.prevHeight = extra.height;
        extra.height += h;

        // The element has been added on a new line so switch to line mode now.
        extra.attempt = 0;
      }
      break;
    case "rl-row":
    case "row": {
      extra.children.push(html);
      const [, , w, h] = bbox;
      extra.width += w;
      extra.height = Math.max(extra.height, h);
      const height = measureToString(extra.height);
      for (const child of extra.children) {
        if (child.attributes.class === "xfaWrapper") {
          child.children[child.children.length - 1].attributes.style.height =
            height;
        } else {
          child.attributes.style.height = height;
        }
      }
      break;
    }
    case "table": {
      const [, , w, h] = bbox;
      extra.width = Math.min(availableSpace.width, Math.max(extra.width, w));
      extra.height += h;
      extra.children.push(html);
      break;
    }
    case "tb": {
      const [, , , h] = bbox;
      extra.width = availableSpace.width;
      extra.height += h;
      extra.children.push(html);
      break;
    }
  }
}

function getAvailableSpace(node) {
  const availableSpace = node[$extra].availableSpace;

  switch (node.layout) {
    case "lr-tb":
    case "rl-tb":
      switch (node[$extra].attempt) {
        case 0:
          return {
            width: availableSpace.width - node[$extra].currentWidth,
            height: availableSpace.height - node[$extra].prevHeight,
          };
        case 1:
          return {
            width: availableSpace.width,
            height: availableSpace.height - node[$extra].height,
          };
        default:
          return {
            width: Infinity,
            height: availableSpace.height - node[$extra].prevHeight,
          };
      }
    case "rl-row":
    case "row":
      const width = node[$extra].columnWidths
        .slice(node[$extra].currentColumn)
        .reduce((a, x) => a + x);
      return { width, height: availableSpace.height };
    case "table":
    case "tb":
      return {
        width: availableSpace.width,
        height: availableSpace.height - node[$extra].height,
      };
    case "position":
    default:
      return availableSpace;
  }
}

export { addHTML, flushHTML, getAvailableSpace };
