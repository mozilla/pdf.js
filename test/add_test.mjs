import crypto from "crypto";
import { execSync } from "child_process";
import fs from "fs";

const testManifest = "test/test_manifest.json";
const pdfFolder = "test/pdfs/";
const gitIgnore = "test/pdfs/.gitignore";

if (process.argv.length < 3) {
  console.log("\nUsage: node add_test.js FILE\n");
  console.log(
    `  Add a PDF as a reference test. FILE must be located in ${pdfFolder}`
  );
  process.exit(1);
}

const file = process.argv[2];
if (!file.startsWith(pdfFolder)) {
  throw new Error(`PDF file must be in '${pdfFolder}' directory.`);
}
if (!fs.existsSync(file)) {
  throw new Error(`PDF file does not exist '${file}'.`);
}

function calculateMD5(pdfFile, callback) {
  const hash = crypto.createHash("md5");
  const stream = fs.createReadStream(pdfFile);
  stream.on("data", function (data) {
    hash.update(data);
  });
  stream.on("error", function (err) {
    callback(err);
  });
  stream.on("end", function () {
    const result = hash.digest("hex");
    callback(null, result);
  });
}

function getRandomArbitrary(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

calculateMD5(file, (err, md5) => {
  if (err) {
    throw new Error(err);
  }
  let contents = fs.readFileSync(gitIgnore, "utf8").split("\n");
  const randomLine = getRandomArbitrary(10, contents.length - 2);
  contents.splice(
    randomLine,
    0,
    "!" + file.substring(file.lastIndexOf("/") + 1)
  );
  fs.writeFileSync("test/pdfs/.gitignore", contents.join("\n"));

  contents = fs.readFileSync(testManifest, "utf8");
  const pdf = file.substring(file.lastIndexOf("/") + 1, file.length - 4);
  const randomPoint = getRandomArbitrary(100, contents.length - 20);
  const bracket = contents.indexOf("},\n", randomPoint);
  const out =
    contents.substring(0, bracket) +
    "},\n" +
    `    {  "id": "${pdf}",\n` +
    `       "file": "pdfs/${pdf}.pdf",\n` +
    `       "md5": "${md5}",\n` +
    '       "rounds": 1,\n' +
    '       "type": "eq"\n' +
    "    " +
    contents.substring(bracket);
  fs.writeFileSync("test/test_manifest.json", out);
  execSync(`git add ${testManifest} ${gitIgnore}`);
  execSync(`git add ${file}`);
});
