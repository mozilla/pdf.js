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
interface HTMLAnchorElement {}
interface ReadableStream {}

declare namespace _pdfjs {
  //
  // src/shared/util.js
  //

  enum VerbosityLevel {}
  namespace VerbosityLevel {
    const ERRORS: VerbosityLevel;
    const WARNINGS: VerbosityLevel;
    const INFOS: VerbosityLevel;
  }

  let shadow: typeof Object.defineProperty;
  function createBlob(data: any, contentType: string): Blob;
  function createObjectURL(
    data: any,
    contentType: string,
    forceDataSchema?: boolean
  ): string;
  let isLittleEndian: boolean;
  function removeNullCharacters(str: string): string;

  class PasswordException extends Error {
    constructor(msg: string, code: PasswordResponses);
    code: PasswordResponses;
  }

  class UnknownErrorException extends Error {
    constructor(msg: string, details: string);
    details: string;
  }

  class UnexpectedResponseException extends Error {
    constructor(msg: string, status: number);
    status: number;
  }

  class InvalidPDFException extends Error {
    constructor(msg: string);
  }

  class MissingPDFException extends Error {
    constructor(msg: string);
  }

  interface CloneArgs {
    scale: number;
    rotation: number;
  }

  class PageViewport {
    viewBox: Rect;
    scale: number;
    rotation: number;
    offsetX: number;
    offsetY: number;

    // creating transform for the following operations:
    // translate(-centerX, -centerY), rotate and flip vertically,
    // scale, and translate(offsetCanvasX, offsetCanvasY)
    transform: Transform;

    width: number;
    height: number;
    fontScale: number;

    /**
     * Clones viewport with additional properties.
     * @param args {Object} (optional) If specified, may contain the 'scale' or
     * 'rotation' properties to override the corresponding properties in
     * the cloned viewport.
     * @returns {PageViewport} Cloned viewport.
     */
    clone(args?: CloneArgs): PageViewport;

    /**
     * Converts PDF point to the viewport coordinates. For examples, useful for
     * converting PDF location into canvas pixel coordinates.
     * @param x {number} X coordinate.
     * @param y {number} Y coordinate.
     * @returns {Object} Object that contains 'x' and 'y' properties of the
     * point in the viewport coordinate space.
     * @see {@link convertToPdfPoint}
     * @see {@link convertToViewportRectangle}
     */
    convertToViewportPoint(x: number, y: number): Point;

    /**
     * Converts PDF rectangle to the viewport coordinates.
     * @param rect {Array} xMin, yMin, xMax and yMax coordinates.
     * @returns {Array} Contains corresponding coordinates of the rectangle
     * in the viewport coordinate space.
     * @see {@link convertToViewportPoint}
     */
    convertToViewportRectangle(rect: Rect): Rect;

    /**
     * Converts viewport coordinates to the PDF location. For examples, useful
     * for converting canvas pixel location into PDF one.
     * @param x {number} X coordinate.
     * @param y {number} Y coordinate.
     * @returns {Object} Object that contains 'x' and 'y' properties of the
     * point in the PDF coordinate space.
     * @see {@link convertToViewportPoint}
     */
    convertToPdfPoint(x: number, y: number): Point;
  }

  /**
   * Promise Capability object.
   *
   * @typedef {Object} PromiseCapability
   * @property {Promise} promise - A promise object.
   * @property {function} resolve - Fulfills the promise.
   * @property {function} reject - Rejects the promise.
   */
  interface PromiseCapability<T> {
    promise: Promise<T>;
    resolve: (val: T) => void;
    reject: (reason?: any) => void;
  }

  /**
   * Creates a promise capability object.
   * @alias createPromiseCapability
   *
   * @return {PromiseCapability} A capability object contains:
   * - a Promise, resolve and reject methods.
   */
  function createPromiseCapability<T>(): PromiseCapability<T>;

