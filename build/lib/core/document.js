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
exports.PDFDocument = exports.Page = void 0;

var _util = require("../shared/util.js");

var _obj = require("./obj.js");

var _primitives = require("./primitives.js");

var _core_utils = require("./core_utils.js");

var _stream = require("./stream.js");

var _annotation = require("./annotation.js");

var _crypto = require("./crypto.js");

var _parser = require("./parser.js");

var _operator_list = require("./operator_list.js");

var _evaluator = require("./evaluator.js");

var _function = require("./function.js");

const DEFAULT_USER_UNIT = 1.0;
const LETTER_SIZE_MEDIABOX = [0, 0, 612, 792];

function isAnnotationRenderable(annotation, intent) {
  return intent === "display" && annotation.viewable || intent === "print" && annotation.printable;
}

function isAnnotationRemoved(annotationsForRemoval, annotation) {
  if (!annotation || !annotation.data.annotationType) {
    return;
  }

  let data = annotation.data;
  return annotationsForRemoval.some(itm => itm === data.annotationType || itm === data.fieldType || itm === 'STx' && data.annotationType === 20 && data.fieldType === 'Tx' && !data.multiLine || itm === 'MTx' && data.annotationType === 20 && data.fieldType === 'Tx' && data.multiLine || itm === 'ABtn' && data.annotationType === 20 && data.fieldType === 'Btn' && !data.radioButton && !data.checkBox || itm === 'CBtn' && data.annotationType === 20 && data.fieldType === 'Btn' && data.checkBox || itm === 'RBtn' && data.annotationType === 20 && data.fieldType === 'Btn' && data.radioButton || itm === 'CCh' && data.annotationType === 20 && data.fieldType === 'Ch' && data.combo || itm === 'LCh' && data.annotationType === 20 && data.fieldType === 'Ch' && !data.combo);
}

class Page {
  constructor({
    pdfManager,
    xref,
    pageIndex,
    pageDict,
    ref,
    fontCache,
    builtInCMapCache,
    pdfFunctionFactory
  }) {
    this.pdfManager = pdfManager;
    this.pageIndex = pageIndex;
    this.pageDict = pageDict;
    this.xref = xref;
    this.ref = ref;
    this.fontCache = fontCache;
    this.builtInCMapCache = builtInCMapCache;
    this.pdfFunctionFactory = pdfFunctionFactory;
    this.evaluatorOptions = pdfManager.evaluatorOptions;
    this.resourcesPromise = null;
    const idCounters = {
      obj: 0
    };
    this.idFactory = {
      createObjId() {
        return `p${pageIndex}_${++idCounters.obj}`;
      },

      getDocId() {
        return `g_${pdfManager.docId}`;
      }

    };
  }

  _getInheritableProperty(key, getArray = false) {
    const value = (0, _core_utils.getInheritableProperty)({
      dict: this.pageDict,
      key,
      getArray,
      stopWhenFound: false
    });

    if (!Array.isArray(value)) {
      return value;
    }

    if (value.length === 1 || !(0, _primitives.isDict)(value[0])) {
      return value[0];
    }

    return _primitives.Dict.merge(this.xref, value);
  }

  get content() {
    return this.pageDict.get("Contents");
  }

  get resources() {
    return (0, _util.shadow)(this, "resources", this._getInheritableProperty("Resources") || _primitives.Dict.empty);
  }

  _getBoundingBox(name) {
    const box = this._getInheritableProperty(name, true);

    if (Array.isArray(box) && box.length === 4) {
      if (box[2] - box[0] !== 0 && box[3] - box[1] !== 0) {
        return box;
      }

      (0, _util.warn)(`Empty /${name} entry.`);
    }

    return null;
  }

  get mediaBox() {
    return (0, _util.shadow)(this, "mediaBox", this._getBoundingBox("MediaBox") || LETTER_SIZE_MEDIABOX);
  }

  get cropBox() {
    return (0, _util.shadow)(this, "cropBox", this._getBoundingBox("CropBox") || this.mediaBox);
  }

  get userUnit() {
    let obj = this.pageDict.get("UserUnit");

    if (!(0, _util.isNum)(obj) || obj <= 0) {
      obj = DEFAULT_USER_UNIT;
    }

    return (0, _util.shadow)(this, "userUnit", obj);
  }

