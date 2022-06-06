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
import { BasePreferences } from "./preferences.js";
import { DownloadManager } from "./download_manager.js";
import { GenericL10n } from "./genericl10n.js";
import { GenericScripting } from "./generic_scripting.js";

if (typeof PDFJSDev !== "undefined" && !PDFJSDev.test("GENERIC")) {
  throw new Error(
    'Module "pdfjs-web/genericcom" shall not be used outside GENERIC build.'
  );
}

const GenericCom = {};

class GenericPreferences extends BasePreferences {
  async _writeToStorage(prefObj) {
    // #1313 modified by ngx-extended-pdf-viewer
    try {
      localStorage.setItem("pdfjs.preferences", JSON.stringify(prefObj));
    } catch (safariSecurityException) {
      // localStorage is not available on Safari
    }
    // #1313 end of modification by ngx-extended-pdf-viewer
  }

  async _readFromStorage(prefObj) {
    // #1313 modified by ngx-extended-pdf-viewer
    try {
      return JSON.parse(localStorage.getItem("pdfjs.preferences"));
    } catch (safariSecurityException) {
      // localStorage is not available on Safari
      return {};
    }
    // #1313 end of modification by ngx-extended-pdf-viewer
  }
}

class GenericExternalServices extends DefaultExternalServices {
  static createDownloadManager(options) {
    return new DownloadManager();
  }

  static createPreferences() {
    return new GenericPreferences();
  }

  static createL10n({ locale = "en-US" }) {
    return new GenericL10n(locale);
  }

  static createScripting({ sandboxBundleSrc }) {
    return new GenericScripting(sandboxBundleSrc);
  }
}
PDFViewerApplication.externalServices = GenericExternalServices;

export { GenericCom };
