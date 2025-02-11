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
  $acceptWhitespace,
  $addHTML,
  $appendChild,
  $childrenToHTML,
  $clean,
  $cleanPage,
  $content,
  $data,
  $extra,
  $finalize,
  $flushHTML,
  $getAvailableSpace,
  $getChildren,
  $getContainedChildren,
  $getExtra,
  $getNextPage,
  $getParent,
  $getSubformParent,
  $getTemplateRoot,
  $globalData,
  $hasSettableValue,
  $ids,
  $isBindable,
  $isCDATAXml,
  $isSplittable,
  $isThereMoreWidth,
  $isTransparent,
  $isUsable,
  $namespaceId,
  $nodeName,
  $onChild,
  $onText,
  $popPara,
  $pushPara,
  $removeChild,
  $searchNode,
  $setSetAttributes,
  $setValue,
  $tabIndex,
  $text,
  $toHTML,
  $toPages,
  $toStyle,
  $uid,
} from "./symbol_utils.js";
import { $buildXFAObject, NamespaceIds } from "./namespaces.js";
import {
  addHTML,
  checkDimensions,
  flushHTML,
  getAvailableSpace,
} from "./layout.js";
import {
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
} from "./html_utils.js";
import {
  ContentObject,
  Option01,
  OptionObject,
  StringObject,
  XFAObject,
  XFAObjectArray,
} from "./xfa_object.js";
import { fromBase64Util, Util, warn } from "../../shared/util.js";
import {
  getBBox,
  getColor,
  getFloat,
  getInteger,
  getKeyword,
  getMeasurement,
  getRatio,
  getRelevant,
  getStringOption,
  HTMLResult,
} from "./utils.js";
import { getMetrics } from "./fonts.js";
import { recoverJsURL } from "../core_utils.js";
import { searchNode } from "./som.js";

const TEMPLATE_NS_ID = NamespaceIds.template.id;
const SVG_NS = "http://www.w3.org/2000/svg";

// In case of lr-tb (and rl-tb) layouts, we try:
//  - to put the container at the end of a line
//  - and if it fails we try on the next line.
// If both tries failed then it's up to the parent
// to handle the situation.
const MAX_ATTEMPTS_FOR_LRTB_LAYOUT = 2;

// It's possible to have a bug in the layout and so as
// a consequence we could loop for ever in Template::toHTML()
// so in order to avoid that (and avoid a OOM crash) we break
// the loop after having MAX_EMPTY_PAGES empty pages.
const MAX_EMPTY_PAGES = 3;

// Default value to start with for the tabIndex property.
const DEFAULT_TAB_INDEX = 5000;

const HEADING_PATTERN = /^H(\d+)$/;

// Allowed mime types for images
const MIMES = new Set([
  "image/gif",
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/apng",
  "image/x-png",
  "image/bmp",
  "image/x-ms-bmp",
  "image/tiff",
  "image/tif",
  "application/octet-stream",
]);

const IMAGES_HEADERS = [
  [[0x42, 0x4d], "image/bmp"],
  [[0xff, 0xd8, 0xff], "image/jpeg"],
  [[0x49, 0x49, 0x2a, 0x00], "image/tiff"],
  [[0x4d, 0x4d, 0x00, 0x2a], "image/tiff"],
  [[0x47, 0x49, 0x46, 0x38, 0x39, 0x61], "image/gif"],
  [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/png"],
];

function getBorderDims(node) {
  if (!node || !node.border) {
    return { w: 0, h: 0 };
  }

  const borderExtra = node.border[$getExtra]();
  if (!borderExtra) {
    return { w: 0, h: 0 };
  }

  return {
    w:
      borderExtra.widths[0] +
      borderExtra.widths[2] +
      borderExtra.insets[0] +
      borderExtra.insets[2],
    h:
      borderExtra.widths[1] +
      borderExtra.widths[3] +
      borderExtra.insets[1] +
      borderExtra.insets[3],
  };
}

function hasMargin(node) {
  return (
    node.margin &&
    (node.margin.topInset ||
      node.margin.rightInset ||
      node.margin.bottomInset ||
      node.margin.leftInset)
  );
}

function _setValue(templateNode, value) {
  if (!templateNode.value) {
    const nodeValue = new Value({});
    templateNode[$appendChild](nodeValue);
    templateNode.value = nodeValue;
  }
  templateNode.value[$setValue](value);
}

function* getContainedChildren(node) {
  for (const child of node[$getChildren]()) {
    if (child instanceof SubformSet) {
      yield* child[$getContainedChildren]();
      continue;
    }
    yield child;
  }
}

function isRequired(node) {
  return node.validate?.nullTest === "error";
}

function setTabIndex(node) {
  while (node) {
    if (!node.traversal) {
      node[$tabIndex] = node[$getParent]()[$tabIndex];
      return;
    }

    if (node[$tabIndex]) {
      return;
    }

    let next = null;
    for (const child of node.traversal[$getChildren]()) {
      if (child.operation === "next") {
        next = child;
        break;
      }
    }

    if (!next || !next.ref) {
      node[$tabIndex] = node[$getParent]()[$tabIndex];
      return;
    }

    const root = node[$getTemplateRoot]();
    node[$tabIndex] = ++root[$tabIndex];

    const ref = root[$searchNode](next.ref, node);
    if (!ref) {
      return;
    }

    node = ref[0];
  }
}

function applyAssist(obj, attributes) {
  const assist = obj.assist;
  if (assist) {
    const assistTitle = assist[$toHTML]();
    if (assistTitle) {
      attributes.title = assistTitle;
    }
    const role = assist.role;
    const match = role.match(HEADING_PATTERN);
    if (match) {
      const ariaRole = "heading";
      const ariaLevel = match[1];
      attributes.role = ariaRole;
      attributes["aria-level"] = ariaLevel;
    }
  }
  // XXX: We could end up in a situation where the obj has a heading role and
  // is also a table. For now prioritize the table role.
  if (obj.layout === "table") {
    attributes.role = "table";
  } else if (obj.layout === "row") {
    attributes.role = "row";
  } else {
    const parent = obj[$getParent]();
    if (parent.layout === "row") {
      attributes.role = parent.assist?.role === "TH" ? "columnheader" : "cell";
    }
  }
}

function ariaLabel(obj) {
  if (!obj.assist) {
    return null;
  }
  const assist = obj.assist;
  if (assist.speak && assist.speak[$content] !== "") {
    return assist.speak[$content];
  }
  if (assist.toolTip) {
    return assist.toolTip[$content];
  }
  // TODO: support finding the related caption element. See xfa_bug1718037.pdf
  // for an example.
  return null;
}

function valueToHtml(value) {
  return HTMLResult.success({
    name: "div",
    attributes: {
      class: ["xfaRich"],
      style: Object.create(null),
    },
    children: [
      {
        name: "span",
        attributes: {
          style: Object.create(null),
        },
        value,
      },
    ],
  });
}

function setFirstUnsplittable(node) {
  const root = node[$getTemplateRoot]();
  if (root[$extra].firstUnsplittable === null) {
    root[$extra].firstUnsplittable = node;
    root[$extra].noLayoutFailure = true;
  }
}

function unsetFirstUnsplittable(node) {
  const root = node[$getTemplateRoot]();
  if (root[$extra].firstUnsplittable === node) {
    root[$extra].noLayoutFailure = false;
  }
}

function handleBreak(node) {
  if (node[$extra]) {
    return false;
  }

  node[$extra] = Object.create(null);

  if (node.targetType === "auto") {
    return false;
  }

  const root = node[$getTemplateRoot]();
  let target = null;
  if (node.target) {
    target = root[$searchNode](node.target, node[$getParent]());
    if (!target) {
      return false;
    }
    target = target[0];
  }

  const { currentPageArea, currentContentArea } = root[$extra];

  if (node.targetType === "pageArea") {
    if (!(target instanceof PageArea)) {
      target = null;
    }

    if (node.startNew) {
      node[$extra].target = target || currentPageArea;
      return true;
    } else if (target && target !== currentPageArea) {
      node[$extra].target = target;
      return true;
    }

    return false;
  }

  if (!(target instanceof ContentArea)) {
    target = null;
  }

  const pageArea = target && target[$getParent]();

  let index;
  let nextPageArea = pageArea;
  if (node.startNew) {
    // startNew === 1 so we must create a new container (pageArea or
    // contentArea).
    if (target) {
      const contentAreas = pageArea.contentArea.children;
      const indexForCurrent = contentAreas.indexOf(currentContentArea);
      const indexForTarget = contentAreas.indexOf(target);
      if (indexForCurrent !== -1 && indexForCurrent < indexForTarget) {
        // The next container is after the current container so
        // we can stay on the same page.
        nextPageArea = null;
      }
      index = indexForTarget - 1;
    } else {
      index = currentPageArea.contentArea.children.indexOf(currentContentArea);
    }
  } else if (target && target !== currentContentArea) {
    const contentAreas = pageArea.contentArea.children;
    index = contentAreas.indexOf(target) - 1;
    nextPageArea = pageArea === currentPageArea ? null : pageArea;
  } else {
    return false;
  }

  node[$extra].target = nextPageArea;
  node[$extra].index = index;
  return true;
}

function handleOverflow(node, extraNode, space) {
  const root = node[$getTemplateRoot]();
  const saved = root[$extra].noLayoutFailure;
  const savedMethod = extraNode[$getSubformParent];

  // Replace $getSubformParent to emulate that extraNode is just
  // under node.
  extraNode[$getSubformParent] = () => node;

  root[$extra].noLayoutFailure = true;
  const res = extraNode[$toHTML](space);
  node[$addHTML](res.html, res.bbox);
  root[$extra].noLayoutFailure = saved;
  extraNode[$getSubformParent] = savedMethod;
}

class AppearanceFilter extends StringObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "appearanceFilter");
    this.id = attributes.id || "";
    this.type = getStringOption(attributes.type, ["optional", "required"]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class Arc extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "arc", /* hasChildren = */ true);
    this.circular = getInteger({
      data: attributes.circular,
      defaultValue: 0,
      validate: x => x === 1,
    });
    this.hand = getStringOption(attributes.hand, ["even", "left", "right"]);
    this.id = attributes.id || "";
    this.startAngle = getFloat({
      data: attributes.startAngle,
      defaultValue: 0,
      validate: x => true,
    });
    this.sweepAngle = getFloat({
      data: attributes.sweepAngle,
      defaultValue: 360,
      validate: x => true,
    });
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.edge = null;
    this.fill = null;
  }

  [$toHTML]() {
    const edge = this.edge || new Edge({});
    const edgeStyle = edge[$toStyle]();
    const style = Object.create(null);
    if (this.fill?.presence === "visible") {
      Object.assign(style, this.fill[$toStyle]());
    } else {
      style.fill = "transparent";
    }
    style.strokeWidth = measureToString(
      edge.presence === "visible" ? edge.thickness : 0
    );
    style.stroke = edgeStyle.color;
    let arc;
    const attributes = {
      xmlns: SVG_NS,
      style: {
        width: "100%",
        height: "100%",
        overflow: "visible",
      },
    };

    if (this.sweepAngle === 360) {
      arc = {
        name: "ellipse",
        attributes: {
          xmlns: SVG_NS,
          cx: "50%",
          cy: "50%",
          rx: "50%",
          ry: "50%",
          style,
        },
      };
    } else {
      const startAngle = (this.startAngle * Math.PI) / 180;
      const sweepAngle = (this.sweepAngle * Math.PI) / 180;
      const largeArc = this.sweepAngle > 180 ? 1 : 0;
      const [x1, y1, x2, y2] = [
        50 * (1 + Math.cos(startAngle)),
        50 * (1 - Math.sin(startAngle)),
        50 * (1 + Math.cos(startAngle + sweepAngle)),
        50 * (1 - Math.sin(startAngle + sweepAngle)),
      ];

      arc = {
        name: "path",
        attributes: {
          xmlns: SVG_NS,
          d: `M ${x1} ${y1} A 50 50 0 ${largeArc} 0 ${x2} ${y2}`,
          vectorEffect: "non-scaling-stroke",
          style,
        },
      };

      Object.assign(attributes, {
        viewBox: "0 0 100 100",
        preserveAspectRatio: "none",
      });
    }

    const svg = {
      name: "svg",
      children: [arc],
      attributes,
    };

    const parent = this[$getParent]()[$getParent]();
    if (hasMargin(parent)) {
      return HTMLResult.success({
        name: "div",
        attributes: {
          style: {
            display: "inline",
            width: "100%",
            height: "100%",
          },
        },
        children: [svg],
      });
    }

    svg.attributes.style.position = "absolute";
    return HTMLResult.success(svg);
  }
}

class Area extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "area", /* hasChildren = */ true);
    this.colSpan = getInteger({
      data: attributes.colSpan,
      defaultValue: 1,
      validate: n => n >= 1 || n === -1,
    });
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.relevant = getRelevant(attributes.relevant);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.x = getMeasurement(attributes.x, "0pt");
    this.y = getMeasurement(attributes.y, "0pt");
    this.desc = null;
    this.extras = null;
    this.area = new XFAObjectArray();
    this.draw = new XFAObjectArray();
    this.exObject = new XFAObjectArray();
    this.exclGroup = new XFAObjectArray();
    this.field = new XFAObjectArray();
    this.subform = new XFAObjectArray();
    this.subformSet = new XFAObjectArray();
  }

  *[$getContainedChildren]() {
    // This function is overriden in order to fake that subforms under
    // this set are in fact under parent subform.
    yield* getContainedChildren(this);
  }

  [$isTransparent]() {
    return true;
  }

  [$isBindable]() {
    return true;
  }

  [$addHTML](html, bbox) {
    const [x, y, w, h] = bbox;
    this[$extra].width = Math.max(this[$extra].width, x + w);
    this[$extra].height = Math.max(this[$extra].height, y + h);

    this[$extra].children.push(html);
  }

  [$getAvailableSpace]() {
    return this[$extra].availableSpace;
  }

  [$toHTML](availableSpace) {
    // TODO: incomplete.
    const style = toStyle(this, "position");
    const attributes = {
      style,
      id: this[$uid],
      class: ["xfaArea"],
    };

    if (isPrintOnly(this)) {
      attributes.class.push("xfaPrintOnly");
    }

    if (this.name) {
      attributes.xfaName = this.name;
    }

    const children = [];
    this[$extra] = {
      children,
      width: 0,
      height: 0,
      availableSpace,
    };

    const result = this[$childrenToHTML]({
      filter: new Set([
        "area",
        "draw",
        "field",
        "exclGroup",
        "subform",
        "subformSet",
      ]),
      include: true,
    });

    if (!result.success) {
      if (result.isBreak()) {
        return result;
      }
      // Nothing to propose for the element which doesn't fit the
      // available space.
      delete this[$extra];
      return HTMLResult.FAILURE;
    }

    style.width = measureToString(this[$extra].width);
    style.height = measureToString(this[$extra].height);

    const html = {
      name: "div",
      attributes,
      children,
    };

    const bbox = [this.x, this.y, this[$extra].width, this[$extra].height];
    delete this[$extra];

    return HTMLResult.success(html, bbox);
  }
}

class Assist extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "assist", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.role = attributes.role || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.speak = null;
    this.toolTip = null;
  }

  [$toHTML]() {
    return this.toolTip?.[$content] || null;
  }
}

class Barcode extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "barcode", /* hasChildren = */ true);
    this.charEncoding = getKeyword({
      data: attributes.charEncoding
        ? attributes.charEncoding.toLowerCase()
        : "",
      defaultValue: "",
      validate: k =>
        [
          "utf-8",
          "big-five",
          "fontspecific",
          "gbk",
          "gb-18030",
          "gb-2312",
          "ksc-5601",
          "none",
          "shift-jis",
          "ucs-2",
          "utf-16",
        ].includes(k) || k.match(/iso-8859-\d{2}/),
    });
    this.checksum = getStringOption(attributes.checksum, [
      "none",
      "1mod10",
      "1mod10_1mod11",
      "2mod10",
      "auto",
    ]);
    this.dataColumnCount = getInteger({
      data: attributes.dataColumnCount,
      defaultValue: -1,
      validate: x => x >= 0,
    });
    this.dataLength = getInteger({
      data: attributes.dataLength,
      defaultValue: -1,
      validate: x => x >= 0,
    });
    this.dataPrep = getStringOption(attributes.dataPrep, [
      "none",
      "flateCompress",
    ]);
    this.dataRowCount = getInteger({
      data: attributes.dataRowCount,
      defaultValue: -1,
      validate: x => x >= 0,
    });
    this.endChar = attributes.endChar || "";
    this.errorCorrectionLevel = getInteger({
      data: attributes.errorCorrectionLevel,
      defaultValue: -1,
      validate: x => x >= 0 && x <= 8,
    });
    this.id = attributes.id || "";
    this.moduleHeight = getMeasurement(attributes.moduleHeight, "5mm");
    this.moduleWidth = getMeasurement(attributes.moduleWidth, "0.25mm");
    this.printCheckDigit = getInteger({
      data: attributes.printCheckDigit,
      defaultValue: 0,
      validate: x => x === 1,
    });
    this.rowColumnRatio = getRatio(attributes.rowColumnRatio);
    this.startChar = attributes.startChar || "";
    this.textLocation = getStringOption(attributes.textLocation, [
      "below",
      "above",
      "aboveEmbedded",
      "belowEmbedded",
      "none",
    ]);
    this.truncate = getInteger({
      data: attributes.truncate,
      defaultValue: 0,
      validate: x => x === 1,
    });
    this.type = getStringOption(
      attributes.type ? attributes.type.toLowerCase() : "",
      [
        "aztec",
        "codabar",
        "code2of5industrial",
        "code2of5interleaved",
        "code2of5matrix",
        "code2of5standard",
        "code3of9",
        "code3of9extended",
        "code11",
        "code49",
        "code93",
        "code128",
        "code128a",
        "code128b",
        "code128c",
        "code128sscc",
        "datamatrix",
        "ean8",
        "ean8add2",
        "ean8add5",
        "ean13",
        "ean13add2",
        "ean13add5",
        "ean13pwcd",
        "fim",
        "logmars",
        "maxicode",
        "msi",
        "pdf417",
        "pdf417macro",
        "plessey",
        "postauscust2",
        "postauscust3",
        "postausreplypaid",
        "postausstandard",
        "postukrm4scc",
        "postusdpbc",
        "postusimb",
        "postusstandard",
        "postus5zip",
        "qrcode",
        "rfid",
        "rss14",
        "rss14expanded",
        "rss14limited",
        "rss14stacked",
        "rss14stackedomni",
        "rss14truncated",
        "telepen",
        "ucc128",
        "ucc128random",
        "ucc128sscc",
        "upca",
        "upcaadd2",
        "upcaadd5",
        "upcapwcd",
        "upce",
        "upceadd2",
        "upceadd5",
        "upcean2",
        "upcean5",
        "upsmaxicode",
      ]
    );
    this.upsMode = getStringOption(attributes.upsMode, [
      "usCarrier",
      "internationalCarrier",
      "secureSymbol",
      "standardSymbol",
    ]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.wideNarrowRatio = getRatio(attributes.wideNarrowRatio);
    this.encrypt = null;
    this.extras = null;
  }
}

