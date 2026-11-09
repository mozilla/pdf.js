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

/** @typedef {import("./event_utils").EventBus} EventBus */

import { getUuid, makeArr, shadow } from "pdfjs-lib";
import { apiPageLayoutToViewerModes } from "./ui_utils.js";
import { internalOpt } from "./internal_evt.js";
import { RenderingStates } from "./renderable_view.js";

// Events eligible to carry a user gesture's activation token.
const ACTIVATION_EVENTS = new Set(["Action", "Mouse Down", "Mouse Up"]);

// Events eligible for a dialog when triggered by a trusted, non-scripted event.
const DIALOG_EVENTS = new Set([
  ...ACTIVATION_EVENTS,
  "Blur",
  "Focus",
  "Keystroke",
  "Validate",
]);

// Commands which can't change what is under the pointer: any other one, even
// unknown, is treated as a possible layout change.
const STATIC_COMMANDS = new Set([
  "SaveAs",
  "WillPrintFinished",
  "WillSaveFinished",
  "clear",
  "error",
  "print",
  "println",
  "sandboxTripEnd",
]);
// Layout-change guard: a gesture starting sooner than this after a script
// changed the layout isn't honored, like `security.notification_enable_delay`
// in Firefox.
const LAYOUT_CHANGE_DELAY = 500; // ms

/**
 * @typedef {object} PDFScriptingManagerOptions
 * @property {EventBus} eventBus - The application event bus.
 * @property {string} [sandboxBundleSrc] - The path and filename of the
 *   scripting bundle.
 * @property {object} [externalServices] - The factory that is used when
 *   initializing scripting; must contain a `createScripting` method.
 *   PLEASE NOTE: Primarily intended for the default viewer use-case.
 * @property {Function} [docProperties] - The function that is used to lookup
 *   the necessary document properties.
 */

class PDFScriptingManager {
  // The activations, by token, of the events being dispatched in the sandbox.
  #activations = new Map();

  #closeCapability = null;

  #consumedGestureId = 0;

  #destroyCapability = null;

  #docProperties = null;

  #eventAC = null;

  #eventBus = null;

  #externalServices = null;

  #gesture = { id: 0, time: -Infinity, type: "" };

  // null while the layout-change animation-frame callback is pending.
  #lastLayoutChange = -Infinity;

  #objectIds = null;

  #pdfDocument = null;

  #pdfViewer = null;

  #ready = false;

  // OpenAction can print before #ready is set.
  #sandboxCreated = false;

  #scripting = null;

  // Pending requests per event name, resolved in order by "...Finished".
  #pendingDocEvents = new Map();

