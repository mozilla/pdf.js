/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- /
/* vim: set shiftwidth=4 tabstop=8 autoindent cindent expandtab: */

var pdfDocument, canvas, pageDisplay, pageNum;
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
    for (var i = 0; i < fonts.length; i++) {
      var fontName = fonts[i].replace("+", "_");
      var font = Fonts[fontName];
      if (!font) {
        // load the new font
        var xref = page.xref;
        var resources = xref.fetchIfRef(page.resources);
        var fontResource = resources.get("Font");
        for (var id in fontResource.map) {
          var res = xref.fetch(fontResource.get(id));
          var descriptor = xref.fetch(res.get("FontDescriptor"));
          var name = descriptor.get("FontName").toString();
          if (name == fontName.replace("_", "+")) {
            var subtype = res.get("Subtype").name;
            var fontFile = page.xref.fetchIfRef(descriptor.get("FontFile"));
            if (!fontFile)
              fontFile = page.xref.fetchIfRef(descriptor.get("FontFile2"));
            new Font(fontName, fontFile, subtype);
            fontsReady = false;
            break;
          }
        }
      } else if (font.loading) {
        fontsReady = false;
        break;
      }
    }

    // If everything is ready do not delayed the page loading any more
    if (fontsReady)
      display();
    else
      setTimeout(displayPage, 150, num);
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

