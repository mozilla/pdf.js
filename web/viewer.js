/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var kDefaultURL = 'compressed.tracemonkey-pldi-09.pdf';
var kDefaultScale = 150;

var kCacheSize = 20;

var Cache = function(size) {
  var data = [];
  this.push = function(view) {
    data.push(view);
    if (data.length > size)
      data.shift().update();
  };
};

var cache = new Cache(kCacheSize);

var PDFView = {
  pages: [],
  thumbnails: [],

  set scale(val) {
    var options = document.getElementById('scaleSelect').options;
    for (var i = 0; i < options.length; i++) {
      var option = options[i];
      option.selected = (option.value == val);
    }

    var pages = this.pages;
    var cssUnits = 96.0 / 72.0;
    for (var i = 0; i < pages.length; i++)
      pages[i].update(val / 100 * cssUnits);

    // Jump the scroll position to the correct page.
    this.page = this.page;
  },

  set page(val) {
    var pages = this.pages;
    var input = document.getElementById('pageNumber');
    if (val <= 0 || val > pages.length) {
      input.value = this.page;
      return;
    }

    document.location.hash = val;
    document.getElementById('previous').disabled = (val == 1);
    document.getElementById('next').disabled = (val == pages.length);
    if (input.value == val)
      return;

    input.value = val;
    pages[val - 1].draw();
  },

  get page() {
    return parseInt(document.location.hash.substring(1)) || 1;
  },

  open: function(url, scale) {
    if (url.indexOf('http') == 0)
      return;

    document.title = url;

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.mozResponseType = xhr.responseType = 'arraybuffer';
    xhr.expected = (document.URL.indexOf('file:') === 0) ? 0 : 200;

    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4 && xhr.status === xhr.expected) {
        var data = (xhr.mozResponseArrayBuffer || xhr.mozResponse ||
                    xhr.responseArrayBuffer || xhr.response);

        PDFView.load(data, scale);
      }
    };

    xhr.send(null);
  },

  load: function(data, scale) {
    var sidebar = document.getElementById('sidebarView');
    sidebar.parentNode.scrollTop = 0;

    while (sidebar.hasChildNodes())
      sidebar.removeChild(sidebar.lastChild);
    clearInterval(sidebar._loadingInterval);

    var container = document.getElementById('viewer');
    while (container.hasChildNodes())
      container.removeChild(container.lastChild);

    var pdf = new PDFDoc(new Stream(data));
    var pagesCount = pdf.numPages;
    document.getElementById('numPages').innerHTML = pagesCount;

    var pages = this.pages = [];
    var thumbnails = this.thumbnails = [];
    for (var i = 1; i <= pagesCount; i++) {
      var page = pdf.getPage(i);
      pages.push(new PageView(container, page, i, page.width, page.height,
                              page.stats));
      thumbnails.push(new ThumbnailView(sidebar, pages[i - 1]));
    }

    this.scale = (scale || kDefaultScale);
    this.page = parseInt(document.location.hash.substring(1)) || 1;
  },

  getVisiblePages: function() {
    var pages = this.pages;
    var kBottomMargin = 10;
    var visiblePages = [];

    var currentHeight = kBottomMargin;
    var windowTop = window.pageYOffset;
    for (var i = 1; i <= pages.length; i++) {
      var page = pages[i - 1];
      var pageHeight = page.height * page.scale + kBottomMargin;
      if (currentHeight + pageHeight > windowTop)
        break;

      currentHeight += pageHeight;
    }

    var windowBottom = window.pageYOffset + window.innerHeight;
    for (; i <= pages.length && currentHeight < windowBottom; i++) {
      var page = pages[i - 1];
      visiblePages.push({ id: page.id, y: currentHeight, view: page });
      currentHeight += page.height * page.scale + kBottomMargin;
    }

    return visiblePages;
  }
};

