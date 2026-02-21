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

import { CanvasGraphics } from "./canvas.js";
import { FontLoader } from "./font_loader.js";
import { isNodeJS } from "../shared/util.js";
import { MessageHandler } from "../shared/message_handler.js";
import { ObjectHandler } from "./object_handler.js";
import { OffscreenCanvasFactory } from "./canvas_factory.js";
import { OptionalContentConfig } from "./optional_content_config.js";
import { PDFObjects } from "./pdf_objects.js";
import { WorkerFilterFactory } from "./filter_factory.js";

function createCanvasFactory(data) {
  const { enableHWA = false } = data || {};
  return new OffscreenCanvasFactory({ enableHWA });
}

class RendererMessageHandler {
  static #pdfWorkerHandlers = new Map();

  static #commonObjs = new PDFObjects();

  static #objsMap = new Map();

  static #renderTaskStates = new Map();

  static #fontLoader = new FontLoader({
    ownerDocument: globalThis,
  });

  static {
    // TODO(Aditi): Is this necessary?
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
    renderTaskState.waitCapability?.resolve();
    renderTaskState.waitCapability = null;

    renderTaskState.gfx.endDrawing();
    this.#renderTaskStates.delete(renderTaskId);
  }

  static #cleanupPage(pageIndex) {
    const objs = this.#objsMap.get(pageIndex);
    if (objs) {
      objs.clear();
      this.#objsMap.delete(pageIndex);
    }
    for (const [renderTaskId, renderTaskState] of this.#renderTaskStates) {
      if (renderTaskState.pageIndex === pageIndex) {
        this.#cleanupRenderTask(renderTaskId);
      }
    }
  }

  static #appendOperatorList(renderTaskState, fnArray, argsArray, lastChunk) {
    const { operatorList } = renderTaskState;
    if (Array.isArray(fnArray) && Array.isArray(argsArray)) {
      for (let i = 0, ii = fnArray.length; i < ii; i++) {
        operatorList.fnArray.push(fnArray[i]);
        operatorList.argsArray.push(argsArray[i]);
      }
    }
    operatorList.lastChunk = lastChunk;
  }

  static async #executeOperatorList(renderTaskState, operationsFilter) {
    const { operatorList, gfx } = renderTaskState;
    while (!renderTaskState.aborted) {
      const waitCapability = Promise.withResolvers();
      renderTaskState.waitCapability = waitCapability;
      let continueCalled = false;

      const continueCallback = () => {
        if (!continueCalled) {
          continueCalled = true;
          waitCapability.resolve();
        }
      };

      renderTaskState.operatorListIdx = gfx.executeOperatorList(
        operatorList,
        renderTaskState.operatorListIdx,
        continueCallback,
        undefined,
        typeof operationsFilter === "function" ? operationsFilter : null
      );
      renderTaskState.waitCapability = null;

      if (renderTaskState.operatorListIdx === operatorList.argsArray.length) {
        return renderTaskState.operatorListIdx;
      }
      await waitCapability.promise;
    }
    return renderTaskState.operatorListIdx;
  }

  static #setupObjectHandler(handler) {
    const objectHandler = new ObjectHandler({
      messageHandler: handler,
      commonObjs: this.#commonObjs,
      fontLoader: this.#fontLoader,
      pageCache: this.#objsMap,
      renderInWorker: true,
    });

    handler.on("commonobj", ([id, type, exportedData]) => {
      if (this.#commonObjs.has(id)) {
        return null;
      }
      return objectHandler.resolveCommonObject(id, type, exportedData);
    });

    handler.on("obj", ([id, pageIndex, type, imageData]) => {
      objectHandler.resolveObject(id, pageIndex, type, imageData);
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

    handler.on("SetupWorkerChannel", data => this.setupWorkerChannel(data));
    this.#setupObjectHandler(handler);

    handler.on("cleanupPage", ({ pageIndex }) => {
      this.#cleanupPage(pageIndex);
    });

    handler.on("cleanupRenderTask", ({ renderTaskId }) => {
      this.#cleanupRenderTask(renderTaskId);
    });

    handler.on("InitializeGraphics", data => {
      const {
        canvas,
        pageIndex,
        renderTaskId = pageIndex,
        enableHWA = false,
        optionalContentConfigData,
        optionalContentConfigState,
        optionalContentConfigRenderingIntent,
        transform,
        viewport,
        transparency,
        background,
      } = data;
      const objs = this.#getPageObjs(pageIndex);
      const optionalContentConfig = new OptionalContentConfig(
        optionalContentConfigData,
        optionalContentConfigRenderingIntent
      );

      if (optionalContentConfigState) {
        for (const [id, visible] of optionalContentConfigState) {
          optionalContentConfig.setVisibility(
            id,
            visible,
            /* preserveRB = */ false
          );
        }
      }
      const ctx = canvas.getContext("2d", {
        alpha: false,
        willReadFrequently: !enableHWA,
      });
      const canvasFactory = createCanvasFactory({ enableHWA });
      const filterFactory = new WorkerFilterFactory();
      let annotationCanvasMap = null;
      if (data.annotationCanvasMap) {
        annotationCanvasMap =
          data.annotationCanvasMap instanceof Map
            ? data.annotationCanvasMap
            : new Map(data.annotationCanvasMap);
      }
      const gfx = new CanvasGraphics(
        ctx,
        this.#commonObjs,
        objs,
        canvasFactory,
        filterFactory,
        { optionalContentConfig },
        annotationCanvasMap
        /** Renderer worker doesn't support pageColors and dependencyTracker */
      );

      gfx.beginDrawing({
        transform,
        viewport,
        transparency,
        background,
      });

      this.#cleanupRenderTask(renderTaskId);
      this.#renderTaskStates.set(renderTaskId, {
        pageIndex,
        gfx,
        operatorList: {
          fnArray: [],
          argsArray: [],
          lastChunk: false,
          separateAnnots: null,
        },
        operatorListIdx: 0,
        waitCapability: null,
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
      const map =
        annotationCanvasMap instanceof Map
          ? annotationCanvasMap
          : new Map(annotationCanvasMap);
      for (const [id, canvas] of map) {
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
        // A render task can be cleaned up (e.g. cancellation) before queued
        // ExecuteOperatorList messages for that task are processed.
        return operatorListIdx;
      }

      renderTaskState.operatorListIdx = operatorListIdx;
      this.#appendOperatorList(renderTaskState, fnArray, argsArray, lastChunk);

      const currentOperatorListIdx = await this.#executeOperatorList(
        renderTaskState,
        operationsFilter
      );
      if (
        renderTaskState.operatorList.lastChunk &&
        currentOperatorListIdx === renderTaskState.operatorList.argsArray.length
      ) {
        this.#cleanupRenderTask(renderTaskId);
      }
      return currentOperatorListIdx;
    });

    handler.on("resetCanvas", ({ renderTaskId }) => {
      const task = this.#renderTaskStates.get(renderTaskId);
      if (!task) {
        return;
      }
      task.cleanupRequested = true;

      if (task.ended) {
        task.canvas.width = task.canvas.height = 0;
        this.#renderTaskStates.delete(renderTaskId);
      }
    });
  }

  static setupWorkerChannel({ docId = null, port = null } = {}) {
    if (!port) {
      throw new Error("SetupWorkerChannel - expected a MessagePort.");
    }

    const bridgeId = docId || "default";
    const sourceName = `renderer_worker_${bridgeId}`;
    const targetName = `pdf_worker_${bridgeId}`;

    this.#pdfWorkerHandlers.get(bridgeId)?.destroy();

    const pdfWorkerHandler = new MessageHandler(sourceName, targetName, port);
    this.#pdfWorkerHandlers.set(bridgeId, pdfWorkerHandler);
    this.#setupObjectHandler(pdfWorkerHandler);

    pdfWorkerHandler.send("ready", null);
    return { ok: true, docId: bridgeId };
  }
}

export { RendererMessageHandler };
