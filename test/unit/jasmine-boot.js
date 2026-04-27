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
/* globals jasmineRequire */

// Modified jasmine's boot.js file to load PDF.js libraries async.

"use strict";

import { GlobalWorkerOptions } from "pdfjs/display/worker_options.js";
import { isNodeJS } from "../../src/shared/util.js";
import { mergeCoverageIntoGlobal } from "../coverage_utils.js";
import { MessageHandler } from "pdfjs/shared/message_handler.js";
import { PDFWorker } from "pdfjs/display/api.js";
import { TestReporter } from "../reporter.js";

async function initializePDFJS(callback) {
  await Promise.all(
    [
      "pdfjs-test/unit/annotation_spec.js",
      "pdfjs-test/unit/annotation_storage_spec.js",
      "pdfjs-test/unit/api_spec.js",
      "pdfjs-test/unit/app_options_spec.js",
      "pdfjs-test/unit/autolinker_spec.js",
      "pdfjs-test/unit/bidi_spec.js",
      "pdfjs-test/unit/canvas_factory_spec.js",
      "pdfjs-test/unit/cff_parser_spec.js",
      "pdfjs-test/unit/cmap_spec.js",
      "pdfjs-test/unit/colorspace_spec.js",
      "pdfjs-test/unit/core_utils_spec.js",
      "pdfjs-test/unit/crypto_spec.js",
      "pdfjs-test/unit/custom_spec.js",
      "pdfjs-test/unit/default_appearance_spec.js",
      "pdfjs-test/unit/display_utils_spec.js",
      "pdfjs-test/unit/document_spec.js",
      "pdfjs-test/unit/editor_spec.js",
      "pdfjs-test/unit/encodings_spec.js",
      "pdfjs-test/unit/evaluator_spec.js",
      "pdfjs-test/unit/event_utils_spec.js",
      "pdfjs-test/unit/fetch_stream_spec.js",
      "pdfjs-test/unit/font_substitutions_spec.js",
      "pdfjs-test/unit/image_utils_spec.js",
      "pdfjs-test/unit/message_handler_spec.js",
      "pdfjs-test/unit/metadata_spec.js",
      "pdfjs-test/unit/murmurhash3_spec.js",
      "pdfjs-test/unit/name_number_tree_spec.js",
      "pdfjs-test/unit/network_spec.js",
      "pdfjs-test/unit/network_utils_spec.js",
      "pdfjs-test/unit/obj_bin_transform_spec.js",
      "pdfjs-test/unit/operator_list_dependencies_spec.js",
      "pdfjs-test/unit/parser_spec.js",
      "pdfjs-test/unit/pattern_spec.js",
      "pdfjs-test/unit/pdf.image_decoders_spec.js",
      "pdfjs-test/unit/pdf.worker_spec.js",
      "pdfjs-test/unit/pdf_find_controller_spec.js",
      "pdfjs-test/unit/pdf_find_utils_spec.js",
      "pdfjs-test/unit/pdf_history_spec.js",
      "pdfjs-test/unit/pdf_link_service_spec.js",
      "pdfjs-test/unit/pdf_spec.js",
      "pdfjs-test/unit/pdf_viewer.component_spec.js",
      "pdfjs-test/unit/pdf_viewer_spec.js",
      "pdfjs-test/unit/postscript_spec.js",
      "pdfjs-test/unit/primitives_spec.js",
      "pdfjs-test/unit/scripting_spec.js",
      "pdfjs-test/unit/stream_spec.js",
      "pdfjs-test/unit/struct_tree_spec.js",
      "pdfjs-test/unit/svg_factory_spec.js",
      "pdfjs-test/unit/text_layer_spec.js",
      "pdfjs-test/unit/type1_parser_spec.js",
      "pdfjs-test/unit/ui_utils_spec.js",
      "pdfjs-test/unit/unicode_spec.js",
      "pdfjs-test/unit/util_spec.js",
      "pdfjs-test/unit/writer_spec.js",
      "pdfjs-test/unit/xfa_formcalc_spec.js",
      "pdfjs-test/unit/xfa_parser_spec.js",
      "pdfjs-test/unit/xfa_serialize_data_spec.js",
      "pdfjs-test/unit/xfa_tohtml_spec.js",
      "pdfjs-test/unit/xml_spec.js",
    ].map(moduleName => import(moduleName)) // eslint-disable-line no-unsanitized/method
  );

  if (isNodeJS) {
    throw new Error(
      "The `gulp unittest` command cannot be used in Node.js environments."
    );
  }
  // Configure the worker.
  GlobalWorkerOptions.workerSrc = "../../build/generic/build/pdf.worker.mjs";

  callback();
}

