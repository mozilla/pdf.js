/* Copyright 2016 Mozilla Foundation
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
  bytesToString,
  FormatError,
  info,
  shadow,
  stringToBytes,
  Util,
  warn,
} from "../shared/util.js";
import {
  ExpertCharset,
  ExpertSubsetCharset,
  ISOAdobeCharset,
} from "./charsets.js";
import { ExpertEncoding, StandardEncoding } from "./encodings.js";

// Maximum subroutine call depth of type 2 chartrings. Matches OTS.
const MAX_SUBR_NESTING = 10;

/**
 * The CFF class takes a Type1 file and wrap it into a
 * 'Compact Font Format' which itself embed Type2 charstrings.
 */
// prettier-ignore
const CFFStandardStrings = [
  ".notdef", "space", "exclam", "quotedbl", "numbersign", "dollar", "percent",
  "ampersand", "quoteright", "parenleft", "parenright", "asterisk", "plus",
  "comma", "hyphen", "period", "slash", "zero", "one", "two", "three", "four",
  "five", "six", "seven", "eight", "nine", "colon", "semicolon", "less",
  "equal", "greater", "question", "at", "A", "B", "C", "D", "E", "F", "G", "H",
  "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W",
  "X", "Y", "Z", "bracketleft", "backslash", "bracketright", "asciicircum",
  "underscore", "quoteleft", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j",
  "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y",
  "z", "braceleft", "bar", "braceright", "asciitilde", "exclamdown", "cent",
  "sterling", "fraction", "yen", "florin", "section", "currency",
  "quotesingle", "quotedblleft", "guillemotleft", "guilsinglleft",
  "guilsinglright", "fi", "fl", "endash", "dagger", "daggerdbl",
  "periodcentered", "paragraph", "bullet", "quotesinglbase", "quotedblbase",
  "quotedblright", "guillemotright", "ellipsis", "perthousand", "questiondown",
  "grave", "acute", "circumflex", "tilde", "macron", "breve", "dotaccent",
  "dieresis", "ring", "cedilla", "hungarumlaut", "ogonek", "caron", "emdash",
  "AE", "ordfeminine", "Lslash", "Oslash", "OE", "ordmasculine", "ae",
  "dotlessi", "lslash", "oslash", "oe", "germandbls", "onesuperior",
  "logicalnot", "mu", "trademark", "Eth", "onehalf", "plusminus", "Thorn",
  "onequarter", "divide", "brokenbar", "degree", "thorn", "threequarters",
  "twosuperior", "registered", "minus", "eth", "multiply", "threesuperior",
  "copyright", "Aacute", "Acircumflex", "Adieresis", "Agrave", "Aring",
  "Atilde", "Ccedilla", "Eacute", "Ecircumflex", "Edieresis", "Egrave",
  "Iacute", "Icircumflex", "Idieresis", "Igrave", "Ntilde", "Oacute",
  "Ocircumflex", "Odieresis", "Ograve", "Otilde", "Scaron", "Uacute",
  "Ucircumflex", "Udieresis", "Ugrave", "Yacute", "Ydieresis", "Zcaron",
  "aacute", "acircumflex", "adieresis", "agrave", "aring", "atilde",
  "ccedilla", "eacute", "ecircumflex", "edieresis", "egrave", "iacute",
  "icircumflex", "idieresis", "igrave", "ntilde", "oacute", "ocircumflex",
  "odieresis", "ograve", "otilde", "scaron", "uacute", "ucircumflex",
  "udieresis", "ugrave", "yacute", "ydieresis", "zcaron", "exclamsmall",
  "Hungarumlautsmall", "dollaroldstyle", "dollarsuperior", "ampersandsmall",
  "Acutesmall", "parenleftsuperior", "parenrightsuperior", "twodotenleader",
  "onedotenleader", "zerooldstyle", "oneoldstyle", "twooldstyle",
  "threeoldstyle", "fouroldstyle", "fiveoldstyle", "sixoldstyle",
  "sevenoldstyle", "eightoldstyle", "nineoldstyle", "commasuperior",
  "threequartersemdash", "periodsuperior", "questionsmall", "asuperior",
  "bsuperior", "centsuperior", "dsuperior", "esuperior", "isuperior",
  "lsuperior", "msuperior", "nsuperior", "osuperior", "rsuperior", "ssuperior",
  "tsuperior", "ff", "ffi", "ffl", "parenleftinferior", "parenrightinferior",
  "Circumflexsmall", "hyphensuperior", "Gravesmall", "Asmall", "Bsmall",
  "Csmall", "Dsmall", "Esmall", "Fsmall", "Gsmall", "Hsmall", "Ismall",
  "Jsmall", "Ksmall", "Lsmall", "Msmall", "Nsmall", "Osmall", "Psmall",
  "Qsmall", "Rsmall", "Ssmall", "Tsmall", "Usmall", "Vsmall", "Wsmall",
  "Xsmall", "Ysmall", "Zsmall", "colonmonetary", "onefitted", "rupiah",
  "Tildesmall", "exclamdownsmall", "centoldstyle", "Lslashsmall",
  "Scaronsmall", "Zcaronsmall", "Dieresissmall", "Brevesmall", "Caronsmall",
  "Dotaccentsmall", "Macronsmall", "figuredash", "hypheninferior",
  "Ogoneksmall", "Ringsmall", "Cedillasmall", "questiondownsmall", "oneeighth",
  "threeeighths", "fiveeighths", "seveneighths", "onethird", "twothirds",
  "zerosuperior", "foursuperior", "fivesuperior", "sixsuperior",
  "sevensuperior", "eightsuperior", "ninesuperior", "zeroinferior",
  "oneinferior", "twoinferior", "threeinferior", "fourinferior",
  "fiveinferior", "sixinferior", "seveninferior", "eightinferior",
  "nineinferior", "centinferior", "dollarinferior", "periodinferior",
  "commainferior", "Agravesmall", "Aacutesmall", "Acircumflexsmall",
  "Atildesmall", "Adieresissmall", "Aringsmall", "AEsmall", "Ccedillasmall",
  "Egravesmall", "Eacutesmall", "Ecircumflexsmall", "Edieresissmall",
  "Igravesmall", "Iacutesmall", "Icircumflexsmall", "Idieresissmall",
  "Ethsmall", "Ntildesmall", "Ogravesmall", "Oacutesmall", "Ocircumflexsmall",
  "Otildesmall", "Odieresissmall", "OEsmall", "Oslashsmall", "Ugravesmall",
  "Uacutesmall", "Ucircumflexsmall", "Udieresissmall", "Yacutesmall",
  "Thornsmall", "Ydieresissmall", "001.000", "001.001", "001.002", "001.003",
  "Black", "Bold", "Book", "Light", "Medium", "Regular", "Roman", "Semibold"
];

const NUM_STANDARD_CFF_STRINGS = 391;

