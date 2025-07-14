import { Util } from "../shared/util.js";

const FORCED_DEPENDENCY_LABEL = "__forcedDependency";

/**
 * @typedef {"lineWidth" | "lineCap" | "lineJoin" | "miterLimit" | "dash" |
 * "strokeAlpha" | "fillColor" | "fillAlpha" | "globalCompositeOperation" |
 * "path" | "filter"} SimpleDependency
 */

/**
 * @typedef {"transform" | "moveText" | "sameLineText"} IncrementalDependency
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
    sameLineText: [],
    [FORCED_DEPENDENCY_LABEL]: [],
  };

  #namedDependencies = new Map();

  #savesStack = [];

  #markedContentStack = [];

  // Float32Array<minX, minY, maxX, maxY>
  #pendingBBox = new Float64Array([Infinity, Infinity, -Infinity, -Infinity]);

  #pendingBBoxIdx = -1;

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
      sameLineText: { __proto__: this.#incremental.sameLineText },
      [FORCED_DEPENDENCY_LABEL]: {
        __proto__: this.#incremental[FORCED_DEPENDENCY_LABEL],
      },
    };
    this.#savesStack.push([opIdx, null]);

    return this;
  }

  restore(opIdx) {
    const previous = Object.getPrototypeOf(this.#simple);
    if (previous === null) {
      // Sometimes we call more .restore() than .save(), for
      // example when using CanvasGraphics' #restoreInitialState()
      return this;
    }
    this.#simple = Object.getPrototypeOf(this.#simple);
    this.#incremental = Object.getPrototypeOf(this.#incremental);

    const lastPair = this.#savesStack.pop();
    if (lastPair !== undefined) {
      lastPair[1] = opIdx;
    }

    return this;
  }

  /**
   * @param {number} idx
   */
  recordOpenMarker(idx) {
    this.#savesStack.push([idx, null]);
    return this;
  }

  getOpenMarker() {
    if (this.#savesStack.length === 0) {
      return null;
    }
    return this.#savesStack.at(-1)[0];
  }

  recordCloseMarker(idx) {
    const lastPair = this.#savesStack.pop();
    if (lastPair !== undefined) {
      lastPair[1] = idx;
    }
    return this;
  }

  // Marked content needs a separate stack from save/restore, because they
  // form two independent trees.
  beginMarkedContent(opIdx) {
    this.#markedContentStack.push([opIdx, null]);
    return this;
  }

  endMarkedContent(opIdx) {
    const lastPair = this.#markedContentStack.pop();
    if (lastPair !== undefined) {
      lastPair[1] = opIdx;
    }
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

  /**
   * @param {IncrementalDependency} name
   * @param {number} idx
   */
  resetIncrementalData(name, idx) {
    this.#incremental[name].length = 0;
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

  inheritPendingDependenciesAsFutureForcedDependencies() {
    for (const dep of this.#pendingDependencies) {
      this.recordFutureForcedDependency(FORCED_DEPENDENCY_LABEL, dep);
    }
    return this;
  }

  resetBBox(idx) {
    this.#pendingBBoxIdx = idx;
    this.#pendingBBox[0] = Infinity;
    this.#pendingBBox[1] = Infinity;
    this.#pendingBBox[2] = -Infinity;
    this.#pendingBBox[3] = -Infinity;
    return this;
  }

  get hasPendingBBox() {
    return this.#pendingBBoxIdx !== -1;
  }

  recordBBox(idx, ctx, otherCtxs, minX, maxX, minY, maxY) {
    const transform = Util.domMatrixToTransform(ctx.getTransform());
    for (let i = otherCtxs.length - 1; i >= 0; i--) {
      Util.multiplyDOMMatrixInto(otherCtxs[i].getTransform(), transform);
    }
    Util.axialAlignedBoundingBox(
      [minX, minY, maxX, maxY],
      transform,
      this.#pendingBBox
    );
    return this;
  }

  recordFullPageBBox(idx) {
    this.#pendingBBox[0] = 0;
    this.#pendingBBox[1] = 0;
    this.#pendingBBox[2] = this.#canvasWidth;
    this.#pendingBBox[3] = this.#canvasHeight;

    return this;
  }

  getSimpleIndex(dependencyName) {
    return this.#simple[dependencyName];
  }

  recordDependencies(idx, dependencyNames) {
    const pendingDependencies = this.#pendingDependencies;
    const simple = this.#simple;
    const incremental = this.#incremental;
    for (const name of dependencyNames) {
      if (name in this.#simple) {
        pendingDependencies.add(simple[name]);
      } else if (name in incremental) {
        incremental[name].forEach(pendingDependencies.add, pendingDependencies);
      }
    }

    return this;
  }

  copyDependenciesFromIncrementalOperation(idx, name) {
    const operations = this.#operations;
    const pendingDependencies = this.#pendingDependencies;
    for (const depIdx of this.#incremental[name]) {
      operations
        .get(depIdx)
        .dependencies.forEach(
          pendingDependencies.add,
          pendingDependencies.add(depIdx)
        );
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
   */
  recordOperation(idx, preserveBbox = false) {
    this.recordDependencies(idx, [FORCED_DEPENDENCY_LABEL]);
    const dependencies = new Set(this.#pendingDependencies);
    const pairs = this.#savesStack.concat(this.#markedContentStack);
    const bbox =
      this.#pendingBBoxIdx === idx
        ? {
            minX: this.#pendingBBox[0],
            minY: this.#pendingBBox[1],
            maxX: this.#pendingBBox[2],
            maxY: this.#pendingBBox[3],
          }
        : null;
    this.#operations.set(idx, { bbox, pairs, dependencies });
    if (!preserveBbox) {
      this.#pendingBBoxIdx = -1;
    }
    this.#pendingDependencies.clear();

    return this;
  }

  _extractOperation(idx) {
    const operation = this.#operations.get(idx);
    this.#operations.delete(idx);
    return operation;
  }

  _pushPendingDependencies(dependencies) {
    for (const dep of dependencies) {
      this.#pendingDependencies.add(dep);
    }
  }

  take() {
    return Array.from(
      this.#operations,
      ([idx, { bbox, pairs, dependencies }]) => {
        pairs.forEach(pair => pair.forEach(dependencies.add, dependencies));
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

/**
 * Used to track dependencies of nested operations list, that
 * should actually all map to the index of the operation that
 * contains the nested list.
 *
 * @implements {CanvasDependencyTracker}
 */
class CanvasNestedDependencyTracker {
  /** @type {CanvasDependencyTracker} */
  #dependencyTracker;

  /** @type {number} */
  #opIdx;

  #nestingLevel = 0;

  #outerDependencies = new Set();

  #savesLevel = 0;

  constructor(dependencyTracker, opIdx) {
    if (dependencyTracker instanceof CanvasNestedDependencyTracker) {
      // The goal of CanvasNestedDependencyTracker is to collapse all operations
      // into a single one. If we are already in a
      // CanvasNestedDependencyTracker, that is already happening.
      return dependencyTracker;
    }

    this.#dependencyTracker = dependencyTracker;
    this.#opIdx = opIdx;
  }

  save(opIdx) {
    this.#savesLevel++;
    this.#dependencyTracker.save(this.#opIdx);
    return this;
  }

  restore(opIdx) {
    if (this.#savesLevel > 0) {
      this.#dependencyTracker.restore(this.#opIdx);
      this.#savesLevel--;
    }
    return this;
  }

  recordOpenMarker(idx) {
    this.#nestingLevel++;
    return this;
  }

  getOpenMarker() {
    return this.#nestingLevel > 0
      ? this.#opIdx
      : this.#dependencyTracker.getOpenMarker();
  }

  recordCloseMarker(idx) {
    this.#nestingLevel--;
    return this;
  }

  beginMarkedContent(opIdx) {
    return this;
  }

  endMarkedContent(opIdx) {
    return this;
  }

  /**
   * @param {SimpleDependency} name
   * @param {number} idx
   */
  recordSimpleData(name, idx) {
    this.#dependencyTracker.recordSimpleData(name, this.#opIdx);
    return this;
  }

  /**
   * @param {IncrementalDependency} name
   * @param {number} idx
   */
  recordIncrementalData(name, idx) {
    this.#dependencyTracker.recordIncrementalData(name, this.#opIdx);
    return this;
  }

  /**
   * @param {IncrementalDependency} name
   * @param {number} idx
   */
  resetIncrementalData(name, idx) {
    this.#dependencyTracker.resetIncrementalData(name, this.#opIdx);
    return this;
  }

  recordNamedData(name, idx) {
    // Nested dependencies are not visible to the outside.
    return this;
  }

  // All next operations, until the next .restore(), will depend on this
  recordFutureForcedDependency(name, idx) {
    this.#dependencyTracker.recordFutureForcedDependency(name, this.#opIdx);
    return this;
  }

  // All next operations, until the next .restore(), will depend on all
  // the already recorded data with the given names.
  inheritSimpleDataAsFutureForcedDependencies(names) {
    this.#dependencyTracker.inheritSimpleDataAsFutureForcedDependencies(names);
    return this;
  }

  inheritPendingDependenciesAsFutureForcedDependencies() {
    this.#dependencyTracker.inheritPendingDependenciesAsFutureForcedDependencies();
    return this;
  }

  resetBBox(idx) {
    if (!this.#dependencyTracker.hasPendingBBox) {
      this.#dependencyTracker.resetBBox(this.#opIdx);
    }
    return this;
  }

  get hasPendingBBox() {
    return this.#dependencyTracker.hasPendingBBox;
  }

  recordBBox(idx, ctx, otherCtxs, minX, maxX, minY, maxY) {
    this.#dependencyTracker.recordBBox(
      this.#opIdx,
      ctx,
      otherCtxs,
      minX,
      maxX,
      minY,
      maxY
    );
    return this;
  }

  recordFullPageBBox(idx) {
    this.#dependencyTracker.recordFullPageBBox(this.#opIdx);
    return this;
  }

  getSimpleIndex(dependencyName) {
    return this.#dependencyTracker.getSimpleIndex(dependencyName);
  }

  recordDependencies(idx, dependencyNames) {
    this.#dependencyTracker.recordDependencies(this.#opIdx, dependencyNames);
    return this;
  }

  copyDependenciesFromIncrementalOperation(idx, name) {
    this.#dependencyTracker.copyDependenciesFromIncrementalOperation(
      this.#opIdx,
      name
    );
    return this;
  }

  recordNamedDependency(idx, name) {
    this.#dependencyTracker.recordNamedDependency(this.#opIdx, name);
    return this;
  }

  /**
   * @param {number} idx
   * @param {SimpleDependency[]} dependencyNames
   */
  recordOperation(idx) {
    this.#dependencyTracker.recordOperation(this.#opIdx, true);
    const operation = this.#dependencyTracker._extractOperation(this.#opIdx);
    for (const depIdx of operation.dependencies) {
      this.#outerDependencies.add(depIdx);
    }
    this.#outerDependencies.delete(this.#opIdx);
    this.#outerDependencies.delete(null);
    return this;
  }

  recordNestedDependencies() {
    this.#dependencyTracker._pushPendingDependencies(this.#outerDependencies);
  }

  take() {
    throw new Error("Unreachable");
  }
}

/** @satisfies {Record<string, SimpleDependency | IncrementalDependency>} */
const Dependencies = {
  stroke: [
    "path",
    "transform",
    "filter",
    "strokeColor",
    "strokeAlpha",
    "lineWidth",
    "lineCap",
    "lineJoin",
    "miterLimit",
    "dash",
  ],
  fill: [
    "path",
    "transform",
    "filter",
    "fillColor",
    "fillAlpha",
    "globalCompositeOperation",
    "SMask",
  ],
  imageXObject: [
    "transform",
    "SMask",
    "filter",
    "fillAlpha",
    "strokeAlpha",
    "globalCompositeOperation",
  ],
  rawFillPath: ["filter", "fillColor", "fillAlpha"],
  showText: [
    "transform",
    "leading",
    "charSpacing",
    "wordSpacing",
    "hScale",
    "textRise",
    "moveText",
    "textMatrix",
    "font",
    "filter",
    "fillColor",
    "textRenderingMode",
    "SMask",
    "fillAlpha",
    "strokeAlpha",
    "globalCompositeOperation",
    // TODO: More
  ],
  transform: ["transform"],
  transformAndFill: ["transform", "fillColor"],
};

export { CanvasDependencyTracker, CanvasNestedDependencyTracker, Dependencies };
