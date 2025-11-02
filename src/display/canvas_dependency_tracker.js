import { Util } from "../shared/util.js";

const FORCED_DEPENDENCY_LABEL = "__forcedDependency";

const { floor, ceil } = Math;

function expandBBox(array, index, minX, minY, maxX, maxY) {
  array[index * 4 + 0] = Math.min(array[index * 4 + 0], minX);
  array[index * 4 + 1] = Math.min(array[index * 4 + 1], minY);
  array[index * 4 + 2] = Math.max(array[index * 4 + 2], maxX);
  array[index * 4 + 3] = Math.max(array[index * 4 + 3], maxY);
}

// This is computed rathter than hard-coded to keep into
// account the platform's endianess.
const EMPTY_BBOX = new Uint32Array(new Uint8Array([255, 255, 0, 0]).buffer)[0];

class BBoxReader {
  #bboxes;

  #coords;

  constructor(bboxes, coords) {
    this.#bboxes = bboxes;
    this.#coords = coords;
  }

  get length() {
    return this.#bboxes.length;
  }

  isEmpty(i) {
    return this.#bboxes[i] === EMPTY_BBOX;
  }

  minX(i) {
    return this.#coords[i * 4 + 0] / 256;
  }

  minY(i) {
    return this.#coords[i * 4 + 1] / 256;
  }

  maxX(i) {
    return (this.#coords[i * 4 + 2] + 1) / 256;
  }

  maxY(i) {
    return (this.#coords[i * 4 + 3] + 1) / 256;
  }
}

const ensureDebugMetadata = (map, key) => {
  if (!map) {
    return undefined;
  }
  let value = map.get(key);
  if (!value) {
    value = { dependencies: new Set(), isRenderingOperation: false };
    map.set(key, value);
  }
  return value;
};

/**
 * @typedef {"lineWidth" | "lineCap" | "lineJoin" | "miterLimit" | "dash" |
 * "strokeAlpha" | "fillColor" | "fillAlpha" | "globalCompositeOperation" |
 * "path" | "filter" | "font" | "fontObj"} SimpleDependency
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

  #baseTransformStack = [[1, 0, 0, 1, 0, 0]];

  #clipBox = [-Infinity, -Infinity, Infinity, Infinity];

  // Float32Array<minX, minY, maxX, maxY>
  #pendingBBox = new Float64Array([Infinity, Infinity, -Infinity, -Infinity]);

  #pendingBBoxIdx = -1;

  #pendingDependencies = new Set();

  #operations = new Map();

  #fontBBoxTrustworthy = new Map();

  #canvasWidth;

  #canvasHeight;

  // Uint8ClampedArray<minX, minY, maxX, maxY>
  #bboxesCoords;

  #bboxes;

  #debugMetadata;

  constructor(canvas, operationsCount, recordDebugMetadata = false) {
    this.#canvasWidth = canvas.width;
    this.#canvasHeight = canvas.height;
    this.#initializeBBoxes(operationsCount);
    if (recordDebugMetadata) {
      this.#debugMetadata = new Map();
    }
  }

  growOperationsCount(operationsCount) {
    if (operationsCount >= this.#bboxes.length) {
      this.#initializeBBoxes(operationsCount, this.#bboxes);
    }
  }

  #initializeBBoxes(operationsCount, oldBBoxes) {
    const buffer = new ArrayBuffer(operationsCount * 4);
    this.#bboxesCoords = new Uint8ClampedArray(buffer);
    this.#bboxes = new Uint32Array(buffer);
    if (oldBBoxes && oldBBoxes.length > 0) {
      this.#bboxes.set(oldBBoxes);
      this.#bboxes.fill(EMPTY_BBOX, oldBBoxes.length);
    } else {
      this.#bboxes.fill(EMPTY_BBOX);
    }
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
    this.#clipBox = { __proto__: this.#clipBox };
    this.#savesStack.push(opIdx);

    return this;
  }

  restore(opIdx) {
    const previous = Object.getPrototypeOf(this.#simple);
    if (previous === null) {
      // Sometimes we call more .restore() than .save(), for
      // example when using CanvasGraphics' #restoreInitialState()
      return this;
    }
    this.#simple = previous;
    this.#incremental = Object.getPrototypeOf(this.#incremental);
    this.#clipBox = Object.getPrototypeOf(this.#clipBox);

    const lastSave = this.#savesStack.pop();
    if (lastSave !== undefined) {
      ensureDebugMetadata(this.#debugMetadata, opIdx)?.dependencies.add(
        lastSave
      );
      this.#bboxes[opIdx] = this.#bboxes[lastSave];
    }

    return this;
  }

  /**
   * @param {number} idx
   */
  recordOpenMarker(idx) {
    this.#savesStack.push(idx);
    return this;
  }

  getOpenMarker() {
    if (this.#savesStack.length === 0) {
      return null;
    }
    return this.#savesStack.at(-1);
  }

  recordCloseMarker(opIdx) {
    const lastSave = this.#savesStack.pop();
    if (lastSave !== undefined) {
      ensureDebugMetadata(this.#debugMetadata, opIdx)?.dependencies.add(
        lastSave
      );
      this.#bboxes[opIdx] = this.#bboxes[lastSave];
    }
    return this;
  }

  // Marked content needs a separate stack from save/restore, because they
  // form two independent trees.
  beginMarkedContent(opIdx) {
    this.#markedContentStack.push(opIdx);
    return this;
  }

  endMarkedContent(opIdx) {
    const lastSave = this.#markedContentStack.pop();
    if (lastSave !== undefined) {
      ensureDebugMetadata(this.#debugMetadata, opIdx)?.dependencies.add(
        lastSave
      );
      this.#bboxes[opIdx] = this.#bboxes[lastSave];
    }
    return this;
  }

  pushBaseTransform(ctx) {
    this.#baseTransformStack.push(
      Util.multiplyByDOMMatrix(
        this.#baseTransformStack.at(-1),
        ctx.getTransform()
      )
    );
    return this;
  }

