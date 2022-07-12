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
import { fitCurve } from "pdfjs-fitCurve";

/**
 * Basic draw editor in order to generate an Ink annotation.
 */
class InkEditor extends AnnotationEditor {
  #aspectRatio = 0;

  #baseHeight = 0;

  #baseWidth = 0;

  #boundCanvasMousemove;

  #boundCanvasMouseleave;

  #boundCanvasMouseup;

  #boundCanvasMousedown;

  #disableEditing = false;

  #isCanvasInitialized = false;

  #observer = null;

  #realWidth = 0;

  #realHeight = 0;

  static _defaultColor = null;

  static _defaultThickness = 1;

  constructor(params) {
    super({ ...params, name: "inkEditor" });
    this.color = params.color || null;
    this.thickness = params.thickness || null;
    this.paths = [];
    this.bezierPath2D = [];
    this.currentPath = [];
    this.scaleFactor = 1;
    this.translationX = this.translationY = 0;
    this.x = 0;
    this.y = 0;

    this.#boundCanvasMousemove = this.canvasMousemove.bind(this);
    this.#boundCanvasMouseleave = this.canvasMouseleave.bind(this);
    this.#boundCanvasMouseup = this.canvasMouseup.bind(this);
    this.#boundCanvasMousedown = this.canvasMousedown.bind(this);
  }

  /** @inheritdoc */
  copy() {
    const editor = new InkEditor({
      parent: this.parent,
      id: this.parent.getNextId(),
    });

    editor.x = this.x;
    editor.y = this.y;
    editor.width = this.width;
    editor.height = this.height;
    editor.color = this.color;
    editor.thickness = this.thickness;
    editor.paths = this.paths.slice();
    editor.bezierPath2D = this.bezierPath2D.slice();
    editor.scaleFactor = this.scaleFactor;
    editor.translationX = this.translationX;
    editor.translationY = this.translationY;
    editor.#aspectRatio = this.#aspectRatio;
    editor.#baseWidth = this.#baseWidth;
    editor.#baseHeight = this.#baseHeight;
    editor.#disableEditing = this.#disableEditing;
    editor.#realWidth = this.#realWidth;
    editor.#realHeight = this.#realHeight;

    return editor;
  }

  static updateDefaultParams(type, value) {
    switch (type) {
      case AnnotationEditorParamsType.INK_THICKNESS:
        InkEditor._defaultThickness = value;
        break;
      case AnnotationEditorParamsType.INK_COLOR:
        InkEditor._defaultColor = value;
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
    }
  }

  static get defaultPropertiesToUpdate() {
    return [
      [AnnotationEditorParamsType.INK_THICKNESS, InkEditor._defaultThickness],
      [
        AnnotationEditorParamsType.INK_COLOR,
        InkEditor._defaultColor || AnnotationEditor._defaultLineColor,
      ],
    ];
  }

  /** @inheritdoc */
  get propertiesToUpdate() {
    return [
      [AnnotationEditorParamsType.INK_THICKNESS, this.thickness],
      [AnnotationEditorParamsType.INK_COLOR, this.color],
    ];
  }

