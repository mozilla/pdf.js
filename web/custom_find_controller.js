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
 * Highlight all matches with custom styling
 */
  highlightAll(className = 'highlight-red') {
    console.log(`🔍 Highlighting ${this.matches.length} matches for "${this.query}" in red`);
    this.clearHighlights();
    this.finder._highlightAllMatches(this.matches, className);
    this.allHighlighted = true;
    return this;
  }

  /**
 * Highlight specific match by global index
 */
  highlightByIndex(globalIndex, className = 'highlight-red selected') {
    this.clearHighlights();

    const match = this.matches[globalIndex];
    if (!match) {
      console.warn(`No match found at index ${globalIndex}`);
      return this;
    }

    this.finder._highlightSingleMatch(match, className);
    this.currentHighlight = globalIndex;
    return this;
  }

  /**
   * Highlight matches by page
   */
  highlightByPage(pageIndex, className = 'highlight-red') {
    const pageMatches = this.matches.filter(m => m.pageIndex === pageIndex);
    this.clearHighlights();
    this.finder._highlightSpecificMatches(pageMatches, className);
    return this;
  }

  /**
   * Clear all custom highlights
   */
  clearHighlights() {
    this.finder._clearCustomHighlights();
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
   * Get match bounds for positioning custom elements
   */
  getMatchBounds(globalIndex) {
    const match = this.matches[globalIndex];
    if (!match) return null;

    return this.finder._getMatchBounds(match);
  }

  /**
   * Scroll to specific match
   */
  scrollToMatch(globalIndex) {
    const match = this.matches[globalIndex];
    if (!match) return this;

    this.finder._scrollToMatch(match);
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
 * Custom Find Controller - programmatic wrapper around PDF.js find
 */
class Finder {
  constructor(pdfViewer = null) {
    this.pdfViewer = pdfViewer || window.PDFViewerApplication?.pdfViewer;
    this.eventBus = window.PDFViewerApplication?.eventBus;
    this.linkService = window.PDFViewerApplication?.pdfLinkService;

    if (!this.pdfViewer) {
      throw new Error('PDF viewer not available. Ensure PDF.js is loaded.');
    }

    // Custom state separate from main find controller
    this._pageContents = [];
    this._pageContentPromises = [];
    this._isReady = false;

    this._initializePageContent();
  }

  /**
   * Initialize page content extraction
   */
  async _initializePageContent() {
    const numPages = this.pdfViewer.pagesCount;
    this._pageContentPromises = new Array(numPages);
    this._pageContents = new Array(numPages);

    for (let i = 0; i < numPages; i++) {
      this._pageContentPromises[i] = this._extractPageText(i);
    }

    this._isReady = true;
  }

  /**
 * Extract text content from a page using the TextHighlighter's text
 */
  async _extractPageText(pageIndex) {
    try {
      const pageView = this.pdfViewer._pages[pageIndex];
      if (!pageView) {
        return '';
      }

      // Wait for text layer to be ready and get the same text the TextHighlighter uses
      if (pageView._textHighlighter && pageView._textHighlighter.textContentItemsStr) {
        const pageText = pageView._textHighlighter.textContentItemsStr.join('');
        this._pageContents[pageIndex] = pageText;
        console.log(`📄 Page ${pageIndex}: Using TextHighlighter text (${pageText.length} chars)`);
        return pageText;
      }

      // Fallback: extract text the traditional way
      if (!pageView.pdfPage) {
        return '';
      }

      const textContent = await pageView.pdfPage.getTextContent({
        disableNormalization: true
      });

      const strBuf = [];
      for (const textItem of textContent.items) {
        strBuf.push(textItem.str);
        if (textItem.hasEOL) {
          strBuf.push("\n");
        }
      }

      const pageText = strBuf.join("");
      this._pageContents[pageIndex] = pageText;
      return pageText;
    } catch (error) {
      console.warn(`Failed to extract text from page ${pageIndex}:`, error);
      this._pageContents[pageIndex] = '';
      return '';
    }
  }

  /**
 * Wait for finder to be ready
 */
  async ready() {
    if (this._isReady) {
      await Promise.all(this._pageContentPromises);

      // Additional wait for text layers to be rendered
      await new Promise(resolve => setTimeout(resolve, 500));

      // Re-extract text using TextHighlighter content if available
      for (let i = 0; i < this.pdfViewer.pagesCount; i++) {
        const pageView = this.pdfViewer._pages[i];
        if (pageView && pageView._textHighlighter && pageView._textHighlighter.textContentItemsStr) {
          const pageText = pageView._textHighlighter.textContentItemsStr.join('');
          this._pageContents[i] = pageText;
        }
      }
    }
    return this;
  }

  /**
   * Find text and return MatchCollection
   */
  async find(query, options = {}) {
    await this.ready();

    const {
      caseSensitive = false,
      entireWord = false,
      matchDiacritics = false
    } = options;

    const matches = [];
    let globalIndex = 0;

    for (let pageIndex = 0; pageIndex < this._pageContents.length; pageIndex++) {
      const pageContent = this._pageContents[pageIndex];
      if (!pageContent) continue;

      const pageMatches = this._findInText(query, pageContent, {
        caseSensitive,
        entireWord,
        matchDiacritics
      });

      for (let matchIndex = 0; matchIndex < pageMatches.length; matchIndex++) {
        const match = pageMatches[matchIndex];
        matches.push({
          pageIndex,
          matchIndex,
          globalIndex: globalIndex++,
          startPos: match.index,
          length: match.length,
          text: pageContent.substring(match.index, match.index + match.length),
          bounds: null // Will be populated when needed
        });
      }
    }

    return new MatchCollection(this, query, matches);
  }

  /**
   * Find text within a single page content
   */
  _findInText(query, text, options) {
    const { caseSensitive, entireWord, matchDiacritics } = options;

    let searchQuery = query;
    if (!matchDiacritics) {
      // Simple diacritic normalization
      searchQuery = searchQuery.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    const flags = `g${caseSensitive ? '' : 'i'}`;
    const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = entireWord ? `\\b${escapedQuery}\\b` : escapedQuery;
    const regex = new RegExp(pattern, flags);

    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        index: match.index,
        length: match[0].length
      });
    }

    return matches;
  }

  /**
 * Highlight all matches using PDF.js text layer
 */
  _highlightAllMatches(matches, className = 'highlight-red') {
    this._clearCustomHighlights();
    const pageGroups = this._groupMatchesByPage(matches);

    // Trigger the same events as the original find system
    for (const [pageIndex, pageMatches] of pageGroups) {
      this._updatePageMatches(pageIndex, pageMatches, -1); // -1 = highlight all
    }
  }

  /**
   * Highlight single match
   */
  _highlightSingleMatch(match, className = 'highlight-red selected') {
    this._clearCustomHighlights();
    this._updatePageMatches(match.pageIndex, [match], 0); // 0 = first (selected) match
  }

  /**
   * Highlight specific matches
   */
  _highlightSpecificMatches(matches, className = 'highlight-red') {
    this._clearCustomHighlights();
    const pageGroups = this._groupMatchesByPage(matches);

    for (const [pageIndex, pageMatches] of pageGroups) {
      this._updatePageMatches(pageIndex, pageMatches, -1); // -1 = highlight all
    }
  }

  /**
 * Update page matches using PDF.js event system
 */
  _updatePageMatches(pageIndex, matches, selectedMatchIdx) {
    const pageView = this.pdfViewer._pages[pageIndex];
    if (!pageView) {
      return;
    }

    // Get the original find controller to store matches in its format
    const findController = window.PDFViewerApplication?.findController;
    if (!findController) {
      return;
    }

    // Convert our matches to PDF.js internal format
    const { pageMatches, pageMatchesLength } = this._convertMatchesToPDFFormat(pageIndex, matches);

    // Store matches in the find controller's internal arrays (private properties)
    findController._pageMatches = findController._pageMatches || [];
    findController._pageMatchesLength = findController._pageMatchesLength || [];
    findController._pageMatches[pageIndex] = pageMatches;
    findController._pageMatchesLength[pageIndex] = pageMatchesLength;

    // Set the highlightMatches flag so TextHighlighter will actually highlight
    findController._highlightMatches = true;

    // Set up the getters that TextHighlighter expects
    if (!findController.state) {
      Object.defineProperty(findController, 'state', {
        get() {
          return {
            highlightAll: true,
            query: 'custom-search',
            caseSensitive: false,
            entireWord: false
          };
        }
      });
    }

    if (!findController.selected) {
      Object.defineProperty(findController, 'selected', {
        get() {
          return findController._selected || { pageIdx: -1, matchIdx: -1 };
        }
      });
    }

    // Initialize selected if it doesn't exist
    findController._selected = findController._selected || { pageIdx: -1, matchIdx: -1 };

    // Simple debug confirmation
    console.log(`✅ Page ${pageIndex}: ${pageMatches.length} red highlights applied`);

    // Dispatch the event (without matches data - TextHighlighter reads from findController)
    if (this.eventBus) {
      this.eventBus.dispatch('updatetextlayermatches', {
        source: findController, // Important: use findController as source
        pageIndex: pageIndex
      });
    }
  }

  /**
 * Convert our match format to PDF.js internal format
 */
  _convertMatchesToPDFFormat(pageIndex, matches) {
    const pageMatches = [];
    const pageMatchesLength = [];

    for (const match of matches) {
      pageMatches.push(match.startPos);
      pageMatchesLength.push(match.length);
    }

    return { pageMatches, pageMatchesLength };
  }

  /**
 * Clear all custom highlights
 */
  _clearCustomHighlights() {
    const findController = window.PDFViewerApplication?.findController;
    if (!findController) {
      return;
    }

    // Clear matches from the find controller's internal arrays (private properties)
    if (findController._pageMatches) {
      findController._pageMatches.length = 0;
    }
    if (findController._pageMatchesLength) {
      findController._pageMatchesLength.length = 0;
    }

    // Disable highlighting
    findController._highlightMatches = false;

    // Clear highlights from all pages using event system
    if (this.eventBus) {
      this.eventBus.dispatch('updatetextlayermatches', {
        source: findController,
        pageIndex: -1 // -1 means all pages
      });
    }
  }

  /**
   * Group matches by page
   */
  _groupMatchesByPage(matches) {
    const pageGroups = new Map();

    for (const match of matches) {
      if (!pageGroups.has(match.pageIndex)) {
        pageGroups.set(match.pageIndex, []);
      }
      pageGroups.get(match.pageIndex).push(match);
    }

    return pageGroups;
  }

  /**
 * Get match bounds for positioning
 */
  _getMatchBounds(match) {
    const pageView = this.pdfViewer._pages[match.pageIndex];
    if (!pageView || !pageView.textLayer) {
      return null;
    }

    // Simple bounds calculation - could be enhanced
    const textLayerDiv = pageView.textLayer.textLayerDiv;
    if (textLayerDiv) {
      return textLayerDiv.getBoundingClientRect();
    }
    return null;
  }

  /**
   * Scroll to match
   */
  _scrollToMatch(match) {
    if (this.linkService) {
      this.linkService.page = match.pageIndex + 1;
    }

    // Additional scrolling to specific position could be added here
  }

  /**
 * Clean up resources
 */
  destroy() {
    this._clearCustomHighlights();
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Finder, MatchCollection };
} else if (typeof window !== 'undefined') {
  window.CustomFinder = { Finder, MatchCollection };
}
