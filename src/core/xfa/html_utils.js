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

import { $extra, $getParent, $toStyle, XFAObject } from "./xfa_object.js";
import { warn } from "../../shared/util.js";

function measureToString(m) {
  if (typeof m === "string") {
    return "0px";
  }
  return Number.isInteger(m) ? `${m}px` : `${m.toFixed(2)}px`;
}

const converters = {
  anchorType(node, style) {
    if (!("transform" in style)) {
      style.transform = "";
    }
    switch (node.anchorType) {
      case "bottomCenter":
        style.transform += "translate(-50%, -100%)";
        break;
      case "bottomLeft":
        style.transform += "translate(0,-100%)";
        break;
      case "bottomRight":
        style.transform += "translate(-100%,-100%)";
        break;
      case "middleCenter":
        style.transform += "translate(-50%,-50%)";
        break;
      case "middleLeft":
        style.transform += "translate(0,-50%)";
        break;
      case "middleRight":
        style.transform += "translate(-100%,-50%)";
        break;
      case "topCenter":
        style.transform += "translate(-50%,0)";
        break;
      case "topRight":
        style.transform += "translate(-100%,0)";
        break;
    }
  },
  dimensions(node, style) {
    const parent = node[$getParent]();
    const extra = parent[$extra];
    let width = node.w;
    if (extra && extra.columnWidths) {
      width = extra.columnWidths[extra.currentColumn];
      extra.currentColumn =
        (extra.currentColumn + 1) % extra.columnWidths.length;
    }

    if (width !== "") {
      style.width = measureToString(width);
    } else {
      style.width = "auto";
      if (node.maxW > 0) {
        style.maxWidth = measureToString(node.maxW);
      }
      style.minWidth = measureToString(node.minW);
    }

    if (node.h !== "") {
      style.height = measureToString(node.h);
    } else {
      style.height = "auto";
      if (node.maxH > 0) {
        style.maxHeight = measureToString(node.maxH);
      }
      style.minHeight = measureToString(node.minH);
    }
  },
  position(node, style) {
    const parent = node[$getParent]();
    if (parent && parent.layout && parent.layout !== "position") {
      // IRL, we've some x/y in tb layout.
      // Specs say x/y is only used in positioned layout.
      return;
    }

    style.position = "absolute";
    style.left = measureToString(node.x);
    style.top = measureToString(node.y);
  },
  rotate(node, style) {
    if (node.rotate) {
      if (!("transform" in style)) {
        style.transform = "";
      }
      style.transform += `rotate(-${node.rotate}deg)`;
      style.transformOrigin = "top left";
    }
  },
  presence(node, style) {
    switch (node.presence) {
      case "invisible":
        style.visibility = "hidden";
        break;
      case "hidden":
      case "inactive":
        style.display = "none";
        break;
    }
  },
  hAlign(node, style) {
    switch (node.hAlign) {
      case "justifyAll":
        style.textAlign = "justify-all";
        break;
      case "radix":
        // TODO: implement this correctly !
        style.textAlign = "left";
        break;
      default:
        style.textAlign = node.hAlign;
    }
  },
  borderMarginPadding(node, style) {
    // Get border width in order to compute margin and padding.
    const borderWidths = [0, 0, 0, 0];
    const marginWidths = [0, 0, 0, 0];
    const marginNode = node.margin
      ? [
          node.margin.topInset,
          node.margin.rightInset,
          node.margin.bottomInset,
          node.margin.leftInset,
        ]
      : [0, 0, 0, 0];
    if (node.border) {
      Object.assign(style, node.border[$toStyle](borderWidths, marginWidths));
    }

    if (borderWidths.every(x => x === 0)) {
      // No border: margin & padding are padding
      if (node.margin) {
        Object.assign(style, node.margin[$toStyle]());
      }
      style.padding = style.margin;
      delete style.margin;
    } else {
      style.padding =
        measureToString(marginNode[0] - borderWidths[0] - marginWidths[0]) +
        " " +
        measureToString(marginNode[1] - borderWidths[1] - marginWidths[1]) +
        " " +
        measureToString(marginNode[2] - borderWidths[2] - marginWidths[2]) +
        " " +
        measureToString(marginNode[3] - borderWidths[3] - marginWidths[3]);
    }
  },
};

function layoutClass(node) {
  switch (node.layout) {
    case "position":
      return "xfaPosition";
    case "lr-tb":
      return "xfaLrTb";
    case "rl-row":
      return "xfaRlRow";
    case "rl-tb":
      return "xfaRlTb";
    case "row":
      return "xfaRow";
    case "table":
      return "xfaTable";
    case "tb":
      return "xfaTb";
    default:
      return "xfaPosition";
  }
}

function toStyle(node, ...names) {
  const style = Object.create(null);
  for (const name of names) {
    const value = node[name];
    if (value === null) {
      continue;
    }
    if (value instanceof XFAObject) {
      const newStyle = value[$toStyle]();
      if (newStyle) {
        Object.assign(style, newStyle);
      } else {
        warn(`(DEBUG) - XFA - style for ${name} not implemented yet`);
      }
      continue;
    }

    if (converters.hasOwnProperty(name)) {
      converters[name](node, style);
    }
  }
  return style;
}

function addExtraDivForMargin(html) {
  const style = html.attributes.style;
  if (style.margin) {
    const padding = style.margin;
    delete style.margin;
    const width = style.width || "auto";
    const height = style.height || "auto";

    style.width = "100%";
    style.height = "100%";

    return {
      name: "div",
      attributes: {
        style: { padding, width, height },
      },
      children: [html],
    };
  }
  return html;
}

export { addExtraDivForMargin, layoutClass, measureToString, toStyle };