  let Util: {
    makeCssRgb(r: number, g: number, b: number): string;

    // Concatenates two transformation matrices together and returns the result.
    transform(m1: Transform, m2: Transform): Transform;

    // For 2d affine transforms
    applyTransform(p: Point, m: Transform): Point;
    applyInverseTransform(p: Point, m: Transform): Point;

    // Applies the transform to the rectangle and finds the minimum axially
    // aligned bounding box.
    getAxialAlignedBoundingBox(r: Rect, m: Transform): Rect;
    inverseTransform(m: Transform): Transform;

    // Apply a generic 3d matrix M on a 3-vector v:
    //   | a b c |   | X |
    //   | d e f | x | Y |
    //   | g h i |   | Z |
    // M is assumed to be serialized as [a,b,c,d,e,f,g,h,i],
    // with v as [X,Y,Z]
    apply3dTransform(m: Transform3d, p: Point3d): Point3d;

    // This calculation uses Singular Value Decomposition.
    // The SVD can be represented with formula A = USV. We are interested in the
    // matrix S here because it represents the scale values.
    // Returns [scale X, scale Y]
    singularValueDecompose2dScale(m: Transform): number[];

    // Normalize rectangle rect=[x1, y1, x2, y2] so that (x1,y1) < (x2,y2)
    // For coordinate systems whose origin lies in the bottom-left, this
    // means normalization to (BL,TR) ordering. For systems with origin in the
    // top-left, this means (TL,BR) ordering.
    normalizeRect(rect: Rect): Rect;

    // Returns a rectangle [x1, y1, x2, y2] corresponding to the
    // intersection of rect1 and rect2. If no intersection, returns 'false'
    // The rectangle coordinates of rect1, rect2 should be [x1, y1, x2, y2]
    intersect(rect1: Rect, rect2: Rect): Rect | false;

    /**
     * Converts positive integers to (upper case) Roman numerals.
     * @param {integer} number - The number that should be converted.
     * @param {boolean} lowerCase - Indicates if the result should be converted
     *   to lower case letters. The default is false.
     * @return {string} The resulting Roman number.
     */
    toRoman(number: number, lowerCase: boolean): string;

    // Destructively append second array to first aray
    appendToArray(arr1: any[], arr2: any[]): void;

    // Destructively prepent second array to first array
    prependToArray(arr1: any[], arr2: any[]): void;

    // Add (key,value) pairs from obj2 to obj1 (overwriting intersecting keys)
    extendObj(obj1: object, obj2: object): void;

    loadScript(src: string, callback: undefined | (() => void)): void;
  };

  class MessageHandler {
    constructor(sourceName: string, targetName: string, comObj: MessagePort);
    sourceName: string;
    targetName: string;
    comObj: MessagePort;
    callbackId: number;
    streamId: number;
    postMessageTransfers: boolean;

    // TODO: Some fields missing, that appear to be maps. Unclear if they should be exposed.

    on(actionName: string, handler: any, scope: any): void;

    /**
     * Sends a message to the comObj to invoke the action with the supplied data.
     * @param {String} actionName - Action to call.
     * @param {JSON} data - JSON data to send.
     * @param {Array} [transfers] - Optional list of transfers/ArrayBuffers
     */
    send(actionName: string, data: JSON, transfers: any): void;

    /**
     * Sends a message to the comObj to invoke the action with the supplied data.
     * Expects that the other side will callback with the response.
     * @param {String} actionName - Action to call.
     * @param {JSON} data - JSON data to send.
     * @param {Array} [transfers] - Optional list of transfers/ArrayBuffers.
     * @returns {Promise} Promise to be resolved with response data.
     */
    sendWithPromise(
      actionName: string,
      data: JSON,
      transfers: any
    ): Promise<any>;

    /**
     * Sends a message to the comObj to invoke the action with the supplied data.
     * Expect that the other side will callback to signal 'start_complete'.
     * @param {String} actionName - Action to call.
     * @param {JSON} data - JSON data to send.
     * @param {Object} queueingStrategy - strategy to signal backpressure based on
     *                 internal queue.
     * @param {Array} [transfers] - Optional list of transfers/ArrayBuffers.
     * @return {ReadableStream} ReadableStream to read data in chunks.
     */
    sendWithStream(
      actionName: string,
      data: JSON,
      queueingStrategy: object,
      transfers: any
    ): ReadableStream;

    /**
     * Sends raw message to the comObj.
     * @private
     * @param {Object} message - Raw message.
     * @param transfers List of transfers/ArrayBuffers, or undefined.
     */
    postMessage(message: object, transfers: any): void;

    destroy(): void;
  }

  enum StreamType {
    UNKNOWN,
    FLATE,
    LZW,
    DCT,
    JPX,
    JBIG,
    A85,
    AHX,
    CCF,
    RL
  }

  enum FontType {
    UNKNOWN,
    TYPE1,
    TYPE1C,
    CIDFONTTYPE0,
    CIDFONTTYPE0C,
    TRUETYPE,
    CIDFONTTYPE2,
    TYPE3,
    OPENTYPE,
    TYPE0,
    MMTYPE1
  }

  type FontTypeName =
    | 'Type1'
    | 'CIDFontType0'
    | 'OpenType'
    | 'TrueType'
    | 'CIDFontType2'
    | 'MMType1'
    | 'Type0';

  type FontSubTypeName = 'Type1C' | 'CIDFontType0C';

  interface StatTimer {
    // times are recorded as the number of milliseconds
    // elapsed since January 1, 1970 00:00:00 UTC
    times: { name: string; start: number; end: number }[];
    started: { [name: string]: number };
    enabled: boolean;
  }

