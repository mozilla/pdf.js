/**
 * MozillaLogger, a base class logger that just logs to stdout.
 */

function MozillaLogger(aPath) {
}

MozillaLogger.prototype = {

  init : function(path) {},
  
  getLogCallback : function() {
    return function (msg) {
      var data = msg.num + " " + msg.level + " " + msg.info.join(' ') + "\n";
      dump(data);
    }
  },

  log : function(msg) {
    dump(msg);
  },

  close : function() {}
};


/**
 * SpecialPowersLogger, inherits from MozillaLogger and utilizes SpecialPowers.
 * intented to be used in content scripts to write to a file
 */
function SpecialPowersLogger(aPath) {
  // Call the base constructor
  MozillaLogger.call(this);
  this.prototype = new MozillaLogger(aPath);
  this.init(aPath);
}

SpecialPowersLogger.prototype = {
  init : function (path) {
    SpecialPowers.setLogFile(path);
  },

  getLogCallback : function () {
    return function (msg) {
      var data = msg.num + " " + msg.level + " " + msg.info.join(' ') + "\n";
      SpecialPowers.log(data);

      if (data.indexOf("SimpleTest FINISH") >= 0) {
        SpecialPowers.closeLogFile();
      }
    }
  },

  log : function (msg) {
    SpecialPowers.log(msg);
  },

  close : function () {
    SpecialPowers.closeLogFile();
  }
};


/**
 * MozillaFileLogger, a log listener that can write to a local file.
 * intended to be run from chrome space
 */

/** Init the file logger with the absolute path to the file.
    It will create and append if the file already exists **/
function MozillaFileLogger(aPath) {
  // Call the base constructor
  MozillaLogger.call(this);
  this.prototype = new MozillaLogger(aPath);
  this.init(aPath);
}

MozillaFileLogger.prototype = {
  
  init : function (path) {
    var PR_WRITE_ONLY   = 0x02; // Open for writing only.
    var PR_CREATE_FILE  = 0x08;
    var PR_APPEND       = 0x10;
    this._file = Components.classes["@mozilla.org/file/local;1"].
                            createInstance(Components.interfaces.nsILocalFile);
    this._file.initWithPath(path);
    this._foStream = Components.classes["@mozilla.org/network/file-output-stream;1"].
                                     createInstance(Components.interfaces.nsIFileOutputStream);
    this._foStream.init(this._file, PR_WRITE_ONLY | PR_CREATE_FILE | PR_APPEND,
                                     0664, 0);
  },

  getLogCallback : function() {
    return function (msg) {
      var data = msg.num + " " + msg.level + " " + msg.info.join(' ') + "\n";
      if (MozillaFileLogger._foStream)
        this._foStream.write(data, data.length);

      if (data.indexOf("SimpleTest FINISH") >= 0) {
        MozillaFileLogger.close();
      }
    }
  },

  log : function(msg) {
    if (this._foStream)
      this._foStream.write(msg, msg.length);
  },

  close : function() {
    if(this._foStream)
      this._foStream.close();
  
    this._foStream = null;
    this._file = null;
  }
};

this.MozillaLogger = MozillaLogger;
this.SpecialPowersLogger = SpecialPowersLogger;
this.MozillaFileLogger = MozillaFileLogger;
