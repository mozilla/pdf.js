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
exports.PartialEvaluator = void 0;

var _util = require("../shared/util.js");

var _cmap = require("./cmap.js");

var _primitives = require("./primitives.js");

var _fonts = require("./fonts.js");

var _encodings = require("./encodings.js");

var _core_utils = require("./core_utils.js");

var _unicode = require("./unicode.js");

var _standard_fonts = require("./standard_fonts.js");

var _pattern = require("./pattern.js");

var _parser = require("./parser.js");

var _bidi = require("./bidi.js");

var _colorspace = require("./colorspace.js");

var _stream = require("./stream.js");

var _glyphlist = require("./glyphlist.js");

var _metrics = require("./metrics.js");

var _function = require("./function.js");

var _jpeg_stream = require("./jpeg_stream.js");

var _murmurhash = require("./murmurhash3.js");

var _image_utils = require("./image_utils.js");

var _operator_list = require("./operator_list.js");

var _image = require("./image.js");

var PartialEvaluator = function PartialEvaluatorClosure() {
  const DefaultPartialEvaluatorOptions = {
    forceDataSchema: false,
    maxImageSize: -1,
    disableFontFace: false,
    nativeImageDecoderSupport: _util.NativeImageDecoding.DECODE,
    ignoreErrors: false,
    isEvalSupported: true
  };

  function PartialEvaluator({
    xref,
    handler,
    pageIndex,
    idFactory,
    fontCache,
    builtInCMapCache,
    options = null,
    pdfFunctionFactory
  }) {
    this.xref = xref;
    this.handler = handler;
    this.pageIndex = pageIndex;
    this.idFactory = idFactory;
    this.fontCache = fontCache;
    this.builtInCMapCache = builtInCMapCache;
    this.options = options || DefaultPartialEvaluatorOptions;
    this.pdfFunctionFactory = pdfFunctionFactory;
    this.parsingType3Font = false;

    this.fetchBuiltInCMap = async name => {
      if (this.builtInCMapCache.has(name)) {
        return this.builtInCMapCache.get(name);
      }

      const readableStream = this.handler.sendWithStream("FetchBuiltInCMap", {
        name
      });
      const reader = readableStream.getReader();
      const data = await new Promise(function (resolve, reject) {
        function pump() {
          reader.read().then(function ({
            value,
            done
          }) {
            if (done) {
              return;
            }

            resolve(value);
            pump();
          }, reject);
        }

        pump();
      });

      if (data.compressionType !== _util.CMapCompressionType.NONE) {
        this.builtInCMapCache.set(name, data);
      }

      return data;
    };
  }

  var TIME_SLOT_DURATION_MS = 20;
  var CHECK_TIME_EVERY = 100;

  function TimeSlotManager() {
    this.reset();
  }

  TimeSlotManager.prototype = {
    check: function TimeSlotManager_check() {
      if (++this.checked < CHECK_TIME_EVERY) {
        return false;
      }

      this.checked = 0;
      return this.endTime <= Date.now();
    },
    reset: function TimeSlotManager_reset() {
      this.endTime = Date.now() + TIME_SLOT_DURATION_MS;
      this.checked = 0;
    }
  };

  function normalizeBlendMode(value, parsingArray = false) {
    if (Array.isArray(value)) {
      for (let i = 0, ii = value.length; i < ii; i++) {
        const maybeBM = normalizeBlendMode(value[i], true);

        if (maybeBM) {
          return maybeBM;
        }
      }

      (0, _util.warn)(`Unsupported blend mode Array: ${value}`);
      return "source-over";
    }

    if (!(0, _primitives.isName)(value)) {
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

    (0, _util.warn)(`Unsupported blend mode: ${value.name}`);
    return "source-over";
  }

  var deferred = Promise.resolve();
  var TILING_PATTERN = 1,
      SHADING_PATTERN = 2;
  PartialEvaluator.prototype = {
    clone(newOptions = DefaultPartialEvaluatorOptions) {
      var newEvaluator = Object.create(this);
      newEvaluator.options = newOptions;
      return newEvaluator;
    },

    hasBlendModes: function PartialEvaluator_hasBlendModes(resources) {
      if (!(resources instanceof _primitives.Dict)) {
        return false;
      }

      var processed = Object.create(null);

      if (resources.objId) {
        processed[resources.objId] = true;
      }

      var nodes = [resources],
          xref = this.xref;

      while (nodes.length) {
        var node = nodes.shift();
        var graphicStates = node.get("ExtGState");

        if (graphicStates instanceof _primitives.Dict) {
          var graphicStatesKeys = graphicStates.getKeys();

          for (let i = 0, ii = graphicStatesKeys.length; i < ii; i++) {
            const key = graphicStatesKeys[i];
            let graphicState = graphicStates.getRaw(key);

            if (graphicState instanceof _primitives.Ref) {
              if (processed[graphicState.toString()]) {
                continue;
              }

              try {
                graphicState = xref.fetch(graphicState);
              } catch (ex) {
                if (ex instanceof _core_utils.MissingDataException) {
                  throw ex;
                }

                if (this.options.ignoreErrors) {
                  if (graphicState instanceof _primitives.Ref) {
                    processed[graphicState.toString()] = true;
                  }

                  this.handler.send("UnsupportedFeature", {
                    featureId: _util.UNSUPPORTED_FEATURES.unknown
                  });
                  (0, _util.warn)(`hasBlendModes - ignoring ExtGState: "${ex}".`);
                  continue;
                }

                throw ex;
              }
            }

            if (!(graphicState instanceof _primitives.Dict)) {
              continue;
            }

            if (graphicState.objId) {
              processed[graphicState.objId] = true;
            }

            const bm = graphicState.get("BM");

            if (bm instanceof _primitives.Name) {
              if (bm.name !== "Normal") {
                return true;
              }

              continue;
            }

            if (bm !== undefined && Array.isArray(bm)) {
              for (let j = 0, jj = bm.length; j < jj; j++) {
                if (bm[j] instanceof _primitives.Name && bm[j].name !== "Normal") {
                  return true;
                }
              }
            }
          }
        }

        var xObjects = node.get("XObject");

        if (!(xObjects instanceof _primitives.Dict)) {
          continue;
        }

        var xObjectsKeys = xObjects.getKeys();

        for (let i = 0, ii = xObjectsKeys.length; i < ii; i++) {
          const key = xObjectsKeys[i];
          var xObject = xObjects.getRaw(key);

          if (xObject instanceof _primitives.Ref) {
            if (processed[xObject.toString()]) {
              continue;
            }

            try {
              xObject = xref.fetch(xObject);
            } catch (ex) {
              if (ex instanceof _core_utils.MissingDataException) {
                throw ex;
              }

              if (this.options.ignoreErrors) {
                if (xObject instanceof _primitives.Ref) {
                  processed[xObject.toString()] = true;
                }

                this.handler.send("UnsupportedFeature", {
                  featureId: _util.UNSUPPORTED_FEATURES.unknown
                });
                (0, _util.warn)(`hasBlendModes - ignoring XObject: "${ex}".`);
                continue;
              }

              throw ex;
            }
          }

          if (!(0, _primitives.isStream)(xObject)) {
            continue;
          }

          if (xObject.dict.objId) {
            if (processed[xObject.dict.objId]) {
              continue;
            }

            processed[xObject.dict.objId] = true;
          }

          var xResources = xObject.dict.get("Resources");

          if (xResources instanceof _primitives.Dict && (!xResources.objId || !processed[xResources.objId])) {
            nodes.push(xResources);

            if (xResources.objId) {
              processed[xResources.objId] = true;
            }
          }
        }
      }

      return false;
    },

    async buildFormXObject(resources, xobj, smask, operatorList, task, initialState) {
      var dict = xobj.dict;
      var matrix = dict.getArray("Matrix");
      var bbox = dict.getArray("BBox");

      if (Array.isArray(bbox) && bbox.length === 4) {
        bbox = _util.Util.normalizeRect(bbox);
      } else {
        bbox = null;
      }

      var group = dict.get("Group");

      if (group) {
        var groupOptions = {
          matrix,
          bbox,
          smask,
          isolated: false,
          knockout: false
        };
        var groupSubtype = group.get("S");
        var colorSpace = null;

        if ((0, _primitives.isName)(groupSubtype, "Transparency")) {
          groupOptions.isolated = group.get("I") || false;
          groupOptions.knockout = group.get("K") || false;

          if (group.has("CS")) {
            colorSpace = await this.parseColorSpace({
              cs: group.get("CS"),
              resources
            });
          }
        }

        if (smask && smask.backdrop) {
          colorSpace = colorSpace || _colorspace.ColorSpace.singletons.rgb;
          smask.backdrop = colorSpace.getRgb(smask.backdrop, 0);
        }

        operatorList.addOp(_util.OPS.beginGroup, [groupOptions]);
      }

      operatorList.addOp(_util.OPS.paintFormXObjectBegin, [matrix, bbox]);
      return this.getOperatorList({
        stream: xobj,
        task,
        resources: dict.get("Resources") || resources,
        operatorList,
        initialState
      }).then(function () {
        operatorList.addOp(_util.OPS.paintFormXObjectEnd, []);

        if (group) {
          operatorList.addOp(_util.OPS.endGroup, [groupOptions]);
        }
      });
    },

    async buildPaintImageXObject({
      resources,
      image,
      isInline = false,
      operatorList,
      cacheKey,
      imageCache,
      forceDisableNativeImageDecoder = false
    }) {
      var dict = image.dict;
      var w = dict.get("Width", "W");
      var h = dict.get("Height", "H");

      if (!(w && (0, _util.isNum)(w)) || !(h && (0, _util.isNum)(h))) {
        (0, _util.warn)("Image dimensions are missing, or not numbers.");
        return undefined;
      }

      var maxImageSize = this.options.maxImageSize;

      if (maxImageSize !== -1 && w * h > maxImageSize) {
        (0, _util.warn)("Image exceeded maximum allowed size and was removed.");
        return undefined;
      }

      var imageMask = dict.get("ImageMask", "IM") || false;
      var imgData, args;

      if (imageMask) {
        var width = dict.get("Width", "W");
        var height = dict.get("Height", "H");
        var bitStrideLength = width + 7 >> 3;
        var imgArray = image.getBytes(bitStrideLength * height, true);
        var decode = dict.getArray("Decode", "D");
        imgData = _image.PDFImage.createMask({
          imgArray,
          width,
          height,
          imageIsFromDecodeStream: image instanceof _stream.DecodeStream,
          inverseDecode: !!decode && decode[0] > 0
        });
        imgData.cached = !!cacheKey;
        args = [imgData];
        operatorList.addOp(_util.OPS.paintImageMaskXObject, args);

        if (cacheKey) {
          imageCache[cacheKey] = {
            fn: _util.OPS.paintImageMaskXObject,
            args
          };
        }

        return undefined;
      }

      var softMask = dict.get("SMask", "SM") || false;
      var mask = dict.get("Mask") || false;
      var SMALL_IMAGE_DIMENSIONS = 200;

      if (isInline && !softMask && !mask && !(image instanceof _jpeg_stream.JpegStream) && w + h < SMALL_IMAGE_DIMENSIONS) {
        const imageObj = new _image.PDFImage({
          xref: this.xref,
          res: resources,
          image,
          isInline,
          pdfFunctionFactory: this.pdfFunctionFactory
        });
        imgData = imageObj.createImageData(true);
        operatorList.addOp(_util.OPS.paintInlineImageXObject, [imgData]);
        return undefined;
      }

      const nativeImageDecoderSupport = forceDisableNativeImageDecoder ? _util.NativeImageDecoding.NONE : this.options.nativeImageDecoderSupport;
      let objId = `img_${this.idFactory.createObjId()}`;

      if (this.parsingType3Font) {
        (0, _util.assert)(nativeImageDecoderSupport === _util.NativeImageDecoding.NONE, "Type3 image resources should be completely decoded in the worker.");
        objId = `${this.idFactory.getDocId()}_type3res_${objId}`;
      }

      if (nativeImageDecoderSupport !== _util.NativeImageDecoding.NONE && !softMask && !mask && image instanceof _jpeg_stream.JpegStream && _image_utils.NativeImageDecoder.isSupported(image, this.xref, resources, this.pdfFunctionFactory) && image.maybeValidDimensions) {
        return this.handler.sendWithPromise("obj", [objId, this.pageIndex, "JpegStream", image.getIR(this.options.forceDataSchema)]).then(function () {
          operatorList.addDependency(objId);
          args = [objId, w, h];
          operatorList.addOp(_util.OPS.paintJpegXObject, args);

          if (cacheKey) {
            imageCache[cacheKey] = {
              fn: _util.OPS.paintJpegXObject,
              args
            };
          }
        }, reason => {
          (0, _util.warn)("Native JPEG decoding failed -- trying to recover: " + (reason && reason.message));
          return this.buildPaintImageXObject({
            resources,
            image,
            isInline,
            operatorList,
            cacheKey,
            imageCache,
            forceDisableNativeImageDecoder: true
          });
        });
      }

      var nativeImageDecoder = null;

      if (nativeImageDecoderSupport === _util.NativeImageDecoding.DECODE && (image instanceof _jpeg_stream.JpegStream || mask instanceof _jpeg_stream.JpegStream || softMask instanceof _jpeg_stream.JpegStream)) {
        nativeImageDecoder = new _image_utils.NativeImageDecoder({
          xref: this.xref,
          resources,
          handler: this.handler,
          forceDataSchema: this.options.forceDataSchema,
          pdfFunctionFactory: this.pdfFunctionFactory
        });
      }

      operatorList.addDependency(objId);
      args = [objId, w, h];

      const imgPromise = _image.PDFImage.buildImage({
        handler: this.handler,
        xref: this.xref,
        res: resources,
        image,
        isInline,
        nativeDecoder: nativeImageDecoder,
        pdfFunctionFactory: this.pdfFunctionFactory
      }).then(imageObj => {
        var imgData = imageObj.createImageData(false);

        if (this.parsingType3Font) {
          return this.handler.sendWithPromise("commonobj", [objId, "FontType3Res", imgData], [imgData.data.buffer]);
        }

        this.handler.send("obj", [objId, this.pageIndex, "Image", imgData], [imgData.data.buffer]);
        return undefined;
      }).catch(reason => {
        (0, _util.warn)("Unable to decode image: " + reason);

        if (this.parsingType3Font) {
          return this.handler.sendWithPromise("commonobj", [objId, "FontType3Res", null]);
        }

        this.handler.send("obj", [objId, this.pageIndex, "Image", null]);
        return undefined;
      });

      if (this.parsingType3Font) {
        await imgPromise;
      }

      operatorList.addOp(_util.OPS.paintImageXObject, args);

      if (cacheKey) {
        imageCache[cacheKey] = {
          fn: _util.OPS.paintImageXObject,
          args
        };
      }

      return undefined;
    },

    handleSMask: function PartialEvaluator_handleSmask(smask, resources, operatorList, task, stateManager) {
      var smaskContent = smask.get("G");
      var smaskOptions = {
        subtype: smask.get("S").name,
        backdrop: smask.get("BC")
      };
      var transferObj = smask.get("TR");

      if ((0, _function.isPDFFunction)(transferObj)) {
        const transferFn = this.pdfFunctionFactory.create(transferObj);
        var transferMap = new Uint8Array(256);
        var tmp = new Float32Array(1);

        for (var i = 0; i < 256; i++) {
          tmp[0] = i / 255;
          transferFn(tmp, 0, tmp, 0);
          transferMap[i] = tmp[0] * 255 | 0;
        }

        smaskOptions.transferMap = transferMap;
      }

      return this.buildFormXObject(resources, smaskContent, smaskOptions, operatorList, task, stateManager.state.clone());
    },

    handleTilingType(fn, args, resources, pattern, patternDict, operatorList, task) {
      const tilingOpList = new _operator_list.OperatorList();
      const resourcesArray = [patternDict.get("Resources"), resources];

      const patternResources = _primitives.Dict.merge(this.xref, resourcesArray);

      return this.getOperatorList({
        stream: pattern,
        task,
        resources: patternResources,
        operatorList: tilingOpList
      }).then(function () {
        return (0, _pattern.getTilingPatternIR)({
          fnArray: tilingOpList.fnArray,
          argsArray: tilingOpList.argsArray
        }, patternDict, args);
      }).then(function (tilingPatternIR) {
        operatorList.addDependencies(tilingOpList.dependencies);
        operatorList.addOp(fn, tilingPatternIR);
      }, reason => {
        if (reason instanceof _util.AbortException) {
          return;
        }

        if (this.options.ignoreErrors) {
          this.handler.send("UnsupportedFeature", {
            featureId: _util.UNSUPPORTED_FEATURES.unknown
          });
          (0, _util.warn)(`handleTilingType - ignoring pattern: "${reason}".`);
          return;
        }

        throw reason;
      });
    },

    handleSetFont: function PartialEvaluator_handleSetFont(resources, fontArgs, fontRef, operatorList, task, state) {
      var fontName;

      if (fontArgs) {
        fontArgs = fontArgs.slice();
        fontName = fontArgs[0].name;
      }

      return this.loadFont(fontName, fontRef, resources).then(translated => {
        if (!translated.font.isType3Font) {
          return translated;
        }

        return translated.loadType3Data(this, resources, operatorList, task).then(function () {
          return translated;
        }).catch(reason => {
          this.handler.send("UnsupportedFeature", {
            featureId: _util.UNSUPPORTED_FEATURES.font
          });
          return new TranslatedFont("g_font_error", new _fonts.ErrorFont("Type3 font load error: " + reason), translated.font);
        });
      }).then(translated => {
        state.font = translated.font;
        translated.send(this.handler);
        return translated.loadedName;
      });
    },

    handleText(chars, state) {
      const font = state.font;
      const glyphs = font.charsToGlyphs(chars);

      if (font.data) {
        const isAddToPathSet = !!(state.textRenderingMode & _util.TextRenderingMode.ADD_TO_PATH_FLAG);

        if (isAddToPathSet || state.fillColorSpace.name === "Pattern" || font.disableFontFace || this.options.disableFontFace) {
          PartialEvaluator.buildFontPaths(font, glyphs, this.handler);
        }
      }

      return glyphs;
    },

    ensureStateFont(state) {
      if (state.font) {
        return;
      }

      const reason = new _util.FormatError("Missing setFont (Tf) operator before text rendering operator.");

      if (this.options.ignoreErrors) {
        this.handler.send("UnsupportedFeature", {
          featureId: _util.UNSUPPORTED_FEATURES.font
        });
        (0, _util.warn)(`ensureStateFont: "${reason}".`);
        return;
      }

      throw reason;
    },

    setGState: function PartialEvaluator_setGState(resources, gState, operatorList, task, stateManager) {
      var gStateObj = [];
      var gStateKeys = gState.getKeys();
      var promise = Promise.resolve();

      for (var i = 0, ii = gStateKeys.length; i < ii; i++) {
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
            promise = promise.then(() => {
              return this.handleSetFont(resources, null, value[0], operatorList, task, stateManager.state).then(function (loadedName) {
                operatorList.addDependency(loadedName);
                gStateObj.push([key, [loadedName, value[1]]]);
              });
            });
            break;

          case "BM":
            gStateObj.push([key, normalizeBlendMode(value)]);
            break;

          case "SMask":
            if ((0, _primitives.isName)(value, "None")) {
              gStateObj.push([key, false]);
              break;
            }

            if ((0, _primitives.isDict)(value)) {
              promise = promise.then(() => {
                return this.handleSMask(value, resources, operatorList, task, stateManager);
              });
              gStateObj.push([key, true]);
            } else {
              (0, _util.warn)("Unsupported SMask type");
            }

            break;

          case "OP":
          case "op":
          case "OPM":
          case "BG":
          case "BG2":
          case "UCR":
          case "UCR2":
          case "TR":
          case "TR2":
          case "HT":
          case "SM":
          case "SA":
          case "AIS":
          case "TK":
            (0, _util.info)("graphic state operator " + key);
            break;

          default:
            (0, _util.info)("Unknown graphic state operator " + key);
            break;
        }
      }

      return promise.then(function () {
        if (gStateObj.length > 0) {
          operatorList.addOp(_util.OPS.setGState, [gStateObj]);
        }
      });
    },
    loadFont: function PartialEvaluator_loadFont(fontName, font, resources) {
      function errorFont() {
        return Promise.resolve(new TranslatedFont("g_font_error", new _fonts.ErrorFont("Font " + fontName + " is not available"), font));
      }

      var fontRef,
          xref = this.xref;

      if (font) {
        if (!(0, _primitives.isRef)(font)) {
          throw new _util.FormatError('The "font" object should be a reference.');
        }

        fontRef = font;
      } else {
        var fontRes = resources.get("Font");

        if (fontRes) {
          fontRef = fontRes.getRaw(fontName);
        }
      }

      if (!fontRef) {
        const partialMsg = `Font "${fontName || font && font.toString()}" is not available`;

        if (!this.options.ignoreErrors && !this.parsingType3Font) {
          (0, _util.warn)(`${partialMsg}.`);
          return errorFont();
        }

        this.handler.send("UnsupportedFeature", {
          featureId: _util.UNSUPPORTED_FEATURES.font
        });
        (0, _util.warn)(`${partialMsg} -- attempting to fallback to a default font.`);
        fontRef = PartialEvaluator.getFallbackFontDict();
      }

      if (this.fontCache.has(fontRef)) {
        return this.fontCache.get(fontRef);
      }

      font = xref.fetchIfRef(fontRef);

      if (!(0, _primitives.isDict)(font)) {
        return errorFont();
      }

      if (font.translated) {
        return font.translated;
      }

      var fontCapability = (0, _util.createPromiseCapability)();
      var preEvaluatedFont = this.preEvaluateFont(font);
      const {
        descriptor,
        hash
      } = preEvaluatedFont;
      var fontRefIsRef = (0, _primitives.isRef)(fontRef),
          fontID;

      if (fontRefIsRef) {
        fontID = fontRef.toString();
      }

      if (hash && (0, _primitives.isDict)(descriptor)) {
        if (!descriptor.fontAliases) {
          descriptor.fontAliases = Object.create(null);
        }

        var fontAliases = descriptor.fontAliases;

        if (fontAliases[hash]) {
          var aliasFontRef = fontAliases[hash].aliasRef;

          if (fontRefIsRef && aliasFontRef && this.fontCache.has(aliasFontRef)) {
            this.fontCache.putAlias(fontRef, aliasFontRef);
            return this.fontCache.get(fontRef);
          }
        } else {
          fontAliases[hash] = {
            fontID: _fonts.Font.getFontID()
          };
        }

        if (fontRefIsRef) {
          fontAliases[hash].aliasRef = fontRef;
        }

        fontID = fontAliases[hash].fontID;
      }

      if (fontRefIsRef) {
        this.fontCache.put(fontRef, fontCapability.promise);
      } else {
        if (!fontID) {
          fontID = this.idFactory.createObjId();
        }

        this.fontCache.put(`id_${fontID}`, fontCapability.promise);
      }

      (0, _util.assert)(fontID, 'The "fontID" must be defined.');
      font.loadedName = `${this.idFactory.getDocId()}_f${fontID}`;
      font.translated = fontCapability.promise;
      var translatedPromise;

      try {
        translatedPromise = this.translateFont(preEvaluatedFont);
      } catch (e) {
        translatedPromise = Promise.reject(e);
      }

      translatedPromise.then(function (translatedFont) {
        if (translatedFont.fontType !== undefined) {
          var xrefFontStats = xref.stats.fontTypes;
          xrefFontStats[translatedFont.fontType] = true;
        }

        fontCapability.resolve(new TranslatedFont(font.loadedName, translatedFont, font));
      }).catch(reason => {
        this.handler.send("UnsupportedFeature", {
          featureId: _util.UNSUPPORTED_FEATURES.font
        });

        try {
          var fontFile3 = descriptor && descriptor.get("FontFile3");
          var subtype = fontFile3 && fontFile3.get("Subtype");
          var fontType = (0, _fonts.getFontType)(preEvaluatedFont.type, subtype && subtype.name);
          var xrefFontStats = xref.stats.fontTypes;
          xrefFontStats[fontType] = true;
        } catch (ex) {}

        fontCapability.resolve(new TranslatedFont(font.loadedName, new _fonts.ErrorFont(reason instanceof Error ? reason.message : reason), font));
      });
      return fontCapability.promise;
    },

    buildPath(operatorList, fn, args, parsingText = false) {
      var lastIndex = operatorList.length - 1;

      if (!args) {
        args = [];
      }

      if (lastIndex < 0 || operatorList.fnArray[lastIndex] !== _util.OPS.constructPath) {
        if (parsingText) {
          (0, _util.warn)(`Encountered path operator "${fn}" inside of a text object.`);
          operatorList.addOp(_util.OPS.save, null);
        }

        operatorList.addOp(_util.OPS.constructPath, [[fn], args]);

        if (parsingText) {
          operatorList.addOp(_util.OPS.restore, null);
        }
      } else {
        var opArgs = operatorList.argsArray[lastIndex];
        opArgs[0].push(fn);
        Array.prototype.push.apply(opArgs[1], args);
      }
    },

    parseColorSpace({
      cs,
      resources
    }) {
      return new Promise(resolve => {
        resolve(_colorspace.ColorSpace.parse(cs, this.xref, resources, this.pdfFunctionFactory));
      }).catch(reason => {
        if (reason instanceof _util.AbortException) {
          return null;
        }

        if (this.options.ignoreErrors) {
          this.handler.send("UnsupportedFeature", {
            featureId: _util.UNSUPPORTED_FEATURES.unknown
          });
          (0, _util.warn)(`parseColorSpace - ignoring ColorSpace: "${reason}".`);
          return null;
        }

        throw reason;
      });
    },

    async handleColorN(operatorList, fn, args, cs, patterns, resources, task) {
      var patternName = args[args.length - 1];
      var pattern;

      if ((0, _primitives.isName)(patternName) && (pattern = patterns.get(patternName.name))) {
        var dict = (0, _primitives.isStream)(pattern) ? pattern.dict : pattern;
        var typeNum = dict.get("PatternType");

        if (typeNum === TILING_PATTERN) {
          var color = cs.base ? cs.base.getRgb(args, 0) : null;
          return this.handleTilingType(fn, color, resources, pattern, dict, operatorList, task);
        } else if (typeNum === SHADING_PATTERN) {
          var shading = dict.get("Shading");
          var matrix = dict.getArray("Matrix");
          pattern = _pattern.Pattern.parseShading(shading, matrix, this.xref, resources, this.handler, this.pdfFunctionFactory);
          operatorList.addOp(fn, pattern.getIR());
          return undefined;
        }

        throw new _util.FormatError(`Unknown PatternType: ${typeNum}`);
      }

      throw new _util.FormatError(`Unknown PatternName: ${patternName}`);
    },

    getOperatorList({
      stream,
      task,
      resources,
      operatorList,
      initialState = null
    }) {
      resources = resources || _primitives.Dict.empty;
      initialState = initialState || new EvalState();

      if (!operatorList) {
        throw new Error('getOperatorList: missing "operatorList" parameter');
      }

      var self = this;
      var xref = this.xref;
      let parsingText = false;
      var imageCache = Object.create(null);

      var xobjs = resources.get("XObject") || _primitives.Dict.empty;

      var patterns = resources.get("Pattern") || _primitives.Dict.empty;

      var stateManager = new StateManager(initialState);
      var preprocessor = new EvaluatorPreprocessor(stream, xref, stateManager);
      var timeSlotManager = new TimeSlotManager();

      function closePendingRestoreOPS(argument) {
        for (var i = 0, ii = preprocessor.savedStatesDepth; i < ii; i++) {
          operatorList.addOp(_util.OPS.restore, []);
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
        var stop,
            operation = {},
            i,
            ii,
            cs;

        while (!(stop = timeSlotManager.check())) {
          operation.args = null;

          if (!preprocessor.read(operation)) {
            break;
          }

          var args = operation.args;
          var fn = operation.fn;

          switch (fn | 0) {
            case _util.OPS.paintXObject:
              var name = args[0].name;

              if (name && imageCache[name] !== undefined) {
                operatorList.addOp(imageCache[name].fn, imageCache[name].args);
                args = null;
                continue;
              }

              next(new Promise(function (resolveXObject, rejectXObject) {
                if (!name) {
                  throw new _util.FormatError("XObject must be referred to by name.");
                }

                const xobj = xobjs.get(name);

                if (!xobj) {
                  operatorList.addOp(fn, args);
                  resolveXObject();
                  return;
                }

                if (!(0, _primitives.isStream)(xobj)) {
                  throw new _util.FormatError("XObject should be a stream");
                }

                const type = xobj.dict.get("Subtype");

                if (!(0, _primitives.isName)(type)) {
                  throw new _util.FormatError("XObject should have a Name subtype");
                }

                if (type.name === "Form") {
                  stateManager.save();
                  self.buildFormXObject(resources, xobj, null, operatorList, task, stateManager.state.clone()).then(function () {
                    stateManager.restore();
                    resolveXObject();
                  }, rejectXObject);
                  return;
                } else if (type.name === "Image") {
                  self.buildPaintImageXObject({
                    resources,
                    image: xobj,
                    operatorList,
                    cacheKey: name,
                    imageCache
                  }).then(resolveXObject, rejectXObject);
                  return;
                } else if (type.name === "PS") {
                  (0, _util.info)("Ignored XObject subtype PS");
                } else {
                  throw new _util.FormatError(`Unhandled XObject subtype ${type.name}`);
                }

                resolveXObject();
              }).catch(function (reason) {
                if (reason instanceof _util.AbortException) {
                  return;
                }

                if (self.options.ignoreErrors) {
                  self.handler.send("UnsupportedFeature", {
                    featureId: _util.UNSUPPORTED_FEATURES.unknown
                  });
                  (0, _util.warn)(`getOperatorList - ignoring XObject: "${reason}".`);
                  return;
                }

                throw reason;
              }));
              return;

            case _util.OPS.setFont:
              var fontSize = args[1];
              next(self.handleSetFont(resources, args, null, operatorList, task, stateManager.state).then(function (loadedName) {
                operatorList.addDependency(loadedName);
                operatorList.addOp(_util.OPS.setFont, [loadedName, fontSize]);
              }));
              return;

            case _util.OPS.beginText:
              parsingText = true;
              break;

            case _util.OPS.endText:
              parsingText = false;
              break;

            case _util.OPS.endInlineImage:
              var cacheKey = args[0].cacheKey;

              if (cacheKey) {
                var cacheEntry = imageCache[cacheKey];

                if (cacheEntry !== undefined) {
                  operatorList.addOp(cacheEntry.fn, cacheEntry.args);
                  args = null;
                  continue;
                }
              }

              next(self.buildPaintImageXObject({
                resources,
                image: args[0],
                isInline: true,
                operatorList,
                cacheKey,
                imageCache
              }));
              return;

            case _util.OPS.showText:
              if (!stateManager.state.font) {
                self.ensureStateFont(stateManager.state);
                continue;
              }

              args[0] = self.handleText(args[0], stateManager.state);
              break;

            case _util.OPS.showSpacedText:
              if (!stateManager.state.font) {
                self.ensureStateFont(stateManager.state);
                continue;
              }

              var arr = args[0];
              var combinedGlyphs = [];
              var arrLength = arr.length;
              var state = stateManager.state;

              for (i = 0; i < arrLength; ++i) {
                var arrItem = arr[i];

                if ((0, _util.isString)(arrItem)) {
                  Array.prototype.push.apply(combinedGlyphs, self.handleText(arrItem, state));
                } else if ((0, _util.isNum)(arrItem)) {
                  combinedGlyphs.push(arrItem);
                }
              }

              args[0] = combinedGlyphs;
              fn = _util.OPS.showText;
              break;

            case _util.OPS.nextLineShowText:
              if (!stateManager.state.font) {
                self.ensureStateFont(stateManager.state);
                continue;
              }

              operatorList.addOp(_util.OPS.nextLine);
              args[0] = self.handleText(args[0], stateManager.state);
              fn = _util.OPS.showText;
              break;

            case _util.OPS.nextLineSetSpacingShowText:
              if (!stateManager.state.font) {
                self.ensureStateFont(stateManager.state);
                continue;
              }

              operatorList.addOp(_util.OPS.nextLine);
              operatorList.addOp(_util.OPS.setWordSpacing, [args.shift()]);
              operatorList.addOp(_util.OPS.setCharSpacing, [args.shift()]);
              args[0] = self.handleText(args[0], stateManager.state);
              fn = _util.OPS.showText;
              break;

            case _util.OPS.setTextRenderingMode:
              stateManager.state.textRenderingMode = args[0];
              break;

            case _util.OPS.setFillColorSpace:
              next(self.parseColorSpace({
                cs: args[0],
                resources
              }).then(function (colorSpace) {
                if (colorSpace) {
                  stateManager.state.fillColorSpace = colorSpace;
                }
              }));
              return;

            case _util.OPS.setStrokeColorSpace:
              next(self.parseColorSpace({
                cs: args[0],
                resources
              }).then(function (colorSpace) {
                if (colorSpace) {
                  stateManager.state.strokeColorSpace = colorSpace;
                }
              }));
              return;

            case _util.OPS.setFillColor:
              cs = stateManager.state.fillColorSpace;
              args = cs.getRgb(args, 0);
              fn = _util.OPS.setFillRGBColor;
              break;

            case _util.OPS.setStrokeColor:
              cs = stateManager.state.strokeColorSpace;
              args = cs.getRgb(args, 0);
              fn = _util.OPS.setStrokeRGBColor;
              break;

            case _util.OPS.setFillGray:
              stateManager.state.fillColorSpace = _colorspace.ColorSpace.singletons.gray;
              args = _colorspace.ColorSpace.singletons.gray.getRgb(args, 0);
              fn = _util.OPS.setFillRGBColor;
              break;

            case _util.OPS.setStrokeGray:
              stateManager.state.strokeColorSpace = _colorspace.ColorSpace.singletons.gray;
              args = _colorspace.ColorSpace.singletons.gray.getRgb(args, 0);
              fn = _util.OPS.setStrokeRGBColor;
              break;

            case _util.OPS.setFillCMYKColor:
              stateManager.state.fillColorSpace = _colorspace.ColorSpace.singletons.cmyk;
              args = _colorspace.ColorSpace.singletons.cmyk.getRgb(args, 0);
              fn = _util.OPS.setFillRGBColor;
              break;

            case _util.OPS.setStrokeCMYKColor:
              stateManager.state.strokeColorSpace = _colorspace.ColorSpace.singletons.cmyk;
              args = _colorspace.ColorSpace.singletons.cmyk.getRgb(args, 0);
              fn = _util.OPS.setStrokeRGBColor;
              break;

            case _util.OPS.setFillRGBColor:
              stateManager.state.fillColorSpace = _colorspace.ColorSpace.singletons.rgb;
              args = _colorspace.ColorSpace.singletons.rgb.getRgb(args, 0);
              break;

            case _util.OPS.setStrokeRGBColor:
              stateManager.state.strokeColorSpace = _colorspace.ColorSpace.singletons.rgb;
              args = _colorspace.ColorSpace.singletons.rgb.getRgb(args, 0);
              break;

            case _util.OPS.setFillColorN:
              cs = stateManager.state.fillColorSpace;

              if (cs.name === "Pattern") {
                next(self.handleColorN(operatorList, _util.OPS.setFillColorN, args, cs, patterns, resources, task));
                return;
              }

              args = cs.getRgb(args, 0);
              fn = _util.OPS.setFillRGBColor;
              break;

            case _util.OPS.setStrokeColorN:
              cs = stateManager.state.strokeColorSpace;

              if (cs.name === "Pattern") {
                next(self.handleColorN(operatorList, _util.OPS.setStrokeColorN, args, cs, patterns, resources, task));
                return;
              }

              args = cs.getRgb(args, 0);
              fn = _util.OPS.setStrokeRGBColor;
              break;

            case _util.OPS.shadingFill:
              var shadingRes = resources.get("Shading");

              if (!shadingRes) {
                throw new _util.FormatError("No shading resource found");
              }

              var shading = shadingRes.get(args[0].name);

              if (!shading) {
                throw new _util.FormatError("No shading object found");
              }

              var shadingFill = _pattern.Pattern.parseShading(shading, null, xref, resources, self.handler, self.pdfFunctionFactory);

              var patternIR = shadingFill.getIR();
              args = [patternIR];
              fn = _util.OPS.shadingFill;
              break;

            case _util.OPS.setGState:
              var dictName = args[0];
              var extGState = resources.get("ExtGState");

              if (!(0, _primitives.isDict)(extGState) || !extGState.has(dictName.name)) {
                break;
              }

              var gState = extGState.get(dictName.name);
              next(self.setGState(resources, gState, operatorList, task, stateManager));
              return;

            case _util.OPS.moveTo:
            case _util.OPS.lineTo:
            case _util.OPS.curveTo:
            case _util.OPS.curveTo2:
            case _util.OPS.curveTo3:
            case _util.OPS.closePath:
            case _util.OPS.rectangle:
              self.buildPath(operatorList, fn, args, parsingText);
              continue;

            case _util.OPS.markPoint:
            case _util.OPS.markPointProps:
            case _util.OPS.beginMarkedContent:
            case _util.OPS.beginMarkedContentProps:
            case _util.OPS.endMarkedContent:
            case _util.OPS.beginCompat:
            case _util.OPS.endCompat:
              continue;

            default:
              if (args !== null) {
                for (i = 0, ii = args.length; i < ii; i++) {
                  if (args[i] instanceof _primitives.Dict) {
                    break;
                  }
                }

                if (i < ii) {
                  (0, _util.warn)("getOperatorList - ignoring operator: " + fn);
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

        closePendingRestoreOPS();
        resolve();
      }).catch(reason => {
        if (reason instanceof _util.AbortException) {
          return;
        }

        if (this.options.ignoreErrors) {
          this.handler.send("UnsupportedFeature", {
            featureId: _util.UNSUPPORTED_FEATURES.unknown
          });
          (0, _util.warn)(`getOperatorList - ignoring errors during "${task.name}" ` + `task: "${reason}".`);
          closePendingRestoreOPS();
          return;
        }

        throw reason;
      });
    },

    getTextContent({
      stream,
      task,
      resources,
      stateManager = null,
      normalizeWhitespace = false,
      combineTextItems = false,
      sink,
      seenStyles = Object.create(null)
    }) {
      resources = resources || _primitives.Dict.empty;
      stateManager = stateManager || new StateManager(new TextState());
      var WhitespaceRegexp = /\s/g;
      var textContent = {
        items: [],
        styles: Object.create(null)
      };
      var textContentItem = {
        initialized: false,
        str: [],
        width: 0,
        height: 0,
        vertical: false,
        lastAdvanceWidth: 0,
        lastAdvanceHeight: 0,
        textAdvanceScale: 0,
        spaceWidth: 0,
        fakeSpaceMin: Infinity,
        fakeMultiSpaceMin: Infinity,
        fakeMultiSpaceMax: -0,
        textRunBreakAllowed: false,
        transform: null,
        fontName: null
      };
      var SPACE_FACTOR = 0.3;
      var MULTI_SPACE_FACTOR = 1.5;
      var MULTI_SPACE_FACTOR_MAX = 4;
      var self = this;
      var xref = this.xref;
      var xobjs = null;
      var skipEmptyXObjs = Object.create(null);
      var preprocessor = new EvaluatorPreprocessor(stream, xref, stateManager);
      var textState;

      function ensureTextContentItem() {
        if (textContentItem.initialized) {
          return textContentItem;
        }

        var font = textState.font;

        if (!(font.loadedName in seenStyles)) {
          seenStyles[font.loadedName] = true;
          textContent.styles[font.loadedName] = {
            fontFamily: font.fallbackName,
            ascent: font.ascent,
            descent: font.descent,
            vertical: !!font.vertical
          };
        }

        textContentItem.fontName = font.loadedName;
        var tsm = [textState.fontSize * textState.textHScale, 0, 0, textState.fontSize, 0, textState.textRise];

        if (font.isType3Font && textState.fontSize <= 1 && !(0, _util.isArrayEqual)(textState.fontMatrix, _util.FONT_IDENTITY_MATRIX)) {
          const glyphHeight = font.bbox[3] - font.bbox[1];

          if (glyphHeight > 0) {
            tsm[3] *= glyphHeight * textState.fontMatrix[3];
          }
        }

        var trm = _util.Util.transform(textState.ctm, _util.Util.transform(textState.textMatrix, tsm));

        textContentItem.transform = trm;

        if (!font.vertical) {
          textContentItem.width = 0;
          textContentItem.height = Math.sqrt(trm[2] * trm[2] + trm[3] * trm[3]);
          textContentItem.vertical = false;
        } else {
          textContentItem.width = Math.sqrt(trm[0] * trm[0] + trm[1] * trm[1]);
          textContentItem.height = 0;
          textContentItem.vertical = true;
        }

        var a = textState.textLineMatrix[0];
        var b = textState.textLineMatrix[1];
        var scaleLineX = Math.sqrt(a * a + b * b);
        a = textState.ctm[0];
        b = textState.ctm[1];
        var scaleCtmX = Math.sqrt(a * a + b * b);
        textContentItem.textAdvanceScale = scaleCtmX * scaleLineX;
        textContentItem.lastAdvanceWidth = 0;
        textContentItem.lastAdvanceHeight = 0;
        var spaceWidth = font.spaceWidth / 1000 * textState.fontSize;

        if (spaceWidth) {
          textContentItem.spaceWidth = spaceWidth;
          textContentItem.fakeSpaceMin = spaceWidth * SPACE_FACTOR;
          textContentItem.fakeMultiSpaceMin = spaceWidth * MULTI_SPACE_FACTOR;
          textContentItem.fakeMultiSpaceMax = spaceWidth * MULTI_SPACE_FACTOR_MAX;
          textContentItem.textRunBreakAllowed = !font.isMonospace;
        } else {
          textContentItem.spaceWidth = 0;
          textContentItem.fakeSpaceMin = Infinity;
          textContentItem.fakeMultiSpaceMin = Infinity;
          textContentItem.fakeMultiSpaceMax = 0;
          textContentItem.textRunBreakAllowed = false;
        }

        textContentItem.initialized = true;
        return textContentItem;
      }

      function replaceWhitespace(str) {
        var i = 0,
            ii = str.length,
            code;

        while (i < ii && (code = str.charCodeAt(i)) >= 0x20 && code <= 0x7f) {
          i++;
        }

        return i < ii ? str.replace(WhitespaceRegexp, " ") : str;
      }

      function runBidiTransform(textChunk) {
        var str = textChunk.str.join("");
        var bidiResult = (0, _bidi.bidi)(str, -1, textChunk.vertical);
        return {
          str: normalizeWhitespace ? replaceWhitespace(bidiResult.str) : bidiResult.str,
          dir: bidiResult.dir,
          width: textChunk.width,
          height: textChunk.height,
          transform: textChunk.transform,
          fontName: textChunk.fontName
        };
      }

      function handleSetFont(fontName, fontRef) {
        return self.loadFont(fontName, fontRef, resources).then(function (translated) {
          textState.font = translated.font;
          textState.fontMatrix = translated.font.fontMatrix || _util.FONT_IDENTITY_MATRIX;
        });
      }

      function buildTextContentItem(chars) {
        var font = textState.font;
        var textChunk = ensureTextContentItem();
        var width = 0;
        var height = 0;
        var glyphs = font.charsToGlyphs(chars);

        for (var i = 0; i < glyphs.length; i++) {
          var glyph = glyphs[i];
          var glyphWidth = null;

          if (font.vertical && glyph.vmetric) {
            glyphWidth = glyph.vmetric[0];
          } else {
            glyphWidth = glyph.width;
          }

          var glyphUnicode = glyph.unicode;
          var NormalizedUnicodes = (0, _unicode.getNormalizedUnicodes)();

          if (NormalizedUnicodes[glyphUnicode] !== undefined) {
            glyphUnicode = NormalizedUnicodes[glyphUnicode];
          }

          glyphUnicode = (0, _unicode.reverseIfRtl)(glyphUnicode);
          var charSpacing = textState.charSpacing;

          if (glyph.isSpace) {
            var wordSpacing = textState.wordSpacing;
            charSpacing += wordSpacing;

            if (wordSpacing > 0) {
              addFakeSpaces(wordSpacing, textChunk.str);
            }
          }

          var tx = 0;
          var ty = 0;

          if (!font.vertical) {
            var w0 = glyphWidth * textState.fontMatrix[0];
            tx = (w0 * textState.fontSize + charSpacing) * textState.textHScale;
            width += tx;
          } else {
            var w1 = glyphWidth * textState.fontMatrix[0];
            ty = w1 * textState.fontSize + charSpacing;
            height += ty;
          }

          textState.translateTextMatrix(tx, ty);
          textChunk.str.push(glyphUnicode);
        }

        if (!font.vertical) {
          textChunk.lastAdvanceWidth = width;
          textChunk.width += width;
        } else {
          textChunk.lastAdvanceHeight = height;
          textChunk.height += Math.abs(height);
        }

        return textChunk;
      }

      function addFakeSpaces(width, strBuf) {
        if (width < textContentItem.fakeSpaceMin) {
          return;
        }

        if (width < textContentItem.fakeMultiSpaceMin) {
          strBuf.push(" ");
          return;
        }

        var fakeSpaces = Math.round(width / textContentItem.spaceWidth);

        while (fakeSpaces-- > 0) {
          strBuf.push(" ");
        }
      }

      function flushTextContentItem() {
        if (!textContentItem.initialized) {
          return;
        }

        if (!textContentItem.vertical) {
          textContentItem.width *= textContentItem.textAdvanceScale;
        } else {
          textContentItem.height *= textContentItem.textAdvanceScale;
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

      var timeSlotManager = new TimeSlotManager();
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
        var stop,
            operation = {},
            args = [];

        while (!(stop = timeSlotManager.check())) {
          args.length = 0;
          operation.args = args;

          if (!preprocessor.read(operation)) {
            break;
          }

          textState = stateManager.state;
          var fn = operation.fn;
          args = operation.args;
          var advance, diff;

          switch (fn | 0) {
            case _util.OPS.setFont:
              var fontNameArg = args[0].name,
                  fontSizeArg = args[1];

              if (textState.font && fontNameArg === textState.fontName && fontSizeArg === textState.fontSize) {
                break;
              }

              flushTextContentItem();
              textState.fontName = fontNameArg;
              textState.fontSize = fontSizeArg;
              next(handleSetFont(fontNameArg, null));
              return;

            case _util.OPS.setTextRise:
              flushTextContentItem();
              textState.textRise = args[0];
              break;

            case _util.OPS.setHScale:
              flushTextContentItem();
              textState.textHScale = args[0] / 100;
              break;

            case _util.OPS.setLeading:
              flushTextContentItem();
              textState.leading = args[0];
              break;

            case _util.OPS.moveText:
              var isSameTextLine = !textState.font ? false : (textState.font.vertical ? args[0] : args[1]) === 0;
              advance = args[0] - args[1];

              if (combineTextItems && isSameTextLine && textContentItem.initialized && advance > 0 && advance <= textContentItem.fakeMultiSpaceMax) {
                textState.translateTextLineMatrix(args[0], args[1]);
                textContentItem.width += args[0] - textContentItem.lastAdvanceWidth;
                textContentItem.height += args[1] - textContentItem.lastAdvanceHeight;
                diff = args[0] - textContentItem.lastAdvanceWidth - (args[1] - textContentItem.lastAdvanceHeight);
                addFakeSpaces(diff, textContentItem.str);
                break;
              }

              flushTextContentItem();
              textState.translateTextLineMatrix(args[0], args[1]);
              textState.textMatrix = textState.textLineMatrix.slice();
              break;

            case _util.OPS.setLeadingMoveText:
              flushTextContentItem();
              textState.leading = -args[1];
              textState.translateTextLineMatrix(args[0], args[1]);
              textState.textMatrix = textState.textLineMatrix.slice();
              break;

            case _util.OPS.nextLine:
              flushTextContentItem();
              textState.carriageReturn();
              break;

            case _util.OPS.setTextMatrix:
              advance = textState.calcTextLineMatrixAdvance(args[0], args[1], args[2], args[3], args[4], args[5]);

              if (combineTextItems && advance !== null && textContentItem.initialized && advance.value > 0 && advance.value <= textContentItem.fakeMultiSpaceMax) {
                textState.translateTextLineMatrix(advance.width, advance.height);
                textContentItem.width += advance.width - textContentItem.lastAdvanceWidth;
                textContentItem.height += advance.height - textContentItem.lastAdvanceHeight;
                diff = advance.width - textContentItem.lastAdvanceWidth - (advance.height - textContentItem.lastAdvanceHeight);
                addFakeSpaces(diff, textContentItem.str);
                break;
              }

              flushTextContentItem();
              textState.setTextMatrix(args[0], args[1], args[2], args[3], args[4], args[5]);
              textState.setTextLineMatrix(args[0], args[1], args[2], args[3], args[4], args[5]);
              break;

            case _util.OPS.setCharSpacing:
              textState.charSpacing = args[0];
              break;

            case _util.OPS.setWordSpacing:
              textState.wordSpacing = args[0];
              break;

            case _util.OPS.beginText:
              flushTextContentItem();
              textState.textMatrix = _util.IDENTITY_MATRIX.slice();
              textState.textLineMatrix = _util.IDENTITY_MATRIX.slice();
              break;

            case _util.OPS.showSpacedText:
              if (!stateManager.state.font) {
                self.ensureStateFont(stateManager.state);
                continue;
              }

              var items = args[0];
              var offset;

              for (var j = 0, jj = items.length; j < jj; j++) {
                if (typeof items[j] === "string") {
                  buildTextContentItem(items[j]);
                } else if ((0, _util.isNum)(items[j])) {
                  ensureTextContentItem();
                  advance = items[j] * textState.fontSize / 1000;
                  var breakTextRun = false;

                  if (textState.font.vertical) {
                    offset = advance;
                    textState.translateTextMatrix(0, offset);
                    breakTextRun = textContentItem.textRunBreakAllowed && advance > textContentItem.fakeMultiSpaceMax;

                    if (!breakTextRun) {
                      textContentItem.height += offset;
                    }
                  } else {
                    advance = -advance;
                    offset = advance * textState.textHScale;
                    textState.translateTextMatrix(offset, 0);
                    breakTextRun = textContentItem.textRunBreakAllowed && advance > textContentItem.fakeMultiSpaceMax;

                    if (!breakTextRun) {
                      textContentItem.width += offset;
                    }
                  }

                  if (breakTextRun) {
                    flushTextContentItem();
                  } else if (advance > 0) {
                    addFakeSpaces(advance, textContentItem.str);
                  }
                }
              }

              break;

            case _util.OPS.showText:
              if (!stateManager.state.font) {
                self.ensureStateFont(stateManager.state);
                continue;
              }

              buildTextContentItem(args[0]);
              break;

            case _util.OPS.nextLineShowText:
              if (!stateManager.state.font) {
                self.ensureStateFont(stateManager.state);
                continue;
              }

              flushTextContentItem();
              textState.carriageReturn();
              buildTextContentItem(args[0]);
              break;

            case _util.OPS.nextLineSetSpacingShowText:
              if (!stateManager.state.font) {
                self.ensureStateFont(stateManager.state);
                continue;
              }

              flushTextContentItem();
              textState.wordSpacing = args[0];
              textState.charSpacing = args[1];
              textState.carriageReturn();
              buildTextContentItem(args[2]);
              break;

            case _util.OPS.paintXObject:
              flushTextContentItem();

              if (!xobjs) {
                xobjs = resources.get("XObject") || _primitives.Dict.empty;
              }

              var name = args[0].name;

              if (name && skipEmptyXObjs[name] !== undefined) {
                break;
              }

              next(new Promise(function (resolveXObject, rejectXObject) {
                if (!name) {
                  throw new _util.FormatError("XObject must be referred to by name.");
                }

                const xobj = xobjs.get(name);

                if (!xobj) {
                  resolveXObject();
                  return;
                }

                if (!(0, _primitives.isStream)(xobj)) {
                  throw new _util.FormatError("XObject should be a stream");
                }

                const type = xobj.dict.get("Subtype");

                if (!(0, _primitives.isName)(type)) {
                  throw new _util.FormatError("XObject should have a Name subtype");
                }

                if (type.name !== "Form") {
                  skipEmptyXObjs[name] = true;
                  resolveXObject();
                  return;
                }

                const currentState = stateManager.state.clone();
                const xObjStateManager = new StateManager(currentState);
                const matrix = xobj.dict.getArray("Matrix");

                if (Array.isArray(matrix) && matrix.length === 6) {
                  xObjStateManager.transform(matrix);
                }

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
                  }

                };
                self.getTextContent({
                  stream: xobj,
                  task,
                  resources: xobj.dict.get("Resources") || resources,
                  stateManager: xObjStateManager,
                  normalizeWhitespace,
                  combineTextItems,
                  sink: sinkWrapper,
                  seenStyles
                }).then(function () {
                  if (!sinkWrapper.enqueueInvoked) {
                    skipEmptyXObjs[name] = true;
                  }

                  resolveXObject();
                }, rejectXObject);
              }).catch(function (reason) {
                if (reason instanceof _util.AbortException) {
                  return;
                }

                if (self.options.ignoreErrors) {
                  (0, _util.warn)(`getTextContent - ignoring XObject: "${reason}".`);
                  return;
                }

                throw reason;
              }));
              return;

            case _util.OPS.setGState:
              flushTextContentItem();
              var dictName = args[0];
              var extGState = resources.get("ExtGState");

              if (!(0, _primitives.isDict)(extGState) || !(0, _primitives.isName)(dictName)) {
                break;
              }

              var gState = extGState.get(dictName.name);

              if (!(0, _primitives.isDict)(gState)) {
                break;
              }

              var gStateFont = gState.get("Font");

              if (gStateFont) {
                textState.fontName = null;
                textState.fontSize = gStateFont[1];
                next(handleSetFont(null, gStateFont[0]));
                return;
              }

              break;
          }

          if (textContent.items.length >= sink.desiredSize) {
            stop = true;
            break;
          }
        }

        if (stop) {
          next(deferred);
          return;
        }

        flushTextContentItem();
        enqueueChunk();
        resolve();
      }).catch(reason => {
        if (reason instanceof _util.AbortException) {
          return;
        }

        if (this.options.ignoreErrors) {
          (0, _util.warn)(`getTextContent - ignoring errors during "${task.name}" ` + `task: "${reason}".`);
          flushTextContentItem();
          enqueueChunk();
          return;
        }

        throw reason;
      });
    },

    extractDataStructures: function PartialEvaluator_extractDataStructures(dict, baseDict, properties) {
      const xref = this.xref;
      let cidToGidBytes;
      var toUnicode = dict.get("ToUnicode") || baseDict.get("ToUnicode");
      var toUnicodePromise = toUnicode ? this.readToUnicode(toUnicode) : Promise.resolve(undefined);

      if (properties.composite) {
        var cidSystemInfo = dict.get("CIDSystemInfo");

        if ((0, _primitives.isDict)(cidSystemInfo)) {
          properties.cidSystemInfo = {
            registry: (0, _util.stringToPDFString)(cidSystemInfo.get("Registry")),
            ordering: (0, _util.stringToPDFString)(cidSystemInfo.get("Ordering")),
            supplement: cidSystemInfo.get("Supplement")
          };
        }

        var cidToGidMap = dict.get("CIDToGIDMap");

        if ((0, _primitives.isStream)(cidToGidMap)) {
          cidToGidBytes = cidToGidMap.getBytes();
        }
      }

      var differences = [];
      var baseEncodingName = null;
      var encoding;

      if (dict.has("Encoding")) {
        encoding = dict.get("Encoding");

        if ((0, _primitives.isDict)(encoding)) {
          baseEncodingName = encoding.get("BaseEncoding");
          baseEncodingName = (0, _primitives.isName)(baseEncodingName) ? baseEncodingName.name : null;

          if (encoding.has("Differences")) {
            var diffEncoding = encoding.get("Differences");
            var index = 0;

            for (var j = 0, jj = diffEncoding.length; j < jj; j++) {
              var data = xref.fetchIfRef(diffEncoding[j]);

              if ((0, _util.isNum)(data)) {
                index = data;
              } else if ((0, _primitives.isName)(data)) {
                differences[index++] = data.name;
              } else {
                throw new _util.FormatError(`Invalid entry in 'Differences' array: ${data}`);
              }
            }
          }
        } else if ((0, _primitives.isName)(encoding)) {
          baseEncodingName = encoding.name;
        } else {
          throw new _util.FormatError("Encoding is not a Name nor a Dict");
        }

        if (baseEncodingName !== "MacRomanEncoding" && baseEncodingName !== "MacExpertEncoding" && baseEncodingName !== "WinAnsiEncoding") {
          baseEncodingName = null;
        }
      }

      if (baseEncodingName) {
        properties.defaultEncoding = (0, _encodings.getEncoding)(baseEncodingName).slice();
      } else {
        var isSymbolicFont = !!(properties.flags & _fonts.FontFlags.Symbolic);
        var isNonsymbolicFont = !!(properties.flags & _fonts.FontFlags.Nonsymbolic);
        encoding = _encodings.StandardEncoding;

        if (properties.type === "TrueType" && !isNonsymbolicFont) {
          encoding = _encodings.WinAnsiEncoding;
        }

        if (isSymbolicFont) {
          encoding = _encodings.MacRomanEncoding;

          if (!properties.file) {
            if (/Symbol/i.test(properties.name)) {
              encoding = _encodings.SymbolSetEncoding;
            } else if (/Dingbats|Wingdings/i.test(properties.name)) {
              encoding = _encodings.ZapfDingbatsEncoding;
            }
          }
        }

        properties.defaultEncoding = encoding;
      }

      properties.differences = differences;
      properties.baseEncodingName = baseEncodingName;
      properties.hasEncoding = !!baseEncodingName || differences.length > 0;
      properties.dict = dict;
      return toUnicodePromise.then(toUnicode => {
        properties.toUnicode = toUnicode;
        return this.buildToUnicode(properties);
      }).then(toUnicode => {
        properties.toUnicode = toUnicode;

        if (cidToGidBytes) {
          properties.cidToGidMap = this.readCidToGidMap(cidToGidBytes, toUnicode);
        }

        return properties;
      });
    },

    _buildSimpleFontToUnicode(properties, forceGlyphs = false) {
      (0, _util.assert)(!properties.composite, "Must be a simple font.");
      const toUnicode = [];
      const encoding = properties.defaultEncoding.slice();
      const baseEncodingName = properties.baseEncodingName;
      const differences = properties.differences;

      for (const charcode in differences) {
        const glyphName = differences[charcode];

        if (glyphName === ".notdef") {
          continue;
        }

        encoding[charcode] = glyphName;
      }

      const glyphsUnicodeMap = (0, _glyphlist.getGlyphsUnicode)();

      for (const charcode in encoding) {
        let glyphName = encoding[charcode];

        if (glyphName === "") {
          continue;
        } else if (glyphsUnicodeMap[glyphName] === undefined) {
          let code = 0;

          switch (glyphName[0]) {
            case "G":
              if (glyphName.length === 3) {
                code = parseInt(glyphName.substring(1), 16);
              }

              break;

            case "g":
              if (glyphName.length === 5) {
                code = parseInt(glyphName.substring(1), 16);
              }

              break;

            case "C":
            case "c":
              if (glyphName.length >= 3 && glyphName.length <= 4) {
                const codeStr = glyphName.substring(1);

                if (forceGlyphs) {
                  code = parseInt(codeStr, 16);
                  break;
                }

                code = +codeStr;

                if (Number.isNaN(code) && Number.isInteger(parseInt(codeStr, 16))) {
                  return this._buildSimpleFontToUnicode(properties, true);
                }
              }

              break;

            default:
              const unicode = (0, _unicode.getUnicodeForGlyph)(glyphName, glyphsUnicodeMap);

              if (unicode !== -1) {
                code = unicode;
              }

          }

          if (code > 0 && Number.isInteger(code)) {
            if (baseEncodingName && code === +charcode) {
              const baseEncoding = (0, _encodings.getEncoding)(baseEncodingName);

              if (baseEncoding && (glyphName = baseEncoding[charcode])) {
                toUnicode[charcode] = String.fromCharCode(glyphsUnicodeMap[glyphName]);
                continue;
              }
            }

            toUnicode[charcode] = String.fromCodePoint(code);
          }

          continue;
        }

        toUnicode[charcode] = String.fromCharCode(glyphsUnicodeMap[glyphName]);
      }

      return new _fonts.ToUnicodeMap(toUnicode);
    },

    buildToUnicode(properties) {
      properties.hasIncludedToUnicodeMap = !!properties.toUnicode && properties.toUnicode.length > 0;

      if (properties.hasIncludedToUnicodeMap) {
        if (!properties.composite && properties.hasEncoding) {
          properties.fallbackToUnicode = this._buildSimpleFontToUnicode(properties);
        }

        return Promise.resolve(properties.toUnicode);
      }

      if (!properties.composite) {
        return Promise.resolve(this._buildSimpleFontToUnicode(properties));
      }

      if (properties.composite && (properties.cMap.builtInCMap && !(properties.cMap instanceof _cmap.IdentityCMap) || properties.cidSystemInfo.registry === "Adobe" && (properties.cidSystemInfo.ordering === "GB1" || properties.cidSystemInfo.ordering === "CNS1" || properties.cidSystemInfo.ordering === "Japan1" || properties.cidSystemInfo.ordering === "Korea1"))) {
        const registry = properties.cidSystemInfo.registry;
        const ordering = properties.cidSystemInfo.ordering;

        const ucs2CMapName = _primitives.Name.get(registry + "-" + ordering + "-UCS2");

        return _cmap.CMapFactory.create({
          encoding: ucs2CMapName,
          fetchBuiltInCMap: this.fetchBuiltInCMap,
          useCMap: null
        }).then(function (ucs2CMap) {
          const cMap = properties.cMap;
          const toUnicode = [];
          cMap.forEach(function (charcode, cid) {
            if (cid > 0xffff) {
              throw new _util.FormatError("Max size of CID is 65,535");
            }

            const ucs2 = ucs2CMap.lookup(cid);

            if (ucs2) {
              toUnicode[charcode] = String.fromCharCode((ucs2.charCodeAt(0) << 8) + ucs2.charCodeAt(1));
            }
          });
          return new _fonts.ToUnicodeMap(toUnicode);
        });
      }

      return Promise.resolve(new _fonts.IdentityToUnicodeMap(properties.firstChar, properties.lastChar));
    },

    readToUnicode: function PartialEvaluator_readToUnicode(toUnicode) {
      var cmapObj = toUnicode;

      if ((0, _primitives.isName)(cmapObj)) {
        return _cmap.CMapFactory.create({
          encoding: cmapObj,
          fetchBuiltInCMap: this.fetchBuiltInCMap,
          useCMap: null
        }).then(function (cmap) {
          if (cmap instanceof _cmap.IdentityCMap) {
            return new _fonts.IdentityToUnicodeMap(0, 0xffff);
          }

          return new _fonts.ToUnicodeMap(cmap.getMap());
        });
      } else if ((0, _primitives.isStream)(cmapObj)) {
        return _cmap.CMapFactory.create({
          encoding: cmapObj,
          fetchBuiltInCMap: this.fetchBuiltInCMap,
          useCMap: null
        }).then(function (cmap) {
          if (cmap instanceof _cmap.IdentityCMap) {
            return new _fonts.IdentityToUnicodeMap(0, 0xffff);
          }

          var map = new Array(cmap.length);
          cmap.forEach(function (charCode, token) {
            var str = [];

            for (var k = 0; k < token.length; k += 2) {
              var w1 = token.charCodeAt(k) << 8 | token.charCodeAt(k + 1);

              if ((w1 & 0xf800) !== 0xd800) {
                str.push(w1);
                continue;
              }

              k += 2;
              var w2 = token.charCodeAt(k) << 8 | token.charCodeAt(k + 1);
              str.push(((w1 & 0x3ff) << 10) + (w2 & 0x3ff) + 0x10000);
            }

            map[charCode] = String.fromCodePoint.apply(String, str);
          });
          return new _fonts.ToUnicodeMap(map);
        }, reason => {
          if (reason instanceof _util.AbortException) {
            return null;
          }

          if (this.options.ignoreErrors) {
            this.handler.send("UnsupportedFeature", {
              featureId: _util.UNSUPPORTED_FEATURES.font
            });
            (0, _util.warn)(`readToUnicode - ignoring ToUnicode data: "${reason}".`);
            return null;
          }

          throw reason;
        });
      }

      return Promise.resolve(null);
    },

    readCidToGidMap(glyphsData, toUnicode) {
      var result = [];

      for (var j = 0, jj = glyphsData.length; j < jj; j++) {
        var glyphID = glyphsData[j++] << 8 | glyphsData[j];
        const code = j >> 1;

        if (glyphID === 0 && !toUnicode.has(code)) {
          continue;
        }

        result[code] = glyphID;
      }

      return result;
    },

    extractWidths: function PartialEvaluator_extractWidths(dict, descriptor, properties) {
      var xref = this.xref;
      var glyphsWidths = [];
      var defaultWidth = 0;
      var glyphsVMetrics = [];
      var defaultVMetrics;
      var i, ii, j, jj, start, code, widths;

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
              var width = xref.fetchIfRef(widths[++i]);

              for (j = start; j <= code; j++) {
                glyphsWidths[j] = width;
              }
            }
          }
        }

        if (properties.vertical) {
          var vmetrics = dict.getArray("DW2") || [880, -1000];
          defaultVMetrics = [vmetrics[1], defaultWidth * 0.5, vmetrics[0]];
          vmetrics = dict.get("W2");

          if (vmetrics) {
            for (i = 0, ii = vmetrics.length; i < ii; i++) {
              start = xref.fetchIfRef(vmetrics[i++]);
              code = xref.fetchIfRef(vmetrics[i]);

              if (Array.isArray(code)) {
                for (j = 0, jj = code.length; j < jj; j++) {
                  glyphsVMetrics[start++] = [xref.fetchIfRef(code[j++]), xref.fetchIfRef(code[j++]), xref.fetchIfRef(code[j])];
                }
              } else {
                var vmetric = [xref.fetchIfRef(vmetrics[++i]), xref.fetchIfRef(vmetrics[++i]), xref.fetchIfRef(vmetrics[++i])];

                for (j = start; j <= code; j++) {
                  glyphsVMetrics[j] = vmetric;
                }
              }
            }
          }
        }
      } else {
        var firstChar = properties.firstChar;
        widths = dict.get("Widths");

        if (widths) {
          j = firstChar;

          for (i = 0, ii = widths.length; i < ii; i++) {
            glyphsWidths[j++] = xref.fetchIfRef(widths[i]);
          }

          defaultWidth = parseFloat(descriptor.get("MissingWidth")) || 0;
        } else {
          var baseFontName = dict.get("BaseFont");

          if ((0, _primitives.isName)(baseFontName)) {
            var metrics = this.getBaseFontMetrics(baseFontName.name);
            glyphsWidths = this.buildCharCodeToWidth(metrics.widths, properties);
            defaultWidth = metrics.defaultWidth;
          }
        }
      }

      var isMonospace = true;
      var firstWidth = defaultWidth;

      for (var glyph in glyphsWidths) {
        var glyphWidth = glyphsWidths[glyph];

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
        properties.flags |= _fonts.FontFlags.FixedPitch;
      }

      properties.defaultWidth = defaultWidth;
      properties.widths = glyphsWidths;
      properties.defaultVMetrics = defaultVMetrics;
      properties.vmetrics = glyphsVMetrics;
    },
    isSerifFont: function PartialEvaluator_isSerifFont(baseFontName) {
      var fontNameWoStyle = baseFontName.split("-")[0];
      return fontNameWoStyle in (0, _standard_fonts.getSerifFonts)() || fontNameWoStyle.search(/serif/gi) !== -1;
    },
    getBaseFontMetrics: function PartialEvaluator_getBaseFontMetrics(name) {
      var defaultWidth = 0;
      var widths = [];
      var monospace = false;
      var stdFontMap = (0, _standard_fonts.getStdFontMap)();
      var lookupName = stdFontMap[name] || name;
      var Metrics = (0, _metrics.getMetrics)();

      if (!(lookupName in Metrics)) {
        if (this.isSerifFont(name)) {
          lookupName = "Times-Roman";
        } else {
          lookupName = "Helvetica";
        }
      }

      var glyphWidths = Metrics[lookupName];

      if ((0, _util.isNum)(glyphWidths)) {
        defaultWidth = glyphWidths;
        monospace = true;
      } else {
        widths = glyphWidths();
      }

      return {
        defaultWidth,
        monospace,
        widths
      };
    },
    buildCharCodeToWidth: function PartialEvaluator_bulildCharCodeToWidth(widthsByGlyphName, properties) {
      var widths = Object.create(null);
      var differences = properties.differences;
      var encoding = properties.defaultEncoding;

      for (var charCode = 0; charCode < 256; charCode++) {
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
    },
    preEvaluateFont: function PartialEvaluator_preEvaluateFont(dict) {
      var baseDict = dict;
      var type = dict.get("Subtype");

      if (!(0, _primitives.isName)(type)) {
        throw new _util.FormatError("invalid font Subtype");
      }

      var composite = false;
      var uint8array;

      if (type.name === "Type0") {
        var df = dict.get("DescendantFonts");

        if (!df) {
          throw new _util.FormatError("Descendant fonts are not specified");
        }

        dict = Array.isArray(df) ? this.xref.fetchIfRef(df[0]) : df;
        type = dict.get("Subtype");

        if (!(0, _primitives.isName)(type)) {
          throw new _util.FormatError("invalid font Subtype");
        }

        composite = true;
      }

      var descriptor = dict.get("FontDescriptor");

      if (descriptor) {
        var hash = new _murmurhash.MurmurHash3_64();
        var encoding = baseDict.getRaw("Encoding");

        if ((0, _primitives.isName)(encoding)) {
          hash.update(encoding.name);
        } else if ((0, _primitives.isRef)(encoding)) {
          hash.update(encoding.toString());
        } else if ((0, _primitives.isDict)(encoding)) {
          var keys = encoding.getKeys();

          for (var i = 0, ii = keys.length; i < ii; i++) {
            var entry = encoding.getRaw(keys[i]);

            if ((0, _primitives.isName)(entry)) {
              hash.update(entry.name);
            } else if ((0, _primitives.isRef)(entry)) {
              hash.update(entry.toString());
            } else if (Array.isArray(entry)) {
              var diffLength = entry.length,
                  diffBuf = new Array(diffLength);

              for (var j = 0; j < diffLength; j++) {
                var diffEntry = entry[j];

                if ((0, _primitives.isName)(diffEntry)) {
                  diffBuf[j] = diffEntry.name;
                } else if ((0, _util.isNum)(diffEntry) || (0, _primitives.isRef)(diffEntry)) {
                  diffBuf[j] = diffEntry.toString();
                }
              }

              hash.update(diffBuf.join());
            }
          }
        }

        const firstChar = dict.get("FirstChar") || 0;
        const lastChar = dict.get("LastChar") || (composite ? 0xffff : 0xff);
        hash.update(`${firstChar}-${lastChar}`);
        var toUnicode = dict.get("ToUnicode") || baseDict.get("ToUnicode");

        if ((0, _primitives.isStream)(toUnicode)) {
          var stream = toUnicode.str || toUnicode;
          uint8array = stream.buffer ? new Uint8Array(stream.buffer.buffer, 0, stream.bufferLength) : new Uint8Array(stream.bytes.buffer, stream.start, stream.end - stream.start);
          hash.update(uint8array);
        } else if ((0, _primitives.isName)(toUnicode)) {
          hash.update(toUnicode.name);
        }

        var widths = dict.get("Widths") || baseDict.get("Widths");

        if (widths) {
          uint8array = new Uint8Array(new Uint32Array(widths).buffer);
          hash.update(uint8array);
        }
      }

      return {
        descriptor,
        dict,
        baseDict,
        composite,
        type: type.name,
        hash: hash ? hash.hexdigest() : ""
      };
    },
    translateFont: function PartialEvaluator_translateFont(preEvaluatedFont) {
      var baseDict = preEvaluatedFont.baseDict;
      var dict = preEvaluatedFont.dict;
      var composite = preEvaluatedFont.composite;
      var descriptor = preEvaluatedFont.descriptor;
      var type = preEvaluatedFont.type;
      var maxCharIndex = composite ? 0xffff : 0xff;
      var properties;
      const firstChar = dict.get("FirstChar") || 0;
      const lastChar = dict.get("LastChar") || maxCharIndex;

      if (!descriptor) {
        if (type === "Type3") {
          descriptor = new _primitives.Dict(null);
          descriptor.set("FontName", _primitives.Name.get(type));
          descriptor.set("FontBBox", dict.getArray("FontBBox") || [0, 0, 0, 0]);
        } else {
          var baseFontName = dict.get("BaseFont");

          if (!(0, _primitives.isName)(baseFontName)) {
            throw new _util.FormatError("Base font is not specified");
          }

          baseFontName = baseFontName.name.replace(/[,_]/g, "-");
          var metrics = this.getBaseFontMetrics(baseFontName);
          var fontNameWoStyle = baseFontName.split("-")[0];
          var flags = (this.isSerifFont(fontNameWoStyle) ? _fonts.FontFlags.Serif : 0) | (metrics.monospace ? _fonts.FontFlags.FixedPitch : 0) | ((0, _standard_fonts.getSymbolsFonts)()[fontNameWoStyle] ? _fonts.FontFlags.Symbolic : _fonts.FontFlags.Nonsymbolic);
          properties = {
            type,
            name: baseFontName,
            widths: metrics.widths,
            defaultWidth: metrics.defaultWidth,
            flags,
            firstChar,
            lastChar
          };
          const widths = dict.get("Widths");
          return this.extractDataStructures(dict, dict, properties).then(properties => {
            if (widths) {
              const glyphWidths = [];
              let j = firstChar;

              for (let i = 0, ii = widths.length; i < ii; i++) {
                glyphWidths[j++] = this.xref.fetchIfRef(widths[i]);
              }

              properties.widths = glyphWidths;
            } else {
              properties.widths = this.buildCharCodeToWidth(metrics.widths, properties);
            }

            return new _fonts.Font(baseFontName, null, properties);
          });
        }
      }

      var fontName = descriptor.get("FontName");
      var baseFont = dict.get("BaseFont");

      if ((0, _util.isString)(fontName)) {
        fontName = _primitives.Name.get(fontName);
      }

      if ((0, _util.isString)(baseFont)) {
        baseFont = _primitives.Name.get(baseFont);
      }

      if (type !== "Type3") {
        var fontNameStr = fontName && fontName.name;
        var baseFontStr = baseFont && baseFont.name;

        if (fontNameStr !== baseFontStr) {
          (0, _util.info)(`The FontDescriptor\'s FontName is "${fontNameStr}" but ` + `should be the same as the Font\'s BaseFont "${baseFontStr}".`);

          if (fontNameStr && baseFontStr && baseFontStr.startsWith(fontNameStr)) {
            fontName = baseFont;
          }
        }
      }

      fontName = fontName || baseFont;

      if (!(0, _primitives.isName)(fontName)) {
        throw new _util.FormatError("invalid font name");
      }

      var fontFile = descriptor.get("FontFile", "FontFile2", "FontFile3");

      if (fontFile) {
        if (fontFile.dict) {
          var subtype = fontFile.dict.get("Subtype");

          if (subtype) {
            subtype = subtype.name;
          }

          var length1 = fontFile.dict.get("Length1");
          var length2 = fontFile.dict.get("Length2");
          var length3 = fontFile.dict.get("Length3");
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
        loadedName: baseDict.loadedName,
        composite,
        fixedPitch: false,
        fontMatrix: dict.getArray("FontMatrix") || _util.FONT_IDENTITY_MATRIX,
        firstChar: firstChar || 0,
        lastChar: lastChar || maxCharIndex,
        bbox: descriptor.getArray("FontBBox"),
        ascent: descriptor.get("Ascent"),
        descent: descriptor.get("Descent"),
        xHeight: descriptor.get("XHeight"),
        capHeight: descriptor.get("CapHeight"),
        flags: descriptor.get("Flags"),
        italicAngle: descriptor.get("ItalicAngle"),
        isType3Font: false
      };
      var cMapPromise;

      if (composite) {
        var cidEncoding = baseDict.get("Encoding");

        if ((0, _primitives.isName)(cidEncoding)) {
          properties.cidEncoding = cidEncoding.name;
        }

        cMapPromise = _cmap.CMapFactory.create({
          encoding: cidEncoding,
          fetchBuiltInCMap: this.fetchBuiltInCMap,
          useCMap: null
        }).then(function (cMap) {
          properties.cMap = cMap;
          properties.vertical = properties.cMap.vertical;
        });
      } else {
        cMapPromise = Promise.resolve(undefined);
      }

      return cMapPromise.then(() => {
        return this.extractDataStructures(dict, baseDict, properties);
      }).then(properties => {
        this.extractWidths(dict, descriptor, properties);

        if (type === "Type3") {
          properties.isType3Font = true;
        }

        return new _fonts.Font(fontName.name, fontFile, properties);
      });
    }
  };

  PartialEvaluator.buildFontPaths = function (font, glyphs, handler) {
    function buildPath(fontChar) {
      if (font.renderer.hasBuiltPath(fontChar)) {
        return;
      }

      handler.send("commonobj", [`${font.loadedName}_path_${fontChar}`, "FontPath", font.renderer.getPathJs(fontChar)]);
    }

    for (const glyph of glyphs) {
      buildPath(glyph.fontChar);
      const accent = glyph.accent;

      if (accent && accent.fontChar) {
        buildPath(accent.fontChar);
      }
    }
  };

  PartialEvaluator.getFallbackFontDict = function () {
    if (this._fallbackFontDict) {
      return this._fallbackFontDict;
    }

    const dict = new _primitives.Dict();
    dict.set("BaseFont", _primitives.Name.get("PDFJS-FallbackFont"));
    dict.set("Type", _primitives.Name.get("FallbackType"));
    dict.set("Subtype", _primitives.Name.get("FallbackType"));
    dict.set("Encoding", _primitives.Name.get("WinAnsiEncoding"));
    return this._fallbackFontDict = dict;
  };

  return PartialEvaluator;
}();

