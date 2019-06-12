/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2019 Mozilla Foundation
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

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SimpleXMLParser = void 0;

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } return _assertThisInitialized(self); }

function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }

function _get(target, property, receiver) { if (typeof Reflect !== "undefined" && Reflect.get) { _get = Reflect.get; } else { _get = function _get(target, property, receiver) { var base = _superPropBase(target, property); if (!base) return; var desc = Object.getOwnPropertyDescriptor(base, property); if (desc.get) { return desc.get.call(receiver); } return desc.value; }; } return _get(target, property, receiver || target); }

function _superPropBase(object, property) { while (!Object.prototype.hasOwnProperty.call(object, property)) { object = _getPrototypeOf(object); if (object === null) break; } return object; }

function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); if (superClass) _setPrototypeOf(subClass, superClass); }

function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var XMLParserErrorCode = {
  NoError: 0,
  EndOfDocument: -1,
  UnterminatedCdat: -2,
  UnterminatedXmlDeclaration: -3,
  UnterminatedDoctypeDeclaration: -4,
  UnterminatedComment: -5,
  MalformedElement: -6,
  OutOfMemory: -7,
  UnterminatedAttributeValue: -8,
  UnterminatedElement: -9,
  ElementNeverBegun: -10
};

function isWhitespace(s, index) {
  var ch = s[index];
  return ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t';
}

function isWhitespaceString(s) {
  for (var i = 0, ii = s.length; i < ii; i++) {
    if (!isWhitespace(s, i)) {
      return false;
    }
  }

  return true;
}

