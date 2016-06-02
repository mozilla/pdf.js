/* Copyright 2015 Mozilla Foundation
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
/* globals pdfjsVersion, pdfjsBuild */

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs/display/global', ['exports', 'pdfjs/shared/util',
      'pdfjs/display/dom_utils', 'pdfjs/display/api',
      'pdfjs/display/annotation_layer', 'pdfjs/display/text_layer',
      'pdfjs/display/metadata', 'pdfjs/display/svg'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('../shared/util.js'), require('./dom_utils.js'),
      require('./api.js'), require('./annotation_layer.js'),
      require('./text_layer.js'), require('./metadata.js'),
      require('./svg.js'));
  } else {
    factory((root.pdfjsDisplayGlobal = {}), root.pdfjsSharedUtil,
      root.pdfjsDisplayDOMUtils, root.pdfjsDisplayAPI,
      root.pdfjsDisplayAnnotationLayer, root.pdfjsDisplayTextLayer,
      root.pdfjsDisplayMetadata, root.pdfjsDisplaySVG);
  }
}(this, function (exports, sharedUtil, displayDOMUtils, displayAPI,
                  displayAnnotationLayer, displayTextLayer, displayMetadata,
                  displaySVG) {

  var globalScope = sharedUtil.globalScope;
  var deprecated = sharedUtil.deprecated;
  var warn = sharedUtil.warn;
  var LinkTarget = displayDOMUtils.LinkTarget;

  var isWorker = (typeof window === 'undefined');

  // The global PDFJS object is now deprecated and will not be supported in
  // the future. The members below are maintained for backward  compatibility
  // and shall not be extended or modified. If the global.js is included as
  // a module, we will create a global PDFJS object instance or use existing.
  if (!globalScope.PDFJS) {
    globalScope.PDFJS = {};
  }
  var PDFJS = globalScope.PDFJS;

  if (typeof pdfjsVersion !== 'undefined') {
    PDFJS.version = pdfjsVersion;
  }
  if (typeof pdfjsBuild !== 'undefined') {
    PDFJS.build = pdfjsBuild;
  }

  PDFJS.pdfBug = false;

  if (PDFJS.verbosity !== undefined) {
    sharedUtil.setVerbosityLevel(PDFJS.verbosity);
  }
  delete PDFJS.verbosity;
  Object.defineProperty(PDFJS, 'verbosity', {
    get: function () { return sharedUtil.getVerbosityLevel(); },
    set: function (level) { sharedUtil.setVerbosityLevel(level); },
    enumerable: true,
    configurable: true
  });

  PDFJS.VERBOSITY_LEVELS = sharedUtil.VERBOSITY_LEVELS;
  PDFJS.OPS = sharedUtil.OPS;
  PDFJS.UNSUPPORTED_FEATURES = sharedUtil.UNSUPPORTED_FEATURES;
  PDFJS.isValidUrl = sharedUtil.isValidUrl;
  PDFJS.shadow = sharedUtil.shadow;
  PDFJS.createBlob = sharedUtil.createBlob;
  PDFJS.createObjectURL = function PDFJS_createObjectURL(data, contentType) {
    return sharedUtil.createObjectURL(data, contentType,
                                      PDFJS.disableCreateObjectURL);
  };
  Object.defineProperty(PDFJS, 'isLittleEndian', {
    configurable: true,
    get: function PDFJS_isLittleEndian() {
      var value = sharedUtil.isLittleEndian();
      return sharedUtil.shadow(PDFJS, 'isLittleEndian', value);
    }
  });
  PDFJS.removeNullCharacters = sharedUtil.removeNullCharacters;
  PDFJS.PasswordResponses = sharedUtil.PasswordResponses;
  PDFJS.PasswordException = sharedUtil.PasswordException;
  PDFJS.UnknownErrorException = sharedUtil.UnknownErrorException;
  PDFJS.InvalidPDFException = sharedUtil.InvalidPDFException;
  PDFJS.MissingPDFException = sharedUtil.MissingPDFException;
  PDFJS.UnexpectedResponseException = sharedUtil.UnexpectedResponseException;
  PDFJS.Util = sharedUtil.Util;
  PDFJS.PageViewport = sharedUtil.PageViewport;
  PDFJS.createPromiseCapability = sharedUtil.createPromiseCapability;

  /**
   * The maximum allowed image size in total pixels e.g. width * height. Images
   * above this value will not be drawn. Use -1 for no limit.
   * @var {number}
   */
  PDFJS.maxImageSize = (PDFJS.maxImageSize === undefined ?
                        -1 : PDFJS.maxImageSize);

  /**
   * The url of where the predefined Adobe CMaps are located. Include trailing
   * slash.
   * @var {string}
   */
  PDFJS.cMapUrl = (PDFJS.cMapUrl === undefined ? null : PDFJS.cMapUrl);

  /**
   * Specifies if CMaps are binary packed.
   * @var {boolean}
   */
  PDFJS.cMapPacked = PDFJS.cMapPacked === undefined ? false : PDFJS.cMapPacked;

  /**
   * By default fonts are converted to OpenType fonts and loaded via font face
   * rules. If disabled, the font will be rendered using a built in font
   * renderer that constructs the glyphs with primitive path commands.
   * @var {boolean}
   */
  PDFJS.disableFontFace = (PDFJS.disableFontFace === undefined ?
                           false : PDFJS.disableFontFace);

  /**
   * Path for image resources, mainly for annotation icons. Include trailing
   * slash.
   * @var {string}
   */
  PDFJS.imageResourcesPath = (PDFJS.imageResourcesPath === undefined ?
                              '' : PDFJS.imageResourcesPath);

  /**
   * Disable the web worker and run all code on the main thread. This will
   * happen automatically if the browser doesn't support workers or sending
   * typed arrays to workers.
   * @var {boolean}
   */
  PDFJS.disableWorker = (PDFJS.disableWorker === undefined ?
                         false : PDFJS.disableWorker);

  /**
   * Path and filename of the worker file. Required when the worker is enabled
   * in development mode. If unspecified in the production build, the worker
   * will be loaded based on the location of the pdf.js file. It is recommended
   * that the workerSrc is set in a custom application to prevent issues caused
   * by third-party frameworks and libraries.
   * @var {string}
   */
  PDFJS.workerSrc = (PDFJS.workerSrc === undefined ? null : PDFJS.workerSrc);

  /**
   * Disable range request loading of PDF files. When enabled and if the server
   * supports partial content requests then the PDF will be fetched in chunks.
   * Enabled (false) by default.
   * @var {boolean}
   */
  PDFJS.disableRange = (PDFJS.disableRange === undefined ?
                        false : PDFJS.disableRange);

  /**
   * Disable streaming of PDF file data. By default PDF.js attempts to load PDF
   * in chunks. This default behavior can be disabled.
   * @var {boolean}
   */
  PDFJS.disableStream = (PDFJS.disableStream === undefined ?
                         false : PDFJS.disableStream);

  /**
   * Disable pre-fetching of PDF file data. When range requests are enabled
   * PDF.js will automatically keep fetching more data even if it isn't needed
   * to display the current page. This default behavior can be disabled.
   *
   * NOTE: It is also necessary to disable streaming, see above,
   *       in order for disabling of pre-fetching to work correctly.
   * @var {boolean}
   */
  PDFJS.disableAutoFetch = (PDFJS.disableAutoFetch === undefined ?
                            false : PDFJS.disableAutoFetch);

  /**
   * Enables special hooks for debugging PDF.js.
   * @var {boolean}
   */
  PDFJS.pdfBug = (PDFJS.pdfBug === undefined ? false : PDFJS.pdfBug);

  /**
   * Enables transfer usage in postMessage for ArrayBuffers.
   * @var {boolean}
   */
  PDFJS.postMessageTransfers = (PDFJS.postMessageTransfers === undefined ?
                                true : PDFJS.postMessageTransfers);

  /**
   * Disables URL.createObjectURL usage.
   * @var {boolean}
   */
  PDFJS.disableCreateObjectURL = (PDFJS.disableCreateObjectURL === undefined ?
                                  false : PDFJS.disableCreateObjectURL);

  /**
   * Disables WebGL usage.
   * @var {boolean}
   */
  PDFJS.disableWebGL = (PDFJS.disableWebGL === undefined ?
                        true : PDFJS.disableWebGL);

  /**
   * Specifies the |target| attribute for external links.
   * The constants from PDFJS.LinkTarget should be used:
   *  - NONE [default]
   *  - SELF
   *  - BLANK
   *  - PARENT
   *  - TOP
   * @var {number}
   */
  PDFJS.externalLinkTarget = (PDFJS.externalLinkTarget === undefined ?
                              LinkTarget.NONE : PDFJS.externalLinkTarget);

  /**
   * Specifies the |rel| attribute for external links. Defaults to stripping
   * the referrer.
   * @var {string}
   */
  PDFJS.externalLinkRel = (PDFJS.externalLinkRel === undefined ?
                           'noreferrer' : PDFJS.externalLinkRel);

  /**
    * Determines if we can eval strings as JS. Primarily used to improve
    * performance for font rendering.
    * @var {boolean}
    */
  PDFJS.isEvalSupported = (PDFJS.isEvalSupported === undefined ?
                           true : PDFJS.isEvalSupported);

//#if !MOZCENTRAL
  var savedOpenExternalLinksInNewWindow = PDFJS.openExternalLinksInNewWindow;
  delete PDFJS.openExternalLinksInNewWindow;
  Object.defineProperty(PDFJS, 'openExternalLinksInNewWindow', {
    get: function () {
      return PDFJS.externalLinkTarget === LinkTarget.BLANK;
    },
    set: function (value) {
      if (value) {
        deprecated('PDFJS.openExternalLinksInNewWindow, please use ' +
          '"PDFJS.externalLinkTarget = PDFJS.LinkTarget.BLANK" instead.');
      }
      if (PDFJS.externalLinkTarget !== LinkTarget.NONE) {
        warn('PDFJS.externalLinkTarget is already initialized');
        return;
      }
      PDFJS.externalLinkTarget = value ? LinkTarget.BLANK : LinkTarget.NONE;
    },
    enumerable: true,
    configurable: true
  });
  if (savedOpenExternalLinksInNewWindow) {
    /**
     * (Deprecated) Opens external links in a new window if enabled.
     * The default behavior opens external links in the PDF.js window.
     *
     * NOTE: This property has been deprecated, please use
     *       `PDFJS.externalLinkTarget = PDFJS.LinkTarget.BLANK` instead.
     * @var {boolean}
     */
    PDFJS.openExternalLinksInNewWindow = savedOpenExternalLinksInNewWindow;
  }
//#endif

  PDFJS.getDocument = displayAPI.getDocument;
  PDFJS.PDFDataRangeTransport = displayAPI.PDFDataRangeTransport;
  PDFJS.PDFWorker = displayAPI.PDFWorker;

  Object.defineProperty(PDFJS, 'hasCanvasTypedArrays', {
    configurable: true,
    get: function PDFJS_hasCanvasTypedArrays() {
      var value = displayDOMUtils.hasCanvasTypedArrays();
      return sharedUtil.shadow(PDFJS, 'hasCanvasTypedArrays', value);
    }
  });
  PDFJS.CustomStyle = displayDOMUtils.CustomStyle;
  PDFJS.LinkTarget = LinkTarget;
  PDFJS.addLinkAttributes = displayDOMUtils.addLinkAttributes;
  PDFJS.getFilenameFromUrl = displayDOMUtils.getFilenameFromUrl;
  PDFJS.isExternalLinkTargetSet = displayDOMUtils.isExternalLinkTargetSet;

  PDFJS.AnnotationLayer = displayAnnotationLayer.AnnotationLayer;

  PDFJS.renderTextLayer = displayTextLayer.renderTextLayer;

  PDFJS.Metadata = displayMetadata.Metadata;

  PDFJS.SVGGraphics = displaySVG.SVGGraphics;

  PDFJS.UnsupportedManager = displayAPI._UnsupportedManager;

  exports.globalScope = globalScope;
  exports.isWorker = isWorker;
  exports.PDFJS = globalScope.PDFJS;
}));
