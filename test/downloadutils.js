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
/* eslint-disable object-shorthand */

"use strict";

var fs = require("fs");
var crypto = require("crypto");
var http = require("http");
var https = require("https");

function rewriteWebArchiveUrl(url) {
  // Web Archive URLs need to be transformed to add `if_` after the ID.
  // Without this, an HTML page containing an iframe with the PDF file
  // will be served instead (issue 8920).
  var webArchiveRegex = /(^https?:\/\/web\.archive\.org\/web\/)(\d+)(\/https?:\/\/.+)/g;
  var urlParts = webArchiveRegex.exec(url);
  if (urlParts) {
    return urlParts[1] + (urlParts[2] + "if_") + urlParts[3];
  }
  return url;
}

function downloadFile(file, url, callback, redirects) {
  url = rewriteWebArchiveUrl(url);

  var completed = false;
  var protocol = /^https:\/\//.test(url) ? https : http;
  protocol
    .get(url, function (response) {
      var redirectTo;
      if (
        response.statusCode === 301 ||
        response.statusCode === 302 ||
        response.statusCode === 307 ||
        response.statusCode === 308
      ) {
        if (redirects > 10) {
          callback("Too many redirects");
        }
        redirectTo = response.headers.location;
        redirectTo = require("url").resolve(url, redirectTo);
        downloadFile(file, redirectTo, callback, (redirects || 0) + 1);
        return;
      }
      if (response.statusCode === 404 && !url.includes("web.archive.org")) {
        // trying waybackmachine
        redirectTo = "http://web.archive.org/web/" + url;
        downloadFile(file, redirectTo, callback, (redirects || 0) + 1);
        return;
      }

      if (response.statusCode !== 200) {
        if (!completed) {
          completed = true;
          callback("HTTP " + response.statusCode);
        }
        return;
      }
      var stream = fs.createWriteStream(file);
      stream.on("error", function (err) {
        if (!completed) {
          completed = true;
          callback(err);
        }
      });
      response.pipe(stream);
      stream.on("finish", function () {
        stream.end();
        if (!completed) {
          completed = true;
          callback();
        }
      });
    })
    .on("error", function (err) {
      if (!completed) {
        if (
          typeof err === "object" &&
          err.errno === "ENOTFOUND" &&
          !url.includes("web.archive.org")
        ) {
          // trying waybackmachine
          var redirectTo = "http://web.archive.org/web/" + url;
          downloadFile(file, redirectTo, callback, (redirects || 0) + 1);
          return;
        }
        completed = true;
        callback(err);
      }
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
      return { file: file, url: url };
    });

  var i = 0;
  downloadNext();
}

function calculateMD5(file, callback) {
  var hash = crypto.createHash("md5");
  var stream = fs.createReadStream(file);
  stream.on("data", function (data) {
    hash.update(data);
  });
  stream.on("error", function (err) {
    callback(err);
  });
  stream.on("end", function () {
    var result = hash.digest("hex");
    callback(null, result);
  });
}

function verifyManifestFiles(manifest, callback) {
  function verifyNext() {
    if (i >= manifest.length) {
      callback(error);
      return;
    }
    var item = manifest[i];
    if (fs.existsSync(item.file + ".error")) {
      console.error(
        'WARNING: File was not downloaded. See "' + item.file + '.error" file.'
      );
      error = true;
      i++;
      verifyNext();
      return;
    }
    calculateMD5(item.file, function (err, md5) {
      if (err) {
        console.log('WARNING: Unable to open file for reading "' + err + '".');
        error = true;
      } else if (!item.md5) {
        console.error(
          'WARNING: Missing md5 for file "' +
            item.file +
            '". ' +
            'Hash for current file is "' +
            md5 +
            '"'
        );
        error = true;
      } else if (md5 !== item.md5) {
        console.error(
          'WARNING: MD5 of file "' +
            item.file +
            '" does not match file. Expected "' +
            item.md5 +
            '" computed "' +
            md5 +
            '"'
        );
        error = true;
      }
      i++;
      verifyNext();
    });
  }
  var i = 0;
  var error = false;
  verifyNext();
}

exports.downloadManifestFiles = downloadManifestFiles;
exports.verifyManifestFiles = verifyManifestFiles;
