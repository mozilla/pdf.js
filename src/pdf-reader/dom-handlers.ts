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

  // Get the event bus to clear highlights
  const eventBus = (window as any).PDFViewerApplication?.eventBus;
  if (!eventBus) {
    console.warn("Event bus not available for clearing highlights");
    return;
  }

  // Dispatch findbarclose event to clear all highlights
  eventBus.dispatch("findbarclose", { source: null });

  console.log("Cleared sentence highlights using PDF.js find infrastructure");
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

  const findController = (window as any).PDFViewerApplication?.findController;
  const eventBus = (window as any).PDFViewerApplication?.eventBus;

  if (!findController || !eventBus) {
    console.warn("Find controller or event bus not available");
    return;
  }

  const textHighlighter = pageView._textHighlighter;
  if (!textHighlighter) {
    console.warn("Text highlighter not available for this page");
    return;
  }

  console.log("Triggering text extraction via find event...");

  // Dispatch a find event to trigger text extraction (same as search does)
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

  // Wait for the text extraction and matching to complete
  const checkForResults = () => {
    // Check if we have page content and matches for our page
    const pageContent = findController._pageContents[currentPageIndex];
    const pageMatches = findController._pageMatches[currentPageIndex];
    const pageMatchesLength =
      findController._pageMatchesLength[currentPageIndex];

    if (pageContent && pageMatches && pageMatchesLength) {
      console.log("Text extraction completed, page content available");
      console.log(
        "Page content (first 200 chars):",
        pageContent.substring(0, 200) + "..."
      );
      console.log("Found", pageMatches.length, "match(es) for sentence");

      if (pageMatches.length > 0) {
        console.log(
          "Match at position:",
          pageMatches[0],
          "length:",
          pageMatchesLength[0]
        );

        // The TextHighlighter should already be set up with matches by the find controller
        // The highlighting should already be applied by the updatetextlayermatches event
        currentHighlightedSentence = sentenceText;
        console.log(
          "Successfully highlighted sentence using PDF.js find infrastructure"
        );

        // Don't clear the find state here - let it persist until audio ends
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
