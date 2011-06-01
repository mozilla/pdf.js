
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
    var value = null;

    var count = aStream.length;
    for (var i = 0; i < count; i++) {
      value = aStream.getByte();
      decryptedString[i] = String.fromCharCode(value ^ (r >> 8));
      r = ((value + r) * c1 + c2) & ((1 << 16) - 1);
    }
    return decryptedString.slice(aDiscardNumber);
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
   var operandIsArray = false;

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

  this.getObj = function() {
    var obj = lexer.getObj();

    if (operandIsArray && !IsCmd(obj, "}") && !IsCmd(obj, "]")) {
      operandStack.peek().push(obj);
      this.getObj();
    } else if (IsCmd(obj, "{") || IsCmd(obj, "[")) {
      dump("Start Array: " + obj);
      operandStack.push([]);
      operandIsArray = true;
      this.getObj();
    } else if (IsCmd(obj, "}") || IsCmd(obj, "]")) {
      dump("End Array: " + obj);
      operandIsArray = false;
      this.getObj();
    } else if (IsBool(obj) || IsInt(obj) || IsNum(obj) || IsString(obj)) {
      dump("Value: " + obj);
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
               IsCmd(obj, "currentfile")) {
      // Do nothing for the moment
      this.getObj();
    } else if (IsName(obj)) {
      dump("Name: " + obj.name);
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

      var stream = lexer.stream.makeSubStream(lexer.stream.pos, size);
      var charString = decrypt(stream, kCharStringsEncryptionKey, 4).join("");

      // XXX do we want to store that on the top dictionary or somewhere else
      dictionaryStack.peek().set(key, new StringStream(charString));
      log (new StringStream(charString));
      this.getObj();
    } else if (IsCmd(obj, "LenIV")) {
      error("LenIV: argh! we need to modify the length of discard characters for charStrings");
    } else {
      dump("Getting an unknow token, adding it to the stack just in case");
      dump(obj);
      operandStack.push(obj);
      this.getObj();
    }

    return operandStack.peek();
  }
};

var hack = false;

var Type1Font = function(aFontName, aFontFile) {
  // All Type1 font program should begin with the comment %!
  var validHeader = aFontFile.getByte() == 0x25 && aFontFile.getByte() == 0x21;
  if (!validHeader)
    error("Invalid file header");

  var programType = "PS-AdobeFont";
  for (var i = 0; i < programType.length; i++)
    aFontFile.getChar();

  // Ignore the '-' separator
  aFontFile.getChar();

  var version = parseFloat(aFontFile.getChar() + aFontFile.getChar() + aFontFile.getChar());

  if (!hack) {
    log(aFontName);
    log("Version is: " + version);

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

