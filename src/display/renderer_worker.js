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

import {
  CanvasBBoxTracker,
  CanvasDependencyTracker,
  CanvasImagesTracker,
} from "./canvas_dependency_tracker.js";
import { isNodeJS, setVerbosityLevel } from "../shared/util.js";
import { CanvasGraphics } from "./canvas.js";
import { FontLoader } from "./font_loader.js";
import { initGPU } from "./webgpu.js";
import { MessageHandler } from "../shared/message_handler.js";
import { ObjectHandler } from "./object_handler.js";
import { OffscreenCanvasFactory } from "./canvas_factory.js";
import { OptionalContentConfig } from "./optional_content_config.js";
import { PDFObjects } from "./pdf_objects.js";
import { WorkerFilterFactory } from "./filter_factory.js";

class RendererMessageHandler {
  static #commonObjs = new PDFObjects();

  static #objsMap = new Map();

  static #renderTaskStates = new Map();

  // Holds references to `OffscreenCanvas` instances transferred from the
  // main thread. This is used to preserve the placeholder `<canvas>` bitmap
  // across page cleanup (e.g. during scrolling/idle cleanup in the viewer).
  static #canvasMap = new Map();

  static #cleanedPages = new Set();

  static #fontLoader = new FontLoader({
    ownerDocument: globalThis,
  });

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
      this.initializeFromPort(self);
    }
  }

  static initializeFromPort(port) {
    const handler = new MessageHandler("renderer", "main", port);
    this.setup(handler);
    handler.send("ready", null);
  }

  static #getPageObjs(pageIndex) {
    let objs = this.#objsMap.get(pageIndex);
    if (!objs) {
      objs = new PDFObjects();
      this.#objsMap.set(pageIndex, objs);
    }
    return objs;
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

  static #cleanupPage(pageIndex, keepCanvas = false) {
    this.#cleanedPages.add(pageIndex);
    this.#objsMap.delete(pageIndex);
    for (const [renderTaskId, renderTaskState] of this.#renderTaskStates) {
      if (renderTaskState.pageIndex === pageIndex) {
        this.#cleanupRenderTask(renderTaskId);
      }
    }
    if (!keepCanvas) {
      this.#canvasMap.delete(pageIndex);
    }
  }

  static #appendOperatorList(renderTaskState, fnArray, argsArray, lastChunk) {
    const { operatorList } = renderTaskState;
    if (fnArray) {
      operatorList.fnArray.push(...fnArray);
      operatorList.argsArray.push(...argsArray);
    }
    operatorList.lastChunk = lastChunk;
    renderTaskState.gfx.dependencyTracker?.growOperationsCount(
      operatorList.fnArray.length
    );
  }

  static async #executeOperatorList(renderTaskState, operationsFilter) {
    const { operatorList, gfx } = renderTaskState;
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
      // The page may have been cleaned up before this message was processed;
      // drop the data and release any `ImageBitmap` instead of resurrecting
      // an empty object bag for a dead page.
      if (this.#cleanedPages.has(pageIndex)) {
        imageData?.bitmap?.close();
        return;
      }
      objectHandler.resolveObject(id, pageIndex, type, imageData);
    });

    handler.on("objFailed", ({ id, pageIndex, reason }) => {
      const error = new Error(reason);
      if (pageIndex === null) {
        this.#commonObjs.reject(id, error);
        return;
      }
      if (this.#cleanedPages.has(pageIndex)) {
        return;
      }
      this.#getPageObjs(pageIndex).reject(id, error);
    });
  }

  static setup(handler) {
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

    handler.on("cleanupPage", ({ pageIndex, keepCanvas }) => {
      this.#cleanupPage(pageIndex, keepCanvas);
    });

    handler.on("restorePage", ({ pageIndex }) => {
      this.#cleanedPages.delete(pageIndex);
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
        canvas,
        pageIndex,
        renderTaskId,
        enableHWA = false,
        enableWebGPU = false,
        annotationCanvasMap,
        transform,
        viewport,
        transparency,
        background,
        recordOperations = false,
        recordImages = false,
      } = data;
      if (enableWebGPU) {
        await initGPU();
      }
      const objs = this.#getPageObjs(pageIndex);
      const optionalContentConfig = OptionalContentConfig.fromSerializable(
        data.optionalContentConfig
      );

      const ctx = canvas.getContext("2d", {
        alpha: false,
        willReadFrequently: !enableHWA,
      });
      const canvasFactory = new OffscreenCanvasFactory({ enableHWA });
      const filterFactory = new WorkerFilterFactory();
      const annotationCanvases = annotationCanvasMap
        ? new Map(annotationCanvasMap)
        : null;
      let bboxTracker = null;
      let dependencyTracker = null;
      let imagesTracker = null;
      if (recordOperations || recordImages) {
        bboxTracker = new CanvasBBoxTracker(canvas, 0);
      }
      if (recordOperations) {
        dependencyTracker = new CanvasDependencyTracker(
          bboxTracker,
          /* recordDebugMetadata = */ false
        );
      }
      if (recordImages) {
        imagesTracker = new CanvasImagesTracker(canvas);
      }

      const gfx = new CanvasGraphics(
        ctx,
        this.#commonObjs,
        objs,
        canvasFactory,
        filterFactory,
        { optionalContentConfig },
        annotationCanvases,
        /* pageColors = */ null,
        dependencyTracker ?? bboxTracker,
        imagesTracker
      );

      gfx.beginDrawing({
        transform,
        viewport,
        transparency,
        background,
      });

      // Keep a strong reference to the OffscreenCanvas so the placeholder
      // `<canvas>` can continue to display the last rendered output after
      // `cleanupPage` (when `keepCanvas` is true).
      this.#canvasMap.set(pageIndex, canvas);

      this.#renderTaskStates.set(renderTaskId, {
        pageIndex,
        gfx,
        operatorList: {
          fnArray: [],
          argsArray: [],
          lastChunk: false,
        },
        operatorListIdx: 0,
        continueResolve: null,
        aborted: false,
      });
    });

    handler.on("UpdateAnnotationCanvases", data => {
      const { renderTaskId, annotationCanvasMap } = data;
      if (!annotationCanvasMap) {
        return;
      }
      const renderTaskState = this.#renderTaskStates.get(renderTaskId);
      if (!renderTaskState || !renderTaskState.gfx.annotationCanvasMap) {
        return;
      }
      for (const [id, canvas] of annotationCanvasMap) {
        renderTaskState.gfx.annotationCanvasMap.set(id, canvas);
      }
    });

    handler.on("ExecuteOperatorList", async data => {
      const {
        renderTaskId,
        fnArray,
        argsArray,
        operatorListIdx,
        operationsFilter,
        lastChunk,
      } = data;
      const renderTaskState = this.#renderTaskStates.get(renderTaskId);
      if (!renderTaskState) {
        // A render task can be cleaned up before queued
        // ExecuteOperatorList messages for that task are processed.
        return { operatorListIdx };
      }

      renderTaskState.operatorListIdx = operatorListIdx;
      this.#appendOperatorList(renderTaskState, fnArray, argsArray, lastChunk);

      const currentOperatorListIdx = await this.#executeOperatorList(
        renderTaskState,
        operationsFilter
      );

      let recordedBBoxesBuffer = null;
      let imageCoordinates = null;
      if (
        renderTaskState.operatorList.lastChunk &&
        currentOperatorListIdx === renderTaskState.operatorList.argsArray.length
      ) {
        const reader = renderTaskState.gfx.dependencyTracker?.take();
        recordedBBoxesBuffer = reader?.buffer;
        const images = renderTaskState.gfx.imagesTracker?.take();
        imageCoordinates = images || null;
        this.#cleanupRenderTask(renderTaskId);
      }
      return {
        operatorListIdx: currentOperatorListIdx,
        recordedBBoxesBuffer,
        imageCoordinates,
      };
    });
  }
}

export { RendererMessageHandler };
