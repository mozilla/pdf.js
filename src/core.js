/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var globalScope = (typeof window === 'undefined') ? this : window;

var ERRORS = 0, WARNINGS = 1, TODOS = 5;
var verbosity = WARNINGS;

// The global PDFJS object exposes the API
// In production, it will be declared outside a global wrapper
// In development, it will be declared here
if (!globalScope.PDFJS) {
  globalScope.PDFJS = {};
}

// getPdf()
// Convenience function to perform binary Ajax GET
// Usage: getPdf('http://...', callback)
//        getPdf({
//                 url:String ,
//                 [,progress:Function, error:Function]
//               },
//               callback)
function getPdf(arg, callback) {
  var params = arg;
  if (typeof arg === 'string')
    params = { url: arg };

  var xhr = new XMLHttpRequest();
  xhr.open('GET', params.url);
  xhr.mozResponseType = xhr.responseType = 'arraybuffer';
  xhr.expected = (document.URL.indexOf('file:') === 0) ? 0 : 200;

  if ('progress' in params)
    xhr.onprogress = params.progress || undefined;

  if ('error' in params)
    xhr.onerror = params.error || undefined;

  xhr.onreadystatechange = function getPdfOnreadystatechange() {
    if (xhr.readyState === 4 && xhr.status === xhr.expected) {
      var data = (xhr.mozResponseArrayBuffer || xhr.mozResponse ||
                  xhr.responseArrayBuffer || xhr.response);
      callback(data);
    }
  };
  xhr.send(null);
}
globalScope.PDFJS.getPdf = getPdf;

