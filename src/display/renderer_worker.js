/* Copyright 2026 Mozilla Foundation
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

import { isNodeJS, setVerbosityLevel } from "../shared/util.js";
import { FontLoader } from "./font_loader.js";
import { MessageHandler } from "../shared/message_handler.js";
import { ObjectHandler } from "./object_handler.js";
import { PDFObjects } from "./pdf_objects.js";

class RendererMessageHandler {
  static #cleanedPages = new Set();

  static #commonObjs = new PDFObjects();

  static #fontLoader = new FontLoader({
    ownerDocument: globalThis,
  });

  static #objsMap = new Map();

  static {
    // Worker thread (and not Node.js)?
    if (
      typeof window === "undefined" &&
      !isNodeJS &&
      typeof self !== "undefined" &&
      /* isMessagePort = */
      typeof self.postMessage === "function" &&
      "onmessage" in self
    ) {
      this.#initializeFromPort(self);
    }
  }

  static #getPageObjs(pageId) {
    let objs = this.#objsMap.get(pageId);
    if (!objs) {
      objs = new PDFObjects();
      this.#objsMap.set(pageId, objs);
    }
    return objs;
  }

  // Object ids contain the id of the page they were parsed from
  // (`createObjId` in src/core/document.js), which are always stable unlike
  // the page index, when pages are moved or copied.
  static #getObjPageId(id, fallbackPageId) {
    const objIdPattern = /^(?:img|mask|pattern)_p(\d+)_\d+$/;
    const match = objIdPattern.exec(id);
    return match ? parseInt(match[1], 10) : fallbackPageId;
  }

  static #cleanupPage(pageId) {
    this.#cleanedPages.add(pageId);
    this.#objsMap.get(pageId)?.clear();
    this.#objsMap.delete(pageId);
  }

  static #setupObjectHandler(handler) {
    const objectHandler = new ObjectHandler({
      messageHandler: handler,
      commonObjs: this.#commonObjs,
      fontLoader: this.#fontLoader,
      pageCache: this.#objsMap,
      shouldCreatePageObjs: true,
    });

    handler.on("commonobj", ([id, type, exportedData]) => {
      if (this.#commonObjs.has(id)) {
        return null;
      }
      return objectHandler.resolveCommonObject(id, type, exportedData);
    });

    handler.on("obj", ([id, pageIndex, type, imageData]) => {
      const pageId = this.#getObjPageId(id, pageIndex);
      // The page may have been cleaned up before this message was processed;
      // drop the data and release any `ImageBitmap` instead of resurrecting
      // an empty object bag for a dead page.
      if (this.#cleanedPages.has(pageId)) {
        imageData?.bitmap?.close();
        return;
      }
      objectHandler.resolveObject(id, pageId, type, imageData);
    });

    handler.on("objFailed", ({ id, pageIndex, reason }) => {
      const error = new Error(reason);
      if (pageIndex === null) {
        this.#commonObjs.reject(id, error);
        return;
      }
      const pageId = this.#getObjPageId(id, pageIndex);
      if (this.#cleanedPages.has(pageId)) {
        return;
      }
      this.#getPageObjs(pageId).reject(id, error);
    });
  }

  static #setup(handler) {
    let testMessageProcessed = false;
    handler.on("test", data => {
      if (testMessageProcessed) {
        return;
      }
      testMessageProcessed = true;

      // Ensure that `TypedArray`s can be sent to the worker.
      handler.send("test", data instanceof Uint8Array);
    });

    handler.on("configure", data => {
      setVerbosityLevel(data.verbosity);
    });

    this.#setupObjectHandler(handler);

    handler.on("cleanupPage", ({ pageId }) => {
      this.#cleanupPage(pageId);
    });

    handler.on("restorePage", ({ pageId }) => {
      this.#cleanedPages.delete(pageId);
    });

    // Mirrors the document-level cleanup the main thread performs in
    // `WorkerTransport.startCleanup`; without this the worker's copies of
    // `commonObjs`/`fontLoader` would outlive their main-thread counterparts.
    handler.on("Cleanup", ({ keepLoadedFonts }) => {
      this.#commonObjs.clear();
      if (!keepLoadedFonts) {
        this.#fontLoader.clear();
      }
    });
  }

  static #initializeFromPort(port) {
    const handler = new MessageHandler("renderer", "main", port);
    this.#setup(handler);
    handler.send("ready", null);
  }
}

export { RendererMessageHandler };
