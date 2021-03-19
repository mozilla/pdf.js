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

import { viewerCompatibilityParams } from "./viewer_compatibility.js";

const OptionKind = {
  VIEWER: 0x02,
  API: 0x04,
  WORKER: 0x08,
  PREFERENCE: 0x80,
};

/**
 * PLEASE NOTE: To avoid introducing unnecessary dependencies, we specify the
 *              values below *explicitly* rather than relying on imported types.
 */
const defaultOptions = {
  cursorToolOnLoad: {
    /** @type {number} */
    value: 0,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  defaultUrl: {
    /** @type {string} */
    value: "compressed.tracemonkey-pldi-09.pdf",
    kind: OptionKind.VIEWER,
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
  /**
   * The `disablePreferences` is, conditionally, defined below.
   */
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
    value: true,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  enableWebGL: {
    /** @type {boolean} */
    value: false,
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
    value: "./images/",
    kind: OptionKind.VIEWER,
  },
  /**
   * The `locale` is, conditionally, defined below.
   */
  maxCanvasPixels: {
    /** @type {number} */
    value: 16777216,
    compatibility: viewerCompatibilityParams.maxCanvasPixels,
    kind: OptionKind.VIEWER,
  },
  pdfBugEnabled: {
    /** @type {boolean} */
    value: typeof PDFJSDev === "undefined" || !PDFJSDev.test("PRODUCTION"),
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  printResolution: {
    /** @type {number} */
    value: 150,
    kind: OptionKind.VIEWER,
  },
  renderer: {
    /** @type {string} */
    value: "canvas",
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  renderInteractiveForms: {
    /** @type {boolean} */
    value: true,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
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
  useOnlyCssZoom: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE,
  },
  viewerCssTheme: {
    /** @type {number} */
    value: 0,
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
      typeof PDFJSDev === "undefined" || !PDFJSDev.test("PRODUCTION")
        ? "../external/bcmaps/"
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
    value: false,
    kind: OptionKind.API,
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
      typeof PDFJSDev === "undefined" || !PDFJSDev.test("PRODUCTION")
        ? "../src/worker_loader.js"
        : "../build/pdf.worker.js",
    kind: OptionKind.WORKER,
  },
};
if (
  typeof PDFJSDev === "undefined" ||
  PDFJSDev.test("!PRODUCTION || GENERIC")
) {
  defaultOptions.disablePreferences = {
    /** @type {boolean} */
    value: typeof PDFJSDev !== "undefined" && PDFJSDev.test("TESTING"),
    kind: OptionKind.VIEWER,
  };
  defaultOptions.locale = {
    /** @type {string} */
    value: typeof navigator !== "undefined" ? navigator.language : "en-US",
    kind: OptionKind.VIEWER,
  };
  defaultOptions.sandboxBundleSrc = {
    /** @type {string} */
    value:
      typeof PDFJSDev === "undefined" || !PDFJSDev.test("PRODUCTION")
        ? "../build/dev-sandbox/pdf.sandbox.js"
        : "../build/pdf.sandbox.js",
    kind: OptionKind.VIEWER,
  };
} else if (PDFJSDev.test("CHROME")) {
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
      return defaultOption.compatibility ?? defaultOption.value;
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
          : defaultOption.compatibility ?? defaultOption.value;
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

export { AppOptions, OptionKind };
