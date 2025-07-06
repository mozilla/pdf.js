import { AudioWithWordTimings } from "./generate-audio-with-word-timings";

let latestAudioData: AudioWithWordTimings[] | null = null;
let currentSessionId = 0;

async function playAudio(audioItem: AudioWithWordTimings): Promise<void> {
  try {
    // Fallback to webkit for older browsers
    const audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();

    const decodedBuffer = await audioContext.decodeAudioData(
      audioItem.audioBuffer
    );

    const source = audioContext.createBufferSource();
    source.buffer = decodedBuffer;

    source.connect(audioContext.destination);

    console.log("Playing audio:", audioItem.transcription.text);

    // Wait for audio to finish playing
    return new Promise<void>(resolve => {
      source.onended = () => resolve();
      source.start();
    });
  } catch (error) {
    console.error("Error playing audio:", error);
    throw error;
  }
}

async function readSentences(): Promise<void> {
  if (!latestAudioData || latestAudioData.length === 0) {
    console.error("No audio data available");
    return;
  }

  for (const audioItem of latestAudioData) {
    await playAudio(audioItem);
  }
}

export function enableReadButton(
  audioData: AudioWithWordTimings[],
  sessionId: number
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
    // Store the latest audio data
    latestAudioData = audioData;

    readButton.disabled = false;
    readButton.onclick = () => {
      readSentences();
    };
  }
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
}

// Make the function globally available for HTML onclick handler
declare global {
  interface Window {
    onReadButtonClick: () => void;
  }
}
