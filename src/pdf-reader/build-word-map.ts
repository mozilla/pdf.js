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
}

export interface WordMap {
  sections: EnrichedSection[];
  getLocationForSentence: (sentenceText: string) => SentenceLocationData | null;
  traverse(): WordMapTraverser;
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

    return result;
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
    `🧪 Found ${locations.length} locations for "${word}"${wordMap ? ` (${locations.filter(loc => loc.parentSentence).length} with parent sentences)` : ""}`
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
  console.log("🔤 Finding words for each sentence...");

  for (const section of enrichedSections) {
    for (const sentence of section.sentences) {
      // Extract individual words from the sentence text
      const wordsInSentence = sentence.sentenceText
        .toLowerCase()
        .replace(/[^\w\s]/g, " ") // Replace punctuation with spaces
        .split(/\s+/) // Split on whitespace
        .filter(word => word.length > 0); // Remove empty strings

      // For each word, find its locations and check if it belongs to this sentence
      for (const word of wordsInSentence) {
        try {
          const wordLocations = await findWordLocation(
            word,
            currentPageIndex,
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

          sentence.words.push(...wordsInThisSentence);
        } catch (error) {
          // Silently skip words that can't be found
        }
      }
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
    `✅ WordMap complete: ${totalSentences} sentences with ${totalWords} located words`
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
}

export async function findWordLocation(
  word: string,
  currentPageIndex: number,
  eventBus: any,
  findController: any,
  wordMap?: WordMap // Optional: provide to connect words with parent sentences
): Promise<WordLocationData[]> {
  // Get access to the PDF viewer to access text layers
  const pdfViewer = (window as any).PDFViewerApplication?.pdfViewer;
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

    // Disable automatic scrolling
    findController._scrollMatches = false;

    // Wait for the find operation to complete
    const checkForResults = () => {
      const allPageMatches = findController._pageMatches;
      const allPageLengths = findController._pageMatchesLength;

      // Check for word matches (debug logging removed for cleaner output)

      // Collect all word occurrences from all pages
      if (allPageMatches && allPageLengths) {
        const wordLocations: WordLocationData[] = [];
        let totalMatches = 0;

        for (
          let pageIndex = 0;
          pageIndex < allPageMatches.length;
          pageIndex++
        ) {
          const pageMatches = allPageMatches[pageIndex];
          const pageLengths = allPageLengths[pageIndex];

          if (pageMatches && pageLengths && pageMatches.length > 0) {
            // Process each match on this page
            for (
              let matchIndex = 0;
              matchIndex < pageMatches.length;
              matchIndex++
            ) {
              const wordStartPos = pageMatches[matchIndex];
              const wordLength = pageLengths[matchIndex];

              const wordLocation: WordLocationData = {
                word: word,
                pageIndex: pageIndex,
                matchStartPosition: wordStartPos,
                matchLength: wordLength,
              };

              // Try to get the actual text content from the page's text layer
              try {
                if (pdfViewer) {
                  const pageView = (pdfViewer as any)._pages?.[pageIndex];
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
                  pageIndex,
                  wordMap
                );
              }

              wordLocations.push(wordLocation);
              totalMatches++;
            }
          }
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

    // Disable automatic scrolling
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

            resolve(location);
            return;
          }
        }

        // If we get here, no matches were found on any page

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
