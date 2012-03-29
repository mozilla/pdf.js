//
// ShellJS
// Unix shell commands on top of Node's API
//
// Copyright (c) 2012 Artur Adib
// http://github.com/arturadib/shelljs
//

var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    vm = require('vm'),
    child = require('child_process'),
    os = require('os');

// Node shims for < v0.7
fs.existsSync = fs.existsSync || path.existsSync;

var state = {
      error: null,
      fatal: false,
      silent: false,
      currentCmd: 'shell.js',
      tempDir: null
    },
    platform = os.type().match(/^Win/) ? 'win' : 'unix';


//@
//@ All commands run synchronously, unless otherwise stated.
//@ 


//@
//@ #### cd('dir')
//@ Changes to directory `dir` for the duration of the script
function _cd(options, dir) {
  if (!dir)
    error('directory not specified');

  if (!fs.existsSync(dir))
    error('no such file or directory: ' + dir);

  if (fs.existsSync(dir) && !fs.statSync(dir).isDirectory())
    error('not a directory: ' + dir);

  process.chdir(dir);
};
exports.cd = wrap('cd', _cd);

//@
//@ #### pwd()
//@ Returns the current directory.
function _pwd(options) {
  var pwd = path.resolve(process.cwd());
  return ShellString(pwd);
};
exports.pwd = wrap('pwd', _pwd);


//@
//@ #### ls([options ,] path [,path ...])
//@ #### ls([options ,] path_array)
//@ Available options:
//@
//@ + `-R`: recursive
//@ + `-a`: all files (include files beginning with `.`)
//@
//@ Examples:
//@
//@ ```javascript
//@ ls('projs/*.js');
//@ ls('-R', '/users/me', '/tmp');
//@ ls('-R', ['/users/me', '/tmp']); // same as above
//@ ```
//@
//@ Returns array of files in the given path, or in current directory if no path provided.
function _ls(options, paths) {
  options = parseOptions(options, {
    'R': 'recursive',
    'a': 'all'
  });

  if (!paths)
    paths = ['.'];
  else if (typeof paths === 'object')
    paths = paths; // assume array
  else if (typeof paths === 'string')
    paths = [].slice.call(arguments, 1);

  var list = [];

  // Conditionally pushes file to list - returns true if pushed, false otherwise
  // (e.g. prevents hidden files to be included unless explicitly told so)
  function pushFile(file, query) {
    // hidden file?
    if (path.basename(file)[0] === '.') {
      // not explicitly asking for hidden files?
      if (!options.all && !(path.basename(query)[0] === '.' && path.basename(query).length > 1))
        return false;
    }

    if (platform === 'win')
      file = file.replace(/\\/g, '/');

    list.push(file);
    return true;
  }

  paths.forEach(function(p) {
    if (fs.existsSync(p)) {
      // Simple file?
      if (fs.statSync(p).isFile()) {
        pushFile(p, p);
        return; // continue
      }
      
      // Simple dir?
      if (fs.statSync(p).isDirectory()) {
        // Iterate over p contents
        fs.readdirSync(p).forEach(function(file) {
          if (!pushFile(file, p))
            return;

          // Recursive?
          if (options.recursive) {
            var oldDir = _pwd();
            _cd('', p);
            if (fs.statSync(file).isDirectory())
              list = list.concat(_ls('-R'+(options.all?'a':''), file+'/*'));
            _cd('', oldDir);
          }
        });
        return; // continue
      }
    }

    // p does not exist - possible wildcard present

    var basename = path.basename(p);
    var dirname = path.dirname(p);
    // Wildcard present on an existing dir? (e.g. '/tmp/*.js')
    if (basename.search(/\*/) > -1 && fs.existsSync(dirname) && fs.statSync(dirname).isDirectory) {
      // Escape special regular expression chars
      var regexp = basename.replace(/(\^|\$|\(|\)|\<|\>|\[|\]|\{|\}|\.|\+|\?)/g, '\\$1');
      // Translates wildcard into regex
      regexp = '^' + regexp.replace(/\*/g, '.*') + '$';
      // Iterate over directory contents
      fs.readdirSync(dirname).forEach(function(file) {
        if (file.match(new RegExp(regexp))) {
          if (!pushFile(path.normalize(dirname+'/'+file), basename))
            return;

          // Recursive?
          if (options.recursive) {
            var pp = dirname + '/' + file;
            if (fs.statSync(pp).isDirectory())
              list = list.concat(_ls('-R'+(options.all?'a':''), pp+'/*'));
          } // recursive
        } // if file matches
      }); // forEach
      return;
    }

    error('no such file or directory: ' + p, true);
  });

  return list;
};
exports.ls = wrap('ls', _ls);


