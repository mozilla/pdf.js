/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2019 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
'use strict';

function initializePDFJS(callback) {
  Promise.all(['pdfjs/display/api', 'pdfjs/display/worker_options', 'pdfjs/display/network', 'pdfjs/display/fetch_stream', 'pdfjs/shared/is_node', 'pdfjs-test/unit/annotation_spec', 'pdfjs-test/unit/api_spec', 'pdfjs-test/unit/bidi_spec', 'pdfjs-test/unit/cff_parser_spec', 'pdfjs-test/unit/cmap_spec', 'pdfjs-test/unit/colorspace_spec', 'pdfjs-test/unit/core_utils_spec', 'pdfjs-test/unit/crypto_spec', 'pdfjs-test/unit/custom_spec', 'pdfjs-test/unit/display_svg_spec', 'pdfjs-test/unit/display_utils_spec', 'pdfjs-test/unit/document_spec', 'pdfjs-test/unit/encodings_spec', 'pdfjs-test/unit/evaluator_spec', 'pdfjs-test/unit/function_spec', 'pdfjs-test/unit/fetch_stream_spec', 'pdfjs-test/unit/message_handler_spec', 'pdfjs-test/unit/metadata_spec', 'pdfjs-test/unit/murmurhash3_spec', 'pdfjs-test/unit/network_spec', 'pdfjs-test/unit/network_utils_spec', 'pdfjs-test/unit/parser_spec', 'pdfjs-test/unit/pdf_find_controller_spec', 'pdfjs-test/unit/pdf_find_utils_spec', 'pdfjs-test/unit/pdf_history_spec', 'pdfjs-test/unit/primitives_spec', 'pdfjs-test/unit/stream_spec', 'pdfjs-test/unit/type1_parser_spec', 'pdfjs-test/unit/ui_utils_spec', 'pdfjs-test/unit/unicode_spec', 'pdfjs-test/unit/util_spec'].map(function (moduleName) {
    return SystemJS["import"](moduleName);
  })).then(function (modules) {
    var displayApi = modules[0];
    var GlobalWorkerOptions = modules[1].GlobalWorkerOptions;
    var PDFNetworkStream = modules[2].PDFNetworkStream;
    var PDFFetchStream = modules[3].PDFFetchStream;
    var isNodeJS = modules[4];

    if (isNodeJS()) {
      throw new Error('The `gulp unittest` command cannot be used in ' + 'Node.js environments.');
    }

    if (typeof Response !== 'undefined' && 'body' in Response.prototype && typeof ReadableStream !== 'undefined') {
      displayApi.setPDFNetworkStreamFactory(function (params) {
        return new PDFFetchStream(params);
      });
    } else {
      displayApi.setPDFNetworkStreamFactory(function (params) {
        return new PDFNetworkStream(params);
      });
    }

    GlobalWorkerOptions.workerSrc = '../../build/generic/build/pdf.worker.js';
    callback();
  });
}

(function () {
  window.jasmine = jasmineRequire.core(jasmineRequire);
  jasmineRequire.html(jasmine);
  var env = jasmine.getEnv();
  var jasmineInterface = jasmineRequire["interface"](jasmine, env);
  extend(window, jasmineInterface);
  var queryString = new jasmine.QueryString({
    getWindowLocation: function getWindowLocation() {
      return window.location;
    }
  });
  var config = {
    failFast: queryString.getParam('failFast'),
    oneFailurePerSpec: queryString.getParam('oneFailurePerSpec'),
    hideDisabled: queryString.getParam('hideDisabled')
  };
  var random = queryString.getParam('random');

  if (random !== undefined && random !== '') {
    config.random = random;
  }

  var seed = queryString.getParam('seed');

  if (seed) {
    config.seed = seed;
  }

  var htmlReporter = new jasmine.HtmlReporter({
    env: env,
    navigateWithNewParam: function navigateWithNewParam(key, value) {
      return queryString.navigateWithNewParam(key, value);
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

  config.specFilter = function (spec) {
    return specFilter.matches(spec.getFullName());
  };

  env.configure(config);
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