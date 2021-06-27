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
/* eslint-disable no-var */

import {
  AbortException,
  assert,
  CMapCompressionType,
  createPromiseCapability,
  FONT_IDENTITY_MATRIX,
  FormatError,
  IDENTITY_MATRIX,
  info,
  isArrayEqual,
  isNum,
  isString,
  OPS,
  shadow,
  stringToPDFString,
  TextRenderingMode,
  UNSUPPORTED_FEATURES,
  Util,
  warn,
} from "../shared/util.js";
import { CMapFactory, IdentityCMap } from "./cmap.js";
import {
  Cmd,
  Dict,
  EOF,
  isDict,
  isName,
  isRef,
  isStream,
  Name,
  Ref,
  RefSet,
} from "./primitives.js";
import { ErrorFont, Font } from "./fonts.js";
import { FontFlags, getFontType } from "./fonts_utils.js";
import {
  getEncoding,
  MacRomanEncoding,
  StandardEncoding,
  SymbolSetEncoding,
  WinAnsiEncoding,
  ZapfDingbatsEncoding,
} from "./encodings.js";
import {
  getFontNameToFileMap,
  getSerifFonts,
  getStandardFontName,
  getStdFontMap,
  getSymbolsFonts,
} from "./standard_fonts.js";
import {
  getNormalizedUnicodes,
  getUnicodeForGlyph,
  reverseIfRtl,
} from "./unicode.js";
import { getTilingPatternIR, Pattern } from "./pattern.js";
import { IdentityToUnicodeMap, ToUnicodeMap } from "./to_unicode_map.js";
import { isPDFFunction, PDFFunctionFactory } from "./function.js";
import { Lexer, Parser } from "./parser.js";
import {
  LocalColorSpaceCache,
  LocalGStateCache,
  LocalImageCache,
  LocalTilingPatternCache,
} from "./image_utils.js";
import { NullStream, Stream } from "./stream.js";
import { bidi } from "./bidi.js";
import { ColorSpace } from "./colorspace.js";
import { DecodeStream } from "./decode_stream.js";
import { getGlyphsUnicode } from "./glyphlist.js";
import { getLookupTableFactory } from "./core_utils.js";
import { getMetrics } from "./metrics.js";
import { getXfaFontName } from "./xfa_fonts.js";
import { MurmurHash3_64 } from "./murmurhash3.js";
import { OperatorList } from "./operator_list.js";
import { PDFImage } from "./image.js";

const DefaultPartialEvaluatorOptions = Object.freeze({
  maxImageSize: -1,
  disableFontFace: false,
  ignoreErrors: false,
  isEvalSupported: true,
  fontExtraProperties: false,
  useSystemFonts: true,
  cMapUrl: null,
  standardFontDataUrl: null,
});

const PatternType = {
  TILING: 1,
  SHADING: 2,
};

const deferred = Promise.resolve();

// Convert PDF blend mode names to HTML5 blend mode names.
function normalizeBlendMode(value, parsingArray = false) {
  if (Array.isArray(value)) {
    // Use the first *supported* BM value in the Array (fixes issue11279.pdf).
    for (let i = 0, ii = value.length; i < ii; i++) {
      const maybeBM = normalizeBlendMode(value[i], /* parsingArray = */ true);
      if (maybeBM) {
        return maybeBM;
      }
    }
    warn(`Unsupported blend mode Array: ${value}`);
    return "source-over";
  }

  if (!isName(value)) {
    if (parsingArray) {
      return null;
    }
    return "source-over";
  }
  switch (value.name) {
    case "Normal":
    case "Compatible":
      return "source-over";
    case "Multiply":
      return "multiply";
    case "Screen":
      return "screen";
    case "Overlay":
      return "overlay";
    case "Darken":
      return "darken";
    case "Lighten":
      return "lighten";
    case "ColorDodge":
      return "color-dodge";
    case "ColorBurn":
      return "color-burn";
    case "HardLight":
      return "hard-light";
    case "SoftLight":
      return "soft-light";
    case "Difference":
      return "difference";
    case "Exclusion":
      return "exclusion";
    case "Hue":
      return "hue";
    case "Saturation":
      return "saturation";
    case "Color":
      return "color";
    case "Luminosity":
      return "luminosity";
  }
  if (parsingArray) {
    return null;
  }
  warn(`Unsupported blend mode: ${value.name}`);
  return "source-over";
}

// Trying to minimize Date.now() usage and check every 100 time.
class TimeSlotManager {
  static get TIME_SLOT_DURATION_MS() {
    return shadow(this, "TIME_SLOT_DURATION_MS", 20);
  }

  static get CHECK_TIME_EVERY() {
    return shadow(this, "CHECK_TIME_EVERY", 100);
  }

  constructor() {
    this.reset();
  }

  check() {
    if (++this.checked < TimeSlotManager.CHECK_TIME_EVERY) {
      return false;
    }
    this.checked = 0;
    return this.endTime <= Date.now();
  }

  reset() {
    this.endTime = Date.now() + TimeSlotManager.TIME_SLOT_DURATION_MS;
    this.checked = 0;
  }
}

class PartialEvaluator {
  constructor({
    xref,
    handler,
    pageIndex,
    idFactory,
    fontCache,
    builtInCMapCache,
    standardFontDataCache,
    globalImageCache,
    options = null,
  }) {
    this.xref = xref;
    this.handler = handler;
    this.pageIndex = pageIndex;
    this.idFactory = idFactory;
    this.fontCache = fontCache;
    this.builtInCMapCache = builtInCMapCache;
    this.standardFontDataCache = standardFontDataCache;
    this.globalImageCache = globalImageCache;
    this.options = options || DefaultPartialEvaluatorOptions;
    this.parsingType3Font = false;

    this._fetchBuiltInCMapBound = this.fetchBuiltInCMap.bind(this);
  }

  /**
   * Since Functions are only cached (locally) by reference, we can share one
   * `PDFFunctionFactory` instance within this `PartialEvaluator` instance.
   */
  get _pdfFunctionFactory() {
    const pdfFunctionFactory = new PDFFunctionFactory({
      xref: this.xref,
      isEvalSupported: this.options.isEvalSupported,
    });
    return shadow(this, "_pdfFunctionFactory", pdfFunctionFactory);
  }

  clone(newOptions = null) {
    const newEvaluator = Object.create(this);
    newEvaluator.options = Object.assign(
      Object.create(null),
      this.options,
      newOptions
    );
    return newEvaluator;
  }

  hasBlendModes(resources, nonBlendModesSet) {
    if (!(resources instanceof Dict)) {
      return false;
    }
    if (resources.objId && nonBlendModesSet.has(resources.objId)) {
      return false;
    }

    const processed = new RefSet(nonBlendModesSet);
    if (resources.objId) {
      processed.put(resources.objId);
    }

    const nodes = [resources],
      xref = this.xref;
    while (nodes.length) {
      const node = nodes.shift();
      // First check the current resources for blend modes.
      const graphicStates = node.get("ExtGState");
      if (graphicStates instanceof Dict) {
        for (let graphicState of graphicStates.getRawValues()) {
          if (graphicState instanceof Ref) {
            if (processed.has(graphicState)) {
              continue; // The ExtGState has already been processed.
            }
            try {
              graphicState = xref.fetch(graphicState);
            } catch (ex) {
              // Avoid parsing a corrupt ExtGState more than once.
              processed.put(graphicState);

              info(`hasBlendModes - ignoring ExtGState: "${ex}".`);
              continue;
            }
          }
          if (!(graphicState instanceof Dict)) {
            continue;
          }
          if (graphicState.objId) {
            processed.put(graphicState.objId);
          }

          const bm = graphicState.get("BM");
          if (bm instanceof Name) {
            if (bm.name !== "Normal") {
              return true;
            }
            continue;
          }
          if (bm !== undefined && Array.isArray(bm)) {
            for (const element of bm) {
              if (element instanceof Name && element.name !== "Normal") {
                return true;
              }
            }
          }
        }
      }
      // Descend into the XObjects to look for more resources and blend modes.
      const xObjects = node.get("XObject");
      if (!(xObjects instanceof Dict)) {
        continue;
      }
      for (let xObject of xObjects.getRawValues()) {
        if (xObject instanceof Ref) {
          if (processed.has(xObject)) {
            // The XObject has already been processed, and by avoiding a
            // redundant `xref.fetch` we can *significantly* reduce the load
            // time for badly generated PDF files (fixes issue6961.pdf).
            continue;
          }
          try {
            xObject = xref.fetch(xObject);
          } catch (ex) {
            // Avoid parsing a corrupt XObject more than once.
            processed.put(xObject);

            info(`hasBlendModes - ignoring XObject: "${ex}".`);
            continue;
          }
        }
        if (!isStream(xObject)) {
          continue;
        }
        if (xObject.dict.objId) {
          processed.put(xObject.dict.objId);
        }
        const xResources = xObject.dict.get("Resources");
        if (!(xResources instanceof Dict)) {
          continue;
        }
        // Checking objId to detect an infinite loop.
        if (xResources.objId && processed.has(xResources.objId)) {
          continue;
        }

        nodes.push(xResources);
        if (xResources.objId) {
          processed.put(xResources.objId);
        }
      }
    }

    // When no blend modes exist, there's no need re-fetch/re-parse any of the
    // processed `Ref`s again for subsequent pages. This helps reduce redundant
    // `XRef.fetch` calls for some documents (e.g. issue6961.pdf).
    processed.forEach(ref => {
      nonBlendModesSet.put(ref);
    });
    return false;
  }

