/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- /
/* vim: set shiftwidth=4 tabstop=8 autoindent cindent expandtab: */

var ERRORS = 0, WARNINGS = 1, TODOS = 5;
var verbosity = WARNINGS;

function log(msg) {
    msg = msg.toString ? msg.toString() : msg;
    if (console && console.log)
        console.log(msg);
    else if (print)
        print(msg);
}

function warn(msg) {
    if (verbosity >= WARNINGS)
        log("Warning: "+ msg);
}

function error(msg) {
    throw new Error(msg);
}

function TODO(what) {
    if (verbosity >= TODOS)
        log("TODO: "+ what);
}

function malformed(msg) {
    error("Malformed PDF: "+ msg);
}

function assert(cond, msg) {
    if (!cond)
        error(msg);
}

// In a well-formed PDF, |cond| holds.  If it doesn't, subsequent
// behavior is undefined.
function assertWellFormed(cond, msg) {
    if (!cond)
        malformed(msg);
}

function shadow(obj, prop, value) {
    Object.defineProperty(obj, prop, { value: value, enumerable: true });
    return value;
}

var Stream = (function() {
    function constructor(arrayBuffer, start, length, dict) {
        this.bytes = new Uint8Array(arrayBuffer);
        this.start = start || 0;
        this.pos = this.start;
        this.end = (start + length) || this.bytes.byteLength;
        this.dict = dict;
    }

    constructor.prototype = {
        get length() {
            return this.end - this.start;
        },
        getByte: function() {
            var bytes = this.bytes;
            if (this.pos >= this.end)
                return -1;
            return bytes[this.pos++];
        },
        // returns subarray of original buffer
        // should only be read
        getBytes: function(length) {
            var bytes = this.bytes;
            var pos = this.pos;
            var end = pos + length;
            var strEnd = this.end;
            if (end > strEnd)
                end = strEnd;
            
            this.pos = end;
            return bytes.subarray(pos, end);
        },
        lookChar: function() {
            var bytes = this.bytes;
            if (this.pos >= this.end)
                return;
            return String.fromCharCode(bytes[this.pos]);
        },
        getChar: function() {
            var ch = this.lookChar();
            if (!ch)
                return ch;
            this.pos++;
            return ch;
        },
        skip: function(n) {
            if (!n && !IsNum(n))
                n = 1;
            this.pos += n;
        },
        reset: function() {
            this.pos = this.start;
        },
        moveStart: function() {
            this.start = this.pos;
        },
        makeSubStream: function(start, length, dict) {
            return new Stream(this.bytes.buffer, start, length, dict);
        }
    };

    return constructor;
})();

var StringStream = (function() {
    function constructor(str) {
        var length = str.length;
        var bytes = new Uint8Array(length);
        for (var n = 0; n < length; ++n)
            bytes[n] = str.charCodeAt(n);
        Stream.call(this, bytes);
    }

    constructor.prototype = Stream.prototype;

    return constructor;
})();

