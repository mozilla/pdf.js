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

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs/core/evaluator', ['exports', 'pdfjs/shared/util',
      'pdfjs/core/primitives', 'pdfjs/core/stream', 'pdfjs/core/parser',
      'pdfjs/core/image', 'pdfjs/core/colorspace', 'pdfjs/core/murmurhash3',
      'pdfjs/core/fonts', 'pdfjs/core/function', 'pdfjs/core/pattern',
      'pdfjs/core/cmap', 'pdfjs/core/metrics', 'pdfjs/core/bidi',
      'pdfjs/core/encodings', 'pdfjs/core/standard_fonts',
      'pdfjs/core/unicode', 'pdfjs/core/glyphlist'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('../shared/util.js'), require('./primitives.js'),
      require('./stream.js'), require('./parser.js'), require('./image.js'),
      require('./colorspace.js'), require('./murmurhash3.js'),
      require('./fonts.js'), require('./function.js'), require('./pattern.js'),
      require('./cmap.js'), require('./metrics.js'), require('./bidi.js'),
      require('./encodings.js'), require('./standard_fonts.js'),
      require('./unicode.js'), require('./glyphlist.js'));
  } else {
    factory((root.pdfjsCoreEvaluator = {}), root.pdfjsSharedUtil,
      root.pdfjsCorePrimitives, root.pdfjsCoreStream, root.pdfjsCoreParser,
      root.pdfjsCoreImage, root.pdfjsCoreColorSpace, root.pdfjsCoreMurmurHash3,
      root.pdfjsCoreFonts, root.pdfjsCoreFunction, root.pdfjsCorePattern,
      root.pdfjsCoreCMap, root.pdfjsCoreMetrics, root.pdfjsCoreBidi,
      root.pdfjsCoreEncodings, root.pdfjsCoreStandardFonts,
      root.pdfjsCoreUnicode, root.pdfjsCoreGlyphList);
  }
}(this, function (exports, sharedUtil, corePrimitives, coreStream, coreParser,
                  coreImage, coreColorSpace, coreMurmurHash3, coreFonts,
                  coreFunction, corePattern, coreCMap, coreMetrics, coreBidi,
                  coreEncodings, coreStandardFonts, coreUnicode,
                  coreGlyphList) {

var FONT_IDENTITY_MATRIX = sharedUtil.FONT_IDENTITY_MATRIX;
var IDENTITY_MATRIX = sharedUtil.IDENTITY_MATRIX;
var UNSUPPORTED_FEATURES = sharedUtil.UNSUPPORTED_FEATURES;
var ImageKind = sharedUtil.ImageKind;
var OPS = sharedUtil.OPS;
var TextRenderingMode = sharedUtil.TextRenderingMode;
var Util = sharedUtil.Util;
var assert = sharedUtil.assert;
var createPromiseCapability = sharedUtil.createPromiseCapability;
var error = sharedUtil.error;
var info = sharedUtil.info;
var isArray = sharedUtil.isArray;
var isNum = sharedUtil.isNum;
var isString = sharedUtil.isString;
var getLookupTableFactory = sharedUtil.getLookupTableFactory;
var warn = sharedUtil.warn;
var Dict = corePrimitives.Dict;
var Name = corePrimitives.Name;
var isCmd = corePrimitives.isCmd;
var isDict = corePrimitives.isDict;
var isName = corePrimitives.isName;
var isRef = corePrimitives.isRef;
var isStream = corePrimitives.isStream;
var DecodeStream = coreStream.DecodeStream;
var JpegStream = coreStream.JpegStream;
var Stream = coreStream.Stream;
var Lexer = coreParser.Lexer;
var Parser = coreParser.Parser;
var isEOF = coreParser.isEOF;
var PDFImage = coreImage.PDFImage;
var ColorSpace = coreColorSpace.ColorSpace;
var MurmurHash3_64 = coreMurmurHash3.MurmurHash3_64;
var ErrorFont = coreFonts.ErrorFont;
var FontFlags = coreFonts.FontFlags;
var Font = coreFonts.Font;
var IdentityToUnicodeMap = coreFonts.IdentityToUnicodeMap;
var ToUnicodeMap = coreFonts.ToUnicodeMap;
var getFontType = coreFonts.getFontType;
var isPDFFunction = coreFunction.isPDFFunction;
var PDFFunction = coreFunction.PDFFunction;
var Pattern = corePattern.Pattern;
var getTilingPatternIR = corePattern.getTilingPatternIR;
var CMapFactory = coreCMap.CMapFactory;
var IdentityCMap = coreCMap.IdentityCMap;
var getMetrics = coreMetrics.getMetrics;
var bidi = coreBidi.bidi;
var WinAnsiEncoding = coreEncodings.WinAnsiEncoding;
var StandardEncoding = coreEncodings.StandardEncoding;
var MacRomanEncoding = coreEncodings.MacRomanEncoding;
var SymbolSetEncoding = coreEncodings.SymbolSetEncoding;
var ZapfDingbatsEncoding = coreEncodings.ZapfDingbatsEncoding;
var getEncoding = coreEncodings.getEncoding;
var getStdFontMap = coreStandardFonts.getStdFontMap;
var getSerifFonts = coreStandardFonts.getSerifFonts;
var getSymbolsFonts = coreStandardFonts.getSymbolsFonts;
var getNormalizedUnicodes = coreUnicode.getNormalizedUnicodes;
var reverseIfRtl = coreUnicode.reverseIfRtl;
var getUnicodeForGlyph = coreUnicode.getUnicodeForGlyph;
var getGlyphsUnicode = coreGlyphList.getGlyphsUnicode;

var PartialEvaluator = (function PartialEvaluatorClosure() {
  var DefaultPartialEvaluatorOptions = {
    forceDataSchema: false,
    maxImageSize: -1,
    disableFontFace: false,
    cMapOptions: { url: null, packed: false }
  };

  function NativeImageDecoder(xref, resources, handler, forceDataSchema) {
    this.xref = xref;
    this.resources = resources;
    this.handler = handler;
    this.forceDataSchema = forceDataSchema;
  }
  NativeImageDecoder.prototype = {
    canDecode: function (image) {
      return image instanceof JpegStream &&
             NativeImageDecoder.isDecodable(image, this.xref, this.resources);
    },
    decode: function (image) {
      // For natively supported JPEGs send them to the main thread for decoding.
      var dict = image.dict;
      var colorSpace = dict.get('ColorSpace', 'CS');
      colorSpace = ColorSpace.parse(colorSpace, this.xref, this.resources);
      var numComps = colorSpace.numComps;
      var decodePromise = this.handler.sendWithPromise('JpegDecode',
        [image.getIR(this.forceDataSchema), numComps]);
      return decodePromise.then(function (message) {
        var data = message.data;
        return new Stream(data, 0, data.length, image.dict);
      });
    }
  };
  /**
   * Checks if the image can be decoded and displayed by the browser without any
   * further processing such as color space conversions.
   */
  NativeImageDecoder.isSupported =
      function NativeImageDecoder_isSupported(image, xref, res) {
    var dict = image.dict;
    if (dict.has('DecodeParms') || dict.has('DP')) {
      return false;
    }
    var cs = ColorSpace.parse(dict.get('ColorSpace', 'CS'), xref, res);
    return (cs.name === 'DeviceGray' || cs.name === 'DeviceRGB') &&
           cs.isDefaultDecode(dict.getArray('Decode', 'D'));
  };
  /**
   * Checks if the image can be decoded by the browser.
   */
  NativeImageDecoder.isDecodable =
      function NativeImageDecoder_isDecodable(image, xref, res) {
    var dict = image.dict;
    if (dict.has('DecodeParms') || dict.has('DP')) {
      return false;
    }
    var cs = ColorSpace.parse(dict.get('ColorSpace', 'CS'), xref, res);
    return (cs.numComps === 1 || cs.numComps === 3) &&
           cs.isDefaultDecode(dict.getArray('Decode', 'D'));
  };

  function PartialEvaluator(pdfManager, xref, handler, pageIndex,
                            uniquePrefix, idCounters, fontCache, options) {
    this.pdfManager = pdfManager;
    this.xref = xref;
    this.handler = handler;
    this.pageIndex = pageIndex;
    this.uniquePrefix = uniquePrefix;
    this.idCounters = idCounters;
    this.fontCache = fontCache;
    this.options = options || DefaultPartialEvaluatorOptions;
  }

  // Trying to minimize Date.now() usage and check every 100 time
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

  var deferred = Promise.resolve();

  var TILING_PATTERN = 1, SHADING_PATTERN = 2;

  PartialEvaluator.prototype = {
    hasBlendModes: function PartialEvaluator_hasBlendModes(resources) {
      if (!isDict(resources)) {
        return false;
      }

      var processed = Object.create(null);
      if (resources.objId) {
        processed[resources.objId] = true;
      }

      var nodes = [resources], xref = this.xref;
      while (nodes.length) {
        var key, i, ii;
        var node = nodes.shift();
        // First check the current resources for blend modes.
        var graphicStates = node.get('ExtGState');
        if (isDict(graphicStates)) {
          var graphicStatesKeys = graphicStates.getKeys();
          for (i = 0, ii = graphicStatesKeys.length; i < ii; i++) {
            key = graphicStatesKeys[i];

            var graphicState = graphicStates.get(key);
            var bm = graphicState.get('BM');
            if (isName(bm) && bm.name !== 'Normal') {
              return true;
            }
          }
        }
        // Descend into the XObjects to look for more resources and blend modes.
        var xObjects = node.get('XObject');
        if (!isDict(xObjects)) {
          continue;
        }
        var xObjectsKeys = xObjects.getKeys();
        for (i = 0, ii = xObjectsKeys.length; i < ii; i++) {
          key = xObjectsKeys[i];

          var xObject = xObjects.getRaw(key);
          if (isRef(xObject)) {
            if (processed[xObject.toString()]) {
              // The XObject has already been processed, and by avoiding a
              // redundant `xref.fetch` we can *significantly* reduce the load
              // time for badly generated PDF files (fixes issue6961.pdf).
              continue;
            }
            xObject = xref.fetch(xObject);
          }
          if (!isStream(xObject)) {
            continue;
          }
          if (xObject.dict.objId) {
            if (processed[xObject.dict.objId]) {
              // stream has objId and is processed already
              continue;
            }
            processed[xObject.dict.objId] = true;
          }
          var xResources = xObject.dict.get('Resources');
          // Checking objId to detect an infinite loop.
          if (isDict(xResources) &&
              (!xResources.objId || !processed[xResources.objId])) {
            nodes.push(xResources);
            if (xResources.objId) {
              processed[xResources.objId] = true;
            }
          }
        }
      }
      return false;
    },

    buildFormXObject: function PartialEvaluator_buildFormXObject(resources,
                                                                 xobj, smask,
                                                                 operatorList,
                                                                 task,
                                                                 initialState) {
      var matrix = xobj.dict.getArray('Matrix');
      var bbox = xobj.dict.getArray('BBox');
      var group = xobj.dict.get('Group');
      if (group) {
        var groupOptions = {
          matrix: matrix,
          bbox: bbox,
          smask: smask,
          isolated: false,
          knockout: false
        };

        var groupSubtype = group.get('S');
        var colorSpace;
        if (isName(groupSubtype, 'Transparency')) {
          groupOptions.isolated = (group.get('I') || false);
          groupOptions.knockout = (group.get('K') || false);
          colorSpace = (group.has('CS') ?
            ColorSpace.parse(group.get('CS'), this.xref, resources) : null);
        }

        if (smask && smask.backdrop) {
          colorSpace = colorSpace || ColorSpace.singletons.rgb;
          smask.backdrop = colorSpace.getRgb(smask.backdrop, 0);
        }

        operatorList.addOp(OPS.beginGroup, [groupOptions]);
      }

      operatorList.addOp(OPS.paintFormXObjectBegin, [matrix, bbox]);

      return this.getOperatorList(xobj, task,
        (xobj.dict.get('Resources') || resources), operatorList, initialState).
        then(function () {
          operatorList.addOp(OPS.paintFormXObjectEnd, []);

          if (group) {
            operatorList.addOp(OPS.endGroup, [groupOptions]);
          }
        });
    },

    buildPaintImageXObject:
        function PartialEvaluator_buildPaintImageXObject(resources, image,
                                                         inline, operatorList,
                                                         cacheKey, imageCache) {
      var self = this;
      var dict = image.dict;
      var w = dict.get('Width', 'W');
      var h = dict.get('Height', 'H');

      if (!(w && isNum(w)) || !(h && isNum(h))) {
        warn('Image dimensions are missing, or not numbers.');
        return;
      }
      var maxImageSize = this.options.maxImageSize;
      if (maxImageSize !== -1 && w * h > maxImageSize) {
        warn('Image exceeded maximum allowed size and was removed.');
        return;
      }

      var imageMask = (dict.get('ImageMask', 'IM') || false);
      var imgData, args;
      if (imageMask) {
        // This depends on a tmpCanvas being filled with the
        // current fillStyle, such that processing the pixel
        // data can't be done here. Instead of creating a
        // complete PDFImage, only read the information needed
        // for later.

        var width = dict.get('Width', 'W');
        var height = dict.get('Height', 'H');
        var bitStrideLength = (width + 7) >> 3;
        var imgArray = image.getBytes(bitStrideLength * height);
        var decode = dict.getArray('Decode', 'D');
        var inverseDecode = (!!decode && decode[0] > 0);

        imgData = PDFImage.createMask(imgArray, width, height,
                                      image instanceof DecodeStream,
                                      inverseDecode);
        imgData.cached = true;
        args = [imgData];
        operatorList.addOp(OPS.paintImageMaskXObject, args);
        if (cacheKey) {
          imageCache[cacheKey] = {
            fn: OPS.paintImageMaskXObject,
            args: args
          };
        }
        return;
      }

      var softMask = (dict.get('SMask', 'SM') || false);
      var mask = (dict.get('Mask') || false);

      var SMALL_IMAGE_DIMENSIONS = 200;
      // Inlining small images into the queue as RGB data
      if (inline && !softMask && !mask && !(image instanceof JpegStream) &&
          (w + h) < SMALL_IMAGE_DIMENSIONS) {
        var imageObj = new PDFImage(this.xref, resources, image,
                                    inline, null, null);
        // We force the use of RGBA_32BPP images here, because we can't handle
        // any other kind.
        imgData = imageObj.createImageData(/* forceRGBA = */ true);
        operatorList.addOp(OPS.paintInlineImageXObject, [imgData]);
        return;
      }

      // If there is no imageMask, create the PDFImage and a lot
      // of image processing can be done here.
      var uniquePrefix = (this.uniquePrefix || '');
      var objId = 'img_' + uniquePrefix + (++this.idCounters.obj);
      operatorList.addDependency(objId);
      args = [objId, w, h];

      if (!softMask && !mask && image instanceof JpegStream &&
          NativeImageDecoder.isSupported(image, this.xref, resources)) {
        // These JPEGs don't need any more processing so we can just send it.
        operatorList.addOp(OPS.paintJpegXObject, args);
        this.handler.send('obj',
          [objId, this.pageIndex, 'JpegStream',
           image.getIR(this.options.forceDataSchema)]);
        return;
      }

      // Creates native image decoder only if a JPEG image or mask is present.
      var nativeImageDecoder = null;
      if (image instanceof JpegStream || mask instanceof JpegStream ||
          softMask instanceof JpegStream) {
        nativeImageDecoder = new NativeImageDecoder(self.xref, resources,
          self.handler, self.options.forceDataSchema);
      }

      PDFImage.buildImage(self.handler, self.xref, resources, image, inline,
                          nativeImageDecoder).
        then(function(imageObj) {
          var imgData = imageObj.createImageData(/* forceRGBA = */ false);
          self.handler.send('obj', [objId, self.pageIndex, 'Image', imgData],
            [imgData.data.buffer]);
        }).then(undefined, function (reason) {
          warn('Unable to decode image: ' + reason);
          self.handler.send('obj', [objId, self.pageIndex, 'Image', null]);
        });

      operatorList.addOp(OPS.paintImageXObject, args);
      if (cacheKey) {
        imageCache[cacheKey] = {
          fn: OPS.paintImageXObject,
          args: args
        };
      }
    },

    handleSMask: function PartialEvaluator_handleSmask(smask, resources,
                                                       operatorList, task,
                                                       stateManager) {
      var smaskContent = smask.get('G');
      var smaskOptions = {
        subtype: smask.get('S').name,
        backdrop: smask.get('BC')
      };

      // The SMask might have a alpha/luminosity value transfer function --
      // we will build a map of integer values in range 0..255 to be fast.
      var transferObj = smask.get('TR');
      if (isPDFFunction(transferObj)) {
        var transferFn = PDFFunction.parse(this.xref, transferObj);
        var transferMap = new Uint8Array(256);
        var tmp = new Float32Array(1);
        for (var i = 0; i < 256; i++) {
          tmp[0] = i / 255;
          transferFn(tmp, 0, tmp, 0);
          transferMap[i] = (tmp[0] * 255) | 0;
        }
        smaskOptions.transferMap = transferMap;
      }

      return this.buildFormXObject(resources, smaskContent, smaskOptions,
                            operatorList, task, stateManager.state.clone());
    },

    handleTilingType:
        function PartialEvaluator_handleTilingType(fn, args, resources,
                                                   pattern, patternDict,
                                                   operatorList, task) {
      // Create an IR of the pattern code.
      var tilingOpList = new OperatorList();
      // Merge the available resources, to prevent issues when the patternDict
      // is missing some /Resources entries (fixes issue6541.pdf).
      var resourcesArray = [patternDict.get('Resources'), resources];
      var patternResources = Dict.merge(this.xref, resourcesArray);

      return this.getOperatorList(pattern, task, patternResources,
                                  tilingOpList).then(function () {
          // Add the dependencies to the parent operator list so they are
          // resolved before sub operator list is executed synchronously.
          operatorList.addDependencies(tilingOpList.dependencies);
          operatorList.addOp(fn, getTilingPatternIR({
            fnArray: tilingOpList.fnArray,
            argsArray: tilingOpList.argsArray
          }, patternDict, args));
        });
    },

    handleSetFont:
        function PartialEvaluator_handleSetFont(resources, fontArgs, fontRef,
                                                operatorList, task, state) {
      // TODO(mack): Not needed?
      var fontName;
      if (fontArgs) {
        fontArgs = fontArgs.slice();
        fontName = fontArgs[0].name;
      }

      var self = this;
      return this.loadFont(fontName, fontRef, this.xref, resources).then(
          function (translated) {
        if (!translated.font.isType3Font) {
          return translated;
        }
        return translated.loadType3Data(self, resources, operatorList, task).
          then(function () {
          return translated;
        }, function (reason) {
          // Error in the font data -- sending unsupported feature notification.
          self.handler.send('UnsupportedFeature',
                            {featureId: UNSUPPORTED_FEATURES.font});
          return new TranslatedFont('g_font_error',
            new ErrorFont('Type3 font load error: ' + reason), translated.font);
        });
      }).then(function (translated) {
        state.font = translated.font;
        translated.send(self.handler);
        return translated.loadedName;
      });
    },

    handleText: function PartialEvaluator_handleText(chars, state) {
      var font = state.font;
      var glyphs = font.charsToGlyphs(chars);
      var isAddToPathSet = !!(state.textRenderingMode &
                              TextRenderingMode.ADD_TO_PATH_FLAG);
      if (font.data && (isAddToPathSet || this.options.disableFontFace)) {
        var buildPath = function (fontChar) {
          if (!font.renderer.hasBuiltPath(fontChar)) {
            var path = font.renderer.getPathJs(fontChar);
            this.handler.send('commonobj', [
              font.loadedName + '_path_' + fontChar,
              'FontPath',
              path
            ]);
          }
        }.bind(this);

        for (var i = 0, ii = glyphs.length; i < ii; i++) {
          var glyph = glyphs[i];
          buildPath(glyph.fontChar);

          // If the glyph has an accent we need to build a path for its
          // fontChar too, otherwise CanvasGraphics_paintChar will fail.
          var accent = glyph.accent;
          if (accent && accent.fontChar) {
            buildPath(accent.fontChar);
          }
        }
      }

      return glyphs;
    },

    setGState: function PartialEvaluator_setGState(resources, gState,
                                                   operatorList, task,
                                                   xref, stateManager) {
      // This array holds the converted/processed state data.
      var gStateObj = [];
      var gStateKeys = gState.getKeys();
      var self = this;
      var promise = Promise.resolve();
      for (var i = 0, ii = gStateKeys.length; i < ii; i++) {
        var key = gStateKeys[i];
        var value = gState.get(key);
        switch (key) {
          case 'Type':
            break;
          case 'LW':
          case 'LC':
          case 'LJ':
          case 'ML':
          case 'D':
          case 'RI':
          case 'FL':
          case 'CA':
          case 'ca':
            gStateObj.push([key, value]);
            break;
          case 'Font':
            promise = promise.then(function () {
              return self.handleSetFont(resources, null, value[0], operatorList,
                                        task, stateManager.state).
                then(function (loadedName) {
                  operatorList.addDependency(loadedName);
                  gStateObj.push([key, [loadedName, value[1]]]);
                });
            });
            break;
          case 'BM':
            gStateObj.push([key, value]);
            break;
          case 'SMask':
            if (isName(value, 'None')) {
              gStateObj.push([key, false]);
              break;
            }
            if (isDict(value)) {
              promise = promise.then(function (dict) {
                return self.handleSMask(dict, resources, operatorList,
                                        task, stateManager);
              }.bind(this, value));
              gStateObj.push([key, true]);
            } else {
              warn('Unsupported SMask type');
            }

            break;
          // Only generate info log messages for the following since
          // they are unlikely to have a big impact on the rendering.
          case 'OP':
          case 'op':
          case 'OPM':
          case 'BG':
          case 'BG2':
          case 'UCR':
          case 'UCR2':
          case 'TR':
          case 'TR2':
          case 'HT':
          case 'SM':
          case 'SA':
          case 'AIS':
          case 'TK':
            // TODO implement these operators.
            info('graphic state operator ' + key);
            break;
          default:
            info('Unknown graphic state operator ' + key);
            break;
        }
      }
      return promise.then(function () {
        if (gStateObj.length > 0) {
          operatorList.addOp(OPS.setGState, [gStateObj]);
        }
      });
    },

    loadFont: function PartialEvaluator_loadFont(fontName, font, xref,
                                                 resources) {

      function errorFont() {
        return Promise.resolve(new TranslatedFont('g_font_error',
          new ErrorFont('Font ' + fontName + ' is not available'), font));
      }
      var fontRef;
      if (font) { // Loading by ref.
        assert(isRef(font));
        fontRef = font;
      } else { // Loading by name.
        var fontRes = resources.get('Font');
        if (fontRes) {
          fontRef = fontRes.getRaw(fontName);
        } else {
          warn('fontRes not available');
          return errorFont();
        }
      }
      if (!fontRef) {
        warn('fontRef not available');
        return errorFont();
      }

      if (this.fontCache.has(fontRef)) {
        return this.fontCache.get(fontRef);
      }

      font = xref.fetchIfRef(fontRef);
      if (!isDict(font)) {
        return errorFont();
      }

      // We are holding `font.translated` references just for `fontRef`s that
      // are not actually `Ref`s, but rather `Dict`s. See explanation below.
      if (font.translated) {
        return font.translated;
      }

      var fontCapability = createPromiseCapability();

      var preEvaluatedFont = this.preEvaluateFont(font, xref);
      var descriptor = preEvaluatedFont.descriptor;

      var fontRefIsRef = isRef(fontRef), fontID;
      if (fontRefIsRef) {
        fontID = fontRef.toString();
      }

      if (isDict(descriptor)) {
        if (!descriptor.fontAliases) {
          descriptor.fontAliases = Object.create(null);
        }

        var fontAliases = descriptor.fontAliases;
        var hash = preEvaluatedFont.hash;
        if (fontAliases[hash]) {
          var aliasFontRef = fontAliases[hash].aliasRef;
          if (fontRefIsRef && aliasFontRef &&
              this.fontCache.has(aliasFontRef)) {
            this.fontCache.putAlias(fontRef, aliasFontRef);
            return this.fontCache.get(fontRef);
          }
        } else {
          fontAliases[hash] = {
            fontID: Font.getFontID()
          };
        }

        if (fontRefIsRef) {
          fontAliases[hash].aliasRef = fontRef;
        }
        fontID = fontAliases[hash].fontID;
      }

      // Workaround for bad PDF generators that reference fonts incorrectly,
      // where `fontRef` is a `Dict` rather than a `Ref` (fixes bug946506.pdf).
      // In this case we should not put the font into `this.fontCache` (which is
      // a `RefSetCache`), since it's not meaningful to use a `Dict` as a key.
      //
      // However, if we don't cache the font it's not possible to remove it
      // when `cleanup` is triggered from the API, which causes issues on
      // subsequent rendering operations (see issue7403.pdf).
      // A simple workaround would be to just not hold `font.translated`
      // references in this case, but this would force us to unnecessarily load
      // the same fonts over and over.
      //
      // Instead, we cheat a bit by attempting to use a modified `fontID` as a
      // key in `this.fontCache`, to allow the font to be cached.
      // NOTE: This works because `RefSetCache` calls `toString()` on provided
      //       keys. Also, since `fontRef` is used when getting cached fonts,
      //       we'll not accidentally match fonts cached with the `fontID`.
      if (fontRefIsRef) {
        this.fontCache.put(fontRef, fontCapability.promise);
      } else {
        if (!fontID) {
          fontID = (this.uniquePrefix || 'F_') + (++this.idCounters.obj);
        }
        this.fontCache.put('id_' + fontID, fontCapability.promise);
      }
      assert(fontID, 'The "fontID" must be defined.');

      // Keep track of each font we translated so the caller can
      // load them asynchronously before calling display on a page.
      font.loadedName = 'g_' + this.pdfManager.docId + '_f' + fontID;

      font.translated = fontCapability.promise;

      // TODO move promises into translate font
      var translatedPromise;
      try {
        translatedPromise = this.translateFont(preEvaluatedFont, xref);
      } catch (e) {
        translatedPromise = Promise.reject(e);
      }

      var self = this;
      translatedPromise.then(function (translatedFont) {
        if (translatedFont.fontType !== undefined) {
          var xrefFontStats = xref.stats.fontTypes;
          xrefFontStats[translatedFont.fontType] = true;
        }

        fontCapability.resolve(new TranslatedFont(font.loadedName,
          translatedFont, font));
      }, function (reason) {
        // TODO fontCapability.reject?
        // Error in the font data -- sending unsupported feature notification.
        self.handler.send('UnsupportedFeature',
                          {featureId: UNSUPPORTED_FEATURES.font});

        try {
          // error, but it's still nice to have font type reported
          var descriptor = preEvaluatedFont.descriptor;
          var fontFile3 = descriptor && descriptor.get('FontFile3');
          var subtype = fontFile3 && fontFile3.get('Subtype');
          var fontType = getFontType(preEvaluatedFont.type,
                                     subtype && subtype.name);
          var xrefFontStats = xref.stats.fontTypes;
          xrefFontStats[fontType] = true;
        } catch (ex) { }

        fontCapability.resolve(new TranslatedFont(font.loadedName,
          new ErrorFont(reason instanceof Error ? reason.message : reason),
          font));
      });
      return fontCapability.promise;
    },

    buildPath: function PartialEvaluator_buildPath(operatorList, fn, args) {
      var lastIndex = operatorList.length - 1;
      if (!args) {
        args = [];
      }
      if (lastIndex < 0 ||
          operatorList.fnArray[lastIndex] !== OPS.constructPath) {
        operatorList.addOp(OPS.constructPath, [[fn], args]);
      } else {
        var opArgs = operatorList.argsArray[lastIndex];
        opArgs[0].push(fn);
        Array.prototype.push.apply(opArgs[1], args);
      }
    },

    handleColorN: function PartialEvaluator_handleColorN(operatorList, fn, args,
          cs, patterns, resources, task, xref) {
      // compile tiling patterns
      var patternName = args[args.length - 1];
      // SCN/scn applies patterns along with normal colors
      var pattern;
      if (isName(patternName) &&
          (pattern = patterns.get(patternName.name))) {
        var dict = (isStream(pattern) ? pattern.dict : pattern);
        var typeNum = dict.get('PatternType');

        if (typeNum === TILING_PATTERN) {
          var color = cs.base ? cs.base.getRgb(args, 0) : null;
          return this.handleTilingType(fn, color, resources, pattern,
                                       dict, operatorList, task);
        } else if (typeNum === SHADING_PATTERN) {
          var shading = dict.get('Shading');
          var matrix = dict.getArray('Matrix');
          pattern = Pattern.parseShading(shading, matrix, xref, resources,
                                         this.handler);
          operatorList.addOp(fn, pattern.getIR());
          return Promise.resolve();
        } else {
          return Promise.reject('Unknown PatternType: ' + typeNum);
        }
      }
      // TODO shall we fail here?
      operatorList.addOp(fn, args);
      return Promise.resolve();
    },

    getOperatorList: function PartialEvaluator_getOperatorList(stream,
                                                               task,
                                                               resources,
                                                               operatorList,
                                                               initialState) {

      var self = this;
      var xref = this.xref;
      var imageCache = Object.create(null);

      assert(operatorList);

      resources = (resources || Dict.empty);
      var xobjs = (resources.get('XObject') || Dict.empty);
      var patterns = (resources.get('Pattern') || Dict.empty);
      var stateManager = new StateManager(initialState || new EvalState());
      var preprocessor = new EvaluatorPreprocessor(stream, xref, stateManager);
      var timeSlotManager = new TimeSlotManager();

      return new Promise(function promiseBody(resolve, reject) {
        var next = function (promise) {
          promise.then(function () {
            try {
              promiseBody(resolve, reject);
            } catch (ex) {
              reject(ex);
            }
          }, reject);
        };
        task.ensureNotTerminated();
        timeSlotManager.reset();
        var stop, operation = {}, i, ii, cs;
        while (!(stop = timeSlotManager.check())) {
          // The arguments parsed by read() are used beyond this loop, so we
          // cannot reuse the same array on each iteration. Therefore we pass
          // in |null| as the initial value (see the comment on
          // EvaluatorPreprocessor_read() for why).
          operation.args = null;
          if (!(preprocessor.read(operation))) {
            break;
          }
          var args = operation.args;
          var fn = operation.fn;

          switch (fn | 0) {
            case OPS.paintXObject:
              if (args[0].code) {
                break;
              }
              // eagerly compile XForm objects
              var name = args[0].name;
              if (!name) {
                warn('XObject must be referred to by name.');
                continue;
              }
              if (imageCache[name] !== undefined) {
                operatorList.addOp(imageCache[name].fn, imageCache[name].args);
                args = null;
                continue;
              }

              var xobj = xobjs.get(name);
              if (xobj) {
                assert(isStream(xobj), 'XObject should be a stream');

                var type = xobj.dict.get('Subtype');
                assert(isName(type), 'XObject should have a Name subtype');

                if (type.name === 'Form') {
                  stateManager.save();
                  next(self.buildFormXObject(resources, xobj, null,
                                             operatorList, task,
                                             stateManager.state.clone()).
                    then(function () {
                      stateManager.restore();
                    }));
                  return;
                } else if (type.name === 'Image') {
                  self.buildPaintImageXObject(resources, xobj, false,
                    operatorList, name, imageCache);
                  args = null;
                  continue;
                } else if (type.name === 'PS') {
                  // PostScript XObjects are unused when viewing documents.
                  // See section 4.7.1 of Adobe's PDF reference.
                  info('Ignored XObject subtype PS');
                  continue;
                } else {
                  error('Unhandled XObject subtype ' + type.name);
                }
              }
              break;
            case OPS.setFont:
              var fontSize = args[1];
              // eagerly collect all fonts
              next(self.handleSetFont(resources, args, null, operatorList,
                                      task, stateManager.state).
                then(function (loadedName) {
                  operatorList.addDependency(loadedName);
                  operatorList.addOp(OPS.setFont, [loadedName, fontSize]);
                }));
              return;
            case OPS.endInlineImage:
              var cacheKey = args[0].cacheKey;
              if (cacheKey) {
                var cacheEntry = imageCache[cacheKey];
                if (cacheEntry !== undefined) {
                  operatorList.addOp(cacheEntry.fn, cacheEntry.args);
                  args = null;
                  continue;
                }
              }
              self.buildPaintImageXObject(resources, args[0], true,
                operatorList, cacheKey, imageCache);
              args = null;
              continue;
            case OPS.showText:
              args[0] = self.handleText(args[0], stateManager.state);
              break;
            case OPS.showSpacedText:
              var arr = args[0];
              var combinedGlyphs = [];
              var arrLength = arr.length;
              var state = stateManager.state;
              for (i = 0; i < arrLength; ++i) {
                var arrItem = arr[i];
                if (isString(arrItem)) {
                  Array.prototype.push.apply(combinedGlyphs,
                    self.handleText(arrItem, state));
                } else if (isNum(arrItem)) {
                  combinedGlyphs.push(arrItem);
                }
              }
              args[0] = combinedGlyphs;
              fn = OPS.showText;
              break;
            case OPS.nextLineShowText:
              operatorList.addOp(OPS.nextLine);
              args[0] = self.handleText(args[0], stateManager.state);
              fn = OPS.showText;
              break;
            case OPS.nextLineSetSpacingShowText:
              operatorList.addOp(OPS.nextLine);
              operatorList.addOp(OPS.setWordSpacing, [args.shift()]);
              operatorList.addOp(OPS.setCharSpacing, [args.shift()]);
              args[0] = self.handleText(args[0], stateManager.state);
              fn = OPS.showText;
              break;
            case OPS.setTextRenderingMode:
              stateManager.state.textRenderingMode = args[0];
              break;

            case OPS.setFillColorSpace:
              stateManager.state.fillColorSpace =
                ColorSpace.parse(args[0], xref, resources);
              continue;
            case OPS.setStrokeColorSpace:
              stateManager.state.strokeColorSpace =
                ColorSpace.parse(args[0], xref, resources);
              continue;
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
              if (cs.name === 'Pattern') {
                next(self.handleColorN(operatorList, OPS.setFillColorN, args,
                     cs, patterns, resources, task, xref));
                return;
              }
              args = cs.getRgb(args, 0);
              fn = OPS.setFillRGBColor;
              break;
            case OPS.setStrokeColorN:
              cs = stateManager.state.strokeColorSpace;
              if (cs.name === 'Pattern') {
                next(self.handleColorN(operatorList, OPS.setStrokeColorN, args,
                     cs, patterns, resources, task, xref));
                return;
              }
              args = cs.getRgb(args, 0);
              fn = OPS.setStrokeRGBColor;
              break;

            case OPS.shadingFill:
              var shadingRes = resources.get('Shading');
              if (!shadingRes) {
                error('No shading resource found');
              }

              var shading = shadingRes.get(args[0].name);
              if (!shading) {
                error('No shading object found');
              }

              var shadingFill = Pattern.parseShading(shading, null, xref,
                resources, self.handler);
              var patternIR = shadingFill.getIR();
              args = [patternIR];
              fn = OPS.shadingFill;
              break;
            case OPS.setGState:
              var dictName = args[0];
              var extGState = resources.get('ExtGState');

              if (!isDict(extGState) || !extGState.has(dictName.name)) {
                break;
              }

              var gState = extGState.get(dictName.name);
              next(self.setGState(resources, gState, operatorList, task, xref,
                   stateManager));
              return;
            case OPS.moveTo:
            case OPS.lineTo:
            case OPS.curveTo:
            case OPS.curveTo2:
            case OPS.curveTo3:
            case OPS.closePath:
              self.buildPath(operatorList, fn, args);
              continue;
            case OPS.rectangle:
              self.buildPath(operatorList, fn, args);
              continue;
            case OPS.markPoint:
            case OPS.markPointProps:
            case OPS.beginMarkedContent:
            case OPS.beginMarkedContentProps:
            case OPS.endMarkedContent:
            case OPS.beginCompat:
            case OPS.endCompat:
              // Ignore operators where the corresponding handlers are known to
              // be no-op in CanvasGraphics (display/canvas.js). This prevents
              // serialization errors and is also a bit more efficient.
              // We could also try to serialize all objects in a general way,
              // e.g. as done in https://github.com/mozilla/pdf.js/pull/6266,
              // but doing so is meaningless without knowing the semantics.
              continue;
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
                  warn('getOperatorList - ignoring operator: ' + fn);
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
        for (i = 0, ii = preprocessor.savedStatesDepth; i < ii; i++) {
          operatorList.addOp(OPS.restore, []);
        }
        resolve();
      });
    },

    getTextContent:
        function PartialEvaluator_getTextContent(stream, task, resources,
                                                 stateManager,
                                                 normalizeWhitespace,
                                                 combineTextItems) {

      stateManager = (stateManager || new StateManager(new TextState()));

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

      resources = (xref.fetchIfRef(resources) || Dict.empty);

      // The xobj is parsed iff it's needed, e.g. if there is a `DO` cmd.
      var xobjs = null;
      var xobjsCache = Object.create(null);

      var preprocessor = new EvaluatorPreprocessor(stream, xref, stateManager);

      var textState;

      function ensureTextContentItem() {
        if (textContentItem.initialized) {
          return textContentItem;
        }
        var font = textState.font;
        if (!(font.loadedName in textContent.styles)) {
          textContent.styles[font.loadedName] = {
            fontFamily: font.fallbackName,
            ascent: font.ascent,
            descent: font.descent,
            vertical: font.vertical
          };
        }
        textContentItem.fontName = font.loadedName;

        // 9.4.4 Text Space Details
        var tsm = [textState.fontSize * textState.textHScale, 0,
                   0, textState.fontSize,
                   0, textState.textRise];

        if (font.isType3Font &&
            textState.fontMatrix !== FONT_IDENTITY_MATRIX &&
            textState.fontSize === 1) {
          var glyphHeight = font.bbox[3] - font.bbox[1];
          if (glyphHeight > 0) {
            glyphHeight = glyphHeight * textState.fontMatrix[3];
            tsm[3] *= glyphHeight;
          }
        }

        var trm = Util.transform(textState.ctm,
                                 Util.transform(textState.textMatrix, tsm));
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
          textContentItem.fakeMultiSpaceMax =
            spaceWidth * MULTI_SPACE_FACTOR_MAX;
          // It's okay for monospace fonts to fake as much space as needed.
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
        // Replaces all whitespaces with standard spaces (0x20), to avoid
        // alignment issues between the textLayer and the canvas if the text
        // contains e.g. tabs (fixes issue6612.pdf).
        var i = 0, ii = str.length, code;
        while (i < ii && (code = str.charCodeAt(i)) >= 0x20 && code <= 0x7F) {
          i++;
        }
        return (i < ii ? str.replace(WhitespaceRegexp, ' ') : str);
      }

      function runBidiTransform(textChunk) {
        var str = textChunk.str.join('');
        var bidiResult = bidi(str, -1, textChunk.vertical);
        return {
          str: (normalizeWhitespace ? replaceWhitespace(bidiResult.str) :
                                      bidiResult.str),
          dir: bidiResult.dir,
          width: textChunk.width,
          height: textChunk.height,
          transform: textChunk.transform,
          fontName: textChunk.fontName
        };
      }

      function handleSetFont(fontName, fontRef) {
        return self.loadFont(fontName, fontRef, xref, resources).
          then(function (translated) {
            textState.font = translated.font;
            textState.fontMatrix = translated.font.fontMatrix ||
              FONT_IDENTITY_MATRIX;
          });
      }

      function buildTextContentItem(chars) {
        var font = textState.font;
        var textChunk = ensureTextContentItem();
        var width = 0;
        var height = 0;
        var glyphs = font.charsToGlyphs(chars);
        var defaultVMetrics = font.defaultVMetrics;
        for (var i = 0; i < glyphs.length; i++) {
          var glyph = glyphs[i];
          var vMetricX = null;
          var vMetricY = null;
          var glyphWidth = null;
          if (font.vertical) {
            if (glyph.vmetric) {
              glyphWidth = glyph.vmetric[0];
              vMetricX = glyph.vmetric[1];
              vMetricY = glyph.vmetric[2];
            } else {
              glyphWidth = glyph.width;
              vMetricX = glyph.width * 0.5;
              vMetricY = defaultVMetrics[2];
            }
          } else {
            glyphWidth = glyph.width;
          }

          var glyphUnicode = glyph.unicode;
          var NormalizedUnicodes = getNormalizedUnicodes();
          if (NormalizedUnicodes[glyphUnicode] !== undefined) {
            glyphUnicode = NormalizedUnicodes[glyphUnicode];
          }
          glyphUnicode = reverseIfRtl(glyphUnicode);

          // The following will calculate the x and y of the individual glyphs.
          // if (font.vertical) {
          //   tsm[4] -= vMetricX * Math.abs(textState.fontSize) *
          //             textState.fontMatrix[0];
          //   tsm[5] -= vMetricY * textState.fontSize *
          //             textState.fontMatrix[0];
          // }
          // var trm = Util.transform(textState.textMatrix, tsm);
          // var pt = Util.applyTransform([trm[4], trm[5]], textState.ctm);
          // var x = pt[0];
          // var y = pt[1];

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
            tx = (w0 * textState.fontSize + charSpacing) *
                 textState.textHScale;
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
          strBuf.push(' ');
          return;
        }
        var fakeSpaces = Math.round(width / textContentItem.spaceWidth);
        while (fakeSpaces-- > 0) {
          strBuf.push(' ');
        }
      }

      function flushTextContentItem() {
        if (!textContentItem.initialized) {
          return;
        }

        // Do final text scaling
        textContentItem.width *= textContentItem.textAdvanceScale;
        textContentItem.height *= textContentItem.textAdvanceScale;
        textContent.items.push(runBidiTransform(textContentItem));

        textContentItem.initialized = false;
        textContentItem.str.length = 0;
      }

      var timeSlotManager = new TimeSlotManager();

      return new Promise(function promiseBody(resolve, reject) {
        var next = function (promise) {
          promise.then(function () {
            try {
              promiseBody(resolve, reject);
            } catch (ex) {
              reject(ex);
            }
          }, reject);
        };
        task.ensureNotTerminated();
        timeSlotManager.reset();
        var stop, operation = {}, args = [];
        while (!(stop = timeSlotManager.check())) {
          // The arguments parsed by read() are not used beyond this loop, so
          // we can reuse the same array on every iteration, thus avoiding
          // unnecessary allocations.
          args.length = 0;
          operation.args = args;
          if (!(preprocessor.read(operation))) {
            break;
          }
          textState = stateManager.state;
          var fn = operation.fn;
          args = operation.args;
          var advance, diff;

          switch (fn | 0) {
            case OPS.setFont:
              // Optimization to ignore multiple identical Tf commands.
              var fontNameArg = args[0].name, fontSizeArg = args[1];
              if (textState.font && fontNameArg === textState.fontName &&
                  fontSizeArg === textState.fontSize) {
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
              // Optimization to treat same line movement as advance
              var isSameTextLine = !textState.font ? false :
                ((textState.font.vertical ? args[0] : args[1]) === 0);
              advance = args[0] - args[1];
              if (combineTextItems &&
                  isSameTextLine && textContentItem.initialized &&
                  advance > 0 &&
                  advance <= textContentItem.fakeMultiSpaceMax) {
                textState.translateTextLineMatrix(args[0], args[1]);
                textContentItem.width +=
                  (args[0] - textContentItem.lastAdvanceWidth);
                textContentItem.height +=
                  (args[1] - textContentItem.lastAdvanceHeight);
                diff = (args[0] - textContentItem.lastAdvanceWidth) -
                       (args[1] - textContentItem.lastAdvanceHeight);
                addFakeSpaces(diff, textContentItem.str);
                break;
              }

              flushTextContentItem();
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
              flushTextContentItem();
              textState.carriageReturn();
              break;
            case OPS.setTextMatrix:
              // Optimization to treat same line movement as advance.
              advance = textState.calcTextLineMatrixAdvance(
                args[0], args[1], args[2], args[3], args[4], args[5]);
              if (combineTextItems &&
                  advance !== null && textContentItem.initialized &&
                  advance.value > 0 &&
                  advance.value <= textContentItem.fakeMultiSpaceMax) {
                textState.translateTextLineMatrix(advance.width,
                                                  advance.height);
                textContentItem.width +=
                  (advance.width - textContentItem.lastAdvanceWidth);
                textContentItem.height +=
                  (advance.height - textContentItem.lastAdvanceHeight);
                diff = (advance.width - textContentItem.lastAdvanceWidth) -
                       (advance.height - textContentItem.lastAdvanceHeight);
                addFakeSpaces(diff, textContentItem.str);
                break;
              }

              flushTextContentItem();
              textState.setTextMatrix(args[0], args[1], args[2], args[3],
                args[4], args[5]);
              textState.setTextLineMatrix(args[0], args[1], args[2], args[3],
                args[4], args[5]);
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
              var items = args[0];
              var offset;
              for (var j = 0, jj = items.length; j < jj; j++) {
                if (typeof items[j] === 'string') {
                  buildTextContentItem(items[j]);
                } else if (isNum(items[j])) {
                  ensureTextContentItem();

                  // PDF Specification 5.3.2 states:
                  // The number is expressed in thousandths of a unit of text
                  // space.
                  // This amount is subtracted from the current horizontal or
                  // vertical coordinate, depending on the writing mode.
                  // In the default coordinate system, a positive adjustment
                  // has the effect of moving the next glyph painted either to
                  // the left or down by the given amount.
                  advance = items[j] * textState.fontSize / 1000;
                  var breakTextRun = false;
                  if (textState.font.vertical) {
                    offset = advance;
                    textState.translateTextMatrix(0, offset);
                    breakTextRun = textContentItem.textRunBreakAllowed &&
                                   advance > textContentItem.fakeMultiSpaceMax;
                    if (!breakTextRun) {
                      // Value needs to be added to height to paint down.
                      textContentItem.height += offset;
                    }
                  } else {
                    advance = -advance;
                    offset = advance * textState.textHScale;
                    textState.translateTextMatrix(offset, 0);
                    breakTextRun = textContentItem.textRunBreakAllowed &&
                                   advance > textContentItem.fakeMultiSpaceMax;
                    if (!breakTextRun) {
                      // Value needs to be subtracted from width to paint left.
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
            case OPS.showText:
              buildTextContentItem(args[0]);
              break;
            case OPS.nextLineShowText:
              flushTextContentItem();
              textState.carriageReturn();
              buildTextContentItem(args[0]);
              break;
            case OPS.nextLineSetSpacingShowText:
              flushTextContentItem();
              textState.wordSpacing = args[0];
              textState.charSpacing = args[1];
              textState.carriageReturn();
              buildTextContentItem(args[2]);
              break;
            case OPS.paintXObject:
              flushTextContentItem();
              if (args[0].code) {
                break;
              }

              if (!xobjs) {
                xobjs = (resources.get('XObject') || Dict.empty);
              }

              var name = args[0].name;
              if (xobjsCache.key === name) {
                if (xobjsCache.texts) {
                  Util.appendToArray(textContent.items, xobjsCache.texts.items);
                  Util.extendObj(textContent.styles, xobjsCache.texts.styles);
                }
                break;
              }

              var xobj = xobjs.get(name);
              if (!xobj) {
                break;
              }
              assert(isStream(xobj), 'XObject should be a stream');

              var type = xobj.dict.get('Subtype');
              assert(isName(type), 'XObject should have a Name subtype');

              if ('Form' !== type.name) {
                xobjsCache.key = name;
                xobjsCache.texts = null;
                break;
              }

              stateManager.save();
              var matrix = xobj.dict.getArray('Matrix');
              if (isArray(matrix) && matrix.length === 6) {
                stateManager.transform(matrix);
              }

              next(self.getTextContent(xobj, task,
                   xobj.dict.get('Resources') || resources, stateManager,
                   normalizeWhitespace, combineTextItems).then(
                function (formTextContent) {
                  Util.appendToArray(textContent.items, formTextContent.items);
                  Util.extendObj(textContent.styles, formTextContent.styles);
                  stateManager.restore();

                  xobjsCache.key = name;
                  xobjsCache.texts = formTextContent;
                }));
              return;
            case OPS.setGState:
              flushTextContentItem();
              var dictName = args[0];
              var extGState = resources.get('ExtGState');

              if (!isDict(extGState) || !isName(dictName)) {
                break;
              }
              var gState = extGState.get(dictName.name);
              if (!isDict(gState)) {
                break;
              }
              var gStateFont = gState.get('Font');
              if (gStateFont) {
                textState.fontName = null;
                textState.fontSize = gStateFont[1];
                next(handleSetFont(null, gStateFont[0]));
                return;
              }
              break;
          } // switch
        } // while
        if (stop) {
          next(deferred);
          return;
        }
        flushTextContentItem();
        resolve(textContent);
      });
    },

    extractDataStructures:
        function PartialEvaluator_extractDataStructures(dict, baseDict,
                                                        xref, properties) {
      // 9.10.2
      var toUnicode = (dict.get('ToUnicode') || baseDict.get('ToUnicode'));
      var toUnicodePromise = toUnicode ?
        this.readToUnicode(toUnicode) : Promise.resolve(undefined);

      if (properties.composite) {
        // CIDSystemInfo helps to match CID to glyphs
        var cidSystemInfo = dict.get('CIDSystemInfo');
        if (isDict(cidSystemInfo)) {
          properties.cidSystemInfo = {
            registry: cidSystemInfo.get('Registry'),
            ordering: cidSystemInfo.get('Ordering'),
            supplement: cidSystemInfo.get('Supplement')
          };
        }

        var cidToGidMap = dict.get('CIDToGIDMap');
        if (isStream(cidToGidMap)) {
          properties.cidToGidMap = this.readCidToGidMap(cidToGidMap);
        }
      }

      // Based on 9.6.6 of the spec the encoding can come from multiple places
      // and depends on the font type. The base encoding and differences are
      // read here, but the encoding that is actually used is chosen during
      // glyph mapping in the font.
      // TODO: Loading the built in encoding in the font would allow the
      // differences to be merged in here not require us to hold on to it.
      var differences = [];
      var baseEncodingName = null;
      var encoding;
      if (dict.has('Encoding')) {
        encoding = dict.get('Encoding');
        if (isDict(encoding)) {
          baseEncodingName = encoding.get('BaseEncoding');
          baseEncodingName = (isName(baseEncodingName) ?
                              baseEncodingName.name : null);
          // Load the differences between the base and original
          if (encoding.has('Differences')) {
            var diffEncoding = encoding.get('Differences');
            var index = 0;
            for (var j = 0, jj = diffEncoding.length; j < jj; j++) {
              var data = xref.fetchIfRef(diffEncoding[j]);
              if (isNum(data)) {
                index = data;
              } else if (isName(data)) {
                differences[index++] = data.name;
              } else {
                error('Invalid entry in \'Differences\' array: ' + data);
              }
            }
          }
        } else if (isName(encoding)) {
          baseEncodingName = encoding.name;
        } else {
          error('Encoding is not a Name nor a Dict');
        }
        // According to table 114 if the encoding is a named encoding it must be
        // one of these predefined encodings.
        if ((baseEncodingName !== 'MacRomanEncoding' &&
             baseEncodingName !== 'MacExpertEncoding' &&
             baseEncodingName !== 'WinAnsiEncoding')) {
          baseEncodingName = null;
        }
      }

      if (baseEncodingName) {
        properties.defaultEncoding = getEncoding(baseEncodingName).slice();
      } else {
        var isSymbolicFont = !!(properties.flags & FontFlags.Symbolic);
        var isNonsymbolicFont = !!(properties.flags & FontFlags.Nonsymbolic);
        // According to "Table 114" in section "9.6.6.1 General" (under
        // "9.6.6 Character Encoding") of the PDF specification, a Nonsymbolic
        // font should use the `StandardEncoding` if no encoding is specified.
        encoding = StandardEncoding;
        if (properties.type === 'TrueType' && !isNonsymbolicFont) {
          encoding = WinAnsiEncoding;
        }
        // The Symbolic attribute can be misused for regular fonts
        // Heuristic: we have to check if the font is a standard one also
        if (isSymbolicFont) {
          encoding = MacRomanEncoding;
          if (!properties.file) {
            if (/Symbol/i.test(properties.name)) {
              encoding = SymbolSetEncoding;
            } else if (/Dingbats/i.test(properties.name)) {
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
      return toUnicodePromise.then(function(toUnicode) {
        properties.toUnicode = toUnicode;
        return this.buildToUnicode(properties);
      }.bind(this)).then(function (toUnicode) {
        properties.toUnicode = toUnicode;
        return properties;
      });
    },

    /**
     * Builds a char code to unicode map based on section 9.10 of the spec.
     * @param {Object} properties Font properties object.
     * @return {Promise} A Promise that is resolved with a
     *   {ToUnicodeMap|IdentityToUnicodeMap} object.
     */
    buildToUnicode: function PartialEvaluator_buildToUnicode(properties) {
      properties.hasIncludedToUnicodeMap =
        !!properties.toUnicode && properties.toUnicode.length > 0;
      // Section 9.10.2 Mapping Character Codes to Unicode Values
      if (properties.hasIncludedToUnicodeMap) {
        return Promise.resolve(properties.toUnicode);
      }
      // According to the spec if the font is a simple font we should only map
      // to unicode if the base encoding is MacRoman, MacExpert, or WinAnsi or
      // the differences array only contains adobe standard or symbol set names,
      // in pratice it seems better to always try to create a toUnicode
      // map based of the default encoding.
      var toUnicode, charcode, glyphName;
      if (!properties.composite /* is simple font */) {
        toUnicode = [];
        var encoding = properties.defaultEncoding.slice();
        var baseEncodingName = properties.baseEncodingName;
        // Merge in the differences array.
        var differences = properties.differences;
        for (charcode in differences) {
          glyphName = differences[charcode];
          if (glyphName === '.notdef') {
            // Skip .notdef to prevent rendering errors, e.g. boxes appearing
            // where there should be spaces (fixes issue5256.pdf).
            continue;
          }
          encoding[charcode] = glyphName;
        }
        var glyphsUnicodeMap = getGlyphsUnicode();
        for (charcode in encoding) {
          // a) Map the character code to a character name.
          glyphName = encoding[charcode];
          // b) Look up the character name in the Adobe Glyph List (see the
          //    Bibliography) to obtain the corresponding Unicode value.
          if (glyphName === '') {
            continue;
          } else if (glyphsUnicodeMap[glyphName] === undefined) {
            // (undocumented) c) Few heuristics to recognize unknown glyphs
            // NOTE: Adobe Reader does not do this step, but OSX Preview does
            var code = 0;
            switch (glyphName[0]) {
              case 'G': // Gxx glyph
                if (glyphName.length === 3) {
                  code = parseInt(glyphName.substr(1), 16);
                }
                break;
              case 'g': // g00xx glyph
                if (glyphName.length === 5) {
                  code = parseInt(glyphName.substr(1), 16);
                }
                break;
              case 'C': // Cddd glyph
              case 'c': // cddd glyph
                if (glyphName.length >= 3) {
                  code = +glyphName.substr(1);
                }
                break;
              default:
                // 'uniXXXX'/'uXXXX{XX}' glyphs
                var unicode = getUnicodeForGlyph(glyphName, glyphsUnicodeMap);
                if (unicode !== -1) {
                  code = unicode;
                }
            }
            if (code) {
              // If |baseEncodingName| is one the predefined encodings,
              // and |code| equals |charcode|, using the glyph defined in the
              // baseEncoding seems to yield a better |toUnicode| mapping
              // (fixes issue 5070).
              if (baseEncodingName && code === +charcode) {
                var baseEncoding = getEncoding(baseEncodingName);
                if (baseEncoding && (glyphName = baseEncoding[charcode])) {
                  toUnicode[charcode] =
                    String.fromCharCode(glyphsUnicodeMap[glyphName]);
                  continue;
                }
              }
              toUnicode[charcode] = String.fromCharCode(code);
            }
            continue;
          }
          toUnicode[charcode] =
            String.fromCharCode(glyphsUnicodeMap[glyphName]);
        }
        return Promise.resolve(new ToUnicodeMap(toUnicode));
      }
      // If the font is a composite font that uses one of the predefined CMaps
      // listed in Table 118 (except Identity–H and Identity–V) or whose
      // descendant CIDFont uses the Adobe-GB1, Adobe-CNS1, Adobe-Japan1, or
      // Adobe-Korea1 character collection:
      if (properties.composite && (
           (properties.cMap.builtInCMap &&
            !(properties.cMap instanceof IdentityCMap)) ||
           (properties.cidSystemInfo.registry === 'Adobe' &&
             (properties.cidSystemInfo.ordering === 'GB1' ||
              properties.cidSystemInfo.ordering === 'CNS1' ||
              properties.cidSystemInfo.ordering === 'Japan1' ||
              properties.cidSystemInfo.ordering === 'Korea1')))) {
        // Then:
        // a) Map the character code to a character identifier (CID) according
        // to the font’s CMap.
        // b) Obtain the registry and ordering of the character collection used
        // by the font’s CMap (for example, Adobe and Japan1) from its
        // CIDSystemInfo dictionary.
        var registry = properties.cidSystemInfo.registry;
        var ordering = properties.cidSystemInfo.ordering;
        // c) Construct a second CMap name by concatenating the registry and
        // ordering obtained in step (b) in the format registry–ordering–UCS2
        // (for example, Adobe–Japan1–UCS2).
        var ucs2CMapName = Name.get(registry + '-' + ordering + '-UCS2');
        // d) Obtain the CMap with the name constructed in step (c) (available
        // from the ASN Web site; see the Bibliography).
        return CMapFactory.create(ucs2CMapName, this.options.cMapOptions,
                                  null).then(
            function (ucs2CMap) {
          var cMap = properties.cMap;
          toUnicode = [];
          cMap.forEach(function(charcode, cid) {
            assert(cid <= 0xffff, 'Max size of CID is 65,535');
            // e) Map the CID obtained in step (a) according to the CMap
            // obtained in step (d), producing a Unicode value.
            var ucs2 = ucs2CMap.lookup(cid);
            if (ucs2) {
              toUnicode[charcode] =
                String.fromCharCode((ucs2.charCodeAt(0) << 8) +
                                    ucs2.charCodeAt(1));
            }
          });
          return new ToUnicodeMap(toUnicode);
        });
      }

      // The viewer's choice, just use an identity map.
      return Promise.resolve(new IdentityToUnicodeMap(properties.firstChar,
                                                      properties.lastChar));
    },

    readToUnicode: function PartialEvaluator_readToUnicode(toUnicode) {
      var cmapObj = toUnicode;
      if (isName(cmapObj)) {
        return CMapFactory.create(cmapObj, this.options.cMapOptions, null).then(
            function (cmap) {
          if (cmap instanceof IdentityCMap) {
            return new IdentityToUnicodeMap(0, 0xFFFF);
          }
          return new ToUnicodeMap(cmap.getMap());
        });
      } else if (isStream(cmapObj)) {
        return CMapFactory.create(cmapObj, this.options.cMapOptions, null).then(
            function (cmap) {
          if (cmap instanceof IdentityCMap) {
            return new IdentityToUnicodeMap(0, 0xFFFF);
          }
          var map = new Array(cmap.length);
          // Convert UTF-16BE
          // NOTE: cmap can be a sparse array, so use forEach instead of for(;;)
          // to iterate over all keys.
          cmap.forEach(function(charCode, token) {
            var str = [];
            for (var k = 0; k < token.length; k += 2) {
              var w1 = (token.charCodeAt(k) << 8) | token.charCodeAt(k + 1);
              if ((w1 & 0xF800) !== 0xD800) { // w1 < 0xD800 || w1 > 0xDFFF
                str.push(w1);
                continue;
              }
              k += 2;
              var w2 = (token.charCodeAt(k) << 8) | token.charCodeAt(k + 1);
              str.push(((w1 & 0x3ff) << 10) + (w2 & 0x3ff) + 0x10000);
            }
            map[charCode] = String.fromCharCode.apply(String, str);
          });
          return new ToUnicodeMap(map);
        });
      }
      return Promise.resolve(null);
    },

    readCidToGidMap: function PartialEvaluator_readCidToGidMap(cidToGidStream) {
      // Extract the encoding from the CIDToGIDMap
      var glyphsData = cidToGidStream.getBytes();

      // Set encoding 0 to later verify the font has an encoding
      var result = [];
      for (var j = 0, jj = glyphsData.length; j < jj; j++) {
        var glyphID = (glyphsData[j++] << 8) | glyphsData[j];
        if (glyphID === 0) {
          continue;
        }
        var code = j >> 1;
        result[code] = glyphID;
      }
      return result;
    },

    extractWidths: function PartialEvaluator_extractWidths(dict, xref,
                                                           descriptor,
                                                           properties) {
      var glyphsWidths = [];
      var defaultWidth = 0;
      var glyphsVMetrics = [];
      var defaultVMetrics;
      var i, ii, j, jj, start, code, widths;
      if (properties.composite) {
        defaultWidth = dict.get('DW') || 1000;

        widths = dict.get('W');
        if (widths) {
          for (i = 0, ii = widths.length; i < ii; i++) {
            start = xref.fetchIfRef(widths[i++]);
            code = xref.fetchIfRef(widths[i]);
            if (isArray(code)) {
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
          var vmetrics = dict.getArray('DW2') || [880, -1000];
          defaultVMetrics = [vmetrics[1], defaultWidth * 0.5, vmetrics[0]];
          vmetrics = dict.get('W2');
          if (vmetrics) {
            for (i = 0, ii = vmetrics.length; i < ii; i++) {
              start = xref.fetchIfRef(vmetrics[i++]);
              code = xref.fetchIfRef(vmetrics[i]);
              if (isArray(code)) {
                for (j = 0, jj = code.length; j < jj; j++) {
                  glyphsVMetrics[start++] = [
                    xref.fetchIfRef(code[j++]),
                    xref.fetchIfRef(code[j++]),
                    xref.fetchIfRef(code[j])
                  ];
                }
              } else {
                var vmetric = [
                  xref.fetchIfRef(vmetrics[++i]),
                  xref.fetchIfRef(vmetrics[++i]),
                  xref.fetchIfRef(vmetrics[++i])
                ];
                for (j = start; j <= code; j++) {
                  glyphsVMetrics[j] = vmetric;
                }
              }
            }
          }
        }
      } else {
        var firstChar = properties.firstChar;
        widths = dict.get('Widths');
        if (widths) {
          j = firstChar;
          for (i = 0, ii = widths.length; i < ii; i++) {
            glyphsWidths[j++] = xref.fetchIfRef(widths[i]);
          }
          defaultWidth = (parseFloat(descriptor.get('MissingWidth')) || 0);
        } else {
          // Trying get the BaseFont metrics (see comment above).
          var baseFontName = dict.get('BaseFont');
          if (isName(baseFontName)) {
            var metrics = this.getBaseFontMetrics(baseFontName.name);

            glyphsWidths = this.buildCharCodeToWidth(metrics.widths,
                                                     properties);
            defaultWidth = metrics.defaultWidth;
          }
        }
      }

      // Heuristic: detection of monospace font by checking all non-zero widths
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
        properties.flags |= FontFlags.FixedPitch;
      }

      properties.defaultWidth = defaultWidth;
      properties.widths = glyphsWidths;
      properties.defaultVMetrics = defaultVMetrics;
      properties.vmetrics = glyphsVMetrics;
    },

    isSerifFont: function PartialEvaluator_isSerifFont(baseFontName) {
      // Simulating descriptor flags attribute
      var fontNameWoStyle = baseFontName.split('-')[0];
      return (fontNameWoStyle in getSerifFonts()) ||
              (fontNameWoStyle.search(/serif/gi) !== -1);
    },

    getBaseFontMetrics: function PartialEvaluator_getBaseFontMetrics(name) {
      var defaultWidth = 0;
      var widths = [];
      var monospace = false;
      var stdFontMap = getStdFontMap();
      var lookupName = (stdFontMap[name] || name);
      var Metrics = getMetrics();

      if (!(lookupName in Metrics)) {
        // Use default fonts for looking up font metrics if the passed
        // font is not a base font
        if (this.isSerifFont(name)) {
          lookupName = 'Times-Roman';
        } else {
          lookupName = 'Helvetica';
        }
      }
      var glyphWidths = Metrics[lookupName];

      if (isNum(glyphWidths)) {
        defaultWidth = glyphWidths;
        monospace = true;
      } else {
        widths = glyphWidths(); // expand lazy widths array
      }

      return {
        defaultWidth: defaultWidth,
        monospace: monospace,
        widths: widths
      };
    },

    buildCharCodeToWidth:
        function PartialEvaluator_bulildCharCodeToWidth(widthsByGlyphName,
                                                        properties) {
      var widths = Object.create(null);
      var differences = properties.differences;
      var encoding = properties.defaultEncoding;
      for (var charCode = 0; charCode < 256; charCode++) {
        if (charCode in differences &&
            widthsByGlyphName[differences[charCode]]) {
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

    preEvaluateFont: function PartialEvaluator_preEvaluateFont(dict, xref) {
      var baseDict = dict;
      var type = dict.get('Subtype');
      assert(isName(type), 'invalid font Subtype');

      var composite = false;
      var uint8array;
      if (type.name === 'Type0') {
        // If font is a composite
        //  - get the descendant font
        //  - set the type according to the descendant font
        //  - get the FontDescriptor from the descendant font
        var df = dict.get('DescendantFonts');
        if (!df) {
          error('Descendant fonts are not specified');
        }
        dict = (isArray(df) ? xref.fetchIfRef(df[0]) : df);

        type = dict.get('Subtype');
        assert(isName(type), 'invalid font Subtype');
        composite = true;
      }

      var descriptor = dict.get('FontDescriptor');
      if (descriptor) {
        var hash = new MurmurHash3_64();
        var encoding = baseDict.getRaw('Encoding');
        if (isName(encoding)) {
          hash.update(encoding.name);
        } else if (isRef(encoding)) {
          hash.update(encoding.toString());
        } else if (isDict(encoding)) {
          var keys = encoding.getKeys();
          for (var i = 0, ii = keys.length; i < ii; i++) {
            var entry = encoding.getRaw(keys[i]);
            if (isName(entry)) {
              hash.update(entry.name);
            } else if (isRef(entry)) {
              hash.update(entry.toString());
            } else if (isArray(entry)) {
              // 'Differences' array (fixes bug1157493.pdf).
              var diffLength = entry.length, diffBuf = new Array(diffLength);

              for (var j = 0; j < diffLength; j++) {
                var diffEntry = entry[j];
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

        var toUnicode = dict.get('ToUnicode') || baseDict.get('ToUnicode');
        if (isStream(toUnicode)) {
          var stream = toUnicode.str || toUnicode;
          uint8array = stream.buffer ?
            new Uint8Array(stream.buffer.buffer, 0, stream.bufferLength) :
            new Uint8Array(stream.bytes.buffer,
                           stream.start, stream.end - stream.start);
          hash.update(uint8array);

        } else if (isName(toUnicode)) {
          hash.update(toUnicode.name);
        }

        var widths = dict.get('Widths') || baseDict.get('Widths');
        if (widths) {
          uint8array = new Uint8Array(new Uint32Array(widths).buffer);
          hash.update(uint8array);
        }
      }

      return {
        descriptor: descriptor,
        dict: dict,
        baseDict: baseDict,
        composite: composite,
        type: type.name,
        hash: hash ? hash.hexdigest() : ''
      };
    },

    translateFont: function PartialEvaluator_translateFont(preEvaluatedFont,
                                                           xref) {
      var baseDict = preEvaluatedFont.baseDict;
      var dict = preEvaluatedFont.dict;
      var composite = preEvaluatedFont.composite;
      var descriptor = preEvaluatedFont.descriptor;
      var type = preEvaluatedFont.type;
      var maxCharIndex = (composite ? 0xFFFF : 0xFF);
      var cMapOptions = this.options.cMapOptions;
      var properties;

      if (!descriptor) {
        if (type === 'Type3') {
          // FontDescriptor is only required for Type3 fonts when the document
          // is a tagged pdf. Create a barbebones one to get by.
          descriptor = new Dict(null);
          descriptor.set('FontName', Name.get(type));
          descriptor.set('FontBBox', dict.getArray('FontBBox'));
        } else {
          // Before PDF 1.5 if the font was one of the base 14 fonts, having a
          // FontDescriptor was not required.
          // This case is here for compatibility.
          var baseFontName = dict.get('BaseFont');
          if (!isName(baseFontName)) {
            error('Base font is not specified');
          }

          // Using base font name as a font name.
          baseFontName = baseFontName.name.replace(/[,_]/g, '-');
          var metrics = this.getBaseFontMetrics(baseFontName);

          // Simulating descriptor flags attribute
          var fontNameWoStyle = baseFontName.split('-')[0];
          var flags =
            (this.isSerifFont(fontNameWoStyle) ? FontFlags.Serif : 0) |
            (metrics.monospace ? FontFlags.FixedPitch : 0) |
            (getSymbolsFonts()[fontNameWoStyle] ? FontFlags.Symbolic :
                                                  FontFlags.Nonsymbolic);

          properties = {
            type: type,
            name: baseFontName,
            widths: metrics.widths,
            defaultWidth: metrics.defaultWidth,
            flags: flags,
            firstChar: 0,
            lastChar: maxCharIndex
          };
          return this.extractDataStructures(dict, dict, xref, properties).then(
              function (properties) {
            properties.widths = this.buildCharCodeToWidth(metrics.widths,
                                                          properties);
            return new Font(baseFontName, null, properties);
          }.bind(this));
        }
      }

      // According to the spec if 'FontDescriptor' is declared, 'FirstChar',
      // 'LastChar' and 'Widths' should exist too, but some PDF encoders seem
      // to ignore this rule when a variant of a standard font is used.
      // TODO Fill the width array depending on which of the base font this is
      // a variant.
      var firstChar = (dict.get('FirstChar') || 0);
      var lastChar = (dict.get('LastChar') || maxCharIndex);

      var fontName = descriptor.get('FontName');
      var baseFont = dict.get('BaseFont');
      // Some bad PDFs have a string as the font name.
      if (isString(fontName)) {
        fontName = Name.get(fontName);
      }
      if (isString(baseFont)) {
        baseFont = Name.get(baseFont);
      }

      if (type !== 'Type3') {
        var fontNameStr = fontName && fontName.name;
        var baseFontStr = baseFont && baseFont.name;
        if (fontNameStr !== baseFontStr) {
          info('The FontDescriptor\'s FontName is "' + fontNameStr +
               '" but should be the same as the Font\'s BaseFont "' +
               baseFontStr + '"');
          // Workaround for cases where e.g. fontNameStr = 'Arial' and
          // baseFontStr = 'Arial,Bold' (needed when no font file is embedded).
          if (fontNameStr && baseFontStr &&
              baseFontStr.indexOf(fontNameStr) === 0) {
            fontName = baseFont;
          }
        }
      }
      fontName = (fontName || baseFont);

      assert(isName(fontName), 'invalid font name');

      var fontFile = descriptor.get('FontFile', 'FontFile2', 'FontFile3');
      if (fontFile) {
        if (fontFile.dict) {
          var subtype = fontFile.dict.get('Subtype');
          if (subtype) {
            subtype = subtype.name;
          }
          var length1 = fontFile.dict.get('Length1');
          var length2 = fontFile.dict.get('Length2');
          var length3 = fontFile.dict.get('Length3');
        }
      }

      properties = {
        type: type,
        name: fontName.name,
        subtype: subtype,
        file: fontFile,
        length1: length1,
        length2: length2,
        length3: length3,
        loadedName: baseDict.loadedName,
        composite: composite,
        wideChars: composite,
        fixedPitch: false,
        fontMatrix: (dict.getArray('FontMatrix') || FONT_IDENTITY_MATRIX),
        firstChar: firstChar || 0,
        lastChar: (lastChar || maxCharIndex),
        bbox: descriptor.getArray('FontBBox'),
        ascent: descriptor.get('Ascent'),
        descent: descriptor.get('Descent'),
        xHeight: descriptor.get('XHeight'),
        capHeight: descriptor.get('CapHeight'),
        flags: descriptor.get('Flags'),
        italicAngle: descriptor.get('ItalicAngle'),
        coded: false
      };

      var cMapPromise;
      if (composite) {
        var cidEncoding = baseDict.get('Encoding');
        if (isName(cidEncoding)) {
          properties.cidEncoding = cidEncoding.name;
        }
        cMapPromise = CMapFactory.create(cidEncoding, cMapOptions, null).then(
            function (cMap) {
          properties.cMap = cMap;
          properties.vertical = properties.cMap.vertical;
        });
      } else {
        cMapPromise = Promise.resolve(undefined);
      }

      return cMapPromise.then(function () {
        return this.extractDataStructures(dict, baseDict, xref, properties);
      }.bind(this)).then(function (properties) {
        this.extractWidths(dict, xref, descriptor, properties);

        if (type === 'Type3') {
          properties.isType3Font = true;
        }

        return new Font(fontName.name, fontFile, properties);
      }.bind(this));
    }
  };

  return PartialEvaluator;
})();

var TranslatedFont = (function TranslatedFontClosure() {
  function TranslatedFont(loadedName, font, dict) {
    this.loadedName = loadedName;
    this.font = font;
    this.dict = dict;
    this.type3Loaded = null;
    this.sent = false;
  }
  TranslatedFont.prototype = {
    send: function (handler) {
      if (this.sent) {
        return;
      }
      var fontData = this.font.exportData();
      handler.send('commonobj', [
        this.loadedName,
        'Font',
        fontData
      ]);
      this.sent = true;
    },
    loadType3Data: function (evaluator, resources, parentOperatorList, task) {
      assert(this.font.isType3Font);

      if (this.type3Loaded) {
        return this.type3Loaded;
      }

      var translatedFont = this.font;
      var loadCharProcsPromise = Promise.resolve();
      var charProcs = this.dict.get('CharProcs');
      var fontResources = this.dict.get('Resources') || resources;
      var charProcKeys = charProcs.getKeys();
      var charProcOperatorList = Object.create(null);
      for (var i = 0, n = charProcKeys.length; i < n; ++i) {
        loadCharProcsPromise = loadCharProcsPromise.then(function (key) {
          var glyphStream = charProcs.get(key);
          var operatorList = new OperatorList();
          return evaluator.getOperatorList(glyphStream, task, fontResources,
                                           operatorList).then(function () {
            charProcOperatorList[key] = operatorList.getIR();

            // Add the dependencies to the parent operator list so they are
            // resolved before sub operator list is executed synchronously.
            parentOperatorList.addDependencies(operatorList.dependencies);
          }, function (reason) {
            warn('Type3 font resource \"' + key + '\" is not available');
            var operatorList = new OperatorList();
            charProcOperatorList[key] = operatorList.getIR();
          });
        }.bind(this, charProcKeys[i]));
      }
      this.type3Loaded = loadCharProcsPromise.then(function () {
        translatedFont.charProcOperatorList = charProcOperatorList;
      });
      return this.type3Loaded;
    }
  };
  return TranslatedFont;
})();

var OperatorList = (function OperatorListClosure() {
  var CHUNK_SIZE = 1000;
  var CHUNK_SIZE_ABOUT = CHUNK_SIZE - 5; // close to chunk size

  function getTransfers(queue) {
    var transfers = [];
    var fnArray = queue.fnArray, argsArray = queue.argsArray;
    for (var i = 0, ii = queue.length; i < ii; i++) {
      switch (fnArray[i]) {
        case OPS.paintInlineImageXObject:
        case OPS.paintInlineImageXObjectGroup:
        case OPS.paintImageMaskXObject:
          var arg = argsArray[i][0]; // first param in imgData
          if (!arg.cached) {
            transfers.push(arg.data.buffer);
          }
          break;
      }
    }
    return transfers;
  }

  function OperatorList(intent, messageHandler, pageIndex) {
    this.messageHandler = messageHandler;
    this.fnArray = [];
    this.argsArray = [];
    this.dependencies = Object.create(null);
    this._totalLength = 0;
    this.pageIndex = pageIndex;
    this.intent = intent;
  }

  OperatorList.prototype = {
    get length() {
      return this.argsArray.length;
    },

    /**
     * @returns {number} The total length of the entire operator list,
     *                   since `this.length === 0` after flushing.
     */
    get totalLength() {
      return (this._totalLength + this.length);
    },

    addOp: function(fn, args) {
      this.fnArray.push(fn);
      this.argsArray.push(args);
      if (this.messageHandler) {
        if (this.fnArray.length >= CHUNK_SIZE) {
          this.flush();
        } else if (this.fnArray.length >= CHUNK_SIZE_ABOUT &&
                   (fn === OPS.restore || fn === OPS.endText)) {
          // heuristic to flush on boundary of restore or endText
          this.flush();
        }
      }
    },

    addDependency: function(dependency) {
      if (dependency in this.dependencies) {
        return;
      }
      this.dependencies[dependency] = true;
      this.addOp(OPS.dependency, [dependency]);
    },

    addDependencies: function(dependencies) {
      for (var key in dependencies) {
        this.addDependency(key);
      }
    },

    addOpList: function(opList) {
      Util.extendObj(this.dependencies, opList.dependencies);
      for (var i = 0, ii = opList.length; i < ii; i++) {
        this.addOp(opList.fnArray[i], opList.argsArray[i]);
      }
    },

    getIR: function() {
      return {
        fnArray: this.fnArray,
        argsArray: this.argsArray,
        length: this.length
      };
    },

    flush: function(lastChunk) {
      if (this.intent !== 'oplist') {
        new QueueOptimizer().optimize(this);
      }
      var transfers = getTransfers(this);
      var length = this.length;
      this._totalLength += length;

      this.messageHandler.send('RenderPageChunk', {
        operatorList: {
          fnArray: this.fnArray,
          argsArray: this.argsArray,
          lastChunk: lastChunk,
          length: length
        },
        pageIndex: this.pageIndex,
        intent: this.intent
      }, transfers);
      this.dependencies = Object.create(null);
      this.fnArray.length = 0;
      this.argsArray.length = 0;
    }
  };

  return OperatorList;
})();

var StateManager = (function StateManagerClosure() {
  function StateManager(initialState) {
    this.state = initialState;
    this.stateStack = [];
  }
  StateManager.prototype = {
    save: function () {
      var old = this.state;
      this.stateStack.push(this.state);
      this.state = old.clone();
    },
    restore: function () {
      var prev = this.stateStack.pop();
      if (prev) {
        this.state = prev;
      }
    },
    transform: function (args) {
      this.state.ctm = Util.transform(this.state.ctm, args);
    }
  };
  return StateManager;
})();

var TextState = (function TextStateClosure() {
  function TextState() {
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

  TextState.prototype = {
    setTextMatrix: function TextState_setTextMatrix(a, b, c, d, e, f) {
      var m = this.textMatrix;
      m[0] = a; m[1] = b; m[2] = c; m[3] = d; m[4] = e; m[5] = f;
    },
    setTextLineMatrix: function TextState_setTextMatrix(a, b, c, d, e, f) {
      var m = this.textLineMatrix;
      m[0] = a; m[1] = b; m[2] = c; m[3] = d; m[4] = e; m[5] = f;
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
    calcTextLineMatrixAdvance:
        function TextState_calcTextLineMatrixAdvance(a, b, c, d, e, f) {
      var font = this.font;
      if (!font) {
        return null;
      }
      var m = this.textLineMatrix;
      if (!(a === m[0] && b === m[1] && c === m[2] && d === m[3])) {
        return null;
      }
      var txDiff = e - m[4], tyDiff = f - m[5];
      if ((font.vertical && txDiff !== 0) || (!font.vertical && tyDiff !== 0)) {
        return null;
      }
      var tx, ty, denominator = a * d - b * c;
      if (font.vertical) {
        tx = -tyDiff * c / denominator;
        ty = tyDiff * a / denominator;
      } else {
        tx = txDiff * d / denominator;
        ty = -txDiff * b / denominator;
      }
      return { width: tx, height: ty, value: (font.vertical ? ty : tx), };
    },
    calcRenderMatrix: function TextState_calcRendeMatrix(ctm) {
      // 9.4.4 Text Space Details
      var tsm = [this.fontSize * this.textHScale, 0,
                0, this.fontSize,
                0, this.textRise];
      return Util.transform(ctm, Util.transform(this.textMatrix, tsm));
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
})();

var EvalState = (function EvalStateClosure() {
  function EvalState() {
    this.ctm = new Float32Array(IDENTITY_MATRIX);
    this.font = null;
    this.textRenderingMode = TextRenderingMode.FILL;
    this.fillColorSpace = ColorSpace.singletons.gray;
    this.strokeColorSpace = ColorSpace.singletons.gray;
  }
  EvalState.prototype = {
    clone: function CanvasExtraState_clone() {
      return Object.create(this);
    },
  };
  return EvalState;
})();

var EvaluatorPreprocessor = (function EvaluatorPreprocessorClosure() {
  // Specifies properties for each command
  //
  // If variableArgs === true: [0, `numArgs`] expected
  // If variableArgs === false: exactly `numArgs` expected
  var getOPMap = getLookupTableFactory(function (t) {
    // Graphic state
    t['w'] = { id: OPS.setLineWidth, numArgs: 1, variableArgs: false };
    t['J'] = { id: OPS.setLineCap, numArgs: 1, variableArgs: false };
    t['j'] = { id: OPS.setLineJoin, numArgs: 1, variableArgs: false };
    t['M'] = { id: OPS.setMiterLimit, numArgs: 1, variableArgs: false };
    t['d'] = { id: OPS.setDash, numArgs: 2, variableArgs: false };
    t['ri'] = { id: OPS.setRenderingIntent, numArgs: 1, variableArgs: false };
    t['i'] = { id: OPS.setFlatness, numArgs: 1, variableArgs: false };
    t['gs'] = { id: OPS.setGState, numArgs: 1, variableArgs: false };
    t['q'] = { id: OPS.save, numArgs: 0, variableArgs: false };
    t['Q'] = { id: OPS.restore, numArgs: 0, variableArgs: false };
    t['cm'] = { id: OPS.transform, numArgs: 6, variableArgs: false };

    // Path
    t['m'] = { id: OPS.moveTo, numArgs: 2, variableArgs: false };
    t['l'] = { id: OPS.lineTo, numArgs: 2, variableArgs: false };
    t['c'] = { id: OPS.curveTo, numArgs: 6, variableArgs: false };
    t['v'] = { id: OPS.curveTo2, numArgs: 4, variableArgs: false };
    t['y'] = { id: OPS.curveTo3, numArgs: 4, variableArgs: false };
    t['h'] = { id: OPS.closePath, numArgs: 0, variableArgs: false };
    t['re'] = { id: OPS.rectangle, numArgs: 4, variableArgs: false };
    t['S'] = { id: OPS.stroke, numArgs: 0, variableArgs: false };
    t['s'] = { id: OPS.closeStroke, numArgs: 0, variableArgs: false };
    t['f'] = { id: OPS.fill, numArgs: 0, variableArgs: false };
    t['F'] = { id: OPS.fill, numArgs: 0, variableArgs: false };
    t['f*'] = { id: OPS.eoFill, numArgs: 0, variableArgs: false };
    t['B'] = { id: OPS.fillStroke, numArgs: 0, variableArgs: false };
    t['B*'] = { id: OPS.eoFillStroke, numArgs: 0, variableArgs: false };
    t['b'] = { id: OPS.closeFillStroke, numArgs: 0, variableArgs: false };
    t['b*'] = { id: OPS.closeEOFillStroke, numArgs: 0, variableArgs: false };
    t['n'] = { id: OPS.endPath, numArgs: 0, variableArgs: false };

    // Clipping
    t['W'] = { id: OPS.clip, numArgs: 0, variableArgs: false };
    t['W*'] = { id: OPS.eoClip, numArgs: 0, variableArgs: false };

    // Text
    t['BT'] = { id: OPS.beginText, numArgs: 0, variableArgs: false };
    t['ET'] = { id: OPS.endText, numArgs: 0, variableArgs: false };
    t['Tc'] = { id: OPS.setCharSpacing, numArgs: 1, variableArgs: false };
    t['Tw'] = { id: OPS.setWordSpacing, numArgs: 1, variableArgs: false };
    t['Tz'] = { id: OPS.setHScale, numArgs: 1, variableArgs: false };
    t['TL'] = { id: OPS.setLeading, numArgs: 1, variableArgs: false };
    t['Tf'] = { id: OPS.setFont, numArgs: 2, variableArgs: false };
    t['Tr'] = { id: OPS.setTextRenderingMode, numArgs: 1, variableArgs: false };
    t['Ts'] = { id: OPS.setTextRise, numArgs: 1, variableArgs: false };
    t['Td'] = { id: OPS.moveText, numArgs: 2, variableArgs: false };
    t['TD'] = { id: OPS.setLeadingMoveText, numArgs: 2, variableArgs: false };
    t['Tm'] = { id: OPS.setTextMatrix, numArgs: 6, variableArgs: false };
    t['T*'] = { id: OPS.nextLine, numArgs: 0, variableArgs: false };
    t['Tj'] = { id: OPS.showText, numArgs: 1, variableArgs: false };
    t['TJ'] = { id: OPS.showSpacedText, numArgs: 1, variableArgs: false };
    t['\''] = { id: OPS.nextLineShowText, numArgs: 1, variableArgs: false };
    t['"'] = { id: OPS.nextLineSetSpacingShowText, numArgs: 3,
               variableArgs: false };

    // Type3 fonts
    t['d0'] = { id: OPS.setCharWidth, numArgs: 2, variableArgs: false };
    t['d1'] = { id: OPS.setCharWidthAndBounds, numArgs: 6,
                variableArgs: false };

    // Color
    t['CS'] = { id: OPS.setStrokeColorSpace, numArgs: 1, variableArgs: false };
    t['cs'] = { id: OPS.setFillColorSpace, numArgs: 1, variableArgs: false };
    t['SC'] = { id: OPS.setStrokeColor, numArgs: 4, variableArgs: true };
    t['SCN'] = { id: OPS.setStrokeColorN, numArgs: 33, variableArgs: true };
    t['sc'] = { id: OPS.setFillColor, numArgs: 4, variableArgs: true };
    t['scn'] = { id: OPS.setFillColorN, numArgs: 33, variableArgs: true };
    t['G'] = { id: OPS.setStrokeGray, numArgs: 1, variableArgs: false };
    t['g'] = { id: OPS.setFillGray, numArgs: 1, variableArgs: false };
    t['RG'] = { id: OPS.setStrokeRGBColor, numArgs: 3, variableArgs: false };
    t['rg'] = { id: OPS.setFillRGBColor, numArgs: 3, variableArgs: false };
    t['K'] = { id: OPS.setStrokeCMYKColor, numArgs: 4, variableArgs: false };
    t['k'] = { id: OPS.setFillCMYKColor, numArgs: 4, variableArgs: false };

    // Shading
    t['sh'] = { id: OPS.shadingFill, numArgs: 1, variableArgs: false };

    // Images
    t['BI'] = { id: OPS.beginInlineImage, numArgs: 0, variableArgs: false };
    t['ID'] = { id: OPS.beginImageData, numArgs: 0, variableArgs: false };
    t['EI'] = { id: OPS.endInlineImage, numArgs: 1, variableArgs: false };

    // XObjects
    t['Do'] = { id: OPS.paintXObject, numArgs: 1, variableArgs: false };
    t['MP'] = { id: OPS.markPoint, numArgs: 1, variableArgs: false };
    t['DP'] = { id: OPS.markPointProps, numArgs: 2, variableArgs: false };
    t['BMC'] = { id: OPS.beginMarkedContent, numArgs: 1, variableArgs: false };
    t['BDC'] = { id: OPS.beginMarkedContentProps, numArgs: 2,
                 variableArgs: false };
    t['EMC'] = { id: OPS.endMarkedContent, numArgs: 0, variableArgs: false };

    // Compatibility
    t['BX'] = { id: OPS.beginCompat, numArgs: 0, variableArgs: false };
    t['EX'] = { id: OPS.endCompat, numArgs: 0, variableArgs: false };

    // (reserved partial commands for the lexer)
    t['BM'] = null;
    t['BD'] = null;
    t['true'] = null;
    t['fa'] = null;
    t['fal'] = null;
    t['fals'] = null;
    t['false'] = null;
    t['nu'] = null;
    t['nul'] = null;
    t['null'] = null;
  });

  function EvaluatorPreprocessor(stream, xref, stateManager) {
    this.opMap = getOPMap();
    // TODO(mduan): pass array of knownCommands rather than this.opMap
    // dictionary
    this.parser = new Parser(new Lexer(stream, this.opMap), false, xref);
    this.stateManager = stateManager;
    this.nonProcessedArgs = [];
  }

  EvaluatorPreprocessor.prototype = {
    get savedStatesDepth() {
      return this.stateManager.stateStack.length;
    },

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
    read: function EvaluatorPreprocessor_read(operation) {
      var args = operation.args;
      while (true) {
        var obj = this.parser.getObj();
        if (isCmd(obj)) {
          var cmd = obj.cmd;
          // Check that the command is valid
          var opSpec = this.opMap[cmd];
          if (!opSpec) {
            warn('Unknown command "' + cmd + '"');
            continue;
          }

          var fn = opSpec.id;
          var numArgs = opSpec.numArgs;
          var argsLength = args !== null ? args.length : 0;

          if (!opSpec.variableArgs) {
            // Postscript commands can be nested, e.g. /F2 /GS2 gs 5.711 Tf
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
              // If we receive too few arguments, it's not possible to execute
              // the command, hence we skip the command.
              warn('Skipping command ' + fn + ': expected ' + numArgs +
                   ' args, but received ' + argsLength + ' args.');
              if (args !== null) {
                args.length = 0;
              }
              continue;
            }
          } else if (argsLength > numArgs) {
            info('Command ' + fn + ': expected [0,' + numArgs +
                 '] args, but received ' + argsLength + ' args.');
          }

          // TODO figure out how to type-check vararg functions
          this.preprocessCommand(fn, args);

          operation.fn = fn;
          operation.args = args;
          return true;
        } else {
          if (isEOF(obj)) {
            return false; // no more commands
          }
          // argument
          if (obj !== null) {
            if (args === null) {
              args = [];
            }
            args.push(obj);
            assert(args.length <= 33, 'Too many arguments');
          }
        }
      }
    },

    preprocessCommand:
        function EvaluatorPreprocessor_preprocessCommand(fn, args) {
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
  };
  return EvaluatorPreprocessor;
})();

var QueueOptimizer = (function QueueOptimizerClosure() {
  function addState(parentState, pattern, fn) {
    var state = parentState;
    for (var i = 0, ii = pattern.length - 1; i < ii; i++) {
      var item = pattern[i];
      state = (state[item] || (state[item] = []));
    }
    state[pattern[pattern.length - 1]] = fn;
  }

  function handlePaintSolidColorImageMask(iFirstSave, count, fnArray,
                                          argsArray) {
    // Handles special case of mainly LaTeX documents which use image masks to
    // draw lines with the current fill style.
    // 'count' groups of (save, transform, paintImageMaskXObject, restore)+
    // have been found at iFirstSave.
    var iFirstPIMXO = iFirstSave + 2;
    for (var i = 0; i < count; i++) {
      var arg = argsArray[iFirstPIMXO + 4 * i];
      var imageMask = arg.length === 1 && arg[0];
      if (imageMask && imageMask.width === 1 && imageMask.height === 1 &&
          (!imageMask.data.length ||
           (imageMask.data.length === 1 && imageMask.data[0] === 0))) {
        fnArray[iFirstPIMXO + 4 * i] = OPS.paintSolidColorImageMask;
        continue;
      }
      break;
    }
    return count - i;
  }

  var InitialState = [];

  // This replaces (save, transform, paintInlineImageXObject, restore)+
  // sequences with one |paintInlineImageXObjectGroup| operation.
  addState(InitialState,
    [OPS.save, OPS.transform, OPS.paintInlineImageXObject, OPS.restore],
    function foundInlineImageGroup(context) {
      var MIN_IMAGES_IN_INLINE_IMAGES_BLOCK = 10;
      var MAX_IMAGES_IN_INLINE_IMAGES_BLOCK = 200;
      var MAX_WIDTH = 1000;
      var IMAGE_PADDING = 1;

      var fnArray = context.fnArray, argsArray = context.argsArray;
      var curr = context.iCurr;
      var iFirstSave = curr - 3;
      var iFirstTransform = curr - 2;
      var iFirstPIIXO = curr - 1;

      // Look for the quartets.
      var i = iFirstSave + 4;
      var ii = fnArray.length;
      while (i + 3 < ii) {
        if (fnArray[i] !== OPS.save ||
            fnArray[i + 1] !== OPS.transform ||
            fnArray[i + 2] !== OPS.paintInlineImageXObject ||
            fnArray[i + 3] !== OPS.restore) {
          break;    // ops don't match
        }
        i += 4;
      }

      // At this point, i is the index of the first op past the last valid
      // quartet.
      var count = Math.min((i - iFirstSave) / 4,
                           MAX_IMAGES_IN_INLINE_IMAGES_BLOCK);
      if (count < MIN_IMAGES_IN_INLINE_IMAGES_BLOCK) {
        return i;
      }

      // assuming that heights of those image is too small (~1 pixel)
      // packing as much as possible by lines
      var maxX = 0;
      var map = [], maxLineHeight = 0;
      var currentX = IMAGE_PADDING, currentY = IMAGE_PADDING;
      var q;
      for (q = 0; q < count; q++) {
        var transform = argsArray[iFirstTransform + (q << 2)];
        var img = argsArray[iFirstPIIXO + (q << 2)][0];
        if (currentX + img.width > MAX_WIDTH) {
          // starting new line
          maxX = Math.max(maxX, currentX);
          currentY += maxLineHeight + 2 * IMAGE_PADDING;
          currentX = 0;
          maxLineHeight = 0;
        }
        map.push({
          transform: transform,
          x: currentX, y: currentY,
          w: img.width, h: img.height
        });
        currentX += img.width + 2 * IMAGE_PADDING;
        maxLineHeight = Math.max(maxLineHeight, img.height);
      }
      var imgWidth = Math.max(maxX, currentX) + IMAGE_PADDING;
      var imgHeight = currentY + maxLineHeight + IMAGE_PADDING;
      var imgData = new Uint8Array(imgWidth * imgHeight * 4);
      var imgRowSize = imgWidth << 2;
      for (q = 0; q < count; q++) {
        var data = argsArray[iFirstPIIXO + (q << 2)][0].data;
        // Copy image by lines and extends pixels into padding.
        var rowSize = map[q].w << 2;
        var dataOffset = 0;
        var offset = (map[q].x + map[q].y * imgWidth) << 2;
        imgData.set(data.subarray(0, rowSize), offset - imgRowSize);
        for (var k = 0, kk = map[q].h; k < kk; k++) {
          imgData.set(data.subarray(dataOffset, dataOffset + rowSize), offset);
          dataOffset += rowSize;
          offset += imgRowSize;
        }
        imgData.set(data.subarray(dataOffset - rowSize, dataOffset), offset);
        while (offset >= 0) {
          data[offset - 4] = data[offset];
          data[offset - 3] = data[offset + 1];
          data[offset - 2] = data[offset + 2];
          data[offset - 1] = data[offset + 3];
          data[offset + rowSize] = data[offset + rowSize - 4];
          data[offset + rowSize + 1] = data[offset + rowSize - 3];
          data[offset + rowSize + 2] = data[offset + rowSize - 2];
          data[offset + rowSize + 3] = data[offset + rowSize - 1];
          offset -= imgRowSize;
        }
      }

      // Replace queue items.
      fnArray.splice(iFirstSave, count * 4, OPS.paintInlineImageXObjectGroup);
      argsArray.splice(iFirstSave, count * 4,
        [{ width: imgWidth, height: imgHeight, kind: ImageKind.RGBA_32BPP,
           data: imgData }, map]);

      return iFirstSave + 1;
    });

  // This replaces (save, transform, paintImageMaskXObject, restore)+
  // sequences with one |paintImageMaskXObjectGroup| or one
  // |paintImageMaskXObjectRepeat| operation.
  addState(InitialState,
    [OPS.save, OPS.transform, OPS.paintImageMaskXObject, OPS.restore],
    function foundImageMaskGroup(context) {
      var MIN_IMAGES_IN_MASKS_BLOCK = 10;
      var MAX_IMAGES_IN_MASKS_BLOCK = 100;
      var MAX_SAME_IMAGES_IN_MASKS_BLOCK = 1000;

      var fnArray = context.fnArray, argsArray = context.argsArray;
      var curr = context.iCurr;
      var iFirstSave = curr - 3;
      var iFirstTransform = curr - 2;
      var iFirstPIMXO = curr - 1;

      // Look for the quartets.
      var i = iFirstSave + 4;
      var ii = fnArray.length;
      while (i + 3 < ii) {
        if (fnArray[i] !== OPS.save ||
            fnArray[i + 1] !== OPS.transform ||
            fnArray[i + 2] !== OPS.paintImageMaskXObject ||
            fnArray[i + 3] !== OPS.restore) {
          break;    // ops don't match
        }
        i += 4;
      }

      // At this point, i is the index of the first op past the last valid
      // quartet.
      var count = (i - iFirstSave) / 4;
      count = handlePaintSolidColorImageMask(iFirstSave, count, fnArray,
                                             argsArray);
      if (count < MIN_IMAGES_IN_MASKS_BLOCK) {
        return i;
      }

      var q;
      var isSameImage = false;
      var iTransform, transformArgs;
      var firstPIMXOArg0 = argsArray[iFirstPIMXO][0];
      if (argsArray[iFirstTransform][1] === 0 &&
          argsArray[iFirstTransform][2] === 0) {
        isSameImage = true;
        var firstTransformArg0 = argsArray[iFirstTransform][0];
        var firstTransformArg3 = argsArray[iFirstTransform][3];
        iTransform = iFirstTransform + 4;
        var iPIMXO = iFirstPIMXO + 4;
        for (q = 1; q < count; q++, iTransform += 4, iPIMXO += 4) {
          transformArgs = argsArray[iTransform];
          if (argsArray[iPIMXO][0] !== firstPIMXOArg0 ||
              transformArgs[0] !== firstTransformArg0 ||
              transformArgs[1] !== 0 ||
              transformArgs[2] !== 0 ||
              transformArgs[3] !== firstTransformArg3) {
            if (q < MIN_IMAGES_IN_MASKS_BLOCK) {
              isSameImage = false;
            } else {
              count = q;
            }
            break; // different image or transform
          }
        }
      }

      if (isSameImage) {
        count = Math.min(count, MAX_SAME_IMAGES_IN_MASKS_BLOCK);
        var positions = new Float32Array(count * 2);
        iTransform = iFirstTransform;
        for (q = 0; q < count; q++, iTransform += 4) {
          transformArgs = argsArray[iTransform];
          positions[(q << 1)] = transformArgs[4];
          positions[(q << 1) + 1] = transformArgs[5];
        }

        // Replace queue items.
        fnArray.splice(iFirstSave, count * 4, OPS.paintImageMaskXObjectRepeat);
        argsArray.splice(iFirstSave, count * 4,
          [firstPIMXOArg0, firstTransformArg0, firstTransformArg3, positions]);
      } else {
        count = Math.min(count, MAX_IMAGES_IN_MASKS_BLOCK);
        var images = [];
        for (q = 0; q < count; q++) {
          transformArgs = argsArray[iFirstTransform + (q << 2)];
          var maskParams = argsArray[iFirstPIMXO + (q << 2)][0];
          images.push({ data: maskParams.data, width: maskParams.width,
                        height: maskParams.height,
                        transform: transformArgs });
        }

        // Replace queue items.
        fnArray.splice(iFirstSave, count * 4, OPS.paintImageMaskXObjectGroup);
        argsArray.splice(iFirstSave, count * 4, [images]);
      }

      return iFirstSave + 1;
    });

  // This replaces (save, transform, paintImageXObject, restore)+ sequences
  // with one paintImageXObjectRepeat operation, if the |transform| and
  // |paintImageXObjectRepeat| ops are appropriate.
  addState(InitialState,
    [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore],
    function (context) {
      var MIN_IMAGES_IN_BLOCK = 3;
      var MAX_IMAGES_IN_BLOCK = 1000;

      var fnArray = context.fnArray, argsArray = context.argsArray;
      var curr = context.iCurr;
      var iFirstSave = curr - 3;
      var iFirstTransform = curr - 2;
      var iFirstPIXO = curr - 1;
      var iFirstRestore = curr;

      if (argsArray[iFirstTransform][1] !== 0 ||
          argsArray[iFirstTransform][2] !== 0) {
        return iFirstRestore + 1;   // transform has the wrong form
      }

      // Look for the quartets.
      var firstPIXOArg0 = argsArray[iFirstPIXO][0];
      var firstTransformArg0 = argsArray[iFirstTransform][0];
      var firstTransformArg3 = argsArray[iFirstTransform][3];
      var i = iFirstSave + 4;
      var ii = fnArray.length;
      while (i + 3 < ii) {
        if (fnArray[i] !== OPS.save ||
            fnArray[i + 1] !== OPS.transform ||
            fnArray[i + 2] !== OPS.paintImageXObject ||
            fnArray[i + 3] !== OPS.restore) {
          break;    // ops don't match
        }
        if (argsArray[i + 1][0] !== firstTransformArg0 ||
            argsArray[i + 1][1] !== 0 ||
            argsArray[i + 1][2] !== 0 ||
            argsArray[i + 1][3] !== firstTransformArg3) {
          break;    // transforms don't match
        }
        if (argsArray[i + 2][0] !== firstPIXOArg0) {
          break;    // images don't match
        }
        i += 4;
      }

      // At this point, i is the index of the first op past the last valid
      // quartet.
      var count = Math.min((i - iFirstSave) / 4, MAX_IMAGES_IN_BLOCK);
      if (count < MIN_IMAGES_IN_BLOCK) {
        return i;
      }

      // Extract the (x,y) positions from all of the matching transforms.
      var positions = new Float32Array(count * 2);
      var iTransform = iFirstTransform;
      for (var q = 0; q < count; q++, iTransform += 4) {
        var transformArgs = argsArray[iTransform];
        positions[(q << 1)] = transformArgs[4];
        positions[(q << 1) + 1] = transformArgs[5];
      }

      // Replace queue items.
      var args = [firstPIXOArg0, firstTransformArg0, firstTransformArg3,
                  positions];
      fnArray.splice(iFirstSave, count * 4, OPS.paintImageXObjectRepeat);
      argsArray.splice(iFirstSave, count * 4, args);

      return iFirstSave + 1;
    });

  // This replaces (beginText, setFont, setTextMatrix, showText, endText)+
  // sequences with (beginText, setFont, (setTextMatrix, showText)+, endText)+
  // sequences, if the font for each one is the same.
  addState(InitialState,
    [OPS.beginText, OPS.setFont, OPS.setTextMatrix, OPS.showText, OPS.endText],
    function (context) {
      var MIN_CHARS_IN_BLOCK = 3;
      var MAX_CHARS_IN_BLOCK = 1000;

      var fnArray = context.fnArray, argsArray = context.argsArray;
      var curr = context.iCurr;
      var iFirstBeginText = curr - 4;
      var iFirstSetFont = curr - 3;
      var iFirstSetTextMatrix = curr - 2;
      var iFirstShowText = curr - 1;
      var iFirstEndText = curr;

      // Look for the quintets.
      var firstSetFontArg0 = argsArray[iFirstSetFont][0];
      var firstSetFontArg1 = argsArray[iFirstSetFont][1];
      var i = iFirstBeginText + 5;
      var ii = fnArray.length;
      while (i + 4 < ii) {
        if (fnArray[i] !== OPS.beginText ||
            fnArray[i + 1] !== OPS.setFont ||
            fnArray[i + 2] !== OPS.setTextMatrix ||
            fnArray[i + 3] !== OPS.showText ||
            fnArray[i + 4] !== OPS.endText) {
          break;    // ops don't match
        }
        if (argsArray[i + 1][0] !== firstSetFontArg0 ||
            argsArray[i + 1][1] !== firstSetFontArg1) {
          break;    // fonts don't match
        }
        i += 5;
      }

      // At this point, i is the index of the first op past the last valid
      // quintet.
      var count = Math.min(((i - iFirstBeginText) / 5), MAX_CHARS_IN_BLOCK);
      if (count < MIN_CHARS_IN_BLOCK) {
        return i;
      }

      // If the preceding quintet is (<something>, setFont, setTextMatrix,
      // showText, endText), include that as well. (E.g. <something> might be
      // |dependency|.)
      var iFirst = iFirstBeginText;
      if (iFirstBeginText >= 4 &&
          fnArray[iFirstBeginText - 4] === fnArray[iFirstSetFont] &&
          fnArray[iFirstBeginText - 3] === fnArray[iFirstSetTextMatrix] &&
          fnArray[iFirstBeginText - 2] === fnArray[iFirstShowText] &&
          fnArray[iFirstBeginText - 1] === fnArray[iFirstEndText] &&
          argsArray[iFirstBeginText - 4][0] === firstSetFontArg0 &&
          argsArray[iFirstBeginText - 4][1] === firstSetFontArg1) {
        count++;
        iFirst -= 5;
      }

      // Remove (endText, beginText, setFont) trios.
      var iEndText = iFirst + 4;
      for (var q = 1; q < count; q++) {
        fnArray.splice(iEndText, 3);
        argsArray.splice(iEndText, 3);
        iEndText += 2;
      }

      return iEndText + 1;
    });

  function QueueOptimizer() {}

  QueueOptimizer.prototype = {
    optimize: function QueueOptimizer_optimize(queue) {
      var fnArray = queue.fnArray, argsArray = queue.argsArray;
      var context = {
        iCurr: 0,
        fnArray: fnArray,
        argsArray: argsArray
      };
      var state;
      var i = 0, ii = fnArray.length;
      while (i < ii) {
        state = (state || InitialState)[fnArray[i]];
        if (typeof state === 'function') { // we found some handler
          context.iCurr = i;
          // state() returns the index of the first non-matching op (if we
          // didn't match) or the first op past the modified ops (if we did
          // match and replace).
          i = state(context);
          state = undefined;    // reset the state machine
          ii = context.fnArray.length;
        } else {
          i++;
        }
      }
    }
  };
  return QueueOptimizer;
})();

exports.OperatorList = OperatorList;
exports.PartialEvaluator = PartialEvaluator;
}));
