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
/* eslint no-var: error */

import {
  AnnotationBorderStyleType,
  AnnotationFieldFlag,
  AnnotationFlag,
  AnnotationReplyType,
  AnnotationType,
  assert,
  escapeString,
  getModificationDate,
  isString,
  OPS,
  stringToPDFString,
  unreachable,
  Util,
  warn,
} from "../shared/util.js";
import { Catalog, FileSpec, ObjectLoader } from "./obj.js";
import { Dict, isDict, isName, isRef, isStream, Name } from "./primitives.js";
import { ColorSpace } from "./colorspace.js";
import { getInheritableProperty } from "./core_utils.js";
import { OperatorList } from "./operator_list.js";
import { StringStream } from "./stream.js";
import { writeDict } from "./writer.js";

class AnnotationFactory {
  /**
   * Create an `Annotation` object of the correct type for the given reference
   * to an annotation dictionary. This yields a promise that is resolved when
   * the `Annotation` object is constructed.
   *
   * @param {XRef} xref
   * @param {Object} ref
   * @param {PDFManager} pdfManager
   * @param {Object} idFactory
   * @returns {Promise} A promise that is resolved with an {Annotation}
   *   instance.
   */
  static create(xref, ref, pdfManager, idFactory) {
    return pdfManager.ensureCatalog("acroForm").then(acroForm => {
      return pdfManager.ensure(this, "_create", [
        xref,
        ref,
        pdfManager,
        idFactory,
        acroForm,
      ]);
    });
  }

  /**
   * @private
   */
  static _create(xref, ref, pdfManager, idFactory, acroForm) {
    const dict = xref.fetchIfRef(ref);
    if (!isDict(dict)) {
      return undefined;
    }

    const id = isRef(ref) ? ref.toString() : `annot_${idFactory.createObjId()}`;

    // Determine the annotation's subtype.
    let subtype = dict.get("Subtype");
    subtype = isName(subtype) ? subtype.name : null;

    // Return the right annotation object based on the subtype and field type.
    const parameters = {
      xref,
      ref,
      dict,
      subtype,
      id,
      pdfManager,
      acroForm: acroForm instanceof Dict ? acroForm : Dict.empty,
    };

    switch (subtype) {
      case "Link":
        return new LinkAnnotation(parameters);

      case "Text":
        return new TextAnnotation(parameters);

      case "Widget":
        let fieldType = getInheritableProperty({ dict, key: "FT" });
        fieldType = isName(fieldType) ? fieldType.name : null;

        switch (fieldType) {
          case "Tx":
            return new TextWidgetAnnotation(parameters);
          case "Btn":
            return new ButtonWidgetAnnotation(parameters);
          case "Ch":
            return new ChoiceWidgetAnnotation(parameters);
        }
        warn(
          'Unimplemented widget field type "' +
            fieldType +
            '", ' +
            "falling back to base field type."
        );
        return new WidgetAnnotation(parameters);

      case "Popup":
        return new PopupAnnotation(parameters);

      case "FreeText":
        return new FreeTextAnnotation(parameters);

      case "Line":
        return new LineAnnotation(parameters);

      case "Square":
        return new SquareAnnotation(parameters);

      case "Circle":
        return new CircleAnnotation(parameters);

      case "PolyLine":
        return new PolylineAnnotation(parameters);

      case "Polygon":
        return new PolygonAnnotation(parameters);

      case "Caret":
        return new CaretAnnotation(parameters);

      case "Ink":
        return new InkAnnotation(parameters);

      case "Highlight":
        return new HighlightAnnotation(parameters);

      case "Underline":
        return new UnderlineAnnotation(parameters);

      case "Squiggly":
        return new SquigglyAnnotation(parameters);

      case "StrikeOut":
        return new StrikeOutAnnotation(parameters);

      case "Stamp":
        return new StampAnnotation(parameters);

      case "FileAttachment":
        return new FileAttachmentAnnotation(parameters);

      default:
        if (!subtype) {
          warn("Annotation is missing the required /Subtype.");
        } else {
          warn(
            'Unimplemented annotation type "' +
              subtype +
              '", ' +
              "falling back to base annotation."
          );
        }
        return new Annotation(parameters);
    }
  }
}

function getQuadPoints(dict, rect) {
  if (!dict.has("QuadPoints")) {
    return null;
  }

  // The region is described as a number of quadrilaterals.
  // Each quadrilateral must consist of eight coordinates.
  const quadPoints = dict.getArray("QuadPoints");
  if (!Array.isArray(quadPoints) || quadPoints.length % 8 > 0) {
    return null;
  }

  const quadPointsLists = [];
  for (let i = 0, ii = quadPoints.length / 8; i < ii; i++) {
    // Each series of eight numbers represents the coordinates for one
    // quadrilateral in the order [x1, y1, x2, y2, x3, y3, x4, y4].
    // Convert this to an array of objects with x and y coordinates.
    quadPointsLists.push([]);
    for (let j = i * 8, jj = i * 8 + 8; j < jj; j += 2) {
      const x = quadPoints[j];
      const y = quadPoints[j + 1];

      // The quadpoints should be ignored if any coordinate in the array
      // lies outside the region specified by the rectangle. The rectangle
      // can be `null` for markup annotations since their rectangle may be
      // incorrect (fixes bug 1538111).
      if (
        rect !== null &&
        (x < rect[0] || x > rect[2] || y < rect[1] || y > rect[3])
      ) {
        return null;
      }
      quadPointsLists[i].push({ x, y });
    }
  }
  return quadPointsLists;
}

function getTransformMatrix(rect, bbox, matrix) {
  // 12.5.5: Algorithm: Appearance streams
  const [minX, minY, maxX, maxY] = Util.getAxialAlignedBoundingBox(
    bbox,
    matrix
  );
  if (minX === maxX || minY === maxY) {
    // From real-life file, bbox was [0, 0, 0, 0]. In this case,
    // just apply the transform for rect
    return [1, 0, 0, 1, rect[0], rect[1]];
  }

  const xRatio = (rect[2] - rect[0]) / (maxX - minX);
  const yRatio = (rect[3] - rect[1]) / (maxY - minY);
  return [
    xRatio,
    0,
    0,
    yRatio,
    rect[0] - minX * xRatio,
    rect[1] - minY * yRatio,
  ];
}

class Annotation {
  constructor(params) {
    const dict = params.dict;

    this.setContents(dict.get("Contents"));
    this.setModificationDate(dict.get("M"));
    this.setFlags(dict.get("F"));
    this.setRectangle(dict.getArray("Rect"));
    this.setColor(dict.getArray("C"));
    this.setBorderStyle(dict);
    this.setAppearance(dict);

    this._streams = [];
    if (this.appearance) {
      this._streams.push(this.appearance);
    }

    // Expose public properties using a data object.
    this.data = {
      annotationFlags: this.flags,
      borderStyle: this.borderStyle,
      color: this.color,
      contents: this.contents,
      hasAppearance: !!this.appearance,
      id: params.id,
      modificationDate: this.modificationDate,
      rect: this.rectangle,
      subtype: params.subtype,
    };
  }

  /**
   * @private
   */
  _hasFlag(flags, flag) {
    return !!(flags & flag);
  }

  /**
   * @private
   */
  _isViewable(flags) {
    return (
      !this._hasFlag(flags, AnnotationFlag.INVISIBLE) &&
      !this._hasFlag(flags, AnnotationFlag.HIDDEN) &&
      !this._hasFlag(flags, AnnotationFlag.NOVIEW)
    );
  }

