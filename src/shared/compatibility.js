/* Copyright 2017 Mozilla Foundation
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
/* eslint no-var: error */

const globalScope = require('./global_scope');

// Skip compatibility checks for modern builds and if we already ran the module.
if ((typeof PDFJSDev === 'undefined' || !PDFJSDev.test('SKIP_BABEL')) &&
    !globalScope._pdfjsCompatibilityChecked) {

globalScope._pdfjsCompatibilityChecked = true;

const isNodeJS = require('./is_node');

const hasDOM = typeof window === 'object' && typeof document === 'object';

// Support: Node.js
(function checkNodeBtoa() {
  if (globalScope.btoa || !isNodeJS()) {
    return;
  }
  globalScope.btoa = function(chars) {
    // eslint-disable-next-line no-undef
    return Buffer.from(chars, 'binary').toString('base64');
  };
})();

// Support: Node.js
(function checkNodeAtob() {
  if (globalScope.atob || !isNodeJS()) {
    return;
  }
  globalScope.atob = function(input) {
    // eslint-disable-next-line no-undef
    return Buffer.from(input, 'base64').toString('binary');
  };
})();

// Provides support for ChildNode.remove in legacy browsers.
// Support: IE.
(function checkChildNodeRemove() {
  if (!hasDOM) {
    return;
  }
  if (typeof Element.prototype.remove !== 'undefined') {
    return;
  }
  Element.prototype.remove = function () {
    if (this.parentNode) {
      // eslint-disable-next-line mozilla/avoid-removeChild
      this.parentNode.removeChild(this);
    }
  };
})();

// Provides support for DOMTokenList.prototype.{add, remove}, with more than
// one parameter, in legacy browsers.
// Support: IE
(function checkDOMTokenListAddRemove() {
  if (!hasDOM || isNodeJS()) {
    return;
  }
  const div = document.createElement('div');
  div.classList.add('testOne', 'testTwo');

  if (div.classList.contains('testOne') === true &&
      div.classList.contains('testTwo') === true) {
    return;
  }
  const OriginalDOMTokenListAdd = DOMTokenList.prototype.add;
  const OriginalDOMTokenListRemove = DOMTokenList.prototype.remove;

  DOMTokenList.prototype.add = function(...tokens) {
    for (let token of tokens) {
      OriginalDOMTokenListAdd.call(this, token);
    }
  };
  DOMTokenList.prototype.remove = function(...tokens) {
    for (let token of tokens) {
      OriginalDOMTokenListRemove.call(this, token);
    }
  };
})();

// Provides support for DOMTokenList.prototype.toggle, with the optional
// "force" parameter, in legacy browsers.
// Support: IE
(function checkDOMTokenListToggle() {
  if (!hasDOM || isNodeJS()) {
    return;
  }
  const div = document.createElement('div');
  if (div.classList.toggle('test', 0) === false) {
    return;
  }

  DOMTokenList.prototype.toggle = function(token) {
    let force = (arguments.length > 1 ? !!arguments[1] : !this.contains(token));
    return (this[force ? 'add' : 'remove'](token), force);
  };
})();

// Provides support for String.prototype.startsWith in legacy browsers.
// Support: IE, Chrome<41
(function checkStringStartsWith() {
  if (String.prototype.startsWith) {
    return;
  }
  require('core-js/es/string/starts-with');
})();

// Provides support for String.prototype.endsWith in legacy browsers.
// Support: IE, Chrome<41
(function checkStringEndsWith() {
  if (String.prototype.endsWith) {
    return;
  }
  require('core-js/es/string/ends-with');
})();

// Provides support for String.prototype.includes in legacy browsers.
// Support: IE, Chrome<41
(function checkStringIncludes() {
  if (String.prototype.includes) {
    return;
  }
  require('core-js/es/string/includes');
})();

// Provides support for Array.prototype.includes in legacy browsers.
// Support: IE, Chrome<47
(function checkArrayIncludes() {
  if (Array.prototype.includes) {
    return;
  }
  require('core-js/es/array/includes');
})();

// Provides support for Array.from in legacy browsers.
// Support: IE
(function checkArrayFrom() {
  if (Array.from) {
    return;
  }
  require('core-js/es/array/from');
})();

// Provides support for Object.assign in legacy browsers.
// Support: IE
(function checkObjectAssign() {
  if (Object.assign) {
    return;
  }
  require('core-js/es/object/assign');
})();

// Provides support for Math.log2 in legacy browsers.
// Support: IE, Chrome<38
(function checkMathLog2() {
  if (Math.log2) {
    return;
  }
  Math.log2 = require('core-js/es/math/log2');
})();

// Provides support for Number.isNaN in legacy browsers.
// Support: IE.
(function checkNumberIsNaN() {
  if (Number.isNaN) {
    return;
  }
  Number.isNaN = require('core-js/es/number/is-nan');
})();

// Provides support for Number.isInteger in legacy browsers.
// Support: IE, Chrome<34
(function checkNumberIsInteger() {
  if (Number.isInteger) {
    return;
  }
  Number.isInteger = require('core-js/es/number/is-integer');
})();

// Support: IE, Safari<11, Chrome<63
(function checkPromise() {
  if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('IMAGE_DECODERS')) {
    // The current image decoders are synchronous, hence `Promise` shouldn't
    // need to be polyfilled for the IMAGE_DECODERS build target.
    return;
  }
  if (globalScope.Promise && (globalScope.Promise.prototype &&
                              globalScope.Promise.prototype.finally)) {
    return;
  }
  globalScope.Promise = require('core-js/es/promise/index');
})();

