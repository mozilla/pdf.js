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

import Jasmine from "jasmine";

async function runTests(results) {
  const jasmine = new Jasmine();
  jasmine.exitOnCompletion = false;
  jasmine.jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000;

  jasmine.loadConfig({
    random: false,
    spec_dir: "integration",
    spec_files: [
      "accessibility_spec.js",
      "annotation_spec.js",
      "copy_paste_spec.js",
      "find_spec.js",
      "freetext_editor_spec.js",
      "ink_editor_spec.js",
      "scripting_spec.js",
      "stamp_editor_spec.js",
    ],
  });

  jasmine.addReporter({
    jasmineDone(suiteInfo) {},
    jasmineStarted(suiteInfo) {},
    specDone(result) {
      ++results.runs;
      if (result.failedExpectations.length > 0) {
        ++results.failures;
        console.log(`TEST-UNEXPECTED-FAIL | ${result.description}`);
      } else {
        console.log(`TEST-PASSED | ${result.description}`);
      }
    },
    specStarted(result) {},
    suiteDone(result) {},
    suiteStarted(result) {},
  });

  return jasmine.execute();
}

export { runTests };
