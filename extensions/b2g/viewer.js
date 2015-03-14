/* Copyright 2014 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

PDFJS.useOnlyCssZoom = true;
PDFJS.disableTextLayer = true;
PDFJS.workerSrc = '../build/pdf.worker.js';
PDFJS.cMapUrl = '../web/cmaps/';
PDFJS.cMapPacked = true;

var DEFAULT_SCALE_DELTA = 1.1;
var MIN_SCALE = 0.25;
var MAX_SCALE = 10.0;

var PDFViewerApplication = {
  pdfDocument: null,
  pdfViewer: null,
  loading: true,
  updateScaleControls: false,

  open: function (params) {
    var url = params.url, originalUrl = params.originalUrl;

    this.initUI();
    this.setTitleUsingUrl(originalUrl);

    // Loading document.
    PDFJS.getDocument(url).then(function (pdfDocument) {
      // Document loaded, specifying document for the viewer.
      this.pdfDocument = pdfDocument;
      this.pdfViewer.setDocument(pdfDocument);
    }.bind(this));
  },

  setTitleUsingUrl: function pdfViewSetTitleUsingUrl(url) {
    this.url = url;
    try {
      this.setTitle(decodeURIComponent(PDFJS.getFileName(url)) || url);
    } catch (e) {
      // decodeURIComponent may throw URIError,
      // fall back to using the unprocessed url in that case
      this.setTitle(url);
    }
  },

  setTitle: function pdfViewSetTitle(title) {
    document.title = title;
    document.getElementById('activityTitle').textContent = title;
  },

  get pagesCount() {
    return this.pdfDocument.numPages;
  },

  set page(val) {
    this.pdfViewer.currentPageNumber = val;
  },

  get page() {
    return this.pdfViewer.currentPageNumber;
  },

  zoomIn: function pdfViewZoomIn(ticks) {
    var newScale = this.pdfViewer.currentScale;
    do {
      newScale = (newScale * DEFAULT_SCALE_DELTA).toFixed(2);
      newScale = Math.ceil(newScale * 10) / 10;
      newScale = Math.min(MAX_SCALE, newScale);
    } while (--ticks && newScale < MAX_SCALE);
    this.setScale(newScale, true);
  },

  zoomOut: function pdfViewZoomOut(ticks) {
    var newScale = this.pdfViewer.currentScale;
    do {
      newScale = (newScale / DEFAULT_SCALE_DELTA).toFixed(2);
      newScale = Math.floor(newScale * 10) / 10;
      newScale = Math.max(MIN_SCALE, newScale);
    } while (--ticks && newScale > MIN_SCALE);
    this.setScale(newScale, true);
  },

  setScale: function (value, resetAutoSettings) {
    this.updateScaleControls = !!resetAutoSettings;
    this.pdfViewer.currentScaleValue = value;
    this.updateScaleControls = true;
  },

  initUI: function pdfViewInitUI() {
    var container = document.getElementById('viewerContainer');
    var pdfViewer = new PDFJS.PDFViewer({
      container: container
    });
    this.pdfViewer = pdfViewer;

    container.addEventListener('pagesinit', function () {
      // we can use pdfViewer now, e.g. let's change default scale.
      pdfViewer.currentScaleValue = 'page-width';
    });

    document.getElementById('previous').addEventListener('click',
      function() {
        PDFViewerApplication.page--;
      });

    document.getElementById('next').addEventListener('click',
      function() {
        PDFViewerApplication.page++;
      });

    document.getElementById('zoomIn').addEventListener('click',
      function() {
        PDFViewerApplication.zoomIn();
      });

    document.getElementById('zoomOut').addEventListener('click',
      function() {
        PDFViewerApplication.zoomOut();
      });

    document.getElementById('pageNumber').addEventListener('click', function() {
      this.select();
    });

    document.getElementById('pageNumber').addEventListener('change', function() {
      // Handle the user inputting a floating point number.
      PDFViewerApplication.page = (this.value | 0);

      if (this.value !== (this.value | 0).toString()) {
        this.value = PDFViewerApplication.page;
      }
    });

    window.addEventListener('pagechange', function pagechange(evt) {
      var page = evt.pageNumber;
      if (evt.previousPageNumber !== page) {
        document.getElementById('pageNumber').value = page;
      }
      var numPages = PDFViewerApplication.pagesCount;

      document.getElementById('previous').disabled = (page <= 1);
      document.getElementById('next').disabled = (page >= numPages);

      // checking if the this.page was called from the updateViewarea function
      if (evt.updateInProgress) {
        return;
      }
      // Avoid scrolling the first page during loading
      if (this.loading && page === 1) {
        return;
      }
      PDFViewerApplication.pdfViewer.scrollPageIntoView(page);
    }, true);

  }
};

(function animationStartedClosure() {
  // The offsetParent is not set until the pdf.js iframe or object is visible.
  // Waiting for first animation.
  PDFViewerApplication.animationStartedPromise = new Promise(
    function (resolve) {
      window.requestAnimationFrame(resolve);
    });
})();

window.navigator.mozSetMessageHandler('activity', function(activity) {
  var blob = activity.source.data.blob;
  PDFJS.maxImageSize = 1024 * 1024;
  var fileURL = activity.source.data.url;

  var url = URL.createObjectURL(blob);
  // We need to delay opening until all HTML is loaded.
  PDFViewerApplication.animationStartedPromise.then(function () {
    PDFViewerApplication.open({url : url, originalUrl: fileURL});

    var header = document.getElementById('header');
    header.addEventListener('action', function() {
      activity.postResult('close');
    });
  });
});
