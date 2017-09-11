/* Copyright 2017 Mozilla Foundation
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

function initializePDFJS(callback) {
  Promise.all(['pdfjs/display/global', 'pdfjs/display/api', 'pdfjs/display/network', 'pdfjs/display/fetch_stream', 'pdfjs-test/unit/annotation_spec', 'pdfjs-test/unit/api_spec', 'pdfjs-test/unit/bidi_spec', 'pdfjs-test/unit/cff_parser_spec', 'pdfjs-test/unit/cmap_spec', 'pdfjs-test/unit/colorspace_spec', 'pdfjs-test/unit/crypto_spec', 'pdfjs-test/unit/custom_spec', 'pdfjs-test/unit/display_svg_spec', 'pdfjs-test/unit/document_spec', 'pdfjs-test/unit/dom_utils_spec', 'pdfjs-test/unit/evaluator_spec', 'pdfjs-test/unit/fonts_spec', 'pdfjs-test/unit/function_spec', 'pdfjs-test/unit/metadata_spec', 'pdfjs-test/unit/murmurhash3_spec', 'pdfjs-test/unit/network_spec', 'pdfjs-test/unit/parser_spec', 'pdfjs-test/unit/pdf_history_spec', 'pdfjs-test/unit/primitives_spec', 'pdfjs-test/unit/stream_spec', 'pdfjs-test/unit/type1_parser_spec', 'pdfjs-test/unit/ui_utils_spec', 'pdfjs-test/unit/unicode_spec', 'pdfjs-test/unit/util_spec', 'pdfjs-test/unit/util_stream_spec'].map(function (moduleName) {
    return SystemJS.import(moduleName);
  })).then(function (modules) {
    var displayGlobal = modules[0];
    var displayApi = modules[1];
    var PDFNetworkStream = modules[2].PDFNetworkStream;
    var PDFFetchStream = modules[3].PDFFetchStream;
    if (typeof Response !== 'undefined' && 'body' in Response.prototype && typeof ReadableStream !== 'undefined') {
      displayApi.setPDFNetworkStreamClass(PDFFetchStream);
    } else {
      displayApi.setPDFNetworkStreamClass(PDFNetworkStream);
    }
    displayGlobal.PDFJS.workerSrc = '../../build/generic/build/pdf.worker.js';
    displayGlobal.PDFJS.pdfjsNext = true;
    callback();
  });
}
(function () {
  window.jasmine = jasmineRequire.core(jasmineRequire);
  jasmineRequire.html(jasmine);
  var env = jasmine.getEnv();
  var jasmineInterface = jasmineRequire.interface(jasmine, env);
  extend(window, jasmineInterface);
  var queryString = new jasmine.QueryString({
    getWindowLocation: function getWindowLocation() {
      return window.location;
    }
  });
  var catchingExceptions = queryString.getParam('catch');
  env.catchExceptions(typeof catchingExceptions === 'undefined' ? true : catchingExceptions);
  var throwingExpectationFailures = queryString.getParam('throwFailures');
  env.throwOnExpectationFailure(throwingExpectationFailures);
  var random = queryString.getParam('random');
  env.randomizeTests(random);
  var seed = queryString.getParam('seed');
  if (seed) {
    env.seed(seed);
  }
  var htmlReporter = new jasmine.HtmlReporter({
    env: env,
    onRaiseExceptionsClick: function onRaiseExceptionsClick() {
      queryString.navigateWithNewParam('catch', !env.catchingExceptions());
    },
    onThrowExpectationsClick: function onThrowExpectationsClick() {
      queryString.navigateWithNewParam('throwFailures', !env.throwingExpectationFailures());
    },
    onRandomClick: function onRandomClick() {
      queryString.navigateWithNewParam('random', !env.randomTests());
    },
    addToExistingQueryString: function addToExistingQueryString(key, value) {
      return queryString.fullStringWithNewParam(key, value);
    },
    getContainer: function getContainer() {
      return document.body;
    },
    createElement: function createElement() {
      return document.createElement.apply(document, arguments);
    },
    createTextNode: function createTextNode() {
      return document.createTextNode.apply(document, arguments);
    },

    timer: new jasmine.Timer()
  });
  env.addReporter(htmlReporter);
  if (queryString.getParam('browser')) {
    var testReporter = new TestReporter(queryString.getParam('browser'), queryString.getParam('path'));
    env.addReporter(testReporter);
  }
  var specFilter = new jasmine.HtmlSpecFilter({
    filterString: function filterString() {
      return queryString.getParam('spec');
    }
  });
  env.specFilter = function (spec) {
    return specFilter.matches(spec.getFullName());
  };
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000;
  var currentWindowOnload = window.onload;
  window.onload = function () {
    if (currentWindowOnload) {
      currentWindowOnload();
    }
    initializePDFJS(function () {
      htmlReporter.initialize();
      env.execute();
    });
  };
  function extend(destination, source) {
    for (var property in source) {
      destination[property] = source[property];
    }
    return destination;
  }
})();