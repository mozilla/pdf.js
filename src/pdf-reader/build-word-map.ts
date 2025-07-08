import type { PageStructureSchema, Sentence } from "./analyze-page-structure";
import type { PDFViewer } from "./types";

export interface SentenceLocationData {
  pageIndex: number;
  matchStartPosition: number;
  matchLength: number;
  textContent?: string; // The actual text content from PDF.js
}

export interface WordLocationData extends SentenceLocationData {
  word: string; // The word that was found
  parentSentence?: EnrichedSentence; // The sentence this word belongs to (if any)
}

export interface EnrichedSentence extends Sentence {
  location: SentenceLocationData; // required - sentences without location are filtered out
  words: WordLocationData[]; // required - all words belonging to this sentence
}

export interface EnrichedSection {
  title: string;
  readingRelevance: number;
  sentences: EnrichedSentence[];
}

export interface WordMapTraverser {
  next(): {
    sentence: EnrichedSentence;
    word: WordLocationData;
    wordIndex: number; // Index within current sentence
    sentenceIndex: number; // Index within all sentences
    sectionIndex: number; // Index within all sections
    done: boolean;
  };
  clearHighlights(): void; // Clear all highlights and disable scrolling
}

export interface WordMap {
  sections: EnrichedSection[];
  getLocationForSentence: (sentenceText: string) => SentenceLocationData | null;
  traverse(): WordMapTraverser;
}

// Debug function to verify word order in a sentence
export function debugWordOrder(wordMap: WordMap, sentenceText: string): void {
  console.log(`🔍 Debugging word order for sentence: "${sentenceText}"`);

  for (const section of wordMap.sections) {
    for (const sentence of section.sentences) {
      if (sentence.sentenceText === sentenceText) {
        console.log(`📍 Found sentence with ${sentence.words.length} words:`);
        sentence.words.forEach((word, index) => {
          console.log(
            `  ${index + 1}. "${word.word}" (${word.textContent}) at position ${word.matchStartPosition}`
          );
        });

        // Verify they are in position order
        const sortedWords = [...sentence.words].sort(
          (a, b) => a.matchStartPosition - b.matchStartPosition
        );
        const isCorrectOrder = sentence.words.every(
          (word, index) =>
            word.matchStartPosition === sortedWords[index].matchStartPosition
        );
        console.log(
          `✅ Words are in correct position order: ${isCorrectOrder}`
        );
        return;
      }
    }
  }

  console.log("❌ Sentence not found in word map");
}

// Test function to run findWordLocation in isolation
class WordMapTraverserImpl implements WordMapTraverser {
  private sectionIndex = 0;
  private sentenceIndex = 0;
  private wordIndex = 0;
  private allSentences: EnrichedSentence[];
  private currentSentence: EnrichedSentence | null = null;

  constructor(private wordMap: WordMap) {
    // Flatten all sentences from all sections for easier traversal
    this.allSentences = wordMap.sections.flatMap(section => section.sentences);
    this.currentSentence =
      this.allSentences.length > 0 ? this.allSentences[0] : null;
  }

  next() {
    // Check if we're done
    if (
      !this.currentSentence ||
      this.sentenceIndex >= this.allSentences.length
    ) {
      return {
        sentence: null as any,
        word: null as any,
        wordIndex: -1,
        sentenceIndex: -1,
        sectionIndex: -1,
        done: true,
      };
    }

    // Check if we're at the end of current sentence's words
    if (this.wordIndex >= this.currentSentence.words.length) {
      // Move to next sentence
      this.sentenceIndex++;
      this.wordIndex = 0;

      if (this.sentenceIndex >= this.allSentences.length) {
        return {
          sentence: null as any,
          word: null as any,
          wordIndex: -1,
          sentenceIndex: -1,
          sectionIndex: -1,
          done: true,
        };
      }

      this.currentSentence = this.allSentences[this.sentenceIndex];

      // Update section index
      let sentenceCount = 0;
      for (let i = 0; i < this.wordMap.sections.length; i++) {
        sentenceCount += this.wordMap.sections[i].sentences.length;
        if (this.sentenceIndex < sentenceCount) {
          this.sectionIndex = i;
          break;
        }
      }
    }

    // Get current word
    const currentWord = this.currentSentence.words[this.wordIndex];

    const result = {
      sentence: this.currentSentence,
      word: currentWord,
      wordIndex: this.wordIndex,
      sentenceIndex: this.sentenceIndex,
      sectionIndex: this.sectionIndex,
      done: false,
    };

    // Move to next word
    this.wordIndex++;

    // Log the step
    console.log(
      `📖 Step ${this.sentenceIndex + 1}.${this.wordIndex}: "${currentWord.word}" (${currentWord.textContent}) at position ${currentWord.matchStartPosition}`
    );

    // Highlight the current word
    this.highlightWord(currentWord);

    return result;
  }

