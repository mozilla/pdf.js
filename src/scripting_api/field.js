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

import { addPublicFunctions, makeArr, serializeError } from "./app_utils.js";
import { createMap, FieldType, getFieldType } from "./common.js";
import { isValidColor } from "./color.js";
import { PDFObject } from "./pdf_object.js";

// Shared accessors for the instance properties of non-terminal fields.
let containerDescriptors = null;

// Properties stored in _viewProps and sent to the view by _update.
const VIEW_PROPERTIES = [
  "display",
  "editable",
  "hidden",
  "multipleSelection",
  "print",
  "readonly",
  "required",
  "userName",
];

class Field extends PDFObject {
  constructor(data, otherWidgets = []) {
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
    this.comb = data.comb;
    this.commitOnSelChange = data.commitOnSelChange;
    this.defaultStyle = data.defaultStyle;
    this.defaultValue = data.defaultValue;
    this.doNotScroll = data.doNotScroll;
    this.doNotSpellCheck = data.doNotSpellCheck;
    this.delay = data.delay;
    this.doc = globalThis;
    this.exportValues = data.exportValues;
    this.fileSelect = data.fileSelect;
    this.highlight = data.highlight;
    this.lineWidth = data.lineWidth;
    this.multiline = data.multiline;
    this.name = data.name;
    this.password = data.password;
    this.radiosInUnison = data.radiosInUnison;
    this.rect = data.rect;
    this.richText = data.richText;
    this.richValue = data.richValue;
    this.style = data.style;
    this.submitName = data.submitName;
    this.textFont = data.textFont;
    this.textSize = data.textSize;
    this.type = data.type;

    // Private
    this._actions = createMap(data.actions);
    this._browseForFileToSubmit = data.browseForFileToSubmit || null;
    this._buttonCaption = null;
    this._buttonIcon = null;
    this._charLimit = data.charLimit;
    this._children = null;
    this._currentValueIndices = data.currentValueIndices || 0;
    this._getTerminalChildren = data.getTerminalChildren;
    // Fields without widgets have no send callback.
    this._sendError = data.sendError;
    this._fieldPath = data.fieldPath;
    this._fillColor = data.fillColor || ["T"];
    this._isChoice = Array.isArray(data.items);
    this._items = data.items || [];
    this._hasValue = Object.hasOwn(data, "value");
    this._page = data.page || 0;
    this._strokeColor = data.strokeColor || ["G", 0];
    this._textColor = data.textColor || ["G", 0];
    this._value = null;
    this._kidIds = data.kidIds || null;
    this._fieldType = getFieldType(this._actions);
    this._otherWidgetIds = null;
    this._rotation = data.rotation || 0;
    this._datetimeFormat = data.datetimeFormat || null;
    this._hasDateOrTime = !!data.hasDatetimeHTML;
    this._util = data.util;

    this._globalEval = data.globalEval;
    this._appObjects = data.appObjects;
    // Fields without widgets still report action errors.
    this._send = data.send || (() => {});
    this._viewProps = Object.fromEntries(
      VIEW_PROPERTIES.map(name => [name, data[name]])
    );
    this._viewProps.multipleSelection = !!data.multipleSelection;

    this._isCheckbox = false;
    this._radioIds = null;
    this._radioActions = null;
    this._radioPages = null;

    if (data.type === "radiobutton" || data.type === "checkbox") {
      // Track each button widget's export value, actions and page.
      this._isCheckbox = data.type === "checkbox";
      this.exportValues = [this.exportValues];
      this._radioIds = [this._id];
      this._radioActions = [this._actions];
      this._radioPages = [this._page];
      for (const widget of otherWidgets) {
        this.exportValues.push(widget.exportValues);
        this._radioIds.push(widget.id);
        this._radioActions.push(createMap(widget.actions));
        this._radioPages.push(widget.page || 0);
        if (data.value === widget.exportValues) {
          this._id = widget.id;
        }
      }
      this._value = data.value || "";
    } else {
      if (otherWidgets.length > 0) {
        this._otherWidgetIds = otherWidgets.map(widget => widget.id);
      }
      this._setValue(data.value || "");
    }

    if (this._kidIds) {
      // Forward assignments to these instance properties to descendants.
      const names = Object.keys(this).filter(name => !name.startsWith("_"));
      this._containerProps = Object.fromEntries(
        names.map(name => [name, this[name]])
      );
      containerDescriptors ??= Field._getContainerDescriptors(names);
      Object.defineProperties(this, containerDescriptors);
    }
  }

