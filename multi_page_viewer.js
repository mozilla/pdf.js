/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

"use strict";

var pageTimeout;

var PDFViewer = {
  queryParams: {},
  
  element: null,
  
  sidebarContentView: null,
  
  previousPageButton: null,
  nextPageButton: null,
  pageNumberInput: null,
  scaleSelect: null,
  fileInput: null,
  
  willJumpToPage: false,
  
  pdf: null,
  
  url: 'compressed.tracemonkey-pldi-09.pdf',
  pageNumber: 1,
  numberOfPages: 1,
  
  scale: 1.0,
  
  pageWidth: function(page) {
    var pdfToCssUnitsCoef = 96.0 / 72.0;
    var width = (page.mediaBox[2] - page.mediaBox[0]);
    return width * PDFViewer.scale * pdfToCssUnitsCoef;
  },
  
  pageHeight: function(page) {
    var pdfToCssUnitsCoef = 96.0 / 72.0;
    var height = (page.mediaBox[3] - page.mediaBox[1]);
    return height * PDFViewer.scale * pdfToCssUnitsCoef;
  },
  
  lastPagesDrawn: [],
  
  visiblePages: function() {
    const pageBottomMargin = 10;
    var windowTop = window.pageYOffset;
    var windowBottom = window.pageYOffset + window.innerHeight;

    var pageHeight, page;
    var i, n = PDFViewer.numberOfPages, currentHeight = pageBottomMargin;
    for (i = 1; i <= n; i++) {
      var page = PDFViewer.pdf.getPage(i);
      pageHeight = PDFViewer.pageHeight(page) + pageBottomMargin;
      if (currentHeight + pageHeight > windowTop)
        break;
      currentHeight += pageHeight;
    }
    
    var pages = [];  
    for (; i <= n && currentHeight < windowBottom; i++) {
      var page = PDFViewer.pdf.getPage(i);
      pageHeight = PDFViewer.pageHeight(page) + pageBottomMargin;
      currentHeight += pageHeight;
      pages.push(i);
    }
    
    return pages;
  },
  
  createThumbnail: function(num) {
    if (PDFViewer.sidebarContentView) {
      var anchor = document.createElement('a');
      anchor.href = '#' + num;
    
      var containerDiv = document.createElement('div');
      containerDiv.id = 'thumbnailContainer' + num;
      containerDiv.className = 'thumbnail';
    
      var pageNumberDiv = document.createElement('div');
      pageNumberDiv.className = 'thumbnailPageNumber';
      pageNumberDiv.innerHTML = '' + num;
    
      anchor.appendChild(containerDiv);
      PDFViewer.sidebarContentView.appendChild(anchor);
      PDFViewer.sidebarContentView.appendChild(pageNumberDiv);
    }
  },
  
  removeThumbnail: function(num) {
    var div = document.getElementById('thumbnailContainer' + num);
    
    if (div) {
      while (div.hasChildNodes()) {
        div.removeChild(div.firstChild);
      }
    }
  },
  
  drawThumbnail: function(num) {
    if (!PDFViewer.pdf)
      return;

    var div = document.getElementById('thumbnailContainer' + num);
    
    if (div && !div.hasChildNodes()) {
      var page = PDFViewer.pdf.getPage(num);
      var canvas = document.createElement('canvas');
      
      canvas.id = 'thumbnail' + num;
      canvas.mozOpaque = true;

      var pageWidth = PDFViewer.pageWidth(page);
      var pageHeight = PDFViewer.pageHeight(page);
      var thumbScale = Math.min(104 / pageWidth, 134 / pageHeight);
      canvas.width = pageWidth * thumbScale;
      canvas.height = pageHeight * thumbScale;
      div.appendChild(canvas);

      var ctx = canvas.getContext('2d');
      ctx.save();
      ctx.fillStyle = 'rgb(255, 255, 255)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      var gfx = new CanvasGraphics(ctx);

      // page.compile will collect all fonts for us, once we have loaded them
      // we can trigger the actual page rendering with page.display
      var fonts = [];
      page.compile(gfx, fonts);

      FontLoader.bind(fonts, function() { page.display(gfx); });
    }
  },
  
  createPage: function(num) {
    var page = PDFViewer.pdf.getPage(num);

    var anchor = document.createElement('a');
    anchor.name = '' + num;
    
    var div = document.createElement('div');
    div.id = 'pageContainer' + num;
    div.className = 'page';
    div.style.width = PDFViewer.pageWidth(page) + 'px';
    div.style.height = PDFViewer.pageHeight(page) + 'px';
    
    PDFViewer.element.appendChild(anchor);
    PDFViewer.element.appendChild(div);
  },
  
  removePage: function(num) {
    var div = document.getElementById('pageContainer' + num);
    
    if (div) {
      while (div.hasChildNodes()) {
        div.removeChild(div.firstChild);
      }
    }
  },
  
  drawPage: function(num) {
    if (!PDFViewer.pdf)
      return;

    var div = document.getElementById('pageContainer' + num);
    
    if (div && !div.hasChildNodes()) {
      var page = PDFViewer.pdf.getPage(num);
      var canvas = document.createElement('canvas');
      
      canvas.id = 'page' + num;
      canvas.mozOpaque = true;

      canvas.width = PDFViewer.pageWidth(page);
      canvas.height = PDFViewer.pageHeight(page);
      div.appendChild(canvas);

      var ctx = canvas.getContext('2d');
      ctx.save();
      ctx.fillStyle = 'rgb(255, 255, 255)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      var gfx = new CanvasGraphics(ctx);

      // page.compile will collect all fonts for us, once we have loaded them
      // we can trigger the actual page rendering with page.display
      var fonts = [];
      page.compile(gfx, fonts);

      FontLoader.bind(fonts, function() { page.display(gfx); });
    }
  },

  changeScale: function(num) {
    while (PDFViewer.element.hasChildNodes()) {
      PDFViewer.element.removeChild(PDFViewer.element.firstChild);
    }
    
    PDFViewer.scale = num / 100;
    
    var i;
    
    if (PDFViewer.pdf) {
      for (i = 1; i <= PDFViewer.numberOfPages; i++) {
        PDFViewer.createPage(i);
      }
    }
    
    for (i = 0; i < PDFViewer.scaleSelect.childNodes; i++) {
      var option = PDFViewer.scaleSelect.childNodes[i];
      
      if (option.value == num) {
        if (!option.selected) {
          option.selected = 'selected';
        }
      } else {
        if (option.selected) {
          option.removeAttribute('selected');
        }
      }
    }
    
    PDFViewer.scaleSelect.value = Math.floor(PDFViewer.scale * 100) + '%';
    
    // Clear the array of the last pages drawn to force a redraw.
    PDFViewer.lastPagesDrawn = [];
    
    // Jump the scroll position to the correct page.
    PDFViewer.goToPage(PDFViewer.pageNumber);
  },
  
  goToPage: function(num) {
    if (1 <= num && num <= PDFViewer.numberOfPages) {
      PDFViewer.pageNumber = num;
      PDFViewer.pageNumberInput.value = PDFViewer.pageNumber;
      PDFViewer.willJumpToPage = true;

      if (document.location.hash.substr(1) == PDFViewer.pageNumber)
        // Force a "scroll event" to redraw
        setTimeout(window.onscroll, 0);
      document.location.hash = PDFViewer.pageNumber;
      
      PDFViewer.previousPageButton.className = (PDFViewer.pageNumber === 1) ? 'disabled' : '';
      PDFViewer.nextPageButton.className = (PDFViewer.pageNumber === PDFViewer.numberOfPages) ? 'disabled' : '';
    }
  },
  
  goToPreviousPage: function() {
    if (PDFViewer.pageNumber > 1) {
      PDFViewer.goToPage(--PDFViewer.pageNumber);
    }
  },
  
  goToNextPage: function() {
    if (PDFViewer.pageNumber < PDFViewer.numberOfPages) {
      PDFViewer.goToPage(++PDFViewer.pageNumber);
    }
  },
  
  openURL: function(url) {
    PDFViewer.url = url;
    document.title = url;

    if (this.thumbsLoadingInterval) {
      // cancel thumbs loading operations
      clearInterval(this.thumbsLoadingInterval);
      this.thumbsLoadingInterval = null;
    }
    
    var req = new XMLHttpRequest();
    req.open('GET', url);
    req.mozResponseType = req.responseType = 'arraybuffer';
    req.expected = (document.URL.indexOf('file:') === 0) ? 0 : 200;
    
    req.onreadystatechange = function() {
      if (req.readyState === 4 && req.status === req.expected) {
        var data = req.mozResponseArrayBuffer || req.mozResponse || req.responseArrayBuffer || req.response;
        
        PDFViewer.readPDF(data);
      }
    };
    
    req.send(null);
  },

  thumbsLoadingInterval: null,

  readPDF: function(data) {
    while (PDFViewer.element.hasChildNodes()) {
      PDFViewer.element.removeChild(PDFViewer.element.firstChild);
    }
    
    while (PDFViewer.sidebarContentView.hasChildNodes()) {
      PDFViewer.sidebarContentView.removeChild(PDFViewer.sidebarContentView.firstChild);
    }
    
    PDFViewer.pdf = new PDFDoc(new Stream(data));
    PDFViewer.numberOfPages = PDFViewer.pdf.numPages;
    document.getElementById('numPages').innerHTML = PDFViewer.numberOfPages.toString();
    
    for (var i = 1; i <= PDFViewer.numberOfPages; i++) {
      PDFViewer.createPage(i);
    }
    
    if (PDFViewer.numberOfPages > 0) {
      PDFViewer.drawPage(1);
      document.location.hash = 1;
      
      // slowly loading the thumbs (few per second)
      // first time we are loading more images than subsequent
      var currentPageIndex = 1, imagesToLoad = 15;
      this.thumbsLoadingInterval = setInterval((function() {
        while (imagesToLoad-- > 0) {
          if (currentPageIndex > PDFViewer.numberOfPages) {
            clearInterval(this.thumbsLoadingInterval);
            this.thumbsLoadingInterval = null;
            return;
          }
          PDFViewer.createThumbnail(currentPageIndex);
          PDFViewer.drawThumbnail(currentPageIndex);
          ++currentPageIndex;
        }
        imagesToLoad = 3; // next time loading less images
      }).bind(this), 500);
    }
    
    PDFViewer.previousPageButton.className = (PDFViewer.pageNumber === 1) ? 'disabled' : '';
    PDFViewer.nextPageButton.className = (PDFViewer.pageNumber === PDFViewer.numberOfPages) ? 'disabled' : '';
  }
};

