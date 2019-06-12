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

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

var globalScope = require('./global_scope');

if (!globalScope._pdfjsCompatibilityChecked) {
  globalScope._pdfjsCompatibilityChecked = true;

  var isNodeJS = require('./is_node');

  var hasDOM = (typeof window === "undefined" ? "undefined" : _typeof(window)) === 'object' && (typeof document === "undefined" ? "undefined" : _typeof(document)) === 'object';

  (function checkNodeBtoa() {
    if (globalScope.btoa || !isNodeJS()) {
      return;
    }

    globalScope.btoa = function (chars) {
      return Buffer.from(chars, 'binary').toString('base64');
    };
  })();

  (function checkNodeAtob() {
    if (globalScope.atob || !isNodeJS()) {
      return;
    }

    globalScope.atob = function (input) {
      return Buffer.from(input, 'base64').toString('binary');
    };
  })();

  (function checkChildNodeRemove() {
    if (!hasDOM) {
      return;
    }

    if (typeof Element.prototype.remove !== 'undefined') {
      return;
    }

    Element.prototype.remove = function () {
      if (this.parentNode) {
        this.parentNode.removeChild(this);
      }
    };
  })();

  (function checkDOMTokenListAddRemove() {
    if (!hasDOM || isNodeJS()) {
      return;
    }

    var div = document.createElement('div');
    div.classList.add('testOne', 'testTwo');

    if (div.classList.contains('testOne') === true && div.classList.contains('testTwo') === true) {
      return;
    }

    var OriginalDOMTokenListAdd = DOMTokenList.prototype.add;
    var OriginalDOMTokenListRemove = DOMTokenList.prototype.remove;

    DOMTokenList.prototype.add = function () {
      for (var _len = arguments.length, tokens = new Array(_len), _key = 0; _key < _len; _key++) {
        tokens[_key] = arguments[_key];
      }

      for (var _i = 0, _tokens = tokens; _i < _tokens.length; _i++) {
        var token = _tokens[_i];
        OriginalDOMTokenListAdd.call(this, token);
      }
    };

    DOMTokenList.prototype.remove = function () {
      for (var _len2 = arguments.length, tokens = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        tokens[_key2] = arguments[_key2];
      }

      for (var _i2 = 0, _tokens2 = tokens; _i2 < _tokens2.length; _i2++) {
        var token = _tokens2[_i2];
        OriginalDOMTokenListRemove.call(this, token);
      }
    };
  })();

  (function checkDOMTokenListToggle() {
    if (!hasDOM || isNodeJS()) {
      return;
    }

    var div = document.createElement('div');

    if (div.classList.toggle('test', 0) === false) {
      return;
    }

    DOMTokenList.prototype.toggle = function (token) {
      var force = arguments.length > 1 ? !!arguments[1] : !this.contains(token);
      return this[force ? 'add' : 'remove'](token), force;
    };
  })();

  (function checkStringStartsWith() {
    if (String.prototype.startsWith) {
      return;
    }

    require('core-js/fn/string/starts-with');
  })();

  (function checkStringEndsWith() {
    if (String.prototype.endsWith) {
      return;
    }

    require('core-js/fn/string/ends-with');
  })();

  (function checkStringIncludes() {
    if (String.prototype.includes) {
      return;
    }

    require('core-js/fn/string/includes');
  })();

  (function checkArrayIncludes() {
    if (Array.prototype.includes) {
      return;
    }

    require('core-js/fn/array/includes');
  })();

  (function checkArrayFrom() {
    if (Array.from) {
      return;
    }

    require('core-js/fn/array/from');
  })();

  (function checkObjectAssign() {
    if (Object.assign) {
      return;
    }

    require('core-js/fn/object/assign');
  })();

  (function checkMathLog2() {
    if (Math.log2) {
      return;
    }

    Math.log2 = require('core-js/fn/math/log2');
  })();

  (function checkNumberIsNaN() {
    if (Number.isNaN) {
      return;
    }

    Number.isNaN = require('core-js/fn/number/is-nan');
  })();

  (function checkNumberIsInteger() {
    if (Number.isInteger) {
      return;
    }

    Number.isInteger = require('core-js/fn/number/is-integer');
  })();

  (function checkPromise() {
    if (globalScope.Promise && globalScope.Promise.prototype && globalScope.Promise.prototype["finally"]) {
      return;
    }

    globalScope.Promise = require('core-js/fn/promise');
  })();

  (function checkWeakMap() {
    if (globalScope.WeakMap) {
      return;
    }

    globalScope.WeakMap = require('core-js/fn/weak-map');
  })();

  (function checkWeakSet() {
    if (globalScope.WeakSet) {
      return;
    }

    globalScope.WeakSet = require('core-js/fn/weak-set');
  })();

  (function checkStringCodePointAt() {
    if (String.codePointAt) {
      return;
    }

    String.codePointAt = require('core-js/fn/string/code-point-at');
  })();

  (function checkStringFromCodePoint() {
    if (String.fromCodePoint) {
      return;
    }

    String.fromCodePoint = require('core-js/fn/string/from-code-point');
  })();

  (function checkSymbol() {
    if (globalScope.Symbol) {
      return;
    }

    require('core-js/es6/symbol');
  })();

  (function checkStringPadStart() {
    if (String.prototype.padStart) {
      return;
    }

    require('core-js/fn/string/pad-start');
  })();

  (function checkStringPadEnd() {
    if (String.prototype.padEnd) {
      return;
    }

    require('core-js/fn/string/pad-end');
  })();

  (function checkObjectValues() {
    if (Object.values) {
      return;
    }

    Object.values = require('core-js/fn/object/values');
  })();
}