  async fetchBuiltInCMap(name) {
    const cachedData = this.builtInCMapCache.get(name);
    if (cachedData) {
      return cachedData;
    }
    let data;

    if (this.options.cMapUrl !== null) {
      // Only compressed CMaps are (currently) supported here.
      const url = `${this.options.cMapUrl}${name}.bcmap`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `fetchBuiltInCMap: failed to fetch file "${url}" with "${response.statusText}".`
        );
      }
      data = {
        cMapData: new Uint8Array(await response.arrayBuffer()),
        compressionType: CMapCompressionType.BINARY,
      };
    } else {
      // Get the data on the main-thread instead.
      data = await this.handler.sendWithPromise("FetchBuiltInCMap", { name });
    }

    if (data.compressionType !== CMapCompressionType.NONE) {
      // Given the size of uncompressed CMaps, only cache compressed ones.
      this.builtInCMapCache.set(name, data);
    }
    return data;
  }

  async fetchStandardFontData(name) {
    const cachedData = this.standardFontDataCache.get(name);
    if (cachedData) {
      return new Stream(cachedData);
    }

    // The symbol fonts are not consistent across platforms, always load the
    // standard font data for them.
    if (
      this.options.useSystemFonts &&
      name !== "Symbol" &&
      name !== "ZapfDingbats"
    ) {
      return null;
    }

    const standardFontNameToFileName = getFontNameToFileMap(),
      filename = standardFontNameToFileName[name];
    let data;

    if (this.options.standardFontDataUrl !== null) {
      const url = `${this.options.standardFontDataUrl}${filename}`;
      const response = await fetch(url);
      if (!response.ok) {
        warn(
          `fetchStandardFontData: failed to fetch file "${url}" with "${response.statusText}".`
        );
      } else {
        data = await response.arrayBuffer();
      }
    } else {
      // Get the data on the main-thread instead.
      try {
        data = await this.handler.sendWithPromise("FetchStandardFontData", {
          filename,
        });
      } catch (e) {
        warn(
          `fetchStandardFontData: failed to fetch file "${filename}" with "${e}".`
        );
      }
    }

    if (!data) {
      return null;
    }
    // Cache the "raw" standard font data, to avoid fetching it repeateadly
    // (see e.g. issue 11399).
    this.standardFontDataCache.set(name, data);

    return new Stream(data);
  }

  async buildFormXObject(
    resources,
    xobj,
    smask,
    operatorList,
    task,
    initialState,
    localColorSpaceCache
  ) {
    const dict = xobj.dict;
    const matrix = dict.getArray("Matrix");
    let bbox = dict.getArray("BBox");
    if (Array.isArray(bbox) && bbox.length === 4) {
      bbox = Util.normalizeRect(bbox);
    } else {
      bbox = null;
    }
    let optionalContent = null,
      groupOptions;
    if (dict.has("OC")) {
      optionalContent = await this.parseMarkedContentProps(
        dict.get("OC"),
        resources
      );
      operatorList.addOp(OPS.beginMarkedContentProps, ["OC", optionalContent]);
    }
    const group = dict.get("Group");
    if (group) {
      groupOptions = {
        matrix,
        bbox,
        smask,
        isolated: false,
        knockout: false,
      };

      const groupSubtype = group.get("S");
      let colorSpace = null;
      if (isName(groupSubtype, "Transparency")) {
        groupOptions.isolated = group.get("I") || false;
        groupOptions.knockout = group.get("K") || false;
        if (group.has("CS")) {
          const cs = group.getRaw("CS");

          const cachedColorSpace = ColorSpace.getCached(
            cs,
            this.xref,
            localColorSpaceCache
          );
          if (cachedColorSpace) {
            colorSpace = cachedColorSpace;
          } else {
            colorSpace = await this.parseColorSpace({
              cs,
              resources,
              localColorSpaceCache,
            });
          }
        }
      }

      if (smask && smask.backdrop) {
        colorSpace = colorSpace || ColorSpace.singletons.rgb;
        smask.backdrop = colorSpace.getRgb(smask.backdrop, 0);
      }

      operatorList.addOp(OPS.beginGroup, [groupOptions]);
    }

    operatorList.addOp(OPS.paintFormXObjectBegin, [matrix, bbox]);

    return this.getOperatorList({
      stream: xobj,
      task,
      resources: dict.get("Resources") || resources,
      operatorList,
      initialState,
    }).then(function () {
      operatorList.addOp(OPS.paintFormXObjectEnd, []);

      if (group) {
        operatorList.addOp(OPS.endGroup, [groupOptions]);
      }

      if (optionalContent) {
        operatorList.addOp(OPS.endMarkedContent, []);
      }
    });
  }

  _sendImgData(objId, imgData, cacheGlobally = false) {
    const transfers = imgData ? [imgData.data.buffer] : null;

    if (this.parsingType3Font || cacheGlobally) {
      return this.handler.send(
        "commonobj",
        [objId, "Image", imgData],
        transfers
      );
    }
    return this.handler.send(
      "obj",
      [objId, this.pageIndex, "Image", imgData],
      transfers
    );
  }

  async buildPaintImageXObject({
    resources,
    image,
    isInline = false,
    operatorList,
    cacheKey,
    localImageCache,
    localColorSpaceCache,
  }) {
    const dict = image.dict;
    const imageRef = dict.objId;
    const w = dict.get("Width", "W");
    const h = dict.get("Height", "H");

    if (!(w && isNum(w)) || !(h && isNum(h))) {
      warn("Image dimensions are missing, or not numbers.");
      return undefined;
    }
    const maxImageSize = this.options.maxImageSize;
    if (maxImageSize !== -1 && w * h > maxImageSize) {
      warn("Image exceeded maximum allowed size and was removed.");
      return undefined;
    }

    const imageMask = dict.get("ImageMask", "IM") || false;
    let imgData, args;
    if (imageMask) {
      // This depends on a tmpCanvas being filled with the
      // current fillStyle, such that processing the pixel
      // data can't be done here. Instead of creating a
      // complete PDFImage, only read the information needed
      // for later.

      const width = dict.get("Width", "W");
      const height = dict.get("Height", "H");
      const bitStrideLength = (width + 7) >> 3;
      const imgArray = image.getBytes(
        bitStrideLength * height,
        /* forceClamped = */ true
      );
      const decode = dict.getArray("Decode", "D");

      imgData = PDFImage.createMask({
        imgArray,
        width,
        height,
        imageIsFromDecodeStream: image instanceof DecodeStream,
        inverseDecode: !!decode && decode[0] > 0,
      });
      imgData.cached = !!cacheKey;
      args = [imgData];

      operatorList.addOp(OPS.paintImageMaskXObject, args);
      if (cacheKey) {
        localImageCache.set(cacheKey, imageRef, {
          fn: OPS.paintImageMaskXObject,
          args,
        });
      }
      return undefined;
    }

    const softMask = dict.get("SMask", "SM") || false;
    const mask = dict.get("Mask") || false;

    const SMALL_IMAGE_DIMENSIONS = 200;
    // Inlining small images into the queue as RGB data
    if (isInline && !softMask && !mask && w + h < SMALL_IMAGE_DIMENSIONS) {
      const imageObj = new PDFImage({
        xref: this.xref,
        res: resources,
        image,
        isInline,
        pdfFunctionFactory: this._pdfFunctionFactory,
        localColorSpaceCache,
      });
      // We force the use of RGBA_32BPP images here, because we can't handle
      // any other kind.
      imgData = imageObj.createImageData(/* forceRGBA = */ true);
      operatorList.addOp(OPS.paintInlineImageXObject, [imgData]);
      return undefined;
    }

    // If there is no imageMask, create the PDFImage and a lot
    // of image processing can be done here.
    let objId = `img_${this.idFactory.createObjId()}`,
      cacheGlobally = false;

    if (this.parsingType3Font) {
      objId = `${this.idFactory.getDocId()}_type3_${objId}`;
    } else if (imageRef) {
      cacheGlobally = this.globalImageCache.shouldCache(
        imageRef,
        this.pageIndex
      );

      if (cacheGlobally) {
        objId = `${this.idFactory.getDocId()}_${objId}`;
      }
    }

    // Ensure that the dependency is added before the image is decoded.
    operatorList.addDependency(objId);
    args = [objId, w, h];

    PDFImage.buildImage({
      xref: this.xref,
      res: resources,
      image,
      isInline,
      pdfFunctionFactory: this._pdfFunctionFactory,
      localColorSpaceCache,
    })
      .then(imageObj => {
        imgData = imageObj.createImageData(/* forceRGBA = */ false);

        if (cacheKey && imageRef && cacheGlobally) {
          this.globalImageCache.addByteSize(imageRef, imgData.data.length);
        }
        return this._sendImgData(objId, imgData, cacheGlobally);
      })
      .catch(reason => {
        warn(`Unable to decode image "${objId}": "${reason}".`);

        return this._sendImgData(objId, /* imgData = */ null, cacheGlobally);
      });

    operatorList.addOp(OPS.paintImageXObject, args);
    if (cacheKey) {
      localImageCache.set(cacheKey, imageRef, {
        fn: OPS.paintImageXObject,
        args,
      });

      if (imageRef) {
        assert(!isInline, "Cannot cache an inline image globally.");
        this.globalImageCache.addPageIndex(imageRef, this.pageIndex);

        if (cacheGlobally) {
          this.globalImageCache.setData(imageRef, {
            objId,
            fn: OPS.paintImageXObject,
            args,
            byteSize: 0, // Temporary entry, note `addByteSize` above.
          });
        }
      }
    }
    return undefined;
  }

  handleSMask(
    smask,
    resources,
    operatorList,
    task,
    stateManager,
    localColorSpaceCache
  ) {
    const smaskContent = smask.get("G");
    const smaskOptions = {
      subtype: smask.get("S").name,
      backdrop: smask.get("BC"),
    };

    // The SMask might have a alpha/luminosity value transfer function --
    // we will build a map of integer values in range 0..255 to be fast.
    const transferObj = smask.get("TR");
    if (isPDFFunction(transferObj)) {
      const transferFn = this._pdfFunctionFactory.create(transferObj);
      const transferMap = new Uint8Array(256);
      const tmp = new Float32Array(1);
      for (let i = 0; i < 256; i++) {
        tmp[0] = i / 255;
        transferFn(tmp, 0, tmp, 0);
        transferMap[i] = (tmp[0] * 255) | 0;
      }
      smaskOptions.transferMap = transferMap;
    }

    return this.buildFormXObject(
      resources,
      smaskContent,
      smaskOptions,
      operatorList,
      task,
      stateManager.state.clone(),
      localColorSpaceCache
    );
  }

  handleTransferFunction(tr) {
    let transferArray;
    if (Array.isArray(tr)) {
      transferArray = tr;
    } else if (isPDFFunction(tr)) {
      transferArray = [tr];
    } else {
      return null; // Not a valid transfer function entry.
    }

    const transferMaps = [];
    let numFns = 0,
      numEffectfulFns = 0;
    for (const entry of transferArray) {
      const transferObj = this.xref.fetchIfRef(entry);
      numFns++;

      if (isName(transferObj, "Identity")) {
        transferMaps.push(null);
        continue;
      } else if (!isPDFFunction(transferObj)) {
        return null; // Not a valid transfer function object.
      }

      const transferFn = this._pdfFunctionFactory.create(transferObj);
      const transferMap = new Uint8Array(256),
        tmp = new Float32Array(1);
      for (let j = 0; j < 256; j++) {
        tmp[0] = j / 255;
        transferFn(tmp, 0, tmp, 0);
        transferMap[j] = (tmp[0] * 255) | 0;
      }
      transferMaps.push(transferMap);
      numEffectfulFns++;
    }

    if (!(numFns === 1 || numFns === 4)) {
      return null; // Only 1 or 4 functions are supported, by the specification.
    }
    if (numEffectfulFns === 0) {
      return null; // Only /Identity transfer functions found, which are no-ops.
    }
    return transferMaps;
  }

  handleTilingType(
    fn,
    color,
    resources,
    pattern,
    patternDict,
    operatorList,
    task,
    cacheKey,
    localTilingPatternCache
  ) {
    // Create an IR of the pattern code.
    const tilingOpList = new OperatorList();
    // Merge the available resources, to prevent issues when the patternDict
    // is missing some /Resources entries (fixes issue6541.pdf).
    const patternResources = Dict.merge({
      xref: this.xref,
      dictArray: [patternDict.get("Resources"), resources],
    });

    return this.getOperatorList({
      stream: pattern,
      task,
      resources: patternResources,
      operatorList: tilingOpList,
    })
      .then(function () {
        const operatorListIR = tilingOpList.getIR();
        const tilingPatternIR = getTilingPatternIR(
          operatorListIR,
          patternDict,
          color
        );
        // Add the dependencies to the parent operator list so they are
        // resolved before the sub operator list is executed synchronously.
        operatorList.addDependencies(tilingOpList.dependencies);
        operatorList.addOp(fn, tilingPatternIR);

        if (cacheKey) {
          localTilingPatternCache.set(cacheKey, patternDict.objId, {
            operatorListIR,
            dict: patternDict,
          });
        }
      })
      .catch(reason => {
        if (reason instanceof AbortException) {
          return;
        }
        if (this.options.ignoreErrors) {
          // Error(s) in the TilingPattern -- sending unsupported feature
          // notification and allow rendering to continue.
          this.handler.send("UnsupportedFeature", {
            featureId: UNSUPPORTED_FEATURES.errorTilingPattern,
          });
          warn(`handleTilingType - ignoring pattern: "${reason}".`);
          return;
        }
        throw reason;
      });
  }

  handleSetFont(
    resources,
    fontArgs,
    fontRef,
    operatorList,
    task,
    state,
    fallbackFontDict = null,
    cssFontInfo = null
  ) {
    const fontName =
      fontArgs && fontArgs[0] instanceof Name ? fontArgs[0].name : null;

    return this.loadFont(
      fontName,
      fontRef,
      resources,
      fallbackFontDict,
      cssFontInfo
    )
      .then(translated => {
        if (!translated.font.isType3Font) {
          return translated;
        }
        return translated
          .loadType3Data(this, resources, task)
          .then(function () {
            // Add the dependencies to the parent operatorList so they are
            // resolved before Type3 operatorLists are executed synchronously.
            operatorList.addDependencies(translated.type3Dependencies);

            return translated;
          })
          .catch(reason => {
            // Error in the font data -- sending unsupported feature
            // notification.
            this.handler.send("UnsupportedFeature", {
              featureId: UNSUPPORTED_FEATURES.errorFontLoadType3,
            });
            return new TranslatedFont({
              loadedName: "g_font_error",
              font: new ErrorFont(`Type3 font load error: ${reason}`),
              dict: translated.font,
              evaluatorOptions: this.options,
            });
          });
      })
      .then(translated => {
        state.font = translated.font;
        translated.send(this.handler);
        return translated.loadedName;
      });
  }

  handleText(chars, state) {
    const font = state.font;
    const glyphs = font.charsToGlyphs(chars);

    if (font.data) {
      const isAddToPathSet = !!(
        state.textRenderingMode & TextRenderingMode.ADD_TO_PATH_FLAG
      );
      if (
        isAddToPathSet ||
        state.fillColorSpace.name === "Pattern" ||
        font.disableFontFace ||
        this.options.disableFontFace
      ) {
        PartialEvaluator.buildFontPaths(
          font,
          glyphs,
          this.handler,
          this.options
        );
      }
    }
    return glyphs;
  }

  ensureStateFont(state) {
    if (state.font) {
      return;
    }
    const reason = new FormatError(
      "Missing setFont (Tf) operator before text rendering operator."
    );

    if (this.options.ignoreErrors) {
      // Missing setFont operator before text rendering operator -- sending
      // unsupported feature notification and allow rendering to continue.
      this.handler.send("UnsupportedFeature", {
        featureId: UNSUPPORTED_FEATURES.errorFontState,
      });
      warn(`ensureStateFont: "${reason}".`);
      return;
    }
    throw reason;
  }

  async setGState({
    resources,
    gState,
    operatorList,
    cacheKey,
    task,
    stateManager,
    localGStateCache,
    localColorSpaceCache,
  }) {
    const gStateRef = gState.objId;
    let isSimpleGState = true;
    // This array holds the converted/processed state data.
    const gStateObj = [];
    const gStateKeys = gState.getKeys();
    let promise = Promise.resolve();
    for (let i = 0, ii = gStateKeys.length; i < ii; i++) {
      const key = gStateKeys[i];
      const value = gState.get(key);
      switch (key) {
        case "Type":
          break;
        case "LW":
        case "LC":
        case "LJ":
        case "ML":
        case "D":
        case "RI":
        case "FL":
        case "CA":
        case "ca":
          gStateObj.push([key, value]);
          break;
        case "Font":
          isSimpleGState = false;

          promise = promise.then(() => {
            return this.handleSetFont(
              resources,
              null,
              value[0],
              operatorList,
              task,
              stateManager.state
            ).then(function (loadedName) {
              operatorList.addDependency(loadedName);
              gStateObj.push([key, [loadedName, value[1]]]);
            });
          });
          break;
        case "BM":
          gStateObj.push([key, normalizeBlendMode(value)]);
          break;
        case "SMask":
          if (isName(value, "None")) {
            gStateObj.push([key, false]);
            break;
          }
          if (isDict(value)) {
            isSimpleGState = false;

            promise = promise.then(() => {
              return this.handleSMask(
                value,
                resources,
                operatorList,
                task,
                stateManager,
                localColorSpaceCache
              );
            });
            gStateObj.push([key, true]);
          } else {
            warn("Unsupported SMask type");
          }
          break;
        case "TR":
          const transferMaps = this.handleTransferFunction(value);
          gStateObj.push([key, transferMaps]);
          break;
        // Only generate info log messages for the following since
        // they are unlikely to have a big impact on the rendering.
        case "OP":
        case "op":
        case "OPM":
        case "BG":
        case "BG2":
        case "UCR":
        case "UCR2":
        case "TR2":
        case "HT":
        case "SM":
        case "SA":
        case "AIS":
        case "TK":
          // TODO implement these operators.
          info("graphic state operator " + key);
          break;
        default:
          info("Unknown graphic state operator " + key);
          break;
      }
    }
    return promise.then(function () {
      if (gStateObj.length > 0) {
        operatorList.addOp(OPS.setGState, [gStateObj]);
      }

      if (isSimpleGState) {
        localGStateCache.set(cacheKey, gStateRef, gStateObj);
      }
    });
  }

  loadFont(
    fontName,
    font,
    resources,
    fallbackFontDict = null,
    cssFontInfo = null
  ) {
    const errorFont = async () => {
      return new TranslatedFont({
        loadedName: "g_font_error",
        font: new ErrorFont(`Font "${fontName}" is not available.`),
        dict: font,
        evaluatorOptions: this.options,
      });
    };

    const xref = this.xref;
    let fontRef;
    if (font) {
      // Loading by ref.
      if (!isRef(font)) {
        throw new FormatError('The "font" object should be a reference.');
      }
      fontRef = font;
    } else {
      // Loading by name.
      const fontRes = resources.get("Font");
      if (fontRes) {
        fontRef = fontRes.getRaw(fontName);
      }
    }
    if (!fontRef) {
      const partialMsg = `Font "${
        fontName || (font && font.toString())
      }" is not available`;

      if (!this.options.ignoreErrors && !this.parsingType3Font) {
        warn(`${partialMsg}.`);
        return errorFont();
      }
      // Font not found -- sending unsupported feature notification.
      this.handler.send("UnsupportedFeature", {
        featureId: UNSUPPORTED_FEATURES.errorFontMissing,
      });
      warn(`${partialMsg} -- attempting to fallback to a default font.`);

      // Falling back to a default font to avoid completely broken rendering,
      // but note that there're no guarantees that things will look "correct".
      if (fallbackFontDict) {
        fontRef = fallbackFontDict;
      } else {
        fontRef = PartialEvaluator.fallbackFontDict;
      }
    }

    if (this.fontCache.has(fontRef)) {
      return this.fontCache.get(fontRef);
    }

    font = xref.fetchIfRef(fontRef);
    if (!isDict(font)) {
      return errorFont();
    }

    // We are holding `font.cacheKey` references only for `fontRef`s that
    // are not actually `Ref`s, but rather `Dict`s. See explanation below.
    if (font.cacheKey && this.fontCache.has(font.cacheKey)) {
      return this.fontCache.get(font.cacheKey);
    }

    const fontCapability = createPromiseCapability();

    let preEvaluatedFont;
    try {
      preEvaluatedFont = this.preEvaluateFont(font);
      preEvaluatedFont.cssFontInfo = cssFontInfo;
    } catch (reason) {
      warn(`loadFont - preEvaluateFont failed: "${reason}".`);
      return errorFont();
    }
    const { descriptor, hash } = preEvaluatedFont;

    const fontRefIsRef = isRef(fontRef);
    let fontID;
    if (fontRefIsRef) {
      fontID = `f${fontRef.toString()}`;
    }

    if (hash && isDict(descriptor)) {
      if (!descriptor.fontAliases) {
        descriptor.fontAliases = Object.create(null);
      }
      const fontAliases = descriptor.fontAliases;

      if (fontAliases[hash]) {
        const aliasFontRef = fontAliases[hash].aliasRef;
        if (fontRefIsRef && aliasFontRef && this.fontCache.has(aliasFontRef)) {
          this.fontCache.putAlias(fontRef, aliasFontRef);
          return this.fontCache.get(fontRef);
        }
      } else {
        fontAliases[hash] = {
          fontID: this.idFactory.createFontId(),
        };
      }

      if (fontRefIsRef) {
        fontAliases[hash].aliasRef = fontRef;
      }
      fontID = fontAliases[hash].fontID;
    }

    // Workaround for bad PDF generators that reference fonts incorrectly,
    // where `fontRef` is a `Dict` rather than a `Ref` (fixes bug946506.pdf).
    // In this case we cannot put the font into `this.fontCache` (which is
    // a `RefSetCache`), since it's not possible to use a `Dict` as a key.
    //
    // However, if we don't cache the font it's not possible to remove it
    // when `cleanup` is triggered from the API, which causes issues on
    // subsequent rendering operations (see issue7403.pdf) and would force us
    // to unnecessarily load the same fonts over and over.
    //
    // Instead, we cheat a bit by using a modified `fontID` as a key in
    // `this.fontCache`, to allow the font to be cached.
    // NOTE: This works because `RefSetCache` calls `toString()` on provided
    //       keys. Also, since `fontRef` is used when getting cached fonts,
    //       we'll not accidentally match fonts cached with the `fontID`.
    if (fontRefIsRef) {
      this.fontCache.put(fontRef, fontCapability.promise);
    } else {
      if (!fontID) {
        fontID = this.idFactory.createFontId();
      }
      font.cacheKey = `cacheKey_${fontID}`;
      this.fontCache.put(font.cacheKey, fontCapability.promise);
    }
    assert(
      fontID && fontID.startsWith("f"),
      'The "fontID" must be (correctly) defined.'
    );

    // Keep track of each font we translated so the caller can
    // load them asynchronously before calling display on a page.
    font.loadedName = `${this.idFactory.getDocId()}_${fontID}`;

    this.translateFont(preEvaluatedFont)
      .then(translatedFont => {
        if (translatedFont.fontType !== undefined) {
          const xrefFontStats = xref.stats.fontTypes;
          xrefFontStats[translatedFont.fontType] = true;
        }

        fontCapability.resolve(
          new TranslatedFont({
            loadedName: font.loadedName,
            font: translatedFont,
            dict: font,
            evaluatorOptions: this.options,
          })
        );
      })
      .catch(reason => {
        // TODO fontCapability.reject?
        // Error in the font data -- sending unsupported feature notification.
        this.handler.send("UnsupportedFeature", {
          featureId: UNSUPPORTED_FEATURES.errorFontTranslate,
        });
        warn(`loadFont - translateFont failed: "${reason}".`);

        try {
          // error, but it's still nice to have font type reported
          const fontFile3 = descriptor && descriptor.get("FontFile3");
          const subtype = fontFile3 && fontFile3.get("Subtype");
          const fontType = getFontType(
            preEvaluatedFont.type,
            subtype && subtype.name
          );
          const xrefFontStats = xref.stats.fontTypes;
          xrefFontStats[fontType] = true;
        } catch (ex) {}

        fontCapability.resolve(
          new TranslatedFont({
            loadedName: font.loadedName,
            font: new ErrorFont(
              reason instanceof Error ? reason.message : reason
            ),
            dict: font,
            evaluatorOptions: this.options,
          })
        );
      });
    return fontCapability.promise;
  }

  buildPath(operatorList, fn, args, parsingText = false) {
    const lastIndex = operatorList.length - 1;
    if (!args) {
      args = [];
    }
    if (
      lastIndex < 0 ||
      operatorList.fnArray[lastIndex] !== OPS.constructPath
    ) {
      // Handle corrupt PDF documents that contains path operators inside of
      // text objects, which may shift subsequent text, by enclosing the path
      // operator in save/restore operators (fixes issue10542_reduced.pdf).
      //
      // Note that this will effectively disable the optimization in the
      // `else` branch below, but given that this type of corruption is
      // *extremely* rare that shouldn't really matter much in practice.
      if (parsingText) {
        warn(`Encountered path operator "${fn}" inside of a text object.`);
        operatorList.addOp(OPS.save, null);
      }

      operatorList.addOp(OPS.constructPath, [[fn], args]);

      if (parsingText) {
        operatorList.addOp(OPS.restore, null);
      }
    } else {
      const opArgs = operatorList.argsArray[lastIndex];
      opArgs[0].push(fn);
      Array.prototype.push.apply(opArgs[1], args);
    }
  }

  parseColorSpace({ cs, resources, localColorSpaceCache }) {
    return ColorSpace.parseAsync({
      cs,
      xref: this.xref,
      resources,
      pdfFunctionFactory: this._pdfFunctionFactory,
      localColorSpaceCache,
    }).catch(reason => {
      if (reason instanceof AbortException) {
        return null;
      }
      if (this.options.ignoreErrors) {
        // Error(s) in the ColorSpace -- sending unsupported feature
        // notification and allow rendering to continue.
        this.handler.send("UnsupportedFeature", {
          featureId: UNSUPPORTED_FEATURES.errorColorSpace,
        });
        warn(`parseColorSpace - ignoring ColorSpace: "${reason}".`);
        return null;
      }
      throw reason;
    });
  }

  handleColorN(
    operatorList,
    fn,
    args,
    cs,
    patterns,
    resources,
    task,
    localColorSpaceCache,
    localTilingPatternCache
  ) {
    // compile tiling patterns
    const patternName = args.pop();
    // SCN/scn applies patterns along with normal colors
    if (patternName instanceof Name) {
      const name = patternName.name;

      const localTilingPattern = localTilingPatternCache.getByName(name);
      if (localTilingPattern) {
        try {
          const color = cs.base ? cs.base.getRgb(args, 0) : null;
          const tilingPatternIR = getTilingPatternIR(
            localTilingPattern.operatorListIR,
            localTilingPattern.dict,
            color
          );
          operatorList.addOp(fn, tilingPatternIR);
          return undefined;
        } catch (ex) {
          // Handle any errors during normal TilingPattern parsing.
        }
      }
      // TODO: Attempt to lookup cached TilingPatterns by reference as well,
      //       if and only if there are PDF documents where doing so would
      //       significantly improve performance.

      let pattern = patterns.get(name);
      if (pattern) {
        const dict = isStream(pattern) ? pattern.dict : pattern;
        const typeNum = dict.get("PatternType");

        if (typeNum === PatternType.TILING) {
          const color = cs.base ? cs.base.getRgb(args, 0) : null;
          return this.handleTilingType(
            fn,
            color,
            resources,
            pattern,
            dict,
            operatorList,
            task,
            /* cacheKey = */ name,
            localTilingPatternCache
          );
        } else if (typeNum === PatternType.SHADING) {
          const shading = dict.get("Shading");
          const matrix = dict.getArray("Matrix");
          pattern = Pattern.parseShading(
            shading,
            matrix,
            this.xref,
            resources,
            this.handler,
            this._pdfFunctionFactory,
            localColorSpaceCache
          );
          operatorList.addOp(fn, pattern.getIR());
          return undefined;
        }
        throw new FormatError(`Unknown PatternType: ${typeNum}`);
      }
    }
    throw new FormatError(`Unknown PatternName: ${patternName}`);
  }

  _parseVisibilityExpression(array, nestingCounter, currentResult) {
    const MAX_NESTING = 10;
    if (++nestingCounter > MAX_NESTING) {
      warn("Visibility expression is too deeply nested");
      return;
    }
    const length = array.length;
    const operator = this.xref.fetchIfRef(array[0]);
    if (length < 2 || !isName(operator)) {
      warn("Invalid visibility expression");
      return;
    }
    switch (operator.name) {
      case "And":
      case "Or":
      case "Not":
        currentResult.push(operator.name);
        break;
      default:
        warn(`Invalid operator ${operator.name} in visibility expression`);
        return;
    }
    for (let i = 1; i < length; i++) {
      const raw = array[i];
      const object = this.xref.fetchIfRef(raw);
      if (Array.isArray(object)) {
        const nestedResult = [];
        currentResult.push(nestedResult);
        // Recursively parse a subarray.
        this._parseVisibilityExpression(object, nestingCounter, nestedResult);
      } else if (isRef(raw)) {
        // Reference to an OCG dictionary.
        currentResult.push(raw.toString());
      }
    }
  }

  async parseMarkedContentProps(contentProperties, resources) {
    let optionalContent;
    if (isName(contentProperties)) {
      const properties = resources.get("Properties");
      optionalContent = properties.get(contentProperties.name);
    } else if (isDict(contentProperties)) {
      optionalContent = contentProperties;
    } else {
      throw new FormatError("Optional content properties malformed.");
    }

    const optionalContentType = optionalContent.get("Type").name;
    if (optionalContentType === "OCG") {
      return {
        type: optionalContentType,
        id: optionalContent.objId,
      };
    } else if (optionalContentType === "OCMD") {
      const expression = optionalContent.get("VE");
      if (Array.isArray(expression)) {
        const result = [];
        this._parseVisibilityExpression(expression, 0, result);
        if (result.length > 0) {
          return {
            type: "OCMD",
            expression: result,
          };
        }
      }

      const optionalContentGroups = optionalContent.get("OCGs");
      if (
        Array.isArray(optionalContentGroups) ||
        isDict(optionalContentGroups)
      ) {
        const groupIds = [];
        if (Array.isArray(optionalContentGroups)) {
          for (const ocg of optionalContentGroups) {
            groupIds.push(ocg.toString());
          }
        } else {
          // Dictionary, just use the obj id.
          groupIds.push(optionalContentGroups.objId);
        }

        return {
          type: optionalContentType,
          ids: groupIds,
          policy: isName(optionalContent.get("P"))
            ? optionalContent.get("P").name
            : null,
          expression: null,
        };
      } else if (isRef(optionalContentGroups)) {
        return {
          type: optionalContentType,
          id: optionalContentGroups.toString(),
        };
      }
    }
    return null;
  }

  getOperatorList({
    stream,
    task,
    resources,
    operatorList,
    initialState = null,
    fallbackFontDict = null,
  }) {
    // Ensure that `resources`/`initialState` is correctly initialized,
    // even if the provided parameter is e.g. `null`.
    resources = resources || Dict.empty;
    initialState = initialState || new EvalState();

    if (!operatorList) {
      throw new Error('getOperatorList: missing "operatorList" parameter');
    }

    const self = this;
    const xref = this.xref;
    let parsingText = false;
    const localImageCache = new LocalImageCache();
    const localColorSpaceCache = new LocalColorSpaceCache();
    const localGStateCache = new LocalGStateCache();
    const localTilingPatternCache = new LocalTilingPatternCache();

    const xobjs = resources.get("XObject") || Dict.empty;
    const patterns = resources.get("Pattern") || Dict.empty;
    const stateManager = new StateManager(initialState);
    const preprocessor = new EvaluatorPreprocessor(stream, xref, stateManager);
    const timeSlotManager = new TimeSlotManager();

    function closePendingRestoreOPS(argument) {
      for (let i = 0, ii = preprocessor.savedStatesDepth; i < ii; i++) {
        operatorList.addOp(OPS.restore, []);
      }
    }

    return new Promise(function promiseBody(resolve, reject) {
      const next = function (promise) {
        Promise.all([promise, operatorList.ready]).then(function () {
          try {
            promiseBody(resolve, reject);
          } catch (ex) {
            reject(ex);
          }
        }, reject);
      };
      task.ensureNotTerminated();
      timeSlotManager.reset();

      const operation = {};
      let stop, i, ii, cs, name;
      while (!(stop = timeSlotManager.check())) {
        // The arguments parsed by read() are used beyond this loop, so we
        // cannot reuse the same array on each iteration. Therefore we pass
        // in |null| as the initial value (see the comment on
        // EvaluatorPreprocessor_read() for why).
        operation.args = null;
        if (!preprocessor.read(operation)) {
          break;
        }
        let args = operation.args;
        let fn = operation.fn;

        switch (fn | 0) {
          case OPS.paintXObject:
            // eagerly compile XForm objects
            name = args[0].name;
            if (name) {
              const localImage = localImageCache.getByName(name);
              if (localImage) {
                operatorList.addOp(localImage.fn, localImage.args);
                args = null;
                continue;
              }
            }

            next(
              new Promise(function (resolveXObject, rejectXObject) {
                if (!name) {
                  throw new FormatError("XObject must be referred to by name.");
                }

                let xobj = xobjs.getRaw(name);
                if (xobj instanceof Ref) {
                  const localImage = localImageCache.getByRef(xobj);
                  if (localImage) {
                    operatorList.addOp(localImage.fn, localImage.args);

                    resolveXObject();
                    return;
                  }

                  const globalImage = self.globalImageCache.getData(
                    xobj,
                    self.pageIndex
                  );
                  if (globalImage) {
                    operatorList.addDependency(globalImage.objId);
                    operatorList.addOp(globalImage.fn, globalImage.args);

                    resolveXObject();
                    return;
                  }

                  xobj = xref.fetch(xobj);
                }

                if (!isStream(xobj)) {
                  throw new FormatError("XObject should be a stream");
                }

                const type = xobj.dict.get("Subtype");
                if (!isName(type)) {
                  throw new FormatError("XObject should have a Name subtype");
                }

                if (type.name === "Form") {
                  stateManager.save();
                  self
                    .buildFormXObject(
                      resources,
                      xobj,
                      null,
                      operatorList,
                      task,
                      stateManager.state.clone(),
                      localColorSpaceCache
                    )
                    .then(function () {
                      stateManager.restore();
                      resolveXObject();
                    }, rejectXObject);
                  return;
                } else if (type.name === "Image") {
                  self
                    .buildPaintImageXObject({
                      resources,
                      image: xobj,
                      operatorList,
                      cacheKey: name,
                      localImageCache,
                      localColorSpaceCache,
                    })
                    .then(resolveXObject, rejectXObject);
                  return;
                } else if (type.name === "PS") {
                  // PostScript XObjects are unused when viewing documents.
                  // See section 4.7.1 of Adobe's PDF reference.
                  info("Ignored XObject subtype PS");
                } else {
                  throw new FormatError(
                    `Unhandled XObject subtype ${type.name}`
                  );
                }
                resolveXObject();
              }).catch(function (reason) {
                if (reason instanceof AbortException) {
                  return;
                }
                if (self.options.ignoreErrors) {
                  // Error(s) in the XObject -- sending unsupported feature
                  // notification and allow rendering to continue.
                  self.handler.send("UnsupportedFeature", {
                    featureId: UNSUPPORTED_FEATURES.errorXObject,
                  });
                  warn(`getOperatorList - ignoring XObject: "${reason}".`);
                  return;
                }
                throw reason;
              })
            );
            return;
          case OPS.setFont:
            var fontSize = args[1];
            // eagerly collect all fonts
            next(
              self
                .handleSetFont(
                  resources,
                  args,
                  null,
                  operatorList,
                  task,
                  stateManager.state,
                  fallbackFontDict
                )
                .then(function (loadedName) {
                  operatorList.addDependency(loadedName);
                  operatorList.addOp(OPS.setFont, [loadedName, fontSize]);
                })
            );
            return;
          case OPS.beginText:
            parsingText = true;
            break;
          case OPS.endText:
            parsingText = false;
            break;
          case OPS.endInlineImage:
            var cacheKey = args[0].cacheKey;
            if (cacheKey) {
              const localImage = localImageCache.getByName(cacheKey);
              if (localImage) {
                operatorList.addOp(localImage.fn, localImage.args);
                args = null;
                continue;
              }
            }
            next(
              self.buildPaintImageXObject({
                resources,
                image: args[0],
                isInline: true,
                operatorList,
                cacheKey,
                localImageCache,
                localColorSpaceCache,
              })
            );
            return;
          case OPS.showText:
            if (!stateManager.state.font) {
              self.ensureStateFont(stateManager.state);
              continue;
            }
            args[0] = self.handleText(args[0], stateManager.state);
            break;
          case OPS.showSpacedText:
            if (!stateManager.state.font) {
              self.ensureStateFont(stateManager.state);
              continue;
            }
            var arr = args[0];
            var combinedGlyphs = [];
            var arrLength = arr.length;
            var state = stateManager.state;
            for (i = 0; i < arrLength; ++i) {
              const arrItem = arr[i];
              if (isString(arrItem)) {
                Array.prototype.push.apply(
                  combinedGlyphs,
                  self.handleText(arrItem, state)
                );
              } else if (isNum(arrItem)) {
                combinedGlyphs.push(arrItem);
              }
            }
            args[0] = combinedGlyphs;
            fn = OPS.showText;
            break;
          case OPS.nextLineShowText:
            if (!stateManager.state.font) {
              self.ensureStateFont(stateManager.state);
              continue;
            }
            operatorList.addOp(OPS.nextLine);
            args[0] = self.handleText(args[0], stateManager.state);
            fn = OPS.showText;
            break;
          case OPS.nextLineSetSpacingShowText:
            if (!stateManager.state.font) {
              self.ensureStateFont(stateManager.state);
              continue;
            }
            operatorList.addOp(OPS.nextLine);
            operatorList.addOp(OPS.setWordSpacing, [args.shift()]);
            operatorList.addOp(OPS.setCharSpacing, [args.shift()]);
            args[0] = self.handleText(args[0], stateManager.state);
            fn = OPS.showText;
            break;
          case OPS.setTextRenderingMode:
            stateManager.state.textRenderingMode = args[0];
            break;

          case OPS.setFillColorSpace: {
            const cachedColorSpace = ColorSpace.getCached(
              args[0],
              xref,
              localColorSpaceCache
            );
            if (cachedColorSpace) {
              stateManager.state.fillColorSpace = cachedColorSpace;
              continue;
            }

            next(
              self
                .parseColorSpace({
                  cs: args[0],
                  resources,
                  localColorSpaceCache,
                })
                .then(function (colorSpace) {
                  if (colorSpace) {
                    stateManager.state.fillColorSpace = colorSpace;
                  }
                })
            );
            return;
          }
          case OPS.setStrokeColorSpace: {
            const cachedColorSpace = ColorSpace.getCached(
              args[0],
              xref,
              localColorSpaceCache
            );
            if (cachedColorSpace) {
              stateManager.state.strokeColorSpace = cachedColorSpace;
              continue;
            }

            next(
              self
                .parseColorSpace({
                  cs: args[0],
                  resources,
                  localColorSpaceCache,
                })
                .then(function (colorSpace) {
                  if (colorSpace) {
                    stateManager.state.strokeColorSpace = colorSpace;
                  }
                })
            );
            return;
          }
          case OPS.setFillColor:
            cs = stateManager.state.fillColorSpace;
            args = cs.getRgb(args, 0);
            fn = OPS.setFillRGBColor;
            break;
          case OPS.setStrokeColor:
            cs = stateManager.state.strokeColorSpace;
            args = cs.getRgb(args, 0);
            fn = OPS.setStrokeRGBColor;
            break;
          case OPS.setFillGray:
            stateManager.state.fillColorSpace = ColorSpace.singletons.gray;
            args = ColorSpace.singletons.gray.getRgb(args, 0);
            fn = OPS.setFillRGBColor;
            break;
          case OPS.setStrokeGray:
            stateManager.state.strokeColorSpace = ColorSpace.singletons.gray;
            args = ColorSpace.singletons.gray.getRgb(args, 0);
            fn = OPS.setStrokeRGBColor;
            break;
          case OPS.setFillCMYKColor:
            stateManager.state.fillColorSpace = ColorSpace.singletons.cmyk;
            args = ColorSpace.singletons.cmyk.getRgb(args, 0);
            fn = OPS.setFillRGBColor;
            break;
          case OPS.setStrokeCMYKColor:
            stateManager.state.strokeColorSpace = ColorSpace.singletons.cmyk;
            args = ColorSpace.singletons.cmyk.getRgb(args, 0);
            fn = OPS.setStrokeRGBColor;
            break;
          case OPS.setFillRGBColor:
            stateManager.state.fillColorSpace = ColorSpace.singletons.rgb;
            args = ColorSpace.singletons.rgb.getRgb(args, 0);
            break;
          case OPS.setStrokeRGBColor:
            stateManager.state.strokeColorSpace = ColorSpace.singletons.rgb;
            args = ColorSpace.singletons.rgb.getRgb(args, 0);
            break;
          case OPS.setFillColorN:
            cs = stateManager.state.fillColorSpace;
            if (cs.name === "Pattern") {
              next(
                self.handleColorN(
                  operatorList,
                  OPS.setFillColorN,
                  args,
                  cs,
                  patterns,
                  resources,
                  task,
                  localColorSpaceCache,
                  localTilingPatternCache
                )
              );
              return;
            }
            args = cs.getRgb(args, 0);
            fn = OPS.setFillRGBColor;
            break;
          case OPS.setStrokeColorN:
            cs = stateManager.state.strokeColorSpace;
            if (cs.name === "Pattern") {
              next(
                self.handleColorN(
                  operatorList,
                  OPS.setStrokeColorN,
                  args,
                  cs,
                  patterns,
                  resources,
                  task,
                  localColorSpaceCache,
                  localTilingPatternCache
                )
              );
              return;
            }
            args = cs.getRgb(args, 0);
            fn = OPS.setStrokeRGBColor;
            break;

          case OPS.shadingFill:
            var shadingRes = resources.get("Shading");
            if (!shadingRes) {
              throw new FormatError("No shading resource found");
            }

            var shading = shadingRes.get(args[0].name);
            if (!shading) {
              throw new FormatError("No shading object found");
            }

            var shadingFill = Pattern.parseShading(
              shading,
              null,
              xref,
              resources,
              self.handler,
              self._pdfFunctionFactory,
              localColorSpaceCache
            );
            var patternIR = shadingFill.getIR();
            args = [patternIR];
            fn = OPS.shadingFill;
            break;
          case OPS.setGState:
            name = args[0].name;
            if (name) {
              const localGStateObj = localGStateCache.getByName(name);
              if (localGStateObj) {
                if (localGStateObj.length > 0) {
                  operatorList.addOp(OPS.setGState, [localGStateObj]);
                }
                args = null;
                continue;
              }
            }

            next(
              new Promise(function (resolveGState, rejectGState) {
                if (!name) {
                  throw new FormatError("GState must be referred to by name.");
                }

                const extGState = resources.get("ExtGState");
                if (!(extGState instanceof Dict)) {
                  throw new FormatError("ExtGState should be a dictionary.");
                }

                const gState = extGState.get(name);
                // TODO: Attempt to lookup cached GStates by reference as well,
                //       if and only if there are PDF documents where doing so
                //       would significantly improve performance.
                if (!(gState instanceof Dict)) {
                  throw new FormatError("GState should be a dictionary.");
                }

                self
                  .setGState({
                    resources,
                    gState,
                    operatorList,
                    cacheKey: name,
                    task,
                    stateManager,
                    localGStateCache,
                    localColorSpaceCache,
                  })
                  .then(resolveGState, rejectGState);
              }).catch(function (reason) {
                if (reason instanceof AbortException) {
                  return;
                }
                if (self.options.ignoreErrors) {
                  // Error(s) in the ExtGState -- sending unsupported feature
                  // notification and allow parsing/rendering to continue.
                  self.handler.send("UnsupportedFeature", {
                    featureId: UNSUPPORTED_FEATURES.errorExtGState,
                  });
                  warn(`getOperatorList - ignoring ExtGState: "${reason}".`);
                  return;
                }
                throw reason;
              })
            );
            return;
          case OPS.moveTo:
          case OPS.lineTo:
          case OPS.curveTo:
          case OPS.curveTo2:
          case OPS.curveTo3:
          case OPS.closePath:
          case OPS.rectangle:
            self.buildPath(operatorList, fn, args, parsingText);
            continue;
          case OPS.markPoint:
          case OPS.markPointProps:
          case OPS.beginCompat:
          case OPS.endCompat:
            // Ignore operators where the corresponding handlers are known to
            // be no-op in CanvasGraphics (display/canvas.js). This prevents
            // serialization errors and is also a bit more efficient.
            // We could also try to serialize all objects in a general way,
            // e.g. as done in https://github.com/mozilla/pdf.js/pull/6266,
            // but doing so is meaningless without knowing the semantics.
            continue;
          case OPS.beginMarkedContentProps:
            if (!isName(args[0])) {
              warn(`Expected name for beginMarkedContentProps arg0=${args[0]}`);
              continue;
            }
            if (args[0].name === "OC") {
              next(
                self
                  .parseMarkedContentProps(args[1], resources)
                  .then(data => {
                    operatorList.addOp(OPS.beginMarkedContentProps, [
                      "OC",
                      data,
                    ]);
                  })
                  .catch(reason => {
                    if (reason instanceof AbortException) {
                      return;
                    }
                    if (self.options.ignoreErrors) {
                      self.handler.send("UnsupportedFeature", {
                        featureId: UNSUPPORTED_FEATURES.errorMarkedContent,
                      });
                      warn(
                        `getOperatorList - ignoring beginMarkedContentProps: "${reason}".`
                      );
                      return;
                    }
                    throw reason;
                  })
              );
              return;
            }
            // Other marked content types aren't supported yet.
            args = [
              args[0].name,
              args[1] instanceof Dict ? args[1].get("MCID") : null,
            ];

            break;
          case OPS.beginMarkedContent:
          case OPS.endMarkedContent:
          default:
            // Note: Ignore the operator if it has `Dict` arguments, since
            // those are non-serializable, otherwise postMessage will throw
            // "An object could not be cloned.".
            if (args !== null) {
              for (i = 0, ii = args.length; i < ii; i++) {
                if (args[i] instanceof Dict) {
                  break;
                }
              }
              if (i < ii) {
                warn("getOperatorList - ignoring operator: " + fn);
                continue;
              }
            }
        }
        operatorList.addOp(fn, args);
      }
      if (stop) {
        next(deferred);
        return;
      }
      // Some PDFs don't close all restores inside object/form.
      // Closing those for them.
      closePendingRestoreOPS();
      resolve();
    }).catch(reason => {
      if (reason instanceof AbortException) {
        return;
      }
      if (this.options.ignoreErrors) {
        // Error(s) in the OperatorList -- sending unsupported feature
        // notification and allow rendering to continue.
        this.handler.send("UnsupportedFeature", {
          featureId: UNSUPPORTED_FEATURES.errorOperatorList,
        });
        warn(
          `getOperatorList - ignoring errors during "${task.name}" ` +
            `task: "${reason}".`
        );

        closePendingRestoreOPS();
        return;
      }
      throw reason;
    });
  }

  getTextContent({
    stream,
    task,
    resources,
    stateManager = null,
    normalizeWhitespace = false,
    combineTextItems = false,
    includeMarkedContent = false,
    sink,
    seenStyles = new Set(),
  }) {
    // Ensure that `resources`/`stateManager` is correctly initialized,
    // even if the provided parameter is e.g. `null`.
    resources = resources || Dict.empty;
    stateManager = stateManager || new StateManager(new TextState());

    const WhitespaceRegexp = /\s/g;

    const textContent = {
      items: [],
      styles: Object.create(null),
    };
    const textContentItem = {
      initialized: false,
      str: [],
      totalWidth: 0,
      totalHeight: 0,
      width: 0,
      height: 0,
      vertical: false,
      lastCharSize: 0,
      prevTransform: null,
      textAdvanceScale: 0,
      spaceWidth: 0,
      spaceInFlowMin: 0,
      spaceInFlowMax: 0,
      trackingSpaceMin: Infinity,
      transform: null,
      fontName: null,
      hasEOL: false,
      isLastCharWhiteSpace: false,
    };

    // Used in addFakeSpaces.
    // wsw stands for whitespace width.

    // A white <= wsw * TRACKING_SPACE_FACTOR is a tracking space
    // so it doesn't count as a space.
    const TRACKING_SPACE_FACTOR = 0.3;

    // A white with a width in [wsw * MIN_FACTOR; wsw * MAX_FACTOR]
    // is a space which will be inserted in the current flow of words.
    // If the width is outside of this range then the flow is broken
    // (which means a new span in the text layer).
    // It's useful to adjust the best as possible the span in the layer
    // to what is displayed in the canvas.
    const SPACE_IN_FLOW_MIN_FACTOR = 0.3;
    const SPACE_IN_FLOW_MAX_FACTOR = 1.3;

    const self = this;
    const xref = this.xref;
    const showSpacedTextBuffer = [];

    // The xobj is parsed iff it's needed, e.g. if there is a `DO` cmd.
    let xobjs = null;
    const emptyXObjectCache = new LocalImageCache();
    const emptyGStateCache = new LocalGStateCache();

    const preprocessor = new EvaluatorPreprocessor(stream, xref, stateManager);

    let textState;

    function getCurrentTextTransform() {
      // 9.4.4 Text Space Details
      const font = textState.font;
      const tsm = [
        textState.fontSize * textState.textHScale,
        0,
        0,
        textState.fontSize,
        0,
        textState.textRise,
      ];

      if (
        font.isType3Font &&
        (textState.fontSize <= 1 || font.isCharBBox) &&
        !isArrayEqual(textState.fontMatrix, FONT_IDENTITY_MATRIX)
      ) {
        const glyphHeight = font.bbox[3] - font.bbox[1];
        if (glyphHeight > 0) {
          tsm[3] *= glyphHeight * textState.fontMatrix[3];
        }
      }

      return Util.transform(
        textState.ctm,
        Util.transform(textState.textMatrix, tsm)
      );
    }

    function ensureTextContentItem() {
      if (textContentItem.initialized) {
        return textContentItem;
      }
      const font = textState.font,
        loadedName = font.loadedName;
      if (!seenStyles.has(loadedName)) {
        seenStyles.add(loadedName);

        textContent.styles[loadedName] = {
          fontFamily: font.fallbackName,
          ascent: font.ascent,
          descent: font.descent,
          vertical: font.vertical,
        };
      }
      textContentItem.fontName = loadedName;

      const trm = (textContentItem.transform = getCurrentTextTransform());
      if (!font.vertical) {
        textContentItem.width = textContentItem.totalWidth = 0;
        textContentItem.height = textContentItem.totalHeight = Math.hypot(
          trm[2],
          trm[3]
        );
        textContentItem.vertical = false;
      } else {
        textContentItem.width = textContentItem.totalWidth = Math.hypot(
          trm[0],
          trm[1]
        );
        textContentItem.height = textContentItem.totalHeight = 0;
        textContentItem.vertical = true;
      }

      const scaleLineX = Math.hypot(
        textState.textLineMatrix[0],
        textState.textLineMatrix[1]
      );
      const scaleCtmX = Math.hypot(textState.ctm[0], textState.ctm[1]);
      textContentItem.textAdvanceScale = scaleCtmX * scaleLineX;
      textContentItem.lastCharSize = textContentItem.lastCharSize || 0;

      const spaceWidth = (font.spaceWidth / 1000) * textState.fontSize;
      if (spaceWidth) {
        textContentItem.spaceWidth = spaceWidth;
        textContentItem.trackingSpaceMin = spaceWidth * TRACKING_SPACE_FACTOR;
        textContentItem.spaceInFlowMin = spaceWidth * SPACE_IN_FLOW_MIN_FACTOR;
        textContentItem.spaceInFlowMax = spaceWidth * SPACE_IN_FLOW_MAX_FACTOR;
      } else {
        textContentItem.spaceWidth = 0;
        textContentItem.trackingSpaceMin = Infinity;
      }

      textContentItem.hasEOL = false;

      textContentItem.initialized = true;
      return textContentItem;
    }

    function updateAdvanceScale() {
      if (!textContentItem.initialized) {
        return;
      }

      const scaleLineX = Math.hypot(
        textState.textLineMatrix[0],
        textState.textLineMatrix[1]
      );
      const scaleCtmX = Math.hypot(textState.ctm[0], textState.ctm[1]);
      const scaleFactor = scaleCtmX * scaleLineX;
      if (scaleFactor === textContentItem.textAdvanceScale) {
        return;
      }

      if (!textContentItem.vertical) {
        textContentItem.totalWidth +=
          textContentItem.width * textContentItem.textAdvanceScale;
        textContentItem.width = 0;
      } else {
        textContentItem.totalHeight +=
          textContentItem.height * textContentItem.textAdvanceScale;
        textContentItem.height = 0;
      }

      textContentItem.textAdvanceScale = scaleFactor;
    }

    function replaceWhitespace(str) {
      // Replaces all whitespaces with standard spaces (0x20), to avoid
      // alignment issues between the textLayer and the canvas if the text
      // contains e.g. tabs (fixes issue6612.pdf).
      const ii = str.length;
      let i = 0,
        code;
      while (i < ii && (code = str.charCodeAt(i)) >= 0x20 && code <= 0x7f) {
        i++;
      }
      return i < ii ? str.replace(WhitespaceRegexp, " ") : str;
    }

    function runBidiTransform(textChunk) {
      const text = textChunk.str.join("");
      const bidiResult = bidi(text, -1, textChunk.vertical);
      const str = normalizeWhitespace
        ? replaceWhitespace(bidiResult.str)
        : bidiResult.str;
      return {
        str,
        dir: bidiResult.dir,
        width: textChunk.totalWidth,
        height: textChunk.totalHeight,
        transform: textChunk.transform,
        fontName: textChunk.fontName,
        hasEOL: textChunk.hasEOL,
      };
    }

    function handleSetFont(fontName, fontRef) {
      return self
        .loadFont(fontName, fontRef, resources)
        .then(function (translated) {
          if (!translated.font.isType3Font) {
            return translated;
          }
          return translated
            .loadType3Data(self, resources, task)
            .catch(function () {
              // Ignore Type3-parsing errors, since we only use `loadType3Data`
              // here to ensure that we'll always obtain a useful /FontBBox.
            })
            .then(function () {
              return translated;
            });
        })
        .then(function (translated) {
          textState.font = translated.font;
          textState.fontMatrix =
            translated.font.fontMatrix || FONT_IDENTITY_MATRIX;
        });
    }

    function compareWithLastPosition(fontSize) {
      if (
        !combineTextItems ||
        !textState.font ||
        !textContentItem.prevTransform
      ) {
        return;
      }

      const currentTransform = getCurrentTextTransform();
      const posX = currentTransform[4];
      const posY = currentTransform[5];
      const lastPosX = textContentItem.prevTransform[4];
      const lastPosY = textContentItem.prevTransform[5];

      if (lastPosX === posX && lastPosY === posY) {
        return;
      }

      const advanceX = (posX - lastPosX) / textContentItem.textAdvanceScale;
      const advanceY = (posY - lastPosY) / textContentItem.textAdvanceScale;
      const HALF_LAST_CHAR = -0.5 * textContentItem.lastCharSize;

      if (textState.font.vertical) {
        if (
          Math.abs(advanceX) >
          textContentItem.width /
            textContentItem.textAdvanceScale /* not the same column */
        ) {
          appendEOL();
          return;
        }

        if (HALF_LAST_CHAR > advanceY) {
          return;
        }

        if (advanceY > textContentItem.trackingSpaceMin) {
          textContentItem.height += advanceY;
        } else if (!addFakeSpaces(advanceY, 0, textContentItem.prevTransform)) {
          if (textContentItem.str.length === 0) {
            textContent.items.push({
              str: " ",
              dir: "ltr",
              width: 0,
              height: advanceY,
              transform: textContentItem.prevTransform,
              fontName: textContentItem.fontName,
              hasEOL: false,
            });
            textContentItem.isLastCharWhiteSpace = true;
          } else {
            textContentItem.height += advanceY;
          }
        }

        return;
      }

      if (
        Math.abs(advanceY) >
        textContentItem.height /
          textContentItem.textAdvanceScale /* not the same line */
      ) {
        appendEOL();
        return;
      }

      if (HALF_LAST_CHAR > advanceX) {
        return;
      }

      if (advanceX <= textContentItem.trackingSpaceMin) {
        textContentItem.width += advanceX;
      } else if (!addFakeSpaces(advanceX, 0, textContentItem.prevTransform)) {
        if (textContentItem.str.length === 0) {
          textContent.items.push({
            str: " ",
            dir: "ltr",
            width: advanceX,
            height: 0,
            transform: textContentItem.prevTransform,
            fontName: textContentItem.fontName,
            hasEOL: false,
          });
          textContentItem.isLastCharWhiteSpace = true;
        } else {
          textContentItem.width += advanceX;
        }
      }
    }

    function buildTextContentItem({ chars, extraSpacing, isFirstChunk }) {
      const font = textState.font;
      if (!chars) {
        // Just move according to the space we have.
        const charSpacing = textState.charSpacing + extraSpacing;
        if (charSpacing) {
          if (!font.vertical) {
            textState.translateTextMatrix(
              charSpacing * textState.textHScale,
              0
            );
          } else {
            textState.translateTextMatrix(0, charSpacing);
          }
        }

        return;
      }

      const NormalizedUnicodes = getNormalizedUnicodes();
      const glyphs = font.charsToGlyphs(chars);
      const scale = textState.fontMatrix[0] * textState.fontSize;
      if (isFirstChunk) {
        compareWithLastPosition(scale);
      }

      let textChunk = ensureTextContentItem();
      let size = 0;
      let lastCharSize = 0;

      for (let i = 0, ii = glyphs.length; i < ii; i++) {
        const glyph = glyphs[i];
        let charSpacing =
          textState.charSpacing + (i === ii - 1 ? extraSpacing : 0);

        let glyphUnicode = glyph.unicode;
        if (glyph.isSpace) {
          charSpacing += textState.wordSpacing;
          textChunk.isLastCharWhiteSpace = true;
        } else {
          glyphUnicode = NormalizedUnicodes[glyphUnicode] || glyphUnicode;
          glyphUnicode = reverseIfRtl(glyphUnicode);
          textChunk.isLastCharWhiteSpace = false;
        }
        textChunk.str.push(glyphUnicode);

        const glyphWidth =
          font.vertical && glyph.vmetric ? glyph.vmetric[0] : glyph.width;

        let scaledDim = glyphWidth * scale;
        if (!font.vertical) {
          scaledDim *= textState.textHScale;
          textState.translateTextMatrix(scaledDim, 0);
        } else {
          textState.translateTextMatrix(0, scaledDim);
          scaledDim = Math.abs(scaledDim);
        }
        size += scaledDim;

        if (charSpacing) {
          if (!font.vertical) {
            charSpacing *= textState.textHScale;
          }

          scaledDim += charSpacing;
          const wasSplit =
            charSpacing > textContentItem.trackingSpaceMin &&
            addFakeSpaces(charSpacing, size);
          if (!font.vertical) {
            textState.translateTextMatrix(charSpacing, 0);
          } else {
            textState.translateTextMatrix(0, charSpacing);
          }

          if (wasSplit) {
            textChunk = ensureTextContentItem();
            size = 0;
          } else {
            size += charSpacing;
          }
        }

        lastCharSize = scaledDim;
      }

      textChunk.lastCharSize = lastCharSize;
      if (!font.vertical) {
        textChunk.width += size;
      } else {
        textChunk.height += size;
      }

      textChunk.prevTransform = getCurrentTextTransform();
    }

    function appendEOL() {
      if (textContentItem.initialized) {
        textContentItem.hasEOL = true;
        flushTextContentItem();
      } else if (textContent.items.length > 0) {
        textContent.items[textContent.items.length - 1].hasEOL = true;
      } else {
        textContent.items.push({
          str: "",
          dir: "ltr",
          width: 0,
          height: 0,
          transform: getCurrentTextTransform(),
          fontName: textState.font.loadedName,
          hasEOL: true,
        });
      }

      textContentItem.isLastCharWhiteSpace = false;
      textContentItem.lastCharSize = 0;
    }

    function addFakeSpaces(width, size, transf = null) {
      if (
        textContentItem.spaceInFlowMin <= width &&
        width <= textContentItem.spaceInFlowMax
      ) {
        if (textContentItem.initialized) {
          textContentItem.str.push(" ");
          textContentItem.isLastCharWhiteSpace = true;
        }
        return false;
      }

      const fontName = textContentItem.fontName;

      let height = 0;
      width *= textContentItem.textAdvanceScale;
      if (!textContentItem.vertical) {
        textContentItem.width += size;
      } else {
        textContentItem.height += size;
        height = width;
        width = 0;
      }

      flushTextContentItem();

      if (textContentItem.isLastCharWhiteSpace) {
        return true;
      }

      textContentItem.isLastCharWhiteSpace = true;
      textContent.items.push({
        str: " ",
        // TODO: check if using the orientation from last chunk is
        // better or not.
        dir: "ltr",
        width,
        height,
        transform: transf ? transf : getCurrentTextTransform(),
        fontName,
        hasEOL: false,
      });

      return true;
    }

    function flushTextContentItem() {
      if (!textContentItem.initialized || !textContentItem.str) {
        return;
      }

      // Do final text scaling.
      if (!textContentItem.vertical) {
        textContentItem.totalWidth +=
          textContentItem.width * textContentItem.textAdvanceScale;
      } else {
        textContentItem.totalHeight +=
          textContentItem.height * textContentItem.textAdvanceScale;
      }

      textContent.items.push(runBidiTransform(textContentItem));
      textContentItem.initialized = false;
      textContentItem.str.length = 0;
    }

    function enqueueChunk() {
      const length = textContent.items.length;
      if (length > 0) {
        sink.enqueue(textContent, length);
        textContent.items = [];
        textContent.styles = Object.create(null);
      }
    }

    const timeSlotManager = new TimeSlotManager();

    return new Promise(function promiseBody(resolve, reject) {
      const next = function (promise) {
        enqueueChunk();
        Promise.all([promise, sink.ready]).then(function () {
          try {
            promiseBody(resolve, reject);
          } catch (ex) {
            reject(ex);
          }
        }, reject);
      };
      task.ensureNotTerminated();
      timeSlotManager.reset();

      const operation = {};
      let stop,
        args = [];
      while (!(stop = timeSlotManager.check())) {
        // The arguments parsed by read() are not used beyond this loop, so
        // we can reuse the same array on every iteration, thus avoiding
        // unnecessary allocations.
        args.length = 0;
        operation.args = args;
        if (!preprocessor.read(operation)) {
          break;
        }
        textState = stateManager.state;
        const fn = operation.fn;
        args = operation.args;

        switch (fn | 0) {
          case OPS.setFont:
            // Optimization to ignore multiple identical Tf commands.
            var fontNameArg = args[0].name,
              fontSizeArg = args[1];
            if (
              textState.font &&
              fontNameArg === textState.fontName &&
              fontSizeArg === textState.fontSize
            ) {
              break;
            }

            flushTextContentItem();
            textState.fontName = fontNameArg;
            textState.fontSize = fontSizeArg;
            next(handleSetFont(fontNameArg, null));
            return;
          case OPS.setTextRise:
            flushTextContentItem();
            textState.textRise = args[0];
            break;
          case OPS.setHScale:
            flushTextContentItem();
            textState.textHScale = args[0] / 100;
            break;
          case OPS.setLeading:
            flushTextContentItem();
            textState.leading = args[0];
            break;
          case OPS.moveText:
            textState.translateTextLineMatrix(args[0], args[1]);
            textState.textMatrix = textState.textLineMatrix.slice();
            break;
          case OPS.setLeadingMoveText:
            flushTextContentItem();
            textState.leading = -args[1];
            textState.translateTextLineMatrix(args[0], args[1]);
            textState.textMatrix = textState.textLineMatrix.slice();
            break;
          case OPS.nextLine:
            appendEOL();
            textState.carriageReturn();
            break;
          case OPS.setTextMatrix:
            textState.setTextMatrix(
              args[0],
              args[1],
              args[2],
              args[3],
              args[4],
              args[5]
            );
            textState.setTextLineMatrix(
              args[0],
              args[1],
              args[2],
              args[3],
              args[4],
              args[5]
            );
            updateAdvanceScale();
            break;
          case OPS.setCharSpacing:
            textState.charSpacing = args[0];
            break;
          case OPS.setWordSpacing:
            textState.wordSpacing = args[0];
            break;
          case OPS.beginText:
            flushTextContentItem();
            textState.textMatrix = IDENTITY_MATRIX.slice();
            textState.textLineMatrix = IDENTITY_MATRIX.slice();
            break;
          case OPS.showSpacedText:
            if (!stateManager.state.font) {
              self.ensureStateFont(stateManager.state);
              continue;
            }

            const spaceFactor =
              ((textState.font.vertical ? 1 : -1) * textState.fontSize) / 1000;
            const elements = args[0];
            let isFirstChunk = true;
            for (let i = 0, ii = elements.length; i < ii - 1; i++) {
              const item = elements[i];
              if (typeof item === "string") {
                showSpacedTextBuffer.push(item);
              } else if (typeof item === "number" && item !== 0) {
                // PDF Specification 5.3.2 states:
                // The number is expressed in thousandths of a unit of text
                // space.
                // This amount is subtracted from the current horizontal or
                // vertical coordinate, depending on the writing mode.
                // In the default coordinate system, a positive adjustment
                // has the effect of moving the next glyph painted either to
                // the left or down by the given amount.
                const str = showSpacedTextBuffer.join("");
                showSpacedTextBuffer.length = 0;
                buildTextContentItem({
                  chars: str,
                  extraSpacing: item * spaceFactor,
                  isFirstChunk,
                });
                if (str && isFirstChunk) {
                  isFirstChunk = false;
                }
              }
            }

            const item = elements[elements.length - 1];
            if (typeof item === "string") {
              showSpacedTextBuffer.push(item);
            }

            if (showSpacedTextBuffer.length > 0) {
              const str = showSpacedTextBuffer.join("");
              showSpacedTextBuffer.length = 0;
              buildTextContentItem({
                chars: str,
                extraSpacing: 0,
                isFirstChunk,
              });
            }
            break;
          case OPS.showText:
            if (!stateManager.state.font) {
              self.ensureStateFont(stateManager.state);
              continue;
            }

            buildTextContentItem({
              chars: args[0],
              extraSpacing: 0,
              isFirstChunk: true,
            });
            break;
          case OPS.nextLineShowText:
            if (!stateManager.state.font) {
              self.ensureStateFont(stateManager.state);
              continue;
            }
            textContentItem.hasEOL = true;
            flushTextContentItem();
            textState.carriageReturn();
            buildTextContentItem({
              chars: args[0],
              extraSpacing: 0,
              isFirstChunk: true,
            });
            break;
          case OPS.nextLineSetSpacingShowText:
            if (!stateManager.state.font) {
              self.ensureStateFont(stateManager.state);
              continue;
            }
            textContentItem.hasEOL = true;
            flushTextContentItem();
            textState.wordSpacing = args[0];
            textState.charSpacing = args[1];
            textState.carriageReturn();
            buildTextContentItem({
              chars: args[2],
              extraSpacing: 0,
              isFirstChunk: true,
            });
            break;
          case OPS.paintXObject:
            flushTextContentItem();
            if (!xobjs) {
              xobjs = resources.get("XObject") || Dict.empty;
            }

            var name = args[0].name;
            if (name && emptyXObjectCache.getByName(name)) {
              break;
            }

            next(
              new Promise(function (resolveXObject, rejectXObject) {
                if (!name) {
                  throw new FormatError("XObject must be referred to by name.");
                }

                let xobj = xobjs.getRaw(name);
                if (xobj instanceof Ref) {
                  if (emptyXObjectCache.getByRef(xobj)) {
                    resolveXObject();
                    return;
                  }

                  const globalImage = self.globalImageCache.getData(
                    xobj,
                    self.pageIndex
                  );
                  if (globalImage) {
                    resolveXObject();
                    return;
                  }

                  xobj = xref.fetch(xobj);
                }

                if (!isStream(xobj)) {
                  throw new FormatError("XObject should be a stream");
                }

                const type = xobj.dict.get("Subtype");
                if (!isName(type)) {
                  throw new FormatError("XObject should have a Name subtype");
                }

                if (type.name !== "Form") {
                  emptyXObjectCache.set(name, xobj.dict.objId, true);

                  resolveXObject();
                  return;
                }

                // Use a new `StateManager` to prevent incorrect positioning
                // of textItems *after* the Form XObject, since errors in the
                // data can otherwise prevent `restore` operators from
                // executing.
                // NOTE: Only an issue when `options.ignoreErrors === true`.
                const currentState = stateManager.state.clone();
                const xObjStateManager = new StateManager(currentState);

                const matrix = xobj.dict.getArray("Matrix");
                if (Array.isArray(matrix) && matrix.length === 6) {
                  xObjStateManager.transform(matrix);
                }

                // Enqueue the `textContent` chunk before parsing the /Form
                // XObject.
                enqueueChunk();
                const sinkWrapper = {
                  enqueueInvoked: false,

                  enqueue(chunk, size) {
                    this.enqueueInvoked = true;
                    sink.enqueue(chunk, size);
                  },

                  get desiredSize() {
                    return sink.desiredSize;
                  },

                  get ready() {
                    return sink.ready;
                  },
                };

                self
                  .getTextContent({
                    stream: xobj,
                    task,
                    resources: xobj.dict.get("Resources") || resources,
                    stateManager: xObjStateManager,
                    normalizeWhitespace,
                    combineTextItems,
                    includeMarkedContent,
                    sink: sinkWrapper,
                    seenStyles,
                  })
                  .then(function () {
                    if (!sinkWrapper.enqueueInvoked) {
                      emptyXObjectCache.set(name, xobj.dict.objId, true);
                    }
                    resolveXObject();
                  }, rejectXObject);
              }).catch(function (reason) {
                if (reason instanceof AbortException) {
                  return;
                }
                if (self.options.ignoreErrors) {
                  // Error(s) in the XObject -- allow text-extraction to
                  // continue.
                  warn(`getTextContent - ignoring XObject: "${reason}".`);
                  return;
                }
                throw reason;
              })
            );
            return;
          case OPS.setGState:
            name = args[0].name;
            if (name && emptyGStateCache.getByName(name)) {
              break;
            }

            next(
              new Promise(function (resolveGState, rejectGState) {
                if (!name) {
                  throw new FormatError("GState must be referred to by name.");
                }

                const extGState = resources.get("ExtGState");
                if (!(extGState instanceof Dict)) {
                  throw new FormatError("ExtGState should be a dictionary.");
                }

                const gState = extGState.get(name);
                // TODO: Attempt to lookup cached GStates by reference as well,
                //       if and only if there are PDF documents where doing so
                //       would significantly improve performance.
                if (!(gState instanceof Dict)) {
                  throw new FormatError("GState should be a dictionary.");
                }

                const gStateFont = gState.get("Font");
                if (!gStateFont) {
                  emptyGStateCache.set(name, gState.objId, true);

                  resolveGState();
                  return;
                }
                flushTextContentItem();

                textState.fontName = null;
                textState.fontSize = gStateFont[1];
                handleSetFont(null, gStateFont[0]).then(
                  resolveGState,
                  rejectGState
                );
              }).catch(function (reason) {
                if (reason instanceof AbortException) {
                  return;
                }
                if (self.options.ignoreErrors) {
                  // Error(s) in the ExtGState -- allow text-extraction to
                  // continue.
                  warn(`getTextContent - ignoring ExtGState: "${reason}".`);
                  return;
                }
                throw reason;
              })
            );
            return;
          case OPS.beginMarkedContent:
            if (includeMarkedContent) {
              textContent.items.push({
                type: "beginMarkedContent",
                tag: isName(args[0]) ? args[0].name : null,
              });
            }
            break;
          case OPS.beginMarkedContentProps:
            if (includeMarkedContent) {
              flushTextContentItem();
              let mcid = null;
              if (isDict(args[1])) {
                mcid = args[1].get("MCID");
              }
              textContent.items.push({
                type: "beginMarkedContentProps",
                id: Number.isInteger(mcid)
                  ? `${self.idFactory.getPageObjId()}_mcid${mcid}`
                  : null,
                tag: isName(args[0]) ? args[0].name : null,
              });
            }
            break;
          case OPS.endMarkedContent:
            if (includeMarkedContent) {
              flushTextContentItem();
              textContent.items.push({
                type: "endMarkedContent",
              });
            }
            break;
        } // switch
        if (textContent.items.length >= sink.desiredSize) {
          // Wait for ready, if we reach highWaterMark.
          stop = true;
          break;
        }
      } // while
      if (stop) {
        next(deferred);
        return;
      }
      flushTextContentItem();
      enqueueChunk();
      resolve();
    }).catch(reason => {
      if (reason instanceof AbortException) {
        return;
      }
      if (this.options.ignoreErrors) {
        // Error(s) in the TextContent -- allow text-extraction to continue.
        warn(
          `getTextContent - ignoring errors during "${task.name}" ` +
            `task: "${reason}".`
        );

        flushTextContentItem();
        enqueueChunk();
        return;
      }
      throw reason;
    });
  }

  extractDataStructures(dict, baseDict, properties) {
    const xref = this.xref;
    let cidToGidBytes;
    // 9.10.2
    const toUnicodePromise = this.readToUnicode(
      properties.toUnicode || dict.get("ToUnicode") || baseDict.get("ToUnicode")
    );

    if (properties.composite) {
      // CIDSystemInfo helps to match CID to glyphs
      const cidSystemInfo = dict.get("CIDSystemInfo");
      if (isDict(cidSystemInfo)) {
        properties.cidSystemInfo = {
          registry: stringToPDFString(cidSystemInfo.get("Registry")),
          ordering: stringToPDFString(cidSystemInfo.get("Ordering")),
          supplement: cidSystemInfo.get("Supplement"),
        };
      }

      const cidToGidMap = dict.get("CIDToGIDMap");
      if (isStream(cidToGidMap)) {
        cidToGidBytes = cidToGidMap.getBytes();
      }
    }

    // Based on 9.6.6 of the spec the encoding can come from multiple places
    // and depends on the font type. The base encoding and differences are
    // read here, but the encoding that is actually used is chosen during
    // glyph mapping in the font.
    // TODO: Loading the built in encoding in the font would allow the
    // differences to be merged in here not require us to hold on to it.
    const differences = [];
    let baseEncodingName = null;
    let encoding;
    if (dict.has("Encoding")) {
      encoding = dict.get("Encoding");
      if (isDict(encoding)) {
        baseEncodingName = encoding.get("BaseEncoding");
        baseEncodingName = isName(baseEncodingName)
          ? baseEncodingName.name
          : null;
        // Load the differences between the base and original
        if (encoding.has("Differences")) {
          const diffEncoding = encoding.get("Differences");
          let index = 0;
          for (let j = 0, jj = diffEncoding.length; j < jj; j++) {
            const data = xref.fetchIfRef(diffEncoding[j]);
            if (isNum(data)) {
              index = data;
            } else if (isName(data)) {
              differences[index++] = data.name;
            } else {
              throw new FormatError(
                `Invalid entry in 'Differences' array: ${data}`
              );
            }
          }
        }
      } else if (isName(encoding)) {
        baseEncodingName = encoding.name;
      } else {
        throw new FormatError("Encoding is not a Name nor a Dict");
      }
      // According to table 114 if the encoding is a named encoding it must be
      // one of these predefined encodings.
      if (
        baseEncodingName !== "MacRomanEncoding" &&
        baseEncodingName !== "MacExpertEncoding" &&
        baseEncodingName !== "WinAnsiEncoding"
      ) {
        baseEncodingName = null;
      }
    }

    if (baseEncodingName) {
      properties.defaultEncoding = getEncoding(baseEncodingName);
    } else {
      const isSymbolicFont = !!(properties.flags & FontFlags.Symbolic);
      const isNonsymbolicFont = !!(properties.flags & FontFlags.Nonsymbolic);
      // According to "Table 114" in section "9.6.6.1 General" (under
      // "9.6.6 Character Encoding") of the PDF specification, a Nonsymbolic
      // font should use the `StandardEncoding` if no encoding is specified.
      encoding = StandardEncoding;
      if (properties.type === "TrueType" && !isNonsymbolicFont) {
        encoding = WinAnsiEncoding;
      }
      // The Symbolic attribute can be misused for regular fonts
      // Heuristic: we have to check if the font is a standard one also
      if (isSymbolicFont) {
        encoding = MacRomanEncoding;
        if (!properties.file || properties.isInternalFont) {
          if (/Symbol/i.test(properties.name)) {
            encoding = SymbolSetEncoding;
          } else if (/Dingbats|Wingdings/i.test(properties.name)) {
            encoding = ZapfDingbatsEncoding;
          }
        }
      }
      properties.defaultEncoding = encoding;
    }

    properties.differences = differences;
    properties.baseEncodingName = baseEncodingName;
    properties.hasEncoding = !!baseEncodingName || differences.length > 0;
    properties.dict = dict;
    return toUnicodePromise
      .then(readToUnicode => {
        properties.toUnicode = readToUnicode;
        return this.buildToUnicode(properties);
      })
      .then(builtToUnicode => {
        properties.toUnicode = builtToUnicode;
        if (cidToGidBytes) {
          properties.cidToGidMap = this.readCidToGidMap(
            cidToGidBytes,
            builtToUnicode
          );
        }
        return properties;
      });
  }

  /**
   * @returns {Array}
   * @private
   */
  _simpleFontToUnicode(properties, forceGlyphs = false) {
    assert(!properties.composite, "Must be a simple font.");

    const toUnicode = [];
    const encoding = properties.defaultEncoding.slice();
    const baseEncodingName = properties.baseEncodingName;
    // Merge in the differences array.
    const differences = properties.differences;
    for (const charcode in differences) {
      const glyphName = differences[charcode];
      if (glyphName === ".notdef") {
        // Skip .notdef to prevent rendering errors, e.g. boxes appearing
        // where there should be spaces (fixes issue5256.pdf).
        continue;
      }
      encoding[charcode] = glyphName;
    }
    const glyphsUnicodeMap = getGlyphsUnicode();
    for (const charcode in encoding) {
      // a) Map the character code to a character name.
      let glyphName = encoding[charcode];
      // b) Look up the character name in the Adobe Glyph List (see the
      //    Bibliography) to obtain the corresponding Unicode value.
      if (glyphName === "") {
        continue;
      } else if (glyphsUnicodeMap[glyphName] === undefined) {
        // (undocumented) c) Few heuristics to recognize unknown glyphs
        // NOTE: Adobe Reader does not do this step, but OSX Preview does
        let code = 0;
        switch (glyphName[0]) {
          case "G": // Gxx glyph
            if (glyphName.length === 3) {
              code = parseInt(glyphName.substring(1), 16);
            }
            break;
          case "g": // g00xx glyph
            if (glyphName.length === 5) {
              code = parseInt(glyphName.substring(1), 16);
            }
            break;
          case "C": // Cdd{d} glyph
          case "c": // cdd{d} glyph
            if (glyphName.length >= 3 && glyphName.length <= 4) {
              const codeStr = glyphName.substring(1);

              if (forceGlyphs) {
                code = parseInt(codeStr, 16);
                break;
              }
              // Normally the Cdd{d}/cdd{d} glyphName format will contain
              // regular, i.e. base 10, charCodes (see issue4550.pdf)...
              code = +codeStr;

              // ... however some PDF generators violate that assumption by
              // containing glyph, i.e. base 16, codes instead.
              // In that case we need to re-parse the *entire* encoding to
              // prevent broken text-selection (fixes issue9655_reduced.pdf).
              if (
                Number.isNaN(code) &&
                Number.isInteger(parseInt(codeStr, 16))
              ) {
                return this._simpleFontToUnicode(
                  properties,
                  /* forceGlyphs */ true
                );
              }
            }
            break;
          default:
            // 'uniXXXX'/'uXXXX{XX}' glyphs
            const unicode = getUnicodeForGlyph(glyphName, glyphsUnicodeMap);
            if (unicode !== -1) {
              code = unicode;
            }
        }
        if (code > 0 && code <= 0x10ffff && Number.isInteger(code)) {
          // If `baseEncodingName` is one the predefined encodings, and `code`
          // equals `charcode`, using the glyph defined in the baseEncoding
          // seems to yield a better `toUnicode` mapping (fixes issue 5070).
          if (baseEncodingName && code === +charcode) {
            const baseEncoding = getEncoding(baseEncodingName);
            if (baseEncoding && (glyphName = baseEncoding[charcode])) {
              toUnicode[charcode] = String.fromCharCode(
                glyphsUnicodeMap[glyphName]
              );
              continue;
            }
          }
          toUnicode[charcode] = String.fromCodePoint(code);
        }
        continue;
      }
      toUnicode[charcode] = String.fromCharCode(glyphsUnicodeMap[glyphName]);
    }
    return toUnicode;
  }

  /**
   * Builds a char code to unicode map based on section 9.10 of the spec.
   * @param {Object} properties Font properties object.
   * @returns {Promise} A Promise that is resolved with a
   *   {ToUnicodeMap|IdentityToUnicodeMap} object.
   */
  async buildToUnicode(properties) {
    properties.hasIncludedToUnicodeMap =
      !!properties.toUnicode && properties.toUnicode.length > 0;

    // Section 9.10.2 Mapping Character Codes to Unicode Values
    if (properties.hasIncludedToUnicodeMap) {
      // Some fonts contain incomplete ToUnicode data, causing issues with
      // text-extraction. For simple fonts, containing encoding information,
      // use a fallback ToUnicode map to improve this (fixes issue8229.pdf).
      if (!properties.composite && properties.hasEncoding) {
        properties.fallbackToUnicode = this._simpleFontToUnicode(properties);
      }
      return properties.toUnicode;
    }

    // According to the spec if the font is a simple font we should only map
    // to unicode if the base encoding is MacRoman, MacExpert, or WinAnsi or
    // the differences array only contains adobe standard or symbol set names,
    // in pratice it seems better to always try to create a toUnicode map
    // based of the default encoding.
    if (!properties.composite /* is simple font */) {
      return new ToUnicodeMap(this._simpleFontToUnicode(properties));
    }

    // If the font is a composite font that uses one of the predefined CMaps
    // listed in Table 118 (except Identity–H and Identity–V) or whose
    // descendant CIDFont uses the Adobe-GB1, Adobe-CNS1, Adobe-Japan1, or
    // Adobe-Korea1 character collection:
    if (
      properties.composite &&
      ((properties.cMap.builtInCMap &&
        !(properties.cMap instanceof IdentityCMap)) ||
        (properties.cidSystemInfo.registry === "Adobe" &&
          (properties.cidSystemInfo.ordering === "GB1" ||
            properties.cidSystemInfo.ordering === "CNS1" ||
            properties.cidSystemInfo.ordering === "Japan1" ||
            properties.cidSystemInfo.ordering === "Korea1")))
    ) {
      // Then:
      // a) Map the character code to a character identifier (CID) according
      // to the font’s CMap.
      // b) Obtain the registry and ordering of the character collection used
      // by the font’s CMap (for example, Adobe and Japan1) from its
      // CIDSystemInfo dictionary.
      const { registry, ordering } = properties.cidSystemInfo;
      // c) Construct a second CMap name by concatenating the registry and
      // ordering obtained in step (b) in the format registry–ordering–UCS2
      // (for example, Adobe–Japan1–UCS2).
      const ucs2CMapName = Name.get(`${registry}-${ordering}-UCS2`);
      // d) Obtain the CMap with the name constructed in step (c) (available
      // from the ASN Web site; see the Bibliography).
      const ucs2CMap = await CMapFactory.create({
        encoding: ucs2CMapName,
        fetchBuiltInCMap: this._fetchBuiltInCMapBound,
        useCMap: null,
      });
      const toUnicode = [];
      properties.cMap.forEach(function (charcode, cid) {
        if (cid > 0xffff) {
          throw new FormatError("Max size of CID is 65,535");
        }
        // e) Map the CID obtained in step (a) according to the CMap
        // obtained in step (d), producing a Unicode value.
        const ucs2 = ucs2CMap.lookup(cid);
        if (ucs2) {
          toUnicode[charcode] = String.fromCharCode(
            (ucs2.charCodeAt(0) << 8) + ucs2.charCodeAt(1)
          );
        }
      });
      return new ToUnicodeMap(toUnicode);
    }

    // The viewer's choice, just use an identity map.
    return new IdentityToUnicodeMap(properties.firstChar, properties.lastChar);
  }

  readToUnicode(cmapObj) {
    if (!cmapObj) {
      return Promise.resolve(null);
    }
    if (isName(cmapObj)) {
      return CMapFactory.create({
        encoding: cmapObj,
        fetchBuiltInCMap: this._fetchBuiltInCMapBound,
        useCMap: null,
      }).then(function (cmap) {
        if (cmap instanceof IdentityCMap) {
          return new IdentityToUnicodeMap(0, 0xffff);
        }
        return new ToUnicodeMap(cmap.getMap());
      });
    } else if (isStream(cmapObj)) {
      return CMapFactory.create({
        encoding: cmapObj,
        fetchBuiltInCMap: this._fetchBuiltInCMapBound,
        useCMap: null,
      }).then(
        function (cmap) {
          if (cmap instanceof IdentityCMap) {
            return new IdentityToUnicodeMap(0, 0xffff);
          }
          const map = new Array(cmap.length);
          // Convert UTF-16BE
          // NOTE: cmap can be a sparse array, so use forEach instead of
          // `for(;;)` to iterate over all keys.
          cmap.forEach(function (charCode, token) {
            const str = [];
            for (let k = 0; k < token.length; k += 2) {
              const w1 = (token.charCodeAt(k) << 8) | token.charCodeAt(k + 1);
              if ((w1 & 0xf800) !== 0xd800) {
                // w1 < 0xD800 || w1 > 0xDFFF
                str.push(w1);
                continue;
              }
              k += 2;
              const w2 = (token.charCodeAt(k) << 8) | token.charCodeAt(k + 1);
              str.push(((w1 & 0x3ff) << 10) + (w2 & 0x3ff) + 0x10000);
            }
            map[charCode] = String.fromCodePoint.apply(String, str);
          });
          return new ToUnicodeMap(map);
        },
        reason => {
          if (reason instanceof AbortException) {
            return null;
          }
          if (this.options.ignoreErrors) {
            // Error in the ToUnicode data -- sending unsupported feature
            // notification and allow font parsing to continue.
            this.handler.send("UnsupportedFeature", {
              featureId: UNSUPPORTED_FEATURES.errorFontToUnicode,
            });
            warn(`readToUnicode - ignoring ToUnicode data: "${reason}".`);
            return null;
          }
          throw reason;
        }
      );
    }
    return Promise.resolve(null);
  }

  readCidToGidMap(glyphsData, toUnicode) {
    // Extract the encoding from the CIDToGIDMap

    // Set encoding 0 to later verify the font has an encoding
    const result = [];
    for (let j = 0, jj = glyphsData.length; j < jj; j++) {
      const glyphID = (glyphsData[j++] << 8) | glyphsData[j];
      const code = j >> 1;
      if (glyphID === 0 && !toUnicode.has(code)) {
        continue;
      }
      result[code] = glyphID;
    }
    return result;
  }

  extractWidths(dict, descriptor, properties) {
    const xref = this.xref;
    let glyphsWidths = [];
    let defaultWidth = 0;
    const glyphsVMetrics = [];
    let defaultVMetrics;
    let i, ii, j, jj, start, code, widths;
    if (properties.composite) {
      defaultWidth = dict.has("DW") ? dict.get("DW") : 1000;

      widths = dict.get("W");
      if (widths) {
        for (i = 0, ii = widths.length; i < ii; i++) {
          start = xref.fetchIfRef(widths[i++]);
          code = xref.fetchIfRef(widths[i]);
          if (Array.isArray(code)) {
            for (j = 0, jj = code.length; j < jj; j++) {
              glyphsWidths[start++] = xref.fetchIfRef(code[j]);
            }
          } else {
            const width = xref.fetchIfRef(widths[++i]);
            for (j = start; j <= code; j++) {
              glyphsWidths[j] = width;
            }
          }
        }
      }

      if (properties.vertical) {
        let vmetrics = dict.getArray("DW2") || [880, -1000];
        defaultVMetrics = [vmetrics[1], defaultWidth * 0.5, vmetrics[0]];
        vmetrics = dict.get("W2");
        if (vmetrics) {
          for (i = 0, ii = vmetrics.length; i < ii; i++) {
            start = xref.fetchIfRef(vmetrics[i++]);
            code = xref.fetchIfRef(vmetrics[i]);
            if (Array.isArray(code)) {
              for (j = 0, jj = code.length; j < jj; j++) {
                glyphsVMetrics[start++] = [
                  xref.fetchIfRef(code[j++]),
                  xref.fetchIfRef(code[j++]),
                  xref.fetchIfRef(code[j]),
                ];
              }
            } else {
              const vmetric = [
                xref.fetchIfRef(vmetrics[++i]),
                xref.fetchIfRef(vmetrics[++i]),
                xref.fetchIfRef(vmetrics[++i]),
              ];
              for (j = start; j <= code; j++) {
                glyphsVMetrics[j] = vmetric;
              }
            }
          }
        }
      }
    } else {
      const firstChar = properties.firstChar;
      widths = dict.get("Widths");
      if (widths) {
        j = firstChar;
        for (i = 0, ii = widths.length; i < ii; i++) {
          glyphsWidths[j++] = xref.fetchIfRef(widths[i]);
        }
        defaultWidth = parseFloat(descriptor.get("MissingWidth")) || 0;
      } else {
        // Trying get the BaseFont metrics (see comment above).
        const baseFontName = dict.get("BaseFont");
        if (isName(baseFontName)) {
          const metrics = this.getBaseFontMetrics(baseFontName.name);

          glyphsWidths = this.buildCharCodeToWidth(metrics.widths, properties);
          defaultWidth = metrics.defaultWidth;
        }
      }
    }

    // Heuristic: detection of monospace font by checking all non-zero widths
    let isMonospace = true;
    let firstWidth = defaultWidth;
    for (const glyph in glyphsWidths) {
      const glyphWidth = glyphsWidths[glyph];
      if (!glyphWidth) {
        continue;
      }
      if (!firstWidth) {
        firstWidth = glyphWidth;
        continue;
      }
      if (firstWidth !== glyphWidth) {
        isMonospace = false;
        break;
      }
    }
    if (isMonospace) {
      properties.flags |= FontFlags.FixedPitch;
    }

    properties.defaultWidth = defaultWidth;
    properties.widths = glyphsWidths;
    properties.defaultVMetrics = defaultVMetrics;
    properties.vmetrics = glyphsVMetrics;
  }

  isSerifFont(baseFontName) {
    // Simulating descriptor flags attribute
    const fontNameWoStyle = baseFontName.split("-")[0];
    return (
      fontNameWoStyle in getSerifFonts() ||
      fontNameWoStyle.search(/serif/gi) !== -1
    );
  }

  getBaseFontMetrics(name) {
    let defaultWidth = 0;
    let widths = Object.create(null);
    let monospace = false;
    const stdFontMap = getStdFontMap();
    let lookupName = stdFontMap[name] || name;
    const Metrics = getMetrics();

    if (!(lookupName in Metrics)) {
      // Use default fonts for looking up font metrics if the passed
      // font is not a base font
      if (this.isSerifFont(name)) {
        lookupName = "Times-Roman";
      } else {
        lookupName = "Helvetica";
      }
    }
    const glyphWidths = Metrics[lookupName];

    if (isNum(glyphWidths)) {
      defaultWidth = glyphWidths;
      monospace = true;
    } else {
      widths = glyphWidths(); // expand lazy widths array
    }

    return {
      defaultWidth,
      monospace,
      widths,
    };
  }

  buildCharCodeToWidth(widthsByGlyphName, properties) {
    const widths = Object.create(null);
    const differences = properties.differences;
    const encoding = properties.defaultEncoding;
    for (let charCode = 0; charCode < 256; charCode++) {
      if (charCode in differences && widthsByGlyphName[differences[charCode]]) {
        widths[charCode] = widthsByGlyphName[differences[charCode]];
        continue;
      }
      if (charCode in encoding && widthsByGlyphName[encoding[charCode]]) {
        widths[charCode] = widthsByGlyphName[encoding[charCode]];
        continue;
      }
    }
    return widths;
  }

  preEvaluateFont(dict) {
    const baseDict = dict;
    let type = dict.get("Subtype");
    if (!isName(type)) {
      throw new FormatError("invalid font Subtype");
    }

    let composite = false;
    let hash, toUnicode;
    if (type.name === "Type0") {
      // If font is a composite
      //  - get the descendant font
      //  - set the type according to the descendant font
      //  - get the FontDescriptor from the descendant font
      const df = dict.get("DescendantFonts");
      if (!df) {
        throw new FormatError("Descendant fonts are not specified");
      }
      dict = Array.isArray(df) ? this.xref.fetchIfRef(df[0]) : df;

      if (!(dict instanceof Dict)) {
        throw new FormatError("Descendant font is not a dictionary.");
      }
      type = dict.get("Subtype");
      if (!isName(type)) {
        throw new FormatError("invalid font Subtype");
      }
      composite = true;
    }

    const firstChar = dict.get("FirstChar") || 0,
      lastChar = dict.get("LastChar") || (composite ? 0xffff : 0xff);
    const descriptor = dict.get("FontDescriptor");
    if (descriptor) {
      hash = new MurmurHash3_64();

      const encoding = baseDict.getRaw("Encoding");
      if (isName(encoding)) {
        hash.update(encoding.name);
      } else if (isRef(encoding)) {
        hash.update(encoding.toString());
      } else if (isDict(encoding)) {
        for (const entry of encoding.getRawValues()) {
          if (isName(entry)) {
            hash.update(entry.name);
          } else if (isRef(entry)) {
            hash.update(entry.toString());
          } else if (Array.isArray(entry)) {
            // 'Differences' array (fixes bug1157493.pdf).
            const diffLength = entry.length,
              diffBuf = new Array(diffLength);

            for (let j = 0; j < diffLength; j++) {
              const diffEntry = entry[j];
              if (isName(diffEntry)) {
                diffBuf[j] = diffEntry.name;
              } else if (isNum(diffEntry) || isRef(diffEntry)) {
                diffBuf[j] = diffEntry.toString();
              }
            }
            hash.update(diffBuf.join());
          }
        }
      }

      hash.update(`${firstChar}-${lastChar}`); // Fixes issue10665_reduced.pdf

      toUnicode = dict.get("ToUnicode") || baseDict.get("ToUnicode");
      if (isStream(toUnicode)) {
        const stream = toUnicode.str || toUnicode;
        const uint8array = stream.buffer
          ? new Uint8Array(stream.buffer.buffer, 0, stream.bufferLength)
          : new Uint8Array(
              stream.bytes.buffer,
              stream.start,
              stream.end - stream.start
            );
        hash.update(uint8array);
      } else if (isName(toUnicode)) {
        hash.update(toUnicode.name);
      }

      const widths = dict.get("Widths") || baseDict.get("Widths");
      if (Array.isArray(widths)) {
        const widthsBuf = [];
        for (const entry of widths) {
          if (isNum(entry) || isRef(entry)) {
            widthsBuf.push(entry.toString());
          }
        }
        hash.update(widthsBuf.join());
      }

      if (composite) {
        hash.update("compositeFont");

        const compositeWidths = dict.get("W") || baseDict.get("W");
        if (Array.isArray(compositeWidths)) {
          const widthsBuf = [];
          for (const entry of compositeWidths) {
            if (isNum(entry) || isRef(entry)) {
              widthsBuf.push(entry.toString());
            } else if (Array.isArray(entry)) {
              const subWidthsBuf = [];
              for (const element of entry) {
                if (isNum(element) || isRef(element)) {
                  subWidthsBuf.push(element.toString());
                }
              }
              widthsBuf.push(`[${subWidthsBuf.join()}]`);
            }
          }
          hash.update(widthsBuf.join());
        }
      }
    }

    return {
      descriptor,
      dict,
      baseDict,
      composite,
      type: type.name,
      firstChar,
      lastChar,
      toUnicode,
      hash: hash ? hash.hexdigest() : "",
    };
  }

  async translateFont({
    descriptor,
    dict,
    baseDict,
    composite,
    type,
    firstChar,
    lastChar,
    toUnicode,
    cssFontInfo,
  }) {
    const isType3Font = type === "Type3";
    let properties;

    if (!descriptor) {
      if (isType3Font) {
        // FontDescriptor is only required for Type3 fonts when the document
        // is a tagged pdf. Create a barbebones one to get by.
        descriptor = new Dict(null);
        descriptor.set("FontName", Name.get(type));
        descriptor.set("FontBBox", dict.getArray("FontBBox") || [0, 0, 0, 0]);
      } else {
        // Before PDF 1.5 if the font was one of the base 14 fonts, having a
        // FontDescriptor was not required.
        // This case is here for compatibility.
        let baseFontName = dict.get("BaseFont");
        if (!isName(baseFontName)) {
          throw new FormatError("Base font is not specified");
        }

        // Using base font name as a font name.
        baseFontName = baseFontName.name.replace(/[,_]/g, "-");
        const metrics = this.getBaseFontMetrics(baseFontName);

        // Simulating descriptor flags attribute
        const fontNameWoStyle = baseFontName.split("-")[0];
        const flags =
          (this.isSerifFont(fontNameWoStyle) ? FontFlags.Serif : 0) |
          (metrics.monospace ? FontFlags.FixedPitch : 0) |
          (getSymbolsFonts()[fontNameWoStyle]
            ? FontFlags.Symbolic
            : FontFlags.Nonsymbolic);

        properties = {
          type,
          name: baseFontName,
          loadedName: baseDict.loadedName,
          widths: metrics.widths,
          defaultWidth: metrics.defaultWidth,
          flags,
          firstChar,
          lastChar,
          toUnicode,
          xHeight: 0,
          capHeight: 0,
          italicAngle: 0,
          isType3Font,
        };
        const widths = dict.get("Widths");

        const standardFontName = getStandardFontName(baseFontName);
        let file = null;
        if (standardFontName) {
          properties.isStandardFont = true;
          file = await this.fetchStandardFontData(standardFontName);
          properties.isInternalFont = !!file;
        }
        return this.extractDataStructures(dict, dict, properties).then(
          newProperties => {
            if (widths) {
              const glyphWidths = [];
              let j = firstChar;
              for (let i = 0, ii = widths.length; i < ii; i++) {
                glyphWidths[j++] = this.xref.fetchIfRef(widths[i]);
              }
              newProperties.widths = glyphWidths;
            } else {
              newProperties.widths = this.buildCharCodeToWidth(
                metrics.widths,
                newProperties
              );
            }
            return new Font(baseFontName, file, newProperties);
          }
        );
      }
    }

    // According to the spec if 'FontDescriptor' is declared, 'FirstChar',
    // 'LastChar' and 'Widths' should exist too, but some PDF encoders seem
    // to ignore this rule when a variant of a standard font is used.
    // TODO Fill the width array depending on which of the base font this is
    // a variant.

    let fontName = descriptor.get("FontName");
    let baseFont = dict.get("BaseFont");
    // Some bad PDFs have a string as the font name.
    if (isString(fontName)) {
      fontName = Name.get(fontName);
    }
    if (isString(baseFont)) {
      baseFont = Name.get(baseFont);
    }

    if (!isType3Font) {
      const fontNameStr = fontName && fontName.name;
      const baseFontStr = baseFont && baseFont.name;
      if (fontNameStr !== baseFontStr) {
        info(
          `The FontDescriptor's FontName is "${fontNameStr}" but ` +
            `should be the same as the Font's BaseFont "${baseFontStr}".`
        );
        // Workaround for cases where e.g. fontNameStr = 'Arial' and
        // baseFontStr = 'Arial,Bold' (needed when no font file is embedded).
        if (fontNameStr && baseFontStr && baseFontStr.startsWith(fontNameStr)) {
          fontName = baseFont;
        }
      }
    }
    fontName = fontName || baseFont;

    if (!isName(fontName)) {
      throw new FormatError("invalid font name");
    }

    let fontFile, subtype, length1, length2, length3;
    try {
      fontFile = descriptor.get("FontFile", "FontFile2", "FontFile3");
    } catch (ex) {
      if (!this.options.ignoreErrors) {
        throw ex;
      }
      warn(`translateFont - fetching "${fontName.name}" font file: "${ex}".`);
      fontFile = new NullStream();
    }
    let isStandardFont = false;
    let isInternalFont = false;
    let glyphScaleFactors = null;
    if (fontFile) {
      if (fontFile.dict) {
        const subtypeEntry = fontFile.dict.get("Subtype");
        if (subtypeEntry instanceof Name) {
          subtype = subtypeEntry.name;
        }
        length1 = fontFile.dict.get("Length1");
        length2 = fontFile.dict.get("Length2");
        length3 = fontFile.dict.get("Length3");
      }
    } else if (cssFontInfo) {
      // We've a missing XFA font.
      const standardFontName = getXfaFontName(fontName.name);
      if (standardFontName) {
        cssFontInfo.fontFamily = `${cssFontInfo.fontFamily}-PdfJS-XFA`;
        glyphScaleFactors = standardFontName.factors || null;
        fontFile = await this.fetchStandardFontData(standardFontName.name);
        isInternalFont = !!fontFile;
        type = "TrueType";
      }
    } else if (!isType3Font) {
      const standardFontName = getStandardFontName(fontName.name);
      if (standardFontName) {
        isStandardFont = true;
        fontFile = await this.fetchStandardFontData(standardFontName);
        isInternalFont = !!fontFile;
      }
    }

    properties = {
      type,
      name: fontName.name,
      subtype,
      file: fontFile,
      length1,
      length2,
      length3,
      isStandardFont,
      isInternalFont,
      loadedName: baseDict.loadedName,
      composite,
      fixedPitch: false,
      fontMatrix: dict.getArray("FontMatrix") || FONT_IDENTITY_MATRIX,
      firstChar,
      lastChar,
      toUnicode,
      bbox: descriptor.getArray("FontBBox") || dict.getArray("FontBBox"),
      ascent: descriptor.get("Ascent"),
      descent: descriptor.get("Descent"),
      xHeight: descriptor.get("XHeight") || 0,
      capHeight: descriptor.get("CapHeight") || 0,
      flags: descriptor.get("Flags"),
      italicAngle: descriptor.get("ItalicAngle") || 0,
      isType3Font,
      cssFontInfo,
      scaleFactors: glyphScaleFactors,
    };

    if (composite) {
      const cidEncoding = baseDict.get("Encoding");
      if (isName(cidEncoding)) {
        properties.cidEncoding = cidEncoding.name;
      }
      const cMap = await CMapFactory.create({
        encoding: cidEncoding,
        fetchBuiltInCMap: this._fetchBuiltInCMapBound,
        useCMap: null,
      });
      properties.cMap = cMap;
      properties.vertical = properties.cMap.vertical;
    }

    return this.extractDataStructures(dict, baseDict, properties).then(
      newProperties => {
        this.extractWidths(dict, descriptor, newProperties);

        return new Font(fontName.name, fontFile, newProperties);
      }
    );
  }

  static buildFontPaths(font, glyphs, handler, evaluatorOptions) {
    function buildPath(fontChar) {
      const glyphName = `${font.loadedName}_path_${fontChar}`;
      try {
        if (font.renderer.hasBuiltPath(fontChar)) {
          return;
        }
        handler.send("commonobj", [
          glyphName,
          "FontPath",
          font.renderer.getPathJs(fontChar),
        ]);
      } catch (reason) {
        if (evaluatorOptions.ignoreErrors) {
          // Error in the font data -- sending unsupported feature notification
          // and allow glyph path building to continue.
          handler.send("UnsupportedFeature", {
            featureId: UNSUPPORTED_FEATURES.errorFontBuildPath,
          });
          warn(`buildFontPaths - ignoring ${glyphName} glyph: "${reason}".`);
          return;
        }
        throw reason;
      }
    }

    for (const glyph of glyphs) {
      buildPath(glyph.fontChar);

      // If the glyph has an accent we need to build a path for its
      // fontChar too, otherwise CanvasGraphics_paintChar will fail.
      const accent = glyph.accent;
      if (accent && accent.fontChar) {
        buildPath(accent.fontChar);
      }
    }
  }

  static get fallbackFontDict() {
    const dict = new Dict();
    dict.set("BaseFont", Name.get("PDFJS-FallbackFont"));
    dict.set("Type", Name.get("FallbackType"));
    dict.set("Subtype", Name.get("FallbackType"));
    dict.set("Encoding", Name.get("WinAnsiEncoding"));

    return shadow(this, "fallbackFontDict", dict);
  }
}