  private highlightWord(word: WordLocationData): void {
    try {
      const eventBus = (window as any).PDFViewerApplication?.eventBus;
      const findController = (window as any).PDFViewerApplication
        ?.findController;
      const pdfViewer = (window as any).PDFViewerApplication?.pdfViewer;

      if (!eventBus || !findController || !pdfViewer) {
        console.warn("PDF.js components not available for highlighting");
        return;
      }

      // Validate that this word belongs to a sentence (safety check)
      if (!word.parentSentence) {
        console.warn(
          `Word "${word.word}" has no parent sentence - skipping highlight`
        );
        return;
      }

      const sentence = word.parentSentence;
      const sentenceStart = sentence.location.matchStartPosition;
      const sentenceEnd = sentenceStart + sentence.location.matchLength;
      const wordStart = word.matchStartPosition;
      const wordEnd = wordStart + word.matchLength;

      // CRITICAL: Only highlight if word is within sentence boundaries
      if (wordStart < sentenceStart || wordEnd > sentenceEnd) {
        console.warn(
          `Word "${word.word}" at position ${wordStart} is outside sentence boundaries (${sentenceStart}-${sentenceEnd}) - skipping highlight`
        );
        return;
      }

      // Set sentence boundaries on the TextHighlighter for this page
      try {
        const pageView = pdfViewer._pages?.[word.pageIndex];
        const textHighlighter = pageView?._textHighlighter;

        if (textHighlighter && textHighlighter.setSentenceBoundaries) {
          // Set boundaries for the current sentence only
          console.log(
            `🎯 Setting boundaries for word "${word.word}" in sentence: "${sentence.sentenceText.substring(0, 50)}..." at ${sentenceStart}-${sentenceEnd}`
          );
          textHighlighter.setSentenceBoundaries([
            {
              start: sentenceStart,
              end: sentenceEnd,
            },
          ]);
        }
      } catch (error) {
        console.warn(
          "Could not set sentence boundaries on TextHighlighter:",
          error
        );
      }

      // Enable scrolling for traversal (we want to follow the reading)
      findController._scrollMatches = true;

      // Clear any existing highlights first
      eventBus.dispatch("findbarclose", { source: null });

      // Wait a bit for clearing to complete, then perform the find
      setTimeout(() => {
        // Find all occurrences of this word
        eventBus.dispatch("find", {
          source: null,
          type: "highlightallchange",
          query: word.word,
          caseSensitive: false,
          entireWord: true,
          highlightAll: false,
          findPrevious: false,
          matchDiacritics: false,
        });

        // Set the find controller to highlight the specific occurrence
        setTimeout(() => {
          try {
            // Find the match index for this specific word position
            const pageMatches = findController._pageMatches[word.pageIndex];
            if (pageMatches) {
              const matchIndex = pageMatches.findIndex(
                (pos: number) => pos === word.matchStartPosition
              );

              if (matchIndex >= 0) {
                // Set the selected match to this specific word
                findController._selected.pageIdx = word.pageIndex;
                findController._selected.matchIdx = matchIndex;
                findController._offset.pageIdx = word.pageIndex;
                findController._offset.matchIdx = matchIndex;

                // Trigger highlighting update
                findController._eventBus.dispatch("updatetextlayermatches", {
                  source: findController,
                  pageIndex: word.pageIndex,
                });

                console.log(
                  `✨ Highlighted "${word.word}" at position ${word.matchStartPosition} WITHIN sentence boundaries (${sentenceStart}-${sentenceEnd})`
                );
              } else {
                console.warn(
                  `Could not find word "${word.word}" at position ${word.matchStartPosition}`
                );
              }
            }
          } catch (error) {
            console.warn("Error setting specific word highlight:", error);
          }
        }, 100);
      }, 50);
    } catch (error) {
      console.warn("Error highlighting word:", error);
    }
  }

