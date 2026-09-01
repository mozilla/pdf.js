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
import { CanvasGraphics } from "./canvas.js";
import { FontLoader } from "./font_loader.js";
import { MessageHandler } from "../shared/message_handler.js";
import { ObjectHandler } from "./object_handler.js";
import { OffscreenCanvasFactory } from "./canvas_factory.js";
import { OptionalContentConfig } from "./optional_content_config.js";
import { PDFObjects } from "./pdf_objects.js";
import { WorkerFilterFactory } from "./filter_factory.js";

class RendererMessageHandler {
  static #cleanedPages = new Set();

  static #commonObjs = new PDFObjects();

  static #fontLoader = new FontLoader({
    ownerDocument: globalThis,
  });

  static #objsMap = new Map();

  static #renderTaskStates = new Map();

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

  static #sendFrame(handler, renderTaskState) {
    const { canvas, renderTaskId } = renderTaskState;
    const bitmap = canvas.transferToImageBitmap();
    handler.send("RenderFrame", { renderTaskId, bitmap }, [bitmap]);
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
    for (const [renderTaskId, renderTaskState] of this.#renderTaskStates) {
      if (renderTaskState.pageId === pageId) {
        this.#cleanupRenderTask(renderTaskId);
      }
    }
  }

  static #cleanupRenderTask(renderTaskId) {
    const renderTaskState = this.#renderTaskStates.get(renderTaskId);
    if (!renderTaskState) {
      return;
    }
    renderTaskState.aborted = true;
    renderTaskState.continueResolve?.();

    renderTaskState.gfx?.endDrawing();
    this.#renderTaskStates.delete(renderTaskId);
  }

  static #appendOperatorList(
    renderTaskState,
    fnArray,
    argsArray,
    operationsFilterMask,
    lastChunk
  ) {
    const { operatorList } = renderTaskState;
    if (fnArray) {
      for (let i = 0, ii = fnArray.length; i < ii; i++) {
        operatorList.fnArray.push(fnArray[i]);
        operatorList.argsArray.push(argsArray[i]);
      }
      if (operationsFilterMask) {
        const mask = (renderTaskState.operationsFilterMask ||= []);
        for (let i = 0, ii = operationsFilterMask.length; i < ii; i++) {
          mask.push(operationsFilterMask[i]);
        }
      }
    }
    operatorList.lastChunk = lastChunk;
  }

  // `renderTaskState.gfx` is always non-null here: the main thread awaits the
  // `InitializeGraphics` reply, which assigns it, before sending
  // `ExecuteOperatorList`.
  static async #executeOperatorList(renderTaskState) {
    const { operatorList, gfx, operationsFilterMask } = renderTaskState;
    const operationsFilter = operationsFilterMask
      ? i => operationsFilterMask[i]
      : null;
    while (!renderTaskState.aborted) {
      const { promise, resolve, reject } = Promise.withResolvers();
      renderTaskState.continueResolve = resolve;

      renderTaskState.operatorListIdx = gfx.executeOperatorList(
        operatorList,
        renderTaskState.operatorListIdx,
        resolve,
        reject,
        undefined, // Renderer does not support stepper yet.
        operationsFilter
      );

      if (renderTaskState.operatorListIdx === operatorList.argsArray.length) {
        return renderTaskState.operatorListIdx;
      }
      await promise;
    }
    return renderTaskState.operatorListIdx;
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

    handler.on("CleanupRenderTask", ({ renderTaskId }) => {
      this.#cleanupRenderTask(renderTaskId);
    });

    handler.on("InitializeGraphics", async data => {
      const {
        width,
        height,
        pageId,
        renderTaskId,
        enableHWA = false,
        transform,
        viewport,
        transparency,
        background,
      } = data;
      const canvas = new OffscreenCanvas(width, height);
      const renderTaskState = {
        pageId,
        renderTaskId,
        canvas,
        gfx: null,
        operatorList: {
          fnArray: [],
          argsArray: [],
          lastChunk: false,
          pathCache: null,
        },
        operatorListIdx: 0,
        operationsFilterMask: null,
        continueResolve: null,
        aborted: false,
      };
      this.#renderTaskStates.set(renderTaskId, renderTaskState);

      try {
        const objs = this.#getPageObjs(pageId);
        const optionalContentConfig = OptionalContentConfig.fromSerializable(
          data.optionalContentConfig
        );

        const ctx = canvas.getContext("2d", {
          alpha: false,
          willReadFrequently: !enableHWA,
        });
        const canvasFactory = new OffscreenCanvasFactory({ enableHWA });
        const filterFactory = new WorkerFilterFactory();

        // Annotation canvases and operation recording are not supported yet;
        // `pageColors` requires DOM-based SVG filters, so pages that need it
        // never render in the worker.
        const gfx = new CanvasGraphics(
          ctx,
          this.#commonObjs,
          objs,
          canvasFactory,
          filterFactory,
          { optionalContentConfig },
          /* annotationCanvasMap = */ null,
          /* pageColors = */ null,
          /* dependencyTracker = */ null,
          /* imagesTracker = */ null
        );

        gfx.beginDrawing({
          transform,
          viewport,
          transparency,
          background,
        });

        renderTaskState.gfx = gfx;
      } catch (ex) {
        this.#cleanupRenderTask(renderTaskId);
        throw ex;
      }
    });

    handler.on("ExecuteOperatorList", async data => {
      const {
        renderTaskId,
        fnArray,
        argsArray,
        operatorListIdx,
        operationsFilterMask,
        lastChunk,
      } = data;
      const renderTaskState = this.#renderTaskStates.get(renderTaskId);
      if (!renderTaskState) {
        // A render task can be cleaned up before queued
        // ExecuteOperatorList messages for that task are processed.
        return { operatorListIdx };
      }

      renderTaskState.operatorListIdx = operatorListIdx;
      this.#appendOperatorList(
        renderTaskState,
        fnArray,
        argsArray,
        operationsFilterMask,
        lastChunk
      );

      const currentOperatorListIdx =
        await this.#executeOperatorList(renderTaskState);

      if (
        renderTaskState.operatorList.lastChunk &&
        currentOperatorListIdx === renderTaskState.operatorList.argsArray.length
      ) {
        const aborted = renderTaskState.aborted;
        // `endDrawing` applies the final filter, so snapshot after it. The
        // frame is sent before this reply, so the main thread has drawn the
        // canvas by the time the render task reports completion.
        this.#cleanupRenderTask(renderTaskId);
        if (!aborted) {
          this.#sendFrame(handler, renderTaskState);
        }
      }
      return { operatorListIdx: currentOperatorListIdx };
    });
  }

  static #initializeFromPort(port) {
    const handler = new MessageHandler("renderer", "main", port);
    this.#setup(handler);
    handler.send("ready", null);
  }
}

export { RendererMessageHandler };
