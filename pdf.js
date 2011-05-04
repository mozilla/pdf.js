/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- /
/* vim: set shiftwidth=4 tabstop=8 autoindent cindent expandtab: */

var HashMap = (function() {
    function constructor() {
    }

    constructor.prototype = {
        get: function(key) {
            return this["$" + key];
        },
        set: function(key, value) {
            this["$" + key] = value;
        },
        contains: function(key) {
            return ("$" + key) in this;
        }
    };

    return constructor;
})();

var Stream = (function() {
    function constructor(arrayBuffer) {
        this.bytes = Uint8Array(arrayBuffer);
        this.pos = 0;
    }

    constructor.prototype = {
        reset: function() {
            this.pos = 0;
        },
        lookChar: function() {
            var bytes = this.bytes;
            if (this.pos >= bytes.length)
                return;
            return String.fromCharCode(bytes[this.pos]);
        },
        getChar: function() {
            var ch = this.lookChar();
            this.pos++;
            return ch;
        },
        putBack: function() {
            this.pos--;
        },
        skipChar: function() {
            this.pos++;
        },
        moveStart: function(delta) {
            this.bytes = Uint8Array(arrayBuffer, delta);
            this.pos -= delta;
        }
    };

    return constructor;
});

var Obj = (function() {
    function constructor(type, value) {
        this.type = type;
        this.value = value;
    }

    constructor.prototype = {
    };

    var types = [
                 "Bool", "Int", "Real", "String", "Name", "Null",
                 "Array", "Dict", "Stream", "Ref",
                 "Cmd", "Error", "EOF", "None"
                ];

    for (var i = 0; i < types.length; ++i) {
        let type = i;
        var typeName = types[type];
        constructor[typeName] = type;
        constructor.prototype["is" + typeName] =
            (function (value) {
                return this.type == type &&
                       (typeof value == "undefined" || value == this.value);
            });
    }

    constructor.prototype.isNum = function(value) {
        return this.isInt(value) || this.isReal(value);
    }
    constructor.prototype.lookup = function(key) {
        function lookup(key) {
            if (!(this.value.contains(key)))
                return Obj.nullObj;
            return this.value.get(key);
        }
    }

    constructor.trueObj = new constructor(constructor.Bool, true);
    constructor.falseObj = new constructor(constructor.Bool, false);
    constructor.nullObj = new constructor(constructor.Null);
    constructor.errorObj = new constructor(constructor.Error);

    return constructor;
})();

