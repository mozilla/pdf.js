import {
  referenceCurrentDocument,
  getCurrentPageAsImageFile,
} from "./reference-current-pdf";
import { analyzePageStructure } from "./analyze-page-structure";

async function main() {
  const pdf = await referenceCurrentDocument();
  const imageFile = await getCurrentPageAsImageFile(pdf);
  const pageStructure = await analyzePageStructure(imageFile);
  console.log(pageStructure);
}

main().catch(console.error);

export {};
