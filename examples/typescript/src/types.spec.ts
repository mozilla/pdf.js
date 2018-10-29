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

import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';
import * as pdfjs from 'pdfjs-dist';
import 'jasmine';
import { access } from 'fs';
import {
  test,
  asyncAfterAll,
  asyncAfterEach,
  asyncBeforeAll,
  asyncBeforeEach,
  expectArray,
  expectNumberArray,
  expectPoint,
  expectRect,
  expectTransform,
  expectTypedArray,
  expectFieldType
} from './jasmine_helper';
import { isArray } from 'util';
import { PDFDocumentProxy, PageViewport } from 'pdfjs-dist';
import { setStubs } from '../../node/domstubs.js';
setStubs(global);

jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

// The purpose of this test is to dynamically verify some of the types the
// TypeScript type definition file external/types/index.d.ts. Therefore the
// specific values returned by API calls is less relevant, and we use `typeof`
// extensively to verify the dynamic types are what is expected from the static
// typing.

function buildPathToPdf(name: string) {
  return '../../test/pdfs/' + name;
}

async function getPageFromDocument(filename: string) {
  const params: pdfjs.DocumentInitParameters = {
    url: buildPathToPdf(filename),
    verbosity: pdfjs.VerbosityLevel.ERRORS
  };
  let doc = await pdfjs.getDocument(params);
  let page = await doc!.getPage(1);
  return { doc: doc!, page };
}

describe('PDFDocumentProxy types', () => {
  let doc: pdfjs.PDFDocumentProxy;

  asyncBeforeAll(async () => {
    ({ doc } = await getPageFromDocument('basicapi.pdf'));
  });

  test('has numPages', () => {
    expectFieldType(doc, 'numPages', 'number');
  });

  test('get page', async () => {
    let page1 = await doc.getPage(1);
    expect(page1.pageNumber).toBe(1);
  });

  test('has loading task', () => {
    expect(doc.loadingTask).toBeDefined();
  });

  test('get pdf info', () => {
    expectFieldType(doc.pdfInfo, 'fingerprint', 'string');
    expectFieldType(doc.pdfInfo, 'numPages', 'number');
  });

  test('has fingerprint', () => {
    expectFieldType(doc, 'fingerprint', 'string');
  });

  test('get destinations', async () => {
    // The point of the test is to verify these functions exist
    let destinations = await doc.getDestinations();
    expect(typeof destinations).toBe('object');

    let dest = (await doc.getDestination('chapter1'))!;
    expectArray(dest);

    expect(await doc.getDestination('nonexistent')).toBeNull();
  });

  test('get page labels', async () => {
    let labels = await doc.getPageLabels();
    expect(labels).toBeNull();
  });

  test('get page mode', async () => {
    let mode = await doc.getPageMode();
    expect(typeof mode).toBe('string');
  });

  test('get page attachments', async () => {
    let attachments = await doc.getAttachments();
    expect(attachments).toBeNull();
  });

  test('get JavaScript', async () => {
    let js = await doc.getJavaScript();
    expect(js).toBeNull();
  });

  test('get outline', async () => {
    let outline = await doc.getOutline();
    let node = outline![0];
    expectFieldType(node, 'title', 'string');
    expectFieldType(node, 'bold', 'boolean');
    expectFieldType(node, 'italic', 'boolean');
    expectTypedArray(node.color);
    expectArray(node.dest!);
    expect(node.url).toBeNull();
    expectArray(node.items);
  });

  test('metadata', async () => {
    let metadata = await doc.getMetadata();
    expectFieldType(metadata.info, 'PDFFormatVersion', 'string');
    expectFieldType(metadata.info, 'IsAcroFormPresent', 'boolean');
    expectFieldType(metadata.info, 'IsXFAPresent', 'boolean');
    expectFieldType(metadata.info, 'Title', 'string');
    expectFieldType(metadata.info, 'Author', 'string');
    expectFieldType(metadata.info, 'Subject', 'undefined');
    expectFieldType(metadata.info, 'Keywords', 'undefined');
    expectFieldType(metadata.info, 'Creator', 'string');
    expectFieldType(metadata.info, 'Producer', 'string');
    expectFieldType(metadata.info, 'CreationDate', 'string');
    expectFieldType(metadata.info, 'ModDate', 'string');

    let dict = metadata.metadata!;
    let all = dict.getAll();
    expect(typeof all['dc:title']).toBe('string');
    expect(typeof dict.get('dc:creator')).toBe('string');
    expect(typeof dict.has('nonexistent')).toBe('boolean');
  });

  test('get data', async () => {
    let data = await doc.getData();
    expectTypedArray(data);
  });

  test('get download info', async () => {
    let info = await doc.getDownloadInfo();
    expectFieldType(info, 'length', 'number');
  });

  test('get stats', async () => {
    let stats = await doc.getStats();
    expectArray(stats.fontTypes);
    expectArray(stats.streamTypes);
  });

  test('cleanup and destroy', () => {
    expect(doc.cleanup).toBeDefined();
    expect(doc.destroy).toBeDefined();
  });

  asyncAfterAll(async () => {
    doc.cleanup();
    await doc.destroy();
  });
});

