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

import { stringToPDFString, warn } from "../shared/util.js";
import { BaseStream } from "./base_stream.js";
import { Dict } from "./primitives.js";

function pickPlatformItem(dict) {
  if (dict instanceof Dict) {
    // Look for the filename in this order: UF, F, Unix, Mac, DOS
    for (const key of ["UF", "F", "Unix", "Mac", "DOS"]) {
      if (dict.has(key)) {
        return dict.get(key);
      }
    }
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

  constructor(root, skipContent = false) {
    if (!(root instanceof Dict)) {
      return;
    }
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
    const item = pickPlatformItem(this.root);
    if (item && typeof item === "string") {
      // NOTE: The following replacement order is INTENTIONAL, regardless of
      //       what some static code analysers (e.g. CodeQL) may claim.
      return stringToPDFString(item, /* keepEscapeSequence = */ true)
        .replaceAll("\\\\", "\\")
        .replaceAll("\\/", "/")
        .replaceAll("\\", "/");
    }
    return "";
  }

  get content() {
    if (!this.#contentAvailable) {
      return null;
    }
    const ef = pickPlatformItem(this.root?.get("EF"));

    if (ef instanceof BaseStream) {
      return ef.getBytes();
    }
    warn("Embedded file specification points to non-existing/invalid content");
    return null;
  }

  get description() {
    const desc = this.root?.get("Desc");
    if (desc && typeof desc === "string") {
      return stringToPDFString(desc);
    }
    return "";
  }

  get serializable() {
    const { filename, content, description } = this;
    return {
      rawFilename: filename,
      filename: stripPath(filename) || "unnamed",
      content,
      description,
    };
  }
}

export { FileSpec };
