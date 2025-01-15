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

// PLEASE NOTE: This code is intended for development purposes only and
//              should NOT be used in production environments.

import fs from "fs";
import fsPromises from "fs/promises";
import http from "http";
import path from "path";
import { pathToFileURL } from "url";

const MIME_TYPES = {
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
  ".wasm": "application/wasm",
};
const DEFAULT_MIME_TYPE = "application/octet-stream";

class WebServer {
  constructor({ root, host, port, cacheExpirationTime }) {
    const cwdURL = pathToFileURL(process.cwd()) + "/";
    this.rootURL = new URL(`${root || "."}/`, cwdURL);
    this.host = host || "localhost";
    this.port = port || 0;
    this.server = null;
    this.verbose = false;
    this.cacheExpirationTime = cacheExpirationTime || 0;
    this.disableRangeRequests = false;
    this.hooks = {
      GET: [crossOriginHandler, redirectHandler],
      POST: [],
    };
  }

  start(callback) {
    this.#ensureNonZeroPort();
    this.server = http.createServer(this.#handler.bind(this));
    this.server.listen(this.port, this.host, callback);
    console.log(`Server running at http://${this.host}:${this.port}/`);
  }

  stop(callback) {
    this.server.close(callback);
    this.server = null;
  }

  #ensureNonZeroPort() {
    if (!this.port) {
      // If port is 0, a random port will be chosen instead. Do not set a host
      // name to make sure that the port is synchronously set by `.listen()`.
      const server = http.createServer().listen(0);
      const address = server.address();
      // `.address().port` being available synchronously is merely an
      // implementation detail, so we are defensive here and fall back to a
      // fixed port when the address is not available yet.
      this.port = address ? address.port : 8000;
      server.close();
    }
  }

  async #handler(request, response) {
    // URLs are normalized and automatically disallow directory traversal
    // attacks. For example, http://HOST:PORT/../../../../../../../etc/passwd
    // is equivalent to http://HOST:PORT/etc/passwd.
    const url = new URL(`http://${this.host}:${this.port}${request.url}`);

    // Validate the request method and execute method hooks.
    const methodHooks = this.hooks[request.method];
    if (!methodHooks) {
      response.writeHead(405);
      response.end("Unsupported request method", "utf8");
      return;
    }
    const handled = methodHooks.some(hook => hook(url, request, response));
    if (handled) {
      return;
    }