var Lexer = (function() {
    function constructor(stream) {
        this.stream = stream;
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
        },
        getNumber: function(ch) {
            var floating = false;
            var str = ch;
            var stream = this.stream;
            do {
                ch = stream.getChar();
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
                    // put back the last character, it doesn't belong to us
                    stream.putBack();
                    break;
                }
            } while (true);
            var value = parseNumber(str);
            if (isNaN(value))
                return Obj.errorObj;
            if (floating) {
                type = Obj.Floating;
            } else {
                if (value >= MIN_INT && value <= MAX_INT)
                    type = Obj.Int;
                else if (value >= MAX_UINT && value <= MAX_UINT)
                    type = Obj.Uint;
                else
                    return Obj.errorObj;
            }
            return new Obj(type, value);
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
                return new Obj(Obj.EOF);
            return new Obj(Obj.String, str);
        },
        getName: function(ch) {
            var str = "";
            var stream = this.stream;
            while (!!(ch = stream.lookChar()) && !specialChars[ch.toCharCode()]) {
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
            return new Obj(Obj.Name, str);
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
                } else if (specialChars[ch.toCharCode()] != 1) {
                    var x, x2;
                    if (((x = ToHexDigit(ch)) == -1) ||
                        ((x2 = ToHexDigit(this.getChar())) == -1)) {
                        error("Illegal character in hex string");
                        break;
                    }
                    str += String.fromCharCode((x << 4) | x2);
                }
            }
            return new Obj(Obj.String, str);
        },
        getObj: function() {
            // skip whitespace and comments
            var comment = false;
            var stream = this.stream;
            while (true) {
                var ch;
                if (!(ch = stream.getChar()))
                    return new Obj(Object.EOF);
                if (comment) {
                    if (ch == '\r' || ch == '\n')
                        comment = false;
                } else if (ch == '%') {
                    comment = true;
                } else if (specialChars[ch.chatCodeAt(0)] != 1) {
                    break;
                }
            }
            
            // start reading token
            switch (c) {
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
	            return new Obj(Obj.Cmd, ch);
            // hex string or dict punctuation
            case '<':
	            ch = stream.lookChar();
                if (ch == '<') {
                    // dict punctuation
                    stream.getChar();
                    return new Obj(Obj.Cmd, ch);
                }
	            return this.getHexString(ch);
            // dict punctuation
            case '>':
	            ch = stream.lookChar();
	            if (ch == '>') {
                    stream.getChar();
                    return new Obj(Obj.Cmd, ch);
                }
	        // fall through
            case ')':
            case '{':
            case '}':
                this.error("Illegal character");
	            return Obj.errorObj;
            }

            // command
            var str = ch;
            while (!!(ch = stream.lookChar()) && !specialChars[ch.toCharCode()]) {
                stream.getChar();
                if (str.length == 128) {
                    error("Command token too long");
                    break;
                }
                str += ch;
            }
            if (str == "true")
                return Obj.trueObj;
            if (str == "false")
                return Obj.falseObj;
            if (str == "null")
                return Obj.nullObj;
            return new Obj(Obj.Cmd, str);
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
            this.buf1 = lexer.getObj();
            this.buf2 = lexer.getObj();
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
            } else if (this.buf2.isCmd("ID")) {
                this.lexer.skipChar();		// skip char after 'ID' command
                this.inlineImg = 1;
            }
            this.buf1 = this.buf2;
            // don't buffer inline image data
            this.buf2 = (this.inlineImg > 0) ? Obj.nullObj : this.lexer.getObj();
        },
        getObj: function() {
            // refill buffer after inline image data
            if (this.inlineImg == 2)
                this.refill();

            if (this.buf1.isCmd("[")) { // array
                var obj = new Obj(Obj.Array, []);
                while (!this.buf1.isCmd("]") && !this.buf1.isEOF())
                    obj.value.push(this.getObj());
                if (this.buf1.isEOF())
                    this.error("End of file inside array");
                this.shift();
                return obj;
            } else if (this.buf1.isCmd("<<")) { // dictionary or stream
                this.shift();
                var obj = new Obj(Obj.Dict, new HashMap());
                while (!this.buf1.isCmd(">>") && !this.buf1.isEOF()) {
                    if (!this.buf1.isName()) {
                        error("Dictionary key must be a name object");
                        shift();
                    } else {
                        var key = buf1.value;
                        this.shift();
                        if (this.buf1.isEOF() || this.buf1.isError())
                            break;
                        obj.value.set(key, this.getObj());
                    }
                }
                if (this.buf1.isEOF())
                    error("End of file inside dictionary");

                // stream objects are not allowed inside content streams or
                // object streams
                if (this.allowStreams && this.buf2.isCmd("stream")) {
                    return this.makeStream();
                } else {
                    this.shift();
                }
                return obj;

            } else if (this.buf1.isInt()) { // indirect reference or integer
                var num = this.buf1.value;
                this.shift();
                if (this.buf1.isInt() && this.buf2.isCmd("R")) {
                    var obj = new Obj(Obj.Ref, [num, this.buf1.value]);
                    this.shift();
                    this.shift();
                    return obj;
                }
                return new Obj(Obj.Int, num);
            } else if (this.buf1.isString()) { // string
                var obj = this.decrypt(this.buf1);
                this.shift();
                return obj;
            }
	
            // simple object
            var obj = this.buf1;
            this.shift();
            return obj;
        },
        decrypt: function(obj) {
            // TODO
            return obj;
        },
        makeStream: function() {
            // TODO
            return new Obj(Obj.Error);
        }
    };

    return constructor;
})();
    
