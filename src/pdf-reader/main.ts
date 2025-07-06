import { referenceCurrentDocument } from "./reference-current-pdf";
import { getCurrentPageAsImage } from "./get-current-page-as-image";
import { analyzePageStructure } from "./analyze-page-structure";

async function runAnalysisPipeline() {
  try {
    console.log("🔄 Starting analysis pipeline...");
    const pdf = await referenceCurrentDocument();
    const imageFile = await getCurrentPageAsImage(pdf);
    const pageStructure = await analyzePageStructure(imageFile);
    console.log("📊 Analysis complete:", pageStructure);
  } catch (error) {
    console.error("❌ Analysis failed:", error);
  }
}

function setupDocumentListener() {
  const eventBus = window.PDFViewerApplication?.eventBus;

  if (eventBus) {
    eventBus._on("documentloaded", () => {
      console.log("📄 New PDF loaded - running analysis...");
      // Small delay to ensure PDF.js is fully ready
      setTimeout(runAnalysisPipeline, 100);
    });
    console.log("👂 Document listener set up");
  } else {
    console.warn("⚠️ EventBus not available, trying fallback...");
    // Fallback: try again after a delay
    setTimeout(setupDocumentListener, 1000);
  }
}

// Set up listener once when module loads
setupDocumentListener();

export {};
