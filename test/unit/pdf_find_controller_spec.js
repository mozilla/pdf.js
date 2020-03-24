/* Copyright 2018 Mozilla Foundation
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

import { buildGetDocumentParams } from "./test_utils.js";
import { EventBus } from "../../web/ui_utils.js";
import { getDocument } from "../../src/display/api.js";
import { PDFFindController } from "../../web/pdf_find_controller.js";
import { SimpleLinkService } from "../../web/pdf_link_service.js";

class MockLinkService extends SimpleLinkService {
  constructor() {
    super();

    this._page = 1;
    this._pdfDocument = null;
  }

  setDocument(pdfDocument) {
    this._pdfDocument = pdfDocument;
  }

  get pagesCount() {
    return this._pdfDocument.numPages;
  }

  get page() {
    return this._page;
  }

  set page(value) {
    this._page = value;
  }
}

describe("pdf_find_controller", function() {
  let eventBus;
  let pdfFindController;

  beforeEach(function(done) {
    const loadingTask = getDocument(buildGetDocumentParams("tracemonkey.pdf"));
    loadingTask.promise.then(function(pdfDocument) {
      eventBus = new EventBus();

      const linkService = new MockLinkService();
      linkService.setDocument(pdfDocument);

      pdfFindController = new PDFFindController({
        linkService,
        eventBus,
      });
      pdfFindController.setDocument(pdfDocument); // Enable searching.

      done();
    });
  });

  afterEach(function() {
    eventBus = null;
    pdfFindController = null;
  });

  function testSearch({ parameters, matchesPerPage, selectedMatch }) {
    return new Promise(function(resolve) {
      pdfFindController.executeCommand("find", parameters);

      // The `updatefindmatchescount` event is only emitted if the page contains
      // at least one match for the query, so the last non-zero item in the
      // matches per page array corresponds to the page for which the final
      // `updatefindmatchescount` event is emitted. If this happens, we know
      // that any subsequent pages won't trigger the event anymore and we
      // can start comparing the matches per page. This logic is necessary
      // because we call the `pdfFindController.pageMatches` getter directly
      // after receiving the event and the underlying `_pageMatches` array
      // is only extended when a page is processed, so it will only contain
      // entries for the pages processed until the time when the final event
      // was emitted.
      let totalPages = matchesPerPage.length;
      for (let i = totalPages - 1; i >= 0; i--) {
        if (matchesPerPage[i] > 0) {
          totalPages = i + 1;
          break;
        }
      }

      const totalMatches = matchesPerPage.reduce((a, b) => {
        return a + b;
      });

      eventBus.on("updatefindmatchescount", function onUpdateFindMatchesCount(
        evt
      ) {
        if (pdfFindController.pageMatches.length !== totalPages) {
          return;
        }
        eventBus.off("updatefindmatchescount", onUpdateFindMatchesCount);

        expect(evt.matchesCount.total).toBe(totalMatches);
        for (let i = 0; i < totalPages; i++) {
          expect(pdfFindController.pageMatches[i].length).toEqual(
            matchesPerPage[i]
          );
        }
        expect(pdfFindController.selected.pageIdx).toEqual(
          selectedMatch.pageIndex
        );
        expect(pdfFindController.selected.matchIdx).toEqual(
          selectedMatch.matchIndex
        );

        resolve();
      });
    });
  }

  it("performs a normal search", function(done) {
    testSearch({
      parameters: {
        query: "Dynamic",
        caseSensitive: false,
        entireWord: false,
        phraseSearch: true,
        findPrevious: false,
      },
      matchesPerPage: [11, 5, 0, 3, 0, 0, 0, 1, 1, 1, 0, 3, 4, 4],
      selectedMatch: {
        pageIndex: 0,
        matchIndex: 0,
      },
    }).then(done);
  });

  it("performs a normal search and finds the previous result", function(done) {
    // Page 14 (with page index 13) contains five results. By default, the
    // first result (match index 0) is selected, so the previous result
    // should be the fifth result (match index 4).
    testSearch({
      parameters: {
        query: "conference",
        caseSensitive: false,
        entireWord: false,
        phraseSearch: true,
        findPrevious: true,
      },
      matchesPerPage: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5],
      selectedMatch: {
        pageIndex: 13,
        matchIndex: 4,
      },
    }).then(done);
  });

  it("performs a case sensitive search", function(done) {
    testSearch({
      parameters: {
        query: "Dynamic",
        caseSensitive: true,
        entireWord: false,
        phraseSearch: true,
        findPrevious: false,
      },
      matchesPerPage: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3],
      selectedMatch: {
        pageIndex: 0,
        matchIndex: 0,
      },
    }).then(done);
  });

  it("performs an entire word search", function(done) {
    // Page 13 contains both 'Government' and 'Governmental', so the latter
    // should not be found with entire word search.
    testSearch({
      parameters: {
        query: "Government",
        caseSensitive: false,
        entireWord: true,
        phraseSearch: true,
        findPrevious: false,
      },
      matchesPerPage: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
      selectedMatch: {
        pageIndex: 12,
        matchIndex: 0,
      },
    }).then(done);
  });

  it("performs a multiple term (no phrase) search", function(done) {
    // Page 9 contains 'alternate' and pages 6 and 9 contain 'solution'.
    // Both should be found for multiple term (no phrase) search.
    testSearch({
      parameters: {
        query: "alternate solution",
        caseSensitive: false,
        entireWord: false,
        phraseSearch: false,
        findPrevious: false,
      },
      matchesPerPage: [0, 0, 0, 0, 0, 1, 0, 0, 4, 0, 0, 0, 0, 0],
      selectedMatch: {
        pageIndex: 5,
        matchIndex: 0,
      },
    }).then(done);
  });
});
