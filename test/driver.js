/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

/*
 * A Test Driver for PDF.js
 */

'use strict';

var appPath, browser, canvas, currentTaskIdx, manifest, stdout;

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
  r.onreadystatechange = function(e) {
    if (r.readyState == 4) {
      log('done\n');
      manifest = JSON.parse(r.responseText);
      currentTaskIdx = 0, nextTask();
    }
  };
  r.send(null);
}
window.onload = load;

function nextTask() {
  if (currentTaskIdx == manifest.length) {
    return done();
  }
  var task = manifest[currentTaskIdx];
  task.round = 0;

  log('Loading file "' + task.file + '"\n');

  var r = new XMLHttpRequest();
  r.open('GET', task.file);
  r.mozResponseType = r.responseType = 'arraybuffer';
  r.onreadystatechange = function() {
    var failure;
    if (r.readyState == 4) {
      var data = r.mozResponseArrayBuffer || r.mozResponse ||
        r.responseArrayBuffer || r.response;

      try {
        task.pdfDoc = new PDFDoc(new Stream(data));
      } catch (e) {
        failure = 'load PDF doc : ' + e.toString();
      }

      task.pageNum = 1, nextPage(task, failure);
    }
  };
  r.send(null);
}

function isLastPage(task) {
  return (!task.pdfDoc || (task.pageNum > task.pdfDoc.numPages));
}

function nextPage(task, loadError) {
  if (isLastPage(task)) {
    if (++task.round < task.rounds) {
      log(' Round ' + (1 + task.round) + '\n');
      task.pageNum = 1;
    } else {
      ++currentTaskIdx, nextTask();
      return;
    }
  }

  var failure = loadError || '';

  var ctx = null;
  var page = null;
  if (!failure) {
    try {
      log(' loading page ' + task.pageNum + '/' + task.pdfDoc.numPages +
          '... ');
      ctx = canvas.getContext('2d');
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
        function(e) {
          snapshotCurrentPage(page, task, (!failure && e) ?
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
    snapshotCurrentPage(page, task, failure);
  }
}

function snapshotCurrentPage(page, task, failure) {
  log('done, snapshotting... ');

  sendTaskResult(canvas.toDataURL('image/png'), task, failure);
  log('done' + (failure ? ' (failed !: ' + failure + ')' : '') + '\n');

  // Set up the next request
  var backoff = (inFlightRequests > 0) ? inFlightRequests * 10 : 0;
  setTimeout(
    function() {
      ++task.pageNum, nextPage(task);
    },
    backoff
  );
}

function sendQuitRequest() {
  var r = new XMLHttpRequest();
  r.open('POST', '/tellMeToQuit?path = ' + escape(appPath), false);
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

var inFlightRequests = 0;
function sendTaskResult(snapshot, task, failure) {
  var result = { browser: browser,
                 id: task.id,
                 numPages: task.pdfDoc.numPages,
                 failure: failure,
                 file: task.file,
                 round: task.round,
                 page: task.pageNum,
                 snapshot: snapshot };

  var r = new XMLHttpRequest();
  // (The POST URI is ignored atm.)
  r.open('POST', '/submit_task_results', true);
  r.setRequestHeader('Content-Type', 'application/json');
  r.onreadystatechange = function(e) {
    if (r.readyState == 4) {
      inFlightRequests--;
    }
  }
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
  stdout.innerHTML += str;
  checkScrolling();
}
