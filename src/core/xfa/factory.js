/* Copyright 2021 Mozilla Foundation
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

import { $globalData, $toHTML } from "./xfa_object.js";
import { Binder } from "./bind.js";
import { DataHandler } from "./data.js";
import { FontFinder } from "./fonts.js";
import { stripQuotes } from "./utils.js";
import { warn } from "../../shared/util.js";
import { XFAParser } from "./parser.js";

class XFAFactory {
  constructor(data) {
    try {
      this.root = new XFAParser().parse(XFAFactory._createDocument(data));
      const binder = new Binder(this.root);
      this.form = binder.bind();
      this.dataHandler = new DataHandler(this.root, binder.getData());
      this.form[$globalData].template = this.form;
    } catch (e) {
      warn(`XFA - an error occured during parsing and binding: ${e}`);
    }
  }

  isValid() {
    return this.root && this.form;
  }

  _createPages() {
    try {
      this.pages = this.form[$toHTML]();
      this.dims = this.pages.children.map(c => {
        const { width, height } = c.attributes.style;
        return [0, 0, parseInt(width), parseInt(height)];
      });
    } catch (e) {
      warn(`XFA - an error occured during layout: ${e}`);
    }
  }

  getBoundingBox(pageIndex) {
    return this.dims[pageIndex];
  }

  get numberPages() {
    if (!this.pages) {
      this._createPages();
    }
    return this.dims.length;
  }

  setFonts(fonts) {
    this.form[$globalData].fontFinder = new FontFinder(fonts);
    const missingFonts = [];
    for (let typeface of this.form[$globalData].usedTypefaces) {
      typeface = stripQuotes(typeface);
      const font = this.form[$globalData].fontFinder.find(typeface);
      if (!font) {
        missingFonts.push(typeface);
      }
    }

    if (missingFonts.length > 0) {
      return missingFonts;
    }

    return null;
  }

  appendFonts(fonts) {
    this.form[$globalData].fontFinder.add(fonts);
  }

  getPages() {
    if (!this.pages) {
      this._createPages();
    }
    const pages = this.pages;
    this.pages = null;
    return pages;
  }

  serializeData(storage) {
    return this.dataHandler.serialize(storage);
  }

  static _createDocument(data) {
    if (!data["/xdp:xdp"]) {
      return data["xdp:xdp"];
    }
    return Object.values(data).join("");
  }
}

export { XFAFactory };
