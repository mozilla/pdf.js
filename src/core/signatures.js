/* Copyright 2015 Mozilla Foundation
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
/* globals createPromiseCapability, Promise, globalScope, org, isRef */

'use strict';

var SignatureVerifierPromise = (function SignatureVerifierPromiseClosure() {
  var emptyResult = {valid: [], invalid: []};
  var trustedCertificates = []; // TODO

  function SignatureVerifierPromise(pdfDocument) {
    this._pdfDocument = pdfDocument;
    this._capability = createPromiseCapability();

    var acroForm = this._pdfDocument.xref.root.get('AcroForm');
    if (acroForm) {
      this.findSignatures(acroForm);
    } else {
      this._capability.resolve(emptyResult);
    }

    return this._capability.promise;
  }

  SignatureVerifierPromise.prototype = {
    findSignatures: function SignatureVerifierPromise_findSignatures(acroForm) {
      var fields = acroForm.get('Fields');
      var promises = [];
      fields.forEach(function(field) {
        if (isRef(field)) {
          var promise = this._pdfDocument.pdfManager.ensureXRef('fetch',
                                                                [field]);
          promises.push(promise);
        }
      }, this);

      Promise.all(promises).then(this.getSignatureData.bind(this), function() {
        this._capability.resolve(emptyResult);
      }.bind(this));
    },
    getSignatureData:
        function SignatureVerifierPromise_getSignatureData(signatures) {
      var signaturesData = [];
      signatures.forEach(function(sigField) {
        var sigFieldType = sigField.get('FT');
        if (typeof sigFieldType === 'undefined' ||
            sigFieldType.name !== 'Sig') {
          return;
        }

        var v = sigField.get('V');
        var byteRange = v.get('ByteRange');
        var contents = v.get('Contents');
        var subFilter = v.get('SubFilter');
        var reason = v.get('Reason');
        var time = v.get('M');
        var name = v.get('Name');
        var location = v.get('Location');
        var contactInfo = v.get('ContactInfo');
        
        signaturesData.push({
          byteRange: byteRange,
          contents: contents,
          type: subFilter.name,
          reason: reason,
          time: time,
          name: name,
          location: location,
          contactInfo: contactInfo,
        });
      });

      this.checkAllValidity(signaturesData);
    },
    checkAllValidity:
    function SignatureVerifierPromise_checkAllValidity(signaturesData) {
      this.loadPkiJs();

      var promises = signaturesData.map(function(sigData) {
        return this.processSignature(sigData);
      }, this);

      Promise.all(promises).then(function(validResults) {
        var combined = {valid: [], invalid: []};
        for (var i = 0; i < validResults.length; i++) {
          var sigData = signaturesData[i];
          // Remove unnecessary properties
          delete sigData.byteRange;
          delete sigData.contents;
          if (sigData.isValid) {
            combined.valid.push(sigData);
          } else {
            combined.invalid.push(sigData);
          }
        }
        this._capability.resolve(combined);
      }.bind(this));
    },
    loadPkiJs: function SignatureVerifierPromise_loadPkiJs() {
      // Ensure PKIjs is exported to globalScope, since otherwise it will try to
      // export to window which doesn't exist for a worker.
      globalScope.exports = globalScope;
      importScripts('../external/PKIjs/org/pkijs/common.js',
                    '../external/ASN1js/org/pkijs/asn1.js',
                    '../external/PKIjs/org/pkijs/x509_schema.js',
                    '../external/PKIjs/org/pkijs/x509_simpl.js',
                    '../external/PKIjs/org/pkijs/cms_schema.js',
                    '../external/PKIjs/org/pkijs/cms_simpl.js');
    },
    // Check for validity and add certificate info
    processSignature: function SignatureVerifierPromise_isValid(sigData) {
      var byteRange = sigData.byteRange;
      var contents = sigData.contents;
      var contentLength = contents.length;
      var contentBuffer = new ArrayBuffer(contentLength);
      var contentView = new Uint8Array(contentBuffer);
      var i;

      for (i = 0; i < contentLength; i++) {
        contentView[i] = contents.charCodeAt(i);
      }

      var asn1 = org.pkijs.fromBER(contentBuffer);
      var cmsContent = new org.pkijs.simpl.CMS_CONTENT_INFO({
        schema: asn1.result
      });
      var cmsSigned = new org.pkijs.simpl.CMS_SIGNED_DATA({
        schema: cmsContent.content
      });
      this.addCertInfo(sigData, cmsSigned.certificates);

      var signedDataBuffer = new ArrayBuffer(byteRange[1] + byteRange[3]);
      var signedDataView = new Uint8Array(signedDataBuffer);
      var count = 0;
      var view = this._pdfDocument.xref.stream.makeSubStream(byteRange[0],
        byteRange[1]).getBytes(byteRange[1]);
      for (i = 0; i < view.length; i++, count++) {
        signedDataView[count] = view[i];
      }
      view = this._pdfDocument.xref.stream.makeSubStream(byteRange[2],
        byteRange[3]).getBytes(byteRange[3]);
      for (i = 0; i < view.length; i++, count++) {
        signedDataView[count] = view[i];
      }

      return Promise.resolve().then(function() { // Verify certificate
        return cmsSigned.verify({ signer: 0, data: signedDataBuffer,
          trusted_certs: trustedCertificates });
      }).then(function(result) {
        if (result === false) {
          throw 'Signature verification failed';
        }
      }).then(function() { // Calculate the PDF data's actual digest
        if ('signedAttrs' in cmsSigned.signerInfos[0]) {
          var crypto = org.pkijs.getCrypto();
          if (typeof crypto === 'undefined') {
            throw 'WebCrypto extension is not installed';
          }

          var algoMap = {
            '1.3.14.3.2.26': 'sha-1',
            '2.16.840.1.101.3.4.2.1': 'sha-256',
            '2.16.840.1.101.3.4.2.2': 'sha-384',
            '2.16.840.1.101.3.4.2.3': 'sha-512',
          };
          var algId = cmsSigned.signerInfos[0].digestAlgorithm.algorithm_id;
          if (algoMap.hasOwnProperty(algId)) {
            return crypto.digest({ name: algoMap[algId] },
                                 new Uint8Array(signedDataBuffer));
          } else {
            throw 'Unknown hashing algorithm';
          }
        }
      }).then(function(actualDigest) { // Check expected = actual digest
        var expectedDigest = null;
        var attributes = cmsSigned.signerInfos[0].signedAttrs.attributes;
        for (var j = 0; j < attributes.length; j++) {
          var attrType = attributes[j].attrType;
          if (attrType === '1.2.840.113549.1.9.4') {
            expectedDigest = attributes[j].attrValues[0].value_block.value_hex;
            break;
          }
        }

        if (expectedDigest === null) {
          throw 'No signed attribute "MessageDigest"';
        }

        var view1 = new Uint8Array(expectedDigest);
        var view2 = new Uint8Array(actualDigest);
        if (view1.length !== view2.length) {
          throw 'Hash is not correct';
        }

        for (var i = 0; i < view1.length; i++) {
          if (view1[i] !== view2[i]) {
            throw 'Incorrect hash';
          }
        }
      }).then(function() {
        // Successfully verified PDF without throwing errors
        sigData.isValid = true;
      }).catch(function(reason) {
        sigData.invalidReason = reason;
        sigData.isValid = false;
      });
    },
    addCertInfo: function SignatureVerifierPromise_addCertInfo(sigData, certs) {
      var leafCertSubject = certs[certs.length - 1].subject.types_and_values;
      var cn = '';
      var on = '';
      
      leafCertSubject.forEach(function(attr) {
        if (attr.type === '2.5.4.3') {
          cn = attr.value.value_block.value;
        } else if (attr.type === '2.5.4.10') {
          on = attr.value.value_block.value;
        }
      });

      sigData.certInfo = {cn: cn, on: on};
    },
  };

  return SignatureVerifierPromise;
})();
