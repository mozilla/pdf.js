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

import { readUint32 } from "./core_utils.js";
import { string32 } from "../shared/util.js";

function writeInt16(dest, offset, num) {
  dest[offset] = (num >> 8) & 0xff;
  dest[offset + 1] = num & 0xff;
}

function writeInt32(dest, offset, num) {
  dest[offset] = (num >> 24) & 0xff;
  dest[offset + 1] = (num >> 16) & 0xff;
  dest[offset + 2] = (num >> 8) & 0xff;
  dest[offset + 3] = num & 0xff;
}

function writeData(dest, offset, data) {
  if (data instanceof Uint8Array) {
    dest.set(data, offset);
  } else if (typeof data === "string") {
    for (let i = 0, ii = data.length; i < ii; i++) {
      dest[offset++] = data.charCodeAt(i) & 0xff;
    }
  } else {
    // treating everything else as array
    for (let i = 0, ii = data.length; i < ii; i++) {
      dest[offset++] = data[i] & 0xff;
    }
  }
}

const OTF_HEADER_SIZE = 12;
const OTF_TABLE_ENTRY_SIZE = 16;

class OpenTypeFileBuilder {
  constructor(sfnt) {
    this.sfnt = sfnt;
    this.tables = Object.create(null);
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
    const tables = this.tables;
    const tablesNames = Object.keys(tables);
    tablesNames.sort();
    const numTables = tablesNames.length;

    let i, j, jj, table, tableName;
    // layout the tables data
    let offset = OTF_HEADER_SIZE + numTables * OTF_TABLE_ENTRY_SIZE;
    const tableOffsets = [offset];
    for (i = 0; i < numTables; i++) {
      table = tables[tablesNames[i]];
      const paddedLength = ((table.length + 3) & ~3) >>> 0;
      offset += paddedLength;
      tableOffsets.push(offset);
    }

    const file = new Uint8Array(offset);
    // write the table data first (mostly for checksum)
    for (i = 0; i < numTables; i++) {
      table = tables[tablesNames[i]];
      writeData(file, tableOffsets[i], table);
    }

    // sfnt version (4 bytes)
    if (sfnt === "true") {
      // Windows hates the Mac TrueType sfnt version number
      sfnt = string32(0x00010000);
    }
    file[0] = sfnt.charCodeAt(0) & 0xff;
    file[1] = sfnt.charCodeAt(1) & 0xff;
    file[2] = sfnt.charCodeAt(2) & 0xff;
    file[3] = sfnt.charCodeAt(3) & 0xff;

    // numTables (2 bytes)
    writeInt16(file, 4, numTables);

    const searchParams = OpenTypeFileBuilder.getSearchParams(numTables, 16);

    // searchRange (2 bytes)
    writeInt16(file, 6, searchParams.range);
    // entrySelector (2 bytes)
    writeInt16(file, 8, searchParams.entry);
    // rangeShift (2 bytes)
    writeInt16(file, 10, searchParams.rangeShift);

    offset = OTF_HEADER_SIZE;
    // writing table entries
    for (i = 0; i < numTables; i++) {
      tableName = tablesNames[i];
      file[offset] = tableName.charCodeAt(0) & 0xff;
      file[offset + 1] = tableName.charCodeAt(1) & 0xff;
      file[offset + 2] = tableName.charCodeAt(2) & 0xff;
      file[offset + 3] = tableName.charCodeAt(3) & 0xff;

      // checksum
      let checksum = 0;
      for (j = tableOffsets[i], jj = tableOffsets[i + 1]; j < jj; j += 4) {
        const quad = readUint32(file, j);
        checksum = (checksum + quad) >>> 0;
      }
      writeInt32(file, offset + 4, checksum);

      // offset
      writeInt32(file, offset + 8, tableOffsets[i]);
      // length
      writeInt32(file, offset + 12, tables[tableName].length);

      offset += OTF_TABLE_ENTRY_SIZE;
    }
    return file;
  }

  addTable(tag, data) {
    if (tag in this.tables) {
      throw new Error("Table " + tag + " already exists");
    }
    this.tables[tag] = data;
  }
}

export { OpenTypeFileBuilder };
