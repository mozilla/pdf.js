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

// eslint-disable-next-line max-len
/** @typedef {import("./annotation_editor_layer.js").AnnotationEditorLayer} AnnotationEditorLayer */
// eslint-disable-next-line max-len
/** @typedef {import("./tools.js").AnnotationEditorUIManager} AnnotationEditorUIManager */

import {
  AnnotationEditorParamsType,
  FeatureTest,
  shadow,
  unreachable,
} from "../../shared/util.js";
import { bindEvents, ColorManager } from "./tools.js";

/**
 * @typedef {Object} AnnotationEditorParameters
 * @property {AnnotationEditorUIManager} uiManager - the global manager
 * @property {AnnotationEditorLayer} parent - the layer containing this editor
 * @property {string} id - editor id
 * @property {number} x - x-coordinate
 * @property {number} y - y-coordinate
 */

/**
 * Base class for editors.
 */
class AnnotationEditor {
  #keepAspectRatio = false;

  #resizersDiv = null;

  #resizePosition = null;

  #boundFocusin = this.focusin.bind(this);

  #boundFocusout = this.focusout.bind(this);

  #hasBeenSelected = false;

  #isEditing = false;

  #isInEditMode = false;

  _uiManager = null;

  #isDraggable = false;

  #zIndex = AnnotationEditor._zIndex++;

  static _colorManager = new ColorManager();

  static _zIndex = 1;

  /**
   * @param {AnnotationEditorParameters} parameters
   */
  constructor(parameters) {
    if (this.constructor === AnnotationEditor) {
      unreachable("Cannot initialize AnnotationEditor.");
    }

    this.parent = parameters.parent;
    this.id = parameters.id;
    this.width = this.height = null;
    this.pageIndex = parameters.parent.pageIndex;
    this.name = parameters.name;
    this.div = null;
    this._uiManager = parameters.uiManager;
    this.annotationElementId = null;
    this._willKeepAspectRatio = false;

    const {
      rotation,
      rawDims: { pageWidth, pageHeight, pageX, pageY },
    } = this.parent.viewport;

    this.rotation = rotation;
    this.pageRotation =
      (360 + rotation - this._uiManager.viewParameters.rotation) % 360;
    this.pageDimensions = [pageWidth, pageHeight];
    this.pageTranslation = [pageX, pageY];

    const [width, height] = this.parentDimensions;
    this.x = parameters.x / width;
    this.y = parameters.y / height;

    this.isAttachedToDOM = false;
    this.deleted = false;
  }

  static get _defaultLineColor() {
    return shadow(
      this,
      "_defaultLineColor",
      this._colorManager.getHexCode("CanvasText")
    );
  }

  static deleteAnnotationElement(editor) {
    const fakeEditor = new FakeEditor({
      id: editor.parent.getNextId(),
      parent: editor.parent,
      uiManager: editor._uiManager,
    });
    fakeEditor.annotationElementId = editor.annotationElementId;
    fakeEditor.deleted = true;
    fakeEditor._uiManager.addToAnnotationStorage(fakeEditor);
  }

  /**
   * Initialize the l10n stuff for this type of editor.
   * @param {Object} _l10n
   */
  static initialize(_l10n) {}

  /**
   * Update the default parameters for this type of editor.
   * @param {number} _type
   * @param {*} _value
   */
  static updateDefaultParams(_type, _value) {}

  /**
   * Get the default properties to set in the UI for this type of editor.
   * @returns {Array}
   */
  static get defaultPropertiesToUpdate() {
    return [];
  }

  /**
   * Get the properties to update in the UI for this editor.
   * @returns {Array}
   */
  get propertiesToUpdate() {
    return [];
  }

  get _isDraggable() {
    return this.#isDraggable;
  }

  set _isDraggable(value) {
    this.#isDraggable = value;
    this.div?.classList.toggle("draggable", value);
  }

  /**
   * Add some commands into the CommandManager (undo/redo stuff).
   * @param {Object} params
   */
  addCommands(params) {
    this._uiManager.addCommands(params);
  }

  get currentLayer() {
    return this._uiManager.currentLayer;
  }

  /**
   * This editor will be behind the others.
   */
  setInBackground() {
    this.div.style.zIndex = 0;
  }

  /**
   * This editor will be in the foreground.
   */
  setInForeground() {
    this.div.style.zIndex = this.#zIndex;
  }

