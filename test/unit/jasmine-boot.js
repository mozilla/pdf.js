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
/*
 Copyright (c) 2008-2016 Pivotal Labs

 Permission is hereby granted, free of charge, to any person obtaining
 a copy of this software and associated documentation files (the
 "Software"), to deal in the Software without restriction, including
 without limitation the rights to use, copy, modify, merge, publish,
 distribute, sublicense, and/or sell copies of the Software, and to
 permit persons to whom the Software is furnished to do so, subject to
 the following conditions:

 The above copyright notice and this permission notice shall be
 included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
/*globals jasmineRequire, jasmine, TestReporter */

// Modified jasmine's boot.js file to load PDF.js libraries async.

'use strict';

var pdfjsLibs;

function initializePDFJS(callback) {
  require.config({paths: {'pdfjs': '../../src', 'pdfjs-web': '../../web'}});
  require(['pdfjs/shared/util', 'pdfjs/display/global', 'pdfjs/core/primitives',
      'pdfjs/core/annotation', 'pdfjs/core/crypto', 'pdfjs/core/stream',
      'pdfjs/core/fonts', 'pdfjs/core/ps_parser', 'pdfjs/core/function',
      'pdfjs/core/parser', 'pdfjs/core/evaluator', 'pdfjs/core/cmap',
      'pdfjs/core/worker', 'pdfjs/core/network', 'pdfjs/core/type1_parser',
      'pdfjs/core/cff_parser', 'pdfjs/display/api', 'pdfjs/display/metadata',
      'pdfjs/display/dom_utils', 'pdfjs-web/ui_utils'],
    function (sharedUtil, displayGlobal, corePrimitives, coreAnnotation,
              coreCrypto, coreStream, coreFonts, corePsParser, coreFunction,
              coreParser, coreEvaluator, coreCMap, coreWorker, coreNetwork,
              coreType1Parser, coreCFFParser, displayAPI, displayMetadata,
              displayDOMUtils, webUIUtils) {

      pdfjsLibs = {
        sharedUtil: sharedUtil,
        displayGlobal: displayGlobal,
        corePrimitives: corePrimitives,
        coreAnnotation: coreAnnotation,
        coreCrypto: coreCrypto,
        coreStream: coreStream,
        coreFonts: coreFonts,
        corePsParser: corePsParser,
        coreFunction: coreFunction,
        coreParser: coreParser,
        coreEvaluator: coreEvaluator,
        coreCMap: coreCMap,
        coreWorker: coreWorker,
        coreNetwork: coreNetwork,
        coreType1Parser: coreType1Parser,
        coreCFFParser: coreCFFParser,
        displayAPI: displayAPI,
        displayMetadata: displayMetadata,
        displayDOMUtils: displayDOMUtils,
        webUIUtils: webUIUtils
      };

      // Expose all loaded internal exported members to global scope.
      Object.keys(pdfjsLibs).forEach(function (libName) {
        var lib = pdfjsLibs[libName];
        Object.keys(lib).forEach(function (name) {
          if (Object.getOwnPropertyDescriptor(window, name)) {
            return; // ignoring if already set
          }
          window[name] = lib[name];
        });
      });

      // Configure the worker.
      displayGlobal.PDFJS.workerSrc = '../../src/worker_loader.js';

      callback();
    });
}

(function() {
  window.jasmine = jasmineRequire.core(jasmineRequire);

  jasmineRequire.html(jasmine);

  var env = jasmine.getEnv();

  var jasmineInterface = jasmineRequire.interface(jasmine, env);
  extend(window, jasmineInterface);

  // Runner Parameters
  var queryString = new jasmine.QueryString({
    getWindowLocation: function() { return window.location; }
  });

  var catchingExceptions = queryString.getParam('catch');
  env.catchExceptions(typeof catchingExceptions === 'undefined' ?
                      true : catchingExceptions);

  var throwingExpectationFailures = queryString.getParam('throwFailures');
  env.throwOnExpectationFailure(throwingExpectationFailures);

  var random = queryString.getParam('random');
  env.randomizeTests(random);

  var seed = queryString.getParam('seed');
  if (seed) {
    env.seed(seed);
  }

  // Reporters
  var htmlReporter = new jasmine.HtmlReporter({
    env: env,
    onRaiseExceptionsClick: function() {
      queryString.navigateWithNewParam('catch', !env.catchingExceptions());
    },
    onThrowExpectationsClick: function() {
      queryString.navigateWithNewParam('throwFailures',
                                       !env.throwingExpectationFailures());
    },
    onRandomClick: function() {
      queryString.navigateWithNewParam('random', !env.randomTests());
    },
    addToExistingQueryString: function(key, value) {
      return queryString.fullStringWithNewParam(key, value);
    },
    getContainer: function() { return document.body; },
    createElement: function() {
      return document.createElement.apply(document, arguments);
    },
    createTextNode: function() {
      return document.createTextNode.apply(document, arguments);
    },
    timer: new jasmine.Timer()
  });

  env.addReporter(htmlReporter);

  if (queryString.getParam('browser')) {
    var testReporter = new TestReporter(queryString.getParam('browser'),
                                        queryString.getParam('path'));
    env.addReporter(testReporter);
  }

  // Filter which specs will be run by matching the start of the full name
  // against the `spec` query param.
  var specFilter = new jasmine.HtmlSpecFilter({
    filterString: function() { return queryString.getParam('spec'); }
  });

  env.specFilter = function(spec) {
    return specFilter.matches(spec.getFullName());
  };

  // Sets longer timeout.
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000;

  // Replace the browser window's `onload`, ensure it's called, and then run
  // all of the loaded specs. This includes initializing the `HtmlReporter`
  // instance and then executing the loaded Jasmine environment.
  var currentWindowOnload = window.onload;

  window.onload = function() {
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
}());

