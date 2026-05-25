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

if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) {
  // TODO: Remove this once `Math.sumPrecise` is supported in QuickJS.
  //
  // Note that this isn't a "proper" polyfill, but since we're only using it to
  // replace `Array.prototype.reduce()` invocations it should be fine.
  if (typeof Math.sumPrecise !== "function") {
    Math.sumPrecise = function (numbers) {
      return numbers.reduce((a, b) => a + b, 0);
    };
  }

  // TODO: Remove this once `Map.prototype.getOrInsertComputed` is supported in
  // QuickJS.
  if (typeof Map.prototype.getOrInsertComputed !== "function") {
    // eslint-disable-next-line no-extend-native
    Map.prototype.getOrInsertComputed = function (key, callbackFn) {
      if (!this.has(key)) {
        this.set(key, callbackFn(key));
      }
      return this.get(key);
    };
  }
}

export {};
