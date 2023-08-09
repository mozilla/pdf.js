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
  $content,
  $extra,
  $getParent,
  $getSubformParent,
  $getTemplateRoot,
  $globalData,
  $nodeName,
  $pushGlyphs,
  $text,
  $toStyle,
} from "./symbol_utils.js";
import { createValidAbsoluteUrl, warn } from "../../shared/util.js";
import { getMeasurement, stripQuotes } from "./utils.js";
import { selectFont } from "./fonts.js";
import { TextMeasure } from "./text.js";
import { XFAObject } from "./xfa_object.js";

function measureToString(m) {
  if (typeof m === "string") {
    return "0px";
  }

  return Number.isInteger(m) ? `${m}px` : `${m.toFixed(2)}px`;
}

const converters = {
  anchorType(node, style) {
    const parent = node[$getSubformParent]();
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
    const parent = node[$getSubformParent]();
    let width = node.w;
    const height = node.h;
    if (parent.layout?.includes("row")) {
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

    style.width = width !== "" ? measureToString(width) : "auto";

    style.height = height !== "" ? measureToString(height) : "auto";
  },
  position(node, style) {
    const parent = node[$getSubformParent]();
    if (parent?.layout && parent.layout !== "position") {
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
  const parent = node[$getSubformParent]();
  if (parent.layout === "position") {
    if (node.minW > 0) {
      style.minWidth = measureToString(node.minW);
    }
    if (node.maxW > 0) {
      style.maxWidth = measureToString(node.maxW);
    }
    if (node.minH > 0) {
      style.minHeight = measureToString(node.minH);
    }
    if (node.maxH > 0) {
      style.maxHeight = measureToString(node.maxH);
    }
  }
}

function layoutText(text, xfaFont, margin, lineHeight, fontFinder, width) {
  const measure = new TextMeasure(xfaFont, margin, lineHeight, fontFinder);
  if (typeof text === "string") {
    measure.addString(text);
  } else {
    text[$pushGlyphs](measure);
  }

  return measure.compute(width);
}

function layoutNode(node, availableSpace) {
  let height = null;
  let width = null;
  let isBroken = false;

  if ((!node.w || !node.h) && node.value) {
    let marginH = 0;
    let marginV = 0;
    if (node.margin) {
      marginH = node.margin.leftInset + node.margin.rightInset;
      marginV = node.margin.topInset + node.margin.bottomInset;
    }

    let lineHeight = null;
    let margin = null;
    if (node.para) {
      margin = Object.create(null);
      lineHeight = node.para.lineHeight === "" ? null : node.para.lineHeight;
      margin.top = node.para.spaceAbove === "" ? 0 : node.para.spaceAbove;
      margin.bottom = node.para.spaceBelow === "" ? 0 : node.para.spaceBelow;
      margin.left = node.para.marginLeft === "" ? 0 : node.para.marginLeft;
      margin.right = node.para.marginRight === "" ? 0 : node.para.marginRight;
    }

    let font = node.font;
    if (!font) {
      const root = node[$getTemplateRoot]();
      let parent = node[$getParent]();
      while (parent && parent !== root) {
        if (parent.font) {
          font = parent.font;
          break;
        }
        parent = parent[$getParent]();
      }
    }

    const maxWidth = (node.w || availableSpace.width) - marginH;
    const fontFinder = node[$globalData].fontFinder;
    if (
      node.value.exData &&
      node.value.exData[$content] &&
      node.value.exData.contentType === "text/html"
    ) {
      const res = layoutText(
        node.value.exData[$content],
        font,
        margin,
        lineHeight,
        fontFinder,
        maxWidth
      );
      width = res.width;
      height = res.height;
      isBroken = res.isBroken;
    } else {
      const text = node.value[$text]();
      if (text) {
        const res = layoutText(
          text,
          font,
          margin,
          lineHeight,
          fontFinder,
          maxWidth
        );
        width = res.width;
        height = res.height;
        isBroken = res.isBroken;
      }
    }

    if (width !== null && !node.w) {
      width += marginH;
    }

    if (height !== null && !node.h) {
      height += marginV;
    }
  }
  return { w: width, h: height, isBroken };
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
        const parent = node[$getSubformParent]();
        width = parent.layout === "position" && parent.w !== "" ? 0 : node.minW;
      } else {
        width = Math.min(node.maxW, availableSpace.width);
      }
      html.attributes.style.width = measureToString(width);
    }

    let height = node.h;
    if (height === "") {
      if (node.maxH === 0) {
        const parent = node[$getSubformParent]();
        height =
          parent.layout === "position" && parent.h !== "" ? 0 : node.minH;
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
  if (parent.layout?.includes("row")) {
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

  if (parent.layout && parent.layout !== "position") {
    // Useless in this context.
    node.x = node.y = 0;
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
    if (converters.hasOwnProperty(name)) {
      converters[name](node, style);
      continue;
    }

    if (value instanceof XFAObject) {
      const newStyle = value[$toStyle]();
      if (newStyle) {
        Object.assign(style, newStyle);
      } else {
        warn(`(DEBUG) - XFA - style for ${name} not implemented yet`);
      }
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
    children: [],
  };

  attributes.class.push("xfaWrapped");

  if (node.border) {
    const { widths, insets } = node.border[$extra];
    let width, height;
    let top = insets[0];
    let left = insets[3];
    const insetsH = insets[0] + insets[2];
    const insetsW = insets[1] + insets[3];
    switch (node.border.hand) {
      case "even":
        top -= widths[0] / 2;
        left -= widths[3] / 2;
        width = `calc(100% + ${(widths[1] + widths[3]) / 2 - insetsW}px)`;
        height = `calc(100% + ${(widths[0] + widths[2]) / 2 - insetsH}px)`;
        break;
      case "left":
        top -= widths[0];
        left -= widths[3];
        width = `calc(100% + ${widths[1] + widths[3] - insetsW}px)`;
        height = `calc(100% + ${widths[0] + widths[2] - insetsH}px)`;
        break;
      case "right":
        width = insetsW ? `calc(100% - ${insetsW}px)` : "100%";
        height = insetsH ? `calc(100% - ${insetsH}px)` : "100%";
        break;
    }
    const classNames = ["xfaBorder"];
    if (isPrintOnly(node.border)) {
      classNames.push("xfaPrintOnly");
    }

    const border = {
      name: "div",
      attributes: {
        class: classNames,
        style: {
          top: `${top}px`,
          left: `${left}px`,
          width,
          height,
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
    wrapper.children.push(border, html);
  } else {
    wrapper.children.push(html);
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

  wrapper.attributes.style.position =
    style.position === "absolute" ? "absolute" : "relative";
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
  const align = styles.textAlign === "right" ? "right" : "left";
  const name = "padding" + (align === "left" ? "Left" : "Right");
  const padding = getMeasurement(styles[name], "0px");
  styles[name] = `${padding - indent}px`;
}

function setAccess(node, classNames) {
  switch (node.access) {
    case "nonInteractive":
      classNames.push("xfaNonInteractive");
      break;
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

function getCurrentPara(node) {
  const stack = node[$getTemplateRoot]()[$extra].paraStack;
  return stack.length ? stack.at(-1) : null;
}

function setPara(node, nodeStyle, value) {
  if (value.attributes.class?.includes("xfaRich")) {
    if (nodeStyle) {
      if (node.h === "") {
        nodeStyle.height = "auto";
      }
      if (node.w === "") {
        nodeStyle.width = "auto";
      }
    }

    const para = getCurrentPara(node);
    if (para) {
      // By definition exData are external data so para
      // has no effect on it.
      const valueStyle = value.attributes.style;
      valueStyle.display = "flex";
      valueStyle.flexDirection = "column";
      switch (para.vAlign) {
        case "top":
          valueStyle.justifyContent = "start";
          break;
        case "bottom":
          valueStyle.justifyContent = "end";
          break;
        case "middle":
          valueStyle.justifyContent = "center";
          break;
      }

      const paraStyle = para[$toStyle]();
      for (const [key, val] of Object.entries(paraStyle)) {
        if (!(key in valueStyle)) {
          valueStyle[key] = val;
        }
      }
    }
  }
}

function setFontFamily(xfaFont, node, fontFinder, style) {
  if (!fontFinder) {
    // The font cannot be found in the pdf so use the default one.
    delete style.fontFamily;
    return;
  }

  const name = stripQuotes(xfaFont.typeface);
  style.fontFamily = `"${name}"`;

  const typeface = fontFinder.find(name);
  if (typeface) {
    const { fontFamily } = typeface.regular.cssFontInfo;
    if (fontFamily !== name) {
      style.fontFamily = `"${fontFamily}"`;
    }

    const para = getCurrentPara(node);
    if (para && para.lineHeight !== "") {
      return;
    }

    if (style.lineHeight) {
      // Already something so don't overwrite.
      return;
    }

    const pdfFont = selectFont(xfaFont, typeface);
    if (pdfFont) {
      style.lineHeight = Math.max(1.2, pdfFont.lineHeight);
    }
  }
}

function fixURL(str) {
  const absoluteUrl = createValidAbsoluteUrl(str, /* baseUrl = */ null, {
    addDefaultProtocol: true,
    tryConvertEncoding: true,
  });
  return absoluteUrl ? absoluteUrl.href : null;
}

export {
  computeBbox,
  createWrapper,
  fixDimensions,
  fixTextIndent,
  fixURL,
  isPrintOnly,
  layoutClass,
  layoutNode,
  measureToString,
  setAccess,
  setFontFamily,
  setMinMaxDimensions,
  setPara,
  toStyle,
};
