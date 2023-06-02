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

import {
  $extra,
  $flushHTML,
  $getSubformParent,
  $getTemplateRoot,
  $isSplittable,
  $isThereMoreWidth,
} from "./symbol_utils.js";
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

function createLine(node, children) {
  return {
    name: "div",
    attributes: {
      class: [node.layout === "lr-tb" ? "xfaLr" : "xfaRl"],
    },
    children,
  };
}

function flushHTML(node) {
  if (!node[$extra]) {
    return null;
  }

  const attributes = node[$extra].attributes;
  const html = {
    name: "div",
    attributes,
    children: node[$extra].children,
  };

  if (node[$extra].failingNode) {
    const htmlFromFailing = node[$extra].failingNode[$flushHTML]();
    if (htmlFromFailing) {
      if (node.layout.endsWith("-tb")) {
        html.children.push(createLine(node, [htmlFromFailing]));
      } else {
        html.children.push(htmlFromFailing);
      }
    }
  }

  if (html.children.length === 0) {
    return null;
  }

  return html;
}

function addHTML(node, html, bbox) {
  const extra = node[$extra];
  const availableSpace = extra.availableSpace;

  const [x, y, w, h] = bbox;
  switch (node.layout) {
    case "position": {
      extra.width = Math.max(extra.width, x + w);
      extra.height = Math.max(extra.height, y + h);
      extra.children.push(html);
      break;
    }
    case "lr-tb":
    case "rl-tb":
      if (!extra.line || extra.attempt === 1) {
        extra.line = createLine(node, []);
        extra.children.push(extra.line);
        extra.numberInLine = 0;
      }

      extra.numberInLine += 1;
      extra.line.children.push(html);

      if (extra.attempt === 0) {
        // Add the element on the line
        extra.currentWidth += w;
        extra.height = Math.max(extra.height, extra.prevHeight + h);
      } else {
        extra.currentWidth = w;
        extra.prevHeight = extra.height;
        extra.height += h;

        // The element has been added on a new line so switch to line mode now.
        extra.attempt = 0;
      }
      extra.width = Math.max(extra.width, extra.currentWidth);
      break;
    case "rl-row":
    case "row": {
      extra.children.push(html);
      extra.width += w;
      extra.height = Math.max(extra.height, h);
      const height = measureToString(extra.height);
      for (const child of extra.children) {
        child.attributes.style.height = height;
      }
      break;
    }
    case "table": {
      extra.width = Math.min(availableSpace.width, Math.max(extra.width, w));
      extra.height += h;
      extra.children.push(html);
      break;
    }
    case "tb": {
      // Even if the subform can possibly take all the available width,
      // we must compute the final width as it is in order to be able
      // for example to center the subform within its parent.
      extra.width = Math.min(availableSpace.width, Math.max(extra.width, w));
      extra.height += h;
      extra.children.push(html);
      break;
    }
  }
}

function getAvailableSpace(node) {
  const availableSpace = node[$extra].availableSpace;
  const marginV = node.margin
    ? node.margin.topInset + node.margin.bottomInset
    : 0;
  const marginH = node.margin
    ? node.margin.leftInset + node.margin.rightInset
    : 0;

  switch (node.layout) {
    case "lr-tb":
    case "rl-tb":
      if (node[$extra].attempt === 0) {
        return {
          width: availableSpace.width - marginH - node[$extra].currentWidth,
          height: availableSpace.height - marginV - node[$extra].prevHeight,
        };
      }
      return {
        width: availableSpace.width - marginH,
        height: availableSpace.height - marginV - node[$extra].height,
      };
    case "rl-row":
    case "row":
      const width = node[$extra].columnWidths
        .slice(node[$extra].currentColumn)
        .reduce((a, x) => a + x);
      return { width, height: availableSpace.height - marginH };
    case "table":
    case "tb":
      return {
        width: availableSpace.width - marginH,
        height: availableSpace.height - marginV - node[$extra].height,
      };
    case "position":
    default:
      return availableSpace;
  }
}