  static _getContainerDescriptors(names) {
    const descriptors = Object.create(null);
    for (const name of names) {
      const descriptor = {
        get() {
          return this._containerProps[name];
        },
        set(value) {
          this._containerProps[name] = value;
          this._setOnKids(name, value);
        },
        enumerable: true,
        configurable: true,
      };
      addPublicFunctions(descriptor.get, descriptor.set);
      descriptors[name] = descriptor;
    }
    return descriptors;
  }

  static {
    for (const name of VIEW_PROPERTIES) {
      Object.defineProperty(Field.prototype, name, {
        get() {
          return this._viewProps[name];
        },
        set(value) {
          this._viewProps[name] = value;
          this._update(name, value);
        },
        configurable: true,
      });
    }
  }

  get _siblings() {
    return (
      this._radioIds?.filter(id => id !== this._id) ?? this._otherWidgetIds
    );
  }

  _setOnKids(name, value) {
    // Forward built-in property assignments; child setters handle recursion.
    if (this._kidIds) {
      for (const id of this._kidIds) {
        const kid = this._appObjects[id];
        if (kid) {
          kid.obj[name] = value;
        }
      }
    }
  }

  // Update the view of the current widget and of its siblings.
  _sendToView(data) {
    const siblings = this._siblings;
    this._send(
      siblings ? { id: this._id, siblings, ...data } : { id: this._id, ...data }
    );
  }

  _update(name, value, sentValue = value) {
    this._setOnKids(name, value);
    this._sendToView({ [name]: sentValue });
  }

  get currentValueIndices() {
    return !this._isChoice ? 0 : this._currentValueIndices;
  }

  set currentValueIndices(indices) {
    this._setOnKids("currentValueIndices", indices);
    if (!this._isChoice) {
      return;
    }
    if (!Array.isArray(indices)) {
      indices = [indices];
    }
    if (
      !indices.every(i => Number.isInteger(i) && i >= 0 && i < this.numItems)
    ) {
      return;
    }

    indices.sort((a, b) => a - b);

    if (this._viewProps.multipleSelection) {
      this._currentValueIndices = indices;
      this._value = indices.map(i => this._items[i].exportValue);
    } else if (indices.length > 0) {
      indices = [indices[0]];
      this._currentValueIndices = indices[0];
      this._value = this._items[indices[0]].exportValue;
    }
    this._send({ id: this._id, indices });
  }

  get fillColor() {
    return this._fillColor;
  }

  set fillColor(color) {
    if (isValidColor(color)) {
      this._fillColor = color;
      this._update("fillColor", color);
    }
  }

  get bgColor() {
    return this.fillColor;
  }

  set bgColor(color) {
    this.fillColor = color;
  }

  get charLimit() {
    return this._charLimit;
  }

  set charLimit(limit) {
    if (typeof limit !== "number") {
      throw new Error("Invalid argument value");
    }
    this._charLimit = Math.max(0, Math.floor(limit));
    this._update("charLimit", this._charLimit);
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
    if (isValidColor(color)) {
      this._strokeColor = color;
      this._update("strokeColor", color);
    }
  }

  get borderColor() {
    return this.strokeColor;
  }

  set borderColor(color) {
    this.strokeColor = color;
  }

  get page() {
    return this._page;
  }

  set page(_) {
    throw new Error("field.page is read-only");
  }

  get rotation() {
    return this._rotation;
  }

