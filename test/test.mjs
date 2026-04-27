/* Copyright 2014 Mozilla Foundation
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
/* eslint-disable no-var */

import {
  colorBrowser,
  TEST_PASSED,
  TEST_UNEXPECTED_FAIL,
} from "./color_utils.mjs";
import { copySubtreeSync, ensureDirSync } from "./testutils.mjs";
import {
  COVERAGE_FORMAT_TO_REPORTER,
  parseCoverageFormats,
} from "../external/ccov/coverage_format.mjs";
import {
  downloadManifestFiles,
  verifyManifestFiles,
} from "./downloadutils.mjs";
import fs from "fs";
import istanbulCoverage from "istanbul-lib-coverage";
import istanbulReportGenerator from "istanbul-reports";
import libReport from "istanbul-lib-report";
import os from "os";
import { parseArgs } from "node:util";
import path from "path";
import puppeteer from "puppeteer";
import readline from "readline";
import { translateFont } from "./font/ttxdriver.mjs";
import { WebServer } from "./webserver.mjs";

const __dirname = import.meta.dirname;

// Strip private ancillary PNG chunks before comparing snapshots. Firefox adds
// a `deBG` chunk with a per-session unique ID to canvas.toDataURL("image/png")
// output, causing false failures when ref and test were captured in different
// browser sessions.
// For reference:
//  https://searchfox.org/firefox-main/rev/1427c88632d1474d2653928745d78feca1a64ee0/image/encoders/png/nsPNGEncoder.cpp#367
function stripPrivatePngChunks(buf) {
  const PNG_SIGNATURE = 8;
  let pos = PNG_SIGNATURE;
  const chunks = [];
  const pre_chunk_data = 8; // len (4) + type (4)
  const post_chunk_data = 4; // CRC
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.slice(pos + 4, pos + 8).toString("latin1");
    const to_skip = pre_chunk_data + len + post_chunk_data;
    // Keep critical chunks (uppercase first letter) and public ancillary
    // chunks (uppercase second letter). Drop private ancillary chunks
    // (lowercase second letter), e.g. "deBG" added by Firefox.
    // See PNG specification for details on chunk types:
    //  https://www.libpng.org/pub/png/spec/1.2/PNG-Chunks.html#:~:text=4%2E3%2E,-Summary
    if (
      type[0] === type[0].toUpperCase() ||
      type[1] === type[1].toUpperCase()
    ) {
      chunks.push(buf.slice(pos, pos + to_skip));
    }
    pos += to_skip;
  }
  return Buffer.concat([buf.slice(0, PNG_SIGNATURE), ...chunks]);
}

function parseOptions() {
  // Expand `-X=value` short-option forms into `["-X", "value"]` since
  // parseArgs only strips the `=` separator for long options (--foo=bar).
  const args = process.argv.slice(2).flatMap(arg => {
    const m = arg.match(/^(-[a-zA-Z])=(.*)/s);
    return m ? [m[1], m[2]] : [arg];
  });
  const { values } = parseArgs({
    args,
    options: {
      coverage: { type: "boolean", default: false },
      coverageFormats: { type: "string", default: "info" },
      coverageOutput: { type: "string", default: "build/coverage" },
      coveragePerTest: { type: "boolean", default: false },
      downloadOnly: { type: "boolean", default: false },
      fontTest: { type: "boolean", default: false },
      headless: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      integration: { type: "boolean", default: false },
      jobs: { type: "string", short: "j", default: "1" },
      manifestFile: { type: "string", default: "test_manifest.json" },
      masterMode: { type: "boolean", short: "m", default: false },
      noChrome: { type: "boolean", default: false },
      noDownload: { type: "boolean", default: false },
      noFirefox: { type: "boolean", default: false },
      noPrompts: { type: "boolean", default: false },
      port: { type: "string", default: "0" },
      reftest: { type: "boolean", default: false },
      statsDelay: { type: "string", default: "0" },
      statsFile: { type: "string", default: "" },
      strictVerify: { type: "boolean", default: false },
      testfilter: { type: "string", short: "t", multiple: true, default: [] },
      unitTest: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    console.log(
      "Usage: test.mjs\n\n" +
        "  --coverage          Enable code coverage collection.\n" +
        "  --coverageFormats   Comma-separated list of coverage output formats: info,html,json,text,cobertura,clover. [info]\n" +
        "  --coverageOutput    Directory for code coverage data. [build/coverage]\n" +
        "  --coveragePerTest   Generate individual coverage reports per test.\n" +
        "  --downloadOnly      Download test PDFs without running the tests.\n" +
        "  --fontTest          Run the font tests.\n" +
        "  --headless          Run tests without visible browser windows.\n" +
        "  --help, -h          Show this help message.\n" +
        "  --integration       Run the integration tests.\n" +
        "  --jobs, -j          Number of parallel tabs per browser. [1]\n" +
        "  --manifestFile      Path to manifest JSON file. [test_manifest.json]\n" +
        "  --masterMode, -m    Run the script in master mode.\n" +
        "  --noChrome          Skip Chrome when running tests.\n" +
        "  --noDownload        Skip downloading of test PDFs.\n" +
        "  --noFirefox         Skip Firefox when running tests.\n" +
        "  --noPrompts         Use default answers (for CLOUD TESTS only!).\n" +
        "  --port              Port for the HTTP server. [0]\n" +
        "  --reftest           Start reftest viewer on comparison failures.\n" +
        "  --statsDelay        Milliseconds to wait before starting stats. [0]\n" +
        "  --statsFile         File where to store stats.\n" +
        "  --strictVerify      Error if manifest file verification fails.\n" +
        "  --testfilter, -t    Run specific reftest(s), e.g. -t=issue5567.\n" +
        "  --unitTest          Run the unit tests.\n"
    );
    process.exit(0);
  }

  if (
    +values.reftest + values.unitTest + values.fontTest + values.masterMode >
    1
  ) {
    throw new Error(
      "--reftest, --unitTest, --fontTest, and --masterMode must not be specified together."
    );
  }
  if (values.noDownload && values.downloadOnly) {
    throw new Error("--noDownload and --downloadOnly cannot be used together.");
  }
  if (values.masterMode && values.manifestFile !== "test_manifest.json") {
    throw new Error(
      "when --masterMode is specified --manifestFile shall be equal to `test_manifest.json`."
    );
  }

  return {
    ...values,
    jobs: parseInt(values.jobs, 10) || 1,
    port: parseInt(values.port, 10) || 0,
    statsDelay: parseInt(values.statsDelay, 10) || 0,
  };
}

var refsTmpDir = "tmp";
var testResultDir = "test_snapshots";
var refsDir = "ref";
var eqLog = "eq.log";
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
    console.log("  Updating ref/ ... ");
    copySubtreeSync(refsTmpDir, refsDir);
    if (removeTmp) {
      fs.rmSync(refsTmpDir, { recursive: true, force: true });
    }
    console.log("done");
  }

  if (options.noPrompts) {
    sync(false); // don't remove tmp/ for botio
    return;
  }

  const reader = readline.createInterface(process.stdin, process.stdout);
  reader.question(
    "Would you like to update the master copy in ref/? [yn] ",
    function (answer) {
      if (answer.toLowerCase() === "y") {
        sync(true);
      } else {
        console.log("  OK, not updating.");
      }
      reader.close();
      // readline resumes stdin, making it a ref'd event-loop handle; close it
      // explicitly so the process can exit once there is nothing else to do.
      process.stdin.destroy();
    }
  );
}

