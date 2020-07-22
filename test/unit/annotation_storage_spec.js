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
      let value = annotationStorage.getOrCreateValue("123A", "hello world");
      expect(value).toEqual("hello world");

      // the second argument is the default value to use
      // if the key isn't in the storage
      value = annotationStorage.getOrCreateValue("123A", "an other string");
      expect(value).toEqual("hello world");
      done();
    });
  });

  describe("SetValue", function () {
    it("should set a new value in the annotation storage", function (done) {
      const annotationStorage = new AnnotationStorage();
      annotationStorage.setValue("123A", "an other string");
      const value = annotationStorage.getAll()["123A"];
      expect(value).toEqual("an other string");
      done();
    });
  });
});