var FlateStream = (function() {
    const codeLenCodeMap = new Uint32Array([
        16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15
    ]);

    const lengthDecode = new Uint32Array([
        0x00003, 0x00004, 0x00005, 0x00006, 0x00007, 0x00008, 0x00009,
        0x0000a, 0x1000b, 0x1000d, 0x1000f, 0x10011, 0x20013, 0x20017,
        0x2001b, 0x2001f, 0x30023, 0x3002b, 0x30033, 0x3003b, 0x40043,
        0x40053, 0x40063, 0x40073, 0x50083, 0x500a3, 0x500c3, 0x500e3,
        0x00102, 0x00102, 0x00102
    ]);

    const distDecode = new Uint32Array([
        0x00001, 0x00002, 0x00003, 0x00004, 0x10005, 0x10007, 0x20009,
        0x2000d, 0x30011, 0x30019, 0x40021, 0x40031, 0x50041, 0x50061,
        0x60081, 0x600c1, 0x70101, 0x70181, 0x80201, 0x80301, 0x90401,
        0x90601, 0xa0801, 0xa0c01, 0xb1001, 0xb1801, 0xc2001, 0xc3001,
        0xd4001, 0xd6001
    ]);

    const fixedLitCodeTab = [new Uint32Array([
        0x70100, 0x80050, 0x80010, 0x80118, 0x70110, 0x80070, 0x80030,
        0x900c0, 0x70108, 0x80060, 0x80020, 0x900a0, 0x80000, 0x80080,
        0x80040, 0x900e0, 0x70104, 0x80058, 0x80018, 0x90090, 0x70114,
        0x80078, 0x80038, 0x900d0, 0x7010c, 0x80068, 0x80028, 0x900b0,
        0x80008, 0x80088, 0x80048, 0x900f0, 0x70102, 0x80054, 0x80014,
        0x8011c, 0x70112, 0x80074, 0x80034, 0x900c8, 0x7010a, 0x80064,
        0x80024, 0x900a8, 0x80004, 0x80084, 0x80044, 0x900e8, 0x70106,
        0x8005c, 0x8001c, 0x90098, 0x70116, 0x8007c, 0x8003c, 0x900d8,
        0x7010e, 0x8006c, 0x8002c, 0x900b8, 0x8000c, 0x8008c, 0x8004c,
        0x900f8, 0x70101, 0x80052, 0x80012, 0x8011a, 0x70111, 0x80072,
        0x80032, 0x900c4, 0x70109, 0x80062, 0x80022, 0x900a4, 0x80002,
        0x80082, 0x80042, 0x900e4, 0x70105, 0x8005a, 0x8001a, 0x90094,
        0x70115, 0x8007a, 0x8003a, 0x900d4, 0x7010d, 0x8006a, 0x8002a,
        0x900b4, 0x8000a, 0x8008a, 0x8004a, 0x900f4, 0x70103, 0x80056,
        0x80016, 0x8011e, 0x70113, 0x80076, 0x80036, 0x900cc, 0x7010b,
        0x80066, 0x80026, 0x900ac, 0x80006, 0x80086, 0x80046, 0x900ec,
        0x70107, 0x8005e, 0x8001e, 0x9009c, 0x70117, 0x8007e, 0x8003e,
        0x900dc, 0x7010f, 0x8006e, 0x8002e, 0x900bc, 0x8000e, 0x8008e,
        0x8004e, 0x900fc, 0x70100, 0x80051, 0x80011, 0x80119, 0x70110,
        0x80071, 0x80031, 0x900c2, 0x70108, 0x80061, 0x80021, 0x900a2,
        0x80001, 0x80081, 0x80041, 0x900e2, 0x70104, 0x80059, 0x80019,
        0x90092, 0x70114, 0x80079, 0x80039, 0x900d2, 0x7010c, 0x80069,
        0x80029, 0x900b2, 0x80009, 0x80089, 0x80049, 0x900f2, 0x70102,
        0x80055, 0x80015, 0x8011d, 0x70112, 0x80075, 0x80035, 0x900ca,
        0x7010a, 0x80065, 0x80025, 0x900aa, 0x80005, 0x80085, 0x80045,
        0x900ea, 0x70106, 0x8005d, 0x8001d, 0x9009a, 0x70116, 0x8007d,
        0x8003d, 0x900da, 0x7010e, 0x8006d, 0x8002d, 0x900ba, 0x8000d,
        0x8008d, 0x8004d, 0x900fa, 0x70101, 0x80053, 0x80013, 0x8011b,
        0x70111, 0x80073, 0x80033, 0x900c6, 0x70109, 0x80063, 0x80023,
        0x900a6, 0x80003, 0x80083, 0x80043, 0x900e6, 0x70105, 0x8005b,
        0x8001b, 0x90096, 0x70115, 0x8007b, 0x8003b, 0x900d6, 0x7010d,
        0x8006b, 0x8002b, 0x900b6, 0x8000b, 0x8008b, 0x8004b, 0x900f6,
        0x70103, 0x80057, 0x80017, 0x8011f, 0x70113, 0x80077, 0x80037,
        0x900ce, 0x7010b, 0x80067, 0x80027, 0x900ae, 0x80007, 0x80087,
        0x80047, 0x900ee, 0x70107, 0x8005f, 0x8001f, 0x9009e, 0x70117,
        0x8007f, 0x8003f, 0x900de, 0x7010f, 0x8006f, 0x8002f, 0x900be,
        0x8000f, 0x8008f, 0x8004f, 0x900fe, 0x70100, 0x80050, 0x80010,
        0x80118, 0x70110, 0x80070, 0x80030, 0x900c1, 0x70108, 0x80060,
        0x80020, 0x900a1, 0x80000, 0x80080, 0x80040, 0x900e1, 0x70104,
        0x80058, 0x80018, 0x90091, 0x70114, 0x80078, 0x80038, 0x900d1,
        0x7010c, 0x80068, 0x80028, 0x900b1, 0x80008, 0x80088, 0x80048,
        0x900f1, 0x70102, 0x80054, 0x80014, 0x8011c, 0x70112, 0x80074,
        0x80034, 0x900c9, 0x7010a, 0x80064, 0x80024, 0x900a9, 0x80004,
        0x80084, 0x80044, 0x900e9, 0x70106, 0x8005c, 0x8001c, 0x90099,
        0x70116, 0x8007c, 0x8003c, 0x900d9, 0x7010e, 0x8006c, 0x8002c,
        0x900b9, 0x8000c, 0x8008c, 0x8004c, 0x900f9, 0x70101, 0x80052,
        0x80012, 0x8011a, 0x70111, 0x80072, 0x80032, 0x900c5, 0x70109,
        0x80062, 0x80022, 0x900a5, 0x80002, 0x80082, 0x80042, 0x900e5,
        0x70105, 0x8005a, 0x8001a, 0x90095, 0x70115, 0x8007a, 0x8003a,
        0x900d5, 0x7010d, 0x8006a, 0x8002a, 0x900b5, 0x8000a, 0x8008a,
        0x8004a, 0x900f5, 0x70103, 0x80056, 0x80016, 0x8011e, 0x70113,
        0x80076, 0x80036, 0x900cd, 0x7010b, 0x80066, 0x80026, 0x900ad,
        0x80006, 0x80086, 0x80046, 0x900ed, 0x70107, 0x8005e, 0x8001e,
        0x9009d, 0x70117, 0x8007e, 0x8003e, 0x900dd, 0x7010f, 0x8006e,
        0x8002e, 0x900bd, 0x8000e, 0x8008e, 0x8004e, 0x900fd, 0x70100,
        0x80051, 0x80011, 0x80119, 0x70110, 0x80071, 0x80031, 0x900c3,
        0x70108, 0x80061, 0x80021, 0x900a3, 0x80001, 0x80081, 0x80041,
        0x900e3, 0x70104, 0x80059, 0x80019, 0x90093, 0x70114, 0x80079,
        0x80039, 0x900d3, 0x7010c, 0x80069, 0x80029, 0x900b3, 0x80009,
        0x80089, 0x80049, 0x900f3, 0x70102, 0x80055, 0x80015, 0x8011d,
        0x70112, 0x80075, 0x80035, 0x900cb, 0x7010a, 0x80065, 0x80025,
        0x900ab, 0x80005, 0x80085, 0x80045, 0x900eb, 0x70106, 0x8005d,
        0x8001d, 0x9009b, 0x70116, 0x8007d, 0x8003d, 0x900db, 0x7010e,
        0x8006d, 0x8002d, 0x900bb, 0x8000d, 0x8008d, 0x8004d, 0x900fb,
        0x70101, 0x80053, 0x80013, 0x8011b, 0x70111, 0x80073, 0x80033,
        0x900c7, 0x70109, 0x80063, 0x80023, 0x900a7, 0x80003, 0x80083,
        0x80043, 0x900e7, 0x70105, 0x8005b, 0x8001b, 0x90097, 0x70115,
        0x8007b, 0x8003b, 0x900d7, 0x7010d, 0x8006b, 0x8002b, 0x900b7,
        0x8000b, 0x8008b, 0x8004b, 0x900f7, 0x70103, 0x80057, 0x80017,
        0x8011f, 0x70113, 0x80077, 0x80037, 0x900cf, 0x7010b, 0x80067,
        0x80027, 0x900af, 0x80007, 0x80087, 0x80047, 0x900ef, 0x70107,
        0x8005f, 0x8001f, 0x9009f, 0x70117, 0x8007f, 0x8003f, 0x900df,
        0x7010f, 0x8006f, 0x8002f, 0x900bf, 0x8000f, 0x8008f, 0x8004f,
        0x900ff
    ]), 9];

    const fixedDistCodeTab = [new Uint32Array([
        0x50000, 0x50010, 0x50008, 0x50018, 0x50004, 0x50014, 0x5000c,
        0x5001c, 0x50002, 0x50012, 0x5000a, 0x5001a, 0x50006, 0x50016,
        0x5000e, 0x00000, 0x50001, 0x50011, 0x50009, 0x50019, 0x50005,
        0x50015, 0x5000d, 0x5001d, 0x50003, 0x50013, 0x5000b, 0x5001b,
        0x50007, 0x50017, 0x5000f, 0x00000
    ]), 5];

    function constructor(stream) {
        this.stream = stream;
        this.dict = stream.dict;
        var cmf = stream.getByte();
        var flg = stream.getByte();
        if (cmf == -1 || flg == -1)
            error("Invalid header in flate stream");
        if ((cmf & 0x0f) != 0x08)
            error("Unknown compression method in flate stream");
        if ((((cmf << 8) + flg) % 31) != 0)
            error("Bad FCHECK in flate stream");
        if (flg & 0x20)
            error("FDICT bit set in flate stream");
        this.eof = false;
        this.codeSize = 0;
        this.codeBuf = 0;
        
        this.pos = 0;
        this.bufferLength = 0;
    }

    constructor.prototype = {
        getBits: function(bits) {
            var stream = this.stream;
            var codeSize = this.codeSize;
            var codeBuf = this.codeBuf;
            var b;
            while (codeSize < bits) {
                if ((b = stream.getByte()) == -1)
                    error("Bad encoding in flate stream");
                codeBuf |= b << codeSize;
                codeSize += 8;
            }
            b = codeBuf & ((1 << bits) - 1);
            this.codeBuf = codeBuf >> bits;
            this.codeSize = codeSize -= bits;
            return b;
        },
        getCode: function(table) {
            var codes = table[0];
            var maxLen = table[1];
            var codeSize = this.codeSize;
            var codeBuf = this.codeBuf;
            var stream = this.stream;
            while (codeSize < maxLen) {
                var b;
                if ((b = stream.getByte()) == -1)
                    error("Bad encoding in flate stream");
                codeBuf |= (b << codeSize);
                codeSize += 8;
            }
            var code = codes[codeBuf & ((1 << maxLen) - 1)];
            var codeLen = code >> 16;
            var codeVal = code & 0xffff;
            if (codeSize == 0|| codeSize < codeLen || codeLen == 0)
                error("Bad encoding in flate stream");
            this.codeBuf = (codeBuf >> codeLen);
            this.codeSize = (codeSize - codeLen);
            return codeVal;
        },
        ensureBuffer: function(requested) {
            var buffer = this.buffer;
            var current = buffer ? buffer.byteLength : 0;
            if (requested < current)
                return buffer;
            var size = 512;
            while (size < requested)
                size <<= 1;
            var buffer2 = new Uint8Array(size);
            for (var i = 0; i < current; ++i)
                buffer2[i] = buffer[i];
            return this.buffer = buffer2;
        },
        getByte: function() {
            var bufferLength = this.bufferLength;
            var pos = this.pos;
            if (bufferLength == pos) {
                if (this.eof)
                    return;
                this.readBlock();
            }
            return this.buffer[this.pos++];
        },
        getBytes: function(length) {
            var pos = this.pos;

            while (!this.eof && this.bufferLength < pos + length)
                this.readBlock();

            var end = pos + length;
            var bufEnd = this.bufferLength;

            if (end > bufEnd)
                end = bufEnd;

            this.pos = end;
            return this.buffer.subarray(pos, end)
        },
        lookChar: function() {
            var bufferLength = this.bufferLength;
            var pos = this.pos;
            if (bufferLength == pos) {
                if (this.eof)
                    return;
                this.readBlock();
            }
            return String.fromCharCode(this.buffer[pos]);
        },
        getChar: function() {
            var ch = this.lookChar();
            if (!ch)
                return;
            this.pos++;
            return ch;
        },
        skip: function(n) {
            if (!n)
                n = 1;
            while (n-- > 0)
                this.getChar();
        },
        generateHuffmanTable: function(lengths) {
            var n = lengths.length;

            // find max code length
            var maxLen = 0;
            for (var i = 0; i < n; ++i) {
                if (lengths[i] > maxLen)
                    maxLen = lengths[i];
            }

            // build the table
            var size = 1 << maxLen;
            var codes = new Uint32Array(size);
            for (var len = 1, code = 0, skip = 2;
                 len <= maxLen;
                 ++len, code <<= 1, skip <<= 1) {
                for (var val = 0; val < n; ++val) {
                    if (lengths[val] == len) {
                        // bit-reverse the code
                        var code2 = 0;
                        var t = code;
                        for (var i = 0; i < len; ++i) {
                            code2 = (code2 << 1) | (t & 1);
                            t >>= 1;
                        }

                        // fill the table entries
                        for (var i = code2; i < size; i += skip)
                            codes[i] = (len << 16) | val;

                        ++code;
                    }
                }
            }

            return [codes, maxLen];
        },
        readBlock: function() {
            var stream = this.stream;

            // read block header
            var hdr = this.getBits(3);
            if (hdr & 1)
                this.eof = true;
            hdr >>= 1;

            var b;
            if (hdr == 0) { // uncompressed block
                if ((b = stream.getByte()) == -1)
                    error("Bad block header in flate stream");
                var blockLen = b;
                if ((b = stream.getByte()) == -1)
                    error("Bad block header in flate stream");
                blockLen |= (b << 8);
                if ((b = stream.getByte()) == -1)
                    error("Bad block header in flate stream");
                var check = b;
                if ((b = stream.getByte()) == -1)
                    error("Bad block header in flate stream");
                check |= (b << 8);
                if (check != (~this.blockLen & 0xffff))
                    error("Bad uncompressed block length in flate stream");
                var bufferLength = this.bufferLength;
                var buffer = this.ensureBuffer(bufferLength + blockLen);
                this.bufferLength = bufferLength + blockLen;
                for (var n = bufferLength; n < blockLen; ++n) {
                    if ((b = stream.getByte()) == -1) {
                        this.eof = true;
                        break;
                    }
                    buffer[n] = b;
                }
                return;
            }

            var litCodeTable;
            var distCodeTable;
            if (hdr == 1) { // compressed block, fixed codes
                litCodeTable = fixedLitCodeTab;
                distCodeTable = fixedDistCodeTab;
            } else if (hdr == 2) { // compressed block, dynamic codes
                var numLitCodes = this.getBits(5) + 257;
                var numDistCodes = this.getBits(5) + 1;
                var numCodeLenCodes = this.getBits(4) + 4;

                // build the code lengths code table
                var codeLenCodeLengths = Array(codeLenCodeMap.length);
                var i = 0;
                while (i < numCodeLenCodes)
                    codeLenCodeLengths[codeLenCodeMap[i++]] = this.getBits(3);
                var codeLenCodeTab = this.generateHuffmanTable(codeLenCodeLengths);

                // build the literal and distance code tables
                var len = 0;
                var i = 0;
                var codes = numLitCodes + numDistCodes;
                var codeLengths = new Array(codes);
                while (i < codes) {
                    function repeat(stream, array, len, offset, what) {
                        var repeat = stream.getBits(len) + offset;
                        while (repeat-- > 0)
                            array[i++] = what;
                    }
                    var code = this.getCode(codeLenCodeTab);
                    if (code == 16) {
                        repeat(this, codeLengths, 2, 3, len);
                    } else if (code == 17) {
                        repeat(this, codeLengths, 3, 3, len = 0);
                    } else if (code == 18) {
                        repeat(this, codeLengths, 7, 11, len = 0);
                    } else {
                        codeLengths[i++] = len = code;
                    }
                }

                litCodeTable = this.generateHuffmanTable(codeLengths.slice(0, numLitCodes));
                distCodeTable = this.generateHuffmanTable(codeLengths.slice(numLitCodes, codes));
            } else {
                error("Unknown block type in flate stream");
            }

            var pos = this.bufferLength;
            while (true) {
                var code1 = this.getCode(litCodeTable);
                if (code1 == 256) {
                    this.bufferLength = pos;
                    return;
                }
                if (code1 < 256) {
                    var buffer = this.ensureBuffer(pos + 1);
                    buffer[pos++] = code1;
                } else {
                    code1 -= 257;
                    code1 = lengthDecode[code1];
                    var code2 = code1 >> 16;
                    if (code2 > 0)
                        code2 = this.getBits(code2);
                    var len = (code1 & 0xffff) + code2;
                    code1 = this.getCode(distCodeTable);
                    code1 = distDecode[code1];
                    code2 = code1 >> 16;
                    if (code2 > 0)
                        code2 = this.getBits(code2);
                    var dist = (code1 & 0xffff) + code2;
                    var buffer = this.ensureBuffer(pos + len);
                    for (var k = 0; k < len; ++k, ++pos)
                        buffer[pos] = buffer[pos - dist];
                }
            }
        }
    };

    return constructor;
})();

