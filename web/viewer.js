/* Copyright 2016 Mozilla Foundation
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
/*globals require, chrome */

'use strict';

var DEFAULT_URL = 'compressed.tracemonkey-pldi-09.pdf';

//#if CHROME
//(function rewriteUrlClosure() {
//  // Run this code outside DOMContentLoaded to make sure that the URL
//  // is rewritten as soon as possible.
//  var queryString = document.location.search.slice(1);
//  var m = /(^|&)file=([^&]*)/.exec(queryString);
//  DEFAULT_URL = m ? decodeURIComponent(m[2]) : '';
//
//  // Example: chrome-extension://.../http://example.com/file.pdf
//  var humanReadableUrl = '/' + DEFAULT_URL + location.hash;
//  history.replaceState(history.state, '', humanReadableUrl);
//  if (top === window) {
//    chrome.runtime.sendMessage('showPageAction');
//  }
//})();
//#endif

//#if PRODUCTION
//var pdfjsWebLibs = {
//  pdfjsWebPDFJS: window.pdfjsDistBuildPdf
//};
//
//(function () {
//#expand __BUNDLE__
//}).call(pdfjsWebLibs);
//#endif

//#if FIREFOX || MOZCENTRAL
//// FIXME the l10n.js file in the Firefox extension needs global FirefoxCom.
//window.FirefoxCom = pdfjsWebLibs.pdfjsWebFirefoxCom.FirefoxCom;
//#endif

