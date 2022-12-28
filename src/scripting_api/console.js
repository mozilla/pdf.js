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

import { PDFObject } from "./pdf_object.js";

class Console extends PDFObject {
  clear() {
    this._send({ id: "clear" });
  }

  hide() {
    /* Not implemented */
  }

  println(msg) {
    if (typeof msg === "string") {
      this._send({ command: "println", value: "PDF.js Console:: " + msg });
    }
  }

  show() {
    /* Not implemented */
  }
}

export { Console };