  clearHighlights(): void {
    try {
      const eventBus = (window as any).PDFViewerApplication?.eventBus;
      const findController = (window as any).PDFViewerApplication
        ?.findController;
      const pdfViewer = (window as any).PDFViewerApplication?.pdfViewer;

      if (eventBus && findController) {
        // Clear sentence boundaries on all TextHighlighters
        if (pdfViewer?._pages) {
          for (const pageView of pdfViewer._pages) {
            const textHighlighter = pageView?._textHighlighter;
            if (textHighlighter && textHighlighter.setSentenceBoundaries) {
              textHighlighter.setSentenceBoundaries(null);
            }
          }
        }

        // Clear all highlights
        eventBus.dispatch("findbarclose", { source: null });

        // Disable scrolling for better UX
        findController._scrollMatches = false;

        console.log("🧹 Cleared all highlights and disabled scrolling");
      }
    } catch (error) {
      console.warn("Error clearing highlights:", error);
    }
  }
}

function findParentSentence(
  wordStartPos: number,
  wordLength: number,
  pageIndex: number,
  wordMap: WordMap
): EnrichedSentence | undefined {
  // Look through all sections and sentences to find which one contains this word
  for (const section of wordMap.sections) {
    for (const sentence of section.sentences) {
      // Check sentences on the same page (location is now always available)
      if (sentence.location.pageIndex === pageIndex) {
        const sentenceStart = sentence.location.matchStartPosition;
        const sentenceEnd = sentenceStart + sentence.location.matchLength;
        const wordEnd = wordStartPos + wordLength;

        // Check if word falls within sentence boundaries
        // Word is inside sentence if:
        // - Word starts at or after sentence start
        // - Word ends at or before sentence end
        if (wordStartPos >= sentenceStart && wordEnd <= sentenceEnd) {
          return sentence;
        }
      }
    }
  }

  return undefined;
}

export async function testFindWordLocation(
  word: string,
  wordMap?: WordMap
): Promise<WordLocationData[]> {
  const eventBus = (window as any).PDFViewerApplication?.eventBus;
  const findController = (window as any).PDFViewerApplication?.findController;
  const pdfViewer = (window as any).PDFViewerApplication?.pdfViewer;

  if (!eventBus || !findController || !pdfViewer) {
    throw new Error("PDF.js components not available for testing");
  }

  const currentPageIndex = pdfViewer.currentPageNumber - 1;

  const locations = await findWordLocation(
    word,
    currentPageIndex,
    eventBus,
    findController,
    wordMap
  );

  console.log(
    `🧪 Found ${locations.length} locations for "${word}"${wordMap ? ` (${locations.filter((loc: WordLocationData) => loc.parentSentence).length} with parent sentences)` : ""}`
  );

  return locations;
}

