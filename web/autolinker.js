/* Copyright 2025 Mozilla Foundation
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

import { AnnotationType, createValidAbsoluteUrl, Util } from "pdfjs-lib";
import { getOriginalIndex, normalize } from "./pdf_find_controller.js";

function DOMRectToPDF({ width, height, left, top }, pdfPageView) {
  if (width === 0 || height === 0) {
    return null;
  }

  const pageBox = pdfPageView.textLayer.div.getBoundingClientRect();
  const bottomLeft = pdfPageView.getPagePoint(
    left - pageBox.left,
    top - pageBox.top
  );
  const topRight = pdfPageView.getPagePoint(
    left - pageBox.left + width,
    top - pageBox.top + height
  );

  return Util.normalizeRect([
    bottomLeft[0],
    bottomLeft[1],
    topRight[0],
    topRight[1],
  ]);
}

function calculateLinkPosition(range, pdfPageView) {
  const rangeRects = range.getClientRects();
  if (rangeRects.length === 1) {
    return { rect: DOMRectToPDF(rangeRects[0], pdfPageView) };
  }

  const rect = [Infinity, Infinity, -Infinity, -Infinity];
  const quadPoints = [];
  let i = 0;
  for (const domRect of rangeRects) {
    const normalized = DOMRectToPDF(domRect, pdfPageView);
    if (normalized === null) {
      continue;
    }

    quadPoints[i] = quadPoints[i + 4] = normalized[0];
    quadPoints[i + 1] = quadPoints[i + 3] = normalized[3];
    quadPoints[i + 2] = quadPoints[i + 6] = normalized[2];
    quadPoints[i + 5] = quadPoints[i + 7] = normalized[1];

    rect[0] = Math.min(rect[0], normalized[0]);
    rect[1] = Math.min(rect[1], normalized[1]);
    rect[2] = Math.max(rect[2], normalized[2]);
    rect[3] = Math.max(rect[3], normalized[3]);

    i += 8;
  }
  return { quadPoints, rect };
}

function createLinkAnnotation({ url, index, length }, pdfPageView, id) {
  const highlighter = pdfPageView._textHighlighter;
  const [{ begin, end }] = highlighter._convertMatches([index], [length]);

  const range = new Range();
  range.setStart(highlighter.textDivs[begin.divIdx].firstChild, begin.offset);
  range.setEnd(highlighter.textDivs[end.divIdx].firstChild, end.offset);

  return {
    id: `inferred_link_${id}`,
    unsafeUrl: url,
    url,
    annotationType: AnnotationType.LINK,
    rotation: 0,
    ...calculateLinkPosition(range, pdfPageView),
    // Populated in the annotationLayer to avoid unnecessary object creation,
    // since most inferred links overlap existing LinkAnnotations:
    borderStyle: null,
  };
}

class Autolinker {
  static #index = 0;

  static #regex;

  static findLinks(text) {
    // Regex can be tested and verified at https://regex101.com/r/rXoLiT/2.
    this.#regex ??=
      /\b(?:https?:\/\/|mailto:|www\.)(?:[\S--[\p{P}<>]]|\/|[\S--[\[\]]]+[\S--[\p{P}<>]])+|\b[\S--[@\p{Ps}\p{Pe}<>]]+@([\S--[\p{P}<>]]+(?:\.[\S--[\p{P}<>]]+)+)/gmv;

    const [normalizedText, diffs] = normalize(text);
    const matches = normalizedText.matchAll(this.#regex);
    const links = [];
    for (const match of matches) {
      const [url, emailDomain] = match;
      let raw;
      if (
        url.startsWith("www.") ||
        url.startsWith("http://") ||
        url.startsWith("https://")
      ) {
        raw = url;
      } else if (URL.canParse(`http://${emailDomain}`)) {
        raw = url.startsWith("mailto:") ? url : `mailto:${url}`;
      } else {
        continue;
      }
      const absoluteURL = createValidAbsoluteUrl(raw, null, {
        addDefaultProtocol: true,
      });
      if (absoluteURL) {
        const [index, length] = getOriginalIndex(
          diffs,
          match.index,
          url.length
        );
        links.push({ url: absoluteURL.href, index, length });
      }
    }
    return links;
  }

  static processLinks(pdfPageView) {
    return this.findLinks(
      pdfPageView._textHighlighter.textContentItemsStr.join("\n")
    ).map(link => createLinkAnnotation(link, pdfPageView, this.#index++));
  }
}

export { Autolinker };
