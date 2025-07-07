import { type AudioWithWordTimings } from "./generate-audio-with-word-timings";

export async function playAudio({
  audioItem,
  onEnd,
}: {
  audioItem: AudioWithWordTimings;
  onEnd: () => void;
}): Promise<void> {
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
        onEnd();
        resolve();
      };
      source.start();
    });
  } catch (error) {
    console.error("Error playing audio:", error);
    throw error;
  }
}