export async function buildWordMap(
  pageStructure: PageStructureSchema,
  pdfViewer: PDFViewer
): Promise<WordMap> {
  console.log("🗺️ Building word map from page structure...");

  const currentPageIndex = pdfViewer.currentPageNumber - 1;

  const eventBus = (window as any).PDFViewerApplication?.eventBus;
  const findController = (window as any).PDFViewerApplication?.findController;

  if (!eventBus || !findController) {
    throw new Error("PDF.js event bus or find controller not available");
  }

  // AGGRESSIVE scroll prevention: Override scroll methods temporarily
  const container = pdfViewer.container;
  const originalScrollTo = container.scrollTo;
  const originalScrollTop = container.scrollTop;
  const originalScrollLeft = container.scrollLeft;

  // Override scroll methods to do nothing during map building
  container.scrollTo = () => {};
  Object.defineProperty(container, "scrollTop", {
    get: () => originalScrollTop,
    set: () => {}, // Ignore all scroll attempts
    configurable: true,
  });
  Object.defineProperty(container, "scrollLeft", {
    get: () => originalScrollLeft,
    set: () => {}, // Ignore all scroll attempts
    configurable: true,
  });

  // Disable scrolling globally during entire map building process
  const originalScrollMatches = findController._scrollMatches;
  findController._scrollMatches = false;

  try {
    // Wait a bit to ensure text layer is loaded
    await new Promise(resolve => setTimeout(resolve, 500));

    const enrichedSections: EnrichedSection[] = [];

    // Process each section
    for (const section of pageStructure.sections) {
      const enrichedSentences: EnrichedSentence[] = [];

      for (const sentence of section.sentences) {
        try {
          const locationData = await findSentenceLocation(
            sentence,
            currentPageIndex,
            eventBus,
            findController
          );

          if (locationData) {
            // Only add sentences that have location data (others are filtered out)
            const enrichedSentence: EnrichedSentence = {
              ...sentence,
              location: locationData,
              words: [], // Will be populated after all sentences are processed
            };

            enrichedSentences.push(enrichedSentence);
          }
        } catch (error) {
          console.warn(
            `⚠️ Skipping sentence due to error: "${sentence.sentenceText}"`
          );
        }
      }

      enrichedSections.push({
        title: section.title,
        readingRelevance: section.readingRelevance,
        sentences: enrichedSentences,
      });
    }

    const totalSentences = enrichedSections.reduce(
      (count, section) => count + section.sentences.length,
      0
    );

    console.log(
      `🗺️ Found ${totalSentences} sentences across ${enrichedSections.length} sections`
    );

    // Step 2: Now populate words for each sentence
    console.log("🔤 Finding words for each sentence (page-limited search)...");

    for (const section of enrichedSections) {
      for (const sentence of section.sentences) {
        // Extract individual words from the sentence text
        const wordsInSentence = sentence.sentenceText
          .toLowerCase()
          .replace(/[^\w\s]/g, " ") // Replace punctuation with spaces
          .split(/\s+/) // Split on whitespace
          .filter(word => word.length > 0); // Remove empty strings

        // Collect all word locations for this sentence
        const allWordLocationsForSentence: WordLocationData[] = [];

        // For each word, find its locations and check if it belongs to this sentence
        for (const word of wordsInSentence) {
          try {
            const wordLocations = await findWordLocation(
              word,
              sentence.location.pageIndex, // Use the sentence's page, not currentPageIndex
              eventBus,
              findController,
              {
                sections: enrichedSections,
                getLocationForSentence: () => null,
                traverse: () => {
                  throw new Error(
                    "Traverse not available during word population"
                  );
                },
              } // Provide minimal WordMap
            );

            // Filter to only words that belong to this specific sentence
            const wordsInThisSentence = wordLocations.filter(
              wordLoc =>
                wordLoc.parentSentence?.sentenceText === sentence.sentenceText
            );

            allWordLocationsForSentence.push(...wordsInThisSentence);
          } catch (error) {
            // Silently skip words that can't be found
          }
        }

        // Sort words by their position within the sentence to ensure correct reading order
        allWordLocationsForSentence.sort(
          (a, b) => a.matchStartPosition - b.matchStartPosition
        );

        sentence.words = allWordLocationsForSentence;
      }
    }

    const totalWords = enrichedSections.reduce(
      (count, section) =>
        count +
        section.sentences.reduce(
          (sCount, sentence) => sCount + sentence.words.length,
          0
        ),
      0
    );

    console.log(
      `✅ WordMap complete: ${totalSentences} sentences with ${totalWords} located words (page-limited)`
    );

    // Verify word order in all sentences
    let totalCorrectSentences = 0;
    let totalSentencesWithWords = 0;

    for (const section of enrichedSections) {
      for (const sentence of section.sentences) {
        if (sentence.words.length > 0) {
          totalSentencesWithWords++;
          const sortedWords = [...sentence.words].sort(
            (a, b) => a.matchStartPosition - b.matchStartPosition
          );
          const isCorrectOrder = sentence.words.every(
            (word, index) =>
              word.matchStartPosition === sortedWords[index].matchStartPosition
          );

          if (isCorrectOrder) {
            totalCorrectSentences++;
          } else {
            console.warn(
              `⚠️ Word order issue in sentence: "${sentence.sentenceText.substring(0, 50)}..."`
            );
          }
        }
      }
    }

    console.log(
      `📊 Word order verification: ${totalCorrectSentences}/${totalSentencesWithWords} sentences have correct word order`
    );

    const wordMap: WordMap = {
      sections: enrichedSections,
      getLocationForSentence: (sentenceText: string) => {
        for (const section of enrichedSections) {
          for (const sentence of section.sentences) {
            if (sentence.sentenceText === sentenceText) {
              return sentence.location;
            }
          }
        }
        return null;
      },
      traverse: () => {
        return new WordMapTraverserImpl(wordMap);
      },
    };

    return wordMap;
  } finally {
    // Restore all original scroll behavior
    container.scrollTo = originalScrollTo;
    Object.defineProperty(container, "scrollTop", {
      get: function () {
        return this._scrollTop || 0;
      },
      set: function (value) {
        this._scrollTop = value;
        this.scrollTo(this.scrollLeft, value);
      },
      configurable: true,
    });
    Object.defineProperty(container, "scrollLeft", {
      get: function () {
        return this._scrollLeft || 0;
      },
      set: function (value) {
        this._scrollLeft = value;
        this.scrollTo(value, this.scrollTop);
      },
      configurable: true,
    });

    // Reset to original position
    container.scrollTo(originalScrollLeft, originalScrollTop);

    // Restore original scroll setting
    findController._scrollMatches = originalScrollMatches;

    console.log("🔄 Restored original scroll behavior");
  }
}

