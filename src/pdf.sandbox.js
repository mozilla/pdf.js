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
import { SandboxSupportBase } from "./pdf.sandbox.external.js";

/* eslint-disable-next-line no-unused-vars */
const pdfjsVersion = PDFJSDev.eval("BUNDLE_VERSION");
/* eslint-disable-next-line no-unused-vars */
const pdfjsBuild = PDFJSDev.eval("BUNDLE_BUILD");

const TESTING =
  typeof PDFJSDev === "undefined" || PDFJSDev.test("!PRODUCTION || TESTING");

class SandboxSupport extends SandboxSupportBase {
  exportValueToSandbox(val) {
    // The communication with the Quickjs sandbox is based on strings
    // So we use JSON.stringfy to serialize
    return JSON.stringify(val);
  }

  importValueFromSandbox(val) {
    return val;
  }

  createErrorForSandbox(errorMessage) {
    return new Error(errorMessage);
  }
}

class Sandbox {
  constructor(win, module) {
    this.support = new SandboxSupport(win, this);

    // The "external" functions created in pdf.sandbox.external.js
    // are finally used here:
    // https://github.com/mozilla/pdf.js.quickjs/blob/main/src/myjs.js
    // They're called from the sandbox only.
    module.externalCall = this.support.createSandboxExternals();

    this._module = module;

    // 0 to display error using console.error
    // else display error using window.alert
    this._alertOnError = 0;
  }

  create(data) {
    if (TESTING) {
      this._module.ccall("nukeSandbox", null, []);
    }
    const code = [PDFJSDev.eval("PDF_SCRIPTING_JS_SOURCE")];
    if (!TESTING) {
      code.push("delete dump;");
    } else {
      code.push(
        `globalThis.sendResultForTesting = callExternalFunction.bind(null, "send");`
      );
    }

    let success = false;
    let buf = 0;
    try {
      const sandboxData = JSON.stringify(data);
      // "pdfjsScripting.initSandbox..." MUST be the last line to be evaluated
      // since the returned value is used for the communication.
      code.push(`pdfjsScripting.initSandbox({ data: ${sandboxData} })`);
      buf = this._module.stringToNewUTF8(code.join("\n"));

      success = !!this._module.ccall(
        "init",
        "number",
        ["number", "number"],
        [buf, this._alertOnError]
      );
    } catch (error) {
      console.error(error);
    } finally {
      if (buf) {
        this._module.ccall("free", "number", ["number"], [buf]);
      }
    }

    if (success) {
      this.support.commFun = this._module.cwrap("commFun", null, [
        "string",
        "string",
      ]);
    } else {
      this.nukeSandbox();
      throw new Error("Cannot start sandbox");
    }
  }

  dispatchEvent(event) {
    this.support.callSandboxFunction("dispatchEvent", event);
  }

  dumpMemoryUse() {
    if (this._module) {
      this._module.ccall("dumpMemoryUse", null, []);
    }
  }

  nukeSandbox() {
    if (this._module !== null) {
      this.support.destroy();
      this.support = null;
      this._module.ccall("nukeSandbox", null, []);
      this._module = null;
    }
  }

  evalForTesting(code, key) {
    if (TESTING) {
      this._module.ccall(
        "evalInSandbox",
        null,
        ["string", "int"],
        [
          `try {
             sendResultForTesting([{ id: "${key}", result: ${code} }]);
          } catch (error) {
             sendResultForTesting([{ id: "${key}", result: error.message }]);
          }`,
          this._alertOnError,
        ]
      );
    }
  }
}

function QuickJSSandbox() {
  return ModuleLoader().then(module => {
    return new Sandbox(window, module);
  });
}

export { QuickJSSandbox };
