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

import {
  AnnotationEditorUIManager,
  bindEvents,
  ColorManager,
  KeyboardManager,
} from "./tools.js";
import { FeatureTest, shadow, unreachable } from "../../shared/util.js";
import { noContextMenu, stopEvent } from "../display_utils.js";
import { AltText } from "./alt_text.js";
import { EditorToolbar } from "./toolbar.js";
import { TouchManager } from "../touch_manager.js";

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
  #accessibilityData = null;

  #allResizerDivs = null;

  #altText = null;

  #disabled = false;

  #dragPointerId = null;

  #dragPointerType = "";

  #keepAspectRatio = false;

  #resizersDiv = null;

  #lastPointerCoords = null;

  #savedDimensions = null;

  #focusAC = null;

  #focusedResizerName = "";

  #hasBeenClicked = false;

  #initialRect = null;

  #isEditing = false;

  #isInEditMode = false;

  #isResizerEnabledForKeyboard = false;

  #moveInDOMTimeout = null;

  #prevDragX = 0;

  #prevDragY = 0;

  #telemetryTimeouts = null;

  #touchManager = null;

  _isCopy = false;

  _editToolbar = null;

  _initialOptions = Object.create(null);

  _initialData = null;

  _isVisible = true;

  _uiManager = null;

  _focusEventsAllowed = true;

  static _l10n = null;

  static _l10nResizer = null;

  #isDraggable = false;

  #zIndex = AnnotationEditor._zIndex++;

  static _borderLineWidth = -1;

  static _colorManager = new ColorManager();

  static _zIndex = 1;

  // Time to wait (in ms) before sending the telemetry data.
  // We wait a bit to avoid sending too many requests when changing something
  // like the thickness of a line.
  static _telemetryTimeout = 1000;

  static get _resizerKeyboardManager() {
    const resize = AnnotationEditor.prototype._resizeWithKeyboard;
    const small = AnnotationEditorUIManager.TRANSLATE_SMALL;
    const big = AnnotationEditorUIManager.TRANSLATE_BIG;

    return shadow(
      this,
      "_resizerKeyboardManager",
      new KeyboardManager([
        [["ArrowLeft", "mac+ArrowLeft"], resize, { args: [-small, 0] }],
        [
          ["ctrl+ArrowLeft", "mac+shift+ArrowLeft"],
          resize,
          { args: [-big, 0] },
        ],
        [["ArrowRight", "mac+ArrowRight"], resize, { args: [small, 0] }],
        [
          ["ctrl+ArrowRight", "mac+shift+ArrowRight"],
          resize,
          { args: [big, 0] },
        ],
        [["ArrowUp", "mac+ArrowUp"], resize, { args: [0, -small] }],
        [["ctrl+ArrowUp", "mac+shift+ArrowUp"], resize, { args: [0, -big] }],
        [["ArrowDown", "mac+ArrowDown"], resize, { args: [0, small] }],
        [["ctrl+ArrowDown", "mac+shift+ArrowDown"], resize, { args: [0, big] }],
        [
          ["Escape", "mac+Escape"],
          AnnotationEditor.prototype._stopResizingWithKeyboard,
        ],
      ])
    );
  }

  /**
   * @param {AnnotationEditorParameters} parameters
   */
  constructor(parameters) {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === AnnotationEditor
    ) {
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
    this._initialOptions.isCentered = parameters.isCentered;
    this._structTreeParentId = null;

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

  get editorType() {
    return Object.getPrototypeOf(this).constructor._type;
  }

  static get isDrawer() {
    return false;
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
   * @param {Object} l10n
   */
  static initialize(l10n, _uiManager) {
    AnnotationEditor._l10n ??= l10n;

    AnnotationEditor._l10nResizer ||= Object.freeze({
      topLeft: "pdfjs-editor-resizer-top-left",
      topMiddle: "pdfjs-editor-resizer-top-middle",
      topRight: "pdfjs-editor-resizer-top-right",
      middleRight: "pdfjs-editor-resizer-middle-right",
      bottomRight: "pdfjs-editor-resizer-bottom-right",
      bottomMiddle: "pdfjs-editor-resizer-bottom-middle",
      bottomLeft: "pdfjs-editor-resizer-bottom-left",
      middleLeft: "pdfjs-editor-resizer-middle-left",
    });

    if (AnnotationEditor._borderLineWidth !== -1) {
      return;
    }
    const style = getComputedStyle(document.documentElement);
    AnnotationEditor._borderLineWidth =
      parseFloat(style.getPropertyValue("--outline-width")) || 0;
  }

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
   * Check if this kind of editor is able to handle the given mime type for
   * pasting.
   * @param {string} mime
   * @returns {boolean}
   */
  static isHandlingMimeForPasting(mime) {
    return false;
  }

  /**
   * Extract the data from the clipboard item and delegate the creation of the
   * editor to the parent.
   * @param {DataTransferItem} item
   * @param {AnnotationEditorLayer} parent
   */
  static paste(item, parent) {
    unreachable("Not implemented");
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
   * @returns {boolean} true if the editor handles the Enter key itself.
   */
  get isEnterHandled() {
    return true;
  }

  center() {
    const [pageWidth, pageHeight] = this.pageDimensions;
    switch (this.parentRotation) {
      case 90:
        this.x -= (this.height * pageHeight) / (pageWidth * 2);
        this.y += (this.width * pageWidth) / (pageHeight * 2);
        break;
      case 180:
        this.x += this.width / 2;
        this.y += this.height / 2;
        break;
      case 270:
        this.x += (this.height * pageHeight) / (pageWidth * 2);
        this.y -= (this.width * pageWidth) / (pageHeight * 2);
        break;
      default:
        this.x -= this.width / 2;
        this.y -= this.height / 2;
        break;
    }
    this.fixAndSetPosition();
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
    } else {
      // The editor is being removed from the DOM, so we need to stop resizing.
      this.#stopResizing();
    }
    this.parent = parent;
  }

  /**
   * onfocus callback.
   */
  focusin(event) {
    if (!this._focusEventsAllowed) {
      return;
    }
    if (!this.#hasBeenClicked) {
      this.parent.setSelected(this);
    } else {
      this.#hasBeenClicked = false;
    }
  }

  /**
   * onblur callback.
   * @param {FocusEvent} event
   */
  focusout(event) {
    if (!this._focusEventsAllowed) {
      return;
    }

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

  _moveAfterPaste(baseX, baseY) {
    const [parentWidth, parentHeight] = this.parentDimensions;
    this.setAt(
      baseX * parentWidth,
      baseY * parentHeight,
      this.width * parentWidth,
      this.height * parentHeight
    );
    this._onTranslated();
  }

  #translate([width, height], x, y) {
    [x, y] = this.screenToPageTranslation(x, y);

    this.x += x / width;
    this.y += y / height;

    this._onTranslating(this.x, this.y);

    this.fixAndSetPosition();
  }

  /**
   * Translate the editor position within its parent.
   * @param {number} x - x-translation in screen coordinates.
   * @param {number} y - y-translation in screen coordinates.
   */
  translate(x, y) {
    // We don't change the initial position because the move here hasn't been
    // done by the user.
    this.#translate(this.parentDimensions, x, y);
  }

  /**
   * Translate the editor position within its page and adjust the scroll
   * in order to have the editor in the view.
   * @param {number} x - x-translation in page coordinates.
   * @param {number} y - y-translation in page coordinates.
   */
  translateInPage(x, y) {
    this.#initialRect ||= [this.x, this.y, this.width, this.height];
    this.#translate(this.pageDimensions, x, y);
    this.div.scrollIntoView({ block: "nearest" });
  }

  translationDone() {
    this._onTranslated(this.x, this.y);
  }

  drag(tx, ty) {
    this.#initialRect ||= [this.x, this.y, this.width, this.height];
    const {
      div,
      parentDimensions: [parentWidth, parentHeight],
    } = this;
    this.x += tx / parentWidth;
    this.y += ty / parentHeight;
    if (this.parent && (this.x < 0 || this.x > 1 || this.y < 0 || this.y > 1)) {
      // It's possible to not have a parent: for example, when the user is
      // dragging all the selected editors but this one on a page which has been
      // destroyed.
      // It's why we need to check for it. In such a situation, it isn't really
      // a problem to not find a new parent: it's something which is related to
      // what the user is seeing, hence it depends on how pages are layed out.

      // The element will be outside of its parent so change the parent.
      const { x, y } = this.div.getBoundingClientRect();
      if (this.parent.findNewParent(this, x, y)) {
        this.x -= Math.floor(this.x);
        this.y -= Math.floor(this.y);
      }
    }

    // The editor can be moved wherever the user wants, so we don't need to fix
    // the position: it'll be done when the user will release the mouse button.

    let { x, y } = this;
    const [bx, by] = this.getBaseTranslation();
    x += bx;
    y += by;

    const { style } = div;
    style.left = `${(100 * x).toFixed(2)}%`;
    style.top = `${(100 * y).toFixed(2)}%`;

    this._onTranslating(x, y);

    div.scrollIntoView({ block: "nearest" });
  }

  /**
   * Called when the editor is being translated.
   * @param {number} x - in page coordinates.
   * @param {number} y - in page coordinates.
   */
  _onTranslating(x, y) {}

  /**
   * Called when the editor has been translated.
   * @param {number} x - in page coordinates.
   * @param {number} y - in page coordinates.
   */
  _onTranslated(x, y) {}

  get _hasBeenMoved() {
    return (
      !!this.#initialRect &&
      (this.#initialRect[0] !== this.x || this.#initialRect[1] !== this.y)
    );
  }

  get _hasBeenResized() {
    return (
      !!this.#initialRect &&
      (this.#initialRect[2] !== this.width ||
        this.#initialRect[3] !== this.height)
    );
  }

  /**
   * Get the translation to take into account the editor border.
   * The CSS engine positions the element by taking the border into account so
   * we must apply the opposite translation to have the editor in the right
   * position.
   * @returns {Array<number>}
   */
  getBaseTranslation() {
    const [parentWidth, parentHeight] = this.parentDimensions;
    const { _borderLineWidth } = AnnotationEditor;
    const x = _borderLineWidth / parentWidth;
    const y = _borderLineWidth / parentHeight;
    switch (this.rotation) {
      case 90:
        return [-x, y];
      case 180:
        return [x, y];
      case 270:
        return [x, -y];
      default:
        return [-x, -y];
    }
  }

  /**
   * @returns {boolean} true if position must be fixed (i.e. make the x and y
   * living in the page).
   */
  get _mustFixPosition() {
    return true;
  }

  /**
   * Fix the position of the editor in order to keep it inside its parent page.
   * @param {number} [rotation] - the rotation of the page.
   */
  fixAndSetPosition(rotation = this.rotation) {
    const {
      div: { style },
      pageDimensions: [pageWidth, pageHeight],
    } = this;
    let { x, y, width, height } = this;
    width *= pageWidth;
    height *= pageHeight;
    x *= pageWidth;
    y *= pageHeight;

    if (this._mustFixPosition) {
      switch (rotation) {
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
    }

    this.x = x /= pageWidth;
    this.y = y /= pageHeight;

    const [bx, by] = this.getBaseTranslation();
    x += bx;
    y += by;

    style.left = `${(100 * x).toFixed(2)}%`;
    style.top = `${(100 * y).toFixed(2)}%`;

    this.moveInDOM();
  }

  static #rotatePoint(x, y, angle) {
    switch (angle) {
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
   * Convert a screen translation into a page one.
   * @param {number} x
   * @param {number} y
   */
  screenToPageTranslation(x, y) {
    return AnnotationEditor.#rotatePoint(x, y, this.parentRotation);
  }

  /**
   * Convert a page translation into a screen one.
   * @param {number} x
   * @param {number} y
   */
  pageTranslationToScreen(x, y) {
    return AnnotationEditor.#rotatePoint(x, y, 360 - this.parentRotation);
  }

  #getRotationMatrix(rotation) {
    switch (rotation) {
      case 90: {
        const [pageWidth, pageHeight] = this.pageDimensions;
        return [0, -pageWidth / pageHeight, pageHeight / pageWidth, 0];
      }
      case 180:
        return [-1, 0, 0, -1];
      case 270: {
        const [pageWidth, pageHeight] = this.pageDimensions;
        return [0, pageWidth / pageHeight, -pageHeight / pageWidth, 0];
      }
      default:
        return [1, 0, 0, 1];
    }
  }

  get parentScale() {
    return this._uiManager.viewParameters.realScale;
  }

  get parentRotation() {
    return (this._uiManager.viewParameters.rotation + this.pageRotation) % 360;
  }

  get parentDimensions() {
    const {
      parentScale,
      pageDimensions: [pageWidth, pageHeight],
    } = this;
    return [pageWidth * parentScale, pageHeight * parentScale];
  }

  /**
   * Set the dimensions of this editor.
   * @param {number} width
   * @param {number} height
   */
  setDims(width, height) {
    const [parentWidth, parentHeight] = this.parentDimensions;
    const { style } = this.div;
    style.width = `${((100 * width) / parentWidth).toFixed(2)}%`;
    if (!this.#keepAspectRatio) {
      style.height = `${((100 * height) / parentHeight).toFixed(2)}%`;
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
      style.height = `${((100 * parseFloat(height)) / parentHeight).toFixed(2)}%`;
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
    // When the resizers are used with the keyboard, they're focusable, hence
    // we want to have them in this order (top left, top middle, top right, ...)
    // in the DOM to have the focus order correct.
    const classes = this._willKeepAspectRatio
      ? ["topLeft", "topRight", "bottomRight", "bottomLeft"]
      : [
          "topLeft",
          "topMiddle",
          "topRight",
          "middleRight",
          "bottomRight",
          "bottomMiddle",
          "bottomLeft",
          "middleLeft",
        ];
    const signal = this._uiManager._signal;
    for (const name of classes) {
      const div = document.createElement("div");
      this.#resizersDiv.append(div);
      div.classList.add("resizer", name);
      div.setAttribute("data-resizer-name", name);
      div.addEventListener(
        "pointerdown",
        this.#resizerPointerdown.bind(this, name),
        { signal }
      );
      div.addEventListener("contextmenu", noContextMenu, { signal });
      div.tabIndex = -1;
    }
    this.div.prepend(this.#resizersDiv);
  }

  #resizerPointerdown(name, event) {
    event.preventDefault();
    const { isMac } = FeatureTest.platform;
    if (event.button !== 0 || (event.ctrlKey && isMac)) {
      return;
    }

    this.#altText?.toggle(false);

    const savedDraggable = this._isDraggable;
    this._isDraggable = false;
    this.#lastPointerCoords = [event.screenX, event.screenY];

    const ac = new AbortController();
    const signal = this._uiManager.combinedSignal(ac);

    this.parent.togglePointerEvents(false);
    window.addEventListener(
      "pointermove",
      this.#resizerPointermove.bind(this, name),
      { passive: true, capture: true, signal }
    );
    window.addEventListener(
      "touchmove",
      stopEvent /* Prevent the page from scrolling */,
      { passive: false, signal }
    );
    window.addEventListener("contextmenu", noContextMenu, { signal });
    this.#savedDimensions = {
      savedX: this.x,
      savedY: this.y,
      savedWidth: this.width,
      savedHeight: this.height,
    };
    const savedParentCursor = this.parent.div.style.cursor;
    const savedCursor = this.div.style.cursor;
    this.div.style.cursor = this.parent.div.style.cursor =
      window.getComputedStyle(event.target).cursor;

    const pointerUpCallback = () => {
      ac.abort();
      this.parent.togglePointerEvents(true);
      this.#altText?.toggle(true);
      this._isDraggable = savedDraggable;
      this.parent.div.style.cursor = savedParentCursor;
      this.div.style.cursor = savedCursor;

      this.#addResizeToUndoStack();
    };
    window.addEventListener("pointerup", pointerUpCallback, { signal });
    // If the user switches to another window (with alt+tab), then we end the
    // resize session.
    window.addEventListener("blur", pointerUpCallback, { signal });
  }

  #resize(x, y, width, height) {
    this.width = width;
    this.height = height;
    this.x = x;
    this.y = y;
    const [parentWidth, parentHeight] = this.parentDimensions;
    this.setDims(parentWidth * width, parentHeight * height);
    this.fixAndSetPosition();
    this._onResized();
  }

  /**
   * Called when the editor has been resized.
   */
  _onResized() {}

  #addResizeToUndoStack() {
    if (!this.#savedDimensions) {
      return;
    }
    const { savedX, savedY, savedWidth, savedHeight } = this.#savedDimensions;
    this.#savedDimensions = null;

    const newX = this.x;
    const newY = this.y;
    const newWidth = this.width;
    const newHeight = this.height;
    if (
      newX === savedX &&
      newY === savedY &&
      newWidth === savedWidth &&
      newHeight === savedHeight
    ) {
      return;
    }

    this.addCommands({
      cmd: this.#resize.bind(this, newX, newY, newWidth, newHeight),
      undo: this.#resize.bind(this, savedX, savedY, savedWidth, savedHeight),
      mustExec: true,
    });
  }

  static _round(x) {
    // 10000 because we multiply by 100 and use toFixed(2) in fixAndSetPosition.
    // Without rounding, the positions of the corners other than the top left
    // one can be slightly wrong.
    return Math.round(x * 10000) / 10000;
  }

  #resizerPointermove(name, event) {
    const [parentWidth, parentHeight] = this.parentDimensions;
    const savedX = this.x;
    const savedY = this.y;
    const savedWidth = this.width;
    const savedHeight = this.height;
    const minWidth = AnnotationEditor.MIN_SIZE / parentWidth;
    const minHeight = AnnotationEditor.MIN_SIZE / parentHeight;

    const rotationMatrix = this.#getRotationMatrix(this.rotation);
    const transf = (x, y) => [
      rotationMatrix[0] * x + rotationMatrix[2] * y,
      rotationMatrix[1] * x + rotationMatrix[3] * y,
    ];
    const invRotationMatrix = this.#getRotationMatrix(360 - this.rotation);
    const invTransf = (x, y) => [
      invRotationMatrix[0] * x + invRotationMatrix[2] * y,
      invRotationMatrix[1] * x + invRotationMatrix[3] * y,
    ];
    let getPoint;
    let getOpposite;
    let isDiagonal = false;
    let isHorizontal = false;

    switch (name) {
      case "topLeft":
        isDiagonal = true;
        getPoint = (w, h) => [0, 0];
        getOpposite = (w, h) => [w, h];
        break;
      case "topMiddle":
        getPoint = (w, h) => [w / 2, 0];
        getOpposite = (w, h) => [w / 2, h];
        break;
      case "topRight":
        isDiagonal = true;
        getPoint = (w, h) => [w, 0];
        getOpposite = (w, h) => [0, h];
        break;
      case "middleRight":
        isHorizontal = true;
        getPoint = (w, h) => [w, h / 2];
        getOpposite = (w, h) => [0, h / 2];
        break;
      case "bottomRight":
        isDiagonal = true;
        getPoint = (w, h) => [w, h];
        getOpposite = (w, h) => [0, 0];
        break;
      case "bottomMiddle":
        getPoint = (w, h) => [w / 2, h];
        getOpposite = (w, h) => [w / 2, 0];
        break;
      case "bottomLeft":
        isDiagonal = true;
        getPoint = (w, h) => [0, h];
        getOpposite = (w, h) => [w, 0];
        break;
      case "middleLeft":
        isHorizontal = true;
        getPoint = (w, h) => [0, h / 2];
        getOpposite = (w, h) => [w, h / 2];
        break;
    }

    const point = getPoint(savedWidth, savedHeight);
    const oppositePoint = getOpposite(savedWidth, savedHeight);
    let transfOppositePoint = transf(...oppositePoint);
    const oppositeX = AnnotationEditor._round(savedX + transfOppositePoint[0]);
    const oppositeY = AnnotationEditor._round(savedY + transfOppositePoint[1]);
    let ratioX = 1;
    let ratioY = 1;

    let deltaX, deltaY;

    if (!event.fromKeyboard) {
      // We can't use event.movementX/Y because they're not reliable:
      //  https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/movementX
      // (it was buggy on a laptop with a touch screen).
      const { screenX, screenY } = event;
      const [lastScreenX, lastScreenY] = this.#lastPointerCoords;
      [deltaX, deltaY] = this.screenToPageTranslation(
        screenX - lastScreenX,
        screenY - lastScreenY
      );
      this.#lastPointerCoords[0] = screenX;
      this.#lastPointerCoords[1] = screenY;
    } else {
      ({ deltaX, deltaY } = event);
    }
    [deltaX, deltaY] = invTransf(deltaX / parentWidth, deltaY / parentHeight);

    if (isDiagonal) {
      const oldDiag = Math.hypot(savedWidth, savedHeight);
      ratioX = ratioY = Math.max(
        Math.min(
          Math.hypot(
            oppositePoint[0] - point[0] - deltaX,
            oppositePoint[1] - point[1] - deltaY
          ) / oldDiag,
          // Avoid the editor to be larger than the page.
          1 / savedWidth,
          1 / savedHeight
        ),
        // Avoid the editor to be smaller than the minimum size.
        minWidth / savedWidth,
        minHeight / savedHeight
      );
    } else if (isHorizontal) {
      ratioX =
        Math.max(
          minWidth,
          Math.min(1, Math.abs(oppositePoint[0] - point[0] - deltaX))
        ) / savedWidth;
    } else {
      ratioY =
        Math.max(
          minHeight,
          Math.min(1, Math.abs(oppositePoint[1] - point[1] - deltaY))
        ) / savedHeight;
    }

    const newWidth = AnnotationEditor._round(savedWidth * ratioX);
    const newHeight = AnnotationEditor._round(savedHeight * ratioY);
    transfOppositePoint = transf(...getOpposite(newWidth, newHeight));
    const newX = oppositeX - transfOppositePoint[0];
    const newY = oppositeY - transfOppositePoint[1];

    this.#initialRect ||= [this.x, this.y, this.width, this.height];
    this.width = newWidth;
    this.height = newHeight;
    this.x = newX;
    this.y = newY;

    this.setDims(parentWidth * newWidth, parentHeight * newHeight);
    this.fixAndSetPosition();

    this._onResizing();
  }

  /**
   * Called when the editor is being resized.
   */
  _onResizing() {}

  /**
   * Called when the alt text dialog is closed.
   */
  altTextFinish() {
    this.#altText?.finish();
  }

  /**
   * Add a toolbar for this editor.
   * @returns {Promise<EditorToolbar|null>}
   */
  async addEditToolbar() {
    if (this._editToolbar || this.#isInEditMode) {
      return this._editToolbar;
    }
    this._editToolbar = new EditorToolbar(this);
    this.div.append(this._editToolbar.render());
    if (this.#altText) {
      await this._editToolbar.addAltText(this.#altText);
    }

    return this._editToolbar;
  }

  removeEditToolbar() {
    if (!this._editToolbar) {
      return;
    }
    this._editToolbar.remove();
    this._editToolbar = null;

    // We destroy the alt text but we don't null it because we want to be able
    // to restore it in case the user undoes the deletion.
    this.#altText?.destroy();
  }

  addContainer(container) {
    const editToolbarDiv = this._editToolbar?.div;
    if (editToolbarDiv) {
      editToolbarDiv.before(container);
    } else {
      this.div.append(container);
    }
  }

  getClientDimensions() {
    return this.div.getBoundingClientRect();
  }

  async addAltTextButton() {
    if (this.#altText) {
      return;
    }
    AltText.initialize(AnnotationEditor._l10n);
    this.#altText = new AltText(this);
    if (this.#accessibilityData) {
      this.#altText.data = this.#accessibilityData;
      this.#accessibilityData = null;
    }
    await this.addEditToolbar();
  }

  get altTextData() {
    return this.#altText?.data;
  }

  /**
   * Set the alt text data.
   */
  set altTextData(data) {
    if (!this.#altText) {
      return;
    }
    this.#altText.data = data;
  }

  get guessedAltText() {
    return this.#altText?.guessedText;
  }

  async setGuessedAltText(text) {
    await this.#altText?.setGuessedText(text);
  }

  serializeAltText(isForCopying) {
    return this.#altText?.serialize(isForCopying);
  }

  hasAltText() {
    return !!this.#altText && !this.#altText.isEmpty();
  }

  hasAltTextData() {
    return this.#altText?.hasData() ?? false;
  }

  /**
   * Render this editor in a div.
   * @returns {HTMLDivElement | null}
   */
  render() {
    this.div = document.createElement("div");
    this.div.setAttribute("data-editor-rotation", (360 - this.rotation) % 360);
    this.div.className = this.name;
    this.div.setAttribute("id", this.id);
    this.div.tabIndex = this.#disabled ? -1 : 0;
    if (!this._isVisible) {
      this.div.classList.add("hidden");
    }

    this.setInForeground();
    this.#addFocusListeners();

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

    if (this.isResizable && this._uiManager._supportsPinchToZoom) {
      this.#touchManager ||= new TouchManager({
        container: this.div,
        isPinchingDisabled: () => !this.isSelected,
        onPinchStart: this.#touchPinchStartCallback.bind(this),
        onPinching: this.#touchPinchCallback.bind(this),
        onPinchEnd: this.#touchPinchEndCallback.bind(this),
        signal: this._uiManager._signal,
      });
    }

    this._uiManager._editorUndoBar?.hide();

    return this.div;
  }

  #touchPinchStartCallback() {
    this.#savedDimensions = {
      savedX: this.x,
      savedY: this.y,
      savedWidth: this.width,
      savedHeight: this.height,
    };
    this.#altText?.toggle(false);
    this.parent.togglePointerEvents(false);
  }

  #touchPinchCallback(_origin, prevDistance, distance) {
    // Slightly slow down the zooming because the editor could be small and the
    // user could have difficulties to rescale it as they want.
    const slowDownFactor = 0.7;
    let factor =
      slowDownFactor * (distance / prevDistance) + 1 - slowDownFactor;
    if (factor === 1) {
      return;
    }

    const rotationMatrix = this.#getRotationMatrix(this.rotation);
    const transf = (x, y) => [
      rotationMatrix[0] * x + rotationMatrix[2] * y,
      rotationMatrix[1] * x + rotationMatrix[3] * y,
    ];

    // The center of the editor is the fixed point.
    const [parentWidth, parentHeight] = this.parentDimensions;
    const savedX = this.x;
    const savedY = this.y;
    const savedWidth = this.width;
    const savedHeight = this.height;

    const minWidth = AnnotationEditor.MIN_SIZE / parentWidth;
    const minHeight = AnnotationEditor.MIN_SIZE / parentHeight;
    factor = Math.max(
      Math.min(factor, 1 / savedWidth, 1 / savedHeight),
      minWidth / savedWidth,
      minHeight / savedHeight
    );
    const newWidth = AnnotationEditor._round(savedWidth * factor);
    const newHeight = AnnotationEditor._round(savedHeight * factor);
    if (newWidth === savedWidth && newHeight === savedHeight) {
      return;
    }

    this.#initialRect ||= [savedX, savedY, savedWidth, savedHeight];
    const transfCenterPoint = transf(savedWidth / 2, savedHeight / 2);
    const centerX = AnnotationEditor._round(savedX + transfCenterPoint[0]);
    const centerY = AnnotationEditor._round(savedY + transfCenterPoint[1]);
    const newTransfCenterPoint = transf(newWidth / 2, newHeight / 2);

    this.x = centerX - newTransfCenterPoint[0];
    this.y = centerY - newTransfCenterPoint[1];
    this.width = newWidth;
    this.height = newHeight;

    this.setDims(parentWidth * newWidth, parentHeight * newHeight);
    this.fixAndSetPosition();

    this._onResizing();
  }

  #touchPinchEndCallback() {
    this.#altText?.toggle(true);
    this.parent.togglePointerEvents(true);
    this.#addResizeToUndoStack();
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
    this.#hasBeenClicked = true;

    if (this._isDraggable) {
      this.#setUpDragSession(event);
      return;
    }

    this.#selectOnPointerEvent(event);
  }

  get isSelected() {
    return this._uiManager.isSelected(this);
  }

  #selectOnPointerEvent(event) {
    const { isMac } = FeatureTest.platform;
    if (
      (event.ctrlKey && !isMac) ||
      event.shiftKey ||
      (event.metaKey && isMac)
    ) {
      this.parent.toggleSelected(this);
    } else {
      this.parent.setSelected(this);
    }
  }

  #setUpDragSession(event) {
    const { isSelected } = this;
    this._uiManager.setUpDragSession();
    let hasDraggingStarted = false;

    const ac = new AbortController();
    const signal = this._uiManager.combinedSignal(ac);
    const opts = { capture: true, passive: false, signal };
    const cancelDrag = e => {
      ac.abort();

      this.#dragPointerId = null;
      this.#hasBeenClicked = false;
      if (!this._uiManager.endDragSession()) {
        this.#selectOnPointerEvent(e);
      }
      if (hasDraggingStarted) {
        this._onStopDragging();
      }
    };

    if (isSelected) {
      this.#prevDragX = event.clientX;
      this.#prevDragY = event.clientY;
      this.#dragPointerId = event.pointerId;
      this.#dragPointerType = event.pointerType;
      window.addEventListener(
        "pointermove",
        e => {
          if (!hasDraggingStarted) {
            hasDraggingStarted = true;
            this._onStartDragging();
          }
          const { clientX: x, clientY: y, pointerId } = e;
          if (pointerId !== this.#dragPointerId) {
            stopEvent(e);
            return;
          }
          const [tx, ty] = this.screenToPageTranslation(
            x - this.#prevDragX,
            y - this.#prevDragY
          );
          this.#prevDragX = x;
          this.#prevDragY = y;
          this._uiManager.dragSelectedEditors(tx, ty);
        },
        opts
      );
      window.addEventListener(
        "touchmove",
        stopEvent /* Prevent the page from scrolling */,
        opts
      );
      window.addEventListener(
        "pointerdown",
        // If the user drags with one finger and then clicks with another.
        e => {
          if (e.pointerType === this.#dragPointerType) {
            // We've a pinch to zoom session.
            // We cannot have two primaries at the same time.
            // It's possible to be in this state with Firefox and Gnome when
            // trying to drag with three fingers (see bug 1933716).
            if (this.#touchManager || e.isPrimary) {
              cancelDrag(e);
            }
          }
          stopEvent(e);
        },
        opts
      );
    }

    const pointerUpCallback = e => {
      if (!this.#dragPointerId || this.#dragPointerId === e.pointerId) {
        cancelDrag(e);
        return;
      }
      stopEvent(e);
    };
    window.addEventListener("pointerup", pointerUpCallback, { signal });
    // If the user is using alt+tab during the dragging session, the pointerup
    // event could be not fired, but a blur event is fired so we can use it in
    // order to interrupt the dragging session.
    window.addEventListener("blur", pointerUpCallback, { signal });
  }

  _onStartDragging() {}

  _onStopDragging() {}

  moveInDOM() {
    // Moving the editor in the DOM can be expensive, so we wait a bit before.
    // It's important to not block the UI (for example when changing the font
    // size in a FreeText).
    if (this.#moveInDOMTimeout) {
      clearTimeout(this.#moveInDOMTimeout);
    }
    this.#moveInDOMTimeout = setTimeout(() => {
      this.#moveInDOMTimeout = null;
      this.parent?.moveEditorInDOM(this);
      if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("TESTING")) {
        this._uiManager._eventBus.dispatch("editormovedindom", {
          source: this,
        });
      }
    }, 0);
  }

  _setParentAndPosition(parent, x, y) {
    parent.changeParent(this);
    this.x = x;
    this.y = y;
    this.fixAndSetPosition();
    this._onTranslated();
  }

  /**
   * Convert the current rect into a page one.
   * @param {number} tx - x-translation in screen coordinates.
   * @param {number} ty - y-translation in screen coordinates.
   * @param {number} [rotation] - the rotation of the page.
   */
  getRect(tx, ty, rotation = this.rotation) {
    const scale = this.parentScale;
    const [pageWidth, pageHeight] = this.pageDimensions;
    const [pageX, pageY] = this.pageTranslation;
    const shiftX = tx / scale;
    const shiftY = ty / scale;
    const x = this.x * pageWidth;
    const y = this.y * pageHeight;
    const width = this.width * pageWidth;
    const height = this.height * pageHeight;

    switch (rotation) {
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
   * @param {boolean} focus - true if the editor should be focused.
   */
  onceAdded(focus) {}

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
   * If it returns true, then this editor handles the keyboard
   * events itself.
   * @returns {boolean}
   */
  shouldGetKeyboardEvents() {
    return this.#isResizerEnabledForKeyboard;
  }

  /**
   * Check if this editor needs to be rebuilt or not.
   * @returns {boolean}
   */
  needsToBeRebuilt() {
    return this.div && !this.isAttachedToDOM;
  }

  get isOnScreen() {
    const { top, left, bottom, right } = this.getClientDimensions();
    const { innerHeight, innerWidth } = window;
    return left < innerWidth && right > 0 && top < innerHeight && bottom > 0;
  }

  #addFocusListeners() {
    if (this.#focusAC || !this.div) {
      return;
    }
    this.#focusAC = new AbortController();
    const signal = this._uiManager.combinedSignal(this.#focusAC);

    this.div.addEventListener("focusin", this.focusin.bind(this), { signal });
    this.div.addEventListener("focusout", this.focusout.bind(this), { signal });
  }

  /**
   * Rebuild the editor in case it has been removed on undo.
   *
   * To implement in subclasses.
   */
  rebuild() {
    this.#addFocusListeners();
  }

  /**
   * Rotate the editor when the page is rotated.
   * @param {number} angle
   */
  rotate(_angle) {}

  /**
   * Resize the editor when the page is resized.
   */
  resize() {}

  /**
   * Serialize the editor when it has been deleted.
   * @returns {Object}
   */
  serializeDeleted() {
    return {
      id: this.annotationElementId,
      deleted: true,
      pageIndex: this.pageIndex,
      popupRef: this._initialData?.popupRef || "",
    };
  }

  /**
   * Serialize the editor.
   * The result of the serialization will be used to construct a
   * new annotation to add to the pdf document.
   *
   * To implement in subclasses.
   * @param {boolean} [isForCopying]
   * @param {Object | null} [context]
   * @returns {Object | null}
   */
  serialize(isForCopying = false, context = null) {
    unreachable("An editor must be serializable");
  }

  /**
   * Deserialize the editor.
   * The result of the deserialization is a new editor.
   *
   * @param {Object} data
   * @param {AnnotationEditorLayer} parent
   * @param {AnnotationEditorUIManager} uiManager
   * @returns {Promise<AnnotationEditor | null>}
   */
  static async deserialize(data, parent, uiManager) {
    const editor = new this.prototype.constructor({
      parent,
      id: parent.getNextId(),
      uiManager,
    });
    editor.rotation = data.rotation;
    editor.#accessibilityData = data.accessibilityData;
    editor._isCopy = data.isCopy || false;

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
   * Check if an existing annotation associated with this editor has been
   * modified.
   * @returns {boolean}
   */
  get hasBeenModified() {
    return (
      !!this.annotationElementId && (this.deleted || this.serialize() !== null)
    );
  }

  /**
   * Remove this editor.
   * It's used on ctrl+backspace action.
   */
  remove() {
    this.#focusAC?.abort();
    this.#focusAC = null;

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

    if (this.#moveInDOMTimeout) {
      clearTimeout(this.#moveInDOMTimeout);
      this.#moveInDOMTimeout = null;
    }
    this.#stopResizing();
    this.removeEditToolbar();
    if (this.#telemetryTimeouts) {
      for (const timeout of this.#telemetryTimeouts.values()) {
        clearTimeout(timeout);
      }
      this.#telemetryTimeouts = null;
    }
    this.parent = null;
    this.#touchManager?.destroy();
    this.#touchManager = null;
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
      bindEvents(this, this.div, ["keydown"]);
    }
  }

  get toolbarPosition() {
    return null;
  }

  /**
   * onkeydown callback.
   * @param {KeyboardEvent} event
   */
  keydown(event) {
    if (
      !this.isResizable ||
      event.target !== this.div ||
      event.key !== "Enter"
    ) {
      return;
    }
    this._uiManager.setSelected(this);
    this.#savedDimensions = {
      savedX: this.x,
      savedY: this.y,
      savedWidth: this.width,
      savedHeight: this.height,
    };
    const children = this.#resizersDiv.children;
    if (!this.#allResizerDivs) {
      this.#allResizerDivs = Array.from(children);
      const boundResizerKeydown = this.#resizerKeydown.bind(this);
      const boundResizerBlur = this.#resizerBlur.bind(this);
      const signal = this._uiManager._signal;
      for (const div of this.#allResizerDivs) {
        const name = div.getAttribute("data-resizer-name");
        div.setAttribute("role", "spinbutton");
        div.addEventListener("keydown", boundResizerKeydown, { signal });
        div.addEventListener("blur", boundResizerBlur, { signal });
        div.addEventListener("focus", this.#resizerFocus.bind(this, name), {
          signal,
        });
        div.setAttribute("data-l10n-id", AnnotationEditor._l10nResizer[name]);
      }
    }

    // We want to have the resizers in the visual order, so we move the first
    // (top-left) to the right place.
    const first = this.#allResizerDivs[0];
    let firstPosition = 0;
    for (const div of children) {
      if (div === first) {
        break;
      }
      firstPosition++;
    }
    const nextFirstPosition =
      (((360 - this.rotation + this.parentRotation) % 360) / 90) *
      (this.#allResizerDivs.length / 4);

    if (nextFirstPosition !== firstPosition) {
      // We need to reorder the resizers in the DOM in order to have the focus
      // on the top-left one.
      if (nextFirstPosition < firstPosition) {
        for (let i = 0; i < firstPosition - nextFirstPosition; i++) {
          this.#resizersDiv.append(this.#resizersDiv.firstChild);
        }
      } else if (nextFirstPosition > firstPosition) {
        for (let i = 0; i < nextFirstPosition - firstPosition; i++) {
          this.#resizersDiv.firstChild.before(this.#resizersDiv.lastChild);
        }
      }

      let i = 0;
      for (const child of children) {
        const div = this.#allResizerDivs[i++];
        const name = div.getAttribute("data-resizer-name");
        child.setAttribute("data-l10n-id", AnnotationEditor._l10nResizer[name]);
      }
    }

    this.#setResizerTabIndex(0);
    this.#isResizerEnabledForKeyboard = true;
    this.#resizersDiv.firstChild.focus({ focusVisible: true });
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  #resizerKeydown(event) {
    AnnotationEditor._resizerKeyboardManager.exec(this, event);
  }

  #resizerBlur(event) {
    if (
      this.#isResizerEnabledForKeyboard &&
      event.relatedTarget?.parentNode !== this.#resizersDiv
    ) {
      this.#stopResizing();
    }
  }

  #resizerFocus(name) {
    this.#focusedResizerName = this.#isResizerEnabledForKeyboard ? name : "";
  }

  #setResizerTabIndex(value) {
    if (!this.#allResizerDivs) {
      return;
    }
    for (const div of this.#allResizerDivs) {
      div.tabIndex = value;
    }
  }

  _resizeWithKeyboard(x, y) {
    if (!this.#isResizerEnabledForKeyboard) {
      return;
    }
    this.#resizerPointermove(this.#focusedResizerName, {
      deltaX: x,
      deltaY: y,
      fromKeyboard: true,
    });
  }

  #stopResizing() {
    this.#isResizerEnabledForKeyboard = false;
    this.#setResizerTabIndex(-1);
    this.#addResizeToUndoStack();
  }

  _stopResizingWithKeyboard() {
    this.#stopResizing();
    this.div.focus();
  }

  /**
   * Select this editor.
   */
  select() {
    this.makeResizable();
    this.div?.classList.add("selectedEditor");
    if (!this._editToolbar) {
      this.addEditToolbar().then(() => {
        if (this.div?.classList.contains("selectedEditor")) {
          // The editor can have been unselected while we were waiting for the
          // edit toolbar to be created, hence we want to be sure that this
          // editor is still selected.
          this._editToolbar?.show();
        }
      });
      return;
    }
    this._editToolbar?.show();
    this.#altText?.toggleAltTextBadge(false);
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
      this._uiManager.currentLayer.div.focus({
        preventScroll: true,
      });
    }
    this._editToolbar?.hide();
    this.#altText?.toggleAltTextBadge(true);
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
   * @returns {HTMLElement | null} the element requiring an alt text.
   */
  getImageForAltText() {
    return null;
  }

  /**
   * Get the div which really contains the displayed content.
   * @returns {HTMLDivElement | undefined}
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

  static canCreateNewEmptyEditor() {
    return true;
  }

  /**
   * Get the data to report to the telemetry when the editor is added.
   * @returns {Object}
   */
  get telemetryInitialData() {
    return { action: "added" };
  }

  /**
   * The telemetry data to use when saving/printing.
   * @returns {Object|null}
   */
  get telemetryFinalData() {
    return null;
  }

  _reportTelemetry(data, mustWait = false) {
    if (mustWait) {
      this.#telemetryTimeouts ||= new Map();
      const { action } = data;
      let timeout = this.#telemetryTimeouts.get(action);
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => {
        this._reportTelemetry(data);
        this.#telemetryTimeouts.delete(action);
        if (this.#telemetryTimeouts.size === 0) {
          this.#telemetryTimeouts = null;
        }
      }, AnnotationEditor._telemetryTimeout);
      this.#telemetryTimeouts.set(action, timeout);
      return;
    }
    data.type ||= this.editorType;
    this._uiManager._eventBus.dispatch("reporttelemetry", {
      source: this,
      details: {
        type: "editing",
        data,
      },
    });
  }

  /**
   * Show or hide this editor.
   * @param {boolean|undefined} visible
   */
  show(visible = this._isVisible) {
    this.div.classList.toggle("hidden", !visible);
    this._isVisible = visible;
  }

  enable() {
    if (this.div) {
      this.div.tabIndex = 0;
    }
    this.#disabled = false;
  }

  disable() {
    if (this.div) {
      this.div.tabIndex = -1;
    }
    this.#disabled = true;
  }

  /**
   * Render an annotation in the annotation layer.
   * @param {Object} annotation
   * @returns {HTMLElement|null}
   */
  renderAnnotationElement(annotation) {
    let content = annotation.container.querySelector(".annotationContent");
    if (!content) {
      content = document.createElement("div");
      content.classList.add("annotationContent", this.editorType);
      annotation.container.prepend(content);
    } else if (content.nodeName === "CANVAS") {
      const canvas = content;
      content = document.createElement("div");
      content.classList.add("annotationContent", this.editorType);
      canvas.before(content);
    }

    return content;
  }

  resetAnnotationElement(annotation) {
    const { firstChild } = annotation.container;
    if (
      firstChild?.nodeName === "DIV" &&
      firstChild.classList.contains("annotationContent")
    ) {
      firstChild.remove();
    }
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
    return this.serializeDeleted();
  }
}

export { AnnotationEditor };
