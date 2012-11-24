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

'use strict';

var Name = (function NameClosure() {
  function Name(name) {
    this.name = name;
  }

  Name.prototype = {};

  return Name;
})();

var Cmd = (function CmdClosure() {
  function Cmd(cmd) {
    this.cmd = cmd;
  }

  Cmd.prototype = {};

  var cmdCache = {};

  Cmd.get = function Cmd_get(cmd) {
    var cmdValue = cmdCache[cmd];
    if (cmdValue)
      return cmdValue;

    return cmdCache[cmd] = new Cmd(cmd);
  };

  return Cmd;
})();

var Dict = (function DictClosure() {
  // xref is optional
  function Dict(xref) {
    // Map should only be used internally, use functions below to access.
    var map = Object.create(null);

    this.assignXref = function Dict_assignXref(newXref) {
      xref = newXref;
    };

    // automatically dereferences Ref objects
    this.get = function Dict_get(key1, key2, key3) {
      var value;
      if (typeof (value = map[key1]) != 'undefined' || key1 in map ||
          typeof key2 == 'undefined') {
        return xref ? xref.fetchIfRef(value) : value;
      }
      if (typeof (value = map[key2]) != 'undefined' || key2 in map ||
          typeof key3 == 'undefined') {
        return xref ? xref.fetchIfRef(value) : value;
      }
      value = map[key3] || null;
      return xref ? xref.fetchIfRef(value) : value;
    };

    // no dereferencing
    this.getRaw = function Dict_getRaw(key) {
      return map[key];
    };

    // creates new map and dereferences all Refs
    this.getAll = function Dict_getAll() {
      var all = {};
      for (var key in map) {
        var obj = this.get(key);
        all[key] = obj instanceof Dict ? obj.getAll() : obj;
      }
      return all;
    };

    this.set = function Dict_set(key, value) {
      map[key] = value;
    };

    this.has = function Dict_has(key) {
      return key in map;
    };

    this.forEach = function Dict_forEach(callback) {
      for (var key in map) {
        callback(key, this.get(key));
      }
    };
  };

  return Dict;
})();

var Ref = (function RefClosure() {
  function Ref(num, gen) {
    this.num = num;
    this.gen = gen;
  }

  Ref.prototype = {};

  return Ref;
})();

// The reference is identified by number and generation,
// this structure stores only one instance of the reference.
var RefSet = (function RefSetClosure() {
  function RefSet() {
    this.dict = {};
  }

  RefSet.prototype = {
    has: function RefSet_has(ref) {
      return !!this.dict['R' + ref.num + '.' + ref.gen];
    },

    put: function RefSet_put(ref) {
      this.dict['R' + ref.num + '.' + ref.gen] = ref;
    }
  };

  return RefSet;
})();

