import { mean, welchTTest } from "./welch_ttest.js";
import fs from "fs";
import { parseArgs } from "node:util";

const VALID_GROUP_BYS = ["browser", "pdf", "page", "round", "stat"];

function parseOptions() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      groupBy: { type: "string", default: "browser,stat" },
    },
  });

  if (positionals.length < 2) {
    console.error(
      "Compare the results of two stats files.\n" +
        "Usage:\n  statcmp.js <BASELINE> <CURRENT> [--groupBy=<fields>]\n\n" +
        `  --groupBy    How statistics should be grouped. Valid options: ${VALID_GROUP_BYS.join(" ")}. [browser,stat]`
    );
    process.exit(1);
  }

  return {
    baseline: positionals[0],
    current: positionals[1],
    groupBy: values.groupBy.split(/[;, ]+/),
  };
}

function group(stats, groupBy) {
  const vals = [];
  for (const curStat of stats) {
    const keyArr = [];
    for (const entry of groupBy) {
      keyArr.push(curStat[entry]);
    }
    const key = keyArr.join(",");
    (vals[key] ||= []).push(curStat.time);
  }
  return vals;
}

/*
 * Flatten the stats so that there's one row per stats entry.
 * Also, if results are not grouped by 'stat', keep only 'Overall' results.
 */
function flatten(stats) {
  let rows = [];
  stats.forEach(curStat => {
    curStat.stats.forEach(s => {
      rows.push({
        browser: curStat.browser,
        page: curStat.page,
        pdf: curStat.pdf,
        round: curStat.round,
        stat: s.name,
        time: s.end - s.start,
      });
    });
  });
  // Use only overall results if not grouped by 'stat'
  if (!options.groupBy.includes("stat")) {
    rows = rows.filter(s => s.stat === "Overall");
  }
  return rows;
}

/* Comparator for row key sorting. */
function compareRow(a, b) {
  a = a.split(",");
  b = b.split(",");
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const intA = parseInt(a[i], 10);
    const intB = parseInt(b[i], 10);
    const ai = isNaN(intA) ? a[i] : intA;
    const bi = isNaN(intB) ? b[i] : intB;
    if (ai < bi) {
      return -1;
    }
    if (ai > bi) {
      return 1;
    }
  }
  return 0;
}

/*
 * Compare timings; label changes when the two-sided Welch p-value is < 0.05.
 */
function stat(baseline, current) {
  const baselineGroup = group(baseline, options.groupBy);
  const currentGroup = group(current, options.groupBy);

  const keys = Object.keys(baselineGroup);
  keys.sort(compareRow);

  const labels = options.groupBy.slice(0);
  labels.push(
    "Count",
    "Baseline(ms)",
    "Current(ms)",
    "+/-",
    "% ",
    "Result(P<.05)"
  );
  const rows = [];
  // collect rows and measure column widths
  const width = labels.map(s => s.length);
  rows.push(labels);
  for (const key of keys) {
    const baselineMean = mean(baselineGroup[key]);
    const currentMean = mean(currentGroup[key]);
    const row = key.split(",");
    row.push(
      "" + baselineGroup[key].length,
      "" + Math.round(baselineMean),
      "" + Math.round(currentMean),
      "" + Math.round(currentMean - baselineMean),
      ((100 * (currentMean - baselineMean)) / baselineMean).toFixed(2)
    );
    const p =
      baselineGroup[key].length < 2
        ? 1
        : welchTTest(baselineGroup[key], currentGroup[key]);
    if (p < 0.05) {
      row.push(currentMean < baselineMean ? "faster" : "slower");
    } else {
      row.push("");
    }
    for (let i = 0; i < row.length; i++) {
      width[i] = Math.max(width[i], row[i].length);
    }
    rows.push(row);
  }

  // add horizontal line
  const hline = width.map(w => "-".repeat(w));
  rows.splice(1, 0, hline);

  // print output
  console.log("-- Grouped By " + options.groupBy.join(", ") + " --");
  const groupCount = options.groupBy.length;
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      row[i] =
        i < groupCount ? row[i].padEnd(width[i]) : row[i].padStart(width[i]);
    }
    console.log(row.join(" | "));
  }
}

function main() {
  let baseline, current;
  try {
    const baselineFile = fs.readFileSync(options.baseline).toString();
    baseline = flatten(JSON.parse(baselineFile));
  } catch (e) {
    console.log('Error reading file "' + options.baseline + '": ' + e);
    process.exit(0);
  }
  try {
    const currentFile = fs.readFileSync(options.current).toString();
    current = flatten(JSON.parse(currentFile));
  } catch (e) {
    console.log('Error reading file "' + options.current + '": ' + e);
    process.exit(0);
  }
  stat(baseline, current);
}

const options = parseOptions();
main();
