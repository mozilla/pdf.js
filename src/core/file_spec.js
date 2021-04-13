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

import { isDict, isStream } from "./primitives.js";
import { stringToPDFString, warn } from "../shared/util.js";

function pickPlatformItem(dict) {
  // Look for the filename in this order:
  // UF, F, Unix, Mac, DOS
  if (dict.has("UF")) {
    return dict.get("UF");
  } else if (dict.has("F")) {
    return dict.get("F");
  } else if (dict.has("Unix")) {
    return dict.get("Unix");
  } else if (dict.has("Mac")) {
    return dict.get("Mac");
  } else if (dict.has("DOS")) {
    return dict.get("DOS");
  }
  return null;
}

/**
 * "A PDF file can refer to the contents of another file by using a File
 * Specification (PDF 1.1)", see the spec (7.11) for more details.
 * NOTE: Only embedded files are supported (as part of the attachments support)
 * TODO: support the 'URL' file system (with caching if !/V), portable
 * collections attributes and related files (/RF)
 */
class FileSpec {
  constructor(root, xref) {
    if (!root || !isDict(root)) {
      return;
    }
    this.xref = xref;
    this.root = root;
    if (root.has("FS")) {
      this.fs = root.get("FS");
    }
    this.description = root.has("Desc")
      ? stringToPDFString(root.get("Desc"))
      : "";
    if (root.has("RF")) {
      warn("Related file specifications are not supported");
    }
    this.contentAvailable = true;
    if (!root.has("EF")) {
      this.contentAvailable = false;
      warn("Non-embedded file specifications are not supported");
    }
  }

  get filename() {
    if (!this._filename && this.root) {
      const filename = pickPlatformItem(this.root) || "unnamed";
      this._filename = stringToPDFString(filename)
        .replace(/\\\\/g, "\\")
        .replace(/\\\//g, "/")
        .replace(/\\/g, "/");
    }
    return this._filename;
  }

  get content() {
    if (!this.contentAvailable) {
      return null;
    }
    if (!this.contentRef && this.root) {
      this.contentRef = pickPlatformItem(this.root.get("EF"));
    }
    let content = null;
    if (this.contentRef) {
      const fileObj = this.xref.fetchIfRef(this.contentRef);
      if (fileObj && isStream(fileObj)) {
        content = fileObj.getBytes();
      } else {
        warn(
          "Embedded file specification points to non-existing/invalid content"
        );
      }
    } else {
      warn("Embedded file specification does not have a content");
    }
    return content;
  }

  get serializable() {
    return {
      filename: this.filename,
      content: this.content,
    };
  }
}

export { FileSpec };
