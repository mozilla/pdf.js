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
  location?: SentenceLocationData; // undefined if not found
}

export interface EnrichedSection {
  title: string;
  readingRelevance: number;
  sentences: EnrichedSentence[];
}

export interface WordMap {
  sections: EnrichedSection[];
  getLocationForSentence: (sentenceText: string) => SentenceLocationData | null;
}

// Test function to run findWordLocation in isolation
function findParentSentence(
  wordStartPos: number,
  wordLength: number,
  pageIndex: number,
  wordMap: WordMap
): EnrichedSentence | undefined {
  // Look through all sections and sentences to find which one contains this word
  for (const section of wordMap.sections) {
    for (const sentence of section.sentences) {
      // Only check sentences that have location data and are on the same page
      if (sentence.location && sentence.location.pageIndex === pageIndex) {
        const sentenceStart = sentence.location.matchStartPosition;
        const sentenceEnd = sentenceStart + sentence.location.matchLength;
        const wordEnd = wordStartPos + wordLength;

        // Check if word falls within sentence boundaries
        // Word is inside sentence if:
        // - Word starts at or after sentence start
        // - Word ends at or before sentence end
        if (wordStartPos >= sentenceStart && wordEnd <= sentenceEnd) {
          console.log(
            `🎯 Word at ${wordStartPos}-${wordEnd} fits in sentence at ${sentenceStart}-${sentenceEnd}: "${sentence.sentenceText.substring(0, 30)}..."`
          );
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
  console.log(`🧪 Testing word location for: "${word}"`);

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
    `🧪 Test complete: Found ${locations.length} locations for word "${word}"`
  );

  if (wordMap) {
    const locationsWithParent = locations.filter(loc => loc.parentSentence);
    console.log(`🔗 ${locationsWithParent.length} words have parent sentences`);
  }

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

  // Debug: Check what text content is available
  console.log("🔧 [DEBUG] Current page index:", currentPageIndex);
  console.log("🔧 [DEBUG] PDF viewer pages count:", pdfViewer.pagesCount);

  // Wait a bit to ensure text layer is loaded
  await new Promise(resolve => setTimeout(resolve, 500));

  // Try to get the current page's text content for debugging
  const pageView = (pdfViewer as any)._pages?.[currentPageIndex];
  if (pageView?.textLayer?.div) {
    const textContent = pageView.textLayer.div.textContent || "";
    console.log(
      "🔧 [DEBUG] Available text content length:",
      textContent.length
    );
    console.log(
      "🔧 [DEBUG] First 200 chars of text content:",
      textContent.substring(0, 200)
    );
  } else {
    console.warn("🔧 [DEBUG] Text layer not available yet");
  }

  const enrichedSections: EnrichedSection[] = [];

  // Process each section
  for (const section of pageStructure.sections) {
    console.log(`📍 Processing section: ${section.title}`);

    const enrichedSentences: EnrichedSentence[] = [];

    for (const sentence of section.sentences) {
      console.log(
        `🔍 Finding location for sentence: "${sentence.sentenceText}"`
      );

      try {
        const locationData = await findSentenceLocation(
          sentence,
          currentPageIndex,
          eventBus,
          findController
        );

        const enrichedSentence: EnrichedSentence = {
          ...sentence,
          location: locationData || undefined,
        };

        enrichedSentences.push(enrichedSentence);

        if (locationData) {
          console.log(
            `✅ Found sentence at position ${locationData.matchStartPosition}, length ${locationData.matchLength}`
          );
        } else {
          console.warn(
            `⚠️ Could not find location for sentence: "${sentence.sentenceText}"`
          );
        }
      } catch (error) {
        console.error(`❌ Error finding sentence location:`, error);
        // Add sentence without location data
        enrichedSentences.push({ ...sentence });
      }
    }

    enrichedSections.push({
      title: section.title,
      readingRelevance: section.readingRelevance,
      sentences: enrichedSentences,
    });
  }

  const totalSentencesWithLocation = enrichedSections.reduce(
    (count, section) =>
      count + section.sentences.filter(s => s.location).length,
    0
  );

  console.log(
    `🗺️ Word map built with ${totalSentencesWithLocation} sentence locations across ${enrichedSections.length} sections`
  );

  return {
    sections: enrichedSections,
    getLocationForSentence: (sentenceText: string) => {
      for (const section of enrichedSections) {
        for (const sentence of section.sentences) {
          if (sentence.sentenceText === sentenceText && sentence.location) {
            return sentence.location;
          }
        }
      }
      return null;
    },
  };
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

      console.log("🔧 [DEBUG] Word find controller state:", {
        word: word,
        pageMatches: allPageMatches,
        pageMatchesLength: allPageLengths,
        textLayerMethod: "using pageView.textLayer.div",
        pdfViewerAvailable: pdfViewer ? "yes" : "no",
      });

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
            // Debug: Check text layer availability for this page
            let pageTextLength = 0;
            if (pdfViewer) {
              const pageView = (pdfViewer as any)._pages?.[pageIndex];
              if (pageView?.textLayer?.div) {
                const textContent = pageView.textLayer.div.textContent || "";
                pageTextLength = textContent.length;
              }
            }

            console.log(
              `🔍 Found ${pageMatches.length} occurrences of "${word}" on page ${pageIndex} (text layer: ${pageTextLength} chars)`
            );

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
                      console.log(
                        `🔧 [DEBUG] Extracted text for page ${pageIndex}, pos ${wordStartPos}-${endPos}: "${wordLocation.textContent}"`
                      );
                    }
                  } else {
                    console.warn(
                      `Text layer not available for page ${pageIndex}`
                    );
                  }
                }
              } catch (error) {
                console.warn("Could not extract text content:", error);
              }

              // Find parent sentence by comparing positions
              if (wordMap) {
                wordLocation.parentSentence = findParentSentence(
                  wordStartPos,
                  wordLength,
                  pageIndex,
                  wordMap
                );

                if (wordLocation.parentSentence) {
                  console.log(
                    `🔗 Word "${word}" at pos ${wordStartPos} belongs to sentence: "${wordLocation.parentSentence.sentenceText.substring(0, 50)}..."`
                  );
                } else {
                  console.log(
                    `🔍 Word "${word}" at pos ${wordStartPos} has no parent sentence (filtered out or not found)`
                  );
                }
              }

              wordLocations.push(wordLocation);
              totalMatches++;

              console.log(
                `📍 Match ${matchIndex + 1} on page ${pageIndex}: position ${wordLocation.matchStartPosition}, length ${wordLocation.matchLength}, text: "${wordLocation.textContent || "N/A"}", parent: ${wordLocation.parentSentence ? "found" : "none"}`
              );
            }
          }
        }

        console.log(
          `✅ Total found ${totalMatches} occurrences of word "${word}" across all pages`
        );
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

      console.log("🔧 [DEBUG] Find controller state:", {
        pageMatches: allPageMatches,
        pageMatchesLength: allPageLengths,
        extractText: findController._extractText
          ? "available"
          : "not available",
        searchQuery: sentence.sentenceText.substring(0, 50) + "...",
      });

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
            console.log(
              `✅ Found sentence on page ${pageIndex} at position ${pageMatches[0]}, length ${pageLengths[0]}`
            );

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
        console.warn(
          `No matches found for sentence: "${sentence.sentenceText}"`
        );

        // Try a fallback with just the first few words
        const firstWords = sentence.sentenceText
          .split(" ")
          .slice(0, 3)
          .join(" ");
        console.log(`🔄 Trying fallback search with: "${firstWords}"`);

        // Try the fallback search
        eventBus.dispatch("findbarclose", { source: null });
        eventBus.dispatch("find", {
          source: null,
          type: "highlightallchange",
          query: firstWords,
          caseSensitive: false,
          entireWord: false,
          highlightAll: true,
          findPrevious: false,
          matchDiacritics: false,
        });

        setTimeout(() => {
          const fallbackMatches = findController._pageMatches;
          const fallbackLengths = findController._pageMatchesLength;

          let foundFallback = false;
          if (fallbackMatches && fallbackLengths) {
            for (
              let pageIndex = 0;
              pageIndex < fallbackMatches.length;
              pageIndex++
            ) {
              const pageMatches = fallbackMatches[pageIndex];
              const pageLengths = fallbackLengths[pageIndex];

              if (pageMatches && pageLengths && pageMatches.length > 0) {
                console.log(
                  `🔍 Fallback found ${pageMatches.length} matches on page ${pageIndex} for: "${firstWords}"`
                );
                foundFallback = true;
                break;
              }
            }
          }

          if (!foundFallback) {
            console.warn(`❌ Even fallback search failed for: "${firstWords}"`);
          }

          resolve(null);
        }, 200);

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
