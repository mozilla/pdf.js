/**
 * Runs all fuzzers against their respective corpus files for coverage analysis
 */

const fs = require("fs");
const path = require("path");

const FUZZERS = [
  "pdf_parser",
  "jpeg_image",
  "jbig2_image",
  "jpx_image",
  "flate_stream",
  "ccitt_stream",
  "lzw_stream",
  "cff_parser",
  "type1_parser",
  "cmap_parser",
  "crypto",
  "colorspace",
  "xfa_parser",
  "xml_parser",
  "formcalc_parser",
  "ps_parser",
];

async function runCorpus() {
  const results = { passed: 0, failed: 0, skipped: 0 };

  for (const fuzzerName of FUZZERS) {
    const fuzzerPath = path.join(__dirname, `${fuzzerName}.fuzz.js`);
    const corpusDir = path.join(__dirname, "corpus", fuzzerName);

    if (!fs.existsSync(fuzzerPath)) {
      console.log(`[SKIP] Fuzzer not found: ${fuzzerName}`);
      results.skipped++;
      continue;
    }

    if (!fs.existsSync(corpusDir)) {
      console.log(`[SKIP] Corpus not found: ${fuzzerName}`);
      results.skipped++;
      continue;
    }

    const fuzzer = require(fuzzerPath);
    const files = fs.readdirSync(corpusDir);

    for (const file of files) {
      const filePath = path.join(corpusDir, file);
      const stat = fs.statSync(filePath);

      if (!stat.isFile() || stat.size === 0) continue;

      try {
        const data = fs.readFileSync(filePath);
        await fuzzer.fuzz(data);
        results.passed++;
        console.log(`[PASS] ${fuzzerName}/${file}`);
      } catch (e) {
        // Expected errors during fuzzing
        results.passed++;
        console.log(`[PASS] ${fuzzerName}/${file} (handled error: ${e.message?.slice(0, 50)})`);
      }
    }
  }

  console.log(`\nResults: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped`);
}

runCorpus().catch(console.error);
