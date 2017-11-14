/* Copyright 2017 Mozilla Foundation
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

// import { apiCompatibilityParams } from 'pdfjs-lib';
import { viewerCompatibilityParams } from './viewer_compatibility';

const OptionKind = {
  VIEWER: 'viewer',
  API: 'api',
};

const defaultOptions = {
  defaultZoomValue: {
    /** @type {string} */
    value: '',
    kind: OptionKind.VIEWER,
  },
  disableFullscreen: {
    /** @type {boolean} */
    value: viewerCompatibilityParams.disableFullscreen || false,
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
  disableTextLayer: {
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
  enhanceTextSelection: {
    /** @type {boolean} */
    value: false,
    kind: OptionKind.VIEWER,
  },
  externalLinkRel: {
    /** @type {string} */
    value: null,
    kind: OptionKind.VIEWER,
  },
  externalLinkTarget: {
    /** @type {number} */
    value: 0,
    kind: OptionKind.VIEWER,
  },
  imageResourcesPath: {
    /** @type {string} */
    value: '',
    kind: OptionKind.VIEWER,
  },
  maxCanvasPixels: {
    /** @type {number} */
    value: viewerCompatibilityParams.maxCanvasPixels || null,
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
  disableFontFace: {
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
    value: null,
    kind: OptionKind.API,
  },
};
if (typeof PDFJSDev === 'undefined' ||
    !PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
  defaultOptions.locale = {
    /** @type {string} */
    value: viewerCompatibilityParams.locale ||
           (typeof navigator !== 'undefined' ? navigator.language : null),
    kind: OptionKind.VIEWER,
  };
}

let userOptions = Object.create(null);

class AppOptions {
  constructor() {
    throw new Error('Cannot initialize AppOptions.');
  }

  static get(name) {
    let defaultOption = defaultOptions[name], userOption = userOptions[name];
    if (defaultOption === undefined) {
      console.error(`AppOptions.get: "${name}" is undefined.`);
      return;
    }
    return (userOption !== undefined ? userOption : defaultOption.value);
  }

  static getAll(kind = null) {
    const OptionKindValues = Object.values(OptionKind);
    if (kind && !OptionKindValues.includes(kind)) {
      console.error(`AppOptions.getAll: "${kind}" not a valid kind.`);
      return;
    }
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
    if (defaultOptions[name] === undefined || value === undefined) {
      console.error(`AppOptions.set: "${name}" ` +
        `${value === undefined ? 'has no value specified' : 'is undefined'}.`);
      return;
    }
    userOptions[name] = value;
  }

  static remove(name) {
    if (defaultOptions[name] === undefined) {
      console.error(`AppOptions.remove: "${name}" is undefined.`);
    }
    delete userOptions[name];
  }
}

export {
  AppOptions,
};
