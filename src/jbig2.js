/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var Jbig2Image = (function Jbig2ImageClosure() {

  var ArithmeticDecoder = (function ArithmeticDecoderClosure() {
    var QeTable = [
      {qe: 0x5601, nmps: 1, nlps: 1, switchFlag: 1},
      {qe: 0x3401, nmps: 2, nlps: 6, switchFlag: 0},
      {qe: 0x1801, nmps: 3, nlps: 9, switchFlag: 0},
      {qe: 0x0AC1, nmps: 4, nlps: 12, switchFlag: 0},
      {qe: 0x0521, nmps: 5, nlps: 29, switchFlag: 0},
      {qe: 0x0221, nmps: 38, nlps: 33, switchFlag: 0},
      {qe: 0x5601, nmps: 7, nlps: 6, switchFlag: 1},
      {qe: 0x5401, nmps: 8, nlps: 14, switchFlag: 0},
      {qe: 0x4801, nmps: 9, nlps: 14, switchFlag: 0},
      {qe: 0x3801, nmps: 10, nlps: 14, switchFlag: 0},
      {qe: 0x3001, nmps: 11, nlps: 17, switchFlag: 0},
      {qe: 0x2401, nmps: 12, nlps: 18, switchFlag: 0},
      {qe: 0x1C01, nmps: 13, nlps: 20, switchFlag: 0},
      {qe: 0x1601, nmps: 29, nlps: 21, switchFlag: 0},
      {qe: 0x5601, nmps: 15, nlps: 14, switchFlag: 1},
      {qe: 0x5401, nmps: 16, nlps: 14, switchFlag: 0},
      {qe: 0x5101, nmps: 17, nlps: 15, switchFlag: 0},
      {qe: 0x4801, nmps: 18, nlps: 16, switchFlag: 0},
      {qe: 0x3801, nmps: 19, nlps: 17, switchFlag: 0},
      {qe: 0x3401, nmps: 20, nlps: 18, switchFlag: 0},
      {qe: 0x3001, nmps: 21, nlps: 19, switchFlag: 0},
      {qe: 0x2801, nmps: 22, nlps: 19, switchFlag: 0},
      {qe: 0x2401, nmps: 23, nlps: 20, switchFlag: 0},
      {qe: 0x2201, nmps: 24, nlps: 21, switchFlag: 0},
      {qe: 0x1C01, nmps: 25, nlps: 22, switchFlag: 0},
      {qe: 0x1801, nmps: 26, nlps: 23, switchFlag: 0},
      {qe: 0x1601, nmps: 27, nlps: 24, switchFlag: 0},
      {qe: 0x1401, nmps: 28, nlps: 25, switchFlag: 0},
      {qe: 0x1201, nmps: 29, nlps: 26, switchFlag: 0},
      {qe: 0x1101, nmps: 30, nlps: 27, switchFlag: 0},
      {qe: 0x0AC1, nmps: 31, nlps: 28, switchFlag: 0},
      {qe: 0x09C1, nmps: 32, nlps: 29, switchFlag: 0},
      {qe: 0x08A1, nmps: 33, nlps: 30, switchFlag: 0},
      {qe: 0x0521, nmps: 34, nlps: 31, switchFlag: 0},
      {qe: 0x0441, nmps: 35, nlps: 32, switchFlag: 0},
      {qe: 0x02A1, nmps: 36, nlps: 33, switchFlag: 0},
      {qe: 0x0221, nmps: 37, nlps: 34, switchFlag: 0},
      {qe: 0x0141, nmps: 38, nlps: 35, switchFlag: 0},
      {qe: 0x0111, nmps: 39, nlps: 36, switchFlag: 0},
      {qe: 0x0085, nmps: 40, nlps: 37, switchFlag: 0},
      {qe: 0x0049, nmps: 41, nlps: 38, switchFlag: 0},
      {qe: 0x0025, nmps: 42, nlps: 39, switchFlag: 0},
      {qe: 0x0015, nmps: 43, nlps: 40, switchFlag: 0},
      {qe: 0x0009, nmps: 44, nlps: 41, switchFlag: 0},
      {qe: 0x0005, nmps: 45, nlps: 42, switchFlag: 0},
      {qe: 0x0001, nmps: 45, nlps: 43, switchFlag: 0},
      {qe: 0x5601, nmps: 46, nlps: 46, switchFlag: 0}
    ];

    function ArithmeticDecoder(data, start, end) {
      this.data = data;
      this.bp = start;
      this.dataEnd = end;

      this.chigh = data[start];
      this.clow = 0;

      this.byteIn();

      this.chigh = ((this.chigh << 7) & 0xFFFF) | ((this.clow >> 9) & 0x7F);
      this.clow = (this.clow << 7) & 0xFFFF;
      this.ct -= 7;
      this.a = 0x8000;
    }

    ArithmeticDecoder.prototype = {
      byteIn: function ArithmeticDecoder_byteIn() {
        var data = this.data;
        var bp = this.bp;
        if (data[bp] == 0xFF) {
          var b1 = data[bp + 1];
          if (b1 > 0x8F) {
            this.clow += 0xFF00;
            this.ct = 8;
          } else {
            bp++;
            this.clow += (data[bp] << 9);
            this.ct = 7;
            this.bp = bp;
          }
        } else {
          bp++;
          this.clow += bp < this.dataEnd ? (data[bp] << 8) : 0xFF00;
          this.ct = 8;
          this.bp = bp;
        }
        if (this.clow > 0xFFFF) {
          this.chigh += (this.clow >> 16);
          this.clow &= 0xFFFF;
        }
      },
      readBit: function ArithmeticDecoder_readBit(cx) {
        var qeIcx = QeTable[cx.index].qe;
        this.a -= qeIcx;

        if (this.chigh < qeIcx) {
          var d = this.exchangeLps(cx);
          this.renormD();
          return d;
        } else {
          this.chigh -= qeIcx;
          if ((this.a & 0x8000) == 0) {
            var d = this.exchangeMps(cx);
            this.renormD();
            return d;
          } else {
            return cx.mps;
          }
        }
      },
      renormD: function ArithmeticDecoder_renormD() {
        do {
          if (this.ct == 0)
            this.byteIn();

          this.a <<= 1;
          this.chigh = ((this.chigh << 1) & 0xFFFF) | ((this.clow >> 15) & 1);
          this.clow = (this.clow << 1) & 0xFFFF;
          this.ct--;
        } while ((this.a & 0x8000) == 0);
      },
      exchangeMps: function ArithmeticDecoder_exchangeMps(cx) {
        var d;
        var qeTableIcx = QeTable[cx.index];
        if (this.a < qeTableIcx.qe) {
          d = 1 - cx.mps;

          if (qeTableIcx.switchFlag == 1) {
            cx.mps = 1 - cx.mps;
          }
          cx.index = qeTableIcx.nlps;
        } else {
          d = cx.mps;
          cx.index = qeTableIcx.nmps;
        }
        return d;
      },
      exchangeLps: function ArithmeticDecoder_exchangeLps(cx) {
        var d;
        var qeTableIcx = QeTable[cx.index];
        if (this.a < qeTableIcx.qe) {
          this.a = qeTableIcx.qe;
          d = cx.mps;
          cx.index = qeTableIcx.nmps;
        } else {
          this.a = qeTableIcx.qe;
          d = 1 - cx.mps;

          if (qeTableIcx.switchFlag == 1) {
            cx.mps = 1 - cx.mps;
          }
          cx.index = qeTableIcx.nlps;
        }
        return d;
      }
    };

    return ArithmeticDecoder;
  })();

  var SegmentTypes = [
    'SymbolDictionary', null, null, null, 'IntermediateTextRegion', null,
    'ImmediateTextRegion', 'ImmediateLosslessTextRegion', null, null, null,
    null, null, null, null, null, 'patternDictionary', null, null, null,
    'IntermediateHalftoneRegion', null, 'ImmediateHalftoneRegion',
    'ImmediateLosslessHalftoneRegion', null, null, null, null, null, null, null,
    null, null, null, null, null, 'IntermediateGenericRegion', null,
    'ImmediateGenericRegion', 'ImmediateLosslessGenericRegion',
    'IntermediateGenericRefinementRegion', null,
    'ImmediateGenericRefinementRegion',
    'ImmediateLosslessGenericRefinementRegion', null, null, null, null,
    'PageInformation', 'EndOfPage', 'EndOfStripe', 'EndOfFile', 'Profiles',
    'Tables', null, null, null, null, null, null, null, null,
    'Extension'
  ];

  var CodingTemplates = [
    [{x: -1, y: -2}, {x: 0, y: -2}, {x: 1, y: -2}, {x: -2, y: -1},
     {x: -1, y: -1}, {x: 0, y: -1}, {x: 1, y: -1}, {x: 2, y: -1},
     {x: -4, y: 0}, {x: -3, y: 0}, {x: -2, y: 0}, {x: -1, y: 0}],
    [{x: -1, y: -2}, {x: 0, y: -2}, {x: 1, y: -2}, {x: -2, y: -1},
     {x: -1, y: -1}, {x: 0, y: -1}, {x: 1, y: -1}, {x: 2, y: -1},
     {x: -3, y: 0}, {x: -2, y: 0}, {x: -1, y: 0}],
    [{x: -1, y: -2}, {x: 0, y: -2}, {x: 1, y: -2}, {x: -1, y: -1},
     {x: 0, y: -1}, {x: 1, y: -1}, {x: -2, y: 0}, {x: -1, y: 0}],
    [{x: -3, y: -1}, {x: -2, y: -1}, {x: -1, y: -1}, {x: 0, y: -1},
     {x: 1, y: -1}, {x: -4, y: 0}, {x: -3, y: 0}, {x: -2, y: 0}, {x: -1, y: 0}]
  ];

  var ReusedContexts = [
    0x1CD3, // '00111001101' (template) + '0011' (at),
    0x079A, // '001111001101' + '0',
    0x00E3, // '001110001' + '1',
    0x018B  // '011000101' + '1'
  ];

  function readInt32(data, start) {
    return (data[start] << 24) | (data[start + 1] << 16) |
           (data[start + 2] << 8) | data[start + 3];
  }

  function readUint32(data, start) {
    var value = readInt32(data, start);
    return value & 0x80000000 ? (value + 4294967296) : value;
  }

  function readUint16(data, start) {
    return (data[start] << 8) | data[start + 1];
  }

  function readInt8(data, start) {
    return (data[start] << 24) >> 24;
  }

  function decodeBitmap(mmr, width, height, templateIndex, prediction, skip, at,
                        data, start, end) {
    if (mmr)
      throw 'MMR encoding is not supported';

    var useskip = !!skip;
    var template = CodingTemplates[templateIndex].concat(at);
    var templateLength = template.length;
    var templateX = new Int32Array(templateLength);
    var templateY = new Int32Array(templateLength);
    for (var k = 0; k < templateLength; k++) {
      templateX[k] = template[k].x;
      templateY[k] = template[k].y;
    }
    var pseudoPixelContext = ReusedContexts[template];
    var bitmap = [];
    var decoder = new ArithmeticDecoder(data, start, end);
    var contexts = [], cx;
    var ltp = 0;
    for (var i = 0; i < height; i++) {
      if (prediction) {
        cx = contexts[pseudoPixelContext];
        if (!cx)
          contexts[pseudoPixelContext] = cx = {index: 0, mps: 0};
        var sltp = decoder.readBit(cx);
        ltp ^= sltp;
      }
      if (ltp) {
        bitmap.push(bitmap[bitmap.length - 1]); // duplicate previous row
        continue;
      }
      var row = new Uint8Array(width);
      bitmap.push(row);
      for (var j = 0; j < width; j++) {
        if (useskip && skip[i][j]) {
          row[j] = 0;
          continue;
        }
        var contextLabel = 0;
        for (var k = 0; k < templateLength; k++) {
          var i0 = i + templateY[k], j0 = j + templateX[k];
          if (i0 < 0 || j0 < 0 || j0 >= width)
            contextLabel <<= 1; // out of bound pixel
          else
            contextLabel = (contextLabel << 1) | bitmap[i0][j0];
        }
        cx = contexts[contextLabel];
        if (!cx)
          contexts[contextLabel] = cx = {index: 0, mps: 0};
        var pixel = decoder.readBit(cx);
        row[j] = pixel;
      }
    }
    return bitmap;
  }

  function readSegmentHeader(data, start) {
    var segmentHeader = {};
    segmentHeader.number = readUint32(data, start);
    var flags = data[start + 4];
    var segmentType = flags & 0x3F;
    if (!SegmentTypes[segmentType])
      throw 'Invalid segment type: ' + segmentType;
    segmentHeader.type = segmentType;
    segmentHeader.typeName = SegmentTypes[segmentType];
    segmentHeader.deferredNonRetain = !!(flags & 0x80);
    var pageAssociationFieldSize = !!(flags & 0x40);
    var referredFlags = data[start + 5];
    var referredToCount = (referredFlags >> 5) & 7;
    var retainBits = [referredFlags & 31];
    var position = start + 6;
    if (referredFlags == 7) {
      referredToCount = readInt32(data, position - 1) & 0x1FFFFFFF;
      position += 3;
      var bytes = (referredToCount + 7) >> 3;
      retainBits[0] = data[position++];
      while (--bytes > 0) {
        retainBits.push(data[position++]);
      }
    } else if (referredFlags == 5 || referredFlags == 6)
      throw 'Invalid referred-to flags';
    segmentHeader.referredToCount = referredToCount;
    segmentHeader.retainBits = retainBits;
    var referredToSegmentNumberSize = segmentHeader.number <= 256 ? 1 :
      segmentHeader.number <= 65536 ? 2 : 4;
    var referredTo = [];
    for (var i = 0; i < referredToCount; i++) {
      var number = referredToSegmentNumberSize == 1 ? data[position] :
        referredToSegmentNumberSize == 2 ? readUint16(data, position) :
        readUint32(data, position);
      referredTo.push(number);
      position += referredToSegmentNumberSize;
    }
    segmentHeader.referredTo = referredTo;
    if (!pageAssociationFieldSize)
      segmentHeader.pageAssociation = data[position++];
    else {
      segmentHeader.pageAssociation = readUint32(data, position);
      position += 4;
    }
    segmentHeader.length = readUint32(data, position);
    if (segmentHeader.length == 0xFFFFFFFF)
      throw 'Unsupported unknown segment length';
    position += 4;
    segmentHeader.headerEnd = position;
    return segmentHeader;
  }

  function readSegments(header, data, start, end) {
    var segments = [];
    var position = start;
    while (position < end) {
      var segmentHeader = readSegmentHeader(data, position);
      position = segmentHeader.headerEnd;
      var segment = {
        header: segmentHeader,
        data: data
      };
      if (!header.randomAccess) {
        segment.start = position;
        position += segmentHeader.length;
        segment.end = position;
      }
      segments.push(segment);
      if (segmentHeader.type == 51)
        break; // end of file is found
    }
    if (header.randomAccess) {
      for (var i = 0; i < segments.length; i++) {
        segments[i].start = position;
        position += segments[i].header.length;
        segments[i].end = position;
      }
    }
    return segments;
  }

  function readRegionSegmentInformation(data, start) {
    return {
      width: readUint32(data, start),
      height: readUint32(data, start + 4),
      x: readUint32(data, start + 8),
      y: readUint32(data, start + 12),
      combinationOperator: data[start + 16] & 7
    };
  }
  var RegionSegmentInformationFieldLength = 17;

  function processSegment(segment, visitor) {
    var header = segment.header;
    if (!(header.typeName in visitor))
      return;

    var data = segment.data, position = segment.start, args;
    switch (header.type) {
      case 38: // ImmediateGenericRegion
        var genericRegion = {};
        genericRegion.info = readRegionSegmentInformation(data, position);
        position += RegionSegmentInformationFieldLength;
        var genericRegionSegmentFlags = data[position++];
        genericRegion.mmr = !!(genericRegionSegmentFlags & 1);
        genericRegion.template = (genericRegionSegmentFlags >> 1) & 3;
        genericRegion.prediction = !!(genericRegionSegmentFlags & 4);
        if (!genericRegion.mmr) {
          var atLength = genericRegion.template == 0 ? 4 : 1;
          var at = [];
          for (var i = 0; i < atLength; i++) {
            at.push({
              x: readInt8(data, position),
              y: readInt8(data, position + 1)
            });
            position += 2;
          }
          genericRegion.at = at;
        }
        args = [genericRegion, data, position, segment.end];
        break;
      case 48: // PageInformation
        var pageInfo = {
          width: readUint32(data, position),
          height: readUint32(data, position + 4),
          resolutionX: readUint32(data, position + 8),
          resolutionY: readUint32(data, position + 12)
        };
        if (pageInfo.height == 0xFFFFFFFF)
          delete pageInfo.height;
        var pageSegmentFlags = data[position + 16];
        var pageStripingInformatiom = readUint16(data, position + 17);
        pageInfo.lossless = !!(pageSegmentFlags & 1);
        pageInfo.refinement = !!(pageSegmentFlags & 2);
        pageInfo.defaultPixelValue = (pageSegmentFlags >> 2) & 1;
        pageInfo.combinationOperator = (pageSegmentFlags >> 3) & 3;
        pageInfo.requiresBuffer = !!(pageSegmentFlags & 32);
        pageInfo.combinationOperatorOverride = !!(pageSegmentFlags & 64);
        args = [pageInfo];
        break;
      case 51: // EndOfFile
        break;
      default:
        throw 'Segment type is not implemented: ' +
              header.type + '/' + header.typeName;
    }
    visitor[header.typeName].apply(visitor, args);
  }

  function processSegments(segments, visitor) {
    for (var i = 0; i < segments.length; i++)
      processSegment(segments[i], visitor);
  }

  function parseJbig2(data, start, end) {
    var position = start;
    if (data[position] != 0x97 || data[position + 1] != 0x4A ||
        data[position + 2] != 0x42 || data[position + 3] != 0x32 ||
        data[position + 4] != 0x0D || data[position + 5] != 0x0A ||
        data[position + 6] != 0x1A || data[position + 7] != 0x0A)
      throw 'JBIG2 invalid header';
    var header = {};
    position += 8;
    var flags = data[position++];
    header.randomAccess = !(flags & 1);
    if (!(flags & 2)) {
      header.numberOfPages = readUint32(data, position);
      position += 4;
    }
    var segments = readSegments(header, data, position, end);
    // processSegments(segments, new SimpleSegmentVisitor());
  }

  function parseJbig2Chunk(data, start, end) {
    var segments = readSegments({}, data, start, end);
    var visitor = new SimpleSegmentVisitor();
    processSegments(segments, visitor);
    return visitor.buffer;
  }

  function SimpleSegmentVisitor() {
    this.PageInformation = function(info) {
      this.currentPageInfo = info;
      var rowSize = (info.width + 7) >> 3;
      var buffer = new Uint8Array(rowSize * info.height);
      var fill = info.defaultPixelValue ? 0xFF : 0;
      for (var i = 0; i < buffer.length; i++)
        buffer[i] = fill;
      this.buffer = buffer;
    };
    this.ImmediateGenericRegion = function(region, data, start, end) {
      var regionInfo = region.info, pageInfo = this.currentPageInfo;
      var bitmap = decodeBitmap(region.mmr, regionInfo.width, regionInfo.height,
                                region.template, region.prediction, null,
                                region.at, data, start, end);
      var width = regionInfo.width, height = regionInfo.height;
      var rowSize = (pageInfo.width + 7) >> 3;
      var operator = pageInfo.combinationOperatorOverride ?
        regionInfo.combinationOperator : pageInfo.combinationOperator;
      var buffer = this.buffer;
      for (var i = 0; i < height; i++) {
        var mask = 128 >> (regionInfo.x & 7);
        var offset = (i + regionInfo.y) * rowSize + (regionInfo.x >> 3);
        switch (operator) {
          case 0: // OR
            for (var j = 0; j < width; j++) {
              buffer[offset] |= bitmap[i][j] ? mask : 0;
              mask >>= 1;
              if (!mask) {
                mask = 128;
                offset++;
              }
            }
            break;
          case 2: // XOR
            for (var j = 0; j < width; j++) {
              buffer[offset] ^= bitmap[i][j] ? mask : 0;
              mask >>= 1;
              if (!mask) {
                mask = 128;
                offset++;
              }
            }
            break;
          default:
            throw 'Unimplemented operator: ' + operator;
        }
      }
    };
  }

  function Jbig2Image() {}

  Jbig2Image.prototype = {
    parseChunk: function Jbig2Image_parseChunk(data, start, end) {
      return parseJbig2Chunk(data, start, end);
    }
  };

  return Jbig2Image;
})();
