"use strict";

var builder = require("./builder");
var fs = require("fs");
var path = require("path");

var errors = 0;

var baseDir = path.join(__dirname, "fixtures");
var files = fs
  .readdirSync(baseDir)
  .filter(function (name) {
    return /-expected\./.test(name);
  })
  .map(function (name) {
    return path.join(baseDir, name);
  });
files.forEach(function (expectationFilename) {
  var inFilename = expectationFilename.replace("-expected", "");
  var expectation = fs
    .readFileSync(expectationFilename)
    .toString()
    .trim()
    .replace(/__filename/g, fs.realpathSync(inFilename));
  var outLines = [];

  var outFilename = function (line) {
    outLines.push(line);
  };
  var defines = {
    TRUE: true,
    FALSE: false,
  };
  var out;
  try {
    builder.preprocess(inFilename, outFilename, defines);
    out = outLines.join("\n").trim();
  } catch (e) {
    out = ("Error: " + e.message).replace(/^/gm, "//");
  }
  if (out !== expectation) {
    errors++;

    console.log("Assertion failed for " + inFilename);
    console.log("--------------------------------------------------");
    console.log("EXPECTED:");
    console.log(expectation);
    console.log("--------------------------------------------------");
    console.log("ACTUAL");
    console.log(out);
    console.log("--------------------------------------------------");
    console.log();
  }
});

if (errors) {
  console.error("Found " + errors + " expectation failures.");
  process.exit(1);
} else {
  console.log("All tests completed without errors.");
  process.exit(0);
}
