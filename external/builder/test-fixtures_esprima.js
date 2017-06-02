'use strict';

var p2 = require('./preprocessor2.js');
var fs = require('fs');
var path = require('path');

var errors = 0;

var baseDir = path.join(__dirname, 'fixtures_esprima');
var files = fs.readdirSync(baseDir).filter(function (name) {
  return /-expected\./.test(name);
}).map(function (name) {
  return path.join(baseDir, name);
});
files.forEach(function(expectationFilename) {
  var inFilename = expectationFilename.replace('-expected', '');
  var expectation = fs.readFileSync(expectationFilename).toString().trim()
    .replace(/__filename/g, fs.realpathSync(inFilename));
  var input = fs.readFileSync(inFilename).toString();

  var defines = {
    TRUE: true,
    FALSE: false,
    OBJ: { obj: { i: 1, }, j: 2, },
    TEXT: 'text',
  };
  var map = {
    'import-alias': 'import-name',
  };
  var ctx = {
    defines: defines,
    map: map,
    rootPath: __dirname + '/../..',
  };
  var out;
  try {
    out = p2.preprocessPDFJSCode(ctx, input);
  } catch (e) {
    out = ('Error: ' + e.message).replace(/^/gm, '//');
  }
  if (out !== expectation) {
    errors++;

    console.log('Assertion failed for ' + inFilename);
    console.log('--------------------------------------------------');
    console.log('EXPECTED:');
    console.log(expectation);
    console.log('--------------------------------------------------');
    console.log('ACTUAL');
    console.log(out);
    console.log('--------------------------------------------------');
    console.log();
  }
});

if (errors) {
  console.error('Found ' + errors + ' expectation failures.');
  process.exit(1);
} else {
  console.log('All tests completed without errors.');
  process.exit(0);
}
