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
/* globals CFFDictDataMap, CFFDictPrivateDataMap, CFFEncodingMap, CFFStrings,
           Components, Dict, dump, FormatError, isNum, netscape, Stream */
/* eslint no-var: error, prefer-const: error */

'use strict';

/*
 * The Type2 reader code below is only used for debugging purpose since Type2
 * is only a CharString format and is never used directly as a Font file.
 *
 * So the code here is useful for dumping the data content of a .cff file in
 * order to investigate the similarity between a Type1 CharString and a Type2
 * CharString or to understand the structure of the CFF format.
 */

/*
 * Build a charset by assigning the glyph name and the human readable form
 * of the glyph data.
 */
function readCharset(aStream, aCharstrings) {
  const charset = {};

  const format = aStream.getByte();
  const count = aCharstrings.length - 1;
  let sid;
  if (format === 0) {
    charset['.notdef'] = readCharstringEncoding(aCharstrings[0]);

    for (let i = 1; i < count + 1; i++) {
      sid = aStream.getByte() << 8 | aStream.getByte();
      charset[CFFStrings[sid]] = readCharstringEncoding(aCharstrings[i]);
    }
  } else if (format === 1) {
    for (let i = 1; i < count + 1; i++) {
      let first = aStream.getByte();
      first = (first << 8) | aStream.getByte();
      const numLeft = aStream.getByte();
      for (let j = 0; j <= numLeft; j++) {
        sid = first++;
        charset[CFFStrings[sid]] = readCharstringEncoding(aCharstrings[j]);
      }
    }
  } else {
    throw new FormatError('Invalid charset format');
  }

  return charset;
}

/*
 * Take a Type2 binary charstring as input and transform it to a human
 * readable representation as specified by the 'The Type 2 Charstring Format',
 * chapter 3.1.
 */
function readCharstringEncoding(aString) {
  if (!aString) {
    return '';
  }

  const charstringTokens = [];

  const count = aString.length;
  for (let i = 0; i < count; ) { // eslint-disable-line space-in-parens
    const value = aString[i++] | 0;
    let token = null;

    if (value < 0) {
      continue;
    } else if (value <= 11) {
      token = CFFEncodingMap[value];
    } else if (value === 12) {
      token = CFFEncodingMap[value][aString[i++]];
    } else if (value <= 18) {
      token = CFFEncodingMap[value];
    } else if (value <= 20) {
      ++i; // var mask = aString[i++];
      token = CFFEncodingMap[value];
    } else if (value <= 27) {
      token = CFFEncodingMap[value];
    } else if (value === 28) {
      token = aString[i++] << 8 | aString[i++];
    } else if (value <= 31) {
      token = CFFEncodingMap[value];
    } else if (value < 247) {
      token = parseInt(value, 10) - 139;
    } else if (value < 251) {
      token = (value - 247) * 256 + aString[i++] + 108;
    } else if (value < 255) {
      token = -(value - 251) * 256 - aString[i++] - 108;
    } else { // value === 255
      token = aString[i++] << 24 | aString[i++] << 16 |
              aString[i++] << 8 | aString[i];
    }

    charstringTokens.push(token);
  }

  return charstringTokens;
}

/*
 * Take a binary DICT Data as input and transform it into a human readable
 * form as specified by 'The Compact Font Format Specification', chapter 5.
 */
