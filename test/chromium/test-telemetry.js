#!/usr/bin/env node
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
/* eslint-disable object-shorthand */

'use strict';

var assert = require('assert');
var fs = require('fs');
var vm = require('vm');

var SRC_DIR = __dirname + '/../../';
var telemetryJsPath = 'extensions/chromium/telemetry.js';
var telemetryJsSource = fs.readFileSync(SRC_DIR + telemetryJsPath);
var telemetryScript = new vm.Script(telemetryJsSource, {
  filename: telemetryJsPath,
  displayErrors: true,
});
var LOG_URL = /LOG_URL = '([^']+)'/.exec(telemetryJsSource)[1];

// Create a minimal extension global that mocks the extension environment that
// is used by telemetry.js
function createExtensionGlobal() {
  var window = {};

  // Whenever a "request" was made, the extra headers are appended to this list.
  var test_requests = window.test_requests = [];

  // Extension API mocks.
  window.window = window;
  window.chrome = {};
  window.chrome.extension = {};
  window.chrome.extension.inIncognitoContext = false;
  window.chrome.runtime = {};
  window.chrome.runtime.id = 'oemmndcbldboiebfnladdacbdfmadadm';
  window.chrome.runtime.getManifest = function() {
    return { version: '1.0.0', };
  };

  function createStorageAPI() {
    var storageArea = {};
    storageArea.get = function(key, callback) {
      assert.equal(key, 'disableTelemetry');
      // chrome.storage.*. is async, but we make it synchronous to ease testing.
      callback(storageArea.mock_data);
    };
    return storageArea;
  }
  window.chrome.storage = {};
  window.chrome.storage.managed = createStorageAPI();
  window.chrome.storage.local = createStorageAPI();
  window.chrome.storage.sync = createStorageAPI();

  // Other DOM.
  window.navigator = {};
  window.navigator.onLine = true;
  window.navigator.userAgent =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/50.0.2661.94 Safari/537.36';
  window.localStorage = {};

  var getRandomValues_state = 0;
  window.crypto = {};
  window.crypto.getRandomValues = function(buf) {
    var state = getRandomValues_state++;
    for (var i = 0; i < buf.length; ++i) {
      // Totally random byte ;)
      buf[i] = 0x42 + state;
    }
    return buf;
  };

  // Network-related mocks.
  window.Request = {};
  window.Request.prototype = {
    get mode() {
      throw new TypeError('Illegal invocation');
    },
  };
  window.fetch = function(url, options) {
    assert.equal(url, LOG_URL);
    assert.equal(options.method, 'POST');
    assert.equal(options.mode, 'cors');
    assert.ok(!options.body);
    test_requests.push(options.headers);
  };
  window.Headers = function(headers) {
    headers = JSON.parse(JSON.stringify(headers)); // Clone.
    Object.keys(headers).forEach(function(k) {
      headers[k] = String(headers[k]);
    });
    return headers;
  };
  window.XMLHttpRequest = function() {
    var invoked = {
      open: false,
      send: false,
    };
    var headers = {};
    return {
      open: function(method, url) {
        assert.equal(invoked.open, false);
        invoked.open = true;
        assert.equal(method, 'POST');
        assert.equal(url, LOG_URL);
      },
      setRequestHeader: function(k, v) {
        assert.equal(invoked.open, true);
        headers[k] = String(v);
      },
      send: function(body) {
        assert.equal(invoked.open, true);
        assert.equal(invoked.send, false);
        invoked.send = true;
        assert.ok(!body);
        test_requests.push(headers);
      },
    };
  };

  // Time-related logic.
  var timers = [];
  window.setInterval = function(callback, ms) {
    assert.equal(typeof callback, 'function');
    timers.push(callback);
  };
  window.Date = {
    test_now_value: Date.now(),
    now: function() {
      return window.Date.test_now_value;
    },
  };
  window.test_fireTimers = function() {
    assert.ok(timers.length);
    timers.forEach(function(timer) {
      timer();
    });
  };

  return window;
}

// Simulate an update of the browser.
function updateBrowser(window) {
  window.navigator.userAgent =
    window.navigator.userAgent.replace(/Chrome\/(\d+)/, function(_, v) {
      return 'Chrome/' + (parseInt(v) + 1);
    });
}

