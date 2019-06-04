/*
 * Copyright 2014 Mozilla Foundation
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
/* eslint-disable object-shorthand */

'use strict';

var WebServer = require('./webserver.js').WebServer;
var WebBrowser = require('./webbrowser.js').WebBrowser;
var path = require('path');
var fs = require('fs');
var os = require('os');
var url = require('url');
var testUtils = require('./testutils.js');

function parseOptions() {
  function describeCheck(fn, text) {
    fn.toString = function () {
      return text;
    };
    return fn;
  }

  var yargs = require('yargs')
    .usage('Usage: $0')
    .boolean(['help', 'masterMode', 'reftest', 'unitTest', 'fontTest',
              'noPrompts', 'noDownload', 'downloadOnly', 'strictVerify'])
    .string(['manifestFile', 'browser', 'browserManifestFile',
             'port', 'statsFile', 'statsDelay', 'testfilter'])
    .alias('browser', 'b').alias('help', 'h').alias('masterMode', 'm')
    .alias('testfilter', 't')
    .describe('help', 'Show this help message')
    .describe('masterMode', 'Run the script in master mode.')
    .describe('noPrompts',
      'Uses default answers (intended for CLOUD TESTS only!).')
    .describe('manifestFile',
      'A path to JSON file in the form of test_manifest.json')
    .default('manifestFile', 'test_manifest.json')
    .describe('browser', 'The path to a single browser ')
    .describe('browserManifestFile', 'A path to JSON file in the form of ' +
      'those found in resources/browser_manifests/')
    .describe('reftest', 'Automatically start reftest showing comparison ' +
      'test failures, if there are any.')
    .describe('testfilter', 'Run specific reftest(s).')
    .default('testfilter', [])
    .example('$0 --b=firefox -t=issue5567 -t=issue5909',
      'Run the reftest identified by issue5567 and issue5909 in Firefox.')
    .describe('port', 'The port the HTTP server should listen on.')
    .default('port', 0)
    .describe('unitTest', 'Run the unit tests.')
    .describe('fontTest', 'Run the font tests.')
    .describe('noDownload', 'Skips test PDFs downloading.')
    .describe('downloadOnly', 'Download test PDFs without running the tests.')
    .describe('strictVerify', 'Error if verifying the manifest files fails.')
    .describe('statsFile', 'The file where to store stats.')
    .describe('statsDelay', 'The amount of time in milliseconds the browser ' +
      'should wait before starting stats.')
    .default('statsDelay', 0)
    .check(describeCheck(function (argv) {
      return +argv.reftest + argv.unitTest + argv.fontTest +
        argv.masterMode <= 1;
    }, '--reftest, --unitTest, --fontTest and --masterMode must not be ' +
      'specified at the same time.'))
    .check(describeCheck(function (argv) {
      return !argv.noDownload || !argv.downloadOnly;
    }, '--noDownload and --downloadOnly cannot be used together.'))
    .check(describeCheck(function (argv) {
      return !argv.masterMode || argv.manifestFile === 'test_manifest.json';
    }, 'when --masterMode is specified --manifestFile shall be equal ' +
      'test_manifest.json'))
    .check(describeCheck(function (argv) {
      return !argv.browser || !argv.browserManifestFile;
    }, '--browser and --browserManifestFile must not be specified at the ' +
      'same time.'));
  var result = yargs.argv;
  if (result.help) {
    yargs.showHelp();
    process.exit(0);
  }
  result.testfilter = Array.isArray(result.testfilter) ?
    result.testfilter : [result.testfilter];
  return result;
}

var refsTmpDir = 'tmp';
var testResultDir = 'test_snapshots';
var refsDir = 'ref';
var eqLog = 'eq.log';
var browserTimeout = 120;

function monitorBrowserTimeout(session, onTimeout) {
  if (session.timeoutMonitor) {
    clearTimeout(session.timeoutMonitor);
  }
  if (!onTimeout) {
    session.timeoutMonitor = null;
    return;
  }
  session.timeoutMonitor = setTimeout(function () {
    onTimeout(session);
  }, browserTimeout * 1000);
}

