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

import { FeatureTest, getVerbosityLevel, warn } from "../shared/util.js";
import { BBoxReader } from "./canvas_dependency_tracker.js";
import { getWorkerSrc } from "./api_utils.js";
import { GlobalWorkerOptions } from "./worker_options.js";
import { MessageHandler } from "../shared/message_handler.js";
import { OutputScale } from "./display_utils.js";
import { setAnnotationCanvasName } from "./canvas.js";

function closeFrame({ bitmap, annotationBitmaps }) {
  bitmap?.close();
  if (annotationBitmaps) {
    for (const [, , annotationBitmap] of annotationBitmaps) {
      annotationBitmap.close();
    }
  }
}

/**
 * Renders through the worker and draws returned frames.
 */
class WorkerRenderTask {
  #annotationCanvasMap;

  #cancelled = false;

  #canvas;

  #canvasFactory;

  #filteredLength = 0;

  #id;

  #initParams;

  #onError;

  #onFrame;

  #operatorListState;

  #rendererWorker;

  #renderTasks;

  imageCoordinates = null;

  recordedBBoxes = null;

  constructor({
    rendererWorker,
    renderTasks,
    canvas,
    canvasFactory,
    annotationCanvasMap,
    operatorListState,
    initParams,
    onFrame,
    onError,
  }) {
    this.#rendererWorker = rendererWorker;
    this.#renderTasks = renderTasks;
    this.#canvas = canvas;
    this.#canvasFactory = canvasFactory;
    this.#annotationCanvasMap = annotationCanvasMap;
    this.#operatorListState = operatorListState;
    this.#initParams = initParams;
    this.#id = initParams.renderTaskId;
    this.#onFrame = onFrame;
    this.#onError = onError;
  }

  /**
   * @returns {Promise<boolean>} False to use main-thread rendering.
   */
  async initialize(transparency, optionalContentConfig) {
    try {
      await this.#rendererWorker.promise;
    } catch {
      return false;
    }
    if (!this.#rendererWorker.messageHandler || this.#cancelled) {
      return false;
    }
    try {
      await this.#rendererWorker.sendWithPromise("InitializeGraphics", {
        ...this.#initParams,
        width: this.#canvas.width,
        height: this.#canvas.height,
        transparency,
        optionalContentConfig: optionalContentConfig.serializable,
      });
    } catch (ex) {
      if (!this.#cancelled) {
        warn(
          `Failed to initialize graphics in renderer worker: ${ex.message}. ` +
            "Falling back to main-thread rendering."
        );
      }
      return false;
    }
    if (!this.#cancelled) {
      this.#renderTasks.set(this.#id, this);
    }
    return true;
  }

  /**
   * @returns {Promise<number>} The next operator index.
   */
  async executeOperatorList(operatorList, operatorListIdx, operationsFilter) {
    const handler = this.#rendererWorker.messageHandler;
    if (!handler) {
      throw new Error("Renderer worker was destroyed during rendering.");
    }
    const { lastChunk } = operatorList;
    const end = operatorList.argsArray.length;
    const operatorListState = this.#operatorListState;

    // Send only operators not yet sent for this list.
    if (operatorListState.sentLength < end) {
      const start = operatorListState.sentLength;
      handler.send("AppendOperatorList", {
        pageProxyId: this.#initParams.pageProxyId,
        operatorListId: operatorListState.id,
        fnArray: operatorList.fnArray.slice(start, end),
        argsArray: operatorList.argsArray.slice(start, end),
      });
      operatorListState.sentLength = end;
    }

    let operationsFilterMask = null;
    if (operationsFilter && this.#filteredLength < end) {
      // Send filter results because functions cannot be cloned.
      const start = this.#filteredLength;
      operationsFilterMask = new Uint8Array(end - start);
      for (let i = start; i < end; i++) {
        operationsFilterMask[i - start] = operationsFilter(i, operatorList)
          ? 1
          : 0;
      }
      this.#filteredLength = end;
    }
    const response = await this.#rendererWorker
      .sendWithPromise("ExecuteOperatorList", {
        renderTaskId: this.#id,
        operatorListIdx,
        operatorListLength: end,
        operationsFilterMask,
        lastChunk,
      })
      .catch(reason => {
        if (!this.#cancelled) {
          throw reason;
        }
        return { operatorListIdx, aborted: true };
      });

    if (response.aborted && !this.#cancelled) {
      throw new Error("Render task was aborted in the renderer worker.");
    }
    if (lastChunk && response.operatorListIdx === end) {
      this.#renderTasks.delete(this.#id);

      const { recordedBBoxesBuffer, imageCoordinates } = response;
      if (recordedBBoxesBuffer) {
        this.recordedBBoxes = BBoxReader.fromBuffer(recordedBBoxesBuffer);
      }
      this.imageCoordinates = imageCoordinates ?? null;
    }
    return response.operatorListIdx;
  }

  cancel() {
    this.#cancelled = true;
    this.#renderTasks.delete(this.#id);

    this.#rendererWorker.messageHandler?.send("CleanupRenderTask", {
      renderTaskId: this.#id,
    });
  }

  drawFrame(frame) {
    try {
      if (frame.bitmap) {
        const ctx = this.#canvasFactory.getNoAlphaContext(this.#canvas);
        ctx.drawImage(frame.bitmap, 0, 0);
      }

      if (frame.annotationBitmaps) {
        this.#drawAnnotationCanvases(frame.annotationBitmaps);
      }
    } catch (ex) {
      this.#onError(ex);
      return;
    } finally {
      closeFrame(frame);
    }
    this.#onFrame();
  }

  // Group named annotation states by id.
  #drawAnnotationCanvases(annotationBitmaps) {
    const annotationCanvasMap = this.#annotationCanvasMap;
    const seen = new Set();

    for (const [id, canvasName, bitmap] of annotationBitmaps) {
      // OffscreenCanvas has no ownerDocument; use the canvas factory.
      const { canvas, context } = this.#canvasFactory.create(
        bitmap.width,
        bitmap.height
      );
      context.drawImage(bitmap, 0, 0);

      if (!canvasName) {
        annotationCanvasMap.set(id, canvas);
        continue;
      }
      setAnnotationCanvasName(canvas, canvasName);
      if (seen.has(id)) {
        annotationCanvasMap.get(id).push(canvas);
      } else {
        seen.add(id);
        annotationCanvasMap.set(id, [canvas]);
      }
    }
  }
}

