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
    // Overall sanity tests
    //
    ok(document.querySelector('div#viewer'), "document content has viewer UI");
    ok('PDFJS' in window.wrappedJSObject, "window content has PDFJS object");

    //
    // Sidebar: open
    //
    var sidebar = document.querySelector('button#sidebarToggle'),
        outerContainer = document.querySelector('div#outerContainer');

    sidebar.click();
    ok(outerContainer.classList.contains('sidebarOpen'), 'sidebar opens on click');

    // Thumbnails are created asynchronously - wait for them
    waitForElement(document, 'canvas#thumbnail2', function(error) {
      if (error)
        finish();

      //
      // Page change from thumbnail click
      //
      var pageNumber = document.querySelector('input#pageNumber');
      is(parseInt(pageNumber.value), 1, 'initial page is 1');

      var thumbnail = document.querySelector('canvas#thumbnail2');
      ok(thumbnail, 'thumbnail2 is available');
      if (thumbnail) {
        thumbnail.click();
        is(parseInt(pageNumber.value), 2, 'clicking on thumbnail changes page');
      }

      //
      // Sidebar: close
      //
      sidebar.click();
      ok(!outerContainer.classList.contains('sidebarOpen'), 'sidebar closes on click');

      //
      // Page change from prev/next buttons
      //
      var prevPage = document.querySelector('button#previous'),
          nextPage = document.querySelector('button#next');

      nextPage.click();
      is(parseInt(pageNumber.value), 2, 'page increases after clicking on next');

      prevPage.click();
      is(parseInt(pageNumber.value), 1, 'page decreases after clicking on previous');

      //
      // Bookmark button
      //
      var viewBookmark = document.querySelector('a#viewBookmark');
      viewBookmark.click();
      ok(viewBookmark.href.length > 0, 'viewBookmark button has href');

      //
      // Zoom in/out
      //
      var zoomOut = document.querySelector('button.zoomOut'),
          zoomIn = document.querySelector('button.zoomIn');

      // Zoom in
      var oldWidth = document.querySelector('canvas#page1').width;
      zoomIn.click();
      var newWidth = document.querySelector('canvas#page1').width;
      ok(oldWidth < newWidth, 'zooming in increases page width (old: '+oldWidth+', new: '+newWidth+')');

      // Zoom out
      var oldWidth = document.querySelector('canvas#page1').width;
      zoomOut.click();
      var newWidth = document.querySelector('canvas#page1').width;
      ok(oldWidth > newWidth, 'zooming out decreases page width (old: '+oldWidth+', new: '+newWidth+')');

      finish();
    });
  }, true, true);

  registerCleanupFunction(function() {
    gBrowser.removeTab(tab);
  });
}
