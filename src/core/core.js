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
/* globals assertWellFormed, calculateMD5, Catalog, error, info, isArray,
           isArrayBuffer, isName, isStream, isString, Lexer,
           Linearization, NullStream, PartialEvaluator, shadow, Stream,
           StreamsSequenceStream, stringToPDFString, Util, XRef,
           MissingDataException, Promise, Annotation, ObjectLoader, OperatorList
           */

'use strict';

var Page = (function PageClosure() {

  function Page(pdfManager, xref, pageIndex, pageDict, ref) {
    this.pdfManager = pdfManager;
    this.pageIndex = pageIndex;
    this.pageDict = pageDict;
    this.xref = xref;
    this.ref = ref;
    this.idCounters = {
      obj: 0
    };
    this.resourcesPromise = null;
  }

  Page.prototype = {
    getPageProp: function Page_getPageProp(key) {
      return this.pageDict.get(key);
    },
    inheritPageProp: function Page_inheritPageProp(key) {
      var dict = this.pageDict;
      var obj = dict.get(key);
      while (obj === undefined) {
        dict = dict.get('Parent');
        if (!dict)
          break;
        obj = dict.get(key);
      }
      return obj;
    },
    get content() {
      return this.getPageProp('Contents');
    },
    get resources() {
      return shadow(this, 'resources', this.inheritPageProp('Resources'));
    },
    get mediaBox() {
      var obj = this.inheritPageProp('MediaBox');
      // Reset invalid media box to letter size.
      if (!isArray(obj) || obj.length !== 4)
        obj = [0, 0, 612, 792];
      return shadow(this, 'mediaBox', obj);
    },
    get view() {
      var mediaBox = this.mediaBox;
      var cropBox = this.inheritPageProp('CropBox');
      if (!isArray(cropBox) || cropBox.length !== 4)
        return shadow(this, 'view', mediaBox);

      // From the spec, 6th ed., p.963:
      // "The crop, bleed, trim, and art boxes should not ordinarily
      // extend beyond the boundaries of the media box. If they do, they are
      // effectively reduced to their intersection with the media box."
      cropBox = Util.intersect(cropBox, mediaBox);
      if (!cropBox)
        return shadow(this, 'view', mediaBox);

      return shadow(this, 'view', cropBox);
    },
    get annotationRefs() {
      return shadow(this, 'annotationRefs', this.inheritPageProp('Annots'));
    },
    get rotate() {
      var rotate = this.inheritPageProp('Rotate') || 0;
      // Normalize rotation so it's a multiple of 90 and between 0 and 270
      if (rotate % 90 !== 0) {
        rotate = 0;
      } else if (rotate >= 360) {
        rotate = rotate % 360;
      } else if (rotate < 0) {
        // The spec doesn't cover negatives, assume its counterclockwise
        // rotation. The following is the other implementation of modulo.
        rotate = ((rotate % 360) + 360) % 360;
      }
      return shadow(this, 'rotate', rotate);
    },
    getContentStream: function Page_getContentStream() {
      var content = this.content;
      var stream;
      if (isArray(content)) {
        // fetching items
        var xref = this.xref;
        var i, n = content.length;
        var streams = [];
        for (i = 0; i < n; ++i)
          streams.push(xref.fetchIfRef(content[i]));
        stream = new StreamsSequenceStream(streams);
      } else if (isStream(content)) {
        stream = content;
      } else {
        // replacing non-existent page content with empty one
        stream = new NullStream();
      }
      return stream;
    },
    loadResources: function(keys) {
      if (!this.resourcesPromise) {
        // TODO: add async inheritPageProp and remove this.
        this.resourcesPromise = this.pdfManager.ensure(this, 'resources');
      }
      var promise = new Promise();
      this.resourcesPromise.then(function resourceSuccess() {
        var objectLoader = new ObjectLoader(this.resources.map,
                                            keys,
                                            this.xref);
        objectLoader.load().then(function objectLoaderSuccess() {
          promise.resolve();
        });
      }.bind(this));
      return promise;
    },
    getOperatorList: function Page_getOperatorList(handler) {
      var self = this;
      var promise = new Promise();

      function reject(e) {
        promise.reject(e);
      }

      var pageListPromise = new Promise();

      var pdfManager = this.pdfManager;
      var contentStreamPromise = pdfManager.ensure(this, 'getContentStream',
                                                   []);
      var resourcesPromise = this.loadResources([
        'ExtGState',
        'ColorSpace',
        'Pattern',
        'Shading',
        'XObject',
        'Font',
        // ProcSet
        // Properties
      ]);

      var partialEvaluator = new PartialEvaluator(
            pdfManager, this.xref, handler,
            this.pageIndex, 'p' + this.pageIndex + '_',
            this.idCounters);

      var dataPromises = Promise.all(
          [contentStreamPromise, resourcesPromise], reject);
      dataPromises.then(function(data) {
        var contentStream = data[0];


        var opList = new OperatorList(handler, self.pageIndex);

        handler.send('StartRenderPage', {
          transparency: partialEvaluator.hasBlendModes(self.resources),
          pageIndex: self.pageIndex
        });
        partialEvaluator.getOperatorList(contentStream, self.resources, opList);
        pageListPromise.resolve(opList);
      });

      var annotationsPromise = pdfManager.ensure(this, 'annotations');
      Promise.all([pageListPromise, annotationsPromise]).then(function(datas) {
        var pageOpList = datas[0];
        var annotations = datas[1];

        if (annotations.length === 0) {
          PartialEvaluator.optimizeQueue(pageOpList);
          pageOpList.flush(true);
          promise.resolve(pageOpList);
          return;
        }

        var annotationsReadyPromise = Annotation.appendToOperatorList(
          annotations, pageOpList, pdfManager, partialEvaluator);
        annotationsReadyPromise.then(function () {
          PartialEvaluator.optimizeQueue(pageOpList);
          pageOpList.flush(true);
          promise.resolve(pageOpList);
        }, reject);
      }, reject);

      return promise;
    },
    extractTextContent: function Page_extractTextContent() {
      var handler = {
        on: function nullHandlerOn() {},
        send: function nullHandlerSend() {}
      };

      var self = this;

      var textContentPromise = new Promise();

      var pdfManager = this.pdfManager;
      var contentStreamPromise = pdfManager.ensure(this, 'getContentStream',
                                                   []);

      var resourcesPromise = this.loadResources([
        'ExtGState',
        'XObject',
        'Font'
      ]);

      var dataPromises = Promise.all([contentStreamPromise,
                                      resourcesPromise]);
      dataPromises.then(function(data) {
        var contentStream = data[0];
        var partialEvaluator = new PartialEvaluator(
              pdfManager, self.xref, handler,
              self.pageIndex, 'p' + self.pageIndex + '_',
              self.idCounters);

        var bidiTexts = partialEvaluator.getTextContent(contentStream,
                                                        self.resources);
        textContentPromise.resolve(bidiTexts);
      });

      return textContentPromise;
    },

    getAnnotationsData: function Page_getAnnotationsData() {
      var annotations = this.annotations;
      var annotationsData = [];
      for (var i = 0, n = annotations.length; i < n; ++i) {
        annotationsData.push(annotations[i].getData());
      }
      return annotationsData;
    },

    get annotations() {
      var annotations = [];
      var annotationRefs = this.annotationRefs || [];
      for (var i = 0, n = annotationRefs.length; i < n; ++i) {
        var annotationRef = annotationRefs[i];
        var annotation = Annotation.fromRef(this.xref, annotationRef);
        if (annotation) {
          annotations.push(annotation);
        }
      }
      return shadow(this, 'annotations', annotations);
    }
  };

  return Page;
})();

