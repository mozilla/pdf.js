/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.OptionKind = exports.AppOptions = void 0;

var _pdf = require("../pdf");

var _viewer_compatibility = require("./viewer_compatibility.js");

const OptionKind = {
  VIEWER: 0x02,
  API: 0x04,
  WORKER: 0x08,
  PREFERENCE: 0x80
};
exports.OptionKind = OptionKind;
const defaultOptions = {
  cursorToolOnLoad: {
    value: 0,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  defaultUrl: {
    value: "compressed.tracemonkey-pldi-09.pdf",
    kind: OptionKind.VIEWER
  },
  defaultZoomValue: {
    value: "",
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  disableHistory: {
    value: false,
    kind: OptionKind.VIEWER
  },
  disablePageLabels: {
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  enablePrintAutoRotate: {
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  enableWebGL: {
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  eventBusDispatchToDOM: {
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  externalLinkRel: {
    value: "noopener noreferrer nofollow",
    kind: OptionKind.VIEWER
  },
  externalLinkTarget: {
    value: 0,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  historyUpdateUrl: {
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  ignoreDestinationZoom: {
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  imageResourcesPath: {
    value: "./images/",
    kind: OptionKind.VIEWER
  },
  maxCanvasPixels: {
    value: 16777216,
    compatibility: _viewer_compatibility.viewerCompatibilityParams.maxCanvasPixels,
    kind: OptionKind.VIEWER
  },
  pdfBugEnabled: {
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  renderer: {
    value: "canvas",
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  renderInteractiveForms: {
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  sidebarViewOnLoad: {
    value: -1,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  scrollModeOnLoad: {
    value: -1,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  spreadModeOnLoad: {
    value: -1,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  textLayerMode: {
    value: 1,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  useOnlyCssZoom: {
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  viewOnLoad: {
    value: 0,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  cMapPacked: {
    value: true,
    kind: OptionKind.API
  },
  cMapUrl: {
    value: "../web/cmaps/",
    kind: OptionKind.API
  },
  disableAutoFetch: {
    value: false,
    kind: OptionKind.API + OptionKind.PREFERENCE
  },
  disableCreateObjectURL: {
    value: false,
    compatibility: _pdf.apiCompatibilityParams.disableCreateObjectURL,
    kind: OptionKind.API
  },
  disableFontFace: {
    value: false,
    kind: OptionKind.API + OptionKind.PREFERENCE
  },
  disableRange: {
    value: false,
    kind: OptionKind.API + OptionKind.PREFERENCE
  },
  disableStream: {
    value: false,
    kind: OptionKind.API + OptionKind.PREFERENCE
  },
  docBaseUrl: {
    value: "",
    kind: OptionKind.API
  },
  isEvalSupported: {
    value: true,
    kind: OptionKind.API
  },
  maxImageSize: {
    value: -1,
    kind: OptionKind.API
  },
  pdfBug: {
    value: false,
    kind: OptionKind.API
  },
  verbosity: {
    value: 1,
    kind: OptionKind.API
  },
  workerPort: {
    value: null,
    kind: OptionKind.WORKER
  },
  workerSrc: {
    value: "../build/pdf.worker.js",
    kind: OptionKind.WORKER
  }
};
;
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
      return defaultOption.compatibility || defaultOption.value;
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

          if (valueType === "boolean" || valueType === "string" || valueType === "number" && Number.isInteger(value)) {
            options[name] = value;
            continue;
          }

          throw new Error(`Invalid type for preference: ${name}`);
        }
      }

      const userOption = userOptions[name];
      options[name] = userOption !== undefined ? userOption : defaultOption.compatibility || defaultOption.value;
    }

    return options;
  }

  static set(name, value) {
    userOptions[name] = value;
  }

  static remove(name) {
    delete userOptions[name];
  }

}

exports.AppOptions = AppOptions;