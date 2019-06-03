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

import {
  assert, FormatError, getInheritableProperty, info, isArrayBuffer, isNum,
  isSpace, isString, MissingDataException, OPS, shadow, stringToBytes,
  stringToPDFString, Util, warn
} from '../shared/util';
import { Catalog, ObjectLoader, XRef } from './obj';
import { Dict, isDict, isName, isStream, Ref } from './primitives';
import { NullStream, Stream, StreamsSequenceStream } from './stream';
import { AnnotationFactory } from './annotation';
import { calculateMD5 } from './crypto';
import { Linearization } from './parser';
import { OperatorList } from './operator_list';
import { PartialEvaluator } from './evaluator';
import { PDFFunctionFactory } from './function';

var Page = (function PageClosure() {

  var DEFAULT_USER_UNIT = 1.0;
  var LETTER_SIZE_MEDIABOX = [0, 0, 612, 792];

  function isAnnotationRenderable(annotation, intent) {
    return (intent === 'display' && annotation.viewable) ||
           (intent === 'print' && annotation.printable);
  }

  function Page({ pdfManager, xref, pageIndex, pageDict, ref, fontCache,
                  builtInCMapCache, pdfFunctionFactory, }) {
    this.pdfManager = pdfManager;
    this.pageIndex = pageIndex;
    this.pageDict = pageDict;
    this.xref = xref;
    this.ref = ref;
    this.fontCache = fontCache;
    this.builtInCMapCache = builtInCMapCache;
    this.pdfFunctionFactory = pdfFunctionFactory;
    this.evaluatorOptions = pdfManager.evaluatorOptions;
    this.resourcesPromise = null;

    var uniquePrefix = 'p' + this.pageIndex + '_';
    var idCounters = {
      obj: 0,
    };
    this.idFactory = {
      createObjId() {
        return uniquePrefix + (++idCounters.obj);
      },
    };
  }

  Page.prototype = {
    /**
     * @private
     */
    _getInheritableProperty(key, getArray = false) {
      let value = getInheritableProperty({ dict: this.pageDict, key, getArray,
                                           stopWhenFound: false, });
      if (!Array.isArray(value)) {
        return value;
      }
      if (value.length === 1 || !isDict(value[0])) {
        return value[0];
      }
      return Dict.merge(this.xref, value);
    },

    get content() {
      return this.pageDict.get('Contents');
    },

    get resources() {
      // For robustness: The spec states that a \Resources entry has to be
      // present, but can be empty. Some document omit it still, in this case
      // we return an empty dictionary.
      return shadow(this, 'resources',
                    this._getInheritableProperty('Resources') || Dict.empty);
    },

    get mediaBox() {
      var mediaBox = this._getInheritableProperty('MediaBox',
                                                  /* getArray = */ true);
      // Reset invalid media box to letter size.
      if (!Array.isArray(mediaBox) || mediaBox.length !== 4) {
        return shadow(this, 'mediaBox', LETTER_SIZE_MEDIABOX);
      }
      return shadow(this, 'mediaBox', mediaBox);
    },

    get cropBox() {
      var cropBox = this._getInheritableProperty('CropBox',
                                                 /* getArray = */ true);
      // Reset invalid crop box to media box.
      if (!Array.isArray(cropBox) || cropBox.length !== 4) {
        return shadow(this, 'cropBox', this.mediaBox);
      }
      return shadow(this, 'cropBox', cropBox);
    },

    get userUnit() {
      var obj = this.pageDict.get('UserUnit');
      if (!isNum(obj) || obj <= 0) {
        obj = DEFAULT_USER_UNIT;
      }
      return shadow(this, 'userUnit', obj);
    },

    get view() {
      // From the spec, 6th ed., p.963:
      // "The crop, bleed, trim, and art boxes should not ordinarily
      // extend beyond the boundaries of the media box. If they do, they are
      // effectively reduced to their intersection with the media box."
      var mediaBox = this.mediaBox, cropBox = this.cropBox;
      if (mediaBox === cropBox) {
        return shadow(this, 'view', mediaBox);
      }
      var intersection = Util.intersect(cropBox, mediaBox);
      return shadow(this, 'view', intersection || mediaBox);
    },

    get rotate() {
      var rotate = this._getInheritableProperty('Rotate') || 0;
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
      if (Array.isArray(content)) {
        // fetching items
        var xref = this.xref;
        var i, n = content.length;
        var streams = [];
        for (i = 0; i < n; ++i) {
          streams.push(xref.fetchIfRef(content[i]));
        }
        stream = new StreamsSequenceStream(streams);
      } else if (isStream(content)) {
        stream = content;
      } else {
        // replacing non-existent page content with empty one
        stream = new NullStream();
      }
      return stream;
    },

    loadResources: function Page_loadResources(keys) {
      if (!this.resourcesPromise) {
        // TODO: add async `_getInheritableProperty` and remove this.
        this.resourcesPromise = this.pdfManager.ensure(this, 'resources');
      }
      return this.resourcesPromise.then(() => {
        let objectLoader = new ObjectLoader(this.resources, keys, this.xref);

        return objectLoader.load();
      });
    },

    getOperatorList({ handler, task, intent, renderInteractiveForms, }) {
      var contentStreamPromise = this.pdfManager.ensure(this,
                                                        'getContentStream');
      var resourcesPromise = this.loadResources([
        'ExtGState',
        'ColorSpace',
        'Pattern',
        'Shading',
        'XObject',
        'Font'
        // ProcSet
        // Properties
      ]);

      var partialEvaluator = new PartialEvaluator({
        pdfManager: this.pdfManager,
        xref: this.xref,
        handler,
        pageIndex: this.pageIndex,
        idFactory: this.idFactory,
        fontCache: this.fontCache,
        builtInCMapCache: this.builtInCMapCache,
        options: this.evaluatorOptions,
        pdfFunctionFactory: this.pdfFunctionFactory,
      });

      var dataPromises = Promise.all([contentStreamPromise, resourcesPromise]);
      var pageListPromise = dataPromises.then(([contentStream]) => {
        var opList = new OperatorList(intent, handler, this.pageIndex);

        handler.send('StartRenderPage', {
          transparency: partialEvaluator.hasBlendModes(this.resources),
          pageIndex: this.pageIndex,
          intent,
        });
        return partialEvaluator.getOperatorList({
          stream: contentStream,
          task,
          resources: this.resources,
          operatorList: opList,
        }).then(function () {
          return opList;
        });
      });

      // Fetch the page's annotations and add their operator lists to the
      // page's operator list to render them.
      return Promise.all([pageListPromise, this._parsedAnnotations]).then(
          function ([pageOpList, annotations]) {
        if (annotations.length === 0) {
          pageOpList.flush(true);
          return pageOpList;
        }

        // Collect the operator list promises for the annotations. Each promise
        // is resolved with the complete operator list for a single annotation.
        var i, ii, opListPromises = [];
        for (i = 0, ii = annotations.length; i < ii; i++) {
          if (isAnnotationRenderable(annotations[i], intent)) {
            opListPromises.push(annotations[i].getOperatorList(
              partialEvaluator, task, renderInteractiveForms));
          }
        }

        return Promise.all(opListPromises).then(function(opLists) {
          pageOpList.addOp(OPS.beginAnnotations, []);
          for (i = 0, ii = opLists.length; i < ii; i++) {
            pageOpList.addOpList(opLists[i]);
          }
          pageOpList.addOp(OPS.endAnnotations, []);

          pageOpList.flush(true);
          return pageOpList;
        });
      });
    },

    extractTextContent({ handler, task, normalizeWhitespace,
                         sink, combineTextItems, }) {
      var contentStreamPromise = this.pdfManager.ensure(this,
                                                        'getContentStream');
      var resourcesPromise = this.loadResources([
        'ExtGState',
        'XObject',
        'Font'
      ]);

      var dataPromises = Promise.all([contentStreamPromise, resourcesPromise]);
      return dataPromises.then(([contentStream]) => {
        var partialEvaluator = new PartialEvaluator({
          pdfManager: this.pdfManager,
          xref: this.xref,
          handler,
          pageIndex: this.pageIndex,
          idFactory: this.idFactory,
          fontCache: this.fontCache,
          builtInCMapCache: this.builtInCMapCache,
          options: this.evaluatorOptions,
          pdfFunctionFactory: this.pdfFunctionFactory,
        });

        return partialEvaluator.getTextContent({
          stream: contentStream,
          task,
          resources: this.resources,
          normalizeWhitespace,
          combineTextItems,
          sink,
        });
      });
    },

    getAnnotationsData(intent) {
      return this._parsedAnnotations.then(function(annotations) {
        let annotationsData = [];
        for (let i = 0, ii = annotations.length; i < ii; i++) {
          if (!intent || isAnnotationRenderable(annotations[i], intent)) {
            annotationsData.push(annotations[i].data);
          }
        }
        return annotationsData;
      });
    },

    get annotations() {
      return shadow(this, 'annotations',
                    this._getInheritableProperty('Annots') || []);
    },

    get _parsedAnnotations() {
      const parsedAnnotations =
        this.pdfManager.ensure(this, 'annotations').then(() => {
          const annotationRefs = this.annotations;
          const annotationPromises = [];
          for (let i = 0, ii = annotationRefs.length; i < ii; i++) {
            annotationPromises.push(AnnotationFactory.create(
              this.xref, annotationRefs[i], this.pdfManager, this.idFactory));
          }

          return Promise.all(annotationPromises).then(function(annotations) {
            return annotations.filter(function isDefined(annotation) {
              return !!annotation;
            });
          }, function(reason) {
            warn(`_parsedAnnotations: "${reason}".`);
            return [];
          });
        });

      return shadow(this, '_parsedAnnotations', parsedAnnotations);
    },
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
  var FINGERPRINT_FIRST_BYTES = 1024;
  var EMPTY_FINGERPRINT = '\x00\x00\x00\x00\x00\x00\x00' +
    '\x00\x00\x00\x00\x00\x00\x00\x00\x00';

  function PDFDocument(pdfManager, arg) {
    var stream;
    if (isStream(arg)) {
      stream = arg;
    } else if (isArrayBuffer(arg)) {
      stream = new Stream(arg);
    } else {
      throw new Error('PDFDocument: Unknown argument type');
    }
    if (stream.length <= 0) {
      throw new Error('PDFDocument: stream must have data');
    }

    this.pdfManager = pdfManager;
    this.stream = stream;
    this.xref = new XRef(stream, pdfManager);

    let evaluatorOptions = pdfManager.evaluatorOptions;
    this.pdfFunctionFactory = new PDFFunctionFactory({
      xref: this.xref,
      isEvalSupported: evaluatorOptions.isEvalSupported,
    });
    this._pagePromises = [];
  }

  function find(stream, needle, limit, backwards) {
    var pos = stream.pos;
    var end = stream.end;
    var strBuf = [];
    if (pos + limit > end) {
      limit = end - pos;
    }
    for (var n = 0; n < limit; ++n) {
      strBuf.push(String.fromCharCode(stream.getByte()));
    }
    var str = strBuf.join('');
    stream.pos = pos;
    var index = backwards ? str.lastIndexOf(needle) : str.indexOf(needle);
    if (index === -1) {
      return false; /* not found */
    }
    stream.pos += index;
    return true; /* found */
  }

  const DocumentInfoValidators = {
    Title: isString,
    Author: isString,
    Subject: isString,
    Keywords: isString,
    Creator: isString,
    Producer: isString,
    CreationDate: isString,
    ModDate: isString,
    Trapped: isName,
  };

  PDFDocument.prototype = {
    parse: function PDFDocument_parse(recoveryMode) {
      this.setup(recoveryMode);
      var version = this.catalog.catDict.get('Version');
      if (isName(version)) {
        this.pdfFormatVersion = version.name;
      }
      try {
        // checking if AcroForm is present
        this.acroForm = this.catalog.catDict.get('AcroForm');
        if (this.acroForm) {
          this.xfa = this.acroForm.get('XFA');
          var fields = this.acroForm.get('Fields');
          if ((!fields || !Array.isArray(fields) || fields.length === 0) &&
              !this.xfa) {
            // no fields and no XFA -- not a form (?)
            this.acroForm = null;
          }
        }
      } catch (ex) {
        if (ex instanceof MissingDataException) {
          throw ex;
        }
        info('Something wrong with AcroForm entry');
        this.acroForm = null;
      }
    },

    get linearization() {
      let linearization = null;
      try {
        linearization = Linearization.create(this.stream);
      } catch (err) {
        if (err instanceof MissingDataException) {
          throw err;
        }
        info(err);
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
        if (find(stream, 'endobj', 1024)) {
          startXRef = stream.pos + 6;
        }
      } else {
        // Find startxref by jumping backward from the end of the file.
        var step = 1024;
        var found = false, pos = stream.end;
        while (!found && pos > 0) {
          pos -= step - 'startxref'.length;
          if (pos < 0) {
            pos = 0;
          }
          stream.pos = pos;
          found = find(stream, 'startxref', step, true);
        }
        if (found) {
          stream.skip(9);
          var ch;
          do {
            ch = stream.getByte();
          } while (isSpace(ch));
          var str = '';
          while (ch >= 0x20 && ch <= 0x39) { // < '9'
            str += String.fromCharCode(ch);
            ch = stream.getByte();
          }
          startXRef = parseInt(str, 10);
          if (isNaN(startXRef)) {
            startXRef = 0;
          }
        }
      }
      // shadow the prototype getter with a data property
      return shadow(this, 'startXRef', startXRef);
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
        if (!this.pdfFormatVersion) {
          // removing "%PDF-"-prefix
          this.pdfFormatVersion = version.substring(5);
        }
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
      const docInfo = {
        PDFFormatVersion: this.pdfFormatVersion,
        IsLinearized: !!this.linearization,
        IsAcroFormPresent: !!this.acroForm,
        IsXFAPresent: !!this.xfa,
      };
      let infoDict;
      try {
        infoDict = this.xref.trailer.get('Info');
      } catch (err) {
        if (err instanceof MissingDataException) {
          throw err;
        }
        info('The document information dictionary is invalid.');
      }
      if (isDict(infoDict)) {
        // Only fill the document info with valid entries from the spec.
        for (let key in DocumentInfoValidators) {
          if (infoDict.has(key)) {
            const value = infoDict.get(key);
            // Make sure the value conforms to the spec.
            if (DocumentInfoValidators[key](value)) {
              docInfo[key] = (typeof value !== 'string' ?
                              value : stringToPDFString(value));
            } else {
              info('Bad value in document info for "' + key + '"');
            }
          }
        }
      }
      return shadow(this, 'documentInfo', docInfo);
    },
    get fingerprint() {
      var xref = this.xref, hash, fileID = '';
      var idArray = xref.trailer.get('ID');

      if (Array.isArray(idArray) && idArray[0] && isString(idArray[0]) &&
          idArray[0] !== EMPTY_FINGERPRINT) {
        hash = stringToBytes(idArray[0]);
      } else {
        if (this.stream.ensureRange) {
          this.stream.ensureRange(0,
            Math.min(FINGERPRINT_FIRST_BYTES, this.stream.end));
        }
        hash = calculateMD5(this.stream.bytes.subarray(0,
          FINGERPRINT_FIRST_BYTES), 0, FINGERPRINT_FIRST_BYTES);
      }

      for (var i = 0, n = hash.length; i < n; i++) {
        var hex = hash[i].toString(16);
        fileID += hex.length === 1 ? '0' + hex : hex;
      }

      return shadow(this, 'fingerprint', fileID);
    },

    _getLinearizationPage(pageIndex) {
      const { catalog, linearization, } = this;
      assert(linearization && linearization.pageFirst === pageIndex);

      const ref = new Ref(linearization.objectNumberFirst, 0);
      return this.xref.fetchAsync(ref).then((obj) => {
        // Ensure that the object that was found is actually a Page dictionary.
        if (isDict(obj, 'Page') ||
            (isDict(obj) && !obj.has('Type') && obj.has('Contents'))) {
          if (ref && !catalog.pageKidsCountCache.has(ref)) {
            catalog.pageKidsCountCache.put(ref, 1); // Cache the Page reference.
          }
          return [obj, ref];
        }
        throw new FormatError('The Linearization dictionary doesn\'t point ' +
                              'to a valid Page dictionary.');
      }).catch((reason) => {
        info(reason);
        return catalog.getPageDict(pageIndex);
      });
    },

    getPage(pageIndex) {
      if (this._pagePromises[pageIndex] !== undefined) {
        return this._pagePromises[pageIndex];
      }
      const { catalog, linearization, } = this;

      const promise = (linearization && linearization.pageFirst === pageIndex) ?
        this._getLinearizationPage(pageIndex) : catalog.getPageDict(pageIndex);

      return this._pagePromises[pageIndex] = promise.then(([pageDict, ref]) => {
        return new Page({
          pdfManager: this.pdfManager,
          xref: this.xref,
          pageIndex,
          pageDict,
          ref,
          fontCache: catalog.fontCache,
          builtInCMapCache: catalog.builtInCMapCache,
          pdfFunctionFactory: this.pdfFunctionFactory,
        });
      });
    },

    cleanup: function PDFDocument_cleanup() {
      return this.catalog.cleanup();
    },
  };

  return PDFDocument;
})();

export {
  Page,
  PDFDocument,
};
