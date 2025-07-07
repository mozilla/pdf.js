import { playAudio } from "./playAudio";
import { type AudioWithWordTimings } from "./generate-audio-with-word-timings";
import { type PDFViewer } from "./types";
import { Timer } from "./timer";
import {
  type WordMap,
  type WordMapTraverser,
  type WordLocationData,
  type EnrichedSentence,
} from "./build-word-map";

export async function readSentences(
  pdfViewer: PDFViewer,
  wordMap?: WordMap
): Promise<void> {
  if (!latestAudioData || latestAudioData.length === 0) {
    console.error("No audio data available");
    return;
  }

  for (const audioItem of latestAudioData) {
    // Find the corresponding sentence in the WordMap
    let currentSentenceWords: WordLocationData[] = [];
    if (wordMap) {
      const matchingSentence = findSentenceInWordMap(
        audioItem.originalSentenceText,
        wordMap
      );
      if (matchingSentence) {
        currentSentenceWords = matchingSentence.words;
        console.log(
          `🎯 Synced audio sentence with WordMap: "${audioItem.originalSentenceText}" (${currentSentenceWords.length} words)`
        );
      } else {
        console.warn(
          `⚠️ Could not find sentence in WordMap: "${audioItem.originalSentenceText}"`
        );
      }
    }

    // Start word tracking with main thread timer
    const wordTimer = highlightCurrentlyReadWord(
      audioItem,
      currentSentenceWords
    );

    await playAudio({
      audioItem,
      onEnd: () => {
        clearSentenceHighlight();
        wordTimer.stop();
      },
    });
  }

  // Clean up highlights when reading is complete
  if (wordMap) {
    clearWordMapHighlights();
  }
}

// Audio state
let latestAudioData: AudioWithWordTimings[] | null = null;
let currentSessionId = 0;

export function areSameSessions(sessionId: number): boolean {
  return sessionId === currentSessionId;
}

export function setLatestAudioData(audioData: AudioWithWordTimings[]): void {
  latestAudioData = audioData;
}

export function resetLatestAudioData(): number {
  latestAudioData = null;
  currentSessionId++;
  return currentSessionId;
}

// Highlighting state
let currentHighlightedSentence: string | null = null;

export function clearSentenceHighlight(): void {
  if (!currentHighlightedSentence) return;

  const eventBus = (window as any).PDFViewerApplication?.eventBus;
  if (!eventBus) {
    console.warn("Event bus not available for clearing highlights");
    return;
  }

  eventBus.dispatch("findbarclose", { source: null });
  currentHighlightedSentence = null;
}

async function highlightCurrentlyReadSentence({
  pdfViewer,
  sentenceText,
}: {
  pdfViewer: PDFViewer;
  sentenceText: string;
}): Promise<void> {
  clearSentenceHighlight();
  console.log("Highlighting original text:", sentenceText);

  const currentPageIndex = pdfViewer.currentPageNumber - 1;
  const pageView = (pdfViewer as any)._pages?.[currentPageIndex];

  if (!pageView?.textLayer?.div) {
    console.warn("Text layer not available for highlighting");
    return;
  }

  const eventBus = (window as any).PDFViewerApplication?.eventBus;
  if (!eventBus) {
    console.warn("Event bus not available");
    return;
  }
  console.log("Dispatching a find event to trigger text extraction...");
  eventBus.dispatch("find", {
    source: null,
    type: "highlightallchange", // Use this type to avoid search UI changes
    query: sentenceText,
    caseSensitive: false,
    entireWord: false,
    highlightAll: true,
    findPrevious: false,
    matchDiacritics: false,
  });

  const findController = (window as any).PDFViewerApplication?.findController;
  if (!findController) {
    console.warn("Find controller not available");
    return;
  }
  findController._scrollMatches = false; // Disable automatic scrolling to prevent horizontal jumping

  async function waitForMatches(): Promise<void> {
    return new Promise(resolve => {
      const checkForResults = () => {
        const matchStartPositions =
          findController._pageMatches[currentPageIndex]; // Start positions of each match
        const matchLengths =
          findController._pageMatchesLength[currentPageIndex]; // Length of each match

        if (matchStartPositions && matchLengths) {
          const matchCount = matchStartPositions.length;
          console.log(
            "Text extraction completed, found",
            matchCount,
            "match(es) for sentence"
          );

          if (matchCount > 0) {
            console.log(
              "Match at position:",
              matchStartPositions[0],
              "length:",
              matchLengths[0]
            );

            currentHighlightedSentence = sentenceText;
          } else {
            console.warn("No matches found for sentence:", sentenceText);
          }
          resolve();
        } else {
          console.log("Text extraction in progress, checking again...");
          setTimeout(checkForResults, 100);
        }
      };
      checkForResults();
    });
  }

  await waitForMatches();
  // Highlighting is now complete (or no matches found)
}

