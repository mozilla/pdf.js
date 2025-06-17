/* PDF.js Annotation Events Sandbox - Configuration */

// Import PDF.js as an ES module
import * as pdfjsLib from "../../../build/generic/build/pdf.mjs";

// Configure PDF.js worker with the correct path
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "../../../build/generic/build/pdf.worker.mjs";

// Default PDF URL - can be changed by the user
const DEFAULT_PDF_URL = "../../../web/compressed.tracemonkey-pldi-09.pdf";

// Export configuration
export { pdfjsLib, DEFAULT_PDF_URL };
