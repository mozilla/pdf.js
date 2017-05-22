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

import { GrabToPan } from './grab_to_pan';

const CursorTool = {
  SELECT: 0, // The default value.
  HAND: 1,
  ZOOM: 2,
};

/**
 * @typedef {Object} PDFCursorToolsOptions
 * @property {HTMLDivElement} container - The document container.
 * @property {EventBus} eventBus - The application event bus.
 * @property {BasePreferences} preferences - Object for reading/writing
 *                                           persistent settings.
 */

class PDFCursorTools {
  /**
   * @param {PDFCursorToolsOptions} options
   */
  constructor({ container, eventBus, preferences, }) {
    this.container = container;
    this.eventBus = eventBus;

    this.active = CursorTool.SELECT;
    this.activeBeforePresentationMode = null;

    this.handTool = new GrabToPan({
      element: this.container,
    });

    this._addEventListeners();

    Promise.all([
      preferences.get('cursorToolOnLoad'),
      preferences.get('enableHandToolOnLoad')
    ]).then(([cursorToolPref, handToolPref]) => {
      // If the 'cursorToolOnLoad' preference has not been set to a non-default
      // value, attempt to convert the old 'enableHandToolOnLoad' preference.
      // TODO: Remove this conversion after a suitable number of releases.
      if (handToolPref === true) {
        preferences.set('enableHandToolOnLoad', false);

        if (cursorToolPref === CursorTool.SELECT) {
          cursorToolPref = CursorTool.HAND;
          preferences.set('cursorToolOnLoad', cursorToolPref).catch(() => { });
        }
      }
      this.switchTool(cursorToolPref);
    }).catch(() => { });
  }

  /**
   * @returns {number} One of the values in {CursorTool}.
   */
  get activeTool() {
    return this.active;
  }

  /**
   * NOTE: This method is ignored while Presentation Mode is active.
   * @param {number} tool - The cursor mode that should be switched to,
   *                        must be one of the values in {CursorTool}.
   */
  switchTool(tool) {
    if (this.activeBeforePresentationMode !== null) {
      return; // Cursor tools cannot be used in Presentation Mode.
    }
    if (tool === this.active) {
      return; // The requested tool is already active.
    }

    let disableActiveTool = () => {
      switch (this.active) {
        case CursorTool.SELECT:
          break;
        case CursorTool.HAND:
          this.handTool.deactivate();
          break;
        case CursorTool.ZOOM:
          /* falls through */
      }
    };

    switch (tool) { // Enable the new cursor tool.
      case CursorTool.SELECT:
        disableActiveTool();
        break;
      case CursorTool.HAND:
        disableActiveTool();
        this.handTool.activate();
        break;
      case CursorTool.ZOOM:
        /* falls through */
      default:
        console.error(`switchTool: "${tool}" is an unsupported value.`);
        return;
    }
    // Update the active tool *after* it has been validated above,
    // in order to prevent setting it to an invalid state.
    this.active = tool;

    this._dispatchEvent();
  }

  /**
   * @private
   */
  _dispatchEvent() {
    this.eventBus.dispatch('cursortoolchanged', {
      source: this,
      tool: this.active,
    });
  }

  /**
   * @private
   */
  _addEventListeners() {
    this.eventBus.on('switchcursortool', (evt) => {
      this.switchTool(evt.tool);
    });

    this.eventBus.on('presentationmodechanged', (evt) => {
      if (evt.switchInProgress) {
        return;
      }
      let previouslyActive;

      if (evt.active) {
        previouslyActive = this.active;

        this.switchTool(CursorTool.SELECT);
        this.activeBeforePresentationMode = previouslyActive;
      } else {
        previouslyActive = this.activeBeforePresentationMode;

        this.activeBeforePresentationMode = null;
        this.switchTool(previouslyActive);
      }
    });
  }
}

export {
  CursorTool,
  PDFCursorTools,
};
