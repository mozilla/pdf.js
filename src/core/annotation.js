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
  AnnotationActionEventType,
  AnnotationBorderStyleType,
  AnnotationEditorType,
  AnnotationFieldFlag,
  AnnotationFlag,
  AnnotationReplyType,
  AnnotationType,
  assert,
  BASELINE_FACTOR,
  FeatureTest,
  getModificationDate,
  IDENTITY_MATRIX,
  info,
  LINE_DESCENT_FACTOR,
  LINE_FACTOR,
  OPS,
  RenderingIntentFlag,
  shadow,
  stringToPDFString,
  unreachable,
  Util,
  warn,
} from "../shared/util.js";
import {
  collectActions,
  escapeString,
  getInheritableProperty,
  getRotationMatrix,
  isAscii,
  numberToString,
  stringToUTF16String,
} from "./core_utils.js";
import {
  createDefaultAppearance,
  FakeUnicodeFont,
  getPdfColor,
  parseAppearanceStream,
  parseDefaultAppearance,
} from "./default_appearance.js";
import { Dict, isName, isRefsEqual, Name, Ref, RefSet } from "./primitives.js";
import { Stream, StringStream } from "./stream.js";
import { BaseStream } from "./base_stream.js";
import { bidi } from "./bidi.js";
import { Catalog } from "./catalog.js";
import { ColorSpace } from "./colorspace.js";
import { FileSpec } from "./file_spec.js";
import { JpegStream } from "./jpeg_stream.js";
import { ObjectLoader } from "./object_loader.js";
import { OperatorList } from "./operator_list.js";
import { writeObject } from "./writer.js";
import { XFAFactory } from "./xfa/factory.js";

class AnnotationFactory {
  static createGlobals(pdfManager) {
    return Promise.all([
      pdfManager.ensureCatalog("acroForm"),
      pdfManager.ensureDoc("xfaDatasets"),
      pdfManager.ensureCatalog("structTreeRoot"),
      // Only necessary to prevent the `Catalog.baseUrl`-getter, used
      // with some Annotations, from throwing and thus breaking parsing:
      pdfManager.ensureCatalog("baseUrl"),
      // Only necessary to prevent the `Catalog.attachments`-getter, used
      // with "GoToE" actions, from throwing and thus breaking parsing:
      pdfManager.ensureCatalog("attachments"),
    ]).then(
      ([acroForm, xfaDatasets, structTreeRoot, baseUrl, attachments]) => {
        return {
          pdfManager,
          acroForm: acroForm instanceof Dict ? acroForm : Dict.empty,
          xfaDatasets,
          structTreeRoot,
          baseUrl,
          attachments,
        };
      },
      reason => {
        warn(`createGlobals: "${reason}".`);
        return null;
      }
    );
  }

  /**
   * Create an `Annotation` object of the correct type for the given reference
   * to an annotation dictionary. This yields a promise that is resolved when
   * the `Annotation` object is constructed.
   *
   * @param {XRef} xref
   * @param {Object} ref
   * @params {Object} annotationGlobals
   * @param {Object} idFactory
   * @param {boolean} [collectFields]
   * @param {Object} [pageRef]
   * @returns {Promise} A promise that is resolved with an {Annotation}
   *   instance.
   */
  static async create(
    xref,
    ref,
    annotationGlobals,
    idFactory,
    collectFields,
    pageRef
  ) {
    const pageIndex = collectFields
      ? await this._getPageIndex(xref, ref, annotationGlobals.pdfManager)
      : null;

    return annotationGlobals.pdfManager.ensure(this, "_create", [
      xref,
      ref,
      annotationGlobals,
      idFactory,
      collectFields,
      pageIndex,
      pageRef,
    ]);
  }

  /**
   * @private
   */
  static _create(
    xref,
    ref,
    annotationGlobals,
    idFactory,
    collectFields = false,
    pageIndex = null,
    pageRef = null
  ) {
    const dict = xref.fetchIfRef(ref);
    if (!(dict instanceof Dict)) {
      return undefined;
    }

    const { acroForm, pdfManager } = annotationGlobals;
    const id =
      ref instanceof Ref ? ref.toString() : `annot_${idFactory.createObjId()}`;

    // Determine the annotation's subtype.
    let subtype = dict.get("Subtype");
    subtype = subtype instanceof Name ? subtype.name : null;

    // Return the right annotation object based on the subtype and field type.
    const parameters = {
      xref,
      ref,
      dict,
      subtype,
      id,
      annotationGlobals,
      collectFields,
      needAppearances:
        !collectFields && acroForm.get("NeedAppearances") === true,
      pageIndex,
      evaluatorOptions: pdfManager.evaluatorOptions,
      pageRef,
    };

    switch (subtype) {
      case "Link":
        return new LinkAnnotation(parameters);

      case "Text":
        return new TextAnnotation(parameters);

      case "Widget":
        let fieldType = getInheritableProperty({ dict, key: "FT" });
        fieldType = fieldType instanceof Name ? fieldType.name : null;

        switch (fieldType) {
          case "Tx":
            return new TextWidgetAnnotation(parameters);
          case "Btn":
            return new ButtonWidgetAnnotation(parameters);
          case "Ch":
            return new ChoiceWidgetAnnotation(parameters);
          case "Sig":
            return new SignatureWidgetAnnotation(parameters);
        }
        warn(
          `Unimplemented widget field type "${fieldType}", ` +
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
        if (!collectFields) {
          if (!subtype) {
            warn("Annotation is missing the required /Subtype.");
          } else {
            warn(
              `Unimplemented annotation type "${subtype}", ` +
                "falling back to base annotation."
            );
          }
        }
        return new Annotation(parameters);
    }
  }

  static async _getPageIndex(xref, ref, pdfManager) {
    try {
      const annotDict = await xref.fetchIfRefAsync(ref);
      if (!(annotDict instanceof Dict)) {
        return -1;
      }
      const pageRef = annotDict.getRaw("P");
      if (pageRef instanceof Ref) {
        try {
          const pageIndex = await pdfManager.ensureCatalog("getPageIndex", [
            pageRef,
          ]);
          return pageIndex;
        } catch (ex) {
          info(`_getPageIndex -- not a valid page reference: "${ex}".`);
        }
      }
      if (annotDict.has("Kids")) {
        return -1; // Not an annotation reference.
      }
      // Fallback to, potentially, checking the annotations of all pages.
      // PLEASE NOTE: This could force the *entire* PDF document to load,
      //              hence it absolutely cannot be done unconditionally.
      const numPages = await pdfManager.ensureDoc("numPages");

      for (let pageIndex = 0; pageIndex < numPages; pageIndex++) {
        const page = await pdfManager.getPage(pageIndex);
        const annotations = await pdfManager.ensure(page, "annotations");

        for (const annotRef of annotations) {
          if (annotRef instanceof Ref && isRefsEqual(annotRef, ref)) {
            return pageIndex;
          }
        }
      }
    } catch (ex) {
      warn(`_getPageIndex: "${ex}".`);
    }
    return -1;
  }

  static generateImages(annotations, xref, isOffscreenCanvasSupported) {
    if (!isOffscreenCanvasSupported) {
      warn(
        "generateImages: OffscreenCanvas is not supported, cannot save or print some annotations with images."
      );
      return null;
    }
    let imagePromises;
    for (const { bitmapId, bitmap } of annotations) {
      if (!bitmap) {
        continue;
      }
      imagePromises ||= new Map();
      imagePromises.set(bitmapId, StampAnnotation.createImage(bitmap, xref));
    }

    return imagePromises;
  }

  static async saveNewAnnotations(evaluator, task, annotations, imagePromises) {
    const xref = evaluator.xref;
    let baseFontRef;
    const dependencies = [];
    const promises = [];
    const { isOffscreenCanvasSupported } = evaluator.options;

    for (const annotation of annotations) {
      if (annotation.deleted) {
        continue;
      }
      switch (annotation.annotationType) {
        case AnnotationEditorType.FREETEXT:
          if (!baseFontRef) {
            const baseFont = new Dict(xref);
            baseFont.set("BaseFont", Name.get("Helvetica"));
            baseFont.set("Type", Name.get("Font"));
            baseFont.set("Subtype", Name.get("Type1"));
            baseFont.set("Encoding", Name.get("WinAnsiEncoding"));
            const buffer = [];
            baseFontRef = xref.getNewTemporaryRef();
            await writeObject(baseFontRef, baseFont, buffer, xref);
            dependencies.push({ ref: baseFontRef, data: buffer.join("") });
          }
          promises.push(
            FreeTextAnnotation.createNewAnnotation(
              xref,
              annotation,
              dependencies,
              { evaluator, task, baseFontRef }
            )
          );
          break;
        case AnnotationEditorType.INK:
          promises.push(
            InkAnnotation.createNewAnnotation(xref, annotation, dependencies)
          );
          break;
        case AnnotationEditorType.STAMP:
          if (!isOffscreenCanvasSupported) {
            break;
          }
          const image = await imagePromises.get(annotation.bitmapId);
          if (image.imageStream) {
            const { imageStream, smaskStream } = image;
            const buffer = [];
            if (smaskStream) {
              const smaskRef = xref.getNewTemporaryRef();
              await writeObject(smaskRef, smaskStream, buffer, xref);
              dependencies.push({ ref: smaskRef, data: buffer.join("") });
              imageStream.dict.set("SMask", smaskRef);
              buffer.length = 0;
            }
            const imageRef = (image.imageRef = xref.getNewTemporaryRef());
            await writeObject(imageRef, imageStream, buffer, xref);
            dependencies.push({ ref: imageRef, data: buffer.join("") });
            image.imageStream = image.smaskStream = null;
          }
          promises.push(
            StampAnnotation.createNewAnnotation(
              xref,
              annotation,
              dependencies,
              { image }
            )
          );
          break;
      }
    }

    return {
      annotations: await Promise.all(promises),
      dependencies,
    };
  }

  static async printNewAnnotations(
    annotationGlobals,
    evaluator,
    task,
    annotations,
    imagePromises
  ) {
    if (!annotations) {
      return null;
    }

    const { options, xref } = evaluator;
    const promises = [];
    for (const annotation of annotations) {
      if (annotation.deleted) {
        continue;
      }
      switch (annotation.annotationType) {
        case AnnotationEditorType.FREETEXT:
          promises.push(
            FreeTextAnnotation.createNewPrintAnnotation(
              annotationGlobals,
              xref,
              annotation,
              {
                evaluator,
                task,
                evaluatorOptions: options,
              }
            )
          );
          break;
        case AnnotationEditorType.INK:
          promises.push(
            InkAnnotation.createNewPrintAnnotation(
              annotationGlobals,
              xref,
              annotation,
              {
                evaluatorOptions: options,
              }
            )
          );
          break;
        case AnnotationEditorType.STAMP:
          if (!options.isOffscreenCanvasSupported) {
            break;
          }
          const image = await imagePromises.get(annotation.bitmapId);
          if (image.imageStream) {
            const { imageStream, smaskStream } = image;
            if (smaskStream) {
              imageStream.dict.set("SMask", smaskStream);
            }
            image.imageRef = new JpegStream(imageStream, imageStream.length);
            image.imageStream = image.smaskStream = null;
          }
          promises.push(
            StampAnnotation.createNewPrintAnnotation(
              annotationGlobals,
              xref,
              annotation,
              {
                image,
                evaluatorOptions: options,
              }
            )
          );
          break;
      }
    }

    return Promise.all(promises);
  }
}

function getRgbColor(color, defaultColor = new Uint8ClampedArray(3)) {
  if (!Array.isArray(color)) {
    return defaultColor;
  }

  const rgbColor = defaultColor || new Uint8ClampedArray(3);
  switch (color.length) {
    case 0: // Transparent, which we indicate with a null value
      return null;

    case 1: // Convert grayscale to RGB
      ColorSpace.singletons.gray.getRgbItem(color, 0, rgbColor, 0);
      return rgbColor;

    case 3: // Convert RGB percentages to RGB
      ColorSpace.singletons.rgb.getRgbItem(color, 0, rgbColor, 0);
      return rgbColor;

    case 4: // Convert CMYK to RGB
      ColorSpace.singletons.cmyk.getRgbItem(color, 0, rgbColor, 0);
      return rgbColor;

    default:
      return defaultColor;
  }
}

function getPdfColorArray(color) {
  return Array.from(color, c => c / 255);
}

function getQuadPoints(dict, rect) {
  // The region is described as a number of quadrilaterals.
  // Each quadrilateral must consist of eight coordinates.
  const quadPoints = dict.getArray("QuadPoints");
  if (
    !Array.isArray(quadPoints) ||
    quadPoints.length === 0 ||
    quadPoints.length % 8 > 0
  ) {
    return null;
  }

  const quadPointsLists = [];
  for (let i = 0, ii = quadPoints.length / 8; i < ii; i++) {
    // Each series of eight numbers represents the coordinates for one
    // quadrilateral in the order [x1, y1, x2, y2, x3, y3, x4, y4].
    // Convert this to an array of objects with x and y coordinates.
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (let j = i * 8, jj = i * 8 + 8; j < jj; j += 2) {
      const x = quadPoints[j];
      const y = quadPoints[j + 1];

      minX = Math.min(x, minX);
      maxX = Math.max(x, maxX);
      minY = Math.min(y, minY);
      maxY = Math.max(y, maxY);
    }
    // The quadpoints should be ignored if any coordinate in the array
    // lies outside the region specified by the rectangle. The rectangle
    // can be `null` for markup annotations since their rectangle may be
    // incorrect (fixes bug 1538111).
    if (
      rect !== null &&
      (minX < rect[0] || maxX > rect[2] || minY < rect[1] || maxY > rect[3])
    ) {
      return null;
    }
    // The PDF specification states in section 12.5.6.10 (figure 64) that the
    // order of the quadpoints should be bottom left, bottom right, top right
    // and top left. However, in practice PDF files use a different order,
    // namely bottom left, bottom right, top left and top right (this is also
    // mentioned on https://github.com/highkite/pdfAnnotate#QuadPoints), so
    // this is the actual order we should work with. However, the situation is
    // even worse since Adobe's own applications and other applications violate
    // the specification and create annotations with other orders, namely top
    // left, top right, bottom left and bottom right or even top left,
    // top right, bottom right and bottom left. To avoid inconsistency and
    // broken rendering, we normalize all lists to put the quadpoints in the
    // same standard order (see https://stackoverflow.com/a/10729881).
    quadPointsLists.push([
      { x: minX, y: maxY },
      { x: maxX, y: maxY },
      { x: minX, y: minY },
      { x: maxX, y: minY },
    ]);
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
    const { dict, xref, annotationGlobals } = params;

    this.setTitle(dict.get("T"));
    this.setContents(dict.get("Contents"));
    this.setModificationDate(dict.get("M"));
    this.setFlags(dict.get("F"));
    this.setRectangle(dict.getArray("Rect"));
    this.setColor(dict.getArray("C"));
    this.setBorderStyle(dict);
    this.setAppearance(dict);
    this.setOptionalContent(dict);

    const MK = dict.get("MK");
    this.setBorderAndBackgroundColors(MK);
    this.setRotation(MK, dict);
    this.ref = params.ref instanceof Ref ? params.ref : null;

    this._streams = [];
    if (this.appearance) {
      this._streams.push(this.appearance);
    }

    // The annotation cannot be changed (neither its position/visibility nor its
    // contents), hence we can just display its appearance and don't generate
    // a HTML element for it.
    const isLocked = !!(this.flags & AnnotationFlag.LOCKED);
    const isContentLocked = !!(this.flags & AnnotationFlag.LOCKEDCONTENTS);

    if (annotationGlobals.structTreeRoot) {
      let structParent = dict.get("StructParent");
      structParent =
        Number.isInteger(structParent) && structParent >= 0 ? structParent : -1;

      annotationGlobals.structTreeRoot.addAnnotationIdToPage(
        params.pageRef,
        structParent
      );
    }

    // Expose public properties using a data object.
    this.data = {
      annotationFlags: this.flags,
      borderStyle: this.borderStyle,
      color: this.color,
      backgroundColor: this.backgroundColor,
      borderColor: this.borderColor,
      rotation: this.rotation,
      contentsObj: this._contents,
      hasAppearance: !!this.appearance,
      id: params.id,
      modificationDate: this.modificationDate,
      rect: this.rectangle,
      subtype: params.subtype,
      hasOwnCanvas: false,
      noRotate: !!(this.flags & AnnotationFlag.NOROTATE),
      noHTML: isLocked && isContentLocked,
    };

    if (params.collectFields) {
      // Fields can act as container for other fields and have
      // some actions even if no Annotation inherit from them.
      // Those fields can be referenced by CO (calculation order).
      const kids = dict.get("Kids");
      if (Array.isArray(kids)) {
        const kidIds = [];
        for (const kid of kids) {
          if (kid instanceof Ref) {
            kidIds.push(kid.toString());
          }
        }
        if (kidIds.length !== 0) {
          this.data.kidIds = kidIds;
        }
      }

      this.data.actions = collectActions(xref, dict, AnnotationActionEventType);
      this.data.fieldName = this._constructFieldName(dict);
      this.data.pageIndex = params.pageIndex;
    }

    this._isOffscreenCanvasSupported =
      params.evaluatorOptions.isOffscreenCanvasSupported;
    this._fallbackFontDict = null;
    this._needAppearances = false;
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
      !this._hasFlag(flags, AnnotationFlag.NOVIEW)
    );
  }