export async function findWordLocation(
  word: string,
  targetPageIndex: number,
  eventBus: any,
  findController: any,
  wordMap?: WordMap // Optional: provide to connect words with parent sentences
): Promise<WordLocationData[]> {
  // Get access to the PDF viewer to access text layers
  const pdfViewer = (window as any).PDFViewerApplication?.pdfViewer;

  // Store current scroll position to restore later (prevents jumping)
  const container = pdfViewer?.container;
  const originalScrollTop = container?.scrollTop || 0;
  const originalScrollLeft = container?.scrollLeft || 0;

  return new Promise(resolve => {
    // Clear any existing search first
    eventBus.dispatch("findbarclose", { source: null });

    // Use the find system to locate all word occurrences across all pages
    eventBus.dispatch("find", {
      source: null,
      type: "highlightallchange",
      query: word,
      caseSensitive: false,
      entireWord: true, // Use entire word matching for words
      highlightAll: true,
      findPrevious: false,
      matchDiacritics: false,
    });

    // Disable automatic scrolling AFTER triggering find (prevents jumping)
    findController._scrollMatches = false;

    // Wait for the find operation to complete
    const checkForResults = () => {
      const allPageMatches = findController._pageMatches;
      const allPageLengths = findController._pageMatchesLength;

      // Check for word matches (debug logging removed for cleaner output)

      // Collect word occurrences ONLY from the target page
      if (allPageMatches && allPageLengths) {
        const wordLocations: WordLocationData[] = [];

        // CRITICAL FIX: Only process the target page, not all pages
        if (targetPageIndex < allPageMatches.length) {
          const pageMatches = allPageMatches[targetPageIndex];
          const pageLengths = allPageLengths[targetPageIndex];

          if (pageMatches && pageLengths && pageMatches.length > 0) {
            // Process each match on this specific page
            for (
              let matchIndex = 0;
              matchIndex < pageMatches.length;
              matchIndex++
            ) {
              const wordStartPos = pageMatches[matchIndex];
              const wordLength = pageLengths[matchIndex];

              const wordLocation: WordLocationData = {
                word: word,
                pageIndex: targetPageIndex,
                matchStartPosition: wordStartPos,
                matchLength: wordLength,
              };

              // Try to get the actual text content from the page's text layer
              try {
                if (pdfViewer) {
                  const pageView = (pdfViewer as any)._pages?.[targetPageIndex];
                  if (pageView?.textLayer?.div) {
                    const textContent =
                      pageView.textLayer.div.textContent || "";
                    if (textContent) {
                      const endPos = wordStartPos + wordLength;
                      wordLocation.textContent = textContent.substring(
                        wordStartPos,
                        endPos
                      );
                    }
                  }
                }
              } catch (error) {
                // Silently skip text extraction errors
              }

              // Find parent sentence by comparing positions
              if (wordMap) {
                wordLocation.parentSentence = findParentSentence(
                  wordStartPos,
                  wordLength,
                  targetPageIndex,
                  wordMap
                );
              }

              wordLocations.push(wordLocation);
            }
          }
        }

        // Restore original scroll position to prevent jumping
        if (container) {
          container.scrollTop = originalScrollTop;
          container.scrollLeft = originalScrollLeft;
        }

        resolve(wordLocations);
        return;
      } else {
        // Still searching, check again
        setTimeout(checkForResults, 100);
      }
    };

    // Start checking for results
    setTimeout(checkForResults, 100);
  });
}

