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

import { assert, isNodeJS } from "../../src/shared/util.js";
import {
  fetchData as fetchDataNode,
  NodeCMapReaderFactory,
  NodeStandardFontDataFactory,
} from "../../src/display/node_utils.js";
import { NullStream, StringStream } from "../../src/core/stream.js";
import { Page, PDFDocument } from "../../src/core/document.js";
import { DOMCMapReaderFactory } from "../../src/display/cmap_reader_factory.js";
import { DOMStandardFontDataFactory } from "../../src/display/standard_fontdata_factory.js";
import { fetchData as fetchDataDOM } from "../../src/display/display_utils.js";
import { Ref } from "../../src/core/primitives.js";

const TEST_PDFS_PATH = isNodeJS ? "./test/pdfs/" : "../pdfs/";

const CMAP_URL = isNodeJS ? "./external/bcmaps/" : "../../external/bcmaps/";

const STANDARD_FONT_DATA_URL = isNodeJS
  ? "./external/standard_fonts/"
  : "../../external/standard_fonts/";

const WASM_URL = isNodeJS ? "./external/openjpeg/" : "../../external/openjpeg/";

class DefaultFileReaderFactory {
  static async fetch(params) {
    if (isNodeJS) {
      return fetchDataNode(params.path);
    }
    const data = await fetchDataDOM(params.path, /* type = */ "arraybuffer");
    return new Uint8Array(data);
  }
}

const DefaultCMapReaderFactory =
  typeof PDFJSDev !== "undefined" && PDFJSDev.test("GENERIC") && isNodeJS
    ? NodeCMapReaderFactory
    : DOMCMapReaderFactory;

const DefaultStandardFontDataFactory =
  typeof PDFJSDev !== "undefined" && PDFJSDev.test("GENERIC") && isNodeJS
    ? NodeStandardFontDataFactory
    : DOMStandardFontDataFactory;

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
  constructor(array) {
    this._map = Object.create(null);
    this._newTemporaryRefNum = null;
    this._newPersistentRefNum = null;
    this.stream = new NullStream();

    for (const key in array) {
      const obj = array[key];
      this._map[obj.ref.toString()] = obj.data;
    }
  }

  getNewPersistentRef(obj) {
    if (this._newPersistentRefNum === null) {
      this._newPersistentRefNum = Object.keys(this._map).length || 1;
    }
    const ref = Ref.get(this._newPersistentRefNum++, 0);
    this._map[ref.toString()] = obj;
    return ref;
  }

  getNewTemporaryRef() {
    if (this._newTemporaryRefNum === null) {
      this._newTemporaryRefNum = Object.keys(this._map).length || 1;
    }
    return Ref.get(this._newTemporaryRefNum++, 0);
  }

  resetNewTemporaryRef() {
    this._newTemporaryRefNum = null;
  }

  fetch(ref) {
    return this._map[ref.toString()];
  }

  async fetchAsync(ref) {
    return this.fetch(ref);
  }

  fetchIfRef(obj) {
    if (obj instanceof Ref) {
      return this.fetch(obj);
    }
    return obj;
  }

  async fetchIfRefAsync(obj) {
    return this.fetchIfRef(obj);
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
  buildGetDocumentParams,
  CMAP_URL,
  createIdFactory,
  DefaultCMapReaderFactory,
  DefaultFileReaderFactory,
  DefaultStandardFontDataFactory,
  getCrossOriginHostname,
  STANDARD_FONT_DATA_URL,
  TEST_PDFS_PATH,
  TestPdfsServer,
  XRefMock,
};
