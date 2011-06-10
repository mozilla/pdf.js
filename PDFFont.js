/**
 * This dictionary holds decoded fonts data.
 */
var Fonts = new Dict();

/**
 * This simple object keep a trace of the fonts that have already been decoded
 * by storing a map between the name given by the PDF and the name gather from
 * the font (aka the PostScript code of the font itself for Type1 font).
 */
var _Fonts = {};


var Stack = function() {
  var innerStack = [];

  this.push = function(aOperand) {
    innerStack.push(aOperand);
  };

  this.pop = function() {
    if (!this.count())
      throw new Error("stackunderflow");
    return innerStack.pop();
  };

  this.peek = function() {
    if (!this.count())
      return null;
    return innerStack[innerStack.length - 1];
  };

  this.get = function(aIndex) {
    return innerStack[aIndex];
  };

  this.clear = function() {
    innerStack = [];
  };

  this.count = function() {
    return innerStack.length;
  };

  this.dump = function() {
    for (var i = 0; i < this.length; i++)
      log(innerStack[i]);
  };

  this.clone = function() {
    return innerStack.slice();
  };
};

var Base64Encoder = {
  encode: function(aData) {
    var str = [];
    var count = aData.length;
    for (var i = 0; i < count; i++)
      str.push(aData.getChar ? aData.getChar : String.fromCharCode(aData[i]));

    return window.btoa(str.join(""));
  }
};

var TrueTypeFont = function(aFontName, aFontFile) {
  if (_Fonts[aFontName])
    return;
  _Fonts[aFontName] = true;

  //log("Loading a TrueType font: " + aFontName);
  var fontData = Base64Encoder.encode(aFontFile);
  Fonts.set(aFontName, fontData);

  // Add the css rule
  var url = "url(data:font/ttf;base64," + fontData + ");";
  document.styleSheets[0].insertRule("@font-face { font-family: '" + aFontName + "'; src: " + url + " }", 0);
};