function examineRefImages() {
  startServer();

  startBrowser({
    browserName: "firefox",
    headless: false,
    startUrl: `http://${host}:${server.port}/test/resources/reftest-analyzer.html#web=/test/eq.log`,
  }).then(function (browser) {
    browser.on("disconnected", function () {
      stopServer();
      process.exit(0);
    });
  });
}

async function startRefTest(masterMode, showRefImages) {
  function finalize() {
    stopServer();
    let numRuns = 0;
    var numErrors = 0;
    var numFBFFailures = 0;
    var numEqFailures = 0;
    var numEqNoSnapshot = 0;
    sessions.forEach(function (session) {
      numRuns += session.numRuns;
      numErrors += session.numErrors;
      numFBFFailures += session.numFBFFailures;
      numEqFailures += session.numEqFailures;
      numEqNoSnapshot += session.numEqNoSnapshot;
    });
    var numFatalFailures = numErrors + numFBFFailures;
    console.log();
    if (!numRuns) {
      console.log(`OHNOES!  No tests ran!`);
    } else if (numFatalFailures + numEqFailures > 0) {
      console.log("OHNOES!  Some tests failed!");
      if (numErrors > 0) {
        console.log("  errors: " + numErrors);
      }
      if (numEqFailures > 0) {
        console.log("  different ref/snapshot: " + numEqFailures);
      }
      if (numFBFFailures > 0) {
        console.log("  different first/second rendering: " + numFBFFailures);
      }
    } else {
      console.log("All regression tests passed.");
    }
    var runtime = (Date.now() - startTime) / 1000;
    console.log("Runtime was " + runtime.toFixed(1) + " seconds");

    if (options.statsFile) {
      fs.writeFileSync(options.statsFile, JSON.stringify(stats, null, 2));
    }
    if (masterMode) {
      if (numEqFailures + numEqNoSnapshot > 0) {
        console.log();
        console.log("Some eq tests failed or didn't have snapshots.");
        console.log("Checking to see if master references can be updated...");
        if (numFatalFailures > 0) {
          console.log("  No.  Some non-eq tests failed.");
        } else {
          console.log(
            "  Yes!  The references in tmp/ can be synced with ref/."
          );
          updateRefImages();
        }
      }
    } else if (showRefImages && numEqFailures > 0) {
      console.log();
      console.log(
        `Starting reftest harness to examine ${numEqFailures} eq test failures.`
      );
      examineRefImages();
    }
  }

  async function setup() {
    if (fs.existsSync(refsTmpDir)) {
      console.error("tmp/ exists -- unable to proceed with testing");
      process.exit(1);
    }

    if (fs.existsSync(eqLog)) {
      fs.unlinkSync(eqLog);
    }
    if (fs.existsSync(testResultDir)) {
      fs.rmSync(testResultDir, { recursive: true, force: true });
    }

    startTime = Date.now();
    startServer();
    server.hooks.POST.push(refTestPostHandler);
    taskQueue = new Map();
    refPngCache = new Map();

    server.hooks.WS.push(ws => {
      let pendingOps = 0;
      let pendingQuit = null;
      ws.on("message", (data, isBinary) => {
        if (isBinary) {
          pendingOps++;
          handleWsBinaryResult(data).finally(() => {
            if (--pendingOps === 0 && pendingQuit) {
              pendingQuit();
              pendingQuit = null;
            }
          });
        } else {
          const msg = JSON.parse(data.toString());
          if (msg.type === "requestTask") {
            const session = getSession(msg.browser);
            session.taskResults ??= {};
            session.tasks ??= {};
            session.remaining ??= 0;
            const browserType = session.browserType ?? session.name;
            if (!taskQueue.has(browserType)) {
              taskQueue.set(browserType, [...manifest]);
            }
            const task = taskQueue.get(browserType).shift();
            if (task) {
              const rounds = task.rounds || 1;
              const roundsResults = [];
              roundsResults.length = rounds;
              session.taskResults[task.id] = roundsResults;
              session.tasks[task.id] = task;
              session.remaining++;
              ws.send(JSON.stringify({ type: "task", task }));
              prefetchRefPngs(browserType, task);
            } else {
              ws.send(JSON.stringify({ type: "done" }));
            }
          } else if (msg.type === "coverage") {
            if (global.coveragePerTest) {
              const { id, counts } = msg;
              accumulatePerTestCoverage(id, counts);
            }
          } else if (msg.type === "quit") {
            const session = getSession(msg.browser);
            monitorBrowserTimeout(session, null);
            const doQuit = () => closeSession(session.name);
            if (pendingOps === 0) {
              doQuit();
            } else {
              pendingQuit = doQuit;
            }
          }
        }
      });
    });
    onAllSessionsClosed = finalize;

    await startBrowsers({
      baseUrl: `http://${host}:${server.port}/test/test_slave.html`,
      numSessions: options.jobs,
      initializeSession: session => {
        session.masterMode = masterMode;
        session.taskResults ??= {};
        session.tasks ??= {};
        session.remaining ??= 0;
        session.numRuns = 0;
        session.numErrors = 0;
        session.numFBFFailures = 0;
        session.numEqNoSnapshot = 0;
        session.numEqFailures = 0;
        monitorBrowserTimeout(session, handleSessionTimeout);
      },
    });
  }
  function checkRefsTmp() {
    if (masterMode && fs.existsSync(refsTmpDir)) {
      if (options.noPrompts) {
        fs.rmSync(refsTmpDir, { recursive: true, force: true });
        setup();
        return;
      }
      console.log("Temporary snapshot dir tmp/ is still around.");
      console.log("tmp/ can be removed if it has nothing you need.");

      const reader = readline.createInterface(process.stdin, process.stdout);
      reader.question(
        "SHOULD THIS SCRIPT REMOVE tmp/? THINK CAREFULLY [yn] ",
        function (answer) {
          if (answer.toLowerCase() === "y") {
            fs.rmSync(refsTmpDir, { recursive: true, force: true });
          }
          setup();
          reader.close();
        }
      );
    } else {
      setup();
    }
  }

  var startTime;
  var manifest = getTestManifest();
  if (!manifest) {
    return;
  }

  if (!options.noDownload) {
    await ensurePDFsDownloaded();
  }
  checkRefsTmp();
}

