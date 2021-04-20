/* Copyright 2012 Mozilla Foundation
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

import {
  assert,
  bytesToString,
  FormatError,
  info,
  InvalidPDFException,
  isArrayBuffer,
  isArrayEqual,
  isBool,
  isNum,
  isString,
  OPS,
  PageActionEventType,
  shadow,
  stringToBytes,
  stringToPDFString,
  stringToUTF8String,
  unreachable,
  Util,
  warn,
} from "../shared/util.js";
import {
  clearPrimitiveCaches,
  Dict,
  isDict,
  isName,
  isRef,
  isStream,
  Name,
  Ref,
} from "./primitives.js";
import {
  collectActions,
  getInheritableProperty,
  isWhiteSpace,
  MissingDataException,
  validateCSSFont,
  XRefEntryException,
  XRefParseException,
} from "./core_utils.js";
import { NullStream, Stream, StreamsSequenceStream } from "./stream.js";
import { AnnotationFactory } from "./annotation.js";
import { calculateMD5 } from "./crypto.js";
import { Catalog } from "./catalog.js";
import { Linearization } from "./parser.js";
import { ObjectLoader } from "./object_loader.js";
import { OperatorList } from "./operator_list.js";
import { PartialEvaluator } from "./evaluator.js";
import { StructTreePage } from "./struct_tree.js";
import { XFAFactory } from "./xfa/factory.js";
import { XRef } from "./xref.js";

const DEFAULT_USER_UNIT = 1.0;
const LETTER_SIZE_MEDIABOX = [0, 0, 612, 792];

function isAnnotationRenderable(annotation, intent) {
  return (
    (intent === "display" && annotation.viewable) ||
    (intent === "print" && annotation.printable)
  );
}

class Page {
  constructor({
    pdfManager,
    xref,
    pageIndex,
    pageDict,
    ref,
    globalIdFactory,
    fontCache,
    builtInCMapCache,
    globalImageCache,
    nonBlendModesSet,
    xfaFactory,
  }) {
    this.pdfManager = pdfManager;
    this.pageIndex = pageIndex;
    this.pageDict = pageDict;
    this.xref = xref;
    this.ref = ref;
    this.fontCache = fontCache;
    this.builtInCMapCache = builtInCMapCache;
    this.globalImageCache = globalImageCache;
    this.nonBlendModesSet = nonBlendModesSet;
    this.evaluatorOptions = pdfManager.evaluatorOptions;
    this.resourcesPromise = null;
    this.xfaFactory = xfaFactory;

    const idCounters = {
      obj: 0,
    };
    this._localIdFactory = class extends globalIdFactory {
      static createObjId() {
        return `p${pageIndex}_${++idCounters.obj}`;
      }

      static getPageObjId() {
        return `page${ref.toString()}`;
      }
    };
  }

  /**
   * @private
   */
  _getInheritableProperty(key, getArray = false) {
    const value = getInheritableProperty({
      dict: this.pageDict,
      key,
      getArray,
      stopWhenFound: false,
    });
    if (!Array.isArray(value)) {
      return value;
    }
    if (value.length === 1 || !isDict(value[0])) {
      return value[0];
    }
    return Dict.merge({ xref: this.xref, dictArray: value });
  }

  get content() {
    return this.pageDict.get("Contents");
  }

  get resources() {
    // For robustness: The spec states that a \Resources entry has to be
    // present, but can be empty. Some documents still omit it; in this case
    // we return an empty dictionary.
    return shadow(
      this,
      "resources",
      this._getInheritableProperty("Resources") || Dict.empty
    );
  }

  _getBoundingBox(name) {
    if (this.xfaData) {
      const { width, height } = this.xfaData.attributes.style;
      return [0, 0, parseInt(width), parseInt(height)];
    }

    const box = this._getInheritableProperty(name, /* getArray = */ true);

    if (Array.isArray(box) && box.length === 4) {
      if (box[2] - box[0] !== 0 && box[3] - box[1] !== 0) {
        return box;
      }
      warn(`Empty /${name} entry.`);
    }
    return null;
  }

  get mediaBox() {
    // Reset invalid media box to letter size.
    return shadow(
      this,
      "mediaBox",
      this._getBoundingBox("MediaBox") || LETTER_SIZE_MEDIABOX
    );
  }

  get cropBox() {
    // Reset invalid crop box to media box.
    return shadow(
      this,
      "cropBox",
      this._getBoundingBox("CropBox") || this.mediaBox
    );
  }

  get userUnit() {
    let obj = this.pageDict.get("UserUnit");
    if (!isNum(obj) || obj <= 0) {
      obj = DEFAULT_USER_UNIT;
    }
    return shadow(this, "userUnit", obj);
  }

  get view() {
    // From the spec, 6th ed., p.963:
    // "The crop, bleed, trim, and art boxes should not ordinarily
    // extend beyond the boundaries of the media box. If they do, they are
    // effectively reduced to their intersection with the media box."
    const { cropBox, mediaBox } = this;
    let view;
    if (cropBox === mediaBox || isArrayEqual(cropBox, mediaBox)) {
      view = mediaBox;
    } else {
      const box = Util.intersect(cropBox, mediaBox);
      if (box && box[2] - box[0] !== 0 && box[3] - box[1] !== 0) {
        view = box;
      } else {
        warn("Empty /CropBox and /MediaBox intersection.");
      }
    }
    return shadow(this, "view", view || mediaBox);
  }

  get rotate() {
    let rotate = this._getInheritableProperty("Rotate") || 0;

    // Normalize rotation so it's a multiple of 90 and between 0 and 270.
    if (rotate % 90 !== 0) {
      rotate = 0;
    } else if (rotate >= 360) {
      rotate = rotate % 360;
    } else if (rotate < 0) {
      // The spec doesn't cover negatives. Assume it's counterclockwise
      // rotation. The following is the other implementation of modulo.
      rotate = ((rotate % 360) + 360) % 360;
    }
    return shadow(this, "rotate", rotate);
  }

  getContentStream() {
    const content = this.content;
    let stream;

    if (Array.isArray(content)) {
      // Fetching the individual streams from the array.
      const xref = this.xref;
      const streams = [];
      for (const subStream of content) {
        streams.push(xref.fetchIfRef(subStream));
      }
      stream = new StreamsSequenceStream(streams);
    } else if (isStream(content)) {
      stream = content;
    } else {
      // Replace non-existent page content with empty content.
      stream = new NullStream();
    }
    return stream;
  }

  get xfaData() {
    if (this.xfaFactory) {
      return shadow(this, "xfaData", this.xfaFactory.getPage(this.pageIndex));
    }
    return shadow(this, "xfaData", null);
  }

  save(handler, task, annotationStorage) {
    const partialEvaluator = new PartialEvaluator({
      xref: this.xref,
      handler,
      pageIndex: this.pageIndex,
      idFactory: this._localIdFactory,
      fontCache: this.fontCache,
      builtInCMapCache: this.builtInCMapCache,
      globalImageCache: this.globalImageCache,
      options: this.evaluatorOptions,
    });

    // Fetch the page's annotations and save the content
    // in case of interactive form fields.
    return this._parsedAnnotations.then(function (annotations) {
      const newRefsPromises = [];
      for (const annotation of annotations) {
        if (!isAnnotationRenderable(annotation, "print")) {
          continue;
        }
        newRefsPromises.push(
          annotation
            .save(partialEvaluator, task, annotationStorage)
            .catch(function (reason) {
              warn(
                "save - ignoring annotation data during " +
                  `"${task.name}" task: "${reason}".`
              );
              return null;
            })
        );
      }

      return Promise.all(newRefsPromises);
    });
  }

  loadResources(keys) {
    if (!this.resourcesPromise) {
      // TODO: add async `_getInheritableProperty` and remove this.
      this.resourcesPromise = this.pdfManager.ensure(this, "resources");
    }
    return this.resourcesPromise.then(() => {
      const objectLoader = new ObjectLoader(this.resources, keys, this.xref);
      return objectLoader.load();
    });
  }

  getOperatorList({
    handler,
    sink,
    task,
    intent,
    renderInteractiveForms,
    annotationStorage,
  }) {
    const contentStreamPromise = this.pdfManager.ensure(
      this,
      "getContentStream"
    );
    const resourcesPromise = this.loadResources([
      "ColorSpace",
      "ExtGState",
      "Font",
      "Pattern",
      "Properties",
      "Shading",
      "XObject",
    ]);

    const partialEvaluator = new PartialEvaluator({
      xref: this.xref,
      handler,
      pageIndex: this.pageIndex,
      idFactory: this._localIdFactory,
      fontCache: this.fontCache,
      builtInCMapCache: this.builtInCMapCache,
      globalImageCache: this.globalImageCache,
      options: this.evaluatorOptions,
    });

    const dataPromises = Promise.all([contentStreamPromise, resourcesPromise]);
    const pageListPromise = dataPromises.then(([contentStream]) => {
      const opList = new OperatorList(intent, sink);

      handler.send("StartRenderPage", {
        transparency: partialEvaluator.hasBlendModes(
          this.resources,
          this.nonBlendModesSet
        ),
        pageIndex: this.pageIndex,
        intent,
      });

      return partialEvaluator
        .getOperatorList({
          stream: contentStream,
          task,
          resources: this.resources,
          operatorList: opList,
        })
        .then(function () {
          return opList;
        });
    });

    // Fetch the page's annotations and add their operator lists to the
    // page's operator list to render them.
    return Promise.all([pageListPromise, this._parsedAnnotations]).then(
      function ([pageOpList, annotations]) {
        if (annotations.length === 0) {
          pageOpList.flush(true);
          return { length: pageOpList.totalLength };
        }

        // Collect the operator list promises for the annotations. Each promise
        // is resolved with the complete operator list for a single annotation.
        const opListPromises = [];
        for (const annotation of annotations) {
          if (
            isAnnotationRenderable(annotation, intent) &&
            !annotation.isHidden(annotationStorage)
          ) {
            opListPromises.push(
              annotation
                .getOperatorList(
                  partialEvaluator,
                  task,
                  renderInteractiveForms,
                  annotationStorage
                )
                .catch(function (reason) {
                  warn(
                    "getOperatorList - ignoring annotation data during " +
                      `"${task.name}" task: "${reason}".`
                  );
                  return null;
                })
            );
          }
        }

        return Promise.all(opListPromises).then(function (opLists) {
          pageOpList.addOp(OPS.beginAnnotations, []);
          for (const opList of opLists) {
            pageOpList.addOpList(opList);
          }
          pageOpList.addOp(OPS.endAnnotations, []);
          pageOpList.flush(true);
          return { length: pageOpList.totalLength };
        });
      }
    );
  }

  extractTextContent({
    handler,
    task,
    normalizeWhitespace,
    includeMarkedContent,
    sink,
    combineTextItems,
  }) {
    const contentStreamPromise = this.pdfManager.ensure(
      this,
      "getContentStream"
    );
    const resourcesPromise = this.loadResources([
      "ExtGState",
      "Font",
      "Properties",
      "XObject",
    ]);

    const dataPromises = Promise.all([contentStreamPromise, resourcesPromise]);
    return dataPromises.then(([contentStream]) => {
      const partialEvaluator = new PartialEvaluator({
        xref: this.xref,
        handler,
        pageIndex: this.pageIndex,
        idFactory: this._localIdFactory,
        fontCache: this.fontCache,
        builtInCMapCache: this.builtInCMapCache,
        globalImageCache: this.globalImageCache,
        options: this.evaluatorOptions,
      });

      return partialEvaluator.getTextContent({
        stream: contentStream,
        task,
        resources: this.resources,
        normalizeWhitespace,
        includeMarkedContent,
        combineTextItems,
        sink,
      });
    });
  }

  async getStructTree() {
    const structTreeRoot = await this.pdfManager.ensureCatalog(
      "structTreeRoot"
    );
    if (!structTreeRoot) {
      return null;
    }
    const structTree = await this.pdfManager.ensure(this, "_parseStructTree", [
      structTreeRoot,
    ]);
    return structTree.serializable;
  }

  /**
   * @private
   */
  _parseStructTree(structTreeRoot) {
    const tree = new StructTreePage(structTreeRoot, this.pageDict);
    tree.parse();
    return tree;
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
    const annots = this._getInheritableProperty("Annots");
    return shadow(this, "annotations", Array.isArray(annots) ? annots : []);
  }

  get _parsedAnnotations() {
    const parsedAnnotations = this.pdfManager
      .ensure(this, "annotations")
      .then(() => {
        const annotationPromises = [];
        for (const annotationRef of this.annotations) {
          annotationPromises.push(
            AnnotationFactory.create(
              this.xref,
              annotationRef,
              this.pdfManager,
              this._localIdFactory,
              /* collectFields */ false
            ).catch(function (reason) {
              warn(`_parsedAnnotations: "${reason}".`);
              return null;
            })
          );
        }

        return Promise.all(annotationPromises).then(function (annotations) {
          return annotations.filter(annotation => !!annotation);
        });
      });

    return shadow(this, "_parsedAnnotations", parsedAnnotations);
  }

  get jsActions() {
    const actions = collectActions(
      this.xref,
      this.pageDict,
      PageActionEventType
    );
    return shadow(this, "jsActions", actions);
  }
}

