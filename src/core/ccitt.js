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
/* Copyright 1996-2003 Glyph & Cog, LLC
 *
 * The CCITT stream implementation contained in this file is a JavaScript port
 * of XPDF's implementation, made available under the Apache 2.0 open source
 * license.
 */

import { FormatError, info } from "../shared/util.js";

/**
 * @typedef {Object} CCITTFaxDecoderSource
 * @property {function} next - Method that return one byte of data for decoding,
 *   or -1 when EOF is reached.
 */

const ccittEOL = -2;
const ccittEOF = -1;
const twoDimPass = 0;
const twoDimHoriz = 1;
const twoDimVert0 = 2;
const twoDimVertR1 = 3;
const twoDimVertL1 = 4;
const twoDimVertR2 = 5;
const twoDimVertL2 = 6;
const twoDimVertR3 = 7;
const twoDimVertL3 = 8;

// prettier-ignore
const twoDimTable = [
  [-1, -1], [-1, -1],                   // 000000x
  [7, twoDimVertL3],                    // 0000010
  [7, twoDimVertR3],                    // 0000011
  [6, twoDimVertL2], [6, twoDimVertL2], // 000010x
  [6, twoDimVertR2], [6, twoDimVertR2], // 000011x
  [4, twoDimPass], [4, twoDimPass],     // 0001xxx
  [4, twoDimPass], [4, twoDimPass],
  [4, twoDimPass], [4, twoDimPass],
  [4, twoDimPass], [4, twoDimPass],
  [3, twoDimHoriz], [3, twoDimHoriz],   // 001xxxx
  [3, twoDimHoriz], [3, twoDimHoriz],
  [3, twoDimHoriz], [3, twoDimHoriz],
  [3, twoDimHoriz], [3, twoDimHoriz],
  [3, twoDimHoriz], [3, twoDimHoriz],
  [3, twoDimHoriz], [3, twoDimHoriz],
  [3, twoDimHoriz], [3, twoDimHoriz],
  [3, twoDimHoriz], [3, twoDimHoriz],
  [3, twoDimVertL1], [3, twoDimVertL1], // 010xxxx
  [3, twoDimVertL1], [3, twoDimVertL1],
  [3, twoDimVertL1], [3, twoDimVertL1],
  [3, twoDimVertL1], [3, twoDimVertL1],
  [3, twoDimVertL1], [3, twoDimVertL1],
  [3, twoDimVertL1], [3, twoDimVertL1],
  [3, twoDimVertL1], [3, twoDimVertL1],
  [3, twoDimVertL1], [3, twoDimVertL1],
  [3, twoDimVertR1], [3, twoDimVertR1], // 011xxxx
  [3, twoDimVertR1], [3, twoDimVertR1],
  [3, twoDimVertR1], [3, twoDimVertR1],
  [3, twoDimVertR1], [3, twoDimVertR1],
  [3, twoDimVertR1], [3, twoDimVertR1],
  [3, twoDimVertR1], [3, twoDimVertR1],
  [3, twoDimVertR1], [3, twoDimVertR1],
  [3, twoDimVertR1], [3, twoDimVertR1],
  [1, twoDimVert0], [1, twoDimVert0],   // 1xxxxxx
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0],
  [1, twoDimVert0], [1, twoDimVert0]
];

// prettier-ignore
const whiteTable1 = [
  [-1, -1],                               // 00000
  [12, ccittEOL],                         // 00001
  [-1, -1], [-1, -1],                     // 0001x
  [-1, -1], [-1, -1], [-1, -1], [-1, -1], // 001xx
  [-1, -1], [-1, -1], [-1, -1], [-1, -1], // 010xx
  [-1, -1], [-1, -1], [-1, -1], [-1, -1], // 011xx
  [11, 1792], [11, 1792],                 // 1000x
  [12, 1984],                             // 10010
  [12, 2048],                             // 10011
  [12, 2112],                             // 10100
  [12, 2176],                             // 10101
  [12, 2240],                             // 10110
  [12, 2304],                             // 10111
  [11, 1856], [11, 1856],                 // 1100x
  [11, 1920], [11, 1920],                 // 1101x
  [12, 2368],                             // 11100
  [12, 2432],                             // 11101
  [12, 2496],                             // 11110
  [12, 2560]                              // 11111
];

