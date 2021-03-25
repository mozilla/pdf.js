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

import { $toStyle, XFAObject } from "./xfa_object.js";
import { warn } from "../../shared/util.js";

function measureToString(m) {
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
    if (node.w) {
      style.width = measureToString(node.w);
    } else {
      if (node.maxW && node.maxW.value > 0) {
        style.maxWidth = measureToString(node.maxW);
      }
      if (node.minW && node.minW.value > 0) {
        style.minWidth = measureToString(node.minW);
      }
    }

    if (node.h) {
      style.height = measureToString(node.h);
    } else {
      if (node.maxH && node.maxH.value > 0) {
        style.maxHeight = measureToString(node.maxH);
      }
      if (node.minH && node.minH.value > 0) {
        style.minHeight = measureToString(node.minH);
      }
    }
  },
  position(node, style) {
    if (node.x !== "" || node.y !== "") {
      style.position = "absolute";
      style.left = measureToString(node.x);
      style.top = measureToString(node.y);
    }
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
};

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

export { measureToString, toStyle };
