/*jslint node: true */

'use strict';

var fs = require('fs');

try {
  var ttest = require('ttest');
} catch (e) {
  console.log('\nttest is not installed -- to intall, run "npm install ttest"');
  console.log('Continuing without significance test...\n');
}

var VALID_GROUP_BYS = ['browser', 'pdf', 'page', 'round', 'stat'];

function parseOptions() {
  var yargs = require('yargs')
    .usage('Compare the results of two stats files.\n' +
           'Usage:\n  $0 <BASELINE> <CURRENT> [options]')
    .demand(2)
    .string(['groupBy'])
    .describe('groupBy', 'How statistics should grouped. Valid options: ' +
              VALID_GROUP_BYS.join(' '))
    .default('groupBy', 'browser,stat');
  var result = yargs.argv;
  result.baseline = result._[0];
  result.current = result._[1];
  if (result.groupBy) {
    result.groupBy = result.groupBy.split(/[;, ]+/);
  }
  return result;
}

function group(stats, groupBy) {
  var vals = [];
  for (var i = 0; i < stats.length; i++) {
    var stat = stats[i];
    var keyArr = [];
    for (var j = 0; j < groupBy.length; j++) {
      keyArr.push(stat[groupBy[j]]);
    }
    var key = keyArr.join(',');
    if (vals[key] === undefined) {
      vals[key] = [];
    }
    vals[key].push(stat['time']);
  }
  return vals;
}

/*
 * Flatten the stats so that there's one row per stats entry.
 * Also, if results are not grouped by 'stat', keep only 'Overall' results.
 */
function flatten(stats) {
  var rows = [];
  stats.forEach(function(stat) {
    stat['stats'].forEach(function(s) {
      rows.push({
        browser: stat['browser'],
        page: stat['page'],
        pdf: stat['pdf'],
        round: stat['round'],
        stat: s['name'],
        time: s['end'] - s['start']
      });
    });
  });
  // Use only overall results if not grouped by 'stat'
  if (options.groupBy.indexOf('stat') < 0) {
    rows = rows.filter(function(s) { return s.stat === 'Overall'; });
  }
  return rows;
}

function pad(s, length, dir /* default: 'right' */) {
  s = '' + s;
  var spaces = new Array(Math.max(0, length - s.length + 1)).join(' ');
  return dir === 'left' ? spaces + s : s + spaces;
}

function mean(array) {
  function add(a, b) {
    return a + b;
  }
  return array.reduce(add, 0) / array.length;
}

/* Comparator for row key sorting. */
function compareRow(a, b) {
  a = a.split(',');
  b = b.split(',');
  for (var i = 0; i < Math.min(a.length, b.length); i++) {
    var intA = parseInt(a[i], 10);
    var intB = parseInt(b[i], 10);
    var ai = isNaN(intA) ? a[i] : intA;
    var bi = isNaN(intB) ? b[i] : intB;
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
 * Dump various stats in a table to compare the baseline and current results.
 * T-test Refresher:
 * If I understand t-test correctly, p is the probability that we'll observe
 * another test that is as extreme as the current result assuming the null
 * hypothesis is true. P is NOT the probability of the null hypothesis. The null
 * hypothesis in this case is that the baseline and current results will be the
 * same. It is generally accepted that you can reject the null hypothesis if the
 * p-value is less than 0.05. So if p < 0.05 we can reject the results are the
 * same which doesn't necessarily mean the results are faster/slower but it can
 * be implied.
 */
function stat(baseline, current) {
  var baselineGroup = group(baseline, options.groupBy);
  var currentGroup = group(current, options.groupBy);

  var keys = Object.keys(baselineGroup);
  keys.sort(compareRow);

  var labels = options.groupBy.slice(0);
  labels.push('Count', 'Baseline(ms)', 'Current(ms)', '+/-', '% ');
  if (ttest) {
    labels.push('Result(P<.05)');
  }
  var i, row, rows = [];
  // collect rows and measure column widths
  var width = labels.map(function(s) { return s.length; });
  rows.push(labels);
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    var baselineMean = mean(baselineGroup[key]);
    var currentMean = mean(currentGroup[key]);
    row = key.split(',');
    row.push('' + baselineGroup[key].length,
             '' + Math.round(baselineMean),
             '' + Math.round(currentMean),
             '' + Math.round(currentMean - baselineMean),
             (100 * (currentMean - baselineMean) / baselineMean).toFixed(2));
    if (ttest) {
      var p = (baselineGroup[key].length < 2) ? 1 :
               ttest(baselineGroup[key], currentGroup[key]).pValue();
      if (p < 0.05) {
        row.push(currentMean < baselineMean ? 'faster' : 'slower');
      } else {
        row.push('');
      }
    }
    for (i = 0; i < row.length; i++) {
      width[i] = Math.max(width[i], row[i].length);
    }
    rows.push(row);
  }

  // add horizontal line
  var hline = width.map(function(w) { return new Array(w+1).join('-'); });
  rows.splice(1, 0, hline);

  // print output
  console.log('-- Grouped By ' + options.groupBy.join(', ') + ' --');
  var groupCount = options.groupBy.length;
  for (var r = 0; r < rows.length; r++) {
    row = rows[r];
    for (i = 0; i < row.length; i++) {
      row[i] = pad(row[i], width[i], (i < groupCount) ? 'right' : 'left');
    }
    console.log(row.join(' | '));
  }
}

function main() {
  var baseline, current;
  try {
    var baselineFile = fs.readFileSync(options.baseline).toString();
    baseline = flatten(JSON.parse(baselineFile));
  } catch(e) {
    console.log('Error reading file "' + options.baseline + '": ' + e);
    process.exit(0);
  }
  try {
    var currentFile = fs.readFileSync(options.current).toString();
    current = flatten(JSON.parse(currentFile));
  } catch(e) {
    console.log('Error reading file "' + options.current + '": ' + e);
    process.exit(0);
  }
  stat(baseline, current);
}

var options = parseOptions();
main();
