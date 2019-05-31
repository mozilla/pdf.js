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

const globalScope = require('./global_scope');

// Skip compatibility checks for the extensions and if we already ran
// this module.
if ((typeof PDFJSDev === 'undefined' ||
     !PDFJSDev.test('FIREFOX || MOZCENTRAL')) &&
    !globalScope._pdfjsCompatibilityChecked) {

globalScope._pdfjsCompatibilityChecked = true;

// In the Chrome extension, most of the polyfills are unnecessary.
// We support down to Chrome 49, because it's still commonly used by Windows XP
// users - https://github.com/mozilla/pdf.js/issues/9397
if (typeof PDFJSDev === 'undefined' || !PDFJSDev.test('CHROME')) {

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

// Provides document.currentScript support
// Support: IE, Chrome<29.
(function checkCurrentScript() {
  if (!hasDOM) {
    return;
  }
  if ('currentScript' in document) {
    return;
  }
  Object.defineProperty(document, 'currentScript', {
    get() {
      var scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    },
    enumerable: true,
    configurable: true,
  });
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
  const originalDOMTokenListToggle = DOMTokenList.prototype.toggle;

  DOMTokenList.prototype.toggle = function(token) {
    if (arguments.length > 1) {
      const force = !!arguments[1];
      return (this[force ? 'add' : 'remove'](token), force);
    }
    return originalDOMTokenListToggle(token);
  };
})();

// Provides support for String.prototype.includes in legacy browsers.
// Support: IE, Chrome<41
(function checkStringIncludes() {
  if (String.prototype.includes) {
    return;
  }
  require('core-js/fn/string/includes');
})();

// Provides support for Array.prototype.includes in legacy browsers.
// Support: IE, Chrome<47
(function checkArrayIncludes() {
  if (Array.prototype.includes) {
    return;
  }
  require('core-js/fn/array/includes');
})();

// Provides support for Object.assign in legacy browsers.
// Support: IE
(function checkObjectAssign() {
  if (Object.assign) {
    return;
  }
  require('core-js/fn/object/assign');
})();

// Provides support for Math.log2 in legacy browsers.
// Support: IE, Chrome<38
(function checkMathLog2() {
  if (Math.log2) {
    return;
  }
  Math.log2 = require('core-js/fn/math/log2');
})();

// Provides support for Number.isNaN in legacy browsers.
// Support: IE.
(function checkNumberIsNaN() {
  if (Number.isNaN) {
    return;
  }
  Number.isNaN = require('core-js/fn/number/is-nan');
})();

// Provides support for Number.isInteger in legacy browsers.
// Support: IE, Chrome<34
(function checkNumberIsInteger() {
  if (Number.isInteger) {
    return;
  }
  Number.isInteger = require('core-js/fn/number/is-integer');
})();

// Support: IE, Safari<8, Chrome<32
(function checkPromise() {
  if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('IMAGE_DECODERS')) {
    // The current image decoders are synchronous, hence `Promise` shouldn't
    // need to be polyfilled for the IMAGE_DECODERS build target.
    return;
  }
  if (globalScope.Promise) {
    return;
  }
  globalScope.Promise = require('core-js/fn/promise');
})();

// Support: IE<11, Safari<8, Chrome<36
(function checkWeakMap() {
  if (globalScope.WeakMap) {
    return;
  }
  globalScope.WeakMap = require('core-js/fn/weak-map');
})();

// Provides support for String.codePointAt in legacy browsers.
// Support: IE11.
(function checkStringCodePointAt() {
  if (String.codePointAt) {
    return;
  }
  String.codePointAt = require('core-js/fn/string/code-point-at');
})();

// Provides support for String.fromCodePoint in legacy browsers.
// Support: IE11.
(function checkStringFromCodePoint() {
  if (String.fromCodePoint) {
    return;
  }
  String.fromCodePoint = require('core-js/fn/string/from-code-point');
})();

// Support: IE
(function checkSymbol() {
  if (globalScope.Symbol) {
    return;
  }
  require('core-js/es6/symbol');
})();

} // End of !PDFJSDev.test('CHROME')

// Provides support for Object.values in legacy browsers.
// Support: IE, Chrome<54
(function checkObjectValues() {
  if (Object.values) {
    return;
  }
  Object.values = require('core-js/fn/object/values');
})();

}
