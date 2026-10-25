/* Copyright 2020 Mozilla Foundation
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
  exposeObject,
  FORMS_VERSION,
  uncurryThis,
  USERACTIVATION_CALLBACKID,
  VIEWER_TYPE,
  VIEWER_VARIATION,
  VIEWER_VERSION,
} from "./app_utils.js";
import { FullScreen } from "./fullscreen.js";
import { isValidColor } from "./color.js";
import { Thermometer } from "./thermometer.js";

// Captured before any script runs: by redefining these methods, a script could
// get the timer internals, e.g. to forge the data of a timeout handle and make
// `clearTimeOut` cancel the user activation expiry (USERACTIVATION_CALLBACKID).
const mapDelete = uncurryThis(Map.prototype.delete);
const mapGet = uncurryThis(Map.prototype.get);
const mapSet = uncurryThis(Map.prototype.set);
const weakMapDelete = uncurryThis(WeakMap.prototype.delete);
const weakMapGet = uncurryThis(WeakMap.prototype.get);
const weakMapSet = uncurryThis(WeakMap.prototype.set);
const registerFinalizer = uncurryThis(FinalizationRegistry.prototype.register);
const unregisterFinalizer = uncurryThis(
  FinalizationRegistry.prototype.unregister
);

// Internal entry point for initSandbox, populated by App's static block.
const AppInternals = Object.create(null);

class App {
  #constants = null;

  #focusRect = true;

  #fs = exposeObject(new FullScreen(), /* bindMethods = */ true);

  #language;

  #openInPlace = false;

  #platform;

  #runtimeHighlight = false;

  #runtimeHighlightColor = ["T"];

  #thermometer = exposeObject(new Thermometer(), /* bindMethods = */ true);

  #toolbar = false;

  #doc;

  #timeoutIds = new WeakMap();

  // Cancel timers when their handles are collected, as specified by the
  // Acrobat API for app.setTimeOut and app.setInterval.
  #timeoutIdsRegistry = new FinalizationRegistry(this.#cleanTimeout.bind(this));

  #timeoutCallbackIds = new Map();

  #timeoutCallbackId = USERACTIVATION_CALLBACKID + 1;

  #globalEval;

  #externalCall;

  #send;

  #userActivationData;

  constructor(data) {
    this.#send = data.send;
    this.#userActivationData = data.userActivationData;

    this.#language = App.#getLanguage(data.language);
    this.#platform = App.#getPlatform(data.platform);

    this.#doc = data.doc;
    this.#globalEval = data.globalEval;
    this.#externalCall = data.externalCall;
  }

  static {
    Object.assign(AppInternals, {
      evalCallback: (app, data) => app.#evalCallback(data),
    });
  }

  #registerTimeoutCallback(cExpr) {
    const id = this.#timeoutCallbackId++;
    mapSet(this.#timeoutCallbackIds, id, cExpr);
    return id;
  }

  #unregisterTimeoutCallback(id) {
    mapDelete(this.#timeoutCallbackIds, id);
  }

  #evalCallback({ callbackId, interval }) {
    if (callbackId === USERACTIVATION_CALLBACKID) {
      // Reserved callback for user-activation expiry.
      this.#userActivationData.userActivation = false;
      return;
    }
    const expr = mapGet(this.#timeoutCallbackIds, callbackId);
    if (!interval) {
      this.#unregisterTimeoutCallback(callbackId);
    }

    if (expr) {
      const saveUserActivation = this.#userActivationData.userActivation;
      // Timer callbacks do not carry user activation.
      this.#userActivationData.userActivation = false;
      this.#globalEval(expr);
      this.#userActivationData.userActivation = saveUserActivation;
    }
  }

  #registerTimeout(callbackId, interval) {
    const timeout = Object.create(null);
    const id = { callbackId, interval };
    weakMapSet(this.#timeoutIds, timeout, id);
    // Reuse the handle to unregister its finalizer on explicit cancellation.
    registerFinalizer(this.#timeoutIdsRegistry, timeout, id, timeout);
    return timeout;
  }

  #unregisterTimeout(timeout) {
    const data = weakMapGet(this.#timeoutIds, timeout);
    if (!data) {
      return;
    }

    weakMapDelete(this.#timeoutIds, timeout);
    unregisterFinalizer(this.#timeoutIdsRegistry, timeout);
    this.#cleanTimeout(data);
  }

  #cleanTimeout({ callbackId, interval }) {
    this.#unregisterTimeoutCallback(callbackId);

    if (interval) {
      this.#externalCall("clearInterval", [callbackId]);
    } else {
      this.#externalCall("clearTimeout", [callbackId]);
    }
  }

  static #getPlatform(platform) {
    if (typeof platform === "string") {
      platform = platform.toLowerCase();
      if (platform.includes("win")) {
        return "WIN";
      } else if (platform.includes("mac")) {
        return "MAC";
      }
    }
    return "UNIX";
  }

  static #getLanguage(language) {
    const [main, sub] = language.toLowerCase().split(/[-_]/, 2);
    switch (main) {
      case "zh":
        return sub === "cn" || sub === "sg" ? "CHS" : "CHT";
      case "da":
        return "DAN";
      case "de":
        return "DEU";
      case "es":
        return "ESP";
      case "fr":
        return "FRA";
      case "it":
        return "ITA";
      case "ko":
        return "KOR";
      case "ja":
        return "JPN";
      case "nl":
        return "NLD";
      case "no":
        return "NOR";
      case "pt":
        return sub === "br" ? "PTB" : "ENU";
      case "fi":
        return "SUO";
      case "SV":
        return "SVE";
      default:
        return "ENU";
    }
  }

  get activeDocs() {
    return [globalThis];
  }

  set activeDocs(_) {
    throw new Error("app.activeDocs is read-only");
  }

  get calculate() {
    return this.#doc.calculate;
  }

  set calculate(calculate) {
    this.#doc.calculate = calculate;
  }

  get constants() {
    return (this.#constants ??= Object.freeze({
      align: Object.freeze({
        left: 0,
        center: 1,
        right: 2,
        top: 3,
        bottom: 4,
      }),
    }));
  }

  set constants(_) {
    throw new Error("app.constants is read-only");
  }

  get focusRect() {
    return this.#focusRect;
  }

  set focusRect(val) {
    /* TODO or not */
    this.#focusRect = val;
  }

  get formsVersion() {
    return FORMS_VERSION;
  }

  set formsVersion(_) {
    throw new Error("app.formsVersion is read-only");
  }

  get fromPDFConverters() {
    return [];
  }

  set fromPDFConverters(_) {
    throw new Error("app.fromPDFConverters is read-only");
  }

  get fs() {
    return this.#fs;
  }

  set fs(_) {
    throw new Error("app.fs is read-only");
  }

  get language() {
    return this.#language;
  }

  set language(_) {
    throw new Error("app.language is read-only");
  }

  get media() {
    return undefined;
  }

  set media(_) {
    throw new Error("app.media is read-only");
  }

  get monitors() {
    return [];
  }

  set monitors(_) {
    throw new Error("app.monitors is read-only");
  }

  get numPlugins() {
    return 0;
  }

  set numPlugins(_) {
    throw new Error("app.numPlugins is read-only");
  }

  get openInPlace() {
    return this.#openInPlace;
  }

  set openInPlace(val) {
    this.#openInPlace = val;
    /* TODO */
  }

  get platform() {
    return this.#platform;
  }

  set platform(_) {
    throw new Error("app.platform is read-only");
  }

  get plugins() {
    return [];
  }

  set plugins(_) {
    throw new Error("app.plugins is read-only");
  }

  get printColorProfiles() {
    return [];
  }

  set printColorProfiles(_) {
    throw new Error("app.printColorProfiles is read-only");
  }

  get printerNames() {
    return [];
  }

  set printerNames(_) {
    throw new Error("app.printerNames is read-only");
  }

  get runtimeHighlight() {
    return this.#runtimeHighlight;
  }

  set runtimeHighlight(val) {
    this.#runtimeHighlight = val;
    /* TODO */
  }

  get runtimeHighlightColor() {
    return this.#runtimeHighlightColor;
  }

  set runtimeHighlightColor(val) {
    if (isValidColor(val)) {
      this.#runtimeHighlightColor = val;
      /* TODO */
    }
  }

  get thermometer() {
    return this.#thermometer;
  }

  set thermometer(_) {
    throw new Error("app.thermometer is read-only");
  }

  get toolbar() {
    return this.#toolbar;
  }

  set toolbar(val) {
    this.#toolbar = val;
    /* TODO */
  }

  get toolbarHorizontal() {
    return this.toolbar;
  }

  set toolbarHorizontal(value) {
    /* has been deprecated and it's now equivalent to toolbar */
    this.toolbar = value;
  }

  get toolbarVertical() {
    return this.toolbar;
  }

  set toolbarVertical(value) {
    /* has been deprecated and it's now equivalent to toolbar */
    this.toolbar = value;
  }

  get viewerType() {
    return VIEWER_TYPE;
  }

  set viewerType(_) {
    throw new Error("app.viewerType is read-only");
  }

  get viewerVariation() {
    return VIEWER_VARIATION;
  }

  set viewerVariation(_) {
    throw new Error("app.viewerVariation is read-only");
  }

  get viewerVersion() {
    return VIEWER_VERSION;
  }

  set viewerVersion(_) {
    throw new Error("app.viewerVersion is read-only");
  }

  addMenuItem() {
    /* Not implemented */
  }

  addSubMenu() {
    /* Not implemented */
  }

  addToolButton() {
    /* Not implemented */
  }

  alert(
    cMsg,
    nIcon = 0,
    nType = 0,
    cTitle = "PDF.js",
    oDoc = null,
    oCheckbox = null
  ) {
    if (!this.#userActivationData.userActivation) {
      return 0;
    }
    this.#userActivationData.userActivation = false;

    if (cMsg && typeof cMsg === "object") {
      nType = cMsg.nType;
      cMsg = cMsg.cMsg;
    }
    cMsg = (cMsg || "").toString();
    if (!cMsg) {
      return 0;
    }
    nType =
      typeof nType !== "number" || isNaN(nType) || nType < 0 || nType > 3
        ? 0
        : nType;
    if (nType >= 2) {
      return this.#externalCall("confirm", [cMsg]) ? 4 : 3;
    }

    this.#externalCall("alert", [cMsg]);
    return 1;
  }

  beep() {
    /* Not implemented */
  }

  beginPriv() {
    /* Not implemented */
  }

  browseForDoc() {
    /* Not implemented */
  }

  clearInterval(oInterval) {
    this.#unregisterTimeout(oInterval);
  }

  clearTimeOut(oTime) {
    this.#unregisterTimeout(oTime);
  }

  endPriv() {
    /* Not implemented */
  }

  execDialog() {
    /* Not implemented */
  }

  execMenuItem(item) {
    if (!this.#userActivationData.userActivation) {
      return;
    }
    this.#userActivationData.userActivation = false;

    switch (item) {
      case "SaveAs":
        if (this.#userActivationData.disableSaving) {
          return;
        }
        this.#send({ command: item });
        break;
      case "FirstPage":
      case "LastPage":
      case "NextPage":
      case "PrevPage":
      case "ZoomViewIn":
      case "ZoomViewOut":
        this.#send({ command: item });
        break;
      case "FitPage":
        this.#send({ command: "zoom", value: "page-fit" });
        break;
      case "Print":
        if (this.#userActivationData.disablePrinting) {
          return;
        }
        this.#send({ command: "print" });
        break;
    }
  }

  getNthPlugInName() {
    /* Not implemented */
  }

  getPath() {
    /* Not implemented */
  }

  goBack() {
    /* TODO */
  }

  goForward() {
    /* TODO */
  }

  hideMenuItem() {
    /* Not implemented */
  }

  hideToolbarButton() {
    /* Not implemented */
  }

  launchURL() {
    /* Unsafe */
  }

  listMenuItems() {
    /* Not implemented */
  }

  listToolbarButtons() {
    /* Not implemented */
  }

  loadPolicyFile() {
    /* Not implemented */
  }

  mailGetAddrs() {
    /* Not implemented */
  }

  mailMsg() {
    /* TODO or not ? */
  }

  newDoc() {
    /* Not implemented */
  }

  newCollection() {
    /* Not implemented */
  }

  newFDF() {
    /* Not implemented */
  }

  openDoc() {
    /* Not implemented */
  }

  openFDF() {
    /* Not implemented */
  }

  popUpMenu() {
    /* Not implemented */
  }

  popUpMenuEx() {
    /* Not implemented */
  }

  removeToolButton() {
    /* Not implemented */
  }

  response(cQuestion, cTitle = "", cDefault = "", bPassword = "", cLabel = "") {
    if (!this.#userActivationData.userActivation) {
      return null;
    }
    this.#userActivationData.userActivation = false;

    if (cQuestion && typeof cQuestion === "object") {
      cDefault = cQuestion.cDefault;
      cQuestion = cQuestion.cQuestion;
    }
    cQuestion = (cQuestion || "").toString();
    cDefault = (cDefault || "").toString();
    return this.#externalCall("prompt", [cQuestion, cDefault || ""]);
  }

  setInterval(cExpr, nMilliseconds = 0) {
    if (cExpr && typeof cExpr === "object") {
      nMilliseconds = cExpr.nMilliseconds || 0;
      cExpr = cExpr.cExpr;
    }

    if (typeof cExpr !== "string") {
      throw new TypeError("First argument of app.setInterval must be a string");
    }
    if (typeof nMilliseconds !== "number") {
      throw new TypeError(
        "Second argument of app.setInterval must be a number"
      );
    }
    const callbackId = this.#registerTimeoutCallback(cExpr);
    this.#externalCall("setInterval", [callbackId, nMilliseconds]);
    return this.#registerTimeout(callbackId, true);
  }

  setTimeOut(cExpr, nMilliseconds = 0) {
    if (cExpr && typeof cExpr === "object") {
      nMilliseconds = cExpr.nMilliseconds || 0;
      cExpr = cExpr.cExpr;
    }

    if (typeof cExpr !== "string") {
      throw new TypeError("First argument of app.setTimeOut must be a string");
    }
    if (typeof nMilliseconds !== "number") {
      throw new TypeError("Second argument of app.setTimeOut must be a number");
    }
    const callbackId = this.#registerTimeoutCallback(cExpr);
    this.#externalCall("setTimeout", [callbackId, nMilliseconds]);
    return this.#registerTimeout(callbackId, false);
  }

  trustedFunction() {
    /* Not implemented */
  }

  trustPropagatorFunction() {
    /* Not implemented */
  }
}

export { App, AppInternals };
