/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.OperatorList = void 0;

var _util = require("../shared/util.js");

var QueueOptimizer = function QueueOptimizerClosure() {
  function addState(parentState, pattern, checkFn, iterateFn, processFn) {
    var state = parentState;

    for (var i = 0, ii = pattern.length - 1; i < ii; i++) {
      var item = pattern[i];
      state = state[item] || (state[item] = []);
    }

    state[pattern[pattern.length - 1]] = {
      checkFn,
      iterateFn,
      processFn
    };
  }

  function handlePaintSolidColorImageMask(iFirstSave, count, fnArray, argsArray) {
    var iFirstPIMXO = iFirstSave + 2;

    for (var i = 0; i < count; i++) {
      var arg = argsArray[iFirstPIMXO + 4 * i];
      var imageMask = arg.length === 1 && arg[0];

      if (imageMask && imageMask.width === 1 && imageMask.height === 1 && (!imageMask.data.length || imageMask.data.length === 1 && imageMask.data[0] === 0)) {
        fnArray[iFirstPIMXO + 4 * i] = _util.OPS.paintSolidColorImageMask;
        continue;
      }

      break;
    }

    return count - i;
  }

  var InitialState = [];
  addState(InitialState, [_util.OPS.save, _util.OPS.transform, _util.OPS.paintInlineImageXObject, _util.OPS.restore], null, function iterateInlineImageGroup(context, i) {
    var fnArray = context.fnArray;
    var iFirstSave = context.iCurr - 3;
    var pos = (i - iFirstSave) % 4;

    switch (pos) {
      case 0:
        return fnArray[i] === _util.OPS.save;

      case 1:
        return fnArray[i] === _util.OPS.transform;

      case 2:
        return fnArray[i] === _util.OPS.paintInlineImageXObject;

      case 3:
        return fnArray[i] === _util.OPS.restore;
    }

    throw new Error(`iterateInlineImageGroup - invalid pos: ${pos}`);
  }, function foundInlineImageGroup(context, i) {
    var MIN_IMAGES_IN_INLINE_IMAGES_BLOCK = 10;
    var MAX_IMAGES_IN_INLINE_IMAGES_BLOCK = 200;
    var MAX_WIDTH = 1000;
    var IMAGE_PADDING = 1;
    var fnArray = context.fnArray,
        argsArray = context.argsArray;
    var curr = context.iCurr;
    var iFirstSave = curr - 3;
    var iFirstTransform = curr - 2;
    var iFirstPIIXO = curr - 1;
    var count = Math.min(Math.floor((i - iFirstSave) / 4), MAX_IMAGES_IN_INLINE_IMAGES_BLOCK);

    if (count < MIN_IMAGES_IN_INLINE_IMAGES_BLOCK) {
      return i - (i - iFirstSave) % 4;
    }

    var maxX = 0;
    var map = [],
        maxLineHeight = 0;
    var currentX = IMAGE_PADDING,
        currentY = IMAGE_PADDING;
    var q;

    for (q = 0; q < count; q++) {
      var transform = argsArray[iFirstTransform + (q << 2)];
      var img = argsArray[iFirstPIIXO + (q << 2)][0];

      if (currentX + img.width > MAX_WIDTH) {
        maxX = Math.max(maxX, currentX);
        currentY += maxLineHeight + 2 * IMAGE_PADDING;
        currentX = 0;
        maxLineHeight = 0;
      }

      map.push({
        transform,
        x: currentX,
        y: currentY,
        w: img.width,
        h: img.height
      });
      currentX += img.width + 2 * IMAGE_PADDING;
      maxLineHeight = Math.max(maxLineHeight, img.height);
    }

    var imgWidth = Math.max(maxX, currentX) + IMAGE_PADDING;
    var imgHeight = currentY + maxLineHeight + IMAGE_PADDING;
    var imgData = new Uint8ClampedArray(imgWidth * imgHeight * 4);
    var imgRowSize = imgWidth << 2;

    for (q = 0; q < count; q++) {
      var data = argsArray[iFirstPIIXO + (q << 2)][0].data;
      var rowSize = map[q].w << 2;
      var dataOffset = 0;
      var offset = map[q].x + map[q].y * imgWidth << 2;
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

    fnArray.splice(iFirstSave, count * 4, _util.OPS.paintInlineImageXObjectGroup);
    argsArray.splice(iFirstSave, count * 4, [{
      width: imgWidth,
      height: imgHeight,
      kind: _util.ImageKind.RGBA_32BPP,
      data: imgData
    }, map]);
    return iFirstSave + 1;
  });
  addState(InitialState, [_util.OPS.save, _util.OPS.transform, _util.OPS.paintImageMaskXObject, _util.OPS.restore], null, function iterateImageMaskGroup(context, i) {
    var fnArray = context.fnArray;
    var iFirstSave = context.iCurr - 3;
    var pos = (i - iFirstSave) % 4;

    switch (pos) {
      case 0:
        return fnArray[i] === _util.OPS.save;

      case 1:
        return fnArray[i] === _util.OPS.transform;

      case 2:
        return fnArray[i] === _util.OPS.paintImageMaskXObject;

      case 3:
        return fnArray[i] === _util.OPS.restore;
    }

    throw new Error(`iterateImageMaskGroup - invalid pos: ${pos}`);
  }, function foundImageMaskGroup(context, i) {
    var MIN_IMAGES_IN_MASKS_BLOCK = 10;
    var MAX_IMAGES_IN_MASKS_BLOCK = 100;
    var MAX_SAME_IMAGES_IN_MASKS_BLOCK = 1000;
    var fnArray = context.fnArray,
        argsArray = context.argsArray;
    var curr = context.iCurr;
    var iFirstSave = curr - 3;
    var iFirstTransform = curr - 2;
    var iFirstPIMXO = curr - 1;
    var count = Math.floor((i - iFirstSave) / 4);
    count = handlePaintSolidColorImageMask(iFirstSave, count, fnArray, argsArray);

    if (count < MIN_IMAGES_IN_MASKS_BLOCK) {
      return i - (i - iFirstSave) % 4;
    }

    var q;
    var isSameImage = false;
    var iTransform, transformArgs;
    var firstPIMXOArg0 = argsArray[iFirstPIMXO][0];

    if (argsArray[iFirstTransform][1] === 0 && argsArray[iFirstTransform][2] === 0) {
      isSameImage = true;
      var firstTransformArg0 = argsArray[iFirstTransform][0];
      var firstTransformArg3 = argsArray[iFirstTransform][3];
      iTransform = iFirstTransform + 4;
      var iPIMXO = iFirstPIMXO + 4;

      for (q = 1; q < count; q++, iTransform += 4, iPIMXO += 4) {
        transformArgs = argsArray[iTransform];

        if (argsArray[iPIMXO][0] !== firstPIMXOArg0 || transformArgs[0] !== firstTransformArg0 || transformArgs[1] !== 0 || transformArgs[2] !== 0 || transformArgs[3] !== firstTransformArg3) {
          if (q < MIN_IMAGES_IN_MASKS_BLOCK) {
            isSameImage = false;
          } else {
            count = q;
          }

          break;
        }
      }
    }

    if (isSameImage) {
      count = Math.min(count, MAX_SAME_IMAGES_IN_MASKS_BLOCK);
      var positions = new Float32Array(count * 2);
      iTransform = iFirstTransform;

      for (q = 0; q < count; q++, iTransform += 4) {
        transformArgs = argsArray[iTransform];
        positions[q << 1] = transformArgs[4];
        positions[(q << 1) + 1] = transformArgs[5];
      }

      fnArray.splice(iFirstSave, count * 4, _util.OPS.paintImageMaskXObjectRepeat);
      argsArray.splice(iFirstSave, count * 4, [firstPIMXOArg0, firstTransformArg0, firstTransformArg3, positions]);
    } else {
      count = Math.min(count, MAX_IMAGES_IN_MASKS_BLOCK);
      var images = [];

      for (q = 0; q < count; q++) {
        transformArgs = argsArray[iFirstTransform + (q << 2)];
        var maskParams = argsArray[iFirstPIMXO + (q << 2)][0];
        images.push({
          data: maskParams.data,
          width: maskParams.width,
          height: maskParams.height,
          transform: transformArgs
        });
      }

      fnArray.splice(iFirstSave, count * 4, _util.OPS.paintImageMaskXObjectGroup);
      argsArray.splice(iFirstSave, count * 4, [images]);
    }

    return iFirstSave + 1;
  });
  addState(InitialState, [_util.OPS.save, _util.OPS.transform, _util.OPS.paintImageXObject, _util.OPS.restore], function (context) {
    var argsArray = context.argsArray;
    var iFirstTransform = context.iCurr - 2;
    return argsArray[iFirstTransform][1] === 0 && argsArray[iFirstTransform][2] === 0;
  }, function iterateImageGroup(context, i) {
    var fnArray = context.fnArray,
        argsArray = context.argsArray;
    var iFirstSave = context.iCurr - 3;
    var pos = (i - iFirstSave) % 4;

    switch (pos) {
      case 0:
        return fnArray[i] === _util.OPS.save;

      case 1:
        if (fnArray[i] !== _util.OPS.transform) {
          return false;
        }

        var iFirstTransform = context.iCurr - 2;
        var firstTransformArg0 = argsArray[iFirstTransform][0];
        var firstTransformArg3 = argsArray[iFirstTransform][3];

        if (argsArray[i][0] !== firstTransformArg0 || argsArray[i][1] !== 0 || argsArray[i][2] !== 0 || argsArray[i][3] !== firstTransformArg3) {
          return false;
        }

        return true;

      case 2:
        if (fnArray[i] !== _util.OPS.paintImageXObject) {
          return false;
        }

        var iFirstPIXO = context.iCurr - 1;
        var firstPIXOArg0 = argsArray[iFirstPIXO][0];

        if (argsArray[i][0] !== firstPIXOArg0) {
          return false;
        }

        return true;

      case 3:
        return fnArray[i] === _util.OPS.restore;
    }

    throw new Error(`iterateImageGroup - invalid pos: ${pos}`);
  }, function (context, i) {
    var MIN_IMAGES_IN_BLOCK = 3;
    var MAX_IMAGES_IN_BLOCK = 1000;
    var fnArray = context.fnArray,
        argsArray = context.argsArray;
    var curr = context.iCurr;
    var iFirstSave = curr - 3;
    var iFirstTransform = curr - 2;
    var iFirstPIXO = curr - 1;
    var firstPIXOArg0 = argsArray[iFirstPIXO][0];
    var firstTransformArg0 = argsArray[iFirstTransform][0];
    var firstTransformArg3 = argsArray[iFirstTransform][3];
    var count = Math.min(Math.floor((i - iFirstSave) / 4), MAX_IMAGES_IN_BLOCK);

    if (count < MIN_IMAGES_IN_BLOCK) {
      return i - (i - iFirstSave) % 4;
    }

    var positions = new Float32Array(count * 2);
    var iTransform = iFirstTransform;

    for (var q = 0; q < count; q++, iTransform += 4) {
      var transformArgs = argsArray[iTransform];
      positions[q << 1] = transformArgs[4];
      positions[(q << 1) + 1] = transformArgs[5];
    }

    var args = [firstPIXOArg0, firstTransformArg0, firstTransformArg3, positions];
    fnArray.splice(iFirstSave, count * 4, _util.OPS.paintImageXObjectRepeat);
    argsArray.splice(iFirstSave, count * 4, args);
    return iFirstSave + 1;
  });
  addState(InitialState, [_util.OPS.beginText, _util.OPS.setFont, _util.OPS.setTextMatrix, _util.OPS.showText, _util.OPS.endText], null, function iterateShowTextGroup(context, i) {
    var fnArray = context.fnArray,
        argsArray = context.argsArray;
    var iFirstSave = context.iCurr - 4;
    var pos = (i - iFirstSave) % 5;

    switch (pos) {
      case 0:
        return fnArray[i] === _util.OPS.beginText;

      case 1:
        return fnArray[i] === _util.OPS.setFont;

      case 2:
        return fnArray[i] === _util.OPS.setTextMatrix;

      case 3:
        if (fnArray[i] !== _util.OPS.showText) {
          return false;
        }

        var iFirstSetFont = context.iCurr - 3;
        var firstSetFontArg0 = argsArray[iFirstSetFont][0];
        var firstSetFontArg1 = argsArray[iFirstSetFont][1];

        if (argsArray[i][0] !== firstSetFontArg0 || argsArray[i][1] !== firstSetFontArg1) {
          return false;
        }

        return true;

      case 4:
        return fnArray[i] === _util.OPS.endText;
    }

    throw new Error(`iterateShowTextGroup - invalid pos: ${pos}`);
  }, function (context, i) {
    var MIN_CHARS_IN_BLOCK = 3;
    var MAX_CHARS_IN_BLOCK = 1000;
    var fnArray = context.fnArray,
        argsArray = context.argsArray;
    var curr = context.iCurr;
    var iFirstBeginText = curr - 4;
    var iFirstSetFont = curr - 3;
    var iFirstSetTextMatrix = curr - 2;
    var iFirstShowText = curr - 1;
    var iFirstEndText = curr;
    var firstSetFontArg0 = argsArray[iFirstSetFont][0];
    var firstSetFontArg1 = argsArray[iFirstSetFont][1];
    var count = Math.min(Math.floor((i - iFirstBeginText) / 5), MAX_CHARS_IN_BLOCK);

    if (count < MIN_CHARS_IN_BLOCK) {
      return i - (i - iFirstBeginText) % 5;
    }

    var iFirst = iFirstBeginText;

    if (iFirstBeginText >= 4 && fnArray[iFirstBeginText - 4] === fnArray[iFirstSetFont] && fnArray[iFirstBeginText - 3] === fnArray[iFirstSetTextMatrix] && fnArray[iFirstBeginText - 2] === fnArray[iFirstShowText] && fnArray[iFirstBeginText - 1] === fnArray[iFirstEndText] && argsArray[iFirstBeginText - 4][0] === firstSetFontArg0 && argsArray[iFirstBeginText - 4][1] === firstSetFontArg1) {
      count++;
      iFirst -= 5;
    }

    var iEndText = iFirst + 4;

    for (var q = 1; q < count; q++) {
      fnArray.splice(iEndText, 3);
      argsArray.splice(iEndText, 3);
      iEndText += 2;
    }

    return iEndText + 1;
  });

  function QueueOptimizer(queue) {
    this.queue = queue;
    this.state = null;
    this.context = {
      iCurr: 0,
      fnArray: queue.fnArray,
      argsArray: queue.argsArray
    };
    this.match = null;
    this.lastProcessed = 0;
  }

  QueueOptimizer.prototype = {
    _optimize() {
      const fnArray = this.queue.fnArray;
      let i = this.lastProcessed,
          ii = fnArray.length;
      let state = this.state;
      let match = this.match;

      if (!state && !match && i + 1 === ii && !InitialState[fnArray[i]]) {
        this.lastProcessed = ii;
        return;
      }

      const context = this.context;

      while (i < ii) {
        if (match) {
          const iterate = (0, match.iterateFn)(context, i);

          if (iterate) {
            i++;
            continue;
          }

          i = (0, match.processFn)(context, i + 1);
          ii = fnArray.length;
          match = null;
          state = null;

          if (i >= ii) {
            break;
          }
        }

        state = (state || InitialState)[fnArray[i]];

        if (!state || Array.isArray(state)) {
          i++;
          continue;
        }

        context.iCurr = i;
        i++;

        if (state.checkFn && !(0, state.checkFn)(context)) {
          state = null;
          continue;
        }

        match = state;
        state = null;
      }

      this.state = state;
      this.match = match;
      this.lastProcessed = i;
    },

    push(fn, args) {
      this.queue.fnArray.push(fn);
      this.queue.argsArray.push(args);

      this._optimize();
    },

    flush() {
      while (this.match) {
        const length = this.queue.fnArray.length;
        this.lastProcessed = (0, this.match.processFn)(this.context, length);
        this.match = null;
        this.state = null;

        this._optimize();
      }
    },

    reset() {
      this.state = null;
      this.match = null;
      this.lastProcessed = 0;
    }

  };
  return QueueOptimizer;
}();

var NullOptimizer = function NullOptimizerClosure() {
  function NullOptimizer(queue) {
    this.queue = queue;
  }

  NullOptimizer.prototype = {
    push(fn, args) {
      this.queue.fnArray.push(fn);
      this.queue.argsArray.push(args);
    },

    flush() {},

    reset() {}

  };
  return NullOptimizer;
}();

var OperatorList = function OperatorListClosure() {
  var CHUNK_SIZE = 1000;
  var CHUNK_SIZE_ABOUT = CHUNK_SIZE - 5;

  function OperatorList(intent, streamSink, pageIndex) {
    this._streamSink = streamSink;
    this.fnArray = [];
    this.argsArray = [];

    if (streamSink && intent !== "oplist") {
      this.optimizer = new QueueOptimizer(this);
    } else {
      this.optimizer = new NullOptimizer(this);
    }

    this.dependencies = Object.create(null);
    this._totalLength = 0;
    this.pageIndex = pageIndex;
    this.intent = intent;
    this.weight = 0;
    this._resolved = streamSink ? null : Promise.resolve();
  }

  OperatorList.prototype = {
    get length() {
      return this.argsArray.length;
    },

    get ready() {
      return this._resolved || this._streamSink.ready;
    },

    get totalLength() {
      return this._totalLength + this.length;
    },

    addOp(fn, args) {
      this.optimizer.push(fn, args);
      this.weight++;

      if (this._streamSink) {
        if (this.weight >= CHUNK_SIZE) {
          this.flush();
        } else if (this.weight >= CHUNK_SIZE_ABOUT && (fn === _util.OPS.restore || fn === _util.OPS.endText)) {
          this.flush();
        }
      }
    },

    addDependency(dependency) {
      if (dependency in this.dependencies) {
        return;
      }

      this.dependencies[dependency] = true;
      this.addOp(_util.OPS.dependency, [dependency]);
    },

    addDependencies(dependencies) {
      for (var key in dependencies) {
        this.addDependency(key);
      }
    },

    addOpList(opList) {
      Object.assign(this.dependencies, opList.dependencies);

      for (var i = 0, ii = opList.length; i < ii; i++) {
        this.addOp(opList.fnArray[i], opList.argsArray[i]);
      }
    },

    getIR() {
      return {
        fnArray: this.fnArray,
        argsArray: this.argsArray,
        length: this.length
      };
    },

    get _transfers() {
      const transfers = [];
      const {
        fnArray,
        argsArray,
        length
      } = this;

      for (let i = 0; i < length; i++) {
        switch (fnArray[i]) {
          case _util.OPS.paintInlineImageXObject:
          case _util.OPS.paintInlineImageXObjectGroup:
          case _util.OPS.paintImageMaskXObject:
            const arg = argsArray[i][0];
            ;

            if (!arg.cached) {
              transfers.push(arg.data.buffer);
            }

            break;
        }
      }

      return transfers;
    },

    flush(lastChunk = false) {
      this.optimizer.flush();
      const length = this.length;
      this._totalLength += length;

      this._streamSink.enqueue({
        fnArray: this.fnArray,
        argsArray: this.argsArray,
        lastChunk,
        length
      }, 1, this._transfers);

      this.dependencies = Object.create(null);
      this.fnArray.length = 0;
      this.argsArray.length = 0;
      this.weight = 0;
      this.optimizer.reset();
    }

  };
  return OperatorList;
}();

exports.OperatorList = OperatorList;