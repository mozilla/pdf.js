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

import { createActionsMap, FieldType, getFieldType } from "./common.js";
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
    this.doc = data.doc.wrapped;
    this.editable = data.editable;
    this.exportValues = data.exportValues;
    this.fileSelect = data.fileSelect;
    this.hidden = data.hidden;
    this.highlight = data.highlight;
    this.lineWidth = data.lineWidth;
    this.multiline = data.multiline;
    this.multipleSelection = !!data.multipleSelection;
    this.name = data.name;
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
    this._actions = createActionsMap(data.actions);
    this._browseForFileToSubmit = data.browseForFileToSubmit || null;
    this._buttonCaption = null;
    this._buttonIcon = null;
    this._children = null;
    this._currentValueIndices = data.currentValueIndices || 0;
    this._document = data.doc;
    this._fieldPath = data.fieldPath;
    this._fillColor = data.fillColor || ["T"];
    this._isChoice = Array.isArray(data.items);
    this._items = data.items || [];
    this._strokeColor = data.strokeColor || ["G", 0];
    this._textColor = data.textColor || ["G", 0];
    this._value = data.value || "";
    this._valueAsString = data.valueAsString;
    this._kidIds = data.kidIds || null;
    this._fieldType = getFieldType(this._actions);

    this._globalEval = data.globalEval;
    this._appObjects = data.appObjects;
  }

  get currentValueIndices() {
    if (!this._isChoice) {
      return 0;
    }
    return this._currentValueIndices;
  }

  set currentValueIndices(indices) {
    if (!this._isChoice) {
      return;
    }
    if (!Array.isArray(indices)) {
      indices = [indices];
    }
    if (
      !indices.every(
        i =>
          typeof i === "number" &&
          Number.isInteger(i) &&
          i >= 0 &&
          i < this.numItems
      )
    ) {
      return;
    }

    indices.sort();

    if (this.multipleSelection) {
      this._currentValueIndices = indices;
      this._value = [];
      indices.forEach(i => {
        this._value.push(this._items[i].displayValue);
      });
    } else {
      if (indices.length > 0) {
        indices = indices.splice(1, indices.length - 1);
        this._currentValueIndices = indices[0];
        this._value = this._items[this._currentValueIndices];
      }
    }
    this._send({ id: this._id, indices });
  }

  get fillColor() {
    return this._fillColor;
  }

  set fillColor(color) {
    if (Color._isValidColor(color)) {
      this._fillColor = color;
    }
  }

  get bgColor() {
    return this.fillColor;
  }

  set bgColor(color) {
    this.fillColor = color;
  }

  get numItems() {
    if (!this._isChoice) {
      throw new Error("Not a choice widget");
    }
    return this._items.length;
  }

  set numItems(_) {
    throw new Error("field.numItems is read-only");
  }

  get strokeColor() {
    return this._strokeColor;
  }

  set strokeColor(color) {
    if (Color._isValidColor(color)) {
      this._strokeColor = color;
    }
  }

  get borderColor() {
    return this.strokeColor;
  }

  set borderColor(color) {
    this.strokeColor = color;
  }

  get textColor() {
    return this._textColor;
  }

  set textColor(color) {
    if (Color._isValidColor(color)) {
      this._textColor = color;
    }
  }

  get fgColor() {
    return this.textColor;
  }

  set fgColor(color) {
    this.textColor = color;
  }

  get value() {
    return this._value;
  }

  set value(value) {
    if (value === "") {
      this._value = "";
    } else if (typeof value === "string") {
      switch (this._fieldType) {
        case FieldType.number:
        case FieldType.percent:
          value = parseFloat(value);
          if (!isNaN(value)) {
            this._value = value;
          }
          break;
        default:
          this._value = value;
      }
    } else {
      this._value = value;
    }
    if (this._isChoice) {
      if (this.multipleSelection) {
        const values = new Set(value);
        this._currentValueIndices.length = 0;
        this._items.forEach(({ displayValue }, i) => {
          if (values.has(displayValue)) {
            this._currentValueIndices.push(i);
          }
        });
      } else {
        this._currentValueIndices = this._items.findIndex(
          ({ displayValue }) => value === displayValue
        );
      }
    }
  }

  get valueAsString() {
    return this._valueAsString;
  }

  set valueAsString(val) {
    this._valueAsString = val ? val.toString() : "";
  }

  browseForFileToSubmit() {
    if (this._browseForFileToSubmit) {
      // TODO: implement this function on Firefox side
      // we can use nsIFilePicker but open method is async.
      // Maybe it's possible to use a html input (type=file) too.
      this._browseForFileToSubmit();
    }
  }

  buttonGetCaption(nFace = 0) {
    if (this._buttonCaption) {
      return this._buttonCaption[nFace];
    }
    return "";
  }

  buttonGetIcon(nFace = 0) {
    if (this._buttonIcon) {
      return this._buttonIcon[nFace];
    }
    return null;
  }

  buttonImportIcon(cPath = null, nPave = 0) {
    /* Not implemented */
  }

  buttonSetCaption(cCaption, nFace = 0) {
    if (!this._buttonCaption) {
      this._buttonCaption = ["", "", ""];
    }
    this._buttonCaption[nFace] = cCaption;
    // TODO: send to the annotation layer
  }

  buttonSetIcon(oIcon, nFace = 0) {
    if (!this._buttonIcon) {
      this._buttonIcon = [null, null, null];
    }
    this._buttonIcon[nFace] = oIcon;
  }

  checkThisBox(nWidget, bCheckIt = true) {}

  clearItems() {
    if (!this._isChoice) {
      throw new Error("Not a choice widget");
    }
    this._items = [];
    this._send({ id: this._id, clear: null });
  }

  deleteItemAt(nIdx = null) {
    if (!this._isChoice) {
      throw new Error("Not a choice widget");
    }
    if (!this.numItems) {
      return;
    }

    if (nIdx === null) {
      // Current selected item.
      nIdx = Array.isArray(this._currentValueIndices)
        ? this._currentValueIndices[0]
        : this._currentValueIndices;
      nIdx = nIdx || 0;
    }

    if (nIdx < 0 || nIdx >= this.numItems) {
      nIdx = this.numItems - 1;
    }

    this._items.splice(nIdx, 1);
    if (Array.isArray(this._currentValueIndices)) {
      let index = this._currentValueIndices.findIndex(i => i >= nIdx);
      if (index !== -1) {
        if (this._currentValueIndices[index] === nIdx) {
          this._currentValueIndices.splice(index, 1);
        }
        for (const ii = this._currentValueIndices.length; index < ii; index++) {
          --this._currentValueIndices[index];
        }
      }
    } else {
      if (this._currentValueIndices === nIdx) {
        this._currentValueIndices = this.numItems > 0 ? 0 : -1;
      } else if (this._currentValueIndices > nIdx) {
        --this._currentValueIndices;
      }
    }

    this._send({ id: this._id, remove: nIdx });
  }

  getItemAt(nIdx = -1, bExportValue = false) {
    if (!this._isChoice) {
      throw new Error("Not a choice widget");
    }
    if (nIdx < 0 || nIdx >= this.numItems) {
      nIdx = this.numItems - 1;
    }
    const item = this._items[nIdx];
    return bExportValue ? item.exportValue : item.displayValue;
  }

  getArray() {
    if (this._kidIds) {
      return this._kidIds.map(id => this._appObjects[id].wrapped);
    }

    if (this._children === null) {
      this._children = this._document.obj._getChildren(this._fieldPath);
    }
    return this._children;
  }

  getLock() {
    return undefined;
  }

  isBoxChecked(nWidget) {
    return false;
  }

  isDefaultChecked(nWidget) {
    return false;
  }

  insertItemAt(cName, cExport = undefined, nIdx = 0) {
    if (!this._isChoice) {
      throw new Error("Not a choice widget");
    }
    if (!cName) {
      return;
    }

    if (nIdx < 0 || nIdx > this.numItems) {
      nIdx = this.numItems;
    }

    if (this._items.some(({ displayValue }) => displayValue === cName)) {
      return;
    }

    if (cExport === undefined) {
      cExport = cName;
    }
    const data = { displayValue: cName, exportValue: cExport };
    this._items.splice(nIdx, 0, data);
    if (Array.isArray(this._currentValueIndices)) {
      let index = this._currentValueIndices.findIndex(i => i >= nIdx);
      if (index !== -1) {
        for (const ii = this._currentValueIndices.length; index < ii; index++) {
          ++this._currentValueIndices[index];
        }
      }
    } else if (this._currentValueIndices >= nIdx) {
      ++this._currentValueIndices;
    }

    this._send({ id: this._id, insert: { index: nIdx, ...data } });
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

  setItems(oArray) {
    if (!this._isChoice) {
      throw new Error("Not a choice widget");
    }
    this._items.length = 0;
    for (const element of oArray) {
      let displayValue, exportValue;
      if (Array.isArray(element)) {
        displayValue = element[0]?.toString() || "";
        exportValue = element[1]?.toString() || "";
      } else {
        displayValue = exportValue = element?.toString() || "";
      }
      this._items.push({ displayValue, exportValue });
    }
    this._currentValueIndices = 0;

    this._send({ id: this._id, items: this._items });
  }

  setLock() {}

  signatureGetModifications() {}

  signatureGetSeedValue() {}

  signatureInfo() {}

  signatureSetSeedValue() {}

  signatureSign() {}

  signatureValidate() {}

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
    if (value === null) {
      this._value = "";
    }
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