var DecryptStream = (function() {
    function constructor(str, fileKey, encAlgorithm, keyLength) {
        // TODO
    }

    constructor.prototype = Stream.prototype;

    return constructor;
})();

var Name = (function() {
    function constructor(name) {
        this.name = name;
    }

    constructor.prototype = {
      toString: function() {
        return this.name;
      }
    };

    return constructor;
})();

var Cmd = (function() {
    function constructor(cmd) {
        this.cmd = cmd;
    }

    constructor.prototype = {
      toString: function() {
        return this.cmd;
      }
    };

    return constructor;
})();

var Dict = (function() {
    function constructor() {
        this.map = Object.create(null);
    }

    constructor.prototype = {
        get: function(key) {
            return this.map[key];
        },
        get2: function(key1, key2) {
            return this.get(key1) || this.get(key2);
        },
        has: function(key) {
            return key in this.map;
        },
        set: function(key, value) {
            this.map[key] = value;
        },
        forEach: function(aCallback) {
          for (var key in this.map)
            aCallback(key, this.map[key]);
        },
        toString: function() {
          var keys = [];
          for (var key in this.map)
            keys.push(key);
          return "Dict with " + keys.length + " keys: " + keys;
        }
    };

    return constructor;
})();

var Ref = (function() {
    function constructor(num, gen) {
        this.num = num;
        this.gen = gen;
    }

    constructor.prototype = {
    };

    return constructor;
})();

function IsBool(v) {
    return typeof v == "boolean";
}

function IsInt(v) {
    return typeof v == "number" && ((v|0) == v);
}

function IsNum(v) {
    return typeof v == "number";
}

function IsString(v) {
    return typeof v == "string";
}

function IsNull(v) {
    return v === null;
}

function IsName(v) {
    return v instanceof Name;
}

function IsCmd(v, cmd) {
    return v instanceof Cmd && (!cmd || v.cmd == cmd);
}

function IsDict(v, type) {
    return v instanceof Dict && (!type || v.get("Type").name == type);
}

function IsArray(v) {
    return v instanceof Array;
}

function IsStream(v) {
    return typeof v == "object" && "getChar" in v;
}

function IsRef(v) {
    return v instanceof Ref;
}

function IsPDFFunction(v) {
    var fnDict;
    if (typeof v != "object")
        return false;
    else if (IsDict(v))
        fnDict = v;
    else if (IsStream(v))
        fnDict = v.dict;
    else
        return false;
    return fnDict.has("FunctionType");
}

var EOF = {};

function IsEOF(v) {
    return v == EOF;
}

var None = {};

function IsNone(v) {
    return v == None;
}

var Lexer = (function() {
    function constructor(stream) {
        this.stream = stream;
    }

    constructor.isSpace = function(ch) {
        return ch == " " || ch == "\t";
    }

    // A '1' in this array means the character is white space.  A '1' or
    // '2' means the character ends a name or command.
    var specialChars = [
        1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0,   // 0x
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,   // 1x
        1, 0, 0, 0, 0, 2, 0, 0, 2, 2, 0, 0, 0, 0, 0, 2,   // 2x
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0,   // 3x
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,   // 4x
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0,   // 5x
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,   // 6x
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0,   // 7x
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,   // 8x
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,   // 9x
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,   // ax
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,   // bx
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,   // cx
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,   // dx
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,   // ex
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0    // fx
    ];

    const MIN_INT = (1<<31) | 0;
    const MAX_INT = (MIN_INT - 1) | 0;
    const MIN_UINT = 0;
    const MAX_UINT = ((1<<30) * 4) - 1;

    function ToHexDigit(ch) {
        if (ch >= "0" && ch <= "9")
            return ch - "0";
        ch = ch.toLowerCase();
        if (ch >= "a" && ch <= "f")
            return ch - "a";
        return -1;
    }

    constructor.prototype = {
        getNumber: function(ch) {
            var floating = false;
            var str = ch;
            var stream = this.stream;
            do {
                ch = stream.lookChar();
                if (ch == "." && !floating) {
                    str += ch;
                    floating = true;
                } else if (ch == "-") {
                    // ignore minus signs in the middle of numbers to match
                    // Adobe's behavior
                    warn("Badly formated number");
                } else if (ch >= "0" && ch <= "9") {
                    str += ch;
                } else if (ch == "e" || ch == "E") {
                    floating = true;
                } else {
                    // the last character doesn't belong to us
                    break;
                }
                stream.skip();
            } while (true);
            var value = parseFloat(str);
            if (isNaN(value))
                error("Invalid floating point number");
            return value;
        },
        getString: function() {
            var n = 0;
            var numParen = 1;
            var done = false;
            var str = "";
            var stream = this.stream;
            do {
                switch (ch = stream.getChar()) {
                case undefined:
                    warn("Unterminated string");
                    done = true;
                    break;
                case '(':
                    ++numParen;
                    str += ch;
                    break;
                case ')':
                    if (--numParen == 0) {
                        done = true;
                    } else {
                        str += ch;
                    }
                    break;
                case '\\':
                    switch (ch = stream.getChar()) {
                    case undefined:
                        warn("Unterminated string");
                        done = true;
                        break;
                    case 'n':
                        str += '\n';
                        break;
                    case 'r':
                        str += '\r';
                        break;
                    case 't':
                        str += '\t';
                        break;
                    case 'b':
                        str += '\b';
                        break;
                    case 'f':
                        str += '\f';
                        break;
                    case '\\':
                    case '(':
                    case ')':
                        str += ch;
                        break;
                    case '0': case '1': case '2': case '3':
                    case '4': case '5': case '6': case '7':
                        var x = ch - '0';
                        ch = stream.lookChar();
                        if (ch >= '0' && ch <= '7') {
                            stream.skip();
                            x = (x << 3) + (ch - '0');
                            ch = stream.lookChar();
                            if (ch >= '0' && ch <= '7') {
                                stream.skip();
                                x = (x << 3) + (ch - '0');
                            }
                        }

                        str += String.fromCharCode(x);
                        break;
                    case '\r':
                        ch = stream.lookChar();
                        if (ch == '\n')
                            stream.skip();
                        break;
                    case '\n':
                        break;
                    default:
                        str += ch;
                        break;
                    }
                    break;
                default:
                    str += ch;
                    break;
                }
            } while (!done);
            if (!str.length)
                return EOF;
            return str;
        },
        getName: function(ch) {
            var str = "";
            var stream = this.stream;
            while (!!(ch = stream.lookChar()) && !specialChars[ch.charCodeAt(0)]) {
                stream.skip();
                if (ch == "#") {
                    ch = stream.lookChar();
                    var x = ToHexDigit(ch);
                    if (x != -1) {
                        stream.skip();
                        var x2 = ToHexDigit(stream.getChar());
                        if (x2 == -1)
                            error("Illegal digit in hex char in name");
                        str += String.fromCharCode((x << 4) | x2);
                    } else {
                        str += "#";
                        str += ch;
                    }
                } else {
                    str += ch;
                }
            }
            if (str.length > 128)
                error("Warning: name token is longer than allowed by the specification");
            return new Name(str);
        },
        getHexString: function(ch) {
            var str = "";
            var stream = this.stream;
            while (1) {
                ch = stream.getChar();
                if (ch == '>') {
                    break;
                }
                if (!ch) {
                    warn("Unterminated hex string");
                    break;
                }
                if (specialChars[ch.charCodeAt(0)] != 1) {
                    var x, x2;
                    if (((x = ToHexDigit(ch)) == -1) ||
                        ((x2 = ToHexDigit(stream.getChar())) == -1)) {
                        error("Illegal character in hex string");
                        break;
                    }
                    str += String.fromCharCode((x << 4) | x2);
                }
            }
            return str;
        },
        getObj: function() {
            // skip whitespace and comments
            var comment = false;
            var stream = this.stream;
            var ch;
            while (true) {
                if (!(ch = stream.getChar()))
                    return EOF;
                if (comment) {
                    if (ch == '\r' || ch == '\n')
                        comment = false;
                } else if (ch == '%') {
                    comment = true;
                } else if (specialChars[ch.charCodeAt(0)] != 1) {
                    break;
                }
            }
            
            // start reading token
            switch (ch) {
            case '0': case '1': case '2': case '3': case '4':
            case '5': case '6': case '7': case '8': case '9':
            case '+': case '-': case '.':
                return this.getNumber(ch);
            case '(':
                return this.getString();
            case '/':
	            return this.getName(ch);
            // array punctuation
            case '[':
            case ']':
                return new Cmd(ch);
            // hex string or dict punctuation
            case '<':
	            ch = stream.lookChar();
                if (ch == '<') {
                    // dict punctuation
                    stream.skip();
                    return new Cmd("<<");
                }
	            return this.getHexString(ch);
            // dict punctuation
            case '>':
	            ch = stream.lookChar();
	            if (ch == '>') {
                    stream.skip();
                    return new Cmd(">>");
                }
            case "{":
            case "}":
              return new Cmd(ch);
	        // fall through
            case ')':
                error("Illegal character");
                return Error;
            }

            // command
            var str = ch;
            while (!!(ch = stream.lookChar()) && !specialChars[ch.charCodeAt(0)]) {
                stream.skip();
                if (str.length == 128) {
                    error("Command token too long");
                    break;
                }
                str += ch;
            }
            if (str == "true")
                return true;
            if (str == "false")
                return false;
            if (str == "null")
                return null;
            return new Cmd(str);
        },
        skipToNextLine: function() {
            var stream = this.stream;
            while (true) {
                var ch = stream.getChar();
                if (!ch || ch == "\n")
                    return;
                if (ch == "\r") {
                    if ((ch = stream.lookChar()) == "\n")
                        stream.skip();
                    return;
                }
            }
        }
    };

    return constructor;
})();

