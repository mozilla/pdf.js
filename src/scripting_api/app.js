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
  FORMS_VERSION,
  USERACTIVATION_CALLBACKID,
  VIEWER_TYPE,
  VIEWER_VARIATION,
  VIEWER_VERSION,
} from "./app_utils.js";
import { Color } from "./color.js";
import { EventDispatcher } from "./event.js";
import { FullScreen } from "./fullscreen.js";
import { PDFObject } from "./pdf_object.js";
import { Thermometer } from "./thermometer.js";

/**
 * Class representing the App.
 * @extends PDFObject
 */
class App extends PDFObject {
  constructor(data) {
    super(data);

    this._constants = null;
    this._focusRect = true;
    this._fs = null;
    this._language = App._getLanguage(data.language);
    this._openInPlace = false;
    this._platform = App._getPlatform(data.platform);
    this._runtimeHighlight = false;
    this._runtimeHighlightColor = ["T"];
    this._thermometer = null;
    this._toolbar = false;

    this._document = data._document;
    this._proxyHandler = data.proxyHandler;
    this._objects = Object.create(null);
    this._eventDispatcher = new EventDispatcher(
      this._document,
      data.calculationOrder,
      this._objects,
      data.externalCall
    );

    this._timeoutIds = new WeakMap();
    this._timeoutIdsRegistry = typeof FinalizationRegistry !== "undefined"
      ? new FinalizationRegistry(this._cleanTimeout.bind(this))
      : null;

    this._timeoutCallbackIds = new Map();
    this._timeoutCallbackId = USERACTIVATION_CALLBACKID + 1;
    this._globalEval = data.globalEval;
    this._externalCall = data.externalCall;
  }

  /**
   * Dispatches an event.
   * @param {Object} pdfEvent - The PDF event.
   */
  _dispatchEvent(pdfEvent) {
    this._eventDispatcher.dispatch(pdfEvent);
  }

  /**
   * Registers a timeout callback.
   * @param {string} cExpr - The callback expression.
   * @returns {number} The callback ID.
   */
  _registerTimeoutCallback(cExpr) {
    const id = this._timeoutCallbackId++;
    this._timeoutCallbackIds.set(id, cExpr);
    return id;
  }

  /**
   * Unregisters a timeout callback.
   * @param {number} id - The callback ID.
   */
  _unregisterTimeoutCallback(id) {
    this._timeoutCallbackIds.delete(id);
  }

  /**
   * Evaluates a callback.
   * @param {Object} param - The callback parameters.
   * @param {number} param.callbackId - The callback ID.
   * @param {boolean} param.interval - Whether the callback is an interval.
   */
  _evalCallback({ callbackId, interval }) {
    if (callbackId === USERACTIVATION_CALLBACKID) {
      this._document.obj._userActivation = false;
      return;
    }
    const expr = this._timeoutCallbackIds.get(callbackId);
    if (!interval) {
      this._unregisterTimeoutCallback(callbackId);
    }

    if (expr) {
      this._globalEval(expr);
    }
  }

  /**
   * Registers a timeout.
   * @param {number} callbackId - The callback ID.
   * @param {boolean} interval - Whether the timeout is an interval.
   * @returns {Object} The timeout.
   */
  _registerTimeout(callbackId, interval) {
    const timeout = Object.create(null);
    const id = { callbackId, interval };
    this._timeoutIds.set(timeout, id);
    this._timeoutIdsRegistry?.register(timeout, id);
    return timeout;
  }

  /**
   * Unregisters a timeout.
   * @param {Object} timeout - The timeout.
   */
  _unregisterTimeout(timeout) {
    this._timeoutIdsRegistry?.unregister(timeout);

    const data = this._timeoutIds.get(timeout);
    if (!data) {
      return;
    }

    this._timeoutIds.delete(timeout);
    this._cleanTimeout(data);
  }

  /**
   * Cleans a timeout.
   * @param {Object} param - The timeout parameters.
   * @param {number} param.callbackId - The callback ID.
   * @param {boolean} param.interval - Whether the timeout is an interval.
   */
  _cleanTimeout({ callbackId, interval }) {
    this._unregisterTimeoutCallback(callbackId);

    if (interval) {
      this._externalCall("clearInterval", [callbackId]);
    } else {
      this._externalCall("clearTimeout", [callbackId]);
    }
  }

