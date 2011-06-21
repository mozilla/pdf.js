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

// var array = new Uint8Array(2);
// array[0] = 1;
// array[1] = 300;
// postMessage(array);

var timer = null;
function tic() {
    timer = Date.now();
}

function toc(msg) {
    log("Took ", (Date.now() - timer));
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

onmessage = function(event) {
    var data = event.data;
    var pdfDocument = new PDFDoc(new Stream(data));
    var numPages = pdfDocument.numPages;

    tic();
    // Let's try to render the first page...
    var page = pdfDocument.getPage(1);

    // page.compile will collect all fonts for us, once we have loaded them
    // we can trigger the actual page rendering with page.display
    var fonts = [];

    var gfx = new CanvasGraphics(canvas);
    page.compile(gfx, fonts);
    toc("compiled page");

    //
    var fontsReady = true;
        // Inspect fonts and translate the missing one
        var count = fonts.length;
        for (var i = 0; i < count; i++) {
          var font = fonts[i];
          if (Fonts[font.name]) {
            fontsReady = fontsReady && !Fonts[font.name].loading;
            continue;
          }

          new Font(font.name, font.file, font.properties);
          fontsReady = false;
        }

        function delayLoadFont() {
          for (var i = 0; i < count; i++) {
            if (Fonts[font.name].loading)
              return;
          }
          clearInterval(pageInterval);
          page.display(gfx);

          canvas.flush();
        };

        if (fontsReady) {
          delayLoadFont();
        } else {
          pageInterval = setInterval(delayLoadFont, 10);
        }
        postMessage(page.code.src);
}

// function open(url) {
//     var req = new XMLHttpRequest();
//     req.open("GET", url);
//     // req.responseType = "arraybuffer";
//     req.expected = 0;//(document.URL.indexOf("file:") == 0) ? 0 : 200;
//     req.onreadystatechange = function() {
//       postMessage("loaded");
//       if (req.readyState == 4 && req.status == req.expected) {
//         var data = req.mozResponseArrayBuffer || req.mozResponse ||
//                    req.responseArrayBuffer || req.response;
//         pdfDocument = new PDFDoc(new Stream(data));
//         numPages = pdfDocument.numPages;
//         // document.getElementById("numPages").innerHTML = numPages.toString();
//         // goToPage(pageNum);
//       }
//     };
//     req.send(null);
// }
//
// open("compressed.tracemonkey-pldi-09.pdf")