/* Copyright 2022 Mozilla Foundation
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

import {
  AnnotationEditorParamsType,
  AnnotationEditorType,
  Util,
} from "../../shared/util.js";
import { AnnotationEditor } from "./editor.js";
import { InkAnnotationElement } from "../annotation_layer.js";
import { opacityToHex } from "./tools.js";

/**
 * Basic draw editor in order to generate an Ink annotation.
 */
class InkEditor extends AnnotationEditor {
  #baseHeight = 0;

  #baseWidth = 0;

  #boundCanvasContextMenu = this.canvasContextMenu.bind(this);

  #boundCanvasPointermove = this.canvasPointermove.bind(this);

  #boundCanvasPointerleave = this.canvasPointerleave.bind(this);

  #boundCanvasPointerup = this.canvasPointerup.bind(this);

  #boundCanvasPointerdown = this.canvasPointerdown.bind(this);

  #currentPath2D = new Path2D();

  #disableEditing = false;

  #hasSomethingToDraw = false;

  #isCanvasInitialized = false;

  #observer = null;

  #realWidth = 0;

  #realHeight = 0;

  #requestFrameCallback = null;

  static _defaultColor = null;

  static _defaultOpacity = 1;

  static _defaultThickness = 1;

  static _type = "ink";

  constructor(params) {
    super({ ...params, name: "inkEditor" });
    this.color = params.color || null;
    this.thickness = params.thickness || null;
    this.opacity = params.opacity || null;
    this.paths = [];
    this.bezierPath2D = [];
    this.allRawPaths = [];
    this.currentPath = [];
    this.scaleFactor = 1;
    this.translationX = this.translationY = 0;
    this.x = 0;
    this.y = 0;
    this._willKeepAspectRatio = true;
  }

  /** @inheritdoc */
  static initialize(l10n) {
    AnnotationEditor.initialize(l10n, {
      strings: ["editor_ink_canvas_aria_label", "editor_ink2_aria_label"],
    });
  }

  /** @inheritdoc */
  static updateDefaultParams(type, value) {
    switch (type) {
      case AnnotationEditorParamsType.INK_THICKNESS:
        InkEditor._defaultThickness = value;
        break;
      case AnnotationEditorParamsType.INK_COLOR:
        InkEditor._defaultColor = value;
        break;
      case AnnotationEditorParamsType.INK_OPACITY:
        InkEditor._defaultOpacity = value / 100;
        break;
    }
  }

  /** @inheritdoc */
  updateParams(type, value) {
    switch (type) {
      case AnnotationEditorParamsType.INK_THICKNESS:
        this.#updateThickness(value);
        break;
      case AnnotationEditorParamsType.INK_COLOR:
        this.#updateColor(value);
        break;
      case AnnotationEditorParamsType.INK_OPACITY:
        this.#updateOpacity(value);
        break;
    }
  }

  /** @inheritdoc */
  static get defaultPropertiesToUpdate() {
    return [
      [AnnotationEditorParamsType.INK_THICKNESS, InkEditor._defaultThickness],
      [
        AnnotationEditorParamsType.INK_COLOR,
        InkEditor._defaultColor || AnnotationEditor._defaultLineColor,
      ],
      [
        AnnotationEditorParamsType.INK_OPACITY,
        Math.round(InkEditor._defaultOpacity * 100),
      ],
    ];
  }

  /** @inheritdoc */
  get propertiesToUpdate() {
    return [
      [
        AnnotationEditorParamsType.INK_THICKNESS,
        this.thickness || InkEditor._defaultThickness,
      ],
      [
        AnnotationEditorParamsType.INK_COLOR,
        this.color ||
          InkEditor._defaultColor ||
          AnnotationEditor._defaultLineColor,
      ],
      [
        AnnotationEditorParamsType.INK_OPACITY,
        Math.round(100 * (this.opacity ?? InkEditor._defaultOpacity)),
      ],
    ];
  }