//@
//@ #### find(path [,path ...])
//@ #### find(path_array)
//@ Examples:
//@
//@ ```javascript
//@ find('src', 'lib');
//@ find(['src', 'lib']); // same as above
//@ find('.').filter(function(file) { return file.match(/\.js$/); });
//@ ```
//@
//@ Returns array of all files (however deep) in the given paths.
//@
//@ The main difference from `ls('-R', path)` is that the resulting file names 
//@ include the base directories, e.g. `lib/resources/file1` instead of just `file1`.
function _find(options, paths) {
  if (!paths)
    error('no path specified');
  else if (typeof paths === 'object')
    paths = paths; // assume array
  else if (typeof paths === 'string')
    paths = [].slice.call(arguments, 1);

  var list = [];

  function pushFile(file) {
    if (platform === 'win')
      file = file.replace(/\\/g, '/');
    list.push(file);
  }

  // why not simply do ls('-R', paths)? because the output wouldn't give the base dirs
  // to get the base dir in the output, we need instead ls('-R', 'dir/*') for every directory

  paths.forEach(function(file) {
    pushFile(file);

    if (fs.statSync(file).isDirectory()) {
      _ls('-Ra', file+'/*').forEach(function(subfile) {
        pushFile(subfile);
      });
    }
  });

  return list;
}
exports.find = wrap('find', _find);


//@
//@ #### cp('[options ,] source [,source ...], dest')
//@ #### cp('[options ,] source_array, dest')
//@ Available options:
//@
//@ + `-f`: force
//@ + `-r, -R`: recursive
//@
//@ Examples:
//@
//@ ```javascript
//@ cp('file1', 'dir1');
//@ cp('-Rf', '/tmp/*', '/usr/local/*', '/home/tmp');
//@ cp('-Rf', ['/tmp/*', '/usr/local/*'], '/home/tmp'); // same as above
//@ ```
//@
//@ Copies files. The wildcard `*` is accepted.
function _cp(options, sources, dest) {
  options = parseOptions(options, {
    'f': 'force',
    'R': 'recursive',
    'r': 'recursive'
  });

  // Get sources, dest
  if (arguments.length < 3) {
    error('missing <source> and/or <dest>');
  } else if (arguments.length > 3) {
    sources = [].slice.call(arguments, 1, arguments.length - 1);
    dest = arguments[arguments.length - 1];
  } else if (typeof sources === 'string') {
    sources = [sources];
  } else if ('length' in sources) {
    sources = sources; // no-op for array
  } else {
    error('invalid arguments');
  }

  // Dest is not existing dir, but multiple sources given
  if ((!fs.existsSync(dest) || !fs.statSync(dest).isDirectory()) && sources.length > 1)
    error('dest is not a directory (too many sources)');

  // Dest is an existing file, but no -f given
  if (fs.existsSync(dest) && fs.statSync(dest).isFile() && !options.force)
    error('dest file already exists: ' + dest);

  sources = expand(sources);

  sources.forEach(function(src) {
    if (!fs.existsSync(src)) {
      error('no such file or directory: '+src, true);
      return; // skip file
    }

    // If here, src exists

    if (fs.statSync(src).isDirectory()) {
      if (!options.recursive) {
        // Non-Recursive
        log(src + ' is a directory (not copied)');
      } else {
        // Recursive
        // 'cp /a/source dest' should create 'source' in 'dest'
        var newDest = dest+'/'+path.basename(src),
            checkDir = fs.statSync(src);
        try {
          fs.mkdirSync(newDest, checkDir.mode);
        } catch (e) {
          //if the directory already exists, that's okay
          if (e.code !== 'EEXIST') throw e;
        }
        cpdirSyncRecursive(src, newDest, {force: options.force});
      }
      return; // done with dir
    }

    // If here, src is a file

    // When copying to '/path/dir':
    //    thisDest = '/path/dir/file1'
    var thisDest = dest;
    if (fs.existsSync(dest) && fs.statSync(dest).isDirectory())
      thisDest = path.normalize(dest + '/' + path.basename(src));

    if (fs.existsSync(thisDest) && !options.force) {
      error('dest file already exists: ' + thisDest, true);
      return; // skip file
    }

    copyFileSync(src, thisDest);
  }); // forEach(src)
}; // cp
exports.cp = wrap('cp', _cp);

//@
//@ #### rm([options ,] file [, file ...])
//@ #### rm([options ,] file_array)
//@ Available options:
//@
//@ + `-f`: force
//@ + `-r, -R`: recursive
//@
//@ Examples:
//@
//@ ```javascript
//@ rm('-rf', '/tmp/*');
//@ rm('some_file.txt', 'another_file.txt');
//@ rm(['some_file.txt', 'another_file.txt']); // same as above
//@ ```
//@
//@ Removes files. The wildcard `*` is accepted. 
function _rm(options, files) {
  options = parseOptions(options, {
    'f': 'force',
    'r': 'recursive',
    'R': 'recursive'
  });
  if (!files)
    error('no paths given');

  if (typeof files === 'string')
    files = [].slice.call(arguments, 1);
  // if it's array leave it as it is

  files = expand(files);

  files.forEach(function(file) {
    if (!fs.existsSync(file)) {
      // Path does not exist, no force flag given
      if (!options.force)
        error('no such file or directory: '+file, true);

      return; // skip file
    }

    // If here, path exists

    // Remove simple file
    if (fs.statSync(file).isFile()) {

      // Do not check for file writing permissions
      if (options.force) {
        _unlinkSync(file);
        return;
      }
            
      if (isWriteable(file))
        _unlinkSync(file);
      else
        error('permission denied: '+file, true);

      return;
    } // simple file

    // Path is an existing directory, but no -r flag given
    if (fs.statSync(file).isDirectory() && !options.recursive) {
      error('path is a directory', true);
      return; // skip path
    }

    // Recursively remove existing directory
    if (fs.statSync(file).isDirectory() && options.recursive) {
      rmdirSyncRecursive(file, options.force);
    }
  }); // forEach(file)
}; // rm
exports.rm = wrap('rm', _rm);

