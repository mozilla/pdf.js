var JpegImage = (function() {
  function constructor() {
  }

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
                      frame, components,
                      spectralStart, spectralEnd,
                      successivePrev, successive) {
    var precision = frame.precision;
    var samplesPerLine = frame.samplesPerLine;
    var progressive = frame.progressive;
    var maxH = frame.maxH;
    
    var startOffset = offset, bitsData = 0, bitsCount = 0;
    var marker = 0;
    function readBit() {
      if (bitsCount > 0) {
        bitsCount--;
        return (bitsData >> bitsCount) & 1;
      }
      bitsData = data[offset++];
      if (bitsData == 0xFF) {
        var nextByte = data[offset++];
        if (nextByte) {
          marker = (bitsData << 8) | nextByte;
          return null; // marker
        }
        // unstuff 0
      }
      bitsCount = 7;
      return bitsData >>> 7;
    }
    function ensureMarker() {
      bitsCount = 0;
      if (readBit() !== null)
        throw "marker is expected";
      return null;
    }
    function decodeHuffman(tree) {
      var node = tree, bit;
      while ((bit = readBit()) !== null) {
        node = node[bit];
        if (typeof node === 'number')
          return node;
        if (typeof node !== 'object')
          return ensureMarker();
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
    function decodeBaseline() {
      var zz = new Int32Array(64);
      var t = decodeHuffman(this.huffmanTableDC);
      var diff = t == 0 ? 0 : receiveAndExtend(t);
      zz[0]= (this.pred += diff);
      var k = 1;
      while (k < 64) {
        var rs = decodeHuffman(this.huffmanTableAC);
        var s = rs & 15, r = rs >> 4;
        if (s == 0) {
          if (r != 15)
            break;
          k += 16;
          continue;
        }
        k += r;
        zz[k] = receiveAndExtend(s);
        k++;
      }
      return zz;
    }
    function quantizeAndInverse(zz, qt) {
      var R = new Int32Array([
        zz[0]  * qt[0],  zz[1]  * qt[1],  zz[5]  * qt[5],  zz[6]  * qt[6],  zz[14] * qt[14], zz[15] * qt[15], zz[27] * qt[27], zz[28] * qt[28],
        zz[2]  * qt[2],  zz[4]  * qt[4],  zz[7]  * qt[7],  zz[13] * qt[13], zz[16] * qt[16], zz[26] * qt[26], zz[29] * qt[29], zz[42] * qt[42],
        zz[3]  * qt[3],  zz[8]  * qt[8],  zz[12] * qt[12], zz[17] * qt[17], zz[25] * qt[25], zz[30] * qt[30], zz[41] * qt[41], zz[43] * qt[43],
        zz[9]  * qt[9],  zz[11] * qt[11], zz[18] * qt[18], zz[24] * qt[24], zz[31] * qt[31], zz[40] * qt[40], zz[44] * qt[44], zz[53] * qt[53],
        zz[10] * qt[10], zz[19] * qt[19], zz[23] * qt[23], zz[32] * qt[32], zz[39] * qt[39], zz[45] * qt[45], zz[52] * qt[52], zz[54] * qt[54],
        zz[20] * qt[20], zz[22] * qt[22], zz[33] * qt[33], zz[38] * qt[38], zz[46] * qt[46], zz[51] * qt[51], zz[55] * qt[55], zz[60] * qt[60],
        zz[21] * qt[21], zz[34] * qt[34], zz[37] * qt[37], zz[47] * qt[47], zz[50] * qt[50], zz[56] * qt[56], zz[59] * qt[59], zz[61] * qt[61],
        zz[35] * qt[35], zz[36] * qt[36], zz[48] * qt[48], zz[49] * qt[49], zz[57] * qt[57], zz[58] * qt[58], zz[62] * qt[62], zz[63] * qt[63]]);
      var i, j, y, x, u, v;
      
      var cTable = [1/Math.sqrt(2),1,1,1,1,1,1,1];
      var cosTable = [[],[],[],[],[],[],[],[]];
      for (i = 0; i < 8; i++) {
        for (j = 0; j < 8; j++)
          cosTable[i][j] = Math.cos((2 * i + 1) * j * Math.PI / 16);
      }

      var r = new Uint8Array(64);
      for (y = 0; y < 8; y++) {
        for (x = 0; x < 8; x++) {
          var sum = 0;
          for (u = 0; u < 8; u++) {
            for (v = 0; v < 8; v++)
              sum += cTable[u] * cTable[v] * R[v * 8 + u] * cosTable[x][u] * cosTable[y][v];
          }
          // TODO loosing precision?
          var sample = 128 + ((sum / 4) >> (precision - 8));
          // clamping
          r[(y << 3) + x] = sample < 0 ? 0 : sample > 0xFF ? 0xFF : sample;
        }
      }
      return r;
    }
    function storeMcu(component, r, mcu, row, col) {
      var h = component.h, v  = component.v;
      var blocksPerLine = (samplesPerLine * h / maxH + 7) >> 3;
      var mcusPerLine = ((blocksPerLine + h - 1) / h) | 0;
      var mcuRow = (mcu / mcusPerLine) | 0, mcuCol = mcu % mcusPerLine;
      var blockRow = mcuRow * v + row, blockCol = mcuCol * h + col;

      var scanLine = blockRow << 3, sample = blockCol << 3;
      var lines = component.lines;
      while (scanLine + 8 > lines.length) {
        lines.push(new Uint8Array(blocksPerLine << 3));
      }

      var i, j;
      for (j = 0; j < 8; j++) {
        for (i = 0; i < 8; i++)
          lines[scanLine + j][sample + i] = r[j * 8 + i]; 
      }
    }

    var componentsLength = components.length;
    var component, i, j, k;
    if (progressive) {
      throw "not implemented: progressive";
    } else {
      for (i = 0; i < componentsLength; i++)
        components[i].decode = decodeBaseline;
    }

    var mcu = 0;
    var h, v;
    while (true) {
      marker = 0;
      if (componentsLength == 1) {
        throw "not implemented: non-interleaved";
      } else {
        stopComponentsParsing:
        for (i = 0; i < componentsLength; i++) {
          component = components[i];
          h = component.h;
          v = component.v;
          for (j = 0; j < v; j++) {
            for (k = 0; k < h; k++) {
              var zz = component.decode();
              if (marker) break stopComponentsParsing;

              var r = quantizeAndInverse(zz, component.quantizationTable);              
              storeMcu(component, r, mcu, j, k);
            }
          }
        }
        if (!marker) {
          mcu++;
        }
      }
      if (marker) {
        if (marker >= 0xFFD0 && marker <= 0xFFD7) { // RSTx
          throw "not implemented reset marker";
        }
        else
          break;
      }
    }
    
    return { processed: offset - startOffset, nextMarker: marker };
  }
  
  constructor.prototype = {
    load: function(path) {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", path, true);
      xhr.responseType = "arraybuffer";
      xhr.onload = (function() {
        // TODO catch parse error
        var data = new Uint8Array(xhr.response || xhr.mozResponseArrayBuffer);
        this.parse(data);
        if (this.onload)
          this.onload();
      }).bind(this);
      xhr.send(null);    
    },
    parse: function(data) {
      var offset = 0, length = data.length;
      function readUint16() {
        var value = (data[offset] << 8) | data[offset + 1];
        offset += 2;
        return value;
      }
      function readFrame() {
        var length = readUint16();
        var array = data.subarray(offset, offset + length - 2);
        offset += array.length;
        return array;
      }
      var jfif = null;
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
        console.log(fileMarker.toString(16));
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
            appData = readFrame();

            if (fileMarker == 0xFFE0) {
              if (appData[0] == 0x4A && appData[1] == 0x46 && appData[2] == 0x49 && 
                appData[3] == 0x46 && appData[4] == 0) { // JFIF
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
            // TODO APP14 - Adobe
            break;

          case 0xFFDB: // DQT (Define Quantization Tables)
            var quantizationTableCount = Math.floor((readUint16() - 2) / 65);
            for (i = 0; i < quantizationTableCount; i++) {
              var tableSpec = data[offset++];
              var tableData = new Int32Array(64);
              if ((tableSpec >> 4) == 0) { // 8 bit values
                for (j = 0; j < 64; j++)
                  tableData[j] = data[offset++];
              } else if ((tableSpec >> 4) == 1) { //16 bit
                  tableData[j] = readUint16();
              } else
                throw "DQT: invalid table spec";
              quantizationTables[tableSpec & 15] = tableData;
            }
            break;

          case 0xFFC0: // SOF0 (Start of Frame, Baseline DCT)
          case 0xFFC2: // SOF2 (Start of Frame, Progressive DCT)
            readUint16(); // skip data length
            frame = {};
            frame.progressive = fileMarker == 0xFFC2;
            frame.precision = data[offset++];
            frame.scanLines = readUint16();
            frame.samplesPerLine = readUint16();
            frame.components = [];
            var componentsCount = data[offset++];
            var maxH = 0, maxV = 0;
            for (i = 0; i < componentsCount; i++) {
              var id = data[offset];
              var h = data[offset + 1] >> 4;
              var v = data[offset + 1] & 15;
              var qId = data[offset + 2];              
              frame.components[id] = {
                h: h,
                v: v,
                quantizationTable: quantizationTables[qId],
                pred: 0,
                lines: []
              };
              offset += 3;
              if (maxH < h) maxH = h;
              if (maxV < v) maxV = v;
            }
            frame.maxH = maxH;
            frame.maxV = maxV;
            frames.push(frame);
            break;

          case 0xFFC4: // DHT (Define Huffman Tables)
            var huffmanLength = readUint16();
            for (i = 2; i < huffmanLength;) {
              var tableSpec = data[offset++];
              var codeLengths = new Uint8Array(16);
              var codeLengthSum = 0;
              for (j = 0; j < 16; j++, offset++)
                codeLengthSum += (codeLengths[j] = data[offset]);
              var huffmanValues = new Uint8Array(codeLengthSum);
              for (j = 0; j < codeLengthSum; j++, offset++)
                huffmanValues[j] = data[offset];
              i += 17 + codeLengthSum;

              ((tableSpec >> 4) == 0 ? huffmanTablesDC : huffmanTablesAC)[tableSpec & 15] =
                buildHuffmanTable(codeLengths, huffmanValues);
            }
            break;

          case 0xFFDD: // DRI (Define Restart Interval)
            readUint16(); // skip data length
            resetInterval = readUint16();
            break;

          case 0xFFDA: // SOS (Start of Scan)
            var scanLength = readUint16();
            var componentsCount = data[offset++];
            var components = [], component;
            for (i = 0; i < componentsCount; i++) {
              var id = data[offset++];
              component = frame.components[id];
              var tableSpec = data[offset++];              
              component.huffmanTableDC = huffmanTablesDC[tableSpec >> 4];
              component.huffmanTableAC = huffmanTablesAC[tableSpec & 15];              
              components.push(component);
            }
            var spectralStart = data[offset++];
            var spectralEnd = data[offset++];
            var successiveApproximation = data[offset++];
            var result = decodeScan(data, offset,
              frame, components,
              spectralStart, spectralEnd,
              successiveApproximation >> 4, successiveApproximation & 15);
            offset += result.processed;
            fileMarker = result.nextMarker;
            continue;
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
      this.components = [];
      for (i in frame.components) {
        if (!frame.components.hasOwnProperty(i)) continue;
        this.components.push({
          lines: frame.components[i].lines,
          scaleX: frame.components[i].h / frame.maxH,
          scaleY: frame.components[i].v / frame.maxV
        });
      }
    },
    copyToImageData: function(imageData) {
      var width = imageData.width, height = imageData.height;
      var scaleX = this.width / width, scaleY = this.height / height;
      
      var component1, component2, component3, component4;
      var component1Line, component2Line, component3Line, component4Line;
      var x, y;
      switch (this.components.length) {
        case 1:
          component1 = this.components[0];
          var offset = 0, data = imageData.data;
          for (y = 0; y < height; y++) {
            component1Line = component1.lines[0 | (y * component1.scaleY * scaleY)];
            for (x = 0; x < width; x++) {
              var Y = component1Line[0 | (x * component1.scaleX * scaleX)];
              
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
          var offset = 0, data = imageData.data;
          for (y = 0; y < height; y++) {
            component1Line = component1.lines[0 | (y * component1.scaleY * scaleY)];
            component2Line = component2.lines[0 | (y * component2.scaleY * scaleY)];
            component3Line = component3.lines[0 | (y * component3.scaleY * scaleY)];
            for (x = 0; x < width; x++) {
              var Y = component1Line[0 | (x * component1.scaleX * scaleX)];
              var Cb = component2Line[0 | (x * component2.scaleX * scaleX)];
              var Cr = component3Line[0 | (x * component3.scaleX * scaleX)];
              
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
          var offset = 0, data = imageData.data;
          for (y = 0; y < height; y++) {
            component1Line = component1.lines[0 | (y * component1.scaleY * scaleY)];
            component2Line = component2.lines[0 | (y * component2.scaleY * scaleY)];
            component3Line = component3.lines[0 | (y * component3.scaleY * scaleY)];
            component4Line = component4.lines[0 | (y * component4.scaleY * scaleY)];
            for (x = 0; x < width; x++) {
              var Y = component1Line[0 | (x * component1.scaleX * scaleX)];
              var Cb = component2Line[0 | (x * component2.scaleX * scaleX)];
              var Cr = component3Line[0 | (x * component3.scaleX * scaleX)];
              var K = component4Line[0 | (x * component4.scaleX * scaleX)];

              var C = 255 - (Y + 1.402 * (Cr - 128));
              var M = 255 - (Y - 0.3441363 * (Cb - 128) - 0.71413636 * (Cr - 128));
              var Ye = 255 - (Y + 1.772 * (Cb - 128));
              
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