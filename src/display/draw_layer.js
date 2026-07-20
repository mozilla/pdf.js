/* Copyright 2023 Mozilla Foundation
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

import { DOMSVGFactory } from "./svg_factory.js";
import { shadow } from "../shared/util.js";

/**
 * @typedef DrawLayerOptions
 *   Configuration for {@linkcode DrawLayer}.
 * @property {Object | null} [filterFactory]
 *   Filter factory used to style selections (optional).
 * @property {Object | null} [pageColors]
 *   Page foreground/background colors for HCM (optional).
 * @property {number} pageIndex
 *   Zero-based page index.
 * @property {Element | null} [textLayer]
 *   Text layer element (optional).
 */

/**
 * @typedef EdgeBoundaryResult
 *   Result of {@linkcode normalizeEdgeBoundary}.
 * @property {Node} container
 *   Normalized container.
 * @property {number} offset
 *   Normalized offset.
 */

/**
 * @typedef SelectionRotatorResult
 *   Result of {@linkcode SelectionRotator}.
 * @property {number} x
 *   Rotated X coordinate.
 * @property {number} y
 *   Rotated Y coordinate.
 * @property {number} width
 *   Rotated width.
 * @property {number} height
 *   Rotated height.
 */

/**
 * @callback SelectionRotator
 *   Rotate the coordinates of a rectangle according to the position of the
 *   text layer in the viewport.
 * @param {number} x
 *   X coordinate.
 * @param {number} y
 *   Y coordinate.
 * @param {number} width
 *   Width.
 * @param {number} height
 *   Height.
 * @returns {SelectionRotatorResult}
 *   Rotated coordinates.
 */

/**
 * @typedef TextLayerSelectionData
 *   Data related to the selection for a text layer.
 * @property {DrawLayer} drawLayer
 *   Draw layer associated with the text layer.
 * @property {SVGPathElement | null} [path]
 *   Node (SVG path element) used to draw the selection.
 * @property {HTMLDivElement | null} [selectionDiv]
 *   Node (div element) used to display the selection.
 */

/**
 * Compare the document position of two text layers.
 *
 * @param {Element} a
 *   Text layer.
 * @param {Element} b
 *   Other text layer.
 * @returns {-1 | 0 | 1}
 *    `-1` if the `a` is before `b`, `1` if after, or `0`.
 */
function compareTextLayers(a, b) {
  if (a === b) {
    return 0;
  }
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
    ? -1
    : 1;
}

/**
 * Find the closest text layer upwards.
 *
 * @param {Node | null} node
 *   Node.
 * @returns {Element | null}
 *   Closest ancestral text layer or `null`.
 */
function getTextLayer(node) {
  if (!node) {
    return null;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    return node.closest(".textLayer");
  }
  return node.parentElement?.closest(".textLayer") || null;
}

/**
 * Compare the position of two points in the document order.
 *
 * @param {Node} nodeA
 *   Node.
 * @param {number} offsetA
 *   Offset.
 * @param {Node} nodeB
 *   Other node.
 * @param {number} offsetB
 *   Other offset.
 * @returns {boolean | null}
 *   Whether the first point is before the second one, or `null` if they are
 *   not comparable.
 */
function isPointBefore(nodeA, offsetA, nodeB, offsetB) {
  if (nodeA === nodeB) {
    return offsetA <= offsetB;
  }
  const relation = nodeA.compareDocumentPosition(nodeB);
  if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
    return true;
  }
  if (relation & Node.DOCUMENT_POSITION_PRECEDING) {
    return false;
  }
  return null;
}

/**
 * Normalize the position of a boundary point when it's at the end of a text
 * layer.
 * In that case, we want to move it to the last valid position within
 * the text layer, which can be either the end of the last text node or the end
 * of the last text node before the endOfContent element if it exists.
 *
 * @param {Node} container
 *   Container.
 * @param {number} offset
 *   Offset.
 * @param {Element} textLayer
 *   Text layer.
 * @returns {EdgeBoundaryResult | null}
 *   Normalized position or `null` if the position is not valid.
 */