describe('PDFPageProxy', () => {
  let doc: pdfjs.PDFDocumentProxy;
  let page: pdfjs.PDFPageProxy;

  asyncBeforeAll(async () => {
    ({ doc, page } = await getPageFromDocument('basicapi.pdf'));
  });

  test('pageIndex', () => {
    expectFieldType(page, 'pageIndex', 'number');
  });
  test('pageInfo', () => {
    expect(page.pageInfo).toBeDefined();
    expectFieldType(page.pageInfo, 'rotate', 'number');
    expectFieldType(page.pageInfo, 'userUnit', 'number');
    expectFieldType(page.pageInfo, 'ref', 'object');
    expectFieldType(page.pageInfo.ref, 'num', 'number');
    expectFieldType(page.pageInfo.ref, 'gen', 'number');
    expectRect(page.pageInfo.view);
  });
  test('cleanupAfterRender', () => {
    expectFieldType(page, 'cleanupAfterRender', 'boolean');
  });
  test('pendingCleanup', () => {
    expectFieldType(page, 'pendingCleanup', 'boolean');
  });
  test('destroyed', () => {
    expectFieldType(page, 'destroyed', 'boolean');
  });
  test('intentStates', () => {
    expectFieldType(page, 'intentStates', 'object');
  });
  test('pageNumber', () => {
    expectFieldType(page, 'pageNumber', 'number');
  });
  test('rotate', () => {
    expectFieldType(page, 'rotate', 'number');
  });
  test('ref', () => {
    expect(page.ref).toBeDefined();
    expectFieldType(page.ref, 'gen', 'number');
    expectFieldType(page.ref, 'num', 'number');
  });
  test('userUnit', () => {
    expectFieldType(page, 'userUnit', 'number');
  });
  test('view', () => {
    expectRect(page.view);
  });

  describe('getViewport', () => {
    let vp: PageViewport;

    beforeAll(() => {
      vp = page.getViewport(1.0);
    });

    test('PageViewport fields', () => {
      expectRect(vp.viewBox);
      expectFieldType(vp, 'scale', 'number');
      expectFieldType(vp, 'rotation', 'number');
      expectFieldType(vp, 'offsetX', 'number');
      expectFieldType(vp, 'offsetY', 'number');
      expectFieldType(vp, 'width', 'number');
      expectFieldType(vp, 'height', 'number');
      expectFieldType(vp, 'fontScale', 'number');
      expectTransform(vp.transform);
    });

    test('clone', () => {
      expect(vp.clone()).toEqual(vp);
      expect(vp.clone({ scale: 1, rotation: 0 })).toEqual(vp);
    });

    test('convertToViewportPoint', () => {
      expectPoint(vp.convertToViewportPoint(1, 1));
    });

    test('convertToViewportRectangle', () => {
      let r: pdfjs.Rect = [0, 0, 1, 1];
      expectRect(vp.convertToViewportRectangle(r));
    });

    test('convertToPdfPoint', () => {
      expectPoint(vp.convertToPdfPoint(1, 1));
    });
  });

  // Running render() would require either running in a browser or adding a
  // dependency on Node Canvas. Those tests are performed elsewhere, so we
  // just do existence checking here.
  test('render', () => {
    expectFieldType(page, 'render', 'function');
  });

  test('operator list', async () => {
    let ops = await page.getOperatorList();
    expect(typeof ops.fnArray[0]).toBe('number');
    expect(ops.argsArray.length).toBeGreaterThanOrEqual(0);
    expect(ops.argsArray[1].length).toBeGreaterThanOrEqual(0);
  });

  test('stream text content', () => {
    let stream = page.streamTextContent();
    expect(stream).toBeDefined();
    expect(typeof stream).toBe('object');
  });

  test('get text content', async () => {
    let text = await page.getTextContent();
    expect(text).toBeDefined();
    let item = text.items[0];
    expectFieldType(item, 'str', 'string');
    expectFieldType(item, 'dir', 'string');
    expectFieldType(item, 'fontName', 'string');
    expectFieldType(item, 'height', 'number');
    expectFieldType(item, 'width', 'number');
    expectTransform(item.transform);

    let styles = text.styles[item.fontName];
    expectFieldType(styles, 'ascent', 'number');
    expectFieldType(styles, 'descent', 'number');
    expectFieldType(styles, 'fontFamily', 'string');
  });

  asyncAfterAll(async () => {
    if (doc) {
      await doc.destroy();
    }
  });
});

