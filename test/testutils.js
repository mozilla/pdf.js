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

"use strict";

var fs = require("fs");
var path = require("path");
var rimrafSync = require("rimraf").sync;

exports.removeDirSync = function removeDirSync(dir) {
  fs.readdirSync(dir); // Will throw if dir is not a directory
  rimrafSync(dir, {
    disableGlob: true,
  });
};

exports.copySubtreeSync = function copySubtreeSync(src, dest) {
  var files = fs.readdirSync(src);
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest);
  }
  files.forEach(function(filename) {
    var srcFile = path.join(src, filename);
    var file = path.join(dest, filename);
    var stats = fs.statSync(srcFile);
    if (stats.isDirectory()) {
      copySubtreeSync(srcFile, file);
    } else {
      fs.writeFileSync(file, fs.readFileSync(srcFile));
    }
  });
};

exports.ensureDirSync = function ensureDirSync(dir) {
  if (fs.existsSync(dir)) {
    return;
  }
  var parts = dir.split(path.sep),
    i = parts.length;
  while (i > 1 && !fs.existsSync(parts.slice(0, i - 1).join(path.sep))) {
    i--;
  }
  if (i < 0 || (i === 0 && parts[0])) {
    throw new Error();
  }

  while (i <= parts.length) {
    fs.mkdirSync(parts.slice(0, i).join(path.sep));
    i++;
  }
};

var stdinBuffer = "",
  endOfStdin = false,
  stdinInitialized = false;
var stdinOnLineCallbacks = [];

function handleStdinBuffer() {
  var callback;
  if (endOfStdin) {
    if (stdinBuffer && stdinOnLineCallbacks.length > 0) {
      callback = stdinOnLineCallbacks.shift();
      callback(stdinBuffer);
      stdinBuffer = null;
    }
    while (stdinOnLineCallbacks.length > 0) {
      callback = stdinOnLineCallbacks.shift();
      callback();
    }
    return;
  }
  while (stdinOnLineCallbacks.length > 0) {
    var i = stdinBuffer.indexOf("\n");
    if (i < 0) {
      return;
    }
    callback = stdinOnLineCallbacks.shift();
    var result = stdinBuffer.substring(0, i + 1);
    stdinBuffer = stdinBuffer.substring(i + 1);
    callback(result);
  }
  // all callbacks handled, stop stdin processing
  process.stdin.pause();
}

function initStdin() {
  process.stdin.setEncoding("utf8");

  process.stdin.on("data", function(chunk) {
    stdinBuffer += chunk;
    handleStdinBuffer();
  });

  process.stdin.on("end", function() {
    endOfStdin = true;
    handleStdinBuffer();
  });
}

exports.prompt = function prompt(message, callback) {
  if (!stdinInitialized) {
    process.stdin.resume();
    initStdin();
    stdinInitialized = true;
  } else if (stdinOnLineCallbacks.length === 0) {
    process.stdin.resume();
  }

  process.stdout.write(message);
  stdinOnLineCallbacks.push(callback);
  handleStdinBuffer();
};

exports.confirm = function confirm(message, callback) {
  exports.prompt(message, function(answer) {
    if (answer === undefined) {
      callback();
      return;
    }
    if (answer[0].toLowerCase() === "y") {
      callback(true);
    } else if (answer[0].toLowerCase() === "n") {
      callback(false);
    } else {
      confirm(message, callback);
    }
  });
};
