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

"use strict";

var fs = require("fs");
var https = require("https");
var path = require("path");

// Fetches all languages that have an *active* translation in mozilla-central.
// This is used in gulpfile.js for the `importl10n` command.

var DEFAULT_LOCALE = "en-US";

var EXCLUDE_LANG_CODES = ["ca-valencia", "ja-JP-mac"];

function normalizeText(s) {
  return s.replace(/\r\n?/g, "\n").replace(/\uFEFF/g, "");
}

function downloadLanguageCodes() {
  console.log("Downloading language codes...\n");

  var ALL_LOCALES =
    "https://hg.mozilla.org/mozilla-central/raw-file/tip/browser/locales/all-locales";

  return new Promise(function (resolve) {
    https.get(ALL_LOCALES, function (response) {
      if (response.statusCode === 200) {
        var content = "";
        response.setEncoding("utf8");
        response.on("data", function (chunk) {
          content += chunk;
        });
        response.on("end", function () {
          content = content.trim(); // Remove any leading/trailing white-space.
          var langCodes = normalizeText(content).split("\n");
          // Remove all locales that we don't want to download below.
          for (var langCode of [DEFAULT_LOCALE, ...EXCLUDE_LANG_CODES]) {
            var i = langCodes.indexOf(langCode);
            if (i > -1) {
              langCodes.splice(i, 1);
            }
          }
          resolve(langCodes);
        });
      } else {
        resolve([]);
      }
    });
  });
}

function downloadLanguageFiles(root, langCode) {
  console.log("Downloading " + langCode + "...");

  // Constants for constructing the URLs. Translations are taken from the
  // Nightly channel as those are the most recent ones.
  var MOZ_CENTRAL_ROOT = "https://hg.mozilla.org/l10n-central/";
  var MOZ_CENTRAL_PDFJS_DIR = "/raw-file/default/browser/pdfviewer/";

  // Defines which files to download for each language.
  var files = ["viewer.properties"];
  var downloadsLeft = files.length;

  var outputDir = path.join(root, langCode);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  return new Promise(function (resolve) {
    // Download the necessary files for this language.
    files.forEach(function (fileName) {
      var outputPath = path.join(outputDir, fileName);
      var url = MOZ_CENTRAL_ROOT + langCode + MOZ_CENTRAL_PDFJS_DIR + fileName;

      https.get(url, function (response) {
        // Not all files exist for each language. Files without translations
        // have been removed (https://bugzilla.mozilla.org/show_bug.cgi?id=1443175).
        if (response.statusCode === 200) {
          var content = "";
          response.setEncoding("utf8");
          response.on("data", function (chunk) {
            content += chunk;
          });
          response.on("end", function () {
            fs.writeFileSync(outputPath, normalizeText(content), "utf8");
            if (--downloadsLeft === 0) {
              resolve();
            }
          });
        } else {
          if (--downloadsLeft === 0) {
            resolve();
          }
        }
      });
    });
  });
}

async function downloadL10n(root, callback) {
  var langCodes = await downloadLanguageCodes();

  for (var langCode of langCodes) {
    if (!langCode) {
      continue;
    }
    await downloadLanguageFiles(root, langCode);
  }

  var removeCodes = [];
  for (var entry of fs.readdirSync(root)) {
    var dirPath = path.join(root, entry),
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

  if (callback) {
    callback();
  }
}

exports.downloadL10n = downloadL10n;
