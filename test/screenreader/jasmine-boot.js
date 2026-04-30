/* Copyright 2026 Mozilla Foundation
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

import { TEST_PASSED, TEST_UNEXPECTED_FAIL } from "../color_utils.mjs";
import Jasmine from "jasmine";
import { register } from "./screenreader_spec.mjs";

async function runTests(results) {
  const jasmine = new Jasmine();
  jasmine.exitOnCompletion = false;
  // Real screen-reader automation is significantly slower than the regular
  // integration tests (driver startup + speech synthesis polling), so the
  // per-spec timeout is bumped accordingly.
  jasmine.jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;

  // We register specs by calling the spec module's `register()` rather
  // than letting Jasmine load files itself. This lets the harness invoke
  // `runTests` once per browser without needing to bust the ES module
  // cache: `describe`/`it`/etc. are resolved off `globalThis` inside
  // `register`, against whichever Jasmine instance was just installed.
  jasmine.loadConfig({
    random: false,
    spec_dir: "screenreader",
    spec_files: [],
  });

  register();

  function failureError(result) {
    return result.failedExpectations
      ?.map(item => item.message)
      .filter(Boolean)
      .join(" ");
  }

  jasmine.addReporter({
    jasmineDone(suiteInfo) {},
    jasmineStarted(suiteInfo) {},
    specDone(result) {
      // Ignore excluded (fit/xit) or skipped (pending) tests.
      if (["excluded", "pending"].includes(result.status)) {
        return;
      }

      // Report on passed or failed tests.
      ++results.runs;
      if (result.status === "passed") {
        console.log(`${TEST_PASSED} | ${result.description}`);
      } else {
        ++results.failures;
        const error = failureError(result);
        results.failureList?.push({
          description: result.description,
          error,
        });
        console.log(
          `${TEST_UNEXPECTED_FAIL} | ${result.description}${error ? ` | ${error}` : ""}`
        );
      }
    },
    specStarted(result) {},
    suiteDone(result) {
      // Ignore excluded (fdescribe/xdescribe) or skipped (pending) suites.
      if (["excluded", "pending"].includes(result.status)) {
        return;
      }

      // Report on failed suites only (indicates problems in setup/teardown).
      if (result.status === "failed") {
        ++results.failures;
        const error = failureError(result);
        results.failureList?.push({
          description: result.description,
          error,
        });
        console.log(
          `${TEST_UNEXPECTED_FAIL} | ${result.description}${error ? ` | ${error}` : ""}`
        );
      }
    },
    suiteStarted(result) {},
  });

  return jasmine.execute();
}

export { runTests };
