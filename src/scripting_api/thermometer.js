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

globalThis.Thermometer = class Thermometer {
  #cancelled = false;

  #duration = 100;

  #text = "";

  #value = 0;

  get cancelled() {
    return this.#cancelled;
  }

  set cancelled(_) {
    throw new Error("thermometer.cancelled is read-only");
  }

  get duration() {
    return this.#duration;
  }

  set duration(val) {
    this.#duration = val;
  }

  get text() {
    return this.#text;
  }

  set text(val) {
    this.#text = val;
  }

  get value() {
    return this.#value;
  }

  set value(val) {
    this.#value = val;
  }

  begin() {
    /* TODO */
  }

  end() {
    /* TODO */
  }
};

export {};