  /**
   * @private
   */
  _isPrintable(flags) {
    // In Acrobat, hidden flag cancels the print one
    // (see annotation_hidden_print.pdf).
    return (
      this._hasFlag(flags, AnnotationFlag.PRINT) &&
      !this._hasFlag(flags, AnnotationFlag.HIDDEN) &&
      !this._hasFlag(flags, AnnotationFlag.INVISIBLE)
    );
  }

  /**
   * Check if the annotation must be displayed by taking into account
   * the value found in the annotationStorage which may have been set
   * through JS.
   *
   * @public
   * @memberof Annotation
   * @param {AnnotationStorage} [annotationStorage] - Storage for annotation
   * @param {boolean} [_renderForms] - if true widgets are rendered thanks to
   *                                   the annotation layer.
   */
  mustBeViewed(annotationStorage, _renderForms) {
    const noView = annotationStorage?.get(this.data.id)?.noView;
    if (noView !== undefined) {
      return !noView;
    }
    return this.viewable && !this._hasFlag(this.flags, AnnotationFlag.HIDDEN);
  }

  /**
   * Check if the annotation must be printed by taking into account
   * the value found in the annotationStorage which may have been set
   * through JS.
   *
   * @public
   * @memberof Annotation
   * @param {AnnotationStorage} [annotationStorage] - Storage for annotation
   */
  mustBePrinted(annotationStorage) {
    const noPrint = annotationStorage?.get(this.data.id)?.noPrint;
    if (noPrint !== undefined) {
      return !noPrint;
    }
    return this.printable;
  }

  /**
   * @type {boolean}
   */
  get viewable() {
    if (this.data.quadPoints === null) {
      return false;
    }
    if (this.flags === 0) {
      return true;
    }
    return this._isViewable(this.flags);
  }

  /**
   * @type {boolean}
   */
  get printable() {
    if (this.data.quadPoints === null) {
      return false;
    }
    if (this.flags === 0) {
      return false;
    }
    return this._isPrintable(this.flags);
  }

  /**
   * @private
   */
  _parseStringHelper(data) {
    const str = typeof data === "string" ? stringToPDFString(data) : "";
    const dir = str && bidi(str).dir === "rtl" ? "rtl" : "ltr";

    return { str, dir };
  }

  setDefaultAppearance(params) {
    const { dict, annotationGlobals } = params;

    const defaultAppearance =
      getInheritableProperty({ dict, key: "DA" }) ||
      annotationGlobals.acroForm.get("DA");
    this._defaultAppearance =
      typeof defaultAppearance === "string" ? defaultAppearance : "";
    this.data.defaultAppearanceData = parseDefaultAppearance(
      this._defaultAppearance
    );
  }

  /**
   * Set the title.
   *
   * @param {string} title - The title of the annotation, used e.g. with
   *   PopupAnnotations.
   */
  setTitle(title) {
    this._title = this._parseStringHelper(title);
  }

  /**
   * Set the contents.
   *
   * @param {string} contents - Text to display for the annotation or, if the
   *                            type of annotation does not display text, a
   *                            description of the annotation's contents
   */
  setContents(contents) {
    this._contents = this._parseStringHelper(contents);
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
    this.modificationDate =
      typeof modificationDate === "string" ? modificationDate : null;
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
    this.rectangle =
      Array.isArray(rectangle) && rectangle.length === 4
        ? Util.normalizeRect(rectangle)
        : [0, 0, 0, 0];
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
    this.color = getRgbColor(color);
  }

  /**
   * Set the line endings; should only be used with specific annotation types.
   * @param {Array} lineEndings - The line endings array.
   */
  setLineEndings(lineEndings) {
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
      throw new Error("Not implemented: setLineEndings");
    }
    this.lineEndings = ["None", "None"]; // The default values.