var Parser = (function() {
    function constructor(lexer, allowStreams, xref) {
        this.lexer = lexer;
        this.allowStreams = allowStreams;
        this.xref = xref;
        this.inlineImg = 0;
        this.refill();
    }

    constructor.prototype = {
        refill: function() {
            this.buf1 = this.lexer.getObj();
            this.buf2 = this.lexer.getObj();
        },
        shift: function() {
            if (this.inlineImg > 0) {
                if (this.inlineImg < 2) {
                    this.inlineImg++;
                } else {
                    // in a damaged content stream, if 'ID' shows up in the middle
                    // of a dictionary, we need to reset
                    this.inlineImg = 0;
                }
            } else if (IsCmd(this.buf2, "ID")) {
                this.lexer.skip(); // skip char after 'ID' command
                this.inlineImg = 1;
            }
            this.buf1 = this.buf2;
            // don't buffer inline image data
            this.buf2 = (this.inlineImg > 0) ? null : this.lexer.getObj();
        },
        getObj: function() {
            // refill buffer after inline image data
            if (this.inlineImg == 2)
                this.refill();

            if (IsCmd(this.buf1, "[")) { // array
                this.shift();
                var array = [];
                while (!IsCmd(this.buf1, "]") && !IsEOF(this.buf1))
                    array.push(this.getObj());
                if (IsEOF(this.buf1))
                    error("End of file inside array");
                this.shift();
                return array;
            } else if (IsCmd(this.buf1, "<<")) { // dictionary or stream
                this.shift();
                var dict = new Dict();
                while (!IsCmd(this.buf1, ">>") && !IsEOF(this.buf1)) {
                    if (!IsName(this.buf1)) {
                        error("Dictionary key must be a name object");
                        shift();
                    } else {
                        var key = this.buf1.name;
                        this.shift();
                        if (IsEOF(this.buf1))
                            break;
                        dict.set(key, this.getObj());
                    }
                }
                if (IsEOF(this.buf1))
                    error("End of file inside dictionary");

                // stream objects are not allowed inside content streams or
                // object streams
                if (this.allowStreams && IsCmd(this.buf2, "stream")) {
                    return this.makeStream(dict);
                } else {
                    this.shift();
                }
                return dict;

            } else if (IsInt(this.buf1)) { // indirect reference or integer
                var num = this.buf1;
                this.shift();
                if (IsInt(this.buf1) && IsCmd(this.buf2, "R")) {
                    var ref = new Ref(num, this.buf1);
                    this.shift();
                    this.shift();
                    return ref;
                }
                return num;
            } else if (IsString(this.buf1)) { // string
                var str = this.buf1;
                this.shift();
                if (this.fileKey) {
                    var decrypt = new DecryptStream(new StringStream(str),
                                                    this.fileKey,
                                                    this.encAlgorithm,
                                                    this.keyLength);
                    var str = "";
                    var pos = decrypt.pos;
                    var length = decrypt.length;
                    while (pos++ > length)
                        str += decrypt.getChar();
                }
                return str;
            }
	
            // simple object
            var obj = this.buf1;
            this.shift();
            return obj;
        },
        makeStream: function(dict) {
            var lexer = this.lexer;
            var stream = lexer.stream;

            // get stream start position
            lexer.skipToNextLine();
            var pos = stream.pos;
            
            // get length
            var length = dict.get("Length");
            var xref = this.xref;
            if (xref)
                length = xref.fetchIfRef(length);
            if (!IsInt(length)) {
                error("Bad 'Length' attribute in stream");
                length = 0;
            }

            // skip over the stream data
            stream.pos = pos + length;
            this.shift(); // '>>'
            this.shift(); // 'stream'
            if (!IsCmd(this.buf1, "endstream"))
                error("Missing 'endstream'");
            this.shift();

            stream = stream.makeSubStream(pos, length, dict);
            if (this.fileKey) {
                stream = new DecryptStream(stream,
                                           this.fileKey,
                                           this.encAlgorithm,
                                           this.keyLength);
            }
            return this.filter(stream, dict);
        },
        filter: function(stream, dict) {
            var filter = dict.get2("Filter", "F");
            var params = dict.get2("DecodeParms", "DP");
            if (IsName(filter))
                return this.makeFilter(stream, filter.name, params);
            if (IsArray(filter)) {
                var filterArray = filter;
                var paramsArray = params;
                for (filter in filterArray) {
                    if (!IsName(filter))
                        error("Bad filter name");
                    else {
                        params = null;
                        if (IsArray(paramsArray) && (i in paramsArray))
                            params = paramsArray[i];
                        stream = this.makeFilter(stream, filter.name, params);
                    }
                }
            }
            return stream;
        },
        makeFilter: function(stream, name, params) {
            if (name == "FlateDecode" || name == "Fl") {
                if (params)
                    error("params not supported yet for FlateDecode");
                return new FlateStream(stream);
            } else {
                error("filter '" + name + "' not supported yet");
            }
            return stream;
        }
    };

    return constructor;
})();
    
var Linearization = (function() {
    function constructor(stream) {
        this.parser = new Parser(new Lexer(stream), false);
        var obj1 = this.parser.getObj();
        var obj2 = this.parser.getObj();
        var obj3 = this.parser.getObj();
        this.linDict = this.parser.getObj();
        if (IsInt(obj1) && IsInt(obj2) && IsCmd(obj3, "obj") && IsDict(this.linDict)) {
            var obj = this.linDict.get("Linearized");
            if (!(IsNum(obj) && obj > 0))
                this.linDict = null;
        }
    }

    constructor.prototype = {
        getInt: function(name) {
            var linDict = this.linDict;
            var obj;
            if (IsDict(linDict) &&
                IsInt(obj = linDict.get(name)) &&
                obj > 0) {
                return obj;
            }
            error("'" + name + "' field in linearization table is invalid");
            return 0;
        },
        getHint: function(index) {
            var linDict = this.linDict;
            var obj1, obj2;
            if (IsDict(linDict) &&
                IsArray(obj1 = linDict.get("H")) &&
                obj1.length >= 2 &&
                IsInt(obj2 = obj1[index]) &&
                obj2 > 0) {
                return obj2;
            }
            error("Hints table in linearization table is invalid");
            return 0;
        },
        get length() {
            if (!IsDict(this.linDict))
                return 0;
            return this.getInt("L");
        },
        get hintsOffset() {
            return this.getHint(0);
        },
        get hintsLength() {
            return this.getHint(1);
        },
        get hintsOffset2() {
            return this.getHint(2);
        },
        get hintsLenth2() {
            return this.getHint(3);
        },
        get objectNumberFirst() {
            return this.getInt("O");
        },
        get endFirst() {
            return this.getInt("E");
        },
        get numPages() {
            return this.getInt("N");
        },
        get mainXRefEntriesOffset() {
            return this.getInt("T");
        },
        get pageFirst() {
            return this.getInt("P");
        }
    };

    return constructor;
})();

var XRef = (function() {
    function constructor(stream, startXRef, mainXRefEntriesOffset) {
        this.stream = stream;
        this.entries = [];
        this.xrefstms = {};
        this.readXRef(startXRef);

        // get the root dictionary (catalog) object
        if (!IsRef(this.root = this.trailerDict.get("Root")))
            error("Invalid root reference");

        // prepare the XRef cache
        this.cache = [];
    }

    constructor.prototype = {
        readXRefTable: function(parser) {
            var obj;
            while (true) {
                if (IsCmd(obj = parser.getObj(), "trailer"))
                    break;
                if (!IsInt(obj))
                    error("Invalid XRef table");
                var first = obj;
                if (!IsInt(obj = parser.getObj()))
                    error("Invalid XRef table");
                var n = obj;
                if (first < 0 || n < 0 || (first + n) != ((first + n) | 0))
                    error("Invalid XRef table");
                for (var i = first; i < first + n; ++i) {
                    var entry = {};
                    if (!IsInt(obj = parser.getObj()))
                        error("Invalid XRef table");
                    entry.offset = obj;
                    if (!IsInt(obj = parser.getObj()))
                        error("Invalid XRef table");
                    entry.gen = obj;
                    obj = parser.getObj();
                    if (IsCmd(obj, "n")) {
                        entry.uncompressed = true;
                    } else if (IsCmd(obj, "f")) {
                        entry.free = true;
                    } else {
                        error("Invalid XRef table");
                    }
                    if (!this.entries[i]) {
                        // In some buggy PDF files the xref table claims to start at 1
                        // instead of 0.
                        if (i == 1 && first == 1 &&
                            entry.offset == 0 && entry.gen == 65535 && entry.free) {
                            i = first = 0;
                        }
                        this.entries[i] = entry;
                    }
                }
            }

            // read the trailer dictionary
            var dict;
            if (!IsDict(dict = parser.getObj()))
                error("Invalid XRef table");

            // get the 'Prev' pointer
            var more = false;
            obj = dict.get("Prev");
            if (IsInt(obj)) {
                this.prev = obj;
                more = true;
            } else if (IsRef(obj)) {
                // certain buggy PDF generators generate "/Prev NNN 0 R" instead
                // of "/Prev NNN"
                this.prev = obj.num;
                more = true;
            }
            this.trailerDict = dict;

            // check for 'XRefStm' key
            if (IsInt(obj = dict.get("XRefStm"))) {
                var pos = obj;
                if (pos in this.xrefstms)
                    error("Invalid XRef table");
                this.xrefstms[pos] = 1; // avoid infinite recursion
                this.readXRef(pos);
            }

            return more;
        },
        readXRefStream: function(parser) {
            error("Invalid XRef stream");
        },
        readXRef: function(startXRef) {
            var stream = this.stream;
            stream.pos = startXRef;
            var parser = new Parser(new Lexer(stream), true);
            var obj = parser.getObj();
            // parse an old-style xref table
            if (IsCmd(obj, "xref"))
                return this.readXRefTable(parser);
            // parse an xref stream
            if (IsInt(obj)) {
                if (!IsInt(parser.getObj()) ||
                    !IsCmd(parser.getObj(), "obj") ||
                    !IsStream(obj = parser.getObj())) {
                    error("Invalid XRef stream");
                }
                return this.readXRefStream(obj);
            }
            error("Invalid XRef");
        },
        getEntry: function(i) {
            var e = this.entries[i];
            if (e.free)
                error("reading an XRef stream not implemented yet");
            return e;
        },
        fetchIfRef: function(obj) {
            if (!IsRef(obj))
                return obj;
            return this.fetch(obj);
        },
        fetch: function(ref) {
            var num = ref.num;
            var e = this.cache[num];
            if (e)
                return e;

            e = this.getEntry(num);
            var gen = ref.gen;
            if (e.uncompressed) {
                if (e.gen != gen)
                    throw("inconsistent generation in XRef");
                var stream = this.stream.makeSubStream(e.offset);
                var parser = new Parser(new Lexer(stream), true, this);
                var obj1 = parser.getObj();
                var obj2 = parser.getObj();
                var obj3 = parser.getObj();
                if (!IsInt(obj1) || obj1 != num ||
                    !IsInt(obj2) || obj2 != gen ||
                    !IsCmd(obj3)) {
                    error("bad XRef entry");
                }
                if (!IsCmd(obj3, "obj")) {
                    // some bad pdfs use "obj1234" and really mean 1234
                    if (obj3.cmd.indexOf("obj") == 0) {
                        var num = parseInt(obj3.cmd.substring(3));
                        if (!isNaN(num))
                            return num;
                    }
                    error("bad XRef entry");
                }
                e = parser.getObj();
                // Don't cache streams since they are mutable.
                if (!IsStream(e))
                    this.cache[num] = e;
                return e;
            }
            error("compressed entry");
        },
        getCatalogObj: function() {
            return this.fetch(this.root);
        }
    };

    return constructor;
})();

