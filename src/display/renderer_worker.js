import { assert } from "../shared/util.js";
import { CanvasGraphics } from "./canvas.js";
import { DOMFilterFactory } from "./filter_factory.js";
import { FontLoader } from "./font_loader.js";
import { MessageHandler } from "../shared/message_handler.js";
import { OffscreenCanvasFactory } from "./canvas_factory.js";
import { PDFObjects } from "./pdf_objects.js";
import { setupHandler } from "../shared/handle_objs.js";

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
      this.#filterFactory = new DOMFilterFactory({});

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
        optionalContentConfig,
      }) => {
        assert(!this.#tasks.has(taskID), "Task already initialized");
        const ctx = canvas.getContext("2d", {
          alpha: false,
          willReadFrequently: this.#enableHWA,
        });
        const objs = this.pageObjs(pageIndex);
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
        this.#tasks.set(taskID, {
          canvas,
          gfx,
          pageIndex,
          ended: false,
          cleanupRequested: false,
        });
      }
    );

    mainHandler.on(
      "execute",
      ({ operatorList, operatorListIdx, taskID, operationsFilter }) => {
        if (terminated) {
          throw new Error("Renderer worker has been terminated.");
        }
        const task = this.#tasks.get(taskID);
        assert(task !== undefined, "Task not initialized");

        const continueFn = () => {
          mainHandler.send("continue", { taskID });
        };

        return task.gfx.executeOperatorList(
          operatorList,
          operatorListIdx,
          continueFn,
          undefined,
          operationsFilter
        );
      }
    );

    mainHandler.on("end", ({ taskID }) => {
      if (terminated) {
        throw new Error("Renderer worker has been terminated.");
      }
      const task = this.#tasks.get(taskID);
      assert(task !== undefined, "Task not initialized");
      task.gfx.endDrawing();
      task.ended = true;
      task.gfx = null;

      if (task.cleanupRequested) {
        task.canvas.width = task.canvas.height = 0;
        this.#tasks.delete(taskID);
      }
    });

    mainHandler.on("growOperationsCount", ({ operatorList, taskID }) => {
      if (terminated) {
        throw new Error("Renderer worker has been terminated.");
      }
      const task = this.#tasks.get(taskID);
      assert(task !== undefined, "Task not initialized");
      task.gfx?.dependencyTracker?.growOperationsCount(
        operatorList.fnArray.length
      );
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
