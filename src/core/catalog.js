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
  collectActions,
  isNumberArray,
  MissingDataException,
  PDF_VERSION_REGEXP,
  recoverJsURL,
  toRomanNumerals,
  XRefEntryException,
} from "./core_utils.js";
import {
  createValidAbsoluteUrl,
  DocumentActionEventType,
  FormatError,
  info,
  objectSize,
  PermissionFlag,
  shadow,
  stringToPDFString,
  stringToUTF8String,
  warn,
} from "../shared/util.js";
import {
  Dict,
  isDict,
  isName,
  isRefsEqual,
  Name,
  Ref,
  RefSet,
  RefSetCache,
} from "./primitives.js";
import { NameTree, NumberTree } from "./name_number_tree.js";
import { BaseStream } from "./base_stream.js";
import { clearGlobalCaches } from "./cleanup_helper.js";
import { ColorSpace } from "./colorspace.js";
import { FileSpec } from "./file_spec.js";
import { GlobalImageCache } from "./image_utils.js";
import { MetadataParser } from "./metadata_parser.js";
import { StructTreeRoot } from "./struct_tree.js";

function isValidExplicitDest(dest) {
  if (!Array.isArray(dest) || dest.length < 2) {
    return false;
  }
  const [page, zoom, ...args] = dest;
  if (!(page instanceof Ref) && !Number.isInteger(page)) {
    return false;
  }
  if (!(zoom instanceof Name)) {
    return false;
  }
  const argsLen = args.length;
  let allowNull = true;
  switch (zoom.name) {
    case "XYZ":
      if (argsLen < 2 || argsLen > 3) {
        return false;
      }
      break;
    case "Fit":
    case "FitB":
      return argsLen === 0;
    case "FitH":
    case "FitBH":
    case "FitV":
    case "FitBV":
      if (argsLen > 1) {
        return false;
      }
      break;
    case "FitR":
      if (argsLen !== 4) {
        return false;
      }
      allowNull = false;
      break;
    default:
      return false;
  }
  for (const arg of args) {
    if (!(typeof arg === "number" || (allowNull && arg === null))) {
      return false;
    }
  }
  return true;
}

function fetchDest(dest) {
  if (dest instanceof Dict) {
    dest = dest.get("D");
  }
  return isValidExplicitDest(dest) ? dest : null;
}

function fetchRemoteDest(action) {
  let dest = action.get("D");
  if (dest) {
    if (dest instanceof Name) {
      dest = dest.name;
    }
    if (typeof dest === "string") {
      return stringToPDFString(dest);
    } else if (isValidExplicitDest(dest)) {
      return JSON.stringify(dest);
    }
  }
  return null;
}

class Catalog {
  constructor(pdfManager, xref) {
    this.pdfManager = pdfManager;
    this.xref = xref;

    this._catDict = xref.getCatalogObj();
    if (!(this._catDict instanceof Dict)) {
      throw new FormatError("Catalog object is not a dictionary.");
    }
    // Given that `XRef.parse` will both fetch *and* validate the /Pages-entry,
    // the following call must always succeed here:
    this.toplevelPagesDict; // eslint-disable-line no-unused-expressions

    this._actualNumPages = null;

    this.fontCache = new RefSetCache();
    this.builtInCMapCache = new Map();
    this.standardFontDataCache = new Map();
    this.globalImageCache = new GlobalImageCache();
    this.pageKidsCountCache = new RefSetCache();
    this.pageIndexCache = new RefSetCache();
    this.pageDictCache = new RefSetCache();
    this.nonBlendModesSet = new RefSet();
    this.systemFontCache = new Map();
  }

  cloneDict() {
    return this._catDict.clone();
  }

  get version() {
    const version = this._catDict.get("Version");
    if (version instanceof Name) {
      if (PDF_VERSION_REGEXP.test(version.name)) {
        return shadow(this, "version", version.name);
      }
      warn(`Invalid PDF catalog version: ${version.name}`);
    }
    return shadow(this, "version", null);
  }

  get lang() {
    const lang = this._catDict.get("Lang");
    return shadow(
      this,
      "lang",
      lang && typeof lang === "string" ? stringToPDFString(lang) : null
    );
  }

  /**
   * @type {boolean} `true` for pure XFA documents,
   *   `false` for XFA Foreground documents.
   */
  get needsRendering() {
    const needsRendering = this._catDict.get("NeedsRendering");
    return shadow(
      this,
      "needsRendering",
      typeof needsRendering === "boolean" ? needsRendering : false
    );
  }

  get collection() {
    let collection = null;
    try {
      const obj = this._catDict.get("Collection");
      if (obj instanceof Dict && obj.size > 0) {
        collection = obj;
      }
    } catch (ex) {
      if (ex instanceof MissingDataException) {
        throw ex;
      }
      info("Cannot fetch Collection entry; assuming no collection is present.");
    }
    return shadow(this, "collection", collection);
  }

  get acroForm() {
    let acroForm = null;
    try {
      const obj = this._catDict.get("AcroForm");
      if (obj instanceof Dict && obj.size > 0) {
        acroForm = obj;
      }
    } catch (ex) {
      if (ex instanceof MissingDataException) {
        throw ex;
      }
      info("Cannot fetch AcroForm entry; assuming no forms are present.");
    }
    return shadow(this, "acroForm", acroForm);
  }

  get acroFormRef() {
    const value = this._catDict.getRaw("AcroForm");
    return shadow(this, "acroFormRef", value instanceof Ref ? value : null);
  }

  get metadata() {
    const streamRef = this._catDict.getRaw("Metadata");
    if (!(streamRef instanceof Ref)) {
      return shadow(this, "metadata", null);
    }

    let metadata = null;
    try {
      const stream = this.xref.fetch(
        streamRef,
        /* suppressEncryption = */ !this.xref.encrypt?.encryptMetadata
      );

      if (stream instanceof BaseStream && stream.dict instanceof Dict) {
        const type = stream.dict.get("Type");
        const subtype = stream.dict.get("Subtype");

        if (isName(type, "Metadata") && isName(subtype, "XML")) {
          // XXX: This should examine the charset the XML document defines,
          // however since there are currently no real means to decode arbitrary
          // charsets, let's just hope that the author of the PDF was reasonable
          // enough to stick with the XML default charset, which is UTF-8.
          const data = stringToUTF8String(stream.getString());
          if (data) {
            metadata = new MetadataParser(data).serializable;
          }
        }
      }
    } catch (ex) {
      if (ex instanceof MissingDataException) {
        throw ex;
      }
      info(`Skipping invalid Metadata: "${ex}".`);
    }
    return shadow(this, "metadata", metadata);
  }

