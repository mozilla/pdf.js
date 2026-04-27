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

// Istanbul coverage objects use s (statements), b (branches), and f (functions)
// as shorthand keys for the hit-count maps.
function mergeCoverageIntoGlobal(coverage) {
  if (!coverage || Object.keys(coverage).length === 0) {
    return;
  }
  globalThis.__coverage__ ??= {};
  for (const [key, fileCoverage] of Object.entries(coverage)) {
    const existing = globalThis.__coverage__[key];
    if (!existing) {
      globalThis.__coverage__[key] = fileCoverage;
      continue;
    }
    for (const id of Object.keys(fileCoverage.s)) {
      existing.s[id] = (existing.s[id] ?? 0) + fileCoverage.s[id];
    }
    for (const id of Object.keys(fileCoverage.b)) {
      existing.b[id] = fileCoverage.b[id].map(
        (c, i) => (existing.b[id]?.[i] ?? 0) + c
      );
    }
    for (const id of Object.keys(fileCoverage.f)) {
      existing.f[id] = (existing.f[id] ?? 0) + fileCoverage.f[id];
    }
  }
}

async function fetchAndMergeWorkerCoverage(pdfWorker) {
  if (!pdfWorker) {
    return;
  }
  try {
    const coverage = await pdfWorker.messageHandler.sendWithPromise(
      "GetWorkerCoverage",
      null
    );
    mergeCoverageIntoGlobal(coverage);
  } catch (e) {
    console.warn(`Failed to collect worker coverage: ${e}`);
  }
}

export { fetchAndMergeWorkerCoverage, mergeCoverageIntoGlobal };