exports.PartialEvaluator = PartialEvaluator;

var TranslatedFont = function TranslatedFontClosure() {
  function TranslatedFont(loadedName, font, dict) {
    this.loadedName = loadedName;
    this.font = font;
    this.dict = dict;
    this.type3Loaded = null;
    this.sent = false;
  }

  TranslatedFont.prototype = {
    send(handler) {
      if (this.sent) {
        return;
      }

      this.sent = true;
      handler.send("commonobj", [this.loadedName, "Font", this.font.exportData()]);
    },

    fallback(handler) {
      if (!this.font.data) {
        return;
      }

      this.font.disableFontFace = true;
      const glyphs = this.font.glyphCacheValues;
      PartialEvaluator.buildFontPaths(this.font, glyphs, handler);
    },

    loadType3Data(evaluator, resources, parentOperatorList, task) {
      if (!this.font.isType3Font) {
        throw new Error("Must be a Type3 font.");
      }

      if (this.type3Loaded) {
        return this.type3Loaded;
      }

      var type3Options = Object.create(evaluator.options);
      type3Options.ignoreErrors = false;
      type3Options.nativeImageDecoderSupport = _util.NativeImageDecoding.NONE;
      var type3Evaluator = evaluator.clone(type3Options);
      type3Evaluator.parsingType3Font = true;
      var translatedFont = this.font;
      var loadCharProcsPromise = Promise.resolve();
      var charProcs = this.dict.get("CharProcs");
      var fontResources = this.dict.get("Resources") || resources;
      var charProcKeys = charProcs.getKeys();
      var charProcOperatorList = Object.create(null);

      for (var i = 0, n = charProcKeys.length; i < n; ++i) {
        const key = charProcKeys[i];
        loadCharProcsPromise = loadCharProcsPromise.then(function () {
          var glyphStream = charProcs.get(key);
          var operatorList = new _operator_list.OperatorList();
          return type3Evaluator.getOperatorList({
            stream: glyphStream,
            task,
            resources: fontResources,
            operatorList
          }).then(function () {
            charProcOperatorList[key] = operatorList.getIR();
            parentOperatorList.addDependencies(operatorList.dependencies);
          }).catch(function (reason) {
            (0, _util.warn)(`Type3 font resource "${key}" is not available.`);
            var operatorList = new _operator_list.OperatorList();
            charProcOperatorList[key] = operatorList.getIR();
          });
        });
      }

      this.type3Loaded = loadCharProcsPromise.then(function () {
        translatedFont.charProcOperatorList = charProcOperatorList;
      });
      return this.type3Loaded;
    }

  };
  return TranslatedFont;
}();

