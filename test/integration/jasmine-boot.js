/* Copyright 2020 Mozilla Foundation
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

/* eslint-disable no-console */

import Jasmine from "jasmine";

async function runTests(results) {
  const jasmine = new Jasmine();
  jasmine.exitOnCompletion = false;
  jasmine.jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000;

  jasmine.loadConfig({
    random: true,
    spec_dir: "integration",
    spec_files: [
      "accessibility_spec.mjs",
      "annotation_spec.mjs",
      "autolinker_spec.mjs",
      "caret_browsing_spec.mjs",
      "comment_spec.mjs",
      "copy_paste_spec.mjs",
      "document_properties_spec.mjs",
      "find_spec.mjs",
      "freetext_editor_spec.mjs",
      "highlight_editor_spec.mjs",
      "ink_editor_spec.mjs",
      "reorganize_pages_spec.mjs",
      "scripting_spec.mjs",
      "signature_editor_spec.mjs",
      "stamp_editor_spec.mjs",
      "text_field_spec.mjs",
      "text_layer_spec.mjs",
      "thumbnail_view_spec.mjs",
      "viewer_spec.mjs",
    ],
  });

  jasmine.addReporter({
    jasmineDone(suiteInfo) {},
    jasmineStarted(suiteInfo) {},
    specDone(result) {
      // Report on the result of individual tests.
      ++results.runs;
      if (result.failedExpectations.length > 0 && !result.pendingReason) {
        ++results.failures;
        console.log(`TEST-UNEXPECTED-FAIL | ${result.description}`);
      } else {
        console.log(`TEST-PASSED | ${result.description}`);
      }
    },
    specStarted(result) {},
    suiteDone(result) {
      // Report on the result of `afterAll` invocations.
      if (result.failedExpectations.length > 0 && !result.pendingReason) {
        ++results.failures;
        console.log(`TEST-UNEXPECTED-FAIL | ${result.description}`);
      }
    },
    suiteStarted(result) {
      // Report on the result of `beforeAll` invocations.
      if (result.failedExpectations.length > 0 && !result.pendingReason) {
        ++results.failures;
        console.log(`TEST-UNEXPECTED-FAIL | ${result.description}`);
      }
    },
  });

  return jasmine.execute();
}

export { runTests };