  get markInfo() {
    let markInfo = null;
    try {
      markInfo = this._readMarkInfo();
    } catch (ex) {
      if (ex instanceof MissingDataException) {
        throw ex;
      }
      warn("Unable to read mark info.");
    }
    return shadow(this, "markInfo", markInfo);
  }

  /**
   * @private
   */
  _readMarkInfo() {
    const obj = this._catDict.get("MarkInfo");
    if (!(obj instanceof Dict)) {
      return null;
    }

    const markInfo = {
      Marked: false,
      UserProperties: false,
      Suspects: false,
    };
    for (const key in markInfo) {
      const value = obj.get(key);
      if (typeof value === "boolean") {
        markInfo[key] = value;
      }
    }

    return markInfo;
  }

  get structTreeRoot() {
    let structTree = null;
    try {
      structTree = this._readStructTreeRoot();
    } catch (ex) {
      if (ex instanceof MissingDataException) {
        throw ex;
      }
      warn("Unable read to structTreeRoot info.");
    }
    return shadow(this, "structTreeRoot", structTree);
  }

  /**
   * @private
   */
  _readStructTreeRoot() {
    const rawObj = this._catDict.getRaw("StructTreeRoot");
    const obj = this.xref.fetchIfRef(rawObj);
    if (!(obj instanceof Dict)) {
      return null;
    }

    const root = new StructTreeRoot(obj, rawObj);
    root.init();
    return root;
  }

  get toplevelPagesDict() {
    const pagesObj = this._catDict.get("Pages");
    if (!(pagesObj instanceof Dict)) {
      throw new FormatError("Invalid top-level pages dictionary.");
    }
    return shadow(this, "toplevelPagesDict", pagesObj);
  }

  get documentOutline() {
    let obj = null;
    try {
      obj = this._readDocumentOutline();
    } catch (ex) {
      if (ex instanceof MissingDataException) {
        throw ex;
      }
      warn("Unable to read document outline.");
    }
    return shadow(this, "documentOutline", obj);
  }

  /**
   * @private
   */
  _readDocumentOutline() {
    let obj = this._catDict.get("Outlines");
    if (!(obj instanceof Dict)) {
      return null;
    }
    obj = obj.getRaw("First");
    if (!(obj instanceof Ref)) {
      return null;
    }

    const root = { items: [] };
    const queue = [{ obj, parent: root }];
    // To avoid recursion, keep track of the already processed items.
    const processed = new RefSet();
    processed.put(obj);
    const xref = this.xref,
      blackColor = new Uint8ClampedArray(3);

    while (queue.length > 0) {
      const i = queue.shift();
      const outlineDict = xref.fetchIfRef(i.obj);
      if (outlineDict === null) {
        continue;
      }
      if (!outlineDict.has("Title")) {
        warn("Invalid outline item encountered.");
      }

      const data = { url: null, dest: null, action: null };
      Catalog.parseDestDictionary({
        destDict: outlineDict,
        resultObj: data,
        docBaseUrl: this.baseUrl,
        docAttachments: this.attachments,
      });
      const title = outlineDict.get("Title");
      const flags = outlineDict.get("F") || 0;
      const color = outlineDict.getArray("C");
      const count = outlineDict.get("Count");
      let rgbColor = blackColor;

      // We only need to parse the color when it's valid, and non-default.
      if (
        isNumberArray(color, 3) &&
        (color[0] !== 0 || color[1] !== 0 || color[2] !== 0)
      ) {
        rgbColor = ColorSpace.singletons.rgb.getRgb(color, 0);
      }

      const outlineItem = {
        action: data.action,
        attachment: data.attachment,
        dest: data.dest,
        url: data.url,
        unsafeUrl: data.unsafeUrl,
        newWindow: data.newWindow,
        setOCGState: data.setOCGState,
        title: typeof title === "string" ? stringToPDFString(title) : "",
        color: rgbColor,
        count: Number.isInteger(count) ? count : undefined,
        bold: !!(flags & 2),
        italic: !!(flags & 1),
        items: [],
      };

      i.parent.items.push(outlineItem);
      obj = outlineDict.getRaw("First");
      if (obj instanceof Ref && !processed.has(obj)) {
        queue.push({ obj, parent: outlineItem });
        processed.put(obj);
      }
      obj = outlineDict.getRaw("Next");
      if (obj instanceof Ref && !processed.has(obj)) {
        queue.push({ obj, parent: i.parent });
        processed.put(obj);
      }
    }
    return root.items.length > 0 ? root.items : null;
  }

  get permissions() {
    let permissions = null;
    try {
      permissions = this._readPermissions();
    } catch (ex) {
      if (ex instanceof MissingDataException) {
        throw ex;
      }
      warn("Unable to read permissions.");
    }
    return shadow(this, "permissions", permissions);
  }

  /**
   * @private
   */
  _readPermissions() {
    const encrypt = this.xref.trailer.get("Encrypt");
    if (!(encrypt instanceof Dict)) {
      return null;
    }

    let flags = encrypt.get("P");
    if (typeof flags !== "number") {
      return null;
    }

    // PDF integer objects are represented internally in signed 2's complement
    // form. Therefore, convert the signed decimal integer to a signed 2's
    // complement binary integer so we can use regular bitwise operations on it.
    flags += 2 ** 32;

    const permissions = [];
    for (const key in PermissionFlag) {
      const value = PermissionFlag[key];
      if (flags & value) {
        permissions.push(value);
      }
    }
    return permissions;
  }