function updateRefImages() {
  function sync(removeTmp) {
    console.log('  Updating ref/ ... ');
    testUtils.copySubtreeSync(refsTmpDir, refsDir);
    if (removeTmp) {
      testUtils.removeDirSync(refsTmpDir);
    }
    console.log('done');
  }

  if (options.noPrompts) {
    sync(false); // don't remove tmp/ for botio
    return;
  }
  testUtils.confirm('Would you like to update the master copy in ref/? [yn] ',
    function (confirmed) {
      if (confirmed) {
        sync(true);
      } else {
        console.log('  OK, not updating.');
      }
    });
}

function examineRefImages() {
  startServer();
  var startUrl = 'http://' + server.host + ':' + server.port +
                 '/test/resources/reftest-analyzer.html#web=/test/eq.log';
  var config = Object.assign({}, sessions[0].config);
  config['headless'] = false;
  var browser = WebBrowser.create(config);
  browser.start(startUrl);
}

function startRefTest(masterMode, showRefImages) {
  function finalize() {
    stopServer();
    var numErrors = 0;
    var numFBFFailures = 0;
    var numEqFailures = 0;
    var numEqNoSnapshot = 0;
    sessions.forEach(function (session) {
      numErrors += session.numErrors;
      numFBFFailures += session.numFBFFailures;
      numEqFailures += session.numEqFailures;
      numEqNoSnapshot += session.numEqNoSnapshot;
    });
    var numFatalFailures = numErrors + numFBFFailures;
    console.log();
    if (numFatalFailures + numEqFailures > 0) {
      console.log('OHNOES!  Some tests failed!');
      if (numErrors > 0) {
        console.log('  errors: ' + numErrors);
      }
      if (numEqFailures > 0) {
        console.log('  different ref/snapshot: ' + numEqFailures);
      }
      if (numFBFFailures > 0) {
        console.log('  different first/second rendering: ' + numFBFFailures);
      }
    } else {
      console.log('All regression tests passed.');
    }
    var runtime = (Date.now() - startTime) / 1000;
    console.log('Runtime was ' + runtime.toFixed(1) + ' seconds');

    if (options.statsFile) {
      fs.writeFileSync(options.statsFile, JSON.stringify(stats, null, 2));
    }
    if (masterMode) {
      if (numEqFailures + numEqNoSnapshot > 0) {
        console.log();
        console.log('Some eq tests failed or didn\'t have snapshots.');
        console.log('Checking to see if master references can be updated...');
        if (numFatalFailures > 0) {
          console.log('  No.  Some non-eq tests failed.');
        } else {
          console.log(
            '  Yes!  The references in tmp/ can be synced with ref/.');
          updateRefImages();
        }
      }
    } else if (showRefImages && numEqFailures > 0) {
      console.log();
      console.log('Starting reftest harness to examine ' + numEqFailures +
                  ' eq test failures.');
      examineRefImages(numEqFailures);
    }
  }

  function setup() {
    if (fs.existsSync(refsTmpDir)) {
      console.error('tmp/ exists -- unable to proceed with testing');
      process.exit(1);
    }

    if (fs.existsSync(eqLog)) {
      fs.unlinkSync(eqLog);
    }
    if (fs.existsSync(testResultDir)) {
      testUtils.removeDirSync(testResultDir);
    }

    startTime = Date.now();
    startServer();
    server.hooks['POST'].push(refTestPostHandler);
    onAllSessionsClosed = finalize;

    startBrowsers('/test/test_slave.html', function (session) {
      session.masterMode = masterMode;
      session.taskResults = {};
      session.tasks = {};
      session.remaining = manifest.length;
      manifest.forEach(function (item) {
        var rounds = item.rounds || 1;
        var roundsResults = [];
        roundsResults.length = rounds;
        session.taskResults[item.id] = roundsResults;
        session.tasks[item.id] = item;
      });
      session.numErrors = 0;
      session.numFBFFailures = 0;
      session.numEqNoSnapshot = 0;
      session.numEqFailures = 0;
      monitorBrowserTimeout(session, handleSessionTimeout);
    });
  }
  function checkRefsTmp() {
    if (masterMode && fs.existsSync(refsTmpDir)) {
      if (options.noPrompt) {
        testUtils.removeDirSync(refsTmpDir);
        setup();
        return;
      }
      console.log('Temporary snapshot dir tmp/ is still around.');
      console.log('tmp/ can be removed if it has nothing you need.');
      testUtils.confirm('SHOULD THIS SCRIPT REMOVE tmp/? THINK CAREFULLY [yn] ',
        function (confirmed) {
          if (confirmed) {
            testUtils.removeDirSync(refsTmpDir);
          }
          setup();
        });
    } else {
      setup();
    }
  }

  var startTime;
  var manifest = getTestManifest();
  if (!manifest) {
    return;
  }
  if (options.noDownload) {
    checkRefsTmp();
  } else {
    ensurePDFsDownloaded(checkRefsTmp);
  }
}