// prettier-ignore
const whiteTable2 = [
  [-1, -1], [-1, -1], [-1, -1], [-1, -1],     // 0000000xx
  [8, 29], [8, 29],                           // 00000010x
  [8, 30], [8, 30],                           // 00000011x
  [8, 45], [8, 45],                           // 00000100x
  [8, 46], [8, 46],                           // 00000101x
  [7, 22], [7, 22], [7, 22], [7, 22],         // 0000011xx
  [7, 23], [7, 23], [7, 23], [7, 23],         // 0000100xx
  [8, 47], [8, 47],                           // 00001010x
  [8, 48], [8, 48],                           // 00001011x
  [6, 13], [6, 13], [6, 13], [6, 13],         // 000011xxx
  [6, 13], [6, 13], [6, 13], [6, 13],
  [7, 20], [7, 20], [7, 20], [7, 20],         // 0001000xx
  [8, 33], [8, 33],                           // 00010010x
  [8, 34], [8, 34],                           // 00010011x
  [8, 35], [8, 35],                           // 00010100x
  [8, 36], [8, 36],                           // 00010101x
  [8, 37], [8, 37],                           // 00010110x
  [8, 38], [8, 38],                           // 00010111x
  [7, 19], [7, 19], [7, 19], [7, 19],         // 0001100xx
  [8, 31], [8, 31],                           // 00011010x
  [8, 32], [8, 32],                           // 00011011x
  [6, 1], [6, 1], [6, 1], [6, 1],             // 000111xxx
  [6, 1], [6, 1], [6, 1], [6, 1],
  [6, 12], [6, 12], [6, 12], [6, 12],         // 001000xxx
  [6, 12], [6, 12], [6, 12], [6, 12],
  [8, 53], [8, 53],                           // 00100100x
  [8, 54], [8, 54],                           // 00100101x
  [7, 26], [7, 26], [7, 26], [7, 26],         // 0010011xx
  [8, 39], [8, 39],                           // 00101000x
  [8, 40], [8, 40],                           // 00101001x
  [8, 41], [8, 41],                           // 00101010x
  [8, 42], [8, 42],                           // 00101011x
  [8, 43], [8, 43],                           // 00101100x
  [8, 44], [8, 44],                           // 00101101x
  [7, 21], [7, 21], [7, 21], [7, 21],         // 0010111xx
  [7, 28], [7, 28], [7, 28], [7, 28],         // 0011000xx
  [8, 61], [8, 61],                           // 00110010x
  [8, 62], [8, 62],                           // 00110011x
  [8, 63], [8, 63],                           // 00110100x
  [8, 0], [8, 0],                             // 00110101x
  [8, 320], [8, 320],                         // 00110110x
  [8, 384], [8, 384],                         // 00110111x
  [5, 10], [5, 10], [5, 10], [5, 10],         // 00111xxxx
  [5, 10], [5, 10], [5, 10], [5, 10],
  [5, 10], [5, 10], [5, 10], [5, 10],
  [5, 10], [5, 10], [5, 10], [5, 10],
  [5, 11], [5, 11], [5, 11], [5, 11],         // 01000xxxx
  [5, 11], [5, 11], [5, 11], [5, 11],
  [5, 11], [5, 11], [5, 11], [5, 11],
  [5, 11], [5, 11], [5, 11], [5, 11],
  [7, 27], [7, 27], [7, 27], [7, 27],         // 0100100xx
  [8, 59], [8, 59],                           // 01001010x
  [8, 60], [8, 60],                           // 01001011x
  [9, 1472],                                  // 010011000
  [9, 1536],                                  // 010011001
  [9, 1600],                                  // 010011010
  [9, 1728],                                  // 010011011
  [7, 18], [7, 18], [7, 18], [7, 18],         // 0100111xx
  [7, 24], [7, 24], [7, 24], [7, 24],         // 0101000xx
  [8, 49], [8, 49],                           // 01010010x
  [8, 50], [8, 50],                           // 01010011x
  [8, 51], [8, 51],                           // 01010100x
  [8, 52], [8, 52],                           // 01010101x
  [7, 25], [7, 25], [7, 25], [7, 25],         // 0101011xx
  [8, 55], [8, 55],                           // 01011000x
  [8, 56], [8, 56],                           // 01011001x
  [8, 57], [8, 57],                           // 01011010x
  [8, 58], [8, 58],                           // 01011011x
  [6, 192], [6, 192], [6, 192], [6, 192],     // 010111xxx
  [6, 192], [6, 192], [6, 192], [6, 192],
  [6, 1664], [6, 1664], [6, 1664], [6, 1664], // 011000xxx
  [6, 1664], [6, 1664], [6, 1664], [6, 1664],
  [8, 448], [8, 448],                         // 01100100x
  [8, 512], [8, 512],                         // 01100101x
  [9, 704],                                   // 011001100
  [9, 768],                                   // 011001101
  [8, 640], [8, 640],                         // 01100111x
  [8, 576], [8, 576],                         // 01101000x
  [9, 832],                                   // 011010010
  [9, 896],                                   // 011010011
  [9, 960],                                   // 011010100
  [9, 1024],                                  // 011010101
  [9, 1088],                                  // 011010110
  [9, 1152],                                  // 011010111
  [9, 1216],                                  // 011011000
  [9, 1280],                                  // 011011001
  [9, 1344],                                  // 011011010
  [9, 1408],                                  // 011011011
  [7, 256], [7, 256], [7, 256], [7, 256],     // 0110111xx
  [4, 2], [4, 2], [4, 2], [4, 2],             // 0111xxxxx
  [4, 2], [4, 2], [4, 2], [4, 2],
  [4, 2], [4, 2], [4, 2], [4, 2],
  [4, 2], [4, 2], [4, 2], [4, 2],
  [4, 2], [4, 2], [4, 2], [4, 2],
  [4, 2], [4, 2], [4, 2], [4, 2],
  [4, 2], [4, 2], [4, 2], [4, 2],
  [4, 2], [4, 2], [4, 2], [4, 2],
  [4, 3], [4, 3], [4, 3], [4, 3],             // 1000xxxxx
  [4, 3], [4, 3], [4, 3], [4, 3],
  [4, 3], [4, 3], [4, 3], [4, 3],
  [4, 3], [4, 3], [4, 3], [4, 3],
  [4, 3], [4, 3], [4, 3], [4, 3],
  [4, 3], [4, 3], [4, 3], [4, 3],
  [4, 3], [4, 3], [4, 3], [4, 3],
  [4, 3], [4, 3], [4, 3], [4, 3],
  [5, 128], [5, 128], [5, 128], [5, 128],     // 10010xxxx
  [5, 128], [5, 128], [5, 128], [5, 128],
  [5, 128], [5, 128], [5, 128], [5, 128],
  [5, 128], [5, 128], [5, 128], [5, 128],
  [5, 8], [5, 8], [5, 8], [5, 8],             // 10011xxxx
  [5, 8], [5, 8], [5, 8], [5, 8],
  [5, 8], [5, 8], [5, 8], [5, 8],
  [5, 8], [5, 8], [5, 8], [5, 8],
  [5, 9], [5, 9], [5, 9], [5, 9],             // 10100xxxx
  [5, 9], [5, 9], [5, 9], [5, 9],
  [5, 9], [5, 9], [5, 9], [5, 9],
  [5, 9], [5, 9], [5, 9], [5, 9],
  [6, 16], [6, 16], [6, 16], [6, 16],         // 101010xxx
  [6, 16], [6, 16], [6, 16], [6, 16],
  [6, 17], [6, 17], [6, 17], [6, 17],         // 101011xxx
  [6, 17], [6, 17], [6, 17], [6, 17],
  [4, 4], [4, 4], [4, 4], [4, 4],             // 1011xxxxx
  [4, 4], [4, 4], [4, 4], [4, 4],
  [4, 4], [4, 4], [4, 4], [4, 4],
  [4, 4], [4, 4], [4, 4], [4, 4],
  [4, 4], [4, 4], [4, 4], [4, 4],
  [4, 4], [4, 4], [4, 4], [4, 4],
  [4, 4], [4, 4], [4, 4], [4, 4],
  [4, 4], [4, 4], [4, 4], [4, 4],
  [4, 5], [4, 5], [4, 5], [4, 5],             // 1100xxxxx
  [4, 5], [4, 5], [4, 5], [4, 5],
  [4, 5], [4, 5], [4, 5], [4, 5],
  [4, 5], [4, 5], [4, 5], [4, 5],
  [4, 5], [4, 5], [4, 5], [4, 5],
  [4, 5], [4, 5], [4, 5], [4, 5],
  [4, 5], [4, 5], [4, 5], [4, 5],
  [4, 5], [4, 5], [4, 5], [4, 5],
  [6, 14], [6, 14], [6, 14], [6, 14],         // 110100xxx
  [6, 14], [6, 14], [6, 14], [6, 14],
  [6, 15], [6, 15], [6, 15], [6, 15],         // 110101xxx
  [6, 15], [6, 15], [6, 15], [6, 15],
  [5, 64], [5, 64], [5, 64], [5, 64],         // 11011xxxx
  [5, 64], [5, 64], [5, 64], [5, 64],
  [5, 64], [5, 64], [5, 64], [5, 64],
  [5, 64], [5, 64], [5, 64], [5, 64],
  [4, 6], [4, 6], [4, 6], [4, 6],             // 1110xxxxx
  [4, 6], [4, 6], [4, 6], [4, 6],
  [4, 6], [4, 6], [4, 6], [4, 6],
  [4, 6], [4, 6], [4, 6], [4, 6],
  [4, 6], [4, 6], [4, 6], [4, 6],
  [4, 6], [4, 6], [4, 6], [4, 6],
  [4, 6], [4, 6], [4, 6], [4, 6],
  [4, 6], [4, 6], [4, 6], [4, 6],
  [4, 7], [4, 7], [4, 7], [4, 7],             // 1111xxxxx
  [4, 7], [4, 7], [4, 7], [4, 7],
  [4, 7], [4, 7], [4, 7], [4, 7],
  [4, 7], [4, 7], [4, 7], [4, 7],
  [4, 7], [4, 7], [4, 7], [4, 7],
  [4, 7], [4, 7], [4, 7], [4, 7],
  [4, 7], [4, 7], [4, 7], [4, 7],
  [4, 7], [4, 7], [4, 7], [4, 7]
];

