/* Copyright 2012 Mozilla Foundation
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

import {
  createPromiseCapability,
  getPdfFilenameFromUrl,
  PDFDateString,
} from "pdfjs-lib";
import { getPageSizeInches, isPortraitOrientation } from "./ui_utils.js";

const DEFAULT_FIELD_CONTENT = "-";

// See https://en.wikibooks.org/wiki/Lentis/Conversion_to_the_Metric_Standard_in_the_United_States
const NON_METRIC_LOCALES = ["en-us", "en-lr", "my"];

// Should use the format: `width x height`, in portrait orientation.
// See https://en.wikipedia.org/wiki/Paper_size
const US_PAGE_NAMES = {
  "8.5x11": "Letter",
  "8.5x14": "Legal",
};
const METRIC_PAGE_NAMES = {
  "297x420": "A3",
  "210x297": "A4",
};

function getPageName(size, isPortrait, pageNames) {
  const width = isPortrait ? size.width : size.height;
  const height = isPortrait ? size.height : size.width;

  return pageNames[`${width}x${height}`];
}

/**
 * @typedef {Object} PDFDocumentPropertiesOptions
 * @property {string} overlayName - Name/identifier for the overlay.
 * @property {Object} fields - Names and elements of the overlay's fields.
 * @property {HTMLDivElement} container - Div container for the overlay.
 * @property {HTMLButtonElement} closeButton - Button for closing the overlay.
 */

class PDFDocumentProperties {
  /**
   * @param {PDFDocumentPropertiesOptions} options
   * @param {OverlayManager} overlayManager - Manager for the viewer overlays.
   * @param {EventBus} eventBus - The application event bus.
   * @param {IL10n} l10n - Localization service.
   */
  constructor(
    { overlayName, fields, container, closeButton },
    overlayManager,
    eventBus,
    l10n
  ) {
    this.overlayName = overlayName;
    this.fields = fields;
    this.container = container;
    this.overlayManager = overlayManager;
    this.l10n = l10n;

    this._reset();
    // Bind the event listener for the Close button.
    closeButton.addEventListener("click", this.close.bind(this));

    this.overlayManager.register(
      this.overlayName,
      this.container,
      this.close.bind(this)
    );

    eventBus._on("pagechanging", evt => {
      this._currentPageNumber = evt.pageNumber;
    });
    eventBus._on("rotationchanging", evt => {
      this._pagesRotation = evt.pagesRotation;
    });

    this._isNonMetricLocale = true; // The default viewer locale is 'en-us'.
    l10n.getLanguage().then(locale => {
      this._isNonMetricLocale = NON_METRIC_LOCALES.includes(locale);
    });
  }

  /**
   * Open the document properties overlay.
   */
  async open() {
    const freezeFieldData = data => {
      Object.defineProperty(this, "fieldData", {
        value: Object.freeze(data),
        writable: false,
        enumerable: true,
        configurable: true,
      });
    };

    await Promise.all([
      this.overlayManager.open(this.overlayName),
      this._dataAvailableCapability.promise,
    ]);
    const currentPageNumber = this._currentPageNumber;
    const pagesRotation = this._pagesRotation;

    // If the document properties were previously fetched (for this PDF file),
    // just update the dialog immediately to avoid redundant lookups.
    if (
      this.fieldData &&
      currentPageNumber === this.fieldData._currentPageNumber &&
      pagesRotation === this.fieldData._pagesRotation
    ) {
      this._updateUI();
      return;
    }

    // Get the document properties.
    const {
      info,
      /* metadata, */
      contentDispositionFilename,
      contentLength,
    } = await this.pdfDocument.getMetadata();

    const [
      fileName,
      fileSize,
      creationDate,
      modificationDate,
      pageSize,
      isLinearized,
    ] = await Promise.all([
      contentDispositionFilename || getPdfFilenameFromUrl(this.url),
      this._parseFileSize(contentLength),
      this._parseDate(info.CreationDate),
      this._parseDate(info.ModDate),
      this.pdfDocument.getPage(currentPageNumber).then(pdfPage => {
        return this._parsePageSize(getPageSizeInches(pdfPage), pagesRotation);
      }),
      this._parseLinearization(info.IsLinearized),
    ]);

    freezeFieldData({
      fileName,
      fileSize,
      title: info.Title,
      author: info.Author,
      subject: info.Subject,
      keywords: info.Keywords,
      creationDate,
      modificationDate,
      creator: info.Creator,
      producer: info.Producer,
      version: info.PDFFormatVersion,
      pageCount: this.pdfDocument.numPages,
      pageSize,
      linearized: isLinearized,
      _currentPageNumber: currentPageNumber,
      _pagesRotation: pagesRotation,
    });
    this._updateUI();

    // Get the correct fileSize, since it may not have been available
    // or could potentially be wrong.
    const { length } = await this.pdfDocument.getDownloadInfo();
    if (contentLength === length) {
      return; // The fileSize has already been correctly set.
    }
    const data = Object.assign(Object.create(null), this.fieldData);
    data.fileSize = await this._parseFileSize(length);

    freezeFieldData(data);
    this._updateUI();
  }

  /**
   * Close the document properties overlay.
   */
  close() {
    this.overlayManager.close(this.overlayName);
  }

  /**
   * Set a reference to the PDF document and the URL in order
   * to populate the overlay fields with the document properties.
   * Note that the overlay will contain no information if this method
   * is not called.
   *
   * @param {PDFDocumentProxy} pdfDocument - A reference to the PDF document.
   * @param {string} url - The URL of the document.
   */
  setDocument(pdfDocument, url = null) {
    if (this.pdfDocument) {
      this._reset();
      this._updateUI(true);
    }
    if (!pdfDocument) {
      return;
    }
    this.pdfDocument = pdfDocument;
    this.url = url;

    this._dataAvailableCapability.resolve();
  }

