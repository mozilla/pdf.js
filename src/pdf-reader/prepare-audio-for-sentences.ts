import { generateAudioWithWordTimings } from "./generate-audio-with-word-timings";
import { loadAudioFixtures, saveAudioFixtures } from "./fixtures";
import { IS_DEV, CAPTURE_FIXTURES } from "./config";

export async function prepareAudioForSentences({
  sentences,
  fixtureKey,
}: {
  sentences: Array<{ sentenceText: string; continuesOnNextPage: boolean }>;
  fixtureKey?: string;
}) {
  if (!sentences || sentences.length === 0) {
    throw new Error("No sentences to prepare audio for!");
  }

  // In development mode, try to load fixtures first
  if (IS_DEV && fixtureKey) {
    try {
      const fixtures = await loadAudioFixtures(fixtureKey);
      if (fixtures && fixtures.length > 0) {
        return fixtures;
      }
    } catch (error) {
      console.warn(
        `Failed to load fixtures for ${fixtureKey}, falling back to OpenAI:`,
        error
      );
    }
  }

  console.log(`Generating audio for ${sentences.length} sentences...`);
  const audioData = await Promise.all(
    sentences.map(async sentence => {
      const audio = await generateAudioWithWordTimings(sentence.sentenceText);
      return audio;
    })
  );

  // Optionally save the generated audio as fixtures
  if (IS_DEV && CAPTURE_FIXTURES && fixtureKey && audioData) {
    await saveAudioFixtures(audioData, fixtureKey);
  }

  return audioData;
}
