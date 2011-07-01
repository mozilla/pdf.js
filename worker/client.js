/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

"use strict";

if (typeof console.time == "undefined") {
  var consoleTimer = {};
  console.time = function(name) {
    consoleTimer[name] = Date.now();
  };
  
  console.timeEnd = function(name) {
    var time = consoleTimer[name];
    if (time == null) {
      throw "Unkown timer name " + name;
    }
    this.log("Timer:", name, Date.now() - time);
  };
}

function FontWorker() {
  this.worker = new Worker("worker/font.js");
  this.fontsWaiting = 0;
  this.fontsWaitingCallbacks = [];

  // Listen to the WebWorker for data and call actionHandler on it.
  this.worker.onmessage = function(event) {
    var data = event.data;
    var actionHandler = this.actionHandler
    if (data.action in actionHandler) {
      actionHandler[data.action].call(this, data.data);
    } else {
      throw "Unkown action from worker: " + data.action;
    }
  }.bind(this);
  
  this.$handleFontLoadedCallback = this.handleFontLoadedCallback.bind(this);
}

FontWorker.prototype = {
  handleFontLoadedCallback: function() {
    // Decrease the number of fonts wainting to be loaded.
    this.fontsWaiting--;
    // If all fonts are available now, then call all the callbacks.
    if (this.fontsWaiting == 0) {
      var callbacks = this.fontsWaitingCallbacks;
      for (var i = 0; i < callbacks.length; i++) {
        callbacks[i]();
      }
      this.fontsWaitingCallbacks.length = 0;
    }
  },
  
  actionHandler: {
    "log": function(data) {
      console.log.apply(console, data);
    },
    
    "fonts": function(data) {
      // console.log("got processed fonts from worker", Object.keys(data));
      for (name in data) {
        // Update the encoding property.
        var font = Fonts.lookup(name);
        font.properties = {
          encoding: data[name].encoding
        }

        // Call `Font.prototype.bindDOM` to make the font get loaded on the page.
        Font.prototype.bindDOM.call(
          font,
          data[name].str,
          // IsLoadedCallback.
          this.$handleFontLoadedCallback
        );
      }
    }
  },

  ensureFonts: function(data, callback) {
    var font;
    var notLoaded = [];
    for (var i = 0; i < data.length; i++) {
      font = data[i];
      if (Fonts[font.name]) {
        continue;
      }
    
      // Register the font but don't pass in any real data. The idea is to
      // store as less data as possible to reduce memory usage.
      Fonts.registerFont(font.name, Object.create(null), Object.create(null));

      // Mark this font to be handled later.
      notLoaded.push(font);
      // Increate the number of fonts to wait for.
      this.fontsWaiting++;
    }
    
    console.time("ensureFonts");
    // If there are fonts, that need to get loaded, tell the FontWorker to get
    // started and push the callback on the waiting-callback-stack.
    if (notLoaded.length != 0) {
      console.log("fonts -> FontWorker");
      // Send the worker the fonts to work on.
      this.worker.postMessage({
        action: "fonts",
        data:   notLoaded
      });
      if (callback) {
        this.fontsWaitingCallbacks.push(callback);
      }
    }
    // All fonts are present? Well, then just call the callback if there is one.
    else {
      if (callback) {
        callback();
      }
    }
  },
}