window.onload = function() {
  // Parse the URL query parameters into a cached object.
  PDFViewer.queryParams = function() {
    var qs = window.location.search.substring(1);
    var kvs = qs.split('&');
    var params = {};
    
    for (var i = 0; i < kvs.length; ++i) {
      var kv = kvs[i].split('=');
      params[unescape(kv[0])] = unescape(kv[1]);
    }
    
    return params;
  }();

  PDFViewer.element = document.getElementById('viewer');
  
  PDFViewer.sidebarContentView = document.getElementById('sidebarContentView');
  
  PDFViewer.pageNumberInput = document.getElementById('pageNumber');
  PDFViewer.pageNumberInput.onkeydown = function(evt) {
    var charCode = evt.charCode || evt.keyCode;
    
    // Up arrow key.
    if (charCode === 38) {
      PDFViewer.goToNextPage();
      this.select();
    }
    
    // Down arrow key.
    else if (charCode === 40) {
      PDFViewer.goToPreviousPage();
      this.select();
    }
    
    // All other non-numeric keys (excluding Left arrow, Right arrow,
    // Backspace, and Delete keys).
    else if ((charCode < 48 || charCode > 57) &&
      charCode !== 8 &&   // Backspace
      charCode !== 46 &&  // Delete
      charCode !== 37 &&  // Left arrow
      charCode !== 39     // Right arrow
    ) {
      return false;
    }
    
    return true;
  };
  PDFViewer.pageNumberInput.onkeyup = function(evt) {
    var charCode = evt.charCode || evt.keyCode;
    
    // All numeric keys, Backspace, and Delete.
    if ((charCode >= 48 && charCode <= 57) ||
      charCode === 8 ||   // Backspace
      charCode === 46     // Delete
    ) {
      PDFViewer.goToPage(this.value);
    }
    
    this.focus();
  };
  
  PDFViewer.previousPageButton = document.getElementById('previousPageButton');
  PDFViewer.previousPageButton.onclick = function(evt) {
    if (this.className.indexOf('disabled') === -1) {
      PDFViewer.goToPreviousPage();
    }
  };
  PDFViewer.previousPageButton.onmousedown = function(evt) {
    if (this.className.indexOf('disabled') === -1) {
      this.className = 'down';
    }
  };
  PDFViewer.previousPageButton.onmouseup = function(evt) {
    this.className = (this.className.indexOf('disabled') !== -1) ? 'disabled' : '';
  };
  PDFViewer.previousPageButton.onmouseout = function(evt) {
    this.className = (this.className.indexOf('disabled') !== -1) ? 'disabled' : '';
  };
  
  PDFViewer.nextPageButton = document.getElementById('nextPageButton');
  PDFViewer.nextPageButton.onclick = function(evt) {
    if (this.className.indexOf('disabled') === -1) {
      PDFViewer.goToNextPage();
    }
  };
  PDFViewer.nextPageButton.onmousedown = function(evt) {
    if (this.className.indexOf('disabled') === -1) {
      this.className = 'down';
    }
  };
  PDFViewer.nextPageButton.onmouseup = function(evt) {
    this.className = (this.className.indexOf('disabled') !== -1) ? 'disabled' : '';
  };
  PDFViewer.nextPageButton.onmouseout = function(evt) {
    this.className = (this.className.indexOf('disabled') !== -1) ? 'disabled' : '';
  };
  
  PDFViewer.scaleSelect = document.getElementById('scaleSelect');
  PDFViewer.scaleSelect.onchange = function(evt) {
    PDFViewer.changeScale(parseInt(this.value));
  };
  
  if (window.File && window.FileReader && window.FileList && window.Blob) {
    var openFileButton = document.getElementById('openFileButton');
    openFileButton.onclick = function(evt) {
      if (this.className.indexOf('disabled') === -1) {
        PDFViewer.fileInput.click();
      }
    };
    openFileButton.onmousedown = function(evt) {
      if (this.className.indexOf('disabled') === -1) {
        this.className = 'down';
      }
    };
    openFileButton.onmouseup = function(evt) {
      this.className = (this.className.indexOf('disabled') !== -1) ? 'disabled' : '';
    };
    openFileButton.onmouseout = function(evt) {
      this.className = (this.className.indexOf('disabled') !== -1) ? 'disabled' : '';
    };
    
    PDFViewer.fileInput = document.getElementById('fileInput');
    PDFViewer.fileInput.onchange = function(evt) {
      var files = evt.target.files;
      
      if (files.length > 0) {
        var file = files[0];
        var fileReader = new FileReader();
        
        document.title = file.name;
        
        // Read the local file into a Uint8Array.
        fileReader.onload = function(evt) {
          var data = evt.target.result;
          var buffer = new ArrayBuffer(data.length);
          var uint8Array = new Uint8Array(buffer);
          
          for (var i = 0; i < data.length; i++) {
            uint8Array[i] = data.charCodeAt(i);
          }
          
          PDFViewer.readPDF(uint8Array);
        };
        
        // Read as a binary string since "readAsArrayBuffer" is not yet
        // implemented in Firefox.
        fileReader.readAsBinaryString(file);
      }
    };
    PDFViewer.fileInput.value = null;
  } else {
    document.getElementById('fileWrapper').style.display = 'none';
  }
  
  PDFViewer.pageNumber = parseInt(PDFViewer.queryParams.page) || PDFViewer.pageNumber;
  PDFViewer.scale = parseInt(PDFViewer.scaleSelect.value) / 100 || 1.0;
  
  PDFViewer.openURL(PDFViewer.queryParams.file || PDFViewer.url);
  
  window.onscroll = function(evt) {        
    var lastPagesDrawn = PDFViewer.lastPagesDrawn;
    var visiblePages = PDFViewer.visiblePages();
    
    var pagesToDraw = [];
    var pagesToKeep = [];
    var pagesToRemove = [];
    
    var i;
    
    // Determine which visible pages were not previously drawn.
    for (i = 0; i < visiblePages.length; i++) {
      if (lastPagesDrawn.indexOf(visiblePages[i]) === -1) {
        pagesToDraw.push(visiblePages[i]);
        PDFViewer.drawPage(visiblePages[i]);
      } else {
        pagesToKeep.push(visiblePages[i]);
      }
    }
    
    // Determine which previously drawn pages are no longer visible.
    for (i = 0; i < lastPagesDrawn.length; i++) {
      if (visiblePages.indexOf(lastPagesDrawn[i]) === -1) {
        pagesToRemove.push(lastPagesDrawn[i]);
        PDFViewer.removePage(lastPagesDrawn[i]);
      }
    }
    
    PDFViewer.lastPagesDrawn = pagesToDraw.concat(pagesToKeep);
    
    // Update the page number input with the current page number.
    if (!PDFViewer.willJumpToPage && visiblePages.length > 0) {
      PDFViewer.pageNumber = PDFViewer.pageNumberInput.value = visiblePages[0];
      PDFViewer.previousPageButton.className = (PDFViewer.pageNumber === 1) ? 'disabled' : '';
      PDFViewer.nextPageButton.className = (PDFViewer.pageNumber === PDFViewer.numberOfPages) ? 'disabled' : '';
    } else {
      PDFViewer.willJumpToPage = false;
    }
  };
};