var Page = (function() {
    function constructor(xref, pageNumber, pageDict) {
        this.xref = xref;
        this.pageNumber = pageNumber;
        this.pageDict = pageDict;
    }

    constructor.prototype = {
        get content() {
            return shadow(this, "content", this.pageDict.get("Contents"));
        },
        get resources() {
            return shadow(this, "resources", this.pageDict.get("Resources"));
        },
        get mediaBox() {
            var obj = this.pageDict.get("MediaBox");
            return shadow(this, "mediaBox", ((IsArray(obj) && obj.length == 4)
                                             ? obj
                                             : null));
        },
        compile: function(gfx, fonts) {
            if (!this.code) {
                var xref = this.xref;
                var content = xref.fetchIfRef(this.content);
                var resources = xref.fetchIfRef(this.resources);
                this.code = gfx.compile(content, xref, resources, fonts);
            }
        },
        display: function(gfx) {
            var xref = this.xref;
            var content = xref.fetchIfRef(this.content);
            var resources = xref.fetchIfRef(this.resources);
            var mediaBox = xref.fetchIfRef(this.mediaBox);
            assertWellFormed(IsStream(content) && IsDict(resources),
                             "invalid page content or resources");
            gfx.beginDrawing({ x: mediaBox[0], y: mediaBox[1],
                               width: mediaBox[2] - mediaBox[0],
                               height: mediaBox[3] - mediaBox[1] });
            gfx.execute(this.code, xref, resources);
            gfx.endDrawing();
        }
    };

    return constructor;
})();

var Catalog = (function() {
    function constructor(xref) {
        this.xref = xref;
        var obj = xref.getCatalogObj();
        assertWellFormed(IsDict(obj), "catalog object is not a dictionary");
        this.catDict = obj;
    }

    constructor.prototype = {
        get toplevelPagesDict() {
            var obj = this.catDict.get("Pages");
            assertWellFormed(IsRef(obj), "invalid top-level pages reference");
            var obj = this.xref.fetch(obj);
            assertWellFormed(IsDict(obj), "invalid top-level pages dictionary");
            // shadow the prototype getter
            return shadow(this, "toplevelPagesDict", obj);
        },
        get numPages() {
            obj = this.toplevelPagesDict.get("Count");
            assertWellFormed(IsInt(obj),
                             "page count in top level pages object is not an integer");
            // shadow the prototype getter
            return shadow(this, "num", obj);
        },
        traverseKids: function(pagesDict) {
            var pageCache = this.pageCache;
            var kids = pagesDict.get("Kids");
            assertWellFormed(IsArray(kids),
                             "page dictionary kids object is not an array");
            for (var i = 0; i < kids.length; ++i) {
                var kid = kids[i];
                assertWellFormed(IsRef(kid),
                                 "page dictionary kid is not a reference");
                var obj = this.xref.fetch(kid);
                if (IsDict(obj, "Page") || (IsDict(obj) && !obj.has("Kids"))) {
                    pageCache.push(new Page(this.xref, pageCache.length, obj));
                } else { // must be a child page dictionary
                    assertWellFormed(IsDict(obj),
                                     "page dictionary kid reference points to wrong type of object");           
                    this.traverseKids(obj);
                }
            }
        },
        getPage: function(n) {
            var pageCache = this.pageCache;
            if (!pageCache) {
                pageCache = this.pageCache = [];
                this.traverseKids(this.toplevelPagesDict);
            }
            return this.pageCache[n-1];
        }
    };

    return constructor;
})();

var PDFDoc = (function() {
    function constructor(stream) {
        this.stream = stream;
        this.setup();
    }

    function find(stream, needle, limit, backwards) {
        var pos = stream.pos;
        var end = stream.end;
        var str = "";
        if (pos + limit > end)
            limit = end - pos;
        for (var n = 0; n < limit; ++n)
            str += stream.getChar();
        stream.pos = pos;
        var index = backwards ? str.lastIndexOf(needle) : str.indexOf(needle);
        if (index == -1)
            return false; /* not found */
        stream.pos += index;
        return true; /* found */
    }

    constructor.prototype = {
        get linearization() {
            var length = this.stream.length;
            var linearization = false;
            if (length) {
                linearization = new Linearization(this.stream);
                if (linearization.length != length)
                    linearization = false;
            }
            // shadow the prototype getter with a data property
            return shadow(this, "linearization", linearization);
        },
        get startXRef() {
            var stream = this.stream;
            var startXRef = 0;
            var linearization = this.linearization;
            if (linearization) {
                // Find end of first obj.
                stream.reset();
                if (find(stream, "endobj", 1024))
                    startXRef = stream.pos + 6;
            } else {
                // Find startxref at the end of the file.
                var start = stream.end - 1024;
                if (start < 0)
                    start = 0;
                stream.pos = start;
                if (find(stream, "startxref", 1024, true)) {
                    stream.skip(9);
                    var ch;
                    while (Lexer.isSpace(ch = stream.getChar()))
                        ;
                    var str = "";
                    while ((ch - "0") <= 9) {
                        str += ch;
                        ch = stream.getChar();
                    }
                    startXRef = parseInt(str);
                    if (isNaN(startXRef))
                        startXRef = 0;
                }
            }
            // shadow the prototype getter with a data property
            return shadow(this, "startXRef", startXRef);
        },
        get mainXRefEntriesOffset() {
            var mainXRefEntriesOffset = 0;
            var linearization = this.linearization;
            if (linearization)
                mainXRefEntriesOffset = linearization.mainXRefEntriesOffset;
            // shadow the prototype getter with a data property
            return shadow(this, "mainXRefEntriesOffset", mainXRefEntriesOffset);
        },
        // Find the header, remove leading garbage and setup the stream
        // starting from the header.
        checkHeader: function() {
            var stream = this.stream;
            stream.reset();
            if (find(stream, "%PDF-", 1024)) {
                // Found the header, trim off any garbage before it.
                stream.moveStart();
                return;
            }
            // May not be a PDF file, continue anyway.
        },
        setup: function(ownerPassword, userPassword) {
            this.checkHeader();
            this.xref = new XRef(this.stream,
                                 this.startXRef,
                                 this.mainXRefEntriesOffset);
            this.catalog = new Catalog(this.xref);
        },
        get numPages() {
            var linearization = this.linearization;
            var num = linearization
                      ? linearization.numPages
                      : this.catalog.numPages;
            // shadow the prototype getter
            return shadow(this, "numPages", num);
        },
        getPage: function(n) {
            var linearization = this.linearization;
            assert(!linearization, "linearized page access not implemented");
            return this.catalog.getPage(n);
        }
    };

    return constructor;
})();

const IDENTITY_MATRIX = [ 1, 0, 0, 1, 0, 0 ];

// <canvas> contexts store most of the state we need natively.
// However, PDF needs a bit more state, which we store here.
var CanvasExtraState = (function() {
    function constructor() {
        // Are soft masks and alpha values shapes or opacities?
        this.alphaIsShape = false;
        this.fontSize = 0.0;
        this.textMatrix = IDENTITY_MATRIX;
        this.leading = 0.0;
        // Current point (in user coordinates)
        this.x = 0.0;
        this.y = 0.0;
        // Start of text line (in text coordinates)
        this.lineX = 0.0;
        this.lineY = 0.0;
    }
    constructor.prototype = {
    };
    return constructor;
})();

