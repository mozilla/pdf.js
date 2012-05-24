/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

const RELATIVE_DIR = "browser/extensions/pdfjs/test/";
const TESTROOT = "http://example.com/browser/" + RELATIVE_DIR;

function test() {
  waitForExplicitFinish();

  var tab = gBrowser.addTab(TESTROOT + "file_pdfjs_test.pdf");
  var newTabBrowser = gBrowser.getBrowserForTab(tab);
  newTabBrowser.addEventListener("pagechange", function onPageChange() {
    newTabBrowser.removeEventListener("pagechange", onPageChange, true);

    var document = newTabBrowser.contentDocument,
        window = newTabBrowser.contentWindow;

    //
    // Zoom in/out
    //
    var zoomOut = document.querySelector('button.zoomOut'),
        zoomIn = document.querySelector('button.zoomIn');

    var newWidth, oldWidth;

    // We need to query the DOM every time since zoom in/out operations destroy the canvas element
    waitForElement(document, 'canvas#page1', function(error, page1) {
      if (error)
        finish();
      
      oldWidth = page1.width;
      zoomIn.click();

      waitForElement(document, 'canvas#page1', function(error, page1) {
        if (error)
          finish();

        newWidth = page1.width;
        ok(oldWidth < newWidth, 'zooming in increases page width (old: '+oldWidth+', new: '+newWidth+')');

        // Zoom out
        oldWidth = newWidth;
        zoomOut.click();
        
        waitForElement(document, 'canvas#page1', function(error, page1) {
          if (error)
            finish();

          newWidth = page1.width;
          ok(oldWidth > newWidth, 'zooming out decreases page width (old: '+oldWidth+', new: '+newWidth+')');

          finish();
        });
      });
    });

  }, true, true);

  registerCleanupFunction(function() {
    gBrowser.removeTab(tab);
  });
}