function handleSessionTimeout(session) {
  if (session.closed) {
    return;
  }
  var browser = session.name;
  console.log('TEST-UNEXPECTED-FAIL | test failed ' + browser +
              ' has not responded in ' + browserTimeout + 's');
  session.numErrors += session.remaining;
  session.remaining = 0;
  closeSession(browser);
}

function getTestManifest() {
  var manifest = JSON.parse(fs.readFileSync(options.manifestFile));

  var testFilter = options.testfilter.slice(0);
  if (testFilter.length) {
    manifest = manifest.filter(function(item) {
      var i = testFilter.indexOf(item.id);
      if (i !== -1) {
        testFilter.splice(i, 1);
        return true;
      }
      return false;
    });
    if (testFilter.length) {
      console.error('Unrecognized test IDs: ' + testFilter.join(' '));
      return undefined;
    }
  }
  return manifest;
}

function checkEq(task, results, browser, masterMode) {
  var taskId = task.id;
  var refSnapshotDir = path.join(refsDir, os.platform(), browser, taskId);
  var testSnapshotDir = path.join(testResultDir, os.platform(), browser,
                                  taskId);

  var pageResults = results[0];
  var taskType = task.type;
  var numEqNoSnapshot = 0;
  var numEqFailures = 0;
  for (var page = 0; page < pageResults.length; page++) {
    if (!pageResults[page]) {
      continue;
    }
    var testSnapshot = pageResults[page].snapshot;
    if (testSnapshot && testSnapshot.startsWith('data:image/png;base64,')) {
      testSnapshot = Buffer.from(testSnapshot.substring(22), 'base64');
    } else {
      console.error('Valid snapshot was not found.');
    }

    var refSnapshot = null;
    var eq = false;
    var refPath = path.join(refSnapshotDir, (page + 1) + '.png');
    if (!fs.existsSync(refPath)) {
      numEqNoSnapshot++;
      if (!masterMode) {
        console.log('WARNING: no reference snapshot ' + refPath);
      }
    } else {
      refSnapshot = fs.readFileSync(refPath);
      eq = (refSnapshot.toString('hex') === testSnapshot.toString('hex'));
      if (!eq) {
        console.log('TEST-UNEXPECTED-FAIL | ' + taskType + ' ' + taskId +
                    ' | in ' + browser + ' | rendering of page ' + (page + 1) +
                    ' != reference rendering');

        testUtils.ensureDirSync(testSnapshotDir);
        fs.writeFileSync(path.join(testSnapshotDir, (page + 1) + '.png'),
                         testSnapshot);
        fs.writeFileSync(path.join(testSnapshotDir, (page + 1) + '_ref.png'),
                         refSnapshot);

        // NB: this follows the format of Mozilla reftest output so that
        // we can reuse its reftest-analyzer script
        fs.appendFileSync(eqLog, 'REFTEST TEST-UNEXPECTED-FAIL | ' + browser +
          '-' + taskId + '-page' + (page + 1) + ' | image comparison (==)\n' +
          'REFTEST   IMAGE 1 (TEST): ' +
          path.join(testSnapshotDir, (page + 1) + '.png') + '\n' +
          'REFTEST   IMAGE 2 (REFERENCE): ' +
          path.join(testSnapshotDir, (page + 1) + '_ref.png') + '\n');
        numEqFailures++;
      }
    }
    if (masterMode && (!refSnapshot || !eq)) {
      var tmpSnapshotDir = path.join(refsTmpDir, os.platform(), browser,
                                     taskId);
      testUtils.ensureDirSync(tmpSnapshotDir);
      fs.writeFileSync(path.join(tmpSnapshotDir, (page + 1) + '.png'),
                       testSnapshot);
    }
  }

  var session = getSession(browser);
  session.numEqNoSnapshot += numEqNoSnapshot;
  if (numEqFailures > 0) {
    session.numEqFailures += numEqFailures;
  } else {
    console.log('TEST-PASS | ' + taskType + ' test ' + taskId + ' | in ' +
                browser);
  }
}