  get view() {
    const {
      cropBox,
      mediaBox
    } = this;
    let view;

    if (cropBox === mediaBox || (0, _util.isArrayEqual)(cropBox, mediaBox)) {
      view = mediaBox;
    } else {
      const box = _util.Util.intersect(cropBox, mediaBox);

      if (box && box[2] - box[0] !== 0 && box[3] - box[1] !== 0) {
        view = box;
      } else {
        (0, _util.warn)("Empty /CropBox and /MediaBox intersection.");
      }
    }

    return (0, _util.shadow)(this, "view", view || mediaBox);
  }

  get rotate() {
    let rotate = this._getInheritableProperty("Rotate") || 0;

    if (rotate % 90 !== 0) {
      rotate = 0;
    } else if (rotate >= 360) {
      rotate = rotate % 360;
    } else if (rotate < 0) {
      rotate = (rotate % 360 + 360) % 360;
    }

    return (0, _util.shadow)(this, "rotate", rotate);
  }

  getContentStream() {
    const content = this.content;
    let stream;

    if (Array.isArray(content)) {
      const xref = this.xref;
      const streams = [];

      for (const stream of content) {
        streams.push(xref.fetchIfRef(stream));
      }

      stream = new _stream.StreamsSequenceStream(streams);
    } else if ((0, _primitives.isStream)(content)) {
      stream = content;
    } else {
      stream = new _stream.NullStream();
    }

    return stream;
  }

  loadResources(keys) {
    if (!this.resourcesPromise) {
      this.resourcesPromise = this.pdfManager.ensure(this, "resources");
    }

    return this.resourcesPromise.then(() => {
      const objectLoader = new _obj.ObjectLoader(this.resources, keys, this.xref);
      return objectLoader.load();
    });
  }

  getOperatorList({
    handler,
    sink,
    task,
    intent,
    renderInteractiveForms,
    annotationsNotRendered
  }) {
    const contentStreamPromise = this.pdfManager.ensure(this, "getContentStream");
    const resourcesPromise = this.loadResources(["ExtGState", "ColorSpace", "Pattern", "Shading", "XObject", "Font"]);
    const partialEvaluator = new _evaluator.PartialEvaluator({
      xref: this.xref,
      handler,
      pageIndex: this.pageIndex,
      idFactory: this.idFactory,
      fontCache: this.fontCache,
      builtInCMapCache: this.builtInCMapCache,
      options: this.evaluatorOptions,
      pdfFunctionFactory: this.pdfFunctionFactory
    });
    const dataPromises = Promise.all([contentStreamPromise, resourcesPromise]);
    const pageListPromise = dataPromises.then(([contentStream]) => {
      const opList = new _operator_list.OperatorList(intent, sink, this.pageIndex);
      handler.send("StartRenderPage", {
        transparency: partialEvaluator.hasBlendModes(this.resources),
        pageIndex: this.pageIndex,
        intent
      });
      return partialEvaluator.getOperatorList({
        stream: contentStream,
        task,
        resources: this.resources,
        operatorList: opList
      }).then(function () {
        return opList;
      });
    });
    return Promise.all([pageListPromise, this._parsedAnnotations]).then(function ([pageOpList, annotations]) {
      if (annotations.length === 0) {
        pageOpList.flush(true);
        return {
          length: pageOpList.totalLength
        };
      }

      const opListPromises = [];

      for (const annotation of annotations) {
        if (Array.isArray(annotationsNotRendered) && isAnnotationRemoved(annotationsNotRendered, annotation)) {
          continue;
        } else if (isAnnotationRenderable(annotation, intent)) {
          opListPromises.push(annotation.getOperatorList(partialEvaluator, task, renderInteractiveForms));
        }
      }

      return Promise.all(opListPromises).then(function (opLists) {
        pageOpList.addOp(_util.OPS.beginAnnotations, []);

        for (const opList of opLists) {
          pageOpList.addOpList(opList);
        }

        pageOpList.addOp(_util.OPS.endAnnotations, []);
        pageOpList.flush(true);
        return {
          length: pageOpList.totalLength
        };
      });
    });
  }

