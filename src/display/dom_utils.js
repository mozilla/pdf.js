/* Copyright 2015 Mozilla Foundation
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

import { shadow, stripPath, warn } from "../shared/util.js";
import { getRGB } from "./display_utils.js";
import { PageViewport } from "./page_viewport.js";
import { XfaLayer } from "./xfa_layer.js";

/**
 * This file contains helper functions that:
 *  - Directly, or indirectly, access the DOM.
 *  - Are only invoked from code running in the main-thread.
 */

async function fetchData(url, type = "text") {
  if (
    (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) ||
    isValidFetchUrl(url, document.baseURI)
  ) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    switch (type) {
      case "blob":
        return response.blob();
      case "bytes":
        return response.bytes();
      case "json":
        return response.json();
    }
    return response.text();
  }

  // The Fetch API is not supported.
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url, /* async = */ true);
    request.responseType = type === "bytes" ? "arraybuffer" : type;

    request.onreadystatechange = () => {
      if (request.readyState !== XMLHttpRequest.DONE) {
        return;
      }
      if (request.status === 200 || request.status === 0) {
        switch (type) {
          case "bytes":
            resolve(new Uint8Array(request.response));
            return;
          case "blob":
          case "json":
            resolve(request.response);
            return;
        }
        resolve(request.responseText);
        return;
      }
      reject(new Error(request.statusText));
    };

    request.send(null);
  });
}

function isDataScheme(url) {
  const ii = url.length;
  let i = 0;
  while (i < ii && url[i].trim() === "") {
    i++;
  }
  return url.substring(i, i + 5).toLowerCase() === "data:";
}

function isPdfFile(filename) {
  return typeof filename === "string" && /\.pdf$/i.test(filename);
}

/**
 * Gets the filename from a given URL.
 * @param {string} url
 * @returns {string}
 */
