/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var kDefaultURL = 'compressed.tracemonkey-pldi-09.pdf';
var kDefaultScale = 1.5;
var kDefaultScaleDelta = 1.1;
var kCacheSize = 20;
var kCssUnits = 96.0 / 72.0;
var kScrollbarPadding = 40;


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
  currentScale: kDefaultScale,

  setScale: function(val, resetAutoSettings) {
    var pages = this.pages;
    for (var i = 0; i < pages.length; i++)
      pages[i].update(val * kCssUnits);
    this.currentScale = val;

    if (document.location.hash == '#' + this.page)
      this.pages[this.page - 1].draw();
    else
      // Jump the scroll position to the correct page.
      document.location.hash = this.page;

    var event = document.createEvent('UIEvents');
    event.initUIEvent('scalechange', false, false, window, 0);
    event.scale = val;
    event.resetAutoSettings = resetAutoSettings;
    window.dispatchEvent(event);
  },

  parseScale: function(value, resetAutoSettings) {
    if ('custom' == value)
      return;

    var scale = parseFloat(value);
    if (scale) {
      this.setScale(scale, true);
      return;
    }

    var currentPage = this.pages[this.page - 1];
    var pageWidthScale = (window.innerWidth - kScrollbarPadding) /
                          currentPage.width / kCssUnits;
    var pageHeightScale = (window.innerHeight - kScrollbarPadding) /
                           currentPage.height / kCssUnits;
    if ('page-width' == value)
      this.setScale(pageWidthScale, resetAutoSettings);
    if ('page-height' == value)
      this.setScale(pageHeightScale, resetAutoSettings);
    if ('page-fit' == value) {
      this.setScale(
        Math.min(pageWidthScale, pageHeightScale), resetAutoSettings);
    }
  },

  zoomIn: function() {
    this.setScale(this.currentScale * kDefaultScaleDelta, true);
  },

  zoomOut: function() {
    this.setScale(this.currentScale / kDefaultScaleDelta, true);
  },

  set page(val) {
    var pages = this.pages;
    var input = document.getElementById('pageNumber');
    if (!(0 < val && val <= pages.length)) {
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
    return parseInt(document.location.hash.substring(1), 10) || 1;
  },

  open: function(url, scale) {
    if (url.indexOf('http') == 0)
      return;

    document.title = url;

    getPdf(
      {
        url: url,
        progress: function getPdfProgress(evt) {
          if (evt.lengthComputable)
            PDFView.progress(evt.loaded / evt.total);
        },
        error: PDFView.error
      },
      function getPdfLoad(data) {
        PDFView.load(data, scale);
      });
  },

  navigateTo: function(dest) {
    if (typeof dest === 'string')
      dest = this.destinations[dest];
    if (!(dest instanceof Array))
      return; // invalid destination
    // dest array looks like that: <page-ref> </XYZ|FitXXX> <args..>
    var destRef = dest[0];
    var pageNumber = destRef instanceof Object ?
      this.pagesRefMap[destRef.num + ' ' + destRef.gen + ' R'] : (destRef + 1);
    if (pageNumber) {
      this.page = pageNumber;
      var currentPage = this.pages[pageNumber - 1];
      currentPage.scrollIntoView(dest);
    }
  },

  error: function() {
    var loadingIndicator = document.getElementById('loading');
    loadingIndicator.innerHTML = 'Error';
  },

  progress: function(level) {
    var percent = Math.round(level * 100);
    var loadingIndicator = document.getElementById('loading');
    loadingIndicator.innerHTML = 'Loading... ' + percent + '%';
  },

  load: function(data, scale) {
    var loadingIndicator = document.getElementById('loading');
    loadingIndicator.style.display = 'none';

    var sidebar = document.getElementById('sidebarView');
    sidebar.parentNode.scrollTop = 0;

    while (sidebar.hasChildNodes())
      sidebar.removeChild(sidebar.lastChild);
    clearInterval(sidebar._loadingInterval);

    var container = document.getElementById('viewer');
    while (container.hasChildNodes())
      container.removeChild(container.lastChild);

    var pdf = new PDFDoc(data);
    var pagesCount = pdf.numPages;
    document.getElementById('numPages').innerHTML = pagesCount;

    var pages = this.pages = [];
    var pagesRefMap = {};
    var thumbnails = this.thumbnails = [];
    for (var i = 1; i <= pagesCount; i++) {
      var page = pdf.getPage(i);
      pages.push(new PageView(container, page, i, page.width, page.height,
                              page.stats, this.navigateTo.bind(this)));
      thumbnails.push(new ThumbnailView(sidebar, page, i,
                                        page.width / page.height));
      var pageRef = page.ref;
      pagesRefMap[pageRef.num + ' ' + pageRef.gen + ' R'] = i;
    }

    this.setScale(scale || kDefaultScale, true);
    this.page = parseInt(document.location.hash.substring(1), 10) || 1;
    this.pagesRefMap = pagesRefMap;
    this.destinations = pdf.catalog.destinations;
    if (pdf.catalog.documentOutline) {
      this.outline = new DocumentOutlineView(pdf.catalog.documentOutline);
      var outlineSwitchButton = document.getElementById('outlineSwitch');
      outlineSwitchButton.removeAttribute('disabled');
      this.switchSidebarView('outline');
    }
  },

  switchSidebarView: function(view) {
    var thumbsScrollView = document.getElementById('sidebarScrollView');
    var outlineScrollView = document.getElementById('outlineScrollView');
    var thumbsSwitchButton = document.getElementById('thumbsSwitch');
    var outlineSwitchButton = document.getElementById('outlineSwitch');
    switch (view) {
      case 'thumbs':
        thumbsScrollView.style.display = 'block';
        outlineScrollView.style.display = 'none';
        thumbsSwitchButton.setAttribute('data-selected', true);
        outlineSwitchButton.removeAttribute('data-selected');
        break;
      case 'outline':
        thumbsScrollView.style.display = 'none';
        outlineScrollView.style.display = 'block';
        thumbsSwitchButton.removeAttribute('data-selected');
        outlineSwitchButton.setAttribute('data-selected', true);
        break;
    }
  },

  getVisiblePages: function() {
    var pages = this.pages;
    var kBottomMargin = 10;
    var visiblePages = [];

    var currentHeight = kBottomMargin;
    var windowTop = window.pageYOffset;
    for (var i = 1; i <= pages.length; ++i) {
      var page = pages[i - 1];
      var pageHeight = page.height * page.scale + kBottomMargin;
      if (currentHeight + pageHeight > windowTop)
        break;

      currentHeight += pageHeight;
    }

    var windowBottom = window.pageYOffset + window.innerHeight;
    for (; i <= pages.length && currentHeight < windowBottom; ++i) {
      var singlePage = pages[i - 1];
      visiblePages.push({ id: singlePage.id, y: currentHeight,
                          view: singlePage });
      currentHeight += singlePage.height * singlePage.scale + kBottomMargin;
    }

    return visiblePages;
  }
};

