/**
 * Custom functionality for our fork of pdf.js.
 */

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-web/customize_viewer', ['exports', 'pdfjs-web/dom_events',
    'pdfjs-web/app'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./dom_events.js'), require('./app.js'));
  } else {
    factory((root.pdfjsWebCustomizeViewer = {}), root.pdfjsWebDOMEvents,
     root.pdfjsWebApp);
  }
}(this, function (exports, DOMEvents, pdfjsWebApp) {

/**
 * If we are running this after `gulp generic`, DOMContentLoaded will not have
 * fired yet. If we run it from `gulp server`, it will have fired.
 */
if (document.readyState === "complete" || document.readyState === "loaded" ||
 document.readyState === "interactive") {
  initialize();
} else {
  document.addEventListener('DOMContentLoaded', initialize);
}

function initialize() {
  var eventBus = DOMEvents.getGlobalEventBus();

  setupPageNumberDisplay(eventBus);
  setupRotateButton(eventBus);
  setupLandscapeIndicator(eventBus, pdfjsWebApp.PDFViewerApplication);
}

/**
 * Displays the current page number in '#pageNumberDisplay'. The standard viewer
 * displays it in an <input>, and we just want to display it in a <span>.
 */
function setupPageNumberDisplay(eventBus) {
  var pageNumberDisplay = document.getElementById('pageNumberDisplay');
  eventBus.on('pagechange', function(ev) {
    pageNumberDisplay.innerText = ev.pageNumber;
  });
}

/**
 * The standard viewer only supports a rotate button in the dropdown menu, so
 * we need to implement the same thing for the toolbar.
 */
function setupRotateButton(eventBus) {
  var pageRotateCw = document.getElementById('toolbarPageRotateCw');
  pageRotateCw.addEventListener('click', function() {
    eventBus.dispatch('rotatecw');
  });
}

/**
 * Add a 'landscape' class to '#mainContainer' when the pages are displayed in
 * landscape. This can be used to style the rotate button.
 */
function setupLandscapeIndicator(eventBus, viewerApp) {
  var mainContainer = document.getElementById('mainContainer');

  // Set the initial value on load.
  eventBus.on('pagesloaded', function() {
    if (viewerApp.pdfViewer.isLandscape()) {
      mainContainer.className = 'landscape';
    }
  });

  // Update it every time the pages rotate.
  eventBus.on('rotatecw', function() {
    // The setTimeout is necessary because this event handler could get called
    // before or after the handler that actually rotates the page.
    setTimeout(function() {
      if (viewerApp.pdfViewer.isLandscape()) {
        mainContainer.className = 'landscape';
      } else {
        mainContainer.className = '';
      }
    }, 0);
  });
}

}));