  /**
   * @private
   */
  _isPrintable(flags) {
    return (
      this._hasFlag(flags, AnnotationFlag.PRINT) &&
      !this._hasFlag(flags, AnnotationFlag.INVISIBLE) &&
      !this._hasFlag(flags, AnnotationFlag.HIDDEN)
    );
  }

  /**
   * @type {boolean}
   */
  get viewable() {
    if (this.flags === 0) {
      return true;
    }
    return this._isViewable(this.flags);
  }

  /**
   * @type {boolean}
   */
  get printable() {
    if (this.flags === 0) {
      return false;
    }
    return this._isPrintable(this.flags);
  }

  /**
   * Set the contents.
   *
   * @public
   * @memberof Annotation
   * @param {string} contents - Text to display for the annotation or, if the
   *                            type of annotation does not display text, a
   *                            description of the annotation's contents
   */
  setContents(contents) {
    this.contents = stringToPDFString(contents || "");
  }

  /**
   * Set the modification date.
   *
   * @public
   * @memberof Annotation
   * @param {string} modificationDate - PDF date string that indicates when the
   *                                    annotation was last modified
   */
  setModificationDate(modificationDate) {
    this.modificationDate = isString(modificationDate)
      ? modificationDate
      : null;
  }

  /**
   * Set the flags.
   *
   * @public
   * @memberof Annotation
   * @param {number} flags - Unsigned 32-bit integer specifying annotation
   *                         characteristics
   * @see {@link shared/util.js}
   */
  setFlags(flags) {
    this.flags = Number.isInteger(flags) && flags > 0 ? flags : 0;
  }

  /**
   * Check if a provided flag is set.
   *
   * @public
   * @memberof Annotation
   * @param {number} flag - Hexadecimal representation for an annotation
   *                        characteristic
   * @returns {boolean}
   * @see {@link shared/util.js}
   */
  hasFlag(flag) {
    return this._hasFlag(this.flags, flag);
  }

  /**
   * Set the rectangle.
   *
   * @public
   * @memberof Annotation
   * @param {Array} rectangle - The rectangle array with exactly four entries
   */
  setRectangle(rectangle) {
    if (Array.isArray(rectangle) && rectangle.length === 4) {
      this.rectangle = Util.normalizeRect(rectangle);
    } else {
      this.rectangle = [0, 0, 0, 0];
    }
  }

  /**
   * Set the color and take care of color space conversion.
   * The default value is black, in RGB color space.
   *
   * @public
   * @memberof Annotation
   * @param {Array} color - The color array containing either 0
   *                        (transparent), 1 (grayscale), 3 (RGB) or
   *                        4 (CMYK) elements
   */
  setColor(color) {
    const rgbColor = new Uint8ClampedArray(3);
    if (!Array.isArray(color)) {
      this.color = rgbColor;
      return;
    }

    switch (color.length) {
      case 0: // Transparent, which we indicate with a null value
        this.color = null;
        break;

      case 1: // Convert grayscale to RGB
        ColorSpace.singletons.gray.getRgbItem(color, 0, rgbColor, 0);
        this.color = rgbColor;
        break;

      case 3: // Convert RGB percentages to RGB
        ColorSpace.singletons.rgb.getRgbItem(color, 0, rgbColor, 0);
        this.color = rgbColor;
        break;

      case 4: // Convert CMYK to RGB
        ColorSpace.singletons.cmyk.getRgbItem(color, 0, rgbColor, 0);
        this.color = rgbColor;
        break;

      default:
        this.color = rgbColor;
        break;
    }
  }

  /**
   * Set the border style (as AnnotationBorderStyle object).
   *
   * @public
   * @memberof Annotation
   * @param {Dict} borderStyle - The border style dictionary
   */
  setBorderStyle(borderStyle) {
    if (
      typeof PDFJSDev === "undefined" ||
      PDFJSDev.test("!PRODUCTION || TESTING")
    ) {
      assert(this.rectangle, "setRectangle must have been called previously.");
    }

    this.borderStyle = new AnnotationBorderStyle();
    if (!isDict(borderStyle)) {
      return;
    }
    if (borderStyle.has("BS")) {
      const dict = borderStyle.get("BS");
      const dictType = dict.get("Type");

      if (!dictType || isName(dictType, "Border")) {
        this.borderStyle.setWidth(dict.get("W"), this.rectangle);
        this.borderStyle.setStyle(dict.get("S"));
        this.borderStyle.setDashArray(dict.getArray("D"));
      }
    } else if (borderStyle.has("Border")) {
      const array = borderStyle.getArray("Border");
      if (Array.isArray(array) && array.length >= 3) {
        this.borderStyle.setHorizontalCornerRadius(array[0]);
        this.borderStyle.setVerticalCornerRadius(array[1]);
        this.borderStyle.setWidth(array[2], this.rectangle);

        if (array.length === 4) {
          // Dash array available
          this.borderStyle.setDashArray(array[3]);
        }
      }
    } else {
      // There are no border entries in the dictionary. According to the
      // specification, we should draw a solid border of width 1 in that
      // case, but Adobe Reader did not implement that part of the
      // specification and instead draws no border at all, so we do the same.
      // See also https://github.com/mozilla/pdf.js/issues/6179.
      this.borderStyle.setWidth(0);
    }
  }

  /**
   * Set the (normal) appearance.
   *
   * @public
   * @memberof Annotation
   * @param {Dict} dict - The annotation's data dictionary
   */
  setAppearance(dict) {
    this.appearance = null;

    const appearanceStates = dict.get("AP");
    if (!isDict(appearanceStates)) {
      return;
    }

    // In case the normal appearance is a stream, then it is used directly.
    const normalAppearanceState = appearanceStates.get("N");
    if (isStream(normalAppearanceState)) {
      this.appearance = normalAppearanceState;
      return;
    }
    if (!isDict(normalAppearanceState)) {
      return;
    }

    // In case the normal appearance is a dictionary, the `AS` entry provides
    // the key of the stream in this dictionary.
    const as = dict.get("AS");
    if (!isName(as) || !normalAppearanceState.has(as.name)) {
      return;
    }
    this.appearance = normalAppearanceState.get(as.name);
  }

  loadResources(keys) {
    return this.appearance.dict.getAsync("Resources").then(resources => {
      if (!resources) {
        return undefined;
      }

      const objectLoader = new ObjectLoader(resources, keys, resources.xref);
      return objectLoader.load().then(function () {
        return resources;
      });
    });
  }

  getOperatorList(evaluator, task, renderForms, annotationStorage) {
    if (!this.appearance) {
      return Promise.resolve(new OperatorList());
    }

    const appearance = this.appearance;
    const data = this.data;
    const appearanceDict = appearance.dict;
    const resourcesPromise = this.loadResources([
      "ExtGState",
      "ColorSpace",
      "Pattern",
      "Shading",
      "XObject",
      "Font",
    ]);
    const bbox = appearanceDict.getArray("BBox") || [0, 0, 1, 1];
    const matrix = appearanceDict.getArray("Matrix") || [1, 0, 0, 1, 0, 0];
    const transform = getTransformMatrix(data.rect, bbox, matrix);

    return resourcesPromise.then(resources => {
      const opList = new OperatorList();
      opList.addOp(OPS.beginAnnotation, [data.rect, transform, matrix]);
      return evaluator
        .getOperatorList({
          stream: appearance,
          task,
          resources,
          operatorList: opList,
        })
        .then(() => {
          opList.addOp(OPS.endAnnotation, []);
          this.reset();
          return opList;
        });
    });
  }

  async save(evaluator, task, annotationStorage) {
    return null;
  }