// Each unit-test typically spins up its own `PDFWorker`, which is destroyed
// when the loading task is. Hook `destroy` so that we extract the worker-side
// `__coverage__` before terminating, and merge it into the main thread's
// `window.__coverage__`. Without this, anything tested through `getDocument`
// → worker (most of `core/`) has its execution counts dropped on the floor.
const pendingWorkerCoverage = new Set();

function installWorkerCoverageHook() {
  if (!window.__coverage__) {
    return;
  }
  const originalDestroy = PDFWorker.prototype.destroy;
  PDFWorker.prototype.destroy = function () {
    if (this.destroyed || !this._webWorker) {
      // Already torn down, or wrapping a foreign port — defer to the original
      // implementation, which leaves the underlying `Worker` alone.
      return originalDestroy.call(this);
    }
    // Capture the underlying Worker, then run the original destroy with
    // `terminate` neutralized so the public `destroyed`/`port` contract is
    // preserved synchronously while the Worker stays alive long enough to
    // hand back its `__coverage__`.
    const webWorker = this._webWorker;
    const realTerminate = webWorker.terminate.bind(webWorker);
    webWorker.terminate = () => {};
    try {
      originalDestroy.call(this);
    } finally {
      webWorker.terminate = realTerminate;
    }
    const handler = new MessageHandler("main", "worker", webWorker);
    const promise = handler
      .sendWithPromise("GetWorkerCoverage", null)
      .then(mergeCoverageIntoGlobal)
      .catch(e => {
        console.warn(`Failed to collect worker coverage: ${e}`);
      })
      .finally(() => {
        handler.destroy();
        realTerminate();
        pendingWorkerCoverage.delete(promise);
      });
    pendingWorkerCoverage.add(promise);
    return undefined;
  };
}

async function flushPendingWorkerCoverage() {
  while (pendingWorkerCoverage.size > 0) {
    await Promise.allSettled(pendingWorkerCoverage);
  }
}

(function () {
  window.jasmine = jasmineRequire.core(jasmineRequire);

  jasmineRequire.html(jasmine);

  const env = jasmine.getEnv();

  const jasmineInterface = jasmineRequire.interface(jasmine, env);
  extend(window, jasmineInterface);

  // Runner Parameters
  const urls = new jasmine.HtmlReporterV2Urls();

  env.configure(urls.configFromCurrentUrl());

  // Reporters
  const htmlReporter = new jasmine.HtmlReporterV2({ env, urls });

  env.addReporter(htmlReporter);

  if (window.__coverage__) {
    // Must run before `TestReporter`, whose `jasmineDone` triggers the
    // browser teardown; the worker-side counters need to be merged into
    // `window.__coverage__` before the page is closed.
    env.addReporter({ jasmineDone: flushPendingWorkerCoverage });
  }

  if (urls.queryString.getParam("browser")) {
    const testReporter = new TestReporter(urls.queryString.getParam("browser"));
    env.addReporter(testReporter);
  }

  // Sets longer timeout.
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000;

  function extend(destination, source) {
    for (const property in source) {
      destination[property] = source[property];
    }
    return destination;
  }

  function unitTestInit() {
    initializePDFJS(function () {
      installWorkerCoverageHook();
      env.execute();
    });
  }

  if (
    document.readyState === "interactive" ||
    document.readyState === "complete"
  ) {
    unitTestInit();
  } else {
    document.addEventListener("DOMContentLoaded", unitTestInit, true);
  }
})();
