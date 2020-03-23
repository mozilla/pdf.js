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
exports.CFFFDSelect = exports.CFFCompiler = exports.CFFPrivateDict = exports.CFFTopDict = exports.CFFCharset = exports.CFFIndex = exports.CFFStrings = exports.CFFHeader = exports.CFF = exports.CFFParser = exports.CFFStandardStrings = void 0;

var _util = require("../shared/util.js");

var _charsets = require("./charsets.js");

var _encodings = require("./encodings.js");

var MAX_SUBR_NESTING = 10;
var CFFStandardStrings = [".notdef", "space", "exclam", "quotedbl", "numbersign", "dollar", "percent", "ampersand", "quoteright", "parenleft", "parenright", "asterisk", "plus", "comma", "hyphen", "period", "slash", "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "colon", "semicolon", "less", "equal", "greater", "question", "at", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "bracketleft", "backslash", "bracketright", "asciicircum", "underscore", "quoteleft", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "braceleft", "bar", "braceright", "asciitilde", "exclamdown", "cent", "sterling", "fraction", "yen", "florin", "section", "currency", "quotesingle", "quotedblleft", "guillemotleft", "guilsinglleft", "guilsinglright", "fi", "fl", "endash", "dagger", "daggerdbl", "periodcentered", "paragraph", "bullet", "quotesinglbase", "quotedblbase", "quotedblright", "guillemotright", "ellipsis", "perthousand", "questiondown", "grave", "acute", "circumflex", "tilde", "macron", "breve", "dotaccent", "dieresis", "ring", "cedilla", "hungarumlaut", "ogonek", "caron", "emdash", "AE", "ordfeminine", "Lslash", "Oslash", "OE", "ordmasculine", "ae", "dotlessi", "lslash", "oslash", "oe", "germandbls", "onesuperior", "logicalnot", "mu", "trademark", "Eth", "onehalf", "plusminus", "Thorn", "onequarter", "divide", "brokenbar", "degree", "thorn", "threequarters", "twosuperior", "registered", "minus", "eth", "multiply", "threesuperior", "copyright", "Aacute", "Acircumflex", "Adieresis", "Agrave", "Aring", "Atilde", "Ccedilla", "Eacute", "Ecircumflex", "Edieresis", "Egrave", "Iacute", "Icircumflex", "Idieresis", "Igrave", "Ntilde", "Oacute", "Ocircumflex", "Odieresis", "Ograve", "Otilde", "Scaron", "Uacute", "Ucircumflex", "Udieresis", "Ugrave", "Yacute", "Ydieresis", "Zcaron", "aacute", "acircumflex", "adieresis", "agrave", "aring", "atilde", "ccedilla", "eacute", "ecircumflex", "edieresis", "egrave", "iacute", "icircumflex", "idieresis", "igrave", "ntilde", "oacute", "ocircumflex", "odieresis", "ograve", "otilde", "scaron", "uacute", "ucircumflex", "udieresis", "ugrave", "yacute", "ydieresis", "zcaron", "exclamsmall", "Hungarumlautsmall", "dollaroldstyle", "dollarsuperior", "ampersandsmall", "Acutesmall", "parenleftsuperior", "parenrightsuperior", "twodotenleader", "onedotenleader", "zerooldstyle", "oneoldstyle", "twooldstyle", "threeoldstyle", "fouroldstyle", "fiveoldstyle", "sixoldstyle", "sevenoldstyle", "eightoldstyle", "nineoldstyle", "commasuperior", "threequartersemdash", "periodsuperior", "questionsmall", "asuperior", "bsuperior", "centsuperior", "dsuperior", "esuperior", "isuperior", "lsuperior", "msuperior", "nsuperior", "osuperior", "rsuperior", "ssuperior", "tsuperior", "ff", "ffi", "ffl", "parenleftinferior", "parenrightinferior", "Circumflexsmall", "hyphensuperior", "Gravesmall", "Asmall", "Bsmall", "Csmall", "Dsmall", "Esmall", "Fsmall", "Gsmall", "Hsmall", "Ismall", "Jsmall", "Ksmall", "Lsmall", "Msmall", "Nsmall", "Osmall", "Psmall", "Qsmall", "Rsmall", "Ssmall", "Tsmall", "Usmall", "Vsmall", "Wsmall", "Xsmall", "Ysmall", "Zsmall", "colonmonetary", "onefitted", "rupiah", "Tildesmall", "exclamdownsmall", "centoldstyle", "Lslashsmall", "Scaronsmall", "Zcaronsmall", "Dieresissmall", "Brevesmall", "Caronsmall", "Dotaccentsmall", "Macronsmall", "figuredash", "hypheninferior", "Ogoneksmall", "Ringsmall", "Cedillasmall", "questiondownsmall", "oneeighth", "threeeighths", "fiveeighths", "seveneighths", "onethird", "twothirds", "zerosuperior", "foursuperior", "fivesuperior", "sixsuperior", "sevensuperior", "eightsuperior", "ninesuperior", "zeroinferior", "oneinferior", "twoinferior", "threeinferior", "fourinferior", "fiveinferior", "sixinferior", "seveninferior", "eightinferior", "nineinferior", "centinferior", "dollarinferior", "periodinferior", "commainferior", "Agravesmall", "Aacutesmall", "Acircumflexsmall", "Atildesmall", "Adieresissmall", "Aringsmall", "AEsmall", "Ccedillasmall", "Egravesmall", "Eacutesmall", "Ecircumflexsmall", "Edieresissmall", "Igravesmall", "Iacutesmall", "Icircumflexsmall", "Idieresissmall", "Ethsmall", "Ntildesmall", "Ogravesmall", "Oacutesmall", "Ocircumflexsmall", "Otildesmall", "Odieresissmall", "OEsmall", "Oslashsmall", "Ugravesmall", "Uacutesmall", "Ucircumflexsmall", "Udieresissmall", "Yacutesmall", "Thornsmall", "Ydieresissmall", "001.000", "001.001", "001.002", "001.003", "Black", "Bold", "Book", "Light", "Medium", "Regular", "Roman", "Semibold"];
exports.CFFStandardStrings = CFFStandardStrings;
const NUM_STANDARD_CFF_STRINGS = 391;

var CFFParser = function CFFParserClosure() {
  var CharstringValidationData = [null, {
    id: "hstem",
    min: 2,
    stackClearing: true,
    stem: true
  }, null, {
    id: "vstem",
    min: 2,
    stackClearing: true,
    stem: true
  }, {
    id: "vmoveto",
    min: 1,
    stackClearing: true
  }, {
    id: "rlineto",
    min: 2,
    resetStack: true
  }, {
    id: "hlineto",
    min: 1,
    resetStack: true
  }, {
    id: "vlineto",
    min: 1,
    resetStack: true
  }, {
    id: "rrcurveto",
    min: 6,
    resetStack: true
  }, null, {
    id: "callsubr",
    min: 1,
    undefStack: true
  }, {
    id: "return",
    min: 0,
    undefStack: true
  }, null, null, {
    id: "endchar",
    min: 0,
    stackClearing: true
  }, null, null, null, {
    id: "hstemhm",
    min: 2,
    stackClearing: true,
    stem: true
  }, {
    id: "hintmask",
    min: 0,
    stackClearing: true
  }, {
    id: "cntrmask",
    min: 0,
    stackClearing: true
  }, {
    id: "rmoveto",
    min: 2,
    stackClearing: true
  }, {
    id: "hmoveto",
    min: 1,
    stackClearing: true
  }, {
    id: "vstemhm",
    min: 2,
    stackClearing: true,
    stem: true
  }, {
    id: "rcurveline",
    min: 8,
    resetStack: true
  }, {
    id: "rlinecurve",
    min: 8,
    resetStack: true
  }, {
    id: "vvcurveto",
    min: 4,
    resetStack: true
  }, {
    id: "hhcurveto",
    min: 4,
    resetStack: true
  }, null, {
    id: "callgsubr",
    min: 1,
    undefStack: true
  }, {
    id: "vhcurveto",
    min: 4,
    resetStack: true
  }, {
    id: "hvcurveto",
    min: 4,
    resetStack: true
  }];
  var CharstringValidationData12 = [null, null, null, {
    id: "and",
    min: 2,
    stackDelta: -1
  }, {
    id: "or",
    min: 2,
    stackDelta: -1
  }, {
    id: "not",
    min: 1,
    stackDelta: 0
  }, null, null, null, {
    id: "abs",
    min: 1,
    stackDelta: 0
  }, {
    id: "add",
    min: 2,
    stackDelta: -1,
    stackFn: function stack_div(stack, index) {
      stack[index - 2] = stack[index - 2] + stack[index - 1];
    }
  }, {
    id: "sub",
    min: 2,
    stackDelta: -1,
    stackFn: function stack_div(stack, index) {
      stack[index - 2] = stack[index - 2] - stack[index - 1];
    }
  }, {
    id: "div",
    min: 2,
    stackDelta: -1,
    stackFn: function stack_div(stack, index) {
      stack[index - 2] = stack[index - 2] / stack[index - 1];
    }
  }, null, {
    id: "neg",
    min: 1,
    stackDelta: 0,
    stackFn: function stack_div(stack, index) {
      stack[index - 1] = -stack[index - 1];
    }
  }, {
    id: "eq",
    min: 2,
    stackDelta: -1
  }, null, null, {
    id: "drop",
    min: 1,
    stackDelta: -1
  }, null, {
    id: "put",
    min: 2,
    stackDelta: -2
  }, {
    id: "get",
    min: 1,
    stackDelta: 0
  }, {
    id: "ifelse",
    min: 4,
    stackDelta: -3
  }, {
    id: "random",
    min: 0,
    stackDelta: 1
  }, {
    id: "mul",
    min: 2,
    stackDelta: -1,
    stackFn: function stack_div(stack, index) {
      stack[index - 2] = stack[index - 2] * stack[index - 1];
    }
  }, null, {
    id: "sqrt",
    min: 1,
    stackDelta: 0
  }, {
    id: "dup",
    min: 1,
    stackDelta: 1
  }, {
    id: "exch",
    min: 2,
    stackDelta: 0
  }, {
    id: "index",
    min: 2,
    stackDelta: 0
  }, {
    id: "roll",
    min: 3,
    stackDelta: -2
  }, null, null, null, {
    id: "hflex",
    min: 7,
    resetStack: true
  }, {
    id: "flex",
    min: 13,
    resetStack: true
  }, {
    id: "hflex1",
    min: 9,
    resetStack: true
  }, {
    id: "flex1",
    min: 11,
    resetStack: true
  }];

  function CFFParser(file, properties, seacAnalysisEnabled) {
    this.bytes = file.getBytes();
    this.properties = properties;
    this.seacAnalysisEnabled = !!seacAnalysisEnabled;
  }

  CFFParser.prototype = {
    parse: function CFFParser_parse() {
      var properties = this.properties;
      var cff = new CFF();
      this.cff = cff;
      var header = this.parseHeader();
      var nameIndex = this.parseIndex(header.endPos);
      var topDictIndex = this.parseIndex(nameIndex.endPos);
      var stringIndex = this.parseIndex(topDictIndex.endPos);
      var globalSubrIndex = this.parseIndex(stringIndex.endPos);
      var topDictParsed = this.parseDict(topDictIndex.obj.get(0));
      var topDict = this.createDict(CFFTopDict, topDictParsed, cff.strings);
      cff.header = header.obj;
      cff.names = this.parseNameIndex(nameIndex.obj);
      cff.strings = this.parseStringIndex(stringIndex.obj);
      cff.topDict = topDict;
      cff.globalSubrIndex = globalSubrIndex.obj;
      this.parsePrivateDict(cff.topDict);
      cff.isCIDFont = topDict.hasName("ROS");
      var charStringOffset = topDict.getByName("CharStrings");
      var charStringIndex = this.parseIndex(charStringOffset).obj;
      var fontMatrix = topDict.getByName("FontMatrix");

      if (fontMatrix) {
        properties.fontMatrix = fontMatrix;
      }

      var fontBBox = topDict.getByName("FontBBox");

      if (fontBBox) {
        properties.ascent = Math.max(fontBBox[3], fontBBox[1]);
        properties.descent = Math.min(fontBBox[1], fontBBox[3]);
        properties.ascentScaled = true;
      }

      var charset, encoding;

      if (cff.isCIDFont) {
        var fdArrayIndex = this.parseIndex(topDict.getByName("FDArray")).obj;

        for (var i = 0, ii = fdArrayIndex.count; i < ii; ++i) {
          var dictRaw = fdArrayIndex.get(i);
          var fontDict = this.createDict(CFFTopDict, this.parseDict(dictRaw), cff.strings);
          this.parsePrivateDict(fontDict);
          cff.fdArray.push(fontDict);
        }

        encoding = null;
        charset = this.parseCharsets(topDict.getByName("charset"), charStringIndex.count, cff.strings, true);
        cff.fdSelect = this.parseFDSelect(topDict.getByName("FDSelect"), charStringIndex.count);
      } else {
        charset = this.parseCharsets(topDict.getByName("charset"), charStringIndex.count, cff.strings, false);
        encoding = this.parseEncoding(topDict.getByName("Encoding"), properties, cff.strings, charset.charset);
      }

      cff.charset = charset;
      cff.encoding = encoding;
      var charStringsAndSeacs = this.parseCharStrings({
        charStrings: charStringIndex,
        localSubrIndex: topDict.privateDict.subrsIndex,
        globalSubrIndex: globalSubrIndex.obj,
        fdSelect: cff.fdSelect,
        fdArray: cff.fdArray,
        privateDict: topDict.privateDict
      });
      cff.charStrings = charStringsAndSeacs.charStrings;
      cff.seacs = charStringsAndSeacs.seacs;
      cff.widths = charStringsAndSeacs.widths;
      return cff;
    },
    parseHeader: function CFFParser_parseHeader() {
      var bytes = this.bytes;
      var bytesLength = bytes.length;
      var offset = 0;

      while (offset < bytesLength && bytes[offset] !== 1) {
        ++offset;
      }

      if (offset >= bytesLength) {
        throw new _util.FormatError("Invalid CFF header");
      }

      if (offset !== 0) {
        (0, _util.info)("cff data is shifted");
        bytes = bytes.subarray(offset);
        this.bytes = bytes;
      }

      var major = bytes[0];
      var minor = bytes[1];
      var hdrSize = bytes[2];
      var offSize = bytes[3];
      var header = new CFFHeader(major, minor, hdrSize, offSize);
      return {
        obj: header,
        endPos: hdrSize
      };
    },
    parseDict: function CFFParser_parseDict(dict) {
      var pos = 0;

      function parseOperand() {
        var value = dict[pos++];

        if (value === 30) {
          return parseFloatOperand();
        } else if (value === 28) {
          value = dict[pos++];
          value = (value << 24 | dict[pos++] << 16) >> 16;
          return value;
        } else if (value === 29) {
          value = dict[pos++];
          value = value << 8 | dict[pos++];
          value = value << 8 | dict[pos++];
          value = value << 8 | dict[pos++];
          return value;
        } else if (value >= 32 && value <= 246) {
          return value - 139;
        } else if (value >= 247 && value <= 250) {
          return (value - 247) * 256 + dict[pos++] + 108;
        } else if (value >= 251 && value <= 254) {
          return -((value - 251) * 256) - dict[pos++] - 108;
        }

        (0, _util.warn)('CFFParser_parseDict: "' + value + '" is a reserved command.');
        return NaN;
      }

      function parseFloatOperand() {
        var str = "";
        var eof = 15;
        const lookup = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "E", "E-", null, "-"];
        var length = dict.length;

        while (pos < length) {
          var b = dict[pos++];
          var b1 = b >> 4;
          var b2 = b & 15;

          if (b1 === eof) {
            break;
          }

          str += lookup[b1];

          if (b2 === eof) {
            break;
          }

          str += lookup[b2];
        }

        return parseFloat(str);
      }

      var operands = [];
      var entries = [];
      pos = 0;
      var end = dict.length;

      while (pos < end) {
        var b = dict[pos];

        if (b <= 21) {
          if (b === 12) {
            b = b << 8 | dict[++pos];
          }

          entries.push([b, operands]);
          operands = [];
          ++pos;
        } else {
          operands.push(parseOperand());
        }
      }

      return entries;
    },
    parseIndex: function CFFParser_parseIndex(pos) {
      var cffIndex = new CFFIndex();
      var bytes = this.bytes;
      var count = bytes[pos++] << 8 | bytes[pos++];
      var offsets = [];
      var end = pos;
      var i, ii;

      if (count !== 0) {
        var offsetSize = bytes[pos++];
        var startPos = pos + (count + 1) * offsetSize - 1;

        for (i = 0, ii = count + 1; i < ii; ++i) {
          var offset = 0;

          for (var j = 0; j < offsetSize; ++j) {
            offset <<= 8;
            offset += bytes[pos++];
          }

          offsets.push(startPos + offset);
        }

        end = offsets[count];
      }

      for (i = 0, ii = offsets.length - 1; i < ii; ++i) {
        var offsetStart = offsets[i];
        var offsetEnd = offsets[i + 1];
        cffIndex.add(bytes.subarray(offsetStart, offsetEnd));
      }

      return {
        obj: cffIndex,
        endPos: end
      };
    },
    parseNameIndex: function CFFParser_parseNameIndex(index) {
      var names = [];

      for (var i = 0, ii = index.count; i < ii; ++i) {
        var name = index.get(i);
        names.push((0, _util.bytesToString)(name));
      }

      return names;
    },
    parseStringIndex: function CFFParser_parseStringIndex(index) {
      var strings = new CFFStrings();

      for (var i = 0, ii = index.count; i < ii; ++i) {
        var data = index.get(i);
        strings.add((0, _util.bytesToString)(data));
      }

      return strings;
    },
    createDict: function CFFParser_createDict(Type, dict, strings) {
      var cffDict = new Type(strings);

      for (var i = 0, ii = dict.length; i < ii; ++i) {
        var pair = dict[i];
        var key = pair[0];
        var value = pair[1];
        cffDict.setByKey(key, value);
      }

      return cffDict;
    },
    parseCharString: function CFFParser_parseCharString(state, data, localSubrIndex, globalSubrIndex) {
      if (!data || state.callDepth > MAX_SUBR_NESTING) {
        return false;
      }

      var stackSize = state.stackSize;
      var stack = state.stack;
      var length = data.length;

      for (var j = 0; j < length;) {
        var value = data[j++];
        var validationCommand = null;

        if (value === 12) {
          var q = data[j++];

          if (q === 0) {
            data[j - 2] = 139;
            data[j - 1] = 22;
            stackSize = 0;
          } else {
            validationCommand = CharstringValidationData12[q];
          }
        } else if (value === 28) {
          stack[stackSize] = (data[j] << 24 | data[j + 1] << 16) >> 16;
          j += 2;
          stackSize++;
        } else if (value === 14) {
          if (stackSize >= 4) {
            stackSize -= 4;

            if (this.seacAnalysisEnabled) {
              state.seac = stack.slice(stackSize, stackSize + 4);
              return false;
            }
          }

          validationCommand = CharstringValidationData[value];
        } else if (value >= 32 && value <= 246) {
          stack[stackSize] = value - 139;
          stackSize++;
        } else if (value >= 247 && value <= 254) {
          stack[stackSize] = value < 251 ? (value - 247 << 8) + data[j] + 108 : -(value - 251 << 8) - data[j] - 108;
          j++;
          stackSize++;
        } else if (value === 255) {
          stack[stackSize] = (data[j] << 24 | data[j + 1] << 16 | data[j + 2] << 8 | data[j + 3]) / 65536;
          j += 4;
          stackSize++;
        } else if (value === 19 || value === 20) {
          state.hints += stackSize >> 1;
          j += state.hints + 7 >> 3;
          stackSize %= 2;
          validationCommand = CharstringValidationData[value];
        } else if (value === 10 || value === 29) {
          var subrsIndex;

          if (value === 10) {
            subrsIndex = localSubrIndex;
          } else {
            subrsIndex = globalSubrIndex;
          }

          if (!subrsIndex) {
            validationCommand = CharstringValidationData[value];
            (0, _util.warn)("Missing subrsIndex for " + validationCommand.id);
            return false;
          }

          var bias = 32768;

          if (subrsIndex.count < 1240) {
            bias = 107;
          } else if (subrsIndex.count < 33900) {
            bias = 1131;
          }

          var subrNumber = stack[--stackSize] + bias;

          if (subrNumber < 0 || subrNumber >= subrsIndex.count || isNaN(subrNumber)) {
            validationCommand = CharstringValidationData[value];
            (0, _util.warn)("Out of bounds subrIndex for " + validationCommand.id);
            return false;
          }

          state.stackSize = stackSize;
          state.callDepth++;
          var valid = this.parseCharString(state, subrsIndex.get(subrNumber), localSubrIndex, globalSubrIndex);

          if (!valid) {
            return false;
          }

          state.callDepth--;
          stackSize = state.stackSize;
          continue;
        } else if (value === 11) {
          state.stackSize = stackSize;
          return true;
        } else {
          validationCommand = CharstringValidationData[value];
        }

        if (validationCommand) {
          if (validationCommand.stem) {
            state.hints += stackSize >> 1;

            if (value === 3 || value === 23) {
              state.hasVStems = true;
            } else if (state.hasVStems && (value === 1 || value === 18)) {
              (0, _util.warn)("CFF stem hints are in wrong order");
              data[j - 1] = value === 1 ? 3 : 23;
            }
          }

          if ("min" in validationCommand) {
            if (!state.undefStack && stackSize < validationCommand.min) {
              (0, _util.warn)("Not enough parameters for " + validationCommand.id + "; actual: " + stackSize + ", expected: " + validationCommand.min);
              return false;
            }
          }

          if (state.firstStackClearing && validationCommand.stackClearing) {
            state.firstStackClearing = false;
            stackSize -= validationCommand.min;

            if (stackSize >= 2 && validationCommand.stem) {
              stackSize %= 2;
            } else if (stackSize > 1) {
              (0, _util.warn)("Found too many parameters for stack-clearing command");
            }

            if (stackSize > 0 && stack[stackSize - 1] >= 0) {
              state.width = stack[stackSize - 1];
            }
          }

          if ("stackDelta" in validationCommand) {
            if ("stackFn" in validationCommand) {
              validationCommand.stackFn(stack, stackSize);
            }

            stackSize += validationCommand.stackDelta;
          } else if (validationCommand.stackClearing) {
            stackSize = 0;
          } else if (validationCommand.resetStack) {
            stackSize = 0;
            state.undefStack = false;
          } else if (validationCommand.undefStack) {
            stackSize = 0;
            state.undefStack = true;
            state.firstStackClearing = false;
          }
        }
      }

      state.stackSize = stackSize;
      return true;
    },

    parseCharStrings({
      charStrings,
      localSubrIndex,
      globalSubrIndex,
      fdSelect,
      fdArray,
      privateDict
    }) {
      var seacs = [];
      var widths = [];
      var count = charStrings.count;

      for (var i = 0; i < count; i++) {
        var charstring = charStrings.get(i);
        var state = {
          callDepth: 0,
          stackSize: 0,
          stack: [],
          undefStack: true,
          hints: 0,
          firstStackClearing: true,
          seac: null,
          width: null,
          hasVStems: false
        };
        var valid = true;
        var localSubrToUse = null;
        var privateDictToUse = privateDict;

        if (fdSelect && fdArray.length) {
          var fdIndex = fdSelect.getFDIndex(i);

          if (fdIndex === -1) {
            (0, _util.warn)("Glyph index is not in fd select.");
            valid = false;
          }

          if (fdIndex >= fdArray.length) {
            (0, _util.warn)("Invalid fd index for glyph index.");
            valid = false;
          }

          if (valid) {
            privateDictToUse = fdArray[fdIndex].privateDict;
            localSubrToUse = privateDictToUse.subrsIndex;
          }
        } else if (localSubrIndex) {
          localSubrToUse = localSubrIndex;
        }

        if (valid) {
          valid = this.parseCharString(state, charstring, localSubrToUse, globalSubrIndex);
        }

        if (state.width !== null) {
          const nominalWidth = privateDictToUse.getByName("nominalWidthX");
          widths[i] = nominalWidth + state.width;
        } else {
          const defaultWidth = privateDictToUse.getByName("defaultWidthX");
          widths[i] = defaultWidth;
        }

        if (state.seac !== null) {
          seacs[i] = state.seac;
        }

        if (!valid) {
          charStrings.set(i, new Uint8Array([14]));
        }
      }

      return {
        charStrings,
        seacs,
        widths
      };
    },

    emptyPrivateDictionary: function CFFParser_emptyPrivateDictionary(parentDict) {
      var privateDict = this.createDict(CFFPrivateDict, [], parentDict.strings);
      parentDict.setByKey(18, [0, 0]);
      parentDict.privateDict = privateDict;
    },
    parsePrivateDict: function CFFParser_parsePrivateDict(parentDict) {
      if (!parentDict.hasName("Private")) {
        this.emptyPrivateDictionary(parentDict);
        return;
      }

      var privateOffset = parentDict.getByName("Private");

      if (!Array.isArray(privateOffset) || privateOffset.length !== 2) {
        parentDict.removeByName("Private");
        return;
      }

      var size = privateOffset[0];
      var offset = privateOffset[1];

      if (size === 0 || offset >= this.bytes.length) {
        this.emptyPrivateDictionary(parentDict);
        return;
      }

      var privateDictEnd = offset + size;
      var dictData = this.bytes.subarray(offset, privateDictEnd);
      var dict = this.parseDict(dictData);
      var privateDict = this.createDict(CFFPrivateDict, dict, parentDict.strings);
      parentDict.privateDict = privateDict;

      if (!privateDict.getByName("Subrs")) {
        return;
      }

      var subrsOffset = privateDict.getByName("Subrs");
      var relativeOffset = offset + subrsOffset;

      if (subrsOffset === 0 || relativeOffset >= this.bytes.length) {
        this.emptyPrivateDictionary(parentDict);
        return;
      }

      var subrsIndex = this.parseIndex(relativeOffset);
      privateDict.subrsIndex = subrsIndex.obj;
    },
    parseCharsets: function CFFParser_parseCharsets(pos, length, strings, cid) {
      if (pos === 0) {
        return new CFFCharset(true, CFFCharsetPredefinedTypes.ISO_ADOBE, _charsets.ISOAdobeCharset);
      } else if (pos === 1) {
        return new CFFCharset(true, CFFCharsetPredefinedTypes.EXPERT, _charsets.ExpertCharset);
      } else if (pos === 2) {
        return new CFFCharset(true, CFFCharsetPredefinedTypes.EXPERT_SUBSET, _charsets.ExpertSubsetCharset);
      }

      var bytes = this.bytes;
      var start = pos;
      var format = bytes[pos++];
      var charset = [".notdef"];
      var id, count, i;
      length -= 1;

      switch (format) {
        case 0:
          for (i = 0; i < length; i++) {
            id = bytes[pos++] << 8 | bytes[pos++];
            charset.push(cid ? id : strings.get(id));
          }

          break;

        case 1:
          while (charset.length <= length) {
            id = bytes[pos++] << 8 | bytes[pos++];
            count = bytes[pos++];

            for (i = 0; i <= count; i++) {
              charset.push(cid ? id++ : strings.get(id++));
            }
          }

          break;

        case 2:
          while (charset.length <= length) {
            id = bytes[pos++] << 8 | bytes[pos++];
            count = bytes[pos++] << 8 | bytes[pos++];

            for (i = 0; i <= count; i++) {
              charset.push(cid ? id++ : strings.get(id++));
            }
          }

          break;

        default:
          throw new _util.FormatError("Unknown charset format");
      }

      var end = pos;
      var raw = bytes.subarray(start, end);
      return new CFFCharset(false, format, charset, raw);
    },
    parseEncoding: function CFFParser_parseEncoding(pos, properties, strings, charset) {
      var encoding = Object.create(null);
      var bytes = this.bytes;
      var predefined = false;
      var format, i, ii;
      var raw = null;

      function readSupplement() {
        var supplementsCount = bytes[pos++];

        for (i = 0; i < supplementsCount; i++) {
          var code = bytes[pos++];
          var sid = (bytes[pos++] << 8) + (bytes[pos++] & 0xff);
          encoding[code] = charset.indexOf(strings.get(sid));
        }
      }

      if (pos === 0 || pos === 1) {
        predefined = true;
        format = pos;
        var baseEncoding = pos ? _encodings.ExpertEncoding : _encodings.StandardEncoding;

        for (i = 0, ii = charset.length; i < ii; i++) {
          var index = baseEncoding.indexOf(charset[i]);

          if (index !== -1) {
            encoding[index] = i;
          }
        }
      } else {
        var dataStart = pos;
        format = bytes[pos++];

        switch (format & 0x7f) {
          case 0:
            var glyphsCount = bytes[pos++];

            for (i = 1; i <= glyphsCount; i++) {
              encoding[bytes[pos++]] = i;
            }

            break;

          case 1:
            var rangesCount = bytes[pos++];
            var gid = 1;

            for (i = 0; i < rangesCount; i++) {
              var start = bytes[pos++];
              var left = bytes[pos++];

              for (var j = start; j <= start + left; j++) {
                encoding[j] = gid++;
              }
            }

            break;

          default:
            throw new _util.FormatError(`Unknown encoding format: ${format} in CFF`);
        }

        var dataEnd = pos;

        if (format & 0x80) {
          bytes[dataStart] &= 0x7f;
          readSupplement();
        }

        raw = bytes.subarray(dataStart, dataEnd);
      }

      format = format & 0x7f;
      return new CFFEncoding(predefined, format, encoding, raw);
    },
    parseFDSelect: function CFFParser_parseFDSelect(pos, length) {
      var bytes = this.bytes;
      var format = bytes[pos++];
      var fdSelect = [];
      var i;

      switch (format) {
        case 0:
          for (i = 0; i < length; ++i) {
            var id = bytes[pos++];
            fdSelect.push(id);
          }

          break;

        case 3:
          var rangesCount = bytes[pos++] << 8 | bytes[pos++];

          for (i = 0; i < rangesCount; ++i) {
            var first = bytes[pos++] << 8 | bytes[pos++];

            if (i === 0 && first !== 0) {
              (0, _util.warn)("parseFDSelect: The first range must have a first GID of 0" + " -- trying to recover.");
              first = 0;
            }

            var fdIndex = bytes[pos++];
            var next = bytes[pos] << 8 | bytes[pos + 1];

            for (var j = first; j < next; ++j) {
              fdSelect.push(fdIndex);
            }
          }

          pos += 2;
          break;

        default:
          throw new _util.FormatError(`parseFDSelect: Unknown format "${format}".`);
      }

      if (fdSelect.length !== length) {
        throw new _util.FormatError("parseFDSelect: Invalid font data.");
      }

      return new CFFFDSelect(format, fdSelect);
    }
  };
  return CFFParser;
}();