    if (Array.isArray(lineEndings) && lineEndings.length === 2) {
      for (let i = 0; i < 2; i++) {
        const obj = lineEndings[i];

        if (obj instanceof Name) {
          switch (obj.name) {
            case "None":
              continue;
            case "Square":
            case "Circle":
            case "Diamond":
            case "OpenArrow":
            case "ClosedArrow":
            case "Butt":
            case "ROpenArrow":
            case "RClosedArrow":
            case "Slash":
              this.lineEndings[i] = obj.name;
              continue;
          }
        }
        warn(`Ignoring invalid lineEnding: ${obj}`);
      }
    }
  }

  setRotation(mk, dict) {
    this.rotation = 0;
    let angle = mk instanceof Dict ? mk.get("R") || 0 : dict.get("Rotate") || 0;
    if (Number.isInteger(angle) && angle !== 0) {
      angle %= 360;
      if (angle < 0) {
        angle += 360;
      }
      if (angle % 90 === 0) {
        this.rotation = angle;
      }
    }
  }

  /**
   * Set the color for background and border if any.
   * The default values are transparent.
   *
   * @public
   * @memberof Annotation
   * @param {Dict} mk - The MK dictionary
   */
  setBorderAndBackgroundColors(mk) {
    if (mk instanceof Dict) {
      this.borderColor = getRgbColor(mk.getArray("BC"), null);
      this.backgroundColor = getRgbColor(mk.getArray("BG"), null);
    } else {
      this.borderColor = this.backgroundColor = null;
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
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(this.rectangle, "setRectangle must have been called previously.");
    }

    this.borderStyle = new AnnotationBorderStyle();
    if (!(borderStyle instanceof Dict)) {
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
          this.borderStyle.setDashArray(array[3], /* forceStyle = */ true);
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
    if (!(appearanceStates instanceof Dict)) {
      return;
    }

    // In case the normal appearance is a stream, then it is used directly.
    const normalAppearanceState = appearanceStates.get("N");
    if (normalAppearanceState instanceof BaseStream) {
      this.appearance = normalAppearanceState;
      return;
    }
    if (!(normalAppearanceState instanceof Dict)) {
      return;
    }

    // In case the normal appearance is a dictionary, the `AS` entry provides
    // the key of the stream in this dictionary.
    const as = dict.get("AS");
    if (!(as instanceof Name) || !normalAppearanceState.has(as.name)) {
      return;
    }
    const appearance = normalAppearanceState.get(as.name);
    if (appearance instanceof BaseStream) {
      this.appearance = appearance;
    }
  }

  setOptionalContent(dict) {
    this.oc = null;

    const oc = dict.get("OC");
    if (oc instanceof Name) {
      warn("setOptionalContent: Support for /Name-entry is not implemented.");
    } else if (oc instanceof Dict) {
      this.oc = oc;
    }
  }

  loadResources(keys, appearance) {
    return appearance.dict.getAsync("Resources").then(resources => {
      if (!resources) {
        return undefined;
      }

      const objectLoader = new ObjectLoader(resources, keys, resources.xref);
      return objectLoader.load().then(function () {
        return resources;
      });
    });
  }

  async getOperatorList(
    evaluator,
    task,
    intent,
    renderForms,
    annotationStorage
  ) {
    const data = this.data;
    let appearance = this.appearance;
    const isUsingOwnCanvas = !!(
      this.data.hasOwnCanvas && intent & RenderingIntentFlag.DISPLAY
    );
    if (!appearance) {
      if (!isUsingOwnCanvas) {
        return {
          opList: new OperatorList(),
          separateForm: false,
          separateCanvas: false,
        };
      }
      appearance = new StringStream("");
      appearance.dict = new Dict();
    }

    const appearanceDict = appearance.dict;
    const resources = await this.loadResources(
      ["ExtGState", "ColorSpace", "Pattern", "Shading", "XObject", "Font"],
      appearance
    );
    const bbox = appearanceDict.getArray("BBox") || [0, 0, 1, 1];
    const matrix = appearanceDict.getArray("Matrix") || [1, 0, 0, 1, 0, 0];
    const transform = getTransformMatrix(data.rect, bbox, matrix);

    const opList = new OperatorList();

    let optionalContent;
    if (this.oc) {
      optionalContent = await evaluator.parseMarkedContentProps(
        this.oc,
        /* resources = */ null
      );
    }
    if (optionalContent !== undefined) {
      opList.addOp(OPS.beginMarkedContentProps, ["OC", optionalContent]);
    }

    opList.addOp(OPS.beginAnnotation, [
      data.id,
      data.rect,
      transform,
      matrix,
      isUsingOwnCanvas,
    ]);

    await evaluator.getOperatorList({
      stream: appearance,
      task,
      resources,
      operatorList: opList,
      fallbackFontDict: this._fallbackFontDict,
    });
    opList.addOp(OPS.endAnnotation, []);

    if (optionalContent !== undefined) {
      opList.addOp(OPS.endMarkedContent, []);
    }
    this.reset();
    return { opList, separateForm: false, separateCanvas: isUsingOwnCanvas };
  }

  async save(evaluator, task, annotationStorage) {
    return null;
  }

  get hasTextContent() {
    return false;
  }

  async extractTextContent(evaluator, task, viewBox) {
    if (!this.appearance) {
      return;
    }

    const resources = await this.loadResources(
      ["ExtGState", "Font", "Properties", "XObject"],
      this.appearance
    );

    const text = [];
    const buffer = [];
    let firstPosition = null;
    const sink = {
      desiredSize: Math.Infinity,
      ready: true,

      enqueue(chunk, size) {
        for (const item of chunk.items) {
          if (item.str === undefined) {
            continue;
          }
          firstPosition ||= item.transform.slice(-2);
          buffer.push(item.str);
          if (item.hasEOL) {
            text.push(buffer.join(""));
            buffer.length = 0;
          }
        }
      },
    };

    await evaluator.getTextContent({
      stream: this.appearance,
      task,
      resources,
      includeMarkedContent: true,
      sink,
      viewBox,
    });
    this.reset();

    if (buffer.length) {
      text.push(buffer.join(""));
    }

    if (text.length > 1 || text[0]) {
      const appearanceDict = this.appearance.dict;
      const bbox = appearanceDict.getArray("BBox") || [0, 0, 1, 1];
      const matrix = appearanceDict.getArray("Matrix") || [1, 0, 0, 1, 0, 0];
      const rect = this.data.rect;
      const transform = getTransformMatrix(rect, bbox, matrix);
      transform[4] -= rect[0];
      transform[5] -= rect[1];
      firstPosition = Util.applyTransform(firstPosition, transform);
      firstPosition = Util.applyTransform(firstPosition, matrix);

      this.data.textPosition = firstPosition;
      this.data.textContent = text;
    }
  }

  /**
   * Get field data for usage in JS sandbox.
   *
   * Field object is defined here:
   * https://www.adobe.com/content/dam/acom/en/devnet/acrobat/pdfs/js_api_reference.pdf#page=16
   *
   * @public
   * @memberof Annotation
   * @returns {Object | null}
   */
  getFieldObject() {
    if (this.data.kidIds) {
      return {
        id: this.data.id,
        actions: this.data.actions,
        name: this.data.fieldName,
        strokeColor: this.data.borderColor,
        fillColor: this.data.backgroundColor,
        type: "",
        kidIds: this.data.kidIds,
        page: this.data.pageIndex,
        rotation: this.rotation,
      };
    }
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
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.appearance &&
      !this._streams.includes(this.appearance)
    ) {
      unreachable("The appearance stream should always be reset.");
    }

    for (const stream of this._streams) {
      stream.reset();
    }
  }

  /**
   * Construct the (fully qualified) field name from the (partial) field
   * names of the field and its ancestors.
   *
   * @private
   * @memberof Annotation
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
    const visited = new RefSet();
    if (dict.objId) {
      visited.put(dict.objId);
    }
    while (loopDict.has("Parent")) {
      loopDict = loopDict.get("Parent");
      if (
        !(loopDict instanceof Dict) ||
        (loopDict.objId && visited.has(loopDict.objId))
      ) {
        // Even though it is not allowed according to the PDF specification,
        // bad PDF generators may provide a `Parent` entry that is not a
        // dictionary, but `null` for example (issue 8143).
        //
        // If parent has been already visited, it means that we're
        // in an infinite loop.
        break;
      }
      if (loopDict.objId) {
        visited.put(loopDict.objId);
      }

      if (loopDict.has("T")) {
        fieldName.unshift(stringToPDFString(loopDict.get("T")));
      }
    }
    return fieldName.join(".");
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
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        Array.isArray(rect) && rect.length === 4,
        "A valid `rect` parameter must be provided."
      );
    }

    // Some corrupt PDF generators may provide the width as a `Name`,
    // rather than as a number (fixes issue 10385).
    if (width instanceof Name) {
      this.width = 0; // This is consistent with the behaviour in Adobe Reader.
      return;
    }
    if (typeof width === "number") {
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
    if (!(style instanceof Name)) {
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
   * @param {boolean} [forceStyle]
   */
  setDashArray(dashArray, forceStyle = false) {
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

        if (forceStyle) {
          // Even though we cannot use the dash array in the display layer,
          // at least ensure that we use the correct border-style.
          this.setStyle(Name.get("D"));
        }
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
  constructor(params) {
    super(params);

    const { dict } = params;

    if (dict.has("IRT")) {
      const rawIRT = dict.getRaw("IRT");
      this.data.inReplyTo = rawIRT instanceof Ref ? rawIRT.toString() : null;

      const rt = dict.get("RT");
      this.data.replyType =
        rt instanceof Name ? rt.name : AnnotationReplyType.REPLY;
    }
    let popupRef = null;

    if (this.data.replyType === AnnotationReplyType.GROUP) {
      // Subordinate annotations in a group should inherit
      // the group attributes from the primary annotation.
      const parent = dict.get("IRT");

      this.setTitle(parent.get("T"));
      this.data.titleObj = this._title;

      this.setContents(parent.get("Contents"));
      this.data.contentsObj = this._contents;

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

      popupRef = parent.getRaw("Popup");

      if (!parent.has("C")) {
        // Fall back to the default background color.
        this.data.color = null;
      } else {
        this.setColor(parent.getArray("C"));
        this.data.color = this.color;
      }
    } else {
      this.data.titleObj = this._title;

      this.setCreationDate(dict.get("CreationDate"));
      this.data.creationDate = this.creationDate;

      popupRef = dict.getRaw("Popup");

      if (!dict.has("C")) {
        // Fall back to the default background color.
        this.data.color = null;
      }
    }

    this.data.popupRef = popupRef instanceof Ref ? popupRef.toString() : null;

    if (dict.has("RC")) {
      this.data.richText = XFAFactory.getRichTextAsHtml(dict.get("RC"));
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
    this.creationDate = typeof creationDate === "string" ? creationDate : null;
  }

  _setDefaultAppearance({
    xref,
    extra,
    strokeColor,
    fillColor,
    blendMode,
    strokeAlpha,
    fillAlpha,
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

    let pointsArray = this.data.quadPoints;
    if (!pointsArray) {
      // If there are no quadpoints, the rectangle should be used instead.
      // Convert the rectangle definition to a points array similar to how the
      // quadpoints are defined.
      pointsArray = [
        [
          { x: this.rectangle[0], y: this.rectangle[3] },
          { x: this.rectangle[2], y: this.rectangle[3] },
          { x: this.rectangle[0], y: this.rectangle[1] },
          { x: this.rectangle[2], y: this.rectangle[1] },
        ],
      ];
    }

    for (const points of pointsArray) {
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
    if (typeof strokeAlpha === "number") {
      gsDict.set("CA", strokeAlpha);
    }
    if (typeof fillAlpha === "number") {
      gsDict.set("ca", fillAlpha);
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

  static async createNewAnnotation(xref, annotation, dependencies, params) {
    const annotationRef = (annotation.ref ||= xref.getNewTemporaryRef());
    const ap = await this.createNewAppearanceStream(annotation, xref, params);
    const buffer = [];
    let annotationDict;

    if (ap) {
      const apRef = xref.getNewTemporaryRef();
      annotationDict = this.createNewDict(annotation, xref, { apRef });
      await writeObject(apRef, ap, buffer, xref);
      dependencies.push({ ref: apRef, data: buffer.join("") });
    } else {
      annotationDict = this.createNewDict(annotation, xref, {});
    }
    if (Number.isInteger(annotation.parentTreeId)) {
      annotationDict.set("StructParent", annotation.parentTreeId);
    }

    buffer.length = 0;
    await writeObject(annotationRef, annotationDict, buffer, xref);

    return { ref: annotationRef, data: buffer.join("") };
  }

  static async createNewPrintAnnotation(
    annotationGlobals,
    xref,
    annotation,
    params
  ) {
    const ap = await this.createNewAppearanceStream(annotation, xref, params);
    const annotationDict = this.createNewDict(annotation, xref, { ap });

    const newAnnotation = new this.prototype.constructor({
      dict: annotationDict,
      xref,
      annotationGlobals,
      evaluatorOptions: params.evaluatorOptions,
    });

    if (annotation.ref) {
      newAnnotation.ref = newAnnotation.refToReplace = annotation.ref;
    }

    return newAnnotation;
  }
}

class WidgetAnnotation extends Annotation {
  constructor(params) {
    super(params);

    const { dict, xref, annotationGlobals } = params;
    const data = this.data;
    this._needAppearances = params.needAppearances;

    data.annotationType = AnnotationType.WIDGET;
    if (data.fieldName === undefined) {
      data.fieldName = this._constructFieldName(dict);
    }

    if (data.actions === undefined) {
      data.actions = collectActions(xref, dict, AnnotationActionEventType);
    }

    let fieldValue = getInheritableProperty({
      dict,
      key: "V",
      getArray: true,
    });
    data.fieldValue = this._decodeFormValue(fieldValue);

    const defaultFieldValue = getInheritableProperty({
      dict,
      key: "DV",
      getArray: true,
    });
    data.defaultFieldValue = this._decodeFormValue(defaultFieldValue);

    if (fieldValue === undefined && annotationGlobals.xfaDatasets) {
      // Try to figure out if we have something in the xfa dataset.
      const path = this._title.str;
      if (path) {
        this._hasValueFromXFA = true;
        data.fieldValue = fieldValue =
          annotationGlobals.xfaDatasets.getValue(path);
      }
    }

    // When no "V" entry exists, let the fieldValue fallback to the "DV" entry
    // (fixes issue13823.pdf).
    if (fieldValue === undefined && data.defaultFieldValue !== null) {
      data.fieldValue = data.defaultFieldValue;
    }

    data.alternativeText = stringToPDFString(dict.get("TU") || "");

    this.setDefaultAppearance(params);

    data.hasAppearance ||=
      this._needAppearances &&
      data.fieldValue !== undefined &&
      data.fieldValue !== null;

    const fieldType = getInheritableProperty({ dict, key: "FT" });
    data.fieldType = fieldType instanceof Name ? fieldType.name : null;

    const localResources = getInheritableProperty({ dict, key: "DR" });
    const acroFormResources = annotationGlobals.acroForm.get("DR");
    const appearanceResources = this.appearance?.dict.get("Resources");

    this._fieldResources = {
      localResources,
      acroFormResources,
      appearanceResources,
      mergedResources: Dict.merge({
        xref,
        dictArray: [localResources, appearanceResources, acroFormResources],
        mergeSubDicts: true,
      }),
    };

    data.fieldFlags = getInheritableProperty({ dict, key: "Ff" });
    if (!Number.isInteger(data.fieldFlags) || data.fieldFlags < 0) {
      data.fieldFlags = 0;
    }

    data.readOnly = this.hasFieldFlag(AnnotationFieldFlag.READONLY);
    data.required = this.hasFieldFlag(AnnotationFieldFlag.REQUIRED);
    data.hidden =
      this._hasFlag(data.annotationFlags, AnnotationFlag.HIDDEN) ||
      this._hasFlag(data.annotationFlags, AnnotationFlag.NOVIEW);
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
        .filter(item => typeof item === "string")
        .map(item => stringToPDFString(item));
    } else if (formValue instanceof Name) {
      return stringToPDFString(formValue.name);
    } else if (typeof formValue === "string") {
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

  /** @inheritdoc */
  _isViewable(flags) {
    // We don't take into account the `NOVIEW` or `HIDDEN` flags here,
    // since the visibility can be changed by js code, hence in case
    // it's made viewable, we should render it (with visibility set to
    // hidden).
    return !this._hasFlag(flags, AnnotationFlag.INVISIBLE);
  }

  /** @inheritdoc */
  mustBeViewed(annotationStorage, renderForms) {
    if (renderForms) {
      return this.viewable;
    }
    return (
      super.mustBeViewed(annotationStorage, renderForms) &&
      !this._hasFlag(this.flags, AnnotationFlag.NOVIEW)
    );
  }

  getRotationMatrix(annotationStorage) {
    let rotation = annotationStorage?.get(this.data.id)?.rotation;
    if (rotation === undefined) {
      rotation = this.rotation;
    }

    if (rotation === 0) {
      return IDENTITY_MATRIX;
    }

    const width = this.data.rect[2] - this.data.rect[0];
    const height = this.data.rect[3] - this.data.rect[1];

    return getRotationMatrix(rotation, width, height);
  }

  getBorderAndBackgroundAppearances(annotationStorage) {
    let rotation = annotationStorage?.get(this.data.id)?.rotation;
    if (rotation === undefined) {
      rotation = this.rotation;
    }

    if (!this.backgroundColor && !this.borderColor) {
      return "";
    }
    const width = this.data.rect[2] - this.data.rect[0];
    const height = this.data.rect[3] - this.data.rect[1];
    const rect =
      rotation === 0 || rotation === 180
        ? `0 0 ${width} ${height} re`
        : `0 0 ${height} ${width} re`;

    let str = "";
    if (this.backgroundColor) {
      str = `${getPdfColor(
        this.backgroundColor,
        /* isFill */ true
      )} ${rect} f `;
    }

    if (this.borderColor) {
      const borderWidth = this.borderStyle.width || 1;
      str += `${borderWidth} w ${getPdfColor(
        this.borderColor,
        /* isFill */ false
      )} ${rect} S `;
    }

    return str;
  }

  async getOperatorList(
    evaluator,
    task,
    intent,
    renderForms,
    annotationStorage
  ) {
    // Do not render form elements on the canvas when interactive forms are
    // enabled. The display layer is responsible for rendering them instead.
    if (
      renderForms &&
      !(this instanceof SignatureWidgetAnnotation) &&
      !this.data.noHTML &&
      !this.data.hasOwnCanvas
    ) {
      return {
        opList: new OperatorList(),
        separateForm: true,
        separateCanvas: false,
      };
    }

    if (!this._hasText) {
      return super.getOperatorList(
        evaluator,
        task,
        intent,
        renderForms,
        annotationStorage
      );
    }

    const content = await this._getAppearance(
      evaluator,
      task,
      intent,
      annotationStorage
    );
    if (this.appearance && content === null) {
      return super.getOperatorList(
        evaluator,
        task,
        intent,
        renderForms,
        annotationStorage
      );
    }

    const opList = new OperatorList();

    // Even if there is an appearance stream, ignore it. This is the
    // behaviour used by Adobe Reader.
    if (!this._defaultAppearance || content === null) {
      return { opList, separateForm: false, separateCanvas: false };
    }

    const isUsingOwnCanvas = !!(
      this.data.hasOwnCanvas && intent & RenderingIntentFlag.DISPLAY
    );

    const matrix = [1, 0, 0, 1, 0, 0];
    const bbox = [
      0,
      0,
      this.data.rect[2] - this.data.rect[0],
      this.data.rect[3] - this.data.rect[1],
    ];
    const transform = getTransformMatrix(this.data.rect, bbox, matrix);

    let optionalContent;
    if (this.oc) {
      optionalContent = await evaluator.parseMarkedContentProps(
        this.oc,
        /* resources = */ null
      );
    }
    if (optionalContent !== undefined) {
      opList.addOp(OPS.beginMarkedContentProps, ["OC", optionalContent]);
    }

    opList.addOp(OPS.beginAnnotation, [
      this.data.id,
      this.data.rect,
      transform,
      this.getRotationMatrix(annotationStorage),
      isUsingOwnCanvas,
    ]);

    const stream = new StringStream(content);
    await evaluator.getOperatorList({
      stream,
      task,
      resources: this._fieldResources.mergedResources,
      operatorList: opList,
    });
    opList.addOp(OPS.endAnnotation, []);

    if (optionalContent !== undefined) {
      opList.addOp(OPS.endMarkedContent, []);
    }
    return { opList, separateForm: false, separateCanvas: isUsingOwnCanvas };
  }

  _getMKDict(rotation) {
    const mk = new Dict(null);
    if (rotation) {
      mk.set("R", rotation);
    }
    if (this.borderColor) {
      mk.set("BC", getPdfColorArray(this.borderColor));
    }
    if (this.backgroundColor) {
      mk.set("BG", getPdfColorArray(this.backgroundColor));
    }
    return mk.size > 0 ? mk : null;
  }

  amendSavedDict(annotationStorage, dict) {}

  async save(evaluator, task, annotationStorage) {
    const storageEntry = annotationStorage?.get(this.data.id);
    let value = storageEntry?.value,
      rotation = storageEntry?.rotation;
    if (value === this.data.fieldValue || value === undefined) {
      if (!this._hasValueFromXFA && rotation === undefined) {
        return null;
      }
      value ||= this.data.fieldValue;
    }

    // Value can be an array (with choice list and multiple selections)
    if (
      rotation === undefined &&
      !this._hasValueFromXFA &&
      Array.isArray(value) &&
      Array.isArray(this.data.fieldValue) &&
      value.length === this.data.fieldValue.length &&
      value.every((x, i) => x === this.data.fieldValue[i])
    ) {
      return null;
    }

    if (rotation === undefined) {
      rotation = this.rotation;
    }

    let appearance = null;
    if (!this._needAppearances) {
      appearance = await this._getAppearance(
        evaluator,
        task,
        RenderingIntentFlag.SAVE,
        annotationStorage
      );
      if (appearance === null) {
        // Appearance didn't change.
        return null;
      }
    } else {
      // No need to create an appearance: the pdf has the flag /NeedAppearances
      // which means that it's up to the reader to produce an appearance.
    }

    let needAppearances = false;
    if (appearance?.needAppearances) {
      needAppearances = true;
      appearance = null;
    }

    const { xref } = evaluator;

    const originalDict = xref.fetchIfRef(this.ref);
    if (!(originalDict instanceof Dict)) {
      return null;
    }

    const dict = new Dict(xref);
    for (const key of originalDict.getKeys()) {
      if (key !== "AP") {
        dict.set(key, originalDict.getRaw(key));
      }
    }

    const xfa = {
      path: this.data.fieldName,
      value,
    };

    const encoder = val => {
      return isAscii(val)
        ? val
        : stringToUTF16String(val, /* bigEndian = */ true);
    };
    dict.set("V", Array.isArray(value) ? value.map(encoder) : encoder(value));
    this.amendSavedDict(annotationStorage, dict);

    const maybeMK = this._getMKDict(rotation);
    if (maybeMK) {
      dict.set("MK", maybeMK);
    }

    const buffer = [];
    const changes = [
      // data for the original object
      // V field changed + reference for new AP
      { ref: this.ref, data: "", xfa, needAppearances },
    ];
    if (appearance !== null) {
      const newRef = xref.getNewTemporaryRef();
      const AP = new Dict(xref);
      dict.set("AP", AP);
      AP.set("N", newRef);

      const resources = this._getSaveFieldResources(xref);
      const appearanceStream = new StringStream(appearance);
      const appearanceDict = (appearanceStream.dict = new Dict(xref));
      appearanceDict.set("Subtype", Name.get("Form"));
      appearanceDict.set("Resources", resources);
      appearanceDict.set("BBox", [
        0,
        0,
        this.data.rect[2] - this.data.rect[0],
        this.data.rect[3] - this.data.rect[1],
      ]);

      const rotationMatrix = this.getRotationMatrix(annotationStorage);
      if (rotationMatrix !== IDENTITY_MATRIX) {
        // The matrix isn't the identity one.
        appearanceDict.set("Matrix", rotationMatrix);
      }

      await writeObject(newRef, appearanceStream, buffer, xref);

      changes.push(
        // data for the new AP
        {
          ref: newRef,
          data: buffer.join(""),
          xfa: null,
          needAppearances: false,
        }
      );
      buffer.length = 0;
    }

    dict.set("M", `D:${getModificationDate()}`);
    await writeObject(this.ref, dict, buffer, xref);

    changes[0].data = buffer.join("");

    return changes;
  }

  async _getAppearance(evaluator, task, intent, annotationStorage) {
    const isPassword = this.hasFieldFlag(AnnotationFieldFlag.PASSWORD);
    if (isPassword) {
      return null;
    }
    const storageEntry = annotationStorage?.get(this.data.id);
    let value, rotation;
    if (storageEntry) {
      value = storageEntry.formattedValue || storageEntry.value;
      rotation = storageEntry.rotation;
    }

    if (
      rotation === undefined &&
      value === undefined &&
      !this._needAppearances
    ) {
      if (!this._hasValueFromXFA || this.appearance) {
        // The annotation hasn't been rendered so use the appearance.
        return null;
      }
    }

    // Empty or it has a trailing whitespace.
    const colors = this.getBorderAndBackgroundAppearances(annotationStorage);

    if (value === undefined) {
      // The annotation has its value in XFA datasets but not in the V field.
      value = this.data.fieldValue;
      if (!value) {
        return `/Tx BMC q ${colors}Q EMC`;
      }
    }

    if (Array.isArray(value) && value.length === 1) {
      value = value[0];
    }

    assert(typeof value === "string", "Expected `value` to be a string.");
    value = value.trim();

    if (this.data.combo) {
      // The value can be one of the exportValue or any other values.
      const option = this.data.options.find(
        ({ exportValue }) => value === exportValue
      );
      value = option?.displayValue || value;
    }

    if (value === "") {
      // the field is empty: nothing to render
      return `/Tx BMC q ${colors}Q EMC`;
    }

    if (rotation === undefined) {
      rotation = this.rotation;
    }

    let lineCount = -1;
    let lines;

    // We could have a text containing for example some sequences of chars and
    // their diacritics (e.g. "é".normalize("NFKD") shows 1 char when it's 2).
    // Positioning diacritics is really something we don't want to do here.
    // So if a font has a glyph for a acute accent and one for "e" then we won't
    // get any encoding issues but we'll render "e" and then "´".
    // It's why we normalize the string. We use NFC to preserve the initial
    // string, (e.g. "²".normalize("NFC") === "²"
    // but "²".normalize("NFKC") === "2").
    //
    // TODO: it isn't a perfect solution, some chars like "ẹ́" will be
    // decomposed into two chars ("ẹ" and "´"), so we should detect such
    // situations and then use either FakeUnicodeFont or set the
    // /NeedAppearances flag.
    if (this.data.multiLine) {
      lines = value.split(/\r\n?|\n/).map(line => line.normalize("NFC"));
      lineCount = lines.length;
    } else {
      lines = [value.replace(/\r\n?|\n/, "").normalize("NFC")];
    }

    const defaultPadding = 1;
    const defaultHPadding = 2;
    let totalHeight = this.data.rect[3] - this.data.rect[1];
    let totalWidth = this.data.rect[2] - this.data.rect[0];

    if (rotation === 90 || rotation === 270) {
      [totalWidth, totalHeight] = [totalHeight, totalWidth];
    }

    if (!this._defaultAppearance) {
      // The DA is required and must be a string.
      // If there is no font named Helvetica in the resource dictionary,
      // the evaluator will fall back to a default font.
      // Doing so prevents exceptions and allows saving/printing
      // the file as expected.
      this.data.defaultAppearanceData = parseDefaultAppearance(
        (this._defaultAppearance = "/Helvetica 0 Tf 0 g")
      );
    }

    let font = await WidgetAnnotation._getFontData(
      evaluator,
      task,
      this.data.defaultAppearanceData,
      this._fieldResources.mergedResources
    );

    let defaultAppearance, fontSize, lineHeight;
    const encodedLines = [];
    let encodingError = false;
    for (const line of lines) {
      const encodedString = font.encodeString(line);
      if (encodedString.length > 1) {
        encodingError = true;
      }
      encodedLines.push(encodedString.join(""));
    }

    if (encodingError && intent & RenderingIntentFlag.SAVE) {
      // We don't have a way to render the field, so we just rely on the
      // /NeedAppearances trick to let the different sofware correctly render
      // this pdf.
      return { needAppearances: true };
    }

    // We check that the font is able to encode the string.
    if (encodingError && this._isOffscreenCanvasSupported) {
      // If it can't then we fallback on fake unicode font (mapped to sans-serif
      // for the rendering).
      // It means that a printed form can be rendered differently (it depends on
      // the sans-serif font) but at least we've something to render.
      // In an ideal world the associated font should correctly handle the
      // possible chars but a user can add a smiley or whatever.
      // We could try to embed a font but it means that we must have access
      // to the raw font file.
      const fontFamily = this.data.comb ? "monospace" : "sans-serif";
      const fakeUnicodeFont = new FakeUnicodeFont(evaluator.xref, fontFamily);
      const resources = fakeUnicodeFont.createFontResources(lines.join(""));
      const newFont = resources.getRaw("Font");

      if (this._fieldResources.mergedResources.has("Font")) {
        const oldFont = this._fieldResources.mergedResources.get("Font");
        for (const key of newFont.getKeys()) {
          oldFont.set(key, newFont.getRaw(key));
        }
      } else {
        this._fieldResources.mergedResources.set("Font", newFont);
      }

      const fontName = fakeUnicodeFont.fontName.name;
      font = await WidgetAnnotation._getFontData(
        evaluator,
        task,
        { fontName, fontSize: 0 },
        resources
      );

      for (let i = 0, ii = encodedLines.length; i < ii; i++) {
        encodedLines[i] = stringToUTF16String(lines[i]);
      }

      const savedDefaultAppearance = Object.assign(
        Object.create(null),
        this.data.defaultAppearanceData
      );
      this.data.defaultAppearanceData.fontSize = 0;
      this.data.defaultAppearanceData.fontName = fontName;

      [defaultAppearance, fontSize, lineHeight] = this._computeFontSize(
        totalHeight - 2 * defaultPadding,
        totalWidth - 2 * defaultHPadding,
        value,
        font,
        lineCount
      );

      this.data.defaultAppearanceData = savedDefaultAppearance;
    } else {
      if (!this._isOffscreenCanvasSupported) {
        warn(
          "_getAppearance: OffscreenCanvas is not supported, annotation may not render correctly."
        );
      }

      [defaultAppearance, fontSize, lineHeight] = this._computeFontSize(
        totalHeight - 2 * defaultPadding,
        totalWidth - 2 * defaultHPadding,
        value,
        font,
        lineCount
      );
    }

    let descent = font.descent;
    if (isNaN(descent)) {
      descent = BASELINE_FACTOR * lineHeight;
    } else {
      descent = Math.max(
        BASELINE_FACTOR * lineHeight,
        Math.abs(descent) * fontSize
      );
    }

    // Take into account the space we have to compute the default vertical
    // padding.
    const defaultVPadding = Math.min(
      Math.floor((totalHeight - fontSize) / 2),
      defaultPadding
    );
    const alignment = this.data.textAlignment;

    if (this.data.multiLine) {
      return this._getMultilineAppearance(
        defaultAppearance,
        encodedLines,
        font,
        fontSize,
        totalWidth,
        totalHeight,
        alignment,
        defaultHPadding,
        defaultVPadding,
        descent,
        lineHeight,
        annotationStorage
      );
    }

    if (this.data.comb) {
      return this._getCombAppearance(
        defaultAppearance,
        font,
        encodedLines[0],
        fontSize,
        totalWidth,
        totalHeight,
        defaultHPadding,
        defaultVPadding,
        descent,
        lineHeight,
        annotationStorage
      );
    }

    const bottomPadding = defaultVPadding + descent;
    if (alignment === 0 || alignment > 2) {
      // Left alignment: nothing to do
      return (
        `/Tx BMC q ${colors}BT ` +
        defaultAppearance +
        ` 1 0 0 1 ${numberToString(defaultHPadding)} ${numberToString(
          bottomPadding
        )} Tm (${escapeString(encodedLines[0])}) Tj` +
        " ET Q EMC"
      );
    }

    const prevInfo = { shift: 0 };
    const renderedText = this._renderText(
      encodedLines[0],
      font,
      fontSize,
      totalWidth,
      alignment,
      prevInfo,
      defaultHPadding,
      bottomPadding
    );
    return (
      `/Tx BMC q ${colors}BT ` +
      defaultAppearance +
      ` 1 0 0 1 0 0 Tm ${renderedText}` +
      " ET Q EMC"
    );
  }

  static async _getFontData(evaluator, task, appearanceData, resources) {
    const operatorList = new OperatorList();
    const initialState = {
      font: null,
      clone() {
        return this;
      },
    };

    const { fontName, fontSize } = appearanceData;
    await evaluator.handleSetFont(
      resources,
      [fontName && Name.get(fontName), fontSize],
      /* fontRef = */ null,
      operatorList,
      task,
      initialState,
      /* fallbackFontDict = */ null
    );

    return initialState.font;
  }

  _getTextWidth(text, font) {
    return (
      font
        .charsToGlyphs(text)
        .reduce((width, glyph) => width + glyph.width, 0) / 1000
    );
  }

  _computeFontSize(height, width, text, font, lineCount) {
    let { fontSize } = this.data.defaultAppearanceData;
    let lineHeight = (fontSize || 12) * LINE_FACTOR,
      numberOfLines = Math.round(height / lineHeight);

    if (!fontSize) {
      // A zero value for size means that the font shall be auto-sized:
      // its size shall be computed as a function of the height of the
      // annotation rectangle (see 12.7.3.3).

      const roundWithTwoDigits = x => Math.floor(x * 100) / 100;

      if (lineCount === -1) {
        const textWidth = this._getTextWidth(text, font);
        fontSize = roundWithTwoDigits(
          Math.min(
            height / LINE_FACTOR,
            textWidth > width ? width / textWidth : Infinity
          )
        );
        numberOfLines = 1;
      } else {
        const lines = text.split(/\r\n?|\n/);
        const cachedLines = [];
        for (const line of lines) {
          const encoded = font.encodeString(line).join("");
          const glyphs = font.charsToGlyphs(encoded);
          const positions = font.getCharPositions(encoded);
          cachedLines.push({
            line: encoded,
            glyphs,
            positions,
          });
        }

        const isTooBig = fsize => {
          // Return true when the text doesn't fit the given height.
          let totalHeight = 0;
          for (const cache of cachedLines) {
            const chunks = this._splitLine(null, font, fsize, width, cache);
            totalHeight += chunks.length * fsize;
            if (totalHeight > height) {
              return true;
            }
          }
          return false;
        };

        // Hard to guess how many lines there are.
        // The field may have been sized to have 10 lines
        // and the user entered only 1 so if we get font size from
        // height and number of lines then we'll get something too big.
        // So we compute a fake number of lines based on height and
        // a font size equal to 12 (this is the default font size in
        // Acrobat).
        // Then we'll adjust font size to what we have really.
        numberOfLines = Math.max(numberOfLines, lineCount);

        while (true) {
          lineHeight = height / numberOfLines;
          fontSize = roundWithTwoDigits(lineHeight / LINE_FACTOR);

          if (isTooBig(fontSize)) {
            numberOfLines++;
            continue;
          }

          break;
        }
      }

      const { fontName, fontColor } = this.data.defaultAppearanceData;
      this._defaultAppearance = createDefaultAppearance({
        fontSize,
        fontName,
        fontColor,
      });
    }

    return [this._defaultAppearance, fontSize, height / numberOfLines];
  }

  _renderText(
    text,
    font,
    fontSize,
    totalWidth,
    alignment,
    prevInfo,
    hPadding,
    vPadding
  ) {
    // TODO: we need to take into account (if possible) how the text
    // is rendered. For example in arabic, the cumulated width of some
    // glyphs isn't equal to the width of the rendered glyphs because
    // of ligatures.
    let shift;
    if (alignment === 1) {
      // Center
      const width = this._getTextWidth(text, font) * fontSize;
      shift = (totalWidth - width) / 2;
    } else if (alignment === 2) {
      // Right
      const width = this._getTextWidth(text, font) * fontSize;
      shift = totalWidth - width - hPadding;
    } else {
      shift = hPadding;
    }
    const shiftStr = numberToString(shift - prevInfo.shift);
    prevInfo.shift = shift;
    vPadding = numberToString(vPadding);

    return `${shiftStr} ${vPadding} Td (${escapeString(text)}) Tj`;
  }

  /**
   * @private
   */
  _getSaveFieldResources(xref) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        this.data.defaultAppearanceData,
        "Expected `_defaultAppearanceData` to have been set."
      );
    }
    const { localResources, appearanceResources, acroFormResources } =
      this._fieldResources;

    const fontName = this.data.defaultAppearanceData?.fontName;
    if (!fontName) {
      return localResources || Dict.empty;
    }

    for (const resources of [localResources, appearanceResources]) {
      if (resources instanceof Dict) {
        const localFont = resources.get("Font");
        if (localFont instanceof Dict && localFont.has(fontName)) {
          return resources;
        }
      }
    }
    if (acroFormResources instanceof Dict) {
      const acroFormFont = acroFormResources.get("Font");
      if (acroFormFont instanceof Dict && acroFormFont.has(fontName)) {
        const subFontDict = new Dict(xref);
        subFontDict.set(fontName, acroFormFont.getRaw(fontName));

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

  getFieldObject() {
    return null;
  }
}

class TextWidgetAnnotation extends WidgetAnnotation {
  constructor(params) {
    super(params);

    this.data.hasOwnCanvas = this.data.readOnly && !this.data.noHTML;
    this._hasText = true;

    const dict = params.dict;

    // The field value is always a string.
    if (typeof this.data.fieldValue !== "string") {
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
      maximumLength = 0;
    }
    this.data.maxLen = maximumLength;

    // Process field flags for the display layer.
    this.data.multiLine = this.hasFieldFlag(AnnotationFieldFlag.MULTILINE);
    this.data.comb =
      this.hasFieldFlag(AnnotationFieldFlag.COMB) &&
      !this.hasFieldFlag(AnnotationFieldFlag.MULTILINE) &&
      !this.hasFieldFlag(AnnotationFieldFlag.PASSWORD) &&
      !this.hasFieldFlag(AnnotationFieldFlag.FILESELECT) &&
      this.data.maxLen !== 0;
    this.data.doNotScroll = this.hasFieldFlag(AnnotationFieldFlag.DONOTSCROLL);
  }

  get hasTextContent() {
    return !!this.appearance && !this._needAppearances;
  }

  _getCombAppearance(
    defaultAppearance,
    font,
    text,
    fontSize,
    width,
    height,
    hPadding,
    vPadding,
    descent,
    lineHeight,
    annotationStorage
  ) {
    const combWidth = width / this.data.maxLen;
    // Empty or it has a trailing whitespace.
    const colors = this.getBorderAndBackgroundAppearances(annotationStorage);

    const buf = [];
    const positions = font.getCharPositions(text);
    for (const [start, end] of positions) {
      buf.push(`(${escapeString(text.substring(start, end))}) Tj`);
    }

    const renderedComb = buf.join(` ${numberToString(combWidth)} 0 Td `);
    return (
      `/Tx BMC q ${colors}BT ` +
      defaultAppearance +
      ` 1 0 0 1 ${numberToString(hPadding)} ${numberToString(
        vPadding + descent
      )} Tm ${renderedComb}` +
      " ET Q EMC"
    );
  }

  _getMultilineAppearance(
    defaultAppearance,
    lines,
    font,
    fontSize,
    width,
    height,
    alignment,
    hPadding,
    vPadding,
    descent,
    lineHeight,
    annotationStorage
  ) {
    const buf = [];
    const totalWidth = width - 2 * hPadding;
    const prevInfo = { shift: 0 };
    for (let i = 0, ii = lines.length; i < ii; i++) {
      const line = lines[i];
      const chunks = this._splitLine(line, font, fontSize, totalWidth);
      for (let j = 0, jj = chunks.length; j < jj; j++) {
        const chunk = chunks[j];
        const vShift =
          i === 0 && j === 0 ? -vPadding - (lineHeight - descent) : -lineHeight;
        buf.push(
          this._renderText(
            chunk,
            font,
            fontSize,
            width,
            alignment,
            prevInfo,
            hPadding,
            vShift
          )
        );
      }
    }

    // Empty or it has a trailing whitespace.
    const colors = this.getBorderAndBackgroundAppearances(annotationStorage);
    const renderedText = buf.join("\n");

    return (
      `/Tx BMC q ${colors}BT ` +
      defaultAppearance +
      ` 1 0 0 1 0 ${numberToString(height)} Tm ${renderedText}` +
      " ET Q EMC"
    );
  }

  _splitLine(line, font, fontSize, width, cache = {}) {
    line = cache.line || line;

    const glyphs = cache.glyphs || font.charsToGlyphs(line);

    if (glyphs.length <= 1) {
      // Nothing to split
      return [line];
    }

    const positions = cache.positions || font.getCharPositions(line);
    const scale = fontSize / 1000;
    const chunks = [];

    let lastSpacePosInStringStart = -1,
      lastSpacePosInStringEnd = -1,
      lastSpacePos = -1,
      startChunk = 0,
      currentWidth = 0;

    for (let i = 0, ii = glyphs.length; i < ii; i++) {
      const [start, end] = positions[i];
      const glyph = glyphs[i];
      const glyphWidth = glyph.width * scale;
      if (glyph.unicode === " ") {
        if (currentWidth + glyphWidth > width) {
          // We can break here
          chunks.push(line.substring(startChunk, start));
          startChunk = start;
          currentWidth = glyphWidth;
          lastSpacePosInStringStart = -1;
          lastSpacePos = -1;
        } else {
          currentWidth += glyphWidth;
          lastSpacePosInStringStart = start;
          lastSpacePosInStringEnd = end;
          lastSpacePos = i;
        }
      } else if (currentWidth + glyphWidth > width) {
        // We must break to the last white position (if available)
        if (lastSpacePosInStringStart !== -1) {
          chunks.push(line.substring(startChunk, lastSpacePosInStringEnd));
          startChunk = lastSpacePosInStringEnd;
          i = lastSpacePos + 1;
          lastSpacePosInStringStart = -1;
          currentWidth = 0;
        } else {
          // Just break in the middle of the word
          chunks.push(line.substring(startChunk, start));
          startChunk = start;
          currentWidth = glyphWidth;
        }
      } else {
        currentWidth += glyphWidth;
      }
    }

    if (startChunk < line.length) {
      chunks.push(line.substring(startChunk, line.length));
    }

    return chunks;
  }

  getFieldObject() {
    return {
      id: this.data.id,
      value: this.data.fieldValue,
      defaultValue: this.data.defaultFieldValue || "",
      multiline: this.data.multiLine,
      password: this.hasFieldFlag(AnnotationFieldFlag.PASSWORD),
      charLimit: this.data.maxLen,
      comb: this.data.comb,
      editable: !this.data.readOnly,
      hidden: this.data.hidden,
      name: this.data.fieldName,
      rect: this.data.rect,
      actions: this.data.actions,
      page: this.data.pageIndex,
      strokeColor: this.data.borderColor,
      fillColor: this.data.backgroundColor,
      rotation: this.rotation,
      type: "text",
    };
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
    this.data.isTooltipOnly = false;

    if (this.data.checkBox) {
      this._processCheckBox(params);
    } else if (this.data.radioButton) {
      this._processRadioButton(params);
    } else if (this.data.pushButton) {
      this.data.hasOwnCanvas = true;
      this._processPushButton(params);
    } else {
      warn("Invalid field flags for button widget annotation");
    }
  }

  async getOperatorList(
    evaluator,
    task,
    intent,
    renderForms,
    annotationStorage
  ) {
    if (this.data.pushButton) {
      return super.getOperatorList(
        evaluator,
        task,
        intent,
        false, // we use normalAppearance to render the button
        annotationStorage
      );
    }

    let value = null;
    let rotation = null;
    if (annotationStorage) {
      const storageEntry = annotationStorage.get(this.data.id);
      value = storageEntry ? storageEntry.value : null;
      rotation = storageEntry ? storageEntry.rotation : null;
    }

    if (value === null && this.appearance) {
      // Nothing in the annotationStorage.
      // But we've a default appearance so use it.
      return super.getOperatorList(
        evaluator,
        task,
        intent,
        renderForms,
        annotationStorage
      );
    }

    if (value === null || value === undefined) {
      // There is no default appearance so use the one derived
      // from the field value.
      value = this.data.checkBox
        ? this.data.fieldValue === this.data.exportValue
        : this.data.fieldValue === this.data.buttonValue;
    }

    const appearance = value
      ? this.checkedAppearance
      : this.uncheckedAppearance;
    if (appearance) {
      const savedAppearance = this.appearance;
      const savedMatrix = appearance.dict.getArray("Matrix") || IDENTITY_MATRIX;

      if (rotation) {
        appearance.dict.set(
          "Matrix",
          this.getRotationMatrix(annotationStorage)
        );
      }

      this.appearance = appearance;
      const operatorList = super.getOperatorList(
        evaluator,
        task,
        intent,
        renderForms,
        annotationStorage
      );
      this.appearance = savedAppearance;
      appearance.dict.set("Matrix", savedMatrix);
      return operatorList;
    }

    // No appearance
    return {
      opList: new OperatorList(),
      separateForm: false,
      separateCanvas: false,
    };
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
    if (!annotationStorage) {
      return null;
    }
    const storageEntry = annotationStorage.get(this.data.id);
    let rotation = storageEntry?.rotation,
      value = storageEntry?.value;

    if (rotation === undefined) {
      if (value === undefined) {
        return null;
      }

      const defaultValue = this.data.fieldValue === this.data.exportValue;
      if (defaultValue === value) {
        return null;
      }
    }

    const dict = evaluator.xref.fetchIfRef(this.ref);
    if (!(dict instanceof Dict)) {
      return null;
    }

    if (rotation === undefined) {
      rotation = this.rotation;
    }
    if (value === undefined) {
      value = this.data.fieldValue === this.data.exportValue;
    }

    const xfa = {
      path: this.data.fieldName,
      value: value ? this.data.exportValue : "",
    };

    const name = Name.get(value ? this.data.exportValue : "Off");
    dict.set("V", name);
    dict.set("AS", name);
    dict.set("M", `D:${getModificationDate()}`);

    const maybeMK = this._getMKDict(rotation);
    if (maybeMK) {
      dict.set("MK", maybeMK);
    }

    const buffer = [];
    await writeObject(this.ref, dict, buffer, evaluator.xref);

    return [{ ref: this.ref, data: buffer.join(""), xfa }];
  }

  async _saveRadioButton(evaluator, task, annotationStorage) {
    if (!annotationStorage) {
      return null;
    }
    const storageEntry = annotationStorage.get(this.data.id);
    let rotation = storageEntry?.rotation,
      value = storageEntry?.value;

    if (rotation === undefined) {
      if (value === undefined) {
        return null;
      }

      const defaultValue = this.data.fieldValue === this.data.buttonValue;
      if (defaultValue === value) {
        return null;
      }
    }

    const dict = evaluator.xref.fetchIfRef(this.ref);
    if (!(dict instanceof Dict)) {
      return null;
    }

    if (value === undefined) {
      value = this.data.fieldValue === this.data.buttonValue;
    }

    if (rotation === undefined) {
      rotation = this.rotation;
    }

    const xfa = {
      path: this.data.fieldName,
      value: value ? this.data.buttonValue : "",
    };

    const name = Name.get(value ? this.data.buttonValue : "Off");
    const buffer = [];
    let parentData = null;

    if (value) {
      if (this.parent instanceof Ref) {
        const parent = evaluator.xref.fetch(this.parent);
        parent.set("V", name);
        await writeObject(this.parent, parent, buffer, evaluator.xref);
        parentData = buffer.join("");
        buffer.length = 0;
      } else if (this.parent instanceof Dict) {
        this.parent.set("V", name);
      }
    }

    dict.set("AS", name);
    dict.set("M", `D:${getModificationDate()}`);

    const maybeMK = this._getMKDict(rotation);
    if (maybeMK) {
      dict.set("MK", maybeMK);
    }

    await writeObject(this.ref, dict, buffer, evaluator.xref);
    const newRefs = [{ ref: this.ref, data: buffer.join(""), xfa }];
    if (parentData) {
      newRefs.push({ ref: this.parent, data: parentData, xfa: null });
    }

    return newRefs;
  }

  _getDefaultCheckedAppearance(params, type) {
    const width = this.data.rect[2] - this.data.rect[0];
    const height = this.data.rect[3] - this.data.rect[1];
    const bbox = [0, 0, width, height];

    // Ratio used to have a mark slightly smaller than the bbox.
    const FONT_RATIO = 0.8;
    const fontSize = Math.min(width, height) * FONT_RATIO;

    // Char Metrics
    // Widths came from widths for ZapfDingbats.
    // Heights are guessed with Fontforge and FoxitDingbats.pfb.
    let metrics, char;
    if (type === "check") {
      // Char 33 (2713 in unicode)
      metrics = {
        width: 0.755 * fontSize,
        height: 0.705 * fontSize,
      };
      char = "\x33";
    } else if (type === "disc") {
      // Char 6C (25CF in unicode)
      metrics = {
        width: 0.791 * fontSize,
        height: 0.705 * fontSize,
      };
      char = "\x6C";
    } else {
      unreachable(`_getDefaultCheckedAppearance - unsupported type: ${type}`);
    }

    // Values to center the glyph in the bbox.
    const xShift = numberToString((width - metrics.width) / 2);
    const yShift = numberToString((height - metrics.height) / 2);

    const appearance = `q BT /PdfJsZaDb ${fontSize} Tf 0 g ${xShift} ${yShift} Td (${char}) Tj ET Q`;

    const appearanceStreamDict = new Dict(params.xref);
    appearanceStreamDict.set("FormType", 1);
    appearanceStreamDict.set("Subtype", Name.get("Form"));
    appearanceStreamDict.set("Type", Name.get("XObject"));
    appearanceStreamDict.set("BBox", bbox);
    appearanceStreamDict.set("Matrix", [1, 0, 0, 1, 0, 0]);
    appearanceStreamDict.set("Length", appearance.length);

    const resources = new Dict(params.xref);
    const font = new Dict(params.xref);
    font.set("PdfJsZaDb", this.fallbackFontDict);
    resources.set("Font", font);

    appearanceStreamDict.set("Resources", resources);

    this.checkedAppearance = new StringStream(appearance);
    this.checkedAppearance.dict = appearanceStreamDict;

    this._streams.push(this.checkedAppearance);
  }

  _processCheckBox(params) {
    const customAppearance = params.dict.get("AP");
    if (!(customAppearance instanceof Dict)) {
      return;
    }

    const normalAppearance = customAppearance.get("N");
    if (!(normalAppearance instanceof Dict)) {
      return;
    }

    // See https://bugzilla.mozilla.org/show_bug.cgi?id=1722036.
    // If we've an AS and a V then take AS.
    const asValue = this._decodeFormValue(params.dict.get("AS"));
    if (typeof asValue === "string") {
      this.data.fieldValue = asValue;
    }

    const yes =
      this.data.fieldValue !== null && this.data.fieldValue !== "Off"
        ? this.data.fieldValue
        : "Yes";

    const exportValues = normalAppearance.getKeys();
    if (exportValues.length === 0) {
      exportValues.push("Off", yes);
    } else if (exportValues.length === 1) {
      if (exportValues[0] === "Off") {
        exportValues.push(yes);
      } else {
        exportValues.unshift("Off");
      }
    } else if (exportValues.includes(yes)) {
      exportValues.length = 0;
      exportValues.push("Off", yes);
    } else {
      const otherYes = exportValues.find(v => v !== "Off");
      exportValues.length = 0;
      exportValues.push("Off", otherYes);
    }

    // Don't use a "V" entry pointing to a non-existent appearance state,
    // see e.g. bug1720411.pdf where it's an *empty* Name-instance.
    if (!exportValues.includes(this.data.fieldValue)) {
      this.data.fieldValue = "Off";
    }

    this.data.exportValue = exportValues[1];

    const checkedAppearance = normalAppearance.get(this.data.exportValue);
    this.checkedAppearance =
      checkedAppearance instanceof BaseStream ? checkedAppearance : null;
    const uncheckedAppearance = normalAppearance.get("Off");
    this.uncheckedAppearance =
      uncheckedAppearance instanceof BaseStream ? uncheckedAppearance : null;

    if (this.checkedAppearance) {
      this._streams.push(this.checkedAppearance);
    } else {
      this._getDefaultCheckedAppearance(params, "check");
    }
    if (this.uncheckedAppearance) {
      this._streams.push(this.uncheckedAppearance);
    }
    this._fallbackFontDict = this.fallbackFontDict;
    if (this.data.defaultFieldValue === null) {
      this.data.defaultFieldValue = "Off";
    }
  }

  _processRadioButton(params) {
    this.data.fieldValue = this.data.buttonValue = null;

    // The parent field's `V` entry holds a `Name` object with the appearance
    // state of whichever child field is currently in the "on" state.
    const fieldParent = params.dict.get("Parent");
    if (fieldParent instanceof Dict) {
      this.parent = params.dict.getRaw("Parent");
      const fieldParentValue = fieldParent.get("V");
      if (fieldParentValue instanceof Name) {
        this.data.fieldValue = this._decodeFormValue(fieldParentValue);
      }
    }

    // The button's value corresponds to its appearance state.
    const appearanceStates = params.dict.get("AP");
    if (!(appearanceStates instanceof Dict)) {
      return;
    }
    const normalAppearance = appearanceStates.get("N");
    if (!(normalAppearance instanceof Dict)) {
      return;
    }
    for (const key of normalAppearance.getKeys()) {
      if (key !== "Off") {
        this.data.buttonValue = this._decodeFormValue(key);
        break;
      }
    }

    const checkedAppearance = normalAppearance.get(this.data.buttonValue);
    this.checkedAppearance =
      checkedAppearance instanceof BaseStream ? checkedAppearance : null;
    const uncheckedAppearance = normalAppearance.get("Off");
    this.uncheckedAppearance =
      uncheckedAppearance instanceof BaseStream ? uncheckedAppearance : null;

    if (this.checkedAppearance) {
      this._streams.push(this.checkedAppearance);
    } else {
      this._getDefaultCheckedAppearance(params, "disc");
    }
    if (this.uncheckedAppearance) {
      this._streams.push(this.uncheckedAppearance);
    }
    this._fallbackFontDict = this.fallbackFontDict;
    if (this.data.defaultFieldValue === null) {
      this.data.defaultFieldValue = "Off";
    }
  }

  _processPushButton(params) {
    const { dict, annotationGlobals } = params;

    if (!dict.has("A") && !dict.has("AA") && !this.data.alternativeText) {
      warn("Push buttons without action dictionaries are not supported");
      return;
    }

    this.data.isTooltipOnly = !dict.has("A") && !dict.has("AA");

    Catalog.parseDestDictionary({
      destDict: dict,
      resultObj: this.data,
      docBaseUrl: annotationGlobals.baseUrl,
      docAttachments: annotationGlobals.attachments,
    });
  }

  getFieldObject() {
    let type = "button";
    let exportValues;
    if (this.data.checkBox) {
      type = "checkbox";
      exportValues = this.data.exportValue;
    } else if (this.data.radioButton) {
      type = "radiobutton";
      exportValues = this.data.buttonValue;
    }
    return {
      id: this.data.id,
      value: this.data.fieldValue || "Off",
      defaultValue: this.data.defaultFieldValue,
      exportValues,
      editable: !this.data.readOnly,
      name: this.data.fieldName,
      rect: this.data.rect,
      hidden: this.data.hidden,
      actions: this.data.actions,
      page: this.data.pageIndex,
      strokeColor: this.data.borderColor,
      fillColor: this.data.backgroundColor,
      rotation: this.rotation,
      type,
    };
  }

  get fallbackFontDict() {
    const dict = new Dict();
    dict.set("BaseFont", Name.get("ZapfDingbats"));
    dict.set("Type", Name.get("FallbackType"));
    dict.set("Subtype", Name.get("FallbackType"));
    dict.set("Encoding", Name.get("ZapfDingbatsEncoding"));

    return shadow(this, "fallbackFontDict", dict);
  }
}

class ChoiceWidgetAnnotation extends WidgetAnnotation {
  constructor(params) {
    super(params);

    const { dict, xref } = params;

    this.indices = dict.getArray("I");
    this.hasIndices = Array.isArray(this.indices) && this.indices.length > 0;

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

    const options = getInheritableProperty({ dict, key: "Opt" });
    if (Array.isArray(options)) {
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

    if (!this.hasIndices) {
      // The field value can be `null` if no item is selected, a string if one
      // item is selected or an array of strings if multiple items are selected.
      // For consistency in the API and convenience in the display layer, we
      // always make the field value an array with zero, one or multiple items.
      if (typeof this.data.fieldValue === "string") {
        this.data.fieldValue = [this.data.fieldValue];
      } else if (!this.data.fieldValue) {
        this.data.fieldValue = [];
      }
    } else {
      // The specs say that we should have an indices array only with
      // multiselectable Choice and the "V" entry should have the
      // precedence, but Acrobat itself is using it whatever the
      // the "V" entry is (see bug 1770750).
      this.data.fieldValue = [];
      const ii = this.data.options.length;
      for (const i of this.indices) {
        if (Number.isInteger(i) && i >= 0 && i < ii) {
          this.data.fieldValue.push(this.data.options[i].exportValue);
        }
      }
    }

    // Process field flags for the display layer.
    this.data.combo = this.hasFieldFlag(AnnotationFieldFlag.COMBO);
    this.data.multiSelect = this.hasFieldFlag(AnnotationFieldFlag.MULTISELECT);
    this._hasText = true;
  }

  getFieldObject() {
    const type = this.data.combo ? "combobox" : "listbox";
    const value =
      this.data.fieldValue.length > 0 ? this.data.fieldValue[0] : null;
    return {
      id: this.data.id,
      value,
      defaultValue: this.data.defaultFieldValue,
      editable: !this.data.readOnly,
      name: this.data.fieldName,
      rect: this.data.rect,
      numItems: this.data.fieldValue.length,
      multipleSelection: this.data.multiSelect,
      hidden: this.data.hidden,
      actions: this.data.actions,
      items: this.data.options,
      page: this.data.pageIndex,
      strokeColor: this.data.borderColor,
      fillColor: this.data.backgroundColor,
      rotation: this.rotation,
      type,
    };
  }

  amendSavedDict(annotationStorage, dict) {
    if (!this.hasIndices) {
      return;
    }
    let values = annotationStorage?.get(this.data.id)?.value;
    if (!Array.isArray(values)) {
      values = [values];
    }
    const indices = [];
    const { options } = this.data;
    for (let i = 0, j = 0, ii = options.length; i < ii; i++) {
      if (options[i].exportValue === values[j]) {
        indices.push(i);
        j += 1;
      }
    }
    dict.set("I", indices);
  }

  async _getAppearance(evaluator, task, intent, annotationStorage) {
    if (this.data.combo) {
      return super._getAppearance(evaluator, task, intent, annotationStorage);
    }

    let exportedValue, rotation;
    const storageEntry = annotationStorage?.get(this.data.id);
    if (storageEntry) {
      rotation = storageEntry.rotation;
      exportedValue = storageEntry.value;
    }

    if (
      rotation === undefined &&
      exportedValue === undefined &&
      !this._needAppearances
    ) {
      // The annotation hasn't been rendered so use the appearance
      return null;
    }

    if (exportedValue === undefined) {
      exportedValue = this.data.fieldValue;
    } else if (!Array.isArray(exportedValue)) {
      exportedValue = [exportedValue];
    }

    const defaultPadding = 1;
    const defaultHPadding = 2;
    let totalHeight = this.data.rect[3] - this.data.rect[1];
    let totalWidth = this.data.rect[2] - this.data.rect[0];

    if (rotation === 90 || rotation === 270) {
      [totalWidth, totalHeight] = [totalHeight, totalWidth];
    }

    const lineCount = this.data.options.length;
    const valueIndices = [];
    for (let i = 0; i < lineCount; i++) {
      const { exportValue } = this.data.options[i];
      if (exportedValue.includes(exportValue)) {
        valueIndices.push(i);
      }
    }

    if (!this._defaultAppearance) {
      // The DA is required and must be a string.
      // If there is no font named Helvetica in the resource dictionary,
      // the evaluator will fall back to a default font.
      // Doing so prevents exceptions and allows saving/printing
      // the file as expected.
      this.data.defaultAppearanceData = parseDefaultAppearance(
        (this._defaultAppearance = "/Helvetica 0 Tf 0 g")
      );
    }

    const font = await WidgetAnnotation._getFontData(
      evaluator,
      task,
      this.data.defaultAppearanceData,
      this._fieldResources.mergedResources
    );

    let defaultAppearance;
    let { fontSize } = this.data.defaultAppearanceData;
    if (!fontSize) {
      const lineHeight = (totalHeight - defaultPadding) / lineCount;
      let lineWidth = -1;
      let value;
      for (const { displayValue } of this.data.options) {
        const width = this._getTextWidth(displayValue, font);
        if (width > lineWidth) {
          lineWidth = width;
          value = displayValue;
        }
      }

      [defaultAppearance, fontSize] = this._computeFontSize(
        lineHeight,
        totalWidth - 2 * defaultHPadding,
        value,
        font,
        -1
      );
    } else {
      defaultAppearance = this._defaultAppearance;
    }

    const lineHeight = fontSize * LINE_FACTOR;
    const vPadding = (lineHeight - fontSize) / 2;
    const numberOfVisibleLines = Math.floor(totalHeight / lineHeight);

    let firstIndex = 0;
    if (valueIndices.length > 0) {
      const minIndex = Math.min(...valueIndices);
      const maxIndex = Math.max(...valueIndices);

      firstIndex = Math.max(0, maxIndex - numberOfVisibleLines + 1);
      if (firstIndex > minIndex) {
        firstIndex = minIndex;
      }
    }
    const end = Math.min(firstIndex + numberOfVisibleLines + 1, lineCount);

    const buf = ["/Tx BMC q", `1 1 ${totalWidth} ${totalHeight} re W n`];

    if (valueIndices.length) {
      // This value has been copied/pasted from annotation-choice-widget.pdf.
      // It corresponds to rgb(153, 193, 218).
      buf.push("0.600006 0.756866 0.854904 rg");

      // Highlight the lines in filling a blue rectangle at the selected
      // positions.
      for (const index of valueIndices) {
        if (firstIndex <= index && index < end) {
          buf.push(
            `1 ${
              totalHeight - (index - firstIndex + 1) * lineHeight
            } ${totalWidth} ${lineHeight} re f`
          );
        }
      }
    }
    buf.push("BT", defaultAppearance, `1 0 0 1 0 ${totalHeight} Tm`);

    const prevInfo = { shift: 0 };
    for (let i = firstIndex; i < end; i++) {
      const { displayValue } = this.data.options[i];
      const vpadding = i === firstIndex ? vPadding : 0;
      buf.push(
        this._renderText(
          displayValue,
          font,
          fontSize,
          totalWidth,
          0,
          prevInfo,
          defaultHPadding,
          -lineHeight + vpadding
        )
      );
    }

    buf.push("ET Q EMC");

    return buf.join("\n");
  }
}

class SignatureWidgetAnnotation extends WidgetAnnotation {
  constructor(params) {
    super(params);

    // Unset the fieldValue since it's (most likely) a `Dict` which is
    // non-serializable and will thus cause errors when sending annotations
    // to the main-thread (issue 10347).
    this.data.fieldValue = null;
    this.data.hasOwnCanvas = this.data.noRotate;
  }

  getFieldObject() {
    return {
      id: this.data.id,
      value: null,
      page: this.data.pageIndex,
      type: "signature",
    };
  }
}

class TextAnnotation extends MarkupAnnotation {
  constructor(params) {
    const DEFAULT_ICON_SIZE = 22; // px

    super(params);

    // No rotation for Text (see 12.5.6.4).
    this.data.noRotate = true;
    this.data.hasOwnCanvas = this.data.noRotate;

    const { dict } = params;
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

    const { dict, annotationGlobals } = params;
    this.data.annotationType = AnnotationType.LINK;

    const quadPoints = getQuadPoints(dict, this.rectangle);
    if (quadPoints) {
      this.data.quadPoints = quadPoints;
    }

    // The color entry for a link annotation is the color of the border.
    this.data.borderColor ||= this.data.color;

    Catalog.parseDestDictionary({
      destDict: dict,
      resultObj: this.data,
      docBaseUrl: annotationGlobals.baseUrl,
      docAttachments: annotationGlobals.attachments,
    });
  }
}

class PopupAnnotation extends Annotation {
  constructor(params) {
    super(params);

    const { dict } = params;
    this.data.annotationType = AnnotationType.POPUP;
    if (
      this.data.rect[0] === this.data.rect[2] ||
      this.data.rect[1] === this.data.rect[3]
    ) {
      this.data.rect = null;
    }

    let parentItem = dict.get("Parent");
    if (!parentItem) {
      warn("Popup annotation has a missing or invalid parent annotation.");
      return;
    }

    const parentRect = parentItem.getArray("Rect");
    this.data.parentRect =
      Array.isArray(parentRect) && parentRect.length === 4
        ? Util.normalizeRect(parentRect)
        : null;

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

    this.setTitle(parentItem.get("T"));
    this.data.titleObj = this._title;

    this.setContents(parentItem.get("Contents"));
    this.data.contentsObj = this._contents;

    if (parentItem.has("RC")) {
      this.data.richText = XFAFactory.getRichTextAsHtml(parentItem.get("RC"));
    }

    this.data.open = !!dict.get("Open");
  }
}

class FreeTextAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);

    this.data.hasOwnCanvas = true;

    const { evaluatorOptions, xref } = params;
    this.data.annotationType = AnnotationType.FREETEXT;
    this.setDefaultAppearance(params);
    if (this.appearance) {
      const { fontColor, fontSize } = parseAppearanceStream(
        this.appearance,
        evaluatorOptions,
        xref
      );
      this.data.defaultAppearanceData.fontColor = fontColor;
      this.data.defaultAppearanceData.fontSize = fontSize || 10;
    } else if (this._isOffscreenCanvasSupported) {
      const strokeAlpha = params.dict.get("CA");
      const fakeUnicodeFont = new FakeUnicodeFont(xref, "sans-serif");
      this.data.defaultAppearanceData.fontSize ||= 10;
      const { fontColor, fontSize } = this.data.defaultAppearanceData;
      this.appearance = fakeUnicodeFont.createAppearance(
        this._contents.str,
        this.rectangle,
        this.rotation,
        fontSize,
        fontColor,
        strokeAlpha
      );
      this._streams.push(this.appearance, FakeUnicodeFont.toUnicodeStream);
    } else {
      warn(
        "FreeTextAnnotation: OffscreenCanvas is not supported, annotation may not render correctly."
      );
    }
  }

  get hasTextContent() {
    return !!this.appearance;
  }

  static createNewDict(annotation, xref, { apRef, ap }) {
    const { color, fontSize, rect, rotation, user, value } = annotation;
    const freetext = new Dict(xref);
    freetext.set("Type", Name.get("Annot"));
    freetext.set("Subtype", Name.get("FreeText"));
    freetext.set("CreationDate", `D:${getModificationDate()}`);
    freetext.set("Rect", rect);
    const da = `/Helv ${fontSize} Tf ${getPdfColor(color, /* isFill */ true)}`;
    freetext.set("DA", da);
    freetext.set(
      "Contents",
      isAscii(value)
        ? value
        : stringToUTF16String(value, /* bigEndian = */ true)
    );
    freetext.set("F", 4);
    freetext.set("Border", [0, 0, 0]);
    freetext.set("Rotate", rotation);

    if (user) {
      freetext.set(
        "T",
        isAscii(user) ? user : stringToUTF16String(user, /* bigEndian = */ true)
      );
    }

    if (apRef || ap) {
      const n = new Dict(xref);
      freetext.set("AP", n);

      if (apRef) {
        n.set("N", apRef);
      } else {
        n.set("N", ap);
      }
    }

    return freetext;
  }

  static async createNewAppearanceStream(annotation, xref, params) {
    const { baseFontRef, evaluator, task } = params;
    const { color, fontSize, rect, rotation, value } = annotation;

    const resources = new Dict(xref);
    const font = new Dict(xref);

    if (baseFontRef) {
      font.set("Helv", baseFontRef);
    } else {
      const baseFont = new Dict(xref);
      baseFont.set("BaseFont", Name.get("Helvetica"));
      baseFont.set("Type", Name.get("Font"));
      baseFont.set("Subtype", Name.get("Type1"));
      baseFont.set("Encoding", Name.get("WinAnsiEncoding"));
      font.set("Helv", baseFont);
    }
    resources.set("Font", font);

    const helv = await WidgetAnnotation._getFontData(
      evaluator,
      task,
      {
        fontName: "Helv",
        fontSize,
      },
      resources
    );

    const [x1, y1, x2, y2] = rect;
    let w = x2 - x1;
    let h = y2 - y1;

    if (rotation % 180 !== 0) {
      [w, h] = [h, w];
    }

    const lines = value.split("\n");
    const scale = fontSize / 1000;
    let totalWidth = -Infinity;
    const encodedLines = [];
    for (let line of lines) {
      const encoded = helv.encodeString(line);
      if (encoded.length > 1) {
        // The font doesn't contain all the chars.
        return null;
      }
      line = encoded.join("");
      encodedLines.push(line);
      let lineWidth = 0;
      const glyphs = helv.charsToGlyphs(line);
      for (const glyph of glyphs) {
        lineWidth += glyph.width * scale;
      }
      totalWidth = Math.max(totalWidth, lineWidth);
    }

    let hscale = 1;
    if (totalWidth > w) {
      hscale = w / totalWidth;
    }
    let vscale = 1;
    const lineHeight = LINE_FACTOR * fontSize;
    const lineAscent = (LINE_FACTOR - LINE_DESCENT_FACTOR) * fontSize;
    const totalHeight = lineHeight * lines.length;
    if (totalHeight > h) {
      vscale = h / totalHeight;
    }
    const fscale = Math.min(hscale, vscale);
    const newFontSize = fontSize * fscale;
    let firstPoint, clipBox, matrix;
    switch (rotation) {
      case 0:
        matrix = [1, 0, 0, 1];
        clipBox = [rect[0], rect[1], w, h];
        firstPoint = [rect[0], rect[3] - lineAscent];
        break;
      case 90:
        matrix = [0, 1, -1, 0];
        clipBox = [rect[1], -rect[2], w, h];
        firstPoint = [rect[1], -rect[0] - lineAscent];
        break;
      case 180:
        matrix = [-1, 0, 0, -1];
        clipBox = [-rect[2], -rect[3], w, h];
        firstPoint = [-rect[2], -rect[1] - lineAscent];
        break;
      case 270:
        matrix = [0, -1, 1, 0];
        clipBox = [-rect[3], rect[0], w, h];
        firstPoint = [-rect[3], rect[2] - lineAscent];
        break;
    }

    const buffer = [
      "q",
      `${matrix.join(" ")} 0 0 cm`,
      `${clipBox.join(" ")} re W n`,
      `BT`,
      `${getPdfColor(color, /* isFill */ true)}`,
      `0 Tc /Helv ${numberToString(newFontSize)} Tf`,
    ];

    buffer.push(
      `${firstPoint.join(" ")} Td (${escapeString(encodedLines[0])}) Tj`
    );
    const vShift = numberToString(lineHeight);
    for (let i = 1, ii = encodedLines.length; i < ii; i++) {
      const line = encodedLines[i];
      buffer.push(`0 -${vShift} Td (${escapeString(line)}) Tj`);
    }
    buffer.push("ET", "Q");
    const appearance = buffer.join("\n");

    const appearanceStreamDict = new Dict(xref);
    appearanceStreamDict.set("FormType", 1);
    appearanceStreamDict.set("Subtype", Name.get("Form"));
    appearanceStreamDict.set("Type", Name.get("XObject"));
    appearanceStreamDict.set("BBox", rect);
    appearanceStreamDict.set("Resources", resources);
    appearanceStreamDict.set("Matrix", [1, 0, 0, 1, -rect[0], -rect[1]]);

    const ap = new StringStream(appearance);
    ap.dict = appearanceStreamDict;

    return ap;
  }
}

class LineAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);

    const { dict, xref } = params;
    this.data.annotationType = AnnotationType.LINE;
    this.data.hasOwnCanvas = this.data.noRotate;

    const lineCoordinates = dict.getArray("L");
    this.data.lineCoordinates = Util.normalizeRect(lineCoordinates);

    if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) {
      this.setLineEndings(dict.getArray("LE"));
      this.data.lineEndings = this.lineEndings;
    }

    if (!this.appearance) {
      // The default stroke color is black.
      const strokeColor = this.color ? getPdfColorArray(this.color) : [0, 0, 0];
      const strokeAlpha = dict.get("CA");

      const interiorColor = getRgbColor(dict.getArray("IC"), null);
      // The default fill color is transparent. Setting the fill colour is
      // necessary if/when we want to add support for non-default line endings.
      const fillColor = interiorColor ? getPdfColorArray(interiorColor) : null;
      const fillAlpha = fillColor ? strokeAlpha : null;

      const borderWidth = this.borderStyle.width || 1,
        borderAdjust = 2 * borderWidth;

      // If the /Rect-entry is empty/wrong, create a fallback rectangle so that
      // we get similar rendering/highlighting behaviour as in Adobe Reader.
      const bbox = [
        this.data.lineCoordinates[0] - borderAdjust,
        this.data.lineCoordinates[1] - borderAdjust,
        this.data.lineCoordinates[2] + borderAdjust,
        this.data.lineCoordinates[3] + borderAdjust,
      ];
      if (!Util.intersect(this.rectangle, bbox)) {
        this.rectangle = bbox;
      }

      this._setDefaultAppearance({
        xref,
        extra: `${borderWidth} w`,
        strokeColor,
        fillColor,
        strokeAlpha,
        fillAlpha,
        pointsCallback: (buffer, points) => {
          buffer.push(
            `${lineCoordinates[0]} ${lineCoordinates[1]} m`,
            `${lineCoordinates[2]} ${lineCoordinates[3]} l`,
            "S"
          );
          return [
            points[0].x - borderWidth,
            points[1].x + borderWidth,
            points[3].y - borderWidth,
            points[1].y + borderWidth,
          ];
        },
      });
    }
  }
}

class SquareAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);

    const { dict, xref } = params;
    this.data.annotationType = AnnotationType.SQUARE;
    this.data.hasOwnCanvas = this.data.noRotate;

    if (!this.appearance) {
      // The default stroke color is black.
      const strokeColor = this.color ? getPdfColorArray(this.color) : [0, 0, 0];
      const strokeAlpha = dict.get("CA");

      const interiorColor = getRgbColor(dict.getArray("IC"), null);
      // The default fill color is transparent.
      const fillColor = interiorColor ? getPdfColorArray(interiorColor) : null;
      const fillAlpha = fillColor ? strokeAlpha : null;

      if (this.borderStyle.width === 0 && !fillColor) {
        // Prevent rendering a "hairline" border (fixes issue14164.pdf).
        return;
      }

      this._setDefaultAppearance({
        xref,
        extra: `${this.borderStyle.width} w`,
        strokeColor,
        fillColor,
        strokeAlpha,
        fillAlpha,
        pointsCallback: (buffer, points) => {
          const x = points[2].x + this.borderStyle.width / 2;
          const y = points[2].y + this.borderStyle.width / 2;
          const width = points[3].x - points[2].x - this.borderStyle.width;
          const height = points[1].y - points[3].y - this.borderStyle.width;
          buffer.push(`${x} ${y} ${width} ${height} re`);
          if (fillColor) {
            buffer.push("B");
          } else {
            buffer.push("S");
          }
          return [points[0].x, points[1].x, points[3].y, points[1].y];
        },
      });
    }
  }
}

class CircleAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);

    const { dict, xref } = params;
    this.data.annotationType = AnnotationType.CIRCLE;

    if (!this.appearance) {
      // The default stroke color is black.
      const strokeColor = this.color ? getPdfColorArray(this.color) : [0, 0, 0];
      const strokeAlpha = dict.get("CA");

      const interiorColor = getRgbColor(dict.getArray("IC"), null);
      // The default fill color is transparent.
      const fillColor = interiorColor ? getPdfColorArray(interiorColor) : null;
      const fillAlpha = fillColor ? strokeAlpha : null;

      if (this.borderStyle.width === 0 && !fillColor) {
        // Prevent rendering a "hairline" border (fixes issue14164.pdf).
        return;
      }

      // Circles are approximated by Bézier curves with four segments since
      // there is no circle primitive in the PDF specification. For the control
      // points distance, see https://stackoverflow.com/a/27863181.
      const controlPointsDistance = (4 / 3) * Math.tan(Math.PI / (2 * 4));

      this._setDefaultAppearance({
        xref,
        extra: `${this.borderStyle.width} w`,
        strokeColor,
        fillColor,
        strokeAlpha,
        fillAlpha,
        pointsCallback: (buffer, points) => {
          const x0 = points[0].x + this.borderStyle.width / 2;
          const y0 = points[0].y - this.borderStyle.width / 2;
          const x1 = points[3].x - this.borderStyle.width / 2;
          const y1 = points[3].y + this.borderStyle.width / 2;
          const xMid = x0 + (x1 - x0) / 2;
          const yMid = y0 + (y1 - y0) / 2;
          const xOffset = ((x1 - x0) / 2) * controlPointsDistance;
          const yOffset = ((y1 - y0) / 2) * controlPointsDistance;

          buffer.push(
            `${xMid} ${y1} m`,
            `${xMid + xOffset} ${y1} ${x1} ${yMid + yOffset} ${x1} ${yMid} c`,
            `${x1} ${yMid - yOffset} ${xMid + xOffset} ${y0} ${xMid} ${y0} c`,
            `${xMid - xOffset} ${y0} ${x0} ${yMid - yOffset} ${x0} ${yMid} c`,
            `${x0} ${yMid + yOffset} ${xMid - xOffset} ${y1} ${xMid} ${y1} c`,
            "h"
          );
          if (fillColor) {
            buffer.push("B");
          } else {
            buffer.push("S");
          }
          return [points[0].x, points[1].x, points[3].y, points[1].y];
        },
      });
    }
  }
}

class PolylineAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);

    const { dict, xref } = params;
    this.data.annotationType = AnnotationType.POLYLINE;
    this.data.hasOwnCanvas = this.data.noRotate;
    this.data.vertices = [];

    if (
      (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) &&
      !(this instanceof PolygonAnnotation)
    ) {
      // Only meaningful for polyline annotations.
      this.setLineEndings(dict.getArray("LE"));
      this.data.lineEndings = this.lineEndings;
    }

    // The vertices array is an array of numbers representing the alternating
    // horizontal and vertical coordinates, respectively, of each vertex.
    // Convert this to an array of objects with x and y coordinates.
    const rawVertices = dict.getArray("Vertices");
    if (!Array.isArray(rawVertices)) {
      return;
    }
    for (let i = 0, ii = rawVertices.length; i < ii; i += 2) {
      this.data.vertices.push({
        x: rawVertices[i],
        y: rawVertices[i + 1],
      });
    }

    if (!this.appearance) {
      // The default stroke color is black.
      const strokeColor = this.color ? getPdfColorArray(this.color) : [0, 0, 0];
      const strokeAlpha = dict.get("CA");

      const borderWidth = this.borderStyle.width || 1,
        borderAdjust = 2 * borderWidth;

      // If the /Rect-entry is empty/wrong, create a fallback rectangle so that
      // we get similar rendering/highlighting behaviour as in Adobe Reader.
      const bbox = [Infinity, Infinity, -Infinity, -Infinity];
      for (const vertex of this.data.vertices) {
        bbox[0] = Math.min(bbox[0], vertex.x - borderAdjust);
        bbox[1] = Math.min(bbox[1], vertex.y - borderAdjust);
        bbox[2] = Math.max(bbox[2], vertex.x + borderAdjust);
        bbox[3] = Math.max(bbox[3], vertex.y + borderAdjust);
      }
      if (!Util.intersect(this.rectangle, bbox)) {
        this.rectangle = bbox;
      }

      this._setDefaultAppearance({
        xref,
        extra: `${borderWidth} w`,
        strokeColor,
        strokeAlpha,
        pointsCallback: (buffer, points) => {
          const vertices = this.data.vertices;
          for (let i = 0, ii = vertices.length; i < ii; i++) {
            buffer.push(
              `${vertices[i].x} ${vertices[i].y} ${i === 0 ? "m" : "l"}`
            );
          }
          buffer.push("S");
          return [points[0].x, points[1].x, points[3].y, points[1].y];
        },
      });
    }
  }
}