class Bind extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "bind", /* hasChildren = */ true);
    this.match = getStringOption(attributes.match, [
      "once",
      "dataRef",
      "global",
      "none",
    ]);
    this.ref = attributes.ref || "";
    this.picture = null;
  }
}

class BindItems extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "bindItems");
    this.connection = attributes.connection || "";
    this.labelRef = attributes.labelRef || "";
    this.ref = attributes.ref || "";
    this.valueRef = attributes.valueRef || "";
  }
}

class Bookend extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "bookend");
    this.id = attributes.id || "";
    this.leader = attributes.leader || "";
    this.trailer = attributes.trailer || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class BooleanElement extends Option01 {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "boolean");
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }

  [$toHTML](availableSpace) {
    return valueToHtml(this[$content] === 1 ? "1" : "0");
  }
}

class Border extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "border", /* hasChildren = */ true);
    this.break = getStringOption(attributes.break, ["close", "open"]);
    this.hand = getStringOption(attributes.hand, ["even", "left", "right"]);
    this.id = attributes.id || "";
    this.presence = getStringOption(attributes.presence, [
      "visible",
      "hidden",
      "inactive",
      "invisible",
    ]);
    this.relevant = getRelevant(attributes.relevant);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.corner = new XFAObjectArray(4);
    this.edge = new XFAObjectArray(4);
    this.extras = null;
    this.fill = null;
    this.margin = null;
  }

  [$getExtra]() {
    if (!this[$extra]) {
      const edges = this.edge.children.slice();
      if (edges.length < 4) {
        const defaultEdge = edges.at(-1) || new Edge({});
        for (let i = edges.length; i < 4; i++) {
          edges.push(defaultEdge);
        }
      }

      const widths = edges.map(edge => edge.thickness);
      const insets = [0, 0, 0, 0];
      if (this.margin) {
        insets[0] = this.margin.topInset;
        insets[1] = this.margin.rightInset;
        insets[2] = this.margin.bottomInset;
        insets[3] = this.margin.leftInset;
      }
      this[$extra] = { widths, insets, edges };
    }
    return this[$extra];
  }

  [$toStyle]() {
    // TODO: incomplete (hand).
    const { edges } = this[$getExtra]();
    const edgeStyles = edges.map(node => {
      const style = node[$toStyle]();
      style.color ||= "#000000";
      return style;
    });

    const style = Object.create(null);
    if (this.margin) {
      Object.assign(style, this.margin[$toStyle]());
    }

    if (this.fill?.presence === "visible") {
      Object.assign(style, this.fill[$toStyle]());
    }

    if (this.corner.children.some(node => node.radius !== 0)) {
      const cornerStyles = this.corner.children.map(node => node[$toStyle]());
      if (cornerStyles.length === 2 || cornerStyles.length === 3) {
        const last = cornerStyles.at(-1);
        for (let i = cornerStyles.length; i < 4; i++) {
          cornerStyles.push(last);
        }
      }

      style.borderRadius = cornerStyles.map(s => s.radius).join(" ");
    }

    switch (this.presence) {
      case "invisible":
      case "hidden":
        style.borderStyle = "";
        break;
      case "inactive":
        style.borderStyle = "none";
        break;
      default:
        style.borderStyle = edgeStyles.map(s => s.style).join(" ");
        break;
    }

    style.borderWidth = edgeStyles.map(s => s.width).join(" ");
    style.borderColor = edgeStyles.map(s => s.color).join(" ");

    return style;
  }
}

class Break extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "break", /* hasChildren = */ true);
    this.after = getStringOption(attributes.after, [
      "auto",
      "contentArea",
      "pageArea",
      "pageEven",
      "pageOdd",
    ]);
    this.afterTarget = attributes.afterTarget || "";
    this.before = getStringOption(attributes.before, [
      "auto",
      "contentArea",
      "pageArea",
      "pageEven",
      "pageOdd",
    ]);
    this.beforeTarget = attributes.beforeTarget || "";
    this.bookendLeader = attributes.bookendLeader || "";
    this.bookendTrailer = attributes.bookendTrailer || "";
    this.id = attributes.id || "";
    this.overflowLeader = attributes.overflowLeader || "";
    this.overflowTarget = attributes.overflowTarget || "";
    this.overflowTrailer = attributes.overflowTrailer || "";
    this.startNew = getInteger({
      data: attributes.startNew,
      defaultValue: 0,
      validate: x => x === 1,
    });
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.extras = null;
  }
}

class BreakAfter extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "breakAfter", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.leader = attributes.leader || "";
    this.startNew = getInteger({
      data: attributes.startNew,
      defaultValue: 0,
      validate: x => x === 1,
    });
    this.target = attributes.target || "";
    this.targetType = getStringOption(attributes.targetType, [
      "auto",
      "contentArea",
      "pageArea",
    ]);
    this.trailer = attributes.trailer || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.script = null;
  }
}

class BreakBefore extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "breakBefore", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.leader = attributes.leader || "";
    this.startNew = getInteger({
      data: attributes.startNew,
      defaultValue: 0,
      validate: x => x === 1,
    });
    this.target = attributes.target || "";
    this.targetType = getStringOption(attributes.targetType, [
      "auto",
      "contentArea",
      "pageArea",
    ]);
    this.trailer = attributes.trailer || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.script = null;
  }

  [$toHTML](availableSpace) {
    this[$extra] = {};
    return HTMLResult.FAILURE;
  }
}

class Button extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "button", /* hasChildren = */ true);
    this.highlight = getStringOption(attributes.highlight, [
      "inverted",
      "none",
      "outline",
      "push",
    ]);
    this.id = attributes.id || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.extras = null;
  }

  [$toHTML](availableSpace) {
    // TODO: highlight.

    const parent = this[$getParent]();
    const grandpa = parent[$getParent]();
    const htmlButton = {
      name: "button",
      attributes: {
        id: this[$uid],
        class: ["xfaButton"],
        style: {},
      },
      children: [],
    };

    for (const event of grandpa.event.children) {
      // if (true) break;
      if (event.activity !== "click" || !event.script) {
        continue;
      }
      const jsURL = recoverJsURL(event.script[$content]);
      if (!jsURL) {
        continue;
      }
      const href = fixURL(jsURL.url);
      if (!href) {
        continue;
      }

      // we've an url so generate a <a>
      htmlButton.children.push({
        name: "a",
        attributes: {
          id: "link" + this[$uid],
          href,
          newWindow: jsURL.newWindow,
          class: ["xfaLink"],
          style: {},
        },
        children: [],
      });
    }

    return HTMLResult.success(htmlButton);
  }
}

class Calculate extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "calculate", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.override = getStringOption(attributes.override, [
      "disabled",
      "error",
      "ignore",
      "warning",
    ]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.extras = null;
    this.message = null;
    this.script = null;
  }
}

class Caption extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "caption", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.placement = getStringOption(attributes.placement, [
      "left",
      "bottom",
      "inline",
      "right",
      "top",
    ]);
    this.presence = getStringOption(attributes.presence, [
      "visible",
      "hidden",
      "inactive",
      "invisible",
    ]);
    this.reserve = Math.ceil(getMeasurement(attributes.reserve));
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.extras = null;
    this.font = null;
    this.margin = null;
    this.para = null;
    this.value = null;
  }

  [$setValue](value) {
    _setValue(this, value);
  }

  [$getExtra](availableSpace) {
    if (!this[$extra]) {
      let { width, height } = availableSpace;
      switch (this.placement) {
        case "left":
        case "right":
        case "inline":
          width = this.reserve <= 0 ? width : this.reserve;
          break;
        case "top":
        case "bottom":
          height = this.reserve <= 0 ? height : this.reserve;
          break;
      }

      this[$extra] = layoutNode(this, { width, height });
    }
    return this[$extra];
  }

  [$toHTML](availableSpace) {
    // TODO: incomplete.
    if (!this.value) {
      return HTMLResult.EMPTY;
    }

    this[$pushPara]();
    const value = this.value[$toHTML](availableSpace).html;

    if (!value) {
      this[$popPara]();
      return HTMLResult.EMPTY;
    }

    const savedReserve = this.reserve;
    if (this.reserve <= 0) {
      const { w, h } = this[$getExtra](availableSpace);
      switch (this.placement) {
        case "left":
        case "right":
        case "inline":
          this.reserve = w;
          break;
        case "top":
        case "bottom":
          this.reserve = h;
          break;
      }
    }

    const children = [];
    if (typeof value === "string") {
      children.push({
        name: "#text",
        value,
      });
    } else {
      children.push(value);
    }

    const style = toStyle(this, "font", "margin", "visibility");
    switch (this.placement) {
      case "left":
      case "right":
        if (this.reserve > 0) {
          style.width = measureToString(this.reserve);
        }
        break;
      case "top":
      case "bottom":
        if (this.reserve > 0) {
          style.height = measureToString(this.reserve);
        }
        break;
    }

    setPara(this, null, value);
    this[$popPara]();

    this.reserve = savedReserve;

    return HTMLResult.success({
      name: "div",
      attributes: {
        style,
        class: ["xfaCaption"],
      },
      children,
    });
  }
}

class Certificate extends StringObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "certificate");
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class Certificates extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "certificates", /* hasChildren = */ true);
    this.credentialServerPolicy = getStringOption(
      attributes.credentialServerPolicy,
      ["optional", "required"]
    );
    this.id = attributes.id || "";
    this.url = attributes.url || "";
    this.urlPolicy = attributes.urlPolicy || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.encryption = null;
    this.issuers = null;
    this.keyUsage = null;
    this.oids = null;
    this.signing = null;
    this.subjectDNs = null;
  }
}

class CheckButton extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "checkButton", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.mark = getStringOption(attributes.mark, [
      "default",
      "check",
      "circle",
      "cross",
      "diamond",
      "square",
      "star",
    ]);
    this.shape = getStringOption(attributes.shape, ["square", "round"]);
    this.size = getMeasurement(attributes.size, "10pt");
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.border = null;
    this.extras = null;
    this.margin = null;
  }

  [$toHTML](availableSpace) {
    // TODO: border, shape and mark.

    const style = toStyle("margin");
    const size = measureToString(this.size);

    style.width = style.height = size;

    let type;
    let className;
    let groupId;
    const field = this[$getParent]()[$getParent]();
    const items =
      (field.items.children.length &&
        field.items.children[0][$toHTML]().html) ||
      [];
    const exportedValue = {
      on: (items[0] !== undefined ? items[0] : "on").toString(),
      off: (items[1] !== undefined ? items[1] : "off").toString(),
    };

    const value = field.value?.[$text]() || "off";
    const checked = value === exportedValue.on || undefined;
    const container = field[$getSubformParent]();
    const fieldId = field[$uid];
    let dataId;

    if (container instanceof ExclGroup) {
      groupId = container[$uid];
      type = "radio";
      className = "xfaRadio";
      dataId = container[$data]?.[$uid] || container[$uid];
    } else {
      type = "checkbox";
      className = "xfaCheckbox";
      dataId = field[$data]?.[$uid] || field[$uid];
    }

    const input = {
      name: "input",
      attributes: {
        class: [className],
        style,
        fieldId,
        dataId,
        type,
        checked,
        xfaOn: exportedValue.on,
        xfaOff: exportedValue.off,
        "aria-label": ariaLabel(field),
        "aria-required": false,
      },
    };

    if (groupId) {
      input.attributes.name = groupId;
    }

    if (isRequired(field)) {
      input.attributes["aria-required"] = true;
      input.attributes.required = true;
    }

    return HTMLResult.success({
      name: "label",
      attributes: {
        class: ["xfaLabel"],
      },
      children: [input],
    });
  }
}

class ChoiceList extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "choiceList", /* hasChildren = */ true);
    this.commitOn = getStringOption(attributes.commitOn, ["select", "exit"]);
    this.id = attributes.id || "";
    this.open = getStringOption(attributes.open, [
      "userControl",
      "always",
      "multiSelect",
      "onEntry",
    ]);
    this.textEntry = getInteger({
      data: attributes.textEntry,
      defaultValue: 0,
      validate: x => x === 1,
    });
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.border = null;
    this.extras = null;
    this.margin = null;
  }

  [$toHTML](availableSpace) {
    // TODO: incomplete.
    const style = toStyle(this, "border", "margin");
    const ui = this[$getParent]();
    const field = ui[$getParent]();
    const fontSize = field.font?.size || 10;
    const optionStyle = {
      fontSize: `calc(${fontSize}px * var(--total-scale-factor))`,
    };
    const children = [];

    if (field.items.children.length > 0) {
      const items = field.items;
      let displayedIndex = 0;
      let saveIndex = 0;
      if (items.children.length === 2) {
        displayedIndex = items.children[0].save;
        saveIndex = 1 - displayedIndex;
      }
      const displayed = items.children[displayedIndex][$toHTML]().html;
      const values = items.children[saveIndex][$toHTML]().html;

      let selected = false;
      const value = field.value?.[$text]() || "";
      for (let i = 0, ii = displayed.length; i < ii; i++) {
        const option = {
          name: "option",
          attributes: {
            value: values[i] || displayed[i],
            style: optionStyle,
          },
          value: displayed[i],
        };
        if (values[i] === value) {
          option.attributes.selected = selected = true;
        }
        children.push(option);
      }

      if (!selected) {
        children.splice(0, 0, {
          name: "option",
          attributes: {
            hidden: true,
            selected: true,
          },
          value: " ",
        });
      }
    }

    const selectAttributes = {
      class: ["xfaSelect"],
      fieldId: field[$uid],
      dataId: field[$data]?.[$uid] || field[$uid],
      style,
      "aria-label": ariaLabel(field),
      "aria-required": false,
    };

    if (isRequired(field)) {
      selectAttributes["aria-required"] = true;
      selectAttributes.required = true;
    }

    if (this.open === "multiSelect") {
      selectAttributes.multiple = true;
    }

    return HTMLResult.success({
      name: "label",
      attributes: {
        class: ["xfaLabel"],
      },
      children: [
        {
          name: "select",
          children,
          attributes: selectAttributes,
        },
      ],
    });
  }
}

class Color extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "color", /* hasChildren = */ true);
    this.cSpace = getStringOption(attributes.cSpace, ["SRGB"]);
    this.id = attributes.id || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.value = attributes.value ? getColor(attributes.value) : "";
    this.extras = null;
  }

  [$hasSettableValue]() {
    return false;
  }

  [$toStyle]() {
    return this.value
      ? Util.makeHexColor(this.value.r, this.value.g, this.value.b)
      : null;
  }
}

class Comb extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "comb");
    this.id = attributes.id || "";
    this.numberOfCells = getInteger({
      data: attributes.numberOfCells,
      defaultValue: 0,
      validate: x => x >= 0,
    });
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class Connect extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "connect", /* hasChildren = */ true);
    this.connection = attributes.connection || "";
    this.id = attributes.id || "";
    this.ref = attributes.ref || "";
    this.usage = getStringOption(attributes.usage, [
      "exportAndImport",
      "exportOnly",
      "importOnly",
    ]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.picture = null;
  }
}

class ContentArea extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "contentArea", /* hasChildren = */ true);
    this.h = getMeasurement(attributes.h);
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.relevant = getRelevant(attributes.relevant);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.w = getMeasurement(attributes.w);
    this.x = getMeasurement(attributes.x, "0pt");
    this.y = getMeasurement(attributes.y, "0pt");
    this.desc = null;
    this.extras = null;
  }

  [$toHTML](availableSpace) {
    // TODO: incomplete.
    const left = measureToString(this.x);
    const top = measureToString(this.y);

    const style = {
      left,
      top,
      width: measureToString(this.w),
      height: measureToString(this.h),
    };

    const classNames = ["xfaContentarea"];

    if (isPrintOnly(this)) {
      classNames.push("xfaPrintOnly");
    }

    return HTMLResult.success({
      name: "div",
      children: [],
      attributes: {
        style,
        class: classNames,
        id: this[$uid],
      },
    });
  }
}

class Corner extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "corner", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.inverted = getInteger({
      data: attributes.inverted,
      defaultValue: 0,
      validate: x => x === 1,
    });
    this.join = getStringOption(attributes.join, ["square", "round"]);
    this.presence = getStringOption(attributes.presence, [
      "visible",
      "hidden",
      "inactive",
      "invisible",
    ]);
    this.radius = getMeasurement(attributes.radius);
    this.stroke = getStringOption(attributes.stroke, [
      "solid",
      "dashDot",
      "dashDotDot",
      "dashed",
      "dotted",
      "embossed",
      "etched",
      "lowered",
      "raised",
    ]);
    this.thickness = getMeasurement(attributes.thickness, "0.5pt");
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.color = null;
    this.extras = null;
  }

  [$toStyle]() {
    // In using CSS it's only possible to handle radius
    // (at least with basic css).
    // Is there a real use (interest ?) of all these properties ?
    // Maybe it's possible to implement them using svg and border-image...
    // TODO: implement all the missing properties.
    const style = toStyle(this, "visibility");
    style.radius = measureToString(this.join === "square" ? 0 : this.radius);
    return style;
  }
}

class DateElement extends ContentObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "date");
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }

  [$finalize]() {
    const date = this[$content].trim();
    this[$content] = date ? new Date(date) : null;
  }

  [$toHTML](availableSpace) {
    return valueToHtml(this[$content] ? this[$content].toString() : "");
  }
}

class DateTime extends ContentObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "dateTime");
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }

  [$finalize]() {
    const date = this[$content].trim();
    this[$content] = date ? new Date(date) : null;
  }

  [$toHTML](availableSpace) {
    return valueToHtml(this[$content] ? this[$content].toString() : "");
  }
}

