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

import { buildGetDocumentParams } from './test_utils';
import { EventBus } from '../../web/ui_utils';
import { getDocument } from '../../src/display/api';
import { PDFFindController } from '../../web/pdf_find_controller';
import { SimpleLinkService } from '../../web/pdf_link_service';

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

describe('pdf_find_controller', function() {
  let eventBus;
  let pdfFindController;

  beforeEach(function(done) {
    const loadingTask = getDocument(buildGetDocumentParams('tracemonkey.pdf'));
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

  it('performs a basic search', function(done) {
    pdfFindController.executeCommand('find', { query: 'Dynamic', });

    const matchesPerPage = [11, 5, 0, 3, 0, 0, 0, 1, 1, 1, 0, 3, 4, 4];
    const totalPages = matchesPerPage.length;
    const totalMatches = matchesPerPage.reduce((a, b) => {
      return a + b;
    });

    eventBus.on('updatefindmatchescount',
        function onUpdateFindMatchesCount(evt) {
      if (pdfFindController.pageMatches.length !== totalPages) {
        return;
      }
      eventBus.off('updatefindmatchescount', onUpdateFindMatchesCount);

      expect(evt.matchesCount.total).toBe(totalMatches);
      for (let i = 0; i < totalPages; i++) {
        expect(pdfFindController.pageMatches[i].length)
          .toEqual(matchesPerPage[i]);
      }
      done();
    });
  });
});
