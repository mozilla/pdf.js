import { analyzePageStructure } from "./analyze-page-structure";
import { setupDocumentListener } from "./reference-current-pdf";

console.log("Page analysis:", analyzePageStructure(2));
setupDocumentListener();

export {};
