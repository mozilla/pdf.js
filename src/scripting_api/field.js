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

// Internal helpers for Doc and EventDispatcher, populated by the static block.
const FieldInternals = Object.create(null);

// Shared accessors for the instance properties of non-terminal fields.
let containerDescriptors = null;

// Properties stored in #viewProps and sent to the view by #update.
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

class Field {
  #actions;

  #appObjects;

  #browseForFileToSubmit;

  #buttonCaption = null;

  #buttonIcon = null;

  #charLimit;

  #children = null;

  #containerProps = null;

  #currentValueIndices;

  #datetimeFormat;

  #fieldPath;

  #fieldType;

  #fillColor;

  #getTerminalChildren;

  #globalEval;

  #hasDateOrTime;

  #hasValue;

  #id;

  #isCheckbox = false;

  #isChoice;

  #items;

  #kidIds;

  #originalValue;

  #otherWidgetIds = null;

  #page;

  #radioActions = null;

  #radioIds = null;

  #radioPages = null;

  #rotation;

  #send;

  #sendError;

  #strokeColor;

  #textColor;

  #util;

  #value = null;

  #viewProps;

  constructor(data, otherWidgets = []) {
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

    this.#actions = createMap(data.actions);
    this.#appObjects = data.appObjects;
    this.#browseForFileToSubmit = data.browseForFileToSubmit || null;
    this.#charLimit = data.charLimit;
    this.#currentValueIndices = data.currentValueIndices || 0;
    this.#datetimeFormat = data.datetimeFormat || null;
    this.#fieldPath = data.fieldPath;
    this.#fieldType = getFieldType(this.#actions);
    this.#fillColor = data.fillColor || ["T"];
    this.#getTerminalChildren = data.getTerminalChildren;
    this.#globalEval = data.globalEval;
    this.#hasDateOrTime = !!data.hasDatetimeHTML;
    this.#hasValue = Object.hasOwn(data, "value");
    this.#id = data.id;
    this.#isChoice = Array.isArray(data.items);
    this.#items = data.items || [];
    this.#kidIds = data.kidIds || null;
    this.#page = data.page || 0;
    this.#rotation = data.rotation || 0;
    // Fields without widgets still report action errors.
    this.#send = data.send || (() => {});
    this.#sendError = data.sendError;
    this.#strokeColor = data.strokeColor || ["G", 0];
    this.#textColor = data.textColor || ["G", 0];
    this.#util = data.util;
    this.#viewProps = Object.fromEntries(
      VIEW_PROPERTIES.map(name => [name, data[name]])
    );
    this.#viewProps.multipleSelection = !!data.multipleSelection;

    if (data.type === "radiobutton" || data.type === "checkbox") {
      // Track each button widget's export value, actions and page.
      this.#isCheckbox = data.type === "checkbox";
      this.exportValues = [this.exportValues];
      this.#radioIds = [this.#id];
      this.#radioActions = [this.#actions];
      this.#radioPages = [this.#page];
      for (const widget of otherWidgets) {
        this.exportValues.push(widget.exportValues);
        this.#radioIds.push(widget.id);
        this.#radioActions.push(createMap(widget.actions));
        this.#radioPages.push(widget.page || 0);
        if (data.value === widget.exportValues) {
          this.#id = widget.id;
        }
      }
      this.#value = data.value || "";
    } else {
      if (otherWidgets.length > 0) {
        this.#otherWidgetIds = otherWidgets.map(widget => widget.id);
      }
      this.#setValue(data.value || "");
    }

