import { normalize } from "./pdf_find_controller.js";
import { binarySearchFirstItem } from "./ui_utils.js";

// `findController.pageMatches`/`pageMatchesLength` store positions in the
// original (non-normalized) page text, while `pageContents` here is the
// normalized text used to build snippets. This converts a match position
// back into normalized-text coordinates; it's the inverse of the
// `getOriginalIndex` helper in pdf_find_controller.js.
function getNormalizedIndex(diffs, pos, len) {
  if (!diffs) {
    return [pos, len];
  }
  const [starts, shifts] = diffs;
  const oldStarts = starts.map((s, k) => s + shifts[k]);

  const start = pos;
  const end = pos + len - 1;

  let i = binarySearchFirstItem(oldStarts, x => x >= start);
  if (oldStarts[i] > start) {
    i--;
  }

  let j = binarySearchFirstItem(oldStarts, x => x >= end, i);
  if (oldStarts[j] > end) {
    j--;
  }

  const newStart = start - shifts[i];
  const newEnd = end - shifts[j];

  return [newStart, newEnd + 1 - newStart];
}

/**
 * Viewer control to display search results.
 *
 * @implements {IRenderableView}
 */
class PDFSearchViewer {
  /**
   * @param {PDFThumbnailViewerOptions} options
   */
  constructor({
    container,
    eventBus,
    linkService,
    renderingQueue,
    l10n,
    searchButton,
  }) {
    this.searchButton = searchButton || null;
    this.opened = false;

    this.searchButton.addEventListener("click", () => {
      this.toggle();
    });

    this.container = container;
    this.linkService = linkService;
    this.l10n = l10n;

    eventBus.on("updatefindmatchescount", event => {
      this.handlerSearchEvent(event, event.source, event.pageContents);
    });

    eventBus.on("updatefindcontrolstate", event => {
      this.updateSelected(event.source);
    });

    eventBus.on("find", () => {
      this.open();
    });

    while (this.container.firstChild) {
      // eslint-disable-next-line mozilla/avoid-removeChild
      this.container.removeChild(this.container.firstChild);
    }

    this.container.innerHTML =
      // eslint-disable-next-line no-useless-concat
      '<div class="searchMsg"></div>' + '<div class="searchResults"></div>';

    this.searchMsg = container.querySelector(".searchMsg");
    this.searchResults = container.querySelector(".searchResults");
    this.resetResults();

    this.renderedPages = {};
  }

  handlerSearchEvent(e, findController, pageContents) {
    this.resetResults();
    this.updateResults(findController, pageContents);
    console.log(findController);
  }

  updateSelected(findController) {
    findController.changeHighlight(true);
  }

  updateResults(findController, pageContents) {
    const MAX_RESULTS = 100;
    const pageMatches = findController.pageMatches;
    const pageMatchesLength = findController.pageMatchesLength;
    const numPages = pageMatches.length;
    for (
      let page = 0;
      page < numPages && this.numRenderedResults < MAX_RESULTS;
      page++
    ) {
      if (this.renderedPages[page] || !pageMatches[page]) {
        continue;
      }
      this.renderSearchResult(
        findController,
        page + 1,
        pageMatches[page],
        pageMatchesLength ? pageMatchesLength[page] : null,
        pageContents[page],
        findController._pageDiffs[page]
      );
      this.renderedPages[page] = true;
    }

    if (this.numRenderedResults >= MAX_RESULTS) {
      // Truncate if we have too many results.
      // eslint-disable-next-line no-unsanitized/property
      this.searchMsg.innerHTML =
        'Primeiros <span class="numResults">' +
        this.numRenderedResults +
        "</span> resultados";
    } else {
      // eslint-disable-next-line no-unsanitized/property
      this.searchMsg.innerHTML =
        'Exibindo <span class="numResults">' +
        this.numRenderedResults +
        "</span> resultado" +
        (this.numRenderedResults !== 1 ? "s" : "");
    }
  }