//@
//@ #### mv(source [, source ...], dest')
//@ #### mv(source_array, dest')
//@ Available options:
//@
//@ + `f`: force
//@
//@ Examples:
//@
//@ ```javascript
//@ mv('-f', 'file', 'dir/');
//@ mv('file1', 'file2', 'dir/');
//@ mv(['file1', 'file2'], 'dir/'); // same as above
//@ ```
//@
//@ Moves files. The wildcard `*` is accepted.
function _mv(options, sources, dest) {
  options = parseOptions(options, {
    'f': 'force'
  });

  // Get sources, dest
  if (arguments.length < 3) {
    error('missing <source> and/or <dest>');
  } else if (arguments.length > 3) {
    sources = [].slice.call(arguments, 1, arguments.length - 1);
    dest = arguments[arguments.length - 1];
  } else if (typeof sources === 'string') {
    sources = [sources];
  } else if ('length' in sources) {
    sources = sources; // no-op for array
  } else {
    error('invalid arguments');
  }

  sources = expand(sources);

  // Dest is not existing dir, but multiple sources given
  if ((!fs.existsSync(dest) || !fs.statSync(dest).isDirectory()) && sources.length > 1)
    error('dest is not a directory (too many sources)');

  // Dest is an existing file, but no -f given
  if (fs.existsSync(dest) && fs.statSync(dest).isFile() && !options.force)
    error('dest file already exists: ' + dest);

  sources.forEach(function(src) {
    if (!fs.existsSync(src)) {
      error('no such file or directory: '+src, true);
      return; // skip file
    }

    // If here, src exists

    // When copying to '/path/dir':
    //    thisDest = '/path/dir/file1'
    var thisDest = dest;
    if (fs.existsSync(dest) && fs.statSync(dest).isDirectory())
      thisDest = path.normalize(dest + '/' + path.basename(src));

    if (fs.existsSync(thisDest) && !options.force) {
      error('dest file already exists: ' + thisDest, true);
      return; // skip file
    }

    if (path.resolve(src) === path.dirname(path.resolve(thisDest))) {
      error('cannot move to self: '+src, true);
      return; // skip file
    }

    fs.renameSync(src, thisDest);
  }); // forEach(src)
}; // mv
exports.mv = wrap('mv', _mv);

//@
//@ #### mkdir([options ,] dir [, dir ...])
//@ #### mkdir([options ,] dir_array)
//@ Available options:
//@
//@ + `p`: full path (will create intermediate dirs if necessary)
//@
//@ Examples:
//@
//@ ```javascript
//@ mkdir('-p', '/tmp/a/b/c/d', '/tmp/e/f/g');
//@ mkdir('-p', ['/tmp/a/b/c/d', '/tmp/e/f/g']); // same as above
//@ ```
//@
//@ Creates directories.
function _mkdir(options, dirs) {
  options = parseOptions(options, {
    'p': 'fullpath'
  });
  if (!dirs)
    error('no paths given');

  if (typeof dirs === 'string')
    dirs = [].slice.call(arguments, 1);
  // if it's array leave it as it is

  dirs.forEach(function(dir) {
    if (fs.existsSync(dir)) {
      if (!options.fullpath)
          error('path already exists: ' + dir, true);
      return; // skip dir
    }

    // Base dir does not exist, and no -p option given
    var baseDir = path.dirname(dir);
    if (!fs.existsSync(baseDir) && !options.fullpath) {
      error('no such file or directory: ' + baseDir, true);
      return; // skip dir
    }

    if (options.fullpath)
      mkdirSyncRecursive(dir);
    else
      fs.mkdirSync(dir, 0777);
  });
}; // mkdir
exports.mkdir = wrap('mkdir', _mkdir);

