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

import { assert, isNodeJS, stringToBytes } from "../../src/shared/util.js";
import { Dict, Name, Ref } from "../../src/core/primitives.js";
import {
  fetchData as fetchDataNode,
  NodeBinaryDataFactory,
} from "../../src/display/node_utils.js";
import { NullStream, StringStream } from "../../src/core/stream.js";
import { Page, PDFDocument } from "../../src/core/document.js";
import { decodeBrotli } from "../../src/core/wasm_loader.js";
import { DOMBinaryDataFactory } from "../../src/display/binary_data_factory.js";
import { fetchData as fetchDataDOM } from "../../src/display/dom_utils.js";
import { ImageResizer } from "../../src/core/image_resizer.js";

const TEST_PDFS_PATH = isNodeJS ? "./test/pdfs/" : "../pdfs/";

const CMAP_URL = isNodeJS ? "./external/bcmaps/" : "../../external/bcmaps/";

const ICC_URL = isNodeJS ? "./external/iccs/" : "../../external/iccs/";

const STANDARD_FONT_DATA_URL = isNodeJS
  ? "./external/hellbox/"
  : "../../external/hellbox/";

const WASM_URL = isNodeJS
  ? "./build/generic-legacy/web/wasm/"
  : "../../build/generic/web/wasm/";

class DefaultFileReaderFactory {
  static async fetch(params) {
    return isNodeJS
      ? fetchDataNode(params.path)
      : fetchDataDOM(params.path, /* type = */ "bytes");
  }
}

const DefaultBinaryDataFactory =
  typeof PDFJSDev !== "undefined" && PDFJSDev.test("GENERIC") && isNodeJS
    ? NodeBinaryDataFactory
    : DOMBinaryDataFactory;

async function fetchBuiltInCMapHelper(binaryDataFactory, cMapPacked, name) {
  let cMapData = await binaryDataFactory.fetch({
    kind: "cMapUrl",
    filename: `${name}${cMapPacked ? ".bcmap.br" : ""}`,
  });
  if (cMapPacked) {
    cMapData = await decodeBrotli(cMapData);
  }
  return { cMapData, cMapPacked };
}

function buildGetDocumentParams(filename, options) {
  const params = Object.create(null);
  params.url = isNodeJS
    ? TEST_PDFS_PATH + filename
    : new URL(TEST_PDFS_PATH + filename, window.location).href;
  params.standardFontDataUrl = STANDARD_FONT_DATA_URL;
  params.wasmUrl = WASM_URL;

  for (const option in options) {
    params[option] = options[option];
  }
  return params;
}

// Builds a PDF file from its objects, with a valid xref table.
function assemblePdf(objects, trailerEntries = "") {
  let pdf = "%PDF-1.7\n";
  const offsets = [];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailerEntries}>>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;
  return stringToBytes(pdf);
}

function buildPdfWithFont(content, fontObjects) {
  return assemblePdf([
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] " +
      "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
    ...fontObjects,
  ]);
}

function buildTextPdf(content, fontEntries = "/Encoding /WinAnsiEncoding") {
  return buildPdfWithFont(content, [
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica " +
      `${fontEntries} >>\nendobj\n`,
  ]);
}

function buildVerticalTextPdf(content) {
  return buildPdfWithFont(content, [
    "5 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /VerticalTest " +
      "/Encoding /UniJIS-UTF16-V /DescendantFonts [6 0 R] >>\nendobj\n",
    "6 0 obj\n<< /Type /Font /Subtype /CIDFontType0 /BaseFont /VerticalTest " +
      "/CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 6 >> " +
      "/FontDescriptor 7 0 R /DW2 [880 -900] >>\nendobj\n",
    "7 0 obj\n<< /Type /FontDescriptor /FontName /VerticalTest /Flags 4 " +
      "/FontBBox [0 -120 1000 880] /ItalicAngle 0 /Ascent 880 /Descent -120 " +
      "/CapHeight 700 /StemV 80 >>\nendobj\n",
  ]);
}

// Builds a PDF sound object's stream dictionary (ISO 32000-1, 12.5.6.16). Pass
// a key as `null` to omit it (to exercise defaults/missing entries); pass
// `type: true` to add the optional `/Type /Sound` entry.
function createSoundDict({
  R = 22050,
  C = 1,
  B = 16,
  E = "Signed",
  CO,
  type = false,
} = {}) {
  const dict = new Dict();
  if (type) {
    dict.set("Type", Name.get("Sound"));
  }
  if (R !== null) {
    dict.set("R", R);
  }
  if (C !== null) {
    dict.set("C", C);
  }
  if (B !== null) {
    dict.set("B", B);
  }
  if (E !== null) {
    dict.set("E", Name.get(E));
  }
  if (CO) {
    dict.set("CO", Name.get(CO));
  }
  return dict;
}

function getCrossOriginHostname(hostname) {
  if (hostname === "localhost") {
    // Note: This does not work if localhost is listening on IPv6 only.
    // As a work-around, visit the IPv6 version at:
    // http://[::1]:8888/test/unit/unit_test.html?spec=Cross-origin
    return "127.0.0.1";
  }

  if (hostname === "127.0.0.1" || hostname === "[::1]") {
    return "localhost";
  }

  // FQDN are cross-origin and browsers usually resolve them to the same server.
  return hostname.endsWith(".") ? hostname.slice(0, -1) : hostname + ".";
}

class XRefMock {
  #map = new Map();

  #newPersistentRefNum = null;

  #newTemporaryRefNum = null;

  stream = new NullStream();

  pdfManager = {
    evaluatorOptions: { useWasm: true },
    imageResizer: new ImageResizer(),
  };