var Catalog = (function CatalogClosure() {
  function Catalog(xref) {
    this.xref = xref;
    var obj = xref.getCatalogObj();
    assertWellFormed(isDict(obj), 'catalog object is not a dictionary');
    this.catDict = obj;
  }

  Catalog.prototype = {
    get metadata() {
      var streamRef = this.catDict.getRaw('Metadata');
      if (!isRef(streamRef))
        return shadow(this, 'metadata', null);

      var encryptMetadata = !this.xref.encrypt ? false :
        this.xref.encrypt.encryptMetadata;

      var stream = this.xref.fetch(streamRef, !encryptMetadata);
      var metadata;
      if (stream && isDict(stream.dict)) {
        var type = stream.dict.get('Type');
        var subtype = stream.dict.get('Subtype');

        if (isName(type) && isName(subtype) &&
            type.name === 'Metadata' && subtype.name === 'XML') {
          // XXX: This should examine the charset the XML document defines,
          // however since there are currently no real means to decode
          // arbitrary charsets, let's just hope that the author of the PDF
          // was reasonable enough to stick with the XML default charset,
          // which is UTF-8.
          try {
            metadata = stringToUTF8String(bytesToString(stream.getBytes()));
          } catch (e) {
            info('Skipping invalid metadata.');
          }
        }
      }

      return shadow(this, 'metadata', metadata);
    },
    get toplevelPagesDict() {
      var pagesObj = this.catDict.get('Pages');
      assertWellFormed(isDict(pagesObj), 'invalid top-level pages dictionary');
      // shadow the prototype getter
      return shadow(this, 'toplevelPagesDict', pagesObj);
    },
    get documentOutline() {
      var xref = this.xref;
      var obj = this.catDict.get('Outlines');
      var root = { items: [] };
      if (isDict(obj)) {
        obj = obj.getRaw('First');
        var processed = new RefSet();
        if (isRef(obj)) {
          var queue = [{obj: obj, parent: root}];
          // to avoid recursion keeping track of the items
          // in the processed dictionary
          processed.put(obj);
          while (queue.length > 0) {
            var i = queue.shift();
            var outlineDict = xref.fetchIfRef(i.obj);
            if (outlineDict === null)
              continue;
            if (!outlineDict.has('Title'))
              error('Invalid outline item');
            var dest = outlineDict.get('A');
            if (dest)
              dest = dest.get('D');
            else if (outlineDict.has('Dest')) {
              dest = outlineDict.getRaw('Dest');
              if (isName(dest))
                dest = dest.name;
            }
            var title = outlineDict.get('Title');
            var outlineItem = {
              dest: dest,
              title: stringToPDFString(title),
              color: outlineDict.get('C') || [0, 0, 0],
              count: outlineDict.get('Count'),
              bold: !!(outlineDict.get('F') & 2),
              italic: !!(outlineDict.get('F') & 1),
              items: []
            };
            i.parent.items.push(outlineItem);
            obj = outlineDict.getRaw('First');
            if (isRef(obj) && !processed.has(obj)) {
              queue.push({obj: obj, parent: outlineItem});
              processed.put(obj);
            }
            obj = outlineDict.getRaw('Next');
            if (isRef(obj) && !processed.has(obj)) {
              queue.push({obj: obj, parent: i.parent});
              processed.put(obj);
            }
          }
        }
      }
      obj = root.items.length > 0 ? root.items : null;
      return shadow(this, 'documentOutline', obj);
    },
    get numPages() {
      var obj = this.toplevelPagesDict.get('Count');
      assertWellFormed(
        isInt(obj),
        'page count in top level pages object is not an integer'
      );
      // shadow the prototype getter
      return shadow(this, 'num', obj);
    },
    traverseKids: function Catalog_traverseKids(pagesDict) {
      var pageCache = this.pageCache;
      var kids = pagesDict.get('Kids');
      assertWellFormed(isArray(kids),
                       'page dictionary kids object is not an array');
      for (var i = 0, ii = kids.length; i < ii; ++i) {
        var kid = kids[i];
        assertWellFormed(isRef(kid),
                        'page dictionary kid is not a reference');
        var obj = this.xref.fetch(kid);
        if (isDict(obj, 'Page') || (isDict(obj) && !obj.has('Kids'))) {
          pageCache.push(new Page(this.xref, pageCache.length, obj, kid));
        } else { // must be a child page dictionary
          assertWellFormed(
            isDict(obj),
            'page dictionary kid reference points to wrong type of object'
          );
          this.traverseKids(obj);
        }
      }
    },
    get destinations() {
      function fetchDestination(dest) {
        return isDict(dest) ? dest.get('D') : dest;
      }

      var xref = this.xref;
      var dests = {}, nameTreeRef, nameDictionaryRef;
      var obj = this.catDict.get('Names');
      if (obj)
        nameTreeRef = obj.getRaw('Dests');
      else if (this.catDict.has('Dests'))
        nameDictionaryRef = this.catDict.get('Dests');

      if (nameDictionaryRef) {
        // reading simple destination dictionary
        obj = nameDictionaryRef;
        obj.forEach(function catalogForEach(key, value) {
          if (!value) return;
          dests[key] = fetchDestination(value);
        });
      }
      if (nameTreeRef) {
        // reading name tree
        var processed = new RefSet();
        processed.put(nameTreeRef);
        var queue = [nameTreeRef];
        while (queue.length > 0) {
          var i, n;
          obj = xref.fetch(queue.shift());
          if (obj.has('Kids')) {
            var kids = obj.get('Kids');
            for (i = 0, n = kids.length; i < n; i++) {
              var kid = kids[i];
              if (processed.has(kid))
                error('invalid destinations');
              queue.push(kid);
              processed.put(kid);
            }
            continue;
          }
          var names = obj.get('Names');
          if (names) {
            for (i = 0, n = names.length; i < n; i += 2) {
              dests[names[i]] = fetchDestination(xref.fetchIfRef(names[i + 1]));
            }
          }
        }
      }
      return shadow(this, 'destinations', dests);
    },
    getPage: function Catalog_getPage(n) {
      var pageCache = this.pageCache;
      if (!pageCache) {
        pageCache = this.pageCache = [];
        this.traverseKids(this.toplevelPagesDict);
      }
      return this.pageCache[n - 1];
    }
  };

  return Catalog;
})();

