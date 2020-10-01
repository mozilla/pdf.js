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
    this.fillColor = data.fillColor;
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
    this.strokeColor = data.strokeColor;
    this.style = data.style;
    this.submitName = data.submitName;
    this.textColor = data.textColor;
    this.textFont = data.textFont;
    this.textSize = data.textSize;
    this.type = data.type;
    this.userName = data.userName;
    this.value = data.value || "";
    this.valueAsString = data.valueAsString;

    // Private
    this._actions = Object.create(null);
    const doc = (this._document = data.doc);
    for (const [eventType, actions] of Object.entries(data.actions)) {
      // This code is running in a sandbox so it's safe to use Function
      this._actions[eventType] = actions.map(action =>
        // eslint-disable-next-line no-new-func
        Function("event", `with (this) {${action}}`).bind(doc)
      );
    }
  }

  setAction(cTrigger, cScript) {
    if (typeof cTrigger !== "string" || typeof cScript !== "string") {
      return;
    }
    if (!(cTrigger in this._actions)) {
      this._actions[cTrigger] = [];
    }
    this._actions[cTrigger].push(cScript);
  }

  setFocus() {
    this._send({ id: this._id, focus: true });
  }

  _runActions(event) {
    const eventName = event.name;
    if (!(eventName in this._actions)) {
      return false;
    }

    const actions = this._actions[eventName];
    try {
      for (const action of actions) {
        action(event);
      }
    } catch (error) {
      event.rc = false;
      const value =
        `\"${error.toString()}\" for event ` +
        `\"${eventName}\" in object ${this._id}.` +
        `\n${error.stack}`;
      this._send({ command: "error", value });
    }

    return true;
  }
}

export { Field };