function normalizeEdgeBoundary(container, offset, textLayer) {
  if (
    container.nodeType !== Node.ELEMENT_NODE ||
    !container.classList.contains("textLayer") ||
    offset !== container.childNodes.length
  ) {
    return { container, offset };
  }
  let lastNode = container.lastChild;
  if (
    lastNode?.nodeType === Node.ELEMENT_NODE &&
    lastNode.classList.contains("endOfContent")
  ) {
    lastNode = lastNode.previousSibling;
  }
  if (!lastNode || !textLayer.contains(lastNode)) {
    return null;
  }
  if (lastNode.nodeType === Node.TEXT_NODE) {
    return { container: lastNode, offset: lastNode.textContent.length };
  }
  return { container: lastNode, offset: lastNode.childNodes.length };
}

/**
 * Manage the SVGs drawn on top of the page canvas.
 * It's important to have them directly on top of the canvas because we want to
 * be able to use mix-blend-mode for some of them.
 */
class DrawLayer {
  #parent = null;

  #mapping = new Map();

  /** @type {Element | null} */
  #textLayer = null;

  /** @type {Object | null} */
  #filterFactory = null;

  /** @type {Object | null} */
  #pageColors = null;

  /** @type {MutationObserver | null} */
  #textLayerObserver = null;

  #toUpdate = new Map();

  static #id = 0;

  static #selectionId = 0;

  /** @type {AbortController | null} */
  static #selectionChangeAC = null;

  /** @type {Set<HTMLDivElement>} */
  static #selections = new Set();

  /** @type {boolean} */
  static #isSelecting = false;

  /** @type {Set<Element>} */
  static #textLayerSet = new Set();

  /** @type {WeakMap<Element, TextLayerSelectionData>} */
  static #textLayers = new WeakMap();

  /**
   * @param {DrawLayerOptions} options
   *   Configuration.
   * @returns
   *   Instance.
   */
  constructor({
    filterFactory = null,
    pageColors = null,
    pageIndex,
    textLayer = null,
  }) {
    this.pageIndex = pageIndex;
    this.#filterFactory = filterFactory;
    this.#pageColors = pageColors;
    if (textLayer) {
      const previousData = DrawLayer.#textLayers.get(textLayer);
      if (previousData?.selectionDiv) {
        previousData.selectionDiv.remove();
        DrawLayer.#selections.delete(previousData.selectionDiv);
      }
      DrawLayer.#textLayers.set(textLayer, { drawLayer: this });
      DrawLayer.#textLayerSet.add(textLayer);
      this.#textLayer = textLayer;
      this.#textLayerObserver = new MutationObserver(records => {
        if (
          !this.#parent ||
          !this.#textLayer?.isConnected ||
          !DrawLayer.#hasSelection()
        ) {
          return;
        }
        for (const { addedNodes } of records) {
          for (const node of addedNodes) {
            if (
              node.nodeType === Node.ELEMENT_NODE &&
              node.classList.contains("endOfContent")
            ) {
              DrawLayer.#selectionChange();
              return;
            }
          }
        }
      });
      this.#textLayerObserver.observe(textLayer, { childList: true });