// prettier-ignore
const blackTable1 = [
  [-1, -1], [-1, -1],                             // 000000000000x
  [12, ccittEOL], [12, ccittEOL],                 // 000000000001x
  [-1, -1], [-1, -1], [-1, -1], [-1, -1],         // 00000000001xx
  [-1, -1], [-1, -1], [-1, -1], [-1, -1],         // 00000000010xx
  [-1, -1], [-1, -1], [-1, -1], [-1, -1],         // 00000000011xx
  [-1, -1], [-1, -1], [-1, -1], [-1, -1],         // 00000000100xx
  [-1, -1], [-1, -1], [-1, -1], [-1, -1],         // 00000000101xx
  [-1, -1], [-1, -1], [-1, -1], [-1, -1],         // 00000000110xx
  [-1, -1], [-1, -1], [-1, -1], [-1, -1],         // 00000000111xx
  [11, 1792], [11, 1792], [11, 1792], [11, 1792], // 00000001000xx
  [12, 1984], [12, 1984],                         // 000000010010x
  [12, 2048], [12, 2048],                         // 000000010011x
  [12, 2112], [12, 2112],                         // 000000010100x
  [12, 2176], [12, 2176],                         // 000000010101x
  [12, 2240], [12, 2240],                         // 000000010110x
  [12, 2304], [12, 2304],                         // 000000010111x
  [11, 1856], [11, 1856], [11, 1856], [11, 1856], // 00000001100xx
  [11, 1920], [11, 1920], [11, 1920], [11, 1920], // 00000001101xx
  [12, 2368], [12, 2368],                         // 000000011100x
  [12, 2432], [12, 2432],                         // 000000011101x
  [12, 2496], [12, 2496],                         // 000000011110x
  [12, 2560], [12, 2560],                         // 000000011111x
  [10, 18], [10, 18], [10, 18], [10, 18],         // 0000001000xxx
  [10, 18], [10, 18], [10, 18], [10, 18],
  [12, 52], [12, 52],                             // 000000100100x
  [13, 640],                                      // 0000001001010
  [13, 704],                                      // 0000001001011
  [13, 768],                                      // 0000001001100
  [13, 832],                                      // 0000001001101
  [12, 55], [12, 55],                             // 000000100111x
  [12, 56], [12, 56],                             // 000000101000x
  [13, 1280],                                     // 0000001010010
  [13, 1344],                                     // 0000001010011
  [13, 1408],                                     // 0000001010100
  [13, 1472],                                     // 0000001010101
  [12, 59], [12, 59],                             // 000000101011x
  [12, 60], [12, 60],                             // 000000101100x
  [13, 1536],                                     // 0000001011010
  [13, 1600],                                     // 0000001011011
  [11, 24], [11, 24], [11, 24], [11, 24],         // 00000010111xx
  [11, 25], [11, 25], [11, 25], [11, 25],         // 00000011000xx
  [13, 1664],                                     // 0000001100100
  [13, 1728],                                     // 0000001100101
  [12, 320], [12, 320],                           // 000000110011x
  [12, 384], [12, 384],                           // 000000110100x
  [12, 448], [12, 448],                           // 000000110101x
  [13, 512],                                      // 0000001101100
  [13, 576],                                      // 0000001101101
  [12, 53], [12, 53],                             // 000000110111x
  [12, 54], [12, 54],                             // 000000111000x
  [13, 896],                                      // 0000001110010
  [13, 960],                                      // 0000001110011
  [13, 1024],                                     // 0000001110100
  [13, 1088],                                     // 0000001110101
  [13, 1152],                                     // 0000001110110
  [13, 1216],                                     // 0000001110111
  [10, 64], [10, 64], [10, 64], [10, 64],         // 0000001111xxx
  [10, 64], [10, 64], [10, 64], [10, 64]
];