function handleSessionTimeout(session) {
  if (session.closed) {
    return;
  }
  console.log(
    `${TEST_UNEXPECTED_FAIL} | test failed ${session.name} has not responded in ${browserTimeout}s`
  );
  session.numErrors += session.remaining;
  session.remaining = 0;
  closeSession(session.name);
}

function getTestManifest() {
  var manifest = JSON.parse(fs.readFileSync(options.manifestFile));

  const testFilter = options.testfilter.slice(0);
  if (testFilter.length) {
    manifest = manifest.filter(function (item) {
      var i = testFilter.indexOf(item.id);
      if (i !== -1) {
        testFilter.splice(i, 1);
        return true;
      }
      return false;
    });
    if (testFilter.length) {
      console.error("Unrecognized test IDs: " + testFilter.join(" "));
      return undefined;
    }
  }
  return manifest;
}

function prefetchRefPngs(browserType, task) {
  if (
    task.type !== "eq" &&
    task.type !== "partial" &&
    task.type !== "text" &&
    task.type !== "highlight" &&
    task.type !== "extract"
  ) {
    return;
  }
  const refSnapshotDir = path.join(
    refsDir,
    os.platform(),
    browserType,
    task.id
  );
  const firstPage = task.firstPage || 1;
  const lastPage = task.lastPage;
  // 0-indexed so pages[p-1] = promise for `${p}.png`, matching checkEq's loop.
  const pages = [];
  for (let p = firstPage; p <= lastPage; p++) {
    pages[p - 1] = fs.promises
      .readFile(path.join(refSnapshotDir, `${p}.png`))
      .catch(err => (err.code === "ENOENT" ? null : Promise.reject(err)));
  }
  refPngCache.set(`${browserType}/${task.id}`, pages);
}

