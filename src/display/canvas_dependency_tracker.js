/**
 * @typedef {"lineWidth" | "lineCap" | "lineJoin" | "miterLimit" | "dash" |
 * "strokeAlpha" | "fillColor" | "fillAlpha" | "globalCompositeOperation" | "path"} SimpleDependency
 */

/**
 * @typedef {1 | 2} Foo
 */

class CanvasDependencyTracker {
  /** @type {Record<SimpleDependency, number>} */
  #simple = { __proto__: null };

  #incremental = {
    __proto__: null,
    transform: [],
    moveText: [],
  };

  #namedDependencies = new Map();

  #saves = [];

  #pendingBBox = null;

  #pendingBBoxIdx = null;

  #pendingDependencies = new Set();

  #operations = new Map();

  #canvasWidth;

  #canvasHeight;

  constructor(initialContext) {
    this.#canvasWidth = initialContext.canvas.width;
    this.#canvasHeight = initialContext.canvas.height;
  }

  save(opIdx) {
    this.#simple = { __proto__: this.#simple };
    this.#incremental = {
      __proto__: this.#incremental,
      transform: { __proto__: this.#incremental.transform },
      moveText: { __proto__: this.#incremental.moveText },
    };
    this.#saves.push([opIdx, null]);
  }

  restore(opIdx) {
    this.#simple = Object.getPrototypeOf(this.#simple);
    this.#incremental = Object.getPrototypeOf(this.#incremental);
    this.#saves.pop()[1] = opIdx;
  }

  /**
   * @param {SimpleDependency} name
   * @param {number} idx
   */
  recordSimpleData(name, idx) {
    this.#simple[name] = idx;
  }

  recordIncrementalData(name, idx) {
    this.#incremental[name].push(idx);
  }

  recordNamedData(name, idx) {
    this.#namedDependencies.set(name, idx);
  }

  resetBBox(idx) {
    this.#pendingBBoxIdx = idx;
    this.#pendingBBox = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    //this.recordBBox(idx, minX, maxX, minY, maxY);
  }

  recordBBox(idx, ctx, minX, maxX, minY, maxY) {
    const matrix = ctx.getTransform();

    ({ x: minX, y: minY } = matrix.transformPoint(new DOMPoint(minX, minY)));
    ({ x: maxX, y: maxY } = matrix.transformPoint(new DOMPoint(maxX, maxY)));
    if (maxX < minX) {
      [maxX, minX] = [minX, maxX];
    }
    if (maxY < minY) {
      [maxY, minY] = [minY, maxY];
    }

    this.#pendingBBox.minX = Math.min(this.#pendingBBox.minX, minX);
    this.#pendingBBox.minY = Math.min(this.#pendingBBox.minY, minY);
    this.#pendingBBox.maxX = Math.max(this.#pendingBBox.maxX, maxX);
    this.#pendingBBox.maxY = Math.max(this.#pendingBBox.maxY, maxY);
  }

  recordDependencies(idx, dependencyNames) {
    for (const name of dependencyNames) {
      if (name in this.#simple) {
        this.#pendingDependencies.add(this.#simple[name]);
      } else if (name in this.#incremental) {
        this.#incremental[name].forEach(
          this.#pendingDependencies.add,
          this.#pendingDependencies
        );
      }
    }
  }

  recordNamedDependency(idx, name) {
    if (this.#namedDependencies.has(name)) {
      this.#pendingDependencies.add(this.#namedDependencies.get(name));
    }
  }

  /**
   * @param {number} idx
   * @param {SimpleDependency[]} dependencyNames
   */
  recordOperation(idx) {
    const dependencies = new Set(this.#pendingDependencies);
    const saves = this.#saves.slice();
    const bbox = this.#pendingBBoxIdx === idx ? this.#pendingBBox : null;
    this.#operations.set(idx, { bbox, saves, dependencies });
    this.#pendingBBox = null;
    this.#pendingBBoxIdx = null;
    this.#pendingDependencies.clear();
  }

  take() {
    return Array.from(
      this.#operations,
      ([idx, { bbox, saves, dependencies }]) => {
        saves.forEach(save => save.forEach(dependencies.add, dependencies));
        dependencies.delete(idx);
        return {
          minX: (bbox?.minX ?? 0) / this.#canvasWidth,
          maxX: (bbox?.maxX ?? this.#canvasWidth) / this.#canvasWidth,
          minY: (bbox?.minY ?? 0) / this.#canvasHeight,
          maxY: (bbox?.maxY ?? this.#canvasHeight) / this.#canvasHeight,
          dependencies: Array.from(dependencies).sort((a, b) => a - b),
          data: { idx },
        };
      }
    );
  }
}

export { CanvasDependencyTracker };