var tests = [
  function test_first_run() {
    // Default settings, run extension for the first time.
    var window = createExtensionGlobal();
    telemetryScript.runInNewContext(window);
    assert.deepEqual(window.test_requests, [{
      'Deduplication-Id': '4242424242',
      'Extension-Version': '1.0.0',
    }]);
  },

  function test_first_run_incognito() {
    // The extension should not send any requests when in incognito mode.
    var window = createExtensionGlobal();
    window.chrome.extension.inIncognitoContext = true;
    telemetryScript.runInNewContext(window);
    assert.deepEqual(window.test_requests, []);
  },

  function test_storage_managed_unavailable() {
    var window = createExtensionGlobal();
    delete window.chrome.storage.managed;
    telemetryScript.runInNewContext(window);
    assert.deepEqual(window.test_requests, [{
      'Deduplication-Id': '4242424242',
      'Extension-Version': '1.0.0',
    }]);
  },

  function test_managed_pref() {
    var window = createExtensionGlobal();
    window.chrome.storage.managed.mock_data = {
      disableTelemetry: true,
    };
    telemetryScript.runInNewContext(window);
    assert.deepEqual(window.test_requests, []);
  },

  function test_local_pref() {
    var window = createExtensionGlobal();
    window.chrome.storage.local.mock_data = {
      disableTelemetry: true,
    };
    telemetryScript.runInNewContext(window);
    assert.deepEqual(window.test_requests, []);
  },

  function test_managed_pref_is_overridden() {
    var window = createExtensionGlobal();
    window.chrome.storage.managed.mock_data = {
      disableTelemetry: true,
    };
    window.chrome.storage.sync.mock_data = {
      disableTelemetry: false,
    };
    telemetryScript.runInNewContext(window);
    assert.deepEqual(window.test_requests, [{
      'Deduplication-Id': '4242424242',
      'Extension-Version': '1.0.0',
    }]);
  },

  function test_run_extension_again() {
    var window = createExtensionGlobal();
    telemetryScript.runInNewContext(window);
    telemetryScript.runInNewContext(window);
    // Only one request should be sent because of rate-limiting.
    assert.deepEqual(window.test_requests, [{
      'Deduplication-Id': '4242424242',
      'Extension-Version': '1.0.0',
    }]);

    // Simulate that quite some hours passed, but it's still rate-limited.
    window.Date.test_now_value += 11 * 36E5;
    telemetryScript.runInNewContext(window);
    // Only one request should be sent because of rate-limiting.
    assert.deepEqual(window.test_requests, [{
      'Deduplication-Id': '4242424242',
      'Extension-Version': '1.0.0',
    }]);

    // Another hour passes and the request should not be rate-limited any more.
    window.Date.test_now_value += 1 * 36E5;
    telemetryScript.runInNewContext(window);
    assert.deepEqual(window.test_requests, [{
      'Deduplication-Id': '4242424242',
      'Extension-Version': '1.0.0',
    }, {
      'Deduplication-Id': '4242424242',
      'Extension-Version': '1.0.0',
    }]);
  },

  function test_running_for_a_while() {
    var window = createExtensionGlobal();
    telemetryScript.runInNewContext(window);
    assert.deepEqual(window.test_requests, [{
      'Deduplication-Id': '4242424242',
      'Extension-Version': '1.0.0',
    }]);

    // Simulate that the timer fired 11 hours since the last ping. The request
    // should still be rate-limited.
    window.Date.test_now_value += 11 * 36E5;
    window.test_fireTimers();
    assert.deepEqual(window.test_requests, [{
      'Deduplication-Id': '4242424242',
      'Extension-Version': '1.0.0',
    }]);

    // Another hour passes and the request should not be rate-limited any more.
    window.Date.test_now_value += 1 * 36E5;
    window.test_fireTimers();
    assert.deepEqual(window.test_requests, [{
      'Deduplication-Id': '4242424242',
      'Extension-Version': '1.0.0',
    }, {
      'Deduplication-Id': '4242424242',
      'Extension-Version': '1.0.0',
    }]);
  },

  function test_browser_update() {
    var window = createExtensionGlobal();
    telemetryScript.runInNewContext(window);
    updateBrowser(window);
    telemetryScript.runInNewContext(window);
    assert.deepEqual(window.test_requests, [{
      'Deduplication-Id': '4242424242',
      'Extension-Version': '1.0.0',
    }, {
      // Generate a new ID for better privacy.
      'Deduplication-Id': '4343434343',
      'Extension-Version': '1.0.0',
    }]);
  },

  function test_browser_update_between_pref_toggle() {
    var window = createExtensionGlobal();
    telemetryScript.runInNewContext(window);
    window.chrome.storage.local.mock_data = {
      disableTelemetry: true,
    };
    updateBrowser(window);
    telemetryScript.runInNewContext(window);
    window.chrome.storage.local.mock_data = {
      disableTelemetry: false,
    };
    telemetryScript.runInNewContext(window);
    assert.deepEqual(window.test_requests, [{
      'Deduplication-Id': '4242424242',
      'Extension-Version': '1.0.0',
    }, {
      // Generate a new ID for better privacy, even if the update happened
      // while telemetry was disabled.
      'Deduplication-Id': '4343434343',
      'Extension-Version': '1.0.0',
    }]);
  },

  function test_extension_update() {
    var window = createExtensionGlobal();
    telemetryScript.runInNewContext(window);
    window.chrome.runtime.getManifest = function() {
      return { version: '1.0.1', };
    };
    window.Date.test_now_value += 12 * 36E5;
    telemetryScript.runInNewContext(window);
    assert.deepEqual(window.test_requests, [{
      'Deduplication-Id': '4242424242',
      'Extension-Version': '1.0.0',
    }, {
      // The ID did not change because the browser version did not change.
      'Deduplication-Id': '4242424242',
      'Extension-Version': '1.0.1',
    }]);
  },

  function test_unofficial_build() {
    var window = createExtensionGlobal();
    var didWarn = false;
    window.console = {};
    window.console.warn = function() {
      didWarn = true;
    };
    window.chrome.runtime.id = 'abcdefghijklmnopabcdefghijklmnop';
    telemetryScript.runInNewContext(window);
    assert.deepEqual(window.test_requests, []);
    assert.ok(didWarn);
  },

  function test_fetch_is_supported() {
    var window = createExtensionGlobal();
    // XMLHttpRequest should not be called when fetch is available. So removing
    // the XMLHttpRequest API should not change behavior.
    delete window.XMLHttpRequest;
    telemetryScript.runInNewContext(window);
    assert.deepEqual(window.test_requests, [{
      'Deduplication-Id': '4242424242',
      'Extension-Version': '1.0.0',
    }]);
  },

  function test_fetch_not_supported() {
    var window = createExtensionGlobal();
    delete window.fetch;
    delete window.Request;
    delete window.Headers;
    telemetryScript.runInNewContext(window);
    assert.deepEqual(window.test_requests, [{
      'Deduplication-Id': '4242424242',
      'Extension-Version': '1.0.0',
    }]);
  },

  function test_fetch_mode_not_supported() {
    var window = createExtensionGlobal();
    delete window.Request.prototype.mode;
    window.fetch = function() {
      throw new Error('Unexpected call to fetch!');
    };
    telemetryScript.runInNewContext(window);
    assert.deepEqual(window.test_requests, [{
      'Deduplication-Id': '4242424242',
      'Extension-Version': '1.0.0',
    }]);
  },

  function test_network_offline() {
    var window = createExtensionGlobal();
    // Simulate that the network is down for sure.
    window.navigator.onLine = false;
    telemetryScript.runInNewContext(window);
    assert.deepEqual(window.test_requests, []);

    // Simulate that the network might be up.
    window.navigator.onLine = true;
    telemetryScript.runInNewContext(window);
    assert.deepEqual(window.test_requests, [{
      'Deduplication-Id': '4242424242',
      'Extension-Version': '1.0.0',
    }]);
  },
];
var test_i = 0;

(function next() {
  var test = tests[test_i++];
  if (!test) {
    console.log('All tests completed.');
    return;
  }
  console.log('Running test ' + test_i + '/' + tests.length + ': ' + test.name);
  test();
  process.nextTick(next);
})();
