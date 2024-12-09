const strokeDependencies = ["lineCap", "lineJoin", "lineWidth", "strokeStyle"];
const fillDependencies = ["fillStyle"];

/** @implements {CanvasRenderingContext2D} */
export class CanvasRecorder {
  /** @type {CanvasRenderingContext2D} */
  #ctx;

  #canvasWidth;

  #canvasHeight;

  #groupsStack = [];

  #closedGroups = [];

  #dependenciesIds = Object.create(null);

  #nextCommandsId = -1;

  /** @param {CanvasRenderingContext2D} */
  constructor(ctx) {
    // Node.js does not suppot CanvasRenderingContext2D, and @napi-rs/canvas
    // does not expose it directly. We can just avoid recording in this case.
    if (typeof CanvasRenderingContext2D === "undefined") {
      return ctx;
    }

    this.#ctx = ctx;
    this.#canvasWidth = ctx.canvas.width;
    this.#canvasHeight = ctx.canvas.height;
    this.#startGroup();
  }

  static startGroupRecording(ctx, data) {
    return #startGroup in ctx ? ctx.#startGroup(data) : null;
  }

  static endGroupRecording(ctx, extraDependencies) {
    if (#endGroup in ctx) {
      this.addExtraDependencies(ctx, extraDependencies);
      return ctx.#endGroup();
    }
    return null;
  }

  static setNextCommandsId(ctx, id) {
    if (#nextCommandsId in ctx) {
      ctx.#nextCommandsId = id;
    }
  }

  static addExtraDependencies(ctx, ids) {
    if (#currentGroup in ctx && ids) {
      const dependenciesSet = ctx.#currentGroup.dependencies;
      ids.forEach(dependenciesSet.add, dependenciesSet);
    }
  }

  /** @param {CanvasRecorder} */
  static getFinishedGroups(ctx) {
    return ctx.#closedGroups;
  }

