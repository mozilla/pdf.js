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

import { Dict, Name, Ref, RefSetCache } from "../../src/core/primitives.js";
import { incrementalUpdate, writeDict } from "../../src/core/writer.js";
import { bytesToString } from "../../src/shared/util.js";
import { StringStream } from "../../src/core/stream.js";

describe("Writer", function () {
  describe("Incremental update", function () {
    it("should update a file with new objects", async function () {
      const originalData = new Uint8Array();
      const changes = new RefSetCache();
      changes.put(Ref.get(123, 0x2d), { data: "abc\n" });
      changes.put(Ref.get(456, 0x4e), { data: "defg\n" });
      const xrefInfo = {
        newRef: Ref.get(789, 0),
        startXRef: 314,
        fileIds: ["id", ""],
        rootRef: null,
        infoRef: null,
        encryptRef: null,
        filename: "foo.pdf",
        info: {},
      };

      let data = await incrementalUpdate({
        originalData,
        xrefInfo,
        changes,
        xref: {},
        useXrefStream: true,
      });
      data = bytesToString(data);

      let expected =
        "\nabc\n" +
        "defg\n" +
        "789 0 obj\n" +
        "<< /Prev 314 /Size 790 /Type /XRef /Index [123 1 456 1 789 1] " +
        "/W [1 1 1] /ID [(id) (\x01#Eg\x89\xab\xcd\xef\xfe\xdc\xba\x98vT2\x10)] " +
        "/Length 9>> stream\n" +
        "\x01\x01\x2d" +
        "\x01\x05\x4e" +
        "\x01\x0a\x00\n" +
        "endstream\n" +
        "endobj\n" +
        "startxref\n" +
        "10\n" +
        "%%EOF\n";
      expect(data).toEqual(expected);

      data = await incrementalUpdate({
        originalData,
        xrefInfo,
        changes,
        xref: {},
        useXrefStream: false,
      });
      data = bytesToString(data);

      expected =
        "\nabc\n" +
        "defg\n" +
        "xref\n" +
        "123 1\n" +
        "0000000001 00045 n\r\n" +
        "456 1\n" +
        "0000000005 00078 n\r\n" +
        "789 1\n" +
        "0000000010 00000 n\r\n" +
        "trailer\n" +
        "<< /Prev 314 /Size 789 " +
        "/ID [(id) (\x01#Eg\x89\xab\xcd\xef\xfe\xdc\xba\x98vT2\x10)]>>\n" +
        "startxref\n" +
        "10\n" +
        "%%EOF\n";
      expect(data).toEqual(expected);
    });

    it("should update a file, missing the /ID-entry, with new objects", async function () {
      const originalData = new Uint8Array();
      const changes = new RefSetCache();
      changes.put(Ref.get(123, 0x2d), { data: "abc\n" });
      const xrefInfo = {
        newRef: Ref.get(789, 0),
        startXRef: 314,
        fileIds: null,
        rootRef: null,
        infoRef: null,
        encryptRef: null,
        filename: "foo.pdf",
        info: {},
      };

      let data = await incrementalUpdate({
        originalData,
        xrefInfo,
        changes,
        xref: {},
        useXrefStream: true,
      });
      data = bytesToString(data);

      const expected =
        "\nabc\n" +
        "789 0 obj\n" +
        "<< /Prev 314 /Size 790 /Type /XRef /Index [123 1 789 1] " +
        "/W [1 1 1] /Length 6>> stream\n" +
        "\x01\x01\x2d" +
        "\x01\x05\x00\n" +
        "endstream\n" +
        "endobj\n" +
        "startxref\n" +
        "5\n" +
        "%%EOF\n";

      expect(data).toEqual(expected);
    });
  });

  describe("writeDict", function () {
    it("should write a Dict", async function () {
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
      dict.set("J", true);
      dict.set("K", false);

      dict.set("NullArr", [null, 10]);
      dict.set("NullVal", null);

      const buffer = [];
      await writeDict(dict, buffer, null);

      const expected =
        "<< /A /B /B 123 456 R /C 789 /D (hello world) " +
        "/E (\\(hello\\\\world\\)) /F [1.23 4.5 6] " +
        "/G << /H 123 /I << /Length 8>> stream\n" +
        "a stream\n" +
        "endstream>> /J true /K false " +
        "/NullArr [null 10] /NullVal null>>";

      expect(buffer.join("")).toEqual(expected);
    });

    it("should write a Dict in escaping PDF names", async function () {
      const dict = new Dict(null);
      dict.set("\xfeA#", Name.get("hello"));
      dict.set("B", Name.get("#hello"));
      dict.set("C", Name.get("he\xfello\xff"));

      const buffer = [];
      await writeDict(dict, buffer, null);

      const expected = "<< /#feA#23 /hello /B /#23hello /C /he#fello#ff>>";

      expect(buffer.join("")).toEqual(expected);
    });
  });

  describe("XFA", function () {
    it("should update AcroForm when no datasets in XFA array", async function () {
      const originalData = new Uint8Array();
      const changes = new RefSetCache();

      const acroForm = new Dict(null);
      acroForm.set("XFA", [
        "preamble",
        Ref.get(123, 0),
        "postamble",
        Ref.get(456, 0),
      ]);
      const acroFormRef = Ref.get(789, 0);
      const xfaDatasetsRef = Ref.get(101112, 0);
      const xfaData = "<hello>world</hello>";

      const xrefInfo = {
        newRef: Ref.get(131415, 0),
        startXRef: 314,
        fileIds: null,
        rootRef: null,
        infoRef: null,
        encryptRef: null,
        filename: "foo.pdf",
        info: {},
      };

      let data = await incrementalUpdate({
        originalData,
        xrefInfo,
        changes,
        hasXfa: true,
        xfaDatasetsRef,
        hasXfaDatasetsEntry: false,
        acroFormRef,
        acroForm,
        xfaData,
        xref: {},
        useXrefStream: true,
      });
      data = bytesToString(data);

      const expected =
        "\n" +
        "789 0 obj\n" +
        "<< /XFA [(preamble) 123 0 R (datasets) 101112 0 R (postamble) 456 0 R]>>\n" +
        "endobj\n" +
        "101112 0 obj\n" +
        "<< /Type /EmbeddedFile /Length 20>> stream\n" +
        "<hello>world</hello>\n" +
        "endstream\n" +
        "endobj\n" +
        "131415 0 obj\n" +
        "<< /Prev 314 /Size 131416 /Type /XRef /Index [789 1 101112 1 131415 1] /W [1 1 0] /Length 6>> stream\n" +
        "\x01\x01\x01[\x01¹\n" +
        "endstream\n" +
        "endobj\n" +
        "startxref\n" +
        "185\n" +
        "%%EOF\n";

      expect(data).toEqual(expected);
    });
  });

  it("should update a file with a deleted object", async function () {
    const originalData = new Uint8Array();
    const changes = new RefSetCache();
    changes.put(Ref.get(123, 0x2d), { data: null });
    changes.put(Ref.get(456, 0x4e), { data: "abc\n" });
    const xrefInfo = {
      newRef: Ref.get(789, 0),
      startXRef: 314,
      fileIds: ["id", ""],
      rootRef: null,
      infoRef: null,
      encryptRef: null,
      filename: "foo.pdf",
      info: {},
    };

    let data = await incrementalUpdate({
      originalData,
      xrefInfo,
      changes,
      xref: {},
      useXrefStream: true,
    });
    data = bytesToString(data);

    let expected =
      "\nabc\n" +
      "789 0 obj\n" +
      "<< /Prev 314 /Size 790 /Type /XRef /Index [123 1 456 1 789 1] " +
      "/W [1 1 1] /ID [(id) (\x01#Eg\x89\xab\xcd\xef\xfe\xdc\xba\x98vT2\x10)] " +
      "/Length 9>> stream\n" +
      "\x00\x00\x2e" +
      "\x01\x01\x4e" +
      "\x01\x05\x00\n" +
      "endstream\n" +
      "endobj\n" +
      "startxref\n" +
      "5\n" +
      "%%EOF\n";
    expect(data).toEqual(expected);

    data = await incrementalUpdate({
      originalData,
      xrefInfo,
      changes,
      xref: {},
      useXrefStream: false,
    });
    data = bytesToString(data);

    expected =
      "\nabc\n" +
      "xref\n" +
      "123 1\n" +
      "0000000000 00046 f\r\n" +
      "456 1\n" +
      "0000000001 00078 n\r\n" +
      "789 1\n" +
      "0000000005 00000 n\r\n" +
      "trailer\n" +
      "<< /Prev 314 /Size 789 " +
      "/ID [(id) (\x01#Eg\x89\xab\xcd\xef\xfe\xdc\xba\x98vT2\x10)]>>\n" +
      "startxref\n" +
      "5\n" +
      "%%EOF\n";
    expect(data).toEqual(expected);
  });
});
