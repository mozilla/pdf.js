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
  $getParent,
  $getSubformParent,
  $nodeName,
  $pushGlyphs,
  $toStyle,
  XFAObject,
} from "./xfa_object.js";
import { getMeasurement, stripQuotes } from "./utils.js";
import { selectFont } from "./fonts.js";
import { TextMeasure } from "./text.js";
import { warn } from "../../shared/util.js";

function measureToString(m) {
  if (typeof m === "string") {
    return "0px";
  }

  return Number.isInteger(m) ? `${m}px` : `${m.toFixed(2)}px`;
}

const converters = {
  anchorType(node, style) {
    const parent = node[$getParent]();
    if (!parent || (parent.layout && parent.layout !== "position")) {
      // anchorType is only used in a positioned layout.
      return;
    }

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
    let width = node.w;
    const height = node.h;
    if (parent.layout && parent.layout.includes("row")) {
      const extra = parent[$extra];
      const colSpan = node.colSpan;
      let w;
      if (colSpan === -1) {
        w = extra.columnWidths
          .slice(extra.currentColumn)
          .reduce((a, x) => a + x, 0);
        extra.currentColumn = 0;
      } else {
        w = extra.columnWidths
          .slice(extra.currentColumn, extra.currentColumn + colSpan)
          .reduce((a, x) => a + x, 0);
        extra.currentColumn =
          (extra.currentColumn + node.colSpan) % extra.columnWidths.length;
      }

      if (!isNaN(w)) {
        width = node.w = w;
      }
    }

    if (width !== "") {
      style.width = measureToString(width);
    } else {
      style.width = "auto";
    }

    if (height !== "") {
      style.height = measureToString(height);
    } else {
      style.height = "auto";
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
    if (node[$nodeName] === "para") {
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
    } else {
      switch (node.hAlign) {
        case "left":
          style.alignSelf = "start";
          break;
        case "center":
          style.alignSelf = "center";
          break;
        case "right":
          style.alignSelf = "end";
          break;
      }
    }
  },
  margin(node, style) {
    if (node.margin) {
      style.margin = node.margin[$toStyle]().margin;
    }
  },
};

function setMinMaxDimensions(node, style) {
  const parent = node[$getParent]();
  if (parent.layout === "position") {
    style.minWidth = measureToString(node.minW);
    if (node.maxW) {
      style.maxWidth = measureToString(node.maxW);
    }
    style.minHeight = measureToString(node.minH);
    if (node.maxH) {
      style.maxHeight = measureToString(node.maxH);
    }
  }
}

function layoutText(text, xfaFont, fontFinder, width) {
  const measure = new TextMeasure(xfaFont, fontFinder);
  if (typeof text === "string") {
    measure.addString(text);
  } else {
    text[$pushGlyphs](measure);
  }

  return measure.compute(width);
}

function computeBbox(node, html, availableSpace) {
  let bbox;
  if (node.w !== "" && node.h !== "") {
    bbox = [node.x, node.y, node.w, node.h];
  } else {
    if (!availableSpace) {
      return null;
    }
    let width = node.w;
    if (width === "") {
      if (node.maxW === 0) {
        const parent = node[$getParent]();
        if (parent.layout === "position" && parent.w !== "") {
          width = 0;
        } else {
          width = node.minW;
        }
      } else {
        width = Math.min(node.maxW, availableSpace.width);
      }
      html.attributes.style.width = measureToString(width);
    }

    let height = node.h;
    if (height === "") {
      if (node.maxH === 0) {
        const parent = node[$getParent]();
        if (parent.layout === "position" && parent.h !== "") {
          height = 0;
        } else {
          height = node.minH;
        }
      } else {
        height = Math.min(node.maxH, availableSpace.height);
      }
      html.attributes.style.height = measureToString(height);
    }

    bbox = [node.x, node.y, width, height];
  }
  return bbox;
}

function fixDimensions(node) {
  const parent = node[$getSubformParent]();
  if (parent.layout && parent.layout.includes("row")) {
    const extra = parent[$extra];
    const colSpan = node.colSpan;
    let width;
    if (colSpan === -1) {
      width = extra.columnWidths
        .slice(extra.currentColumn)
        .reduce((a, w) => a + w, 0);
    } else {
      width = extra.columnWidths
        .slice(extra.currentColumn, extra.currentColumn + colSpan)
        .reduce((a, w) => a + w, 0);
    }
    if (!isNaN(width)) {
      node.w = width;
    }
  }

  if (parent.w && node.w) {
    node.w = Math.min(parent.w, node.w);
  }

  if (parent.h && node.h) {
    node.h = Math.min(parent.h, node.h);
  }

  if (parent.layout && parent.layout !== "position") {
    // Useless in this context.
    node.x = node.y = 0;
    if (parent.layout === "tb") {
      if (
        parent.w !== "" &&
        (node.w === "" || node.w === 0 || node.w > parent.w)
      ) {
        node.w = parent.w;
      }
    }
  }

  if (node.layout === "table") {
    if (node.w === "" && Array.isArray(node.columnWidths)) {
      node.w = node.columnWidths.reduce((a, x) => a + x, 0);
    }
  }
}

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

function createWrapper(node, html) {
  const { attributes } = html;
  const { style } = attributes;

  const wrapper = {
    name: "div",
    attributes: {
      class: ["xfaWrapper"],
      style: Object.create(null),
    },
    children: [html],
  };

  attributes.class.push("xfaWrapped");

  if (node.border) {
    const { widths, insets } = node.border[$extra];
    let shiftH = 0;
    let shiftW = 0;
    switch (node.border.hand) {
      case "even":
        shiftW = widths[0] / 2;
        shiftH = widths[3] / 2;
        break;
      case "left":
        shiftW = widths[0];
        shiftH = widths[3];
        break;
    }
    const insetsW = insets[1] + insets[3];
    const insetsH = insets[0] + insets[2];
    const classNames = ["xfaBorder"];
    if (isPrintOnly(node.border)) {
      classNames.push("xfaPrintOnly");
    }
    const border = {
      name: "div",
      attributes: {
        class: classNames,
        style: {
          top: `${insets[0] - widths[0] + shiftW}px`,
          left: `${insets[3] - widths[3] + shiftH}px`,
          width: insetsW ? `calc(100% - ${insetsW}px)` : "100%",
          height: insetsH ? `calc(100% - ${insetsH}px)` : "100%",
        },
      },
      children: [],
    };

    for (const key of [
      "border",
      "borderWidth",
      "borderColor",
      "borderRadius",
      "borderStyle",
    ]) {
      if (style[key] !== undefined) {
        border.attributes.style[key] = style[key];
        delete style[key];
      }
    }
    wrapper.children.push(border);
  }

  for (const key of [
    "background",
    "backgroundClip",
    "top",
    "left",
    "width",
    "height",
    "minWidth",
    "minHeight",
    "maxWidth",
    "maxHeight",
    "transform",
    "transformOrigin",
    "visibility",
  ]) {
    if (style[key] !== undefined) {
      wrapper.attributes.style[key] = style[key];
      delete style[key];
    }
  }

  if (style.position === "absolute") {
    wrapper.attributes.style.position = "absolute";
  } else {
    wrapper.attributes.style.position = "relative";
  }
  delete style.position;

  if (style.alignSelf) {
    wrapper.attributes.style.alignSelf = style.alignSelf;
    delete style.alignSelf;
  }

  return wrapper;
}

function fixTextIndent(styles) {
  const indent = getMeasurement(styles.textIndent, "0px");
  if (indent >= 0) {
    return;
  }

  // If indent is negative then it's a hanging indent.
  const align = styles.textAlign || "left";
  if (align === "left" || align === "right") {
    const name = "padding" + (align === "left" ? "Left" : "Right");
    const padding = getMeasurement(styles[name], "0px");
    styles[name] = `${padding - indent}px`;
  }
}

function setAccess(node, classNames) {
  switch (node.access) {
    case "nonInteractive":
    case "readOnly":
      classNames.push("xfaReadOnly");
      break;
    case "protected":
      classNames.push("xfaDisabled");
      break;
  }
}

function isPrintOnly(node) {
  return (
    node.relevant.length > 0 &&
    !node.relevant[0].excluded &&
    node.relevant[0].viewname === "print"
  );
}

function setFontFamily(xfaFont, fontFinder, style) {
  const name = stripQuotes(xfaFont.typeface);
  const typeface = fontFinder.find(name);

  style.fontFamily = `"${name}"`;
  if (typeface) {
    const { fontFamily } = typeface.regular.cssFontInfo;
    if (fontFamily !== name) {
      style.fontFamily += `,"${fontFamily}"`;
    }
    if (style.lineHeight) {
      // Already something so don't overwrite.
      return;
    }
    const pdfFont = selectFont(xfaFont, typeface);
    if (pdfFont && pdfFont.lineHeight > 0) {
      style.lineHeight = pdfFont.lineHeight;
    }
  }
}

export {
  computeBbox,
  createWrapper,
  fixDimensions,
  fixTextIndent,
  isPrintOnly,
  layoutClass,
  layoutText,
  measureToString,
  setAccess,
  setFontFamily,
  setMinMaxDimensions,
  toStyle,
};
