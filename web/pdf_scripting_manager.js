/* Copyright 2021 Mozilla Foundation
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

import { createPromiseCapability, shadow } from "pdfjs-lib";
import { apiPageLayoutToSpreadMode } from "./ui_utils.js";
import { RenderingStates } from "./pdf_rendering_queue.js";

/**
 * @typedef {Object} PDFScriptingManagerOptions
 * @property {EventBus} eventBus - The application event bus.
 * @property {string} sandboxBundleSrc - The path and filename of the scripting
 *   bundle.
 * @property {Object} [scriptingFactory] - The factory that is used when
 *   initializing scripting; must contain a `createScripting` method.
 *   PLEASE NOTE: Primarily intended for the default viewer use-case.
 * @property {function} [docPropertiesLookup] - The function that is used to
 *   lookup the necessary document properties.
 */

class PDFScriptingManager {
  /**
   * @param {PDFScriptingManagerOptions} options
   */
  constructor({
    eventBus,
    sandboxBundleSrc = null,
    scriptingFactory = null,
    docPropertiesLookup = null,
  }) {
    this._pdfDocument = null;
    this._pdfViewer = null;
    this._closeCapability = null;
    this._destroyCapability = null;

    this._scripting = null;
    this._mouseState = Object.create(null);
    this._ready = false;

    this._eventBus = eventBus;
    this._sandboxBundleSrc = sandboxBundleSrc;
    this._scriptingFactory = scriptingFactory;
    this._docPropertiesLookup = docPropertiesLookup;

    // The default viewer already handles adding/removing of DOM events,
    // hence limit this to only the viewer components.
    if (
      typeof PDFJSDev !== "undefined" &&
      PDFJSDev.test("COMPONENTS") &&
      !this._scriptingFactory
    ) {
      window.addEventListener("updatefromsandbox", event => {
        this._eventBus.dispatch("updatefromsandbox", {
          source: window,
          detail: event.detail,
        });
      });
    }
  }

  setViewer(pdfViewer) {
    this._pdfViewer = pdfViewer;
  }

  async setDocument(pdfDocument) {
    if (this._pdfDocument) {
      await this._destroyScripting();
    }
    this._pdfDocument = pdfDocument;

    if (!pdfDocument) {
      return;
    }
    const [objects, calculationOrder, docActions] = await Promise.all([
      pdfDocument.getFieldObjects(),
      pdfDocument.getCalculationOrderIds(),
      pdfDocument.getJSActions(),
    ]);

    if (!objects && !docActions) {
      // No FieldObjects or JavaScript actions were found in the document.
      await this._destroyScripting();
      return;
    }
    if (pdfDocument !== this._pdfDocument) {
      return; // The document was closed while the data resolved.
    }
    try {
      this._scripting = this._createScripting();
    } catch (error) {
      console.error(`PDFScriptingManager.setDocument: "${error?.message}".`);

      await this._destroyScripting();
      return;
    }

    this._internalEvents.set("updatefromsandbox", event => {
      if (event?.source !== window) {
        return;
      }
      this._updateFromSandbox(event.detail);
    });
    this._internalEvents.set("dispatcheventinsandbox", event => {
      this._scripting?.dispatchEventInSandbox(event.detail);
    });

    this._internalEvents.set("pagechanging", ({ pageNumber, previous }) => {
      if (pageNumber === previous) {
        return; // The current page didn't change.
      }
      this._dispatchPageClose(previous);
      this._dispatchPageOpen(pageNumber);
    });
    this._internalEvents.set("pagerendered", ({ pageNumber }) => {
      if (!this._pageOpenPending.has(pageNumber)) {
        return; // No pending "PageOpen" event for the newly rendered page.
      }
      if (pageNumber !== this._pdfViewer.currentPageNumber) {
        return; // The newly rendered page is no longer the current one.
      }
      this._dispatchPageOpen(pageNumber);
    });
    this._internalEvents.set("pagesdestroy", async event => {
      await this._dispatchPageClose(this._pdfViewer.currentPageNumber);

      await this._scripting?.dispatchEventInSandbox({
        id: "doc",
        name: "WillClose",
      });

      this._closeCapability?.resolve();
    });

    this._domEvents.set("mousedown", event => {
      this._mouseState.isDown = true;
    });
    this._domEvents.set("mouseup", event => {
      this._mouseState.isDown = false;
    });

    for (const [name, listener] of this._internalEvents) {
      this._eventBus._on(name, listener);
    }
    for (const [name, listener] of this._domEvents) {
      window.addEventListener(name, listener);
    }

    try {
      const docProperties = await this._getDocProperties();
      if (pdfDocument !== this._pdfDocument) {
        return; // The document was closed while the properties resolved.
      }

      await this._scripting.createSandbox({
        objects,
        calculationOrder,
        appInfo: {
          platform: navigator.platform,
          language: navigator.language,
        },
        docInfo: {
          ...docProperties,
          actions: docActions,
        },
      });

      this._eventBus.dispatch("sandboxcreated", { source: this });
    } catch (error) {
      console.error(`PDFScriptingManager.setDocument: "${error?.message}".`);

      await this._destroyScripting();
      return;
    }

    await this._scripting?.dispatchEventInSandbox({
      id: "doc",
      name: "Open",
    });
    await this._dispatchPageOpen(
      this._pdfViewer.currentPageNumber,
      /* initialize = */ true
    );

    // Defer this slightly, to ensure that scripting is *fully* initialized.
    Promise.resolve().then(() => {
      if (pdfDocument === this._pdfDocument) {
        this._ready = true;
      }
    });
  }

