/* Copyright 2020 Mozilla Foundation
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

import ModuleLoader from "../external/quickjs/quickjs-eval.js";

/* eslint-disable-next-line no-unused-vars */
const pdfjsVersion = PDFJSDev.eval("BUNDLE_VERSION");
/* eslint-disable-next-line no-unused-vars */
const pdfjsBuild = PDFJSDev.eval("BUNDLE_BUILD");

const TESTING =
  typeof PDFJSDev === "undefined" || PDFJSDev.test("!PRODUCTION || TESTING");

class Sandbox {
  constructor(module) {
    this._evalInSandbox = module.cwrap("evalInSandbox", null, [
      "string",
      "int",
    ]);
    this._dispatchEventName = null;
    this._module = module;
    this._alertOnError = 1;
  }

  create(data) {
    const sandboxData = JSON.stringify(data);
    const extra = [
      "send",
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "crackURL",
    ];
    const extraStr = extra.join(",");
    let code = [
      "exports = Object.create(null);",
      "module = Object.create(null);",
      // Next line is replaced by code from initialization.js
      // when we create the bundle for the sandbox.
      PDFJSDev.eval("PDF_SCRIPTING_JS_SOURCE"),
      `data = ${sandboxData};`,
      `module.exports.initSandbox({ data, extra: {${extraStr}}, out: this});`,
      "delete exports;",
      "delete module;",
      "delete data;",
    ];
    if (!TESTING) {
      code = code.concat(extra.map(name => `delete ${name};`));
      code.push("delete debugMe;");
    }
    this._evalInSandbox(code.join("\n"), this._alertOnError);
    this._dispatchEventName = data.dispatchEventName;
  }

  dispatchEvent(event) {
    if (this._dispatchEventName === null) {
      throw new Error("Sandbox must have been initialized");
    }
    event = JSON.stringify(event);
    this._evalInSandbox(
      `app["${this._dispatchEventName}"](${event});`,
      this._alertOnError
    );
  }

  dumpMemoryUse() {
    this._module.ccall("dumpMemoryUse", null, []);
  }

  nukeSandbox() {
    this._dispatchEventName = null;
    this._module.ccall("nukeSandbox", null, []);
    this._module = null;
    this._evalInSandbox = null;
  }

  evalForTesting(code, key) {
    if (TESTING) {
      this._evalInSandbox(
        `try {
           send({ id: "${key}", result: ${code} });
         } catch (error) {
           send({ id: "${key}", result: error.message });
         }`,
        this._alertOnError
      );
    }
  }
}

function QuickJSSandbox() {
  return ModuleLoader().then(module => {
    return new Sandbox(module);
  });
}

export { QuickJSSandbox };
