/* Copyright 2026 Mozilla Foundation
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

import {
  macOSActivate,
  nvda,
  voiceOver,
  windowsActivate,
} from "@guidepup/guidepup";
import os from "os";

/**
 * Resolve the guidepup screen-reader driver for the current platform.
 *
 * Real screen-reader automation only works on Windows (NVDA) and macOS
 * (VoiceOver). On any other platform `driver` is `null`, and callers should
 * skip their suite (typically via `xdescribe`) rather than fail.
 *
 * @returns {{ driver: object|null, name: string }}
 */
function getScreenReader() {
  switch (os.platform()) {
    case "win32":
      return { driver: nvda, name: "NVDA" };
    case "darwin":
      return { driver: voiceOver, name: "VoiceOver" };
    default:
      return { driver: null, name: "(unsupported)" };
  }
}

// POSIX exit codes for the signals we trap. Used as the explicit `exit()`
// status after we've stopped the screen reader, so the parent (gulp/CI) sees
// the same code it would have if Node's default signal handler had run.
const SIGNAL_EXIT_CODES = {
  SIGINT: 130,
  SIGTERM: 143,
  SIGHUP: 129,
};

const trackedDrivers = new Set();
let signalHandlersInstalled = false;

function installSignalHandlersOnce() {
  if (signalHandlersInstalled) {
    return;
  }
  signalHandlersInstalled = true;

  const stopAll = async () => {
    for (const driver of trackedDrivers) {
      try {
        await driver.stop();
      } catch {
        // Swallow: the driver may already be in a partial-shutdown state.
      }
    }
    trackedDrivers.clear();
  };

  // `process.once` so that a second Ctrl+C falls through to Node's default
  // handler (instant kill) — handy if the screen-reader stop hangs.
  for (const signal of Object.keys(SIGNAL_EXIT_CODES)) {
    process.once(signal, () => {
      stopAll().finally(() => process.exit(SIGNAL_EXIT_CODES[signal]));
    });
  }
}

/**
 * Track a started screen-reader driver so it gets stopped if the process is
 * interrupted (Ctrl+C, kill, terminal hangup) before the regular `afterAll`
 * teardown runs. Call after a successful `driver.start()`.
 */
function trackScreenReader(driver) {
  installSignalHandlersOnce();
  trackedDrivers.add(driver);
}

/**
 * Stop tracking a driver. Call from the regular `afterAll` teardown so the
 * signal handlers don't double-stop an already-stopped driver if a signal
 * arrives between `afterAll` and process exit.
 */
function untrackScreenReader(driver) {
  trackedDrivers.delete(driver);
}

// Identifiers for the puppeteer-managed browsers used to bring the right
// app to the OS foreground so the screen reader attaches to it. macOS uses
// a bundle name (AppleScript `tell application "X" to activate`); Windows
// uses an executable name plus a regex matched against the window title
// (VBS `AppActivate` + `SetForegroundWindow`).
const APP_IDS = {
  firefox: {
    darwin: "Firefox Nightly",
    win32: { exe: "firefox.exe", title: "Firefox Nightly" },
  },
  chrome: {
    darwin: "Google Chrome for Testing",
    win32: { exe: "chrome.exe", title: "Google Chrome for Testing" },
  },
};

/**
 * Bring the puppeteer-managed browser window to the OS foreground. On
 * macOS via AppleScript, on Windows via VBS+PowerShell. No-op elsewhere.
 * Required so the screen reader (which follows the OS-frontmost app) is
 * actually attached to the browser when the test interacts with it.
 */
async function activateBrowser(browserName) {
  const appId = APP_IDS[browserName];
  if (process.platform === "darwin") {
    await macOSActivate(appId.darwin);
  } else if (process.platform === "win32") {
    await windowsActivate(appId.win32.exe, appId.win32.title);
  }
}

export {
  activateBrowser,
  getScreenReader,
  trackScreenReader,
  untrackScreenReader,
};