  /**
   * Reset the annotation.
   *
   * This involves resetting the various streams that are either cached on the
   * annotation instance or created during its construction.
   *
   * @public
   * @memberof Annotation
   */
  reset() {
    if (
      (typeof PDFJSDev === "undefined" ||
        PDFJSDev.test("!PRODUCTION || TESTING")) &&
      this.appearance &&
      !this._streams.includes(this.appearance)
    ) {
      unreachable("The appearance stream should always be reset.");
    }

    for (const stream of this._streams) {
      stream.reset();
    }
  }
}

/**
 * Contains all data regarding an annotation's border style.
 */
class AnnotationBorderStyle {
  constructor() {
    this.width = 1;
    this.style = AnnotationBorderStyleType.SOLID;
    this.dashArray = [3];
    this.horizontalCornerRadius = 0;
    this.verticalCornerRadius = 0;
  }

  /**
   * Set the width.
   *
   * @public
   * @memberof AnnotationBorderStyle
   * @param {number} width - The width.
   * @param {Array} rect - The annotation `Rect` entry.
   */
  setWidth(width, rect = [0, 0, 0, 0]) {
    if (
      typeof PDFJSDev === "undefined" ||
      PDFJSDev.test("!PRODUCTION || TESTING")
    ) {
      assert(
        Array.isArray(rect) && rect.length === 4,
        "A valid `rect` parameter must be provided."
      );
    }

    // Some corrupt PDF generators may provide the width as a `Name`,
    // rather than as a number (fixes issue 10385).
    if (isName(width)) {
      this.width = 0; // This is consistent with the behaviour in Adobe Reader.
      return;
    }
    if (Number.isInteger(width)) {
      if (width > 0) {
        const maxWidth = (rect[2] - rect[0]) / 2;
        const maxHeight = (rect[3] - rect[1]) / 2;

        // Ignore large `width`s, since they lead to the Annotation overflowing
        // the size set by the `Rect` entry thus causing the `annotationLayer`
        // to render it over the surrounding document (fixes bug1552113.pdf).
        if (
          maxWidth > 0 &&
          maxHeight > 0 &&
          (width > maxWidth || width > maxHeight)
        ) {
          warn(`AnnotationBorderStyle.setWidth - ignoring width: ${width}`);
          width = 1;
        }
      }
      this.width = width;
    }
  }

  /**
   * Set the style.
   *
   * @public
   * @memberof AnnotationBorderStyle
   * @param {Name} style - The annotation style.
   * @see {@link shared/util.js}
   */
  setStyle(style) {
    if (!isName(style)) {
      return;
    }
    switch (style.name) {
      case "S":
        this.style = AnnotationBorderStyleType.SOLID;
        break;

      case "D":
        this.style = AnnotationBorderStyleType.DASHED;
        break;

      case "B":
        this.style = AnnotationBorderStyleType.BEVELED;
        break;

      case "I":
        this.style = AnnotationBorderStyleType.INSET;
        break;

      case "U":
        this.style = AnnotationBorderStyleType.UNDERLINE;
        break;

      default:
        break;
    }
  }

  /**
   * Set the dash array.
   *
   * @public
   * @memberof AnnotationBorderStyle
   * @param {Array} dashArray - The dash array with at least one element
   */
  setDashArray(dashArray) {
    // We validate the dash array, but we do not use it because CSS does not
    // allow us to change spacing of dashes. For more information, visit
    // http://www.w3.org/TR/css3-background/#the-border-style.
    if (Array.isArray(dashArray) && dashArray.length > 0) {
      // According to the PDF specification: the elements in `dashArray`
      // shall be numbers that are nonnegative and not all equal to zero.
      let isValid = true;
      let allZeros = true;
      for (const element of dashArray) {
        const validNumber = +element >= 0;
        if (!validNumber) {
          isValid = false;
          break;
        } else if (element > 0) {
          allZeros = false;
        }
      }
      if (isValid && !allZeros) {
        this.dashArray = dashArray;
      } else {
        this.width = 0; // Adobe behavior when the array is invalid.
      }
    } else if (dashArray) {
      this.width = 0; // Adobe behavior when the array is invalid.
    }
  }

  /**
   * Set the horizontal corner radius (from a Border dictionary).
   *
   * @public
   * @memberof AnnotationBorderStyle
   * @param {number} radius - The horizontal corner radius.
   */
  setHorizontalCornerRadius(radius) {
    if (Number.isInteger(radius)) {
      this.horizontalCornerRadius = radius;
    }
  }

  /**
   * Set the vertical corner radius (from a Border dictionary).
   *
   * @public
   * @memberof AnnotationBorderStyle
   * @param {number} radius - The vertical corner radius.
   */
  setVerticalCornerRadius(radius) {
    if (Number.isInteger(radius)) {
      this.verticalCornerRadius = radius;
    }
  }
}

class MarkupAnnotation extends Annotation {
  constructor(parameters) {
    super(parameters);

    const dict = parameters.dict;

    if (dict.has("IRT")) {
      const rawIRT = dict.getRaw("IRT");
      this.data.inReplyTo = isRef(rawIRT) ? rawIRT.toString() : null;

      const rt = dict.get("RT");
      this.data.replyType = isName(rt) ? rt.name : AnnotationReplyType.REPLY;
    }

    if (this.data.replyType === AnnotationReplyType.GROUP) {
      // Subordinate annotations in a group should inherit
      // the group attributes from the primary annotation.
      const parent = dict.get("IRT");

      this.data.title = stringToPDFString(parent.get("T") || "");

      this.setContents(parent.get("Contents"));
      this.data.contents = this.contents;

      if (!parent.has("CreationDate")) {
        this.data.creationDate = null;
      } else {
        this.setCreationDate(parent.get("CreationDate"));
        this.data.creationDate = this.creationDate;
      }

      if (!parent.has("M")) {
        this.data.modificationDate = null;
      } else {
        this.setModificationDate(parent.get("M"));
        this.data.modificationDate = this.modificationDate;
      }

      this.data.hasPopup = parent.has("Popup");

      if (!parent.has("C")) {
        // Fall back to the default background color.
        this.data.color = null;
      } else {
        this.setColor(parent.getArray("C"));
        this.data.color = this.color;
      }
    } else {
      this.data.title = stringToPDFString(dict.get("T") || "");

      this.setCreationDate(dict.get("CreationDate"));
      this.data.creationDate = this.creationDate;

      this.data.hasPopup = dict.has("Popup");

      if (!dict.has("C")) {
        // Fall back to the default background color.
        this.data.color = null;
      }
    }
  }

  /**
   * Set the creation date.
   *
   * @public
   * @memberof MarkupAnnotation
   * @param {string} creationDate - PDF date string that indicates when the
   *                                annotation was originally created
   */
  setCreationDate(creationDate) {
    this.creationDate = isString(creationDate) ? creationDate : null;
  }