const PDF_HEADER_SIGNATURE = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
// prettier-ignore
const STARTXREF_SIGNATURE = new Uint8Array([
  0x73, 0x74, 0x61, 0x72, 0x74, 0x78, 0x72, 0x65, 0x66]);
const ENDOBJ_SIGNATURE = new Uint8Array([0x65, 0x6e, 0x64, 0x6f, 0x62, 0x6a]);

const FINGERPRINT_FIRST_BYTES = 1024;
const EMPTY_FINGERPRINT =
  "\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00";

const PDF_HEADER_VERSION_REGEXP = /^[1-9]\.[0-9]$/;

function find(stream, signature, limit = 1024, backwards = false) {
  if (
    typeof PDFJSDev === "undefined" ||
    PDFJSDev.test("!PRODUCTION || TESTING")
  ) {
    assert(limit > 0, 'The "limit" must be a positive integer.');
  }
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
      while (
        j < signatureLength &&
        scanBytes[pos - j] === signature[signatureEnd - j]
      ) {
        j++;
      }
      if (j >= signatureLength) {
        // `signature` found.
        stream.pos += pos - signatureEnd;
        return true;
      }
      pos--;
    }
  } else {
    // forwards
    let pos = 0;
    while (pos <= scanLength) {
      let j = 0;
      while (j < signatureLength && scanBytes[pos + j] === signature[j]) {
        j++;
      }
      if (j >= signatureLength) {
        // `signature` found.
        stream.pos += pos;
        return true;
      }
      pos++;
    }
  }
  return false;
}

