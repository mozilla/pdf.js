const FORCED_DEPENDENCY_LABEL = "__forcedDependency";

/**
 * @typedef {"lineWidth" | "lineCap" | "lineJoin" | "miterLimit" | "dash" |
 * "strokeAlpha" | "fillColor" | "fillAlpha" | "globalCompositeOperation" |
 * "path"} SimpleDependency
 */

/**
 * @typedef {"transform" | "moveText"} IncrementalDependency
 */

/**
 * @typedef {IncrementalDependency |
 * typeof FORCED_DEPENDENCY_LABEL} InternalIncrementalDependency
 */
class CanvasDependencyTracker {
  /** @type {Record<SimpleDependency, number>} */
  #simple = { __proto__: null };

  /** @type {Record<InternalIncrementalDependency , number[]>} */
  #incremental = {
    __proto__: null,
    transform: [],
    moveText: [],
    [FORCED_DEPENDENCY_LABEL]: [],
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
      [FORCED_DEPENDENCY_LABEL]: {
        __proto__: this.#incremental[FORCED_DEPENDENCY_LABEL],
      },
    };
    this.#saves.push([opIdx, null]);

    return this;
  }

  restore(opIdx) {
    this.#simple = Object.getPrototypeOf(this.#simple);
    this.#incremental = Object.getPrototypeOf(this.#incremental);
    this.#saves.pop()[1] = opIdx;

    return this;
  }

  /**
   * @param {SimpleDependency} name
   * @param {number} idx
   */
  recordSimpleData(name, idx) {
    this.#simple[name] = idx;
    return this;
  }

  /**
   * @param {IncrementalDependency} name
   * @param {number} idx
   */
  recordIncrementalData(name, idx) {
    this.#incremental[name].push(idx);
    return this;
  }

  recordNamedData(name, idx) {
    this.#namedDependencies.set(name, idx);
    return this;
  }

  // All next operations, until the next .restore(), will depend on this
  recordFutureForcedDependency(name, idx) {
    this.recordIncrementalData(FORCED_DEPENDENCY_LABEL, idx);
    return this;
  }

  // All next operations, until the next .restore(), will depend on all
  // the already recorded data with the given names.
  inheritSimpleDataAsFutureForcedDependencies(names) {
    for (let i = 0; i < names.length; i++) {
      if (names[i] in this.#simple) {
        this.recordFutureForcedDependency(names[i], this.#simple[names[i]]);
      }
    }
    return this;
  }

  resetBBox(idx) {
    this.#pendingBBoxIdx = idx;
    this.#pendingBBox = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    return this;
  }

  recordBBox(idx, ctx, otherCtxs, minX, maxX, minY, maxY) {
    let matrix = ctx.getTransform();
    for (let i = otherCtxs.length - 1; i >= 0; i--) {
      matrix = otherCtxs[i].getTransform().multiply(matrix);
    }

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

    return this;
  }

  recordFullPageBBox(idx) {
    this.#pendingBBox.minX = 0;
    this.#pendingBBox.minY = 0;
    this.#pendingBBox.maxX = this.#canvasWidth;
    this.#pendingBBox.maxY = this.#canvasHeight;

    return this;
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

    return this;
  }

  recordNamedDependency(idx, name) {
    if (this.#namedDependencies.has(name)) {
      this.#pendingDependencies.add(this.#namedDependencies.get(name));
    }

    return this;
  }

  /**
   * @param {number} idx
   * @param {SimpleDependency[]} dependencyNames
   */
  recordOperation(idx) {
    this.recordDependencies(idx, [FORCED_DEPENDENCY_LABEL]);
    const dependencies = new Set(this.#pendingDependencies);
    const saves = this.#saves.slice();
    const bbox = this.#pendingBBoxIdx === idx ? this.#pendingBBox : null;
    this.#operations.set(idx, { bbox, saves, dependencies });
    this.#pendingBBox = null;
    this.#pendingBBoxIdx = null;
    this.#pendingDependencies.clear();

    return this;
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