describe('PDFPageProxy annotation types', () => {
  async function getAnnotationsFrom(filename: string) {
    let { doc, page } = await getPageFromDocument(filename);
    let annotations = await page.getAnnotations();
    return { doc, annotations };
  }

  test('exist', async () => {
    let { doc, annotations } = await getAnnotationsFrom('annotation-line.pdf');
    expect(annotations).toBeDefined();
    doc.destroy();
  });

  function checkBaseAnnotation(annot: pdfjs.Annotation) {
    expectFieldType(annot, 'annotationType', 'number');
    expectFieldType(annot, 'annotationFlags', 'number');
    expectFieldType(annot, 'hasAppearance', 'boolean');
    expectFieldType(annot, 'id', 'string');
    expectTypedArray(annot.color!);
    expectFieldType(annot, 'subtype', 'string');
    expectRect(annot.rect);
    expectFieldType(annot.borderStyle, 'horizontalCornerRadius', 'number');
    expectFieldType(annot.borderStyle, 'verticalCornerRadius', 'number');
    expectFieldType(annot.borderStyle, 'width', 'number');
    expectFieldType(annot.borderStyle, 'style', 'number');
    expectNumberArray(annot.borderStyle.dashArray);
  }

  function checkWidgetAnnotation(widget: pdfjs.types.WidgetAnnotation) {
    checkBaseAnnotation(widget);
    expectFieldType(widget, 'fieldName', 'string');
    expectFieldType(widget, 'fieldType', 'string');
    expectFieldType(widget, 'fieldFlags', 'number');
    expectFieldType(widget, 'alternativeText', 'string');
    expectFieldType(widget, 'defaultAppearance', 'string');
    expectFieldType(widget, 'readOnly', 'boolean');
  }

  test('text widget', async () => {
    let { doc, annotations } = await getAnnotationsFrom(
      'annotation-text-widget.pdf'
    );
    annotations.forEach(annotation => {
      let widget = annotation as pdfjs.types.TextWidgetAnnotation;
      checkWidgetAnnotation(widget);
      expectFieldType(widget, 'fieldValue', 'string');
      expectFieldType(widget, 'textAlignment', 'number');
      expectFieldType(widget, 'multiLine', 'boolean');
      if (widget.maxLen !== null) {
        expectFieldType(widget, 'maxLen', 'number');
      }
      expectFieldType(widget, 'comb', 'boolean');
    });
    doc.destroy();
  });

  // TODO: Test other annotation types.
});

