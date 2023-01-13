/* Copyright 2017 Mozilla Foundation
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

import { CMap, CMapFactory, IdentityCMap } from "../../src/core/cmap.js";
import { CMAP_PARAMS } from "./test_utils.js";
import { DefaultCMapReaderFactory } from "../../src/display/api.js";
import { Name } from "../../src/core/primitives.js";
import { StringStream } from "../../src/core/stream.js";

describe("cmap", function () {
  let fetchBuiltInCMap;

  beforeAll(function () {
    // Allow CMap testing in Node.js, e.g. for Travis.
    const CMapReaderFactory = new DefaultCMapReaderFactory({
      baseUrl: CMAP_PARAMS.cMapUrl,
      isCompressed: CMAP_PARAMS.cMapPacked,
    });

    fetchBuiltInCMap = function (name) {
      return CMapReaderFactory.fetch({
        name,
      });
    };
  });

  afterAll(function () {
    fetchBuiltInCMap = null;
  });

  it("parses beginbfchar", async function () {
    // prettier-ignore
    const str = "2 beginbfchar\n" +
              "<03> <00>\n" +
              "<04> <01>\n" +
              "endbfchar\n";
    const stream = new StringStream(str);
    const cmap = await CMapFactory.create({ encoding: stream });
    expect(cmap.lookup(0x03)).toEqual(String.fromCharCode(0x00));
    expect(cmap.lookup(0x04)).toEqual(String.fromCharCode(0x01));
    expect(cmap.lookup(0x05)).toBeUndefined();
  });

  it("parses beginbfrange with range", async function () {
    // prettier-ignore
    const str = "1 beginbfrange\n" +
              "<06> <0B> 0\n" +
              "endbfrange\n";
    const stream = new StringStream(str);
    const cmap = await CMapFactory.create({ encoding: stream });
    expect(cmap.lookup(0x05)).toBeUndefined();
    expect(cmap.lookup(0x06)).toEqual(String.fromCharCode(0x00));
    expect(cmap.lookup(0x0b)).toEqual(String.fromCharCode(0x05));
    expect(cmap.lookup(0x0c)).toBeUndefined();
  });

  it("parses beginbfrange with array", async function () {
    // prettier-ignore
    const str = "1 beginbfrange\n" +
              "<0D> <12> [ 0 1 2 3 4 5 ]\n" +
              "endbfrange\n";
    const stream = new StringStream(str);
    const cmap = await CMapFactory.create({ encoding: stream });
    expect(cmap.lookup(0x0c)).toBeUndefined();
    expect(cmap.lookup(0x0d)).toEqual(0x00);
    expect(cmap.lookup(0x12)).toEqual(0x05);
    expect(cmap.lookup(0x13)).toBeUndefined();
  });

  it("parses begincidchar", async function () {
    // prettier-ignore
    const str = "1 begincidchar\n" +
              "<14> 0\n" +
              "endcidchar\n";
    const stream = new StringStream(str);
    const cmap = await CMapFactory.create({ encoding: stream });
    expect(cmap.lookup(0x14)).toEqual(0x00);
    expect(cmap.lookup(0x15)).toBeUndefined();
  });

  it("parses begincidrange", async function () {
    // prettier-ignore
    const str = "1 begincidrange\n" +
              "<0016> <001B>   0\n" +
              "endcidrange\n";
    const stream = new StringStream(str);
    const cmap = await CMapFactory.create({ encoding: stream });
    expect(cmap.lookup(0x15)).toBeUndefined();
    expect(cmap.lookup(0x16)).toEqual(0x00);
    expect(cmap.lookup(0x1b)).toEqual(0x05);
    expect(cmap.lookup(0x1c)).toBeUndefined();
  });

  it("decodes codespace ranges", async function () {
    // prettier-ignore
    const str = "1 begincodespacerange\n" +
              "<01> <02>\n" +
              "<00000003> <00000004>\n" +
              "endcodespacerange\n";
    const stream = new StringStream(str);
    const cmap = await CMapFactory.create({ encoding: stream });
    const c = {};
    cmap.readCharCode(String.fromCharCode(1), 0, c);
    expect(c.charcode).toEqual(1);
    expect(c.length).toEqual(1);
    cmap.readCharCode(String.fromCharCode(0, 0, 0, 3), 0, c);
    expect(c.charcode).toEqual(3);
    expect(c.length).toEqual(4);
  });

  it("decodes 4 byte codespace ranges", async function () {
    // prettier-ignore
    const str = "1 begincodespacerange\n" +
              "<8EA1A1A1> <8EA1FEFE>\n" +
              "endcodespacerange\n";
    const stream = new StringStream(str);
    const cmap = await CMapFactory.create({ encoding: stream });
    const c = {};
    cmap.readCharCode(String.fromCharCode(0x8e, 0xa1, 0xa1, 0xa1), 0, c);
    expect(c.charcode).toEqual(0x8ea1a1a1);
    expect(c.length).toEqual(4);
  });

  it("read usecmap", async function () {
    const str = "/Adobe-Japan1-1 usecmap\n";
    const stream = new StringStream(str);
    const cmap = await CMapFactory.create({
      encoding: stream,
      fetchBuiltInCMap,
      useCMap: null,
    });
    expect(cmap instanceof CMap).toEqual(true);
    expect(cmap.useCMap).not.toBeNull();
    expect(cmap.builtInCMap).toBeFalsy();
    expect(cmap.length).toEqual(0x20a7);
    expect(cmap.isIdentityCMap).toEqual(false);
  });

  it("parses cmapname", async function () {
    const str = "/CMapName /Identity-H def\n";
    const stream = new StringStream(str);
    const cmap = await CMapFactory.create({ encoding: stream });
    expect(cmap.name).toEqual("Identity-H");
  });

  it("parses wmode", async function () {
    const str = "/WMode 1 def\n";
    const stream = new StringStream(str);
    const cmap = await CMapFactory.create({ encoding: stream });
    expect(cmap.vertical).toEqual(true);
  });

  it("loads built in cmap", async function () {
    const cmap = await CMapFactory.create({
      encoding: Name.get("Adobe-Japan1-1"),
      fetchBuiltInCMap,
      useCMap: null,
    });
    expect(cmap instanceof CMap).toEqual(true);
    expect(cmap.useCMap).toBeNull();
    expect(cmap.builtInCMap).toBeTruthy();
    expect(cmap.length).toEqual(0x20a7);
    expect(cmap.isIdentityCMap).toEqual(false);
  });

  it("loads built in identity cmap", async function () {
    const cmap = await CMapFactory.create({
      encoding: Name.get("Identity-H"),
      fetchBuiltInCMap,
      useCMap: null,
    });
    expect(cmap instanceof IdentityCMap).toEqual(true);
    expect(cmap.vertical).toEqual(false);
    expect(cmap.length).toEqual(0x10000);
    expect(function () {
      return cmap.isIdentityCMap;
    }).toThrow(new Error("should not access .isIdentityCMap"));
  });

  it("attempts to load a non-existent built-in CMap", async function () {
    try {
      await CMapFactory.create({
        encoding: Name.get("null"),
        fetchBuiltInCMap,
        useCMap: null,
      });

      // Shouldn't get here.
      expect(false).toEqual(true);
    } catch (reason) {
      expect(reason instanceof Error).toEqual(true);
      expect(reason.message).toEqual("Unknown CMap name: null");
    }
  });

  it("attempts to load a built-in CMap without the necessary API parameters", async function () {
    function tmpFetchBuiltInCMap(name) {
      const CMapReaderFactory = new DefaultCMapReaderFactory({});
      return CMapReaderFactory.fetch({ name });
    }

    try {
      await CMapFactory.create({
        encoding: Name.get("Adobe-Japan1-1"),
        fetchBuiltInCMap: tmpFetchBuiltInCMap,
        useCMap: null,
      });

      // Shouldn't get here.
      expect(false).toEqual(true);
    } catch (reason) {
      expect(reason instanceof Error).toEqual(true);
      expect(reason.message).toEqual(
        'The CMap "baseUrl" parameter must be specified, ensure that ' +
          'the "cMapUrl" and "cMapPacked" API parameters are provided.'
      );
    }
  });

  it("attempts to load a built-in CMap with inconsistent API parameters", async function () {
    function tmpFetchBuiltInCMap(name) {
      const CMapReaderFactory = new DefaultCMapReaderFactory({
        baseUrl: CMAP_PARAMS.cMapUrl,
        isCompressed: false,
      });
      return CMapReaderFactory.fetch({ name });
    }

    try {
      await CMapFactory.create({
        encoding: Name.get("Adobe-Japan1-1"),
        fetchBuiltInCMap: tmpFetchBuiltInCMap,
        useCMap: null,
      });

      // Shouldn't get here.
      expect(false).toEqual(true);
    } catch (reason) {
      expect(reason instanceof Error).toEqual(true);
      const message = reason.message;
      expect(message.startsWith("Unable to load CMap at: ")).toEqual(true);
      expect(message.endsWith("/external/bcmaps/Adobe-Japan1-1")).toEqual(true);
    }
  });
});