  set rotation(angle) {
    angle = Math.floor(angle);
    if (angle % 90 !== 0) {
      throw new Error("Invalid rotation: must be a multiple of 90");
    }
    angle %= 360;
    if (angle < 0) {
      angle += 360;
    }
    this._rotation = angle;
    this._update("rotation", angle);
  }

  get textColor() {
    return this._textColor;
  }

  set textColor(color) {
    if (isValidColor(color)) {
      this._textColor = color;
      this._update("textColor", color);
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
    if (this._setValue(value)) {
      this._update("value", value, this._originalValue ?? this._value);
    }
  }

  // Return false for unsupported radio-button values.
  _setValue(value) {
    if (this._radioIds) {
      return this._setRadioValue(value);
    }
    if (this._isChoice) {
      this._setChoiceValue(value);
      return true;
    }

    if (this._hasDateOrTime && value) {
      const date = this._util.scand(this._datetimeFormat, value);
      if (date) {
        this._originalValue = date.valueOf();
        value = this._util.printd(this._datetimeFormat, date);
        this._value = !isNaN(value) ? parseFloat(value) : value;
        return true;
      }
    }

    if (
      value === "" ||
      typeof value !== "string" ||
      // Preserve strings for date and time fields instead of parsing numbers.
      this._fieldType >= FieldType.date
    ) {
      this._originalValue = undefined;
      this._value = value;
      return true;
    }

    this._originalValue = value;
    const _value = value.trim().replace(",", ".");
    this._value = !isNaN(_value) ? parseFloat(_value) : value;
    return true;
  }

  get _initialValue() {
    return (this._hasDateOrTime && this._originalValue) || null;
  }

  _getValue() {
    return this._originalValue ?? this.value;
  }

  get _checkedIndex() {
    return this._radioIds.indexOf(this._id);
  }

  _getWidgetIndex(nWidget) {
    if (!this._radioIds) {
      return -1;
    }
    // Accept integer indices and their canonical string forms.
    const index = Number(nWidget);
    return Number.isInteger(index) &&
      index >= 0 &&
      index < this._radioIds.length &&
      `${index}` === `${nWidget}`
      ? index
      : -1;
  }

  _check(index, value) {
    this._id = this._radioIds[index];
    this._value = value;
  }

  _setRadioValue(value) {
    // Non-export values uncheck the checkbox.
    if (
      this._isCheckbox &&
      (!value || value === "Off" || !this.exportValues.includes(value))
    ) {
      this._value = "Off";
      return true;
    }
    if (value === null || value === undefined) {
      this._value = "";
      return true;
    }
    const i = this.exportValues.indexOf(value);
    if (i !== -1) {
      this._check(i, value);
      return true;
    }
    if (value === "Off" && this._radioIds.length === 2) {
      const nextI = (1 + this._checkedIndex) % 2;
      this._check(nextI, this.exportValues[nextI]);
      return true;
    }
    return false;
  }

  _setChoiceValue(value) {
    if (this._viewProps.multipleSelection) {
      if (!Array.isArray(value)) {
        value = [value];
      }
      const values = new Set(value);
      if (Array.isArray(this._currentValueIndices)) {
        this._currentValueIndices.length = 0;
        this._value.length = 0;
      } else {
        this._currentValueIndices = [];
        this._value = [];
      }
      this._items.forEach((item, i) => {
        if (values.has(item.exportValue)) {
          this._currentValueIndices.push(i);
          this._value.push(item.exportValue);
        }
      });
    } else {
      if (Array.isArray(value)) {
        value = value[0];
      }
      const index = this._items.findIndex(
        ({ exportValue }) => value === exportValue
      );
      if (index !== -1) {
        this._currentValueIndices = index;
        this._value = this._items[index].exportValue;
      }
    }
  }

  get valueAsString() {
    return (this._value ?? "").toString();
  }

  set valueAsString(_) {
    // Do nothing.
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
    return this._buttonCaption ? this._buttonCaption[nFace] : "";
  }

  buttonGetIcon(nFace = 0) {
    return this._buttonIcon ? this._buttonIcon[nFace] : null;
  }

  buttonImportIcon(cPath = null, nPave = 0) {
    /* Not implemented */
  }

  buttonSetCaption(cCaption, nFace = 0) {
    this._buttonCaption ??= ["", "", ""];
    this._buttonCaption[nFace] = cCaption;
    // TODO: send to the annotation layer
    // Right now the button is drawn on the canvas using its appearance so
    // update the caption means redraw...
    // We should probably have an html button for this annotation.
  }

  buttonSetIcon(oIcon, nFace = 0) {
    this._buttonIcon ??= [null, null, null];
    this._buttonIcon[nFace] = oIcon;
  }

  checkThisBox(nWidget, bCheckIt = true) {
    const index = this._getWidgetIndex(nWidget);
    if (index === -1 || (!bCheckIt && !this._isCheckbox)) {
      return;
    }
    const value = bCheckIt ? this.exportValues[index] : "Off";
    this._check(index, value);
    this._send({ id: this._id, value });
  }

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
      nIdx ||= 0;
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
    } else if (this._currentValueIndices === nIdx) {
      this._currentValueIndices = this.numItems > 0 ? 0 : -1;
    } else if (this._currentValueIndices > nIdx) {
      --this._currentValueIndices;
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
    // Gets the array of terminal child fields (that is, fields that can have
    // a value for this Field object, the parent field).
    if (this._kidIds) {
      const array = [];
      const fillArrayWithKids = kidIds => {
        for (const id of kidIds) {
          const obj = this._appObjects[id];
          if (!obj) {
            continue;
          }
          if (obj.obj._hasValue) {
            array.push(obj.wrapped);
          }
          if (obj.obj._kidIds) {
            fillArrayWithKids(obj.obj._kidIds);
          }
        }
      };
      fillArrayWithKids(this._kidIds);
      return array;
    }

    return (this._children ??= this._getTerminalChildren(this._fieldPath));
  }

