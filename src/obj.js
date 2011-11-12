/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var Name = (function nameName() {
  function constructor(name) {
    this.name = name;
  }

  constructor.prototype = {
  };

  return constructor;
})();

var Cmd = (function cmdCmd() {
  function constructor(cmd) {
    this.cmd = cmd;
  }

  constructor.prototype = {
  };

  return constructor;
})();

var Dict = (function dictDict() {
  function constructor() {
    this.map = Object.create(null);
  }

  constructor.prototype = {
    get: function dictGet(key1, key2, key3) {
      var value;
      if (typeof (value = this.map[key1]) != 'undefined' || key1 in this.map ||
          typeof key2 == 'undefined') {
        return value;
      }
      if (typeof (value = this.map[key2]) != 'undefined' || key2 in this.map ||
          typeof key3 == 'undefined') {
        return value;
      }

      return this.map[key3] || null;
    },

    set: function dictSet(key, value) {
      this.map[key] = value;
    },

    has: function dictHas(key) {
      return key in this.map;
    },

    forEach: function dictForEach(callback) {
      for (var key in this.map) {
        callback(key, this.map[key]);
      }
    }
  };

  return constructor;
})();

var Ref = (function refRef() {
  function constructor(num, gen) {
    this.num = num;
    this.gen = gen;
  }

  constructor.prototype = {
  };

  return constructor;
})();

// The reference is identified by number and generation,
// this structure stores only one instance of the reference.
var RefSet = (function refSet() {
  function constructor() {
    this.dict = {};
  }

  constructor.prototype = {
    has: function refSetHas(ref) {
      return !!this.dict['R' + ref.num + '.' + ref.gen];
    },

    put: function refSetPut(ref) {
      this.dict['R' + ref.num + '.' + ref.gen] = ref;
    }
  };

  return constructor;
})();