  get optionalContentConfig() {
    let config = null;
    try {
      const properties = this._catDict.get("OCProperties");
      if (!properties) {
        return shadow(this, "optionalContentConfig", null);
      }
      const defaultConfig = properties.get("D");
      if (!defaultConfig) {
        return shadow(this, "optionalContentConfig", null);
      }
      const groupsData = properties.get("OCGs");
      if (!Array.isArray(groupsData)) {
        return shadow(this, "optionalContentConfig", null);
      }
      const groupRefCache = new RefSetCache();
      // Ensure all the optional content groups are valid.
      for (const groupRef of groupsData) {
        if (!(groupRef instanceof Ref) || groupRefCache.has(groupRef)) {
          continue;
        }
        groupRefCache.put(groupRef, this.#readOptionalContentGroup(groupRef));
      }
      config = this.#readOptionalContentConfig(defaultConfig, groupRefCache);
    } catch (ex) {
      if (ex instanceof MissingDataException) {
        throw ex;
      }
      warn(`Unable to read optional content config: ${ex}`);
    }
    return shadow(this, "optionalContentConfig", config);
  }

  #readOptionalContentGroup(groupRef) {
    const group = this.xref.fetch(groupRef);
    const obj = {
      id: groupRef.toString(),
      name: null,
      intent: null,
      usage: {
        print: null,
        view: null,
      },
      rbGroups: [],
    };

    const name = group.get("Name");
    if (typeof name === "string") {
      obj.name = stringToPDFString(name);
    }

    let intent = group.getArray("Intent");
    if (!Array.isArray(intent)) {
      intent = [intent];
    }
    if (intent.every(i => i instanceof Name)) {
      obj.intent = intent.map(i => i.name);
    }

    const usage = group.get("Usage");
    if (!(usage instanceof Dict)) {
      return obj;
    }
    const usageObj = obj.usage;

    const print = usage.get("Print");
    if (print instanceof Dict) {
      const printState = print.get("PrintState");
      if (printState instanceof Name) {
        switch (printState.name) {
          case "ON":
          case "OFF":
            usageObj.print = { printState: printState.name };
        }
      }
    }

    const view = usage.get("View");
    if (view instanceof Dict) {
      const viewState = view.get("ViewState");
      if (viewState instanceof Name) {
        switch (viewState.name) {
          case "ON":
          case "OFF":
            usageObj.view = { viewState: viewState.name };
        }
      }
    }

    return obj;
  }

  #readOptionalContentConfig(config, groupRefCache) {
    function parseOnOff(refs) {
      const onParsed = [];
      if (Array.isArray(refs)) {
        for (const value of refs) {
          if (value instanceof Ref && groupRefCache.has(value)) {
            onParsed.push(value.toString());
          }
        }
      }
      return onParsed;
    }

    function parseOrder(refs, nestedLevels = 0) {
      if (!Array.isArray(refs)) {
        return null;
      }
      const order = [];

      for (const value of refs) {
        if (value instanceof Ref && groupRefCache.has(value)) {
          parsedOrderRefs.put(value); // Handle "hidden" groups, see below.

          order.push(value.toString());
          continue;
        }
        // Handle nested /Order arrays (see e.g. issue 9462 and bug 1240641).
        const nestedOrder = parseNestedOrder(value, nestedLevels);
        if (nestedOrder) {
          order.push(nestedOrder);
        }
      }

      if (nestedLevels > 0) {
        return order;
      }
      const hiddenGroups = [];
      for (const [groupRef] of groupRefCache.items()) {
        if (parsedOrderRefs.has(groupRef)) {
          continue;
        }
        hiddenGroups.push(groupRef.toString());
      }
      if (hiddenGroups.length) {
        order.push({ name: null, order: hiddenGroups });
      }

      return order;
    }

    function parseNestedOrder(ref, nestedLevels) {
      if (++nestedLevels > MAX_NESTED_LEVELS) {
        warn("parseNestedOrder - reached MAX_NESTED_LEVELS.");
        return null;
      }
      const value = xref.fetchIfRef(ref);
      if (!Array.isArray(value)) {
        return null;
      }
      const nestedName = xref.fetchIfRef(value[0]);
      if (typeof nestedName !== "string") {
        return null;
      }
      const nestedOrder = parseOrder(value.slice(1), nestedLevels);
      if (!nestedOrder?.length) {
        return null;
      }
      return { name: stringToPDFString(nestedName), order: nestedOrder };
    }

    function parseRBGroups(rbGroups) {
      if (!Array.isArray(rbGroups)) {
        return;
      }

      for (const value of rbGroups) {
        const rbGroup = xref.fetchIfRef(value);
        if (!Array.isArray(rbGroup) || !rbGroup.length) {
          continue;
        }
        const parsedRbGroup = new Set();

        for (const ref of rbGroup) {
          if (
            ref instanceof Ref &&
            groupRefCache.has(ref) &&
            !parsedRbGroup.has(ref.toString())
          ) {
            parsedRbGroup.add(ref.toString());
            // Keep a record of which RB groups the current OCG belongs to.
            groupRefCache.get(ref).rbGroups.push(parsedRbGroup);
          }
        }
      }
    }

    const xref = this.xref,
      parsedOrderRefs = new RefSet(),
      MAX_NESTED_LEVELS = 10;

    parseRBGroups(config.get("RBGroups"));

