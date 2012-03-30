# ShellJS - Unix shell commands for Node.js [![Build Status](https://secure.travis-ci.org/arturadib/shelljs.png)](http://travis-ci.org/arturadib/shelljs)

+ _This project is young and experimental. Use at your own risk._
+ _Major API change as of v0.0.4: `ls()` and `find()` now return arrays._

ShellJS is a **portable** (Windows included) implementation of Unix shell commands on top of the Node.js API. You can use it to eliminate your shell script's dependency on Unix while still keeping its familiar and powerful commands.

The project is [unit-tested](http://travis-ci.org/arturadib/shelljs) and is being used at Mozilla's [pdf.js](http://github.com/mozilla/pdf.js).


### Example

```javascript
require('shelljs/global');

// Copy files to release dir
mkdir('-p', 'out/Release');
cp('-R', 'stuff/*', 'out/Release');

// Replace macros in each .js file
cd('lib');
ls('*.js').forEach(function(file) {
  sed('-i', 'BUILD_VERSION', 'v0.1.2', file);
  sed('-i', /.*REMOVE_THIS_LINE.*\n/, '', file);
  sed('-i', /.*REPLACE_LINE_WITH_MACRO.*\n/, cat('macro.js'), file);
});
cd('..');

// Run external tool synchronously
if (exec('git commit -am "Auto-commit"').code !== 0) {
  echo('Error: Git commit failed');
  exit(1);
}
```

### Global vs. Local

The example above uses the convenience script `shelljs/global` to reduce verbosity. If polluting your global namespace is not desirable, simply require `shelljs`.

Example:

```javascript
var shell = require('shelljs');
shell.echo('hello world');
```

### Make tool

A convenience script `shelljs/make` is also provided to mimic the behavior of a Unix Makefile. In this case all shell objects are global, and command line arguments will cause the script to execute only the corresponding function in the global `target` object. To avoid redundant calls, target functions are executed only once per script.

Example:

```javascript
//
// Example file: make.js
//
require('shelljs/make');

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
  ls('*.js').forEach(function(file){
    var text = grep('//@', file); // extract special comments
    text.replace('//@', ''); // remove comment tags
    text.to('docs/my_docs.md');
  });
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


# Command reference


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

Returns array of files in the given path, or in current directory if no path provided.

#### find(path [,path ...])
#### find(path_array)
Examples:

```javascript
find('src', 'lib');
find(['src', 'lib']); // same as above
find('.').filter(function(file) { return file.match(/\.js$/); });
```

Returns array of all files (however deep) in the given paths.

The main difference from `ls('-R', path)` is that the resulting file names 
include the base directories, e.g. `lib/resources/file1` instead of just `file1`.

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

#### test(expression)
Available expression primaries:

+ `'-d', 'path'`: true if path is a directory
+ `'-f', 'path'`: true if path is a regular file

Examples:

```javascript
if (test('-d', path)) { /* do something with dir */ };
if (!test('-f', path)) continue; // skip if it's a regular file
```

Evaluates expression using the available primaries and returns corresponding value.

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

**Note:** For long-lived processes, it's best to run `exec()` asynchronously as
the current synchronous implementation uses a lot of CPU. This should be getting
fixed soon.

## Non-Unix commands


#### tempdir()
Searches and returns string containing a writeable, platform-dependent temporary directory.
Follows Python's [tempfile algorithm](http://docs.python.org/library/tempfile.html#tempfile.tempdir).

#### error()
Tests if error occurred in the last command. Returns `null` if no error occurred,
otherwise returns string explaining the error

#### silent([state])
Example:

```javascript
var silentState = silent();
silent(true);
/* ... */
silent(silentState); // restore old silent state
```

Suppresses all command output if `state = true`, except for `echo()` calls. 
Returns state if no arguments given.

## Deprecated


#### exists(path [, path ...])
#### exists(path_array)

_This function is being deprecated. Use `test()` instead._

Returns true if all the given paths exist.

#### verbose()

_This function is being deprecated. Use `silent(false) instead.`_

Enables all output (default)
