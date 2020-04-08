import { BaseViewerMock } from "./test_utils.js";
import { PDFLinkService } from "../../web/pdf_link_service.js";

// Test cases for setHash function: URL fragment identifiers
describe("setHash", function() {
  // // should it be pdflinkservice?
  // it("FitR：Not enough parameters for FitR", function(done) {
  //   expect("TODO".toEquals("NULL"));
  // });
  var pdfLinkService;
  var pdfViewer;
  beforeAll(function(done) {
    pdfViewer = new BaseViewerMock([]);
    pdfLinkService = new PDFLinkService({
      eventBus: null,
    });
    pdfLinkService.setViewer(pdfViewer);
    done();
  });

  afterAll(function() {
    pdfViewer = null;
    pdfLinkService = null;
  });

  it("Fit parameter, mock class should get called", function(done) {
    // Set up PDFLinkService using the mock class
    pdfLinkService.setHash("page=2&view=FitV,100");
    expect(pdfViewer.getUsed()).toEqual(1);
    // Reset the mock object
    pdfViewer.reset();
    done();

    // Set up PDFLinkService using the mock class
    pdfLinkService.setHash("page=2&view=Fit");
    expect(pdfViewer.getUsed()).toEqual(1);
    // Reset the mock object
    pdfViewer.reset();
    done();

    // Repeat the steps
    // to check if mock object got reset
    pdfLinkService.setHash("view=FitH");
    expect(pdfViewer.getUsed()).toEqual(1);
    pdfViewer.reset();
    done();

    pdfLinkService.setHash("page=2&view=FitH,975");
    expect(pdfViewer.getUsed()).toEqual(1);
    pdfViewer.reset();
    done();
  });

  it("Fit parameter, the right fit is used", function(done) {
    // Set up PDFLinkService using the mock class
    pdfLinkService.setHash("page=2&view=FitV,100");
    expect(pdfViewer.getName()).toEqual("FitV");
    // Reset the mock object
    pdfViewer.reset();
    done();

    // Repeat the steps
    // to check if mock object got reset
    pdfLinkService.setHash("view=FitH");
    expect(pdfViewer.getName()).toEqual("FitH");
    pdfViewer.reset();
    done();

    pdfLinkService.setHash("page=2&view=FitH,975");
    expect(pdfViewer.getName()).toEqual("FitH");
    pdfViewer.reset();
    done();

    pdfLinkService.setHash("page=2&view=Fit");
    expect(pdfViewer.getName()).toEqual("Fit");
    pdfViewer.reset();
    done();
  });

  it("Fit parameter, The coordinate should be used correctly if given", function(done) {
    pdfLinkService.setHash("page=2&view=FitV,100");
    expect(pdfViewer.getX()).toEqual(100);
    // Reset the mock object
    pdfViewer.reset();
    done();

    pdfLinkService.setHash("view=FitH");
    expect(pdfViewer.getName()).toEqual("FitH");
    expect(pdfViewer.getX()).toEqual(0);
    pdfViewer.reset();
    done();

    pdfLinkService.setHash("page=2&view=FitH,0");
    expect(pdfViewer.getName()).toEqual("FitH");
    expect(pdfViewer.getX()).toEqual(0);
    pdfViewer.reset();
    done();
  });
});
