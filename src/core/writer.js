/* Copyright 2020 Mozilla Foundation
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

import { bytesToString, info, warn } from "../shared/util.js";
import { Dict, isName, Name, Ref } from "./primitives.js";
import {
  escapePDFName,
  escapeString,
  getSizeInBytes,
  numberToString,
  parseXFAPath,
} from "./core_utils.js";
import { SimpleDOMNode, SimpleXMLParser } from "./xml_parser.js";
import { Stream, StringStream } from "./stream.js";
import { BaseStream } from "./base_stream.js";
import { calculateMD5 } from "./crypto.js";

async function writeObject(ref, obj, buffer, { encrypt = null }) {
  const transform = encrypt?.createCipherTransform(ref.num, ref.gen);
  buffer.push(`${ref.num} ${ref.gen} obj\n`);
  if (obj instanceof Dict) {
    await writeDict(obj, buffer, transform);
  } else if (obj instanceof BaseStream) {
    await writeStream(obj, buffer, transform);
  } else if (Array.isArray(obj) || ArrayBuffer.isView(obj)) {
    await writeArray(obj, buffer, transform);
  }
  buffer.push("\nendobj\n");
}

async function writeDict(dict, buffer, transform) {
  buffer.push("<<");
  for (const key of dict.getKeys()) {
    buffer.push(` /${escapePDFName(key)} `);
    await writeValue(dict.getRaw(key), buffer, transform);
  }
  buffer.push(">>");
}

async function writeStream(stream, buffer, transform) {
  let bytes = stream.getBytes();
  const { dict } = stream;

  const [filter, params] = await Promise.all([
    dict.getAsync("Filter"),
    dict.getAsync("DecodeParms"),
  ]);

  const filterZero = Array.isArray(filter)
    ? await dict.xref.fetchIfRefAsync(filter[0])
    : filter;
  const isFilterZeroFlateDecode = isName(filterZero, "FlateDecode");

  // If the string is too small there is no real benefit in compressing it.
  // The number 256 is arbitrary, but it should be reasonable.
  const MIN_LENGTH_FOR_COMPRESSING = 256;

  if (bytes.length >= MIN_LENGTH_FOR_COMPRESSING || isFilterZeroFlateDecode) {
    try {
      const cs = new CompressionStream("deflate");
      const writer = cs.writable.getWriter();
      await writer.ready;
      writer
        .write(bytes)
        .then(async () => {
          await writer.ready;
          await writer.close();
        })
        .catch(() => {});

      // Response::text doesn't return the correct data.
      const buf = await new Response(cs.readable).arrayBuffer();
      bytes = new Uint8Array(buf);

      let newFilter, newParams;
      if (!filter) {
        newFilter = Name.get("FlateDecode");
      } else if (!isFilterZeroFlateDecode) {
        newFilter = Array.isArray(filter)
          ? [Name.get("FlateDecode"), ...filter]
          : [Name.get("FlateDecode"), filter];
        if (params) {
          newParams = Array.isArray(params)
            ? [null, ...params]
            : [null, params];
        }
      }
      if (newFilter) {
        dict.set("Filter", newFilter);
      }
      if (newParams) {
        dict.set("DecodeParms", newParams);
      }
    } catch (ex) {
      info(`writeStream - cannot compress data: "${ex}".`);
    }
  }

  let string = bytesToString(bytes);
  if (transform) {
    string = transform.encryptString(string);
  }

  dict.set("Length", string.length);
  await writeDict(dict, buffer, transform);
  buffer.push(" stream\n", string, "\nendstream");
}

async function writeArray(array, buffer, transform) {
  buffer.push("[");
  let first = true;
  for (const val of array) {
    if (!first) {
      buffer.push(" ");
    } else {
      first = false;
    }
    await writeValue(val, buffer, transform);
  }
  buffer.push("]");
}

async function writeValue(value, buffer, transform) {
  if (value instanceof Name) {
    buffer.push(`/${escapePDFName(value.name)}`);
  } else if (value instanceof Ref) {
    buffer.push(`${value.num} ${value.gen} R`);
  } else if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    await writeArray(value, buffer, transform);
  } else if (typeof value === "string") {
    if (transform) {
      value = transform.encryptString(value);
    }
    buffer.push(`(${escapeString(value)})`);
  } else if (typeof value === "number") {
    buffer.push(numberToString(value));
  } else if (typeof value === "boolean") {
    buffer.push(value.toString());
  } else if (value instanceof Dict) {
    await writeDict(value, buffer, transform);
  } else if (value instanceof BaseStream) {
    await writeStream(value, buffer, transform);
  } else if (value === null) {
    buffer.push("null");
  } else {
    warn(`Unhandled value in writer: ${typeof value}, please file a bug.`);
  }
}

function writeInt(number, size, offset, buffer) {
  for (let i = size + offset - 1; i > offset - 1; i--) {
    buffer[i] = number & 0xff;
    number >>= 8;
  }
  return offset + size;
}

function writeString(string, offset, buffer) {
  for (let i = 0, len = string.length; i < len; i++) {
    buffer[offset + i] = string.charCodeAt(i) & 0xff;
  }
}

function computeMD5(filesize, xrefInfo) {
  const time = Math.floor(Date.now() / 1000);
  const filename = xrefInfo.filename || "";
  const md5Buffer = [time.toString(), filename, filesize.toString()];
  let md5BufferLen = md5Buffer.reduce((a, str) => a + str.length, 0);
  for (const value of Object.values(xrefInfo.info)) {
    md5Buffer.push(value);
    md5BufferLen += value.length;
  }

  const array = new Uint8Array(md5BufferLen);
  let offset = 0;
  for (const str of md5Buffer) {
    writeString(str, offset, array);
    offset += str.length;
  }
  return bytesToString(calculateMD5(array));
}

function writeXFADataForAcroform(str, changes) {
  const xml = new SimpleXMLParser({ hasAttributes: true }).parseFromString(str);

  for (const { xfa } of changes) {
    if (!xfa) {
      continue;
    }
    const { path, value } = xfa;
    if (!path) {
      continue;
    }
    const nodePath = parseXFAPath(path);
    let node = xml.documentElement.searchNode(nodePath, 0);
    if (!node && nodePath.length > 1) {
      // If we're lucky the last element in the path will identify the node.
      node = xml.documentElement.searchNode([nodePath.at(-1)], 0);
    }
    if (node) {
      node.childNodes = Array.isArray(value)
        ? value.map(val => new SimpleDOMNode("value", val))
        : [new SimpleDOMNode("#text", value)];
    } else {
      warn(`Node not found for path: ${path}`);
    }
  }
  const buffer = [];
  xml.documentElement.dump(buffer);
  return buffer.join("");
}

async function updateAcroform({
  xref,
  acroForm,
  acroFormRef,
  hasXfa,
  hasXfaDatasetsEntry,
  xfaDatasetsRef,
  needAppearances,
  changes,
}) {
  if (hasXfa && !hasXfaDatasetsEntry && !xfaDatasetsRef) {
    warn("XFA - Cannot save it");
  }

  if (!needAppearances && (!hasXfa || !xfaDatasetsRef || hasXfaDatasetsEntry)) {
    return;
  }

  const dict = acroForm.clone();

  if (hasXfa && !hasXfaDatasetsEntry) {
    // We've a XFA array which doesn't contain a datasets entry.
    // So we'll update the AcroForm dictionary to have an XFA containing
    // the datasets.
    const newXfa = acroForm.get("XFA").slice();
    newXfa.splice(2, 0, "datasets");
    newXfa.splice(3, 0, xfaDatasetsRef);

    dict.set("XFA", newXfa);
  }

  if (needAppearances) {
    dict.set("NeedAppearances", true);
  }

  changes.put(acroFormRef, {
    data: dict,
  });
}

function updateXFA({ xfaData, xfaDatasetsRef, changes, xref }) {
  if (xfaData === null) {
    const datasets = xref.fetchIfRef(xfaDatasetsRef);
    xfaData = writeXFADataForAcroform(datasets.getString(), changes);
  }
  const xfaDataStream = new StringStream(xfaData);
  xfaDataStream.dict = new Dict(xref);
  xfaDataStream.dict.set("Type", Name.get("EmbeddedFile"));

  changes.put(xfaDatasetsRef, {
    data: xfaDataStream,
  });
}

async function getXRefTable(xrefInfo, baseOffset, newRefs, newXref, buffer) {
  buffer.push("xref\n");
  const indexes = getIndexes(newRefs);
  let indexesPosition = 0;
  for (const { ref, data } of newRefs) {
    if (ref.num === indexes[indexesPosition]) {
      buffer.push(
        `${indexes[indexesPosition]} ${indexes[indexesPosition + 1]}\n`
      );
      indexesPosition += 2;
    }
    // The EOL is \r\n to make sure that every entry is exactly 20 bytes long.
    // (see 7.5.4 - Cross-Reference Table).
    if (data !== null) {
      buffer.push(
        `${baseOffset.toString().padStart(10, "0")} ${Math.min(ref.gen, 0xffff).toString().padStart(5, "0")} n\r\n`
      );
      baseOffset += data.length;
    } else {
      buffer.push(
        `0000000000 ${Math.min(ref.gen + 1, 0xffff)
          .toString()
          .padStart(5, "0")} f\r\n`
      );
    }
  }
  computeIDs(baseOffset, xrefInfo, newXref);
  buffer.push("trailer\n");
  await writeDict(newXref, buffer);
  buffer.push("\nstartxref\n", baseOffset.toString(), "\n%%EOF\n");
}

function getIndexes(newRefs) {
  const indexes = [];
  for (const { ref } of newRefs) {
    if (ref.num === indexes.at(-2) + indexes.at(-1)) {
      indexes[indexes.length - 1] += 1;
    } else {
      indexes.push(ref.num, 1);
    }
  }
  return indexes;
}

async function getXRefStreamTable(
  xrefInfo,
  baseOffset,
  newRefs,
  newXref,
  buffer
) {
  const xrefTableData = [];
  let maxOffset = 0;
  let maxGen = 0;
  for (const { ref, data } of newRefs) {
    let gen;
    maxOffset = Math.max(maxOffset, baseOffset);
    if (data !== null) {
      gen = Math.min(ref.gen, 0xffff);
      xrefTableData.push([1, baseOffset, gen]);
      baseOffset += data.length;
    } else {
      gen = Math.min(ref.gen + 1, 0xffff);
      xrefTableData.push([0, 0, gen]);
    }
    maxGen = Math.max(maxGen, gen);
  }
  newXref.set("Index", getIndexes(newRefs));
  const offsetSize = getSizeInBytes(maxOffset);
  const maxGenSize = getSizeInBytes(maxGen);
  const sizes = [1, offsetSize, maxGenSize];
  newXref.set("W", sizes);
  computeIDs(baseOffset, xrefInfo, newXref);

  const structSize = sizes.reduce((a, x) => a + x, 0);
  const data = new Uint8Array(structSize * xrefTableData.length);
  const stream = new Stream(data);
  stream.dict = newXref;

  let offset = 0;
  for (const [type, objOffset, gen] of xrefTableData) {
    offset = writeInt(type, sizes[0], offset, data);
    offset = writeInt(objOffset, sizes[1], offset, data);
    offset = writeInt(gen, sizes[2], offset, data);
  }

  await writeObject(xrefInfo.newRef, stream, buffer, {});
  buffer.push("startxref\n", baseOffset.toString(), "\n%%EOF\n");
}

function computeIDs(baseOffset, xrefInfo, newXref) {
  if (Array.isArray(xrefInfo.fileIds) && xrefInfo.fileIds.length > 0) {
    const md5 = computeMD5(baseOffset, xrefInfo);
    newXref.set("ID", [xrefInfo.fileIds[0], md5]);
  }
}

function getTrailerDict(xrefInfo, changes, useXrefStream) {
  const newXref = new Dict(null);
  newXref.set("Prev", xrefInfo.startXRef);
  const refForXrefTable = xrefInfo.newRef;
  if (useXrefStream) {
    changes.put(refForXrefTable, { data: "" });
    newXref.set("Size", refForXrefTable.num + 1);
    newXref.set("Type", Name.get("XRef"));
  } else {
    newXref.set("Size", refForXrefTable.num);
  }
  if (xrefInfo.rootRef !== null) {
    newXref.set("Root", xrefInfo.rootRef);
  }
  if (xrefInfo.infoRef !== null) {
    newXref.set("Info", xrefInfo.infoRef);
  }
  if (xrefInfo.encryptRef !== null) {
    newXref.set("Encrypt", xrefInfo.encryptRef);
  }
  return newXref;
}

async function writeChanges(changes, xref, buffer = []) {
  const newRefs = [];
  for (const [ref, { data }] of changes.items()) {
    if (data === null || typeof data === "string") {
      newRefs.push({ ref, data });
      continue;
    }
    await writeObject(ref, data, buffer, xref);
    newRefs.push({ ref, data: buffer.join("") });
    buffer.length = 0;
  }
  return newRefs.sort((a, b) => /* compare the refs */ a.ref.num - b.ref.num);
}

