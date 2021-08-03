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

import { createActionsMap } from "./common.js";
import { PDFObject } from "./pdf_object.js";
import { PrintParams } from "./print_params.js";
import { ZoomType } from "./constants.js";

class InfoProxyHandler {
  static get(obj, prop) {
    return obj[prop.toLowerCase()];
  }

  static set(obj, prop, value) {
    throw new Error(`doc.info.${prop} is read-only`);
  }
}

class Doc extends PDFObject {
  constructor(data) {
    super(data);

    // In a script doc === this.
    // So adding a property to the doc means adding it to this
    this._expandos = globalThis;

    this._baseURL = data.baseURL || "";
    this._calculate = true;
    this._delay = false;
    this._dirty = false;
    this._disclosed = false;
    this._media = undefined;
    this._metadata = data.metadata || "";
    this._noautocomplete = undefined;
    this._nocache = undefined;
    this._spellDictionaryOrder = [];
    this._spellLanguageOrder = [];

    this._printParams = null;
    this._fields = new Map();
    this._fieldNames = [];
    this._event = null;

    this._author = data.Author || "";
    this._creator = data.Creator || "";
    this._creationDate = this._getDate(data.CreationDate) || null;
    this._docID = data.docID || ["", ""];
    this._documentFileName = data.filename || "";
    this._filesize = data.filesize || 0;
    this._keywords = data.Keywords || "";
    this._layout = data.layout || "";
    this._modDate = this._getDate(data.ModDate) || null;
    this._numFields = 0;
    this._numPages = data.numPages || 1;
    this._pageNum = data.pageNum || 0;
    this._producer = data.Producer || "";
    this._subject = data.Subject || "";
    this._title = data.Title || "";
    this._URL = data.URL || "";

    // info has case insensitive properties
    // and they're are read-only.
    this._info = new Proxy(
      {
        title: this._title,
        author: this._author,
        authors: data.authors || [this._author],
        subject: this._subject,
        keywords: this._keywords,
        creator: this._creator,
        producer: this._producer,
        creationdate: this._creationDate,
        moddate: this._modDate,
        trapped: data.Trapped || "Unknown",
      },
      InfoProxyHandler
    );

    this._zoomType = ZoomType.none;
    this._zoom = data.zoom || 100;
    this._actions = createActionsMap(data.actions);
    this._globalEval = data.globalEval;
    this._pageActions = new Map();
  }

  _dispatchDocEvent(name) {
    if (name === "Open") {
      const dontRun = new Set([
        "WillClose",
        "WillSave",
        "DidSave",
        "WillPrint",
        "DidPrint",
        "OpenAction",
      ]);
      for (const actionName of this._actions.keys()) {
        if (!dontRun.has(actionName)) {
          this._runActions(actionName);
        }
      }
      this._runActions("OpenAction");
    } else {
      this._runActions(name);
    }
  }

  _dispatchPageEvent(name, actions, pageNumber) {
    if (name === "PageOpen") {
      if (!this._pageActions.has(pageNumber)) {
        this._pageActions.set(pageNumber, createActionsMap(actions));
      }
      this._pageNum = pageNumber - 1;
    }

    actions = this._pageActions.get(pageNumber)?.get(name);
    if (actions) {
      for (const action of actions) {
        this._globalEval(action);
      }
    }
  }

  _runActions(name) {
    const actions = this._actions.get(name);
    if (actions) {
      for (const action of actions) {
        this._globalEval(action);
      }
    }
  }

  _addField(name, field) {
    this._fields.set(name, field);
    this._fieldNames.push(name);
    this._numFields++;
  }

  _getDate(date) {
    // date format is D:YYYYMMDDHHmmSS[OHH'mm']
    if (!date || date.length < 15 || !date.startsWith("D:")) {
      return date;
    }

    date = date.substring(2);
    const year = date.substring(0, 4);
    const month = date.substring(4, 6);
    const day = date.substring(6, 8);
    const hour = date.substring(8, 10);
    const minute = date.substring(10, 12);
    const o = date.charAt(12);
    let second, offsetPos;
    if (o === "Z" || o === "+" || o === "-") {
      second = "00";
      offsetPos = 12;
    } else {
      second = date.substring(12, 14);
      offsetPos = 14;
    }
    const offset = date.substring(offsetPos).replaceAll("'", "");
    return new Date(
      `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`
    );
  }

  get author() {
    return this._author;
  }

  set author(_) {
    throw new Error("doc.author is read-only");
  }

  get baseURL() {
    return this._baseURL;
  }

