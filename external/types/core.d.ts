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

// TypeScript type definitions for PDFJS

// The _pdfjs namespace is a convenient place for making type
// declarations. The actual exports are at the end of the file,
// and pick symbols from this namespace to export in a shape that
// resembles the API for PDFJS.
declare namespace _pdfjs {
  //
  // Convenience types
  //

  /**
   * 6 element transform matrix: [a, b, c, d, e, f]
   * The transformation between two coordinate systems can be
   * represented by a 3x3 transformation matrix written as follows:
   *
   *   | a b 0 |
   *   | c d 0 |
   *   | e f 1 |
   *
   * The transformation matrix has only six elements that can be changed,
   * so it is usually represented by a six element array [a, b, c, d, e, f].
   *
   * Coordinate transformations are expressed as matrix multiplications:
   *
   *                             | a b 0 |
   *   [x', y', 1] = [x, y, 1] x | c d 0 |
   *                             | e f 1 |
   */
  type Transform = number[];

  /**
   * A generic 3d matrix transform M on a 3-vector [X, Y, Z]:
   *
   *   | a b c |   | X |
   *   | d e f | x | Y |
   *   | g h i |   | Z |
   *
   * M is assumed to be serialized as a 9 element array [a,b,c,d,e,f,g,h,i],
   */
  type Transform3d = number[];

  // 2 dimensional point [x, y]
  type Point = [number, number];

  // 2 dimensional point object
  interface Vertex {
    x: number;
    y: number;
  }

  // 3 dimensional point [x, y, z]
  type Point3d = [number, number, number];

  // Rectangle with 4 elements: [x1, y1, x2, y2]
  type Rect = [number, number, number, number];

  type PageIndex = number;
  type PageLabels = string;

  //
  // src/core/obj.js
  //
  interface FileSpec {
    filename: string;
    content: Uint8Array;
  }

  interface Attachments {
    [file: string]: FileSpec;
  }

  type DestinationTarget = any[];

  type Destination = {
    [destination: string]: any[];
  };

  //
  // src/core/primitives.js
  //
  interface Ref {
    num: number;
    gen: number;
  }

  // Interning names
  interface Name {
    name: string;
  }

  interface StringMap {
    [key: string]: string;
  }

  //
  // src/core/annotation.js
  //
  interface Annotation {
    annotationFlags: AnnotationFlag;
    annotationType: AnnotationType;
    borderStyle: AnnotationBorderStyle;
    color: Color | null;
    hasAppearance: boolean;
    id: string;
    rect: Rect;
    subtype: AnnotationSubtype | null;

    // For popup annotations
    hasPopup?: boolean;
    title?: string;
    contents?: string;
  }

  /**
   * Contains all data regarding an annotation's border style.
   */
  class AnnotationBorderStyle {
    width: number;
    style: AnnotationBorderStyleType;
    dashArray: number[];
    horizontalCornerRadius: number;
    verticalCornerRadius: number;
  }

  interface WidgetAnnotation extends Annotation {
    annotationType: AnnotationType.WIDGET;
    fieldName: string;
    fieldType: string;
    fieldValue: string | string[] | null;
    alternativeText: string;
    defaultAppearance: string;
    fieldFlags: number;
    readOnly: boolean;
  }
  interface TextWidgetAnnotation extends WidgetAnnotation {
    fieldValue: string;
    textAlignment: number | null;
    maxLen: number | null;
    multiLine: boolean;
    comb: boolean;
  }
  interface ButtonWidgetAnnotation extends WidgetAnnotation {
    checkBox: boolean;
    radioButton: boolean;
    pushButton: boolean;
    fieldValue: string | null;
    buttonValue?: string | null;
  }
  interface ChoiceWidgetAnnotation extends WidgetAnnotation {
    options: ChoiceOption[];
    fieldValue: string[];
    combo: boolean;
    multiSelect: boolean;
  }
  interface ChoiceOption {
      exportValue: string;
      displayValue: string;
  }
  interface TextAnnotation extends Annotation {
    annotationType: AnnotationType.TEXT;
    name: string;
  }
  interface LinkAnnotation extends Annotation {
    annotationType: AnnotationType.LINK;
  }
  interface PopupAnnotation extends Annotation {
    annotationType: AnnotationType.POPUP;
    parentType: string | null;
    parentId: string;
    title: string;
    contents: string;
    color: Color | null;
  }
  interface LineAnnotation extends Annotation {
    annotationType: AnnotationType.LINE;
    lineCoordinates: Rect;
  }
  interface SquareAnnotation extends Annotation {
    annotationType: AnnotationType.SQUARE;
  }
  interface CircleAnnotation extends Annotation {
    annotationType: AnnotationType.CIRCLE;
  }
  interface PolylineAnnotation extends Annotation {
    annotationType: AnnotationType.POLYLINE;
    vertices: Vertex[];
  }
  interface PolygonAnnotation extends Annotation {
    annotationType: AnnotationType.POLYGON;
    vertices: Vertex[];
  }
  interface HighlightAnnotation extends Annotation {
    annotationType: AnnotationType.HIGHLIGHT;
  }
  interface UnderlineAnnotation extends Annotation {
    annotationType: AnnotationType.UNDERLINE;
  }
  interface SquigglyAnnotation extends Annotation {
    annotationType: AnnotationType.SQUIGGLY;
  }
  interface StrikeOutAnnotation extends Annotation {
    annotationType: AnnotationType.STRIKEOUT;
  }
  interface StampAnnotation extends Annotation {
    annotationType: AnnotationType.STAMP;
  }
  interface FileAttachmentAnnotation extends Annotation {
    annotationType: AnnotationType.FILEATTACHMENT;
    file: FileSpec;
  }
}
