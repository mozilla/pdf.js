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

import crypto from "crypto";
import fs from "fs";
import http from "http";
import https from "https";
import { resolve as urlResolve } from "url";

function rewriteWebArchiveUrl(url) {
  // Web Archive URLs need to be transformed to add `if_` after the ID.
  // Without this, an HTML page containing an iframe with the PDF file
  // will be served instead (issue 8920).
  const webArchiveRegex =
    /(^https?:\/\/web\.archive\.org\/web\/)(\d+)(\/https?:\/\/.+)/g;
  const urlParts = webArchiveRegex.exec(url);
  if (urlParts) {
    return `${urlParts[1]}${urlParts[2]}if_${urlParts[3]}`;
  }
  return url;
}

function downloadFile(file, url, redirects = 0) {
  url = rewriteWebArchiveUrl(url);
  const protocol = /^https:\/\//.test(url) ? https : http;

  return new Promise((resolve, reject) => {
    protocol
      .get(url, async function (response) {
        if ([301, 302, 307, 308].includes(response.statusCode)) {
          if (redirects > 10) {
            reject(new Error("Too many redirects"));
            return;
          }
          const redirectTo = urlResolve(url, response.headers.location);
          try {
            await downloadFile(file, redirectTo, ++redirects);
            resolve();
          } catch (ex) {
            reject(ex);
          }
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const stream = fs.createWriteStream(file);
        stream.on("error", error => reject(error));
        stream.on("finish", () => {
          stream.end();
          resolve();
        });
        response.pipe(stream);
      })
      .on("error", error => reject(error));
  });
}

async function downloadManifestFiles(manifest) {
  const links = manifest
    .filter(item => item.link && !fs.existsSync(item.file))
    .map(item => {
      let url = fs.readFileSync(`${item.file}.link`).toString();
      url = url.replace(/\s+$/, "");
      return { file: item.file, url };
    });

  for (const { file, url } of links) {
    console.log(`Downloading ${url} to ${file}...`);
    try {
      await downloadFile(file, url);
    } catch (ex) {
      console.error(`Error during downloading of ${url}:`, ex);
      fs.writeFileSync(file, ""); // making it empty file
      fs.writeFileSync(`${file}.error`, ex);
    }
  }
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
