const strokeDependencies = [
  "lineCap",
  "lineJoin",
  "lineWidth",
  "miterLimit",
  "strokeStyle",
];
const fillDependencies = ["fillStyle"];
const relativeTransformMethods = ["transform", "translate", "rotate", "scale"];
const transformedMethods = [
  "arc",
  "arcTo",
  "beizerCurveTo",
  // "drawImage",
  "ellipse",
  // "fillRect",
  // "fillText",
  "lineTo",
  "moveTo",
  "quadraticCurveTo",
  "rect",
  "roundRect",
  "strokeRect",
  "strokeText",
];

/** @implements {CanvasRenderingContext2D} */
export class CanvasRecorder {
  /** @type {CanvasRenderingContext2D} */
  #ctx;

  #canvasWidth;

  #canvasHeight;

  #groupsStack = [];

  #closedGroups = [];

  #dependenciesIds = Object.create(null);

  #transformDepsIds = [];

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

  static discardGroupRecording(ctx, type) {
    return #discardGroup in ctx ? ctx.#discardGroup(type) : null;
  }

  static endGroupRecording(ctx, type, extraDependencies) {
    if (#endGroup in ctx) {
      this.addExtraDependencies(ctx, extraDependencies);
      return ctx.#endGroup(type);
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

  #discardGroup(type) {
    const group = this.#groupsStack.pop();
    if (group.data.type !== type) {
      this.#groupsStack.push(group);
      // TODO: Warn?
      return null;
    }

    return group.data;
  }

  #endGroup(type) {
    const group = this.#groupsStack.pop();
    if (group.data.type !== type) {
      this.#groupsStack.push(group);

      // TODO: Warn?
      return null;
    }
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
    this.#currentGroup.maxX = this.#canvasWidth;
    this.#currentGroup.minY = 0;
    this.#currentGroup.maxY = this.#canvasHeight;
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

    this.#registerTransformDependencies();
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

  #registerTransformDependencies() {
    const dependenciesSet = this.#currentGroup.dependencies;
    this.#transformDepsIds.forEach(dependenciesSet.add, dependenciesSet);
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
    this.#transformDepsIds = Object.create(this.#transformDepsIds);
    this.#ctx.save();
  }

  restore() {
    const prevDependencies = Object.getPrototypeOf(this.#dependenciesIds);
    if (prevDependencies !== null) {
      this.#dependenciesIds = prevDependencies;
      this.#transformDepsIds = Object.getPrototypeOf(this.#transformDepsIds);
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
        "miterLimit",
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

      for (const name of relativeTransformMethods) {
        CanvasRecorder.prototype[name] = function (...args) {
          this.#transformDepsIds.push(this.#nextCommandsId);
          this.#ctx[name](...args);
        };
      }
      for (const name of ["setTransform", "resetTransform"]) {
        CanvasRecorder.prototype[name] = function (...args) {
          this.#transformDepsIds.length = 0;
          this.#transformDepsIds.push(this.#nextCommandsId);
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
          if (
            Object.hasOwn(depsOfMethods, name) ||
            transformedMethods.includes(name)
          ) {
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

        const ignoreBox =
          /^(?:get|set|is)[A-Z]/.test(name) ||
          name === "beginPath" ||
          name === "closePath";
        const deps = depsOfMethods[name];
        const affectedByTransform = transformedMethods.includes(name);

        CanvasRecorder.prototype[name] = function (...args) {
          if (!ignoreBox) {
            // console.warn(`Untracked call to ${name}`);
            this.#unknown();
          }
          if (affectedByTransform) {
            this.#registerTransformDependencies();
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
