"use strict";

const builder = require("./builder");
const fs = require("fs");
const path = require("path");

let errors = 0;

const baseDir = path.join(__dirname, "fixtures");
const files = fs
  .readdirSync(baseDir)
  .filter(function (name) {
    return /-expected\./.test(name);
  })
  .map(function (name) {
    return path.join(baseDir, name);
  });
files.forEach(function (expectationFilename) {
  const inFilename = expectationFilename.replace("-expected", "");
  const expectation = fs
    .readFileSync(expectationFilename)
    .toString()
    .trim()
    .replace(/__filename/g, fs.realpathSync(inFilename));
  const outLines = [];

  const outFilename = function (line) {
    outLines.push(line);
  };
  const defines = {
    TRUE: true,
    FALSE: false,
  };
  let out;
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
