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

/** @typedef {import("./editor.js").AnnotationEditor} AnnotationEditor */
// eslint-disable-next-line max-len
/** @typedef {import("./annotation_editor_layer.js").AnnotationEditorLayer} AnnotationEditorLayer */

import {
  AnnotationEditorParamsType,
  AnnotationEditorPrefix,
  AnnotationEditorType,
  FeatureTest,
  getUuid,
  shadow,
  Util,
  warn,
} from "../../shared/util.js";
import {
  fetchData,
  getColorValues,
  getRGB,
  PixelsPerInch,
  stopEvent,
} from "../display_utils.js";
import { HighlightToolbar } from "./toolbar.js";

function bindEvents(obj, element, names) {
  for (const name of names) {
    element.addEventListener(name, obj[name].bind(obj));
  }
}

/**
 * Class to create some unique ids for the different editors.
 */
class IdManager {
  #id = 0;

  constructor() {
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("TESTING")) {
      Object.defineProperty(this, "reset", {
        value: () => (this.#id = 0),
      });
    }
  }

  /**
   * Get a unique id.
   * @returns {string}
   */
  get id() {
    return `${AnnotationEditorPrefix}${this.#id++}`;
  }
}

/**
 * Class to manage the images used by the editors.
 * The main idea is to try to minimize the memory used by the images.
 * The images are cached and reused when possible
 * We use a refCounter to know when an image is not used anymore but we need to
 * be able to restore an image after a remove+undo, so we keep a file reference
 * or an url one.
 */
class ImageManager {
  #baseId = getUuid();

  #id = 0;

  #cache = null;

  static get _isSVGFittingCanvas() {
    // By default, Firefox doesn't rescale without preserving the aspect ratio
    // when drawing an SVG image on a canvas, see https://bugzilla.mozilla.org/1547776.
    // The "workaround" is to append "svgView(preserveAspectRatio(none))" to the
    // url, but according to comment #15, it seems that it leads to unexpected
    // behavior in Safari.
    const svg = `data:image/svg+xml;charset=UTF-8,<svg viewBox="0 0 1 1" width="1" height="1" xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1" style="fill:red;"/></svg>`;
    const canvas = new OffscreenCanvas(1, 3);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const image = new Image();
    image.src = svg;
    const promise = image.decode().then(() => {
      ctx.drawImage(image, 0, 0, 1, 1, 0, 0, 1, 3);
      return new Uint32Array(ctx.getImageData(0, 0, 1, 1).data.buffer)[0] === 0;
    });

    return shadow(this, "_isSVGFittingCanvas", promise);
  }

  async #get(key, rawData) {
    this.#cache ||= new Map();
    let data = this.#cache.get(key);
    if (data === null) {
      // We already tried to load the image but it failed.
      return null;
    }
    if (data?.bitmap) {
      data.refCounter += 1;
      return data;
    }
    try {
      data ||= {
        bitmap: null,
        id: `image_${this.#baseId}_${this.#id++}`,
        refCounter: 0,
        isSvg: false,
      };
      let image;
      if (typeof rawData === "string") {
        data.url = rawData;
        image = await fetchData(rawData, "blob");
      } else if (rawData instanceof File) {
        image = data.file = rawData;
      } else if (rawData instanceof Blob) {
        image = rawData;
      }

      if (image.type === "image/svg+xml") {
        // Unfortunately, createImageBitmap doesn't work with SVG images.
        // (see https://bugzilla.mozilla.org/1841972).
        const mustRemoveAspectRatioPromise = ImageManager._isSVGFittingCanvas;
        const fileReader = new FileReader();
        const imageElement = new Image();
        const imagePromise = new Promise((resolve, reject) => {
          imageElement.onload = () => {
            data.bitmap = imageElement;
            data.isSvg = true;
            resolve();
          };
          fileReader.onload = async () => {
            const url = (data.svgUrl = fileReader.result);
            // We need to set the preserveAspectRatio to none in order to let
            // the image fits the canvas when resizing.
            imageElement.src = (await mustRemoveAspectRatioPromise)
              ? `${url}#svgView(preserveAspectRatio(none))`
              : url;
          };
          imageElement.onerror = fileReader.onerror = reject;
        });
        fileReader.readAsDataURL(image);
        await imagePromise;
      } else {
        data.bitmap = await createImageBitmap(image);
      }
      data.refCounter = 1;
    } catch (e) {
      warn(e);
      data = null;
    }
    this.#cache.set(key, data);
    if (data) {
      this.#cache.set(data.id, data);
    }
    return data;
  }

  async getFromFile(file) {
    const { lastModified, name, size, type } = file;
    return this.#get(`${lastModified}_${name}_${size}_${type}`, file);
  }

  async getFromUrl(url) {
    return this.#get(url, url);
  }

  async getFromBlob(id, blobPromise) {
    const blob = await blobPromise;
    return this.#get(id, blob);
  }

  async getFromId(id) {
    this.#cache ||= new Map();
    const data = this.#cache.get(id);
    if (!data) {
      return null;
    }
    if (data.bitmap) {
      data.refCounter += 1;
      return data;
    }

    if (data.file) {
      return this.getFromFile(data.file);
    }
    if (data.blobPromise) {
      const { blobPromise } = data;
      delete data.blobPromise;
      return this.getFromBlob(data.id, blobPromise);
    }
    return this.getFromUrl(data.url);
  }

  getFromCanvas(id, canvas) {
    this.#cache ||= new Map();
    let data = this.#cache.get(id);
    if (data?.bitmap) {
      data.refCounter += 1;
      return data;
    }
    const offscreen = new OffscreenCanvas(canvas.width, canvas.height);
    const ctx = offscreen.getContext("2d");
    ctx.drawImage(canvas, 0, 0);
    data = {
      bitmap: offscreen.transferToImageBitmap(),
      id: `image_${this.#baseId}_${this.#id++}`,
      refCounter: 1,
      isSvg: false,
    };
    this.#cache.set(id, data);
    this.#cache.set(data.id, data);
    return data;
  }

  getSvgUrl(id) {
    const data = this.#cache.get(id);
    if (!data?.isSvg) {
      return null;
    }
    return data.svgUrl;
  }

  deleteId(id) {
    this.#cache ||= new Map();
    const data = this.#cache.get(id);
    if (!data) {
      return;
    }
    data.refCounter -= 1;
    if (data.refCounter !== 0) {
      return;
    }
    const { bitmap } = data;
    if (!data.url && !data.file) {
      // The image has no way to be restored (ctrl+z) so we must fix that.
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("bitmaprenderer");
      ctx.transferFromImageBitmap(bitmap);
      data.blobPromise = canvas.convertToBlob();
    }

    bitmap.close?.();
    data.bitmap = null;
  }

  // We can use the id only if it belongs this manager.
  // We must take care of having the right manager because we can copy/paste
  // some images from other documents, hence it'd be a pity to use an id from an
  // other manager.
  isValidId(id) {
    return id.startsWith(`image_${this.#baseId}_`);
  }
}

/**
 * Class to handle undo/redo.
 * Commands are just saved in a buffer.
 * If we hit some memory issues we could likely use a circular buffer.
 * It has to be used as a singleton.
 */
class CommandManager {
  #commands = [];

  #locked = false;

  #maxSize;

  #position = -1;

  constructor(maxSize = 128) {
    this.#maxSize = maxSize;
  }

  /**
   * @typedef {Object} addOptions
   * @property {function} cmd
   * @property {function} undo
   * @property {function} [post]
   * @property {boolean} mustExec
   * @property {number} type
   * @property {boolean} overwriteIfSameType
   * @property {boolean} keepUndo
   */

  /**
   * Add a new couple of commands to be used in case of redo/undo.
   * @param {addOptions} options
   */
  add({
    cmd,
    undo,
    post,
    mustExec,
    type = NaN,
    overwriteIfSameType = false,
    keepUndo = false,
  }) {
    if (mustExec) {
      cmd();
    }

    if (this.#locked) {
      return;
    }

    const save = { cmd, undo, post, type };
    if (this.#position === -1) {
      if (this.#commands.length > 0) {
        // All the commands have been undone and then a new one is added
        // hence we clear the queue.
        this.#commands.length = 0;
      }
      this.#position = 0;
      this.#commands.push(save);
      return;
    }

    if (overwriteIfSameType && this.#commands[this.#position].type === type) {
      // For example when we change a color we don't want to
      // be able to undo all the steps, hence we only want to
      // keep the last undoable action in this sequence of actions.
      if (keepUndo) {
        save.undo = this.#commands[this.#position].undo;
      }
      this.#commands[this.#position] = save;
      return;
    }

    const next = this.#position + 1;
    if (next === this.#maxSize) {
      this.#commands.splice(0, 1);
    } else {
      this.#position = next;
      if (next < this.#commands.length) {
        this.#commands.splice(next);
      }
    }

    this.#commands.push(save);
  }

