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

  const pdfViewer = window.PDFViewerApplication?.pdfViewer;
  const currentPageNumber = pdfViewer?.currentPageNumber;
  if (!pdfViewer || currentPageNumber === undefined) return;

  const pageIndex = currentPageNumber - 1;
  if (pageIndex < 0) return;

  const pageView = (pdfViewer as any)._pages?.[pageIndex];
  if (!pageView?.textLayer?.div) return;

  const textDivs = pageView.textLayer.div.querySelectorAll(".textLayer > span");
  textDivs.forEach((div: Element) => {
    (div as HTMLElement).classList.remove("highlight", "sentence-highlight");
  });

  currentHighlightedSentence = null;
}

const normalizeText = (text: string): string => {
  return text.trim().replace(/\s+/g, " "); // Only normalize spaces
};

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
  const textDivs = pageView.textLayer.div.querySelectorAll(".textLayer > span");
  if (!textDivs.length) {
    console.warn("No text divs found for highlighting");
    return;
  }
  // Get all text content from the page
  const fullText = Array.from(textDivs as NodeListOf<HTMLElement>)
    .map(div => div.textContent || "")
    .join(" ");

  const normalizedSentence = normalizeText(sentenceText);
  const normalizedFullText = normalizeText(fullText);

  console.log("Normalized sentence:", normalizedSentence);
  console.log(
    "Normalized full text (first 200 chars):",
    normalizedFullText.substring(0, 200) + "..."
  );

  // Try exact match first
  let sentenceStart = normalizedFullText.indexOf(normalizedSentence);
  let sentenceEnd: number;

  if (sentenceStart === -1) {
    console.warn("Exact sentence not found, trying case-insensitive match...");

    // Try case-insensitive match
    const lowerSentence = normalizedSentence.toLowerCase();
    const lowerFullText = normalizedFullText.toLowerCase();
    sentenceStart = lowerFullText.indexOf(lowerSentence);

    if (sentenceStart === -1) {
      console.warn(
        "Case-insensitive match failed. Original text might not match PDF text exactly."
      );
      return;
    } else {
      console.log("Case-insensitive match found at position:", sentenceStart);
      sentenceEnd = sentenceStart + lowerSentence.length;
    }
  } else {
    console.log("Exact match found at position:", sentenceStart);
    sentenceEnd = sentenceStart + normalizedSentence.length;
  }

  // Find which divs contain the sentence
  let currentPos = 0;
  const divsToHighlight: HTMLElement[] = [];

  for (const div of textDivs) {
    const divText = (div as HTMLElement).textContent || "";
    const normalizedDivText = normalizeText(divText);
    const divStart = currentPos;
    const divEnd = currentPos + normalizedDivText.length;

    // Check if this div overlaps with the sentence
    if (divStart < sentenceEnd && divEnd > sentenceStart) {
      divsToHighlight.push(div as HTMLElement);
    }

    currentPos = divEnd + (divText ? 1 : 0); // Add space between divs

    if (currentPos > sentenceEnd) break;
  }

  // Apply highlighting
  divsToHighlight.forEach(div => {
    div.classList.add("highlight", "sentence-highlight");
  });

  currentHighlightedSentence = sentenceText;

  // Scroll the first highlighted div into view
  if (divsToHighlight.length > 0) {
    divsToHighlight[0].scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });
  }
}

// Make the function globally available for HTML onclick handler
declare global {
  interface Window {
    onReadButtonClick: () => void;
  }
}
