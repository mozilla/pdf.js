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

import { createValidAbsoluteUrl, Util } from "../src/shared/util.js";
import { getOriginalIndex, normalize } from "./pdf_find_controller.js";

class Autolinker {
  static #urlRegex =
    /\b(?:https?:\/\/|mailto:|www\.)(?:[[\S--\[]--\p{P}]|\/|[\p{P}--\[]+[[\S--\[]--\p{P}])+|\b[\S--@]+@[\S--.]+.[[\S--\[]--\p{P}]{2,}/gmv; // Regex can be tested and verified at https://regex101.com/r/zuMeQX/3.

  static #addLinkAnnotations(url, index, length, pdfPageView) {
    const convertedMatch = pdfPageView._textHighlighter._convertMatches(
      [index],
      [length]
    )[0];

    const range = new Range();
    range.setStart(
      pdfPageView._textHighlighter.textDivs[convertedMatch.begin.divIdx]
        .firstChild,
      convertedMatch.begin.offset
    );
    range.setEnd(
      pdfPageView._textHighlighter.textDivs[convertedMatch.end.divIdx]
        .firstChild,
      convertedMatch.end.offset
    );

    const pageBox = pdfPageView.textLayer.div.getBoundingClientRect();
    const linkAnnotations = [];
    for (const linkBox of range.getClientRects()) {
      if (linkBox.width === 0 || linkBox.height === 0) {
        continue;
      }

      const bottomLeft = pdfPageView.getPagePoint(
        linkBox.left - pageBox.left,
        linkBox.top - pageBox.top
      );
      const topRight = pdfPageView.getPagePoint(
        linkBox.left - pageBox.left + linkBox.width,
        linkBox.top - pageBox.top + linkBox.height
      );

      const rect = Util.normalizeRect([
        bottomLeft[0],
        bottomLeft[1],
        topRight[0],
        topRight[1],
      ]);

      linkAnnotations.push({
        unsafeUrl: url,
        url,
        rect,
        annotationType: 2,
        rotation: 0,
        // This is just the default for AnnotationBorderStyle. At some point we
        // should switch to something better like `new LinkAnnotation` here.
        borderStyle: {
          width: 1,
          rawWidth: 1,
          style: 1, // SOLID
          dashArray: [3],
          horizontalCornerRadius: 0,
          verticalCornerRadius: 0,
        },
      });
    }
    return linkAnnotations;
  }

  static findLinks(text) {
    const [normalizedText, diffs] = normalize(text);
    const matches = normalizedText.matchAll(Autolinker.#urlRegex);
    const links = [];
    for (const match of matches) {
      const raw =
        match[0].startsWith("www.") ||
        match[0].startsWith("mailto:") ||
        match[0].startsWith("http")
          ? match[0]
          : `mailto:${match[0]}`;
      const url = createValidAbsoluteUrl(raw, null, {
        addDefaultProtocol: true,
      });
      if (url) {
        const [index, length] = getOriginalIndex(
          diffs,
          match.index,
          match[0].length
        );
        links.push({ url: url.href, index, length });
      }
    }
    return links;
  }

  static processLinks(pdfPageView) {
    const linkAnnotations = [];
    const links = this.findLinks(
      pdfPageView._textHighlighter.textContentItemsStr.join("\n")
    );
    for (const { url, index, length } of links) {
      linkAnnotations.push(
        ...this.#addLinkAnnotations(url, index, length, pdfPageView)
      );
    }
    return linkAnnotations;
  }
}

export { Autolinker };