// prettier-ignore
const blackTable2 = [
  [8, 13], [8, 13], [8, 13], [8, 13],     // 00000100xxxx
  [8, 13], [8, 13], [8, 13], [8, 13],
  [8, 13], [8, 13], [8, 13], [8, 13],
  [8, 13], [8, 13], [8, 13], [8, 13],
  [11, 23], [11, 23],                     // 00000101000x
  [12, 50],                               // 000001010010
  [12, 51],                               // 000001010011
  [12, 44],                               // 000001010100
  [12, 45],                               // 000001010101
  [12, 46],                               // 000001010110
  [12, 47],                               // 000001010111
  [12, 57],                               // 000001011000
  [12, 58],                               // 000001011001
  [12, 61],                               // 000001011010
  [12, 256],                              // 000001011011
  [10, 16], [10, 16], [10, 16], [10, 16], // 0000010111xx
  [10, 17], [10, 17], [10, 17], [10, 17], // 0000011000xx
  [12, 48],                               // 000001100100
  [12, 49],                               // 000001100101
  [12, 62],                               // 000001100110
  [12, 63],                               // 000001100111
  [12, 30],                               // 000001101000
  [12, 31],                               // 000001101001
  [12, 32],                               // 000001101010
  [12, 33],                               // 000001101011
  [12, 40],                               // 000001101100
  [12, 41],                               // 000001101101
  [11, 22], [11, 22],                     // 00000110111x
  [8, 14], [8, 14], [8, 14], [8, 14],     // 00000111xxxx
  [8, 14], [8, 14], [8, 14], [8, 14],
  [8, 14], [8, 14], [8, 14], [8, 14],
  [8, 14], [8, 14], [8, 14], [8, 14],
  [7, 10], [7, 10], [7, 10], [7, 10],     // 0000100xxxxx
  [7, 10], [7, 10], [7, 10], [7, 10],
  [7, 10], [7, 10], [7, 10], [7, 10],
  [7, 10], [7, 10], [7, 10], [7, 10],
  [7, 10], [7, 10], [7, 10], [7, 10],
  [7, 10], [7, 10], [7, 10], [7, 10],
  [7, 10], [7, 10], [7, 10], [7, 10],
  [7, 10], [7, 10], [7, 10], [7, 10],
  [7, 11], [7, 11], [7, 11], [7, 11],     // 0000101xxxxx
  [7, 11], [7, 11], [7, 11], [7, 11],
  [7, 11], [7, 11], [7, 11], [7, 11],
  [7, 11], [7, 11], [7, 11], [7, 11],
  [7, 11], [7, 11], [7, 11], [7, 11],
  [7, 11], [7, 11], [7, 11], [7, 11],
  [7, 11], [7, 11], [7, 11], [7, 11],
  [7, 11], [7, 11], [7, 11], [7, 11],
  [9, 15], [9, 15], [9, 15], [9, 15],     // 000011000xxx
  [9, 15], [9, 15], [9, 15], [9, 15],
  [12, 128],                              // 000011001000
  [12, 192],                              // 000011001001
  [12, 26],                               // 000011001010
  [12, 27],                               // 000011001011
  [12, 28],                               // 000011001100
  [12, 29],                               // 000011001101
  [11, 19], [11, 19],                     // 00001100111x
  [11, 20], [11, 20],                     // 00001101000x
  [12, 34],                               // 000011010010
  [12, 35],                               // 000011010011
  [12, 36],                               // 000011010100
  [12, 37],                               // 000011010101
  [12, 38],                               // 000011010110
  [12, 39],                               // 000011010111
  [11, 21], [11, 21],                     // 00001101100x
  [12, 42],                               // 000011011010
  [12, 43],                               // 000011011011
  [10, 0], [10, 0], [10, 0], [10, 0],     // 0000110111xx
  [7, 12], [7, 12], [7, 12], [7, 12],     // 0000111xxxxx
  [7, 12], [7, 12], [7, 12], [7, 12],
  [7, 12], [7, 12], [7, 12], [7, 12],
  [7, 12], [7, 12], [7, 12], [7, 12],
  [7, 12], [7, 12], [7, 12], [7, 12],
  [7, 12], [7, 12], [7, 12], [7, 12],
  [7, 12], [7, 12], [7, 12], [7, 12],
  [7, 12], [7, 12], [7, 12], [7, 12]
];