exports.CFFParser = CFFParser;

var CFF = function CFFClosure() {
  function CFF() {
    this.header = null;
    this.names = [];
    this.topDict = null;
    this.strings = new CFFStrings();
    this.globalSubrIndex = null;
    this.encoding = null;
    this.charset = null;
    this.charStrings = null;
    this.fdArray = [];
    this.fdSelect = null;
    this.isCIDFont = false;
  }

  CFF.prototype = {
    duplicateFirstGlyph: function CFF_duplicateFirstGlyph() {
      if (this.charStrings.count >= 65535) {
        (0, _util.warn)("Not enough space in charstrings to duplicate first glyph.");
        return;
      }

      var glyphZero = this.charStrings.get(0);
      this.charStrings.add(glyphZero);

      if (this.isCIDFont) {
        this.fdSelect.fdSelect.push(this.fdSelect.fdSelect[0]);
      }
    },
    hasGlyphId: function CFF_hasGlyphID(id) {
      if (id < 0 || id >= this.charStrings.count) {
        return false;
      }

      var glyph = this.charStrings.get(id);
      return glyph.length > 0;
    }
  };
  return CFF;
}();

exports.CFF = CFF;

var CFFHeader = function CFFHeaderClosure() {
  function CFFHeader(major, minor, hdrSize, offSize) {
    this.major = major;
    this.minor = minor;
    this.hdrSize = hdrSize;
    this.offSize = offSize;
  }

  return CFFHeader;
}();

