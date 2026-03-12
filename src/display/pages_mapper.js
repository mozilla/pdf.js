/* Copyright 2026 Mozilla Foundation
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

import { makeArr, MathClamp } from "../shared/util.js";

/**
 * Maps between page IDs and page numbers, allowing bidirectional conversion
 * between the two representations. This is useful when the page numbering
 * in the PDF document doesn't match the default sequential ordering.
 */
class PagesMapper {
  /**
   * Maps page IDs to their corresponding page numbers.
   * @type {Map<number, Array<number>>|null}
   */
  #idToPageNumber = null;

  /**
   * Maps page numbers to their corresponding page IDs.
   * @type {Uint32Array|null}
   */
  #pageNumberToId = null;

  /**
   * Previous mapping of page IDs to page numbers.
   * @type {Int32Array|null}
   */
  #prevPageNumbers = null;

  /**
   * The total number of pages.
   * @type {number}
   */
  #pagesNumber = 0;

  /**
   * Listeners for page changes.
   * @type {Array<function>}
   */
  #listeners = [];

  /**
   * Maps page numbers to their corresponding page IDs (used in copy
   * operations).
   * @type {Uint32Array|null}
   */
  #copiedPageIds = null;

  /**
   * Maps page IDs to their corresponding page numbers, used in copy operations.
   * @type {Uint32Array|null}
   */
  #copiedPageNumbers = null;

  #savedData = null;

  /**
   * Gets the total number of pages.
   * @returns {number} The number of pages.
   */
  get pagesNumber() {
    return this.#pagesNumber;
  }

  /**
   * Sets the total number of pages and initializes default mappings
   * where page IDs equal page numbers (1-indexed).
   * @param {number} n - The total number of pages.
   */
  set pagesNumber(n) {
    if (this.#pagesNumber === n) {
      return;
    }
    this.#pagesNumber = n;
    this.#reset();
  }

