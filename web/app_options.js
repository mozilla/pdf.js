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

const compatibilityParams = Object.create(null);
if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
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
    value: 16777216,
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
    value: typeof PDFJSDev === "undefined",
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
  viewerCssTheme: {
    /** @type {number} */
    value: typeof PDFJSDev !== "undefined" && PDFJSDev.test("CHROME") ? 2 : 0,
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
        ? "resource://pdf.js/build/pdf.worker.js"
        : "../build/pdf.worker.js",
    kind: OptionKind.WORKER,
  },
};
if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
  defaultOptions.defaultUrl = {
    /** @type {string} */
    value: "compressed.tracemonkey-pldi-09.pdf",
    kind: OptionKind.VIEWER,
  };
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
  defaultOptions.sandboxBundleSrc = {
    /** @type {string} */
    value:
      typeof PDFJSDev === "undefined"
        ? "../build/dev-sandbox/pdf.sandbox.js"
        : "../build/pdf.sandbox.js",
    kind: OptionKind.VIEWER,
  };
} else if (PDFJSDev.test("CHROME")) {
  defaultOptions.defaultUrl = {
    /** @type {string} */
    value: "",
    kind: OptionKind.VIEWER,
  };
  defaultOptions.disableTelemetry = {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  };
  defaultOptions.sandboxBundleSrc = {
    /** @type {string} */
    value: "../build/pdf.sandbox.js",
    kind: OptionKind.VIEWER,
  };
}

const userOptions = Object.create(null);

class AppOptions {
  constructor() {
    throw new Error("Cannot initialize AppOptions.");
  }

  static get(name) {
    const userOption = userOptions[name];
    if (userOption !== undefined) {
      return userOption;
    }
    const defaultOption = defaultOptions[name];
    if (defaultOption !== undefined) {
      return compatibilityParams[name] ?? defaultOption.value;
    }
    return undefined;
  }

  static getAll(kind = null) {
    const options = Object.create(null);
    for (const name in defaultOptions) {
      const defaultOption = defaultOptions[name];
      if (kind) {
        if ((kind & defaultOption.kind) === 0) {
          continue;
        }
        if (kind === OptionKind.PREFERENCE) {
          const value = defaultOption.value,
            valueType = typeof value;

          if (
            valueType === "boolean" ||
            valueType === "string" ||
            (valueType === "number" && Number.isInteger(value))
          ) {
            options[name] = value;
            continue;
          }
          throw new Error(`Invalid type for preference: ${name}`);
        }
      }
      const userOption = userOptions[name];
      options[name] =
        userOption !== undefined
          ? userOption
          : compatibilityParams[name] ?? defaultOption.value;
    }
    return options;
  }

  static set(name, value) {
    userOptions[name] = value;
  }

  static setAll(options) {
    for (const name in options) {
      userOptions[name] = options[name];
    }
  }

  static remove(name) {
    delete userOptions[name];
  }
}

if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
  AppOptions._hasUserOptions = function () {
    return Object.keys(userOptions).length > 0;
  };
}

export { AppOptions, compatibilityParams, OptionKind };
