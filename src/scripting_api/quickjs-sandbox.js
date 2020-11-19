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

import ModuleLoader from "../../external/quickjs/quickjs-eval.js";

class Sandbox {
  constructor(module, testMode) {
    this._evalInSandbox = module.cwrap("evalInSandbox", null, [
      "string",
      "int",
    ]);
    this._dispatchEventName = null;
    this._module = module;
    this._testMode = testMode;
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
      "/* INITIALIZATION_CODE */",
      `data = ${sandboxData};`,
      `module.exports.initSandbox({ data, extra: {${extraStr}}, out: this});`,
      "delete exports;",
      "delete module;",
      "delete data;",
    ];
    if (!this._testMode) {
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
    if (this._testMode) {
      this._evalInSandbox(
        `send({ id: "${key}", result: ${code} });`,
        this._alertOnError
      );
    }
  }
}

function QuickJSSandbox(testMode = false) {
  testMode =
    testMode &&
    (typeof PDFJSDev === "undefined" ||
      PDFJSDev.test("!PRODUCTION || TESTING"));
  return ModuleLoader().then(module => {
    return new Sandbox(module, testMode);
  });
}

export { QuickJSSandbox };
