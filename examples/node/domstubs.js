/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

function xmlEncode(s) {
  let i = 0,
    ch;
  s = String(s);
  while (
    i < s.length &&
    (ch = s[i]) !== "&" &&
    ch !== "<" &&
    ch !== '"' &&
    ch !== "\n" &&
    ch !== "\r" &&
    ch !== "\t"
  ) {
    i++;
  }
  if (i >= s.length) {
    return s;
  }
  let buf = s.substring(0, i);
  while (i < s.length) {
    ch = s[i++];
    switch (ch) {
      case "&":
        buf += "&amp;";
        break;
      case "<":
        buf += "&lt;";
        break;
      case '"':
        buf += "&quot;";
        break;
      case "\n":
        buf += "&#xA;";
        break;
      case "\r":
        buf += "&#xD;";
        break;
      case "\t":
        buf += "&#x9;";
        break;
      default:
        buf += ch;
        break;
    }
  }
  return buf;
}

function DOMElement(name) {
  this.nodeName = name;
  this.childNodes = [];
  this.attributes = {};
  this.textContent = "";

  if (name === "style") {
    this.sheet = {
      cssRules: [],
      insertRule(rule) {
        this.cssRules.push(rule);
      },
    };
  }
}

DOMElement.prototype = {
  getAttribute: function DOMElement_getAttribute(name) {
    if (name in this.attributes) {
      return this.attributes[name];
    }
    return null;
  },

  getAttributeNS: function DOMElement_getAttributeNS(NS, name) {
    // Fast path
    if (name in this.attributes) {
      return this.attributes[name];
    }
    // Slow path - used by test/unit/display_svg_spec.js
    // Assuming that there is only one matching attribute for a given name,
    // across all namespaces.
    if (NS) {
      const suffix = ":" + name;
      for (const fullName in this.attributes) {
        if (fullName.slice(-suffix.length) === suffix) {
          return this.attributes[fullName];
        }
      }
    }
    return null;
  },

  setAttribute: function DOMElement_setAttribute(name, value) {
    this.attributes[name] = value || "";
  },

  setAttributeNS: function DOMElement_setAttributeNS(NS, name, value) {
    this.setAttribute(name, value);
  },

  appendChild: function DOMElement_appendChild(element) {
    const childNodes = this.childNodes;
    if (!childNodes.includes(element)) {
      childNodes.push(element);
    }
  },

  hasChildNodes: function DOMElement_hasChildNodes() {
    return this.childNodes.length !== 0;
  },

  cloneNode: function DOMElement_cloneNode() {
    const newNode = new DOMElement(this.nodeName);
    newNode.childNodes = this.childNodes;
    newNode.attributes = this.attributes;
    newNode.textContent = this.textContent;
    return newNode;
  },

  // This method is offered for convenience. It is recommended to directly use
  // getSerializer because that allows you to process the chunks as they come
  // instead of requiring the whole image to fit in memory.
  toString: function DOMElement_toString() {
    const buf = [];
    const serializer = this.getSerializer();
    let chunk;
    while ((chunk = serializer.getNext()) !== null) {
      buf.push(chunk);
    }
    return buf.join("");
  },

  getSerializer: function DOMElement_getSerializer() {
    return new DOMElementSerializer(this);
  },
};

function DOMElementSerializer(node) {
  this._node = node;
  this._state = 0;
  this._loopIndex = 0;
  this._attributeKeys = null;
  this._childSerializer = null;
}
DOMElementSerializer.prototype = {
  /**
   * Yields the next chunk in the serialization of the element.
   *
   * @returns {string|null} null if the element has fully been serialized.
   */
  getNext: function DOMElementSerializer_getNext() {
    const node = this._node;
    switch (this._state) {
      case 0: // Start opening tag.
        ++this._state;
        return "<" + node.nodeName;
      case 1: // Add SVG namespace if this is the root element.
        ++this._state;
        if (node.nodeName === "svg:svg") {
          return (
            ' xmlns:xlink="http://www.w3.org/1999/xlink"' +
            ' xmlns:svg="http://www.w3.org/2000/svg"'
          );
        }
      /* falls through */
      case 2: // Initialize variables for looping over attributes.
        ++this._state;
        this._loopIndex = 0;
        this._attributeKeys = Object.keys(node.attributes);
      /* falls through */
      case 3: // Serialize any attributes and end opening tag.
        if (this._loopIndex < this._attributeKeys.length) {
          const name = this._attributeKeys[this._loopIndex++];
          return " " + name + '="' + xmlEncode(node.attributes[name]) + '"';
        }
        ++this._state;
        return ">";
      case 4: // Serialize textContent for tspan/style elements.
        if (node.nodeName === "svg:tspan" || node.nodeName === "svg:style") {
          this._state = 6;
          return xmlEncode(node.textContent);
        }
        ++this._state;
        this._loopIndex = 0;
      /* falls through */
      case 5: // Serialize child nodes (only for non-tspan/style elements).
        while (true) {
          const value =
            this._childSerializer && this._childSerializer.getNext();
          if (value !== null) {
            return value;
          }
          const nextChild = node.childNodes[this._loopIndex++];
          if (nextChild) {
            this._childSerializer = new DOMElementSerializer(nextChild);
          } else {
            this._childSerializer = null;
            ++this._state;
            break;
          }
        }
      /* falls through */
      case 6: // Ending tag.
        ++this._state;
        return "</" + node.nodeName + ">";
      case 7: // Done.
        return null;
      default:
        throw new Error("Unexpected serialization state: " + this._state);
    }
  },
};

const document = {
  childNodes: [],

  get currentScript() {
    return { src: "" };
  },

  get documentElement() {
    return this;
  },

  createElementNS(NS, element) {
    const elObject = new DOMElement(element);
    return elObject;
  },

  createElement(element) {
    return this.createElementNS("", element);
  },

  getElementsByTagName(element) {
    if (element === "head") {
      return [this.head || (this.head = new DOMElement("head"))];
    }
    return [];
  },
};

function Image() {
  this._src = null;
  this.onload = null;
}
Image.prototype = {
  get src() {
    return this._src;
  },
  set src(value) {
    this._src = value;
    if (this.onload) {
      this.onload();
    }
  },
};

exports.document = document;
exports.Image = Image;

const exported_symbols = Object.keys(exports);

exports.setStubs = function (namespace) {
  exported_symbols.forEach(function (key) {
    console.assert(!(key in namespace), "property should not be set: " + key);
    namespace[key] = exports[key];
  });
};
exports.unsetStubs = function (namespace) {
  exported_symbols.forEach(function (key) {
    console.assert(key in namespace, "property should be set: " + key);
    delete namespace[key];
  });
};