// Support: IE
(function checkURL() {
  if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('IMAGE_DECODERS')) {
    // The current image decoders don't use the `URL` constructor, so it
    // doesn't need to be polyfilled for the IMAGE_DECODERS build target.
    return;
  }
  if (typeof PDFJSDev !== 'undefined' && !PDFJSDev.test('GENERIC')) {
    // The `URL` constructor is assumed to be available in the extension builds.
    return;
  }
  globalScope.URL = require('core-js/web/url');
})();

// Support: IE<11, Safari<8, Chrome<36
(function checkWeakMap() {
  if (globalScope.WeakMap) {
    return;
  }
  globalScope.WeakMap = require('core-js/es/weak-map/index');
})();

// Support: IE11
(function checkWeakSet() {
  if (globalScope.WeakSet) {
    return;
  }
  globalScope.WeakSet = require('core-js/es/weak-set/index');
})();

// Provides support for String.codePointAt in legacy browsers.
// Support: IE11.
(function checkStringCodePointAt() {
  if (String.prototype.codePointAt) {
    return;
  }
  require('core-js/es/string/code-point-at');
})();

// Provides support for String.fromCodePoint in legacy browsers.
// Support: IE11.
(function checkStringFromCodePoint() {
  if (String.fromCodePoint) {
    return;
  }
  String.fromCodePoint = require('core-js/es/string/from-code-point');
})();

// Support: IE
(function checkSymbol() {
  if (globalScope.Symbol) {
    return;
  }
  require('core-js/es/symbol/index');
})();

// Provides support for String.prototype.padStart in legacy browsers.
// Support: IE, Chrome<57
(function checkStringPadStart() {
  if (String.prototype.padStart) {
    return;
  }
  require('core-js/es/string/pad-start');
})();

// Provides support for String.prototype.padEnd in legacy browsers.
// Support: IE, Chrome<57
(function checkStringPadEnd() {
  if (String.prototype.padEnd) {
    return;
  }
  require('core-js/es/string/pad-end');
})();

// Provides support for Object.values in legacy browsers.
// Support: IE, Chrome<54
(function checkObjectValues() {
  if (Object.values) {
    return;
  }
  Object.values = require('core-js/es/object/values');
})();

}
