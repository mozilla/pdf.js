/* Copyright 2021 Mozilla Foundation
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

import { docProperties, GenericScripting } from "./generic_scripting.js";
import { PDFScriptingManager } from "./pdf_scripting_manager.js";

class PDFScriptingManagerComponents extends PDFScriptingManager {
  constructor(options) {
    // The default viewer already handles adding/removing of DOM events,
    // hence limit this to only the viewer components.
    if (!options.externalServices) {
      window.addEventListener("updatefromsandbox", event => {
        options.eventBus.dispatch("updatefromsandbox", {
          source: window,
          detail: event.detail,
        });
      });
    }

    options.externalServices ||= {
      createScripting: () => new GenericScripting(options.sandboxBundleSrc),
    };
    options.docProperties ||= pdfDocument => docProperties(pdfDocument);
    super(options);
  }
}

export { PDFScriptingManagerComponents as PDFScriptingManager };