  _setDefaultAppearance({
    xref,
    extra,
    strokeColor,
    fillColor,
    blendMode,
    pointsCallback,
  }) {
    let minX = Number.MAX_VALUE;
    let minY = Number.MAX_VALUE;
    let maxX = Number.MIN_VALUE;
    let maxY = Number.MIN_VALUE;

    const buffer = ["q"];
    if (extra) {
      buffer.push(extra);
    }
    if (strokeColor) {
      buffer.push(`${strokeColor[0]} ${strokeColor[1]} ${strokeColor[2]} RG`);
    }
    if (fillColor) {
      buffer.push(`${fillColor[0]} ${fillColor[1]} ${fillColor[2]} rg`);
    }

    for (const points of this.data.quadPoints) {
      const [mX, MX, mY, MY] = pointsCallback(buffer, points);
      minX = Math.min(minX, mX);
      maxX = Math.max(maxX, MX);
      minY = Math.min(minY, mY);
      maxY = Math.max(maxY, MY);
    }
    buffer.push("Q");

    const formDict = new Dict(xref);
    const appearanceStreamDict = new Dict(xref);
    appearanceStreamDict.set("Subtype", Name.get("Form"));

    const appearanceStream = new StringStream(buffer.join(" "));
    appearanceStream.dict = appearanceStreamDict;
    formDict.set("Fm0", appearanceStream);

    const gsDict = new Dict(xref);
    if (blendMode) {
      gsDict.set("BM", Name.get(blendMode));
    }

    const stateDict = new Dict(xref);
    stateDict.set("GS0", gsDict);

    const resources = new Dict(xref);
    resources.set("ExtGState", stateDict);
    resources.set("XObject", formDict);

    const appearanceDict = new Dict(xref);
    appearanceDict.set("Resources", resources);
    const bbox = (this.data.rect = [minX, minY, maxX, maxY]);
    appearanceDict.set("BBox", bbox);

    this.appearance = new StringStream("/GS0 gs /Fm0 Do");
    this.appearance.dict = appearanceDict;

    // This method is only called if there is no appearance for the annotation,
    // so `this.appearance` is not pushed yet in the `Annotation` constructor.
    this._streams.push(this.appearance, appearanceStream);
  }
}

class WidgetAnnotation extends Annotation {
  constructor(params) {
    super(params);

    const dict = params.dict;
    const data = this.data;
    this.ref = params.ref;

    data.annotationType = AnnotationType.WIDGET;
    data.fieldName = this._constructFieldName(dict);

    const fieldValue = getInheritableProperty({
      dict,
      key: "V",
      getArray: true,
    });
    data.fieldValue = this._decodeFormValue(fieldValue);

    data.alternativeText = stringToPDFString(dict.get("TU") || "");
    data.defaultAppearance =
      getInheritableProperty({ dict, key: "DA" }) ||
      params.acroForm.get("DA") ||
      "";
    const fieldType = getInheritableProperty({ dict, key: "FT" });
    data.fieldType = isName(fieldType) ? fieldType.name : null;

    const localResources = getInheritableProperty({ dict, key: "DR" });
    const acroFormResources = params.acroForm.get("DR");
    this._fieldResources = {
      localResources,
      acroFormResources,
      mergedResources: Dict.merge({
        xref: params.xref,
        dictArray: [localResources, acroFormResources],
        mergeSubDicts: true,
      }),
    };

    data.fieldFlags = getInheritableProperty({ dict, key: "Ff" });
    if (!Number.isInteger(data.fieldFlags) || data.fieldFlags < 0) {
      data.fieldFlags = 0;
    }

    data.readOnly = this.hasFieldFlag(AnnotationFieldFlag.READONLY);

    // Hide signatures because we cannot validate them, and unset the fieldValue
    // since it's (most likely) a `Dict` which is non-serializable and will thus
    // cause errors when sending annotations to the main-thread (issue 10347).
    if (data.fieldType === "Sig") {
      data.fieldValue = null;
      this.setFlags(AnnotationFlag.HIDDEN);
    }
  }

  /**
   * Construct the (fully qualified) field name from the (partial) field
   * names of the field and its ancestors.
   *
   * @private
   * @memberof WidgetAnnotation
   * @param {Dict} dict - Complete widget annotation dictionary
   * @returns {string}
   */
  _constructFieldName(dict) {
    // Both the `Parent` and `T` fields are optional. While at least one of
    // them should be provided, bad PDF generators may fail to do so.
    if (!dict.has("T") && !dict.has("Parent")) {
      warn("Unknown field name, falling back to empty field name.");
      return "";
    }

    // If no parent exists, the partial and fully qualified names are equal.
    if (!dict.has("Parent")) {
      return stringToPDFString(dict.get("T"));
    }

    // Form the fully qualified field name by appending the partial name to
    // the parent's fully qualified name, separated by a period.
    const fieldName = [];
    if (dict.has("T")) {
      fieldName.unshift(stringToPDFString(dict.get("T")));
    }

    let loopDict = dict;
    while (loopDict.has("Parent")) {
      loopDict = loopDict.get("Parent");
      if (!isDict(loopDict)) {
        // Even though it is not allowed according to the PDF specification,
        // bad PDF generators may provide a `Parent` entry that is not a
        // dictionary, but `null` for example (issue 8143).
        break;
      }

      if (loopDict.has("T")) {
        fieldName.unshift(stringToPDFString(loopDict.get("T")));
      }
    }
    return fieldName.join(".");
  }

  /**
   * Decode the given form value.
   *
   * @private
   * @memberof WidgetAnnotation
   * @param {Array<string>|Name|string} formValue - The (possibly encoded)
   *   form value.
   * @returns {Array<string>|string|null}
   */
  _decodeFormValue(formValue) {
    if (Array.isArray(formValue)) {
      return formValue
        .filter(item => isString(item))
        .map(item => stringToPDFString(item));
    } else if (isName(formValue)) {
      return stringToPDFString(formValue.name);
    } else if (isString(formValue)) {
      return stringToPDFString(formValue);
    }
    return null;
  }

  /**
   * Check if a provided field flag is set.
   *
   * @public
   * @memberof WidgetAnnotation
   * @param {number} flag - Hexadecimal representation for an annotation
   *                        field characteristic
   * @returns {boolean}
   * @see {@link shared/util.js}
   */
  hasFieldFlag(flag) {
    return !!(this.data.fieldFlags & flag);
  }

  getOperatorList(evaluator, task, renderForms, annotationStorage) {
    // Do not render form elements on the canvas when interactive forms are
    // enabled. The display layer is responsible for rendering them instead.
    if (renderForms) {
      return Promise.resolve(new OperatorList());
    }

    if (!this._hasText) {
      return super.getOperatorList(
        evaluator,
        task,
        renderForms,
        annotationStorage
      );
    }

    return this._getAppearance(evaluator, task, annotationStorage).then(
      content => {
        if (this.appearance && content === null) {
          return super.getOperatorList(
            evaluator,
            task,
            renderForms,
            annotationStorage
          );
        }

        const operatorList = new OperatorList();

        // Even if there is an appearance stream, ignore it. This is the
        // behaviour used by Adobe Reader.
        if (!this.data.defaultAppearance || content === null) {
          return operatorList;
        }

        const matrix = [1, 0, 0, 1, 0, 0];
        const bbox = [
          0,
          0,
          this.data.rect[2] - this.data.rect[0],
          this.data.rect[3] - this.data.rect[1],
        ];

        const transform = getTransformMatrix(this.data.rect, bbox, matrix);
        operatorList.addOp(OPS.beginAnnotation, [
          this.data.rect,
          transform,
          matrix,
        ]);

        const stream = new StringStream(content);
        return evaluator
          .getOperatorList({
            stream,
            task,
            resources: this._fieldResources.mergedResources,
            operatorList,
          })
          .then(function () {
            operatorList.addOp(OPS.endAnnotation, []);
            return operatorList;
          });
      }
    );
  }