function checkFBF(task, results, browser) {
  var numFBFFailures = 0;
  var round0 = results[0], round1 = results[1];
  if (round0.length !== round1.length) {
    console.error('round 1 and 2 sizes are different');
  }

  for (var page = 0; page < round1.length; page++) {
    var r0Page = round0[page], r1Page = round1[page];
    if (!r0Page) {
      continue;
    }
    if (r0Page.snapshot !== r1Page.snapshot) {
      console.log('TEST-UNEXPECTED-FAIL | forward-back-forward test ' +
                  task.id + ' | in ' + browser + ' | first rendering of page ' +
                  (page + 1) + ' != second');
      numFBFFailures++;
    }
  }

  if (numFBFFailures > 0) {
    getSession(browser).numFBFFailures += numFBFFailures;
  } else {
    console.log('TEST-PASS | forward-back-forward test ' + task.id +
                ' | in ' + browser);
  }
}

function checkLoad(task, results, browser) {
  // Load just checks for absence of failure, so if we got here the
  // test has passed
  console.log('TEST-PASS | load test ' + task.id + ' | in ' + browser);
}

function checkRefTestResults(browser, id, results) {
  var failed = false;
  var session = getSession(browser);
  var task = session.tasks[id];
  results.forEach(function (roundResults, round) {
    roundResults.forEach(function (pageResult, page) {
      if (!pageResult) {
        return; // no results
      }
      if (pageResult.failure) {
        failed = true;
        if (fs.existsSync(task.file + '.error')) {
          console.log('TEST-SKIPPED | PDF was not downloaded ' + id + ' | in ' +
                      browser + ' | page' + (page + 1) + ' round ' +
                      (round + 1) + ' | ' + pageResult.failure);
        } else {
          session.numErrors++;
          console.log('TEST-UNEXPECTED-FAIL | test failed ' + id + ' | in ' +
            browser + ' | page' + (page + 1) + ' round ' +
            (round + 1) + ' | ' + pageResult.failure);
        }
      }
    });
  });
  if (failed) {
    return;
  }
  switch (task.type) {
    case 'eq':
    case 'text':
      checkEq(task, results, browser, session.masterMode);
      break;
    case 'fbf':
      checkFBF(task, results, browser);
      break;
    case 'load':
      checkLoad(task, results, browser);
      break;
    default:
      throw new Error('Unknown test type');
  }
  // clear memory
  results.forEach(function (roundResults, round) {
    roundResults.forEach(function (pageResult, page) {
      pageResult.snapshot = null;
    });
  });
}

