/**
 * Custom functionality for our fork of pdf.js.
 */

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-web/customize_viewer', ['exports', 'pdfjs-web/dom_events',
    'pdfjs-web/ui_utils', 'pdfjs-web/app'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./dom_events.js'), require('./ui_utils.js'),
     require('./app.js'));
  } else {
    factory((root.pdfjsWebCustomizeViewer = {}), root.pdfjsWebDOMEvents,
     root.pdfjsWebUIUtils, root.pdfjsWebApp);
  }
}(this, function (exports, DOMEvents, UIUtils, pdfjsWebApp) {

/**
 * If we are running this after `gulp generic`, DOMContentLoaded will not have
 * fired yet. If we run it from `gulp server`, it will have fired.
 */
if (document.readyState === 'complete' || document.readyState === 'loaded' ||
 document.readyState === 'interactive') {
  initialize();
} else {
  document.addEventListener('DOMContentLoaded', initialize);
}

function initialize() {
  var eventBus = DOMEvents.getGlobalEventBus();

  setupPageNumberDisplay(eventBus);
  setupRotateButton(eventBus);
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

  // Fade the page number display out when the user is not scrolling. This
  // only applies to the mobile layout.
  var timeout = null;
  var pageNumberInfo = document.getElementById('pageNumberInfo');
  UIUtils.watchScroll(document.getElementById('viewerContainer'), function() {
    if (timeout) {
      pageNumberInfo.className = '';
      clearTimeout(timeout);
    }

    timeout = setTimeout(function() {
      pageNumberInfo.className = 'fadeOut';
    }, 3000);
  });
}

/**
 * The standard viewer only supports a rotate button in the dropdown menu, so
 * we need to implement the same thing for the toolbar.
 *
 * This button toggles between 0deg and 90deg, rather than rotating in just cw
 * or just ccw.
 */
function setupRotateButton(eventBus) {
  var rotateCw = true;
  var pageRotateToggle = document.getElementById('toolbarPageRotateToggle');
  pageRotateToggle.addEventListener('click', function() {
    eventBus.dispatch(rotateCw ? 'rotatecw' : 'rotateccw');
    rotateCw = !rotateCw;
  });
}

}));