var XMLParserBase =
/*#__PURE__*/
function () {
  function XMLParserBase() {
    _classCallCheck(this, XMLParserBase);
  }

  _createClass(XMLParserBase, [{
    key: "_resolveEntities",
    value: function _resolveEntities(s) {
      var _this = this;

      return s.replace(/&([^;]+);/g, function (all, entity) {
        if (entity.substring(0, 2) === '#x') {
          return String.fromCharCode(parseInt(entity.substring(2), 16));
        } else if (entity.substring(0, 1) === '#') {
          return String.fromCharCode(parseInt(entity.substring(1), 10));
        }

        switch (entity) {
          case 'lt':
            return '<';

          case 'gt':
            return '>';

          case 'amp':
            return '&';

          case 'quot':
            return '\"';
        }

        return _this.onResolveEntity(entity);
      });
    }
  }, {
    key: "_parseContent",
    value: function _parseContent(s, start) {
      var pos = start,
          name,
          attributes = [];

      function skipWs() {
        while (pos < s.length && isWhitespace(s, pos)) {
          ++pos;
        }
      }

      while (pos < s.length && !isWhitespace(s, pos) && s[pos] !== '>' && s[pos] !== '/') {
        ++pos;
      }

      name = s.substring(start, pos);
      skipWs();

      while (pos < s.length && s[pos] !== '>' && s[pos] !== '/' && s[pos] !== '?') {
        skipWs();
        var attrName = '',
            attrValue = '';

        while (pos < s.length && !isWhitespace(s, pos) && s[pos] !== '=') {
          attrName += s[pos];
          ++pos;
        }

        skipWs();

        if (s[pos] !== '=') {
          return null;
        }

        ++pos;
        skipWs();
        var attrEndChar = s[pos];

        if (attrEndChar !== '\"' && attrEndChar !== '\'') {
          return null;
        }

        var attrEndIndex = s.indexOf(attrEndChar, ++pos);

        if (attrEndIndex < 0) {
          return null;
        }

        attrValue = s.substring(pos, attrEndIndex);
        attributes.push({
          name: attrName,
          value: this._resolveEntities(attrValue)
        });
        pos = attrEndIndex + 1;
        skipWs();
      }

      return {
        name: name,
        attributes: attributes,
        parsed: pos - start
      };
    }
  }, {
    key: "_parseProcessingInstruction",
    value: function _parseProcessingInstruction(s, start) {
      var pos = start,
          name,
          value;

      function skipWs() {
        while (pos < s.length && isWhitespace(s, pos)) {
          ++pos;
        }
      }

      while (pos < s.length && !isWhitespace(s, pos) && s[pos] !== '>' && s[pos] !== '/') {
        ++pos;
      }

      name = s.substring(start, pos);
      skipWs();
      var attrStart = pos;

      while (pos < s.length && (s[pos] !== '?' || s[pos + 1] !== '>')) {
        ++pos;
      }

      value = s.substring(attrStart, pos);
      return {
        name: name,
        value: value,
        parsed: pos - start
      };
    }
  }, {
    key: "parseXml",
    value: function parseXml(s) {
      var i = 0;

      while (i < s.length) {
        var ch = s[i];
        var j = i;

        if (ch === '<') {
          ++j;
          var ch2 = s[j];
          var q = void 0;

          switch (ch2) {
            case '/':
              ++j;
              q = s.indexOf('>', j);

              if (q < 0) {
                this.onError(XMLParserErrorCode.UnterminatedElement);
                return;
              }

              this.onEndElement(s.substring(j, q));
              j = q + 1;
              break;

            case '?':
              ++j;

              var pi = this._parseProcessingInstruction(s, j);

              if (s.substring(j + pi.parsed, j + pi.parsed + 2) !== '?>') {
                this.onError(XMLParserErrorCode.UnterminatedXmlDeclaration);
                return;
              }

              this.onPi(pi.name, pi.value);
              j += pi.parsed + 2;
              break;

            case '!':
              if (s.substring(j + 1, j + 3) === '--') {
                q = s.indexOf('-->', j + 3);

                if (q < 0) {
                  this.onError(XMLParserErrorCode.UnterminatedComment);
                  return;
                }

                this.onComment(s.substring(j + 3, q));
                j = q + 3;
              } else if (s.substring(j + 1, j + 8) === '[CDATA[') {
                q = s.indexOf(']]>', j + 8);

                if (q < 0) {
                  this.onError(XMLParserErrorCode.UnterminatedCdat);
                  return;
                }

                this.onCdata(s.substring(j + 8, q));
                j = q + 3;
              } else if (s.substring(j + 1, j + 8) === 'DOCTYPE') {
                var q2 = s.indexOf('[', j + 8);
                var complexDoctype = false;
                q = s.indexOf('>', j + 8);

                if (q < 0) {
                  this.onError(XMLParserErrorCode.UnterminatedDoctypeDeclaration);
                  return;
                }

                if (q2 > 0 && q > q2) {
                  q = s.indexOf(']>', j + 8);

                  if (q < 0) {
                    this.onError(XMLParserErrorCode.UnterminatedDoctypeDeclaration);
                    return;
                  }

                  complexDoctype = true;
                }

                var doctypeContent = s.substring(j + 8, q + (complexDoctype ? 1 : 0));
                this.onDoctype(doctypeContent);
                j = q + (complexDoctype ? 2 : 1);
              } else {
                this.onError(XMLParserErrorCode.MalformedElement);
                return;
              }

              break;

            default:
              var content = this._parseContent(s, j);

              if (content === null) {
                this.onError(XMLParserErrorCode.MalformedElement);
                return;
              }

              var isClosed = false;

              if (s.substring(j + content.parsed, j + content.parsed + 2) === '/>') {
                isClosed = true;
              } else if (s.substring(j + content.parsed, j + content.parsed + 1) !== '>') {
                this.onError(XMLParserErrorCode.UnterminatedElement);
                return;
              }

              this.onBeginElement(content.name, content.attributes, isClosed);
              j += content.parsed + (isClosed ? 2 : 1);
              break;
          }
        } else {
          while (j < s.length && s[j] !== '<') {
            j++;
          }

          var text = s.substring(i, j);
          this.onText(this._resolveEntities(text));
        }

        i = j;
      }
    }
  }, {
    key: "onResolveEntity",
    value: function onResolveEntity(name) {
      return "&".concat(name, ";");
    }
  }, {
    key: "onPi",
    value: function onPi(name, value) {}
  }, {
    key: "onComment",
    value: function onComment(text) {}
  }, {
    key: "onCdata",
    value: function onCdata(text) {}
  }, {
    key: "onDoctype",
    value: function onDoctype(doctypeContent) {}
  }, {
    key: "onText",
    value: function onText(text) {}
  }, {
    key: "onBeginElement",
    value: function onBeginElement(name, attributes, isEmpty) {}
  }, {
    key: "onEndElement",
    value: function onEndElement(name) {}
  }, {
    key: "onError",
    value: function onError(code) {}
  }]);

  return XMLParserBase;
}();