class TranslatedFont {
  constructor({ loadedName, font, dict, evaluatorOptions }) {
    this.loadedName = loadedName;
    this.font = font;
    this.dict = dict;
    this._evaluatorOptions = evaluatorOptions || DefaultPartialEvaluatorOptions;
    this.type3Loaded = null;
    this.type3Dependencies = font.isType3Font ? new Set() : null;
    this.sent = false;
  }

  send(handler) {
    if (this.sent) {
      return;
    }
    this.sent = true;

    handler.send("commonobj", [
      this.loadedName,
      "Font",
      this.font.exportData(this._evaluatorOptions.fontExtraProperties),
    ]);
  }

  fallback(handler) {
    if (!this.font.data) {
      return;
    }
    // When font loading failed, fall back to the built-in font renderer.
    this.font.disableFontFace = true;
    // An arbitrary number of text rendering operators could have been
    // encountered between the point in time when the 'Font' message was sent
    // to the main-thread, and the point in time when the 'FontFallback'
    // message was received on the worker-thread.
    // To ensure that all 'FontPath's are available on the main-thread, when
    // font loading failed, attempt to resend *all* previously parsed glyphs.
    PartialEvaluator.buildFontPaths(
      this.font,
      /* glyphs = */ this.font.glyphCacheValues,
      handler,
      this._evaluatorOptions
    );
  }