var Page = (function pagePage() {
  function constructor(xref, pageNumber, pageDict, ref) {
    this.pageNumber = pageNumber;
    this.pageDict = pageDict;
    this.stats = {
      create: Date.now(),
      compile: 0.0,
      fonts: 0.0,
      images: 0.0,
      render: 0.0
    };
    this.xref = xref;
    this.ref = ref;
  }

  constructor.prototype = {
    getPageProp: function pageGetPageProp(key) {
      return this.xref.fetchIfRef(this.pageDict.get(key));
    },
    inheritPageProp: function pageInheritPageProp(key) {
      var dict = this.pageDict;
      var obj = dict.get(key);
      while (obj === undefined) {
        dict = this.xref.fetchIfRef(dict.get('Parent'));
        if (!dict)
          break;
        obj = dict.get(key);
      }
      return obj;
    },
    get content() {
      return shadow(this, 'content', this.getPageProp('Contents'));
    },
    get resources() {
      return shadow(this, 'resources', this.inheritPageProp('Resources'));
    },
    get mediaBox() {
      var obj = this.inheritPageProp('MediaBox');
      // Reset invalid media box to letter size.
      if (!isArray(obj) || obj.length !== 4)
        obj = [0, 0, 612, 792];
      return shadow(this, 'mediaBox', obj);
    },
    get view() {
      var obj = this.inheritPageProp('CropBox');
      var view = {
        x: 0,
        y: 0,
        width: this.width,
        height: this.height
      };
      if (isArray(obj) && obj.length == 4) {
        var tl = this.rotatePoint(obj[0], obj[1]);
        var br = this.rotatePoint(obj[2], obj[3]);
        view.x = Math.min(tl.x, br.x);
        view.y = Math.min(tl.y, br.y);
        view.width = Math.abs(tl.x - br.x);
        view.height = Math.abs(tl.y - br.y);
      }

      return shadow(this, 'cropBox', view);
    },
    get annotations() {
      return shadow(this, 'annotations', this.inheritPageProp('Annots'));
    },
    get width() {
      var mediaBox = this.mediaBox;
      var rotate = this.rotate;
      var width;
      if (rotate == 0 || rotate == 180) {
        width = (mediaBox[2] - mediaBox[0]);
      } else {
        width = (mediaBox[3] - mediaBox[1]);
      }
      return shadow(this, 'width', width);
    },
    get height() {
      var mediaBox = this.mediaBox;
      var rotate = this.rotate;
      var height;
      if (rotate == 0 || rotate == 180) {
        height = (mediaBox[3] - mediaBox[1]);
      } else {
        height = (mediaBox[2] - mediaBox[0]);
      }
      return shadow(this, 'height', height);
    },
    get rotate() {
      var rotate = this.inheritPageProp('Rotate') || 0;
      // Normalize rotation so it's a multiple of 90 and between 0 and 270
      if (rotate % 90 != 0) {
        rotate = 0;
      } else if (rotate >= 360) {
        rotate = rotate % 360;
      } else if (rotate < 0) {
        // The spec doesn't cover negatives, assume its counterclockwise
        // rotation. The following is the other implementation of modulo.
        rotate = ((rotate % 360) + 360) % 360;
      }
      return shadow(this, 'rotate', rotate);
    },

    startRenderingFromIRQueue: function pageStartRenderingFromIRQueue(
                                                IRQueue, fonts) {
      var self = this;
      this.IRQueue = IRQueue;
      var gfx = new CanvasGraphics(this.ctx, this.objs);

      var displayContinuation = function pageDisplayContinuation() {
        // Always defer call to display() to work around bug in
        // Firefox error reporting from XHR callbacks.
        setTimeout(function pageSetTimeout() {
          try {
            self.display(gfx, self.callback);
          } catch (e) {
            if (self.callback) self.callback(e.toString());
            throw e;
          }
        });
      };

      this.ensureFonts(fonts,
                       function pageStartRenderingFromIRQueueEnsureFonts() {
        displayContinuation();
      });
    },

    getIRQueue: function pageGetIRQueue(handler, dependency) {
      if (this.IRQueue) {
        // content was compiled
        return this.IRQueue;
      }

      var xref = this.xref;
      var content = xref.fetchIfRef(this.content);
      var resources = xref.fetchIfRef(this.resources);
      if (isArray(content)) {
        // fetching items
        var i, n = content.length;
        for (i = 0; i < n; ++i)
          content[i] = xref.fetchIfRef(content[i]);
        content = new StreamsSequenceStream(content);
      }

      var pe = this.pe = new PartialEvaluator(
                                xref, handler, 'p' + this.pageNumber + '_');
      var IRQueue = {};
      return (this.IRQueue = pe.getIRQueue(content, resources, IRQueue,
                                           dependency));
    },

    ensureFonts: function pageEnsureFonts(fonts, callback) {
      // Convert the font names to the corresponding font obj.
      for (var i = 0, ii = fonts.length; i < ii; i++) {
        fonts[i] = this.objs.objs[fonts[i]].data;
      }

      // Load all the fonts
      var fontObjs = FontLoader.bind(
        fonts,
        function pageEnsureFontsFontObjs(fontObjs) {
          this.stats.fonts = Date.now();

          callback.call(this);
        }.bind(this),
        this.objs
      );
    },

    display: function pageDisplay(gfx, callback) {
      var xref = this.xref;
      var resources = xref.fetchIfRef(this.resources);
      var mediaBox = xref.fetchIfRef(this.mediaBox);
      assertWellFormed(isDict(resources), 'invalid page resources');

      gfx.xref = xref;
      gfx.res = resources;
      gfx.beginDrawing({ x: mediaBox[0], y: mediaBox[1],
            width: this.width,
            height: this.height,
            rotate: this.rotate });

      var startIdx = 0;
      var length = this.IRQueue.fnArray.length;
      var IRQueue = this.IRQueue;

      var self = this;
      function next() {
        startIdx = gfx.executeIRQueue(IRQueue, startIdx, next);
        if (startIdx == length) {
          self.stats.render = Date.now();
          if (callback) callback();
        }
      }
      next();
    },
    rotatePoint: function pageRotatePoint(x, y, reverse) {
      var rotate = reverse ? (360 - this.rotate) : this.rotate;
      switch (rotate) {
        case 180:
          return {x: this.width - x, y: y};
        case 90:
          return {x: this.width - y, y: this.height - x};
        case 270:
          return {x: y, y: x};
        case 360:
        case 0:
        default:
          return {x: x, y: this.height - y};
      }
    },
    getLinks: function pageGetLinks() {
      var xref = this.xref;
      var annotations = xref.fetchIfRef(this.annotations) || [];
      var i, n = annotations.length;
      var links = [];
      for (i = 0; i < n; ++i) {
        var annotation = xref.fetch(annotations[i]);
        if (!isDict(annotation))
          continue;
        var subtype = annotation.get('Subtype');
        if (!isName(subtype) || subtype.name != 'Link')
          continue;
        var rect = annotation.get('Rect');
        var topLeftCorner = this.rotatePoint(rect[0], rect[1]);
        var bottomRightCorner = this.rotatePoint(rect[2], rect[3]);

        var link = {};
        link.x = Math.min(topLeftCorner.x, bottomRightCorner.x);
        link.y = Math.min(topLeftCorner.y, bottomRightCorner.y);
        link.width = Math.abs(topLeftCorner.x - bottomRightCorner.x);
        link.height = Math.abs(topLeftCorner.y - bottomRightCorner.y);
        var a = this.xref.fetchIfRef(annotation.get('A'));
        if (a) {
          switch (a.get('S').name) {
            case 'URI':
              link.url = a.get('URI');
              break;
            case 'GoTo':
              link.dest = a.get('D');
              break;
            default:
              TODO('other link types');
          }
        } else if (annotation.has('Dest')) {
          // simple destination link
          var dest = annotation.get('Dest');
          link.dest = isName(dest) ? dest.name : dest;
        }
        links.push(link);
      }
      return links;
    },
    startRendering: function pageStartRendering(ctx, callback)  {
      this.ctx = ctx;
      this.callback = callback;

      this.startRenderingTime = Date.now();
      this.pdf.startRendering(this);
    }
  };

  return constructor;
})();