  extractTextContent({
    handler,
    task,
    normalizeWhitespace,
    sink,
    combineTextItems
  }) {
    const contentStreamPromise = this.pdfManager.ensure(this, "getContentStream");
    const resourcesPromise = this.loadResources(["ExtGState", "XObject", "Font"]);
    const dataPromises = Promise.all([contentStreamPromise, resourcesPromise]);
    return dataPromises.then(([contentStream]) => {
      const partialEvaluator = new _evaluator.PartialEvaluator({
        xref: this.xref,
        handler,
        pageIndex: this.pageIndex,
        idFactory: this.idFactory,
        fontCache: this.fontCache,
        builtInCMapCache: this.builtInCMapCache,
        options: this.evaluatorOptions,
        pdfFunctionFactory: this.pdfFunctionFactory
      });
      return partialEvaluator.getTextContent({
        stream: contentStream,
        task,
        resources: this.resources,
        normalizeWhitespace,
        combineTextItems,
        sink
      });
    });
  }

  getAnnotationsData(intent) {
    return this._parsedAnnotations.then(function (annotations) {
      const annotationsData = [];

      for (let i = 0, ii = annotations.length; i < ii; i++) {
        if (!intent || isAnnotationRenderable(annotations[i], intent)) {
          annotationsData.push(annotations[i].data);
        }
      }

      return annotationsData;
    });
  }

  get annotations() {
    return (0, _util.shadow)(this, "annotations", this._getInheritableProperty("Annots") || []);
  }

  get _parsedAnnotations() {
    const parsedAnnotations = this.pdfManager.ensure(this, "annotations").then(() => {
      const annotationRefs = this.annotations;
      const annotationPromises = [];

      for (let i = 0, ii = annotationRefs.length; i < ii; i++) {
        annotationPromises.push(_annotation.AnnotationFactory.create(this.xref, annotationRefs[i], this.pdfManager, this.idFactory));
      }

      return Promise.all(annotationPromises).then(function (annotations) {
        return annotations.filter(function isDefined(annotation) {
          return !!annotation;
        });
      }, function (reason) {
        (0, _util.warn)(`_parsedAnnotations: "${reason}".`);
        return [];
      });
    });
    return (0, _util.shadow)(this, "_parsedAnnotations", parsedAnnotations);
  }

}

exports.Page = Page;
const PDF_HEADER_SIGNATURE = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const STARTXREF_SIGNATURE = new Uint8Array([0x73, 0x74, 0x61, 0x72, 0x74, 0x78, 0x72, 0x65, 0x66]);
const ENDOBJ_SIGNATURE = new Uint8Array([0x65, 0x6e, 0x64, 0x6f, 0x62, 0x6a]);
const FINGERPRINT_FIRST_BYTES = 1024;
const EMPTY_FINGERPRINT = "\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00";
const PDF_HEADER_VERSION_REGEXP = /^[1-9]\.[0-9]$/;

function find(stream, signature, limit = 1024, backwards = false) {
  const signatureLength = signature.length;
  const scanBytes = stream.peekBytes(limit);
  const scanLength = scanBytes.length - signatureLength;

  if (scanLength <= 0) {
    return false;
  }

  if (backwards) {
    const signatureEnd = signatureLength - 1;
    let pos = scanBytes.length - 1;

    while (pos >= signatureEnd) {
      let j = 0;

      while (j < signatureLength && scanBytes[pos - j] === signature[signatureEnd - j]) {
        j++;
      }

      if (j >= signatureLength) {
        stream.pos += pos - signatureEnd;
        return true;
      }

      pos--;
    }
  } else {
    let pos = 0;

    while (pos <= scanLength) {
      let j = 0;

      while (j < signatureLength && scanBytes[pos + j] === signature[j]) {
        j++;
      }

      if (j >= signatureLength) {
        stream.pos += pos;
        return true;
      }

      pos++;
    }
  }

  return false;
}

class PDFDocument {
  constructor(pdfManager, arg) {
    let stream;

    if ((0, _primitives.isStream)(arg)) {
      stream = arg;
    } else if ((0, _util.isArrayBuffer)(arg)) {
      stream = new _stream.Stream(arg);
    } else {
      throw new Error("PDFDocument: Unknown argument type");
    }

    if (stream.length <= 0) {
      throw new _util.InvalidPDFException("The PDF file is empty, i.e. its size is zero bytes.");
    }

    this.pdfManager = pdfManager;
    this.stream = stream;
    this.xref = new _obj.XRef(stream, pdfManager);
    this.pdfFunctionFactory = new _function.PDFFunctionFactory({
      xref: this.xref,
      isEvalSupported: pdfManager.evaluatorOptions.isEvalSupported
    });
    this._pagePromises = [];
  }

