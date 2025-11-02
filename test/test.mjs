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
/* eslint-disable no-var */

import { copySubtreeSync, ensureDirSync } from "./testutils.mjs";
import {
  downloadManifestFiles,
  verifyManifestFiles,
} from "./downloadutils.mjs";
import fs from "fs";
import os from "os";
import path from "path";
import puppeteer from "puppeteer";
import readline from "readline";
import { translateFont } from "./font/ttxdriver.mjs";
import { WebServer } from "./webserver.mjs";
import yargs from "yargs";

function parseOptions() {
  const parsedArgs = yargs(process.argv)
    .usage("Usage: $0")
    .option("downloadOnly", {
      default: false,
      describe: "Download test PDFs without running the tests.",
      type: "boolean",
    })
    .option("fontTest", {
      default: false,
      describe: "Run the font tests.",
      type: "boolean",
    })
    .option("help", {
      alias: "h",
      default: false,
      describe: "Show this help message.",
      type: "boolean",
    })
    .option("integration", {
      default: false,
      describe: "Run the integration tests.",
      type: "boolean",
    })
    .option("manifestFile", {
      default: "test_manifest.json",
      describe: "A path to JSON file in the form of `test_manifest.json`.",
      type: "string",
    })
    .option("masterMode", {
      alias: "m",
      default: false,
      describe: "Run the script in master mode.",
      type: "boolean",
    })
    .option("noChrome", {
      default: false,
      describe: "Skip Chrome when running tests.",
      type: "boolean",
    })
    .option("noFirefox", {
      default: false,
      describe: "Skip Firefox when running tests.",
      type: "boolean",
    })
    .option("noDownload", {
      default: false,
      describe: "Skip downloading of test PDFs.",
      type: "boolean",
    })
    .option("noPrompts", {
      default: false,
      describe: "Uses default answers (intended for CLOUD TESTS only!).",
      type: "boolean",
    })
    .option("headless", {
      default: false,
      describe:
        "Run the tests in headless mode, i.e. without visible browser windows.",
      type: "boolean",
    })
    .option("port", {
      default: 0,
      describe: "The port the HTTP server should listen on.",
      type: "number",
    })
    .option("reftest", {
      default: false,
      describe:
        "Automatically start reftest showing comparison test failures, if there are any.",
      type: "boolean",
    })
    .option("statsDelay", {
      default: 0,
      describe:
        "The amount of time in milliseconds the browser should wait before starting stats.",
      type: "number",
    })
    .option("statsFile", {
      default: "",
      describe: "The file where to store stats.",
      type: "string",
    })
    .option("strictVerify", {
      default: false,
      describe: "Error if verifying the manifest files fails.",
      type: "boolean",
    })
    .option("testfilter", {
      alias: "t",
      default: [],
      describe: "Run specific reftest(s).",
      type: "array",
    })
    .example(
      "testfilter",
      "$0 -t=issue5567 -t=issue5909\n" +
        "Run the reftest identified by issue5567 and issue5909."
    )
    .option("unitTest", {
      default: false,
      describe: "Run the unit tests.",
      type: "boolean",
    })
    .option("xfaOnly", {
      default: false,
      describe: "Only run the XFA reftest(s).",
      type: "boolean",
    })
    .check(argv => {
      if (
        +argv.reftest + argv.unitTest + argv.fontTest + argv.masterMode <=
        1
      ) {
        return true;
      }
      throw new Error(
        "--reftest, --unitTest, --fontTest, and --masterMode must not be specified together."
      );
    })
    .check(argv => {
      if (
        +argv.unitTest + argv.fontTest + argv.integration + argv.xfaOnly <=
        1
      ) {
        return true;
      }
      throw new Error(
        "--unitTest, --fontTest, --integration, and --xfaOnly must not be specified together."
      );
    })
    .check(argv => {
      if (argv.testfilter?.length > 0 && argv.xfaOnly) {
        throw new Error("--testfilter and --xfaOnly cannot be used together.");
      }
      return true;
    })
    .check(argv => {
      if (!argv.noDownload || !argv.downloadOnly) {
        return true;
      }
      throw new Error(
        "--noDownload and --downloadOnly cannot be used together."
      );
    })
    .check(argv => {
      if (!argv.masterMode || argv.manifestFile === "test_manifest.json") {
        return true;
      }
      throw new Error(
        "when --masterMode is specified --manifestFile shall be equal to `test_manifest.json`."
      );
    });

  const result = parsedArgs.argv;
  result.testfilter = Array.isArray(result.testfilter)
    ? result.testfilter
    : [result.testfilter];
  return result;
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
    onAllSessionsClosed = finalize;

    await startBrowsers({
      baseUrl: `http://${host}:${server.port}/test/test_slave.html`,
      initializeSession: session => {
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
  var browser = session.name;
  console.log(
    "TEST-UNEXPECTED-FAIL | test failed " +
      browser +
      " has not responded in " +
      browserTimeout +
      "s"
  );
  session.numErrors += session.remaining;
  session.remaining = 0;
  closeSession(browser);
}

function getTestManifest(label = null) {
  var manifest = JSON.parse(fs.readFileSync(options.manifestFile));

  const testFilter = options.testfilter.slice(0),
    xfaOnly = options.xfaOnly;
  if (label || testFilter.length || xfaOnly) {
    manifest = manifest.filter(function (item) {
      var i = testFilter.indexOf(item.id);
      if (i !== -1) {
        testFilter.splice(i, 1);
        return true;
      }
      if (label && item.labels?.includes(label)) {
        return true;
      }
      if (xfaOnly && item.enableXfa) {
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

function checkEq(task, results, browser, masterMode) {
  var taskId = task.id;
  var refSnapshotDir = path.join(refsDir, os.platform(), browser, taskId);
  var testSnapshotDir = path.join(
    testResultDir,
    os.platform(),
    browser,
    taskId
  );

  var pageResults = results[0];
  var taskType = task.type;
  var numEqNoSnapshot = 0;
  var numEqFailures = 0;
  for (var page = 0; page < pageResults.length; page++) {
    if (!pageResults[page]) {
      continue;
    }
    const pageResult = pageResults[page];
    let testSnapshot = pageResult.snapshot;
    if (testSnapshot?.startsWith("data:image/png;base64,")) {
      testSnapshot = Buffer.from(testSnapshot.substring(22), "base64");
    } else {
      console.error("Valid snapshot was not found.");
    }
    let unoptimizedSnapshot = pageResult.baselineSnapshot;
    if (unoptimizedSnapshot?.startsWith("data:image/png;base64,")) {
      unoptimizedSnapshot = Buffer.from(
        unoptimizedSnapshot.substring(22),
        "base64"
      );
    }

    var refSnapshot = null;
    var eq = false;
    var refPath = path.join(refSnapshotDir, page + 1 + ".png");
    if (!fs.existsSync(refPath)) {
      numEqNoSnapshot++;
      if (!masterMode) {
        console.log("WARNING: no reference snapshot " + refPath);
      }
    } else {
      refSnapshot = fs.readFileSync(refPath);
      eq = refSnapshot.toString("hex") === testSnapshot.toString("hex");
      if (!eq) {
        console.log(
          "TEST-UNEXPECTED-FAIL | " +
            taskType +
            " " +
            taskId +
            " | in " +
            browser +
            " | rendering of page " +
            (page + 1) +
            " != reference rendering"
        );

        ensureDirSync(testSnapshotDir);
        fs.writeFileSync(
          path.join(testSnapshotDir, page + 1 + ".png"),
          testSnapshot
        );
        fs.writeFileSync(
          path.join(testSnapshotDir, page + 1 + "_ref.png"),
          refSnapshot
        );

        // This no longer follows the format of Mozilla reftest output.
        const viewportString = `(${pageResult.viewportWidth}x${pageResult.viewportHeight}x${pageResult.outputScale})`;
        fs.appendFileSync(
          eqLog,
          "REFTEST TEST-UNEXPECTED-FAIL | " +
            browser +
            "-" +
            taskId +
            "-page" +
            (page + 1) +
            " | image comparison (==)\n" +
            `REFTEST   IMAGE 1 (TEST)${viewportString}: ` +
            path.join(testSnapshotDir, page + 1 + ".png") +
            "\n" +
            `REFTEST   IMAGE 2 (REFERENCE)${viewportString}: ` +
            path.join(testSnapshotDir, page + 1 + "_ref.png") +
            "\n"
        );
        numEqFailures++;
      }
    }
    if (masterMode && (!refSnapshot || !eq)) {
      var tmpSnapshotDir = path.join(
        refsTmpDir,
        os.platform(),
        browser,
        taskId
      );
      ensureDirSync(tmpSnapshotDir);
      fs.writeFileSync(
        path.join(tmpSnapshotDir, page + 1 + ".png"),
        unoptimizedSnapshot ?? testSnapshot
      );
    }
  }

  var session = getSession(browser);
  session.numEqNoSnapshot += numEqNoSnapshot;
  if (numEqFailures > 0) {
    session.numEqFailures += numEqFailures;
  } else {
    console.log(
      "TEST-PASS | " + taskType + " test " + taskId + " | in " + browser
    );
  }
}

function checkFBF(task, results, browser, masterMode) {
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
    if (r0Page.snapshot !== r1Page.snapshot) {
      // The FBF tests fail intermittently in Firefox and Google Chrome when run
      // on the bots, ignoring `makeref` failures for now; see
      //  - https://github.com/mozilla/pdf.js/pull/12368
      //  - https://github.com/mozilla/pdf.js/pull/11491
      //
      // TODO: Figure out why this happens, so that we can remove the hack; see
      //       https://github.com/mozilla/pdf.js/issues/12371
      if (masterMode) {
        console.log(
          "TEST-SKIPPED | forward-back-forward test " +
            task.id +
            " | in " +
            browser +
            " | page" +
            (page + 1)
        );
        continue;
      }

      console.log(
        "TEST-UNEXPECTED-FAIL | forward-back-forward test " +
          task.id +
          " | in " +
          browser +
          " | first rendering of page " +
          (page + 1) +
          " != second"
      );
      numFBFFailures++;
    }
  }

  if (numFBFFailures > 0) {
    getSession(browser).numFBFFailures += numFBFFailures;
  } else {
    console.log(
      "TEST-PASS | forward-back-forward test " + task.id + " | in " + browser
    );
  }
}

function checkLoad(task, results, browser) {
  // Load just checks for absence of failure, so if we got here the
  // test has passed
  console.log("TEST-PASS | load test " + task.id + " | in " + browser);
}

function checkRefTestResults(browser, id, results) {
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
              browser +
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
            "TEST-UNEXPECTED-FAIL | test failed " +
              id +
              " | in " +
              browser +
              " | page" +
              (page + 1) +
              " round " +
              (round + 1) +
              " | " +
              pageResult.failure
          );
        }
      }
    });
  });
  if (failed) {
    return;
  }
  switch (task.type) {
    case "eq":
    case "partial":
    case "text":
    case "highlight":
    case "extract":
      checkEq(task, results, browser, session.masterMode);
      break;
    case "fbf":
      checkFBF(task, results, browser, session.masterMode);
      break;
    case "load":
      checkLoad(task, results, browser);
      break;
    default:
      throw new Error("Unknown test type");
  }
  // clear memory
  results.forEach(function (roundResults, round) {
    roundResults.forEach(function (pageResult, page) {
      pageResult.snapshot = null;
    });
  });
}