/**
 * The `PDFDocument` class holds all the (worker-thread) data of the PDF file.
 */
class PDFDocument {
  constructor(pdfManager, arg) {
    let stream;
    if (isStream(arg)) {
      stream = arg;
    } else if (isArrayBuffer(arg)) {
      stream = new Stream(arg);
    } else {
      throw new Error("PDFDocument: Unknown argument type");
    }
    if (stream.length <= 0) {
      throw new InvalidPDFException(
        "The PDF file is empty, i.e. its size is zero bytes."
      );
    }

    this.pdfManager = pdfManager;
    this.stream = stream;
    this.xref = new XRef(stream, pdfManager);
    this._pagePromises = [];
    this._version = null;

    const idCounters = {
      font: 0,
    };
    this._globalIdFactory = class {
      static getDocId() {
        return `g_${pdfManager.docId}`;
      }

      static createFontId() {
        return `f${++idCounters.font}`;
      }

      static createObjId() {
        unreachable("Abstract method `createObjId` called.");
      }

      static getPageObjId() {
        unreachable("Abstract method `getPageObjId` called.");
      }
    };
  }

  parse(recoveryMode) {
    this.xref.parse(recoveryMode);
    this.catalog = new Catalog(this.pdfManager, this.xref);

    // The `checkHeader` method is called before this method and parses the
    // version from the header. The specification states in section 7.5.2
    // that the version from the catalog, if present, should overwrite the
    // version from the header.
    if (this.catalog.version) {
      this._version = this.catalog.version;
    }
  }

