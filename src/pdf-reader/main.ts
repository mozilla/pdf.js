import { referenceCurrentDocument } from "./reference-current-pdf";
import { getCurrentPageAsImage } from "./get-current-page-as-image";
import { analyzePageStructure } from "./analyze-page-structure";
import { prepareAudioForFirstSection } from "./prepare-audio-for-first-section";
import { onReadButtonClick, enableReadButton } from "./dom-handlers";

async function runReadingPreparation() {
  try {
    const pdf = await referenceCurrentDocument();
    const imageFile = await getCurrentPageAsImage(pdf);
    const pageStructure = await analyzePageStructure(imageFile);
    console.log("Reading preparation complete:", pageStructure);

    const audioForFirstSection =
      await prepareAudioForFirstSection(pageStructure);

    if (audioForFirstSection) {
      console.log("Audio for first section prepared:", audioForFirstSection);

      enableReadButton();
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
      // Small delay to ensure PDF.js is fully ready
      setTimeout(runReadingPreparation, 100);
    });
  } else {
    console.warn("EventBus not available, trying fallback...");
    // Fallback: try again after a delay
    setTimeout(waitForPDFToLoad, 1000);
  }
}

// Set up listener once when module loads
waitForPDFToLoad();

// Assign to window object so it's accessible from HTML
window.onReadButtonClick = onReadButtonClick;

export {};
