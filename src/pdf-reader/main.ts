import { referenceCurrentDocument } from "./reference-current-pdf";
import { getCurrentPageAsImage } from "./get-current-page-as-image";
import { analyzePageStructure } from "./analyze-page-structure";
import { buildWordMap, testFindWordLocation } from "./build-word-map";
import { prepareAudioForSentences } from "./prepare-audio-for-sentences";
import { enableReadButton, resetReadButton } from "./dom-handlers";
import {
  setLatestAudioData,
  resetLatestAudioData,
  readSentences,
  clearSentenceHighlight,
  areSameSessions,
} from "./state";

async function runReadingPreparation(sessionId: number) {
  try {
    const { getCurrentPage, pdfDocument, getTitle, pdfViewer } =
      await referenceCurrentDocument();

    const imageFile = await getCurrentPageAsImage({
      getCurrentPage,
      pdfDocument,
      getTitle,
    });

    const pageStructure = await analyzePageStructure(imageFile);
    console.log("Reading preparation complete:", pageStructure);

    const wordMap = await buildWordMap(pageStructure, pdfViewer);
    console.log("Word map built:", wordMap);

    // Make wordMap available globally for testing
    (window as any).wordMap = wordMap;
    console.log(
      "🧪 WordMap traverser available! Use: wordMap.traverse() in console"
    );

    const {
      sections: [firstSection, ...restOfTheSections],
    } = pageStructure;

    const audioForFirstSection = await prepareAudioForSentences({
      sentences: firstSection.sentences,
      fixtureKey: "audioForFirstSection",
    });

    if (audioForFirstSection) {
      console.log("Audio for first section prepared:", audioForFirstSection);

      setLatestAudioData(audioForFirstSection);
      enableReadButton({
        shouldEnable: () => areSameSessions(sessionId),
        onClick: async () => {
          await prepareAudioForTheRestOfTheSections();
          await readSentences(pdfViewer);
        },
      });

      async function prepareAudioForTheRestOfTheSections() {
        // Start preparing audio for the rest of the sections in parallel
        const audioForTheRestOfTheSectionsPromise = prepareAudioForSentences({
          sentences: restOfTheSections.flatMap(section => section.sentences),
          fixtureKey: "audioForRestOfSections",
        });

        // Start reading the first section immediately
        await readSentences(pdfViewer);

        // Wait for the rest of the sections to be prepared
        const audioForTheRestOfTheSections =
          await audioForTheRestOfTheSectionsPromise;

        if (!audioForTheRestOfTheSections) {
          console.error("No audio for the rest of the sections");
          return;
        }

        console.log(
          "Audio for the rest of the sections prepared:",
          audioForTheRestOfTheSections
        );
        setLatestAudioData(audioForTheRestOfTheSections);
      }
    }
  } catch (error) {
    console.error("Analysis failed:", error);
  }
}

function waitForPDFToLoad() {
  const eventBus = window.PDFViewerApplication?.eventBus;

  if (eventBus) {
    eventBus._on("documentloaded", () => {
      console.log("📄 New PDF loaded - running reading preparation...");
      resetReadButton();
      clearSentenceHighlight();

      const sessionId = resetLatestAudioData();
      // Small delay to ensure PDF.js is fully ready
      setTimeout(() => runReadingPreparation(sessionId), 100);
    });
  } else {
    console.warn("EventBus not available, trying fallback...");
    // Fallback: try again after a delay
    setTimeout(waitForPDFToLoad, 1000);
  }
}

waitForPDFToLoad();

// Make test function available globally for console testing
(window as any).testWordLocation = testFindWordLocation;
console.log(
  "🧪 Word location testing available! Use: testWordLocation('your-word') or testWordLocation('your-word', wordMap) in console"
);

export {};