  parse(recoveryMode) {
    this.setup(recoveryMode);
    const version = this.catalog.catDict.get("Version");

    if ((0, _primitives.isName)(version)) {
      this.pdfFormatVersion = version.name;
    }

    try {
      this.acroForm = this.catalog.catDict.get("AcroForm");

      if (this.acroForm) {
        this.xfa = this.acroForm.get("XFA");
        const fields = this.acroForm.get("Fields");

        if ((!Array.isArray(fields) || fields.length === 0) && !this.xfa) {
          this.acroForm = null;
        }
      }
    } catch (ex) {
      if (ex instanceof _core_utils.MissingDataException) {
        throw ex;
      }

      (0, _util.info)("Cannot fetch AcroForm entry; assuming no AcroForms are present");
      this.acroForm = null;
    }

    try {
      const collection = this.catalog.catDict.get("Collection");

      if ((0, _primitives.isDict)(collection) && collection.getKeys().length > 0) {
        this.collection = collection;
      }
    } catch (ex) {
      if (ex instanceof _core_utils.MissingDataException) {
        throw ex;
      }

      (0, _util.info)("Cannot fetch Collection dictionary.");
    }
  }

  get linearization() {
    let linearization = null;

    try {
      linearization = _parser.Linearization.create(this.stream);
    } catch (err) {
      if (err instanceof _core_utils.MissingDataException) {
        throw err;
      }

      (0, _util.info)(err);
    }

    return (0, _util.shadow)(this, "linearization", linearization);
  }

  get startXRef() {
    const stream = this.stream;
    let startXRef = 0;

    if (this.linearization) {
      stream.reset();

      if (find(stream, ENDOBJ_SIGNATURE)) {
        startXRef = stream.pos + 6 - stream.start;
      }
    } else {
      const step = 1024;
      const startXRefLength = STARTXREF_SIGNATURE.length;
      let found = false,
          pos = stream.end;

      while (!found && pos > 0) {
        pos -= step - startXRefLength;

        if (pos < 0) {
          pos = 0;
        }

        stream.pos = pos;
        found = find(stream, STARTXREF_SIGNATURE, step, true);
      }

      if (found) {
        stream.skip(9);
        let ch;

        do {
          ch = stream.getByte();
        } while ((0, _core_utils.isWhiteSpace)(ch));

        let str = "";

        while (ch >= 0x20 && ch <= 0x39) {
          str += String.fromCharCode(ch);
          ch = stream.getByte();
        }

        startXRef = parseInt(str, 10);

        if (isNaN(startXRef)) {
          startXRef = 0;
        }
      }
    }

    return (0, _util.shadow)(this, "startXRef", startXRef);
  }

  checkHeader() {
    const stream = this.stream;
    stream.reset();

    if (!find(stream, PDF_HEADER_SIGNATURE)) {
      return;
    }

    stream.moveStart();
    const MAX_PDF_VERSION_LENGTH = 12;
    let version = "",
        ch;

    while ((ch = stream.getByte()) > 0x20) {
      if (version.length >= MAX_PDF_VERSION_LENGTH) {
        break;
      }

      version += String.fromCharCode(ch);
    }

    if (!this.pdfFormatVersion) {
      this.pdfFormatVersion = version.substring(5);
    }
  }

  parseStartXRef() {
    this.xref.setStartXRef(this.startXRef);
  }

  setup(recoveryMode) {
    this.xref.parse(recoveryMode);
    this.catalog = new _obj.Catalog(this.pdfManager, this.xref);
  }

  get numPages() {
    const linearization = this.linearization;
    const num = linearization ? linearization.numPages : this.catalog.numPages;
    return (0, _util.shadow)(this, "numPages", num);
  }