/**
 * @typedef {object} RendererWorkerParameters
 * @property {number} [verbosity] - Logging level from {@link VerbosityLevel}.
 * @property {boolean} [enableHWA] - Allow hardware acceleration.
 * @property {boolean} [enableWebGPU] - Initialize WebGPU.
 */

/**
 * Manages a document's renderer worker and render tasks.
 * @param {RendererWorkerParameters} params
 */
class RendererWorker {
  #capability = Promise.withResolvers();

  #enableHWA;

  #enableWebGPU;

  #messageHandler = null;

  #operatorListId = 0;

  #operatorLists = new WeakMap();

  // Messages queued during startup.
  #pendingMessages = [];

  #pendingRequests = new Set();

  #renderTaskId = 0;

  #renderTasks = new Map();

  #terminateEarly = null;

  #webWorker = null;

  #workerAC = null;

  destroyed = false;

  constructor({
    verbosity = getVerbosityLevel(),
    enableHWA = false,
    enableWebGPU = false,
  } = {}) {
    this.verbosity = verbosity;
    this.#enableHWA = enableHWA;
    this.#enableWebGPU = enableWebGPU;
    this.#initialize();

    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      // Expose the worker for test coverage.
      Object.defineProperty(this, "_webWorker", {
        get() {
          return this.#webWorker;
        },
      });
    }
  }

  /**
   * Whether rendererSrc is set and browser prerequisites are available.
   * @type {boolean}
   */
  static get isAvailable() {
    return (
      !!GlobalWorkerOptions.rendererSrc &&
      typeof Worker !== "undefined" &&
      FeatureTest.isOffscreenCanvasSupported &&
      !!globalThis.document?.fonts
    );
  }

  /**
   * Resolves when ready; rejects on failed or aborted startup.
   * @type {Promise<void>}
   */
  get promise() {
    return this.#capability.promise;
  }

  /**
   * The worker's message handler, or null.
   * @type {MessageHandler | null}
   */
  get messageHandler() {
    return this.#messageHandler;
  }

  #resolve() {
    this.#messageHandler.on("RenderFrame", frame => {
      const renderTask = this.#renderTasks.get(frame.renderTaskId);
      if (renderTask) {
        renderTask.drawFrame(frame);
      } else {
        closeFrame(frame);
      }
    });

    this.#capability.resolve();
    this.#messageHandler.send("configure", {
      verbosity: this.verbosity,
      enableHWA: this.#enableHWA,
      enableWebGPU: this.#enableWebGPU,
    });

    const pendingMessages = this.#pendingMessages;
    this.#pendingMessages = null;
    for (const send of pendingMessages) {
      send();
    }
  }

  #reject(reason) {
    this.#pendingMessages = null;
    this.#capability.reject(reason);
  }

  #initialize() {
    try {
      const worker = new Worker(getWorkerSrc(GlobalWorkerOptions.rendererSrc), {
        type: "module",
      });
      const messageHandler = new MessageHandler("main", "renderer", worker);
      const terminateEarly = reason => {
        this.#terminateEarly = null;
        ac.abort();
        messageHandler.destroy();
        worker.terminate();

        this.#reject(
          new Error(
            `Renderer worker failed to initialize: "${reason?.message ?? reason}".`
          )
        );
      };
      this.#terminateEarly = terminateEarly;

      const ac = new AbortController();
      const onError = (event, reason) => {
        if (!this.#webWorker) {
          terminateEarly(reason);
          return;
        }
        // An error may leave pending requests without replies.
        event.preventDefault();
        warn(
          `Renderer worker failed: "${reason}". ` +
            "Falling back to main-thread rendering."
        );
        this.destroy();
      };
      worker.addEventListener(
        "error",
        event => onError(event, event.error?.message ?? event.message),
        { signal: ac.signal }
      );
      worker.addEventListener(
        "messageerror",
        event => onError(event, "Cannot deserialize a message."),
        { signal: ac.signal }
      );

      messageHandler.on("ready", data => {
        if (!(data?.testObj instanceof Uint8Array)) {
          terminateEarly("TypedArray transfer test failed.");
          return;
        }
        const apiVersion =
          typeof PDFJSDev !== "undefined" && !PDFJSDev.test("TESTING")
            ? PDFJSDev.eval("BUNDLE_VERSION")
            : null;
        if (apiVersion !== data.workerVersion) {
          terminateEarly(
            `The API version "${apiVersion}" does not match the Worker version "${data.workerVersion}".`
          );
          return;
        }
        this.#terminateEarly = null;
        this.#messageHandler = messageHandler;
        this.#webWorker = worker;
        this.#workerAC = ac;

        this.#resolve();
      });
    } catch (reason) {
      this.#reject(reason);
    }
  }

  destroy() {
    this.destroyed = true;
    this.#terminateEarly?.("Worker was destroyed.");

    this.#workerAC?.abort();
    this.#workerAC = null;

    this.#webWorker?.terminate();
    this.#webWorker = null;

    this.#messageHandler?.destroy();
    this.#messageHandler = null;

    for (const reject of this.#pendingRequests) {
      reject(new Error("Renderer worker was destroyed."));
    }
    this.#pendingRequests.clear();
  }

  /**
   * Send a request that rejects on worker destruction.
   * @returns {Promise<any>}
   */
  sendWithPromise(action, data) {
    const handler = this.#messageHandler;
    if (!handler) {
      return Promise.reject(new Error("Renderer worker was destroyed."));
    }
    const { promise, resolve, reject } = Promise.withResolvers();
    this.#pendingRequests.add(reject);
    handler.sendWithPromise(action, data).then(resolve, reject);
    return promise.finally(() => {
      this.#pendingRequests.delete(reject);
    });
  }

  #send(action, data) {
    if (this.#pendingMessages) {
      this.#pendingMessages.push(() => this.#send(action, data));
      return;
    }
    this.#messageHandler?.send(action, data);
  }

  #sendObj(action, data, id, pageProxyId, isFont = false) {
    try {
      if (this.#pendingMessages) {
        // Copy fonts before main-thread font loading clears their data.
        const queuedData = isFont ? structuredClone(data) : data;
        this.#pendingMessages.push(() =>
          this.#sendObj(action, queuedData, id, pageProxyId)
        );
        return;
      }
      this.#messageHandler?.send(action, data);
    } catch (reason) {
      warn(`RendererWorker - failed to send "${action}": ${reason}`);
      // Reject unsent object dependencies.
      this.#send("objFailed", { id, pageProxyId, reason: reason.message });
    }
  }

  sendCommonObj(id, type, data) {
    this.#sendObj(
      "commonobj",
      [id, type, data],
      id,
      /* pageProxyId = */ null,
      /* isFont = */ type === "Font"
    );
  }

  sendObj(id, pageProxyId, type, data) {
    this.#sendObj("obj", [id, pageProxyId, type, data], id, pageProxyId);
  }

  cleanup(keepLoadedFonts) {
    this.#send("Cleanup", { keepLoadedFonts });
  }

  cleanupPage(pageProxyId) {
    this.#send("cleanupPage", { pageProxyId });
  }

  /**
   * @returns {WorkerRenderTask | null} Null to use main-thread rendering.
   */
  createRenderTask({
    pageProxyId,
    operatorList,
    params,
    pageColors,
    canvasFactory,
    annotationCanvasMap,
    onFrame,
    onError,
  }) {
    const { canvas, canvasContext, background } = params;

    // Keep supplied contexts and the stepper on the main thread.
    // Can't clone CanvasGradient/CanvasPattern; pageColors uses DOM filters.
    if (
      (!this.#messageHandler && !this.#pendingMessages) || // Failed or destroyed.
      canvasContext ||
      (background && typeof background !== "string") ||
      pageColors ||
      params.recordForDebugger
    ) {
      return null;
    }
    const operatorListState = this.#operatorLists.getOrInsertComputed(
      operatorList,
      () => ({ id: this.#operatorListId++, sentLength: 0 })
    );

    return new WorkerRenderTask({
      rendererWorker: this,
      renderTasks: this.#renderTasks,
      canvas,
      canvasFactory,
      annotationCanvasMap,
      operatorListState,
      initParams: {
        pageProxyId,
        operatorListId: operatorListState.id,
        renderTaskId: this.#renderTaskId++,
        hasAnnotationCanvasMap: !!annotationCanvasMap,
        recordOperations: params.recordOperations,
        recordImages: params.recordImages,
        partialFrames: params.partialFrames,
        transform: params.transform,
        viewport: params.viewport,
        background,
        // Workers have no devicePixelRatio.
        pixelRatio: OutputScale.pixelRatio,
      },
      onFrame,
      onError,
    });
  }
}

export { RendererWorker };
