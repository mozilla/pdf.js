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

import { NullStream, StringStream } from "../../src/core/stream.js";
import { Page, PDFDocument } from "../../src/core/document.js";
import { isNodeJS } from "../../src/shared/util.js";
import { Ref } from "../../src/core/primitives.js";

const TEST_PDFS_PATH = isNodeJS ? "./test/pdfs/" : "../pdfs/";

const CMAP_URL = isNodeJS ? "./external/bcmaps/" : "../../external/bcmaps/";

const STANDARD_FONT_DATA_URL = isNodeJS
  ? "./external/standard_fonts/"
  : "../../external/standard_fonts/";

class DOMFileReaderFactory {
  static async fetch(params) {
    const response = await fetch(params.path);
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
}

class NodeFileReaderFactory {
  static async fetch(params) {
    const fs = require("fs");

    return new Promise((resolve, reject) => {
      fs.readFile(params.path, (error, data) => {
        if (error || !data) {
          reject(error || new Error(`Empty file for: ${params.path}`));
          return;
        }
        resolve(new Uint8Array(data));
      });
    });
  }
}

const DefaultFileReaderFactory = isNodeJS
  ? NodeFileReaderFactory
  : DOMFileReaderFactory;

function buildGetDocumentParams(filename, options) {
  const params = Object.create(null);
  params.url = isNodeJS
    ? TEST_PDFS_PATH + filename
    : new URL(TEST_PDFS_PATH + filename, window.location).href;
  params.standardFontDataUrl = STANDARD_FONT_DATA_URL;

  for (const option in options) {
    params[option] = options[option];
  }
  return params;
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

export {
  buildGetDocumentParams,
  CMAP_URL,
  createIdFactory,
  DefaultFileReaderFactory,
  STANDARD_FONT_DATA_URL,
  TEST_PDFS_PATH,
  XRefMock,
};
