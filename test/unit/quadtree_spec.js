/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2015 Mozilla Foundation
 * Copyright 2015 Michael Sander (speedplane)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required bY applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* globals expect, it, describe, QuadTree */

'use strict';

describe('quadtree', function() {
  var bounds = { x: 0, y: 0, width: 100, height: 100 };
  describe('Quadtree Basics', function() {
    it('empty quadtree', function() {
      var quad = new QuadTree(bounds);
      expect(quad.length).toEqual(0);
      expect(quad.retrieve({ x: 5, y: 5, width: 1, height: 1 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 55, y: 5, width: 1, height: 1 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 5, y: 55, width: 1, height: 1 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 55, y: 55, width: 1, height: 1 }))
        .toEqual([]);
    });
    it('quadtree len of one', function() {
      var quad = new QuadTree(bounds);
      var items = [{ x: 2, y: 2, width: 96, height: 96, id: 0 }];
      quad.insert(items[0]);
      expect(quad.length).toEqual(1);
      
      // Check all quadrants that it's there
      expect(quad.retrieve({ x: 5, y: 5, width: 1, height: 1 }))
        .toEqual(items);
      expect(quad.retrieve({ x: 55, y: 5, width: 1, height: 1 }))
        .toEqual(items);
      expect(quad.retrieve({ x: 5, y: 55, width: 1, height: 1 }))
        .toEqual(items);
      expect(quad.retrieve({ x: 55, y: 55, width: 1, height: 1 }))
        .toEqual(items);
      
      // Check all quadrants that it's not
      expect(quad.retrieve({ x: 1, y: 1, width: 0.5, height: 0.5 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 1, y: 99, width: 0.5, height: 0.5 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 99, y: 1, width: 0.5, height: 0.5 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 99, y: 99, width: 0.5, height: 0.5 }))
        .toEqual([]);
      // Check on the sides
      expect(quad.retrieve({ x: 50, y: 1, width: 0.5, height: 0.5 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 50, y: 99, width: 0.5, height: 0.5 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 1, y: 50, width: 0.5, height: 0.5 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 99, y: 50, width: 0.5, height: 0.5 }))
        .toEqual([]);
      
      // Check the boundaries - Just in boundaries
      expect(quad.retrieve({ x: 2, y: 2, width: 5, height: 5 }))
        .toEqual(items);
      expect(quad.retrieve({ x: 2, y: 94, width: 5, height: 5 }))
        .toEqual(items);
      expect(quad.retrieve({ x: 94, y: 2, width: 5, height: 5 }))
        .toEqual(items);
      expect(quad.retrieve({ x: 94, y: 94, width: 5, height: 5 }))
        .toEqual(items);
      // Check the boundaries - Just outside corners
      expect(quad.retrieve({ x: 98, y: 1, width: 1, height: 1 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 1, y: 98, width: 1, height: 1 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 98, y: 50, width: 1, height: 1 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 98, y: 98, width: 1, height: 1 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 50, y: 98, width: 1, height: 1 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 1, y: 1, width: 1, height: 1 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 1, y: 50, width: 1, height: 1 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 50, y: 1, width: 1, height: 1 }))
        .toEqual([]);
      // Check the boundaries - sides
      expect(quad.retrieve({ x: 50, y: 98, width: 1, height: 1 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 98, y: 50, width: 1, height: 1 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 98, y: 98, width: 1, height: 1 }))
        .toEqual([]);
      
      // Just over the boundaries
      expect(quad.retrieve({ x: 1.01, y: 1.01, width: 1, height: 1 }))
        .toEqual(items);
    });
    
    it('repeated elements in quadtree', function() {
      var quad = new QuadTree(bounds);
      var items = [
        { x: 2, y: 2, width: 96, height: 96, id: 0 },
        { x: 2, y: 2, width: 96, height: 96, id: 1 },
        { x: 2, y: 2, width: 96, height: 96, id: 2 },
        { x: 2, y: 2, width: 96, height: 96, id: 3 },
        { x: 2, y: 2, width: 96, height: 96, id: 4 },
        { x: 2, y: 2, width: 96, height: 96, id: 5 },
        { x: 2, y: 2, width: 96, height: 96, id: 6 },
        { x: 2, y: 2, width: 96, height: 96, id: 7 },
        { x: 2, y: 2, width: 96, height: 96, id: 8 }
      ];
      quad.insert(items);
      expect(quad.length).toEqual(items.length);
      // Check all quadrants that it's there
      expect(quad.retrieve({ x: 5, y: 5, width: 1, height: 1 }))
        .toEqual(items);
      expect(quad.retrieve({ x: 55, y: 5, width: 1, height: 1 }))
        .toEqual(items);
      expect(quad.retrieve({ x: 5, y: 55, width: 1, height: 1 }))
        .toEqual(items);
      expect(quad.retrieve({ x: 55, y: 55, width: 1, height: 1 }))
        .toEqual(items);
      
      // Check all quadrants that it's not
      expect(quad.retrieve({ x: 1, y: 1, width: 0.5, height: 0.5 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 1, y: 99, width: 0.5, height: 0.5 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 99, y: 1, width: 0.5, height: 0.5 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 99, y: 99, width: 0.5, height: 0.5 }))
        .toEqual([]);
      // Check on the sides
      expect(quad.retrieve({ x: 50, y: 1, width: 0.5, height: 0.5 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 50, y: 99, width: 0.5, height: 0.5 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 1, y: 50, width: 0.5, height: 0.5 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 99, y: 50, width: 0.5, height: 0.5 }))
        .toEqual([]);
      
      // Check the boundaries - Just in boundaries
      expect(quad.retrieve({ x: 2, y: 2, width: 5, height: 5 }))
        .toEqual(items);
      expect(quad.retrieve({ x: 2, y: 94, width: 5, height: 5 }))
        .toEqual(items);
      expect(quad.retrieve({ x: 94, y: 2, width: 5, height: 5 }))
        .toEqual(items);
      expect(quad.retrieve({ x: 94, y: 94, width: 5, height: 5 }))
        .toEqual(items);
      // Check the boundaries - Just outside corners
      expect(quad.retrieve({ x: 98, y: 1, width: 1, height: 1 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 1, y: 98, width: 1, height: 1 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 98, y: 50, width: 1, height: 1 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 98, y: 98, width: 1, height: 1 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 50, y: 98, width: 1, height: 1 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 1, y: 1, width: 1, height: 1 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 1, y: 50, width: 1, height: 1 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 50, y: 1, width: 1, height: 1 }))
        .toEqual([]);
      // Check the boundaries - sides
      expect(quad.retrieve({ x: 50, y: 98, width: 1, height: 1 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 98, y: 50, width: 1, height: 1 }))
        .toEqual([]);
      expect(quad.retrieve({ x: 98, y: 98, width: 1, height: 1 }))
        .toEqual([]);
      
      // Just over the boundaries
      expect(quad.retrieve({ x: 1.01, y: 1.01, width: 1, height: 1 }))
        .toEqual(items);
    });
  });
  
  function itToAr(iterator) {
    // Convert an iterator to an array
    var out = [];
    while (true) {
      var item = iterator.next();
      if (item === null) {
        return out;
      }
      out.push(item);
    }
    return out;
  }
  
  describe('Quadtree X Iteration', function() {
    var quad = new QuadTree(bounds);
    var items = [
      { x: 2, y: 49, width: 2, height: 2, id: 0 },
      { x: 4, y: 49, width: 2, height: 2, id: 1 },
      { x: 6, y: 49, width: 2, height: 2, id: 2 },
      { x: 8, y: 49, width: 2, height: 2, id: 3 },
      { x: 10, y: 49, width: 2, height: 2, id: 4 },
      { x: 12, y: 49, width: 2, height: 2, id: 5 },
    ];
    quad.insert(items);
    
    function testIterateXTests() {
      // Runs tests on a quad in the x direction. 
      var out = [];
      out = itToAr(quad.retrieveXInc(0, 49, 1));
      expect(out).toEqual(items);
      
      out = itToAr(quad.retrieveXInc(0, 49, 5));
      expect(out).toEqual(items);
      
      // Skip the first
      out = itToAr(quad.retrieveXInc(4, 49, 1));
      expect(out).toEqual(items.slice(1));
      // Skip all
      out = itToAr(quad.retrieveXInc(14, 49, 1));
      expect(out).toEqual([]);
      // Get the edges
      out = itToAr(quad.retrieveXInc(0, 48, 1));
      expect(out).toEqual([]);
      out = itToAr(quad.retrieveXInc(0, 51, 1));
      expect(out).toEqual([]);
      
      // Now test the same in reverse
      items.reverse();
      
      out = itToAr(quad.retrieveXDec(50, 49, 1));
      expect(out).toEqual(items);
      out = itToAr(quad.retrieveXDec(13, 49, 1));
      expect(out).toEqual(items);
      // Skip the first
      out = itToAr(quad.retrieveXDec(12, 49, 1));
      expect(out).toEqual(items.slice(1));
      out = itToAr(quad.retrieveXDec(9, 49, 1));
      expect(out).toEqual(items.slice(2));
      // Get the edges
      out = itToAr(quad.retrieveXDec(8, 49, 1));
      expect(out).toEqual(items.slice(3));
      out = itToAr(quad.retrieveXDec(6, 49, 1));
      expect(out).toEqual(items.slice(4));
      out = itToAr(quad.retrieveXDec(4, 49, 1));
      expect(out).toEqual(items.slice(5));
      out = itToAr(quad.retrieveXDec(2, 49, 1));
      expect(out).toEqual([]);
      
      // Put items back into forward order
      items.reverse();
    }
    
    
    it('iterate x alone', testIterateXTests);
    // Add a number of objects
    for (var i=0; i<100; i += 5) {
      quad.insert({ x: i, y: i/20, width: 1, height: 1 });
    }
    // Adding the objects above should not have changed the test
    it('iterate x with objs', testIterateXTests);
    for (i=0; i<100; i += 5) {
      quad.insert({ x: 99-i, y: 98-i/20, width: 1, height: 1 });
    }
    it('iterate x with more objs', testIterateXTests);
  });
  
  
  
  describe('Quadtree Y Iteration', function() {
    var quad = new QuadTree(bounds);
    var items = [
      { y: 2, x: 49, width: 2, height: 2, id: 0 },
      { y: 4, x: 49, width: 2, height: 2, id: 1 },
      { y: 6, x: 49, width: 2, height: 2, id: 2 },
      { y: 8, x: 49, width: 2, height: 2, id: 3 },
      { y: 10, x: 49, width: 2, height: 2, id: 4 },
      { y: 12, x: 49, width: 2, height: 2, id: 5 },
    ];
    quad.insert(items);
    
    function testIterateYTests() {
      // Runs tests on a quad in the x direction. 
      var out = [];
      out = itToAr(quad.retrieveYInc(49, 0, 1));
      expect(out).toEqual(items);
      out = itToAr(quad.retrieveYInc(49, 0, 5));
      expect(out).toEqual(items);
      
      // Skip the first
      out = itToAr(quad.retrieveYInc(49, 4, 1));
      expect(out).toEqual(items.slice(1));
      // Skip all
      out = itToAr(quad.retrieveYInc(49, 14, 1));
      expect(out).toEqual([]);
      // Get the edges
      out = itToAr(quad.retrieveYInc(48, 0, 1));
      expect(out).toEqual([]);
      out = itToAr(quad.retrieveYInc(51, 0, 1));
      expect(out).toEqual([]);
      
      // Now test the same in reverse
      items.reverse();
      
      out = itToAr(quad.retrieveYDec(49, 50, 1));
      expect(out).toEqual(items);
      out = itToAr(quad.retrieveYDec(49, 13, 1));
      expect(out).toEqual(items);
      // Skip the first
      out = itToAr(quad.retrieveYDec(49, 12, 1));
      expect(out).toEqual(items.slice(1));
      out = itToAr(quad.retrieveYDec(49, 9, 1));
      expect(out).toEqual(items.slice(2));
      // Get the edges
      out = itToAr(quad.retrieveYDec(49, 8, 1));
      expect(out).toEqual(items.slice(3));
      out = itToAr(quad.retrieveYDec(49, 6, 1));
      expect(out).toEqual(items.slice(4));
      out = itToAr(quad.retrieveYDec(49, 4, 1));
      expect(out).toEqual(items.slice(5));
      out = itToAr(quad.retrieveYDec(49, 2, 1));
      expect(out).toEqual([]);
      
      // Put items back into forward order
      items.reverse();
    }
    
    
    it('iterate x alone', testIterateYTests);
    // Add a number of objects
    for (var i=0; i<100; i += 5) {
      quad.insert({ x: i/20, y: i, width: 1, height: 1 });
    }
    // Adding the objects above should not have changed the test
    it('iterate x with objs', testIterateYTests);
    for (i=0; i<100; i += 5) {
      quad.insert({ x: 99-i/20, y: 99-i, width: 1, height: 1 });
    }
    it('iterate x with more objs', testIterateYTests);
    
  });
  describe('Quadtree Var Size Iteration', function () {
    it('X Direc', function () {
      var quad = new QuadTree(bounds);
      var items = [
        { y: 1, x: 10, width: 30, height: 2, id: 0 },
        { y: 1, x: 2, width: 80, height: 2, id: 1 },
      ];
      quad.insert(items);
      var c;
      c = quad.retrieveXInc(0, 0, 50).next();
      expect(c && c.id).toEqual(1);
      c = quad.retrieveXDec(100, 0, 50).next();
      expect(c && c.id).toEqual(1);
    });
    it('X Direc - Multiquads', function () {
      var quad = new QuadTree(bounds);
      var items = [
        { y: 1, x: 10, width: 30, height: 2, id: 0 },
        { y: 1, x: 2, width: 80, height: 2, id: 1 },
        { y: 3, x: 10, width: 30, height: 2, id: 2 },
        { y: 4, x: 10, width: 30, height: 2, id: 3 },
      ];
      quad.insert(items);
      var c;
      c = quad.retrieveXInc(0, 0, 50).next();
      expect(c && c.id).toEqual(1);
      c = quad.retrieveXDec(100, 0, 50).next();
      expect(c && c.id).toEqual(1);
    });
    it('Y Direc', function () {
      var quad = new QuadTree(bounds);
      var items = [
        { x: 1, y: 10, width: 2, height: 30, id: 0 },
        { x: 1, y: 2, width: 2, height: 80, id: 1 },
      ];
      quad.insert(items);
      var c;
      c = quad.retrieveYInc(0, 0, 50).next();
      expect(c && c.id).toEqual(1);
      c = quad.retrieveYDec(0, 100, 50).next();
      expect(c && c.id).toEqual(1);
    });
  });
  describe('Other Exmaples', function () {
    var quad = new QuadTree({ x: 0, y: 0, width: 350, height: 500 });
    var items = [
      { x: 327.50, y: 226.06, width: 3.74, height: 14.96, id: 0 },
      { x: 321.85, y: 243.27, width: 14.98, height: 14.96, id: 1 },
    ];
    quad.insert(items);
    
    var out = itToAr(quad.retrieveYInc(327.50, 226.06, 3.74));
    out = out.map(function (c) { return c.id; });
    expect(out).toEqual([0, 1]);
  });
});
