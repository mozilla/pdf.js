/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

// - The JPEG specification can be found in the ITU CCITT Recommendation T.81
//   (www.w3.org/Graphics/JPEG/itu-t81.pdf)
// - The JFIF specification can be found in the JPEG File Interchange Format
//   (www.w3.org/Graphics/JPEG/jfif3.pdf)
// - The Adobe Application-Specific JPEG markers in the Supporting the DCT Filters
//   in PostScript Level 2, Technical Note #5116
//   (partners.adobe.com/public/developer/en/ps/sdk/5116.DCT_Filter.pdf)

var JpegImage = (function() {
  "use strict";

  function constructor() {
  }

  var iDCTTables = (function() {
    var cosTables = [], i, j;
    for (i = 0; i < 8; i++) {
      cosTables.push(new Float32Array(8));
      for (j = 0; j < 8; j++)
        cosTables[i][j] = Math.cos((2 * i + 1) * j * Math.PI / 16) *
          (j > 0 ? 1 : 1/Math.sqrt(2));
    }

    var x, y, u, v;
    var tables = [];
    for (y = 0; y < 8; y++) {
      var cosTable_y = cosTables[y];
      for (x = 0; x < 8; x++) {
        var cosTable_x = cosTables[x];
        var table = new Float32Array(64);
        i = 0;
        for (v = 0; v < 8; v++) {
          for (u = 0; u < 8; u++)
            table[i++] = cosTable_x[u] * cosTable_y[v];
        }
        tables.push(table);
      }
    }
    return tables;
  })();

  function buildHuffmanTable(codeLengths, values) {
    var k = 0, code = [], i, j, length = 16;
    while (length > 0 && !codeLengths[length - 1])
      length--;
    code.push({children: [], index: 0});
    var p = code[0], q;
    for (i = 0; i < length; i++) {
      for (j = 0; j < codeLengths[i]; j++) {
        p = code.pop();
        p.children[p.index] = values[k];
        while (p.index > 0) {
          p = code.pop();
        }
        p.index++;
        code.push(p);
        while (code.length <= i) {
          code.push(q = {children: [], index: 0});
          p.children[p.index] = q.children;
          p = q;
        }
        k++;
      }
      if (i + 1 < length) {
        // p here points to last code
        code.push(q = {children: [], index: 0});
        p.children[p.index] = q.children;
        p = q;
      }
    }
    return code[0].children;
  }

  function decodeScan(data, offset,
                      frame, components, resetInterval,
                      spectralStart, spectralEnd,
                      successivePrev, successive) {
    var precision = frame.precision;
    var samplesPerLine = frame.samplesPerLine;
    var scanLines = frame.scanLines;
    var progressive = frame.progressive;
    var maxH = frame.maxH, maxV = frame.maxV;

    var startOffset = offset, bitsData = 0, bitsCount = 0;
    function readBit() {
      if (bitsCount > 0) {
        bitsCount--;
        return (bitsData >> bitsCount) & 1;
      }
      bitsData = data[offset++];
      if (bitsData == 0xFF) {
        var nextByte = data[offset++];
        if (nextByte) {
          throw "unexpected marker: " + ((bitsData << 8) | nextByte).toString(16);
        }
        // unstuff 0
      }
      bitsCount = 7;
      return bitsData >>> 7;
    }
    function decodeHuffman(tree) {
      var node = tree, bit;
      while ((bit = readBit()) !== null) {
        node = node[bit];
        if (typeof node === 'number')
          return node;
        if (typeof node !== 'object')
          throw "invalid huffman sequence";
      }
      return null;
    }
    function receive(length) {
      var n = 0;
      while (length > 0) {
        var bit = readBit();
        if (bit === null) return;
        n = (n << 1) | bit;
        length--;
      }
      return n;
    }
    function receiveAndExtend(length) {
      var n = receive(length);
      if (n >= 1 << (length - 1))
        return n;
      return n + (-1 << length) + 1;
    }
    function decodeBaseline(component, zz) {
      var t = decodeHuffman(component.huffmanTableDC);
      var diff = t === 0 ? 0 : receiveAndExtend(t);
      zz[0]= (component.pred += diff);
      var k = 1;
      while (k < 64) {
        var rs = decodeHuffman(component.huffmanTableAC);
        var s = rs & 15, r = rs >> 4;
        if (s === 0) {
          if (r < 15)
            break;
          k += 16;
          continue;
        }
        k += r;
        zz[k] = receiveAndExtend(s);
        k++;
      }
    }
    function decodeDCFirst(component, zz) {
      var t = decodeHuffman(component.huffmanTableDC);
      var diff = t === 0 ? 0 : receiveAndExtend(t);
      zz[0] = (component.pred += diff) << successive;
    }
    function decodeDCSuccessive(component, zz) {
      zz[0] |= readBit() << successive;
    }
    var eobrun = 0;
    function decodeACFirst(component, zz) {
      if (eobrun > 0) {
        eobrun--;
        return;
      }
      var k = spectralStart, e = spectralEnd;
      while (k <= e) {
        // check if marker is next
        if (data[offset] == 0xFF && data[offset + 1] !== 0) {
          var tailMask = (1 << bitsCount) - 1;
          if ((bitsData & tailMask) == tailMask)
            eobrun = -1 >>> 1; // marker found
          break;
        }

        var rs = decodeHuffman(component.huffmanTableAC);
        var s = rs & 15, r = rs >> 4;
        if (s === 0) {
          if (r < 15) {
            eobrun = receive(r) + (1 << r) - 1;
            break;
          }
          k += 16;
          continue;
        }
        k += r;
        zz[k] = receiveAndExtend(s);
        k++;
      }
    }
    var successiveACState = null;
    function decodeACSuccessive(component, zz) {
      var k = spectralStart, e = spectralEnd;
      while (k <= e) {
        if (successiveACState === null) {
          // check if marker is next
          if (data[offset] == 0xFF && data[offset + 1] !== 0) {
            var tailMask = (1 << bitsCount) - 1;
            if ((bitsData & tailMask) == tailMask)
              eobrun = -1 >>> 1; // marker found
            break;
          }
          var rs = decodeHuffman(component.huffmanTableAC);
          var s = rs & 15, r = rs >> 4;
          if (s === 0) {
            if (r < 15) {
              eobrun = receive(r) + (1 << r);
              successiveACState = {
                state: 0
              };
            } else {
              successiveACState = {
                state: 1,
                r: 16
              };
            }
          } else {
            successiveACState = {
              state: r ? 2 : 3,
              r: r,
              newValue: receiveAndExtend(s)
            };
          }
        }
        switch (successiveACState.state) {
        case 0:
          if (zz[k])
            zz[k] |= readBit() << successive;
          break;
        case 1:
        case 2:
          if (zz[k])
            zz[k] |= readBit() << successive;
          else {
            successiveACState.r--;
            if (successiveACState.r === 0) {
              if (successiveACState.state == 2)
                successiveACState.state = 3;
              else
                successiveACState = null;
            }
          }
          break;
        case 3:
          if (zz[k])
            zz[k] |= readBit() << successive;
          else {
            zz[k] = successiveACState.newValue << successive;
            successiveACState = null;
          }
          break;
        }
        k++;
      }
      if (successiveACState && successiveACState.state === 0) {
        eobrun--;
        if (eobrun === 0)
          successiveACState = null;
      }
    }
    function decodeMcu(component, decode, mcu, row, col) {
      var mcuRow = (mcu / component.mcusPerLine) | 0;
      var mcuCol = mcu % component.mcusPerLine;
      var blockRow = mcuRow * component.v + row;
      var blockCol = mcuCol * component.h + col;
      decode(component, component.blocks[blockRow][blockCol]);
    }
    function decodeBlock(component, decode, mcu) {
      var blockRow = (mcu / component.blocksPerLine) | 0;
      var blockCol = mcu % component.blocksPerLine;
      decode(component, component.blocks[blockRow][blockCol]);
    }

    var componentsLength = components.length;
    var component, i, j, k, n;
    var decodeFn;
    if (progressive) {
      if (spectralStart === 0)
        decodeFn = successivePrev === 0 ? decodeDCFirst : decodeDCSuccessive;
      else
        decodeFn = successivePrev === 0 ? decodeACFirst : decodeACSuccessive;
    } else {
      decodeFn = decodeBaseline;
    }
    for (i = 0; i < componentsLength; i++)
      components[i].pred = 0;

    var mcu = 0, marker;
    var mcuExpected;
    if (componentsLength == 1) {
      mcuExpected = components[0].blocksPerLine * components[0].blocksPerColumn;
    } else {
      mcuExpected = components[0].mcusPerLine * components[0].mcusPerColumn;
    }
    if (!resetInterval) resetInterval = mcuExpected;

    var h, v;
    while (mcu < mcuExpected) {
      if (componentsLength == 1) {
        component = components[0];
        for (n = 0; n < resetInterval; n++) {
          decodeBlock(component, decodeFn, mcu);
          mcu++;
        }
      } else {
        for (n = 0; n < resetInterval; n++) {
          for (i = 0; i < componentsLength; i++) {
            component = components[i];
            h = component.h;
            v = component.v;
            for (j = 0; j < v; j++) {
              for (k = 0; k < h; k++) {
                decodeMcu(component, decodeFn, mcu, j, k);
              }
            }
          }
          mcu++;
        }
      }

      // find marker
      bitsCount = 0;
      marker = (data[offset] << 8) | data[offset + 1];
      if (marker <= 0xFF00) {
        throw "marker was not found";
      }

      if (marker >= 0xFFD0 && marker <= 0xFFD7) { // RSTx
        offset += 2;
        for (i = 0; i < componentsLength; i++)
          components[i].pred = 0;
        eobrun = 0;
      }
      else
        break;
    }

    return offset - startOffset;
  }

  function buildComponentData(frame, component) {
    var lines = [];
    var blocksPerLine = component.blocksPerLine;
    var blocksPerColumn = component.blocksPerColumn;
    var samplesPerLine = blocksPerLine << 3;

    function quantizeAndInverse(zz) {
      var qt = component.quantizationTable;
      var precision = frame.precision;
      var R = new Int32Array([
        zz[0]  * qt[0],  zz[1]  * qt[1],  zz[5]  * qt[5],  zz[6]  * qt[6],  zz[14] * qt[14], zz[15] * qt[15], zz[27] * qt[27], zz[28] * qt[28],
        zz[2]  * qt[2],  zz[4]  * qt[4],  zz[7]  * qt[7],  zz[13] * qt[13], zz[16] * qt[16], zz[26] * qt[26], zz[29] * qt[29], zz[42] * qt[42],
        zz[3]  * qt[3],  zz[8]  * qt[8],  zz[12] * qt[12], zz[17] * qt[17], zz[25] * qt[25], zz[30] * qt[30], zz[41] * qt[41], zz[43] * qt[43],
        zz[9]  * qt[9],  zz[11] * qt[11], zz[18] * qt[18], zz[24] * qt[24], zz[31] * qt[31], zz[40] * qt[40], zz[44] * qt[44], zz[53] * qt[53],
        zz[10] * qt[10], zz[19] * qt[19], zz[23] * qt[23], zz[32] * qt[32], zz[39] * qt[39], zz[45] * qt[45], zz[52] * qt[52], zz[54] * qt[54],
        zz[20] * qt[20], zz[22] * qt[22], zz[33] * qt[33], zz[38] * qt[38], zz[46] * qt[46], zz[51] * qt[51], zz[55] * qt[55], zz[60] * qt[60],
        zz[21] * qt[21], zz[34] * qt[34], zz[37] * qt[37], zz[47] * qt[47], zz[50] * qt[50], zz[56] * qt[56], zz[59] * qt[59], zz[61] * qt[61],
        zz[35] * qt[35], zz[36] * qt[36], zz[48] * qt[48], zz[49] * qt[49], zz[57] * qt[57], zz[58] * qt[58], zz[62] * qt[62], zz[63] * qt[63]]);

      var r = new Uint8Array(64), i, j;
      for (i = 0; i < 64; i++) {
        var sum = 0;
        var table = iDCTTables[i];
        for (j = 0; j < 64; j++)
          sum += table[j] * R[j];
        // TODO loosing precision?
        var sample = 128 + ((sum / 4) >> (precision - 8));
        // clamping
        r[i] = sample < 0 ? 0 : sample > 0xFF ? 0xFF : sample;
      }
      return r;
    }

    var i, j;
    for (var blockRow = 0; blockRow < blocksPerColumn; blockRow++) {
      var scanLine = blockRow << 3;
      for (i = 0; i < 8; i++)
        lines.push(new Uint8Array(samplesPerLine));

      for (var blockCol = 0; blockCol < blocksPerLine; blockCol++) {
        var r = quantizeAndInverse(component.blocks[blockRow][blockCol]);

        var offset = 0, sample = blockCol << 3;
        for (j = 0; j < 8; j++) {
          var line = lines[scanLine + j];
          for (i = 0; i < 8; i++)
            line[sample + i] = r[offset++];
        }
      }
    }
    return lines;
  }

  constructor.prototype = {
    load: function(data) {
      this.parse(data);
    },
    parse: function(data) {
      var offset = 0, length = data.length;
      function readUint16() {
        var value = (data[offset] << 8) | data[offset + 1];
        offset += 2;
        return value;
      }
      function readDataBlock() {
        var length = readUint16();
        var array = data.subarray(offset, offset + length - 2);
        offset += array.length;
        return array;
      }
      function prepareComponents(frame) {
        var maxH = 0, maxV = 0;
        var component, componentId;
        for (componentId in frame.components) {
          if (frame.components.hasOwnProperty(componentId)) {
            component = frame.components[componentId];
            if (maxH < component.h) maxH = component.h;
            if (maxV < component.v) maxV = component.v;
          }
        }
        var mcusPerLine = Math.ceil(frame.samplesPerLine / 8 / maxH);
        var mcusPerColumn = Math.ceil(frame.scanLines / 8 / maxV);
        for (componentId in frame.components) {
          if (frame.components.hasOwnProperty(componentId)) {
            component = frame.components[componentId];
            var blocksPerLine = mcusPerLine * component.h;
            var blocksPerColumn = mcusPerColumn * component.v;
            var blocks = [];
            for (var i = 0; i < blocksPerColumn; i++) {
              var row = [];
              for (var j = 0; j < blocksPerLine; j++)
                row.push(new Int32Array(64));
              blocks.push(row);
            }
            component.blocksPerLine = blocksPerLine;
            component.blocksPerColumn = blocksPerColumn;
            component.blocks = blocks;

            component.mcusPerLine = mcusPerLine;
            component.mcusPerColumn = mcusPerColumn;
          }
        }
        frame.maxH = maxH;
        frame.maxV = maxV;
      }
      var jfif = null;
      var adobe = null;
      var pixels = null;
      var frame, resetInterval;
      var quantizationTables = [], frames = [];
      var huffmanTablesAC = [], huffmanTablesDC = [];
      var fileMarker = readUint16();
      if (fileMarker != 0xFFD8) { // SOI (Start of Image)
        throw "SOI not found";
      }

      fileMarker = readUint16();
      while (fileMarker != 0xFFD9) { // EOI (End of image)
        var i, j, l;
        switch(fileMarker) {
          case 0xFFE0: // APP0 (Application Specific)
          case 0xFFE1: // APP1
          case 0xFFE2: // APP2
          case 0xFFE3: // APP3
          case 0xFFE4: // APP4
          case 0xFFE5: // APP5
          case 0xFFE6: // APP6
          case 0xFFE7: // APP7
          case 0xFFE8: // APP8
          case 0xFFE9: // APP9
          case 0xFFEA: // APP10
          case 0xFFEB: // APP11
          case 0xFFEC: // APP12
          case 0xFFED: // APP13
          case 0xFFEE: // APP14
          case 0xFFEF: // APP15
          case 0xFFFE: // COM (Comment)
            var appData = readDataBlock();

            if (fileMarker === 0xFFE0) {
              if (appData[0] === 0x4A && appData[1] === 0x46 && appData[2] === 0x49 &&
                appData[3] === 0x46 && appData[4] === 0) { // 'JFIF\x00'
                jfif = {
                  version: { major: appData[5], minor: appData[6] },
                  densityUnits: appData[7],
                  xDensity: (appData[8] << 8) | appData[9],
                  yDensity: (appData[10] << 8) | appData[11],
                  thumbWidth: appData[12],
                  thumbHeight: appData[13],
                  thumbData: appData.subarray(14, 14 + 3 * appData[12] * appData[13])
                };
              }
            }
            // TODO APP1 - Exif
            if (fileMarker === 0xFFEE) {
              if (appData[0] === 0x41 && appData[1] === 0x64 && appData[2] === 0x6F &&
                appData[3] === 0x62 && appData[4] === 65 && appData[5] === 0) { // 'Adobe\x00'
                adobe = {
                  version: appData[6],
                  flags0: (appData[7] << 8) | appData[8],
                  flags1: (appData[9] << 8) | appData[10],
                  transformCode: appData[11]
                };
              }
            }
            break;

          case 0xFFDB: // DQT (Define Quantization Tables)
            var quantizationTableCount = Math.floor((readUint16() - 2) / 65);
            for (i = 0; i < quantizationTableCount; i++) {
              var quantizationTableSpec = data[offset++];
              var tableData = new Int32Array(64);
              if ((quantizationTableSpec >> 4) === 0) { // 8 bit values
                for (j = 0; j < 64; j++)
                  tableData[j] = data[offset++];
              } else if ((quantizationTableSpec >> 4) === 1) { //16 bit
                  tableData[j] = readUint16();
              } else
                throw "DQT: invalid table spec";
              quantizationTables[quantizationTableSpec & 15] = tableData;
            }
            break;

          case 0xFFC0: // SOF0 (Start of Frame, Baseline DCT)
          case 0xFFC2: // SOF2 (Start of Frame, Progressive DCT)
            readUint16(); // skip data length
            frame = {};
            frame.progressive = (fileMarker === 0xFFC2);
            frame.precision = data[offset++];
            frame.scanLines = readUint16();
            frame.samplesPerLine = readUint16();
            frame.components = [];
            var componentsCount = data[offset++], componentId;
            var maxH = 0, maxV = 0;
            for (i = 0; i < componentsCount; i++) {
              componentId = data[offset];
              var h = data[offset + 1] >> 4;
              var v = data[offset + 1] & 15;
              var qId = data[offset + 2];
              frame.components[componentId] = {
                h: h,
                v: v,
                quantizationTable: quantizationTables[qId]
              };
              offset += 3;
            }
            prepareComponents(frame);
            frames.push(frame);
            break;

          case 0xFFC4: // DHT (Define Huffman Tables)
            var huffmanLength = readUint16();
            for (i = 2; i < huffmanLength;) {
              var huffmanTableSpec = data[offset++];
              var codeLengths = new Uint8Array(16);
              var codeLengthSum = 0;
              for (j = 0; j < 16; j++, offset++)
                codeLengthSum += (codeLengths[j] = data[offset]);
              var huffmanValues = new Uint8Array(codeLengthSum);
              for (j = 0; j < codeLengthSum; j++, offset++)
                huffmanValues[j] = data[offset];
              i += 17 + codeLengthSum;

              ((huffmanTableSpec >> 4) === 0 ? 
                huffmanTablesDC : huffmanTablesAC)[huffmanTableSpec & 15] =
                buildHuffmanTable(codeLengths, huffmanValues);
            }
            break;

          case 0xFFDD: // DRI (Define Restart Interval)
            readUint16(); // skip data length
            resetInterval = readUint16();
            break;

          case 0xFFDA: // SOS (Start of Scan)
            var scanLength = readUint16();
            var selectorsCount = data[offset++];
            var components = [], component;
            for (i = 0; i < selectorsCount; i++) {
              component = frame.components[data[offset++]];
              var tableSpec = data[offset++];
              component.huffmanTableDC = huffmanTablesDC[tableSpec >> 4];
              component.huffmanTableAC = huffmanTablesAC[tableSpec & 15];
              components.push(component);
            }
            var spectralStart = data[offset++];
            var spectralEnd = data[offset++];
            var successiveApproximation = data[offset++];
            var processed = decodeScan(data, offset,
              frame, components, resetInterval,
              spectralStart, spectralEnd,
              successiveApproximation >> 4, successiveApproximation & 15);
            offset += processed;
            break;
          default:
            throw "unknown JPEG marker " + fileMarker.toString(16);
        }
        fileMarker = readUint16();
      }
      if (frames.length != 1)
        throw "only single frame JPEGs supported";

      this.width = frame.samplesPerLine;
      this.height = frame.scanLines;
      this.jfif = jfif;
      this.adobe = adobe;
      this.components = [];
      for (var id in frame.components) {
        if (frame.components.hasOwnProperty(id)) {
          this.components.push({
            lines: buildComponentData(frame, frame.components[id]),
            scaleX: frame.components[id].h / frame.maxH,
            scaleY: frame.components[id].v / frame.maxV
          });
        }
      }
    },
    getBuffer: function() {
      var width = this.width, height = this.height;

      var component1, component2, component3, component4;
      var component1Line, component2Line, component3Line, component4Line;
      var x, y;
      var offset = 0;

      var length = this.components.length;
      var buffer = new Uint8Array(length * width * height);
      switch (this.components.length) {
        case 1:
          component1 = this.components[0];
          for (y = 0; y < height; y++) {
            component1Line = component1.lines[y];
            component1Line = component1.lines[0 | (y * component1.scaleY)];
            for (x = 0; x < width; x++) {
              buffer[offset++] = component1Line[0 | (x * component1.scaleX)];
            }
          }
          break;
        case 3:
          component1 = this.components[0];
          component2 = this.components[1];
          component3 = this.components[2];
          for (y = 0; y < height; y++) {
            component1Line = component1.lines[0 | (y * component1.scaleY)];
            component2Line = component2.lines[0 | (y * component2.scaleY)];
            component3Line = component3.lines[0 | (y * component3.scaleY)];
            for (x = 0; x < width; x++) {
              buffer[offset++] = component1Line[0 | (x * component1.scaleX)];
              buffer[offset++] = component2Line[0 | (x * component2.scaleX)];
              buffer[offset++] = component3Line[0 | (x * component3.scaleX)];
            }
          }
          break;
        case 4:
          component1 = this.components[0];
          component2 = this.components[1];
          component3 = this.components[2];
          component4 = this.components[3];
          for (y = 0; y < height; y++) {
            component1Line = component1.lines[0 | (y * component1.scaleY)];
            component2Line = component2.lines[0 | (y * component2.scaleY)];
            component3Line = component3.lines[0 | (y * component3.scaleY)];
            component4Line = component4.lines[0 | (y * component4.scaleY)];
            for (x = 0; x < width; x++) {
              buffer[offset++] = component1Line[0 | (x * component1.scaleX)];
              buffer[offset++] = component2Line[0 | (x * component2.scaleX)];
              buffer[offset++] = component3Line[0 | (x * component3.scaleX)];
              buffer[offset++] = component4Line[0 | (x * component4.scaleX)];
            }
          }
          break;
      }
      return buffer;
    },
    copyToImageData: function(imageData) {
      var width = imageData.width, height = imageData.height;
      var scaleX = this.width / width, scaleY = this.height / height;

      var component1, component2, component3, component4;
      var component1Line, component2Line, component3Line, component4Line;
      var x, y;
      var offset = 0, data = imageData.data;
      var Y, Cb, Cr, K, C, M, Ye;
      switch (this.components.length) {
        case 1:
          component1 = this.components[0];
          for (y = 0; y < height; y++) {
            component1Line = component1.lines[0 | (y * component1.scaleY * scaleY)];
            for (x = 0; x < width; x++) {
              Y = component1Line[0 | (x * component1.scaleX * scaleX)];

              data[offset++] = Y;
              data[offset++] = Y;
              data[offset++] = Y;
              data[offset++] = 255;
            }
          }
          break;
        case 3:
          component1 = this.components[0];
          component2 = this.components[1];
          component3 = this.components[2];
          for (y = 0; y < height; y++) {
            component1Line = component1.lines[0 | (y * component1.scaleY * scaleY)];
            component2Line = component2.lines[0 | (y * component2.scaleY * scaleY)];
            component3Line = component3.lines[0 | (y * component3.scaleY * scaleY)];
            for (x = 0; x < width; x++) {
              Y = component1Line[0 | (x * component1.scaleX * scaleX)];
              Cb = component2Line[0 | (x * component2.scaleX * scaleX)];
              Cr = component3Line[0 | (x * component3.scaleX * scaleX)];

              data[offset++] = Y + 1.402 * (Cr - 128);
              data[offset++] = Y - 0.3441363 * (Cb - 128) - 0.71413636 * (Cr - 128);
              data[offset++] = Y + 1.772 * (Cb - 128);
              data[offset++] = 255;
            }
          }
          break;
        case 4:
          component1 = this.components[0];
          component2 = this.components[1];
          component3 = this.components[2];
          component4 = this.components[3];
          for (y = 0; y < height; y++) {
            component1Line = component1.lines[0 | (y * component1.scaleY * scaleY)];
            component2Line = component2.lines[0 | (y * component2.scaleY * scaleY)];
            component3Line = component3.lines[0 | (y * component3.scaleY * scaleY)];
            component4Line = component4.lines[0 | (y * component4.scaleY * scaleY)];
            for (x = 0; x < width; x++) {
              Y = component1Line[0 | (x * component1.scaleX * scaleX)];
              Cb = component2Line[0 | (x * component2.scaleX * scaleX)];
              Cr = component3Line[0 | (x * component3.scaleX * scaleX)];
              K = component4Line[0 | (x * component4.scaleX * scaleX)];

              C = 255 - (Y + 1.402 * (Cr - 128));
              M = 255 - (Y - 0.3441363 * (Cb - 128) - 0.71413636 * (Cr - 128));
              Ye = 255 - (Y + 1.772 * (Cb - 128));

              data[offset++] = 255 - Math.min(255, C * (1 - K / 255) + K);
              data[offset++] = 255 - Math.min(255, M * (1 - K / 255) + K);
              data[offset++] = 255 - Math.min(255, Ye * (1 - K / 255) + K);
              data[offset++] = 255;
            }
          }
          break;
      }
    }
  };

  return constructor;
})();
