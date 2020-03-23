/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.buildGetDocumentParams = buildGetDocumentParams;
exports.createIdFactory = createIdFactory;
exports.TEST_PDFS_PATH = exports.XRefMock = exports.NodeCMapReaderFactory = exports.NodeCanvasFactory = exports.NodeFileReaderFactory = exports.DOMFileReaderFactory = void 0;

var _util = require("../../shared/util.js");

var _is_node = require("../../shared/is_node.js");

var _primitives = require("../../core/primitives.js");

var _document = require("../../core/document.js");

class DOMFileReaderFactory {
  static async fetch(params) {
    const response = await fetch(params.path);

    if (!response.ok) {
      throw new Error(response.statusText);
    }

    return new Uint8Array((await response.arrayBuffer()));
  }

}

exports.DOMFileReaderFactory = DOMFileReaderFactory;

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

exports.NodeFileReaderFactory = NodeFileReaderFactory;
const TEST_PDFS_PATH = {
  dom: "../pdfs/",
  node: "./test/pdfs/"
};
exports.TEST_PDFS_PATH = TEST_PDFS_PATH;

function buildGetDocumentParams(filename, options) {
  const params = Object.create(null);

  if (_is_node.isNodeJS) {
    params.url = TEST_PDFS_PATH.node + filename;
  } else {
    params.url = new URL(TEST_PDFS_PATH.dom + filename, window.location).href;
  }

  for (const option in options) {
    params[option] = options[option];
  }

  return params;
}

class NodeCanvasFactory {
  create(width, height) {
    (0, _util.assert)(width > 0 && height > 0, "Invalid canvas size");

    const Canvas = require("canvas");

    const canvas = Canvas.createCanvas(width, height);
    return {
      canvas,
      context: canvas.getContext("2d")
    };
  }

  reset(canvasAndContext, width, height) {
    (0, _util.assert)(canvasAndContext.canvas, "Canvas is not specified");
    (0, _util.assert)(width > 0 && height > 0, "Invalid canvas size");
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext) {
    (0, _util.assert)(canvasAndContext.canvas, "Canvas is not specified");
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }

}

exports.NodeCanvasFactory = NodeCanvasFactory;

class NodeCMapReaderFactory {
  constructor({
    baseUrl = null,
    isCompressed = false
  }) {
    this.baseUrl = baseUrl;
    this.isCompressed = isCompressed;
  }

  async fetch({
    name
  }) {
    if (!this.baseUrl) {
      throw new Error('The CMap "baseUrl" parameter must be specified, ensure that ' + 'the "cMapUrl" and "cMapPacked" API parameters are provided.');
    }

    if (!name) {
      throw new Error("CMap name must be specified.");
    }

    const url = this.baseUrl + name + (this.isCompressed ? ".bcmap" : "");
    const compressionType = this.isCompressed ? _util.CMapCompressionType.BINARY : _util.CMapCompressionType.NONE;
    return new Promise((resolve, reject) => {
      const fs = require("fs");

      fs.readFile(url, (error, data) => {
        if (error || !data) {
          reject(new Error(error));
          return;
        }

        resolve({
          cMapData: new Uint8Array(data),
          compressionType
        });
      });
    }).catch(reason => {
      throw new Error(`Unable to load ${this.isCompressed ? "binary " : ""}` + `CMap at: ${url}`);
    });
  }

}

exports.NodeCMapReaderFactory = NodeCMapReaderFactory;

class XRefMock {
  constructor(array) {
    this._map = Object.create(null);

    for (const key in array) {
      const obj = array[key];
      this._map[obj.ref.toString()] = obj.data;
    }
  }

  fetch(ref) {
    return this._map[ref.toString()];
  }

  fetchAsync(ref) {
    return Promise.resolve(this.fetch(ref));
  }

  fetchIfRef(obj) {
    if (!(0, _primitives.isRef)(obj)) {
      return obj;
    }

    return this.fetch(obj);
  }

  fetchIfRefAsync(obj) {
    return Promise.resolve(this.fetchIfRef(obj));
  }

}

exports.XRefMock = XRefMock;

function createIdFactory(pageIndex) {
  const page = new _document.Page({
    pdfManager: {
      get docId() {
        return "d0";
      }

    },
    pageIndex
  });
  return page.idFactory;
}