class DateTimeEdit extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "dateTimeEdit", /* hasChildren = */ true);
    this.hScrollPolicy = getStringOption(attributes.hScrollPolicy, [
      "auto",
      "off",
      "on",
    ]);
    this.id = attributes.id || "";
    this.picker = getStringOption(attributes.picker, ["host", "none"]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.border = null;
    this.comb = null;
    this.extras = null;
    this.margin = null;
  }

  [$toHTML](availableSpace) {
    // TODO: incomplete.
    // When the picker is host we should use type=date for the input
    // but we need to put the buttons outside the text-field.
    const style = toStyle(this, "border", "font", "margin");
    const field = this[$getParent]()[$getParent]();
    const html = {
      name: "input",
      attributes: {
        type: "text",
        fieldId: field[$uid],
        dataId: field[$data]?.[$uid] || field[$uid],
        class: ["xfaTextfield"],
        style,
        "aria-label": ariaLabel(field),
        "aria-required": false,
      },
    };

    if (isRequired(field)) {
      html.attributes["aria-required"] = true;
      html.attributes.required = true;
    }

    return HTMLResult.success({
      name: "label",
      attributes: {
        class: ["xfaLabel"],
      },
      children: [html],
    });
  }
}

class Decimal extends ContentObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "decimal");
    this.fracDigits = getInteger({
      data: attributes.fracDigits,
      defaultValue: 2,
      validate: x => true,
    });
    this.id = attributes.id || "";
    this.leadDigits = getInteger({
      data: attributes.leadDigits,
      defaultValue: -1,
      validate: x => true,
    });
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }

  [$finalize]() {
    const number = parseFloat(this[$content].trim());
    this[$content] = isNaN(number) ? null : number;
  }

  [$toHTML](availableSpace) {
    return valueToHtml(
      this[$content] !== null ? this[$content].toString() : ""
    );
  }
}

class DefaultUi extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "defaultUi", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.extras = null;
  }
}

class Desc extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "desc", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.boolean = new XFAObjectArray();
    this.date = new XFAObjectArray();
    this.dateTime = new XFAObjectArray();
    this.decimal = new XFAObjectArray();
    this.exData = new XFAObjectArray();
    this.float = new XFAObjectArray();
    this.image = new XFAObjectArray();
    this.integer = new XFAObjectArray();
    this.text = new XFAObjectArray();
    this.time = new XFAObjectArray();
  }
}

class DigestMethod extends OptionObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "digestMethod", [
      "",
      "SHA1",
      "SHA256",
      "SHA512",
      "RIPEMD160",
    ]);
    this.id = attributes.id || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class DigestMethods extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "digestMethods", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.type = getStringOption(attributes.type, ["optional", "required"]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.digestMethod = new XFAObjectArray();
  }
}

class Draw extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "draw", /* hasChildren = */ true);
    this.anchorType = getStringOption(attributes.anchorType, [
      "topLeft",
      "bottomCenter",
      "bottomLeft",
      "bottomRight",
      "middleCenter",
      "middleLeft",
      "middleRight",
      "topCenter",
      "topRight",
    ]);
    this.colSpan = getInteger({
      data: attributes.colSpan,
      defaultValue: 1,
      validate: n => n >= 1 || n === -1,
    });
    this.h = attributes.h ? getMeasurement(attributes.h) : "";
    this.hAlign = getStringOption(attributes.hAlign, [
      "left",
      "center",
      "justify",
      "justifyAll",
      "radix",
      "right",
    ]);
    this.id = attributes.id || "";
    this.locale = attributes.locale || "";
    this.maxH = getMeasurement(attributes.maxH, "0pt");
    this.maxW = getMeasurement(attributes.maxW, "0pt");
    this.minH = getMeasurement(attributes.minH, "0pt");
    this.minW = getMeasurement(attributes.minW, "0pt");
    this.name = attributes.name || "";
    this.presence = getStringOption(attributes.presence, [
      "visible",
      "hidden",
      "inactive",
      "invisible",
    ]);
    this.relevant = getRelevant(attributes.relevant);
    this.rotate = getInteger({
      data: attributes.rotate,
      defaultValue: 0,
      validate: x => x % 90 === 0,
    });
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.w = attributes.w ? getMeasurement(attributes.w) : "";
    this.x = getMeasurement(attributes.x, "0pt");
    this.y = getMeasurement(attributes.y, "0pt");
    this.assist = null;
    this.border = null;
    this.caption = null;
    this.desc = null;
    this.extras = null;
    this.font = null;
    this.keep = null;
    this.margin = null;
    this.para = null;
    this.traversal = null;
    this.ui = null;
    this.value = null;
    this.setProperty = new XFAObjectArray();
  }

  [$setValue](value) {
    _setValue(this, value);
  }

  [$toHTML](availableSpace) {
    setTabIndex(this);

    if (this.presence === "hidden" || this.presence === "inactive") {
      return HTMLResult.EMPTY;
    }

    fixDimensions(this);
    this[$pushPara]();

    // If at least one dimension is missing and we've a text
    // then we can guess it in laying out the text.
    const savedW = this.w;
    const savedH = this.h;
    const { w, h, isBroken } = layoutNode(this, availableSpace);
    if (w && this.w === "") {
      // If the parent layout is lr-tb with a w=100 and we already have a child
      // which takes 90 on the current line.
      // If we have a text with a length (in px) equal to 100 then it'll be
      // splitted into almost 10 chunks: so it won't be nice.
      // So if we've potentially more width to provide in some parent containers
      // let's increase it to give a chance to have a better rendering.
      if (isBroken && this[$getSubformParent]()[$isThereMoreWidth]()) {
        this[$popPara]();
        return HTMLResult.FAILURE;
      }

      this.w = w;
    }
    if (h && this.h === "") {
      this.h = h;
    }

    setFirstUnsplittable(this);
    if (!checkDimensions(this, availableSpace)) {
      this.w = savedW;
      this.h = savedH;
      this[$popPara]();
      return HTMLResult.FAILURE;
    }
    unsetFirstUnsplittable(this);

    const style = toStyle(
      this,
      "font",
      "hAlign",
      "dimensions",
      "position",
      "presence",
      "rotate",
      "anchorType",
      "border",
      "margin"
    );

    setMinMaxDimensions(this, style);

    if (style.margin) {
      style.padding = style.margin;
      delete style.margin;
    }

    const classNames = ["xfaDraw"];
    if (this.font) {
      classNames.push("xfaFont");
    }
    if (isPrintOnly(this)) {
      classNames.push("xfaPrintOnly");
    }

    const attributes = {
      style,
      id: this[$uid],
      class: classNames,
    };

    if (this.name) {
      attributes.xfaName = this.name;
    }

    const html = {
      name: "div",
      attributes,
      children: [],
    };

    applyAssist(this, attributes);

    const bbox = computeBbox(this, html, availableSpace);

    const value = this.value ? this.value[$toHTML](availableSpace).html : null;
    if (value === null) {
      this.w = savedW;
      this.h = savedH;
      this[$popPara]();
      return HTMLResult.success(createWrapper(this, html), bbox);
    }

    html.children.push(value);
    setPara(this, style, value);

    this.w = savedW;
    this.h = savedH;

    this[$popPara]();
    return HTMLResult.success(createWrapper(this, html), bbox);
  }
}

class Edge extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "edge", /* hasChildren = */ true);
    this.cap = getStringOption(attributes.cap, ["square", "butt", "round"]);
    this.id = attributes.id || "";
    this.presence = getStringOption(attributes.presence, [
      "visible",
      "hidden",
      "inactive",
      "invisible",
    ]);
    this.stroke = getStringOption(attributes.stroke, [
      "solid",
      "dashDot",
      "dashDotDot",
      "dashed",
      "dotted",
      "embossed",
      "etched",
      "lowered",
      "raised",
    ]);
    this.thickness = getMeasurement(attributes.thickness, "0.5pt");
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.color = null;
    this.extras = null;
  }

  [$toStyle]() {
    // TODO: dashDot & dashDotDot.
    const style = toStyle(this, "visibility");
    Object.assign(style, {
      linecap: this.cap,
      width: measureToString(this.thickness),
      color: this.color ? this.color[$toStyle]() : "#000000",
      style: "",
    });

    if (this.presence !== "visible") {
      style.style = "none";
    } else {
      switch (this.stroke) {
        case "solid":
          style.style = "solid";
          break;
        case "dashDot":
          style.style = "dashed";
          break;
        case "dashDotDot":
          style.style = "dashed";
          break;
        case "dashed":
          style.style = "dashed";
          break;
        case "dotted":
          style.style = "dotted";
          break;
        case "embossed":
          style.style = "ridge";
          break;
        case "etched":
          style.style = "groove";
          break;
        case "lowered":
          style.style = "inset";
          break;
        case "raised":
          style.style = "outset";
          break;
      }
    }
    return style;
  }
}

class Encoding extends OptionObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "encoding", [
      "adbe.x509.rsa_sha1",
      "adbe.pkcs7.detached",
      "adbe.pkcs7.sha1",
    ]);
    this.id = attributes.id || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class Encodings extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "encodings", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.type = getStringOption(attributes.type, ["optional", "required"]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.encoding = new XFAObjectArray();
  }
}

class Encrypt extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "encrypt", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.certificate = null;
  }
}

class EncryptData extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "encryptData", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.operation = getStringOption(attributes.operation, [
      "encrypt",
      "decrypt",
    ]);
    this.target = attributes.target || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.filter = null;
    this.manifest = null;
  }
}

class Encryption extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "encryption", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.type = getStringOption(attributes.type, ["optional", "required"]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.certificate = new XFAObjectArray();
  }
}

class EncryptionMethod extends OptionObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "encryptionMethod", [
      "",
      "AES256-CBC",
      "TRIPLEDES-CBC",
      "AES128-CBC",
      "AES192-CBC",
    ]);
    this.id = attributes.id || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class EncryptionMethods extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "encryptionMethods", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.type = getStringOption(attributes.type, ["optional", "required"]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.encryptionMethod = new XFAObjectArray();
  }
}

class Event extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "event", /* hasChildren = */ true);
    this.activity = getStringOption(attributes.activity, [
      "click",
      "change",
      "docClose",
      "docReady",
      "enter",
      "exit",
      "full",
      "indexChange",
      "initialize",
      "mouseDown",
      "mouseEnter",
      "mouseExit",
      "mouseUp",
      "postExecute",
      "postOpen",
      "postPrint",
      "postSave",
      "postSign",
      "postSubmit",
      "preExecute",
      "preOpen",
      "prePrint",
      "preSave",
      "preSign",
      "preSubmit",
      "ready",
      "validationState",
    ]);
    this.id = attributes.id || "";
    this.listen = getStringOption(attributes.listen, [
      "refOnly",
      "refAndDescendents",
    ]);
    this.name = attributes.name || "";
    this.ref = attributes.ref || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.extras = null;

    // One-of properties
    this.encryptData = null;
    this.execute = null;
    this.script = null;
    this.signData = null;
    this.submit = null;
  }
}

class ExData extends ContentObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "exData");
    this.contentType = attributes.contentType || "";
    this.href = attributes.href || "";
    this.id = attributes.id || "";
    this.maxLength = getInteger({
      data: attributes.maxLength,
      defaultValue: -1,
      validate: x => x >= -1,
    });
    this.name = attributes.name || "";
    this.rid = attributes.rid || "";
    this.transferEncoding = getStringOption(attributes.transferEncoding, [
      "none",
      "base64",
      "package",
    ]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }

  [$isCDATAXml]() {
    return this.contentType === "text/html";
  }

  [$onChild](child) {
    if (
      this.contentType === "text/html" &&
      child[$namespaceId] === NamespaceIds.xhtml.id
    ) {
      this[$content] = child;
      return true;
    }

    if (this.contentType === "text/xml") {
      this[$content] = child;
      return true;
    }

    return false;
  }

  [$toHTML](availableSpace) {
    if (this.contentType !== "text/html" || !this[$content]) {
      // TODO: fix other cases.
      return HTMLResult.EMPTY;
    }

    return this[$content][$toHTML](availableSpace);
  }
}

class ExObject extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "exObject", /* hasChildren = */ true);
    this.archive = attributes.archive || "";
    this.classId = attributes.classId || "";
    this.codeBase = attributes.codeBase || "";
    this.codeType = attributes.codeType || "";
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.extras = null;
    this.boolean = new XFAObjectArray();
    this.date = new XFAObjectArray();
    this.dateTime = new XFAObjectArray();
    this.decimal = new XFAObjectArray();
    this.exData = new XFAObjectArray();
    this.exObject = new XFAObjectArray();
    this.float = new XFAObjectArray();
    this.image = new XFAObjectArray();
    this.integer = new XFAObjectArray();
    this.text = new XFAObjectArray();
    this.time = new XFAObjectArray();
  }
}

class ExclGroup extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "exclGroup", /* hasChildren = */ true);
    this.access = getStringOption(attributes.access, [
      "open",
      "nonInteractive",
      "protected",
      "readOnly",
    ]);
    this.accessKey = attributes.accessKey || "";
    this.anchorType = getStringOption(attributes.anchorType, [
      "topLeft",
      "bottomCenter",
      "bottomLeft",
      "bottomRight",
      "middleCenter",
      "middleLeft",
      "middleRight",
      "topCenter",
      "topRight",
    ]);
    this.colSpan = getInteger({
      data: attributes.colSpan,
      defaultValue: 1,
      validate: n => n >= 1 || n === -1,
    });
    this.h = attributes.h ? getMeasurement(attributes.h) : "";
    this.hAlign = getStringOption(attributes.hAlign, [
      "left",
      "center",
      "justify",
      "justifyAll",
      "radix",
      "right",
    ]);
    this.id = attributes.id || "";
    this.layout = getStringOption(attributes.layout, [
      "position",
      "lr-tb",
      "rl-row",
      "rl-tb",
      "row",
      "table",
      "tb",
    ]);
    this.maxH = getMeasurement(attributes.maxH, "0pt");
    this.maxW = getMeasurement(attributes.maxW, "0pt");
    this.minH = getMeasurement(attributes.minH, "0pt");
    this.minW = getMeasurement(attributes.minW, "0pt");
    this.name = attributes.name || "";
    this.presence = getStringOption(attributes.presence, [
      "visible",
      "hidden",
      "inactive",
      "invisible",
    ]);
    this.relevant = getRelevant(attributes.relevant);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.w = attributes.w ? getMeasurement(attributes.w) : "";
    this.x = getMeasurement(attributes.x, "0pt");
    this.y = getMeasurement(attributes.y, "0pt");
    this.assist = null;
    this.bind = null;
    this.border = null;
    this.calculate = null;
    this.caption = null;
    this.desc = null;
    this.extras = null;
    this.margin = null;
    this.para = null;
    this.traversal = null;
    this.validate = null;
    this.connect = new XFAObjectArray();
    this.event = new XFAObjectArray();
    this.field = new XFAObjectArray();
    this.setProperty = new XFAObjectArray();
  }

  [$isBindable]() {
    return true;
  }

  [$hasSettableValue]() {
    return true;
  }

  [$setValue](value) {
    for (const field of this.field.children) {
      if (!field.value) {
        const nodeValue = new Value({});
        field[$appendChild](nodeValue);
        field.value = nodeValue;
      }

      field.value[$setValue](value);
    }
  }

  [$isThereMoreWidth]() {
    return (
      (this.layout.endsWith("-tb") &&
        this[$extra].attempt === 0 &&
        this[$extra].numberInLine > 0) ||
      this[$getParent]()[$isThereMoreWidth]()
    );
  }

  [$isSplittable]() {
    // We cannot cache the result here because the contentArea
    // can change.
    const parent = this[$getSubformParent]();
    if (!parent[$isSplittable]()) {
      return false;
    }

    if (this[$extra]._isSplittable !== undefined) {
      return this[$extra]._isSplittable;
    }

    if (this.layout === "position" || this.layout.includes("row")) {
      this[$extra]._isSplittable = false;
      return false;
    }

    if (parent.layout?.endsWith("-tb") && parent[$extra].numberInLine !== 0) {
      // See comment in Subform::[$isSplittable] for an explanation.
      return false;
    }

    this[$extra]._isSplittable = true;
    return true;
  }

  [$flushHTML]() {
    return flushHTML(this);
  }

  [$addHTML](html, bbox) {
    addHTML(this, html, bbox);
  }

  [$getAvailableSpace]() {
    return getAvailableSpace(this);
  }

  [$toHTML](availableSpace) {
    setTabIndex(this);
    if (
      this.presence === "hidden" ||
      this.presence === "inactive" ||
      this.h === 0 ||
      this.w === 0
    ) {
      return HTMLResult.EMPTY;
    }

    fixDimensions(this);

    const children = [];
    const attributes = {
      id: this[$uid],
      class: [],
    };

    setAccess(this, attributes.class);

    if (!this[$extra]) {
      this[$extra] = Object.create(null);
    }

    Object.assign(this[$extra], {
      children,
      attributes,
      attempt: 0,
      line: null,
      numberInLine: 0,
      availableSpace: {
        width: Math.min(this.w || Infinity, availableSpace.width),
        height: Math.min(this.h || Infinity, availableSpace.height),
      },
      width: 0,
      height: 0,
      prevHeight: 0,
      currentWidth: 0,
    });

    const isSplittable = this[$isSplittable]();
    if (!isSplittable) {
      setFirstUnsplittable(this);
    }

    if (!checkDimensions(this, availableSpace)) {
      return HTMLResult.FAILURE;
    }
    const filter = new Set(["field"]);

    if (this.layout.includes("row")) {
      const columnWidths = this[$getSubformParent]().columnWidths;
      if (Array.isArray(columnWidths) && columnWidths.length > 0) {
        this[$extra].columnWidths = columnWidths;
        this[$extra].currentColumn = 0;
      }
    }

    const style = toStyle(
      this,
      "anchorType",
      "dimensions",
      "position",
      "presence",
      "border",
      "margin",
      "hAlign"
    );
    const classNames = ["xfaExclgroup"];
    const cl = layoutClass(this);
    if (cl) {
      classNames.push(cl);
    }

    if (isPrintOnly(this)) {
      classNames.push("xfaPrintOnly");
    }

    attributes.style = style;
    attributes.class = classNames;

    if (this.name) {
      attributes.xfaName = this.name;
    }

    this[$pushPara]();
    const isLrTb = this.layout === "lr-tb" || this.layout === "rl-tb";
    const maxRun = isLrTb ? MAX_ATTEMPTS_FOR_LRTB_LAYOUT : 1;
    for (; this[$extra].attempt < maxRun; this[$extra].attempt++) {
      if (isLrTb && this[$extra].attempt === MAX_ATTEMPTS_FOR_LRTB_LAYOUT - 1) {
        // If the layout is lr-tb then having attempt equals to
        // MAX_ATTEMPTS_FOR_LRTB_LAYOUT-1 means that we're trying to layout
        // on the next line so this on is empty.
        this[$extra].numberInLine = 0;
      }
      const result = this[$childrenToHTML]({
        filter,
        include: true,
      });
      if (result.success) {
        break;
      }
      if (result.isBreak()) {
        this[$popPara]();
        return result;
      }
      if (
        isLrTb &&
        this[$extra].attempt === 0 &&
        this[$extra].numberInLine === 0 &&
        !this[$getTemplateRoot]()[$extra].noLayoutFailure
      ) {
        // See comment in Subform::[$toHTML].
        this[$extra].attempt = maxRun;
        break;
      }
    }

    this[$popPara]();

    if (!isSplittable) {
      unsetFirstUnsplittable(this);
    }

    if (this[$extra].attempt === maxRun) {
      if (!isSplittable) {
        delete this[$extra];
      }
      return HTMLResult.FAILURE;
    }

    let marginH = 0;
    let marginV = 0;
    if (this.margin) {
      marginH = this.margin.leftInset + this.margin.rightInset;
      marginV = this.margin.topInset + this.margin.bottomInset;
    }

    const width = Math.max(this[$extra].width + marginH, this.w || 0);
    const height = Math.max(this[$extra].height + marginV, this.h || 0);
    const bbox = [this.x, this.y, width, height];

    if (this.w === "") {
      style.width = measureToString(width);
    }
    if (this.h === "") {
      style.height = measureToString(height);
    }

    const html = {
      name: "div",
      attributes,
      children,
    };

    applyAssist(this, attributes);

    delete this[$extra];

    return HTMLResult.success(createWrapper(this, html), bbox);
  }
}