async function checkEq(task, results, session, masterMode) {
  const taskId = task.id;
  const browserType = session.browserType ?? session.name;
  const refSnapshotDir = path.join(refsDir, os.platform(), browserType, taskId);
  const testSnapshotDir = path.join(
    testResultDir,
    os.platform(),
    browserType,
    taskId
  );
  const tmpSnapshotDir = masterMode
    ? path.join(refsTmpDir, os.platform(), browserType, taskId)
    : null;

  const pageResults = results[0];
  const taskType = task.type;
  let numEqNoSnapshot = 0;
  let numEqFailures = 0;

  const cacheKey = `${browserType}/${taskId}`;
  const cachedPages = refPngCache.get(cacheKey);
  refPngCache.delete(cacheKey);

  // Consume pre-started ref PNG reads (started when the task was dispatched),
  // falling back to a fresh read if the cache entry is missing.
  const refSnapshots = await Promise.all(
    pageResults.map((pageResult, page) => {
      if (!pageResult || !(pageResult.snapshot instanceof Buffer)) {
        return null;
      }
      return (
        cachedPages?.[page] ??
        fs.promises
          .readFile(path.join(refSnapshotDir, `${page + 1}.png`))
          .catch(err => {
            if (err.code === "ENOENT") {
              return null;
            }
            throw err;
          })
      );
    })
  );

  // Compare all pages (in-memory) and collect all I/O writes to fire together.
  const writePromises = [];
  const logEntries = [];
  let testDirCreated = false;
  let tmpDirCreated = false;

  for (let page = 0; page < pageResults.length; page++) {
    const pageResult = pageResults[page];
    if (!pageResult) {
      continue;
    }
    const testSnapshot = pageResult.snapshot;
    if (!(testSnapshot instanceof Buffer)) {
      console.error("Valid snapshot was not found.");
      continue;
    }
    const unoptimizedSnapshot = pageResult.baselineSnapshot ?? null;
    const refSnapshot = refSnapshots[page];

    let eq = false;
    if (!refSnapshot) {
      numEqNoSnapshot++;
      if (!masterMode) {
        console.log(
          `WARNING: no reference snapshot ${path.join(refSnapshotDir, `${page + 1}.png`)}`
        );
      }
    } else {
      eq =
        Buffer.compare(
          stripPrivatePngChunks(refSnapshot),
          stripPrivatePngChunks(testSnapshot)
        ) === 0;
      if (!eq) {
        console.log(
          `${TEST_UNEXPECTED_FAIL} | ${taskType} ${taskId} | in ${colorBrowser(session.name)} | rendering of page ${page + 1} != reference rendering`
        );

        if (!testDirCreated) {
          ensureDirSync(testSnapshotDir);
          testDirCreated = true;
        }
        const testPng = path.join(testSnapshotDir, `${page + 1}.png`);
        const refPng = path.join(testSnapshotDir, `${page + 1}_ref.png`);
        writePromises.push(
          fs.promises.writeFile(testPng, testSnapshot),
          fs.promises.writeFile(refPng, refSnapshot)
        );

        // This no longer follows the format of Mozilla reftest output.
        const viewportString = `(${pageResult.viewportWidth}x${pageResult.viewportHeight}x${pageResult.outputScale})`;
        logEntries.push(
          `REFTEST TEST-UNEXPECTED-FAIL | ${session.name}-${taskId}-page${page + 1} | image comparison (==)\n` +
            `REFTEST   IMAGE 1 (TEST)${viewportString}: ${testPng}\n` +
            `REFTEST   IMAGE 2 (REFERENCE)${viewportString}: ${refPng}\n`
        );
        numEqFailures++;
      }
    }
    if (masterMode && (!refSnapshot || !eq)) {
      if (!tmpDirCreated) {
        ensureDirSync(tmpSnapshotDir);
        tmpDirCreated = true;
      }
      writePromises.push(
        fs.promises.writeFile(
          path.join(tmpSnapshotDir, `${page + 1}.png`),
          unoptimizedSnapshot ?? testSnapshot
        )
      );
    }
  }

  if (logEntries.length) {
    writePromises.push(fs.promises.appendFile(eqLog, logEntries.join("")));
  }
  await Promise.all(writePromises);

  session.numEqNoSnapshot += numEqNoSnapshot;
  if (numEqFailures > 0) {
    session.numEqFailures += numEqFailures;
  } else {
    console.log(
      `${TEST_PASSED} | ${taskType} test ${taskId} | in ${colorBrowser(session.name)}`
    );
  }
}

function checkFBF(task, results, session, masterMode) {
  var numFBFFailures = 0;
  var round0 = results[0],
    round1 = results[1];
  if (round0.length !== round1.length) {
    console.error("round 1 and 2 sizes are different");
  }

  for (var page = 0; page < round1.length; page++) {
    var r0Page = round0[page],
      r1Page = round1[page];
    if (!r0Page) {
      continue;
    }
    if (Buffer.compare(r0Page.snapshot, r1Page.snapshot) !== 0) {
      // The FBF tests fail intermittently in Firefox and Google Chrome when run
      // on the bots, ignoring `makeref` failures for now; see
      //  - https://github.com/mozilla/pdf.js/pull/12368
      //  - https://github.com/mozilla/pdf.js/pull/11491
      //
      // TODO: Figure out why this happens, so that we can remove the hack; see
      //       https://github.com/mozilla/pdf.js/issues/12371
      if (masterMode) {
        console.log(
          `TEST-SKIPPED | forward-back-forward test ${task.id} | in ${colorBrowser(session.name)} | page${page + 1}`
        );
        continue;
      }

      console.log(
        `${TEST_UNEXPECTED_FAIL} | forward-back-forward test ${task.id} | in ${colorBrowser(session.name)} | first rendering of page ${page + 1} != second`
      );
      numFBFFailures++;
    }
  }

  if (numFBFFailures > 0) {
    session.numFBFFailures += numFBFFailures;
  } else {
    console.log(
      `${TEST_PASSED} | forward-back-forward test ${task.id} | in ${colorBrowser(session.name)}`
    );
  }
}