  set baseURL(baseURL) {
    this._baseURL = baseURL;
  }

  get bookmarkRoot() {
    return undefined;
  }

  set bookmarkRoot(_) {
    throw new Error("doc.bookmarkRoot is read-only");
  }

  get calculate() {
    return this._calculate;
  }

  set calculate(calculate) {
    this._calculate = calculate;
  }

  get creator() {
    return this._creator;
  }

  set creator(_) {
    throw new Error("doc.creator is read-only");
  }

  get dataObjects() {
    return [];
  }

  set dataObjects(_) {
    throw new Error("doc.dataObjects is read-only");
  }

  get delay() {
    return this._delay;
  }

  set delay(delay) {
    this._delay = delay;
  }

  get dirty() {
    return this._dirty;
  }

  set dirty(dirty) {
    this._dirty = dirty;
  }

  get disclosed() {
    return this._disclosed;
  }

  set disclosed(disclosed) {
    this._disclosed = disclosed;
  }

  get docID() {
    return this._docID;
  }

  set docID(_) {
    throw new Error("doc.docID is read-only");
  }

  get documentFileName() {
    return this._documentFileName;
  }

  set documentFileName(_) {
    throw new Error("doc.documentFileName is read-only");
  }

  get dynamicXFAForm() {
    return false;
  }

  set dynamicXFAForm(_) {
    throw new Error("doc.dynamicXFAForm is read-only");
  }

  get external() {
    return true;
  }

  set external(_) {
    throw new Error("doc.external is read-only");
  }

  get filesize() {
    return this._filesize;
  }

  set filesize(_) {
    throw new Error("doc.filesize is read-only");
  }

  get hidden() {
    return false;
  }

  set hidden(_) {
    throw new Error("doc.hidden is read-only");
  }

  get hostContainer() {
    return undefined;
  }

  set hostContainer(_) {
    throw new Error("doc.hostContainer is read-only");
  }

  get icons() {
    return undefined;
  }

  set icons(_) {
    throw new Error("doc.icons is read-only");
  }

  get info() {
    return this._info;
  }

  set info(_) {
    throw new Error("doc.info is read-only");
  }

  get innerAppWindowRect() {
    return [0, 0, 0, 0];
  }

  set innerAppWindowRect(_) {
    throw new Error("doc.innerAppWindowRect is read-only");
  }

  get innerDocWindowRect() {
    return [0, 0, 0, 0];
  }

  set innerDocWindowRect(_) {
    throw new Error("doc.innerDocWindowRect is read-only");
  }

  get isModal() {
    return false;
  }

  set isModal(_) {
    throw new Error("doc.isModal is read-only");
  }

  get keywords() {
    return this._keywords;
  }

  set keywords(_) {
    throw new Error("doc.keywords is read-only");
  }

  get layout() {
    return this._layout;
  }

  set layout(value) {
    if (typeof value !== "string") {
      return;
    }

    if (
      value !== "SinglePage" &&
      value !== "OneColumn" &&
      value !== "TwoColumnLeft" &&
      value !== "TwoPageLeft" &&
      value !== "TwoColumnRight" &&
      value !== "TwoPageRight"
    ) {
      value = "SinglePage";
    }
    this._send({ command: "layout", value });
    this._layout = value;
  }

  get media() {
    return this._media;
  }

  set media(media) {
    this._media = media;
  }

  get metadata() {
    return this._metadata;
  }

  set metadata(metadata) {
    this._metadata = metadata;
  }

  get modDate() {
    return this._modDate;
  }

  set modDate(_) {
    throw new Error("doc.modDate is read-only");
  }

  get mouseX() {
    return 0;
  }

  set mouseX(_) {
    throw new Error("doc.mouseX is read-only");
  }

  get mouseY() {
    return 0;
  }

  set mouseY(_) {
    throw new Error("doc.mouseY is read-only");
  }

  get noautocomplete() {
    return this._noautocomplete;
  }

  set noautocomplete(noautocomplete) {
    this._noautocomplete = noautocomplete;
  }

  get nocache() {
    return this._nocache;
  }

  set nocache(nocache) {
    this._nocache = nocache;
  }

  get numFields() {
    return this._numFields;
  }

  set numFields(_) {
    throw new Error("doc.numFields is read-only");
  }

  get numPages() {
    return this._numPages;
  }

  set numPages(_) {
    throw new Error("doc.numPages is read-only");
  }

  get numTemplates() {
    return 0;
  }

