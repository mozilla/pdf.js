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

"use strict";

var os = require("os");
var fs = require("fs");
var path = require("path");
var spawn = require("child_process").spawn;
var testUtils = require("./testutils.js");
var crypto = require("crypto");

var tempDirPrefix = "pdfjs_";

function WebBrowser(name, path, headless) {
  this.name = name;
  this.path = path;
  this.headless = headless;
  this.tmpDir = null;
  this.profileDir = null;
  this.process = null;
  this.requestedExit = false;
  this.finished = false;
  this.callback = null;
  // Used to identify processes whose pid is lost. This string is directly used
  // as a command-line argument, so it only consists of letters.
  this.uniqStringId = "webbrowser" + crypto.randomBytes(32).toString("hex");
}
WebBrowser.prototype = {
  start: function(url) {
    this.tmpDir = path.join(os.tmpdir(), tempDirPrefix + this.name);
    if (!fs.existsSync(this.tmpDir)) {
      fs.mkdirSync(this.tmpDir);
    }
    this.startProcess(url);
  },
  getProfileDir: function() {
    if (!this.profileDir) {
      var profileDir = path.join(this.tmpDir, "profile");
      if (fs.existsSync(profileDir)) {
        testUtils.removeDirSync(profileDir);
      }
      fs.mkdirSync(profileDir);
      this.profileDir = profileDir;
      this.setupProfileDir(profileDir);
    }
    return this.profileDir;
  },
  buildArguments: function(url) {
    return [url];
  },
  setupProfileDir: function(dir) {},
  startProcess: function(url) {
    console.assert(!this.process, "startProcess may be called only once");

    var args = this.buildArguments(url);
    args = args.concat("--" + this.uniqStringId);

    this.process = spawn(this.path, args, {
      stdio: [process.stdin, process.stdout, process.stderr],
    });

    this.process.on(
      "exit",
      function(code, signal) {
        this.process = null;
        var exitInfo =
          code !== null
            ? " with status " + code
            : " in response to signal " + signal;
        if (this.requestedExit) {
          this.log("Browser process exited" + exitInfo);
        } else {
          // This was observed on Windows bots with Firefox. Apparently the
          // Firefox Maintenance Service restarts Firefox shortly after starting
          // up. When this happens, we no longer know the pid of the process.
          this.log("Browser process unexpectedly exited" + exitInfo);
        }
      }.bind(this)
    );
  },
  cleanup: function() {
    console.assert(
      this.requestedExit,
      "cleanup should only be called after an explicit stop() request"
    );

    try {
      testUtils.removeDirSync(this.tmpDir);
    } catch (e) {
      if (e.code !== "ENOENT") {
        this.log("Failed to remove profile directory: " + e);
        if (!this.cleanupFailStart) {
          this.cleanupFailStart = Date.now();
        } else if (Date.now() - this.cleanupFailStart > 10000) {
          throw new Error("Failed to remove profile dir within 10 seconds");
        }
        this.log("Retrying in a second...");
        setTimeout(this.cleanup.bind(this), 1000);
        return;
      }
      // This should not happen, but we just warn instead of failing loudly
      // because the post-condition of cleanup is that the profile directory is
      // gone. If the directory does not exists, then this post-condition is
      // satisfied.
      this.log("Cannot remove non-existent directory: " + e);
    }
    this.finished = true;
    this.log("Clean-up finished. Going to call callback...");
    this.callback();
  },
  stop: function(callback) {
    console.assert(this.tmpDir, ".start() must be called before stop()");
    // Require the callback to ensure that callers do not make any assumptions
    // on the state of this browser instance until the callback is called.
    console.assert(typeof callback === "function", "callback is required");
    console.assert(!this.requestedExit, ".stop() may be called only once");

    this.requestedExit = true;
    if (this.finished) {
      this.log("Browser already stopped, invoking callback...");
      callback();
    } else if (this.process) {
      this.log("Going to wait until the browser process has exited.");
      this.callback = callback;
      this.process.once("exit", this.cleanup.bind(this));
      this.process.kill("SIGTERM");
    } else {
      this.log("Process already exited, checking if the process restarted...");
      this.callback = callback;
      this.killProcessUnknownPid(this.cleanup.bind(this));
    }
  },
  killProcessUnknownPid: function(callback) {
    this.log("pid unknown, killing processes matching " + this.uniqStringId);

    var cmdKillAll, cmdCheckAllKilled, isAllKilled;

    if (process.platform === "win32") {
      var wmicPrefix = [
        "process",
        "where",
        "\"not Name = 'cmd.exe' " +
          "and not Name like '%wmic%' " +
          "and CommandLine like '%" +
          this.uniqStringId +
          "%'\"",
      ];
      cmdKillAll = {
        file: "wmic",
        args: wmicPrefix.concat(["call", "terminate"]),
      };
      cmdCheckAllKilled = {
        file: "wmic",
        args: wmicPrefix.concat(["get", "CommandLine"]),
      };
      isAllKilled = function(exitCode, stdout) {
        return !stdout.includes(this.uniqStringId);
      }.bind(this);
    } else {
      cmdKillAll = { file: "pkill", args: ["-f", this.uniqStringId] };
      cmdCheckAllKilled = { file: "pgrep", args: ["-f", this.uniqStringId] };
      isAllKilled = function(pgrepStatus) {
        return pgrepStatus === 1; // "No process matched.", per man pgrep.
      };
    }
    function execAsyncNoStdin(cmd, onExit) {
      var proc = spawn(cmd.file, cmd.args, {
        shell: true,
        stdio: "pipe",
      });
      // Close stdin, otherwise wmic won't run.
      proc.stdin.end();
      var stdout = "";
      proc.stdout.on("data", data => {
        stdout += data;
      });
      proc.on("close", code => {
        onExit(code, stdout);
      });
    }
    var killDateStart = Date.now();
    // Note: First process' output it shown, the later outputs are suppressed.
    execAsyncNoStdin(
      cmdKillAll,
      function checkAlive(exitCode, firstStdout) {
        execAsyncNoStdin(
          cmdCheckAllKilled,
          function(exitCode, stdout) {
            if (isAllKilled(exitCode, stdout)) {
              callback();
            } else if (Date.now() - killDateStart > 10000) {
              // Should finish termination within 10 (generous) seconds.
              if (firstStdout) {
                this.log("Output of first command:\n" + firstStdout);
              }
              if (stdout) {
                this.log("Output of last command:\n" + stdout);
              }
              throw new Error("Failed to kill process of " + this.name);
            } else {
              setTimeout(checkAlive.bind(this), 500);
            }
          }.bind(this)
        );
      }.bind(this)
    );
  },
  log: function(msg) {
    console.log("[" + this.name + "] " + msg);
  },
};