    if (this.#kidIds) {
      // Forward assignments to these instance properties to descendants.
      this.#containerProps = { ...this };
      containerDescriptors ??= Field.#getContainerDescriptors(
        Object.keys(this)
      );
      Object.defineProperties(this, containerDescriptors);
    }
  }

  static #getContainerDescriptors(names) {
    const descriptors = Object.create(null);
    for (const name of names) {
      const descriptor = {
        get() {
          return this.#containerProps[name];
        },
        set(value) {
          this.#containerProps[name] = value;
          this.#setOnKids(name, value);
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
    Object.assign(FieldInternals, {
      getComputedValue: f => f.#originalValue ?? f.#value,
      getHasValue: f => f.#hasValue,
      getInitialValue: f => (f.#hasDateOrTime && f.#originalValue) || null,
      getIsChoice: f => f.#isChoice,
      getKidIds: f => f.#kidIds,
      getPageActions: f => f.#getPageActions(),
      getValue: f => f.#value,
      // Set the value without updating the view.
      setValue: (f, value) => f.#setValue(value),
      // Select the button widget targeted by the event.
      prepareEvent(f, id, event) {
        if (f.#radioIds) {
          f.#id = id;
          event.value =
            f.#isCheckbox && !event.value
              ? "Off"
              : f.exportValues[f.#checkedIndex];
          if (event.name === "Action") {
            f.#value = event.value;
          }
        }
      },
      runActions: (f, event) => f.#runActions(event),
      send: (f, data) => f.#sendToView(data),
    });

    for (const name of VIEW_PROPERTIES) {
      Object.defineProperty(Field.prototype, name, {
        get() {
          return this.#viewProps[name];
        },
        set(value) {
          this.#viewProps[name] = value;
          this.#update(name, value);
        },
        configurable: true,
      });
    }

    // As in Acrobat, the field methods can't be overwritten.
    for (const [name, { value }] of Object.entries(
      Object.getOwnPropertyDescriptors(Field.prototype)
    )) {
      if (name !== "constructor" && typeof value === "function") {
        Object.defineProperty(Field.prototype, name, { writable: false });
      }
    }
  }

  get #siblings() {
    return (
      this.#radioIds?.filter(id => id !== this.#id) ?? this.#otherWidgetIds
    );
  }

  /**
   * @returns {Array<[number, string, Array<string>]>} Page index, event name,
   *   and scripts for each PageOpen/PageClose chain.
   */
  #getPageActions() {
    // Collect each widget's chain, including inherited actions.
    const actions = this.#radioActions ?? [this.#actions];
    const pages = this.#radioPages ?? [this.#page];
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

  #setOnKids(name, value) {
    // Forward built-in property assignments; child setters handle recursion.
    if (this.#kidIds) {
      for (const id of this.#kidIds) {
        const kid = this.#appObjects[id];
        if (kid) {
          kid[name] = value;
        }
      }
    }
  }

  // Update the view of the current widget and of its siblings.
  #sendToView(data) {
    const siblings = this.#siblings;
    this.#send(
      siblings ? { id: this.#id, siblings, ...data } : { id: this.#id, ...data }
    );
  }

  #update(name, value, sentValue = value) {
    this.#setOnKids(name, value);
    this.#sendToView({ [name]: sentValue });
  }

  get currentValueIndices() {
    return !this.#isChoice ? 0 : this.#currentValueIndices;
  }

  set currentValueIndices(indices) {
    this.#setOnKids("currentValueIndices", indices);
    if (!this.#isChoice) {
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

    if (this.#viewProps.multipleSelection) {
      this.#currentValueIndices = indices;
      this.#value = indices.map(i => this.#items[i].exportValue);
    } else if (indices.length > 0) {
      indices = [indices[0]];
      this.#currentValueIndices = indices[0];
      this.#value = this.#items[indices[0]].exportValue;
    }
    this.#send({ id: this.#id, indices });
  }

  get fillColor() {
    return this.#fillColor;
  }

  set fillColor(color) {
    if (isValidColor(color)) {
      this.#fillColor = color;
      this.#update("fillColor", color);
    }
  }

  get bgColor() {
    return this.fillColor;
  }

  set bgColor(color) {
    this.fillColor = color;
  }

  get charLimit() {
    return this.#charLimit;
  }

  set charLimit(limit) {
    if (typeof limit !== "number") {
      throw new Error("Invalid argument value");
    }
    this.#charLimit = Math.max(0, Math.floor(limit));
    this.#update("charLimit", this.#charLimit);
  }

  get numItems() {
    if (!this.#isChoice) {
      throw new Error("Not a choice widget");
    }
    return this.#items.length;
  }

  set numItems(_) {
    throw new Error("field.numItems is read-only");
  }

  get strokeColor() {
    return this.#strokeColor;
  }

  set strokeColor(color) {
    if (isValidColor(color)) {
      this.#strokeColor = color;
      this.#update("strokeColor", color);
    }
  }

  get borderColor() {
    return this.strokeColor;
  }

  set borderColor(color) {
    this.strokeColor = color;
  }

  get page() {
    return this.#page;
  }

  set page(_) {
    throw new Error("field.page is read-only");
  }

  get rotation() {
    return this.#rotation;
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
    this.#rotation = angle;
    this.#update("rotation", angle);
  }

  get textColor() {
    return this.#textColor;
  }

  set textColor(color) {
    if (isValidColor(color)) {
      this.#textColor = color;
      this.#update("textColor", color);
    }
  }

  get fgColor() {
    return this.textColor;
  }

  set fgColor(color) {
    this.textColor = color;
  }

  get value() {
    return this.#value;
  }

  set value(value) {
    if (this.#setValue(value)) {
      this.#update("value", value, this.#originalValue ?? this.#value);
    }
  }

  // Return false for unsupported radio-button values.
  #setValue(value) {
    if (this.#radioIds) {
      return this.#setRadioValue(value);
    }
    if (this.#isChoice) {
      this.#setChoiceValue(value);
      return true;
    }

    if (this.#hasDateOrTime && value) {
      const date = this.#util.scand(this.#datetimeFormat, value);
      if (date) {
        this.#originalValue = date.valueOf();
        value = this.#util.printd(this.#datetimeFormat, date);
        this.#value = !isNaN(value) ? parseFloat(value) : value;
        return true;
      }
    }

    if (
      value === "" ||
      typeof value !== "string" ||
      // Preserve strings for date and time fields instead of parsing numbers.
      this.#fieldType >= FieldType.date
    ) {
      this.#originalValue = undefined;
      this.#value = value;
      return true;
    }

    this.#originalValue = value;
    const _value = value.trim().replace(",", ".");
    this.#value = !isNaN(_value) ? parseFloat(_value) : value;
    return true;
  }

  get #checkedIndex() {
    return this.#radioIds.indexOf(this.#id);
  }

  #getWidgetIndex(nWidget) {
    if (!this.#radioIds) {
      return -1;
    }
    // Accept integer indices and their canonical string forms.
    const index = Number(nWidget);
    return Number.isInteger(index) &&
      index >= 0 &&
      index < this.#radioIds.length &&
      `${index}` === `${nWidget}`
      ? index
      : -1;
  }

  #check(index, value) {
    this.#id = this.#radioIds[index];
    this.#value = value;
  }

  #setRadioValue(value) {
    // Non-export values uncheck the checkbox.
    if (
      this.#isCheckbox &&
      (!value || value === "Off" || !this.exportValues.includes(value))
    ) {
      this.#value = "Off";
      return true;
    }
    if (value === null || value === undefined) {
      this.#value = "";
      return true;
    }
    const i = this.exportValues.indexOf(value);
    if (i !== -1) {
      this.#check(i, value);
      return true;
    }
    if (value === "Off" && this.#radioIds.length === 2) {
      const nextI = (1 + this.#checkedIndex) % 2;
      this.#check(nextI, this.exportValues[nextI]);
      return true;
    }
    return false;
  }

  #setChoiceValue(value) {
    if (this.#viewProps.multipleSelection) {
      if (!Array.isArray(value)) {
        value = [value];
      }
      const values = new Set(value);
      if (Array.isArray(this.#currentValueIndices)) {
        this.#currentValueIndices.length = 0;
        this.#value.length = 0;
      } else {
        this.#currentValueIndices = [];
        this.#value = [];
      }
      this.#items.forEach((item, i) => {
        if (values.has(item.exportValue)) {
          this.#currentValueIndices.push(i);
          this.#value.push(item.exportValue);
        }
      });
    } else {
      if (Array.isArray(value)) {
        value = value[0];
      }
      const index = this.#items.findIndex(
        ({ exportValue }) => value === exportValue
      );
      if (index !== -1) {
        this.#currentValueIndices = index;
        this.#value = this.#items[index].exportValue;
      }
    }
  }

  get valueAsString() {
    return (this.#value ?? "").toString();
  }

  set valueAsString(_) {
    // Do nothing.
  }

  browseForFileToSubmit() {
    if (this.#browseForFileToSubmit) {
      // TODO: Implement a file picker.
      this.#browseForFileToSubmit();
    }
  }

  buttonGetCaption(nFace = 0) {
    return this.#buttonCaption ? this.#buttonCaption[nFace] : "";
  }

  buttonGetIcon(nFace = 0) {
    return this.#buttonIcon ? this.#buttonIcon[nFace] : null;
  }

  buttonImportIcon(cPath = null, nPave = 0) {
    /* Not implemented */
  }

  buttonSetCaption(cCaption, nFace = 0) {
    this.#buttonCaption ??= ["", "", ""];
    this.#buttonCaption[nFace] = cCaption;
    // TODO: Update the button's appearance in the annotation layer.
  }

  buttonSetIcon(oIcon, nFace = 0) {
    this.#buttonIcon ??= [null, null, null];
    this.#buttonIcon[nFace] = oIcon;
  }

  checkThisBox(nWidget, bCheckIt = true) {
    const index = this.#getWidgetIndex(nWidget);
    if (index === -1 || (!bCheckIt && !this.#isCheckbox)) {
      return;
    }
    const value = bCheckIt ? this.exportValues[index] : "Off";
    this.#check(index, value);
    this.#send({ id: this.#id, value });
  }

  clearItems() {
    if (!this.#isChoice) {
      throw new Error("Not a choice widget");
    }
    this.#items = [];
    this.#send({ id: this.#id, clear: null });
  }

  deleteItemAt(nIdx = null) {
    if (!this.#isChoice) {
      throw new Error("Not a choice widget");
    }
    if (!this.numItems) {
      return;
    }

    if (nIdx === null) {
      // Current selected item.
      nIdx = Array.isArray(this.#currentValueIndices)
        ? this.#currentValueIndices[0]
        : this.#currentValueIndices;
      nIdx ||= 0;
    }

    if (nIdx < 0 || nIdx >= this.numItems) {
      nIdx = this.numItems - 1;
    }

    this.#items.splice(nIdx, 1);
    if (Array.isArray(this.#currentValueIndices)) {
      let index = this.#currentValueIndices.findIndex(i => i >= nIdx);
      if (index !== -1) {
        if (this.#currentValueIndices[index] === nIdx) {
          this.#currentValueIndices.splice(index, 1);
        }
        for (const ii = this.#currentValueIndices.length; index < ii; index++) {
          --this.#currentValueIndices[index];
        }
      }
    } else if (this.#currentValueIndices === nIdx) {
      this.#currentValueIndices = this.numItems > 0 ? 0 : -1;
    } else if (this.#currentValueIndices > nIdx) {
      --this.#currentValueIndices;
    }

    this.#send({ id: this.#id, remove: nIdx });
  }

  getItemAt(nIdx = -1, bExportValue = false) {
    if (!this.#isChoice) {
      throw new Error("Not a choice widget");
    }
    if (nIdx < 0 || nIdx >= this.numItems) {
      nIdx = this.numItems - 1;
    }
    const item = this.#items[nIdx];
    return bExportValue ? item.exportValue : item.displayValue;
  }

  getArray() {
    // Return fields with values from this subtree.
    if (this.#kidIds) {
      const array = [];
      const fillArrayWithKids = kidIds => {
        for (const id of kidIds) {
          const obj = this.#appObjects[id];
          if (!obj) {
            continue;
          }
          if (obj.#hasValue) {
            array.push(obj);
          }
          if (obj.#kidIds) {
            fillArrayWithKids(obj.#kidIds);
          }
        }
      };
      fillArrayWithKids(this.#kidIds);
      return array;
    }

    return (this.#children ??= this.#getTerminalChildren(this.#fieldPath));
  }

  getLock() {
    return undefined;
  }

  isBoxChecked(nWidget) {
    const index = this.#getWidgetIndex(nWidget);
    // A current widget ID does not imply that it is checked.
    return (
      index !== -1 &&
      this.#id === this.#radioIds[index] &&
      this.#value === this.exportValues[index]
    );
  }

  isDefaultChecked(nWidget) {
    const index = this.#getWidgetIndex(nWidget);
    return index !== -1 && this.defaultValue === this.exportValues[index];
  }

  insertItemAt(cName, cExport = undefined, nIdx = 0) {
    if (!this.#isChoice) {
      throw new Error("Not a choice widget");
    }
    if (!cName) {
      return;
    }

    if (nIdx < 0 || nIdx > this.numItems) {
      nIdx = this.numItems;
    }

    if (this.#items.some(({ displayValue }) => displayValue === cName)) {
      return;
    }

    if (cExport === undefined) {
      cExport = cName;
    }
    const data = { displayValue: cName, exportValue: cExport };
    this.#items.splice(nIdx, 0, data);
    if (Array.isArray(this.#currentValueIndices)) {
      let index = this.#currentValueIndices.findIndex(i => i >= nIdx);
      if (index !== -1) {
        for (const ii = this.#currentValueIndices.length; index < ii; index++) {
          ++this.#currentValueIndices[index];
        }
      }
    } else if (this.#currentValueIndices >= nIdx) {
      ++this.#currentValueIndices;
    }

    this.#send({ id: this.#id, insert: { index: nIdx, ...data } });
  }

  setAction(cTrigger, cScript) {
    if (typeof cTrigger !== "string" || typeof cScript !== "string") {
      return;
    }
    this.#actions.getOrInsertComputed(cTrigger, makeArr).push(cScript);
  }

  setFocus() {
    this.#send({ id: this.#id, focus: true });
  }

  setItems(oArray) {
    if (!this.#isChoice) {
      throw new Error("Not a choice widget");
    }
    this.#items.length = 0;
    for (const element of oArray) {
      let displayValue, exportValue;
      if (Array.isArray(element)) {
        displayValue = element[0]?.toString() || "";
        exportValue = element[1]?.toString() || "";
      } else {
        displayValue = exportValue = element?.toString() || "";
      }
      this.#items.push({ displayValue, exportValue });
    }
    this.#currentValueIndices = 0;

    this.#send({ id: this.#id, items: this.#items });
  }

  setLock() {}

  signatureGetModifications() {}

  signatureGetSeedValue() {}

  signatureInfo() {}

  signatureSetSeedValue() {}

  signatureSign() {}

  signatureValidate() {}

  #runActions(event) {
    if (this.#radioIds) {
      // Use the current widget's actions, even if it is unchecked.
      this.#actions = this.#radioActions[this.#checkedIndex];
    }
    const eventName = event.name;
    const actions = this.#actions.get(eventName);
    if (!actions) {
      return false;
    }

    for (const action of actions) {
      try {
        // Evaluate actions in the global scope.
        this.#globalEval(action);
      } catch (error) {
        this.#sendError(
          serializeError(
            error,
            `Error when executing "${eventName}" for field "${this.#id}"\n`
          )
        );
      }
    }

    return true;
  }
}

export { Field, FieldInternals };