describe('PDFPageProxy PDFObjects type', () => {
  function checkPDFObjects(pdfObjs: pdfjs.types.PDFObjects) {
    expect(typeof pdfObjs).toBe('object');
    let objs = pdfObjs.objs;
    let keys = Object.keys(objs);
    // The PDF file ad page loaded should be chosen to have a non-empty objs or
    // commonObjs field on PDFPageProxy.
    expect(keys.length).toBeGreaterThan(0);
    keys.forEach(key => {
      expect(typeof key).toBe('string');
      expect(typeof objs[key]).toBe('object');
    });
  }

  test('commonObjs', async () => {
    // File specifically chosen to have non-empty page.commonObjs
    let { doc, page } = await getPageFromDocument(
      'ShowText-ShadingPattern.pdf'
    );
    // Getting the operator list populates page.objs and page.commonObjs
    let ops = await page.getOperatorList();
    checkPDFObjects(page.commonObjs);
  });
});

describe('SVG types', () => {
  let doc: pdfjs.PDFDocumentProxy;
  let page: pdfjs.PDFPageProxy;
  let svg: pdfjs.SVGGraphics;

  asyncBeforeAll(async () => {
    ({ doc, page } = await getPageFromDocument('tracemonkey.pdf'));
    svg = new pdfjs.SVGGraphics(page.commonObjs, page.objs);
  });

  test('', async () => {
    let ops = await page.getOperatorList();
    let svgElement = await svg.getSVG(ops, page.getViewport(1.0));
    // Hack to get around domstubs.js not being written in TypeScript.
    let element = svgElement as any;
    expect(element.nodeName).toBe('svg:svg');
  });
});