function checkLoad(task, results, browser) {
  // Load just checks for absence of failure, so if we got here the
  // test has passed
  console.log(
    `${TEST_PASSED} | load test ${task.id} | in ${colorBrowser(browser)}`
  );
}

async function checkRefTestResults(browser, id, results) {
  var failed = false;
  var session = getSession(browser);
  var task = session.tasks[id];
  session.numRuns++;

  results.forEach(function (roundResults, round) {
    roundResults.forEach(function (pageResult, page) {
      if (!pageResult) {
        return; // no results
      }
      if (pageResult.failure) {
        // If the test failes due to a difference between the optimized and
        // unoptimized rendering, we don't set `failed` to true so that we will
        // still compute the differences between them. In master mode, this
        // means that we will save the reference image from the unoptimized
        // rendering even if the optimized rendering is wrong.
        if (!pageResult.failure.includes("Optimized rendering differs")) {
          failed = true;
        }
        if (fs.existsSync(task.file + ".error")) {
          console.log(
            "TEST-SKIPPED | PDF was not downloaded " +
              id +
              " | in " +
              colorBrowser(browser) +
              " | page" +
              (page + 1) +
              " round " +
              (round + 1) +
              " | " +
              pageResult.failure
          );
        } else {
          if (failed) {
            session.numErrors++;
          }
          console.log(
            `${TEST_UNEXPECTED_FAIL} | test failed ${id} | in ${colorBrowser(browser)} | page${page + 1} round ${round + 1} | ${pageResult.failure}`
          );
        }
      }
    });
  });
  const browserType = session.browserType ?? session.name;
  if (failed) {
    refPngCache.delete(`${browserType}/${id}`);
  } else {
    switch (task.type) {
      case "eq":
      case "partial":
      case "text":
      case "highlight":
      case "extract":
        await checkEq(task, results, session, session.masterMode);
        break;
      case "fbf":
        checkFBF(task, results, session, session.masterMode);
        break;
      case "load":
        checkLoad(task, results, session.name);
        break;
      default:
        throw new Error("Unknown test type");
    }
  }
  // Clear snapshot buffers and drop the task entry from the session.
  results.forEach(function (roundResults) {
    roundResults.forEach(function (pageResult) {
      if (pageResult) {
        pageResult.snapshot = null;
        pageResult.baselineSnapshot = null;
      }
    });
  });
  delete session.taskResults[id];
  delete session.tasks[id];
}

async function handleWsBinaryResult(data) {
  // Binary frame layout:
  //   [4 bytes BE: meta_len][meta JSON][4 bytes BE: snapshot_len]
  //   [snapshot PNG][baseline PNG (rest)]
  const metaLen = data.readUInt32BE(0);
  const meta = JSON.parse(data.subarray(4, 4 + metaLen).toString("utf8"));
  const snapshotLen = data.readUInt32BE(4 + metaLen);
  const snapshotOffset = 8 + metaLen;
  // Copy slices so the original WS frame buffer can be GC'd immediately.
  const snapshot = Buffer.from(
    data.subarray(snapshotOffset, snapshotOffset + snapshotLen)
  );
  const baseline =
    data.length > snapshotOffset + snapshotLen
      ? Buffer.from(data.subarray(snapshotOffset + snapshotLen))
      : null;

  const { browser, id, round, page, failure, lastPageNum, numberOfTasks } =
    meta;
  const session = getSession(browser);
  monitorBrowserTimeout(session, handleSessionTimeout);

  const taskResults = session.taskResults[id];
  if (!taskResults[round]) {
    taskResults[round] = [];
  }
  if (taskResults[round][page - 1]) {
    console.error(
      `Results for ${browser}:${id}:${round}:${page - 1} were already submitted`
    );
    // TODO abort testing here?
  }
  taskResults[round][page - 1] = {
    failure,
    snapshot,
    baselineSnapshot: baseline,
    viewportWidth: meta.viewportWidth,
    viewportHeight: meta.viewportHeight,
    outputScale: meta.outputScale,
  };
  if (stats) {
    stats.push({ browser, pdf: id, page: page - 1, round, stats: meta.stats });
  }

  const lastTaskResults = taskResults.at(-1);
  const isDone =
    !!lastTaskResults?.[lastPageNum - 1] ||
    lastTaskResults?.filter(Boolean).length === numberOfTasks;
  if (isDone) {
    await checkRefTestResults(browser, id, taskResults);
    session.remaining--;
  }
}

function refTestPostHandler(parsedUrl, req, res) {
  if (parsedUrl.pathname !== "/info") {
    return false;
  }
  var body = "";
  req.on("data", function (data) {
    body += data;
  });
  req.on("end", function () {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end();
    console.log(JSON.parse(body).message);
  });
  return true;
}

function onAllSessionsClosedAfterTests(name) {
  const startTime = Date.now();
  return function () {
    stopServer();
    var numRuns = 0,
      numErrors = 0;
    sessions.forEach(function (session) {
      numRuns += session.numRuns;
      numErrors += session.numErrors;
    });
    console.log();
    console.log("Run " + numRuns + " tests");
    if (!numRuns) {
      console.log(`OHNOES!  No ${name} tests ran!`);
    } else if (numErrors > 0) {
      console.log("OHNOES!  Some " + name + " tests failed!");
      console.log("  " + numErrors + " of " + numRuns + " failed");
      console.log("Here are the failing tests:");
      for (const session of sessions) {
        for (const { description, error } of session.failures ?? []) {
          let line = `  - in ${colorBrowser(session.name)} | ${description}`;
          if (error) {
            line += ` | ${error.replaceAll(/\s+/g, " ").trim()}`;
          }
          console.log(line);
        }
      }
    } else {
      console.log("All " + name + " tests passed.");
    }
    var runtime = (Date.now() - startTime) / 1000;
    console.log(name + " tests runtime was " + runtime.toFixed(1) + " seconds");
    process.exit(numErrors > 0 ? 1 : 0);
  };
}