async function findSentenceLocation(
  sentence: Sentence,
  currentPageIndex: number,
  eventBus: any,
  findController: any
): Promise<SentenceLocationData | null> {
  // Store current scroll position to restore later (prevents jumping)
  const pdfViewer = (window as any).PDFViewerApplication?.pdfViewer;
  const container = pdfViewer?.container;
  const originalScrollTop = container?.scrollTop || 0;
  const originalScrollLeft = container?.scrollLeft || 0;

  return new Promise(resolve => {
    // Clear any existing search first
    eventBus.dispatch("findbarclose", { source: null });

    // Use the find system to locate the sentence across all pages
    eventBus.dispatch("find", {
      source: null,
      type: "highlightallchange",
      query: sentence.sentenceText,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: false,
      matchDiacritics: false,
    });

    // Disable automatic scrolling AFTER triggering find (prevents jumping)
    findController._scrollMatches = false;

    // Wait for the find operation to complete
    const checkForResults = () => {
      const allPageMatches = findController._pageMatches;
      const allPageLengths = findController._pageMatchesLength;

      // Check for sentence matches (debug logging removed for cleaner output)

      // Look for the sentence on any page
      if (allPageMatches && allPageLengths) {
        for (
          let pageIndex = 0;
          pageIndex < allPageMatches.length;
          pageIndex++
        ) {
          const pageMatches = allPageMatches[pageIndex];
          const pageLengths = allPageLengths[pageIndex];

          if (pageMatches && pageLengths && pageMatches.length > 0) {
            // Found the sentence - use the first match on this page
            const location: SentenceLocationData = {
              pageIndex: pageIndex,
              matchStartPosition: pageMatches[0],
              matchLength: pageLengths[0],
            };

            // Try to get the actual text content if available
            try {
              const textContent = findController._extractText?.[pageIndex];
              if (textContent) {
                const startPos = pageMatches[0];
                const endPos = startPos + pageLengths[0];
                location.textContent = textContent.substring(startPos, endPos);
              }
            } catch (error) {
              console.warn("Could not extract text content:", error);
            }

            // Restore original scroll position to prevent jumping
            if (container) {
              container.scrollTop = originalScrollTop;
              container.scrollLeft = originalScrollLeft;
            }

            resolve(location);
            return;
          }
        }

        // If we get here, no matches were found on any page

        // Restore original scroll position even when no matches found
        if (container) {
          container.scrollTop = originalScrollTop;
          container.scrollLeft = originalScrollLeft;
        }

        // No fallback needed for now, just return null
        resolve(null);
        return;
      } else {
        // Still searching, check again
        setTimeout(checkForResults, 100);
      }
    };

    // Start checking for results
    setTimeout(checkForResults, 100);
  });
}