  loadType3Data(evaluator, resources, task) {
    if (this.type3Loaded) {
      return this.type3Loaded;
    }
    if (!this.font.isType3Font) {
      throw new Error("Must be a Type3 font.");
    }
    // When parsing Type3 glyphs, always ignore them if there are errors.
    // Compared to the parsing of e.g. an entire page, it doesn't really
    // make sense to only be able to render a Type3 glyph partially.
    const type3Evaluator = evaluator.clone({ ignoreErrors: false });
    type3Evaluator.parsingType3Font = true;

    const translatedFont = this.font,
      type3Dependencies = this.type3Dependencies;
    let loadCharProcsPromise = Promise.resolve();
    const charProcs = this.dict.get("CharProcs");
    const fontResources = this.dict.get("Resources") || resources;
    const charProcOperatorList = Object.create(null);

    const isEmptyBBox =
      !translatedFont.bbox || isArrayEqual(translatedFont.bbox, [0, 0, 0, 0]);

    for (const key of charProcs.getKeys()) {
      loadCharProcsPromise = loadCharProcsPromise.then(() => {
        const glyphStream = charProcs.get(key);
        const operatorList = new OperatorList();
        return type3Evaluator
          .getOperatorList({
            stream: glyphStream,
            task,
            resources: fontResources,
            operatorList,
          })
          .then(() => {
            // According to the PDF specification, section "9.6.5 Type 3 Fonts"
            // and "Table 113":
            //  "A glyph description that begins with the d1 operator should
            //   not execute any operators that set the colour (or other
            //   colour-related parameters) in the graphics state;
            //   any use of such operators shall be ignored."
            if (operatorList.fnArray[0] === OPS.setCharWidthAndBounds) {
              this._removeType3ColorOperators(operatorList, isEmptyBBox);
            }
            charProcOperatorList[key] = operatorList.getIR();

            for (const dependency of operatorList.dependencies) {
              type3Dependencies.add(dependency);
            }
          })
          .catch(function (reason) {
            warn(`Type3 font resource "${key}" is not available.`);
            const dummyOperatorList = new OperatorList();
            charProcOperatorList[key] = dummyOperatorList.getIR();
          });
      });
    }
    this.type3Loaded = loadCharProcsPromise.then(() => {
      translatedFont.charProcOperatorList = charProcOperatorList;
      if (this._bbox) {
        translatedFont.isCharBBox = true;
        translatedFont.bbox = this._bbox;
      }
    });
    return this.type3Loaded;
  }

