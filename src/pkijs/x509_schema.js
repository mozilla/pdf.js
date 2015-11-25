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

    // #region "org.pkijs.schema.x509" namespace 
    if(typeof in_window.org.pkijs.schema.x509 === "undefined")
        in_window.org.pkijs.schema.x509 = {};
    else
    {
        if(typeof in_window.org.pkijs.schema.x509 !== "object")
            throw new Error("Name org.pkijs.schema.x509 already exists and it's not an object" + " but " + (typeof in_window.org.pkijs.schema.x509));
    }
    // #endregion 

    // #region "local" namespace 
    var local = {};
    // #endregion   
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "Time" type 
    //**************************************************************************************
    in_window.org.pkijs.schema.TIME =
    function(input_names, input_optional)
    {
        var names = in_window.org.pkijs.getNames(arguments[0]);
        var optional = (input_optional || false);

        return (new in_window.org.pkijs.asn1.CHOICE({
            optional: optional,
            value: [
                new in_window.org.pkijs.asn1.UTCTIME({ name: (names.utcTimeName || "") }),
                new in_window.org.pkijs.asn1.GENERALIZEDTIME({ name: (names.generalTimeName || "") })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for X.509 v3 certificate (RFC5280)
    //**************************************************************************************
    local.tbsCertificate =
    function()
    {
        //TBSCertificate  ::=  SEQUENCE  {
        //    version         [0]  EXPLICIT Version DEFAULT v1,
        //    serialNumber         CertificateSerialNumber,
        //    signature            AlgorithmIdentifier,
        //    issuer               Name,
        //    validity             Validity,
        //    subject              Name,
        //    subjectPublicKeyInfo SubjectPublicKeyInfo,
        //    issuerUniqueID  [1]  IMPLICIT UniqueIdentifier OPTIONAL,
        //                         -- If present, version MUST be v2 or v3
        //    subjectUniqueID [2]  IMPLICIT UniqueIdentifier OPTIONAL,
        //                         -- If present, version MUST be v2 or v3
        //    extensions      [3]  EXPLICIT Extensions OPTIONAL
        //    -- If present, version MUST be v3
        //}

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || "tbsCertificate"),
            value: [
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                value: [
                    new in_window.org.pkijs.asn1.INTEGER({ name: (names.tbsCertificate_version || "tbsCertificate.version") }) // EXPLICIT integer value
                ]
            }),
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.tbsCertificate_serialNumber || "tbsCertificate.serialNumber") }),
                in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.signature || {
                    names: {
                        block_name: "tbsCertificate.signature"
                    }
                }),
                in_window.org.pkijs.schema.RDN(names.issuer || {
                    names: {
                        block_name: "tbsCertificate.issuer"
                    }
                }),
                new in_window.org.pkijs.asn1.SEQUENCE({
                    name: (names.tbsCertificate_validity || "tbsCertificate.validity"),
                    value: [
                        in_window.org.pkijs.schema.TIME(names.not_before || {
                            names: {
                                utcTimeName: "tbsCertificate.notBefore",
                                generalTimeName: "tbsCertificate.notBefore"
                            }
                        }),
                        in_window.org.pkijs.schema.TIME(names.not_after || {
                            names: {
                                utcTimeName: "tbsCertificate.notAfter",
                                generalTimeName: "tbsCertificate.notAfter"
                            }
                        })
                    ]
                }),
                in_window.org.pkijs.schema.RDN(names.subject || {
                    names: {
                        block_name: "tbsCertificate.subject"
                    }
                }),
                in_window.org.pkijs.schema.PUBLIC_KEY_INFO(names.subjectPublicKeyInfo || {
                    names: {
                        block_name: "tbsCertificate.subjectPublicKeyInfo"
                    }
                }),
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    name: (names.tbsCertificate_issuerUniqueID ||"tbsCertificate.issuerUniqueID"),
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    }
                }), // IMPLICIT bistring value
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    name: (names.tbsCertificate_subjectUniqueID ||"tbsCertificate.subjectUniqueID"),
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 2 // [2]
                    }
                }), // IMPLICIT bistring value
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 3 // [3]
                    },
                    value: [in_window.org.pkijs.schema.EXTENSIONS(names.extensions || {
                        names: {
                            block_name: "tbsCertificate.extensions"
                        }
                    })]
                }) // EXPLICIT SEQUENCE value
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.CERT =
    function()
    {
        //Certificate  ::=  SEQUENCE  {
        //    tbsCertificate       TBSCertificate,
        //    signatureAlgorithm   AlgorithmIdentifier,
        //    signatureValue       BIT STRING  }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                local.tbsCertificate(names.tbsCertificate),
                in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.signatureAlgorithm || {
                    names: {
                        block_name: "signatureAlgorithm"
                    }
                }),
                new in_window.org.pkijs.asn1.BITSTRING({ name: (names.signatureValue || "signatureValue") })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for X.509 CRL (Certificate Revocation List)(RFC5280)  
    //**************************************************************************************
    local.tbsCertList =
    function()
    {
        //TBSCertList  ::=  SEQUENCE  {
        //    version                 Version OPTIONAL,
        //                                 -- if present, MUST be v2
        //    signature               AlgorithmIdentifier,
        //    issuer                  Name,
        //    thisUpdate              Time,
        //    nextUpdate              Time OPTIONAL,
        //    revokedCertificates     SEQUENCE OF SEQUENCE  {
        //        userCertificate         CertificateSerialNumber,
        //        revocationDate          Time,
        //        crlEntryExtensions      Extensions OPTIONAL
        //        -- if present, version MUST be v2
        //    }  OPTIONAL,
        //    crlExtensions           [0]  EXPLICIT Extensions OPTIONAL
        //    -- if present, version MUST be v2
        //}

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || "tbsCertList"),
            value: [
                        new in_window.org.pkijs.asn1.INTEGER({
                            optional: true,
                            name: (names.tbsCertList_version || "tbsCertList.version"),
                            value: 2
                        }), // EXPLICIT integer value (v2)
                        in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.signature || {
                            names: {
                                block_name: "tbsCertList.signature"
                            }
                        }),
                        in_window.org.pkijs.schema.RDN(names.issuer || {
                            names: {
                                block_name: "tbsCertList.issuer"
                            }
                        }),
                        in_window.org.pkijs.schema.TIME(names.tbsCertList_thisUpdate || {
                            names: {
                                utcTimeName: "tbsCertList.thisUpdate",
                                generalTimeName: "tbsCertList.thisUpdate"
                            }
                        }),
                        in_window.org.pkijs.schema.TIME(names.tbsCertList_thisUpdate || {
                            names: {
                                utcTimeName: "tbsCertList.nextUpdate",
                                generalTimeName: "tbsCertList.nextUpdate"
                            }
                        }, true),
                        new in_window.org.pkijs.asn1.SEQUENCE({
                            optional: true,
                            value: [
                                new in_window.org.pkijs.asn1.REPEATED({
                                    name: (names.tbsCertList_revokedCertificates || "tbsCertList.revokedCertificates"),
                                    value: new in_window.org.pkijs.asn1.SEQUENCE({
                                        value: [
                                            new in_window.org.pkijs.asn1.INTEGER(),
                                            in_window.org.pkijs.schema.TIME(),
                                            in_window.org.pkijs.schema.EXTENSIONS({}, true)
                                        ]
                                    })
                                })
                            ]
                        }),
                        new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                            optional: true,
                            id_block: {
                                tag_class: 3, // CONTEXT-SPECIFIC
                                tag_number: 0 // [0]
                            },
                            value: [in_window.org.pkijs.schema.EXTENSIONS(names.crlExtensions || {
                                names: {
                                    block_name: "tbsCertList.extensions"
                                }
                            })]
                        }) // EXPLICIT SEQUENCE value
                    ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.CRL =
    function()
    {
        //CertificateList  ::=  SEQUENCE  {
        //    tbsCertList          TBSCertList,
        //    signatureAlgorithm   AlgorithmIdentifier,
        //    signatureValue       BIT STRING  }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || "CertificateList"),
            value: [
                local.tbsCertList(arguments[0]),
                in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.signatureAlgorithm || {
                    names: {
                        block_name: "signatureAlgorithm"
                    }
                }),
                new in_window.org.pkijs.asn1.BITSTRING({ name: (names.signatureValue || "signatureValue") })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for PKCS#10 certificate request 
    //**************************************************************************************
    local.CertificationRequestInfo =
    function()
    {
        //CertificationRequestInfo ::= SEQUENCE {
        //    version       INTEGER { v1(0) } (v1,...),
        //    subject       Name,
        //    subjectPKInfo SubjectPublicKeyInfo{{ PKInfoAlgorithms }},
        //    attributes    [0] Attributes{{ CRIAttributes }}
        //}

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.CertificationRequestInfo || "CertificationRequestInfo"),
            value: [
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.CertificationRequestInfo_version || "CertificationRequestInfo.version") }),
                new in_window.org.pkijs.schema.RDN(names.subject || {
                    names: {
                        block_name: "CertificationRequestInfo.subject"
                    }
                }),
                new in_window.org.pkijs.schema.PUBLIC_KEY_INFO({
                    names: {
                        block_name: "CertificationRequestInfo.subjectPublicKeyInfo"
                    }
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: [
                        new in_window.org.pkijs.asn1.REPEATED({
                            optional: true, // Because OpenSSL makes wrong "attributes" field
                            name: (names.CertificationRequestInfo_attributes || "CertificationRequestInfo.attributes"),
                            value: in_window.org.pkijs.schema.ATTRIBUTE(names.attributes || {})
                        })
                    ]
                })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.PKCS10 =
    function()
    {
        //CertificationRequest ::= SEQUENCE {
        //    certificationRequestInfo CertificationRequestInfo,
        //    signatureAlgorithm       AlgorithmIdentifier{{ SignatureAlgorithms }},
        //    signature                BIT STRING
        //}

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: [
                local.CertificationRequestInfo(names.certificationRequestInfo || {}),
                new in_window.org.pkijs.asn1.SEQUENCE({
                    name: (names.signatureAlgorithm || "signatureAlgorithm"),
                    value: [
                        new in_window.org.pkijs.asn1.OID(),
                        new in_window.org.pkijs.asn1.ANY({ optional: true })
                    ]
                }),
                new in_window.org.pkijs.asn1.BITSTRING({ name: (names.signatureValue || "signatureValue") })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for PKCS#8 private key bag
    //**************************************************************************************
    in_window.org.pkijs.schema.PKCS8 =
    function()
    {
        //PrivateKeyInfo ::= SEQUENCE {
        //    version Version,
        //    privateKeyAlgorithm AlgorithmIdentifier {{PrivateKeyAlgorithms}},
        //    privateKey PrivateKey,
        //    attributes [0] Attributes OPTIONAL }
        //
        //Version ::= INTEGER {v1(0)} (v1,...)
        //
        //PrivateKey ::= OCTET STRING
        //
        //Attributes ::= SET OF Attribute

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: [
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.version || "") }),
                in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.privateKeyAlgorithm || ""),
                new in_window.org.pkijs.asn1.OCTETSTRING({ name: (names.privateKey || "") }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: [
                        new in_window.org.pkijs.asn1.REPEATED({
                            name: (names.attributes || ""),
                            value: in_window.org.pkijs.schema.ATTRIBUTE()
                        })
                    ]
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "GeneralName" type 
    //**************************************************************************************
    local.BuiltInStandardAttributes =
    function(optional_flag)
    {
        //BuiltInStandardAttributes ::= SEQUENCE {
        //    country-name                  CountryName OPTIONAL,
        //    administration-domain-name    AdministrationDomainName OPTIONAL,
        //    network-address           [0] IMPLICIT NetworkAddress OPTIONAL,
        //    terminal-identifier       [1] IMPLICIT TerminalIdentifier OPTIONAL,
        //    private-domain-name       [2] PrivateDomainName OPTIONAL,
        //    organization-name         [3] IMPLICIT OrganizationName OPTIONAL,
        //    numeric-user-identifier   [4] IMPLICIT NumericUserIdentifier OPTIONAL,
        //    personal-name             [5] IMPLICIT PersonalName OPTIONAL,
        //    organizational-unit-names [6] IMPLICIT OrganizationalUnitNames OPTIONAL }

        if(typeof optional_flag === "undefined")
            optional_flag = false;

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            optional: optional_flag,
            value: [
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 2, // APPLICATION-SPECIFIC
                        tag_number: 1 // [1]
                    },
                    name: (names.country_name || ""),
                    value: [
                        new in_window.org.pkijs.asn1.CHOICE({
                            value: [
                                new in_window.org.pkijs.asn1.NUMERICSTRING(),
                                new in_window.org.pkijs.asn1.PRINTABLESTRING()
                            ]
                        })
                    ]
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 2, // APPLICATION-SPECIFIC
                        tag_number: 2 // [2]
                    },
                    name: (names.administration_domain_name || ""),
                    value: [
                        new in_window.org.pkijs.asn1.CHOICE({
                            value: [
                                new in_window.org.pkijs.asn1.NUMERICSTRING(),
                                new in_window.org.pkijs.asn1.PRINTABLESTRING()
                            ]
                        })
                    ]
                }),
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    name: (names.network_address || ""),
                    is_hex_only: true
                }),
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    },
                    name: (names.terminal_identifier || ""),
                    is_hex_only: true
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 2 // [2]
                    },
                    name: (names.private_domain_name || ""),
                    value: [
                        new in_window.org.pkijs.asn1.CHOICE({
                            value: [
                                new in_window.org.pkijs.asn1.NUMERICSTRING(),
                                new in_window.org.pkijs.asn1.PRINTABLESTRING()
                            ]
                        })
                    ]
                }),
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 3 // [3]
                    },
                    name: (names.organization_name || ""),
                    is_hex_only: true
                }),
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    optional: true,
                    name: (names.numeric_user_identifier || ""),
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 4 // [4]
                    },
                    is_hex_only: true
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    name: (names.personal_name || ""),
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 5 // [5]
                    },
                    value: [
                        new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                            id_block: {
                                tag_class: 3, // CONTEXT-SPECIFIC
                                tag_number: 0 // [0]
                            },
                            is_hex_only: true
                        }),
                        new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                            optional: true,
                            id_block: {
                                tag_class: 3, // CONTEXT-SPECIFIC
                                tag_number: 1 // [1]
                            },
                            is_hex_only: true
                        }),
                        new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                            optional: true,
                            id_block: {
                                tag_class: 3, // CONTEXT-SPECIFIC
                                tag_number: 2 // [2]
                            },
                            is_hex_only: true
                        }),
                        new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                            optional: true,
                            id_block: {
                                tag_class: 3, // CONTEXT-SPECIFIC
                                tag_number: 3 // [3]
                            },
                            is_hex_only: true
                        })
                    ]
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    name: (names.organizational_unit_names || ""),
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 6 // [6]
                    },
                    value: [
                        new in_window.org.pkijs.asn1.REPEATED({
                            value: new in_window.org.pkijs.asn1.PRINTABLESTRING()
                        })
                    ]
                })
            ]
        }));
    }
    //**************************************************************************************
    local.BuiltInDomainDefinedAttributes =
    function(optional_flag)
    {
        if(typeof optional_flag === "undefined")
            optional_flag = false;

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            optional: optional_flag,
            value: [
                new in_window.org.pkijs.asn1.PRINTABLESTRING(),
                new in_window.org.pkijs.asn1.PRINTABLESTRING()
            ]
        }));
    }
    //**************************************************************************************
    local.ExtensionAttributes =
    function(optional_flag)
    {
        if(typeof optional_flag === "undefined")
            optional_flag = false;

        return (new in_window.org.pkijs.asn1.SET({
            optional: optional_flag,
            value: [
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    is_hex_only: true
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    },
                    value: [new in_window.org.pkijs.asn1.ANY()]
                })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.GENERAL_NAME =
    function()
    {
        /// <remarks>By passing "names" array as an argument you can name each element of "GENERAL NAME" choice</remarks>

        //GeneralName ::= CHOICE {
        //    otherName                       [0]     OtherName,
        //    rfc822Name                      [1]     IA5String,
        //    dNSName                         [2]     IA5String,
        //    x400Address                     [3]     ORAddress,
        //    directoryName                   [4]     Name,
        //    ediPartyName                    [5]     EDIPartyName,
        //    uniformResourceIdentifier       [6]     IA5String,
        //    iPAddress                       [7]     OCTET STRING,
        //    registeredID                    [8]     OBJECT IDENTIFIER }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.CHOICE({
            value: [
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    name: (names.block_name || ""),
                    value: [
                            new in_window.org.pkijs.asn1.OID(),
                            new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                                id_block: {
                                    tag_class: 3, // CONTEXT-SPECIFIC
                                    tag_number: 0 // [0]
                                },
                                value: [new in_window.org.pkijs.asn1.ANY()]
                            })
                    ]
                }),
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    name: (names.block_name || ""),
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    }
                }),
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    name: (names.block_name || ""),
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 2 // [2]
                    }
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 3 // [3]
                    },
                    name: (names.block_name || ""),
                    value: [
                            local.BuiltInStandardAttributes(false),
                            local.BuiltInDomainDefinedAttributes(true),
                            local.ExtensionAttributes(true)
                    ]
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 4 // [4]
                    },
                    name: (names.block_name || ""),
                    value: [in_window.org.pkijs.schema.RDN(names.directoryName || {})]
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 5 // [5]
                    },
                    name: (names.block_name || ""),
                    value: [
                            new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                                optional: true,
                                id_block: {
                                    tag_class: 3, // CONTEXT-SPECIFIC
                                    tag_number: 0 // [0]
                                },
                                value: [
                                    new in_window.org.pkijs.asn1.CHOICE({
                                        value: [
                                            new in_window.org.pkijs.asn1.TELETEXSTRING(),
                                            new in_window.org.pkijs.asn1.PRINTABLESTRING(),
                                            new in_window.org.pkijs.asn1.UNIVERSALSTRING(),
                                            new in_window.org.pkijs.asn1.UTF8STRING(),
                                            new in_window.org.pkijs.asn1.BMPSTRING()
                                        ]
                                    })
                                ]
                            }),
                            new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                                id_block: {
                                    tag_class: 3, // CONTEXT-SPECIFIC
                                    tag_number: 1 // [1]
                                },
                                value: [
                                    new in_window.org.pkijs.asn1.CHOICE({
                                        value: [
                                            new in_window.org.pkijs.asn1.TELETEXSTRING(),
                                            new in_window.org.pkijs.asn1.PRINTABLESTRING(),
                                            new in_window.org.pkijs.asn1.UNIVERSALSTRING(),
                                            new in_window.org.pkijs.asn1.UTF8STRING(),
                                            new in_window.org.pkijs.asn1.BMPSTRING()
                                        ]
                                    })
                                ]
                            })
                    ]
                }),
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    name: (names.block_name || ""),
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 6 // [6]
                    }
                }),
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    name: (names.block_name || ""),
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 7 // [7]
                    }
                }),
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    name: (names.block_name || ""),
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 8 // [8]
                    }
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "AlgorithmIdentifier" type 
    //**************************************************************************************
    in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER =
    function()
    {
        //AlgorithmIdentifier  ::=  SEQUENCE  {
        //    algorithm               OBJECT IDENTIFIER,
        //    parameters              ANY DEFINED BY algorithm OPTIONAL  }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            optional: (names.optional || false),
            value: [
                new in_window.org.pkijs.asn1.OID({ name: (names.algorithmIdentifier || "") }),
                new in_window.org.pkijs.asn1.ANY({ name: (names.algorithmParams || ""), optional: true })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "RSAPublicKey" type (RFC3447)
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.RSAPublicKey =
    function()
    {
        //RSAPublicKey ::= SEQUENCE {
        //    modulus           INTEGER,  -- n
        //    publicExponent    INTEGER   -- e
        //}

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.modulus || "") }),
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.publicExponent || "") })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "OtherPrimeInfo" type (RFC3447) 
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.OtherPrimeInfo =
    function()
    {
        //OtherPrimeInfo ::= SEQUENCE {
        //    prime             INTEGER,  -- ri
        //    exponent          INTEGER,  -- di
        //    coefficient       INTEGER   -- ti
        //}

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.prime || "") }),
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.exponent || "") }),
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.coefficient || "") })
    ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "RSAPrivateKey" type (RFC3447)
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.RSAPrivateKey =
    function()
    {
        //RSAPrivateKey ::= SEQUENCE {
        //    version           Version,
        //    modulus           INTEGER,  -- n
        //    publicExponent    INTEGER,  -- e
        //    privateExponent   INTEGER,  -- d
        //    prime1            INTEGER,  -- p
        //    prime2            INTEGER,  -- q
        //    exponent1         INTEGER,  -- d mod (p-1)
        //    exponent2         INTEGER,  -- d mod (q-1)
        //    coefficient       INTEGER,  -- (inverse of q) mod p
        //    otherPrimeInfos   OtherPrimeInfos OPTIONAL
        //}
        //
        //OtherPrimeInfos ::= SEQUENCE SIZE(1..MAX) OF OtherPrimeInfo

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.version || "") }),
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.modulus || "") }),
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.publicExponent || "") }),
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.privateExponent || "") }),
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.prime1 || "") }),
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.prime2 || "") }),
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.exponent1 || "") }),
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.exponent2 || "") }),
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.coefficient || "") }),
                new in_window.org.pkijs.asn1.SEQUENCE({
                    optional: true,
                    value: [
                        new in_window.org.pkijs.asn1.REPEATED({
                            name: (names.otherPrimeInfos || ""),
                            value: in_window.org.pkijs.schema.x509.OtherPrimeInfo(names.otherPrimeInfo || {})
                        })
                    ]
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "RSASSA-PSS-params" type (RFC3447)
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.RSASSA_PSS_params =
    function()
    {
        //RSASSA-PSS-params  ::=  SEQUENCE  {
        //    hashAlgorithm      [0] HashAlgorithm DEFAULT sha1Identifier,
        //    maskGenAlgorithm   [1] MaskGenAlgorithm DEFAULT mgf1SHA1Identifier,
        //    saltLength         [2] INTEGER DEFAULT 20,
        //    trailerField       [3] INTEGER DEFAULT 1  }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    optional: true,
                    value: [in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.hashAlgorithm || {})]
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    },
                    optional: true,
                    value: [in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.maskGenAlgorithm || {})]
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 2 // [2]
                    },
                    optional: true,
                    value: [new in_window.org.pkijs.asn1.INTEGER({ name: (names.saltLength || "") })]
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 3 // [3]
                    },
                    optional: true,
                    value: [new in_window.org.pkijs.asn1.INTEGER({ name: (names.trailerField || "") })]
                }),
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "SubjectPublicKeyInfo" type 
    //**************************************************************************************
    in_window.org.pkijs.schema.PUBLIC_KEY_INFO =
    function()
    {
        //SubjectPublicKeyInfo  ::=  SEQUENCE  {
        //    algorithm            AlgorithmIdentifier,
        //    subjectPublicKey     BIT STRING  }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.algorithm || {}),
                new in_window.org.pkijs.asn1.BITSTRING({ name: (names.subjectPublicKey || "") })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "Attribute" type 
    //**************************************************************************************
    in_window.org.pkijs.schema.ATTRIBUTE =
    function()
    {
        // Attribute { ATTRIBUTE:IOSet } ::= SEQUENCE {
        //    type   ATTRIBUTE.&id({IOSet}),
        //    values SET SIZE(1..MAX) OF ATTRIBUTE.&Type({IOSet}{@type})
        //}

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.OID({ name: (names.type || "") }),
                new in_window.org.pkijs.asn1.SET({
                    name: (names.set_name || ""),
                    value: [
                        new in_window.org.pkijs.asn1.REPEATED({
                            name: (names.values || ""),
                            value: new in_window.org.pkijs.asn1.ANY()
                        })
                    ]
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "AttributeTypeAndValue" type 
    //**************************************************************************************
    in_window.org.pkijs.schema.ATTR_TYPE_AND_VALUE =
    function()
    {
        //AttributeTypeAndValue ::= SEQUENCE {
        //    type     AttributeType,
        //    value    AttributeValue }
        //
        //AttributeType ::= OBJECT IDENTIFIER
        //
        //AttributeValue ::= ANY -- DEFINED BY AttributeType

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.OID({ name: (names.type || "") }),
                new in_window.org.pkijs.asn1.ANY({ name: (names.value || "") })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "RelativeDistinguishedName" type 
    //**************************************************************************************
    in_window.org.pkijs.schema.RDN =
    function()
    {
        //RDNSequence ::= SEQUENCE OF RelativeDistinguishedName
        //
        //RelativeDistinguishedName ::=
        //SET SIZE (1..MAX) OF AttributeTypeAndValue

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.REPEATED({
                    name: (names.repeated_sequence || ""),
                    value: new in_window.org.pkijs.asn1.SET({
                        value: [
                            new in_window.org.pkijs.asn1.REPEATED({
                                name: (names.repeated_set || ""),
                                value: in_window.org.pkijs.schema.ATTR_TYPE_AND_VALUE(names.attr_type_and_value || {})
                            })
                        ]
                    })
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "Extension" type 
    //**************************************************************************************
    in_window.org.pkijs.schema.EXTENSION =
    function()
    {
        //Extension  ::=  SEQUENCE  {
        //    extnID      OBJECT IDENTIFIER,
        //    critical    BOOLEAN DEFAULT FALSE,
        //    extnValue   OCTET STRING
        //}

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.OID({ name: (names.extnID || "") }),
                new in_window.org.pkijs.asn1.BOOLEAN({
                    name: (names.critical || ""),
                    optional: true
                }),
                new in_window.org.pkijs.asn1.OCTETSTRING({ name: (names.extnValue || "") })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "Extensions" type (sequence of many Extension)
    //**************************************************************************************
    in_window.org.pkijs.schema.EXTENSIONS =
    function(input_names, input_optional)
    {
        //Extensions  ::=  SEQUENCE SIZE (1..MAX) OF Extension

        var names = in_window.org.pkijs.getNames(arguments[0]);
        var optional = input_optional || false;

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            optional: optional,
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.REPEATED({
                    name: (names.extensions || ""),
                    value: in_window.org.pkijs.schema.EXTENSION(names.extension || {})
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "AuthorityKeyIdentifier" type of extension 
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.AuthorityKeyIdentifier =
    function()
    {
        // AuthorityKeyIdentifier OID ::= 2.5.29.35
        // 
        //AuthorityKeyIdentifier ::= SEQUENCE {
        //    keyIdentifier             [0] KeyIdentifier           OPTIONAL,
        //    authorityCertIssuer       [1] GeneralNames            OPTIONAL,
        //    authorityCertSerialNumber [2] CertificateSerialNumber OPTIONAL  }
        //
        //KeyIdentifier ::= OCTET STRING

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    name: (names.keyIdentifier || ""),
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    }
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    },
                    value: [
                            new in_window.org.pkijs.asn1.REPEATED({
                                name: (names.authorityCertIssuer || ""),
                                value: in_window.org.pkijs.schema.GENERAL_NAME()
                            })
                    ]
                }),
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    name: (names.authorityCertSerialNumber || ""),
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 2 // [2]
                    }
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "PrivateKeyUsagePeriod" type of extension 
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.PrivateKeyUsagePeriod =
    function()
    {
        // PrivateKeyUsagePeriod OID ::= 2.5.29.16
        //
        //PrivateKeyUsagePeriod ::= SEQUENCE {
        //    notBefore       [0]     GeneralizedTime OPTIONAL,
        //    notAfter        [1]     GeneralizedTime OPTIONAL }
        //-- either notBefore or notAfter MUST be present

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    name: (names.notBefore || ""),
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    }
                }),
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    name: (names.notAfter || ""),
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
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "IssuerAltName" and "SubjectAltName" types of extension 
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.AltName =
    function()
    {
        // SubjectAltName OID ::= 2.5.29.17
        // IssuerAltName OID ::= 2.5.29.18
        //
        // AltName ::= GeneralNames

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.REPEATED({
                    name: (names.altNames || ""),
                    value: in_window.org.pkijs.schema.GENERAL_NAME()
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "SubjectDirectoryAttributes" type of extension 
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.SubjectDirectoryAttributes =
    function()
    {
        // SubjectDirectoryAttributes OID ::= 2.5.29.9
        //
        //SubjectDirectoryAttributes ::= SEQUENCE SIZE (1..MAX) OF Attribute

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.REPEATED({
                    name: (names.attributes || ""),
                    value: in_window.org.pkijs.schema.ATTRIBUTE()
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "GeneralSubtree" type 
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.GeneralSubtree =
    function()
    {
        //GeneralSubtree ::= SEQUENCE {
        //    base                    GeneralName,
        //    minimum         [0]     BaseDistance DEFAULT 0,
        //    maximum         [1]     BaseDistance OPTIONAL }
        //
        //BaseDistance ::= INTEGER (0..MAX)

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                in_window.org.pkijs.schema.GENERAL_NAME(names.base || ""),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: [new in_window.org.pkijs.asn1.INTEGER({ name: (names.minimum || "") })]
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    },
                    value: [new in_window.org.pkijs.asn1.INTEGER({ name: (names.maximum || "") })]
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "NameConstraints" type of extension 
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.NameConstraints =
    function()
    {
        // NameConstraints OID ::= 2.5.29.30
        //
        //NameConstraints ::= SEQUENCE {
        //    permittedSubtrees       [0]     GeneralSubtrees OPTIONAL,
        //    excludedSubtrees        [1]     GeneralSubtrees OPTIONAL }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: [
                        new in_window.org.pkijs.asn1.REPEATED({
                            name: (names.permittedSubtrees || ""),
                            value: in_window.org.pkijs.schema.x509.GeneralSubtree()
                        })
                    ]
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    },
                    value: [
                        new in_window.org.pkijs.asn1.REPEATED({
                            name: (names.excludedSubtrees || ""),
                            value: in_window.org.pkijs.schema.x509.GeneralSubtree()
                        })
                    ]
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "BasicConstraints" type of extension 
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.BasicConstraints =
    function()
    {
        // BasicConstraints OID ::= 2.5.29.19
        //
        //BasicConstraints ::= SEQUENCE {
        //    cA                      BOOLEAN DEFAULT FALSE,
        //    pathLenConstraint       INTEGER (0..MAX) OPTIONAL }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.BOOLEAN({
                    optional: true,
                    name: (names.cA || "")
                }),
                new in_window.org.pkijs.asn1.INTEGER({
                    optional: true,
                    name: (names.pathLenConstraint || "")
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "PolicyQualifierInfo" type 
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.PolicyQualifierInfo =
    function()
    {
        //PolicyQualifierInfo ::= SEQUENCE {
        //    policyQualifierId  PolicyQualifierId,
        //    qualifier          ANY DEFINED BY policyQualifierId }
        //
        //id-qt          OBJECT IDENTIFIER ::=  { id-pkix 2 }
        //id-qt-cps      OBJECT IDENTIFIER ::=  { id-qt 1 }
        //id-qt-unotice  OBJECT IDENTIFIER ::=  { id-qt 2 }
        //
        //PolicyQualifierId ::= OBJECT IDENTIFIER ( id-qt-cps | id-qt-unotice )

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.OID({ name: (names.policyQualifierId || "") }),
                new in_window.org.pkijs.asn1.ANY({ name: (names.qualifier || "") })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "PolicyInformation" type 
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.PolicyInformation =
    function()
    {
        //PolicyInformation ::= SEQUENCE {
        //    policyIdentifier   CertPolicyId,
        //    policyQualifiers   SEQUENCE SIZE (1..MAX) OF
        //    PolicyQualifierInfo OPTIONAL }
        //
        //CertPolicyId ::= OBJECT IDENTIFIER

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.OID({ name: (names.policyIdentifier || "") }),
                new in_window.org.pkijs.asn1.SEQUENCE({
                    optional: true,
                    value: [
                        new in_window.org.pkijs.asn1.REPEATED({
                            name: (names.policyQualifiers || ""),
                            value: in_window.org.pkijs.schema.x509.PolicyQualifierInfo()
                        })
                    ]
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "CertificatePolicies" type of extension 
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.CertificatePolicies =
    function()
    {
        // CertificatePolicies OID ::= 2.5.29.32
        //
        //certificatePolicies ::= SEQUENCE SIZE (1..MAX) OF PolicyInformation

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.REPEATED({
                    name: (names.certificatePolicies || ""),
                    value: in_window.org.pkijs.schema.x509.PolicyInformation()
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "PolicyMapping" type
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.PolicyMapping =
    function()
    {
        //PolicyMapping ::= SEQUENCE {
        //    issuerDomainPolicy      CertPolicyId,
        //    subjectDomainPolicy     CertPolicyId }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.OID({ name: (names.issuerDomainPolicy || "") }),
                new in_window.org.pkijs.asn1.OID({ name: (names.subjectDomainPolicy || "") })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "PolicyMappings" type of extension 
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.PolicyMappings =
    function()
    {
        // PolicyMappings OID ::= 2.5.29.33
        //
        //PolicyMappings ::= SEQUENCE SIZE (1..MAX) OF PolicyMapping

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.REPEATED({
                    name: (names.mappings || ""),
                    value: in_window.org.pkijs.schema.x509.PolicyMapping()
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "PolicyConstraints" type of extension 
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.PolicyConstraints =
    function()
    {
        // PolicyMappings OID ::= 2.5.29.36
        //
        //PolicyConstraints ::= SEQUENCE {
        //    requireExplicitPolicy           [0] SkipCerts OPTIONAL,
        //    inhibitPolicyMapping            [1] SkipCerts OPTIONAL }
        //
        //SkipCerts ::= INTEGER (0..MAX)

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    name: (names.requireExplicitPolicy || ""),
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    }
                }), // IMPLICIT integer value
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    name: (names.inhibitPolicyMapping || ""),
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    }
                }) // IMPLICIT integer value
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "ExtKeyUsage" type of extension 
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.ExtKeyUsage =
    function()
    {
        // ExtKeyUsage OID ::= 2.5.29.37
        //
        // ExtKeyUsage ::= SEQUENCE SIZE (1..MAX) OF KeyPurposeId

        // KeyPurposeId ::= OBJECT IDENTIFIER

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.REPEATED({
                    name: (names.keyPurposes || ""),
                    value: new in_window.org.pkijs.asn1.OID()
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "DistributionPoint" type
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.DistributionPoint =
    function()
    {
        //DistributionPoint ::= SEQUENCE {
        //    distributionPoint       [0]     DistributionPointName OPTIONAL,
        //    reasons                 [1]     ReasonFlags OPTIONAL,
        //    cRLIssuer               [2]     GeneralNames OPTIONAL }
        //
        //DistributionPointName ::= CHOICE {
        //    fullName                [0]     GeneralNames,
        //    nameRelativeToCRLIssuer [1]     RelativeDistinguishedName }
        //
        //ReasonFlags ::= BIT STRING {
        //    unused                  (0),
        //    keyCompromise           (1),
        //    cACompromise            (2),
        //    affiliationChanged      (3),
        //    superseded              (4),
        //    cessationOfOperation    (5),
        //    certificateHold         (6),
        //    privilegeWithdrawn      (7),
        //    aACompromise            (8) }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: [
                        new in_window.org.pkijs.asn1.CHOICE({
                            value: [
                                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                                    name: (names.distributionPoint || ""),
                                    optional: true,
                                    id_block: {
                                        tag_class: 3, // CONTEXT-SPECIFIC
                                        tag_number: 0 // [0]
                                    },
                                    value: [
                                        new in_window.org.pkijs.asn1.REPEATED({
                                            name: (names.distributionPoint_names || ""),
                                            value: in_window.org.pkijs.schema.GENERAL_NAME()
                                        })
                                    ]
                                }),
                                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                                    name: (names.distributionPoint || ""),
                                    optional: true,
                                    id_block: {
                                        tag_class: 3, // CONTEXT-SPECIFIC
                                        tag_number: 1 // [1]
                                    },
                                    value: in_window.org.pkijs.schema.RDN().value_block.value
                                })
                            ]
                        })
                    ]
                }),
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    name: (names.reasons || ""),
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    }
                }), // IMPLICIT bitstring value
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    name: (names.cRLIssuer || ""),
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 2 // [2]
                    },
                    value: [
                        new in_window.org.pkijs.asn1.REPEATED({
                            name: (names.cRLIssuer_names || ""),
                            value: in_window.org.pkijs.schema.GENERAL_NAME()
                        })
                    ]
                }) // IMPLICIT bitstring value
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "CRLDistributionPoints" type of extension 
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.CRLDistributionPoints =
    function()
    {
        // CRLDistributionPoints OID ::= 2.5.29.31
        //
        //CRLDistributionPoints ::= SEQUENCE SIZE (1..MAX) OF DistributionPoint

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.REPEATED({
                    name: (names.distributionPoints || ""),
                    value: in_window.org.pkijs.schema.x509.DistributionPoint()
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "AccessDescription" type
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.AccessDescription =
    function()
    {
        //AccessDescription  ::=  SEQUENCE {
        //    accessMethod          OBJECT IDENTIFIER,
        //    accessLocation        GeneralName  }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.OID({ name: (names.accessMethod || "") }),
                in_window.org.pkijs.schema.GENERAL_NAME(names.accessLocation || "")
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "AuthorityInfoAccess" and "SubjectInfoAccess" types of extension 
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.InfoAccess =
    function()
    {
        // AuthorityInfoAccess OID ::= 1.3.6.1.5.5.7.1.1
        // SubjectInfoAccess OID ::= 1.3.6.1.5.5.7.1.11
        //
        //AuthorityInfoAccessSyntax  ::=
        //SEQUENCE SIZE (1..MAX) OF AccessDescription

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.REPEATED({
                    name: (names.accessDescriptions || ""),
                    value: in_window.org.pkijs.schema.x509.AccessDescription()
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "IssuingDistributionPoint" type of extension 
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.IssuingDistributionPoint =
    function()
    {
        // IssuingDistributionPoint OID ::= 2.5.29.28
        //
        //IssuingDistributionPoint ::= SEQUENCE {
        //    distributionPoint          [0] DistributionPointName OPTIONAL,
        //    onlyContainsUserCerts      [1] BOOLEAN DEFAULT FALSE,
        //    onlyContainsCACerts        [2] BOOLEAN DEFAULT FALSE,
        //    onlySomeReasons            [3] ReasonFlags OPTIONAL,
        //    indirectCRL                [4] BOOLEAN DEFAULT FALSE,
        //    onlyContainsAttributeCerts [5] BOOLEAN DEFAULT FALSE }
        //
        //ReasonFlags ::= BIT STRING {
        //    unused                  (0),
        //    keyCompromise           (1),
        //    cACompromise            (2),
        //    affiliationChanged      (3),
        //    superseded              (4),
        //    cessationOfOperation    (5),
        //    certificateHold         (6),
        //    privilegeWithdrawn      (7),
        //    aACompromise            (8) }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: [
                        new in_window.org.pkijs.asn1.CHOICE({
                            value: [
                                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                                    name: (names.distributionPoint || ""),
                                    id_block: {
                                        tag_class: 3, // CONTEXT-SPECIFIC
                                        tag_number: 0 // [0]
                                    },
                                    value: [
                                        new in_window.org.pkijs.asn1.REPEATED({
                                            name: (names.distributionPoint_names || ""),
                                            value: in_window.org.pkijs.schema.GENERAL_NAME()
                                        })
                                    ]
                                }),
                                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                                    name: (names.distributionPoint || ""),
                                    id_block: {
                                        tag_class: 3, // CONTEXT-SPECIFIC
                                        tag_number: 1 // [1]
                                    },
                                    value: in_window.org.pkijs.schema.RDN().value_block.value
                                })
                            ]
                        })
                    ]
                }),
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    name: (names.onlyContainsUserCerts || ""),
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    }
                }), // IMPLICIT boolean value
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    name: (names.onlyContainsCACerts || ""),
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 2 // [2]
                    }
                }), // IMPLICIT boolean value
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    name: (names.onlySomeReasons || ""),
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 3 // [3]
                    }
                }), // IMPLICIT bitstring value
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    name: (names.indirectCRL || ""),
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 4 // [4]
                    }
                }), // IMPLICIT boolean value
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    name: (names.onlyContainsAttributeCerts || ""),
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 5 // [5]
                    }
                }) // IMPLICIT boolean value
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
}
)(typeof exports !== "undefined" ? exports : window);