/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- /
/* vim: set shiftwidth=4 tabstop=8 autoindent cindent expandtab: */

function warn(msg) {
    if (console && console.log)
        console.log(msg);
    if (print)
        print(msg);
}

function error(msg) {
    throw new Error(msg);
}

var Stream = (function() {
    function constructor(arrayBuffer) {
        this.bytes = Uint8Array(arrayBuffer);
        this.pos = 0;
        this.start = 0;
    }

    constructor.prototype = {
        get length() {
            return this.bytes.length;
        },
        reset: function() {
            this.pos = this.start;
        },
        getByte: function() {
            var bytes = this.bytes;
            if (this.pos >= bytes.length)
                return -1;
            return bytes[this.pos++];
        },
        lookChar: function() {
            var bytes = this.bytes;
            if (this.pos >= bytes.length)
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
            if (!n)
                n = 1;
            this.pos += n;
        },
        moveStart: function() {
            this.start = this.pos;
        },
        makeSubStream: function(pos, length) {
            var buffer = this.bytes.buffer;
            if (length)
                return new Stream(new Uint8Array(buffer, pos, length));
            return new Stream(new Uint8Array(buffer, pos));
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
    const codeLenCodeMap = [
        16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15
    ];

    const lengthDecode = [
        [0,   3],
        [0,   4],
        [0,   5],
        [0,   6],
        [0,   7],
        [0,   8],
        [0,   9],
        [0,  10],
        [1,  11],
        [1,  13],
        [1,  15],
        [1,  17],
        [2,  19],
        [2,  23],
        [2,  27],
        [2,  31],
        [3,  35],
        [3,  43],
        [3,  51],
        [3,  59],
        [4,  67],
        [4,  83],
        [4,  99],
        [4, 115],
        [5, 131],
        [5, 163],
        [5, 195],
        [5, 227],
        [0, 258],
        [0, 258],
        [0, 258]
    ];

    const fixedLitCodeTab = [[
        [7, 0x0100],
        [8, 0x0050],
        [8, 0x0010],
        [8, 0x0118],
        [7, 0x0110],
        [8, 0x0070],
        [8, 0x0030],
        [9, 0x00c0],
        [7, 0x0108],
        [8, 0x0060],
        [8, 0x0020],
        [9, 0x00a0],
        [8, 0x0000],
        [8, 0x0080],
        [8, 0x0040],
        [9, 0x00e0],
        [7, 0x0104],
        [8, 0x0058],
        [8, 0x0018],
        [9, 0x0090],
        [7, 0x0114],
        [8, 0x0078],
        [8, 0x0038],
        [9, 0x00d0],
        [7, 0x010c],
        [8, 0x0068],
        [8, 0x0028],
        [9, 0x00b0],
        [8, 0x0008],
        [8, 0x0088],
        [8, 0x0048],
        [9, 0x00f0],
        [7, 0x0102],
        [8, 0x0054],
        [8, 0x0014],
        [8, 0x011c],
        [7, 0x0112],
        [8, 0x0074],
        [8, 0x0034],
        [9, 0x00c8],
        [7, 0x010a],
        [8, 0x0064],
        [8, 0x0024],
        [9, 0x00a8],
        [8, 0x0004],
        [8, 0x0084],
        [8, 0x0044],
        [9, 0x00e8],
        [7, 0x0106],
        [8, 0x005c],
        [8, 0x001c],
        [9, 0x0098],
        [7, 0x0116],
        [8, 0x007c],
        [8, 0x003c],
        [9, 0x00d8],
        [7, 0x010e],
        [8, 0x006c],
        [8, 0x002c],
        [9, 0x00b8],
        [8, 0x000c],
        [8, 0x008c],
        [8, 0x004c],
        [9, 0x00f8],
        [7, 0x0101],
        [8, 0x0052],
        [8, 0x0012],
        [8, 0x011a],
        [7, 0x0111],
        [8, 0x0072],
        [8, 0x0032],
        [9, 0x00c4],
        [7, 0x0109],
        [8, 0x0062],
        [8, 0x0022],
        [9, 0x00a4],
        [8, 0x0002],
        [8, 0x0082],
        [8, 0x0042],
        [9, 0x00e4],
        [7, 0x0105],
        [8, 0x005a],
        [8, 0x001a],
        [9, 0x0094],
        [7, 0x0115],
        [8, 0x007a],
        [8, 0x003a],
        [9, 0x00d4],
        [7, 0x010d],
        [8, 0x006a],
        [8, 0x002a],
        [9, 0x00b4],
        [8, 0x000a],
        [8, 0x008a],
        [8, 0x004a],
        [9, 0x00f4],
        [7, 0x0103],
        [8, 0x0056],
        [8, 0x0016],
        [8, 0x011e],
        [7, 0x0113],
        [8, 0x0076],
        [8, 0x0036],
        [9, 0x00cc],
        [7, 0x010b],
        [8, 0x0066],
        [8, 0x0026],
        [9, 0x00ac],
        [8, 0x0006],
        [8, 0x0086],
        [8, 0x0046],
        [9, 0x00ec],
        [7, 0x0107],
        [8, 0x005e],
        [8, 0x001e],
        [9, 0x009c],
        [7, 0x0117],
        [8, 0x007e],
        [8, 0x003e],
        [9, 0x00dc],
        [7, 0x010f],
        [8, 0x006e],
        [8, 0x002e],
        [9, 0x00bc],
        [8, 0x000e],
        [8, 0x008e],
        [8, 0x004e],
        [9, 0x00fc],
        [7, 0x0100],
        [8, 0x0051],
        [8, 0x0011],
        [8, 0x0119],
        [7, 0x0110],
        [8, 0x0071],
        [8, 0x0031],
        [9, 0x00c2],
        [7, 0x0108],
        [8, 0x0061],
        [8, 0x0021],
        [9, 0x00a2],
        [8, 0x0001],
        [8, 0x0081],
        [8, 0x0041],
        [9, 0x00e2],
        [7, 0x0104],
        [8, 0x0059],
        [8, 0x0019],
        [9, 0x0092],
        [7, 0x0114],
        [8, 0x0079],
        [8, 0x0039],
        [9, 0x00d2],
        [7, 0x010c],
        [8, 0x0069],
        [8, 0x0029],
        [9, 0x00b2],
        [8, 0x0009],
        [8, 0x0089],
        [8, 0x0049],
        [9, 0x00f2],
        [7, 0x0102],
        [8, 0x0055],
        [8, 0x0015],
        [8, 0x011d],
        [7, 0x0112],
        [8, 0x0075],
        [8, 0x0035],
        [9, 0x00ca],
        [7, 0x010a],
        [8, 0x0065],
        [8, 0x0025],
        [9, 0x00aa],
        [8, 0x0005],
        [8, 0x0085],
        [8, 0x0045],
        [9, 0x00ea],
        [7, 0x0106],
        [8, 0x005d],
        [8, 0x001d],
        [9, 0x009a],
        [7, 0x0116],
        [8, 0x007d],
        [8, 0x003d],
        [9, 0x00da],
        [7, 0x010e],
        [8, 0x006d],
        [8, 0x002d],
        [9, 0x00ba],
        [8, 0x000d],
        [8, 0x008d],
        [8, 0x004d],
        [9, 0x00fa],
        [7, 0x0101],
        [8, 0x0053],
        [8, 0x0013],
        [8, 0x011b],
        [7, 0x0111],
        [8, 0x0073],
        [8, 0x0033],
        [9, 0x00c6],
        [7, 0x0109],
        [8, 0x0063],
        [8, 0x0023],
        [9, 0x00a6],
        [8, 0x0003],
        [8, 0x0083],
        [8, 0x0043],
        [9, 0x00e6],
        [7, 0x0105],
        [8, 0x005b],
        [8, 0x001b],
        [9, 0x0096],
        [7, 0x0115],
        [8, 0x007b],
        [8, 0x003b],
        [9, 0x00d6],
        [7, 0x010d],
        [8, 0x006b],
        [8, 0x002b],
        [9, 0x00b6],
        [8, 0x000b],
        [8, 0x008b],
        [8, 0x004b],
        [9, 0x00f6],
        [7, 0x0103],
        [8, 0x0057],
        [8, 0x0017],
        [8, 0x011f],
        [7, 0x0113],
        [8, 0x0077],
        [8, 0x0037],
        [9, 0x00ce],
        [7, 0x010b],
        [8, 0x0067],
        [8, 0x0027],
        [9, 0x00ae],
        [8, 0x0007],
        [8, 0x0087],
        [8, 0x0047],
        [9, 0x00ee],
        [7, 0x0107],
        [8, 0x005f],
        [8, 0x001f],
        [9, 0x009e],
        [7, 0x0117],
        [8, 0x007f],
        [8, 0x003f],
        [9, 0x00de],
        [7, 0x010f],
        [8, 0x006f],
        [8, 0x002f],
        [9, 0x00be],
        [8, 0x000f],
        [8, 0x008f],
        [8, 0x004f],
        [9, 0x00fe],
        [7, 0x0100],
        [8, 0x0050],
        [8, 0x0010],
        [8, 0x0118],
        [7, 0x0110],
        [8, 0x0070],
        [8, 0x0030],
        [9, 0x00c1],
        [7, 0x0108],
        [8, 0x0060],
        [8, 0x0020],
        [9, 0x00a1],
        [8, 0x0000],
        [8, 0x0080],
        [8, 0x0040],
        [9, 0x00e1],
        [7, 0x0104],
        [8, 0x0058],
        [8, 0x0018],
        [9, 0x0091],
        [7, 0x0114],
        [8, 0x0078],
        [8, 0x0038],
        [9, 0x00d1],
        [7, 0x010c],
        [8, 0x0068],
        [8, 0x0028],
        [9, 0x00b1],
        [8, 0x0008],
        [8, 0x0088],
        [8, 0x0048],
        [9, 0x00f1],
        [7, 0x0102],
        [8, 0x0054],
        [8, 0x0014],
        [8, 0x011c],
        [7, 0x0112],
        [8, 0x0074],
        [8, 0x0034],
        [9, 0x00c9],
        [7, 0x010a],
        [8, 0x0064],
        [8, 0x0024],
        [9, 0x00a9],
        [8, 0x0004],
        [8, 0x0084],
        [8, 0x0044],
        [9, 0x00e9],
        [7, 0x0106],
        [8, 0x005c],
        [8, 0x001c],
        [9, 0x0099],
        [7, 0x0116],
        [8, 0x007c],
        [8, 0x003c],
        [9, 0x00d9],
        [7, 0x010e],
        [8, 0x006c],
        [8, 0x002c],
        [9, 0x00b9],
        [8, 0x000c],
        [8, 0x008c],
        [8, 0x004c],
        [9, 0x00f9],
        [7, 0x0101],
        [8, 0x0052],
        [8, 0x0012],
        [8, 0x011a],
        [7, 0x0111],
        [8, 0x0072],
        [8, 0x0032],
        [9, 0x00c5],
        [7, 0x0109],
        [8, 0x0062],
        [8, 0x0022],
        [9, 0x00a5],
        [8, 0x0002],
        [8, 0x0082],
        [8, 0x0042],
        [9, 0x00e5],
        [7, 0x0105],
        [8, 0x005a],
        [8, 0x001a],
        [9, 0x0095],
        [7, 0x0115],
        [8, 0x007a],
        [8, 0x003a],
        [9, 0x00d5],
        [7, 0x010d],
        [8, 0x006a],
        [8, 0x002a],
        [9, 0x00b5],
        [8, 0x000a],
        [8, 0x008a],
        [8, 0x004a],
        [9, 0x00f5],
        [7, 0x0103],
        [8, 0x0056],
        [8, 0x0016],
        [8, 0x011e],
        [7, 0x0113],
        [8, 0x0076],
        [8, 0x0036],
        [9, 0x00cd],
        [7, 0x010b],
        [8, 0x0066],
        [8, 0x0026],
        [9, 0x00ad],
        [8, 0x0006],
        [8, 0x0086],
        [8, 0x0046],
        [9, 0x00ed],
        [7, 0x0107],
        [8, 0x005e],
        [8, 0x001e],
        [9, 0x009d],
        [7, 0x0117],
        [8, 0x007e],
        [8, 0x003e],
        [9, 0x00dd],
        [7, 0x010f],
        [8, 0x006e],
        [8, 0x002e],
        [9, 0x00bd],
        [8, 0x000e],
        [8, 0x008e],
        [8, 0x004e],
        [9, 0x00fd],
        [7, 0x0100],
        [8, 0x0051],
        [8, 0x0011],
        [8, 0x0119],
        [7, 0x0110],
        [8, 0x0071],
        [8, 0x0031],
        [9, 0x00c3],
        [7, 0x0108],
        [8, 0x0061],
        [8, 0x0021],
        [9, 0x00a3],
        [8, 0x0001],
        [8, 0x0081],
        [8, 0x0041],
        [9, 0x00e3],
        [7, 0x0104],
        [8, 0x0059],
        [8, 0x0019],
        [9, 0x0093],
        [7, 0x0114],
        [8, 0x0079],
        [8, 0x0039],
        [9, 0x00d3],
        [7, 0x010c],
        [8, 0x0069],
        [8, 0x0029],
        [9, 0x00b3],
        [8, 0x0009],
        [8, 0x0089],
        [8, 0x0049],
        [9, 0x00f3],
        [7, 0x0102],
        [8, 0x0055],
        [8, 0x0015],
        [8, 0x011d],
        [7, 0x0112],
        [8, 0x0075],
        [8, 0x0035],
        [9, 0x00cb],
        [7, 0x010a],
        [8, 0x0065],
        [8, 0x0025],
        [9, 0x00ab],
        [8, 0x0005],
        [8, 0x0085],
        [8, 0x0045],
        [9, 0x00eb],
        [7, 0x0106],
        [8, 0x005d],
        [8, 0x001d],
        [9, 0x009b],
        [7, 0x0116],
        [8, 0x007d],
        [8, 0x003d],
        [9, 0x00db],
        [7, 0x010e],
        [8, 0x006d],
        [8, 0x002d],
        [9, 0x00bb],
        [8, 0x000d],
        [8, 0x008d],
        [8, 0x004d],
        [9, 0x00fb],
        [7, 0x0101],
        [8, 0x0053],
        [8, 0x0013],
        [8, 0x011b],
        [7, 0x0111],
        [8, 0x0073],
        [8, 0x0033],
        [9, 0x00c7],
        [7, 0x0109],
        [8, 0x0063],
        [8, 0x0023],
        [9, 0x00a7],
        [8, 0x0003],
        [8, 0x0083],
        [8, 0x0043],
        [9, 0x00e7],
        [7, 0x0105],
        [8, 0x005b],
        [8, 0x001b],
        [9, 0x0097],
        [7, 0x0115],
        [8, 0x007b],
        [8, 0x003b],
        [9, 0x00d7],
        [7, 0x010d],
        [8, 0x006b],
        [8, 0x002b],
        [9, 0x00b7],
        [8, 0x000b],
        [8, 0x008b],
        [8, 0x004b],
        [9, 0x00f7],
        [7, 0x0103],
        [8, 0x0057],
        [8, 0x0017],
        [8, 0x011f],
        [7, 0x0113],
        [8, 0x0077],
        [8, 0x0037],
        [9, 0x00cf],
        [7, 0x010b],
        [8, 0x0067],
        [8, 0x0027],
        [9, 0x00af],
        [8, 0x0007],
        [8, 0x0087],
        [8, 0x0047],
        [9, 0x00ef],
        [7, 0x0107],
        [8, 0x005f],
        [8, 0x001f],
        [9, 0x009f],
        [7, 0x0117],
        [8, 0x007f],
        [8, 0x003f],
        [9, 0x00df],
        [7, 0x010f],
        [8, 0x006f],
        [8, 0x002f],
        [9, 0x00bf],
        [8, 0x000f],
        [8, 0x008f],
        [8, 0x004f],
        [9, 0x00ff]
    ], 9];

    const fixedDistCodeTab = [[
        [5, 0x0000],
        [5, 0x0010],
        [5, 0x0008],
        [5, 0x0018],
        [5, 0x0004],
        [5, 0x0014],
        [5, 0x000c],
        [5, 0x001c],
        [5, 0x0002],
        [5, 0x0012],
        [5, 0x000a],
        [5, 0x001a],
        [5, 0x0006],
        [5, 0x0016],
        [5, 0x000e],
        [0, 0x0000],
        [5, 0x0001],
        [5, 0x0011],
        [5, 0x0009],
        [5, 0x0019],
        [5, 0x0005],
        [5, 0x0015],
        [5, 0x000d],
        [5, 0x001d],
        [5, 0x0003],
        [5, 0x0013],
        [5, 0x000b],
        [5, 0x001b],
        [5, 0x0007],
        [5, 0x0017],
        [5, 0x000f],
        [0, 0x0000]
    ], 5];

    function constructor() {
        this.reset();
    }

    constructor.prototype = {
        reset: function() {
            stream.reset();
            this.eof = true;
            var cmf = stream.getByte();
            var flg = stream.getByte();
            if (cmf == -1 || flg == -1)
                return;
            if ((cmd & 0x0f) != 0x08)
                error("Unknown compression method in flate stream");
            if ((((cmf << 8) + flg) % 31) != 0)
                error("Bad FCHECK in flate stream");
            if (flg & 0x20)
                error("FDICT bit set in flate stream");
            this.eof = false;
            this.codeSize = 0;
            this.codeBuf = 0;
            this.pos = 0;
        },
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
            var codes = table.codes;
            var maxLen = table.maxLen;
            var codeSize = this.codeSize;
            var codeBuf = this.codeBuf;
            while (codeSize < maxlen) {
                var b;
                if ((b = stream.getByte()) == -1)
                    error("Bad encoding in flate stream");
                codeBuf |= (b << codeSize);
                codeSize += 8;
            }
            var code = table.codes[codeBuf & ((1 << table.maxLen) - 1)];
            var codeLen = code[0];
            var codeVal = code[1];
            if (codeSize == 0|| codeSize < codeLen || codeLen == 0)
                error("Bad encoding in flate stream");
            this.codeBuf = (codeBuf >> codeLen);
            this.codeLen = (codeLen - codeLen);
            return codeVal;
        },
        ensureBuffer: function(requested, copy) {
            var buffer = this.buffer;
            var current = buffer ? buffer.byteLength : 0;
            if (current < requested)
                return buffer;
            var size = 512;
            while (size < requested)
                size <<= 1;
            var buffer2 = new Uint8Array(size);
            if (copy) {
                for (var i = 0; i < current; ++i)
                    buffer2[i] = buffer[i];
            }
            return this.buffer = buffer2;
        },
        lookChar: function() {
            var bufferLength = this.bufferLength;
            var bufferPos = this.bufferPos;
            if (bufferLength == bufferPos) {
                if (this.eof)
                    return;
                this.readBlock();
            }
            return String.fromChar(this.buffer[bufferPos]);
        },
        getChar: function() {
            var ch = this.lookChar();
            if (!ch)
                return;
            this.pos++;
            this.bufferPos++;
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
            var size = 1 << max;
            var codes = new Array(size);
            for (var len = 1, code = 0, skip = 2;
                 len < maxLen;
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
                            codes[i] = [len, val];

                        ++code;
                    }
                }
            }

            return { codes: codes, maxLen: maxLen };
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
                var buffer = this.ensureBuffer(blockLen);
                this.bufferLength = blockLen;
                this.bufferPos = 0;
                for (var n = 0; n < blockLen; ++n) {
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
                while (i < codeLenCodeMap.length)
                    codeLenCodeLengths[i++] = 0;
                var codeLenCodeTab = this.generateHuffmanTable(codeLenCodeLengths);

                // built the literal and distance code tables
                var len = 0;
                var i = 0;
                var codes = numLitCodes + numDistCodes;
                var codeLengths = new Array(codes);
                while (i < codes) {
                    function repeat(array, i, len, offset, what) {
                        var repeat = this.getBits(len) + offset;
                        while (repeat-- > 0)
                            array[i++] = what;
                    }
                    var code = this.getCode(codeLenCodeTab);
                    if (code == 16) {
                        repeat(codeLengths, i, 2, 3, len);
                    } else if (code == 17) {
                        repeat(codeLengths, i, 3, 3, len = 0);
                    } else if (code == 18) {
                        repeat(codeLengths, i, 7, 11, len = 0);
                    } else {
                        codeLenths[i++] = len = code;
                    }
                }

                litCodeTable = this.generateHuffmanTable(codeLengths.slice(0, numLitCodes));
                distCodeTable = this.generateHuffmanTable(codeLengths.slice(numDistCodes, codes));
            } else {
                error("Unknown block type in flate stream");
            }

            var pos = 0;
            while (true) {
                var code1 = this.getCode(litCodeTable);
                if (code1 == 256) {
                    this.bufferLength = pos;
                    this.bufferPos = 0;
                    return;
                }
                if (code1 < 256) {
                    var buffer = this.ensureBuffer(pos + 1);
                    buffer[pos++] = code1;
                } else {
                    code1 -= 257;
                    var code2 = lengthDecode[code1][0];
                    if (code2 > 0)
                        code2 = this.getBits(code2);
                    var len = lengthDecode[code1][1] + code2;
                    code1 = this.getCode(distCodeTable);
                    code2 = distDecode[code1][0];
                    if (code2 > 0)
                        code2 = this.getBits(code2);
                    var dist = distDecode[code1][1] + code2;
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
            return this.map[key];
        },
        set: function(key, value) {
            this.map[key] = value;
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
    return v == null;
}

function IsName(v) {
    return v instanceof Name;
}

function IsCmd(v, cmd) {
    return v instanceof Cmd && (!cmd || v.cmd == cmd);
}

function IsDict(v) {
    return v instanceof Dict;
}

function IsArray(v) {
    return v instanceof Array;
}

function IsStream(v) {
    return v instanceof Stream;
}

function IsRef(v) {
    return v instanceof Ref;
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
        getString: function(ch) {
            var n = 0;
            var numParent = 1;
            var done = false;
            var str = ch;
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
                        str += c;
                        break;
                    case '0': case '1': case '2': case '3':
                    case '4': case '5': case '6': case '7':
                        var x = ch - '0';
                        ch = stream.lookChar();
                        if (ch >= '0' && ch <= '7') {
                            this.skip();
                            x = (x << 3) + (x - '0');
                            ch = stream.lookChar();
                            if (ch >= '0' && ch <= '7') {
                                stream.skip();
                                x = (x << 3) + (x - '0');
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
                } else if (!ch) {
                    warn("Unterminated hex string");
                    break;
                } else if (specialChars[ch.charCodeAt(0)] != 1) {
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
                return this.getString(ch);
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
	        // fall through
            case ')':
            case '{':
            case '}':
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
    function constructor(lexer, allowStreams) {
        this.lexer = lexer;
        this.allowStreams = allowStreams;
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
            var length;
            if (!IsInt(length = dict.get("Length"))) {
                error("Bad 'Length' attribute in stream");
                lenght = 0;
            }

            // skip over the stream data
            stream.pos = pos + length;
            this.shift(); // '>>'
            this.shift(); // 'stream'
            if (!IsCmd(this.buf1, "endstream"))
                error("Missing 'endstream'");
            this.shift();

            stream = stream.makeSubStream(pos, length);
            if (this.fileKey) {
                stream = new DecryptStream(stream,
                                           this.fileKey,
                                           this.encAlgorithm,
                                           this.keyLength);
            }
            return this.filter(stream, dict);
        },
        filter: function(stream, dict) {
            var filter = dict.get("Filter") || dict.get("F");
            var params = dict.get("DecodeParms") || dict.get("DP");
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
            print(name);
            for (i in params.map)
                print(i + ": " + params.map[i]);
            // TODO
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
        this.cache = Object.create(null);
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
                var parser = new Parser(new Lexer(stream));
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
                return this.cache[num] = parser.getObj();
            }
            error("compressed entry");
        },
        getCatalogObj: function() {
            return this.fetch(this.root);
        }
    };

    return constructor;
})();

var Catalog = (function() {
    function constructor(xref) {
        this.xref = xref;
        var obj = xref.getCatalogObj();
        if (!IsDict(obj))
            error("catalog object is not a dictionary");
        this.catDict = obj;
    }

    constructor.prototype = {
        get pagesDict() {
            var obj = this.catDict.get("Pages");
            if (!IsRef(obj))
                error("invalid top-level pages reference");
            var obj = this.xref.fetch(obj);
            if (!IsDict(obj))
                error("invalid top-level pages dictionary");
            // shadow the prototype getter
            return this.pagesDict = obj;
        },
        get numPages() {
            obj = this.pagesDict.get("Count");
            if (!IsInt(obj))
                error("page count in top level pages object is not an integer");
            // shadow the prototype getter
            return this.numPages = obj;
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
        var length = stream.length;
        var pos = stream.pos;
        var str = "";
        if (pos + limit > length)
            limit = length - pos;
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
            return this.linearization = linearization;
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
                var start = stream.length - 1024;
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
            return this.startXRef = startXRef;
        },
        get mainXRefEntriesOffset() {
            var mainXRefEntriesOffset = 0;
            var linearization = this.linearization;
            if (linearization)
                mainXRefEntriesOffset = linearization.mainXRefEntriesOffset;
            // shadow the prototype getter with a data property
            return this.mainXRefEntriesOffset = mainXRefEntriesOffset;
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
            // overwrite the prototype getter
            return this.numPages = num;
        },
        getPage: function(page) {
            print(this.numPages);
            // TODO
        }
    };

    return constructor;
})();

var Interpreter = (function() {
    function constructor(xref, resources, catalog, gfx) {
        this.xref = xref;
        this.res = resources;
        this.catalog = catalog;
        this.gfx = gfx;
        var env = this;
        this.map = {
            // Graphics state
            w: gfx.setLineWidth,
            J: gfx.setLineCap,
            j: gfx.setLineJoin,
            d: gfx.setDash,
            ri: gfx.setRenderingIntent,
            i: gfx.setFlatness,
            q: gfx.save,
            Q: gfx.restore,
            cm: gfx.transform,

            // Path
            m: gfx.moveTo,
            l: gfx.lineTo,
            c: gfx.curveTo,
            h: gfx.closePath,
            re: gfx.rectangle,
            S: gfx.stroke,
            f: gfx.fill,
            "f*": gfx.eoFill,
            B: gfx.fillStroke,
            b: gfx.closeFillStroke,
            n: gfx.endPath,

            // Clipping
            W: gfx.clip,
            "W*": gfx.eoClip,

            // Text
            BT: gfx.beginText,
            ET: gfx.endText,
            Tf: function(fontRef, size) {
                var font = env.res.Font[fontRef.name]
                gfx.setFont(font, size);
            },
            Td: gfx.moveText,
            Tm: gfx.setTextMatrix,
            Tj: gfx.showText,
            TJ: gfx.showSpacedText,

            // Type3 fonts

            // Color
            CS: gfx.setStrokeColorSpace,
            cs: gfx.setFillColorSpace,
            SC: gfx.setStrokeColor,
            SCN: gfx.setStrokeColorN,
            sc: gfx.setFillColor,
            scn: gfx.setFillColorN,
            g: gfx.setFillGray,
            RG: gfx.setStrokeRGBColor,
            rg: gfx.setFillRGBColor,

            // Shading
            sh: gfx.shadingFill,

            // Images
            // XObjects
            Do: gfx.paintXObject,

            // Marked content
            // Compatibility
        };
    }

    constructor.prototype = {
        compile: function(parser) {
        },
        interpret: function(obj) {
            return this.interpretHelper(new Parser(new Lexer(obj), true));
        },
        interpretHelper: function(mediaBox, parser) {
            this.gfx.beginDrawing({ x: mediaBox[0], y: mediaBox[1],
                                    width: mediaBox[2] - mediaBox[0],
                                    height: mediaBox[3] - mediaBox[1] });
            var args = [];
            var gfx = this.gfx;
            var map = this.map;
            var obj;
            while (!IsEOF(obj = parser.getObj())) {
                if (IsCmd(obj)) {
                    var cmd = obj.cmd;
                    var fn = map[cmd];
                    if (fn)
                        // TODO figure out how to type-check vararg functions
                        fn.apply(gfx, args);
                    else
                        error("Unknown command '" + cmd + "'");
                    args.length = 0;
                } else {
                    if (args.length > 33)
                        error("Too many arguments '" + cmd + "'");
                    args.push(obj);
                }
            }
            this.gfx.endDrawing();
        }
    };

    return constructor;
})();

var EchoGraphics = (function() {
    function constructor() {
        this.out = "";
        this.indentation = 0;
        this.indentationStr = "";
    }

    constructor.prototype = {
        beginDrawing: function(mediaBox) {
            this.printdentln("/MediaBox ["+
                             mediaBox.x +" "+ mediaBox.y +" "+
                             mediaBox.width +" "+ mediaBox.height +" ]");
        },
        endDrawing: function() {
        },

        // Graphics state
        setLineWidth: function(width) {
            this.printdentln(width +" w");
        },
        setLineCap: function(style) {
            this.printdentln(style +" J");
        },
        setLineJoin: function(style) {
            this.printdentln(style +" j");
        },
        setDash: function(dashArray, dashPhase) {
            this.printdentln(""+ dashArray +" "+ dashPhase +" d");
        },
        setRenderingIntent: function(intent) {
            this.printdentln("/"+ intent.name + " ri");
        },
        setFlatness: function(flatness) {
            this.printdentln(""+ flatness +" i");
        },
        save: function() {
            this.printdentln("q");
        },
        restore: function() {
            this.printdentln("Q");
        },
        transform: function(a, b, c, d, e, f) {
            this.printdentln(""+ a +" "+ b +" "+ c +
                             " "+d +" "+ e +" "+ f + " cm");
        },

        // Path
        moveTo: function(x, y) {
            this.printdentln(""+ x +" "+ y +" m");
        },
        lineTo: function(x, y) {
            this.printdentln(""+ x +" "+ y +" l");
        },
        curveTo: function(x1, y1, x2, y2, x3, y3) {
            this.printdentln(""+ x1 +" "+ y1 +
                             " "+ x2 +" "+ y2 +
                             " "+ x3 +" "+ y3 + " c");
        },
        closePath: function() {
            this.printdentln("h");
        },
        rectangle: function(x, y, width, height) {
            this.printdentln(""+ x +" "+ y + " "+ width +" "+ height +" re");
        },
        stroke: function() {
            this.printdentln("S");
        },
        fill: function() {
            this.printdentln("f");
        },
        eoFill: function() {
            this.printdentln("f*");
        },
        fillStroke: function() {
            this.printdentln("B");
        },
        closeFillStroke: function() {
            this.printdentln("b");
        },
        endPath: function() {
            this.printdentln("n");
        },

        // Clipping
        clip: function() {
            this.printdentln("W");
        },
        eoClip: function() {
            this.printdentln("W*");
        },

        // Text
        beginText: function() {
            this.printdentln("BT");
            this.indent();
        },
        endText: function() {
            this.dedent();
            this.printdentln("ET");
        },
        setFont: function(font, size) {
            this.printdentln("/"+ font.name +" "+ size +" Tf");
        },
        moveText: function (x, y) {
            this.printdentln(""+ x +" "+ y +" Td");
        },
        setTextMatrix: function(a, b, c, d, e, f) {
            this.printdentln(""+ a +" "+ b +" "+ c +
                             " "+d +" "+ e +" "+ f + " Tm");
        },
        showText: function(text) {
            this.printdentln("( "+ text +" ) Tj");
        },
        showSpacedText: function(arr) {
            this.printdentln(""+ arr +" TJ");
        },

        // Type3 fonts

        // Color
        setStrokeColorSpace: function(space) {
            this.printdentln("/"+ space.name +" CS");
        },
        setFillColorSpace: function(space) {
            this.printdentln("/"+ space.name +" cs");
        },
        setStrokeColor: function(/*...*/) {
            this.printdent("");
            for (var i = 0; i < arguments.length; ++i)
                this.print(""+ arguments[i] +" ");
            this.printdentln("SC");
        },
        setStrokeColorN: function(/*...*/) {
            this.printdent("");
            for (var i = 0; i < arguments.length; ++i)
                this.print(""+ arguments[i] +" ");
            this.printdentln("SCN");
        },
        setFillColor: function(/*...*/) {
            this.printdent("");
            for (var i = 0; i < arguments.length; ++i)
                this.print(""+ arguments[i] +" ");
            this.printdentln("sc");
        },
        setFillColorN: function(/*...*/) {
            this.printdent("");
            for (var i = 0; i < arguments.length; ++i)
                this.print(""+ arguments[i] +" ");
            this.printdentln("scn");
        },
        setFillGray: function(gray) {
            this.printdentln(""+ gray +" g");
        },
        setStrokeRGBColor: function(r, g, b) {
            this.printdentln(""+ r +" "+ g +" "+ b +" RG");
        },
        setFillRGBColor: function(r, g, b) {
            this.printdentln(""+ r +" "+ g +" "+ b +" rg");
        },

        // Shading
        shadingFill: function(entry) {
            this.printdentln("/"+ entry.name +" sh");
        },

        // Images
        // XObjects
        paintXObject: function(obj) {
            this.printdentln("/"+ obj.name +" Do");
        },

        // Marked content
        // Compatibility

        // Output state
        print: function(str) {
            this.out += str;
        },
        println: function(str) {
            this.print(str);
            this.out += "\n";
        },
        printdent: function(str) {
            this.print(this.indentationStr);
            this.print(str);
        },
        printdentln: function(str) {
            this.printdent(str);
            this.println("");
        },
        indent: function() {
            this.indentation += 2;
            this.indentationStr += "  ";
        },
        dedent: function() {
            this.indentation -= 2;
            this.indentationStr = this.indentationStr.slice(0, -2);
        },
    };

    return constructor;
})();

// <canvas> contexts store most of the state we need natively.
// However, PDF needs a bit more state, which we store here.
var CanvasExtraState = (function() {
    function constructor() {
        this.fontSize = 0.0;
        // Current point (in user coordinates)
        this.curX = 0.0;
        this.curY = 0.0;
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
    }

    var LINE_CAP_STYLES = [ "butt", "round", "square" ];
    var LINE_JOIN_STYLES = [ "miter", "round", "bevel" ];
    var NORMAL_CLIP = {};
    var EO_CLIP = {};

    constructor.prototype = {
        beginDrawing: function(mediaBox) {
            var cw = this.ctx.canvas.width, ch = this.ctx.canvas.height;
            this.ctx.save();
            this.ctx.scale(cw / mediaBox.width, -ch / mediaBox.height);
            this.ctx.translate(0, -mediaBox.height);
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
        setDash: function(dashArray, dashPhase) {
            // TODO
        },
        setRenderingIntent: function(intent) {
            // TODO
        },
        setFlatness: function(flatness) {
            // TODO
        },
        save: function() {
            this.ctx.save();
            this.stateStack.push(this.current);
            this.current = new CanvasExtraState();
        },
        restore: function() {
            this.current = this.stateStack.pop();
            this.ctx.restore();
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
        fill: function() {
            this.ctx.fill();
            this.consumePath();
        },
        eoFill: function() {
            // TODO: <canvas> needs to support even-odd winding rule
            this.fill();
        },
        fillStroke: function() {
            this.ctx.fill();
            this.ctx.stroke();
            this.consumePath();
        },
        closeFillStroke: function() {
            return this.fillStroke();
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
            // TODO
        },
        endText: function() {
            // TODO
        },
        setFont: function(font, size) {
            this.current.fontSize = size;
            this.ctx.font = this.current.fontSize +'px '+ font.BaseFont;
        },
        moveText: function (x, y) {
            this.current.lineX += x;
            this.current.lineY += y;
            // TODO transform
            this.current.curX = this.current.lineX;
            this.current.curY = this.current.lineY;
        },
        setTextMatrix: function(a, b, c, d, e, f) {
            // TODO
        },
        showText: function(text) {
            this.ctx.save();
            this.ctx.translate(0, 2 * this.current.curY);
            this.ctx.scale(1, -1);

            this.ctx.fillText(text, this.current.curX, this.current.curY);
            this.current.curX += this.ctx.measureText(text).width;

            this.ctx.restore();
        },
        showSpacedText: function(arr) {
            for (var i = 0; i < arr.length; ++i) {
                var e = arr[i];
                if (IsNum(e)) {
                    this.current.curX -= e * 0.001 * this.current.fontSize;
                } else if (IsString(e)) {
                    this.showText(e);
                } else {
                    error("Unexpected element in TJ array");
                }
            }
        },

        // Type3 fonts

        // Color
        setStrokeColorSpace: function(space) {
            // TODO
        },
        setFillColorSpace: function(space) {
            // TODO
        },
        setStrokeColor: function(/*...*/) {
            // TODO
        },
        setStrokeColorN: function(/*...*/) {
            // TODO
        },
        setFillColor: function(/*...*/) {
            // TODO
        },
        setFillColorN: function(/*...*/) {
            // TODO
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

        // Shading
        shadingFill: function(entry) {
            // TODO
        },

        // XObjects
        paintXObject: function(obj) {
            // TODO
        },

        // Helper functions

        consumePath: function() {
            if (this.pendingClip) {
                // TODO: <canvas> needs to support even-odd winding rule
                this.ctx.clip();
                this.pendingClip = null;
            }
            this.ctx.beginPath();
        },
        makeCssRgb: function(r, g, b) {
            var ri = (255 * r) | 0, gi = (255 * g) | 0, bi = (255 * b) | 0;
            return "rgb("+ ri +","+ gi +","+ bi +")";
        },
    };

    return constructor;
})();

//var PostscriptGraphics
//var SVGGraphics

var MockParser = (function() {
    function constructor(objs) {
        this.objs = objs.slice(0);
    }

    constructor.prototype = {
        getObj: function() {
            return this.objs.shift();
        }
    };

    return constructor;
})();

function cmd(c)     { return new Cmd(c); }
function name(n)    { return new Name(n); }
function int(i)     { return i; }
function string(s)  { return s; }
function eof()      { return EOF; }
function array(a)   { return a; }
function real(r)    { return r; }

var tests = [
    { name: "Hello world",
      res: {
          // XXX not structured correctly
          Font: {
              F1: { Type: "Font",
                    Subtype: "Type1",
                    Name: "F1",
                    BaseFont: "Helvetica",
                    Encoding: "MacRomanEncoding"
              },
          }
      },
      mediaBox: [ 0, 0, 612, 792 ],
      objs: [
          cmd("BT"),
          name("F1"), int(24), cmd("Tf"),
          int(100), int(100), cmd("Td"),
          string("Hello World"), cmd("Tj"),
          cmd("ET"),
          eof()
      ]
    },
    { name: "Simple graphics",
      res: { },
      mediaBox: [ 0, 0, 612, 792 ],
      objs: [
          int(150), int(250), cmd("m"),
          int(150), int(350), cmd("l"),
          cmd("S"),

          int(4), cmd("w"),
          array([int(4), int(6)]), int(0), cmd("d"),
          int(150), int(250), cmd("m"),
          int(400), int(250), cmd("l"),
          cmd("S"),
          array([]), int(0), cmd("d"),
          int(1), cmd("w"),

          real(1.0), real(0.0), real(0.0), cmd("RG"),
          real(0.5), real(0.75), real(1.0), cmd("rg"),
          int(200), int(300), int(50), int(75), cmd("re"),
          cmd("B"),

          real(0.5), real(0.1), real(0.2), cmd("RG"),
          real(0.7), cmd("g"),
          int(300), int(300), cmd("m"),
          int(300), int(400), int(400), int(400), int(400), int(300), cmd("c"),
          cmd("b"),
          eof()
      ]
    },
    { name: "Heart",
      res: { },
      mediaBox: [ 0, 0, 612, 792 ],
      objs: [
          cmd("q"),
          real(0.9), real(0.0), real(0.0), cmd("rg"),
          int(75), int(40), cmd("m"),
          int(75), int(37), int(70), int(25), int(50), int(25), cmd("c"),
          int(20), int(25), int(20), real(62.5), int(20), real(62.5), cmd("c"),
          int(20), int(80), int(40), int(102), int(75), int(120), cmd("c"),
          int(110), int(102), int(130), int(80), int(130), real(62.5), cmd("c"),
          int(130), real(62.5), int(130), int(25), int(100), int(25), cmd("c"),
          int(85), int(25), int(75), int(37), int(75), int(40), cmd("c"),
          cmd("f"),
          cmd("Q"),
          eof()
      ]
    },
    { name: "Rectangle",
      res: { },
      mediaBox: [ 0, 0, 612, 792 ],
      objs: [
          int(1), int(0), int(0), int(1), int(80), int(80), cmd("cm"),
          int(0), int(72), cmd("m"),
          int(72), int(0), cmd("l"),
          int(0), int(-72), cmd("l"),
          int(-72), int(0), cmd("l"),
          int(4), cmd("w"),
          cmd("h"), cmd("S"),
          eof()
      ]
    },
    { name: "TJ",
      res: {
          // XXX not structured correctly
          Font: {
              F1: { Type: "Font",
                    Subtype: "Type1",
                    Name: "F1",
                    BaseFont: "Georgia",
                    Encoding: "MacRomanEncoding"
              },
          }
      },
      mediaBox: [ 0, 0, 612, 792 ],
      objs: [
          cmd("BT"),
          name("F1"), real(17.9328), cmd("Tf"),

          real(80.5159), real(700.6706), cmd("Td"),
          [ string("Trace-based Just-in-Time") ], cmd("TJ"),

          int(0), int(-18), cmd("Td"),
          [ string("T"), int(74), string("race-based"), int(-250), string("J"), int(15), string("ust-in-T"), int(18), string("ime") ], cmd("TJ"),
          cmd("ET"),
          eof()
      ]
    },
    { name: "Line cap",
      res: { },
      mediaBox: [ 0, 0, 612, 792 ],
      objs: [
          int(5), cmd("w"),

          int(0), cmd("J"),         // butt cap
          int(100), int(692), cmd("m"),
          int(200), int(692), cmd("l"),
          cmd("S"),

          int(1), cmd("J"),         // round cap
          int(100), int(686), cmd("m"),
          int(200), int(686), cmd("l"),
          cmd("S"),

          int(2), cmd("J"),         // projecting square cap
          int(100), int(680), cmd("m"),
          int(200), int(680), cmd("l"),
          cmd("S"),

          eof()
      ],
    },
    { name: "Line join",
      res: { },
      mediaBox: [ 0, 0, 612, 792 ],
      objs: [
          int(20), cmd("w"),

          int(0), cmd("j"),         // miter join
          int(100), int(692), cmd("m"),
          int(150), int(642), cmd("l"),
          int(200), int(692), cmd("l"),
          cmd("S"),

          int(1), cmd("j"),         // round join
          int(250), int(692), cmd("m"),
          int(300), int(642), cmd("l"),
          int(350), int(692), cmd("l"),
          cmd("S"),

          int(2), cmd("j"),         // bevel join
          int(400), int(692), cmd("m"),
          int(450), int(642), cmd("l"),
          int(500), int(692), cmd("l"),
          cmd("S"),

          eof()
      ],
    },
    { name: "NYI",              // check that NYI commands are no-ops
      res: { },
      mediaBox: [ 0, 0, 612, 792 ],
      objs: [
          name("Perceptual"), cmd("ri"),
          int(2), cmd("i"),
          int(1), int(0), int(0), int(1), int(80), int(80), cmd("Tm"),
          name("DeviceRGB"), cmd("CS"),
          name("DeviceGray"), cmd("cs"),
          int(1), int(0), int(0), cmd("SC"),
          int(1), int(0), int(0), cmd("SCN"),
          int(1), cmd("sc"),
          int(1), cmd("scn"),
          name("object"), cmd("Do"),
          name("shading"), cmd("sh"),
          eof()
     ],
    },
    { name: "Broken heart",
      res: { },
      mediaBox: [ 0, 0, 612, 792 ],
      objs: [
          cmd("q"),
          int(20), int(20), int(60), int(60), cmd("re"),
          int(60), int(60), int(60), int(60), cmd("re"),
          cmd("W"), cmd("n"),

          real(0.9), real(0.0), real(0.0), cmd("rg"),
          int(75), int(40), cmd("m"),
          int(75), int(37), int(70), int(25), int(50), int(25), cmd("c"),
          int(20), int(25), int(20), real(62.5), int(20), real(62.5), cmd("c"),
          int(20), int(80), int(40), int(102), int(75), int(120), cmd("c"),
          int(110), int(102), int(130), int(80), int(130), real(62.5), cmd("c"),
          int(130), real(62.5), int(130), int(25), int(100), int(25), cmd("c"),
          int(85), int(25), int(75), int(37), int(75), int(40), cmd("c"),
          cmd("f"),
          cmd("Q"),
          eof()
      ]
    },
];

    
function runEchoTests() {
    tests.forEach(function(test) {
        putstr("Running echo test '"+ test.name +"'... ");

        var output = "";
        var gfx = new EchoGraphics(output);
        var i = new Interpreter(null, test.res, null, gfx);
        i.interpretHelper(test.mediaBox, new MockParser(test.objs));

        print("done.  Output:");
        print(gfx.out);
    });
}

function runParseTests() {
    //var data = snarf("simple_graphics.pdf", "binary");
    var data = snarf("/tmp/paper.pdf", "binary");
    var pdf = new PDFDoc(new Stream(data));
    pdf.getPage(1);
}

if ("arguments" in this) {
    const cmds = {
        "-e": runEchoTests,
        "-p": runParseTests
    }
    for (n in arguments) {
        var fn = cmds[arguments[n]];
        if (fn)
            fn();
    }
}
