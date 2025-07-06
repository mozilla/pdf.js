import { setupDocumentListener } from "./reference-current-pdf";
import { analyzePageStructure } from "./analyze-page-structure";

setupDocumentListener();

analyzePageStructure().then(structure => {
  console.log("Page analysis:", structure);
});

export {};
