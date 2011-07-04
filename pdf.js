/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- /
/* vim: set shiftwidth=4 tabstop=8 autoindent cindent expandtab: */

"use strict";

var ERRORS = 0, WARNINGS = 1, TODOS = 5;
var verbosity = WARNINGS;

function log(msg) {
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

function bytesToString(bytes) {
    var str = "";
    var length = bytes.length;
    for (var n = 0; n < length; ++n)
        str += String.fromCharCode(bytes[n]);
    return str;
}

function stringToBytes(str) {
    var length = str.length;
    var bytes = new Uint8Array(length);
    for (var n = 0; n < length; ++n)
        bytes[n] = str.charCodeAt(n) & 0xFF;
    return bytes;
}

var Stream = (function() {
    function constructor(arrayBuffer, start, length, dict) {
        this.bytes = new Uint8Array(arrayBuffer);
        this.start = start || 0;
        this.pos = this.start;
        this.end = (start + length) || this.bytes.length;
        this.dict = dict;
    }

    // required methods for a stream. if a particular stream does not
    // implement these, an error should be thrown
    constructor.prototype = {
        get length() {
            return this.end - this.start;
        },
        getByte: function stream_getByte() {
            if (this.pos >= this.end)
                return null;
            return this.bytes[this.pos++];
        },
        // returns subarray of original buffer
        // should only be read
        getBytes: function stream_getBytes(length) {
            var bytes = this.bytes;
            var pos = this.pos;
            var strEnd = this.end;

            if (!length)
                return bytes.subarray(pos, strEnd);

            var end = pos + length;
            if (end > strEnd)
                end = strEnd;

            this.pos = end;
            return bytes.subarray(pos, end);
        },
        lookChar: function stream_lookChar() {
            if (this.pos >= this.end)
                return null;
            return String.fromCharCode(this.bytes[this.pos]);
        },
        getChar: function stream_getChar() {
            if (this.pos >= this.end)
                return null;
            return String.fromCharCode(this.bytes[this.pos++]);
        },
        skip: function stream_skip(n) {
            if (!n)
                n = 1;
            this.pos += n;
        },
        reset: function stream_reset() {
            this.pos = this.start;
        },
        moveStart: function stream_moveStart() {
            this.start = this.pos;
        },
        makeSubStream: function stream_makeSubstream(start, length, dict) {
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

// super class for the decoding streams
var DecodeStream = (function() {
    function constructor() {
        this.pos = 0;
        this.bufferLength = 0;
        this.eof = false;
        this.buffer = null;
    }
    
    constructor.prototype = {
        ensureBuffer: function decodestream_ensureBuffer(requested) {
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
        getByte: function decodestream_getByte() {
            var pos = this.pos;
            while (this.bufferLength <= pos) {
                if (this.eof)
                    return null;
                this.readBlock();
            }
            return this.buffer[this.pos++];
        },
        getBytes: function decodestream_getBytes(length) {
            var pos = this.pos;

            if (length) {
                this.ensureBuffer(pos + length);
                var end = pos + length;

                while (!this.eof && this.bufferLength < end)
                    this.readBlock();

                var bufEnd = this.bufferLength;
                if (end > bufEnd)
                    end = bufEnd;
            } else {
                while (!this.eof)
                    this.readBlock();

                var end = this.bufferLength;
            }

            this.pos = end;
            return this.buffer.subarray(pos, end)
        },
        lookChar: function decodestream_lookChar() {
            var pos = this.pos;
            while (this.bufferLength <= pos) {
                if (this.eof)
                    return null;
                this.readBlock();
            }
            return String.fromCharCode(this.buffer[this.pos]);
        },
        getChar: function decodestream_getChar() {
            var pos = this.pos;
            while (this.bufferLength <= pos) {
                if (this.eof)
                    return null;
                this.readBlock();
            }
            return String.fromCharCode(this.buffer[this.pos++]);
        },
        skip: function decodestream_skip(n) {
            if (!n)
                n = 1;
            this.pos += n;
        }
    };

    return constructor;
})();


var FakeStream = (function() {
    function constructor(stream) {
        this.dict = stream.dict;
        DecodeStream.call(this);
    };

    constructor.prototype = Object.create(DecodeStream.prototype);
    constructor.prototype.readBlock = function() {
        var bufferLength = this.bufferLength;
        bufferLength += 1024;
        var buffer = this.ensureBuffer(bufferLength);
        this.bufferLength = bufferLength;
    };
    constructor.prototype.getBytes = function(length) {
        var pos = this.pos;

        if (length) {
            this.ensureBuffer(pos + length);
            var end = pos + length;

            while (!this.eof && this.bufferLength < end)
                this.readBlock();

            var bufEnd = this.bufferLength;
            if (end > bufEnd)
                end = bufEnd;
        } else {
            this.eof = true;
            var end = this.bufferLength;
        }

        this.pos = end;
        return this.buffer.subarray(pos, end)
    };

    return constructor;
})();

var FlateStream = (function() {
    var codeLenCodeMap = new Uint32Array([
        16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15
    ]);

    var lengthDecode = new Uint32Array([
        0x00003, 0x00004, 0x00005, 0x00006, 0x00007, 0x00008, 0x00009,
        0x0000a, 0x1000b, 0x1000d, 0x1000f, 0x10011, 0x20013, 0x20017,
        0x2001b, 0x2001f, 0x30023, 0x3002b, 0x30033, 0x3003b, 0x40043,
        0x40053, 0x40063, 0x40073, 0x50083, 0x500a3, 0x500c3, 0x500e3,
        0x00102, 0x00102, 0x00102
    ]);

    var distDecode = new Uint32Array([
        0x00001, 0x00002, 0x00003, 0x00004, 0x10005, 0x10007, 0x20009,
        0x2000d, 0x30011, 0x30019, 0x40021, 0x40031, 0x50041, 0x50061,
        0x60081, 0x600c1, 0x70101, 0x70181, 0x80201, 0x80301, 0x90401,
        0x90601, 0xa0801, 0xa0c01, 0xb1001, 0xb1801, 0xc2001, 0xc3001,
        0xd4001, 0xd6001
    ]);

    var fixedLitCodeTab = [new Uint32Array([
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

    var fixedDistCodeTab = [new Uint32Array([
        0x50000, 0x50010, 0x50008, 0x50018, 0x50004, 0x50014, 0x5000c,
        0x5001c, 0x50002, 0x50012, 0x5000a, 0x5001a, 0x50006, 0x50016,
        0x5000e, 0x00000, 0x50001, 0x50011, 0x50009, 0x50019, 0x50005,
        0x50015, 0x5000d, 0x5001d, 0x50003, 0x50013, 0x5000b, 0x5001b,
        0x50007, 0x50017, 0x5000f, 0x00000
    ]), 5];

    function constructor(stream) {
        var bytes = stream.getBytes();
        var bytesPos = 0;

        this.dict = stream.dict;
        var cmf = bytes[bytesPos++];
        var flg = bytes[bytesPos++];
        if (cmf == -1 || flg == -1)
            error("Invalid header in flate stream");
        if ((cmf & 0x0f) != 0x08)
            error("Unknown compression method in flate stream");
        if ((((cmf << 8) + flg) % 31) != 0)
            error("Bad FCHECK in flate stream");
        if (flg & 0x20)
            error("FDICT bit set in flate stream");

        this.bytes = bytes;
        this.bytesPos = bytesPos;

        this.codeSize = 0;
        this.codeBuf = 0;
        
        DecodeStream.call(this);
    }

    constructor.prototype = Object.create(DecodeStream.prototype);

    constructor.prototype.getBits = function(bits) {
        var codeSize = this.codeSize;
        var codeBuf = this.codeBuf;
        var bytes = this.bytes;
        var bytesPos = this.bytesPos;

        var b;
        while (codeSize < bits) {
            if (typeof (b = bytes[bytesPos++]) == "undefined")
                error("Bad encoding in flate stream");
            codeBuf |= b << codeSize;
            codeSize += 8;
        }
        b = codeBuf & ((1 << bits) - 1);
        this.codeBuf = codeBuf >> bits;
        this.codeSize = codeSize -= bits;
        this.bytesPos = bytesPos;
        return b;
    };
    constructor.prototype.getCode = function(table) {
        var codes = table[0];
        var maxLen = table[1];
        var codeSize = this.codeSize;
        var codeBuf = this.codeBuf;
        var bytes = this.bytes;
        var bytesPos = this.bytesPos;

        while (codeSize < maxLen) {
            var b;
            if (typeof (b = bytes[bytesPos++]) == "undefined")
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
        this.bytesPos = bytesPos;
        return codeVal;
    };
    constructor.prototype.generateHuffmanTable = function(lengths) {
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
    };
    constructor.prototype.readBlock = function() {
        function repeat(stream, array, len, offset, what) {
            var repeat = stream.getBits(len) + offset;
            while (repeat-- > 0)
                array[i++] = what;
        }

        // read block header
        var hdr = this.getBits(3);
        if (hdr & 1)
            this.eof = true;
        hdr >>= 1;

        if (hdr == 0) { // uncompressed block
            var bytes = this.bytes;
            var bytesPos = this.bytesPos;
            var b;

            if (typeof (b = bytes[bytesPos++]) == "undefined")
                error("Bad block header in flate stream");
            var blockLen = b;
            if (typeof (b = bytes[bytesPos++]) == "undefined")
                error("Bad block header in flate stream");
            blockLen |= (b << 8);
            if (typeof (b = bytes[bytesPos++]) == "undefined")
                error("Bad block header in flate stream");
            var check = b;
            if (typeof (b = bytes[bytesPos++]) == "undefined")
                error("Bad block header in flate stream");
            check |= (b << 8);
            if (check != (~blockLen & 0xffff))
                error("Bad uncompressed block length in flate stream");

            this.codeBuf = 0;
            this.codeSize = 0;
            
            var bufferLength = this.bufferLength;
            var buffer = this.ensureBuffer(bufferLength + blockLen);
            var end = bufferLength + blockLen;
            this.bufferLength = end;
            for (var n = bufferLength; n < end; ++n) {
                if (typeof (b = bytes[bytesPos++]) == "undefined") {
                    this.eof = true;
                    break;
                }
                buffer[n] = b;
            }
            this.bytesPos = bytesPos;
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

            litCodeTable =
                this.generateHuffmanTable(codeLengths.slice(0, numLitCodes));
            distCodeTable =
                this.generateHuffmanTable(codeLengths.slice(numLitCodes, codes));
        } else {
            error("Unknown block type in flate stream");
        }

        var buffer = this.buffer;
        var limit = buffer ? buffer.length : 0;
        var pos = this.bufferLength;
        while (true) {
            var code1 = this.getCode(litCodeTable);
            if (code1 < 256) {
                if (pos + 1 >= limit) {
                    buffer = this.ensureBuffer(pos + 1);
                    limit = buffer.length;
                }
                buffer[pos++] = code1;
                continue;
            }
            if (code1 == 256) {
                this.bufferLength = pos;
                return;
            }
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
            if (pos + len >= limit) {
                buffer = this.ensureBuffer(pos + len);
                limit = buffer.length;
            }
            for (var k = 0; k < len; ++k, ++pos)
                buffer[pos] = buffer[pos - dist];
        }
    };

    return constructor;
})();

var PredictorStream = (function() {
    function constructor(stream, params) {
        var predictor = this.predictor = params.get("Predictor") || 1;

        if (predictor <= 1)
            return stream; // no prediction
        if (predictor !== 2 && (predictor < 10 || predictor > 15))
            error("Unsupported predictor");

        if (predictor === 2)
            this.readBlock = this.readBlockTiff;
        else
            this.readBlock = this.readBlockPng;

        this.stream = stream;
        this.dict = stream.dict;
        if (params.has("EarlyChange")) {
            error("EarlyChange predictor parameter is not supported");
        }
        var colors = this.colors = params.get("Colors") || 1;
        var bits = this.bits = params.get("BitsPerComponent") || 8;
        var columns = this.columns = params.get("Columns") || 1;

        var pixBytes = this.pixBytes = (colors * bits + 7) >> 3;
        // add an extra pixByte to represent the pixel left of column 0
        var rowBytes = this.rowBytes = (columns * colors * bits + 7) >> 3;

        DecodeStream.call(this);
        return this;
    }

    constructor.prototype = Object.create(DecodeStream.prototype);

    constructor.prototype.readBlockTiff = function() {
        var rowBytes = this.rowBytes;
        var pixBytes = this.pixBytes;

        var bufferLength = this.bufferLength;
        var buffer = this.ensureBuffer(bufferLength + rowBytes);
        var currentRow = buffer.subarray(bufferLength, bufferLength + rowBytes);

        var bits = this.bits;
        var colors = this.colors;

        var rawBytes = this.stream.getBytes(rowBytes);

        if (bits === 1) {
            var inbuf = 0;
            for (var i = 0; i < rowBytes; ++i) {
                var c = rawBytes[i];
                inBuf = (inBuf << 8) | c;
                // bitwise addition is exclusive or
                // first shift inBuf and then add
                currentRow[i] = (c ^ (inBuf >> colors)) & 0xFF;
                // truncate inBuf (assumes colors < 16)
                inBuf &= 0xFFFF;
            }
        } else if (bits === 8) {
            for (var i = 0; i < colors; ++i)
                currentRow[i] = rawBytes[i];
            for (; i < rowBytes; ++i)
                currentRow[i] = currentRow[i - colors] + rawBytes[i];
        } else {
            var compArray = new Uint8Array(colors + 1);
            var bitMask = (1 << bits) - 1;
            var inbuf = 0, outbut = 0;
            var inbits = 0, outbits = 0;
            var j = 0, k = 0;
            var columns = this.columns;
            for (var i = 0; i < columns; ++i) {
                for (var kk = 0; kk < colors; ++kk) {
                    if (inbits < bits) {
                        inbuf = (inbuf << 8) | (rawBytes[j++] & 0xFF);
                        inbits += 8;
                    }
                    compArray[kk] = (compArray[kk] +
                            (inbuf >> (inbits - bits))) & bitMask;
                    inbits -= bits;
                    outbuf = (outbuf << bits) | compArray[kk];
                    outbits += bits;
                    if (outbits >= 8) {
                        currentRow[k++] = (outbuf >> (outbits - 8)) & 0xFF;
                        outbits -= 8;
                    }
                }
            }
            if (outbits > 0) {
                currentRow[k++] = (outbuf << (8 - outbits)) +
                    (inbuf & ((1 << (8 - outbits)) - 1))
            }
        }
        this.bufferLength += rowBytes;
    };
    constructor.prototype.readBlockPng = function() {
        var rowBytes = this.rowBytes;
        var pixBytes = this.pixBytes;

        var predictor = this.stream.getByte();
        var rawBytes = this.stream.getBytes(rowBytes);

        var bufferLength = this.bufferLength;
        var buffer = this.ensureBuffer(bufferLength + rowBytes);

        var currentRow = buffer.subarray(bufferLength, bufferLength + rowBytes);
        var prevRow = buffer.subarray(bufferLength - rowBytes, bufferLength);
        if (prevRow.length == 0)
            prevRow = currentRow;

        switch (predictor) {
        case 0:
            break;
        case 1:
            for (var i = 0; i < pixBytes; ++i)
                currentRow[i] = rawBytes[i];
            for (; i < rowBytes; ++i)
                currentRow[i] = (currentRow[i - pixBytes] + rawBytes[i]) & 0xFF;
            break;
        case 2:
            for (var i = 0; i < rowBytes; ++i)
                currentRow[i] = (prevRow[i] + rawBytes[i]) & 0xFF;
            break;
        case 3:
            for (var i = 0; i < pixBytes; ++i)
                currentRow[i] = (prevRow[i] >> 1) + rawBytes[i];
            for (; i < rowBytes; ++i)
                currentRow[i] = (((prevRow[i] + currentRow[i - pixBytes])
                            >> 1) + rawBytes[i]) & 0xFF;
            break;
        case 4:
            // we need to save the up left pixels values. the simplest way
            // is to create a new buffer
            for (var i = 0; i < pixBytes; ++i)
                currentRow[i] = rawBytes[i];
            for (; i < rowBytes; ++i) {
                var up = prevRow[i];
                var upLeft = lastRow[i - pixBytes];
                var left = currentRow[i - pixBytes];
                var p = left + up - upLeft;

                var pa = p - left;
                if (pa < 0)
                    pa = -pa;
                var pb = p - up;
                if (pb < 0)
                    pb = -pb;
                var pc = p - upLeft;
                if (pc < 0)
                    pc = -pc;

                var c = rawBytes[i];
                if (pa <= pb && pa <= pc)
                    currentRow[i] = left + c;
                else if (pb <= pc)
                    currentRow[i] = up + c;
                else
                    currentRow[i] = upLeft + c;
                break;
            }
        default:
            error("Unsupported predictor");
            break;
        }
        this.bufferLength += rowBytes;
    };

    return constructor;
})();

// A JpegStream can't be read directly. We use the platform to render the underlying
// JPEG data for us.
var JpegStream = (function() {
    function constructor(bytes, dict) {
        // TODO: per poppler, some images may have "junk" before that need to be removed
        this.dict = dict;

        // create DOM image
        var img = new Image();
        img.src = "data:image/jpeg;base64," + window.btoa(bytesToString(bytes));
        this.domImage = img;
    }

    constructor.prototype = {
        getImage: function() {
            return this.domImage;
        },
        getChar: function() {
            error("internal error: getChar is not valid on JpegStream");
        }
    };

    return constructor;
})();
var DecryptStream = (function() {
    function constructor(str, decrypt) {
        this.str = str;
        this.dict = str.dict;
        this.decrypt = decrypt;

        DecodeStream.call(this);
    }

    var chunkSize = 512;

    constructor.prototype = Object.create(DecodeStream.prototype);
    constructor.prototype.readBlock = function() {
      var chunk = this.str.getBytes(chunkSize);
      if (!chunk || chunk.length == 0) {
        this.eof = true;
        return;
      }
      var decrypt = this.decrypt;
      chunk = decrypt(chunk);

      var bufferLength = this.bufferLength;
      var i, n = chunk.length;
      var buffer = this.ensureBuffer(bufferLength + n);
      for (i = 0; i < n; i++)
        buffer[bufferLength++] = chunk[i];
      this.bufferLength = bufferLength;
      this.eof = n < chunkSize;
    };

    return constructor;
})();

var Ascii85Stream = (function() {
    function constructor(str) {
        this.str = str;
        this.dict = str.dict;
        this.input = new Uint8Array(5);
        
        DecodeStream.call(this);
    }

    constructor.prototype = Object.create(DecodeStream.prototype);
    constructor.prototype.readBlock = function() {
        var tildaCode = "~".charCodeAt(0);
        var zCode = "z".charCodeAt(0);
        var str = this.str;

        var c = str.getByte();
        while (Lexer.isSpace(String.fromCharCode(c)))
            c = str.getByte();

        if (!c || c === tildaCode) {
            this.eof = true;
            return;
        } 

        var bufferLength = this.bufferLength;

        // special code for z
        if (c == zCode) {
            var buffer = this.ensureBuffer(bufferLength + 4);
            for (var i = 0; i < 4; ++i)
                buffer[bufferLength + i] = 0;
            this.bufferLength += 4;
        } else {
            var input = this.input;
            input[0] = c;
            for (var i = 1; i < 5; ++i){
                c = str.getByte();
                while (Lexer.isSpace(String.fromCharCode(c)))
                    c = str.getByte();

                input[i] = c;

                if (!c || c == tildaCode)
                    break;
            }
            var buffer = this.ensureBuffer(bufferLength + i - 1);
            this.bufferLength += i - 1;

            // partial ending;
            if (i < 5) {
                for (; i < 5; ++i)
                    input[i] = 0x21 + 84;
                this.eof = true;
            }
            var t = 0;
            for (var i = 0; i < 5; ++i)
                t = t * 85 + (input[i] - 0x21);

            for (var i = 3; i >= 0; --i){
                buffer[bufferLength + i] = t & 0xFF;
                t >>= 8;
            }
        }
    };

    return constructor;
})();

var CCITTFaxStream = (function() {

    var ccittEOL = -2;
    var twoDimPass = 0;
    var twoDimHoriz = 1;
    var twoDimVert0 = 2;
    var twoDimVertR1 = 3;
    var twoDimVertL1 = 4;
    var twoDimVertR2 = 5;
    var twoDimVertL2 = 6;
    var twoDimVertR3 = 7;
    var twoDimVertL3 = 8;

    var twoDimTable = [
    [-1, -1], [-1, -1],               // 000000x
    [7, twoDimVertL3],                // 0000010
    [7, twoDimVertR3],                // 0000011
    [6, twoDimVertL2], [6, twoDimVertL2], // 000010x
    [6, twoDimVertR2], [6, twoDimVertR2], // 000011x
    [4, twoDimPass], [4, twoDimPass],     // 0001xxx
    [4, twoDimPass], [4, twoDimPass],
    [4, twoDimPass], [4, twoDimPass],
    [4, twoDimPass], [4, twoDimPass],
    [3, twoDimHoriz], [3, twoDimHoriz],   // 001xxxx
    [3, twoDimHoriz], [3, twoDimHoriz],
    [3, twoDimHoriz], [3, twoDimHoriz],
    [3, twoDimHoriz], [3, twoDimHoriz],
    [3, twoDimHoriz], [3, twoDimHoriz],
    [3, twoDimHoriz], [3, twoDimHoriz],
    [3, twoDimHoriz], [3, twoDimHoriz],
    [3, twoDimHoriz], [3, twoDimHoriz],
    [3, twoDimVertL1], [3, twoDimVertL1], // 010xxxx
    [3, twoDimVertL1], [3, twoDimVertL1],
    [3, twoDimVertL1], [3, twoDimVertL1],
    [3, twoDimVertL1], [3, twoDimVertL1],
    [3, twoDimVertL1], [3, twoDimVertL1],
    [3, twoDimVertL1], [3, twoDimVertL1],
    [3, twoDimVertL1], [3, twoDimVertL1],
    [3, twoDimVertL1], [3, twoDimVertL1],
    [3, twoDimVertR1], [3, twoDimVertR1], // 011xxxx
    [3, twoDimVertR1], [3, twoDimVertR1],
    [3, twoDimVertR1], [3, twoDimVertR1],
    [3, twoDimVertR1], [3, twoDimVertR1],
    [3, twoDimVertR1], [3, twoDimVertR1],
    [3, twoDimVertR1], [3, twoDimVertR1],
    [3, twoDimVertR1], [3, twoDimVertR1],
    [3, twoDimVertR1], [3, twoDimVertR1],
    [1, twoDimVert0], [1, twoDimVert0],   // 1xxxxxx
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0],
    [1, twoDimVert0], [1, twoDimVert0]
    ];

    var whiteTable1 = [
        [-1, -1],                 // 00000
        [12, ccittEOL],               // 00001
        [-1, -1], [-1, -1],               // 0001x
        [-1, -1], [-1, -1], [-1, -1], [-1, -1],   // 001xx
        [-1, -1], [-1, -1], [-1, -1], [-1, -1],   // 010xx
        [-1, -1], [-1, -1], [-1, -1], [-1, -1],   // 011xx
        [11, 1792], [11, 1792],           // 1000x
        [12, 1984],                   // 10010
        [12, 2048],                   // 10011
        [12, 2112],                   // 10100
        [12, 2176],                   // 10101
        [12, 2240],                   // 10110
        [12, 2304],                   // 10111
        [11, 1856], [11, 1856],           // 1100x
        [11, 1920], [11, 1920],           // 1101x
        [12, 2368],                   // 11100
        [12, 2432],                   // 11101
        [12, 2496],                   // 11110
        [12, 2560]                    // 11111
    ];

    var whiteTable2 = [
        [-1, -1], [-1, -1], [-1, -1], [-1, -1],   // 0000000xx
        [8, 29], [8, 29],             // 00000010x
        [8, 30], [8, 30],             // 00000011x
        [8, 45], [8, 45],             // 00000100x
        [8, 46], [8, 46],             // 00000101x
        [7, 22], [7, 22], [7, 22], [7, 22],       // 0000011xx
        [7, 23], [7, 23], [7, 23], [7, 23],       // 0000100xx
        [8, 47], [8, 47],             // 00001010x
        [8, 48], [8, 48],             // 00001011x
        [6, 13], [6, 13], [6, 13], [6, 13],       // 000011xxx
        [6, 13], [6, 13], [6, 13], [6, 13],
        [7, 20], [7, 20], [7, 20], [7, 20],       // 0001000xx
        [8, 33], [8, 33],             // 00010010x
        [8, 34], [8, 34],             // 00010011x
        [8, 35], [8, 35],             // 00010100x
        [8, 36], [8, 36],             // 00010101x
        [8, 37], [8, 37],             // 00010110x
        [8, 38], [8, 38],             // 00010111x
        [7, 19], [7, 19], [7, 19], [7, 19],       // 0001100xx
        [8, 31], [8, 31],             // 00011010x
        [8, 32], [8, 32],             // 00011011x
        [6, 1], [6, 1], [6, 1], [6, 1],       // 000111xxx
        [6, 1], [6, 1], [6, 1], [6, 1],
        [6, 12], [6, 12], [6, 12], [6, 12],       // 001000xxx
        [6, 12], [6, 12], [6, 12], [6, 12],
        [8, 53], [8, 53],             // 00100100x
        [8, 54], [8, 54],             // 00100101x
        [7, 26], [7, 26], [7, 26], [7, 26],       // 0010011xx
        [8, 39], [8, 39],             // 00101000x
        [8, 40], [8, 40],             // 00101001x
        [8, 41], [8, 41],             // 00101010x
        [8, 42], [8, 42],             // 00101011x
        [8, 43], [8, 43],             // 00101100x
        [8, 44], [8, 44],             // 00101101x
        [7, 21], [7, 21], [7, 21], [7, 21],       // 0010111xx
        [7, 28], [7, 28], [7, 28], [7, 28],       // 0011000xx
        [8, 61], [8, 61],             // 00110010x
        [8, 62], [8, 62],             // 00110011x
        [8, 63], [8, 63],             // 00110100x
        [8, 0], [8, 0],               // 00110101x
        [8, 320], [8, 320],               // 00110110x
        [8, 384], [8, 384],               // 00110111x
        [5, 10], [5, 10], [5, 10], [5, 10],       // 00111xxxx
        [5, 10], [5, 10], [5, 10], [5, 10],
        [5, 10], [5, 10], [5, 10], [5, 10],
        [5, 10], [5, 10], [5, 10], [5, 10],
        [5, 11], [5, 11], [5, 11], [5, 11],       // 01000xxxx
        [5, 11], [5, 11], [5, 11], [5, 11],
        [5, 11], [5, 11], [5, 11], [5, 11],
        [5, 11], [5, 11], [5, 11], [5, 11],
        [7, 27], [7, 27], [7, 27], [7, 27],       // 0100100xx
        [8, 59], [8, 59],             // 01001010x
        [8, 60], [8, 60],             // 01001011x
        [9, 1472],                    // 010011000
        [9, 1536],                    // 010011001
        [9, 1600],                    // 010011010
        [9, 1728],                    // 010011011
        [7, 18], [7, 18], [7, 18], [7, 18],       // 0100111xx
        [7, 24], [7, 24], [7, 24], [7, 24],       // 0101000xx
        [8, 49], [8, 49],             // 01010010x
        [8, 50], [8, 50],             // 01010011x
        [8, 51], [8, 51],             // 01010100x
        [8, 52], [8, 52],             // 01010101x
        [7, 25], [7, 25], [7, 25], [7, 25],       // 0101011xx
        [8, 55], [8, 55],             // 01011000x
        [8, 56], [8, 56],             // 01011001x
        [8, 57], [8, 57],             // 01011010x
        [8, 58], [8, 58],             // 01011011x
        [6, 192], [6, 192], [6, 192], [6, 192],   // 010111xxx
        [6, 192], [6, 192], [6, 192], [6, 192],
        [6, 1664], [6, 1664], [6, 1664], [6, 1664],   // 011000xxx
        [6, 1664], [6, 1664], [6, 1664], [6, 1664],
        [8, 448], [8, 448],               // 01100100x
        [8, 512], [8, 512],               // 01100101x
        [9, 704],                 // 011001100
        [9, 768],                 // 011001101
        [8, 640], [8, 640],               // 01100111x
        [8, 576], [8, 576],               // 01101000x
        [9, 832],                 // 011010010
        [9, 896],                 // 011010011
        [9, 960],                 // 011010100
        [9, 1024],                    // 011010101
        [9, 1088],                    // 011010110
        [9, 1152],                    // 011010111
        [9, 1216],                    // 011011000
        [9, 1280],                    // 011011001
        [9, 1344],                    // 011011010
        [9, 1408],                    // 011011011
        [7, 256], [7, 256], [7, 256], [7, 256],   // 0110111xx
        [4, 2], [4, 2], [4, 2], [4, 2],       // 0111xxxxx
        [4, 2], [4, 2], [4, 2], [4, 2],
        [4, 2], [4, 2], [4, 2], [4, 2],
        [4, 2], [4, 2], [4, 2], [4, 2],
        [4, 2], [4, 2], [4, 2], [4, 2],
        [4, 2], [4, 2], [4, 2], [4, 2],
        [4, 2], [4, 2], [4, 2], [4, 2],
        [4, 2], [4, 2], [4, 2], [4, 2],
        [4, 3], [4, 3], [4, 3], [4, 3],       // 1000xxxxx
        [4, 3], [4, 3], [4, 3], [4, 3],
        [4, 3], [4, 3], [4, 3], [4, 3],
        [4, 3], [4, 3], [4, 3], [4, 3],
        [4, 3], [4, 3], [4, 3], [4, 3],
        [4, 3], [4, 3], [4, 3], [4, 3],
        [4, 3], [4, 3], [4, 3], [4, 3],
        [4, 3], [4, 3], [4, 3], [4, 3],
        [5, 128], [5, 128], [5, 128], [5, 128],   // 10010xxxx
        [5, 128], [5, 128], [5, 128], [5, 128],
        [5, 128], [5, 128], [5, 128], [5, 128],
        [5, 128], [5, 128], [5, 128], [5, 128],
        [5, 8], [5, 8], [5, 8], [5, 8],       // 10011xxxx
        [5, 8], [5, 8], [5, 8], [5, 8],
        [5, 8], [5, 8], [5, 8], [5, 8],
        [5, 8], [5, 8], [5, 8], [5, 8],
        [5, 9], [5, 9], [5, 9], [5, 9],       // 10100xxxx
        [5, 9], [5, 9], [5, 9], [5, 9],
        [5, 9], [5, 9], [5, 9], [5, 9],
        [5, 9], [5, 9], [5, 9], [5, 9],
        [6, 16], [6, 16], [6, 16], [6, 16],       // 101010xxx
        [6, 16], [6, 16], [6, 16], [6, 16],
        [6, 17], [6, 17], [6, 17], [6, 17],       // 101011xxx
        [6, 17], [6, 17], [6, 17], [6, 17],
        [4, 4], [4, 4], [4, 4], [4, 4],       // 1011xxxxx
        [4, 4], [4, 4], [4, 4], [4, 4],
        [4, 4], [4, 4], [4, 4], [4, 4],
        [4, 4], [4, 4], [4, 4], [4, 4],
        [4, 4], [4, 4], [4, 4], [4, 4],
        [4, 4], [4, 4], [4, 4], [4, 4],
        [4, 4], [4, 4], [4, 4], [4, 4],
        [4, 4], [4, 4], [4, 4], [4, 4],
        [4, 5], [4, 5], [4, 5], [4, 5],       // 1100xxxxx
        [4, 5], [4, 5], [4, 5], [4, 5],
        [4, 5], [4, 5], [4, 5], [4, 5],
        [4, 5], [4, 5], [4, 5], [4, 5],
        [4, 5], [4, 5], [4, 5], [4, 5],
        [4, 5], [4, 5], [4, 5], [4, 5],
        [4, 5], [4, 5], [4, 5], [4, 5],
        [4, 5], [4, 5], [4, 5], [4, 5],
        [6, 14], [6, 14], [6, 14], [6, 14],       // 110100xxx
        [6, 14], [6, 14], [6, 14], [6, 14],
        [6, 15], [6, 15], [6, 15], [6, 15],       // 110101xxx
        [6, 15], [6, 15], [6, 15], [6, 15],
        [5, 64], [5, 64], [5, 64], [5, 64],       // 11011xxxx
        [5, 64], [5, 64], [5, 64], [5, 64],
        [5, 64], [5, 64], [5, 64], [5, 64],
        [5, 64], [5, 64], [5, 64], [5, 64],
        [4, 6], [4, 6], [4, 6], [4, 6],       // 1110xxxxx
        [4, 6], [4, 6], [4, 6], [4, 6],
        [4, 6], [4, 6], [4, 6], [4, 6],
        [4, 6], [4, 6], [4, 6], [4, 6],
        [4, 6], [4, 6], [4, 6], [4, 6],
        [4, 6], [4, 6], [4, 6], [4, 6],
        [4, 6], [4, 6], [4, 6], [4, 6],
        [4, 6], [4, 6], [4, 6], [4, 6],
        [4, 7], [4, 7], [4, 7], [4, 7],       // 1111xxxxx
        [4, 7], [4, 7], [4, 7], [4, 7],
        [4, 7], [4, 7], [4, 7], [4, 7],
        [4, 7], [4, 7], [4, 7], [4, 7],
        [4, 7], [4, 7], [4, 7], [4, 7],
        [4, 7], [4, 7], [4, 7], [4, 7],
        [4, 7], [4, 7], [4, 7], [4, 7],
        [4, 7], [4, 7], [4, 7], [4, 7]
    ];
    
    var blackTable1 = [
        [-1, -1], [-1, -1],                   // 000000000000x
        [12, ccittEOL], [12, ccittEOL],           // 000000000001x
        [-1, -1], [-1, -1], [-1, -1], [-1, -1],       // 00000000001xx
        [-1, -1], [-1, -1], [-1, -1], [-1, -1],       // 00000000010xx
        [-1, -1], [-1, -1], [-1, -1], [-1, -1],       // 00000000011xx
        [-1, -1], [-1, -1], [-1, -1], [-1, -1],       // 00000000100xx
        [-1, -1], [-1, -1], [-1, -1], [-1, -1],       // 00000000101xx
        [-1, -1], [-1, -1], [-1, -1], [-1, -1],       // 00000000110xx
        [-1, -1], [-1, -1], [-1, -1], [-1, -1],       // 00000000111xx
        [11, 1792], [11, 1792], [11, 1792], [11, 1792],   // 00000001000xx
        [12, 1984], [12, 1984],               // 000000010010x
        [12, 2048], [12, 2048],               // 000000010011x
        [12, 2112], [12, 2112],               // 000000010100x
        [12, 2176], [12, 2176],               // 000000010101x
        [12, 2240], [12, 2240],               // 000000010110x
        [12, 2304], [12, 2304],               // 000000010111x
        [11, 1856], [11, 1856], [11, 1856], [11, 1856],   // 00000001100xx
        [11, 1920], [11, 1920], [11, 1920], [11, 1920],   // 00000001101xx
        [12, 2368], [12, 2368],               // 000000011100x
        [12, 2432], [12, 2432],               // 000000011101x
        [12, 2496], [12, 2496],               // 000000011110x
        [12, 2560], [12, 2560],               // 000000011111x
        [10, 18], [10, 18], [10, 18], [10, 18],       // 0000001000xxx
        [10, 18], [10, 18], [10, 18], [10, 18],
        [12, 52], [12, 52],                   // 000000100100x
        [13, 640],                        // 0000001001010
        [13, 704],                        // 0000001001011
        [13, 768],                        // 0000001001100
        [13, 832],                        // 0000001001101
        [12, 55], [12, 55],                   // 000000100111x
        [12, 56], [12, 56],                   // 000000101000x
        [13, 1280],                       // 0000001010010
        [13, 1344],                       // 0000001010011
        [13, 1408],                       // 0000001010100
        [13, 1472],                       // 0000001010101
        [12, 59], [12, 59],                   // 000000101011x
        [12, 60], [12, 60],                   // 000000101100x
        [13, 1536],                       // 0000001011010
        [13, 1600],                       // 0000001011011
        [11, 24], [11, 24], [11, 24], [11, 24],       // 00000010111xx
        [11, 25], [11, 25], [11, 25], [11, 25],       // 00000011000xx
        [13, 1664],                       // 0000001100100
        [13, 1728],                       // 0000001100101
        [12, 320], [12, 320],                 // 000000110011x
        [12, 384], [12, 384],                 // 000000110100x
        [12, 448], [12, 448],                 // 000000110101x
        [13, 512],                        // 0000001101100
        [13, 576],                        // 0000001101101
        [12, 53], [12, 53],                   // 000000110111x
        [12, 54], [12, 54],                   // 000000111000x
        [13, 896],                        // 0000001110010
        [13, 960],                        // 0000001110011
        [13, 1024],                       // 0000001110100
        [13, 1088],                       // 0000001110101
        [13, 1152],                       // 0000001110110
        [13, 1216],                       // 0000001110111
        [10, 64], [10, 64], [10, 64], [10, 64],       // 0000001111xxx
        [10, 64], [10, 64], [10, 64], [10, 64]
    ];

    var blackTable2 = [
        [8, 13], [8, 13], [8, 13], [8, 13],           // 00000100xxxx
        [8, 13], [8, 13], [8, 13], [8, 13],
        [8, 13], [8, 13], [8, 13], [8, 13],
        [8, 13], [8, 13], [8, 13], [8, 13],
        [11, 23], [11, 23],                   // 00000101000x
        [12, 50],                     // 000001010010
        [12, 51],                     // 000001010011
        [12, 44],                     // 000001010100
        [12, 45],                     // 000001010101
        [12, 46],                     // 000001010110
        [12, 47],                     // 000001010111
        [12, 57],                     // 000001011000
        [12, 58],                     // 000001011001
        [12, 61],                     // 000001011010
        [12, 256],                        // 000001011011
        [10, 16], [10, 16], [10, 16], [10, 16],       // 0000010111xx
        [10, 17], [10, 17], [10, 17], [10, 17],       // 0000011000xx
        [12, 48],                     // 000001100100
        [12, 49],                     // 000001100101
        [12, 62],                     // 000001100110
        [12, 63],                     // 000001100111
        [12, 30],                     // 000001101000
        [12, 31],                     // 000001101001
        [12, 32],                     // 000001101010
        [12, 33],                     // 000001101011
        [12, 40],                     // 000001101100
        [12, 41],                     // 000001101101
        [11, 22], [11, 22],                   // 00000110111x
        [8, 14], [8, 14], [8, 14], [8, 14],           // 00000111xxxx
        [8, 14], [8, 14], [8, 14], [8, 14],
        [8, 14], [8, 14], [8, 14], [8, 14],
        [8, 14], [8, 14], [8, 14], [8, 14],
        [7, 10], [7, 10], [7, 10], [7, 10],           // 0000100xxxxx
        [7, 10], [7, 10], [7, 10], [7, 10],
        [7, 10], [7, 10], [7, 10], [7, 10],
        [7, 10], [7, 10], [7, 10], [7, 10],
        [7, 10], [7, 10], [7, 10], [7, 10],
        [7, 10], [7, 10], [7, 10], [7, 10],
        [7, 10], [7, 10], [7, 10], [7, 10],
        [7, 10], [7, 10], [7, 10], [7, 10],
        [7, 11], [7, 11], [7, 11], [7, 11],           // 0000101xxxxx
        [7, 11], [7, 11], [7, 11], [7, 11],
        [7, 11], [7, 11], [7, 11], [7, 11],
        [7, 11], [7, 11], [7, 11], [7, 11],
        [7, 11], [7, 11], [7, 11], [7, 11],
        [7, 11], [7, 11], [7, 11], [7, 11],
        [7, 11], [7, 11], [7, 11], [7, 11],
        [7, 11], [7, 11], [7, 11], [7, 11],
        [9, 15], [9, 15], [9, 15], [9, 15],           // 000011000xxx
        [9, 15], [9, 15], [9, 15], [9, 15],
        [12, 128],                        // 000011001000
        [12, 192],                        // 000011001001
        [12, 26],                     // 000011001010
        [12, 27],                     // 000011001011
        [12, 28],                     // 000011001100
        [12, 29],                     // 000011001101
        [11, 19], [11, 19],                   // 00001100111x
        [11, 20], [11, 20],                   // 00001101000x
        [12, 34],                     // 000011010010
        [12, 35],                     // 000011010011
        [12, 36],                     // 000011010100
        [12, 37],                     // 000011010101
        [12, 38],                     // 000011010110
        [12, 39],                     // 000011010111
        [11, 21], [11, 21],                   // 00001101100x
        [12, 42],                     // 000011011010
        [12, 43],                     // 000011011011
        [10, 0], [10, 0], [10, 0], [10, 0],           // 0000110111xx
        [7, 12], [7, 12], [7, 12], [7, 12],           // 0000111xxxxx
        [7, 12], [7, 12], [7, 12], [7, 12],
        [7, 12], [7, 12], [7, 12], [7, 12],
        [7, 12], [7, 12], [7, 12], [7, 12],
        [7, 12], [7, 12], [7, 12], [7, 12],
        [7, 12], [7, 12], [7, 12], [7, 12],
        [7, 12], [7, 12], [7, 12], [7, 12],
        [7, 12], [7, 12], [7, 12], [7, 12]    
    ];

    var blackTable3 = [
        [-1, -1], [-1, -1], [-1, -1], [-1, -1],       // 0000xx
        [6, 9],                       // 000100
        [6, 8],                       // 000101
        [5, 7], [5, 7],                   // 00011x
        [4, 6], [4, 6], [4, 6], [4, 6],           // 0010xx
        [4, 5], [4, 5], [4, 5], [4, 5],           // 0011xx
        [3, 1], [3, 1], [3, 1], [3, 1],           // 010xxx
        [3, 1], [3, 1], [3, 1], [3, 1],
        [3, 4], [3, 4], [3, 4], [3, 4],           // 011xxx
        [3, 4], [3, 4], [3, 4], [3, 4],
        [2, 3], [2, 3], [2, 3], [2, 3],           // 10xxxx
        [2, 3], [2, 3], [2, 3], [2, 3],
        [2, 3], [2, 3], [2, 3], [2, 3],
        [2, 3], [2, 3], [2, 3], [2, 3],
        [2, 2], [2, 2], [2, 2], [2, 2],           // 11xxxx
        [2, 2], [2, 2], [2, 2], [2, 2],
        [2, 2], [2, 2], [2, 2], [2, 2],
        [2, 2], [2, 2], [2, 2], [2, 2]
    ];

    function constructor(str, params) {
        this.str = str;
        this.dict = str.dict;

        params = params || new Dict();

        this.encoding = params.get("K") || 0;
        this.eoline = params.get("EndOfLine") || false;
        this.byteAlign = params.get("EncodedByteAlign") || false;
        this.columns = params.get("Columns") || 1728;
        this.rows = params.get("Rows") || 0;
        var eoblock = params.get("EndOfBlock");
        if (eoblock == null)
            eoblock = true;
        this.eoblock = eoblock;
        this.black = params.get("BlackIs1") || false;

        this.codingLine = new Uint32Array(this.columns + 1);
        this.refLine = new Uint32Array(this.columns + 2);
        
        this.codingLine[0] = this.columns;
        this.codingPos = 0;

        this.row = 0;
        this.nextLine2D = this.encoding < 0;
        this.inputBits = 0;
        this.inputBuf;
        this.outputBits = 0;
        this.buf = EOF;

        var code1;
        while ((code1 = this.lookBits(12)) == 0) {
            this.eatBits(1);
        }
        if (code1 == 1) {
            this.eatBits(12);
        }
        if (this.encoding > 0) {
            this.nextLine2D = !this.lookBits(1);
            this.eatBits(1);
        }
        
        DecodeStream.call(this);
    }

    constructor.prototype = Object.create(DecodeStream.prototype);
    constructor.prototype.readBlock = function() {
        while (!this.eof) {
            var c = this.lookChar();
            this.buf = EOF;
            this.ensureBuffer(this.bufferLength + 1);
            this.buffer[this.bufferLength++] = c;
        }
    };
    constructor.prototype.addPixels = function(a1, blackPixels) {
        var codingLine = this.codingLine;
        var codingPos = this.codingPos;

        if (a1 > codingLine[codingPos]) {
            if (a1 > this.columns) {
                warn("row is wrong length");
                this.err = true;
                a1 = this.columns;
            }
            if ((codingPos & 1) ^ blackPixels) {
                ++codingPos;
            }

            codingLine[codingPos] = a1;
        }
        this.codingPos = codingPos;
    };
    constructor.prototype.addPixelsNeg = function(a1, blackPixels) {
        var codingLine = this.codingLine;
        var codingPos = this.codingPos;

        if (a1 > codingLine[codingPos]) {
            if (a1 > this.columns) {
                warn("row is wrong length");
                this.err = true;
                a1 = this.columns;
            }
            if ((codingPos & 1) ^ blackPixels)
                ++codingPos;

            codingLine[codingPos] = a1;
        } else if (a1 < codingLine[codingPos]) {
            if (a1 < 0) {
                warn("invalid code");
                this.err = true;
                a1 = 0;
            }
            while (codingPos > 0 && a1 < codingLine[codingPos - 1])
                --codingPos;
            codingLine[codingPos] = a1;
        }

        this.codingPos = codingPos;
    };
    constructor.prototype.lookChar = function() {
        var refLine = this.refLine;
        var codingLine = this.codingLine;
        var columns = this.columns;

        var refPos, blackPixels, bits;

        if (this.buf != EOF)
            return buf;

        if (this.outputBits == 0) {
            if (this.eof)
                return;

            this.err = false;

            if (this.nextLine2D) {
                for (var i = 0; codingLine[i] < columns; ++i)
                    refLine[i] = codingLine[i];

                refLine[i++] = columns;
                refLine[i] = columns;
                codingLine[0] = 0;
                this.codingPos = 0;
                refPos = 0;
                blackPixels = 0;

                while (codingLine[this.codingPos] < columns) {
                    var code1 = this.getTwoDimCode();
                    switch (code1) {
                    case twoDimPass:
                        this.addPixels(refLine[refPos + 1], blackPixels);
                        if (refLine[refPos + 1] < columns)
                            refPos += 2;
                        break;
                    case twoDimHoriz:
                        var code1 = 0, code2 = 0;
                        if (blackPixels) {
                            var code3;
                            do {
                                code1 += (code3 = this.getBlackCode());
                            } while (code3 >= 64);
                            do {
                                code2 += (code3 = this.getWhiteCode());
                            } while (code3 >= 64);
                        } else {
                            var code3;
                            do {
                                code1 += (code3 = this.getWhiteCode());
                            } while (code3 >= 64);
                            do {
                                code2 += (code3 = this.getBlackCode());
                            } while (code3 >= 64);
                        }
                        this.addPixels(codingLine[this.codingPos] + code1, blackPixels);
                        if (codingLine[this.codingPos] < columns) {
                            this.addPixels(codingLine[this.codingPos] + code2,
                                    blackPixels ^ 1);
                        }
                        while (refLine[refPos] <= codingLine[this.codingPos] 
                                && refLine[refPos] < columns) {
                            refPos += 2;
                        }    
                        break;
                    case twoDimVertR3:
                        this.addPixels(refLine[refPos] + 3, blackPixels);
                        blackPixels ^= 1;
                        if (codingLine[this.codingPos] < columns) {
                            ++refPos;
                            while (refLine[refPos] <= codingLine[this.codingPos] &&
                                    refLine[refPos] < columns)
                                refPos += 2;
                        }
                        break;
                    case twoDimVertR2:
                        this.addPixels(refLine[refPos] + 2, blackPixels);
                        blackPixels ^= 1;
                        if (codingLine[this.codingPos] < columns) {
                            ++refPos;
                            while (refLine[refPos] <= codingLine[this.codingPos] &&
                                    refLine[refPos] < columns) {
                                refPos += 2;
                            }
                        }
                        break;
                    case twoDimVertR1:
                        this.addPixels(refLine[refPos] + 1, blackPixels);
                        blackPixels ^= 1;
                        if (codingLine[this.codingPos] < columns) {
                            ++refPos;
                            while (refLine[refPos] <= codingLine[this.codingPos] &&
                                    refLine[refPos] < columns)
                                refPos += 2;
                        }
                        break;
                    case twoDimVert0:
                        this.addPixels(refLine[refPos], blackPixels);
                        blackPixels ^= 1;
                        if (codingLine[this.codingPos] < columns) {
                            ++refPos;
                            while (refLine[refPos] <= codingLine[this.codingPos] &&
                                    refLine[refPos] < columns)
                                refPos += 2;
                        }
                        break;
                    case twoDimVertL3:
                        this.addPixelsNeg(refLine[refPos] - 3, blackPixels);
                        blackPixels ^= 1;
                        if (codingLine[this.codingPos] < columns) {
                            if (refPos > 0)
                                --refPos;
                            else
                                ++refPos;
                            while (refLine[refPos] <= codingLine[this.codingPos] &&
                                    refLine[refPos] < columns)
                                refPos += 2;
                        }
                        break;
                    case twoDimVertL2:
                        this.addPixelsNeg(refLine[refPos] - 2, blackPixels);
                        blackPixels ^= 1;
                        if (codingLine[this.codingPos] < columns) {
                            if (refPos > 0)
                                --refPos;
                            else
                                ++refPos;
                            while (refLine[refPos] <= codingLine[this.codingPos] &&
                                    refLine[refPos] < columns)
                                refPos += 2;
                        }
                        break;
                    case twoDimVertL1:
                        this.addPixelsNeg(refLine[refPos] - 1, blackPixels);
                        blackPixels ^= 1;
                        if (codingLine[this.codingPos] < columns) {
                            if (refPos > 0)
                                --refPos;
                            else
                                ++refPos;
                            
                            while (refLine[refPos] <= codingLine[this.codingPos] &&
                                    refLine[refPos] < columns)
                                refPos += 2;
                        }
                        break;
                    case EOF:
                        this.addPixels(columns, 0);
                        this.eof = true;
                        break;
                    default:
                        warn("bad 2d code");
                        this.addPixels(columns, 0);
                        this.err = true;
                        break;
                    }
                }
            } else {
                codingLine[0] = 0;
                this.codingPos = 0;
                blackPixels = 0;
                while(codingLine[this.codingPos] < columns) {
                    code1 = 0;
                    if (blackPixels) {
                        do {
                            code1 += (code3 = this.getBlackCode());
                        } while (code3 >= 64);
                    } else {
                        do {
                            code1 += (code3 = this.getWhiteCode());
                        } while (code3 >= 64);
                    }
                    this.addPixels(codingLine[this.codingPos] + code1, blackPixels);
                    blackPixels ^= 1;
                }
            }

            if (this.byteAlign)
                inputBits &= ~7;
                    
            var gotEOL = false;

            if (!this.eoblock && this.row == this.rows - 1) {
                this.eof = true;
            } else {
                code1 = this.lookBits(12);
                while (code1 == 0) {
                    this.eatBits(1);
                    code1 = this.lookBits(12);
                }
                if (code1 == 1) {
                    this.eatBits(12);
                    gotEOL = true;
                } else if (code1 == EOF) {
                    this.eof = true;
                }
            }

            if (!this.eof && this.encoding > 0) {
                this.nextLine2D = !this.lookBits(1);
                this.eatBits(1);
            }

            if (this.eoblock && gotEOL) {
                code1 = this.lookBits(12);
                if (code1 == 1) {
                    this.eatBits(12);
                    if (this.encoding > 0) {
                        this.lookBits(1);
                        this.eatBits(1);
                    }
                    if (this.encoding >= 0) {
                        for (var i = 0; i < 4; ++i) {
                            code1 = this.lookBits(12);
                            if (code1 != 1)
                                warning("bad rtc code");
                            this.eatBits(12);
                            if (this.encoding > 0) {
                                this.lookBits(1);
                                this.eatBits(1);
                            }
                        }
                    }
                    this.eof = true;
                }
            } else if (this.err && this.eoline) {
                var code1;
                while (true) {
                    code1 = this.lookBits(13);
                    if (code1 == EOF) {
                        this.eof = true;
                        return;
                    }
                    if ((code1 >> 1) == 1) {
                        break;
                    }
                    this.eatBits(1);
                }
                this.eatBits(12);
                if (this.encoding > 0) {
                    this.eatBits(1);
                    this.nextLine2D = !(code1 & 1);
                }
            }

            if (codingLine[0] > 0)
                this.outputBits = codingLine[this.codingPos = 0];
            else
                this.outputBits = codingLine[this.codingPos = 1];
            this.row++;
        }

        if (this.outputBits >= 8) {
            this.buf = (this.codingPos & 1) ? 0 : 0xFF;
            this.outputBits -= 8;
            if (this.outputBits == 0 && codingLine[this.codingPos] < columns) {
                this.codingPos++;
                this.outputBits = codingLine[this.codingPos] - codingLine[this.codingPos - 1];
            }
        } else {
            var bits = 8;
            this.buf = 0;
            do {
                if (this.outputBits > bits) {
                    this.buf <<= bits;
                    if (!(this.codingPos & 1)) {
                        this.buf |= 0xFF >> (8 - bits);
                    }
                    this.outputBits -= bits;
                    bits = 0;
                } else {
                    this.buf <<= this.outputBits;
                    if (!(this.codingPos & 1)) {
                        this.buf |= 0xFF >> (8 - this.outputBits);
                    }
                    bits -= this.outputBits;
                    this.outputBits = 0;
                    if (codingLine[this.codingPos] < columns) {
                        this.codingPos++;
                        this.outputBits = codingLine[this.codingPos] - codingLine[this.codingPos - 1];
                    } else if (bits > 0) {
                        this.buf <<= bits;
                        bits = 0;
                    }
                }
            } while (bits);
        }
        if (this.black) {
            this.buf ^= 0xFF;
        }
        return this.buf;
    };
    constructor.prototype.getTwoDimCode = function() {
        var code = 0;
        var p;
        if (this.eoblock) {
            code = this.lookBits(7);
            p = twoDimTable[code];
            if (p[0] > 0) {
                this.eatBits(p[0]);
                return p[1];
            }
        } else {
            for (var n = 1; n <= 7; ++n) {
                code = this.lookBits(n);
                if (n < 7) {
                    code <<= 7 - n;
                }
                p = twoDimTable[code];
                if (p[0] == n) {
                    this.eatBits(n);
                    return p[1];
                }
            }
        }
        warn("Bad two dim code");
        return EOF;
    };

    constructor.prototype.getWhiteCode = function() {
        var code = 0;
        var p;
        var n;
        if (this.eoblock) {
            code = this.lookBits(12);
            if (code == EOF)
                return 1;
            
            if ((code >> 5) == 0)
                p = whiteTable1[code];
            else
                p = whiteTable2[code >> 3];

            if (p[0] > 0) {
                this.eatBits(p[0]);
                return p[1];
            }
        } else {
            for (var n = 1; n <= 9; ++n) {
                code = this.lookBits(n);
                if (code == EOF)
                    return 1;

                if (n < 9)
                    code <<= 9 - n;
                p = whiteTable2[code];
                if (p[0] == n) {
                    this.eatBits(n);    
                    return p[0];
                }
            }
            for (var n = 11; n <= 12; ++n) {
                code == this.lookBits(n);
                if (code == EOF)
                    return 1;
                if (n < 12) 
                    code <<= 12 - n;
                p = whiteTable1[code];
                if (p[0] == n) {
                    this.eatBits(n);
                    return p[1];
                }
            }
        }
        warn("bad white code");
        this.eatBits(1);
        return 1;
    };
    constructor.prototype.getBlackCode = function() {
        var code, p, n;
        if (this.eoblock) {
            code = this.lookBits(13);
            if (code == EOF)
                return 1;
            if ((code >> 7) == 0)
                p = blackTable1[code];
            else if ((code >> 9) == 0 && (code >> 7) != 0)
                p = blackTable2[(code >> 1) - 64];
            else 
                p = blackTable3[code >> 7];

            if (p[0] > 0) {
                this.eatBits(p[0]);
                return p[1];
            }
        } else {
            for (var n = 2; n <= 6; ++n) {
                code = this.lookBits(n);
                if (code == EOF)
                    return 1;
                if (n < 6)
                    code <<= 6 - n;

                p = blackTable3[code];
                if (p[0] == n) {
                    this.eatBits(n);
                    return p[1];
                }
            }
            for (var n = 7; n <= 12; ++n) {
                code = this.lookBits(n);
                if (code == EOF)
                    return 1;
                if (n < 12)
                    code <<= 12 - n;
                if (code >= 64) {
                    p = blackTable2[code - 64];
                    if (p[0] == n) {
                        this.eatBits(n);
                        return p[1];
                    }
                }
            }
            for (n = 10; n <= 13; ++n) {
                code = this.lookBits(n);
                if (code == EOF)
                    return 1;
                if (n < 13)
                    code << 13 - n;
                p = blackTable1[code];
                if (p[0] == n) {
                    this.eatBits(n);
                    return p[1];
                }
            }
        }
        warn("bad black code");
        this.eatBits(1);
        return 1;
    };
    constructor.prototype.lookBits = function(n) {
        var c;
        while (this.inputBits < n) {
            if ((c = this.str.getByte()) == null) {
                if (this.inputBits == 0)
                    return EOF;
                return (this.inputBuf << (n - this.inputBits)) 
                    & (0xFFFF >> (16 - n));
            }
            this.inputBuf = (this.inputBuf << 8) + c;
            this.inputBits += 8;
        }
        return (this.inputBuf >> (this.inputBits - n)) & (0xFFFF >> (16 - n));
    };
    constructor.prototype.eatBits = function(n) {
        if ((this.inputBits -= n) < 0)
            this.inputBits = 0;
    }

    return constructor;
})();

var Name = (function() {
    function constructor(name) {
        this.name = name;
    }

    constructor.prototype = {
    };

    return constructor;
})();

var Cmd = (function() {
    function constructor(cmd) {
        this.cmd = cmd;
    }

    constructor.prototype = {
    };

    return constructor;
})();

var Dict = (function() {
    function constructor() {
        this.map = Object.create(null);
    }

    constructor.prototype = {
        get: function(key) {
            if (key in this.map)
              return this.map[key];
            return null;
        },
        get2: function(key1, key2) {
            return this.get(key1) || this.get(key2);
        },
        get3: function(key1, key2, key3) {
            return this.get(key1) || this.get(key2) || this.get(key3);
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
    return typeof v == "object" && v != null && ("getChar" in v);
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

    var MIN_INT = (1<<31) | 0;
    var MAX_INT = (MIN_INT - 1) | 0;
    var MIN_UINT = 0;
    var MAX_UINT = ((1<<30) * 4) - 1;

    function ToHexDigit(ch) {
        if (ch >= "0" && ch <= "9")
            return ch.charCodeAt(0) - 48;
        ch = ch.toUpperCase();
        if (ch >= "A" && ch <= "F")
            return ch.charCodeAt(0) - 55;
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
            var ch;
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
        getObj: function(cipherTransform) {
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
                        dict.set(key, this.getObj(cipherTransform));
                    }
                }
                if (IsEOF(this.buf1))
                    error("End of file inside dictionary");

                // stream objects are not allowed inside content streams or
                // object streams
                if (this.allowStreams && IsCmd(this.buf2, "stream")) {
                    return this.makeStream(dict, cipherTransform);
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
                if (cipherTransform)
                    str = cipherTransform.decryptString(str);
                return str;
            }

            // simple object
            var obj = this.buf1;
            this.shift();
            return obj;
        },
        makeStream: function(dict, cipherTransform) {
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
            if (cipherTransform)
                stream = cipherTransform.createStream(stream);
            stream = this.filter(stream, dict, length);
            stream.parameters = dict;
            return stream;
        },
        filter: function(stream, dict, length) {
            var filter = dict.get2("Filter", "F");
            var params = dict.get2("DecodeParms", "DP");
            if (IsName(filter))
                return this.makeFilter(stream, filter.name, length, params);
            if (IsArray(filter)) {
                var filterArray = filter;
                var paramsArray = params;
                for (var i = 0, ii = filterArray.length; i < ii; ++i) {
                    filter = filterArray[i];
                    if (!IsName(filter))
                        error("Bad filter name");
                    else {
                        params = null;
                        if (IsArray(paramsArray) && (i in paramsArray))
                            params = paramsArray[i];
                        stream = this.makeFilter(stream, filter.name, length, params);
                    }
                }
            }
            return stream;
        },
        makeFilter: function(stream, name, length, params) {
            if (name == "FlateDecode" || name == "Fl") {
                if (params) {
                    return new PredictorStream(new FlateStream(stream), params);
                }
                return new FlateStream(stream);
            } else if (name == "DCTDecode") {
                var bytes = stream.getBytes(length);
                return new JpegStream(bytes, stream.dict);
            } else if (name == "ASCII85Decode") {
                return new Ascii85Stream(stream);
            } else if (name == "CCITTFaxDecode") {
                TODO("implement fax stream");
                return new CCITTFaxStream(stream, params);
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
        var trailerDict = this.readXRef(startXRef);

        // prepare the XRef cache
        this.cache = [];

        var encrypt = trailerDict.get("Encrypt");
        if (encrypt) {
            var fileId = trailerDict.get("ID");
            this.encrypt = new CipherTransformFactory(this.fetch(encrypt), fileId[0] /*, password */);
        }

        // get the root dictionary (catalog) object
        if (!IsRef(this.root = trailerDict.get("Root")))
            error("Invalid root reference");
    }

    constructor.prototype = {
        readXRefTable: function readXRefTable(parser) {
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
            var prev;
            obj = dict.get("Prev");
            if (IsInt(obj)) {
                prev = obj;
            } else if (IsRef(obj)) {
                // certain buggy PDF generators generate "/Prev NNN 0 R" instead
                // of "/Prev NNN"
                prev = obj.num;
            }
            if (prev) {
                this.readXRef(prev);
            }

            // check for 'XRefStm' key
            if (IsInt(obj = dict.get("XRefStm"))) {
                var pos = obj;
                if (pos in this.xrefstms)
                    error("Invalid XRef table");
                this.xrefstms[pos] = 1; // avoid infinite recursion
                this.readXRef(pos);
            }

            return dict;
        },
        readXRefStream: function readXRefStream(stream) {
            var streamParameters = stream.parameters;
            var length = streamParameters.get("Length");
            var byteWidths = streamParameters.get("W");
            var range = streamParameters.get("Index");
            if (!range)
                range = [0, streamParameters.get("Size")];
            var i, j;
            while (range.length > 0) {
                var first = range[0], n = range[1];
                if (!IsInt(first) || !IsInt(n))
                    error("Invalid XRef range fields");
                var typeFieldWidth = byteWidths[0], offsetFieldWidth = byteWidths[1], generationFieldWidth = byteWidths[2];
                if (!IsInt(typeFieldWidth) || !IsInt(offsetFieldWidth) || !IsInt(generationFieldWidth))
                    error("Invalid XRef entry fields length");
                for (i = 0; i < n; ++i) {
                    var type = 0, offset = 0, generation = 0;
                    for (j = 0; j < typeFieldWidth; ++j)
                        type = (type << 8) | stream.getByte();
                    // if type field is absent, its default value = 1
                    if (typeFieldWidth == 0)
                        type = 1;
                    for (j = 0; j < offsetFieldWidth; ++j)
                        offset = (offset << 8) | stream.getByte();
                    for (j = 0; j < generationFieldWidth; ++j)
                        generation = (generation << 8) | stream.getByte();
                    var entry = {}
                    entry.offset = offset;
                    entry.gen = generation;
                    switch (type) {
                    case 0:
                        entry.free = true;
                        break;
                    case 1:
                        entry.uncompressed = true;
                        break;
                    case 2:
                        break;
                    default:
                        error("Invalid XRef entry type");
                        break;
                    }
                    if (!this.entries[first + i])
                        this.entries[first + i] = entry;
                }
                range.splice(0, 2);
            }
            var prev = streamParameters.get("Prev");
            if (IsInt(prev))
                this.readXRef(prev);
            return streamParameters;
        },
        readXRef: function readXref(startXRef) {
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
            return null;
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
            var stream, parser;
            if (e.uncompressed) {
                if (e.gen != gen)
                    throw("inconsistent generation in XRef");
                stream = this.stream.makeSubStream(e.offset);
                parser = new Parser(new Lexer(stream), true, this);
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
                if (this.encrypt) {
                    e = parser.getObj(this.encrypt.createCipherTransform(num, gen));
                } else {
                    e = parser.getObj();
                }
                // Don't cache streams since they are mutable.
                if (!IsStream(e))
                    this.cache[num] = e;
                return e;
            }

            // compressed entry
            stream = this.fetch(new Ref(e.offset, 0));
            if (!IsStream(stream))
                error("bad ObjStm stream");
            var first = stream.parameters.get("First");
            var n = stream.parameters.get("N");
            if (!IsInt(first) || !IsInt(n)) {
                error("invalid first and n parameters for ObjStm stream");
            }
            parser = new Parser(new Lexer(stream), false);
            var i, entries = [], nums = [];
            // read the object numbers to populate cache
            for (i = 0; i < n; ++i) {
                var num = parser.getObj();
                if (!IsInt(num)) {
                    error("invalid object number in the ObjStm stream");
                }
                nums.push(num);
                var offset = parser.getObj();
                if (!IsInt(offset)) {
                    error("invalid object offset in the ObjStm stream");
                }
            }
            // read stream objects for cache
            for (i = 0; i < n; ++i) {
                entries.push(parser.getObj());
                this.cache[nums[i]] = entries[i];
            }
            e = entries[e.gen];
            if (!e) {
                error("bad XRef entry for compressed object");
            }
            return e;
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
        getPageProp: function(key) {
            return this.pageDict.get(key);
        },
        inheritPageProp: function(key) {
            var dict = this.pageDict;
            var obj = dict.get(key);
            while (!obj) {
                dict = this.xref.fetchIfRef(dict.get("Parent"));
                if (!dict)
                    break;
                obj = dict.get(key);
            }
            return obj;
        },
        get content() {
            return shadow(this, "content", this.getPageProp("Contents"));
        },
        get resources() {
            return shadow(this, "resources", this.inheritPageProp("Resources"));
        },
        get mediaBox() {
            var obj = this.inheritPageProp("MediaBox");
            return shadow(this, "mediaBox", ((IsArray(obj) && obj.length == 4)
                                             ? obj
                                             : null));
        },
        compile: function(gfx, fonts) {
            if (this.code) {
                // content was compiled
                return;
            }

            var xref = this.xref;
            var content;
            var resources = xref.fetchIfRef(this.resources);
            if (!IsArray(this.content)) {
                // content is not an array, shortcut
                content = xref.fetchIfRef(this.content);
                this.code = gfx.compile(content, xref, resources, fonts);
                return;
            }
            // the content is an array, compiling all items
            var i, n = this.content.length, compiledItems = [];
            for (i = 0; i < n; ++i) {
                content = xref.fetchIfRef(this.content[i]);
                compiledItems.push(gfx.compile(content, xref, resources, fonts));
            }
            // creating the function that executes all compiled items
            this.code = function(gfx) {
                var i, n = compiledItems.length;
                for (i = 0; i < n; ++i) {
                    compiledItems[i](gfx);
                }
            };
        },
        display: function(gfx) {
            assert(this.code instanceof Function, "page content must be compiled first");
            var xref = this.xref;
            var resources = xref.fetchIfRef(this.resources);
            var mediaBox = xref.fetchIfRef(this.mediaBox);
            assertWellFormed(IsDict(resources), "invalid page resources");
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
            var obj = this.toplevelPagesDict.get("Count");
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
        assertWellFormed(stream.length > 0, "stream must have data");
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
            // assert(!linearization, "linearized page access not implemented");
            return this.catalog.getPage(n);
        }
    };

    return constructor;
})();

var Encodings = {
  get ExpertEncoding() {
    return shadow(this, "ExpertEncoding", [ ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
      "space","exclamsmall","Hungarumlautsmall",,"dollaroldstyle","dollarsuperior",
      "ampersandsmall","Acutesmall","parenleftsuperior","parenrightsuperior",
      "twodotenleader","onedotenleader","comma","hyphen","period","fraction",
      "zerooldstyle","oneoldstyle","twooldstyle","threeoldstyle","fouroldstyle",
      "fiveoldstyle","sixoldstyle","sevenoldstyle","eightoldstyle","nineoldstyle",
      "colon","semicolon","commasuperior","threequartersemdash","periodsuperior",
      "questionsmall",,"asuperior","bsuperior","centsuperior","dsuperior","esuperior",,,
      "isuperior",,,"lsuperior","msuperior","nsuperior","osuperior",,,"rsuperior",
      "ssuperior","tsuperior",,"ff","fi","fl","ffi","ffl","parenleftinferior",,
      "parenrightinferior","Circumflexsmall","hyphensuperior","Gravesmall","Asmall",
      "Bsmall","Csmall","Dsmall","Esmall","Fsmall","Gsmall","Hsmall","Ismall","Jsmall",
      "Ksmall","Lsmall","Msmall","Nsmall","Osmall","Psmall","Qsmall","Rsmall","Ssmall",
      "Tsmall","Usmall","Vsmall","Wsmall","Xsmall","Ysmall","Zsmall","colonmonetary",
      "onefitted","rupiah","Tildesmall",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
      "exclamdownsmall","centoldstyle","Lslashsmall",,,"Scaronsmall","Zcaronsmall",
      "Dieresissmall","Brevesmall","Caronsmall",,"Dotaccentsmall",,,"Macronsmall",,,
      "figuredash","hypheninferior",,,"Ogoneksmall","Ringsmall","Cedillasmall",,,,
      "onequarter","onehalf","threequarters","questiondownsmall","oneeighth",
      "threeeighths","fiveeighths","seveneighths","onethird","twothirds",,,
      "zerosuperior","onesuperior","twosuperior","threesuperior","foursuperior",
      "fivesuperior","sixsuperior","sevensuperior","eightsuperior","ninesuperior",
      "zeroinferior","oneinferior","twoinferior","threeinferior","fourinferior",
      "fiveinferior","sixinferior","seveninferior","eightinferior","nineinferior",
      "centinferior","dollarinferior","periodinferior","commainferior","Agravesmall",
      "Aacutesmall","Acircumflexsmall","Atildesmall","Adieresissmall","Aringsmall",
      "AEsmall","Ccedillasmall","Egravesmall","Eacutesmall","Ecircumflexsmall",
      "Edieresissmall","Igravesmall","Iacutesmall","Icircumflexsmall","Idieresissmall",
      "Ethsmall","Ntildesmall","Ogravesmall","Oacutesmall","Ocircumflexsmall",
      "Otildesmall","Odieresissmall","OEsmall","Oslashsmall","Ugravesmall",
      "Uacutesmall","Ucircumflexsmall","Udieresissmall","Yacutesmall","Thornsmall",
      "Ydieresissmall"
    ]);
  },
  get MacExpertEncoding() {
    return shadow(this, "MacExpertEncoding", [ ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
      "space","exclamsmall","Hungarumlautsmall","centoldstyle","dollaroldstyle",
      "dollarsuperior","ampersandsmall","Acutesmall","parenleftsuperior",
      "parenrightsuperior","twodotenleader","onedotenleader","comma","hyphen","period",
      "fraction","zerooldstyle","oneoldstyle","twooldstyle","threeoldstyle",
      "fouroldstyle","fiveoldstyle","sixoldstyle","sevenoldstyle","eightoldstyle",
      "nineoldstyle","colon","semicolon",,"threequartersemdash",,"questionsmall",,,,,
      "Ethsmall",,,"onequarter","onehalf","threequarters","oneeighth","threeeighths",
      "fiveeighths","seveneighths","onethird","twothirds",,,,,,,"ff","fi","fl","ffi",
      "ffl","parenleftinferior",,"parenrightinferior","Circumflexsmall",
      "hypheninferior","Gravesmall","Asmall","Bsmall","Csmall","Dsmall","Esmall",
      "Fsmall","Gsmall","Hsmall","Ismall","Jsmall","Ksmall","Lsmall","Msmall","Nsmall",
      "Osmall","Psmall","Qsmall","Rsmall","Ssmall","Tsmall","Usmall","Vsmall","Wsmall",
      "Xsmall","Ysmall","Zsmall","colonmonetary","onefitted","rupiah","Tildesmall",,,
      "asuperior","centsuperior",,,,,"Aacutesmall","Agravesmall","Acircumflexsmall",
      "Adieresissmall","Atildesmall","Aringsmall","Ccedillasmall","Eacutesmall",
      "Egravesmall","Ecircumflexsmall","Edieresissmall","Iacutesmall","Igravesmall",
      "Icircumflexsmall","Idieresissmall","Ntildesmall","Oacutesmall","Ogravesmall",
      "Ocircumflexsmall","Odieresissmall","Otildesmall","Uacutesmall","Ugravesmall",
      "Ucircumflexsmall","Udieresissmall",,"eightsuperior","fourinferior",
      "threeinferior","sixinferior","eightinferior","seveninferior","Scaronsmall",,
      "centinferior","twoinferior",,"Dieresissmall",,"Caronsmall","osuperior",
      "fiveinferior",,"commainferior","periodinferior","Yacutesmall",,"dollarinferior",,
      "Thornsmall",,"nineinferior","zeroinferior","Zcaronsmall","AEsmall","Oslashsmall",
      "questiondownsmall","oneinferior","Lslashsmall",,,,,,,"Cedillasmall",,,,,,
      "OEsmall","figuredash","hyphensuperior",,,,,"exclamdownsmall",,"Ydieresissmall",,
      "onesuperior","twosuperior","threesuperior","foursuperior","fivesuperior",
      "sixsuperior","sevensuperior","ninesuperior","zerosuperior",,"esuperior",
      "rsuperior","tsuperior",,,"isuperior","ssuperior","dsuperior",,,,,,"lsuperior",
      "Ogoneksmall","Brevesmall","Macronsmall","bsuperior","nsuperior","msuperior",
      "commasuperior","periodsuperior","Dotaccentsmall","Ringsmall",,,
    ]);
  },
  get MacRomanEncoding() {
    return shadow(this, "MacRomanEncoding", [ ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
      "space","exclam","quotedbl","numbersign","dollar","percent","ampersand",
      "quotesingle","parenleft","parenright","asterisk","plus","comma","hyphen",
      "period","slash","zero","one","two","three","four","five","six","seven","eight",
      "nine","colon","semicolon","less","equal","greater","question","at","A","B","C",
      "D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W",
      "X","Y","Z","bracketleft","backslash","bracketright","asciicircum","underscore",
      "grave","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r",
      "s","t","u","v","w","x","y","z","braceleft","bar","braceright","asciitilde",,
      "Adieresis","Aring","Ccedilla","Eacute","Ntilde","Odieresis","Udieresis","aacute",
      "agrave","acircumflex","adieresis","atilde","aring","ccedilla","eacute","egrave",
      "ecircumflex","edieresis","iacute","igrave","icircumflex","idieresis","ntilde",
      "oacute","ograve","ocircumflex","odieresis","otilde","uacute","ugrave",
      "ucircumflex","udieresis","dagger","degree","cent","sterling","section","bullet",
      "paragraph","germandbls","registered","copyright","trademark","acute","dieresis",
      "notequal","AE","Oslash","infinity","plusminus","lessequal","greaterequal","yen",
      "mu","partialdiff","summation","product","pi","integral","ordfeminine",
      "ordmasculine","Omega","ae","oslash","questiondown","exclamdown","logicalnot",
      "radical","florin","approxequal","Delta","guillemotleft","guillemotright",
      "ellipsis","space","Agrave","Atilde","Otilde","OE","oe","endash","emdash",
      "quotedblleft","quotedblright","quoteleft","quoteright","divide","lozenge",
      "ydieresis","Ydieresis","fraction","currency","guilsinglleft","guilsinglright",
      "fi","fl","daggerdbl","periodcentered","quotesinglbase","quotedblbase",
      "perthousand","Acircumflex","Ecircumflex","Aacute","Edieresis","Egrave","Iacute",
      "Icircumflex","Idieresis","Igrave","Oacute","Ocircumflex","apple","Ograve",
      "Uacute","Ucircumflex","Ugrave","dotlessi","circumflex","tilde","macron","breve",
      "dotaccent","ring","cedilla","hungarumlaut","ogonek","caron"
    ]);
  },
  get StandardEncoding() {
    return shadow(this, "StandardEncoding", [ ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
      "space","exclam","quotedbl","numbersign","dollar","percent","ampersand",
      "quoteright","parenleft","parenright","asterisk","plus","comma","hyphen","period",
      "slash","zero","one","two","three","four","five","six","seven","eight","nine",
      "colon","semicolon","less","equal","greater","question","at","A","B","C","D","E",
      "F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y",
      "Z","bracketleft","backslash","bracketright","asciicircum","underscore",
      "quoteleft","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q",
      "r","s","t","u","v","w","x","y","z","braceleft","bar","braceright","asciitilde",,,
      "exclamdown","cent","sterling","fraction","yen","florin","section","currency",
      "quotesingle","quotedblleft","guillemotleft","guilsinglleft","guilsinglright",
      "fi","fl",,"endash","dagger","daggerdbl","periodcentered",,"paragraph","bullet",
      "quotesinglbase","quotedblbase","quotedblright","guillemotright","ellipsis",
      "perthousand",,"questiondown",,"grave","acute","circumflex","tilde","macron",
      "breve","dotaccent","dieresis",,"ring","cedilla",,"hungarumlaut","ogonek","caron",
      "emdash",,,,,,,,,,,,,,,,,"AE",,"ordfeminine",,,,,"Lslash","Oslash","OE",
      "ordmasculine",,,,,,"ae",,,,"dotlessi",,,"lslash","oslash","oe","germandbls",,,
    ]);
  },
  get WinAnsiEncoding() {
    return shadow(this, "WinAnsiEncoding", [ ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
      "space","exclam","quotedbl","numbersign","dollar","percent","ampersand",
      "quotesingle","parenleft","parenright","asterisk","plus","comma","hyphen",
      "period","slash","zero","one","two","three","four","five","six","seven","eight",
      "nine","colon","semicolon","less","equal","greater","question","at","A","B","C",
      "D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W",
      "X","Y","Z","bracketleft","backslash","bracketright","asciicircum","underscore",
      "grave","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r",
      "s","t","u","v","w","x","y","z","braceleft","bar","braceright","asciitilde",
      "bullet","Euro","bullet","quotesinglbase","florin","quotedblbase","ellipsis",
      "dagger","daggerdbl","circumflex","perthousand","Scaron","guilsinglleft","OE",
      "bullet","Zcaron","bullet","bullet","quoteleft","quoteright","quotedblleft",
      "quotedblright","bullet","endash","emdash","tilde","trademark","scaron",
      "guilsinglright","oe","bullet","zcaron","Ydieresis","space","exclamdown","cent",
      "sterling","currency","yen","brokenbar","section","dieresis","copyright",
      "ordfeminine","guillemotleft","logicalnot","hyphen","registered","macron",
      "degree","plusminus","twosuperior","threesuperior","acute","mu","paragraph",
      "periodcentered","cedilla","onesuperior","ordmasculine","guillemotright",
      "onequarter","onehalf","threequarters","questiondown","Agrave","Aacute",
      "Acircumflex","Atilde","Adieresis","Aring","AE","Ccedilla","Egrave","Eacute",
      "Ecircumflex","Edieresis","Igrave","Iacute","Icircumflex","Idieresis","Eth",
      "Ntilde","Ograve","Oacute","Ocircumflex","Otilde","Odieresis","multiply","Oslash",
      "Ugrave","Uacute","Ucircumflex","Udieresis","Yacute","Thorn","germandbls",
      "agrave","aacute","acircumflex","atilde","adieresis","aring","ae","ccedilla",
      "egrave","eacute","ecircumflex","edieresis","igrave","iacute","icircumflex",
      "idieresis","eth","ntilde","ograve","oacute","ocircumflex","otilde","odieresis",
      "divide","oslash","ugrave","uacute","ucircumflex","udieresis","yacute","thorn",
      "ydieresis"
    ]);
  },
  get zapfDingbatsEncoding() {
    return shadow(this, "zapfDingbatsEncoding", [ ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
      "space","a1","a2","a202","a3","a4","a5","a119","a118","a117","a11","a12","a13",
      "a14","a15","a16","a105","a17","a18","a19","a20","a21","a22","a23","a24","a25",
      "a26","a27","a28","a6","a7","a8","a9","a10","a29","a30","a31","a32","a33","a34",
      "a35","a36","a37","a38","a39","a40","a41","a42","a43","a44","a45","a46","a47",
      "a48","a49","a50","a51","a52","a53","a54","a55","a56","a57","a58","a59","a60",
      "a61","a62","a63","a64","a65","a66","a67","a68","a69","a70","a71","a72","a73",
      "a74","a203","a75","a204","a76","a77","a78","a79","a81","a82","a83","a84","a97",
      "a98","a99","a100",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,"a101","a102","a103","a104",
      "a106","a107","a108","a112","a111","a110","a109","a120","a121","a122","a123",
      "a124","a125","a126","a127","a128","a129","a130","a131","a132","a133","a134",
      "a135","a136","a137","a138","a139","a140","a141","a142","a143","a144","a145",
      "a146","a147","a148","a149","a150","a151","a152","a153","a154","a155","a156",
      "a157","a158","a159","a160","a161","a163","a164","a196","a165","a192","a166",
      "a167","a168","a169","a170","a171","a172","a173","a162","a174","a175","a176",
      "a177","a178","a179","a193","a180","a199","a181","a200","a182",,"a201","a183",
      "a184","a197","a185","a194","a198","a186","a195","a187","a188","a189","a190",
      "a191"
    ]);
  }
};

var IDENTITY_MATRIX = [ 1, 0, 0, 1, 0, 0 ];

// <canvas> contexts store most of the state we need natively.
// However, PDF needs a bit more state, which we store here.
var CanvasExtraState = (function() {
    function constructor() {
        // Are soft masks and alpha values shapes or opacities?
        this.alphaIsShape = false;
        this.fontSize = 0;
        this.textMatrix = IDENTITY_MATRIX;
        this.leading = 0;
        // Current point (in user coordinates)
        this.x = 0;
        this.y = 0;
        // Start of text line (in text coordinates)
        this.lineX = 0;
        this.lineY = 0;
        // Character and word spacing
        this.charSpace = 0;
        this.wordSpace = 0;
        this.textHScale = 100;
        // Color spaces
        this.fillColorSpace = null;
        this.strokeColorSpace = null;
    }
    constructor.prototype = {
    };
    return constructor;
})();

function ScratchCanvas(width, height) {
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

var CanvasGraphics = (function() {
    function constructor(canvasCtx, imageCanvas) {
        this.ctx = canvasCtx;
        this.current = new CanvasExtraState();
        this.stateStack = [ ];
        this.pendingClip = null;
        this.res = null;
        this.xobjs = null;
        this.ScratchCanvas = imageCanvas || ScratchCanvas;
    }

    var LINE_CAP_STYLES = [ "butt", "round", "square" ];
    var LINE_JOIN_STYLES = [ "miter", "round", "bevel" ];
    var NORMAL_CLIP = {};
    var EO_CLIP = {};

    // Used for tiling patterns
    var PAINT_TYPE_COLORED = 1, PAINT_TYPE_UNCOLORED = 2;

    constructor.prototype = {
        map: {
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
            F: "fill",
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
        },

        translateFont: function(fontDict, xref, resources) {
            var fd = fontDict.get("FontDescriptor");
            if (!fd)
                // XXX deprecated "special treatment" for standard
                // fonts?  What do we need to do here?
                return null;
            var descriptor = xref.fetch(fd);

            var fontName = descriptor.get("FontName");
            assertWellFormed(IsName(fontName), "invalid font name");
            fontName = fontName.name.replace("+", "_");

            var fontFile = descriptor.get3("FontFile", "FontFile2", "FontFile3");
            if (!fontFile)
                error("FontFile not found for font: " + fontName);
            fontFile = xref.fetchIfRef(fontFile);

            var encodingMap = {};
            var charset = [];
            if (fontDict.has("Encoding")) {
                var encoding = xref.fetchIfRef(fontDict.get("Encoding"));
                if (IsDict(encoding)) {
                    // Build a map between codes and glyphs
                    var differences = encoding.get("Differences");
                    var index = 0;
                    for (var j = 0; j < differences.length; j++) {
                        var data = differences[j];
                        IsNum(data) ? index = data : encodingMap[index++] = data;
                    }

                    // Get the font charset if any
                    var charset = descriptor.get("CharSet");
                    if (charset) {
                        assertWellFormed(IsString(charset), "invalid charset");
                        charset = charset.split("/");
                        charset.shift();
                    }
                } else if (IsName(encoding)) {
                    var encoding = Encodings[encoding.name];
                    if (!encoding)
                        error("Unknown font encoding");

                    var index = 0;
                    for (var j = 0; j < encoding.length; j++)
                        encodingMap[index++] = GlyphsUnicode[encoding[j]];

                    var firstChar = xref.fetchIfRef(fontDict.get("FirstChar"));
                    var widths = xref.fetchIfRef(fontDict.get("Widths"));
                    assertWellFormed(IsArray(widths) && IsInt(firstChar),
                                     "invalid font Widths or FirstChar");

                    for (var j = 0; j < widths.length; j++) {
                        if (widths[j])
                            charset.push(encoding[j + firstChar]);
                    }
                }
            } else if (fontDict.has("ToUnicode")) {
                encodingMap = {empty: true};
                var cmapObj = xref.fetchIfRef(fontDict.get("ToUnicode"));
                if (IsName(cmapObj)) {
                    error("ToUnicode file cmap translation not implemented");
                } else if (IsStream(cmapObj)) {
                    var encoding = Encodings["WinAnsiEncoding"];
                    var firstChar = xref.fetchIfRef(fontDict.get("FirstChar"));

                    var tokens = [];
                    var token = "";

                    var cmap = cmapObj.getBytes(cmapObj.length);
                    for (var i =0; i < cmap.length; i++) {
                      var byte = cmap[i];
                      if (byte == 0x20 || byte == 0x0A || byte == 0x3C || byte == 0x3E) {
                        switch (token) {
                          case "useCMap":
                            error("useCMap is not implemented");
                            break;

                          case "beginbfrange":
                          case "begincodespacerange":
                            token = "";
                            tokens = [];
                            break;

                          case "endcodespacerange":
                            TODO("Support CMap ranges");
                            break;

                          case "endbfrange":
                            for (var j = 0; j < tokens.length; j+=3) {
                              var startRange = parseInt("0x" + tokens[j]);
                              var endRange = parseInt("0x" + tokens[j+1]);
                              var code = parseInt("0x" + tokens[j+2]);

                              for (var k = startRange; k <= endRange; k++) {
                                // The encoding mapping table will be filled
                                // later during the building phase
                                //encodingMap[k] = GlyphsUnicode[encoding[code]];
                                charset.push(encoding[code++] || ".notdef");
                              }
                            }
                            break;

                          case "beginfbchar":
                          case "endfbchar":
                            error("fbchar parsing is not implemented");
                            break;

                          default:
                            if (token.length) {
                              tokens.push(token);
                              token = "";
                            }
                            break;
                        }
                    } else if (byte == 0x5B || byte == 0x5D) {
                        error("CMAP list parsing is not implemented");
                    } else {
                        token += String.fromCharCode(byte);
                    }
                  }
               }
            }

            var subType = fontDict.get("Subtype");
            assertWellFormed(IsName(subType), "invalid font Subtype");

            var properties = {
                type: subType.name,
                encoding: encodingMap,
                charset: charset,
                firstChar: fontDict.get("FirstChar"),
                lastChar: fontDict.get("LastChar"),
                bbox: descriptor.get("FontBBox"),
                ascent: descriptor.get("Ascent"),
                descent: descriptor.get("Descent"),
                xHeight: descriptor.get("XHeight"),
                capHeight: descriptor.get("CapHeight"),
                flags: descriptor.get("Flags"),
                italicAngle: descriptor.get("ItalicAngle"),
                fixedPitch: false,
                textMatrix: IDENTITY_MATRIX
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
            if (this.ctx.$saveCurrentX) {
                this.ctx.$saveCurrentX();
            }
            this.stateStack.push(this.current);
            this.current = new CanvasExtraState();
        },
        restore: function() {
            var prev = this.stateStack.pop();
            if (prev) {
                if (this.ctx.$restoreCurrentX) {
                    this.ctx.$restoreCurrentX();
                }
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
            if (this.ctx.$setCurrentX) {
                this.ctx.$setCurrentX(0)
            }
            this.current.x = this.current.lineX = 0;
            this.current.y = this.current.lineY = 0;
        },
        endText: function() {
        },
        setCharSpacing: function(spacing) {
            this.ctx.charSpacing = spacing;
        },
        setWordSpacing: function(spacing) {
            this.ctx.wordSpacing = spacing;
        },
        setHScale: function(scale) {
            this.ctx.textHScale = (scale % 100) * 0.01;
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
            if (fontDescriptor && fontDescriptor.num) {
                var fontDescriptor = this.xref.fetchIfRef(fontDescriptor);
                fontName = fontDescriptor.get("FontName").name.replace("+", "_");
            }

            if (!fontName) {
                // TODO: fontDescriptor is not available, fallback to default font
                fontName = "sans-serif";
            }

            this.current.fontName = fontName;
            this.current.fontSize = size;

            if (this.ctx.$setFont) {
              this.ctx.$setFont(fontName, size);
            } else {
              this.ctx.font = size + 'px "' + fontName + '"';
              Fonts.setActive(fontName, size);
            }
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
            if (this.ctx.$setCurrentX) {
                this.ctx.$setCurrentX(this.current.x)
            }
        },
        setLeadingMoveText: function(x, y) {
            this.setLeading(-y);
            this.moveText(x, y);
        },
        setTextMatrix: function(a, b, c, d, e, f) {
            this.current.textMatrix = [ a, b, c, d, e, f ];

            if (this.ctx.$setCurrentX) {
                this.ctx.$setCurrentX(0)
            }
            this.current.x = this.current.lineX = 0;
            this.current.y = this.current.lineY = 0;
        },
        nextLine: function() {
            this.moveText(0, this.current.leading);
        },
        showText: function(text) {
            // TODO: apply charSpacing, wordSpacing, textHScale

            this.ctx.save();
            this.ctx.transform.apply(this.ctx, this.current.textMatrix);
            this.ctx.scale(1, -1);

            if (this.ctx.$showText) {
                this.ctx.$showText(this.current.y, Fonts.charsToUnicode(text));
            } else {
                text = Fonts.charsToUnicode(text);
                this.ctx.translate(this.current.x, -1 * this.current.y);

                var font = Fonts.lookup(this.current.fontName);
                if (font)
                  this.ctx.transform.apply(this.ctx, font.properties.textMatrix);

                this.ctx.fillText(text, 0, 0);
                this.current.x += Fonts.measureText(text);
            }

            this.ctx.restore();
        },
        showSpacedText: function(arr) {
            for (var i = 0; i < arr.length; ++i) {
                var e = arr[i];
                if (IsNum(e)) {
                    if (this.ctx.$addCurrentX) {
                        this.ctx.$addCurrentX(-e * 0.001 * this.current.fontSize)
                    } else {
                        this.current.x -= e * 0.001 * this.current.fontSize;
                    }
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
            this.current.strokeColorSpace = 
                ColorSpace.parse(space, this.xref, this.res);
        },
        setFillColorSpace: function(space) {
            this.current.fillColorSpace = 
                ColorSpace.parse(space, this.xref, this.res);
        },
        setStrokeColor: function(/*...*/) {
            var cs = this.getStrokeColorSpace();
            var color = cs.getRgb(arguments);
            this.setStrokeRGBColor.apply(this, color);
        },
        setStrokeColorN: function(/*...*/) {
            // TODO real impl
            TODO("check for special color spaces");
            this.setStrokeColor.apply(this, arguments);
        },
        setFillColor: function(/*...*/) {
            var cs = this.getFillColorSpace();
            if (cs.name == "Pattern") {
                TODO("implement Pattern fill");
                return;
            }
            var color = cs.getRgb(arguments);
            this.setFillRGBColor.apply(this, color);
        },
        setFillColorN: function(/*...*/) {
            var cs = this.getFillColorSpace();

            if (cs.name == "Pattern") {
                var patternName = arguments[0];
                if (IsName(patternName)) {
                    var xref = this.xref;
                    var patternRes = xref.fetchIfRef(this.res.get("Pattern"));
                    if (!patternRes)
                        error("Unable to find pattern resource");

                    var pattern = xref.fetchIfRef(patternRes.get(patternName.name));
                    var patternDict = IsStream(pattern) ? pattern.dict : pattern;
                    var types = [null, this.tilingFill,
                                   function() { TODO("Shading Patterns"); }];
                    var typeNum = patternDict.get("PatternType");
                    var patternFn = types[typeNum];
                    if (!patternFn)
                        error("Unhandled pattern type");
                    patternFn.call(this, pattern, patternDict);
                }
            } else {
                // TODO real impl
                this.setFillColor.apply(this, arguments);
            }
        },
        tilingFill: function(pattern) {
            function applyMatrix(point, m) {
                var x = point[0] * m[0] + point[1] * m[2] + m[4];
                var y = point[0] * m[1] + point[1] * m[3] + m[5];
                return [x,y];
            };

            function multiply(m, tm) {
                var a = m[0] * tm[0] + m[1] * tm[2];
                var b = m[0] * tm[1] + m[1] * tm[3];
                var c = m[2] * tm[0] + m[3] * tm[2];
                var d = m[2] * tm[1] + m[3] * tm[3];
                var e = m[4] * tm[0] + m[5] * tm[2] + tm[4];
                var f = m[4] * tm[1] + m[5] * tm[3] + tm[5];
                return [a, b, c, d, e, f]
            };

            this.save();
            var dict = pattern.dict;
            var ctx = this.ctx;

            var paintType = dict.get("PaintType");
            switch (paintType) {
            case PAINT_TYPE_COLORED:
                // should go to default for color space
                ctx.fillStyle = this.makeCssRgb(1, 1, 1);
                ctx.strokeStyle = this.makeCssRgb(0, 0, 0);
                break;
            case PAINT_TYPE_UNCOLORED:
            default:
                error("Unsupported paint type");
            }

            TODO("TilingType");

            var matrix = dict.get("Matrix") || IDENTITY_MATRIX;

            var bbox = dict.get("BBox");
            var x0 = bbox[0], y0 = bbox[1], x1 = bbox[2], y1 = bbox[3];

            var xstep = dict.get("XStep");
            var ystep = dict.get("YStep");

            // top left corner should correspond to the top left of the bbox
            var topLeft = applyMatrix([x0,y0], matrix);
            // we want the canvas to be as large as the step size
            var botRight = applyMatrix([x0 + xstep, y0 + ystep], matrix);

            var width = botRight[0] - topLeft[0];
            var height = botRight[1] - topLeft[1];

            // TODO: hack to avoid OOM, remove then pattern code is fixed
            if (Math.abs(width) > 8192 || Math.abs(height) > 8192)
                return false;

            var tmpCanvas = new this.ScratchCanvas(width, height);

            // set the new canvas element context as the graphics context
            var tmpCtx = tmpCanvas.getContext("2d");
            var savedCtx = ctx;
            this.ctx = tmpCtx;

            // normalize transform matrix so each step
            // takes up the entire tmpCanvas (need to remove white borders)
            if (matrix[1] === 0 && matrix[2] === 0) {
                matrix[0] = tmpCanvas.width / xstep;
                matrix[3] = tmpCanvas.height / ystep;
                topLeft = applyMatrix([x0,y0], matrix);
            }

            // move the top left corner of bounding box to [0,0]
            matrix = multiply(matrix, [1, 0, 0, 1, -topLeft[0], -topLeft[1]]);

            this.transform.apply(this, matrix);

            if (bbox && IsArray(bbox) && 4 == bbox.length) {
                this.rectangle.apply(this, bbox);
                this.clip();
                this.endPath();
            }

            var xref = this.xref;
            var res = xref.fetchIfRef(dict.get("Resources"));
            if (!pattern.code)
                pattern.code = this.compile(pattern, xref, res, []);
            this.execute(pattern.code, xref, res);

            this.ctx = savedCtx;
            this.restore();

            TODO("Inverse pattern is painted");
            pattern = this.ctx.createPattern(tmpCanvas, "repeat");
            this.ctx.fillStyle = pattern;
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
            this.ctx.strokeStyle = this.makeCssCmyk(c, m, y, k);
        },
        setFillCMYKColor: function(c, m, y, k) {
            this.ctx.fillStyle = this.makeCssCmyk(c, m, y, k);
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

            var types = [null,
                           this.fillFunctionShading,
                           this.fillAxialShading,
                           this.fillRadialShading];

            var typeNum = shading.get("ShadingType");
            var fillFn = types[typeNum];
            if (!fillFn)
                error("Unknown or NYI type of shading '"+ typeNum +"'");
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
            var fn = new PDFFunction(this.xref, fnObj);

            var gradient = this.ctx.createLinearGradient(x0, y0, x1, y1);

            // 10 samples seems good enough for now, but probably won't work
            // if there are sharp color changes. Ideally, we would implement
            // the spec faithfully and add lossless optimizations.
            var step = (t1 - t0) / 10;

            for (var i = t0; i <= t1; i += step) {
                var c = fn.func([i]);
                gradient.addColorStop(i, this.makeCssRgb.apply(this, c));
            }

            this.ctx.fillStyle = gradient;

            // HACK to draw the gradient onto an infinite rectangle.
            // PDF gradients are drawn across the entire image while
            // Canvas only allows gradients to be drawn in a rectangle
            // The following bug should allow us to remove this.
            // https://bugzilla.mozilla.org/show_bug.cgi?id=664884
            this.ctx.fillRect(-1e10, -1e10, 2e10, 2e10);
        },

        fillRadialShading: function(sh) {
            TODO("radial shading");
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

            var ctx = this.ctx;
            var dict = image.dict;
            var w = dict.get2("Width", "W");
            var h = dict.get2("Height", "H");
            // scale the image to the unit square
            ctx.scale(1/w, -1/h);

            // If the platform can render the image format directly, the
            // stream has a getImage property which directly returns a
            // suitable DOM Image object.
            if (image.getImage) {
                var domImage = image.getImage();
                ctx.drawImage(domImage, 0, 0, domImage.width, domImage.height,
                              0, -h, w, h);
                this.restore();
                return;
            }

            var imageObj = new PDFImage(this.xref, this.res, image, inline); 

            var tmpCanvas = new this.ScratchCanvas(w, h);
            var tmpCtx = tmpCanvas.getContext("2d");
            var imgData = tmpCtx.getImageData(0, 0, w, h);
            var pixels = imgData.data;

            imageObj.fillRgbaBuffer(pixels);
            
            tmpCtx.putImageData(imgData, 0, 0);
            ctx.drawImage(tmpCanvas, 0, -h);
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
        makeCssCmyk: function(c, m, y, k) {
            // while waiting on CSS's cmyk()... http://www.ilkeratalay.com/colorspacesfaq.php#rgb
            var ri = (255 * (1 - Math.min(1, c * (1 - k) + k))) | 0;
            var gi = (255 * (1 - Math.min(1, m * (1 - k) + k))) | 0;
            var bi = (255 * (1 - Math.min(1, y * (1 - k) + k))) | 0;
            return "rgb("+ ri +","+ gi +","+ bi +")";
        },
        getFillColorSpace: function() {
            var cs = this.current.fillColorSpace;
            if (cs)
                return cs;

            var states = this.stateStack;
            var i = states.length - 1;
            while (i >= 0 && !(cs = states[i].fillColorSpace))
                --i;

            if (cs)
                return cs;
            else
                return new DeviceRgbCS();
        },
        getStrokeColorSpace: function() {
            var cs = this.current.strokeColorSpace;
            if (cs)
                return cs;
            
            var states = this.stateStack;
            var i = states.length - 1;
            while (i >= 0 && !(cs = states[i].strokeColorSpace))
                --i;

            if (cs)
                return cs;
            else
                return new DeviceRgbCS();
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
    function constructor() {
        error("should not call ColorSpace constructor");
    };

    constructor.parse = function colorspace_parse(cs, xref, res) {
        if (IsName(cs)) {
            var colorSpaces = res.get("ColorSpace");
            if (colorSpaces) {
                var refcs = colorSpaces.get(cs.name);
                if (refcs)
                    cs = refcs;
            }
        }
            
        cs = xref.fetchIfRef(cs);

        if (IsName(cs)) {
            var mode = cs.name;
            this.mode = mode;

            switch(mode) {
            case "DeviceGray":
            case "G":
                return new DeviceGrayCS();
                break;
            case "DeviceRGB":
            case "RGB":
                return new DeviceRgbCS();
                break;
            case "DeviceCMYK":
            case "CMYK":
                return new DeviceCmykCS();
                break;
            case "Pattern":
                return new PatternCS(null);
                break;
            default:
                error("unrecognized colorspace " + mode);
            }
        } else if (IsArray(cs)) {
            var mode = cs[0].name;
            this.mode = mode;

            switch (mode) {
            case "DeviceGray":
            case "G":
                return new DeviceGrayCS();
                break;
            case "DeviceRGB":
            case "RGB":
                return new DeviceRgbCS();
                break;
            case "DeviceCMYK":
            case "CMYK":
                return new DeviceCmykCS();
                break;
            case "CalGray":
                return new DeviceGrayCS();
                break;
            case "CalRGB":
                return new DeviceRgbCS();
                break;
            case "ICCBased":
                var stream = xref.fetchIfRef(cs[1]);
                var dict = stream.dict;
                var numComps = dict.get("N");
                if (numComps == 1)
                    return new DeviceGrayCS();
                else if (numComps == 3)
                    return new DeviceRgbCS();
                else if (numComps == 4)
                    return new DeviceCmykCS();
                break;
            case "Pattern":
                return new PatternCS();
                break;
            case "Indexed":
                var base = ColorSpace.parse(cs[1], xref, res);
                var hiVal = cs[2];
                var lookup = xref.fetchIfRef(cs[3]);
                return new IndexedCS(base, hiVal, lookup);
            case "Lab":
            case "Seperation":
            case "DeviceN":
            default:
                error("unrecognized color space object '"+ mode +"'");
            }
        } else {
            error("unrecognized color space object");
        }
    };

    return constructor;
})();

var PatternCS = (function() {
    function constructor() {
        this.name = "Pattern";
    }
    constructor.prototype = {};
  
    return constructor;
})();

var IndexedCS = (function() {
    function constructor(base, highVal, lookup) {
        this.name = "Indexed";
        this.numComps = 1;
        this.defaultColor = [0];

        this.base = base;
        var baseNumComps = base.numComps;
        this.highVal = highVal;

        var length = baseNumComps * highVal;
        var lookupArray = new Uint8Array(length);
        if (IsStream(lookup)) {
            var bytes = lookup.getBytes(length);
            lookupArray.set(bytes);
        } else if (IsString(lookup)) {
            for (var i = 0; i < length; ++i)
                lookupArray[i] = lookup.charCodeAt(i);
        } else {
            error("Unrecognized lookup table");
        }
        this.lookup = lookupArray;
    }

    constructor.prototype = {
        getRgb: function graycs_getRgb(color) {
            var lookup = this.lookup;
            var base = this.base;
            var numComps = base.numComps;
            
            var c = [];
            for (var i = 0; i < numComps; ++i)
                c.push(lookup[i])
            return this.base.getRgb(c);
        },
        getRgbBuffer: function graycs_getRgbBuffer(input) {
            var base = this.base;
            var numComps = base.numComps;
            var lookup = this.lookup;
            var length = input.length;

            var baseBuf = new Uint8Array(length * numComps);
            var baseBufPos = 0;
            for (var i = 0; i < length; ++i) {
                var lookupPos = input[i];
                for (var j = 0; j < numComps ; ++j) {
                    baseBuf[baseBufPos++] = lookup[lookupPos + j];
                }
            }
            
            return base.getRgbBuffer(baseBuf);
        }
    };
    return constructor;
})();

var DeviceGrayCS = (function() {
    function constructor() {
        this.name = "DeviceGray";
        this.numComps = 1;
        this.defaultColor = [0];
    };

    constructor.prototype = {
        getRgb: function graycs_getRgb(color) {
            var c = color[0];
            return [c, c, c];
        },
        getRgbBuffer: function graycs_getRgbBuffer(input) {
            var length = input.length;
            var rgbBuf = new Uint8Array(length);
            for (var i = 0, j = 0; i < length; ++i) {
                var c = input[i];
                rgbBuf[j++] = c;
                rgbBuf[j++] = c;
                rgbBuf[j++] = c;
            }
            return rgbBuf;
        }
    };
    return constructor;
})();

var DeviceRgbCS = (function() {
    function constructor() {
        this.name = "DeviceRGB";
        this.numComps = 3;
        this.defaultColor = [0, 0, 0];
    }
    constructor.prototype = {
        getRgb: function graycs_getRgb(color) {
            return color;
        },
        getRgbBuffer: function graycs_getRgbBuffer(input) {
            return input;
        }
    };
    return constructor;
})();

var DeviceCmykCS = (function() {
    function constructor() {
        this.name = "DeviceCMYK";
        this.numComps = 4;
        this.defaultColor = [0, 0, 0, 1];
    }
    constructor.prototype = {
        getRgb: function graycs_getRgb(color) {
            var c = color[0], y = color[1], m = color[2], k = color[3];
            var ri = (1 - Math.min(1, c * (1 - k) + k)) | 0;
            var gi = (1 - Math.min(1, m * (1 - k) + k)) | 0;
            var bi = (1 - Math.min(1, y * (1 - k) + k)) | 0;
            return [ri, gi, bi];
        },
        getRgbBuffer: function graycs_getRgbBuffer(colorBuf) {
            error("conversion from rgb to cmyk not implemented for images");
            return colorBuf;
        }
    };
    return constructor;
})();

var PDFImage = (function() {
    function constructor(xref, res, image, inline) {
        this.image = image;
        if (image.getParams) {
            // JPX/JPEG2000 streams directly contain bits per component
            // and color space mode information.
            TODO("get params from actual stream");
            // var bits = ...
            // var colorspace = ...
        }
        // TODO cache rendered images?

        var dict = image.dict;
        this.width = dict.get2("Width", "W");
        this.height = dict.get2("Height", "H");

        if (this.width < 1 || this.height < 1)
            error("Invalid image width or height");

        this.interpolate = dict.get2("Interpolate", "I") || false;
        this.imageMask = dict.get2("ImageMask", "IM") || false;

        var bitsPerComponent = image.bitsPerComponent;
        if (!bitsPerComponent) {
            bitsPerComponent = dict.get2("BitsPerComponent", "BPC");
            if (!bitsPerComponent) {
                if (this.imageMask)
                    bitsPerComponent = 1;
                else
                    error("Bits per component missing in image");
            }
        }
        this.bpc = bitsPerComponent;

        var colorSpace = dict.get2("ColorSpace", "CS");
        this.colorSpace = ColorSpace.parse(colorSpace, xref, res);

        this.numComps = this.colorSpace.numComps;
        this.decode = dict.get2("Decode", "D");

        var mask = xref.fetchIfRef(image.dict.get("Mask"));
        var smask = xref.fetchIfRef(image.dict.get("SMask"));

        if (mask) {
            TODO("masked images");
        } else if (smask) {
            this.smask = new PDFImage(xref, res, smask);
        }
    };
    
    constructor.prototype = {
        getComponents: function getComponents(buffer) {
            var bpc = this.bpc;
            if (bpc == 8)
                return buffer;

            var width = this.width;
            var height = this.height;
            var numComps = this.numComps;
        
            var length = width * height;
            var bufferPos = 0;
            var output = new Uint8Array(length);

            if (bpc == 1) {
                var rowComps = width * numComps;
                var mask = 0;
                var buf = 0;
                
                for (var i = 0, ii = length; i < ii; ++i) {
                    if (i % rowComps == 0) {
                        mask = 0;
                        buf = 0;
                    } else {
                        mask >>= 1;
                    }

                    if (mask <= 0) {
                        buf = buffer[bufferPos++];
                        mask = 128;
                    }

                    var t = buf & mask;
                    if (t == 0)
                        output[i] = 0;
                    else
                        output[i] = 255;
                }
            } else {
                var rowComps = width * numComps;
                var bits = 0;
                var buf = 0;

                for (var i = 0, ii = length; i < ii; ++i) {
                    while (bits < bpc) {
                        buf = (buf << 8) | buffer[bufferPos++];
                        bits += 8;
                    }
                    var remainingBits = bits - bpc;
                    var ret = buf >> remainingBits;
                    
                    if (i % rowComps == 0) {
                        buf = 0;
                        bits = 0;
                    } else {
                        buf = buf & ((1 << remainingBits) - 1);
                        bits = remainingBits;
                    }
                    output[i] = Math.round(255 * ret / ((1 << bpc) - 1));
                }
            }
            return this.colorSpace.getRbaBuffer(output);
        },
        getOpacity: function getOpacity() {
            var smask = this.smask;
            var width = this.width;
            var height = this.height;
            var buf = new Uint8Array(width * height);
            
            if (smask) {
                var sw = smask.width;
                var sh = smask.height;
                if (sw != this.width || sh != this.height)
                    error("smask dimensions do not match image dimensions");
                
                smask.fillGrayBuffer(buf);
                return buf;
            } else {
                for (var i = 0, ii = width * height; i < ii; ++i)
                    buf[i] = 255;
            }
            return buf;
        },
        fillRgbaBuffer: function fillRgbaBuffer(buffer) {
            var numComps = this.numComps;
            var width = this.width;
            var height = this.height;
            var bpc = this.bpc;

            // rows start at byte boundary;
            var rowBytes = (width * numComps * bpc + 7) >> 3;
            var imgArray = this.image.getBytes(height * rowBytes);
            
            var comps = this.getComponents(imgArray);
            var compsPos = 0;
            var opacity = this.getOpacity();
            var opacityPos = 0;
            var length = width * height * 4;

            switch (numComps) {
                case 1:
                    for (var i = 0; i < length; i += 4) {
                        var p = comps[compsPos++];
                        buffer[i] = p;
                        buffer[i+1] = p;
                        buffer[i+2] = p;
                        buffer[i+3] = opacity[opacityPos++];
                    }
                    break;
                case 3:
                    for (var i = 0; i < length; i += 4) {
                        buffer[i] = comps[compsPos++];
                        buffer[i+1] = comps[compsPos++];
                        buffer[i+2] = comps[compsPos++];
                        buffer[i+3] = opacity[opacityPos++];
                    }
                    break;
                default:
                    TODO("Images with "+ numComps + " components per pixel");
            }
        },
        fillGrayBuffer: function fillGrayBuffer(buffer) {
            var numComps = this.numComps;
            if (numComps != 1)
                error("Reading gray scale from a color image");

            var width = this.width;
            var height = this.height;
            var bpc = this.bpc;

            // rows start at byte boundary;
            var rowBytes = (width * numComps * bpc + 7) >> 3;
            var imgArray = this.image.getBytes(height * rowBytes);
            
            var comps = this.getComponents(imgArray);
            var length = width * height;

            for (var i = 0; i < length; ++i)
                buffer[i] = comps[i];
        },
    };
    return constructor;
})();

var PDFFunction = (function() {
    function constructor(xref, fn) {
        var dict = fn.dict;
        if (!dict)
           dict = fn;

        var types = [this.constructSampled,
                       null,
                       this.constructInterpolated,
                       this.constructStiched,
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
