/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var PartialEvaluator = (function partialEvaluator() {
  function constructor(xref, handler, uniquePrefix) {
    this.state = new EvalState();
    this.stateStack = [];

    this.xref = xref;
    this.handler = handler;
    this.uniquePrefix = uniquePrefix;
    this.objIdCounter = 0;
  }

  var OP_MAP = {
    // Graphics state
    w: 'setLineWidth',
    J: 'setLineCap',
    j: 'setLineJoin',
    M: 'setMiterLimit',
    d: 'setDash',
    ri: 'setRenderingIntent',
    i: 'setFlatness',
    gs: 'setGState',
    q: 'save',
    Q: 'restore',
    cm: 'transform',

    // Path
    m: 'moveTo',
    l: 'lineTo',
    c: 'curveTo',
    v: 'curveTo2',
    y: 'curveTo3',
    h: 'closePath',
    re: 'rectangle',
    S: 'stroke',
    s: 'closeStroke',
    f: 'fill',
    F: 'fill',
    'f*': 'eoFill',
    B: 'fillStroke',
    'B*': 'eoFillStroke',
    b: 'closeFillStroke',
    'b*': 'closeEOFillStroke',
    n: 'endPath',

    // Clipping
    W: 'clip',
    'W*': 'eoClip',

    // Text
    BT: 'beginText',
    ET: 'endText',
    Tc: 'setCharSpacing',
    Tw: 'setWordSpacing',
    Tz: 'setHScale',
    TL: 'setLeading',
    Tf: 'setFont',
    Tr: 'setTextRenderingMode',
    Ts: 'setTextRise',
    Td: 'moveText',
    TD: 'setLeadingMoveText',
    Tm: 'setTextMatrix',
    'T*': 'nextLine',
    Tj: 'showText',
    TJ: 'showSpacedText',
    "'": 'nextLineShowText',
    '"': 'nextLineSetSpacingShowText',

    // Type3 fonts
    d0: 'setCharWidth',
    d1: 'setCharWidthAndBounds',

    // Color
    CS: 'setStrokeColorSpace',
    cs: 'setFillColorSpace',
    SC: 'setStrokeColor',
    SCN: 'setStrokeColorN',
    sc: 'setFillColor',
    scn: 'setFillColorN',
    G: 'setStrokeGray',
    g: 'setFillGray',
    RG: 'setStrokeRGBColor',
    rg: 'setFillRGBColor',
    K: 'setStrokeCMYKColor',
    k: 'setFillCMYKColor',

    // Shading
    sh: 'shadingFill',

    // Images
    BI: 'beginInlineImage',
    ID: 'beginImageData',
    EI: 'endInlineImage',

    // XObjects
    Do: 'paintXObject',

    // Marked content
    MP: 'markPoint',
    DP: 'markPointProps',
    BMC: 'beginMarkedContent',
    BDC: 'beginMarkedContentProps',
    EMC: 'endMarkedContent',

    // Compatibility
    BX: 'beginCompat',
    EX: 'endCompat'
  };

  constructor.prototype = {
    getIRQueue: function partialEvaluatorGetIRQueue(stream, resources,
                                    queue, dependency) {

      var self = this;
      var xref = this.xref;
      var handler = this.handler;
      var uniquePrefix = this.uniquePrefix;

      function insertDependency(depList) {
        fnArray.push('dependency');
        argsArray.push(depList);
        for (var i = 0, ii = depList.length; i < ii; i++) {
          var dep = depList[i];
          if (dependency.indexOf(dep) == -1) {
            dependency.push(depList[i]);
          }
        }
      }

      function handleSetFont(fontName, fontRef) {
        var loadedName = null;

        var fontRes = resources.get('Font');

        // TODO: TOASK: Is it possible to get here? If so, what does
        // args[0].name should be like???
        assert(fontRes, 'fontRes not available');

        fontRes = xref.fetchIfRef(fontRes);
        fontRef = fontRef || fontRes.get(fontName);
        var font = xref.fetchIfRef(fontRef);
        assertWellFormed(isDict(font));
        if (!font.translated) {
          font.translated = self.translateFont(font, xref, resources,
                                               dependency);
          if (font.translated) {
            // keep track of each font we translated so the caller can
            // load them asynchronously before calling display on a page
            loadedName = 'font_' + uniquePrefix + (++self.objIdCounter);
            font.translated.properties.loadedName = loadedName;
            font.loadedName = loadedName;

            var translated = font.translated;
            handler.send('obj', [
                loadedName,
                'Font',
                translated.name,
                translated.file,
                translated.properties
            ]);
          }
        }
        loadedName = loadedName || font.loadedName;

        // Ensure the font is ready before the font is set
        // and later on used for drawing.
        // TODO: This should get insert to the IRQueue only once per
        // page.
        insertDependency([loadedName]);
        return loadedName;
      }

      function buildPaintImageXObject(image, inline) {
        var dict = image.dict;
        var w = dict.get('Width', 'W');
        var h = dict.get('Height', 'H');

        if (image instanceof JpegStream && image.isNative) {
          var objId = 'img_' + uniquePrefix + (++self.objIdCounter);
          handler.send('obj', [objId, 'JpegStream', image.getIR()]);

          // Add the dependency on the image object.
          insertDependency([objId]);

          // The normal fn.
          fn = 'paintJpegXObject';
          args = [objId, w, h];

          return;
        }

        // Needs to be rendered ourself.

        // Figure out if the image has an imageMask.
        var imageMask = dict.get('ImageMask', 'IM') || false;

        // If there is no imageMask, create the PDFImage and a lot
        // of image processing can be done here.
        if (!imageMask) {
          var imageObj = new PDFImage(xref, resources, image, inline);

          if (imageObj.imageMask) {
            throw 'Can\'t handle this in the web worker :/';
          }

          var imgData = {
            width: w,
            height: h,
            data: new Uint8Array(w * h * 4)
          };
          var pixels = imgData.data;
          imageObj.fillRgbaBuffer(pixels, imageObj.decode);

          fn = 'paintImageXObject';
          args = [imgData];
          return;
        }

        // This depends on a tmpCanvas beeing filled with the
        // current fillStyle, such that processing the pixel
        // data can't be done here. Instead of creating a
        // complete PDFImage, only read the information needed
        // for later.
        fn = 'paintImageMaskXObject';

        var width = dict.get('Width', 'W');
        var height = dict.get('Height', 'H');
        var bitStrideLength = (width + 7) >> 3;
        var imgArray = image.getBytes(bitStrideLength * height);
        var decode = dict.get('Decode', 'D');
        var inverseDecode = !!decode && decode[0] > 0;

        args = [imgArray, inverseDecode, width, height];
      }

      uniquePrefix = uniquePrefix || '';
      if (!queue.argsArray) {
        queue.argsArray = [];
      }
      if (!queue.fnArray) {
        queue.fnArray = [];
      }

      var fnArray = queue.fnArray, argsArray = queue.argsArray;
      var dependencyArray = dependency || [];

      resources = xref.fetchIfRef(resources) || new Dict();
      var xobjs = xref.fetchIfRef(resources.get('XObject')) || new Dict();
      var patterns = xref.fetchIfRef(resources.get('Pattern')) || new Dict();
      var parser = new Parser(new Lexer(stream), false);
      var res = resources;
      var args = [], obj;
      var getObjBt = function getObjBt() {
        parser = this.oldParser;
        return { name: 'BT' };
      };
      var TILING_PATTERN = 1, SHADING_PATTERN = 2;

      while (!isEOF(obj = parser.getObj())) {
        if (isCmd(obj)) {
          var cmd = obj.cmd;
          var fn = OP_MAP[cmd];
          if (!fn) {
            // invalid content command, trying to recover
            if (cmd.substr(-2) == 'BT') {
              fn = OP_MAP[cmd.substr(0, cmd.length - 2)];
              // feeding 'BT' on next interation
              parser = {
                getObj: getObjBt,
                oldParser: parser
              };
            }
          }
          assertWellFormed(fn, 'Unknown command "' + cmd + '"');
          // TODO figure out how to type-check vararg functions

          if ((cmd == 'SCN' || cmd == 'scn') && !args[args.length - 1].code) {
            // Use the IR version for setStroke/FillColorN.
            fn += '_IR';

            // compile tiling patterns
            var patternName = args[args.length - 1];
            // SCN/scn applies patterns along with normal colors
            if (isName(patternName)) {
              var pattern = xref.fetchIfRef(patterns.get(patternName.name));
              if (pattern) {
                var dict = isStream(pattern) ? pattern.dict : pattern;
                var typeNum = dict.get('PatternType');

                if (typeNum == TILING_PATTERN) {
                  // Create an IR of the pattern code.
                  var depIdx = dependencyArray.length;
                  var queueObj = {};
                  var codeIR = this.getIRQueue(pattern, dict.get('Resources'),
                                               queueObj, dependencyArray);

                  // Add the dependencies that are required to execute the
                  // codeIR.
                  insertDependency(dependencyArray.slice(depIdx));

                  args = TilingPattern.getIR(codeIR, dict, args);
                }
                else if (typeNum == SHADING_PATTERN) {
                  var shading = xref.fetchIfRef(dict.get('Shading'));
                  var matrix = dict.get('Matrix');
                  var pattern = Pattern.parseShading(shading, matrix, xref, res,
                                                                  null /*ctx*/);
                  args = pattern.getIR();
                } else {
                  error('Unkown PatternType ' + typeNum);
                }
              }
            }
          } else if (cmd == 'Do' && !args[0].code) {
            // eagerly compile XForm objects
            var name = args[0].name;
            var xobj = xobjs.get(name);
            if (xobj) {
              xobj = xref.fetchIfRef(xobj);
              assertWellFormed(isStream(xobj), 'XObject should be a stream');

              var type = xobj.dict.get('Subtype');
              assertWellFormed(
                isName(type),
                'XObject should have a Name subtype'
              );

              if ('Form' == type.name) {
                var matrix = xobj.dict.get('Matrix');
                var bbox = xobj.dict.get('BBox');

                fnArray.push('paintFormXObjectBegin');
                argsArray.push([matrix, bbox]);

                // This adds the IRQueue of the xObj to the current queue.
                var depIdx = dependencyArray.length;

                this.getIRQueue(xobj, xobj.dict.get('Resources'), queue,
                                dependencyArray);

               // Add the dependencies that are required to execute the
               // codeIR.
               insertDependency(dependencyArray.slice(depIdx));

                fn = 'paintFormXObjectEnd';
                args = [];
              } else if ('Image' == type.name) {
                buildPaintImageXObject(xobj, false);
              } else {
                error('Unhandled XObject subtype ' + type.name);
              }
            }
          } else if (cmd == 'Tf') { // eagerly collect all fonts
            args[0] = handleSetFont(args[0].name);
          } else if (cmd == 'EI') {
            buildPaintImageXObject(args[0], true);
          }

          switch (fn) {
            // Parse the ColorSpace data to a raw format.
            case 'setFillColorSpace':
            case 'setStrokeColorSpace':
              args = [ColorSpace.parseToIR(args[0], xref, resources)];
              break;
            case 'shadingFill':
              var shadingRes = xref.fetchIfRef(res.get('Shading'));
              if (!shadingRes)
                error('No shading resource found');

              var shading = xref.fetchIfRef(shadingRes.get(args[0].name));
              if (!shading)
                error('No shading object found');

              var shadingFill = Pattern.parseShading(shading, null, xref, res,
                                                      null);
              var patternIR = shadingFill.getIR();
              args = [patternIR];
              fn = 'shadingFill';
              break;
            case 'setGState':
              var dictName = args[0];
              var extGState = xref.fetchIfRef(resources.get('ExtGState'));

              if (!isDict(extGState) || !extGState.has(dictName.name))
                break;

              var gsState = xref.fetchIfRef(extGState.get(dictName.name));

              // This array holds the converted/processed state data.
              var gsStateObj = [];

              gsState.forEach(
                function canvasGraphicsSetGStateForEach(key, value) {
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
                      gsStateObj.push([key, value]);
                      break;
                    case 'Font':
                      gsStateObj.push([
                        'Font',
                        handleSetFont(null, value[0]),
                        value[1]
                      ]);
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
                    case 'BM':
                    case 'SMask':
                    case 'AIS':
                    case 'TK':
                      TODO('graphic state operator ' + key);
                      break;
                    default:
                      warn('Unknown graphic state operator ' + key);
                      break;
                  }
                }
              );
              args = [gsStateObj];
              break;
          } // switch

          fnArray.push(fn);
          argsArray.push(args);
          args = [];
        } else if (obj != null) {
          assertWellFormed(args.length <= 33, 'Too many arguments');
          args.push(obj);
        }
      }

      return {
        fnArray: fnArray,
        argsArray: argsArray
      };
    },

    extractDataStructures: function
      partialEvaluatorExtractDataStructures(dict, baseDict,
                                            xref, properties) {
      // 9.10.2
      var toUnicode = dict.get('ToUnicode') ||
        baseDict.get('ToUnicode');
      if (toUnicode)
        properties.toUnicode = this.readToUnicode(toUnicode, xref);

      if (properties.composite) {
        // CIDSystemInfo helps to match CID to glyphs
        var cidSystemInfo = xref.fetchIfRef(dict.get('CIDSystemInfo'));
        if (isDict(cidSystemInfo)) {
          properties.cidSystemInfo = {
            registry: cidSystemInfo.get('Registry'),
            ordering: cidSystemInfo.get('Ordering'),
            supplement: cidSystemInfo.get('Supplement')
          };
        }

        var cidToGidMap = xref.fetchIfRef(dict.get('CIDToGIDMap'));
        if (isStream(cidToGidMap))
          properties.cidToGidMap = this.readCidToGidMap(cidToGidMap);
      }

      var differences = [];
      var baseEncoding = Encodings.StandardEncoding;
      var hasEncoding = dict.has('Encoding');
      if (hasEncoding) {
        var encoding = xref.fetchIfRef(dict.get('Encoding'));
        if (isDict(encoding)) {
          var baseName = encoding.get('BaseEncoding');
          if (baseName)
            baseEncoding = Encodings[baseName.name];

          // Load the differences between the base and original
          if (encoding.has('Differences')) {
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
          baseEncoding = Encodings[encoding.name];
        } else {
          error('Encoding is not a Name nor a Dict');
        }
      }
      properties.differences = differences;
      properties.baseEncoding = baseEncoding;
      properties.hasEncoding = hasEncoding;
    },

    readToUnicode:
      function partialEvaluatorReadToUnicode(toUnicode, xref) {
      var cmapObj = xref.fetchIfRef(toUnicode);
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
          var byte = cmap[i];
          if (byte == 0x20 || byte == 0x0D || byte == 0x0A ||
              byte == 0x3C || byte == 0x5B || byte == 0x5D) {
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
                  while (startRange <= endRange) {
                    charToUnicode[startRange] = code++;
                    ++startRange;
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
            switch (byte) {
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
          } else if (byte == 0x3E) {
            if (token.length) {
              // parsing hex number
              tokens.push(parseInt(token, 16));
              token = '';
            }
          } else {
            token += String.fromCharCode(byte);
          }
        }
      }
      return charToUnicode;
    },
    readCidToGidMap:
      function partialEvaluatorReadCidToGidMap(cidToGidStream) {
      // Extract the encoding from the CIDToGIDMap
      var glyphsData = cidToGidStream.getBytes();

      // Set encoding 0 to later verify the font has an encoding
      var result = [];
      for (var j = 0, jj = glyphsData.length; j < jj; j++) {
        var glyphID = (glyphsData[j++] << 8) | glyphsData[j];
        if (glyphID == 0)
          continue;

        var code = j >> 1;
        result[code] = glyphID;
      }
      return result;
    },

    extractWidths: function partialEvaluatorWidths(dict,
                                                   xref,
                                                   descriptor,
                                                   properties) {
      var glyphsWidths = [];
      var defaultWidth = 0;
      if (properties.composite) {
        defaultWidth = xref.fetchIfRef(dict.get('DW')) || 1000;

        var widths = xref.fetchIfRef(dict.get('W'));
        if (widths) {
          var start = 0, end = 0;
          for (var i = 0, ii = widths.length; i < ii; i++) {
            var code = widths[i];
            if (isArray(code)) {
              for (var j = 0, jj = code.length; j < jj; j++)
                glyphsWidths[start++] = code[j];
              start = 0;
            } else if (start) {
              var width = widths[++i];
              for (var j = start; j <= code; j++)
                glyphsWidths[j] = width;
              start = 0;
            } else {
              start = code;
            }
          }
        }
      } else {
        var firstChar = properties.firstChar;
        var widths = xref.fetchIfRef(dict.get('Widths'));
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

      properties.defaultWidth = defaultWidth;
      properties.widths = glyphsWidths;
    },

    getBaseFontMetrics: function getBaseFontMetrics(name) {
      var defaultWidth = 0, widths = [];
      var glyphWidths = Metrics[stdFontMap[name] || name];
      if (isNum(glyphWidths)) {
        defaultWidth = glyphWidths;
      } else {
        widths = glyphWidths;
      }

      return {
        defaultWidth: defaultWidth,
        widths: widths
      };
    },

    translateFont: function partialEvaluatorTranslateFont(dict, xref, resources,
                                                          dependency) {
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
          return null;

        if (isRef(df))
          df = xref.fetch(df);

        dict = xref.fetchIfRef(isRef(df) ? df : df[0]);

        type = dict.get('Subtype');
        assertWellFormed(isName(type), 'invalid font Subtype');
        composite = true;
      }
      var maxCharIndex = composite ? 0xFFFF : 0xFF;

      var descriptor = xref.fetchIfRef(dict.get('FontDescriptor'));
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
            return null;

          // Using base font name as a font name.
          baseFontName = baseFontName.name.replace(/[,_]/g, '-');
          var metrics = this.getBaseFontMetrics(baseFontName);

          var properties = {
            type: type.name,
            widths: metrics.widths,
            defaultWidth: metrics.defaultWidth,
            firstChar: 0,
            lastChar: maxCharIndex
          };
          this.extractDataStructures(dict, dict, xref, properties);

          return {
            name: baseFontName,
            dict: baseDict,
            properties: properties
          };
        }

      }

      // According to the spec if 'FontDescriptor' is declared, 'FirstChar',
      // 'LastChar' and 'Widths' should exists too, but some PDF encoders seems
      // to ignore this rule when a variant of a standart font is used.
      // TODO Fill the width array depending on which of the base font this is
      // a variant.
      var firstChar = xref.fetchIfRef(dict.get('FirstChar')) || 0;
      var lastChar = xref.fetchIfRef(dict.get('LastChar')) || maxCharIndex;
      var fontName = xref.fetchIfRef(descriptor.get('FontName'));
      assertWellFormed(isName(fontName), 'invalid font name');

      var fontFile = descriptor.get('FontFile', 'FontFile2', 'FontFile3');
      if (fontFile) {
        fontFile = xref.fetchIfRef(fontFile);
        if (fontFile.dict) {
          var subtype = fontFile.dict.get('Subtype');
          if (subtype)
            subtype = subtype.name;

          var length1 = fontFile.dict.get('Length1');
          if (!isInt(length1))
            length1 = xref.fetchIfRef(length1);

          var length2 = fontFile.dict.get('Length2');
          if (!isInt(length2))
            length2 = xref.fetchIfRef(length2);
        }
      }

      var properties = {
        type: type.name,
        subtype: subtype,
        file: fontFile,
        length1: length1,
        length2: length2,
        composite: composite,
        fixedPitch: false,
        fontMatrix: dict.get('FontMatrix') || IDENTITY_MATRIX,
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
      this.extractWidths(dict, xref, descriptor, properties);
      this.extractDataStructures(dict, baseDict, xref, properties);

      if (type.name === 'Type3') {
        properties.coded = true;
        var charProcs = xref.fetchIfRef(dict.get('CharProcs'));
        var fontResources = xref.fetchIfRef(dict.get('Resources')) || resources;
        properties.resources = fontResources;
        properties.charProcIRQueues = {};
        for (var key in charProcs.map) {
          var glyphStream = xref.fetchIfRef(charProcs.map[key]);
          var queueObj = {};
          properties.charProcIRQueues[key] =
            this.getIRQueue(glyphStream, fontResources, queueObj, dependency);
        }
      }

      return {
        name: fontName.name,
        dict: baseDict,
        file: fontFile,
        properties: properties
      };
    }
  };

  return constructor;
})();

var EvalState = (function evalState() {
  function constructor() {
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
  constructor.prototype = {
  };
  return constructor;
})();

