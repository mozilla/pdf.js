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

importScripts(
  "../../node_modules/es-module-shims/dist/es-module-shims.wasm.js"
);
self.importShim.addImportMap({
  imports: {
    "pdfjs/": "../../src/",
    "pdfjs-lib": "../../src/pdf.js",
    "pdfjs-web/": "../../web/",
    "pdfjs-test/": "../",

    "fluent-bundle": "../../node_modules/@fluent/bundle/esm/index.js",
    "fluent-dom": "../../node_modules/@fluent/dom/esm/index.js",
    "cached-iterable": "../../node_modules/cached-iterable/src/index.mjs",

    "display-fetch_stream": "../../src/display/fetch_stream.js",
    "display-network": "../../src/display/network.js",
    "display-node_stream": "../../src/display/stubs.js",
    "display-node_utils": "../../src/display/stubs.js",

    "web-alt_text_manager": "../../web/alt_text_manager.js",
    "web-annotation_editor_params": "../../web/annotation_editor_params.js",
    "web-com": "../../web/genericcom.js",
    "web-l10n_utils": "../../web/l10n_utils.js",
    "web-pdf_attachment_viewer": "../../web/pdf_attachment_viewer.js",
    "web-pdf_cursor_tools": "../../web/pdf_cursor_tools.js",
    "web-pdf_document_properties": "../../web/pdf_document_properties.js",
    "web-pdf_find_bar": "../../web/pdf_find_bar.js",
    "web-pdf_layer_viewer": "../../web/pdf_layer_viewer.js",
    "web-pdf_outline_viewer": "../../web/pdf_outline_viewer.js",
    "web-pdf_presentation_mode": "../../web/pdf_presentation_mode.js",
    "web-pdf_sidebar": "../../web/pdf_sidebar.js",
    "web-pdf_thumbnail_viewer": "../../web/pdf_thumbnail_viewer.js",
    "web-print_service": "../../web/pdf_print_service.js",
    "web-secondary_toolbar": "../../web/secondary_toolbar.js",
    "web-toolbar": "../../web/toolbar.js",
  },
});

self.onmessage = async _ => {
  const { renderAndReturnImagedata } = await self.importShim(
    "./worker_spec.common.js"
  );
  self.postMessage(await renderAndReturnImagedata());
};