exports.CFFHeader = CFFHeader;

var CFFStrings = function CFFStringsClosure() {
  function CFFStrings() {
    this.strings = [];
  }

  CFFStrings.prototype = {
    get: function CFFStrings_get(index) {
      if (index >= 0 && index <= NUM_STANDARD_CFF_STRINGS - 1) {
        return CFFStandardStrings[index];
      }

      if (index - NUM_STANDARD_CFF_STRINGS <= this.strings.length) {
        return this.strings[index - NUM_STANDARD_CFF_STRINGS];
      }

      return CFFStandardStrings[0];
    },
    getSID: function CFFStrings_getSID(str) {
      let index = CFFStandardStrings.indexOf(str);

      if (index !== -1) {
        return index;
      }

      index = this.strings.indexOf(str);

      if (index !== -1) {
        return index + NUM_STANDARD_CFF_STRINGS;
      }

      return -1;
    },
    add: function CFFStrings_add(value) {
      this.strings.push(value);
    },

    get count() {
      return this.strings.length;
    }

  };
  return CFFStrings;
}();

exports.CFFStrings = CFFStrings;

var CFFIndex = function CFFIndexClosure() {
  function CFFIndex() {
    this.objects = [];
    this.length = 0;
  }

  CFFIndex.prototype = {
    add: function CFFIndex_add(data) {
      this.length += data.length;
      this.objects.push(data);
    },
    set: function CFFIndex_set(index, data) {
      this.length += data.length - this.objects[index].length;
      this.objects[index] = data;
    },
    get: function CFFIndex_get(index) {
      return this.objects[index];
    },

    get count() {
      return this.objects.length;
    }

  };
  return CFFIndex;
}();