var PageView = function(container, content, id, pageWidth, pageHeight,
                        stats, navigateTo) {
  this.id = id;
  this.content = content;

  var view = this.content.view;
  this.x = view.x;
  this.y = view.y;
  this.width = view.width;
  this.height = view.height;

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
    div.removeAttribute('data-loaded');
  };

  function setupLinks(content, scale) {
    function bindLink(link, dest) {
      link.onclick = function() {
        if (dest)
          PDFView.navigateTo(dest);
        return false;
      };
    }

    var links = content.getLinks();
    for (var i = 0; i < links.length; i++) {
      var link = document.createElement('a');
      link.style.left = (Math.floor(links[i].x - view.x) * scale) + 'px';
      link.style.top = (Math.floor(links[i].y - view.y) * scale) + 'px';
      link.style.width = Math.ceil(links[i].width * scale) + 'px';
      link.style.height = Math.ceil(links[i].height * scale) + 'px';
      link.href = links[i].url || '';
      if (!links[i].url)
        bindLink(link, ('dest' in links[i]) ? links[i].dest : null);
      div.appendChild(link);
    }
  }

  this.scrollIntoView = function(dest) {
      var x = 0, y = 0;
      var width = 0, height = 0, widthScale, heightScale;
      var scale = 0;
      switch (dest[1].name) {
        case 'XYZ':
          x = dest[2];
          y = dest[3];
          scale = dest[4];
          break;
        case 'Fit':
        case 'FitB':
          scale = 'page-fit';
          break;
        case 'FitH':
        case 'FitBH':
          y = dest[2];
          scale = 'page-width';
          break;
        case 'FitV':
        case 'FitBV':
          x = dest[2];
          scale = 'page-height';
          break;
        case 'FitR':
          x = dest[2];
          y = dest[3];
          width = dest[4] - x;
          height = dest[5] - y;
          widthScale = (window.innerWidth - kScrollbarPadding) /
            width / kCssUnits;
          heightScale = (window.innerHeight - kScrollbarPadding) /
            height / kCssUnits;
          scale = Math.min(widthScale, heightScale);
          break;
        default:
          return;
      }

      var boundingRect = [
        this.content.rotatePoint(x, y),
        this.content.rotatePoint(x + width, y + height)
      ];

      if (scale)
        PDFView.setScale(scale, true);

      setTimeout(function() {
        // letting page to re-layout before scrolling
        var scale = PDFView.currentScale;
        var x = Math.min(boundingRect[0].x, boundingRect[1].x);
        var y = Math.min(boundingRect[0].y, boundingRect[1].y);
        var width = Math.abs(boundingRect[0].x - boundingRect[1].x);
        var height = Math.abs(boundingRect[0].y - boundingRect[1].y);

        // using temporary div to scroll it into view
        var tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = Math.floor(x * scale) + 'px';
        tempDiv.style.top = Math.floor(y * scale) + 'px';
        tempDiv.style.width = Math.ceil(width * scale) + 'px';
        tempDiv.style.height = Math.ceil(height * scale) + 'px';
        div.appendChild(tempDiv);
        tempDiv.scrollIntoView(true);
        div.removeChild(tempDiv);
      }, 0);
  };

  this.draw = function() {
    if (div.hasChildNodes()) {
      this.updateStats();
      return false;
    }

    var canvas = document.createElement('canvas');
    canvas.id = 'page' + this.id;
    canvas.mozOpaque = true;

    var scale = this.scale;
    canvas.width = pageWidth * scale;
    canvas.height = pageHeight * scale;
    div.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    ctx.save();
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.translate(-this.x * scale, -this.y * scale);

    stats.begin = Date.now();
    this.content.startRendering(ctx, this.updateStats);

    setupLinks(this.content, this.scale);
    div.setAttribute('data-loaded', true);

    return true;
  };

  this.updateStats = function() {
    var t1 = stats.compile, t2 = stats.fonts, t3 = stats.render;
    var str = 'Time to compile/fonts/render: ' +
              (t1 - stats.begin) + '/' + (t2 - t1) + '/' + (t3 - t2) + ' ms';
    document.getElementById('info').innerHTML = str;
  };
};