var Catalog = (function catalogCatalog() {
  function constructor(xref) {
    this.xref = xref;
    var obj = xref.getCatalogObj();
    assertWellFormed(isDict(obj), 'catalog object is not a dictionary');
    this.catDict = obj;
  }

  constructor.prototype = {
    get toplevelPagesDict() {
      var pagesObj = this.catDict.get('Pages');
      assertWellFormed(isRef(pagesObj), 'invalid top-level pages reference');
      var xrefObj = this.xref.fetch(pagesObj);
      assertWellFormed(isDict(xrefObj), 'invalid top-level pages dictionary');
      // shadow the prototype getter
      return shadow(this, 'toplevelPagesDict', xrefObj);
    },
    get documentOutline() {
      var obj = this.catDict.get('Outlines');
      var xref = this.xref;
      var root = { items: [] };
      if (isRef(obj)) {
        obj = xref.fetch(obj).get('First');
        var processed = new RefSet();
        if (isRef(obj)) {
          var queue = [{obj: obj, parent: root}];
          // to avoid recursion keeping track of the items
          // in the processed dictionary
          processed.put(obj);
          while (queue.length > 0) {
            var i = queue.shift();
            var outlineDict = xref.fetch(i.obj);
            if (!outlineDict.has('Title'))
              error('Invalid outline item');
            var dest = outlineDict.get('A');
            if (dest)
              dest = xref.fetchIfRef(dest).get('D');
            else if (outlineDict.has('Dest')) {
              dest = outlineDict.get('Dest');
              if (isName(dest))
                dest = dest.name;
            }
            var title = xref.fetchIfRef(outlineDict.get('Title'));
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
            obj = outlineDict.get('First');
            if (isRef(obj) && !processed.has(obj)) {
              queue.push({obj: obj, parent: outlineItem});
              processed.put(obj);
            }
            obj = outlineDict.get('Next');
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
    traverseKids: function catalogTraverseKids(pagesDict) {
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
      function fetchDestination(xref, ref) {
        var dest = xref.fetchIfRef(ref);
        return isDict(dest) ? dest.get('D') : dest;
      }

      var xref = this.xref;
      var dests = {}, nameTreeRef, nameDictionaryRef;
      var obj = this.catDict.get('Names');
      if (obj)
        nameTreeRef = xref.fetchIfRef(obj).get('Dests');
      else if (this.catDict.has('Dests'))
        nameDictionaryRef = this.catDict.get('Dests');

      if (nameDictionaryRef) {
        // reading simple destination dictionary
        obj = xref.fetchIfRef(nameDictionaryRef);
        obj.forEach(function catalogForEach(key, value) {
          if (!value) return;
          dests[key] = fetchDestination(xref, value);
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
          for (i = 0, n = names.length; i < n; i += 2) {
            dests[names[i]] = fetchDestination(xref, names[i + 1]);
          }
        }
      }
      return shadow(this, 'destinations', dests);
    },
    getPage: function catalogGetPage(n) {
      var pageCache = this.pageCache;
      if (!pageCache) {
        pageCache = this.pageCache = [];
        this.traverseKids(this.toplevelPagesDict);
      }
      return this.pageCache[n - 1];
    }
  };

  return constructor;
})();

var XRef = (function xRefXRef() {
  function constructor(stream, startXRef, mainXRefEntriesOffset) {
    this.stream = stream;
    this.entries = [];
    this.xrefstms = {};
    var trailerDict = this.readXRef(startXRef);

    // prepare the XRef cache
    this.cache = [];

    var encrypt = trailerDict.get('Encrypt');
    if (encrypt) {
      var fileId = trailerDict.get('ID');
      this.encrypt = new CipherTransformFactory(this.fetch(encrypt),
                                                fileId[0] /*, password */);
    }

    // get the root dictionary (catalog) object
    if (!isRef(this.root = trailerDict.get('Root')))
      error('Invalid root reference');
  }

  constructor.prototype = {
    readXRefTable: function readXRefTable(parser) {
      var obj;
      while (true) {
        if (isCmd(obj = parser.getObj(), 'trailer'))
          break;
        if (!isInt(obj))
          error('Invalid XRef table');
        var first = obj;
        if (!isInt(obj = parser.getObj()))
          error('Invalid XRef table');
        var n = obj;
        if (first < 0 || n < 0 || (first + n) != ((first + n) | 0))
          error('Invalid XRef table: ' + first + ', ' + n);
        for (var i = first; i < first + n; ++i) {
          var entry = {};
          if (!isInt(obj = parser.getObj()))
            error('Invalid XRef table: ' + first + ', ' + n);
          entry.offset = obj;
          if (!isInt(obj = parser.getObj()))
            error('Invalid XRef table: ' + first + ', ' + n);
          entry.gen = obj;
          obj = parser.getObj();
          if (isCmd(obj, 'n')) {
            entry.uncompressed = true;
          } else if (isCmd(obj, 'f')) {
            entry.free = true;
          } else {
            error('Invalid XRef table: ' + first + ', ' + n);
          }
          if (!this.entries[i]) {
            // In some buggy PDF files the xref table claims to start at 1
            // instead of 0.
            if (i == 1 && first == 1 &&
                entry.offset == 0 && entry.gen == 65535 && entry.free) {
              i = first = 0;
            }
            this.entries[i] = entry;
          }
        }
      }

      // read the trailer dictionary
      var dict;
      if (!isDict(dict = parser.getObj()))
        error('Invalid XRef table');

      // get the 'Prev' pointer
      var prev;
      obj = dict.get('Prev');
      if (isInt(obj)) {
        prev = obj;
      } else if (isRef(obj)) {
        // certain buggy PDF generators generate "/Prev NNN 0 R" instead
        // of "/Prev NNN"
        prev = obj.num;
      }
      if (prev) {
        this.readXRef(prev);
      }

      // check for 'XRefStm' key
      if (isInt(obj = dict.get('XRefStm'))) {
        var pos = obj;
        // ignore previously loaded xref streams (possible infinite recursion)
        if (!(pos in this.xrefstms)) {
          this.xrefstms[pos] = 1;
          this.readXRef(pos);
        }
      }

      return dict;
    },
    readXRefStream: function readXRefStream(stream) {
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
      var prev = streamParameters.get('Prev');
      if (isInt(prev))
        this.readXRef(prev);
      return streamParameters;
    },
    indexObjects: function indexObjects() {
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
          this.readXRef(xrefStms[i]);
      }
      // finding main trailer
      var dict;
      for (var i = 0, ii = trailers.length; i < ii; ++i) {
        stream.pos = trailers[i];
        var parser = new Parser(new Lexer(stream), true);
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
      error('Invalid PDF structure');
      return null;
    },
    readXRef: function readXref(startXRef) {
      var stream = this.stream;
      stream.pos = startXRef;
      var parser = new Parser(new Lexer(stream), true);
      var obj = parser.getObj();
      // parse an old-style xref table
      if (isCmd(obj, 'xref'))
        return this.readXRefTable(parser);
      // parse an xref stream
      if (isInt(obj)) {
        if (!isInt(parser.getObj()) ||
            !isCmd(parser.getObj(), 'obj') ||
            !isStream(obj = parser.getObj())) {
          error('Invalid XRef stream');
        }
        return this.readXRefStream(obj);
      }
      return this.indexObjects();
    },
    getEntry: function xRefGetEntry(i) {
      var e = this.entries[i];
      if (e.free)
        error('reading an XRef stream not implemented yet');
      return e;
    },
    fetchIfRef: function xRefFetchIfRef(obj) {
      if (!isRef(obj))
        return obj;
      return this.fetch(obj);
    },
    fetch: function xRefFetch(ref, suppressEncryption) {
      var num = ref.num;
      var e = this.cache[num];
      if (e)
        return e;

      e = this.getEntry(num);
      var gen = ref.gen;
      var stream, parser;
      if (e.uncompressed) {
        if (e.gen != gen)
          throw ('inconsistent generation in XRef');
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
        if (!isStream(e) || e.getImage)
          this.cache[num] = e;
        return e;
      }

      // compressed entry
      stream = this.fetch(new Ref(e.offset, 0));
      if (!isStream(stream))
        error('bad ObjStm stream');
      var first = stream.parameters.get('First');
      var n = stream.parameters.get('N');
      if (!isInt(first) || !isInt(n)) {
        error('invalid first and n parameters for ObjStm stream');
      }
      parser = new Parser(new Lexer(stream), false);
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
        this.cache[nums[i]] = entries[i];
      }
      e = entries[e.gen];
      if (!e) {
        error('bad XRef entry for compressed object');
      }
      return e;
    },
    getCatalogObj: function xRefGetCatalogObj() {
      return this.fetch(this.root);
    }
  };

  return constructor;
})();

/**
 * A PDF document and page is built of many objects. E.g. there are objects
 * for fonts, images, rendering code and such. These objects might get processed
 * inside of a worker. The `PDFObjects` implements some basic functions to
 * manage these objects.
 */
var PDFObjects = (function pdfObjects() {
  function PDFObjects() {
    this.objs = {};
  }

  PDFObjects.prototype = {
    objs: null,

    /**
     * Internal function.
     * Ensures there is an object defined for `objId`. Stores `data` on the
     * object *if* it is created.
     */
    ensureObj: function pdfObjectsEnsureObj(objId, data) {
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
    get: function pdfObjectsGet(objId, callback) {
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
      if (!obj || !obj.isResolved) {
        throw 'Requesting object that isn\'t resolved yet ' + objId;
        return null;
      } else {
        return obj.data;
      }
    },

    /**
     * Resolves the object `objId` with optional `data`.
     */
    resolve: function pdfObjectsResolve(objId, data) {
      var objs = this.objs;

      // In case there is a promise already on this object, just resolve it.
      if (objs[objId]) {
        objs[objId].resolve(data);
      } else {
        this.ensureObj(objId, data);
      }
    },

    onData: function pdfObjectsOnData(objId, callback) {
      this.ensureObj(objId).onData(callback);
    },

    isResolved: function pdfObjectsIsResolved(objId) {
      var objs = this.objs;
      if (!objs[objId]) {
        return false;
      } else {
        return objs[objId].isResolved;
      }
    },

    hasData: function pdfObjectsHasData(objId) {
      var objs = this.objs;
      if (!objs[objId]) {
        return false;
      } else {
        return objs[objId].hasData;
      }
    },

    /**
     * Sets the data of an object but *doesn't* resolve it.
     */
    setData: function pdfObjectsSetData(objId, data) {
      // Watchout! If you call `this.ensureObj(objId, data)` you're going to
      // create a *resolved* promise which shouldn't be the case!
      this.ensureObj(objId).data = data;
    }
  };
  return PDFObjects;
})();

