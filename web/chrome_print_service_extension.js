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

'use strict';
/* globals chrome */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-web/chrome_print_service_extension', ['exports',
      'pdfjs-web/pdf_print_service'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./pdf_print_service.js'));
  } else {
    factory((root.pdfjsWebChromePrintServiceExtension = {}),
      root.pdfjsWebPDFPrintService);
  }
}(this, function (exports, pdfPrintService) {
  var PDFPrintService = pdfPrintService.PDFPrintService;

  // Print requests from out-of-process frames are ignored due to a bug in
  // Chrome (https://crbug.com/650952), so we need to detect it and use a
  // work-around.
  function isOutOfProcessFrame() {
    // We are in a frame, embedded from another origin, and a privileged
    // extension API is available. So we have detected that this is an
    // out-of-process frame.
    return top !== window && location.ancestorOrigins[0] !== location.origin &&
      chrome.tabs;
  }

  /**
   * Printing from out-of-process frames is broken (https://crbug.com/650952),
   * so the function |forwardPrintResults| creates a child frame in the main
   * process, renders pages and starts a print request.
   *
   * Sounds simple, but to avoid information leakage it is actually not that
   * simple. The flow and algorithm is explained here (see Alternatives for
   * considered alternatives).
   *
   * Definitions:
   * - CS = trusted content script, hosted in untrusted page.
   * - X = trusted OOP extension frame who wants to print data in F.
   * - F = injected frame, recipient of sensitive information.
   *
   * This function does the following:
   * 1. X: Create nonces, to be used as follows:
   *       - nonceNoDupe   - X -> public -> CS
   *       - nonceForAuthX - CS -> private -> X
   *       - nonceForAuthC - CS -> private -> F (pre-shared with CS)
   *       - nonceForAuthF - F -> private -> X (pre-shared with CS)
   *       - nonceToAbort  - * -> public -> CS
   *
   *       'private' means that the channel is guaranteed to be private.
   *       'public' means that anyone can read the message.
   *
   *       Messages to CS are always public.
   *       Messages from X cannot be spoofed (check event.origin).
   *       Messages to X cannot be intercepted (use postMessage with origin).
   *       Messages to F can be intercepted if F was navigated
   *         (so we use pre-shared nonces for authentication).
   *
   *       The intermediate goal is to have a secure channel between X and F.
   *
   * 2. X: Run content script (including these nonces) in main frame.
   *       (this is safe, content scripts are isolated from the web page).
   * 3. X: Use top.postMessage to send [nonceNoDupe] to CS.
   * 4. CS: Receive message, proceed iff nonceNoDupe' == nonceNoDupe and
   *        event.origin === extension origin.
   *        NOTE: nonceNoDupe is used to link X's DOMWindow to CS.
   * 5. CS: Create data:-URL containing the printing logic.
   *        This includes nonceForAuthC, nonceForAuthF and nonceToAbort.
   * 6. CS: Create iframe and navigate to the above data:-URL.
   *        NOTE: Navigation happens via assignment to contentWindow.location
   *        to make sure that the sensitive data:-URL does not leak.
   *        NOTE: data:-URLs have a unique origin in Chrome, so they cannot be
   *        scripted by the parent page (not even other extensions).
   * 7. CS: Create MessageChannel (port1, port2).
   * 8. CS: Use F.postMessage to send [nonceForAuthC, port1] to F.
   * 9. CS: Use X.postMessage to send [nonceForAuthX, port2] to X, WITH
   *          extension origin as origin target.
   *
   *       Steps 10+13 and step 11+12 run parallelly.
   *
   * 10.F: Receive message, proceed iff nonceForAuthC' == nonceForAuthC.
   * 11.F: Use port1.postMessage to send [nonceForAuthF] to X.
   *
   * ------------- Now F knows that port1 is from CS -------------------------
   *       Note: port1 was directly sent to an extension origin, so no further
   *       authentication is needed on port1.
   *
   * 12.X: Receive message, proceed iff nonceForAuthX' == nonceForAuthX and
   *       if message came from the top frame (CS).
   *
   * ------------- Now X knows that port2 is from CS -------------------------
   *
   * 13.X: Receive on port2, proceed iff nonceForAuthF' == nonceForAuthF
   *
   * ------------- Now X knows that port2 is entangled with F ----------------
   * ------------- We have a secure channel between X and F ------------------
   *
   * 14.X: Send print job including Blobs over the MessageChannel to F.
   * 15.F: Receive print job.
   * 16.F: Create the document referencing these blobs and start printing.
   *
   * At any point either X or the frame can send a message with nonceToAbort
   * to signal that the print request should be canceled.
   */

  /**
   * Alternatives
   *
   * The following alternatives have been considered and rejected:
   * - Any combination where the origin of the frame equals the main frame,
   *   because of information leakage.
   * - Creating blob:-URLs in the main frame, navigate frame to data: or blob:
   *   URL referencing the images at blob:. Does not work, cross-origin blob:
   *   URLs won't load.
   * - Serializing images as data:-URLs, create one giant data:-URL and
   *   navigate the document. Max a few dozen lines of code, but using lots of
   *   memory to hold the string.
   * - Open PDF in new tab, and print from there. Bad UX, no thanks.
   * - Navigate to my website, print from there. No, the extension should be
   *   self-contained. And if --site-per-process is enabled then the OOP
   *   printing problem is back.
   */

  // This is only for debugging. The function is also serialized and passed to
  // the content script (CS), which also passes it to frame F.
  function logStep(step, description) {
    console.info('Step ' + step + '. ' + description);
  }

  // This function is serialized and run in the main frame in step 2.
  function topContentScript(nonceNoDupe, nonceForAuthX, nonceForAuthC,
    nonceForAuthF, nonceToAbort) {
    var EXTENSION_ORIGIN = 'chrome-extension://' + chrome.runtime.id;

    var printFrame = null;

    window.addEventListener('message', onmessage, true);
    function onmessage(event) {
      if (event.origin === EXTENSION_ORIGIN && event.data === nonceNoDupe) {
        logStep(4, 'Receive message from X');
        nonceNoDupe = {};  // Mark the nonce as unusable.
        createMessageChannel(event.source);
      }

      // Anyone with knowledge of the nonce can abort the print task.
      if (event.data === nonceToAbort) {
        window.removeEventListener('message', onmessage, true);
        printFrame.remove();
        printFrame = null;
      }
    }

    function createMessageChannel(xDOMWindow) {
      new Promise(function (resolve, reject) {
        logStep(5, 'Create data:-URL with printing logic');
        var dataUrl = createFrameDataUrl();

        logStep(6, 'Insert frame F and navigate F to data URL');
        printFrame = createIframe();
        insertFrameInDocument(printFrame);

        printFrame.contentWindow.location = dataUrl;
        printFrame.onload = resolve;
        printFrame.onerror = reject;
      }).then(function () {
        logStep(7, 'Create MessageChannel');
        var mc = new MessageChannel();

        logStep(8, 'Send port to F, with nonce to authenticate sender (CS)');
        printFrame.contentWindow.postMessage(nonceForAuthC, '*', [mc.port1]);

        logStep(9, 'Send port to X');
        xDOMWindow.postMessage(nonceForAuthX, EXTENSION_ORIGIN, [mc.port2]);
      }).catch(function (e) {
        if (e instanceof Error) {
          console.error(e);
        }
        // Send another message to make sure that the port is closed.
        xDOMWindow.postMessage(nonceForAuthX, EXTENSION_ORIGIN);
        printFrame.remove();
      });
    }

    function createFrameDataUrl() {
      // The onmessage handler running in F.
      function onmessage(event) {
        if (event.source !== top || event.data !== nonceForAuthC) {
          return;
        }
        logStep(10, 'Proceed after ensuring that message came from CS');
        var port1 = event.ports[0];
        port1.onmessage = function (event) {
          logStep(15, 'Receive print job');
          this.close();

          var printJob = event.data;
          logStep(16, 'Create print document and start printing');
          processPrintJob(printJob).then(function () {
            top.postMessage(nonceToAbort, '*');
          });
        };

        logStep(11, 'Send nonce to X to authenticate F');
        port1.postMessage(nonceForAuthF);
      }

      var html = '<!DOCTYPE html>' +
        '<script>' +
        // Function declarations
        logStep + '\n' + processPrintJob + '\n' +
        // Variables
        'var nonceForAuthF=' + JSON.stringify(nonceForAuthF) + ';' +
        'var nonceForAuthC=' + JSON.stringify(nonceForAuthC) + ';' +
        'var nonceToAbort=' + JSON.stringify(nonceToAbort) + ';' +
        'window.onmessage=' + onmessage + ';' +
        '</script></body>';
      return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    }

    function createIframe() {
      var printFrame = document.createElement('iframe');
      printFrame.style.setProperty('position', 'fixed', 'important');
      printFrame.style.setProperty('left', '-99px', 'important');
      printFrame.style.setProperty('top', '-99px', 'important');
      printFrame.style.setProperty('width', '1px', 'important');
      printFrame.style.setProperty('height', '1px', 'important');
      printFrame.style.setProperty('border', '1px', 'important');
      return printFrame;
    }

    function insertFrameInDocument(printFrame) {
      var body = document.body;
      if (!body || body.tagName.toUpperCase() !== 'BODY') {
        // Someone thought that it'd be funny to remove the <body> element.
        // Or it is a <frameset> document.
        body = document.documentElement;
      }
      body.appendChild(printFrame);
    }
  }

  /**
   * Given a print job, replaces the current document with the given content
   * and prints when all (rasterized) pages are ready.
   *
   * @param {object} printJob - Describes the print task.
   * @param {string} printJob.styleSheetText - Stylesheet for document.
   * @param {Array<object>} printJob.pageItems - A list with objects with the
   *   following properties:
   *   - blob - The Blob with the rasterized image of the page.
   *   - height - The value for img.style.height
   *   - width - The value for img.style.width.
   * @return {Promise} Resolved when done (or failed).
   */
  function processPrintJob(printJob) {
    var style = document.createElement('style');
    style.textContent = printJob.styleSheetText;
    document.head.appendChild(style);

    document.body.dataset.pdfjsprinting = '';
    document.body.innerHTML = '<div id="printContainer"></div>';

    var printContainer = document.getElementById('printContainer');
    var imgPromises = printJob.pageItems.map(function (pageItem) {
      return new Promise(function (resolve, reject) {
        var img = document.createElement('img');
        img.style.height = pageItem.height;
        img.style.width = pageItem.width;
        img.onload = resolve;
        img.onerror = reject;
        // They will automatically be cleaned when the frame is removed.
        img.src = URL.createObjectURL(pageItem.blob);

        var wrapper = document.createElement('div');
        printContainer.appendChild(wrapper);
        wrapper.appendChild(img);
      });
    });
    return Promise.all(imgPromises).then(function () {
      return new Promise(function (resolve) {
        // Cannot print in a microtask, so use a timer.
        // https://github.com/mozilla/pdf.js/issues/7547.
        setTimeout(function () {
          window.print();
          setTimeout(resolve, 20);  // Tidy-up.
        });
      });
    }).catch(function (e) {
      if (e instanceof Error) {
        console.error(e);
      } else {
        console.error('PDF print job failed - failed to render a page');
      }
    });
  }

  function getNonce() {
    var buf = window.crypto.getRandomValues(new Uint8Array(32));
    return buf.map(String).join('');
  }

  /**
   * @param {PDFPrintService} printService - The current service at the
   *   time of starting the print job. This is used to check whether to exit
   *   the print process earlier if the print request is cancelled.
   * @param {object} printJob - parameter for |processPrintJob|.
   */
  function forwardPrintResults(printService, printJob) {
    // See the top of this module for an explanation of the steps.

    logStep(1, 'Generate nonces');
    var nonceNoDupe = getNonce();
    var nonceForAuthX = getNonce();
    var nonceForAuthC = getNonce();
    var nonceForAuthF = getNonce();
    var nonceToAbort = getNonce();

    return new Promise(function (resolve, reject) {
      chrome.tabs.getCurrent(resolve);
    }).then(function (currentTab) {
      return new Promise(function (resolve, reject) {
        printService.throwIfInactive();

        logStep(2, 'Run content script "topContentScript" in main frame');
        var args = [
          nonceNoDupe,
          nonceForAuthX,
          nonceForAuthC,
          nonceForAuthF,
          nonceToAbort,
        ].map(function (arg) { return JSON.stringify(arg); }).join(', ');

        var contentScriptCode =
          // Function declarations.
          logStep + '\n' + processPrintJob + '\n' +
          // Main logic.
          '(' + topContentScript + ')(' + args + ');' +
          // Return value to signal successful execution.
          '"OK"';

        chrome.tabs.executeScript(currentTab.id, {
          frameId: 0,
          code: contentScriptCode,
        }, function (results) {
          if (chrome.runtime.lastError || !results || results[0] !== 'OK') {
            // This can happen if the top frame is not accessible to the
            // extension, e.g. when it is a data:-URL.
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    }).then(function () {
      printService.throwIfInactive();

      return new Promise(function (resolve) {
        // Note: If the top page misbehaves, we may wait forever for a message.
        window.addEventListener('message', onmessage, true);

        logStep(3, 'Announce DOMWindow of X to CS');
        top.postMessage(nonceNoDupe, '*');

        function onmessage(event) {
          if (event.source === top && event.data === nonceForAuthX) {
            logStep(12, 'Receive message from CS');
            window.removeEventListener('message', onmessage, true);
            var port2 = event.ports[0];
            resolve(port2);
          }
        }
      });
    }).then(function (port2) {
      printService.throwIfInactive();

      return new Promise(function (resolve, reject) {
        port2.onmessage = function (event) {
          if (event.data === nonceForAuthF) {
            logStep(13, 'Proceed after verifying authenticity of sender');
            resolve(port2);
          } else {
            port2.close();
            reject(new Error('Invalid nonce - authentication of F failed'));
          }
        };
      });
    }).then(function (port2) {
      logStep(14, 'Send print job to CS');
      if (printService.active) {
        port2.postMessage(printJob);
        port2.close();
      } else {
        port2.close();
        printService.throwIfInactive();
      }
    }).catch(function (e) {
      if (printService.active) {
        console.error(e);
      }
      top.postMessage(nonceToAbort, '*');
    });
  }

  function getStyleSheetTextForPrinting() {
    var pattern = /^\*$|#printContainer|@page|@media print/;
    var cssTexts = [];
    Array.from(document.styleSheets).forEach(function (sheet) {
      Array.from(sheet.cssRules || []).forEach(function (rule) {
        // selectorText for most rules, cssText for @-rules.
        var selector = rule.selectorText || rule.cssText;
        if (pattern.test(selector)) {
          cssTexts.push(rule.cssText);
        }
      });
    });
    return cssTexts.join('\n');
  }

  if (isOutOfProcessFrame()) {
    PDFPrintService.prototype.useRenderedPage = function (printItem) {
      this.throwIfInactive();
      if (!this.printPageItems) {
        this.printPageItems = [];
      }
      return new Promise(function (resolve, reject) {
        // toBlob is supported since 50, --isolate-extensions (OOP frames)
        // is enabled by default in 55 (and on a Finch trial in 54). So we
        // do not need to check whether toBlob is supported - it just works.
        this.scratchCanvas.toBlob(function (blob) {
          if (!this.active) {
            reject();
            return;
          }
          this.printPageItems.push({
            blob: blob,
            width: printItem.width,
            height: printItem.height,
          });
          resolve();
        }.bind(this));
      }.bind(this));
    };

    PDFPrintService.prototype.performPrint = function () {
      this.throwIfInactive();

      var printJob = {
        pageItems: this.printPageItems.splice(0),
        styleSheetText: getStyleSheetTextForPrinting(),
      };

      return forwardPrintResults(this, printJob);
    };

    var destroy = PDFPrintService.prototype.destroy;
    PDFPrintService.prototype.destroy = function () {
      destroy.call(this);
      this.printPageItems = null;
    };
  }
}));