var XRef = (function XRefClosure() {
  function XRef(stream, startXRef, mainXRefEntriesOffset, password) {
    this.stream = stream;
    this.entries = [];
    this.xrefstms = {};
    var trailerDict = this.readXRef(startXRef);
    trailerDict.assignXref(this);
    this.trailer = trailerDict;
    // prepare the XRef cache
    this.cache = [];

    var encrypt = trailerDict.get('Encrypt');
    if (encrypt) {
      var fileId = trailerDict.get('ID');
      this.encrypt = new CipherTransformFactory(encrypt, fileId[0], password);
    }

    // get the root dictionary (catalog) object
    if (!(this.root = trailerDict.get('Root')))
      error('Invalid root reference');
  }

  XRef.prototype = {
    readXRefTable: function XRef_readXRefTable(parser) {
      // Example of cross-reference table:
      // xref
      // 0 1                    <-- subsection header (first obj #, obj count)
      // 0000000000 65535 f     <-- actual object (offset, generation #, f/n)
      // 23 2                   <-- subsection header ... and so on ...
      // 0000025518 00002 n
      // 0000025635 00000 n
      // trailer
      // ...

      // Outer loop is over subsection headers
      var obj;
      while (!isCmd(obj = parser.getObj(), 'trailer')) {
        var first = obj,
            count = parser.getObj();

        if (!isInt(first) || !isInt(count))
          error('Invalid XRef table: wrong types in subsection header');

        // Inner loop is over objects themselves
        for (var i = 0; i < count; i++) {
          var entry = {};
          entry.offset = parser.getObj();
          entry.gen = parser.getObj();
          var type = parser.getObj();

          if (isCmd(type, 'f'))
            entry.free = true;
          else if (isCmd(type, 'n'))
            entry.uncompressed = true;

          // Validate entry obj
          if (!isInt(entry.offset) || !isInt(entry.gen) ||
              !(entry.free || entry.uncompressed)) {
            error('Invalid entry in XRef subsection: ' + first + ', ' + count);
          }

          if (!this.entries[i + first])
            this.entries[i + first] = entry;
        }
      }

      // Sanity check: as per spec, first object must be free
      if (this.entries[0] && !this.entries[0].free)
        error('Invalid XRef table: unexpected first object');

      // Sanity check
      if (!isCmd(obj, 'trailer'))
        error('Invalid XRef table: could not find trailer dictionary');

      // Read trailer dictionary, e.g.
      // trailer
      //    << /Size 22
      //      /Root 20R
      //      /Info 10R
      //      /ID [ <81b14aafa313db63dbd6f981e49f94f4> ]
      //    >>
      // The parser goes through the entire stream << ... >> and provides
      // a getter interface for the key-value table
      var dict = parser.getObj();
      if (!isDict(dict))
        error('Invalid XRef table: could not parse trailer dictionary');

      return dict;
    },
    readXRefStream: function XRef_readXRefStream(stream) {
      var streamParameters = stream.parameters;
      var byteWidths = streamParameters.get('W');
      var range = streamParameters.get('Index');
      if (!range)
        range = [0, streamParameters.get('Size')];
      var i, j;
      while (range.length > 0) {
        var first = range[0], n = range[1];
        if (!isInt(first) || !isInt(n))
          error('Invalid XRef range fields: ' + first + ', ' + n);
        var typeFieldWidth = byteWidths[0];
        var offsetFieldWidth = byteWidths[1];
        var generationFieldWidth = byteWidths[2];
        if (!isInt(typeFieldWidth) || !isInt(offsetFieldWidth) ||
            !isInt(generationFieldWidth)) {
          error('Invalid XRef entry fields length: ' + first + ', ' + n);
        }
        for (i = 0; i < n; ++i) {
          var type = 0, offset = 0, generation = 0;
          for (j = 0; j < typeFieldWidth; ++j)
            type = (type << 8) | stream.getByte();
          // if type field is absent, its default value = 1
          if (typeFieldWidth == 0)
            type = 1;
          for (j = 0; j < offsetFieldWidth; ++j)
            offset = (offset << 8) | stream.getByte();
          for (j = 0; j < generationFieldWidth; ++j)
            generation = (generation << 8) | stream.getByte();
          var entry = {};
          entry.offset = offset;
          entry.gen = generation;
          switch (type) {
            case 0:
              entry.free = true;
              break;
            case 1:
              entry.uncompressed = true;
              break;
            case 2:
              break;
            default:
              error('Invalid XRef entry type: ' + type);
          }
          if (!this.entries[first + i])
            this.entries[first + i] = entry;
        }
        range.splice(0, 2);
      }
      return streamParameters;
    },
    indexObjects: function XRef_indexObjects() {
      // Simple scan through the PDF content to find objects,
      // trailers and XRef streams.
      function readToken(data, offset) {
        var token = '', ch = data[offset];
        while (ch !== 13 && ch !== 10) {
          if (++offset >= data.length)
            break;
          token += String.fromCharCode(ch);
          ch = data[offset];
        }
        return token;
      }
      function skipUntil(data, offset, what) {
        var length = what.length, dataLength = data.length;
        var skipped = 0;
        // finding byte sequence
        while (offset < dataLength) {
          var i = 0;
          while (i < length && data[offset + i] == what[i])
            ++i;
          if (i >= length)
            break; // sequence found

          offset++;
          skipped++;
        }
        return skipped;
      }
      var trailerBytes = new Uint8Array([116, 114, 97, 105, 108, 101, 114]);
      var startxrefBytes = new Uint8Array([115, 116, 97, 114, 116, 120, 114,
                                          101, 102]);
      var endobjBytes = new Uint8Array([101, 110, 100, 111, 98, 106]);
      var xrefBytes = new Uint8Array([47, 88, 82, 101, 102]);

      var stream = this.stream;
      stream.pos = 0;
      var buffer = stream.getBytes();
      var position = stream.start, length = buffer.length;
      var trailers = [], xrefStms = [];
      var state = 0;
      var currentToken;
      while (position < length) {
        var ch = buffer[position];
        if (ch === 32 || ch === 9 || ch === 13 || ch === 10) {
          ++position;
          continue;
        }
        if (ch === 37) { // %-comment
          do {
            ++position;
            ch = buffer[position];
          } while (ch !== 13 && ch !== 10);
          continue;
        }
        var token = readToken(buffer, position);
        var m;
        if (token === 'xref') {
          position += skipUntil(buffer, position, trailerBytes);
          trailers.push(position);
          position += skipUntil(buffer, position, startxrefBytes);
        } else if ((m = /^(\d+)\s+(\d+)\s+obj\b/.exec(token))) {
          this.entries[m[1]] = {
            offset: position,
            gen: m[2] | 0,
            uncompressed: true
          };

          var contentLength = skipUntil(buffer, position, endobjBytes) + 7;
          var content = buffer.subarray(position, position + contentLength);

          // checking XRef stream suspect
          // (it shall have '/XRef' and next char is not a letter)
          var xrefTagOffset = skipUntil(content, 0, xrefBytes);
          if (xrefTagOffset < contentLength &&
              content[xrefTagOffset + 5] < 64) {
            xrefStms.push(position);
            this.xrefstms[position] = 1; // don't read it recursively
          }

          position += contentLength;
        } else
          position += token.length + 1;
      }
      // reading XRef streams
      for (var i = 0, ii = xrefStms.length; i < ii; ++i) {
          this.readXRef(xrefStms[i], true);
      }
      // finding main trailer
      var dict;
      for (var i = 0, ii = trailers.length; i < ii; ++i) {
        stream.pos = trailers[i];
        var parser = new Parser(new Lexer(stream), true, null);
        var obj = parser.getObj();
        if (!isCmd(obj, 'trailer'))
          continue;
        // read the trailer dictionary
        if (!isDict(dict = parser.getObj()))
          continue;
        // taking the first one with 'ID'
        if (dict.has('ID'))
          return dict;
      }
      // no tailer with 'ID', taking last one (if exists)
      if (dict)
        return dict;
      // nothing helps
      // calling error() would reject worker with an UnknownErrorException.
      throw new InvalidPDFException('Invalid PDF structure');
    },
    readXRef: function XRef_readXRef(startXRef, recoveryMode) {
      var stream = this.stream;
      stream.pos = startXRef;

      try {
        var parser = new Parser(new Lexer(stream), true, null);
        var obj = parser.getObj();
        var dict;

        // Get dictionary
        if (isCmd(obj, 'xref')) {
          // Parse end-of-file XRef
          dict = this.readXRefTable(parser);

          // Recursively get other XRefs 'XRefStm', if any
          obj = dict.get('XRefStm');
          if (isInt(obj)) {
            var pos = obj;
            // ignore previously loaded xref streams
            // (possible infinite recursion)
            if (!(pos in this.xrefstms)) {
              this.xrefstms[pos] = 1;
              this.readXRef(pos);
            }
          }
        } else if (isInt(obj)) {
          // Parse in-stream XRef
          if (!isInt(parser.getObj()) ||
              !isCmd(parser.getObj(), 'obj') ||
              !isStream(obj = parser.getObj())) {
            error('Invalid XRef stream');
          }
          dict = this.readXRefStream(obj);
          if (!dict)
            error('Failed to read XRef stream');
        }

        // Recursively get previous dictionary, if any
        obj = dict.get('Prev');
        if (isInt(obj))
          this.readXRef(obj, recoveryMode);
        else if (isRef(obj)) {
          // The spec says Prev must not be a reference, i.e. "/Prev NNN"
          // This is a fallback for non-compliant PDFs, i.e. "/Prev NNN 0 R"
          this.readXRef(obj.num, recoveryMode);
        }

        return dict;
      } catch (e) {
        log('(while reading XRef): ' + e);
      }

      if (recoveryMode)
        return;

      warn('Indexing all PDF objects');
      return this.indexObjects();
    },
    getEntry: function XRef_getEntry(i) {
      var e = this.entries[i];
      if (e === null)
        return null;
      return e.free || !e.offset ? null : e; // returns null if entry is free
    },
    fetchIfRef: function XRef_fetchIfRef(obj) {
      if (!isRef(obj))
        return obj;
      return this.fetch(obj);
    },
    fetch: function XRef_fetch(ref, suppressEncryption) {
      assertWellFormed(isRef(ref), 'ref object is not a reference');
      var num = ref.num;
      if (num in this.cache)
        return this.cache[num];

      var e = this.getEntry(num);

      // the referenced entry can be free
      if (e === null)
        return (this.cache[num] = e);

      var gen = ref.gen;
      var stream, parser;
      if (e.uncompressed) {
        if (e.gen != gen)
          error('inconsistent generation in XRef');
        stream = this.stream.makeSubStream(e.offset);
        parser = new Parser(new Lexer(stream), true, this);
        var obj1 = parser.getObj();
        var obj2 = parser.getObj();
        var obj3 = parser.getObj();
        if (!isInt(obj1) || obj1 != num ||
            !isInt(obj2) || obj2 != gen ||
            !isCmd(obj3)) {
          error('bad XRef entry');
        }
        if (!isCmd(obj3, 'obj')) {
          // some bad pdfs use "obj1234" and really mean 1234
          if (obj3.cmd.indexOf('obj') == 0) {
            num = parseInt(obj3.cmd.substring(3), 10);
            if (!isNaN(num))
              return num;
          }
          error('bad XRef entry');
        }
        if (this.encrypt && !suppressEncryption) {
          try {
            e = parser.getObj(this.encrypt.createCipherTransform(num, gen));
          } catch (ex) {
            // almost all streams must be encrypted, but sometimes
            // they are not probably due to some broken generators
            // re-trying without encryption
            return this.fetch(ref, true);
          }
        } else {
          e = parser.getObj();
        }
        // Don't cache streams since they are mutable (except images).
        if (!isStream(e) || e instanceof JpegStream)
          this.cache[num] = e;
        return e;
      }

      // compressed entry
      var tableOffset = e.offset;
      stream = this.fetch(new Ref(tableOffset, 0));
      if (!isStream(stream))
        error('bad ObjStm stream');
      var first = stream.parameters.get('First');
      var n = stream.parameters.get('N');
      if (!isInt(first) || !isInt(n)) {
        error('invalid first and n parameters for ObjStm stream');
      }
      parser = new Parser(new Lexer(stream), false, this);
      parser.allowStreams = true;
      var i, entries = [], nums = [];
      // read the object numbers to populate cache
      for (i = 0; i < n; ++i) {
        num = parser.getObj();
        if (!isInt(num)) {
          error('invalid object number in the ObjStm stream: ' + num);
        }
        nums.push(num);
        var offset = parser.getObj();
        if (!isInt(offset)) {
          error('invalid object offset in the ObjStm stream: ' + offset);
        }
      }
      // read stream objects for cache
      for (i = 0; i < n; ++i) {
        entries.push(parser.getObj());
        num = nums[i];
        var entry = this.entries[num];
        if (entry && entry.offset === tableOffset && entry.gen === i) {
          this.cache[num] = entries[i];
        }
      }
      e = entries[e.gen];
      if (!e) {
        error('bad XRef entry for compressed object');
      }
      return e;
    },
    getCatalogObj: function XRef_getCatalogObj() {
      return this.root;
    }
  };

  return XRef;
})();