  /**
   * @private
   */
  _removeType3ColorOperators(operatorList, isEmptyBBox = false) {
    if (
      typeof PDFJSDev === "undefined" ||
      PDFJSDev.test("!PRODUCTION || TESTING")
    ) {
      assert(
        operatorList.fnArray[0] === OPS.setCharWidthAndBounds,
        "Type3 glyph shall start with the d1 operator."
      );
    }
    if (isEmptyBBox) {
      if (!this._bbox) {
        this._bbox = [Infinity, Infinity, -Infinity, -Infinity];
      }
      const charBBox = Util.normalizeRect(operatorList.argsArray[0].slice(2));

      this._bbox[0] = Math.min(this._bbox[0], charBBox[0]);
      this._bbox[1] = Math.min(this._bbox[1], charBBox[1]);
      this._bbox[2] = Math.max(this._bbox[2], charBBox[2]);
      this._bbox[3] = Math.max(this._bbox[3], charBBox[3]);
    }
    let i = 1,
      ii = operatorList.length;
    while (i < ii) {
      switch (operatorList.fnArray[i]) {
        case OPS.setStrokeColorSpace:
        case OPS.setFillColorSpace:
        case OPS.setStrokeColor:
        case OPS.setStrokeColorN:
        case OPS.setFillColor:
        case OPS.setFillColorN:
        case OPS.setStrokeGray:
        case OPS.setFillGray:
        case OPS.setStrokeRGBColor:
        case OPS.setFillRGBColor:
        case OPS.setStrokeCMYKColor:
        case OPS.setFillCMYKColor:
        case OPS.shadingFill:
        case OPS.setRenderingIntent:
          operatorList.fnArray.splice(i, 1);
          operatorList.argsArray.splice(i, 1);
          ii--;
          continue;

        case OPS.setGState:
          const [gStateObj] = operatorList.argsArray[i];
          let j = 0,
            jj = gStateObj.length;
          while (j < jj) {
            const [gStateKey] = gStateObj[j];
            switch (gStateKey) {
              case "TR":
              case "TR2":
              case "HT":
              case "BG":
              case "BG2":
              case "UCR":
              case "UCR2":
                gStateObj.splice(j, 1);
                jj--;
                continue;
            }
            j++;
          }
          break;
      }
      i++;
    }
  }
}

