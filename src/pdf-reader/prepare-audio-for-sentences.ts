import { generateAudioWithWordTimings } from "./generate-audio-with-word-timings";

export async function prepareAudioForSentences(
  sentences: Array<{ sentenceText: string; continuesOnNextPage: boolean }>
) {
  if (!sentences || sentences.length === 0) {
    return null;
  }

  return Promise.all(
    sentences.map(async sentence => {
      const audio = await generateAudioWithWordTimings(sentence.sentenceText);
      return audio;
    })
  );
}
