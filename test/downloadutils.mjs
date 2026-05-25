/* Copyright 2014 Mozilla Foundation
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

function rewriteWebArchiveUrl(url) {
  // Web Archive URLs need to be transformed to add `if_` after the ID.
  // Without this, an HTML page containing an iframe with the PDF file
  // will be served instead (issue 8920).
  const webArchiveRegex =
    /(^https?:\/\/web\.archive\.org\/web\/)(\d+)(\/https?:\/\/.+)/;
  const urlParts = webArchiveRegex.exec(url);
  if (urlParts) {
    return `${urlParts[1]}${urlParts[2]}if_${urlParts[3]}`;
  }
  return url;
}

async function downloadFile(file, url) {
  url = rewriteWebArchiveUrl(url);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(response.statusText);
  }
  return fs.promises.writeFile(file, response.body);
}

async function downloadManifestFiles(manifest) {
  // Keep track of file identifiers to remove any duplicates,
  // since multiple test-cases may use the same PDF.
  const seenFiles = new Set();

  const links = new Map(
    manifest
      .filter(({ link, file }) => {
        if (!link || seenFiles.has(file)) {
          return false;
        }
        seenFiles.add(file);
        return !fs.existsSync(file);
      })
      .map(({ file }) => {
        const url = fs.readFileSync(`${file}.link`).toString().trimEnd();
        return [file, url];
      })
  );
  seenFiles.clear();

  for (const [file, url] of links) {
    console.log(`Downloading ${url} to ${file}...`);
    try {
      await downloadFile(file, url);
    } catch (ex) {
      console.error(`Error during downloading of ${url}:`, ex);
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

export { calculateMD5, downloadManifestFiles, verifyManifestFiles };
