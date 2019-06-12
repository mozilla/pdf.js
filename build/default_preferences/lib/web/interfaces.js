"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.IL10n = exports.IPDFAnnotationLayerFactory = exports.IPDFTextLayerFactory = exports.IRenderableView = exports.IPDFHistory = exports.IPDFLinkService = void 0;

class IPDFLinkService {
  get pagesCount() {}

  get page() {}

  set page(value) {}

  get rotation() {}

  set rotation(value) {}

  navigateTo(dest) {}

  getDestinationHash(dest) {}

  getAnchorUrl(hash) {}

  setHash(hash) {}

  executeNamedAction(action) {}

  cachePageRef(pageNum, pageRef) {}

  isPageVisible(pageNumber) {}

}

exports.IPDFLinkService = IPDFLinkService;

class IPDFHistory {
  initialize({
    fingerprint,
    resetHistory = false,
    updateUrl = false
  }) {}

  push({
    namedDest = null,
    explicitDest,
    pageNumber
  }) {}

  pushCurrentPosition() {}

  back() {}

  forward() {}

}

exports.IPDFHistory = IPDFHistory;

class IRenderableView {
  get renderingId() {}

  get renderingState() {}

  draw() {}

  resume() {}

}

exports.IRenderableView = IRenderableView;

class IPDFTextLayerFactory {
  createTextLayerBuilder(textLayerDiv, pageIndex, viewport, enhanceTextSelection = false) {}

}

exports.IPDFTextLayerFactory = IPDFTextLayerFactory;

class IPDFAnnotationLayerFactory {
  createAnnotationLayerBuilder(pageDiv, pdfPage, imageResourcesPath = '', renderInteractiveForms = false, l10n = undefined) {}

}

exports.IPDFAnnotationLayerFactory = IPDFAnnotationLayerFactory;

class IL10n {
  async getLanguage() {}

  async getDirection() {}

  async get(key, args, fallback) {}

  async translate(element) {}

}

exports.IL10n = IL10n;