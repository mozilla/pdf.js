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
import { createActionsMap } from "./common.js";
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
    this.multipleSelection = !!data.multipleSelection;
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

    // Private
    this._document = data.doc;
    this._value = data.value || "";
    this._valueAsString = data.valueAsString;
    this._actions = createActionsMap(data.actions);
    this._fillColor = data.fillColor || ["T"];
    this._strokeColor = data.strokeColor || ["G", 0];
    this._textColor = data.textColor || ["G", 0];

    this._globalEval = data.globalEval;
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

  get value() {
    return this._value;
  }

  set value(value) {
    if (!this.multipleSelection) {
      this._value = value;
    }
  }

  get valueAsString() {
    return this._valueAsString;
  }

  set valueAsString(val) {
    this._valueAsString = val ? val.toString() : "";
  }

  checkThisBox(nWidget, bCheckIt = true) {}

  isBoxChecked(nWidget) {
    return false;
  }

  isDefaultChecked(nWidget) {
    return false;
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
        // Action evaluation must happen in the global scope
        this._globalEval(action);
      }
    } catch (error) {
      event.rc = false;
      throw error;
    }

    return true;
  }
}

class RadioButtonField extends Field {
  constructor(otherButtons, data) {
    super(data);

    this.exportValues = [this.exportValues];
    this._radioIds = [this._id];
    this._radioActions = [this._actions];

    for (const radioData of otherButtons) {
      this.exportValues.push(radioData.exportValues);
      this._radioIds.push(radioData.id);
      this._radioActions.push(createActionsMap(radioData.actions));
      if (this._value === radioData.exportValues) {
        this._id = radioData.id;
      }
    }
  }

  get value() {
    return this._value;
  }

  set value(value) {
    const i = this.exportValues.indexOf(value);
    if (0 <= i && i < this._radioIds.length) {
      this._id = this._radioIds[i];
      this._value = value;
    } else if (value === "Off" && this._radioIds.length === 2) {
      const nextI = (1 + this._radioIds.indexOf(this._id)) % 2;
      this._id = this._radioIds[nextI];
      this._value = this.exportValues[nextI];
    }
  }

  checkThisBox(nWidget, bCheckIt = true) {
    if (nWidget < 0 || nWidget >= this._radioIds.length || !bCheckIt) {
      return;
    }

    this._id = this._radioIds[nWidget];
    this._value = this.exportValues[nWidget];
    this._send({ id: this._id, value: this._value });
  }

  isBoxChecked(nWidget) {
    return (
      nWidget >= 0 &&
      nWidget < this._radioIds.length &&
      this._id === this._radioIds[nWidget]
    );
  }

  isDefaultChecked(nWidget) {
    return (
      nWidget >= 0 &&
      nWidget < this.exportValues.length &&
      this.defaultValue === this.exportValues[nWidget]
    );
  }

  _getExportValue(state) {
    const i = this._radioIds.indexOf(this._id);
    return this.exportValues[i];
  }

  _runActions(event) {
    const i = this._radioIds.indexOf(this._id);
    this._actions = this._radioActions[i];
    return super._runActions(event);
  }

  _isButton() {
    return true;
  }
}

class CheckboxField extends RadioButtonField {
  get value() {
    return this._value;
  }

  set value(value) {
    if (value === "Off") {
      this._value = "Off";
    } else {
      super.value = value;
    }
  }

  _getExportValue(state) {
    return state ? super._getExportValue(state) : "Off";
  }

  isBoxChecked(nWidget) {
    if (this._value === "Off") {
      return false;
    }
    return super.isBoxChecked(nWidget);
  }

  isDefaultChecked(nWidget) {
    if (this.defaultValue === "Off") {
      return this._value === "Off";
    }
    return super.isDefaultChecked(nWidget);
  }

  checkThisBox(nWidget, bCheckIt = true) {
    if (nWidget < 0 || nWidget >= this._radioIds.length) {
      return;
    }
    this._id = this._radioIds[nWidget];
    this._value = bCheckIt ? this.exportValues[nWidget] : "Off";
    this._send({ id: this._id, value: this._value });
  }
}

export { CheckboxField, Field, RadioButtonField };
