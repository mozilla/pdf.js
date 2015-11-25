/*
 * Copyright (c) 2014, GMO GlobalSign
 * Copyright (c) 2015, Peculiar Ventures
 * All rights reserved.
 *
 * Author 2014-2015, Yury Strozhevsky <www.strozhevsky.com>.
 *
 * Redistribution and use in source and binary forms, with or without modification, 
 * are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, 
 *    this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice, 
 *    this list of conditions and the following disclaimer in the documentation 
 *    and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its contributors 
 *    may be used to endorse or promote products derived from this software without 
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND 
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED 
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. 
 * IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, 
 * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT 
 * NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR 
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, 
 * WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) 
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY 
 * OF SUCH DAMAGE. 
 *
 */
(
function(in_window)
{
    //**************************************************************************************
    // #region Declaration of global variables 
    //**************************************************************************************
    // #region "org" namespace 
    if(typeof in_window.org === "undefined")
        in_window.org = {};
    else
    {
        if(typeof in_window.org !== "object")
            throw new Error("Name org already exists and it's not an object");
    }
    // #endregion 

    // #region "org.pkijs" namespace 
    if(typeof in_window.org.pkijs === "undefined")
        in_window.org.pkijs = {};
    else
    {
        if(typeof in_window.org.pkijs !== "object")
            throw new Error("Name org.pkijs already exists and it's not an object" + " but " + (typeof in_window.org.pkijs));
    }
    // #endregion 

    // #region "org.pkijs.schema" namespace 
    if(typeof in_window.org.pkijs.schema === "undefined")
        in_window.org.pkijs.schema = {};
    else
    {
        if(typeof in_window.org.pkijs.schema !== "object")
            throw new Error("Name org.pkijs.schema already exists and it's not an object" + " but " + (typeof in_window.org.pkijs.schema));
    }
    // #endregion 

    // #region "org.pkijs.schema.ocsp" namespace 
    if(typeof in_window.org.pkijs.schema.ocsp === "undefined")
        in_window.org.pkijs.schema.ocsp = {};
    else
    {
        if(typeof in_window.org.pkijs.schema.ocsp !== "object")
            throw new Error("Name org.pkijs.schema.ocsp already exists and it's not an object" + " but " + (typeof in_window.org.pkijs.schema.ocsp));
    }
    // #endregion 

    // #region "org.pkijs.schema.tsp" namespace 
    if(typeof in_window.org.pkijs.schema.tsp === "undefined")
        in_window.org.pkijs.schema.tsp = {};
    else
    {
        if(typeof in_window.org.pkijs.schema.tsp !== "object")
            throw new Error("Name org.pkijs.schema.tsp already exists and it's not an object" + " but " + (typeof in_window.org.pkijs.schema.tsp));
    }
    // #endregion 

    // #region "local" namespace 
    var local = {};
    // #endregion   
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for OCSP request (RFC6960) 
    //**************************************************************************************
    in_window.org.pkijs.schema.ocsp.CertID =
    function()
    {
        //CertID          ::=     SEQUENCE {
        //    hashAlgorithm       AlgorithmIdentifier,
        //    issuerNameHash      OCTET STRING, -- Hash of issuer's DN
        //    issuerKeyHash       OCTET STRING, -- Hash of issuer's public key
        //    serialNumber        CertificateSerialNumber }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.signature || {
                    names: {
                        block_name: (names.hashAlgorithm || "")
                    }
                }),
                new in_window.org.pkijs.asn1.OCTETSTRING({ name: (names.issuerNameHash || "") }),
                new in_window.org.pkijs.asn1.OCTETSTRING({ name: (names.issuerKeyHash || "") }),
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.serialNumber || "") })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.ocsp.Request =
    function()
    {
        //Request         ::=     SEQUENCE {
        //    reqCert                     CertID,
        //    singleRequestExtensions     [0] EXPLICIT Extensions OPTIONAL }
        
        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                in_window.org.pkijs.schema.ocsp.CertID(names.reqCert || {}),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: [in_window.org.pkijs.schema.EXTENSIONS(names.extensions || {
                        names: {
                            block_name: (names.singleRequestExtensions || "")
                        }
                    })]
                })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.ocsp.TBSRequest =
    function()
    {
        //TBSRequest      ::=     SEQUENCE {
        //    version             [0]     EXPLICIT Version DEFAULT v1,
        //    requestorName       [1]     EXPLICIT GeneralName OPTIONAL,
        //    requestList                 SEQUENCE OF Request,
        //    requestExtensions   [2]     EXPLICIT Extensions OPTIONAL }
        
        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || "TBSRequest"),
            value: [
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: [new in_window.org.pkijs.asn1.INTEGER({ name: (names.TBSRequest_version || "TBSRequest.version") })]
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    },
                    value: [in_window.org.pkijs.schema.GENERAL_NAME(names.requestorName || {
                        names: {
                            block_name: "TBSRequest.requestorName"
                        }
                    })]
                }),
                new in_window.org.pkijs.asn1.SEQUENCE({
                    name: (names.requestList || "TBSRequest.requestList"),
                    value: [
                        new in_window.org.pkijs.asn1.REPEATED({
                            name: (names.requests || "TBSRequest.requests"),
                            value: in_window.org.pkijs.schema.ocsp.Request(names.requestNames || {})
                        })
                    ]
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 2 // [2]
                    },
                    value: [in_window.org.pkijs.schema.EXTENSIONS(names.extensions || {
                        names: {
                            block_name: (names.requestExtensions || "TBSRequest.requestExtensions")
                        }
                    })]
                })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.ocsp.Signature =
    function()
    {
        //Signature       ::=     SEQUENCE {
        //    signatureAlgorithm      AlgorithmIdentifier,
        //    signature               BIT STRING,
        //    certs               [0] EXPLICIT SEQUENCE OF Certificate OPTIONAL }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.signatureAlgorithm || {}),
                new in_window.org.pkijs.asn1.BITSTRING({ name: (names.signature || "") }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: [
                        new in_window.org.pkijs.asn1.SEQUENCE({
                            value: [new in_window.org.pkijs.asn1.REPEATED({
                                name: (names.certs || ""),
                                value: in_window.org.pkijs.schema.CERT(names.certs || {})
                            })]
                        })
                    ]
                })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.OCSP_REQUEST =
    function()
    {
        //OCSPRequest     ::=     SEQUENCE {
        //    tbsRequest                  TBSRequest,
        //    optionalSignature   [0]     EXPLICIT Signature OPTIONAL }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: names.block_name || "OCSPRequest",
            value: [
                in_window.org.pkijs.schema.ocsp.TBSRequest(names.tbsRequest || {
                    names: {
                        block_name: "tbsRequest"
                    }
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: [
                        in_window.org.pkijs.schema.ocsp.Signature(names.optionalSignature || {
                            names: {
                                block_name: "optionalSignature"
                            }
                        })
                    ]
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "ResponderID" type
    //**************************************************************************************
    in_window.org.pkijs.schema.ocsp.ResponderID =
    function()
    {
        // KeyHash ::= OCTET STRING
        //
        // ResponderID ::= CHOICE {
        //    byName               [1] Name,
        //    byKey                [2] KeyHash }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.CHOICE({
            value: [
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    name: (names.block_name || ""),
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    },
                    value: [in_window.org.pkijs.schema.RDN(names.byName || {
                        names: {
                            block_name: ""
                        }
                    })]
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    name: (names.block_name || ""),
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 2 // [2]
                    },
                    value: [new in_window.org.pkijs.asn1.OCTETSTRING({ name: (names.byKey || "") })]
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for OCSP response (RFC6960) 
    //**************************************************************************************
    in_window.org.pkijs.schema.ocsp.ResponseBytes =
    function()
    {
        //ResponseBytes ::=       SEQUENCE {
        //    responseType   OBJECT IDENTIFIER,
        //    response       OCTET STRING }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.OID({ name: (names.responseType || "") }),
                new in_window.org.pkijs.asn1.OCTETSTRING({ name: (names.response || "") })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.OCSP_RESPONSE =
    function()
    {
        //OCSPResponse ::= SEQUENCE {
        //    responseStatus         OCSPResponseStatus,
        //    responseBytes          [0] EXPLICIT ResponseBytes OPTIONAL }
        //
        //OCSPResponseStatus ::= ENUMERATED {
        //    successful            (0),  -- Response has valid confirmations
        //    malformedRequest      (1),  -- Illegal confirmation request
        //    internalError         (2),  -- Internal error in issuer
        //    tryLater              (3),  -- Try again later
        //    -- (4) is not used
        //    sigRequired           (5),  -- Must sign the request
        //    unauthorized          (6)   -- Request unauthorized
        //}

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || "OCSPResponse"),
            value: [
                new in_window.org.pkijs.asn1.ENUMERATED({ name: (names.responseStatus || "responseStatus") }), 
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: [
                        in_window.org.pkijs.schema.ocsp.ResponseBytes(names.responseBytes || {
                            names: {
                                block_name: "responseBytes"
                            }
                        })
                    ]
                })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.ocsp.SingleResponse =
    function()
    {
        //SingleResponse ::= SEQUENCE {
        //    certID                       CertID,
        //    certStatus                   CertStatus,
        //    thisUpdate                   GeneralizedTime,
        //    nextUpdate         [0]       EXPLICIT GeneralizedTime OPTIONAL,
        //    singleExtensions   [1]       EXPLICIT Extensions OPTIONAL }
        //
        //CertStatus ::= CHOICE {
        //    good        [0]     IMPLICIT NULL,
        //    revoked     [1]     IMPLICIT RevokedInfo,
        //    unknown     [2]     IMPLICIT UnknownInfo }
        //
        //RevokedInfo ::= SEQUENCE {
        //    revocationTime              GeneralizedTime,
        //    revocationReason    [0]     EXPLICIT CRLReason OPTIONAL }
        //
        //UnknownInfo ::= NULL

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                in_window.org.pkijs.schema.ocsp.CertID(names.certID || {}),
                new in_window.org.pkijs.asn1.CHOICE({
                    value: [
                        new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                            name: (names.certStatus || ""),
                            id_block: {
                                tag_class: 3, // CONTEXT-SPECIFIC
                                tag_number: 0 // [0]
                            },
                            len_block_length: 1 // The length contains one byte 0x00
                        }), // IMPLICIT NULL (no "value_block")
                        new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                            name: (names.certStatus || ""),
                            id_block: {
                                tag_class: 3, // CONTEXT-SPECIFIC
                                tag_number: 1 // [1]
                            },
                            value: [
                                new in_window.org.pkijs.asn1.GENERALIZEDTIME(),
                                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                                    optional: true,
                                    id_block: {
                                        tag_class: 3, // CONTEXT-SPECIFIC
                                        tag_number: 0 // [0]
                                    },
                                    value: [new in_window.org.pkijs.asn1.ENUMERATED()]
                                })
                            ]
                        }),
                        new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                            name: (names.certStatus || ""),
                            id_block: {
                                tag_class: 3, // CONTEXT-SPECIFIC
                                tag_number: 2 // [2]
                            },
                            len_block: { length: 1 }
                        }) // IMPLICIT NULL (no "value_block")
                    ]
                }),
                new in_window.org.pkijs.asn1.GENERALIZEDTIME({ name: (names.thisUpdate || "") }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: [new in_window.org.pkijs.asn1.GENERALIZEDTIME({ name: (names.nextUpdate || "") })]
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    },
                    value: [in_window.org.pkijs.schema.EXTENSIONS(names.singleExtensions || {})]
                }) // EXPLICIT SEQUENCE value
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.ocsp.ResponseData =
    function()
    {
        //ResponseData ::= SEQUENCE {
        //    version              [0] EXPLICIT Version DEFAULT v1,
        //    responderID              ResponderID,
        //    producedAt               GeneralizedTime,
        //    responses                SEQUENCE OF SingleResponse,
        //    responseExtensions   [1] EXPLICIT Extensions OPTIONAL }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || "ResponseData"),
            value: [
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: [new in_window.org.pkijs.asn1.INTEGER({ name: (names.version || "ResponseData.version") })]
                }),
                new in_window.org.pkijs.asn1.CHOICE({
                    value: [
                        new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                            name: (names.responderID || "ResponseData.responderID"),
                            id_block: {
                                tag_class: 3, // CONTEXT-SPECIFIC
                                tag_number: 1 // [1]
                            },
                            value: [in_window.org.pkijs.schema.RDN(names.ResponseData_byName || {
                                names: {
                                    block_name: "ResponseData.byName"
                                }
                            })]
                        }),
                        new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                            name: (names.responderID || "ResponseData.responderID"),
                            id_block: {
                                tag_class: 3, // CONTEXT-SPECIFIC
                                tag_number: 2 // [2]
                            },
                            value: [new in_window.org.pkijs.asn1.OCTETSTRING({ name: (names.ResponseData_byKey || "ResponseData.byKey") })]
                        })
                    ]
                }),
                new in_window.org.pkijs.asn1.GENERALIZEDTIME({ name: (names.producedAt || "ResponseData.producedAt") }),
                new in_window.org.pkijs.asn1.SEQUENCE({
                    value: [
                        new in_window.org.pkijs.asn1.REPEATED({
                            name: "ResponseData.responses",
                            value: in_window.org.pkijs.schema.ocsp.SingleResponse(names.response || {})
                        })
                    ]
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    },
                    value: [in_window.org.pkijs.schema.EXTENSIONS(names.extensions || {
                        names: {
                            block_name: "ResponseData.responseExtensions"
                        }
                    })]
                }) // EXPLICIT SEQUENCE value
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.OCSP_BASIC_RESPONSE =
    function()
    {
        //BasicOCSPResponse       ::= SEQUENCE {
        //    tbsResponseData      ResponseData,
        //    signatureAlgorithm   AlgorithmIdentifier,
        //    signature            BIT STRING,
        //    certs            [0] EXPLICIT SEQUENCE OF Certificate OPTIONAL }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || "BasicOCSPResponse"),
            value: [
                in_window.org.pkijs.schema.ocsp.ResponseData(names.tbsResponseData || {
                    names: {
                        block_name: "BasicOCSPResponse.tbsResponseData"
                    }
                }),
                in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.signatureAlgorithm || {
                    names: {
                        block_name: "BasicOCSPResponse.signatureAlgorithm"
                    }
                }),
                new in_window.org.pkijs.asn1.BITSTRING({ name: (names.signature || "BasicOCSPResponse.signature") }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: [
                        new in_window.org.pkijs.asn1.SEQUENCE({
                            value: [new in_window.org.pkijs.asn1.REPEATED({
                                name: "BasicOCSPResponse.certs",
                                value: in_window.org.pkijs.schema.CERT(names.certs || {})
                            })]
                        })
                    ]
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for Time-stamp request type (RFC3161) 
    //**************************************************************************************
    in_window.org.pkijs.schema.tsp.MessageImprint =
    function()
    {
        //MessageImprint ::= SEQUENCE  {
        //    hashAlgorithm                AlgorithmIdentifier,
        //    hashedMessage                OCTET STRING  }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.hashAlgorithm || {}),
                new in_window.org.pkijs.asn1.OCTETSTRING({ name: (names.hashedMessage || "") })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.TSP_REQUEST =
    function()
    {
        //TimeStampReq ::= SEQUENCE  {
        //    version               INTEGER  { v1(1) },
        //    messageImprint        MessageImprint,
        //    reqPolicy             TSAPolicyId              OPTIONAL,
        //    nonce                 INTEGER                  OPTIONAL,
        //    certReq               BOOLEAN                  DEFAULT FALSE,
        //    extensions            [0] IMPLICIT Extensions  OPTIONAL  }
        //
        //TSAPolicyId ::= OBJECT IDENTIFIER

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || "TimeStampReq"),
            value: [
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.version || "TimeStampReq.version") }),
                in_window.org.pkijs.schema.tsp.MessageImprint(names.messageImprint || {
                    names: {
                        block_name: "TimeStampReq.messageImprint"
                    }
                }),
                new in_window.org.pkijs.asn1.OID({
                    name: (names.reqPolicy || "TimeStampReq.reqPolicy"),
                    optional: true
                }),
                new in_window.org.pkijs.asn1.INTEGER({
                    name: (names.nonce || "TimeStampReq.nonce"),
                    optional: true
                }),
                new in_window.org.pkijs.asn1.BOOLEAN({
                    name: (names.certReq || "TimeStampReq.certReq"),
                    optional: true
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: [new in_window.org.pkijs.asn1.REPEATED({
                        name: (names.extensions || "TimeStampReq.extensions"),
                        value: in_window.org.pkijs.schema.EXTENSION()
                    })]
                }) // IMPLICIT SEQUENCE value
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for Time-stamp response (RFC3161) 
    //**************************************************************************************
    in_window.org.pkijs.schema.tsp.Accuracy =
    function()
    {
        //Accuracy ::= SEQUENCE {
        //    seconds        INTEGER              OPTIONAL,
        //    millis     [0] INTEGER  (1..999)    OPTIONAL,
        //    micros     [1] INTEGER  (1..999)    OPTIONAL  }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            optional: true,
            value: [
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.seconds || "") }),
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    name: (names.millis || ""),
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    }
                }),
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    name: (names.micros || ""),
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    }
                })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.TST_INFO =
    function()
    {
        //TSTInfo ::= SEQUENCE  {
        //   version                      INTEGER  { v1(1) },
        //   policy                       TSAPolicyId,
        //   messageImprint               MessageImprint,
        //   serialNumber                 INTEGER,
        //   genTime                      GeneralizedTime,
        //   accuracy                     Accuracy                 OPTIONAL,
        //   ordering                     BOOLEAN             DEFAULT FALSE,
        //   nonce                        INTEGER                  OPTIONAL,
        //   tsa                          [0] GeneralName          OPTIONAL,
        //   extensions                   [1] IMPLICIT Extensions  OPTIONAL  }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || "TSTInfo"),
            value: [
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.version || "TSTInfo.version") }),
                new in_window.org.pkijs.asn1.OID({ name: (names.policy || "TSTInfo.policy") }),
                in_window.org.pkijs.schema.tsp.MessageImprint(names.messageImprint || {
                    names: {
                        block_name: "TSTInfo.messageImprint"
                    }
                }),
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.serialNumber || "TSTInfo.serialNumber") }),
                new in_window.org.pkijs.asn1.GENERALIZEDTIME({ name: (names.genTime || "TSTInfo.genTime") }),
                in_window.org.pkijs.schema.tsp.Accuracy(names.accuracy || {
                    names: {
                        block_name: "TSTInfo.accuracy"
                    }
                }),
                new in_window.org.pkijs.asn1.BOOLEAN({
                    name: (names.ordering || "TSTInfo.ordering"),
                    optional: true
                }),
                new in_window.org.pkijs.asn1.INTEGER({
                    name: (names.nonce || "TSTInfo.nonce"),
                    optional: true
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: [in_window.org.pkijs.schema.GENERAL_NAME(names.tsa || {
                        names: {
                            block_name: "TSTInfo.tsa"
                        }
                    })]
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    },
                    value: [
                        new in_window.org.pkijs.asn1.REPEATED({
                            name: (names.extensions || "TSTInfo.extensions"),
                            value: in_window.org.pkijs.schema.EXTENSION(names.extension || {})
                        })
                    ]
                }) // IMPLICIT Extensions
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.tsp.PKIStatusInfo =
    function()
    {
        //PKIStatusInfo ::= SEQUENCE {
        //    status        PKIStatus,
        //    statusString  PKIFreeText     OPTIONAL,
        //    failInfo      PKIFailureInfo  OPTIONAL  }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.status || "") }),
                new in_window.org.pkijs.asn1.SEQUENCE({
                    optional: true,
                    value: [
                        new in_window.org.pkijs.asn1.REPEATED({
                            name: (names.statusStrings || ""),
                            value: new in_window.org.pkijs.asn1.UTF8STRING()
                        })
                    ]
                }),
                new in_window.org.pkijs.asn1.BITSTRING({
                    name: (names.failInfo || ""),
                    optional: true
                })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.TSP_RESPONSE =
    function()
    {
        //TimeStampResp ::= SEQUENCE  {
        //    status                  PKIStatusInfo,
        //    timeStampToken          TimeStampToken     OPTIONAL  }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || "TimeStampResp"),
            value: [
                in_window.org.pkijs.schema.tsp.PKIStatusInfo(names.status || {
                    names: {
                        block_name: "TimeStampResp.status"
                    }
                }),
                in_window.org.pkijs.schema.CMS_CONTENT_INFO(names.timeStampToken || {
                    names: {
                        block_name: "TimeStampResp.timeStampToken"
                    }
                }, true)
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
}
)(typeof exports !== "undefined" ? exports : window);