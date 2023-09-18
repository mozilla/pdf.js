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

import { bytesToString, info, stringToBytes, warn } from "../shared/util.js";
import { Dict, isName, Name, Ref } from "./primitives.js";
import {
  escapePDFName,
  escapeString,
  numberToString,
  parseXFAPath,
} from "./core_utils.js";
import { SimpleDOMNode, SimpleXMLParser } from "./xml_parser.js";
import { BaseStream } from "./base_stream.js";
import { calculateMD5 } from "./crypto.js";

async function writeObject(ref, obj, buffer, { encrypt = null }) {
  const transform = encrypt?.createCipherTransform(ref.num, ref.gen);
  buffer.push(`${ref.num} ${ref.gen} obj\n`);
  if (obj instanceof Dict) {
    await writeDict(obj, buffer, transform);
  } else if (obj instanceof BaseStream) {
    await writeStream(obj, buffer, transform);
  } else if (Array.isArray(obj)) {
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
  let string = stream.getString();
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

  if (
    typeof CompressionStream !== "undefined" &&
    (string.length >= MIN_LENGTH_FOR_COMPRESSING || isFilterZeroFlateDecode)
  ) {
    try {
      const byteArray = stringToBytes(string);
      const cs = new CompressionStream("deflate");
      const writer = cs.writable.getWriter();
      writer.write(byteArray);
      writer.close();

      // Response::text doesn't return the correct data.
      const buf = await new Response(cs.readable).arrayBuffer();
      string = bytesToString(new Uint8Array(buf));

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
  } else if (Array.isArray(value)) {
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

function writeXFADataForAcroform(str, newRefs) {
  const xml = new SimpleXMLParser({ hasAttributes: true }).parseFromString(str);

  for (const { xfa } of newRefs) {
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
  newRefs,
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

  const buffer = [];
  await writeObject(acroFormRef, dict, buffer, xref);

  newRefs.push({ ref: acroFormRef, data: buffer.join("") });
}

function updateXFA({ xfaData, xfaDatasetsRef, newRefs, xref }) {
  if (xfaData === null) {
    const datasets = xref.fetchIfRef(xfaDatasetsRef);
    xfaData = writeXFADataForAcroform(datasets.getString(), newRefs);
  }

  const encrypt = xref.encrypt;
  if (encrypt) {
    const transform = encrypt.createCipherTransform(
      xfaDatasetsRef.num,
      xfaDatasetsRef.gen
    );
    xfaData = transform.encryptString(xfaData);
  }
  const data =
    `${xfaDatasetsRef.num} ${xfaDatasetsRef.gen} obj\n` +
    `<< /Type /EmbeddedFile /Length ${xfaData.length}>>\nstream\n` +
    xfaData +
    "\nendstream\nendobj\n";

  newRefs.push({ ref: xfaDatasetsRef, data });
}

async function incrementalUpdate({
  originalData,
  xrefInfo,
  newRefs,
  xref = null,
  hasXfa = false,
  xfaDatasetsRef = null,
  hasXfaDatasetsEntry = false,
  needAppearances,
  acroFormRef = null,
  acroForm = null,
  xfaData = null,
}) {
  await updateAcroform({
    xref,
    acroForm,
    acroFormRef,
    hasXfa,
    hasXfaDatasetsEntry,
    xfaDatasetsRef,
    needAppearances,
    newRefs,
  });

  if (hasXfa) {
    updateXFA({
      xfaData,
      xfaDatasetsRef,
      newRefs,
      xref,
    });
  }

  const newXref = new Dict(null);
  const refForXrefTable = xrefInfo.newRef;

  let buffer, baseOffset;
  const lastByte = originalData.at(-1);
  if (lastByte === /* \n */ 0x0a || lastByte === /* \r */ 0x0d) {
    buffer = [];
    baseOffset = originalData.length;
  } else {
    // Avoid to concatenate %%EOF with an object definition
    buffer = ["\n"];
    baseOffset = originalData.length + 1;
  }

  newXref.set("Size", refForXrefTable.num + 1);
  newXref.set("Prev", xrefInfo.startXRef);
  newXref.set("Type", Name.get("XRef"));

  if (xrefInfo.rootRef !== null) {
    newXref.set("Root", xrefInfo.rootRef);
  }
  if (xrefInfo.infoRef !== null) {
    newXref.set("Info", xrefInfo.infoRef);
  }
  if (xrefInfo.encryptRef !== null) {
    newXref.set("Encrypt", xrefInfo.encryptRef);
  }

  // Add a ref for the new xref and sort them
  newRefs.push({ ref: refForXrefTable, data: "" });
  newRefs = newRefs.sort((a, b) => {
    // compare the refs
    return a.ref.num - b.ref.num;
  });

  const xrefTableData = [[0, 1, 0xffff]];
  const indexes = [0, 1];
  let maxOffset = 0;
  for (const { ref, data } of newRefs) {
    maxOffset = Math.max(maxOffset, baseOffset);
    xrefTableData.push([1, baseOffset, Math.min(ref.gen, 0xffff)]);
    baseOffset += data.length;
    indexes.push(ref.num, 1);
    buffer.push(data);
  }

  newXref.set("Index", indexes);

  if (Array.isArray(xrefInfo.fileIds) && xrefInfo.fileIds.length > 0) {
    const md5 = computeMD5(baseOffset, xrefInfo);
    newXref.set("ID", [xrefInfo.fileIds[0], md5]);
  }

  const offsetSize = Math.ceil(Math.log2(maxOffset) / 8);
  const sizes = [1, offsetSize, 2];
  const structSize = sizes[0] + sizes[1] + sizes[2];
  const tableLength = structSize * xrefTableData.length;
  newXref.set("W", sizes);
  newXref.set("Length", tableLength);

  buffer.push(`${refForXrefTable.num} ${refForXrefTable.gen} obj\n`);
  await writeDict(newXref, buffer, null);
  buffer.push(" stream\n");

  const bufferLen = buffer.reduce((a, str) => a + str.length, 0);
  const footer = `\nendstream\nendobj\nstartxref\n${baseOffset}\n%%EOF\n`;
  const array = new Uint8Array(
    originalData.length + bufferLen + tableLength + footer.length
  );

  // Original data
  array.set(originalData);
  let offset = originalData.length;

  // New data
  for (const str of buffer) {
    writeString(str, offset, array);
    offset += str.length;
  }

  // New xref table
  for (const [type, objOffset, gen] of xrefTableData) {
    offset = writeInt(type, sizes[0], offset, array);
    offset = writeInt(objOffset, sizes[1], offset, array);
    offset = writeInt(gen, sizes[2], offset, array);
  }

  // Add the footer
  writeString(footer, offset, array);

  return array;
}

export { incrementalUpdate, writeDict, writeObject };