class StateManager {
  constructor(initialState = new EvalState()) {
    this.state = initialState;
    this.stateStack = [];
  }

  save() {
    const old = this.state;
    this.stateStack.push(this.state);
    this.state = old.clone();
  }

  restore() {
    const prev = this.stateStack.pop();
    if (prev) {
      this.state = prev;
    }
  }

  transform(args) {
    this.state.ctm = Util.transform(this.state.ctm, args);
  }
}

class TextState {
  constructor() {
    this.ctm = new Float32Array(IDENTITY_MATRIX);
    this.fontName = null;
    this.fontSize = 0;
    this.font = null;
    this.fontMatrix = FONT_IDENTITY_MATRIX;
    this.textMatrix = IDENTITY_MATRIX.slice();
    this.textLineMatrix = IDENTITY_MATRIX.slice();
    this.charSpacing = 0;
    this.wordSpacing = 0;
    this.leading = 0;
    this.textHScale = 1;
    this.textRise = 0;
  }

  setTextMatrix(a, b, c, d, e, f) {
    const m = this.textMatrix;
    m[0] = a;
    m[1] = b;
    m[2] = c;
    m[3] = d;
    m[4] = e;
    m[5] = f;
  }

  setTextLineMatrix(a, b, c, d, e, f) {
    const m = this.textLineMatrix;
    m[0] = a;
    m[1] = b;
    m[2] = c;
    m[3] = d;
    m[4] = e;
    m[5] = f;
  }