  /**
   * @param {PDFScriptingManagerOptions} options
   */
  constructor({ eventBus, externalServices = null, docProperties = null }) {
    this.#eventBus = eventBus;
    this.#externalServices = externalServices;
    this.#docProperties = docProperties;

    // Annotations report possible layout changes and request permission for
    // actions such as printing, saving, or following links.
    eventBus.on(
      "sandboxlayoutchange",
      () => this.#markLayoutChange(),
      internalOpt
    );
    eventBus.on(
      "useractivationrequest",
      request => {
        request.allowed =
          !this.#scripting ||
          this.#consumeGesture(this.#getActivation(request));
      },
      internalOpt
    );

    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("TESTING")) {
      Object.defineProperty(this, "sandboxTrip", {
        value: () =>
          setTimeout(
            () =>
              this.#scripting?.dispatchEventInSandbox({
                name: "sandboxtripbegin",
              }),
            0
          ),
      });
    }
  }

  setViewer(pdfViewer) {
    this.#pdfViewer = pdfViewer;
  }

  async setDocument(pdfDocument) {
    if (this.#pdfDocument) {
      await this.#destroyScripting();
    }
    this.#pdfDocument = pdfDocument;

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
      await this.#destroyScripting();
      return;
    }
    if (pdfDocument !== this.#pdfDocument) {
      return; // The document was closed while the data resolved.
    }

    // Collect the ids of every field annotation, so that any sandbox message
    // targeting an unknown id can be ignored.
    if (objects) {
      this.#objectIds = new Set();
      for (const fields of objects.values()) {
        for (const { id } of fields) {
          this.#objectIds.add(id);
        }
      }
    }

    try {
      this.#scripting = this.#initScripting();
    } catch (error) {
      console.error("setDocument:", error);

      await this.#destroyScripting();
      return;
    }
    const eventBus = this.#eventBus;

    this.#eventAC = new AbortController();
    const evtOpts = { signal: this.#eventAC.signal, ...internalOpt };

    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("COMPONENTS")) &&
      this.#externalServices.addScriptingWindowListener
    ) {
      // The default viewer already handles adding/removing of DOM events,
      // hence limit this to only the viewer components.
      window.addEventListener(
        "updatefromsandbox",
        event => {
          eventBus.dispatch("updatefromsandbox", {
            source: window,
            detail: event.detail,
          });
        },
        { signal: this.#eventAC.signal }
      );
    }

    eventBus.on(
      "updatefromsandbox",
      event => {
        if (event?.source === window) {
          this.#updateFromSandbox(event.detail);
        }
      },
      evtOpts
    );
    eventBus.on(
      "dispatcheventinsandbox",
      info => {
        const { detail, originalEvent, scripted } = info;
        this.#dispatchEventInSandbox(
          {
            ...detail,
            scripted: !!scripted,
            allowDialog:
              !!originalEvent?.isTrusted &&
              !scripted &&
              DIALOG_EVENTS.has(detail?.name),
          },
          ACTIVATION_EVENTS.has(detail?.name) ? this.#getActivation(info) : null
        );
      },
      evtOpts
    );

    // Everything which comes from the sandbox is untrusted, hence the user
    // gestures are tracked here.
    const listenerOpts = {
      capture: true,
      passive: true,
      signal: this.#eventAC.signal,
    };
    const startGesture = (event, type) => {
      if (event.isTrusted) {
        this.#gesture = {
          id: this.#gesture.id + 1,
          time: event.timeStamp,
          type,
        };
      }
    };
    window.addEventListener(
      "pointerdown",
      event => startGesture(event, "pointer"),
      listenerOpts
    );
    window.addEventListener(
      "mousedown",
      event => {
        if (event.isTrusted && this.#gesture.type === "pointer") {
          this.#gesture.type = "mouse"; // Same gesture as the pointerdown.
        } else {
          // E.g. assistive technology, which clicks without any pointerdown.
          startGesture(event, "mouse");
        }
      },
      listenerOpts
    );
    window.addEventListener(
      "keydown",
      event => {
        if (!event.repeat) {
          startGesture(event, "key");
        }
      },
      listenerOpts
    );

    eventBus.on(
      "pagechanging",
      ({ pageNumber, previous }) => {
        if (pageNumber === previous) {
          return; // The current page didn't change.
        }
        this.#dispatchPageClose(previous);
        this.#dispatchPageOpen(pageNumber);
      },
      evtOpts
    );
    eventBus.on(
      "pagerendered",
      ({ pageNumber }) => {
        if (!this._pageOpenPending.has(pageNumber)) {
          return; // No pending "PageOpen" event for the newly rendered page.
        }
        if (pageNumber !== this.#pdfViewer.currentPageNumber) {
          return; // The newly rendered page is no longer the current one.
        }
        this.#dispatchPageOpen(pageNumber);
      },
      evtOpts
    );
    eventBus.on(
      "pagesdestroy",
      async () => {
        await this.#dispatchPageClose(this.#pdfViewer.currentPageNumber);

        await this.#scripting?.dispatchEventInSandbox({
          id: "doc",
          name: "WillClose",
        });

        this.#closeCapability?.resolve();
      },
      evtOpts
    );

    try {
      const docProperties = await this.#docProperties(pdfDocument);
      if (pdfDocument !== this.#pdfDocument) {
        return; // The document was closed while the properties resolved.
      }

      await this.#scripting.createSandbox({
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
      if (pdfDocument === this.#pdfDocument) {
        this.#sandboxCreated = true;
      }

      eventBus.dispatch("sandboxcreated", { source: this });
    } catch (error) {
      console.error("setDocument:", error);

      await this.#destroyScripting();
      return;
    }

    // Allow at most one print command during the document Open dispatch.
    await this.#dispatchEventInSandbox(
      { id: "doc", name: "Open", allowDialog: true },
      { isOpen: true }
    );
    await this.#dispatchPageOpen(
      this.#pdfViewer.currentPageNumber,
      /* initialize = */ true
    );

    // Defer this slightly, to ensure that scripting is *fully* initialized.
    Promise.resolve().then(() => {
      if (pdfDocument === this.#pdfDocument) {
        this.#ready = true;
      }
    });
  }

  /**
   * Dispatch an event with an activation token, if any. Keep the token until
   * dispatch settles, unless a command consumes it first.
   * @param {object} detail - The event to dispatch.
   * @param {object | null} [activation] - The user gesture which caused the
   *   event, i.e. `{ gestureId }`, or `{ isOpen: true }` for the Open event.
   * @returns {Promise<void>}
   */
  async #dispatchEventInSandbox(detail, activation = null) {
    if (!activation) {
      await this.#scripting?.dispatchEventInSandbox(detail);
      return;
    }
    const token = getUuid();
    this.#activations.set(token, activation);
    try {
      await this.#scripting?.dispatchEventInSandbox({
        ...detail,
        activation: token,
      });
    } finally {
      this.#activations.delete(token);
    }
  }

  /**
   * Get the activation of the current user gesture, if the DOM event which
   * triggers an action can be considered as caused by the user.
   * @param {object} info
   * @param {Event} [info.originalEvent] - The DOM event.
   * @param {boolean} [info.scriptFocused] - Whether the event target is marked
   *   as script-focused.
   * @returns {object | null} The activation, i.e. `{ gestureId }`, or null.
   */
  #getActivation({ originalEvent, scriptFocused }) {
    const { id, time, type } = this.#gesture;
    if (
      !originalEvent?.isTrusted ||
      navigator.userActivation?.isActive !== true ||
      // The script may have just changed what is under the pointer.
      this.#lastLayoutChange === null ||
      time - this.#lastLayoutChange < LAYOUT_CHANGE_DELAY ||
      // The script may have focused the element the user is typing on.
      (type === "key" && scriptFocused)
    ) {
      return null;
    }
    return { gestureId: id };
  }

  /**
   * Consume a user gesture, shared by sandbox commands and annotation actions.
   * Each gesture can be consumed at most once.
   * @param {object | null} activation - The activation, i.e. `{ gestureId }`.
   * @returns {boolean} Whether the action is allowed.
   */
  #consumeGesture(activation) {
    if (!activation || activation.gestureId <= this.#consumedGestureId) {
      return false;
    }
    this.#consumedGestureId = activation.gestureId;
    return true;
  }

  /**
   * Consume the activation of the event whose handling sent the command.
   * @param {string} token - The token received with the command.
   * @param {boolean} allowOpen - Whether the Open event can run the command.
   * @returns {boolean} Whether the command is allowed.
   */
  #consumeActivation(token, allowOpen) {
    const activation = this.#activations.get(token);
    if (!activation) {
      return false;
    }
    this.#activations.delete(token);
    return activation.isOpen ? allowOpen : this.#consumeGesture(activation);
  }

  /**
   * Record a possible layout change. Reject gestures starting before the
   * pending animation-frame callback runs or within the delay after it runs.
   */
  #markLayoutChange() {
    if (this.#lastLayoutChange === null) {
      return;
    }
    this.#lastLayoutChange = null;
    // The delay starts once the script yields, at the next animation frame.
    // Deferred changes (e.g. focus) are reported again once applied, since
    // that frame can precede them.
    requestAnimationFrame(() => {
      this.#lastLayoutChange = performance.now();
    });
  }

  async dispatchWillSave() {
    return this.#dispatchDocEventAndWait("WillSave");
  }

  async dispatchDidSave() {
    return this.#scripting?.dispatchEventInSandbox({
      id: "doc",
      name: "DidSave",
      allowDialog: true,
    });
  }

  async dispatchWillPrint() {
    return this.#dispatchDocEventAndWait("WillPrint");
  }

  async #dispatchDocEventAndWait(name) {
    if (!this.#scripting || !this.#sandboxCreated) {
      // Don't wait for a reply before sandbox creation.
      return;
    }
    // Queue before dispatch to handle synchronous replies and overlaps.
    const capability = Promise.withResolvers();
    const pendingEvents = this.#pendingDocEvents.getOrInsertComputed(
      name,
      makeArr
    );
    pendingEvents.push(capability);
    try {
      await this.#scripting.dispatchEventInSandbox({
        id: "doc",
        name,
        allowDialog: true,
      });
    } catch (ex) {
      const index = pendingEvents.indexOf(capability);
      if (index >= 0) {
        pendingEvents.splice(index, 1);
      }
      throw ex;
    }

    await capability.promise;
  }

  async dispatchDidPrint() {
    return this.#scripting?.dispatchEventInSandbox({
      id: "doc",
      name: "DidPrint",
      allowDialog: true,
    });
  }

  get destroyPromise() {
    return this.#destroyCapability?.promise || null;
  }

  get ready() {
    return this.#ready;
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

  async #updateFromSandbox(detail) {
    const pdfViewer = this.#pdfViewer;
    // Ignore some events, see below, that don't make sense in PresentationMode.
    const isInPresentationMode =
      pdfViewer.isInPresentationMode || pdfViewer.isChangingPresentationMode;

    const { id, siblings, command, value } = detail;
    if (!id) {
      if (!STATIC_COMMANDS.has(command)) {
        this.#markLayoutChange();
      }
      if (
        typeof PDFJSDev !== "undefined" &&
        PDFJSDev.test("TESTING") &&
        command === "sandboxTripEnd"
      ) {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent("sandboxtripend"));
        }, 0);
        return;
      }

      switch (command) {
        case "clear":
          console.clear();
          break;
        case "error":
          console.error(value);
          break;
        case "layout":
          if (!isInPresentationMode) {
            const modes = apiPageLayoutToViewerModes(value);
            pdfViewer.spreadMode = modes.spreadMode;
          }
          break;
        case "page-num":
          pdfViewer.currentPageNumber = value + 1;
          break;
        case "print":
        case "SaveAs":
          if (
            !this.#consumeActivation(detail.activation, command === "print")
          ) {
            break;
          }
          if (command === "print") {
            await pdfViewer.pagesPromise;
          }
          this.#eventBus.dispatch(command === "print" ? "print" : "download", {
            source: this,
          });
          break;
        case "println":
          console.log(value);
          break;
        case "zoom":
          if (!isInPresentationMode) {
            pdfViewer.currentScaleValue = value;
          }
          break;
        case "FirstPage":
          pdfViewer.currentPageNumber = 1;
          break;
        case "LastPage":
          pdfViewer.currentPageNumber = pdfViewer.pagesCount;
          break;
        case "NextPage":
          pdfViewer.nextPage();
          break;
        case "PrevPage":
          pdfViewer.previousPage();
          break;
        case "ZoomViewIn":
          if (!isInPresentationMode) {
            pdfViewer.increaseScale();
          }
          break;
        case "ZoomViewOut":
          if (!isInPresentationMode) {
            pdfViewer.decreaseScale();
          }
          break;
        case "WillPrintFinished":
        case "WillSaveFinished": {
          const name = command.slice(0, -"Finished".length);
          this.#pendingDocEvents.get(name)?.shift()?.resolve();
          break;
        }
      }
      return;
    }

    if (isInPresentationMode && detail.focus) {
      return;
    }
    delete detail.id;
    delete detail.siblings;

    const ids = siblings ? [id, ...siblings] : [id];
    for (const elementId of ids) {
      if (!this.#objectIds?.has(elementId)) {
        continue;
      }
      const element = document.querySelector(
        `[data-element-id="${elementId}"]`
      );
      if (element) {
        element.dispatchEvent(new CustomEvent("updatefromsandbox", { detail }));
      } else {
        // The element hasn't been rendered yet, use the AnnotationStorage.
        this.#pdfDocument?.annotationStorage.setValue(elementId, detail);
      }
    }
  }

  async #dispatchPageOpen(pageNumber, initialize = false) {
    const pdfDocument = this.#pdfDocument,
      visitedPages = this._visitedPages;

    if (initialize) {
      this.#closeCapability = Promise.withResolvers();
    }
    if (!this.#closeCapability) {
      return; // Scripting isn't fully initialized yet.
    }
    const pageView = this.#pdfViewer.getPageView(/* index = */ pageNumber - 1);

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
      if (pdfDocument !== this.#pdfDocument) {
        return; // The document was closed while the actions resolved.
      }

      await this.#scripting?.dispatchEventInSandbox({
        id: "page",
        name: "PageOpen",
        pageNumber,
        actions,
      });
    })();
    visitedPages.set(pageNumber, actionsPromise);
  }

  async #dispatchPageClose(pageNumber) {
    const pdfDocument = this.#pdfDocument,
      visitedPages = this._visitedPages;

    if (!this.#closeCapability) {
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
    if (pdfDocument !== this.#pdfDocument) {
      return; // The document was closed while the actions resolved.
    }

    await this.#scripting?.dispatchEventInSandbox({
      id: "page",
      name: "PageClose",
      pageNumber,
    });
  }

  #initScripting() {
    this.#destroyCapability = Promise.withResolvers();

    if (this.#scripting) {
      throw new Error("#initScripting: Scripting already exists.");
    }
    return this.#externalServices.createScripting();
  }

  async #destroyScripting() {
    this.#objectIds = null;
    this.#sandboxCreated = false;

    if (!this.#scripting) {
      this.#pdfDocument = null;

      this.#destroyCapability?.resolve();
      return;
    }
    if (this.#closeCapability) {
      await Promise.race([
        this.#closeCapability.promise,
        new Promise(resolve => {
          // Avoid the scripting/sandbox-destruction hanging indefinitely.
          setTimeout(resolve, 1000);
        }),
      ]).catch(() => {
        // Ignore any errors, to ensure that the sandbox is always destroyed.
      });
      this.#closeCapability = null;
    }
    this.#pdfDocument = null;

    try {
      await this.#scripting.destroySandbox();
    } catch {}

    for (const pendingEvents of this.#pendingDocEvents.values()) {
      for (const capability of pendingEvents) {
        capability.reject(new Error("Scripting destroyed."));
      }
    }
    this.#pendingDocEvents.clear();

    this.#eventAC?.abort();
    this.#eventAC = null;

    this._pageOpenPending.clear();
    this._visitedPages.clear();

    this.#activations.clear();
    this.#scripting = null;
    this.#ready = false;

    this.#destroyCapability?.resolve();
  }
}

export { PDFScriptingManager };
