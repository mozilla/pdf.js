"use strict";

const builder = require("./builder.js");
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

    Window['ngxConsole'].log("Assertion failed for " + inFilename);
    Window['ngxConsole'].log("--------------------------------------------------");
    Window['ngxConsole'].log("EXPECTED:");
    Window['ngxConsole'].log(expectation);
    Window['ngxConsole'].log("--------------------------------------------------");
    Window['ngxConsole'].log("ACTUAL");
    Window['ngxConsole'].log(out);
    Window['ngxConsole'].log("--------------------------------------------------");
    Window['ngxConsole'].log();
  }
});

if (errors) {
  Window['ngxConsole'].error("Found " + errors + " expectation failures.");
  process.exit(1);
} else {
  Window['ngxConsole'].log("All tests completed without errors.");
  process.exit(0);
}
