/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

function xmlEncode(s){
  var i = 0, ch;
  s = String(s);
  while (i < s.length && (ch = s[i]) !== '&' && ch !== '<' &&
         ch !== '\"' && ch !== '\n' && ch !== '\r' && ch !== '\t') {
    i++;
  }
  if (i >= s.length) {
    return s;
  }
  var buf = s.substring(0, i);
  while (i < s.length) {
    ch = s[i++];
    switch (ch) {
      case '&':
        buf += '&amp;';
        break;
      case '<':
        buf += '&lt;';
        break;
      case '\"':
        buf += '&quot;';
        break;
      case '\n':
        buf += '&#xA;';
        break;
      case '\r':
        buf += '&#xD;';
        break;
      case '\t':
        buf += '&#x9;';
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
  this.textContent = '';

  if (name === 'style') {
    this.sheet = {
      cssRules: [],
      insertRule: function (rule) {
        this.cssRules.push(rule);
      },
    };
  }
}

DOMElement.prototype = {

  getAttributeNS: function DOMElement_getAttributeNS(NS, name) {
    // Fast path
    if (name in this.attributes) {
      return this.attributes[name];
    }
    // Slow path - used by test/unit/display_svg_spec.js
    // Assuming that there is only one matching attribute for a given name,
    // across all namespaces.
    if (NS) {
      var suffix = ':' + name;
      for (var fullName in this.attributes) {
        if (fullName.slice(-suffix.length) === suffix) {
          return this.attributes[fullName];
        }
      }
    }
    return null;
  },

  setAttributeNS: function DOMElement_setAttributeNS(NS, name, value) {
    value = value || '';
    value = xmlEncode(value);
    this.attributes[name] = value;
  },

  appendChild: function DOMElement_appendChild(element) {
    var childNodes = this.childNodes;
    if (childNodes.indexOf(element) === -1) {
      childNodes.push(element);
    }
  },

  toString: function DOMElement_toString() {
    var buf = [];
    buf.push('<' + this.nodeName);
    if (this.nodeName === 'svg:svg') {
      buf.push(' xmlns:xlink="http://www.w3.org/1999/xlink"' +
               ' xmlns:svg="http://www.w3.org/2000/svg"');
    }
    for (var i in this.attributes) {
      buf.push(' ' + i + '="' + xmlEncode(this.attributes[i]) + '"');
    }

    buf.push('>');

    if (this.nodeName === 'svg:tspan' || this.nodeName === 'svg:style') {
      buf.push(xmlEncode(this.textContent));
    } else {
      this.childNodes.forEach(function(childNode) {
        buf.push(childNode.toString());
      });
    }
    buf.push('</' + this.nodeName + '>');
    return buf.join('');
  },

  cloneNode: function DOMElement_cloneNode() {
    var newNode = new DOMElement(this.nodeName);
    newNode.childNodes = this.childNodes;
    newNode.attributes = this.attributes;
    newNode.textContent = this.textContent;
    return newNode;
  },
}

const document = {
  childNodes : [],

  get currentScript() {
    return { src: '' };
  },

  get documentElement() {
    return this;
  },

  createElementNS: function (NS, element) {
    var elObject = new DOMElement(element);
    return elObject;
  },

  createElement: function (element) {
    return this.createElementNS('', element);
  },

  getElementsByTagName: function (element) {
    if (element === 'head') {
      return [this.head || (this.head = new DOMElement('head'))];
    }
    return [];
  }
};

function Image () {
  this._src = null;
  this.onload = null;
}
Image.prototype = {
  get src () {
    return this._src;
  },
  set src (value) {
    this._src = value;
    if (this.onload) {
      this.onload();
    }
  }
}

exports.document = document;
exports.Image = Image;

var exported_symbols = Object.keys(exports);

exports.setStubs = function(namespace) {
  exported_symbols.forEach(function(key) {
    console.assert(!(key in namespace), 'property should not be set: ' + key);
    namespace[key] = exports[key];
  });
};
exports.unsetStubs = function(namespace) {
  exported_symbols.forEach(function(key) {
    console.assert(key in namespace, 'property should be set: ' + key);
    delete namespace[key];
  });
};
