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

import {
  PasswordException,
  PasswordResponses,
  stripPath,
  warn,
} from "../shared/util.js";
import { BaseStream } from "./base_stream.js";
import { Dict } from "./primitives.js";
import { stringToPDFString } from "./string_utils.js";

/**
 * @import { CatalogAttachmentContent } from "./catalog.js";
 */

/**
 * "A PDF file can refer to the contents of another file by using a File
 * Specification (PDF 1.1)", see the spec (7.11) for more details.
 * NOTE: Only embedded files are supported (as part of the attachments support)
 * TODO: support the 'URL' file system (with caching if !/V), portable
 * collections attributes and related files (/RF)
 */
class FileSpec {
  /**
   * @param {Dict | null | undefined} root
   *   File specification dictionary.
   */
  constructor(root) {
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
  }

  get filename() {
    const item = FileSpec.pickPlatformItem(this.root);
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

  get description() {
    const desc = this.root?.get("Desc");
    if (desc && typeof desc === "string") {
      return stringToPDFString(desc);
    }
    return "";
  }

  get serializable() {
    const { filename, description } = this;
    return {
      rawFilename: filename,
      filename: stripPath(filename) || "unnamed",
      description,
    };
  }

  /**
   * Get a platform-specific item from a file-spec dictionary.
   *
   * Search order follows the PDF platform keys: `UF`, `F`, `Unix`, `Mac`,
   * `DOS`.
   *
   * @param {Dict | null | undefined} dict
   *   Dictionary.
   * @param {boolean} [raw]
   *   Return the raw (possibly indirect) value rather than the resolved one.
   * @returns {unknown}
   *   Matching dictionary value or `null` when no key is found.
   */
  static pickPlatformItem(dict, raw = false) {
    if (dict instanceof Dict) {
      // Look for the filename in this order: UF, F, Unix, Mac, DOS
      for (const key of ["UF", "F", "Unix", "Mac", "DOS"]) {
        if (dict.has(key)) {
          return raw ? dict.getRaw(key) : dict.get(key);
        }
      }
    }
    return null;
  }

  /**
   * Whether a file specification carries an embedded file we can read.
   *
   * @param {Dict} fileSpecDict
   * @returns {boolean}
   */
  static hasEmbeddedFile(fileSpecDict) {
    return this.pickPlatformItem(fileSpecDict.get("EF")) instanceof BaseStream;
  }

  /**
   * Read attachment bytes from a file-spec dictionary.
   *
   * @param {Dict | null | undefined} dict
   *   File-spec dictionary containing an `EF` entry.
   * @returns {CatalogAttachmentContent}
   *   Attachment bytes when available; otherwise `null`.
   * @throws {PasswordException}
   *   When attachment bytes are encrypted and no key is available.
   */
  static readContent(dict) {
    if (!(dict instanceof Dict)) {
      return null;
    }
    const ef = this.pickPlatformItem(dict.get("EF"));
    if (!(ef instanceof BaseStream)) {
      warn(
        "Embedded file specification points to non-existing/invalid content"
      );
      return null;
    }
    return this.readStreamContent(ef);
  }

  /**
   * Read the bytes of an embedded-file stream.
   *
   * @param {BaseStream} stream
   *   Embedded-file stream.
   * @returns {CatalogAttachmentContent}
   *   Attachment bytes.
   * @throws {PasswordException}
   *   When the bytes are encrypted and no key is available.
   */
  static readStreamContent(stream) {
    // Throw if we need a password but don’t have one.
    const encrypt = stream.dict?.xref?.encrypt;
    if (encrypt?.encryptionKey === null) {
      throw new PasswordException(
        "No password given",
        PasswordResponses.NEED_PASSWORD
      );
    }
    return stream.getBytes();
  }
}

export { FileSpec };
