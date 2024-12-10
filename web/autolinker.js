import { createValidAbsoluteUrl, Util } from "../src/shared/util.js";
import { getOriginalIndex, normalize } from "./pdf_find_controller.js";

class Autolinker {
  static #urlRegex =
    /\b(?:https?:\/\/|mailto:|www.)(?:[[\S--\[]--\p{P}]|\/|[\p{P}--\[]+[[\S--\[]--\p{P}])+/gmv;

  static #addLinkAnnotations(url, index, length, pdfPageView) {
    // TODO refactor out the logic for a single match from this function
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

  static processLinks(pdfPageView, textContent) {
    const [text, diffs] = normalize(textContent.join(""));
    const matches = text.matchAll(Autolinker.#urlRegex);
    return Array.from(matches, match => {
      const url = createValidAbsoluteUrl(match[0]);
      if (url) {
        const [index, length] = getOriginalIndex(
          diffs,
          match.index,
          match[0].length
        );
        return this.#addLinkAnnotations(url.href, index, length, pdfPageView);
      }
      return url;
    })
      .filter(annotation => annotation !== null)
      .flat();
  }
}

export { Autolinker };
