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

import "./print_params.js";
import { zoomtype } from "./constants.js";

const DOC_EXTERNAL = false;

class InfoProxyHandler {
  static get(obj, prop) {
    return obj[prop.toLowerCase()];
  }

  static set(obj, prop, value) {
    throw new Error(`doc.info.${prop} is read-only`);
  }
}

globalThis.Doc = class Doc {
  static claimInternals() {
    delete Doc.claimInternals;
    return instance => ({
      setCalculateNow(v) {
        instance.#calculateNow = v;
      },
      get calculate() {
        return instance.#calculate;
      },
      initActions: instance.#initActions.bind(instance),
      dispatchDocEvent: instance.#dispatchDocEvent.bind(instance),
      dispatchPageEvent: instance.#dispatchPageEvent.bind(instance),
      getTerminalChildren: instance.#getTerminalChildren.bind(instance),
      addField: instance.#addField.bind(instance),
    });
  }

  #pageActions = null;

  #otherPageActions = null;

  // Private fields only accessed within this class.
  #baseURL;

  #calculate = true;

  #delay = false;

  #dirty = false;

  #disclosed = false;

  #media;

  #metadata;

  #noautocomplete;

  #nocache;

  #spellDictionaryOrder = [];

  #spellLanguageOrder = [];

  #printParams = null;

  #fields = new Map();

  #fieldNames = [];

  #author;

  #creator;

  #creationDate;

  #docID;

  #documentFileName;

  #filesize;

  #keywords;

  #layout;

  #modDate;

  #numFields = 0;

  #numPages;

  #pageNum;

  #producer;

  #securityHandler;

  #subject;

  #title;

  #URL;

  #info;

  #zoomType = zoomtype.none;

  #zoom;

  #actions;

  #globalEval;

  #getFieldPrivate;

  #send;

  #userActivationData;

  #calculateNow;

  constructor(data) {
    // In a script doc === this.
    // So adding a property to the doc means adding it to this

    this.#baseURL = data.baseURL || "";
    this.#metadata = data.metadata || "";
    this.#spellDictionaryOrder = [];
    this.#spellLanguageOrder = [];

    this.#author = data.Author || "";
    this.#creator = data.Creator || "";
    this.#creationDate = this.#getDate(data.CreationDate) || null;
    this.#docID = data.docID || ["", ""];
    this.#documentFileName = data.filename || "";
    this.#filesize = data.filesize || 0;
    this.#keywords = data.Keywords || "";
    this.#layout = data.layout || "";
    this.#modDate = this.#getDate(data.ModDate) || null;
    this.#numPages = data.numPages || 1;
    this.#pageNum = data.pageNum || 0;
    this.#producer = data.Producer || "";
    this.#securityHandler = data.EncryptFilterName || null;
    this.#subject = data.Subject || "";
    this.#title = data.Title || "";
    this.#URL = data.URL || "";

    // info has case insensitive properties
    // and they're are read-only.
    this.#info = new Proxy(
      {
        title: this.#title,
        author: this.#author,
        authors: data.authors || [this.#author],
        subject: this.#subject,
        keywords: this.#keywords,
        creator: this.#creator,
        producer: this.#producer,
        creationdate: this.#creationDate,
        moddate: this.#modDate,
        trapped: data.Trapped || "Unknown",
      },
      InfoProxyHandler
    );

    this.#zoom = data.zoom || 100;
    this.#actions = new Map(data.actions ? Object.entries(data.actions) : null);
    this.#globalEval = data.globalEval;
    this.#getFieldPrivate = data.getFieldPrivate;
    this.#send = data.send;
    this.#userActivationData = data.userActivationData;
    this.#printParams = new globalThis.PrintParams({
      lastPage: this.#numPages - 1,
    });
    delete globalThis.PrintParams;
  }

  #initActions() {
    for (const field of this.#fields.values()) {
      // Some fields may have compute their values so we need to send them
      // to the view.
      const fp = this.#getFieldPrivate(field);
      const initialValue = fp.getInitialValue(field);
      if (initialValue) {
        this.#send({
          id: fp.getId(field),
          siblings: fp.getSiblings(field),
          value: initialValue,
          formattedValue: field.value.toString(),
        });
      }
    }

    const dontRun = new Set([
      "WillClose",
      "WillSave",
      "DidSave",
      "WillPrint",
      "DidPrint",
      "OpenAction",
    ]);
    // When a pdf has just been opened it doesn't really make sense
    // to save it: it's up to the user to decide if they want to do that.
    // A pdf can contain an action /FooBar which will trigger a save
    // even if there are no WillSave/DidSave (which are themselves triggered
    // after a save).
    this.#userActivationData.disableSaving = true;
    for (const actionName of this.#actions.keys()) {
      if (!dontRun.has(actionName)) {
        this.#runActions(actionName);
      }
    }
    this.#runActions("OpenAction");
    this.#userActivationData.disableSaving = false;
  }

  #dispatchDocEvent(name) {
    switch (name) {
      case "Open":
        this.#userActivationData.disableSaving = true;
        this.#runActions("OpenAction");
        this.#userActivationData.disableSaving = false;
        break;
      case "WillPrint":
        this.#userActivationData.disablePrinting = true;
        try {
          this.#runActions(name);
        } catch (error) {
          this.#send(error);
        }
        this.#send({ command: "WillPrintFinished" });
        this.#userActivationData.disablePrinting = false;
        break;
      case "WillSave":
        this.#userActivationData.disableSaving = true;
        this.#runActions(name);
        this.#userActivationData.disableSaving = false;
        break;
      default:
        this.#runActions(name);
    }
  }

  #dispatchPageEvent(name, actions, pageNumber) {
    if (name === "PageOpen") {
      this.#pageActions ??= new Map();
      if (!this.#pageActions.has(pageNumber)) {
        this.#pageActions.set(
          pageNumber,
          new Map(actions ? Object.entries(actions) : null)
        );
      }
      this.#pageNum = pageNumber - 1;
    }

    for (const acts of [this.#pageActions, this.#otherPageActions]) {
      actions = acts?.get(pageNumber)?.get(name);
      if (actions) {
        for (const action of actions) {
          this.#globalEval(action);
        }
      }
    }
  }

  #runActions(name) {
    const actions = this.#actions.get(name);
    if (!actions) {
      return;
    }
    for (const action of actions) {
      try {
        this.#globalEval(action);
      } catch (error) {
        this.#send({
          toString() {
            return `Error when executing "${name}" for document\n${error.toString()}`;
          },
          stack: error.stack,
        });
      }
    }
  }

  #addField(name, field) {
    this.#fields.set(name, field);
    this.#fieldNames.push(name);
    this.#numFields++;

    // Fields on a page can have PageOpen/PageClose actions.
    const fp = this.#getFieldPrivate(field);
    const po = fp.getActions(field).get("PageOpen");
    const pc = fp.getActions(field).get("PageClose");
    if (po || pc) {
      this.#otherPageActions ??= new Map();
      const actions = this.#otherPageActions.getOrInsertComputed(
        fp.getPage(field) + 1,
        () => new Map()
      );
      const makeArr = () => [];
      if (po) {
        actions.getOrInsertComputed("PageOpen", makeArr).push(...po);
      }
      if (pc) {
        actions.getOrInsertComputed("PageClose", makeArr).push(...pc);
      }
    }
  }

  #getDate(date) {
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
    return this.#author;
  }

  set author(_) {
    throw new Error("doc.author is read-only");
  }

  get baseURL() {
    return this.#baseURL;
  }

  set baseURL(baseURL) {
    this.#baseURL = baseURL;
  }

  get bookmarkRoot() {
    return undefined;
  }

  set bookmarkRoot(_) {
    throw new Error("doc.bookmarkRoot is read-only");
  }

  get calculate() {
    return this.#calculate;
  }

  set calculate(calculate) {
    this.#calculate = calculate;
  }

  get creator() {
    return this.#creator;
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
    return this.#delay;
  }

  set delay(delay) {
    this.#delay = delay;
  }

  get dirty() {
    return this.#dirty;
  }

  set dirty(dirty) {
    this.#dirty = dirty;
  }

  get disclosed() {
    return this.#disclosed;
  }

  set disclosed(disclosed) {
    this.#disclosed = disclosed;
  }

  get docID() {
    return this.#docID;
  }

  set docID(_) {
    throw new Error("doc.docID is read-only");
  }

  get documentFileName() {
    return this.#documentFileName;
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
    // According to the specification this should be `true` in non-Acrobat
    // applications, however we ignore that to avoid bothering users with
    // an `alert`-dialog on document load (see issue 15509).
    return DOC_EXTERNAL;
  }

  set external(_) {
    throw new Error("doc.external is read-only");
  }

  get filesize() {
    return this.#filesize;
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
    return this.#info;
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
    return this.#keywords;
  }

  set keywords(_) {
    throw new Error("doc.keywords is read-only");
  }

  get layout() {
    return this.#layout;
  }

  set layout(value) {
    if (!this.#userActivationData.userActivation) {
      return;
    }
    this.#userActivationData.userActivation = false;

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
    this.#send({ command: "layout", value });
    this.#layout = value;
  }

  get media() {
    return this.#media;
  }

  set media(media) {
    this.#media = media;
  }

  get metadata() {
    return this.#metadata;
  }

  set metadata(metadata) {
    this.#metadata = metadata;
  }

  get modDate() {
    return this.#modDate;
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
    return this.#noautocomplete;
  }

  set noautocomplete(noautocomplete) {
    this.#noautocomplete = noautocomplete;
  }

  get nocache() {
    return this.#nocache;
  }

  set nocache(nocache) {
    this.#nocache = nocache;
  }

  get numFields() {
    return this.#numFields;
  }

  set numFields(_) {
    throw new Error("doc.numFields is read-only");
  }

  get numPages() {
    return this.#numPages;
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
    return this.#pageNum;
  }

  set pageNum(value) {
    if (!this.#userActivationData.userActivation) {
      return;
    }
    this.#userActivationData.userActivation = false;

    if (typeof value !== "number" || value < 0 || value >= this.#numPages) {
      return;
    }
    this.#send({ command: "page-num", value });
    this.#pageNum = value;
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
    return this.#producer;
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
    return this.#securityHandler;
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
    return this.#spellDictionaryOrder;
  }

  set spellDictionaryOrder(spellDictionaryOrder) {
    this.#spellDictionaryOrder = spellDictionaryOrder;
  }

  get spellLanguageOrder() {
    return this.#spellLanguageOrder;
  }

  set spellLanguageOrder(spellLanguageOrder) {
    this.#spellLanguageOrder = spellLanguageOrder;
  }

  get subject() {
    return this.#subject;
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
    return this.#title;
  }

  set title(_) {
    throw new Error("doc.title is read-only");
  }

  get URL() {
    return this.#URL;
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
    return undefined;
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
    return this.#zoomType;
  }

  set zoomType(type) {
    if (!this.#userActivationData.userActivation) {
      return;
    }
    this.#userActivationData.userActivation = false;

    if (typeof type !== "string") {
      return;
    }
    switch (type) {
      case zoomtype.none:
        this.#send({ command: "zoom", value: 1 });
        break;
      case zoomtype.fitP:
        this.#send({ command: "zoom", value: "page-fit" });
        break;
      case zoomtype.fitW:
        this.#send({ command: "zoom", value: "page-width" });
        break;
      case zoomtype.fitH:
        this.#send({ command: "zoom", value: "page-height" });
        break;
      case zoomtype.fitV:
        this.#send({ command: "zoom", value: "auto" });
        break;
      case zoomtype.pref:
      case zoomtype.refW:
        break;
      default:
        return;
    }

    this.#zoomType = type;
  }

  get zoom() {
    return this.#zoom;
  }

  set zoom(value) {
    if (!this.#userActivationData.userActivation) {
      return;
    }
    this.#userActivationData.userActivation = false;

    if (typeof value !== "number" || value < 8.33 || value > 6400) {
      return;
    }

    this.#send({ command: "zoom", value: value / 100 });
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
    this.#calculateNow();
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

  #getField(cName) {
    if (cName && typeof cName === "object") {
      cName = cName.cName;
    }
    if (typeof cName !== "string") {
      throw new TypeError("Invalid field name: must be a string");
    }
    const searchedField = this.#fields.get(cName);
    if (searchedField) {
      return searchedField;
    }

    const parts = cName.split("#");
    let childIndex = NaN;
    if (parts.length === 2) {
      childIndex = Math.floor(parseFloat(parts[1]));
      cName = parts[0];
    }

    for (const [name, field] of this.#fields) {
      if (name.endsWith(cName)) {
        if (!isNaN(childIndex)) {
          const children = this.#getChildren(name);
          if (childIndex < 0 || childIndex >= children.length) {
            childIndex = 0;
          }
          if (childIndex < children.length) {
            this.#fields.set(cName, children[childIndex]);
            return children[childIndex];
          }
        }
        this.#fields.set(cName, field);
        return field;
      }
    }

    return null;
  }

  getField(cName) {
    const field = this.#getField(cName);
    if (!field) {
      return null;
    }
    return field;
  }

  #getChildren(fieldName) {
    // Children of foo.bar are foo.bar.oof, foo.bar.rab
    // but not foo.bar.oof.FOO.
    const len = fieldName.length;
    const children = [];
    const pattern = /^\.[^.]+$/;
    for (const [name, field] of this.#fields) {
      if (name.startsWith(fieldName)) {
        const finalPart = name.slice(len);
        if (pattern.test(finalPart)) {
          children.push(field);
        }
      }
    }
    return children;
  }

  #getTerminalChildren(fieldName) {
    // Get all the descendants which have a value.
    const children = [];
    const len = fieldName.length;
    for (const [name, field] of this.#fields) {
      if (name.startsWith(fieldName)) {
        const finalPart = name.slice(len);
        if (
          this.#getFieldPrivate(field).getHasValue(field) &&
          (finalPart === "" || finalPart.startsWith("."))
        ) {
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
    if (nIndex && typeof nIndex === "object") {
      nIndex = nIndex.nIndex;
    }
    if (typeof nIndex !== "number") {
      throw new TypeError("Invalid field index: must be a number");
    }
    if (0 <= nIndex && nIndex < this.numFields) {
      return this.#fieldNames[Math.trunc(nIndex)];
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
    return this.#printParams;
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
    if (
      this.#userActivationData.disablePrinting ||
      !this.#userActivationData.userActivation
    ) {
      return;
    }
    this.#userActivationData.userActivation = false;

    if (bUI && typeof bUI === "object") {
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

    nStart = typeof nStart === "number" ? Math.max(0, Math.trunc(nStart)) : 0;

    nEnd = typeof nEnd === "number" ? Math.max(0, Math.trunc(nEnd)) : -1;

    this.#send({ command: "print", start: nStart, end: nEnd });
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
    // Handle the case resetForm({ aFields: ... })
    if (aFields && typeof aFields === "object" && !Array.isArray(aFields)) {
      aFields = aFields.aFields;
    }

    if (aFields && !Array.isArray(aFields)) {
      aFields = [aFields];
    }

    let mustCalculate = false;
    let fieldsToReset;
    if (aFields) {
      fieldsToReset = [];
      for (const fieldName of aFields) {
        if (!fieldName) {
          continue;
        }
        if (typeof fieldName !== "string") {
          // In Acrobat if a fieldName is not a string all the fields are reset.
          fieldsToReset = null;
          break;
        }
        const field = this.#getField(fieldName);
        if (!field) {
          continue;
        }
        fieldsToReset.push(field);
        mustCalculate = true;
      }
    }

    if (!fieldsToReset) {
      fieldsToReset = this.#fields.values();
      mustCalculate = this.#fields.size !== 0;
    }

    for (const field of fieldsToReset) {
      field.value = field.defaultValue;
      this.#send({
        id: this.#getFieldPrivate(field).getId(field),
        siblings: this.#getFieldPrivate(field).getSiblings(field),
        value: field.defaultValue,
        formattedValue: null,
        selRange: [0, 0],
      });
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
};

export {};
