# Shell.js - Unix shell commands for Node.js [![Build Status](https://secure.travis-ci.org/arturadib/shell.js.png)](http://travis-ci.org/arturadib/shell.js)

Shell.js is a portable (Windows included) implementation of Unix shell commands for Node.js. It can be used to eliminate your project's dependencies on Unix while still keeping its familiar and powerful syntax.

The project is both [unit-tested](http://travis-ci.org/arturadib/shell.js) and battle-tested at Mozilla's [pdf.js](http://github.com/mozilla/pdf.js).


### Example

```javascript
require('shell/global');

// Copy files to release dir
mkdir('-p', 'out/Release');
cp('-R', 'lib/*.js', 'out/Release');

// Replace macros in each .js file
cd('lib');
for (file in ls('*.js')) {
  sed('-i', 'BUILD_VERSION', 'v0.1.2', file);
  sed('-i', /.*REMOVE_THIS_LINE.*\n/, '', file);
  sed('-i', /.*REPLACE_LINE_WITH_MACRO.*\n/, cat('macro.js'), file);
}
cd('..');

// Run external tool synchronously
if (exec('git commit -am "Auto-commit"').code !== 0) {
  echo('Error: Git commit failed');
  exit(1);
}
```

### Global vs. Local

The example above uses the convenience script `shell/global` to reduce verbosity. If polluting your global namespace is not desirable, simply require `shell`.

Example:

```javascript
var shell = require('shell');
shell.echo('hello world');
```

### Make tool

A convenience script `shell/make` is also provided to mimic the behavior of a Unix Makefile. In this case all shell objects are global, and command line arguments will cause the script to execute only the corresponding function in the global `target` object. To avoid redundant calls, target functions are executed only once per script.

Example:

```javascript
//
// Example file: make.js
//
require('shell/make');

target.all = function() {
  target.bundle();
  target.docs();
}

// Bundle JS files
target.bundle = function() {
  cd(__dirname);
  mkdir('build');
  cd('lib');
  cat('*.js').to('../build/output.js');
}

// Generate docs
target.docs = function() {
  cd(__dirname);
  mkdir('docs');
  cd('lib');
  for (file in ls('*.js')) {
    var text = grep('//@', file); // extract special comments
    text.replace('//@', ''); // remove comment tags
    text.to('docs/my_docs.md');
  }
}
```

To run the target `all`, call the above script without arguments: `$ node make`. To run the target `docs`: `$ node make docs`, and so on.

### Installing

Via npm:

```bash
$ npm install shelljs
```

Or simply copy `shell.js` into your project's directory, and `require()` accordingly.


<!-- 

  DO NOT MODIFY BEYOND THIS POINT - IT'S AUTOMATICALLY GENERATED

-->


# Commands reference


All commands run synchronously, unless otherwise stated.


#### cd('dir')
Changes to directory `dir` for the duration of the script

#### pwd()
Returns the current directory.

#### ls([options ,] path [,path ...])
#### ls([options ,] path_array)
Available options:

+ `-R`: recursive
+ `-a`: all files (include files beginning with `.`)

Examples:

```javascript
ls('projs/*.js');
ls('-R', '/users/me', '/tmp');
ls('-R', ['/users/me', '/tmp']); // same as above
```

Returns list of files in the given path, or in current directory if no path provided.
For convenient iteration via `for (file in ls())`, the format returned is a hash object:
`{ 'file1':null, 'dir1/file2':null, ...}`.

#### cp('[options ,] source [,source ...], dest')
#### cp('[options ,] source_array, dest')
Available options:

+ `-f`: force
+ `-r, -R`: recursive

Examples:

```javascript
cp('file1', 'dir1');
cp('-Rf', '/tmp/*', '/usr/local/*', '/home/tmp');
cp('-Rf', ['/tmp/*', '/usr/local/*'], '/home/tmp'); // same as above
```

Copies files. The wildcard `*` is accepted.

#### rm([options ,] file [, file ...])
#### rm([options ,] file_array)
Available options:

+ `-f`: force
+ `-r, -R`: recursive

Examples:

```javascript
rm('-rf', '/tmp/*');
rm('some_file.txt', 'another_file.txt');
rm(['some_file.txt', 'another_file.txt']); // same as above
```

Removes files. The wildcard `*` is accepted. 

#### mv(source [, source ...], dest')
#### mv(source_array, dest')
Available options:

+ `f`: force

Examples:

```javascript
mv('-f', 'file', 'dir/');
mv('file1', 'file2', 'dir/');
mv(['file1', 'file2'], 'dir/'); // same as above
```

Moves files. The wildcard `*` is accepted.

#### mkdir([options ,] dir [, dir ...])
#### mkdir([options ,] dir_array)
Available options:

+ `p`: full path (will create intermediate dirs if necessary)

Examples:

```javascript
mkdir('-p', '/tmp/a/b/c/d', '/tmp/e/f/g');
mkdir('-p', ['/tmp/a/b/c/d', '/tmp/e/f/g']); // same as above
```

Creates directories.

#### cat(file [, file ...])
#### cat(file_array)

Examples:

```javascript
var str = cat('file*.txt');
var str = cat('file1', 'file2');
var str = cat(['file1', 'file2']); // same as above
```

Returns a string containing the given file, or a concatenated string
containing the files if more than one file is given (a new line character is
introduced between each file). Wildcard `*` accepted.

#### 'string'.to(file)

Examples:

```javascript
cat('input.txt').to('output.txt');
```

Analogous to the redirection operator `>` in Unix, but works with JavaScript strings (such as
those returned by `cat`, `grep`, etc). _Like Unix redirections, `to()` will overwrite any existing file!_

#### sed([options ,] search_regex, replace_str, file)
Available options:

+ `-i`: Replace contents of 'file' in-place. _Note that no backups will be created!_

Examples:

```javascript
sed('-i', 'PROGRAM_VERSION', 'v0.1.3', 'source.js');
sed(/.*DELETE_THIS_LINE.*\n/, '', 'source.js');
```

Reads an input string from `file` and performs a JavaScript `replace()` on the input
using the given search regex and replacement string. Returns the new string after replacement.

#### grep(regex_filter, file [, file ...])
#### grep(regex_filter, file_array)

Examples:

```javascript
grep('GLOBAL_VARIABLE', '*.js');
```

Reads input string from given files and returns a string containing all lines of the 
file that match the given `regex_filter`. Wildcard `*` accepted.

#### which(command)

Examples:

```javascript
var nodeExec = which('node');
```

Searches for `command` in the system's PATH. On Windows looks for `.exe`, `.cmd`, and `.bat` extensions.
Returns string containing the absolute path to the command.

#### echo(string [,string ...])

Examples:

```javascript
echo('hello world');
var str = echo('hello world');
```

Prints string to stdout, and returns string with additional utility methods
like `.to()`.

#### exit(code)
Exits the current process with the given exit code.

#### env['VAR_NAME']
Object containing environment variables (both getter and setter). Shortcut to process.env.

#### exec(command [, options] [, callback])
Available options (all `false` by default):

+ `async`: Asynchronous execution. Needs callback.
+ `silent`: Do not echo program output to console.

Examples:

```javascript
var version = exec('node --version', {silent:true}).output;
```

Executes the given `command` _synchronously_, unless otherwise specified. 
When in synchronous mode returns the object `{ code:..., output:... }`, containing the program's 
`output` (stdout + stderr)  and its exit `code`. Otherwise the `callback` gets the 
arguments `(code, output)`.

## Non-Unix commands


#### tempdir()
Searches and returns string containing a writeable, platform-dependent temporary directory.
Follows Python's [tempfile algorithm](http://docs.python.org/library/tempfile.html#tempfile.tempdir).

#### exists(path [, path ...])
#### exists(path_array)
Returns true if all the given paths exist.

#### error()
Tests if error occurred in the last command. Returns `null` if no error occurred,
otherwise returns string explaining the error

#### verbose()
Enables all output (default)

#### silent()
Suppresses all output, except for explict `echo()` calls
