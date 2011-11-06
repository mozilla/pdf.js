/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

function MessageHandler(name, comObj) {
  this.name = name;
  this.comObj = comObj;
  var ah = this.actionHandler = {};

  ah['console_log'] = [function ahConsoleLog(data) {
      console.log.apply(console, data);
  }];
  ah['console_error'] = [function ahConsoleError(data) {
      console.error.apply(console, data);
  }];

  comObj.onmessage = function messageHandlerComObjOnMessage(event) {
    var data = event.data;
    if (data.action in ah) {
      var action = ah[data.action];
      action[0].call(action[1], data.data);
    } else {
      throw 'Unkown action from worker: ' + data.action;
    }
  };
}

MessageHandler.prototype = {
  on: function messageHandlerOn(actionName, handler, scope) {
    var ah = this.actionHandler;
    if (ah[actionName]) {
      throw 'There is already an actionName called "' + actionName + '"';
    }
    ah[actionName] = [handler, scope];
  },

  send: function messageHandlerSend(actionName, data) {
    this.comObj.postMessage({
      action: actionName,
      data: data
    });
  }
};

var WorkerMessageHandler = {
  setup: function wphSetup(handler) {
    var pdfDoc = null;

    handler.on('test', function wphSetupTest(data) {
      handler.send('test', data instanceof Uint8Array);
    });

    handler.on('workerSrc', function wphSetupWorkerSrc(data) {
      // In development, the `workerSrc` message is handled in the
      // `worker_loader.js` file. In production the workerProcessHandler is
      // called for this. This servers as a dummy to prevent calling an
      // undefined action `workerSrc`.
    });

    handler.on('doc', function wphSetupDoc(data) {
      // Create only the model of the PDFDoc, which is enough for
      // processing the content of the pdf.
      pdfDoc = new PDFDocModel(new Stream(data));
    });

    handler.on('page_request', function wphSetupPageRequest(pageNum) {
      pageNum = parseInt(pageNum);

      var page = pdfDoc.getPage(pageNum);

      // The following code does quite the same as
      // Page.prototype.startRendering, but stops at one point and sends the
      // result back to the main thread.
      var gfx = new CanvasGraphics(null);

      var start = Date.now();

      var dependency = [];

      // Pre compile the pdf page and fetch the fonts/images.
      var IRQueue = page.getIRQueue(handler, dependency);

      console.log('page=%d - getIRQueue: time=%dms, len=%d', pageNum,
                                  Date.now() - start, IRQueue.fnArray.length);

      // Filter the dependecies for fonts.
      var fonts = {};
      for (var i = 0, ii = dependency.length; i < ii; i++) {
        var dep = dependency[i];
        if (dep.indexOf('font_') == 0) {
          fonts[dep] = true;
        }
      }

      handler.send('page', {
        pageNum: pageNum,
        IRQueue: IRQueue,
        depFonts: Object.keys(fonts)
      });
    }, this);

    handler.on('font', function wphSetupFont(data) {
      var objId = data[0];
      var name = data[1];
      var file = data[2];
      var properties = data[3];

      var font = {
        name: name,
        file: file,
        properties: properties
      };

      // Some fonts don't have a file, e.g. the build in ones like Arial.
      if (file) {
        var fontFileDict = new Dict();
        fontFileDict.map = file.dict.map;

        var fontFile = new Stream(file.bytes, file.start,
                                  file.end - file.start, fontFileDict);

        // Check if this is a FlateStream. Otherwise just use the created
        // Stream one. This makes complex_ttf_font.pdf work.
        var cmf = file.bytes[0];
        if ((cmf & 0x0f) == 0x08) {
          font.file = new FlateStream(fontFile);
        } else {
          font.file = fontFile;
        }
      }

      var obj = new Font(font.name, font.file, font.properties);

      var str = '';
      var objData = obj.data;
      if (objData) {
        var length = objData.length;
        for (var j = 0; j < length; ++j)
          str += String.fromCharCode(objData[j]);
      }

      obj.str = str;

      // Remove the data array form the font object, as it's not needed
      // anymore as we sent over the ready str.
      delete obj.data;

      handler.send('font_ready', [objId, obj]);
    });
  }
};

var consoleTimer = {};

var workerConsole = {
  log: function log() {
    var args = Array.prototype.slice.call(arguments);
    postMessage({
      action: 'console_log',
      data: args
    });
  },

  error: function error() {
    var args = Array.prototype.slice.call(arguments);
    postMessage({
      action: 'console_error',
      data: args
    });
  },

  time: function time(name) {
    consoleTimer[name] = Date.now();
  },

  timeEnd: function timeEnd(name) {
    var time = consoleTimer[name];
    if (time == null) {
      throw 'Unkown timer name ' + name;
    }
    this.log('Timer:', name, Date.now() - time);
  }
};

// Worker thread?
if (typeof window === 'undefined') {
  globalScope.console = workerConsole;

  var handler = new MessageHandler('worker_processor', this);
  WorkerMessageHandler.setup(handler);
}