function refTestPostHandler(parsedUrl, req, res) {
  var pathname = parsedUrl.pathname;
  if (
    pathname !== "/tellMeToQuit" &&
    pathname !== "/info" &&
    pathname !== "/submit_task_results"
  ) {
    return false;
  }

  var body = "";
  req.on("data", function (data) {
    body += data;
  });
  req.on("end", function () {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end();

    var session;
    if (pathname === "/tellMeToQuit") {
      session = getSession(parsedUrl.searchParams.get("browser"));
      monitorBrowserTimeout(session, null);
      closeSession(session.name);
      return;
    }

    var data = JSON.parse(body);
    if (pathname === "/info") {
      console.log(data.message);
      return;
    }

    var browser = data.browser;
    var round = data.round;
    var id = data.id;
    var page = data.page - 1;
    var failure = data.failure;
    var snapshot = data.snapshot;
    var baselineSnapshot = data.baselineSnapshot;
    var lastPageNum = data.lastPageNum;
    var numberOfTasks = data.numberOfTasks;

    session = getSession(browser);
    monitorBrowserTimeout(session, handleSessionTimeout);

    var taskResults = session.taskResults[id];
    if (!taskResults[round]) {
      taskResults[round] = [];
    }

    if (taskResults[round][page]) {
      console.error(
        "Results for " +
          browser +
          ":" +
          id +
          ":" +
          round +
          ":" +
          page +
          " were already submitted"
      );
      // TODO abort testing here?
    }

    taskResults[round][page] = {
      failure,
      snapshot,
      baselineSnapshot,
      viewportWidth: data.viewportWidth,
      viewportHeight: data.viewportHeight,
      outputScale: data.outputScale,
    };
    if (stats) {
      stats.push({
        browser,
        pdf: id,
        page,
        round,
        stats: data.stats,
      });
    }

    const lastTaskResults = taskResults.at(-1);
    const isDone =
      lastTaskResults?.[lastPageNum - 1] ||
      lastTaskResults?.filter(result => !!result).length === numberOfTasks;
    if (isDone) {
      checkRefTestResults(browser, id, taskResults);
      session.remaining--;
    }
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
    },
  });
  global.integrationBaseUrl = `http://${host}:${server.port}/build/generic/web/viewer.html`;
  global.integrationSessions = sessions;

  const results = { runs: 0, failures: 0 };
  await runTests(results);
  sessions[0].numRuns = results.runs;
  sessions[0].numErrors = results.failures;
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
    var message =
      data.status + " | " + data.description + " | in " + session.name;
    if (data.status === "TEST-UNEXPECTED-FAIL") {
      session.numErrors++;
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
      "browser.ml.enable": false,
      "browser.ml.chat.enabled": false,
      "browser.ml.linkPreview.enabled": false,
      "browser.tabs.groups.smart.enabled": false,
      "browser.tabs.groups.smart.userEnabled": false,
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

async function startBrowsers({ baseUrl, initializeSession }) {
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
    // The session must be pushed first and augmented with the browser once
    // it's initialized. The reason for this is that browser initialization
    // takes more time when the browser is not found locally yet and we don't
    // want `onAllSessionsClosed` to trigger if one of the browsers is done
    // and the other one is still initializing, since that would mean that
    // once the browser is initialized the server would have stopped already.
    // Pushing the session first ensures that `onAllSessionsClosed` will
    // only trigger once all browsers are initialized and done.
    const session = {
      name: browserName,
      browser: undefined,
      closed: false,
    };
    sessions.push(session);

    // Construct the start URL from the base URL by appending query parameters
    // for the runner if necessary.
    let startUrl = "";
    if (baseUrl) {
      const queryParameters =
        `?browser=${encodeURIComponent(browserName)}` +
        `&manifestFile=${encodeURIComponent("/test/" + options.manifestFile)}` +
        `&testFilter=${JSON.stringify(options.testfilter)}` +
        `&xfaOnly=${options.xfaOnly}` +
        `&delay=${options.statsDelay}` +
        `&masterMode=${options.masterMode}`;
      startUrl = baseUrl + queryParameters;
    }

    await startBrowser({ browserName, startUrl })
      .then(function (browser) {
        session.browser = browser;
        initializeSession(session);
      })
      .catch(function (ex) {
        console.log(`Error while starting ${browserName}: ${ex.message}`);
        closeSession(browserName);
      });
  }
}

function startServer() {
  server = new WebServer({
    root: "..",
    host,
    port: options.port,
    cacheExpirationTime: 3600,
  });
  server.start();
}

function stopServer() {
  server.stop();
}

function getSession(browser) {
  return sessions.find(session => session.name === browser);
}

async function closeSession(browser) {
  for (const session of sessions) {
    if (session.name !== browser) {
      continue;
    }
    if (session.browser !== undefined) {
      await session.browser.close();
    }
    session.closed = true;
    const allClosed = sessions.every(s => s.closed);
    if (allClosed) {
      if (tempDir) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      onAllSessionsClosed?.();
    }
  }
}

async function ensurePDFsDownloaded(label = null) {
  const manifest = getTestManifest(label);
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
      await ensurePDFsDownloaded("integration");
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

main();

export { startBrowser };
