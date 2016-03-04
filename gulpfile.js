/* Copyright 2016 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* jshint node:true */
/* globals target */

'use strict';

var gulp = require('gulp');
var gutil = require('gulp-util');
var stream = require('stream');

require('./make.js');

function createStringSource(filename, content) {
  var source = stream.Readable({ objectMode: true });
  source._read = function () {
    this.push(new gutil.File({
      cwd: '',
      base: '',
      path: filename,
      contents: new Buffer(content)
    }));
    this.push(null);
  };
  return source;
}

gulp.task('default', function() {
  console.log('Available tasks:');
  var tasks = Object.keys(gulp.tasks);
  tasks.sort();
  tasks.forEach(function (taskName) {
    console.log('  ' + taskName);
  });
});

gulp.task('server', function () {
  console.log();
  console.log('### Starting local server');

  var WebServer = require('./test/webserver.js').WebServer;
  var server = new WebServer();
  server.port = 8888;
  server.start();
});

gulp.task('makefile', function () {
  var makefileContent = 'help:\n\tgulp\n\n';
  var targetsNames = [];
  for (var i in target) {
    makefileContent += i + ':\n\tgulp ' + i + '\n\n';
    targetsNames.push(i);
  }
  makefileContent += '.PHONY: ' + targetsNames.join(' ') + '\n';
  return createStringSource('Makefile', makefileContent)
    .pipe(gulp.dest('.'));
});

// Getting all shelljs registered tasks and register them with gulp
var gulpContext = false;
for (var taskName in global.target) {
  if (taskName in gulp.tasks) {
    continue;
  }

  var task = (function (shellJsTask) {
    return function () {
      gulpContext = true;
      try {
        shellJsTask.call(global.target);
      } finally {
        gulpContext = false;
      }
    };
  })(global.target[taskName]);
  gulp.task(taskName, task);
}

Object.keys(gulp.tasks).forEach(function (taskName) {
  var oldTask = global.target[taskName] || function () {
    gulp.run(taskName);
  };

  global.target[taskName] = function () {
    // The require('shelljs/make') import in make.js will try to execute tasks
    // listed in arguments, guarding with gulpContext
    if (gulpContext) {
      oldTask.call(global.target);
    }
  };
});