  get documentInfo() {
    const DocumentInfoValidators = {
      Title: _util.isString,
      Author: _util.isString,
      Subject: _util.isString,
      Keywords: _util.isString,
      Creator: _util.isString,
      Producer: _util.isString,
      CreationDate: _util.isString,
      ModDate: _util.isString,
      Trapped: _primitives.isName
    };
    let version = this.pdfFormatVersion;

    if (typeof version !== "string" || !PDF_HEADER_VERSION_REGEXP.test(version)) {
      (0, _util.warn)(`Invalid PDF header version number: ${version}`);
      version = null;
    }

    const docInfo = {
      PDFFormatVersion: version,
      IsLinearized: !!this.linearization,
      IsAcroFormPresent: !!this.acroForm,
      IsXFAPresent: !!this.xfa,
      IsCollectionPresent: !!this.collection
    };
    let infoDict;

    try {
      infoDict = this.xref.trailer.get("Info");
    } catch (err) {
      if (err instanceof _core_utils.MissingDataException) {
        throw err;
      }

      (0, _util.info)("The document information dictionary is invalid.");
    }

    if ((0, _primitives.isDict)(infoDict)) {
      for (const key of infoDict.getKeys()) {
        const value = infoDict.get(key);

        if (DocumentInfoValidators[key]) {
          if (DocumentInfoValidators[key](value)) {
            docInfo[key] = typeof value !== "string" ? value : (0, _util.stringToPDFString)(value);
          } else {
            (0, _util.info)(`Bad value in document info for "${key}".`);
          }
        } else if (typeof key === "string") {
          let customValue;

          if ((0, _util.isString)(value)) {
            customValue = (0, _util.stringToPDFString)(value);
          } else if ((0, _primitives.isName)(value) || (0, _util.isNum)(value) || (0, _util.isBool)(value)) {
            customValue = value;
          } else {
            (0, _util.info)(`Unsupported value in document info for (custom) "${key}".`);
            continue;
          }

          if (!docInfo["Custom"]) {
            docInfo["Custom"] = Object.create(null);
          }

          docInfo["Custom"][key] = customValue;
        }
      }
    }

    return (0, _util.shadow)(this, "documentInfo", docInfo);
  }

  get fingerprint() {
    let hash;
    const idArray = this.xref.trailer.get("ID");

    if (Array.isArray(idArray) && idArray[0] && (0, _util.isString)(idArray[0]) && idArray[0] !== EMPTY_FINGERPRINT) {
      hash = (0, _util.stringToBytes)(idArray[0]);
    } else {
      hash = (0, _crypto.calculateMD5)(this.stream.getByteRange(0, FINGERPRINT_FIRST_BYTES), 0, FINGERPRINT_FIRST_BYTES);
    }

    const fingerprintBuf = [];

    for (let i = 0, ii = hash.length; i < ii; i++) {
      const hex = hash[i].toString(16);
      fingerprintBuf.push(hex.padStart(2, "0"));
    }

    return (0, _util.shadow)(this, "fingerprint", fingerprintBuf.join(""));
  }

  _getLinearizationPage(pageIndex) {
    const {
      catalog,
      linearization
    } = this;
    (0, _util.assert)(linearization && linearization.pageFirst === pageIndex);

    const ref = _primitives.Ref.get(linearization.objectNumberFirst, 0);

    return this.xref.fetchAsync(ref).then(obj => {
      if ((0, _primitives.isDict)(obj, "Page") || (0, _primitives.isDict)(obj) && !obj.has("Type") && obj.has("Contents")) {
        if (ref && !catalog.pageKidsCountCache.has(ref)) {
          catalog.pageKidsCountCache.put(ref, 1);
        }

        return [obj, ref];
      }

      throw new _util.FormatError("The Linearization dictionary doesn't point " + "to a valid Page dictionary.");
    }).catch(reason => {
      (0, _util.info)(reason);
      return catalog.getPageDict(pageIndex);
    });
  }

  getPage(pageIndex) {
    if (this._pagePromises[pageIndex] !== undefined) {
      return this._pagePromises[pageIndex];
    }

    const {
      catalog,
      linearization
    } = this;
    const promise = linearization && linearization.pageFirst === pageIndex ? this._getLinearizationPage(pageIndex) : catalog.getPageDict(pageIndex);
    return this._pagePromises[pageIndex] = promise.then(([pageDict, ref]) => {
      return new Page({
        pdfManager: this.pdfManager,
        xref: this.xref,
        pageIndex,
        pageDict,
        ref,
        fontCache: catalog.fontCache,
        builtInCMapCache: catalog.builtInCMapCache,
        pdfFunctionFactory: this.pdfFunctionFactory
      });
    });
  }

  checkFirstPage() {
    return this.getPage(0).catch(async reason => {
      if (reason instanceof _core_utils.XRefEntryException) {
        this._pagePromises.length = 0;
        await this.cleanup();
        throw new _core_utils.XRefParseException();
      }
    });
  }

  fontFallback(id, handler) {
    return this.catalog.fontFallback(id, handler);
  }

  async cleanup() {
    return this.catalog ? this.catalog.cleanup() : (0, _primitives.clearPrimitiveCaches)();
  }

}

exports.PDFDocument = PDFDocument;