async function startUnitTest(testUrl, name) {
  onAllSessionsClosed = onAllSessionsClosedAfterTests(name);
  startServer();
  server.hooks.POST.push(unitTestPostHandler);

  await startBrowsers({
    baseUrl: `http://${host}:${server.port}${testUrl}`,
    initializeSession: session => {
      session.numRuns = 0;
      session.numErrors = 0;
      session.failures = [];
    },
  });
}

async function startIntegrationTest() {
  onAllSessionsClosed = onAllSessionsClosedAfterTests("integration");
  startServer();

  const { runTests } = await import("./integration/jasmine-boot.js");
  await startBrowsers({
    baseUrl: null,
    initializeSession: session => {
      session.numRuns = 0;
      session.numErrors = 0;
      session.failures = [];
    },
  });
  global.integrationBaseUrl = `http://${host}:${server.port}/build/generic/web/viewer.html`;
  global.integrationSessions = sessions;

  const results = { runs: 0, failures: 0, failureList: [] };
  await runTests(results);
  sessions[0].numRuns = results.runs;
  sessions[0].numErrors = results.failures;
  sessions[0].failures = results.failureList;
  sessions[0].coverage = globalThis.__coverage__;
  await Promise.all(sessions.map(session => closeSession(session.name)));
}

function unitTestPostHandler(parsedUrl, req, res) {
  var pathname = parsedUrl.pathname;
  if (
    pathname !== "/tellMeToQuit" &&
    pathname !== "/info" &&
    pathname !== "/ttx" &&
    pathname !== "/submit_task_results"
  ) {
    return false;
  }

  var body = "";
  req.on("data", function (data) {
    body += data;
  });
  req.on("end", async function () {
    if (pathname === "/ttx") {
      res.writeHead(200, { "Content-Type": "text/xml" });
      try {
        res.end(await translateFont(body));
      } catch (error) {
        res.end(`<error>${error}</error>`);
      }
      return;
    }

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end();

    var data = JSON.parse(body);
    if (pathname === "/tellMeToQuit") {
      closeSession(data.browser);
      return;
    }
    if (pathname === "/info") {
      console.log(data.message);
      return;
    }
    var session = getSession(data.browser);
    session.numRuns++;
    let status = data.status;
    if (status === "TEST-UNEXPECTED-FAIL") {
      status = TEST_UNEXPECTED_FAIL;
    } else if (status === "TEST-PASS") {
      status = TEST_PASSED;
    }
    var message =
      status + " | " + data.description + " | in " + colorBrowser(session.name);
    if (data.status === "TEST-UNEXPECTED-FAIL") {
      session.numErrors++;
      session.failures.push({
        description: data.description,
        error: data.error,
      });
    }
    if (data.error) {
      message += " | " + data.error;
    }
    console.log(message);
  });
  return true;
}

async function startBrowser({
  browserName,
  headless = options.headless,
  startUrl,
  extraPrefsFirefox = {},
}) {
  const options = {
    browser: browserName,
    protocol: "webDriverBiDi",
    headless,
    dumpio: true,
    defaultViewport: null,
    ignoreDefaultArgs: ["--disable-extensions"],
    // The timeout for individual protocol (BiDi) calls should always be lower
    // than the Jasmine timeout. This way protocol errors are always raised in
    // the context of the tests that actually triggered them and don't leak
    // through to other tests (causing unrelated failures or tracebacks). The
    // timeout is set to 75% of the Jasmine timeout to catch operation errors
    // later in the test run and because if a single operation takes that long
    // it can't possibly succeed anymore.
    protocolTimeout: 0.75 * /* jasmine.DEFAULT_TIMEOUT_INTERVAL = */ 30000,
  };

  if (!tempDir) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdfjs-"));
  }
  const printFile = path.join(tempDir, "print.pdf");

  if (browserName === "chrome") {
    // Slow down protocol calls by the given number of milliseconds. In Chrome
    // protocol calls are faster than in Firefox and thus trigger in quicker
    // succession. This can cause intermittent failures because new protocol
    // calls can run before events triggered by the previous protocol calls had
    // a chance to be processed (essentially causing events to get lost). This
    // value gives Chrome a more similar execution speed as Firefox.
    options.slowMo = 5;

    // avoid crash
    options.args = ["--no-sandbox", "--disable-setuid-sandbox"];
    // silent printing in a pdf
    options.args.push("--kiosk-printing");
  }

  if (browserName === "firefox") {
    options.extraPrefsFirefox = {
      // Disable system addon updates.
      "extensions.systemAddon.update.enabled": false,
      // avoid to have a prompt when leaving a page with a form
      "dom.disable_beforeunload": true,
      // Disable dialog when saving a pdf
      "pdfjs.disabled": true,
      "browser.helperApps.neverAsk.saveToDisk": "application/pdf",
      // Avoid popup when saving is done
      "browser.download.always_ask_before_handling_new_types": true,
      "browser.download.panel.shown": true,
      "browser.download.alwaysOpenPanel": false,
      // Save file in output
      "browser.download.folderList": 2,
      "browser.download.dir": tempDir,
      // Print silently in a pdf
      "print.always_print_silent": true,
      print_printer: "PDF",
      "print.printer_PDF.print_to_file": true,
      "print.printer_PDF.print_to_filename": printFile,
      // Disable gpu acceleration
      "gfx.canvas.accelerated": false,
      // It's helpful to see where the caret is.
      "accessibility.browsewithcaret": true,
      // Disable the newtabpage stuff.
      "browser.newtabpage.enabled": false,
      // Disable network connections to Contile.
      "browser.topsites.contile.enabled": false,
      // Disable logging for remote settings.
      "services.settings.loglevel": "off",
      // Disable AI/ML functionality.
      "browser.ai.control.default": "blocked",
      "privacy.baselineFingerprintingProtection": false,
      // Disable bounce tracking protection to avoid creating a SQLite database
      // file that Firefox keeps locked briefly after shutdown, causing EBUSY
      // errors in Puppeteer's profile cleanup on Windows.
      "privacy.bounceTrackingProtection.mode": 0,
      ...extraPrefsFirefox,
    };
  }

  const browser = await puppeteer.launch(options);

  if (startUrl) {
    const pages = await browser.pages();
    const page = pages[0];
    await page.goto(startUrl, { timeout: 0, waitUntil: "domcontentloaded" });
  }

  return browser;
}

