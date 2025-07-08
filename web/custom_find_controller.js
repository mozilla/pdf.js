/* Copyright 2024 Custom PDF Find Wrapper
 *
 * A programmatic wrapper around PDF.js find functionality
 * that allows custom highlighting without modifying original scripts.
 */

/**
 * @typedef {Object} MatchInfo
 * @property {number} pageIndex - Page index (0-based)
 * @property {number} matchIndex - Match index on that page (0-based)
 * @property {number} globalIndex - Global match index across all pages
 * @property {number} startPos - Start position in page text
 * @property {number} length - Length of the match
 * @property {string} text - Matched text
 * @property {Object} bounds - Bounding box information
 */

/**
 * Collection of search matches with highlighting capabilities
 */
class MatchCollection {
  constructor(finder, query, matches) {
    this.finder = finder;
    this.query = query;
    this.matches = matches;
    this.currentHighlight = null;
    this.allHighlighted = false;
  }

  /**
   * Get total number of matches
   */
  get length() {
    return this.matches.length;
  }

  /**
   * Get match by global index
   */
  get(index) {
    return this.matches[index] || null;
  }

  /**
   * Iterate through all matches
   */
  *[Symbol.iterator]() {
    for (const match of this.matches) {
      yield match;
    }
  }

  /**
   * Highlight all matches using PDF.js official API
   */
  highlightAll(className = 'highlight-red') {
    console.log(`🔍 Highlighting ${this.matches.length} matches for "${this.query}" in red`);
    return this.finder._highlightMatches(this.query, { highlightAll: true });
  }

  /**
   * Highlight specific match by global index
   */
  highlightByIndex(globalIndex, className = 'highlight-red selected') {
    const match = this.matches[globalIndex];
    if (!match) {
      console.warn(`No match found at index ${globalIndex}`);
      return this;
    }

    // For single match highlighting, we need to navigate to it
    return this.finder._highlightMatches(this.query, {
      highlightAll: false,
      targetPageIndex: match.pageIndex,
      targetMatchIndex: match.matchIndex
    });
  }

  /**
   * Highlight matches by page
   */
  highlightByPage(pageIndex, className = 'highlight-red') {
    const pageMatches = this.matches.filter(m => m.pageIndex === pageIndex);
    if (pageMatches.length === 0) {
      console.warn(`No matches found on page ${pageIndex + 1}`);
      return this;
    }

    return this.finder._highlightMatches(this.query, {
      highlightAll: true,
      pageNumber: pageIndex + 1
    });
  }

  /**
   * Clear all highlights
   */
  clearHighlights() {
    this.finder._clearHighlights();
    this.currentHighlight = null;
    this.allHighlighted = false;
    return this;
  }

  /**
   * Get matches for specific page
   */
  getByPage(pageIndex) {
    return this.matches.filter(m => m.pageIndex === pageIndex);
  }

  /**
   * Scroll to specific match
   */
  scrollToMatch(globalIndex) {
    const match = this.matches[globalIndex];
    if (!match) return this;

    this.finder._highlightMatches(this.query, {
      highlightAll: false,
      targetPageIndex: match.pageIndex,
      targetMatchIndex: match.matchIndex,
      scroll: true
    });
    return this;
  }

  /**
   * Convert to array for easier manipulation
   */
  toArray() {
    return [...this.matches];
  }

  /**
   * Filter matches by custom criteria
   */
  filter(predicate) {
    const filteredMatches = this.matches.filter(predicate);
    return new MatchCollection(this.finder, this.query, filteredMatches);
  }

  /**
   * Map matches to custom format
   */
  map(mapper) {
    return this.matches.map(mapper);
  }
}

/**
 * Custom Find Controller - programmatic wrapper around PDF.js find using official APIs
 */
class Finder {
  constructor(pdfViewer = null) {
    this.pdfViewer = pdfViewer || window.PDFViewerApplication?.pdfViewer;
    this.eventBus = window.PDFViewerApplication?.eventBus;
    this.findController = window.PDFViewerApplication?.findController;

    if (!this.pdfViewer || !this.eventBus || !this.findController) {
      throw new Error('PDF.js components not available. Ensure PDF.js is loaded.');
    }

    this._isReady = true;
  }

  /**
   * Wait for finder to be ready
   */
  async ready() {
    // Wait a bit for text layers to be ready
    await new Promise(resolve => setTimeout(resolve, 100));
    return this;
  }

