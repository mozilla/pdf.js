import { AudioWithWordTimings } from "./generate-audio-with-word-timings";
import { type PDFViewer } from "./types";

let latestAudioData: AudioWithWordTimings[] | null = null;
let currentSessionId = 0;
let currentHighlightedSentence: string | null = null;

async function playAudio(audioItem: AudioWithWordTimings): Promise<void> {
  try {
    console.log("Playing audio:", audioItem.transcription.text);

    // Fallback to webkit for older browsers
    const audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();

    const decodedBuffer = await audioContext.decodeAudioData(
      audioItem.audioBuffer
    );

    const source = audioContext.createBufferSource();
    source.buffer = decodedBuffer;

    source.connect(audioContext.destination);

    // Wait for audio to finish playing
    return new Promise<void>(resolve => {
      source.onended = () => {
        clearSentenceHighlight();
        resolve();
      };
      source.start();
    });
  } catch (error) {
    console.error("Error playing audio:", error);
    throw error;
  }
}

export async function readSentences(pdfViewer: PDFViewer): Promise<void> {
  if (!latestAudioData || latestAudioData.length === 0) {
    console.error("No audio data available");
    return;
  }

  for (const audioItem of latestAudioData) {
    highlightCurrentlyReadSentence({
      pdfViewer,
      sentenceText: audioItem.originalSentenceText,
    });

    await playAudio(audioItem);
  }
}

export function enableReadButton(
  audioData: AudioWithWordTimings[],
  sessionId: number,
  onClick: () => void
): void {
  const readButton = document.getElementById("readButton") as HTMLButtonElement;

  if (sessionId !== currentSessionId) {
    console.log(
      "Ignoring audio from old session:",
      sessionId,
      "current:",
      currentSessionId
    );
    return;
  }

  if (readButton && audioData && audioData.length > 0) {
    setLatestAudioData(audioData);

    readButton.disabled = false;
    readButton.onclick = () => {
      onClick();
    };
  }
}

export function setLatestAudioData(audioData: AudioWithWordTimings[]): void {
  latestAudioData = audioData;
}

export function resetLatestAudioData(): number {
  latestAudioData = null;
  currentSessionId++;
  return currentSessionId;
}

export function resetReadButton(): void {
  const readButton = document.getElementById("readButton") as HTMLButtonElement;
  if (readButton) {
    readButton.disabled = true;
    readButton.onclick = null;
  }

  clearSentenceHighlight();
}

function clearSentenceHighlight(): void {
  if (!currentHighlightedSentence) return;

  const eventBus = (window as any).PDFViewerApplication?.eventBus;
  if (!eventBus) {
    console.warn("Event bus not available for clearing highlights");
    return;
  }

  eventBus.dispatch("findbarclose", { source: null });
  currentHighlightedSentence = null;
}

export function highlightCurrentlyReadSentence({
  pdfViewer,
  sentenceText,
}: {
  pdfViewer: PDFViewer;
  sentenceText: string;
}): void {
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

  // Wait for the text extraction and matching to complete
  const checkForResults = () => {
    // Check if we have page content and matches for our page
    const matchStartPositions = findController._pageMatches[currentPageIndex]; // Start positions of each match
    const matchLengths = findController._pageMatchesLength[currentPageIndex]; // Length of each match
    const matchCount = matchStartPositions.length; // Total number of matches found

    if (matchStartPositions && matchLengths && matchCount) {
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
    } else {
      // Text extraction still in progress, check again
      console.log("Text extraction in progress, checking again...");
      setTimeout(checkForResults, 100);
    }
  };

  // Start checking for results
  setTimeout(checkForResults, 50);
}

// Make the function globally available for HTML onclick handler
declare global {
  interface Window {
    onReadButtonClick: () => void;
  }
}