  /**
   * Gets the platform.
   * @param {string} platform - The platform string.
   * @returns {string} The platform.
   */
  static _getPlatform(platform) {
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

  /**
   * Gets the language.
   * @param {string} language - The language string.
   * @returns {string} The language.
   */
  static _getLanguage(language) {
    const [main, sub] = language.toLowerCase().split(/[-_]/);
    switch (main) {
      case "zh":
        return sub === "cn" || sub === "sg" ? "CHS" : "CHT";
      case "da": return "DAN";
      case "de": return "DEU";
      case "es": return "ESP";
      case "fr": return "FRA";
      case "it": return "ITA";
      case "ko": return "KOR";
      case "ja": return "JPN";
      case "nl": return "NLD";
      case "no": return "NOR";
      case "pt": return sub === "br" ? "PTB" : "ENU";
      case "fi": return "SUO";
      case "sv": return "SVE";
      default: return "ENU";
    }
  }

  get activeDocs() {
    return [this._document.wrapped];
  }

  set activeDocs(_) {
    throw new Error("app.activeDocs is read-only");
  }

  get calculate() {
    return this._document.obj.calculate;
  }

  set calculate(calculate) {
    this._document.obj.calculate = calculate;
  }

  get constants() {
    if (!this._constants) {
      this._constants = Object.freeze({
        align: Object.freeze({
          left: 0,
          center: 1,
          right: 2,
          top: 3,
          bottom: 4,
        }),
      });
    }
    return this._constants;
  }

  set constants(_) {
    throw new Error("app.constants is read-only");
  }

  get focusRect() {
    return this._focusRect;
  }

  set focusRect(val) {
    this._focusRect = val;
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
    if (this._fs === null) {
      this._fs = new Proxy(
        new FullScreen({ send: this._send }),
        this._proxyHandler
      );
    }
    return this._fs;
  }

  set fs(_) {
    throw new Error("app.fs is read-only");
  }

  get language() {
    return this._language;
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
    return this._openInPlace;
  }

  set openInPlace(val) {
    this._openInPlace = val;
  }

  get platform() {
    return this._platform;
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
    return this._runtimeHighlight;
  }

  set runtimeHighlight(val) {
    this._runtimeHighlight = val;
  }

  get runtimeHighlightColor() {
    return this._runtimeHighlightColor;
  }

  set runtimeHighlightColor(val) {
    if (Color._isValidColor(val)) {
      this._runtimeHighlightColor = val;
    }
  }

  get thermometer() {
    if (this._thermometer === null) {
      this._thermometer = new Proxy(
        new Thermometer({ send: this._send }),
        this._proxyHandler
      );
    }
    return this._thermometer;
  }

  set thermometer(_) {
    throw new Error("app.thermometer is read-only");
  }

  get toolbar() {
    return this._toolbar;
  }

  set toolbar(val) {
    this._toolbar = val;
  }

  get toolbarHorizontal() {
    return this.toolbar;
  }

  set toolbarHorizontal(value) {
    this.toolbar = value;
  }

  get toolbarVertical() {
    return this.toolbar;
  }

  set toolbarVertical(value) {
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

  /**
   * Displays an alert dialog.
   * @param {string|Object} cMsg - The message or an object containing the message and type.
   * @param {number} [nIcon=0] - The icon type.
   * @param {number} [nType=0] - The dialog type.
   * @param {string} [cTitle="PDF.js"] - The dialog title.
   * @param {Object} [oDoc=null] - The document object.
   * @param {Object} [oCheckbox=null] - The checkbox object.
   * @returns {number} The response code.
   */
  alert(
    cMsg,
    nIcon = 0,
    nType = 0,
    cTitle = "PDF.js",
    oDoc = null,
    oCheckbox = null
  ) {
    if (!this._document.obj._userActivation) {
      return 0;
    }
    this._document.obj._userActivation = false;

    if (typeof cMsg === "object") {
      nType = cMsg.nType;
      cMsg = cMsg.cMsg;
    }
    cMsg = (cMsg || "").toString();
    if (!cMsg) {
      return 0;
    }
    nType = typeof nType !== "number" || isNaN(nType) || nType < 0 || nType > 3 ? 0 : nType;
    if (nType >= 2) {
      return this._externalCall("confirm", [cMsg]) ? 4 : 3;
    }

    this._externalCall("alert", [cMsg]);
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
    this._unregisterTimeout(oInterval);
  }

  clearTimeOut(oTime) {
    this._unregisterTimeout(oTime);
  }

  endPriv() {
    /* Not implemented */
  }

  execDialog() {
    /* Not implemented */
  }

  execMenuItem(item) {
    if (!this._document.obj._userActivation) {
      return;
    }
    this._document.obj._userActivation = false;

    switch (item) {
      case "SaveAs":
        if (this._document.obj._disableSaving) {
          return;
        }
        this._send({ command: item });
        break;
      case "FirstPage":
      case "LastPage":
      case "NextPage":
      case "PrevPage":
      case "ZoomViewIn":
      case "ZoomViewOut":
        this._send({ command: item });
        break;
      case "FitPage":
        this._send({ command: "zoom", value: "page-fit" });
        break;
      case "Print":
        if (this._document.obj._disablePrinting) {
          return;
        }
        this._send({ command: "print" });
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

  /**
   * Prompts the user with a question.
   * @param {string|Object} cQuestion - The question or an object containing the question and default answer.
   * @param {string} [cTitle=""] - The dialog title.
   * @param {string} [cDefault=""] - The default answer.
   * @param {boolean} [bPassword=""] - Whether the input is a password.
   * @param {string} [cLabel=""] - The label.
   * @returns {string} The user's response.
   */
  response(cQuestion, cTitle = "", cDefault = "", bPassword = "", cLabel = "") {
    if (typeof cQuestion === "object") {
      cDefault = cQuestion.cDefault;
      cQuestion = cQuestion.cQuestion;
    }
    cQuestion = (cQuestion || "").toString();
    cDefault = (cDefault || "").toString();
    return this._externalCall("prompt", [cQuestion, cDefault || ""]);
  }

  /**
   * Sets an interval callback.
   * @param {string|Object} cExpr - The callback expression or an object containing the expression and interval.
   * @param {number} [nMilliseconds=0] - The interval in milliseconds.
   * @returns {Object} The interval object.
   */
  setInterval(cExpr, nMilliseconds = 0) {
    if (typeof cExpr === "object") {
      nMilliseconds = cExpr.nMilliseconds || 0;
      cExpr = cExpr.cExpr;
    }

    if (typeof cExpr !== "string") {
      throw new TypeError("First argument of app.setInterval must be a string");
    }
    if (typeof nMilliseconds !== "number") {
      throw new TypeError("Second argument of app.setInterval must be a number");
    }
    const callbackId = this._registerTimeoutCallback(cExpr);
    this._externalCall("setInterval", [callbackId, nMilliseconds]);
    return this._registerTimeout(callbackId, true);
  }

  /**
   * Sets a timeout callback.
   * @param {string|Object} cExpr - The callback expression or an object containing the expression and timeout.
   * @param {number} [nMilliseconds=0] - The timeout in milliseconds.
   * @returns {Object} The timeout object.
   */
  setTimeOut(cExpr, nMilliseconds = 0) {
    if (typeof cExpr === "object") {
      nMilliseconds = cExpr.nMilliseconds || 0;
      cExpr = cExpr.cExpr;
    }

    if (typeof cExpr !== "string") {
      throw new TypeError("First argument of app.setTimeOut must be a string");
    }
    if (typeof nMilliseconds !== "number") {
      throw new TypeError("Second argument of app.setTimeOut must be a number");
    }
    const callbackId = this._registerTimeoutCallback(cExpr);
    this._externalCall("setTimeout", [callbackId, nMilliseconds]);
    return this._registerTimeout(callbackId, false);
  }

  trustedFunction() {
    /* Not implemented */
  }

  trustPropagatorFunction() {
    /* Not implemented */
  }
}

export { App };
