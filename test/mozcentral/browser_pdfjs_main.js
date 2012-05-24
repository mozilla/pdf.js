/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

const RELATIVE_DIR = "browser/extensions/pdfjs/test/";
const TESTROOT = "http://example.com/browser/" + RELATIVE_DIR;

function test() {
  var tab;

  waitForExplicitFinish();
  registerCleanupFunction(function() {
    gBrowser.removeTab(tab);
  });

  tab = gBrowser.addTab(TESTROOT + "file_pdfjs_test.pdf");
  var newTabBrowser = gBrowser.getBrowserForTab(tab);
  newTabBrowser.addEventListener("load", function eventHandler() {
    newTabBrowser.removeEventListener("load", eventHandler, true);

    var document = newTabBrowser.contentDocument,
        window = newTabBrowser.contentWindow;

    waitForElement(document, 'canvas#page1', function(err, page1) {
      runTests(document, window);
    });
  }, true);
}

function runTests(document, window) {
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
  waitForElement(document, 'canvas#thumbnail2', function(error, thumbnail) {
    if (error)
      finish();

    //
    // Page change from thumbnail click
    //
    var pageNumber = document.querySelector('input#pageNumber');
    is(parseInt(pageNumber.value), 1, 'initial page is 1');

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
  
    finish();
  });
}
