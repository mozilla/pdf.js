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
  clearPrimitiveCaches,
  Dict,
  isDict,
  isName,
  isRef,
  isRefsEqual,
  isStream,
  RefSet,
  RefSetCache,
} from "./primitives.js";
import {
  collectActions,
  MissingDataException,
  toRomanNumerals,
} from "./core_utils.js";
import {
  createPromiseCapability,
  createValidAbsoluteUrl,
  DocumentActionEventType,
  FormatError,
  info,
  isBool,
  isNum,
  isString,
  objectSize,
  PermissionFlag,
  shadow,
  stringToPDFString,
  stringToUTF8String,
  warn,
} from "../shared/util.js";
import { NameTree, NumberTree } from "./name_number_tree.js";
import { ColorSpace } from "./colorspace.js";
import { FileSpec } from "./file_spec.js";
import { GlobalImageCache } from "./image_utils.js";
import { MetadataParser } from "./metadata_parser.js";
import { StructTreeRoot } from "./struct_tree.js";

function fetchDestination(dest) {
  if (dest instanceof Dict) {
    dest = dest.get("D");
  }
  return Array.isArray(dest) ? dest : null;
}

class Catalog {
  constructor(pdfManager, xref) {
    this.pdfManager = pdfManager;
    this.xref = xref;

    this._catDict = xref.getCatalogObj();
    if (!isDict(this._catDict)) {
      throw new FormatError("Catalog object is not a dictionary.");
    }

    this.fontCache = new RefSetCache();
    this.builtInCMapCache = new Map();
    this.standardFontDataCache = new Map();
    this.globalImageCache = new GlobalImageCache();
    this.pageKidsCountCache = new RefSetCache();
    this.pageIndexCache = new RefSetCache();
    this.nonBlendModesSet = new RefSet();
  }

  get version() {
    const version = this._catDict.get("Version");
    if (!isName(version)) {
      return shadow(this, "version", null);
    }
    return shadow(this, "version", version.name);
  }