function refTestPostHandler(req, res) {
  var parsedUrl = url.parse(req.url, true);
  var pathname = parsedUrl.pathname;
  if (pathname !== '/tellMeToQuit' &&
    pathname !== '/info' &&
    pathname !== '/submit_task_results') {
    return false;
  }

  var body = '';
  req.on('data', function (data) {
    body += data;
  });
  req.on('end', function () {
    res.writeHead(200, { 'Content-Type': 'text/plain', });
    res.end();

    var session;
    if (pathname === '/tellMeToQuit') {
      // finding by path
      var browserPath = parsedUrl.query.path;
      session = sessions.filter(function (session) {
        return session.config.path === browserPath;
      })[0];
      monitorBrowserTimeout(session, null);
      closeSession(session.name);
      return;
    }

    var data = JSON.parse(body);
    if (pathname === '/info') {
      console.log(data.message);
      return;
    }

    var browser = data.browser;
    var round = data.round;
    var id = data.id;
    var page = data.page - 1;
    var failure = data.failure;
    var snapshot = data.snapshot;
    var lastPageNum = data.lastPageNum;

    session = getSession(browser);
    monitorBrowserTimeout(session, handleSessionTimeout);

    var taskResults = session.taskResults[id];
    if (!taskResults[round]) {
      taskResults[round] = [];
    }

    if (taskResults[round][page]) {
      console.error('Results for ' + browser + ':' + id + ':' + round +
                    ':' + page + ' were already submitted');
      // TODO abort testing here?
    }

    taskResults[round][page] = {
      failure: failure,
      snapshot: snapshot,
    };
    if (stats) {
      stats.push({
        'browser': browser,
        'pdf': id,
        'page': page,
        'round': round,
        'stats': data.stats,
      });
    }

    var isDone = taskResults[taskResults.length - 1] &&
                 taskResults[taskResults.length - 1][lastPageNum - 1];
    if (isDone) {
      checkRefTestResults(browser, id, taskResults);
      session.remaining--;
    }
  });
  return true;
}

function startUnitTest(url, name) {
  var startTime = Date.now();
  startServer();
  server.hooks['POST'].push(unitTestPostHandler);
  onAllSessionsClosed = function () {
    stopServer();
    var numRuns = 0, numErrors = 0;
    sessions.forEach(function (session) {
      numRuns += session.numRuns;
      numErrors += session.numErrors;
    });
    console.log();
    console.log('Run ' + numRuns + ' tests');
    if (numErrors > 0) {
      console.log('OHNOES!  Some ' + name + ' tests failed!');
      console.log('  ' + numErrors + ' of ' + numRuns + ' failed');
    } else {
      console.log('All ' + name + ' tests passed.');
    }
    var runtime = (Date.now() - startTime) / 1000;
    console.log(name + ' tests runtime was ' + runtime.toFixed(1) + ' seconds');
  };
  startBrowsers(url, function (session) {
    session.numRuns = 0;
    session.numErrors = 0;
  });
}