async function startBrowsers({ baseUrl, initializeSession, numSessions = 1 }) {
  // Remove old browser revisions from Puppeteer's cache. Updating Puppeteer can
  // cause new browser revisions to be downloaded, so trimming the cache will
  // prevent the disk from filling up over time.
  await puppeteer.trimCache();

  const browserNames = ["firefox", "chrome"];
  if (options.noChrome) {
    browserNames.splice(1, 1);
  }
  if (options.noFirefox) {
    browserNames.splice(0, 1);
  }
  for (const browserName of browserNames) {
    for (let i = 0; i < numSessions; i++) {
      // When running multiple sessions per browser, append an index suffix to
      // keep session names unique. With a single session, use the plain browser
      // name for backward compatibility.
      const sessionName =
        numSessions === 1 ? browserName : `${browserName}-${i}`;

      // The session must be pushed first and augmented with the browser once
      // it's initialized. The reason for this is that browser initialization
      // takes more time when the browser is not found locally yet and we don't
      // want `onAllSessionsClosed` to trigger if one of the browsers is done
      // and the other one is still initializing, since that would mean that
      // once the browser is initialized the server would have stopped already.
      // Pushing the session first ensures that `onAllSessionsClosed` will
      // only trigger once all browsers are initialized and done.
      const session = {
        name: sessionName,
        browserType: browserName,
        sessionIndex: i,
        sessionCount: numSessions,
        browser: undefined,
        page: undefined,
        closed: false,
      };
      sessions.push(session);

      let startUrl = "";
      if (baseUrl) {
        startUrl =
          `${baseUrl}?browser=${encodeURIComponent(sessionName)}` +
          `&testFilter=${JSON.stringify(options.testfilter)}` +
          `&delay=${options.statsDelay}&masterMode=${options.masterMode}` +
          `&coveragePerTest=${global.coveragePerTest || false}`;
      }
      await startBrowser({ browserName, startUrl })
        .then(async function (browser) {
          session.browser = browser;
          const pages = await browser.pages();
          session.page = pages[0];
          initializeSession(session);
        })
        .catch(function (ex) {
          console.log(`Error while starting ${browserName}: ${ex.message}`);
          closeSession(sessionName);
        });
    }
  }
}

function startServer() {
  server = new WebServer({
    root: "..",
    host,
    port: options.port,
    cacheExpirationTime: 3600,
    coverageEnabled: global.coverageEnabled || false,
  });
  server.start();
}

function stopServer() {
  server.stop();
}

function getSession(browser) {
  return sessions.find(session => session.name === browser);
}

function accumulatePerTestCoverage(testId, counts) {
  let testIdx = perTestIdMap.get(testId);
  if (testIdx === undefined) {
    testIdx = perTestIds.length;
    perTestIds.push(testId);
    perTestIdMap.set(testId, testIdx);
  }
  for (const [fileKey, { fstarts, lines, funcs }] of Object.entries(counts)) {
    let entry = perTestFileIndex.get(fileKey);
    if (!entry) {
      entry = {
        fstarts: Object.create(null),
        lineMap: new Map(),
        funcMap: new Map(),
      };
      perTestFileIndex.set(fileKey, entry);
    }
    if (fstarts && Object.keys(entry.fstarts).length === 0) {
      Object.assign(entry.fstarts, fstarts);
    }
    for (const line of lines) {
      let set = entry.lineMap.get(line);
      if (!set) {
        set = new Set();
        entry.lineMap.set(line, set);
      }
      set.add(testIdx);
    }
    for (const func of funcs) {
      let set = entry.funcMap.get(func);
      if (!set) {
        set = new Set();
        entry.funcMap.set(func, set);
      }
      set.add(testIdx);
    }
  }
}