const CFFParser = (function CFFParserClosure() {
  const CharstringValidationData = [
    null,
    { id: "hstem", min: 2, stackClearing: true, stem: true },
    null,
    { id: "vstem", min: 2, stackClearing: true, stem: true },
    { id: "vmoveto", min: 1, stackClearing: true },
    { id: "rlineto", min: 2, resetStack: true },
    { id: "hlineto", min: 1, resetStack: true },
    { id: "vlineto", min: 1, resetStack: true },
    { id: "rrcurveto", min: 6, resetStack: true },
    null,
    { id: "callsubr", min: 1, undefStack: true },
    { id: "return", min: 0, undefStack: true },
    null, // 12
    null,
    { id: "endchar", min: 0, stackClearing: true },
    null,
    null,
    null,
    { id: "hstemhm", min: 2, stackClearing: true, stem: true },
    { id: "hintmask", min: 0, stackClearing: true },
    { id: "cntrmask", min: 0, stackClearing: true },
    { id: "rmoveto", min: 2, stackClearing: true },
    { id: "hmoveto", min: 1, stackClearing: true },
    { id: "vstemhm", min: 2, stackClearing: true, stem: true },
    { id: "rcurveline", min: 8, resetStack: true },
    { id: "rlinecurve", min: 8, resetStack: true },
    { id: "vvcurveto", min: 4, resetStack: true },
    { id: "hhcurveto", min: 4, resetStack: true },
    null, // shortint
    { id: "callgsubr", min: 1, undefStack: true },
    { id: "vhcurveto", min: 4, resetStack: true },
    { id: "hvcurveto", min: 4, resetStack: true },
  ];
  const CharstringValidationData12 = [
    null,
    null,
    null,
    { id: "and", min: 2, stackDelta: -1 },
    { id: "or", min: 2, stackDelta: -1 },
    { id: "not", min: 1, stackDelta: 0 },
    null,
    null,
    null,
    { id: "abs", min: 1, stackDelta: 0 },
    {
      id: "add",
      min: 2,
      stackDelta: -1,
      stackFn: function stack_div(stack, index) {
        stack[index - 2] = stack[index - 2] + stack[index - 1];
      },
    },
    {
      id: "sub",
      min: 2,
      stackDelta: -1,
      stackFn: function stack_div(stack, index) {
        stack[index - 2] = stack[index - 2] - stack[index - 1];
      },
    },
    {
      id: "div",
      min: 2,
      stackDelta: -1,
      stackFn: function stack_div(stack, index) {
        stack[index - 2] = stack[index - 2] / stack[index - 1];
      },
    },
    null,
    {
      id: "neg",
      min: 1,
      stackDelta: 0,
      stackFn: function stack_div(stack, index) {
        stack[index - 1] = -stack[index - 1];
      },
    },
    { id: "eq", min: 2, stackDelta: -1 },
    null,
    null,
    { id: "drop", min: 1, stackDelta: -1 },
    null,
    { id: "put", min: 2, stackDelta: -2 },
    { id: "get", min: 1, stackDelta: 0 },
    { id: "ifelse", min: 4, stackDelta: -3 },
    { id: "random", min: 0, stackDelta: 1 },
    {
      id: "mul",
      min: 2,
      stackDelta: -1,
      stackFn: function stack_div(stack, index) {
        stack[index - 2] = stack[index - 2] * stack[index - 1];
      },
    },
    null,
    { id: "sqrt", min: 1, stackDelta: 0 },
    { id: "dup", min: 1, stackDelta: 1 },
    { id: "exch", min: 2, stackDelta: 0 },
    { id: "index", min: 2, stackDelta: 0 },
    { id: "roll", min: 3, stackDelta: -2 },
    null,
    null,
    null,
    { id: "hflex", min: 7, resetStack: true },
    { id: "flex", min: 13, resetStack: true },
    { id: "hflex1", min: 9, resetStack: true },
    { id: "flex1", min: 11, resetStack: true },
  ];

  // eslint-disable-next-line no-shadow
  class CFFParser {
    constructor(file, properties, seacAnalysisEnabled) {
      this.bytes = file.getBytes();
      this.properties = properties;
      this.seacAnalysisEnabled = !!seacAnalysisEnabled;
    }

    parse() {
      const properties = this.properties;
      const cff = new CFF();
      this.cff = cff;

      // The first five sections must be in order, all the others are reached
      // via offsets contained in one of the below.
      const header = this.parseHeader();
      const nameIndex = this.parseIndex(header.endPos);
      const topDictIndex = this.parseIndex(nameIndex.endPos);
      const stringIndex = this.parseIndex(topDictIndex.endPos);
      const globalSubrIndex = this.parseIndex(stringIndex.endPos);

      const topDictParsed = this.parseDict(topDictIndex.obj.get(0));
      const topDict = this.createDict(CFFTopDict, topDictParsed, cff.strings);

      cff.header = header.obj;
      cff.names = this.parseNameIndex(nameIndex.obj);
      cff.strings = this.parseStringIndex(stringIndex.obj);
      cff.topDict = topDict;
      cff.globalSubrIndex = globalSubrIndex.obj;

      this.parsePrivateDict(cff.topDict);

      cff.isCIDFont = topDict.hasName("ROS");

      const charStringOffset = topDict.getByName("CharStrings");
      const charStringIndex = this.parseIndex(charStringOffset).obj;

      const fontMatrix = topDict.getByName("FontMatrix");
      if (fontMatrix) {
        properties.fontMatrix = fontMatrix;
      }

      const fontBBox = topDict.getByName("FontBBox");
      if (fontBBox) {
        // adjusting ascent/descent
        properties.ascent = Math.max(fontBBox[3], fontBBox[1]);
        properties.descent = Math.min(fontBBox[1], fontBBox[3]);
        properties.ascentScaled = true;
      }

      let charset, encoding;
      if (cff.isCIDFont) {
        const fdArrayIndex = this.parseIndex(topDict.getByName("FDArray")).obj;
        for (let i = 0, ii = fdArrayIndex.count; i < ii; ++i) {
          const dictRaw = fdArrayIndex.get(i);
          const fontDict = this.createDict(
            CFFTopDict,
            this.parseDict(dictRaw),
            cff.strings
          );
          this.parsePrivateDict(fontDict);
          cff.fdArray.push(fontDict);
        }
        // cid fonts don't have an encoding
        encoding = null;
        charset = this.parseCharsets(
          topDict.getByName("charset"),
          charStringIndex.count,
          cff.strings,
          true
        );
        cff.fdSelect = this.parseFDSelect(
          topDict.getByName("FDSelect"),
          charStringIndex.count
        );
      } else {
        charset = this.parseCharsets(
          topDict.getByName("charset"),
          charStringIndex.count,
          cff.strings,
          false
        );
        encoding = this.parseEncoding(
          topDict.getByName("Encoding"),
          properties,
          cff.strings,
          charset.charset
        );
      }

      cff.charset = charset;
      cff.encoding = encoding;

      const charStringsAndSeacs = this.parseCharStrings({
        charStrings: charStringIndex,
        localSubrIndex: topDict.privateDict.subrsIndex,
        globalSubrIndex: globalSubrIndex.obj,
        fdSelect: cff.fdSelect,
        fdArray: cff.fdArray,
        privateDict: topDict.privateDict,
      });
      cff.charStrings = charStringsAndSeacs.charStrings;
      cff.seacs = charStringsAndSeacs.seacs;
      cff.widths = charStringsAndSeacs.widths;

      return cff;
    }

    parseHeader() {
      let bytes = this.bytes;
      const bytesLength = bytes.length;
      let offset = 0;

      // Prevent an infinite loop, by checking that the offset is within the
      // bounds of the bytes array. Necessary in empty, or invalid, font files.
      while (offset < bytesLength && bytes[offset] !== 1) {
        ++offset;
      }
      if (offset >= bytesLength) {
        throw new FormatError("Invalid CFF header");
      }
      if (offset !== 0) {
        info("cff data is shifted");
        bytes = bytes.subarray(offset);
        this.bytes = bytes;
      }
      const major = bytes[0];
      const minor = bytes[1];
      const hdrSize = bytes[2];
      const offSize = bytes[3];
      const header = new CFFHeader(major, minor, hdrSize, offSize);
      return { obj: header, endPos: hdrSize };
    }

    parseDict(dict) {
      let pos = 0;

      function parseOperand() {
        let value = dict[pos++];
        if (value === 30) {
          return parseFloatOperand();
        } else if (value === 28) {
          value = dict[pos++];
          value = ((value << 24) | (dict[pos++] << 16)) >> 16;
          return value;
        } else if (value === 29) {
          value = dict[pos++];
          value = (value << 8) | dict[pos++];
          value = (value << 8) | dict[pos++];
          value = (value << 8) | dict[pos++];
          return value;
        } else if (value >= 32 && value <= 246) {
          return value - 139;
        } else if (value >= 247 && value <= 250) {
          return (value - 247) * 256 + dict[pos++] + 108;
        } else if (value >= 251 && value <= 254) {
          return -((value - 251) * 256) - dict[pos++] - 108;
        }
        warn('CFFParser_parseDict: "' + value + '" is a reserved command.');
        return NaN;
      }

      function parseFloatOperand() {
        let str = "";
        const eof = 15;
        // prettier-ignore
        const lookup = ["0", "1", "2", "3", "4", "5", "6", "7", "8",
                        "9", ".", "E", "E-", null, "-"];
        const length = dict.length;
        while (pos < length) {
          const b = dict[pos++];
          const b1 = b >> 4;
          const b2 = b & 15;

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

      let operands = [];
      const entries = [];

      pos = 0;
      const end = dict.length;
      while (pos < end) {
        let b = dict[pos];
        if (b <= 21) {
          if (b === 12) {
            b = (b << 8) | dict[++pos];
          }
          entries.push([b, operands]);
          operands = [];
          ++pos;
        } else {
          operands.push(parseOperand());
        }
      }
      return entries;
    }

    parseIndex(pos) {
      const cffIndex = new CFFIndex();
      const bytes = this.bytes;
      const count = (bytes[pos++] << 8) | bytes[pos++];
      const offsets = [];
      let end = pos;
      let i, ii;

      if (count !== 0) {
        const offsetSize = bytes[pos++];
        // add 1 for offset to determine size of last object
        const startPos = pos + (count + 1) * offsetSize - 1;

        for (i = 0, ii = count + 1; i < ii; ++i) {
          let offset = 0;
          for (let j = 0; j < offsetSize; ++j) {
            offset <<= 8;
            offset += bytes[pos++];
          }
          offsets.push(startPos + offset);
        }
        end = offsets[count];
      }
      for (i = 0, ii = offsets.length - 1; i < ii; ++i) {
        const offsetStart = offsets[i];
        const offsetEnd = offsets[i + 1];
        cffIndex.add(bytes.subarray(offsetStart, offsetEnd));
      }
      return { obj: cffIndex, endPos: end };
    }

    parseNameIndex(index) {
      const names = [];
      for (let i = 0, ii = index.count; i < ii; ++i) {
        const name = index.get(i);
        names.push(bytesToString(name));
      }
      return names;
    }

    parseStringIndex(index) {
      const strings = new CFFStrings();
      for (let i = 0, ii = index.count; i < ii; ++i) {
        const data = index.get(i);
        strings.add(bytesToString(data));
      }
      return strings;
    }

    createDict(Type, dict, strings) {
      const cffDict = new Type(strings);
      for (let i = 0, ii = dict.length; i < ii; ++i) {
        const pair = dict[i];
        const key = pair[0];
        const value = pair[1];
        cffDict.setByKey(key, value);
      }
      return cffDict;
    }

    parseCharString(state, data, localSubrIndex, globalSubrIndex) {
      if (!data || state.callDepth > MAX_SUBR_NESTING) {
        return false;
      }
      let stackSize = state.stackSize;
      const stack = state.stack;

      const length = data.length;

      for (let j = 0; j < length; ) {
        const value = data[j++];
        let validationCommand = null;
        if (value === 12) {
          const q = data[j++];
          if (q === 0) {
            // The CFF specification state that the 'dotsection' command
            // (12, 0) is deprecated and treated as a no-op, but all Type2
            // charstrings processors should support them. Unfortunately
            // the font sanitizer don't. As a workaround the sequence (12, 0)
            // is replaced by a useless (0, hmoveto).
            data[j - 2] = 139;
            data[j - 1] = 22;
            stackSize = 0;
          } else {
            validationCommand = CharstringValidationData12[q];
          }
        } else if (value === 28) {
          // number (16 bit)
          stack[stackSize] = ((data[j] << 24) | (data[j + 1] << 16)) >> 16;
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
          // number
          stack[stackSize] = value - 139;
          stackSize++;
        } else if (value >= 247 && value <= 254) {
          // number (+1 bytes)
          stack[stackSize] =
            value < 251
              ? ((value - 247) << 8) + data[j] + 108
              : -((value - 251) << 8) - data[j] - 108;
          j++;
          stackSize++;
        } else if (value === 255) {
          // number (32 bit)
          stack[stackSize] =
            ((data[j] << 24) |
              (data[j + 1] << 16) |
              (data[j + 2] << 8) |
              data[j + 3]) /
            65536;
          j += 4;
          stackSize++;
        } else if (value === 19 || value === 20) {
          state.hints += stackSize >> 1;
          // skipping right amount of hints flag data
          j += (state.hints + 7) >> 3;
          stackSize %= 2;
          validationCommand = CharstringValidationData[value];
        } else if (value === 10 || value === 29) {
          let subrsIndex;
          if (value === 10) {
            subrsIndex = localSubrIndex;
          } else {
            subrsIndex = globalSubrIndex;
          }
          if (!subrsIndex) {
            validationCommand = CharstringValidationData[value];
            warn("Missing subrsIndex for " + validationCommand.id);
            return false;
          }
          let bias = 32768;
          if (subrsIndex.count < 1240) {
            bias = 107;
          } else if (subrsIndex.count < 33900) {
            bias = 1131;
          }
          const subrNumber = stack[--stackSize] + bias;
          if (
            subrNumber < 0 ||
            subrNumber >= subrsIndex.count ||
            isNaN(subrNumber)
          ) {
            validationCommand = CharstringValidationData[value];
            warn("Out of bounds subrIndex for " + validationCommand.id);
            return false;
          }
          state.stackSize = stackSize;
          state.callDepth++;
          const valid = this.parseCharString(
            state,
            subrsIndex.get(subrNumber),
            localSubrIndex,
            globalSubrIndex
          );
          if (!valid) {
            return false;
          }
          state.callDepth--;
          stackSize = state.stackSize;
          continue;
        } else if (value === 11) {
          state.stackSize = stackSize;
          return true;
        } else if (value === 0 && j === data.length) {
          // Operator 0 is not used according to the current spec and
          // it's the last char and consequently it's likely a terminator.
          // So just replace it by endchar command to make OTS happy.
          data[j - 1] = 14;
          validationCommand = CharstringValidationData[14];
        } else {
          validationCommand = CharstringValidationData[value];
        }
        if (validationCommand) {
          if (validationCommand.stem) {
            state.hints += stackSize >> 1;
            if (value === 3 || value === 23) {
              // vstem or vstemhm.
              state.hasVStems = true;
            } else if (state.hasVStems && (value === 1 || value === 18)) {
              // Some browsers don't draw glyphs that specify vstems before
              // hstems. As a workaround, replace hstem (1) and hstemhm (18)
              // with a pointless vstem (3) or vstemhm (23).
              warn("CFF stem hints are in wrong order");
              data[j - 1] = value === 1 ? 3 : 23;
            }
          }
          if ("min" in validationCommand) {
            if (!state.undefStack && stackSize < validationCommand.min) {
              warn(
                "Not enough parameters for " +
                  validationCommand.id +
                  "; actual: " +
                  stackSize +
                  ", expected: " +
                  validationCommand.min
              );

              if (stackSize === 0) {
                // Just "fix" the outline in replacing command by a endchar:
                // it could lead to wrong rendering of some glyphs or not.
                // For example, the pdf in #6132 is well-rendered.
                data[j - 1] = 14;
                return true;
              }
              return false;
            }
          }
          if (state.firstStackClearing && validationCommand.stackClearing) {
            state.firstStackClearing = false;
            // the optional character width can be found before the first
            // stack-clearing command arguments
            stackSize -= validationCommand.min;
            if (stackSize >= 2 && validationCommand.stem) {
              // there are even amount of arguments for stem commands
              stackSize %= 2;
            } else if (stackSize > 1) {
              warn("Found too many parameters for stack-clearing command");
            }
            if (stackSize > 0) {
              // Width can be any number since its the difference
              // from nominalWidthX.
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
    }

    parseCharStrings({
      charStrings,
      localSubrIndex,
      globalSubrIndex,
      fdSelect,
      fdArray,
      privateDict,
    }) {
      const seacs = [];
      const widths = [];
      const count = charStrings.count;
      for (let i = 0; i < count; i++) {
        const charstring = charStrings.get(i);
        const state = {
          callDepth: 0,
          stackSize: 0,
          stack: [],
          undefStack: true,
          hints: 0,
          firstStackClearing: true,
          seac: null,
          width: null,
          hasVStems: false,
        };
        let valid = true;
        let localSubrToUse = null;
        let privateDictToUse = privateDict;
        if (fdSelect && fdArray.length) {
          const fdIndex = fdSelect.getFDIndex(i);
          if (fdIndex === -1) {
            warn("Glyph index is not in fd select.");
            valid = false;
          }
          if (fdIndex >= fdArray.length) {
            warn("Invalid fd index for glyph index.");
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
          valid = this.parseCharString(
            state,
            charstring,
            localSubrToUse,
            globalSubrIndex
          );
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
          // resetting invalid charstring to single 'endchar'
          charStrings.set(i, new Uint8Array([14]));
        }
      }
      return { charStrings, seacs, widths };
    }

    emptyPrivateDictionary(parentDict) {
      const privateDict = this.createDict(
        CFFPrivateDict,
        [],
        parentDict.strings
      );
      parentDict.setByKey(18, [0, 0]);
      parentDict.privateDict = privateDict;
    }

    parsePrivateDict(parentDict) {
      // no private dict, do nothing
      if (!parentDict.hasName("Private")) {
        this.emptyPrivateDictionary(parentDict);
        return;
      }
      const privateOffset = parentDict.getByName("Private");
      // make sure the params are formatted correctly
      if (!Array.isArray(privateOffset) || privateOffset.length !== 2) {
        parentDict.removeByName("Private");
        return;
      }
      const size = privateOffset[0];
      const offset = privateOffset[1];
      // remove empty dicts or ones that refer to invalid location
      if (size === 0 || offset >= this.bytes.length) {
        this.emptyPrivateDictionary(parentDict);
        return;
      }

      const privateDictEnd = offset + size;
      const dictData = this.bytes.subarray(offset, privateDictEnd);
      const dict = this.parseDict(dictData);
      const privateDict = this.createDict(
        CFFPrivateDict,
        dict,
        parentDict.strings
      );
      parentDict.privateDict = privateDict;

      // Parse the Subrs index also since it's relative to the private dict.
      if (!privateDict.getByName("Subrs")) {
        return;
      }
      const subrsOffset = privateDict.getByName("Subrs");
      const relativeOffset = offset + subrsOffset;
      // Validate the offset.
      if (subrsOffset === 0 || relativeOffset >= this.bytes.length) {
        this.emptyPrivateDictionary(parentDict);
        return;
      }
      const subrsIndex = this.parseIndex(relativeOffset);
      privateDict.subrsIndex = subrsIndex.obj;
    }

    parseCharsets(pos, length, strings, cid) {
      if (pos === 0) {
        return new CFFCharset(
          true,
          CFFCharsetPredefinedTypes.ISO_ADOBE,
          ISOAdobeCharset
        );
      } else if (pos === 1) {
        return new CFFCharset(
          true,
          CFFCharsetPredefinedTypes.EXPERT,
          ExpertCharset
        );
      } else if (pos === 2) {
        return new CFFCharset(
          true,
          CFFCharsetPredefinedTypes.EXPERT_SUBSET,
          ExpertSubsetCharset
        );
      }

      const bytes = this.bytes;
      const start = pos;
      const format = bytes[pos++];
      const charset = [cid ? 0 : ".notdef"];
      let id, count, i;

      // subtract 1 for the .notdef glyph
      length -= 1;

      switch (format) {
        case 0:
          for (i = 0; i < length; i++) {
            id = (bytes[pos++] << 8) | bytes[pos++];
            charset.push(cid ? id : strings.get(id));
          }
          break;
        case 1:
          while (charset.length <= length) {
            id = (bytes[pos++] << 8) | bytes[pos++];
            count = bytes[pos++];
            for (i = 0; i <= count; i++) {
              charset.push(cid ? id++ : strings.get(id++));
            }
          }
          break;
        case 2:
          while (charset.length <= length) {
            id = (bytes[pos++] << 8) | bytes[pos++];
            count = (bytes[pos++] << 8) | bytes[pos++];
            for (i = 0; i <= count; i++) {
              charset.push(cid ? id++ : strings.get(id++));
            }
          }
          break;
        default:
          throw new FormatError("Unknown charset format");
      }
      // Raw won't be needed if we actually compile the charset.
      const end = pos;
      const raw = bytes.subarray(start, end);

      return new CFFCharset(false, format, charset, raw);
    }

    parseEncoding(pos, properties, strings, charset) {
      const encoding = Object.create(null);
      const bytes = this.bytes;
      let predefined = false;
      let format, i, ii;
      let raw = null;

      function readSupplement() {
        const supplementsCount = bytes[pos++];
        for (i = 0; i < supplementsCount; i++) {
          const code = bytes[pos++];
          const sid = (bytes[pos++] << 8) + (bytes[pos++] & 0xff);
          encoding[code] = charset.indexOf(strings.get(sid));
        }
      }

      if (pos === 0 || pos === 1) {
        predefined = true;
        format = pos;
        const baseEncoding = pos ? ExpertEncoding : StandardEncoding;
        for (i = 0, ii = charset.length; i < ii; i++) {
          const index = baseEncoding.indexOf(charset[i]);
          if (index !== -1) {
            encoding[index] = i;
          }
        }
      } else {
        const dataStart = pos;
        format = bytes[pos++];
        switch (format & 0x7f) {
          case 0:
            const glyphsCount = bytes[pos++];
            for (i = 1; i <= glyphsCount; i++) {
              encoding[bytes[pos++]] = i;
            }
            break;

          case 1:
            const rangesCount = bytes[pos++];
            let gid = 1;
            for (i = 0; i < rangesCount; i++) {
              const start = bytes[pos++];
              const left = bytes[pos++];
              for (let j = start; j <= start + left; j++) {
                encoding[j] = gid++;
              }
            }
            break;

          default:
            throw new FormatError(`Unknown encoding format: ${format} in CFF`);
        }
        const dataEnd = pos;
        if (format & 0x80) {
          // hasSupplement
          // The font sanitizer does not support CFF encoding with a
          // supplement, since the encoding is not really used to map
          // between gid to glyph, let's overwrite what is declared in
          // the top dictionary to let the sanitizer think the font use
          // StandardEncoding, that's a lie but that's ok.
          bytes[dataStart] &= 0x7f;
          readSupplement();
        }
        raw = bytes.subarray(dataStart, dataEnd);
      }
      format = format & 0x7f;
      return new CFFEncoding(predefined, format, encoding, raw);
    }

    parseFDSelect(pos, length) {
      const bytes = this.bytes;
      const format = bytes[pos++];
      const fdSelect = [];
      let i;

      switch (format) {
        case 0:
          for (i = 0; i < length; ++i) {
            const id = bytes[pos++];
            fdSelect.push(id);
          }
          break;
        case 3:
          const rangesCount = (bytes[pos++] << 8) | bytes[pos++];
          for (i = 0; i < rangesCount; ++i) {
            let first = (bytes[pos++] << 8) | bytes[pos++];
            if (i === 0 && first !== 0) {
              warn(
                "parseFDSelect: The first range must have a first GID of 0" +
                  " -- trying to recover."
              );
              first = 0;
            }
            const fdIndex = bytes[pos++];
            const next = (bytes[pos] << 8) | bytes[pos + 1];
            for (let j = first; j < next; ++j) {
              fdSelect.push(fdIndex);
            }
          }
          // Advance past the sentinel(next).
          pos += 2;
          break;
        default:
          throw new FormatError(`parseFDSelect: Unknown format "${format}".`);
      }
      if (fdSelect.length !== length) {
        throw new FormatError("parseFDSelect: Invalid font data.");
      }

      return new CFFFDSelect(format, fdSelect);
    }
  }
  return CFFParser;
})();

// Compact Font Format
class CFF {
  constructor() {
    this.header = null;
    this.names = [];
    this.topDict = null;
    this.strings = new CFFStrings();
    this.globalSubrIndex = null;

    // The following could really be per font, but since we only have one font
    // store them here.
    this.encoding = null;
    this.charset = null;
    this.charStrings = null;
    this.fdArray = [];
    this.fdSelect = null;

    this.isCIDFont = false;
  }

  duplicateFirstGlyph() {
    // Browsers will not display a glyph at position 0. Typically glyph 0 is
    // notdef, but a number of fonts put a valid glyph there so it must be
    // duplicated and appended.
    if (this.charStrings.count >= 65535) {
      warn("Not enough space in charstrings to duplicate first glyph.");
      return;
    }
    const glyphZero = this.charStrings.get(0);
    this.charStrings.add(glyphZero);
    if (this.isCIDFont) {
      this.fdSelect.fdSelect.push(this.fdSelect.fdSelect[0]);
    }
  }

  hasGlyphId(id) {
    if (id < 0 || id >= this.charStrings.count) {
      return false;
    }
    const glyph = this.charStrings.get(id);
    return glyph.length > 0;
  }
}

class CFFHeader {
  constructor(major, minor, hdrSize, offSize) {
    this.major = major;
    this.minor = minor;
    this.hdrSize = hdrSize;
    this.offSize = offSize;
  }
}

class CFFStrings {
  constructor() {
    this.strings = [];
  }

  get(index) {
    if (index >= 0 && index <= NUM_STANDARD_CFF_STRINGS - 1) {
      return CFFStandardStrings[index];
    }
    if (index - NUM_STANDARD_CFF_STRINGS <= this.strings.length) {
      return this.strings[index - NUM_STANDARD_CFF_STRINGS];
    }
    return CFFStandardStrings[0];
  }

  getSID(str) {
    let index = CFFStandardStrings.indexOf(str);
    if (index !== -1) {
      return index;
    }
    index = this.strings.indexOf(str);
    if (index !== -1) {
      return index + NUM_STANDARD_CFF_STRINGS;
    }
    return -1;
  }

  add(value) {
    this.strings.push(value);
  }

  get count() {
    return this.strings.length;
  }
}

class CFFIndex {
  constructor() {
    this.objects = [];
    this.length = 0;
  }

  add(data) {
    this.length += data.length;
    this.objects.push(data);
  }

  set(index, data) {
    this.length += data.length - this.objects[index].length;
    this.objects[index] = data;
  }

  get(index) {
    return this.objects[index];
  }

  get count() {
    return this.objects.length;
  }
}

class CFFDict {
  constructor(tables, strings) {
    this.keyToNameMap = tables.keyToNameMap;
    this.nameToKeyMap = tables.nameToKeyMap;
    this.defaults = tables.defaults;
    this.types = tables.types;
    this.opcodes = tables.opcodes;
    this.order = tables.order;
    this.strings = strings;
    this.values = Object.create(null);
  }

  // value should always be an array
  setByKey(key, value) {
    if (!(key in this.keyToNameMap)) {
      return false;
    }
    const valueLength = value.length;
    // ignore empty values
    if (valueLength === 0) {
      return true;
    }
    // Ignore invalid values (fixes bug1068432.pdf and bug1308536.pdf).
    for (let i = 0; i < valueLength; i++) {
      if (isNaN(value[i])) {
        warn('Invalid CFFDict value: "' + value + '" for key "' + key + '".');
        return true;
      }
    }
    const type = this.types[key];
    // remove the array wrapping these types of values
    if (type === "num" || type === "sid" || type === "offset") {
      value = value[0];
    }
    this.values[key] = value;
    return true;
  }

  setByName(name, value) {
    if (!(name in this.nameToKeyMap)) {
      throw new FormatError(`Invalid dictionary name "${name}"`);
    }
    this.values[this.nameToKeyMap[name]] = value;
  }

  hasName(name) {
    return this.nameToKeyMap[name] in this.values;
  }

  getByName(name) {
    if (!(name in this.nameToKeyMap)) {
      throw new FormatError(`Invalid dictionary name ${name}"`);
    }
    const key = this.nameToKeyMap[name];
    if (!(key in this.values)) {
      return this.defaults[key];
    }
    return this.values[key];
  }

  removeByName(name) {
    delete this.values[this.nameToKeyMap[name]];
  }

  static createTables(layout) {
    const tables = {
      keyToNameMap: {},
      nameToKeyMap: {},
      defaults: {},
      types: {},
      opcodes: {},
      order: [],
    };
    for (let i = 0, ii = layout.length; i < ii; ++i) {
      const entry = layout[i];
      const key = Array.isArray(entry[0])
        ? (entry[0][0] << 8) + entry[0][1]
        : entry[0];
      tables.keyToNameMap[key] = entry[1];
      tables.nameToKeyMap[entry[1]] = key;
      tables.types[key] = entry[2];
      tables.defaults[key] = entry[3];
      tables.opcodes[key] = Array.isArray(entry[0]) ? entry[0] : [entry[0]];
      tables.order.push(key);
    }
    return tables;
  }
}

const CFFTopDict = (function CFFTopDictClosure() {
  const layout = [
    [[12, 30], "ROS", ["sid", "sid", "num"], null],
    [[12, 20], "SyntheticBase", "num", null],
    [0, "version", "sid", null],
    [1, "Notice", "sid", null],
    [[12, 0], "Copyright", "sid", null],
    [2, "FullName", "sid", null],
    [3, "FamilyName", "sid", null],
    [4, "Weight", "sid", null],
    [[12, 1], "isFixedPitch", "num", 0],
    [[12, 2], "ItalicAngle", "num", 0],
    [[12, 3], "UnderlinePosition", "num", -100],
    [[12, 4], "UnderlineThickness", "num", 50],
    [[12, 5], "PaintType", "num", 0],
    [[12, 6], "CharstringType", "num", 2],
    // prettier-ignore
    [[12, 7], "FontMatrix", ["num", "num", "num", "num", "num", "num"],
                            [0.001, 0, 0, 0.001, 0, 0]],
    [13, "UniqueID", "num", null],
    [5, "FontBBox", ["num", "num", "num", "num"], [0, 0, 0, 0]],
    [[12, 8], "StrokeWidth", "num", 0],
    [14, "XUID", "array", null],
    [15, "charset", "offset", 0],
    [16, "Encoding", "offset", 0],
    [17, "CharStrings", "offset", 0],
    [18, "Private", ["offset", "offset"], null],
    [[12, 21], "PostScript", "sid", null],
    [[12, 22], "BaseFontName", "sid", null],
    [[12, 23], "BaseFontBlend", "delta", null],
    [[12, 31], "CIDFontVersion", "num", 0],
    [[12, 32], "CIDFontRevision", "num", 0],
    [[12, 33], "CIDFontType", "num", 0],
    [[12, 34], "CIDCount", "num", 8720],
    [[12, 35], "UIDBase", "num", null],
    // XXX: CID Fonts on DirectWrite 6.1 only seem to work if FDSelect comes
    // before FDArray.
    [[12, 37], "FDSelect", "offset", null],
    [[12, 36], "FDArray", "offset", null],
    [[12, 38], "FontName", "sid", null],
  ];
  let tables = null;

  // eslint-disable-next-line no-shadow
  class CFFTopDict extends CFFDict {
    constructor(strings) {
      if (tables === null) {
        tables = CFFDict.createTables(layout);
      }
      super(tables, strings);
      this.privateDict = null;
    }
  }
  return CFFTopDict;
})();

const CFFPrivateDict = (function CFFPrivateDictClosure() {
  const layout = [
    [6, "BlueValues", "delta", null],
    [7, "OtherBlues", "delta", null],
    [8, "FamilyBlues", "delta", null],
    [9, "FamilyOtherBlues", "delta", null],
    [[12, 9], "BlueScale", "num", 0.039625],
    [[12, 10], "BlueShift", "num", 7],
    [[12, 11], "BlueFuzz", "num", 1],
    [10, "StdHW", "num", null],
    [11, "StdVW", "num", null],
    [[12, 12], "StemSnapH", "delta", null],
    [[12, 13], "StemSnapV", "delta", null],
    [[12, 14], "ForceBold", "num", 0],
    [[12, 17], "LanguageGroup", "num", 0],
    [[12, 18], "ExpansionFactor", "num", 0.06],
    [[12, 19], "initialRandomSeed", "num", 0],
    [20, "defaultWidthX", "num", 0],
    [21, "nominalWidthX", "num", 0],
    [19, "Subrs", "offset", null],
  ];
  let tables = null;

  // eslint-disable-next-line no-shadow
  class CFFPrivateDict extends CFFDict {
    constructor(strings) {
      if (tables === null) {
        tables = CFFDict.createTables(layout);
      }
      super(tables, strings);
      this.subrsIndex = null;
    }
  }
  return CFFPrivateDict;
})();

const CFFCharsetPredefinedTypes = {
  ISO_ADOBE: 0,
  EXPERT: 1,
  EXPERT_SUBSET: 2,
};

class CFFCharset {
  constructor(predefined, format, charset, raw) {
    this.predefined = predefined;
    this.format = format;
    this.charset = charset;
    this.raw = raw;
  }
}

class CFFEncoding {
  constructor(predefined, format, encoding, raw) {
    this.predefined = predefined;
    this.format = format;
    this.encoding = encoding;
    this.raw = raw;
  }
}

class CFFFDSelect {
  constructor(format, fdSelect) {
    this.format = format;
    this.fdSelect = fdSelect;
  }

  getFDIndex(glyphIndex) {
    if (glyphIndex < 0 || glyphIndex >= this.fdSelect.length) {
      return -1;
    }
    return this.fdSelect[glyphIndex];
  }
}

// Helper class to keep track of where an offset is within the data and helps
// filling in that offset once it's known.
class CFFOffsetTracker {
  constructor() {
    this.offsets = Object.create(null);
  }

  isTracking(key) {
    return key in this.offsets;
  }

  track(key, location) {
    if (key in this.offsets) {
      throw new FormatError(`Already tracking location of ${key}`);
    }
    this.offsets[key] = location;
  }

  offset(value) {
    for (const key in this.offsets) {
      this.offsets[key] += value;
    }
  }

  setEntryLocation(key, values, output) {
    if (!(key in this.offsets)) {
      throw new FormatError(`Not tracking location of ${key}`);
    }
    const data = output.data;
    const dataOffset = this.offsets[key];
    const size = 5;
    for (let i = 0, ii = values.length; i < ii; ++i) {
      const offset0 = i * size + dataOffset;
      const offset1 = offset0 + 1;
      const offset2 = offset0 + 2;
      const offset3 = offset0 + 3;
      const offset4 = offset0 + 4;
      // It's easy to screw up offsets so perform this sanity check.
      if (
        data[offset0] !== 0x1d ||
        data[offset1] !== 0 ||
        data[offset2] !== 0 ||
        data[offset3] !== 0 ||
        data[offset4] !== 0
      ) {
        throw new FormatError("writing to an offset that is not empty");
      }
      const value = values[i];
      data[offset0] = 0x1d;
      data[offset1] = (value >> 24) & 0xff;
      data[offset2] = (value >> 16) & 0xff;
      data[offset3] = (value >> 8) & 0xff;
      data[offset4] = value & 0xff;
    }
  }
}

// Takes a CFF and converts it to the binary representation.
class CFFCompiler {
  constructor(cff) {
    this.cff = cff;
  }

  compile() {
    const cff = this.cff;
    const output = {
      data: [],
      length: 0,
      add: function CFFCompiler_add(data) {
        this.data = this.data.concat(data);
        this.length = this.data.length;
      },
    };

    // Compile the five entries that must be in order.
    const header = this.compileHeader(cff.header);
    output.add(header);

    const nameIndex = this.compileNameIndex(cff.names);
    output.add(nameIndex);

    if (cff.isCIDFont) {
      // The spec is unclear on how font matrices should relate to each other
      // when there is one in the main top dict and the sub top dicts.
      // Windows handles this differently than linux and osx so we have to
      // normalize to work on all.
      // Rules based off of some mailing list discussions:
      // - If main font has a matrix and subfont doesn't, use the main matrix.
      // - If no main font matrix and there is a subfont matrix, use the
      //   subfont matrix.
      // - If both have matrices, concat together.
      // - If neither have matrices, use default.
      // To make this work on all platforms we move the top matrix into each
      // sub top dict and concat if necessary.
      if (cff.topDict.hasName("FontMatrix")) {
        const base = cff.topDict.getByName("FontMatrix");
        cff.topDict.removeByName("FontMatrix");
        for (let i = 0, ii = cff.fdArray.length; i < ii; i++) {
          const subDict = cff.fdArray[i];
          let matrix = base.slice(0);
          if (subDict.hasName("FontMatrix")) {
            matrix = Util.transform(matrix, subDict.getByName("FontMatrix"));
          }
          subDict.setByName("FontMatrix", matrix);
        }
      }
    }

    const xuid = cff.topDict.getByName("XUID");
    if (xuid && xuid.length > 16) {
      // Length of XUID array must not be greater than 16 (issue #12399).
      cff.topDict.removeByName("XUID");
    }

    cff.topDict.setByName("charset", 0);
    let compiled = this.compileTopDicts(
      [cff.topDict],
      output.length,
      cff.isCIDFont
    );
    output.add(compiled.output);
    const topDictTracker = compiled.trackers[0];

    const stringIndex = this.compileStringIndex(cff.strings.strings);
    output.add(stringIndex);

    const globalSubrIndex = this.compileIndex(cff.globalSubrIndex);
    output.add(globalSubrIndex);

    // Now start on the other entries that have no specific order.
    if (cff.encoding && cff.topDict.hasName("Encoding")) {
      if (cff.encoding.predefined) {
        topDictTracker.setEntryLocation(
          "Encoding",
          [cff.encoding.format],
          output
        );
      } else {
        const encoding = this.compileEncoding(cff.encoding);
        topDictTracker.setEntryLocation("Encoding", [output.length], output);
        output.add(encoding);
      }
    }
    const charset = this.compileCharset(
      cff.charset,
      cff.charStrings.count,
      cff.strings,
      cff.isCIDFont
    );
    topDictTracker.setEntryLocation("charset", [output.length], output);
    output.add(charset);

    const charStrings = this.compileCharStrings(cff.charStrings);
    topDictTracker.setEntryLocation("CharStrings", [output.length], output);
    output.add(charStrings);

    if (cff.isCIDFont) {
      // For some reason FDSelect must be in front of FDArray on windows. OSX
      // and linux don't seem to care.
      topDictTracker.setEntryLocation("FDSelect", [output.length], output);
      const fdSelect = this.compileFDSelect(cff.fdSelect);
      output.add(fdSelect);
      // It is unclear if the sub font dictionary can have CID related
      // dictionary keys, but the sanitizer doesn't like them so remove them.
      compiled = this.compileTopDicts(cff.fdArray, output.length, true);
      topDictTracker.setEntryLocation("FDArray", [output.length], output);
      output.add(compiled.output);
      const fontDictTrackers = compiled.trackers;

      this.compilePrivateDicts(cff.fdArray, fontDictTrackers, output);
    }

    this.compilePrivateDicts([cff.topDict], [topDictTracker], output);

    // If the font data ends with INDEX whose object data is zero-length,
    // the sanitizer will bail out. Add a dummy byte to avoid that.
    output.add([0]);

    return output.data;
  }

  encodeNumber(value) {
    if (Number.isInteger(value)) {
      return this.encodeInteger(value);
    }
    return this.encodeFloat(value);
  }

  static get EncodeFloatRegExp() {
    return shadow(
      this,
      "EncodeFloatRegExp",
      /\.(\d*?)(?:9{5,20}|0{5,20})\d{0,2}(?:e(.+)|$)/
    );
  }

  encodeFloat(num) {
    let value = num.toString();

    // Rounding inaccurate doubles.
    const m = CFFCompiler.EncodeFloatRegExp.exec(value);
    if (m) {
      const epsilon = parseFloat("1e" + ((m[2] ? +m[2] : 0) + m[1].length));
      value = (Math.round(num * epsilon) / epsilon).toString();
    }

    let nibbles = "";
    let i, ii;
    for (i = 0, ii = value.length; i < ii; ++i) {
      const a = value[i];
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
    const out = [30];
    for (i = 0, ii = nibbles.length; i < ii; i += 2) {
      out.push(parseInt(nibbles.substring(i, i + 2), 16));
    }
    return out;
  }

  encodeInteger(value) {
    let code;
    if (value >= -107 && value <= 107) {
      code = [value + 139];
    } else if (value >= 108 && value <= 1131) {
      value = value - 108;
      code = [(value >> 8) + 247, value & 0xff];
    } else if (value >= -1131 && value <= -108) {
      value = -value - 108;
      code = [(value >> 8) + 251, value & 0xff];
    } else if (value >= -32768 && value <= 32767) {
      code = [0x1c, (value >> 8) & 0xff, value & 0xff];
    } else {
      code = [
        0x1d,
        (value >> 24) & 0xff,
        (value >> 16) & 0xff,
        (value >> 8) & 0xff,
        value & 0xff,
      ];
    }
    return code;
  }

  compileHeader(header) {
    // `header.hdrSize` can be any value but we only write 4 values
    // so header size is 4 (prevents OTS from rejecting the font).
    return [header.major, header.minor, 4, header.offSize];
  }

  compileNameIndex(names) {
    const nameIndex = new CFFIndex();
    for (let i = 0, ii = names.length; i < ii; ++i) {
      const name = names[i];
      // OTS doesn't allow names to be over 127 characters.
      const length = Math.min(name.length, 127);
      let sanitizedName = new Array(length);
      for (let j = 0; j < length; j++) {
        // OTS requires chars to be between a range and not certain other
        // chars.
        let char = name[j];
        if (
          char < "!" ||
          char > "~" ||
          char === "[" ||
          char === "]" ||
          char === "(" ||
          char === ")" ||
          char === "{" ||
          char === "}" ||
          char === "<" ||
          char === ">" ||
          char === "/" ||
          char === "%"
        ) {
          char = "_";
        }
        sanitizedName[j] = char;
      }
      sanitizedName = sanitizedName.join("");

      if (sanitizedName === "") {
        sanitizedName = "Bad_Font_Name";
      }
      nameIndex.add(stringToBytes(sanitizedName));
    }
    return this.compileIndex(nameIndex);
  }

  compileTopDicts(dicts, length, removeCidKeys) {
    const fontDictTrackers = [];
    let fdArrayIndex = new CFFIndex();
    for (let i = 0, ii = dicts.length; i < ii; ++i) {
      const fontDict = dicts[i];
      if (removeCidKeys) {
        fontDict.removeByName("CIDFontVersion");
        fontDict.removeByName("CIDFontRevision");
        fontDict.removeByName("CIDFontType");
        fontDict.removeByName("CIDCount");
        fontDict.removeByName("UIDBase");
      }
      const fontDictTracker = new CFFOffsetTracker();
      const fontDictData = this.compileDict(fontDict, fontDictTracker);
      fontDictTrackers.push(fontDictTracker);
      fdArrayIndex.add(fontDictData);
      fontDictTracker.offset(length);
    }
    fdArrayIndex = this.compileIndex(fdArrayIndex, fontDictTrackers);
    return {
      trackers: fontDictTrackers,
      output: fdArrayIndex,
    };
  }

  compilePrivateDicts(dicts, trackers, output) {
    for (let i = 0, ii = dicts.length; i < ii; ++i) {
      const fontDict = dicts[i];
      const privateDict = fontDict.privateDict;
      if (!privateDict || !fontDict.hasName("Private")) {
        throw new FormatError("There must be a private dictionary.");
      }
      const privateDictTracker = new CFFOffsetTracker();
      const privateDictData = this.compileDict(privateDict, privateDictTracker);

      let outputLength = output.length;
      privateDictTracker.offset(outputLength);
      if (!privateDictData.length) {
        // The private dictionary was empty, set the output length to zero to
        // ensure the offset length isn't out of bounds in the eyes of the
        // sanitizer.
        outputLength = 0;
      }

      trackers[i].setEntryLocation(
        "Private",
        [privateDictData.length, outputLength],
        output
      );
      output.add(privateDictData);

      if (privateDict.subrsIndex && privateDict.hasName("Subrs")) {
        const subrs = this.compileIndex(privateDict.subrsIndex);
        privateDictTracker.setEntryLocation(
          "Subrs",
          [privateDictData.length],
          output
        );
        output.add(subrs);
      }
    }
  }

  compileDict(dict, offsetTracker) {
    let out = [];
    // The dictionary keys must be in a certain order.
    const order = dict.order;
    for (let i = 0; i < order.length; ++i) {
      const key = order[i];
      if (!(key in dict.values)) {
        continue;
      }
      let values = dict.values[key];
      let types = dict.types[key];
      if (!Array.isArray(types)) {
        types = [types];
      }
      if (!Array.isArray(values)) {
        values = [values];
      }

      // Remove any empty dict values.
      if (values.length === 0) {
        continue;
      }

      for (let j = 0, jj = types.length; j < jj; ++j) {
        const type = types[j];
        const value = values[j];
        switch (type) {
          case "num":
          case "sid":
            out = out.concat(this.encodeNumber(value));
            break;
          case "offset":
            // For offsets we just insert a 32bit integer so we don't have to
            // deal with figuring out the length of the offset when it gets
            // replaced later on by the compiler.
            const name = dict.keyToNameMap[key];
            // Some offsets have the offset and the length, so just record the
            // position of the first one.
            if (!offsetTracker.isTracking(name)) {
              offsetTracker.track(name, out.length);
            }
            out = out.concat([0x1d, 0, 0, 0, 0]);
            break;
          case "array":
          case "delta":
            out = out.concat(this.encodeNumber(value));
            for (let k = 1, kk = values.length; k < kk; ++k) {
              out = out.concat(this.encodeNumber(values[k]));
            }
            break;
          default:
            throw new FormatError(`Unknown data type of ${type}`);
        }
      }
      out = out.concat(dict.opcodes[key]);
    }
    return out;
  }

  compileStringIndex(strings) {
    const stringIndex = new CFFIndex();
    for (let i = 0, ii = strings.length; i < ii; ++i) {
      stringIndex.add(stringToBytes(strings[i]));
    }
    return this.compileIndex(stringIndex);
  }

  compileGlobalSubrIndex() {
    const globalSubrIndex = this.cff.globalSubrIndex;
    this.out.writeByteArray(this.compileIndex(globalSubrIndex));
  }

  compileCharStrings(charStrings) {
    const charStringsIndex = new CFFIndex();
    for (let i = 0; i < charStrings.count; i++) {
      const glyph = charStrings.get(i);
      // If the CharString outline is empty, replace it with .notdef to
      // prevent OTS from rejecting the font (fixes bug1252420.pdf).
      if (glyph.length === 0) {
        charStringsIndex.add(new Uint8Array([0x8b, 0x0e]));
        continue;
      }
      charStringsIndex.add(glyph);
    }
    return this.compileIndex(charStringsIndex);
  }

  compileCharset(charset, numGlyphs, strings, isCIDFont) {
    // Freetype requires the number of charset strings be correct and MacOS
    // requires a valid mapping for printing.
    let out;
    const numGlyphsLessNotDef = numGlyphs - 1;
    if (isCIDFont) {
      // In a CID font, the charset is a mapping of CIDs not SIDs so just
      // create an identity mapping.
      out = new Uint8Array([
        2, // format
        0, // first CID upper byte
        0, // first CID lower byte
        (numGlyphsLessNotDef >> 8) & 0xff,
        numGlyphsLessNotDef & 0xff,
      ]);
    } else {
      const length = 1 + numGlyphsLessNotDef * 2;
      out = new Uint8Array(length);
      out[0] = 0; // format 0
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
              warn(`Couldn't find ${name} in CFF strings`);
            }
          }
        }
        out[i] = (sid >> 8) & 0xff;
        out[i + 1] = sid & 0xff;
      }
    }
    return this.compileTypedArray(out);
  }

  compileEncoding(encoding) {
    return this.compileTypedArray(encoding.raw);
  }

  compileFDSelect(fdSelect) {
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
        const ranges = [
          format,
          0, // nRanges place holder
          0, // nRanges place holder
          (start >> 8) & 0xff,
          start & 0xff,
          lastFD,
        ];
        for (i = 1; i < fdSelect.fdSelect.length; i++) {
          const currentFD = fdSelect.fdSelect[i];
          if (currentFD !== lastFD) {
            ranges.push((i >> 8) & 0xff, i & 0xff, currentFD);
            lastFD = currentFD;
          }
        }
        // 3 bytes are pushed for every range and there are 3 header bytes.
        const numRanges = (ranges.length - 3) / 3;
        ranges[1] = (numRanges >> 8) & 0xff;
        ranges[2] = numRanges & 0xff;
        // sentinel
        ranges.push((i >> 8) & 0xff, i & 0xff);
        out = new Uint8Array(ranges);
        break;
    }
    return this.compileTypedArray(out);
  }

  compileTypedArray(data) {
    const out = [];
    for (let i = 0, ii = data.length; i < ii; ++i) {
      out[i] = data[i];
    }
    return out;
  }

  compileIndex(index, trackers = []) {
    const objects = index.objects;
    // First 2 bytes contains the number of objects contained into this index
    const count = objects.length;

    // If there is no object, just create an index. This technically
    // should just be [0, 0] but OTS has an issue with that.
    if (count === 0) {
      return [0, 0, 0];
    }

    const data = [(count >> 8) & 0xff, count & 0xff];

    let lastOffset = 1,
      i;
    for (i = 0; i < count; ++i) {
      lastOffset += objects[i].length;
    }

    let offsetSize;
    if (lastOffset < 0x100) {
      offsetSize = 1;
    } else if (lastOffset < 0x10000) {
      offsetSize = 2;
    } else if (lastOffset < 0x1000000) {
      offsetSize = 3;
    } else {
      offsetSize = 4;
    }

    // Next byte contains the offset size use to reference object in the file
    data.push(offsetSize);

    // Add another offset after this one because we need a new offset
    let relativeOffset = 1;
    for (i = 0; i < count + 1; i++) {
      if (offsetSize === 1) {
        data.push(relativeOffset & 0xff);
      } else if (offsetSize === 2) {
        data.push((relativeOffset >> 8) & 0xff, relativeOffset & 0xff);
      } else if (offsetSize === 3) {
        data.push(
          (relativeOffset >> 16) & 0xff,
          (relativeOffset >> 8) & 0xff,
          relativeOffset & 0xff
        );
      } else {
        data.push(
          (relativeOffset >>> 24) & 0xff,
          (relativeOffset >> 16) & 0xff,
          (relativeOffset >> 8) & 0xff,
          relativeOffset & 0xff
        );
      }

      if (objects[i]) {
        relativeOffset += objects[i].length;
      }
    }

    for (i = 0; i < count; i++) {
      // Notify the tracker where the object will be offset in the data.
      if (trackers[i]) {
        trackers[i].offset(data.length);
      }
      for (let j = 0, jj = objects[i].length; j < jj; j++) {
        data.push(objects[i][j]);
      }
    }
    return data;
  }
}

export {
  CFF,
  CFFCharset,
  CFFCompiler,
  CFFFDSelect,
  CFFHeader,
  CFFIndex,
  CFFParser,
  CFFPrivateDict,
  CFFStandardStrings,
  CFFStrings,
  CFFTopDict,
};
