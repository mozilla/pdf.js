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

import { isRef, Ref } from "../../src/core/primitives.js";
import { Page, PDFDocument } from "../../src/core/document.js";
import { assert } from "../../src/shared/util.js";
import { isNodeJS } from "../../src/shared/is_node.js";
import { StringStream } from "../../src/core/stream.js";

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

const TEST_PDFS_PATH = {
  dom: "../pdfs/",
  node: "./test/pdfs/",
};

function buildGetDocumentParams(filename, options) {
  const params = Object.create(null);
  if (isNodeJS) {
    params.url = TEST_PDFS_PATH.node + filename;
  } else {
    params.url = new URL(TEST_PDFS_PATH.dom + filename, window.location).href;
  }
  for (const option in options) {
    params[option] = options[option];
  }
  return params;
}

class XRefMock {
  constructor(array) {
    this._map = Object.create(null);
    this.stats = {
      streamTypes: Object.create(null),
      fontTypes: Object.create(null),
    };
    this._newRefNum = null;

    for (const key in array) {
      const obj = array[key];
      this._map[obj.ref.toString()] = obj.data;
    }
  }

  getNewRef() {
    if (this._newRefNum === null) {
      this._newRefNum = Object.keys(this._map).length;
    }
    return Ref.get(this._newRefNum++, 0);
  }

  resetNewRef() {
    this.newRef = null;
  }

  fetch(ref) {
    return this._map[ref.toString()];
  }

  fetchAsync(ref) {
    return Promise.resolve(this.fetch(ref));
  }

  fetchIfRef(obj) {
    if (!isRef(obj)) {
      return obj;
    }
    return this.fetch(obj);
  }

  fetchIfRefAsync(obj) {
    return Promise.resolve(this.fetchIfRef(obj));
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

function isEmptyObj(obj) {
  assert(
    typeof obj === "object" && obj !== null,
    "isEmptyObj - invalid argument."
  );
  return Object.keys(obj).length === 0;
}

export {
  DOMFileReaderFactory,
  NodeFileReaderFactory,
  XRefMock,
  buildGetDocumentParams,
  TEST_PDFS_PATH,
  createIdFactory,
  isEmptyObj,
};