  /**
   * @private
   */
  _reset() {
    this.pdfDocument = null;
    this.url = null;

    delete this.fieldData;
    this._dataAvailableCapability = createPromiseCapability();
    this._currentPageNumber = 1;
    this._pagesRotation = 0;
  }

  /**
   * Always updates all of the dialog fields, to prevent inconsistent UI state.
   * NOTE: If the contents of a particular field is neither a non-empty string,
   *       nor a number, it will fall back to `DEFAULT_FIELD_CONTENT`.
   * @private
   */
  _updateUI(reset = false) {
    if (reset || !this.fieldData) {
      for (const id in this.fields) {
        this.fields[id].textContent = DEFAULT_FIELD_CONTENT;
      }
      return;
    }
    if (this.overlayManager.active !== this.overlayName) {
      // Don't bother updating the dialog if has already been closed,
      // since it will be updated the next time `this.open` is called.
      return;
    }
    for (const id in this.fields) {
      const content = this.fieldData[id];
      this.fields[id].textContent =
        content || content === 0 ? content : DEFAULT_FIELD_CONTENT;
    }
  }

  /**
   * @private
   */
  async _parseFileSize(fileSize = 0) {
    const kb = fileSize / 1024,
      mb = kb / 1024;
    if (!kb) {
      return undefined;
    }
    return this.l10n.get(`document_properties_${mb >= 1 ? "mb" : "kb"}`, {
      size_mb: mb >= 1 && (+mb.toPrecision(3)).toLocaleString(),
      size_kb: mb < 1 && (+kb.toPrecision(3)).toLocaleString(),
      size_b: fileSize.toLocaleString(),
    });
  }

  /**
   * @private
   */
  async _parsePageSize(pageSizeInches, pagesRotation) {
    if (!pageSizeInches) {
      return undefined;
    }
    // Take the viewer rotation into account as well; compare with Adobe Reader.
    if (pagesRotation % 180 !== 0) {
      pageSizeInches = {
        width: pageSizeInches.height,
        height: pageSizeInches.width,
      };
    }
    const isPortrait = isPortraitOrientation(pageSizeInches);

    let sizeInches = {
      width: Math.round(pageSizeInches.width * 100) / 100,
      height: Math.round(pageSizeInches.height * 100) / 100,
    };
    // 1in == 25.4mm; no need to round to 2 decimals for millimeters.
    let sizeMillimeters = {
      width: Math.round(pageSizeInches.width * 25.4 * 10) / 10,
      height: Math.round(pageSizeInches.height * 25.4 * 10) / 10,
    };

    let rawName =
      getPageName(sizeInches, isPortrait, US_PAGE_NAMES) ||
      getPageName(sizeMillimeters, isPortrait, METRIC_PAGE_NAMES);

    if (
      !rawName &&
      !(
        Number.isInteger(sizeMillimeters.width) &&
        Number.isInteger(sizeMillimeters.height)
      )
    ) {
      // Attempt to improve the page name detection by falling back to fuzzy
      // matching of the metric dimensions, to account for e.g. rounding errors
      // and/or PDF files that define the page sizes in an imprecise manner.
      const exactMillimeters = {
        width: pageSizeInches.width * 25.4,
        height: pageSizeInches.height * 25.4,
      };
      const intMillimeters = {
        width: Math.round(sizeMillimeters.width),
        height: Math.round(sizeMillimeters.height),
      };

      // Try to avoid false positives, by only considering "small" differences.
      if (
        Math.abs(exactMillimeters.width - intMillimeters.width) < 0.1 &&
        Math.abs(exactMillimeters.height - intMillimeters.height) < 0.1
      ) {
        rawName = getPageName(intMillimeters, isPortrait, METRIC_PAGE_NAMES);
        if (rawName) {
          // Update *both* sizes, computed above, to ensure that the displayed
          // dimensions always correspond to the detected page name.
          sizeInches = {
            width: Math.round((intMillimeters.width / 25.4) * 100) / 100,
            height: Math.round((intMillimeters.height / 25.4) * 100) / 100,
          };
          sizeMillimeters = intMillimeters;
        }
      }
    }

    const [{ width, height }, unit, name, orientation] = await Promise.all([
      this._isNonMetricLocale ? sizeInches : sizeMillimeters,
      this.l10n.get(
        `document_properties_page_size_unit_${
          this._isNonMetricLocale ? "inches" : "millimeters"
        }`
      ),
      rawName &&
        this.l10n.get(
          `document_properties_page_size_name_${rawName.toLowerCase()}`
        ),
      this.l10n.get(
        `document_properties_page_size_orientation_${
          isPortrait ? "portrait" : "landscape"
        }`
      ),
    ]);

    return this.l10n.get(
      `document_properties_page_size_dimension_${name ? "name_" : ""}string`,
      {
        width: width.toLocaleString(),
        height: height.toLocaleString(),
        unit,
        name,
        orientation,
      }
    );
  }

  /**
   * @private
   */
  async _parseDate(inputDate) {
    const dateObject = PDFDateString.toDateObject(inputDate);
    if (!dateObject) {
      return undefined;
    }
    return this.l10n.get("document_properties_date_string", {
      date: dateObject.toLocaleDateString(),
      time: dateObject.toLocaleTimeString(),
    });
  }

  /**
   * @private
   */
  _parseLinearization(isLinearized) {
    return this.l10n.get(
      `document_properties_linearized_${isLinearized ? "yes" : "no"}`
    );
  }
}

export { PDFDocumentProperties };