class Execute extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "execute");
    this.connection = attributes.connection || "";
    this.executeType = getStringOption(attributes.executeType, [
      "import",
      "remerge",
    ]);
    this.id = attributes.id || "";
    this.runAt = getStringOption(attributes.runAt, [
      "client",
      "both",
      "server",
    ]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class Extras extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "extras", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.boolean = new XFAObjectArray();
    this.date = new XFAObjectArray();
    this.dateTime = new XFAObjectArray();
    this.decimal = new XFAObjectArray();
    this.exData = new XFAObjectArray();
    this.extras = new XFAObjectArray();
    this.float = new XFAObjectArray();
    this.image = new XFAObjectArray();
    this.integer = new XFAObjectArray();
    this.text = new XFAObjectArray();
    this.time = new XFAObjectArray();
  }

  // (Spec) The XFA template grammar defines the extras and desc elements,
  // which can be used to add human-readable or machine-readable
  // data to a template.
}

class Field extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "field", /* hasChildren = */ true);
    this.access = getStringOption(attributes.access, [
      "open",
      "nonInteractive",
      "protected",
      "readOnly",
    ]);
    this.accessKey = attributes.accessKey || "";
    this.anchorType = getStringOption(attributes.anchorType, [
      "topLeft",
      "bottomCenter",
      "bottomLeft",
      "bottomRight",
      "middleCenter",
      "middleLeft",
      "middleRight",
      "topCenter",
      "topRight",
    ]);
    this.colSpan = getInteger({
      data: attributes.colSpan,
      defaultValue: 1,
      validate: n => n >= 1 || n === -1,
    });
    this.h = attributes.h ? getMeasurement(attributes.h) : "";
    this.hAlign = getStringOption(attributes.hAlign, [
      "left",
      "center",
      "justify",
      "justifyAll",
      "radix",
      "right",
    ]);
    this.id = attributes.id || "";
    this.locale = attributes.locale || "";
    this.maxH = getMeasurement(attributes.maxH, "0pt");
    this.maxW = getMeasurement(attributes.maxW, "0pt");
    this.minH = getMeasurement(attributes.minH, "0pt");
    this.minW = getMeasurement(attributes.minW, "0pt");
    this.name = attributes.name || "";
    this.presence = getStringOption(attributes.presence, [
      "visible",
      "hidden",
      "inactive",
      "invisible",
    ]);
    this.relevant = getRelevant(attributes.relevant);
    this.rotate = getInteger({
      data: attributes.rotate,
      defaultValue: 0,
      validate: x => x % 90 === 0,
    });
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.w = attributes.w ? getMeasurement(attributes.w) : "";
    this.x = getMeasurement(attributes.x, "0pt");
    this.y = getMeasurement(attributes.y, "0pt");
    this.assist = null;
    this.bind = null;
    this.border = null;
    this.calculate = null;
    this.caption = null;
    this.desc = null;
    this.extras = null;
    this.font = null;
    this.format = null;
    // For a choice list, one list is used to have display entries
    // and the other for the exported values
    this.items = new XFAObjectArray(2);
    this.keep = null;
    this.margin = null;
    this.para = null;
    this.traversal = null;
    this.ui = null;
    this.validate = null;
    this.value = null;
    this.bindItems = new XFAObjectArray();
    this.connect = new XFAObjectArray();
    this.event = new XFAObjectArray();
    this.setProperty = new XFAObjectArray();
  }

  [$isBindable]() {
    return true;
  }

  [$setValue](value) {
    _setValue(this, value);
  }

  [$toHTML](availableSpace) {
    setTabIndex(this);

    if (!this.ui) {
      // It's allowed to not have an ui, specs say:
      //   If the UI element contains no children or is not present,
      //   the application chooses a default user interface for the
      //   container, based on the type of the container's content.

      this.ui = new Ui({});
      this.ui[$globalData] = this[$globalData];
      this[$appendChild](this.ui);
      let node;

      // The items element can have 2 element max and
      // according to the items specs it's likely a good
      // way to guess the correct ui type.
      switch (this.items.children.length) {
        case 0:
          node = new TextEdit({});
          this.ui.textEdit = node;
          break;
        case 1:
          node = new CheckButton({});
          this.ui.checkButton = node;
          break;
        case 2:
          node = new ChoiceList({});
          this.ui.choiceList = node;
          break;
      }
      this.ui[$appendChild](node);
    }

    if (
      !this.ui ||
      this.presence === "hidden" ||
      this.presence === "inactive" ||
      this.h === 0 ||
      this.w === 0
    ) {
      return HTMLResult.EMPTY;
    }

    if (this.caption) {
      // Maybe we already tried to layout this field with
      // another availableSpace, so to avoid to use the cached
      // value just delete it.
      delete this.caption[$extra];
    }

    this[$pushPara]();

    const caption = this.caption
      ? this.caption[$toHTML](availableSpace).html
      : null;
    const savedW = this.w;
    const savedH = this.h;
    let marginH = 0;
    let marginV = 0;
    if (this.margin) {
      marginH = this.margin.leftInset + this.margin.rightInset;
      marginV = this.margin.topInset + this.margin.bottomInset;
    }

    let borderDims = null;
    if (this.w === "" || this.h === "") {
      let width = null;
      let height = null;

      let uiW = 0;
      let uiH = 0;
      if (this.ui.checkButton) {
        uiW = uiH = this.ui.checkButton.size;
      } else {
        const { w, h } = layoutNode(this, availableSpace);
        if (w !== null) {
          uiW = w;
          uiH = h;
        } else {
          uiH = getMetrics(this.font, /* real = */ true).lineNoGap;
        }
      }

      borderDims = getBorderDims(this.ui[$getExtra]());
      uiW += borderDims.w;
      uiH += borderDims.h;

      if (this.caption) {
        const { w, h, isBroken } = this.caption[$getExtra](availableSpace);
        // See comment in Draw::[$toHTML] to have an explanation
        // about this line.
        if (isBroken && this[$getSubformParent]()[$isThereMoreWidth]()) {
          this[$popPara]();
          return HTMLResult.FAILURE;
        }

        width = w;
        height = h;

        switch (this.caption.placement) {
          case "left":
          case "right":
          case "inline":
            width += uiW;
            break;
          case "top":
          case "bottom":
            height += uiH;
            break;
        }
      } else {
        width = uiW;
        height = uiH;
      }

      if (width && this.w === "") {
        width += marginH;
        this.w = Math.min(
          this.maxW <= 0 ? Infinity : this.maxW,
          this.minW + 1 < width ? width : this.minW
        );
      }

      if (height && this.h === "") {
        height += marginV;
        this.h = Math.min(
          this.maxH <= 0 ? Infinity : this.maxH,
          this.minH + 1 < height ? height : this.minH
        );
      }
    }

    this[$popPara]();

    fixDimensions(this);

    setFirstUnsplittable(this);
    if (!checkDimensions(this, availableSpace)) {
      this.w = savedW;
      this.h = savedH;
      this[$popPara]();
      return HTMLResult.FAILURE;
    }
    unsetFirstUnsplittable(this);

    const style = toStyle(
      this,
      "font",
      "dimensions",
      "position",
      "rotate",
      "anchorType",
      "presence",
      "margin",
      "hAlign"
    );

    setMinMaxDimensions(this, style);

    const classNames = ["xfaField"];
    // If no font, font properties are inherited.
    if (this.font) {
      classNames.push("xfaFont");
    }

    if (isPrintOnly(this)) {
      classNames.push("xfaPrintOnly");
    }

    const attributes = {
      style,
      id: this[$uid],
      class: classNames,
    };

    if (style.margin) {
      style.padding = style.margin;
      delete style.margin;
    }

    setAccess(this, classNames);

    if (this.name) {
      attributes.xfaName = this.name;
    }

    const children = [];
    const html = {
      name: "div",
      attributes,
      children,
    };

    applyAssist(this, attributes);

    const borderStyle = this.border ? this.border[$toStyle]() : null;
    const bbox = computeBbox(this, html, availableSpace);
    const ui = this.ui[$toHTML]().html;
    if (!ui) {
      Object.assign(style, borderStyle);
      return HTMLResult.success(createWrapper(this, html), bbox);
    }

    if (this[$tabIndex]) {
      if (ui.children?.[0]) {
        ui.children[0].attributes.tabindex = this[$tabIndex];
      } else {
        ui.attributes.tabindex = this[$tabIndex];
      }
    }

    if (!ui.attributes.style) {
      ui.attributes.style = Object.create(null);
    }

    let aElement = null;

    if (this.ui.button) {
      if (ui.children.length === 1) {
        [aElement] = ui.children.splice(0, 1);
      }
      Object.assign(ui.attributes.style, borderStyle);
    } else {
      Object.assign(style, borderStyle);
    }

    children.push(ui);

    if (this.value) {
      if (this.ui.imageEdit) {
        ui.children.push(this.value[$toHTML]().html);
      } else if (!this.ui.button) {
        let value = "";
        if (this.value.exData) {
          value = this.value.exData[$text]();
        } else if (this.value.text) {
          value = this.value.text[$getExtra]();
        } else {
          const htmlValue = this.value[$toHTML]().html;
          if (htmlValue !== null) {
            value = htmlValue.children[0].value;
          }
        }
        if (this.ui.textEdit && this.value.text?.maxChars) {
          ui.children[0].attributes.maxLength = this.value.text.maxChars;
        }

        if (value) {
          if (this.ui.numericEdit) {
            value = parseFloat(value);
            value = isNaN(value) ? "" : value.toString();
          }

          if (ui.children[0].name === "textarea") {
            ui.children[0].attributes.textContent = value;
          } else {
            ui.children[0].attributes.value = value;
          }
        }
      }
    }

    if (!this.ui.imageEdit && ui.children?.[0] && this.h) {
      borderDims = borderDims || getBorderDims(this.ui[$getExtra]());

      let captionHeight = 0;
      if (this.caption && ["top", "bottom"].includes(this.caption.placement)) {
        captionHeight = this.caption.reserve;
        if (captionHeight <= 0) {
          captionHeight = this.caption[$getExtra](availableSpace).h;
        }
        const inputHeight = this.h - captionHeight - marginV - borderDims.h;
        ui.children[0].attributes.style.height = measureToString(inputHeight);
      } else {
        ui.children[0].attributes.style.height = "100%";
      }
    }

    if (aElement) {
      ui.children.push(aElement);
    }

    if (!caption) {
      if (ui.attributes.class) {
        // Even if no caption this class will help to center the ui.
        ui.attributes.class.push("xfaLeft");
      }
      this.w = savedW;
      this.h = savedH;

      return HTMLResult.success(createWrapper(this, html), bbox);
    }

    if (this.ui.button) {
      if (style.padding) {
        delete style.padding;
      }
      if (caption.name === "div") {
        caption.name = "span";
      }
      ui.children.push(caption);
      return HTMLResult.success(html, bbox);
    } else if (this.ui.checkButton) {
      caption.attributes.class[0] = "xfaCaptionForCheckButton";
    }

    if (!ui.attributes.class) {
      ui.attributes.class = [];
    }

    ui.children.splice(0, 0, caption);

    switch (this.caption.placement) {
      case "left":
        ui.attributes.class.push("xfaLeft");
        break;
      case "right":
        ui.attributes.class.push("xfaRight");
        break;
      case "top":
        ui.attributes.class.push("xfaTop");
        break;
      case "bottom":
        ui.attributes.class.push("xfaBottom");
        break;
      case "inline":
        // TODO;
        ui.attributes.class.push("xfaLeft");
        break;
    }

    this.w = savedW;
    this.h = savedH;
    return HTMLResult.success(createWrapper(this, html), bbox);
  }
}

class Fill extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "fill", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.presence = getStringOption(attributes.presence, [
      "visible",
      "hidden",
      "inactive",
      "invisible",
    ]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.color = null;
    this.extras = null;

    // One-of properties or none
    this.linear = null;
    this.pattern = null;
    this.radial = null;
    this.solid = null;
    this.stipple = null;
  }

  [$toStyle]() {
    const parent = this[$getParent]();
    const grandpa = parent[$getParent]();
    const ggrandpa = grandpa[$getParent]();
    const style = Object.create(null);

    // Use for color, i.e. #...
    let propName = "color";

    // Use for non-color, i.e. gradient, radial-gradient...
    let altPropName = propName;

    if (parent instanceof Border) {
      propName = "background-color";
      altPropName = "background";
      if (ggrandpa instanceof Ui) {
        // The default fill color is white.
        style.backgroundColor = "white";
      }
    }
    if (parent instanceof Rectangle || parent instanceof Arc) {
      propName = altPropName = "fill";
      style.fill = "white";
    }

    for (const name of Object.getOwnPropertyNames(this)) {
      if (name === "extras" || name === "color") {
        continue;
      }
      const obj = this[name];
      if (!(obj instanceof XFAObject)) {
        continue;
      }

      const color = obj[$toStyle](this.color);
      if (color) {
        style[color.startsWith("#") ? propName : altPropName] = color;
      }
      return style;
    }

    if (this.color?.value) {
      const color = this.color[$toStyle]();
      style[color.startsWith("#") ? propName : altPropName] = color;
    }

    return style;
  }
}

class Filter extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "filter", /* hasChildren = */ true);
    this.addRevocationInfo = getStringOption(attributes.addRevocationInfo, [
      "",
      "required",
      "optional",
      "none",
    ]);
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.version = getInteger({
      data: this.version,
      defaultValue: 5,
      validate: x => x >= 1 && x <= 5,
    });
    this.appearanceFilter = null;
    this.certificates = null;
    this.digestMethods = null;
    this.encodings = null;
    this.encryptionMethods = null;
    this.handler = null;
    this.lockDocument = null;
    this.mdp = null;
    this.reasons = null;
    this.timeStamp = null;
  }
}

class Float extends ContentObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "float");
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }

  [$finalize]() {
    const number = parseFloat(this[$content].trim());
    this[$content] = isNaN(number) ? null : number;
  }

  [$toHTML](availableSpace) {
    return valueToHtml(
      this[$content] !== null ? this[$content].toString() : ""
    );
  }
}

class Font extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "font", /* hasChildren = */ true);
    this.baselineShift = getMeasurement(attributes.baselineShift);
    this.fontHorizontalScale = getFloat({
      data: attributes.fontHorizontalScale,
      defaultValue: 100,
      validate: x => x >= 0,
    });
    this.fontVerticalScale = getFloat({
      data: attributes.fontVerticalScale,
      defaultValue: 100,
      validate: x => x >= 0,
    });
    this.id = attributes.id || "";
    this.kerningMode = getStringOption(attributes.kerningMode, [
      "none",
      "pair",
    ]);
    this.letterSpacing = getMeasurement(attributes.letterSpacing, "0");
    this.lineThrough = getInteger({
      data: attributes.lineThrough,
      defaultValue: 0,
      validate: x => x === 1 || x === 2,
    });
    this.lineThroughPeriod = getStringOption(attributes.lineThroughPeriod, [
      "all",
      "word",
    ]);
    this.overline = getInteger({
      data: attributes.overline,
      defaultValue: 0,
      validate: x => x === 1 || x === 2,
    });
    this.overlinePeriod = getStringOption(attributes.overlinePeriod, [
      "all",
      "word",
    ]);
    this.posture = getStringOption(attributes.posture, ["normal", "italic"]);
    this.size = getMeasurement(attributes.size, "10pt");
    this.typeface = attributes.typeface || "Courier";
    this.underline = getInteger({
      data: attributes.underline,
      defaultValue: 0,
      validate: x => x === 1 || x === 2,
    });
    this.underlinePeriod = getStringOption(attributes.underlinePeriod, [
      "all",
      "word",
    ]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.weight = getStringOption(attributes.weight, ["normal", "bold"]);
    this.extras = null;
    this.fill = null;
  }

  [$clean](builder) {
    super[$clean](builder);
    this[$globalData].usedTypefaces.add(this.typeface);
  }

  [$toStyle]() {
    const style = toStyle(this, "fill");
    const color = style.color;
    if (color) {
      if (color === "#000000") {
        // Default font color.
        delete style.color;
      } else if (!color.startsWith("#")) {
        // We've a gradient which is not possible for a font color
        // so use a workaround.
        style.background = color;
        style.backgroundClip = "text";
        style.color = "transparent";
      }
    }

    if (this.baselineShift) {
      style.verticalAlign = measureToString(this.baselineShift);
    }

    // TODO: fontHorizontalScale
    // TODO: fontVerticalScale

    style.fontKerning = this.kerningMode === "none" ? "none" : "normal";
    style.letterSpacing = measureToString(this.letterSpacing);

    if (this.lineThrough !== 0) {
      style.textDecoration = "line-through";
      if (this.lineThrough === 2) {
        style.textDecorationStyle = "double";
      }
    }

    // TODO: lineThroughPeriod

    if (this.overline !== 0) {
      style.textDecoration = "overline";
      if (this.overline === 2) {
        style.textDecorationStyle = "double";
      }
    }

    // TODO: overlinePeriod

    style.fontStyle = this.posture;
    style.fontSize = measureToString(0.99 * this.size);

    setFontFamily(this, this, this[$globalData].fontFinder, style);

    if (this.underline !== 0) {
      style.textDecoration = "underline";
      if (this.underline === 2) {
        style.textDecorationStyle = "double";
      }
    }

    // TODO: underlinePeriod

    style.fontWeight = this.weight;

    return style;
  }
}

