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

import { stringToBytes } from "../shared/util.js";

const OTF_HEADER_SIZE = 12;
const OTF_TABLE_ENTRY_SIZE = 16;

function computeOpenTypeChecksum(view, start = 0, end = view.byteLength) {
  let checksum = 0;
  let offset = start;
  for (; offset + 4 <= end; offset += 4) {
    checksum = (checksum + view.getUint32(offset)) >>> 0;
  }
  // Pad the last word with zeros when the table length isn't a multiple of 4.
  for (let shift = 24; offset < end; offset++, shift -= 8) {
    checksum += view.getUint8(offset) << shift;
  }
  return checksum >>> 0;
}

class OpenTypeFileBuilder {
  #tables = new Map();

  constructor(sfnt) {
    this.sfnt = sfnt;
  }

  static getSearchParams(entriesCount, entrySize) {
    let maxPower2 = 1,
      log2 = 0;
    while ((maxPower2 ^ entriesCount) > maxPower2) {
      maxPower2 <<= 1;
      log2++;
    }
    const searchRange = maxPower2 * entrySize;
    return {
      range: searchRange,
      entry: log2,
      rangeShift: entrySize * entriesCount - searchRange,
    };
  }

  toArray() {
    let sfnt = this.sfnt;

    // Tables needs to be written by ascendant alphabetic order
    const tables = this.#tables;
    const tablesNames = [...tables.keys()].sort();
    const numTables = tablesNames.length;

    // layout the tables data
    let offset = OTF_HEADER_SIZE + numTables * OTF_TABLE_ENTRY_SIZE;
    const tableOffsets = [offset];
    for (let i = 0; i < numTables; i++) {
      const table = tables.get(tablesNames[i]);
      const paddedLength = ((table.length + 3) & ~3) >>> 0;
      offset += paddedLength;
      tableOffsets.push(offset);
    }

    const file = new Uint8Array(offset),
      view = new DataView(file.buffer);
    // write the table data first (mostly for checksum)
    for (let i = 0; i < numTables; i++) {
      const table = tables.get(tablesNames[i]);
      file.set(table, tableOffsets[i]);
    }

    // sfnt version (4 bytes)
    if (sfnt === "true") {
      // Windows hates the Mac TrueType sfnt version number
      sfnt = "\x00\x01\x00\x00";
    }
    file.set(stringToBytes(sfnt), 0);

    // numTables (2 bytes)
    view.setInt16(4, numTables);

    const searchParams = OpenTypeFileBuilder.getSearchParams(numTables, 16);

    // searchRange (2 bytes)
    view.setInt16(6, searchParams.range);
    // entrySelector (2 bytes)
    view.setInt16(8, searchParams.entry);
    // rangeShift (2 bytes)
    view.setInt16(10, searchParams.rangeShift);

    offset = OTF_HEADER_SIZE;
    // writing table entries
    for (let i = 0; i < numTables; i++) {
      const tableName = tablesNames[i];
      file.set(stringToBytes(tableName), offset);

      // checksum
      view.setInt32(
        offset + 4,
        computeOpenTypeChecksum(view, tableOffsets[i], tableOffsets[i + 1])
      );

      // offset
      view.setInt32(offset + 8, tableOffsets[i]);
      // length
      view.setInt32(offset + 12, tables.get(tableName).length);

      offset += OTF_TABLE_ENTRY_SIZE;
    }

    this.#tables.clear();
    return file;
  }

  addTable(tag, data) {
    if (this.#tables.has(tag)) {
      throw new Error(`Table ${tag} already exists`);
    }
    this.#tables.set(tag, data);
  }
}

export { computeOpenTypeChecksum, OpenTypeFileBuilder };