      if (DrawLayer.#selectionChangeAC === null) {
        DrawLayer.#selectionChangeAC = new AbortController();
        const { signal } = DrawLayer.#selectionChangeAC;
        document.addEventListener(
          "selectionchange",
          DrawLayer.#selectionChange.bind(DrawLayer),
          { signal }
        );
        // Track pointer selection state to preserve selections during
        // cross-boundary drags.
        document.addEventListener(
          "pointerdown",
          () => {
            DrawLayer.#isSelecting = true;
          },
          { signal }
        );
        document.addEventListener(
          "pointerup",
          () => {
            DrawLayer.#isSelecting = false;
          },
          { signal }
        );
        // If the pointer is released outside the window, we may not get a
        // corresponding `pointerup` event.
        window.addEventListener(
          "blur",
          () => {
            DrawLayer.#isSelecting = false;
          },
          { signal }
        );
      }
    }
  }

  setParent(parent) {
    if (!this.#parent) {
      this.#parent = parent;
      // A new text layer just became live (e.g. its page was scrolled into
      // view). If a selection already exists, redraw overlays so that the
      // selection extends into this newly-rendered text layer.
      if (this.#textLayer?.isConnected && DrawLayer.#hasSelection()) {
        DrawLayer.#selectionChange();
      }
      return;
    }

    if (this.#parent !== parent) {
      if (this.#mapping.size > 0) {
        for (const root of this.#mapping.values()) {
          root.remove();
          parent.append(root);
        }
      }
      this.#parent = parent;
    }
  }

  /**
   * Clean up the selection for a text layer.
   *
   * @param {Element} textLayer
   *   Text layer.
   * @returns {undefined}
   *   Nothing.
   */
  static #cleanupTextLayerSelection(textLayer) {
    const textLayerData = this.#textLayers.get(textLayer);
    if (!textLayerData?.selectionDiv) {
      return;
    }
    textLayerData.selectionDiv.remove();
    this.#selections.delete(textLayerData.selectionDiv);
    textLayerData.selectionDiv = null;
    textLayerData.path = null;
  }

  /**
   * @returns {boolean}
   *   Whether there is a non-collapsed document selection.
   */
  static #hasSelection() {
    const selection = document.getSelection();
    return !!selection && !selection.isCollapsed;
  }

  /**
   * @returns {Array<Element>}
   *   Connected text layers sorted in document order.
   */
  static #getOrderedTextLayers() {
    return this.#textLayerSet
      .keys()
      .filter(textLayer => textLayer.isConnected)
      .toArray()
      .sort(compareTextLayers);
  }

  /**
   * Handle `selectionchange` to update the selection display for text layers.
   * We want to display the selection in a separate layer on top of the text
   * layer because the text layer has `mix-blend-mode: multiply` and we want
   * the selection to have a different blend mode.
   *
   * @returns {undefined}
   *   Nothing.
   */
  static #selectionChange() {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed) {
      for (const root of this.#selections) {
        root.remove();
      }
      this.#selections.clear();
      return;
    }
    /** @type {WeakMap<Node, SelectionRotator>} */
    const rotators = new WeakMap();
    const orderedTextLayers = this.#getOrderedTextLayers();
    /** @type {Array<[Range, Element]>} */
    const ranges = [];
    for (let i = 0, ii = selection.rangeCount; i < ii; i++) {
      const range = selection.getRangeAt(i);
      if (range.collapsed) {
        continue;
      }
      let { startContainer, startOffset, endContainer, endOffset } = range;
      let startTextLayer = getTextLayer(startContainer);
      let endTextLayer = getTextLayer(endContainer);
      const startMissing = startTextLayer === null;
      const endMissing = endTextLayer === null;

      // XOR case: exactly one boundary is outside tracked text layers.
      // In Firefox/Safari this can happen transiently while dragging outside
      // the page. Preserve the current overlay and exit early.
      if (this.#isSelecting && startMissing !== endMissing) {
        return;
      }

      if (selection.rangeCount === 1) {
        const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
        const anchorLayer = getTextLayer(anchorNode);
        const focusLayer = getTextLayer(focusNode);
        const anchorBeforeFocus = isPointBefore(
          anchorNode,
          anchorOffset,
          focusNode,
          focusOffset
        );
        if (anchorLayer && focusLayer && anchorBeforeFocus !== null) {
          if (anchorBeforeFocus) {
            startContainer = anchorNode;
            startOffset = anchorOffset;
            startTextLayer = anchorLayer;
            endContainer = focusNode;
            endOffset = focusOffset;
            endTextLayer = focusLayer;
          } else {
            startContainer = focusNode;
            startOffset = focusOffset;
            startTextLayer = focusLayer;
            endContainer = anchorNode;
            endOffset = anchorOffset;
            endTextLayer = anchorLayer;
          }
        }
      }

      const activeTextLayers = orderedTextLayers.filter(textLayer =>
        range.intersectsNode(textLayer)
      );
      if (activeTextLayers.length === 0) {
        continue;
      }

      // If a boundary is outside any text layer, use the selected live text
      // layers as the range edges. This handles Select All, whose DOM range can
      // span ancestors of the text layers.
      let boundarySubstituted = false;
      if (!startTextLayer) {
        startTextLayer = activeTextLayers[0];
        startContainer = startTextLayer;
        startOffset = 0;
        boundarySubstituted = true;
      }
      if (!endTextLayer) {
        endTextLayer = activeTextLayers.at(-1);
        endContainer = endTextLayer;
        endOffset = endTextLayer.childNodes.length;
        boundarySubstituted = true;
      }

      if (endContainer.nodeType === Node.ELEMENT_NODE) {
        if (endContainer.classList.contains("endOfContent")) {
          const previousNode = endContainer.previousSibling;
          if (!previousNode) {
            continue;
          }
          endContainer = previousNode;
          endOffset =
            previousNode.nodeType === Node.TEXT_NODE
              ? previousNode.textContent.length
              : previousNode.childNodes.length;
        } else if (
          endContainer.classList.contains("textLayer") &&
          endContainer.childNodes.length === endOffset
        ) {
          const normalizedEnd = normalizeEdgeBoundary(
            endContainer,
            endOffset,
            endTextLayer
          );
          if (!normalizedEnd) {
            continue;
          }
          endContainer = normalizedEnd.container;
          endOffset = normalizedEnd.offset;
        }
      }

      if (startContainer.nodeType === Node.ELEMENT_NODE) {
        const normalizedStart = normalizeEdgeBoundary(
          startContainer,
          startOffset,
          startTextLayer
        );
        if (!normalizedStart) {
          continue;
        }
        startContainer = normalizedStart.container;
        startOffset = normalizedStart.offset;
      }

      if (
        startTextLayer === endTextLayer &&
        !boundarySubstituted &&
        activeTextLayers.includes(startTextLayer)
      ) {
        ranges.push([range, startTextLayer]);
        continue;
      }

      for (const textLayer of activeTextLayers) {
        const firstNode = textLayer.firstChild;
        if (!firstNode) {
          continue;
        }
        const subRange = document.createRange();
        if (textLayer === startTextLayer) {
          subRange.setStart(startContainer, startOffset);
        } else {
          subRange.setStartBefore(firstNode);
        }

        if (textLayer === endTextLayer) {
          subRange.setEnd(endContainer, endOffset);
        } else {
          const lastNode = textLayer.lastChild;
          if (!lastNode) {
            continue;
          }
          if (
            lastNode.nodeType === Node.ELEMENT_NODE &&
            lastNode.classList.contains("endOfContent")
          ) {
            const lastTextNode = lastNode.previousSibling;
            if (!lastTextNode) {
              continue;
            }
            subRange.setEndAfter(lastTextNode);
          } else {
            subRange.setEndAfter(lastNode);
          }
        }

        if (!subRange.collapsed) {
          ranges.push([subRange, textLayer]);
        }
      }
    }

    /** @type {Set<Element>} */
    const selectedTextLayers = new Set(ranges.map(range => range[1]));

    for (const textLayer of this.#textLayerSet) {
      if (!selectedTextLayers.has(textLayer)) {
        this.#cleanupTextLayerSelection(textLayer);
      }
    }

    for (const [range, textLayer] of ranges) {
      const textLayerData = DrawLayer.#textLayers.get(textLayer);
      if (!textLayerData) {
        continue;
      }

      let rotator = rotators.get(textLayer);
      if (!rotator) {
        const clientRect = textLayer.getBoundingClientRect();

        rotator = (x, y, w, h) => ({
          x: (x - clientRect.x) / clientRect.width,
          y: (y - clientRect.y) / clientRect.height,
          width: w / clientRect.width,
          height: h / clientRect.height,
        });
        rotators.set(textLayer, rotator);
      }
      /** @type {Array<string>} */
      const boxes = [];
      for (let { x, y, width, height } of range.getClientRects()) {
        if (width === 0 || height === 0) {
          continue;
        }
        ({ x, y, width, height } = rotator(x, y, width, height));
        if (width === 1 && height === 1) {
          // The entire page is selected.
          continue;
        }
        boxes.push(`M${x} ${y} h${width} v${height} h-${width} Z`);
      }
      if (boxes.length === 0) {
        continue;
      }
      const drawLayer = textLayerData.drawLayer;
      let div = textLayerData.selectionDiv;
      let path = textLayerData.path;
      if (!div) {
        const clipPathId = `clip_selection_${DrawLayer.#selectionId++}`;

        div = document.createElement("div");
        div.className = "selection";
        div.style.clipPath = `url(#${clipPathId})`;

        const selectionStyle = drawLayer.#filterFactory?.createSelectionStyle(
          drawLayer.#pageColors
        );
        if (selectionStyle) {
          for (const [name, value] of Object.entries(selectionStyle)) {
            div.style.setProperty(name, value);
          }
        }

        const svg = DrawLayer._svgFactory.create(
          1,
          1,
          /* skipDimensions = */ true
        );
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");

        const clipPath = DrawLayer._svgFactory.createElement("clipPath");
        clipPath.setAttribute("id", clipPathId);
        clipPath.setAttribute("clipPathUnits", "objectBoundingBox");

        path = DrawLayer._svgFactory.createElement("path");

        clipPath.append(path);
        svg.append(clipPath);
        div.append(svg);

        textLayerData.path = path;
        textLayerData.selectionDiv = div;
      }

      if (!div.parentNode && drawLayer.#parent) {
        drawLayer.#parent.append(div);
        this.#selections.add(div);
      }

      path.setAttribute("d", boxes.join(" "));
    }
  }

  static get _svgFactory() {
    return shadow(this, "_svgFactory", new DOMSVGFactory());
  }

  static #setBox(element, [x, y, width, height]) {
    const { style } = element;
    style.top = `${100 * y}%`;
    style.left = `${100 * x}%`;
    style.width = `${100 * width}%`;
    style.height = `${100 * height}%`;
  }

  #createSVG() {
    const svg = DrawLayer._svgFactory.create(1, 1, /* skipDimensions = */ true);
    this.#parent.append(svg);
    svg.setAttribute("aria-hidden", "true");

    return svg;
  }

  #createClipPath(defs, pathId) {
    const clipPath = DrawLayer._svgFactory.createElement("clipPath");
    defs.append(clipPath);
    const clipPathId = `clip_${pathId}`;
    clipPath.setAttribute("id", clipPathId);
    clipPath.setAttribute("clipPathUnits", "objectBoundingBox");
    const clipPathUse = DrawLayer._svgFactory.createElement("use");
    clipPath.append(clipPathUse);
    clipPathUse.setAttribute("href", `#${pathId}`);
    clipPathUse.classList.add("clip");

    return clipPathId;
  }

  #updateProperties(element, properties) {
    for (const [key, value] of Object.entries(properties)) {
      if (value === null) {
        element.removeAttribute(key);
      } else {
        element.setAttribute(key, value);
      }
    }
  }

  draw(properties, isPathUpdatable = false, hasClip = false) {
    const id = DrawLayer.#id++;
    const root = this.#createSVG();

    const defs = DrawLayer._svgFactory.createElement("defs");
    root.append(defs);
    const path = DrawLayer._svgFactory.createElement("path");
    defs.append(path);
    const pathId = `path_${id}`;
    path.setAttribute("id", pathId);
    path.setAttribute("vector-effect", "non-scaling-stroke");

    if (isPathUpdatable) {
      this.#toUpdate.set(id, path);
    }

    // Create the clipping path for the editor div.
    const clipPathId = hasClip ? this.#createClipPath(defs, pathId) : null;

    const use = DrawLayer._svgFactory.createElement("use");
    root.append(use);
    use.setAttribute("href", `#${pathId}`);
    this.updateProperties(root, properties);

    this.#mapping.set(id, root);

    return { id, clipPathId: `url(#${clipPathId})` };
  }

  drawOutline(properties, mustRemoveSelfIntersections) {
    // We cannot draw the outline directly in the SVG for highlights because
    // it composes with its parent with mix-blend-mode: multiply.
    // But the outline has a different mix-blend-mode, so we need to draw it in
    // its own SVG.
    const id = DrawLayer.#id++;
    const root = this.#createSVG();
    const defs = DrawLayer._svgFactory.createElement("defs");
    root.append(defs);
    const path = DrawLayer._svgFactory.createElement("path");
    defs.append(path);
    const pathId = `path_${id}`;
    path.setAttribute("id", pathId);
    path.setAttribute("vector-effect", "non-scaling-stroke");

    let maskId;
    if (mustRemoveSelfIntersections) {
      const mask = DrawLayer._svgFactory.createElement("mask");
      defs.append(mask);
      maskId = `mask_${id}`;
      mask.setAttribute("id", maskId);
      mask.setAttribute("maskUnits", "objectBoundingBox");
      const rect = DrawLayer._svgFactory.createElement("rect");
      mask.append(rect);
      rect.setAttribute("width", "1");
      rect.setAttribute("height", "1");
      rect.setAttribute("fill", "white");
      const use = DrawLayer._svgFactory.createElement("use");
      mask.append(use);
      use.setAttribute("href", `#${pathId}`);
      use.setAttribute("stroke", "none");
      use.setAttribute("fill", "black");
      use.setAttribute("fill-rule", "nonzero");
      use.classList.add("mask");
    }

    const use1 = DrawLayer._svgFactory.createElement("use");
    root.append(use1);
    use1.setAttribute("href", `#${pathId}`);
    if (maskId) {
      use1.setAttribute("mask", `url(#${maskId})`);
    }
    const use2 = use1.cloneNode();
    root.append(use2);
    use1.classList.add("mainOutline");
    use2.classList.add("secondaryOutline");

    this.updateProperties(root, properties);

    this.#mapping.set(id, root);

    return id;
  }

  finalizeDraw(id, properties) {
    this.#toUpdate.delete(id);
    this.updateProperties(id, properties);
  }

  updateProperties(elementOrId, properties) {
    if (!properties) {
      return;
    }
    const { root, bbox, rootClass, path } = properties;
    const element =
      typeof elementOrId === "number"
        ? this.#mapping.get(elementOrId)
        : elementOrId;
    if (!element) {
      return;
    }
    if (root) {
      this.#updateProperties(element, root);
    }
    if (bbox) {
      DrawLayer.#setBox(element, bbox);
    }
    if (rootClass) {
      const { classList } = element;
      for (const [className, value] of Object.entries(rootClass)) {
        classList.toggle(className, value);
      }
    }
    if (path) {
      const defs = element.firstElementChild;
      const pathElement = defs.firstElementChild;
      this.#updateProperties(pathElement, path);
    }
  }

  /**
   * The SVGs live in the canvas wrapper whereas the editor divs live in the
   * annotation editor layer: both are siblings, hence the SVGs must carry the
   * same z-index as their editor in order to be stacked with them.
   *
   * @param {number} id
   * @param {number} zIndex
   * @returns {undefined}
   */
  updateZIndex(id, zIndex) {
    const root = this.#mapping.get(id);
    if (root) {
      root.style.zIndex = zIndex;
    }
  }

  updateParent(id, layer) {
    if (layer === this) {
      return;
    }
    const root = this.#mapping.get(id);
    if (!root) {
      return;
    }
    layer.#parent.append(root);
    this.#mapping.delete(id);
    layer.#mapping.set(id, root);
  }

  remove(id) {
    this.#toUpdate.delete(id);
    if (this.#parent === null) {
      return;
    }
    this.#mapping.get(id).remove();
    this.#mapping.delete(id);
  }

  destroy() {
    this.#parent = null;
    for (const root of this.#mapping.values()) {
      root.remove();
    }
    this.#mapping.clear();
    this.#toUpdate.clear();
    this.#textLayerObserver?.disconnect();
    this.#textLayerObserver = null;
    if (this.#textLayer) {
      const data = DrawLayer.#textLayers.get(this.#textLayer);
      if (data?.drawLayer === this) {
        DrawLayer.#cleanupTextLayerSelection(this.#textLayer);
        DrawLayer.#textLayers.delete(this.#textLayer);
        DrawLayer.#textLayerSet.delete(this.#textLayer);
        if (DrawLayer.#textLayerSet.size === 0) {
          DrawLayer.#selectionChangeAC?.abort();
          DrawLayer.#selectionChangeAC = null;
          DrawLayer.#isSelecting = false;
        }
      }
      this.#textLayer = null;
    }
  }
}

export { DrawLayer };
