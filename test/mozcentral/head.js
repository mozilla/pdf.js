// Waits for element 'sel' to exist in the DOM of 'doc' before executing 'callback'
// Useful when elements are created asynchronously, e.g. after a Web Worker task
function waitForElement(doc, sel, callback) {
  var time = 0,
      interval = 10,
      timeout = 5000;

  var checkEl = setInterval(function() {
    var el = doc.querySelector(sel);
    if (el) {
      clearInterval(checkEl);
      if (callback) callback(null, el);
    }

    time += interval;
    if (time > timeout) {
      ok(false, 'waitForElement timed out on element: '+sel);
      clearInterval(checkEl);
      if (callback) callback(true);
    }
  }, interval);
}