  get collection() {
    let collection = null;
    try {
      const obj = this._catDict.get("Collection");
      if (isDict(obj) && obj.size > 0) {
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
      if (isDict(obj) && obj.size > 0) {
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

  get metadata() {
    const streamRef = this._catDict.getRaw("Metadata");
    if (!isRef(streamRef)) {
      return shadow(this, "metadata", null);
    }

    const suppressEncryption = !(
      this.xref.encrypt && this.xref.encrypt.encryptMetadata
    );
    const stream = this.xref.fetch(streamRef, suppressEncryption);
    let metadata = null;

    if (isStream(stream) && isDict(stream.dict)) {
      const type = stream.dict.get("Type");
      const subtype = stream.dict.get("Subtype");

      if (isName(type, "Metadata") && isName(subtype, "XML")) {
        // XXX: This should examine the charset the XML document defines,
        // however since there are currently no real means to decode arbitrary
        // charsets, let's just hope that the author of the PDF was reasonable
        // enough to stick with the XML default charset, which is UTF-8.
        try {
          const data = stringToUTF8String(stream.getString());
          if (data) {
            metadata = new MetadataParser(data).serializable;
          }
        } catch (e) {
          if (e instanceof MissingDataException) {
            throw e;
          }
          info("Skipping invalid metadata.");
        }
      }
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
    if (!isDict(obj)) {
      return null;
    }

    const markInfo = Object.assign(Object.create(null), {
      Marked: false,
      UserProperties: false,
      Suspects: false,
    });
    for (const key in markInfo) {
      if (!obj.has(key)) {
        continue;
      }
      const value = obj.get(key);
      if (!isBool(value)) {
        continue;
      }
      markInfo[key] = value;
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
    const obj = this._catDict.get("StructTreeRoot");
    if (!isDict(obj)) {
      return null;
    }
    const root = new StructTreeRoot(obj);
    root.init();
    return root;
  }

  get toplevelPagesDict() {
    const pagesObj = this._catDict.get("Pages");
    if (!isDict(pagesObj)) {
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
    if (!isDict(obj)) {
      return null;
    }
    obj = obj.getRaw("First");
    if (!isRef(obj)) {
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
        throw new FormatError("Invalid outline item encountered.");
      }

      const data = { url: null, dest: null };
      Catalog.parseDestDictionary({
        destDict: outlineDict,
        resultObj: data,
        docBaseUrl: this.pdfManager.docBaseUrl,
      });
      const title = outlineDict.get("Title");
      const flags = outlineDict.get("F") || 0;
      const color = outlineDict.getArray("C");
      const count = outlineDict.get("Count");
      let rgbColor = blackColor;

      // We only need to parse the color when it's valid, and non-default.
      if (
        Array.isArray(color) &&
        color.length === 3 &&
        (color[0] !== 0 || color[1] !== 0 || color[2] !== 0)
      ) {
        rgbColor = ColorSpace.singletons.rgb.getRgb(color, 0);
      }

      const outlineItem = {
        dest: data.dest,
        url: data.url,
        unsafeUrl: data.unsafeUrl,
        newWindow: data.newWindow,
        title: stringToPDFString(title),
        color: rgbColor,
        count: Number.isInteger(count) ? count : undefined,
        bold: !!(flags & 2),
        italic: !!(flags & 1),
        items: [],
      };

      i.parent.items.push(outlineItem);
      obj = outlineDict.getRaw("First");
      if (isRef(obj) && !processed.has(obj)) {
        queue.push({ obj, parent: outlineItem });
        processed.put(obj);
      }
      obj = outlineDict.getRaw("Next");
      if (isRef(obj) && !processed.has(obj)) {
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
    if (!isDict(encrypt)) {
      return null;
    }

    let flags = encrypt.get("P");
    if (!isNum(flags)) {
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
      const groups = [];
      const groupRefs = [];
      // Ensure all the optional content groups are valid.
      for (const groupRef of groupsData) {
        if (!isRef(groupRef)) {
          continue;
        }
        groupRefs.push(groupRef);
        const group = this.xref.fetchIfRef(groupRef);
        groups.push({
          id: groupRef.toString(),
          name: isString(group.get("Name"))
            ? stringToPDFString(group.get("Name"))
            : null,
          intent: isString(group.get("Intent"))
            ? stringToPDFString(group.get("Intent"))
            : null,
        });
      }
      config = this._readOptionalContentConfig(defaultConfig, groupRefs);
      config.groups = groups;
    } catch (ex) {
      if (ex instanceof MissingDataException) {
        throw ex;
      }
      warn(`Unable to read optional content config: ${ex}`);
    }
    return shadow(this, "optionalContentConfig", config);
  }

  _readOptionalContentConfig(config, contentGroupRefs) {
    function parseOnOff(refs) {
      const onParsed = [];
      if (Array.isArray(refs)) {
        for (const value of refs) {
          if (!isRef(value)) {
            continue;
          }
          if (contentGroupRefs.includes(value)) {
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
        if (isRef(value) && contentGroupRefs.includes(value)) {
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
      for (const groupRef of contentGroupRefs) {
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
      if (!nestedOrder || !nestedOrder.length) {
        return null;
      }
      return { name: stringToPDFString(nestedName), order: nestedOrder };
    }

    const xref = this.xref,
      parsedOrderRefs = new RefSet(),
      MAX_NESTED_LEVELS = 10;

    return {
      name: isString(config.get("Name"))
        ? stringToPDFString(config.get("Name"))
        : null,
      creator: isString(config.get("Creator"))
        ? stringToPDFString(config.get("Creator"))
        : null,
      baseState: isName(config.get("BaseState"))
        ? config.get("BaseState").name
        : null,
      on: parseOnOff(config.get("ON")),
      off: parseOnOff(config.get("OFF")),
      order: parseOrder(config.get("Order")),
      groups: null,
    };
  }

  get numPages() {
    const obj = this.toplevelPagesDict.get("Count");
    if (!Number.isInteger(obj)) {
      throw new FormatError(
        "Page count in top-level pages dictionary is not an integer."
      );
    }
    return shadow(this, "numPages", obj);
  }

  get destinations() {
    const obj = this._readDests(),
      dests = Object.create(null);
    if (obj instanceof NameTree) {
      for (const [key, value] of obj.getAll()) {
        const dest = fetchDestination(value);
        if (dest) {
          dests[key] = dest;
        }
      }
    } else if (obj instanceof Dict) {
      obj.forEach(function (key, value) {
        const dest = fetchDestination(value);
        if (dest) {
          dests[key] = dest;
        }
      });
    }
    return shadow(this, "destinations", dests);
  }

  getDestination(id) {
    const obj = this._readDests();
    if (obj instanceof NameTree) {
      const dest = fetchDestination(obj.get(id));
      if (dest) {
        return dest;
      }
      // Fallback to checking the *entire* NameTree, in an attempt to handle
      // corrupt PDF documents with out-of-order NameTrees (fixes issue 10272).
      const allDest = this.destinations[id];
      if (allDest) {
        warn(`Found "${id}" at an incorrect position in the NameTree.`);
        return allDest;
      }
    } else if (obj instanceof Dict) {
      const dest = fetchDestination(obj.get(id));
      if (dest) {
        return dest;
      }
    }
    return null;
  }

  /**
   * @private
   */
  _readDests() {
    const obj = this._catDict.get("Names");
    if (obj && obj.has("Dests")) {
      return new NameTree(obj.getRaw("Dests"), this.xref);
    } else if (this._catDict.has("Dests")) {
      // Simple destination dictionary.
      return this._catDict.get("Dests");
    }
    return undefined;
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
        if (!isDict(labelDict)) {
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
          if (!isName(s)) {
            throw new FormatError("Invalid style in PageLabel dictionary.");
          }
          style = s.name;
        } else {
          style = null;
        }

        if (labelDict.has("P")) {
          const p = labelDict.get("P");
          if (!isString(p)) {
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
          const charBuf = [];
          for (let j = 0, jj = (letterIndex / LIMIT) | 0; j <= jj; j++) {
            charBuf.push(character);
          }
          currentLabel = charBuf.join("");
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

    if (isName(obj)) {
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

    if (isName(obj)) {
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
    const ViewerPreferencesValidators = {
      HideToolbar: isBool,
      HideMenubar: isBool,
      HideWindowUI: isBool,
      FitWindow: isBool,
      CenterWindow: isBool,
      DisplayDocTitle: isBool,
      NonFullScreenPageMode: isName,
      Direction: isName,
      ViewArea: isName,
      ViewClip: isName,
      PrintArea: isName,
      PrintClip: isName,
      PrintScaling: isName,
      Duplex: isName,
      PickTrayByPDFSize: isBool,
      PrintPageRange: Array.isArray,
      NumCopies: Number.isInteger,
    };

    const obj = this._catDict.get("ViewerPreferences");
    let prefs = null;

    if (isDict(obj)) {
      for (const key in ViewerPreferencesValidators) {
        if (!obj.has(key)) {
          continue;
        }
        const value = obj.get(key);
        // Make sure the (standard) value conforms to the specification.
        if (!ViewerPreferencesValidators[key](value)) {
          info(`Bad value in ViewerPreferences for "${key}".`);
          continue;
        }
        let prefValue;

        switch (key) {
          case "NonFullScreenPageMode":
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
            break;
          case "Direction":
            switch (value.name) {
              case "L2R":
              case "R2L":
                prefValue = value.name;
                break;
              default:
                prefValue = "L2R";
            }
            break;
          case "ViewArea":
          case "ViewClip":
          case "PrintArea":
          case "PrintClip":
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
            break;
          case "PrintScaling":
            switch (value.name) {
              case "None":
              case "AppDefault":
                prefValue = value.name;
                break;
              default:
                prefValue = "AppDefault";
            }
            break;
          case "Duplex":
            switch (value.name) {
              case "Simplex":
              case "DuplexFlipShortEdge":
              case "DuplexFlipLongEdge":
                prefValue = value.name;
                break;
              default:
                prefValue = "None";
            }
            break;
          case "PrintPageRange":
            const length = value.length;
            if (length % 2 !== 0) {
              // The number of elements must be even.
              break;
            }
            const isValid = value.every((page, i, arr) => {
              return (
                Number.isInteger(page) &&
                page > 0 &&
                (i === 0 || page >= arr[i - 1]) &&
                page <= this.numPages
              );
            });
            if (isValid) {
              prefValue = value;
            }
            break;
          case "NumCopies":
            if (value > 0) {
              prefValue = value;
            }
            break;
          default:
            if (typeof value !== "boolean") {
              throw new FormatError(
                `viewerPreferences - expected a boolean value for: ${key}`
              );
            }
            prefValue = value;
        }

        if (prefValue !== undefined) {
          if (!prefs) {
            prefs = Object.create(null);
          }
          prefs[key] = prefValue;
        } else {
          info(`Bad value in ViewerPreferences for "${key}".`);
        }
      }
    }
    return shadow(this, "viewerPreferences", prefs);
  }

  get openAction() {
    const obj = this._catDict.get("OpenAction");
    const openAction = Object.create(null);

    if (isDict(obj)) {
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
      if (isStream(js)) {
        js = js.getString();
      } else if (typeof js !== "string") {
        return;
      }

      if (javaScript === null) {
        javaScript = new Map();
      }
      javaScript.set(name, stringToPDFString(js));
    }

    if (obj instanceof Dict && obj.has("JavaScript")) {
      const nameTree = new NameTree(obj.getRaw("JavaScript"), this.xref);
      for (const [key, value] of nameTree.getAll()) {
        appendIfJavaScriptDict(key, value);
      }
    }
    // Append OpenAction "JavaScript" actions, if any, to the JavaScript map.
    const openAction = this._catDict.get("OpenAction");
    if (openAction) {
      appendIfJavaScriptDict("OpenAction", openAction);
    }

    return javaScript;
  }

  get javaScript() {
    const javaScript = this._collectJavaScript();
    return shadow(
      this,
      "javaScript",
      javaScript ? [...javaScript.values()] : null
    );
  }

  get jsActions() {
    const javaScript = this._collectJavaScript();
    let actions = collectActions(
      this.xref,
      this._catDict,
      DocumentActionEventType
    );

    if (javaScript) {
      if (!actions) {
        actions = Object.create(null);
      }
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

  fontFallback(id, handler) {
    const promises = [];
    this.fontCache.forEach(function (promise) {
      promises.push(promise);
    });

    return Promise.all(promises).then(translatedFonts => {
      for (const translatedFont of translatedFonts) {
        if (translatedFont.loadedName === id) {
          translatedFont.fallback(handler);
          return;
        }
      }
    });
  }

  cleanup(manuallyTriggered = false) {
    clearPrimitiveCaches();
    this.globalImageCache.clear(/* onlyData = */ manuallyTriggered);
    this.pageKidsCountCache.clear();
    this.pageIndexCache.clear();
    this.nonBlendModesSet.clear();

    const promises = [];
    this.fontCache.forEach(function (promise) {
      promises.push(promise);
    });

    return Promise.all(promises).then(translatedFonts => {
      for (const { dict } of translatedFonts) {
        delete dict.cacheKey;
      }
      this.fontCache.clear();
      this.builtInCMapCache.clear();
      this.standardFontDataCache.clear();
    });
  }

  getPageDict(pageIndex) {
    const capability = createPromiseCapability();
    const nodesToVisit = [this._catDict.getRaw("Pages")];
    const visitedNodes = new RefSet();
    const xref = this.xref,
      pageKidsCountCache = this.pageKidsCountCache;
    let count,
      currentPageIndex = 0;

    function next() {
      while (nodesToVisit.length) {
        const currentNode = nodesToVisit.pop();

        if (isRef(currentNode)) {
          count = pageKidsCountCache.get(currentNode);
          // Skip nodes where the page can't be.
          if (count > 0 && currentPageIndex + count < pageIndex) {
            currentPageIndex += count;
            continue;
          }
          // Prevent circular references in the /Pages tree.
          if (visitedNodes.has(currentNode)) {
            capability.reject(
              new FormatError("Pages tree contains circular reference.")
            );
            return;
          }
          visitedNodes.put(currentNode);

          xref.fetchAsync(currentNode).then(function (obj) {
            if (isDict(obj, "Page") || (isDict(obj) && !obj.has("Kids"))) {
              if (pageIndex === currentPageIndex) {
                // Cache the Page reference, since it can *greatly* improve
                // performance by reducing redundant lookups in long documents
                // where all nodes are found at *one* level of the tree.
                if (currentNode && !pageKidsCountCache.has(currentNode)) {
                  pageKidsCountCache.put(currentNode, 1);
                }
                capability.resolve([obj, currentNode]);
              } else {
                currentPageIndex++;
                next();
              }
              return;
            }
            nodesToVisit.push(obj);
            next();
          }, capability.reject);
          return;
        }

        // Must be a child page dictionary.
        if (!isDict(currentNode)) {
          capability.reject(
            new FormatError(
              "Page dictionary kid reference points to wrong type of object."
            )
          );
          return;
        }

        count = currentNode.get("Count");
        if (Number.isInteger(count) && count >= 0) {
          // Cache the Kids count, since it can reduce redundant lookups in
          // documents where all nodes are found at *one* level of the tree.
          const objId = currentNode.objId;
          if (objId && !pageKidsCountCache.has(objId)) {
            pageKidsCountCache.put(objId, count);
          }
          // Skip nodes where the page can't be.
          if (currentPageIndex + count <= pageIndex) {
            currentPageIndex += count;
            continue;
          }
        }

        const kids = currentNode.get("Kids");
        if (!Array.isArray(kids)) {
          // Prevent errors in corrupt PDF documents that violate the
          // specification by *inlining* Page dicts directly in the Kids
          // array, rather than using indirect objects (fixes issue9540.pdf).
          if (
            isName(currentNode.get("Type"), "Page") ||
            (!currentNode.has("Type") && currentNode.has("Contents"))
          ) {
            if (currentPageIndex === pageIndex) {
              capability.resolve([currentNode, null]);
              return;
            }
            currentPageIndex++;
            continue;
          }

          capability.reject(
            new FormatError("Page dictionary kids object is not an array.")
          );
          return;
        }

        // Always check all `Kids` nodes, to avoid getting stuck in an empty
        // node further down in the tree (see issue5644.pdf, issue8088.pdf),
        // and to ensure that we actually find the correct `Page` dict.
        for (let last = kids.length - 1; last >= 0; last--) {
          nodesToVisit.push(kids[last]);
        }
      }
      capability.reject(new Error(`Page index ${pageIndex} not found.`));
    }
    next();
    return capability.promise;
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
            !(isDict(node) && !node.has("Type") && node.has("Contents"))
          ) {
            throw new FormatError(
              "The reference does not point to a /Page dictionary."
            );
          }
          if (!node) {
            return null;
          }
          if (!isDict(node)) {
            throw new FormatError("Node must be a dictionary.");
          }
          parentRef = node.getRaw("Parent");
          return node.getAsync("Parent");
        })
        .then(function (parent) {
          if (!parent) {
            return null;
          }
          if (!isDict(parent)) {
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
          for (let i = 0, ii = kids.length; i < ii; i++) {
            const kid = kids[i];
            if (!isRef(kid)) {
              throw new FormatError("Kid must be a reference.");
            }
            if (isRefsEqual(kid, kidRef)) {
              found = true;
              break;
            }
            kidPromises.push(
              xref.fetchAsync(kid).then(function (obj) {
                if (!isDict(obj)) {
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

  /**
   * @typedef ParseDestDictionaryParameters
   * @property {Dict} destDict - The dictionary containing the destination.
   * @property {Object} resultObj - The object where the parsed destination
   *   properties will be placed.
   * @property {string} [docBaseUrl] - The document base URL that is used when
   *   attempting to recover valid absolute URLs from relative ones.
   */

  /**
   * Helper function used to parse the contents of destination dictionaries.
   * @param {ParseDestDictionaryParameters} params
   */
  static parseDestDictionary(params) {
    // Lets URLs beginning with 'www.' default to using the 'http://' protocol.
    function addDefaultProtocolToUrl(url) {
      return url.startsWith("www.") ? `http://${url}` : url;
    }

    // According to ISO 32000-1:2008, section 12.6.4.7, URIs should be encoded
    // in 7-bit ASCII. Some bad PDFs use UTF-8 encoding; see Bugzilla 1122280.
    function tryConvertUrlEncoding(url) {
      try {
        return stringToUTF8String(url);
      } catch (e) {
        return url;
      }
    }

    const destDict = params.destDict;
    if (!isDict(destDict)) {
      warn("parseDestDictionary: `destDict` must be a dictionary.");
      return;
    }
    const resultObj = params.resultObj;
    if (typeof resultObj !== "object") {
      warn("parseDestDictionary: `resultObj` must be an object.");
      return;
    }
    const docBaseUrl = params.docBaseUrl || null;

    let action = destDict.get("A"),
      url,
      dest;
    if (!isDict(action)) {
      if (destDict.has("Dest")) {
        // A /Dest entry should *only* contain a Name or an Array, but some bad
        // PDF generators ignore that and treat it as an /A entry.
        action = destDict.get("Dest");
      } else {
        action = destDict.get("AA");
        if (isDict(action)) {
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

    if (isDict(action)) {
      const actionType = action.get("S");
      if (!isName(actionType)) {
        warn("parseDestDictionary: Invalid type in Action dictionary.");
        return;
      }
      const actionName = actionType.name;

      switch (actionName) {
        case "URI":
          url = action.get("URI");
          if (isName(url)) {
            // Some bad PDFs do not put parentheses around relative URLs.
            url = "/" + url.name;
          } else if (isString(url)) {
            url = addDefaultProtocolToUrl(url);
          }
          // TODO: pdf spec mentions urls can be relative to a Base
          // entry in the dictionary.
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
          if (isDict(urlDict)) {
            // We assume that we found a FileSpec dictionary
            // and fetch the URL without checking any further.
            url = urlDict.get("F") || null;
          } else if (isString(urlDict)) {
            url = urlDict;
          }

          // NOTE: the destination is relative to the *remote* document.
          let remoteDest = action.get("D");
          if (remoteDest) {
            if (isName(remoteDest)) {
              remoteDest = remoteDest.name;
            }
            if (isString(url)) {
              const baseUrl = url.split("#")[0];
              if (isString(remoteDest)) {
                url = baseUrl + "#" + remoteDest;
              } else if (Array.isArray(remoteDest)) {
                url = baseUrl + "#" + JSON.stringify(remoteDest);
              }
            }
          }
          // The 'NewWindow' property, equal to `LinkTarget.BLANK`.
          const newWindow = action.get("NewWindow");
          if (isBool(newWindow)) {
            resultObj.newWindow = newWindow;
          }
          break;

        case "Named":
          const namedAction = action.get("N");
          if (isName(namedAction)) {
            resultObj.action = namedAction.name;
          }
          break;

        case "JavaScript":
          const jsAction = action.get("JS");
          let js;

          if (isStream(jsAction)) {
            js = jsAction.getString();
          } else if (isString(jsAction)) {
            js = jsAction;
          }

          if (js) {
            // Attempt to recover valid URLs from `JS` entries with certain
            // white-listed formats:
            //  - window.open('http://example.com')
            //  - app.launchURL('http://example.com', true)
            const URL_OPEN_METHODS = ["app.launchURL", "window.open"];
            const regex = new RegExp(
              "^\\s*(" +
                URL_OPEN_METHODS.join("|").split(".").join("\\.") +
                ")\\((?:'|\")([^'\"]*)(?:'|\")(?:,\\s*(\\w+)\\)|\\))",
              "i"
            );

            const jsUrl = regex.exec(stringToPDFString(js));
            if (jsUrl && jsUrl[2]) {
              url = jsUrl[2];

              if (jsUrl[3] === "true" && jsUrl[1] === "app.launchURL") {
                resultObj.newWindow = true;
              }
              break;
            }
          }
        /* falls through */
        default:
          if (
            actionName === "JavaScript" ||
            actionName === "ResetForm" ||
            actionName === "SubmitForm"
          ) {
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

    if (isString(url)) {
      url = tryConvertUrlEncoding(url);
      const absoluteUrl = createValidAbsoluteUrl(url, docBaseUrl);
      if (absoluteUrl) {
        resultObj.url = absoluteUrl.href;
      }
      resultObj.unsafeUrl = url;
    }
    if (dest) {
      if (isName(dest)) {
        dest = dest.name;
      }
      if (isString(dest) || Array.isArray(dest)) {
        resultObj.dest = dest;
      }
    }
  }
}

export { Catalog };