  constructor(array = []) {
    for (const { ref, data } of array) {
      this.#map.set(ref.toString(), data);
    }
  }

  getNewPersistentRef(obj) {
    if (this.#newPersistentRefNum === null) {
      this.#newPersistentRefNum = this.#map.size || 1;
    }
    const ref = Ref.get(this.#newPersistentRefNum++, 0);
    this.#map.set(ref.toString(), obj);
    return ref;
  }

  getNewTemporaryRef() {
    if (this.#newTemporaryRefNum === null) {
      this.#newTemporaryRefNum = this.#map.size || 1;
    }
    return Ref.get(this.#newTemporaryRefNum++, 0);
  }

  resetNewTemporaryRef() {
    this.#newTemporaryRefNum = null;
  }

  countUpdatesAfter(offset) {
    return null;
  }

  fetch(ref) {
    return this.#map.get(ref.toString());
  }

  async fetchAsync(ref) {
    return this.fetch(ref);
  }

  fetchIfRef(obj) {
    return obj instanceof Ref ? this.fetch(obj) : obj;
  }

  async fetchIfRefAsync(obj) {
    return this.fetchIfRef(obj);
  }
}

/**
 * `XRefMock` variant that limits the number of fetches, such that tests
 * exercising cycle detection fail rather than hang when a guard is missing.
 */
class BoundedXRefMock extends XRefMock {
  #limit;

  fetchCount = 0;

  constructor(array, limit = 100) {
    super(array);
    this.#limit = limit;
  }

  fetch(ref) {
    if (++this.fetchCount > this.#limit) {
      throw new Error(`BoundedXRefMock: more than ${this.#limit} fetches.`);
    }
    return super.fetch(ref);
  }
}

function createIdFactory(pageIndex) {
  const pdfManager = {
    get docId() {
      return "d0";
    },
  };
  const stream = new StringStream("Dummy_PDF_data");
  const pdfDocument = new PDFDocument(pdfManager, stream);

  const page = new Page({
    pdfManager: pdfDocument.pdfManager,
    xref: pdfDocument.xref,
    pageIndex,
    globalIdFactory: pdfDocument._globalIdFactory,
  });
  return page._localIdFactory;
}

// Some tests rely on special behavior from webserver.mjs. When loaded in the
// browser, the page is already served from WebServer. When running from
// Node.js, that is not the case. This helper starts the WebServer if needed,
// and offers a mechanism to resolve the URL in a uniform way.
class TestPdfsServer {
  static #webServer;

  static #startCount = 0;

  static #startPromise;

  static async ensureStarted() {
    if (this.#startCount++) {
      // Already started before. E.g. from another beforeAll call.
      return this.#startPromise;
    }
    if (!isNodeJS) {
      // In web browsers, tests are presumably served by webserver.mjs.
      return undefined;
    }

    this.#startPromise = this.#startServer().finally(() => {
      this.#startPromise = null;
    });
    return this.#startPromise;
  }

  static async #startServer() {
    // WebServer from webserver.mjs is imported dynamically instead of
    // statically because we do not need it when running from the browser.
    let WebServer;
    if (import.meta.url.endsWith("/lib-legacy/test/unit/test_utils.js")) {
      // When "gulp unittestcli" is used to run tests, the tests are run from
      // pdf.js/build/lib-legacy/test/ instead of directly from pdf.js/test/.
      // eslint-disable-next-line import/no-unresolved
      ({ WebServer } = await import("../../../../test/webserver.mjs"));
    } else {
      ({ WebServer } = await import("../webserver.mjs"));
    }
    this.#webServer = new WebServer({
      host: "127.0.0.1",
      root: TEST_PDFS_PATH,
    });
    await new Promise(resolve => {
      this.#webServer.start(resolve);
    });
  }

  static async ensureStopped() {
    assert(this.#startCount > 0, "ensureStarted() should be called first");
    assert(!this.#startPromise, "ensureStarted() should have resolved");
    if (--this.#startCount) {
      // Keep server alive as long as there is an ensureStarted() that was not
      // followed by an ensureStopped() call.
      // This could happen if ensureStarted() was called again before
      // ensureStopped() was called from afterAll().
      return;
    }
    if (!isNodeJS) {
      // Web browsers cannot stop the server.
      return;
    }

    await new Promise(resolve => {
      this.#webServer.stop(resolve);
      this.#webServer = null;
    });
  }

  /**
   * @param {string} path - path to file within test/unit/pdf/ (TEST_PDFS_PATH).
   * @returns {URL}
   */
  static resolveURL(path) {
    assert(this.#startCount > 0, "ensureStarted() should be called first");
    assert(!this.#startPromise, "ensureStarted() should have resolved");

    if (isNodeJS) {
      // Note: TestPdfsServer.ensureStarted() should be called first.
      return new URL(path, `http://127.0.0.1:${this.#webServer.port}/`);
    }
    // When "gulp server" is used, our URL looks like
    // http://localhost:8888/test/unit/unit_test.html
    // The PDFs are served from:
    // http://localhost:8888/test/pdfs/
    return new URL(TEST_PDFS_PATH + path, window.location);
  }
}

export {
  assemblePdf,
  BoundedXRefMock,
  buildGetDocumentParams,
  buildTextPdf,
  buildVerticalTextPdf,
  CMAP_URL,
  createIdFactory,
  createSoundDict,
  DefaultBinaryDataFactory,
  DefaultFileReaderFactory,
  fetchBuiltInCMapHelper,
  getCrossOriginHostname,
  ICC_URL,
  STANDARD_FONT_DATA_URL,
  TEST_PDFS_PATH,
  TestPdfsServer,
  WASM_URL,
  XRefMock,
};