function getFilenameFromUrl(url) {
  [url] = url.split(/[#?]/, 1);
  return stripPath(url);
}

/**
 * Returns the filename or guessed filename from the url (see issue 3455).
 * @param {string} url - The original PDF location.
 * @param {string} defaultFilename - The value returned if the filename is
 *   unknown, or the protocol is unsupported.
 * @returns {string} Guessed PDF filename.
 */
function getPdfFilenameFromUrl(url, defaultFilename = "document.pdf") {
  if (typeof url !== "string") {
    return defaultFilename;
  }
  if (isDataScheme(url)) {
    warn('getPdfFilenameFromUrl: ignore "data:"-URL for performance reasons.');
    return defaultFilename;
  }

  const getURL = urlString => {
    try {
      return new URL(urlString);
    } catch {}
    try {
      return new URL(decodeURIComponent(urlString));
    } catch {}
    try {
      // Attempt to parse the URL using the document's base URI.
      return new URL(urlString, "https://foo.bar");
    } catch {}
    try {
      return new URL(decodeURIComponent(urlString), "https://foo.bar");
    } catch {}

    return null;
  };

  const newURL = getURL(url);
  if (!newURL) {
    // If the URL is invalid, return the default filename.
    return defaultFilename;
  }

  const decode = name => {
    try {
      let decoded = decodeURIComponent(name);
      if (decoded.includes("/")) {
        decoded = stripPath(decoded);
        // Ignore the decoded name if it's identical to ".pdf".
        if (decoded.length === 4 && pdfRegex.test(decoded)) {
          return name;
        }
      }
      return decoded;
    } catch {
      return name;
    }
  };

  const pdfRegex = /\.pdf$/i;
  const filename = stripPath(newURL.pathname);
  if (pdfRegex.test(filename)) {
    return decode(filename);
  }

  if (newURL.searchParams.size > 0) {
    const getLast = iterator => [...iterator].findLast(v => pdfRegex.test(v));

    // If any of the search parameters ends with ".pdf", return it.
    const name =
      getLast(newURL.searchParams.values()) ??
      getLast(newURL.searchParams.keys());
    if (name) {
      return decode(name);
    }
  }

  if (newURL.hash) {
    // Locate the last ".pdf" and then extend it to the left, up to the closest
    // separator. Both steps are linear, whereas a single pattern starting with
    // `[^/?#=]+` is quadratic on a hash which contains no ".pdf" at all.
    const { hash } = newURL;
    let extensionStart = -1;
    for (const { index } of hash.matchAll(/\.pdf\b/gi)) {
      extensionStart = index;
    }
    if (extensionStart > 0) {
      let filenameStart = extensionStart;
      while (filenameStart > 0 && !"/?#=".includes(hash[filenameStart - 1])) {
        filenameStart--;
      }
      if (filenameStart < extensionStart) {
        return decode(hash.slice(filenameStart, extensionStart + 4));
      }
    }
  }

  return defaultFilename;
}

function isValidFetchUrl(url, baseUrl) {
  if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
    throw new Error("Not implemented: isValidFetchUrl");
  }
  const res = baseUrl ? URL.parse(url, baseUrl) : URL.parse(url);
  // The Fetch API only supports the http/https protocols, and not file/ftp.
  return /https?:/.test(res?.protocol ?? "");
}

/**
 * Event handler to suppress context menu.
 */
function noContextMenu(e) {
  e.preventDefault();
}

function stopEvent(e) {
  e.preventDefault();
  e.stopPropagation();
}

class PDFDateString {
  static #regex;

  /**
   * Convert a PDF date string to a JavaScript `Date` object.
   *
   * The PDF date string format is described in section 7.9.4 of the official
   * PDF 32000-1:2008 specification. However, in the PDF 1.7 reference (sixth
   * edition) Adobe describes the same format including a trailing apostrophe.
   * This syntax in incorrect, but Adobe Acrobat creates PDF files that contain
   * them. We ignore all apostrophes as they are not necessary for date parsing.
   *
   * Moreover, Adobe Acrobat doesn't handle changing the date to universal time
   * and doesn't use the user's time zone (effectively ignoring the HH' and mm'
   * parts of the date string).
   * @param {string} input
   * @returns {Date|null}
   */
  static toDateObject(input) {
    if (input instanceof Date) {
      return input;
    }
    if (!input || typeof input !== "string") {
      return null;
    }

    // Lazily initialize the regular expression.
    this.#regex ||= new RegExp(
      "^D:" + // Prefix (required)
        "(\\d{4})" + // Year (required)
        "(\\d{2})?" + // Month (optional)
        "(\\d{2})?" + // Day (optional)
        "(\\d{2})?" + // Hour (optional)
        "(\\d{2})?" + // Minute (optional)
        "(\\d{2})?" + // Second (optional)
        "([Z|+\\-])?" + // Universal time relation (optional)
        "(\\d{2})?" + // Offset hour (optional)
        "'?" + // Splitting apostrophe (optional)
        "(\\d{2})?" + // Offset minute (optional)
        "'?" // Trailing apostrophe (optional)
    );

    // Optional fields that don't satisfy the requirements from the regular
    // expression (such as incorrect digit counts or numbers that are out of
    // range) will fall back the defaults from the specification.
    const matches = this.#regex.exec(input);
    if (!matches) {
      return null;
    }

    // JavaScript's `Date` object expects the month to be between 0 and 11
    // instead of 1 and 12, so we have to correct for that.
    const year = parseInt(matches[1], 10);
    let month = parseInt(matches[2], 10);
    month = month >= 1 && month <= 12 ? month - 1 : 0;
    let day = parseInt(matches[3], 10);
    day = day >= 1 && day <= 31 ? day : 1;
    let hour = parseInt(matches[4], 10);
    hour = hour >= 0 && hour <= 23 ? hour : 0;
    let minute = parseInt(matches[5], 10);
    minute = minute >= 0 && minute <= 59 ? minute : 0;
    let second = parseInt(matches[6], 10);
    second = second >= 0 && second <= 59 ? second : 0;
    const universalTimeRelation = matches[7] || "Z";
    let offsetHour = parseInt(matches[8], 10);
    offsetHour = offsetHour >= 0 && offsetHour <= 23 ? offsetHour : 0;
    let offsetMinute = parseInt(matches[9], 10) || 0;
    offsetMinute = offsetMinute >= 0 && offsetMinute <= 59 ? offsetMinute : 0;

    // Universal time relation 'Z' means that the local time is equal to the
    // universal time, whereas the relations '+'/'-' indicate that the local
    // time is later respectively earlier than the universal time. Every date
    // is normalized to universal time.
    if (universalTimeRelation === "-") {
      hour += offsetHour;
      minute += offsetMinute;
    } else if (universalTimeRelation === "+") {
      hour -= offsetHour;
      minute -= offsetMinute;
    }

    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }
}

