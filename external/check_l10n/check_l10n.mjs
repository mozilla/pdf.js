#!/usr/bin/env node

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

/**
 * Checks that every message ID defined in l10n/en-US/viewer.ftl is referenced
 * in at least one HTML or JS/MJS file under the web/ directory.
 *
 * Usage:  node external/check_l10n/check_l10n.mjs
 */

import { extname, join } from "path";
import { readdirSync, readFileSync, statSync } from "fs";

const ROOT = join(import.meta.dirname, "..", "..");
const FTL_PATH = join(ROOT, "l10n", "en-US", "viewer.ftl");
const SEARCH_DIRS = ["web", "src"];
const SEARCH_EXTENSIONS = new Set([".html", ".js", ".mjs"]);
// Minimum number of characters a prefix or suffix fragment must have to be
// considered a meaningful match when detecting dynamically-built IDs.
const MIN_FRAGMENT_LENGTH = 6;

/**
 * Extract all message IDs from a Fluent (.ftl) file.
 * A message ID is an identifier at the start of a line followed by " =".
 * @param {string} ftlPath - Absolute path to the .ftl file.
 * @returns {string[]} Ordered list of message IDs.
 */
function extractFtlIds(ftlPath) {
  const lines = readFileSync(ftlPath, "utf8").split("\n");
  const ids = [];
  for (const line of lines) {
    const match = line.match(/^([a-z][a-z0-9-]*)\s*=/i);
    if (match) {
      ids.push(match[1]);
    }
  }
  return ids;
}

/**
 * Recursively collect all files with matching extensions under a directory.
 * @param {string} dir - Directory to walk.
 * @param {Set<string>} extensions - Allowed file extensions (e.g. `".js"`).
 * @returns {string[]} Absolute paths of matching files.
 */
function collectFiles(dir, extensions) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectFiles(fullPath, extensions));
    } else if (extensions.has(extname(entry))) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Load the contents of all source files found under the given directories.
 * @param {string[]} dirs - Directory names relative to ROOT.
 * @param {Set<string>} extensions - Allowed file extensions.
 * @returns {{ path: string, content: string }[]}
 */
function loadSources(dirs, extensions) {
  const files = dirs.flatMap(d => collectFiles(join(ROOT, d), extensions));
  return files.map(f => ({ path: f, content: readFileSync(f, "utf8") }));
}

/**
 * Check whether a message ID appears as a quoted string literal in any source
 * file. Handles double quotes, single quotes, and backticks, covering:
 *   - `data-l10n-id="pdfjs-foo"` (HTML attribute)
 *   - `"pdfjs-foo"` / `'pdfjs-foo'` / `` `pdfjs-foo` `` (JS string literals,
 *     `setAttribute`, `l10n.get`, …)
 * @param {string} id - Message ID to look up.
 * @param {{ path: string, content: string }[]} sources
 * @returns {boolean}
 */
function isUsed(id, sources) {
  const dq = `"${id}"`;
  const sq = `'${id}'`;
  const bt = `\`${id}\``;
  return sources.some(
    ({ content }) =>
      content.includes(dq) || content.includes(sq) || content.includes(bt)
  );
}

/**
 * For IDs not found as complete literals, check whether the ID is likely
 * constructed dynamically via a template literal such as:
 *   `pdfjs-editor-${editorType}-added-alert`
 *
 * Strategy: try every (prefix, suffix) pair obtained by splitting the ID's
 * dash-separated components, leaving one or more components as the "variable"
 * gap. The prefix must appear immediately followed by `${` in a template
 * literal; the suffix (if non-empty) must also appear in the same file.
 * Minimum length guards prevent matches on trivially short fragments.
 *
 * @param {string} id - Message ID to test.
 * @param {{ path: string, content: string }[]} sources
 * @returns {{ path: string, line: number } | null} Location of the first
 *   matching template literal, or `null` if none found.
 */
function findDynamicLocation(id, sources) {
  const parts = id.split("-");
  // i = end of prefix (exclusive), j = start of suffix (inclusive)
  for (let i = 1; i < parts.length; i++) {
    for (let j = i + 1; j <= parts.length; j++) {
      const prefix = parts.slice(0, i).join("-") + "-"; // e.g. "pdfjs-editor-"
      const suffix = j < parts.length ? "-" + parts.slice(j).join("-") : ""; // e.g. "-added-alert"
      if (prefix.length < MIN_FRAGMENT_LENGTH) {
        continue;
      }
      if (suffix !== "" && suffix.length < MIN_FRAGMENT_LENGTH) {
        continue;
      }
      // The prefix must be immediately followed by "${" in a template literal.
      const prefixWithVar = prefix + "${";
      for (const { path, content } of sources) {
        if (
          content.includes(prefixWithVar) &&
          (suffix === "" || content.includes(suffix))
        ) {
          const idx = content.indexOf(prefixWithVar);
          const line = content.slice(0, idx).split("\n").length;
          return { path, line };
        }
      }
    }
  }
  return null;
}

function main() {
  const ids = extractFtlIds(FTL_PATH);
  console.log(`Found ${ids.length} message IDs in viewer.ftl\n`);

  const sources = loadSources(SEARCH_DIRS, SEARCH_EXTENSIONS);
  console.log(
    `Searching in ${sources.length} files under: ${SEARCH_DIRS.join(", ")}\n`
  );

  const notFound = ids.filter(id => !isUsed(id, sources));
  const dynamicEntries = notFound
    .map(id => ({ id, loc: findDynamicLocation(id, sources) }))
    .filter(({ loc }) => loc !== null);
  const dynamicIds = new Set(dynamicEntries.map(({ id }) => id));
  const unused = notFound.filter(id => !dynamicIds.has(id));

  if (dynamicEntries.length > 0) {
    console.log(
      `~ ${dynamicEntries.length} ID(s) likely built dynamically (template literals):\n`
    );
    for (const { id, loc } of dynamicEntries) {
      const rel = loc.path.replace(ROOT + "/", "").replace(ROOT + "\\", "");
      console.log(`  ${id}`);
      console.log(`    → ${rel}:${loc.line}`);
    }
    console.log();
  }

  if (unused.length === 0) {
    console.log("✓ All remaining message IDs are used.");
  } else {
    console.log(`✗ ${unused.length} unused message ID(s):\n`);
    for (const id of unused) {
      console.log(`  ${id}`);
    }
    process.exitCode = 1;
  }
}

main();