// prettier-ignore
const blackTable3 = [
  [-1, -1], [-1, -1], [-1, -1], [-1, -1], // 0000xx
  [6, 9],                                 // 000100
  [6, 8],                                 // 000101
  [5, 7], [5, 7],                         // 00011x
  [4, 6], [4, 6], [4, 6], [4, 6],         // 0010xx
  [4, 5], [4, 5], [4, 5], [4, 5],         // 0011xx
  [3, 1], [3, 1], [3, 1], [3, 1],         // 010xxx
  [3, 1], [3, 1], [3, 1], [3, 1],
  [3, 4], [3, 4], [3, 4], [3, 4],         // 011xxx
  [3, 4], [3, 4], [3, 4], [3, 4],
  [2, 3], [2, 3], [2, 3], [2, 3],         // 10xxxx
  [2, 3], [2, 3], [2, 3], [2, 3],
  [2, 3], [2, 3], [2, 3], [2, 3],
  [2, 3], [2, 3], [2, 3], [2, 3],
  [2, 2], [2, 2], [2, 2], [2, 2],         // 11xxxx
  [2, 2], [2, 2], [2, 2], [2, 2],
  [2, 2], [2, 2], [2, 2], [2, 2],
  [2, 2], [2, 2], [2, 2], [2, 2]
];

/**
 * @param {CCITTFaxDecoderSource} source - The data which should be decoded.
 * @param {Object} [options] - Decoding options.
 */