exports.CFFIndex = CFFIndex;

var CFFDict = function CFFDictClosure() {
  function CFFDict(tables, strings) {
    this.keyToNameMap = tables.keyToNameMap;
    this.nameToKeyMap = tables.nameToKeyMap;
    this.defaults = tables.defaults;
    this.types = tables.types;
    this.opcodes = tables.opcodes;
    this.order = tables.order;
    this.strings = strings;
    this.values = Object.create(null);
  }

  CFFDict.prototype = {
    setByKey: function CFFDict_setByKey(key, value) {
      if (!(key in this.keyToNameMap)) {
        return false;
      }

      var valueLength = value.length;

      if (valueLength === 0) {
        return true;
      }

      for (var i = 0; i < valueLength; i++) {
        if (isNaN(value[i])) {
          (0, _util.warn)('Invalid CFFDict value: "' + value + '" for key "' + key + '".');
          return true;
        }
      }

      var type = this.types[key];

      if (type === "num" || type === "sid" || type === "offset") {
        value = value[0];
      }

      this.values[key] = value;
      return true;
    },
    setByName: function CFFDict_setByName(name, value) {
      if (!(name in this.nameToKeyMap)) {
        throw new _util.FormatError(`Invalid dictionary name "${name}"`);
      }

      this.values[this.nameToKeyMap[name]] = value;
    },
    hasName: function CFFDict_hasName(name) {
      return this.nameToKeyMap[name] in this.values;
    },
    getByName: function CFFDict_getByName(name) {
      if (!(name in this.nameToKeyMap)) {
        throw new _util.FormatError(`Invalid dictionary name ${name}"`);
      }

      var key = this.nameToKeyMap[name];

      if (!(key in this.values)) {
        return this.defaults[key];
      }

      return this.values[key];
    },
    removeByName: function CFFDict_removeByName(name) {
      delete this.values[this.nameToKeyMap[name]];
    }
  };

  CFFDict.createTables = function CFFDict_createTables(layout) {
    var tables = {
      keyToNameMap: {},
      nameToKeyMap: {},
      defaults: {},
      types: {},
      opcodes: {},
      order: []
    };

    for (var i = 0, ii = layout.length; i < ii; ++i) {
      var entry = layout[i];
      var key = Array.isArray(entry[0]) ? (entry[0][0] << 8) + entry[0][1] : entry[0];
      tables.keyToNameMap[key] = entry[1];
      tables.nameToKeyMap[entry[1]] = key;
      tables.types[key] = entry[2];
      tables.defaults[key] = entry[3];
      tables.opcodes[key] = Array.isArray(entry[0]) ? entry[0] : [entry[0]];
      tables.order.push(key);
    }

    return tables;
  };

  return CFFDict;
}();

