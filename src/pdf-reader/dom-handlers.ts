import { AudioWithWordTimings } from "./generate-audio-with-word-timings";

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

async function readSentences(audioData: AudioWithWordTimings[]): Promise<void> {
  for (const audioItem of audioData) {
    await playAudio(audioItem);
  }
}

export function enableReadButton(audioData: AudioWithWordTimings[]): void {
  const readButton = document.getElementById("readButton") as HTMLButtonElement;
  if (readButton && audioData && audioData.length > 0) {
    readButton.disabled = false;

    readButton.onclick = () => {
      readSentences(audioData);
    };
  }
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
