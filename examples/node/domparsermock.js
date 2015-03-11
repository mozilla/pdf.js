/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Dummy XML Parser

function DOMNodeMock(nodeName, nodeValue) {
  this.nodeName = nodeName;
  this.nodeValue = nodeValue;
  Object.defineProperty(this, 'parentNode', {value: null, writable: true});
}
DOMNodeMock.prototype = {
  get firstChild() {
    return this.childNodes[0];
  },
  get nextSibling() {
    var index = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[index + 1];
  },
  get textContent() {
    if (!this.childNodes) {
      return this.nodeValue || '';
    }
    return this.childNodes.map(function (child) {
      return child.textContent;
    }).join('');
  },
  hasChildNodes: function () {
    return this.childNodes && this.childNodes.length > 0;
  }
};

function decodeXML(text) {
  if (text.indexOf('&') < 0) {
    return text;
  }
  return text.replace(/&(#(x[0-9a-f]+|\d+)|\w+);/gi, function (all, entityName, number) {
    if (number) {
      return String.fromCharCode(number[0] === 'x' ? parseInt(number.substring(1), 16) : +number);
    }
    switch (entityName) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '\"';
      case 'apos':
        return '\'';
    }
    return '&' + entityName + ';';
  });
}

function DOMParserMock() {};
DOMParserMock.prototype = {
  parseFromString: function (content) {
    content = content.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g, '').trim();
    var nodes = [];
    content = content.replace(/>([\s\S]+?)</g, function (all, text) {
      var i = nodes.length;
      var node = new DOMNodeMock('#text', decodeXML(text));
      nodes.push(node);
      if (node.textContent.trim().length === 0) {
        return '><'; // ignoring whitespaces
      }
      return '>' + i + ',<';
    });
    content = content.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, function (all, text) {
      var i = nodes.length;
      var node = new DOMNodeMock('#text', text);
      nodes.push(node);
      return i + ',';
    });
    var lastLength;
    do {
      lastLength = nodes.length;
      content = content.replace(/<([\w\:]+)((?:[\s\w:=]|'[^']*'|"[^"]*")*)(?:\/>|>([\d,]*)<\/[^>]+>)/g,
        function (all, name, attrs, content) {
        var i = nodes.length;
        var node = new DOMNodeMock(name);
        var children = [];
        if (content) {
          content = content.split(',');
          content.pop();
          content.forEach(function (child) {
            var childNode = nodes[+child];
            childNode.parentNode = node;
            children.push(childNode);
          })
        }
        node.childNodes = children;
        nodes.push(node);
        return i + ',';

      });
    } while(lastLength < nodes.length);
    return {
      documentElement: nodes.pop()
    };
  }
};

exports.DOMParserMock = DOMParserMock;
