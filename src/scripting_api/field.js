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

globalThis.Field = class Field {
  #browseForFileToSubmit;

  #buttonCaption = null;

  #buttonIcon = null;

  #charLimit;

  #children = null;

  #currentValueIndices;

  #display;

  #editable;

  #fieldPath;

  #fillColor;

  #hidden;

  #items;

  #originalValue;

  #print;

  #readonly;

  #required;

  #rotation;

  #strokeColor;

  #textColor;

  #userName;

  #datetimeFormat;

  #hasDateOrTime;

  #util;

  #globalEval;

  #appObjects;

  #fieldType;

  #kidIds;

  #id;

  #send;

  #actions;

  #hasValue;

  #isChoice;

  #page;

  #siblings;

  #value = null;

  #initialized = false;

  // Capability object and accessors passed in from initSandbox.
  #fp;

  #getFieldPrivate;

  #docInternals;

  constructor(data) {
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
    this.currentValueIndices = data.currentValueIndices;
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
    this.multipleSelection = !!data.multipleSelection;
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

    // Stored in private fields so that their setters (which call #send)
    // are NOT triggered during construction.
    this.#display = data.display;
    this.#editable = data.editable;
    this.#hidden = data.hidden;
    this.#print = data.print;
    this.#readonly = data.readonly;
    this.#required = data.required;
    this.#userName = data.userName;

    // Private
    this.#id = data.id;
    this.#send = data.send ?? (() => {});
    this.#actions = new Map(data.actions ? Object.entries(data.actions) : null);
    this.#browseForFileToSubmit = data.browseForFileToSubmit || null;
    this.#charLimit = data.charLimit;
    this.#currentValueIndices = data.currentValueIndices || 0;
    this.#fieldPath = data.fieldPath;
    this.#fillColor = data.fillColor || ["T"];
    this.#isChoice = Array.isArray(data.items);
    this.#items = data.items || [];
    this.#hasValue = Object.hasOwn(data, "value");
    this.#page = data.page || 0;
    this.#strokeColor = data.strokeColor || ["G", 0];
    this.#textColor = data.textColor || ["G", 0];
    this.#kidIds = data.kidIds || null;
    this.#fieldType = Field.#getFieldType(this.#actions);
    this.#siblings = data.siblings || null;
    this.#rotation = data.rotation || 0;
    this.#datetimeFormat = data.datetimeFormat || null;
    this.#hasDateOrTime = !!data.hasDatetimeHTML;
    this.#util = data.util;

    this.#globalEval = data.globalEval;
    this.#appObjects = data.appObjects;
    this.#fp = data.fieldPrivate;
    this.#getFieldPrivate = data.getFieldPrivate;
    this.#docInternals = data.docInternals;

    // The value is set depending on the field type.
    this.value = data.value || "";
    this.#initialized = true;
  }

  static claimInternals() {
    delete Field.claimInternals;
    return {
      getId: f => f.#id,
      setId: (f, v) => {
        f.#id = v;
      },
      send: (f, data) => {
        f.#send(data);
      },
      getActions: f => f.#actions,
      setActions: (f, v) => {
        f.#actions = v;
      },
      getHasValue: f => f.#hasValue,
      getIsChoice: f => f.#isChoice,
      getPage: f => f.#page,
      getSiblings: f => f.#siblings,
      setSiblings: (f, v) => {
        f.#siblings = v;
      },
      getValue: f => f.#value,
      setValue: (f, v) => {
        f.#value = v;
      },
      getInitialValue: f => (f.#hasDateOrTime && f.#originalValue) || null,
      getKidIds: f => f.#kidIds,
      getComputedValue: f => f.#originalValue ?? f.value,
      isButton: () => false,
      getExportValue: (_f, _state) => undefined,
      reset: f => {
        f.value = f.defaultValue;
      },
      runActions: (f, event) => f.#runActions(event),
    };
  }

  static #getFieldType(actions) {
    let format = actions.get("Format");
    if (!format) {
      return "none";
    }

    format = format[0];

    format = format.trim();
    if (format.startsWith("AFNumber_")) {
      return "number";
    }
    if (format.startsWith("AFPercent_")) {
      return "percent";
    }
    if (format.startsWith("AFDate_")) {
      return "date";
    }
    if (format.startsWith("AFTime_")) {
      return "time";
    }
    return "none";
  }

  get currentValueIndices() {
    if (!this.#isChoice) {
      return 0;
    }
    return this.#currentValueIndices;
  }

  set currentValueIndices(indices) {
    if (!this.#isChoice) {
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
      this.#currentValueIndices = indices;
      this.#value = [];
      indices.forEach(i => {
        this.#value.push(this.#items[i].displayValue);
      });
    } else if (indices.length > 0) {
      indices = indices.splice(1, indices.length - 1);
      this.#currentValueIndices = indices[0];
      this.#value = this.#items[this.#currentValueIndices];
    }
    this.#send({ id: this.#id, indices });
  }

  get fillColor() {
    return this.#fillColor;
  }

  set fillColor(color) {
    if (globalThis.color._isValidColor(color)) {
      this.#fillColor = color;
      this.#sendData({ id: this.#id, fillColor: color });
    }
  }

  get bgColor() {
    return this.#fillColor;
  }

  set bgColor(color) {
    if (globalThis.color._isValidColor(color)) {
      this.#fillColor = color;
      this.#sendData({ id: this.#id, bgColor: color });
    }
  }

  get charLimit() {
    return this.#charLimit;
  }

  set charLimit(limit) {
    if (typeof limit !== "number") {
      throw new Error("Invalid argument value");
    }
    this.#charLimit = Math.max(0, Math.floor(limit));
    this.#sendData({ id: this.#id, charLimit: this.#charLimit });
  }

  get display() {
    return this.#display;
  }

  set display(value) {
    this.#display = value;
    this.#sendData({ id: this.#id, display: value });
  }

  get editable() {
    return this.#editable;
  }

  set editable(value) {
    this.#editable = value;
    this.#sendData({ id: this.#id, editable: value });
  }

  get hidden() {
    return this.#hidden;
  }

  set hidden(value) {
    this.#hidden = value;
    this.#sendData({ id: this.#id, hidden: value });
  }

  get print() {
    return this.#print;
  }

  set print(value) {
    this.#print = value;
    this.#sendData({ id: this.#id, print: value });
  }

  get readonly() {
    return this.#readonly;
  }

  set readonly(value) {
    this.#readonly = value;
    this.#sendData({ id: this.#id, readonly: value });
  }

  get required() {
    return this.#required;
  }

  set required(value) {
    this.#required = value;
    this.#sendData({ id: this.#id, required: value });
  }

  get userName() {
    return this.#userName;
  }

  set userName(value) {
    this.#userName = value;
    this.#sendData({ id: this.#id, userName: value });
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
    if (globalThis.color._isValidColor(color)) {
      this.#strokeColor = color;
      this.#sendData({ id: this.#id, strokeColor: color });
    }
  }

  get borderColor() {
    return this.#strokeColor;
  }

  set borderColor(color) {
    if (globalThis.color._isValidColor(color)) {
      this.#strokeColor = color;
      this.#sendData({ id: this.#id, borderColor: color });
    }
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
    this.#sendData({ id: this.#id, rotation: angle });
  }

  get textColor() {
    return this.#textColor;
  }

  set textColor(color) {
    if (globalThis.color._isValidColor(color)) {
      this.#textColor = color;
      this.#sendData({ id: this.#id, textColor: color });
    }
  }

  get fgColor() {
    return this.#textColor;
  }

  set fgColor(color) {
    if (globalThis.color._isValidColor(color)) {
      this.#textColor = color;
      this.#sendData({ id: this.#id, fgColor: color });
    }
  }

  get value() {
    return this.#value;
  }

  set value(value) {
    if (this.#isChoice) {
      this.#setChoiceValue(value);
    } else if (this.#hasDateOrTime && value) {
      const date = this.#util.scand(this.#datetimeFormat, value);
      if (date) {
        this.#originalValue = date.valueOf();
        value = this.#util.printd(this.#datetimeFormat, date);
        this.#value = !isNaN(value) ? parseFloat(value) : value;
      } else {
        this.#originalValue = value;
        const _value = value.trim().replace(",", ".");
        this.#value = !isNaN(_value) ? parseFloat(_value) : value;
      }
    } else if (
      value === "" ||
      typeof value !== "string" ||
      // When the field type is date or time, the value must be a string.
      ["date", "time"].includes(this.#fieldType)
    ) {
      this.#originalValue = undefined;
      this.#value = value;
    } else {
      this.#originalValue = value;
      const _value = value.trim().replace(",", ".");
      this.#value = !isNaN(_value) ? parseFloat(_value) : value;
    }
    if (this.#initialized) {
      this.#sendData({
        id: this.#id,
        value: this.#originalValue ?? this.#value,
      });
    }
  }

  #setChoiceValue(value) {
    if (this.multipleSelection) {
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
      // TODO: implement this function on Firefox side
      // we can use nsIFilePicker but open method is async.
      // Maybe it's possible to use a html input (type=file) too.
      this.#browseForFileToSubmit();
    }
  }

  buttonGetCaption(nFace = 0) {
    if (this.#buttonCaption) {
      return this.#buttonCaption[nFace];
    }
    return "";
  }

  buttonGetIcon(nFace = 0) {
    if (this.#buttonIcon) {
      return this.#buttonIcon[nFace];
    }
    return null;
  }

  buttonImportIcon(cPath = null, nPave = 0) {
    /* Not implemented */
  }

  buttonSetCaption(cCaption, nFace = 0) {
    if (!this.#buttonCaption) {
      this.#buttonCaption = ["", "", ""];
    }
    this.#buttonCaption[nFace] = cCaption;
    // TODO: send to the annotation layer
    // Right now the button is drawn on the canvas using its appearance so
    // update the caption means redraw...
    // We should probably have an html button for this annotation.
  }

  buttonSetIcon(oIcon, nFace = 0) {
    if (!this.#buttonIcon) {
      this.#buttonIcon = [null, null, null];
    }
    this.#buttonIcon[nFace] = oIcon;
  }

  checkThisBox(nWidget, bCheckIt = true) {}

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
    // Gets the array of terminal child fields (that is, fields that can have
    // a value for this Field object, the parent field).
    if (this.#kidIds) {
      const array = [];
      const fillArrayWithKids = kidIds => {
        for (const id of kidIds) {
          const obj = this.#appObjects[id];
          if (!obj) {
            continue;
          }
          const fp = this.#getFieldPrivate(obj);
          if (fp.getHasValue(obj)) {
            array.push(obj);
          }
          const kids = fp.getKidIds(obj);
          if (kids) {
            fillArrayWithKids(kids);
          }
        }
      };
      fillArrayWithKids(this.#kidIds);
      return array;
    }

    return (this.#children ??= this.#docInternals.getTerminalChildren(
      this.#fieldPath
    ));
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
    this.#actions.getOrInsertComputed(cTrigger, () => []).push(cScript);
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
    const eventName = event.name;
    if (!this.#actions.has(eventName)) {
      return false;
    }

    const actions = this.#actions.get(eventName);
    for (const action of actions) {
      try {
        // Action evaluation must happen in the global scope
        this.#globalEval(action);
      } catch (error) {
        const id = this.#id;
        this.#send({
          toString() {
            return `Error when executing "${eventName}" for field "${id}"\n${error.toString()}`;
          },
          stack: error.stack,
        });
      }
    }

    return true;
  }

  // Send data, including siblings when they exist.
  #sendData(data) {
    const siblings = this.#fp.getSiblings(this);
    if (siblings) {
      data.siblings = siblings;
    }
    this.#send(data);
  }
};