  // Values are required for this enum to allow for type-specific ADT subclass
  // discrimintation. See the Annotation interface and its sub-interfaces.
  enum AnnotationType {
    TEXT = 1,
    LINK = 2,
    FREETEXT = 3,
    LINE = 4,
    SQUARE = 5,
    CIRCLE = 6,
    POLYGON = 7,
    POLYLINE = 8,
    HIGHLIGHT = 9,
    UNDERLINE = 10,
    SQUIGGLY = 11,
    STRIKEOUT = 12,
    STAMP = 13,
    CARET = 14,
    INK = 15,
    POPUP = 16,
    FILEATTACHMENT = 17,
    SOUND = 18,
    MOVIE = 19,
    WIDGET = 20,
    SCREEN = 21,
    PRINTERMARK = 22,
    TRAPNET = 23,
    WATERMARK = 24,
    THREED = 25,
    REDACT = 26
  }

  enum AnnotationFlag {
    INVISIBLE,
    HIDDEN,
    PRINT,
    NOZOOM,
    NOROTATE,
    NOVIEW,
    READONLY,
    LOCKED,
    TOGGLENOVIEW,
    LOCKEDCONTENTS
  }

  type AnnotationSubtype =
    | 'Link'
    | 'Text'
    | 'Widget'
    | 'Popup'
    | 'Line'
    | 'Square'
    | 'Circle'
    | 'PolyLine'
    | 'Polygon'
    | 'Highlight'
    | 'Underline'
    | 'Squiggly'
    | 'StrikeOut'
    | 'Stamp'
    | 'FileAttachment';

  enum AnnotationBorderStyleType {
    SOLID,
    DASHED,
    BEVELED,
    INSET,
    UNDERLINE
  }

  interface Image {
    objId: string;
    left: number;
    top: number;
    width: number;
    height: number;
  }

  interface ImageLayer {
    beginLayout(): void;
    appendImage(image: Image): void;
    endLayout(): void;
  }

  /**
   * Attempts to create a valid absolute URL (utilizing `isValidProtocol`).
   * @param {URL|string} url - An absolute, or relative, URL.
   * @param {URL|string} baseUrl - An absolute URL.
   * @returns Either a valid {URL}, or `null` otherwise.
   */
  function createValidAbsoluteUrl(
    url: URL | string,
    baseUrl: URL | string
  ): URL | null;

  enum NativeImageDecoding {
    NONE,
    DECODE,
    DISPLAY
  }

  enum CMapCompressionType {
    NONE,
    BINARY,
    STREAM
  }

  enum PDFImageKind {
    GRAYSCALE_1BPP,
    RGB_24BPP,
    RGBA_32BPP
  }

  enum PasswordResponses {
    NEED_PASSWORD,
    INCORRECT_PASSWORD
  }

  enum UNSUPPORTED_FEATURES {
    unknown,
    forms,
    javaScript,
    smask,
    shadingPattern,
    font
  }

  enum OPS {
    dependency,
    setLineWidth,
    setLineCap,
    setLineJoin,
    setMiterLimit,
    setDash,
    setRenderingIntent,
    setFlatness,
    setGState,
    save,
    restore,
    transform,
    moveTo,
    lineTo,
    curveTo,
    curveTo2,
    curveTo3,
    closePath,
    rectangle,
    stroke,
    closeStroke,
    fill,
    eoFill,
    fillStroke,
    eoFillStroke,
    closeFillStroke,
    closeEOFillStroke,
    endPath,
    clip,
    eoClip,
    beginText,
    endText,
    setCharSpacing,
    setWordSpacing,
    setHScale,
    setLeading,
    setFont,
    setTextRenderingMode,
    setTextRise,
    moveText,
    setLeadingMoveText,
    setTextMatrix,
    nextLine,
    showText,
    showSpacedText,
    nextLineShowText,
    nextLineSetSpacingShowText,
    setCharWidth,
    setCharWidthAndBounds,
    setStrokeColorSpace,
    setFillColorSpace,
    setStrokeColor,
    setStrokeColorN,
    setFillColor,
    setFillColorN,
    setStrokeGray,
    setFillGray,
    setStrokeRGBColor,
    setFillRGBColor,
    setStrokeCMYKColor,
    setFillCMYKColor,
    shadingFill,
    beginInlineImage,
    beginImageData,
    endInlineImage,
    paintXObject,
    markPoint,
    markPointProps,
    beginMarkedContent,
    beginMarkedContentProps,
    endMarkedContent,
    beginCompat,
    endCompat,
    paintFormXObjectBegin,
    paintFormXObjectEnd,
    beginGroup,
    endGroup,
    beginAnnotations,
    endAnnotations,
    beginAnnotation,
    endAnnotation,
    paintJpegXObject,
    paintImageMaskXObject,
    paintImageMaskXObjectGroup,
    paintImageXObject,
    paintInlineImageXObject,
    paintInlineImageXObjectGroup,
    paintImageXObjectRepeat,
    paintImageMaskXObjectRepeat,
    paintSolidColorImageMask,
    constructPath
  }
}
