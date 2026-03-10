/* Copyright 2025 Mozilla Foundation
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

import { FeatureTest, Util } from "../shared/util.js";

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

const ensureDebugMetadata = (map, key) =>
  map?.getOrInsertComputed(key, () => ({
    dependencies: new Set(),
    isRenderingOperation: false,
  }));

// NOTE: CanvasBBoxTracker, CanvasDependencyTracker and
// CanvasNestedDependencyTracker must all have the same interface.

class CanvasBBoxTracker {
  #baseTransformStack = [[1, 0, 0, 1, 0, 0]];

  #currentTransform = [1, 0, 0, 1, 0, 0];

  #transformSaveStack = [];

  #clipBox = [-Infinity, -Infinity, Infinity, Infinity];

  // Float32Array<minX, minY, maxX, maxY>
  #pendingBBox = new Float64Array([Infinity, Infinity, -Infinity, -Infinity]);

  _pendingBBoxIdx = -1;

  #canvasWidth;

  #canvasHeight;

  // Uint8ClampedArray<minX, minY, maxX, maxY>
  #bboxesCoords;

  #bboxes;

  _savesStack = [];

  _markedContentStack = [];

  constructor(canvas, operationsCount) {
    this.#canvasWidth = canvas.width;
    this.#canvasHeight = canvas.height;
    this.#initializeBBoxes(operationsCount);
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

  get clipBox() {
    return this.#clipBox;
  }

  save(opIdx) {
    this.#clipBox = { __proto__: this.#clipBox };
    this.#transformSaveStack.push(this.#currentTransform.slice());
    this._savesStack.push(opIdx);
    return this;
  }

  restore(opIdx, onSavePopped) {
    const previous = Object.getPrototypeOf(this.#clipBox);
    if (previous === null) {
      // Sometimes we call more .restore() than .save(), for
      // example when using CanvasGraphics' #restoreInitialState()
      return this;
    }
    this.#clipBox = previous;
    this.#currentTransform = this.#transformSaveStack.pop();

    const lastSave = this._savesStack.pop();
    if (lastSave !== undefined) {
      onSavePopped?.(lastSave, opIdx);
      this.#bboxes[opIdx] = this.#bboxes[lastSave];
    }
    return this;
  }

  /**
   * @param {number} idx
   */
  recordOpenMarker(idx) {
    this._savesStack.push(idx);
    return this;
  }

  getOpenMarker() {
    if (this._savesStack.length === 0) {
      return null;
    }
    return this._savesStack.at(-1);
  }

  recordCloseMarker(opIdx, onSavePopped) {
    const lastSave = this._savesStack.pop();
    if (lastSave !== undefined) {
      onSavePopped?.(lastSave, opIdx);
      this.#bboxes[opIdx] = this.#bboxes[lastSave];
    }
    return this;
  }

  // Marked content needs a separate stack from save/restore, because they
  // form two independent trees.
  beginMarkedContent(opIdx) {
    this._markedContentStack.push(opIdx);
    return this;
  }

  endMarkedContent(opIdx, onSavePopped) {
    const lastSave = this._markedContentStack.pop();
    if (lastSave !== undefined) {
      onSavePopped?.(lastSave, opIdx);
      this.#bboxes[opIdx] = this.#bboxes[lastSave];
    }
    return this;
  }

  pushBaseTransform() {
    this.#baseTransformStack.push(
      Util.transform(this.#baseTransformStack.at(-1), this.#currentTransform)
    );
    return this;
  }

  popBaseTransform() {
    if (this.#baseTransformStack.length > 1) {
      this.#baseTransformStack.pop();
    }
    return this;
  }

  resetBBox(idx) {
    if (this._pendingBBoxIdx !== idx) {
      this._pendingBBoxIdx = idx;
      this.#pendingBBox[0] = Infinity;
      this.#pendingBBox[1] = Infinity;
      this.#pendingBBox[2] = -Infinity;
      this.#pendingBBox[3] = -Infinity;
    }
    return this;
  }

  recordClipBox(idx, minX, maxX, minY, maxY) {
    const transform = Util.transform(
      this.#baseTransformStack.at(-1),
      this.#currentTransform
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

  recordBBox(idx, minX, maxX, minY, maxY) {
    const clipBox = this.#clipBox;
    if (clipBox[0] === Infinity) {
      return this;
    }

    const transform = Util.transform(
      this.#baseTransformStack.at(-1),
      this.#currentTransform
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

  recordFullPageBBox(idx) {
    this.#pendingBBox[0] = Math.max(0, this.#clipBox[0]);
    this.#pendingBBox[1] = Math.max(0, this.#clipBox[1]);
    this.#pendingBBox[2] = Math.min(this.#canvasWidth, this.#clipBox[2]);
    this.#pendingBBox[3] = Math.min(this.#canvasHeight, this.#clipBox[3]);
    return this;
  }

  /**
   * @param {number} idx
   */
  recordOperation(idx, preserve = false, dependencyLists) {
    if (this._pendingBBoxIdx !== idx) {
      return this;
    }

    const minX = floor((this.#pendingBBox[0] * 256) / this.#canvasWidth);
    const minY = floor((this.#pendingBBox[1] * 256) / this.#canvasHeight);
    const maxX = ceil((this.#pendingBBox[2] * 256) / this.#canvasWidth);
    const maxY = ceil((this.#pendingBBox[3] * 256) / this.#canvasHeight);

    expandBBox(this.#bboxesCoords, idx, minX, minY, maxX, maxY);
    if (dependencyLists) {
      for (const dependencies of dependencyLists) {
        for (const depIdx of dependencies) {
          if (depIdx !== idx) {
            expandBBox(this.#bboxesCoords, depIdx, minX, minY, maxX, maxY);
          }
        }
      }
    }

    if (!preserve) {
      this._pendingBBoxIdx = -1;
    }

    return this;
  }

  bboxToClipBoxDropOperation(idx) {
    if (this._pendingBBoxIdx === idx) {
      this._pendingBBoxIdx = -1;

      this.#clipBox[0] = Math.max(this.#clipBox[0], this.#pendingBBox[0]);
      this.#clipBox[1] = Math.max(this.#clipBox[1], this.#pendingBBox[1]);
      this.#clipBox[2] = Math.min(this.#clipBox[2], this.#pendingBBox[2]);
      this.#clipBox[3] = Math.min(this.#clipBox[3], this.#pendingBBox[3]);
    }
    return this;
  }

  take() {
    return new BBoxReader(this.#bboxes, this.#bboxesCoords);
  }

  takeDebugMetadata() {
    throw new Error("Unreachable");
  }

  recordSimpleData(name, idx) {
    return this;
  }

  recordIncrementalData(name, idx) {
    return this;
  }

  resetIncrementalData(name, idx) {
    return this;
  }

  recordNamedData(name, idx) {
    return this;
  }

  recordSimpleDataFromNamed(name, depName, fallbackIdx) {
    return this;
  }

  recordFutureForcedDependency(name, idx) {
    return this;
  }

  inheritSimpleDataAsFutureForcedDependencies(names) {
    return this;
  }

  inheritPendingDependenciesAsFutureForcedDependencies() {
    return this;
  }

  recordCharacterBBox(idx, font, scale = 1, x = 0, y = 0, getMeasure) {
    return this;
  }

  getTransform() {
    return this.#currentTransform;
  }

  setTransform(a, b, c, d, e, f) {
    this.#currentTransform = [a, b, c, d, e, f];
    return this;
  }

  transform(a, b, c, d, e, f) {
    Util.transformInPlace(this.#currentTransform, [a, b, c, d, e, f]);
    return this;
  }

  translate(tx, ty) {
    const t = this.#currentTransform;
    t[4] += t[0] * tx + t[2] * ty;
    t[5] += t[1] * tx + t[3] * ty;
    return this;
  }

  scale(sx, sy) {
    const t = this.#currentTransform;
    t[0] *= sx;
    t[1] *= sx;
    t[2] *= sy;
    t[3] *= sy;
    return this;
  }

  withLocalTransform(callback) {
    const saved = this.#currentTransform.slice();
    callback(this);
    this.#currentTransform = saved;
    return this;
  }

  getSimpleIndex(dependencyName) {
    return undefined;
  }

  recordDependencies(idx, dependencyNames) {
    return this;
  }

  recordNamedDependency(idx, name) {
    return this;
  }

  recordShowTextOperation(idx, preserve = false) {
    return this;
  }
}

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

  #pendingDependencies = new Set();

  #fontBBoxTrustworthy = new Map();

  #debugMetadata;

  #recordDebugMetadataDepenencyAfterRestore;

  #bboxTracker;

  constructor(bboxTracker, recordDebugMetadata = false) {
    this.#bboxTracker = bboxTracker;
    if (recordDebugMetadata) {
      this.#debugMetadata = new Map();
      this.#recordDebugMetadataDepenencyAfterRestore = (lastSave, opIdx) => {
        ensureDebugMetadata(this.#debugMetadata, opIdx).dependencies.add(
          lastSave
        );
      };
    }
  }

  get clipBox() {
    return this.#bboxTracker.clipBox;
  }

  growOperationsCount(operationsCount) {
    this.#bboxTracker.growOperationsCount(operationsCount);
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
    this.#bboxTracker.save(opIdx);

    return this;
  }

  restore(opIdx) {
    this.#bboxTracker.restore(
      opIdx,
      this.#recordDebugMetadataDepenencyAfterRestore
    );

    const previous = Object.getPrototypeOf(this.#simple);
    if (previous === null) {
      // Sometimes we call more .restore() than .save(), for
      // example when using CanvasGraphics' #restoreInitialState()
      return this;
    }
    this.#simple = previous;
    this.#incremental = Object.getPrototypeOf(this.#incremental);

    return this;
  }

  recordOpenMarker(opIdx) {
    this.#bboxTracker.recordOpenMarker(
      opIdx,
      this.#recordDebugMetadataDepenencyAfterRestore
    );
    return this;
  }

  getOpenMarker() {
    return this.#bboxTracker.getOpenMarker();
  }

  recordCloseMarker(opIdx) {
    this.#bboxTracker.recordCloseMarker(
      opIdx,
      this.#recordDebugMetadataDepenencyAfterRestore
    );
    return this;
  }

  /**
   * @param {number} opIdx
   */
  beginMarkedContent(opIdx) {
    this.#bboxTracker.beginMarkedContent(opIdx);
    return this;
  }

  endMarkedContent(opIdx) {
    this.#bboxTracker.endMarkedContent(
      opIdx,
      this.#recordDebugMetadataDepenencyAfterRestore
    );
    return this;
  }

  pushBaseTransform() {
    this.#bboxTracker.pushBaseTransform();
    return this;
  }

  popBaseTransform() {
    this.#bboxTracker.popBaseTransform();
    return this;
  }

  getTransform() {
    return this.#bboxTracker.getTransform();
  }

  setTransform(a, b, c, d, e, f) {
    this.#bboxTracker.setTransform(a, b, c, d, e, f);
    return this;
  }

  transform(a, b, c, d, e, f) {
    this.#bboxTracker.transform(a, b, c, d, e, f);
    return this;
  }

  translate(tx, ty) {
    this.#bboxTracker.translate(tx, ty);
    return this;
  }

  scale(sx, sy) {
    this.#bboxTracker.scale(sx, sy);
    return this;
  }

  withLocalTransform(callback) {
    this.#bboxTracker.withLocalTransform(() => callback(this));
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
    this.#bboxTracker.resetBBox(idx);
    return this;
  }

  recordClipBox(idx, minX, maxX, minY, maxY) {
    this.#bboxTracker.recordClipBox(idx, minX, maxX, minY, maxY);
    return this;
  }

  recordBBox(idx, minX, maxX, minY, maxY) {
    this.#bboxTracker.recordBBox(idx, minX, maxX, minY, maxY);
    return this;
  }

  recordCharacterBBox(idx, font, scale = 1, x = 0, y = 0, getMeasure) {
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
      x - measure.actualBoundingBoxLeft,
      x + measure.actualBoundingBoxRight,
      y - measure.actualBoundingBoxAscent,
      y + measure.actualBoundingBoxDescent
    );
  }

  recordFullPageBBox(idx) {
    this.#bboxTracker.recordFullPageBBox(idx);
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
      this.#bboxTracker._savesStack.forEach(dependencies.add, dependencies);
      this.#bboxTracker._markedContentStack.forEach(
        dependencies.add,
        dependencies
      );
      dependencies.delete(idx);
      metadata.isRenderingOperation = true;
    }

    const needsCleanup = !preserve && idx === this.#bboxTracker._pendingBBoxIdx;

    this.#bboxTracker.recordOperation(idx, preserve, [
      this.#pendingDependencies,
      this.#bboxTracker._savesStack,
      this.#bboxTracker._markedContentStack,
    ]);

    if (needsCleanup) {
      this.#pendingDependencies.clear();
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
    const needsCleanup = !preserve && idx === this.#bboxTracker._pendingBBoxIdx;
    this.#bboxTracker.bboxToClipBoxDropOperation(idx);
    if (needsCleanup) {
      this.#pendingDependencies.clear();
    }
    return this;
  }

  take() {
    this.#fontBBoxTrustworthy.clear();
    return this.#bboxTracker.take();
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

  get clipBox() {
    return this.#dependencyTracker.clipBox;
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

  pushBaseTransform() {
    this.#dependencyTracker.pushBaseTransform();
    return this;
  }

  popBaseTransform() {
    this.#dependencyTracker.popBaseTransform();
    return this;
  }

  getTransform() {
    return this.#dependencyTracker.getTransform();
  }

  setTransform(a, b, c, d, e, f) {
    this.#dependencyTracker.setTransform(a, b, c, d, e, f);
    return this;
  }

  transform(a, b, c, d, e, f) {
    this.#dependencyTracker.transform(a, b, c, d, e, f);
    return this;
  }

  translate(tx, ty) {
    this.#dependencyTracker.translate(tx, ty);
    return this;
  }

  scale(sx, sy) {
    this.#dependencyTracker.scale(sx, sy);
    return this;
  }

  withLocalTransform(callback) {
    this.#dependencyTracker.withLocalTransform(() => callback(this));
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

  recordClipBox(idx, minX, maxX, minY, maxY) {
    if (!this.#ignoreBBoxes) {
      this.#dependencyTracker.recordClipBox(
        this.#opIdx,
        minX,
        maxX,
        minY,
        maxY
      );
    }
    return this;
  }

  recordBBox(idx, minX, maxX, minY, maxY) {
    if (!this.#ignoreBBoxes) {
      this.#dependencyTracker.recordBBox(this.#opIdx, minX, maxX, minY, maxY);
    }
    return this;
  }

  recordCharacterBBox(idx, font, scale, x, y, getMeasure) {
    if (!this.#ignoreBBoxes) {
      this.#dependencyTracker.recordCharacterBBox(
        this.#opIdx,
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

/**
 * Track the locations of images in the canvas. For each image it computes
 * a bounding box as a potentially rotated rectangle, matching the rotation of
 * the current canvas transform.
 */
class CanvasImagesTracker {
  #canvasWidth;

  #canvasHeight;

  #capacity = 4;

  #count = 0;

  // Array of [x1, y1, x2, y2, x3, y3] coordinates.
  // We need three points to be able to represent a rectangle with a transform
  // applied.
  #coords = new CanvasImagesTracker.#CoordsArray(this.#capacity * 6);

  static #CoordsArray =
    (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) ||
    FeatureTest.isFloat16ArraySupported
      ? Float16Array
      : Float32Array;

  constructor(canvas) {
    this.#canvasWidth = canvas.width;
    this.#canvasHeight = canvas.height;
  }

  record(ctx, width, height, clipBox) {
    if (this.#count === this.#capacity) {
      this.#capacity *= 2;
      const newCoords = new CanvasImagesTracker.#CoordsArray(
        this.#capacity * 6
      );
      newCoords.set(this.#coords);
      this.#coords = newCoords;
    }

    const transform = Util.domMatrixToTransform(ctx.getTransform());

    // We want top left, bottom left, top right.
    // (0, 0) is the bottom left corner.
    let coords;

    if (clipBox[0] !== Infinity) {
      const bbox = [Infinity, Infinity, -Infinity, -Infinity];
      Util.axialAlignedBoundingBox([0, -height, width, 0], transform, bbox);

      const finalBBox = Util.intersect(clipBox, bbox);
      if (!finalBBox) {
        // The image is fully clipped out.
        return;
      }

      const [minX, minY, maxX, maxY] = finalBBox;

      if (
        minX !== bbox[0] ||
        minY !== bbox[1] ||
        maxX !== bbox[2] ||
        maxY !== bbox[3]
      ) {
        // The clip box affects the image drawing. We need to compute a
        // transform that takes the image bbox and fits it into the final bbox,
        // so that we can then apply it to the original image shape (the
        // non-axially-aligned rectangle).
        const rotationAngle = Math.atan2(transform[1], transform[0]);

        // Normalize the angle to be between 0 and 90 degrees.
        const sin = Math.abs(Math.sin(rotationAngle));
        const cos = Math.abs(Math.cos(rotationAngle));

        if (
          sin < 1e-6 ||
          cos < 1e-6 ||
          // The logic in the `else` case gives more accurate bounding boxes for
          // rotated images, but the equation it uses does not give a result
          // when the rotation is exactly 45 degrees, because there are infinite
          // possible rectangles that can fit into the same bbox with that same
          // 45deg rotation. Fallback to returning the whole bbox.
          Math.abs(sin - cos) < 1e-6
        ) {
          coords = [minX, minY, minX, maxY, maxX, minY];
        } else {
          // We cannot just scale the bbox into the original bbox, because that
          // would not preserve the 90deg corners if they have been rotated.
          // We instead need to find the transform that maps the original
          // rectangle into the only rectangle that is rotated by the expected
          // angle and fits into the final bbox.
          //
          // This represents the final bbox, with the top-left corner having
          // coordinates (minX, minY) and the bottom-right corner having
          // coordinates (maxX, maxY). Alpha is the rotation angle, and a and b
          // are helper variables used to compute the effective transform.
          //
          //               ------------b----------
          //              +-----------------------*----+
          //            | |                _ -‾    \   |
          //            a |           _ -‾          \  |
          //            | |alpha _ -‾                \ |
          //            | | _ -‾                      \|
          //              |\                       _ -‾|
          //              | \                 _ -‾     |
          //              |  \           _ -‾          |
          //              |   \     _ -‾               |
          //              +----*-----------------------+

          const finalBBoxWidth = maxX - minX;
          const finalBBoxHeight = maxY - minY;

          const sin2 = sin * sin;
          const cos2 = cos * cos;
          const cosSin = cos * sin;
          const denom = cos2 - sin2;

          const a = (finalBBoxHeight * cos2 - finalBBoxWidth * cosSin) / denom;
          const b = (finalBBoxHeight * cosSin - finalBBoxWidth * sin2) / denom;

          coords = [minX + b, minY, minX, minY + a, maxX, maxY - a];
        }
      }
    }

    if (!coords) {
      coords = [0, -height, 0, 0, width, -height];
      Util.applyTransform(coords, transform, 0);
      Util.applyTransform(coords, transform, 2);
      Util.applyTransform(coords, transform, 4);
    }
    coords[0] /= this.#canvasWidth;
    coords[1] /= this.#canvasHeight;
    coords[2] /= this.#canvasWidth;
    coords[3] /= this.#canvasHeight;
    coords[4] /= this.#canvasWidth;
    coords[5] /= this.#canvasHeight;
    this.#coords.set(coords, this.#count * 6);
    this.#count++;
  }

  take() {
    return this.#coords.subarray(0, this.#count * 6);
  }
}

export {
  CanvasBBoxTracker,
  CanvasDependencyTracker,
  CanvasImagesTracker,
  CanvasNestedDependencyTracker,
  Dependencies,
};
