

var Type1Parser = function(aLexer) {
  var lexer = aLexer;

  
  /* 
   * The operand stack holds arbitrary PostScript objects that are the operands
   * and results of PostScript operators being executed. The interpreter pushes
   * objects on the operand stack when it encounters them as literal data in a
   * program being executed. When an operator requires one or more operands, it
   * obtains them by popping them off the top of the operand stack. When an
   * operator returns one or more results, it does so by pushing them on the
   * operand stack.
   */
  var operandStack = [];


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
    }
  }
  var currentDict = dictionaryStack.peek();


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
  var isExecutionStack = false;
  var executionStack = [];

  /* Stub to inhibit the logs */

  this.getObj = function() {
    var obj = lexer.getObj();
    if (isExecutionStack && !IsCmd(obj, "}") && !IsCmd(obj, "]")) {
      executionStack.push(obj);
      this.getObj();
    } else if (IsBool(obj) || IsInt(obj) || IsNum(obj) || IsString(obj)) {
      log("Value: " + obj);
      operandStack.push(obj);
      this.getObj();
    } else if (IsCmd(obj, "dup") || IsCmd(obj, "readonly") ||
               IsCmd(obj, "currentdict") || IsCmd(obj, "currentfile")) {
      // Do nothing for the moment
      this.getObj();
    } else if (IsName(obj)) {
      log("Name: " + obj.name);
      operandStack.push(obj.name);
      this.getObj();
    } else if (IsCmd(obj, "dict")) {
      log("Dict: " + obj);

      // XXX handling of dictionary is wrong here
      var size = operandStack.pop();
      var name = operandStack.pop();
      if (!name) {
        log ("Creating the global dict");
        currentDict = dictionaryStack.peek();
      } else {
        var dict = new Dict();
        log("Assign name: " + name + " for the dictionary");
        currentDict.set(name, dict);
        dictionaryStack.push(dict);
      }

      this.getObj();
    } else if (IsCmd(obj, "begin")) {
      log("begin a dictionary");
      currentDict = dictionaryStack.peek();
      this.getObj();
    } else if (IsCmd(obj, "end")) {
      log("Ending a dictionary");
      dictionaryStack.pop();
      currentDict = dictionaryStack.peek();
      this.getObj();
    } else if (IsCmd(obj, "def")) {
      if (executionStack.length) {
        var value = [];
        while (executionStack.length)
          value.push(executionStack.shift());
      } else {
        var value = operandStack.pop();
      }

      var key = operandStack.pop();
      // XXX this happen because of a bad way to handle dictionary
      if (key) {
        log("def: " + key + " = " + value);
        currentDict.set(key, value);
      }
      this.getObj();
    } else if (IsCmd(obj, "{")) {
      log("Start Proc: " + obj);
      executionStack = [];
      isExecutionStack = true;
      this.getObj();
    } else if (IsCmd(obj, "}")) {
      log("End Proc: " + obj);
      isExecutionStack = false;
      this.getObj();
    } else if (IsCmd(obj, "[")) {
      isExecutionStack = true;
      executionStack = [];
      this.getObj();
      log("Start array: " + obj);
    } else if (IsCmd(obj, "]")) {
      log("End array: " + obj);
      isExecutionStack = false;
      this.getObj();
    } else if (IsCmd(obj, "eexec")) {
      return; // end of the ASCII header
    } else {
      log("Getting an unknow token, adding it to the stack just in case");
      log(obj);
      operandStack.push(obj);
      this.getObj();
    }
    return currentDict;
  }
};

var hack = false;

var Type1Font = function(aFontName, aFontFile) {
  // All type1 font program should begin with the comment %!
  var validHeader = aFontFile.getByte() == 0x25 && aFontFile.getByte() == 0x21;
  if (!validHeader)
    error("Invalid file header");

  var programType = "PS-AdobeFont";
  for (var i = 0; i< programType.length; i++)
    aFontFile.getChar();

  // Ignore the '-' separator
  aFontFile.getChar();

  var version = parseFloat(aFontFile.getChar() + aFontFile.getChar() + aFontFile.getChar());
    
  if (!hack) {
    log(aFontName);
    log("Version is: " + version);

    var ASCIIStream = aFontFile.makeSubStream(0, aFontFile.dict.get("Length1"), aFontFile.dict);
    this.parser = new Type1Parser(new Lexer(ASCIIStream));

    var fontDictionary = this.parser.getObj();
    log(fontDictionary + "\t" + 
        "fontInfo: " + fontDictionary.get("FontInfo") + "\t" +
        "charStrings: " + fontDictionary.get("charStrings"));

    var binaryStream = aFontFile.makeSubStream(aFontFile.dict.get("Length1"), aFontFile.dict.get("Length2"), aFontFile.dict);
    function decrypt(aBinaryStream, aKey) {
      var c1 = 52845, c2 = 22719;
      var R = aKey;

      var streamSize = aBinaryStream.length;
      var decryptedString = [];

      var value = null;
      for (var i = 0; i < streamSize; i++) {
        value = aBinaryStream.getByte();
        decryptedString[i] = String.fromCharCode(value ^ (R >> 8));
        R = ((value + R) * c1 + c2) & ((1 << 16) - 1);
      }
      return decryptedString.slice(4);
    }

    var eexecString = decrypt(binaryStream, 55665).join("");
    log(eexecString);

    TODO("decrypt charStrings data with the key 4330");
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

