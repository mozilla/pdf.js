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

import "./fullscreen.js";
import "./thermometer.js";

globalThis.App = class App {
  static claimInternals() {
    delete App.claimInternals;
    return instance => ({
      evalCallback: instance.#evalCallback.bind(instance),
    });
  }

  #constants = null;

  #focusRect = true;

  #fs = null;

  #language;

  #openInPlace = false;

  #platform;

  #runtimeHighlight = false;

  #runtimeHighlightColor = ["T"];

  #thermometer = null;

  #toolbar = false;

  #doc;

  #timeoutIds;

  #timeoutIdsRegistry;

  #timeoutCallbackIds;

  #timeoutCallbackId;

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

    this.#timeoutIds = new WeakMap();
    // About setTimeOut/setInterval return values (specs):
    //   The return value of this method must be held in a
    //   JavaScript variable.
    //   Otherwise, the timeout object is subject to garbage-collection,
    //   which would cause the clock to stop.
    this.#timeoutIdsRegistry = new FinalizationRegistry(
      this.#cleanTimeout.bind(this)
    );

    this.#timeoutCallbackIds = new Map();
    // User activation callback id is 0.
    this.#timeoutCallbackId = 1;
    this.#globalEval = data.globalEval;
    this.#externalCall = data.externalCall;

    this.#fs = new globalThis.FullScreen();
    delete globalThis.FullScreen;
    this.#thermometer = new globalThis.Thermometer();
    delete globalThis.Thermometer;
  }

  #registerTimeoutCallback(cExpr) {
    const id = this.#timeoutCallbackId++;
    this.#timeoutCallbackIds.set(id, cExpr);
    return id;
  }

  #unregisterTimeoutCallback(id) {
    this.#timeoutCallbackIds.delete(id);
  }

  #evalCallback({ callbackId, interval }) {
    const USERACTIVATION_CALLBACKID = 0;
    if (callbackId === USERACTIVATION_CALLBACKID) {
      // Special callback id for userActivation stuff.
      this.#userActivationData.userActivation = false;
      return;
    }
    const expr = this.#timeoutCallbackIds.get(callbackId);
    if (!interval) {
      this.#unregisterTimeoutCallback(callbackId);
    }

    if (expr) {
      const saveUserActivation = this.#userActivationData.userActivation;
      // A setTimeout/setInterval callback is executed so it can't be a user
      // choice.
      this.#userActivationData.userActivation = false;
      this.#globalEval(expr);
      this.#userActivationData.userActivation = saveUserActivation;
    }
  }

  #registerTimeout(callbackId, interval) {
    const timeout = Object.create(null);
    const id = { callbackId, interval };
    this.#timeoutIds.set(timeout, id);
    this.#timeoutIdsRegistry.register(timeout, id);
    return timeout;
  }

  #unregisterTimeout(timeout) {
    this.#timeoutIdsRegistry.unregister(timeout);

    const data = this.#timeoutIds.get(timeout);
    if (!data) {
      return;
    }

    this.#timeoutIds.delete(timeout);
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
    return 21.00720099;
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
    if (globalThis.color._isValidColor(val)) {
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
    return "PDF.js";
  }

  set viewerType(_) {
    throw new Error("app.viewerType is read-only");
  }

  get viewerVariation() {
    return "Full";
  }

  set viewerVariation(_) {
    throw new Error("app.viewerVariation is read-only");
  }

  get viewerVersion() {
    return 21.00720099;
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
};

export {};