var Linearization = (function () {
    function constructor(stream) {
        this.parser = new Parser(new Lexer(stream), false);
        var obj1 = this.parser.getObj();
        var obj2 = this.parser.getObj();
        var obj3 = this.parser.getObj();
        this.linDict = this.parser.getObj();
        if (obj1.isInt() && obj2.isInt() && obj3.isCmd("obj") && linDict.isDict()) {
            var obj = linDict.lookup("Linearized");
            if (!(obj.isNum() && obj.value > 0))
                this.linDict = Obj.nullObj;
        }
    }

    constructor.prototype = {
        getInt: function(name) {
            var linDict = this.linDict;
            var obj;
            if (!linDict.isDict() &&
                (obj = linDict.lookup(name)).isInt() &&
                obj.value > 0) {
                return length;
            }
            error("'" + name + "' field in linearization table is invalid");
            return 0;
        },
        getHint: function(index) {
            var linDict = this.linDict;
            var obj1, obj2;
            if (linDict.isDict() &&
                (obj1 = linDict.lookup("H")).isArray() &&
                obj1.value.length >= 2 &&
                (obj2 = obj1.value[index]).isInt() &&
                obj2.value > 0) {
                return obj2.value;
            }
            this.error("Hints table in linearization table is invalid");
            return 0;
        },
        get length() {
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
})();

var PDFDoc = (function () {
    function constructor(stream) {
        this.setup(stream);
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
            // shadow the prototype getter
            return this.linearization = linearization;
        },
        get startXRef() {
            var startXRef;
            var linearization = this.linearization;
            if (linearization) {
                // TODO
            } else {
                // TODO
            }
            // shadow the prototype getter
            return this.startXRef = startXRef;
        },
        // Find the header, remove leading garbage and setup the stream
        // starting from the header.
        checkHeader: function(stream) {
            const headerSearchSize = 1024;

            stream.reset();

            var skip = 0;
            var header = "%PDF-";
            while (skip < headerSearchSize) {
                stream.setPos(skip);
                for (var i = 0; i < header.length; ++i) {
                    if (stream.getChar() != header.charCodeAt(i))
                        break;
                }
                
                // Found the header, trim off any garbage before it.
                if (i == header.length) {
                    stream.moveStart(skip);
                    return;
                }
            }

            // May not be a PDF file, continue anyway.
            this.stream = stream;
        },
        setup: function(arrayBuffer, ownerPassword, userPassword) {
            this.checkHeader(arrayBuffer);
        }
    };
})();

var Interpreter = (function() {
    function constructor(xref, resources, catalog, graphics) {
        this.xref = xref;
        this.resStack = [ resources ];
        this.catalog = catalog;
        this.gfx = graphics;
    }

    const MAX_ARGS = 33;

    constructor.prototype = {
        interpret: function(obj) {
            return this.interpretHelper(new Parser(new Lexer(obj), true));
        },
        interpretHelper: function(parser) {
            var args = [ ];
            var obj;
            while (!((obj = parser.getObj()).isEOF())) {
                if (obj.isCmd()) {
                    this.dispatch(obj, args);
                    args = [ ]; // yuck
                } else if (MAX_ARGS == args.length) {
                    this.error("Too many arguments");
                } else {
                    args.push(obj);
                }
            }
        },

        dispatch: function(cmdObj, args) {
            var fnName = this.getAndCheckCmd(cmdObj, args);
            this.gfx[fnName].apply(this.gfx, args.map(function(o) o.value));
        },
        getAndCheckCmd: function(cmdObj, args) {
            const CMD_TABLE = {
                // Graphics state
                "w" : { fn: "setLineWidth",
                        params: [ "Num" ] },
                "d" : { fn: "setDash",
                        params: [ "Array", "Num" ] },
                "q" : { fn: "save",
                        params: [ ] },
                "Q" : { fn: "restore",
                        params: [ ] },
                // Path
                "m" : { fn: "moveTo",
                        params: [ "Num", "Num" ] },
                "l" : { fn: "lineTo",
                        params: [ "Num", "Num" ] },
                "c" : { fn: "curveTo",
                        params: [ "Num", "Num", "Num", "Num", "Num", "Num" ] },
                "re": { fn: "rectangle",
                        params: [ "Num", "Num", "Num", "Num" ] },
                "S" : { fn: "stroke",
                        params: [ ] },
                "B" : { fn: "fillStroke",
                        params: [ ] },
                "b" : { fn: "closeFillStroke",
                        params: [ ] },
                // Clipping
                // Text
                "BT": { fn: "beginText",
                        params: [ ] },
                "ET": { fn: "endText", 
                        params: [ ] },
                "Tf": { fn: "setFont",
                        params: [ "Name", "Num" ] },
                "Td": { fn: "moveText",
                        params: [ "Num", "Num" ] },
                "Tj": { fn: "showText",
                        params: [ "String" ] },
                // Type3 fonts
                // Color
                "g" : { fn: "setFillGray",
                        params: [ "Num" ] },
                "RG": { fn: "setStrokeRGBColor",
                        params: [ "Num", "Num", "Num" ] },
                "rg": { fn: "setFillRGBColor",
                        params: [ "Num", "Num", "Num" ] },
                // Shading
                // Images
                // XObjects
                // Marked content
                // Compatibility
            };

            var cmdName = cmdObj.value
            var cmd = CMD_TABLE[cmdName];
            if (!cmd) {
                this.error("Unknown command '"+ cmdName +"'");
            } else if (!this.typeCheck(cmd.params, args)) {
                this.error("Wrong arguments for command '"+ cmdName +"'");
            }

            return cmd.fn;
        },
        typeCheck: function(params, args) {
            if (params.length != args.length)
                return false;
            for (var i = 0; i < params.length; ++i)
                if (!args[i]["is"+ params[i]]())
                    return false;
            return true;
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
        rectangle: function(x, y, width, height) {
            this.printdentln(""+ x +" "+ y + " "+ width +" "+ height +" re");
        },
        stroke: function() {
            this.printdentln("S");
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
        setFont: function(font, sizePt) {
            this.printdentln("/"+ font +" "+ sizePt +" Tf");
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

var CanvasGraphicsState = (function() {
    function constructor(canvasCtx, hdpi, vdpi, pageBox) {
        // XXX canvas2d context has much of this; need to fill in what
        // canvas state doesn't store.  
        this.ctx = canvasCtx;

        // Page state
        this.hdpi = hdpi
        this.vdpi = vdpi
        // ...
        // Fill state
        // ...
        // Stroke state
        // ...
        // Line state
        // ...
        // Text state
        // ...
        // Current path
        // ...
        // Transforms
        // ...
        // Clipping
        // ...
    }

    constructor.prototype = {
        // Coordinate transforms
        // ...
        // CTM mutators
        // ...
        // Path mutators
        // ...
    };

    return constructor;
})();

var CanvasGraphics = (function() {
    function constructor(canvasCtx, hdpi, vdpi, pageBox) {
        this.ctx = canvasCtx;
        this.current = new CanvasGraphicsState(this.ctx, hdpi, vdpi, pageBox);
        this.stateStack = [ ];
    }

    constructor.prototype = {
        // Graphics state
        save: function() {
            this.ctx.save();
            this.stateStack.push(this.current);
            // ????
            this.current = new CanvasGraphicsState(this.ctx,
                                                   hdpi, vdpi, pageBox);
        },
        restore: function() {
            this.current = this.stateStack.pop();
            this.ctx.restore();
        },
    };

    return constructor;
})();

//var PostscriptGraphics
//var SVGGraphics

// XXX temporary testing code
var MockParser = (function() {
    function constructor(objs) {
        this.objs = objs;
    }

    constructor.prototype = {
        getObj: function() {
            return this.objs.shift();
        }
    };

    return constructor;
})();

function runEchoTests() {
    function cmd(c)     { return new Obj(Obj.Cmd, c); }
    function name(n)    { return new Obj(Obj.Name, n); }
    function int(i)     { return new Obj(Obj.Int, i); }
    function string(s)  { return new Obj(Obj.String, s); }
    function eof()      { return new Obj(Obj.EOF); }
    function array(a)   { return new Obj(Obj.Array, a); }
    function real(r)    { return new Obj(Obj.Real, r); }

    var tests = [
        { name: "Hello world",
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
    ];

    tests.forEach(function(test) {
        putstr("Running echo test '"+ test.name +"'... ");

        var output = "";
        var gfx = new EchoGraphics(output);
        var i = new Interpreter(null, null, null, gfx);
        i.interpretHelper(new MockParser(test.objs));

        print("done.  Output:");
        print(gfx.out);
    });
}

runEchoTests();