  setParent(parent) {
    if (parent !== null) {
      this.pageIndex = parent.pageIndex;
      this.pageDimensions = parent.pageDimensions;
    }
    this.parent = parent;
  }

  /**
   * onfocus callback.
   */
  focusin(event) {
    if (!this.#hasBeenSelected) {
      this.parent.setSelected(this);
    } else {
      this.#hasBeenSelected = false;
    }
  }

  /**
   * onblur callback.
   * @param {FocusEvent} event
   */
  focusout(event) {
    if (!this.isAttachedToDOM) {
      return;
    }

    // In case of focusout, the relatedTarget is the element which
    // is grabbing the focus.
    // So if the related target is an element under the div for this
    // editor, then the editor isn't unactive.
    const target = event.relatedTarget;
    if (target?.closest(`#${this.id}`)) {
      return;
    }

    event.preventDefault();

    if (!this.parent?.isMultipleSelection) {
      this.commitOrRemove();
    }
  }

  commitOrRemove() {
    if (this.isEmpty()) {
      this.remove();
    } else {
      this.commit();
    }
  }

  /**
   * Commit the data contained in this editor.
   */
  commit() {
    this.addToAnnotationStorage();
  }

  addToAnnotationStorage() {
    this._uiManager.addToAnnotationStorage(this);
  }

  /**
   * Set the editor position within its parent.
   * @param {number} x
   * @param {number} y
   * @param {number} tx - x-translation in screen coordinates.
   * @param {number} ty - y-translation in screen coordinates.
   */
  setAt(x, y, tx, ty) {
    const [width, height] = this.parentDimensions;
    [tx, ty] = this.screenToPageTranslation(tx, ty);

    this.x = (x + tx) / width;
    this.y = (y + ty) / height;

    this.fixAndSetPosition();
  }

  #translate([width, height], x, y) {
    [x, y] = this.screenToPageTranslation(x, y);

    this.x += x / width;
    this.y += y / height;