  /**
   * Resets the page mappings to their default state, where page IDs equal page
   * numbers (1-indexed). This is called when the number of pages changes, or
   * when the current mapping matches the default mapping after a move
   * operation.
   */
  #reset() {
    this.#pageNumberToId = null;
    this.#idToPageNumber = null;
  }

  /**
   * Adds a listener function that will be called whenever the page mappings
   * are updated.
   * @param {function} listener
   */
  addListener(listener) {
    this.#listeners.push(listener);
  }

  /**
   * Removes a previously added listener function.
   * @param {function} listener
   */
  removeListener(listener) {
    const index = this.#listeners.indexOf(listener);
    if (index >= 0) {
      this.#listeners.splice(index, 1);
    }
  }

  /**
   * Calls all registered listener functions to notify them of changes to the
   * page mappings.
   * @param {Object} data - An object containing information about the update.
   */
  #updateListeners(data) {
    for (const listener of this.#listeners) {
      listener(data);
    }
  }

  /**
   * Initializes the page mappings if they haven't been initialized yet.
   * @param {boolean} mustInit
   */
  #init(mustInit) {
    if (this.#pageNumberToId) {
      return;
    }
    const n = this.#pagesNumber;

    const pageNumberToId = (this.#pageNumberToId = new Uint32Array(n));
    this.#prevPageNumbers = new Int32Array(pageNumberToId);
    const idToPageNumber = (this.#idToPageNumber = new Map());
    if (mustInit) {
      for (let i = 1; i <= n; i++) {
        pageNumberToId[i - 1] = i;
        idToPageNumber.set(i, [i]);
      }
    }
  }

  /**
   * Updates the mapping from page IDs to page numbers based on the current
   * mapping from page numbers to page IDs. This should be called after any
   * changes to the page-number-to-ID mapping to keep the two mappings in sync.
   */
  #updateIdToPageNumber() {
    const idToPageNumber = this.#idToPageNumber;
    const pageNumberToId = this.#pageNumberToId;
    idToPageNumber.clear();
    for (let i = 0, ii = this.#pagesNumber; i < ii; i++) {
      const id = pageNumberToId[i];
      const pageNumbers = idToPageNumber.get(id);
      if (pageNumbers) {
        pageNumbers.push(i + 1);
      } else {
        idToPageNumber.set(id, [i + 1]);
      }
    }
  }

  /**
   * Move a set of pages to a new position while keeping ID→number mappings in
   * sync.
   *
   * @param {Set<number>} selectedPages - Page numbers being moved (1-indexed).
   * @param {number[]} pagesToMove - Ordered list of page numbers to move.
   * @param {number} index - Zero-based insertion index in the page-number list.
   */
  movePages(selectedPages, pagesToMove, index) {
    this.#init(true);
    const pageNumberToId = this.#pageNumberToId;
    const idToPageNumber = this.#idToPageNumber;
    const movedCount = pagesToMove.length;
    const mappedPagesToMove = new Uint32Array(movedCount);
    let removedBeforeTarget = 0;

    for (let i = 0; i < movedCount; i++) {
      const pageIndex = pagesToMove[i] - 1;
      mappedPagesToMove[i] = pageNumberToId[pageIndex];
      if (pageIndex < index) {
        removedBeforeTarget += 1;
      }
    }

    const pagesNumber = this.#pagesNumber;
    // target index after removing elements that were before it
    let adjustedTarget = index - removedBeforeTarget;
    const remainingLen = pagesNumber - movedCount;
    adjustedTarget = MathClamp(adjustedTarget, 0, remainingLen);

    // Create the new mapping.
    // First copy over the pages that are not being moved.
    // Then insert the moved pages at the target position.
    for (let i = 0, r = 0; i < pagesNumber; i++) {
      if (!selectedPages.has(i + 1)) {
        pageNumberToId[r++] = pageNumberToId[i];
      }
    }

    // Shift the pages after the target position.
    pageNumberToId.copyWithin(
      adjustedTarget + movedCount,
      adjustedTarget,
      remainingLen
    );
    // Finally insert the moved pages.
    pageNumberToId.set(mappedPagesToMove, adjustedTarget);

    this.#setPrevPageNumbers(idToPageNumber, null);
    this.#updateIdToPageNumber();
    this.#updateListeners({ type: "move" });

    if (pageNumberToId.every((id, i) => id === i + 1)) {
      this.#reset();
    }
  }

  /**
   * Deletes a set of pages while keeping ID→number mappings in sync.
   * @param {Array<number>} pagesToDelete - Page numbers to delete (1-indexed).
   *  These must be unique and sorted in ascending order.
   */
  deletePages(pagesToDelete) {
    this.#init(true);
    const pageNumberToId = this.#pageNumberToId;
    const prevIdToPageNumber = this.#idToPageNumber;

    this.#savedData = {
      pageNumberToId: pageNumberToId.slice(),
      idToPageNumber: new Map(prevIdToPageNumber),
      pageNumber: this.#pagesNumber,
      prevPageNumbers: this.#prevPageNumbers.slice(),
    };

    this.pagesNumber -= pagesToDelete.length;
    this.#init(false);
    const newPageNumberToId = this.#pageNumberToId;

    let sourceIndex = 0;
    let destIndex = 0;
    for (const pageNumber of pagesToDelete) {
      const pageIndex = pageNumber - 1;
      if (pageIndex !== sourceIndex) {
        newPageNumberToId.set(
          pageNumberToId.subarray(sourceIndex, pageIndex),
          destIndex
        );
        destIndex += pageIndex - sourceIndex;
      }
      sourceIndex = pageIndex + 1;
    }
    if (sourceIndex < pageNumberToId.length) {
      newPageNumberToId.set(pageNumberToId.subarray(sourceIndex), destIndex);
    }

    this.#setPrevPageNumbers(prevIdToPageNumber, null);
    this.#updateIdToPageNumber();
    this.#updateListeners({ type: "delete", pageNumbers: pagesToDelete });
  }

  cancelDelete() {
    if (this.#savedData) {
      this.#pageNumberToId = this.#savedData.pageNumberToId;
      this.#idToPageNumber = this.#savedData.idToPageNumber;
      this.pagesNumber = this.#savedData.pageNumber;
      this.#prevPageNumbers = this.#savedData.prevPageNumbers;
      this.#savedData = null;
      this.#updateListeners({ type: "cancelDelete" });
    }
  }

  cleanSavedData() {
    this.#savedData = null;
    this.#updateListeners({ type: "cleanSavedData" });
  }

  /**
   * Copies a set of pages while keeping ID→number mappings in sync.
   * @param {Uint32Array} pagesToCopy - Page numbers to copy (1-indexed).
   */
  copyPages(pagesToCopy) {
    this.#init(true);
    this.#copiedPageNumbers = pagesToCopy;
    this.#copiedPageIds = pagesToCopy.map(
      pageNumber => this.#pageNumberToId[pageNumber - 1]
    );
    this.#updateListeners({ type: "copy", pageNumbers: pagesToCopy });
  }

  cancelCopy() {
    this.#copiedPageIds = null;
    this.#copiedPageNumbers = null;
    this.#updateListeners({ type: "cancelCopy" });
  }

  /**
   * Pastes a set of pages while keeping ID→number mappings in sync.
   * @param {number} index - Zero-based insertion index in the page-number list.
   */
  pastePages(index) {
    this.#init(true);
    const pageNumberToId = this.#pageNumberToId;
    const prevIdToPageNumber = this.#idToPageNumber;
    const copiedPageNumbers = this.#copiedPageNumbers;

    const copiedPageMapping = new Map();
    let base = index;
    for (const pageNumber of copiedPageNumbers) {
      copiedPageMapping.set(++base, pageNumber);
    }
    this.pagesNumber += copiedPageNumbers.length;
    this.#init(false);
    const newPageNumberToId = this.#pageNumberToId;

    newPageNumberToId.set(pageNumberToId.subarray(0, index), 0);
    newPageNumberToId.set(this.#copiedPageIds, index);
    newPageNumberToId.set(
      pageNumberToId.subarray(index),
      index + copiedPageNumbers.length
    );

    this.#setPrevPageNumbers(prevIdToPageNumber, copiedPageMapping);
    this.#updateIdToPageNumber();
    this.#updateListeners({ type: "paste" });

    this.#copiedPageIds = null;
    this.#copiedPageNumbers = null;
  }

  /**
   * Updates the previous page numbers based on the current page-number-to-ID
   * mapping and the provided previous ID-to-page-number mapping.
   * This is used to keep track of the original page numbers for each page ID.
   * @param {Map<number, Array<number>} prevIdToPageNumber
   * @param {Map<number, number>|null} copiedPageMapping
   */
  #setPrevPageNumbers(prevIdToPageNumber, copiedPageMapping) {
    const prevPageNumbers = this.#prevPageNumbers;
    const newPageNumberToId = this.#pageNumberToId;
    const idsIndices = new Map();
    for (let i = 0, ii = this.#pagesNumber; i < ii; i++) {
      const oldPageNumber = copiedPageMapping?.get(i + 1);
      if (oldPageNumber) {
        prevPageNumbers[i] = -oldPageNumber;
        continue;
      }
      const id = newPageNumberToId[i];
      const j = idsIndices.get(id) || 0;
      prevPageNumbers[i] = prevIdToPageNumber.get(id)?.[j];
      idsIndices.set(id, j + 1);
    }
  }

  /**
   * Checks if the page mappings have been altered from their initial state.
   * @returns {boolean} True if the mappings have been altered, false otherwise.
   */
  hasBeenAltered() {
    return this.#pageNumberToId !== null;
  }

  /**
   * Gets the current page mapping suitable for saving.
   * @returns {Object} An object containing the page indices.
   */
  getPageMappingForSaving(idToPageNumber = this.#idToPageNumber) {
    // idToPageNumber maps used 1-based IDs to 1-based page numbers.
    // For example if the final pdf contains page 3 twice and they are moved at
    // page 1 and 4, then it contains:
    //   pageNumberToId = [3, ., ., 3, ...,]
    //   idToPageNumber = {3: [1, 4], ...}
    // In such a case we need to take a page 3 from the original pdf and take
    // page 3 from a "copy".
    // So we need to pass to the api something like:
    // [ {
    //   document: null // this pdf
    //   includePages: [ 2, ... ], // page 3 is at index 2
    //   pageIndices: [0, ...], // page 3 will be at index 0 in the new pdf
    // }, {
    //   document: null // this pdf
    //   includePages: [ 2, ... ], // page 3 is at index 2
    //   pageIndices: [3, ...], // page 3 will be at index 3 in the new pdf
    // }
    // ]

    let nCopy = 0;
    for (const pageNumbers of idToPageNumber.values()) {
      nCopy = Math.max(nCopy, pageNumbers.length);
    }

    const extractParams = new Array(nCopy);
    for (let i = 0; i < nCopy; i++) {
      extractParams[i] = {
        document: null,
        pageIndices: [],
        includePages: [],
      };
    }

    for (const [id, pageNumbers] of idToPageNumber) {
      for (let i = 0, ii = pageNumbers.length; i < ii; i++) {
        extractParams[i].includePages.push([id - 1, pageNumbers[i] - 1]);
      }
    }

    for (const { includePages, pageIndices } of extractParams) {
      includePages.sort((a, b) => a[0] - b[0]);
      for (let i = 0, ii = includePages.length; i < ii; i++) {
        pageIndices.push(includePages[i][1]);
        includePages[i] = includePages[i][0];
      }
    }

    return extractParams;
  }

  extractPages(extractedPageNumbers) {
    extractedPageNumbers = Array.from(extractedPageNumbers).sort(
      (a, b) => a - b
    );
    const usedIds = new Map();
    for (let i = 0, ii = extractedPageNumbers.length; i < ii; i++) {
      const id = this.getPageId(extractedPageNumbers[i]);
      const usedPageNumbers = usedIds.getOrInsertComputed(id, makeArr);
      usedPageNumbers.push(i + 1);
    }
    return this.getPageMappingForSaving(usedIds);
  }

  /**
   * Gets the previous page number for a given page number.
   * @param {number} pageNumber
   * @returns {number} The previous page number for the given page number, or 0
   *   if no mapping exists.
   */
  getPrevPageNumber(pageNumber) {
    return this.#prevPageNumbers[pageNumber - 1] ?? 0;
  }

  /**
   * Gets the page number for a given page ID.
   * @param {number} id - The page ID (1-indexed).
   * @returns {number} The page number, or 0 if no mapping exists.
   */
  getPageNumber(id) {
    return this.#idToPageNumber ? (this.#idToPageNumber.get(id)?.[0] ?? 0) : id;
  }

  /**
   * Gets the page ID for a given page number.
   * @param {number} pageNumber - The page number (1-indexed).
   * @returns {number} The page ID, or the page number itself if no mapping
   * exists.
   */
  getPageId(pageNumber) {
    return this.#pageNumberToId?.[pageNumber - 1] ?? pageNumber;
  }

  getMapping() {
    return this.#pageNumberToId?.subarray(0, this.pagesNumber);
  }
}

export { PagesMapper };
