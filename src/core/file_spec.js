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

import { shadow, stringToPDFString, warn } from "../shared/util.js";
import { BaseStream } from "./base_stream.js";
import { Dict } from "./primitives.js";

function pickPlatformItem(dict) {
  if (!(dict instanceof Dict)) {
    return null;
  }
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

function stripPath(str) {
  return str.substring(str.lastIndexOf("/") + 1);
}

/**
 * "A PDF file can refer to the contents of another file by using a File
 * Specification (PDF 1.1)", see the spec (7.11) for more details.
 * NOTE: Only embedded files are supported (as part of the attachments support)
 * TODO: support the 'URL' file system (with caching if !/V), portable
 * collections attributes and related files (/RF)
 */
class FileSpec {
  #contentAvailable = false;

  constructor(root, xref, skipContent = false) {
    if (!(root instanceof Dict)) {
      return;
    }
    this.xref = xref;
    this.root = root;
    if (root.has("FS")) {
      this.fs = root.get("FS");
    }
    if (root.has("RF")) {
      warn("Related file specifications are not supported");
    }
    if (!skipContent) {
      if (root.has("EF")) {
        this.#contentAvailable = true;
      } else {
        warn("Non-embedded file specifications are not supported");
      }
    }
  }

  get filename() {
    let filename = "";

    const item = pickPlatformItem(this.root);
    if (item && typeof item === "string") {
      filename = stringToPDFString(item)
        .replaceAll("\\\\", "\\")
        .replaceAll("\\/", "/")
        .replaceAll("\\", "/");
    }
    return shadow(this, "filename", filename || "unnamed");
  }

  get content() {
    if (!this.#contentAvailable) {
      return null;
    }
    this._contentRef ||= pickPlatformItem(this.root?.get("EF"));

    let content = null;
    if (this._contentRef) {
      const fileObj = this.xref.fetchIfRef(this._contentRef);
      if (fileObj instanceof BaseStream) {
        content = fileObj.getBytes();
      } else {
        warn(
          "Embedded file specification points to non-existing/invalid content"
        );
      }
    } else {
      warn("Embedded file specification does not have any content");
    }
    return content;
  }

  get description() {
    let description = "";

    const desc = this.root?.get("Desc");
    if (desc && typeof desc === "string") {
      description = stringToPDFString(desc);
    }
    return shadow(this, "description", description);
  }

  get serializable() {
    return {
      rawFilename: this.filename,
      filename: stripPath(this.filename),
      content: this.content,
      description: this.description,
    };
  }
}

export { FileSpec };
