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
  activateBrowser,
  getScreenReader,
  trackScreenReader,
  untrackScreenReader,
} from "./test_utils.mjs";
import {
  closePages,
  getThumbnailSelector,
  loadAndWait,
  showViewsManager,
} from "../integration/test_utils.mjs";

const { driver: screenReader, name: screenReaderName } = getScreenReader();

const SCREEN_READER_START_TIMEOUT_MS = 120_000;
const SCREEN_READER_STOP_TIMEOUT_MS = 60_000;
const SPEC_TIMEOUT_MS = 120_000;

// The harness invokes this per browser. Specs are registered inside a
// function rather than at module top level so the cached module can be
// re-imported each call without needing an ESM cache bust: `describe`,
// `it`, etc. are resolved off `globalThis` at call time, against whatever
// Jasmine instance is currently installed.
//
// The spec is single-browser by design — `global.integrationSessions` is
// pointed at just one browser before each call.
function register() {
  // On Linux, and on hosts where the screen reader is not installed/
  // detected, the suite is skipped rather than failed.
  const describeIfScreenReader = screenReader ? describe : xdescribe;

  describeIfScreenReader(`Screen reader: ${screenReaderName}`, () => {
    describe("Thumbnail navigation", () => {
      let pages;
      let screenReaderStarted = false;

      beforeAll(async () => {
        // `capture: false` skips guidepup's post-action polling of the
        // screen reader for `itemText`/`lastSpokenPhrase` after every API
        // call. The polling runs AppleScript against VoiceOver (or RPC
        // against NVDA) and can hang for the full spec timeout when the
        // screen reader is busy responding to a freshly-activated browser;
        // the test does not consume the log either way.
        await screenReader.start({ capture: false });
        screenReaderStarted = true;
        // Make sure the driver gets stopped if the process is interrupted
        // (Ctrl+C, kill, terminal hangup) before `afterAll` runs.
        trackScreenReader(screenReader);
      }, SCREEN_READER_START_TIMEOUT_MS);

      afterAll(async () => {
        // Only stop if start succeeded (otherwise the driver throws
        // ERR_NVDA_NOT_RUNNING / equivalent) and swallow any stop failure
        // so a misbehaving driver does not mask the actual test results.
        if (!screenReaderStarted) {
          return;
        }
        untrackScreenReader(screenReader);
        try {
          await screenReader.stop();
        } catch {}
      }, SCREEN_READER_STOP_TIMEOUT_MS);

      beforeEach(async () => {
        pages = await loadAndWait(
          "tracemonkey.pdf",
          "#viewsManagerToggleButton"
        );
      });

      afterEach(async () => {
        await closePages(pages);
      });

      it(
        "must navigate to the correct page when the screen reader activates a thumbnail (bug 2034568)",
        async () => {
          const [browserName, page] = pages[0];
          await activateBrowser(browserName);
          await page.bringToFront();
          await showViewsManager(page);

          const thumbnail3 = getThumbnailSelector(3);
          await page.waitForSelector(thumbnail3, { visible: true });
          await page.waitForSelector(`${thumbnail3} > img[src^="blob:"]`, {
            visible: true,
          });

          // The screen reader is running and attached, but the activation
          // is driven via puppeteer's `Enter` keystroke on the focused
          // button rather than the screen-reader's own VO+Space / NVDA
          // RPC: those are racy with cursor positioning and OS foreground,
          // while the bug-fixed code path (synthetic click from a focused
          // button) is the same either way.
          await page.focus(thumbnail3);
          await page.waitForSelector(`${thumbnail3}:focus`, { visible: true });
          await page.keyboard.press("Enter");

          await page.waitForFunction(
            () => document.getElementById("pageNumber").valueAsNumber === 3
          );
        },
        SPEC_TIMEOUT_MS
      );
    });
  });
}

export { register };
