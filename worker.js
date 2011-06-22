"use strict";

function log() {
    var args = Array.prototype.slice.call(arguments);
    postMessage("log");
    postMessage(JSON.stringify(args))
}

var console = {
    log: log
}

importScripts("canvas_proxy.js");
importScripts("pdf.js");
importScripts("fonts.js");
importScripts("glyphlist.js")

// Use the JpegStreamProxy proxy.
JpegStream = JpegStreamProxy;

// var array = new Uint8Array(2);
// array[0] = 1;
// array[1] = 300;
// postMessage(array);

var timer = null;
function tic() {
    timer = Date.now();
}

function toc(msg) {
    log(msg + ": " + (Date.now() - timer) + "ms");
    timer = null;
}


var canvas = new CanvasProxy(1224, 1584);
// canvas.moveTo(0, 10);
// canvas.lineTo(0, 20);
// canvas.lineTo(500, 500);
// canvas.flush();
// canvas.stroke();
// canvas.flush();
log("test");

var pageInterval;
var pdfDocument = null;
onmessage = function(event) {
    var data = event.data;
    if (!pdfDocument) {
        pdfDocument = new PDFDoc(new Stream(data));
        postMessage("pdf_num_page");
        postMessage(pdfDocument.numPages)
        return;
    } else {
        tic();

        // Let's try to render the first page...
        var page = pdfDocument.getPage(parseInt(data));

        // page.compile will collect all fonts for us, once we have loaded them
        // we can trigger the actual page rendering with page.display
        var fonts = [];
        var gfx = new CanvasGraphics(canvas, ImageCanvasProxy);
        page.compile(gfx, fonts);

        // Inspect fonts and translate the missing one.
        var count = fonts.length;
        for (var i = 0; i < count; i++) {
          var font = fonts[i];
          if (Fonts[font.name]) {
            fontsReady = fontsReady && !Fonts[font.name].loading;
            continue;
          }

          // This "builds" the font and sents it over to the main thread.
          new Font(font.name, font.file, font.properties);
        }
        toc("compiled page");

        page.display(gfx);
        canvas.flush();
    }
}