  /**
   * Update the thickness and make this action undoable.
   * @param {number} thickness
   */
  #updateThickness(thickness) {
    const savedThickness = this.thickness;
    this.parent.addCommands({
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
    this.parent.addCommands({
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

  /** @inheritdoc */
  rebuild() {
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

  /** @inheritdoc */
  enableEditMode() {
    if (this.#disableEditing || this.canvas === null) {
      return;
    }

    super.enableEditMode();
    this.div.draggable = false;
    this.canvas.addEventListener("mousedown", this.#boundCanvasMousedown);
    this.canvas.addEventListener("mouseup", this.#boundCanvasMouseup);
  }

  /** @inheritdoc */
  disableEditMode() {
    if (!this.isInEditMode() || this.canvas === null) {
      return;
    }

    super.disableEditMode();
    this.div.draggable = !this.isEmpty();
    this.div.classList.remove("editing");

    this.canvas.removeEventListener("mousedown", this.#boundCanvasMousedown);
    this.canvas.removeEventListener("mouseup", this.#boundCanvasMouseup);
  }

  /** @inheritdoc */
  onceAdded() {
    this.div.draggable = !this.isEmpty();
  }

  /** @inheritdoc */
  isEmpty() {
    return (
      this.paths.length === 0 ||
      (this.paths.length === 1 && this.paths[0].length === 0)
    );
  }

  #getInitialBBox() {
    const { width, height, rotation } = this.parent.viewport;
    switch (rotation) {
      case 90:
        return [0, width, width, height];
      case 180:
        return [width, height, width, height];
      case 270:
        return [height, 0, width, height];
      default:
        return [0, 0, width, height];
    }
  }

  /**
   * Set line styles.
   */
  #setStroke() {
    this.ctx.lineWidth =
      (this.thickness * this.parent.scaleFactor) / this.scaleFactor;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.ctx.miterLimit = 10;
    this.ctx.strokeStyle = this.color;
  }

  /**
   * Start to draw on the canvas.
   * @param {number} x
   * @param {number} y
   */
  #startDrawing(x, y) {
    if (!this.#isCanvasInitialized) {
      this.#isCanvasInitialized = true;
      this.#setCanvasDims();
      this.thickness ||= InkEditor._defaultThickness;
      this.color ||=
        InkEditor._defaultColor || AnnotationEditor._defaultLineColor;
    }
    this.currentPath.push([x, y]);
    this.#setStroke();
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
  }

  /**
   * Draw on the canvas.
   * @param {number} x
   * @param {number} y
   */
  #draw(x, y) {
    this.currentPath.push([x, y]);
    this.ctx.lineTo(x, y);
    this.ctx.stroke();
  }

  /**
   * Stop to draw on the canvas.
   * @param {number} x
   * @param {number} y
   */
  #stopDrawing(x, y) {
    x = Math.min(Math.max(x, 0), this.canvas.width);
    y = Math.min(Math.max(y, 0), this.canvas.height);

    this.currentPath.push([x, y]);

    // Interpolate the path entered by the user with some
    // Bezier's curves in order to have a smoother path and
    // to reduce the data size used to draw it in the PDF.
    let bezier;
    if (
      this.currentPath.length !== 2 ||
      this.currentPath[0][0] !== x ||
      this.currentPath[0][1] !== y
    ) {
      bezier = fitCurve(this.currentPath, 30, null);
    } else {
      // We have only one point finally.
      const xy = [x, y];
      bezier = [[xy, xy.slice(), xy.slice(), xy]];
    }
    const path2D = this.#buildPath2D(bezier);
    this.currentPath.length = 0;

    const cmd = () => {
      this.paths.push(bezier);
      this.bezierPath2D.push(path2D);
      this.rebuild();
    };

    const undo = () => {
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

    this.parent.addCommands({ cmd, undo, mustExec: true });
  }

  /**
   * Redraw all the paths.
   */
  #redraw() {
    this.#setStroke();

    if (this.isEmpty()) {
      this.#updateTransform();
      return;
    }

    const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
    const { ctx, height, width } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width * parentWidth, height * parentHeight);
    this.#updateTransform();
    for (const path of this.bezierPath2D) {
      ctx.stroke(path);
    }
  }

  /**
   * Commit the curves we have in this editor.
   * @returns {undefined}
   */
  commit() {
    if (this.#disableEditing) {
      return;
    }

    this.disableEditMode();

    // This editor must be on top of the main ink editor.
    this.setInForeground();

    this.#disableEditing = true;
    this.div.classList.add("disabled");

    this.#fitToContent();

    this.parent.addInkEditorIfNeeded(/* isCommitting = */ true);
  }

  /** @inheritdoc */
  focusin(/* event */) {
    super.focusin();
    this.enableEditMode();
  }

  /**
   * onmousedown callback for the canvas we're drawing on.
   * @param {MouseEvent} event
   * @returns {undefined}
   */
  canvasMousedown(event) {
    if (event.button !== 0 || !this.isInEditMode() || this.#disableEditing) {
      return;
    }

    // We want to draw on top of any other editors.
    // Since it's the last child, there's no need to give it a higher z-index.
    this.setInForeground();

    event.stopPropagation();

    this.canvas.addEventListener("mouseleave", this.#boundCanvasMouseleave);
    this.canvas.addEventListener("mousemove", this.#boundCanvasMousemove);

    this.#startDrawing(event.offsetX, event.offsetY);
  }

  /**
   * onmousemove callback for the canvas we're drawing on.
   * @param {MouseEvent} event
   * @returns {undefined}
   */
  canvasMousemove(event) {
    event.stopPropagation();
    this.#draw(event.offsetX, event.offsetY);
  }

  /**
   * onmouseup callback for the canvas we're drawing on.
   * @param {MouseEvent} event
   * @returns {undefined}
   */
  canvasMouseup(event) {
    if (event.button !== 0) {
      return;
    }
    if (this.isInEditMode() && this.currentPath.length !== 0) {
      event.stopPropagation();
      this.#endDrawing(event);

      // Since the ink editor covers all of the page and we want to be able
      // to select another editor, we just put this one in the background.
      this.setInBackground();
    }
  }

  /**
   * onmouseleave callback for the canvas we're drawing on.
   * @param {MouseEvent} event
   * @returns {undefined}
   */
  canvasMouseleave(event) {
    this.#endDrawing(event);
    this.setInBackground();
  }

  /**
   * End the drawing.
   * @param {MouseEvent} event
   */
  #endDrawing(event) {
    this.#stopDrawing(event.offsetX, event.offsetY);

    this.canvas.removeEventListener("mouseleave", this.#boundCanvasMouseleave);
    this.canvas.removeEventListener("mousemove", this.#boundCanvasMousemove);
  }

  /**
   * Create the canvas element.
   */
  #createCanvas() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.canvas.height = 0;
    this.canvas.className = "inkEditorCanvas";
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
    const [x, y, w, h] = this.#getInitialBBox();
    this.setAt(x, y, 0, 0);
    this.setDims(w, h);

    this.#createCanvas();

    if (this.width) {
      // This editor was created in using copy (ctrl+c).
      this.#isCanvasInitialized = true;
      const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
      this.setAt(
        baseX * parentWidth,
        baseY * parentHeight,
        this.width * parentWidth,
        this.height * parentHeight
      );
      this.setDims(this.width * parentWidth, this.height * parentHeight);
      this.#setCanvasDims();
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
    const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
    this.canvas.width = this.width * parentWidth;
    this.canvas.height = this.height * parentHeight;
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

    if (
      this.#aspectRatio &&
      Math.abs(this.#aspectRatio - width / height) > 1e-2
    ) {
      height = Math.ceil(width / this.#aspectRatio);
      this.setDims(width, height);
    }

    const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
    this.width = width / parentWidth;
    this.height = height / parentHeight;

    if (this.#disableEditing) {
      const padding = this.#getPadding();
      const scaleFactorW = (width - padding) / this.#baseWidth;
      const scaleFactorH = (height - padding) / this.#baseHeight;
      this.scaleFactor = Math.min(scaleFactorW, scaleFactorH);
    }

    this.#setCanvasDims();
    this.#redraw();

    this.canvas.style.visibility = "visible";
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
   * Convert the output of fitCurve in some Path2D.
   * @param {Arra<Array<number>} bezier
   * @returns {Path2D}
   */
  #buildPath2D(bezier) {
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

  /**
   * Transform and serialize the paths.
   * @param {number} s - scale factor
   * @param {number} tx - abscissa of the translation
   * @param {number} ty - ordinate of the translation
   * @param {number} h - height of the bounding box
   */
  #serializePaths(s, tx, ty, h) {
    const NUMBER_OF_POINTS_ON_BEZIER_CURVE = 4;
    const paths = [];
    const padding = this.thickness / 2;
    let buffer, points;

    for (const bezier of this.paths) {
      buffer = [];
      points = [];
      for (let i = 0, ii = bezier.length; i < ii; i++) {
        const [first, control1, control2, second] = bezier[i];
        const p10 = s * (first[0] + tx) + padding;
        const p11 = h - s * (first[1] + ty) - padding;
        const p20 = s * (control1[0] + tx) + padding;
        const p21 = h - s * (control1[1] + ty) - padding;
        const p30 = s * (control2[0] + tx) + padding;
        const p31 = h - s * (control2[1] + ty) - padding;
        const p40 = s * (second[0] + tx) + padding;
        const p41 = h - s * (second[1] + ty) - padding;

        if (i === 0) {
          buffer.push(p10, p11);
          points.push(p10, p11);
        }
        buffer.push(p20, p21, p30, p31, p40, p41);
        this.#extractPointsOnBezier(
          p10,
          p11,
          p20,
          p21,
          p30,
          p31,
          p40,
          p41,
          NUMBER_OF_POINTS_ON_BEZIER_CURVE,
          points
        );
      }
      paths.push({ bezier: buffer, points });
    }

    return paths;
  }

  /**
   * Extract n-1 points from the cubic Bezier curve.
   * @param {number} p10
   * @param {number} p11
   * @param {number} p20
   * @param {number} p21
   * @param {number} p30
   * @param {number} p31
   * @param {number} p40
   * @param {number} p41
   * @param {number} n
   * @param {Array<number>} points
   * @returns {undefined}
   */
  #extractPointsOnBezier(p10, p11, p20, p21, p30, p31, p40, p41, n, points) {
    // If we can save few points thanks to the flatness we must do it.
    if (this.#isAlmostFlat(p10, p11, p20, p21, p30, p31, p40, p41)) {
      points.push(p40, p41);
      return;
    }

    // Apply the de Casteljau's algorithm in order to get n points belonging
    // to the Bezier's curve:
    // https://en.wikipedia.org/wiki/De_Casteljau%27s_algorithm

    // The first point is the last point of the previous Bezier curve
    // so no need to push the first point.
    for (let i = 1; i < n - 1; i++) {
      const t = i / n;
      const mt = 1 - t;

      let q10 = t * p10 + mt * p20;
      let q11 = t * p11 + mt * p21;

      let q20 = t * p20 + mt * p30;
      let q21 = t * p21 + mt * p31;

      const q30 = t * p30 + mt * p40;
      const q31 = t * p31 + mt * p41;

      q10 = t * q10 + mt * q20;
      q11 = t * q11 + mt * q21;

      q20 = t * q20 + mt * q30;
      q21 = t * q21 + mt * q31;

      q10 = t * q10 + mt * q20;
      q11 = t * q11 + mt * q21;

      points.push(q10, q11);
    }

    points.push(p40, p41);
  }

  /**
   * Check if a cubic Bezier curve is almost flat.
   * @param {number} p10
   * @param {number} p11
   * @param {number} p20
   * @param {number} p21
   * @param {number} p30
   * @param {number} p31
   * @param {number} p40
   * @param {number} p41
   * @returns {boolean}
   */
  #isAlmostFlat(p10, p11, p20, p21, p30, p31, p40, p41) {
    // For reference:
    //   https://jeremykun.com/tag/bezier-curves/
    const tol = 10;

    const ax = (3 * p20 - 2 * p10 - p40) ** 2;
    const ay = (3 * p21 - 2 * p11 - p41) ** 2;
    const bx = (3 * p30 - p10 - 2 * p40) ** 2;
    const by = (3 * p31 - p11 - 2 * p41) ** 2;

    return Math.max(ax, bx) + Math.max(ay, by) <= tol;
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
    return Math.ceil(this.thickness * this.parent.scaleFactor);
  }

  /**
   * Set the div position and dimensions in order to fit to
   * the bounding box of the contents.
   * @returns {undefined}
   */
  #fitToContent() {
    if (this.isEmpty()) {
      return;
    }

    if (!this.#disableEditing) {
      this.#redraw();
      return;
    }

    const bbox = this.#getBbox();
    const padding = this.#getPadding();
    this.#baseWidth = bbox[2] - bbox[0];
    this.#baseHeight = bbox[3] - bbox[1];

    const width = Math.ceil(padding + this.#baseWidth * this.scaleFactor);
    const height = Math.ceil(padding + this.#baseHeight * this.scaleFactor);

    const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
    this.width = width / parentWidth;
    this.height = height / parentHeight;

    this.#aspectRatio = width / height;

    const prevTranslationX = this.translationX;
    const prevTranslationY = this.translationY;

    this.translationX = -bbox[0];
    this.translationY = -bbox[1];
    this.#setCanvasDims();
    this.#redraw();

    this.#realWidth = width;
    this.#realHeight = height;

    this.setDims(width, height);
    this.translate(
      prevTranslationX - this.translationX,
      prevTranslationY - this.translationY
    );
  }

  /** @inheritdoc */
  serialize() {
    if (this.isEmpty()) {
      return null;
    }

    const rect = this.getRect(0, 0);
    const height =
      this.rotation % 180 === 0 ? rect[3] - rect[1] : rect[2] - rect[0];

    const color = AnnotationEditor._colorManager.convert(this.ctx.strokeStyle);

    return {
      annotationType: AnnotationEditorType.INK,
      color,
      thickness: this.thickness,
      paths: this.#serializePaths(
        this.scaleFactor / this.parent.scaleFactor,
        this.translationX,
        this.translationY,
        height
      ),
      pageIndex: this.parent.pageIndex,
      rect,
      rotation: this.rotation,
    };
  }
}

export { fitCurve, InkEditor };
