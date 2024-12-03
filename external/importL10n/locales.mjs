/* Copyright 2012 Mozilla Foundation
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
import path from "path";

// Fetches all languages that have an *active* translation in mozilla-central.
// This is used in gulpfile.js for the `importl10n` command.

const DEFAULT_LOCALE = "en-US";

const EXCLUDE_LANG_CODES = new Set(["ca-valencia", "ja-JP-mac"]);

function normalizeText(s) {
  return s.replaceAll(/\r\n?/g, "\n").replaceAll("\uFEFF", "");
}

async function downloadLanguageCodes() {
  console.log("Downloading language codes...\n");

  const ALL_LOCALES =
    "https://raw.githubusercontent.com/mozilla/gecko-dev/master/browser/locales/all-locales";

  const response = await fetch(ALL_LOCALES);
  if (!response.ok) {
    throw new Error(response.statusText);
  }
  const content = await response.text();

  // Remove any leading/trailing white-space.
  const langCodes = normalizeText(content.trim()).split("\n");
  // Remove all locales that we don't want to download below.
  return langCodes.filter(
    langCode => langCode !== DEFAULT_LOCALE && !EXCLUDE_LANG_CODES.has(langCode)
  );
}

async function downloadLanguageFiles(root, langCode) {
  console.log(`Downloading ${langCode}...`);

  // Constants for constructing the URLs. Translations are taken from the
  // Nightly channel as those are the most recent ones.
  const MOZ_CENTRAL_ROOT =
    "https://raw.githubusercontent.com/mozilla-l10n/firefox-l10n/main/";
  const MOZ_CENTRAL_PDFJS_DIR = "/toolkit/toolkit/pdfviewer/";

  // Defines which files to download for each language.
  const files = ["viewer.ftl"];

  const outputDir = path.join(root, langCode);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  // Download the necessary files for this language.
  for (const fileName of files) {
    const outputPath = path.join(outputDir, fileName);
    const url = MOZ_CENTRAL_ROOT + langCode + MOZ_CENTRAL_PDFJS_DIR + fileName;

    const response = await fetch(url);
    if (!response.ok) {
      // Not all files exist for each language. Files without translations
      // have been removed (https://bugzilla.mozilla.org/show_bug.cgi?id=1443175).
      continue;
    }
    const content = await response.text();

    fs.writeFileSync(outputPath, normalizeText(content), "utf8");
  }
}

async function downloadL10n(root) {
  const langCodes = await downloadLanguageCodes();

  for (const langCode of langCodes) {
    if (!langCode) {
      continue;
    }
    await downloadLanguageFiles(root, langCode);
  }

  const removeCodes = [];
  for (const entry of fs.readdirSync(root)) {
    const dirPath = path.join(root, entry),
      stat = fs.lstatSync(dirPath);

    if (
      stat.isDirectory() &&
      entry !== DEFAULT_LOCALE &&
      !langCodes.includes(entry)
    ) {
      removeCodes.push(entry);
    }
  }
  if (removeCodes.length) {
    console.log(
      "\nConsider removing the following unmaintained locales:\n" +
        removeCodes.join(", ") +
        "\n"
    );
  }
}

export { downloadL10n };
