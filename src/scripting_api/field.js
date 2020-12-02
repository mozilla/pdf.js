/* Copyright 2020 Mozilla Foundation
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

import { Color } from "./color.js";
import { PDFObject } from "./pdf_object.js";

class Field extends PDFObject {
  constructor(data) {
    super(data);
    this.alignment = data.alignment || "left";
    this.borderStyle = data.borderStyle || "";
    this.buttonAlignX = data.buttonAlignX || 50;
    this.buttonAlignY = data.buttonAlignY || 50;
    this.buttonFitBounds = data.buttonFitBounds;
    this.buttonPosition = data.buttonPosition;
    this.buttonScaleHow = data.buttonScaleHow;
    this.ButtonScaleWhen = data.buttonScaleWhen;
    this.calcOrderIndex = data.calcOrderIndex;
    this.charLimit = data.charLimit;
    this.comb = data.comb;
    this.commitOnSelChange = data.commitOnSelChange;
    this.currentValueIndices = data.currentValueIndices;
    this.defaultStyle = data.defaultStyle;
    this.defaultValue = data.defaultValue;
    this.doNotScroll = data.doNotScroll;
    this.doNotSpellCheck = data.doNotSpellCheck;
    this.delay = data.delay;
    this.display = data.display;
    this.doc = data.doc;
    this.editable = data.editable;
    this.exportValues = data.exportValues;
    this.fileSelect = data.fileSelect;
    this.hidden = data.hidden;
    this.highlight = data.highlight;
    this.lineWidth = data.lineWidth;
    this.multiline = data.multiline;
    this.multipleSelection = data.multipleSelection;
    this.name = data.name;
    this.numItems = data.numItems;
    this.page = data.page;
    this.password = data.password;
    this.print = data.print;
    this.radiosInUnison = data.radiosInUnison;
    this.readonly = data.readonly;
    this.rect = data.rect;
    this.required = data.required;
    this.richText = data.richText;
    this.richValue = data.richValue;
    this.rotation = data.rotation;
    this.style = data.style;
    this.submitName = data.submitName;
    this.textFont = data.textFont;
    this.textSize = data.textSize;
    this.type = data.type;
    this.userName = data.userName;
    this.value = data.value || "";
    this.valueAsString = data.valueAsString;

    // Private
    this._document = data.doc;
    this._actions = this._createActionsMap(data.actions);

    this._fillColor = data.fillColor || ["T"];
    this._strokeColor = data.strokeColor || ["G", 0];
    this._textColor = data.textColor || ["G", 0];
  }

  get fillColor() {
    return this._fillColor;
  }

  set fillColor(color) {
    if (Color._isValidColor(color)) {
      this._fillColor = color;
    }
  }

  get strokeColor() {
    return this._strokeColor;
  }

  set strokeColor(color) {
    if (Color._isValidColor(color)) {
      this._strokeColor = color;
    }
  }

  get textColor() {
    return this._textColor;
  }

  set textColor(color) {
    if (Color._isValidColor(color)) {
      this._textColor = color;
    }
  }

  setAction(cTrigger, cScript) {
    if (typeof cTrigger !== "string" || typeof cScript !== "string") {
      return;
    }
    if (!(cTrigger in this._actions)) {
      this._actions[cTrigger] = [];
    }
    this._actions[cTrigger].push(
      // eslint-disable-next-line no-new-func
      Function("event", `with (this) {${cScript}}`).bind(this._document)
    );
  }

  setFocus() {
    this._send({ id: this._id, focus: true });
  }

  _createActionsMap(actions) {
    const actionsMap = new Map();
    if (actions) {
      const doc = this._document;
      for (const [eventType, actionsForEvent] of Object.entries(actions)) {
        // This stuff is running in a sandbox so it's safe to use Function
        actionsMap.set(
          eventType,
          actionsForEvent.map(action =>
            // eslint-disable-next-line no-new-func
            Function("event", `with (this) {${action}}`).bind(doc)
          )
        );
      }
    }
    return actionsMap;
  }

  _isButton() {
    return false;
  }

  _runActions(event) {
    const eventName = event.name;
    if (!this._actions.has(eventName)) {
      return false;
    }

    const actions = this._actions.get(eventName);
    try {
      for (const action of actions) {
        action(event);
      }
    } catch (error) {
      event.rc = false;
      const value =
        `"${error.toString()}" for event ` +
        `"${eventName}" in object ${this._id}.` +
        `\n${error.stack}`;
      this._send({ command: "error", value });
    }

    return true;
  }
}

export { Field };