/**
 * The `PDFDocModel` holds all the data of the PDF file. Compared to the
 * `PDFDoc`, this one doesn't have any job management code.
 * Right now there exists one PDFDocModel on the main thread + one object
 * for each worker. If there is no worker support enabled, there are two
 * `PDFDocModel` objects on the main thread created.
 * TODO: Refactor the internal object structure, such that there is no
 * need for the `PDFDocModel` anymore and there is only one object on the
 * main thread and not one entire copy on each worker instance.
 */
var PDFDocModel = (function pdfDoc() {
  function constructor(arg, callback) {
    if (isStream(arg))
      init.call(this, arg);
    else if (isArrayBuffer(arg))
      init.call(this, new Stream(arg));
    else
      error('PDFDocModel: Unknown argument type');
  }

  function init(stream) {
    assertWellFormed(stream.length > 0, 'stream must have data');
    this.stream = stream;
    this.setup();
  }

  function find(stream, needle, limit, backwards) {
    var pos = stream.pos;
    var end = stream.end;
    var str = '';
    if (pos + limit > end)
      limit = end - pos;
    for (var n = 0; n < limit; ++n)
      str += stream.getChar();
    stream.pos = pos;
    var index = backwards ? str.lastIndexOf(needle) : str.indexOf(needle);
    if (index == -1)
      return false; /* not found */
    stream.pos += index;
    return true; /* found */
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
      return shadow(this, 'linearization', linearization);
    },
    get startXRef() {
      var stream = this.stream;
      var startXRef = 0;
      var linearization = this.linearization;
      if (linearization) {
        // Find end of first obj.
        stream.reset();
        if (find(stream, 'endobj', 1024))
          startXRef = stream.pos + 6;
      } else {
        // Find startxref at the end of the file.
        var start = stream.end - 1024;
        if (start < 0)
          start = 0;
        stream.pos = start;
        if (find(stream, 'startxref', 1024, true)) {
          stream.skip(9);
          var ch;
          do {
            ch = stream.getChar();
          } while (Lexer.isSpace(ch));
          var str = '';
          while ((ch - '0') <= 9) {
            str += ch;
            ch = stream.getChar();
          }
          startXRef = parseInt(str, 10);
          if (isNaN(startXRef))
            startXRef = 0;
        }
      }
      // shadow the prototype getter with a data property
      return shadow(this, 'startXRef', startXRef);
    },
    get mainXRefEntriesOffset() {
      var mainXRefEntriesOffset = 0;
      var linearization = this.linearization;
      if (linearization)
        mainXRefEntriesOffset = linearization.mainXRefEntriesOffset;
      // shadow the prototype getter with a data property
      return shadow(this, 'mainXRefEntriesOffset', mainXRefEntriesOffset);
    },
    // Find the header, remove leading garbage and setup the stream
    // starting from the header.
    checkHeader: function pdfDocCheckHeader() {
      var stream = this.stream;
      stream.reset();
      if (find(stream, '%PDF-', 1024)) {
        // Found the header, trim off any garbage before it.
        stream.moveStart();
        return;
      }
      // May not be a PDF file, continue anyway.
    },
    setup: function pdfDocSetup(ownerPassword, userPassword) {
      this.checkHeader();
      this.xref = new XRef(this.stream,
                           this.startXRef,
                           this.mainXRefEntriesOffset);
      this.catalog = new Catalog(this.xref);
    },
    get numPages() {
      var linearization = this.linearization;
      var num = linearization ? linearization.numPages : this.catalog.numPages;
      // shadow the prototype getter
      return shadow(this, 'numPages', num);
    },
    getPage: function pdfDocGetPage(n) {
      return this.catalog.getPage(n);
    }
  };

  return constructor;
})();

