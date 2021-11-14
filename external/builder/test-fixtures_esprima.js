"use strict";

const p2 = require("./preprocessor2.js");
const fs = require("fs");
const path = require("path");

let errors = 0;

const baseDir = path.join(__dirname, "fixtures_esprima");
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
  const input = fs.readFileSync(inFilename).toString();

  const defines = {
    TRUE: true,
    FALSE: false,
    OBJ: { obj: { i: 1 }, j: 2 },
    TEXT: "text",
  };
  const map = {
    "import-alias": "import-name",
  };
  const ctx = {
    defines,
    map,
    rootPath: __dirname + "/../..",
  };
  let out;
  try {
    out = p2.preprocessPDFJSCode(ctx, input);
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
