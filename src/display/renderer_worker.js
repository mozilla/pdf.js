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
import { isNodeJS } from "../shared/util.js";
import { MessageHandler } from "../shared/message_handler.js";
import { OffscreenCanvasFactory } from "./canvas_factory.js";
import { OptionalContentConfig } from "./optional_content_config.js";
import { WorkerFilterFactory } from "./filter_factory.js";

function createCanvasFactory(data) {
  const { enableHWA = false } = data || {};
  return new OffscreenCanvasFactory({ enableHWA });
}

class RendererMessageHandler {
  static #pdfWorkerHandlers = new Map();

  static {
    // TODO: Is this necessary?
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

    handler.on("InitializeGraphics", data => {
      const {
        canvas,
        enableHWA = false,
        optionalContentConfigData,
        optionalContentConfigState,
        optionalContentConfigRenderingIntent,
      } = data;
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
      data.optionalContentConfig = { optionalContentConfig };
      data.canvasFactory = createCanvasFactory({ enableHWA });
      data.annotationCanvasMap =
        data.annotationCanvasMap instanceof Map
          ? data.annotationCanvasMap
          : new Map(data.annotationCanvasMap || []);

      data.filterFactory = new WorkerFilterFactory();
      try {
        const gfx = new CanvasGraphics(
          ctx,
          null,
          null,
          data.canvasFactory,
          data.filterFactory,
          { optionalContentConfig },
          data.annotationCanvasMap,
          data.pageColors,
          data.dependencyTracker
        );
        console.log(gfx);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Error initializing CanvasGraphics", e);
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

    pdfWorkerHandler.send("ready", null);
    return { ok: true, docId: bridgeId };
  }
}

export { RendererMessageHandler };
