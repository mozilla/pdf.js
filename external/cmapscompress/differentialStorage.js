/* Copyright 2014 Mozilla Foundation
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

'use strict';

var fs = require('fs');
var path = require('path');
var optimize = require('./optimize.js');
var compress = require('./compress.js');
var writeNumber = compress.writeNumber;
var writeString = compress.writeString;
var padLeft = compress.padLeft;
var padRight = compress.padRight;
var BinaryCMapReader = compress.BinaryCMapReader;
try {
  var difflib = require('difflib');
} catch (e) {
  console.log('\ndifflib is not installed -- ' +
              'to intall, run "npm install difflib"');
  process.exit(0);
}

function readFile(srcPath, filename) {
  var content = fs.readFileSync(srcPath + '/' + filename, {encoding: 'hex'});
  return content;
}

function readHexFileAsBytes(srcPath, filename) {
  var hexContent = readFile(srcPath, filename);
  var byteContent = hexToByteArray(hexContent);
  return byteContent;
}

function hexToByteArray(content) {
  var bytesAsArray = [];
  for (var i = 0; i < content.length; i += 2) {
    var hexByte = content.substring(i, i+2);
    var intByte = parseInt(hexByte, 16);
    bytesAsArray.push(intByte);
  }
  return bytesAsArray;
}

function hexify(arr) {
  return arr.map(function(e) {
    var hex = e.toString(16);
    if (hex.length === 1) {
      hex = '0' + hex;
    }
    return hex;
  });
}

function addInsertCommand(patch, arg) {
  // If last command was insert, just append arg to the args.
  // of the previous insert command
  var last = patch[patch.length - 1];
  if (last && last.cmd === 'insert') {
    last.arg = last.arg.concat(arg);
  } else {
    patch.push({
      cmd: 'insert',
      arg: arg
    });
  }
}

function addCopyCommand(patch, arg) {
  // If the last command was copy, add empty insert command
  // to assure that copy and insert are always alternating.
  var last = patch[patch.length - 1];
  if (last && last.cmd === 'copy') {
    addInsertCommand(patch, []);
  }
  patch.push({
    cmd: 'copy',
    arg: arg
  });
}

// Generate a patch that turns baseFile into newFile.
// This is the part that is very slow.
function generatePatch(baseFile, newFile) {
  var matcher = new difflib.SequenceMatcher(null, baseFile, newFile, false);
  var opcodes = matcher.getOpcodes();
  return generatePatchFromOpCodes(baseFile, newFile, opcodes);
}


// Generate a patch that turns fileI into fileJ.
function generatePatchFromOpCodes(fileI, fileJ, opcodes) {
  var patch = [];
  var previousEnd = 0;
  for (var i = 0; i < opcodes.length; i++) {
    var opcode = opcodes[i];
    var cmd = opcode[0];
    var i1 = opcode[1];
    var i2 = opcode[2];
    var j1 = opcode[3];
    var j2 = opcode[4];
    switch (cmd) {
      case 'delete':
        break;
      case 'replace':
      case 'insert':
        addInsertCommand(patch, fileJ.slice(j1, j2));
        break;
      case 'equal':
        var start = i1;
        var startOffset = start - previousEnd;
        var length = i2 - i1;
        if (length === 1) {
          addInsertCommand(patch, [fileI[start]]);
        } else if (length === 2) {
          addInsertCommand(patch, [fileI[start], fileI[start + 1]]);
        } else {
          addCopyCommand(patch, [startOffset, length]);
          previousEnd = start + length;
        }
        break;
      default:
        throw 'unknown opcode';
    }
  }

  // make sure that first command is 'copy'
  if (patch.length > 0 && patch[0].cmd !== 'copy') {
    patch.unshift({
      cmd: 'copy',
      arg: [0, 0]
    });
  }

  return patch;
}


function decodeDifferenceData(diffData, path) {
  var diffStream = new BinaryCMapReader(diffData);

  var baseFileName = diffStream.readString();
  if (baseFileName === '') { // no dependency
    return diffData.slice(diffStream.pos, diffData.length);
  }
  var baseDiffData = readFile(path, baseFileName + '.bcmap');
  var baseData = decodeDifferenceData(baseDiffData, path);
  var decoded = applyPatch(baseData, diffStream);

  return decoded;
}

function applyPatch(base, diffStream) {
  var data = '';
  var pos = 0;
  var copyCommand = true;
  var start, startOffset, length, subarray;
  var previousEnd = 0;
  while (diffStream.pos + 1 < diffStream.end) {
    if (copyCommand) {
      startOffset = diffStream.readNumber();
      start = previousEnd + startOffset;
      length = diffStream.readNumber();
      subarray = base.slice(start << 1, (start + length) << 1);
      data += subarray;
      pos += length;
      previousEnd = start + length;
    } else { // insert
      length = diffStream.readNumber();
      subarray = diffStream.buffer.slice(diffStream.pos,
                                         diffStream.pos + (length << 1));
      diffStream.pos += length << 1;
      data += subarray;
      pos += length;
    }
    copyCommand = !copyCommand; // switch between copy and insert
  }
  return data;
}


function patchToHexString(patch, baseFileName) {
  var str = writeString(baseFileName.replace('.bcmap', ''));
  for (var i = 0; i < patch.length; i++) {
    var arg = patch[i].arg;
    if (i % 2 === 0) { // copy commands are at even positions
      str += writeNumber(arg[0]) + writeNumber(arg[1]);
    } else { // insert commands are at odd positions
      str += writeNumber(arg.length);
      str += hexify(arg).join('');
    }
  }
  return str;
}

function limitLength(str, maxLength) {
  return str.length > maxLength ? str.slice(0, maxLength - 3) + '...' : str;
}

function writePatches(srcPath, destPath, filenames, dependencies, verify) {
  var totalInBytes = 0;
  var totalOutBytes = 0;
  var dependency = dependencies.dependencies;
  var ordering = dependencies.ordering;
  for (var k = 0; k < filenames.length; k++) {
    var i = ordering[k];
    var filename = filenames[i];
    var hexContent = readFile(srcPath, filename);
    var file = hexToByteArray(hexContent);
    var fileSize = file.length;
    var j = dependency[i];
    var destFile = destPath + '/' + filename;

    var isBaseFile = j < 0;
    var out;
    if (isBaseFile) {
      out = writeString('') + hexContent;
    } else {
      var baseFileName = filenames[j];
      var baseFile = readHexFileAsBytes(srcPath, baseFileName);
      var patch = generatePatch(baseFile, file);
      out = patchToHexString(patch, baseFileName);
    }

    var outBytes = out.length >> 1;
    totalOutBytes += outBytes;
    totalInBytes += fileSize;
    var paddedFilename = padRight(filename.slice(0, -6), 25);
    var percent = (100 * outBytes / fileSize).toFixed(1);
    console.log(padLeft(i, 3) + ':  ' + paddedFilename + '   ' +
                padLeft(outBytes, 7) + ' /' + padLeft(fileSize, 8) +
                padLeft('(' + percent + '%)', 11) + '  --->  ' +
                (isBaseFile ? '' : baseFileName.slice(0, -6)));

    fs.writeFileSync(destFile, new Buffer(out, 'hex'));

    if (verify) {
      var decoded = decodeDifferenceData(out, destPath);
      var hexContentStr = JSON.stringify(hexContent);
      var decodedStr = JSON.stringify(decoded);
      var isGood = (hexContentStr === decodedStr);
      if (!isGood) {
        var origLen = 'original (' + (hexContent.length >> 1) + ' bytes): ';
        var decodedLen = 'decoded  (' + (decoded.length >> 1) + ' bytes): ';
        console.log(padRight(origLen, 20) + limitLength(hexContentStr, 100));
        console.log(padRight(decodedLen, 20) + limitLength(decodedStr, 100));
        throw new Error('Reconstructed differential data differs from ' +
                        'original');
      }
    }
  }

  var totalPercent = '(' + (100 * totalOutBytes / totalInBytes).toFixed(1) +
                     '%)';
  console.log('--------------------------------------------------------------');
  console.log('TOTAL: ' +
              padLeft(totalOutBytes, 34) + ' /' + padLeft(totalInBytes, 8) +
              padLeft(totalPercent, 11));
}


function computeSavings(srcPath, filenames, savingsFilePath) {
  var numFiles = filenames.length;

  // savings[i][j] = fileSizeJ minus size of patch from i to j,
  // ie, the number of bytes that are saved when using the patch.
  var savings;

  // try to load savings matrix from disk
  try {
    var count = 0;
    var savingsFileContents = fs.readFileSync(savingsFilePath);
    savings = JSON.parse(savingsFileContents);
    if (savings) {
      for (var i = 0; i < numFiles; i++) {
        for (var j = 0; j < numFiles; j++) {
          if (savings[i][j] >= 0) {
            count++;
          }
        }
      }
      console.log('Restored ' + count + ' of ' + (numFiles * numFiles) +
                  ' entries from ' + savingsFilePath + '.');
      if (count === numFiles * numFiles) {
        return savings;
      }
    }
  } catch (e) {
    console.log('No savings file found, computing file diffs from scratch.' +
                ' This may take hours.');

    // initialize matrix with -1.
    savings = [];
    for (var i = 0; i < numFiles; i++) {
      savings[i] = [];
      for (var j = 0; j < numFiles; j++) {
        savings[i][j] = -1;
      }
      savings[i][i] = 0;
    }
  }

  // prepare console output
  var totalTicks = (numFiles * numFiles - numFiles);
  var numTicksToDisplay = Math.min(80, totalTicks);
  var tickEvery = (totalTicks / numTicksToDisplay) | 0;
  numTicksToDisplay = Math.ceil(totalTicks / tickEvery);
  var tick = 0;
  console.log('.' + padLeft(numTicksToDisplay, ' ') + '.');
  process.stdout.write(' '); // log without newline

  // generate patches and compute sizes
  for (var i = 0; i < numFiles; i++) {
    var filenameI = filenames[i];
    var fileI = readHexFileAsBytes(srcPath, filenameI);
    // Savings are almost symmetric, difference is usually below 0.3%,
    // so we could also run up to i. But let's be precise :-].
    for (var j = 0; j < numFiles ; j++) {
      if (j === i) {
        savings[i][j] = 0;
        continue;
      }
      tick++;
      if ((tick + (tickEvery >> 1)) % tickEvery === 0) {
        process.stdout.write('°'); // log without newline
      }
      if (!forceComputation && savings[i][j] >= 0) {
        continue;
      }
      var filenameJ = filenames[j];
      var fileJ = readHexFileAsBytes(srcPath, filenameJ);
      var sizeJ = fileJ.length + (writeString('').length >> 1);
      var patchJ = generatePatch(fileI, fileJ);
      var patchSizeJ = patchToHexString(patchJ, filenameI).length >> 1;
      // negative values are reserved for undefined values in savings file
      savings[i][j] = Math.max(0, sizeJ - patchSizeJ);
    }
  }
  console.log('');

  // save matrix to disk
  try {
    var numEntries = 0;
    for (var i = 0; i < numFiles; i++) {
      for (var j = 0; j < numFiles; j++) {
        if (savings[i][j] >= 0) {
          numEntries++;
        }
      }
    }
    var savingsToStore = JSON.stringify(savings);
    fs.writeFileSync(savingsFilePath, new Buffer(savingsToStore, 'ascii'));
    console.log('Saved ' + numEntries + ' of ' + (numFiles * numFiles) +
                ' entries to ' + savingsFilePath + '.');
  } catch (e) {
    console.log('Could not save savings file: ' + e);
  }
  return savings;
}

function Tree(edges, roots, savings, fileSizes, overheadFunction, parent) {
  this.savings = savings;
  this.fileSizes = fileSizes;
  this.overheadFunction = overheadFunction;
  this.numberOfNodes = savings.length;
  this.roots = roots;
  this.edges = edges;
  this.parent = parent;
  this.metrics = null;
}

Tree.prototype = {
  removeEdgesWithTooMuchOverheadPerSavedByte: 
    function(MAX_OVERHEAD_PER_SAVED_BYTE) {
    var hasImproved = true;
    while (hasImproved) {
      hasImproved = false;
      // Loop through all tree components until an improvement is found.
      for (var i = 0; !hasImproved && i < this.roots.length; i++) {
        var root = this.findBestRootInComponent(this.roots[i]);
        var currentComponent = this.orientEdgesAwayFromRoot([root]);
        var currentEdges = currentComponent.edges;
        var overheadWithEdge = currentComponent.computeOverhead();
        var savingsWithEdge = currentComponent.getTotalSavings();
        var costWithEdge = MAX_OVERHEAD_PER_SAVED_BYTE * overheadWithEdge -
                           savingsWithEdge;

        // Loop though all edges and check if metrics improve when removing
        // that edge. Break if an improvement is found
        for (var j = 0; !hasImproved && j < currentEdges.length; j++) {
          // remove j-th edge 
          var removedEdge = currentEdges.splice(j, 1)[0];
          var s = removedEdge[0];
          var t = removedEdge[1];
          // current component is split in two, find best root in each component
          var bestRootS = currentComponent.findBestRootInComponent(s);
          var bestRootT = currentComponent.findBestRootInComponent(t);
          // orient the edges in the two-componented tree
          var splitTree = currentComponent.orientEdgesAwayFromRoot([bestRootS, 
                                                                    bestRootT]);

          var savingsWithoutEdge = savingsWithEdge - this.savings[s][t];
          var overheadWithoutEdge = splitTree.computeOverhead();
          var costWithoutEdge = MAX_OVERHEAD_PER_SAVED_BYTE *
                                overheadWithoutEdge - savingsWithoutEdge;
          if (costWithoutEdge < costWithEdge) {
            this.roots.splice(i, 1);
            this.roots.push(bestRootS);
            this.roots.push(bestRootT);
            this.removeEdgeWithNodes(s, t); // permanently remove edge
            hasImproved = true;
          }
          // re-insert the j-th edge if its removal didn't help
          currentEdges.splice(j, 0, removedEdge);
        }
      }
    }
  },
  
  // Create a new OrientedTree whose oriented edges point away from the roots
  // (ie, first argument has smaller distance to root).
  // The orientation is found via breadth first search.
  orientEdgesAwayFromRoot: function Tree_orientEdgesAwayFromRoot(roots) {
    var orientedEdges = [];
    var parent = [];
    var roots = roots;

    for (var i = 0; i < this.numberOfNodes; i++) {
      parent[i] = -1;
    }
    
    var queue = roots.slice(0, roots.length);
    var isSelected = [];
    for (var i = 0; i < queue.length; i++) {
      isSelected[queue[i]] = true;
    }
    while (queue.length > 0) {
      var currentNode = queue.pop();
      // add all neighbors of v to queue
      for (var i = 0; i < this.edges.length; i++) {
        var currentEdge = this.edges[i];
        var startNode = currentEdge[0];
        var endNode = currentEdge[1];
        if (startNode === currentNode && !isSelected[endNode]) {
          // edge has correct orientation, push it to list of edges
          orientedEdges.push(currentEdge);
          queue.push(endNode);
          isSelected[endNode] = true;
        } else if (endNode === currentNode && !isSelected[startNode]) {
          // push reversed edge
          orientedEdges.push([endNode, startNode]);
          queue.push(startNode);
          isSelected[startNode] = true;
        }
        parent[endNode] = startNode;
      }
    }
    var orientedTree = new Tree(orientedEdges, roots, this.savings,
                                this.fileSizes, this.overheadFunction, parent);
    return orientedTree;
  },
  
  computeMetrics: function Tree_computeMetrics() {
    var numberOfNodes = this.numberOfNodes;
    var distanceFromRoot = [];
    var sizeOfOverhead = [];
    var rootOfNode = [];
    var nodesAtRoot = [];
  
    // initalize vars
    for (var i = 0; i < numberOfNodes; i++) {
      distanceFromRoot[i] = -1;
      sizeOfOverhead[i] = -1;
      rootOfNode[i] = -1;
    }
    for (var i = 0; i < this.roots.length; i++) {
      var root = this.roots[i];
      distanceFromRoot[root] = 0;
      sizeOfOverhead[root] = 0;
      nodesAtRoot[root] = [root];
      rootOfNode[root] = root;
    }
  
    // loop through tree, from root to children
    var newNodes = true;
    var currentDistanceFromRoot = 0;
    while (newNodes) {
      newNodes = false;
      for (var i = 0; i < this.edges.length; i++) {
        var edge = this.edges[i];
        var startNode = edge[0];
        var endNode = edge[1];
        if (distanceFromRoot[startNode] === currentDistanceFromRoot &&
            distanceFromRoot[endNode] === -1) {
          newNodes = true;
          distanceFromRoot[endNode] = distanceFromRoot[startNode] + 1;
          sizeOfOverhead[endNode] = sizeOfOverhead[startNode] +
          this.fileSizes[startNode] -
          this.savings[startNode][endNode];
          rootOfNode[endNode] = rootOfNode[startNode];
          nodesAtRoot[rootOfNode[endNode]].push(endNode);
        }
      }
      currentDistanceFromRoot++;
    }
    // loop through nodes, compute statistics
    var totalDistanceFromRoot = 0;
    var totalSizeOfOverhead = 0;
    var totalSize = 0;
    var numberOfNodesInThisTree = 0;
    var totalSavings = 0;
    for (var i = 0; i < numberOfNodes; i++) {
      if (rootOfNode[i] >= 0) {
        numberOfNodesInThisTree++;
        totalSizeOfOverhead += sizeOfOverhead[i];
        totalDistanceFromRoot += distanceFromRoot[i];
        totalSize += this.fileSizes[i];
        var parentNode = this.parent[i];
        if (parentNode > 0) {
          totalSavings += this.savings[parentNode][i];
        }
      }
    }
  
    var metrics = {
        // number of edges between a node i and root
        distanceFromRoot: distanceFromRoot,
        // sizeOfOverhead[i] is the number of overhead bytes to load, that is,
        // fileSize[i] + sizeOfOverhead[i] is the number 
        // of bytes read to decode file i
        sizeOfOverhead: sizeOfOverhead,
        // nodesAtRoot[i]: list of nodes that have i as root
        nodesAtRoot: nodesAtRoot,
        totalSize: totalSize,
        totalSavings: totalSavings,
        totalSizeOfOverhead: totalSizeOfOverhead,
        totalDistanceFromRoot: totalDistanceFromRoot,
        numberOfNodesInThisTree: numberOfNodesInThisTree
    };
    return this.metrics = metrics;
  },
  
  getDistanceFromRoot: function Tree_getDistanceFromRoot() {
    return (this.metrics || this.computeMetrics()).distanceFromRoot; 
  },
  
  getSizeOfOverhead: function Tree_getSizeOfOverhead() {
    return (this.metrics || this.computeMetrics()).sizeOfOverhead; 
  },
  
  getNodesAtRoot: function Tree_getNodesAtRoot(root) {
    return (this.metrics || this.computeMetrics()).nodesAtRoot[root]; 
  },
  getTotalSize: function Tree_getTotalSize() {
    return (this.metrics || this.computeMetrics()).totalSize; 
  },
  
  getTotalSavings: function Tree_getTotalSavings() {
    return (this.metrics || this.computeMetrics()).totalSavings; 
  },
  
  getTotalSizeOfOverhead: function Tree_getTotalSizeOfOverhead() {
    return (this.metrics || this.computeMetrics()).totalSizeOfOverhead; 
  },
  
  getTotalDistanceFromRoot: function Tree_getTotalDistanceFromRoot() {
    return (this.metrics || this.computeMetrics()).totalDistanceFromRoot; 
  },
  
  getNumberOfNodesInThisTree: function Tree_getNumberOfNodesInThisTree() {
    return (this.metrics || this.computeMetrics()).numberOfNodesInThisTree; 
  },
  
  findBestRootInComponent: function Tree_findBestRootInComponent(root) {
    var orientedTree = this.orientEdgesAwayFromRoot([root]);
    var nodesInComponent = orientedTree.getNodesAtRoot(root);
    var bestValue = 1 << 30;
    var bestRoot;
    for (var j = 0; j < nodesInComponent.length; j++) {
      var rootJ = nodesInComponent[j];
      var oTreeJ = this.orientEdgesAwayFromRoot([rootJ]);
      var value = oTreeJ.computeOverhead();
      if (value < bestValue) {
        bestRoot = rootJ;
        bestValue = value;
      }
    }
    return bestRoot;
  },
  
  computeOverhead: function Tree_computeOverhead() {
    return this.overheadFunction(this);
  },
  // Dependencies: i-th entry of the dependency array is j, if file j must be
  // decoded 
  getDependencies: function Tree_getDependencies() {
    var dependencies = [];
    for (var i = 0; i < this.numberOfNodes; i++) {
      dependencies[i] = -1;
    }
    for (var i = 0; i < this.edges.length; i++) {
      var e = this.edges[i];
      dependencies[e[1]] = e[0];
    }
    return dependencies;
  },
  
  // TraversalOrder: an ordering so that dependency[i] appears before i
  // (for each i).
  getTraversalOrder: function Tree_getTraversalOrder() {
    var traversalOrder = [];
    var roots = this.roots;
    for (var i = 0; i < roots.length; i++) {
      // nodesAtRoot are already sorted by distance from root 
      var nodesAtRoot = this.getNodesAtRoot(roots[i]);
      traversalOrder = traversalOrder.concat(nodesAtRoot || []);
    }
    return traversalOrder;
  },
  
  removeEdgeWithNodes: function Tree_removeEdgeWithNodes(s, t) {
    var edges = this.edges;
    for (var i = 0; i < edges.length; i++) {
      var edge = edges[i];
      if ((s === edge[0] && t === edge[1]) || 
          (t === edge[0] && s === edge[1])) {
        edges.splice(i, 1);
        break;
      }
    }
  }
};


// Find a maximal spanning tree in the (complete) graph of possible dependencies
function makeMaximalSpanningTree(savings, fileSizes, overheadFunction, 
                                 minSavingsPerDependency) {
  var numberOfNodes = savings.length;
  var isSelected = [true];
  var roots = [0];
  var edges = [];
  
  // loop numNodes-1 times, because each spanning tree has numNodes-1 edges
  for (var k = 0; k < numberOfNodes - 1; k++) {
    // find largest edge between a selected and unselected node.
    var maxSavings = -1;
    var maxI = 0;
    var maxJ = 0;
    for (var i = 0; i < numberOfNodes; i++) {
      if (isSelected[i]) {
        for (var j = 0; j < numberOfNodes; j++) {
          if (!isSelected[j] && savings[i][j] > maxSavings) {
            maxSavings = Math.max(minSavingsPerDependency, savings[i][j]);
            maxI = i;
            maxJ = j;
          }
        }
      }
    }
    // add best edge or start new connected component
    if (maxSavings > minSavingsPerDependency) {
      // use this largest edge if required minimum savings can be achieved
      edges.push([maxI, maxJ]);
    } else {
      // otherwise, increase number of connected components
      roots.push(maxJ);
    }
    isSelected[maxJ] = true;
  }
  return new Tree(edges, roots, savings, fileSizes, overheadFunction);
}


function printStatistics(tree, filenames, originalFileSizes, dependencies) {
  var fileSizes = tree.fileSizes;
  var savings = tree.savings;
  var roots = tree.roots;
  var edges = tree.edges;

  var totNodes = 0;
  var totSize = 0;
  var totDiffedSize = 0;
  var totOverhead = 0;
  var totDependencies = 0;
  var singleNodes = 0;
  var singleSize = 0;
  var singleDiffedSize = 0;
  var singleOverhead = 0;
  var singleDependencies = 0;
  console.log('');
  console.log(' Files | Original | DiffedSize | Overhead | ' +
              'Dependencies | Filenames (starting with base file)');
  console.log('-------|----------|------------|----------|-' +
              '-------------|-------------------------------------');
  for (var i = 0; i < roots.length; i++) {
    var root = roots[i];
    var currentComponent = tree.orientEdgesAwayFromRoot([root]);
    var nodes = currentComponent.getNodesAtRoot(root);
    var out = '';
    var originalSize = 0;
    var diffedSize = 0;
    for (var j = 0; j < nodes.length; j++) {
      var node = nodes[j];
      var name = filenames[node].replace('.bcmap', '');
      var parent = dependencies[node];
      diffedSize += originalFileSizes[node] + (writeString('').length >> 1);
      out += name + ', ';
      originalSize += originalFileSizes[node];
    }
    diffedSize -= currentComponent.getTotalSavings();
    out = limitLength(out.slice(0, -2), 60);
    var numNodes = currentComponent.getNumberOfNodesInThisTree();
    var totalSizeOfOverhead = currentComponent.getTotalSizeOfOverhead();
    var totalDistanceFromRoot = currentComponent.getTotalDistanceFromRoot();
    if (numNodes > 1) {
      var avgDependencies = (totalDistanceFromRoot / numNodes).toFixed(2);
      console.log(padLeft(numNodes, 5) + '  |' +
                  padLeft(originalSize / numNodes | 0, 8) + '  |' +
                  padLeft(diffedSize / numNodes | 0, 9) + '   |' +
                  padLeft(totalSizeOfOverhead / numNodes | 0, 8) + '  |' +
                  padLeft(avgDependencies, 12) + '  | ' + out);
    } else {
      singleNodes += numNodes;
      singleSize += originalSize;
      singleDiffedSize += diffedSize;
      singleOverhead += totalSizeOfOverhead;
    }
    totSize += originalSize;
    totNodes += numNodes;
    totDiffedSize += diffedSize;
    totOverhead += totalSizeOfOverhead;
    totDependencies += totalDistanceFromRoot;
  }
  console.log(padLeft(singleNodes, 5) +  '* |' +
              padLeft(singleSize / singleNodes | 0, 8) + '  |' +
              padLeft(singleDiffedSize / singleNodes | 0, 9)  + '   |' +
              padLeft(singleOverhead / singleNodes | 0, 8)  + '  |' +
              padLeft(singleDependencies / singleNodes | 0, 12) +
              '  | * single files');
  console.log('-------|----------|------------|----------|--------------|');
  console.log(padLeft(totNodes, 5) +  '  |' +
              padLeft(totSize, 8) + '° |' +
              padLeft(totDiffedSize, 9)  + '°  |' +
              padLeft(totOverhead / totNodes | 0, 8)  + '  |' +
              padLeft((totDependencies / totNodes).toFixed(2), 12) +
              '  | ° marked numbers are sums, other values are averages.');
  console.log('');
}


/**
 * Computes a combination of dependencies, so that the file with index i
 * can be stored as a difference patch with respect to the file with index
 * dependencies[i]. This will save 'savings[dependencies[i]][i]' bytes
 * compared to raw storage. Dependencies are built with the following goals:
 *
 * (1) Small file sizes:
 *   The total number of bytes saved should be maximized
 *   (to keep the pdf.js extension small).
 * (2) Small overhead:
 *   Minimize the number of extra bytes that have to be loaded from base files
 *   to reconstruct a particular file (to minimize the amount of data required
 *   to view a single file in the viewer)
 * (3) Small number of dependencies:
 *   Minimize the number of base files to reconstruct a particular file
 *   (To minimize the required number of connections to view a single file in
 *   the viewer)
 *
 * The algorithm works in three stages:
 *   (I) Construct a maximal spaning tree: each edge[i][j] represents that
 *       file j depends on file i, saving 'savings[i][j]' bytes.
 *       Since it's a tree, there is a path from each node to the root,
 *       representing a chain of dependencies that have to be resolved
 *       for each file until the base file is reached, which is stored rawly.
 *       The *maximal* spanning tree property ensures that file size savings
 *       are maximal.
 *  (II) Remove all edges whose overhead outweighs the savings
 *       (as defined in the 'overheadFunction').
 * (III) Now that we have removed some edges, we have several connected
 *       components. In each component, select the best base file that all
 *       other files in this component should depend on (directly or
 *       indirectly).
 *       As this corresponds to just a re-orientation of edges, it
 *       does (almost) not affect the total bytes saved (because savings
 *       are almost symmetric) nor the number total number of dependencies
 *       (because the number of edges remains constant), but it might reduce the
 *       average length of depenedency chains, and so helps goals (2) and (3).
 *
 * @returns {Object} Object that contains
 *   dependencies: An array which contains for each file the index of the
 *                 base file, or -1 if it is a base file itself.
 *   ordering:     An ordering of indices in which the base file index
 *                 ( = dependencies[i]) appears before i (for each i).
 */