function readFontDictData(aString, aMap) {
  const fontDictDataTokens = [];

  const count = aString.length;
  for (let i = 0; i < count; i) {
    const value = aString[i++] | 0;
    let token = null;

    if (value === 12) {
      token = aMap[value][aString[i++]];
    } else if (value === 28) {
      token = aString[i++] << 8 | aString[i++];
    } else if (value === 29) {
      token = aString[i++] << 24 |
              aString[i++] << 16 |
              aString[i++] << 8 |
              aString[i++];
    } else if (value === 30) {
      token = '';
      let parsed = false;
      while (!parsed) {
        const octet = aString[i++];

        const nibbles = [parseInt(octet / 16, 10), parseInt(octet % 16, 10)];
        for (let j = 0; j < nibbles.length; j++) {
          const nibble = nibbles[j];
          switch (nibble) {
            case 0xA:
              token += '.';
              break;
            case 0xB:
              token += 'E';
              break;
            case 0xC:
              token += 'E-';
              break;
            case 0xD:
              break;
            case 0xE:
              token += '-';
              break;
            case 0xF:
              parsed = true;
              break;
            default:
              token += nibble;
              break;
          }
        }
      }
      token = parseFloat(token);
    } else if (value <= 31) {
      token = aMap[value];
    } else if (value <= 246) {
      token = parseInt(value, 10) - 139;
    } else if (value <= 250) {
      token = (value - 247) * 256 + aString[i++] + 108;
    } else if (value <= 254) {
      token = -(value - 251) * 256 - aString[i++] - 108;
    } else if (value === 255) {
      throw new FormatError('255 is not a valid DICT command');
    }

    fontDictDataTokens.push(token);
  }

  return fontDictDataTokens;
}

/*
 * Take a stream as input and return an array of objects.
 * In CFF an INDEX is a structure with the following format:
 *  {
 *    count: 2 bytes (Number of objects stored in INDEX),
 *    offsize: 1 byte (Offset array element size),
 *    offset: [count + 1] bytes (Offsets array),
 *    data: - (Objects data)
 *  }
 *
 *  More explanation are given in the 'CFF Font Format Specification',
 *  chapter 5.
 */
function readFontIndexData(aStream, aIsByte) {
  const count = aStream.getByte() << 8 | aStream.getByte();
  const offsize = aStream.getByte();

  function getNextOffset() {
    switch (offsize) {
      case 0:
        return 0;
      case 1:
        return aStream.getByte();
      case 2:
        return aStream.getByte() << 8 | aStream.getByte();
      case 3:
        return aStream.getByte() << 16 | aStream.getByte() << 8 |
               aStream.getByte();
      case 4:
      return aStream.getByte() << 24 | aStream.getByte() << 16 |
             aStream.getByte() << 8 | aStream.getByte();
    }
    throw new FormatError(offsize + ' is not a valid offset size');
  }

  const offsets = [];
  for (let i = 0; i < count + 1; i++) {
    offsets.push(getNextOffset());
  }

  dump('Found ' + count + ' objects at offsets :' +
       offsets + ' (offsize: ' + offsize + ')');

  // Now extract the objects
  const relativeOffset = aStream.pos;
  const objects = [];
  for (let i = 0; i < count; i++) {
    const offset = offsets[i];
    aStream.pos = relativeOffset + offset - 1;

    const data = [];
    const length = offsets[i + 1] - 1;
    for (let j = offset - 1; j < length; j++) {
      data.push(aIsByte ? aStream.getByte() : aStream.getChar());
    }
    objects.push(data);
  }

  return objects;
}

