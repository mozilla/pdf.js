import { assert } from "../shared/util.js";
import { CanvasGraphics } from "./canvas.js";
import { DOMFilterFactory } from "./filter_factory.js";
import { FontLoader } from "./font_loader.js";
import { MessageHandler } from "../shared/message_handler.js";
import { OffscreenCanvasFactory } from "./canvas_factory.js";
import { PDFObjects } from "./display_utils.js";
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
    mainHandler.send("ready", null);
    mainHandler.on("Ready", function () {
      // DO NOTHING
    });

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
        terminated,
        this.#commonObjs,
        this.#objsMap,
        this.#fontLoader
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
        this.#tasks.set(taskID, { canvas, gfx });
      }
    );

    mainHandler.on(
      "execute",
      async ({ operatorList, operatorListIdx, taskID }) => {
        if (terminated) {
          throw new Error("Renderer worker has been terminated.");
        }
        const task = this.#tasks.get(taskID);
        assert(task !== undefined, "Task not initialized");
        return task.gfx.executeOperatorList(
          operatorList,
          operatorListIdx,
          arg => mainHandler.send("continue", { taskID, arg })
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
    });

    mainHandler.on("resetCanvas", ({ taskID }) => {
      if (terminated) {
        throw new Error("Renderer worker has been terminated.");
      }
      const task = this.#tasks.get(taskID);
      assert(task !== undefined, "Task not initialized");
      const canvas = task.canvas;
      canvas.width = canvas.height = 0;
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
  }
}

export { RendererMessageHandler };
