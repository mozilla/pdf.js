/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* globals expect, it, describe, isDict, AnnotationBorderStyleType,
           AnnotationFlag, AnnotationType, Annotation, LinkAnnotation,
           Dict, Name */

'use strict';

describe('Annotation layer', function() {
  describe('Annotation and AnnotationBorderStyle', function() {
    it('should set and get its ID', function() {
      var annotation = new Annotation();
      annotation.setId(123);

      expect(annotation.getId()).toEqual(123);
    });

    it('should not set an invalid ID', function() {
      var annotation = new Annotation();
      annotation.setId('id');

      expect(annotation.getId()).toEqual(null);
    });

    it('should set and get its type', function() {
      var annotation = new Annotation();
      annotation.setType(2);

      expect(annotation.getType()).toEqual(AnnotationType.LINK);
    });

    it('should not set an invalid type (1)', function() {
      var annotation = new Annotation();
      annotation.setType(89);

      expect(annotation.getType()).toEqual(null);
    });

    it('should not set an invalid type (2)', function() {
      var annotation = new Annotation();
      annotation.setType('link');

      expect(annotation.getType()).toEqual(null);
    });

    it('should set and get its contents', function() {
      var annotation = new Annotation();
      annotation.setContents('Annotation contents');

      expect(annotation.getContents()).toEqual('Annotation contents');
    });

    it('should set and get its date', function() {
      var annotation = new Annotation();
      annotation.setDate('D:20100325090038-04\'00\'');

      expect(annotation.getDate()).toEqual('D:20100325090038-04\'00\'');
    });

    it('should set and get its rectangle', function() {
      var annotation = new Annotation();
      annotation.setRectangle([117, 694, 164.298, 720]);

      expect(annotation.getRectangle()).toEqual([117, 694, 164.298, 720]);
    });

    it('should not set an invalid rectangle', function() {
      var annotation = new Annotation();
      annotation.setRectangle([117, 694, 164.298]);

      expect(annotation.getRectangle()).toEqual([0, 0, 0, 0]);
    });

    it('should set and get its border style from a BS dictionary', function() {
      var dict = new Dict();
      var bs = new Dict();
      bs.set('Type', new Name('Border'));
      bs.set('S', { name: 'U' });
      bs.set('W', 2);
      bs.set('D', [2, 3]);
      dict.set('BS', bs);

      var annotation = new Annotation();
      annotation.setBorderStyle(dict);

      expect(annotation.getBorderStyle().getStyle()).
        toEqual(AnnotationBorderStyleType.UNDERLINE);

      expect(annotation.getBorderStyle().getWidth()).toEqual(2);

      expect(annotation.getBorderStyle().getDashArray()).toEqual([2, 3]);
    });

    it('should set and get its border style from a Border array', function() {
      var dict = new Dict();
      dict.set('Border', [5, 2, 2, [2, 3]]);

      var annotation = new Annotation();
      annotation.setBorderStyle(dict);

      var borderStyle = annotation.getBorderStyle();

      expect(borderStyle.getStyle()).toEqual(AnnotationBorderStyleType.SOLID);
      expect(borderStyle.getWidth()).toEqual(2);
      expect(borderStyle.getDashArray()).toEqual([2, 3]);
      expect(borderStyle.getHorizontalCornerRadius()).toEqual(5);
      expect(borderStyle.getVerticalCornerRadius()).toEqual(2);
    });

    it('should not set an invalid border style', function() {
      var annotation = new Annotation();
      annotation.setBorderStyle('not a dict');
      var borderStyle = annotation.getBorderStyle();

      expect(borderStyle.getStyle()).toEqual(AnnotationBorderStyleType.SOLID);
      expect(borderStyle.getWidth()).toEqual(1);
      expect(borderStyle.getDashArray()).toEqual([3]);
      expect(borderStyle.getHorizontalCornerRadius()).toEqual(0);
      expect(borderStyle.getVerticalCornerRadius()).toEqual(0);
    });

    it('should set and get its RGB color', function() {
      var annotation = new Annotation();
      annotation.setColor([0, 0, 1]);

      expect(annotation.getColor()).toEqual([0, 0, 255]);
    });

    it('should set and get its CMYK color', function() {
      var annotation = new Annotation();
      annotation.setColor([0.1, 0.92, 0.84, 0.02]);

      expect(annotation.getColor()).toEqual([233, 59, 47]);
    });

    it('should set and get its grayscale color', function() {
      var annotation = new Annotation();
      annotation.setColor([0.4]);

      expect(annotation.getColor()).toEqual([102, 102, 102]);
    });

    it('should not set an invalid color', function() {
      var annotation = new Annotation();
      annotation.setColor([0.4, 7]);

      expect(annotation.getColor()).toEqual(null);
    });

    it('should set and get flags', function() {
      var annotation = new Annotation();
      annotation.setFlags(13);

      expect(annotation.hasFlag(AnnotationFlag.INVISIBLE)).toEqual(true);
      expect(annotation.hasFlag(AnnotationFlag.NOZOOM)).toEqual(true);
      expect(annotation.hasFlag(AnnotationFlag.PRINT)).toEqual(true);
      expect(annotation.hasFlag(AnnotationFlag.READONLY)).toEqual(false);
    });

    it('should be viewable and not printable by default', function() {
      var annotation = new Annotation();

      expect(annotation.isViewable()).toEqual(true);
      expect(annotation.isPrintable()).toEqual(false);
    });
  });

  describe('LinkAnnotation', function() {
    it('should set and get its action', function() {
      var dict = new Dict();
      dict.set('S', new Name('URI'));
      dict.set('URI', 'www.mozilla.org');

      var annotation = new LinkAnnotation();
      annotation.setAction(dict);

      expect(annotation.getAction()).toEqual({
        type: 'URI',
        url: 'http://www.mozilla.org'
      });
    });

    it('should not set an invalid action', function() {
      var annotation = new LinkAnnotation();
      annotation.setAction('no object');

      expect(annotation.getAction()).toEqual(null);
    });

    it('should set and get its destination', function() {
      var annotation = new LinkAnnotation();
      annotation.setDestination('EN');

      expect(annotation.getDestination()).toEqual('EN');
    });
  });
});