  popBaseTransform() {
    if (this.#baseTransformStack.length > 1) {
      this.#baseTransformStack.pop();
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

  /**
   * @param {SimpleDependency} name
   * @param {string} depName
   * @param {number} fallbackIdx
   */
  recordSimpleDataFromNamed(name, depName, fallbackIdx) {
    this.#simple[name] = this.#namedDependencies.get(depName) ?? fallbackIdx;
  }

  // All next operations, until the next .restore(), will depend on this
  recordFutureForcedDependency(name, idx) {
    this.recordIncrementalData(FORCED_DEPENDENCY_LABEL, idx);
    return this;
  }

  // All next operations, until the next .restore(), will depend on all
  // the already recorded data with the given names.
  inheritSimpleDataAsFutureForcedDependencies(names) {
    for (const name of names) {
      if (name in this.#simple) {
        this.recordFutureForcedDependency(name, this.#simple[name]);
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
    if (this.#pendingBBoxIdx !== idx) {
      this.#pendingBBoxIdx = idx;
      this.#pendingBBox[0] = Infinity;
      this.#pendingBBox[1] = Infinity;
      this.#pendingBBox[2] = -Infinity;
      this.#pendingBBox[3] = -Infinity;
    }
    return this;
  }

  recordClipBox(idx, ctx, minX, maxX, minY, maxY) {
    const transform = Util.multiplyByDOMMatrix(
      this.#baseTransformStack.at(-1),
      ctx.getTransform()
    );
    const clipBox = [Infinity, Infinity, -Infinity, -Infinity];
    Util.axialAlignedBoundingBox([minX, minY, maxX, maxY], transform, clipBox);
    const intersection = Util.intersect(this.#clipBox, clipBox);
    if (intersection) {
      this.#clipBox[0] = intersection[0];
      this.#clipBox[1] = intersection[1];
      this.#clipBox[2] = intersection[2];
      this.#clipBox[3] = intersection[3];
    } else {
      this.#clipBox[0] = this.#clipBox[1] = Infinity;
      this.#clipBox[2] = this.#clipBox[3] = -Infinity;
    }
    return this;
  }

  recordBBox(idx, ctx, minX, maxX, minY, maxY) {
    const clipBox = this.#clipBox;
    if (clipBox[0] === Infinity) {
      return this;
    }

    const transform = Util.multiplyByDOMMatrix(
      this.#baseTransformStack.at(-1),
      ctx.getTransform()
    );
    if (clipBox[0] === -Infinity) {
      Util.axialAlignedBoundingBox(
        [minX, minY, maxX, maxY],
        transform,
        this.#pendingBBox
      );
      return this;
    }

    const bbox = [Infinity, Infinity, -Infinity, -Infinity];
    Util.axialAlignedBoundingBox([minX, minY, maxX, maxY], transform, bbox);
    this.#pendingBBox[0] = Math.min(
      this.#pendingBBox[0],
      Math.max(bbox[0], clipBox[0])
    );
    this.#pendingBBox[1] = Math.min(
      this.#pendingBBox[1],
      Math.max(bbox[1], clipBox[1])
    );
    this.#pendingBBox[2] = Math.max(
      this.#pendingBBox[2],
      Math.min(bbox[2], clipBox[2])
    );
    this.#pendingBBox[3] = Math.max(
      this.#pendingBBox[3],
      Math.min(bbox[3], clipBox[3])
    );
    return this;
  }

  recordCharacterBBox(idx, ctx, font, scale = 1, x = 0, y = 0, getMeasure) {
    const fontBBox = font.bbox;
    let isBBoxTrustworthy;
    let computedBBox;

    if (fontBBox) {
      isBBoxTrustworthy =
        // Only use the bounding box defined by the font if it
        // has a non-empty area.
        fontBBox[2] !== fontBBox[0] &&
        fontBBox[3] !== fontBBox[1] &&
        this.#fontBBoxTrustworthy.get(font);

      if (isBBoxTrustworthy !== false) {
        computedBBox = [0, 0, 0, 0];
        Util.axialAlignedBoundingBox(fontBBox, font.fontMatrix, computedBBox);
        if (scale !== 1 || x !== 0 || y !== 0) {
          Util.scaleMinMax([scale, 0, 0, -scale, x, y], computedBBox);
        }

        if (isBBoxTrustworthy) {
          return this.recordBBox(
            idx,
            ctx,
            computedBBox[0],
            computedBBox[2],
            computedBBox[1],
            computedBBox[3]
          );
        }
      }
    }

    if (!getMeasure) {
      // We have no way of telling how big this character actually is, record
      // a full page bounding box.
      return this.recordFullPageBBox(idx);
    }

    const measure = getMeasure();

    if (fontBBox && computedBBox && isBBoxTrustworthy === undefined) {
      // If it's the first time we can compare the font bbox with the actual
      // bbox measured when drawing it, check if the one recorded in the font
      // is large enough to cover the actual bbox. If it is, we assume that the
      // font is well-formed and we can use the declared bbox without having to
      // measure it again for every character.
      isBBoxTrustworthy =
        computedBBox[0] <= x - measure.actualBoundingBoxLeft &&
        computedBBox[2] >= x + measure.actualBoundingBoxRight &&
        computedBBox[1] <= y - measure.actualBoundingBoxAscent &&
        computedBBox[3] >= y + measure.actualBoundingBoxDescent;
      this.#fontBBoxTrustworthy.set(font, isBBoxTrustworthy);
      if (isBBoxTrustworthy) {
        return this.recordBBox(
          idx,
          ctx,
          computedBBox[0],
          computedBBox[2],
          computedBBox[1],
          computedBBox[3]
        );
      }
    }

    // The font has no bbox or it is not trustworthy, so we need to
    // return the bounding box based on .measureText().
    return this.recordBBox(
      idx,
      ctx,
      x - measure.actualBoundingBoxLeft,
      x + measure.actualBoundingBoxRight,
      y - measure.actualBoundingBoxAscent,
      y + measure.actualBoundingBoxDescent
    );
  }

  recordFullPageBBox(idx) {
    this.#pendingBBox[0] = Math.max(0, this.#clipBox[0]);
    this.#pendingBBox[1] = Math.max(0, this.#clipBox[1]);
    this.#pendingBBox[2] = Math.min(this.#canvasWidth, this.#clipBox[2]);
    this.#pendingBBox[3] = Math.min(this.#canvasHeight, this.#clipBox[3]);

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

  recordNamedDependency(idx, name) {
    if (this.#namedDependencies.has(name)) {
      this.#pendingDependencies.add(this.#namedDependencies.get(name));
    }

    return this;
  }

  /**
   * @param {number} idx
   */
  recordOperation(idx, preserve = false) {
    this.recordDependencies(idx, [FORCED_DEPENDENCY_LABEL]);

    if (this.#debugMetadata) {
      const metadata = ensureDebugMetadata(this.#debugMetadata, idx);
      const { dependencies } = metadata;
      this.#pendingDependencies.forEach(dependencies.add, dependencies);
      this.#savesStack.forEach(dependencies.add, dependencies);
      this.#markedContentStack.forEach(dependencies.add, dependencies);
      dependencies.delete(idx);
      metadata.isRenderingOperation = true;
    }

    if (this.#pendingBBoxIdx === idx) {
      const minX = floor((this.#pendingBBox[0] * 256) / this.#canvasWidth);
      const minY = floor((this.#pendingBBox[1] * 256) / this.#canvasHeight);
      const maxX = ceil((this.#pendingBBox[2] * 256) / this.#canvasWidth);
      const maxY = ceil((this.#pendingBBox[3] * 256) / this.#canvasHeight);

      expandBBox(this.#bboxesCoords, idx, minX, minY, maxX, maxY);
      for (const depIdx of this.#pendingDependencies) {
        if (depIdx !== idx) {
          expandBBox(this.#bboxesCoords, depIdx, minX, minY, maxX, maxY);
        }
      }
      for (const saveIdx of this.#savesStack) {
        if (saveIdx !== idx) {
          expandBBox(this.#bboxesCoords, saveIdx, minX, minY, maxX, maxY);
        }
      }
      for (const saveIdx of this.#markedContentStack) {
        if (saveIdx !== idx) {
          expandBBox(this.#bboxesCoords, saveIdx, minX, minY, maxX, maxY);
        }
      }

      if (!preserve) {
        this.#pendingDependencies.clear();
        this.#pendingBBoxIdx = -1;
      }
    }

    return this;
  }

  recordShowTextOperation(idx, preserve = false) {
    const deps = Array.from(this.#pendingDependencies);
    this.recordOperation(idx, preserve);
    this.recordIncrementalData("sameLineText", idx);
    for (const dep of deps) {
      this.recordIncrementalData("sameLineText", dep);
    }
    return this;
  }

  bboxToClipBoxDropOperation(idx, preserve = false) {
    if (this.#pendingBBoxIdx === idx) {
      this.#pendingBBoxIdx = -1;

      this.#clipBox[0] = Math.max(this.#clipBox[0], this.#pendingBBox[0]);
      this.#clipBox[1] = Math.max(this.#clipBox[1], this.#pendingBBox[1]);
      this.#clipBox[2] = Math.min(this.#clipBox[2], this.#pendingBBox[2]);
      this.#clipBox[3] = Math.min(this.#clipBox[3], this.#pendingBBox[3]);

      if (!preserve) {
        this.#pendingDependencies.clear();
      }
    }
    return this;
  }

  _takePendingDependencies() {
    const pendingDependencies = this.#pendingDependencies;
    this.#pendingDependencies = new Set();
    return pendingDependencies;
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
    this.#fontBBoxTrustworthy.clear();
    return new BBoxReader(this.#bboxes, this.#bboxesCoords);
  }

  takeDebugMetadata() {
    return this.#debugMetadata;
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

  #ignoreBBoxes;

  #nestingLevel = 0;

  #savesLevel = 0;

  constructor(dependencyTracker, opIdx, ignoreBBoxes) {
    if (
      dependencyTracker instanceof CanvasNestedDependencyTracker &&
      dependencyTracker.#ignoreBBoxes === !!ignoreBBoxes
    ) {
      // The goal of CanvasNestedDependencyTracker is to collapse all operations
      // into a single one. If we are already in a
      // CanvasNestedDependencyTracker, that is already happening.
      return dependencyTracker;
    }

    this.#dependencyTracker = dependencyTracker;
    this.#opIdx = opIdx;
    this.#ignoreBBoxes = !!ignoreBBoxes;
  }

  growOperationsCount() {
    throw new Error("Unreachable");
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

  pushBaseTransform(ctx) {
    this.#dependencyTracker.pushBaseTransform(ctx);
    return this;
  }

  popBaseTransform() {
    this.#dependencyTracker.popBaseTransform();
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

  /**
   * @param {SimpleDependency} name
   * @param {string} depName
   * @param {number} fallbackIdx
   */
  recordSimpleDataFromNamed(name, depName, fallbackIdx) {
    this.#dependencyTracker.recordSimpleDataFromNamed(
      name,
      depName,
      this.#opIdx
    );
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
    if (!this.#ignoreBBoxes) {
      this.#dependencyTracker.resetBBox(this.#opIdx);
    }
    return this;
  }

  recordClipBox(idx, ctx, minX, maxX, minY, maxY) {
    if (!this.#ignoreBBoxes) {
      this.#dependencyTracker.recordClipBox(
        this.#opIdx,
        ctx,
        minX,
        maxX,
        minY,
        maxY
      );
    }
    return this;
  }

  recordBBox(idx, ctx, minX, maxX, minY, maxY) {
    if (!this.#ignoreBBoxes) {
      this.#dependencyTracker.recordBBox(
        this.#opIdx,
        ctx,
        minX,
        maxX,
        minY,
        maxY
      );
    }
    return this;
  }

  recordCharacterBBox(idx, ctx, font, scale, x, y, getMeasure) {
    if (!this.#ignoreBBoxes) {
      this.#dependencyTracker.recordCharacterBBox(
        this.#opIdx,
        ctx,
        font,
        scale,
        x,
        y,
        getMeasure
      );
    }
    return this;
  }

  recordFullPageBBox(idx) {
    if (!this.#ignoreBBoxes) {
      this.#dependencyTracker.recordFullPageBBox(this.#opIdx);
    }
    return this;
  }

  getSimpleIndex(dependencyName) {
    return this.#dependencyTracker.getSimpleIndex(dependencyName);
  }

  recordDependencies(idx, dependencyNames) {
    this.#dependencyTracker.recordDependencies(this.#opIdx, dependencyNames);
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
    return this;
  }

  recordShowTextOperation(idx) {
    this.#dependencyTracker.recordShowTextOperation(this.#opIdx, true);
    return this;
  }

  bboxToClipBoxDropOperation(idx) {
    if (!this.#ignoreBBoxes) {
      this.#dependencyTracker.bboxToClipBoxDropOperation(this.#opIdx, true);
    }
    return this;
  }

  take() {
    throw new Error("Unreachable");
  }

  takeDebugMetadata() {
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
    "fontObj",
    "filter",
    "fillColor",
    "textRenderingMode",
    "SMask",
    "fillAlpha",
    "strokeAlpha",
    "globalCompositeOperation",

    "sameLineText",
  ],
  transform: ["transform"],
  transformAndFill: ["transform", "fillColor"],
};

export { CanvasDependencyTracker, CanvasNestedDependencyTracker, Dependencies };