/**
 * A PDF document and page is built of many objects. E.g. there are objects
 * for fonts, images, rendering code and such. These objects might get processed
 * inside of a worker. The `PDFObjects` implements some basic functions to
 * manage these objects.
 */
var PDFObjects = (function PDFObjectsClosure() {
  function PDFObjects() {
    this.objs = {};
  }

  PDFObjects.prototype = {
    /**
     * Internal function.
     * Ensures there is an object defined for `objId`. Stores `data` on the
     * object *if* it is created.
     */
    ensureObj: function PDFObjects_ensureObj(objId, data) {
      if (this.objs[objId])
        return this.objs[objId];
      return this.objs[objId] = new Promise(objId, data);
    },

    /**
     * If called *without* callback, this returns the data of `objId` but the
     * object needs to be resolved. If it isn't, this function throws.
     *
     * If called *with* a callback, the callback is called with the data of the
     * object once the object is resolved. That means, if you call this
     * function and the object is already resolved, the callback gets called
     * right away.
     */
    get: function PDFObjects_get(objId, callback) {
      // If there is a callback, then the get can be async and the object is
      // not required to be resolved right now
      if (callback) {
        this.ensureObj(objId).then(callback);
        return null;
      }

      // If there isn't a callback, the user expects to get the resolved data
      // directly.
      var obj = this.objs[objId];

      // If there isn't an object yet or the object isn't resolved, then the
      // data isn't ready yet!
      if (!obj || !obj.isResolved)
        error('Requesting object that isn\'t resolved yet ' + objId);

      return obj.data;
    },

    /**
     * Resolves the object `objId` with optional `data`.
     */
    resolve: function PDFObjects_resolve(objId, data) {
      var objs = this.objs;

      // In case there is a promise already on this object, just resolve it.
      if (objs[objId]) {
        objs[objId].resolve(data);
      } else {
        this.ensureObj(objId, data);
      }
    },

    onData: function PDFObjects_onData(objId, callback) {
      this.ensureObj(objId).onData(callback);
    },

    isResolved: function PDFObjects_isResolved(objId) {
      var objs = this.objs;
      if (!objs[objId]) {
        return false;
      } else {
        return objs[objId].isResolved;
      }
    },

    hasData: function PDFObjects_hasData(objId) {
      var objs = this.objs;
      if (!objs[objId]) {
        return false;
      } else {
        return objs[objId].hasData;
      }
    },

    /**
     * Returns the data of `objId` if object exists, null otherwise.
     */
    getData: function PDFObjects_getData(objId) {
      var objs = this.objs;
      if (!objs[objId] || !objs[objId].hasData) {
        return null;
      } else {
        return objs[objId].data;
      }
    },

    /**
     * Sets the data of an object but *doesn't* resolve it.
     */
    setData: function PDFObjects_setData(objId, data) {
      // Watchout! If you call `this.ensureObj(objId, data)` you're going to
      // create a *resolved* promise which shouldn't be the case!
      this.ensureObj(objId).data = data;
    },

    clear: function PDFObjects_clear() {
      this.objs = {};
    }
  };
  return PDFObjects;
})();