  async dispatchWillSave(detail) {
    return this._scripting?.dispatchEventInSandbox({
      id: "doc",
      name: "WillSave",
    });
  }

  async dispatchDidSave(detail) {
    return this._scripting?.dispatchEventInSandbox({
      id: "doc",
      name: "DidSave",
    });
  }

  async dispatchWillPrint(detail) {
    return this._scripting?.dispatchEventInSandbox({
      id: "doc",
      name: "WillPrint",
    });
  }

  async dispatchDidPrint(detail) {
    return this._scripting?.dispatchEventInSandbox({
      id: "doc",
      name: "DidPrint",
    });
  }

  get mouseState() {
    return this._mouseState;
  }

  get destroyPromise() {
    return this._destroyCapability?.promise || null;
  }

  get ready() {
    return this._ready;
  }

  /**
   * @private
   */
  get _internalEvents() {
    return shadow(this, "_internalEvents", new Map());
  }

  /**
   * @private
   */
  get _domEvents() {
    return shadow(this, "_domEvents", new Map());
  }

  /**
   * @private
   */
  get _pageOpenPending() {
    return shadow(this, "_pageOpenPending", new Set());
  }

  /**
   * @private
   */
  get _visitedPages() {
    return shadow(this, "_visitedPages", new Map());
  }

  /**
   * @private
   */
  async _updateFromSandbox(detail) {
    // Ignore some events, see below, that don't make sense in PresentationMode.
    const isInPresentationMode =
      this._pdfViewer.isInPresentationMode ||
      this._pdfViewer.isChangingPresentationMode;

    const { id, siblings, command, value } = detail;
    if (!id) {
      switch (command) {
        case "clear":
          console.clear();
          break;
        case "error":
          console.error(value);
          break;
        case "layout":
          this._pdfViewer.spreadMode = apiPageLayoutToSpreadMode(value);
          break;
        case "page-num":
          this._pdfViewer.currentPageNumber = value + 1;
          break;
        case "print":
          await this._pdfViewer.pagesPromise;
          this._eventBus.dispatch("print", { source: this });
          break;
        case "println":
          console.log(value);
          break;
        case "zoom":
          if (isInPresentationMode) {
            return;
          }
          this._pdfViewer.currentScaleValue = value;
          break;
      }
      return;
    }

    if (isInPresentationMode) {
      if (detail.focus) {
        return;
      }
    }
    delete detail.id;
    delete detail.siblings;

    const ids = siblings ? [id, ...siblings] : [id];
    for (const elementId of ids) {
      const element = document.getElementById(elementId);
      if (element) {
        element.dispatchEvent(new CustomEvent("updatefromsandbox", { detail }));
      } else {
        // The element hasn't been rendered yet, use the AnnotationStorage.
        this._pdfDocument?.annotationStorage.setValue(elementId, detail);
      }
    }
  }