function highlightCurrentlyReadWord(
  audioItem: AudioWithWordTimings,
  sentenceWords: WordLocationData[]
): Timer {
  const words = audioItem.transcription.words;
  if (!words || words.length === 0) {
    console.warn("No word-level timestamps available");
    // Return a dummy timer that does nothing
    const dummyTimer = new Timer();
    return dummyTimer;
  }

  console.log(
    "🔧 [DEBUG] Starting word tracking for:",
    audioItem.originalSentenceText
  );
  console.log(
    "🔧 [DEBUG] Audio words:",
    words.map(w => ({ word: w.word, start: w.start, end: w.end }))
  );
  console.log(
    "🔧 [DEBUG] PDF words from map:",
    sentenceWords.map((w, i) => ({
      index: i,
      word: w.word,
      position: w.matchStartPosition,
      page: w.pageIndex,
    }))
  );

  // Create the main thread timer
  console.log("🔧 [DEBUG] Creating main thread timer...");
  const wordTimer = new Timer();
  wordTimer.start();

  let currentWordIndex = 0;

  // Track which PDF words have been used to avoid duplicates
  const usedPdfWordIndices = new Set<number>();

  const checkCurrentWord = () => {
    if (!wordTimer.isRunning()) {
      return; // Timer was stopped
    }

    if (currentWordIndex >= words.length) {
      return; // All words processed
    }

    const currentWord = words[currentWordIndex];

    // Check if it's time for this word
    if (wordTimer.hasTimeStampPassed(currentWord.start)) {
      if (sentenceWords.length > 0) {
        // Find the matching PDF word for this audio word
        const matchingPdfWord = findMatchingPdfWord(
          currentWord.word,
          sentenceWords,
          usedPdfWordIndices
        );

        if (matchingPdfWord) {
          console.log(
            `🎯 [DEBUG] Audio word "${currentWord.word}" → PDF word "${matchingPdfWord.word}" at position ${matchingPdfWord.matchStartPosition} (index ${matchingPdfWord.index})`
          );

          highlightWordInPdf(matchingPdfWord);
          usedPdfWordIndices.add(matchingPdfWord.index);
        } else {
          console.warn(
            `⚠️ [DEBUG] Could not find matching PDF word for audio word "${currentWord.word}"`
          );
        }
      } else {
        // Fallback to logging only
        console.log(
          `📖 [DEBUG] Currently reading word: "${currentWord.word}" at ${currentWord.start}s (no PDF words available)`
        );
      }
      currentWordIndex++;
    }

    // Continue checking for the next word
    if (currentWordIndex < words.length) {
      setTimeout(checkCurrentWord, 10); // Check every 10ms for responsive timing
    }
  };

  // Start the word tracking loop
  console.log("🔧 [DEBUG] Starting word tracking loop...");
  checkCurrentWord();

  return wordTimer;
}