const Type2Parser = function type2Parser(aFilePath) {
  const font = new Dict(null);

  const xhr = new XMLHttpRequest();
  xhr.open('GET', aFilePath, false);
  xhr.responseType = 'arraybuffer';
  xhr.expected = document.URL.startsWith('file:') ? 0 : 200;
  xhr.send(null);
  this.data = new Stream(xhr.response);

  // Turn on this flag for additional debugging logs
  const debug = false;

  function dump(aStr) {
    if (debug) {
      console.log(aStr);
    }
  }

  function parseAsToken(aString, aMap) {
    const decoded = readFontDictData(aString, aMap);

    const stack = [];
    const count = decoded.length;
    for (let i = 0; i < count; i++) {
      const token = decoded[i];
      if (isNum(token)) {
        stack.push(token);
      } else {
        switch (token.operand) {
          case 'SID':
            font.set(token.name, CFFStrings[stack.pop()]);
            break;
          case 'number number':
            font.set(token.name, {
              offset: stack.pop(),
              size: stack.pop(),
            });
            break;
          case 'boolean':
            font.set(token.name, stack.pop());
            break;
          case 'delta':
            font.set(token.name, stack.pop());
            break;
          default:
            if (token.operand && token.operand.length) {
              const array = [];
              for (let j = 0; j < token.operand.length; j++) {
                array.push(stack.pop());
              }
              font.set(token.name, array);
            } else {
              font.set(token.name, stack.pop());
            }
            break;
        }
      }
    }
  }

  this.parse = function type2ParserParse(aStream) {
    font.set('major', aStream.getByte());
    font.set('minor', aStream.getByte());
    font.set('hdrSize', aStream.getByte());
    font.set('offsize', aStream.getByte());

    // Read the NAME Index
    dump('Reading Index: Names');
    font.set('Names', readFontIndexData(aStream));
    dump('Names: ' + font.get('Names'));

    // Read the Top Dict Index
    dump('Reading Index: TopDict');
    const topDict = readFontIndexData(aStream, true);
    dump('TopDict: ' + topDict);

    // Read the String Index
    dump('Reading Index: Strings');
    const strings = readFontIndexData(aStream);
    dump('strings: ' + strings);

    // Fill up the Strings dictionary with the new unique strings
    for (let i = 0; i < strings.length; i++) {
      CFFStrings.push(strings[i].join(''));
    }

    // Parse the TopDict operator
    const count = topDict.length;
    for (let i = 0; i < count; i++) {
      parseAsToken(topDict[i], CFFDictDataMap);
    }

    // Read the Global Subr Index that comes just after the Strings Index
    // (cf. "The Compact Font Format Specification" Chapter 16)
    dump('Reading Global Subr Index');
    const subrs = readFontIndexData(aStream, true);
    dump(subrs);

    // Reading Private Dict
    const priv = font.get('Private');
    dump('Reading Private Dict (offset: ' + priv.offset +
        ' size: ' + priv.size + ')');
    aStream.pos = priv.offset;

    const privateDict = [];
    for (let i = 0; i < priv.size; i++) {
      privateDict.push(aStream.getByte());
    }
    dump('privateData:' + privateDict);
    parseAsToken(privateDict, CFFDictPrivateDataMap);

    font.forEach(function(key, value) {
      dump(key + '::' + value);
    });

    // Read CharStrings Index
    const charStringsOffset = font.get('CharStrings');
    dump('Read CharStrings Index (offset: ' + charStringsOffset + ')');
    aStream.pos = charStringsOffset;
    const charStrings = readFontIndexData(aStream, true);

    // Read Charset
    dump('Read Charset for ' + charStrings.length + ' glyphs');
    const charsetEntry = font.get('charset');
    if (charsetEntry === 0) {
      throw new FormatError('Need to support CFFISOAdobeCharset');
    } else if (charsetEntry === 1) {
      throw new FormatError('Need to support CFFExpert');
    } else if (charsetEntry === 2) {
      throw new FormatError('Need to support CFFExpertSubsetCharset');
    } else {
      aStream.pos = charsetEntry;
      readCharset(aStream, charStrings);
    }
  };
};

/*
 * To try the Type2 decoder on a local file in the current directory:
 *
 *  var cff = new Type2Parser("file.cff");
 *  cff.parse(this.data);
 *
 * To try the Type2 decoder on a custom built CFF array:
 *
 *  var file = new Uint8Array(cffFileArray, 0, cffFileSize);
 *  var parser = new Type2Parser();
 *  parser.parse(new Stream(file));
 *
 */

/*
 * Write to a file to the disk (works only on Firefox in privilege mode)
 * but this is useful for dumping a font file to the disk and check with
 * fontforge or the ots program what's wrong with the file.
 *
 * writeToFile(fontData, "/tmp/pdf.js." + fontCount + ".cff");
 */
function writeToFile(aBytes, aFilePath) {
  if (!('netscape' in window)) {
    return;
  }

  netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect');
  const Cc = Components.classes;
  const Ci = Components.interfaces;
  const file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsILocalFile);
  file.initWithPath(aFilePath);

  const stream = Cc['@mozilla.org/network/file-output-stream;1']
                 .createInstance(Ci.nsIFileOutputStream);
  stream.init(file, 0x04 | 0x08 | 0x20, 0x180, 0);

  const bos = Cc['@mozilla.org/binaryoutputstream;1']
              .createInstance(Ci.nsIBinaryOutputStream);
  bos.setOutputStream(stream);
  bos.writeByteArray(aBytes, aBytes.length);
  stream.close();
}