var ThumbnailView = function(container, page, id, pageRatio) {
  var anchor = document.createElement('a');
  anchor.href = '#' + id;

  var div = document.createElement('div');
  div.id = 'thumbnailContainer' + id;
  div.className = 'thumbnail';

  anchor.appendChild(div);
  container.appendChild(anchor);

  this.draw = function() {
    if (div.hasChildNodes())
      return;

    var canvas = document.createElement('canvas');
    canvas.id = 'thumbnail' + id;
    canvas.mozOpaque = true;

    var maxThumbSize = 134;
    canvas.width = pageRatio >= 1 ? maxThumbSize :
      maxThumbSize * pageRatio;
    canvas.height = pageRatio <= 1 ? maxThumbSize :
      maxThumbSize / pageRatio;

    div.setAttribute('data-loaded', true);
    div.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    ctx.save();
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    var view = page.view;
    var scaleX = (canvas.width / page.width);
    var scaleY = (canvas.height / page.height);
    ctx.translate(-view.x * scaleX, -view.y * scaleY);
    div.style.width = (view.width * scaleX) + 'px';
    div.style.height = (view.height * scaleY) + 'px';
    div.style.lineHeight = (view.height * scaleY) + 'px';

    page.startRendering(ctx, function() { });
  };
};

var DocumentOutlineView = function(outline) {
  var outlineView = document.getElementById('outlineView');

  function bindItemLink(domObj, item) {
    domObj.href = '';
    domObj.onclick = function(e) {
      PDFView.navigateTo(item.dest);
      return false;
    };
  }

  var queue = [{parent: outlineView, items: outline}];
  while (queue.length > 0) {
    var levelData = queue.shift();
    var i, n = levelData.items.length;
    for (i = 0; i < n; i++) {
      var item = levelData.items[i];
      var div = document.createElement('div');
      div.className = 'outlineItem';
      var a = document.createElement('a');
      bindItemLink(a, item);
      a.textContent = item.title;
      div.appendChild(a);

      if (item.items.length > 0) {
        var itemsDiv = document.createElement('div');
        itemsDiv.className = 'outlineItems';
        div.appendChild(itemsDiv);
        queue.push({parent: itemsDiv, items: item.items});
      }

      levelData.parent.appendChild(div);
    }
  }
};

