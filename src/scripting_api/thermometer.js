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

class Thermometer extends PDFObject {
  constructor(data) {
    super(data);

    this._cancelled = false;
    this._duration = 100;
    this._text = "";
    this._value = 0;
  }

  get cancelled() {
    return this._cancelled;
  }

  set cancelled(_) {
    throw new Error("thermometer.cancelled is read-only");
  }

  get duration() {
    return this._duration;
  }

  set duration(val) {
    this._duration = val;
  }

  get text() {
    return this._text;
  }

  set text(val) {
    this._text = val;
  }

  get value() {
    return this._value;
  }

  set value(val) {
    this._value = val;
  }

  begin() {
    /* TODO */
  }

  end() {
    /* TODO */
  }
}

export { Thermometer };
