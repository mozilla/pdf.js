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
import { DOMCMapReaderFactory } from "../../src/display/display_utils.js";
import { isNodeJS } from "../../src/shared/is_node.js";
import { Name } from "../../src/core/primitives.js";
import { NodeCMapReaderFactory } from "../../src/display/node_utils.js";
import { StringStream } from "../../src/core/stream.js";

const cMapUrl = {
  dom: "../../external/bcmaps/",
  node: "./external/bcmaps/",
};
const cMapPacked = true;

describe("cmap", function () {
  let fetchBuiltInCMap;

  beforeAll(function (done) {
    // Allow CMap testing in Node.js, e.g. for Travis.
    let CMapReaderFactory;
    if (isNodeJS) {
      CMapReaderFactory = new NodeCMapReaderFactory({
        baseUrl: cMapUrl.node,
        isCompressed: cMapPacked,
      });
    } else {
      CMapReaderFactory = new DOMCMapReaderFactory({
        baseUrl: cMapUrl.dom,
        isCompressed: cMapPacked,
      });
    }

    fetchBuiltInCMap = function (name) {
      return CMapReaderFactory.fetch({
        name,
      });
    };
    done();
  });

  afterAll(function () {
    fetchBuiltInCMap = null;
  });

  it("parses beginbfchar", function (done) {
    // prettier-ignore
    const str = "2 beginbfchar\n" +
              "<03> <00>\n" +
              "<04> <01>\n" +
              "endbfchar\n";
    const stream = new StringStream(str);
    const cmapPromise = CMapFactory.create({ encoding: stream });
    cmapPromise
      .then(function (cmap) {
        expect(cmap.lookup(0x03)).toEqual(String.fromCharCode(0x00));
        expect(cmap.lookup(0x04)).toEqual(String.fromCharCode(0x01));
        expect(cmap.lookup(0x05)).toBeUndefined();
        done();
      })
      .catch(function (reason) {
        done.fail(reason);
      });
  });
  it("parses beginbfrange with range", function (done) {
    // prettier-ignore
    const str = "1 beginbfrange\n" +
              "<06> <0B> 0\n" +
              "endbfrange\n";
    const stream = new StringStream(str);
    const cmapPromise = CMapFactory.create({ encoding: stream });
    cmapPromise
      .then(function (cmap) {
        expect(cmap.lookup(0x05)).toBeUndefined();
        expect(cmap.lookup(0x06)).toEqual(String.fromCharCode(0x00));
        expect(cmap.lookup(0x0b)).toEqual(String.fromCharCode(0x05));
        expect(cmap.lookup(0x0c)).toBeUndefined();
        done();
      })
      .catch(function (reason) {
        done.fail(reason);
      });
  });
  it("parses beginbfrange with array", function (done) {
    // prettier-ignore
    const str = "1 beginbfrange\n" +
              "<0D> <12> [ 0 1 2 3 4 5 ]\n" +
              "endbfrange\n";
    const stream = new StringStream(str);
    const cmapPromise = CMapFactory.create({ encoding: stream });
    cmapPromise
      .then(function (cmap) {
        expect(cmap.lookup(0x0c)).toBeUndefined();
        expect(cmap.lookup(0x0d)).toEqual(0x00);
        expect(cmap.lookup(0x12)).toEqual(0x05);
        expect(cmap.lookup(0x13)).toBeUndefined();
        done();
      })
      .catch(function (reason) {
        done.fail(reason);
      });
  });
  it("parses begincidchar", function (done) {
    // prettier-ignore
    const str = "1 begincidchar\n" +
              "<14> 0\n" +
              "endcidchar\n";
    const stream = new StringStream(str);
    const cmapPromise = CMapFactory.create({ encoding: stream });
    cmapPromise
      .then(function (cmap) {
        expect(cmap.lookup(0x14)).toEqual(0x00);
        expect(cmap.lookup(0x15)).toBeUndefined();
        done();
      })
      .catch(function (reason) {
        done.fail(reason);
      });
  });
  it("parses begincidrange", function (done) {
    // prettier-ignore
    const str = "1 begincidrange\n" +
              "<0016> <001B>   0\n" +
              "endcidrange\n";
    const stream = new StringStream(str);
    const cmapPromise = CMapFactory.create({ encoding: stream });
    cmapPromise
      .then(function (cmap) {
        expect(cmap.lookup(0x15)).toBeUndefined();
        expect(cmap.lookup(0x16)).toEqual(0x00);
        expect(cmap.lookup(0x1b)).toEqual(0x05);
        expect(cmap.lookup(0x1c)).toBeUndefined();
        done();
      })
      .catch(function (reason) {
        done.fail(reason);
      });
  });
  it("decodes codespace ranges", function (done) {
    // prettier-ignore
    const str = "1 begincodespacerange\n" +
              "<01> <02>\n" +
              "<00000003> <00000004>\n" +
              "endcodespacerange\n";
    const stream = new StringStream(str);
    const cmapPromise = CMapFactory.create({ encoding: stream });
    cmapPromise
      .then(function (cmap) {
        const c = {};
        cmap.readCharCode(String.fromCharCode(1), 0, c);
        expect(c.charcode).toEqual(1);
        expect(c.length).toEqual(1);
        cmap.readCharCode(String.fromCharCode(0, 0, 0, 3), 0, c);
        expect(c.charcode).toEqual(3);
        expect(c.length).toEqual(4);
        done();
      })
      .catch(function (reason) {
        done.fail(reason);
      });
  });
  it("decodes 4 byte codespace ranges", function (done) {
    // prettier-ignore
    const str = "1 begincodespacerange\n" +
              "<8EA1A1A1> <8EA1FEFE>\n" +
              "endcodespacerange\n";
    const stream = new StringStream(str);
    const cmapPromise = CMapFactory.create({ encoding: stream });
    cmapPromise
      .then(function (cmap) {
        const c = {};
        cmap.readCharCode(String.fromCharCode(0x8e, 0xa1, 0xa1, 0xa1), 0, c);
        expect(c.charcode).toEqual(0x8ea1a1a1);
        expect(c.length).toEqual(4);
        done();
      })
      .catch(function (reason) {
        done.fail(reason);
      });
  });
  it("read usecmap", function (done) {
    const str = "/Adobe-Japan1-1 usecmap\n";
    const stream = new StringStream(str);
    const cmapPromise = CMapFactory.create({
      encoding: stream,
      fetchBuiltInCMap,
      useCMap: null,
    });
    cmapPromise
      .then(function (cmap) {
        expect(cmap instanceof CMap).toEqual(true);
        expect(cmap.useCMap).not.toBeNull();
        expect(cmap.builtInCMap).toBeFalsy();
        expect(cmap.length).toEqual(0x20a7);
        expect(cmap.isIdentityCMap).toEqual(false);
        done();
      })
      .catch(function (reason) {
        done.fail(reason);
      });
  });
  it("parses cmapname", function (done) {
    const str = "/CMapName /Identity-H def\n";
    const stream = new StringStream(str);
    const cmapPromise = CMapFactory.create({ encoding: stream });
    cmapPromise
      .then(function (cmap) {
        expect(cmap.name).toEqual("Identity-H");
        done();
      })
      .catch(function (reason) {
        done.fail(reason);
      });
  });
  it("parses wmode", function (done) {
    const str = "/WMode 1 def\n";
    const stream = new StringStream(str);
    const cmapPromise = CMapFactory.create({ encoding: stream });
    cmapPromise
      .then(function (cmap) {
        expect(cmap.vertical).toEqual(true);
        done();
      })
      .catch(function (reason) {
        done.fail(reason);
      });
  });
  it("loads built in cmap", function (done) {
    const cmapPromise = CMapFactory.create({
      encoding: Name.get("Adobe-Japan1-1"),
      fetchBuiltInCMap,
      useCMap: null,
    });
    cmapPromise
      .then(function (cmap) {
        expect(cmap instanceof CMap).toEqual(true);
        expect(cmap.useCMap).toBeNull();
        expect(cmap.builtInCMap).toBeTruthy();
        expect(cmap.length).toEqual(0x20a7);
        expect(cmap.isIdentityCMap).toEqual(false);
        done();
      })
      .catch(function (reason) {
        done.fail(reason);
      });
  });
  it("loads built in identity cmap", function (done) {
    const cmapPromise = CMapFactory.create({
      encoding: Name.get("Identity-H"),
      fetchBuiltInCMap,
      useCMap: null,
    });
    cmapPromise
      .then(function (cmap) {
        expect(cmap instanceof IdentityCMap).toEqual(true);
        expect(cmap.vertical).toEqual(false);
        expect(cmap.length).toEqual(0x10000);
        expect(function () {
          return cmap.isIdentityCMap;
        }).toThrow(new Error("should not access .isIdentityCMap"));
        done();
      })
      .catch(function (reason) {
        done.fail(reason);
      });
  });

  it("attempts to load a non-existent built-in CMap", function (done) {
    const cmapPromise = CMapFactory.create({
      encoding: Name.get("null"),
      fetchBuiltInCMap,
      useCMap: null,
    });
    cmapPromise.then(
      function () {
        done.fail("No CMap should be loaded");
      },
      function (reason) {
        expect(reason instanceof Error).toEqual(true);
        expect(reason.message).toEqual("Unknown CMap name: null");
        done();
      }
    );
  });

  it("attempts to load a built-in CMap without the necessary API parameters", function (done) {
    function tmpFetchBuiltInCMap(name) {
      const CMapReaderFactory = isNodeJS
        ? new NodeCMapReaderFactory({})
        : new DOMCMapReaderFactory({});
      return CMapReaderFactory.fetch({
        name,
      });
    }

    const cmapPromise = CMapFactory.create({
      encoding: Name.get("Adobe-Japan1-1"),
      fetchBuiltInCMap: tmpFetchBuiltInCMap,
      useCMap: null,
    });
    cmapPromise.then(
      function () {
        done.fail("No CMap should be loaded");
      },
      function (reason) {
        expect(reason instanceof Error).toEqual(true);
        expect(reason.message).toEqual(
          'The CMap "baseUrl" parameter must be specified, ensure that ' +
            'the "cMapUrl" and "cMapPacked" API parameters are provided.'
        );
        done();
      }
    );
  });

  it("attempts to load a built-in CMap with inconsistent API parameters", function (done) {
    function tmpFetchBuiltInCMap(name) {
      let CMapReaderFactory;
      if (isNodeJS) {
        CMapReaderFactory = new NodeCMapReaderFactory({
          baseUrl: cMapUrl.node,
          isCompressed: false,
        });
      } else {
        CMapReaderFactory = new DOMCMapReaderFactory({
          baseUrl: cMapUrl.dom,
          isCompressed: false,
        });
      }
      return CMapReaderFactory.fetch({
        name,
      });
    }

    const cmapPromise = CMapFactory.create({
      encoding: Name.get("Adobe-Japan1-1"),
      fetchBuiltInCMap: tmpFetchBuiltInCMap,
      useCMap: null,
    });
    cmapPromise.then(
      function () {
        done.fail("No CMap should be loaded");
      },
      function (reason) {
        expect(reason instanceof Error).toEqual(true);
        const message = reason.message;
        expect(message.startsWith("Unable to load CMap at: ")).toEqual(true);
        expect(message.endsWith("/external/bcmaps/Adobe-Japan1-1")).toEqual(
          true
        );
        done();
      }
    );
  });
});