//@
//@ #### test(expression)
//@ Available expression primaries:
//@
//@ + `'-d', 'path'`: true if path is a directory
//@ + `'-f', 'path'`: true if path is a regular file
//@
//@ Examples:
//@
//@ ```javascript
//@ if (test('-d', path)) { /* do something with dir */ };
//@ if (!test('-f', path)) continue; // skip if it's a regular file
//@ ```
//@
//@ Evaluates expression using the available primaries and returns corresponding value.
function _test(options, path) {
  if (!path)
    error('no path given');

  // hack - only works with unary primaries
  options = parseOptions(options, {
    'd': 'directory',
    'f': 'file'
  });
  if (!options.directory && !options.file)
    error('could not interpret expression');

  if (options.directory)
    return fs.existsSync(path) && fs.statSync(path).isDirectory();

  if (options.file)
    return fs.existsSync(path) && fs.statSync(path).isFile();
}; // test
exports.test = wrap('test', _test);


//@
//@ #### cat(file [, file ...])
//@ #### cat(file_array)
//@
//@ Examples:
//@
//@ ```javascript
//@ var str = cat('file*.txt');
//@ var str = cat('file1', 'file2');
//@ var str = cat(['file1', 'file2']); // same as above
//@ ```
//@
//@ Returns a string containing the given file, or a concatenated string
//@ containing the files if more than one file is given (a new line character is
//@ introduced between each file). Wildcard `*` accepted.
function _cat(options, files) {
  var cat = '';

  if (!files)
    error('no paths given');

  if (typeof files === 'string')
    files = [].slice.call(arguments, 1);
  // if it's array leave it as it is

  files = expand(files);

  files.forEach(function(file) {
    if (!fs.existsSync(file))
      error('no such file or directory: ' + file);

    cat += fs.readFileSync(file, 'utf8') + '\n';
  });

  if (cat[cat.length-1] === '\n')
    cat = cat.substring(0, cat.length-1);

  return ShellString(cat);
};
exports.cat = wrap('cat', _cat);

//@
//@ #### 'string'.to(file)
//@
//@ Examples:
//@
//@ ```javascript
//@ cat('input.txt').to('output.txt');
//@ ```
//@
//@ Analogous to the redirection operator `>` in Unix, but works with JavaScript strings (such as
//@ those returned by `cat`, `grep`, etc). _Like Unix redirections, `to()` will overwrite any existing file!_
function _to(options, file) {
  if (!file)
    error('wrong arguments');

  if (!fs.existsSync( path.dirname(file) ))
      error('no such file or directory: ' + path.dirname(file));

  try {
    fs.writeFileSync(file, this.toString(), 'utf8');
  } catch(e) {
    error('could not write to file (code '+e.code+'): '+file, true);
  }
};
// In the future, when Proxies are default, we can add methods like `.to()` to primitive strings. 
// For now, this is a dummy function to bookmark places we need such strings
function ShellString(str) {
  return str;
}
String.prototype.to = wrap('to', _to);

//@
//@ #### sed([options ,] search_regex, replace_str, file)
//@ Available options:
//@
//@ + `-i`: Replace contents of 'file' in-place. _Note that no backups will be created!_
//@
//@ Examples:
//@
//@ ```javascript
//@ sed('-i', 'PROGRAM_VERSION', 'v0.1.3', 'source.js');
//@ sed(/.*DELETE_THIS_LINE.*\n/, '', 'source.js');
//@ ```
//@
//@ Reads an input string from `file` and performs a JavaScript `replace()` on the input
//@ using the given search regex and replacement string. Returns the new string after replacement.
function _sed(options, regex, replacement, file) {
  options = parseOptions(options, {
    'i': 'inplace'
  });

  if (typeof replacement === 'string')
    replacement = replacement; // no-op
  else if (typeof replacement === 'number')
    replacement = replacement.toString(); // fallback
  else
    error('invalid replacement string');

  if (!file)
    error('no file given');

  if (!fs.existsSync(file))
    error('no such file or directory: ' + file);

  var result = fs.readFileSync(file, 'utf8').replace(regex, replacement);
  if (options.inplace)
    fs.writeFileSync(file, result, 'utf8');

  return ShellString(result);
};
exports.sed = wrap('sed', _sed);

//@
//@ #### grep(regex_filter, file [, file ...])
//@ #### grep(regex_filter, file_array)
//@
//@ Examples:
//@
//@ ```javascript
//@ grep('GLOBAL_VARIABLE', '*.js');
//@ ```
//@
//@ Reads input string from given files and returns a string containing all lines of the 
//@ file that match the given `regex_filter`. Wildcard `*` accepted.
function _grep(options, regex, files) {
  if (!files)
    error('no paths given');

  if (typeof files === 'string')
    files = [].slice.call(arguments, 2);
  // if it's array leave it as it is

  files = expand(files);

  var grep = '';
  files.forEach(function(file) {
    if (!fs.existsSync(file)) {
      error('no such file or directory: ' + file, true);
      return;
    }

    var contents = fs.readFileSync(file, 'utf8'),
        lines = contents.split(/\r*\n/);
    lines.forEach(function(line) {
      if (line.match(regex))
        grep += line + '\n';
    });
  });

  return ShellString(grep);
};
exports.grep = wrap('grep', _grep);


