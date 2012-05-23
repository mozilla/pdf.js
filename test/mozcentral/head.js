// Waits for element 'el' to exist in the DOM of 'doc' before executing 'callback'
// Useful when elements are created asynchronously, e.g. after a Web Worker task
function waitForElement(doc, el, callback) {
  var time = 0,
      interval = 10,
      timeout = 5000;

  var checkEl = setInterval(function() {
    if (doc.querySelector(el)) {
      clearInterval(checkEl);
      if (callback) callback();
    }

    time += interval;
    if (time > timeout) {
      ok(false, 'waitForElement timed out on element: '+el);
      clearInterval(checkEl);
      if (callback) callback(true);
    }
  }, interval);
}
