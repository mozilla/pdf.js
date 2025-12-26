import {
  AnnotationEditorParamsType,
  AnnotationEditorType,
} from "../../shared/util.js";
import { noContextMenu, stopEvent } from "../display_utils.js";
import { AnnotationEditor } from "./editor.js";
import { CurrentPointers } from "./tools.js";

class EraserEditor extends AnnotationEditor {
  static #currentCursorAC = null;

  static #currentEraserAC = null;

  #erasableEditors = [];

  static _defaultThickness = 20;

  static _thickness;

  static _type = "eraser";

  static _editorType = AnnotationEditorType.ERASER;

  #cursor = null;

  #isErasing = false;

  constructor(params) {
    super({ ...params, name: "eraserEditor" });
    this.defaultL10nId = "pdfjs-editor-eraser-editor";
    EraserEditor._thickness =
      params.thickness ||
      EraserEditor._thickness ||
      EraserEditor._defaultThickness;
  }

  /** @inheritdoc */
  static initialize(l10n, uiManager) {
    AnnotationEditor.initialize(l10n, uiManager);
  }

  /** @inheritdoc */
  static updateDefaultParams(type, value) {
    switch (type) {
      case AnnotationEditorParamsType.ERASER_THICKNESS:
        EraserEditor._defaultThickness = value;
        EraserEditor._thickness = value;
        break;
    }
  }

  /** @inheritdoc */
  updateParams(type, value) {
    switch (type) {
      case AnnotationEditorParamsType.ERASER_THICKNESS:
        this.updateThickness(value);
        break;
    }
  }

  static get defaultPropertiesToUpdate() {
    return [
      [
        AnnotationEditorParamsType.ERASER_THICKNESS,
        EraserEditor._defaultThickness,
      ],
    ];
  }

  /** @inheritdoc */
  get propertiesToUpdate() {
    return [
      [
        AnnotationEditorParamsType.ERASER_THICKNESS,
        EraserEditor._thickness || EraserEditor._defaultThickness,
      ],
    ];
  }

  /** @inheritdoc */
  render() {
    if (this.div) {
      return this.div;
    }

    const div = super.render();
    this.fixAndSetPosition();
    this.#erasableEditors = this.#getErasableEditors();
    this.enableEditing();
    return div;
  }

  /** Ensures EraserEditor spans the entire AnnotationEditorLayer */
  fixAndSetPosition() {
    this.x = 0;
    this.y = 0;
    this.width = 1;
    this.height = 1;

    const [parentWidth, parentHeight] = this.parentDimensions;
    this.setDims(parentWidth, parentHeight);

    return super.fixAndSetPosition(0);
  }

  /** @inheritdoc */
  enableEditing() {
    super.enableEditing();
    this.div?.classList.toggle("disabled", false);

    if (this.#cursor) {
      this.#cursor.remove();
      this.#cursor = null;
    }

    if (this.div) {
      this.div.style.pointerEvents = "auto";
      this.div.style.zIndex = "1000";

      this.#cursor = document.createElement("div");
      this.#cursor.className = "eraserCursor";
      this.#updateCursor();
      this.#cursor.style.display = "none";
      this.#cursor.style.pointerEvents = "none";
      this.div.append(this.#cursor);

      const ac = (EraserEditor.#currentCursorAC = new AbortController());
      const signal = this.parent.combinedSignal(ac);

      this.div.addEventListener("pointermove", this.#moveCursor.bind(this), {
        signal,
      });
      this.div.addEventListener(
        "pointerenter",
        this.#displayCursor.bind(this),
        { signal }
      );
      this.div.addEventListener("pointerleave", this.#hideCursor.bind(this), {
        signal,
      });
      this.div.addEventListener(
        "pointerdown",
        this.#startEraseSession.bind(this),
        { signal }
      );
    }
  }

  /** @inheritdoc */
  disableEditing() {
    super.disableEditing();
    this.div?.classList.toggle("disabled", true);

    this.#abortEraseSession();
    this.#abortCursor();
  }

  /** @inheritdoc */
  remove() {
    super.remove();

    this.#abortEraseSession();
    this.#abortCursor();
  }

  updateThickness(thickness) {
    const setThickness = th => {
      EraserEditor._thickness = th;
      this.#updateCursor();
    };

    const savedThickness = EraserEditor._thickness;

    this.addCommands({
      cmd: setThickness.bind(this, thickness),
      undo: setThickness.bind(this, savedThickness),
      post: this._uiManager.updateUI.bind(this._uiManager, this),
      mustExec: true,
      type: AnnotationEditorParamsType.ERASER_THICKNESS,
      overwriteIfSameType: true,
      keepUndo: true,
    });
  }

  isEmpty() {
    return true;
  }

  #startEraseSession(event) {
    if (event.button && event.button !== 0) {
      return;
    }

    this.#moveCursor(event);

    const { pointerId, pointerType, target } = event;
    if (CurrentPointers.isInitializedAndDifferentPointerType(pointerType)) {
      return;
    }
    CurrentPointers.setPointer(pointerType, pointerId);