class CCITTFaxDecoder {
  constructor(source, options = {}) {
    if (typeof source?.next !== "function") {
      throw new Error('CCITTFaxDecoder - invalid "source" parameter.');
    }
    this.source = source;
    this.eof = false;

    this.encoding = options.K || 0;
    this.eoline = options.EndOfLine || false;
    this.byteAlign = options.EncodedByteAlign || false;
    this.columns = options.Columns || 1728;
    this.rows = options.Rows || 0;
    this.eoblock = options.EndOfBlock ?? true;
    this.black = options.BlackIs1 || false;

    this.codingLine = new Uint32Array(this.columns + 1);
    this.refLine = new Uint32Array(this.columns + 2);

    this.codingLine[0] = this.columns;
    this.codingPos = 0;

    this.row = 0;
    this.nextLine2D = this.encoding < 0;
    this.inputBits = 0;
    this.inputBuf = 0;
    this.outputBits = 0;
    this.rowsDone = false;

    let code1;
    while ((code1 = this._lookBits(12)) === 0) {
      this._eatBits(1);
    }
    if (code1 === 1) {
      this._eatBits(12);
    }
    if (this.encoding > 0) {
      this.nextLine2D = !this._lookBits(1);
      this._eatBits(1);
    }
  }

  readNextChar() {
    if (this.eof) {
      return -1;
    }
    const refLine = this.refLine;
    const codingLine = this.codingLine;
    const columns = this.columns;

    let refPos, blackPixels, bits, i;

    if (this.outputBits === 0) {
      if (this.rowsDone) {
        this.eof = true;
      }
      if (this.eof) {
        return -1;
      }
      this.err = false;

      let code1, code2, code3;
      if (this.nextLine2D) {
        for (i = 0; codingLine[i] < columns; ++i) {
          refLine[i] = codingLine[i];
        }
        refLine[i++] = columns;
        refLine[i] = columns;
        codingLine[0] = 0;
        this.codingPos = 0;
        refPos = 0;
        blackPixels = 0;

        while (codingLine[this.codingPos] < columns) {
          code1 = this._getTwoDimCode();
          switch (code1) {
            case twoDimPass:
              this._addPixels(refLine[refPos + 1], blackPixels);
              if (refLine[refPos + 1] < columns) {
                refPos += 2;
              }
              break;
            case twoDimHoriz:
              code1 = code2 = 0;
              if (blackPixels) {
                do {
                  code1 += code3 = this._getBlackCode();
                } while (code3 >= 64);
                do {
                  code2 += code3 = this._getWhiteCode();
                } while (code3 >= 64);
              } else {
                do {
                  code1 += code3 = this._getWhiteCode();
                } while (code3 >= 64);
                do {
                  code2 += code3 = this._getBlackCode();
                } while (code3 >= 64);
              }
              this._addPixels(codingLine[this.codingPos] + code1, blackPixels);
              if (codingLine[this.codingPos] < columns) {
                this._addPixels(
                  codingLine[this.codingPos] + code2,
                  blackPixels ^ 1
                );
              }
              while (
                refLine[refPos] <= codingLine[this.codingPos] &&
                refLine[refPos] < columns
              ) {
                refPos += 2;
              }
              break;
            case twoDimVertR3:
              this._addPixels(refLine[refPos] + 3, blackPixels);
              blackPixels ^= 1;
              if (codingLine[this.codingPos] < columns) {
                ++refPos;
                while (
                  refLine[refPos] <= codingLine[this.codingPos] &&
                  refLine[refPos] < columns
                ) {
                  refPos += 2;
                }
              }
              break;
            case twoDimVertR2:
              this._addPixels(refLine[refPos] + 2, blackPixels);
              blackPixels ^= 1;
              if (codingLine[this.codingPos] < columns) {
                ++refPos;
                while (
                  refLine[refPos] <= codingLine[this.codingPos] &&
                  refLine[refPos] < columns
                ) {
                  refPos += 2;
                }
              }
              break;
            case twoDimVertR1:
              this._addPixels(refLine[refPos] + 1, blackPixels);
              blackPixels ^= 1;
              if (codingLine[this.codingPos] < columns) {
                ++refPos;
                while (
                  refLine[refPos] <= codingLine[this.codingPos] &&
                  refLine[refPos] < columns
                ) {
                  refPos += 2;
                }
              }
              break;
            case twoDimVert0:
              this._addPixels(refLine[refPos], blackPixels);
              blackPixels ^= 1;
              if (codingLine[this.codingPos] < columns) {
                ++refPos;
                while (
                  refLine[refPos] <= codingLine[this.codingPos] &&
                  refLine[refPos] < columns
                ) {
                  refPos += 2;
                }
              }
              break;
            case twoDimVertL3:
              this._addPixelsNeg(refLine[refPos] - 3, blackPixels);
              blackPixels ^= 1;
              if (codingLine[this.codingPos] < columns) {
                if (refPos > 0) {
                  --refPos;
                } else {
                  ++refPos;
                }
                while (
                  refLine[refPos] <= codingLine[this.codingPos] &&
                  refLine[refPos] < columns
                ) {
                  refPos += 2;
                }
              }
              break;
            case twoDimVertL2:
              this._addPixelsNeg(refLine[refPos] - 2, blackPixels);
              blackPixels ^= 1;
              if (codingLine[this.codingPos] < columns) {
                if (refPos > 0) {
                  --refPos;
                } else {
                  ++refPos;
                }
                while (
                  refLine[refPos] <= codingLine[this.codingPos] &&
                  refLine[refPos] < columns
                ) {
                  refPos += 2;
                }
              }
              break;
            case twoDimVertL1:
              this._addPixelsNeg(refLine[refPos] - 1, blackPixels);
              blackPixels ^= 1;
              if (codingLine[this.codingPos] < columns) {
                if (refPos > 0) {
                  --refPos;
                } else {
                  ++refPos;
                }
                while (
                  refLine[refPos] <= codingLine[this.codingPos] &&
                  refLine[refPos] < columns
                ) {
                  refPos += 2;
                }
              }
              break;
            case ccittEOF:
              this._addPixels(columns, 0);
              this.eof = true;
              break;
            default:
              info("bad 2d code");
              this._addPixels(columns, 0);
              this.err = true;
          }
        }
      } else {
        codingLine[0] = 0;
        this.codingPos = 0;
        blackPixels = 0;
        while (codingLine[this.codingPos] < columns) {
          code1 = 0;
          if (blackPixels) {
            do {
              code1 += code3 = this._getBlackCode();
            } while (code3 >= 64);
          } else {
            do {
              code1 += code3 = this._getWhiteCode();
            } while (code3 >= 64);
          }
          this._addPixels(codingLine[this.codingPos] + code1, blackPixels);
          blackPixels ^= 1;
        }
      }

      let gotEOL = false;

      if (this.byteAlign) {
        this.inputBits &= ~7;
      }

      if (!this.eoblock && this.row === this.rows - 1) {
        this.rowsDone = true;
      } else {
        code1 = this._lookBits(12);
        if (this.eoline) {
          while (code1 !== ccittEOF && code1 !== 1) {
            this._eatBits(1);
            code1 = this._lookBits(12);
          }
        } else {
          while (code1 === 0) {
            this._eatBits(1);
            code1 = this._lookBits(12);
          }
        }
        if (code1 === 1) {
          this._eatBits(12);
          gotEOL = true;
        } else if (code1 === ccittEOF) {
          this.eof = true;
        }
      }

      if (!this.eof && this.encoding > 0 && !this.rowsDone) {
        this.nextLine2D = !this._lookBits(1);
        this._eatBits(1);
      }

      if (this.eoblock && gotEOL && this.byteAlign) {
        code1 = this._lookBits(12);
        if (code1 === 1) {
          this._eatBits(12);
          if (this.encoding > 0) {
            this._lookBits(1);
            this._eatBits(1);
          }
          if (this.encoding >= 0) {
            for (i = 0; i < 4; ++i) {
              code1 = this._lookBits(12);
              if (code1 !== 1) {
                info("bad rtc code: " + code1);
              }
              this._eatBits(12);
              if (this.encoding > 0) {
                this._lookBits(1);
                this._eatBits(1);
              }
            }
          }
          this.eof = true;
        }
      } else if (this.err && this.eoline) {
        while (true) {
          code1 = this._lookBits(13);
          if (code1 === ccittEOF) {
            this.eof = true;
            return -1;
          }
          if (code1 >> 1 === 1) {
            break;
          }
          this._eatBits(1);
        }
        this._eatBits(12);
        if (this.encoding > 0) {
          this._eatBits(1);
          this.nextLine2D = !(code1 & 1);
        }
      }

      this.outputBits =
        codingLine[0] > 0
          ? codingLine[(this.codingPos = 0)]
          : codingLine[(this.codingPos = 1)];
      this.row++;
    }

    let c;
    if (this.outputBits >= 8) {
      c = this.codingPos & 1 ? 0 : 0xff;
      this.outputBits -= 8;
      if (this.outputBits === 0 && codingLine[this.codingPos] < columns) {
        this.codingPos++;
        this.outputBits =
          codingLine[this.codingPos] - codingLine[this.codingPos - 1];
      }
    } else {
      bits = 8;
      c = 0;
      do {
        if (typeof this.outputBits !== "number") {
          throw new FormatError(
            'Invalid /CCITTFaxDecode data, "outputBits" must be a number.'
          );
        }

        if (this.outputBits > bits) {
          c <<= bits;
          if (!(this.codingPos & 1)) {
            c |= 0xff >> (8 - bits);
          }
          this.outputBits -= bits;
          bits = 0;
        } else {
          c <<= this.outputBits;
          if (!(this.codingPos & 1)) {
            c |= 0xff >> (8 - this.outputBits);
          }
          bits -= this.outputBits;
          this.outputBits = 0;
          if (codingLine[this.codingPos] < columns) {
            this.codingPos++;
            this.outputBits =
              codingLine[this.codingPos] - codingLine[this.codingPos - 1];
          } else if (bits > 0) {
            c <<= bits;
            bits = 0;
          }
        }
      } while (bits);
    }
    if (this.black) {
      c ^= 0xff;
    }
    return c;
  }

