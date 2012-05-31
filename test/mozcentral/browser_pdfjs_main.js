/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

const RELATIVE_DIR = "browser/extensions/pdfjs/test/";
const TESTROOT = "http://example.com/browser/" + RELATIVE_DIR;

function test() {
  var tab, oldAction;

  oldAction = changeMimeHandler();

    const Cc = Components.classes;
  const Ci = Components.interfaces;
  let handlerService = Cc["@mozilla.org/uriloader/handler-service;1"].getService(Ci.nsIHandlerService);
  let mimeService = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService);
  let handlerInfo = mimeService.getFromTypeAndExtension('application/pdf', 'pdf');

  info('Pref action: ' + handlerInfo.preferredAction);

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

    // Runs tests after all 'load' event handlers have fired off
    setTimeout(function() {
      runTests(document, window, function() {
        revertMimeHandler(oldAction);
        finish();
      });
    }, 0);
  }, true);
}


function changeMimeHandler() {
  let oldAction;

  const Cc = Components.classes;
  const Ci = Components.interfaces;
  let handlerService = Cc["@mozilla.org/uriloader/handler-service;1"].getService(Ci.nsIHandlerService);
  let mimeService = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService);
  let handlerInfo = mimeService.getFromTypeAndExtension('application/pdf', 'pdf');

  oldAction = handlerInfo.preferredAction;

  // Change and save mime handler settings
  handlerInfo.alwaysAskBeforeHandling = false;
  handlerInfo.preferredAction = Ci.nsIHandlerInfo.handleInternally;
  handlerService.store(handlerInfo);

  Services.obs.notifyObservers(null, 'pdfjs:handlerChanged', null);

  // Refresh data
  mimeService = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService);
  handlerInfo = mimeService.getFromTypeAndExtension('application/pdf', 'pdf');

  //
  // Test: Mime handler was updated
  //
  is(handlerInfo.alwaysAskBeforeHandling, false, 'always-ask prompt change successful');
  is(handlerInfo.preferredAction, Ci.nsIHandlerInfo.handleInternally, 'mime handler change successful');

  return oldAction;
}

function revertMimeHandler(oldAction) {
  const Cc = Components.classes;
  const Ci = Components.interfaces;
  let handlerService = Cc["@mozilla.org/uriloader/handler-service;1"].getService(Ci.nsIHandlerService);
  let mimeService = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService);
  let handlerInfo = mimeService.getFromTypeAndExtension('application/pdf', 'pdf');

  // Change and save mime handler settings
  handlerInfo.alwaysAskBeforeHandling = true;
  handlerInfo.preferredAction = oldAction;
  handlerService.store(handlerInfo);
}


function runTests(document, window, callback) {

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

  var pageNumber = document.querySelector('input#pageNumber');
  is(parseInt(pageNumber.value), 1, 'initial page is 1');

  //
  // Bookmark button
  //
  var viewBookmark = document.querySelector('a#viewBookmark');
  viewBookmark.click();
  ok(viewBookmark.href.length > 0, 'viewBookmark button has href');

  callback();
}
