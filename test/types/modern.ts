import { getDocument } from "pdfjs-dist";
import { EventBus } from "pdfjs-dist/web/pdf_viewer.mjs";

class MainTest {
  eventBus: EventBus;
  task: ReturnType<typeof getDocument> | undefined;

  constructor(public file: string) {
    this.eventBus = new EventBus();
  }

  loadPdf() {
    this.task = getDocument("file://" + this.file);
    return this.task.promise;
  }
}

// This is actually never called, as the test only consists in compiling the file.
// The compilation will crawl through all files and make sure that the types are consistent.
const mt = new MainTest("../pdfs/basicapi.pdf");
mt.loadPdf().then(() => {
  console.log("loaded");
});
