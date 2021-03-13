/* Copyright 2014 Mozilla Foundation
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

const fs = require("fs");
const path = require("path");
const parseAdobeCMap = require("./parse.js").parseAdobeCMap;
const optimizeCMap = require("./optimize.js").optimizeCMap;

function compressCmap(srcPath, destPath, verify) {
  const content = fs.readFileSync(srcPath).toString();
  const inputData = parseAdobeCMap(content);
  optimizeCMap(inputData);

  let out = writeByte((inputData.type << 1) | inputData.wmode);
  if (inputData.comment) {
    out += writeByte(0xe0) + writeString(inputData.comment);
  }
  if (inputData.usecmap) {
    out += writeByte(0xe1) + writeString(inputData.usecmap);
  }
  let i = 0;
  while (i < inputData.body.length) {
    const item = inputData.body[i++],
      subitems = item.items;
    const first = item.items[0];
    const sequence = item.sequence === true;
    const flags = (item.type << 5) | (sequence ? 0x10 : 0);
    let nextStart, nextCode;
    switch (item.type) {
      case 0:
        out +=
          writeByte(flags | getHexSize(first.start)) +
          writeNumber(subitems.length);
        out += first.start + writeNumber(subHex(first.end, first.start));
        nextStart = incHex(first.end);
        for (let j = 1; j < subitems.length; j++) {
          out +=
            writeNumber(subHex(subitems[j].start, nextStart)) +
            writeNumber(subHex(subitems[j].end, subitems[j].start));
          nextStart = incHex(subitems[j].end);
        }
        break;
      case 1:
        out +=
          writeByte(flags | getHexSize(first.start)) +
          writeNumber(subitems.length);
        out +=
          first.start +
          writeNumber(subHex(first.end, first.start)) +
          writeNumber(first.code);
        nextStart = incHex(first.end);
        for (let j = 1; j < subitems.length; j++) {
          out +=
            writeNumber(subHex(subitems[j].start, nextStart)) +
            writeNumber(subHex(subitems[j].end, subitems[j].start)) +
            writeNumber(subitems[j].code);
          nextStart = incHex(subitems[j].end);
        }
        break;
      case 2:
        out +=
          writeByte(flags | getHexSize(first.char)) +
          writeNumber(subitems.length);
        out += first.char + writeNumber(first.code);
        nextStart = incHex(first.char);
        nextCode = first.code + 1;
        for (let j = 1; j < subitems.length; j++) {
          out +=
            (sequence ? "" : writeNumber(subHex(subitems[j].char, nextStart))) +
            writeSigned(subitems[j].code - nextCode);
          nextStart = incHex(subitems[j].char);
          nextCode = item.items[j].code + 1;
        }
        break;
      case 3:
        out +=
          writeByte(flags | getHexSize(first.start)) +
          writeNumber(subitems.length);
        out +=
          first.start +
          writeNumber(subHex(first.end, first.start)) +
          writeNumber(first.code);
        nextStart = incHex(first.end);
        for (let j = 1; j < subitems.length; j++) {
          out +=
            (sequence
              ? ""
              : writeNumber(subHex(subitems[j].start, nextStart))) +
            writeNumber(subHex(subitems[j].end, subitems[j].start)) +
            writeNumber(subitems[j].code);
          nextStart = incHex(subitems[j].end);
        }
        break;
      case 4:
        out +=
          writeByte(flags | getHexSize(first.code)) +
          writeNumber(subitems.length);
        out += first.char + first.code;
        nextStart = incHex(first.char);
        nextCode = incHex(first.code);
        for (let j = 1; j < subitems.length; j++) {
          out +=
            (sequence ? "" : writeNumber(subHex(subitems[j].char, nextStart))) +
            writeSigned(subHex(subitems[j].code, nextCode));
          nextStart = incHex(subitems[j].char);
          nextCode = incHex(subitems[j].code);
        }
        break;
      case 5:
        out +=
          writeByte(flags | getHexSize(first.code)) +
          writeNumber(subitems.length);
        out +=
          first.start +
          writeNumber(subHex(first.end, first.start)) +
          first.code;
        nextStart = incHex(first.end);
        for (let j = 1; j < subitems.length; j++) {
          out +=
            (sequence
              ? ""
              : writeNumber(subHex(subitems[j].start, nextStart))) +
            writeNumber(subHex(subitems[j].end, subitems[j].start)) +
            subitems[j].code;
          nextStart = incHex(subitems[j].end);
        }
        break;
    }
  }

  fs.writeFileSync(destPath, Buffer.from(out, "hex"));

  if (verify) {
    const result2 = parseCMap(out);
    const isGood = JSON.stringify(inputData) === JSON.stringify(result2);
    if (!isGood) {
      throw new Error("Extracted data does not match the expected result");
    }
  }

  return {
    orig: fs.statSync(srcPath).size,
    packed: out.length >> 1,
  };
}

function parseCMap(binaryData) {
  const reader = {
    buffer: binaryData,
    pos: 0,
    end: binaryData.length,
    readByte() {
      if (this.pos >= this.end) {
        return -1;
      }
      const d1 = fromHexDigit(this.buffer[this.pos]);
      const d2 = fromHexDigit(this.buffer[this.pos + 1]);
      this.pos += 2;
      return (d1 << 4) | d2;
    },
    readNumber() {
      let n = 0;
      let last;
      do {
        const b = this.readByte();
        last = !(b & 0x80);
        n = (n << 7) | (b & 0x7f);
      } while (!last);
      return n;
    },
    readSigned() {
      const n = this.readNumber();
      return n & 1 ? -(n >>> 1) - 1 : n >>> 1;
    },
    readHex(size) {
      const lengthInChars = (size + 1) << 1;
      const s = this.buffer.substring(this.pos, this.pos + lengthInChars);
      this.pos += lengthInChars;
      return s;
    },
    readHexNumber(size) {
      const lengthInChars = (size + 1) << 1,
        stack = [];
      let last;
      do {
        const b = this.readByte();
        last = !(b & 0x80);
        stack.push(b & 0x7f);
      } while (!last);
      let s = "",
        buffer = 0,
        bufferSize = 0;
      while (s.length < lengthInChars) {
        while (bufferSize < 4 && stack.length > 0) {
          buffer = (stack.pop() << bufferSize) | buffer;
          bufferSize += 7;
        }
        s = toHexDigit(buffer & 15) + s;
        buffer >>= 4;
        bufferSize -= 4;
      }
      return s;
    },
    readHexSigned(size) {
      const num = this.readHexNumber(size);
      const sign = fromHexDigit(num[num.length - 1]) & 1 ? 15 : 0;
      let c = 0;
      let result = "";
      for (let i = 0; i < num.length; i++) {
        c = (c << 4) | fromHexDigit(num[i]);
        result += toHexDigit(sign ? (c >> 1) ^ sign : c >> 1);
        c &= 1;
      }
      return result;
    },
    readString() {
      const len = this.readNumber();
      let s = "";
      for (let i = 0; i < len; i++) {
        s += String.fromCharCode(this.readNumber());
      }
      return s;
    },
  };

  const header = reader.readByte();
  const result = {
    type: header >> 1,
    wmode: header & 1,
    comment: null,
    usecmap: null,
    body: [],
  };

  let b;
  while ((b = reader.readByte()) >= 0) {
    const type = b >> 5;
    if (type === 7) {
      switch (b & 0x1f) {
        case 0:
          result.comment = reader.readString();
          break;
        case 1:
          result.usecmap = reader.readString();
          break;
      }
      continue;
    }
    const sequence = !!(b & 0x10);
    const dataSize = b & 15;
    const subitems = [];
    const item = {
      type,
      items: subitems,
    };
    if (sequence) {
      item.sequence = true;
    }
    const ucs2DataSize = 1;
    const subitemsCount = reader.readNumber();
    let start, end, code, char;
    switch (type) {
      case 0:
        start = reader.readHex(dataSize);
        end = addHex(reader.readHexNumber(dataSize), start);
        subitems.push({ start, end });
        for (let i = 1; i < subitemsCount; i++) {
          start = addHex(reader.readHexNumber(dataSize), incHex(end));
          end = addHex(reader.readHexNumber(dataSize), start);
          subitems.push({ start, end });
        }
        break;
      case 1:
        start = reader.readHex(dataSize);
        end = addHex(reader.readHexNumber(dataSize), start);
        code = reader.readNumber();
        subitems.push({ start, end, code });
        for (let i = 1; i < subitemsCount; i++) {
          start = addHex(reader.readHexNumber(dataSize), incHex(end));
          end = addHex(reader.readHexNumber(dataSize), start);
          code = reader.readNumber();
          subitems.push({ start, end, code });
        }
        break;
      case 2:
        char = reader.readHex(dataSize);
        code = reader.readNumber();
        subitems.push({ char, code });
        for (let i = 1; i < subitemsCount; i++) {
          char = sequence
            ? incHex(char)
            : addHex(reader.readHexNumber(dataSize), incHex(char));
          code = reader.readSigned() + (code + 1);
          subitems.push({ char, code });
        }
        break;
      case 3:
        start = reader.readHex(dataSize);
        end = addHex(reader.readHexNumber(dataSize), start);
        code = reader.readNumber();
        subitems.push({ start, end, code });
        for (let i = 1; i < subitemsCount; i++) {
          start = sequence
            ? incHex(end)
            : addHex(reader.readHexNumber(dataSize), incHex(end));
          end = addHex(reader.readHexNumber(dataSize), start);
          code = reader.readNumber();
          subitems.push({ start, end, code });
        }
        break;
      case 4:
        char = reader.readHex(ucs2DataSize);
        code = reader.readHex(dataSize);
        subitems.push({ char, code });
        for (let i = 1; i < subitemsCount; i++) {
          char = sequence
            ? incHex(char)
            : addHex(reader.readHexNumber(ucs2DataSize), incHex(char));
          code = addHex(reader.readHexSigned(dataSize), incHex(code));
          subitems.push({ char, code });
        }
        break;
      case 5:
        start = reader.readHex(ucs2DataSize);
        end = addHex(reader.readHexNumber(ucs2DataSize), start);
        code = reader.readHex(dataSize);
        subitems.push({ start, end, code });
        for (let i = 1; i < subitemsCount; i++) {
          start = sequence
            ? incHex(end)
            : addHex(reader.readHexNumber(ucs2DataSize), incHex(end));
          end = addHex(reader.readHexNumber(ucs2DataSize), start);
          code = reader.readHex(dataSize);
          subitems.push({ start, end, code });
        }
        break;
      default:
        throw new Error("Unknown type: " + type);
    }
    result.body.push(item);
  }

  return result;
}

function toHexDigit(n) {
  return n.toString(16);
}
function fromHexDigit(s) {
  return parseInt(s, 16);
}
function getHexSize(s) {
  return (s.length >> 1) - 1;
}
function writeByte(b) {
  return toHexDigit((b >> 4) & 15) + toHexDigit(b & 15);
}
function writeNumber(n) {
  if (typeof n === "string") {
    let s = "",
      buffer = 0,
      bufferSize = 0;
    let i = n.length;
    while (i > 0) {
      --i;
      buffer = (fromHexDigit(n[i]) << bufferSize) | buffer;
      bufferSize += 4;
      if (bufferSize >= 7) {
        s = writeByte((buffer & 0x7f) | (s.length > 0 ? 0x80 : 0)) + s;
        buffer >>>= 7;
        bufferSize -= 7;
      }
    }
    if (buffer > 0) {
      s = writeByte((buffer & 0x7f) | (s.length > 0 ? 0x80 : 0)) + s;
    }
    while (s.indexOf("80") === 0) {
      s = s.substring(2);
    }
    return s;
  }
  let s = writeByte(n & 0x7f);
  n >>>= 7;
  while (n > 0) {
    s = writeByte((n & 0x7f) | 0x80) + s;
    n >>>= 7;
  }
  return s;
}
function writeSigned(n) {
  if (typeof n === "string") {
    let t = "";
    let c = fromHexDigit(n[0]);
    const neg = c >= 8;
    c = neg ? c ^ 15 : c;
    for (let i = 1; i < n.length; i++) {
      const d = fromHexDigit(n[i]);
      c = (c << 4) | (neg ? d ^ 15 : d);
      t += toHexDigit(c >> 3);
      c = c & 7;
    }
    t += toHexDigit((c << 1) | (neg ? 1 : 0));
    return writeNumber(t);
  }
  return n < 0 ? writeNumber(-2 * n - 1) : writeNumber(2 * n);
}
function writeString(s) {
  let t = writeNumber(s.length);
  for (let i = 0; i < s.length; i++) {
    t += writeNumber(s.charCodeAt(i));
  }
  return t;
}
function addHex(a, b) {
  let c = 0,
    s = "";
  for (let i = a.length - 1; i >= 0; i--) {
    c += fromHexDigit(a[i]) + fromHexDigit(b[i]);
    if (c >= 16) {
      s = toHexDigit(c - 16) + s;
      c = 1;
    } else {
      s = toHexDigit(c) + s;
      c = 0;
    }
  }
  return s;
}
function subHex(a, b) {
  let c = 0,
    s = "";
  for (let i = a.length - 1; i >= 0; i--) {
    c += fromHexDigit(a[i]) - fromHexDigit(b[i]);
    if (c < 0) {
      s = toHexDigit(c + 16) + s;
      c = -1;
    } else {
      s = toHexDigit(c) + s;
      c = 0;
    }
  }
  return s;
}
function incHex(a) {
  let c = 1,
    s = "";
  for (let i = a.length - 1; i >= 0; i--) {
    c += fromHexDigit(a[i]);
    if (c >= 16) {
      s = toHexDigit(c - 16) + s;
      c = 1;
    } else {
      s = toHexDigit(c) + s;
      c = 0;
    }
  }
  return s;
}

exports.compressCmaps = function (src, dest, verify) {
  const files = fs.readdirSync(src).filter(function (fn) {
    return !fn.includes("."); // skipping files with the extension
  });
  files.forEach(function (fn) {
    const srcPath = path.join(src, fn);
    const destPath = path.join(dest, fn + ".bcmap");
    const stats = compressCmap(srcPath, destPath, verify);
    console.log(
      "Compressing " +
        fn +
        ": " +
        stats.orig +
        " vs " +
        stats.packed +
        " " +
        ((stats.packed / stats.orig) * 100).toFixed(1) +
        "%"
    );
  });
};
