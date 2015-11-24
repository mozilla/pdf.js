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

global.btoa = function btoa(chars) {
  var digits =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  var buffer = '';
    var i, n;
    for (i = 0, n = chars.length; i < n; i += 3) {
      var b1 = chars.charCodeAt(i) & 0xFF;
      var b2 = chars.charCodeAt(i + 1) & 0xFF;
      var b3 = chars.charCodeAt(i + 2) & 0xFF;
      var d1 = b1 >> 2, d2 = ((b1 & 3) << 4) | (b2 >> 4);
      var d3 = i + 1 < n ? ((b2 & 0xF) << 2) | (b3 >> 6) : 64;
      var d4 = i + 2 < n ? (b3 & 0x3F) : 64;
      buffer += (digits.charAt(d1) + digits.charAt(d2) +
      digits.charAt(d3) + digits.charAt(d4));
    }
  return buffer;
};

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
    var attrList = [];
    for (i in this.attributes) {
      attrList.push(i + '="' + xmlEncode(this.attributes[i]) + '"');
    }

    if (this.nodeName === 'svg:tspan' || this.nodeName === 'svg:style') {
      var encText = xmlEncode(this.textContent);
      return '<' + this.nodeName + ' ' + attrList.join(' ') + '>' +
             encText + '</' + this.nodeName + '>';
    } else if (this.nodeName === 'svg:svg') {
      var ns = 'xmlns:xlink="http://www.w3.org/1999/xlink" ' +
               'xmlns:svg="http://www.w3.org/2000/svg"'
      return '<' + this.nodeName + ' ' + ns + ' ' + attrList.join(' ') + '>' +
             this.childNodes.join('') + '</' + this.nodeName + '>';
    } else {
      return '<' + this.nodeName + ' ' + attrList.join(' ') + '>' +
             this.childNodes.join('') + '</' + this.nodeName + '>';
    }
  },

  cloneNode: function DOMElement_cloneNode() {
    var newNode = new DOMElement(this.nodeName);
    newNode.childNodes = this.childNodes;
    newNode.attributes = this.attributes;
    newNode.textContent = this.textContent;
    return newNode;
  },
}

global.document = {
  childNodes : [],

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
