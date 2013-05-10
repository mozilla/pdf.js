/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
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
/* globals assert, assertWellFormed, ColorSpace, Dict, Encodings, error,
           ErrorFont, Font, FONT_IDENTITY_MATRIX, fontCharsToUnicode, FontFlags,
           IDENTITY_MATRIX, info, isArray, isCmd, isDict, isEOF, isName, isNum,
           isStream, isString, JpegStream, Lexer, Metrics, Name, Parser,
           Pattern, PDFImage, PDFJS, serifFonts, stdFontMap, symbolsFonts,
           TilingPattern, TODO, warn, Util, MissingDataException, Promise */

'use strict';

var PartialEvaluator = (function PartialEvaluatorClosure() {
  function PartialEvaluator(pdfManager, xref, handler, pageIndex,
                            uniquePrefix, idCounters) {
    this.state = new EvalState();
    this.stateStack = [];

    this.pdfManager = pdfManager;
    this.xref = xref;
    this.handler = handler;
    this.pageIndex = pageIndex;
    this.uniquePrefix = uniquePrefix;
    this.idCounters = idCounters;
  }

  // Specifies properties for each command
  //
  // If variableArgs === true: [0, `numArgs`] expected
  // If variableArgs === false: exactly `numArgs` expected
  var OP_MAP = {
    // Graphic state
    w: { fnName: 'setLineWidth', numArgs: 1, variableArgs: false },
    J: { fnName: 'setLineCap', numArgs: 1, variableArgs: false },
    j: { fnName: 'setLineJoin', numArgs: 1, variableArgs: false },
    M: { fnName: 'setMiterLimit', numArgs: 1, variableArgs: false },
    d: { fnName: 'setDash', numArgs: 2, variableArgs: false },
    ri: { fnName: 'setRenderingIntent', numArgs: 1, variableArgs: false },
    i: { fnName: 'setFlatness', numArgs: 1, variableArgs: false },
    gs: { fnName: 'setGState', numArgs: 1, variableArgs: false },
    q: { fnName: 'save', numArgs: 0, variableArgs: false },
    Q: { fnName: 'restore', numArgs: 0, variableArgs: false },
    cm: { fnName: 'transform', numArgs: 6, variableArgs: false },

    // Path
    m: { fnName: 'moveTo', numArgs: 2, variableArgs: false },
    l: { fnName: 'lineTo', numArgs: 2, variableArgs: false },
    c: { fnName: 'curveTo', numArgs: 6, variableArgs: false },
    v: { fnName: 'curveTo2', numArgs: 4, variableArgs: false },
    y: { fnName: 'curveTo3', numArgs: 4, variableArgs: false },
    h: { fnName: 'closePath', numArgs: 0, variableArgs: false },
    re: { fnName: 'rectangle', numArgs: 4, variableArgs: false },
    S: { fnName: 'stroke', numArgs: 0, variableArgs: false },
    s: { fnName: 'closeStroke', numArgs: 0, variableArgs: false },
    f: { fnName: 'fill', numArgs: 0, variableArgs: false },
    F: { fnName: 'fill', numArgs: 0, variableArgs: false },
    'f*': { fnName: 'eoFill', numArgs: 0, variableArgs: false },
    B: { fnName: 'fillStroke', numArgs: 0, variableArgs: false },
    'B*': { fnName: 'eoFillStroke', numArgs: 0, variableArgs: false },
    b: { fnName: 'closeFillStroke', numArgs: 0, variableArgs: false },
    'b*': { fnName: 'closeEOFillStroke', numArgs: 0, variableArgs: false },
    n: { fnName: 'endPath', numArgs: 0, variableArgs: false },

    // Clipping
    W: { fnName: 'clip', numArgs: 0, variableArgs: false },
    'W*': { fnName: 'eoClip', numArgs: 0, variableArgs: false },

    // Text
    BT: { fnName: 'beginText', numArgs: 0, variableArgs: false },
    ET: { fnName: 'endText', numArgs: 0, variableArgs: false },
    Tc: { fnName: 'setCharSpacing', numArgs: 1, variableArgs: false },
    Tw: { fnName: 'setWordSpacing', numArgs: 1, variableArgs: false },
    Tz: { fnName: 'setHScale', numArgs: 1, variableArgs: false },
    TL: { fnName: 'setLeading', numArgs: 1, variableArgs: false },
    Tf: { fnName: 'setFont', numArgs: 2, variableArgs: false },
    Tr: { fnName: 'setTextRenderingMode', numArgs: 1, variableArgs: false },
    Ts: { fnName: 'setTextRise', numArgs: 1, variableArgs: false },
    Td: { fnName: 'moveText', numArgs: 2, variableArgs: false },
    TD: { fnName: 'setLeadingMoveText', numArgs: 2, variableArgs: false },
    Tm: { fnName: 'setTextMatrix', numArgs: 6, variableArgs: false },
    'T*': { fnName: 'nextLine', numArgs: 0, variableArgs: false },
    Tj: { fnName: 'showText', numArgs: 1, variableArgs: false },
    TJ: { fnName: 'showSpacedText', numArgs: 1, variableArgs: false },
    '\'': { fnName: 'nextLineShowText', numArgs: 1, variableArgs: false },
    '"': { fnName: 'nextLineSetSpacingShowText', numArgs: 3,
      variableArgs: false },

    // Type3 fonts
    d0: { fnName: 'setCharWidth', numArgs: 2, variableArgs: false },
    d1: { fnName: 'setCharWidthAndBounds', numArgs: 6, variableArgs: false },

    // Color
    CS: { fnName: 'setStrokeColorSpace', numArgs: 1, variableArgs: false },
    cs: { fnName: 'setFillColorSpace', numArgs: 1, variableArgs: false },
    SC: { fnName: 'setStrokeColor', numArgs: 4, variableArgs: true },
    SCN: { fnName: 'setStrokeColorN', numArgs: 33, variableArgs: true },
    sc: { fnName: 'setFillColor', numArgs: 4, variableArgs: true },
    scn: { fnName: 'setFillColorN', numArgs: 33, variableArgs: true },
    G: { fnName: 'setStrokeGray', numArgs: 1, variableArgs: false },
    g: { fnName: 'setFillGray', numArgs: 1, variableArgs: false },
    RG: { fnName: 'setStrokeRGBColor', numArgs: 3, variableArgs: false },
    rg: { fnName: 'setFillRGBColor', numArgs: 3, variableArgs: false },
    K: { fnName: 'setStrokeCMYKColor', numArgs: 4, variableArgs: false },
    k: { fnName: 'setFillCMYKColor', numArgs: 4, variableArgs: false },

    // Shading
    sh: { fnName: 'shadingFill', numArgs: 1, variableArgs: false },

    // Images
    BI: { fnName: 'beginInlineImage', numArgs: 0, variableArgs: false },
    ID: { fnName: 'beginImageData', numArgs: 0, variableArgs: false },
    EI: { fnName: 'endInlineImage', numArgs: 0, variableArgs: false },

    // XObjects
    Do: { fnName: 'paintXObject', numArgs: 1, variableArgs: false },
    MP: { fnName: 'markPoint', numArgs: 1, variableArgs: false },
    DP: { fnName: 'markPointProps', numArgs: 2, variableArgs: false },
    BMC: { fnName: 'beginMarkedContent', numArgs: 1, variableArgs: false },
    BDC: { fnName: 'beginMarkedContentProps', numArgs: 2, variableArgs: false },
    EMC: { fnName: 'endMarkedContent', numArgs: 0, variableArgs: false },

    // Compatibility
    BX: { fnName: 'beginCompat', numArgs: 0, variableArgs: false },
    EX: { fnName: 'endCompat', numArgs: 0, variableArgs: false },

    // (reserved partial commands for the lexer)
    BM: null,
    BD: null,
    'true': null,
    fa: null,
    fal: null,
    fals: null,
    'false': null,
    nu: null,
    nul: null,
    'null': null
  };

  var TILING_PATTERN = 1, SHADING_PATTERN = 2;

  function createOperatorList(fnArray, argsArray, dependencies) {
    return {
      queue: {
        fnArray: fnArray || [],
        argsArray: argsArray || []
      },
      dependencies: dependencies || {}
    };
  }

  PartialEvaluator.prototype = {

    buildFormXObject: function PartialEvaluator_buildFormXObject(resources,
                                                                 xobj, smask) {
      var self = this;
      var promise = new Promise();
      var fnArray = [];
      var argsArray = [];

      var matrix = xobj.dict.get('Matrix');
      var bbox = xobj.dict.get('BBox');
      var group = xobj.dict.get('Group');
      if (group) {
        var groupOptions = {
          matrix: matrix,
          bbox: bbox,
          smask: !!smask,
          isolated: false,
          knockout: false
        };

        var groupSubtype = group.get('S');
        if (isName(groupSubtype) && groupSubtype.name === 'Transparency') {
          groupOptions.isolated = group.get('I') || false;
          groupOptions.knockout = group.get('K') || false;
          // There is also a group colorspace, but since we put everything in
          // RGB I'm not sure we need it.
        }
        fnArray.push('beginGroup');
        argsArray.push([groupOptions]);
      }

      fnArray.push('paintFormXObjectBegin');
      argsArray.push([matrix, bbox]);

      // Pass in the current `queue` object. That means the `fnArray`
      // and the `argsArray` in this scope is reused and new commands
      // are added to them.
      var opListPromise = this.getOperatorList(xobj,
          xobj.dict.get('Resources') || resources);
      opListPromise.then(function(data) {
        var queue = data.queue;
        var dependencies = data.dependencies;
        Util.prependToArray(queue.fnArray, fnArray);
        Util.prependToArray(queue.argsArray, argsArray);
        self.insertDependencies(queue, dependencies);

        queue.fnArray.push('paintFormXObjectEnd');
        queue.argsArray.push([]);

        if (group) {
          queue.fnArray.push('endGroup');
          queue.argsArray.push([groupOptions]);
        }

        promise.resolve({
          queue: queue,
          dependencies: dependencies
        });
      });

      return promise;
    },

    buildPaintImageXObject: function PartialEvaluator_buildPaintImageXObject(
                                resources, image, inline) {
      var self = this;
      var dict = image.dict;
      var w = dict.get('Width', 'W');
      var h = dict.get('Height', 'H');

      var dependencies = {};
      var retData = {
        dependencies: dependencies
      };

      var imageMask = dict.get('ImageMask', 'IM') || false;
      if (imageMask) {
        // This depends on a tmpCanvas beeing filled with the
        // current fillStyle, such that processing the pixel
        // data can't be done here. Instead of creating a
        // complete PDFImage, only read the information needed
        // for later.

        var width = dict.get('Width', 'W');
        var height = dict.get('Height', 'H');
        var bitStrideLength = (width + 7) >> 3;
        var imgArray = image.getBytes(bitStrideLength * height);
        var decode = dict.get('Decode', 'D');
        var inverseDecode = !!decode && decode[0] > 0;

        retData.fn = 'paintImageMaskXObject';
        retData.args = [imgArray, inverseDecode, width, height];
        return retData;
      }

      var softMask = dict.get('SMask', 'SM') || false;
      var mask = dict.get('Mask') || false;

      var SMALL_IMAGE_DIMENSIONS = 200;
      // Inlining small images into the queue as RGB data
      if (inline && !softMask && !mask &&
          !(image instanceof JpegStream) &&
          (w + h) < SMALL_IMAGE_DIMENSIONS) {
        var imageObj = new PDFImage(this.xref, resources, image,
                                    inline, null, null);
        var imgData = imageObj.getImageData();
        retData.fn = 'paintInlineImageXObject';
        retData.args = [imgData];
        return retData;
      }

      // If there is no imageMask, create the PDFImage and a lot
      // of image processing can be done here.
      var uniquePrefix = this.uniquePrefix || '';
      var objId = 'img_' + uniquePrefix + (++this.idCounters.obj);
      dependencies[objId] = true;
      retData.args = [objId, w, h];

      if (!softMask && !mask && image instanceof JpegStream &&
          image.isNativelySupported(this.xref, resources)) {
        // These JPEGs don't need any more processing so we can just send it.
        retData.fn = 'paintJpegXObject';
        this.handler.send(
            'obj', [objId, this.pageIndex, 'JpegStream', image.getIR()]);
        return retData;
      }

      retData.fn = 'paintImageXObject';

      PDFImage.buildImage(function(imageObj) {
          var imgData = imageObj.getImageData();
          self.handler.send('obj', [objId, self.pageIndex, 'Image', imgData]);
        }, self.handler, self.xref, resources, image, inline);

      return retData;
    },

    handleTilingType: function PartialEvaluator_handleTilingType(
                          fn, args, resources, pattern, patternDict) {
      var self = this;
      // Create an IR of the pattern code.
      var promise = new Promise();
      var opListPromise = this.getOperatorList(pattern,
          patternDict.get('Resources') || resources);
      opListPromise.then(function(data) {
        var opListData = createOperatorList([], [], data.dependencies);
        var queue = opListData.queue;

        // Add the dependencies that are required to execute the
        // operatorList.
        self.insertDependencies(queue, data.dependencies);
        queue.fnArray.push(fn);
        queue.argsArray.push(
          TilingPattern.getIR(data.queue, patternDict, args));
        promise.resolve(opListData);
      });

      return promise;
    },

    handleSetFont: function PartialEvaluator_handleSetFont(
                      resources, fontArgs, font) {

      var promise = new Promise();
      // TODO(mack): Not needed?
      var fontName;
      if (fontArgs) {
        fontArgs = fontArgs.slice();
        fontName = fontArgs[0].name;
      }
      var self = this;
      var fontPromise = this.loadFont(fontName, font, this.xref, resources);
      fontPromise.then(function(data) {
        var font = data.font;
        var loadedName = font.loadedName;
        if (!font.sent) {
          var fontData = font.translated.exportData();

          self.handler.send('commonobj', [
            loadedName,
            'Font',
            fontData
          ]);
          font.sent = true;
        }

        // Ensure the font is ready before the font is set
        // and later on used for drawing.
        // OPTIMIZE: This should get insert to the operatorList only once per
        // page.
        var fnArray = [];
        var argsArray = [];
        var queue = {
          fnArray: fnArray,
          argsArray: argsArray
        };
        var dependencies = data.dependencies;
        dependencies[loadedName] = true;
        self.insertDependencies(queue, dependencies);
        if (fontArgs) {
          fontArgs[0] = loadedName;
          fnArray.push('setFont');
          argsArray.push(fontArgs);
        }
        promise.resolve({
          loadedName: loadedName,
          queue: queue,
          dependencies: dependencies
        });
      });
      return promise;
    },

    insertDependencies: function PartialEvaluator_insertDependencies(
                            queue, dependencies) {

      var fnArray = queue.fnArray;
      var argsArray = queue.argsArray;
      var depList = Object.keys(dependencies);
      if (depList.length) {
        fnArray.push('dependency');
        argsArray.push(depList);
      }
    },

    setGState: function PartialEvaluator_setGState(resources, gState) {

      var self = this;
      var opListData = createOperatorList();
      var queue = opListData.queue;
      var fnArray = queue.fnArray;
      var argsArray = queue.argsArray;
      var dependencies = opListData.dependencies;

      // TODO(mack): This should be rewritten so that this function returns
      // what should be added to the queue during each iteration
      function setGStateForKey(gStateObj, key, value) {
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
            var promise = new Promise();
            self.handleSetFont(resources, null, value[0]).then(function(data) {
              var gState = ['Font', data.loadedName, value[1]];
              promise.resolve({
                gState: gState,
                queue: data.queue,
                dependencies: data.dependencies
              });
            });
            gStateObj.push(['promise', promise]);
            break;
          case 'BM':
            if (!isName(value) || value.name !== 'Normal') {
              queue.transparency = true;
            }
            gStateObj.push([key, value]);
            break;
          case 'SMask':
            // We support the default so don't trigger the TODO.
            if (!isName(value) || value.name != 'None')
              TODO('graphic state operator ' + key);
            break;
          // Only generate info log messages for the following since
          // they are unlikey to have a big impact on the rendering.
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

      // This array holds the converted/processed state data.
      var gStateObj = [];
      var gStateMap = gState.map;
      for (var key in gStateMap) {
        var value = gStateMap[key];
        setGStateForKey(gStateObj, key, value);
      }

      var promises = [];
      var indices = [];
      for (var i = 0, n = gStateObj.length; i < n; ++i) {
        var value = gStateObj[i];
        if (value[0] === 'promise') {
          promises.push(value[1]);
          indices.push(i);
        }
      }

      var promise = new Promise();
      Promise.all(promises).then(function(datas) {
        for (var i = 0, n = datas.length; i < n; ++i) {
          var data = datas[i];
          var index = indices[i];
          gStateObj[index] = data.gState;
          var subQueue = data.queue;
          Util.concatenateToArray(fnArray, subQueue.fnArray);
          Util.concatenateToArray(argsArray, subQueue.argsArray);
          queue.transparency = subQueue.transparency || queue.transparency;
          Util.extendObj(dependencies, data.dependencies);
        }
        fnArray.push('setGState');
        argsArray.push([gStateObj]);
        promise.resolve(opListData);
      });

      return promise;
    },

    loadFont: function PartialEvaluator_loadFont(fontName, font, xref,
                                                 resources) {
      var promise = new Promise();

      var fontRes = resources.get('Font');
      if (!fontRes) {
        warn('fontRes not available');
      }

      font = xref.fetchIfRef(font) || (fontRes && fontRes.get(fontName));
      if (!isDict(font)) {
        ++this.idCounters.font;
        promise.resolve({
          font: {
            translated: new ErrorFont('Font ' + fontName + ' is not available'),
            loadedName: 'g_font_' + this.uniquePrefix + this.idCounters.obj
          },
          dependencies: {}
        });
        return promise;
      }

      if (font.loaded) {
        promise.resolve({
          font: font,
          dependencies: {}
        });
        return promise;
      }

      // keep track of each font we translated so the caller can
      // load them asynchronously before calling display on a page
      font.loadedName = 'g_font_' + this.uniquePrefix +
                        (this.idCounters.font + 1);

      if (!font.translated) {
        var translated;
        try {
          translated = this.translateFont(font, xref);
        } catch (e) {
          if (e instanceof MissingDataException) {
            throw e;
          }
          translated = new ErrorFont(e instanceof Error ? e.message : e);
        }
        font.translated = translated;
      }

      if (font.translated.loadCharProcs) {
        var charProcs = font.get('CharProcs').getAll();
        var fontResources = font.get('Resources') || resources;
        var opListPromises = [];
        var charProcKeys = Object.keys(charProcs);
        for (var i = 0, n = charProcKeys.length; i < n; ++i) {
          var key = charProcKeys[i];
          var glyphStream = charProcs[key];
          opListPromises.push(
            this.getOperatorList(glyphStream, fontResources));
        }
        Promise.all(opListPromises).then(function(datas) {
          var charProcOperatorList = {};
          var dependencies = {};
          for (var i = 0, n = charProcKeys.length; i < n; ++i) {
            var key = charProcKeys[i];
            var data = datas[i];
            charProcOperatorList[key] = data.queue;
            Util.extendObj(dependencies, data.dependencies);
          }
          font.translated.charProcOperatorList = charProcOperatorList;
          font.loaded = true;
          ++this.idCounters.font;
          promise.resolve({
            font: font,
            dependencies: dependencies
          });
        }.bind(this));
      } else {
        ++this.idCounters.font;
        font.loaded = true;
        promise.resolve({
          font: font,
          dependencies: {}
        });
      }
      return promise;
    },

    getOperatorList: function PartialEvaluator_getOperatorList(stream,
                                                               resources) {

      var self = this;
      var xref = this.xref;
      var handler = this.handler;

      var fnArray = [];
      var argsArray = [];
      var queue = {
        transparency: false,
        fnArray: fnArray,
        argsArray: argsArray
      };
      var dependencies = {};

      resources = resources || new Dict();
      var xobjs = resources.get('XObject') || new Dict();
      var patterns = resources.get('Pattern') || new Dict();
      // TODO(mduan): pass array of knownCommands rather than OP_MAP
      // dictionary
      var parser = new Parser(new Lexer(stream, OP_MAP), false, xref);

      var promise = new Promise();
      function parseCommands() {
        try {
          parser.restoreState();
          var args = [];
          while (true) {

            var obj = parser.getObj();

            if (isEOF(obj)) {
              break;
            }

            if (isCmd(obj)) {
              var cmd = obj.cmd;

              // Check that the command is valid
              var opSpec = OP_MAP[cmd];
              if (!opSpec) {
                warn('Unknown command "' + cmd + '"');
                continue;
              }

              var fn = opSpec.fnName;

              // Validate the number of arguments for the command
              if (opSpec.variableArgs) {
                if (args.length > opSpec.numArgs) {
                  info('Command ' + fn + ': expected [0,' + opSpec.numArgs +
                      '] args, but received ' + args.length + ' args');
                }
              } else {
                if (args.length < opSpec.numArgs) {
                  // If we receive too few args, it's not possible to possible
                  // to execute the command, so skip the command
                  info('Command ' + fn + ': because expected ' +
                       opSpec.numArgs + ' args, but received ' + args.length +
                       ' args; skipping');
                  args = [];
                  continue;
                } else if (args.length > opSpec.numArgs) {
                  info('Command ' + fn + ': expected ' + opSpec.numArgs +
                      ' args, but received ' + args.length + ' args');
                }
              }

              // TODO figure out how to type-check vararg functions

              if ((cmd == 'SCN' || cmd == 'scn') &&
                   !args[args.length - 1].code) {
                // compile tiling patterns
                var patternName = args[args.length - 1];
                // SCN/scn applies patterns along with normal colors
                var pattern;
                if (isName(patternName) &&
                    (pattern = patterns.get(patternName.name))) {

                  var dict = isStream(pattern) ? pattern.dict : pattern;
                  var typeNum = dict.get('PatternType');

                  if (typeNum == TILING_PATTERN) {
                    var patternPromise = self.handleTilingType(
                        fn, args, resources, pattern, dict);
                    fn = 'promise';
                    args = [patternPromise];
                  } else if (typeNum == SHADING_PATTERN) {
                    var shading = dict.get('Shading');
                    var matrix = dict.get('Matrix');
                    var pattern = Pattern.parseShading(shading, matrix, xref,
                                                        resources);
                    args = pattern.getIR();
                  } else {
                    error('Unkown PatternType ' + typeNum);
                  }
                }
              } else if (cmd == 'Do' && !args[0].code) {
                // eagerly compile XForm objects
                var name = args[0].name;
                var xobj = xobjs.get(name);
                if (xobj) {
                  assertWellFormed(
                      isStream(xobj), 'XObject should be a stream');

                  var type = xobj.dict.get('Subtype');
                  assertWellFormed(
                    isName(type),
                    'XObject should have a Name subtype'
                  );

                  if ('Form' == type.name) {
                    fn = 'promise';
                    args = [self.buildFormXObject(resources, xobj)];
                  } else if ('Image' == type.name) {
                    var data = self.buildPaintImageXObject(
                        resources, xobj, false);
                    Util.extendObj(dependencies, data.dependencies);
                    self.insertDependencies(queue, data.dependencies);
                    fn = data.fn;
                    args = data.args;
                  } else {
                    error('Unhandled XObject subtype ' + type.name);
                  }
                }
              } else if (cmd == 'Tf') { // eagerly collect all fonts
                fn = 'promise';
                args = [self.handleSetFont(resources, args)];
              } else if (cmd == 'EI') {
                var data = self.buildPaintImageXObject(
                    resources, args[0], true);
                Util.extendObj(dependencies, data.dependencies);
                self.insertDependencies(queue, data.dependencies);
                fn = data.fn;
                args = data.args;
              }

              switch (fn) {
                // Parse the ColorSpace data to a raw format.
                case 'setFillColorSpace':
                case 'setStrokeColorSpace':
                  args = [ColorSpace.parseToIR(args[0], xref, resources)];
                  break;
                case 'shadingFill':
                  var shadingRes = resources.get('Shading');
                  if (!shadingRes)
                    error('No shading resource found');

                  var shading = shadingRes.get(args[0].name);
                  if (!shading)
                    error('No shading object found');

                  var shadingFill = Pattern.parseShading(
                      shading, null, xref, resources);
                  var patternIR = shadingFill.getIR();
                  args = [patternIR];
                  fn = 'shadingFill';
                  break;
                case 'setGState':
                  var dictName = args[0];
                  var extGState = resources.get('ExtGState');

                  if (!isDict(extGState) || !extGState.has(dictName.name))
                    break;

                  var gState = extGState.get(dictName.name);
                  fn = 'promise';
                  args = [self.setGState(resources, gState)];
              } // switch

              fnArray.push(fn);
              argsArray.push(args);
              args = [];
              parser.saveState();
            } else if (obj !== null && obj !== undefined) {
              args.push(obj instanceof Dict ? obj.getAll() : obj);
              assertWellFormed(args.length <= 33, 'Too many arguments');
            }
          }

          var subQueuePromises = [];
          for (var i = 0; i < fnArray.length; ++i) {
            if (fnArray[i] === 'promise') {
              subQueuePromises.push(argsArray[i][0]);
            }
          }
          Promise.all(subQueuePromises).then(function(datas) {
            // TODO(mack): Optimize by using repositioning elements
            // in original queue rather than creating new queue

            for (var i = 0, n = datas.length; i < n; ++i) {
              var data = datas[i];
              var subQueue = data.queue;
              queue.transparency = subQueue.transparency || queue.transparency;
              Util.extendObj(dependencies, data.dependencies);
            }

            var newFnArray = [];
            var newArgsArray = [];
            var currOffset = 0;
            var subQueueIdx = 0;
            for (var i = 0, n = fnArray.length; i < n; ++i) {
              var offset = i + currOffset;
              if (fnArray[i] === 'promise') {
                var data = datas[subQueueIdx++];
                var subQueue = data.queue;
                var subQueueFnArray = subQueue.fnArray;
                var subQueueArgsArray = subQueue.argsArray;
                for (var j = 0, nn = subQueueFnArray.length; j < nn; ++j) {
                  newFnArray[offset + j] = subQueueFnArray[j];
                  newArgsArray[offset + j] = subQueueArgsArray[j];
                }
                currOffset += subQueueFnArray.length - 1;
              } else {
                newFnArray[offset] = fnArray[i];
                newArgsArray[offset] = argsArray[i];
              }
            }

            promise.resolve({
              queue: {
                fnArray: newFnArray,
                argsArray: newArgsArray,
                transparency: queue.transparency
              },
              dependencies: dependencies
            });
          });
        } catch (e) {
          if (!(e instanceof MissingDataException)) {
            throw e;
          }

          self.pdfManager.requestRange(e.begin, e.end).then(parseCommands);
        }
      }
      parser.saveState();
      parseCommands();

      return promise;
    },

    getTextContent: function PartialEvaluator_getTextContent(
                                                    stream, resources) {

      var SPACE_FACTOR = 0.35;
      var MULTI_SPACE_FACTOR = 1.5;
      var self = this;

      var statePromise = new Promise();

      function handleSetFont(fontName, fontRef, resources) {
        var promise = new Promise();
        self.loadFont(fontName, fontRef, self.xref, resources).then(
          function(data) {
            promise.resolve(data.font.translated);
          }
        );
        return promise;
      }

      function getBidiText(str, startLevel, vertical) {
        if (str) {
          return PDFJS.bidi(str, -1, vertical);
        }
      }

      resources = this.xref.fetchIfRef(resources) || new Dict();
      // The xobj is parsed iff it's needed, e.g. if there is a `DO` cmd.
      var xobjs = null;

      var parser = new Parser(new Lexer(stream), false);

      var chunkPromises = [];
      var fontPromise;
      function parseCommands() {
        try {
          parser.restoreState();
          var args = [];

          while (true) {
            var obj = parser.getObj();
            if (isEOF(obj)) {
              break;
            }

            if (isCmd(obj)) {
              var cmd = obj.cmd;
              switch (cmd) {
                // TODO: Add support for SAVE/RESTORE and XFORM here.
                case 'Tf':
                  fontPromise = handleSetFont(args[0].name, null, resources);
                  //.translated;
                  break;
                case 'TJ':
                  var chunkPromise = new Promise();
                  chunkPromises.push(chunkPromise);
                  fontPromise.then(function(items, chunkPromise, font) {
                    var chunk = '';
                    for (var j = 0, jj = items.length; j < jj; j++) {
                      if (typeof items[j] === 'string') {
                        chunk += fontCharsToUnicode(items[j], font);
                      } else if (items[j] < 0 && font.spaceWidth > 0) {
                        var fakeSpaces = -items[j] / font.spaceWidth;
                        if (fakeSpaces > MULTI_SPACE_FACTOR) {
                          fakeSpaces = Math.round(fakeSpaces);
                          while (fakeSpaces--) {
                            chunk += ' ';
                          }
                        } else if (fakeSpaces > SPACE_FACTOR) {
                          chunk += ' ';
                        }
                      }
                    }
                    chunkPromise.resolve(
                        getBidiText(chunk, -1, font.vertical));
                  }.bind(null, args[0], chunkPromise));
                  break;
                case 'Tj':
                  var chunkPromise = new Promise();
                  chunkPromises.push(chunkPromise);
                  fontPromise.then(function(charCodes, chunkPromise, font) {
                    var chunk = fontCharsToUnicode(charCodes, font);
                    chunkPromise.resolve(
                        getBidiText(chunk, -1, font.vertical));
                  }.bind(null, args[0], chunkPromise));
                  break;
                case '\'':
                  // For search, adding a extra white space for line breaks
                  // would be better here, but that causes too much spaces in
                  // the text-selection divs.
                  var chunkPromise = new Promise();
                  chunkPromises.push(chunkPromise);
                  fontPromise.then(function(charCodes, chunkPromise, font) {
                    var chunk = fontCharsToUnicode(charCodes, font);
                    chunkPromise.resolve(
                        getBidiText(chunk, -1, font.vertical));
                  }.bind(null, args[0], chunkPromise));
                  break;
                case '"':
                  // Note comment in "'"
                  var chunkPromise = new Promise();
                  chunkPromises.push(chunkPromise);
                  fontPromise.then(function(charCodes, chunkPromise, font) {
                    var chunk = fontCharsToUnicode(charCodes, font);
                    chunkPromise.resolve(
                        getBidiText(chunk, -1, font.vertical));
                  }.bind(null, args[2], chunkPromise));
                  break;
                case 'Do':
                  if (args[0].code) {
                    break;
                  }

                  if (!xobjs) {
                    xobjs = resources.get('XObject') || new Dict();
                  }

                  var name = args[0].name;
                  var xobj = xobjs.get(name);
                  if (!xobj)
                    break;
                  assertWellFormed(isStream(xobj),
                                   'XObject should be a stream');

                  var type = xobj.dict.get('Subtype');
                  assertWellFormed(
                    isName(type),
                    'XObject should have a Name subtype'
                  );

                  if ('Form' !== type.name)
                    break;

                  var chunkPromise = self.getTextContent(
                    xobj,
                    xobj.dict.get('Resources') || resources
                  );
                  chunkPromises.push(chunkPromise);
                  break;
                case 'gs':
                  var dictName = args[0];
                  var extGState = resources.get('ExtGState');

                  if (!isDict(extGState) || !extGState.has(dictName.name))
                    break;

                  var gsState = extGState.get(dictName.name);

                  for (var i = 0; i < gsState.length; i++) {
                    if (gsState[i] === 'Font') {
                      fontPromise = handleSetFont(
                          args[0].name, null, resources);
                    }
                  }
                  break;
              } // switch

              args = [];
              parser.saveState();
            } else if (obj !== null && obj !== undefined) {
              assertWellFormed(args.length <= 33, 'Too many arguments');
              args.push(obj);
            }
          } // while

          Promise.all(chunkPromises).then(function(datas) {
            var bidiTexts = [];
            for (var i = 0, n = datas.length; i < n; ++i) {
              var bidiText = datas[i];
              if (!bidiText) {
                continue;
              } else if (isArray(bidiText)) {
                Util.concatenateToArray(bidiTexts, bidiText);
              } else {
                bidiTexts.push(bidiText);
              }
            }
            statePromise.resolve(bidiTexts);
          });
        } catch (e) {
          if (!(e instanceof MissingDataException)) {
            throw e;
          }

          self.pdfManager.requestRange(e.begin, e.end).then(parseCommands);
        }
      }
      parser.saveState();
      parseCommands();

      return statePromise;
    },

    extractDataStructures: function
      partialEvaluatorExtractDataStructures(dict, baseDict,
                                            xref, properties) {
      // 9.10.2
      var toUnicode = dict.get('ToUnicode') ||
        baseDict.get('ToUnicode');
      if (toUnicode)
        properties.toUnicode = this.readToUnicode(toUnicode, xref, properties);

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
        if (isStream(cidToGidMap))
          properties.cidToGidMap = this.readCidToGidMap(cidToGidMap);
      }

      // Based on 9.6.6 of the spec the encoding can come from multiple places
      // but should be prioritized in the following order:
      // 1. Encoding dictionary
      // 2. Encoding within font file (Type1 or Type1C)
      // 3. Default (depends on font type)
      // Differences applied to the above.
      // Note: we don't fill in the encoding from the font file(2) here but use
      // the flag overridableEncoding to signal that the font can override the
      // encoding if it has one built in.
      var overridableEncoding = true;
      var hasEncoding = false;
      var flags = properties.flags;
      var differences = [];
      var baseEncoding = properties.type === 'TrueType' ?
                          Encodings.WinAnsiEncoding :
                          Encodings.StandardEncoding;
      // The Symbolic attribute can be misused for regular fonts
      // Heuristic: we have to check if the font is a standard one also
      if (!!(flags & FontFlags.Symbolic)) {
        baseEncoding = !properties.file ? Encodings.symbolsEncoding :
                                          Encodings.MacRomanEncoding;
      }
      if (dict.has('Encoding')) {
        var encoding = dict.get('Encoding');
        if (isDict(encoding)) {
          var baseName = encoding.get('BaseEncoding');
          if (baseName) {
            overridableEncoding = false;
            hasEncoding = true;
            baseEncoding = Encodings[baseName.name];
          }

          // Load the differences between the base and original
          if (encoding.has('Differences')) {
            hasEncoding = true;
            var diffEncoding = encoding.get('Differences');
            var index = 0;
            for (var j = 0, jj = diffEncoding.length; j < jj; j++) {
              var data = diffEncoding[j];
              if (isNum(data))
                index = data;
              else
                differences[index++] = data.name;
            }
          }
        } else if (isName(encoding)) {
          overridableEncoding = false;
          hasEncoding = true;
          baseEncoding = Encodings[encoding.name];
        } else {
          error('Encoding is not a Name nor a Dict');
        }
      }

      properties.differences = differences;
      properties.baseEncoding = baseEncoding;
      properties.hasEncoding = hasEncoding;
      properties.overridableEncoding = overridableEncoding;
    },

    readToUnicode: function PartialEvaluator_readToUnicode(toUnicode, xref,
                                                           properties) {
      var cmapObj = toUnicode;
      var charToUnicode = [];
      if (isName(cmapObj)) {
        var isIdentityMap = cmapObj.name.substr(0, 9) == 'Identity-';
        if (!isIdentityMap)
          error('ToUnicode file cmap translation not implemented');
      } else if (isStream(cmapObj)) {
        var tokens = [];
        var token = '';
        var beginArrayToken = {};

        var cmap = cmapObj.getBytes(cmapObj.length);
        for (var i = 0, ii = cmap.length; i < ii; i++) {
          var octet = cmap[i];
          if (octet == 0x20 || octet == 0x0D || octet == 0x0A ||
              octet == 0x3C || octet == 0x5B || octet == 0x5D) {
            switch (token) {
              case 'usecmap':
                error('usecmap is not implemented');
                break;

              case 'beginbfchar':
              case 'beginbfrange':
              case 'begincidchar':
              case 'begincidrange':
                token = '';
                tokens = [];
                break;

              case 'endcidrange':
              case 'endbfrange':
                for (var j = 0, jj = tokens.length; j < jj; j += 3) {
                  var startRange = tokens[j];
                  var endRange = tokens[j + 1];
                  var code = tokens[j + 2];
                  if (code == 0xFFFF) {
                    // CMap is broken, assuming code == startRange
                    code = startRange;
                  }
                  if (isArray(code)) {
                    var codeindex = 0;
                    while (startRange <= endRange) {
                      charToUnicode[startRange] = code[codeindex++];
                      ++startRange;
                    }
                  } else {
                    while (startRange <= endRange) {
                      charToUnicode[startRange] = code++;
                      ++startRange;
                    }
                  }
                }
                break;

              case 'endcidchar':
              case 'endbfchar':
                for (var j = 0, jj = tokens.length; j < jj; j += 2) {
                  var index = tokens[j];
                  var code = tokens[j + 1];
                  charToUnicode[index] = code;
                }
                break;

              case '':
                break;

              default:
                if (token[0] >= '0' && token[0] <= '9')
                  token = parseInt(token, 10); // a number
                tokens.push(token);
                token = '';
            }
            switch (octet) {
              case 0x5B:
                // begin list parsing
                tokens.push(beginArrayToken);
                break;
              case 0x5D:
                // collect array items
                var items = [], item;
                while (tokens.length &&
                       (item = tokens.pop()) != beginArrayToken)
                  items.unshift(item);
                tokens.push(items);
                break;
            }
          } else if (octet == 0x3E) {
            if (token.length) {
              // Heuristic: guessing chars size by checking numbers sizes
              // in the CMap entries.
              if (token.length == 2 && properties.composite)
                properties.wideChars = false;

              if (token.length <= 4) {
                // parsing hex number
                tokens.push(parseInt(token, 16));
                token = '';
              } else {
                // parsing hex UTF-16BE numbers
                var str = [];
                for (var k = 0, kk = token.length; k < kk; k += 4) {
                  var b = parseInt(token.substr(k, 4), 16);
                  if (b <= 0x10) {
                    k += 4;
                    b = (b << 16) | parseInt(token.substr(k, 4), 16);
                    b -= 0x10000;
                    str.push(0xD800 | (b >> 10));
                    str.push(0xDC00 | (b & 0x3FF));
                    break;
                  }
                  str.push(b);
                }
                tokens.push(String.fromCharCode.apply(String, str));
                token = '';
              }
            }
          } else {
            token += String.fromCharCode(octet);
          }
        }
      }
      return charToUnicode;
    },
    readCidToGidMap: function PartialEvaluator_readCidToGidMap(cidToGidStream) {
      // Extract the encoding from the CIDToGIDMap
      var glyphsData = cidToGidStream.getBytes();

      // Set encoding 0 to later verify the font has an encoding
      var result = [];
      for (var j = 0, jj = glyphsData.length; j < jj; j++) {
        var glyphID = (glyphsData[j++] << 8) | glyphsData[j];
        if (glyphID === 0)
          continue;

        var code = j >> 1;
        result[code] = glyphID;
      }
      return result;
    },

    extractWidths: function PartialEvaluator_extractWidths(dict,
                                                   xref,
                                                   descriptor,
                                                   properties) {
      var glyphsWidths = [];
      var defaultWidth = 0;
      var glyphsVMetrics = [];
      var defaultVMetrics;
      if (properties.composite) {
        defaultWidth = dict.get('DW') || 1000;

        var widths = dict.get('W');
        if (widths) {
          for (var i = 0, ii = widths.length; i < ii; i++) {
            var start = widths[i++];
            var code = xref.fetchIfRef(widths[i]);
            if (isArray(code)) {
              for (var j = 0, jj = code.length; j < jj; j++)
                glyphsWidths[start++] = code[j];
            } else {
              var width = widths[++i];
              for (var j = start; j <= code; j++)
                glyphsWidths[j] = width;
            }
          }
        }

        if (properties.vertical) {
          var vmetrics = dict.get('DW2') || [880, -1000];
          defaultVMetrics = [vmetrics[1], defaultWidth * 0.5, vmetrics[0]];
          vmetrics = dict.get('W2');
          if (vmetrics) {
            for (var i = 0, ii = vmetrics.length; i < ii; i++) {
              var start = vmetrics[i++];
              var code = xref.fetchIfRef(vmetrics[i]);
              if (isArray(code)) {
                for (var j = 0, jj = code.length; j < jj; j++)
                  glyphsVMetrics[start++] = [code[j++], code[j++], code[j]];
              } else {
                var vmetric = [vmetrics[++i], vmetrics[++i], vmetrics[++i]];
                for (var j = start; j <= code; j++)
                  glyphsVMetrics[j] = vmetric;
              }
            }
          }
        }
      } else {
        var firstChar = properties.firstChar;
        var widths = dict.get('Widths');
        if (widths) {
          var j = firstChar;
          for (var i = 0, ii = widths.length; i < ii; i++)
            glyphsWidths[j++] = widths[i];
          defaultWidth = parseFloat(descriptor.get('MissingWidth')) || 0;
        } else {
          // Trying get the BaseFont metrics (see comment above).
          var baseFontName = dict.get('BaseFont');
          if (isName(baseFontName)) {
            var metrics = this.getBaseFontMetrics(baseFontName.name);

            glyphsWidths = metrics.widths;
            defaultWidth = metrics.defaultWidth;
          }
        }
      }

      // Heuristic: detection of monospace font by checking all non-zero widths
      var isMonospace = true, firstWidth = defaultWidth;
      for (var glyph in glyphsWidths) {
        var glyphWidth = glyphsWidths[glyph];
        if (!glyphWidth)
          continue;
        if (!firstWidth) {
          firstWidth = glyphWidth;
          continue;
        }
        if (firstWidth != glyphWidth) {
          isMonospace = false;
          break;
        }
      }
      if (isMonospace)
        properties.flags |= FontFlags.FixedPitch;

      properties.defaultWidth = defaultWidth;
      properties.widths = glyphsWidths;
      properties.defaultVMetrics = defaultVMetrics;
      properties.vmetrics = glyphsVMetrics;
    },

    isSerifFont: function PartialEvaluator_isSerifFont(baseFontName) {

      // Simulating descriptor flags attribute
      var fontNameWoStyle = baseFontName.split('-')[0];
      return (fontNameWoStyle in serifFonts) ||
          (fontNameWoStyle.search(/serif/gi) !== -1);
    },

    getBaseFontMetrics: function PartialEvaluator_getBaseFontMetrics(name) {
      var defaultWidth = 0, widths = [], monospace = false;

      var lookupName = stdFontMap[name] || name;

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
        widths = glyphWidths;
      }

      return {
        defaultWidth: defaultWidth,
        monospace: monospace,
        widths: widths
      };
    },

    translateFont: function PartialEvaluator_translateFont(dict,
                                                           xref) {
      var baseDict = dict;
      var type = dict.get('Subtype');
      assertWellFormed(isName(type), 'invalid font Subtype');

      var composite = false;
      if (type.name == 'Type0') {
        // If font is a composite
        //  - get the descendant font
        //  - set the type according to the descendant font
        //  - get the FontDescriptor from the descendant font
        var df = dict.get('DescendantFonts');
        if (!df)
          error('Descendant fonts are not specified');

        dict = isArray(df) ? xref.fetchIfRef(df[0]) : df;

        type = dict.get('Subtype');
        assertWellFormed(isName(type), 'invalid font Subtype');
        composite = true;
      }
      var maxCharIndex = composite ? 0xFFFF : 0xFF;

      var descriptor = dict.get('FontDescriptor');
      if (!descriptor) {
        if (type.name == 'Type3') {
          // FontDescriptor is only required for Type3 fonts when the document
          // is a tagged pdf. Create a barbebones one to get by.
          descriptor = new Dict();
          descriptor.set('FontName', new Name(type.name));
        } else {
          // Before PDF 1.5 if the font was one of the base 14 fonts, having a
          // FontDescriptor was not required.
          // This case is here for compatibility.
          var baseFontName = dict.get('BaseFont');
          if (!isName(baseFontName))
            error('Base font is not specified');

          // Using base font name as a font name.
          baseFontName = baseFontName.name.replace(/[,_]/g, '-');
          var metrics = this.getBaseFontMetrics(baseFontName);

          // Simulating descriptor flags attribute
          var fontNameWoStyle = baseFontName.split('-')[0];
          var flags = (
            this.isSerifFont(fontNameWoStyle) ? FontFlags.Serif : 0) |
            (metrics.monospace ? FontFlags.FixedPitch : 0) |
            (symbolsFonts[fontNameWoStyle] ? FontFlags.Symbolic :
            FontFlags.Nonsymbolic);

          var properties = {
            type: type.name,
            widths: metrics.widths,
            defaultWidth: metrics.defaultWidth,
            flags: flags,
            firstChar: 0,
            lastChar: maxCharIndex
          };
          this.extractDataStructures(dict, dict, xref, properties);

          return new Font(baseFontName, null, properties);
        }
      }

      // According to the spec if 'FontDescriptor' is declared, 'FirstChar',
      // 'LastChar' and 'Widths' should exist too, but some PDF encoders seem
      // to ignore this rule when a variant of a standart font is used.
      // TODO Fill the width array depending on which of the base font this is
      // a variant.
      var firstChar = dict.get('FirstChar') || 0;
      var lastChar = dict.get('LastChar') || maxCharIndex;

      var fontName = descriptor.get('FontName');
      var baseFont = dict.get('BaseFont');
      // Some bad pdf's have a string as the font name.
      if (isString(fontName)) {
        fontName = new Name(fontName);
      }
      if (isString(baseFont)) {
        baseFont = new Name(baseFont);
      }

      if (type.name !== 'Type3') {
        var fontNameStr = fontName && fontName.name;
        var baseFontStr = baseFont && baseFont.name;
        if (fontNameStr !== baseFontStr) {
          info('The FontDescriptor\'s FontName is "' + fontNameStr +
               '" but should be the same as the Font\'s BaseFont "' +
               baseFontStr + '"');
        }
      }
      fontName = fontName || baseFont;

      assertWellFormed(isName(fontName), 'invalid font name');

      var fontFile = descriptor.get('FontFile', 'FontFile2', 'FontFile3');
      if (fontFile) {
        if (fontFile.dict) {
          var subtype = fontFile.dict.get('Subtype');
          if (subtype)
            subtype = subtype.name;

          var length1 = fontFile.dict.get('Length1');

          var length2 = fontFile.dict.get('Length2');
        }
      }

      var properties = {
        type: type.name,
        subtype: subtype,
        file: fontFile,
        length1: length1,
        length2: length2,
        loadedName: baseDict.loadedName,
        composite: composite,
        wideChars: composite,
        fixedPitch: false,
        fontMatrix: dict.get('FontMatrix') || FONT_IDENTITY_MATRIX,
        firstChar: firstChar || 0,
        lastChar: lastChar || maxCharIndex,
        bbox: descriptor.get('FontBBox'),
        ascent: descriptor.get('Ascent'),
        descent: descriptor.get('Descent'),
        xHeight: descriptor.get('XHeight'),
        capHeight: descriptor.get('CapHeight'),
        flags: descriptor.get('Flags'),
        italicAngle: descriptor.get('ItalicAngle'),
        coded: false
      };

      if (composite) {
        var cidEncoding = baseDict.get('Encoding');
        if (isName(cidEncoding)) {
          properties.cidEncoding = cidEncoding.name;
          properties.vertical = /-V$/.test(cidEncoding.name);
        }
      }
      this.extractWidths(dict, xref, descriptor, properties);
      this.extractDataStructures(dict, baseDict, xref, properties);

      if (type.name === 'Type3') {
        properties.coded = true;
      }

      return new Font(fontName.name, fontFile, properties);
    }
  };

  PartialEvaluator.optimizeQueue =
      function PartialEvaluator_optimizeQueue(queue) {

    var fnArray = queue.fnArray, argsArray = queue.argsArray;
    // grouping paintInlineImageXObject's into paintInlineImageXObjectGroup
    // searching for (save, transform, paintInlineImageXObject, restore)+
    var MIN_IMAGES_IN_INLINE_IMAGES_BLOCK = 10;
    var MAX_IMAGES_IN_INLINE_IMAGES_BLOCK = 200;
    var MAX_WIDTH = 1000;
    var IMAGE_PADDING = 1;
    for (var i = 0, ii = fnArray.length; i < ii; i++) {
      if (fnArray[i] === 'paintInlineImageXObject' &&
          fnArray[i - 2] === 'save' && fnArray[i - 1] === 'transform' &&
          fnArray[i + 1] === 'restore') {
        var j = i - 2;
        for (i += 2; i < ii && fnArray[i - 4] === fnArray[i]; i++) {
        }
        var count = Math.min((i - j) >> 2,
                             MAX_IMAGES_IN_INLINE_IMAGES_BLOCK);
        if (count < MIN_IMAGES_IN_INLINE_IMAGES_BLOCK) {
          continue;
        }
        // assuming that heights of those image is too small (~1 pixel)
        // packing as much as possible by lines
        var maxX = 0;
        var map = [], maxLineHeight = 0;
        var currentX = IMAGE_PADDING, currentY = IMAGE_PADDING;
        for (var q = 0; q < count; q++) {
          var transform = argsArray[j + (q << 2) + 1];
          var img = argsArray[j + (q << 2) + 2][0];
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
        for (var q = 0; q < count; q++) {
          var data = argsArray[j + (q << 2) + 2][0].data;
          // copy image by lines and extends pixels into padding
          var rowSize = map[q].w << 2;
          var dataOffset = 0;
          var offset = (map[q].x + map[q].y * imgWidth) << 2;
          imgData.set(
            data.subarray(0, rowSize), offset - imgRowSize);
          for (var k = 0, kk = map[q].h; k < kk; k++) {
            imgData.set(
              data.subarray(dataOffset, dataOffset + rowSize), offset);
            dataOffset += rowSize;
            offset += imgRowSize;
          }
          imgData.set(
            data.subarray(dataOffset - rowSize, dataOffset), offset);
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
        // replacing queue items
        fnArray.splice(j, count * 4, ['paintInlineImageXObjectGroup']);
        argsArray.splice(j, count * 4,
          [{width: imgWidth, height: imgHeight, data: imgData}, map]);
        i = j;
        ii = fnArray.length;
      }
    }
    // grouping paintImageMaskXObject's into paintImageMaskXObjectGroup
    // searching for (save, transform, paintImageMaskXObject, restore)+
    var MIN_IMAGES_IN_MASKS_BLOCK = 10;
    var MAX_IMAGES_IN_MASKS_BLOCK = 100;
    for (var i = 0, ii = fnArray.length; i < ii; i++) {
      if (fnArray[i] === 'paintImageMaskXObject' &&
          fnArray[i - 2] === 'save' && fnArray[i - 1] === 'transform' &&
          fnArray[i + 1] === 'restore') {
        var j = i - 2;
        for (i += 2; i < ii && fnArray[i - 4] === fnArray[i]; i++) {
        }
        var count = Math.min((i - j) >> 2,
                             MAX_IMAGES_IN_MASKS_BLOCK);
        if (count < MIN_IMAGES_IN_MASKS_BLOCK) {
          continue;
        }
        var images = [];
        for (var q = 0; q < count; q++) {
          var transform = argsArray[j + (q << 2) + 1];
          var maskParams = argsArray[j + (q << 2) + 2];
          images.push({data: maskParams[0], width: maskParams[2],
            height: maskParams[3], transform: transform,
            inverseDecode: maskParams[1]});
        }
        // replacing queue items
        fnArray.splice(j, count * 4, ['paintImageMaskXObjectGroup']);
        argsArray.splice(j, count * 4, [images]);
        i = j;
        ii = fnArray.length;
      }
    }
  };


  return PartialEvaluator;
})();

var EvalState = (function EvalStateClosure() {
  function EvalState() {
    // Are soft masks and alpha values shapes or opacities?
    this.alphaIsShape = false;
    this.fontSize = 0;
    this.textMatrix = IDENTITY_MATRIX;
    this.leading = 0;
    // Start of text line (in text coordinates)
    this.lineX = 0;
    this.lineY = 0;
    // Character and word spacing
    this.charSpacing = 0;
    this.wordSpacing = 0;
    this.textHScale = 1;
    // Color spaces
    this.fillColorSpace = null;
    this.strokeColorSpace = null;
  }
  EvalState.prototype = {
  };
  return EvalState;
})();

