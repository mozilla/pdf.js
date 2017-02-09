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
  console.log('it works!');
}

}));