  async save(evaluator, task, annotationStorage) {
    if (this.data.fieldValue === annotationStorage[this.data.id]) {
      return null;
    }

    let appearance = await this._getAppearance(
      evaluator,
      task,
      annotationStorage
    );
    if (appearance === null) {
      return null;
    }
    const { xref } = evaluator;

    const dict = xref.fetchIfRef(this.ref);
    if (!isDict(dict)) {
      return null;
    }

    const value = annotationStorage[this.data.id];
    const bbox = [
      0,
      0,
      this.data.rect[2] - this.data.rect[0],
      this.data.rect[3] - this.data.rect[1],
    ];

    const xfa = {
      path: stringToPDFString(dict.get("T") || ""),
      value,
    };

    const newRef = xref.getNewRef();
    const AP = new Dict(xref);
    AP.set("N", newRef);

    const encrypt = xref.encrypt;
    let originalTransform = null;
    let newTransform = null;
    if (encrypt) {
      originalTransform = encrypt.createCipherTransform(
        this.ref.num,
        this.ref.gen
      );
      newTransform = encrypt.createCipherTransform(newRef.num, newRef.gen);
      appearance = newTransform.encryptString(appearance);
    }

    dict.set("V", value);
    dict.set("AP", AP);
    dict.set("M", `D:${getModificationDate()}`);

    const appearanceDict = new Dict(xref);
    appearanceDict.set("Length", appearance.length);
    appearanceDict.set("Subtype", Name.get("Form"));
    appearanceDict.set("Resources", this._getSaveFieldResources(xref));
    appearanceDict.set("BBox", bbox);

    const bufferOriginal = [`${this.ref.num} ${this.ref.gen} obj\n`];
    writeDict(dict, bufferOriginal, originalTransform);
    bufferOriginal.push("\nendobj\n");

    const bufferNew = [`${newRef.num} ${newRef.gen} obj\n`];
    writeDict(appearanceDict, bufferNew, newTransform);
    bufferNew.push(" stream\n");
    bufferNew.push(appearance);
    bufferNew.push("\nendstream\nendobj\n");

    return [
      // data for the original object
      // V field changed + reference for new AP
      { ref: this.ref, data: bufferOriginal.join(""), xfa },
      // data for the new AP
      { ref: newRef, data: bufferNew.join(""), xfa: null },
    ];
  }

  async _getAppearance(evaluator, task, annotationStorage) {
    this._fontName = null;

    const isPassword = this.hasFieldFlag(AnnotationFieldFlag.PASSWORD);
    if (!annotationStorage || isPassword) {
      return null;
    }
    const value = annotationStorage[this.data.id];
    if (value === "") {
      return "";
    }

    const defaultPadding = 2;
    const hPadding = defaultPadding;
    const totalHeight = this.data.rect[3] - this.data.rect[1];
    const totalWidth = this.data.rect[2] - this.data.rect[0];

    const fontInfo = await this._getFontData(evaluator, task);
    const [font, fontName] = fontInfo;
    const fontSize = this._computeFontSize(...fontInfo, totalHeight);
    this._fontName = fontName;

    let descent = font.descent;
    if (isNaN(descent)) {
      descent = 0;
    }

    const vPadding = defaultPadding + Math.abs(descent) * fontSize;
    const defaultAppearance = this.data.defaultAppearance;
    const alignment = this.data.textAlignment;

    if (this.data.comb) {
      return this._getCombAppearance(
        defaultAppearance,
        value,
        totalWidth,
        hPadding,
        vPadding
      );
    }

    if (this.data.multiLine) {
      return this._getMultilineAppearance(
        defaultAppearance,
        value,
        font,
        fontSize,
        totalWidth,
        totalHeight,
        alignment,
        hPadding,
        vPadding
      );
    }

    if (alignment === 0 || alignment > 2) {
      // Left alignment: nothing to do
      return (
        "/Tx BMC q BT " +
        defaultAppearance +
        ` 1 0 0 1 ${hPadding} ${vPadding} Tm (${escapeString(value)}) Tj` +
        " ET Q EMC"
      );
    }

    const renderedText = this._renderText(
      value,
      font,
      fontSize,
      totalWidth,
      alignment,
      hPadding,
      vPadding
    );
    return (
      "/Tx BMC q BT " +
      defaultAppearance +
      ` 1 0 0 1 0 0 Tm ${renderedText}` +
      " ET Q EMC"
    );
  }

  async _getFontData(evaluator, task) {
    const operatorList = new OperatorList();
    const initialState = {
      fontSize: 0,
      font: null,
      fontName: null,
      clone() {
        return this;
      },
    };

    await evaluator.getOperatorList({
      stream: new StringStream(this.data.defaultAppearance),
      task,
      resources: this._fieldResources.mergedResources,
      operatorList,
      initialState,
    });

    return [initialState.font, initialState.fontName, initialState.fontSize];
  }

  _computeFontSize(font, fontName, fontSize, height) {
    if (fontSize === null || fontSize === 0) {
      const em = font.charsToGlyphs("M", true)[0].width / 1000;
      // According to https://en.wikipedia.org/wiki/Em_(typography)
      // an average cap height should be 70% of 1em
      const capHeight = 0.7 * em;
      // 1.5 * capHeight * fontSize seems to be a good value for lineHeight
      fontSize = Math.max(1, Math.floor(height / (1.5 * capHeight)));

      let fontRegex = new RegExp(`/${fontName}\\s+[0-9\.]+\\s+Tf`);
      if (this.data.defaultAppearance.search(fontRegex) === -1) {
        // The font size is missing
        fontRegex = new RegExp(`/${fontName}\\s+Tf`);
      }
      this.data.defaultAppearance = this.data.defaultAppearance.replace(
        fontRegex,
        `/${fontName} ${fontSize} Tf`
      );
    }
    return fontSize;
  }

  _renderText(text, font, fontSize, totalWidth, alignment, hPadding, vPadding) {
    // We need to get the width of the text in order to align it correctly
    const glyphs = font.charsToGlyphs(text);
    const scale = fontSize / 1000;
    let width = 0;
    for (const glyph of glyphs) {
      width += glyph.width * scale;
    }

    let shift;
    if (alignment === 1) {
      // Center
      shift = (totalWidth - width) / 2;
    } else if (alignment === 2) {
      // Right
      shift = totalWidth - width - hPadding;
    } else {
      shift = hPadding;
    }
    shift = shift.toFixed(2);
    vPadding = vPadding.toFixed(2);

    return `${shift} ${vPadding} Td (${escapeString(text)}) Tj`;
  }

  /**
   * @private
   */
  _getSaveFieldResources(xref) {
    if (
      typeof PDFJSDev === "undefined" ||
      PDFJSDev.test("!PRODUCTION || TESTING")
    ) {
      assert(
        this._fontName !== undefined,
        "Expected `_getAppearance()` to have been called."
      );
    }
    const { localResources, acroFormResources } = this._fieldResources;

    if (!this._fontName) {
      return localResources || Dict.empty;
    }
    if (localResources instanceof Dict) {
      const localFont = localResources.get("Font");
      if (localFont instanceof Dict && localFont.has(this._fontName)) {
        return localResources;
      }
    }
    if (acroFormResources instanceof Dict) {
      const acroFormFont = acroFormResources.get("Font");
      if (acroFormFont instanceof Dict && acroFormFont.has(this._fontName)) {
        const subFontDict = new Dict(xref);
        subFontDict.set(this._fontName, acroFormFont.getRaw(this._fontName));

        const subResourcesDict = new Dict(xref);
        subResourcesDict.set("Font", subFontDict);

        return Dict.merge({
          xref,
          dictArray: [subResourcesDict, localResources],
          mergeSubDicts: true,
        });
      }
    }
    return localResources || Dict.empty;
  }
}

