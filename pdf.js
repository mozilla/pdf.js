/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- /
/* vim: set shiftwidth=4 tabstop=8 autoindent cindent expandtab: */

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
        putBack: function() {
            this.pos--;
        },
        skipChar: function() {
            this.pos++;
        },
        skip: function(n) {
            this.pos += n;
        },
        moveStart: function() {
            this.start = this.pos;
        },
        find: function(needle, limit, backwards) {
            var length = this.bytes.length;
            var pos = this.pos;
            var str = "";
            if (pos + limit > length)
                limit = length - pos;
            for (var n = 0; n < limit; ++n)
                str += this.getChar();
            this.pos = pos;
            var index = backwards ? str.lastIndexOf(needle) : str.indexOf(needle);
            if (index == -1)
                return false; /* not found */
            this.pos += index;
            return true; /* found */
        },
        asString: function() {
            var str = "";
            var ch;
            while (!!(ch = this.getChar()))
                str += ch;
            return str;
        },
        makeSubStream: function(pos, length) {
            return new Stream(new Uint8Array(this.bytes, pos, length));
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

var Buffer = (function() {
    function constructor(length) {
        this.bytes = new Uint8Array(length ? length : 4096);
        this.pos = 0;
    }

    constructor.prototype = {
        putByte: function(b) {
            var bytes = this.bytes;
            var length = bytes.length;
            if (this.pos >= length) {
                var newBytes = new Uint8Array(length * 2);
                for (var n = 0; n < length; ++n)
                    newBytes[n] = bytes[n];
                bytes = newBytes;
            }
            bytes[this.pos++] = b;
        },
        asStream: function() {
            return new Stream(this.bytes);
        }
    }

    return constructor;
})();

var FlateStream = (function() {
    const codeLenCodeMap = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5,
                            11, 4, 12, 3, 13, 2, 14, 1, 15];

    function constructor(str, pred, columns, colors, bits) {
    }
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
    function constructor(num, ref) {
        this.num = num;
        this.ref = ref;
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

var Error = {};

function IsError(v) {
    return v == Error;
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
        error: function(msg) {
            // TODO
            print(msg);
        },
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
                    this.error("Badly formated number");
                } else if (ch >= "0" && ch <= "9") {
                    str += ch;
                } else if (ch == "e" || ch == "E") {
                    floating = true;
                } else {
                    // the last character doesn't belong to us
                    break;
                }
                stream.getChar();
            } while (true);
            var value = parseFloat(str);
            if (isNaN(value))
                return Error;
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
                    this.error("Unterminated string");
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
                        this.error("Unterminated string");
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
                            this.getChar();
                            x = (x << 3) + (x - '0');
                            ch = stream.lookChar();
                            if (ch >= '0' && ch <= '7') {
                                stream.getChar();
                                x = (x << 3) + (x - '0');
                            }
                        }
                        str += String.fromCharCode(x);
                        break;
                    case '\r':
                        ch = stream.lookChar();
                        if (ch == '\n')
                            stream.getChar();
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
                stream.getChar();
                if (ch == "#") {
                    ch = stream.lookChar();
                    var x = ToHexDigit(ch);
                    if (x != -1) {
                        stream.getChar();
                        var x2 = ToHexDigit(stream.getChar());
                        if (x2 == -1)
                            this.error("Illegal digit in hex char in name");
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
                this.error("Warning: name token is longer than allowed by the specification");
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
                    this.error("Unterminated hex string");
                    break;
                } else if (specialChars[ch.charCodeAt(0)] != 1) {
                    var x, x2;
                    if (((x = ToHexDigit(ch)) == -1) ||
                        ((x2 = ToHexDigit(stream.getChar())) == -1)) {
                        this.error("Illegal character in hex string");
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
                    stream.getChar();
                    return new Cmd("<<");
                }
	            return this.getHexString(ch);
            // dict punctuation
            case '>':
	            ch = stream.lookChar();
	            if (ch == '>') {
                    stream.getChar();
                    return new Cmd(">>");
                }
	        // fall through
            case ')':
            case '{':
            case '}':
                this.error("Illegal character");
                return Error;
            }

            // command
            var str = ch;
            while (!!(ch = stream.lookChar()) && !specialChars[ch.charCodeAt(0)]) {
                stream.getChar();
                if (str.length == 128) {
                    this.error("Command token too long");
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
                        stream.getChar();
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
                this.lexer.skipChar();		// skip char after 'ID' command
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
                    this.error("End of file inside array");
                this.shift();
                return array;
            } else if (IsCmd(this.buf1, "<<")) { // dictionary or stream
                this.shift();
                var dict = new Dict();
                while (!IsCmd(this.buf1, ">>") && !IsEOF(this.buf1)) {
                    if (!IsName(this.buf1)) {
                        this.error("Dictionary key must be a name object");
                        shift();
                    } else {
                        var key = this.buf1.name;
                        this.shift();
                        if (IsEOF(this.buf1) || IsError(this.buf1))
                            break;
                        dict.set(key, this.getObj());
                    }
                }
                if (IsEOF(this.buf1))
                    this.error("End of file inside dictionary");

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
                    str = decrypt.asString();
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
                this.error("Bad 'Length' attribute in stream");
                lenght = 0;
            }

            // skip over the stream data
            stream.pos = pos + length;
            this.shift(); // '>>'
            this.shift(); // 'stream'
            if (!IsCmd(this.buf1, "endstream"))
                this.error("Missing 'endstream'");
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
                        this.error("Bad filter name");
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
            this.error("'" + name + "' field in linearization table is invalid");
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
            this.error("Hints table in linearization table is invalid");
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
    }

    constructor.prototype = {
        readXRefTable: function(parser) {
            var obj;
            while (true) {
                if (IsCmd(obj = parser.getObj(), "trailer"))
                    break;
                if (!IsInt(obj))
                    return false;
                var first = obj;
                if (!IsInt(obj = parser.getObj()))
                    return false;
                var n = obj;
                if (first < 0 || n < 0 || (first + n) != ((first + n) | 0))
                    return false;
                for (var i = first; i < first + n; ++i) {
                    var entry = {};
                    if (!IsInt(obj = parser.getObj()))
                        return false;
                    entry.offset = obj;
                    if (!IsInt(obj = parser.getObj()))
                        return false;
                    entry.gen = obj;
                    obj = parser.getObj();
                    if (IsCmd(obj, "n")) {
                        entry.uncompressed = true;
                    } else if (IsCmd(obj, "f")) {
                        entry.free = true;
                    } else {
                        return false;
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
                return false;

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
            if (!this.trailer)
                this.trailer = dict;

            // check for 'XRefStm' key
            if (IsInt(obj = dict.get("XRefStm"))) {
                var pos = obj;
                if (pos in this.xrefstms)
                    return false;
                this.xrefstms[pos] = 1; // avoid infinite recursion
                this.readXRef(pos);
            } else {
                this.ok = true;
            }

            return more;
        },
        readXRefStream: function(parser) {
            // TODO
            this.ok = true;
            return true;
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
                    return false;
                }
                return this.readXRefStream(obj);
            }
            return false;
        }
    };

    return constructor;
})();

var PDFDoc = (function() {
    function constructor(stream) {
        this.stream = stream;
        this.setup();
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
                if (stream.find("endobj", 1024))
                    startXRef = stream.pos + 6;
            } else {
                // Find startxref at the end of the file.
                var start = stream.length - 1024;
                if (start < 0)
                    start = 0;
                stream.pos = start;
                if (stream.find("startxref", 1024, true)) {
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
            if (stream.find("%PDF-", 1024)) {
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
            this.ok = this.xref.ok;
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
            d: gfx.setDash,
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
            B: gfx.fillStroke,
            b: gfx.closeFillStroke,

            // Clipping

            // Text
            BT: gfx.beginText,
            ET: gfx.endText,
            Tf: function(fontRef, size) {
                var font = env.res.Font[fontRef.name]
                gfx.setFont(font, size);
            },
            Td: gfx.moveText,
            Tj: gfx.showText,

            // Type3 fonts

            // Color
            g: gfx.setFillGray,
            RG: gfx.setStrokeRGBColor,
            rg: gfx.setFillRGBColor,

            // Shading
            // Images
            // XObjects
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
                    if (fn) {
                        if (fn.length != args.length)
                            this.error("Invalid number of arguments '" + cmd + "'");
                        fn.apply(gfx, args);
                    } else
                        this.error("Unknown command '" + cmd + "'");
                    args.length = 0;
                } else {
                    if (args.length > 33)
                        this.error("Too many arguments '" + cmd + "'");
                    args.push(obj);
                }
            }
            this.gfx.endDrawing();
        },
        error: function(what) {
            throw new Error(what);
        },
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
        setDash: function(dashArray, dashPhase) {
            this.printdentln(""+ dashArray +" "+ dashPhase +" d");
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
        fillStroke: function() {
            this.printdentln("B");
        },
        closeFillStroke: function() {
            this.printdentln("b");
        },

        // Clipping

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
        showText: function(text) {
            this.printdentln("( "+ text +" ) Tj");
        },

        // Type3 fonts

        // Color
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
        // Images
        // XObjects
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
        printdentln: function(str) {
            this.print(this.indentationStr);
            this.println(str);
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
        // Current text position (in text coordinates)
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
    }

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
        setDash: function(dashArray, dashPhase) {
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
        fillStroke: function() {
            this.ctx.fill();
            this.ctx.stroke();
            this.consumePath();
        },
        closeFillStroke: function() {
            return this.fillStroke();
        },

        // Clipping

        // Text
        beginText: function() {
            // TODO
        },
        endText: function() {
            // TODO
        },
        setFont: function(font, size) {
            this.ctx.font = size +'px '+ font.BaseFont;
        },
        moveText: function (x, y) {
            this.current.lineX = x;
            this.current.lineY = y;
        },
        showText: function(text) {
            this.ctx.save();
            this.ctx.translate(0, 2 * this.current.lineY);
            this.ctx.scale(1, -1);

            this.ctx.fillText(text, this.current.lineX, this.current.lineY);

            this.ctx.restore();
        },

        // Type3 fonts

        // Color
        setFillGray: function(gray) {
            this.setFillRGBColor(gray, gray, gray);
        },
        setStrokeRGBColor: function(r, g, b) {
            this.ctx.strokeStyle = this.makeCssRgb(r, g, b);
        },
        setFillRGBColor: function(r, g, b) {
            this.ctx.fillStyle = this.makeCssRgb(r, g, b);
        },

        // Helper functions

        consumePath: function() {
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
    var data = snarf("/tmp/pdf_reference_1-7.pdf", "binary");
    var pdf = new PDFDoc(new Stream(data));
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