  /**
   * Undo the last command.
   */
  undo() {
    if (this.#position === -1) {
      // Nothing to undo.
      return;
    }

    // Avoid to insert something during the undo execution.
    this.#locked = true;
    const { undo, post } = this.#commands[this.#position];
    undo();
    post?.();
    this.#locked = false;

    this.#position -= 1;
  }

  /**
   * Redo the last command.
   */
  redo() {
    if (this.#position < this.#commands.length - 1) {
      this.#position += 1;

      // Avoid to insert something during the redo execution.
      this.#locked = true;
      const { cmd, post } = this.#commands[this.#position];
      cmd();
      post?.();
      this.#locked = false;
    }
  }

  /**
   * Check if there is something to undo.
   * @returns {boolean}
   */
  hasSomethingToUndo() {
    return this.#position !== -1;
  }

  /**
   * Check if there is something to redo.
   * @returns {boolean}
   */
  hasSomethingToRedo() {
    return this.#position < this.#commands.length - 1;
  }

  cleanType(type) {
    if (this.#position === -1) {
      return;
    }
    for (let i = this.#position; i >= 0; i--) {
      if (this.#commands[i].type !== type) {
        this.#commands.splice(i + 1, this.#position - i);
        this.#position = i;
        return;
      }
    }
    this.#commands.length = 0;
    this.#position = -1;
  }

  destroy() {
    this.#commands = null;
  }
}

/**
 * Class to handle the different keyboards shortcuts we can have on mac or
 * non-mac OSes.
 */
class KeyboardManager {
  /**
   * Create a new keyboard manager class.
   * @param {Array<Array>} callbacks - an array containing an array of shortcuts
   * and a callback to call.
   * A shortcut is a string like `ctrl+c` or `mac+ctrl+c` for mac OS.
   */
  constructor(callbacks) {
    this.buffer = [];
    this.callbacks = new Map();
    this.allKeys = new Set();

    const { isMac } = FeatureTest.platform;
    for (const [keys, callback, options = {}] of callbacks) {
      for (const key of keys) {
        const isMacKey = key.startsWith("mac+");
        if (isMac && isMacKey) {
          this.callbacks.set(key.slice(4), { callback, options });
          this.allKeys.add(key.split("+").at(-1));
        } else if (!isMac && !isMacKey) {
          this.callbacks.set(key, { callback, options });
          this.allKeys.add(key.split("+").at(-1));
        }
      }
    }
  }

  /**
   * Serialize an event into a string in order to match a
   * potential key for a callback.
   * @param {KeyboardEvent} event
   * @returns {string}
   */
  #serialize(event) {
    if (event.altKey) {
      this.buffer.push("alt");
    }
    if (event.ctrlKey) {
      this.buffer.push("ctrl");
    }
    if (event.metaKey) {
      this.buffer.push("meta");
    }
    if (event.shiftKey) {
      this.buffer.push("shift");
    }
    this.buffer.push(event.key);
    const str = this.buffer.join("+");
    this.buffer.length = 0;

    return str;
  }

  /**
   * Execute a callback, if any, for a given keyboard event.
   * The self is used as `this` in the callback.
   * @param {Object} self
   * @param {KeyboardEvent} event
   * @returns
   */
  exec(self, event) {
    if (!this.allKeys.has(event.key)) {
      return;
    }
    const info = this.callbacks.get(this.#serialize(event));
    if (!info) {
      return;
    }
    const {
      callback,
      options: { bubbles = false, args = [], checker = null },
    } = info;

    if (checker && !checker(self, event)) {
      return;
    }
    callback.bind(self, ...args, event)();

    // For example, ctrl+s in a FreeText must be handled by the viewer, hence
    // the event must bubble.
    if (!bubbles) {
      stopEvent(event);
    }
  }
}

class ColorManager {
  static _colorsMapping = new Map([
    ["CanvasText", [0, 0, 0]],
    ["Canvas", [255, 255, 255]],
  ]);

  get _colors() {
    if (
      typeof PDFJSDev !== "undefined" &&
      PDFJSDev.test("LIB") &&
      typeof document === "undefined"
    ) {
      return shadow(this, "_colors", ColorManager._colorsMapping);
    }

    const colors = new Map([
      ["CanvasText", null],
      ["Canvas", null],
    ]);
    getColorValues(colors);
    return shadow(this, "_colors", colors);
  }

  /**
   * In High Contrast Mode, the color on the screen is not always the
   * real color used in the pdf.
   * For example in some cases white can appear to be black but when saving
   * we want to have white.
   * @param {string} color
   * @returns {Array<number>}
   */
  convert(color) {
    const rgb = getRGB(color);
    if (!window.matchMedia("(forced-colors: active)").matches) {
      return rgb;
    }

    for (const [name, RGB] of this._colors) {
      if (RGB.every((x, i) => x === rgb[i])) {
        return ColorManager._colorsMapping.get(name);
      }
    }
    return rgb;
  }

  /**
   * An input element must have its color value as a hex string
   * and not as color name.
   * So this function converts a name into an hex string.
   * @param {string} name
   * @returns {string}
   */
  getHexCode(name) {
    const rgb = this._colors.get(name);
    if (!rgb) {
      return name;
    }
    return Util.makeHexColor(...rgb);
  }
}

/**
 * A pdf has several pages and each of them when it will rendered
 * will have an AnnotationEditorLayer which will contain the some
 * new Annotations associated to an editor in order to modify them.
 *
 * This class is used to manage all the different layers, editors and
 * some action like copy/paste, undo/redo, ...
 */
class AnnotationEditorUIManager {
  #abortController = new AbortController();

  #activeEditor = null;

  #allEditors = new Map();

  #allLayers = new Map();

  #altTextManager = null;

  #annotationStorage = null;

  #changedExistingAnnotations = null;

  #commandManager = new CommandManager();

  #copyPasteAC = null;

  #currentDrawingSession = null;

  #currentPageIndex = 0;

  #deletedAnnotationsElementIds = new Set();

  #draggingEditors = null;

  #editorTypes = null;

  #editorsToRescale = new Set();

  _editorUndoBar = null;

  #enableHighlightFloatingButton = false;

  #enableUpdatedAddImage = false;

  #enableNewAltTextWhenAddingImage = false;

  #filterFactory = null;

  #focusMainContainerTimeoutId = null;

  #focusManagerAC = null;

  #highlightColors = null;

  #highlightWhenShiftUp = false;

  #highlightToolbar = null;

  #idManager = new IdManager();

  #isEnabled = false;

  #isWaiting = false;

  #keyboardManagerAC = null;

  #lastActiveElement = null;

  #mainHighlightColorPicker = null;

  #missingCanvases = null;

  #mlManager = null;

  #mode = AnnotationEditorType.NONE;

  #selectedEditors = new Set();

  #selectedTextNode = null;

  #signatureManager = null;

  #pageColors = null;

  #showAllStates = null;

