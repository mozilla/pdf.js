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

import fs from "fs";
import { parseArgs } from "node:util";
import path from "path";

const __dirname = import.meta.dirname;
const PROJECT_ROOT = path.join(__dirname, "../..");

// The per-test coverage index (which ref test exercises which source
// line/function) is rebuilt on every push to master and published to the
// gh-pages branch of the pdf.js.refs repository.
const PER_TEST_INDEX_URL =
  "https://raw.githubusercontent.com/mozilla/pdf.js.refs/gh-pages/per-test-index.json";

let values;
try {
  ({ values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      code: { type: "string" },
      index: { type: "string", default: "build/per-test-index.json" },
      "no-download": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  }));
} catch (error) {
  // parseArgs is strict, so an unknown/renamed option (e.g. the removed
  // --coverage-dir) would otherwise abort with an uncaught stack trace.
  console.error(`Error: ${error.message}`);
  console.error("Run with --help to see the available options.");
  process.exit(1);
}

if (values.help || !values.code) {
  console.log(
    "Usage: coverage_search.mjs --code=<file>::<line|function> [--index=<path>] [--no-download]\n\n" +
      "  --code          Source file and line number or function name to search for.\n" +
      "                  Examples:\n" +
      "                    --code=canvas.js::205\n" +
      "                    --code=canvas.js::drawImageAtIntegerCoords\n" +
      "  --index         Where to cache or read the per-test index.\n" +
      "                  [build/per-test-index.json]\n" +
      "  --no-download   Don't contact the network; use the cached index as-is.\n\n" +
      "Prints to stdout the IDs of tests whose coverage includes the given line or\n" +
      "function (one ID per line).\n\n" +
      "The index is downloaded from the pdf.js.refs repository and cached locally;\n" +
      "it is only re-downloaded when the published file has changed.\n" +
      `Source: ${PER_TEST_INDEX_URL}`
  );
  process.exit(values.help ? 0 : 1);
}

const sep = values.code.indexOf("::");
if (sep === -1) {
  console.error(
    "Error: --code must be in format 'file.js::line_or_function', e.g. canvas.js::205"
  );
  process.exit(1);
}

const fileName = values.code.slice(0, sep);
const location = values.code.slice(sep + 2);
const isLine = /^\d+$/.test(location);
const lineNum = isLine ? parseInt(location, 10) : null;
const funcName = isLine ? null : location;

const indexPath = path.isAbsolute(values.index)
  ? values.index
  : path.join(PROJECT_ROOT, values.index);
// The ETag of the cached copy is stored alongside it, so the next run can ask
// the server (via If-None-Match) to only re-send the file when it has changed.
const etagPath = `${indexPath}.etag`;

// Refreshes the locally cached index from the published copy, downloading it
// only when it has changed since the last run. When the network is unavailable
// a previously cached copy is reused if present.
async function refreshIndex() {
  if (values["no-download"]) {
    return; // Freshness check disabled; the read below validates existence.
  }

  const hasCached = fs.existsSync(indexPath);

  // On any download failure, fall back to a previously cached copy when one
  // exists; otherwise there's nothing to search, so fail.
  const fallbackOrFail = reason => {
    if (hasCached) {
      console.error(
        `Warning: couldn't refresh per-test index (${reason}); using the cached copy.`
      );
      return;
    }
    console.error(`Error: couldn't download per-test index (${reason}).`);
    process.exit(1);
  };

  const headers = {};
  if (hasCached && fs.existsSync(etagPath)) {
    const etag = fs.readFileSync(etagPath, "utf8").trim();
    // Only forward a syntactically valid HTTP ETag (RFC 7232), so the cached
    // file's contents can't be used to inject arbitrary data into the request.
    if (/^(?:W\/)?"[\x21\x23-\x7e]*"$/.test(etag)) {
      headers["If-None-Match"] = etag;
    }
  }

  let response;
  try {
    console.error(`Fetching per-test index from ${PER_TEST_INDEX_URL} ...`);
    response = await fetch(PER_TEST_INDEX_URL, { headers });
  } catch (error) {
    fallbackOrFail(error.message);
    return;
  }

  if (response.status === 304) {
    console.error("Per-test index is up to date.");
    return;
  }
  if (!response.ok) {
    fallbackOrFail(`HTTP ${response.status}`);
    return;
  }

  let text;
  try {
    text = await response.text();
  } catch (error) {
    fallbackOrFail(error.message);
    return;
  }

  // Parse the payload before caching it, and cache the re-serialized result
  // rather than the raw response body: only well-formed JSON produced by our
  // own JSON.stringify is ever written to disk.
  let serialized;
  try {
    serialized = JSON.stringify(JSON.parse(text));
  } catch {
    fallbackOrFail("the downloaded index is not valid JSON");
    return;
  }

  // Write to a temporary file and rename it into place.
  try {
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    const tmpPath = `${indexPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, serialized);
    fs.renameSync(tmpPath, indexPath);

    const etag = response.headers.get("etag");
    if (etag) {
      fs.writeFileSync(etagPath, etag);
    } else {
      fs.rmSync(etagPath, { force: true });
    }
  } catch (error) {
    // A write failure (disk full, read-only dir, ...) shouldn't be fatal when
    // a usable cached copy already exists.
    fallbackOrFail(error.message);
    return;
  }
  console.error(`Per-test index updated (${serialized.length} bytes).`);
}

await refreshIndex();

if (!fs.existsSync(indexPath)) {
  console.error(`Error: per-test index not found: ${indexPath}`);
  console.error(
    "Build it locally (gulp botbrowsertest --coverage-per-test) or omit " +
      "--no-download to fetch it from the pdf.js.refs repository."
  );
  process.exit(1);
}

let ids, files;
try {
  ({ ids, files } = JSON.parse(fs.readFileSync(indexPath, "utf8")));
} catch (error) {
  console.error(
    `Error: couldn't read per-test index at ${indexPath}: ${error.message}`
  );
  console.error(
    "The cached index may be corrupt; delete it and re-run without " +
      "--no-download to refetch it."
  );
  process.exit(1);
}

// Find the file entry whose path matches fileName.
let fileEntry = null;
for (const [filePath, entry] of Object.entries(files)) {
  if (
    filePath === fileName ||
    filePath.endsWith(`/${fileName}`) ||
    filePath.endsWith(`\\${fileName}`)
  ) {
    fileEntry = entry;
    break;
  }
}

if (!fileEntry) {
  process.exit(0);
}

let testIndices = null;

if (lineNum !== null) {
  // Direct line lookup.
  testIndices = fileEntry.l?.[lineNum];

  // If no hit, check whether lineNum is a function declaration start and
  // redirect to that function's coverage.
  if (!testIndices && fileEntry.fstarts?.[lineNum]) {
    testIndices = fileEntry.f?.[fileEntry.fstarts[lineNum]];
  }
} else {
  testIndices = fileEntry.f?.[funcName];
}

if (testIndices) {
  for (const idx of testIndices) {
    console.log(ids[idx]);
  }
}