function getViewerConfiguration() {
  return {
    appContainer: document.body,
    mainContainer: document.getElementById('viewerContainer'),
    viewerContainer:  document.getElementById('viewer'),
    eventBus: null, // using global event bus with DOM events
    toolbar: {
      container: document.getElementById('toolbarViewer'),
      numPages: document.getElementById('numPages'),
      pageNumber: document.getElementById('pageNumber'),
      scaleSelectContainer: document.getElementById('scaleSelectContainer'),
      scaleSelect: document.getElementById('scaleSelect'),
      customScaleOption: document.getElementById('customScaleOption'),
      previous: document.getElementById('previous'),
      next: document.getElementById('next'),
      firstPage: document.getElementById('firstPage'),
      lastPage: document.getElementById('lastPage'),
      zoomIn: document.getElementById('zoomIn'),
      zoomOut: document.getElementById('zoomOut'),
      viewFind: document.getElementById('viewFind'),
      openFile: document.getElementById('openFile'),
      print: document.getElementById('print'),
      presentationModeButton: document.getElementById('presentationMode'),
      download: document.getElementById('download'),
      viewBookmark: document.getElementById('viewBookmark'),
    },
    secondaryToolbar: {
      toolbar: document.getElementById('secondaryToolbar'),
      toggleButton: document.getElementById('secondaryToolbarToggle'),
      presentationModeButton:
        document.getElementById('secondaryPresentationMode'),
      openFileButton: document.getElementById('secondaryOpenFile'),
      printButton: document.getElementById('secondaryPrint'),
      downloadButton: document.getElementById('secondaryDownload'),
      viewBookmarkButton: document.getElementById('secondaryViewBookmark'),
      firstPageButton: document.getElementById('firstPage'),
      lastPageButton: document.getElementById('lastPage'),
      pageRotateCwButton: document.getElementById('pageRotateCw'),
      pageRotateCcwButton: document.getElementById('pageRotateCcw'),
      toggleHandToolButton: document.getElementById('toggleHandTool'),
      documentPropertiesButton: document.getElementById('documentProperties'),
    },
    fullscreen: {
      contextFirstPage: document.getElementById('contextFirstPage'),
      contextLastPage: document.getElementById('contextLastPage'),
      contextPageRotateCw: document.getElementById('contextPageRotateCw'),
      contextPageRotateCcw: document.getElementById('contextPageRotateCcw'),
    },
    sidebar: {
      // Divs (and sidebar button)
      mainContainer: document.getElementById('mainContainer'),
      outerContainer: document.getElementById('outerContainer'),
      toggleButton: document.getElementById('sidebarToggle'),
      // Buttons
      thumbnailButton: document.getElementById('viewThumbnail'),
      outlineButton: document.getElementById('viewOutline'),
      attachmentsButton: document.getElementById('viewAttachments'),
      // Views
      thumbnailView: document.getElementById('thumbnailView'),
      outlineView: document.getElementById('outlineView'),
      attachmentsView: document.getElementById('attachmentsView'),
    },
    findBar: {
      bar: document.getElementById('findbar'),
      toggleButton: document.getElementById('viewFind'),
      findField: document.getElementById('findInput'),
      highlightAllCheckbox: document.getElementById('findHighlightAll'),
      caseSensitiveCheckbox: document.getElementById('findMatchCase'),
      findMsg: document.getElementById('findMsg'),
      findResultsCount: document.getElementById('findResultsCount'),
      findStatusIcon: document.getElementById('findStatusIcon'),
      findPreviousButton: document.getElementById('findPrevious'),
      findNextButton: document.getElementById('findNext')
    },
    passwordOverlay: {
      overlayName: 'passwordOverlay',
      container: document.getElementById('passwordOverlay'),
      label: document.getElementById('passwordText'),
      input: document.getElementById('password'),
      submitButton: document.getElementById('passwordSubmit'),
      cancelButton: document.getElementById('passwordCancel')
    },
    documentProperties: {
      overlayName: 'documentPropertiesOverlay',
      container: document.getElementById('documentPropertiesOverlay'),
      closeButton: document.getElementById('documentPropertiesClose'),
      fields: {
        'fileName': document.getElementById('fileNameField'),
        'fileSize': document.getElementById('fileSizeField'),
        'title': document.getElementById('titleField'),
        'author': document.getElementById('authorField'),
        'subject': document.getElementById('subjectField'),
        'keywords': document.getElementById('keywordsField'),
        'creationDate': document.getElementById('creationDateField'),
        'modificationDate': document.getElementById('modificationDateField'),
        'creator': document.getElementById('creatorField'),
        'producer': document.getElementById('producerField'),
        'version': document.getElementById('versionField'),
        'pageCount': document.getElementById('pageCountField')
      }
    },
    errorWrapper: {
      container: document.getElementById('errorWrapper'),
      errorMessage: document.getElementById('errorMessage'),
      closeButton: document.getElementById('errorClose'),
      errorMoreInfo: document.getElementById('errorMoreInfo'),
      moreInfoButton: document.getElementById('errorShowMore'),
      lessInfoButton: document.getElementById('errorShowLess'),
    },
    printContainer: document.getElementById('printContainer'),
    openFileInputName: 'fileInput',
    debuggerScriptPath: './debugger.js',
  };
}

function webViewerLoad() {
  var config = getViewerConfiguration();
//#if !PRODUCTION
  require.config({paths: {'pdfjs': '../src', 'pdfjs-web': '.'}});
  require(['pdfjs-web/pdfjs'], function () {
    // Ensure that src/main_loader.js has loaded all the necessary dependencies
    // *before* the viewer loads, to prevent issues in browsers relying on e.g.
    // the Promise/URL polyfill in src/shared/util.js (fixes issue 7448).
    require(['pdfjs-web/app', 'mozPrintCallback_polyfill.js'], function (web) {
      window.PDFViewerApplication = web.PDFViewerApplication;
      web.PDFViewerApplication.run(config);
    });
  });
//#else
//window.PDFViewerApplication = pdfjsWebLibs.pdfjsWebApp.PDFViewerApplication;
//pdfjsWebLibs.pdfjsWebApp.PDFViewerApplication.run(config);
//#endif
}

document.addEventListener('DOMContentLoaded', webViewerLoad, true);