var CFFTopDict = function CFFTopDictClosure() {
  var layout = [[[12, 30], "ROS", ["sid", "sid", "num"], null], [[12, 20], "SyntheticBase", "num", null], [0, "version", "sid", null], [1, "Notice", "sid", null], [[12, 0], "Copyright", "sid", null], [2, "FullName", "sid", null], [3, "FamilyName", "sid", null], [4, "Weight", "sid", null], [[12, 1], "isFixedPitch", "num", 0], [[12, 2], "ItalicAngle", "num", 0], [[12, 3], "UnderlinePosition", "num", -100], [[12, 4], "UnderlineThickness", "num", 50], [[12, 5], "PaintType", "num", 0], [[12, 6], "CharstringType", "num", 2], [[12, 7], "FontMatrix", ["num", "num", "num", "num", "num", "num"], [0.001, 0, 0, 0.001, 0, 0]], [13, "UniqueID", "num", null], [5, "FontBBox", ["num", "num", "num", "num"], [0, 0, 0, 0]], [[12, 8], "StrokeWidth", "num", 0], [14, "XUID", "array", null], [15, "charset", "offset", 0], [16, "Encoding", "offset", 0], [17, "CharStrings", "offset", 0], [18, "Private", ["offset", "offset"], null], [[12, 21], "PostScript", "sid", null], [[12, 22], "BaseFontName", "sid", null], [[12, 23], "BaseFontBlend", "delta", null], [[12, 31], "CIDFontVersion", "num", 0], [[12, 32], "CIDFontRevision", "num", 0], [[12, 33], "CIDFontType", "num", 0], [[12, 34], "CIDCount", "num", 8720], [[12, 35], "UIDBase", "num", null], [[12, 37], "FDSelect", "offset", null], [[12, 36], "FDArray", "offset", null], [[12, 38], "FontName", "sid", null]];
  var tables = null;

  function CFFTopDict(strings) {
    if (tables === null) {
      tables = CFFDict.createTables(layout);
    }

    CFFDict.call(this, tables, strings);
    this.privateDict = null;
  }

  CFFTopDict.prototype = Object.create(CFFDict.prototype);
  return CFFTopDict;
}();