class Format extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "format", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.extras = null;
    this.picture = null;
  }
}

class Handler extends StringObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "handler");
    this.id = attributes.id || "";
    this.type = getStringOption(attributes.type, ["optional", "required"]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class Hyphenation extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "hyphenation");
    this.excludeAllCaps = getInteger({
      data: attributes.excludeAllCaps,
      defaultValue: 0,
      validate: x => x === 1,
    });
    this.excludeInitialCap = getInteger({
      data: attributes.excludeInitialCap,
      defaultValue: 0,
      validate: x => x === 1,
    });
    this.hyphenate = getInteger({
      data: attributes.hyphenate,
      defaultValue: 0,
      validate: x => x === 1,
    });
    this.id = attributes.id || "";
    this.pushCharacterCount = getInteger({
      data: attributes.pushCharacterCount,
      defaultValue: 3,
      validate: x => x >= 0,
    });
    this.remainCharacterCount = getInteger({
      data: attributes.remainCharacterCount,
      defaultValue: 3,
      validate: x => x >= 0,
    });
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.wordCharacterCount = getInteger({
      data: attributes.wordCharacterCount,
      defaultValue: 7,
      validate: x => x >= 0,
    });
  }
}

class Image extends StringObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "image");
    this.aspect = getStringOption(attributes.aspect, [
      "fit",
      "actual",
      "height",
      "none",
      "width",
    ]);
    this.contentType = attributes.contentType || "";
    this.href = attributes.href || "";
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.transferEncoding = getStringOption(attributes.transferEncoding, [
      "base64",
      "none",
      "package",
    ]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }

  [$toHTML]() {
    if (this.contentType && !MIMES.has(this.contentType.toLowerCase())) {
      return HTMLResult.EMPTY;
    }

    let buffer =
      this[$globalData].images && this[$globalData].images.get(this.href);
    if (!buffer && (this.href || !this[$content])) {
      // In general, we don't get remote data and use what we have
      // in the pdf itself, so no picture for non null href.
      return HTMLResult.EMPTY;
    }

    if (!buffer && this.transferEncoding === "base64") {
      buffer = fromBase64Util(this[$content]);
    }

    if (!buffer) {
      return HTMLResult.EMPTY;
    }

    if (!this.contentType) {
      for (const [header, type] of IMAGES_HEADERS) {
        if (
          buffer.length > header.length &&
          header.every((x, i) => x === buffer[i])
        ) {
          this.contentType = type;
          break;
        }
      }
      if (!this.contentType) {
        return HTMLResult.EMPTY;
      }
    }

    // TODO: Firefox doesn't support natively tiff (and tif) format.
    const blob = new Blob([buffer], { type: this.contentType });
    let style;
    switch (this.aspect) {
      case "fit":
      case "actual":
        // TODO: check what to do with actual.
        // Normally we should return {auto, auto} for it but
        // it implies some wrong rendering (see xfa_bug1716816.pdf).
        break;
      case "height":
        style = {
          height: "100%",
          objectFit: "fill",
        };
        break;
      case "none":
        style = {
          width: "100%",
          height: "100%",
          objectFit: "fill",
        };
        break;
      case "width":
        style = {
          width: "100%",
          objectFit: "fill",
        };
        break;
    }
    const parent = this[$getParent]();
    return HTMLResult.success({
      name: "img",
      attributes: {
        class: ["xfaImage"],
        style,
        src: URL.createObjectURL(blob),
        alt: parent ? ariaLabel(parent[$getParent]()) : null,
      },
    });
  }
}

class ImageEdit extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "imageEdit", /* hasChildren = */ true);
    this.data = getStringOption(attributes.data, ["link", "embed"]);
    this.id = attributes.id || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.border = null;
    this.extras = null;
    this.margin = null;
  }

  [$toHTML](availableSpace) {
    if (this.data === "embed") {
      return HTMLResult.success({
        name: "div",
        children: [],
        attributes: {},
      });
    }

    return HTMLResult.EMPTY;
  }
}

class Integer extends ContentObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "integer");
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }

  [$finalize]() {
    const number = parseInt(this[$content].trim(), 10);
    this[$content] = isNaN(number) ? null : number;
  }

  [$toHTML](availableSpace) {
    return valueToHtml(
      this[$content] !== null ? this[$content].toString() : ""
    );
  }
}

class Issuers extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "issuers", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.type = getStringOption(attributes.type, ["optional", "required"]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.certificate = new XFAObjectArray();
  }
}

class Items extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "items", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.presence = getStringOption(attributes.presence, [
      "visible",
      "hidden",
      "inactive",
      "invisible",
    ]);
    this.ref = attributes.ref || "";
    this.save = getInteger({
      data: attributes.save,
      defaultValue: 0,
      validate: x => x === 1,
    });
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.boolean = new XFAObjectArray();
    this.date = new XFAObjectArray();
    this.dateTime = new XFAObjectArray();
    this.decimal = new XFAObjectArray();
    this.exData = new XFAObjectArray();
    this.float = new XFAObjectArray();
    this.image = new XFAObjectArray();
    this.integer = new XFAObjectArray();
    this.text = new XFAObjectArray();
    this.time = new XFAObjectArray();
  }

  [$toHTML]() {
    const output = [];
    for (const child of this[$getChildren]()) {
      output.push(child[$text]());
    }
    return HTMLResult.success(output);
  }
}

class Keep extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "keep", /* hasChildren = */ true);
    this.id = attributes.id || "";
    const options = ["none", "contentArea", "pageArea"];
    this.intact = getStringOption(attributes.intact, options);
    this.next = getStringOption(attributes.next, options);
    this.previous = getStringOption(attributes.previous, options);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.extras = null;
  }
}

class KeyUsage extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "keyUsage");
    const options = ["", "yes", "no"];
    this.crlSign = getStringOption(attributes.crlSign, options);
    this.dataEncipherment = getStringOption(
      attributes.dataEncipherment,
      options
    );
    this.decipherOnly = getStringOption(attributes.decipherOnly, options);
    this.digitalSignature = getStringOption(
      attributes.digitalSignature,
      options
    );
    this.encipherOnly = getStringOption(attributes.encipherOnly, options);
    this.id = attributes.id || "";
    this.keyAgreement = getStringOption(attributes.keyAgreement, options);
    this.keyCertSign = getStringOption(attributes.keyCertSign, options);
    this.keyEncipherment = getStringOption(attributes.keyEncipherment, options);
    this.nonRepudiation = getStringOption(attributes.nonRepudiation, options);
    this.type = getStringOption(attributes.type, ["optional", "required"]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class Line extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "line", /* hasChildren = */ true);
    this.hand = getStringOption(attributes.hand, ["even", "left", "right"]);
    this.id = attributes.id || "";
    this.slope = getStringOption(attributes.slope, ["\\", "/"]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.edge = null;
  }

  [$toHTML]() {
    const parent = this[$getParent]()[$getParent]();
    const edge = this.edge || new Edge({});
    const edgeStyle = edge[$toStyle]();
    const style = Object.create(null);
    const thickness = edge.presence === "visible" ? edge.thickness : 0;
    style.strokeWidth = measureToString(thickness);
    style.stroke = edgeStyle.color;
    let x1, y1, x2, y2;
    let width = "100%";
    let height = "100%";

    if (parent.w <= thickness) {
      [x1, y1, x2, y2] = ["50%", 0, "50%", "100%"];
      width = style.strokeWidth;
    } else if (parent.h <= thickness) {
      [x1, y1, x2, y2] = [0, "50%", "100%", "50%"];
      height = style.strokeWidth;
    } else if (this.slope === "\\") {
      [x1, y1, x2, y2] = [0, 0, "100%", "100%"];
    } else {
      [x1, y1, x2, y2] = [0, "100%", "100%", 0];
    }

    const line = {
      name: "line",
      attributes: {
        xmlns: SVG_NS,
        x1,
        y1,
        x2,
        y2,
        style,
      },
    };

    const svg = {
      name: "svg",
      children: [line],
      attributes: {
        xmlns: SVG_NS,
        width,
        height,
        style: {
          overflow: "visible",
        },
      },
    };

    if (hasMargin(parent)) {
      return HTMLResult.success({
        name: "div",
        attributes: {
          style: {
            display: "inline",
            width: "100%",
            height: "100%",
          },
        },
        children: [svg],
      });
    }

    svg.attributes.style.position = "absolute";
    return HTMLResult.success(svg);
  }
}

class Linear extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "linear", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.type = getStringOption(attributes.type, [
      "toRight",
      "toBottom",
      "toLeft",
      "toTop",
    ]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.color = null;
    this.extras = null;
  }

  [$toStyle](startColor) {
    startColor = startColor ? startColor[$toStyle]() : "#FFFFFF";
    const transf = this.type.replace(/([RBLT])/, " $1").toLowerCase();
    const endColor = this.color ? this.color[$toStyle]() : "#000000";
    return `linear-gradient(${transf}, ${startColor}, ${endColor})`;
  }
}

class LockDocument extends ContentObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "lockDocument");
    this.id = attributes.id || "";
    this.type = getStringOption(attributes.type, ["optional", "required"]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }

  [$finalize]() {
    this[$content] = getStringOption(this[$content], ["auto", "0", "1"]);
  }
}

class Manifest extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "manifest", /* hasChildren = */ true);
    this.action = getStringOption(attributes.action, [
      "include",
      "all",
      "exclude",
    ]);
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.extras = null;
    this.ref = new XFAObjectArray();
  }
}

class Margin extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "margin", /* hasChildren = */ true);
    this.bottomInset = getMeasurement(attributes.bottomInset, "0");
    this.id = attributes.id || "";
    this.leftInset = getMeasurement(attributes.leftInset, "0");
    this.rightInset = getMeasurement(attributes.rightInset, "0");
    this.topInset = getMeasurement(attributes.topInset, "0");
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.extras = null;
  }

  [$toStyle]() {
    return {
      margin:
        measureToString(this.topInset) +
        " " +
        measureToString(this.rightInset) +
        " " +
        measureToString(this.bottomInset) +
        " " +
        measureToString(this.leftInset),
    };
  }
}

class Mdp extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "mdp");
    this.id = attributes.id || "";
    this.permissions = getInteger({
      data: attributes.permissions,
      defaultValue: 2,
      validate: x => x === 1 || x === 3,
    });
    this.signatureType = getStringOption(attributes.signatureType, [
      "filler",
      "author",
    ]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class Medium extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "medium");
    this.id = attributes.id || "";
    this.imagingBBox = getBBox(attributes.imagingBBox);
    this.long = getMeasurement(attributes.long);
    this.orientation = getStringOption(attributes.orientation, [
      "portrait",
      "landscape",
    ]);
    this.short = getMeasurement(attributes.short);
    this.stock = attributes.stock || "";
    this.trayIn = getStringOption(attributes.trayIn, [
      "auto",
      "delegate",
      "pageFront",
    ]);
    this.trayOut = getStringOption(attributes.trayOut, ["auto", "delegate"]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class Message extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "message", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.text = new XFAObjectArray();
  }
}

class NumericEdit extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "numericEdit", /* hasChildren = */ true);
    this.hScrollPolicy = getStringOption(attributes.hScrollPolicy, [
      "auto",
      "off",
      "on",
    ]);
    this.id = attributes.id || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.border = null;
    this.comb = null;
    this.extras = null;
    this.margin = null;
  }

  [$toHTML](availableSpace) {
    // TODO: incomplete.
    const style = toStyle(this, "border", "font", "margin");
    const field = this[$getParent]()[$getParent]();
    const html = {
      name: "input",
      attributes: {
        type: "text",
        fieldId: field[$uid],
        dataId: field[$data]?.[$uid] || field[$uid],
        class: ["xfaTextfield"],
        style,
        "aria-label": ariaLabel(field),
        "aria-required": false,
      },
    };

    if (isRequired(field)) {
      html.attributes["aria-required"] = true;
      html.attributes.required = true;
    }

    return HTMLResult.success({
      name: "label",
      attributes: {
        class: ["xfaLabel"],
      },
      children: [html],
    });
  }
}

class Occur extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "occur", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.initial =
      attributes.initial !== ""
        ? getInteger({
            data: attributes.initial,
            defaultValue: "",
            validate: x => true,
          })
        : "";
    this.max =
      attributes.max !== ""
        ? getInteger({
            data: attributes.max,
            defaultValue: 1,
            validate: x => true,
          })
        : "";
    this.min =
      attributes.min !== ""
        ? getInteger({
            data: attributes.min,
            defaultValue: 1,
            validate: x => true,
          })
        : "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.extras = null;
  }

  [$clean]() {
    const parent = this[$getParent]();
    const originalMin = this.min;

    if (this.min === "") {
      this.min =
        parent instanceof PageArea || parent instanceof PageSet ? 0 : 1;
    }
    if (this.max === "") {
      if (originalMin === "") {
        this.max =
          parent instanceof PageArea || parent instanceof PageSet ? -1 : 1;
      } else {
        this.max = this.min;
      }
    }

    if (this.max !== -1 && this.max < this.min) {
      this.max = this.min;
    }

    if (this.initial === "") {
      this.initial = parent instanceof Template ? 1 : this.min;
    }
  }
}

class Oid extends StringObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "oid");
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class Oids extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "oids", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.type = getStringOption(attributes.type, ["optional", "required"]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.oid = new XFAObjectArray();
  }
}

class Overflow extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "overflow");
    this.id = attributes.id || "";
    this.leader = attributes.leader || "";
    this.target = attributes.target || "";
    this.trailer = attributes.trailer || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }

  [$getExtra]() {
    if (!this[$extra]) {
      const parent = this[$getParent]();
      const root = this[$getTemplateRoot]();
      const target = root[$searchNode](this.target, parent);
      const leader = root[$searchNode](this.leader, parent);
      const trailer = root[$searchNode](this.trailer, parent);
      this[$extra] = {
        target: target?.[0] || null,
        leader: leader?.[0] || null,
        trailer: trailer?.[0] || null,
        addLeader: false,
        addTrailer: false,
      };
    }
    return this[$extra];
  }
}

class PageArea extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "pageArea", /* hasChildren = */ true);
    this.blankOrNotBlank = getStringOption(attributes.blankOrNotBlank, [
      "any",
      "blank",
      "notBlank",
    ]);
    this.id = attributes.id || "";
    this.initialNumber = getInteger({
      data: attributes.initialNumber,
      defaultValue: 1,
      validate: x => true,
    });
    this.name = attributes.name || "";
    this.numbered = getInteger({
      data: attributes.numbered,
      defaultValue: 1,
      validate: x => true,
    });
    this.oddOrEven = getStringOption(attributes.oddOrEven, [
      "any",
      "even",
      "odd",
    ]);
    this.pagePosition = getStringOption(attributes.pagePosition, [
      "any",
      "first",
      "last",
      "only",
      "rest",
    ]);
    this.relevant = getRelevant(attributes.relevant);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.desc = null;
    this.extras = null;
    this.medium = null;
    this.occur = null;
    this.area = new XFAObjectArray();
    this.contentArea = new XFAObjectArray();
    this.draw = new XFAObjectArray();
    this.exclGroup = new XFAObjectArray();
    this.field = new XFAObjectArray();
    this.subform = new XFAObjectArray();
  }

  [$isUsable]() {
    if (!this[$extra]) {
      this[$extra] = {
        numberOfUse: 0,
      };
      return true;
    }
    return (
      !this.occur ||
      this.occur.max === -1 ||
      this[$extra].numberOfUse < this.occur.max
    );
  }

  [$cleanPage]() {
    delete this[$extra];
  }

  [$getNextPage]() {
    if (!this[$extra]) {
      this[$extra] = {
        numberOfUse: 0,
      };
    }

    const parent = this[$getParent]();
    if (parent.relation === "orderedOccurrence") {
      if (this[$isUsable]()) {
        this[$extra].numberOfUse += 1;
        return this;
      }
    }

    return parent[$getNextPage]();
  }

  [$getAvailableSpace]() {
    return this[$extra].space || { width: 0, height: 0 };
  }

  [$toHTML]() {
    // TODO: incomplete.
    if (!this[$extra]) {
      this[$extra] = {
        numberOfUse: 1,
      };
    }

    const children = [];
    this[$extra].children = children;

    const style = Object.create(null);
    if (this.medium && this.medium.short && this.medium.long) {
      style.width = measureToString(this.medium.short);
      style.height = measureToString(this.medium.long);
      this[$extra].space = {
        width: this.medium.short,
        height: this.medium.long,
      };
      if (this.medium.orientation === "landscape") {
        const x = style.width;
        style.width = style.height;
        style.height = x;
        this[$extra].space = {
          width: this.medium.long,
          height: this.medium.short,
        };
      }
    } else {
      warn("XFA - No medium specified in pageArea: please file a bug.");
    }

    this[$childrenToHTML]({
      filter: new Set(["area", "draw", "field", "subform"]),
      include: true,
    });

    // contentarea must be the last container to be sure it is
    // on top of the others.
    this[$childrenToHTML]({
      filter: new Set(["contentArea"]),
      include: true,
    });

    return HTMLResult.success({
      name: "div",
      children,
      attributes: {
        class: ["xfaPage"],
        id: this[$uid],
        style,
        xfaName: this.name,
      },
    });
  }
}