function unitTestPostHandler(req, res) {
  var parsedUrl = url.parse(req.url);
  var pathname = parsedUrl.pathname;
  if (pathname !== '/tellMeToQuit' &&
      pathname !== '/info' &&
      pathname !== '/ttx' &&
      pathname !== '/submit_task_results') {
    return false;
  }

  var body = '';
  req.on('data', function (data) {
    body += data;
  });
  req.on('end', function () {
    if (pathname === '/ttx') {
      var translateFont = require('./font/ttxdriver.js').translateFont;
      var onCancel = null, ttxTimeout = 10000;
      var timeoutId = setTimeout(function () {
        if (onCancel) {
          onCancel('TTX timeout');
        }
      }, ttxTimeout);
      translateFont(body, function (fn) {
          onCancel = fn;
        }, function (err, xml) {
          clearTimeout(timeoutId);
          res.writeHead(200, { 'Content-Type': 'text/xml', });
          res.end(err ? '<error>' + err + '</error>' : xml);
        });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain', });
    res.end();

    var data = JSON.parse(body);
    if (pathname === '/tellMeToQuit') {
      closeSession(data.browser);
      return;
    }
    if (pathname === '/info') {
      console.log(data.message);
      return;
    }
    var session = getSession(data.browser);
    session.numRuns++;
    var message = data.status + ' | ' + data.description;
    if (data.status === 'TEST-UNEXPECTED-FAIL') {
      session.numErrors++;
    }
    if (data.error) {
      message += ' | ' + data.error;
    }
    console.log(message);
  });
  return true;
}

function startBrowsers(url, initSessionCallback) {
  var browsers;
  if (options.browserManifestFile) {
    browsers = JSON.parse(fs.readFileSync(options.browserManifestFile));
  } else if (options.browser) {
    var browserPath = options.browser;
    var name = path.basename(browserPath, path.extname(browserPath));
    browsers = [{ name: name, path: browserPath, }];
  } else {
    console.error('Specify either browser or browserManifestFile.');
    process.exit(1);
  }
  sessions = [];
  browsers.forEach(function (b) {
    var browser = WebBrowser.create(b);
    var startUrl = getServerBaseAddress() + url +
      '?browser=' + encodeURIComponent(b.name) +
      '&manifestFile=' + encodeURIComponent('/test/' + options.manifestFile) +
      '&testFilter=' + JSON.stringify(options.testfilter) +
      '&path=' + encodeURIComponent(b.path) +
      '&delay=' + options.statsDelay +
      '&masterMode=' + options.masterMode;
    browser.start(startUrl);
    var session = {
      name: b.name,
      config: b,
      browser: browser,
      closed: false,
    };
    if (initSessionCallback) {
      initSessionCallback(session);
    }
    sessions.push(session);
  });
}

function getServerBaseAddress() {
  return 'http://' + host + ':' + server.port;
}

function startServer() {
  server = new WebServer();
  server.host = host;
  server.port = options.port;
  server.root = '..';
  server.cacheExpirationTime = 3600;
  server.start();
}

function stopServer() {
  server.stop();
}

function getSession(browser) {
  return sessions.filter(function (session) {
    return session.name === browser;
  })[0];
}

function closeSession(browser) {
  var i = 0;
  while (i < sessions.length && sessions[i].name !== browser) {
    i++;
  }
  if (i < sessions.length) {
    var session = sessions[i];
    session.browser.stop(function () {
      session.closed = true;
      var allClosed = sessions.every(function (s) {
        return s.closed;
      });
      if (allClosed && onAllSessionsClosed) {
        onAllSessionsClosed();
      }
    });
  }
}

function ensurePDFsDownloaded(callback) {
  var downloadUtils = require('./downloadutils.js');
  var manifest = getTestManifest();
  downloadUtils.downloadManifestFiles(manifest, function () {
    downloadUtils.verifyManifestFiles(manifest, function (hasErrors) {
      if (hasErrors) {
        console.log('Unable to verify the checksum for the files that are ' +
                    'used for testing.');
        console.log('Please re-download the files, or adjust the MD5 ' +
                    'checksum in the manifest for the files listed above.\n');
        if (options.strictVerify) {
          process.exit(1);
        }
      }
      callback();
    });
  });
}

function main() {
  if (options.statsFile) {
    stats = [];
  }

  if (options.downloadOnly) {
    ensurePDFsDownloaded(function() {});
  } else if (!options.browser && !options.browserManifestFile) {
    startServer();
  } else if (options.unitTest) {
    ensurePDFsDownloaded(function() { // Allows linked PDF files in unit-tests.
      startUnitTest('/test/unit/unit_test.html', 'unit');
    });
  } else if (options.fontTest) {
    startUnitTest('/test/font/font_test.html', 'font');
  } else {
    startRefTest(options.masterMode, options.reftest);
  }
}

var server;
var sessions;
var onAllSessionsClosed;
var host = '127.0.0.1';
var options = parseOptions();
var stats;

main();