/**
 * The `PDFDocument` holds all the data of the PDF file. Compared to the
 * `PDFDoc`, this one doesn't have any job management code.
 * Right now there exists one PDFDocument on the main thread + one object
 * for each worker. If there is no worker support enabled, there are two
 * `PDFDocument` objects on the main thread created.
 */
var PDFDocument = (function PDFDocumentClosure() {
  function PDFDocument(pdfManager, arg, password) {
    if (isStream(arg))
      init.call(this, pdfManager, arg, password);
    else if (isArrayBuffer(arg))
      init.call(this, pdfManager, new Stream(arg), password);
    else
      error('PDFDocument: Unknown argument type');
  }

  function init(pdfManager, stream, password) {
    assertWellFormed(stream.length > 0, 'stream must have data');
    this.pdfManager = pdfManager;
    this.stream = stream;
    var xref = new XRef(this.stream, password, pdfManager);
    this.xref = xref;
  }

  function find(stream, needle, limit, backwards) {
    var pos = stream.pos;
    var end = stream.end;
    var str = '';
    if (pos + limit > end)
      limit = end - pos;
    for (var n = 0; n < limit; ++n)
      str += String.fromCharCode(stream.getByte());
    stream.pos = pos;
    var index = backwards ? str.lastIndexOf(needle) : str.indexOf(needle);
    if (index == -1)
      return false; /* not found */
    stream.pos += index;
    return true; /* found */
  }

  var DocumentInfoValidators = {
    get entries() {
      // Lazily build this since all the validation functions below are not
      // defined until after this file loads.
      return shadow(this, 'entries', {
        Title: isString,
        Author: isString,
        Subject: isString,
        Keywords: isString,
        Creator: isString,
        Producer: isString,
        CreationDate: isString,
        ModDate: isString,
        Trapped: isName
      });
    }
  };

  PDFDocument.prototype = {
    parse: function PDFDocument_parse(recoveryMode) {
      this.setup(recoveryMode);
      try {
        // checking if AcroForm is present
        this.acroForm = this.catalog.catDict.get('AcroForm');
        if (this.acroForm) {
          this.xfa = this.acroForm.get('XFA');
          var fields = this.acroForm.get('Fields');
          if ((!fields || !isArray(fields) || fields.length === 0) &&
              !this.xfa) {
            // no fields and no XFA -- not a form (?)
            this.acroForm = null;
          }
        }
      } catch (ex) {
        info('Something wrong with AcroForm entry');
        this.acroForm = null;
      }
    },

    get linearization() {
      var length = this.stream.length;
      var linearization = false;
      if (length) {
        try {
          linearization = new Linearization(this.stream);
          if (linearization.length != length) {
            linearization = false;
          }
        } catch (err) {
          if (err instanceof MissingDataException) {
            throw err;
          }

          info('The linearization data is not available ' +
               'or unreadable PDF data is found');
          linearization = false;
        }
      }
      // shadow the prototype getter with a data property
      return shadow(this, 'linearization', linearization);
    },
    get startXRef() {
      var stream = this.stream;
      var startXRef = 0;
      var linearization = this.linearization;
      if (linearization) {
        // Find end of first obj.
        stream.reset();
        if (find(stream, 'endobj', 1024))
          startXRef = stream.pos + 6;
      } else {
        // Find startxref by jumping backward from the end of the file.
        var step = 1024;
        var found = false, pos = stream.end;
        while (!found && pos > 0) {
          pos -= step - 'startxref'.length;
          if (pos < 0)
            pos = 0;
          stream.pos = pos;
          found = find(stream, 'startxref', step, true);
        }
        if (found) {
          stream.skip(9);
          var ch;
          do {
            ch = stream.getByte();
          } while (Lexer.isSpace(ch));
          var str = '';
          while (ch >= 0x20 && ch <= 0x39) { // < '9'
            str += String.fromCharCode(ch);
            ch = stream.getByte();
          }
          startXRef = parseInt(str, 10);
          if (isNaN(startXRef))
            startXRef = 0;
        }
      }
      // shadow the prototype getter with a data property
      return shadow(this, 'startXRef', startXRef);
    },
    get mainXRefEntriesOffset() {
      var mainXRefEntriesOffset = 0;
      var linearization = this.linearization;
      if (linearization)
        mainXRefEntriesOffset = linearization.mainXRefEntriesOffset;
      // shadow the prototype getter with a data property
      return shadow(this, 'mainXRefEntriesOffset', mainXRefEntriesOffset);
    },
    // Find the header, remove leading garbage and setup the stream
    // starting from the header.
    checkHeader: function PDFDocument_checkHeader() {
      var stream = this.stream;
      stream.reset();
      if (find(stream, '%PDF-', 1024)) {
        // Found the header, trim off any garbage before it.
        stream.moveStart();
        // Reading file format version
        var MAX_VERSION_LENGTH = 12;
        var version = '', ch;
        while ((ch = stream.getByte()) > 0x20) { // SPACE
          if (version.length >= MAX_VERSION_LENGTH) {
            break;
          }
          version += String.fromCharCode(ch);
        }
        // removing "%PDF-"-prefix
        this.pdfFormatVersion = version.substring(5);
        return;
      }
      // May not be a PDF file, continue anyway.
    },
    parseStartXRef: function PDFDocument_parseStartXRef() {
      var startXRef = this.startXRef;
      this.xref.setStartXRef(startXRef);
    },
    setup: function PDFDocument_setup(recoveryMode) {
      this.xref.parse(recoveryMode);
      this.catalog = new Catalog(this.pdfManager, this.xref);
    },
    get numPages() {
      var linearization = this.linearization;
      var num = linearization ? linearization.numPages : this.catalog.numPages;
      // shadow the prototype getter
      return shadow(this, 'numPages', num);
    },
    get documentInfo() {
      var docInfo = {
        PDFFormatVersion: this.pdfFormatVersion,
        IsAcroFormPresent: !!this.acroForm,
        IsXFAPresent: !!this.xfa
      };
      var infoDict;
      try {
        infoDict = this.xref.trailer.get('Info');
      } catch (err) {
        info('The document information dictionary is invalid.');
      }
      if (infoDict) {
        var validEntries = DocumentInfoValidators.entries;
        // Only fill the document info with valid entries from the spec.
        for (var key in validEntries) {
          if (infoDict.has(key)) {
            var value = infoDict.get(key);
            // Make sure the value conforms to the spec.
            if (validEntries[key](value)) {
              docInfo[key] = typeof value !== 'string' ? value :
                stringToPDFString(value);
            } else {
              info('Bad value in document info for "' + key + '"');
            }
          }
        }
      }
      return shadow(this, 'documentInfo', docInfo);
    },
    get fingerprint() {
      var xref = this.xref, fileID;
      if (xref.trailer.has('ID')) {
        fileID = '';
        var id = xref.trailer.get('ID')[0];
        id.split('').forEach(function(el) {
          fileID += Number(el.charCodeAt(0)).toString(16);
        });
      } else {
        // If we got no fileID, then we generate one,
        // from the first 100 bytes of PDF
        var data = this.stream.bytes.subarray(0, 100);
        var hash = calculateMD5(data, 0, data.length);
        fileID = '';
        for (var i = 0, length = hash.length; i < length; i++) {
          fileID += Number(hash[i]).toString(16);
        }
      }

      return shadow(this, 'fingerprint', fileID);
    },

    traversePages: function PDFDocument_traversePages() {
      this.catalog.traversePages();
    },

    getPage: function PDFDocument_getPage(pageIndex) {
      return this.catalog.getPage(pageIndex);
    }
  };

  return PDFDocument;
})();

