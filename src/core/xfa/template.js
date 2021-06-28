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
  $isTransparent,
  $isUsable,
  $namespaceId,
  $nodeName,
  $onChild,
  $onText,
  $removeChild,
  $searchNode,
  $setSetAttributes,
  $setValue,
  $text,
  $toHTML,
  $toStyle,
  $uid,
  ContentObject,
  Option01,
  OptionObject,
  StringObject,
  XFAObject,
  XFAObjectArray,
} from "./xfa_object.js";
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
  isPrintOnly,
  layoutClass,
  layoutText,
  measureToString,
  setAccess,
  setFontFamily,
  setMinMaxDimensions,
  toStyle,
} from "./html_utils.js";
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
import { stringToBytes, Util, warn } from "../../shared/util.js";
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

function valueToHtml(value) {
  return HTMLResult.success({
    name: "span",
    attributes: {
      class: ["xfaRich"],
      style: Object.create(null),
    },
    value,
  });
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
    const edge = this.edge ? this.edge : new Edge({});
    const edgeStyle = edge[$toStyle]();
    const style = Object.create(null);
    if (this.fill) {
      Object.assign(style, this.fill[$toStyle]());
    } else {
      style.fill = "transparent";
    }
    style.strokeWidth = measureToString(
      edge.presence === "visible" ? Math.round(edge.thickness) : 0
    );
    style.stroke = edgeStyle.color;
    let arc;
    const attributes = {
      xmlns: SVG_NS,
      style: {
        position: "absolute",
        width: "100%",
        height: "100%",
      },
    };

    if (this.startAngle === 0 && this.sweepAngle === 360) {
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
      const largeArc = this.sweepAngle - this.startAngle > 180 ? 1 : 0;
      const [x1, y1, x2, y2] = [
        50 * (1 + Math.cos(startAngle)),
        50 * (1 - Math.sin(startAngle)),
        50 * (1 + Math.cos(sweepAngle)),
        50 * (1 - Math.sin(sweepAngle)),
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

    return HTMLResult.success({
      name: "svg",
      children: [arc],
      attributes,
    });
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
        ].includes(k) || k.match(/iso-8859-[0-9]{2}/),
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

  [$toStyle]() {
    // TODO: incomplete.
    const edges = this.edge.children.slice();
    if (edges.length < 4) {
      const defaultEdge = edges[edges.length - 1] || new Edge({});
      for (let i = edges.length; i < 4; i++) {
        edges.push(defaultEdge);
      }
    }

    const edgeStyles = edges.map(node => {
      const style = node[$toStyle]();
      style.color = style.color || "#000000";
      return style;
    });

    const widths = edges.map(edge => edge.thickness);
    const insets = [0, 0, 0, 0];
    if (this.margin) {
      insets[0] = this.margin.topInset;
      insets[1] = this.margin.rightInset;
      insets[2] = this.margin.bottomInset;
      insets[3] = this.margin.leftInset;
    }
    this[$extra] = { widths, insets };
    // TODO: hand.

    const style = Object.create(null);
    if (this.margin) {
      Object.assign(style, this.margin[$toStyle]());
    }

    if (this.fill) {
      Object.assign(style, this.fill[$toStyle]());
    }

    if (this.corner.children.some(node => node.radius !== 0)) {
      const cornerStyles = this.corner.children.map(node => node[$toStyle]());
      if (cornerStyles.length === 2 || cornerStyles.length === 3) {
        const last = cornerStyles[cornerStyles.length - 1];
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
      "pageEven",
      "pageOdd",
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
      "pageEven",
      "pageOdd",
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
    return HTMLResult.success({
      name: "button",
      attributes: {
        id: this[$uid],
        class: ["xfaButton"],
        style: {},
      },
      children: [],
    });
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
    this.reserve = getMeasurement(attributes.reserve);
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

  [$toHTML](availableSpace) {
    // TODO: incomplete.
    if (!this.value) {
      return HTMLResult.EMPTY;
    }

    const value = this.value[$toHTML](availableSpace).html;
    if (!value) {
      return HTMLResult.EMPTY;
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

    const style = toStyle(this, "font", "margin", "para", "visibility");
    switch (this.placement) {
      case "left":
      case "right":
        if (this.reserve > 0) {
          style.width = measureToString(this.reserve);
        } else {
          style.minWidth = measureToString(this.reserve);
        }
        break;
      case "top":
      case "bottom":
        if (this.reserve > 0) {
          style.height = measureToString(this.reserve);
        } else {
          style.minHeight = measureToString(this.reserve);
        }
        break;
    }

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
      on: (items[0] || "on").toString(),
      off: (items[1] || "off").toString(),
    };

    const value = (field.value && field.value[$text]()) || "off";
    const checked = value === exportedValue.on || undefined;
    const container = field[$getParent]();
    const fieldId = field[$uid];
    let dataId;

    if (container instanceof ExclGroup) {
      groupId = container[$uid];
      type = "radio";
      className = "xfaRadio";
      dataId = container[$data] && container[$data][$uid];
    } else {
      type = "checkbox";
      className = "xfaCheckbox";
      dataId = field[$data] && field[$data][$uid];
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
      },
    };

    if (groupId) {
      input.attributes.name = groupId;
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
      const value = (field.value && field.value[$text]()) || "";
      for (let i = 0, ii = displayed.length; i < ii; i++) {
        const option = {
          name: "option",
          attributes: {
            value: values[i] || displayed[i],
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
      dataId: field[$data] && field[$data][$uid],
      style,
    };

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
      position: "absolute",
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
        dataId: field[$data] && field[$data][$uid],
        class: ["xfaTextfield"],
        style,
      },
    };

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
    if (this.presence === "hidden" || this.presence === "inactive") {
      return HTMLResult.EMPTY;
    }

    fixDimensions(this);

    if ((this.w === "" || this.h === "") && this.value) {
      let marginH = 0;
      let marginV = 0;
      if (this.margin) {
        marginH = this.margin.leftInset + this.margin.rightInset;
        marginV = this.margin.topInset + this.margin.bottomInset;
      }

      const maxWidth = this.w === "" ? availableSpace.width : this.w;
      const fontFinder = this[$globalData].fontFinder;
      let font = this.font;
      if (!font) {
        let parent = this[$getParent]();
        while (!(parent instanceof Template)) {
          if (parent.font) {
            font = parent.font;
            break;
          }
          parent = parent[$getParent]();
        }
      }

      let height = null;
      let width = null;
      if (
        this.value.exData &&
        this.value.exData[$content] &&
        this.value.exData.contentType === "text/html"
      ) {
        const res = layoutText(
          this.value.exData[$content],
          font,
          fontFinder,
          maxWidth
        );
        width = res.width;
        height = res.height;
      } else {
        const text = this.value[$text]();
        if (text) {
          const res = layoutText(text, font, fontFinder, maxWidth);
          width = res.width;
          height = res.height;
        }
      }

      if (width !== null && this.w === "") {
        this.w = width + marginH;
      }

      if (height !== null && this.h === "") {
        this.h = height + marginV;
      }
    }

    if (!checkDimensions(this, availableSpace)) {
      return HTMLResult.FAILURE;
    }

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

    const bbox = computeBbox(this, html, availableSpace);

    const value = this.value ? this.value[$toHTML](availableSpace).html : null;
    if (value === null) {
      return HTMLResult.success(createWrapper(this, html), bbox);
    }

    html.children.push(value);
    if (value.attributes.class && value.attributes.class.includes("xfaRich")) {
      if (this.h === "") {
        style.height = "auto";
      }
      if (this.w === "") {
        style.width = "auto";
      }
      if (this.para) {
        // By definition exData are external data so para
        // has no effect on it.
        attributes.style.display = "flex";
        attributes.style.flexDirection = "column";
        switch (this.para.vAlign) {
          case "top":
            attributes.style.justifyContent = "start";
            break;
          case "bottom":
            attributes.style.justifyContent = "end";
            break;
          case "middle":
            attributes.style.justifyContent = "center";
            break;
        }

        const paraStyle = this.para[$toStyle]();
        if (!value.attributes.style) {
          value.attributes.style = paraStyle;
        } else {
          for (const [key, val] of Object.entries(paraStyle)) {
            if (!(key in value.attributes.style)) {
              value.attributes.style[key] = val;
            }
          }
        }
      }
    }

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

  [$isSplittable]() {
    // We cannot cache the result here because the contentArea
    // can change.
    const root = this[$getTemplateRoot]();
    const contentArea = root[$extra].currentContentArea;
    if (contentArea && Math.max(this.minH, this.h || 0) >= contentArea.h) {
      return true;
    }

    if (this.layout === "position") {
      return false;
    }

    const parentLayout = this[$getParent]().layout;
    if (parentLayout && parentLayout.includes("row")) {
      return false;
    }

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
      availableSpace,
      width: 0,
      height: 0,
      prevHeight: 0,
      currentWidth: 0,
    });

    if (!checkDimensions(this, availableSpace)) {
      return HTMLResult.FAILURE;
    }

    availableSpace = {
      width: this.w === "" ? availableSpace.width : this.w,
      height: this.h === "" ? availableSpace.height : this.h,
    };

    const filter = new Set(["field"]);

    if (this.layout === "row") {
      const columnWidths = this[$getParent]().columnWidths;
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

    let failure;
    if (this.layout === "lr-tb" || this.layout === "rl-tb") {
      for (
        ;
        this[$extra].attempt < MAX_ATTEMPTS_FOR_LRTB_LAYOUT;
        this[$extra].attempt++
      ) {
        const result = this[$childrenToHTML]({
          filter,
          include: true,
        });
        if (result.success) {
          break;
        }
        if (result.isBreak()) {
          return result;
        }
      }

      failure = this[$extra].attempt === MAX_ATTEMPTS_FOR_LRTB_LAYOUT;
    } else {
      const result = this[$childrenToHTML]({
        filter,
        include: true,
      });
      failure = !result.success;
      if (failure && result.isBreak()) {
        return result;
      }
    }

    if (failure) {
      if (this[$isSplittable]()) {
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
    if (
      !this.ui ||
      this.presence === "hidden" ||
      this.presence === "inactive" ||
      this.h === 0 ||
      this.w === 0
    ) {
      return HTMLResult.EMPTY;
    }

    fixDimensions(this);

    if (!checkDimensions(this, availableSpace)) {
      return HTMLResult.FAILURE;
    }

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

    const borderStyle = this.border ? this.border[$toStyle]() : null;

    const bbox = computeBbox(this, html, availableSpace);
    const ui = this.ui ? this.ui[$toHTML]().html : null;
    if (!ui) {
      Object.assign(style, borderStyle);
      return HTMLResult.success(createWrapper(this, html), bbox);
    }

    if (!ui.attributes.style) {
      ui.attributes.style = Object.create(null);
    }

    if (this.ui.button) {
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
        } else {
          const htmlValue = this.value[$toHTML]().html;
          if (htmlValue !== null) {
            value = htmlValue.value;
          }
        }
        if (this.ui.textEdit && this.value.text && this.value.text.maxChars) {
          ui.children[0].attributes.maxLength = this.value.text.maxChars;
        }

        if (value) {
          if (ui.children[0].name === "textarea") {
            ui.children[0].attributes.textContent = value;
          } else {
            ui.children[0].attributes.value = value;
          }
        }
      }
    }

    const caption = this.caption ? this.caption[$toHTML]().html : null;
    if (!caption) {
      if (ui.attributes.class) {
        // Even if no caption this class will help to center the ui.
        ui.attributes.class.push("xfaLeft");
      }
      return HTMLResult.success(createWrapper(this, html), bbox);
    }

    if (this.ui.button) {
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

    switch (this.caption.placement) {
      case "left":
        ui.children.splice(0, 0, caption);
        ui.attributes.class.push("xfaLeft");
        break;
      case "right":
        ui.children.push(caption);
        ui.attributes.class.push("xfaLeft");
        break;
      case "top":
        ui.children.splice(0, 0, caption);
        ui.attributes.class.push("xfaTop");
        break;
      case "bottom":
        ui.children.push(caption);
        ui.attributes.class.push("xfaTop");
        break;
      case "inline":
        // TODO;
        ui.attributes.class.push("xfaLeft");
        break;
    }

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
    const style = Object.create(null);

    let propName = "color";
    if (parent instanceof Border) {
      propName = "background";
    }
    if (parent instanceof Rectangle || parent instanceof Arc) {
      propName = "fill";
      style.fill = "transparent";
    }

    for (const name of Object.getOwnPropertyNames(this)) {
      if (name === "extras" || name === "color") {
        continue;
      }
      const obj = this[name];
      if (!(obj instanceof XFAObject)) {
        continue;
      }

      style[propName] = obj[$toStyle](this.color);
      return style;
    }

    if (this.color) {
      style[propName] = this.color[$toStyle]();
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

    const fontSize = measureToString(0.99 * this.size);
    if (fontSize !== "10px") {
      style.fontSize = fontSize;
    }

    setFontFamily(this, this[$globalData].fontFinder, style);

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
    if (this.href || !this[$content]) {
      // TODO: href can be a Name referring to an internal stream
      // containing a picture.
      // In general, we don't get remote data and use what we have
      // in the pdf itself, so no picture for non null href.
      return HTMLResult.EMPTY;
    }

    // TODO: Firefox doesn't support natively tiff (and tif) format.
    if (this.transferEncoding === "base64") {
      const buffer = stringToBytes(atob(this[$content]));
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
            width: "auto",
            height: "100%",
          };
          break;
        case "none":
          style = {
            width: "100%",
            height: "100%",
          };
          break;
        case "width":
          style = {
            width: "100%",
            height: "auto",
          };
          break;
      }
      return HTMLResult.success({
        name: "img",
        attributes: {
          class: ["xfaImage"],
          style,
          src: URL.createObjectURL(blob),
        },
      });
    }

    return HTMLResult.EMPTY;
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
    const edge = this.edge ? this.edge : new Edge({});
    const edgeStyle = edge[$toStyle]();
    const style = Object.create(null);
    const thickness =
      edge.presence === "visible" ? Math.round(edge.thickness) : 0;
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
    } else {
      if (this.slope === "\\") {
        [x1, y1, x2, y2] = [0, 0, "100%", "100%"];
      } else {
        [x1, y1, x2, y2] = [0, "100%", "100%", 0];
      }
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

    return HTMLResult.success({
      name: "svg",
      children: [line],
      attributes: {
        xmlns: SVG_NS,
        width,
        height,
        style: {
          position: "absolute",
        },
      },
    });
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
        dataId: field[$data] && field[$data][$uid],
        class: ["xfaTextfield"],
        style,
      },
    };

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
    this.initial = getInteger({
      data: attributes.initial,
      defaultValue: 1,
      validate: x => true,
    });
    this.max = getInteger({
      data: attributes.max,
      defaultValue: 1,
      validate: x => true,
    });
    this.min = getInteger({
      data: attributes.min,
      defaultValue: 1,
      validate: x => true,
    });
    this.use = attributes.use || "";
    this.usehref = attributes.usehref || "";
    this.extras = null;
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
        id: this[$uid],
        style,
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
      style.marginLeft = measureToString(this.marginLeft);
    }
    if (this.marginRight !== "") {
      style.marginRight = measureToString(this.marginRight);
    }
    if (this.spaceAbove !== "") {
      style.marginTop = measureToString(this.spaceAbove);
    }
    if (this.spaceBelow !== "") {
      style.marginBottom = measureToString(this.spaceBelow);
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
    return `radial-gradient(circle to center, ${colors})`;
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
    if (this.fill) {
      Object.assign(style, this.fill[$toStyle]());
    } else {
      style.fill = "transparent";
    }
    style.strokeWidth = measureToString(
      edge.presence === "visible" ? 2 * edge.thickness : 0
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

    return HTMLResult.success({
      name: "svg",
      children: [rect],
      attributes: {
        xmlns: SVG_NS,
        style: {
          position: "absolute",
        },
        width: "100%",
        height: "100%",
      },
    });
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

  [$isBindable]() {
    return true;
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

  [$isSplittable](x) {
    // We cannot cache the result here because the contentArea
    // can change.
    const root = this[$getTemplateRoot]();
    const contentArea = root[$extra].currentContentArea;
    if (contentArea && Math.max(this.minH, this.h || 0) >= contentArea.h) {
      return true;
    }

    if (this.layout === "position") {
      return false;
    }

    if (this.keep && this.keep.intact !== "none") {
      return false;
    }

    const parentLayout = this[$getParent]().layout;
    if (parentLayout && parentLayout.includes("row")) {
      return false;
    }

    if (this.overflow && this.overflow.target) {
      const target = root[$searchNode](this.overflow.target, this);
      return target && target[0] === contentArea;
    }

    return true;
  }

  [$toHTML](availableSpace) {
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
      if (!breakBefore[$extra]) {
        // Set $extra to true to consume it.
        breakBefore[$extra] = true;
        return HTMLResult.breakNode(breakBefore);
      }
    }

    if (this[$extra] && this[$extra].afterBreakAfter) {
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
      attributes,
      attempt: 0,
      availableSpace,
      width: 0,
      height: 0,
      prevHeight: 0,
      currentWidth: 0,
    });

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

    const isSplittable = this[$isSplittable]();

    // If the container overflows into itself we add an extra
    // layout step to accept finally the element which caused
    // the overflow.
    let maxRun =
      this.layout === "lr-tb" || this.layout === "rl-tb"
        ? MAX_ATTEMPTS_FOR_LRTB_LAYOUT
        : 1;
    maxRun += !isSplittable && this.layout !== "position" ? 1 : 0;
    for (; this[$extra].attempt < maxRun; this[$extra].attempt++) {
      const result = this[$childrenToHTML]({
        filter,
        include: true,
      });
      if (result.success) {
        break;
      }
      if (result.isBreak()) {
        return result;
      }
    }

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

    const result = HTMLResult.success(createWrapper(this, html), bbox);

    if (this.breakAfter.children.length >= 1) {
      const breakAfter = this.breakAfter.children[0];
      this[$extra].afterBreakAfter = result;
      return HTMLResult.breakNode(breakAfter);
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
        ].includes(k) || k.match(/iso-8859-[0-9]{2}/),
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
  }

  [$searchNode](expr, container) {
    if (expr.startsWith("#")) {
      // This is an id.
      return [this[$ids].get(expr.slice(1))];
    }
    return searchNode(this, container, expr, true, true);
  }

  [$toHTML]() {
    if (!this.subform.children.length) {
      return HTMLResult.success({
        name: "div",
        children: [],
      });
    }
    this[$extra] = {
      overflowNode: null,
      pageNumber: 1,
      pagePosition: "first",
      oddOrEven: "odd",
      blankOrNotBlank: "nonBlank",
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
    } else if (root.break && root.break.beforeTarget) {
      breakBefore = root.break;
      breakBeforeTarget = breakBefore.beforeTarget;
    } else if (
      root.subform.children.length >= 1 &&
      root.subform.children[0].break &&
      root.subform.children[0].break.beforeTarget
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

    while (true) {
      if (!hasSomething) {
        // Nothing has been added in the previous page
        if (++hasSomethingCounter === MAX_EMPTY_PAGES) {
          warn("XFA - Something goes wrong: please file a bug.");
          return mainHtml;
        }
      } else {
        hasSomethingCounter = 0;
      }

      targetPageArea = null;
      const page = pageArea[$toHTML]().html;
      mainHtml.children.push(page);

      if (leader) {
        page.children.push(leader[$toHTML](pageArea[$extra].space).html);
        leader = null;
      }

      if (trailer) {
        page.children.push(trailer[$toHTML](pageArea[$extra].space).html);
        trailer = null;
      }

      const contentAreas = pageArea.contentArea.children;
      const htmlContentAreas = page.children.filter(node =>
        node.attributes.class.includes("xfaContentarea")
      );

      hasSomething = false;

      const flush = index => {
        const html = root[$flushHTML]();
        if (html) {
          hasSomething =
            hasSomething || (html.children && html.children.length !== 0);
          htmlContentAreas[index].children.push(html);
        }
      };

      for (let i = 0, ii = contentAreas.length; i < ii; i++) {
        const contentArea = (this[$extra].currentContentArea = contentAreas[i]);
        const space = { width: contentArea.w, height: contentArea.h };

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
            hasSomething =
              hasSomething ||
              (html.html.children && html.html.children.length !== 0);
            htmlContentAreas[i].children.push(html.html);
          } else if (!hasSomething) {
            mainHtml.children.pop();
          }
          return mainHtml;
        }

        if (html.isBreak()) {
          const node = html.breakNode;

          if (node.targetType === "auto") {
            flush(i);
            continue;
          }

          const startNew = node.startNew === 1;

          if (node.leader) {
            leader = this[$searchNode](node.leader, node[$getParent]());
            leader = leader ? leader[0] : null;
          }

          if (node.trailer) {
            trailer = this[$searchNode](node.trailer, node[$getParent]());
            trailer = trailer ? trailer[0] : null;
          }

          let target = null;
          if (node.target) {
            target = this[$searchNode](node.target, node[$getParent]());
            target = target ? target[0] : target;
          }

          if (node.targetType === "pageArea") {
            if (!(target instanceof PageArea)) {
              target = null;
            }

            if (startNew) {
              targetPageArea = target || pageArea;
              flush(i);
              i = Infinity;
            } else if (target && target !== pageArea) {
              targetPageArea = target;
              flush(i);
              i = Infinity;
            } else {
              i--;
            }
          } else if (node.targetType === "contentArea") {
            if (!(target instanceof ContentArea)) {
              target = null;
            }

            const index = contentAreas.findIndex(e => e === target);
            if (index !== -1) {
              flush(i);
              i = index - 1;
            } else {
              i--;
            }
          }
          continue;
        }

        if (this[$extra].overflowNode) {
          const node = this[$extra].overflowNode;
          this[$extra].overflowNode = null;

          flush(i);

          if (node.leader) {
            leader = this[$searchNode](node.leader, node[$getParent]());
            leader = leader ? leader[0] : null;
          }

          if (node.trailer) {
            trailer = this[$searchNode](node.trailer, node[$getParent]());
            trailer = trailer ? trailer[0] : null;
          }

          let target = null;
          if (node.target) {
            target = this[$searchNode](node.target, node[$getParent]());
            target = target ? target[0] : target;
          }

          if (target instanceof PageArea) {
            // We must stop the contentAreas filling and go to the next page.
            targetPageArea = target;
            i = Infinity;
            continue;
          } else if (target instanceof ContentArea) {
            const index = contentAreas.findIndex(e => e === target);
            if (index !== -1) {
              i = index - 1;
            } else {
              i--;
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
    this.multiLine = attributes.multiLine || "";
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

  [$clean](builder) {
    super[$clean](builder);
    const parent = this[$getParent]();
    const defaultValue = parent instanceof Draw ? 1 : 0;
    this.multiLine = getInteger({
      data: this.multiLine,
      defaultValue,
      validate: x => x === 0 || x === 1,
    });
  }

  [$toHTML](availableSpace) {
    // TODO: incomplete.
    const style = toStyle(this, "border", "font", "margin");
    let html;
    const field = this[$getParent]()[$getParent]();
    if (this.multiLine === 1) {
      html = {
        name: "textarea",
        attributes: {
          dataId: field[$data] && field[$data][$uid],
          fieldId: field[$uid],
          class: ["xfaTextfield"],
          style,
        },
      };
    } else {
      html = {
        name: "input",
        attributes: {
          type: "text",
          dataId: field[$data] && field[$data][$uid],
          fieldId: field[$uid],
          class: ["xfaTextfield"],
          style,
        },
      };
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

  [$toHTML](availableSpace) {
    // TODO: picture.
    for (const name of Object.getOwnPropertyNames(this)) {
      if (name === "extras" || name === "picture") {
        continue;
      }
      const obj = this[name];
      if (!(obj instanceof XFAObject)) {
        continue;
      }

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
      if (parent.ui && parent.ui.imageEdit) {
        if (!this.image) {
          this.image = new Image({});
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