  /**
   * Find text and return MatchCollection using PDF.js official API
   */
  async find(query, options = {}) {
    await this.ready();

    const {
      caseSensitive = false,
      entireWord = true,
      matchDiacritics = false,
      pageNumber = null  // 1-based page number, null = search all pages
    } = options;

    return new Promise((resolve) => {
      // Store search results
      let searchComplete = false;
      let matches = [];

      // Clear any existing search first
      this._clearHighlights();

      // Listen for search completion
      const cleanup = () => {
        if (this._searchListener) {
          this.eventBus._off('updatetextlayermatches', this._searchListener);
          this._searchListener = null;
        }
      };

      // Set up listener for when search completes
      this._searchListener = () => {
        if (searchComplete) return;

        // Extract matches from findController after search completes
        const extractedMatches = this._extractMatches();

        if (pageNumber !== null) {
          // Filter to specific page if requested
          const pageIndex = pageNumber - 1;
          matches = extractedMatches.filter(m => m.pageIndex === pageIndex);
        } else {
          matches = extractedMatches;
        }

        const searchScope = pageNumber ? `page ${pageNumber}` : 'all pages';
        console.log(`🔍 Found ${matches.length} matches for "${query}" in ${searchScope}`);

        searchComplete = true;
        cleanup();
        resolve(new MatchCollection(this, query, matches));
      };

      this.eventBus._on('updatetextlayermatches', this._searchListener);

      // Dispatch the find event to trigger search
      this.eventBus.dispatch('find', {
        source: null,
        type: 'highlightallchange',
        query: query,
        caseSensitive,
        entireWord,
        highlightAll: true,
        findPrevious: false,
        matchDiacritics,
      });

      // Disable automatic scrolling to prevent jumping
      this.findController._scrollMatches = false;

      // Timeout fallback
      setTimeout(() => {
        if (!searchComplete) {
          console.warn('Search timeout - returning partial results');
          cleanup();
          resolve(new MatchCollection(this, query, matches));
        }
      }, 2000);
    });
  }

  /**
   * Debug: Get page text from findController
   */
  getPageText(pageNumber) {
    const pageIndex = pageNumber - 1;
    if (pageIndex < 0 || pageIndex >= this.pdfViewer.pagesCount) {
      console.warn(`Invalid page number: ${pageNumber}. Pages are numbered 1-${this.pdfViewer.pagesCount}`);
      return '';
    }

    const text = this.findController._pageContents[pageIndex] || '';
    console.log(`📄 Page ${pageNumber} text (${text.length} chars):`);
    console.log(text);
    return text;
  }

  /**
   * Extract matches from findController after search
   */
  _extractMatches() {
    const matches = [];
    let globalIndex = 0;

    for (let pageIndex = 0; pageIndex < this.pdfViewer.pagesCount; pageIndex++) {
      const pageMatches = this.findController._pageMatches[pageIndex];
      const pageMatchesLength = this.findController._pageMatchesLength[pageIndex];
      const pageContent = this.findController._pageContents[pageIndex];

      if (pageMatches && pageMatchesLength && pageContent) {
        for (let matchIndex = 0; matchIndex < pageMatches.length; matchIndex++) {
          const startPos = pageMatches[matchIndex];
          const length = pageMatchesLength[matchIndex];

          matches.push({
            pageIndex,
            matchIndex,
            globalIndex: globalIndex++,
            startPos,
            length,
            text: pageContent.substring(startPos, startPos + length),
            bounds: null
          });
        }
      }
    }

    return matches;
  }

  /**
   * Highlight matches using PDF.js official API
   */
  _highlightMatches(query, options = {}) {
    const {
      highlightAll = true,
      targetPageIndex = null,
      targetMatchIndex = null,
      pageNumber = null,
      scroll = false
    } = options;

    // Enable scrolling if requested
    this.findController._scrollMatches = scroll;

    // Dispatch find event
    this.eventBus.dispatch('find', {
      source: null,
      type: highlightAll ? 'highlightallchange' : 'again',
      query: query,
      caseSensitive: false,
      entireWord: true,
      highlightAll,
      findPrevious: false,
      matchDiacritics: false,
    });

    // If targeting specific match, set the selection
    if (targetPageIndex !== null && targetMatchIndex !== null) {
      this.findController._selected = {
        pageIdx: targetPageIndex,
        matchIdx: targetMatchIndex
      };
    }

    return this;
  }

  /**
   * Clear all highlights
   */
  _clearHighlights() {
    this.eventBus.dispatch('findbarclose', { source: null });
    return this;
  }

  /**
   * Destroy the finder
   */
  destroy() {
    if (this._searchListener) {
      this.eventBus._off('updatetextlayermatches', this._searchListener);
      this._searchListener = null;
    }
    this._clearHighlights();
  }
}

// Export for use
if (typeof window !== 'undefined') {
  window.CustomFinder = { Finder, MatchCollection };
}
