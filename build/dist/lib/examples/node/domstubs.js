/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

function xmlEncode(s) {
  var i = 0,
      ch;
  s = String(s);

  while (i < s.length && (ch = s[i]) !== "&" && ch !== "<" && ch !== '"' && ch !== "\n" && ch !== "\r" && ch !== "\t") {
    i++;
  }

  if (i >= s.length) {
    return s;
  }

  var buf = s.substring(0, i);

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
      insertRule: function (rule) {
        this.cssRules.push(rule);
      }
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
    if (name in this.attributes) {
      return this.attributes[name];
    }

    if (NS) {
      var suffix = ":" + name;

      for (var fullName in this.attributes) {
        if (fullName.slice(-suffix.length) === suffix) {
          return this.attributes[fullName];
        }
      }
    }

    return null;
  },
  setAttribute: function DOMElement_setAttribute(name, value) {
    value = value || "";
    value = xmlEncode(value);
    this.attributes[name] = value;
  },
  setAttributeNS: function DOMElement_setAttributeNS(NS, name, value) {
    this.setAttribute(name, value);
  },
  appendChild: function DOMElement_appendChild(element) {
    var childNodes = this.childNodes;

    if (!childNodes.includes(element)) {
      childNodes.push(element);
    }
  },
  hasChildNodes: function DOMElement_hasChildNodes() {
    return this.childNodes.length !== 0;
  },
  cloneNode: function DOMElement_cloneNode() {
    var newNode = new DOMElement(this.nodeName);
    newNode.childNodes = this.childNodes;
    newNode.attributes = this.attributes;
    newNode.textContent = this.textContent;
    return newNode;
  },
  toString: function DOMElement_toString() {
    var buf = [];
    var serializer = this.getSerializer();
    var chunk;

    while ((chunk = serializer.getNext()) !== null) {
      buf.push(chunk);
    }

    return buf.join("");
  },
  getSerializer: function DOMElement_getSerializer() {
    return new DOMElementSerializer(this);
  }
};

function DOMElementSerializer(node) {
  this._node = node;
  this._state = 0;
  this._loopIndex = 0;
  this._attributeKeys = null;
  this._childSerializer = null;
}

DOMElementSerializer.prototype = {
  getNext: function DOMElementSerializer_getNext() {
    var node = this._node;

    switch (this._state) {
      case 0:
        ++this._state;
        return "<" + node.nodeName;

      case 1:
        ++this._state;

        if (node.nodeName === "svg:svg") {
          return ' xmlns:xlink="http://www.w3.org/1999/xlink"' + ' xmlns:svg="http://www.w3.org/2000/svg"';
        }

      case 2:
        ++this._state;
        this._loopIndex = 0;
        this._attributeKeys = Object.keys(node.attributes);

      case 3:
        if (this._loopIndex < this._attributeKeys.length) {
          var name = this._attributeKeys[this._loopIndex++];
          return " " + name + '="' + xmlEncode(node.attributes[name]) + '"';
        }

        ++this._state;
        return ">";

      case 4:
        if (node.nodeName === "svg:tspan" || node.nodeName === "svg:style") {
          this._state = 6;
          return xmlEncode(node.textContent);
        }

        ++this._state;
        this._loopIndex = 0;

      case 5:
        var value;

        while (true) {
          value = this._childSerializer && this._childSerializer.getNext();

          if (value !== null) {
            return value;
          }

          var nextChild = node.childNodes[this._loopIndex++];

          if (nextChild) {
            this._childSerializer = new DOMElementSerializer(nextChild);
          } else {
            this._childSerializer = null;
            ++this._state;
            break;
          }
        }

      case 6:
        ++this._state;
        return "</" + node.nodeName + ">";

      case 7:
        return null;

      default:
        throw new Error("Unexpected serialization state: " + this._state);
    }
  }
};
const document = {
  childNodes: [],

  get currentScript() {
    return {
      src: ""
    };
  },

  get documentElement() {
    return this;
  },

  createElementNS: function (NS, element) {
    var elObject = new DOMElement(element);
    return elObject;
  },
  createElement: function (element) {
    return this.createElementNS("", element);
  },
  getElementsByTagName: function (element) {
    if (element === "head") {
      return [this.head || (this.head = new DOMElement("head"))];
    }

    return [];
  }
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
  }

};
exports.document = document;
exports.Image = Image;
var exported_symbols = Object.keys(exports);

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