class TextWidgetAnnotation extends WidgetAnnotation {
  constructor(params) {
    super(params);

    this._hasText = true;

    const dict = params.dict;

    // The field value is always a string.
    if (!isString(this.data.fieldValue)) {
      this.data.fieldValue = "";
    }

    // Determine the alignment of text in the field.
    let alignment = getInheritableProperty({ dict, key: "Q" });
    if (!Number.isInteger(alignment) || alignment < 0 || alignment > 2) {
      alignment = null;
    }
    this.data.textAlignment = alignment;

    // Determine the maximum length of text in the field.
    let maximumLength = getInheritableProperty({ dict, key: "MaxLen" });
    if (!Number.isInteger(maximumLength) || maximumLength < 0) {
      maximumLength = null;
    }
    this.data.maxLen = maximumLength;

    // Process field flags for the display layer.
    this.data.multiLine = this.hasFieldFlag(AnnotationFieldFlag.MULTILINE);
    this.data.comb =
      this.hasFieldFlag(AnnotationFieldFlag.COMB) &&
      !this.hasFieldFlag(AnnotationFieldFlag.MULTILINE) &&
      !this.hasFieldFlag(AnnotationFieldFlag.PASSWORD) &&
      !this.hasFieldFlag(AnnotationFieldFlag.FILESELECT) &&
      this.data.maxLen !== null;
  }

  _getCombAppearance(defaultAppearance, text, width, hPadding, vPadding) {
    const combWidth = (width / this.data.maxLen).toFixed(2);
    const buf = [];
    for (const character of text) {
      buf.push(`(${escapeString(character)}) Tj`);
    }

    const renderedComb = buf.join(` ${combWidth} 0 Td `);
    return (
      "/Tx BMC q BT " +
      defaultAppearance +
      ` 1 0 0 1 ${hPadding} ${vPadding} Tm ${renderedComb}` +
      " ET Q EMC"
    );
  }

  _getMultilineAppearance(
    defaultAppearance,
    text,
    font,
    fontSize,
    width,
    height,
    alignment,
    hPadding,
    vPadding
  ) {
    const lines = text.split(/\r\n|\r|\n/);
    const buf = [];
    const totalWidth = width - 2 * hPadding;
    for (const line of lines) {
      const chunks = this._splitLine(line, font, fontSize, totalWidth);
      for (const chunk of chunks) {
        const padding = buf.length === 0 ? hPadding : 0;
        buf.push(
          this._renderText(
            chunk,
            font,
            fontSize,
            width,
            alignment,
            padding,
            -fontSize // <0 because a line is below the previous one
          )
        );
      }
    }

    const renderedText = buf.join("\n");
    return (
      "/Tx BMC q BT " +
      defaultAppearance +
      ` 1 0 0 1 0 ${height} Tm ${renderedText}` +
      " ET Q EMC"
    );
  }

  _splitLine(line, font, fontSize, width) {
    if (line.length <= 1) {
      // Nothing to split
      return [line];
    }

    const scale = fontSize / 1000;
    const whitespace = font.charsToGlyphs(" ", true)[0].width * scale;
    const chunks = [];

    let lastSpacePos = -1,
      startChunk = 0,
      currentWidth = 0;

    for (let i = 0, ii = line.length; i < ii; i++) {
      const character = line.charAt(i);
      if (character === " ") {
        if (currentWidth + whitespace > width) {
          // We can break here
          chunks.push(line.substring(startChunk, i));
          startChunk = i;
          currentWidth = whitespace;
          lastSpacePos = -1;
        } else {
          currentWidth += whitespace;
          lastSpacePos = i;
        }
      } else {
        const charWidth = font.charsToGlyphs(character, false)[0].width * scale;
        if (currentWidth + charWidth > width) {
          // We must break to the last white position (if available)
          if (lastSpacePos !== -1) {
            chunks.push(line.substring(startChunk, lastSpacePos + 1));
            startChunk = i = lastSpacePos + 1;
            lastSpacePos = -1;
            currentWidth = 0;
          } else {
            // Just break in the middle of the word
            chunks.push(line.substring(startChunk, i));
            startChunk = i;
            currentWidth = charWidth;
          }
        } else {
          currentWidth += charWidth;
        }
      }
    }

    if (startChunk < line.length) {
      chunks.push(line.substring(startChunk, line.length));
    }

    return chunks;
  }
}

class ButtonWidgetAnnotation extends WidgetAnnotation {
  constructor(params) {
    super(params);

    this.checkedAppearance = null;
    this.uncheckedAppearance = null;

    this.data.checkBox =
      !this.hasFieldFlag(AnnotationFieldFlag.RADIO) &&
      !this.hasFieldFlag(AnnotationFieldFlag.PUSHBUTTON);
    this.data.radioButton =
      this.hasFieldFlag(AnnotationFieldFlag.RADIO) &&
      !this.hasFieldFlag(AnnotationFieldFlag.PUSHBUTTON);
    this.data.pushButton = this.hasFieldFlag(AnnotationFieldFlag.PUSHBUTTON);

    if (this.data.checkBox) {
      this._processCheckBox(params);
    } else if (this.data.radioButton) {
      this._processRadioButton(params);
    } else if (this.data.pushButton) {
      this._processPushButton(params);
    } else {
      warn("Invalid field flags for button widget annotation");
    }
  }

  getOperatorList(evaluator, task, renderForms, annotationStorage) {
    if (this.data.pushButton) {
      return super.getOperatorList(
        evaluator,
        task,
        false, // we use normalAppearance to render the button
        annotationStorage
      );
    }

    if (annotationStorage) {
      const value = annotationStorage[this.data.id] || false;
      let appearance;
      if (value) {
        appearance = this.checkedAppearance;
      } else {
        appearance = this.uncheckedAppearance;
      }

      if (appearance) {
        const savedAppearance = this.appearance;
        this.appearance = appearance;
        const operatorList = super.getOperatorList(
          evaluator,
          task,
          renderForms,
          annotationStorage
        );
        this.appearance = savedAppearance;
        return operatorList;
      }

      // No appearance
      return Promise.resolve(new OperatorList());
    }
    return super.getOperatorList(
      evaluator,
      task,
      renderForms,
      annotationStorage
    );
  }

  async save(evaluator, task, annotationStorage) {
    if (this.data.checkBox) {
      return this._saveCheckbox(evaluator, task, annotationStorage);
    }

    if (this.data.radioButton) {
      return this._saveRadioButton(evaluator, task, annotationStorage);
    }

    // Nothing to save
    return null;
  }

  async _saveCheckbox(evaluator, task, annotationStorage) {
    const defaultValue = this.data.fieldValue && this.data.fieldValue !== "Off";
    const value = annotationStorage[this.data.id];

    if (defaultValue === value) {
      return null;
    }

    const dict = evaluator.xref.fetchIfRef(this.ref);
    if (!isDict(dict)) {
      return null;
    }

    const xfa = {
      path: stringToPDFString(dict.get("T") || ""),
      value: value ? this.data.exportValue : "",
    };

    const name = Name.get(value ? this.data.exportValue : "Off");
    dict.set("V", name);
    dict.set("AS", name);
    dict.set("M", `D:${getModificationDate()}`);

    const encrypt = evaluator.xref.encrypt;
    let originalTransform = null;
    if (encrypt) {
      originalTransform = encrypt.createCipherTransform(
        this.ref.num,
        this.ref.gen
      );
    }

    const buffer = [`${this.ref.num} ${this.ref.gen} obj\n`];
    writeDict(dict, buffer, originalTransform);
    buffer.push("\nendobj\n");

    return [{ ref: this.ref, data: buffer.join(""), xfa }];
  }