var StateManager = function StateManagerClosure() {
  function StateManager(initialState) {
    this.state = initialState;
    this.stateStack = [];
  }

  StateManager.prototype = {
    save() {
      var old = this.state;
      this.stateStack.push(this.state);
      this.state = old.clone();
    },

    restore() {
      var prev = this.stateStack.pop();

      if (prev) {
        this.state = prev;
      }
    },

    transform(args) {
      this.state.ctm = _util.Util.transform(this.state.ctm, args);
    }

  };
  return StateManager;
}();

var TextState = function TextStateClosure() {
  function TextState() {
    this.ctm = new Float32Array(_util.IDENTITY_MATRIX);
    this.fontName = null;
    this.fontSize = 0;
    this.font = null;
    this.fontMatrix = _util.FONT_IDENTITY_MATRIX;
    this.textMatrix = _util.IDENTITY_MATRIX.slice();
    this.textLineMatrix = _util.IDENTITY_MATRIX.slice();
    this.charSpacing = 0;
    this.wordSpacing = 0;
    this.leading = 0;
    this.textHScale = 1;
    this.textRise = 0;
  }

  TextState.prototype = {
    setTextMatrix: function TextState_setTextMatrix(a, b, c, d, e, f) {
      var m = this.textMatrix;
      m[0] = a;
      m[1] = b;
      m[2] = c;
      m[3] = d;
      m[4] = e;
      m[5] = f;
    },
    setTextLineMatrix: function TextState_setTextMatrix(a, b, c, d, e, f) {
      var m = this.textLineMatrix;
      m[0] = a;
      m[1] = b;
      m[2] = c;
      m[3] = d;
      m[4] = e;
      m[5] = f;
    },
    translateTextMatrix: function TextState_translateTextMatrix(x, y) {
      var m = this.textMatrix;
      m[4] = m[0] * x + m[2] * y + m[4];
      m[5] = m[1] * x + m[3] * y + m[5];
    },
    translateTextLineMatrix: function TextState_translateTextMatrix(x, y) {
      var m = this.textLineMatrix;
      m[4] = m[0] * x + m[2] * y + m[4];
      m[5] = m[1] * x + m[3] * y + m[5];
    },
    calcTextLineMatrixAdvance: function TextState_calcTextLineMatrixAdvance(a, b, c, d, e, f) {
      var font = this.font;

      if (!font) {
        return null;
      }

      var m = this.textLineMatrix;

      if (!(a === m[0] && b === m[1] && c === m[2] && d === m[3])) {
        return null;
      }

      var txDiff = e - m[4],
          tyDiff = f - m[5];

      if (font.vertical && txDiff !== 0 || !font.vertical && tyDiff !== 0) {
        return null;
      }

      var tx,
          ty,
          denominator = a * d - b * c;

      if (font.vertical) {
        tx = -tyDiff * c / denominator;
        ty = tyDiff * a / denominator;
      } else {
        tx = txDiff * d / denominator;
        ty = -txDiff * b / denominator;
      }

      return {
        width: tx,
        height: ty,
        value: font.vertical ? ty : tx
      };
    },
    calcRenderMatrix: function TextState_calcRendeMatrix(ctm) {
      var tsm = [this.fontSize * this.textHScale, 0, 0, this.fontSize, 0, this.textRise];
      return _util.Util.transform(ctm, _util.Util.transform(this.textMatrix, tsm));
    },
    carriageReturn: function TextState_carriageReturn() {
      this.translateTextLineMatrix(0, -this.leading);
      this.textMatrix = this.textLineMatrix.slice();
    },
    clone: function TextState_clone() {
      var clone = Object.create(this);
      clone.textMatrix = this.textMatrix.slice();
      clone.textLineMatrix = this.textLineMatrix.slice();
      clone.fontMatrix = this.fontMatrix.slice();
      return clone;
    }
  };
  return TextState;
}();

