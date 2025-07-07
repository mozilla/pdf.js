import { playAudio } from "./playAudio";
import { type AudioWithWordTimings } from "./generate-audio-with-word-timings";
import { type PDFViewer } from "./types";
import { Timer } from "./timer";

export async function readSentences(pdfViewer: PDFViewer): Promise<void> {
  if (!latestAudioData || latestAudioData.length === 0) {
    console.error("No audio data available");
    return;
  }

  for (const audioItem of latestAudioData) {
    // await highlightCurrentlyReadSentence({
    //   pdfViewer,
    //   sentenceText: audioItem.originalSentenceText,
    // });

    // Start word tracking with main thread timer
    const wordTimer = highlightCurrentlyReadWord(audioItem);

    await playAudio({
      audioItem,
      onEnd: () => {
        clearSentenceHighlight();
        wordTimer.stop();
      },
    });
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

function highlightCurrentlyReadWord(audioItem: AudioWithWordTimings): Timer {
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
    "🔧 [DEBUG] Available words:",
    words.map(w => ({ word: w.word, start: w.start, end: w.end }))
  );

  // Create the main thread timer
  console.log("🔧 [DEBUG] Creating main thread timer...");
  const wordTimer = new Timer();
  wordTimer.start();

  let currentWordIndex = 0;

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
      console.log(
        `📖 Currently reading word: "${currentWord.word}" at ${currentWord.start}s (elapsed: ${wordTimer.getElapsedSeconds().toFixed(3)}s)`
      );
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