class PageSet extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "pageSet", /* hasChildren = */ true);
    this.duplexImposition = getStringOption(attributes.duplexImposition, [
      "longEdge",
      "shortEdge",
    ]);
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.relation = getStringOption(attributes.relation, [
      "orderedOccurrence",
      "duplexPaginated",
      "simplexPaginated",
    ]);
    this.relevant = getRelevant(attributes.relevant);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.extras = null;
    this.occur = null;
    this.pageArea = new XFAObjectArray();
    this.pageSet = new XFAObjectArray();
  }

  [$cleanPage]() {
    for (const page of this.pageArea.children) {
      page[$cleanPage]();
    }
    for (const page of this.pageSet.children) {
      page[$cleanPage]();
    }
  }

  [$isUsable]() {
    return (
      !this.occur ||
      this.occur.max === -1 ||
      this[$extra].numberOfUse < this.occur.max
    );
  }

  [$getNextPage]() {
    if (!this[$extra]) {
      this[$extra] = {
        numberOfUse: 1,
        pageIndex: -1,
        pageSetIndex: -1,
      };
    }

    if (this.relation === "orderedOccurrence") {
      if (this[$extra].pageIndex + 1 < this.pageArea.children.length) {
        this[$extra].pageIndex += 1;
        const pageArea = this.pageArea.children[this[$extra].pageIndex];
        return pageArea[$getNextPage]();
      }

      if (this[$extra].pageSetIndex + 1 < this.pageSet.children.length) {
        this[$extra].pageSetIndex += 1;
        return this.pageSet.children[this[$extra].pageSetIndex][$getNextPage]();
      }

      if (this[$isUsable]()) {
        this[$extra].numberOfUse += 1;
        this[$extra].pageIndex = -1;
        this[$extra].pageSetIndex = -1;
        return this[$getNextPage]();
      }

      const parent = this[$getParent]();
      if (parent instanceof PageSet) {
        return parent[$getNextPage]();
      }

      this[$cleanPage]();
      return this[$getNextPage]();
    }
    const pageNumber = this[$getTemplateRoot]()[$extra].pageNumber;
    const parity = pageNumber % 2 === 0 ? "even" : "odd";
    const position = pageNumber === 0 ? "first" : "rest";

    let page = this.pageArea.children.find(
      p => p.oddOrEven === parity && p.pagePosition === position
    );
    if (page) {
      return page;
    }

    page = this.pageArea.children.find(
      p => p.oddOrEven === "any" && p.pagePosition === position
    );
    if (page) {
      return page;
    }

    page = this.pageArea.children.find(
      p => p.oddOrEven === "any" && p.pagePosition === "any"
    );
    if (page) {
      return page;
    }

    return this.pageArea.children[0];
  }
}

class Para extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "para", /* hasChildren = */ true);
    this.hAlign = getStringOption(attributes.hAlign, [
      "left",
      "center",
      "justify",
      "justifyAll",
      "radix",
      "right",
    ]);
    this.id = attributes.id || "";
    this.lineHeight = attributes.lineHeight
      ? getMeasurement(attributes.lineHeight, "0pt")
      : "";
    this.marginLeft = attributes.marginLeft
      ? getMeasurement(attributes.marginLeft, "0pt")
      : "";
    this.marginRight = attributes.marginRight
      ? getMeasurement(attributes.marginRight, "0pt")
      : "";
    this.orphans = getInteger({
      data: attributes.orphans,
      defaultValue: 0,
      validate: x => x >= 0,
    });
    this.preserve = attributes.preserve || "";
    this.radixOffset = attributes.radixOffset
      ? getMeasurement(attributes.radixOffset, "0pt")
      : "";
    this.spaceAbove = attributes.spaceAbove
      ? getMeasurement(attributes.spaceAbove, "0pt")
      : "";
    this.spaceBelow = attributes.spaceBelow
      ? getMeasurement(attributes.spaceBelow, "0pt")
      : "";
    this.tabDefault = attributes.tabDefault
      ? getMeasurement(this.tabDefault)
      : "";
    this.tabStops = (attributes.tabStops || "")
      .trim()
      .split(/\s+/)
      .map((x, i) => (i % 2 === 1 ? getMeasurement(x) : x));
    this.textIndent = attributes.textIndent
      ? getMeasurement(attributes.textIndent, "0pt")
      : "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.vAlign = getStringOption(attributes.vAlign, [
      "top",
      "bottom",
      "middle",
    ]);
    this.widows = getInteger({
      data: attributes.widows,
      defaultValue: 0,
      validate: x => x >= 0,
    });
    this.hyphenation = null;
  }

  [$toStyle]() {
    const style = toStyle(this, "hAlign");
    if (this.marginLeft !== "") {
      style.paddingLeft = measureToString(this.marginLeft);
    }
    if (this.marginRight !== "") {
      style.paddingRight = measureToString(this.marginRight);
    }
    if (this.spaceAbove !== "") {
      style.paddingTop = measureToString(this.spaceAbove);
    }
    if (this.spaceBelow !== "") {
      style.paddingBottom = measureToString(this.spaceBelow);
    }
    if (this.textIndent !== "") {
      style.textIndent = measureToString(this.textIndent);
      fixTextIndent(style);
    }

    if (this.lineHeight > 0) {
      style.lineHeight = measureToString(this.lineHeight);
    }

    if (this.tabDefault !== "") {
      style.tabSize = measureToString(this.tabDefault);
    }

    if (this.tabStops.length > 0) {
      // TODO
    }

    if (this.hyphenatation) {
      Object.assign(style, this.hyphenatation[$toStyle]());
    }

    return style;
  }
}

class PasswordEdit extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "passwordEdit", /* hasChildren = */ true);
    this.hScrollPolicy = getStringOption(attributes.hScrollPolicy, [
      "auto",
      "off",
      "on",
    ]);
    this.id = attributes.id || "";
    this.passwordChar = attributes.passwordChar || "*";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.border = null;
    this.extras = null;
    this.margin = null;
  }
}

class Pattern extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "pattern", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.type = getStringOption(attributes.type, [
      "crossHatch",
      "crossDiagonal",
      "diagonalLeft",
      "diagonalRight",
      "horizontal",
      "vertical",
    ]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.color = null;
    this.extras = null;
  }

  [$toStyle](startColor) {
    startColor = startColor ? startColor[$toStyle]() : "#FFFFFF";
    const endColor = this.color ? this.color[$toStyle]() : "#000000";
    const width = 5;
    const cmd = "repeating-linear-gradient";
    const colors = `${startColor},${startColor} ${width}px,${endColor} ${width}px,${endColor} ${
      2 * width
    }px`;
    switch (this.type) {
      case "crossHatch":
        return `${cmd}(to top,${colors}) ${cmd}(to right,${colors})`;
      case "crossDiagonal":
        return `${cmd}(45deg,${colors}) ${cmd}(-45deg,${colors})`;
      case "diagonalLeft":
        return `${cmd}(45deg,${colors})`;
      case "diagonalRight":
        return `${cmd}(-45deg,${colors})`;
      case "horizontal":
        return `${cmd}(to top,${colors})`;
      case "vertical":
        return `${cmd}(to right,${colors})`;
    }

    return "";
  }
}

class Picture extends StringObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "picture");
    this.id = attributes.id || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class Proto extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "proto", /* hasChildren = */ true);
    this.appearanceFilter = new XFAObjectArray();
    this.arc = new XFAObjectArray();
    this.area = new XFAObjectArray();
    this.assist = new XFAObjectArray();
    this.barcode = new XFAObjectArray();
    this.bindItems = new XFAObjectArray();
    this.bookend = new XFAObjectArray();
    this.boolean = new XFAObjectArray();
    this.border = new XFAObjectArray();
    this.break = new XFAObjectArray();
    this.breakAfter = new XFAObjectArray();
    this.breakBefore = new XFAObjectArray();
    this.button = new XFAObjectArray();
    this.calculate = new XFAObjectArray();
    this.caption = new XFAObjectArray();
    this.certificate = new XFAObjectArray();
    this.certificates = new XFAObjectArray();
    this.checkButton = new XFAObjectArray();
    this.choiceList = new XFAObjectArray();
    this.color = new XFAObjectArray();
    this.comb = new XFAObjectArray();
    this.connect = new XFAObjectArray();
    this.contentArea = new XFAObjectArray();
    this.corner = new XFAObjectArray();
    this.date = new XFAObjectArray();
    this.dateTime = new XFAObjectArray();
    this.dateTimeEdit = new XFAObjectArray();
    this.decimal = new XFAObjectArray();
    this.defaultUi = new XFAObjectArray();
    this.desc = new XFAObjectArray();
    this.digestMethod = new XFAObjectArray();
    this.digestMethods = new XFAObjectArray();
    this.draw = new XFAObjectArray();
    this.edge = new XFAObjectArray();
    this.encoding = new XFAObjectArray();
    this.encodings = new XFAObjectArray();
    this.encrypt = new XFAObjectArray();
    this.encryptData = new XFAObjectArray();
    this.encryption = new XFAObjectArray();
    this.encryptionMethod = new XFAObjectArray();
    this.encryptionMethods = new XFAObjectArray();
    this.event = new XFAObjectArray();
    this.exData = new XFAObjectArray();
    this.exObject = new XFAObjectArray();
    this.exclGroup = new XFAObjectArray();
    this.execute = new XFAObjectArray();
    this.extras = new XFAObjectArray();
    this.field = new XFAObjectArray();
    this.fill = new XFAObjectArray();
    this.filter = new XFAObjectArray();
    this.float = new XFAObjectArray();
    this.font = new XFAObjectArray();
    this.format = new XFAObjectArray();
    this.handler = new XFAObjectArray();
    this.hyphenation = new XFAObjectArray();
    this.image = new XFAObjectArray();
    this.imageEdit = new XFAObjectArray();
    this.integer = new XFAObjectArray();
    this.issuers = new XFAObjectArray();
    this.items = new XFAObjectArray();
    this.keep = new XFAObjectArray();
    this.keyUsage = new XFAObjectArray();
    this.line = new XFAObjectArray();
    this.linear = new XFAObjectArray();
    this.lockDocument = new XFAObjectArray();
    this.manifest = new XFAObjectArray();
    this.margin = new XFAObjectArray();
    this.mdp = new XFAObjectArray();
    this.medium = new XFAObjectArray();
    this.message = new XFAObjectArray();
    this.numericEdit = new XFAObjectArray();
    this.occur = new XFAObjectArray();
    this.oid = new XFAObjectArray();
    this.oids = new XFAObjectArray();
    this.overflow = new XFAObjectArray();
    this.pageArea = new XFAObjectArray();
    this.pageSet = new XFAObjectArray();
    this.para = new XFAObjectArray();
    this.passwordEdit = new XFAObjectArray();
    this.pattern = new XFAObjectArray();
    this.picture = new XFAObjectArray();
    this.radial = new XFAObjectArray();
    this.reason = new XFAObjectArray();
    this.reasons = new XFAObjectArray();
    this.rectangle = new XFAObjectArray();
    this.ref = new XFAObjectArray();
    this.script = new XFAObjectArray();
    this.setProperty = new XFAObjectArray();
    this.signData = new XFAObjectArray();
    this.signature = new XFAObjectArray();
    this.signing = new XFAObjectArray();
    this.solid = new XFAObjectArray();
    this.speak = new XFAObjectArray();
    this.stipple = new XFAObjectArray();
    this.subform = new XFAObjectArray();
    this.subformSet = new XFAObjectArray();
    this.subjectDN = new XFAObjectArray();
    this.subjectDNs = new XFAObjectArray();
    this.submit = new XFAObjectArray();
    this.text = new XFAObjectArray();
    this.textEdit = new XFAObjectArray();
    this.time = new XFAObjectArray();
    this.timeStamp = new XFAObjectArray();
    this.toolTip = new XFAObjectArray();
    this.traversal = new XFAObjectArray();
    this.traverse = new XFAObjectArray();
    this.ui = new XFAObjectArray();
    this.validate = new XFAObjectArray();
    this.value = new XFAObjectArray();
    this.variables = new XFAObjectArray();
  }
}

class Radial extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "radial", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.type = getStringOption(attributes.type, ["toEdge", "toCenter"]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.color = null;
    this.extras = null;
  }

  [$toStyle](startColor) {
    startColor = startColor ? startColor[$toStyle]() : "#FFFFFF";
    const endColor = this.color ? this.color[$toStyle]() : "#000000";
    const colors =
      this.type === "toEdge"
        ? `${startColor},${endColor}`
        : `${endColor},${startColor}`;
    return `radial-gradient(circle at center, ${colors})`;
  }
}

class Reason extends StringObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "reason");
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class Reasons extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "reasons", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.type = getStringOption(attributes.type, ["optional", "required"]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.reason = new XFAObjectArray();
  }
}

class Rectangle extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "rectangle", /* hasChildren = */ true);
    this.hand = getStringOption(attributes.hand, ["even", "left", "right"]);
    this.id = attributes.id || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.corner = new XFAObjectArray(4);
    this.edge = new XFAObjectArray(4);
    this.fill = null;
  }

  [$toHTML]() {
    const edge = this.edge.children.length
      ? this.edge.children[0]
      : new Edge({});
    const edgeStyle = edge[$toStyle]();
    const style = Object.create(null);
    if (this.fill?.presence === "visible") {
      Object.assign(style, this.fill[$toStyle]());
    } else {
      style.fill = "transparent";
    }
    style.strokeWidth = measureToString(
      edge.presence === "visible" ? edge.thickness : 0
    );
    style.stroke = edgeStyle.color;

    const corner = this.corner.children.length
      ? this.corner.children[0]
      : new Corner({});
    const cornerStyle = corner[$toStyle]();

    const rect = {
      name: "rect",
      attributes: {
        xmlns: SVG_NS,
        width: "100%",
        height: "100%",
        x: 0,
        y: 0,
        rx: cornerStyle.radius,
        ry: cornerStyle.radius,
        style,
      },
    };

    const svg = {
      name: "svg",
      children: [rect],
      attributes: {
        xmlns: SVG_NS,
        style: {
          overflow: "visible",
        },
        width: "100%",
        height: "100%",
      },
    };

    const parent = this[$getParent]()[$getParent]();
    if (hasMargin(parent)) {
      return HTMLResult.success({
        name: "div",
        attributes: {
          style: {
            display: "inline",
            width: "100%",
            height: "100%",
          },
        },
        children: [svg],
      });
    }

    svg.attributes.style.position = "absolute";
    return HTMLResult.success(svg);
  }
}

class RefElement extends StringObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "ref");
    this.id = attributes.id || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class Script extends StringObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "script");
    this.binding = attributes.binding || "";
    this.contentType = attributes.contentType || "";
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.runAt = getStringOption(attributes.runAt, [
      "client",
      "both",
      "server",
    ]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class SetProperty extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "setProperty");
    this.connection = attributes.connection || "";
    this.ref = attributes.ref || "";
    this.target = attributes.target || "";
  }
}

class SignData extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "signData", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.operation = getStringOption(attributes.operation, [
      "sign",
      "clear",
      "verify",
    ]);
    this.ref = attributes.ref || "";
    this.target = attributes.target || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.filter = null;
    this.manifest = null;
  }
}

class Signature extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "signature", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.type = getStringOption(attributes.type, ["PDF1.3", "PDF1.6"]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.border = null;
    this.extras = null;
    this.filter = null;
    this.manifest = null;
    this.margin = null;
  }
}

class Signing extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "signing", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.type = getStringOption(attributes.type, ["optional", "required"]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.certificate = new XFAObjectArray();
  }
}

class Solid extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "solid", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.extras = null;
  }

  [$toStyle](startColor) {
    return startColor ? startColor[$toStyle]() : "#FFFFFF";
  }
}

class Speak extends StringObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "speak");
    this.disable = getInteger({
      data: attributes.disable,
      defaultValue: 0,
      validate: x => x === 1,
    });
    this.id = attributes.id || "";
    this.priority = getStringOption(attributes.priority, [
      "custom",
      "caption",
      "name",
      "toolTip",
    ]);
    this.rid = attributes.rid || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class Stipple extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "stipple", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.rate = getInteger({
      data: attributes.rate,
      defaultValue: 50,
      validate: x => x >= 0 && x <= 100,
    });
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.color = null;
    this.extras = null;
  }

  [$toStyle](bgColor) {
    const alpha = this.rate / 100;
    return Util.makeHexColor(
      Math.round(bgColor.value.r * (1 - alpha) + this.value.r * alpha),
      Math.round(bgColor.value.g * (1 - alpha) + this.value.g * alpha),
      Math.round(bgColor.value.b * (1 - alpha) + this.value.b * alpha)
    );
  }
}

