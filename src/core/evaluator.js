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
           info, isArray, isCmd, isDict, isEOF, isName, isNum,
           isStream, isString, JpegStream, Lexer, Metrics, Name, Parser,
           Pattern, PDFImage, PDFJS, serifFonts, stdFontMap, symbolsFonts,
           TilingPattern, TODO, warn, Util, Promise,
           RefSetCache, isRef, TextRenderingMode */

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
    this.fontCache = new RefSetCache();
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
    EI: { fnName: 'endInlineImage', numArgs: 1, variableArgs: false },

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

  PartialEvaluator.prototype = {
    hasBlendModes: function PartialEvaluator_hasBlendModes(resources) {
      if (!isDict(resources)) {
        return false;
      }

      var nodes = [resources];
      while (nodes.length) {
        var node = nodes.shift();
        // First check the current resources for blend modes.
        var graphicStates = node.get('ExtGState');
        if (isDict(graphicStates)) {
          graphicStates = graphicStates.getAll();
          for (var key in graphicStates) {
            var graphicState = graphicStates[key];
            var bm = graphicState['BM'];
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
        xObjects = xObjects.getAll();
        for (var key in xObjects) {
          var xObject = xObjects[key];
          if (!isStream(xObject)) {
            continue;
          }
          var xResources = xObject.dict.get('Resources');
          if (isDict(xResources)) {
            nodes.push(xResources);
          }
        }
      }
      return false;
    },

    buildFormXObject: function PartialEvaluator_buildFormXObject(resources,
                                                                 xobj, smask,
                                                                 operatorList) {
      var self = this;

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
        operatorList.addOp('beginGroup', [groupOptions]);
      }

      operatorList.addOp('paintFormXObjectBegin', [matrix, bbox]);

      this.getOperatorList(xobj, xobj.dict.get('Resources') || resources,
                           operatorList);
      operatorList.addOp('paintFormXObjectEnd', []);

      if (group) {
        operatorList.addOp('endGroup', [groupOptions]);
      }
    },

    buildPaintImageXObject: function PartialEvaluator_buildPaintImageXObject(
                                resources, image, inline, operatorList) {
      var self = this;
      var dict = image.dict;
      var w = dict.get('Width', 'W');
      var h = dict.get('Height', 'H');

      if (PDFJS.maxImageSize !== -1 && w * h > PDFJS.maxImageSize) {
        warn('Image exceeded maximum allowed size and was removed.');
        return;
      }

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

        operatorList.addOp('paintImageMaskXObject',
          [PDFImage.createMask(imgArray, width, height,
                                            inverseDecode)]
        );
        return;
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
        operatorList.addOp('paintInlineImageXObject', [imgData]);
        return;
      }

      // If there is no imageMask, create the PDFImage and a lot
      // of image processing can be done here.
      var uniquePrefix = this.uniquePrefix || '';
      var objId = 'img_' + uniquePrefix + (++this.idCounters.obj);
      operatorList.addDependency(objId);
      var args = [objId, w, h];

      if (!softMask && !mask && image instanceof JpegStream &&
          image.isNativelySupported(this.xref, resources)) {
        // These JPEGs don't need any more processing so we can just send it.
        operatorList.addOp('paintJpegXObject', args);
        this.handler.send(
            'obj', [objId, this.pageIndex, 'JpegStream', image.getIR()]);
        return;
      }


      PDFImage.buildImage(function(imageObj) {
          var imgData = imageObj.getImageData();
          self.handler.send('obj', [objId, self.pageIndex, 'Image', imgData]);
        }, self.handler, self.xref, resources, image, inline);

      operatorList.addOp('paintImageXObject', args);
    },

    handleTilingType: function PartialEvaluator_handleTilingType(
                          fn, args, resources, pattern, patternDict,
                          operatorList) {
      // Create an IR of the pattern code.
      var tilingOpList = this.getOperatorList(pattern,
                                  patternDict.get('Resources') || resources);
      // Add the dependencies to the parent operator list so they are resolved
      // before sub operator list is executed synchronously.
      operatorList.addDependencies(tilingOpList.dependencies);
      operatorList.addOp(fn, TilingPattern.getIR({
                               fnArray: tilingOpList.fnArray,
                               argsArray: tilingOpList.argsArray
                              }, patternDict, args));
    },

    handleSetFont: function PartialEvaluator_handleSetFont(
                      resources, fontArgs, fontRef, operatorList) {

      // TODO(mack): Not needed?
      var fontName;
      if (fontArgs) {
        fontArgs = fontArgs.slice();
        fontName = fontArgs[0].name;
      }
      var self = this;
      var font = this.loadFont(fontName, fontRef, this.xref, resources,
                               operatorList);
      this.state.font = font;
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

      return loadedName;
    },

    handleText: function PartialEvaluator_handleText(chars) {
      var font = this.state.font.translated;
      var glyphs = font.charsToGlyphs(chars);
      var isAddToPathSet = !!(this.state.textRenderingMode &
                              TextRenderingMode.ADD_TO_PATH_FLAG);
      if (font.data && (isAddToPathSet || PDFJS.disableFontFace)) {
        for (var i = 0; i < glyphs.length; i++) {
          if (glyphs[i] === null) {
            continue;
          }
          var fontChar = glyphs[i].fontChar;
          if (!font.renderer.hasBuiltPath(fontChar)) {
            var path = font.renderer.getPathJs(fontChar);
            this.handler.send('commonobj', [
              font.loadedName + '_path_' + fontChar,
              'FontPath',
              path
            ]);
          }
        }
      }

      return glyphs;
    },

    setGState: function PartialEvaluator_setGState(resources, gState,
                                                   operatorList) {

      var self = this;
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
            var loadedName = self.handleSetFont(resources, null, value[0],
                                                operatorList);
            operatorList.addDependency(loadedName);
            gStateObj.push([key, [loadedName, value[1]]]);
            break;
          case 'BM':
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

      operatorList.addOp('setGState', [gStateObj]);
    },

    loadFont: function PartialEvaluator_loadFont(fontName, font, xref,
                                                 resources,
                                                 parentOperatorList) {

      function errorFont() {
        return {
          translated: new ErrorFont('Font ' + fontName + ' is not available'),
          loadedName: 'g_font_error'
        };
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
      if (this.fontCache.has(fontRef)) {
        return this.fontCache.get(fontRef);
      }


      font = xref.fetchIfRef(fontRef);
      if (!isDict(font)) {
        return errorFont();
      }
      this.fontCache.put(fontRef, font);

      // keep track of each font we translated so the caller can
      // load them asynchronously before calling display on a page
      font.loadedName = 'g_font_' + fontRef.num + '_' + fontRef.gen;

      if (!font.translated) {
        var translated;
        try {
          translated = this.translateFont(font, xref);
        } catch (e) {
          translated = new ErrorFont(e instanceof Error ? e.message : e);
        }
        font.translated = translated;
      }

      if (font.translated.loadCharProcs) {
        var charProcs = font.get('CharProcs').getAll();
        var fontResources = font.get('Resources') || resources;
        var charProcKeys = Object.keys(charProcs);
        var charProcOperatorList = {};
        for (var i = 0, n = charProcKeys.length; i < n; ++i) {
          var key = charProcKeys[i];
          var glyphStream = charProcs[key];
          var operatorList = this.getOperatorList(glyphStream, fontResources);
          charProcOperatorList[key] = operatorList.getIR();
          if (!parentOperatorList) {
            continue;
          }
          // Add the dependencies to the parent operator list so they are
          // resolved before sub operator list is executed synchronously.
          parentOperatorList.addDependencies(charProcOperatorList.dependencies);
        }
        font.translated.charProcOperatorList = charProcOperatorList;
        font.loaded = true;
      } else {
        font.loaded = true;
      }
      return font;
    },

    getOperatorList: function PartialEvaluator_getOperatorList(stream,
                                                               resources,
                                                               operatorList) {

      var self = this;
      var xref = this.xref;
      var handler = this.handler;

      operatorList = operatorList || new OperatorList();

      resources = resources || new Dict();
      var xobjs = resources.get('XObject') || new Dict();
      var patterns = resources.get('Pattern') || new Dict();
      // TODO(mduan): pass array of knownCommands rather than OP_MAP
      // dictionary
      var parser = new Parser(new Lexer(stream, OP_MAP), false, xref);

      var promise = new Promise();
      var args = [];
      nextOp:
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
                self.handleTilingType(fn, args, resources, pattern, dict,
                                      operatorList);
                args = [];
                continue;
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
                self.buildFormXObject(resources, xobj, null, operatorList);
                args = [];
                continue;
              } else if ('Image' == type.name) {
                self.buildPaintImageXObject(resources, xobj, false,
                                            operatorList);
                args = [];
                continue;
              } else {
                error('Unhandled XObject subtype ' + type.name);
              }
            }
          } else if (cmd == 'Tf') { // eagerly collect all fonts
            var loadedName = self.handleSetFont(resources, args, null,
                                                operatorList);
            operatorList.addDependency(loadedName);
            fn = 'setFont';
            args[0] = loadedName;
          } else if (cmd == 'EI') {
            self.buildPaintImageXObject(resources, args[0], true, operatorList);
            args = [];
            continue;
          } else if (cmd === 'q') { // save
            var old = this.state;
            this.stateStack.push(this.state);
            this.state = old.clone();
          } else if (cmd === 'Q') { // restore
            var prev = this.stateStack.pop();
            if (prev) {
              this.state = prev;
            }
          } else if (cmd === 'Tj') { // showText
            args[0] = this.handleText(args[0]);
          } else if (cmd === 'TJ') { // showSpacedText
            var arr = args[0];
            var arrLength = arr.length;
            for (var i = 0; i < arrLength; ++i) {
              if (isString(arr[i])) {
                arr[i] = this.handleText(arr[i]);
              }
            }
          } else if (cmd === '\'') { // nextLineShowText
            args[0] = this.handleText(args[0]);
          } else if (cmd === '"') { // nextLineSetSpacingShowText
            args[2] = this.handleText(args[2]);
          } else if (cmd === 'Tr') { // setTextRenderingMode
            this.state.textRenderingMode = args[0];
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
              self.setGState(resources, gState, operatorList);
              args = [];
              continue nextOp;
          } // switch

          operatorList.addOp(fn, args);
          args = [];
          parser.saveState();
        } else if (obj !== null && obj !== undefined) {
          args.push(obj instanceof Dict ? obj.getAll() : obj);
          assertWellFormed(args.length <= 33, 'Too many arguments');
        }
      }

      return operatorList;
    },

    getTextContent: function PartialEvaluator_getTextContent(
                                                    stream, resources, state) {

      var bidiTexts;
      var SPACE_FACTOR = 0.35;
      var MULTI_SPACE_FACTOR = 1.5;
      var textState;

      if (!state) {
        textState = new TextState();
        bidiTexts = [];
        state = {
          textState: textState,
          bidiTexts: bidiTexts
        };
      } else {
        bidiTexts = state.bidiTexts;
        textState = state.textState;
      }

      var self = this;
      var xref = this.xref;

      function handleSetFont(fontName, fontRef) {
        return self.loadFont(fontName, fontRef, xref, resources, null);
      }

      resources = xref.fetchIfRef(resources) || new Dict();
      // The xobj is parsed iff it's needed, e.g. if there is a `DO` cmd.
      var xobjs = null;

      var parser = new Parser(new Lexer(stream), false);
      var res = resources;
      var args = [], obj;

      var chunk = '';
      var font = null;
      var charSpace = 0, wordSpace = 0;
      while (!isEOF(obj = parser.getObj())) {
        if (isCmd(obj)) {
          var cmd = obj.cmd;
          switch (cmd) {
            // TODO: Add support for SAVE/RESTORE and XFORM here.
            case 'Tf':
              font = handleSetFont(args[0].name).translated;
              textState.fontSize = args[1];
              break;
            case 'Ts':
              textState.textRise = args[0];
              break;
            case 'Tz':
              textState.textHScale = args[0] / 100;
              break;
            case 'TL':
              textState.leading = args[0];
              break;
            case 'Td':
              textState.translateTextMatrix(args[0], args[1]);
              break;
            case 'TD':
              textState.leading = -args[1];
              textState.translateTextMatrix(args[0], args[1]);
              break;
            case 'T*':
              textState.translateTextMatrix(0, -textState.leading);
              break;
            case 'Tm':
              textState.setTextMatrix(args[0], args[1],
                                       args[2], args[3], args[4], args[5]);
              break;
            case 'Tc':
              charSpace = args[0];
              break;
            case 'Tw':
              wordSpace = args[0];
              break;
            case 'q':
              textState.push();
              break;
            case 'Q':
              textState.pop();
              break;
            case 'BT':
              textState.initialiseTextObj();
              break;
            case 'cm':
              textState.transformCTM(args[0], args[1], args[2],
                                args[3], args[4], args[5]);
              break;
            case 'TJ':
              var items = args[0];
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
              break;
            case 'Tj':
              chunk += fontCharsToUnicode(args[0], font);
              break;
            case '\'':
              // For search, adding a extra white space for line breaks would be
              // better here, but that causes too much spaces in the
              // text-selection divs.
              chunk += fontCharsToUnicode(args[0], font);
              break;
            case '"':
              // Note comment in "'"
              chunk += fontCharsToUnicode(args[2], font);
              break;
            case 'Do':
              // Set the chunk such that the following if won't add something
              // to the state.
              chunk = '';

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
              assertWellFormed(isStream(xobj), 'XObject should be a stream');

              var type = xobj.dict.get('Subtype');
              assertWellFormed(
                isName(type),
                'XObject should have a Name subtype'
              );

              if ('Form' !== type.name)
                break;

              state = this.getTextContent(
                xobj,
                xobj.dict.get('Resources') || resources,
                state
              );
              break;
            case 'gs':
              var dictName = args[0];
              var extGState = resources.get('ExtGState');

              if (!isDict(extGState) || !extGState.has(dictName.name))
                break;

              var gsState = extGState.get(dictName.name);

              for (var i = 0; i < gsState.length; i++) {
                if (gsState[i] === 'Font') {
                  font = handleSetFont(args[0].name).translated;
                }
              }
              break;
          } // switch

          if (chunk !== '') {
            var bidiText = PDFJS.bidi(chunk, -1, font.vertical);
            var renderParams = textState.calcRenderParams();
            bidiText.x = renderParams.renderMatrix[4] - (textState.fontSize *
                           renderParams.vScale * Math.sin(renderParams.angle));
            bidiText.y = renderParams.renderMatrix[5] + (textState.fontSize *
                           renderParams.vScale * Math.cos(renderParams.angle));
            if (bidiText.dir == 'ttb') {
              bidiText.x += renderParams.vScale / 2;
              bidiText.y -= renderParams.vScale;
            }
            bidiTexts.push(bidiText);

            chunk = '';
          }

          args = [];
        } else if (obj !== null && obj !== undefined) {
          assertWellFormed(args.length <= 33, 'Too many arguments');
          args.push(obj);
        }
      } // while

      return state;
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
          var maskParams = argsArray[j + (q << 2) + 2][0];
          images.push({data: maskParams.data, width: maskParams.width,
            height: maskParams.height, transform: transform});
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


var OperatorList = (function OperatorListClosure() {
  var CHUNK_SIZE = 100;

  function OperatorList(messageHandler, pageIndex) {
    this.messageHandler = messageHandler;
    this.fnArray = [];
    this.argsArray = [];
    this.dependencies = {},
    this.pageIndex = pageIndex;
  }

  OperatorList.prototype = {

    addOp: function(fn, args) {
      this.fnArray.push(fn);
      this.argsArray.push(args);
      if (this.messageHandler && this.fnArray.length >= CHUNK_SIZE) {
        this.flush();
      }
    },

    addDependency: function(dependency) {
      if (dependency in this.dependencies) {
        return;
      }
      this.dependencies[dependency] = true;
      this.addOp('dependency', [dependency]);
    },

    addDependencies: function(dependencies) {
      for (var key in dependencies) {
        this.addDependency(key);
      }
    },

    addOpList: function(opList) {
      Util.concatenateToArray(this.fnArray, opList.fnArray);
      Util.concatenateToArray(this.argsArray, opList.argsArray);
      Util.extendObj(this.dependencies, opList.dependencies);
    },

    getIR: function() {
      return {
        fnArray: this.fnArray,
        argsArray: this.argsArray
      };
    },

    flush: function(lastChunk) {
      PartialEvaluator.optimizeQueue(this);
      this.messageHandler.send('RenderPageChunk', {
        operatorList: {
          fnArray: this.fnArray,
          argsArray: this.argsArray,
          lastChunk: lastChunk
        },
        pageIndex: this.pageIndex
      });
      this.dependencies = [];
      this.fnArray = [];
      this.argsArray = [];
    }
  };

  return OperatorList;
})();
var TextState = (function TextStateClosure() {
  function TextState() {
    this.fontSize = 0;
    this.ctm = [1, 0, 0, 1, 0, 0];
    this.textMatrix = [1, 0, 0, 1, 0, 0];
    this.stateStack = [];
    //textState variables
    this.leading = 0;
    this.textHScale = 1;
    this.textRise = 0;
  }
  TextState.prototype = {
    push: function TextState_push() {
      this.stateStack.push(this.ctm.slice());
    },
    pop: function TextStae_pop() {
      this.ctm = this.stateStack.pop();
    },
    initialiseTextObj: function TextState_initialiseTextObj() {
      var m = this.textMatrix;
      m[0] = 1, m[1] = 0, m[2] = 0, m[3] = 1, m[4] = 0, m[5] = 0;
    },
    setTextMatrix: function TextState_setTextMatrix(a, b, c, d, e, f) {
      var m = this.textMatrix;
      m[0] = a, m[1] = b, m[2] = c, m[3] = d, m[4] = e, m[5] = f;
    },
    transformCTM: function TextState_transformCTM(a, b, c, d, e, f) {
      var m = this.ctm;
      var m0 = m[0], m1 = m[1], m2 = m[2], m3 = m[3], m4 = m[4], m5 = m[5];
      m[0] = m0 * a + m2 * b;
      m[1] = m1 * a + m3 * b;
      m[2] = m0 * c + m2 * d;
      m[3] = m1 * c + m3 * d;
      m[4] = m0 * e + m2 * f + m4;
      m[5] = m1 * e + m3 * f + m5;
    },
    translateTextMatrix: function TextState_translateTextMatrix(x, y) {
      var m = this.textMatrix;
      m[4] = m[0] * x + m[2] * y + m[4];
      m[5] = m[1] * x + m[3] * y + m[5];
    },
    calcRenderParams: function TextState_calcRenderingParams() {
      var tm = this.textMatrix;
      var cm = this.ctm;
      var a = this.fontSize;
      var b = a * this.textHScale;
      var c = this.textRise;
      var vScale = Math.sqrt((tm[2] * tm[2]) + (tm[3] * tm[3]));
      var angle = Math.atan2(tm[1], tm[0]);
      var m0 = tm[0] * cm[0] + tm[1] * cm[2];
      var m1 = tm[0] * cm[1] + tm[1] * cm[3];
      var m2 = tm[2] * cm[0] + tm[3] * cm[2];
      var m3 = tm[2] * cm[1] + tm[3] * cm[3];
      var m4 = tm[4] * cm[0] + tm[5] * cm[2] + cm[4];
      var m5 = tm[4] * cm[1] + tm[5] * cm[3] + cm[5];
      var renderMatrix = [
        b * m0,
        b * m1,
        a * m2,
        a * m3,
        c * m2 + m4,
        c * m3 + m5
      ];
      return {
        renderMatrix: renderMatrix,
        vScale: vScale,
        angle: angle
      };
    },
  };
  return TextState;
})();

var EvalState = (function EvalStateClosure() {
  function EvalState() {
    this.font = null;
    this.textRenderingMode = TextRenderingMode.FILL;
  }
  EvalState.prototype = {
    clone: function CanvasExtraState_clone() {
      return Object.create(this);
    },
  };
  return EvalState;
})();