var PageView = function(container, content, id, width, height, stats) {
  this.width = width;
  this.height = height;
  this.id = id;
  this.content = content;

  var anchor = document.createElement('a');
  anchor.name = '' + this.id;

  var div = document.createElement('div');
  div.id = 'pageContainer' + this.id;
  div.className = 'page';

  container.appendChild(anchor);
  container.appendChild(div);

  this.update = function(scale) {
    this.scale = scale || this.scale;
    div.style.width = (this.width * this.scale) + 'px';
    div.style.height = (this.height * this.scale) + 'px';

    while (div.hasChildNodes())
      div.removeChild(div.lastChild);
  };

  this.draw = function() {
    if (div.hasChildNodes()) {
      this.updateStats();
      return false;
    }

    var canvas = document.createElement('canvas');
    canvas.id = 'page' + this.id;
    canvas.mozOpaque = true;

    canvas.width = this.width * this.scale;
    canvas.height = this.height * this.scale;
    div.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    ctx.save();
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    stats.begin = Date.now();
    this.content.startRendering(ctx, this.updateStats);

    return true;
  };

  this.updateStats = function() {
    var t1 = stats.compile, t2 = stats.fonts, t3 = stats.render;
    var str = 'Time to compile/fonts/render: ' +
              (t1 - stats.begin) + '/' + (t2 - t1) + '/' + (t3 - t2) + ' ms';
    document.getElementById('info').innerHTML = str;
  };
};

var ThumbnailView = function(container, page) {
  var anchor = document.createElement('a');
  anchor.href = '#' + page.id;

  var div = document.createElement('div');
  div.id = 'thumbnailContainer' + page.id;
  div.className = 'thumbnail';

  anchor.appendChild(div);
  container.appendChild(anchor);

  this.draw = function() {
    if (div.hasChildNodes())
      return;

    var canvas = document.createElement('canvas');
    canvas.id = 'thumbnail' + page.id;
    canvas.mozOpaque = true;

    canvas.width = 104;
    canvas.height = 134;
    div.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    ctx.save();
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    page.content.startRendering(ctx, function() { });
  };
};

window.addEventListener('load', function(evt) {
  var params = document.location.search.substring(1).split('&');
  for (var i = 0; i < params.length; i++) {
    var param = params[i].split('=');
    params[unescape(param[0])] = unescape(param[1]);
  }

  PDFView.open(params.file || kDefaultURL, parseInt(params.scale));

  if (!window.File || !window.FileReader || !window.FileList || !window.Blob)
    document.getElementById('fileInput').style.display = 'none';
  else
    document.getElementById('fileInput').value = null;
}, true);

window.addEventListener('pdfloaded', function(evt) {
  PDFView.load(evt.detail);
}, true);

window.addEventListener('scroll', function(evt) {
  var visiblePages = PDFView.getVisiblePages();
  for (var i = 0; i < visiblePages.length; i++) {
    var page = visiblePages[i];
    if (PDFView.pages[page.id - 1].draw())
      cache.push(page.view);
  }

  if (!visiblePages.length)
    return;

  var currentId = PDFView.page;
  var firstPage = visiblePages[0];
  var lastPage = visiblePages[visiblePages.length - 1];
  if (currentId > lastPage.id && lastPage.y > window.pageYOffset)
    PDFView.page = lastPage.id;
  else if (currentId < firstPage.id)
    PDFView.page = firstPage.id;
}, true);

window.addEventListener('hashchange', function(evt) {
  PDFView.page = PDFView.page;
});

window.addEventListener('change', function(evt) {
  var files = evt.target.files;
  if (!files || files.length == 0)
    return;

  // Read the local file into a Uint8Array.
  var fileReader = new FileReader();
  fileReader.onload = function(evt) {
    var data = evt.target.result;
    var buffer = new ArrayBuffer(data.length);
    var uint8Array = new Uint8Array(buffer);

    for (var i = 0; i < data.length; i++)
      uint8Array[i] = data.charCodeAt(i);
    PDFView.load(uint8Array);
  };

  // Read as a binary string since "readAsArrayBuffer" is not yet
  // implemented in Firefox.
  var file = files[0];
  fileReader.readAsBinaryString(file);

  document.title = file.name;
  document.location.hash = 1;
}, true);

window.addEventListener('transitionend', function(evt) {
  var pageIndex = 0;
  var pagesCount = PDFView.pages.length;

  var container = document.getElementById('sidebarView');
  container._interval = window.setInterval(function() {
    if (pageIndex >= pagesCount)
      return window.clearInterval(container._interval);

    PDFView.thumbnails[pageIndex++].draw();
  }, 500);
}, true);

