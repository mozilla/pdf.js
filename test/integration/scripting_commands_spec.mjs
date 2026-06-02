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
  closePages,
  getSelector,
  loadAndWait,
  waitForSandboxTrip,
} from "./test_utils.mjs";

async function waitForScripting(page) {
  await page.waitForFunction(
    "window.PDFViewerApplication.scriptingReady === true"
  );
}

describe("Scripting commands", () => {
  describe("in doc_actions.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("doc_actions.pdf", getSelector("47R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("coalesces repeated SaveAs requests into a single download", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);
          await waitForSandboxTrip(page);

          const result = await page.evaluate(async () => {
            const app = window.PDFViewerApplication;
            const original = app._downloadOrSave;
            let underlying = 0;
            let resolveDownload;
            app._downloadOrSave = function () {
              underlying++;
              return new Promise(resolve => {
                resolveDownload = resolve;
              });
            };
            try {
              const promises = [];
              for (let i = 0; i < 50; i++) {
                promises.push(app.downloadOrSave());
              }
              const sharedPromise = promises.every(p => p === promises[0]);
              const pending = app._downloadOrSavePromise !== null;
              resolveDownload();
              await Promise.all(promises);
              const cleared = app._downloadOrSavePromise === null;
              return { underlying, sharedPromise, pending, cleared };
            } finally {
              app._downloadOrSave = original;
            }
          });

          expect(result.underlying).withContext(`In ${browserName}`).toEqual(1);
          expect(result.sharedPromise)
            .withContext(`In ${browserName}`)
            .toBeTrue();
          expect(result.pending).withContext(`In ${browserName}`).toBeTrue();
          expect(result.cleared).withContext(`In ${browserName}`).toBeTrue();
        })
      );
    });

    it("does not run SaveAs without user activation", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          const result = await page.evaluate(async () => {
            const app = window.PDFViewerApplication;
            const { eventBus, downloadManager } = app;
            const originalUserActivationDescriptor =
              Object.getOwnPropertyDescriptor(navigator, "userActivation");
            Object.defineProperty(navigator, "userActivation", {
              configurable: true,
              get: () => ({ isActive: false, hasBeenActive: true }),
            });
            const originalDownload = downloadManager.download;
            downloadManager.download = () => {};
            let downloads = 0;
            const countDownload = () => {
              downloads++;
            };
            eventBus.on("download", countDownload);
            const dispatchSaveAs = () => {
              eventBus.dispatch("updatefromsandbox", {
                source: window,
                detail: { command: "SaveAs" },
              });
            };
            try {
              const inactive = navigator.userActivation.isActive === false;
              for (let i = 0; i < 20; i++) {
                dispatchSaveAs();
              }
              const inactiveDownloads = downloads;

              Object.defineProperty(navigator, "userActivation", {
                configurable: true,
                get: () => undefined,
              });
              const unavailable = navigator.userActivation === undefined;
              dispatchSaveAs();
              const unavailableDownloads = downloads - inactiveDownloads;

              return {
                inactive,
                inactiveDownloads,
                unavailable,
                unavailableDownloads,
              };
            } finally {
              eventBus.off("download", countDownload);
              downloadManager.download = originalDownload;
              if (originalUserActivationDescriptor) {
                Object.defineProperty(
                  navigator,
                  "userActivation",
                  originalUserActivationDescriptor
                );
              } else {
                delete navigator.userActivation;
              }
            }
          });

          expect(result.inactive).withContext(`In ${browserName}`).toBeTrue();
          expect(result.inactiveDownloads)
            .withContext(`In ${browserName}`)
            .toEqual(0);
          expect(result.unavailable)
            .withContext(`In ${browserName}`)
            .toBeTrue();
          expect(result.unavailableDownloads)
            .withContext(`In ${browserName}`)
            .toEqual(0);
        })
      );
    });

    it("starts a single print for each batch of repeated print requests", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);
          await waitForSandboxTrip(page);

          const result = await page.evaluate(async () => {
            const app = window.PDFViewerApplication;
            const { eventBus } = app;
            const originalUserActivationDescriptor =
              Object.getOwnPropertyDescriptor(navigator, "userActivation");
            Object.defineProperty(navigator, "userActivation", {
              configurable: true,
              get: () => ({ isActive: true, hasBeenActive: true }),
            });
            const realPrint = window.print;
            let count = 0;
            window.print = () => {};
            const waiters = new Set();
            const resolveWaiters = () => {
              for (const waiter of waiters) {
                if (count >= waiter.target) {
                  waiters.delete(waiter);
                  waiter.resolve();
                }
              }
            };
            const waitForPrintCount = target => {
              if (count >= target) {
                return Promise.resolve();
              }
              return new Promise(resolve => {
                waiters.add({ target, resolve });
              });
            };
            const countPrint = () => {
              count++;
              resolveWaiters();
            };
            eventBus.on("print", countPrint);
            const dispatchPrint = () => {
              eventBus.dispatch("updatefromsandbox", {
                source: window,
                detail: { command: "print" },
              });
            };
            try {
              await app.pdfViewer.pagesPromise;
              eventBus.dispatch("afterprint", { source: window });
              for (let i = 0; i < 20; i++) {
                dispatchPrint();
              }
              await waitForPrintCount(1);
              const firstBatch = count;
              eventBus.dispatch("afterprint", { source: window });
              for (let i = 0; i < 20; i++) {
                dispatchPrint();
              }
              await waitForPrintCount(2);
              return { count, firstBatch };
            } finally {
              eventBus.off("print", countPrint);
              window.print = realPrint;
              if (originalUserActivationDescriptor) {
                Object.defineProperty(
                  navigator,
                  "userActivation",
                  originalUserActivationDescriptor
                );
              } else {
                delete navigator.userActivation;
              }
            }
          });

          expect(result.firstBatch).withContext(`In ${browserName}`).toEqual(1);
          expect(result.count).withContext(`In ${browserName}`).toEqual(2);
        })
      );
    });

    it("does not run print without user activation", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);
          await waitForSandboxTrip(page);

          const result = await page.evaluate(async () => {
            const app = window.PDFViewerApplication;
            const { eventBus } = app;
            const originalUserActivationDescriptor =
              Object.getOwnPropertyDescriptor(navigator, "userActivation");
            Object.defineProperty(navigator, "userActivation", {
              configurable: true,
              get: () => ({ isActive: false, hasBeenActive: true }),
            });
            const realPrint = window.print;
            window.print = () => {};
            let prints = 0;
            const countPrint = () => {
              prints++;
            };
            eventBus.on("print", countPrint);
            const dispatchPrint = () => {
              eventBus.dispatch("updatefromsandbox", {
                source: window,
                detail: { command: "print" },
              });
            };
            try {
              await app.pdfViewer.pagesPromise;
              const inactive = navigator.userActivation.isActive === false;
              for (let i = 0; i < 20; i++) {
                dispatchPrint();
              }
              const inactivePrints = prints;

              Object.defineProperty(navigator, "userActivation", {
                configurable: true,
                get: () => undefined,
              });
              const unavailable = navigator.userActivation === undefined;
              dispatchPrint();
              const unavailablePrints = prints - inactivePrints;

              return {
                inactive,
                inactivePrints,
                unavailable,
                unavailablePrints,
              };
            } finally {
              eventBus.off("print", countPrint);
              window.print = realPrint;
              if (originalUserActivationDescriptor) {
                Object.defineProperty(
                  navigator,
                  "userActivation",
                  originalUserActivationDescriptor
                );
              } else {
                delete navigator.userActivation;
              }
            }
          });

          expect(result.inactive).withContext(`In ${browserName}`).toBeTrue();
          expect(result.inactivePrints)
            .withContext(`In ${browserName}`)
            .toEqual(0);
          expect(result.unavailable)
            .withContext(`In ${browserName}`)
            .toBeTrue();
          expect(result.unavailablePrints)
            .withContext(`In ${browserName}`)
            .toEqual(0);
        })
      );
    });

    it("only applies field updates for known form fields", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForScripting(page);

          const result = await page.evaluate(async () => {
            const app = window.PDFViewerApplication;
            const { eventBus } = app;
            const knownId = document
              .querySelector("[data-element-id]")
              ?.getAttribute("data-element-id");
            let delivered = 0;
            const handler = () => {
              delivered++;
            };
            document.addEventListener("updatefromsandbox", handler, true);
            try {
              const before = delivered;
              if (knownId) {
                eventBus.dispatch("updatefromsandbox", {
                  source: window,
                  detail: { id: knownId, value: "TEST123" },
                });
              }
              const knownDelivered = delivered - before;
              eventBus.dispatch("updatefromsandbox", {
                source: window,
                detail: { id: "unknown-field-id", value: "ignored" },
              });
              const unknownDelivered = delivered - before - knownDelivered;
              return { knownId, knownDelivered, unknownDelivered };
            } finally {
              document.removeEventListener("updatefromsandbox", handler, true);
            }
          });

          expect(result.knownId).withContext(`In ${browserName}`).toBeTruthy();
          expect(result.knownDelivered)
            .withContext(`In ${browserName}`)
            .toBeGreaterThanOrEqual(1);
          expect(result.unknownDelivered)
            .withContext(`In ${browserName}`)
            .toEqual(0);
        })
      );
    });
  });
});