  renderSearchResult(
    findController,
    page,
    matches,
    matchesLength,
    content,
    diffs
  ) {
    // The default number of characters that we look around each snippet.
    const CHARS_NEXT = 50,
      CHARS_PREV = 30,
      CHARS_MAX = 200;

    const numMatches = matches.length;
    if (!numMatches) {
      return;
    }
    let snippets = [];
    let numSnippets;

    // `query` can be a string or, for multi-word/OR searches, an array of
    // words; only used as a fallback when `matchesLength` (which is always
    // correctly populated for both cases) isn't available.
    function matchLen(i) {
      if (matchesLength) {
        return matchesLength[i];
      }
      const query = findController.state.query;
      return normalize(Array.isArray(query) ? query[0] : query)[0].length;
    }

    // Broaden each snippet
    snippets = matches.map(function (m, i) {
      // `m`/`matchLen(i)` are positions in the original (non-normalized)
      // page text; `content` is the normalized text, so convert first.
      const [normM, normLen] = getNormalizedIndex(diffs, m, matchLen(i));

      // Find the previous space
      let start = Math.max(0, content.lastIndexOf(" ", normM - CHARS_PREV));
      if (start <= normM - CHARS_MAX) {
        start = Math.max(0, normM - CHARS_PREV);
      }

      let end = content.indexOf(
        " ",
        Math.min(content.length, normM + CHARS_NEXT)
      );
      if (end === -1 || end >= normM + CHARS_MAX) {
        end = Math.min(content.length, normM + CHARS_NEXT);
      }
      const highlights = [[normM, normM + normLen]];
      // Snippet are defined by a start, an end, and a list of highlights.
      return [start, end, highlights];
    });

    // Merge the various snippets.
    let mergedSnippets = snippets;
    do {
      snippets = mergedSnippets;
      mergedSnippets = [];
      numSnippets = snippets.length;
      let mergedLast = false;
      for (let match = 0; match < numSnippets - 1; match++) {
        if (mergedLast) {
          // We overlapped with the last one, ignore this one
          mergedLast = false;
        } else if (snippets[match][1] >= snippets[match + 1][0]) {
          // There is overlap
          const newStart = Math.min(snippets[match][0], snippets[match + 1][0]);
          const newEnd = Math.max(snippets[match][1], snippets[match + 1][1]);
          const newHighlights = snippets[match][2].concat(
            snippets[match + 1][2]
          );
          mergedSnippets.push([newStart, newEnd, newHighlights]);
          mergedLast = true;
        } else {
          mergedSnippets.push(snippets[match]);
        }
      }
      // Add the last snippet if we didn't already
      if (!mergedLast && snippets.length) {
        mergedSnippets.push(snippets[snippets.length - 1]);
      }
    } while (mergedSnippets.length < snippets.length);
    snippets = mergedSnippets;

    const pageMsg = document.createElement("div");
    pageMsg.className = "pageMsg";
    pageMsg.textContent = "Página " + page;
    this.searchResults.appendChild(pageMsg);

    // We now have merged snippets for this page.
    numSnippets = snippets.length;
    const sorter = function (a, b) {
      // eslint-disable-next-line no-nested-ternary
      return a[0] < b[0] ? -1 : a[0] === b[0] ? 0 : 1;
    };
    let matchIdx = 0;
    for (let match = 0; match < numSnippets; match++) {
      // Build the html snippet
      const snip = snippets[match];
      snip[2].sort(sorter);
      // Start with everything before the first highlight.
      let snipHtml =
        (snip[0] !== 0 ? "..." : "") +
        content.substring(snip[0], snip[2][0][0]);
      // Add highlight spans
      for (let h = 0; h < snip[2].length; h++) {
        const highlight = snip[2][h];
        // Add the higlight
        snipHtml +=
          '<span class="highlighted"> ' +
          content.substring(highlight[0], highlight[1]) +
          " </span>";
        // Add what comes after the highlight
        snipHtml += content.substring(
          highlight[1],
          h < snip[2].length - 1 ? snip[2][h + 1][0] : snip[1]
        );
      }
      if (snip[1] !== content.length) {
        snipHtml += " ...";
      }

      // Add the new result DOM element.
      const searchResult = document.createElement("div");
      searchResult.className = "searchResult";
      // eslint-disable-next-line no-unsanitized/property
      searchResult.innerHTML = snipHtml;
      // Store the page number and the matchIdx for clicking.
      searchResult.dataset.page = page;
      searchResult.dataset.match = matchIdx;
      searchResult.addEventListener("click", function (evt) {
        const resultPage = parseInt(this.dataset.page);
        const resultMatchIdx = parseInt(this.dataset.match);
        findController.goToMatch(resultPage - 1, resultMatchIdx);
      });
      this.searchResults.appendChild(searchResult);

      this.numRenderedResults += 1;
      // Increment by the number of highlights within snippets.
      matchIdx += snip[2].length;
    }
  }

  resetResults() {
    this.renderedPages = {};
    this.numRenderedResults = 0;
    this.searchMsg.innerHTML = "";
    while (this.searchResults.firstChild) {
      // eslint-disable-next-line mozilla/avoid-removeChild
      this.searchResults.removeChild(this.searchResults.firstChild);
    }
  }

  open() {
    if (!this.opened) {
      this.opened = true;
      this.searchButton.click();
    }
  }

  close() {
    if (!this.opened) {
      return;
    }
    this.opened = false;
    this.searchButton.click();
  }

  toggle() {
    if (this.opened) {
      this.close();
    } else {
      this.open();
    }
  }
}

export { PDFSearchViewer };
