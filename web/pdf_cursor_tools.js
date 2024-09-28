/* Copyright 2017 Mozilla Foundation
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

/** @typedef {import("./event_utils.js").EventBus} EventBus */

import { AnnotationEditorType, shadow } from "pdfjs-lib";
import { CursorTool, PresentationModeState } from "./ui_utils.js";
import { GrabToPan } from "./grab_to_pan.js";

/**
 * @typedef {Object} PDFCursorToolsOptions
 * @property {HTMLDivElement} container - The document container.
 * @property {EventBus} eventBus - The application event bus.
 * @property {number} [cursorToolOnLoad] - The cursor tool that will be enabled
 *   on load; the constants from {CursorTool} should be used. The default value
 *   is `CursorTool.SELECT`.
 */

class PDFCursorTools {
  #active = CursorTool.SELECT;

  #prevActive = null;

  /**
   * @param {PDFCursorToolsOptions} options
   */
  constructor({ container, eventBus, cursorToolOnLoad = CursorTool.SELECT }) {
    this.container = container;
    this.eventBus = eventBus;

    this.#addEventListeners();

    // Defer the initial `switchTool` call, to give other viewer components
    // time to initialize *and* register 'cursortoolchanged' event listeners.
    Promise.resolve().then(() => {
      this.switchTool(cursorToolOnLoad);
    });
  }

  /**
   * @type {number} One of the values in {CursorTool}.
   */
  get activeTool() {
    return this.#active;
  }

  /**
   * @param {number} tool - The cursor mode that should be switched to,
   *                        must be one of the values in {CursorTool}.
   */
  switchTool(tool) {
    if (this.#prevActive !== null) {
      // Cursor tools cannot be used in PresentationMode/AnnotationEditor.
      return;
    }
    this.#switchTool(tool);
  }

  #switchTool(tool, disabled = false) {
    if (tool === this.#active) {
      if (this.#prevActive !== null) {
        // Ensure that the `disabled`-attribute of the buttons will be updated.
        this.eventBus.dispatch("cursortoolchanged", {
          source: this,
          tool,
          disabled,
        });
      }
      return; // The requested tool is already active.
    }

    const disableActiveTool = () => {
      switch (this.#active) {
        case CursorTool.SELECT:
          break;
        case CursorTool.HAND:
          this._handTool.deactivate();
          break;
        case CursorTool.ZOOM:
        /* falls through */
      }
    };

    // Enable the new cursor tool.
    switch (tool) {
      case CursorTool.SELECT:
        disableActiveTool();
        break;
      case CursorTool.HAND:
        disableActiveTool();
        this._handTool.activate();
        break;
      case CursorTool.ZOOM:
      /* falls through */
      default:
        console.error(`switchTool: "${tool}" is an unsupported value.`);
        return;
    }
    // Update the active tool *after* it has been validated above,
    // in order to prevent setting it to an invalid state.
    this.#active = tool;

    this.eventBus.dispatch("cursortoolchanged", {
      source: this,
      tool,
      disabled,
    });
  }

  #addEventListeners() {
    this.eventBus._on("switchcursortool", evt => {
      if (!evt.reset) {
        this.switchTool(evt.tool);
      } else if (this.#prevActive !== null) {
        annotationEditorMode = AnnotationEditorType.NONE;
        presentationModeState = PresentationModeState.NORMAL;

        enableActive();
      }
    });

    let annotationEditorMode = AnnotationEditorType.NONE,
      presentationModeState = PresentationModeState.NORMAL;

    const disableActive = () => {
      this.#prevActive ??= this.#active; // Keep track of the first one.
      this.#switchTool(CursorTool.SELECT, /* disabled = */ true);
    };
    const enableActive = () => {
      if (
        this.#prevActive !== null &&
        annotationEditorMode === AnnotationEditorType.NONE &&
        presentationModeState === PresentationModeState.NORMAL
      ) {
        this.#switchTool(this.#prevActive);
        this.#prevActive = null;
      }
    };

    this.eventBus._on("annotationeditormodechanged", ({ mode }) => {
      annotationEditorMode = mode;

      if (mode === AnnotationEditorType.NONE) {
        enableActive();
      } else {
        disableActive();
      }
    });

    this.eventBus._on("presentationmodechanged", ({ state }) => {
      presentationModeState = state;

      if (state === PresentationModeState.NORMAL) {
        enableActive();
      } else if (state === PresentationModeState.FULLSCREEN) {
        disableActive();
      }
    });
  }

  /**
   * @private
   */
  get _handTool() {
    return shadow(
      this,
      "_handTool",
      new GrabToPan({
        element: this.container,
      })
    );
  }
}

export { PDFCursorTools };
