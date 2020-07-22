import { getDocument } from "pdfjs-dist";

class MainTest {
  task: ReturnType<typeof getDocument> | undefined;

  constructor(public file: string) {
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
