
/*
 * This dictionary hold the decoded fonts
 */
var Fonts = new Dict();

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
        error("Two complement signed integers are ignored for the moment");
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
      return this.__innerStack__.pop();
    },

    peek: function() {
      if (!this.length)
        return null;
      return this.__innerStack__[this.__innerStack__.length - 1];
    },

    toString: function() {
      log("=== Start Dumping operandStack ===");
      var str = [];
      for (var i = 0; i < this.__innerStack__.length; i++)
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
      if (this.__innerStack__.length == 2)
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
    }
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
          //dump("put " + data + " in " + object + "[" + indexOrKey + "]");
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
          dump("get " + obj + "[" + indexOrKey + "]: " + data);
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
          dump("def: " + key + " = " + value);
          dictionaryStack.peek().set(key, value);
          break;

        case "definefont":
          var font = operandStack.pop();
          var key = operandStack.pop();
          dump("definefont " + font + " with key: " + key);
          Fonts.set(key, font);
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
          var eexecString = decrypt(aBinaryStream, kEexecEncryptionKey, 4).join("");
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

          for (var i = 0; i < operands.length; i++)
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


var hack = true;

var Type1Font = function(aFontName, aFontFile) {
  // All Type1 font program should begin with the comment %!
  if (aFontFile.getByte() != 0x25 || aFontFile.getByte() != 0x21)
    error("Invalid file header");

  if (hack) {
    var start = Date.now();

    var ASCIIStream = aFontFile.makeSubStream(0, aFontFile.dict.get("Length1"), aFontFile.dict);
    var binaryStream = aFontFile.makeSubStream(aFontFile.dict.get("Length1"), aFontFile.dict.get("Length2"), aFontFile.dict);

    this.parser = new Type1Parser(ASCIIStream, binaryStream);
    this.parser.parse();

    var end = Date.now();
    dump("Time to parse font is:" + (end - start));
    
    hack = false;
  }
};