  /**
   * @private
   */
  _addPixels(a1, blackPixels) {
    const codingLine = this.codingLine;
    let codingPos = this.codingPos;

    if (a1 > codingLine[codingPos]) {
      if (a1 > this.columns) {
        info("row is wrong length");
        this.err = true;
        a1 = this.columns;
      }
      if ((codingPos & 1) ^ blackPixels) {
        ++codingPos;
      }

      codingLine[codingPos] = a1;
    }
    this.codingPos = codingPos;
  }

  /**
   * @private
   */
  _addPixelsNeg(a1, blackPixels) {
    const codingLine = this.codingLine;
    let codingPos = this.codingPos;

    if (a1 > codingLine[codingPos]) {
      if (a1 > this.columns) {
        info("row is wrong length");
        this.err = true;
        a1 = this.columns;
      }
      if ((codingPos & 1) ^ blackPixels) {
        ++codingPos;
      }

      codingLine[codingPos] = a1;
    } else if (a1 < codingLine[codingPos]) {
      if (a1 < 0) {
        info("invalid code");
        this.err = true;
        a1 = 0;
      }
      while (codingPos > 0 && a1 < codingLine[codingPos - 1]) {
        --codingPos;
      }
      codingLine[codingPos] = a1;
    }

    this.codingPos = codingPos;
  }

