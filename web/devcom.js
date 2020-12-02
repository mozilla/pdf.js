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

import { DefaultExternalServices, PDFViewerApplication } from "./app.js";
import { loadScript, shadow } from "pdfjs-lib";

const DevCom = {};

class DevExternalServices extends DefaultExternalServices {
  static get scripting() {
    const promise = loadScript("../build/pdf.sandbox.js").then(() => {
      return window.pdfjsSandbox.QuickJSSandbox();
    });
    const sandbox = {
      createSandbox(data) {
        promise.then(sbx => sbx.create(data));
      },
      dispatchEventInSandbox(event) {
        promise.then(sbx => sbx.dispatchEvent(event));
      },
      destroySandbox() {
        promise.then(sbx => sbx.nukeSandbox());
      },
    };

    return shadow(this, "scripting", sandbox);
  }
}
PDFViewerApplication.externalServices = DevExternalServices;

export { DevCom };
