async function playAudio(audioItem: any): Promise<void> {
  try {
    console.log("Read button clicked!");

    // Fallback to webkit for older browsers
    const audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();

    const decodedBuffer = await audioContext.decodeAudioData(
      audioItem.audioBuffer
    );

    const source = audioContext.createBufferSource();
    source.buffer = decodedBuffer;

    source.connect(audioContext.destination);
    source.start();

    console.log("Playing audio:", audioItem.transcription.text);
    console.log("Duration:", audioItem.transcription.duration, "seconds");
  } catch (error) {
    console.error("Error playing audio:", error);
  }
}

export function enableReadButton(audioData: any[]): void {
  const readButton = document.getElementById("readButton") as HTMLButtonElement;
  if (readButton && audioData && audioData.length > 0) {
    readButton.disabled = false;

    readButton.onclick = () => playAudio(audioData[0]);
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