var firefoxResourceDir = path.join(__dirname, "resources", "firefox");

function FirefoxBrowser(name, path, headless) {
  if (os.platform() === "darwin") {
    var m = /([^.\/]+)\.app(\/?)$/.exec(path);
    if (m) {
      path += (m[2] ? "" : "/") + "Contents/MacOS/firefox";
    }
  }
  WebBrowser.call(this, name, path, headless);
}
FirefoxBrowser.prototype = Object.create(WebBrowser.prototype);
FirefoxBrowser.prototype.buildArguments = function(url) {
  var profileDir = this.getProfileDir();
  var args = [];
  if (os.platform() === "darwin") {
    args.push("-foreground");
  }
  if (this.headless) {
    args.push("--headless");
  }
  args.push("-no-remote", "-profile", profileDir, url);
  return args;
};
FirefoxBrowser.prototype.setupProfileDir = function(dir) {
  testUtils.copySubtreeSync(firefoxResourceDir, dir);
};

function ChromiumBrowser(name, path, headless) {
  if (os.platform() === "darwin") {
    var m = /([^.\/]+)\.app(\/?)$/.exec(path);
    if (m) {
      path += (m[2] ? "" : "/") + "Contents/MacOS/" + m[1];
      console.log(path);
    }
  }
  WebBrowser.call(this, name, path, headless);
}
ChromiumBrowser.prototype = Object.create(WebBrowser.prototype);
ChromiumBrowser.prototype.buildArguments = function(url) {
  var profileDir = this.getProfileDir();
  var crashDumpsDir = path.join(this.tmpDir, "crash_dumps");
  var args = [
    "--user-data-dir=" + profileDir,
    "--no-first-run",
    "--disable-sync",
    "--no-default-browser-check",
    "--disable-device-discovery-notifications",
    "--disable-translate",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
  ];
  if (this.headless) {
    args.push(
      "--headless",
      "--crash-dumps-dir=" + crashDumpsDir,
      "--disable-gpu",
      "--remote-debugging-port=9222"
    );
  }
  args.push(url);
  return args;
};

WebBrowser.create = function(desc) {
  var name = desc.name;
  var path = fs.realpathSync(desc.path);
  if (!path) {
    throw new Error("Browser executable not found: " + desc.path);
  }

  if (/firefox/i.test(name)) {
    return new FirefoxBrowser(name, path, desc.headless);
  }
  if (/(chrome|chromium|opera)/i.test(name)) {
    return new ChromiumBrowser(name, path, desc.headless);
  }
  return new WebBrowser(name, path, desc.headless);
};

exports.WebBrowser = WebBrowser;