    const ac = (EraserEditor.#currentEraserAC = new AbortController());
    const signal = this.parent.combinedSignal(ac);

    window.addEventListener(
      "pointerup",
      e => {
        if (CurrentPointers.isSamePointerIdOrRemove(e.pointerId)) {
          this.#endErase(e);
        }
      },
      { signal }
    );

    window.addEventListener(
      "pointercancel",
      e => {
        if (CurrentPointers.isSamePointerIdOrRemove(e.pointerId)) {
          this.#endErase(e);
        }
      },
      { signal }
    );

    window.addEventListener(
      "pointerdown",
      e => {
        if (!CurrentPointers.isSamePointerType(pointerType)) {
          return;
        }

        // Multi-pointer of same type (e.g., two fingers) -> stop erasing
        CurrentPointers.initializeAndAddPointerId(e.pointerId);
        if (this.#isErasing) {
          this.#endErase(null);
        }
      },
      { capture: true, passive: false, signal }
    );

    window.addEventListener("contextmenu", noContextMenu, { signal });

    target.addEventListener("pointermove", this.#onPointerMove.bind(this), {
      signal,
    });

    // Prevent touch scroll when the move is used for erasing
    target.addEventListener(
      "touchmove",
      e => {
        if (CurrentPointers.isSameTimeStamp(e.timeStamp)) {
          stopEvent(e);
        }
      },
      { signal }
    );

    this.#isErasing = true;
    this.#erase(event.clientX, event.clientY);
    stopEvent(event);
  }

  #onPointerMove(event) {
    CurrentPointers.clearTimeStamp();

    if (!this.#isErasing) {
      return;
    }

    const { pointerId } = event;

    if (!CurrentPointers.isSamePointerId(pointerId)) {
      return;
    }
    if (CurrentPointers.isUsingMultiplePointers()) {
      // The user is using multiple fingers and the first one is moving.
      this.#endErase(event);
      return;
    }

    this.#erase(event.clientX, event.clientY);

    // We track the timestamp to know if the touchmove event is used to draw.
    CurrentPointers.setTimeStamp(event.timeStamp);

    stopEvent(event);
  }

  #endErase(event) {
    if (event) {
      this.#erase(event.clientX, event.clientY);
    }
    this.#commit();
    this.#abortEraseSession();
  }

  #commit() {
    const cmds = [],
      undos = [];
    for (const editor of this.#erasableEditors) {
      const { cmd, undo } = editor.endErase();
      if (cmd && undo) {
        cmds.push(cmd);
        undos.push(undo);
      }
    }

    this.parent.addCommands({
      cmd: () => cmds.forEach(f => f()),
      undo: () => undos.forEach(f => f()),
      mustExec: false,
      type: AnnotationEditorParamsType.ERASER_STEP,
    });
  }

  #abortEraseSession() {
    if (EraserEditor.#currentEraserAC) {
      EraserEditor.#currentEraserAC.abort();
      EraserEditor.#currentEraserAC = null;
    }
    CurrentPointers.clearPointerIds();
    CurrentPointers.clearTimeStamp();
    this.#isErasing = false;
  }

  #abortCursor() {
    if (EraserEditor.#currentCursorAC) {
      EraserEditor.#currentCursorAC.abort();
      EraserEditor.#currentCursorAC = null;
    }

    if (this.#cursor) {
      this.#cursor.remove();
      this.#cursor = null;
    }

    if (this.div) {
      this.div.style.pointerEvents = "";
      this.div.style.zIndex = "";
    }
  }

  #updateCursor() {
    if (this.#cursor) {
      this.#cursor.style.width = `${EraserEditor._thickness}px`;
      this.#cursor.style.height = `${EraserEditor._thickness}px`;
    }
  }

  #displayCursor(event) {
    this.#updateCursor();
    this.#moveCursor(event);
  }

  #moveCursor(event) {
    if (!this.#cursor) {
      return;
    }

    if (
      CurrentPointers.isInitializedAndDifferentPointerType(event.pointerType)
    ) {
      this.#hideCursor();
      return;
    }

    const rect = this.parent.div.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    this.#cursor.style.left = `${x - EraserEditor._thickness / 2}px`;
    this.#cursor.style.top = `${y - EraserEditor._thickness / 2}px`;

    this.#showCursor();
  }

  #showCursor() {
    this.#cursor.style.display = "block";
  }

  #hideCursor() {
    this.#cursor.style.display = "none";
  }

  #getErasableEditors() {
    const editors =
      Array.from(this._uiManager.getEditors(this.pageIndex)) || [];
    return editors.filter(ed => ed.erasable && ed?.parent?.div && ed?.div);
  }

  #erase(clientX, clientY) {
    const layerRect = this.parent.div.getBoundingClientRect();
    const x = clientX - layerRect.left;
    const y = clientY - layerRect.top;
    const radius = EraserEditor._thickness / 2;

    for (const editor of this.#erasableEditors) {
      if (!editor?.parent?.div || !editor?.div) {
        continue;
      }

      const pdfRect = editor.getRect(0, 0, editor.rotation);
      const [, pageHeight] = editor.pageDimensions;
      const [pageX, pageY] = editor.pageTranslation;
      const [cx, cy, cw, ch] = editor.getRectInCurrentCoords(
        pdfRect,
        pageHeight
      );
      const scale = editor.parentScale;
      const left = (cx - pageX) * scale;
      const top = (cy + pageY) * scale;
      const right = left + cw * scale;
      const bottom = top + ch * scale;
      if (this.#hitBBox(x, y, radius, [left, top, right, bottom])) {
        editor.erase(x, y, radius);
      }
    }
  }

  #hitBBox(x, y, r, rect) {
    const [left, top, right, bottom] = rect;
    const cx = Math.max(left, Math.min(x, right));
    const cy = Math.max(top, Math.min(y, bottom));
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  }
}

export { EraserEditor };