async function writeCoverageData(outputDirectory) {
  try {
    console.log("\n### Writing code coverage data");

    // Merge coverage from all sessions
    const mergedCoverage = istanbulCoverage.createCoverageMap();
    for (const session of sessions) {
      if (session.coverage) {
        mergedCoverage.merge(
          istanbulCoverage.createCoverageMap(session.coverage)
        );
      }
    }

    const projectRoot = path.join(__dirname, "..");

    // create a context for report generation
    const context = libReport.createContext({
      dir: path.join(__dirname, "..", outputDirectory),
      coverageMap: mergedCoverage,
    });

    for (const fmt of global.coverageFormats ?? ["info"]) {
      istanbulReportGenerator
        .create(COVERAGE_FORMAT_TO_REPORTER[fmt], { projectRoot })
        .execute(context);
    }

    console.log(`Total files covered: ${mergedCoverage.files().length}`);

    if (global.coveragePerTest && perTestIds.length > 0) {
      const files = Object.create(null);
      for (const [fileKey, { fstarts, lineMap, funcMap }] of perTestFileIndex) {
        const fileObj = Object.create(null);
        if (Object.keys(fstarts).length > 0) {
          fileObj.fstarts = fstarts;
        }
        if (lineMap.size > 0) {
          const l = Object.create(null);
          for (const [line, tests] of lineMap) {
            l[line] = [...tests].sort((a, b) => a - b);
          }
          fileObj.l = l;
        }
        if (funcMap.size > 0) {
          const f = Object.create(null);
          for (const [name, tests] of funcMap) {
            f[name] = [...tests].sort((a, b) => a - b);
          }
          fileObj.f = f;
        }
        files[fileKey] = fileObj;
      }
      const indexPath = path.join(
        __dirname,
        "..",
        outputDirectory,
        "per-test-index.json"
      );
      fs.writeFileSync(indexPath, JSON.stringify({ ids: perTestIds, files }));
      console.log(
        `Per-test index written to ${outputDirectory}/per-test-index.json`
      );
    }
  } catch (err) {
    console.error("Failed to write coverage data:", err);
  }
}

async function closeSession(browser) {
  for (const session of sessions) {
    if (session.name !== browser) {
      continue;
    }
    if (session.browser !== undefined) {
      // Collect coverage before closing (works with both Chrome and Firefox)
      if (global.coverageEnabled && session.page !== undefined) {
        try {
          // Extract window.__coverage__ which is populated by
          // babel-plugin-istanbul
          const coverageJson = await session.page.evaluate(() =>
            JSON.stringify(window.__coverage__)
          );
          const coverage = coverageJson ? JSON.parse(coverageJson) : null;

          if (coverage && Object.keys(coverage).length > 0) {
            session.coverage = coverage;
            console.log(
              `Collected coverage from ${browser}: ${Object.keys(coverage).length} files`
            );
          }
        } catch (err) {
          console.warn(
            `Failed to collect coverage for ${browser}:`,
            err.message
          );
        }
      }

      await session.browser.close();
    }
    session.closed = true;
    const allClosed = sessions.every(s => s.closed);
    if (allClosed) {
      // Write coverage data if enabled
      if (global.coverageEnabled) {
        await writeCoverageData(global.coverageOutput);
      }

      if (tempDir) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      onAllSessionsClosed?.();
    }
  }
}

async function ensurePDFsDownloaded() {
  const manifest = getTestManifest();
  await downloadManifestFiles(manifest);
  try {
    await verifyManifestFiles(manifest);
  } catch {
    console.log(
      "Unable to verify the checksum for the files that are " +
        "used for testing."
    );
    console.log(
      "Please re-download the files, or adjust the MD5 " +
        "checksum in the manifest for the files listed above.\n"
    );
    if (options.strictVerify) {
      process.exit(1);
    }
  }
}

async function main() {
  if (options.statsFile) {
    stats = [];
  }

  if (options.coverage || options.coveragePerTest) {
    global.coverageEnabled = true;
    console.log("\n### Code coverage enabled for browser tests");
    if (options.coverageOutput) {
      global.coverageOutput = options.coverageOutput;
      console.log(
        `### Code coverage output directory: ${options.coverageOutput}`
      );
    }
    global.coverageFormats = parseCoverageFormats(options.coverageFormats);
    console.log(
      `### Coverage formats: ${[...global.coverageFormats].join(", ")}`
    );
    if (options.coveragePerTest) {
      global.coveragePerTest = true;
      console.log("### Per-test coverage reports enabled");
    }
  }

  try {
    if (options.downloadOnly) {
      await ensurePDFsDownloaded();
    } else if (options.unitTest) {
      // Allows linked PDF files in unit-tests as well.
      await ensurePDFsDownloaded();
      await startUnitTest("/test/unit/unit_test.html", "unit");
    } else if (options.fontTest) {
      await startUnitTest("/test/font/font_test.html", "font");
    } else if (options.integration) {
      // Allows linked PDF files in integration-tests as well.
      await ensurePDFsDownloaded();
      await startIntegrationTest();
    } else {
      await startRefTest(options.masterMode, options.reftest);
    }
  } catch (e) {
    // Close the browsers if uncaught exceptions occur, otherwise the spawned
    // processes can become orphaned and keep running after `test.mjs` exits
    // because the teardown logic of the tests did not get a chance to run.
    console.error(e);
    await Promise.all(sessions.map(session => closeSession(session.name)));
  }
}

var server;
var sessions = [];
var onAllSessionsClosed;
var host = "127.0.0.1";
var options = parseOptions();
var stats;
var tempDir = null;
var taskQueue = new Map();
var refPngCache = new Map();
const perTestIds = [];
const perTestIdMap = new Map();
const perTestFileIndex = new Map();

main();

export { startBrowser };
