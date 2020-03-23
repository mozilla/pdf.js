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

// Skip compatibility checks for modern builds (unless we're running the
// unit-tests in Node.js/Travis) and if we already ran the module.
if (
  (typeof PDFJSDev === "undefined" ||
    PDFJSDev.test("!SKIP_BABEL || (LIB && TESTING)")) &&
  (typeof globalThis === "undefined" || !globalThis._pdfjsCompatibilityChecked)
) {
  // Provides support for globalThis in legacy browsers.
  // Support: IE11/Edge, Opera
  if (typeof globalThis === "undefined" || globalThis.Math !== Math) {
    // eslint-disable-next-line no-global-assign
    globalThis = require("core-js/es/global-this");
  }
  globalThis._pdfjsCompatibilityChecked = true;

  const { isNodeJS } = require("./is_node.js");

  const hasDOM = typeof window === "object" && typeof document === "object";
  const userAgent =
    (typeof navigator !== "undefined" && navigator.userAgent) || "";
  const isIE = /Trident/.test(userAgent);

  // Support: Node.js
  (function checkNodeBtoa() {
    if (globalThis.btoa || !isNodeJS) {
      return;
    }
    globalThis.btoa = function(chars) {
      // eslint-disable-next-line no-undef
      return Buffer.from(chars, "binary").toString("base64");
    };
  })();

  // Support: Node.js
  (function checkNodeAtob() {
    if (globalThis.atob || !isNodeJS) {
      return;
    }
    globalThis.atob = function(input) {
      // eslint-disable-next-line no-undef
      return Buffer.from(input, "base64").toString("binary");
    };
  })();

  // Provides support for ChildNode.remove in legacy browsers.
  // Support: IE.
  (function checkChildNodeRemove() {
    if (!hasDOM) {
      return;
    }
    if (typeof Element.prototype.remove !== "undefined") {
      return;
    }
    Element.prototype.remove = function() {
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
    if (!hasDOM || isNodeJS) {
      return;
    }
    const div = document.createElement("div");
    div.classList.add("testOne", "testTwo");

    if (
      div.classList.contains("testOne") === true &&
      div.classList.contains("testTwo") === true
    ) {
      return;
    }
    const OriginalDOMTokenListAdd = DOMTokenList.prototype.add;
    const OriginalDOMTokenListRemove = DOMTokenList.prototype.remove;

    DOMTokenList.prototype.add = function(...tokens) {
      for (const token of tokens) {
        OriginalDOMTokenListAdd.call(this, token);
      }
    };
    DOMTokenList.prototype.remove = function(...tokens) {
      for (const token of tokens) {
        OriginalDOMTokenListRemove.call(this, token);
      }
    };
  })();

  // Provides support for DOMTokenList.prototype.toggle, with the optional
  // "force" parameter, in legacy browsers.
  // Support: IE
  (function checkDOMTokenListToggle() {
    if (!hasDOM || isNodeJS) {
      return;
    }
    const div = document.createElement("div");
    if (div.classList.toggle("test", 0) === false) {
      return;
    }

    DOMTokenList.prototype.toggle = function(token) {
      const force =
        arguments.length > 1 ? !!arguments[1] : !this.contains(token);
      return this[force ? "add" : "remove"](token), force;
    };
  })();

  // Provides support for window.history.{pushState, replaceState}, with the
  // `url` parameter set to `undefined`, without breaking the document URL.
  // Support: IE
  (function checkWindowHistoryPushStateReplaceState() {
    if (!hasDOM || !isIE) {
      return;
    }
    const OriginalPushState = window.history.pushState;
    const OriginalReplaceState = window.history.replaceState;

    window.history.pushState = function(state, title, url) {
      const args = url === undefined ? [state, title] : [state, title, url];
      OriginalPushState.apply(this, args);
    };
    window.history.replaceState = function(state, title, url) {
      const args = url === undefined ? [state, title] : [state, title, url];
      OriginalReplaceState.apply(this, args);
    };
  })();

  // Provides support for String.prototype.startsWith in legacy browsers.
  // Support: IE, Chrome<41
  (function checkStringStartsWith() {
    if (String.prototype.startsWith) {
      return;
    }
    require("core-js/es/string/starts-with.js");
  })();

  // Provides support for String.prototype.endsWith in legacy browsers.
  // Support: IE, Chrome<41
  (function checkStringEndsWith() {
    if (String.prototype.endsWith) {
      return;
    }
    require("core-js/es/string/ends-with.js");
  })();

  // Provides support for String.prototype.includes in legacy browsers.
  // Support: IE, Chrome<41
  (function checkStringIncludes() {
    if (String.prototype.includes) {
      return;
    }
    require("core-js/es/string/includes.js");
  })();

  // Provides support for Array.prototype.includes in legacy browsers.
  // Support: IE, Chrome<47
  (function checkArrayIncludes() {
    if (Array.prototype.includes) {
      return;
    }
    require("core-js/es/array/includes.js");
  })();

  // Provides support for Array.from in legacy browsers.
  // Support: IE
  (function checkArrayFrom() {
    if (Array.from) {
      return;
    }
    require("core-js/es/array/from.js");
  })();

  // Provides support for Object.assign in legacy browsers.
  // Support: IE
  (function checkObjectAssign() {
    if (Object.assign) {
      return;
    }
    require("core-js/es/object/assign.js");
  })();

  // Provides support for Math.log2 in legacy browsers.
  // Support: IE, Chrome<38
  (function checkMathLog2() {
    if (Math.log2) {
      return;
    }
    Math.log2 = require("core-js/es/math/log2.js");
  })();

  // Provides support for Number.isNaN in legacy browsers.
  // Support: IE.
  (function checkNumberIsNaN() {
    if (Number.isNaN) {
      return;
    }
    Number.isNaN = require("core-js/es/number/is-nan.js");
  })();

  // Provides support for Number.isInteger in legacy browsers.
  // Support: IE, Chrome<34
  (function checkNumberIsInteger() {
    if (Number.isInteger) {
      return;
    }
    Number.isInteger = require("core-js/es/number/is-integer.js");
  })();

  // Support: IE, Safari<11, Chrome<63
  (function checkPromise() {
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("IMAGE_DECODERS")) {
      // The current image decoders are synchronous, hence `Promise` shouldn't
      // need to be polyfilled for the IMAGE_DECODERS build target.
      return;
    }
    if (globalThis.Promise && globalThis.Promise.allSettled) {
      return;
    }
    globalThis.Promise = require("core-js/es/promise/index.js");
  })();

  // Support: IE
  (function checkURL() {
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("IMAGE_DECODERS")) {
      // The current image decoders don't use the `URL` constructor, so it
      // doesn't need to be polyfilled for the IMAGE_DECODERS build target.
      return;
    }
    if (typeof PDFJSDev !== "undefined" && !PDFJSDev.test("GENERIC")) {
      // The `URL` constructor is assumed to be available in the extension
      // builds.
      return;
    }
    globalThis.URL = require("core-js/web/url.js");
  })();

  // Support: IE, Node.js
  (function checkReadableStream() {
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("IMAGE_DECODERS")) {
      // The current image decoders are synchronous, hence `ReadableStream`
      // shouldn't need to be polyfilled for the IMAGE_DECODERS build target.
      return;
    }
    let isReadableStreamSupported = false;

    if (typeof ReadableStream !== "undefined") {
      // MS Edge may say it has ReadableStream but they are not up to spec yet.
      try {
        // eslint-disable-next-line no-new
        new ReadableStream({
          start(controller) {
            controller.close();
          },
        });
        isReadableStreamSupported = true;
      } catch (e) {
        // The ReadableStream constructor cannot be used.
      }
    }
    if (isReadableStreamSupported) {
      return;
    }
    globalThis.ReadableStream = require("web-streams-polyfill/dist/ponyfill.js").ReadableStream;
  })();

  // We want to support Map iteration, but it doesn't seem possible to easily
  // test for that specifically; hence using a similarly unsupported property.
  // Support: IE11
  (function checkMapEntries() {
    if (globalThis.Map && globalThis.Map.prototype.entries) {
      return;
    }
    globalThis.Map = require("core-js/es/map/index.js");
  })();

  // We want to support Set iteration, but it doesn't seem possible to easily
  // test for that specifically; hence using a similarly unsupported property.
  // Support: IE11
  (function checkSetEntries() {
    if (globalThis.Set && globalThis.Set.prototype.entries) {
      return;
    }
    globalThis.Set = require("core-js/es/set/index.js");
  })();

  // Support: IE<11, Safari<8, Chrome<36
  (function checkWeakMap() {
    if (globalThis.WeakMap) {
      return;
    }
    globalThis.WeakMap = require("core-js/es/weak-map/index.js");
  })();

  // Support: IE11
  (function checkWeakSet() {
    if (globalThis.WeakSet) {
      return;
    }
    globalThis.WeakSet = require("core-js/es/weak-set/index.js");
  })();

  // Provides support for String.codePointAt in legacy browsers.
  // Support: IE11.
  (function checkStringCodePointAt() {
    if (String.prototype.codePointAt) {
      return;
    }
    require("core-js/es/string/code-point-at.js");
  })();

  // Provides support for String.fromCodePoint in legacy browsers.
  // Support: IE11.
  (function checkStringFromCodePoint() {
    if (String.fromCodePoint) {
      return;
    }
    String.fromCodePoint = require("core-js/es/string/from-code-point.js");
  })();

  // Support: IE
  (function checkSymbol() {
    if (globalThis.Symbol) {
      return;
    }
    require("core-js/es/symbol/index.js");
  })();

  // Provides support for String.prototype.padStart in legacy browsers.
  // Support: IE, Chrome<57
  (function checkStringPadStart() {
    if (String.prototype.padStart) {
      return;
    }
    require("core-js/es/string/pad-start.js");
  })();

  // Provides support for String.prototype.padEnd in legacy browsers.
  // Support: IE, Chrome<57
  (function checkStringPadEnd() {
    if (String.prototype.padEnd) {
      return;
    }
    require("core-js/es/string/pad-end.js");
  })();

  // Provides support for Object.values in legacy browsers.
  // Support: IE, Chrome<54
  (function checkObjectValues() {
    if (Object.values) {
      return;
    }
    Object.values = require("core-js/es/object/values.js");
  })();
}
