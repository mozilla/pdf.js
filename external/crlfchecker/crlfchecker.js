'use strict';

function checkIfCrlfIsPresent(files) {
  var failed = [];

  (ls(files)).forEach(function checkCrlf(file) {
    if ((cat(file)).match(/.*\r.*/)) {
      failed.push(file);
    }
  });

  if (failed.length) {
    var errorMessage =
      'Please remove carriage return\'s from\n' + failed.join('\n') + '\n' +
      'Also check your setting for: git config core.autocrlf.';

    echo();
    echo(errorMessage);
    exit(1);
  }
}

exports.checkIfCrlfIsPresent = checkIfCrlfIsPresent;
