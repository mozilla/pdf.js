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

import { EventDispatcher } from "./event.js";
import { NotSupportedError } from "./error.js";
import { PDFObject } from "./pdf_object.js";

class App extends PDFObject {
  constructor(data) {
    super(data);
    this._document = data._document;
    this._objects = Object.create(null);
    this._eventDispatcher = new EventDispatcher(
      this._document,
      data.calculationOrder,
      this._objects
    );

    // used in proxy.js to check that this the object with the backdoor
    this._isApp = true;
  }

  // This function is called thanks to the proxy
  // when we call app['random_string'] to dispatch the event.
  _dispatchEvent(pdfEvent) {
    this._eventDispatcher.dispatch(pdfEvent);
  }

  get activeDocs() {
    return [this._document.wrapped];
  }

  set activeDocs(_) {
    throw new NotSupportedError("app.activeDocs");
  }

  alert(
    cMsg,
    nIcon = 0,
    nType = 0,
    cTitle = "PDF.js",
    oDoc = null,
    oCheckbox = null
  ) {
    this._send({ command: "alert", value: cMsg });
  }
}

export { App };
