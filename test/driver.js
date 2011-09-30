/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

/*
 * A Test Driver for PDF.js
 */

'use strict';

var appPath, browser, canvas, currentTaskIdx, manifest, stdout;
var inFlightRequests = 0;

function queryParams() {
  var qs = window.location.search.substring(1);
  var kvs = qs.split('&');
  var params = { };
  for (var i = 0; i < kvs.length; ++i) {
    var kv = kvs[i].split('=');
    params[unescape(kv[0])] = unescape(kv[1]);
  }
  return params;
}

function load() {
  var params = queryParams();
  browser = params.browser;
  var manifestFile = params.manifestFile;
  appPath = params.path;

  canvas = document.createElement('canvas');
  canvas.mozOpaque = true;
  stdout = document.getElementById('stdout');

  log('load...\n');

  log('Harness thinks this browser is "' + browser + '" with path "' +
      appPath + '"\n');
  log('Fetching manifest "' + manifestFile + '"... ');

  var r = new XMLHttpRequest();
  r.open('GET', manifestFile, false);
  r.onreadystatechange = function loadOnreadystatechange(e) {
    if (r.readyState == 4) {
      log('done\n');
      manifest = JSON.parse(r.responseText);
      currentTaskIdx = 0;
      nextTask();
    }
  };
  r.send(null);
}

function cleanup() {
  var styleSheet = document.styleSheets[0];
  if (styleSheet) {
    while (styleSheet.cssRules.length > 0)
      styleSheet.deleteRule(0);
  }
  var guard = document.getElementById('content-end');
  var body = document.body;
  while (body.lastChild !== guard)
    body.removeChild(body.lastChild);
}

function nextTask() {
  cleanup();

  if (currentTaskIdx == manifest.length) {
    return done();
  }
  var task = manifest[currentTaskIdx];
  task.round = 0;

  log('Loading file "' + task.file + '"\n');

  getPdf(task.file, function nextTaskGetPdf(data) {
    var failure;
    try {
      task.pdfDoc = new PDFDoc(data);
    } catch (e) {
      failure = 'load PDF doc : ' + e.toString();
    }
    task.pageNum = 1;
    nextPage(task, failure);
  });
}

function isLastPage(task) {
  return task.pageNum > task.pdfDoc.numPages || task.pageNum > task.pageLimit;
}

function canvasToDataURL() {
  return canvas.toDataURL('image/png');
}

function nextPage(task, loadError) {
  var failure = loadError || '';

  if (!task.pdfDoc) {
    sendTaskResult(canvasToDataURL(), task, failure);
    log('done' + (failure ? ' (failed !: ' + failure + ')' : '') + '\n');
    ++currentTaskIdx;
    nextTask();
    return;
  }

  if (isLastPage(task)) {
    if (++task.round < task.rounds) {
      log(' Round ' + (1 + task.round) + '\n');
      task.pageNum = 1;
    } else {
      ++currentTaskIdx;
      nextTask();
      return;
    }
  }

  if (task.skipPages && task.skipPages.indexOf(task.pageNum) >= 0) {
    log(' skipping page ' + task.pageNum + '/' + task.pdfDoc.numPages +
        '... ');
    snapshotCurrentPage(task, '');
    return;
  }

  var page = null;

  if (!failure) {
    try {
      log(' loading page ' + task.pageNum + '/' + task.pdfDoc.numPages +
          '... ');
      var ctx = canvas.getContext('2d');
      page = task.pdfDoc.getPage(task.pageNum);

      var pdfToCssUnitsCoef = 96.0 / 72.0;
      // using mediaBox for the canvas size
      var pageWidth = page.width;
      var pageHeight = page.height;
      canvas.width = pageWidth * pdfToCssUnitsCoef;
      canvas.height = pageHeight * pdfToCssUnitsCoef;
      clear(ctx);

      page.startRendering(
        ctx,
        function nextPageStartRendering(e) {
          snapshotCurrentPage(task, (!failure && e) ?
            ('render : ' + e) : failure);
        }
      );
    } catch (e) {
      failure = 'page setup : ' + e.toString();
    }
  }

  if (failure) {
    // Skip right to snapshotting if there was a failure, since the
    // fonts might be in an inconsistent state.
    snapshotCurrentPage(task, failure);
  }
}

function snapshotCurrentPage(task, failure) {
  log('done, snapshotting... ');

  sendTaskResult(canvasToDataURL(), task, failure);
  log('done' + (failure ? ' (failed !: ' + failure + ')' : '') + '\n');

  // Set up the next request
  var backoff = (inFlightRequests > 0) ? inFlightRequests * 10 : 0;
  setTimeout(
    function snapshotCurrentPageSetTimeout() {
      ++task.pageNum;
      nextPage(task);
    },
    backoff
  );
}

function sendQuitRequest() {
  var r = new XMLHttpRequest();
  r.open('POST', '/tellMeToQuit?path=' + escape(appPath), false);
  r.send('');
}

function quitApp() {
  log('Done !');
  document.body.innerHTML = 'Tests are finished. <h1>CLOSE ME!</h1>' +
                             document.body.innerHTML;
  if (window.SpecialPowers) {
    SpecialPowers.quitApplication();
  } else {
    sendQuitRequest();
    window.close();
  }
}

function done() {
  if (inFlightRequests > 0) {
    document.getElementById('inFlightCount').innerHTML = inFlightRequests;
    setTimeout(done, 100);
  } else {
    setTimeout(quitApp, 100);
  }
}

function sendTaskResult(snapshot, task, failure) {
  var result = { browser: browser,
                 id: task.id,
                 numPages: task.pdfDoc ? (task.pageLimit || task.pdfDoc.numPages) : 0,
                 failure: failure,
                 file: task.file,
                 round: task.round,
                 page: task.pageNum,
                 snapshot: snapshot };

  var r = new XMLHttpRequest();
  // (The POST URI is ignored atm.)
  r.open('POST', '/submit_task_results', true);
  r.setRequestHeader('Content-Type', 'application/json');
  r.onreadystatechange = function sendTaskResultOnreadystatechange(e) {
    if (r.readyState == 4) {
      inFlightRequests--;
    }
  };
  document.getElementById('inFlightCount').innerHTML = inFlightRequests++;
  r.send(JSON.stringify(result));
}

function clear(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgb(255, 255, 255)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

/* Auto-scroll if the scrollbar is near the bottom, otherwise do nothing. */
function checkScrolling() {
  if ((stdout.scrollHeight - stdout.scrollTop) <= stdout.offsetHeight) {
    stdout.scrollTop = stdout.scrollHeight;
  }
}

function log(str) {
  if (stdout.insertAdjacentHTML)
    stdout.insertAdjacentHTML('BeforeEnd', str);
  else
    stdout.innerHTML += str;

  if (str.lastIndexOf('\n') >= 0)
    checkScrolling();
}