class Subform extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "subform", /* hasChildren = */ true);
    this.access = getStringOption(attributes.access, [
      "open",
      "nonInteractive",
      "protected",
      "readOnly",
    ]);
    this.allowMacro = getInteger({
      data: attributes.allowMacro,
      defaultValue: 0,
      validate: x => x === 1,
    });
    this.anchorType = getStringOption(attributes.anchorType, [
      "topLeft",
      "bottomCenter",
      "bottomLeft",
      "bottomRight",
      "middleCenter",
      "middleLeft",
      "middleRight",
      "topCenter",
      "topRight",
    ]);
    this.colSpan = getInteger({
      data: attributes.colSpan,
      defaultValue: 1,
      validate: n => n >= 1 || n === -1,
    });
    this.columnWidths = (attributes.columnWidths || "")
      .trim()
      .split(/\s+/)
      .map(x => (x === "-1" ? -1 : getMeasurement(x)));
    this.h = attributes.h ? getMeasurement(attributes.h) : "";
    this.hAlign = getStringOption(attributes.hAlign, [
      "left",
      "center",
      "justify",
      "justifyAll",
      "radix",
      "right",
    ]);
    this.id = attributes.id || "";
    this.layout = getStringOption(attributes.layout, [
      "position",
      "lr-tb",
      "rl-row",
      "rl-tb",
      "row",
      "table",
      "tb",
    ]);
    this.locale = attributes.locale || "";
    this.maxH = getMeasurement(attributes.maxH, "0pt");
    this.maxW = getMeasurement(attributes.maxW, "0pt");
    this.mergeMode = getStringOption(attributes.mergeMode, [
      "consumeData",
      "matchTemplate",
    ]);
    this.minH = getMeasurement(attributes.minH, "0pt");
    this.minW = getMeasurement(attributes.minW, "0pt");
    this.name = attributes.name || "";
    this.presence = getStringOption(attributes.presence, [
      "visible",
      "hidden",
      "inactive",
      "invisible",
    ]);
    this.relevant = getRelevant(attributes.relevant);
    this.restoreState = getStringOption(attributes.restoreState, [
      "manual",
      "auto",
    ]);
    this.scope = getStringOption(attributes.scope, ["name", "none"]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.w = attributes.w ? getMeasurement(attributes.w) : "";
    this.x = getMeasurement(attributes.x, "0pt");
    this.y = getMeasurement(attributes.y, "0pt");
    this.assist = null;
    this.bind = null;
    this.bookend = null;
    this.border = null;
    this.break = null;
    this.calculate = null;
    this.desc = null;
    this.extras = null;
    this.keep = null;
    this.margin = null;
    this.occur = null;
    this.overflow = null;
    this.pageSet = null;
    this.para = null;
    this.traversal = null;
    this.validate = null;
    this.variables = null;
    this.area = new XFAObjectArray();
    this.breakAfter = new XFAObjectArray();
    this.breakBefore = new XFAObjectArray();
    this.connect = new XFAObjectArray();
    this.draw = new XFAObjectArray();
    this.event = new XFAObjectArray();
    this.exObject = new XFAObjectArray();
    this.exclGroup = new XFAObjectArray();
    this.field = new XFAObjectArray();
    this.proto = new XFAObjectArray();
    this.setProperty = new XFAObjectArray();
    this.subform = new XFAObjectArray();
    this.subformSet = new XFAObjectArray();
  }

  [$getSubformParent]() {
    const parent = this[$getParent]();
    if (parent instanceof SubformSet) {
      return parent[$getSubformParent]();
    }
    return parent;
  }

  [$isBindable]() {
    return true;
  }

  [$isThereMoreWidth]() {
    return (
      (this.layout.endsWith("-tb") &&
        this[$extra].attempt === 0 &&
        this[$extra].numberInLine > 0) ||
      this[$getParent]()[$isThereMoreWidth]()
    );
  }

  *[$getContainedChildren]() {
    // This function is overriden in order to fake that subforms under
    // this set are in fact under parent subform.
    yield* getContainedChildren(this);
  }

  [$flushHTML]() {
    return flushHTML(this);
  }

  [$addHTML](html, bbox) {
    addHTML(this, html, bbox);
  }

  [$getAvailableSpace]() {
    return getAvailableSpace(this);
  }

  [$isSplittable]() {
    // We cannot cache the result here because the contentArea
    // can change.
    const parent = this[$getSubformParent]();
    if (!parent[$isSplittable]()) {
      return false;
    }

    if (this[$extra]._isSplittable !== undefined) {
      return this[$extra]._isSplittable;
    }

    if (this.layout === "position" || this.layout.includes("row")) {
      this[$extra]._isSplittable = false;
      return false;
    }

    if (this.keep && this.keep.intact !== "none") {
      this[$extra]._isSplittable = false;
      return false;
    }

    if (parent.layout?.endsWith("-tb") && parent[$extra].numberInLine !== 0) {
      // If parent can fit in w=100 and there's already an element which takes
      // 90 then we've 10 for this element. Suppose this element has a tb layout
      // and 5 elements have a width of 7 and the 6th has a width of 20:
      // then this element (and all its content) must move on the next line.
      // If this element is splittable then the first 5 children will stay
      // at the end of the line: we don't want that.
      return false;
    }

    this[$extra]._isSplittable = true;

    return true;
  }

  [$toHTML](availableSpace) {
    setTabIndex(this);

    if (this.break) {
      // break element is deprecated so plug it on one of its replacement
      // breakBefore or breakAfter.
      if (this.break.after !== "auto" || this.break.afterTarget !== "") {
        const node = new BreakAfter({
          targetType: this.break.after,
          target: this.break.afterTarget,
          startNew: this.break.startNew.toString(),
        });
        node[$globalData] = this[$globalData];
        this[$appendChild](node);
        this.breakAfter.push(node);
      }

      if (this.break.before !== "auto" || this.break.beforeTarget !== "") {
        const node = new BreakBefore({
          targetType: this.break.before,
          target: this.break.beforeTarget,
          startNew: this.break.startNew.toString(),
        });
        node[$globalData] = this[$globalData];
        this[$appendChild](node);
        this.breakBefore.push(node);
      }

      if (this.break.overflowTarget !== "") {
        const node = new Overflow({
          target: this.break.overflowTarget,
          leader: this.break.overflowLeader,
          trailer: this.break.overflowTrailer,
        });
        node[$globalData] = this[$globalData];
        this[$appendChild](node);
        this.overflow.push(node);
      }

      this[$removeChild](this.break);
      this.break = null;
    }

    if (this.presence === "hidden" || this.presence === "inactive") {
      return HTMLResult.EMPTY;
    }

    if (
      this.breakBefore.children.length > 1 ||
      this.breakAfter.children.length > 1
    ) {
      // Specs are always talking about the breakBefore element
      // and it doesn't really make sense to have several ones.
      warn(
        "XFA - Several breakBefore or breakAfter in subforms: please file a bug."
      );
    }

    if (this.breakBefore.children.length >= 1) {
      const breakBefore = this.breakBefore.children[0];
      if (handleBreak(breakBefore)) {
        return HTMLResult.breakNode(breakBefore);
      }
    }

    if (this[$extra]?.afterBreakAfter) {
      return HTMLResult.EMPTY;
    }

    // TODO: incomplete.
    fixDimensions(this);
    const children = [];
    const attributes = {
      id: this[$uid],
      class: [],
    };

    setAccess(this, attributes.class);

    if (!this[$extra]) {
      this[$extra] = Object.create(null);
    }

    Object.assign(this[$extra], {
      children,
      line: null,
      attributes,
      attempt: 0,
      numberInLine: 0,
      availableSpace: {
        width: Math.min(this.w || Infinity, availableSpace.width),
        height: Math.min(this.h || Infinity, availableSpace.height),
      },
      width: 0,
      height: 0,
      prevHeight: 0,
      currentWidth: 0,
    });

    const root = this[$getTemplateRoot]();
    const savedNoLayoutFailure = root[$extra].noLayoutFailure;

    const isSplittable = this[$isSplittable]();
    if (!isSplittable) {
      setFirstUnsplittable(this);
    }

    if (!checkDimensions(this, availableSpace)) {
      return HTMLResult.FAILURE;
    }

    const filter = new Set([
      "area",
      "draw",
      "exclGroup",
      "field",
      "subform",
      "subformSet",
    ]);

    if (this.layout.includes("row")) {
      const columnWidths = this[$getSubformParent]().columnWidths;
      if (Array.isArray(columnWidths) && columnWidths.length > 0) {
        this[$extra].columnWidths = columnWidths;
        this[$extra].currentColumn = 0;
      }
    }

    const style = toStyle(
      this,
      "anchorType",
      "dimensions",
      "position",
      "presence",
      "border",
      "margin",
      "hAlign"
    );
    const classNames = ["xfaSubform"];
    const cl = layoutClass(this);
    if (cl) {
      classNames.push(cl);
    }

    attributes.style = style;
    attributes.class = classNames;

    if (this.name) {
      attributes.xfaName = this.name;
    }

    if (this.overflow) {
      const overflowExtra = this.overflow[$getExtra]();
      if (overflowExtra.addLeader) {
        overflowExtra.addLeader = false;
        handleOverflow(this, overflowExtra.leader, availableSpace);
      }
    }

    this[$pushPara]();
    const isLrTb = this.layout === "lr-tb" || this.layout === "rl-tb";
    const maxRun = isLrTb ? MAX_ATTEMPTS_FOR_LRTB_LAYOUT : 1;
    for (; this[$extra].attempt < maxRun; this[$extra].attempt++) {
      if (isLrTb && this[$extra].attempt === MAX_ATTEMPTS_FOR_LRTB_LAYOUT - 1) {
        // If the layout is lr-tb then having attempt equals to
        // MAX_ATTEMPTS_FOR_LRTB_LAYOUT-1 means that we're trying to layout
        // on the next line so this on is empty.
        this[$extra].numberInLine = 0;
      }
      const result = this[$childrenToHTML]({
        filter,
        include: true,
      });
      if (result.success) {
        break;
      }
      if (result.isBreak()) {
        this[$popPara]();
        return result;
      }
      if (
        isLrTb &&
        this[$extra].attempt === 0 &&
        this[$extra].numberInLine === 0 &&
        !root[$extra].noLayoutFailure
      ) {
        // We're failing to put the first element on the line so no
        // need to test on the next line.
        // The goal is not only to avoid some useless checks but to avoid
        // bugs too: if a descendant managed to put a node and failed
        // on the next one, going to the next step here will imply to
        // visit the descendant again, clear [$extra].children and restart
        // on the failing node, consequently the first node just disappears
        // because it has never been flushed.
        this[$extra].attempt = maxRun;
        break;
      }
    }

    this[$popPara]();
    if (!isSplittable) {
      unsetFirstUnsplittable(this);
    }
    root[$extra].noLayoutFailure = savedNoLayoutFailure;

    if (this[$extra].attempt === maxRun) {
      if (this.overflow) {
        this[$getTemplateRoot]()[$extra].overflowNode = this.overflow;
      }

      if (!isSplittable) {
        // Since a new try will happen in a new container with maybe
        // new dimensions, we invalidate already layed out components.
        delete this[$extra];
      }
      return HTMLResult.FAILURE;
    }

    if (this.overflow) {
      const overflowExtra = this.overflow[$getExtra]();
      if (overflowExtra.addTrailer) {
        overflowExtra.addTrailer = false;
        handleOverflow(this, overflowExtra.trailer, availableSpace);
      }
    }

    let marginH = 0;
    let marginV = 0;
    if (this.margin) {
      marginH = this.margin.leftInset + this.margin.rightInset;
      marginV = this.margin.topInset + this.margin.bottomInset;
    }

    const width = Math.max(this[$extra].width + marginH, this.w || 0);
    const height = Math.max(this[$extra].height + marginV, this.h || 0);
    const bbox = [this.x, this.y, width, height];

    if (this.w === "") {
      style.width = measureToString(width);
    }
    if (this.h === "") {
      style.height = measureToString(height);
    }

    if (
      (style.width === "0px" || style.height === "0px") &&
      children.length === 0
    ) {
      return HTMLResult.EMPTY;
    }

    const html = {
      name: "div",
      attributes,
      children,
    };

    applyAssist(this, attributes);

    const result = HTMLResult.success(createWrapper(this, html), bbox);

    if (this.breakAfter.children.length >= 1) {
      const breakAfter = this.breakAfter.children[0];
      if (handleBreak(breakAfter)) {
        this[$extra].afterBreakAfter = result;
        return HTMLResult.breakNode(breakAfter);
      }
    }

    delete this[$extra];

    return result;
  }
}

class SubformSet extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "subformSet", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.relation = getStringOption(attributes.relation, [
      "ordered",
      "choice",
      "unordered",
    ]);
    this.relevant = getRelevant(attributes.relevant);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.bookend = null;
    this.break = null;
    this.desc = null;
    this.extras = null;
    this.occur = null;
    this.overflow = null;
    this.breakAfter = new XFAObjectArray();
    this.breakBefore = new XFAObjectArray();
    this.subform = new XFAObjectArray();
    this.subformSet = new XFAObjectArray();

    // TODO: need to handle break stuff and relation.
  }

  *[$getContainedChildren]() {
    // This function is overriden in order to fake that subforms under
    // this set are in fact under parent subform.
    yield* getContainedChildren(this);
  }

  [$getSubformParent]() {
    let parent = this[$getParent]();
    while (!(parent instanceof Subform)) {
      parent = parent[$getParent]();
    }
    return parent;
  }

  [$isBindable]() {
    return true;
  }
}

class SubjectDN extends ContentObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "subjectDN");
    this.delimiter = attributes.delimiter || ",";
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }

  [$finalize]() {
    this[$content] = new Map(
      this[$content].split(this.delimiter).map(kv => {
        kv = kv.split("=", 2);
        kv[0] = kv[0].trim();
        return kv;
      })
    );
  }
}

class SubjectDNs extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "subjectDNs", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.type = getStringOption(attributes.type, ["optional", "required"]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.subjectDN = new XFAObjectArray();
  }
}

class Submit extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "submit", /* hasChildren = */ true);
    this.embedPDF = getInteger({
      data: attributes.embedPDF,
      defaultValue: 0,
      validate: x => x === 1,
    });
    this.format = getStringOption(attributes.format, [
      "xdp",
      "formdata",
      "pdf",
      "urlencoded",
      "xfd",
      "xml",
    ]);
    this.id = attributes.id || "";
    this.target = attributes.target || "";
    this.textEncoding = getKeyword({
      data: attributes.textEncoding
        ? attributes.textEncoding.toLowerCase()
        : "",
      defaultValue: "",
      validate: k =>
        [
          "utf-8",
          "big-five",
          "fontspecific",
          "gbk",
          "gb-18030",
          "gb-2312",
          "ksc-5601",
          "none",
          "shift-jis",
          "ucs-2",
          "utf-16",
        ].includes(k) || k.match(/iso-8859-\d{2}/),
    });
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.xdpContent = attributes.xdpContent || "";
    this.encrypt = null;
    this.encryptData = new XFAObjectArray();
    this.signData = new XFAObjectArray();
  }
}

class Template extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "template", /* hasChildren = */ true);
    this.baseProfile = getStringOption(attributes.baseProfile, [
      "full",
      "interactiveForms",
    ]);
    this.extras = null;

    // Spec is unclear:
    //  A container element that describes a single subform capable of
    //  enclosing other containers.
    // Can we have more than one subform ?
    this.subform = new XFAObjectArray();
  }

  [$finalize]() {
    if (this.subform.children.length === 0) {
      warn("XFA - No subforms in template node.");
    }
    if (this.subform.children.length >= 2) {
      warn("XFA - Several subforms in template node: please file a bug.");
    }
    this[$tabIndex] = DEFAULT_TAB_INDEX;
  }

  [$isSplittable]() {
    return true;
  }

  [$searchNode](expr, container) {
    if (expr.startsWith("#")) {
      // This is an id.
      return [this[$ids].get(expr.slice(1))];
    }
    return searchNode(this, container, expr, true, true);
  }

  /**
   * This function is a generator because the conversion into
   * pages is done asynchronously and we want to save the state
   * of the function where we were in the previous iteration.
   */
  *[$toPages]() {
    if (!this.subform.children.length) {
      return HTMLResult.success({
        name: "div",
        children: [],
      });
    }
    this[$extra] = {
      overflowNode: null,
      firstUnsplittable: null,
      currentContentArea: null,
      currentPageArea: null,
      noLayoutFailure: false,
      pageNumber: 1,
      pagePosition: "first",
      oddOrEven: "odd",
      blankOrNotBlank: "nonBlank",
      paraStack: [],
    };

    const root = this.subform.children[0];
    root.pageSet[$cleanPage]();

    const pageAreas = root.pageSet.pageArea.children;
    const mainHtml = {
      name: "div",
      children: [],
    };

    let pageArea = null;
    let breakBefore = null;
    let breakBeforeTarget = null;
    if (root.breakBefore.children.length >= 1) {
      breakBefore = root.breakBefore.children[0];
      breakBeforeTarget = breakBefore.target;
    } else if (
      root.subform.children.length >= 1 &&
      root.subform.children[0].breakBefore.children.length >= 1
    ) {
      breakBefore = root.subform.children[0].breakBefore.children[0];
      breakBeforeTarget = breakBefore.target;
    } else if (root.break?.beforeTarget) {
      breakBefore = root.break;
      breakBeforeTarget = breakBefore.beforeTarget;
    } else if (
      root.subform.children.length >= 1 &&
      root.subform.children[0].break?.beforeTarget
    ) {
      breakBefore = root.subform.children[0].break;
      breakBeforeTarget = breakBefore.beforeTarget;
    }

    if (breakBefore) {
      const target = this[$searchNode](
        breakBeforeTarget,
        breakBefore[$getParent]()
      );
      if (target instanceof PageArea) {
        pageArea = target;
        // Consume breakBefore.
        breakBefore[$extra] = {};
      }
    }

    if (!pageArea) {
      pageArea = pageAreas[0];
    }

    pageArea[$extra] = {
      numberOfUse: 1,
    };

    const pageAreaParent = pageArea[$getParent]();
    pageAreaParent[$extra] = {
      numberOfUse: 1,
      pageIndex: pageAreaParent.pageArea.children.indexOf(pageArea),
      pageSetIndex: 0,
    };

    let targetPageArea;
    let leader = null;
    let trailer = null;
    let hasSomething = true;
    let hasSomethingCounter = 0;
    let startIndex = 0;

    while (true) {
      if (!hasSomething) {
        mainHtml.children.pop();
        // Nothing has been added in the previous page
        if (++hasSomethingCounter === MAX_EMPTY_PAGES) {
          warn("XFA - Something goes wrong: please file a bug.");
          return mainHtml;
        }
      } else {
        hasSomethingCounter = 0;
      }

      targetPageArea = null;
      this[$extra].currentPageArea = pageArea;
      const page = pageArea[$toHTML]().html;
      mainHtml.children.push(page);

      if (leader) {
        this[$extra].noLayoutFailure = true;
        page.children.push(leader[$toHTML](pageArea[$extra].space).html);
        leader = null;
      }

      if (trailer) {
        this[$extra].noLayoutFailure = true;
        page.children.push(trailer[$toHTML](pageArea[$extra].space).html);
        trailer = null;
      }

      const contentAreas = pageArea.contentArea.children;
      const htmlContentAreas = page.children.filter(node =>
        node.attributes.class.includes("xfaContentarea")
      );

      hasSomething = false;
      this[$extra].firstUnsplittable = null;
      this[$extra].noLayoutFailure = false;

      const flush = index => {
        const html = root[$flushHTML]();
        if (html) {
          hasSomething ||= html.children?.length > 0;
          htmlContentAreas[index].children.push(html);
        }
      };

      for (let i = startIndex, ii = contentAreas.length; i < ii; i++) {
        const contentArea = (this[$extra].currentContentArea = contentAreas[i]);
        const space = { width: contentArea.w, height: contentArea.h };
        startIndex = 0;

        if (leader) {
          htmlContentAreas[i].children.push(leader[$toHTML](space).html);
          leader = null;
        }

        if (trailer) {
          htmlContentAreas[i].children.push(trailer[$toHTML](space).html);
          trailer = null;
        }

        const html = root[$toHTML](space);
        if (html.success) {
          if (html.html) {
            hasSomething ||= html.html.children?.length > 0;
            htmlContentAreas[i].children.push(html.html);
          } else if (!hasSomething && mainHtml.children.length > 1) {
            mainHtml.children.pop();
          }
          return mainHtml;
        }

        if (html.isBreak()) {
          const node = html.breakNode;
          flush(i);

          if (node.targetType === "auto") {
            continue;
          }

          if (node.leader) {
            leader = this[$searchNode](node.leader, node[$getParent]());
            leader = leader ? leader[0] : null;
          }

          if (node.trailer) {
            trailer = this[$searchNode](node.trailer, node[$getParent]());
            trailer = trailer ? trailer[0] : null;
          }

          if (node.targetType === "pageArea") {
            targetPageArea = node[$extra].target;
            i = Infinity;
          } else if (!node[$extra].target) {
            // We stay on the same page.
            i = node[$extra].index;
          } else {
            targetPageArea = node[$extra].target;
            startIndex = node[$extra].index + 1;
            i = Infinity;
          }

          continue;
        }

        if (this[$extra].overflowNode) {
          const node = this[$extra].overflowNode;
          this[$extra].overflowNode = null;

          const overflowExtra = node[$getExtra]();
          const target = overflowExtra.target;
          overflowExtra.addLeader = overflowExtra.leader !== null;
          overflowExtra.addTrailer = overflowExtra.trailer !== null;

          flush(i);

          const currentIndex = i;

          i = Infinity;
          if (target instanceof PageArea) {
            // We must stop the contentAreas filling and go to the next page.
            targetPageArea = target;
          } else if (target instanceof ContentArea) {
            const index = contentAreas.indexOf(target);
            if (index !== -1) {
              if (index > currentIndex) {
                // In the next loop iteration `i` will be incremented, note the
                // `continue` just below, hence we need to subtract one here.
                i = index - 1;
              } else {
                // The targetted contentArea has already been filled
                // so create a new page.
                startIndex = index;
              }
            } else {
              targetPageArea = target[$getParent]();
              startIndex = targetPageArea.contentArea.children.indexOf(target);
            }
          }
          continue;
        }

        flush(i);
      }

      this[$extra].pageNumber += 1;
      if (targetPageArea) {
        if (targetPageArea[$isUsable]()) {
          targetPageArea[$extra].numberOfUse += 1;
        } else {
          targetPageArea = null;
        }
      }
      pageArea = targetPageArea || pageArea[$getNextPage]();
      yield null;
    }
  }
}