var SimpleDOMNode =
/*#__PURE__*/
function () {
  function SimpleDOMNode(nodeName, nodeValue) {
    _classCallCheck(this, SimpleDOMNode);

    this.nodeName = nodeName;
    this.nodeValue = nodeValue;
    Object.defineProperty(this, 'parentNode', {
      value: null,
      writable: true
    });
  }

  _createClass(SimpleDOMNode, [{
    key: "hasChildNodes",
    value: function hasChildNodes() {
      return this.childNodes && this.childNodes.length > 0;
    }
  }, {
    key: "firstChild",
    get: function get() {
      return this.childNodes && this.childNodes[0];
    }
  }, {
    key: "nextSibling",
    get: function get() {
      var childNodes = this.parentNode.childNodes;

      if (!childNodes) {
        return undefined;
      }

      var index = childNodes.indexOf(this);

      if (index === -1) {
        return undefined;
      }

      return childNodes[index + 1];
    }
  }, {
    key: "textContent",
    get: function get() {
      if (!this.childNodes) {
        return this.nodeValue || '';
      }

      return this.childNodes.map(function (child) {
        return child.textContent;
      }).join('');
    }
  }]);

  return SimpleDOMNode;
}();

var SimpleXMLParser =
/*#__PURE__*/
function (_XMLParserBase) {
  _inherits(SimpleXMLParser, _XMLParserBase);

  function SimpleXMLParser() {
    var _this2;

    _classCallCheck(this, SimpleXMLParser);

    _this2 = _possibleConstructorReturn(this, _getPrototypeOf(SimpleXMLParser).call(this));
    _this2._currentFragment = null;
    _this2._stack = null;
    _this2._errorCode = XMLParserErrorCode.NoError;
    return _this2;
  }

  _createClass(SimpleXMLParser, [{
    key: "parseFromString",
    value: function parseFromString(data) {
      this._currentFragment = [];
      this._stack = [];
      this._errorCode = XMLParserErrorCode.NoError;
      this.parseXml(data);

      if (this._errorCode !== XMLParserErrorCode.NoError) {
        return undefined;
      }

      var _this$_currentFragmen = _slicedToArray(this._currentFragment, 1),
          documentElement = _this$_currentFragmen[0];

      if (!documentElement) {
        return undefined;
      }

      return {
        documentElement: documentElement
      };
    }
  }, {
    key: "onResolveEntity",
    value: function onResolveEntity(name) {
      switch (name) {
        case 'apos':
          return '\'';
      }

      return _get(_getPrototypeOf(SimpleXMLParser.prototype), "onResolveEntity", this).call(this, name);
    }
  }, {
    key: "onText",
    value: function onText(text) {
      if (isWhitespaceString(text)) {
        return;
      }

      var node = new SimpleDOMNode('#text', text);

      this._currentFragment.push(node);
    }
  }, {
    key: "onCdata",
    value: function onCdata(text) {
      var node = new SimpleDOMNode('#text', text);

      this._currentFragment.push(node);
    }
  }, {
    key: "onBeginElement",
    value: function onBeginElement(name, attributes, isEmpty) {
      var node = new SimpleDOMNode(name);
      node.childNodes = [];

      this._currentFragment.push(node);

      if (isEmpty) {
        return;
      }

      this._stack.push(this._currentFragment);

      this._currentFragment = node.childNodes;
    }
  }, {
    key: "onEndElement",
    value: function onEndElement(name) {
      this._currentFragment = this._stack.pop() || [];
      var lastElement = this._currentFragment[this._currentFragment.length - 1];

      if (!lastElement) {
        return;
      }

      for (var i = 0, ii = lastElement.childNodes.length; i < ii; i++) {
        lastElement.childNodes[i].parentNode = lastElement;
      }
    }
  }, {
    key: "onError",
    value: function onError(code) {
      this._errorCode = code;
    }
  }]);

  return SimpleXMLParser;
}(XMLParserBase);

exports.SimpleXMLParser = SimpleXMLParser;