    this.fixAndSetPosition();
  }

  /**
   * Translate the editor position within its parent.
   * @param {number} x - x-translation in screen coordinates.
   * @param {number} y - y-translation in screen coordinates.
   */
  translate(x, y) {
    this.#translate(this.parentDimensions, x, y);
  }

  /**
   * Translate the editor position within its page and adjust the scroll
   * in order to have the editor in the view.
   * @param {number} x - x-translation in page coordinates.
   * @param {number} y - y-translation in page coordinates.
   */
  translateInPage(x, y) {
    this.#translate(this.pageDimensions, x, y);
    this.div.scrollIntoView({ block: "nearest" });
  }

  fixAndSetPosition() {
    const [pageWidth, pageHeight] = this.pageDimensions;
    let { x, y, width, height } = this;
    width *= pageWidth;
    height *= pageHeight;
    x *= pageWidth;
    y *= pageHeight;

    switch (this.rotation) {
      case 0:
        x = Math.max(0, Math.min(pageWidth - width, x));
        y = Math.max(0, Math.min(pageHeight - height, y));
        break;
      case 90:
        x = Math.max(0, Math.min(pageWidth - height, x));
        y = Math.min(pageHeight, Math.max(width, y));
        break;
      case 180:
        x = Math.min(pageWidth, Math.max(width, x));
        y = Math.min(pageHeight, Math.max(height, y));
        break;
      case 270:
        x = Math.min(pageWidth, Math.max(height, x));
        y = Math.max(0, Math.min(pageHeight - width, y));
        break;
    }

    this.x = x / pageWidth;
    this.y = y / pageHeight;

    this.div.style.left = `${(100 * this.x).toFixed(2)}%`;
    this.div.style.top = `${(100 * this.y).toFixed(2)}%`;
  }

  /**
   * Convert a screen translation into a page one.
   * @param {number} x
   * @param {number} y
   */
  screenToPageTranslation(x, y) {
    switch (this.parentRotation) {
      case 90:
        return [y, -x];
      case 180:
        return [-x, -y];
      case 270:
        return [-y, x];
      default:
        return [x, y];
    }
  }

  /**
   * Convert a page translation into a screen one.
   * @param {number} x
   * @param {number} y
   */
  pageTranslationToScreen(x, y) {
    switch (this.parentRotation) {
      case 90:
        return [-y, x];
      case 180:
        return [-x, -y];
      case 270:
        return [y, -x];
      default:
        return [x, y];
    }
  }

  get parentScale() {
    return this._uiManager.viewParameters.realScale;
  }

  get parentRotation() {
    return (this._uiManager.viewParameters.rotation + this.pageRotation) % 360;
  }

  get parentDimensions() {
    const { realScale } = this._uiManager.viewParameters;
    const [pageWidth, pageHeight] = this.pageDimensions;
    return [pageWidth * realScale, pageHeight * realScale];
  }

  /**
   * Set the dimensions of this editor.
   * @param {number} width
   * @param {number} height
   */
  setDims(width, height) {
    const [parentWidth, parentHeight] = this.parentDimensions;
    this.div.style.width = `${((100 * width) / parentWidth).toFixed(2)}%`;
    if (!this.#keepAspectRatio) {
      this.div.style.height = `${((100 * height) / parentHeight).toFixed(2)}%`;
    }
  }

  fixDims() {
    const { style } = this.div;
    const { height, width } = style;
    const widthPercent = width.endsWith("%");
    const heightPercent = !this.#keepAspectRatio && height.endsWith("%");
    if (widthPercent && heightPercent) {
      return;
    }

    const [parentWidth, parentHeight] = this.parentDimensions;
    if (!widthPercent) {
      style.width = `${((100 * parseFloat(width)) / parentWidth).toFixed(2)}%`;
    }
    if (!this.#keepAspectRatio && !heightPercent) {
      style.height = `${((100 * parseFloat(height)) / parentHeight).toFixed(
        2
      )}%`;
    }
  }

  /**
   * Get the translation used to position this editor when it's created.
   * @returns {Array<number>}
   */
  getInitialTranslation() {
    return [0, 0];
  }

  #createResizers() {
    if (this.#resizersDiv) {
      return;
    }
    this.#resizersDiv = document.createElement("div");
    this.#resizersDiv.classList.add("resizers");
    const classes = ["topLeft", "topRight", "bottomRight", "bottomLeft"];
    if (!this._willKeepAspectRatio) {
      classes.push("topMiddle", "middleRight", "bottomMiddle", "middleLeft");
    }
    for (const name of classes) {
      const div = document.createElement("div");
      this.#resizersDiv.append(div);
      div.classList.add("resizer", name);
      div.addEventListener(
        "pointerdown",
        this.#resizerPointerdown.bind(this, name)
      );
    }
    this.div.prepend(this.#resizersDiv);
  }

  #resizerPointerdown(name, event) {
    event.preventDefault();
    this.#resizePosition = [event.clientX, event.clientY];
    const boundResizerPointermove = this.#resizerPointermove.bind(this, name);
    const savedDraggable = this._isDraggable;
    this._isDraggable = false;
    const resizingClassName = `resizing${name
      .charAt(0)
      .toUpperCase()}${name.slice(1)}`;
    this.parent.div.classList.add(resizingClassName);
    const pointerMoveOptions = { passive: true, capture: true };
    window.addEventListener(
      "pointermove",
      boundResizerPointermove,
      pointerMoveOptions
    );
    const pointerUpCallback = () => {
      // Stop the undo accumulation in order to have an undo action for each
      // resize session.
      this._uiManager.stopUndoAccumulation();
      this._isDraggable = savedDraggable;
      this.parent.div.classList.remove(resizingClassName);
      window.removeEventListener("pointerup", pointerUpCallback);
      window.removeEventListener("blur", pointerUpCallback);
      window.removeEventListener(
        "pointermove",
        boundResizerPointermove,
        pointerMoveOptions
      );
    };
    window.addEventListener("pointerup", pointerUpCallback);
    // If the user switch to another window (with alt+tab), then we end the
    // resize session.
    window.addEventListener("blur", pointerUpCallback);
  }

  #resizerPointermove(name, event) {
    const { clientX, clientY } = event;
    const deltaX = clientX - this.#resizePosition[0];
    const deltaY = clientY - this.#resizePosition[1];
    this.#resizePosition[0] = clientX;
    this.#resizePosition[1] = clientY;
    const [parentWidth, parentHeight] = this.parentDimensions;
    const savedX = this.x;
    const savedY = this.y;
    const savedWidth = this.width;
    const savedHeight = this.height;
    const minWidth = AnnotationEditor.MIN_SIZE / parentWidth;
    const minHeight = AnnotationEditor.MIN_SIZE / parentHeight;
    let cmd;

    // 10000 because we multiply by 100 and use toFixed(2) in fixAndSetPosition.
    // Without rounding, the positions of the corners other than the top left
    // one can be slightly wrong.
    const round = x => Math.round(x * 10000) / 10000;
    const updatePosition = (width, height) => {
      // We must take the parent dimensions as they are when undo/redo.
      const [pWidth, pHeight] = this.parentDimensions;
      this.setDims(pWidth * width, pHeight * height);
      this.fixAndSetPosition();
    };
    const undo = () => {
      this.width = savedWidth;
      this.height = savedHeight;
      this.x = savedX;
      this.y = savedY;
      updatePosition(savedWidth, savedHeight);
    };

    switch (name) {
      case "topLeft": {
        if (Math.sign(deltaX) * Math.sign(deltaY) < 0) {
          return;
        }
        const dist = Math.hypot(deltaX, deltaY);
        const oldDiag = Math.hypot(
          savedWidth * parentWidth,
          savedHeight * parentHeight
        );
        const brX = round(savedX + savedWidth);
        const brY = round(savedY + savedHeight);
        const ratio = Math.max(
          Math.min(
            1 - Math.sign(deltaX) * (dist / oldDiag),
            // Avoid the editor to be larger than the page.
            1 / savedWidth,
            1 / savedHeight
          ),
          // Avoid the editor to be smaller than the minimum size.
          minWidth / savedWidth,
          minHeight / savedHeight
        );
        const newWidth = round(savedWidth * ratio);
        const newHeight = round(savedHeight * ratio);
        const newX = brX - newWidth;
        const newY = brY - newHeight;
        cmd = () => {
          this.width = newWidth;
          this.height = newHeight;
          this.x = newX;
          this.y = newY;
          updatePosition(newWidth, newHeight);
        };
        break;
      }
      case "topMiddle": {
        const bmY = round(this.y + savedHeight);
        const newHeight = round(
          Math.max(minHeight, Math.min(1, savedHeight - deltaY / parentHeight))
        );
        const newY = bmY - newHeight;
        cmd = () => {
          this.height = newHeight;
          this.y = newY;
          updatePosition(savedWidth, newHeight);
        };
        break;
      }
      case "topRight": {
        if (Math.sign(deltaX) * Math.sign(deltaY) > 0) {
          return;
        }
        const dist = Math.hypot(deltaX, deltaY);
        const oldDiag = Math.hypot(
          this.width * parentWidth,
          this.height * parentHeight
        );
        const blY = round(savedY + this.height);
        const ratio = Math.max(
          Math.min(
            1 + Math.sign(deltaX) * (dist / oldDiag),
            1 / savedWidth,
            1 / savedHeight
          ),
          minWidth / savedWidth,
          minHeight / savedHeight
        );
        const newWidth = round(savedWidth * ratio);
        const newHeight = round(savedHeight * ratio);
        const newY = blY - newHeight;
        cmd = () => {
          this.width = newWidth;
          this.height = newHeight;
          this.y = newY;
          updatePosition(newWidth, newHeight);
        };
        break;
      }
      case "middleRight": {
        const newWidth = round(
          Math.max(minWidth, Math.min(1, savedWidth + deltaX / parentWidth))
        );
        cmd = () => {
          this.width = newWidth;
          updatePosition(newWidth, savedHeight);
        };
        break;
      }
      case "bottomRight": {
        if (Math.sign(deltaX) * Math.sign(deltaY) < 0) {
          return;
        }
        const dist = Math.hypot(deltaX, deltaY);
        const oldDiag = Math.hypot(
          this.width * parentWidth,
          this.height * parentHeight
        );
        const ratio = Math.max(
          Math.min(
            1 + Math.sign(deltaX) * (dist / oldDiag),
            1 / savedWidth,
            1 / savedHeight
          ),
          minWidth / savedWidth,
          minHeight / savedHeight
        );
        const newWidth = round(savedWidth * ratio);
        const newHeight = round(savedHeight * ratio);
        cmd = () => {
          this.width = newWidth;
          this.height = newHeight;
          updatePosition(newWidth, newHeight);
        };
        break;
      }
      case "bottomMiddle": {
        const newHeight = round(
          Math.max(minHeight, Math.min(1, savedHeight + deltaY / parentHeight))
        );
        cmd = () => {
          this.height = newHeight;
          updatePosition(savedWidth, newHeight);
        };
        break;
      }
      case "bottomLeft": {
        if (Math.sign(deltaX) * Math.sign(deltaY) > 0) {
          return;
        }
        const dist = Math.hypot(deltaX, deltaY);
        const oldDiag = Math.hypot(
          this.width * parentWidth,
          this.height * parentHeight
        );
        const trX = round(savedX + this.width);
        const ratio = Math.max(
          Math.min(
            1 - Math.sign(deltaX) * (dist / oldDiag),
            1 / savedWidth,
            1 / savedHeight
          ),
          minWidth / savedWidth,
          minHeight / savedHeight
        );
        const newWidth = round(savedWidth * ratio);
        const newHeight = round(savedHeight * ratio);
        const newX = trX - newWidth;
        cmd = () => {
          this.width = newWidth;
          this.height = newHeight;
          this.x = newX;
          updatePosition(newWidth, newHeight);
        };
        break;
      }
      case "middleLeft": {
        const mrX = round(savedX + savedWidth);
        const newWidth = round(
          Math.max(minWidth, Math.min(1, savedWidth - deltaX / parentWidth))
        );
        const newX = mrX - newWidth;
        cmd = () => {
          this.width = newWidth;
          this.x = newX;
          updatePosition(newWidth, savedHeight);
        };
        break;
      }
    }
    this.addCommands({
      cmd,
      undo,
      mustExec: true,
      type: AnnotationEditorParamsType.RESIZE,
      overwriteIfSameType: true,
      keepUndo: true,
    });
  }

  /**
   * Render this editor in a div.
   * @returns {HTMLDivElement}
   */
  render() {
    this.div = document.createElement("div");
    this.div.setAttribute("data-editor-rotation", (360 - this.rotation) % 360);
    this.div.className = this.name;
    this.div.setAttribute("id", this.id);
    this.div.setAttribute("tabIndex", 0);

    this.setInForeground();

    this.div.addEventListener("focusin", this.#boundFocusin);
    this.div.addEventListener("focusout", this.#boundFocusout);

    const [parentWidth, parentHeight] = this.parentDimensions;
    if (this.parentRotation % 180 !== 0) {
      this.div.style.maxWidth = `${((100 * parentHeight) / parentWidth).toFixed(
        2
      )}%`;
      this.div.style.maxHeight = `${(
        (100 * parentWidth) /
        parentHeight
      ).toFixed(2)}%`;
    }

    const [tx, ty] = this.getInitialTranslation();
    this.translate(tx, ty);

    bindEvents(this, this.div, ["pointerdown"]);

    return this.div;
  }

  /**
   * Onpointerdown callback.
   * @param {PointerEvent} event
   */
  pointerdown(event) {
    const { isMac } = FeatureTest.platform;
    if (event.button !== 0 || (event.ctrlKey && isMac)) {
      // Avoid to focus this editor because of a non-left click.
      event.preventDefault();
      return;
    }

    if (
      (event.ctrlKey && !isMac) ||
      event.shiftKey ||
      (event.metaKey && isMac)
    ) {
      this.parent.toggleSelected(this);
    } else {
      this.parent.setSelected(this);
    }

    this.#hasBeenSelected = true;

    this.#setUpDragSession(event);
  }

  #setUpDragSession(event) {
    if (!this._isDraggable) {
      return;
    }

    // Avoid to have spurious text selection in the text layer when dragging.
    this._uiManager.disableUserSelect(true);

    const savedParent = this.parent;
    const savedX = this.x;
    const savedY = this.y;

    const pointerMoveOptions = { passive: true, capture: true };
    const pointerMoveCallback = e => {
      const [parentWidth, parentHeight] = this.parentDimensions;
      const [tx, ty] = this.screenToPageTranslation(e.movementX, e.movementY);
      this.x += tx / parentWidth;
      this.y += ty / parentHeight;
      if (this.x < 0 || this.x > 1 || this.y < 0 || this.y > 1) {
        // The element will be outside of its parent so change the parent.
        const { x, y } = this.div.getBoundingClientRect();
        if (this.parent.findNewParent(this, x, y)) {
          this.x -= Math.floor(this.x);
          this.y -= Math.floor(this.y);
        }
      }

      this.div.style.left = `${(100 * this.x).toFixed(2)}%`;
      this.div.style.top = `${(100 * this.y).toFixed(2)}%`;
      this.div.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener(
      "pointermove",
      pointerMoveCallback,
      pointerMoveOptions
    );

    const pointerUpCallback = () => {
      this._uiManager.disableUserSelect(false);
      window.removeEventListener("pointerup", pointerUpCallback);
      window.removeEventListener("blur", pointerUpCallback);
      window.removeEventListener(
        "pointermove",
        pointerMoveCallback,
        pointerMoveOptions
      );
      const newParent = this.parent;
      const newX = this.x;
      const newY = this.y;
      if (newParent === savedParent && newX === savedX && newY === savedY) {
        return;
      }

      this.addCommands({
        cmd: () => {
          newParent.changeParent(this);
          this.x = newX;
          this.y = newY;
          this.fixAndSetPosition();
          newParent.moveEditorInDOM(this);
        },
        undo: () => {
          savedParent.changeParent(this);
          this.x = savedX;
          this.y = savedY;
          this.fixAndSetPosition();
          savedParent.moveEditorInDOM(this);
        },
        mustExec: false,
      });

      this.fixAndSetPosition();
      this.parent.moveEditorInDOM(this);
      this.div.focus();
    };
    window.addEventListener("pointerup", pointerUpCallback);
    // If the user is using alt+tab during the dragging session, the pointerup
    // event could be not fired, but a blur event is fired so we can use it in
    // order to interrupt the dragging session.
    window.addEventListener("blur", pointerUpCallback);
  }

  /**
   * Convert the current rect into a page one.
   */
  getRect(tx, ty) {
    const scale = this.parentScale;
    const [pageWidth, pageHeight] = this.pageDimensions;
    const [pageX, pageY] = this.pageTranslation;
    const shiftX = tx / scale;
    const shiftY = ty / scale;
    const x = this.x * pageWidth;
    const y = this.y * pageHeight;
    const width = this.width * pageWidth;
    const height = this.height * pageHeight;

    switch (this.rotation) {
      case 0:
        return [
          x + shiftX + pageX,
          pageHeight - y - shiftY - height + pageY,
          x + shiftX + width + pageX,
          pageHeight - y - shiftY + pageY,
        ];
      case 90:
        return [
          x + shiftY + pageX,
          pageHeight - y + shiftX + pageY,
          x + shiftY + height + pageX,
          pageHeight - y + shiftX + width + pageY,
        ];
      case 180:
        return [
          x - shiftX - width + pageX,
          pageHeight - y + shiftY + pageY,
          x - shiftX + pageX,
          pageHeight - y + shiftY + height + pageY,
        ];
      case 270:
        return [
          x - shiftY - height + pageX,
          pageHeight - y - shiftX - width + pageY,
          x - shiftY + pageX,
          pageHeight - y - shiftX + pageY,
        ];
      default:
        throw new Error("Invalid rotation");
    }
  }

  getRectInCurrentCoords(rect, pageHeight) {
    const [x1, y1, x2, y2] = rect;

    const width = x2 - x1;
    const height = y2 - y1;

    switch (this.rotation) {
      case 0:
        return [x1, pageHeight - y2, width, height];
      case 90:
        return [x1, pageHeight - y1, height, width];
      case 180:
        return [x2, pageHeight - y1, width, height];
      case 270:
        return [x2, pageHeight - y2, height, width];
      default:
        throw new Error("Invalid rotation");
    }
  }

  /**
   * Executed once this editor has been rendered.
   */
  onceAdded() {}

  /**
   * Check if the editor contains something.
   * @returns {boolean}
   */
  isEmpty() {
    return false;
  }

  /**
   * Enable edit mode.
   */
  enableEditMode() {
    this.#isInEditMode = true;
  }

  /**
   * Disable edit mode.
   */
  disableEditMode() {
    this.#isInEditMode = false;
  }

  /**
   * Check if the editor is edited.
   * @returns {boolean}
   */
  isInEditMode() {
    return this.#isInEditMode;
  }

  /**
   * If it returns true, then this editor handle the keyboard
   * events itself.
   * @returns {boolean}
   */
  shouldGetKeyboardEvents() {
    return false;
  }

  /**
   * Check if this editor needs to be rebuilt or not.
   * @returns {boolean}
   */
  needsToBeRebuilt() {
    return this.div && !this.isAttachedToDOM;
  }

  /**
   * Rebuild the editor in case it has been removed on undo.
   *
   * To implement in subclasses.
   */
  rebuild() {
    this.div?.addEventListener("focusin", this.#boundFocusin);
    this.div?.addEventListener("focusout", this.#boundFocusout);
  }

  /**
   * Serialize the editor.
   * The result of the serialization will be used to construct a
   * new annotation to add to the pdf document.
   *
   * To implement in subclasses.
   * @param {boolean} isForCopying
   * @param {Object} [context]
   */
  serialize(_isForCopying = false, _context = null) {
    unreachable("An editor must be serializable");
  }

  /**
   * Deserialize the editor.
   * The result of the deserialization is a new editor.
   *
   * @param {Object} data
   * @param {AnnotationEditorLayer} parent
   * @param {AnnotationEditorUIManager} uiManager
   * @returns {AnnotationEditor}
   */
  static deserialize(data, parent, uiManager) {
    const editor = new this.prototype.constructor({
      parent,
      id: parent.getNextId(),
      uiManager,
    });
    editor.rotation = data.rotation;

    const [pageWidth, pageHeight] = editor.pageDimensions;
    const [x, y, width, height] = editor.getRectInCurrentCoords(
      data.rect,
      pageHeight
    );
    editor.x = x / pageWidth;
    editor.y = y / pageHeight;
    editor.width = width / pageWidth;
    editor.height = height / pageHeight;

    return editor;
  }

  /**
   * Remove this editor.
   * It's used on ctrl+backspace action.
   */
  remove() {
    this.div.removeEventListener("focusin", this.#boundFocusin);
    this.div.removeEventListener("focusout", this.#boundFocusout);

    if (!this.isEmpty()) {
      // The editor is removed but it can be back at some point thanks to
      // undo/redo so we must commit it before.
      this.commit();
    }
    if (this.parent) {
      this.parent.remove(this);
    } else {
      this._uiManager.removeEditor(this);
    }
  }

  /**
   * @returns {boolean} true if this editor can be resized.
   */
  get isResizable() {
    return false;
  }

  /**
   * Add the resizers to this editor.
   */
  makeResizable() {
    if (this.isResizable) {
      this.#createResizers();
      this.#resizersDiv.classList.remove("hidden");
    }
  }

  /**
   * Select this editor.
   */
  select() {
    this.makeResizable();
    this.div?.classList.add("selectedEditor");
  }

  /**
   * Unselect this editor.
   */
  unselect() {
    this.#resizersDiv?.classList.add("hidden");
    this.div?.classList.remove("selectedEditor");
    if (this.div?.contains(document.activeElement)) {
      // Don't use this.div.blur() because we don't know where the focus will
      // go.
      this._uiManager.currentLayer.div.focus();
    }
  }

  /**
   * Update some parameters which have been changed through the UI.
   * @param {number} type
   * @param {*} value
   */
  updateParams(type, value) {}

  /**
   * When the user disables the editing mode some editors can change some of
   * their properties.
   */
  disableEditing() {}

  /**
   * When the user enables the editing mode some editors can change some of
   * their properties.
   */
  enableEditing() {}

  /**
   * The editor is about to be edited.
   */
  enterInEditMode() {}

  /**
   * Get the div which really contains the displayed content.
   */
  get contentDiv() {
    return this.div;
  }

  /**
   * If true then the editor is currently edited.
   * @type {boolean}
   */
  get isEditing() {
    return this.#isEditing;
  }

  /**
   * When set to true, it means that this editor is currently edited.
   * @param {boolean} value
   */
  set isEditing(value) {
    this.#isEditing = value;
    if (!this.parent) {
      return;
    }
    if (value) {
      this.parent.setSelected(this);
      this.parent.setActiveEditor(this);
    } else {
      this.parent.setActiveEditor(null);
    }
  }

  /**
   * Set the aspect ratio to use when resizing.
   * @param {number} width
   * @param {number} height
   */
  setAspectRatio(width, height) {
    this.#keepAspectRatio = true;
    const aspectRatio = width / height;
    const { style } = this.div;
    style.aspectRatio = aspectRatio;
    style.height = "auto";
  }

  static get MIN_SIZE() {
    return 16;
  }
}

// This class is used to fake an editor which has been deleted.
class FakeEditor extends AnnotationEditor {
  constructor(params) {
    super(params);
    this.annotationElementId = params.annotationElementId;
    this.deleted = true;
  }

  serialize() {
    return {
      id: this.annotationElementId,
      deleted: true,
      pageIndex: this.pageIndex,
    };
  }
}

export { AnnotationEditor };
