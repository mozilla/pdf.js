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