async function incrementalUpdate({
  originalData,
  xrefInfo,
  changes,
  xref = null,
  hasXfa = false,
  xfaDatasetsRef = null,
  hasXfaDatasetsEntry = false,
  needAppearances,
  acroFormRef = null,
  acroForm = null,
  xfaData = null,
  useXrefStream = false,
}) {
  await updateAcroform({
    xref,
    acroForm,
    acroFormRef,
    hasXfa,
    hasXfaDatasetsEntry,
    xfaDatasetsRef,
    needAppearances,
    changes,
  });

  if (hasXfa) {
    updateXFA({
      xfaData,
      xfaDatasetsRef,
      changes,
      xref,
    });
  }

  const newXref = getTrailerDict(xrefInfo, changes, useXrefStream);
  const buffer = [];
  const newRefs = await writeChanges(changes, xref, buffer);
  let baseOffset = originalData.length;
  const lastByte = originalData.at(-1);
  if (lastByte !== /* \n */ 0x0a && lastByte !== /* \r */ 0x0d) {
    // Avoid to concatenate %%EOF with an object definition
    buffer.push("\n");
    baseOffset += 1;
  }

  for (const { data } of newRefs) {
    if (data !== null) {
      buffer.push(data);
    }
  }

  await (useXrefStream
    ? getXRefStreamTable(xrefInfo, baseOffset, newRefs, newXref, buffer)
    : getXRefTable(xrefInfo, baseOffset, newRefs, newXref, buffer));

  const totalLength = buffer.reduce(
    (a, str) => a + str.length,
    originalData.length
  );
  const array = new Uint8Array(totalLength);

  // Original data
  array.set(originalData);
  let offset = originalData.length;

  // New data
  for (const str of buffer) {
    writeString(str, offset, array);
    offset += str.length;
  }

  return array;
}

export { incrementalUpdate, writeChanges, writeDict, writeObject };
