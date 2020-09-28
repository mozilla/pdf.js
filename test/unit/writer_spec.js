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

import { Dict, Name, Ref } from "../../src/core/primitives.js";
import { incrementalUpdate, writeDict } from "../../src/core/writer.js";
import { bytesToString } from "../../src/shared/util.js";
import { StringStream } from "../../src/core/stream.js";

describe("Writer", function () {
  describe("Incremental update", function () {
    it("should update a file with new objects", function (done) {
      const originalData = new Uint8Array();
      const newRefs = [
        { ref: Ref.get(123, 0x2d), data: "abc\n" },
        { ref: Ref.get(456, 0x4e), data: "defg\n" },
      ];
      const xrefInfo = {
        newRef: Ref.get(789, 0),
        startXRef: 314,
        fileIds: ["id", ""],
        rootRef: null,
        infoRef: null,
        encrypt: null,
        filename: "foo.pdf",
        info: {},
      };

      let data = incrementalUpdate({ originalData, xrefInfo, newRefs });
      data = bytesToString(data);

      const expected =
        "\nabc\n" +
        "defg\n" +
        "789 0 obj\n" +
        "<< /Size 790 /Prev 314 /Type /XRef /Index [0 1 123 1 456 1 789 1] " +
        "/ID [(id) (\x01#Eg\x89\xab\xcd\xef\xfe\xdc\xba\x98vT2\x10)] " +
        "/W [1 1 2] /Length 16>> stream\n" +
        "\x00\x01\xff\xff" +
        "\x01\x01\x00\x2d" +
        "\x01\x05\x00\x4e" +
        "\x01\x0a\x00\x00\n" +
        "endstream\n" +
        "endobj\n" +
        "startxref\n" +
        "10\n" +
        "%%EOF\n";

      expect(data).toEqual(expected);
      done();
    });
  });

  describe("writeDict", function () {
    it("should write a Dict", function (done) {
      const dict = new Dict(null);
      dict.set("A", Name.get("B"));
      dict.set("B", Ref.get(123, 456));
      dict.set("C", 789);
      dict.set("D", "hello world");
      dict.set("E", "(hello\\world)");
      dict.set("F", [1.23001, 4.50001, 6]);

      const gdict = new Dict(null);
      gdict.set("H", 123.00001);
      const string = "a stream";
      const stream = new StringStream(string);
      stream.dict = new Dict(null);
      stream.dict.set("Length", string.length);
      gdict.set("I", stream);

      dict.set("G", gdict);

      const buffer = [];
      writeDict(dict, buffer, null);

      const expected =
        "<< /A /B /B 123 456 R /C 789 /D (hello world) " +
        "/E (\\(hello\\\\world\\)) /F [1.23 4.5 6] " +
        "/G << /H 123 /I << /Length 8>> stream\n" +
        "a stream\n" +
        "endstream\n>>>>";

      expect(buffer.join("")).toEqual(expected);
      done();
    });

    it("should write a Dict in escaping PDF names", function (done) {
      const dict = new Dict(null);
      dict.set("\xfeA#", Name.get("hello"));
      dict.set("B", Name.get("#hello"));
      dict.set("C", Name.get("he\xfello\xff"));

      const buffer = [];
      writeDict(dict, buffer, null);

      const expected = "<< /#feA#23 /hello /B /#23hello /C /he#fello#ff>>";

      expect(buffer.join("")).toEqual(expected);
      done();
    });
  });
});
