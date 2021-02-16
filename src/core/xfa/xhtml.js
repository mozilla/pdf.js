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

import { $buildXFAObject, NamespaceIds } from "./namespaces.js";
import { $text, XmlObject } from "./xfa_object.js";

const XHTML_NS_ID = NamespaceIds.xhtml.id;

const VALID_STYLES = new Set([
  "color",
  "font",
  "font-family",
  "font-size",
  "font-stretch",
  "font-style",
  "font-weight",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "letter-spacing",
  "line-height",
  "orphans",
  "page-break-after",
  "page-break-before",
  "page-break-inside",
  "tab-interval",
  "tab-stop",
  "text-decoration",
  "text-indent",
  "vertical-align",
  "widows",
  "kerning-mode",
  "xfa-font-horizontal-scale",
  "xfa-font-vertical-scale",
  "xfa-tab-stops",
]);

function checkStyle(style) {
  if (!style) {
    return "";
  }

  // Remove any non-allowed keys.
  return style
    .trim()
    .split(/\s*;\s*/)
    .filter(s => !!s)
    .map(s => s.split(/\s*:\s*/, 2))
    .filter(([key]) => VALID_STYLES.has(key))
    .map(kv => kv.join(":"))
    .join(";");
}

class A extends XmlObject {
  constructor(attributes) {
    super(XHTML_NS_ID, "a");
    this.href = attributes.href || "";
    this.style = checkStyle(attributes.style);
  }
}

class B extends XmlObject {
  constructor(attributes) {
    super(XHTML_NS_ID, "b");
    this.style = checkStyle(attributes.style);
  }
}

class Body extends XmlObject {
  constructor(attributes) {
    super(XHTML_NS_ID, "body");
    this.style = checkStyle(attributes.style);
  }
}

class Br extends XmlObject {
  constructor(attributes) {
    super(XHTML_NS_ID, "br");
    this.style = checkStyle(attributes.style);
  }

  [$text]() {
    return "\n";
  }
}

class Html extends XmlObject {
  constructor(attributes) {
    super(XHTML_NS_ID, "html");
    this.style = checkStyle(attributes.style);
  }
}

class I extends XmlObject {
  constructor(attributes) {
    super(XHTML_NS_ID, "i");
    this.style = checkStyle(attributes.style);
  }
}

class Li extends XmlObject {
  constructor(attributes) {
    super(XHTML_NS_ID, "li");
    this.style = checkStyle(attributes.style);
  }
}

class Ol extends XmlObject {
  constructor(attributes) {
    super(XHTML_NS_ID, "ol");
    this.style = checkStyle(attributes.style);
  }
}

class P extends XmlObject {
  constructor(attributes) {
    super(XHTML_NS_ID, "p");
    this.style = checkStyle(attributes.style);
  }
}

class Span extends XmlObject {
  constructor(attributes) {
    super(XHTML_NS_ID, "span");
    this.style = checkStyle(attributes.style);
  }
}

class Sub extends XmlObject {
  constructor(attributes) {
    super(XHTML_NS_ID, "sub");
    this.style = checkStyle(attributes.style);
  }
}

class Sup extends XmlObject {
  constructor(attributes) {
    super(XHTML_NS_ID, "sup");
    this.style = checkStyle(attributes.style);
  }
}

class Ul extends XmlObject {
  constructor(attributes) {
    super(XHTML_NS_ID, "ul");
    this.style = checkStyle(attributes.style);
  }
}

class XhtmlNamespace {
  static [$buildXFAObject](name, attributes) {
    if (XhtmlNamespace.hasOwnProperty(name)) {
      return XhtmlNamespace[name](attributes);
    }
    return undefined;
  }

  static a(attributes) {
    return new A(attributes);
  }

  static b(attributes) {
    return new B(attributes);
  }

  static body(attributes) {
    return new Body(attributes);
  }

  static br(attributes) {
    return new Br(attributes);
  }

  static html(attributes) {
    return new Html(attributes);
  }

  static i(attributes) {
    return new I(attributes);
  }

  static li(attributes) {
    return new Li(attributes);
  }

  static ol(attributes) {
    return new Ol(attributes);
  }

  static p(attributes) {
    return new P(attributes);
  }

  static span(attributes) {
    return new Span(attributes);
  }

  static sub(attributes) {
    return new Sub(attributes);
  }

  static sup(attributes) {
    return new Sup(attributes);
  }

  static ul(attributes) {
    return new Ul(attributes);
  }
}

export { XhtmlNamespace };
