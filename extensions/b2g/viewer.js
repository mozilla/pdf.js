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

/* globals PDFJS, Promise */

'use strict';

PDFJS.useOnlyCssZoom = true;
PDFJS.disableTextLayer = true;
PDFJS.maxImageSize = 1024 * 1024;
PDFJS.workerSrc = '../pdfjs-components/build/pdf.worker.js';
PDFJS.cMapUrl = '../pdfjs-components/cmaps/';
PDFJS.cMapPacked = true;

var DEFAULT_SCALE_DELTA = 1.1;
var MIN_SCALE = 0.25;
var MAX_SCALE = 10.0;
var DEFAULT_SCALE_VALUE = 'auto';

var PDFViewerApplication = {
  pdfDocument: null,
  pdfViewer: null,
  pdfHistory: null,
  pdfLinkService: null,

  open: function (params) {
    var url = params.url, originalUrl = params.originalUrl;
    var self = this;
    this.setTitleUsingUrl(originalUrl);

    // Loading document.
    var loadingTask = PDFJS.getDocument(url);
    loadingTask.onProgress = function (progressData) {
      self.progress(progressData.loaded / progressData.total);
    };
    loadingTask.then(function (pdfDocument) {
      // Document loaded, specifying document for the viewer.
      this.pdfDocument = pdfDocument;
      this.pdfViewer.setDocument(pdfDocument);
      this.pdfLinkService.setDocument(pdfDocument);
      this.pdfHistory.initialize(pdfDocument.fingerprint);

      this.loadingBar.hide();
      this.setTitleUsingMetadata(pdfDocument);
    }.bind(this), function (exception) {
      var message = exception && exception.message;
      var loadingErrorMessage = mozL10n.get('loading_error', null,
        'An error occurred while loading the PDF.');

      if (exception instanceof PDFJS.InvalidPDFException) {
        // change error message also for other builds
        loadingErrorMessage = mozL10n.get('invalid_file_error', null,
          'Invalid or corrupted PDF file.');
      } else if (exception instanceof PDFJS.MissingPDFException) {
        // special message for missing PDFs
        loadingErrorMessage = mozL10n.get('missing_file_error', null,
          'Missing PDF file.');
      } else if (exception instanceof PDFJS.UnexpectedResponseException) {
        loadingErrorMessage = mozL10n.get('unexpected_response_error', null,
          'Unexpected server response.');
      }

      var moreInfo = {
        message: message
      };
      self.error(loadingErrorMessage, moreInfo);
      self.loadingBar.hide();
    });
  },

  get loadingBar() {
    var bar = new PDFJS.ProgressBar('#loadingBar', {});

    return PDFJS.shadow(this, 'loadingBar', bar);
  },

  setTitleUsingUrl: function pdfViewSetTitleUsingUrl(url) {
    this.url = url;
    var title = PDFJS.getFileName(url) || url;
    try {
      title = decodeURIComponent(title);
    } catch (e) {
      // decodeURIComponent may throw URIError,
      // fall back to using the unprocessed url in that case
    }
    this.setTitle(title);
  },

  setTitleUsingMetadata: function (pdfDocument) {
    var self = this;
    pdfDocument.getMetadata().then(function(data) {
      var info = data.info, metadata = data.metadata;
      self.documentInfo = info;
      self.metadata = metadata;

      // Provides some basic debug information
      console.log('PDF ' + pdfDocument.fingerprint + ' [' +
                  info.PDFFormatVersion + ' ' + (info.Producer || '-').trim() +
                  ' / ' + (info.Creator || '-').trim() + ']' +
                  ' (PDF.js: ' + (PDFJS.version || '-') +
                  (!PDFJS.disableWebGL ? ' [WebGL]' : '') + ')');

      var pdfTitle;
      if (metadata && metadata.has('dc:title')) {
        var title = metadata.get('dc:title');
        // Ghostscript sometimes returns 'Untitled', so prevent setting the
        // title to 'Untitled.
        if (title !== 'Untitled') {
          pdfTitle = title;
        }
      }

      if (!pdfTitle && info && info['Title']) {
        pdfTitle = info['Title'];
      }

      if (pdfTitle) {
        self.setTitle(pdfTitle + ' - ' + document.title);
      }
    });
  },

  setTitle: function pdfViewSetTitle(title) {
    document.title = title;
    document.getElementById('activityTitle').textContent = title;
  },

  error: function pdfViewError(message, moreInfo) {
    var moreInfoText = mozL10n.get('error_version_info',
      {version: PDFJS.version || '?', build: PDFJS.build || '?'},
      'PDF.js v{{version}} (build: {{build}})') + '\n';

    if (moreInfo) {
      moreInfoText +=
        mozL10n.get('error_message', {message: moreInfo.message},
          'Message: {{message}}');
      if (moreInfo.stack) {
        moreInfoText += '\n' +
        mozL10n.get('error_stack', {stack: moreInfo.stack},
          'Stack: {{stack}}');
      } else {
        if (moreInfo.filename) {
          moreInfoText += '\n' +
          mozL10n.get('error_file', {file: moreInfo.filename},
            'File: {{file}}');
        }
        if (moreInfo.lineNumber) {
          moreInfoText += '\n' +
          mozL10n.get('error_line', {line: moreInfo.lineNumber},
            'Line: {{line}}');
        }
      }
    }

    var errorWrapper = document.getElementById('errorWrapper');
    errorWrapper.removeAttribute('hidden');

    var errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;

    var closeButton = document.getElementById('errorClose');
    closeButton.onclick = function() {
      errorWrapper.setAttribute('hidden', 'true');
    };

    var errorMoreInfo = document.getElementById('errorMoreInfo');
    var moreInfoButton = document.getElementById('errorShowMore');
    var lessInfoButton = document.getElementById('errorShowLess');
    moreInfoButton.onclick = function() {
      errorMoreInfo.removeAttribute('hidden');
      moreInfoButton.setAttribute('hidden', 'true');
      lessInfoButton.removeAttribute('hidden');
      errorMoreInfo.style.height = errorMoreInfo.scrollHeight + 'px';
    };
    lessInfoButton.onclick = function() {
      errorMoreInfo.setAttribute('hidden', 'true');
      moreInfoButton.removeAttribute('hidden');
      lessInfoButton.setAttribute('hidden', 'true');
    };
    moreInfoButton.removeAttribute('hidden');
    lessInfoButton.setAttribute('hidden', 'true');
    errorMoreInfo.value = moreInfoText;
  },

  progress: function pdfViewProgress(level) {
    var percent = Math.round(level * 100);
    // Updating the bar if value increases.
    if (percent > this.loadingBar.percent || isNaN(percent)) {
      this.loadingBar.percent = percent;
    }
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
    this.pdfViewer.currentScaleValue = newScale;
  },

  zoomOut: function pdfViewZoomOut(ticks) {
    var newScale = this.pdfViewer.currentScale;
    do {
      newScale = (newScale / DEFAULT_SCALE_DELTA).toFixed(2);
      newScale = Math.floor(newScale * 10) / 10;
      newScale = Math.max(MIN_SCALE, newScale);
    } while (--ticks && newScale > MIN_SCALE);
    this.pdfViewer.currentScaleValue = newScale;
  },

  initUI: function pdfViewInitUI() {
    var linkService = new PDFJS.PDFLinkService();
    this.pdfLinkService = linkService;

    var container = document.getElementById('viewerContainer');
    var pdfViewer = new PDFJS.PDFViewer({
      container: container,
      linkService: linkService
    });
    this.pdfViewer = pdfViewer;
    linkService.setViewer(pdfViewer);

    this.pdfHistory = new PDFJS.PDFHistory({
      linkService: linkService
    });
    linkService.setHistory(this.pdfHistory);

    document.getElementById('previous').addEventListener('click', function() {
      PDFViewerApplication.page--;
    });

    document.getElementById('next').addEventListener('click', function() {
      PDFViewerApplication.page++;
    });

    document.getElementById('zoomIn').addEventListener('click', function() {
      PDFViewerApplication.zoomIn();
    });

    document.getElementById('zoomOut').addEventListener('click', function() {
      PDFViewerApplication.zoomOut();
    });

    document.getElementById('pageNumber').addEventListener('click', function() {
      this.select();
    });

    document.getElementById('pageNumber').addEventListener('change',
        function() {
      // Handle the user inputting a floating point number.
      PDFViewerApplication.page = (this.value | 0);

      if (this.value !== (this.value | 0).toString()) {
        this.value = PDFViewerApplication.page;
      }
    });

    container.addEventListener('pagesinit', function () {
      // We can use pdfViewer now, e.g. let's change default scale.
      pdfViewer.currentScaleValue = DEFAULT_SCALE_VALUE;
    });

    container.addEventListener('pagechange', function (evt) {
      var page = evt.pageNumber;
      if (evt.previousPageNumber !== page) {
        document.getElementById('pageNumber').value = page;
      }
      var numPages = PDFViewerApplication.pagesCount;

      document.getElementById('previous').disabled = (page <= 1);
      document.getElementById('next').disabled = (page >= numPages);
    }, true);
  }
};

