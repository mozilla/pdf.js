import { AudioWithWordTimings } from "../generate-audio-with-word-timings";
import { PageStructureSchema } from "../analyze-page-structure";

export async function saveAudioFixtures(
  audioData: AudioWithWordTimings[],
  filename: string
) {
  try {
    // Convert ArrayBuffers to base64 for storage
    const fixtureData = audioData.map(item => ({
      audioBufferBase64: arrayBufferToBase64(item.audioBuffer),
      transcription: item.transcription,
      originalSentenceText: item.originalSentenceText,
    }));

    // Create the fixture file content
    const fixtureContent = `export const ${filename} = ${JSON.stringify(fixtureData, null, 2)};`;

    console.log(`🔧 Capture mode: Saving ${filename} fixture...`);
    console.log("Fixture content:", fixtureContent);
    console.log(
      "📝 Copy this content to src/pdf-reader/fixtures/" + filename + ".ts"
    );

    // Also save to localStorage for easy retrieval
    localStorage.setItem(`fixture_${filename}`, fixtureContent);
  } catch (error) {
    console.error("Failed to save audio fixtures:", error);
  }
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function loadAudioFixtures(
  fixtureKey: string
): Promise<AudioWithWordTimings[] | null> {
  try {
    let fixtures;

    // Dynamically import the appropriate fixture based on the key
    if (fixtureKey === "audioForFirstSection") {
      const module = await import("./audioForFirstSection");
      fixtures = module.audioForFirstSection;
    } else if (fixtureKey === "audioForRestOfSections") {
      try {
        const module = await import("./audioForRestOfSections");
        fixtures = module.audioForRestOfSections;
      } catch {
        console.warn(`Fixture ${fixtureKey} not found, will use API`);
        return null;
      }
    } else {
      console.warn(`Unknown fixture key: ${fixtureKey}`);
      return null;
    }

    console.log(
      `🔧 Development mode: Using audio fixtures for ${fixtureKey} instead of OpenAI APIs`
    );

    // Convert fixture data to proper AudioWithWordTimings format
    const typedFixtures: AudioWithWordTimings[] = fixtures.map((item: any) => ({
      audioBuffer: item.audioBufferBase64
        ? base64ToArrayBuffer(item.audioBufferBase64)
        : new ArrayBuffer(0),
      transcription: {
        ...item.transcription,
        task: item.transcription.task || "transcribe",
        usage: item.transcription.usage || {
          type: "duration",
          seconds: item.transcription.duration || 0,
        },
      },
      originalSentenceText: item.originalSentenceText,
    }));

    return typedFixtures;
  } catch (error) {
    console.warn(
      `Failed to load audio fixtures for ${fixtureKey}, falling back to OpenAI APIs:`,
      error
    );
    return null;
  }
}

export async function loadCompletionFixtures(
  fixtureKey: string
): Promise<PageStructureSchema | null> {
  try {
    let fixture;

    // Dynamically import the appropriate fixture based on the key
    if (fixtureKey === "analyzePageStructureFixture") {
      const module = await import("./analyzePageStructure");
      fixture = module.analyzePageStructureFixture;
    } else {
      console.warn(`Unknown completion fixture key: ${fixtureKey}`);
      return null;
    }

    console.log(
      `🔧 Development mode: Using completion fixtures for ${fixtureKey} instead of OpenAI APIs`
    );

    return fixture;
  } catch (error) {
    console.warn(
      `Failed to load completion fixtures for ${fixtureKey}, falling back to OpenAI APIs:`,
      error
    );
    return null;
  }
}

export async function saveCompletionFixtures(
  completionData: PageStructureSchema,
  filename: string
) {
  try {
    // Create the fixture file content
    const fixtureContent = `export const ${filename} = ${JSON.stringify(completionData, null, 2)};`;

    console.log(`🔧 Capture mode: Saving ${filename} fixture...`);
    console.log("Fixture content:", fixtureContent);
    console.log(
      "📝 Copy this content to src/pdf-reader/fixtures/" + filename + ".ts"
    );

    // Also save to localStorage for easy retrieval
    localStorage.setItem(`fixture_${filename}`, fixtureContent);
  } catch (error) {
    console.error("Failed to save completion fixtures:", error);
  }
}
