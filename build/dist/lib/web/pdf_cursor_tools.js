/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFCursorTools = exports.CursorTool = void 0;

var _grab_to_pan = require("./grab_to_pan.js");

const CursorTool = {
  SELECT: 0,
  HAND: 1,
  ZOOM: 2
};
exports.CursorTool = CursorTool;

class PDFCursorTools {
  constructor({
    container,
    eventBus,
    cursorToolOnLoad = CursorTool.SELECT
  }) {
    this.container = container;
    this.eventBus = eventBus;
    this.active = CursorTool.SELECT;
    this.activeBeforePresentationMode = null;
    this.handTool = new _grab_to_pan.GrabToPan({
      element: this.container
    });

    this._addEventListeners();

    Promise.resolve().then(() => {
      this.switchTool(cursorToolOnLoad);
    });
  }

  get activeTool() {
    return this.active;
  }

  switchTool(tool) {
    if (this.activeBeforePresentationMode !== null) {
      return;
    }

    if (tool === this.active) {
      return;
    }

    const disableActiveTool = () => {
      switch (this.active) {
        case CursorTool.SELECT:
          break;

        case CursorTool.HAND:
          this.handTool.deactivate();
          break;

        case CursorTool.ZOOM:
      }
    };

    switch (tool) {
      case CursorTool.SELECT:
        disableActiveTool();
        break;

      case CursorTool.HAND:
        disableActiveTool();
        this.handTool.activate();
        break;

      case CursorTool.ZOOM:
      default:
        console.error(`switchTool: "${tool}" is an unsupported value.`);
        return;
    }

    this.active = tool;

    this._dispatchEvent();
  }

  _dispatchEvent() {
    this.eventBus.dispatch("cursortoolchanged", {
      source: this,
      tool: this.active
    });
  }

  _addEventListeners() {
    this.eventBus._on("switchcursortool", evt => {
      this.switchTool(evt.tool);
    });

    this.eventBus._on("presentationmodechanged", evt => {
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

exports.PDFCursorTools = PDFCursorTools;