/* Copyright 2012 Mozilla Foundation
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
  AbortException,
  assert,
  getVerbosityLevel,
  info,
  isNodeJS,
  PasswordException,
  setVerbosityLevel,
  stringToPDFString,
  VerbosityLevel,
  warn,
} from "../shared/util.js";
import {
  arrayBuffersToBytes,
  getNewAnnotationsMap,
  XRefParseException,
} from "./core_utils.js";
import { Dict, isDict, Ref, RefSetCache } from "./primitives.js";
import { LocalPdfManager, NetworkPdfManager } from "./pdf_manager.js";
import { MessageHandler, wrapReason } from "../shared/message_handler.js";
import { AnnotationFactory } from "./annotation.js";
import { clearGlobalCaches } from "./cleanup_helper.js";
import { incrementalUpdate } from "./writer.js";
import { PDFWorkerStream } from "./worker_stream.js";
import { StructTreeRoot } from "./struct_tree.js";

class WorkerTask {
  constructor(name) {
    this.name = name;
    this.terminated = false;
    this._capability = Promise.withResolvers();
  }

  get finished() {
    return this._capability.promise;
  }

  finish() {
    this._capability.resolve();
  }

  terminate() {
    this.terminated = true;
  }

  ensureNotTerminated() {
    if (this.terminated) {
      throw new Error("Worker task was terminated");
    }
  }
}

class WorkerMessageHandler {
  static {
    // Worker thread (and not Node.js)?
    if (
      typeof window === "undefined" &&
      !isNodeJS &&
      typeof self !== "undefined" &&
      /* isMessagePort = */
      typeof self.postMessage === "function" &&
      "onmessage" in self
    ) {
      this.initializeFromPort(self);
    }
  }

  static setup(handler, port) {
    let testMessageProcessed = false;
    handler.on("test", data => {
      if (testMessageProcessed) {
        return; // we already processed 'test' message once
      }
      testMessageProcessed = true;

      // Ensure that `TypedArray`s can be sent to the worker.
      handler.send("test", data instanceof Uint8Array);
    });

    handler.on("configure", data => {
      setVerbosityLevel(data.verbosity);
    });

    handler.on("GetDocRequest", data => this.createDocumentHandler(data, port));
  }

  static createDocumentHandler(docParams, port) {
    // This context is actually holds references on pdfManager and handler,
    // until the latter is destroyed.
    let pdfManager;
    let terminated = false;
    let cancelXHRs = null;
    const WorkerTasks = new Set();
    const verbosity = getVerbosityLevel();

    const { docId, apiVersion } = docParams;
    const workerVersion =
      typeof PDFJSDev !== "undefined" && !PDFJSDev.test("TESTING")
        ? PDFJSDev.eval("BUNDLE_VERSION")
        : null;
    if (apiVersion !== workerVersion) {
      throw new Error(
        `The API version "${apiVersion}" does not match ` +
          `the Worker version "${workerVersion}".`
      );
    }

    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
      // Fail early, and predictably, rather than having (some) fonts fail to
      // load/render with slightly cryptic error messages in environments where
      // the `Array.prototype` has been *incorrectly* extended.
      //
      // PLEASE NOTE: We do *not* want to slow down font parsing by adding
      //              `hasOwnProperty` checks all over the code-base.
      const enumerableProperties = [];
      for (const property in []) {
        enumerableProperties.push(property);
      }
      if (enumerableProperties.length) {
        throw new Error(
          "The `Array.prototype` contains unexpected enumerable properties: " +
            enumerableProperties.join(", ") +
            "; thus breaking e.g. `for...in` iteration of `Array`s."
        );
      }
    }
    const workerHandlerName = docId + "_worker";
    let handler = new MessageHandler(workerHandlerName, docId, port);

    function ensureNotTerminated() {
      if (terminated) {
        throw new Error("Worker was terminated");
      }
    }

    function startWorkerTask(task) {
      WorkerTasks.add(task);
    }

    function finishWorkerTask(task) {
      task.finish();
      WorkerTasks.delete(task);
    }

    async function loadDocument(recoveryMode) {
      await pdfManager.ensureDoc("checkHeader");
      await pdfManager.ensureDoc("parseStartXRef");
      await pdfManager.ensureDoc("parse", [recoveryMode]);

      // Check that at least the first page can be successfully loaded,
      // since otherwise the XRef table is definitely not valid.
      await pdfManager.ensureDoc("checkFirstPage", [recoveryMode]);
      // Check that the last page can be successfully loaded, to ensure that
      // `numPages` is correct, and fallback to walking the entire /Pages-tree.
      await pdfManager.ensureDoc("checkLastPage", [recoveryMode]);

      const isPureXfa = await pdfManager.ensureDoc("isPureXfa");
      if (isPureXfa) {
        const task = new WorkerTask("loadXfaFonts");
        startWorkerTask(task);

        await Promise.all([
          pdfManager
            .loadXfaFonts(handler, task)
            .catch(reason => {
              // Ignore errors, to allow the document to load.
            })
            .then(() => finishWorkerTask(task)),
          pdfManager.loadXfaImages(),
        ]);
      }

      const [numPages, fingerprints] = await Promise.all([
        pdfManager.ensureDoc("numPages"),
        pdfManager.ensureDoc("fingerprints"),
      ]);

      // Get htmlForXfa after numPages to avoid to create HTML twice.
      const htmlForXfa = isPureXfa
        ? await pdfManager.ensureDoc("htmlForXfa")
        : null;

      return { numPages, fingerprints, htmlForXfa };
    }

    async function getPdfManager({
      data,
      password,
      disableAutoFetch,
      rangeChunkSize,
      length,
      docBaseUrl,
      enableXfa,
      evaluatorOptions,
    }) {
      const pdfManagerArgs = {
        source: null,
        disableAutoFetch,
        docBaseUrl,
        docId,
        enableXfa,
        evaluatorOptions,
        handler,
        length,
        password,
        rangeChunkSize,
      };

      if (data) {
        pdfManagerArgs.source = data;

        return new LocalPdfManager(pdfManagerArgs);
      }
      const pdfStream = new PDFWorkerStream(handler),
        fullRequest = pdfStream.getFullReader();

      const pdfManagerCapability = Promise.withResolvers();
      let newPdfManager,
        cachedChunks = [],
        loaded = 0;

      fullRequest.headersReady
        .then(function () {
          if (!fullRequest.isRangeSupported) {
            return;
          }
          pdfManagerArgs.source = pdfStream;
          pdfManagerArgs.length = fullRequest.contentLength;
          // We don't need auto-fetch when streaming is enabled.
          pdfManagerArgs.disableAutoFetch ||= fullRequest.isStreamingSupported;

          newPdfManager = new NetworkPdfManager(pdfManagerArgs);
          // There may be a chance that `newPdfManager` is not initialized for
          // the first few runs of `readchunk` block of code. Be sure to send
          // all cached chunks, if any, to chunked_stream via pdf_manager.
          for (const chunk of cachedChunks) {
            newPdfManager.sendProgressiveData(chunk);
          }

          cachedChunks = [];
          pdfManagerCapability.resolve(newPdfManager);
          cancelXHRs = null;
        })
        .catch(function (reason) {
          pdfManagerCapability.reject(reason);
          cancelXHRs = null;
        });

      new Promise(function (resolve, reject) {
        const readChunk = function ({ value, done }) {
          try {
            ensureNotTerminated();
            if (done) {
              if (!newPdfManager) {
                const pdfFile = arrayBuffersToBytes(cachedChunks);
                cachedChunks = [];

                if (length && pdfFile.length !== length) {
                  warn("reported HTTP length is different from actual");
                }
                pdfManagerArgs.source = pdfFile;

                newPdfManager = new LocalPdfManager(pdfManagerArgs);
                pdfManagerCapability.resolve(newPdfManager);
              }
              cancelXHRs = null;
              return;
            }
            if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
              assert(
                value instanceof ArrayBuffer,
                "readChunk (getPdfManager) - expected an ArrayBuffer."
              );
            }
            loaded += value.byteLength;

            if (!fullRequest.isStreamingSupported) {
              handler.send("DocProgress", {
                loaded,
                total: Math.max(loaded, fullRequest.contentLength || 0),
              });
            }

            if (newPdfManager) {
              newPdfManager.sendProgressiveData(value);
            } else {
              cachedChunks.push(value);
            }
            fullRequest.read().then(readChunk, reject);
          } catch (e) {
            reject(e);
          }
        };
        fullRequest.read().then(readChunk, reject);
      }).catch(function (e) {
        pdfManagerCapability.reject(e);
        cancelXHRs = null;
      });

      cancelXHRs = reason => {
        pdfStream.cancelAllRequests(reason);
      };

      return pdfManagerCapability.promise;
    }

    function setupDoc(data) {
      function onSuccess(doc) {
        ensureNotTerminated();
        handler.send("GetDoc", { pdfInfo: doc });
      }

      function onFailure(ex) {
        ensureNotTerminated();

        if (ex instanceof PasswordException) {
          const task = new WorkerTask(`PasswordException: response ${ex.code}`);
          startWorkerTask(task);

          handler
            .sendWithPromise("PasswordRequest", ex)
            .then(function ({ password }) {
              finishWorkerTask(task);
              pdfManager.updatePassword(password);
              pdfManagerReady();
            })
            .catch(function () {
              finishWorkerTask(task);
              handler.send("DocException", ex);
            });
        } else {
          // Ensure that we always fallback to `UnknownErrorException`.
          handler.send("DocException", wrapReason(ex));
        }
      }

      function pdfManagerReady() {
        ensureNotTerminated();

        loadDocument(false).then(onSuccess, function (reason) {
          ensureNotTerminated();

          // Try again with recoveryMode == true
          if (!(reason instanceof XRefParseException)) {
            onFailure(reason);
            return;
          }
          pdfManager.requestLoadedStream().then(function () {
            ensureNotTerminated();

            loadDocument(true).then(onSuccess, onFailure);
          });
        });
      }

      ensureNotTerminated();

      getPdfManager(data)
        .then(function (newPdfManager) {
          if (terminated) {
            // We were in a process of setting up the manager, but it got
            // terminated in the middle.
            newPdfManager.terminate(
              new AbortException("Worker was terminated.")
            );
            throw new Error("Worker was terminated");
          }
          pdfManager = newPdfManager;

          pdfManager.requestLoadedStream(/* noFetch = */ true).then(stream => {
            handler.send("DataLoaded", { length: stream.bytes.byteLength });
          });
        })
        .then(pdfManagerReady, onFailure);
    }

    handler.on("GetPage", function (data) {
      return pdfManager.getPage(data.pageIndex).then(function (page) {
        return Promise.all([
          pdfManager.ensure(page, "rotate"),
          pdfManager.ensure(page, "ref"),
          pdfManager.ensure(page, "userUnit"),
          pdfManager.ensure(page, "view"),
        ]).then(function ([rotate, ref, userUnit, view]) {
          return {
            rotate,
            ref,
            refStr: ref?.toString() ?? null,
            userUnit,
            view,
          };
        });
      });
    });

    handler.on("GetPageIndex", function (data) {
      const pageRef = Ref.get(data.num, data.gen);
      return pdfManager.ensureCatalog("getPageIndex", [pageRef]);
    });

    handler.on("GetDestinations", function (data) {
      return pdfManager.ensureCatalog("destinations");
    });

    handler.on("GetDestination", function (data) {
      return pdfManager.ensureCatalog("getDestination", [data.id]);
    });

    handler.on("GetPageLabels", function (data) {
      return pdfManager.ensureCatalog("pageLabels");
    });

    handler.on("GetPageLayout", function (data) {
      return pdfManager.ensureCatalog("pageLayout");
    });

    handler.on("GetPageMode", function (data) {
      return pdfManager.ensureCatalog("pageMode");
    });

    handler.on("GetViewerPreferences", function (data) {
      return pdfManager.ensureCatalog("viewerPreferences");
    });

    handler.on("GetOpenAction", function (data) {
      return pdfManager.ensureCatalog("openAction");
    });

    handler.on("GetAttachments", function (data) {
      return pdfManager.ensureCatalog("attachments");
    });

    handler.on("GetDocJSActions", function (data) {
      return pdfManager.ensureCatalog("jsActions");
    });

    handler.on("GetPageJSActions", function ({ pageIndex }) {
      return pdfManager.getPage(pageIndex).then(function (page) {
        return pdfManager.ensure(page, "jsActions");
      });
    });

    handler.on("GetOutline", function (data) {
      return pdfManager.ensureCatalog("documentOutline");
    });

    handler.on("GetOptionalContentConfig", function (data) {
      return pdfManager.ensureCatalog("optionalContentConfig");
    });

    handler.on("GetPermissions", function (data) {
      return pdfManager.ensureCatalog("permissions");
    });

    handler.on("GetMetadata", function (data) {
      return Promise.all([
        pdfManager.ensureDoc("documentInfo"),
        pdfManager.ensureCatalog("metadata"),
      ]);
    });

    handler.on("GetMarkInfo", function (data) {
      return pdfManager.ensureCatalog("markInfo");
    });

    handler.on("GetData", function (data) {
      return pdfManager.requestLoadedStream().then(function (stream) {
        return stream.bytes;
      });
    });

    handler.on("GetAnnotations", function ({ pageIndex, intent }) {
      return pdfManager.getPage(pageIndex).then(function (page) {
        const task = new WorkerTask(`GetAnnotations: page ${pageIndex}`);
        startWorkerTask(task);

        return page.getAnnotationsData(handler, task, intent).then(
          data => {
            finishWorkerTask(task);
            return data;
          },
          reason => {
            finishWorkerTask(task);
            throw reason;
          }
        );
      });
    });

    handler.on("GetFieldObjects", function (data) {
      return pdfManager
        .ensureDoc("fieldObjects")
        .then(fieldObjects => fieldObjects?.allFields || null);
    });

    handler.on("HasJSActions", function (data) {
      return pdfManager.ensureDoc("hasJSActions");
    });

    handler.on("GetCalculationOrderIds", function (data) {
      return pdfManager.ensureDoc("calculationOrderIds");
    });

    handler.on(
      "SaveDocument",
      async function ({ isPureXfa, numPages, annotationStorage, filename }) {
        const globalPromises = [
          pdfManager.requestLoadedStream(),
          pdfManager.ensureCatalog("acroForm"),
          pdfManager.ensureCatalog("acroFormRef"),
          pdfManager.ensureDoc("startXRef"),
          pdfManager.ensureDoc("xref"),
          pdfManager.ensureDoc("linearization"),
          pdfManager.ensureCatalog("structTreeRoot"),
        ];
        const changes = new RefSetCache();
        const promises = [];

        const newAnnotationsByPage = !isPureXfa
          ? getNewAnnotationsMap(annotationStorage)
          : null;
        const [
          stream,
          acroForm,
          acroFormRef,
          startXRef,
          xref,
          linearization,
          _structTreeRoot,
        ] = await Promise.all(globalPromises);
        const catalogRef = xref.trailer.getRaw("Root") || null;
        let structTreeRoot;

        if (newAnnotationsByPage) {
          if (!_structTreeRoot) {
            if (
              await StructTreeRoot.canCreateStructureTree({
                catalogRef,
                pdfManager,
                newAnnotationsByPage,
              })
            ) {
              structTreeRoot = null;
            }
          } else if (
            await _structTreeRoot.canUpdateStructTree({
              pdfManager,
              xref,
              newAnnotationsByPage,
            })
          ) {
            structTreeRoot = _structTreeRoot;
          }

          const imagePromises = AnnotationFactory.generateImages(
            annotationStorage.values(),
            xref,
            pdfManager.evaluatorOptions.isOffscreenCanvasSupported
          );
          const newAnnotationPromises =
            structTreeRoot === undefined ? promises : [];
          for (const [pageIndex, annotations] of newAnnotationsByPage) {
            newAnnotationPromises.push(
              pdfManager.getPage(pageIndex).then(page => {
                const task = new WorkerTask(`Save (editor): page ${pageIndex}`);
                startWorkerTask(task);

                return page
                  .saveNewAnnotations(
                    handler,
                    task,
                    annotations,
                    imagePromises,
                    changes
                  )
                  .finally(function () {
                    finishWorkerTask(task);
                  });
              })
            );
          }
          if (structTreeRoot === null) {
            // No structTreeRoot exists, so we need to create one.
            promises.push(
              Promise.all(newAnnotationPromises).then(async () => {
                await StructTreeRoot.createStructureTree({
                  newAnnotationsByPage,
                  xref,
                  catalogRef,
                  pdfManager,
                  changes,
                });
              })
            );
          } else if (structTreeRoot) {
            promises.push(
              Promise.all(newAnnotationPromises).then(async () => {
                await structTreeRoot.updateStructureTree({
                  newAnnotationsByPage,
                  pdfManager,
                  changes,
                });
              })
            );
          }
        }

        if (isPureXfa) {
          promises.push(pdfManager.serializeXfaData(annotationStorage));
        } else {
          for (let pageIndex = 0; pageIndex < numPages; pageIndex++) {
            promises.push(
              pdfManager.getPage(pageIndex).then(function (page) {
                const task = new WorkerTask(`Save: page ${pageIndex}`);
                startWorkerTask(task);

                return page
                  .save(handler, task, annotationStorage, changes)
                  .finally(function () {
                    finishWorkerTask(task);
                  });
              })
            );
          }
        }
        const refs = await Promise.all(promises);

        let xfaData = null;
        if (isPureXfa) {
          xfaData = refs[0];
          if (!xfaData) {
            return stream.bytes;
          }
        } else if (changes.size === 0) {
          // No new refs so just return the initial bytes
          return stream.bytes;
        }

        const needAppearances =
          acroFormRef &&
          acroForm instanceof Dict &&
          changes.values().some(ref => ref.needAppearances);

        const xfa = (acroForm instanceof Dict && acroForm.get("XFA")) || null;
        let xfaDatasetsRef = null;
        let hasXfaDatasetsEntry = false;
        if (Array.isArray(xfa)) {
          for (let i = 0, ii = xfa.length; i < ii; i += 2) {
            if (xfa[i] === "datasets") {
              xfaDatasetsRef = xfa[i + 1];
              hasXfaDatasetsEntry = true;
            }
          }
          if (xfaDatasetsRef === null) {
            xfaDatasetsRef = xref.getNewTemporaryRef();
          }
        } else if (xfa) {
          // TODO: Support XFA streams.
          warn("Unsupported XFA type.");
        }

        let newXrefInfo = Object.create(null);
        if (xref.trailer) {
          // Get string info from Info in order to compute fileId.
          const infoObj = Object.create(null);
          const xrefInfo = xref.trailer.get("Info") || null;
          if (xrefInfo instanceof Dict) {
            for (const [key, value] of xrefInfo) {
              if (typeof value === "string") {
                infoObj[key] = stringToPDFString(value);
              }
            }
          }

          newXrefInfo = {
            rootRef: catalogRef,
            encryptRef: xref.trailer.getRaw("Encrypt") || null,
            newRef: xref.getNewTemporaryRef(),
            infoRef: xref.trailer.getRaw("Info") || null,
            info: infoObj,
            fileIds: xref.trailer.get("ID") || null,
            startXRef: linearization
              ? startXRef
              : (xref.lastXRefStreamPos ?? startXRef),
            filename,
          };
        }

        return incrementalUpdate({
          originalData: stream.bytes,
          xrefInfo: newXrefInfo,
          changes,
          xref,
          hasXfa: !!xfa,
          xfaDatasetsRef,
          hasXfaDatasetsEntry,
          needAppearances,
          acroFormRef,
          acroForm,
          xfaData,
          // Use the same kind of XRef as the previous one.
          useXrefStream: isDict(xref.topDict, "XRef"),
        }).finally(() => {
          xref.resetNewTemporaryRef();
        });
      }
    );

    handler.on("GetOperatorList", function (data, sink) {
      const pageIndex = data.pageIndex;
      pdfManager.getPage(pageIndex).then(function (page) {
        const task = new WorkerTask(`GetOperatorList: page ${pageIndex}`);
        startWorkerTask(task);

        // NOTE: Keep this condition in sync with the `info` helper function.
        const start = verbosity >= VerbosityLevel.INFOS ? Date.now() : 0;

        // Pre compile the pdf page and fetch the fonts/images.
        page
          .getOperatorList({
            handler,
            sink,
            task,
            intent: data.intent,
            cacheKey: data.cacheKey,
            annotationStorage: data.annotationStorage,
            modifiedIds: data.modifiedIds,
          })
          .then(
            function (operatorListInfo) {
              finishWorkerTask(task);

              if (start) {
                info(
                  `page=${pageIndex + 1} - getOperatorList: time=` +
                    `${Date.now() - start}ms, len=${operatorListInfo.length}`
                );
              }
              sink.close();
            },
            function (reason) {
              finishWorkerTask(task);
              if (task.terminated) {
                return; // ignoring errors from the terminated thread
              }
              sink.error(reason);

              // TODO: Should `reason` be re-thrown here (currently that casues
              //       "Uncaught exception: ..." messages in the console)?
            }
          );
      });
    });

    handler.on("GetTextContent", function (data, sink) {
      const { pageIndex, includeMarkedContent, disableNormalization } = data;

      pdfManager.getPage(pageIndex).then(function (page) {
        const task = new WorkerTask("GetTextContent: page " + pageIndex);
        startWorkerTask(task);

        // NOTE: Keep this condition in sync with the `info` helper function.
        const start = verbosity >= VerbosityLevel.INFOS ? Date.now() : 0;

        page
          .extractTextContent({
            handler,
            task,
            sink,
            includeMarkedContent,
            disableNormalization,
          })
          .then(
            function () {
              finishWorkerTask(task);

              if (start) {
                info(
                  `page=${pageIndex + 1} - getTextContent: time=` +
                    `${Date.now() - start}ms`
                );
              }
              sink.close();
            },
            function (reason) {
              finishWorkerTask(task);
              if (task.terminated) {
                return; // ignoring errors from the terminated thread
              }
              sink.error(reason);

              // TODO: Should `reason` be re-thrown here (currently that casues
              //       "Uncaught exception: ..." messages in the console)?
            }
          );
      });
    });

    handler.on("GetStructTree", function (data) {
      return pdfManager.getPage(data.pageIndex).then(function (page) {
        return pdfManager.ensure(page, "getStructTree");
      });
    });

    handler.on("FontFallback", function (data) {
      return pdfManager.fontFallback(data.id, handler);
    });

    handler.on("Cleanup", function (data) {
      return pdfManager.cleanup(/* manuallyTriggered = */ true);
    });

    handler.on("Terminate", function (data) {
      terminated = true;

      const waitOn = [];
      if (pdfManager) {
        pdfManager.terminate(new AbortException("Worker was terminated."));

        const cleanupPromise = pdfManager.cleanup();
        waitOn.push(cleanupPromise);

        pdfManager = null;
      } else {
        clearGlobalCaches();
      }
      cancelXHRs?.(new AbortException("Worker was terminated."));

      for (const task of WorkerTasks) {
        waitOn.push(task.finished);
        task.terminate();
      }

      return Promise.all(waitOn).then(function () {
        // Notice that even if we destroying handler, resolved response promise
        // must be sent back.
        handler.destroy();
        handler = null;
      });
    });

    handler.on("Ready", function (data) {
      setupDoc(docParams);
      docParams = null; // we don't need docParams anymore -- saving memory.
    });

    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      handler.on("GetXFADatasets", function (data) {
        return pdfManager.ensureDoc("xfaDatasets");
      });
      handler.on("GetXRefPrevValue", function (data) {
        return pdfManager
          .ensureXRef("trailer")
          .then(trailer => trailer.get("Prev"));
      });
      handler.on("GetStartXRefPos", function (data) {
        return pdfManager.ensureDoc("startXRef");
      });
      handler.on("GetAnnotArray", function (data) {
        return pdfManager.getPage(data.pageIndex).then(function (page) {
          return page.annotations.map(a => a.toString());
        });
      });
    }

    return workerHandlerName;
  }

  static initializeFromPort(port) {
    const handler = new MessageHandler("worker", "main", port);
    this.setup(handler, port);
    handler.send("ready", null);
  }
}

export { WorkerMessageHandler, WorkerTask };