  translateTextMatrix(x, y) {
    const m = this.textMatrix;
    m[4] = m[0] * x + m[2] * y + m[4];
    m[5] = m[1] * x + m[3] * y + m[5];
  }

  translateTextLineMatrix(x, y) {
    const m = this.textLineMatrix;
    m[4] = m[0] * x + m[2] * y + m[4];
    m[5] = m[1] * x + m[3] * y + m[5];
  }

  carriageReturn() {
    this.translateTextLineMatrix(0, -this.leading);
    this.textMatrix = this.textLineMatrix.slice();
  }

  clone() {
    const clone = Object.create(this);
    clone.textMatrix = this.textMatrix.slice();
    clone.textLineMatrix = this.textLineMatrix.slice();
    clone.fontMatrix = this.fontMatrix.slice();
    return clone;
  }
}

class EvalState {
  constructor() {
    this.ctm = new Float32Array(IDENTITY_MATRIX);
    this.font = null;
    this.textRenderingMode = TextRenderingMode.FILL;
    this.fillColorSpace = ColorSpace.singletons.gray;
    this.strokeColorSpace = ColorSpace.singletons.gray;
  }

  clone() {
    return Object.create(this);
  }
}

class EvaluatorPreprocessor {
  static get opMap() {
    // Specifies properties for each command
    //
    // If variableArgs === true: [0, `numArgs`] expected
    // If variableArgs === false: exactly `numArgs` expected
    const getOPMap = getLookupTableFactory(function (t) {
      // Graphic state
      t.w = { id: OPS.setLineWidth, numArgs: 1, variableArgs: false };
      t.J = { id: OPS.setLineCap, numArgs: 1, variableArgs: false };
      t.j = { id: OPS.setLineJoin, numArgs: 1, variableArgs: false };
      t.M = { id: OPS.setMiterLimit, numArgs: 1, variableArgs: false };
      t.d = { id: OPS.setDash, numArgs: 2, variableArgs: false };
      t.ri = { id: OPS.setRenderingIntent, numArgs: 1, variableArgs: false };
      t.i = { id: OPS.setFlatness, numArgs: 1, variableArgs: false };
      t.gs = { id: OPS.setGState, numArgs: 1, variableArgs: false };
      t.q = { id: OPS.save, numArgs: 0, variableArgs: false };
      t.Q = { id: OPS.restore, numArgs: 0, variableArgs: false };
      t.cm = { id: OPS.transform, numArgs: 6, variableArgs: false };

      // Path
      t.m = { id: OPS.moveTo, numArgs: 2, variableArgs: false };
      t.l = { id: OPS.lineTo, numArgs: 2, variableArgs: false };
      t.c = { id: OPS.curveTo, numArgs: 6, variableArgs: false };
      t.v = { id: OPS.curveTo2, numArgs: 4, variableArgs: false };
      t.y = { id: OPS.curveTo3, numArgs: 4, variableArgs: false };
      t.h = { id: OPS.closePath, numArgs: 0, variableArgs: false };
      t.re = { id: OPS.rectangle, numArgs: 4, variableArgs: false };
      t.S = { id: OPS.stroke, numArgs: 0, variableArgs: false };
      t.s = { id: OPS.closeStroke, numArgs: 0, variableArgs: false };
      t.f = { id: OPS.fill, numArgs: 0, variableArgs: false };
      t.F = { id: OPS.fill, numArgs: 0, variableArgs: false };
      t["f*"] = { id: OPS.eoFill, numArgs: 0, variableArgs: false };
      t.B = { id: OPS.fillStroke, numArgs: 0, variableArgs: false };
      t["B*"] = { id: OPS.eoFillStroke, numArgs: 0, variableArgs: false };
      t.b = { id: OPS.closeFillStroke, numArgs: 0, variableArgs: false };
      t["b*"] = { id: OPS.closeEOFillStroke, numArgs: 0, variableArgs: false };
      t.n = { id: OPS.endPath, numArgs: 0, variableArgs: false };

      // Clipping
      t.W = { id: OPS.clip, numArgs: 0, variableArgs: false };
      t["W*"] = { id: OPS.eoClip, numArgs: 0, variableArgs: false };

      // Text
      t.BT = { id: OPS.beginText, numArgs: 0, variableArgs: false };
      t.ET = { id: OPS.endText, numArgs: 0, variableArgs: false };
      t.Tc = { id: OPS.setCharSpacing, numArgs: 1, variableArgs: false };
      t.Tw = { id: OPS.setWordSpacing, numArgs: 1, variableArgs: false };
      t.Tz = { id: OPS.setHScale, numArgs: 1, variableArgs: false };
      t.TL = { id: OPS.setLeading, numArgs: 1, variableArgs: false };
      t.Tf = { id: OPS.setFont, numArgs: 2, variableArgs: false };
      t.Tr = { id: OPS.setTextRenderingMode, numArgs: 1, variableArgs: false };
      t.Ts = { id: OPS.setTextRise, numArgs: 1, variableArgs: false };
      t.Td = { id: OPS.moveText, numArgs: 2, variableArgs: false };
      t.TD = { id: OPS.setLeadingMoveText, numArgs: 2, variableArgs: false };
      t.Tm = { id: OPS.setTextMatrix, numArgs: 6, variableArgs: false };
      t["T*"] = { id: OPS.nextLine, numArgs: 0, variableArgs: false };
      t.Tj = { id: OPS.showText, numArgs: 1, variableArgs: false };
      t.TJ = { id: OPS.showSpacedText, numArgs: 1, variableArgs: false };
      t["'"] = { id: OPS.nextLineShowText, numArgs: 1, variableArgs: false };
      t['"'] = {
        id: OPS.nextLineSetSpacingShowText,
        numArgs: 3,
        variableArgs: false,
      };

      // Type3 fonts
      t.d0 = { id: OPS.setCharWidth, numArgs: 2, variableArgs: false };
      t.d1 = {
        id: OPS.setCharWidthAndBounds,
        numArgs: 6,
        variableArgs: false,
      };

      // Color
      t.CS = { id: OPS.setStrokeColorSpace, numArgs: 1, variableArgs: false };
      t.cs = { id: OPS.setFillColorSpace, numArgs: 1, variableArgs: false };
      t.SC = { id: OPS.setStrokeColor, numArgs: 4, variableArgs: true };
      t.SCN = { id: OPS.setStrokeColorN, numArgs: 33, variableArgs: true };
      t.sc = { id: OPS.setFillColor, numArgs: 4, variableArgs: true };
      t.scn = { id: OPS.setFillColorN, numArgs: 33, variableArgs: true };
      t.G = { id: OPS.setStrokeGray, numArgs: 1, variableArgs: false };
      t.g = { id: OPS.setFillGray, numArgs: 1, variableArgs: false };
      t.RG = { id: OPS.setStrokeRGBColor, numArgs: 3, variableArgs: false };
      t.rg = { id: OPS.setFillRGBColor, numArgs: 3, variableArgs: false };
      t.K = { id: OPS.setStrokeCMYKColor, numArgs: 4, variableArgs: false };
      t.k = { id: OPS.setFillCMYKColor, numArgs: 4, variableArgs: false };

      // Shading
      t.sh = { id: OPS.shadingFill, numArgs: 1, variableArgs: false };

      // Images
      t.BI = { id: OPS.beginInlineImage, numArgs: 0, variableArgs: false };
      t.ID = { id: OPS.beginImageData, numArgs: 0, variableArgs: false };
      t.EI = { id: OPS.endInlineImage, numArgs: 1, variableArgs: false };

      // XObjects
      t.Do = { id: OPS.paintXObject, numArgs: 1, variableArgs: false };
      t.MP = { id: OPS.markPoint, numArgs: 1, variableArgs: false };
      t.DP = { id: OPS.markPointProps, numArgs: 2, variableArgs: false };
      t.BMC = { id: OPS.beginMarkedContent, numArgs: 1, variableArgs: false };
      t.BDC = {
        id: OPS.beginMarkedContentProps,
        numArgs: 2,
        variableArgs: false,
      };
      t.EMC = { id: OPS.endMarkedContent, numArgs: 0, variableArgs: false };

      // Compatibility
      t.BX = { id: OPS.beginCompat, numArgs: 0, variableArgs: false };
      t.EX = { id: OPS.endCompat, numArgs: 0, variableArgs: false };

      // (reserved partial commands for the lexer)
      t.BM = null;
      t.BD = null;
      t.true = null;
      t.fa = null;
      t.fal = null;
      t.fals = null;
      t.false = null;
      t.nu = null;
      t.nul = null;
      t.null = null;
    });

    return shadow(this, "opMap", getOPMap());
  }

