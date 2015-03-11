/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* globals PDFJS, combineUrl, StatTimer, SpecialPowers, Promise */

'use strict';

/*
 * A Test Driver for PDF.js
 */
(function DriverClosure() {

// Disable worker support for running test as
//   https://github.com/mozilla/pdf.js/pull/764#issuecomment-2638944
//   "firefox-bin: Fatal IO error 12 (Cannot allocate memory) on X server :1."
// PDFJS.disableWorker = true;
PDFJS.enableStats = true;
PDFJS.cMapUrl = '../external/bcmaps/';
PDFJS.cMapPacked = true;

var appPath, masterMode, browser, canvas, dummyCanvas, currentTaskIdx,
    manifest, stdout;
var inFlightRequests = 0;

// Chrome for Windows locks during testing on low end machines
var letItCooldown = /Windows.*?Chrom/i.test(navigator.userAgent);

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

window.load = function load() {
  var params = queryParams();
  browser = params.browser;
  var manifestFile = params.manifestFile;
  appPath = params.path;
  masterMode = params.masterMode === 'True';
  var delay = params.delay || 0;

  canvas = document.createElement('canvas');
  stdout = document.getElementById('stdout');

  info('User Agent: ' + navigator.userAgent);
  log('load...\n');

  log('Harness thinks this browser is "' + browser + '" with path "' +
      appPath + '"\n');
  log('Fetching manifest "' + manifestFile + '"... ');

  var r = new XMLHttpRequest();
  r.open('GET', manifestFile, false);
  r.onreadystatechange = function loadOnreadystatechange(e) {
    if (r.readyState === 4) {
      log('done\n');
      manifest = JSON.parse(r.responseText);
      currentTaskIdx = 0;
      nextTask();
    }
  };
  if (delay) {
    log('\nDelaying for ' + delay + 'ms...\n');
  }
  // When gathering the stats the numbers seem to be more reliable if the
  // browser is given more time to startup.
  setTimeout(function() {
    r.send(null);
  }, delay);
};

function cleanup(callback) {
  // Clear out all the stylesheets since a new one is created for each font.
  while (document.styleSheets.length > 0) {
    var styleSheet = document.styleSheets[0];
    while (styleSheet.cssRules.length > 0) {
      styleSheet.deleteRule(0);
    }
    var ownerNode = styleSheet.ownerNode;
    ownerNode.parentNode.removeChild(ownerNode);
  }
  var guard = document.getElementById('content-end');
  var body = document.body;
  while (body.lastChild !== guard) {
    body.removeChild(body.lastChild);
  }

  // Wipe out the link to the pdfdoc so it can be GC'ed.
  for (var i = 0; i < manifest.length; i++) {
    if (manifest[i].pdfDoc) {
      manifest[i].pdfDoc.destroy();
      delete manifest[i].pdfDoc;
    }
  }
  if (letItCooldown) {
    setTimeout(callback, 500);
  } else {
    callback();
  }
}

function exceptionToString(e) {
  if (typeof e !== 'object') {
    return String(e);
  }
  if (!('message' in e)) {
    return JSON.stringify(e);
  }
  return e.message + ('stack' in e ? ' at ' + e.stack.split('\n')[0] : '');
}

function nextTask() {
  cleanup(continueNextTask);
}

function continueNextTask() {
  if (currentTaskIdx === manifest.length) {
    done();
    return;
  }
  var task = manifest[currentTaskIdx];
  task.round = 0;
  task.stats = {times: []};

  log('Loading file "' + task.file + '"\n');

  var absoluteUrl = combineUrl(window.location.href, task.file);
  var failure;
  function continuation() {
    task.pageNum = task.firstPage || 1;
    nextPage(task, failure);
  }

  PDFJS.disableRange = task.disableRange;
  PDFJS.disableAutoFetch = !task.enableAutoFetch;
  try {
    var promise = PDFJS.getDocument({
      url: absoluteUrl,
      password: task.password
    });
    promise.then(function(doc) {
      task.pdfDoc = doc;
      continuation();
    }, function(e) {
      failure = 'load PDF doc : ' + e;
      continuation();
    });
    return;
  } catch (e) {
    failure = 'load PDF doc : ' + exceptionToString(e);
  }
  continuation();
}

function getLastPageNum(task) {
  if (!task.pdfDoc) {
    return task.firstPage || 1;
  }
  var lastPageNum = task.lastPage || 0;
  if (!lastPageNum || lastPageNum > task.pdfDoc.numPages) {
    lastPageNum = task.pdfDoc.numPages;
  }
  return lastPageNum;
}

function isLastPage(task) {
  return task.pageNum > getLastPageNum(task);
}

function canvasToDataURL() {
  return canvas.toDataURL('image/png');
}

function NullTextLayerBuilder() {
}
NullTextLayerBuilder.prototype = {
  beginLayout: function NullTextLayerBuilder_BeginLayout() {},
  endLayout: function NullTextLayerBuilder_EndLayout() {},
  appendText: function NullTextLayerBuilder_AppendText() {}
};

function SimpleTextLayerBuilder(ctx, viewport) {
  this.ctx = ctx;
  this.viewport = viewport;
  this.textCounter = 0;
}
SimpleTextLayerBuilder.prototype = {
  appendText: function SimpleTextLayerBuilder_AppendText(geom, styles) {
    var style = styles[geom.fontName];
    var ctx = this.ctx, viewport = this.viewport;
    var tx = PDFJS.Util.transform(this.viewport.transform, geom.transform);
    var angle = Math.atan2(tx[1], tx[0]);
    var fontHeight = Math.sqrt((tx[2] * tx[2]) + (tx[3] * tx[3]));
    var fontAscent = (style.ascent ? style.ascent * fontHeight :
      (style.descent ? (1 + style.descent) * fontHeight : fontHeight));
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = 'red';
    ctx.fillStyle = 'yellow';
    ctx.translate(tx[4] + (fontAscent * Math.sin(angle)),
                  tx[5] - (fontAscent * Math.cos(angle)));
    ctx.rotate(angle);
    ctx.rect(0, 0, geom.width * viewport.scale, geom.height * viewport.scale);
    ctx.stroke();
    ctx.fill();
    ctx.restore();
    ctx.font = fontHeight + 'px ' + style.fontFamily;
    ctx.fillStyle = 'black';
    ctx.fillText(geom.str, tx[4], tx[5]);

    this.textCounter++;
  },
  setTextContent: function SimpleTextLayerBuilder_SetTextContent(textContent) {
    this.ctx.save();
    var textItems = textContent.items;
    for (var i = 0; i < textItems.length; i++) {
      this.appendText(textItems[i], textContent.styles);
    }

    this.ctx.restore();
  }
};

function nextPage(task, loadError) {
  var failure = loadError || '';

  if (!task.pdfDoc) {
    sendTaskResult(canvasToDataURL(), task, failure, function () {
      log('done' + (failure ? ' (failed !: ' + failure + ')' : '') + '\n');
      ++currentTaskIdx;
      nextTask();
    });
    return;
  }

  if (isLastPage(task)) {
    if (++task.round < task.rounds) {
      log(' Round ' + (1 + task.round) + '\n');
      task.pageNum = task.firstPage || 1;
    } else {
      ++currentTaskIdx;
      nextTask();
      return;
    }
  }

  if (task.skipPages && task.skipPages.indexOf(task.pageNum) >= 0) {
    log(' skipping page ' + task.pageNum + '/' + task.pdfDoc.numPages +
        '... ');
    // empty the canvas
    canvas.width = 1;
    canvas.height = 1;
    clear(canvas.getContext('2d'));

    snapshotCurrentPage(task, '');
    return;
  }

  if (!failure) {
    try {
      log(' loading page ' + task.pageNum + '/' + task.pdfDoc.numPages +
          '... ');
      var ctx = canvas.getContext('2d');
      task.pdfDoc.getPage(task.pageNum).then(function(page) {
        var pdfToCssUnitsCoef = 96.0 / 72.0;
        var viewport = page.getViewport(pdfToCssUnitsCoef);
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        clear(ctx);

        var drawContext, textLayerBuilder;
        var resolveInitPromise;
        var initPromise = new Promise(function (resolve) {
          resolveInitPromise = resolve;
        });
        if (task.type === 'text') {
          // using dummy canvas for pdf context drawing operations
          if (!dummyCanvas) {
            dummyCanvas = document.createElement('canvas');
          }
          drawContext = dummyCanvas.getContext('2d');
          // ... text builder will draw its content on the test canvas
          textLayerBuilder = new SimpleTextLayerBuilder(ctx, viewport);

          page.getTextContent().then(function(textContent) {
            textLayerBuilder.setTextContent(textContent);
            resolveInitPromise();
          });
        } else {
          drawContext = ctx;
          textLayerBuilder = new NullTextLayerBuilder();
          resolveInitPromise();
        }
        var renderContext = {
          canvasContext: drawContext,
          viewport: viewport
        };
        var completeRender = (function(error) {
          page.destroy();
          task.stats = page.stats;
          page.stats = new StatTimer();
          snapshotCurrentPage(task, error);
        });
        initPromise.then(function () {
          page.render(renderContext).promise.then(function() {
            completeRender(false);
          },
          function(error) {
            completeRender('render : ' + error);
          });
        });
      },
      function(error) {
        snapshotCurrentPage(task, 'render : ' + error);
      });
    } catch (e) {
      failure = 'page setup : ' + exceptionToString(e);
      snapshotCurrentPage(task, failure);
    }
  }
}

function snapshotCurrentPage(task, failure) {
  log('done, snapshotting... ');

  sendTaskResult(canvasToDataURL(), task, failure, function () {
    log('done' + (failure ? ' (failed !: ' + failure + ')' : '') + '\n');

    ++task.pageNum;
    nextPage(task);
  });
}

function sendQuitRequest(cb) {
  var r = new XMLHttpRequest();
  r.open('POST', '/tellMeToQuit?path=' + escape(appPath), false);
  r.onreadystatechange = function sendQuitRequestOnreadystatechange(e) {
    if (r.readyState === 4) {
      if (cb) {
        cb();
      }
    }
  };
  r.send(null);
}

function quitApp() {
  log('Done !');
  document.body.innerHTML = 'Tests are finished. <h1>CLOSE ME!</h1>' +
                             document.body.innerHTML;
  sendQuitRequest(function () {
    if (window.SpecialPowers) {
      SpecialPowers.quit();
    } else {
      window.close();
    }
  });
}

function done() {
  if (inFlightRequests > 0) {
    document.getElementById('inFlightCount').innerHTML = inFlightRequests;
    setTimeout(done, 100);
  } else {
    setTimeout(quitApp, 100);
  }
}

function sendTaskResult(snapshot, task, failure, callback) {
  var result = JSON.stringify({
    browser: browser,
    id: task.id,
    numPages: task.pdfDoc ?
             (task.lastPage || task.pdfDoc.numPages) : 0,
    lastPageNum: getLastPageNum(task),
    failure: failure,
    file: task.file,
    round: task.round,
    page: task.pageNum,
    snapshot: snapshot,
    stats: task.stats.times
  });

  send('/submit_task_results', result, callback);
}

function send(url, message, callback) {
  var r = new XMLHttpRequest();
  // (The POST URI is ignored atm.)
  r.open('POST', url, true);
  r.setRequestHeader('Content-Type', 'application/json');
  r.onreadystatechange = function sendTaskResultOnreadystatechange(e) {
    if (r.readyState === 4) {
      inFlightRequests--;
      // Retry until successful
      if (r.status !== 200) {
        setTimeout(function() {
          send(url, message);
        });
      }
      if (callback) {
        if (letItCooldown) {
          setTimeout(callback, 100);
        } else {
          callback();
        }
      }
    }
  };
  document.getElementById('inFlightCount').innerHTML = inFlightRequests++;
  r.send(message);
}

function info(message) {
  send('/info', JSON.stringify({
    browser: browser,
    message: message
  }));
}

function clear(ctx) {
  ctx.beginPath();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/* Auto-scroll if the scrollbar is near the bottom, otherwise do nothing. */
function checkScrolling() {
  if ((stdout.scrollHeight - stdout.scrollTop) <= stdout.offsetHeight) {
    stdout.scrollTop = stdout.scrollHeight;
  }
}

function log(str) {
  if (stdout.insertAdjacentHTML) {
    stdout.insertAdjacentHTML('BeforeEnd', str);
  } else {
    stdout.innerHTML += str;
  }

  if (str.lastIndexOf('\n') >= 0) {
    checkScrolling();
  }
}

})(); // DriverClosure