    // Check the request and serve the file/folder contents.
    if (url.pathname === "/favicon.ico") {
      url.pathname = "/test/resources/favicon.ico";
    }
    await this.#checkRequest(request, response, url);
  }

  async #checkRequest(request, response, url) {
    const localURL = new URL(`.${url.pathname}`, this.rootURL);

    // Check if the file/folder exists.
    try {
      await fsPromises.realpath(localURL);
    } catch (e) {
      if (e instanceof URIError) {
        // If the URI cannot be decoded, a `URIError` is thrown. This happens
        // for malformed URIs such as `http://localhost:8888/%s%s` and should be
        // handled as a bad request.
        response.writeHead(400);
        response.end("Bad request", "utf8");
        return;
      }

      response.writeHead(404);
      response.end();
      if (this.verbose) {
        console.error(`${url}: not found`);
      }
      return;
    }

    // Get the properties of the file/folder.
    let stats;
    try {
      stats = await fsPromises.stat(localURL);
    } catch {
      response.writeHead(500);
      response.end();
      return;
    }
    const fileSize = stats.size;
    const isDir = stats.isDirectory();

    // If a folder is requested, serve the directory listing.
    if (isDir && !/\/$/.test(url.pathname)) {
      response.setHeader("Location", `${url.pathname}/${url.search}`);
      response.writeHead(301);
      response.end("Redirected", "utf8");
      return;
    }
    if (isDir) {
      await this.#serveDirectoryIndex(response, url, localURL);
      return;
    }

    // If a file is requested with range requests, serve it accordingly.
    const { range } = request.headers;
    if (range && !this.disableRangeRequests) {
      const rangesMatches = /^bytes=(\d+)-(\d+)?/.exec(range);
      if (!rangesMatches) {
        response.writeHead(501);
        response.end("Bad range", "utf8");
        if (this.verbose) {
          console.error(`${url}: bad range: ${range}`);
        }
        return;
      }

      const start = +rangesMatches[1];
      const end = +rangesMatches[2];
      if (this.verbose) {
        console.log(`${url}: range ${start}-${end}`);
      }
      this.#serveFileRange(
        response,
        localURL,
        url.searchParams,
        fileSize,
        start,
        isNaN(end) ? fileSize : end + 1
      );
      return;
    }

    // Otherwise, serve the file normally.
    if (this.verbose) {
      console.log(url);
    }
    this.#serveFile(response, localURL, fileSize);
  }

  async #serveDirectoryIndex(response, url, localUrl) {
    response.setHeader("Content-Type", "text/html");
    response.writeHead(200);

    if (url.searchParams.has("frame")) {
      response.end(
        `<html>
          <frameset cols=*,200>
            <frame name=pdf>
            <frame src="${url.pathname}?side">
          </frameset>
        </html>`,
        "utf8"
      );
      return;
    }

    let files;
    try {
      files = await fsPromises.readdir(localUrl);
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
           <h1>Index of ${url.pathname}</h1>`
    );
    if (url.pathname !== "/") {
      response.write('<a href="..">..</a><br>');
    }

    const all = url.searchParams.has("all");
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
      const item = url.pathname + file;
      let href = "";
      let label = "";
      let extraAttributes = "";

      try {
        stat = fs.statSync(new URL(file, localUrl));
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
    if (!all && !url.searchParams.has("side")) {
      response.write(
        '<hr><p>(only PDF files are shown, <a href="?all">show all</a>)</p>'
      );
    }
    response.end("</body></html>");
  }

  #serveFile(response, fileURL, fileSize) {
    const stream = fs.createReadStream(fileURL, { flags: "rs" });
    stream.on("error", error => {
      response.writeHead(500);
      response.end();
    });

    if (!this.disableRangeRequests) {
      response.setHeader("Accept-Ranges", "bytes");
    }
    response.setHeader("Content-Type", this.#getContentType(fileURL));
    response.setHeader("Content-Length", fileSize);
    if (this.cacheExpirationTime > 0) {
      const expireTime = new Date();
      expireTime.setSeconds(expireTime.getSeconds() + this.cacheExpirationTime);
      response.setHeader("Expires", expireTime.toUTCString());
    }
    response.writeHead(200);
    stream.pipe(response);
  }

  #serveFileRange(response, fileURL, searchParams, fileSize, start, end) {
    if (end > fileSize || start > end) {
      response.writeHead(416);
      response.end();
      return;
    }
    const stream = fs.createReadStream(fileURL, {
      flags: "rs",
      start,
      end: end - 1,
    });
    stream.on("error", error => {
      response.writeHead(500);
      response.end();
    });

    response.setHeader("Accept-Ranges", "bytes");
    response.setHeader("Content-Type", this.#getContentType(fileURL));
    response.setHeader("Content-Length", end - start);
    response.setHeader(
      "Content-Range",
      `bytes ${start}-${end - 1}/${fileSize}`
    );

    // Support test in `test/unit/network_spec.js`.
    switch (searchParams.get("test-network-break-ranges")) {
      case "missing":
        response.removeHeader("Content-Range");
        break;
      case "invalid":
        response.setHeader("Content-Range", "bytes abc-def/qwerty");
        break;
    }
    response.writeHead(206);
    stream.pipe(response);
  }

  #getContentType(fileURL) {
    const extension = path.extname(fileURL.pathname).toLowerCase();
    return MIME_TYPES[extension] || DEFAULT_MIME_TYPE;
  }
}

// This supports the "Cross-origin" test in test/unit/api_spec.js
// and "Redirects" in test/unit/network_spec.js and
// test/unit/fetch_stream_spec.js via test/unit/common_pdfstream_tests.js.
// It is here instead of test.mjs so that when the test will still complete as
// expected if the user does "gulp server" and then visits
// http://localhost:8888/test/unit/unit_test.html?spec=Cross-origin
function crossOriginHandler(url, request, response) {
  if (url.pathname === "/test/pdfs/basicapi.pdf") {
    if (!url.searchParams.has("cors") || !request.headers.origin) {
      return;
    }
    response.setHeader("Access-Control-Allow-Origin", request.headers.origin);
    if (url.searchParams.get("cors") === "withCredentials") {
      response.setHeader("Access-Control-Allow-Credentials", "true");
    } // withoutCredentials does not include Access-Control-Allow-Credentials.
    response.setHeader(
      "Access-Control-Expose-Headers",
      "Accept-Ranges,Content-Range"
    );
    response.setHeader("Vary", "Origin");
  }
}

// This supports the "Redirects" test in test/unit/network_spec.js and
// test/unit/fetch_stream_spec.js via test/unit/common_pdfstream_tests.js.
// It is here instead of test.mjs so that when the test will still complete as
// expected if the user does "gulp server" and then visits
// http://localhost:8888/test/unit/unit_test.html?spec=Redirects
function redirectHandler(url, request, response) {
  const redirectToHost = url.searchParams.get("redirectToHost");
  if (redirectToHost) {
    // Chrome may serve byte range requests directly from the cache, potentially
    // from a full request or a different range, without involving the server.
    // To prevent this from happening, make sure that the response is never
    // cached, so that Range requests are never served from the browser cache.
    response.setHeader("Cache-Control", "no-store,max-age=0");

    if (url.searchParams.get("redirectIfRange") && !request.headers.range) {
      return false;
    }
    try {
      const newURL = new URL(url);
      newURL.hostname = redirectToHost;
      // Delete test-only query parameters to avoid infinite redirects.
      newURL.searchParams.delete("redirectToHost");
      newURL.searchParams.delete("redirectIfRange");
      if (newURL.hostname !== redirectToHost) {
        throw new Error(`Invalid hostname: ${redirectToHost}`);
      }
      response.setHeader("Location", newURL.href);
    } catch {
      response.writeHead(500);
      response.end();
      return true;
    }
    response.writeHead(302);
    response.end();
    return true;
  }
  return false;
}

export { WebServer };