var Type1Parser = function(aAsciiStream, aBinaryStream) {
  var lexer = aAsciiStream ? new Lexer(aAsciiStream) : null;

  // Turn on this flag for additional debugging logs
  var debug = false;

  var dump = function(aData) {
    if (debug)
      log(aData);
  };

  // Hold the fontName as declared inside the /FontName postscript directive
  // XXX This is a hack but at the moment I need it to map the name declared
  // in the PDF and the name in the PS code.
  var fontName = "";

  /*
   * Parse a whole Type1 font stream (from the first segment to the last)
   * assuming the 'eexec' block is binary data and fill up the 'Fonts'
   * dictionary with the font informations.
   */
  var self = this;
  this.parse = function() {
    if (!debug) {
      while (!processNextToken()) {};
      return fontName;
    } else {
      // debug mode is used to debug postcript processing
      setTimeout(function() {
        if (!processNextToken())
          self.parse();
      }, 0);
    }
  };

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
  };

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
    "31": "hvcurveto"
  };

  function decodeCharString(aStream) {
    var start = Date.now();
    var charString = [];

    var value = "";
    var count = aStream.length;
    for (var i = 0; i < count; i++) {
      value = aStream.getByte();

      if (value < 32) {
        if (value == 12) {
          value = charStringDictionary["12"][aStream.getByte()];
          i++;
        } else {
          value = charStringDictionary[value];
        }
      } else if (value <= 246) {
        value = parseInt(value) - 139;
      } else if (value <= 250) {
        value = ((value - 247) * 256) + parseInt(aStream.getByte()) + 108;
        i++;
      } else if (value <= 254) {
        value = -((value - 251) * 256) - parseInt(aStream.getByte()) - 108;
        i++;
      } else {
        var byte = aStream.getByte();
        var high = (byte >> 1);
        value = (byte - high) << 24 | aStream.getByte() << 16 |
                aStream.getByte() << 8 | aStream.getByte();
        i += 4;
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
   var operandStack = new Stack();

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

  var dictionaryStack = new Stack();
  dictionaryStack.push(systemDict);
  dictionaryStack.push(globalDict);
  dictionaryStack.push(userDict);

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
  var executionStack = new Stack();

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

          // The key will be the identifier to recognize this font
          fontName = key;
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
            for (var i = 0; i < dictionaryStack.count(); i++) {
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
    } else if (obj) {
      dump("unknow: " + obj);
      operandStack.push(obj);
    } else { // The End!
      operandStack.dump();
      return true;
    }

    return false;
  }

  function aggregateCommand(aCommand) {
    var command = aCommand;
    switch (command) {
      case "hstem":
      case "vstem":
        break;

      case "rrcurveto":
        var stack = [operandStack.pop(), operandStack.pop(),
                     operandStack.pop(), operandStack.pop(),
                     operandStack.pop(), operandStack.pop()];
        var next = true;
        while (next) {
          var op = operandStack.peek();
          if (op == "rrcurveto") {
            operandStack.pop();
            stack.push(operandStack.pop());
            stack.push(operandStack.pop());
            stack.push(operandStack.pop());
            stack.push(operandStack.pop());
            stack.push(operandStack.pop());
            stack.push(operandStack.pop());
          } else {
            next = false;
          }
        }
        break;

      case "hlineto":
      case "vlineto":
        var last = command;
        var stack = [operandStack.pop()];
        var next = true;
        while (next) {
          var op = operandStack.peek();
          if (op == "vlineto" && last == "hlineto") {
            operandStack.pop();
            stack.push(operandStack.pop());
          } else if (op == "hlineto" && last == "vlineto") {
            operandStack.pop();
            stack.push(operandStack.pop());
          } else if (op == "rlineto" && command == "hlineto") {
            operandStack.pop();
            var x = stack.pop();
            operandStack.push(0);
            operandStack.push(x);
            command = "rlineto";
          } else if (op == "rlineto" && command == "vlineto") {
            operandStack.pop();
            operandStack.push(0);
            command = "rlineto";
          } else {
            next = false;
          }
          last = op;
        }
        break;

      case "rlineto":
        var stack = [operandStack.pop(), operandStack.pop()];
        var next = true;
        while (next) {
          var op = operandStack.peek();
          if (op == "rlineto") {
            operandStack.pop();
            stack.push(operandStack.pop());
            stack.push(operandStack.pop());
          } else if (op == "hlineto") {
            operandStack.pop();
            stack.push(0);
            stack.push(operandStack.pop());
          } else if (op == "vlineto") {
            operandStack.pop();
            stack.push(operandStack.pop());
            stack.push(0);
          } else {
            next= false;
          }
        }
        break;
    }

    while (stack.length)
      operandStack.push(stack.pop());
    operandStack.push(command);
  };


  /*
   * Flatten the commands by interpreting the postscript code and replacing
   * every 'callsubr', 'callothersubr' by the real commands.
   * At the moment OtherSubrs are not fully supported and only otherSubrs 0-4
   * as descrived in 'Using Subroutines' of 'Adobe Type 1 Font Format',
   * chapter 8.
   */
  this.flattenCharstring = function(aCharstring, aDefaultWidth, aNominalWidth, aSubrs) {
    operandStack.clear();
    executionStack.clear();
    executionStack.push(aCharstring);

    var leftSidebearing = 0;
    var lastPoint = 0;
    while (true) {
      var obj = nextInStack();
      if (IsBool(obj) || IsInt(obj) || IsNum(obj)) {
        dump("Value: " + obj);
        operandStack.push(obj);
      } else if (IsString(obj)) {
        dump("String: " + obj);
        switch (obj) {
          case "hsbw":
            var charWidthVector = operandStack.pop();
            leftSidebearing = operandStack.pop();

            if (charWidthVector != aDefaultWidth)
              operandStack.push(charWidthVector - aNominalWidth);
            break;

          case "setcurrentpoint":
          case "dotsection":
          case "seac":
          case "sbw":
            error(obj + " parsing is not implemented (yet)");
            break;

          case "closepath":
          case "return":
            break;

          case "vstem3":
          case "vstem":
            operandStack.push("vstem");
            break;

          case "hstem":
          case "hstem3":
            operandStack.push("hstem");
            break;

          case "rmoveto":
            var dy = operandStack.pop();
            var dx = operandStack.pop();

            if (leftSidebearing) {
              dx += leftSidebearing;
              leftSidebearing = 0;
            }

            operandStack.push(dx);
            operandStack.push(dy);
            operandStack.push("rmoveto");
            break;


          case "callsubr":
            var index = operandStack.pop();
            executionStack.push(aSubrs[index].slice());
            break;

          case "callothersubr":
            // XXX need to be improved
            var index = operandStack.pop();
            var count = operandStack.pop();
            var data = operandStack.pop();
            if (index != 3)
              log("callothersubr for index: " + index);
            operandStack.push(3);
            operandStack.push("callothersubr");
            break;

          case "endchar":
            operandStack.push("endchar");
            return operandStack.clone();

          case "pop":
            operandStack.pop();
            break;

          default:
            operandStack.push(obj);
            break;
        }
      }
    }
  }
};


var type1hack = false;
var Type1Font = function(aFontName, aFontFile) {
  if (_Fonts[aFontName])
    return;
  _Fonts[aFontName] = true;

  // All Type1 font program should begin with the comment %!
  if (aFontFile.getByte() != 0x25 || aFontFile.getByte() != 0x21)
    error("Invalid file header");

  if (!type1hack) {
    type1hack = true;
    var start = Date.now();

    var ASCIIStream = aFontFile.makeSubStream(0, aFontFile.dict.get("Length1"), aFontFile.dict);
    var binaryStream = aFontFile.makeSubStream(aFontFile.dict.get("Length1"), aFontFile.dict.get("Length2"), aFontFile.dict);

    this.parser = new Type1Parser(ASCIIStream, binaryStream);
    var fontName = this.parser.parse();
    this.convertToOTF(fontName);
    var end = Date.now();
    log("Time to parse font is:" + (end - start));
  }
};

Type1Font.prototype = {
  getDefaultWidths: function(aCharstrings) {
    var defaultWidth = 0;
    var defaultUsedCount = 0;

    var widths = {};
    for (var glyph in aCharstrings.map) {
      var width = aCharstrings.get(glyph)[1];
      var usedCount = (widths[width] || 0) + 1;

      if (usedCount > defaultUsedCount) {
        defaultUsedCount = usedCount;
        defaultWidth = width;
      }

      widths[width] = usedCount;
    }
    defaultWidth = parseInt(defaultWidth);

    var maxNegDistance = 0, maxPosDistance = 0;
    for (var width in widths) {
      var diff = width - defaultWidth;
      if (diff < 0 && diff < maxNegDistance) {
        maxNegDistance = diff;
      } else if (diff > 0 && diff > maxPosDistance) {
        maxPosDistance = diff;
      }
    }

    return {
      default: defaultWidth,
      nominal: defaultWidth + (maxPosDistance + maxNegDistance) / 2
    };
  },

  convertToOTF: function(aFontName) {
    var font = Fonts.get(aFontName);

    var charstrings = font.get("CharStrings")
    var defaultWidths = this.getDefaultWidths(charstrings);
    var defaultWidth = defaultWidths.default;
    var nominalWidth = defaultWidths.nominal;

    log("defaultWidth to used: " + defaultWidth);
    log("nominalWidth to used: " + nominalWidth);
    log("Hack nonimal:" + (nominalWidth = 615));


    var glyphs = {};
    var subrs = font.get("Private").get("Subrs");
    var parser = new Type1Parser();
    for (var glyph in charstrings.map) {
      var charstring = charstrings.get(glyph);
      glyphs[glyph]  = parser.flattenCharstring(charstring, defaultWidth, nominalWidth, subrs);

      //log("=================================== " + glyph + " ==============================");
      //log(charstrings.get(glyph));
      //log(flattenedCharstring);
      //log(validationData[glyph]);
    }

    // Create a CFF font data
    var cff = new Uint8Array(20000);
    var currentOffset = 0;

    // Font header (major version, minor version, header size, offset size)
    var header = [0x01, 0x00, 0x04, 0x04];
    currentOffset += header.length;
    cff.set(header);

    // Names Index
    var nameIndex = this.createCFFIndexHeader([aFontName]);
    cff.set(nameIndex, currentOffset);
    currentOffset += nameIndex.length;

    //Top Dict Index
    var topDictIndex = [
      0x00, 0x01, 0x01, 0x01, 0x2A,
      248, 27, 0, // version
      248, 28, 1, // Notice
      248, 29, 2, // FullName
      248, 30, 3, // FamilyName
      248, 20, 4, // Weigth
      82, 251, 98, 250, 105, 249, 72, 5, // FontBBox
      248, 136, 15, // charset (offset: 500)
      28, 0, 0, 16,   // Encoding
      28, 7, 208, 17,  // CharStrings (offset: 2000)
      28, 0, 55, 28, 39, 16, 18 // Private (offset: 10000)
    ];
    cff.set(topDictIndex, currentOffset);
    currentOffset += topDictIndex.length;

    // Strings Index
    var stringsIndex = [
      0x00, 0x04, 0x01,
      0x01, 0x05, 0x06, 0x07, 0x08,
      0x31, 0x2E, 0x030, 0x35, // 1.05
      0x2B, // +
      0x28, // (
      0x29  // )
    ];
    cff.set(stringsIndex, currentOffset);
    currentOffset += stringsIndex.length;


    // Global Subrs Index
    var globalSubrsIndex = [
      0x00, 0x00, 0x00
    ];
    cff.set(globalSubrsIndex, currentOffset);
    currentOffset += globalSubrsIndex.length;

    // Fill the space between this and the charset by '1'
    var empty = new Array(500 - currentOffset);
    for (var i = 0; i < empty.length; i++)
      empty[i] = 0x01;
    cff.set(empty, currentOffset);
    currentOffset += empty.length;

    //Declare the letters
    var charset = [
      0x00
    ];
    for (var glyph in charstrings.map) {
      var index = CFFStrings.indexOf(glyph);
      var bytes = integerToBytes(index, 2);
      charset.push(bytes[0]);
      charset.push(bytes[1]);
    }
    cff.set(charset, currentOffset);
    currentOffset += charset.length;

    // Fill the space between this and the charstrings data by '1'
    var empty = new Array(2000 - currentOffset);
    for (var i = 0; i < empty.length; i++)
      empty[i] = 0x01;
    cff.set(empty, currentOffset);
    currentOffset += empty.length;


    var getNumFor = {
      "hstem": 1,
      "vstem": 3,
      "vmoveto": 4,
      "rlineto": 5,
      "hlineto": 6,
      "vlineto": 7,
      "rrcurveto": 8,
      "endchar": 14,
      "rmoveto": 21,
      "hmoveto": 22,
      "vhcurveto": 30,
      "hvcurveto": 31,
    };

    // Encode the glyph and add it to the FUX
    var r = [[0x40, 0xEA]];
    for (var glyph in glyphs) {
      var data = glyphs[glyph].slice();
      var charstring = [];
      for (var i = 0; i < data.length; i++) {
        var c = data[i];
        if (!IsNum(c)) {
          var token = getNumFor[c];
          if (!token)
            error(c);
          charstring.push(token);
        } else {
          var bytes = encodeNumber(c);
          for (var j = 0; j < bytes.length; j++)
            charstring.push(bytes[j]);
        }
      }
      r.push(charstring);
    }

    var charStringsIndex = this.createCFFIndexHeader(r, true);
    cff.set(charStringsIndex.join(" ").split(" "), currentOffset);
    currentOffset += charStringsIndex.length;

    // Fill the space between this and the private dict data by '1'
    var empty = new Array(10000 - currentOffset);
    for (var i = 0; i < empty.length; i++)
      empty[i] = 0x01;
    cff.set(empty, currentOffset);
    currentOffset += empty.length;

    // Private Data
    var privateData = [
      248, 136, 20,
      248, 251, 21,
      119, 159, 248, 97, 159, 247, 87, 159, 6,
      30, 10, 3, 150, 37, 255, 12, 9,
      139, 12, 10,
      172, 10,
      172, 150, 143, 146, 150, 146, 12, 12,
      247, 32, 11,
      247, 10, 161, 147, 154, 150, 143, 12, 13,
      139, 12, 14,
      28, 0, 55, 19
    ];
    cff.set(privateData, currentOffset);
    currentOffset += privateData.length;

    // Dump shit at the end of the file
    var shit = [
      0x00, 0x01, 0x01, 0x01,
      0x13, 0x5D, 0x65, 0x64,
      0x5E, 0x5B, 0xAF, 0x66,
      0xBA, 0xBB, 0xB1, 0xB0,
      0xB9, 0xBA, 0x65, 0xB2,
      0x5C, 0x1F, 0x0B
    ];
    cff.set(shit, currentOffset);
    currentOffset += shit.length;

    var file = new Uint8Array(cff, 0, currentOffset);
    var parser = new Type2Parser();


    log("==================== debug ====================");
    log("== parse");
    parser.parse(new Stream(file));

    var data = [];
    for (var i = 0; i < currentOffset; i++)
      data.push(cff[i]);

    log("== write to file");
    writeToFile(data, "/tmp/pdf.js.cff");
  },

  createCFFIndexHeader: function(aObjects, aIsByte) {
    var data = [];

    // First 2 bytes contains the number of objects contained into this index
    var count = aObjects.length;
    var bytes = integerToBytes(count, 2);
    for (var i = 0; i < bytes.length; i++)
      data.push(bytes[i]);

    // Next byte contains the offset size use to reference object in the file
    // Actually we're using 0x04 to be sure to be able to store everything
    // without thinking of it while coding.
    data.push(0x04);

    // Add another offset after this one because we need a new offset
    var relativeOffset = 1;
    for (var i = 0; i < count + 1; i++) {
      var bytes = integerToBytes(relativeOffset, 4);
      for (var j = 0; j < bytes.length; j++)
        data.push(bytes[j]);

      if (aObjects[i])
        relativeOffset += aObjects[i].length;
    }

    for (var i =0; i < count; i++) {
      for (var j = 0; j < aObjects[i].length; j++)
        data.push(aIsByte ? aObjects[i][j] : aObjects[i][j].charCodeAt(0));
    }
    return data;
  }
};

function integerToBytes(aValue, aBytesCount) {
  var bytes = [];
  for (var i = 0; i < aBytesCount; i++)
    bytes[i] = 0x00;

  do {
    bytes[--aBytesCount] = (aValue & 0xFF);
    aValue = aValue >> 8;
  } while (aBytesCount && aValue > 0);

  return bytes;
};

function encodeNumber(aValue) {
  var x = 0;
  if (aValue >= -107 && aValue <= 107) {
    return [aValue + 139];
  } else if (aValue >= 108 && aValue <= 1131) {
    x = aValue - 108;
    return [
      integerToBytes(x / 256 + 247, 1),
      x % 256
    ];
  } else if (aValue >= -1131 && aValue <= -108) {
    x = Math.abs(aValue) - 108;
    return [
      integerToBytes(x / 256 + 251, 1),
      x % 256
    ];
  } else if (aValue >= -32768 && aValue <= 32767) {
    return [
      28,
      integerToBytes(aValue >> 8, 1),
      integerToBytes(aValue, 1)
    ];
  } else if (aValue >= (-2147483647-1) && aValue <= 2147483647) {
    return [
      0xFF,
      integerToBytes(aValue >> 24, 1),
      integerToBytes(aValue >> 16, 1),
      integerToBytes(aValue >> 8, 1),
      integerToBytes(aValue, 1)
    ];
  } else {
    error("Value: " + aValue + " is not allowed");
  }
};