  async _saveRadioButton(evaluator, task, annotationStorage) {
    const defaultValue = this.data.fieldValue === this.data.buttonValue;
    const value = annotationStorage[this.data.id];

    if (defaultValue === value) {
      return null;
    }

    const dict = evaluator.xref.fetchIfRef(this.ref);
    if (!isDict(dict)) {
      return null;
    }

    const xfa = {
      path: stringToPDFString(dict.get("T") || ""),
      value: value ? this.data.buttonValue : "",
    };

    const name = Name.get(value ? this.data.buttonValue : "Off");
    let parentBuffer = null;
    const encrypt = evaluator.xref.encrypt;

    if (value) {
      if (isRef(this.parent)) {
        const parent = evaluator.xref.fetch(this.parent);
        let parentTransform = null;
        if (encrypt) {
          parentTransform = encrypt.createCipherTransform(
            this.parent.num,
            this.parent.gen
          );
        }
        parent.set("V", name);
        parentBuffer = [`${this.parent.num} ${this.parent.gen} obj\n`];
        writeDict(parent, parentBuffer, parentTransform);
        parentBuffer.push("\nendobj\n");
      } else if (isDict(this.parent)) {
        this.parent.set("V", name);
      }
    }

    dict.set("AS", name);
    dict.set("M", `D:${getModificationDate()}`);

    let originalTransform = null;
    if (encrypt) {
      originalTransform = encrypt.createCipherTransform(
        this.ref.num,
        this.ref.gen
      );
    }

    const buffer = [`${this.ref.num} ${this.ref.gen} obj\n`];
    writeDict(dict, buffer, originalTransform);
    buffer.push("\nendobj\n");

    const newRefs = [{ ref: this.ref, data: buffer.join(""), xfa }];
    if (parentBuffer !== null) {
      newRefs.push({
        ref: this.parent,
        data: parentBuffer.join(""),
        xfa: null,
      });
    }

    return newRefs;
  }

  _processCheckBox(params) {
    const customAppearance = params.dict.get("AP");
    if (!isDict(customAppearance)) {
      return;
    }

    const normalAppearance = customAppearance.get("N");
    if (!isDict(normalAppearance)) {
      return;
    }

    const exportValues = normalAppearance.getKeys();
    if (!exportValues.includes("Off")) {
      // The /Off appearance is optional.
      exportValues.push("Off");
    }
    if (exportValues.length !== 2) {
      return;
    }

    this.data.exportValue =
      exportValues[0] === "Off" ? exportValues[1] : exportValues[0];

    this.checkedAppearance = normalAppearance.get(this.data.exportValue);
    this.uncheckedAppearance = normalAppearance.get("Off") || null;
  }

  _processRadioButton(params) {
    this.data.fieldValue = this.data.buttonValue = null;

    // The parent field's `V` entry holds a `Name` object with the appearance
    // state of whichever child field is currently in the "on" state.
    const fieldParent = params.dict.get("Parent");
    if (isDict(fieldParent)) {
      this.parent = params.dict.getRaw("Parent");
      const fieldParentValue = fieldParent.get("V");
      if (isName(fieldParentValue)) {
        this.data.fieldValue = this._decodeFormValue(fieldParentValue);
      }
    }

    // The button's value corresponds to its appearance state.
    const appearanceStates = params.dict.get("AP");
    if (!isDict(appearanceStates)) {
      return;
    }
    const normalAppearance = appearanceStates.get("N");
    if (!isDict(normalAppearance)) {
      return;
    }
    for (const key of normalAppearance.getKeys()) {
      if (key !== "Off") {
        this.data.buttonValue = this._decodeFormValue(key);
        break;
      }
    }

    this.checkedAppearance = normalAppearance.get(this.data.buttonValue);
    this.uncheckedAppearance = normalAppearance.get("Off") || null;
  }

  _processPushButton(params) {
    if (!params.dict.has("A")) {
      warn("Push buttons without action dictionaries are not supported");
      return;
    }

    Catalog.parseDestDictionary({
      destDict: params.dict,
      resultObj: this.data,
      docBaseUrl: params.pdfManager.docBaseUrl,
    });
  }
}

class ChoiceWidgetAnnotation extends WidgetAnnotation {
  constructor(params) {
    super(params);

    // Determine the options. The options array may consist of strings or
    // arrays. If the array consists of arrays, then the first element of
    // each array is the export value and the second element of each array is
    // the display value. If the array consists of strings, then these
    // represent both the export and display value. In this case, we convert
    // it to an array of arrays as well for convenience in the display layer.
    // Note that the specification does not state that the `Opt` field is
    // inheritable, but in practice PDF generators do make annotations
    // inherit the options from a parent annotation (issue 8094).
    this.data.options = [];

    const options = getInheritableProperty({ dict: params.dict, key: "Opt" });
    if (Array.isArray(options)) {
      const xref = params.xref;
      for (let i = 0, ii = options.length; i < ii; i++) {
        const option = xref.fetchIfRef(options[i]);
        const isOptionArray = Array.isArray(option);

        this.data.options[i] = {
          exportValue: this._decodeFormValue(
            isOptionArray ? xref.fetchIfRef(option[0]) : option
          ),
          displayValue: this._decodeFormValue(
            isOptionArray ? xref.fetchIfRef(option[1]) : option
          ),
        };
      }
    }

    // The field value can be `null` if no item is selected, a string if one
    // item is selected or an array of strings if multiple items are selected.
    // For consistency in the API and convenience in the display layer, we
    // always make the field value an array with zero, one or multiple items.
    if (isString(this.data.fieldValue)) {
      this.data.fieldValue = [this.data.fieldValue];
    } else if (!this.data.fieldValue) {
      this.data.fieldValue = [];
    }

    // Process field flags for the display layer.
    this.data.combo = this.hasFieldFlag(AnnotationFieldFlag.COMBO);
    this.data.multiSelect = this.hasFieldFlag(AnnotationFieldFlag.MULTISELECT);
    this._hasText = true;
  }
}

class TextAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    const DEFAULT_ICON_SIZE = 22; // px

    super(parameters);

    const dict = parameters.dict;
    this.data.annotationType = AnnotationType.TEXT;

    if (this.data.hasAppearance) {
      this.data.name = "NoIcon";
    } else {
      this.data.rect[1] = this.data.rect[3] - DEFAULT_ICON_SIZE;
      this.data.rect[2] = this.data.rect[0] + DEFAULT_ICON_SIZE;
      this.data.name = dict.has("Name") ? dict.get("Name").name : "Note";
    }

    if (dict.has("State")) {
      this.data.state = dict.get("State") || null;
      this.data.stateModel = dict.get("StateModel") || null;
    } else {
      this.data.state = null;
      this.data.stateModel = null;
    }
  }
}

class LinkAnnotation extends Annotation {
  constructor(params) {
    super(params);

    this.data.annotationType = AnnotationType.LINK;

    const quadPoints = getQuadPoints(params.dict, this.rectangle);
    if (quadPoints) {
      this.data.quadPoints = quadPoints;
    }

    Catalog.parseDestDictionary({
      destDict: params.dict,
      resultObj: this.data,
      docBaseUrl: params.pdfManager.docBaseUrl,
    });
  }
}