  set numTemplates(_) {
    throw new Error("doc.numTemplates is read-only");
  }

  get outerAppWindowRect() {
    return [0, 0, 0, 0];
  }

  set outerAppWindowRect(_) {
    throw new Error("doc.outerAppWindowRect is read-only");
  }

  get outerDocWindowRect() {
    return [0, 0, 0, 0];
  }

  set outerDocWindowRect(_) {
    throw new Error("doc.outerDocWindowRect is read-only");
  }

  get pageNum() {
    return this._pageNum;
  }

  set pageNum(value) {
    if (typeof value !== "number" || value < 0 || value >= this._numPages) {
      return;
    }
    this._send({ command: "page-num", value });
    this._pageNum = value;
  }

  get pageWindowRect() {
    return [0, 0, 0, 0];
  }

  set pageWindowRect(_) {
    throw new Error("doc.pageWindowRect is read-only");
  }

  get path() {
    return "";
  }

  set path(_) {
    throw new Error("doc.path is read-only");
  }

  get permStatusReady() {
    return true;
  }

  set permStatusReady(_) {
    throw new Error("doc.permStatusReady is read-only");
  }

  get producer() {
    return this._producer;
  }

  set producer(_) {
    throw new Error("doc.producer is read-only");
  }

  get requiresFullSave() {
    return false;
  }

  set requiresFullSave(_) {
    throw new Error("doc.requiresFullSave is read-only");
  }

  get securityHandler() {
    return null;
  }

  set securityHandler(_) {
    throw new Error("doc.securityHandler is read-only");
  }

  get selectedAnnots() {
    return [];
  }

  set selectedAnnots(_) {
    throw new Error("doc.selectedAnnots is read-only");
  }

  get sounds() {
    return [];
  }

  set sounds(_) {
    throw new Error("doc.sounds is read-only");
  }

  get spellDictionaryOrder() {
    return this._spellDictionaryOrder;
  }

  set spellDictionaryOrder(spellDictionaryOrder) {
    this._spellDictionaryOrder = spellDictionaryOrder;
  }

  get spellLanguageOrder() {
    return this._spellLanguageOrder;
  }

  set spellLanguageOrder(spellLanguageOrder) {
    this._spellLanguageOrder = spellLanguageOrder;
  }

  get subject() {
    return this._subject;
  }

  set subject(_) {
    throw new Error("doc.subject is read-only");
  }

  get templates() {
    return [];
  }

  set templates(_) {
    throw new Error("doc.templates is read-only");
  }

  get title() {
    return this._title;
  }

  set title(_) {
    throw new Error("doc.title is read-only");
  }

  get URL() {
    return this._URL;
  }

  set URL(_) {
    throw new Error("doc.URL is read-only");
  }

  get viewState() {
    return undefined;
  }

  set viewState(_) {
    throw new Error("doc.viewState is read-only");
  }

  get xfa() {
    return this._xfa;
  }

  set xfa(_) {
    throw new Error("doc.xfa is read-only");
  }

  get XFAForeground() {
    return false;
  }

  set XFAForeground(_) {
    throw new Error("doc.XFAForeground is read-only");
  }

  get zoomType() {
    return this._zoomType;
  }

  set zoomType(type) {
    if (typeof type !== "string") {
      return;
    }
    switch (type) {
      case ZoomType.none:
        this._send({ command: "zoom", value: 1 });
        break;
      case ZoomType.fitP:
        this._send({ command: "zoom", value: "page-fit" });
        break;
      case ZoomType.fitW:
        this._send({ command: "zoom", value: "page-width" });
        break;
      case ZoomType.fitH:
        this._send({ command: "zoom", value: "page-height" });
        break;
      case ZoomType.fitV:
        this._send({ command: "zoom", value: "auto" });
        break;
      case ZoomType.pref:
      case ZoomType.refW:
        break;
      default:
        return;
    }

    this._zoomType = type;
  }

  get zoom() {
    return this._zoom;
  }

  set zoom(value) {
    if (typeof value !== "number" || value < 8.33 || value > 6400) {
      return;
    }

    this._send({ command: "zoom", value: value / 100 });
  }

  addAnnot() {
    /* Not implemented */
  }

  addField() {
    /* Not implemented */
  }

  addIcon() {
    /* Not implemented */
  }

  addLink() {
    /* Not implemented */
  }

  addRecipientListCryptFilter() {
    /* Not implemented */
  }

  addRequirement() {
    /* Not implemented */
  }

  addScript() {
    /* Not implemented */
  }