function chooseDependencies(savings, srcPath, filenames) {

  /* ****** Parameters ******************************/

  // Do not create dependencies that save less than this many bytes.
  var MIN_SAVINGS_PER_DEPENDENCY = 200;

  // How many average overhead bytes (including file penalty)
  // is allowed to save one byte of total size?
  var MAX_OVERHEAD_PER_SAVED_BYTE = 0.02;

  // Penalty for creating a new dependency.
  // A large penalty will favor short dependency lengths,
  // a small penalty will favor small overhead.
  var FILE_PENALTY = 5000;

  // The objective funtion to minimize when choosing the root
  // in a group of dependent files.
  var overheadFunction = function(tree) {
    var value = tree.getTotalSizeOfOverhead();
    // Add penalty for each file that has to be loaded.
    value += tree.getTotalDistanceFromRoot() * FILE_PENALTY;
    return value;
  };
  /* ***************************************************/

  var fileSizes = [];         // file size including base file header 
  var originalFileSizes = []; // original size of cmap files
  for (var i = 0; i < filenames.length; i++) {
    var fileSize = readFile(srcPath, filenames[i]).length >> 1;
    originalFileSizes[i] = fileSize;
    fileSizes[i] = fileSize + (writeString('').length >> 1);
  }

  var tree = makeMaximalSpanningTree(savings, fileSizes, overheadFunction,
                                     MIN_SAVINGS_PER_DEPENDENCY);


  // Remove all edges whose removal improves
  // MAX_OVERHEAD_PER_SAVED_BYTE * overhead - savings
  tree.removeEdgesWithTooMuchOverheadPerSavedByte(MAX_OVERHEAD_PER_SAVED_BYTE);

  // Select the best root in each connected component
  var bestRoots = tree.roots.map(tree.findBestRootInComponent, tree);
  var bestTree = tree.orientEdgesAwayFromRoot(bestRoots);

  var dependencies = bestTree.getDependencies();
  var ordering = bestTree.getTraversalOrder();
  
  printStatistics(bestTree, filenames, originalFileSizes, dependencies);

  return {
    dependencies: dependencies,
    ordering: ordering
  };
}

exports.generateDifferences = function (srcPath, destPath, verify) {
  var t = Date.now();
  console.log('### Generating diffs');
  var filenames = fs.readdirSync(srcPath);
  filenames = filenames.filter(function (fn) {
    return /\.bcmap/.test(fn); // skipping files with the extension
  });

  var savingsFilePath = srcPath + '/savings.json';
  var savings = computeSavings(srcPath, filenames, savingsFilePath);

  var dependencies = chooseDependencies(savings, srcPath, filenames);
  writePatches(srcPath, destPath, filenames, dependencies, verify);

  console.log(((Date.now() - t) / 1000).toFixed(2) + ' seconds');
};