class Text extends ContentObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "text");
    this.id = attributes.id || "";
    this.maxChars = getInteger({
      data: attributes.maxChars,
      defaultValue: 0,
      validate: x => x >= 0,
    });
    this.name = attributes.name || "";
    this.rid = attributes.rid || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }

  [$acceptWhitespace]() {
    return true;
  }

  [$onChild](child) {
    if (child[$namespaceId] === NamespaceIds.xhtml.id) {
      this[$content] = child;
      return true;
    }
    warn(`XFA - Invalid content in Text: ${child[$nodeName]}.`);
    return false;
  }

  [$onText](str) {
    if (this[$content] instanceof XFAObject) {
      return;
    }
    super[$onText](str);
  }

  [$finalize]() {
    if (typeof this[$content] === "string") {
      this[$content] = this[$content].replaceAll("\r\n", "\n");
    }
  }

  [$getExtra]() {
    if (typeof this[$content] === "string") {
      return this[$content]
        .split(/[\u2029\u2028\n]/)
        .reduce((acc, line) => {
          if (line) {
            acc.push(line);
          }
          return acc;
        }, [])
        .join("\n");
    }
    return this[$content][$text]();
  }

  [$toHTML](availableSpace) {
    if (typeof this[$content] === "string") {
      // \u2028 is a line separator.
      // \u2029 is a paragraph separator.
      const html = valueToHtml(this[$content]).html;

      if (this[$content].includes("\u2029")) {
        // We've plain text containing a paragraph separator
        // so convert it into a set of <p>.
        html.name = "div";
        html.children = [];
        this[$content]
          .split("\u2029")
          .map(para =>
            // Convert a paragraph into a set of <span> (for lines)
            // separated by <br>.
            para.split(/[\u2028\n]/).reduce((acc, line) => {
              acc.push(
                {
                  name: "span",
                  value: line,
                },
                {
                  name: "br",
                }
              );
              return acc;
            }, [])
          )
          .forEach(lines => {
            html.children.push({
              name: "p",
              children: lines,
            });
          });
      } else if (/[\u2028\n]/.test(this[$content])) {
        html.name = "div";
        html.children = [];
        // Convert plain text into a set of <span> (for lines)
        // separated by <br>.
        this[$content].split(/[\u2028\n]/).forEach(line => {
          html.children.push(
            {
              name: "span",
              value: line,
            },
            {
              name: "br",
            }
          );
        });
      }

      return HTMLResult.success(html);
    }

    return this[$content][$toHTML](availableSpace);
  }
}

class TextEdit extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "textEdit", /* hasChildren = */ true);
    this.allowRichText = getInteger({
      data: attributes.allowRichText,
      defaultValue: 0,
      validate: x => x === 1,
    });
    this.hScrollPolicy = getStringOption(attributes.hScrollPolicy, [
      "auto",
      "off",
      "on",
    ]);
    this.id = attributes.id || "";
    this.multiLine = getInteger({
      data: attributes.multiLine,
      defaultValue: "",
      validate: x => x === 0 || x === 1,
    });
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.vScrollPolicy = getStringOption(attributes.vScrollPolicy, [
      "auto",
      "off",
      "on",
    ]);
    this.border = null;
    this.comb = null;
    this.extras = null;
    this.margin = null;
  }

  [$toHTML](availableSpace) {
    // TODO: incomplete.
    const style = toStyle(this, "border", "font", "margin");
    let html;
    const field = this[$getParent]()[$getParent]();
    if (this.multiLine === "") {
      this.multiLine = field instanceof Draw ? 1 : 0;
    }
    if (this.multiLine === 1) {
      html = {
        name: "textarea",
        attributes: {
          dataId: field[$data]?.[$uid] || field[$uid],
          fieldId: field[$uid],
          class: ["xfaTextfield"],
          style,
          "aria-label": ariaLabel(field),
          "aria-required": false,
        },
      };
    } else {
      html = {
        name: "input",
        attributes: {
          type: "text",
          dataId: field[$data]?.[$uid] || field[$uid],
          fieldId: field[$uid],
          class: ["xfaTextfield"],
          style,
          "aria-label": ariaLabel(field),
          "aria-required": false,
        },
      };
    }

    if (isRequired(field)) {
      html.attributes["aria-required"] = true;
      html.attributes.required = true;
    }

    return HTMLResult.success({
      name: "label",
      attributes: {
        class: ["xfaLabel"],
      },
      children: [html],
    });
  }
}

class Time extends StringObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "time");
    this.id = attributes.id || "";
    this.name = attributes.name || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }

  [$finalize]() {
    // TODO: need to handle the string as a time and not as a date.
    const date = this[$content].trim();
    this[$content] = date ? new Date(date) : null;
  }

  [$toHTML](availableSpace) {
    return valueToHtml(this[$content] ? this[$content].toString() : "");
  }
}

class TimeStamp extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "timeStamp");
    this.id = attributes.id || "";
    this.server = attributes.server || "";
    this.type = getStringOption(attributes.type, ["optional", "required"]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class ToolTip extends StringObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "toolTip");
    this.id = attributes.id || "";
    this.rid = attributes.rid || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
  }
}

class Traversal extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "traversal", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.extras = null;
    this.traverse = new XFAObjectArray();
  }
}

class Traverse extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "traverse", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.operation = getStringOption(attributes.operation, [
      "next",
      "back",
      "down",
      "first",
      "left",
      "right",
      "up",
    ]);
    this.ref = attributes.ref || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.extras = null;
    this.script = null;
  }

  get name() {
    // SOM expression: see page 94
    return this.operation;
  }

  [$isTransparent]() {
    return false;
  }
}

class Ui extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "ui", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.extras = null;
    this.picture = null;

    // One-of properties
    this.barcode = null;
    this.button = null;
    this.checkButton = null;
    this.choiceList = null;
    this.dateTimeEdit = null;
    this.defaultUi = null;
    this.imageEdit = null;
    this.numericEdit = null;
    this.passwordEdit = null;
    this.signature = null;
    this.textEdit = null;
  }

  [$getExtra]() {
    if (this[$extra] === undefined) {
      for (const name of Object.getOwnPropertyNames(this)) {
        if (name === "extras" || name === "picture") {
          continue;
        }
        const obj = this[name];
        if (!(obj instanceof XFAObject)) {
          continue;
        }

        this[$extra] = obj;
        return obj;
      }
      this[$extra] = null;
    }
    return this[$extra];
  }

  [$toHTML](availableSpace) {
    // TODO: picture.
    const obj = this[$getExtra]();
    if (obj) {
      return obj[$toHTML](availableSpace);
    }
    return HTMLResult.EMPTY;
  }
}

class Validate extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "validate", /* hasChildren = */ true);
    this.formatTest = getStringOption(attributes.formatTest, [
      "warning",
      "disabled",
      "error",
    ]);
    this.id = attributes.id || "";
    this.nullTest = getStringOption(attributes.nullTest, [
      "disabled",
      "error",
      "warning",
    ]);
    this.scriptTest = getStringOption(attributes.scriptTest, [
      "error",
      "disabled",
      "warning",
    ]);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.extras = null;
    this.message = null;
    this.picture = null;
    this.script = null;
  }
}

class Value extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "value", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.override = getInteger({
      data: attributes.override,
      defaultValue: 0,
      validate: x => x === 1,
    });
    this.relevant = getRelevant(attributes.relevant);
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";

    // One-of properties
    this.arc = null;
    this.boolean = null;
    this.date = null;
    this.dateTime = null;
    this.decimal = null;
    this.exData = null;
    this.float = null;
    this.image = null;
    this.integer = null;
    this.line = null;
    this.rectangle = null;
    this.text = null;
    this.time = null;
  }

  [$setValue](value) {
    const parent = this[$getParent]();
    if (parent instanceof Field) {
      if (parent.ui?.imageEdit) {
        if (!this.image) {
          this.image = new Image({});
          this[$appendChild](this.image);
        }
        this.image[$content] = value[$content];
        return;
      }
    }

    const valueName = value[$nodeName];
    if (this[valueName] !== null) {
      this[valueName][$content] = value[$content];
      return;
    }

    // Reset all the properties.
    for (const name of Object.getOwnPropertyNames(this)) {
      const obj = this[name];
      if (obj instanceof XFAObject) {
        this[name] = null;
        this[$removeChild](obj);
      }
    }

    this[value[$nodeName]] = value;
    this[$appendChild](value);
  }

  [$text]() {
    if (this.exData) {
      if (typeof this.exData[$content] === "string") {
        return this.exData[$content].trim();
      }
      return this.exData[$content][$text]().trim();
    }
    for (const name of Object.getOwnPropertyNames(this)) {
      if (name === "image") {
        continue;
      }
      const obj = this[name];
      if (obj instanceof XFAObject) {
        return (obj[$content] || "").toString().trim();
      }
    }
    return null;
  }

  [$toHTML](availableSpace) {
    for (const name of Object.getOwnPropertyNames(this)) {
      const obj = this[name];
      if (!(obj instanceof XFAObject)) {
        continue;
      }

      return obj[$toHTML](availableSpace);
    }

    return HTMLResult.EMPTY;
  }
}

class Variables extends XFAObject {
  constructor(attributes) {
    super(TEMPLATE_NS_ID, "variables", /* hasChildren = */ true);
    this.id = attributes.id || "";
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.boolean = new XFAObjectArray();
    this.date = new XFAObjectArray();
    this.dateTime = new XFAObjectArray();
    this.decimal = new XFAObjectArray();
    this.exData = new XFAObjectArray();
    this.float = new XFAObjectArray();
    this.image = new XFAObjectArray();
    this.integer = new XFAObjectArray();
    this.manifest = new XFAObjectArray();
    this.script = new XFAObjectArray();
    this.text = new XFAObjectArray();
    this.time = new XFAObjectArray();
  }

  [$isTransparent]() {
    return true;
  }
}

class TemplateNamespace {
  static [$buildXFAObject](name, attributes) {
    if (TemplateNamespace.hasOwnProperty(name)) {
      const node = TemplateNamespace[name](attributes);
      node[$setSetAttributes](attributes);
      return node;
    }
    return undefined;
  }

  static appearanceFilter(attrs) {
    return new AppearanceFilter(attrs);
  }

  static arc(attrs) {
    return new Arc(attrs);
  }

  static area(attrs) {
    return new Area(attrs);
  }

  static assist(attrs) {
    return new Assist(attrs);
  }

  static barcode(attrs) {
    return new Barcode(attrs);
  }

  static bind(attrs) {
    return new Bind(attrs);
  }

  static bindItems(attrs) {
    return new BindItems(attrs);
  }

  static bookend(attrs) {
    return new Bookend(attrs);
  }

  static boolean(attrs) {
    return new BooleanElement(attrs);
  }

  static border(attrs) {
    return new Border(attrs);
  }

  static break(attrs) {
    return new Break(attrs);
  }

  static breakAfter(attrs) {
    return new BreakAfter(attrs);
  }

  static breakBefore(attrs) {
    return new BreakBefore(attrs);
  }

  static button(attrs) {
    return new Button(attrs);
  }

  static calculate(attrs) {
    return new Calculate(attrs);
  }

  static caption(attrs) {
    return new Caption(attrs);
  }

  static certificate(attrs) {
    return new Certificate(attrs);
  }

  static certificates(attrs) {
    return new Certificates(attrs);
  }

  static checkButton(attrs) {
    return new CheckButton(attrs);
  }

  static choiceList(attrs) {
    return new ChoiceList(attrs);
  }

  static color(attrs) {
    return new Color(attrs);
  }

  static comb(attrs) {
    return new Comb(attrs);
  }

  static connect(attrs) {
    return new Connect(attrs);
  }

  static contentArea(attrs) {
    return new ContentArea(attrs);
  }

  static corner(attrs) {
    return new Corner(attrs);
  }

  static date(attrs) {
    return new DateElement(attrs);
  }

  static dateTime(attrs) {
    return new DateTime(attrs);
  }

  static dateTimeEdit(attrs) {
    return new DateTimeEdit(attrs);
  }

  static decimal(attrs) {
    return new Decimal(attrs);
  }

  static defaultUi(attrs) {
    return new DefaultUi(attrs);
  }

  static desc(attrs) {
    return new Desc(attrs);
  }

  static digestMethod(attrs) {
    return new DigestMethod(attrs);
  }

  static digestMethods(attrs) {
    return new DigestMethods(attrs);
  }

  static draw(attrs) {
    return new Draw(attrs);
  }

  static edge(attrs) {
    return new Edge(attrs);
  }

  static encoding(attrs) {
    return new Encoding(attrs);
  }

  static encodings(attrs) {
    return new Encodings(attrs);
  }

  static encrypt(attrs) {
    return new Encrypt(attrs);
  }

  static encryptData(attrs) {
    return new EncryptData(attrs);
  }

  static encryption(attrs) {
    return new Encryption(attrs);
  }

  static encryptionMethod(attrs) {
    return new EncryptionMethod(attrs);
  }

  static encryptionMethods(attrs) {
    return new EncryptionMethods(attrs);
  }

  static event(attrs) {
    return new Event(attrs);
  }

  static exData(attrs) {
    return new ExData(attrs);
  }

  static exObject(attrs) {
    return new ExObject(attrs);
  }

  static exclGroup(attrs) {
    return new ExclGroup(attrs);
  }

  static execute(attrs) {
    return new Execute(attrs);
  }

  static extras(attrs) {
    return new Extras(attrs);
  }

  static field(attrs) {
    return new Field(attrs);
  }

  static fill(attrs) {
    return new Fill(attrs);
  }

  static filter(attrs) {
    return new Filter(attrs);
  }

  static float(attrs) {
    return new Float(attrs);
  }

  static font(attrs) {
    return new Font(attrs);
  }

  static format(attrs) {
    return new Format(attrs);
  }

  static handler(attrs) {
    return new Handler(attrs);
  }

  static hyphenation(attrs) {
    return new Hyphenation(attrs);
  }

  static image(attrs) {
    return new Image(attrs);
  }

  static imageEdit(attrs) {
    return new ImageEdit(attrs);
  }

  static integer(attrs) {
    return new Integer(attrs);
  }

  static issuers(attrs) {
    return new Issuers(attrs);
  }

  static items(attrs) {
    return new Items(attrs);
  }

  static keep(attrs) {
    return new Keep(attrs);
  }

  static keyUsage(attrs) {
    return new KeyUsage(attrs);
  }

  static line(attrs) {
    return new Line(attrs);
  }

  static linear(attrs) {
    return new Linear(attrs);
  }

  static lockDocument(attrs) {
    return new LockDocument(attrs);
  }

  static manifest(attrs) {
    return new Manifest(attrs);
  }

  static margin(attrs) {
    return new Margin(attrs);
  }

  static mdp(attrs) {
    return new Mdp(attrs);
  }

  static medium(attrs) {
    return new Medium(attrs);
  }

  static message(attrs) {
    return new Message(attrs);
  }

  static numericEdit(attrs) {
    return new NumericEdit(attrs);
  }

  static occur(attrs) {
    return new Occur(attrs);
  }

  static oid(attrs) {
    return new Oid(attrs);
  }

  static oids(attrs) {
    return new Oids(attrs);
  }

  static overflow(attrs) {
    return new Overflow(attrs);
  }

  static pageArea(attrs) {
    return new PageArea(attrs);
  }

  static pageSet(attrs) {
    return new PageSet(attrs);
  }

  static para(attrs) {
    return new Para(attrs);
  }

  static passwordEdit(attrs) {
    return new PasswordEdit(attrs);
  }

  static pattern(attrs) {
    return new Pattern(attrs);
  }

  static picture(attrs) {
    return new Picture(attrs);
  }

  static proto(attrs) {
    return new Proto(attrs);
  }

  static radial(attrs) {
    return new Radial(attrs);
  }

  static reason(attrs) {
    return new Reason(attrs);
  }

  static reasons(attrs) {
    return new Reasons(attrs);
  }

  static rectangle(attrs) {
    return new Rectangle(attrs);
  }

  static ref(attrs) {
    return new RefElement(attrs);
  }

  static script(attrs) {
    return new Script(attrs);
  }

  static setProperty(attrs) {
    return new SetProperty(attrs);
  }

  static signData(attrs) {
    return new SignData(attrs);
  }

  static signature(attrs) {
    return new Signature(attrs);
  }

  static signing(attrs) {
    return new Signing(attrs);
  }

  static solid(attrs) {
    return new Solid(attrs);
  }

  static speak(attrs) {
    return new Speak(attrs);
  }

  static stipple(attrs) {
    return new Stipple(attrs);
  }

  static subform(attrs) {
    return new Subform(attrs);
  }

  static subformSet(attrs) {
    return new SubformSet(attrs);
  }

  static subjectDN(attrs) {
    return new SubjectDN(attrs);
  }

  static subjectDNs(attrs) {
    return new SubjectDNs(attrs);
  }

  static submit(attrs) {
    return new Submit(attrs);
  }

  static template(attrs) {
    return new Template(attrs);
  }

  static text(attrs) {
    return new Text(attrs);
  }

  static textEdit(attrs) {
    return new TextEdit(attrs);
  }

  static time(attrs) {
    return new Time(attrs);
  }

  static timeStamp(attrs) {
    return new TimeStamp(attrs);
  }

  static toolTip(attrs) {
    return new ToolTip(attrs);
  }

  static traversal(attrs) {
    return new Traversal(attrs);
  }

  static traverse(attrs) {
    return new Traverse(attrs);
  }

  static ui(attrs) {
    return new Ui(attrs);
  }

  static validate(attrs) {
    return new Validate(attrs);
  }

  static value(attrs) {
    return new Value(attrs);
  }

  static variables(attrs) {
    return new Variables(attrs);
  }
}

export {
  BindItems,
  Field,
  Items,
  SetProperty,
  Template,
  TemplateNamespace,
  Text,
  Value,
};
