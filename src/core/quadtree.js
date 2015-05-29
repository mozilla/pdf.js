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

'use strict';

/****************** QuadTree ****************
*
* A QuadTree implementation in JavaScript that stores rectangular regions.
* @module QuadTree
**/
var QuadTree = (function QuadTreeClosure() {
  /**
  * QuadTree data structure.
  * @class QuadTree
  * @constructor
  * @param {Object} An object representing the top level QuadTree's bounds. The
  *                 object should contain: x, y, width, height and id that 
  *                 uniquely identifies it.
  * @param {Number} maxDepth Max number of levels that the quadtree will create.
  * @param {Number} maxChildren Max children in a node before being split.
  **/
  function QuadTree(bounds, maxDepth, maxChildren) {
    this.root = new QNode(bounds, 0, maxDepth, maxChildren);
    this.length = 0;
  }
  
  // The root node of the QuadTree covers the entire area being segmented.
  QuadTree.prototype.root = null;
  QuadTree.prototype.length = 0;
  
  /**
  * Inserts an item into the QuadTree.
  * Each element must have an id to uniquely identify it. We don't check to 
  * make ensure that the element has already been added.
  **/
  QuadTree.prototype.insert = function QuadTree_insert(item) {
    if (item instanceof Array) {
      for (var i = 0, len = item.length; i < len; i++) {
        this.insert(item[i]);
      }
    } else {
      var b = this.root.bounds;
      if (item.x >= b.x + b.width || item.x + item.width <= b.x ||
          item.y >= b.y + b.height || item.y + item.height <= b.y) {
        // Can extend past the bounds, but must be at least partially in it.
        return false;
      }
      this.root.insert(item);
      this.length++;
      return true;
    }
  };
  QuadTree.prototype.print = function QuadTree_print() {
    var leafs = this.root.print();
    console.log('QuadTree: ' + this.length + ' objects. ' + leafs + ' leafs.');
  };

  /**
  * Retrieve all items in the same node as the specified item. If it overlaps 
  * multiple nodes, then all children in will be returned.
  * @method retrieve
  * @param {Object} item A rect with x, y, width, height properties.
  **/
  QuadTree.prototype.retrieve = function QuadTree_retrieve(item) {
    // Get a copy of the array of items
    return this.root.retrieve(item, [], { });
  };
  
  /**
   * Iterate through the items from the left to the right as specified bY the 
   * bounding box given bY item: x, y, and height.
   */
  QuadTree.prototype.retrieveXInc =
      function QuadTree_retrieveXInc(x, y, height) {
    var it = { x: x, y: y,
            height: height, width: this.root.bounds.width - x };
    var sorter = function (a, b) {
      return a.x < b.x ? -1 : (a.x > b.x ? 1 : 0);
    };
    var side1 = [QNode.TOP_LEFT, QNode.BOTTOM_LEFT];
    var side2 = [QNode.TOP_RIGHT, QNode.BOTTOM_RIGHT];
    return this.root.retrieveIterate(it, sorter, side1, side2, { });
  };
  QuadTree.prototype.retrieveXDec =
      function QuadTree_retrieveXDec(x, y, height) {
    var x0 = this.root.bounds.x;
    var it = { x: x0, y: y, height: height, width: x - x0 };
    var sorter = function (a, b) {
      var aX = a.x + a.width, bX = b.x + b.width;
      return aX < bX ? 1 : (aX > bX ? -1 : 0);
    };
    var side1 = [QNode.TOP_RIGHT, QNode.BOTTOM_RIGHT];
    var side2 = [QNode.TOP_LEFT, QNode.BOTTOM_LEFT];
    return this.root.retrieveIterate(it, sorter, side1, side2, { });
  };
  
  /**
   * Iterate through the items with increasing y that intersect the box bY: x, 
   * y, and width.
   */
  QuadTree.prototype.retrieveYInc =
      function QuadTree_retrieveYInc(x, y, width) {
    var it = { x: x, y: y,
            width: width, height: this.root.bounds.height - y };
    var sorter = function (a, b) {
      return a.y < b.y ? -1 : (a.y > b.y ? 1 : 0);
    };
    var side1 = [QNode.TOP_LEFT, QNode.TOP_RIGHT];
    var side2 = [QNode.BOTTOM_LEFT, QNode.BOTTOM_RIGHT];
    return this.root.retrieveIterate(it, sorter, side1, side2, { });
  };
  /**
   * Iterate through the items from the down to up as specified bY the 
   * lower left corner of the bounding box given bY item: x, y, and width.
   */
  QuadTree.prototype.retrieveYDec =
      function QuadTree_retrieveYDec(x, y, width) {
    // When decreasing, we're given bottom left corner, convert to top right.
    var y0 = this.root.bounds.y;  // Calculate the top-left corner
    var it = { x: x, y: y0, width: width, height: y - y0 };
    var sorter = function (a, b) {
      var aY = a.y + a.height, bY = b.y + b.height;
      return aY < bY ? 1 : (aY > bY ? -1 : 0);
    };
    var side1 = [QNode.BOTTOM_LEFT, QNode.BOTTOM_RIGHT];
    var side2 = [QNode.TOP_LEFT, QNode.TOP_RIGHT];
    return this.root.retrieveIterate(it, sorter, side1, side2, { });
  };
  
  function QNode(bounds, depth, maxDepth, maxChildren) {
    this.bounds = bounds; //  bounds
    this.children = []; // children contained directly in the node
    this.nodes = null; // subnodes
    this.maxChildren = maxChildren || 4;
    this.maxDepth = maxDepth || 4;
    this.depth = depth || 0;
  }
  
  // We consider "top" to be lower y values (screen coords), but if you're 
  // using a different coord system, everything works. If these constants 
  // change, the array in subdivide must too.
  QNode.TOP_LEFT = 0;
  QNode.TOP_RIGHT = 1;
  QNode.BOTTOM_LEFT = 2;
  QNode.BOTTOM_RIGHT = 3;
  
  ///////////
  // Debugging
  QNode.prototype.print = function QNode_print() {
    var tabs = '';
    for (var d = 0; d < this.depth; d++) {
      tabs += ' ';
    }
    if (this.nodes !== null) {
      var txt = { };
      var totalElements = 0;
      txt[QNode.TOP_LEFT] = 'TOP_LEFT';
      txt[QNode.TOP_RIGHT] = 'TOP_RIGHT';
      txt[QNode.BOTTOM_LEFT] = 'BOTTOM_LEFT';
      txt[QNode.BOTTOM_RIGHT] = 'BOTTOM_RIGHT';
      
      for (var i = 0; i < this.nodes.length; i++) {
          console.log(tabs + 'Depth ' + this.depth + ' ' + txt[i]);
          totalElements += this.nodes[i].print();
      }
      return totalElements;
    }
    console.log(tabs + 'Leaf with ' + this.children.length + ' elements.');
    return this.children.length;
  };
  
  ///////////
  // Insertion
  QNode.prototype.insert = function QNode_insert(item) {
    if (this.nodes !== null) {
      // This is a node, insert into subnodes
      // We may need to insert into more than one if it straddles borders.
      for (var i in this.findIndices(item)) {
        this.nodes[i].insert(item);
      }
      return;
    }
    
    // We're a leaf node
    this.children.push(item);
    if (this.children.length >= this.maxChildren &&
                                this.depth < this.maxDepth) {
      // This will turn this from a leaf node into a node.
      this.subdivide();
      // Do inserts now that this is a subdivided node.
      var childrenLen = this.children.length;
      for (var j = 0; j < childrenLen; j++) {
          this.insert(this.children[j]);
      }
      this.children = null; // Don't need it anymore.
    }
  };

  QNode.prototype.findIndices = function QNode_findIndices(item) {
    // Given the item, return which of the four quadrents the item intersects.
    // Can intersect up to four quadrants. Returns an assoc set.
    var b = this.bounds;
    var bX = b.x + ((b.width / 2) | 0);
    var bY = b.y + ((b.height / 2) | 0);
    
    var out = { };
    var below = false;
    if (item.y < bY) {
      var right;
      if (item.x < bX) {
        out[QNode.TOP_LEFT] = true;
        if (item.x + item.width >= bX) {
          out[QNode.TOP_RIGHT] = true;
        }
      } else {
        out[QNode.TOP_RIGHT] = true;
      }
    } else {
      below = true;
    }
    
    if (below || item.y + item.height >= bY) {
      if (item.x < bX) {
        out[QNode.BOTTOM_LEFT] = true;
        if (item.x + item.width >= bX) {
          out[QNode.BOTTOM_RIGHT] = true;
        }
      } else {
        out[QNode.BOTTOM_RIGHT] = true;
      }
    }
    return out;
  };
  
  QNode.prototype.subdivide = function Qnode_subdivide() {
    // Subdivides this node into four others.
    // Does not redistribute the children.
    var depth = this.depth + 1;

    var bX = this.bounds.x;
    var bY = this.bounds.y;

    // Floor the values
    var bHalfWidth = (this.bounds.width / 2) | 0;
    var bHalfHeight = (this.bounds.height / 2) | 0;
    var bXMid = bX + bHalfWidth;
    var bYMid = bY + bHalfHeight;
    
    this.nodes = [
      // TOP_LEFT
      new QNode({
        x: bX,
        y: bY,
        width: bHalfWidth, height: bHalfHeight
      }, depth, this.maxDepth, this.maxChildren),
      // TOP_RIGHT
      new QNode({
        x: bXMid,
        y: bY,
        width: bHalfWidth, height: bHalfHeight
      }, depth, this.maxDepth, this.maxChildren),
      // BOTTOM_LEFT
      new QNode({
        x: bX,
        y: bYMid,
        width: bHalfWidth, height: bHalfHeight
      }, depth, this.maxDepth, this.maxChildren),
      // BOTTOM_RIGHT
      new QNode({
        x: bXMid,
        y: bYMid,
        width: bHalfWidth, height: bHalfHeight
      }, depth, this.maxDepth, this.maxChildren)
    ];
  };
  
  ///////////////////////////////
  // Retrieval
  /**
   * Internal retrieval function. Retrieves all elements that intersect item.
   * ar       where we store the output.
   * deduper  a dictionary so we can keep track of duplicates.
   */
  QNode.prototype.retrieve = function QNode_retrieve(item, ar, deduper) {
    if (this.nodes) {
      // Everything should be deduped, that takes place in the leaf node.
      for (var i in this.findIndices(item)) {
        this.nodes[i].retrieve(item, ar, deduper);
      }
      return ar;
    }
    
    // Go through children.
    var childrenLen = this.children.length;
    var itX2 = item.x + item.width;
    var itY2 = item.y + item.height;
    for (var ci = 0; ci < childrenLen; ci++) {
      var c = this.children[ci];
      if (item.x < c.x + c.width &&
          item.y < c.y + c.height &&
          itX2 > c.x && itY2 > c.y &&
          !(c.id in deduper)) {
        deduper[c.id] = true;
        ar.push(c);
      }
    }
    return ar;
  };
  /**
   * A function that iterates through the items in any direction with 
   * complexity O(logN) for each iteration. Should not be called directly, 
   * instead use the QuadTree iteration function.
   */
  QNode.prototype.retrieveIterate =
      function QNode_retrieveIterate(item, sorter, side1, side2, deduper) {
    if (this.nodes) {
      return new NodeIterator(this, item, sorter, side1, side2, deduper);
    }
    
    this.children.sort(sorter);
    // Iterate through children.
    return new LeafIterator(item, this.children, deduper);
  };
  
  ///////////////////////////////
  // Iteration
  // No matter which way you iterate, for a given node, you know that two of
  // the quadrants will be iterated before the other two.
  function NodeIterator(quad, item, sorter, side1, side2, deduper) {
    this.indices = quad.findIndices(item);
    this.quad = quad;
    
    // If only one iterator type is being used at once, these can be shared.
    this.side1 = side1;
    this.side2 = side2;
    this.item = item;
    this.sorter = sorter;
    this.deduper = deduper;
    
    // Start with the first side, then move to the second
    this.didSide2 = false;
    // Build sub-iterators for the first side's two quandrants.
    this.buildIterators(this.side1);
    // Initialize the iterators to null
    this.lastIt0 = null;
    this.lastIt1 = null;
  }
  NodeIterator.prototype.buildIterators =
      function NodeIterator_buildIterators(side) {
    // Build sub-iterators for two of the four quandrants. s indicates which 2.
    this.it0 = this.indices[side[0]] ?
      this.quad.nodes[side[0]].retrieveIterate(this.item, this.sorter,
        this.side1, this.side2, this.deduper) : null;
    this.it1 = this.indices[side[1]] ?
      this.quad.nodes[side[1]].retrieveIterate(this.item, this.sorter,
        this.side1, this.side2, this.deduper) : null;
  };
  NodeIterator.prototype.next = function NodeIterator_next() {
    // Get the first item of the two iterators.
    if (this.it0 && !this.lastIt0) {
      this.lastIt0 = this.it0.next();
    }
    if (this.it1 && !this.lastIt1) {
      this.lastIt1 = this.it1.next();
    }
    
    var out;
    if (this.lastIt0 && this.lastIt1) {
      // There are elements in both iterators, return the first.
      if (this.sorter(this.lastIt0, this.lastIt1) <= 0) {
        out = this.lastIt0;
        this.lastIt0 = null;
      } else {
        out = this.lastIt1;
        this.lastIt1 = null;
      }
      return out;
    } else if (this.lastIt0) {
      out = this.lastIt0;
      this.lastIt0 = null;
      return out;
    } else if (this.lastIt1) {
      out = this.lastIt1;
      this.lastIt1 = null;
      return out;
    }
    // There are no more items left for the two iterators.
    // Get the iterator for the other side if we have another side.
    if (!this.didSide2) {
      // Build sub-iterators for the second side's two quandrants.
      this.buildIterators(this.side2);
      this.didSide2 = true;
      return this.next();
    }
    
    // Nothing else to iterate.
    return null;
  };
  NodeIterator.prototype.debugPrint =
      function NodeIterator_debugPrint(depth) {
    if (depth === undefined) {
      depth = 0;
    }
    var spaces = new Array(depth + 2).join(' ');
    console.log(spaces + 'Node Iterator depth ' + depth + ': ' +
                (this.it0 ? 'with it0 ' : '') +
                (this.it1 ? 'with it1 ' : ''));
    console.log(spaces + '-> ' + this.side1 + ' | ' + this.side2);
    if (this.it0) {
      this.it0.debugPrint(depth + 1);
    }
    if (this.it1) {
      this.it1.debugPrint(depth + 1);
    }
  };
  function LeafIterator(item, children, deduper) {
    this.children = children;
    this.childrenLen = children.length;
    this.itX1 = item.x;
    this.itY1 = item.y;
    this.itX2 = item.x + item.width;
    this.itY2 = item.y + item.height;
    this.ci = 0;
    this.deduper = deduper;
    return this;
  }
  LeafIterator.prototype.next = function LeafIterator_next() {
    // Return the iterator that goes through all children.
    while (this.ci < this.childrenLen) {
      var c = this.children[this.ci];
      this.ci++;
      if (this.itX1 < c.x + c.width &&
          this.itY1 < c.y + c.height &&
          this.itX2 > c.x && this.itY2 > c.y &&
          !(c.id in this.deduper)) {
        this.deduper[c.id] = true;
        return c;
      }
    }
    return null;
  };
  
  LeafIterator.prototype.debugPrint =
      function LeafIterator_debugPrint(depth) {
    if (depth === undefined) {
      depth = 0;
    }
    var spaces = new Array(depth).join(' ');
    console.log(spaces + 'LeafIterator depth ' + depth + ': ' +
                this.children.length + ' items');
  };
  
  return QuadTree;
})();