function getTransformedBBox(node) {
  // Take into account rotation and anchor to get the real bounding box.
  let w = node.w === "" ? NaN : node.w;
  let h = node.h === "" ? NaN : node.h;
  let [centerX, centerY] = [0, 0];
  switch (node.anchorType || "") {
    case "bottomCenter":
      [centerX, centerY] = [w / 2, h];
      break;
    case "bottomLeft":
      [centerX, centerY] = [0, h];
      break;
    case "bottomRight":
      [centerX, centerY] = [w, h];
      break;
    case "middleCenter":
      [centerX, centerY] = [w / 2, h / 2];
      break;
    case "middleLeft":
      [centerX, centerY] = [0, h / 2];
      break;
    case "middleRight":
      [centerX, centerY] = [w, h / 2];
      break;
    case "topCenter":
      [centerX, centerY] = [w / 2, 0];
      break;
    case "topRight":
      [centerX, centerY] = [w, 0];
      break;
  }

  let x, y;
  switch (node.rotate || 0) {
    case 0:
      [x, y] = [-centerX, -centerY];
      break;
    case 90:
      [x, y] = [-centerY, centerX];
      [w, h] = [h, -w];
      break;
    case 180:
      [x, y] = [centerX, centerY];
      [w, h] = [-w, -h];
      break;
    case 270:
      [x, y] = [centerY, -centerX];
      [w, h] = [-h, w];
      break;
  }

  return [
    node.x + x + Math.min(0, w),
    node.y + y + Math.min(0, h),
    Math.abs(w),
    Math.abs(h),
  ];
}

/**
 * Returning true means that the node will be layed out
 * else the layout will go to its next step (changing of line
 * in case of lr-tb or changing content area...).
 */
function checkDimensions(node, space) {
  if (node[$getTemplateRoot]()[$extra].firstUnsplittable === null) {
    return true;
  }

  if (node.w === 0 || node.h === 0) {
    return true;
  }

  const ERROR = 2;
  const parent = node[$getSubformParent]();
  const attempt = parent[$extra]?.attempt || 0;

  const [, y, w, h] = getTransformedBBox(node);
  switch (parent.layout) {
    case "lr-tb":
    case "rl-tb":
      if (attempt === 0) {
        // Try to put an element in the line.

        if (!node[$getTemplateRoot]()[$extra].noLayoutFailure) {
          if (node.h !== "" && Math.round(h - space.height) > ERROR) {
            // Not enough height.
            return false;
          }

          if (node.w !== "") {
            if (Math.round(w - space.width) <= ERROR) {
              return true;
            }
            if (parent[$extra].numberInLine === 0) {
              return space.height > ERROR;
            }

            return false;
          }

          return space.width > ERROR;
        }

        // No layout failure.

        // Put the element on the line but we can fail
        // and then in the second step (next line) we'll accept.
        if (node.w !== "") {
          return Math.round(w - space.width) <= ERROR;
        }

        return space.width > ERROR;
      }

      // Second attempt: try to put the element on the next line.

      if (node[$getTemplateRoot]()[$extra].noLayoutFailure) {
        // We cannot fail.
        return true;
      }

      if (node.h !== "" && Math.round(h - space.height) > ERROR) {
        return false;
      }

      if (node.w === "" || Math.round(w - space.width) <= ERROR) {
        return space.height > ERROR;
      }

      if (parent[$isThereMoreWidth]()) {
        return false;
      }

      return space.height > ERROR;
    case "table":
    case "tb":
      if (node[$getTemplateRoot]()[$extra].noLayoutFailure) {
        return true;
      }

      // If the node has a height then check if it's fine with available height.
      // If the node is breakable then we can return true.
      if (node.h !== "" && !node[$isSplittable]()) {
        return Math.round(h - space.height) <= ERROR;
      }
      // Else wait and see: this node will be layed out itself
      // in the provided space and maybe a children won't fit.

      if (node.w === "" || Math.round(w - space.width) <= ERROR) {
        return space.height > ERROR;
      }

      if (parent[$isThereMoreWidth]()) {
        return false;
      }

      return space.height > ERROR;
    case "position":
      if (node[$getTemplateRoot]()[$extra].noLayoutFailure) {
        return true;
      }

      if (node.h === "" || Math.round(h + y - space.height) <= ERROR) {
        return true;
      }

      const area = node[$getTemplateRoot]()[$extra].currentContentArea;
      return h + y > area.h;
    case "rl-row":
    case "row":
      if (node[$getTemplateRoot]()[$extra].noLayoutFailure) {
        return true;
      }

      if (node.h !== "") {
        return Math.round(h - space.height) <= ERROR;
      }
      return true;
    default:
      // No layout, so accept everything.
      return true;
  }
}

export { addHTML, checkDimensions, flushHTML, getAvailableSpace };
