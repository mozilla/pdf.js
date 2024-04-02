/* Copyright 2018 Mozilla Foundation
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

if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
  // eslint-disable-next-line no-var
  var compatibilityParams = Object.create(null);
  if (
    typeof PDFJSDev !== "undefined" &&
    PDFJSDev.test("LIB") &&
    typeof navigator === "undefined"
  ) {
    globalThis.navigator = Object.create(null);
  }
  const userAgent = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 1;

  const isAndroid = /Android/.test(userAgent);
  const isIOS =
    /\b(iPad|iPhone|iPod)(?=;)/.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1);

  // Limit canvas size to 5 mega-pixels on mobile.
  // Support: Android, iOS
  (function checkCanvasSizeLimitation() {
    if (isIOS || isAndroid) {
      compatibilityParams.maxCanvasPixels = 5242880;
    }
  })();
}

const OptionKind = {
  BROWSER: 0x01,
  VIEWER: 0x02,
  API: 0x04,
  WORKER: 0x08,
  PREFERENCE: 0x80,
};

/**
 * NOTE: These options are used to generate the `default_preferences.json` file,
 *       see `OptionKind.PREFERENCE`, hence the values below must use only
 *       primitive types and cannot rely on any imported types.
 */
const defaultOptions = {
  canvasMaxAreaInBytes: {
    /** @type {number} */
    value: -1,
    kind: OptionKind.BROWSER + OptionKind.API,
  },
  isInAutomation: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.BROWSER,
  },
  supportsCaretBrowsingMode: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.BROWSER,
  },
  supportsDocumentFonts: {
    /** @type {boolean} */
    value: true,
    kind: OptionKind.BROWSER,
  },
  supportsIntegratedFind: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.BROWSER,
  },
  supportsMouseWheelZoomCtrlKey: {
    /** @type {boolean} */
    value: true,
    kind: OptionKind.BROWSER,
  },
  supportsMouseWheelZoomMetaKey: {
    /** @type {boolean} */
    value: true,
    kind: OptionKind.BROWSER,
  },
  supportsPinchToZoom: {
    /** @type {boolean} */
    value: true,
    kind: OptionKind.BROWSER,
  },

  annotationEditorMode: {
    /** @type {number} */
    value: 0,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  annotationMode: {
    /** @type {number} */
    value: 2,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  cursorToolOnLoad: {
    /** @type {number} */
    value: 0,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  debuggerSrc: {
    /** @type {string} */
    value: "./debugger.mjs",
    kind: OptionKind.VIEWER,
  },
  defaultZoomDelay: {
    /** @type {number} */
    value: 400,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  defaultZoomValue: {
    /** @type {string} */
    value: "",
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  disableHistory: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.VIEWER,
  },
  disablePageLabels: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  enableHighlightEditor: {
    // We'll probably want to make some experiments before enabling this
    // in Firefox release, but it has to be temporary.
    // TODO: remove it when unnecessary.
    /** @type {boolean} */
    value: typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING"),
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  enableHighlightFloatingButton: {
    // We'll probably want to make some experiments before enabling this
    // in Firefox release, but it has to be temporary.
    // TODO: remove it when unnecessary.
    /** @type {boolean} */
    value: typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING"),
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  enableML: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  enablePermissions: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  enablePrintAutoRotate: {
    /** @type {boolean} */
    value: true,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  enableScripting: {
    /** @type {boolean} */
    value: typeof PDFJSDev === "undefined" || !PDFJSDev.test("CHROME"),
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  enableStampEditor: {
    // We'll probably want to make some experiments before enabling this
    // in Firefox release, but it has to be temporary.
    // TODO: remove it when unnecessary.
    /** @type {boolean} */
    value: true,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  externalLinkRel: {
    /** @type {string} */
    value: "noopener noreferrer nofollow",
    kind: OptionKind.VIEWER,
  },
  externalLinkTarget: {
    /** @type {number} */
    value: 0,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  highlightEditorColors: {
    /** @type {string} */
    value: "yellow=#FFFF98,green=#53FFBC,blue=#80EBFF,pink=#FFCBE6,red=#FF4F5F",
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  historyUpdateUrl: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  ignoreDestinationZoom: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  imageResourcesPath: {
    /** @type {string} */
    value:
      typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")
        ? "resource://pdf.js/web/images/"
        : "./images/",
    kind: OptionKind.VIEWER,
  },
  maxCanvasPixels: {
    /** @type {number} */
    value: 2 ** 25,
    kind: OptionKind.VIEWER,
  },
  forcePageColors: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  pageColorsBackground: {
    /** @type {string} */
    value: "Canvas",
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  pageColorsForeground: {
    /** @type {string} */
    value: "CanvasText",
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  pdfBugEnabled: {
    /** @type {boolean} */
    value: typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING"),
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  printResolution: {
    /** @type {number} */
    value: 150,
    kind: OptionKind.VIEWER,
  },
  sidebarViewOnLoad: {
    /** @type {number} */
    value: -1,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  scrollModeOnLoad: {
    /** @type {number} */
    value: -1,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  spreadModeOnLoad: {
    /** @type {number} */
    value: -1,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  textLayerMode: {
    /** @type {number} */
    value: 1,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  viewOnLoad: {
    /** @type {boolean} */
    value: 0,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },

  cMapPacked: {
    /** @type {boolean} */
    value: true,
    kind: OptionKind.API,
  },
  cMapUrl: {
    /** @type {string} */
    value:
      // eslint-disable-next-line no-nested-ternary
      typeof PDFJSDev === "undefined"
        ? "../external/bcmaps/"
        : PDFJSDev.test("MOZCENTRAL")
          ? "resource://pdf.js/web/cmaps/"
          : "../web/cmaps/",
    kind: OptionKind.API,
  },
  disableAutoFetch: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.API + OptionKind.PREFERENCE,
  },
  disableFontFace: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.API + OptionKind.PREFERENCE,
  },
  disableRange: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.API + OptionKind.PREFERENCE,
  },
  disableStream: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.API + OptionKind.PREFERENCE,
  },
  docBaseUrl: {
    /** @type {string} */
    value: "",
    kind: OptionKind.API,
  },
  enableXfa: {
    /** @type {boolean} */
    value: true,
    kind: OptionKind.API + OptionKind.PREFERENCE,
  },
  fontExtraProperties: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.API,
  },
  isEvalSupported: {
    /** @type {boolean} */
    value: true,
    kind: OptionKind.API,
  },
  isOffscreenCanvasSupported: {
    /** @type {boolean} */
    value: true,
    kind: OptionKind.API,
  },
  maxImageSize: {
    /** @type {number} */
    value: -1,
    kind: OptionKind.API,
  },
  pdfBug: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.API,
  },
  standardFontDataUrl: {
    /** @type {string} */
    value:
      // eslint-disable-next-line no-nested-ternary
      typeof PDFJSDev === "undefined"
        ? "../external/standard_fonts/"
        : PDFJSDev.test("MOZCENTRAL")
          ? "resource://pdf.js/web/standard_fonts/"
          : "../web/standard_fonts/",
    kind: OptionKind.API,
  },
  verbosity: {
    /** @type {number} */
    value: 1,
    kind: OptionKind.API,
  },

  workerPort: {
    /** @type {Object} */
    value: null,
    kind: OptionKind.WORKER,
  },
  workerSrc: {
    /** @type {string} */
    value:
      // eslint-disable-next-line no-nested-ternary
      typeof PDFJSDev === "undefined"
        ? "../src/pdf.worker.js"
        : PDFJSDev.test("MOZCENTRAL")
          ? "resource://pdf.js/build/pdf.worker.mjs"
          : "../build/pdf.worker.mjs",
    kind: OptionKind.WORKER,
  },
};
if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) {
  defaultOptions.defaultUrl = {
    /** @type {string} */
    value:
      typeof PDFJSDev !== "undefined" && PDFJSDev.test("CHROME")
        ? ""
        : "compressed.tracemonkey-pldi-09.pdf",
    kind: OptionKind.VIEWER,
  };
  defaultOptions.sandboxBundleSrc = {
    /** @type {string} */
    value:
      typeof PDFJSDev === "undefined"
        ? "../build/dev-sandbox/pdf.sandbox.mjs"
        : "../build/pdf.sandbox.mjs",
    kind: OptionKind.VIEWER,
  };
  defaultOptions.viewerCssTheme = {
    /** @type {number} */
    value: typeof PDFJSDev !== "undefined" && PDFJSDev.test("CHROME") ? 2 : 0,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  };
}
if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
  defaultOptions.disablePreferences = {
    /** @type {boolean} */
    value: typeof PDFJSDev !== "undefined" && PDFJSDev.test("TESTING"),
    kind: OptionKind.VIEWER,
  };
  defaultOptions.locale = {
    /** @type {string} */
    value: navigator.language || "en-US",
    kind: OptionKind.VIEWER,
  };
} else if (PDFJSDev.test("CHROME")) {
  defaultOptions.disableTelemetry = {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  };
}

const userOptions = Object.create(null);

if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
  // Apply any compatibility-values to the user-options,
  // see also `AppOptions.remove` below.
  for (const name in compatibilityParams) {
    userOptions[name] = compatibilityParams[name];
  }
}

if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING || LIB")) {
  // Ensure that the `defaultOptions` are correctly specified.
  for (const name in defaultOptions) {
    const { value, kind } = defaultOptions[name];

    if (kind & OptionKind.PREFERENCE) {
      if (kind === OptionKind.PREFERENCE) {
        throw new Error(`Cannot use only "PREFERENCE" kind: ${name}`);
      }
      if (kind & OptionKind.BROWSER) {
        throw new Error(`Cannot mix "PREFERENCE" and "BROWSER" kind: ${name}`);
      }
      if (
        typeof compatibilityParams === "object" &&
        compatibilityParams[name] !== undefined
      ) {
        throw new Error(
          `Should not have compatibility-value for "PREFERENCE" kind: ${name}`
        );
      }
      // Only "simple" preference-values are allowed.
      if (
        typeof value !== "boolean" &&
        typeof value !== "string" &&
        !Number.isInteger(value)
      ) {
        throw new Error(`Invalid value for "PREFERENCE" kind: ${name}`);
      }
    }
  }
}

class AppOptions {
  constructor() {
    throw new Error("Cannot initialize AppOptions.");
  }

  static get(name) {
    return userOptions[name] ?? defaultOptions[name]?.value ?? undefined;
  }

  static getAll(kind = null, defaultOnly = false) {
    const options = Object.create(null);
    for (const name in defaultOptions) {
      const defaultOption = defaultOptions[name];

      if (kind && !(kind & defaultOption.kind)) {
        continue;
      }
      options[name] = defaultOnly
        ? defaultOption.value
        : userOptions[name] ?? defaultOption.value;
    }
    return options;
  }

  static set(name, value) {
    userOptions[name] = value;
  }

  static setAll(options, init = false) {
    if ((typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) && init) {
      if (this.get("disablePreferences")) {
        // Give custom implementations of the default viewer a simpler way to
        // opt-out of having the `Preferences` override existing `AppOptions`.
        return;
      }
      for (const name in userOptions) {
        // Ignore any compatibility-values in the user-options.
        if (compatibilityParams[name] !== undefined) {
          continue;
        }
        console.warn(
          "setAll: The Preferences may override manually set AppOptions; " +
            'please use the "disablePreferences"-option in order to prevent that.'
        );
        break;
      }
    }

    for (const name in options) {
      userOptions[name] = options[name];
    }
  }

  static remove(name) {
    delete userOptions[name];

    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
      // Re-apply a compatibility-value, if it exists, to the user-options.
      const val = compatibilityParams[name];
      if (val !== undefined) {
        userOptions[name] = val;
      }
    }
  }
}

export { AppOptions, OptionKind };
