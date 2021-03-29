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

import { isNodeJS } from "./is_node.js";

// Skip compatibility checks for modern builds and if we already ran the module.
if (
  (typeof PDFJSDev === "undefined" || !PDFJSDev.test("SKIP_BABEL")) &&
  (typeof globalThis === "undefined" || !globalThis._pdfjsCompatibilityChecked)
) {
  // Provides support for globalThis in legacy browsers.
  // Support: Firefox<65, Chrome<71, Safari<12.1
  if (typeof globalThis === "undefined" || globalThis.Math !== Math) {
    // eslint-disable-next-line no-global-assign
    globalThis = require("core-js/es/global-this");
  }
  globalThis._pdfjsCompatibilityChecked = true;

  // Support: Node.js
  (function checkNodeBtoa() {
    if (globalThis.btoa || !isNodeJS) {
      return;
    }
    globalThis.btoa = function (chars) {
      // eslint-disable-next-line no-undef
      return Buffer.from(chars, "binary").toString("base64");
    };
  })();

  // Support: Node.js
  (function checkNodeAtob() {
    if (globalThis.atob || !isNodeJS) {
      return;
    }
    globalThis.atob = function (input) {
      // eslint-disable-next-line no-undef
      return Buffer.from(input, "base64").toString("binary");
    };
  })();

  // Provides support for Object.fromEntries in legacy browsers.
  // Support: Firefox<63, Chrome<73, Safari<12.1
  (function checkObjectFromEntries() {
    if (Object.fromEntries) {
      return;
    }
    require("core-js/es/object/from-entries.js");
  })();

  // Provides support for *recent* additions to the Promise specification,
  // however basic Promise support is assumed to be available natively.
  // Support: Firefox<71, Chrome<76, Safari<13
  (function checkPromise() {
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("IMAGE_DECODERS")) {
      // The current image decoders are synchronous, hence `Promise` shouldn't
      // need to be polyfilled for the IMAGE_DECODERS build target.
      return;
    }
    if (globalThis.Promise.allSettled) {
      return;
    }
    globalThis.Promise = require("core-js/es/promise/index.js");
  })();

  // Support: Safari<10.1, Node.js
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

  // Provides support for String.prototype.padStart in legacy browsers.
  // Support: Chrome<57, Safari<10
  (function checkStringPadStart() {
    if (String.prototype.padStart) {
      return;
    }
    require("core-js/es/string/pad-start.js");
  })();

  // Provides support for String.prototype.padEnd in legacy browsers.
  // Support: Chrome<57, Safari<10
  (function checkStringPadEnd() {
    if (String.prototype.padEnd) {
      return;
    }
    require("core-js/es/string/pad-end.js");
  })();

  // Provides support for Object.values in legacy browsers.
  // Support: Chrome<54, Safari<10.1
  (function checkObjectValues() {
    if (Object.values) {
      return;
    }
    Object.values = require("core-js/es/object/values.js");
  })();

  // Provides support for Object.entries in legacy browsers.
  // Support: Chrome<54, Safari<10.1
  (function checkObjectEntries() {
    if (Object.entries) {
      return;
    }
    Object.entries = require("core-js/es/object/entries.js");
  })();
}