globalThis.RadioButtonField = class RadioButtonField extends globalThis.Field {
  #radioIds;

  #radioActions;

  // Tracks instances whose constructor has fully run. Using a static private
  // WeakSet avoids accessing instance #private fields before super() returns,
  // which would throw in spec-compliant engines (SpiderMonkey/V8). Static
  // private fields are class-scoped and invisible to PDF scripts.
  static #initialized = new WeakSet();

  // fieldPrivate passed in via constructor data.
  #fp;

  constructor(otherButtons, data) {
    super(data);

    const fp = data.fieldPrivate;
    this.#fp = fp;

    this.exportValues = [this.exportValues];
    this.#radioIds = [fp.getId(this)];
    this.#radioActions = [fp.getActions(this)];

    for (const radioData of otherButtons) {
      this.exportValues.push(radioData.exportValues);
      this.#radioIds.push(radioData.id);
      this.#radioActions.push(
        new Map(radioData.actions ? Object.entries(radioData.actions) : null)
      );
      if (fp.getValue(this) === radioData.exportValues) {
        fp.setId(this, radioData.id);
      }
    }

    RadioButtonField.#initialized.add(this);
    fp.setValue(this, data.value || "");
  }

  static claimInternals(fieldPrivate) {
    delete RadioButtonField.claimInternals;
    return Object.assign(Object.create(fieldPrivate), {
      getRadioIds: f => f.#radioIds,
      getSiblings: f => f.#radioIds.filter(id => id !== fieldPrivate.getId(f)),
      isButton: () => true,
      getExportValue: (f, _state) => {
        const i = f.#radioIds.indexOf(fieldPrivate.getId(f));
        return f.exportValues[i];
      },
      runActions: (f, event) => {
        const i = f.#radioIds.indexOf(fieldPrivate.getId(f));
        fieldPrivate.setActions(f, f.#radioActions[i]);
        return fieldPrivate.runActions(f, event);
      },
    });
  }

  get value() {
    return this.#fp.getValue(this);
  }

  set value(value) {
    if (!RadioButtonField.#initialized.has(this)) {
      return;
    }

    const fp = this.#fp;
    if (value === null || value === undefined) {
      fp.setValue(this, "");
      return;
    }
    const i = this.exportValues.indexOf(value);
    if (0 <= i && i < this.#radioIds.length) {
      fp.setId(this, this.#radioIds[i]);
      fp.setValue(this, value);
    } else if (value === "Off" && this.#radioIds.length === 2) {
      const nextI = (1 + this.#radioIds.indexOf(fp.getId(this))) % 2;
      fp.setId(this, this.#radioIds[nextI]);
      fp.setValue(this, this.exportValues[nextI]);
    } else {
      return;
    }
    fp.send(this, {
      id: fp.getId(this),
      siblings: this.#radioIds.filter(id => id !== fp.getId(this)),
      value: fp.getValue(this),
    });
  }

  checkThisBox(nWidget, bCheckIt = true) {
    if (nWidget < 0 || nWidget >= this.#radioIds.length || !bCheckIt) {
      return;
    }

    const fp = this.#fp;
    fp.setId(this, this.#radioIds[nWidget]);
    fp.setValue(this, this.exportValues[nWidget]);
    fp.send(this, {
      id: fp.getId(this),
      value: fp.getValue(this),
    });
  }

  isBoxChecked(nWidget) {
    return (
      nWidget >= 0 &&
      nWidget < this.#radioIds.length &&
      this.#fp.getId(this) === this.#radioIds[nWidget]
    );
  }

  isDefaultChecked(nWidget) {
    return (
      nWidget >= 0 &&
      nWidget < this.exportValues.length &&
      this.defaultValue === this.exportValues[nWidget]
    );
  }
};

globalThis.CheckboxField = class CheckboxField extends (
  globalThis.RadioButtonField
) {
  static #initialized = new WeakSet();

  // fieldPrivate and radioFieldPrivate passed in via constructor data.
  #fp;

  #rfp;

  constructor(otherButtons, data) {
    super(otherButtons, data);
    this.#fp = data.fieldPrivate;
    this.#rfp = data.radioFieldPrivate;
    CheckboxField.#initialized.add(this);
  }

  static claimInternals(radioFieldPrivate) {
    delete CheckboxField.claimInternals;
    return Object.assign(Object.create(radioFieldPrivate), {
      getExportValue: (f, state) =>
        state ? radioFieldPrivate.getExportValue(f, state) : "Off",
    });
  }

  get value() {
    return this.#fp.getValue(this);
  }

  set value(value) {
    if (!CheckboxField.#initialized.has(this)) {
      return;
    }
    const fp = this.#fp;
    if (!value || value === "Off") {
      fp.setValue(this, "Off");
      fp.send(this, { id: fp.getId(this), value: "Off" });
    } else {
      super.value = value;
    }
  }

  isBoxChecked(nWidget) {
    if (this.#fp.getValue(this) === "Off") {
      return false;
    }
    return super.isBoxChecked(nWidget);
  }

  isDefaultChecked(nWidget) {
    if (this.defaultValue === "Off") {
      return this.#fp.getValue(this) === "Off";
    }
    return super.isDefaultChecked(nWidget);
  }

  checkThisBox(nWidget, bCheckIt = true) {
    const radioIds = this.#rfp.getRadioIds(this);
    if (nWidget < 0 || nWidget >= radioIds.length) {
      return;
    }
    const fp = this.#fp;
    fp.setId(this, radioIds[nWidget]);
    fp.setValue(this, bCheckIt ? this.exportValues[nWidget] : "Off");
    fp.send(this, {
      id: fp.getId(this),
      value: fp.getValue(this),
    });
  }
};

export {};
