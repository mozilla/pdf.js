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
           isArrayBuffer, isDict, isName, isStream, isString, Lexer,
           Linearization, NullStream, PartialEvaluator, shadow, Stream,
           StreamsSequenceStream, stringToPDFString, TODO, Util, warn, XRef,
           Annotation */

'use strict';

var globalScope = (typeof window === 'undefined') ? this : window;

var isWorker = (typeof window == 'undefined');

var ERRORS = 0, WARNINGS = 1, INFOS = 5;
var verbosity = WARNINGS;

// The global PDFJS object exposes the API
// In production, it will be declared outside a global wrapper
// In development, it will be declared here
if (!globalScope.PDFJS) {
  globalScope.PDFJS = {};
}

// getPdf()
// Convenience function to perform binary Ajax GET
// Usage: getPdf('http://...', callback)
//        getPdf({
//                 url:String ,
//                 [,progress:Function, error:Function]
//               },
//               callback)
function getPdf(arg, callback) {
  var params = arg;
  if (typeof arg === 'string')
    params = { url: arg };
//#if !B2G
  var xhr = new XMLHttpRequest();
//#else
//var xhr = new XMLHttpRequest({mozSystem: true});
//#endif
  xhr.open('GET', params.url);

  var headers = params.headers;
  if (headers) {
    for (var property in headers) {
      if (typeof headers[property] === 'undefined')
        continue;

      xhr.setRequestHeader(property, params.headers[property]);
    }
  }

  xhr.mozResponseType = xhr.responseType = 'arraybuffer';

  var protocol = params.url.substring(0, params.url.indexOf(':') + 1);
  xhr.expected = (protocol === 'http:' || protocol === 'https:') ? 200 : 0;

  if ('progress' in params)
    xhr.onprogress = params.progress || undefined;

  var calledErrorBack = false;

  if ('error' in params) {
    xhr.onerror = function errorBack() {
      if (!calledErrorBack) {
        calledErrorBack = true;
        params.error();
      }
    };
  }

  xhr.onreadystatechange = function getPdfOnreadystatechange(e) {
    if (xhr.readyState === 4) {
      if (xhr.status === xhr.expected) {
        var data = (xhr.mozResponseArrayBuffer || xhr.mozResponse ||
                    xhr.responseArrayBuffer || xhr.response);
        callback(data);
      } else if (params.error && !calledErrorBack) {
        calledErrorBack = true;
        params.error(e);
      }
    }
  };
  xhr.send(null);
}
globalScope.PDFJS.getPdf = getPdf;
globalScope.PDFJS.pdfBug = false;


var Page = (function PageClosure() {

  function Page(xref, pageIndex, pageDict, ref) {
    this.pageIndex = pageIndex;
    this.pageDict = pageDict;
    this.xref = xref;
    this.ref = ref;

    this.displayReadyPromise = null;
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
      return shadow(this, 'content', this.getPageProp('Contents'));
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
      if (isArray(content)) {
        // fetching items
        var xref = this.xref;
        var i, n = content.length;
        var streams = [];
        for (i = 0; i < n; ++i)
          streams.push(xref.fetchIfRef(content[i]));
        content = new StreamsSequenceStream(streams);
      } else if (isStream(content)) {
        content.reset();
      } else if (!content) {
        // replacing non-existent page content with empty one
        content = new NullStream();
      }
      return content;
    },
    getOperatorList: function Page_getOperatorList(handler, dependency) {
      var xref = this.xref;
      var contentStream = this.getContentStream();
      var resources = this.resources;
      var pe = this.pe = new PartialEvaluator(
                                xref, handler, this.pageIndex,
                                'p' + this.pageIndex + '_');

      var list = pe.getOperatorList(contentStream, resources, dependency);
      this.appendAnnotationsOperatorList(list, dependency, handler);
      pe.optimizeQueue(list);
      return list;
    },

    appendAnnotationsOperatorList: function Page_appendAnnotationsOperatorList(
                                       operatorList, dependency, handler) {

      var evaluator = new PartialEvaluator(this.xref, handler, this.pageIndex,
        'p' + this.pageIndex + '_annotation');

      Annotation.appendToOperatorList(
        this.annotations, operatorList, dependency, evaluator);
    },

    extractTextContent: function Page_extractTextContent() {
      var handler = {
        on: function nullHandlerOn() {},
        send: function nullHandlerSend() {}
      };

      var xref = this.xref;
      var contentStream = this.getContentStream();
      var resources = xref.fetchIfRef(this.resources);

      var pe = new PartialEvaluator(
                     xref, handler, this.pageIndex,
                     'p' + this.pageIndex + '_');
      return pe.getTextContent(contentStream, resources);
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
  function PDFDocument(arg, password) {
    if (isStream(arg))
      init.call(this, arg, password);
    else if (isArrayBuffer(arg))
      init.call(this, new Stream(arg), password);
    else
      error('PDFDocument: Unknown argument type');
  }

  function init(stream, password) {
    assertWellFormed(stream.length > 0, 'stream must have data');
    this.stream = stream;
    this.setup(password);
    this.acroForm = this.catalog.catDict.get('AcroForm');
  }

  function find(stream, needle, limit, backwards) {
    var pos = stream.pos;
    var end = stream.end;
    var str = '';
    if (pos + limit > end)
      limit = end - pos;
    for (var n = 0; n < limit; ++n)
      str += stream.getChar();
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
    get linearization() {
      var length = this.stream.length;
      var linearization = false;
      if (length) {
        try {
          linearization = new Linearization(this.stream);
          if (linearization.length != length)
            linearization = false;
        } catch (err) {
          warn('The linearization data is not available ' +
               'or unreadable pdf data is found');
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
            ch = stream.getChar();
          } while (Lexer.isSpace(ch));
          var str = '';
          while ((ch - '0') <= 9) {
            str += ch;
            ch = stream.getChar();
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
        while ((ch = stream.getChar()) > ' ') {
          if (version.length >= MAX_VERSION_LENGTH) {
            break;
          }
          version += ch;
        }
        // removing "%PDF-"-prefix
        this.pdfFormatVersion = version.substring(5);
        return;
      }
      // May not be a PDF file, continue anyway.
    },
    setup: function PDFDocument_setup(password) {
      this.checkHeader();
      var xref = new XRef(this.stream,
                          this.startXRef,
                          this.mainXRefEntriesOffset,
                          password);
      this.xref = xref;
      this.catalog = new Catalog(xref);
    },
    get numPages() {
      var linearization = this.linearization;
      var num = linearization ? linearization.numPages : this.catalog.numPages;
      // shadow the prototype getter
      return shadow(this, 'numPages', num);
    },
    getDocumentInfo: function PDFDocument_getDocumentInfo() {
      var docInfo = {
        PDFFormatVersion: this.pdfFormatVersion,
        IsAcroFormPresent: !!this.acroForm
      };
      if (this.xref.trailer.has('Info')) {
        var infoDict = this.xref.trailer.get('Info');

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
      return shadow(this, 'getDocumentInfo', docInfo);
    },
    getFingerprint: function PDFDocument_getFingerprint() {
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

      return shadow(this, 'getFingerprint', fileID);
    },
    getPage: function PDFDocument_getPage(n) {
      return this.catalog.getPage(n);
    }
  };

  return PDFDocument;
})();

