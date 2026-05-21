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
/* globals jasmineRequire */

// Modified jasmine's boot.js file to load PDF.js libraries async.

"use strict";

import { TestReporter } from "../reporter.js";

async function initializePDFJS(callback) {
  await Promise.all(
    [
      "pdfjs-test/font/font_core_spec.js",
      "pdfjs-test/font/font_glyf_spec.js",
      "pdfjs-test/font/font_os2_spec.js",
      "pdfjs-test/font/font_post_spec.js",
      "pdfjs-test/font/font_fpgm_spec.js",
    ].map(moduleName => import(moduleName)) // eslint-disable-line no-unsanitized/method
  );

  callback();
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

  function fontTestInit() {
    initializePDFJS(function () {
      env.execute();
    });
  }

  if (
    document.readyState === "interactive" ||
    document.readyState === "complete"
  ) {
    fontTestInit();
  } else {
    document.addEventListener("DOMContentLoaded", fontTestInit, true);
  }
})();