  #previousStates = {
    isEditing: false,
    isEmpty: true,
    hasSomethingToUndo: false,
    hasSomethingToRedo: false,
    hasSelectedEditor: false,
    hasSelectedText: false,
  };

  #translation = [0, 0];

  #translationTimeoutId = null;

  #container = null;

  #viewer = null;

  #viewerAlert = null;

  #updateModeCapability = null;

  static TRANSLATE_SMALL = 1; // page units.

  static TRANSLATE_BIG = 10; // page units.

  static get _keyboardManager() {
    const proto = AnnotationEditorUIManager.prototype;

    /**
     * If the focused element is an input, we don't want to handle the arrow.
     * For example, sliders can be controlled with the arrow keys.
     */
    const arrowChecker = self =>
      self.#container.contains(document.activeElement) &&
      document.activeElement.tagName !== "BUTTON" &&
      self.hasSomethingToControl();

    const textInputChecker = (_self, { target: el }) => {
      if (el instanceof HTMLInputElement) {
        const { type } = el;
        return type !== "text" && type !== "number";
      }
      return true;
    };

    const small = this.TRANSLATE_SMALL;
    const big = this.TRANSLATE_BIG;

    return shadow(
      this,
      "_keyboardManager",
      new KeyboardManager([
        [
          ["ctrl+a", "mac+meta+a"],
          proto.selectAll,
          { checker: textInputChecker },
        ],
        [["ctrl+z", "mac+meta+z"], proto.undo, { checker: textInputChecker }],
        [
          // On mac, depending of the OS version, the event.key is either "z" or
          // "Z" when the user presses "meta+shift+z".
          [
            "ctrl+y",
            "ctrl+shift+z",
            "mac+meta+shift+z",
            "ctrl+shift+Z",
            "mac+meta+shift+Z",
          ],
          proto.redo,
          { checker: textInputChecker },
        ],
        [
          [
            "Backspace",
            "alt+Backspace",
            "ctrl+Backspace",
            "shift+Backspace",
            "mac+Backspace",
            "mac+alt+Backspace",
            "mac+ctrl+Backspace",
            "Delete",
            "ctrl+Delete",
            "shift+Delete",
            "mac+Delete",
          ],
          proto.delete,
          { checker: textInputChecker },
        ],
        [
          ["Enter", "mac+Enter"],
          proto.addNewEditorFromKeyboard,
          {
            // Those shortcuts can be used in the toolbar for some other actions
            // like zooming, hence we need to check if the container has the
            // focus.
            checker: (self, { target: el }) =>
              !(el instanceof HTMLButtonElement) &&
              self.#container.contains(el) &&
              !self.isEnterHandled,
          },
        ],
        [
          [" ", "mac+ "],
          proto.addNewEditorFromKeyboard,
          {
            // Those shortcuts can be used in the toolbar for some other actions
            // like zooming, hence we need to check if the container has the
            // focus.
            checker: (self, { target: el }) =>
              !(el instanceof HTMLButtonElement) &&
              self.#container.contains(document.activeElement),
          },
        ],
        [["Escape", "mac+Escape"], proto.unselectAll],
        [
          ["ArrowLeft", "mac+ArrowLeft"],
          proto.translateSelectedEditors,
          { args: [-small, 0], checker: arrowChecker },
        ],
        [
          ["ctrl+ArrowLeft", "mac+shift+ArrowLeft"],
          proto.translateSelectedEditors,
          { args: [-big, 0], checker: arrowChecker },
        ],
        [
          ["ArrowRight", "mac+ArrowRight"],
          proto.translateSelectedEditors,
          { args: [small, 0], checker: arrowChecker },
        ],
        [
          ["ctrl+ArrowRight", "mac+shift+ArrowRight"],
          proto.translateSelectedEditors,
          { args: [big, 0], checker: arrowChecker },
        ],
        [
          ["ArrowUp", "mac+ArrowUp"],
          proto.translateSelectedEditors,
          { args: [0, -small], checker: arrowChecker },
        ],
        [
          ["ctrl+ArrowUp", "mac+shift+ArrowUp"],
          proto.translateSelectedEditors,
          { args: [0, -big], checker: arrowChecker },
        ],
        [
          ["ArrowDown", "mac+ArrowDown"],
          proto.translateSelectedEditors,
          { args: [0, small], checker: arrowChecker },
        ],
        [
          ["ctrl+ArrowDown", "mac+shift+ArrowDown"],
          proto.translateSelectedEditors,
          { args: [0, big], checker: arrowChecker },
        ],
      ])
    );
  }

  constructor(
    container,
    viewer,
    viewerAlert,
    altTextManager,
    signatureManager,
    eventBus,
    pdfDocument,
    pageColors,
    highlightColors,
    enableHighlightFloatingButton,
    enableUpdatedAddImage,
    enableNewAltTextWhenAddingImage,
    mlManager,
    editorUndoBar,
    supportsPinchToZoom
  ) {
    const signal = (this._signal = this.#abortController.signal);
    this.#container = container;
    this.#viewer = viewer;
    this.#viewerAlert = viewerAlert;
    this.#altTextManager = altTextManager;
    this.#signatureManager = signatureManager;
    this._eventBus = eventBus;
    eventBus._on("editingaction", this.onEditingAction.bind(this), { signal });
    eventBus._on("pagechanging", this.onPageChanging.bind(this), { signal });
    eventBus._on("scalechanging", this.onScaleChanging.bind(this), { signal });
    eventBus._on("rotationchanging", this.onRotationChanging.bind(this), {
      signal,
    });
    eventBus._on("setpreference", this.onSetPreference.bind(this), { signal });
    eventBus._on(
      "switchannotationeditorparams",
      evt => this.updateParams(evt.type, evt.value),
      { signal }
    );
    this.#addSelectionListener();
    this.#addDragAndDropListeners();
    this.#addKeyboardManager();
    this.#annotationStorage = pdfDocument.annotationStorage;
    this.#filterFactory = pdfDocument.filterFactory;
    this.#pageColors = pageColors;
    this.#highlightColors = highlightColors || null;
    this.#enableHighlightFloatingButton = enableHighlightFloatingButton;
    this.#enableUpdatedAddImage = enableUpdatedAddImage;
    this.#enableNewAltTextWhenAddingImage = enableNewAltTextWhenAddingImage;
    this.#mlManager = mlManager || null;
    this.viewParameters = {
      realScale: PixelsPerInch.PDF_TO_CSS_UNITS,
      rotation: 0,
    };
    this.isShiftKeyDown = false;
    this._editorUndoBar = editorUndoBar || null;
    this._supportsPinchToZoom = supportsPinchToZoom !== false;

    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("TESTING")) {
      Object.defineProperty(this, "reset", {
        value: () => {
          this.selectAll();
          this.delete();
          this.#idManager.reset();
        },
      });
    }
  }

  destroy() {
    this.#updateModeCapability?.resolve();
    this.#updateModeCapability = null;

    this.#abortController?.abort();
    this.#abortController = null;
    this._signal = null;

    for (const layer of this.#allLayers.values()) {
      layer.destroy();
    }
    this.#allLayers.clear();
    this.#allEditors.clear();
    this.#editorsToRescale.clear();
    this.#missingCanvases?.clear();
    this.#activeEditor = null;
    this.#selectedEditors.clear();
    this.#commandManager.destroy();
    this.#altTextManager?.destroy();
    this.#signatureManager?.destroy();
    this.#highlightToolbar?.hide();
    this.#highlightToolbar = null;
    this.#mainHighlightColorPicker?.destroy();
    this.#mainHighlightColorPicker = null;
    if (this.#focusMainContainerTimeoutId) {
      clearTimeout(this.#focusMainContainerTimeoutId);
      this.#focusMainContainerTimeoutId = null;
    }
    if (this.#translationTimeoutId) {
      clearTimeout(this.#translationTimeoutId);
      this.#translationTimeoutId = null;
    }
    this._editorUndoBar?.destroy();
  }

  combinedSignal(ac) {
    return AbortSignal.any([this._signal, ac.signal]);
  }

  get mlManager() {
    return this.#mlManager;
  }

  get useNewAltTextFlow() {
    return this.#enableUpdatedAddImage;
  }

  get useNewAltTextWhenAddingImage() {
    return this.#enableNewAltTextWhenAddingImage;
  }

  get hcmFilter() {
    return shadow(
      this,
      "hcmFilter",
      this.#pageColors
        ? this.#filterFactory.addHCMFilter(
            this.#pageColors.foreground,
            this.#pageColors.background
          )
        : "none"
    );
  }

  get direction() {
    return shadow(
      this,
      "direction",
      getComputedStyle(this.#container).direction
    );
  }

  get highlightColors() {
    return shadow(
      this,
      "highlightColors",
      this.#highlightColors
        ? new Map(
            this.#highlightColors.split(",").map(pair => {
              pair = pair.split("=").map(x => x.trim());
              pair[1] = pair[1].toUpperCase();
              return pair;
            })
          )
        : null
    );
  }

  get highlightColorNames() {
    return shadow(
      this,
      "highlightColorNames",
      this.highlightColors
        ? new Map(Array.from(this.highlightColors, e => e.reverse()))
        : null
    );
  }

  /**
   * Set the current drawing session.
   * @param {AnnotationEditorLayer} layer
   */
  setCurrentDrawingSession(layer) {
    if (layer) {
      this.unselectAll();
      this.disableUserSelect(true);
    } else {
      this.disableUserSelect(false);
    }
    this.#currentDrawingSession = layer;
  }

  setMainHighlightColorPicker(colorPicker) {
    this.#mainHighlightColorPicker = colorPicker;
  }

  editAltText(editor, firstTime = false) {
    this.#altTextManager?.editAltText(this, editor, firstTime);
  }

  getSignature(editor) {
    this.#signatureManager?.getSignature({ uiManager: this, editor });
  }

  get signatureManager() {
    return this.#signatureManager;
  }

  switchToMode(mode, callback) {
    // Switching to a mode can be asynchronous.
    this._eventBus.on("annotationeditormodechanged", callback, {
      once: true,
      signal: this._signal,
    });
    this._eventBus.dispatch("showannotationeditorui", {
      source: this,
      mode,
    });
  }

  setPreference(name, value) {
    this._eventBus.dispatch("setpreference", {
      source: this,
      name,
      value,
    });
  }

  onSetPreference({ name, value }) {
    switch (name) {
      case "enableNewAltTextWhenAddingImage":
        this.#enableNewAltTextWhenAddingImage = value;
        break;
    }
  }

  onPageChanging({ pageNumber }) {
    this.#currentPageIndex = pageNumber - 1;
  }

  focusMainContainer() {
    this.#container.focus();
  }

  findParent(x, y) {
    for (const layer of this.#allLayers.values()) {
      const {
        x: layerX,
        y: layerY,
        width,
        height,
      } = layer.div.getBoundingClientRect();
      if (
        x >= layerX &&
        x <= layerX + width &&
        y >= layerY &&
        y <= layerY + height
      ) {
        return layer;
      }
    }
    return null;
  }

  disableUserSelect(value = false) {
    this.#viewer.classList.toggle("noUserSelect", value);
  }

  addShouldRescale(editor) {
    this.#editorsToRescale.add(editor);
  }

  removeShouldRescale(editor) {
    this.#editorsToRescale.delete(editor);
  }

  onScaleChanging({ scale }) {
    this.commitOrRemove();
    this.viewParameters.realScale = scale * PixelsPerInch.PDF_TO_CSS_UNITS;
    for (const editor of this.#editorsToRescale) {
      editor.onScaleChanging();
    }
    this.#currentDrawingSession?.onScaleChanging();
  }

  onRotationChanging({ pagesRotation }) {
    this.commitOrRemove();
    this.viewParameters.rotation = pagesRotation;
  }

  #getAnchorElementForSelection({ anchorNode }) {
    return anchorNode.nodeType === Node.TEXT_NODE
      ? anchorNode.parentElement
      : anchorNode;
  }

  #getLayerForTextLayer(textLayer) {
    const { currentLayer } = this;
    if (currentLayer.hasTextLayer(textLayer)) {
      return currentLayer;
    }
    for (const layer of this.#allLayers.values()) {
      if (layer.hasTextLayer(textLayer)) {
        return layer;
      }
    }
    return null;
  }

  highlightSelection(methodOfCreation = "") {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }
    const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
    const text = selection.toString();
    const anchorElement = this.#getAnchorElementForSelection(selection);
    const textLayer = anchorElement.closest(".textLayer");
    const boxes = this.getSelectionBoxes(textLayer);
    if (!boxes) {
      return;
    }
    selection.empty();

    const layer = this.#getLayerForTextLayer(textLayer);
    const isNoneMode = this.#mode === AnnotationEditorType.NONE;
    const callback = () => {
      layer?.createAndAddNewEditor({ x: 0, y: 0 }, false, {
        methodOfCreation,
        boxes,
        anchorNode,
        anchorOffset,
        focusNode,
        focusOffset,
        text,
      });
      if (isNoneMode) {
        this.showAllEditors("highlight", true, /* updateButton = */ true);
      }
    };
    if (isNoneMode) {
      this.switchToMode(AnnotationEditorType.HIGHLIGHT, callback);
      return;
    }
    callback();
  }

  #displayHighlightToolbar() {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }
    const anchorElement = this.#getAnchorElementForSelection(selection);
    const textLayer = anchorElement.closest(".textLayer");
    const boxes = this.getSelectionBoxes(textLayer);
    if (!boxes) {
      return;
    }
    this.#highlightToolbar ||= new HighlightToolbar(this);
    this.#highlightToolbar.show(textLayer, boxes, this.direction === "ltr");
  }

  /**
   * Add an editor in the annotation storage.
   * @param {AnnotationEditor} editor
   */
  addToAnnotationStorage(editor) {
    if (
      !editor.isEmpty() &&
      this.#annotationStorage &&
      !this.#annotationStorage.has(editor.id)
    ) {
      this.#annotationStorage.setValue(editor.id, editor);
    }
  }

  a11yAlert(messageId, args = null) {
    const viewerAlert = this.#viewerAlert;
    if (!viewerAlert) {
      return;
    }
    viewerAlert.setAttribute("data-l10n-id", messageId);
    if (args) {
      viewerAlert.setAttribute("data-l10n-args", JSON.stringify(args));
    } else {
      viewerAlert.removeAttribute("data-l10n-args");
    }
  }

  #selectionChange() {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed) {
      if (this.#selectedTextNode) {
        this.#highlightToolbar?.hide();
        this.#selectedTextNode = null;
        this.#dispatchUpdateStates({
          hasSelectedText: false,
        });
      }
      return;
    }
    const { anchorNode } = selection;
    if (anchorNode === this.#selectedTextNode) {
      return;
    }

    const anchorElement = this.#getAnchorElementForSelection(selection);
    const textLayer = anchorElement.closest(".textLayer");
    if (!textLayer) {
      if (this.#selectedTextNode) {
        this.#highlightToolbar?.hide();
        this.#selectedTextNode = null;
        this.#dispatchUpdateStates({
          hasSelectedText: false,
        });
      }
      return;
    }

    this.#highlightToolbar?.hide();
    this.#selectedTextNode = anchorNode;
    this.#dispatchUpdateStates({
      hasSelectedText: true,
    });

    if (
      this.#mode !== AnnotationEditorType.HIGHLIGHT &&
      this.#mode !== AnnotationEditorType.NONE
    ) {
      return;
    }

    if (this.#mode === AnnotationEditorType.HIGHLIGHT) {
      this.showAllEditors("highlight", true, /* updateButton = */ true);
    }

    this.#highlightWhenShiftUp = this.isShiftKeyDown;
    if (!this.isShiftKeyDown) {
      const activeLayer =
        this.#mode === AnnotationEditorType.HIGHLIGHT
          ? this.#getLayerForTextLayer(textLayer)
          : null;
      activeLayer?.toggleDrawing();

      const ac = new AbortController();
      const signal = this.combinedSignal(ac);

      const pointerup = e => {
        if (e.type === "pointerup" && e.button !== 0) {
          // Do nothing on right click.
          return;
        }
        ac.abort();
        activeLayer?.toggleDrawing(true);
        if (e.type === "pointerup") {
          this.#onSelectEnd("main_toolbar");
        }
      };
      window.addEventListener("pointerup", pointerup, { signal });
      window.addEventListener("blur", pointerup, { signal });
    }
  }

  #onSelectEnd(methodOfCreation = "") {
    if (this.#mode === AnnotationEditorType.HIGHLIGHT) {
      this.highlightSelection(methodOfCreation);
    } else if (this.#enableHighlightFloatingButton) {
      this.#displayHighlightToolbar();
    }
  }

  #addSelectionListener() {
    document.addEventListener(
      "selectionchange",
      this.#selectionChange.bind(this),
      { signal: this._signal }
    );
  }

  #addFocusManager() {
    if (this.#focusManagerAC) {
      return;
    }
    this.#focusManagerAC = new AbortController();
    const signal = this.combinedSignal(this.#focusManagerAC);

    window.addEventListener("focus", this.focus.bind(this), { signal });
    window.addEventListener("blur", this.blur.bind(this), { signal });
  }

  #removeFocusManager() {
    this.#focusManagerAC?.abort();
    this.#focusManagerAC = null;
  }

  blur() {
    this.isShiftKeyDown = false;
    if (this.#highlightWhenShiftUp) {
      this.#highlightWhenShiftUp = false;
      this.#onSelectEnd("main_toolbar");
    }
    if (!this.hasSelection) {
      return;
    }
    // When several editors are selected and the window loses focus, we want to
    // keep the last active element in order to be able to focus it again when
    // the window gets the focus back but we don't want to trigger any focus
    // callbacks else only one editor will be selected.
    const { activeElement } = document;
    for (const editor of this.#selectedEditors) {
      if (editor.div.contains(activeElement)) {
        this.#lastActiveElement = [editor, activeElement];
        editor._focusEventsAllowed = false;
        break;
      }
    }
  }

  focus() {
    if (!this.#lastActiveElement) {
      return;
    }
    const [lastEditor, lastActiveElement] = this.#lastActiveElement;
    this.#lastActiveElement = null;
    lastActiveElement.addEventListener(
      "focusin",
      () => {
        lastEditor._focusEventsAllowed = true;
      },
      { once: true, signal: this._signal }
    );
    lastActiveElement.focus();
  }

  #addKeyboardManager() {
    if (this.#keyboardManagerAC) {
      return;
    }
    this.#keyboardManagerAC = new AbortController();
    const signal = this.combinedSignal(this.#keyboardManagerAC);

    // The keyboard events are caught at the container level in order to be able
    // to execute some callbacks even if the current page doesn't have focus.
    window.addEventListener("keydown", this.keydown.bind(this), { signal });
    window.addEventListener("keyup", this.keyup.bind(this), { signal });
  }

  #removeKeyboardManager() {
    this.#keyboardManagerAC?.abort();
    this.#keyboardManagerAC = null;
  }

  #addCopyPasteListeners() {
    if (this.#copyPasteAC) {
      return;
    }
    this.#copyPasteAC = new AbortController();
    const signal = this.combinedSignal(this.#copyPasteAC);

    document.addEventListener("copy", this.copy.bind(this), { signal });
    document.addEventListener("cut", this.cut.bind(this), { signal });
    document.addEventListener("paste", this.paste.bind(this), { signal });
  }

  #removeCopyPasteListeners() {
    this.#copyPasteAC?.abort();
    this.#copyPasteAC = null;
  }

  #addDragAndDropListeners() {
    const signal = this._signal;
    document.addEventListener("dragover", this.dragOver.bind(this), { signal });
    document.addEventListener("drop", this.drop.bind(this), { signal });
  }

  addEditListeners() {
    this.#addKeyboardManager();
    this.#addCopyPasteListeners();
  }

  removeEditListeners() {
    this.#removeKeyboardManager();
    this.#removeCopyPasteListeners();
  }

  dragOver(event) {
    for (const { type } of event.dataTransfer.items) {
      for (const editorType of this.#editorTypes) {
        if (editorType.isHandlingMimeForPasting(type)) {
          event.dataTransfer.dropEffect = "copy";
          event.preventDefault();
          return;
        }
      }
    }
  }

  /**
   * Drop callback.
   * @param {DragEvent} event
   */
  drop(event) {
    for (const item of event.dataTransfer.items) {
      for (const editorType of this.#editorTypes) {
        if (editorType.isHandlingMimeForPasting(item.type)) {
          editorType.paste(item, this.currentLayer);
          event.preventDefault();
          return;
        }
      }
    }
  }

  /**
   * Copy callback.
   * @param {ClipboardEvent} event
   */
  copy(event) {
    event.preventDefault();

    // An editor is being edited so just commit it.
    this.#activeEditor?.commitOrRemove();

    if (!this.hasSelection) {
      return;
    }

    const editors = [];
    for (const editor of this.#selectedEditors) {
      const serialized = editor.serialize(/* isForCopying = */ true);
      if (serialized) {
        editors.push(serialized);
      }
    }
    if (editors.length === 0) {
      return;
    }

    event.clipboardData.setData("application/pdfjs", JSON.stringify(editors));
  }

  /**
   * Cut callback.
   * @param {ClipboardEvent} event
   */
  cut(event) {
    this.copy(event);
    this.delete();
  }

  /**
   * Paste callback.
   * @param {ClipboardEvent} event
   */
  async paste(event) {
    event.preventDefault();
    const { clipboardData } = event;
    for (const item of clipboardData.items) {
      for (const editorType of this.#editorTypes) {
        if (editorType.isHandlingMimeForPasting(item.type)) {
          editorType.paste(item, this.currentLayer);
          return;
        }
      }
    }

    let data = clipboardData.getData("application/pdfjs");
    if (!data) {
      return;
    }

    try {
      data = JSON.parse(data);
    } catch (ex) {
      warn(`paste: "${ex.message}".`);
      return;
    }

    if (!Array.isArray(data)) {
      return;
    }

    this.unselectAll();
    const layer = this.currentLayer;

    try {
      const newEditors = [];
      for (const editor of data) {
        const deserializedEditor = await layer.deserialize(editor);
        if (!deserializedEditor) {
          return;
        }
        newEditors.push(deserializedEditor);
      }

      const cmd = () => {
        for (const editor of newEditors) {
          this.#addEditorToLayer(editor);
        }
        this.#selectEditors(newEditors);
      };
      const undo = () => {
        for (const editor of newEditors) {
          editor.remove();
        }
      };
      this.addCommands({ cmd, undo, mustExec: true });
    } catch (ex) {
      warn(`paste: "${ex.message}".`);
    }
  }

  /**
   * Keydown callback.
   * @param {KeyboardEvent} event
   */
  keydown(event) {
    if (!this.isShiftKeyDown && event.key === "Shift") {
      this.isShiftKeyDown = true;
    }
    if (
      this.#mode !== AnnotationEditorType.NONE &&
      !this.isEditorHandlingKeyboard
    ) {
      AnnotationEditorUIManager._keyboardManager.exec(this, event);
    }
  }

  /**
   * Keyup callback.
   * @param {KeyboardEvent} event
   */
  keyup(event) {
    if (this.isShiftKeyDown && event.key === "Shift") {
      this.isShiftKeyDown = false;
      if (this.#highlightWhenShiftUp) {
        this.#highlightWhenShiftUp = false;
        this.#onSelectEnd("main_toolbar");
      }
    }
  }

  /**
   * Execute an action for a given name.
   * For example, the user can click on the "Undo" entry in the context menu
   * and it'll trigger the undo action.
   */
  onEditingAction({ name }) {
    switch (name) {
      case "undo":
      case "redo":
      case "delete":
      case "selectAll":
        this[name]();
        break;
      case "highlightSelection":
        this.highlightSelection("context_menu");
        break;
    }
  }

  /**
   * Update the different possible states of this manager, e.g. is there
   * something to undo, redo, ...
   * @param {Object} details
   */
  #dispatchUpdateStates(details) {
    const hasChanged = Object.entries(details).some(
      ([key, value]) => this.#previousStates[key] !== value
    );

    if (hasChanged) {
      this._eventBus.dispatch("annotationeditorstateschanged", {
        source: this,
        details: Object.assign(this.#previousStates, details),
      });
      // We could listen on our own event but it sounds like a bit weird and
      // it's a way to simpler to handle that stuff here instead of having to
      // add something in every place where an editor can be unselected.
      if (
        this.#mode === AnnotationEditorType.HIGHLIGHT &&
        details.hasSelectedEditor === false
      ) {
        this.#dispatchUpdateUI([
          [AnnotationEditorParamsType.HIGHLIGHT_FREE, true],
        ]);
      }
    }
  }

  #dispatchUpdateUI(details) {
    this._eventBus.dispatch("annotationeditorparamschanged", {
      source: this,
      details,
    });
  }

  /**
   * Set the editing state.
   * It can be useful to temporarily disable it when the user is editing a
   * FreeText annotation.
   * @param {boolean} isEditing
   */
  setEditingState(isEditing) {
    if (isEditing) {
      this.#addFocusManager();
      this.#addCopyPasteListeners();
      this.#dispatchUpdateStates({
        isEditing: this.#mode !== AnnotationEditorType.NONE,
        isEmpty: this.#isEmpty(),
        hasSomethingToUndo: this.#commandManager.hasSomethingToUndo(),
        hasSomethingToRedo: this.#commandManager.hasSomethingToRedo(),
        hasSelectedEditor: false,
      });
    } else {
      this.#removeFocusManager();
      this.#removeCopyPasteListeners();
      this.#dispatchUpdateStates({
        isEditing: false,
      });
      this.disableUserSelect(false);
    }
  }

  registerEditorTypes(types) {
    if (this.#editorTypes) {
      return;
    }
    this.#editorTypes = types;
    for (const editorType of this.#editorTypes) {
      this.#dispatchUpdateUI(editorType.defaultPropertiesToUpdate);
    }
  }

  /**
   * Get an id.
   * @returns {string}
   */
  getId() {
    return this.#idManager.id;
  }

  get currentLayer() {
    return this.#allLayers.get(this.#currentPageIndex);
  }

  getLayer(pageIndex) {
    return this.#allLayers.get(pageIndex);
  }

  get currentPageIndex() {
    return this.#currentPageIndex;
  }

  /**
   * Add a new layer for a page which will contains the editors.
   * @param {AnnotationEditorLayer} layer
   */
  addLayer(layer) {
    this.#allLayers.set(layer.pageIndex, layer);
    if (this.#isEnabled) {
      layer.enable();
    } else {
      layer.disable();
    }
  }

  /**
   * Remove a layer.
   * @param {AnnotationEditorLayer} layer
   */
  removeLayer(layer) {
    this.#allLayers.delete(layer.pageIndex);
  }

  /**
   * Change the editor mode (None, FreeText, Ink, ...)
   * @param {number} mode
   * @param {string|null} editId
   * @param {boolean} [isFromKeyboard] - true if the mode change is due to a
   *   keyboard action.
   * @param {boolean} [mustEnterInEditMode] - true if the editor must enter in
   *   edit mode.
   */
  async updateMode(
    mode,
    editId = null,
    isFromKeyboard = false,
    mustEnterInEditMode = false
  ) {
    if (this.#mode === mode) {
      return;
    }

    if (this.#updateModeCapability) {
      await this.#updateModeCapability.promise;
      if (!this.#updateModeCapability) {
        // This ui manager has been destroyed.
        return;
      }
    }

    this.#updateModeCapability = Promise.withResolvers();
    this.#currentDrawingSession?.commitOrRemove();

    this.#mode = mode;
    if (mode === AnnotationEditorType.NONE) {
      this.setEditingState(false);
      this.#disableAll();

      this._editorUndoBar?.hide();

      this.#updateModeCapability.resolve();
      return;
    }
    if (mode === AnnotationEditorType.SIGNATURE) {
      await this.#signatureManager?.loadSignatures();
    }
    this.setEditingState(true);
    await this.#enableAll();
    this.unselectAll();
    for (const layer of this.#allLayers.values()) {
      layer.updateMode(mode);
    }
    if (!editId) {
      if (isFromKeyboard) {
        this.addNewEditorFromKeyboard();
      }

      this.#updateModeCapability.resolve();
      return;
    }

    for (const editor of this.#allEditors.values()) {
      if (editor.annotationElementId === editId || editor.id === editId) {
        this.setSelected(editor);
        if (mustEnterInEditMode) {
          editor.enterInEditMode();
        }
      } else {
        editor.unselect();
      }
    }

    this.#updateModeCapability.resolve();
  }

  addNewEditorFromKeyboard() {
    if (this.currentLayer.canCreateNewEmptyEditor()) {
      this.currentLayer.addNewEditor();
    }
  }

  /**
   * Update the toolbar if it's required to reflect the tool currently used.
   * @param {Object} options
   * @param {number} mode
   * @returns {undefined}
   */
  updateToolbar(options) {
    if (options.mode === this.#mode) {
      return;
    }
    this._eventBus.dispatch("switchannotationeditormode", {
      source: this,
      ...options,
    });
  }

  /**
   * Update a parameter in the current editor or globally.
   * @param {number} type
   * @param {*} value
   */
  updateParams(type, value) {
    if (!this.#editorTypes) {
      return;
    }

    switch (type) {
      case AnnotationEditorParamsType.CREATE:
        this.currentLayer.addNewEditor(value);
        return;
      case AnnotationEditorParamsType.HIGHLIGHT_DEFAULT_COLOR:
        this.#mainHighlightColorPicker?.updateColor(value);
        break;
      case AnnotationEditorParamsType.HIGHLIGHT_SHOW_ALL:
        this._eventBus.dispatch("reporttelemetry", {
          source: this,
          details: {
            type: "editing",
            data: {
              type: "highlight",
              action: "toggle_visibility",
            },
          },
        });
        (this.#showAllStates ||= new Map()).set(type, value);
        this.showAllEditors("highlight", value);
        break;
    }

    if (this.hasSelection) {
      for (const editor of this.#selectedEditors) {
        editor.updateParams(type, value);
      }
    } else {
      for (const editorType of this.#editorTypes) {
        editorType.updateDefaultParams(type, value);
      }
    }
  }

  showAllEditors(type, visible, updateButton = false) {
    for (const editor of this.#allEditors.values()) {
      if (editor.editorType === type) {
        editor.show(visible);
      }
    }
    const state =
      this.#showAllStates?.get(AnnotationEditorParamsType.HIGHLIGHT_SHOW_ALL) ??
      true;
    if (state !== visible) {
      this.#dispatchUpdateUI([
        [AnnotationEditorParamsType.HIGHLIGHT_SHOW_ALL, visible],
      ]);
    }
  }

  enableWaiting(mustWait = false) {
    if (this.#isWaiting === mustWait) {
      return;
    }
    this.#isWaiting = mustWait;
    for (const layer of this.#allLayers.values()) {
      if (mustWait) {
        layer.disableClick();
      } else {
        layer.enableClick();
      }
      layer.div.classList.toggle("waiting", mustWait);
    }
  }

  /**
   * Enable all the layers.
   */
  async #enableAll() {
    if (!this.#isEnabled) {
      this.#isEnabled = true;
      const promises = [];
      for (const layer of this.#allLayers.values()) {
        promises.push(layer.enable());
      }
      await Promise.all(promises);
      for (const editor of this.#allEditors.values()) {
        editor.enable();
      }
    }
  }

  /**
   * Disable all the layers.
   */
  #disableAll() {
    this.unselectAll();
    if (this.#isEnabled) {
      this.#isEnabled = false;
      for (const layer of this.#allLayers.values()) {
        layer.disable();
      }
      for (const editor of this.#allEditors.values()) {
        editor.disable();
      }
    }
  }

  /**
   * Get all the editors belonging to a given page.
   * @param {number} pageIndex
   * @returns {Array<AnnotationEditor>}
   */
  getEditors(pageIndex) {
    const editors = [];
    for (const editor of this.#allEditors.values()) {
      if (editor.pageIndex === pageIndex) {
        editors.push(editor);
      }
    }
    return editors;
  }

  /**
   * Get an editor with the given id.
   * @param {string} id
   * @returns {AnnotationEditor}
   */
  getEditor(id) {
    return this.#allEditors.get(id);
  }

  /**
   * Add a new editor.
   * @param {AnnotationEditor} editor
   */
  addEditor(editor) {
    this.#allEditors.set(editor.id, editor);
  }

  /**
   * Remove an editor.
   * @param {AnnotationEditor} editor
   */
  removeEditor(editor) {
    if (editor.div.contains(document.activeElement)) {
      if (this.#focusMainContainerTimeoutId) {
        clearTimeout(this.#focusMainContainerTimeoutId);
      }
      this.#focusMainContainerTimeoutId = setTimeout(() => {
        // When the div is removed from DOM the focus can move on the
        // document.body, so we need to move it back to the main container.
        this.focusMainContainer();
        this.#focusMainContainerTimeoutId = null;
      }, 0);
    }
    this.#allEditors.delete(editor.id);
    if (editor.annotationElementId) {
      this.#missingCanvases?.delete(editor.annotationElementId);
    }
    this.unselect(editor);
    if (
      !editor.annotationElementId ||
      !this.#deletedAnnotationsElementIds.has(editor.annotationElementId)
    ) {
      this.#annotationStorage?.remove(editor.id);
    }
  }

  /**
   * The annotation element with the given id has been deleted.
   * @param {AnnotationEditor} editor
   */
  addDeletedAnnotationElement(editor) {
    this.#deletedAnnotationsElementIds.add(editor.annotationElementId);
    this.addChangedExistingAnnotation(editor);
    editor.deleted = true;
  }

  /**
   * Check if the annotation element with the given id has been deleted.
   * @param {string} annotationElementId
   * @returns {boolean}
   */
  isDeletedAnnotationElement(annotationElementId) {
    return this.#deletedAnnotationsElementIds.has(annotationElementId);
  }

  /**
   * The annotation element with the given id have been restored.
   * @param {AnnotationEditor} editor
   */
  removeDeletedAnnotationElement(editor) {
    this.#deletedAnnotationsElementIds.delete(editor.annotationElementId);
    this.removeChangedExistingAnnotation(editor);
    editor.deleted = false;
  }

  /**
   * Add an editor to the layer it belongs to or add it to the global map.
   * @param {AnnotationEditor} editor
   */
  #addEditorToLayer(editor) {
    const layer = this.#allLayers.get(editor.pageIndex);
    if (layer) {
      layer.addOrRebuild(editor);
    } else {
      this.addEditor(editor);
      this.addToAnnotationStorage(editor);
    }
  }

  /**
   * Set the given editor as the active one.
   * @param {AnnotationEditor} editor
   */
  setActiveEditor(editor) {
    if (this.#activeEditor === editor) {
      return;
    }

    this.#activeEditor = editor;
    if (editor) {
      this.#dispatchUpdateUI(editor.propertiesToUpdate);
    }
  }

  get #lastSelectedEditor() {
    let ed = null;
    for (ed of this.#selectedEditors) {
      // Iterate to get the last element.
    }
    return ed;
  }

  /**
   * Update the UI of the active editor.
   * @param {AnnotationEditor} editor
   */
  updateUI(editor) {
    if (this.#lastSelectedEditor === editor) {
      this.#dispatchUpdateUI(editor.propertiesToUpdate);
    }
  }

  updateUIForDefaultProperties(editorType) {
    this.#dispatchUpdateUI(editorType.defaultPropertiesToUpdate);
  }

  /**
   * Add or remove an editor the current selection.
   * @param {AnnotationEditor} editor
   */
  toggleSelected(editor) {
    if (this.#selectedEditors.has(editor)) {
      this.#selectedEditors.delete(editor);
      editor.unselect();
      this.#dispatchUpdateStates({
        hasSelectedEditor: this.hasSelection,
      });
      return;
    }
    this.#selectedEditors.add(editor);
    editor.select();
    this.#dispatchUpdateUI(editor.propertiesToUpdate);
    this.#dispatchUpdateStates({
      hasSelectedEditor: true,
    });
  }

  /**
   * Set the last selected editor.
   * @param {AnnotationEditor} editor
   */
  setSelected(editor) {
    this.updateToolbar({
      mode: editor.mode,
      editId: editor.id,
    });

    this.#currentDrawingSession?.commitOrRemove();
    for (const ed of this.#selectedEditors) {
      if (ed !== editor) {
        ed.unselect();
      }
    }
    this.#selectedEditors.clear();

    this.#selectedEditors.add(editor);
    editor.select();
    this.#dispatchUpdateUI(editor.propertiesToUpdate);
    this.#dispatchUpdateStates({
      hasSelectedEditor: true,
    });
  }

  /**
   * Check if the editor is selected.
   * @param {AnnotationEditor} editor
   */
  isSelected(editor) {
    return this.#selectedEditors.has(editor);
  }

  get firstSelectedEditor() {
    return this.#selectedEditors.values().next().value;
  }

  /**
   * Unselect an editor.
   * @param {AnnotationEditor} editor
   */
  unselect(editor) {
    editor.unselect();
    this.#selectedEditors.delete(editor);
    this.#dispatchUpdateStates({
      hasSelectedEditor: this.hasSelection,
    });
  }

  get hasSelection() {
    return this.#selectedEditors.size !== 0;
  }

  get isEnterHandled() {
    return (
      this.#selectedEditors.size === 1 &&
      this.firstSelectedEditor.isEnterHandled
    );
  }

  /**
   * Undo the last command.
   */
  undo() {
    this.#commandManager.undo();
    this.#dispatchUpdateStates({
      hasSomethingToUndo: this.#commandManager.hasSomethingToUndo(),
      hasSomethingToRedo: true,
      isEmpty: this.#isEmpty(),
    });
    this._editorUndoBar?.hide();
  }

  /**
   * Redo the last undoed command.
   */
  redo() {
    this.#commandManager.redo();
    this.#dispatchUpdateStates({
      hasSomethingToUndo: true,
      hasSomethingToRedo: this.#commandManager.hasSomethingToRedo(),
      isEmpty: this.#isEmpty(),
    });
  }

  /**
   * Add a command to execute (cmd) and another one to undo it.
   * @param {Object} params
   */
  addCommands(params) {
    this.#commandManager.add(params);
    this.#dispatchUpdateStates({
      hasSomethingToUndo: true,
      hasSomethingToRedo: false,
      isEmpty: this.#isEmpty(),
    });
  }

  cleanUndoStack(type) {
    this.#commandManager.cleanType(type);
  }

  #isEmpty() {
    if (this.#allEditors.size === 0) {
      return true;
    }

    if (this.#allEditors.size === 1) {
      for (const editor of this.#allEditors.values()) {
        return editor.isEmpty();
      }
    }

    return false;
  }

  /**
   * Delete the current editor or all.
   */
  delete() {
    this.commitOrRemove();
    const drawingEditor = this.currentLayer?.endDrawingSession(
      /* isAborted = */ true
    );
    if (!this.hasSelection && !drawingEditor) {
      return;
    }

    const editors = drawingEditor
      ? [drawingEditor]
      : [...this.#selectedEditors];
    const cmd = () => {
      this._editorUndoBar?.show(
        undo,
        editors.length === 1 ? editors[0].editorType : editors.length
      );
      for (const editor of editors) {
        editor.remove();
      }
    };
    const undo = () => {
      for (const editor of editors) {
        this.#addEditorToLayer(editor);
      }
    };

    this.addCommands({ cmd, undo, mustExec: true });
  }

  commitOrRemove() {
    // An editor is being edited so just commit it.
    this.#activeEditor?.commitOrRemove();
  }

  hasSomethingToControl() {
    return this.#activeEditor || this.hasSelection;
  }

  /**
   * Select the editors.
   * @param {Array<AnnotationEditor>} editors
   */
  #selectEditors(editors) {
    for (const editor of this.#selectedEditors) {
      editor.unselect();
    }
    this.#selectedEditors.clear();
    for (const editor of editors) {
      if (editor.isEmpty()) {
        continue;
      }
      this.#selectedEditors.add(editor);
      editor.select();
    }
    this.#dispatchUpdateStates({ hasSelectedEditor: this.hasSelection });
  }

  /**
   * Select all the editors.
   */
  selectAll() {
    for (const editor of this.#selectedEditors) {
      editor.commit();
    }
    this.#selectEditors(this.#allEditors.values());
  }

  /**
   * Unselect all the selected editors.
   */
  unselectAll() {
    if (this.#activeEditor) {
      // An editor is being edited so just commit it.
      this.#activeEditor.commitOrRemove();
      if (this.#mode !== AnnotationEditorType.NONE) {
        // If the mode is NONE, we want to really unselect the editor, hence we
        // mustn't return here.
        return;
      }
    }

    if (this.#currentDrawingSession?.commitOrRemove()) {
      return;
    }

    if (!this.hasSelection) {
      return;
    }
    for (const editor of this.#selectedEditors) {
      editor.unselect();
    }
    this.#selectedEditors.clear();
    this.#dispatchUpdateStates({
      hasSelectedEditor: false,
    });
  }

  translateSelectedEditors(x, y, noCommit = false) {
    if (!noCommit) {
      this.commitOrRemove();
    }
    if (!this.hasSelection) {
      return;
    }

    this.#translation[0] += x;
    this.#translation[1] += y;
    const [totalX, totalY] = this.#translation;
    const editors = [...this.#selectedEditors];

    // We don't want to have an undo/redo for each translation so we wait a bit
    // before adding the command to the command manager.
    const TIME_TO_WAIT = 1000;

    if (this.#translationTimeoutId) {
      clearTimeout(this.#translationTimeoutId);
    }

    this.#translationTimeoutId = setTimeout(() => {
      this.#translationTimeoutId = null;
      this.#translation[0] = this.#translation[1] = 0;

      this.addCommands({
        cmd: () => {
          for (const editor of editors) {
            if (this.#allEditors.has(editor.id)) {
              editor.translateInPage(totalX, totalY);
              editor.translationDone();
            }
          }
        },
        undo: () => {
          for (const editor of editors) {
            if (this.#allEditors.has(editor.id)) {
              editor.translateInPage(-totalX, -totalY);
              editor.translationDone();
            }
          }
        },
        mustExec: false,
      });
    }, TIME_TO_WAIT);

    for (const editor of editors) {
      editor.translateInPage(x, y);
      editor.translationDone();
    }
  }

  /**
   * Set up the drag session for moving the selected editors.
   */
  setUpDragSession() {
    // Note: don't use any references to the editor's parent which can be null
    // if the editor belongs to a destroyed page.
    if (!this.hasSelection) {
      return;
    }
    // Avoid to have spurious text selection in the text layer when dragging.
    this.disableUserSelect(true);
    this.#draggingEditors = new Map();
    for (const editor of this.#selectedEditors) {
      this.#draggingEditors.set(editor, {
        savedX: editor.x,
        savedY: editor.y,
        savedPageIndex: editor.pageIndex,
        newX: 0,
        newY: 0,
        newPageIndex: -1,
      });
    }
  }

  /**
   * Ends the drag session.
   * @returns {boolean} true if at least one editor has been moved.
   */
  endDragSession() {
    if (!this.#draggingEditors) {
      return false;
    }
    this.disableUserSelect(false);
    const map = this.#draggingEditors;
    this.#draggingEditors = null;
    let mustBeAddedInUndoStack = false;

    for (const [{ x, y, pageIndex }, value] of map) {
      value.newX = x;
      value.newY = y;
      value.newPageIndex = pageIndex;
      mustBeAddedInUndoStack ||=
        x !== value.savedX ||
        y !== value.savedY ||
        pageIndex !== value.savedPageIndex;
    }

    if (!mustBeAddedInUndoStack) {
      return false;
    }

    const move = (editor, x, y, pageIndex) => {
      if (this.#allEditors.has(editor.id)) {
        // The editor can be undone/redone on a page which is not visible (and
        // which potentially has no annotation editor layer), hence we need to
        // use the pageIndex instead of the parent.
        const parent = this.#allLayers.get(pageIndex);
        if (parent) {
          editor._setParentAndPosition(parent, x, y);
        } else {
          editor.pageIndex = pageIndex;
          editor.x = x;
          editor.y = y;
        }
      }
    };

    this.addCommands({
      cmd: () => {
        for (const [editor, { newX, newY, newPageIndex }] of map) {
          move(editor, newX, newY, newPageIndex);
        }
      },
      undo: () => {
        for (const [editor, { savedX, savedY, savedPageIndex }] of map) {
          move(editor, savedX, savedY, savedPageIndex);
        }
      },
      mustExec: true,
    });

    return true;
  }

  /**
   * Drag the set of selected editors.
   * @param {number} tx
   * @param {number} ty
   */
  dragSelectedEditors(tx, ty) {
    if (!this.#draggingEditors) {
      return;
    }
    for (const editor of this.#draggingEditors.keys()) {
      editor.drag(tx, ty);
    }
  }

  /**
   * Rebuild the editor (usually on undo/redo actions) on a potentially
   * non-rendered page.
   * @param {AnnotationEditor} editor
   */
  rebuild(editor) {
    if (editor.parent === null) {
      const parent = this.getLayer(editor.pageIndex);
      if (parent) {
        parent.changeParent(editor);
        parent.addOrRebuild(editor);
      } else {
        this.addEditor(editor);
        this.addToAnnotationStorage(editor);
        editor.rebuild();
      }
    } else {
      editor.parent.addOrRebuild(editor);
    }
  }

  get isEditorHandlingKeyboard() {
    return (
      this.getActive()?.shouldGetKeyboardEvents() ||
      (this.#selectedEditors.size === 1 &&
        this.firstSelectedEditor.shouldGetKeyboardEvents())
    );
  }

  /**
   * Is the current editor the one passed as argument?
   * @param {AnnotationEditor} editor
   * @returns
   */
  isActive(editor) {
    return this.#activeEditor === editor;
  }

  /**
   * Get the current active editor.
   * @returns {AnnotationEditor|null}
   */
  getActive() {
    return this.#activeEditor;
  }

  /**
   * Get the current editor mode.
   * @returns {number}
   */
  getMode() {
    return this.#mode;
  }

  get imageManager() {
    return shadow(this, "imageManager", new ImageManager());
  }

  getSelectionBoxes(textLayer) {
    if (!textLayer) {
      return null;
    }
    const selection = document.getSelection();
    for (let i = 0, ii = selection.rangeCount; i < ii; i++) {
      if (
        !textLayer.contains(selection.getRangeAt(i).commonAncestorContainer)
      ) {
        return null;
      }
    }

    const {
      x: layerX,
      y: layerY,
      width: parentWidth,
      height: parentHeight,
    } = textLayer.getBoundingClientRect();

    // We must rotate the boxes because we want to have them in the non-rotated
    // page coordinates.
    let rotator;
    switch (textLayer.getAttribute("data-main-rotation")) {
      case "90":
        rotator = (x, y, w, h) => ({
          x: (y - layerY) / parentHeight,
          y: 1 - (x + w - layerX) / parentWidth,
          width: h / parentHeight,
          height: w / parentWidth,
        });
        break;
      case "180":
        rotator = (x, y, w, h) => ({
          x: 1 - (x + w - layerX) / parentWidth,
          y: 1 - (y + h - layerY) / parentHeight,
          width: w / parentWidth,
          height: h / parentHeight,
        });
        break;
      case "270":
        rotator = (x, y, w, h) => ({
          x: 1 - (y + h - layerY) / parentHeight,
          y: (x - layerX) / parentWidth,
          width: h / parentHeight,
          height: w / parentWidth,
        });
        break;
      default:
        rotator = (x, y, w, h) => ({
          x: (x - layerX) / parentWidth,
          y: (y - layerY) / parentHeight,
          width: w / parentWidth,
          height: h / parentHeight,
        });
        break;
    }

    const boxes = [];
    for (let i = 0, ii = selection.rangeCount; i < ii; i++) {
      const range = selection.getRangeAt(i);
      if (range.collapsed) {
        continue;
      }
      for (const { x, y, width, height } of range.getClientRects()) {
        if (width === 0 || height === 0) {
          continue;
        }
        boxes.push(rotator(x, y, width, height));
      }
    }
    return boxes.length === 0 ? null : boxes;
  }

  addChangedExistingAnnotation({ annotationElementId, id }) {
    (this.#changedExistingAnnotations ||= new Map()).set(
      annotationElementId,
      id
    );
  }

  removeChangedExistingAnnotation({ annotationElementId }) {
    this.#changedExistingAnnotations?.delete(annotationElementId);
  }

  renderAnnotationElement(annotation) {
    const editorId = this.#changedExistingAnnotations?.get(annotation.data.id);
    if (!editorId) {
      return;
    }
    const editor = this.#annotationStorage.getRawValue(editorId);
    if (!editor) {
      return;
    }
    if (this.#mode === AnnotationEditorType.NONE && !editor.hasBeenModified) {
      return;
    }
    editor.renderAnnotationElement(annotation);
  }

  setMissingCanvas(annotationId, annotationElementId, canvas) {
    const editor = this.#missingCanvases?.get(annotationId);
    if (!editor) {
      return;
    }
    editor.setCanvas(annotationElementId, canvas);
    this.#missingCanvases.delete(annotationId);
  }

  addMissingCanvas(annotationId, editor) {
    (this.#missingCanvases ||= new Map()).set(annotationId, editor);
  }
}

export {
  AnnotationEditorUIManager,
  bindEvents,
  ColorManager,
  CommandManager,
  KeyboardManager,
};
