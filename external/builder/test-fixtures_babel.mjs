import { fileURLToPath } from "url";
import fs from "fs";
import path from "path";
import { preprocessPDFJSCode } from "./babel-plugin-pdfjs-preprocessor.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let errors = 0;

const baseDir = path.join(__dirname, "fixtures_babel");
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
    .replaceAll("__filename", fs.realpathSync(inFilename));
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
    out = preprocessPDFJSCode(ctx, input);
  } catch (e) {
    out = ("Error: " + e.message).replaceAll(/^/gm, "//");
  }
  if (out !== expectation) {
    errors++;

    // Allow regenerating the expected output using
    //   OVERWRITE=true node ./external/builder/test-fixtures_babel.mjs
    if (process.env.OVERWRITE) {
      fs.writeFileSync(expectationFilename, out + "\n");
    }

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