  #startGroup(data) {
    this.#groupsStack.push({
      minX: Infinity,
      maxX: 0,
      minY: Infinity,
      maxY: 0,
      dependencies: new Set(),
      data,
    });
    return this.#currentGroup;
  }

  #endGroup() {
    const group = this.#groupsStack.pop();
    this.#currentGroup.maxX = Math.max(this.#currentGroup.maxX, group.maxX);
    this.#currentGroup.minX = Math.min(this.#currentGroup.minX, group.minX);
    this.#currentGroup.maxY = Math.max(this.#currentGroup.maxY, group.maxY);
    this.#currentGroup.minY = Math.min(this.#currentGroup.minY, group.minY);

    this.#closedGroups.push({
      minX: group.minX / this.#canvasWidth,
      maxX: group.maxX / this.#canvasWidth,
      minY: group.minY / this.#canvasHeight,
      maxY: group.maxY / this.#canvasHeight,
      dependencies: Array.from(group.dependencies).sort(),
      data: group.data,
    });

    return group.data;
  }

  get #currentGroup() {
    return this.#groupsStack.at(-1);
  }

  get currentGroup() {
    return this.#currentGroup;
  }

  #unknown() {
    this.#currentGroup.minX = 0;
    this.#currentGroup.maxX = Infinity;
    this.#currentGroup.minY = 0;
    this.#currentGroup.maxY = Infinity;
  }

  #registerBox(minX, maxX, minY, maxY) {
    const matrix = this.#ctx.getTransform();

    ({ x: minX, y: minY } = matrix.transformPoint(new DOMPoint(minX, minY)));
    ({ x: maxX, y: maxY } = matrix.transformPoint(new DOMPoint(maxX, maxY)));
    if (maxX < minX) {
      [maxX, minX] = [minX, maxX];
    }
    if (maxY < minY) {
      [maxY, minY] = [minY, maxY];
    }

    const currentGroup = this.#currentGroup;
    currentGroup.minX = Math.min(currentGroup.minX, minX);
    currentGroup.maxX = Math.max(currentGroup.maxX, maxX);
    currentGroup.minY = Math.min(currentGroup.minY, minY);
    currentGroup.maxY = Math.max(currentGroup.maxY, maxY);
  }

  #registerDependencies(names) {
    const dependenciesSet = this.#currentGroup.dependencies;
    for (const dep of names) {
      const depId = this.#dependenciesIds[dep];
      if (depId !== undefined && depId !== -1) {
        dependenciesSet.add(depId);
      }
    }
  }

  get canvas() {
    return this.#ctx.canvas;
  }

  fillText(text, x, y, maxWidth) {
    const measure = this.#ctx.measureText(text);
    this.#registerBox(
      x,
      x + Math.min(measure.width, maxWidth ?? Infinity),
      y - measure.actualBoundingBoxAscent,
      y + measure.actualBoundingBoxDescent
    );
    this.#registerDependencies(fillDependencies);

    this.#ctx.fillText(text, x, y, maxWidth);
  }

  fillRect(x, y, width, height) {
    this.#registerBox(x, x + width, y, y + height);
    this.#registerDependencies(fillDependencies);
    this.#ctx.fillRect(x, y, width, height);
  }

  drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh) {
    this.#registerBox(
      dx ?? sx,
      (dx ?? sx) + (dw ?? sw),
      dy ?? sy,
      (dy ?? sy) + (dh ?? sh)
    );

    this.#ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  save() {
    this.#dependenciesIds = Object.create(this.#dependenciesIds);
    this.#ctx.save();
  }

  restore() {
    const prevDependencies = Object.getPrototypeOf(this.#dependenciesIds);
    if (prevDependencies !== null) {
      this.#dependenciesIds = prevDependencies;
    }
    this.#ctx.restore();
  }

  static {
    // Node.js does not suppot CanvasRenderingContext2D. The CanvasRecorder
    // constructor will just return the unwrapped CanvasRenderingContext2D
    // in this case, so it's ok if the .prototype doesn't have the methods
    // properly copied over.
    if (typeof CanvasRenderingContext2D !== "undefined") {
      const dependencyAccessors = [
        "lineCap",
        "lineJoin",
        "lineWidth",
        "fillStyle",
        "strokeStyle",
      ];
      for (const name of dependencyAccessors) {
        Object.defineProperty(CanvasRecorder.prototype, name, {
          configurable: true,
          get() {
            return this.#ctx[name];
          },
          set(v) {
            this.#dependenciesIds[name] = this.#nextCommandsId;
            this.#ctx[name] = v;
          },
        });
      }

      const passThrough = ["transform", "translate", "rotate", "scale"];
      for (const name of passThrough) {
        CanvasRecorder.prototype[name] = function (...args) {
          this.#ctx[name](...args);
        };
      }

      const depsOfMethods = {
        stroke: strokeDependencies,
        strokeRect: strokeDependencies,
        strokeText: strokeDependencies,
        fill: fillDependencies,
      };

      const originalDescriptors = Object.getOwnPropertyDescriptors(
        CanvasRenderingContext2D.prototype
      );
      for (const name of Object.keys(originalDescriptors)) {
        if (typeof name !== "string") {
          continue;
        }

        if (Object.hasOwn(CanvasRecorder.prototype, name)) {
          if (Object.hasOwn(depsOfMethods, name)) {
            throw new Error(
              `Internal error: CanvasRecorder#${name} already defined`
            );
          }

          continue;
        }

        const desc = originalDescriptors[name];
        if (desc.get) {
          Object.defineProperty(CanvasRecorder.prototype, name, {
            configurable: true,
            get() {
              return this.#ctx[name];
            },
            set(v) {
              this.#ctx[name] = v;
            },
          });
          continue;
        }

        if (typeof desc.value !== "function") {
          continue;
        }

        const ignoreBox = /^(?:get|set|is)[A-Z]/.test(name);
        const deps = depsOfMethods[name];

        CanvasRecorder.prototype[name] = function (...args) {
          if (!ignoreBox) {
            // console.warn(`Untracked call to ${name}`);
            this.#unknown();
          }
          if (deps) {
            this.#registerDependencies(deps);
          }
          return this.#ctx[name](...args);
        };
      }
    }
  }
}
