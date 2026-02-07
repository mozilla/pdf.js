import { assert } from "../shared/util.js";
import { CanvasGraphics } from "./canvas.js";
import { FontLoader } from "./font_loader.js";
import { MessageHandler } from "../shared/message_handler.js";
import { OffscreenCanvasFactory } from "./canvas_factory.js";
import { OptionalContentConfig } from "./optional_content_config.js";
import { PDFObjects } from "./pdf_objects.js";
import { setupHandler } from "../shared/handle_objs.js";
import { WorkerFilterFactory } from "./filter_factory.js";

class RendererMessageHandler {
  static #commonObjs = new PDFObjects();

  static #objsMap = new Map();

  static #tasks = new Map();

  static #fontLoader = new FontLoader({
    ownerDocument: self,
  });

  static #canvasFactory;

  static #filterFactory;

  static #enableHWA = false;

  static {
    this.initializeFromPort(self);
  }

  static pageObjs(pageIndex) {
    let objs = this.#objsMap.get(pageIndex);
    if (!objs) {
      objs = new PDFObjects();
      this.#objsMap.set(pageIndex, objs);
    }
    return objs;
  }

  static initializeFromPort(port) {
    let terminated = false;
    let mainHandler = new MessageHandler("renderer", "main", port);

    mainHandler.on("configure", ({ channelPort, enableHWA }) => {
      this.#enableHWA = enableHWA;
      const workerHandler = new MessageHandler(
        "renderer-channel",
        "worker-channel",
        channelPort
      );
      this.#canvasFactory = new OffscreenCanvasFactory({
        enableHWA,
      });
      this.#filterFactory = new WorkerFilterFactory();

      setupHandler(
        workerHandler,
        () => terminated,
        this.#commonObjs,
        this.#objsMap,
        this.#fontLoader,
        { renderInWorker: true }
      );
    });

    mainHandler.on(
      "init",
      ({
        pageIndex,
        canvas,
        map,
        colors,
        taskID,
        transform,
        viewport,
        transparency,
        background,
        renderingIntent,
        optionalContentConfig: optionalContentConfigData,
        optionalContentConfigState = null,
      }) => {
        assert(!this.#tasks.has(taskID), "Task already initialized");
        const ctx = canvas.getContext("2d", {
          alpha: false,
          willReadFrequently: !this.#enableHWA,
        });
        const objs = this.pageObjs(pageIndex);
        const optionalContentConfig = new OptionalContentConfig(
          optionalContentConfigData,
          renderingIntent
        );
        if (optionalContentConfigState) {
          for (const [id, visible] of optionalContentConfigState) {
            optionalContentConfig.setVisibility(id, visible, false);
          }
        }
        const gfx = new CanvasGraphics(
          ctx,
          this.#commonObjs,
          objs,
          this.#canvasFactory,
          this.#filterFactory,
          { optionalContentConfig },
          map,
          colors
        );
        gfx.beginDrawing({ transform, viewport, transparency, background });
        const operatorList = {
          fnArray: [],
          argsArray: [],
        };
        this.#tasks.set(taskID, {
          canvas,
          ctx,
          gfx,
          pageIndex,
          operatorList,
          ended: false,
          cleanupRequested: false,
        });
      }
    );

    mainHandler.on("getImageData", ({ taskID, x, y, width, height }) => {
      if (terminated) {
        throw new Error("Renderer worker has been terminated.");
      }
      const task = this.#tasks.get(taskID);
      assert(task !== undefined, "Task not initialized");
      return task.ctx.getImageData(x, y, width, height).data;
    });

    mainHandler.on(
      "isCanvasMonochrome",
      ({ taskID, x, y, width, height, color }) => {
        if (terminated) {
          throw new Error("Renderer worker has been terminated.");
        }
        const task = this.#tasks.get(taskID);
        assert(task !== undefined, "Task not initialized");

        const { data } = task.ctx.getImageData(x, y, width, height);
        const view = new Uint32Array(data.buffer);
        for (let i = 0, ii = view.length; i < ii; i++) {
          if (view[i] !== color) {
            return false;
          }
        }
        return true;
      }
    );

    mainHandler.on(
      "execute",
      ({ fnArray, argsArray, operatorListIdx, taskID, operationsFilter }) => {
        if (terminated) {
          throw new Error("Renderer worker has been terminated.");
        }
        const task = this.#tasks.get(taskID);
        assert(task !== undefined, "Task not initialized");

        if (fnArray) {
          const { operatorList } = task;
          const ii = fnArray.length;
          for (let i = 0; i < ii; i++) {
            operatorList.fnArray.push(fnArray[i]);
            operatorList.argsArray.push(argsArray[i]);
          }
        }

        const continueFn = () => {
          mainHandler.send("continue", { taskID });
        };

        const newOperatorListIdx = task.gfx.executeOperatorList(
          task.operatorList,
          operatorListIdx,
          continueFn,
          undefined,
          operationsFilter
        );
        try {
          task.ctx.commit?.();
        } catch {
          // `commit` isn't supported in all environments.
        }
        return newOperatorListIdx;
      }
    );

    mainHandler.on("end", ({ taskID }) => {
      if (terminated) {
        throw new Error("Renderer worker has been terminated.");
      }
      const task = this.#tasks.get(taskID);
      assert(task !== undefined, "Task not initialized");
      task.gfx.endDrawing();
      try {
        task.ctx.commit?.();
      } catch {
        // `commit` isn't supported in all environments.
      }
      task.ended = true;
      task.gfx = null;
      task.operatorList = null;

      if (task.cleanupRequested) {
        task.canvas.width = task.canvas.height = 0;
        this.#tasks.delete(taskID);
      }
    });

    mainHandler.on("resetCanvas", ({ taskID }) => {
      if (terminated) {
        throw new Error("Renderer worker has been terminated.");
      }
      const task = this.#tasks.get(taskID);
      if (!task) {
        return;
      }
      task.cleanupRequested = true;

      if (task.ended) {
        task.canvas.width = task.canvas.height = 0;
        this.#tasks.delete(taskID);
      }
    });

    mainHandler.on("Terminate", async () => {
      terminated = true;
      this.#commonObjs.clear();
      for (const objs of this.#objsMap.values()) {
        objs.clear();
      }
      this.#objsMap.clear();
      this.#tasks.clear();
      this.#fontLoader.clear();
      mainHandler.destroy();
      mainHandler = null;
    });

    mainHandler.send("ready", null);
  }
}

export { RendererMessageHandler };
