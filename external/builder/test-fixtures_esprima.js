'use strict';

require('shelljs/make');

var p2 = require('./preprocessor2.js');
var fs = require('fs');

var errors = 0;

cd(__dirname);
cd('fixtures_esprima');
ls('*-expected.*').forEach(function(expectationFilename) {
  var inFilename = expectationFilename.replace('-expected', '');
  var expectation = cat(expectationFilename).trim()
    .replace(/__filename/g, fs.realpathSync(inFilename));
  var input = fs.readFileSync(inFilename).toString();

  var defines = {
    TRUE: true,
    FALSE: false,
    OBJ: {obj: {i: 1}, j: 2},
    TEXT: 'text'
  };
  var ctx = {
    defines: defines,
    rootPath: __dirname + '/../..',
    saveComments: true
  };
  var out;
  try {
    out = p2.preprocessPDFJSCode(ctx, input);
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