function WorkerPDFDoc(canvas) {
  var timer = null

  this.ctx = canvas.getContext("2d");
  this.canvas = canvas;
  this.worker = new Worker('worker/pdf.js');
  this.fontWorker = new FontWorker();
  this.waitingForFonts = false;
  this.waitingForFontsCallback = [];

  this.numPage = 1;
  this.numPages = null;

  var imagesList = {};
  var canvasList = {
    0: canvas
  };
  var patternList = {};
  var gradient;

  var currentX = 0;
  var currentXStack = [];

  var ctxSpecial = {
    "$setCurrentX": function(value) {
      currentX = value;
    },

    "$addCurrentX": function(value) {
      currentX += value;
    },

    "$saveCurrentX": function() {
      currentXStack.push(currentX);
    },

    "$restoreCurrentX": function() {
      currentX = currentXStack.pop();
    },

    "$showText": function(y, text) {
      text = Fonts.charsToUnicode(text);
      this.translate(currentX, -1 * y);
      this.fillText(text, 0, 0);
      currentX += this.measureText(text).width;
    },

    "$putImageData": function(imageData, x, y) {
      var imgData = this.getImageData(0, 0, imageData.width, imageData.height);

      // Store the .data property to avaid property lookups.
      var imageRealData = imageData.data;
      var imgRealData = imgData.data;

      // Copy over the imageData.
      var len = imageRealData.length;
      while (len--)
      imgRealData[len] = imageRealData[len]

      this.putImageData(imgData, x, y);
    },

    "$drawImage": function(id, x, y, sx, sy, swidth, sheight) {
      var image = imagesList[id];
      if (!image) {
        throw "Image not found: " + id;
      }
      this.drawImage(image, x, y, image.width, image.height,
        sx, sy, swidth, sheight);
    },

    "$drawCanvas": function(id, x, y, sx, sy, swidth, sheight) {
      var canvas = canvasList[id];
      if (!canvas) {
        throw "Canvas not found";
      }
      if (sheight != null) {
        this.drawImage(canvas, x, y, canvas.width, canvas.height,
          sx, sy, swidth, sheight);
      } else {
        this.drawImage(canvas, x, y, canvas.width, canvas.height);
      }
    },

    "$createLinearGradient": function(x0, y0, x1, y1) {
      gradient = this.createLinearGradient(x0, y0, x1, y1);
    },

    "$createPatternFromCanvas": function(patternId, canvasId, kind) {
      var canvas = canvasList[canvasId];
      if (!canvas) {
        throw "Canvas not found";
      }
      patternList[patternId] = this.createPattern(canvas, kind);
    },

    "$addColorStop": function(i, rgba) {
      gradient.addColorStop(i, rgba);
    },

    "$fillStyleGradient": function() {
      this.fillStyle = gradient;
    },

    "$fillStylePattern": function(id) {
      var pattern = patternList[id];
      if (!pattern) {
        throw "Pattern not found";
      }
      this.fillStyle = pattern;
    },

    "$strokeStyleGradient": function() {
      this.strokeStyle = gradient;
    },

    "$strokeStylePattern": function(id) {
      var pattern = patternList[id];
      if (!pattern) {
        throw "Pattern not found";
      }
      this.strokeStyle = pattern;
    },

    "$setFont": function(name, size) {
      this.font = size + 'px "' + name + '"';
      Fonts.setActive(name, size);
    }
  }

  function renderProxyCanvas(canvas, cmdQueue) {
    var ctx = canvas.getContext("2d");
    var cmdQueueLength = cmdQueue.length;
    for (var i = 0; i < cmdQueueLength; i++) {
      var opp = cmdQueue[i];
      if (opp[0] == "$") {
        ctx[opp[1]] = opp[2];
      } else if (opp[0] in ctxSpecial) {
        ctxSpecial[opp[0]].apply(ctx, opp[1]);
      } else {
        ctx[opp[0]].apply(ctx, opp[1]);
      }
    }
  }

  /**
  * Functions to handle data sent by the WebWorker.
  */
  var actionHandler = {
    "log": function(data) {
      console.log.apply(console, data);
    },
    
    "pdf_num_pages": function(data) {
      this.numPages = parseInt(data);
      if (this.loadCallback) {
        this.loadCallback();
      }
    },
    
    "font": function(data) {
      var base64 = window.btoa(data.raw);

      // Add the @font-face rule to the document
      var url = "url(data:" + data.mimetype + ";base64," + base64 + ");";
      var rule = "@font-face { font-family:'" + data.fontName + "';src:" + url + "}";
      var styleSheet = document.styleSheets[0];
      styleSheet.insertRule(rule, styleSheet.length);

      // Just adding the font-face to the DOM doesn't make it load. It
      // seems it's loaded once Gecko notices it's used. Therefore,
      // add a div on the page using the loaded font.
      var div = document.createElement("div");
      var style = 'font-family:"' + data.fontName + 
        '";position: absolute;top:-99999;left:-99999;z-index:-99999';
      div.setAttribute("style", style);
      document.body.appendChild(div);
    },
    
    "setup_page": function(data) {
      var size = data.split(",");
      var canvas = this.canvas, ctx = this.ctx;
      canvas.width = parseInt(size[0]);
      canvas.height = parseInt(size[1]);
    },

    "fonts": function(data) {
      this.waitingForFonts = true;
      this.fontWorker.ensureFonts(data, function() {
        this.waitingForFonts = false;
        var callbacks = this.waitingForFontsCallback;
        for (var i = 0; i < callbacks.length; i++) {
          callbacks[i]();
        }
        this.waitingForFontsCallback.length = 0;
      }.bind(this));
    },

    "jpeg_stream": function(data) {
      var img = new Image();
      img.src = "data:image/jpeg;base64," + window.btoa(data.raw);
      imagesList[data.id] = img;
    },
    
    "canvas_proxy_cmd_queue": function(data) {
        var id = data.id;
        var cmdQueue = data.cmdQueue;

        // Check if there is already a canvas with the given id. If not,
        // create a new canvas.
        if (!canvasList[id]) {
          var newCanvas = document.createElement("canvas");
          newCanvas.width = data.width;
          newCanvas.height = data.height;
          canvasList[id] = newCanvas;
        }

        var renderData = function() {
          if (id == 0) {
            console.time("main canvas rendering");
            var ctx = this.ctx;
            ctx.save();
            ctx.fillStyle = "rgb(255, 255, 255)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
          }
          renderProxyCanvas(canvasList[id], cmdQueue);
          if (id == 0) {
            console.timeEnd("main canvas rendering");
            console.timeEnd(">>> total page display time:");
          }
        }.bind(this);

        if (this.waitingForFonts) {
          if (id == 0) {
            console.log("want to render, but not all fonts are there", id);
            this.waitingForFontsCallback.push(renderData);
          } else {
            // console.log("assume canvas doesn't have fonts", id);
            renderData();
          }
        } else {
          renderData();
        }
    }
  }

  // Listen to the WebWorker for data and call actionHandler on it.
  this.worker.onmessage = function(event) {
    var data = event.data;
    if (data.action in actionHandler) {
      actionHandler[data.action].call(this, data.data);
    } else {
      throw "Unkown action from worker: " + data.action;
    }
  }.bind(this)
}

WorkerPDFDoc.prototype.open = function(url, callback) {
  var req = new XMLHttpRequest();
  req.open("GET", url);
  req.mozResponseType = req.responseType = "arraybuffer";
  req.expected = (document.URL.indexOf("file:") == 0) ? 0 : 200;
  req.onreadystatechange = function() {
    if (req.readyState == 4 && req.status == req.expected) {
      var data = req.mozResponseArrayBuffer || req.mozResponse ||
      req.responseArrayBuffer || req.response;

      this.loadCallback = callback;
      this.worker.postMessage(data);
      this.showPage(this.numPage);
    }
  }.bind(this);
  req.send(null);
}

WorkerPDFDoc.prototype.showPage = function(numPage) {
  this.numPage = parseInt(numPage);
  console.log("=== start rendering page " + numPage + " ===");
  console.time(">>> total page display time:");
  this.worker.postMessage(numPage);
  if (this.onChangePage) {
    this.onChangePage(numPage);
  }
}

WorkerPDFDoc.prototype.nextPage = function() {
  if (this.numPage == this.numPages) return;
  this.showPage(++this.numPage);
}

WorkerPDFDoc.prototype.prevPage = function() {
  if (this.numPage == 1) return;
  this.showPage(--this.numPage);
}
