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

import {
  ImageKind, OPS, Util
} from '../shared/util';

var QueueOptimizer = (function QueueOptimizerClosure() {
  function addState(parentState, pattern, fn) {
    var state = parentState;
    for (var i = 0, ii = pattern.length - 1; i < ii; i++) {
      var item = pattern[i];
      state = (state[item] || (state[item] = []));
    }
    state[pattern[pattern.length - 1]] = fn;
  }

  function handlePaintSolidColorImageMask(iFirstSave, count, fnArray,
                                          argsArray) {
    // Handles special case of mainly LaTeX documents which use image masks to
    // draw lines with the current fill style.
    // 'count' groups of (save, transform, paintImageMaskXObject, restore)+
    // have been found at iFirstSave.
    var iFirstPIMXO = iFirstSave + 2;
    for (var i = 0; i < count; i++) {
      var arg = argsArray[iFirstPIMXO + 4 * i];
      var imageMask = arg.length === 1 && arg[0];
      if (imageMask && imageMask.width === 1 && imageMask.height === 1 &&
          (!imageMask.data.length ||
           (imageMask.data.length === 1 && imageMask.data[0] === 0))) {
        fnArray[iFirstPIMXO + 4 * i] = OPS.paintSolidColorImageMask;
        continue;
      }
      break;
    }
    return count - i;
  }

  var InitialState = [];

  // This replaces (save, transform, paintInlineImageXObject, restore)+
  // sequences with one |paintInlineImageXObjectGroup| operation.
  addState(InitialState,
    [OPS.save, OPS.transform, OPS.paintInlineImageXObject, OPS.restore],
    function foundInlineImageGroup(context) {
      var MIN_IMAGES_IN_INLINE_IMAGES_BLOCK = 10;
      var MAX_IMAGES_IN_INLINE_IMAGES_BLOCK = 200;
      var MAX_WIDTH = 1000;
      var IMAGE_PADDING = 1;

      var fnArray = context.fnArray, argsArray = context.argsArray;
      var curr = context.iCurr;
      var iFirstSave = curr - 3;
      var iFirstTransform = curr - 2;
      var iFirstPIIXO = curr - 1;

      // Look for the quartets.
      var i = iFirstSave + 4;
      var ii = fnArray.length;
      while (i + 3 < ii) {
        if (fnArray[i] !== OPS.save ||
            fnArray[i + 1] !== OPS.transform ||
            fnArray[i + 2] !== OPS.paintInlineImageXObject ||
            fnArray[i + 3] !== OPS.restore) {
          break;    // ops don't match
        }
        i += 4;
      }

      // At this point, i is the index of the first op past the last valid
      // quartet.
      var count = Math.min((i - iFirstSave) / 4,
                           MAX_IMAGES_IN_INLINE_IMAGES_BLOCK);
      if (count < MIN_IMAGES_IN_INLINE_IMAGES_BLOCK) {
        return i;
      }

      // assuming that heights of those image is too small (~1 pixel)
      // packing as much as possible by lines
      var maxX = 0;
      var map = [], maxLineHeight = 0;
      var currentX = IMAGE_PADDING, currentY = IMAGE_PADDING;
      var q;
      for (q = 0; q < count; q++) {
        var transform = argsArray[iFirstTransform + (q << 2)];
        var img = argsArray[iFirstPIIXO + (q << 2)][0];
        if (currentX + img.width > MAX_WIDTH) {
          // starting new line
          maxX = Math.max(maxX, currentX);
          currentY += maxLineHeight + 2 * IMAGE_PADDING;
          currentX = 0;
          maxLineHeight = 0;
        }
        map.push({
          transform,
          x: currentX, y: currentY,
          w: img.width, h: img.height,
        });
        currentX += img.width + 2 * IMAGE_PADDING;
        maxLineHeight = Math.max(maxLineHeight, img.height);
      }
      var imgWidth = Math.max(maxX, currentX) + IMAGE_PADDING;
      var imgHeight = currentY + maxLineHeight + IMAGE_PADDING;
      var imgData = new Uint8Array(imgWidth * imgHeight * 4);
      var imgRowSize = imgWidth << 2;
      for (q = 0; q < count; q++) {
        var data = argsArray[iFirstPIIXO + (q << 2)][0].data;
        // Copy image by lines and extends pixels into padding.
        var rowSize = map[q].w << 2;
        var dataOffset = 0;
        var offset = (map[q].x + map[q].y * imgWidth) << 2;
        imgData.set(data.subarray(0, rowSize), offset - imgRowSize);
        for (var k = 0, kk = map[q].h; k < kk; k++) {
          imgData.set(data.subarray(dataOffset, dataOffset + rowSize), offset);
          dataOffset += rowSize;
          offset += imgRowSize;
        }
        imgData.set(data.subarray(dataOffset - rowSize, dataOffset), offset);
        while (offset >= 0) {
          data[offset - 4] = data[offset];
          data[offset - 3] = data[offset + 1];
          data[offset - 2] = data[offset + 2];
          data[offset - 1] = data[offset + 3];
          data[offset + rowSize] = data[offset + rowSize - 4];
          data[offset + rowSize + 1] = data[offset + rowSize - 3];
          data[offset + rowSize + 2] = data[offset + rowSize - 2];
          data[offset + rowSize + 3] = data[offset + rowSize - 1];
          offset -= imgRowSize;
        }
      }

      // Replace queue items.
      fnArray.splice(iFirstSave, count * 4, OPS.paintInlineImageXObjectGroup);
      argsArray.splice(iFirstSave, count * 4,
        [{ width: imgWidth, height: imgHeight, kind: ImageKind.RGBA_32BPP,
           data: imgData, }, map]);

      return iFirstSave + 1;
    });

  // This replaces (save, transform, paintImageMaskXObject, restore)+
  // sequences with one |paintImageMaskXObjectGroup| or one
  // |paintImageMaskXObjectRepeat| operation.
  addState(InitialState,
    [OPS.save, OPS.transform, OPS.paintImageMaskXObject, OPS.restore],
    function foundImageMaskGroup(context) {
      var MIN_IMAGES_IN_MASKS_BLOCK = 10;
      var MAX_IMAGES_IN_MASKS_BLOCK = 100;
      var MAX_SAME_IMAGES_IN_MASKS_BLOCK = 1000;

      var fnArray = context.fnArray, argsArray = context.argsArray;
      var curr = context.iCurr;
      var iFirstSave = curr - 3;
      var iFirstTransform = curr - 2;
      var iFirstPIMXO = curr - 1;

      // Look for the quartets.
      var i = iFirstSave + 4;
      var ii = fnArray.length;
      while (i + 3 < ii) {
        if (fnArray[i] !== OPS.save ||
            fnArray[i + 1] !== OPS.transform ||
            fnArray[i + 2] !== OPS.paintImageMaskXObject ||
            fnArray[i + 3] !== OPS.restore) {
          break;    // ops don't match
        }
        i += 4;
      }

      // At this point, i is the index of the first op past the last valid
      // quartet.
      var count = (i - iFirstSave) / 4;
      count = handlePaintSolidColorImageMask(iFirstSave, count, fnArray,
                                             argsArray);
      if (count < MIN_IMAGES_IN_MASKS_BLOCK) {
        return i;
      }

      var q;
      var isSameImage = false;
      var iTransform, transformArgs;
      var firstPIMXOArg0 = argsArray[iFirstPIMXO][0];
      if (argsArray[iFirstTransform][1] === 0 &&
          argsArray[iFirstTransform][2] === 0) {
        isSameImage = true;
        var firstTransformArg0 = argsArray[iFirstTransform][0];
        var firstTransformArg3 = argsArray[iFirstTransform][3];
        iTransform = iFirstTransform + 4;
        var iPIMXO = iFirstPIMXO + 4;
        for (q = 1; q < count; q++, iTransform += 4, iPIMXO += 4) {
          transformArgs = argsArray[iTransform];
          if (argsArray[iPIMXO][0] !== firstPIMXOArg0 ||
              transformArgs[0] !== firstTransformArg0 ||
              transformArgs[1] !== 0 ||
              transformArgs[2] !== 0 ||
              transformArgs[3] !== firstTransformArg3) {
            if (q < MIN_IMAGES_IN_MASKS_BLOCK) {
              isSameImage = false;
            } else {
              count = q;
            }
            break; // different image or transform
          }
        }
      }

      if (isSameImage) {
        count = Math.min(count, MAX_SAME_IMAGES_IN_MASKS_BLOCK);
        var positions = new Float32Array(count * 2);
        iTransform = iFirstTransform;
        for (q = 0; q < count; q++, iTransform += 4) {
          transformArgs = argsArray[iTransform];
          positions[(q << 1)] = transformArgs[4];
          positions[(q << 1) + 1] = transformArgs[5];
        }

        // Replace queue items.
        fnArray.splice(iFirstSave, count * 4, OPS.paintImageMaskXObjectRepeat);
        argsArray.splice(iFirstSave, count * 4,
          [firstPIMXOArg0, firstTransformArg0, firstTransformArg3, positions]);
      } else {
        count = Math.min(count, MAX_IMAGES_IN_MASKS_BLOCK);
        var images = [];
        for (q = 0; q < count; q++) {
          transformArgs = argsArray[iFirstTransform + (q << 2)];
          var maskParams = argsArray[iFirstPIMXO + (q << 2)][0];
          images.push({ data: maskParams.data, width: maskParams.width,
                        height: maskParams.height,
                        transform: transformArgs, });
        }

        // Replace queue items.
        fnArray.splice(iFirstSave, count * 4, OPS.paintImageMaskXObjectGroup);
        argsArray.splice(iFirstSave, count * 4, [images]);
      }

      return iFirstSave + 1;
    });

  // This replaces (save, transform, paintImageXObject, restore)+ sequences
  // with one paintImageXObjectRepeat operation, if the |transform| and
  // |paintImageXObjectRepeat| ops are appropriate.
  addState(InitialState,
    [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore],
    function (context) {
      var MIN_IMAGES_IN_BLOCK = 3;
      var MAX_IMAGES_IN_BLOCK = 1000;

      var fnArray = context.fnArray, argsArray = context.argsArray;
      var curr = context.iCurr;
      var iFirstSave = curr - 3;
      var iFirstTransform = curr - 2;
      var iFirstPIXO = curr - 1;
      var iFirstRestore = curr;

      if (argsArray[iFirstTransform][1] !== 0 ||
          argsArray[iFirstTransform][2] !== 0) {
        return iFirstRestore + 1;   // transform has the wrong form
      }

      // Look for the quartets.
      var firstPIXOArg0 = argsArray[iFirstPIXO][0];
      var firstTransformArg0 = argsArray[iFirstTransform][0];
      var firstTransformArg3 = argsArray[iFirstTransform][3];
      var i = iFirstSave + 4;
      var ii = fnArray.length;
      while (i + 3 < ii) {
        if (fnArray[i] !== OPS.save ||
            fnArray[i + 1] !== OPS.transform ||
            fnArray[i + 2] !== OPS.paintImageXObject ||
            fnArray[i + 3] !== OPS.restore) {
          break;    // ops don't match
        }
        if (argsArray[i + 1][0] !== firstTransformArg0 ||
            argsArray[i + 1][1] !== 0 ||
            argsArray[i + 1][2] !== 0 ||
            argsArray[i + 1][3] !== firstTransformArg3) {
          break;    // transforms don't match
        }
        if (argsArray[i + 2][0] !== firstPIXOArg0) {
          break;    // images don't match
        }
        i += 4;
      }

      // At this point, i is the index of the first op past the last valid
      // quartet.
      var count = Math.min((i - iFirstSave) / 4, MAX_IMAGES_IN_BLOCK);
      if (count < MIN_IMAGES_IN_BLOCK) {
        return i;
      }

      // Extract the (x,y) positions from all of the matching transforms.
      var positions = new Float32Array(count * 2);
      var iTransform = iFirstTransform;
      for (var q = 0; q < count; q++, iTransform += 4) {
        var transformArgs = argsArray[iTransform];
        positions[(q << 1)] = transformArgs[4];
        positions[(q << 1) + 1] = transformArgs[5];
      }

      // Replace queue items.
      var args = [firstPIXOArg0, firstTransformArg0, firstTransformArg3,
                  positions];
      fnArray.splice(iFirstSave, count * 4, OPS.paintImageXObjectRepeat);
      argsArray.splice(iFirstSave, count * 4, args);

      return iFirstSave + 1;
    });

  // This replaces (beginText, setFont, setTextMatrix, showText, endText)+
  // sequences with (beginText, setFont, (setTextMatrix, showText)+, endText)+
  // sequences, if the font for each one is the same.
  addState(InitialState,
    [OPS.beginText, OPS.setFont, OPS.setTextMatrix, OPS.showText, OPS.endText],
    function (context) {
      var MIN_CHARS_IN_BLOCK = 3;
      var MAX_CHARS_IN_BLOCK = 1000;

      var fnArray = context.fnArray, argsArray = context.argsArray;
      var curr = context.iCurr;
      var iFirstBeginText = curr - 4;
      var iFirstSetFont = curr - 3;
      var iFirstSetTextMatrix = curr - 2;
      var iFirstShowText = curr - 1;
      var iFirstEndText = curr;

      // Look for the quintets.
      var firstSetFontArg0 = argsArray[iFirstSetFont][0];
      var firstSetFontArg1 = argsArray[iFirstSetFont][1];
      var i = iFirstBeginText + 5;
      var ii = fnArray.length;
      while (i + 4 < ii) {
        if (fnArray[i] !== OPS.beginText ||
            fnArray[i + 1] !== OPS.setFont ||
            fnArray[i + 2] !== OPS.setTextMatrix ||
            fnArray[i + 3] !== OPS.showText ||
            fnArray[i + 4] !== OPS.endText) {
          break;    // ops don't match
        }
        if (argsArray[i + 1][0] !== firstSetFontArg0 ||
            argsArray[i + 1][1] !== firstSetFontArg1) {
          break;    // fonts don't match
        }
        i += 5;
      }

      // At this point, i is the index of the first op past the last valid
      // quintet.
      var count = Math.min(((i - iFirstBeginText) / 5), MAX_CHARS_IN_BLOCK);
      if (count < MIN_CHARS_IN_BLOCK) {
        return i;
      }

      // If the preceding quintet is (<something>, setFont, setTextMatrix,
      // showText, endText), include that as well. (E.g. <something> might be
      // |dependency|.)
      var iFirst = iFirstBeginText;
      if (iFirstBeginText >= 4 &&
          fnArray[iFirstBeginText - 4] === fnArray[iFirstSetFont] &&
          fnArray[iFirstBeginText - 3] === fnArray[iFirstSetTextMatrix] &&
          fnArray[iFirstBeginText - 2] === fnArray[iFirstShowText] &&
          fnArray[iFirstBeginText - 1] === fnArray[iFirstEndText] &&
          argsArray[iFirstBeginText - 4][0] === firstSetFontArg0 &&
          argsArray[iFirstBeginText - 4][1] === firstSetFontArg1) {
        count++;
        iFirst -= 5;
      }

      // Remove (endText, beginText, setFont) trios.
      var iEndText = iFirst + 4;
      for (var q = 1; q < count; q++) {
        fnArray.splice(iEndText, 3);
        argsArray.splice(iEndText, 3);
        iEndText += 2;
      }

      return iEndText + 1;
    });

  function QueueOptimizer() {}

  QueueOptimizer.prototype = {
    optimize: function QueueOptimizer_optimize(queue) {
      var fnArray = queue.fnArray, argsArray = queue.argsArray;
      var context = {
        iCurr: 0,
        fnArray,
        argsArray,
      };
      var state;
      var i = 0, ii = fnArray.length;
      while (i < ii) {
        state = (state || InitialState)[fnArray[i]];
        if (typeof state === 'function') { // we found some handler
          context.iCurr = i;
          // state() returns the index of the first non-matching op (if we
          // didn't match) or the first op past the modified ops (if we did
          // match and replace).
          i = state(context);
          state = undefined;    // reset the state machine
          ii = context.fnArray.length;
        } else {
          i++;
        }
      }
    },
  };
  return QueueOptimizer;
})();