  static get MAX_INVALID_PATH_OPS() {
    return shadow(this, "MAX_INVALID_PATH_OPS", 20);
  }

  constructor(stream, xref, stateManager = new StateManager()) {
    // TODO(mduan): pass array of knownCommands rather than this.opMap
    // dictionary
    this.parser = new Parser({
      lexer: new Lexer(stream, EvaluatorPreprocessor.opMap),
      xref,
    });
    this.stateManager = stateManager;
    this.nonProcessedArgs = [];
    this._numInvalidPathOPS = 0;
  }

  get savedStatesDepth() {
    return this.stateManager.stateStack.length;
  }

  // |operation| is an object with two fields:
  //
  // - |fn| is an out param.
  //
  // - |args| is an inout param. On entry, it should have one of two values.
  //
  //   - An empty array. This indicates that the caller is providing the
  //     array in which the args will be stored in. The caller should use
  //     this value if it can reuse a single array for each call to read().
  //
  //   - |null|. This indicates that the caller needs this function to create
  //     the array in which any args are stored in. If there are zero args,
  //     this function will leave |operation.args| as |null| (thus avoiding
  //     allocations that would occur if we used an empty array to represent
  //     zero arguments). Otherwise, it will replace |null| with a new array
  //     containing the arguments. The caller should use this value if it
  //     cannot reuse an array for each call to read().
  //
  // These two modes are present because this function is very hot and so
  // avoiding allocations where possible is worthwhile.
  //
  read(operation) {
    let args = operation.args;
    while (true) {
      const obj = this.parser.getObj();
      if (obj instanceof Cmd) {
        const cmd = obj.cmd;
        // Check that the command is valid
        const opSpec = EvaluatorPreprocessor.opMap[cmd];
        if (!opSpec) {
          warn(`Unknown command "${cmd}".`);
          continue;
        }

        const fn = opSpec.id;
        const numArgs = opSpec.numArgs;
        let argsLength = args !== null ? args.length : 0;

        if (!opSpec.variableArgs) {
          // Postscript commands can be nested, e.g. /F2 /GS2 gs 5.711 Tf
          if (argsLength !== numArgs) {
            const nonProcessedArgs = this.nonProcessedArgs;
            while (argsLength > numArgs) {
              nonProcessedArgs.push(args.shift());
              argsLength--;
            }
            while (argsLength < numArgs && nonProcessedArgs.length !== 0) {
              if (args === null) {
                args = [];
              }
              args.unshift(nonProcessedArgs.pop());
              argsLength++;
            }
          }

          if (argsLength < numArgs) {
            const partialMsg =
              `command ${cmd}: expected ${numArgs} args, ` +
              `but received ${argsLength} args.`;

            // Incomplete path operators, in particular, can result in fairly
            // chaotic rendering artifacts. Hence the following heuristics is
            // used to error, rather than just warn, once a number of invalid
            // path operators have been encountered (fixes bug1443140.pdf).
            if (
              fn >= OPS.moveTo &&
              fn <= OPS.endPath && // Path operator
              ++this._numInvalidPathOPS >
                EvaluatorPreprocessor.MAX_INVALID_PATH_OPS
            ) {
              throw new FormatError(`Invalid ${partialMsg}`);
            }
            // If we receive too few arguments, it's not possible to execute
            // the command, hence we skip the command.
            warn(`Skipping ${partialMsg}`);
            if (args !== null) {
              args.length = 0;
            }
            continue;
          }
        } else if (argsLength > numArgs) {
          info(
            `Command ${cmd}: expected [0, ${numArgs}] args, ` +
              `but received ${argsLength} args.`
          );
        }

        // TODO figure out how to type-check vararg functions
        this.preprocessCommand(fn, args);

        operation.fn = fn;
        operation.args = args;
        return true;
      }
      if (obj === EOF) {
        return false; // no more commands
      }
      // argument
      if (obj !== null) {
        if (args === null) {
          args = [];
        }
        args.push(obj);
        if (args.length > 33) {
          throw new FormatError("Too many arguments");
        }
      }
    }
  }

  preprocessCommand(fn, args) {
    switch (fn | 0) {
      case OPS.save:
        this.stateManager.save();
        break;
      case OPS.restore:
        this.stateManager.restore();
        break;
      case OPS.transform:
        this.stateManager.transform(args);
        break;
    }
  }
}

export { EvaluatorPreprocessor, PartialEvaluator };