  getLock() {
    return undefined;
  }

  isBoxChecked(nWidget) {
    const index = this._getWidgetIndex(nWidget);
    // A current widget ID does not imply that it is checked.
    return (
      index !== -1 &&
      this._id === this._radioIds[index] &&
      this._value === this.exportValues[index]
    );
  }

  isDefaultChecked(nWidget) {
    const index = this._getWidgetIndex(nWidget);
    return index !== -1 && this.defaultValue === this.exportValues[index];
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
    this._actions.getOrInsertComputed(cTrigger, makeArr).push(cScript);
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
    return !!this._radioIds;
  }

  _getExportValue(state) {
    return this._isCheckbox && !state
      ? "Off"
      : this.exportValues[this._checkedIndex];
  }

  /**
   * @returns {Array<[number, string, Array<string>]>} Page index, event name,
   *   and scripts for each PageOpen/PageClose chain.
   */
  _getPageActions() {
    // Collect each widget's chain, including inherited actions.
    const actions = this._radioActions ?? [this._actions];
    const pages = this._radioPages ?? [this._page];
    const pageActions = [];
    for (let i = 0, ii = actions.length; i < ii; i++) {
      for (const eventName of ["PageOpen", "PageClose"]) {
        const scripts = actions[i].get(eventName);
        if (scripts) {
          pageActions.push([pages[i], eventName, scripts]);
        }
      }
    }
    return pageActions;
  }

  _runActions(event) {
    if (this._radioIds) {
      // Use the current widget's actions, even if it is unchecked.
      this._actions = this._radioActions[this._checkedIndex];
    }
    const eventName = event.name;
    if (!this._actions.has(eventName)) {
      return false;
    }

    const actions = this._actions.get(eventName);
    for (const action of actions) {
      try {
        // Evaluate actions in the global scope.
        this._globalEval(action);
      } catch (error) {
        this._sendError(
          serializeError(
            error,
            `Error when executing "${eventName}" for field "${this._id}"\n`
          )
        );
      }
    }

    return true;
  }
}

export { Field };
