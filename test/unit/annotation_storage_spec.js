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

import { AnnotationStorage } from "../../src/display/annotation_storage.js";

describe("AnnotationStorage", function () {
  describe("GetOrCreateValue", function () {
    it("should get and set a new value in the annotation storage", function (done) {
      const annotationStorage = new AnnotationStorage();
      let value = annotationStorage.getOrCreateValue("123A", {
        value: "hello world",
      }).value;
      expect(value).toEqual("hello world");

      // the second argument is the default value to use
      // if the key isn't in the storage
      value = annotationStorage.getOrCreateValue("123A", {
        value: "an other string",
      }).value;
      expect(value).toEqual("hello world");
      done();
    });
  });

  describe("SetValue", function () {
    it("should set a new value in the annotation storage", function (done) {
      const annotationStorage = new AnnotationStorage();
      annotationStorage.setValue("123A", { value: "an other string" });
      const value = annotationStorage.getAll()["123A"].value;
      expect(value).toEqual("an other string");
      done();
    });

    it("should call onSetModified() if value is changed", function (done) {
      const annotationStorage = new AnnotationStorage();
      let called = false;
      const callback = function () {
        called = true;
      };
      annotationStorage.onSetModified = callback;
      annotationStorage.getOrCreateValue("asdf", { value: "original" });
      expect(called).toBe(false);

      // not changing value
      annotationStorage.setValue("asdf", { value: "original" });
      expect(called).toBe(false);

      // changing value
      annotationStorage.setValue("asdf", { value: "modified" });
      expect(called).toBe(true);
      done();
    });
  });

  describe("ResetModified", function () {
    it("should call onResetModified() if set", function (done) {
      const annotationStorage = new AnnotationStorage();
      let called = false;
      const callback = function () {
        called = true;
      };
      annotationStorage.onResetModified = callback;
      annotationStorage.getOrCreateValue("asdf", { value: "original" });

      // not changing value
      annotationStorage.setValue("asdf", { value: "original" });
      annotationStorage.resetModified();
      expect(called).toBe(false);

      // changing value
      annotationStorage.setValue("asdf", { value: "modified" });
      annotationStorage.resetModified();
      expect(called).toBe(true);
      done();
    });
  });
});