function getColorValues(colors) {
  const span = document.createElement("span");
  span.style.visibility = "hidden";
  // NOTE: The following does *not* affect `forced-colors: active` mode.
  span.style.colorScheme = "only light";
  document.body.append(span);
  for (const name of colors.keys()) {
    span.style.color = name;
    const computedColor = window.getComputedStyle(span).color;
    colors.set(name, getRGB(computedColor));
  }
  span.remove();
}

/**
 * @param {HTMLDivElement} div
 * @param {PageViewport} viewport
 * @param {boolean} mustFlip
 * @param {boolean} mustRotate
 */
function setLayerDimensions(
  div,
  viewport,
  mustFlip = false,
  mustRotate = true
) {
  if (viewport instanceof PageViewport) {
    const { pageWidth, pageHeight } = viewport.rawDims;
    const { style } = div;

    const widthStr = `round(down, var(--total-scale-factor) * ${pageWidth}px, var(--scale-round-x))`,
      heightStr = `round(down, var(--total-scale-factor) * ${pageHeight}px, var(--scale-round-y))`;

    if (!mustFlip || viewport.rotation % 180 === 0) {
      style.width = widthStr;
      style.height = heightStr;
    } else {
      style.width = heightStr;
      style.height = widthStr;
    }
  }

  if (mustRotate) {
    div.setAttribute("data-main-rotation", viewport.rotation);
  }
}

class ColorScheme {
  static get isDarkMode() {
    return shadow(
      this,
      "isDarkMode",
      !!window?.matchMedia?.("(prefers-color-scheme: dark)").matches
    );
  }
}

class CSSConstants {
  static get commentForegroundColor() {
    const element = document.createElement("span");
    element.classList.add("comment", "sidebar");
    const { style } = element;
    style.width = style.height = "0";
    style.display = "none";
    style.color = "var(--comment-fg-color)";
    document.body.append(element);
    const { color } = window.getComputedStyle(element);
    element.remove();
    return shadow(this, "commentForegroundColor", getRGB(color));
  }
}

function renderRichText({ html, dir, className }, container) {
  const fragment = document.createDocumentFragment();
  if (typeof html === "string") {
    const p = document.createElement("p");
    p.dir = dir || "auto";
    const lines = html.split(/\r\n?|\n/);
    for (let i = 0, ii = lines.length; i < ii; ++i) {
      const line = lines[i];
      p.append(document.createTextNode(line));
      if (i < ii - 1) {
        p.append(document.createElement("br"));
      }
    }
    fragment.append(p);
  } else {
    XfaLayer.render({
      xfaHtml: html,
      div: fragment,
      intent: "richText",
    });
  }
  fragment.firstElementChild.classList.add("richText", className);
  container.append(fragment);
}

export {
  ColorScheme,
  CSSConstants,
  fetchData,
  getColorValues,
  getFilenameFromUrl,
  getPdfFilenameFromUrl,
  isDataScheme,
  isPdfFile,
  isValidFetchUrl,
  noContextMenu,
  PDFDateString,
  renderRichText,
  setLayerDimensions,
  stopEvent,
};