var EvalState = function EvalStateClosure() {
  function EvalState() {
    this.ctm = new Float32Array(_util.IDENTITY_MATRIX);
    this.font = null;
    this.textRenderingMode = _util.TextRenderingMode.FILL;
    this.fillColorSpace = _colorspace.ColorSpace.singletons.gray;
    this.strokeColorSpace = _colorspace.ColorSpace.singletons.gray;
  }

  EvalState.prototype = {
    clone: function CanvasExtraState_clone() {
      return Object.create(this);
    }
  };
  return EvalState;
}();

var EvaluatorPreprocessor = function EvaluatorPreprocessorClosure() {
  var getOPMap = (0, _core_utils.getLookupTableFactory)(function (t) {
    t["w"] = {
      id: _util.OPS.setLineWidth,
      numArgs: 1,
      variableArgs: false
    };
    t["J"] = {
      id: _util.OPS.setLineCap,
      numArgs: 1,
      variableArgs: false
    };
    t["j"] = {
      id: _util.OPS.setLineJoin,
      numArgs: 1,
      variableArgs: false
    };
    t["M"] = {
      id: _util.OPS.setMiterLimit,
      numArgs: 1,
      variableArgs: false
    };
    t["d"] = {
      id: _util.OPS.setDash,
      numArgs: 2,
      variableArgs: false
    };
    t["ri"] = {
      id: _util.OPS.setRenderingIntent,
      numArgs: 1,
      variableArgs: false
    };
    t["i"] = {
      id: _util.OPS.setFlatness,
      numArgs: 1,
      variableArgs: false
    };
    t["gs"] = {
      id: _util.OPS.setGState,
      numArgs: 1,
      variableArgs: false
    };
    t["q"] = {
      id: _util.OPS.save,
      numArgs: 0,
      variableArgs: false
    };
    t["Q"] = {
      id: _util.OPS.restore,
      numArgs: 0,
      variableArgs: false
    };
    t["cm"] = {
      id: _util.OPS.transform,
      numArgs: 6,
      variableArgs: false
    };
    t["m"] = {
      id: _util.OPS.moveTo,
      numArgs: 2,
      variableArgs: false
    };
    t["l"] = {
      id: _util.OPS.lineTo,
      numArgs: 2,
      variableArgs: false
    };
    t["c"] = {
      id: _util.OPS.curveTo,
      numArgs: 6,
      variableArgs: false
    };
    t["v"] = {
      id: _util.OPS.curveTo2,
      numArgs: 4,
      variableArgs: false
    };
    t["y"] = {
      id: _util.OPS.curveTo3,
      numArgs: 4,
      variableArgs: false
    };
    t["h"] = {
      id: _util.OPS.closePath,
      numArgs: 0,
      variableArgs: false
    };
    t["re"] = {
      id: _util.OPS.rectangle,
      numArgs: 4,
      variableArgs: false
    };
    t["S"] = {
      id: _util.OPS.stroke,
      numArgs: 0,
      variableArgs: false
    };
    t["s"] = {
      id: _util.OPS.closeStroke,
      numArgs: 0,
      variableArgs: false
    };
    t["f"] = {
      id: _util.OPS.fill,
      numArgs: 0,
      variableArgs: false
    };
    t["F"] = {
      id: _util.OPS.fill,
      numArgs: 0,
      variableArgs: false
    };
    t["f*"] = {
      id: _util.OPS.eoFill,
      numArgs: 0,
      variableArgs: false
    };
    t["B"] = {
      id: _util.OPS.fillStroke,
      numArgs: 0,
      variableArgs: false
    };
    t["B*"] = {
      id: _util.OPS.eoFillStroke,
      numArgs: 0,
      variableArgs: false
    };
    t["b"] = {
      id: _util.OPS.closeFillStroke,
      numArgs: 0,
      variableArgs: false
    };
    t["b*"] = {
      id: _util.OPS.closeEOFillStroke,
      numArgs: 0,
      variableArgs: false
    };
    t["n"] = {
      id: _util.OPS.endPath,
      numArgs: 0,
      variableArgs: false
    };
    t["W"] = {
      id: _util.OPS.clip,
      numArgs: 0,
      variableArgs: false
    };
    t["W*"] = {
      id: _util.OPS.eoClip,
      numArgs: 0,
      variableArgs: false
    };
    t["BT"] = {
      id: _util.OPS.beginText,
      numArgs: 0,
      variableArgs: false
    };
    t["ET"] = {
      id: _util.OPS.endText,
      numArgs: 0,
      variableArgs: false
    };
    t["Tc"] = {
      id: _util.OPS.setCharSpacing,
      numArgs: 1,
      variableArgs: false
    };
    t["Tw"] = {
      id: _util.OPS.setWordSpacing,
      numArgs: 1,
      variableArgs: false
    };
    t["Tz"] = {
      id: _util.OPS.setHScale,
      numArgs: 1,
      variableArgs: false
    };
    t["TL"] = {
      id: _util.OPS.setLeading,
      numArgs: 1,
      variableArgs: false
    };
    t["Tf"] = {
      id: _util.OPS.setFont,
      numArgs: 2,
      variableArgs: false
    };
    t["Tr"] = {
      id: _util.OPS.setTextRenderingMode,
      numArgs: 1,
      variableArgs: false
    };
    t["Ts"] = {
      id: _util.OPS.setTextRise,
      numArgs: 1,
      variableArgs: false
    };
    t["Td"] = {
      id: _util.OPS.moveText,
      numArgs: 2,
      variableArgs: false
    };
    t["TD"] = {
      id: _util.OPS.setLeadingMoveText,
      numArgs: 2,
      variableArgs: false
    };
    t["Tm"] = {
      id: _util.OPS.setTextMatrix,
      numArgs: 6,
      variableArgs: false
    };
    t["T*"] = {
      id: _util.OPS.nextLine,
      numArgs: 0,
      variableArgs: false
    };
    t["Tj"] = {
      id: _util.OPS.showText,
      numArgs: 1,
      variableArgs: false
    };
    t["TJ"] = {
      id: _util.OPS.showSpacedText,
      numArgs: 1,
      variableArgs: false
    };
    t["'"] = {
      id: _util.OPS.nextLineShowText,
      numArgs: 1,
      variableArgs: false
    };
    t['"'] = {
      id: _util.OPS.nextLineSetSpacingShowText,
      numArgs: 3,
      variableArgs: false
    };
    t["d0"] = {
      id: _util.OPS.setCharWidth,
      numArgs: 2,
      variableArgs: false
    };
    t["d1"] = {
      id: _util.OPS.setCharWidthAndBounds,
      numArgs: 6,
      variableArgs: false
    };
    t["CS"] = {
      id: _util.OPS.setStrokeColorSpace,
      numArgs: 1,
      variableArgs: false
    };
    t["cs"] = {
      id: _util.OPS.setFillColorSpace,
      numArgs: 1,
      variableArgs: false
    };
    t["SC"] = {
      id: _util.OPS.setStrokeColor,
      numArgs: 4,
      variableArgs: true
    };
    t["SCN"] = {
      id: _util.OPS.setStrokeColorN,
      numArgs: 33,
      variableArgs: true
    };
    t["sc"] = {
      id: _util.OPS.setFillColor,
      numArgs: 4,
      variableArgs: true
    };
    t["scn"] = {
      id: _util.OPS.setFillColorN,
      numArgs: 33,
      variableArgs: true
    };
    t["G"] = {
      id: _util.OPS.setStrokeGray,
      numArgs: 1,
      variableArgs: false
    };
    t["g"] = {
      id: _util.OPS.setFillGray,
      numArgs: 1,
      variableArgs: false
    };
    t["RG"] = {
      id: _util.OPS.setStrokeRGBColor,
      numArgs: 3,
      variableArgs: false
    };
    t["rg"] = {
      id: _util.OPS.setFillRGBColor,
      numArgs: 3,
      variableArgs: false
    };
    t["K"] = {
      id: _util.OPS.setStrokeCMYKColor,
      numArgs: 4,
      variableArgs: false
    };
    t["k"] = {
      id: _util.OPS.setFillCMYKColor,
      numArgs: 4,
      variableArgs: false
    };
    t["sh"] = {
      id: _util.OPS.shadingFill,
      numArgs: 1,
      variableArgs: false
    };
    t["BI"] = {
      id: _util.OPS.beginInlineImage,
      numArgs: 0,
      variableArgs: false
    };
    t["ID"] = {
      id: _util.OPS.beginImageData,
      numArgs: 0,
      variableArgs: false
    };
    t["EI"] = {
      id: _util.OPS.endInlineImage,
      numArgs: 1,
      variableArgs: false
    };
    t["Do"] = {
      id: _util.OPS.paintXObject,
      numArgs: 1,
      variableArgs: false
    };
    t["MP"] = {
      id: _util.OPS.markPoint,
      numArgs: 1,
      variableArgs: false
    };
    t["DP"] = {
      id: _util.OPS.markPointProps,
      numArgs: 2,
      variableArgs: false
    };
    t["BMC"] = {
      id: _util.OPS.beginMarkedContent,
      numArgs: 1,
      variableArgs: false
    };
    t["BDC"] = {
      id: _util.OPS.beginMarkedContentProps,
      numArgs: 2,
      variableArgs: false
    };
    t["EMC"] = {
      id: _util.OPS.endMarkedContent,
      numArgs: 0,
      variableArgs: false
    };
    t["BX"] = {
      id: _util.OPS.beginCompat,
      numArgs: 0,
      variableArgs: false
    };
    t["EX"] = {
      id: _util.OPS.endCompat,
      numArgs: 0,
      variableArgs: false
    };
    t["BM"] = null;
    t["BD"] = null;
    t["true"] = null;
    t["fa"] = null;
    t["fal"] = null;
    t["fals"] = null;
    t["false"] = null;
    t["nu"] = null;
    t["nul"] = null;
    t["null"] = null;
  });
  const MAX_INVALID_PATH_OPS = 20;

  function EvaluatorPreprocessor(stream, xref, stateManager) {
    this.opMap = getOPMap();
    this.parser = new _parser.Parser({
      lexer: new _parser.Lexer(stream, this.opMap),
      xref
    });
    this.stateManager = stateManager;
    this.nonProcessedArgs = [];
    this._numInvalidPathOPS = 0;
  }

  EvaluatorPreprocessor.prototype = {
    get savedStatesDepth() {
      return this.stateManager.stateStack.length;
    },

    read: function EvaluatorPreprocessor_read(operation) {
      var args = operation.args;

      while (true) {
        var obj = this.parser.getObj();

        if (obj instanceof _primitives.Cmd) {
          var cmd = obj.cmd;
          var opSpec = this.opMap[cmd];

          if (!opSpec) {
            (0, _util.warn)(`Unknown command "${cmd}".`);
            continue;
          }

          var fn = opSpec.id;
          var numArgs = opSpec.numArgs;
          var argsLength = args !== null ? args.length : 0;

          if (!opSpec.variableArgs) {
            if (argsLength !== numArgs) {
              var nonProcessedArgs = this.nonProcessedArgs;

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
              const partialMsg = `command ${cmd}: expected ${numArgs} args, ` + `but received ${argsLength} args.`;

              if (fn >= _util.OPS.moveTo && fn <= _util.OPS.endPath && ++this._numInvalidPathOPS > MAX_INVALID_PATH_OPS) {
                throw new _util.FormatError(`Invalid ${partialMsg}`);
              }

              (0, _util.warn)(`Skipping ${partialMsg}`);

              if (args !== null) {
                args.length = 0;
              }

              continue;
            }
          } else if (argsLength > numArgs) {
            (0, _util.info)(`Command ${cmd}: expected [0, ${numArgs}] args, ` + `but received ${argsLength} args.`);
          }

          this.preprocessCommand(fn, args);
          operation.fn = fn;
          operation.args = args;
          return true;
        }

        if (obj === _primitives.EOF) {
          return false;
        }

        if (obj !== null) {
          if (args === null) {
            args = [];
          }

          args.push(obj);

          if (args.length > 33) {
            throw new _util.FormatError("Too many arguments");
          }
        }
      }
    },
    preprocessCommand: function EvaluatorPreprocessor_preprocessCommand(fn, args) {
      switch (fn | 0) {
        case _util.OPS.save:
          this.stateManager.save();
          break;

        case _util.OPS.restore:
          this.stateManager.restore();
          break;

        case _util.OPS.transform:
          this.stateManager.transform(args);
          break;
      }
    }
  };
  return EvaluatorPreprocessor;
}();