  /**
   * @private
   */
  async _dispatchPageOpen(pageNumber, initialize = false) {
    const pdfDocument = this._pdfDocument,
      visitedPages = this._visitedPages;

    if (initialize) {
      this._closeCapability = createPromiseCapability();
    }
    if (!this._closeCapability) {
      return; // Scripting isn't fully initialized yet.
    }
    const pageView = this._pdfViewer.getPageView(/* index = */ pageNumber - 1);

    if (pageView?.renderingState !== RenderingStates.FINISHED) {
      this._pageOpenPending.add(pageNumber);
      return; // Wait for the page to finish rendering.
    }
    this._pageOpenPending.delete(pageNumber);

    const actionsPromise = (async () => {
      // Avoid sending, and thus serializing, the `actions` data more than once.
      const actions = await (!visitedPages.has(pageNumber)
        ? pageView.pdfPage?.getJSActions()
        : null);
      if (pdfDocument !== this._pdfDocument) {
        return; // The document was closed while the actions resolved.
      }

      await this._scripting?.dispatchEventInSandbox({
        id: "page",
        name: "PageOpen",
        pageNumber,
        actions,
      });
    })();
    visitedPages.set(pageNumber, actionsPromise);
  }

  /**
   * @private
   */
  async _dispatchPageClose(pageNumber) {
    const pdfDocument = this._pdfDocument,
      visitedPages = this._visitedPages;

    if (!this._closeCapability) {
      return; // Scripting isn't fully initialized yet.
    }
    if (this._pageOpenPending.has(pageNumber)) {
      return; // The page is still rendering; no "PageOpen" event dispatched.
    }
    const actionsPromise = visitedPages.get(pageNumber);
    if (!actionsPromise) {
      return; // The "PageClose" event must be preceded by a "PageOpen" event.
    }
    visitedPages.set(pageNumber, null);

    // Ensure that the "PageOpen" event is dispatched first.
    await actionsPromise;
    if (pdfDocument !== this._pdfDocument) {
      return; // The document was closed while the actions resolved.
    }

    await this._scripting?.dispatchEventInSandbox({
      id: "page",
      name: "PageClose",
      pageNumber,
    });
  }

  /**
   * @returns {Promise<Object>} A promise that is resolved with an {Object}
   *   containing the necessary document properties; please find the expected
   *   format in `PDFViewerApplication._scriptingDocProperties`.
   * @private
   */
  async _getDocProperties() {
    if (this._docPropertiesLookup) {
      return this._docPropertiesLookup(this._pdfDocument);
    }
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("COMPONENTS")) {
      const { docPropertiesLookup } = require("./generic_scripting.js");

      return docPropertiesLookup(this._pdfDocument);
    }
    throw new Error("_getDocProperties: Unable to lookup properties.");
  }

  /**
   * @private
   */
  _createScripting() {
    this._destroyCapability = createPromiseCapability();

    if (this._scripting) {
      throw new Error("_createScripting: Scripting already exists.");
    }
    if (this._scriptingFactory) {
      return this._scriptingFactory.createScripting({
        sandboxBundleSrc: this._sandboxBundleSrc,
      });
    }
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("COMPONENTS")) {
      const { GenericScripting } = require("./generic_scripting.js");

      return new GenericScripting(this._sandboxBundleSrc);
    }
    throw new Error("_createScripting: Cannot create scripting.");
  }

  /**
   * @private
   */
  async _destroyScripting() {
    if (!this._scripting) {
      this._pdfDocument = null;

      this._destroyCapability?.resolve();
      return;
    }
    if (this._closeCapability) {
      await Promise.race([
        this._closeCapability.promise,
        new Promise(resolve => {
          // Avoid the scripting/sandbox-destruction hanging indefinitely.
          setTimeout(resolve, 1000);
        }),
      ]).catch(reason => {
        // Ignore any errors, to ensure that the sandbox is always destroyed.
      });
      this._closeCapability = null;
    }
    this._pdfDocument = null;

    try {
      await this._scripting.destroySandbox();
    } catch (ex) {}

    for (const [name, listener] of this._internalEvents) {
      this._eventBus._off(name, listener);
    }
    this._internalEvents.clear();

    for (const [name, listener] of this._domEvents) {
      window.removeEventListener(name, listener);
    }
    this._domEvents.clear();

    this._pageOpenPending.clear();
    this._visitedPages.clear();

    this._scripting = null;
    delete this._mouseState.isDown;
    this._ready = false;

    this._destroyCapability?.resolve();
  }
}

export { PDFScriptingManager };