document.addEventListener('DOMContentLoaded', function () {
  PDFViewerApplication.initUI();
}, true);

(function animationStartedClosure() {
  // The offsetParent is not set until the PDF.js iframe or object is visible.
  // Waiting for first animation.
  PDFViewerApplication.animationStartedPromise = new Promise(
    function (resolve) {
      window.requestAnimationFrame(resolve);
    });
})();

// Support of the new version of navigator.mozL10n -- in PDF.js older/custom
// version is used.
var mozL10n = {
  get: function (id, args, fallback) {
    var s = (navigator.mozL10n && navigator.mozL10n.get(id)) || fallback;
    s = s.replace(/\{\{\s*(\w+)\s*\}\}/g, function (all, key) {
      return args[key] || '';
    });
    return s;
  },

  translate: function (fragment) {
    if (navigator.mozL10n) {
      navigator.mozL10n.translateFragment(fragment);
    }
  }
};

window.navigator.mozSetMessageHandler('activity', function(activity) {
  var blob = activity.source.data.blob;
  var fileURL = activity.source.data.url ||
                activity.source.data.filename ||
                ' '; // if no url or filename, use a non-empty string

  var url = URL.createObjectURL(blob);
  // We need to delay opening until all HTML is loaded.
  PDFViewerApplication.animationStartedPromise.then(function () {
    PDFViewerApplication.open({url: url, originalUrl: fileURL});

    var header = document.getElementById('header');
    header.addEventListener('action', function() {
      activity.postResult('close');
    });
  });
});
