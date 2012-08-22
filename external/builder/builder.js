require('../shelljs/make');
var fs = require('fs'),
    path = require('path'),
    vm = require('vm');

/**
 * A simple preprocessor that is based on the firefox preprocessor
 * see (https://developer.mozilla.org/en/Build/Text_Preprocessor).  The main
 * difference is that this supports a subset of the commands and it supports
 * preproccesor commands in html style comments.
 * Currently Supported commands:
 * - if
 * - else
 * - endif
 * - include
 * - expand
 */
function preprocess(inFilename, outFilename, defines) {
  // TODO make this really read line by line.
  var lines = fs.readFileSync(inFilename).toString().split('\n');
  var totalLines = lines.length;
  var out = '';
  var i = 0;
  function readLine() {
    if (i < totalLines) {
      return lines[i++];
    }
    return null;
  }
  var writeLine = typeof outFilename === 'function' ? outFilename :
                                                      function(line) {
    out += line + '\n';
  }
  function include(file) {
    var realPath = fs.realpathSync(inFilename);
    var dir = path.dirname(realPath);
    preprocess(path.join(dir, file), writeLine, defines);
  }
  function expand(line) {
    line = line.replace(/__[\w]+__/g, function(variable) {
      variable = variable.substring(2, variable.length - 2);
      if (variable in defines) {
        return defines[variable];
      }
      return '';
    });
    writeLine(line);
  }

  var s, state = 0, stack = [];
  var control =
    /^(?:\/\/|<!--)\s*#(if|else|endif|expand|include)(?:\s+(.*?)(?:-->)?$)?/;
  var lineNumber = 0;
  while ((s = readLine()) !== null) {
    ++lineNumber;
    var m = control.exec(s);
    if (m) {
      switch (m[1]) {
        case 'if':
          stack.push(state);
          try {
            state = vm.runInNewContext(m[2], defines) ? 3 : 1;
          } catch (e) {
            console.error('Could not evalute line \'' + m[2] + '\' at ' +
                          fs.realpathSync(inFilename) + ':' + lineNumber);
            throw e;
          }
          break;
        case 'else':
          state = state === 1 ? 3 : 2;
          break;
        case 'endif':
          state = stack.pop();
          break;
        case 'expand':
          if (state === 0 || state === 3)
            expand(m[2]);
          break;
        case 'include':
          if (state === 0 || state === 3)
            include(m[2]);
          break;
      }
    } else {
      if (state === 0) {
        writeLine(s);
      } else if (state === 3) {
        writeLine(s.replace(/^\/\/|^<!--|-->/g, '  '));
      }
    }
  }
  if (state !== 0 || stack.length !== 0)
    throw new Error('Missing endif in preprocessor.');
  if (typeof outFilename !== 'function')
    fs.writeFileSync(outFilename, out);
}
exports.preprocess = preprocess;

/**
 * Simplifies common build steps.
 * @param {object} setup
 *        .defines defines for preprocessors
 *        .copy array of arrays of source and destination pairs of files to copy
 *        .preprocess array of arrays of source and destination pairs of files
 *                    run through preprocessor.
 */
function build(setup) {
  var defines = setup.defines;

  setup.copy.forEach(function(option) {
    var source = option[0];
    var destination = option[1];
    cp('-R', source, destination);
  });

  setup.preprocess.forEach(function(option) {
    var sources = option[0];
    var destination = option[1];

    sources = ls('-R', sources);
    sources.forEach(function(source) {
      // ??? Warn if the source is wildcard and dest is file?
      var destWithFolder = destination;
      if (test('-d', destination))
        destWithFolder += '/' + path.basename(source);
      preprocess(source, destWithFolder, defines);
    });
  });
}
exports.build = build;

/**
 * Merge two defines arrays. Values in the second param will override values in
 * the first.
 */
function merge(defaults, defines) {
  var ret = {};
  for (var key in defaults)
    ret[key] = defaults[key];
  for (key in defines)
    ret[key] = defines[key];
  return ret;
}
exports.merge = merge;
