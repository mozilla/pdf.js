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

import { Color } from "./color.js";
import { EventDispatcher } from "./event.js";
import { FullScreen } from "./fullscreen.js";
import { PDFObject } from "./pdf_object.js";
import { Thermometer } from "./thermometer.js";

const VIEWER_TYPE = "PDF.js";
const VIEWER_VARIATION = "Full";
const VIEWER_VERSION = "10.0";
const FORMS_VERSION = undefined;

class App extends PDFObject {
  constructor(data) {
    super(data);

    this.calculate = true;

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
      this._objects
    );
    this._setTimeout = data.setTimeout;
    this._clearTimeout = data.clearTimeout;
    this._setInterval = data.setInterval;
    this._clearInterval = data.clearInterval;
    this._timeoutIds = null;
    this._timeoutIdsRegistry = null;

    // used in proxy.js to check that this is the object with the backdoor
    this._isApp = true;
  }

  // This function is called thanks to the proxy
  // when we call app['random_string'] to dispatch the event.
  _dispatchEvent(pdfEvent) {
    this._eventDispatcher.dispatch(pdfEvent);
  }

  _registerTimeout(timeout, id, interval) {
    if (!this._timeoutIds) {
      this._timeoutIds = new WeakMap();
      // FinalizationRegistry isn't implemented in QuickJS
      // eslint-disable-next-line no-undef
      if (typeof FinalizationRegistry !== "undefined") {
        // About setTimeOut/setInterval return values (specs):
        //   The return value of this method must be held in a
        //   JavaScript variable.
        //   Otherwise, the timeout object is subject to garbage-collection,
        //   which would cause the clock to stop.

        // eslint-disable-next-line no-undef
        this._timeoutIdsRegistry = new FinalizationRegistry(
          ([timeoutId, isInterval]) => {
            if (isInterval) {
              this._clearInterval(timeoutId);
            } else {
              this._clearTimeout(timeoutId);
            }
          }
        );
      }
    }
    this._timeoutIds.set(timeout, [id, interval]);
    if (this._timeoutIdsRegistry) {
      this._timeoutIdsRegistry.register(timeout, [id, interval]);
    }
  }

  _unregisterTimeout(timeout) {
    if (!this._timeoutIds || !this._timeoutIds.has(timeout)) {
      return;
    }
    const [id, interval] = this._timeoutIds.get(timeout);
    if (this._timeoutIdsRegistry) {
      this._timeoutIdsRegistry.unregister(timeout);
    }
    this._timeoutIds.delete(timeout);

    if (interval) {
      this._clearInterval(id);
    } else {
      this._clearTimeout(id);
    }
  }

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

  static _getLanguage(language) {
    const [main, sub] = language.toLowerCase().split(/[-_]/);
    switch (main) {
      case "zh":
        if (sub === "cn" || sub === "sg") {
          return "CHS";
        }
        return "CHT";
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
        if (sub === "br") {
          return "PTB";
        }
        return "ENU";
      case "fi":
        return "SUO";
      case "SV":
        return "SVE";
      default:
        return "ENU";
    }
  }

  get activeDocs() {
    return [this._document.wrapped];
  }

  set activeDocs(_) {
    throw new Error("app.activeDocs is read-only");
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
    /* TODO or not */
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
    /* TODO */
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
    /* TODO */
  }

  get runtimeHighlightColor() {
    return this._runtimeHighlightColor;
  }

  set runtimeHighlightColor(val) {
    if (Color._isValidColor(val)) {
      this._runtimeHighlightColor = val;
      /* TODO */
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
    this._send({ command: "alert", value: cMsg });
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
    this.unregisterTimeout(oInterval);
  }

  clearTimeOut(oTime) {
    this.unregisterTimeout(oTime);
  }

  endPriv() {
    /* Not implemented */
  }

  execDialog() {
    /* Not implemented */
  }

  execMenuItem() {
    /* Not implemented */
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

  response() {
    /* TODO or not */
  }

  setInterval(cExpr, nMilliseconds) {
    if (typeof cExpr !== "string") {
      throw new TypeError("First argument of app.setInterval must be a string");
    }
    if (typeof nMilliseconds !== "number") {
      throw new TypeError(
        "Second argument of app.setInterval must be a number"
      );
    }

    const id = this._setInterval(cExpr, nMilliseconds);
    const timeout = Object.create(null);
    this._registerTimeout(timeout, id, true);
    return timeout;
  }

  setTimeOut(cExpr, nMilliseconds) {
    if (typeof cExpr !== "string") {
      throw new TypeError("First argument of app.setTimeOut must be a string");
    }
    if (typeof nMilliseconds !== "number") {
      throw new TypeError("Second argument of app.setTimeOut must be a number");
    }

    const id = this._setTimeout(cExpr, nMilliseconds);
    const timeout = Object.create(null);
    this._registerTimeout(timeout, id, false);
    return timeout;
  }

  trustedFunction() {
    /* Not implemented */
  }

  trustPropagatorFunction() {
    /* Not implemented */
  }
}

export { App };
