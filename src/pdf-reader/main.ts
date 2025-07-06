import { referenceCurrentDocument } from "./reference-current-pdf";
import { getCurrentPageAsImage } from "./get-current-page-as-image";
import { analyzePageStructure } from "./analyze-page-structure";
import { prepareAudioForSentences } from "./prepare-audio-for-sentences";
import {
  enableReadButton,
  resetReadButton,
  setLatestAudioData,
  resetLatestAudioData,
  readSentences,
} from "./dom-handlers";

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

    const {
      sections: [firstSection, ...restOfTheSections],
    } = pageStructure;

    const audioForFirstSection = await prepareAudioForSentences(
      firstSection.sentences
    );

    if (audioForFirstSection) {
      console.log("Audio for first section prepared:", audioForFirstSection);

      enableReadButton(audioForFirstSection, sessionId, async () => {
        // Start preparing audio for the rest of the sections in parallel
        const audioForTheRestOfTheSectionsPromise = prepareAudioForSentences(
          restOfTheSections.flatMap(section => section.sentences)
        );

        // Start reading the first section immediately
        await readSentences(pdfViewer);

        // Wait for the rest of the sections to be prepared
        const audioForTheRestOfTheSections =
          await audioForTheRestOfTheSectionsPromise;

        if (audioForTheRestOfTheSections) {
          console.log(
            "Audio for the rest of the sections prepared:",
            audioForTheRestOfTheSections
          );
          setLatestAudioData(audioForTheRestOfTheSections);

          await readSentences(pdfViewer);
        }
      });
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

export {};
