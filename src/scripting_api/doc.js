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

class Doc extends PDFObject {
  constructor(data) {
    super(data);

    this._printParams = null;
    this._fields = Object.create(null);
    this._event = null;
  }

  calculateNow() {
    this._eventDispatcher.calculateNow();
  }

  getField(cName) {
    if (typeof cName !== "string") {
      throw new TypeError("Invalid field name: must be a string");
    }
    if (cName in this._fields) {
      return this._fields[cName];
    }
    for (const [name, field] of Object.entries(this._fields)) {
      if (name.includes(cName)) {
        return field;
      }
    }

    return undefined;
  }
}

export { Doc };