var PDFDoc = (function pdfDoc() {
  function constructor(arg, callback) {
    var stream = null;
    var data = null;

    if (isStream(arg)) {
      stream = arg;
      data = arg.bytes;
    } else if (isArrayBuffer(arg)) {
      stream = new Stream(arg);
      data = arg;
    } else {
      error('PDFDoc: Unknown argument type');
    }

    this.data = data;
    this.stream = stream;
    this.pdf = new PDFDocModel(stream);

    this.catalog = this.pdf.catalog;
    this.objs = new PDFObjects();

    this.pageCache = [];
    this.fontsLoading = {};
    this.workerReadyPromise = new Promise('workerReady');

    // If worker support isn't disabled explicit and the browser has worker
    // support, create a new web worker and test if it/the browser fullfills
    // all requirements to run parts of pdf.js in a web worker.
    // Right now, the requirement is, that an Uint8Array is still an Uint8Array
    // as it arrives on the worker. Chrome added this with version 15.
    if (!globalScope.PDFJS.disableWorker && typeof Worker !== 'undefined') {
      var workerSrc = PDFJS.workerSrc;
      if (typeof workerSrc === 'undefined') {
        throw 'No PDFJS.workerSrc specified';
      }

      var worker;
      try {
        worker = new Worker(workerSrc);
      } catch (e) {
        // Some versions of FF can't create a worker on localhost, see:
        // https://bugzilla.mozilla.org/show_bug.cgi?id=683280
        globalScope.PDFJS.disableWorker = true;
        this.setupFakeWorker();
        return;
      }

      var messageHandler = new MessageHandler('main', worker);

      // Tell the worker the file it was created from.
      messageHandler.send('workerSrc', workerSrc);

      messageHandler.on('test', function pdfDocTest(supportTypedArray) {
        if (supportTypedArray) {
          this.worker = worker;
          this.setupMessageHandler(messageHandler);
        } else {
          this.setupFakeWorker();
        }
      }.bind(this));

      var testObj = new Uint8Array(1);
      messageHandler.send('test', testObj);
    } else {
      this.setupFakeWorker();
    }
  }

  constructor.prototype = {
    setupFakeWorker: function() {
      // If we don't use a worker, just post/sendMessage to the main thread.
      var fakeWorker = {
        postMessage: function pdfDocPostMessage(obj) {
          fakeWorker.onmessage({data: obj});
        },
        terminate: function pdfDocTerminate() {}
      };

      var messageHandler = new MessageHandler('main', fakeWorker);
      this.setupMessageHandler(messageHandler);

      // If the main thread is our worker, setup the handling for the messages
      // the main thread sends to it self.
      WorkerMessageHandler.setup(messageHandler);
    },


    setupMessageHandler: function(messageHandler) {
      this.messageHandler = messageHandler;

      messageHandler.on('page', function pdfDocPage(data) {
        var pageNum = data.pageNum;
        var page = this.pageCache[pageNum];
        var depFonts = data.depFonts;

        page.startRenderingFromIRQueue(data.IRQueue, depFonts);
      }, this);

      messageHandler.on('obj', function pdfDocObj(data) {
        var id = data[0];
        var type = data[1];

        switch (type) {
          case 'JpegStream':
            var IR = data[2];
            new JpegImageLoader(id, IR, this.objs);
            break;
          case 'Font':
            var name = data[2];
            var file = data[3];
            var properties = data[4];

            if (file) {
              var fontFileDict = new Dict();
              fontFileDict.map = file.dict.map;

              var fontFile = new Stream(file.bytes, file.start,
                                        file.end - file.start, fontFileDict);

              // Check if this is a FlateStream. Otherwise just use the created
              // Stream one. This makes complex_ttf_font.pdf work.
              var cmf = file.bytes[0];
              if ((cmf & 0x0f) == 0x08) {
                file = new FlateStream(fontFile);
              } else {
                file = fontFile;
              }
            }

            // For now, resolve the font object here direclty. The real font
            // object is then created in FontLoader.bind().
            this.objs.resolve(id, {
              name: name,
              file: file,
              properties: properties
            });
            break;
          default:
            throw 'Got unkown object type ' + type;
        }
      }, this);

      messageHandler.on('font_ready', function pdfDocFontReady(data) {
        var id = data[0];
        var font = new FontShape(data[1]);

        // If there is no string, then there is nothing to attach to the DOM.
        if (!font.str) {
          this.objs.resolve(id, font);
        } else {
          this.objs.setData(id, font);
        }
      }.bind(this));

      setTimeout(function pdfDocFontReadySetTimeout() {
        messageHandler.send('doc', this.data);
        this.workerReadyPromise.resolve(true);
      }.bind(this));
    },

    get numPages() {
      return this.pdf.numPages;
    },

    startRendering: function pdfDocStartRendering(page) {
      // The worker might not be ready to receive the page request yet.
      this.workerReadyPromise.then(function pdfDocStartRenderingThen() {
        this.messageHandler.send('page_request', page.pageNumber + 1);
      }.bind(this));
    },

    getPage: function pdfDocGetPage(n) {
      if (this.pageCache[n])
        return this.pageCache[n];

      var page = this.pdf.getPage(n);
      // Add a reference to the objects such that Page can forward the reference
      // to the CanvasGraphics and so on.
      page.objs = this.objs;
      page.pdf = this;
      return (this.pageCache[n] = page);
    },

    destroy: function pdfDocDestroy() {
      if (this.worker)
        this.worker.terminate();

      if (this.fontWorker)
        this.fontWorker.terminate();

      for (var n in this.pageCache)
        delete this.pageCache[n];

      delete this.data;
      delete this.stream;
      delete this.pdf;
      delete this.catalog;
    }
  };

  return constructor;
})();

globalScope.PDFJS.PDFDoc = PDFDoc;

