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
           MissingDataException, Promise */

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

globalScope.PDFJS.pdfBug = false;


var Page = (function PageClosure() {

  function getDefaultAnnotationAppearance(annotationDict) {
    var appearanceState = annotationDict.get('AP');
    if (!isDict(appearanceState)) {
      return;
    }

    var appearance;
    var appearances = appearanceState.get('N');
    if (isDict(appearances)) {
      var as = annotationDict.get('AS');
      if (as && appearances.has(as.name)) {
        appearance = appearances.get(as.name);
      }
    } else {
      appearance = appearances;
    }
    return appearance;
  }

  function Page(pdfManager, xref, pageIndex, pageDict, ref) {
    this.pdfManager = pdfManager;
    this.pageIndex = pageIndex;
    this.pageDict = pageDict;
    this.xref = xref;
    this.ref = ref;
    this.idCounters = {
      font: 0,
      obj: 0
    };
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
    get annotations() {
      return shadow(this, 'annotations', this.inheritPageProp('Annots'));
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
    getOperatorList: function Page_getOperatorList(handler) {
      var self = this;
      var promise = new Promise();

      var pageListPromise = new Promise();
      var annotationListPromise = new Promise();

      var pdfManager = this.pdfManager;
      var contentStreamPromise = pdfManager.ensure(this, 'getContentStream',
                                                   []);
      var resourcesPromise = pdfManager.ensure(this, 'resources');

      var partialEvaluator = new PartialEvaluator(
            pdfManager, this.xref, handler,
            this.pageIndex, 'p' + this.pageIndex + '_',
            this.idCounters);

      var dataPromises = Promise.all(
          [contentStreamPromise, resourcesPromise]);
      dataPromises.then(function(data) {
        var contentStream = data[0];
        var resources = data[1];

        pdfManager.ensure(partialEvaluator, 'getOperatorList',
                          [contentStream, resources]).then(
          function(opListPromise) {
            opListPromise.then(function(data) {
              pageListPromise.resolve(data);
            });
          }
        );
      });

      pdfManager.ensure(this, 'getAnnotationsForDraw', []).then(
        function(annotations) {
          pdfManager.ensure(partialEvaluator, 'getAnnotationsOperatorList',
                            [annotations]).then(
            function(opListPromise) {
              opListPromise.then(function(data) {
                annotationListPromise.resolve(data);
              });
            }
          );
        }
      );

      Promise.all([pageListPromise, annotationListPromise]).then(
        function(datas) {
          var pageData = datas[0];
          var pageQueue = pageData.queue;
          var annotationData = datas[1];
          var annotationQueue = annotationData.queue;
          Util.concatenateToArray(pageQueue.fnArray, annotationQueue.fnArray);
          Util.concatenateToArray(pageQueue.argsArray,
                                  annotationQueue.argsArray);
          PartialEvaluator.optimizeQueue(pageQueue);
          Util.extendObj(pageData.dependencies, annotationData.dependencies);

          promise.resolve(pageData);
        }
      );

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
      var resourcesPromise = new Promise();
      pdfManager.ensure(this, 'resources').then(function(resources) {
        pdfManager.ensure(self.xref, 'fetchIfRef', [resources]).then(
          function(resources) {
            resourcesPromise.resolve(resources);
          }
        );
      });

      var dataPromises = Promise.all([contentStreamPromise,
                                      resourcesPromise]);
      dataPromises.then(function(data) {
        var contentStream = data[0];
        var resources = data[1];
        var partialEvaluator = new PartialEvaluator(
              pdfManager, self.xref, handler,
              self.pageIndex, 'p' + self.pageIndex + '_',
              self.idCounters);

        partialEvaluator.getTextContent(
            contentStream, resources).then(function(bidiTexts) {
          textContentPromise.resolve({
            bidiTexts: bidiTexts
          });
        });
      });

      return textContentPromise;
    },
    getLinks: function Page_getLinks() {
      var links = [];
      var annotations = this.getAnnotations();
      var i, n = annotations.length;
      for (i = 0; i < n; ++i) {
        if (annotations[i].type != 'Link')
          continue;
        links.push(annotations[i]);
      }
      return links;
    },

    getAnnotations: function Page_getAnnotations() {
      var annotations = this.getAnnotationsBase();
      var items = [];
      for (var i = 0, length = annotations.length; i < length; ++i) {
        items.push(annotations[i].item);
      }
      return items;
    },

    getAnnotationsForDraw: function Page_getAnnotationsForDraw() {
      var annotations = this.getAnnotationsBase();
      var items = [];
      for (var i = 0, length = annotations.length; i < length; ++i) {
        var item = annotations[i].item;
        var annotationDict = annotations[i].dict;

        item.annotationFlags = annotationDict.get('F');

        var appearance = getDefaultAnnotationAppearance(annotationDict);
        if (appearance &&
            // TODO(mack): The proper implementation requires that the
            // appearance stream overrides Name, but we're currently
            // doing it the other way around for 'Text' annotations since we
            // have special rendering for it
            item.type !== 'Text') {

          item.appearance = appearance;
          var appearanceDict = appearance.dict;
          item.resources = appearanceDict.get('Resources');
          item.bbox = appearanceDict.get('BBox') || [0, 0, 1, 1];
          item.matrix = appearanceDict.get('Matrix') || [1, 0, 0, 1, 0 ,0];
        }

        var border = annotationDict.get('BS');
        if (isDict(border) && !item.appearance) {
          var borderWidth = border.has('W') ? border.get('W') : 1;
          if (borderWidth !== 0) {
            item.border = {
              width: borderWidth,
              type: border.get('S') || 'S',
              rgb: annotationDict.get('C') || [0, 0, 1]
            };
          }
        }

        items.push(item);
      }

      return items;
    },

    getAnnotationsBase: function Page_getAnnotationsBase() {
      var xref = this.xref;
      function getInheritableProperty(annotation, name) {
        var item = annotation;
        while (item && !item.has(name)) {
          item = item.get('Parent');
        }
        if (!item)
          return null;
        return item.get(name);
      }
      function isValidUrl(url) {
        if (!url)
          return false;
        var colon = url.indexOf(':');
        if (colon < 0)
          return false;
        var protocol = url.substr(0, colon);
        switch (protocol) {
          case 'http':
          case 'https':
          case 'ftp':
          case 'mailto':
            return true;
          default:
            return false;
        }
      }

      var annotations = this.annotations || [];
      var i, n = annotations.length;
      var items = [];
      for (i = 0; i < n; ++i) {
        var annotationRef = annotations[i];
        var annotation = xref.fetchIfRef(annotationRef);
        if (!isDict(annotation))
          continue;
        var subtype = annotation.get('Subtype');
        if (!isName(subtype))
          continue;

        var item = {};
        item.type = subtype.name;
        var rect = annotation.get('Rect');
        item.rect = Util.normalizeRect(rect);

        var includeAnnotation = true;
        switch (subtype.name) {
          case 'Link':
            var a = annotation.get('A');
            if (a) {
              switch (a.get('S').name) {
                case 'URI':
                  var url = a.get('URI');
                  // TODO: pdf spec mentions urls can be relative to a Base
                  // entry in the dictionary.
                  if (!isValidUrl(url))
                    url = '';
                  item.url = url;
                  break;
                case 'GoTo':
                  item.dest = a.get('D');
                  break;
                case 'GoToR':
                  var url = a.get('F');
                  if (isDict(url)) {
                    // We assume that the 'url' is a Filspec dictionary
                    // and fetch the url without checking any further
                    url = url.get('F') || '';
                  }

                  // TODO: pdf reference says that GoToR
                  // can also have 'NewWindow' attribute
                  if (!isValidUrl(url))
                    url = '';
                  item.url = url;
                  item.dest = a.get('D');
                  break;
                default:
                  TODO('unrecognized link type: ' + a.get('S').name);
              }
            } else if (annotation.has('Dest')) {
              // simple destination link
              var dest = annotation.get('Dest');
              item.dest = isName(dest) ? dest.name : dest;
            }
            break;
          case 'Widget':
            var fieldType = getInheritableProperty(annotation, 'FT');
            if (!isName(fieldType))
              break;

            // Do not display digital signatures since we do not currently
            // validate them.
            if (fieldType.name === 'Sig') {
              includeAnnotation = false;
              break;
            }

            item.fieldType = fieldType.name;
            // Building the full field name by collecting the field and
            // its ancestors 'T' properties and joining them using '.'.
            var fieldName = [];
            var namedItem = annotation, ref = annotationRef;
            while (namedItem) {
              var parent = namedItem.get('Parent');
              var parentRef = namedItem.getRaw('Parent');
              var name = namedItem.get('T');
              if (name) {
                fieldName.unshift(stringToPDFString(name));
              } else {
                // The field name is absent, that means more than one field
                // with the same name may exist. Replacing the empty name
                // with the '`' plus index in the parent's 'Kids' array.
                // This is not in the PDF spec but necessary to id the
                // the input controls.
                var kids = parent.get('Kids');
                var j, jj;
                for (j = 0, jj = kids.length; j < jj; j++) {
                  var kidRef = kids[j];
                  if (kidRef.num == ref.num && kidRef.gen == ref.gen)
                    break;
                }
                fieldName.unshift('`' + j);
              }
              namedItem = parent;
              ref = parentRef;
            }
            item.fullName = fieldName.join('.');
            var alternativeText = stringToPDFString(annotation.get('TU') || '');
            item.alternativeText = alternativeText;
            var da = getInheritableProperty(annotation, 'DA') || '';
            var m = /([\d\.]+)\sTf/.exec(da);
            if (m)
              item.fontSize = parseFloat(m[1]);
            item.textAlignment = getInheritableProperty(annotation, 'Q');
            item.flags = getInheritableProperty(annotation, 'Ff') || 0;
            break;
          case 'Text':
            var content = annotation.get('Contents');
            var title = annotation.get('T');
            item.content = stringToPDFString(content || '');
            item.title = stringToPDFString(title || '');
            item.name = !annotation.has('Name') ? 'Note' :
              annotation.get('Name').name;
            break;
          default:
            var appearance = getDefaultAnnotationAppearance(annotation);
            if (!appearance) {
              TODO('unimplemented annotation type: ' + subtype.name);
            }
            break;
        }
        if (includeAnnotation) {
          items.push({
            item: item,
            dict: annotation
          });
        }
      }
      return items;
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
    var xref = new XRef(this.stream, password);
    this.xref = xref;
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
    parse: function PDFDocument_parse(recoveryMode) {
      this.setup(recoveryMode);
      this.acroForm = this.catalog.catDict.get('AcroForm');
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

