
var Type1Parser = function(aAsciiStream, aBinaryStream) {
  var lexer = new Lexer(aAsciiStream);

  // Turn on this flag for additional debugging logs
  var debug = false;

  var dump = function(aData) {
    if (debug)
      log(aData);
  };

  /*
   * Decrypt a Sequence of Ciphertext Bytes to Produce the Original Sequence
   * of Plaintext Bytes. The function took a key as a parameter which can be
   * for decrypting the eexec block of for decoding charStrings.
   */
  var kEexecEncryptionKey = 55665;
  var kCharStringsEncryptionKey = 4330;

  function decrypt(aStream, aKey, aDiscardNumber) {
    var r = aKey, c1 = 52845, c2 = 22719;
    var decryptedString = [];

    var value = "";
    var count = aStream.length;
    for (var i = 0; i < count; i++) {
      value = aStream.getByte();
      decryptedString[i] = String.fromCharCode(value ^ (r >> 8));
      r = ((value + r) * c1 + c2) & ((1 << 16) - 1);
    }
    return decryptedString.slice(aDiscardNumber);
  }

  /*
   * CharStrings are encoded following the the CharString Encoding sequence
   * describe in Chapter 6 of the "Adobe Type1 Font Format" specification.
   * The value in a byte indicates a command, a number, or subsequent bytes
   * that are to be interpreted in a special way.
   *
   * CharString Number Encoding:
   *  A CharString byte containing the values from 32 through 255 inclusive
   *  indicate an integer. These values are decoded in four ranges.
   * 
   * 1. A CharString byte containing a value, v, between 32 and 246 inclusive,
   * indicate the integer v - 139. Thus, the integer values from -107 through
   * 107 inclusive may be encoded in single byte.
   *
   * 2. A CharString byte containing a value, v, between 247 and 250 inclusive,
   * indicates an integer involving the next byte, w, according to the formula:
   * [(v - 247) x 256] + w + 108
   *
   * 3. A CharString byte containing a value, v, between 251 and 254 inclusive,
   * indicates an integer involving the next byte, w, according to the formula:
   * -[(v - 251) * 256] - w - 108
   * 
   * 4. A CharString containing the value 255 indicates that the next 4 bytes
   * are a two complement signed integer. The first of these bytes contains the
   * highest order bits, the second byte contains the next higher order bits
   * and the fourth byte contain the lowest order bits.
   *
   *
   * CharString Command Encoding:
   *  CharStrings commands are encoded in 1 or 2 bytes.
   *
   *  Single byte commands are encoded in 1 byte that contains a value between
   *  0 and 31 inclusive.
   *  If a command byte contains the value 12, then the value in the next byte
   *  indicates a command. This "escape" mechanism allows many extra commands
   * to be encoded and this encoding technique helps to minimize the length of
   * the charStrings.
   */
  function decodeCharString(aStream) {
    var charString = [];
    var cmd = {
      "1": "hstem",
      "3": "vstem",
      "4": "vmoveto",
      "5": "rlineto",
      "6": "hlineto",
      "7": "vlineto",
      "8": "rrcurveto",
      "9": "closepath",
      "10": "callsubr",
      "11": "return",
      "12": {
        "0": "dotsection",
        "1": "vstem3",
        "3": "hstem3",
        "6": "seac",
        "7": "sbw",
        "12": "div",
        "16": "callothersubr",
        "17": "pop",
        "33": "setcurrentpoint"
      },
      "13": "hsbw",
      "14": "endchar",
      "21": "rmoveto",
      "22": "hmoveto",
      "30": "vhcurveto",
      "31": "hcurveto"
    }

    var value = "";
    var count = aStream.length;
    for (var i = 0; i < count; i++) {
      value = aStream.getByte();
      
      if (value < 0) {
        continue;
      } else if (value < 32) {
        if (value == 12) {
          value = cmd["12"][aStream.getByte()];
          count++;
        } else {
          value = cmd[value];
        }
      } else if (value <= 246) {
        value = parseInt(value) - 139;
      } else if (value <= 250) {
        value = ((value - 247) * 256) + parseInt(aStream.getByte()) + 108;
        count++;
      } else if (value <= 254) {
        value = -((value - 251) * 256) - parseInt(aStream.getByte()) - 108;
        count++;
      } else {
        error("Two complement signed integers are ignored for the moment");
      }

      charString.push(value);
    }
  
    return charString;    
  }

  /*
   * The operand stack holds arbitrary PostScript objects that are the operands
   * and results of PostScript operators being executed. The interpreter pushes
   * objects on the operand stack when it encounters them as literal data in a
   * program being executed. When an operator requires one or more operands, it
   * obtains them by popping them off the top of the operand stack. When an
   * operator returns one or more results, it does so by pushing them on the
   * operand stack.
   */
   var operandStack = {
    __innerStack__: [],

    push: function(aOperand) {
      this.__innerStack__.push(aOperand);
    },

    pop: function() {
      return this.__innerStack__.pop();
    },

    peek: function() {
      return this.__innerStack__[this.__innerStack__.length - 1];
    },

    get length() {
      return this.__innerStack__.length;
    }
   };

   // Flag indicating if the topmost operand of the operandStack is an array
   var operandIsArray = 0;

  /*
   * The dictionary stack holds only dictionary objects. The current set of
   * dictionaries on the dictionary stack defines the environment for all
   * implicit name searches, such as those that occur when the interpreter
   * encounters an executable name. The role of the dictionary stack is
   * introduced in Section 3.3, “Data Types and Objects,” and is further
   * explained in Section 3.5, “Execution.” of the PostScript Language
   * Reference.
   */
  var systemDict = new Dict(),
      globalDict = new Dict(),
      userDict   = new Dict();

  var dictionaryStack = {
    __innerStack__: [systemDict, globalDict],

    push: function(aDictionary) {
      this.__innerStack__.push(aDictionary);
    },

    pop: function() {
      if (this.__innerStack__.length == 2)
        return null;

      return this.__innerStack__.pop();
    },

    peek: function() {
      return this.__innerStack__[this.__innerStack__.length - 1];
    },

    get length() {
      return this.__innerStack__.length;
    }
  }

  /*
   * The execution stack holds executable objects (mainly procedures and files)
   * that are in intermediate stages of execution. At any point in the
   * execution of a PostScript program, this stack represents the program’s
   * call stack. Whenever the interpreter suspends execution of an object to
   * execute some other object, it pushes the new object on the execution
   * stack. When the interpreter finishes executing an object, it pops that
   * object off the execution stack and resumes executing the suspended object
   * beneath it.
   */
  var executionStack = [];


  /*
   * Parse a font file from the first segment to the last assuming the eexec
   * block is binary data.
   * 
   * The method thrown an error if it encounters an unknown token.
   */
  this.getObj = function() {
    var obj = lexer.getObj();

    if (operandIsArray && !IsCmd(obj, "{") && !IsCmd(obj, "[") && 
                          !IsCmd(obj, "}") && !IsCmd(obj, "]")) {
      operandStack.peek().push(obj);
      this.getObj();
    } else if (IsCmd(obj, "{") || IsCmd(obj, "[")) {
      dump("Start Array: " + obj);
      operandStack.push([]);
      operandIsArray++;
      this.getObj();
    } else if (IsCmd(obj, "}") || IsCmd(obj, "]")) {
      dump("End Array: " + obj);
      operandIsArray--;
      this.getObj();
    } else if (IsBool(obj) || IsInt(obj) || IsNum(obj) || IsString(obj)) {
      //dump("Value: " + obj);
      operandStack.push(obj);
      this.getObj();
    } else if (IsCmd(obj, "dup")) {
      dump("Duplicate");
      operandStack.push(operandStack.peek());
      this.getObj();
    } else if (IsCmd(obj, "currentdict")) {
      dump("currentdict");
      operandStack.push(dictionaryStack.peek());
      this.getObj();
    } else if (IsCmd(obj, "systemdict")) {
      dump("systemdict");
      operandStack.push(systemDict);
      this.getObj();
    } else if (IsCmd(obj, "readonly") || IsCmd(obj, "executeonly") ||
               IsCmd(obj, "currentfile") || IsCmd(obj, "NP")) {
      // Do nothing for the moment
      this.getObj();
    } else if (IsName(obj)) {
      //dump("Name: " + obj.name);
      operandStack.push(obj.name);
      this.getObj();
    } else if (IsCmd(obj, "dict")) {
      dump("Dict: " + obj);
      var size = operandStack.pop();
      var dict = new Dict(size);
      operandStack.push(dict);
      this.getObj();
    } else if (IsCmd(obj, "begin")) {
      dump("begin a dictionary");
      dictionaryStack.push(operandStack.pop());
      this.getObj();
    } else if (IsCmd(obj, "end")) {
      dump("Ending a dictionary");
      dictionaryStack.pop();
      this.getObj();
    } else if (IsCmd(obj, "def")) {
      var value = operandStack.pop();
      var key = operandStack.pop();
      dump("def: " + key + " = " + value);
      dictionaryStack.peek().set(key, value);
      this.getObj();
    } else if (IsCmd(obj, "eexec")) {
      // All the first segment data has been read, decrypt the second segment
      // and start interpreting it in order to decode it
      var eexecString = decrypt(aBinaryStream, kEexecEncryptionKey, 4).join("");
      lexer = new Lexer(new StringStream(eexecString));

      this.getObj();
    } else if (IsCmd(obj, "known")) {
      dump("known");
      var name = operandStack.pop();
      var dict = operandStack.pop();
      // returns dict.hasKey(name);

      this.getObj();
    } else if (IsCmd(obj, "RD")) {
      dump("RD");
      var size = operandStack.pop();
      var key = operandStack.pop();

      // Add '1' because of the space separator, this is dirty
      var stream = lexer.stream.makeSubStream(lexer.stream.pos + 1, size);
      lexer.stream.skip(size + 1);

      var charString = decrypt(stream, kCharStringsEncryptionKey, 4).join("");
      var charStream = new StringStream(charString);

      // XXX do we want to store that on the top dictionary or somewhere else
      dictionaryStack.peek().set(key, charStream);

      var decodedCharString = decodeCharString(charStream);
      log(decodedCharString);

      this.getObj();
    } else if (IsCmd(obj, "LenIV")) {
      error("LenIV: argh! we need to modify the length of discard characters for charStrings");
    } else if (IsCmd(obj, "closefile")) {
      // End of binary data;
    } else if (IsCmd(obj, "StandardEncoding")) {
      // For some reason the value is considered as a command, maybe it is
      // because of the uppercae 'S'
      operandStack.push(obj.cmd);
      this.getObj();
    } else {
      dump(obj);
      error("Unknow token while parsing font");
    }

    return operandStack.peek();
  }
};

var hack = false;

var Type1Font = function(aFontName, aFontFile) {
  // All Type1 font program should begin with the comment %!
  if (aFontFile.getByte() != 0x25 || aFontFile.getByte() != 0x21)
    error("Invalid file header");

  if (!hack) {
    log(aFontName);

    var ASCIIStream = aFontFile.makeSubStream(0, aFontFile.dict.get("Length1"), aFontFile.dict);
    var binaryStream = aFontFile.makeSubStream(aFontFile.dict.get("Length1"), aFontFile.dict.get("Length2"), aFontFile.dict);

    this.parser = new Type1Parser(ASCIIStream, binaryStream);

    var fontDictionary = this.parser.getObj();
    log(fontDictionary + "\t" + "fontInfo: " + fontDictionary.get("FontInfo"));
    hack = true;
  }


  this.info = {};
  this.name = aFontName;
  this.encoding = [];
  this.paintType = 0;
  this.fontType = 0;
  this.fontMatrix = [];
  this.fontBBox = [];
  this.uniqueID = 0;
  this.metrics = {};
  this.strokeWidth = 0.0;
  this.private = {};
  this.charStrings = {}
  this.FID = 0;
};

