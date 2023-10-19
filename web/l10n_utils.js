/* Copyright 2021 Mozilla Foundation
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

/**
 * PLEASE NOTE: This file is currently imported in both the `web/` and
 *              `src/display/` folders, hence be EXTREMELY careful about
 *              introducing any dependencies here since that can lead to an
 *              unexpected/unnecessary size increase of the *built* files.
 */

/**
 * A subset of the l10n strings in the `l10n/en-US/viewer.ftl` file.
 */
const DEFAULT_L10N_STRINGS = {
  "pdfjs-of-pages": "of { $pagesCount }",
  "pdfjs-page-of-pages": "({ $pageNumber } of { $pagesCount })",

  "pdfjs-document-properties-kb": "{ $size-kb } KB ({ $size-b } bytes)",
  "pdfjs-document-properties-mb": "{ $size-mb } MB ({ $size-b } bytes)",
  "pdfjs-document-properties-date-string": "{ $date }, { $time }",
  "pdfjs-document-properties-page-size-unit-inches": "in",
  "pdfjs-document-properties-page-size-unit-millimeters": "mm",
  "pdfjs-document-properties-page-size-orientation-portrait": "portrait",
  "pdfjs-document-properties-page-size-orientation-landscape": "landscape",
  "pdfjs-document-properties-page-size-name-a3": "A3",
  "pdfjs-document-properties-page-size-name-a4": "A4",
  "pdfjs-document-properties-page-size-name-letter": "Letter",
  "pdfjs-document-properties-page-size-name-legal": "Legal",
  "pdfjs-document-properties-page-size-dimension-string":
    "{ $width } × { $height } { $unit } ({ $orientation })",
  "pdfjs-document-properties-page-size-dimension-name-string":
    "{ $width } × { $height } { $unit } ({ $name }, { $orientation })",
  "pdfjs-document-properties-linearized-yes": "Yes",
  "pdfjs-document-properties-linearized-no": "No",

  "pdfjs-additional-layers": "Additional Layers",
  "pdfjs-page-landmark": "Page { $page }",
  "pdfjs-thumb-page-title": "Page { $page }",
  "pdfjs-thumb-page-canvas": "Thumbnail of Page { $page }",

  "pdfjs-find-reached-top": "Reached top of document, continued from bottom",
  "pdfjs-find-reached-bottom": "Reached end of document, continued from top",
  "pdfjs-find-match-count[one]": "{ $current } of { $total } match",
  "pdfjs-find-match-count[other]": "{ $current } of { $total } matches",
  "pdfjs-find-match-count-limit[one]": "More than { $limit } match",
  "pdfjs-find-match-count-limit[other]": "More than { $limit } matches",
  "pdfjs-find-not-found": "Phrase not found",

  "pdfjs-page-scale-percent": "{ $scale }%",

  "pdfjs-loading-error": "An error occurred while loading the PDF.",
  "pdfjs-invalid-file-error": "Invalid or corrupted PDF file.",
  "pdfjs-missing-file-error": "Missing PDF file.",
  "pdfjs-unexpected-response-error": "Unexpected server response.",
  "pdfjs-rendering-error": "An error occurred while rendering the page.",

  "pdfjs-annotation-date-string": "{ $date }, { $time }",

  "pdfjs-printing-not-supported":
    "Warning: Printing is not fully supported by this browser.",
  "pdfjs-printing-not-ready":
    "Warning: The PDF is not fully loaded for printing.",
  "pdfjs-web-fonts-disabled":
    "Web fonts are disabled: unable to use embedded PDF fonts.",

  "pdfjs-free-text-default-content": "Start typing…",
  "pdfjs-editor-alt-text-button-label": "Alt text",
  "pdfjs-editor-alt-text-edit-button-label": "Edit alt text",
  "pdfjs-editor-alt-text-decorative-tooltip": "Marked as decorative",
  "pdfjs-editor-resizer-label-top-left": "Top left corner — resize",
  "pdfjs-editor-resizer-label-top-middle": "Top middle — resize",
  "pdfjs-editor-resizer-label-top-right": "Top right corner — resize",
  "pdfjs-editor-resizer-label-middle-right": "Middle right — resize",
  "pdfjs-editor-resizer-label-bottom-right": "Bottom right corner — resize",
  "pdfjs-editor-resizer-label-bottom-middle": "Bottom middle — resize",
  "pdfjs-editor-resizer-label-bottom-left": "Bottom left corner — resize",
  "pdfjs-editor-resizer-label-middle-left": "Middle left — resize",
};
if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) {
  DEFAULT_L10N_STRINGS.print_progress_percent = "{ $progress }%";
}

function getL10nFallback(key, args) {
  switch (key) {
    case "pdfjs-find-match-count":
      key = `pdfjs-find-match-count[${args.total === 1 ? "one" : "other"}]`;
      break;
    case "pdfjs-find-match-count-limit":
      key = `pdfjs-find-match-count-limit[${
        args.limit === 1 ? "one" : "other"
      }]`;
      break;
  }
  return DEFAULT_L10N_STRINGS[key] || "";
}

// Replaces { $arguments } with their values.
function formatL10nValue(text, args) {
  if (!args) {
    return text;
  }
  return text.replaceAll(/\{\s*$(\w+)\s*\}/g, (all, name) => {
    return name in args ? args[name] : "{$" + name + "}";
  });
}

/**
 * No-op implementation of the localization service.
 * @implements {IL10n}
 */
const NullL10n = {
  getLanguage() {
    return "en-us";
  },

  getDirection() {
    return "ltr";
  },

  async get(key, args = null, fallback = getL10nFallback(key, args)) {
    return formatL10nValue(fallback, args);
  },

  async translate(element) {},
};

export { NullL10n };