describe('other pdf.js exports', () => {
  test('has expected types for variables', () => {
    expectFieldType(pdfjs, 'version', 'string');
    expectFieldType(pdfjs, 'build', 'string');
  });

  test('has expected types for function arguments and return values', () => {
    let o = {};
    expect(typeof pdfjs.shadow(o, 'key', {})).toBe('object');
    expect(typeof pdfjs.createBlob('data', 'text/plain')).toBe('object');
    expect(typeof pdfjs.createObjectURL('', 'text/plain')).toBe('string');
    expect(typeof pdfjs.removeNullCharacters('abc')).toBe('string');
    expect(typeof pdfjs.getFilenameFromUrl('file://foo.pdf')).toBe('string');
  });

  test('PasswordResponses', () => {
    expect(pdfjs.PasswordResponses.NEED_PASSWORD).toBeDefined();
    expect(pdfjs.PasswordResponses.INCORRECT_PASSWORD).toBeDefined();
  });

  test('InvalidPDFException', () => {
    const ex = new pdfjs.InvalidPDFException('message');
    expect(ex).toEqual(jasmine.any(Error));
    expect(ex.message).toBe('message');
    expect(ex.name).toBe('InvalidPDFException');
  });

  test('MissingPDFException', () => {
    const ex = new pdfjs.MissingPDFException('message');
    expect(ex).toEqual(jasmine.any(Error));
    expect(ex.message).toBe('message');
    expect(ex.name).toBe('MissingPDFException');
  });

  test('UnexpectedResponseException', () => {
    const ex = new pdfjs.UnexpectedResponseException('message', 400);
    expect(ex).toEqual(jasmine.any(Error));
    expect(ex.message).toBe('message');
    expect(ex.status).toBe(400);
    expect(ex.name).toBe('UnexpectedResponseException');
  });

  test('RenderingCancelledException', () => {
    const ex = new pdfjs.RenderingCancelledException('message', 'type');
    expect(ex).toEqual(jasmine.any(Error));
    expect(ex.message).toBe('message');
    expect(ex.type).toBe('type');
  });

  describe('Util functions', () => {
    test('Util', () => {
      expect(pdfjs.Util).toBeDefined();
    });

    test('makeCssRgb', () => {
      expect(pdfjs.Util.makeCssRgb(0, 0, 0)).toMatch(/^rgb\(.*\)$/);
    });

    let m1 = [1, 1, 1, 1, 1, 1];
    let m2 = [2, 2, 2, 2, 2, 2];

    test('transform', () => {
      expectTransform(pdfjs.Util.transform(m1, m2));
    });

    let pt: pdfjs.Point = [0.5, 0.7];
    test('applyTransform', () => {
      expectPoint(pdfjs.Util.applyTransform(pt, m1));
    });
    test('applyInverseTransform', () => {
      expectPoint(pdfjs.Util.applyInverseTransform(pt, m1));
    });

    let r: pdfjs.Rect = [0, 0, 1, 1];
    test('getAxialAlignedBoundingBox', () => {
      expectRect(pdfjs.Util.getAxialAlignedBoundingBox(r, m1));
    });

    test('inverseTransform', () => {
      expectTransform(pdfjs.Util.inverseTransform(m1));
    });

    test('singularValueDecompose2dScale', () => {
      expectArray(pdfjs.Util.singularValueDecompose2dScale(m1), 2);
    });

    function expectPoint3d(point: number[]) {
      expectArray(point, 3);
    }

    let m3d = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    let p3d: pdfjs.types.Point3d = [2, 2, 2];
    test('apply3dTransform', () => {
      expectPoint3d(pdfjs.Util.apply3dTransform(m3d /*? $[0]*/, p3d));
    });

    test('normalizeRect', () => {
      expectRect(pdfjs.Util.normalizeRect(r));
    });

    describe('intersect', () => {
      test('should return a Rect if input rects intersect', () => {
        let r1: pdfjs.Rect = [0, 0, 5, 5];
        let r2: pdfjs.Rect = [1, 1, 2, 2];

        let intersection = pdfjs.Util.intersect(r1, r2);
        expectRect(intersection as number[]);
      });
      test('should be false if the input rects do not intersect', () => {
        let r1: pdfjs.Rect = [0, 0, 0, 0];
        let r2: pdfjs.Rect = [1, 1, 1, 1];
        expect(pdfjs.Util.intersect(r1, r2)).toBe(false);
      });
    });

    test('toRoman', () => {
      expect(typeof pdfjs.Util.toRoman(1024, false)).toBe('string');
    });

    test('appendToArray', () => {
      let arr = [0];
      pdfjs.Util.appendToArray(arr, [1]);
      expect(arr).toEqual([0, 1]);
    });

    test('prependToArray', () => {
      let arr = [0];
      pdfjs.Util.prependToArray(arr, [1]);
      expect(arr).toEqual([1, 0]);
    });

    test('extendObj', () => {
      let o1 = {};
      let o2 = { foo: 'bar' };
      pdfjs.Util.extendObj(o1, o2);
      expect(o1).toEqual(o2);
    });
  }); // Util

  test('createPromiseCapability', () => {
    let capability = pdfjs.createPromiseCapability();
    expect(capability.promise).toEqual(jasmine.any(Promise));
    expect(capability.resolve).toBeDefined();
    expect(capability.reject).toBeDefined();
  });

  test('OPS', () => {
    expect(pdfjs.OPS.dependency).toBeDefined();
    expect(pdfjs.OPS.setLineWidth).toBeDefined();
    expect(pdfjs.OPS.setLineCap).toBeDefined();
    expect(pdfjs.OPS.setLineJoin).toBeDefined();
    expect(pdfjs.OPS.setMiterLimit).toBeDefined();
    expect(pdfjs.OPS.setDash).toBeDefined();
    expect(pdfjs.OPS.setRenderingIntent).toBeDefined();
    expect(pdfjs.OPS.setFlatness).toBeDefined();
    expect(pdfjs.OPS.setGState).toBeDefined();
    expect(pdfjs.OPS.save).toBeDefined();
    expect(pdfjs.OPS.restore).toBeDefined();
    expect(pdfjs.OPS.transform).toBeDefined();
    expect(pdfjs.OPS.moveTo).toBeDefined();
    expect(pdfjs.OPS.lineTo).toBeDefined();
    expect(pdfjs.OPS.curveTo).toBeDefined();
    expect(pdfjs.OPS.curveTo2).toBeDefined();
    expect(pdfjs.OPS.curveTo3).toBeDefined();
    expect(pdfjs.OPS.closePath).toBeDefined();
    expect(pdfjs.OPS.rectangle).toBeDefined();
    expect(pdfjs.OPS.stroke).toBeDefined();
    expect(pdfjs.OPS.closeStroke).toBeDefined();
    expect(pdfjs.OPS.fill).toBeDefined();
    expect(pdfjs.OPS.eoFill).toBeDefined();
    expect(pdfjs.OPS.fillStroke).toBeDefined();
    expect(pdfjs.OPS.eoFillStroke).toBeDefined();
    expect(pdfjs.OPS.closeFillStroke).toBeDefined();
    expect(pdfjs.OPS.closeEOFillStroke).toBeDefined();
    expect(pdfjs.OPS.endPath).toBeDefined();
    expect(pdfjs.OPS.clip).toBeDefined();
    expect(pdfjs.OPS.eoClip).toBeDefined();
    expect(pdfjs.OPS.beginText).toBeDefined();
    expect(pdfjs.OPS.endText).toBeDefined();
    expect(pdfjs.OPS.setCharSpacing).toBeDefined();
    expect(pdfjs.OPS.setWordSpacing).toBeDefined();
    expect(pdfjs.OPS.setHScale).toBeDefined();
    expect(pdfjs.OPS.setLeading).toBeDefined();
    expect(pdfjs.OPS.setFont).toBeDefined();
    expect(pdfjs.OPS.setTextRenderingMode).toBeDefined();
    expect(pdfjs.OPS.setTextRise).toBeDefined();
    expect(pdfjs.OPS.moveText).toBeDefined();
    expect(pdfjs.OPS.setLeadingMoveText).toBeDefined();
    expect(pdfjs.OPS.setTextMatrix).toBeDefined();
    expect(pdfjs.OPS.nextLine).toBeDefined();
    expect(pdfjs.OPS.showText).toBeDefined();
    expect(pdfjs.OPS.showSpacedText).toBeDefined();
    expect(pdfjs.OPS.nextLineShowText).toBeDefined();
    expect(pdfjs.OPS.nextLineSetSpacingShowText).toBeDefined();
    expect(pdfjs.OPS.setCharWidth).toBeDefined();
    expect(pdfjs.OPS.setCharWidthAndBounds).toBeDefined();
    expect(pdfjs.OPS.setStrokeColorSpace).toBeDefined();
    expect(pdfjs.OPS.setFillColorSpace).toBeDefined();
    expect(pdfjs.OPS.setStrokeColor).toBeDefined();
    expect(pdfjs.OPS.setStrokeColorN).toBeDefined();
    expect(pdfjs.OPS.setFillColor).toBeDefined();
    expect(pdfjs.OPS.setFillColorN).toBeDefined();
    expect(pdfjs.OPS.setStrokeGray).toBeDefined();
    expect(pdfjs.OPS.setFillGray).toBeDefined();
    expect(pdfjs.OPS.setStrokeRGBColor).toBeDefined();
    expect(pdfjs.OPS.setFillRGBColor).toBeDefined();
    expect(pdfjs.OPS.setStrokeCMYKColor).toBeDefined();
    expect(pdfjs.OPS.setFillCMYKColor).toBeDefined();
    expect(pdfjs.OPS.shadingFill).toBeDefined();
    expect(pdfjs.OPS.beginInlineImage).toBeDefined();
    expect(pdfjs.OPS.beginImageData).toBeDefined();
    expect(pdfjs.OPS.endInlineImage).toBeDefined();
    expect(pdfjs.OPS.paintXObject).toBeDefined();
    expect(pdfjs.OPS.markPoint).toBeDefined();
    expect(pdfjs.OPS.markPointProps).toBeDefined();
    expect(pdfjs.OPS.beginMarkedContent).toBeDefined();
    expect(pdfjs.OPS.beginMarkedContentProps).toBeDefined();
    expect(pdfjs.OPS.endMarkedContent).toBeDefined();
    expect(pdfjs.OPS.beginCompat).toBeDefined();
    expect(pdfjs.OPS.endCompat).toBeDefined();
    expect(pdfjs.OPS.paintFormXObjectBegin).toBeDefined();
    expect(pdfjs.OPS.paintFormXObjectEnd).toBeDefined();
    expect(pdfjs.OPS.beginGroup).toBeDefined();
    expect(pdfjs.OPS.endGroup).toBeDefined();
    expect(pdfjs.OPS.beginAnnotations).toBeDefined();
    expect(pdfjs.OPS.endAnnotations).toBeDefined();
    expect(pdfjs.OPS.beginAnnotation).toBeDefined();
    expect(pdfjs.OPS.endAnnotation).toBeDefined();
    expect(pdfjs.OPS.paintJpegXObject).toBeDefined();
    expect(pdfjs.OPS.paintImageMaskXObject).toBeDefined();
    expect(pdfjs.OPS.paintImageMaskXObjectGroup).toBeDefined();
    expect(pdfjs.OPS.paintImageXObject).toBeDefined();
    expect(pdfjs.OPS.paintInlineImageXObject).toBeDefined();
    expect(pdfjs.OPS.paintInlineImageXObjectGroup).toBeDefined();
    expect(pdfjs.OPS.paintImageXObjectRepeat).toBeDefined();
    expect(pdfjs.OPS.paintImageMaskXObjectRepeat).toBeDefined();
    expect(pdfjs.OPS.paintSolidColorImageMask).toBeDefined();
    expect(pdfjs.OPS.constructPath).toBeDefined();
  });

  test('VerbosityLevel', () => {
    expect(pdfjs.VerbosityLevel.ERRORS).toBeDefined();
    expect(pdfjs.VerbosityLevel.INFOS).toBeDefined();
    expect(pdfjs.VerbosityLevel.WARNINGS).toBeDefined();
  });

  test('UNSUPPORTED_FEATURES', () => {
    expect(pdfjs.UNSUPPORTED_FEATURES.font).toBeDefined();
    expect(pdfjs.UNSUPPORTED_FEATURES.forms).toBeDefined();
    expect(pdfjs.UNSUPPORTED_FEATURES.javaScript).toBeDefined();
    expect(pdfjs.UNSUPPORTED_FEATURES.shadingPattern).toBeDefined();
    expect(pdfjs.UNSUPPORTED_FEATURES.smask).toBeDefined();
    expect(pdfjs.UNSUPPORTED_FEATURES.unknown).toBeDefined();
  });

  test('LinkTarget', () => {
    expectFieldType(pdfjs.LinkTarget, 'BLANK', 'number');
    expectFieldType(pdfjs.LinkTarget, 'NONE', 'number');
    expectFieldType(pdfjs.LinkTarget, 'PARENT', 'number');
    expectFieldType(pdfjs.LinkTarget, 'SELF', 'number');
    expectFieldType(pdfjs.LinkTarget, 'TOP', 'number');
  });

  test('GlobalWorkerOptions', () => {
    expect(pdfjs.GlobalWorkerOptions.workerPort).toBeNull();
    expectFieldType(pdfjs.GlobalWorkerOptions, 'workerSrc', 'string');
  });

  test('apiCompatibilityParams', () => {
    expect(pdfjs.apiCompatibilityParams).toBeDefined();
  });
});
