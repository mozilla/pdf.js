import { referenceCurrentDocument } from "./reference-current-pdf";
import { getCurrentPageAsImage } from "./get-current-page-as-image";
import { analyzePageStructure } from "./analyze-page-structure";
import { prepareAudioForFirstSection } from "./prepare-audio-for-first-section";
import {
  enableReadButton,
  resetReadButton,
  resetLatestAudioData,
} from "./dom-handlers";

async function runReadingPreparation(sessionId: number) {
  try {
    const pdf = await referenceCurrentDocument();
    const imageFile = await getCurrentPageAsImage(pdf);
    const pageStructure = await analyzePageStructure(imageFile);
    console.log("Reading preparation complete:", pageStructure);

    const audioForFirstSection =
      await prepareAudioForFirstSection(pageStructure);

    if (audioForFirstSection) {
      console.log("Audio for first section prepared:", audioForFirstSection);
      enableReadButton(audioForFirstSection, sessionId);
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
