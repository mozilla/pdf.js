/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- /
/* vim: set shiftwidth=4 tabstop=8 autoindent cindent expandtab: */

var pdfDocument, canvas, pageDisplay, pageNum, pageTimeout;
function load() {
    canvas = document.getElementById("canvas");
    canvas.mozOpaque = true;
    pageNum = parseInt(queryParams().page) || 1;
    fileName = queryParams().file || "compressed.tracemonkey-pldi-09.pdf";
    open(fileName);
}

function queryParams() {
    var qs = window.location.search.substring(1);
    var kvs = qs.split("&");
    var params = { };
    for (var i = 0; i < kvs.length; ++i) {
        var kv = kvs[i].split("=");
        params[unescape(kv[0])] = unescape(kv[1]);
    }
    return params;
}

function open(url) {
    document.title = url;
    req = new XMLHttpRequest();
    req.open("GET", url);
    req.mozResponseType = req.responseType = "arraybuffer";
    req.expected = (document.URL.indexOf("file:") == 0) ? 0 : 200;
    req.onreadystatechange = function() {
      if (req.readyState == 4 && req.status == req.expected) {
        var data = req.mozResponseArrayBuffer || req.mozResponse ||
                   req.responseArrayBuffer || req.response;
        pdfDocument = new PDFDoc(new Stream(data));
        numPages = pdfDocument.numPages;
        document.getElementById("numPages").innerHTML = numPages.toString();
        goToPage(pageNum);
      }
    };
    req.send(null);
}

function gotoPage(num) {
    if (0 <= num && num <= numPages)
        pageNum = num;
    displayPage(pageNum);
}

function displayPage(num) {
    if (pageNum != num)
      window.clearTimeout(pageTimeout);

    document.getElementById("pageNumber").value = num;

    var t0 = Date.now();

    var page = pdfDocument.getPage(pageNum = num);

    function display() {
      var t1 = Date.now();
      var ctx = canvas.getContext("2d");
      ctx.save();
      ctx.fillStyle = "rgb(255, 255, 255)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      var gfx = new CanvasGraphics(ctx);
      page.display(gfx);

      var t2 = Date.now();
      var infoDisplay = document.getElementById("info");
      infoDisplay.innerHTML = "Time to render: "+ (t1 - t0) + "/" + (t2 - t1) + " ms";
    }

    // Loading a font via data uri is asynchronous, so wait for all font
    // of the page to be fully loaded before loading the page
    var fontsReady = true;
    var fonts = page.fonts;
    var xref = page.xref;
    fonts.forEach(function(fontKey, fontDict) {
        var descriptor = xref.fetch(fontDict.get("FontDescriptor"));
        var fontName = descriptor.get("FontName").name;
        fontName = fontName.replace("+", "_");

        // Check if the font has been loaded or is still loading
        var font = Fonts[fontName];
        if (!font) {
            var fontFile = descriptor.get2("FontFile", "FontFile2");
            fontFile = xref.fetchIfRef(fontFile);

            // Generate the custom cmap of the font if needed
            var encodingMap = {};
            if (fontDict.has("Encoding")) {
              var encoding = xref.fetchIfRef(fontDict.get("Encoding"));
              if (IsDict(encoding)) {
                var differences = encoding.get("Differences");
                var index = 0;
                for (var j = 0; j < differences.length; j++) {
                  var data = differences[j];
                  IsNum(data) ? index = data : encodingMap[index++] = data;
                }
              }
            }

            var subtype = fontDict.get("Subtype").name;
            new Font(fontName, fontFile, encodingMap, subtype);
            return fontsReady = false;
        } else if (font.loading) {
            return fontsReady = false;
        }
      });

    // If everything is ready do not delayed the page loading any more
    if (fontsReady)
      display();
    else {
      // FIXME Relying on an event seems much more cleaner here instead
      // of a setTimeout...
      pageTimeout = window.setTimeout(displayPage, 150, num);
    }
}

function nextPage() {
    if (pageNum < pdfDocument.numPages)
      displayPage(++pageNum);
}

function prevPage() {
    if (pageNum > 1)
      displayPage(--pageNum);
}

function goToPage(num) {
  if (0 <= num && num <= numPages)
    displayPage(pageNum = num);
}

