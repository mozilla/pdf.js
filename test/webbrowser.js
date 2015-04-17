/* -*- Mode: js; js-indent-level: 2; indent-tabs-mode: nil; tab-width: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/*
 * Copyright 2014 Mozilla Foundation
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
/*jslint node: true */

'use strict';

var os = require('os');
var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;
var testUtils = require('./testutils.js');

var tempDirPrefix = 'pdfjs_';

function WebBrowser(name, path) {
  this.name = name;
  this.path = path;
  this.tmpDir = null;
  this.profileDir = null;
  this.process = null;
  this.finished = false;
  this.callback = null;
}
WebBrowser.prototype = {
  start: function (url) {
    this.tmpDir = path.join(os.tmpdir(), tempDirPrefix + this.name);
    if (!fs.existsSync(this.tmpDir)) {
      fs.mkdirSync(this.tmpDir);
    }
    this.process = this.startProcess(url);
  },
  getProfileDir: function () {
    if (!this.profileDir) {
      var profileDir = path.join(this.tmpDir, 'profile');
      if (fs.existsSync(profileDir)) {
        testUtils.removeDirSync(profileDir);
      }
      fs.mkdirSync(profileDir);
      this.profileDir = profileDir;
      this.setupProfileDir(profileDir);
    }
    return this.profileDir;
  },
  buildArguments: function (url) {
    return [url];
  },
  setupProfileDir: function (dir) {
  },
  startProcess: function (url) {
    var args = this.buildArguments(url);
    var proc = spawn(this.path, args);
    proc.on('exit', function (code) {
      this.finished = true;
      this.cleanup(this.callback && this.callback.bind(null, code));
    }.bind(this));
    return proc;
  },
  cleanup: function (callback) {
    try {
      testUtils.removeDirSync(this.tmpDir);
      this.process = null;
      if (callback) {
        callback();
      }
    } catch (e) {
      console.error('Unable to cleanup after the process: ' + e);
      try {
        if (this.process) {
          this.process.kill('SIGKILL');
        }
      } catch (e) {}
    }
  },
  stop: function (callback) {
    if (this.finished) {
      if (callback) {
        callback();
      }
    } else {
      this.callback = callback;
    }

    if (this.process) {
      this.process.kill('SIGTERM');
    }
  }
};

var firefoxResourceDir = path.join(__dirname, 'resources', 'firefox');

function FirefoxBrowser(name, path) {
  if (os.platform() === 'darwin') {
    var m = /([^.\/]+)\.app(\/?)$/.exec(path);
    if (m) {
      path += (m[2] ? '' : '/') + 'Contents/MacOS/firefox';
    }
  }
  WebBrowser.call(this, name, path);
}
FirefoxBrowser.prototype = Object.create(WebBrowser.prototype);
FirefoxBrowser.prototype.buildArguments = function (url) {
  var profileDir = this.getProfileDir();
  var args = [];
  if (os.platform() === 'darwin') {
    args.push('-foreground');
  }
  args.push('-no-remote', '-profile', profileDir, url);
  return args;
};
FirefoxBrowser.prototype.setupProfileDir = function (dir) {
  testUtils.copySubtreeSync(firefoxResourceDir, dir);
};

function ChromiumBrowser(name, path) {
  if (os.platform() === 'darwin') {
    var m = /([^.\/]+)\.app(\/?)$/.exec(path);
    if (m) {
      path += (m[2] ? '' : '/') + 'Contents/MacOS/' + m[1];
      console.log(path);
    }
  }
  WebBrowser.call(this, name, path);
}
ChromiumBrowser.prototype = Object.create(WebBrowser.prototype);
ChromiumBrowser.prototype.buildArguments = function (url) {
  var profileDir = this.getProfileDir();
  return ['--user-data-dir=' + profileDir,
    '--no-first-run', '--disable-sync', url];
};

WebBrowser.create = function (desc) {
  var name = desc.name;

  // Throws an exception if the path doesn't exist.
  fs.statSync(desc.path);

  if (/firefox/i.test(name)) {
    return new FirefoxBrowser(desc.name, desc.path);
  }
  if (/(chrome|chromium|opera)/i.test(name)) {
    return new ChromiumBrowser(desc.name, desc.path);
  }
  return new WebBrowser(desc.name, desc.path);
};


exports.WebBrowser = WebBrowser;