  /**
   * This function returns the code found from the table.
   * The start and end parameters set the boundaries for searching the table.
   * The limit parameter is optional. Function returns an array with three
   * values. The first array element indicates whether a valid code is being
   * returned. The second array element is the actual code. The third array
   * element indicates whether EOF was reached.
   * @private
   */
  _findTableCode(start, end, table, limit) {
    const limitValue = limit || 0;
    for (let i = start; i <= end; ++i) {
      let code = this._lookBits(i);
      if (code === ccittEOF) {
        return [true, 1, false];
      }
      if (i < end) {
        code <<= end - i;
      }
      if (!limitValue || code >= limitValue) {
        const p = table[code - limitValue];
        if (p[0] === i) {
          this._eatBits(i);
          return [true, p[1], true];
        }
      }
    }
    return [false, 0, false];
  }

  /**
   * @private
   */
  _getTwoDimCode() {
    let code = 0;
    let p;
    if (this.eoblock) {
      code = this._lookBits(7);
      p = twoDimTable[code];
      if (p?.[0] > 0) {
        this._eatBits(p[0]);
        return p[1];
      }
    } else {
      const result = this._findTableCode(1, 7, twoDimTable);
      if (result[0] && result[2]) {
        return result[1];
      }
    }
    info("Bad two dim code");
    return ccittEOF;
  }

  /**
   * @private
   */
  _getWhiteCode() {
    let code = 0;
    let p;
    if (this.eoblock) {
      code = this._lookBits(12);
      if (code === ccittEOF) {
        return 1;
      }

      p = code >> 5 === 0 ? whiteTable1[code] : whiteTable2[code >> 3];

      if (p[0] > 0) {
        this._eatBits(p[0]);
        return p[1];
      }
    } else {
      let result = this._findTableCode(1, 9, whiteTable2);
      if (result[0]) {
        return result[1];
      }

      result = this._findTableCode(11, 12, whiteTable1);
      if (result[0]) {
        return result[1];
      }
    }
    info("bad white code");
    this._eatBits(1);
    return 1;
  }

  /**
   * @private
   */
  _getBlackCode() {
    let code, p;
    if (this.eoblock) {
      code = this._lookBits(13);
      if (code === ccittEOF) {
        return 1;
      }
      if (code >> 7 === 0) {
        p = blackTable1[code];
      } else if (code >> 9 === 0 && code >> 7 !== 0) {
        p = blackTable2[(code >> 1) - 64];
      } else {
        p = blackTable3[code >> 7];
      }

      if (p[0] > 0) {
        this._eatBits(p[0]);
        return p[1];
      }
    } else {
      let result = this._findTableCode(2, 6, blackTable3);
      if (result[0]) {
        return result[1];
      }

      result = this._findTableCode(7, 12, blackTable2, 64);
      if (result[0]) {
        return result[1];
      }

      result = this._findTableCode(10, 13, blackTable1);
      if (result[0]) {
        return result[1];
      }
    }
    info("bad black code");
    this._eatBits(1);
    return 1;
  }

  /**
   * @private
   */
  _lookBits(n) {
    let c;
    while (this.inputBits < n) {
      if ((c = this.source.next()) === -1) {
        if (this.inputBits === 0) {
          return ccittEOF;
        }
        return (this.inputBuf << (n - this.inputBits)) & (0xffff >> (16 - n));
      }
      this.inputBuf = (this.inputBuf << 8) | c;
      this.inputBits += 8;
    }
    return (this.inputBuf >> (this.inputBits - n)) & (0xffff >> (16 - n));
  }

  /**
   * @private
   */
  _eatBits(n) {
    if ((this.inputBits -= n) < 0) {
      this.inputBits = 0;
    }
  }
}

export { CCITTFaxDecoder };