var CanvasGraphics = (function() {
    function constructor(canvasCtx) {
        this.ctx = canvasCtx;
        this.current = new CanvasExtraState();
        this.stateStack = [ ];
        this.pendingClip = null;
        this.res = null;
        this.xobjs = null;
        this.map = {
            // Graphics state
            w: "setLineWidth",
            J: "setLineCap",
            j: "setLineJoin",
            M: "setMiterLimit",
            d: "setDash",
            ri: "setRenderingIntent",
            i: "setFlatness",
            gs: "setGState",
            q: "save",
            Q: "restore",
            cm: "transform",

            // Path
            m: "moveTo",
            l: "lineTo",
            c: "curveTo",
            v: "curveTo2",
            y: "curveTo3",
            h: "closePath",
            re: "rectangle",
            S: "stroke",
            s: "closeStroke",
            f: "fill",
            "f*": "eoFill",
            B: "fillStroke",
            "B*": "eoFillStroke",
            b: "closeFillStroke",
            "b*": "closeEOFillStroke",
            n: "endPath",

            // Clipping
            W: "clip",
            "W*": "eoClip",

            // Text
            BT: "beginText",
            ET: "endText",
            Tc: "setCharSpacing",
            Tw: "setWordSpacing",
            Tz: "setHScale",
            TL: "setLeading",
            Tf: "setFont",
            Tr: "setTextRenderingMode",
            Ts: "setTextRise",
            Td: "moveText",
            TD: "setLeadingMoveText",
            Tm: "setTextMatrix",
            "T*": "nextLine",
            Tj: "showText",
            TJ: "showSpacedText",
            "'": "nextLineShowText",
            '"': "nextLineSetSpacingShowText",

            // Type3 fonts
            d0: "setCharWidth",
            d1: "setCharWidthAndBounds",

            // Color
            CS: "setStrokeColorSpace",
            cs: "setFillColorSpace",
            SC: "setStrokeColor",
            SCN: "setStrokeColorN",
            sc: "setFillColor",
            scn: "setFillColorN",
            G: "setStrokeGray",
            g: "setFillGray",
            RG: "setStrokeRGBColor",
            rg: "setFillRGBColor",
            K: "setStrokeCMYKColor",
            k: "setFillCMYKColor",

            // Shading
            sh: "shadingFill",

            // Images
            BI: "beginInlineImage",

            // XObjects
            Do: "paintXObject",

            // Marked content
            MP: "markPoint",
            DP: "markPointProps",
            BMC: "beginMarkedContent",
            BDC: "beginMarkedContentProps",
            EMC: "endMarkedContent",

            // Compatibility
            BX: "beginCompat",
            EX: "endCompat",
        };
    }

    const LINE_CAP_STYLES = [ "butt", "round", "square" ];
    const LINE_JOIN_STYLES = [ "miter", "round", "bevel" ];
    const NORMAL_CLIP = {};
    const EO_CLIP = {};

    constructor.prototype = {
        translateFont: function(fontDict, xref, resources) {
            var descriptor = xref.fetch(fontDict.get("FontDescriptor"));
            var fontName = descriptor.get("FontName").name;
            fontName = fontName.replace("+", "_");

            var fontFile = descriptor.get2("FontFile", "FontFile2");
            if (!fontFile)
              errort("FontFile not found for font: " + fontName);
            fontFile = xref.fetchIfRef(fontFile);

            // Generate the custom cmap of the font if needed
            var encodingMap = {};
            if (fontDict.has("Encoding")) {
                var encoding = xref.fetchIfRef(fontDict.get("Encoding"));
                if (IsDict(encoding)) {
                    // Build an map between codes and glyphs
                    var differences = encoding.get("Differences");
                    var index = 0;
                    for (var j = 0; j < differences.length; j++) {
                        var data = differences[j];
                        IsNum(data) ? index = data : encodingMap[index++] = data;
                    }

                    // Get the font charset if any
                    var charset = descriptor.get("CharSet");
                    if (charset)
                      charset = charset.split("/");

                } else if (IsName(encoding)) {
                    var encoding = Encodings[encoding];
                    var widths = xref.fetchIfRef(fontDict.get("Widths"));
                    var firstchar = xref.fetchIfRef(fontDict.get("FirstChar"));

                    var charset = [];
                    for (var j = 0; j < widths.length; j++) {
                        var index = widths[j];
                        if (!index)
                          continue;

                        charset.push(encoding[j + firstchar]);
                    }
                }
            }

            var properties = {
                type: fontDict.get("Subtype").name,
                encoding: encodingMap,
                charset: charset,
                bbox: descriptor.get("FontBBox")
            };

            return {
                name: fontName,
              file: fontFile,
              properties: properties
            }
        },

        beginDrawing: function(mediaBox) {
            var cw = this.ctx.canvas.width, ch = this.ctx.canvas.height;
            this.ctx.save();
            this.ctx.scale(cw / mediaBox.width, -ch / mediaBox.height);
            this.ctx.translate(0, -mediaBox.height);
        },

        execute: function(code, xref, resources) {
            var savedXref = this.xref, savedRes = this.res, savedXobjs = this.xobjs;
            this.xref = xref;
            this.res = resources || new Dict();
            this.xobjs = xref.fetchIfRef(this.res.get("XObject")) || new Dict();

            code(this);

            this.xobjs = savedXobjs;
            this.res = savedRes;
            this.xref = savedXref;
        },

        compile: function(stream, xref, resources, fonts) {
            var xobjs = xref.fetchIfRef(resources.get("XObject")) || new Dict();

            var parser = new Parser(new Lexer(stream), false);
            var objpool = [];

            function emitArg(arg) {
                if (typeof arg == "object" || typeof arg == "string") {
                    var index = objpool.length;
                    objpool[index] = arg;
                    return "objpool[" + index + "]";
                }
                return arg;
            }

            var src = "";

            var args = [];
            var map = this.map;
            var obj;
            while (!IsEOF(obj = parser.getObj())) {
                if (IsCmd(obj)) {
                    var cmd = obj.cmd;
                    var fn = map[cmd];
                    assertWellFormed(fn, "Unknown command '" + cmd + "'");
                    // TODO figure out how to type-check vararg functions

                    if (cmd == "Do" && !args[0].code) { // eagerly compile XForm objects
                        var name = args[0].name;
                        var xobj = xobjs.get(name);
                        if (xobj) {
                            xobj = xref.fetchIfRef(xobj);
                            assertWellFormed(IsStream(xobj), "XObject should be a stream");

                            var type = xobj.dict.get("Subtype");
                            assertWellFormed(IsName(type), "XObject should have a Name subtype");

                            if ("Form" == type.name) {
                                args[0].code = this.compile(xobj,
                                                            xref,
                                                            xobj.dict.get("Resources"),
                                                            fonts);
                            }
                        }
                    } else if (cmd == "Tf") { // eagerly collect all fonts
                        var fontRes = resources.get("Font");
                        if (fontRes) {
                            fontRes = xref.fetchIfRef(fontRes);
                            var font = xref.fetchIfRef(fontRes.get(args[0].name));
                            assertWellFormed(IsDict(font));
                            if (!font.translated) {
                                font.translated = this.translateFont(font, xref, resources);
                                if (fonts && font.translated) {
                                    // keep track of each font we translated so the caller can
                                    // load them asynchronously before calling display on a page
                                    fonts.push(font.translated);
                                }
                            }
                        }
                    }

                    src += "this.";
                    src += fn;
                    src += "(";
                    src += args.map(emitArg).join(",");
                    src += ");\n";

                    args.length = 0;
                } else {
                    assertWellFormed(args.length <= 33, "Too many arguments");
                    args.push(obj);
                }
            }

            var fn = Function("objpool", src);
            return function (gfx) { fn.call(gfx, objpool); };
        },

        endDrawing: function() {
            this.ctx.restore();
        },

        // Graphics state
        setLineWidth: function(width) {
            this.ctx.lineWidth = width;
        },
        setLineCap: function(style) {
            this.ctx.lineCap = LINE_CAP_STYLES[style];
        },
        setLineJoin: function(style) {
            this.ctx.lineJoin = LINE_JOIN_STYLES[style];
        },
        setMiterLimit: function(limit) {
            this.ctx.miterLimit = limit;
        },
        setDash: function(dashArray, dashPhase) {
            this.ctx.mozDash = dashArray;
            this.ctx.mozDashOffset = dashPhase;
        },
        setRenderingIntent: function(intent) {
            TODO("set rendering intent");
        },
        setFlatness: function(flatness) {
            TODO("set flatness");
        },
        setGState: function(dictName) {
            TODO("set graphics state from dict");
        },
        save: function() {
            this.ctx.save();
            this.stateStack.push(this.current);
            this.current = new CanvasExtraState();
        },
        restore: function() {
            var prev = this.stateStack.pop();
            if (prev) {
                this.current = prev;
                this.ctx.restore();
            }
        },
        transform: function(a, b, c, d, e, f) {
            this.ctx.transform(a, b, c, d, e, f);
        },

        // Path
        moveTo: function(x, y) {
            this.ctx.moveTo(x, y);
        },
        lineTo: function(x, y) {
            this.ctx.lineTo(x, y);
        },
        curveTo: function(x1, y1, x2, y2, x3, y3) {
            this.ctx.bezierCurveTo(x1, y1, x2, y2, x3, y3);
        },
        curveTo2: function(x2, y2, x3, y3) {
            TODO("'v' operator: need current point in gfx context");
        },
        curveTo3: function(x1, y1, x3, y3) {
            this.curveTo(x1, y1, x3, y3, x3, y3);
        },
        closePath: function() {
            this.ctx.closePath();
        },
        rectangle: function(x, y, width, height) {
            this.ctx.rect(x, y, width, height);
        },
        stroke: function() {
            this.ctx.stroke();
            this.consumePath();
        },
        closeStroke: function() {
            this.closePath();
            this.stroke();
        },
        fill: function() {
            this.ctx.fill();
            this.consumePath();
        },
        eoFill: function() {
            var savedFillRule = this.setEOFillRule();
            this.fill();
            this.restoreFillRule(savedFillRule);
        },
        fillStroke: function() {
            this.ctx.fill();
            this.ctx.stroke();
            this.consumePath();
        },
        eoFillStroke: function() {
            var savedFillRule = this.setEOFillRule();
            this.fillStroke();
            this.restoreFillRule(savedFillRule);
        },
        closeFillStroke: function() {
            return this.fillStroke();
        },
        closeEOFillStroke: function() {
            var savedFillRule = this.setEOFillRule();
            this.fillStroke();
            this.restoreFillRule(savedFillRule);
        },
        endPath: function() {
            this.consumePath();
        },

        // Clipping
        clip: function() {
            this.pendingClip = NORMAL_CLIP;
        },
        eoClip: function() {
            this.pendingClip = EO_CLIP;
        },

        // Text
        beginText: function() {
            this.current.textMatrix = IDENTITY_MATRIX;
            this.current.x = this.current.lineX = 0;
            this.current.y = this.current.lineY = 0;
        },
        endText: function() {
        },
        setCharSpacing: function(spacing) {
            TODO("character (glyph?) spacing");
        },
        setWordSpacing: function(spacing) {
            TODO("word spacing");
        },
        setHSpacing: function(scale) {
            TODO("horizontal text scale");
        },
        setLeading: function(leading) {
            this.current.leading = leading;
        },
        setFont: function(fontRef, size) {
            var font = this.res.get("Font");
            if (!IsDict(font))
              return;

            font = font.get(fontRef.name);
            font = this.xref.fetchIfRef(font);
            if (!font)
                return;

            var fontName = "";
            var fontDescriptor = font.get("FontDescriptor");
            if (fontDescriptor.num) {
                var fontDescriptor = this.xref.fetchIfRef(fontDescriptor);
                fontName = fontDescriptor.get("FontName").name.replace("+", "_");
                Fonts.active = fontName;
            }

            this.current.fontSize = size;
            this.ctx.font = this.current.fontSize +'px "' + fontName + '"';
        },
        setTextRenderingMode: function(mode) {
            TODO("text rendering mode");
        },
        setTextRise: function(rise) {
            TODO("text rise");
        },
        moveText: function (x, y) {
            this.current.x = this.current.lineX += x;
            this.current.y = this.current.lineY += y;
        },
        setLeadingMoveText: function(x, y) {
            this.setLeading(-y);
            this.moveText(x, y);
        },
        setTextMatrix: function(a, b, c, d, e, f) {
            this.current.textMatrix = [ a, b, c, d, e, f ];
            this.current.x = this.current.lineX = 0;
            this.current.y = this.current.lineY = 0;
        },
        nextLine: function() {
            this.moveText(0, this.current.leading);
        },
        showText: function(text) {
            this.ctx.save();
            this.ctx.translate(0, 2 * this.current.y);
            this.ctx.scale(1, -1);
            this.ctx.transform.apply(this.ctx, this.current.textMatrix);

            // Replace characters code by glyphs code
            var glyphs = [];
            for (var i = 0; i < text.length; i++)
              glyphs[i] = String.fromCharCode(Fonts.unicodeFromCode(text[i].charCodeAt(0)));

            this.ctx.fillText(glyphs.join(""), this.current.x, this.current.y);
            this.current.x += this.ctx.measureText(text).width;

            this.ctx.restore();
        },
        showSpacedText: function(arr) {
            for (var i = 0; i < arr.length; ++i) {
                var e = arr[i];
                if (IsNum(e)) {
                    this.current.x -= e * 0.001 * this.current.fontSize;
                } else if (IsString(e)) {
                    this.showText(e);
                } else {
                    malformed("TJ array element "+ e +" isn't string or num");
                }
            }
        },
        nextLineShowText: function(text) {
            this.nextLine();
            this.showText(text);
        },
        nextLineSetSpacingShowText: function(wordSpacing, charSpacing, text) {
            this.setWordSpacing(wordSpacing);
            this.setCharSpacing(charSpacing);
            this.nextLineShowText(text);
        },

        // Type3 fonts
        setCharWidth: function(xWidth, yWidth) {
            TODO("type 3 fonts ('d0' operator)");
        },
        setCharWidthAndBounds: function(xWidth, yWidth, llx, lly, urx, ury) {
            TODO("type 3 fonts ('d1' operator)");
        },

        // Color
        setStrokeColorSpace: function(space) {
            // TODO real impl
        },
        setFillColorSpace: function(space) {
            // TODO real impl
        },
        setStrokeColor: function(/*...*/) {
            // TODO real impl
            if (1 === arguments.length) {
                this.setStrokeGray.apply(this, arguments);
            } else if (3 === arguments.length) {
                this.setStrokeRGBColor.apply(this, arguments);
            }
        },
        setStrokeColorN: function(/*...*/) {
            // TODO real impl
            this.setStrokeColor.apply(this, arguments);
        },
        setFillColor: function(/*...*/) {
            // TODO real impl
            if (1 === arguments.length) {
                this.setFillGray.apply(this, arguments);
            } else if (3 === arguments.length) {
                this.setFillRGBColor.apply(this, arguments);
            }
        },
        setFillColorN: function(/*...*/) {
            // TODO real impl
            this.setFillColor.apply(this, arguments);
        },
        setStrokeGray: function(gray) {
            this.setStrokeRGBColor(gray, gray, gray);
        },
        setFillGray: function(gray) {
            this.setFillRGBColor(gray, gray, gray);
        },
        setStrokeRGBColor: function(r, g, b) {
            this.ctx.strokeStyle = this.makeCssRgb(r, g, b);
        },
        setFillRGBColor: function(r, g, b) {
            this.ctx.fillStyle = this.makeCssRgb(r, g, b);
        },
        setStrokeCMYKColor: function(c, m, y, k) {
            TODO("CMYK space");
        },
        setFillCMYKColor: function(c, m, y, k) {
            TODO("CMYK space");
        },

        // Shading
        shadingFill: function(entryRef) {
            var xref = this.xref;
            var res = this.res;
            
            var shadingRes = xref.fetchIfRef(res.get("Shading"));
            if (!shadingRes)
                error("No shading resource found");

            var shading = xref.fetchIfRef(shadingRes.get(entryRef.name));
            if (!shading)
                error("No shading object found");

            this.save();

            var bbox = shading.get("BBox");
            if (bbox && IsArray(bbox) && 4 == bbox.length) {
                this.rectangle.apply(this, bbox);
                this.clip();
                this.endPath();
            }

            var cs = shading.get2("ColorSpace", "CS");
            TODO("shading-fill color space");

            var background = shading.get("Background");
            if (background)
                TODO("handle background colors");

            const types = [null, this.fillFunctionShading,
                  this.fillAxialShading, this.fillRadialShading];
            
            var typeNum = shading.get("ShadingType");
            var fillFn = types[typeNum];
            if (!fillFn) 
                error("Unknown type of shading");
            fillFn.apply(this, [shading]);

            this.restore();
        },

        fillAxialShading: function(sh) {
            var coordsArr = sh.get("Coords");
            var x0 = coordsArr[0], y0 = coordsArr[1],
                x1 = coordsArr[2], y1 = coordsArr[3];
            
            var t0 = 0.0, t1 = 1.0;
            if (sh.has("Domain")) {
                var domainArr = sh.get("Domain");
                t0 = domainArr[0], t1 = domainArr[1];
            }

            var extendStart = false, extendEnd = false;
            if (sh.has("Extend")) {
                var extendArr = sh.get("Extend");
                extendStart = extendArr[0], extendEnd = extendArr[1];
                TODO("Support extend");
            }
            var fnObj = sh.get("Function");
            fnObj = this.xref.fetchIfRef(fnObj);
            if (IsArray(fnObj))
                error("No support for array of functions");
            else if (!IsPDFFunction(fnObj))
                error("Invalid function");
            fn = new PDFFunction(this.xref, fnObj);

            var gradient = this.ctx.createLinearGradient(x0, y0, x1, y1);
            var step = (t1 - t0) / 10;
            
            for (var i = t0; i <= t1; i += step) {
                var c = fn.func([i]);
                gradient.addColorStop(i, this.makeCssRgb.apply(this, c));
            }

            this.ctx.fillStyle = gradient;
            
            // HACK to draw the gradient onto an infinite rectangle.
            // PDF gradients are drawn across the entire image while
            // Canvas only allows gradients to be drawn in a rectangle
            this.ctx.fillRect(-1e10, -1e10, 2e10, 2e10);
        },

        // Images
        beginInlineImage: function() {
            TODO("inline images");
            error("(Stream will not be parsed properly, bailing now)");
            // Like an inline stream:
            //  - key/value pairs up to Cmd(ID)
            //  - then image data up to Cmd(EI)
        },

        // XObjects
        paintXObject: function(obj) {
            var xobj = this.xobjs.get(obj.name);
            if (!xobj)
                return;
            xobj = this.xref.fetchIfRef(xobj);
            assertWellFormed(IsStream(xobj), "XObject should be a stream");
            
            var oc = xobj.dict.get("OC");
            if (oc) {
                TODO("oc for xobject");
            }
            
            var opi = xobj.dict.get("OPI");
            if (opi) {
                TODO("opi for xobject");
            }

            var type = xobj.dict.get("Subtype");
            assertWellFormed(IsName(type), "XObject should have a Name subtype");
            if ("Image" == type.name) {
                this.paintImageXObject(obj, xobj, false);
            } else if ("Form" == type.name) {
                this.paintFormXObject(obj, xobj);
            } else if ("PS" == type.name) {
                warn("(deprecated) PostScript XObjects are not supported");
            } else {
                malformed("Unknown XObject subtype "+ type.name);
            }
        },

        paintFormXObject: function(ref, stream) {
            this.save();

            var matrix = stream.dict.get("Matrix");
            if (matrix && IsArray(matrix) && 6 == matrix.length)
                this.transform.apply(this, matrix);

            var bbox = stream.dict.get("BBox");
            if (bbox && IsArray(bbox) && 4 == bbox.length) {
                this.rectangle.apply(this, bbox);
                this.clip();
                this.endPath();
            }

            this.execute(ref.code, this.xref, stream.dict.get("Resources"));

            this.restore();
        },

        paintImageXObject: function(ref, image, inline) {
            this.save();
            if (image.getParams) {
                // JPX/JPEG2000 streams directly contain bits per component
                // and color space mode information.
                TODO("get params from actual stream");
                // var bits = ...
                // var colorspace = ...
            }
            // TODO cache rendered images?

            var dict = image.dict;
            var w = dict.get2("Width", "W");
            var h = dict.get2("Height", "H");

            if (w < 1 || h < 1)
                error("Invalid image width or height");
            
            var ctx = this.ctx;
            // scale the image to the unit square
            ctx.scale(1/w, 1/h);

            var interpolate = dict.get2("Interpolate", "I");
            if (!IsBool(interpolate))
                interpolate = false;
            var imageMask = dict.get2("ImageMask", "IM");
            if (!IsBool(imageMask))
                imageMask = false;

            var bitsPerComponent = image.bitsPerComponent;
            if (!bitsPerComponent) {
                bitsPerComponent = dict.get2("BitsPerComponent", "BPC");
                if (!bitsPerComponent) {
                    if (imageMask)
                        bitsPerComponent = 1;
                    else
                        error("Bits per component missing in image");
                }
            }

            if (bitsPerComponent !== 8)
                error("Unsupported bpc");

            var xref = this.xref;
            var colorSpaces = this.colorSpaces;

            if (imageMask) {
                error("support image masks");
            }

            // actual image
            var csStream = dict.get2("ColorSpace", "CS");
            csStream = xref.fetchIfRef(csStream);
            if (IsName(csStream) && inline) 
                csStream = colorSpaces.get(csStream);
            
            var colorSpace = new ColorSpace(xref, csStream);

            var decode = dict.get2("Decode", "D");

            TODO("create color map");
            
            var mask = image.dict.get("Mask");
            mask = xref.fetchIfRef(mask);
            var smask = image.dict.get("SMask");
            smask = xref.fetchIfRef(smask);

            if (IsStream(smask)) {
                if (inline)
                    error("cannot combine smask and inlining");

                var maskDict = smask.dict;
                var maskW = maskDict.get2("Width", "W");
                var maskH = maskDict.get2("Height", "H");
                if (!IsNum(maskW) || !IsNum(maskH) || maskW < 1 || maskH < 1)
                    error("Invalid image width or height");
                if (maskW !== w || maskH !== h)
                    error("Invalid image width or height");

                var maskInterpolate = maskDict.get2("Interpolate", "I");
                if (!IsBool(maskInterpolate))
                    maskInterpolate = false;

                var maskBPC = maskDict.get2("BitsPerComponent", "BPC");
                if (!maskBPC)
                    error("Invalid image mask bpc");
            
                var maskCsStream = maskDict.get2("ColorSpace", "CS");
                maskCsStream = xref.fetchIfRef(maskCsStream);
                var maskColorSpace = new ColorSpace(xref, maskCsStream);
                if (maskColorSpace.mode !== "DeviceGray")
                    error("Invalid color space for smask");

                var maskDecode = maskDict.get2("Decode", "D");
                if (maskDecode)
                    TODO("Handle mask decode");
                // handle matte object 
            } else {
                smask = null;
            }

            var tmpCanvas = document.createElement("canvas");
            tmpCanvas.width = w;
            tmpCanvas.height = h;
            var tmpCtx = tmpCanvas.getContext("2d");
            var imgData = tmpCtx.getImageData(0, 0, w, h);
            var pixels = imgData.data;
            
            if (bitsPerComponent != 8)
                error("unhandled number of bits per component"); 
            
            if (smask) {
                if (maskColorSpace.numComps != 1)
                    error("Incorrect number of components in smask");
                
                var numComps = colorSpace.numComps;
                var imgArray = image.getBytes(numComps * w * h);
                var imgIdx = 0;

                var smArray = smask.getBytes(w * h);
                var smIdx = 0;
               
                var length = 4 * w * h;
                switch (numComps) {
                case 1:
                    for (var i = 0; i < length; i += 4) {
                        var p = imgArray[imageIdx++];
                        pixels[i] = p;
                        pixels[i+1] = p;
                        pixels[i+2] = p;
                        pixels[i+3] = smArray[smIdx++];
                    }
                    break;
                case 3:
                    for (var i = 0; i < length; i += 4) {
                        pixels[i] = imgArray[imgIdx++];
                        pixels[i+1] = imgArray[imgIdx++];
                        pixels[i+2] = imgArray[imgIdx++];
                        pixels[i+3] = smArray[smIdx++];
                    }
                    break;
                default:
                    error("unhandled amount of components per pixel: " + numComps);
                }
            } else {
                var numComps = colorSpace.numComps;
                var imgArray = image.getBytes(numComps * w * h);
                var imgIdx = 0;
               
                var length = 4 * w * h;
                switch (numComps) {
                case 1:
                    for (var i = 0; i < length; i += 4) {
                        var p = imgArray[imageIdx++];
                        pixels[i] = p;
                        pixels[i+1] = p;
                        pixels[i+2] = p;
                        pixels[i+3] = 255;
                    }
                    break;
                case 3:
                    for (var i = 0; i < length; i += 4) {
                        pixels[i] = imgArray[imgIdx++];
                        pixels[i+1] = imgArray[imgIdx++];
                        pixels[i+2] = imgArray[imgIdx++];
                        pixels[i+3] = 255;
                    }
                    break;
                default:
                    error("unhandled amount of components per pixel: " + numComps);
                }
            }
            tmpCtx.putImageData(imgData, 0, 0);
            ctx.drawImage(tmpCanvas, 0, 0);
            this.restore();
        },

        // Marked content

        markPoint: function(tag) {
            TODO("Marked content");
        },
        markPointProps: function(tag, properties) {
            TODO("Marked content");
        },
        beginMarkedContent: function(tag) {
            TODO("Marked content");
        },
        beginMarkedContentProps: function(tag, properties) {
            TODO("Marked content");
        },
        endMarkedContent: function() {
            TODO("Marked content");
        },

        // Compatibility

        beginCompat: function() {
            TODO("ignore undefined operators (should we do that anyway?)");
        },
        endCompat: function() {
            TODO("stop ignoring undefined operators");
        },

        // Helper functions

        consumePath: function() {
            if (this.pendingClip) {
                var savedFillRule = null;
                if (this.pendingClip == EO_CLIP)
                    savedFillRule = this.setEOFillRule();

                this.ctx.clip();

                this.pendingClip = null;
                if (savedFillRule !== null)
                    this.restoreFillRule(savedFillRule);
            }
            this.ctx.beginPath();
        },
        makeCssRgb: function(r, g, b) {
            var ri = (255 * r) | 0, gi = (255 * g) | 0, bi = (255 * b) | 0;
            return "rgb("+ ri +","+ gi +","+ bi +")";
        },
        // We generally keep the canvas context set for
        // nonzero-winding, and just set evenodd for the operations
        // that need them.
        setEOFillRule: function() {
            var savedFillRule = this.ctx.mozFillRule;
            this.ctx.mozFillRule = "evenodd";
            return savedFillRule;
        },
        restoreFillRule: function(rule) {
            this.ctx.mozFillRule = rule;
        }
    };

    return constructor;
})();

