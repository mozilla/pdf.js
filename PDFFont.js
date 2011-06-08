
/*
 * This dictionary hold the decoded fonts
 */
var Fonts = new Dict();


var Base64Encoder = {
  encode: function(aData) {
    var str = [];
    var count = aData.length;
    for (var i = 0; i < count; i++)
      str.push(aData.getChar());

    return window.btoa(str.join(""));
  }
};




var TrueTypeFont = function(aFontName, aFontFile) {
  if (Fonts.get(aFontName))
    return;

  //log("Loading a TrueType font: " + aFontName);
  var fontData = Base64Encoder.encode(aFontFile);
  Fonts.set(aFontName, fontData);

  // Add the css rule
  var url = "url(data:font/ttf;base64," + fontData + ");";
  document.styleSheets[0].insertRule("@font-face { font-family: '" + aFontName + "'; src: " + url + " }", 0);
};


var Type1Parser = function(aAsciiStream, aBinaryStream) {
  var lexer = new Lexer(aAsciiStream);

  // Turn on this flag for additional debugging logs
  var debug = false;

  var dump = function(aData) {
    if (debug)
      log(aData);
  };

  /*
   * Parse a whole Type1 font stream (from the first segment to the last)
   * assuming the 'eexec' block is binary data and fill up the 'Fonts'
   * dictionary with the font informations.
   */
  var self = this;
  this.parse = function() {
    if (!debug) {
      while (!processNextToken()) {};
    } else {
      // debug mode is used to debug postcript processing
      setTimeout(function() {
        if (!processNextToken())
          self.parse();
      }, 0);
    }
  }

  /*
   * Decrypt a Sequence of Ciphertext Bytes to Produce the Original Sequence
   * of Plaintext Bytes. The function took a key as a parameter which can be
   * for decrypting the eexec block of for decoding charStrings.
   */
  var kEexecEncryptionKey = 55665;
  var kCharStringsEncryptionKey = 4330;

  function decrypt(aStream, aKey, aDiscardNumber) {
    var start = Date.now();
    var r = aKey, c1 = 52845, c2 = 22719;
    var decryptedString = [];

    var value = "";
    var count = aStream.length;
    for (var i = 0; i < count; i++) {
      value = aStream.getByte();
      decryptedString[i] = String.fromCharCode(value ^ (r >> 8));
      r = ((value + r) * c1 + c2) & ((1 << 16) - 1);
    }
    var end = Date.now();
    dump("Time to decrypt string of length " + count + " is " + (end - start));
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
  var charStringDictionary = {
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
  };

  function decodeCharString(aStream) {
    var start = Date.now();
    var charString = [];

    var value = "";
    var count = aStream.length;
    for (var i = 0; i < count; i++) {
      value = aStream.getByte();

      if (value < 0) {
        continue;
      } else if (value < 32) {
        if (value == 12) {
          value = charStringDictionary["12"][aStream.getByte()];
          count++;
        } else {
          value = charStringDictionary[value];
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
        var byte = aStream.getByte();
        var high = (byte >> 1);
        value = (byte - high) * 16777216 + aStream.getByte() * 65536 +
                aStream.getByte() * 256 *  + aStream.getByte();
        count += 4;
      }

      charString.push(value);
    }

    var end = Date.now();
    dump("Time to decode charString of length " + count + " is " + (end - start));
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
      if (!this.length)
        throw new Error("stackunderflow");
      return this.__innerStack__.pop();
    },

    peek: function() {
      if (!this.length)
        return null;
      return this.__innerStack__[this.__innerStack__.length - 1];
    },

    dump: function() {
      log("=== Start Dumping operandStack ===");
      var str = [];
      for (var i = 0; i < this.length; i++)
        log(this.__innerStack__[i]);
      log("=== End Dumping operandStack ===");
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
    __innerStack__: [systemDict, globalDict, userDict],

    push: function(aDictionary) {
      this.__innerStack__.push(aDictionary);
    },

    pop: function() {
      if (this.__innerStack__.length == 3)
        return null;

      return this.__innerStack__.pop();
    },

    peek: function() {
      if (!this.length)
        return null;
      return this.__innerStack__[this.__innerStack__.length - 1];
    },

    get: function(aIndex) {
      return this.__innerStack__[aIndex];
    },

    get length() {
      return this.__innerStack__.length;
    },

    dump: function() {
      log("=== Start Dumping dictionaryStack ===");
      var str = [];
      for (var i = 0; i < this.length; i++)
        log(this.__innerStack__[i]);
      log("=== End Dumping dictionaryStack ===");
    },
  };

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
  var executionStack = {
    __innerStack__: [],

    push: function(aProcedure) {
      this.__innerStack__.push(aProcedure);
    },

    pop: function() {
      return this.__innerStack__.pop();
    },

    peek: function() {
      if (!this.length)
        return null;
      return this.__innerStack__[this.__innerStack__.length - 1];
    },

    get: function(aIndex) {
      return this.__innerStack__[aIndex];
    },

    get length() {
      return this.__innerStack__.length;
    }
  };

  /*
   * Return the next token in the execution stack
   */
  function nextInStack() {
    var currentProcedure = executionStack.peek();
    if (currentProcedure) {
      var command = currentProcedure.shift();
      if (!currentProcedure.length)
        executionStack.pop();
      return command;
    }

    return lexer.getObj();
  };


  /*
   * Get the next token from the executionStack and process it.
   * Actually the function does not process the third segment of a Type1 font
   * and end on 'closefile'.
   *
   * The method thrown an error if it encounters an unknown token.
   */
  function processNextToken() {
    var obj = nextInStack();
    if (operandIsArray && !IsCmd(obj, "{") && !IsCmd(obj, "[") &&
                          !IsCmd(obj, "]") && !IsCmd(obj, "}")) {
      dump("Adding an object: " + obj +" to array " + operandIsArray);
      var currentArray = operandStack.peek();
      for (var i = 1; i < operandIsArray; i++)
        currentArray = currentArray[currentArray.length - 1];

      currentArray.push(obj);
    } else if (IsBool(obj) || IsInt(obj) || IsNum(obj) || IsString(obj)) {
      dump("Value: " + obj);
      operandStack.push(obj);
    } else if (IsName(obj)) {
      dump("Name: " + obj.name);
      operandStack.push(obj.name);
    } else if (IsCmd(obj)) {
      var command = obj.cmd;
      dump(command);

      switch (command) {
        case "[":
        case "{":
          dump("Start" + (command == "{" ? " Executable " : " ") + "Array");
          operandIsArray++;
          var currentArray = operandStack;
          for (var i = 1; i < operandIsArray; i++)
            if (currentArray.peek)
              currentArray = currentArray.peek();
            else
              currentArray = currentArray[currentArray.length - 1];
          currentArray.push([]);
          break;

        case "]":
        case "}":
          var currentArray = operandStack.peek();
          for (var i = 1; i < operandIsArray; i++)
            currentArray = currentArray[currentArray.length - 1];
          dump("End" + (command == "}" ? " Executable " : " ") + "Array: " + currentArray.join(" "));
          operandIsArray--;
          break;

        case "if":
          var procedure = operandStack.pop();
          var bool = operandStack.pop();
          if (!IsBool(bool)) {
            dump("if: " + bool);
            // we need to execute things, let be dirty
            executionStack.push(bool);
          } else {
            dump("if ( " + bool + " ) { " + procedure + " }");
            if (bool)
              executionStack.push(procedure);
          }
          break;

        case "ifelse":
          var procedure1 = operandStack.pop();
          var procedure2 = operandStack.pop();
          var bool = !!operandStack.pop();
          dump("if ( " + bool + " ) { " + procedure2 + " } else { " + procedure1 + " }");
          executionStack.push(bool ? procedure2 : procedure1);
          break;

        case "for":
          var procedure = operandStack.pop();
          var limit = operandStack.pop();
          var increment = operandStack.pop();
          var initial = operandStack.pop();
          for (var i = 0; i < limit; i += increment) {
            operandStack.push(i);
            executionStack.push(procedure.slice());
          }
          break;

        case "dup":
          dump("duplicate: " + operandStack.peek());
          operandStack.push(operandStack.peek());
          break;

        case "mark":
          operandStack.push("mark");
          break;

        case "cleartomark":
          var command = "";
          do {
            command = operandStack.pop();
          } while (command != "mark");
          break;

        case "put":
          var data = operandStack.pop();
          var indexOrKey = operandStack.pop();
          var object = operandStack.pop();
          dump("put " + data + " in " + object + "[" + indexOrKey + "]");
          object.set ? object.set(indexOrKey, data)
                     : object[indexOrKey] = data;
          break;

        case "pop":
          operandStack.pop();
          break;

        case "exch":
          var operand1 = operandStack.pop();
          var operand2 = operandStack.pop();
          operandStack.push(operand1);
          operandStack.push(operand2);
          break;

        case "get":
          var indexOrKey = operandStack.pop();
          var object = operandStack.pop();
          var data = object.get ? object.get(indexOrKey) : object[indexOrKey];
          dump("get " + object + "[" + indexOrKey + "]: " + data);
          operandStack.push(data);
          break;

        case "currentdict":
          var dict = dictionaryStack.peek();
          operandStack.push(dict);
          break;

        case "systemdict":
          operandStack.push(systemDict);
          break;

        case "readonly":
        case "executeonly":
        case "noaccess":
          // Do nothing for the moment
          break;

        case "currentfile":
          operandStack.push("currentfile");
          break;

        case "array":
          var size = operandStack.pop();
          var array = new Array(size);
          operandStack.push(array);
          break;

        case "dict":
          var size = operandStack.pop();
          var dict = new Dict(size);
          operandStack.push(dict);
          break;

        case "begin":
          dictionaryStack.push(operandStack.pop());
          break;

        case "end":
          dictionaryStack.pop();
          break;

        case "def":
          var value = operandStack.pop();
          var key = operandStack.pop();

          // XXX we don't want to do that here but for some reasons the names
          // are different between what is declared and the FontName directive
          if (key == "FontName" && Fonts.get(value)) {
            // The font has already be decoded, stop!
            return true;
          }

          dump("def: " + key + " = " + value);
          dictionaryStack.peek().set(key, value);
          break;

        case "definefont":
          var font = operandStack.pop();
          var key = operandStack.pop();
          dump("definefont " + font + " with key: " + key);
          Fonts.set(key, font);
          operandStack.push(font);
          break;

        case "known":
          var name = operandStack.pop();
          var dict = operandStack.pop();
          var data = !!dict.get(name);
          dump("known: " + data + " :: " + name + " in dict: " + dict);
          operandStack.push(data);
          break;

        case "exec":
          executionStack.push(operandStack.pop());
          break;

        case "eexec":
          // All the first segment data has been read, decrypt the second segment
          // and start interpreting it in order to decode it
          var file = operandStack.pop();
          var eexecString = decrypt(aBinaryStream, kEexecEncryptionKey, 4).join("");
          dump(eexecString);
          lexer = new Lexer(new StringStream(eexecString));
          break;

        case "LenIV":
          error("LenIV: argh! we need to modify the length of discard characters for charStrings");
          break;

        case "closefile":
          var file = operandStack.pop();
          return true;
          break;

        case "index":
          var operands = [];
          var size = operandStack.pop();
          for (var i = 0; i < size; i++)
            operands.push(operandStack.pop());

          var newOperand = operandStack.peek();

          while (operands.length)
            operandStack.push(operands.pop());

          operandStack.push(newOperand);
          break;

        case "string":
          var size = operandStack.pop();
          var str = (new Array(size + 1)).join(" ");
          operandStack.push(str);
          break;

        case "readstring":
          var str = operandStack.pop();
          var size = str.length;

          var file = operandStack.pop();

          // Add '1' because of the space separator, this is dirty
          var stream = lexer.stream.makeSubStream(lexer.stream.pos + 1, size);
          lexer.stream.skip(size + 1);

          var charString = decrypt(stream, kCharStringsEncryptionKey, 4).join("");
          var charStream = new StringStream(charString);
          var decodedCharString = decodeCharString(charStream);
          dump("decodedCharString: " + decodedCharString);
          operandStack.push(decodedCharString);
          // boolean indicating if the operation is a success or not
          operandStack.push(true);
          break;

        case "StandardEncoding":
          // For some reason the value is considered as a command, maybe it is
          // because of the uppercase 'S'
          operandStack.push(obj.cmd);
          break;

        default:
          var command = null;
          if (IsCmd(obj)) {
            for (var i = 0; i < dictionaryStack.length; i++) {
              if (command = dictionaryStack.get(i).get(obj.cmd)) {
                dump("found in dictionnary for " + obj.cmd + " command: " + command);
                executionStack.push(command.slice());
                break;
              }
            }
          }

          if (!command) {
            log("operandStack: " + operandStack);
            log("dictionaryStack: " + dictionaryStack);
            log(obj);
            error("Unknow command while parsing font");
          }
          break;
      }
    } else if (obj){
      dump("unknow: " + obj);
      operandStack.push(obj);
    }

    return false;
  }
};


var type1hack = false;
var Type1Font = function(aFontName, aFontFile) {
  // All Type1 font program should begin with the comment %!
  if (aFontFile.getByte() != 0x25 || aFontFile.getByte() != 0x21)
    error("Invalid file header");

  if (!type1hack) {
    type1hack= true;
  var start = Date.now();

  var ASCIIStream = aFontFile.makeSubStream(0, aFontFile.dict.get("Length1"), aFontFile.dict);
  var binaryStream = aFontFile.makeSubStream(aFontFile.dict.get("Length1"), aFontFile.dict.get("Length2"), aFontFile.dict);

  this.parser = new Type1Parser(ASCIIStream, binaryStream);
  this.parser.parse();

  var end = Date.now();
  //log("Time to parse font is:" + (end - start));

  this.convert();
  }
};



/**************************************************************************/

function decodeType2DictData(aString, aDictionary, aHack) {
  var data = [];

  var value = "";
  var count = aString.length;
  for (var i = 0; i < count; i) {
    value = aString[i++];
    if (value <= 0) {
      data.push(value);
      continue;
    } else if (value == 28) {
      value = aString[i++] << 8 | aString[i++];
    } else if (value == 29) {
      value = aString[i++] << 24 |
              aString[i++] << 16 |
              aString[i++] << 8  |
              aString[i++];
    } else if (value < 32) {
      var oldValue = value;
      if (value == 12) {
        value = aDictionary["12"][aString[i++]];
      } else {
        value = aDictionary[value];
      }
      if (!value)
        throw new Error("This command number does not match anything : " + oldValue);
      value = aHack ? value.name : value;
    } else if (value <= 246) {
      value = parseInt(value) - 139;
    } else if (value <= 250) {
      value = ((value - 247) * 256) + parseInt(aString[i++]) + 108;
    } else if (value <= 254) {
      value = -((value - 251) * 256) - parseInt(aString[i++]) - 108;
    } else {
      throw new Error("Value should not be 255");
    }

    data.push(value);
  }

  return data;
}

var Type2Parser = function(aFilePath) {
  var font = new Dict();

  // Turn on this flag for additional debugging logs
  var debug = true;

  function dump(aStr) {
    if (debug)
      log(aStr);
  };

  function readIndex(aStream, aIsByte) {
    var count = aStream.getByte() << 8 | aStream.getByte();
    var offsize = aStream.getByte();
    var offsets = [];
    for (var i = 0; i < count + 1; i++) {
      switch (offsize) {
        case 0:
          offset = 0;
          break;
        case 1:
          offset = aStream.getByte();
          break;
        case 2:
          offset = aStream.getByte() << 8 | aStream.getByte();
          break;
        case 3:
          offset = aStream.getByte() << 16 | aStream.getByte() << 8 |
                   aStream.getByte();
          break;
        case 4:
          offset = aStream.getByte() << 24 | aStream.getByte() << 16 |
                   aStream.getByte() << 8 | aStream.getByte();
          break;
        default:
          throw new Error("Unsupported offsize: " + offsize);
      }
      offsets.push(offset);
    }

    dump("Found " + count + " objects at offsets :" + offsets + " (offsize: " + offsize + ")");
    var dataOffset = aStream.pos;
    var objects = [];
    for (var i = 0; i < count; i++) {
      var offset = offsets[i];
      aStream.pos = dataOffset + offset - 1;

      var data = [];
      var length = offsets[i + 1] - 1;
      for (var j = offset - 1; j < length; j++)
        data.push(aIsByte ? aStream.getByte() : aStream.getChar());
      //dump("object at offset " + offset + " is: " + data);
      objects.push(data);
    }
    return objects;
  };

  function parseAsToken(aString, aDict) {
    var decoded = decodeType2DictData(aString, aDict);

    var stack = [];
    var count = decoded.length;
    for (var i = 0; i < count; i++) {
      var token = decoded[i];
      if (IsNum(token)) {
        stack.push(token);
      } else {
        switch (token.operand) {
          case "SID":
            font.set(token.name, CFFStrings[stack.pop()]);
            break;
          case "number number":
            font.set(token.name, {
              size: stack.pop(),
              offset: stack.pop()
            });
            break;
          case "boolean":
            font.set(token.name, stack.pop());
            break;
          case "delta":
            font.set(token.name, stack.pop());
            break;
          default:
            if (token.operand && token.operand.length) {
              var array = [];
              for (var j = 0; j < token.operand.length; j++)
                array.push(stack.pop());
              font.set(token.name, array);
            } else {
              font.set(token.name, stack.pop());
            }
            break;
        }
      }
    }
  };


  function readCharset(aStream, aCharStrings) {
    var charset = {};

    var format = aStream.getByte();
    if (format == 0) {
      var count = aCharStrings.length - 1;
      charset[".notdef"] = decodeType2DictData(aCharStrings[0], CFFDictCommands, true);
      for (var i = 1; i < count + 1; i++) {
        var sid = aStream.getByte() << 8 | aStream.getByte();
        var charString = decodeType2DictData(aCharStrings[i], CFFDictCommands, true);
        charset[CFFStrings[sid]] = charString;
        log(CFFStrings[sid] + "::" + charString);
      }
    } else if (format == 1) {
      throw new Error("Format 1 charset are not supported");
    } else {
      throw new Error("Invalid charset format");
    }
    return charset;
  };

  this.parse = function(aStream) {
    font.set("major", aStream.getByte());
    font.set("minor", aStream.getByte());
    font.set("hdrSize", aStream.getByte());
    font.set("offsize", aStream.getByte());

    // Move the cursor after the header
    aStream.skip(font.get("hdrSize") - aStream.pos);

    // Read the NAME Index
    dump("Reading Index: Names");
    font.set("Names", readIndex(aStream));
    dump(font.get("Names"));

    // Read the Top Dict Index
    dump("Reading Index: TopDict");
    var topDict = readIndex(aStream, true);

    // Read the String Index
    dump("Reading Index: Strings");
    var strings = readIndex(aStream);

    // Fill up the Strings dictionary with the new unique strings
    for (var i = 0; i < strings.length; i++)
      CFFStrings.push(strings[i].join(""));

    // Parse the TopDict operator
    var objects = [];
    var count = topDict.length;
    for (var i = 0; i < count; i++)
      parseAsToken(topDict[i], CFFDictOps);

    for (var p in font.map)
      dump(p + "::" + font.get(p));

    // Read the Subr Index
    dump("Reading Subr Index");
    var subrs = readIndex(aStream);

    // Read CharStrings Index
    dump("Read CharStrings Index");
    var charStringsOffset = font.get("CharStrings");
    aStream.pos = charStringsOffset;
    var charStrings = readIndex(aStream, true);


    var charsetEntry = font.get("charset");
    if (charsetEntry == 0) {
      throw new Error("Need to support CFFISOAdobeCharset");
    } else if (charsetEntry == 1) {
      throw new Error("Need to support CFFExpert");
    } else if (charsetEntry == 2) {
      throw new Error("Need to support CFFExpertSubsetCharset");
    } else {
      aStream.pos = charsetEntry;
      var charset = readCharset(aStream, charStrings);
    }

    // Read Encoding data
    log("Reading encoding data");
  }
};


// XXX
var xhr = new XMLHttpRequest();
xhr.open("GET", "titi.cff", false);
xhr.mozResponseType = xhr.responseType = "arraybuffer";
xhr.expected = (document.URL.indexOf("file:") == 0) ? 0 : 200;
xhr.send(null);
var cffData = xhr.mozResponseArrayBuffer || xhr.mozResponse ||
              xhr.responseArrayBuffer || xhr.response;
var cff = new Type2Parser("titi.cff");
cff.parse(new Stream(cffData));

