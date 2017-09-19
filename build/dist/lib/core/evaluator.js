/* Copyright 2017 Mozilla Foundation
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

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PartialEvaluator = exports.OperatorList = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _util = require('../shared/util');

var _cmap = require('./cmap');

var _stream = require('./stream');

var _primitives = require('./primitives');

var _fonts = require('./fonts');

var _encodings = require('./encodings');

var _unicode = require('./unicode');

var _standard_fonts = require('./standard_fonts');

var _pattern = require('./pattern');

var _function = require('./function');

var _parser = require('./parser');

var _bidi = require('./bidi');

var _colorspace = require('./colorspace');

var _glyphlist = require('./glyphlist');

var _metrics = require('./metrics');

var _murmurhash = require('./murmurhash3');

var _image = require('./image');

var PartialEvaluator = function PartialEvaluatorClosure() {
  var DefaultPartialEvaluatorOptions = {
    forceDataSchema: false,
    maxImageSize: -1,
    disableFontFace: false,
    nativeImageDecoderSupport: _util.NativeImageDecoding.DECODE,
    ignoreErrors: false
  };
  function NativeImageDecoder(xref, resources, handler, forceDataSchema) {
    this.xref = xref;
    this.resources = resources;
    this.handler = handler;
    this.forceDataSchema = forceDataSchema;
  }
  NativeImageDecoder.prototype = {
    canDecode: function canDecode(image) {
      return image instanceof _stream.JpegStream && NativeImageDecoder.isDecodable(image, this.xref, this.resources);
    },
    decode: function decode(image) {
      var dict = image.dict;
      var colorSpace = dict.get('ColorSpace', 'CS');
      colorSpace = _colorspace.ColorSpace.parse(colorSpace, this.xref, this.resources);
      var numComps = colorSpace.numComps;
      var decodePromise = this.handler.sendWithPromise('JpegDecode', [image.getIR(this.forceDataSchema), numComps]);
      return decodePromise.then(function (message) {
        var data = message.data;
        return new _stream.Stream(data, 0, data.length, image.dict);
      });
    }
  };
  NativeImageDecoder.isSupported = function NativeImageDecoder_isSupported(image, xref, res) {
    var dict = image.dict;
    if (dict.has('DecodeParms') || dict.has('DP')) {
      return false;
    }
    var cs = _colorspace.ColorSpace.parse(dict.get('ColorSpace', 'CS'), xref, res);
    return (cs.name === 'DeviceGray' || cs.name === 'DeviceRGB') && cs.isDefaultDecode(dict.getArray('Decode', 'D'));
  };
  NativeImageDecoder.isDecodable = function NativeImageDecoder_isDecodable(image, xref, res) {
    var dict = image.dict;
    if (dict.has('DecodeParms') || dict.has('DP')) {
      return false;
    }
    var cs = _colorspace.ColorSpace.parse(dict.get('ColorSpace', 'CS'), xref, res);
    return (cs.numComps === 1 || cs.numComps === 3) && cs.isDefaultDecode(dict.getArray('Decode', 'D'));
  };
  function PartialEvaluator(_ref) {
    var _this = this;

    var pdfManager = _ref.pdfManager,
        xref = _ref.xref,
        handler = _ref.handler,
        pageIndex = _ref.pageIndex,
        idFactory = _ref.idFactory,
        fontCache = _ref.fontCache,
        builtInCMapCache = _ref.builtInCMapCache,
        _ref$options = _ref.options,
        options = _ref$options === undefined ? null : _ref$options;

    this.pdfManager = pdfManager;
    this.xref = xref;
    this.handler = handler;
    this.pageIndex = pageIndex;
    this.idFactory = idFactory;
    this.fontCache = fontCache;
    this.builtInCMapCache = builtInCMapCache;
    this.options = options || DefaultPartialEvaluatorOptions;
    this.fetchBuiltInCMap = function (name) {
      var cachedCMap = _this.builtInCMapCache[name];
      if (cachedCMap) {
        return Promise.resolve(cachedCMap);
      }
      return _this.handler.sendWithPromise('FetchBuiltInCMap', { name: name }).then(function (data) {
        if (data.compressionType !== _util.CMapCompressionType.NONE) {
          _this.builtInCMapCache[name] = data;
        }
        return data;
      });
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
  function normalizeBlendMode(value) {
    if (!(0, _primitives.isName)(value)) {
      return 'source-over';
    }
    switch (value.name) {
      case 'Normal':
      case 'Compatible':
        return 'source-over';
      case 'Multiply':
        return 'multiply';
      case 'Screen':
        return 'screen';
      case 'Overlay':
        return 'overlay';
      case 'Darken':
        return 'darken';
      case 'Lighten':
        return 'lighten';
      case 'ColorDodge':
        return 'color-dodge';
      case 'ColorBurn':
        return 'color-burn';
      case 'HardLight':
        return 'hard-light';
      case 'SoftLight':
        return 'soft-light';
      case 'Difference':
        return 'difference';
      case 'Exclusion':
        return 'exclusion';
      case 'Hue':
        return 'hue';
      case 'Saturation':
        return 'saturation';
      case 'Color':
        return 'color';
      case 'Luminosity':
        return 'luminosity';
    }
    (0, _util.warn)('Unsupported blend mode: ' + value.name);
    return 'source-over';
  }
  var deferred = Promise.resolve();
  var TILING_PATTERN = 1,
      SHADING_PATTERN = 2;
  PartialEvaluator.prototype = {
    clone: function clone() {
      var newOptions = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : DefaultPartialEvaluatorOptions;

      var newEvaluator = Object.create(this);
      newEvaluator.options = newOptions;
      return newEvaluator;
    },

    hasBlendModes: function PartialEvaluator_hasBlendModes(resources) {
      if (!(0, _primitives.isDict)(resources)) {
        return false;
      }
      var processed = Object.create(null);
      if (resources.objId) {
        processed[resources.objId] = true;
      }
      var nodes = [resources],
          xref = this.xref;
      while (nodes.length) {
        var key, i, ii;
        var node = nodes.shift();
        var graphicStates = node.get('ExtGState');
        if ((0, _primitives.isDict)(graphicStates)) {
          var graphicStatesKeys = graphicStates.getKeys();
          for (i = 0, ii = graphicStatesKeys.length; i < ii; i++) {
            key = graphicStatesKeys[i];
            var graphicState = graphicStates.get(key);
            var bm = graphicState.get('BM');
            if ((0, _primitives.isName)(bm) && bm.name !== 'Normal') {
              return true;
            }
          }
        }
        var xObjects = node.get('XObject');
        if (!(0, _primitives.isDict)(xObjects)) {
          continue;
        }
        var xObjectsKeys = xObjects.getKeys();
        for (i = 0, ii = xObjectsKeys.length; i < ii; i++) {
          key = xObjectsKeys[i];
          var xObject = xObjects.getRaw(key);
          if ((0, _primitives.isRef)(xObject)) {
            if (processed[xObject.toString()]) {
              continue;
            }
            xObject = xref.fetch(xObject);
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
          var xResources = xObject.dict.get('Resources');
          if ((0, _primitives.isDict)(xResources) && (!xResources.objId || !processed[xResources.objId])) {
            nodes.push(xResources);
            if (xResources.objId) {
              processed[xResources.objId] = true;
            }
          }
        }
      }
      return false;
    },
    buildFormXObject: function PartialEvaluator_buildFormXObject(resources, xobj, smask, operatorList, task, initialState) {
      var dict = xobj.dict;
      var matrix = dict.getArray('Matrix');
      var bbox = dict.getArray('BBox');
      var group = dict.get('Group');
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
        if ((0, _primitives.isName)(groupSubtype, 'Transparency')) {
          groupOptions.isolated = group.get('I') || false;
          groupOptions.knockout = group.get('K') || false;
          colorSpace = group.has('CS') ? _colorspace.ColorSpace.parse(group.get('CS'), this.xref, resources) : null;
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
        task: task,
        resources: dict.get('Resources') || resources,
        operatorList: operatorList,
        initialState: initialState
      }).then(function () {
        operatorList.addOp(_util.OPS.paintFormXObjectEnd, []);
        if (group) {
          operatorList.addOp(_util.OPS.endGroup, [groupOptions]);
        }
      });
    },
    buildPaintImageXObject: function PartialEvaluator_buildPaintImageXObject(resources, image, inline, operatorList, cacheKey, imageCache) {
      var _this2 = this;

      var dict = image.dict;
      var w = dict.get('Width', 'W');
      var h = dict.get('Height', 'H');
      if (!(w && (0, _util.isNum)(w)) || !(h && (0, _util.isNum)(h))) {
        (0, _util.warn)('Image dimensions are missing, or not numbers.');
        return;
      }
      var maxImageSize = this.options.maxImageSize;
      if (maxImageSize !== -1 && w * h > maxImageSize) {
        (0, _util.warn)('Image exceeded maximum allowed size and was removed.');
        return;
      }
      var imageMask = dict.get('ImageMask', 'IM') || false;
      var imgData, args;
      if (imageMask) {
        var width = dict.get('Width', 'W');
        var height = dict.get('Height', 'H');
        var bitStrideLength = width + 7 >> 3;
        var imgArray = image.getBytes(bitStrideLength * height);
        var decode = dict.getArray('Decode', 'D');
        var inverseDecode = !!decode && decode[0] > 0;
        imgData = _image.PDFImage.createMask(imgArray, width, height, image instanceof _stream.DecodeStream, inverseDecode);
        imgData.cached = true;
        args = [imgData];
        operatorList.addOp(_util.OPS.paintImageMaskXObject, args);
        if (cacheKey) {
          imageCache[cacheKey] = {
            fn: _util.OPS.paintImageMaskXObject,
            args: args
          };
        }
        return;
      }
      var softMask = dict.get('SMask', 'SM') || false;
      var mask = dict.get('Mask') || false;
      var SMALL_IMAGE_DIMENSIONS = 200;
      if (inline && !softMask && !mask && !(image instanceof _stream.JpegStream) && w + h < SMALL_IMAGE_DIMENSIONS) {
        var imageObj = new _image.PDFImage(this.xref, resources, image, inline, null, null);
        imgData = imageObj.createImageData(true);
        operatorList.addOp(_util.OPS.paintInlineImageXObject, [imgData]);
        return;
      }
      var nativeImageDecoderSupport = this.options.nativeImageDecoderSupport;
      var objId = 'img_' + this.idFactory.createObjId();
      operatorList.addDependency(objId);
      args = [objId, w, h];
      if (nativeImageDecoderSupport !== _util.NativeImageDecoding.NONE && !softMask && !mask && image instanceof _stream.JpegStream && NativeImageDecoder.isSupported(image, this.xref, resources)) {
        operatorList.addOp(_util.OPS.paintJpegXObject, args);
        this.handler.send('obj', [objId, this.pageIndex, 'JpegStream', image.getIR(this.options.forceDataSchema)]);
        if (cacheKey) {
          imageCache[cacheKey] = {
            fn: _util.OPS.paintJpegXObject,
            args: args
          };
        }
        return;
      }
      var nativeImageDecoder = null;
      if (nativeImageDecoderSupport === _util.NativeImageDecoding.DECODE && (image instanceof _stream.JpegStream || mask instanceof _stream.JpegStream || softMask instanceof _stream.JpegStream)) {
        nativeImageDecoder = new NativeImageDecoder(this.xref, resources, this.handler, this.options.forceDataSchema);
      }
      _image.PDFImage.buildImage(this.handler, this.xref, resources, image, inline, nativeImageDecoder).then(function (imageObj) {
        var imgData = imageObj.createImageData(false);
        _this2.handler.send('obj', [objId, _this2.pageIndex, 'Image', imgData], [imgData.data.buffer]);
      }).catch(function (reason) {
        (0, _util.warn)('Unable to decode image: ' + reason);
        _this2.handler.send('obj', [objId, _this2.pageIndex, 'Image', null]);
      });
      operatorList.addOp(_util.OPS.paintImageXObject, args);
      if (cacheKey) {
        imageCache[cacheKey] = {
          fn: _util.OPS.paintImageXObject,
          args: args
        };
      }
    },
    handleSMask: function PartialEvaluator_handleSmask(smask, resources, operatorList, task, stateManager) {
      var smaskContent = smask.get('G');
      var smaskOptions = {
        subtype: smask.get('S').name,
        backdrop: smask.get('BC')
      };
      var transferObj = smask.get('TR');
      if ((0, _function.isPDFFunction)(transferObj)) {
        var transferFn = _function.PDFFunction.parse(this.xref, transferObj);
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
    handleTilingType: function handleTilingType(fn, args, resources, pattern, patternDict, operatorList, task) {
      var _this3 = this;

      var tilingOpList = new OperatorList();
      var resourcesArray = [patternDict.get('Resources'), resources];
      var patternResources = _primitives.Dict.merge(this.xref, resourcesArray);
      return this.getOperatorList({
        stream: pattern,
        task: task,
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
      }, function (reason) {
        if (_this3.options.ignoreErrors) {
          _this3.handler.send('UnsupportedFeature', { featureId: _util.UNSUPPORTED_FEATURES.unknown });
          (0, _util.warn)('handleTilingType - ignoring pattern: "' + reason + '".');
          return;
        }
        throw reason;
      });
    },

    handleSetFont: function PartialEvaluator_handleSetFont(resources, fontArgs, fontRef, operatorList, task, state) {
      var _this4 = this;

      var fontName;
      if (fontArgs) {
        fontArgs = fontArgs.slice();
        fontName = fontArgs[0].name;
      }
      return this.loadFont(fontName, fontRef, resources).then(function (translated) {
        if (!translated.font.isType3Font) {
          return translated;
        }
        return translated.loadType3Data(_this4, resources, operatorList, task).then(function () {
          return translated;
        }).catch(function (reason) {
          _this4.handler.send('UnsupportedFeature', { featureId: _util.UNSUPPORTED_FEATURES.font });
          return new TranslatedFont('g_font_error', new _fonts.ErrorFont('Type3 font load error: ' + reason), translated.font);
        });
      }).then(function (translated) {
        state.font = translated.font;
        translated.send(_this4.handler);
        return translated.loadedName;
      });
    },
    handleText: function PartialEvaluator_handleText(chars, state) {
      var _this5 = this;

      var font = state.font;
      var glyphs = font.charsToGlyphs(chars);
      var isAddToPathSet = !!(state.textRenderingMode & _util.TextRenderingMode.ADD_TO_PATH_FLAG);
      if (font.data && (isAddToPathSet || this.options.disableFontFace)) {
        var buildPath = function buildPath(fontChar) {
          if (!font.renderer.hasBuiltPath(fontChar)) {
            var path = font.renderer.getPathJs(fontChar);
            _this5.handler.send('commonobj', [font.loadedName + '_path_' + fontChar, 'FontPath', path]);
          }
        };
        for (var i = 0, ii = glyphs.length; i < ii; i++) {
          var glyph = glyphs[i];
          buildPath(glyph.fontChar);
          var accent = glyph.accent;
          if (accent && accent.fontChar) {
            buildPath(accent.fontChar);
          }
        }
      }
      return glyphs;
    },
    setGState: function PartialEvaluator_setGState(resources, gState, operatorList, task, stateManager) {
      var _this6 = this;

      var gStateObj = [];
      var gStateKeys = gState.getKeys();
      var promise = Promise.resolve();

      var _loop = function _loop() {
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
              return _this6.handleSetFont(resources, null, value[0], operatorList, task, stateManager.state).then(function (loadedName) {
                operatorList.addDependency(loadedName);
                gStateObj.push([key, [loadedName, value[1]]]);
              });
            });
            break;
          case 'BM':
            gStateObj.push([key, normalizeBlendMode(value)]);
            break;
          case 'SMask':
            if ((0, _primitives.isName)(value, 'None')) {
              gStateObj.push([key, false]);
              break;
            }
            if ((0, _primitives.isDict)(value)) {
              promise = promise.then(function () {
                return _this6.handleSMask(value, resources, operatorList, task, stateManager);
              });
              gStateObj.push([key, true]);
            } else {
              (0, _util.warn)('Unsupported SMask type');
            }
            break;
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
            (0, _util.info)('graphic state operator ' + key);
            break;
          default:
            (0, _util.info)('Unknown graphic state operator ' + key);
            break;
        }
      };

      for (var i = 0, ii = gStateKeys.length; i < ii; i++) {
        _loop();
      }
      return promise.then(function () {
        if (gStateObj.length > 0) {
          operatorList.addOp(_util.OPS.setGState, [gStateObj]);
        }
      });
    },
    loadFont: function PartialEvaluator_loadFont(fontName, font, resources) {
      var _this7 = this;

      function errorFont() {
        return Promise.resolve(new TranslatedFont('g_font_error', new _fonts.ErrorFont('Font ' + fontName + ' is not available'), font));
      }
      var fontRef,
          xref = this.xref;
      if (font) {
        if (!(0, _primitives.isRef)(font)) {
          throw new Error('The "font" object should be a reference.');
        }
        fontRef = font;
      } else {
        var fontRes = resources.get('Font');
        if (fontRes) {
          fontRef = fontRes.getRaw(fontName);
        } else {
          (0, _util.warn)('fontRes not available');
          return errorFont();
        }
      }
      if (!fontRef) {
        (0, _util.warn)('fontRef not available');
        return errorFont();
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
      var descriptor = preEvaluatedFont.descriptor;
      var fontRefIsRef = (0, _primitives.isRef)(fontRef),
          fontID;
      if (fontRefIsRef) {
        fontID = fontRef.toString();
      }
      if ((0, _primitives.isDict)(descriptor)) {
        if (!descriptor.fontAliases) {
          descriptor.fontAliases = Object.create(null);
        }
        var fontAliases = descriptor.fontAliases;
        var hash = preEvaluatedFont.hash;
        if (fontAliases[hash]) {
          var aliasFontRef = fontAliases[hash].aliasRef;
          if (fontRefIsRef && aliasFontRef && this.fontCache.has(aliasFontRef)) {
            this.fontCache.putAlias(fontRef, aliasFontRef);
            return this.fontCache.get(fontRef);
          }
        } else {
          fontAliases[hash] = { fontID: _fonts.Font.getFontID() };
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
        this.fontCache.put('id_' + fontID, fontCapability.promise);
      }
      (0, _util.assert)(fontID, 'The "fontID" must be defined.');
      font.loadedName = 'g_' + this.pdfManager.docId + '_f' + fontID;
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
      }).catch(function (reason) {
        _this7.handler.send('UnsupportedFeature', { featureId: _util.UNSUPPORTED_FEATURES.font });
        try {
          var descriptor = preEvaluatedFont.descriptor;
          var fontFile3 = descriptor && descriptor.get('FontFile3');
          var subtype = fontFile3 && fontFile3.get('Subtype');
          var fontType = (0, _fonts.getFontType)(preEvaluatedFont.type, subtype && subtype.name);
          var xrefFontStats = xref.stats.fontTypes;
          xrefFontStats[fontType] = true;
        } catch (ex) {}
        fontCapability.resolve(new TranslatedFont(font.loadedName, new _fonts.ErrorFont(reason instanceof Error ? reason.message : reason), font));
      });
      return fontCapability.promise;
    },
    buildPath: function PartialEvaluator_buildPath(operatorList, fn, args) {
      var lastIndex = operatorList.length - 1;
      if (!args) {
        args = [];
      }
      if (lastIndex < 0 || operatorList.fnArray[lastIndex] !== _util.OPS.constructPath) {
        operatorList.addOp(_util.OPS.constructPath, [[fn], args]);
      } else {
        var opArgs = operatorList.argsArray[lastIndex];
        opArgs[0].push(fn);
        Array.prototype.push.apply(opArgs[1], args);
      }
    },
    handleColorN: function PartialEvaluator_handleColorN(operatorList, fn, args, cs, patterns, resources, task) {
      var patternName = args[args.length - 1];
      var pattern;
      if ((0, _primitives.isName)(patternName) && (pattern = patterns.get(patternName.name))) {
        var dict = (0, _primitives.isStream)(pattern) ? pattern.dict : pattern;
        var typeNum = dict.get('PatternType');
        if (typeNum === TILING_PATTERN) {
          var color = cs.base ? cs.base.getRgb(args, 0) : null;
          return this.handleTilingType(fn, color, resources, pattern, dict, operatorList, task);
        } else if (typeNum === SHADING_PATTERN) {
          var shading = dict.get('Shading');
          var matrix = dict.getArray('Matrix');
          pattern = _pattern.Pattern.parseShading(shading, matrix, this.xref, resources, this.handler);
          operatorList.addOp(fn, pattern.getIR());
          return Promise.resolve();
        }
        return Promise.reject(new Error('Unknown PatternType: ' + typeNum));
      }
      operatorList.addOp(fn, args);
      return Promise.resolve();
    },
    getOperatorList: function getOperatorList(_ref2) {
      var _this8 = this;

      var stream = _ref2.stream,
          task = _ref2.task,
          resources = _ref2.resources,
          operatorList = _ref2.operatorList,
          _ref2$initialState = _ref2.initialState,
          initialState = _ref2$initialState === undefined ? null : _ref2$initialState;

      resources = resources || _primitives.Dict.empty;
      initialState = initialState || new EvalState();
      if (!operatorList) {
        throw new Error('getOperatorList: missing "operatorList" parameter');
      }
      var self = this;
      var xref = this.xref;
      var imageCache = Object.create(null);
      var xobjs = resources.get('XObject') || _primitives.Dict.empty;
      var patterns = resources.get('Pattern') || _primitives.Dict.empty;
      var stateManager = new StateManager(initialState);
      var preprocessor = new EvaluatorPreprocessor(stream, xref, stateManager);
      var timeSlotManager = new TimeSlotManager();
      function closePendingRestoreOPS(argument) {
        for (var i = 0, ii = preprocessor.savedStatesDepth; i < ii; i++) {
          operatorList.addOp(_util.OPS.restore, []);
        }
      }
      return new Promise(function promiseBody(resolve, reject) {
        var next = function next(promise) {
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
              if (!name) {
                (0, _util.warn)('XObject must be referred to by name.');
                continue;
              }
              if (imageCache[name] !== undefined) {
                operatorList.addOp(imageCache[name].fn, imageCache[name].args);
                args = null;
                continue;
              }
              var xobj = xobjs.get(name);
              if (xobj) {
                if (!(0, _primitives.isStream)(xobj)) {
                  throw new _util.FormatError('XObject should be a stream');
                }
                var type = xobj.dict.get('Subtype');
                if (!(0, _primitives.isName)(type)) {
                  throw new _util.FormatError('XObject should have a Name subtype');
                }
                if (type.name === 'Form') {
                  stateManager.save();
                  next(self.buildFormXObject(resources, xobj, null, operatorList, task, stateManager.state.clone()).then(function () {
                    stateManager.restore();
                  }));
                  return;
                } else if (type.name === 'Image') {
                  self.buildPaintImageXObject(resources, xobj, false, operatorList, name, imageCache);
                  args = null;
                  continue;
                } else if (type.name === 'PS') {
                  (0, _util.info)('Ignored XObject subtype PS');
                  continue;
                } else {
                  throw new _util.FormatError('Unhandled XObject subtype ' + type.name);
                }
              }
              break;
            case _util.OPS.setFont:
              var fontSize = args[1];
              next(self.handleSetFont(resources, args, null, operatorList, task, stateManager.state).then(function (loadedName) {
                operatorList.addDependency(loadedName);
                operatorList.addOp(_util.OPS.setFont, [loadedName, fontSize]);
              }));
              return;
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
              self.buildPaintImageXObject(resources, args[0], true, operatorList, cacheKey, imageCache);
              args = null;
              continue;
            case _util.OPS.showText:
              args[0] = self.handleText(args[0], stateManager.state);
              break;
            case _util.OPS.showSpacedText:
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
              operatorList.addOp(_util.OPS.nextLine);
              args[0] = self.handleText(args[0], stateManager.state);
              fn = _util.OPS.showText;
              break;
            case _util.OPS.nextLineSetSpacingShowText:
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
              stateManager.state.fillColorSpace = _colorspace.ColorSpace.parse(args[0], xref, resources);
              continue;
            case _util.OPS.setStrokeColorSpace:
              stateManager.state.strokeColorSpace = _colorspace.ColorSpace.parse(args[0], xref, resources);
              continue;
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
              if (cs.name === 'Pattern') {
                next(self.handleColorN(operatorList, _util.OPS.setFillColorN, args, cs, patterns, resources, task));
                return;
              }
              args = cs.getRgb(args, 0);
              fn = _util.OPS.setFillRGBColor;
              break;
            case _util.OPS.setStrokeColorN:
              cs = stateManager.state.strokeColorSpace;
              if (cs.name === 'Pattern') {
                next(self.handleColorN(operatorList, _util.OPS.setStrokeColorN, args, cs, patterns, resources, task));
                return;
              }
              args = cs.getRgb(args, 0);
              fn = _util.OPS.setStrokeRGBColor;
              break;
            case _util.OPS.shadingFill:
              var shadingRes = resources.get('Shading');
              if (!shadingRes) {
                throw new _util.FormatError('No shading resource found');
              }
              var shading = shadingRes.get(args[0].name);
              if (!shading) {
                throw new _util.FormatError('No shading object found');
              }
              var shadingFill = _pattern.Pattern.parseShading(shading, null, xref, resources, self.handler);
              var patternIR = shadingFill.getIR();
              args = [patternIR];
              fn = _util.OPS.shadingFill;
              break;
            case _util.OPS.setGState:
              var dictName = args[0];
              var extGState = resources.get('ExtGState');
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
              self.buildPath(operatorList, fn, args);
              continue;
            case _util.OPS.rectangle:
              self.buildPath(operatorList, fn, args);
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
                  (0, _util.warn)('getOperatorList - ignoring operator: ' + fn);
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
      }).catch(function (reason) {
        if (_this8.options.ignoreErrors) {
          _this8.handler.send('UnsupportedFeature', { featureId: _util.UNSUPPORTED_FEATURES.unknown });
          (0, _util.warn)('getOperatorList - ignoring errors during task: ' + task.name);
          closePendingRestoreOPS();
          return;
        }
        throw reason;
      });
    },
    getTextContent: function getTextContent(_ref3) {
      var _this9 = this;

      var stream = _ref3.stream,
          task = _ref3.task,
          resources = _ref3.resources,
          _ref3$stateManager = _ref3.stateManager,
          stateManager = _ref3$stateManager === undefined ? null : _ref3$stateManager,
          _ref3$normalizeWhites = _ref3.normalizeWhitespace,
          normalizeWhitespace = _ref3$normalizeWhites === undefined ? false : _ref3$normalizeWhites,
          _ref3$combineTextItem = _ref3.combineTextItems,
          combineTextItems = _ref3$combineTextItem === undefined ? false : _ref3$combineTextItem,
          sink = _ref3.sink,
          _ref3$seenStyles = _ref3.seenStyles,
          seenStyles = _ref3$seenStyles === undefined ? Object.create(null) : _ref3$seenStyles;

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
            vertical: font.vertical
          };
        }
        textContentItem.fontName = font.loadedName;
        var tsm = [textState.fontSize * textState.textHScale, 0, 0, textState.fontSize, 0, textState.textRise];
        if (font.isType3Font && textState.fontMatrix !== _util.FONT_IDENTITY_MATRIX && textState.fontSize === 1) {
          var glyphHeight = font.bbox[3] - font.bbox[1];
          if (glyphHeight > 0) {
            glyphHeight = glyphHeight * textState.fontMatrix[3];
            tsm[3] *= glyphHeight;
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
        while (i < ii && (code = str.charCodeAt(i)) >= 0x20 && code <= 0x7F) {
          i++;
        }
        return i < ii ? str.replace(WhitespaceRegexp, ' ') : str;
      }
      function runBidiTransform(textChunk) {
        var str = textChunk.str.join('');
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
        textContentItem.width *= textContentItem.textAdvanceScale;
        textContentItem.height *= textContentItem.textAdvanceScale;
        textContent.items.push(runBidiTransform(textContentItem));
        textContentItem.initialized = false;
        textContentItem.str.length = 0;
      }
      function enqueueChunk() {
        var length = textContent.items.length;
        if (length > 0) {
          sink.enqueue(textContent, length);
          textContent.items = [];
          textContent.styles = Object.create(null);
        }
      }
      var timeSlotManager = new TimeSlotManager();
      return new Promise(function promiseBody(resolve, reject) {
        var next = function next(promise) {
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
          var fontNameArg, fontSizeArg;
          var isSameTextLine;
          var items;
          var offset;
          var j, jj;
          var breakTextRun;
          var name;
          var xobj;
          var type;
          var currentState;
          var xObjStateManager;
          var matrix;
          var dictName;
          var extGState;
          var gState;
          var gStateFont;

          var _ret2 = function () {
            switch (fn | 0) {
              case _util.OPS.setFont:
                fontNameArg = args[0].name;
                fontSizeArg = args[1];

                if (textState.font && fontNameArg === textState.fontName && fontSizeArg === textState.fontSize) {
                  break;
                }
                flushTextContentItem();
                textState.fontName = fontNameArg;
                textState.fontSize = fontSizeArg;
                next(handleSetFont(fontNameArg, null));
                return {
                  v: void 0
                };
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
                isSameTextLine = !textState.font ? false : (textState.font.vertical ? args[0] : args[1]) === 0;

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
                items = args[0];

                for (j = 0, jj = items.length; j < jj; j++) {
                  if (typeof items[j] === 'string') {
                    buildTextContentItem(items[j]);
                  } else if ((0, _util.isNum)(items[j])) {
                    ensureTextContentItem();
                    advance = items[j] * textState.fontSize / 1000;
                    breakTextRun = false;

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
                buildTextContentItem(args[0]);
                break;
              case _util.OPS.nextLineShowText:
                flushTextContentItem();
                textState.carriageReturn();
                buildTextContentItem(args[0]);
                break;
              case _util.OPS.nextLineSetSpacingShowText:
                flushTextContentItem();
                textState.wordSpacing = args[0];
                textState.charSpacing = args[1];
                textState.carriageReturn();
                buildTextContentItem(args[2]);
                break;
              case _util.OPS.paintXObject:
                flushTextContentItem();
                if (!xobjs) {
                  xobjs = resources.get('XObject') || _primitives.Dict.empty;
                }
                name = args[0].name;

                if (name in skipEmptyXObjs) {
                  break;
                }
                xobj = xobjs.get(name);

                if (!xobj) {
                  break;
                }
                if (!(0, _primitives.isStream)(xobj)) {
                  throw new _util.FormatError('XObject should be a stream');
                }
                type = xobj.dict.get('Subtype');

                if (!(0, _primitives.isName)(type)) {
                  throw new _util.FormatError('XObject should have a Name subtype');
                }
                if (type.name !== 'Form') {
                  skipEmptyXObjs[name] = true;
                  break;
                }
                currentState = stateManager.state.clone();
                xObjStateManager = new StateManager(currentState);
                matrix = xobj.dict.getArray('Matrix');

                if (Array.isArray(matrix) && matrix.length === 6) {
                  xObjStateManager.transform(matrix);
                }
                enqueueChunk();
                var sinkWrapper = {
                  enqueueInvoked: false,
                  enqueue: function enqueue(chunk, size) {
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
                next(self.getTextContent({
                  stream: xobj,
                  task: task,
                  resources: xobj.dict.get('Resources') || resources,
                  stateManager: xObjStateManager,
                  normalizeWhitespace: normalizeWhitespace,
                  combineTextItems: combineTextItems,
                  sink: sinkWrapper,
                  seenStyles: seenStyles
                }).then(function () {
                  if (!sinkWrapper.enqueueInvoked) {
                    skipEmptyXObjs[name] = true;
                  }
                }));
                return {
                  v: void 0
                };
              case _util.OPS.setGState:
                flushTextContentItem();
                dictName = args[0];
                extGState = resources.get('ExtGState');

                if (!(0, _primitives.isDict)(extGState) || !(0, _primitives.isName)(dictName)) {
                  break;
                }
                gState = extGState.get(dictName.name);

                if (!(0, _primitives.isDict)(gState)) {
                  break;
                }
                gStateFont = gState.get('Font');

                if (gStateFont) {
                  textState.fontName = null;
                  textState.fontSize = gStateFont[1];
                  next(handleSetFont(null, gStateFont[0]));
                  return {
                    v: void 0
                  };
                }
                break;
            }
          }();

          if ((typeof _ret2 === 'undefined' ? 'undefined' : _typeof(_ret2)) === "object") return _ret2.v;
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
      }).catch(function (reason) {
        if (reason instanceof _util.AbortException) {
          return;
        }
        if (_this9.options.ignoreErrors) {
          (0, _util.warn)('getTextContent - ignoring errors during task: ' + task.name);
          flushTextContentItem();
          enqueueChunk();
          return;
        }
        throw reason;
      });
    },

    extractDataStructures: function PartialEvaluator_extractDataStructures(dict, baseDict, properties) {
      var _this10 = this;

      var xref = this.xref;
      var toUnicode = dict.get('ToUnicode') || baseDict.get('ToUnicode');
      var toUnicodePromise = toUnicode ? this.readToUnicode(toUnicode) : Promise.resolve(undefined);
      if (properties.composite) {
        var cidSystemInfo = dict.get('CIDSystemInfo');
        if ((0, _primitives.isDict)(cidSystemInfo)) {
          properties.cidSystemInfo = {
            registry: cidSystemInfo.get('Registry'),
            ordering: cidSystemInfo.get('Ordering'),
            supplement: cidSystemInfo.get('Supplement')
          };
        }
        var cidToGidMap = dict.get('CIDToGIDMap');
        if ((0, _primitives.isStream)(cidToGidMap)) {
          properties.cidToGidMap = this.readCidToGidMap(cidToGidMap);
        }
      }
      var differences = [];
      var baseEncodingName = null;
      var encoding;
      if (dict.has('Encoding')) {
        encoding = dict.get('Encoding');
        if ((0, _primitives.isDict)(encoding)) {
          baseEncodingName = encoding.get('BaseEncoding');
          baseEncodingName = (0, _primitives.isName)(baseEncodingName) ? baseEncodingName.name : null;
          if (encoding.has('Differences')) {
            var diffEncoding = encoding.get('Differences');
            var index = 0;
            for (var j = 0, jj = diffEncoding.length; j < jj; j++) {
              var data = xref.fetchIfRef(diffEncoding[j]);
              if ((0, _util.isNum)(data)) {
                index = data;
              } else if ((0, _primitives.isName)(data)) {
                differences[index++] = data.name;
              } else {
                throw new _util.FormatError('Invalid entry in \'Differences\' array: ' + data);
              }
            }
          }
        } else if ((0, _primitives.isName)(encoding)) {
          baseEncodingName = encoding.name;
        } else {
          throw new _util.FormatError('Encoding is not a Name nor a Dict');
        }
        if (baseEncodingName !== 'MacRomanEncoding' && baseEncodingName !== 'MacExpertEncoding' && baseEncodingName !== 'WinAnsiEncoding') {
          baseEncodingName = null;
        }
      }
      if (baseEncodingName) {
        properties.defaultEncoding = (0, _encodings.getEncoding)(baseEncodingName).slice();
      } else {
        var isSymbolicFont = !!(properties.flags & _fonts.FontFlags.Symbolic);
        var isNonsymbolicFont = !!(properties.flags & _fonts.FontFlags.Nonsymbolic);
        encoding = _encodings.StandardEncoding;
        if (properties.type === 'TrueType' && !isNonsymbolicFont) {
          encoding = _encodings.WinAnsiEncoding;
        }
        if (isSymbolicFont) {
          encoding = _encodings.MacRomanEncoding;
          if (!properties.file) {
            if (/Symbol/i.test(properties.name)) {
              encoding = _encodings.SymbolSetEncoding;
            } else if (/Dingbats/i.test(properties.name)) {
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
      return toUnicodePromise.then(function (toUnicode) {
        properties.toUnicode = toUnicode;
        return _this10.buildToUnicode(properties);
      }).then(function (toUnicode) {
        properties.toUnicode = toUnicode;
        return properties;
      });
    },
    buildToUnicode: function PartialEvaluator_buildToUnicode(properties) {
      properties.hasIncludedToUnicodeMap = !!properties.toUnicode && properties.toUnicode.length > 0;
      if (properties.hasIncludedToUnicodeMap) {
        return Promise.resolve(properties.toUnicode);
      }
      var toUnicode, charcode, glyphName;
      if (!properties.composite) {
        toUnicode = [];
        var encoding = properties.defaultEncoding.slice();
        var baseEncodingName = properties.baseEncodingName;
        var differences = properties.differences;
        for (charcode in differences) {
          glyphName = differences[charcode];
          if (glyphName === '.notdef') {
            continue;
          }
          encoding[charcode] = glyphName;
        }
        var glyphsUnicodeMap = (0, _glyphlist.getGlyphsUnicode)();
        for (charcode in encoding) {
          glyphName = encoding[charcode];
          if (glyphName === '') {
            continue;
          } else if (glyphsUnicodeMap[glyphName] === undefined) {
            var code = 0;
            switch (glyphName[0]) {
              case 'G':
                if (glyphName.length === 3) {
                  code = parseInt(glyphName.substr(1), 16);
                }
                break;
              case 'g':
                if (glyphName.length === 5) {
                  code = parseInt(glyphName.substr(1), 16);
                }
                break;
              case 'C':
              case 'c':
                if (glyphName.length >= 3) {
                  code = +glyphName.substr(1);
                }
                break;
              default:
                var unicode = (0, _unicode.getUnicodeForGlyph)(glyphName, glyphsUnicodeMap);
                if (unicode !== -1) {
                  code = unicode;
                }
            }
            if (code) {
              if (baseEncodingName && code === +charcode) {
                var baseEncoding = (0, _encodings.getEncoding)(baseEncodingName);
                if (baseEncoding && (glyphName = baseEncoding[charcode])) {
                  toUnicode[charcode] = String.fromCharCode(glyphsUnicodeMap[glyphName]);
                  continue;
                }
              }
              toUnicode[charcode] = String.fromCharCode(code);
            }
            continue;
          }
          toUnicode[charcode] = String.fromCharCode(glyphsUnicodeMap[glyphName]);
        }
        return Promise.resolve(new _fonts.ToUnicodeMap(toUnicode));
      }
      if (properties.composite && (properties.cMap.builtInCMap && !(properties.cMap instanceof _cmap.IdentityCMap) || properties.cidSystemInfo.registry === 'Adobe' && (properties.cidSystemInfo.ordering === 'GB1' || properties.cidSystemInfo.ordering === 'CNS1' || properties.cidSystemInfo.ordering === 'Japan1' || properties.cidSystemInfo.ordering === 'Korea1'))) {
        var registry = properties.cidSystemInfo.registry;
        var ordering = properties.cidSystemInfo.ordering;
        var ucs2CMapName = _primitives.Name.get(registry + '-' + ordering + '-UCS2');
        return _cmap.CMapFactory.create({
          encoding: ucs2CMapName,
          fetchBuiltInCMap: this.fetchBuiltInCMap,
          useCMap: null
        }).then(function (ucs2CMap) {
          var cMap = properties.cMap;
          toUnicode = [];
          cMap.forEach(function (charcode, cid) {
            if (cid > 0xffff) {
              throw new _util.FormatError('Max size of CID is 65,535');
            }
            var ucs2 = ucs2CMap.lookup(cid);
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
            return new _fonts.IdentityToUnicodeMap(0, 0xFFFF);
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
            return new _fonts.IdentityToUnicodeMap(0, 0xFFFF);
          }
          var map = new Array(cmap.length);
          cmap.forEach(function (charCode, token) {
            var str = [];
            for (var k = 0; k < token.length; k += 2) {
              var w1 = token.charCodeAt(k) << 8 | token.charCodeAt(k + 1);
              if ((w1 & 0xF800) !== 0xD800) {
                str.push(w1);
                continue;
              }
              k += 2;
              var w2 = token.charCodeAt(k) << 8 | token.charCodeAt(k + 1);
              str.push(((w1 & 0x3ff) << 10) + (w2 & 0x3ff) + 0x10000);
            }
            map[charCode] = String.fromCharCode.apply(String, str);
          });
          return new _fonts.ToUnicodeMap(map);
        });
      }
      return Promise.resolve(null);
    },
    readCidToGidMap: function PartialEvaluator_readCidToGidMap(cidToGidStream) {
      var glyphsData = cidToGidStream.getBytes();
      var result = [];
      for (var j = 0, jj = glyphsData.length; j < jj; j++) {
        var glyphID = glyphsData[j++] << 8 | glyphsData[j];
        if (glyphID === 0) {
          continue;
        }
        var code = j >> 1;
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
        defaultWidth = dict.get('DW') || 1000;
        widths = dict.get('W');
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
          var vmetrics = dict.getArray('DW2') || [880, -1000];
          defaultVMetrics = [vmetrics[1], defaultWidth * 0.5, vmetrics[0]];
          vmetrics = dict.get('W2');
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
        widths = dict.get('Widths');
        if (widths) {
          j = firstChar;
          for (i = 0, ii = widths.length; i < ii; i++) {
            glyphsWidths[j++] = xref.fetchIfRef(widths[i]);
          }
          defaultWidth = parseFloat(descriptor.get('MissingWidth')) || 0;
        } else {
          var baseFontName = dict.get('BaseFont');
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
      var fontNameWoStyle = baseFontName.split('-')[0];
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
          lookupName = 'Times-Roman';
        } else {
          lookupName = 'Helvetica';
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
        defaultWidth: defaultWidth,
        monospace: monospace,
        widths: widths
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
      var type = dict.get('Subtype');
      if (!(0, _primitives.isName)(type)) {
        throw new _util.FormatError('invalid font Subtype');
      }
      var composite = false;
      var uint8array;
      if (type.name === 'Type0') {
        var df = dict.get('DescendantFonts');
        if (!df) {
          throw new _util.FormatError('Descendant fonts are not specified');
        }
        dict = Array.isArray(df) ? this.xref.fetchIfRef(df[0]) : df;
        type = dict.get('Subtype');
        if (!(0, _primitives.isName)(type)) {
          throw new _util.FormatError('invalid font Subtype');
        }
        composite = true;
      }
      var descriptor = dict.get('FontDescriptor');
      if (descriptor) {
        var hash = new _murmurhash.MurmurHash3_64();
        var encoding = baseDict.getRaw('Encoding');
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
        var toUnicode = dict.get('ToUnicode') || baseDict.get('ToUnicode');
        if ((0, _primitives.isStream)(toUnicode)) {
          var stream = toUnicode.str || toUnicode;
          uint8array = stream.buffer ? new Uint8Array(stream.buffer.buffer, 0, stream.bufferLength) : new Uint8Array(stream.bytes.buffer, stream.start, stream.end - stream.start);
          hash.update(uint8array);
        } else if ((0, _primitives.isName)(toUnicode)) {
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
    translateFont: function PartialEvaluator_translateFont(preEvaluatedFont) {
      var _this11 = this;

      var baseDict = preEvaluatedFont.baseDict;
      var dict = preEvaluatedFont.dict;
      var composite = preEvaluatedFont.composite;
      var descriptor = preEvaluatedFont.descriptor;
      var type = preEvaluatedFont.type;
      var maxCharIndex = composite ? 0xFFFF : 0xFF;
      var properties;
      if (!descriptor) {
        if (type === 'Type3') {
          descriptor = new _primitives.Dict(null);
          descriptor.set('FontName', _primitives.Name.get(type));
          descriptor.set('FontBBox', dict.getArray('FontBBox'));
        } else {
          var baseFontName = dict.get('BaseFont');
          if (!(0, _primitives.isName)(baseFontName)) {
            throw new _util.FormatError('Base font is not specified');
          }
          baseFontName = baseFontName.name.replace(/[,_]/g, '-');
          var metrics = this.getBaseFontMetrics(baseFontName);
          var fontNameWoStyle = baseFontName.split('-')[0];
          var flags = (this.isSerifFont(fontNameWoStyle) ? _fonts.FontFlags.Serif : 0) | (metrics.monospace ? _fonts.FontFlags.FixedPitch : 0) | ((0, _standard_fonts.getSymbolsFonts)()[fontNameWoStyle] ? _fonts.FontFlags.Symbolic : _fonts.FontFlags.Nonsymbolic);
          properties = {
            type: type,
            name: baseFontName,
            widths: metrics.widths,
            defaultWidth: metrics.defaultWidth,
            flags: flags,
            firstChar: 0,
            lastChar: maxCharIndex
          };
          return this.extractDataStructures(dict, dict, properties).then(function (properties) {
            properties.widths = _this11.buildCharCodeToWidth(metrics.widths, properties);
            return new _fonts.Font(baseFontName, null, properties);
          });
        }
      }
      var firstChar = dict.get('FirstChar') || 0;
      var lastChar = dict.get('LastChar') || maxCharIndex;
      var fontName = descriptor.get('FontName');
      var baseFont = dict.get('BaseFont');
      if ((0, _util.isString)(fontName)) {
        fontName = _primitives.Name.get(fontName);
      }
      if ((0, _util.isString)(baseFont)) {
        baseFont = _primitives.Name.get(baseFont);
      }
      if (type !== 'Type3') {
        var fontNameStr = fontName && fontName.name;
        var baseFontStr = baseFont && baseFont.name;
        if (fontNameStr !== baseFontStr) {
          (0, _util.info)('The FontDescriptor\'s FontName is "' + fontNameStr + '" but should be the same as the Font\'s BaseFont "' + baseFontStr + '"');
          if (fontNameStr && baseFontStr && baseFontStr.indexOf(fontNameStr) === 0) {
            fontName = baseFont;
          }
        }
      }
      fontName = fontName || baseFont;
      if (!(0, _primitives.isName)(fontName)) {
        throw new _util.FormatError('invalid font name');
      }
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
        fontMatrix: dict.getArray('FontMatrix') || _util.FONT_IDENTITY_MATRIX,
        firstChar: firstChar || 0,
        lastChar: lastChar || maxCharIndex,
        bbox: descriptor.getArray('FontBBox'),
        ascent: descriptor.get('Ascent'),
        descent: descriptor.get('Descent'),
        xHeight: descriptor.get('XHeight'),
        capHeight: descriptor.get('CapHeight'),
        flags: descriptor.get('Flags'),
        italicAngle: descriptor.get('ItalicAngle'),
        isType3Font: false
      };
      var cMapPromise;
      if (composite) {
        var cidEncoding = baseDict.get('Encoding');
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
      return cMapPromise.then(function () {
        return _this11.extractDataStructures(dict, baseDict, properties);
      }).then(function (properties) {
        _this11.extractWidths(dict, descriptor, properties);
        if (type === 'Type3') {
          properties.isType3Font = true;
        }
        return new _fonts.Font(fontName.name, fontFile, properties);
      });
    }
  };
  return PartialEvaluator;
}();
var TranslatedFont = function TranslatedFontClosure() {
  function TranslatedFont(loadedName, font, dict) {
    this.loadedName = loadedName;
    this.font = font;
    this.dict = dict;
    this.type3Loaded = null;
    this.sent = false;
  }
  TranslatedFont.prototype = {
    send: function send(handler) {
      if (this.sent) {
        return;
      }
      var fontData = this.font.exportData();
      handler.send('commonobj', [this.loadedName, 'Font', fontData]);
      this.sent = true;
    },
    loadType3Data: function loadType3Data(evaluator, resources, parentOperatorList, task) {
      if (!this.font.isType3Font) {
        throw new Error('Must be a Type3 font.');
      }
      if (this.type3Loaded) {
        return this.type3Loaded;
      }
      var type3Options = Object.create(evaluator.options);
      type3Options.ignoreErrors = false;
      var type3Evaluator = evaluator.clone(type3Options);
      var translatedFont = this.font;
      var loadCharProcsPromise = Promise.resolve();
      var charProcs = this.dict.get('CharProcs');
      var fontResources = this.dict.get('Resources') || resources;
      var charProcKeys = charProcs.getKeys();
      var charProcOperatorList = Object.create(null);

      var _loop2 = function _loop2() {
        var key = charProcKeys[i];
        loadCharProcsPromise = loadCharProcsPromise.then(function () {
          var glyphStream = charProcs.get(key);
          var operatorList = new OperatorList();
          return type3Evaluator.getOperatorList({
            stream: glyphStream,
            task: task,
            resources: fontResources,
            operatorList: operatorList
          }).then(function () {
            charProcOperatorList[key] = operatorList.getIR();
            parentOperatorList.addDependencies(operatorList.dependencies);
          }).catch(function (reason) {
            (0, _util.warn)('Type3 font resource "' + key + '" is not available.');
            var operatorList = new OperatorList();
            charProcOperatorList[key] = operatorList.getIR();
          });
        });
      };

      for (var i = 0, n = charProcKeys.length; i < n; ++i) {
        _loop2();
      }
      this.type3Loaded = loadCharProcsPromise.then(function () {
        translatedFont.charProcOperatorList = charProcOperatorList;
      });
      return this.type3Loaded;
    }
  };
  return TranslatedFont;
}();
var OperatorList = function OperatorListClosure() {
  var CHUNK_SIZE = 1000;
  var CHUNK_SIZE_ABOUT = CHUNK_SIZE - 5;
  function getTransfers(queue) {
    var transfers = [];
    var fnArray = queue.fnArray,
        argsArray = queue.argsArray;
    for (var i = 0, ii = queue.length; i < ii; i++) {
      switch (fnArray[i]) {
        case _util.OPS.paintInlineImageXObject:
        case _util.OPS.paintInlineImageXObjectGroup:
        case _util.OPS.paintImageMaskXObject:
          var arg = argsArray[i][0];
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
    get totalLength() {
      return this._totalLength + this.length;
    },
    addOp: function addOp(fn, args) {
      this.fnArray.push(fn);
      this.argsArray.push(args);
      if (this.messageHandler) {
        if (this.fnArray.length >= CHUNK_SIZE) {
          this.flush();
        } else if (this.fnArray.length >= CHUNK_SIZE_ABOUT && (fn === _util.OPS.restore || fn === _util.OPS.endText)) {
          this.flush();
        }
      }
    },
    addDependency: function addDependency(dependency) {
      if (dependency in this.dependencies) {
        return;
      }
      this.dependencies[dependency] = true;
      this.addOp(_util.OPS.dependency, [dependency]);
    },
    addDependencies: function addDependencies(dependencies) {
      for (var key in dependencies) {
        this.addDependency(key);
      }
    },
    addOpList: function addOpList(opList) {
      _util.Util.extendObj(this.dependencies, opList.dependencies);
      for (var i = 0, ii = opList.length; i < ii; i++) {
        this.addOp(opList.fnArray[i], opList.argsArray[i]);
      }
    },
    getIR: function getIR() {
      return {
        fnArray: this.fnArray,
        argsArray: this.argsArray,
        length: this.length
      };
    },
    flush: function flush(lastChunk) {
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
}();
var StateManager = function StateManagerClosure() {
  function StateManager(initialState) {
    this.state = initialState;
    this.stateStack = [];
  }
  StateManager.prototype = {
    save: function save() {
      var old = this.state;
      this.stateStack.push(this.state);
      this.state = old.clone();
    },
    restore: function restore() {
      var prev = this.stateStack.pop();
      if (prev) {
        this.state = prev;
      }
    },
    transform: function transform(args) {
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
  var getOPMap = (0, _util.getLookupTableFactory)(function (t) {
    t['w'] = {
      id: _util.OPS.setLineWidth,
      numArgs: 1,
      variableArgs: false
    };
    t['J'] = {
      id: _util.OPS.setLineCap,
      numArgs: 1,
      variableArgs: false
    };
    t['j'] = {
      id: _util.OPS.setLineJoin,
      numArgs: 1,
      variableArgs: false
    };
    t['M'] = {
      id: _util.OPS.setMiterLimit,
      numArgs: 1,
      variableArgs: false
    };
    t['d'] = {
      id: _util.OPS.setDash,
      numArgs: 2,
      variableArgs: false
    };
    t['ri'] = {
      id: _util.OPS.setRenderingIntent,
      numArgs: 1,
      variableArgs: false
    };
    t['i'] = {
      id: _util.OPS.setFlatness,
      numArgs: 1,
      variableArgs: false
    };
    t['gs'] = {
      id: _util.OPS.setGState,
      numArgs: 1,
      variableArgs: false
    };
    t['q'] = {
      id: _util.OPS.save,
      numArgs: 0,
      variableArgs: false
    };
    t['Q'] = {
      id: _util.OPS.restore,
      numArgs: 0,
      variableArgs: false
    };
    t['cm'] = {
      id: _util.OPS.transform,
      numArgs: 6,
      variableArgs: false
    };
    t['m'] = {
      id: _util.OPS.moveTo,
      numArgs: 2,
      variableArgs: false
    };
    t['l'] = {
      id: _util.OPS.lineTo,
      numArgs: 2,
      variableArgs: false
    };
    t['c'] = {
      id: _util.OPS.curveTo,
      numArgs: 6,
      variableArgs: false
    };
    t['v'] = {
      id: _util.OPS.curveTo2,
      numArgs: 4,
      variableArgs: false
    };
    t['y'] = {
      id: _util.OPS.curveTo3,
      numArgs: 4,
      variableArgs: false
    };
    t['h'] = {
      id: _util.OPS.closePath,
      numArgs: 0,
      variableArgs: false
    };
    t['re'] = {
      id: _util.OPS.rectangle,
      numArgs: 4,
      variableArgs: false
    };
    t['S'] = {
      id: _util.OPS.stroke,
      numArgs: 0,
      variableArgs: false
    };
    t['s'] = {
      id: _util.OPS.closeStroke,
      numArgs: 0,
      variableArgs: false
    };
    t['f'] = {
      id: _util.OPS.fill,
      numArgs: 0,
      variableArgs: false
    };
    t['F'] = {
      id: _util.OPS.fill,
      numArgs: 0,
      variableArgs: false
    };
    t['f*'] = {
      id: _util.OPS.eoFill,
      numArgs: 0,
      variableArgs: false
    };
    t['B'] = {
      id: _util.OPS.fillStroke,
      numArgs: 0,
      variableArgs: false
    };
    t['B*'] = {
      id: _util.OPS.eoFillStroke,
      numArgs: 0,
      variableArgs: false
    };
    t['b'] = {
      id: _util.OPS.closeFillStroke,
      numArgs: 0,
      variableArgs: false
    };
    t['b*'] = {
      id: _util.OPS.closeEOFillStroke,
      numArgs: 0,
      variableArgs: false
    };
    t['n'] = {
      id: _util.OPS.endPath,
      numArgs: 0,
      variableArgs: false
    };
    t['W'] = {
      id: _util.OPS.clip,
      numArgs: 0,
      variableArgs: false
    };
    t['W*'] = {
      id: _util.OPS.eoClip,
      numArgs: 0,
      variableArgs: false
    };
    t['BT'] = {
      id: _util.OPS.beginText,
      numArgs: 0,
      variableArgs: false
    };
    t['ET'] = {
      id: _util.OPS.endText,
      numArgs: 0,
      variableArgs: false
    };
    t['Tc'] = {
      id: _util.OPS.setCharSpacing,
      numArgs: 1,
      variableArgs: false
    };
    t['Tw'] = {
      id: _util.OPS.setWordSpacing,
      numArgs: 1,
      variableArgs: false
    };
    t['Tz'] = {
      id: _util.OPS.setHScale,
      numArgs: 1,
      variableArgs: false
    };
    t['TL'] = {
      id: _util.OPS.setLeading,
      numArgs: 1,
      variableArgs: false
    };
    t['Tf'] = {
      id: _util.OPS.setFont,
      numArgs: 2,
      variableArgs: false
    };
    t['Tr'] = {
      id: _util.OPS.setTextRenderingMode,
      numArgs: 1,
      variableArgs: false
    };
    t['Ts'] = {
      id: _util.OPS.setTextRise,
      numArgs: 1,
      variableArgs: false
    };
    t['Td'] = {
      id: _util.OPS.moveText,
      numArgs: 2,
      variableArgs: false
    };
    t['TD'] = {
      id: _util.OPS.setLeadingMoveText,
      numArgs: 2,
      variableArgs: false
    };
    t['Tm'] = {
      id: _util.OPS.setTextMatrix,
      numArgs: 6,
      variableArgs: false
    };
    t['T*'] = {
      id: _util.OPS.nextLine,
      numArgs: 0,
      variableArgs: false
    };
    t['Tj'] = {
      id: _util.OPS.showText,
      numArgs: 1,
      variableArgs: false
    };
    t['TJ'] = {
      id: _util.OPS.showSpacedText,
      numArgs: 1,
      variableArgs: false
    };
    t['\''] = {
      id: _util.OPS.nextLineShowText,
      numArgs: 1,
      variableArgs: false
    };
    t['"'] = {
      id: _util.OPS.nextLineSetSpacingShowText,
      numArgs: 3,
      variableArgs: false
    };
    t['d0'] = {
      id: _util.OPS.setCharWidth,
      numArgs: 2,
      variableArgs: false
    };
    t['d1'] = {
      id: _util.OPS.setCharWidthAndBounds,
      numArgs: 6,
      variableArgs: false
    };
    t['CS'] = {
      id: _util.OPS.setStrokeColorSpace,
      numArgs: 1,
      variableArgs: false
    };
    t['cs'] = {
      id: _util.OPS.setFillColorSpace,
      numArgs: 1,
      variableArgs: false
    };
    t['SC'] = {
      id: _util.OPS.setStrokeColor,
      numArgs: 4,
      variableArgs: true
    };
    t['SCN'] = {
      id: _util.OPS.setStrokeColorN,
      numArgs: 33,
      variableArgs: true
    };
    t['sc'] = {
      id: _util.OPS.setFillColor,
      numArgs: 4,
      variableArgs: true
    };
    t['scn'] = {
      id: _util.OPS.setFillColorN,
      numArgs: 33,
      variableArgs: true
    };
    t['G'] = {
      id: _util.OPS.setStrokeGray,
      numArgs: 1,
      variableArgs: false
    };
    t['g'] = {
      id: _util.OPS.setFillGray,
      numArgs: 1,
      variableArgs: false
    };
    t['RG'] = {
      id: _util.OPS.setStrokeRGBColor,
      numArgs: 3,
      variableArgs: false
    };
    t['rg'] = {
      id: _util.OPS.setFillRGBColor,
      numArgs: 3,
      variableArgs: false
    };
    t['K'] = {
      id: _util.OPS.setStrokeCMYKColor,
      numArgs: 4,
      variableArgs: false
    };
    t['k'] = {
      id: _util.OPS.setFillCMYKColor,
      numArgs: 4,
      variableArgs: false
    };
    t['sh'] = {
      id: _util.OPS.shadingFill,
      numArgs: 1,
      variableArgs: false
    };
    t['BI'] = {
      id: _util.OPS.beginInlineImage,
      numArgs: 0,
      variableArgs: false
    };
    t['ID'] = {
      id: _util.OPS.beginImageData,
      numArgs: 0,
      variableArgs: false
    };
    t['EI'] = {
      id: _util.OPS.endInlineImage,
      numArgs: 1,
      variableArgs: false
    };
    t['Do'] = {
      id: _util.OPS.paintXObject,
      numArgs: 1,
      variableArgs: false
    };
    t['MP'] = {
      id: _util.OPS.markPoint,
      numArgs: 1,
      variableArgs: false
    };
    t['DP'] = {
      id: _util.OPS.markPointProps,
      numArgs: 2,
      variableArgs: false
    };
    t['BMC'] = {
      id: _util.OPS.beginMarkedContent,
      numArgs: 1,
      variableArgs: false
    };
    t['BDC'] = {
      id: _util.OPS.beginMarkedContentProps,
      numArgs: 2,
      variableArgs: false
    };
    t['EMC'] = {
      id: _util.OPS.endMarkedContent,
      numArgs: 0,
      variableArgs: false
    };
    t['BX'] = {
      id: _util.OPS.beginCompat,
      numArgs: 0,
      variableArgs: false
    };
    t['EX'] = {
      id: _util.OPS.endCompat,
      numArgs: 0,
      variableArgs: false
    };
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
    this.parser = new _parser.Parser(new _parser.Lexer(stream, this.opMap), false, xref);
    this.stateManager = stateManager;
    this.nonProcessedArgs = [];
  }
  EvaluatorPreprocessor.prototype = {
    get savedStatesDepth() {
      return this.stateManager.stateStack.length;
    },
    read: function EvaluatorPreprocessor_read(operation) {
      var args = operation.args;
      while (true) {
        var obj = this.parser.getObj();
        if ((0, _primitives.isCmd)(obj)) {
          var cmd = obj.cmd;
          var opSpec = this.opMap[cmd];
          if (!opSpec) {
            (0, _util.warn)('Unknown command "' + cmd + '"');
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
              (0, _util.warn)('Skipping command ' + fn + ': expected ' + numArgs + ' args, but received ' + argsLength + ' args.');
              if (args !== null) {
                args.length = 0;
              }
              continue;
            }
          } else if (argsLength > numArgs) {
            (0, _util.info)('Command ' + fn + ': expected [0,' + numArgs + '] args, but received ' + argsLength + ' args.');
          }
          this.preprocessCommand(fn, args);
          operation.fn = fn;
          operation.args = args;
          return true;
        }
        if ((0, _primitives.isEOF)(obj)) {
          return false;
        }
        if (obj !== null) {
          if (args === null) {
            args = [];
          }
          args.push(obj);
          if (args.length > 33) {
            throw new _util.FormatError('Too many arguments');
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
var QueueOptimizer = function QueueOptimizerClosure() {
  function addState(parentState, pattern, fn) {
    var state = parentState;
    for (var i = 0, ii = pattern.length - 1; i < ii; i++) {
      var item = pattern[i];
      state = state[item] || (state[item] = []);
    }
    state[pattern[pattern.length - 1]] = fn;
  }
  function handlePaintSolidColorImageMask(iFirstSave, count, fnArray, argsArray) {
    var iFirstPIMXO = iFirstSave + 2;
    for (var i = 0; i < count; i++) {
      var arg = argsArray[iFirstPIMXO + 4 * i];
      var imageMask = arg.length === 1 && arg[0];
      if (imageMask && imageMask.width === 1 && imageMask.height === 1 && (!imageMask.data.length || imageMask.data.length === 1 && imageMask.data[0] === 0)) {
        fnArray[iFirstPIMXO + 4 * i] = _util.OPS.paintSolidColorImageMask;
        continue;
      }
      break;
    }
    return count - i;
  }
  var InitialState = [];
  addState(InitialState, [_util.OPS.save, _util.OPS.transform, _util.OPS.paintInlineImageXObject, _util.OPS.restore], function foundInlineImageGroup(context) {
    var MIN_IMAGES_IN_INLINE_IMAGES_BLOCK = 10;
    var MAX_IMAGES_IN_INLINE_IMAGES_BLOCK = 200;
    var MAX_WIDTH = 1000;
    var IMAGE_PADDING = 1;
    var fnArray = context.fnArray,
        argsArray = context.argsArray;
    var curr = context.iCurr;
    var iFirstSave = curr - 3;
    var iFirstTransform = curr - 2;
    var iFirstPIIXO = curr - 1;
    var i = iFirstSave + 4;
    var ii = fnArray.length;
    while (i + 3 < ii) {
      if (fnArray[i] !== _util.OPS.save || fnArray[i + 1] !== _util.OPS.transform || fnArray[i + 2] !== _util.OPS.paintInlineImageXObject || fnArray[i + 3] !== _util.OPS.restore) {
        break;
      }
      i += 4;
    }
    var count = Math.min((i - iFirstSave) / 4, MAX_IMAGES_IN_INLINE_IMAGES_BLOCK);
    if (count < MIN_IMAGES_IN_INLINE_IMAGES_BLOCK) {
      return i;
    }
    var maxX = 0;
    var map = [],
        maxLineHeight = 0;
    var currentX = IMAGE_PADDING,
        currentY = IMAGE_PADDING;
    var q;
    for (q = 0; q < count; q++) {
      var transform = argsArray[iFirstTransform + (q << 2)];
      var img = argsArray[iFirstPIIXO + (q << 2)][0];
      if (currentX + img.width > MAX_WIDTH) {
        maxX = Math.max(maxX, currentX);
        currentY += maxLineHeight + 2 * IMAGE_PADDING;
        currentX = 0;
        maxLineHeight = 0;
      }
      map.push({
        transform: transform,
        x: currentX,
        y: currentY,
        w: img.width,
        h: img.height
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
      var rowSize = map[q].w << 2;
      var dataOffset = 0;
      var offset = map[q].x + map[q].y * imgWidth << 2;
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
    fnArray.splice(iFirstSave, count * 4, _util.OPS.paintInlineImageXObjectGroup);
    argsArray.splice(iFirstSave, count * 4, [{
      width: imgWidth,
      height: imgHeight,
      kind: _util.ImageKind.RGBA_32BPP,
      data: imgData
    }, map]);
    return iFirstSave + 1;
  });
  addState(InitialState, [_util.OPS.save, _util.OPS.transform, _util.OPS.paintImageMaskXObject, _util.OPS.restore], function foundImageMaskGroup(context) {
    var MIN_IMAGES_IN_MASKS_BLOCK = 10;
    var MAX_IMAGES_IN_MASKS_BLOCK = 100;
    var MAX_SAME_IMAGES_IN_MASKS_BLOCK = 1000;
    var fnArray = context.fnArray,
        argsArray = context.argsArray;
    var curr = context.iCurr;
    var iFirstSave = curr - 3;
    var iFirstTransform = curr - 2;
    var iFirstPIMXO = curr - 1;
    var i = iFirstSave + 4;
    var ii = fnArray.length;
    while (i + 3 < ii) {
      if (fnArray[i] !== _util.OPS.save || fnArray[i + 1] !== _util.OPS.transform || fnArray[i + 2] !== _util.OPS.paintImageMaskXObject || fnArray[i + 3] !== _util.OPS.restore) {
        break;
      }
      i += 4;
    }
    var count = (i - iFirstSave) / 4;
    count = handlePaintSolidColorImageMask(iFirstSave, count, fnArray, argsArray);
    if (count < MIN_IMAGES_IN_MASKS_BLOCK) {
      return i;
    }
    var q;
    var isSameImage = false;
    var iTransform, transformArgs;
    var firstPIMXOArg0 = argsArray[iFirstPIMXO][0];
    if (argsArray[iFirstTransform][1] === 0 && argsArray[iFirstTransform][2] === 0) {
      isSameImage = true;
      var firstTransformArg0 = argsArray[iFirstTransform][0];
      var firstTransformArg3 = argsArray[iFirstTransform][3];
      iTransform = iFirstTransform + 4;
      var iPIMXO = iFirstPIMXO + 4;
      for (q = 1; q < count; q++, iTransform += 4, iPIMXO += 4) {
        transformArgs = argsArray[iTransform];
        if (argsArray[iPIMXO][0] !== firstPIMXOArg0 || transformArgs[0] !== firstTransformArg0 || transformArgs[1] !== 0 || transformArgs[2] !== 0 || transformArgs[3] !== firstTransformArg3) {
          if (q < MIN_IMAGES_IN_MASKS_BLOCK) {
            isSameImage = false;
          } else {
            count = q;
          }
          break;
        }
      }
    }
    if (isSameImage) {
      count = Math.min(count, MAX_SAME_IMAGES_IN_MASKS_BLOCK);
      var positions = new Float32Array(count * 2);
      iTransform = iFirstTransform;
      for (q = 0; q < count; q++, iTransform += 4) {
        transformArgs = argsArray[iTransform];
        positions[q << 1] = transformArgs[4];
        positions[(q << 1) + 1] = transformArgs[5];
      }
      fnArray.splice(iFirstSave, count * 4, _util.OPS.paintImageMaskXObjectRepeat);
      argsArray.splice(iFirstSave, count * 4, [firstPIMXOArg0, firstTransformArg0, firstTransformArg3, positions]);
    } else {
      count = Math.min(count, MAX_IMAGES_IN_MASKS_BLOCK);
      var images = [];
      for (q = 0; q < count; q++) {
        transformArgs = argsArray[iFirstTransform + (q << 2)];
        var maskParams = argsArray[iFirstPIMXO + (q << 2)][0];
        images.push({
          data: maskParams.data,
          width: maskParams.width,
          height: maskParams.height,
          transform: transformArgs
        });
      }
      fnArray.splice(iFirstSave, count * 4, _util.OPS.paintImageMaskXObjectGroup);
      argsArray.splice(iFirstSave, count * 4, [images]);
    }
    return iFirstSave + 1;
  });
  addState(InitialState, [_util.OPS.save, _util.OPS.transform, _util.OPS.paintImageXObject, _util.OPS.restore], function (context) {
    var MIN_IMAGES_IN_BLOCK = 3;
    var MAX_IMAGES_IN_BLOCK = 1000;
    var fnArray = context.fnArray,
        argsArray = context.argsArray;
    var curr = context.iCurr;
    var iFirstSave = curr - 3;
    var iFirstTransform = curr - 2;
    var iFirstPIXO = curr - 1;
    var iFirstRestore = curr;
    if (argsArray[iFirstTransform][1] !== 0 || argsArray[iFirstTransform][2] !== 0) {
      return iFirstRestore + 1;
    }
    var firstPIXOArg0 = argsArray[iFirstPIXO][0];
    var firstTransformArg0 = argsArray[iFirstTransform][0];
    var firstTransformArg3 = argsArray[iFirstTransform][3];
    var i = iFirstSave + 4;
    var ii = fnArray.length;
    while (i + 3 < ii) {
      if (fnArray[i] !== _util.OPS.save || fnArray[i + 1] !== _util.OPS.transform || fnArray[i + 2] !== _util.OPS.paintImageXObject || fnArray[i + 3] !== _util.OPS.restore) {
        break;
      }
      if (argsArray[i + 1][0] !== firstTransformArg0 || argsArray[i + 1][1] !== 0 || argsArray[i + 1][2] !== 0 || argsArray[i + 1][3] !== firstTransformArg3) {
        break;
      }
      if (argsArray[i + 2][0] !== firstPIXOArg0) {
        break;
      }
      i += 4;
    }
    var count = Math.min((i - iFirstSave) / 4, MAX_IMAGES_IN_BLOCK);
    if (count < MIN_IMAGES_IN_BLOCK) {
      return i;
    }
    var positions = new Float32Array(count * 2);
    var iTransform = iFirstTransform;
    for (var q = 0; q < count; q++, iTransform += 4) {
      var transformArgs = argsArray[iTransform];
      positions[q << 1] = transformArgs[4];
      positions[(q << 1) + 1] = transformArgs[5];
    }
    var args = [firstPIXOArg0, firstTransformArg0, firstTransformArg3, positions];
    fnArray.splice(iFirstSave, count * 4, _util.OPS.paintImageXObjectRepeat);
    argsArray.splice(iFirstSave, count * 4, args);
    return iFirstSave + 1;
  });
  addState(InitialState, [_util.OPS.beginText, _util.OPS.setFont, _util.OPS.setTextMatrix, _util.OPS.showText, _util.OPS.endText], function (context) {
    var MIN_CHARS_IN_BLOCK = 3;
    var MAX_CHARS_IN_BLOCK = 1000;
    var fnArray = context.fnArray,
        argsArray = context.argsArray;
    var curr = context.iCurr;
    var iFirstBeginText = curr - 4;
    var iFirstSetFont = curr - 3;
    var iFirstSetTextMatrix = curr - 2;
    var iFirstShowText = curr - 1;
    var iFirstEndText = curr;
    var firstSetFontArg0 = argsArray[iFirstSetFont][0];
    var firstSetFontArg1 = argsArray[iFirstSetFont][1];
    var i = iFirstBeginText + 5;
    var ii = fnArray.length;
    while (i + 4 < ii) {
      if (fnArray[i] !== _util.OPS.beginText || fnArray[i + 1] !== _util.OPS.setFont || fnArray[i + 2] !== _util.OPS.setTextMatrix || fnArray[i + 3] !== _util.OPS.showText || fnArray[i + 4] !== _util.OPS.endText) {
        break;
      }
      if (argsArray[i + 1][0] !== firstSetFontArg0 || argsArray[i + 1][1] !== firstSetFontArg1) {
        break;
      }
      i += 5;
    }
    var count = Math.min((i - iFirstBeginText) / 5, MAX_CHARS_IN_BLOCK);
    if (count < MIN_CHARS_IN_BLOCK) {
      return i;
    }
    var iFirst = iFirstBeginText;
    if (iFirstBeginText >= 4 && fnArray[iFirstBeginText - 4] === fnArray[iFirstSetFont] && fnArray[iFirstBeginText - 3] === fnArray[iFirstSetTextMatrix] && fnArray[iFirstBeginText - 2] === fnArray[iFirstShowText] && fnArray[iFirstBeginText - 1] === fnArray[iFirstEndText] && argsArray[iFirstBeginText - 4][0] === firstSetFontArg0 && argsArray[iFirstBeginText - 4][1] === firstSetFontArg1) {
      count++;
      iFirst -= 5;
    }
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
      var fnArray = queue.fnArray,
          argsArray = queue.argsArray;
      var context = {
        iCurr: 0,
        fnArray: fnArray,
        argsArray: argsArray
      };
      var state;
      var i = 0,
          ii = fnArray.length;
      while (i < ii) {
        state = (state || InitialState)[fnArray[i]];
        if (typeof state === 'function') {
          context.iCurr = i;
          i = state(context);
          state = undefined;
          ii = context.fnArray.length;
        } else {
          i++;
        }
      }
    }
  };
  return QueueOptimizer;
}();
exports.OperatorList = OperatorList;
exports.PartialEvaluator = PartialEvaluator;