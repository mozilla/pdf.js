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

import { apiCompatibilityParams } from 'pdfjs-lib';
import { viewerCompatibilityParams } from './viewer_compatibility';

const OptionKind = {
  VIEWER: 'viewer',
  API: 'api',
  WORKER: 'worker',
};

/**
 * PLEASE NOTE: To avoid introducing unnecessary dependencies, we specify the
 *              values below *explicitly* rather than relying on imported types;
 *              compare with the format of `default_preferences.json`.
 */
const defaultOptions = {
  cursorToolOnLoad: {
    /** @type {number} */
    value: 0,
    kind: OptionKind.VIEWER,
  },
  defaultUrl: {
    /** @type {string} */
    value: 'compressed.tracemonkey-pldi-09.pdf',
    kind: OptionKind.VIEWER,
  },
  defaultZoomValue: {
    /** @type {string} */
    value: '',
    kind: OptionKind.VIEWER,
  },
  disableHistory: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.VIEWER,
  },
  disablePageLabels: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.VIEWER,
  },
  disablePageMode: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.VIEWER,
  },
  enablePrintAutoRotate: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.VIEWER,
  },
  enableWebGL: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.VIEWER,
  },
  eventBusDispatchToDOM: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.VIEWER,
  },
  externalLinkRel: {
    /** @type {string} */
    value: 'noopener noreferrer nofollow',
    kind: OptionKind.VIEWER,
  },
  externalLinkTarget: {
    /** @type {number} */
    value: 0,
    kind: OptionKind.VIEWER,
  },
  imageResourcesPath: {
    /** @type {string} */
    value: './images/',
    kind: OptionKind.VIEWER,
  },
  /**
   * The `locale` is, conditionally, defined below.
   */
  maxCanvasPixels: {
    /** @type {number} */
    value: viewerCompatibilityParams.maxCanvasPixels || 16777216,
    kind: OptionKind.VIEWER,
  },
  pdfBugEnabled: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.VIEWER,
  },
  renderer: {
    /** @type {string} */
    value: 'canvas',
    kind: OptionKind.VIEWER,
  },
  renderInteractiveForms: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.VIEWER,
  },
  showPreviousViewOnLoad: {
    /** @type {boolean} */
    value: true,
    kind: OptionKind.VIEWER,
  },
  sidebarViewOnLoad: {
    /** @type {number} */
    value: 0,
    kind: OptionKind.VIEWER,
  },
  scrollModeOnLoad: {
    /** @type {number} */
    value: 0,
    kind: OptionKind.VIEWER,
  },
  spreadModeOnLoad: {
    /** @type {number} */
    value: 0,
    kind: OptionKind.VIEWER,
  },
  textLayerMode: {
    /** @type {number} */
    value: 1,
    kind: OptionKind.VIEWER,
  },
  useOnlyCssZoom: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.VIEWER,
  },

  cMapPacked: {
    /** @type {boolean} */
    value: true,
    kind: OptionKind.API,
  },
  cMapUrl: {
    /** @type {string} */
    value: (typeof PDFJSDev === 'undefined' || !PDFJSDev.test('PRODUCTION') ?
            '../external/bcmaps/' : '../web/cmaps/'),
    kind: OptionKind.API,
  },
  disableAutoFetch: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.API,
  },
  disableCreateObjectURL: {
    /** @type {boolean} */
    value: apiCompatibilityParams.disableCreateObjectURL || false,
    kind: OptionKind.API,
  },
  disableFontFace: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.API,
  },
  disableRange: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.API,
  },
  disableStream: {
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
  postMessageTransfers: {
    /** @type {boolean} */
    value: true,
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
    value: (typeof PDFJSDev === 'undefined' || !PDFJSDev.test('PRODUCTION') ?
            '../src/worker_loader.js' : '../build/pdf.worker.js'),
    kind: OptionKind.WORKER,
  },
};
if (typeof PDFJSDev === 'undefined' ||
    PDFJSDev.test('!PRODUCTION || GENERIC')) {
  defaultOptions.locale = {
    /** @type {string} */
    value: (typeof navigator !== 'undefined' ? navigator.language : 'en-US'),
    kind: OptionKind.VIEWER,
  };
}

const userOptions = Object.create(null);

class AppOptions {
  constructor() {
    throw new Error('Cannot initialize AppOptions.');
  }

  static get(name) {
    let defaultOption = defaultOptions[name], userOption = userOptions[name];
    if (userOption !== undefined) {
      return userOption;
    }
    return (defaultOption !== undefined ? defaultOption.value : undefined);
  }

  static getAll(kind = null) {
    let options = Object.create(null);
    for (let name in defaultOptions) {
      let defaultOption = defaultOptions[name], userOption = userOptions[name];
      if (kind && defaultOption.kind !== kind) {
        continue;
      }
      options[name] = (userOption !== undefined ?
                       userOption : defaultOption.value);
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

export {
  AppOptions,
  OptionKind,
};