function findMatchingPdfWord(
  audioWord: string,
  sentenceWords: WordLocationData[],
  usedIndices: Set<number>
): (WordLocationData & { index: number }) | null {
  console.log(
    `🔍 [DEBUG] Looking for PDF word matching audio word "${audioWord}"`
  );

  // Normalize the audio word for comparison
  const normalizedAudioWord = audioWord.toLowerCase().replace(/[^\w]/g, "");

  // Find all PDF words that match this audio word
  const candidates: (WordLocationData & { index: number })[] = [];

  for (let i = 0; i < sentenceWords.length; i++) {
    if (usedIndices.has(i)) {
      continue; // Skip already used words
    }

    const pdfWord = sentenceWords[i];
    const normalizedPdfWord = pdfWord.word.toLowerCase().replace(/[^\w]/g, "");

    if (normalizedPdfWord === normalizedAudioWord) {
      candidates.push({ ...pdfWord, index: i });
    }
  }

  console.log(
    `🔍 [DEBUG] Found ${candidates.length} unused candidates for "${audioWord}":`,
    candidates.map(
      c => `"${c.word}" at position ${c.matchStartPosition} (index ${c.index})`
    )
  );

  if (candidates.length === 0) {
    return null;
  }

  // For now, return the first unused candidate
  // In the future, we could use more sophisticated matching (position-based, etc.)
  const selected = candidates[0];
  console.log(
    `✅ [DEBUG] Selected PDF word "${selected.word}" at position ${selected.matchStartPosition} (index ${selected.index})`
  );

  return selected;
}

function findSentenceInWordMap(
  sentenceText: string,
  wordMap: WordMap
): EnrichedSentence | null {
  console.log(`🔍 [DEBUG] Looking for sentence in WordMap: "${sentenceText}"`);

  for (const section of wordMap.sections) {
    for (const sentence of section.sentences) {
      if (sentence.sentenceText === sentenceText) {
        console.log(
          `✅ [DEBUG] Found sentence with ${sentence.words.length} words:`
        );
        sentence.words.forEach((word, i) => {
          console.log(
            `  ${i + 1}. "${word.word}" at position ${word.matchStartPosition} on page ${word.pageIndex}`
          );
        });
        return sentence;
      }
    }
  }

  console.warn(
    `❌ [DEBUG] Sentence not found in WordMap. Available sentences:`
  );
  wordMap.sections.forEach((section, sectionIndex) => {
    section.sentences.forEach((sentence, sentenceIndex) => {
      console.log(
        `  ${sectionIndex}.${sentenceIndex}: "${sentence.sentenceText}"`
      );
    });
  });

  return null;
}

function highlightWordInPdf(word: WordLocationData): void {
  console.log(
    `🎨 [DEBUG] Highlighting word from map: "${word.word}" at position ${word.matchStartPosition} on page ${word.pageIndex}`
  );

  try {
    const eventBus = (window as any).PDFViewerApplication?.eventBus;
    const findController = (window as any).PDFViewerApplication?.findController;

    if (!eventBus || !findController) {
      console.warn("PDF.js components not available for highlighting");
      return;
    }

    // Enable scrolling for traversal (we want to follow the reading)
    findController._scrollMatches = true;

    // Clear any existing highlights
    eventBus.dispatch("findbarclose", { source: null });

    // Highlight this specific word (EXACTLY like the working traverser)
    eventBus.dispatch("find", {
      source: null,
      type: "highlightallchange",
      query: word.word,
      caseSensitive: false,
      entireWord: true,
      highlightAll: false, // Only highlight one occurrence
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

            // Update the display to highlight this match
            findController._eventBus.dispatch("updatetextlayermatches", {
              source: findController,
              pageIndex: word.pageIndex,
            });

            console.log(
              `✨ [DEBUG] Successfully highlighted ONLY "${word.word}" at exact position ${word.matchStartPosition} (match ${matchIndex})`
            );
          } else {
            console.warn(
              `❌ [DEBUG] Could not find match for position ${word.matchStartPosition}. Available positions:`,
              pageMatches
            );
          }
        } else {
          console.warn(
            `❌ [DEBUG] No matches found for "${word.word}" on page ${word.pageIndex}`
          );
        }
      } catch (error) {
        console.warn("Error setting specific word highlight:", error);
      }
    }, 100);
  } catch (error) {
    console.warn("Error highlighting word:", error);
  }
}

function clearWordMapHighlights(): void {
  try {
    const eventBus = (window as any).PDFViewerApplication?.eventBus;
    const findController = (window as any).PDFViewerApplication?.findController;

    if (eventBus && findController) {
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