class PolygonAnnotation extends PolylineAnnotation {
  constructor(params) {
    // Polygons are specific forms of polylines, so reuse their logic.
    super(params);

    this.data.annotationType = AnnotationType.POLYGON;
  }
}

class CaretAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);

    this.data.annotationType = AnnotationType.CARET;
  }
}

class InkAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);

    this.data.hasOwnCanvas = this.data.noRotate;

    const { dict, xref } = params;
    this.data.annotationType = AnnotationType.INK;
    this.data.inkLists = [];

    const rawInkLists = dict.getArray("InkList");
    if (!Array.isArray(rawInkLists)) {
      return;
    }
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

    if (!this.appearance) {
      // The default stroke color is black.
      const strokeColor = this.color ? getPdfColorArray(this.color) : [0, 0, 0];
      const strokeAlpha = dict.get("CA");

      const borderWidth = this.borderStyle.width || 1,
        borderAdjust = 2 * borderWidth;

      // If the /Rect-entry is empty/wrong, create a fallback rectangle so that
      // we get similar rendering/highlighting behaviour as in Adobe Reader.
      const bbox = [Infinity, Infinity, -Infinity, -Infinity];
      for (const inkLists of this.data.inkLists) {
        for (const vertex of inkLists) {
          bbox[0] = Math.min(bbox[0], vertex.x - borderAdjust);
          bbox[1] = Math.min(bbox[1], vertex.y - borderAdjust);
          bbox[2] = Math.max(bbox[2], vertex.x + borderAdjust);
          bbox[3] = Math.max(bbox[3], vertex.y + borderAdjust);
        }
      }
      if (!Util.intersect(this.rectangle, bbox)) {
        this.rectangle = bbox;
      }

      this._setDefaultAppearance({
        xref,
        extra: `${borderWidth} w`,
        strokeColor,
        strokeAlpha,
        pointsCallback: (buffer, points) => {
          // According to the specification, see "12.5.6.13 Ink Annotations":
          //   When drawn, the points shall be connected by straight lines or
          //   curves in an implementation-dependent way.
          // In order to simplify things, we utilize straight lines for now.
          for (const inkList of this.data.inkLists) {
            for (let i = 0, ii = inkList.length; i < ii; i++) {
              buffer.push(
                `${inkList[i].x} ${inkList[i].y} ${i === 0 ? "m" : "l"}`
              );
            }
            buffer.push("S");
          }
          return [points[0].x, points[1].x, points[3].y, points[1].y];
        },
      });
    }
  }

  static createNewDict(annotation, xref, { apRef, ap }) {
    const { color, opacity, paths, rect, rotation, thickness } = annotation;
    const ink = new Dict(xref);
    ink.set("Type", Name.get("Annot"));
    ink.set("Subtype", Name.get("Ink"));
    ink.set("CreationDate", `D:${getModificationDate()}`);
    ink.set("Rect", rect);
    ink.set(
      "InkList",
      paths.map(p => p.points)
    );
    ink.set("F", 4);
    ink.set("Rotate", rotation);

    // Line thickness.
    const bs = new Dict(xref);
    ink.set("BS", bs);
    bs.set("W", thickness);

    // Color.
    ink.set(
      "C",
      Array.from(color, c => c / 255)
    );

    // Opacity.
    ink.set("CA", opacity);

    const n = new Dict(xref);
    ink.set("AP", n);

    if (apRef) {
      n.set("N", apRef);
    } else {
      n.set("N", ap);
    }

    return ink;
  }

  static async createNewAppearanceStream(annotation, xref, params) {
    const { color, rect, paths, thickness, opacity } = annotation;

    const appearanceBuffer = [
      `${thickness} w 1 J 1 j`,
      `${getPdfColor(color, /* isFill */ false)}`,
    ];

    if (opacity !== 1) {
      appearanceBuffer.push("/R0 gs");
    }

    const buffer = [];
    for (const { bezier } of paths) {
      buffer.length = 0;
      buffer.push(
        `${numberToString(bezier[0])} ${numberToString(bezier[1])} m`
      );
      for (let i = 2, ii = bezier.length; i < ii; i += 6) {
        const curve = bezier
          .slice(i, i + 6)
          .map(numberToString)
          .join(" ");
        buffer.push(`${curve} c`);
      }
      buffer.push("S");
      appearanceBuffer.push(buffer.join("\n"));
    }
    const appearance = appearanceBuffer.join("\n");

    const appearanceStreamDict = new Dict(xref);
    appearanceStreamDict.set("FormType", 1);
    appearanceStreamDict.set("Subtype", Name.get("Form"));
    appearanceStreamDict.set("Type", Name.get("XObject"));
    appearanceStreamDict.set("BBox", rect);
    appearanceStreamDict.set("Length", appearance.length);

    if (opacity !== 1) {
      const resources = new Dict(xref);
      const extGState = new Dict(xref);
      const r0 = new Dict(xref);
      r0.set("CA", opacity);
      r0.set("Type", Name.get("ExtGState"));
      extGState.set("R0", r0);
      resources.set("ExtGState", extGState);
      appearanceStreamDict.set("Resources", resources);
    }

    const ap = new StringStream(appearance);
    ap.dict = appearanceStreamDict;

    return ap;
  }
}

class HighlightAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);

    const { dict, xref } = params;
    this.data.annotationType = AnnotationType.HIGHLIGHT;

    const quadPoints = (this.data.quadPoints = getQuadPoints(dict, null));
    if (quadPoints) {
      const resources = this.appearance?.dict.get("Resources");

      if (!this.appearance || !resources?.has("ExtGState")) {
        if (this.appearance) {
          // Workaround for cases where there's no /ExtGState-entry directly
          // available, e.g. when the appearance stream contains a /XObject of
          // the /Form-type, since that causes the highlighting to completely
          // obscure the PDF content below it (fixes issue13242.pdf).
          warn("HighlightAnnotation - ignoring built-in appearance stream.");
        }
        // Default color is yellow in Acrobat Reader
        const fillColor = this.color ? getPdfColorArray(this.color) : [1, 1, 0];
        const fillAlpha = dict.get("CA");

        this._setDefaultAppearance({
          xref,
          fillColor,
          blendMode: "Multiply",
          fillAlpha,
          pointsCallback: (buffer, points) => {
            buffer.push(
              `${points[0].x} ${points[0].y} m`,
              `${points[1].x} ${points[1].y} l`,
              `${points[3].x} ${points[3].y} l`,
              `${points[2].x} ${points[2].y} l`,
              "f"
            );
            return [points[0].x, points[1].x, points[3].y, points[1].y];
          },
        });
      }
    } else {
      this.data.popupRef = null;
    }
  }
}

class UnderlineAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);

    const { dict, xref } = params;
    this.data.annotationType = AnnotationType.UNDERLINE;

    const quadPoints = (this.data.quadPoints = getQuadPoints(dict, null));
    if (quadPoints) {
      if (!this.appearance) {
        // Default color is black
        const strokeColor = this.color
          ? getPdfColorArray(this.color)
          : [0, 0, 0];
        const strokeAlpha = dict.get("CA");

        // The values 0.571 and 1.3 below corresponds to what Acrobat is doing.
        this._setDefaultAppearance({
          xref,
          extra: "[] 0 d 0.571 w",
          strokeColor,
          strokeAlpha,
          pointsCallback: (buffer, points) => {
            buffer.push(
              `${points[2].x} ${points[2].y + 1.3} m`,
              `${points[3].x} ${points[3].y + 1.3} l`,
              "S"
            );
            return [points[0].x, points[1].x, points[3].y, points[1].y];
          },
        });
      }
    } else {
      this.data.popupRef = null;
    }
  }
}

class SquigglyAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);

    const { dict, xref } = params;
    this.data.annotationType = AnnotationType.SQUIGGLY;

    const quadPoints = (this.data.quadPoints = getQuadPoints(dict, null));
    if (quadPoints) {
      if (!this.appearance) {
        // Default color is black
        const strokeColor = this.color
          ? getPdfColorArray(this.color)
          : [0, 0, 0];
        const strokeAlpha = dict.get("CA");

        this._setDefaultAppearance({
          xref,
          extra: "[] 0 d 1 w",
          strokeColor,
          strokeAlpha,
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
    } else {
      this.data.popupRef = null;
    }
  }
}

class StrikeOutAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);

    const { dict, xref } = params;
    this.data.annotationType = AnnotationType.STRIKEOUT;

    const quadPoints = (this.data.quadPoints = getQuadPoints(dict, null));
    if (quadPoints) {
      if (!this.appearance) {
        // Default color is black
        const strokeColor = this.color
          ? getPdfColorArray(this.color)
          : [0, 0, 0];
        const strokeAlpha = dict.get("CA");

        this._setDefaultAppearance({
          xref,
          extra: "[] 0 d 1 w",
          strokeColor,
          strokeAlpha,
          pointsCallback: (buffer, points) => {
            buffer.push(
              `${(points[0].x + points[2].x) / 2} ` +
                `${(points[0].y + points[2].y) / 2} m`,
              `${(points[1].x + points[3].x) / 2} ` +
                `${(points[1].y + points[3].y) / 2} l`,
              "S"
            );
            return [points[0].x, points[1].x, points[3].y, points[1].y];
          },
        });
      }
    } else {
      this.data.popupRef = null;
    }
  }
}

class StampAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);

    this.data.annotationType = AnnotationType.STAMP;
    this.data.hasOwnCanvas = this.data.noRotate;
  }

  static async createImage(bitmap, xref) {
    // TODO: when printing, we could have a specific internal colorspace
    // (e.g. something like DeviceRGBA) in order avoid any conversion (i.e. no
    // jpeg, no rgba to rgb conversion, etc...)

    const { width, height } = bitmap;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", { alpha: true });

    // Draw the image and get the data in order to extract the transparency.
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, width, height).data;
    const buf32 = new Uint32Array(data.buffer);
    const hasAlpha = buf32.some(
      FeatureTest.isLittleEndian
        ? x => x >>> 24 !== 0xff
        : x => (x & 0xff) !== 0xff
    );

    if (hasAlpha) {
      // Redraw the image on a white background in order to remove the thin gray
      // line which can appear when exporting to jpeg.
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0);
    }

    const jpegBufferPromise = canvas
      .convertToBlob({ type: "image/jpeg", quality: 1 })
      .then(blob => {
        return blob.arrayBuffer();
      });

    const xobjectName = Name.get("XObject");
    const imageName = Name.get("Image");
    const image = new Dict(xref);
    image.set("Type", xobjectName);
    image.set("Subtype", imageName);
    image.set("BitsPerComponent", 8);
    image.set("ColorSpace", Name.get("DeviceRGB"));
    image.set("Filter", Name.get("DCTDecode"));
    image.set("BBox", [0, 0, width, height]);
    image.set("Width", width);
    image.set("Height", height);

    let smaskStream = null;
    if (hasAlpha) {
      const alphaBuffer = new Uint8Array(buf32.length);
      if (FeatureTest.isLittleEndian) {
        for (let i = 0, ii = buf32.length; i < ii; i++) {
          alphaBuffer[i] = buf32[i] >>> 24;
        }
      } else {
        for (let i = 0, ii = buf32.length; i < ii; i++) {
          alphaBuffer[i] = buf32[i] & 0xff;
        }
      }

      const smask = new Dict(xref);
      smask.set("Type", xobjectName);
      smask.set("Subtype", imageName);
      smask.set("BitsPerComponent", 8);
      smask.set("ColorSpace", Name.get("DeviceGray"));
      smask.set("Width", width);
      smask.set("Height", height);

      smaskStream = new Stream(alphaBuffer, 0, 0, smask);
    }
    const imageStream = new Stream(await jpegBufferPromise, 0, 0, image);

    return {
      imageStream,
      smaskStream,
      width,
      height,
    };
  }

  static createNewDict(annotation, xref, { apRef, ap }) {
    const { rect, rotation, user } = annotation;
    const stamp = new Dict(xref);
    stamp.set("Type", Name.get("Annot"));
    stamp.set("Subtype", Name.get("Stamp"));
    stamp.set("CreationDate", `D:${getModificationDate()}`);
    stamp.set("Rect", rect);
    stamp.set("F", 4);
    stamp.set("Border", [0, 0, 0]);
    stamp.set("Rotate", rotation);

    if (user) {
      stamp.set(
        "T",
        isAscii(user) ? user : stringToUTF16String(user, /* bigEndian = */ true)
      );
    }

    if (apRef || ap) {
      const n = new Dict(xref);
      stamp.set("AP", n);

      if (apRef) {
        n.set("N", apRef);
      } else {
        n.set("N", ap);
      }
    }

    return stamp;
  }

  static async createNewAppearanceStream(annotation, xref, params) {
    const { rotation } = annotation;
    const { imageRef, width, height } = params.image;
    const resources = new Dict(xref);
    const xobject = new Dict(xref);
    resources.set("XObject", xobject);
    xobject.set("Im0", imageRef);
    const appearance = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;

    const appearanceStreamDict = new Dict(xref);
    appearanceStreamDict.set("FormType", 1);
    appearanceStreamDict.set("Subtype", Name.get("Form"));
    appearanceStreamDict.set("Type", Name.get("XObject"));
    appearanceStreamDict.set("BBox", [0, 0, width, height]);
    appearanceStreamDict.set("Resources", resources);

    if (rotation) {
      const matrix = getRotationMatrix(rotation, width, height);
      appearanceStreamDict.set("Matrix", matrix);
    }

    const ap = new StringStream(appearance);
    ap.dict = appearanceStreamDict;

    return ap;
  }
}

class FileAttachmentAnnotation extends MarkupAnnotation {
  constructor(params) {
    super(params);

    const { dict, xref } = params;
    const file = new FileSpec(dict.get("FS"), xref);

    this.data.annotationType = AnnotationType.FILEATTACHMENT;
    this.data.hasOwnCanvas = this.data.noRotate;
    this.data.file = file.serializable;

    const name = dict.get("Name");
    this.data.name =
      name instanceof Name ? stringToPDFString(name.name) : "PushPin";

    const fillAlpha = dict.get("ca");
    this.data.fillAlpha =
      typeof fillAlpha === "number" && fillAlpha >= 0 && fillAlpha <= 1
        ? fillAlpha
        : null;
  }
}

export {
  Annotation,
  AnnotationBorderStyle,
  AnnotationFactory,
  getQuadPoints,
  MarkupAnnotation,
  PopupAnnotation,
};