var OperatorList = (function OperatorListClosure() {
  var CHUNK_SIZE = 1000;
  var CHUNK_SIZE_ABOUT = CHUNK_SIZE - 5; // close to chunk size

  function getTransfers(queue) {
    var transfers = [];
    var fnArray = queue.fnArray, argsArray = queue.argsArray;
    for (var i = 0, ii = queue.length; i < ii; i++) {
      switch (fnArray[i]) {
        case OPS.paintInlineImageXObject:
        case OPS.paintInlineImageXObjectGroup:
        case OPS.paintImageMaskXObject:
          var arg = argsArray[i][0]; // first param in imgData
          if (!arg.cached) {
            transfers.push(arg.data.buffer);
          }
          break;
      }
    }
    return transfers;
  }

  function OperatorList(intent, messageHandler, pageIndex) {
    this.messageHandler = messageHandler;
    this.fnArray = [];
    this.argsArray = [];
    this.dependencies = Object.create(null);
    this._totalLength = 0;
    this.pageIndex = pageIndex;
    this.intent = intent;
  }

  OperatorList.prototype = {
    get length() {
      return this.argsArray.length;
    },

    /**
     * @returns {number} The total length of the entire operator list,
     *                   since `this.length === 0` after flushing.
     */
    get totalLength() {
      return (this._totalLength + this.length);
    },

    addOp(fn, args) {
      this.fnArray.push(fn);
      this.argsArray.push(args);
      if (this.messageHandler) {
        if (this.fnArray.length >= CHUNK_SIZE) {
          this.flush();
        } else if (this.fnArray.length >= CHUNK_SIZE_ABOUT &&
                   (fn === OPS.restore || fn === OPS.endText)) {
          // heuristic to flush on boundary of restore or endText
          this.flush();
        }
      }
    },

    addDependency(dependency) {
      if (dependency in this.dependencies) {
        return;
      }
      this.dependencies[dependency] = true;
      this.addOp(OPS.dependency, [dependency]);
    },

    addDependencies(dependencies) {
      for (var key in dependencies) {
        this.addDependency(key);
      }
    },

    addOpList(opList) {
      Util.extendObj(this.dependencies, opList.dependencies);
      for (var i = 0, ii = opList.length; i < ii; i++) {
        this.addOp(opList.fnArray[i], opList.argsArray[i]);
      }
    },

    getIR() {
      return {
        fnArray: this.fnArray,
        argsArray: this.argsArray,
        length: this.length,
      };
    },

    flush(lastChunk) {
      if (this.intent !== 'oplist') {
        new QueueOptimizer().optimize(this);
      }
      var transfers = getTransfers(this);
      var length = this.length;
      this._totalLength += length;

      this.messageHandler.send('RenderPageChunk', {
        operatorList: {
          fnArray: this.fnArray,
          argsArray: this.argsArray,
          lastChunk,
          length,
        },
        pageIndex: this.pageIndex,
        intent: this.intent,
      }, transfers);
      this.dependencies = Object.create(null);
      this.fnArray.length = 0;
      this.argsArray.length = 0;
    },
  };

  return OperatorList;
})();

export {
  OperatorList,
};
