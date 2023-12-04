/*
 * Copyright 2014 Mozilla Foundation
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
/* eslint-disable no-var */

import crypto from "crypto";
import fs from "fs";
import http from "http";
import https from "https";
import { resolve as urlResolve } from "url";

function rewriteWebArchiveUrl(url) {
  // Web Archive URLs need to be transformed to add `if_` after the ID.
  // Without this, an HTML page containing an iframe with the PDF file
  // will be served instead (issue 8920).
  var webArchiveRegex =
    /(^https?:\/\/web\.archive\.org\/web\/)(\d+)(\/https?:\/\/.+)/g;
  var urlParts = webArchiveRegex.exec(url);
  if (urlParts) {
    return urlParts[1] + (urlParts[2] + "if_") + urlParts[3];
  }
  return url;
}

function downloadFile(file, url, callback, redirects) {
  url = rewriteWebArchiveUrl(url);

  var protocol = /^https:\/\//.test(url) ? https : http;
  protocol
    .get(url, function (response) {
      if (
        response.statusCode === 301 ||
        response.statusCode === 302 ||
        response.statusCode === 307 ||
        response.statusCode === 308
      ) {
        if (redirects > 10) {
          callback("Too many redirects");
        }
        var redirectTo = response.headers.location;
        redirectTo = urlResolve(url, redirectTo);
        downloadFile(file, redirectTo, callback, (redirects || 0) + 1);
        return;
      }

      if (response.statusCode !== 200) {
        callback("HTTP " + response.statusCode);
        return;
      }
      var stream = fs.createWriteStream(file);
      stream.on("error", function (err) {
        callback(err);
      });
      response.pipe(stream);
      stream.on("finish", function () {
        stream.end();
        callback();
      });
    })
    .on("error", function (err) {
      callback(err);
    });
}

function downloadManifestFiles(manifest, callback) {
  function downloadNext() {
    if (i >= links.length) {
      callback();
      return;
    }
    var file = links[i].file;
    var url = links[i].url;
    console.log("Downloading " + url + " to " + file + "...");
    downloadFile(file, url, function (err) {
      if (err) {
        console.error("Error during downloading of " + url + ": " + err);
        fs.writeFileSync(file, ""); // making it empty file
        fs.writeFileSync(file + ".error", err);
      }
      i++;
      downloadNext();
    });
  }

  var links = manifest
    .filter(function (item) {
      return item.link && !fs.existsSync(item.file);
    })
    .map(function (item) {
      var file = item.file;
      var linkfile = file + ".link";
      var url = fs.readFileSync(linkfile).toString();
      url = url.replace(/\s+$/, "");
      return { file, url };
    });

  var i = 0;
  downloadNext();
}

function calculateMD5(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(file);
    stream.on("data", data => hash.update(data));
    stream.on("error", error => reject(error));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function verifyManifestFiles(manifest) {
  let error = false;

  for (const item of manifest) {
    if (fs.existsSync(`${item.file}.error`)) {
      console.error(
        `WARNING: "${item.file}" was not downloaded; see "${item.file}.error" file.`
      );
      error = true;
      continue;
    }

    if (item.link && !fs.existsSync(`${item.file}.link`)) {
      console.error(
        `WARNING: Unneeded \`"link": true\`-entry for the "${item.id}" test.`
      );
      error = true;
      continue;
    }

    try {
      const md5 = await calculateMD5(item.file);
      if (!item.md5) {
        console.error(
          `WARNING: MD5 hash missing for "${item.file}" (computed "${md5}").`
        );
        error = true;
      } else if (md5 !== item.md5) {
        console.error(
          `WARNING: MD5 hash mismatch for "${item.file}" (expected "${item.md5}", computed "${md5}").`
        );
        error = true;
      }
    } catch (ex) {
      console.log(
        `WARNING: MD5 hash calculation failed for "${item.file}" ("${ex}").`
      );
      error = true;
    }
  }

  if (error) {
    throw new Error("Manifest validation failed");
  }
}

export { downloadManifestFiles, verifyManifestFiles };