  get linearization() {
    let linearization = null;
    try {
      linearization = Linearization.create(this.stream);
    } catch (err) {
      if (err instanceof MissingDataException) {
        throw err;
      }
      info(err);
    }
    return shadow(this, "linearization", linearization);
  }

  get startXRef() {
    const stream = this.stream;
    let startXRef = 0;

    if (this.linearization) {
      // Find the end of the first object.
      stream.reset();
      if (find(stream, ENDOBJ_SIGNATURE)) {
        startXRef = stream.pos + 6 - stream.start;
      }
    } else {
      // Find `startxref` by checking backwards from the end of the file.
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
        } while (isWhiteSpace(ch));
        let str = "";
        while (ch >= /* Space = */ 0x20 && ch <= /* '9' = */ 0x39) {
          str += String.fromCharCode(ch);
          ch = stream.getByte();
        }
        startXRef = parseInt(str, 10);
        if (isNaN(startXRef)) {
          startXRef = 0;
        }
      }
    }
    return shadow(this, "startXRef", startXRef);
  }

  // Find the header, get the PDF format version and setup the
  // stream to start from the header.
  checkHeader() {
    const stream = this.stream;
    stream.reset();

    if (!find(stream, PDF_HEADER_SIGNATURE)) {
      // May not be a PDF file, but don't throw an error and let
      // parsing continue.
      return;
    }
    stream.moveStart();

    // Read the PDF format version.
    const MAX_PDF_VERSION_LENGTH = 12;
    let version = "",
      ch;
    while ((ch = stream.getByte()) > /* Space = */ 0x20) {
      if (version.length >= MAX_PDF_VERSION_LENGTH) {
        break;
      }
      version += String.fromCharCode(ch);
    }
    if (!this._version) {
      // Remove the "%PDF-" prefix.
      this._version = version.substring(5);
    }
  }

  parseStartXRef() {
    this.xref.setStartXRef(this.startXRef);
  }

  get numPages() {
    if (this.xfaFactory) {
      return shadow(this, "numPages", this.xfaFactory.numberPages);
    }
    const linearization = this.linearization;
    const num = linearization ? linearization.numPages : this.catalog.numPages;
    return shadow(this, "numPages", num);
  }

  /**
   * @private
   */
  _hasOnlyDocumentSignatures(fields, recursionDepth = 0) {
    const RECURSION_LIMIT = 10;

    if (!Array.isArray(fields)) {
      return false;
    }
    return fields.every(field => {
      field = this.xref.fetchIfRef(field);
      if (!(field instanceof Dict)) {
        return false;
      }
      if (field.has("Kids")) {
        if (++recursionDepth > RECURSION_LIMIT) {
          warn("_hasOnlyDocumentSignatures: maximum recursion depth reached");
          return false;
        }
        return this._hasOnlyDocumentSignatures(
          field.get("Kids"),
          recursionDepth
        );
      }
      const isSignature = isName(field.get("FT"), "Sig");
      const rectangle = field.get("Rect");
      const isInvisible =
        Array.isArray(rectangle) && rectangle.every(value => value === 0);
      return isSignature && isInvisible;
    });
  }

  get xfaData() {
    const acroForm = this.catalog.acroForm;
    if (!acroForm) {
      return null;
    }

    const xfa = acroForm.get("XFA");
    const entries = {
      "xdp:xdp": "",
      template: "",
      datasets: "",
      config: "",
      connectionSet: "",
      localeSet: "",
      stylesheet: "",
      "/xdp:xdp": "",
    };
    if (isStream(xfa) && !xfa.isEmpty) {
      try {
        entries["xdp:xdp"] = stringToUTF8String(bytesToString(xfa.getBytes()));
        return entries;
      } catch (_) {
        warn("XFA - Invalid utf-8 string.");
        return null;
      }
    }

    if (!Array.isArray(xfa) || xfa.length === 0) {
      return null;
    }

    for (let i = 0, ii = xfa.length; i < ii; i += 2) {
      let name;
      if (i === 0) {
        name = "xdp:xdp";
      } else if (i === ii - 2) {
        name = "/xdp:xdp";
      } else {
        name = xfa[i];
      }

      if (!entries.hasOwnProperty(name)) {
        continue;
      }
      const data = this.xref.fetchIfRef(xfa[i + 1]);
      if (!isStream(data) || data.isEmpty) {
        continue;
      }
      try {
        entries[name] = stringToUTF8String(bytesToString(data.getBytes()));
      } catch (_) {
        warn("XFA - Invalid utf-8 string.");
        return null;
      }
    }
    return entries;
  }

  get xfaFactory() {
    if (
      this.pdfManager.enableXfa &&
      this.formInfo.hasXfa &&
      !this.formInfo.hasAcroForm
    ) {
      const data = this.xfaData;
      return shadow(this, "xfaFactory", data ? new XFAFactory(data) : null);
    }
    return shadow(this, "xfaFaxtory", null);
  }

  get isPureXfa() {
    return this.xfaFactory !== null;
  }

  async loadXfaFonts(handler, task) {
    const acroForm = await this.pdfManager.ensureCatalog("acroForm");
    if (!acroForm) {
      return;
    }
    const resources = await acroForm.getAsync("DR");
    if (!(resources instanceof Dict)) {
      return;
    }
    const objectLoader = new ObjectLoader(resources, ["Font"], this.xref);
    await objectLoader.load();

    const fontRes = resources.get("Font");
    if (!(fontRes instanceof Dict)) {
      return;
    }

    const partialEvaluator = new PartialEvaluator({
      xref: this.xref,
      handler,
      pageIndex: -1,
      idFactory: this._globalIdFactory,
      fontCache: this.catalog.fontCache,
      builtInCMapCache: this.catalog.builtInCMapCache,
    });
    const operatorList = new OperatorList();
    const initialState = {
      font: null,
      clone() {
        return this;
      },
    };

    const fonts = new Map();
    fontRes.forEach((fontName, font) => {
      fonts.set(fontName, font);
    });
    const promises = [];

    for (const [fontName, font] of fonts) {
      const descriptor = font.get("FontDescriptor");
      if (!(descriptor instanceof Dict)) {
        continue;
      }
      const fontFamily = descriptor.get("FontFamily");
      const fontWeight = descriptor.get("FontWeight");
      const italicAngle = descriptor.get("ItalicAngle");
      const cssFontInfo = { fontFamily, fontWeight, italicAngle };

      if (!validateCSSFont(cssFontInfo)) {
        continue;
      }
      promises.push(
        partialEvaluator
          .handleSetFont(
            resources,
            [Name.get(fontName), 1],
            /* fontRef = */ null,
            operatorList,
            task,
            initialState,
            /* fallbackFontDict = */ null,
            /* cssFontInfo = */ cssFontInfo
          )
          .catch(function (reason) {
            warn(`loadXfaFonts: "${reason}".`);
            return null;
          })
      );
    }
    await Promise.all(promises);
  }

  get formInfo() {
    const formInfo = {
      hasFields: false,
      hasAcroForm: false,
      hasXfa: false,
      hasSignatures: false,
    };
    const acroForm = this.catalog.acroForm;
    if (!acroForm) {
      return shadow(this, "formInfo", formInfo);
    }

    try {
      const fields = acroForm.get("Fields");
      const hasFields = Array.isArray(fields) && fields.length > 0;
      formInfo.hasFields = hasFields; // Used by the `fieldObjects` getter.

      // The document contains XFA data if the `XFA` entry is a non-empty
      // array or stream.
      const xfa = acroForm.get("XFA");
      formInfo.hasXfa =
        (Array.isArray(xfa) && xfa.length > 0) ||
        (isStream(xfa) && !xfa.isEmpty);

      // The document contains AcroForm data if the `Fields` entry is a
      // non-empty array and it doesn't consist of only document signatures.
      // This second check is required for files that don't actually contain
      // AcroForm data (only XFA data), but that use the `Fields` entry to
      // store (invisible) document signatures. This can be detected using
      // the first bit of the `SigFlags` integer (see Table 219 in the
      // specification).
      const sigFlags = acroForm.get("SigFlags");
      const hasSignatures = !!(sigFlags & 0x1);
      const hasOnlyDocumentSignatures =
        hasSignatures && this._hasOnlyDocumentSignatures(fields);
      formInfo.hasAcroForm = hasFields && !hasOnlyDocumentSignatures;
      formInfo.hasSignatures = hasSignatures;
    } catch (ex) {
      if (ex instanceof MissingDataException) {
        throw ex;
      }
      warn(`Cannot fetch form information: "${ex}".`);
    }
    return shadow(this, "formInfo", formInfo);
  }

  get documentInfo() {
    const DocumentInfoValidators = {
      Title: isString,
      Author: isString,
      Subject: isString,
      Keywords: isString,
      Creator: isString,
      Producer: isString,
      CreationDate: isString,
      ModDate: isString,
      Trapped: isName,
    };

    let version = this._version;
    if (
      typeof version !== "string" ||
      !PDF_HEADER_VERSION_REGEXP.test(version)
    ) {
      warn(`Invalid PDF header version number: ${version}`);
      version = null;
    }

    const docInfo = {
      PDFFormatVersion: version,
      IsLinearized: !!this.linearization,
      IsAcroFormPresent: this.formInfo.hasAcroForm,
      IsXFAPresent: this.formInfo.hasXfa,
      IsCollectionPresent: !!this.catalog.collection,
      IsSignaturesPresent: this.formInfo.hasSignatures,
    };

    let infoDict;
    try {
      infoDict = this.xref.trailer.get("Info");
    } catch (err) {
      if (err instanceof MissingDataException) {
        throw err;
      }
      info("The document information dictionary is invalid.");
    }

    if (isDict(infoDict)) {
      // Fill the document info with valid entries from the specification,
      // as well as any existing well-formed custom entries.
      for (const key of infoDict.getKeys()) {
        const value = infoDict.get(key);

        if (DocumentInfoValidators[key]) {
          // Make sure the (standard) value conforms to the specification.
          if (DocumentInfoValidators[key](value)) {
            docInfo[key] =
              typeof value !== "string" ? value : stringToPDFString(value);
          } else {
            info(`Bad value in document info for "${key}".`);
          }
        } else if (typeof key === "string") {
          // For custom values, only accept white-listed types to prevent
          // errors that would occur when trying to send non-serializable
          // objects to the main-thread (for example `Dict` or `Stream`).
          let customValue;
          if (isString(value)) {
            customValue = stringToPDFString(value);
          } else if (isName(value) || isNum(value) || isBool(value)) {
            customValue = value;
          } else {
            info(`Unsupported value in document info for (custom) "${key}".`);
            continue;
          }

          if (!docInfo.Custom) {
            docInfo.Custom = Object.create(null);
          }
          docInfo.Custom[key] = customValue;
        }
      }
    }
    return shadow(this, "documentInfo", docInfo);
  }

  get fingerprint() {
    let hash;
    const idArray = this.xref.trailer.get("ID");
    if (
      Array.isArray(idArray) &&
      idArray[0] &&
      isString(idArray[0]) &&
      idArray[0] !== EMPTY_FINGERPRINT
    ) {
      hash = stringToBytes(idArray[0]);
    } else {
      hash = calculateMD5(
        this.stream.getByteRange(0, FINGERPRINT_FIRST_BYTES),
        0,
        FINGERPRINT_FIRST_BYTES
      );
    }

    const fingerprintBuf = [];
    for (let i = 0, ii = hash.length; i < ii; i++) {
      const hex = hash[i].toString(16);
      fingerprintBuf.push(hex.padStart(2, "0"));
    }
    return shadow(this, "fingerprint", fingerprintBuf.join(""));
  }

  _getLinearizationPage(pageIndex) {
    const { catalog, linearization } = this;
    if (
      typeof PDFJSDev === "undefined" ||
      PDFJSDev.test("!PRODUCTION || TESTING")
    ) {
      assert(
        linearization && linearization.pageFirst === pageIndex,
        "_getLinearizationPage - invalid pageIndex argument."
      );
    }

    const ref = Ref.get(linearization.objectNumberFirst, 0);
    return this.xref
      .fetchAsync(ref)
      .then(obj => {
        // Ensure that the object that was found is actually a Page dictionary.
        if (
          isDict(obj, "Page") ||
          (isDict(obj) && !obj.has("Type") && obj.has("Contents"))
        ) {
          if (ref && !catalog.pageKidsCountCache.has(ref)) {
            catalog.pageKidsCountCache.put(ref, 1); // Cache the Page reference.
          }
          return [obj, ref];
        }
        throw new FormatError(
          "The Linearization dictionary doesn't point " +
            "to a valid Page dictionary."
        );
      })
      .catch(reason => {
        info(reason);
        return catalog.getPageDict(pageIndex);
      });
  }

  getPage(pageIndex) {
    if (this._pagePromises[pageIndex] !== undefined) {
      return this._pagePromises[pageIndex];
    }
    const { catalog, linearization } = this;

    if (this.xfaFactory) {
      return Promise.resolve(
        new Page({
          pdfManager: this.pdfManager,
          xref: this.xref,
          pageIndex,
          pageDict: Dict.empty,
          ref: null,
          globalIdFactory: this._globalIdFactory,
          fontCache: catalog.fontCache,
          builtInCMapCache: catalog.builtInCMapCache,
          globalImageCache: catalog.globalImageCache,
          nonBlendModesSet: catalog.nonBlendModesSet,
          xfaFactory: this.xfaFactory,
        })
      );
    }

    const promise =
      linearization && linearization.pageFirst === pageIndex
        ? this._getLinearizationPage(pageIndex)
        : catalog.getPageDict(pageIndex);

    return (this._pagePromises[pageIndex] = promise.then(([pageDict, ref]) => {
      return new Page({
        pdfManager: this.pdfManager,
        xref: this.xref,
        pageIndex,
        pageDict,
        ref,
        globalIdFactory: this._globalIdFactory,
        fontCache: catalog.fontCache,
        builtInCMapCache: catalog.builtInCMapCache,
        globalImageCache: catalog.globalImageCache,
        nonBlendModesSet: catalog.nonBlendModesSet,
        xfaFactory: null,
      });
    }));
  }

  checkFirstPage() {
    return this.getPage(0).catch(async reason => {
      if (reason instanceof XRefEntryException) {
        // Clear out the various caches to ensure that we haven't stored any
        // inconsistent and/or incorrect state, since that could easily break
        // subsequent `this.getPage` calls.
        this._pagePromises.length = 0;
        await this.cleanup();

        throw new XRefParseException();
      }
    });
  }

  fontFallback(id, handler) {
    return this.catalog.fontFallback(id, handler);
  }

  async cleanup(manuallyTriggered = false) {
    return this.catalog
      ? this.catalog.cleanup(manuallyTriggered)
      : clearPrimitiveCaches();
  }

  /**
   * @private
   */
  _collectFieldObjects(name, fieldRef, promises) {
    const field = this.xref.fetchIfRef(fieldRef);
    if (field.has("T")) {
      const partName = stringToPDFString(field.get("T"));
      if (name === "") {
        name = partName;
      } else {
        name = `${name}.${partName}`;
      }
    }

    if (!promises.has(name)) {
      promises.set(name, []);
    }
    promises.get(name).push(
      AnnotationFactory.create(
        this.xref,
        fieldRef,
        this.pdfManager,
        this._localIdFactory,
        /* collectFields */ true
      )
        .then(annotation => annotation && annotation.getFieldObject())
        .catch(function (reason) {
          warn(`_collectFieldObjects: "${reason}".`);
          return null;
        })
    );

    if (field.has("Kids")) {
      const kids = field.get("Kids");
      for (const kid of kids) {
        this._collectFieldObjects(name, kid, promises);
      }
    }
  }

  get fieldObjects() {
    if (!this.formInfo.hasFields) {
      return shadow(this, "fieldObjects", Promise.resolve(null));
    }

    const allFields = Object.create(null);
    const fieldPromises = new Map();
    for (const fieldRef of this.catalog.acroForm.get("Fields")) {
      this._collectFieldObjects("", fieldRef, fieldPromises);
    }

    const allPromises = [];
    for (const [name, promises] of fieldPromises) {
      allPromises.push(
        Promise.all(promises).then(fields => {
          fields = fields.filter(field => !!field);
          if (fields.length > 0) {
            allFields[name] = fields;
          }
        })
      );
    }

    return shadow(
      this,
      "fieldObjects",
      Promise.all(allPromises).then(() => allFields)
    );
  }

  get hasJSActions() {
    const promise = this.pdfManager.ensureDoc("_parseHasJSActions");
    return shadow(this, "hasJSActions", promise);
  }

  /**
   * @private
   */
  async _parseHasJSActions() {
    const [catalogJsActions, fieldObjects] = await Promise.all([
      this.pdfManager.ensureCatalog("jsActions"),
      this.pdfManager.ensureDoc("fieldObjects"),
    ]);

    if (catalogJsActions) {
      return true;
    }
    if (fieldObjects) {
      return Object.values(fieldObjects).some(fieldObject =>
        fieldObject.some(object => object.actions !== null)
      );
    }
    return false;
  }

  get calculationOrderIds() {
    const acroForm = this.catalog.acroForm;
    if (!acroForm || !acroForm.has("CO")) {
      return shadow(this, "calculationOrderIds", null);
    }

    const calculationOrder = acroForm.get("CO");
    if (!Array.isArray(calculationOrder) || calculationOrder.length === 0) {
      return shadow(this, "calculationOrderIds", null);
    }

    const ids = calculationOrder.filter(isRef).map(ref => ref.toString());
    if (ids.length === 0) {
      return shadow(this, "calculationOrderIds", null);
    }
    return shadow(this, "calculationOrderIds", ids);
  }
}

export { Page, PDFDocument };
