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
/* globals jasmineRequire, TestReporter */

// Modified jasmine's boot.js file to load PDF.js libraries async.

"use strict";

function initializePDFJS(callback) {
  Promise.all(
    [
      "pdfjs/display/api.js",
      "pdfjs/display/worker_options.js",
      "pdfjs/display/network.js",
      "pdfjs/display/fetch_stream.js",
      "pdfjs/shared/is_node.js",
      "pdfjs-test/unit/annotation_spec.js",
      "pdfjs-test/unit/api_spec.js",
      "pdfjs-test/unit/bidi_spec.js",
      "pdfjs-test/unit/cff_parser_spec.js",
      "pdfjs-test/unit/cmap_spec.js",
      "pdfjs-test/unit/colorspace_spec.js",
      "pdfjs-test/unit/core_utils_spec.js",
      "pdfjs-test/unit/crypto_spec.js",
      "pdfjs-test/unit/custom_spec.js",
      "pdfjs-test/unit/display_svg_spec.js",
      "pdfjs-test/unit/display_utils_spec.js",
      "pdfjs-test/unit/document_spec.js",
      "pdfjs-test/unit/encodings_spec.js",
      "pdfjs-test/unit/evaluator_spec.js",
      "pdfjs-test/unit/function_spec.js",
      "pdfjs-test/unit/fetch_stream_spec.js",
      "pdfjs-test/unit/message_handler_spec.js",
      "pdfjs-test/unit/metadata_spec.js",
      "pdfjs-test/unit/murmurhash3_spec.js",
      "pdfjs-test/unit/network_spec.js",
      "pdfjs-test/unit/network_utils_spec.js",
      "pdfjs-test/unit/parser_spec.js",
      "pdfjs-test/unit/pdf_find_controller_spec.js",
      "pdfjs-test/unit/pdf_find_utils_spec.js",
      "pdfjs-test/unit/pdf_history_spec.js",
      "pdfjs-test/unit/primitives_spec.js",
      "pdfjs-test/unit/stream_spec.js",
      "pdfjs-test/unit/type1_parser_spec.js",
      "pdfjs-test/unit/ui_utils_spec.js",
      "pdfjs-test/unit/unicode_spec.js",
      "pdfjs-test/unit/util_spec.js",
    ].map(function(moduleName) {
      return SystemJS.import(moduleName);
    })
  ).then(function(modules) {
    const displayApi = modules[0];
    const { GlobalWorkerOptions } = modules[1];
    const { PDFNetworkStream } = modules[2];
    const { PDFFetchStream } = modules[3];
    const { isNodeJS } = modules[4];

    if (isNodeJS) {
      throw new Error(
        "The `gulp unittest` command cannot be used in " +
          "Node.js environments."
      );
    }
    // Set the network stream factory for unit-tests.
    if (
      typeof Response !== "undefined" &&
      "body" in Response.prototype &&
      typeof ReadableStream !== "undefined"
    ) {
      displayApi.setPDFNetworkStreamFactory(function(params) {
        return new PDFFetchStream(params);
      });
    } else {
      displayApi.setPDFNetworkStreamFactory(function(params) {
        return new PDFNetworkStream(params);
      });
    }

    // Configure the worker.
    GlobalWorkerOptions.workerSrc = "../../build/generic/build/pdf.worker.js";

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
    getWindowLocation() {
      return window.location;
    },
  });

  var config = {
    failFast: queryString.getParam("failFast"),
    oneFailurePerSpec: queryString.getParam("oneFailurePerSpec"),
    hideDisabled: queryString.getParam("hideDisabled"),
  };

  var random = queryString.getParam("random");
  if (random !== undefined && random !== "") {
    config.random = random;
  }

  var seed = queryString.getParam("seed");
  if (seed) {
    config.seed = seed;
  }

  // Reporters
  var htmlReporter = new jasmine.HtmlReporter({
    env,
    navigateWithNewParam(key, value) {
      return queryString.navigateWithNewParam(key, value);
    },
    addToExistingQueryString(key, value) {
      return queryString.fullStringWithNewParam(key, value);
    },
    getContainer() {
      return document.body;
    },
    createElement() {
      return document.createElement.apply(document, arguments);
    },
    createTextNode() {
      return document.createTextNode.apply(document, arguments);
    },
    timer: new jasmine.Timer(),
  });

  env.addReporter(htmlReporter);

  if (queryString.getParam("browser")) {
    var testReporter = new TestReporter(
      queryString.getParam("browser"),
      queryString.getParam("path")
    );
    env.addReporter(testReporter);
  }

  // Filter which specs will be run by matching the start of the full name
  // against the `spec` query param.
  var specFilter = new jasmine.HtmlSpecFilter({
    filterString() {
      return queryString.getParam("spec");
    },
  });

  config.specFilter = function(spec) {
    return specFilter.matches(spec.getFullName());
  };

  env.configure(config);

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

    initializePDFJS(function() {
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
