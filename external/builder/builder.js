'use strict';

var fs = require('fs'),
    path = require('path'),
    vm = require('vm');

/**
 * A simple preprocessor that is based on the Firefox preprocessor
 * (https://dxr.mozilla.org/mozilla-central/source/build/docs/preprocessor.rst).
 * The main difference is that this supports a subset of the commands and it
 * supports preprocessor commands in HTML-style comments.
 *
 * Currently supported commands:
 * - if
 * - elif
 * - else
 * - endif
 * - include
 * - expand
 * - error
 *
 * Every #if must be closed with an #endif. Nested conditions are supported.
 *
 * Within an #if or #else block, one level of comment tokens is stripped. This
 * allows us to write code that can run even without preprocessing. For example:
 *
 * //#if SOME_RARE_CONDITION
 * // // Decrement by one
 * // --i;
 * //#else
 * // // Increment by one.
 * ++i;
 * //#endif
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
  var writeLine = (typeof outFilename === 'function' ? outFilename :
    function(line) {
      out += line + '\n';
    });
  function evaluateCondition(code) {
    if (!code || !code.trim()) {
      throw new Error('No JavaScript expression given at ' + loc());
    }
    try {
      return vm.runInNewContext(code, defines, {displayErrors: false});
    } catch (e) {
      throw new Error('Could not evaluate "' + code + '" at ' + loc() + '\n' +
                      e.name + ': ' + e.message);
    }
  }
  function include(file) {
    var realPath = fs.realpathSync(inFilename);
    var dir = path.dirname(realPath);
    try {
      var fullpath;
      if (file.indexOf('$ROOT/') === 0) {
        fullpath = path.join(__dirname, '../..',
          file.substring('$ROOT/'.length));
      } else {
        fullpath = path.join(dir, file);
      }
      preprocess(fullpath, writeLine, defines);
    } catch (e) {
      if (e.code === 'ENOENT') {
        throw new Error('Failed to include "' + file + '" at ' + loc());
      }
      throw e; // Some other error
    }
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

  // not inside if or else (process lines)
  var STATE_NONE = 0;
  // inside if, condition false (ignore until #else or #endif)
  var STATE_IF_FALSE = 1;
  // inside else, #if was false, so #else is true (process lines until #endif)
  var STATE_ELSE_TRUE = 2;
  // inside if, condition true (process lines until #else or #endif)
  var STATE_IF_TRUE = 3;
  // inside else or elif, #if/#elif was true, so following #else or #elif is
  // false (ignore lines until #endif)
  var STATE_ELSE_FALSE = 4;

  var line;
  var state = STATE_NONE;
  var stack = [];
  var control = // eslint-disable-next-line max-len
    /^(?:\/\/|<!--)\s*#(if|elif|else|endif|expand|include|error)\b(?:\s+(.*?)(?:-->)?$)?/;
  var lineNumber = 0;
  var loc = function() {
    return fs.realpathSync(inFilename) + ':' + lineNumber;
  };
  while ((line = readLine()) !== null) {
    ++lineNumber;
    var m = control.exec(line);
    if (m) {
      switch (m[1]) {
        case 'if':
          stack.push(state);
          state = evaluateCondition(m[2]) ? STATE_IF_TRUE : STATE_IF_FALSE;
          break;
        case 'elif':
          if (state === STATE_IF_TRUE || state === STATE_ELSE_FALSE) {
            state = STATE_ELSE_FALSE;
          } else if (state === STATE_IF_FALSE) {
            state = evaluateCondition(m[2]) ? STATE_IF_TRUE : STATE_IF_FALSE;
          } else if (state === STATE_ELSE_TRUE) {
            throw new Error('Found #elif after #else at ' + loc());
          } else {
            throw new Error('Found #elif without matching #if at ' + loc());
          }
          break;
        case 'else':
          if (state === STATE_IF_TRUE || state === STATE_ELSE_FALSE) {
            state = STATE_ELSE_FALSE;
          } else if (state === STATE_IF_FALSE) {
            state = STATE_ELSE_TRUE;
          } else {
            throw new Error('Found #else without matching #if at ' + loc());
          }
          break;
        case 'endif':
          if (state === STATE_NONE) {
            throw new Error('Found #endif without #if at ' + loc());
          }
          state = stack.pop();
          break;
        case 'expand':
          if (state !== STATE_IF_FALSE && state !== STATE_ELSE_FALSE) {
            expand(m[2]);
          }
          break;
        case 'include':
          if (state !== STATE_IF_FALSE && state !== STATE_ELSE_FALSE) {
            include(m[2]);
          }
          break;
        case 'error':
          if (state !== STATE_IF_FALSE && state !== STATE_ELSE_FALSE) {
            throw new Error('Found #error ' + m[2] + ' at ' + loc());
          }
          break;
      }
    } else {
      if (state === STATE_NONE) {
        writeLine(line);
      } else if ((state === STATE_IF_TRUE || state === STATE_ELSE_TRUE) &&
          stack.indexOf(STATE_IF_FALSE) === -1 &&
          stack.indexOf(STATE_ELSE_FALSE) === -1) {
        writeLine(line.replace(/^\/\/|^<!--|-->$/g, '  '));
      }
    }
  }
  if (state !== STATE_NONE || stack.length !== 0) {
    throw new Error('Missing #endif in preprocessor for ' +
                    fs.realpathSync(inFilename));
  }
  if (typeof outFilename !== 'function') {
    fs.writeFileSync(outFilename, out);
  }
}
exports.preprocess = preprocess;

var deprecatedInMozcentral = new RegExp('(^|\\W)(' + [
    '-moz-box-sizing',
    '-moz-grab',
    '-moz-grabbing'
  ].join('|') + ')');

function preprocessCSS(mode, source, destination) {
  function hasPrefixedFirefox(line) {
    return (/(^|\W)-(ms|o|webkit)-\w/.test(line));
  }

  function hasPrefixedMozcentral(line) {
    return (/(^|\W)-(ms|o|webkit)-\w/.test(line) ||
            deprecatedInMozcentral.test(line));
  }

  function expandImports(content, baseUrl) {
    return content.replace(/^\s*@import\s+url\(([^\)]+)\);\s*$/gm,
        function(all, url) {
      var file = path.join(path.dirname(baseUrl), url);
      var imported = fs.readFileSync(file, 'utf8').toString();
      return expandImports(imported, file);
    });
  }

  function removePrefixed(content, hasPrefixedFilter) {
    var lines = content.split(/\r?\n/g);
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (!hasPrefixedFilter(line)) {
        i++;
        continue;
      }
      if (/\{\s*$/.test(line)) {
        var bracketLevel = 1;
        var j = i + 1;
        while (j < lines.length && bracketLevel > 0) {
          var checkBracket = /([{}])\s*$/.exec(lines[j]);
          if (checkBracket) {
            if (checkBracket[1] === '{') {
              bracketLevel++;
            } else if (lines[j].indexOf('{') < 0) {
              bracketLevel--;
            }
          }
          j++;
        }
        lines.splice(i, j - i);
      } else if (/[};]\s*$/.test(line)) {
        lines.splice(i, 1);
      } else {
        // multiline? skipping until next directive or bracket
        do {
          lines.splice(i, 1);
        } while (i < lines.length &&
                 !/\}\s*$/.test(lines[i]) &&
                 lines[i].indexOf(':') < 0);
        if (i < lines.length && /\S\s*}\s*$/.test(lines[i])) {
          lines[i] = lines[i].substr(lines[i].indexOf('}'));
        }
      }
      // collapse whitespaces
      while (lines[i] === '' && lines[i - 1] === '') {
        lines.splice(i, 1);
      }
    }
    return lines.join('\n');
  }

  if (!mode) {
    throw new Error('Invalid CSS preprocessor mode');
  }

  var content = fs.readFileSync(source, 'utf8').toString();
  content = expandImports(content, source);
  if (mode === 'mozcentral' || mode === 'firefox') {
    content = removePrefixed(content, mode === 'mozcentral' ?
                             hasPrefixedMozcentral : hasPrefixedFirefox);
  }
  fs.writeFileSync(destination, content);
}
exports.preprocessCSS = preprocessCSS;

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
      if (test('-d', destination)) {
        destWithFolder += '/' + path.basename(source);
      }
      preprocess(source, destWithFolder, defines);
    });
  });

  (setup.preprocessCSS || []).forEach(function(option) {
    var mode = option[0];
    var source = option[1];
    var destination = option[2];
    preprocessCSS(mode, source, destination);
  });
}
exports.build = build;

/**
 * Merge two defines arrays. Values in the second param will override values in
 * the first.
 */
function merge(defaults, defines) {
  var ret = {};
  for (var key in defaults) {
    ret[key] = defaults[key];
  }
  for (key in defines) {
    ret[key] = defines[key];
  }
  return ret;
}
exports.merge = merge;
