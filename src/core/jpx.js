/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2012 Mozilla Foundation
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
/* globals error, globalScope, warn */

'use strict';

var JpxImage = (function JpxImageClosure() {
  // Table E.1
  var SubbandsGainLog2 = {
    'LL': 0,
    'LH': 1,
    'HL': 1,
    'HH': 2
  };
  function JpxImage() {
    this.failOnCorruptedImage = false;
  }
  JpxImage.prototype = {
    load: function JpxImage_load(url) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = (function() {
        // TODO catch parse error
        var data = new Uint8Array(xhr.response || xhr.mozResponseArrayBuffer);
        this.parse(data);
        if (this.onload)
          this.onload();
      }).bind(this);
      xhr.send(null);
    },
    parse: function JpxImage_parse(data) {
      function readUint(data, offset, bytes) {
        var n = 0;
        for (var i = 0; i < bytes; i++)
          n = n * 256 + (data[offset + i] & 0xFF);
        return n;
      }
      var position = 0, length = data.length;
      while (position < length) {
        var headerSize = 8;
        var lbox = readUint(data, position, 4);
        var tbox = readUint(data, position + 4, 4);
        position += headerSize;
        if (lbox == 1) {
          lbox = readUint(data, position, 8);
          position += 8;
          headerSize += 8;
        }
        if (lbox === 0)
          lbox = length - position + headerSize;
        if (lbox < headerSize)
          error('JPX error: Invalid box field size');
        var dataLength = lbox - headerSize;
        var jumpDataLength = true;
        switch (tbox) {
          case 0x6A501A1A: // 'jP\032\032'
            // TODO
            break;
          case 0x6A703268: // 'jp2h'
            jumpDataLength = false; // parsing child boxes
            break;
          case 0x636F6C72: // 'colr'
            // TODO
            break;
          case 0x6A703263: // 'jp2c'
            this.parseCodestream(data, position, position + dataLength);
            break;
        }
        if (jumpDataLength)
          position += dataLength;
      }
    },
    parseCodestream: function JpxImage_parseCodestream(data, start, end) {
      var context = {};
      try {
        var position = start;
        while (position < end) {
          var code = readUint16(data, position);
          position += 2;

          var length = 0, j;
          switch (code) {
            case 0xFF4F: // Start of codestream (SOC)
              context.mainHeader = true;
              break;
            case 0xFFD9: // End of codestream (EOC)
              break;
            case 0xFF51: // Image and tile size (SIZ)
              length = readUint16(data, position);
              var siz = {};
              siz.Xsiz = readUint32(data, position + 4);
              siz.Ysiz = readUint32(data, position + 8);
              siz.XOsiz = readUint32(data, position + 12);
              siz.YOsiz = readUint32(data, position + 16);
              siz.XTsiz = readUint32(data, position + 20);
              siz.YTsiz = readUint32(data, position + 24);
              siz.XTOsiz = readUint32(data, position + 28);
              siz.YTOsiz = readUint32(data, position + 32);
              var componentsCount = readUint16(data, position + 36);
              siz.Csiz = componentsCount;
              var components = [];
              j = position + 38;
              for (var i = 0; i < componentsCount; i++) {
                var component = {
                  precision: (data[j] & 0x7F) + 1,
                  isSigned: !!(data[j] & 0x80),
                  XRsiz: data[j + 1],
                  YRsiz: data[j + 1]
                };
                calculateComponentDimensions(component, siz);
                components.push(component);
              }
              context.SIZ = siz;
              context.components = components;
              calculateTileGrids(context, components);
              context.QCC = [];
              context.COC = [];
              break;
            case 0xFF5C: // Quantization default (QCD)
              length = readUint16(data, position);
              var qcd = {};
              j = position + 2;
              var sqcd = data[j++];
              var spqcdSize, scalarExpounded;
              switch (sqcd & 0x1F) {
                case 0:
                  spqcdSize = 8;
                  scalarExpounded = true;
                  break;
                case 1:
                  spqcdSize = 16;
                  scalarExpounded = false;
                  break;
                case 2:
                  spqcdSize = 16;
                  scalarExpounded = true;
                  break;
                default:
                  throw 'Invalid SQcd value ' + sqcd;
              }
              qcd.noQuantization = spqcdSize == 8;
              qcd.scalarExpounded = scalarExpounded;
              qcd.guardBits = sqcd >> 5;
              var spqcds = [];
              while (j < length + position) {
                var spqcd = {};
                if (spqcdSize == 8) {
                  spqcd.epsilon = data[j++] >> 3;
                  spqcd.mu = 0;
                } else {
                  spqcd.epsilon = data[j] >> 3;
                  spqcd.mu = ((data[j] & 0x7) << 8) | data[j + 1];
                  j += 2;
                }
                spqcds.push(spqcd);
              }
              qcd.SPqcds = spqcds;
              if (context.mainHeader)
                context.QCD = qcd;
              else {
                context.currentTile.QCD = qcd;
                context.currentTile.QCC = [];
              }
              break;
            case 0xFF5D: // Quantization component (QCC)
              length = readUint16(data, position);
              var qcc = {};
              j = position + 2;
              var cqcc;
              if (context.SIZ.Csiz < 257)
                cqcc = data[j++];
              else {
                cqcc = readUint16(data, j);
                j += 2;
              }
              var sqcd = data[j++];
              var spqcdSize, scalarExpounded;
              switch (sqcd & 0x1F) {
                case 0:
                  spqcdSize = 8;
                  scalarExpounded = true;
                  break;
                case 1:
                  spqcdSize = 16;
                  scalarExpounded = false;
                  break;
                case 2:
                  spqcdSize = 16;
                  scalarExpounded = true;
                  break;
                default:
                  throw 'Invalid SQcd value ' + sqcd;
              }
              qcc.noQuantization = spqcdSize == 8;
              qcc.scalarExpounded = scalarExpounded;
              qcc.guardBits = sqcd >> 5;
              var spqcds = [];
              while (j < length + position) {
                var spqcd = {};
                if (spqcdSize == 8) {
                  spqcd.epsilon = data[j++] >> 3;
                  spqcd.mu = 0;
                } else {
                  spqcd.epsilon = data[j] >> 3;
                  spqcd.mu = ((data[j] & 0x7) << 8) | data[j + 1];
                  j += 2;
                }
                spqcds.push(spqcd);
              }
              qcc.SPqcds = spqcds;
              if (context.mainHeader)
                context.QCC[cqcc] = qcc;
              else
                context.currentTile.QCC[cqcc] = qcc;
              break;
            case 0xFF52: // Coding style default (COD)
              length = readUint16(data, position);
              var cod = {};
              j = position + 2;
              var scod = data[j++];
              cod.entropyCoderWithCustomPrecincts = !!(scod & 1);
              cod.sopMarkerUsed = !!(scod & 2);
              cod.ephMarkerUsed = !!(scod & 4);
              var codingStyle = {};
              cod.progressionOrder = data[j++];
              cod.layersCount = readUint16(data, j);
              j += 2;
              cod.multipleComponentTransform = data[j++];

              cod.decompositionLevelsCount = data[j++];
              cod.xcb = (data[j++] & 0xF) + 2;
              cod.ycb = (data[j++] & 0xF) + 2;
              var blockStyle = data[j++];
              cod.selectiveArithmeticCodingBypass = !!(blockStyle & 1);
              cod.resetContextProbabilities = !!(blockStyle & 2);
              cod.terminationOnEachCodingPass = !!(blockStyle & 4);
              cod.verticalyStripe = !!(blockStyle & 8);
              cod.predictableTermination = !!(blockStyle & 16);
              cod.segmentationSymbolUsed = !!(blockStyle & 32);
              cod.transformation = data[j++];
              if (cod.entropyCoderWithCustomPrecincts) {
                var precinctsSizes = {};
                while (j < length + position) {
                  var precinctsSize = data[j];
                  precinctsSizes.push({
                    PPx: precinctsSize & 0xF,
                    PPy: precinctsSize >> 4
                  });
                }
                cod.precinctsSizes = precinctsSizes;
              }

              if (cod.sopMarkerUsed || cod.ephMarkerUsed ||
                  cod.selectiveArithmeticCodingBypass ||
                  cod.resetContextProbabilities ||
                  cod.terminationOnEachCodingPass ||
                  cod.verticalyStripe || cod.predictableTermination)
                throw 'Unsupported COD options: ' +
                  globalScope.JSON.stringify(cod);

              if (context.mainHeader)
                context.COD = cod;
              else {
                context.currentTile.COD = cod;
                context.currentTile.COC = [];
              }
              break;
            case 0xFF90: // Start of tile-part (SOT)
              length = readUint16(data, position);
              var tile = {};
              tile.index = readUint16(data, position + 2);
              tile.length = readUint32(data, position + 4);
              tile.dataEnd = tile.length + position - 2;
              tile.partIndex = data[position + 8];
              tile.partsCount = data[position + 9];

              context.mainHeader = false;
              if (tile.partIndex === 0) {
                // reset component specific settings
                tile.COD = context.COD;
                tile.COC = context.COC.slice(0); // clone of the global COC
                tile.QCD = context.QCD;
                tile.QCC = context.QCC.slice(0); // clone of the global COC
              }
              context.currentTile = tile;
              break;
            case 0xFF93: // Start of data (SOD)
              var tile = context.currentTile;
              if (tile.partIndex === 0) {
                initializeTile(context, tile.index);
                buildPackets(context);
              }

              // moving to the end of the data
              length = tile.dataEnd - position;

              parseTilePackets(context, data, position, length);
              break;
            case 0xFF64: // Comment (COM)
              length = readUint16(data, position);
              // skipping content
              break;
            default:
              throw 'Unknown codestream code: ' + code.toString(16);
          }
          position += length;
        }
      } catch (e) {
        if (this.failOnCorruptedImage)
          error('JPX error: ' + e);
        else
          warn('JPX error: ' + e + '. Trying to recover');
      }
      this.tiles = transformComponents(context);
      this.width = context.SIZ.Xsiz - context.SIZ.XOsiz;
      this.height = context.SIZ.Ysiz - context.SIZ.YOsiz;
      this.componentsCount = context.SIZ.Csiz;
    }
  };
  function readUint32(data, offset) {
    return (data[offset] << 24) | (data[offset + 1] << 16) |
      (data[offset + 2] << 8) | data[offset + 3];
  }
  function readUint16(data, offset) {
    return (data[offset] << 8) | data[offset + 1];
  }
  function log2(x) {
    var n = 1, i = 0;
    while (x > n) {
      n <<= 1;
      i++;
    }
    return i;
  }
  function calculateComponentDimensions(component, siz) {
    // Section B.2 Component mapping
    component.x0 = Math.ceil(siz.XOsiz / component.XRsiz);
    component.x1 = Math.ceil(siz.Xsiz / component.XRsiz);
    component.y0 = Math.ceil(siz.YOsiz / component.YRsiz);
    component.y1 = Math.ceil(siz.Ysiz / component.YRsiz);
    component.width = component.x1 - component.x0;
    component.height = component.y1 - component.y0;
  }
  function calculateTileGrids(context, components) {
    var siz = context.SIZ;
    // Section B.3 Division into tile and tile-components
    var tiles = [];
    var numXtiles = Math.ceil((siz.Xsiz - siz.XTOsiz) / siz.XTsiz);
    var numYtiles = Math.ceil((siz.Ysiz - siz.YTOsiz) / siz.YTsiz);
    for (var q = 0; q < numYtiles; q++) {
      for (var p = 0; p < numXtiles; p++) {
        var tile = {};
        tile.tx0 = Math.max(siz.XTOsiz + p * siz.XTsiz, siz.XOsiz);
        tile.ty0 = Math.max(siz.YTOsiz + q * siz.YTsiz, siz.YOsiz);
        tile.tx1 = Math.min(siz.XTOsiz + (p + 1) * siz.XTsiz, siz.Xsiz);
        tile.ty1 = Math.min(siz.YTOsiz + (q + 1) * siz.YTsiz, siz.Ysiz);
        tile.width = tile.tx1 - tile.tx0;
        tile.height = tile.ty1 - tile.ty0;
        tile.components = [];
        tiles.push(tile);
      }
    }
    context.tiles = tiles;

    var componentsCount = siz.Csiz;
    for (var i = 0, ii = componentsCount; i < ii; i++) {
      var component = components[i];
      var tileComponents = [];
      for (var j = 0, jj = tiles.length; j < jj; j++) {
        var tileComponent = {}, tile = tiles[j];
        tileComponent.tcx0 = Math.ceil(tile.tx0 / component.XRsiz);
        tileComponent.tcy0 = Math.ceil(tile.ty0 / component.YRsiz);
        tileComponent.tcx1 = Math.ceil(tile.tx1 / component.XRsiz);
        tileComponent.tcy1 = Math.ceil(tile.ty1 / component.YRsiz);
        tileComponent.width = tileComponent.tcx1 - tileComponent.tcx0;
        tileComponent.height = tileComponent.tcy1 - tileComponent.tcy0;
        tile.components[i] = tileComponent;
      }
    }
  }
  function getBlocksDimensions(context, component, r) {
    var codOrCoc = component.codingStyleParameters;
    var result = {};
    if (!codOrCoc.entropyCoderWithCustomPrecincts) {
      result.PPx = 15;
      result.PPy = 15;
    } else {
      result.PPx = codOrCoc.precinctsSizes[r].PPx;
      result.PPy = codOrCoc.precinctsSizes[r].PPy;
    }
    // calculate codeblock size as described in section B.7
    result.xcb_ = r > 0 ? Math.min(codOrCoc.xcb, result.PPx - 1) :
      Math.min(codOrCoc.xcb, result.PPx);
    result.ycb_ = r > 0 ? Math.min(codOrCoc.ycb, result.PPy - 1) :
      Math.min(codOrCoc.ycb, result.PPy);
    return result;
  }
  function buildPrecincts(context, resolution, dimensions) {
    // Section B.6 Division resolution to precincts
    var precinctWidth = 1 << dimensions.PPx;
    var precinctHeight = 1 << dimensions.PPy;
    var numprecinctswide = resolution.trx1 > resolution.trx0 ?
      Math.ceil(resolution.trx1 / precinctWidth) -
      Math.floor(resolution.trx0 / precinctWidth) : 0;
    var numprecinctshigh = resolution.try1 > resolution.try0 ?
      Math.ceil(resolution.try1 / precinctHeight) -
      Math.floor(resolution.try0 / precinctHeight) : 0;
    var numprecincts = numprecinctswide * numprecinctshigh;
    var precinctXOffset = Math.floor(resolution.trx0 / precinctWidth) *
      precinctWidth;
    var precinctYOffset = Math.floor(resolution.try0 / precinctHeight) *
      precinctHeight;
    resolution.precinctParameters = {
      precinctXOffset: precinctXOffset,
      precinctYOffset: precinctYOffset,
      precinctWidth: precinctWidth,
      precinctHeight: precinctHeight,
      numprecinctswide: numprecinctswide,
      numprecinctshigh: numprecinctshigh,
      numprecincts: numprecincts
    };
  }
  function buildCodeblocks(context, subband, dimensions) {
    // Section B.7 Division sub-band into code-blocks
    var xcb_ = dimensions.xcb_;
    var ycb_ = dimensions.ycb_;
    var codeblockWidth = 1 << xcb_;
    var codeblockHeight = 1 << ycb_;
    var cbx0 = Math.floor(subband.tbx0 / codeblockWidth);
    var cby0 = Math.floor(subband.tby0 / codeblockHeight);
    var cbx1 = Math.ceil(subband.tbx1 / codeblockWidth);
    var cby1 = Math.ceil(subband.tby1 / codeblockHeight);
    var precinctParameters = subband.resolution.precinctParameters;
    var codeblocks = [];
    var precincts = [];
    for (var j = cby0; j < cby1; j++) {
      for (var i = cbx0; i < cbx1; i++) {
        var codeblock = {
          cbx: i,
          cby: j,
          tbx0: codeblockWidth * i,
          tby0: codeblockHeight * j,
          tbx1: codeblockWidth * (i + 1),
          tby1: codeblockHeight * (j + 1)
        };
        // calculate precinct number
        var pi = Math.floor((codeblock.tbx0 -
          precinctParameters.precinctXOffset) /
          precinctParameters.precinctWidth);
        var pj = Math.floor((codeblock.tby0 -
          precinctParameters.precinctYOffset) /
          precinctParameters.precinctHeight);
        var precinctNumber = pj +
          pi * precinctParameters.numprecinctswide;
        codeblock.tbx0_ = Math.max(subband.tbx0, codeblock.tbx0);
        codeblock.tby0_ = Math.max(subband.tby0, codeblock.tby0);
        codeblock.tbx1_ = Math.min(subband.tbx1, codeblock.tbx1);
        codeblock.tby1_ = Math.min(subband.tby1, codeblock.tby1);
        codeblock.precinctNumber = precinctNumber;
        codeblock.subbandType = subband.type;
        var coefficientsLength = (codeblock.tbx1_ - codeblock.tbx0_) *
          (codeblock.tby1_ - codeblock.tby0_);
        codeblock.Lblock = 3;
        codeblocks.push(codeblock);
        // building precinct for the sub-band
        var precinct;
        if (precinctNumber in precincts) {
          precinct = precincts[precinctNumber];
          precinct.cbxMin = Math.min(precinct.cbxMin, i);
          precinct.cbyMin = Math.min(precinct.cbyMin, j);
          precinct.cbxMax = Math.max(precinct.cbxMax, i);
          precinct.cbyMax = Math.max(precinct.cbyMax, j);
        } else {
          precincts[precinctNumber] = precinct = {
            cbxMin: i,
            cbyMin: j,
            cbxMax: i,
            cbyMax: j
          };
        }
        codeblock.precinct = precinct;
      }
    }
    subband.codeblockParameters = {
      codeblockWidth: xcb_,
      codeblockHeight: ycb_,
      numcodeblockwide: cbx1 - cbx0 + 1,
      numcodeblockhigh: cby1 - cby1 + 1
    };
    subband.codeblocks = codeblocks;
    for (var i = 0, ii = codeblocks.length; i < ii; i++) {
      var codeblock = codeblocks[i];
      var precinctNumber = codeblock.precinctNumber;
    }
    subband.precincts = precincts;
  }
  function createPacket(resolution, precinctNumber, layerNumber) {
    var precinctCodeblocks = [];
    // Section B.10.8 Order of info in packet
    var subbands = resolution.subbands;
    // sub-bands already ordered in 'LL', 'HL', 'LH', and 'HH' sequence
    for (var i = 0, ii = subbands.length; i < ii; i++) {
      var subband = subbands[i];
      var codeblocks = subband.codeblocks;
      for (var j = 0, jj = codeblocks.length; j < jj; j++) {
        var codeblock = codeblocks[j];
        if (codeblock.precinctNumber != precinctNumber)
          continue;
        precinctCodeblocks.push(codeblock);
      }
    }
    return {
      layerNumber: layerNumber,
      codeblocks: precinctCodeblocks
    };
  }
  function LayerResolutionComponentPositionIterator(context) {
    var siz = context.SIZ;
    var tileIndex = context.currentTile.index;
    var tile = context.tiles[tileIndex];
    var layersCount = tile.codingStyleDefaultParameters.layersCount;
    var componentsCount = siz.Csiz;
    var maxDecompositionLevelsCount = 0;
    for (var q = 0; q < componentsCount; q++) {
      maxDecompositionLevelsCount = Math.max(maxDecompositionLevelsCount,
        tile.components[q].codingStyleParameters.decompositionLevelsCount);
    }

    var l = 0, r = 0, i = 0, k = 0;

    this.nextPacket = function JpxImage_nextPacket() {
      // Section B.12.1.1 Layer-resolution-component-position
      for (; l < layersCount; l++) {
        for (; r <= maxDecompositionLevelsCount; r++) {
          for (; i < componentsCount; i++) {
            var component = tile.components[i];
            if (r > component.codingStyleParameters.decompositionLevelsCount)
              continue;

            var resolution = component.resolutions[r];
            var numprecincts = resolution.precinctParameters.numprecincts;
            for (; k < numprecincts;) {
              var packet = createPacket(resolution, k, l);
              k++;
              return packet;
            }
            k = 0;
          }
          i = 0;
        }
        r = 0;
      }
      throw 'Out of packets';
    };
  }
  function ResolutionLayerComponentPositionIterator(context) {
    var siz = context.SIZ;
    var tileIndex = context.currentTile.index;
    var tile = context.tiles[tileIndex];
    var layersCount = tile.codingStyleDefaultParameters.layersCount;
    var componentsCount = siz.Csiz;
    var maxDecompositionLevelsCount = 0;
    for (var q = 0; q < componentsCount; q++) {
      maxDecompositionLevelsCount = Math.max(maxDecompositionLevelsCount,
        tile.components[q].codingStyleParameters.decompositionLevelsCount);
    }

    var r = 0, l = 0, i = 0, k = 0;

    this.nextPacket = function JpxImage_nextPacket() {
      // Section B.12.1.2 Resolution-layer-component-position
      for (; r <= maxDecompositionLevelsCount; r++) {
        for (; l < layersCount; l++) {
          for (; i < componentsCount; i++) {
            var component = tile.components[i];
            if (r > component.codingStyleParameters.decompositionLevelsCount)
              continue;

            var resolution = component.resolutions[r];
            var numprecincts = resolution.precinctParameters.numprecincts;
            for (; k < numprecincts;) {
              var packet = createPacket(resolution, k, l);
              k++;
              return packet;
            }
            k = 0;
          }
          i = 0;
        }
        l = 0;
      }
      throw 'Out of packets';
    };
  }
  function buildPackets(context) {
    var siz = context.SIZ;
    var tileIndex = context.currentTile.index;
    var tile = context.tiles[tileIndex];
    var componentsCount = siz.Csiz;
    // Creating resolutions and sub-bands for each component
    for (var c = 0; c < componentsCount; c++) {
      var component = tile.components[c];
      var decompositionLevelsCount =
        component.codingStyleParameters.decompositionLevelsCount;
      // Section B.5 Resolution levels and sub-bands
      var resolutions = [];
      var subbands = [];
      for (var r = 0; r <= decompositionLevelsCount; r++) {
        var blocksDimensions = getBlocksDimensions(context, component, r);
        var resolution = {};
        var scale = 1 << (decompositionLevelsCount - r);
        resolution.trx0 = Math.ceil(component.tcx0 / scale);
        resolution.try0 = Math.ceil(component.tcy0 / scale);
        resolution.trx1 = Math.ceil(component.tcx1 / scale);
        resolution.try1 = Math.ceil(component.tcy1 / scale);
        buildPrecincts(context, resolution, blocksDimensions);
        resolutions.push(resolution);

        var subband;
        if (r === 0) {
          // one sub-band (LL) with last decomposition
          subband = {};
          subband.type = 'LL';
          subband.tbx0 = Math.ceil(component.tcx0 / scale);
          subband.tby0 = Math.ceil(component.tcy0 / scale);
          subband.tbx1 = Math.ceil(component.tcx1 / scale);
          subband.tby1 = Math.ceil(component.tcy1 / scale);
          subband.resolution = resolution;
          buildCodeblocks(context, subband, blocksDimensions);
          subbands.push(subband);
          resolution.subbands = [subband];
        } else {
          var bscale = 1 << (decompositionLevelsCount - r + 1);
          var resolutionSubbands = [];
          // three sub-bands (HL, LH and HH) with rest of decompositions
          subband = {};
          subband.type = 'HL';
          subband.tbx0 = Math.ceil(component.tcx0 / bscale - 0.5);
          subband.tby0 = Math.ceil(component.tcy0 / bscale);
          subband.tbx1 = Math.ceil(component.tcx1 / bscale - 0.5);
          subband.tby1 = Math.ceil(component.tcy1 / bscale);
          subband.resolution = resolution;
          buildCodeblocks(context, subband, blocksDimensions);
          subbands.push(subband);
          resolutionSubbands.push(subband);

          subband = {};
          subband.type = 'LH';
          subband.tbx0 = Math.ceil(component.tcx0 / bscale);
          subband.tby0 = Math.ceil(component.tcy0 / bscale - 0.5);
          subband.tbx1 = Math.ceil(component.tcx1 / bscale);
          subband.tby1 = Math.ceil(component.tcy1 / bscale - 0.5);
          subband.resolution = resolution;
          buildCodeblocks(context, subband, blocksDimensions);
          subbands.push(subband);
          resolutionSubbands.push(subband);

          subband = {};
          subband.type = 'HH';
          subband.tbx0 = Math.ceil(component.tcx0 / bscale - 0.5);
          subband.tby0 = Math.ceil(component.tcy0 / bscale - 0.5);
          subband.tbx1 = Math.ceil(component.tcx1 / bscale - 0.5);
          subband.tby1 = Math.ceil(component.tcy1 / bscale - 0.5);
          subband.resolution = resolution;
          buildCodeblocks(context, subband, blocksDimensions);
          subbands.push(subband);
          resolutionSubbands.push(subband);

          resolution.subbands = resolutionSubbands;
        }
      }
      component.resolutions = resolutions;
      component.subbands = subbands;
    }
    // Generate the packets sequence
    var progressionOrder = tile.codingStyleDefaultParameters.progressionOrder;
    var packetsIterator;
    switch (progressionOrder) {
      case 0:
        tile.packetsIterator =
          new LayerResolutionComponentPositionIterator(context);
        break;
      case 1:
        tile.packetsIterator =
          new ResolutionLayerComponentPositionIterator(context);
        break;
      default:
        throw 'Unsupported progression order ' + progressionOrder;
    }
  }
  function parseTilePackets(context, data, offset, dataLength) {
    var position = 0;
    var buffer, bufferSize = 0, skipNextBit = false;
    function readBits(count) {
      while (bufferSize < count) {
        var b = data[offset + position];
        position++;
        if (skipNextBit) {
          buffer = (buffer << 7) | b;
          bufferSize += 7;
          skipNextBit = false;
        } else {
          buffer = (buffer << 8) | b;
          bufferSize += 8;
        }
        if (b == 0xFF) {
          skipNextBit = true;
        }
      }
      bufferSize -= count;
      return (buffer >>> bufferSize) & ((1 << count) - 1);
    }
    function alignToByte() {
      bufferSize = 0;
      if (skipNextBit) {
        position++;
        skipNextBit = false;
      }
    }
    function readCodingpasses() {
      var value = readBits(1);
      if (value === 0)
        return 1;
      value = (value << 1) | readBits(1);
      if (value == 0x02)
        return 2;
      value = (value << 2) | readBits(2);
      if (value <= 0x0E)
        return (value & 0x03) + 3;
      value = (value << 5) | readBits(5);
      if (value <= 0x1FE)
        return (value & 0x1F) + 6;
      value = (value << 7) | readBits(7);
      return (value & 0x7F) + 37;
    }
    var tileIndex = context.currentTile.index;
    var tile = context.tiles[tileIndex];
    var packetsIterator = tile.packetsIterator;
    while (position < dataLength) {
      var packet = packetsIterator.nextPacket();
      if (!readBits(1)) {
        alignToByte();
        continue;
      }
      var layerNumber = packet.layerNumber;
      var queue = [];
      for (var i = 0, ii = packet.codeblocks.length; i < ii; i++) {
        var codeblock = packet.codeblocks[i];
        var precinct = codeblock.precinct;
        var codeblockColumn = codeblock.cbx - precinct.cbxMin;
        var codeblockRow = codeblock.cby - precinct.cbyMin;
        var codeblockIncluded = false;
        var firstTimeInclusion = false;
        if ('included' in codeblock) {
          codeblockIncluded = !!readBits(1);
        } else {
          // reading inclusion tree
          var precinct = codeblock.precinct;
          var inclusionTree, zeroBitPlanesTree;
          if ('inclusionTree' in precinct) {
            inclusionTree = precinct.inclusionTree;
          } else {
            // building inclusion and zero bit-planes trees
            var width = precinct.cbxMax - precinct.cbxMin + 1;
            var height = precinct.cbyMax - precinct.cbyMin + 1;
            inclusionTree = new InclusionTree(width, height, layerNumber);
            zeroBitPlanesTree = new TagTree(width, height);
            precinct.inclusionTree = inclusionTree;
            precinct.zeroBitPlanesTree = zeroBitPlanesTree;
          }

          if (inclusionTree.reset(codeblockColumn, codeblockRow, layerNumber)) {
            while (true) {
              if (readBits(1)) {
                var valueReady = !inclusionTree.nextLevel();
                if (valueReady) {
                  codeblock.included = true;
                  codeblockIncluded = firstTimeInclusion = true;
                  break;
                }
              } else {
                inclusionTree.incrementValue(layerNumber);
                break;
              }
            }
          }
        }
        if (!codeblockIncluded)
          continue;
        if (firstTimeInclusion) {
          zeroBitPlanesTree = precinct.zeroBitPlanesTree;
          zeroBitPlanesTree.reset(codeblockColumn, codeblockRow);
          while (true) {
            if (readBits(1)) {
              var valueReady = !zeroBitPlanesTree.nextLevel();
              if (valueReady)
                break;
            } else
              zeroBitPlanesTree.incrementValue();
          }
          codeblock.zeroBitPlanes = zeroBitPlanesTree.value;
        }
        var codingpasses = readCodingpasses();
        while (readBits(1))
          codeblock.Lblock++;
        var codingpassesLog2 = log2(codingpasses);
        // rounding down log2
        var bits = ((codingpasses < (1 << codingpassesLog2)) ?
          codingpassesLog2 - 1 : codingpassesLog2) + codeblock.Lblock;
        var codedDataLength = readBits(bits);
        queue.push({
          codeblock: codeblock,
          codingpasses: codingpasses,
          dataLength: codedDataLength
        });
      }
      alignToByte();
      while (queue.length > 0) {
        var packetItem = queue.shift();
        var codeblock = packetItem.codeblock;
        if (!('data' in codeblock))
          codeblock.data = [];
        codeblock.data.push({
          data: data,
          start: offset + position,
          end: offset + position + packetItem.dataLength,
          codingpasses: packetItem.codingpasses
        });
        position += packetItem.dataLength;
      }
    }
    return position;
  }
  function copyCoefficients(coefficients, x0, y0, width, height,
                            delta, mb, codeblocks, transformation,
                            segmentationSymbolUsed) {
    var r = 0.5; // formula (E-6)
    for (var i = 0, ii = codeblocks.length; i < ii; ++i) {
      var codeblock = codeblocks[i];
      var blockWidth = codeblock.tbx1_ - codeblock.tbx0_;
      var blockHeight = codeblock.tby1_ - codeblock.tby0_;
      if (blockWidth === 0 || blockHeight === 0)
        continue;
      if (!('data' in codeblock))
        continue;

      var bitModel, currentCodingpassType;
      bitModel = new BitModel(blockWidth, blockHeight, codeblock.subbandType,
        codeblock.zeroBitPlanes);
      currentCodingpassType = 2; // first bit plane starts from cleanup

      // collect data
      var data = codeblock.data, totalLength = 0, codingpasses = 0;
      for (var q = 0, qq = data.length; q < qq; q++) {
        var dataItem = data[q];
        totalLength += dataItem.end - dataItem.start;
        codingpasses += dataItem.codingpasses;
      }
      var encodedData = new Uint8Array(totalLength), k = 0;
      for (var q = 0, qq = data.length; q < qq; q++) {
        var dataItem = data[q];
        var chunk = dataItem.data.subarray(dataItem.start, dataItem.end);
        encodedData.set(chunk, k);
        k += chunk.length;
      }
      // decoding the item
      var decoder = new ArithmeticDecoder(encodedData, 0, totalLength);
      bitModel.setDecoder(decoder);

      for (var q = 0; q < codingpasses; q++) {
        switch (currentCodingpassType) {
          case 0:
            bitModel.runSignificancePropogationPass();
            break;
          case 1:
            bitModel.runMagnitudeRefinementPass();
            break;
          case 2:
            bitModel.runCleanupPass();
            if (segmentationSymbolUsed)
              bitModel.checkSegmentationSymbol();
            break;
        }
        currentCodingpassType = (currentCodingpassType + 1) % 3;
      }

      var offset = (codeblock.tbx0_ - x0) + (codeblock.tby0_ - y0) * width;
      var position = 0;
      for (var j = 0; j < blockHeight; j++) {
        for (var k = 0; k < blockWidth; k++) {
          var n = (bitModel.coefficentsSign[position] ? -1 : 1) *
            bitModel.coefficentsMagnitude[position];
          var nb = bitModel.bitsDecoded[position], correction;
          if (transformation === 0 || mb > nb) {
            // use r only if transformation is irreversible or
            // not all bitplanes were decoded for reversible transformation
            n += n < 0 ? n - r : n > 0 ? n + r : 0;
            correction = 1 << (mb - nb);
          } else
            correction = 1;
          coefficients[offset++] = n * correction * delta;
          position++;
        }
        offset += width - blockWidth;
      }
    }
  }
  function transformTile(context, tile, c) {
    var component = tile.components[c];
    var codingStyleParameters = component.codingStyleParameters;
    var quantizationParameters = component.quantizationParameters;
    var decompositionLevelsCount =
      codingStyleParameters.decompositionLevelsCount;
    var spqcds = quantizationParameters.SPqcds;
    var scalarExpounded = quantizationParameters.scalarExpounded;
    var guardBits = quantizationParameters.guardBits;
    var transformation = codingStyleParameters.transformation;
    var segmentationSymbolUsed = codingStyleParameters.segmentationSymbolUsed;
    var precision = context.components[c].precision;

    var subbandCoefficients = [];
    var k = 0, b = 0;
    for (var i = 0; i <= decompositionLevelsCount; i++) {
      var resolution = component.resolutions[i];

      for (var j = 0, jj = resolution.subbands.length; j < jj; j++) {
        var mu, epsilon;
        if (!scalarExpounded) {
          // formula E-5
          mu = spqcds[0].mu;
          epsilon = spqcds[0].epsilon + (i > 0 ? 1 - i : 0);
        } else {
          mu = spqcds[b].mu;
          epsilon = spqcds[b].epsilon;
        }

        var subband = resolution.subbands[j];
        var width = subband.tbx1 - subband.tbx0;
        var height = subband.tby1 - subband.tby0;
        var gainLog2 = SubbandsGainLog2[subband.type];

        // calulate quantization coefficient (Section E.1.1.1)
        var delta = Math.pow(2, (precision + gainLog2) - epsilon) *
          (1 + mu / 2048);
        var mb = (guardBits + epsilon - 1);

        var coefficients = new Float32Array(width * height);
        copyCoefficients(coefficients, subband.tbx0, subband.tby0,
          width, height, delta, mb, subband.codeblocks, transformation,
          segmentationSymbolUsed);

        subbandCoefficients.push({
          width: width,
          height: height,
          items: coefficients
        });

        b++;
      }
    }

    var transformation = codingStyleParameters.transformation;
    var transform = transformation === 0 ? new IrreversibleTransform() :
      new ReversibleTransform();
    var result = transform.calculate(subbandCoefficients,
      component.tcx0, component.tcy0);
    return {
      left: component.tcx0,
      top: component.tcy0,
      width: result.width,
      height: result.height,
      items: result.items
    };
  }
  function transformComponents(context) {
    var siz = context.SIZ;
    var components = context.components;
    var componentsCount = siz.Csiz;
    var resultImages = [];
    for (var i = 0, ii = context.tiles.length; i < ii; i++) {
      var tile = context.tiles[i];
      var result = [];
      for (var c = 0; c < componentsCount; c++) {
        var image = transformTile(context, tile, c);
        result.push(image);
      }

      // Section G.2.2 Inverse multi component transform
      if (tile.codingStyleDefaultParameters.multipleComponentTransform) {
        var y0items = result[0].items;
        var y1items = result[1].items;
        var y2items = result[2].items;
        for (var j = 0, jj = y0items.length; j < jj; j++) {
          var y0 = y0items[j], y1 = y1items[j], y2 = y2items[j];
          var i1 = y0 - ((y2 + y1) >> 2);
          y1items[j] = i1;
          y0items[j] = y2 + i1;
          y2items[j] = y1 + i1;
        }
      }

      // Section G.1 DC level shifting to unsigned component values
      for (var c = 0; c < componentsCount; c++) {
        var component = components[c];
        if (component.isSigned)
          continue;

        var offset = 1 << (component.precision - 1);
        var tileImage = result[c];
        var items = tileImage.items;
        for (var j = 0, jj = items.length; j < jj; j++)
          items[j] += offset;
      }

      // To simplify things: shift and clamp output to 8 bit unsigned
      for (var c = 0; c < componentsCount; c++) {
        var component = components[c];
        var offset = component.isSigned ? 128 : 0;
        var shift = component.precision - 8;
        var tileImage = result[c];
        var items = tileImage.items;
        var data = new Uint8Array(items.length);
        for (var j = 0, jj = items.length; j < jj; j++) {
          var value = (items[j] >> shift) + offset;
          data[j] = value < 0 ? 0 : value > 255 ? 255 : value;
        }
        result[c].items = data;
      }

      resultImages.push(result);
    }
    return resultImages;
  }
  function initializeTile(context, tileIndex) {
    var siz = context.SIZ;
    var componentsCount = siz.Csiz;
    var tile = context.tiles[tileIndex];
    var resultTiles = [];
    for (var c = 0; c < componentsCount; c++) {
      var component = tile.components[c];
      var qcdOrQcc = c in context.currentTile.QCC ?
        context.currentTile.QCC[c] : context.currentTile.QCD;
      component.quantizationParameters = qcdOrQcc;
      var codOrCoc = c in context.currentTile.COC ?
        context.currentTile.COC[c] : context.currentTile.COD;
      component.codingStyleParameters = codOrCoc;
    }
    tile.codingStyleDefaultParameters = context.currentTile.COD;
  }

  // Section B.10.2 Tag trees
  var TagTree = (function TagTreeClosure() {
    function TagTree(width, height) {
      var levelsLength = log2(Math.max(width, height)) + 1;
      this.levels = [];
      for (var i = 0; i < levelsLength; i++) {
        var level = {
          width: width,
          height: height,
          items: []
        };
        this.levels.push(level);
        width = Math.ceil(width / 2);
        height = Math.ceil(height / 2);
      }
    }
    TagTree.prototype = {
      reset: function TagTree_reset(i, j) {
        var currentLevel = 0, value = 0;
        while (currentLevel < this.levels.length) {
          var level = this.levels[currentLevel];
          var index = i + j * level.width;
          if (index in level.items) {
            value = level.items[index];
            break;
          }
          level.index = index;
          i >>= 1;
          j >>= 1;
          currentLevel++;
        }
        currentLevel--;
        var level = this.levels[currentLevel];
        level.items[level.index] = value;
        this.currentLevel = currentLevel;
        delete this.value;
      },
      incrementValue: function TagTree_incrementValue() {
        var level = this.levels[this.currentLevel];
        level.items[level.index]++;
      },
      nextLevel: function TagTree_nextLevel() {
        var currentLevel = this.currentLevel;
        var level = this.levels[currentLevel];
        var value = level.items[level.index];
        currentLevel--;
        if (currentLevel < 0) {
          this.value = value;
          return false;
        }

        this.currentLevel = currentLevel;
        var level = this.levels[currentLevel];
        level.items[level.index] = value;
        return true;
      }
    };
    return TagTree;
  })();

  var InclusionTree = (function InclusionTreeClosure() {
    function InclusionTree(width, height,  defaultValue) {
      var levelsLength = log2(Math.max(width, height)) + 1;
      this.levels = [];
      for (var i = 0; i < levelsLength; i++) {
        var items = new Uint8Array(width * height);
        for (var j = 0, jj = items.length; j < jj; j++)
          items[j] = defaultValue;

        var level = {
          width: width,
          height: height,
          items: items
        };
        this.levels.push(level);

        width = Math.ceil(width / 2);
        height = Math.ceil(height / 2);
      }
    }
    InclusionTree.prototype = {
      reset: function InclusionTree_reset(i, j, stopValue) {
        var currentLevel = 0;
        while (currentLevel < this.levels.length) {
          var level = this.levels[currentLevel];
          var index = i + j * level.width;
          level.index = index;
          var value = level.items[index];

          if (value == 0xFF)
            break;

          if (value > stopValue) {
            this.currentLevel = currentLevel;
            // already know about this one, propagating the value to top levels
            this.propagateValues();
            return false;
          }

          i >>= 1;
          j >>= 1;
          currentLevel++;
        }
        this.currentLevel = currentLevel - 1;
        return true;
      },
      incrementValue: function InclusionTree_incrementValue(stopValue) {
        var level = this.levels[this.currentLevel];
        level.items[level.index] = stopValue + 1;
        this.propagateValues();
      },
      propagateValues: function InclusionTree_propagateValues() {
        var levelIndex = this.currentLevel;
        var level = this.levels[levelIndex];
        var currentValue = level.items[level.index];
        while (--levelIndex >= 0) {
          var level = this.levels[levelIndex];
          level.items[level.index] = currentValue;
        }
      },
      nextLevel: function InclusionTree_nextLevel() {
        var currentLevel = this.currentLevel;
        var level = this.levels[currentLevel];
        var value = level.items[level.index];
        level.items[level.index] = 0xFF;
        currentLevel--;
        if (currentLevel < 0)
          return false;

        this.currentLevel = currentLevel;
        var level = this.levels[currentLevel];
        level.items[level.index] = value;
        return true;
      }
    };
    return InclusionTree;
  })();

  // Implements C.3. Arithmetic decoding procedures
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
          if ((this.a & 0x8000) === 0) {
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
          if (this.ct === 0)
            this.byteIn();

          this.a <<= 1;
          this.chigh = ((this.chigh << 1) & 0xFFFF) | ((this.clow >> 15) & 1);
          this.clow = (this.clow << 1) & 0xFFFF;
          this.ct--;
        } while ((this.a & 0x8000) === 0);
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

  // Section D. Coefficient bit modeling
  var BitModel = (function BitModelClosure() {
    // Table D-1
    // The index is binary presentation: 0dddvvhh, ddd - sum of Di (0..4),
    // vv - sum of Vi (0..2), and hh - sum of Hi (0..2)
    var LLAndLHContextsLabel = new Uint8Array([
      0, 5, 8, 0, 3, 7, 8, 0, 4, 7, 8, 0, 0, 0, 0, 0, 1, 6, 8, 0, 3, 7, 8, 0, 4,
      7, 8, 0, 0, 0, 0, 0, 2, 6, 8, 0, 3, 7, 8, 0, 4, 7, 8, 0, 0, 0, 0, 0, 2, 6,
      8, 0, 3, 7, 8, 0, 4, 7, 8, 0, 0, 0, 0, 0, 2, 6, 8, 0, 3, 7, 8, 0, 4, 7, 8
    ]);
    var HLContextLabel = new Uint8Array([
      0, 3, 4, 0, 5, 7, 7, 0, 8, 8, 8, 0, 0, 0, 0, 0, 1, 3, 4, 0, 6, 7, 7, 0, 8,
      8, 8, 0, 0, 0, 0, 0, 2, 3, 4, 0, 6, 7, 7, 0, 8, 8, 8, 0, 0, 0, 0, 0, 2, 3,
      4, 0, 6, 7, 7, 0, 8, 8, 8, 0, 0, 0, 0, 0, 2, 3, 4, 0, 6, 7, 7, 0, 8, 8, 8
    ]);
    var HHContextLabel = new Uint8Array([
      0, 1, 2, 0, 1, 2, 2, 0, 2, 2, 2, 0, 0, 0, 0, 0, 3, 4, 5, 0, 4, 5, 5, 0, 5,
      5, 5, 0, 0, 0, 0, 0, 6, 7, 7, 0, 7, 7, 7, 0, 7, 7, 7, 0, 0, 0, 0, 0, 8, 8,
      8, 0, 8, 8, 8, 0, 8, 8, 8, 0, 0, 0, 0, 0, 8, 8, 8, 0, 8, 8, 8, 0, 8, 8, 8
    ]);

    // Table D-2
    function calcSignContribution(significance0, sign0, significance1, sign1) {
      if (significance1) {
        if (!sign1)
          return significance0 ? (!sign0 ? 1 : 0) : 1;
        else
          return significance0 ? (!sign0 ? 0 : -1) : -1;
      } else
        return significance0 ? (!sign0 ? 1 : -1) : 0;
    }
    // Table D-3
    var SignContextLabels = [
      {contextLabel: 13, xorBit: 0},
      {contextLabel: 12, xorBit: 0},
      {contextLabel: 11, xorBit: 0},
      {contextLabel: 10, xorBit: 0},
      {contextLabel: 9, xorBit: 0},
      {contextLabel: 10, xorBit: 1},
      {contextLabel: 11, xorBit: 1},
      {contextLabel: 12, xorBit: 1},
      {contextLabel: 13, xorBit: 1}
    ];

    function BitModel(width, height, subband, zeroBitPlanes) {
      this.width = width;
      this.height = height;

      this.contextLabelTable = subband == 'HH' ? HHContextLabel :
        subband == 'HL' ? HLContextLabel : LLAndLHContextsLabel;

      var coefficientCount = width * height;

      // coefficients outside the encoding region treated as insignificant
      // add border state cells for significanceState
      this.neighborsSignificance = new Uint8Array(coefficientCount);
      this.coefficentsSign = new Uint8Array(coefficientCount);
      this.coefficentsMagnitude = new Uint32Array(coefficientCount);
      this.processingFlags = new Uint8Array(coefficientCount);

      var bitsDecoded = new Uint8Array(this.width * this.height);
      for (var i = 0, ii = bitsDecoded.length; i < ii; i++)
        bitsDecoded[i] = zeroBitPlanes;
      this.bitsDecoded = bitsDecoded;

      this.reset();
    }

    BitModel.prototype = {
      setDecoder: function BitModel_setDecoder(decoder) {
        this.decoder = decoder;
      },
      reset: function BitModel_reset() {
        this.uniformContext = {index: 46, mps: 0};
        this.runLengthContext = {index: 3, mps: 0};
        this.contexts = [];
        this.contexts.push({index: 4, mps: 0});
        for (var i = 1; i <= 16; i++)
          this.contexts.push({index: 0, mps: 0});
      },
      setNeighborsSignificance:
        function BitModel_setNeighborsSignificance(row, column) {
        var neighborsSignificance = this.neighborsSignificance;
        var width = this.width, height = this.height;
        var index = row * width + column;
        if (row > 0) {
          if (column > 0)
            neighborsSignificance[index - width - 1] += 0x10;
          if (column + 1 < width)
            neighborsSignificance[index - width + 1] += 0x10;
          neighborsSignificance[index - width] += 0x04;
        }
        if (row + 1 < height) {
          if (column > 0)
            neighborsSignificance[index + width - 1] += 0x10;
          if (column + 1 < width)
            neighborsSignificance[index + width + 1] += 0x10;
          neighborsSignificance[index + width] += 0x04;
        }
        if (column > 0)
          neighborsSignificance[index - 1] += 0x01;
        if (column + 1 < width)
          neighborsSignificance[index + 1] += 0x01;
        neighborsSignificance[index] |= 0x80;
      },
      runSignificancePropogationPass:
        function BitModel_runSignificancePropogationPass() {
        var decoder = this.decoder;
        var width = this.width, height = this.height;
        var coefficentsMagnitude = this.coefficentsMagnitude;
        var coefficentsSign = this.coefficentsSign;
        var contextLabels = this.contextLabels;
        var neighborsSignificance = this.neighborsSignificance;
        var processingFlags = this.processingFlags;
        var contexts = this.contexts;
        var labels = this.contextLabelTable;
        var bitsDecoded = this.bitsDecoded;
        // clear processed flag
        var processedInverseMask = ~1;
        var processedMask = 1;
        var firstMagnitudeBitMask = 2;
        for (var q = 0, qq = width * height; q < qq; q++)
          processingFlags[q] &= processedInverseMask;

        for (var i0 = 0; i0 < height; i0 += 4) {
          for (var j = 0; j < width; j++) {
            var index = i0 * width + j;
            for (var i1 = 0; i1 < 4; i1++, index += width) {
              var i = i0 + i1;
              if (i >= height)
                break;

              if (coefficentsMagnitude[index] || !neighborsSignificance[index])
                continue;

              var contextLabel = labels[neighborsSignificance[index]];
              var cx = contexts[contextLabel];
              var decision = decoder.readBit(cx);
              if (decision) {
                var sign = this.decodeSignBit(i, j);
                coefficentsSign[index] = sign;
                coefficentsMagnitude[index] = 1;
                this.setNeighborsSignificance(i, j);
                processingFlags[index] |= firstMagnitudeBitMask;
              }
              bitsDecoded[index]++;
              processingFlags[index] |= processedMask;
            }
          }
        }
      },
      decodeSignBit: function BitModel_decodeSignBit(row, column) {
        var width = this.width, height = this.height;
        var index = row * width + column;
        var coefficentsMagnitude = this.coefficentsMagnitude;
        var coefficentsSign = this.coefficentsSign;
        var horizontalContribution = calcSignContribution(
          column > 0 && coefficentsMagnitude[index - 1],
          coefficentsSign[index - 1],
          column + 1 < width && coefficentsMagnitude[index + 1],
          coefficentsSign[index + 1]);
        var verticalContribution = calcSignContribution(
          row > 0 && coefficentsMagnitude[index - width],
          coefficentsSign[index - width],
          row + 1 < height && coefficentsMagnitude[index + width],
          coefficentsSign[index + width]);

        var contextLabelAndXor = SignContextLabels[
          3 * (1 - horizontalContribution) + (1 - verticalContribution)];
        var contextLabel = contextLabelAndXor.contextLabel;
        var cx = this.contexts[contextLabel];
        var decoded = this.decoder.readBit(cx);
        return decoded ^ contextLabelAndXor.xorBit;
      },
      runMagnitudeRefinementPass:
        function BitModel_runMagnitudeRefinementPass() {
        var decoder = this.decoder;
        var width = this.width, height = this.height;
        var coefficentsMagnitude = this.coefficentsMagnitude;
        var neighborsSignificance = this.neighborsSignificance;
        var contexts = this.contexts;
        var bitsDecoded = this.bitsDecoded;
        var processingFlags = this.processingFlags;
        var processedMask = 1;
        var firstMagnitudeBitMask = 2;
        for (var i0 = 0; i0 < height; i0 += 4) {
          for (var j = 0; j < width; j++) {
            for (var i1 = 0; i1 < 4; i1++) {
              var i = i0 + i1;
              if (i >= height)
                break;
              var index = i * width + j;

              // significant but not those that have just become
              if (!coefficentsMagnitude[index] ||
                (processingFlags[index] & processedMask) !== 0)
                continue;

              var contextLabel = 16;
              if ((processingFlags[index] &
                firstMagnitudeBitMask) !== 0) {
                processingFlags[i * width + j] ^= firstMagnitudeBitMask;
                // first refinement
                var significance = neighborsSignificance[index];
                var sumOfSignificance = (significance & 3) +
                  ((significance >> 2) & 3) + ((significance >> 4) & 7);
                contextLabel = sumOfSignificance >= 1 ? 15 : 14;
              }

              var cx = contexts[contextLabel];
              var bit = decoder.readBit(cx);
              coefficentsMagnitude[index] =
                (coefficentsMagnitude[index] << 1) | bit;
              bitsDecoded[index]++;
              processingFlags[index] |= processedMask;
            }
          }
        }
      },
      runCleanupPass: function BitModel_runCleanupPass() {
        var decoder = this.decoder;
        var width = this.width, height = this.height;
        var neighborsSignificance = this.neighborsSignificance;
        var significanceState = this.significanceState;
        var coefficentsMagnitude = this.coefficentsMagnitude;
        var coefficentsSign = this.coefficentsSign;
        var contexts = this.contexts;
        var labels = this.contextLabelTable;
        var bitsDecoded = this.bitsDecoded;
        var processingFlags = this.processingFlags;
        var processedMask = 1;
        var firstMagnitudeBitMask = 2;
        var oneRowDown = width;
        var twoRowsDown = width * 2;
        var threeRowsDown = width * 3;
        for (var i0 = 0; i0 < height; i0 += 4) {
          for (var j = 0; j < width; j++) {
            var index0 = i0 * width + j;
            // using the property: labels[neighborsSignificance[index]] == 0
            // when neighborsSignificance[index] == 0
            var allEmpty = i0 + 3 < height &&
              processingFlags[index0] === 0 &&
              processingFlags[index0 + oneRowDown] === 0 &&
              processingFlags[index0 + twoRowsDown] === 0 &&
              processingFlags[index0 + threeRowsDown] === 0 &&
              neighborsSignificance[index0] === 0 &&
              neighborsSignificance[index0 + oneRowDown] === 0 &&
              neighborsSignificance[index0 + twoRowsDown] === 0 &&
              neighborsSignificance[index0 + threeRowsDown] === 0;
            var i1 = 0, index = index0;
            var cx, i;
            if (allEmpty) {
              cx = this.runLengthContext;
              var hasSignificantCoefficent = decoder.readBit(cx);
              if (!hasSignificantCoefficent) {
                bitsDecoded[index0]++;
                bitsDecoded[index0 + oneRowDown]++;
                bitsDecoded[index0 + twoRowsDown]++;
                bitsDecoded[index0 + threeRowsDown]++;
                continue; // next column
              }
              cx = this.uniformContext;
              i1 = (decoder.readBit(cx) << 1) | decoder.readBit(cx);
              i = i0 + i1;
              index += i1 * width;

              var sign = this.decodeSignBit(i, j);
              coefficentsSign[index] = sign;
              coefficentsMagnitude[index] = 1;
              this.setNeighborsSignificance(i, j);
              processingFlags[index] |= firstMagnitudeBitMask;

              index = index0;
              for (var i2 = i0; i2 <= i; i2++, index += width)
                bitsDecoded[index]++;

              i1++;
            }
            for (; i1 < 4; i1++, index += width) {
              i = i0 + i1;
              if (i >= height)
                break;

              if (coefficentsMagnitude[index] ||
                (processingFlags[index] & processedMask) !== 0)
                continue;

              var contextLabel = labels[neighborsSignificance[index]];
              cx = contexts[contextLabel];
              var decision = decoder.readBit(cx);
              if (decision == 1) {
                var sign = this.decodeSignBit(i, j);
                coefficentsSign[index] = sign;
                coefficentsMagnitude[index] = 1;
                this.setNeighborsSignificance(i, j);
                processingFlags[index] |= firstMagnitudeBitMask;
              }
              bitsDecoded[index]++;
            }
          }
        }
      },
      checkSegmentationSymbol: function BitModel_checkSegmentationSymbol() {
        var decoder = this.decoder;
        var cx = this.uniformContext;
        var symbol = (decoder.readBit(cx) << 3) | (decoder.readBit(cx) << 2) |
                     (decoder.readBit(cx) << 1) | decoder.readBit(cx);
        if (symbol != 0xA)
          throw 'Invalid segmentation symbol';
      }
    };

    return BitModel;
  })();

  // Section F, Discrete wavelet transofrmation
  var Transform = (function TransformClosure() {
    function Transform() {
    }
    Transform.prototype.calculate =
      function transformCalculate(subbands, u0, v0) {
      var ll = subbands[0];
      for (var i = 1, ii = subbands.length, j = 1; i < ii; i += 3, j++) {
        ll = this.iterate(ll, subbands[i], subbands[i + 1],
                          subbands[i + 2], u0, v0);
      }
      return ll;
    };
    Transform.prototype.expand = function expand(buffer, bufferPadding, step) {
        // Section F.3.7 extending... using max extension of 4
        var i1 = bufferPadding - 1, j1 = bufferPadding + 1;
        var i2 = bufferPadding + step - 2, j2 = bufferPadding + step;
        buffer[i1--] = buffer[j1++];
        buffer[j2++] = buffer[i2--];
        buffer[i1--] = buffer[j1++];
        buffer[j2++] = buffer[i2--];
        buffer[i1--] = buffer[j1++];
        buffer[j2++] = buffer[i2--];
        buffer[i1--] = buffer[j1++];
        buffer[j2++] = buffer[i2--];
    };
    Transform.prototype.iterate = function Transform_iterate(ll, hl, lh, hh,
                                                            u0, v0) {
      var llWidth = ll.width, llHeight = ll.height, llItems = ll.items;
      var hlWidth = hl.width, hlHeight = hl.height, hlItems = hl.items;
      var lhWidth = lh.width, lhHeight = lh.height, lhItems = lh.items;
      var hhWidth = hh.width, hhHeight = hh.height, hhItems = hh.items;

      // Section F.3.3 interleave
      var width = llWidth + hlWidth;
      var height = llHeight + lhHeight;
      var items = new Float32Array(width * height);
      for (var i = 0, ii = llHeight; i < ii; i++) {
        var k = i * llWidth, l = i * 2 * width;
        for (var j = 0, jj = llWidth; j < jj; j++, k++, l += 2)
          items[l] = llItems[k];
      }
      for (var i = 0, ii = hlHeight; i < ii; i++) {
        var k = i * hlWidth, l = i * 2 * width + 1;
        for (var j = 0, jj = hlWidth; j < jj; j++, k++, l += 2)
          items[l] = hlItems[k];
      }
      for (var i = 0, ii = lhHeight; i < ii; i++) {
        var k = i * lhWidth, l = (i * 2 + 1) * width;
        for (var j = 0, jj = lhWidth; j < jj; j++, k++, l += 2)
          items[l] = lhItems[k];
      }
      for (var i = 0, ii = hhHeight; i < ii; i++) {
        var k = i * hhWidth, l = (i * 2 + 1) * width + 1;
        for (var j = 0, jj = hhWidth; j < jj; j++, k++, l += 2)
          items[l] = hhItems[k];
      }

      var bufferPadding = 4;
      var bufferLength = new Float32Array(Math.max(width, height) +
        2 * bufferPadding);
      var buffer = new Float32Array(bufferLength);
      var bufferOut = new Float32Array(bufferLength);

      // Section F.3.4 HOR_SR
      for (var v = 0; v < height; v++) {
        if (width == 1) {
          // if width = 1, when u0 even keep items as is, when odd divide by 2
          if ((u0 % 1) !== 0) {
            items[v * width] /= 2;
          }
          continue;
        }

        var k = v * width;
        var l = bufferPadding;
        for (var u = 0; u < width; u++, k++, l++)
          buffer[l] = items[k];

        this.expand(buffer, bufferPadding, width);
        this.filter(buffer, bufferPadding, width, u0, bufferOut);

        k = v * width;
        l = bufferPadding;
        for (var u = 0; u < width; u++, k++, l++)
          items[k] = bufferOut[l];
      }

      // Section F.3.5 VER_SR
      for (var u = 0; u < width; u++) {
        if (height == 1) {
          // if height = 1, when v0 even keep items as is, when odd divide by 2
          if ((v0 % 1) !== 0) {
            items[u] /= 2;
          }
          continue;
        }

        var k = u;
        var l = bufferPadding;
        for (var v = 0; v < height; v++, k += width, l++)
          buffer[l] = items[k];

        this.expand(buffer, bufferPadding, height);
        this.filter(buffer, bufferPadding, height, v0, bufferOut);

        k = u;
        l = bufferPadding;
        for (var v = 0; v < height; v++, k += width, l++)
          items[k] = bufferOut[l];
      }
      return {
        width: width,
        height: height,
        items: items
      };
    };
    return Transform;
  })();

  // Section 3.8.2 Irreversible 9-7 filter
  var IrreversibleTransform = (function IrreversibleTransformClosure() {
    function IrreversibleTransform() {
      Transform.call(this);
    }

    IrreversibleTransform.prototype = Object.create(Transform.prototype);
    IrreversibleTransform.prototype.filter =
      function irreversibleTransformFilter(y, offset, length, i0, x) {
      var i0_ = Math.floor(i0 / 2);
      var i1_ = Math.floor((i0 + length) / 2);
      var offset_ = offset - (i0 % 1);

      var alpha = -1.586134342059924;
      var beta = -0.052980118572961;
      var gamma = 0.882911075530934;
      var delta = 0.443506852043971;
      var K = 1.230174104914001;
      var K_ = 1 / K;

      // step 1
      var j = offset_ - 2;
      for (var n = i0_ - 1, nn = i1_ + 2; n < nn; n++, j += 2)
        x[j] = K * y[j];

      // step 2
      var j = offset_ - 3;
      for (var n = i0_ - 2, nn = i1_ + 2; n < nn; n++, j += 2)
        x[j] = K_ * y[j];

      // step 3
      var j = offset_ - 2;
      for (var n = i0_ - 1, nn = i1_ + 2; n < nn; n++, j += 2)
        x[j] -= delta * (x[j - 1] + x[j + 1]);

      // step 4
      var j = offset_ - 1;
      for (var n = i0_ - 1, nn = i1_ + 1; n < nn; n++, j += 2)
        x[j] -= gamma * (x[j - 1] + x[j + 1]);

      // step 5
      var j = offset_;
      for (var n = i0_, nn = i1_ + 1; n < nn; n++, j += 2)
        x[j] -= beta * (x[j - 1] + x[j + 1]);

      // step 6
      var j = offset_ + 1;
      for (var n = i0_, nn = i1_; n < nn; n++, j += 2)
        x[j] -= alpha * (x[j - 1] + x[j + 1]);
    };

    return IrreversibleTransform;
  })();

  // Section 3.8.1 Reversible 5-3 filter
  var ReversibleTransform = (function ReversibleTransformClosure() {
    function ReversibleTransform() {
      Transform.call(this);
    }

    ReversibleTransform.prototype = Object.create(Transform.prototype);
    ReversibleTransform.prototype.filter =
      function reversibleTransformFilter(y, offset, length, i0, x) {
      var i0_ = Math.floor(i0 / 2);
      var i1_ = Math.floor((i0 + length) / 2);
      var offset_ = offset - (i0 % 1);

      for (var n = i0_, nn = i1_ + 1, j = offset_; n < nn; n++, j += 2)
        x[j] = y[j] - Math.floor((y[j - 1] + y[j + 1] + 2) / 4);

      for (var n = i0_, nn = i1_, j = offset_ + 1; n < nn; n++, j += 2)
        x[j] = y[j] + Math.floor((x[j - 1] + x[j + 1]) / 2);
    };

    return ReversibleTransform;
  })();

  return JpxImage;
})();