exports.CFFTopDict = CFFTopDict;

var CFFPrivateDict = function CFFPrivateDictClosure() {
  var layout = [[6, "BlueValues", "delta", null], [7, "OtherBlues", "delta", null], [8, "FamilyBlues", "delta", null], [9, "FamilyOtherBlues", "delta", null], [[12, 9], "BlueScale", "num", 0.039625], [[12, 10], "BlueShift", "num", 7], [[12, 11], "BlueFuzz", "num", 1], [10, "StdHW", "num", null], [11, "StdVW", "num", null], [[12, 12], "StemSnapH", "delta", null], [[12, 13], "StemSnapV", "delta", null], [[12, 14], "ForceBold", "num", 0], [[12, 17], "LanguageGroup", "num", 0], [[12, 18], "ExpansionFactor", "num", 0.06], [[12, 19], "initialRandomSeed", "num", 0], [20, "defaultWidthX", "num", 0], [21, "nominalWidthX", "num", 0], [19, "Subrs", "offset", null]];
  var tables = null;

  function CFFPrivateDict(strings) {
    if (tables === null) {
      tables = CFFDict.createTables(layout);
    }

    CFFDict.call(this, tables, strings);
    this.subrsIndex = null;
  }

  CFFPrivateDict.prototype = Object.create(CFFDict.prototype);
  return CFFPrivateDict;
}();

exports.CFFPrivateDict = CFFPrivateDict;
var CFFCharsetPredefinedTypes = {
  ISO_ADOBE: 0,
  EXPERT: 1,
  EXPERT_SUBSET: 2
};

var CFFCharset = function CFFCharsetClosure() {
  function CFFCharset(predefined, format, charset, raw) {
    this.predefined = predefined;
    this.format = format;
    this.charset = charset;
    this.raw = raw;
  }

  return CFFCharset;
}();

exports.CFFCharset = CFFCharset;

var CFFEncoding = function CFFEncodingClosure() {
  function CFFEncoding(predefined, format, encoding, raw) {
    this.predefined = predefined;
    this.format = format;
    this.encoding = encoding;
    this.raw = raw;
  }

  return CFFEncoding;
}();

var CFFFDSelect = function CFFFDSelectClosure() {
  function CFFFDSelect(format, fdSelect) {
    this.format = format;
    this.fdSelect = fdSelect;
  }

  CFFFDSelect.prototype = {
    getFDIndex: function CFFFDSelect_get(glyphIndex) {
      if (glyphIndex < 0 || glyphIndex >= this.fdSelect.length) {
        return -1;
      }

      return this.fdSelect[glyphIndex];
    }
  };
  return CFFFDSelect;
}();

exports.CFFFDSelect = CFFFDSelect;

var CFFOffsetTracker = function CFFOffsetTrackerClosure() {
  function CFFOffsetTracker() {
    this.offsets = Object.create(null);
  }

  CFFOffsetTracker.prototype = {
    isTracking: function CFFOffsetTracker_isTracking(key) {
      return key in this.offsets;
    },
    track: function CFFOffsetTracker_track(key, location) {
      if (key in this.offsets) {
        throw new _util.FormatError(`Already tracking location of ${key}`);
      }

      this.offsets[key] = location;
    },
    offset: function CFFOffsetTracker_offset(value) {
      for (var key in this.offsets) {
        this.offsets[key] += value;
      }
    },
    setEntryLocation: function CFFOffsetTracker_setEntryLocation(key, values, output) {
      if (!(key in this.offsets)) {
        throw new _util.FormatError(`Not tracking location of ${key}`);
      }

      var data = output.data;
      var dataOffset = this.offsets[key];
      var size = 5;

      for (var i = 0, ii = values.length; i < ii; ++i) {
        var offset0 = i * size + dataOffset;
        var offset1 = offset0 + 1;
        var offset2 = offset0 + 2;
        var offset3 = offset0 + 3;
        var offset4 = offset0 + 4;

        if (data[offset0] !== 0x1d || data[offset1] !== 0 || data[offset2] !== 0 || data[offset3] !== 0 || data[offset4] !== 0) {
          throw new _util.FormatError("writing to an offset that is not empty");
        }

        var value = values[i];
        data[offset0] = 0x1d;
        data[offset1] = value >> 24 & 0xff;
        data[offset2] = value >> 16 & 0xff;
        data[offset3] = value >> 8 & 0xff;
        data[offset4] = value & 0xff;
      }
    }
  };
  return CFFOffsetTracker;
}();

