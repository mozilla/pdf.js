'use strict';

require('shelljs/make');

var builder = require('./builder');
var fs = require('fs');

var errors = 0;

cd(__dirname);
cd('fixtures');
ls('*-expected.*').forEach(function(expectationFilename) {
  var inFilename = expectationFilename.replace('-expected', '');
  var expectation = cat(expectationFilename).trim()
    .replace(/__filename/g, fs.realpathSync(inFilename));
  var outLines = [];

  var outFilename = function(line) {
    outLines.push(line);
  };
  var defines = {
    TRUE: true,
    FALSE: false,
  };
  var out;
  try {
    builder.preprocess(inFilename, outFilename, defines);
    out = outLines.join('\n').trim();
  } catch (e) {
    out = ('Error: ' + e.message).replace(/^/gm, '//');
  }
  if (out !== expectation) {
    errors++;

    echo('Assertion failed for ' + inFilename);
    echo('--------------------------------------------------');
    echo('EXPECTED:');
    echo(expectation);
    echo('--------------------------------------------------');
    echo('ACTUAL');
    echo(out);
    echo('--------------------------------------------------');
    echo();
  }
});

if (errors) {
  echo('Found ' + errors + ' expectation failures.');
} else {
  echo('All tests completed without errors.');
}
