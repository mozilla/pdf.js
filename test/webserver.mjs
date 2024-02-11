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

import fs from "fs";
import fsPromises from "fs/promises";
import http from "http";
import path from "path";

var mimeTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".xhtml": "application/xhtml+xml",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".log": "text/plain",
  ".bcmap": "application/octet-stream",
  ".ftl": "text/plain",
};

var defaultMimeType = "application/octet-stream";

class WebServer {
  constructor() {
    this.root = ".";
    this.host = "localhost";
    this.port = 0;
    this.server = null;
    this.verbose = false;
    this.cacheExpirationTime = 0;
    this.disableRangeRequests = false;
    this.hooks = {
      GET: [crossOriginHandler],
      POST: [],
    };
  }

  start(callback) {
    this.#ensureNonZeroPort();
    this.server = http.createServer(this.#handler.bind(this));
    this.server.listen(this.port, this.host, callback);
    console.log(
      "Server running at http://" + this.host + ":" + this.port + "/"
    );
  }

  stop(callback) {
    this.server.close(callback);
    this.server = null;
  }

  #ensureNonZeroPort() {
    if (!this.port) {
      // If port is 0, a random port will be chosen instead. Do not set a host
      // name to make sure that the port is synchronously set by .listen().
      var server = http.createServer().listen(0);
      var address = server.address();
      // .address().port being available synchronously is merely an
      // implementation detail. So we are defensive here and fall back to some
      // fixed port when the address is not available yet.
      this.port = address ? address.port : 8000;
      server.close();
    }
  }

  #handler(req, res) {
    var self = this;
    var url = req.url.replaceAll("//", "/");
    var urlParts = /([^?]*)((?:\?(.*))?)/.exec(url);
    try {
      // Guard against directory traversal attacks such as
      // `/../../../../../../../etc/passwd`, which let you make GET requests
      // for files outside of `this.root`.
      var pathPart = path.normalize(decodeURI(urlParts[1]));
      // path.normalize returns a path on the basis of the current platform.
      // Windows paths cause issues in statFile and serverDirectoryIndex.
      // Converting to unix path would avoid platform checks in said functions.
      pathPart = pathPart.replaceAll("\\", "/");
    } catch {
      // If the URI cannot be decoded, a `URIError` is thrown. This happens for
      // malformed URIs such as `http://localhost:8888/%s%s` and should be
      // handled as a bad request.
      res.writeHead(400);
      res.end("Bad request", "utf8");
      return;
    }
    var queryPart = urlParts[3];
    var verbose = this.verbose;

    var methodHooks = this.hooks[req.method];
    if (!methodHooks) {
      res.writeHead(405);
      res.end("Unsupported request method", "utf8");
      return;
    }
    var handled = methodHooks.some(function (hook) {
      return hook(req, res);
    });
    if (handled) {
      return;
    }

    if (pathPart === "/favicon.ico") {
      fs.realpath(
        path.join(this.root, "test/resources/favicon.ico"),
        checkFile
      );
      return;
    }

    var disableRangeRequests = this.disableRangeRequests;

    var filePath;
    fs.realpath(path.join(this.root, pathPart), checkFile);

    function checkFile(err, file) {
      if (err) {
        res.writeHead(404);
        res.end();
        if (verbose) {
          console.error(url + ": not found");
        }
        return;
      }
      filePath = file;
      fs.stat(filePath, statFile);
    }

    var fileSize;