var CFFCompiler = function CFFCompilerClosure() {
  function CFFCompiler(cff) {
    this.cff = cff;
  }

  CFFCompiler.prototype = {
    compile: function CFFCompiler_compile() {
      var cff = this.cff;
      var output = {
        data: [],
        length: 0,
        add: function CFFCompiler_add(data) {
          this.data = this.data.concat(data);
          this.length = this.data.length;
        }
      };
      var header = this.compileHeader(cff.header);
      output.add(header);
      var nameIndex = this.compileNameIndex(cff.names);
      output.add(nameIndex);

      if (cff.isCIDFont) {
        if (cff.topDict.hasName("FontMatrix")) {
          var base = cff.topDict.getByName("FontMatrix");
          cff.topDict.removeByName("FontMatrix");

          for (var i = 0, ii = cff.fdArray.length; i < ii; i++) {
            var subDict = cff.fdArray[i];
            var matrix = base.slice(0);

            if (subDict.hasName("FontMatrix")) {
              matrix = _util.Util.transform(matrix, subDict.getByName("FontMatrix"));
            }

            subDict.setByName("FontMatrix", matrix);
          }
        }
      }

      cff.topDict.setByName("charset", 0);
      var compiled = this.compileTopDicts([cff.topDict], output.length, cff.isCIDFont);
      output.add(compiled.output);
      var topDictTracker = compiled.trackers[0];
      var stringIndex = this.compileStringIndex(cff.strings.strings);
      output.add(stringIndex);
      var globalSubrIndex = this.compileIndex(cff.globalSubrIndex);
      output.add(globalSubrIndex);

      if (cff.encoding && cff.topDict.hasName("Encoding")) {
        if (cff.encoding.predefined) {
          topDictTracker.setEntryLocation("Encoding", [cff.encoding.format], output);
        } else {
          var encoding = this.compileEncoding(cff.encoding);
          topDictTracker.setEntryLocation("Encoding", [output.length], output);
          output.add(encoding);
        }
      }

      var charset = this.compileCharset(cff.charset, cff.charStrings.count, cff.strings, cff.isCIDFont);
      topDictTracker.setEntryLocation("charset", [output.length], output);
      output.add(charset);
      var charStrings = this.compileCharStrings(cff.charStrings);
      topDictTracker.setEntryLocation("CharStrings", [output.length], output);
      output.add(charStrings);

      if (cff.isCIDFont) {
        topDictTracker.setEntryLocation("FDSelect", [output.length], output);
        var fdSelect = this.compileFDSelect(cff.fdSelect);
        output.add(fdSelect);
        compiled = this.compileTopDicts(cff.fdArray, output.length, true);
        topDictTracker.setEntryLocation("FDArray", [output.length], output);
        output.add(compiled.output);
        var fontDictTrackers = compiled.trackers;
        this.compilePrivateDicts(cff.fdArray, fontDictTrackers, output);
      }

      this.compilePrivateDicts([cff.topDict], [topDictTracker], output);
      output.add([0]);
      return output.data;
    },
    encodeNumber: function CFFCompiler_encodeNumber(value) {
      if (parseFloat(value) === parseInt(value, 10) && !isNaN(value)) {
        return this.encodeInteger(value);
      }

      return this.encodeFloat(value);
    },
    encodeFloat: function CFFCompiler_encodeFloat(num) {
      var value = num.toString();
      var m = /\.(\d*?)(?:9{5,20}|0{5,20})\d{0,2}(?:e(.+)|$)/.exec(value);

      if (m) {
        var epsilon = parseFloat("1e" + ((m[2] ? +m[2] : 0) + m[1].length));
        value = (Math.round(num * epsilon) / epsilon).toString();
      }

      var nibbles = "";
      var i, ii;

      for (i = 0, ii = value.length; i < ii; ++i) {
        var a = value[i];

        if (a === "e") {
          nibbles += value[++i] === "-" ? "c" : "b";
        } else if (a === ".") {
          nibbles += "a";
        } else if (a === "-") {
          nibbles += "e";
        } else {
          nibbles += a;
        }
      }

      nibbles += nibbles.length & 1 ? "f" : "ff";
      var out = [30];

      for (i = 0, ii = nibbles.length; i < ii; i += 2) {
        out.push(parseInt(nibbles.substring(i, i + 2), 16));
      }

      return out;
    },
    encodeInteger: function CFFCompiler_encodeInteger(value) {
      var code;

      if (value >= -107 && value <= 107) {
        code = [value + 139];
      } else if (value >= 108 && value <= 1131) {
        value = value - 108;
        code = [(value >> 8) + 247, value & 0xff];
      } else if (value >= -1131 && value <= -108) {
        value = -value - 108;
        code = [(value >> 8) + 251, value & 0xff];
      } else if (value >= -32768 && value <= 32767) {
        code = [0x1c, value >> 8 & 0xff, value & 0xff];
      } else {
        code = [0x1d, value >> 24 & 0xff, value >> 16 & 0xff, value >> 8 & 0xff, value & 0xff];
      }

      return code;
    },
    compileHeader: function CFFCompiler_compileHeader(header) {
      return [header.major, header.minor, header.hdrSize, header.offSize];
    },
    compileNameIndex: function CFFCompiler_compileNameIndex(names) {
      var nameIndex = new CFFIndex();

      for (var i = 0, ii = names.length; i < ii; ++i) {
        var name = names[i];
        var length = Math.min(name.length, 127);
        var sanitizedName = new Array(length);

        for (var j = 0; j < length; j++) {
          var char = name[j];

          if (char < "!" || char > "~" || char === "[" || char === "]" || char === "(" || char === ")" || char === "{" || char === "}" || char === "<" || char === ">" || char === "/" || char === "%") {
            char = "_";
          }

          sanitizedName[j] = char;
        }

        sanitizedName = sanitizedName.join("");

        if (sanitizedName === "") {
          sanitizedName = "Bad_Font_Name";
        }

        nameIndex.add((0, _util.stringToBytes)(sanitizedName));
      }

      return this.compileIndex(nameIndex);
    },
    compileTopDicts: function CFFCompiler_compileTopDicts(dicts, length, removeCidKeys) {
      var fontDictTrackers = [];
      var fdArrayIndex = new CFFIndex();

      for (var i = 0, ii = dicts.length; i < ii; ++i) {
        var fontDict = dicts[i];

        if (removeCidKeys) {
          fontDict.removeByName("CIDFontVersion");
          fontDict.removeByName("CIDFontRevision");
          fontDict.removeByName("CIDFontType");
          fontDict.removeByName("CIDCount");
          fontDict.removeByName("UIDBase");
        }

        var fontDictTracker = new CFFOffsetTracker();
        var fontDictData = this.compileDict(fontDict, fontDictTracker);
        fontDictTrackers.push(fontDictTracker);
        fdArrayIndex.add(fontDictData);
        fontDictTracker.offset(length);
      }

      fdArrayIndex = this.compileIndex(fdArrayIndex, fontDictTrackers);
      return {
        trackers: fontDictTrackers,
        output: fdArrayIndex
      };
    },
    compilePrivateDicts: function CFFCompiler_compilePrivateDicts(dicts, trackers, output) {
      for (var i = 0, ii = dicts.length; i < ii; ++i) {
        var fontDict = dicts[i];
        var privateDict = fontDict.privateDict;

        if (!privateDict || !fontDict.hasName("Private")) {
          throw new _util.FormatError("There must be a private dictionary.");
        }

        var privateDictTracker = new CFFOffsetTracker();
        var privateDictData = this.compileDict(privateDict, privateDictTracker);
        var outputLength = output.length;
        privateDictTracker.offset(outputLength);

        if (!privateDictData.length) {
          outputLength = 0;
        }

        trackers[i].setEntryLocation("Private", [privateDictData.length, outputLength], output);
        output.add(privateDictData);

        if (privateDict.subrsIndex && privateDict.hasName("Subrs")) {
          var subrs = this.compileIndex(privateDict.subrsIndex);
          privateDictTracker.setEntryLocation("Subrs", [privateDictData.length], output);
          output.add(subrs);
        }
      }
    },
    compileDict: function CFFCompiler_compileDict(dict, offsetTracker) {
      var out = [];
      var order = dict.order;

      for (var i = 0; i < order.length; ++i) {
        var key = order[i];

        if (!(key in dict.values)) {
          continue;
        }

        var values = dict.values[key];
        var types = dict.types[key];

        if (!Array.isArray(types)) {
          types = [types];
        }

        if (!Array.isArray(values)) {
          values = [values];
        }

        if (values.length === 0) {
          continue;
        }

        for (var j = 0, jj = types.length; j < jj; ++j) {
          var type = types[j];
          var value = values[j];

          switch (type) {
            case "num":
            case "sid":
              out = out.concat(this.encodeNumber(value));
              break;

            case "offset":
              var name = dict.keyToNameMap[key];

              if (!offsetTracker.isTracking(name)) {
                offsetTracker.track(name, out.length);
              }

              out = out.concat([0x1d, 0, 0, 0, 0]);
              break;

            case "array":
            case "delta":
              out = out.concat(this.encodeNumber(value));

              for (var k = 1, kk = values.length; k < kk; ++k) {
                out = out.concat(this.encodeNumber(values[k]));
              }

              break;

            default:
              throw new _util.FormatError(`Unknown data type of ${type}`);
          }
        }

        out = out.concat(dict.opcodes[key]);
      }

      return out;
    },
    compileStringIndex: function CFFCompiler_compileStringIndex(strings) {
      var stringIndex = new CFFIndex();

      for (var i = 0, ii = strings.length; i < ii; ++i) {
        stringIndex.add((0, _util.stringToBytes)(strings[i]));
      }

      return this.compileIndex(stringIndex);
    },
    compileGlobalSubrIndex: function CFFCompiler_compileGlobalSubrIndex() {
      var globalSubrIndex = this.cff.globalSubrIndex;
      this.out.writeByteArray(this.compileIndex(globalSubrIndex));
    },
    compileCharStrings: function CFFCompiler_compileCharStrings(charStrings) {
      var charStringsIndex = new CFFIndex();

      for (var i = 0; i < charStrings.count; i++) {
        var glyph = charStrings.get(i);

        if (glyph.length === 0) {
          charStringsIndex.add(new Uint8Array([0x8b, 0x0e]));
          continue;
        }

        charStringsIndex.add(glyph);
      }

      return this.compileIndex(charStringsIndex);
    },
    compileCharset: function CFFCompiler_compileCharset(charset, numGlyphs, strings, isCIDFont) {
      let out;
      const numGlyphsLessNotDef = numGlyphs - 1;

      if (isCIDFont) {
        out = new Uint8Array([2, 0, 0, numGlyphsLessNotDef >> 8 & 0xff, numGlyphsLessNotDef & 0xff]);
      } else {
        const length = 1 + numGlyphsLessNotDef * 2;
        out = new Uint8Array(length);
        out[0] = 0;
        let charsetIndex = 0;
        const numCharsets = charset.charset.length;
        let warned = false;

        for (let i = 1; i < out.length; i += 2) {
          let sid = 0;

          if (charsetIndex < numCharsets) {
            const name = charset.charset[charsetIndex++];
            sid = strings.getSID(name);

            if (sid === -1) {
              sid = 0;

              if (!warned) {
                warned = true;
                (0, _util.warn)(`Couldn't find ${name} in CFF strings`);
              }
            }
          }

          out[i] = sid >> 8 & 0xff;
          out[i + 1] = sid & 0xff;
        }
      }

      return this.compileTypedArray(out);
    },
    compileEncoding: function CFFCompiler_compileEncoding(encoding) {
      return this.compileTypedArray(encoding.raw);
    },
    compileFDSelect: function CFFCompiler_compileFDSelect(fdSelect) {
      const format = fdSelect.format;
      let out, i;

      switch (format) {
        case 0:
          out = new Uint8Array(1 + fdSelect.fdSelect.length);
          out[0] = format;

          for (i = 0; i < fdSelect.fdSelect.length; i++) {
            out[i + 1] = fdSelect.fdSelect[i];
          }

          break;

        case 3:
          const start = 0;
          let lastFD = fdSelect.fdSelect[0];
          const ranges = [format, 0, 0, start >> 8 & 0xff, start & 0xff, lastFD];

          for (i = 1; i < fdSelect.fdSelect.length; i++) {
            const currentFD = fdSelect.fdSelect[i];

            if (currentFD !== lastFD) {
              ranges.push(i >> 8 & 0xff, i & 0xff, currentFD);
              lastFD = currentFD;
            }
          }

          const numRanges = (ranges.length - 3) / 3;
          ranges[1] = numRanges >> 8 & 0xff;
          ranges[2] = numRanges & 0xff;
          ranges.push(i >> 8 & 0xff, i & 0xff);
          out = new Uint8Array(ranges);
          break;
      }

      return this.compileTypedArray(out);
    },
    compileTypedArray: function CFFCompiler_compileTypedArray(data) {
      var out = [];

      for (var i = 0, ii = data.length; i < ii; ++i) {
        out[i] = data[i];
      }

      return out;
    },
    compileIndex: function CFFCompiler_compileIndex(index, trackers) {
      trackers = trackers || [];
      var objects = index.objects;
      var count = objects.length;

      if (count === 0) {
        return [0, 0, 0];
      }

      var data = [count >> 8 & 0xff, count & 0xff];
      var lastOffset = 1,
          i;

      for (i = 0; i < count; ++i) {
        lastOffset += objects[i].length;
      }

      var offsetSize;

      if (lastOffset < 0x100) {
        offsetSize = 1;
      } else if (lastOffset < 0x10000) {
        offsetSize = 2;
      } else if (lastOffset < 0x1000000) {
        offsetSize = 3;
      } else {
        offsetSize = 4;
      }

      data.push(offsetSize);
      var relativeOffset = 1;

      for (i = 0; i < count + 1; i++) {
        if (offsetSize === 1) {
          data.push(relativeOffset & 0xff);
        } else if (offsetSize === 2) {
          data.push(relativeOffset >> 8 & 0xff, relativeOffset & 0xff);
        } else if (offsetSize === 3) {
          data.push(relativeOffset >> 16 & 0xff, relativeOffset >> 8 & 0xff, relativeOffset & 0xff);
        } else {
          data.push(relativeOffset >>> 24 & 0xff, relativeOffset >> 16 & 0xff, relativeOffset >> 8 & 0xff, relativeOffset & 0xff);
        }

        if (objects[i]) {
          relativeOffset += objects[i].length;
        }
      }

      for (i = 0; i < count; i++) {
        if (trackers[i]) {
          trackers[i].offset(data.length);
        }

        for (var j = 0, jj = objects[i].length; j < jj; j++) {
          data.push(objects[i][j]);
        }
      }

      return data;
    }
  };
  return CFFCompiler;
}();

exports.CFFCompiler = CFFCompiler;