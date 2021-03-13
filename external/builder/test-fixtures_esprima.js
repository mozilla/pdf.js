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