var ColorSpace = (function() {
    function constructor(xref, cs) {
        if (IsName(cs)) {
            var mode = cs.name;
            this.mode = mode;
            switch(mode) {
            case "DeviceGray":
            case "G":
                this.numComps = 1;
                break;
            }
            TODO("fill in color space constructor");
        } else if (IsArray(cs)) {
            var mode = cs[0].name;
            this.mode = mode;
            
            var stream = cs[1];
            stream = xref.fetchIfRef(stream);

            switch (mode) {
            case "DeviceGray":
            case "G":
                this.stream = stream;
                this.dict = stream.dict;
                this.numComps = 1;
                break;
            case "ICCBased":
                var dict = stream.dict;
                
                this.stream = stream;
                this.dict = dict;
                this.numComps = dict.get("N");
                break;
            default:
                error("unrecognized color space object");
            }
        } else {
            error("unrecognized color space object");
        }
    };
    
    constructor.prototype = {
    };

    return constructor;
})();

var PDFFunction = (function() {
    function constructor(xref, fn) {
        var dict = fn.dict;
        if (!dict)
           dict = fn;

        const types = [this.constructSampled, null,
                this.constructInterpolated, this.constructStiched,
                this.constructPostScript];
        
        var typeNum = dict.get("FunctionType");
        var typeFn = types[typeNum];
        if (!typeFn) 
            error("Unknown type of function");

        typeFn.apply(this, [fn, dict]);
    };

    constructor.prototype = {
        constructSampled: function(str, dict) {
            var domain = dict.get("Domain");
            var range = dict.get("Range");

            if (!domain || !range)
                error("No domain or range");
        
            var inputSize = domain.length / 2;
            var outputSize = range.length / 2;

            if (inputSize != 1)
                error("No support for multi-variable inputs to functions");

            var size = dict.get("Size");
            var bps = dict.get("BitsPerSample");
            var order = dict.get("Order");
            if (!order)
                order = 1;
            if (order !== 1)
                error ("No support for cubic spline interpolation");
            
            var encode = dict.get("Encode");
            if (!encode) {
                encode = [];
                for (var i = 0; i < inputSize; ++i) {
                    encode.push(0);
                    encode.push(size[i] - 1);
                }
            }
            var decode = dict.get("Decode");
            if (!decode)
                decode = range;

            var samples = this.getSampleArray(size, outputSize, bps, str);

            this.func = function(args) {
                var clip = function(v, min, max) {
                    if (v > max)
                        v = max;
                    else if (v < min)
                        v = min
                    return v;
                }

                if (inputSize != args.length)
                    error("Incorrect number of arguments");

                for (var i = 0; i < inputSize; i++) {
                    var i2 = i * 2;
                    
                    // clip to the domain
                    var v = clip(args[i], domain[i2], domain[i2 + 1]);

                    // encode
                    v = encode[i2] + ((v - domain[i2]) * 
                            (encode[i2 + 1] - encode[i2]) / 
                            (domain[i2 + 1] - domain[i2]));
                    
                    // clip to the size
                    args[i] = clip(v, 0, size[i] - 1);
                }

                // interpolate to table
                TODO("Multi-dimensional interpolation");
                var floor = Math.floor(args[0]);
                var ceil = Math.ceil(args[0]);
                var scale = args[0] - floor;

                floor *= outputSize;
                ceil *= outputSize;

                var output = [];
                for (var i = 0; i < outputSize; ++i) {
                    if (ceil == floor) {
                        var v = samples[ceil + i];
                    } else {
                        var low = samples[floor + i];
                        var high = samples[ceil + i];
                        var v = low * scale + high * (1 - scale);
                    }
                    
                    var i2 = i * 2;
                    // decode
                    v = decode[i2] + (v * (decode[i2 + 1] - decode[i2]) / 
                            ((1 << bps) - 1));
                    
                    // clip to the domain
                    output.push(clip(v, range[i2], range[i2 + 1]));
                }

                return output;
            }
        },
        getSampleArray: function(size, outputSize, bps, str) {
            var length = 1;
            for (var i = 0; i < size.length; i++)
                length *= size[i];
            length *= outputSize;

            var array = [];
            var codeSize = 0;
            var codeBuf = 0;

            var strBytes = str.getBytes((length * bps + 7) / 8);
            var strIdx = 0;
            for (var i = 0; i < length; i++) {
                var b;
                while (codeSize < bps) {
                    codeBuf <<= 8;
                    codeBuf |= strBytes[strIdx++];
                    codeSize += 8;
                }
                codeSize -= bps
                array.push(codeBuf >> codeSize);
                codeBuf &= (1 << codeSize) - 1;
            }
            return array;
        },
        constructInterpolated: function() {
            error("unhandled type of function");
        },    
        constructStiched: function() {
            error("unhandled type of function");
        },    
        constructPostScript: function() {
            error("unhandled type of function");
        }
    };

    return constructor;
})();