    return {
      name:
        typeof config.get("Name") === "string"
          ? stringToPDFString(config.get("Name"))
          : null,
      creator:
        typeof config.get("Creator") === "string"
          ? stringToPDFString(config.get("Creator"))
          : null,
      baseState:
        config.get("BaseState") instanceof Name
          ? config.get("BaseState").name
          : null,
      on: parseOnOff(config.get("ON")),
      off: parseOnOff(config.get("OFF")),
      order: parseOrder(config.get("Order")),
      groups: [...groupRefCache],
    };
  }

  setActualNumPages(num = null) {
    this._actualNumPages = num;
  }

  get hasActualNumPages() {
    return this._actualNumPages !== null;
  }

  get _pagesCount() {
    const obj = this.toplevelPagesDict.get("Count");
    if (!Number.isInteger(obj)) {
      throw new FormatError(
        "Page count in top-level pages dictionary is not an integer."
      );
    }
    return shadow(this, "_pagesCount", obj);
  }

  get numPages() {
    return this.hasActualNumPages ? this._actualNumPages : this._pagesCount;
  }

  get destinations() {
    const rawDests = this.#readDests(),
      dests = Object.create(null);
    for (const obj of rawDests) {
      if (obj instanceof NameTree) {
        for (const [key, value] of obj.getAll()) {
          const dest = fetchDest(value);
          if (dest) {
            dests[stringToPDFString(key)] = dest;
          }
        }
      } else if (obj instanceof Dict) {
        for (const [key, value] of obj) {
          const dest = fetchDest(value);
          if (dest) {
            // Always let the NameTree take precedence.
            dests[key] ||= dest;
          }
        }
      }
    }
    return shadow(this, "destinations", dests);
  }

  getDestination(id) {
    const rawDests = this.#readDests();
    for (const obj of rawDests) {
      if (obj instanceof NameTree || obj instanceof Dict) {
        const dest = fetchDest(obj.get(id));
        if (dest) {
          return dest;
        }
      }
    }

    if (rawDests[0] instanceof NameTree) {
      // Fallback to checking the *entire* NameTree, in an attempt to handle
      // corrupt PDF documents with out-of-order NameTrees (fixes issue 10272).
      const dest = this.destinations[id];
      if (dest) {
        warn(`Found "${id}" at an incorrect position in the NameTree.`);
        return dest;
      }
    }
    return null;
  }

  #readDests() {
    const obj = this._catDict.get("Names");
    const rawDests = [];
    if (obj?.has("Dests")) {
      rawDests.push(new NameTree(obj.getRaw("Dests"), this.xref));
    }
    if (this._catDict.has("Dests")) {
      // Simple destination dictionary.
      rawDests.push(this._catDict.get("Dests"));
    }
    return rawDests;
  }

  get pageLabels() {
    let obj = null;
    try {
      obj = this._readPageLabels();
    } catch (ex) {
      if (ex instanceof MissingDataException) {
        throw ex;
      }
      warn("Unable to read page labels.");
    }
    return shadow(this, "pageLabels", obj);
  }

  /**
   * @private
   */
  _readPageLabels() {
    const obj = this._catDict.getRaw("PageLabels");
    if (!obj) {
      return null;
    }

    const pageLabels = new Array(this.numPages);
    let style = null,
      prefix = "";

    const numberTree = new NumberTree(obj, this.xref);
    const nums = numberTree.getAll();
    let currentLabel = "",
      currentIndex = 1;

    for (let i = 0, ii = this.numPages; i < ii; i++) {
      const labelDict = nums.get(i);

      if (labelDict !== undefined) {
        if (!(labelDict instanceof Dict)) {
          throw new FormatError("PageLabel is not a dictionary.");
        }

        if (
          labelDict.has("Type") &&
          !isName(labelDict.get("Type"), "PageLabel")
        ) {
          throw new FormatError("Invalid type in PageLabel dictionary.");
        }

        if (labelDict.has("S")) {
          const s = labelDict.get("S");
          if (!(s instanceof Name)) {
            throw new FormatError("Invalid style in PageLabel dictionary.");
          }
          style = s.name;
        } else {
          style = null;
        }

        if (labelDict.has("P")) {
          const p = labelDict.get("P");
          if (typeof p !== "string") {
            throw new FormatError("Invalid prefix in PageLabel dictionary.");
          }
          prefix = stringToPDFString(p);
        } else {
          prefix = "";
        }

        if (labelDict.has("St")) {
          const st = labelDict.get("St");
          if (!(Number.isInteger(st) && st >= 1)) {
            throw new FormatError("Invalid start in PageLabel dictionary.");
          }
          currentIndex = st;
        } else {
          currentIndex = 1;
        }
      }

      switch (style) {
        case "D":
          currentLabel = currentIndex;
          break;
        case "R":
        case "r":
          currentLabel = toRomanNumerals(currentIndex, style === "r");
          break;
        case "A":
        case "a":
          const LIMIT = 26; // Use only the characters A-Z, or a-z.
          const A_UPPER_CASE = 0x41,
            A_LOWER_CASE = 0x61;

          const baseCharCode = style === "a" ? A_LOWER_CASE : A_UPPER_CASE;
          const letterIndex = currentIndex - 1;
          const character = String.fromCharCode(
            baseCharCode + (letterIndex % LIMIT)
          );
          currentLabel = character.repeat(Math.floor(letterIndex / LIMIT) + 1);
          break;
        default:
          if (style) {
            throw new FormatError(
              `Invalid style "${style}" in PageLabel dictionary.`
            );
          }
          currentLabel = "";
      }

      pageLabels[i] = prefix + currentLabel;
      currentIndex++;
    }
    return pageLabels;
  }

  get pageLayout() {
    const obj = this._catDict.get("PageLayout");
    // Purposely use a non-standard default value, rather than 'SinglePage', to
    // allow differentiating between `undefined` and /SinglePage since that does
    // affect the Scroll mode (continuous/non-continuous) used in Adobe Reader.
    let pageLayout = "";

    if (obj instanceof Name) {
      switch (obj.name) {
        case "SinglePage":
        case "OneColumn":
        case "TwoColumnLeft":
        case "TwoColumnRight":
        case "TwoPageLeft":
        case "TwoPageRight":
          pageLayout = obj.name;
      }
    }
    return shadow(this, "pageLayout", pageLayout);
  }

  get pageMode() {
    const obj = this._catDict.get("PageMode");
    let pageMode = "UseNone"; // Default value.

    if (obj instanceof Name) {
      switch (obj.name) {
        case "UseNone":
        case "UseOutlines":
        case "UseThumbs":
        case "FullScreen":
        case "UseOC":
        case "UseAttachments":
          pageMode = obj.name;
      }
    }
    return shadow(this, "pageMode", pageMode);
  }

  get viewerPreferences() {
    const obj = this._catDict.get("ViewerPreferences");
    if (!(obj instanceof Dict)) {
      return shadow(this, "viewerPreferences", null);
    }
    let prefs = null;

    for (const [key, value] of obj) {
      let prefValue;

      switch (key) {
        case "HideToolbar":
        case "HideMenubar":
        case "HideWindowUI":
        case "FitWindow":
        case "CenterWindow":
        case "DisplayDocTitle":
        case "PickTrayByPDFSize":
          if (typeof value === "boolean") {
            prefValue = value;
          }
          break;
        case "NonFullScreenPageMode":
          if (value instanceof Name) {
            switch (value.name) {
              case "UseNone":
              case "UseOutlines":
              case "UseThumbs":
              case "UseOC":
                prefValue = value.name;
                break;
              default:
                prefValue = "UseNone";
            }
          }
          break;
        case "Direction":
          if (value instanceof Name) {
            switch (value.name) {
              case "L2R":
              case "R2L":
                prefValue = value.name;
                break;
              default:
                prefValue = "L2R";
            }
          }
          break;
        case "ViewArea":
        case "ViewClip":
        case "PrintArea":
        case "PrintClip":
          if (value instanceof Name) {
            switch (value.name) {
              case "MediaBox":
              case "CropBox":
              case "BleedBox":
              case "TrimBox":
              case "ArtBox":
                prefValue = value.name;
                break;
              default:
                prefValue = "CropBox";
            }
          }
          break;
        case "PrintScaling":
          if (value instanceof Name) {
            switch (value.name) {
              case "None":
              case "AppDefault":
                prefValue = value.name;
                break;
              default:
                prefValue = "AppDefault";
            }
          }
          break;
        case "Duplex":
          if (value instanceof Name) {
            switch (value.name) {
              case "Simplex":
              case "DuplexFlipShortEdge":
              case "DuplexFlipLongEdge":
                prefValue = value.name;
                break;
              default:
                prefValue = "None";
            }
          }
          break;
        case "PrintPageRange":
          // The number of elements must be even.
          if (Array.isArray(value) && value.length % 2 === 0) {
            const isValid = value.every(
              (page, i, arr) =>
                Number.isInteger(page) &&
                page > 0 &&
                (i === 0 || page >= arr[i - 1]) &&
                page <= this.numPages
            );
            if (isValid) {
              prefValue = value;
            }
          }
          break;
        case "NumCopies":
          if (Number.isInteger(value) && value > 0) {
            prefValue = value;
          }
          break;
        default:
          warn(`Ignoring non-standard key in ViewerPreferences: ${key}.`);
          continue;
      }

      if (prefValue === undefined) {
        warn(`Bad value, for key "${key}", in ViewerPreferences: ${value}.`);
        continue;
      }
      if (!prefs) {
        prefs = Object.create(null);
      }
      prefs[key] = prefValue;
    }
    return shadow(this, "viewerPreferences", prefs);
  }

  get openAction() {
    const obj = this._catDict.get("OpenAction");
    const openAction = Object.create(null);

    if (obj instanceof Dict) {
      // Convert the OpenAction dictionary into a format that works with
      // `parseDestDictionary`, to avoid having to re-implement those checks.
      const destDict = new Dict(this.xref);
      destDict.set("A", obj);

      const resultObj = { url: null, dest: null, action: null };
      Catalog.parseDestDictionary({ destDict, resultObj });

      if (Array.isArray(resultObj.dest)) {
        openAction.dest = resultObj.dest;
      } else if (resultObj.action) {
        openAction.action = resultObj.action;
      }
    } else if (Array.isArray(obj)) {
      openAction.dest = obj;
    }
    return shadow(
      this,
      "openAction",
      objectSize(openAction) > 0 ? openAction : null
    );
  }

  get attachments() {
    const obj = this._catDict.get("Names");
    let attachments = null;

    if (obj instanceof Dict && obj.has("EmbeddedFiles")) {
      const nameTree = new NameTree(obj.getRaw("EmbeddedFiles"), this.xref);
      for (const [key, value] of nameTree.getAll()) {
        const fs = new FileSpec(value, this.xref);
        if (!attachments) {
          attachments = Object.create(null);
        }
        attachments[stringToPDFString(key)] = fs.serializable;
      }
    }
    return shadow(this, "attachments", attachments);
  }

  get xfaImages() {
    const obj = this._catDict.get("Names");
    let xfaImages = null;

    if (obj instanceof Dict && obj.has("XFAImages")) {
      const nameTree = new NameTree(obj.getRaw("XFAImages"), this.xref);
      for (const [key, value] of nameTree.getAll()) {
        if (!xfaImages) {
          xfaImages = new Dict(this.xref);
        }
        xfaImages.set(stringToPDFString(key), value);
      }
    }
    return shadow(this, "xfaImages", xfaImages);
  }

  _collectJavaScript() {
    const obj = this._catDict.get("Names");
    let javaScript = null;

    function appendIfJavaScriptDict(name, jsDict) {
      if (!(jsDict instanceof Dict)) {
        return;
      }
      if (!isName(jsDict.get("S"), "JavaScript")) {
        return;
      }

      let js = jsDict.get("JS");
      if (js instanceof BaseStream) {
        js = js.getString();
      } else if (typeof js !== "string") {
        return;
      }
      js = stringToPDFString(js).replaceAll("\x00", "");
      // Skip empty entries, similar to the `_collectJS` function.
      if (js) {
        (javaScript ||= new Map()).set(name, js);
      }
    }

    if (obj instanceof Dict && obj.has("JavaScript")) {
      const nameTree = new NameTree(obj.getRaw("JavaScript"), this.xref);
      for (const [key, value] of nameTree.getAll()) {
        appendIfJavaScriptDict(stringToPDFString(key), value);
      }
    }
    // Append OpenAction "JavaScript" actions, if any, to the JavaScript map.
    const openAction = this._catDict.get("OpenAction");
    if (openAction) {
      appendIfJavaScriptDict("OpenAction", openAction);
    }

    return javaScript;
  }

  get jsActions() {
    const javaScript = this._collectJavaScript();
    let actions = collectActions(
      this.xref,
      this._catDict,
      DocumentActionEventType
    );

    if (javaScript) {
      actions ||= Object.create(null);

      for (const [key, val] of javaScript) {
        if (key in actions) {
          actions[key].push(val);
        } else {
          actions[key] = [val];
        }
      }
    }
    return shadow(this, "jsActions", actions);
  }

  async fontFallback(id, handler) {
    const translatedFonts = await Promise.all(this.fontCache);

    for (const translatedFont of translatedFonts) {
      if (translatedFont.loadedName === id) {
        translatedFont.fallback(handler);
        return;
      }
    }
  }

  async cleanup(manuallyTriggered = false) {
    clearGlobalCaches();
    this.globalImageCache.clear(/* onlyData = */ manuallyTriggered);
    this.pageKidsCountCache.clear();
    this.pageIndexCache.clear();
    this.pageDictCache.clear();
    this.nonBlendModesSet.clear();

    const translatedFonts = await Promise.all(this.fontCache);

    for (const { dict } of translatedFonts) {
      delete dict.cacheKey;
    }
    this.fontCache.clear();
    this.builtInCMapCache.clear();
    this.standardFontDataCache.clear();
    this.systemFontCache.clear();
  }

  async getPageDict(pageIndex) {
    const nodesToVisit = [this.toplevelPagesDict];
    const visitedNodes = new RefSet();

    const pagesRef = this._catDict.getRaw("Pages");
    if (pagesRef instanceof Ref) {
      visitedNodes.put(pagesRef);
    }
    const xref = this.xref,
      pageKidsCountCache = this.pageKidsCountCache,
      pageIndexCache = this.pageIndexCache,
      pageDictCache = this.pageDictCache;
    let currentPageIndex = 0;

    while (nodesToVisit.length) {
      const currentNode = nodesToVisit.pop();

      if (currentNode instanceof Ref) {
        const count = pageKidsCountCache.get(currentNode);
        // Skip nodes where the page can't be.
        if (count >= 0 && currentPageIndex + count <= pageIndex) {
          currentPageIndex += count;
          continue;
        }
        // Prevent circular references in the /Pages tree.
        if (visitedNodes.has(currentNode)) {
          throw new FormatError("Pages tree contains circular reference.");
        }
        visitedNodes.put(currentNode);

        const obj = await (pageDictCache.get(currentNode) ||
          xref.fetchAsync(currentNode));
        if (obj instanceof Dict) {
          let type = obj.getRaw("Type");
          if (type instanceof Ref) {
            type = await xref.fetchAsync(type);
          }
          if (isName(type, "Page") || !obj.has("Kids")) {
            // Cache the Page reference, since it can *greatly* improve
            // performance by reducing redundant lookups in long documents
            // where all nodes are found at *one* level of the tree.
            if (!pageKidsCountCache.has(currentNode)) {
              pageKidsCountCache.put(currentNode, 1);
            }
            // Help improve performance of the `getPageIndex` method.
            if (!pageIndexCache.has(currentNode)) {
              pageIndexCache.put(currentNode, currentPageIndex);
            }

            if (currentPageIndex === pageIndex) {
              return [obj, currentNode];
            }
            currentPageIndex++;
            continue;
          }
        }
        nodesToVisit.push(obj);
        continue;
      }

      // Must be a child page dictionary.
      if (!(currentNode instanceof Dict)) {
        throw new FormatError(
          "Page dictionary kid reference points to wrong type of object."
        );
      }
      const { objId } = currentNode;

      let count = currentNode.getRaw("Count");
      if (count instanceof Ref) {
        count = await xref.fetchAsync(count);
      }
      if (Number.isInteger(count) && count >= 0) {
        // Cache the Kids count, since it can reduce redundant lookups in
        // documents where all nodes are found at *one* level of the tree.
        if (objId && !pageKidsCountCache.has(objId)) {
          pageKidsCountCache.put(objId, count);
        }

        // Skip nodes where the page can't be.
        if (currentPageIndex + count <= pageIndex) {
          currentPageIndex += count;
          continue;
        }
      }

      let kids = currentNode.getRaw("Kids");
      if (kids instanceof Ref) {
        kids = await xref.fetchAsync(kids);
      }
      if (!Array.isArray(kids)) {
        // Prevent errors in corrupt PDF documents that violate the
        // specification by *inlining* Page dicts directly in the Kids
        // array, rather than using indirect objects (fixes issue9540.pdf).
        let type = currentNode.getRaw("Type");
        if (type instanceof Ref) {
          type = await xref.fetchAsync(type);
        }
        if (isName(type, "Page") || !currentNode.has("Kids")) {
          if (currentPageIndex === pageIndex) {
            return [currentNode, null];
          }
          currentPageIndex++;
          continue;
        }

        throw new FormatError("Page dictionary kids object is not an array.");
      }

      // Always check all `Kids` nodes, to avoid getting stuck in an empty
      // node further down in the tree (see issue5644.pdf, issue8088.pdf),
      // and to ensure that we actually find the correct `Page` dict.
      for (let last = kids.length - 1; last >= 0; last--) {
        const lastKid = kids[last];
        nodesToVisit.push(lastKid);

        // Launch all requests in parallel so we don't wait for each one in turn
        // when looking for a page near the end, if all the pages are top level.
        if (
          currentNode === this.toplevelPagesDict &&
          lastKid instanceof Ref &&
          !pageDictCache.has(lastKid)
        ) {
          pageDictCache.put(lastKid, xref.fetchAsync(lastKid));
        }
      }
    }

    throw new Error(`Page index ${pageIndex} not found.`);
  }

  /**
   * Eagerly fetches the entire /Pages-tree; should ONLY be used as a fallback.
   * @returns {Promise<Map>}
   */
  async getAllPageDicts(recoveryMode = false) {
    const { ignoreErrors } = this.pdfManager.evaluatorOptions;

    const queue = [{ currentNode: this.toplevelPagesDict, posInKids: 0 }];
    const visitedNodes = new RefSet();

    const pagesRef = this._catDict.getRaw("Pages");
    if (pagesRef instanceof Ref) {
      visitedNodes.put(pagesRef);
    }
    const map = new Map(),
      xref = this.xref,
      pageIndexCache = this.pageIndexCache;
    let pageIndex = 0;

    function addPageDict(pageDict, pageRef) {
      // Help improve performance of the `getPageIndex` method.
      if (pageRef && !pageIndexCache.has(pageRef)) {
        pageIndexCache.put(pageRef, pageIndex);
      }

      map.set(pageIndex++, [pageDict, pageRef]);
    }
    function addPageError(error) {
      if (error instanceof XRefEntryException && !recoveryMode) {
        throw error;
      }
      if (recoveryMode && ignoreErrors && pageIndex === 0) {
        // Ensure that the viewer will always load (fixes issue15590.pdf).
        warn(`getAllPageDicts - Skipping invalid first page: "${error}".`);
        error = Dict.empty;
      }

      map.set(pageIndex++, [error, null]);
    }

    while (queue.length > 0) {
      const queueItem = queue.at(-1);
      const { currentNode, posInKids } = queueItem;

      let kids = currentNode.getRaw("Kids");
      if (kids instanceof Ref) {
        try {
          kids = await xref.fetchAsync(kids);
        } catch (ex) {
          addPageError(ex);
          break;
        }
      }
      if (!Array.isArray(kids)) {
        addPageError(
          new FormatError("Page dictionary kids object is not an array.")
        );
        break;
      }

      if (posInKids >= kids.length) {
        queue.pop();
        continue;
      }

      const kidObj = kids[posInKids];
      let obj;
      if (kidObj instanceof Ref) {
        // Prevent circular references in the /Pages tree.
        if (visitedNodes.has(kidObj)) {
          addPageError(
            new FormatError("Pages tree contains circular reference.")
          );
          break;
        }
        visitedNodes.put(kidObj);

        try {
          obj = await xref.fetchAsync(kidObj);
        } catch (ex) {
          addPageError(ex);
          break;
        }
      } else {
        // Prevent errors in corrupt PDF documents that violate the
        // specification by *inlining* Page dicts directly in the Kids
        // array, rather than using indirect objects (see issue9540.pdf).
        obj = kidObj;
      }
      if (!(obj instanceof Dict)) {
        addPageError(
          new FormatError(
            "Page dictionary kid reference points to wrong type of object."
          )
        );
        break;
      }

      let type = obj.getRaw("Type");
      if (type instanceof Ref) {
        try {
          type = await xref.fetchAsync(type);
        } catch (ex) {
          addPageError(ex);
          break;
        }
      }
      if (isName(type, "Page") || !obj.has("Kids")) {
        addPageDict(obj, kidObj instanceof Ref ? kidObj : null);
      } else {
        queue.push({ currentNode: obj, posInKids: 0 });
      }
      queueItem.posInKids++;
    }
    return map;
  }

  getPageIndex(pageRef) {
    const cachedPageIndex = this.pageIndexCache.get(pageRef);
    if (cachedPageIndex !== undefined) {
      return Promise.resolve(cachedPageIndex);
    }

    // The page tree nodes have the count of all the leaves below them. To get
    // how many pages are before we just have to walk up the tree and keep
    // adding the count of siblings to the left of the node.
    const xref = this.xref;

    function pagesBeforeRef(kidRef) {
      let total = 0,
        parentRef;

      return xref
        .fetchAsync(kidRef)
        .then(function (node) {
          if (
            isRefsEqual(kidRef, pageRef) &&
            !isDict(node, "Page") &&
            !(node instanceof Dict && !node.has("Type") && node.has("Contents"))
          ) {
            throw new FormatError(
              "The reference does not point to a /Page dictionary."
            );
          }
          if (!node) {
            return null;
          }
          if (!(node instanceof Dict)) {
            throw new FormatError("Node must be a dictionary.");
          }
          parentRef = node.getRaw("Parent");
          return node.getAsync("Parent");
        })
        .then(function (parent) {
          if (!parent) {
            return null;
          }
          if (!(parent instanceof Dict)) {
            throw new FormatError("Parent must be a dictionary.");
          }
          return parent.getAsync("Kids");
        })
        .then(function (kids) {
          if (!kids) {
            return null;
          }

          const kidPromises = [];
          let found = false;
          for (const kid of kids) {
            if (!(kid instanceof Ref)) {
              throw new FormatError("Kid must be a reference.");
            }
            if (isRefsEqual(kid, kidRef)) {
              found = true;
              break;
            }
            kidPromises.push(
              xref.fetchAsync(kid).then(function (obj) {
                if (!(obj instanceof Dict)) {
                  throw new FormatError("Kid node must be a dictionary.");
                }
                if (obj.has("Count")) {
                  total += obj.get("Count");
                } else {
                  // Page leaf node.
                  total++;
                }
              })
            );
          }
          if (!found) {
            throw new FormatError("Kid reference not found in parent's kids.");
          }
          return Promise.all(kidPromises).then(function () {
            return [total, parentRef];
          });
        });
    }

    let total = 0;
    const next = ref =>
      pagesBeforeRef(ref).then(args => {
        if (!args) {
          this.pageIndexCache.put(pageRef, total);
          return total;
        }
        const [count, parentRef] = args;
        total += count;
        return next(parentRef);
      });

    return next(pageRef);
  }

  get baseUrl() {
    const uri = this._catDict.get("URI");
    if (uri instanceof Dict) {
      const base = uri.get("Base");
      if (typeof base === "string") {
        const absoluteUrl = createValidAbsoluteUrl(base, null, {
          tryConvertEncoding: true,
        });
        if (absoluteUrl) {
          return shadow(this, "baseUrl", absoluteUrl.href);
        }
      }
    }
    return shadow(this, "baseUrl", this.pdfManager.docBaseUrl);
  }

  /**
   * @typedef {Object} ParseDestDictionaryParameters
   * @property {Dict} destDict - The dictionary containing the destination.
   * @property {Object} resultObj - The object where the parsed destination
   *   properties will be placed.
   * @property {string} [docBaseUrl] - The document base URL that is used when
   *   attempting to recover valid absolute URLs from relative ones.
   * @property {Object} [docAttachments] - The document attachments (may not
   *   exist in most PDF documents).
   */

  /**
   * Helper function used to parse the contents of destination dictionaries.
   * @param {ParseDestDictionaryParameters} params
   */
  static parseDestDictionary({
    destDict,
    resultObj,
    docBaseUrl = null,
    docAttachments = null,
  }) {
    if (!(destDict instanceof Dict)) {
      warn("parseDestDictionary: `destDict` must be a dictionary.");
      return;
    }

    let action = destDict.get("A"),
      url,
      dest;
    if (!(action instanceof Dict)) {
      if (destDict.has("Dest")) {
        // A /Dest entry should *only* contain a Name or an Array, but some bad
        // PDF generators ignore that and treat it as an /A entry.
        action = destDict.get("Dest");
      } else {
        action = destDict.get("AA");
        if (action instanceof Dict) {
          if (action.has("D")) {
            // MouseDown
            action = action.get("D");
          } else if (action.has("U")) {
            // MouseUp
            action = action.get("U");
          }
        }
      }
    }

    if (action instanceof Dict) {
      const actionType = action.get("S");
      if (!(actionType instanceof Name)) {
        warn("parseDestDictionary: Invalid type in Action dictionary.");
        return;
      }
      const actionName = actionType.name;

      switch (actionName) {
        case "ResetForm":
          const flags = action.get("Flags");
          const include = ((typeof flags === "number" ? flags : 0) & 1) === 0;
          const fields = [];
          const refs = [];
          for (const obj of action.get("Fields") || []) {
            if (obj instanceof Ref) {
              refs.push(obj.toString());
            } else if (typeof obj === "string") {
              fields.push(stringToPDFString(obj));
            }
          }
          resultObj.resetForm = { fields, refs, include };
          break;
        case "URI":
          url = action.get("URI");
          if (url instanceof Name) {
            // Some bad PDFs do not put parentheses around relative URLs.
            url = "/" + url.name;
          }
          break;

        case "GoTo":
          dest = action.get("D");
          break;

        case "Launch":
        // We neither want, nor can, support arbitrary 'Launch' actions.
        // However, in practice they are mostly used for linking to other PDF
        // files, which we thus attempt to support (utilizing `docBaseUrl`).
        /* falls through */

        case "GoToR":
          const urlDict = action.get("F");
          if (urlDict instanceof Dict) {
            const fs = new FileSpec(
              urlDict,
              /* xref = */ null,
              /* skipContent = */ true
            );
            const { rawFilename } = fs.serializable;
            url = rawFilename;
          } else if (typeof urlDict === "string") {
            url = urlDict;
          }

          // NOTE: the destination is relative to the *remote* document.
          const remoteDest = fetchRemoteDest(action);
          if (remoteDest && typeof url === "string") {
            url = /* baseUrl = */ url.split("#", 1)[0] + "#" + remoteDest;
          }
          // The 'NewWindow' property, equal to `LinkTarget.BLANK`.
          const newWindow = action.get("NewWindow");
          if (typeof newWindow === "boolean") {
            resultObj.newWindow = newWindow;
          }
          break;

        case "GoToE":
          const target = action.get("T");
          let attachment;

          if (docAttachments && target instanceof Dict) {
            const relationship = target.get("R");
            const name = target.get("N");

            if (isName(relationship, "C") && typeof name === "string") {
              attachment = docAttachments[stringToPDFString(name)];
            }
          }

          if (attachment) {
            resultObj.attachment = attachment;

            // NOTE: the destination is relative to the *attachment*.
            const attachmentDest = fetchRemoteDest(action);
            if (attachmentDest) {
              resultObj.attachmentDest = attachmentDest;
            }
          } else {
            warn(`parseDestDictionary - unimplemented "GoToE" action.`);
          }
          break;

        case "Named":
          const namedAction = action.get("N");
          if (namedAction instanceof Name) {
            resultObj.action = namedAction.name;
          }
          break;

        case "SetOCGState":
          const state = action.get("State");
          const preserveRB = action.get("PreserveRB");

          if (!Array.isArray(state) || state.length === 0) {
            break;
          }
          const stateArr = [];

          for (const elem of state) {
            if (elem instanceof Name) {
              switch (elem.name) {
                case "ON":
                case "OFF":
                case "Toggle":
                  stateArr.push(elem.name);
                  break;
              }
            } else if (elem instanceof Ref) {
              stateArr.push(elem.toString());
            }
          }

          if (stateArr.length !== state.length) {
            break; // Some of the original entries are not valid.
          }
          resultObj.setOCGState = {
            state: stateArr,
            preserveRB: typeof preserveRB === "boolean" ? preserveRB : true,
          };
          break;

        case "JavaScript":
          const jsAction = action.get("JS");
          let js;

          if (jsAction instanceof BaseStream) {
            js = jsAction.getString();
          } else if (typeof jsAction === "string") {
            js = jsAction;
          }

          const jsURL = js && recoverJsURL(stringToPDFString(js));
          if (jsURL) {
            url = jsURL.url;
            resultObj.newWindow = jsURL.newWindow;
            break;
          }
        /* falls through */
        default:
          if (actionName === "JavaScript" || actionName === "SubmitForm") {
            // Don't bother the user with a warning for actions that require
            // scripting support, since those will be handled separately.
            break;
          }
          warn(`parseDestDictionary - unsupported action: "${actionName}".`);
          break;
      }
    } else if (destDict.has("Dest")) {
      // Simple destination.
      dest = destDict.get("Dest");
    }

    if (typeof url === "string") {
      const absoluteUrl = createValidAbsoluteUrl(url, docBaseUrl, {
        addDefaultProtocol: true,
        tryConvertEncoding: true,
      });
      if (absoluteUrl) {
        resultObj.url = absoluteUrl.href;
      }
      resultObj.unsafeUrl = url;
    }
    if (dest) {
      if (dest instanceof Name) {
        dest = dest.name;
      }
      if (typeof dest === "string") {
        resultObj.dest = stringToPDFString(dest);
      } else if (isValidExplicitDest(dest)) {
        resultObj.dest = dest;
      }
    }
  }
}

export { Catalog };
