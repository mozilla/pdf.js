/* Copyright 2020 Mozilla Foundation
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

class PrintParams {
  constructor(data) {
    this.binaryOk = true;
    this.bitmapDPI = 150;
    this.booklet = {
      binding: 0,
      duplexMode: 0,
      subsetFrom: 0,
      subsetTo: -1,
    };
    this.colorOverride = 0;
    this.colorProfile = "";
    this.constants = Object.freeze({
      bookletBindings: Object.freeze({
        Left: 0,
        Right: 1,
        LeftTall: 2,
        RightTall: 3,
      }),
      bookletDuplexMode: Object.freeze({
        BothSides: 0,
        FrontSideOnly: 1,
        BasicSideOnly: 2,
      }),
      colorOverrides: Object.freeze({
        auto: 0,
        gray: 1,
        mono: 2,
      }),
      fontPolicies: Object.freeze({
        everyPage: 0,
        jobStart: 1,
        pageRange: 2,
      }),
      handling: Object.freeze({
        none: 0,
        fit: 1,
        shrink: 2,
        tileAll: 3,
        tileLarge: 4,
        nUp: 5,
        booklet: 6,
      }),
      interactionLevel: Object.freeze({
        automatic: 0,
        full: 1,
        silent: 2,
      }),
      nUpPageOrders: Object.freeze({
        Horizontal: 0,
        HorizontalReversed: 1,
        Vertical: 2,
      }),
      printContents: Object.freeze({
        doc: 0,
        docAndComments: 1,
        formFieldsOnly: 2,
      }),
      flagValues: Object.freeze({
        applyOverPrint: 1,
        applySoftProofSettings: 1 << 1,
        applyWorkingColorSpaces: 1 << 2,
        emitHalftones: 1 << 3,
        emitPostScriptXObjects: 1 << 4,
        emitFormsAsPSForms: 1 << 5,
        maxJP2KRes: 1 << 6,
        setPageSize: 1 << 7,
        suppressBG: 1 << 8,
        suppressCenter: 1 << 9,
        suppressCJKFontSubst: 1 << 10,
        suppressCropClip: 1 << 1,
        suppressRotate: 1 << 12,
        suppressTransfer: 1 << 13,
        suppressUCR: 1 << 14,
        useTrapAnnots: 1 << 15,
        usePrintersMarks: 1 << 16,
      }),
      rasterFlagValues: Object.freeze({
        textToOutline: 1,
        strokesToOutline: 1 << 1,
        allowComplexClip: 1 << 2,
        preserveOverprint: 1 << 3,
      }),
      subsets: Object.freeze({
        all: 0,
        even: 1,
        odd: 2,
      }),
      tileMarks: Object.freeze({
        none: 0,
        west: 1,
        east: 2,
      }),
      usages: Object.freeze({
        auto: 0,
        use: 1,
        noUse: 2,
      }),
    });
    this.downloadFarEastFonts = false;
    this.fileName = "";
    this.firstPage = 0;
    this.flags = 0;
    this.fontPolicy = 0;
    this.gradientDPI = 150;
    this.interactive = 1;
    this.lastPage = data.lastPage;
    this.npUpAutoRotate = false;
    this.npUpNumPagesH = 2;
    this.npUpNumPagesV = 2;
    this.npUpPageBorder = false;
    this.npUpPageOrder = 0;
    this.pageHandling = 0;
    this.pageSubset = 0;
    this.printAsImage = false;
    this.printContent = 0;
    this.printerName = "";
    this.psLevel = 0;
    this.rasterFlags = 0;
    this.reversePages = false;
    this.tileLabel = false;
    this.tileMark = 0;
    this.tileOverlap = 0;
    this.tileScale = 1.0;
    this.transparencyLevel = 75;
    this.usePrinterCRD = 0;
    this.useT1Conversion = 0;
  }
}

export { PrintParams };