    function statFile(err, stats) {
      if (err) {
        res.writeHead(500);
        res.end();
        return;
      }

      fileSize = stats.size;
      var isDir = stats.isDirectory();
      if (isDir && !/\/$/.test(pathPart)) {
        res.setHeader("Location", pathPart + "/" + urlParts[2]);
        res.writeHead(301);
        res.end("Redirected", "utf8");
        return;
      }
      if (isDir) {
        self.#serveDirectoryIndex(res, pathPart, queryPart, filePath);
        return;
      }

      var range = req.headers.range;
      if (range && !disableRangeRequests) {
        var rangesMatches = /^bytes=(\d+)-(\d+)?/.exec(range);
        if (!rangesMatches) {
          res.writeHead(501);
          res.end("Bad range", "utf8");
          if (verbose) {
            console.error(url + ': bad range: "' + range + '"');
          }
          return;
        }
        var start = +rangesMatches[1];
        var end = +rangesMatches[2];
        if (verbose) {
          console.log(url + ": range " + start + " - " + end);
        }
        self.#serveFileRange(
          res,
          filePath,
          fileSize,
          start,
          isNaN(end) ? fileSize : end + 1
        );
        return;
      }
      if (verbose) {
        console.log(url);
      }
      self.#serveFile(res, filePath, fileSize);
    }
  }

  async #serveDirectoryIndex(response, pathPart, queryPart, directory) {
    response.setHeader("Content-Type", "text/html");
    response.writeHead(200);

    if (queryPart === "frame") {
      response.end(
        `<html>
          <frameset cols=*,200>
            <frame name=pdf>
            <frame src="${encodeURI(pathPart)}?side">
          </frameset>
        </html>`,
        "utf8"
      );
      return;
    }

    let files;
    try {
      files = await fsPromises.readdir(directory);
    } catch {
      response.end();
      return;
    }

    response.write(
      `<html>
         <head>
           <meta charset="utf-8">
         </head>
         <body>
           <h1>Index of ${pathPart}</h1>`
    );
    if (pathPart !== "/") {
      response.write('<a href="..">..</a><br>');
    }

    const all = queryPart === "all";
    const escapeHTML = untrusted =>
      // Escape untrusted input so that it can safely be used in a HTML response
      // in HTML and in HTML attributes.
      untrusted
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

    for (const file of files) {
      let stat;
      const item = pathPart + file;
      let href = "";
      let label = "";
      let extraAttributes = "";

      try {
        stat = fs.statSync(path.join(directory, file));
      } catch (ex) {
        href = encodeURI(item);
        label = `${file} (${ex})`;
        extraAttributes = ' style="color:red"';
      }

      if (stat) {
        if (stat.isDirectory()) {
          href = encodeURI(item);
          label = file;
        } else if (path.extname(file).toLowerCase() === ".pdf") {
          href = `/web/viewer.html?file=${encodeURIComponent(item)}`;
          label = file;
          extraAttributes = ' target="pdf"';
        } else if (all) {
          href = encodeURI(item);
          label = file;
        }
      }

      if (label) {
        response.write(
          `<a href="${escapeHTML(href)}"${extraAttributes}>${escapeHTML(label)}</a><br>`
        );
      }
    }

    if (files.length === 0) {
      response.write("<p>No files found</p>");
    }
    if (!all && queryPart !== "side") {
      response.write(
        '<hr><p>(only PDF files are shown, <a href="?all">show all</a>)</p>'
      );
    }
    response.end("</body></html>");
  }

  #serveFile(response, filePath, fileSize) {
    const stream = fs.createReadStream(filePath, { flags: "rs" });
    stream.on("error", error => {
      response.writeHead(500);
      response.end();
    });

    const extension = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[extension] || defaultMimeType;

    if (!this.disableRangeRequests) {
      response.setHeader("Accept-Ranges", "bytes");
    }
    response.setHeader("Content-Type", contentType);
    response.setHeader("Content-Length", fileSize);
    if (this.cacheExpirationTime > 0) {
      const expireTime = new Date();
      expireTime.setSeconds(expireTime.getSeconds() + this.cacheExpirationTime);
      response.setHeader("Expires", expireTime.toUTCString());
    }
    response.writeHead(200);
    stream.pipe(response);
  }

  #serveFileRange(response, filePath, fileSize, start, end) {
    const stream = fs.createReadStream(filePath, {
      flags: "rs",
      start,
      end: end - 1,
    });
    stream.on("error", error => {
      response.writeHead(500);
      response.end();
    });

    const extension = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[extension] || defaultMimeType;

    response.setHeader("Accept-Ranges", "bytes");
    response.setHeader("Content-Type", contentType);
    response.setHeader("Content-Length", end - start);
    response.setHeader(
      "Content-Range",
      `bytes ${start}-${end - 1}/${fileSize}`
    );
    response.writeHead(206);
    stream.pipe(response);
  }
}

// This supports the "Cross-origin" test in test/unit/api_spec.js
// It is here instead of test.js so that when the test will still complete as
// expected if the user does "gulp server" and then visits
// http://localhost:8888/test/unit/unit_test.html?spec=Cross-origin
function crossOriginHandler(req, res) {
  if (req.url === "/test/pdfs/basicapi.pdf?cors=withCredentials") {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (req.url === "/test/pdfs/basicapi.pdf?cors=withoutCredentials") {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
  }
}

export { WebServer };