class PopupAnnotation extends Annotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.POPUP;

    let parentItem = parameters.dict.get("Parent");
    if (!parentItem) {
      warn("Popup annotation has a missing or invalid parent annotation.");
      return;
    }

    const parentSubtype = parentItem.get("Subtype");
    this.data.parentType = isName(parentSubtype) ? parentSubtype.name : null;
    const rawParent = parameters.dict.getRaw("Parent");
    this.data.parentId = isRef(rawParent) ? rawParent.toString() : null;

    const rt = parentItem.get("RT");
    if (isName(rt, AnnotationReplyType.GROUP)) {
      // Subordinate annotations in a group should inherit
      // the group attributes from the primary annotation.
      parentItem = parentItem.get("IRT");
    }

    if (!parentItem.has("M")) {
      this.data.modificationDate = null;
    } else {
      this.setModificationDate(parentItem.get("M"));
      this.data.modificationDate = this.modificationDate;
    }

    if (!parentItem.has("C")) {
      // Fall back to the default background color.
      this.data.color = null;
    } else {
      this.setColor(parentItem.getArray("C"));
      this.data.color = this.color;
    }

    // If the Popup annotation is not viewable, but the parent annotation is,
    // that is most likely a bug. Fallback to inherit the flags from the parent
    // annotation (this is consistent with the behaviour in Adobe Reader).
    if (!this.viewable) {
      const parentFlags = parentItem.get("F");
      if (this._isViewable(parentFlags)) {
        this.setFlags(parentFlags);
      }
    }

    this.data.title = stringToPDFString(parentItem.get("T") || "");
    this.data.contents = stringToPDFString(parentItem.get("Contents") || "");
  }
}

class FreeTextAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.FREETEXT;
  }
}

class LineAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.LINE;

    this.data.lineCoordinates = Util.normalizeRect(
      parameters.dict.getArray("L")
    );
  }
}

class SquareAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.SQUARE;
  }
}

class CircleAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.CIRCLE;
  }
}

class PolylineAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.POLYLINE;
    this.data.vertices = [];

    // The vertices array is an array of numbers representing the alternating
    // horizontal and vertical coordinates, respectively, of each vertex.
    // Convert this to an array of objects with x and y coordinates.
    const rawVertices = parameters.dict.getArray("Vertices");
    if (!Array.isArray(rawVertices)) {
      return;
    }
    for (let i = 0, ii = rawVertices.length; i < ii; i += 2) {
      this.data.vertices.push({
        x: rawVertices[i],
        y: rawVertices[i + 1],
      });
    }
  }
}

class PolygonAnnotation extends PolylineAnnotation {
  constructor(parameters) {
    // Polygons are specific forms of polylines, so reuse their logic.
    super(parameters);

    this.data.annotationType = AnnotationType.POLYGON;
  }
}

class CaretAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.CARET;
  }
}

class InkAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.INK;
    this.data.inkLists = [];

    const rawInkLists = parameters.dict.getArray("InkList");
    if (!Array.isArray(rawInkLists)) {
      return;
    }
    const xref = parameters.xref;
    for (let i = 0, ii = rawInkLists.length; i < ii; ++i) {
      // The raw ink lists array contains arrays of numbers representing
      // the alternating horizontal and vertical coordinates, respectively,
      // of each vertex. Convert this to an array of objects with x and y
      // coordinates.
      this.data.inkLists.push([]);
      for (let j = 0, jj = rawInkLists[i].length; j < jj; j += 2) {
        this.data.inkLists[i].push({
          x: xref.fetchIfRef(rawInkLists[i][j]),
          y: xref.fetchIfRef(rawInkLists[i][j + 1]),
        });
      }
    }
  }
}

class HighlightAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.HIGHLIGHT;

    const quadPoints = getQuadPoints(parameters.dict, null);
    if (quadPoints) {
      this.data.quadPoints = quadPoints;
      if (!this.appearance) {
        // Default color is yellow in Acrobat Reader
        const fillColor = this.color
          ? Array.from(this.color).map(c => c / 255)
          : [1, 1, 0];
        this._setDefaultAppearance({
          xref: parameters.xref,
          fillColor,
          blendMode: "Multiply",
          pointsCallback: (buffer, points) => {
            buffer.push(`${points[0].x} ${points[0].y} m`);
            buffer.push(`${points[1].x} ${points[1].y} l`);
            buffer.push(`${points[3].x} ${points[3].y} l`);
            buffer.push(`${points[2].x} ${points[2].y} l`);
            buffer.push("f");
            return [points[0].x, points[1].x, points[3].y, points[1].y];
          },
        });
      }
    }
  }
}

class UnderlineAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.UNDERLINE;

    const quadPoints = getQuadPoints(parameters.dict, null);
    if (quadPoints) {
      this.data.quadPoints = quadPoints;
      if (!this.appearance) {
        // Default color is black
        const strokeColor = this.color
          ? Array.from(this.color).map(c => c / 255)
          : [0, 0, 0];
        this._setDefaultAppearance({
          xref: parameters.xref,
          extra: "[] 0 d 1 w",
          strokeColor,
          pointsCallback: (buffer, points) => {
            buffer.push(`${points[2].x} ${points[2].y} m`);
            buffer.push(`${points[3].x} ${points[3].y} l`);
            buffer.push("S");
            return [points[0].x, points[1].x, points[3].y, points[1].y];
          },
        });
      }
    }
  }
}

class SquigglyAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.SQUIGGLY;

    const quadPoints = getQuadPoints(parameters.dict, null);
    if (quadPoints) {
      this.data.quadPoints = quadPoints;
      if (!this.appearance) {
        // Default color is black
        const strokeColor = this.color
          ? Array.from(this.color).map(c => c / 255)
          : [0, 0, 0];
        this._setDefaultAppearance({
          xref: parameters.xref,
          extra: "[] 0 d 1 w",
          strokeColor,
          pointsCallback: (buffer, points) => {
            const dy = (points[0].y - points[2].y) / 6;
            let shift = dy;
            let x = points[2].x;
            const y = points[2].y;
            const xEnd = points[3].x;
            buffer.push(`${x} ${y + shift} m`);
            do {
              x += 2;
              shift = shift === 0 ? dy : 0;
              buffer.push(`${x} ${y + shift} l`);
            } while (x < xEnd);
            buffer.push("S");
            return [points[2].x, xEnd, y - 2 * dy, y + 2 * dy];
          },
        });
      }
    }
  }
}

class StrikeOutAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.STRIKEOUT;

    const quadPoints = getQuadPoints(parameters.dict, null);
    if (quadPoints) {
      this.data.quadPoints = quadPoints;
      if (!this.appearance) {
        // Default color is black
        const strokeColor = this.color
          ? Array.from(this.color).map(c => c / 255)
          : [0, 0, 0];
        this._setDefaultAppearance({
          xref: parameters.xref,
          extra: "[] 0 d 1 w",
          strokeColor,
          pointsCallback: (buffer, points) => {
            buffer.push(
              `${(points[0].x + points[2].x) / 2}` +
                ` ${(points[0].y + points[2].y) / 2} m`
            );
            buffer.push(
              `${(points[1].x + points[3].x) / 2}` +
                ` ${(points[1].y + points[3].y) / 2} l`
            );
            buffer.push("S");
            return [points[0].x, points[1].x, points[3].y, points[1].y];
          },
        });
      }
    }
  }
}

class StampAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);

    this.data.annotationType = AnnotationType.STAMP;
  }
}

class FileAttachmentAnnotation extends MarkupAnnotation {
  constructor(parameters) {
    super(parameters);

    const file = new FileSpec(parameters.dict.get("FS"), parameters.xref);

    this.data.annotationType = AnnotationType.FILEATTACHMENT;
    this.data.file = file.serializable;
  }
}

export {
  Annotation,
  AnnotationBorderStyle,
  AnnotationFactory,
  MarkupAnnotation,
  getQuadPoints,
};