  addThumbnails() {
    /* Not implemented */
  }

  addWatermarkFromFile() {
    /* Not implemented */
  }

  addWatermarkFromText() {
    /* Not implemented */
  }

  addWeblinks() {
    /* Not implemented */
  }

  bringToFront() {
    /* Not implemented */
  }

  calculateNow() {
    this._eventDispatcher.calculateNow();
  }

  closeDoc() {
    /* Not implemented */
  }

  colorConvertPage() {
    /* Not implemented */
  }

  createDataObject() {
    /* Not implemented */
  }

  createTemplate() {
    /* Not implemented */
  }

  deletePages() {
    /* Not implemented */
  }

  deleteSound() {
    /* Not implemented */
  }

  embedDocAsDataObject() {
    /* Not implemented */
  }

  embedOutputIntent() {
    /* Not implemented */
  }

  encryptForRecipients() {
    /* Not implemented */
  }

  encryptUsingPolicy() {
    /* Not implemented */
  }

  exportAsFDF() {
    /* Not implemented */
  }

  exportAsFDFStr() {
    /* Not implemented */
  }

  exportAsText() {
    /* Not implemented */
  }

  exportAsXFDF() {
    /* Not implemented */
  }

  exportAsXFDFStr() {
    /* Not implemented */
  }

  exportDataObject() {
    /* Not implemented */
  }

  exportXFAData() {
    /* Not implemented */
  }

  extractPages() {
    /* Not implemented */
  }

  flattenPages() {
    /* Not implemented */
  }

  getAnnot() {
    /* TODO */
  }

  getAnnots() {
    /* TODO */
  }

  getAnnot3D() {
    /* Not implemented */
  }

  getAnnots3D() {
    /* Not implemented */
  }

  getColorConvertAction() {
    /* Not implemented */
  }

  getDataObject() {
    /* Not implemented */
  }

  getDataObjectContents() {
    /* Not implemented */
  }

  getField(cName) {
    if (typeof cName === "object") {
      cName = cName.cName;
    }
    if (typeof cName !== "string") {
      throw new TypeError("Invalid field name: must be a string");
    }
    const searchedField = this._fields.get(cName);
    if (searchedField) {
      return searchedField;
    }

    const parts = cName.split("#");
    let childIndex = NaN;
    if (parts.length === 2) {
      childIndex = Math.floor(parseFloat(parts[1]));
      cName = parts[0];
    }

    for (const [name, field] of this._fields.entries()) {
      if (name.endsWith(cName)) {
        if (!isNaN(childIndex)) {
          const children = this._getChildren(name);
          if (childIndex < 0 || childIndex >= children.length) {
            childIndex = 0;
          }
          if (childIndex < children.length) {
            this._fields.set(cName, children[childIndex]);
            return children[childIndex];
          }
        }
        this._fields.set(cName, field);
        return field;
      }
    }

    return null;
  }

  _getChildren(fieldName) {
    // Children of foo.bar are foo.bar.oof, foo.bar.rab
    // but not foo.bar.oof.FOO.
    const len = fieldName.length;
    const children = [];
    const pattern = /^\.[^.]+$/;
    for (const [name, field] of this._fields.entries()) {
      if (name.startsWith(fieldName)) {
        const finalPart = name.slice(len);
        if (finalPart.match(pattern)) {
          children.push(field);
        }
      }
    }
    return children;
  }

  getIcon() {
    /* Not implemented */
  }

  getLegalWarnings() {
    /* Not implemented */
  }

  getLinks() {
    /* Not implemented */
  }

  getNthFieldName(nIndex) {
    if (typeof nIndex === "object") {
      nIndex = nIndex.nIndex;
    }
    if (typeof nIndex !== "number") {
      throw new TypeError("Invalid field index: must be a number");
    }
    if (0 <= nIndex && nIndex < this.numFields) {
      return this._fieldNames[Math.trunc(nIndex)];
    }
    return null;
  }

  getNthTemplate() {
    return null;
  }

  getOCGs() {
    /* Not implemented */
  }

  getOCGOrder() {
    /* Not implemented */
  }

  getPageBox() {
    /* TODO */
  }

  getPageLabel() {
    /* TODO */
  }

  getPageNthWord() {
    /* TODO or not  */
  }

  getPageNthWordQuads() {
    /* TODO or not  */
  }

  getPageNumWords() {
    /* TODO or not */
  }

  getPageRotation() {
    /* TODO */
  }

  getPageTransition() {
    /* Not implemented */
  }