window.addEventListener('load', function(evt) {
  var params = document.location.search.substring(1).split('&');
  for (var i = 0; i < params.length; i++) {
    var param = params[i].split('=');
    params[unescape(param[0])] = unescape(param[1]);
  }

  PDFView.open(params.file || kDefaultURL, parseFloat(params.scale));

  if (!window.File || !window.FileReader || !window.FileList || !window.Blob)
    document.getElementById('fileInput').style.display = 'none';
  else
    document.getElementById('fileInput').value = null;
}, true);

window.addEventListener('pdfload', function(evt) {
  PDFView.load(evt.detail);
}, true);

window.addEventListener('pdfprogress', function(evt) {
  PDFView.progress(evt.detail);
}, true);

window.addEventListener('pdferror', function(evt) {
  PDFView.error();
}, true);

function updateViewarea() {
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
}

window.addEventListener('scroll', function onscroll(evt) {
  updateViewarea();
}, true);

window.addEventListener('resize', function onscroll(evt) {
  if (document.getElementById('pageWidthOption').selected ||
      document.getElementById('pageFitOption').selected)
      PDFView.parseScale(document.getElementById('scaleSelect').value);
  updateViewarea();
});

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
  container._interval = window.setInterval(function interval() {
    if (pageIndex >= pagesCount) {
      window.clearInterval(container._interval);
      return;
    }

    PDFView.thumbnails[pageIndex++].draw();
  }, 500);
}, true);

window.addEventListener('scalechange', function scalechange(evt) {
  var customScaleOption = document.getElementById('customScaleOption');
  customScaleOption.selected = false;

  if (!evt.resetAutoSettings &&
       (document.getElementById('pageWidthOption').selected ||
        document.getElementById('pageFitOption').selected)) {
      updateViewarea();
      return;
  }

  var options = document.getElementById('scaleSelect').options;
  var predefinedValueFound = false;
  var value = '' + evt.scale;
  for (var i = 0; i < options.length; i++) {
    var option = options[i];
    if (option.value != value) {
      option.selected = false;
      continue;
    }
    option.selected = true;
    predefinedValueFound = true;
  }

  if (!predefinedValueFound) {
    customScaleOption.textContent = Math.round(evt.scale * 10000) / 100 + '%';
    customScaleOption.selected = true;
  }

  updateViewarea();
}, true);

window.addEventListener('pagechange', function pagechange(evt) {
  var page = evt.detail;
  document.location.hash = page;
  document.getElementById('pageNumber').value = page;
  document.getElementById('previous').disabled = (page == 1);
  document.getElementById('next').disabled = (page == PDFView.pages.length);
}, true);

window.addEventListener('keydown', function keydown(evt) {
  switch (evt.keyCode) {
    case 61: // FF/Mac '='
    case 107: // FF '+' and '='
    case 187: // Chrome '+'
      PDFView.zoomIn();
      break;
    case 109: // FF '-'
    case 189: // Chrome '-'
      PDFView.zoomOut();
      break;
    case 48: // '0'
      PDFView.setScale(kDefaultScale, true);
      break;
  }
});