  /**
   * Update the thickness and make this action undoable.
   * @param {number} thickness
   */
  #updateThickness(thickness) {
    const savedThickness = this.thickness;
    this.addCommands({
      cmd: () => {
        this.thickness = thickness;
        this.#fitToContent();
      },
      undo: () => {
        this.thickness = savedThickness;
        this.#fitToContent();
      },
      mustExec: true,
      type: AnnotationEditorParamsType.INK_THICKNESS,
      overwriteIfSameType: true,
      keepUndo: true,
    });
  }

  /**
   * Update the color and make this action undoable.
   * @param {string} color
   */
  #updateColor(color) {
    const savedColor = this.color;
    this.addCommands({
      cmd: () => {
        this.color = color;
        this.#redraw();
      },
      undo: () => {
        this.color = savedColor;
        this.#redraw();
      },
      mustExec: true,
      type: AnnotationEditorParamsType.INK_COLOR,
      overwriteIfSameType: true,
      keepUndo: true,
    });
  }

  /**
   * Update the opacity and make this action undoable.
   * @param {number} opacity
   */
  #updateOpacity(opacity) {
    opacity /= 100;
    const savedOpacity = this.opacity;
    this.addCommands({
      cmd: () => {
        this.opacity = opacity;
        this.#redraw();
      },
      undo: () => {
        this.opacity = savedOpacity;
        this.#redraw();
      },
      mustExec: true,
      type: AnnotationEditorParamsType.INK_OPACITY,
      overwriteIfSameType: true,
      keepUndo: true,
    });
  }

  /** @inheritdoc */
  rebuild() {
    if (!this.parent) {
      return;
    }
    super.rebuild();
    if (this.div === null) {
      return;
    }

    if (!this.canvas) {
      this.#createCanvas();
      this.#createObserver();
    }

    if (!this.isAttachedToDOM) {
      // At some point this editor was removed and we're rebuilding it,
      // hence we must add it to its parent.
      this.parent.add(this);
      this.#setCanvasDims();
    }
    this.#fitToContent();
  }

  /** @inheritdoc */
  remove() {
    if (this.canvas === null) {
      return;
    }

    if (!this.isEmpty()) {
      this.commit();
    }

    // Destroy the canvas.
    this.canvas.width = this.canvas.height = 0;
    this.canvas.remove();
    this.canvas = null;

    this.#observer.disconnect();
    this.#observer = null;

    super.remove();
  }

  setParent(parent) {
    if (!this.parent && parent) {
      // We've a parent hence the rescale will be handled thanks to the
      // ResizeObserver.
      this._uiManager.removeShouldRescale(this);
    } else if (this.parent && parent === null) {
      // The editor is removed from the DOM, hence we handle the rescale thanks
      // to the onScaleChanging callback.
      // This way, it'll be saved/printed correctly.
      this._uiManager.addShouldRescale(this);
    }
    super.setParent(parent);
  }

  onScaleChanging() {
    const [parentWidth, parentHeight] = this.parentDimensions;
    const width = this.width * parentWidth;
    const height = this.height * parentHeight;
    this.setDimensions(width, height);
  }

  /** @inheritdoc */
  enableEditMode() {
    if (this.#disableEditing || this.canvas === null) {
      return;
    }

    super.enableEditMode();
    this._isDraggable = false;
    this.canvas.addEventListener("pointerdown", this.#boundCanvasPointerdown);
  }

  /** @inheritdoc */
  disableEditMode() {
    if (!this.isInEditMode() || this.canvas === null) {
      return;
    }

    super.disableEditMode();
    this._isDraggable = !this.isEmpty();
    this.div.classList.remove("editing");

    this.canvas.removeEventListener(
      "pointerdown",
      this.#boundCanvasPointerdown
    );
  }

  /** @inheritdoc */
  onceAdded() {
    this._isDraggable = !this.isEmpty();
  }

  /** @inheritdoc */
  isEmpty() {
    return (
      this.paths.length === 0 ||
      (this.paths.length === 1 && this.paths[0].length === 0)
    );
  }

  #getInitialBBox() {
    const {
      parentRotation,
      parentDimensions: [width, height],
    } = this;
    switch (parentRotation) {
      case 90:
        return [0, height, height, width];
      case 180:
        return [width, height, width, height];
      case 270:
        return [width, 0, height, width];
      default:
        return [0, 0, width, height];
    }
  }

  /**
   * Set line styles.
   */
  #setStroke() {
    const { ctx, color, opacity, thickness, parentScale, scaleFactor } = this;
    ctx.lineWidth = (thickness * parentScale) / scaleFactor;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.miterLimit = 10;
    ctx.strokeStyle = `${color}${opacityToHex(opacity)}`;
  }

  /**
   * Start to draw on the canvas.
   * @param {number} x
   * @param {number} y
   */
  #startDrawing(x, y) {
    this.canvas.addEventListener("contextmenu", this.#boundCanvasContextMenu);
    this.canvas.addEventListener("pointerleave", this.#boundCanvasPointerleave);
    this.canvas.addEventListener("pointermove", this.#boundCanvasPointermove);
    this.canvas.addEventListener("pointerup", this.#boundCanvasPointerup);
    this.canvas.removeEventListener(
      "pointerdown",
      this.#boundCanvasPointerdown
    );

    this.isEditing = true;
    if (!this.#isCanvasInitialized) {
      this.#isCanvasInitialized = true;
      this.#setCanvasDims();
      this.thickness ||= InkEditor._defaultThickness;
      this.color ||=
        InkEditor._defaultColor || AnnotationEditor._defaultLineColor;
      this.opacity ??= InkEditor._defaultOpacity;
    }
    this.currentPath.push([x, y]);
    this.#hasSomethingToDraw = false;
    this.#setStroke();

    this.#requestFrameCallback = () => {
      this.#drawPoints();
      if (this.#requestFrameCallback) {
        window.requestAnimationFrame(this.#requestFrameCallback);
      }
    };
    window.requestAnimationFrame(this.#requestFrameCallback);
  }

  /**
   * Draw on the canvas.
   * @param {number} x
   * @param {number} y
   */
  #draw(x, y) {
    const [lastX, lastY] = this.currentPath.at(-1);
    if (this.currentPath.length > 1 && x === lastX && y === lastY) {
      return;
    }
    const currentPath = this.currentPath;
    let path2D = this.#currentPath2D;
    currentPath.push([x, y]);
    this.#hasSomethingToDraw = true;

    if (currentPath.length <= 2) {
      path2D.moveTo(...currentPath[0]);
      path2D.lineTo(x, y);
      return;
    }

    if (currentPath.length === 3) {
      this.#currentPath2D = path2D = new Path2D();
      path2D.moveTo(...currentPath[0]);
    }

    this.#makeBezierCurve(
      path2D,
      ...currentPath.at(-3),
      ...currentPath.at(-2),
      x,
      y
    );
  }

  #endPath() {
    if (this.currentPath.length === 0) {
      return;
    }
    const lastPoint = this.currentPath.at(-1);
    this.#currentPath2D.lineTo(...lastPoint);
  }

  /**
   * Stop to draw on the canvas.
   * @param {number} x
   * @param {number} y
   */
  #stopDrawing(x, y) {
    this.#requestFrameCallback = null;

    x = Math.min(Math.max(x, 0), this.canvas.width);
    y = Math.min(Math.max(y, 0), this.canvas.height);

    this.#draw(x, y);
    this.#endPath();

    // Interpolate the path entered by the user with some
    // Bezier's curves in order to have a smoother path and
    // to reduce the data size used to draw it in the PDF.
    let bezier;
    if (this.currentPath.length !== 1) {
      bezier = this.#generateBezierPoints();
    } else {
      // We have only one point finally.
      const xy = [x, y];
      bezier = [[xy, xy.slice(), xy.slice(), xy]];
    }
    const path2D = this.#currentPath2D;
    const currentPath = this.currentPath;
    this.currentPath = [];
    this.#currentPath2D = new Path2D();

    const cmd = () => {
      this.allRawPaths.push(currentPath);
      this.paths.push(bezier);
      this.bezierPath2D.push(path2D);
      this.rebuild();
    };

    const undo = () => {
      this.allRawPaths.pop();
      this.paths.pop();
      this.bezierPath2D.pop();
      if (this.paths.length === 0) {
        this.remove();
      } else {
        if (!this.canvas) {
          this.#createCanvas();
          this.#createObserver();
        }
        this.#fitToContent();
      }
    };

    this.addCommands({ cmd, undo, mustExec: true });
  }

  #drawPoints() {
    if (!this.#hasSomethingToDraw) {
      return;
    }
    this.#hasSomethingToDraw = false;

    const thickness = Math.ceil(this.thickness * this.parentScale);
    const lastPoints = this.currentPath.slice(-3);
    const x = lastPoints.map(xy => xy[0]);
    const y = lastPoints.map(xy => xy[1]);
    const xMin = Math.min(...x) - thickness;
    const xMax = Math.max(...x) + thickness;
    const yMin = Math.min(...y) - thickness;
    const yMax = Math.max(...y) + thickness;

    const { ctx } = this;
    ctx.save();

    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
      // In Chrome, the clip() method doesn't work as expected.
      ctx.clearRect(xMin, yMin, xMax - xMin, yMax - yMin);
      ctx.beginPath();
      ctx.rect(xMin, yMin, xMax - xMin, yMax - yMin);
      ctx.clip();
    } else {
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    for (const path of this.bezierPath2D) {
      ctx.stroke(path);
    }
    ctx.stroke(this.#currentPath2D);

    ctx.restore();
  }

  #makeBezierCurve(path2D, x0, y0, x1, y1, x2, y2) {
    const prevX = (x0 + x1) / 2;
    const prevY = (y0 + y1) / 2;
    const x3 = (x1 + x2) / 2;
    const y3 = (y1 + y2) / 2;

    path2D.bezierCurveTo(
      prevX + (2 * (x1 - prevX)) / 3,
      prevY + (2 * (y1 - prevY)) / 3,
      x3 + (2 * (x1 - x3)) / 3,
      y3 + (2 * (y1 - y3)) / 3,
      x3,
      y3
    );
  }

  #generateBezierPoints() {
    const path = this.currentPath;
    if (path.length <= 2) {
      return [[path[0], path[0], path.at(-1), path.at(-1)]];
    }

    const bezierPoints = [];
    let i;
    let [x0, y0] = path[0];
    for (i = 1; i < path.length - 2; i++) {
      const [x1, y1] = path[i];
      const [x2, y2] = path[i + 1];
      const x3 = (x1 + x2) / 2;
      const y3 = (y1 + y2) / 2;

      // The quadratic is: [[x0, y0], [x1, y1], [x3, y3]].
      // Convert the quadratic to a cubic
      // (see https://fontforge.org/docs/techref/bezier.html#converting-truetype-to-postscript)
      const control1 = [x0 + (2 * (x1 - x0)) / 3, y0 + (2 * (y1 - y0)) / 3];
      const control2 = [x3 + (2 * (x1 - x3)) / 3, y3 + (2 * (y1 - y3)) / 3];

      bezierPoints.push([[x0, y0], control1, control2, [x3, y3]]);

      [x0, y0] = [x3, y3];
    }

    const [x1, y1] = path[i];
    const [x2, y2] = path[i + 1];

    // The quadratic is: [[x0, y0], [x1, y1], [x2, y2]].
    const control1 = [x0 + (2 * (x1 - x0)) / 3, y0 + (2 * (y1 - y0)) / 3];
    const control2 = [x2 + (2 * (x1 - x2)) / 3, y2 + (2 * (y1 - y2)) / 3];

    bezierPoints.push([[x0, y0], control1, control2, [x2, y2]]);
    return bezierPoints;
  }

  /**
   * Redraw all the paths.
   */
  #redraw() {
    if (this.isEmpty()) {
      this.#updateTransform();
      return;
    }
    this.#setStroke();

    const { canvas, ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.#updateTransform();

    for (const path of this.bezierPath2D) {
      ctx.stroke(path);
    }
  }

  /**
   * Commit the curves we have in this editor.
   */
  commit() {
    if (this.#disableEditing) {
      return;
    }

    super.commit();

    this.isEditing = false;
    this.disableEditMode();

    // This editor must be on top of the main ink editor.
    this.setInForeground();

    this.#disableEditing = true;
    this.div.classList.add("disabled");

    this.#fitToContent(/* firstTime = */ true);
    this.makeResizable();

    this.parent.addInkEditorIfNeeded(/* isCommitting = */ true);

    // When commiting, the position of this editor is changed, hence we must
    // move it to the right position in the DOM.
    this.moveInDOM();
    this.div.focus({
      preventScroll: true /* See issue #15744 */,
    });
  }

  /** @inheritdoc */
  focusin(event) {
    if (!this._focusEventsAllowed) {
      return;
    }
    super.focusin(event);
    this.enableEditMode();
  }

  /**
   * onpointerdown callback for the canvas we're drawing on.
   * @param {PointerEvent} event
   */
  canvasPointerdown(event) {
    if (event.button !== 0 || !this.isInEditMode() || this.#disableEditing) {
      return;
    }

    // We want to draw on top of any other editors.
    // Since it's the last child, there's no need to give it a higher z-index.
    this.setInForeground();

    event.preventDefault();

    if (event.type !== "mouse") {
      this.div.focus();
    }

    this.#startDrawing(event.offsetX, event.offsetY);
  }

  /**
   * oncontextmenu callback for the canvas we're drawing on.
   * @param {PointerEvent} event
   */
  canvasContextMenu(event) {
    event.preventDefault();
  }

  /**
   * onpointermove callback for the canvas we're drawing on.
   * @param {PointerEvent} event
   */
  canvasPointermove(event) {
    event.preventDefault();
    this.#draw(event.offsetX, event.offsetY);
  }

  /**
   * onpointerup callback for the canvas we're drawing on.
   * @param {PointerEvent} event
   */
  canvasPointerup(event) {
    event.preventDefault();
    this.#endDrawing(event);
  }

  /**
   * onpointerleave callback for the canvas we're drawing on.
   * @param {PointerEvent} event
   */
  canvasPointerleave(event) {
    this.#endDrawing(event);
  }

  /**
   * End the drawing.
   * @param {PointerEvent} event
   */
  #endDrawing(event) {
    this.canvas.removeEventListener(
      "pointerleave",
      this.#boundCanvasPointerleave
    );
    this.canvas.removeEventListener(
      "pointermove",
      this.#boundCanvasPointermove
    );
    this.canvas.removeEventListener("pointerup", this.#boundCanvasPointerup);
    this.canvas.addEventListener("pointerdown", this.#boundCanvasPointerdown);

    // Slight delay to avoid the context menu to appear (it can happen on a long
    // tap with a pen).
    setTimeout(() => {
      this.canvas.removeEventListener(
        "contextmenu",
        this.#boundCanvasContextMenu
      );
    }, 10);

    this.#stopDrawing(event.offsetX, event.offsetY);

    this.addToAnnotationStorage();

    // Since the ink editor covers all of the page and we want to be able
    // to select another editor, we just put this one in the background.
    this.setInBackground();
  }

  /**
   * Create the canvas element.
   */
  #createCanvas() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.canvas.height = 0;
    this.canvas.className = "inkEditorCanvas";

    AnnotationEditor._l10nPromise
      .get("editor_ink_canvas_aria_label")
      .then(msg => this.canvas?.setAttribute("aria-label", msg));
    this.div.append(this.canvas);
    this.ctx = this.canvas.getContext("2d");
  }

  /**
   * Create the resize observer.
   */
  #createObserver() {
    this.#observer = new ResizeObserver(entries => {
      const rect = entries[0].contentRect;
      if (rect.width && rect.height) {
        this.setDimensions(rect.width, rect.height);
      }
    });
    this.#observer.observe(this.div);
  }

  /** @inheritdoc */
  get isResizable() {
    return !this.isEmpty() && this.#disableEditing;
  }

  /** @inheritdoc */
  render() {
    if (this.div) {
      return this.div;
    }

    let baseX, baseY;
    if (this.width) {
      baseX = this.x;
      baseY = this.y;
    }

    super.render();

    AnnotationEditor._l10nPromise
      .get("editor_ink2_aria_label")
      .then(msg => this.div?.setAttribute("aria-label", msg));

    const [x, y, w, h] = this.#getInitialBBox();
    this.setAt(x, y, 0, 0);
    this.setDims(w, h);

    this.#createCanvas();

    if (this.width) {
      // This editor was created in using copy (ctrl+c).
      const [parentWidth, parentHeight] = this.parentDimensions;
      this.setAspectRatio(this.width * parentWidth, this.height * parentHeight);
      this.setAt(
        baseX * parentWidth,
        baseY * parentHeight,
        this.width * parentWidth,
        this.height * parentHeight
      );
      this.#isCanvasInitialized = true;
      this.#setCanvasDims();
      this.setDims(this.width * parentWidth, this.height * parentHeight);
      this.#redraw();
      this.div.classList.add("disabled");
    } else {
      this.div.classList.add("editing");
      this.enableEditMode();
    }

    this.#createObserver();

    return this.div;
  }

  #setCanvasDims() {
    if (!this.#isCanvasInitialized) {
      return;
    }
    const [parentWidth, parentHeight] = this.parentDimensions;
    this.canvas.width = Math.ceil(this.width * parentWidth);
    this.canvas.height = Math.ceil(this.height * parentHeight);
    this.#updateTransform();
  }

  /**
   * When the dimensions of the div change the inner canvas must
   * renew its dimensions, hence it must redraw its own contents.
   * @param {number} width - the new width of the div
   * @param {number} height - the new height of the div
   * @returns
   */
  setDimensions(width, height) {
    const roundedWidth = Math.round(width);
    const roundedHeight = Math.round(height);
    if (
      this.#realWidth === roundedWidth &&
      this.#realHeight === roundedHeight
    ) {
      return;
    }

    this.#realWidth = roundedWidth;
    this.#realHeight = roundedHeight;

    this.canvas.style.visibility = "hidden";

    const [parentWidth, parentHeight] = this.parentDimensions;
    this.width = width / parentWidth;
    this.height = height / parentHeight;
    this.fixAndSetPosition();

    if (this.#disableEditing) {
      this.#setScaleFactor(width, height);
    }

    this.#setCanvasDims();
    this.#redraw();

    this.canvas.style.visibility = "visible";

    // For any reason the dimensions couldn't be in percent but in pixels, hence
    // we must fix them.
    this.fixDims();
  }

  #setScaleFactor(width, height) {
    const padding = this.#getPadding();
    const scaleFactorW = (width - padding) / this.#baseWidth;
    const scaleFactorH = (height - padding) / this.#baseHeight;
    this.scaleFactor = Math.min(scaleFactorW, scaleFactorH);
  }

  /**
   * Update the canvas transform.
   */
  #updateTransform() {
    const padding = this.#getPadding() / 2;
    this.ctx.setTransform(
      this.scaleFactor,
      0,
      0,
      this.scaleFactor,
      this.translationX * this.scaleFactor + padding,
      this.translationY * this.scaleFactor + padding
    );
  }

  /**
   * Convert into a Path2D.
   * @param {Array<Array<number>>} bezier
   * @returns {Path2D}
   */
  static #buildPath2D(bezier) {
    const path2D = new Path2D();
    for (let i = 0, ii = bezier.length; i < ii; i++) {
      const [first, control1, control2, second] = bezier[i];
      if (i === 0) {
        path2D.moveTo(...first);
      }
      path2D.bezierCurveTo(
        control1[0],
        control1[1],
        control2[0],
        control2[1],
        second[0],
        second[1]
      );
    }
    return path2D;
  }

  static #toPDFCoordinates(points, rect, rotation) {
    const [blX, blY, trX, trY] = rect;

    switch (rotation) {
      case 0:
        for (let i = 0, ii = points.length; i < ii; i += 2) {
          points[i] += blX;
          points[i + 1] = trY - points[i + 1];
        }
        break;
      case 90:
        for (let i = 0, ii = points.length; i < ii; i += 2) {
          const x = points[i];
          points[i] = points[i + 1] + blX;
          points[i + 1] = x + blY;
        }
        break;
      case 180:
        for (let i = 0, ii = points.length; i < ii; i += 2) {
          points[i] = trX - points[i];
          points[i + 1] += blY;
        }
        break;
      case 270:
        for (let i = 0, ii = points.length; i < ii; i += 2) {
          const x = points[i];
          points[i] = trX - points[i + 1];
          points[i + 1] = trY - x;
        }
        break;
      default:
        throw new Error("Invalid rotation");
    }
    return points;
  }

  static #fromPDFCoordinates(points, rect, rotation) {
    const [blX, blY, trX, trY] = rect;

    switch (rotation) {
      case 0:
        for (let i = 0, ii = points.length; i < ii; i += 2) {
          points[i] -= blX;
          points[i + 1] = trY - points[i + 1];
        }
        break;
      case 90:
        for (let i = 0, ii = points.length; i < ii; i += 2) {
          const x = points[i];
          points[i] = points[i + 1] - blY;
          points[i + 1] = x - blX;
        }
        break;
      case 180:
        for (let i = 0, ii = points.length; i < ii; i += 2) {
          points[i] = trX - points[i];
          points[i + 1] -= blY;
        }
        break;
      case 270:
        for (let i = 0, ii = points.length; i < ii; i += 2) {
          const x = points[i];
          points[i] = trY - points[i + 1];
          points[i + 1] = trX - x;
        }
        break;
      default:
        throw new Error("Invalid rotation");
    }
    return points;
  }

  /**
   * Transform and serialize the paths.
   * @param {number} s - scale factor
   * @param {number} tx - abscissa of the translation
   * @param {number} ty - ordinate of the translation
   * @param {Array<number>} rect - the bounding box of the annotation
   */
  #serializePaths(s, tx, ty, rect) {
    const paths = [];
    const padding = this.thickness / 2;
    const shiftX = s * tx + padding;
    const shiftY = s * ty + padding;
    for (const bezier of this.paths) {
      const buffer = [];
      const points = [];
      for (let j = 0, jj = bezier.length; j < jj; j++) {
        const [first, control1, control2, second] = bezier[j];
        const p10 = s * first[0] + shiftX;
        const p11 = s * first[1] + shiftY;
        const p20 = s * control1[0] + shiftX;
        const p21 = s * control1[1] + shiftY;
        const p30 = s * control2[0] + shiftX;
        const p31 = s * control2[1] + shiftY;
        const p40 = s * second[0] + shiftX;
        const p41 = s * second[1] + shiftY;

        if (j === 0) {
          buffer.push(p10, p11);
          points.push(p10, p11);
        }
        buffer.push(p20, p21, p30, p31, p40, p41);
        points.push(p20, p21);
        if (j === jj - 1) {
          points.push(p40, p41);
        }
      }
      paths.push({
        bezier: InkEditor.#toPDFCoordinates(buffer, rect, this.rotation),
        points: InkEditor.#toPDFCoordinates(points, rect, this.rotation),
      });
    }

    return paths;
  }

  /**
   * Get the bounding box containing all the paths.
   * @returns {Array<number>}
   */
  #getBbox() {
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;

    for (const path of this.paths) {
      for (const [first, control1, control2, second] of path) {
        const bbox = Util.bezierBoundingBox(
          ...first,
          ...control1,
          ...control2,
          ...second
        );
        xMin = Math.min(xMin, bbox[0]);
        yMin = Math.min(yMin, bbox[1]);
        xMax = Math.max(xMax, bbox[2]);
        yMax = Math.max(yMax, bbox[3]);
      }
    }

    return [xMin, yMin, xMax, yMax];
  }

  /**
   * The bounding box is computed with null thickness, so we must take
   * it into account for the display.
   * It corresponds to the total padding, hence it should be divided by 2
   * in order to have left/right paddings.
   * @returns {number}
   */
  #getPadding() {
    return this.#disableEditing
      ? Math.ceil(this.thickness * this.parentScale)
      : 0;
  }

  /**
   * Set the div position and dimensions in order to fit to
   * the bounding box of the contents.
   * @returns {undefined}
   */
  #fitToContent(firstTime = false) {
    if (this.isEmpty()) {
      return;
    }

    if (!this.#disableEditing) {
      this.#redraw();
      return;
    }

    const bbox = this.#getBbox();
    const padding = this.#getPadding();
    this.#baseWidth = Math.max(AnnotationEditor.MIN_SIZE, bbox[2] - bbox[0]);
    this.#baseHeight = Math.max(AnnotationEditor.MIN_SIZE, bbox[3] - bbox[1]);

    const width = Math.ceil(padding + this.#baseWidth * this.scaleFactor);
    const height = Math.ceil(padding + this.#baseHeight * this.scaleFactor);

    const [parentWidth, parentHeight] = this.parentDimensions;
    this.width = width / parentWidth;
    this.height = height / parentHeight;

    this.setAspectRatio(width, height);

    const prevTranslationX = this.translationX;
    const prevTranslationY = this.translationY;

    this.translationX = -bbox[0];
    this.translationY = -bbox[1];
    this.#setCanvasDims();
    this.#redraw();

    this.#realWidth = width;
    this.#realHeight = height;

    this.setDims(width, height);
    const unscaledPadding = firstTime ? padding / this.scaleFactor / 2 : 0;
    this.translate(
      prevTranslationX - this.translationX - unscaledPadding,
      prevTranslationY - this.translationY - unscaledPadding
    );
  }

  /** @inheritdoc */
  static deserialize(data, parent, uiManager) {
    if (data instanceof InkAnnotationElement) {
      return null;
    }
    const editor = super.deserialize(data, parent, uiManager);

    editor.thickness = data.thickness;
    editor.color = Util.makeHexColor(...data.color);
    editor.opacity = data.opacity;

    const [pageWidth, pageHeight] = editor.pageDimensions;
    const width = editor.width * pageWidth;
    const height = editor.height * pageHeight;
    const scaleFactor = editor.parentScale;
    const padding = data.thickness / 2;

    editor.#disableEditing = true;
    editor.#realWidth = Math.round(width);
    editor.#realHeight = Math.round(height);

    const { paths, rect, rotation } = data;

    for (let { bezier } of paths) {
      bezier = InkEditor.#fromPDFCoordinates(bezier, rect, rotation);
      const path = [];
      editor.paths.push(path);
      let p0 = scaleFactor * (bezier[0] - padding);
      let p1 = scaleFactor * (bezier[1] - padding);
      for (let i = 2, ii = bezier.length; i < ii; i += 6) {
        const p10 = scaleFactor * (bezier[i] - padding);
        const p11 = scaleFactor * (bezier[i + 1] - padding);
        const p20 = scaleFactor * (bezier[i + 2] - padding);
        const p21 = scaleFactor * (bezier[i + 3] - padding);
        const p30 = scaleFactor * (bezier[i + 4] - padding);
        const p31 = scaleFactor * (bezier[i + 5] - padding);
        path.push([
          [p0, p1],
          [p10, p11],
          [p20, p21],
          [p30, p31],
        ]);
        p0 = p30;
        p1 = p31;
      }
      const path2D = this.#buildPath2D(path);
      editor.bezierPath2D.push(path2D);
    }

    const bbox = editor.#getBbox();
    editor.#baseWidth = Math.max(AnnotationEditor.MIN_SIZE, bbox[2] - bbox[0]);
    editor.#baseHeight = Math.max(AnnotationEditor.MIN_SIZE, bbox[3] - bbox[1]);
    editor.#setScaleFactor(width, height);

    return editor;
  }

  /** @inheritdoc */
  serialize() {
    if (this.isEmpty()) {
      return null;
    }

    const rect = this.getRect(0, 0);
    const color = AnnotationEditor._colorManager.convert(this.ctx.strokeStyle);

    return {
      annotationType: AnnotationEditorType.INK,
      color,
      thickness: this.thickness,
      opacity: this.opacity,
      paths: this.#serializePaths(
        this.scaleFactor / this.parentScale,
        this.translationX,
        this.translationY,
        rect
      ),
      pageIndex: this.pageIndex,
      rect,
      rotation: this.rotation,
      structTreeParentId: this._structTreeParentId,
    };
  }
}

export { InkEditor };