//@
//@ #### which(command)
//@
//@ Examples:
//@
//@ ```javascript
//@ var nodeExec = which('node');
//@ ```
//@
//@ Searches for `command` in the system's PATH. On Windows looks for `.exe`, `.cmd`, and `.bat` extensions.
//@ Returns string containing the absolute path to the command.
function _which(options, cmd) {
  if (!cmd)
    error('must specify command');

  var pathEnv = process.env.path || process.env.Path || process.env.PATH,
      pathArray = splitPath(pathEnv),
      where = null;

  // No relative/absolute paths provided?
  if (cmd.search(/\//) === -1) {
    // Search for command in PATH
    pathArray.forEach(function(dir) {
      if (where)
        return; // already found it

      var attempt = path.resolve(dir + '/' + cmd);
      if (fs.existsSync(attempt)) {
        where = attempt;
        return;
      }

      if (platform === 'win') {
        var baseAttempt = attempt;
        attempt = baseAttempt + '.exe';
        if (fs.existsSync(attempt)) {
          where = attempt;
          return;
        }
        attempt = baseAttempt + '.cmd';
        if (fs.existsSync(attempt)) {
          where = attempt;
          return;
        }
        attempt = baseAttempt + '.bat';
        if (fs.existsSync(attempt)) {
          where = attempt;
          return;
        }
      } // if 'win'
    });
  }
    
  // Command not found anywhere?
  if (!fs.existsSync(cmd) && !where)
    return null;

  where = where || path.resolve(cmd);

  return ShellString(where);
};
exports.which = wrap('which', _which);

//@
//@ #### echo(string [,string ...])
//@
//@ Examples:
//@
//@ ```javascript
//@ echo('hello world');
//@ var str = echo('hello world');
//@ ```
//@
//@ Prints string to stdout, and returns string with additional utility methods
//@ like `.to()`.
function _echo(options) {
  var messages = [].slice.call(arguments, 1);
  console.log.apply(this, messages);
  return ShellString(messages.join(' '));
};
exports.echo = wrap('echo', _echo);

//@
//@ #### exit(code)
//@ Exits the current process with the given exit code.
exports.exit = process.exit;

//@
//@ #### env['VAR_NAME']
//@ Object containing environment variables (both getter and setter). Shortcut to process.env.
exports.env = process.env;

//@
//@ #### exec(command [, options] [, callback])
//@ Available options (all `false` by default):
//@
//@ + `async`: Asynchronous execution. Needs callback.
//@ + `silent`: Do not echo program output to console.
//@
//@ Examples:
//@
//@ ```javascript
//@ var version = exec('node --version', {silent:true}).output;
//@ ```
//@
//@ Executes the given `command` _synchronously_, unless otherwise specified. 
//@ When in synchronous mode returns the object `{ code:..., output:... }`, containing the program's 
//@ `output` (stdout + stderr)  and its exit `code`. Otherwise the `callback` gets the 
//@ arguments `(code, output)`.
//@
//@ **Note:** For long-lived processes, it's best to run `exec()` asynchronously as
//@ the current synchronous implementation uses a lot of CPU. This should be getting
//@ fixed soon.
function _exec(command, options, callback) {
  if (!command)
    error('must specify command');

  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  options = extend({
    silent: state.silent,
    async: false
  }, options);

  if (options.async)
    execAsync(command, options, callback);
  else
    return execSync(command, options);
};
exports.exec = wrap('exec', _exec, {notUnix:true});




//@
//@ ## Non-Unix commands
//@






//@
//@ #### tempdir()
//@ Searches and returns string containing a writeable, platform-dependent temporary directory.
//@ Follows Python's [tempfile algorithm](http://docs.python.org/library/tempfile.html#tempfile.tempdir).
exports.tempdir = wrap('tempdir', tempDir);


//@
//@ #### error()
//@ Tests if error occurred in the last command. Returns `null` if no error occurred,
//@ otherwise returns string explaining the error
exports.error = function() {
  return state.error;
}

//@
//@ #### silent([state])
//@ Example:
//@
//@ ```javascript
//@ var silentState = silent();
//@ silent(true);
//@ /* ... */
//@ silent(silentState); // restore old silent state
//@ ```
//@
//@ Suppresses all command output if `state = true`, except for `echo()` calls. 
//@ Returns state if no arguments given.
exports.silent = function(_state) {
  if (typeof _state !== 'boolean')
    return state.silent;
  
  state.silent = _state;
}


//@
//@ ## Deprecated
//@




//@
//@ #### exists(path [, path ...])
//@ #### exists(path_array)
//@
//@ _This function is being deprecated. Use `test()` instead._
//@
//@ Returns true if all the given paths exist.
function _exists(options, paths) {
  deprecate('exists', 'Use test() instead.');

  if (!paths)
    error('no paths given');

  if (typeof paths === 'string')
    paths = [].slice.call(arguments, 1);
  // if it's array leave it as it is

  var exists = true;
  paths.forEach(function(p) {
    if (!fs.existsSync(p))
      exists = false;
  });

  return exists;
};
exports.exists = wrap('exists', _exists);


//@
//@ #### verbose()
//@
//@ _This function is being deprecated. Use `silent(false) instead.`_
//@
//@ Enables all output (default)
exports.verbose = function() {
  deprecate('verbose', 'Use silent(false) instead.');

  state.silent = false;
}










////////////////////////////////////////////////////////////////////////////////////////////////
//
// Auxiliary functions (internal use only)
//

function log() {
  if (!state.silent)
    console.log.apply(this, arguments);
}

function deprecate(what, msg) {
  console.log('*** ShellJS.'+what+': This function is deprecated.', msg);
}

function write(msg) {
  if (!state.silent)
    process.stdout.write(msg);
}

// Shows error message. Throws unless '_continue = true'.
function error(msg, _continue) {
  if (state.error === null)
    state.error = '';
  state.error += state.currentCmd + ': ' + msg + '\n';
  
  log(state.error);

  if (!_continue)
    throw '';
}

// Returns {'alice': true, 'bob': false} when passed:
//   parseOptions('-a', {'a':'alice', 'b':'bob'});
function parseOptions(str, map) {
  if (!map)
    error('parseOptions() internal error: no map given');

  // All options are false by default
  var options = {};
  for (letter in map)
    options[map[letter]] = false;

  if (!str)
    return options; // defaults

  if (typeof str !== 'string')
    error('parseOptions() internal error: wrong str');

  // e.g. match[1] = 'Rf' for str = '-Rf'
  var match = str.match(/^\-(.+)/);
  if (!match)
    return options;

  // e.g. chars = ['R', 'f']
  var chars = match[1].split('');

  chars.forEach(function(char) {
    if (char in map)
      options[map[char]] = true;
    else
      error('option not recognized: '+char);
  });

  return options;
}

// Common wrapper for all Unix-like commands
function wrap(cmd, fn, options) {
  return function() {
    var retValue = null;

    state.currentCmd = cmd;
    state.error = null;

    try {
      var args = [].slice.call(arguments, 0);

      if (options && options.notUnix) {
        retValue = fn.apply(this, args);
      } else {
        if (args.length === 0 || typeof args[0] !== 'string' || args[0][0] !== '-')
          args.unshift(''); // only add dummy option if '-option' not already present
        retValue = fn.apply(this, args);
      }
    } catch (e) {
      if (!state.error) {
        // If state.error hasn't been set it's an error thrown by Node, not us - probably a bug...
        console.log('shell.js: internal error');
        console.log(e.stack || e);
        process.exit(1);
      }
      if (state.fatal)
        throw e;
    }

    state.currentCmd = 'shell.js';
    return retValue;
  }
} // wrap

// Buffered file copy, synchronous
// (Using readFileSync() + writeFileSync() could easily cause a memory overflow
//  with large files)
function copyFileSync(srcFile, destFile) {
  if (!fs.existsSync(srcFile))
    error('copyFileSync: no such file or directory: ' + srcFile);

  var BUF_LENGTH = 64*1024,
      buf = new Buffer(BUF_LENGTH),
      bytesRead = BUF_LENGTH,
      pos = 0,
      fdr = null,
      fdw = null;

  try {
    fdr = fs.openSync(srcFile, 'r');
  } catch(e) {
    error('copyFileSync: could not read src file ('+srcFile+')');
  }

  try {
    fdw = fs.openSync(destFile, 'w');
  } catch(e) {
    error('copyFileSync: could not write to dest file (code='+e.code+'):'+destFile);
  }

  while (bytesRead === BUF_LENGTH) {
    bytesRead = fs.readSync(fdr, buf, 0, BUF_LENGTH, pos);
    fs.writeSync(fdw, buf, 0, bytesRead);
    pos += bytesRead;
  }

  fs.closeSync(fdr);
  fs.closeSync(fdw);
}

// Recursively copies 'sourceDir' into 'destDir'
// Adapted from https://github.com/ryanmcgrath/wrench-js
//
// Copyright (c) 2010 Ryan McGrath
// Copyright (c) 2012 Artur Adib
//
// Licensed under the MIT License
// http://www.opensource.org/licenses/mit-license.php
function cpdirSyncRecursive(sourceDir, destDir, opts) {
  if (!opts) opts = {};

  /* Create the directory where all our junk is moving to; read the mode of the source directory and mirror it */
  var checkDir = fs.statSync(sourceDir);
  try {
    fs.mkdirSync(destDir, checkDir.mode);
  } catch (e) {
    //if the directory already exists, that's okay
    if (e.code !== 'EEXIST') throw e;
  }

  var files = fs.readdirSync(sourceDir);

  for(var i = 0; i < files.length; i++) {
    var currFile = fs.lstatSync(sourceDir + "/" + files[i]);

    if (currFile.isDirectory()) {
      /* recursion this thing right on back. */
      cpdirSyncRecursive(sourceDir + "/" + files[i], destDir + "/" + files[i], opts);
    } else if (currFile.isSymbolicLink()) {
      var symlinkFull = fs.readlinkSync(sourceDir + "/" + files[i]);
      fs.symlinkSync(symlinkFull, destDir + "/" + files[i]);
    } else {
      /* At this point, we've hit a file actually worth copying... so copy it on over. */
      if (fs.existsSync(destDir + "/" + files[i]) && !opts.force) {
        log('skipping existing file: ' + files[i]);
      } else {
        copyFileSync(sourceDir + "/" + files[i], destDir + "/" + files[i]);
      }
    }

  } // for files
}; // cpdirSyncRecursive

// Recursively removes 'dir'
// Adapted from https://github.com/ryanmcgrath/wrench-js
//
// Copyright (c) 2010 Ryan McGrath
// Copyright (c) 2012 Artur Adib
//
// Licensed under the MIT License
// http://www.opensource.org/licenses/mit-license.php
function rmdirSyncRecursive(dir, force) {
  var files;

  files = fs.readdirSync(dir);

  // Loop through and delete everything in the sub-tree after checking it
  for(var i = 0; i < files.length; i++) {
    var file = dir + "/" + files[i],
        currFile = fs.lstatSync(file);

    if(currFile.isDirectory()) { // Recursive function back to the beginning
      rmdirSyncRecursive(file, force);
    }

    else if(currFile.isSymbolicLink()) { // Unlink symlinks
      if (force || isWriteable(file))
        _unlinkSync(file);
    }

    else // Assume it's a file - perhaps a try/catch belongs here?
      if (force || isWriteable(file))
        _unlinkSync(file);
  }

  // Now that we know everything in the sub-tree has been deleted, we can delete the main directory. 
  // Huzzah for the shopkeep.

  var result;
  try {
    result = fs.rmdirSync(dir);
  } catch(e) {
    error('could not remove directory (code '+e.code+'): ' + dir, true);
  }

  return result;
}; // rmdirSyncRecursive

// Recursively creates 'dir'
function mkdirSyncRecursive(dir) {
  var baseDir = path.dirname(dir);

  // Base dir exists, no recursion necessary
  if (fs.existsSync(baseDir)) {
    fs.mkdirSync(dir, 0777);
    return;
  }

  // Base dir does not exist, go recursive
  mkdirSyncRecursive(baseDir);

  // Base dir created, can create dir
  fs.mkdirSync(dir, 0777);
};

// e.g. 'makerjs_a5f185d0443ca...'
function randomFileName() {
  function randomHash(count) {
    if (count === 1)
      return parseInt(16*Math.random()).toString(16);
    else {
      var hash = '';
      for (var i=0; i<count; i++)
        hash += randomHash(1);
      return hash;
    }
  }

  return 'makerjs_'+randomHash(20);
}

// Returns false if 'dir' is not a writeable directory, 'dir' otherwise
function writeableDir(dir) {
  if (!dir || !fs.existsSync(dir))
    return false;

  if (!fs.statSync(dir).isDirectory())
    return false;

  var testFile = dir+'/'+randomFileName();
  try {
    fs.writeFileSync(testFile, ' ');
    _unlinkSync(testFile);
    return dir;
  } catch (e) {
    return false;
  }
}

// Cross-platform method for getting an available temporary directory.
// Follows the algorithm of Python's tempfile.tempdir
// http://docs.python.org/library/tempfile.html#tempfile.tempdir
function tempDir() {
  if (state.tempDir)
    return state.tempDir; // from cache

  state.tempDir = writeableDir(process.env['TMPDIR']) ||
                  writeableDir(process.env['TEMP']) ||
                  writeableDir(process.env['TMP']) ||
                  writeableDir(process.env['Wimp$ScrapDir']) || // RiscOS
                  writeableDir('C:\\TEMP') || // Windows
                  writeableDir('C:\\TMP') || // Windows
                  writeableDir('\\TEMP') || // Windows
                  writeableDir('\\TMP') || // Windows
                  writeableDir('/tmp') ||
                  writeableDir('/var/tmp') ||
                  writeableDir('/usr/tmp') ||
                  writeableDir('.'); // last resort
  
  return state.tempDir;
}

// Wrapper around exec() to enable echoing output to console in real time
function execAsync(cmd, opts, callback) {
  var output = '';

  var options = extend({
    silent: state.silent
  }, opts);
  
  var c = child.exec(cmd, {env: process.env}, function(err) {
    if (callback) 
      callback(err ? err.code : 0, output);
  });

  c.stdout.on('data', function(data) {
    output += data;
    if (!options.silent)
      process.stdout.write(data);
  });

  c.stderr.on('data', function(data) {
    output += data;
    if (!options.silent)
      process.stdout.write(data);
  });
}

// Hack to run child_process.exec() synchronously (sync avoids callback hell)
// Uses a custom wait loop that checks for a flag file, created when the child process is done.
// (Can't do a wait loop that checks for internal Node variables/messages as
// Node is single-threaded; callbacks and other internal state changes are done in the 
// event loop).
function execSync(cmd, opts) {
  var stdoutFile = path.resolve(tempDir()+'/'+randomFileName()),
      codeFile = path.resolve(tempDir()+'/'+randomFileName()),
      scriptFile = path.resolve(tempDir()+'/'+randomFileName()),
      sleepFile = path.resolve(tempDir()+'/'+randomFileName());

  var options = extend({
    silent: state.silent
  }, opts);

  var previousStdoutContent = '';
  // Echoes stdout changes from running process, if not silent
  function updateStdout() {
    if (options.silent || !fs.existsSync(stdoutFile))
      return;

    var stdoutContent = fs.readFileSync(stdoutFile, 'utf8');
    // No changes since last time?
    if (stdoutContent.length <= previousStdoutContent.length)
      return;

    process.stdout.write(stdoutContent.substr(previousStdoutContent.length));
    previousStdoutContent = stdoutContent;
  }

  function escape(str) {
    str = str.replace(/\'/g, '"');
    str = str.replace(/\\/g, '\\\\');
    return str;
  }
    
  cmd += ' > '+stdoutFile+' 2>&1'; // works on both win/unix

  var script = 
   "var child = require('child_process'), \
        fs = require('fs'); \
    child.exec('"+escape(cmd)+"', {env: process.env}, function(err) { \
      fs.writeFileSync('"+escape(codeFile)+"', err ? err.code.toString() : '0'); \
    });";

  if (fs.existsSync(scriptFile)) _unlinkSync(scriptFile);
  if (fs.existsSync(stdoutFile)) _unlinkSync(stdoutFile);
  if (fs.existsSync(codeFile)) _unlinkSync(codeFile);

  fs.writeFileSync(scriptFile, script);
  child.exec('node '+scriptFile, { 
    env: process.env,
    cwd: exports.pwd()
  });

  // The wait loop
  // sleepFile is used as a dummy I/O op to mitigate unnecessary CPU usage
  // (tried many I/O sync ops, writeFileSync() seems to be only one that is effective in reducing
  // CPU usage, though apparently not so much on Windows)
  while (!fs.existsSync(codeFile)) { updateStdout(); fs.writeFileSync(sleepFile, 'a'); };
  while (!fs.existsSync(stdoutFile)) { updateStdout(); fs.writeFileSync(sleepFile, 'a'); };

  // At this point codeFile exists, but it's not necessarily flushed yet.
  // Keep reading it until it is.
  var code = parseInt('');
  while (isNaN(code))
    code = parseInt(fs.readFileSync(codeFile, 'utf8'));

  var stdout = fs.readFileSync(stdoutFile, 'utf8');

  // No biggie if we can't erase the files now -- they're in a temp dir anyway
  try { _unlinkSync(scriptFile); } catch(e) {};
  try { _unlinkSync(stdoutFile); } catch(e) {};
  try { _unlinkSync(codeFile); } catch(e) {};
  try { _unlinkSync(sleepFile); } catch(e) {};
  
  // True if successful, false if not
  var obj = {
    code: code,
    output: stdout
  };
  return obj;
} // execSync()

// Expands wildcards with matching file names. For a given array of file names 'list', returns 
// another array containing all file names as per ls(list[i]). 
// For example: expand(['file*.js']) = ['file1.js', 'file2.js', ...]
// (if the files 'file1.js', 'file2.js', etc, exist in the current dir)
function expand(list) {
  var expanded = [];
  list.forEach(function(listEl) {
    // Wildcard present? 
    if (listEl.search(/\*/) > -1) {
      _ls('', listEl).forEach(function(file) {
        expanded.push(file);
      });
    } else {
      expanded.push(listEl);
    }
  });  
  return expanded;
}

// Cross-platform method for splitting environment PATH variables
function splitPath(p) {
  if (!p)
    return [];

  if (platform === 'win')
    return p.split(';');
  else
    return p.split(':');
}

// extend(target_obj, source_obj1 [, source_obj2 ...])
// Shallow extend, e.g.:
//    aux.extend({a:1}, {b:2}, {c:3}) 
//    returns {a:1, b:2, c:3}
function extend(target) {
  var sources = [].slice.call(arguments, 1);
  sources.forEach(function(source) {
    for (key in source) 
      target[key] = source[key];
  });
  
  return target;
}

// Normalizes _unlinkSync() across platforms to match Unix behavior, i.e.
// file can be unlinked even if it's read-only, see joyent/node#3006
function _unlinkSync(file) {
  try {
    fs.unlinkSync(file);
  } catch(e) {
    // Try to override file permission
    if (e.code === 'EPERM') {
      fs.chmodSync(file, '0666');
      fs.unlinkSync(file);
    } else {
      throw e;
    }
  }
}

// Hack to determine if file has write permissions for current user
// Avoids having to check user, group, etc, but it's probably slow
function isWriteable(file) {
  var writePermission = true;
  try {
    var __fd = fs.openSync(file, 'a');
    fs.closeSync(__fd);
  } catch(e) {
    writePermission = false;
  }

  return writePermission;
}
