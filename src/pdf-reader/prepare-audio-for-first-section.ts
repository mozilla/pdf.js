import { PageStructureSchema } from "./analyze-page-structure";
import { generateAudioWithWordTimings } from "./generate-audio-with-word-timings";

export async function prepareAudioForFirstSection(
  pageStructure: PageStructureSchema
) {
  const sentencesInFirstSection = pageStructure.sections[0].sentences.map(
    sentence => sentence.sentenceText
  );

  return Promise.all(
    sentencesInFirstSection.map(async sentence => {
      const audio = await generateAudioWithWordTimings(sentence);
      return audio;
    })
  );
}