  getPrintParams() {
    if (!this._printParams) {
      this._printParams = new PrintParams({ lastPage: this._numPages - 1 });
    }
    return this._printParams;
  }

  getSound() {
    /* Not implemented */
  }

  getTemplate() {
    /* Not implemented */
  }

  getURL() {
    /* Not implemented because unsafe */
  }

  gotoNamedDest() {
    /* TODO */
  }

  importAnFDF() {
    /* Not implemented */
  }

  importAnXFDF() {
    /* Not implemented */
  }

  importDataObject() {
    /* Not implemented */
  }

  importIcon() {
    /* Not implemented */
  }

  importSound() {
    /* Not implemented */
  }

  importTextData() {
    /* Not implemented */
  }

  importXFAData() {
    /* Not implemented */
  }

  insertPages() {
    /* Not implemented */
  }

  mailDoc() {
    /* TODO or not */
  }

  mailForm() {
    /* TODO or not */
  }

  movePage() {
    /* Not implemented */
  }

  newPage() {
    /* Not implemented */
  }

  openDataObject() {
    /* Not implemented */
  }

  print(
    bUI = true,
    nStart = 0,
    nEnd = -1,
    bSilent = false,
    bShrinkToFit = false,
    bPrintAsImage = false,
    bReverse = false,
    bAnnotations = true,
    printParams = null
  ) {
    if (typeof bUI === "object") {
      nStart = bUI.nStart;
      nEnd = bUI.nEnd;
      bSilent = bUI.bSilent;
      bShrinkToFit = bUI.bShrinkToFit;
      bPrintAsImage = bUI.bPrintAsImage;
      bReverse = bUI.bReverse;
      bAnnotations = bUI.bAnnotations;
      printParams = bUI.printParams;
      bUI = bUI.bUI;
    }

    // TODO: for now just use nStart and nEnd
    // so need to see how to deal with the other params
    // (if possible)
    if (printParams) {
      nStart = printParams.firstPage;
      nEnd = printParams.lastPage;
    }

    if (typeof nStart === "number") {
      nStart = Math.max(0, Math.trunc(nStart));
    } else {
      nStart = 0;
    }

    if (typeof nEnd === "number") {
      nEnd = Math.max(0, Math.trunc(nEnd));
    } else {
      nEnd = -1;
    }

    this._send({ command: "print", start: nStart, end: nEnd });
  }

  removeDataObject() {
    /* Not implemented */
  }

  removeField() {
    /* TODO or not */
  }

  removeIcon() {
    /* Not implemented */
  }

  removeLinks() {
    /* Not implemented */
  }

  removeRequirement() {
    /* Not implemented */
  }

  removeScript() {
    /* Not implemented */
  }

  removeTemplate() {
    /* Not implemented */
  }

  removeThumbnails() {
    /* Not implemented */
  }

  removeWeblinks() {
    /* Not implemented */
  }

  replacePages() {
    /* Not implemented */
  }

  resetForm(aFields = null) {
    if (aFields && !Array.isArray(aFields) && typeof aFields === "object") {
      aFields = aFields.aFields;
    }
    let mustCalculate = false;
    if (aFields) {
      for (const fieldName of aFields) {
        if (!fieldName) {
          continue;
        }
        const field = this.getField(fieldName);
        if (!field) {
          continue;
        }
        field.value = field.defaultValue;
        field.valueAsString = field.value;
        mustCalculate = true;
      }
    } else {
      mustCalculate = this._fields.size !== 0;
      for (const field of this._fields.values()) {
        field.value = field.defaultValue;
        field.valueAsString = field.value;
      }
    }
    if (mustCalculate) {
      this.calculateNow();
    }
  }

  saveAs() {
    /* Not implemented */
  }

  scroll() {
    /* TODO */
  }

  selectPageNthWord() {
    /* TODO */
  }

  setAction() {
    /* TODO */
  }

  setDataObjectContents() {
    /* Not implemented */
  }

  setOCGOrder() {
    /* Not implemented */
  }

  setPageAction() {
    /* TODO */
  }

  setPageBoxes() {
    /* Not implemented */
  }

  setPageLabels() {
    /* Not implemented */
  }

  setPageRotations() {
    /* TODO */
  }

  setPageTabOrder() {
    /* Not implemented */
  }

  setPageTransitions() {
    /* Not implemented */
  }

  spawnPageFromTemplate() {
    /* Not implemented */
  }

  submitForm() {
    /* TODO or not */
  }

  syncAnnotScan() {
    /* Not implemented */
  }
}

export { Doc };
