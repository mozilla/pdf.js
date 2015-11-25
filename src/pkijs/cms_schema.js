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

    // #region "org.pkijs.schema.cms" namespace 
    if(typeof in_window.org.pkijs.schema.cms === "undefined")
        in_window.org.pkijs.schema.cms = {};
    else
    {
        if(typeof in_window.org.pkijs.schema.cms !== "object")
            throw new Error("Name org.pkijs.schema.cms already exists and it's not an object" + " but " + (typeof in_window.org.pkijs.schema.cms));
    }
    // #endregion 

    // #region "org.pkijs.schema.x509" namespace 
    if (typeof in_window.org.pkijs.schema.x509 === "undefined")
        in_window.org.pkijs.schema.x509 = {};
    else
    {
        if (typeof in_window.org.pkijs.schema.x509 !== "object")
            throw new Error("Name org.pkijs.schema.x509 already exists and it's not an object" + " but " + (typeof in_window.org.pkijs.schema.x509));
    }
    // #endregion 

    // #region "local" namespace 
    var local = {};
    // #endregion   
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "ContentInfo" type (RFC5652) 
    //**************************************************************************************
    in_window.org.pkijs.schema.CMS_CONTENT_INFO =
    function()
    {
        //ContentInfo ::= SEQUENCE {
        //    contentType ContentType,
        //    content [0] EXPLICIT ANY DEFINED BY contentType }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || "ContentInfo"),
            value: [
                new in_window.org.pkijs.asn1.OID({ name: (names.contentType || "contentType") }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: [new in_window.org.pkijs.asn1.ANY({ name: (names.content || "content") })] // EXPLICIT ANY value
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema for CMS "CertificateSet" type 
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.OtherCertificateFormat =
    function()
    {
        //OtherCertificateFormat ::= SEQUENCE {
        //    otherCertFormat OBJECT IDENTIFIER,
        //    otherCert ANY DEFINED BY otherCertFormat }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.OID({ name: (names.otherCertFormat || "otherCertFormat") }),
                new in_window.org.pkijs.asn1.ANY({ name: (names.otherCert || "otherCert") })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.CMS_CERTIFICATE_SET =
    function()
    {
        //CertificateSet ::= SET OF CertificateChoices
        //
        //CertificateChoices ::= CHOICE {
        //    certificate Certificate,
        //    extendedCertificate [0] IMPLICIT ExtendedCertificate,  -- Obsolete
        //    v1AttrCert [1] IMPLICIT AttributeCertificateV1,        -- Obsolete
        //    v2AttrCert [2] IMPLICIT AttributeCertificateV2,
        //    other [3] IMPLICIT OtherCertificateFormat }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (
            new in_window.org.pkijs.asn1.SET({
                name: (names.block_name || ""),
                value: [
                    new in_window.org.pkijs.asn1.REPEATED({
                        name: (names.certificates || ""),
                        value: new in_window.org.pkijs.asn1.CHOICE({
                            value: [
                                in_window.org.pkijs.schema.CERT(),
                                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                                    id_block: {
                                        tag_class: 3, // CONTEXT-SPECIFIC
                                        tag_number: 3 // [3]
                                    },
                                    value: [
                                        new in_window.org.pkijs.asn1.OID(),
                                        new in_window.org.pkijs.asn1.ANY()
                                    ]
                                })
                            ]
                        })
                    })
                ]
            })
            ); // __!!!__ Removed definition for "AttributeCertificateV2" __!!!__
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema for CMS "RevocationInfoChoices" type  
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.OtherRevocationInfoFormat =
    function()
    {
        //OtherCertificateFormat ::= SEQUENCE {
        //    otherRevInfoFormat OBJECT IDENTIFIER,
        //    otherRevInfo ANY DEFINED BY otherCertFormat }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.OID({ name: (names.otherRevInfoFormat || "otherRevInfoFormat") }),
                new in_window.org.pkijs.asn1.ANY({ name: (names.otherRevInfo || "otherRevInfo") })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.CSM_REVOCATION_INFO_CHOICES =
    function()
    {
        //RevocationInfoChoices ::= SET OF RevocationInfoChoice

        //RevocationInfoChoice ::= CHOICE {
        //    crl CertificateList,
        //    other [1] IMPLICIT OtherRevocationInfoFormat }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SET({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.REPEATED({
                    name: (names.crls || ""),
                    value: new in_window.org.pkijs.asn1.CHOICE({
                        value: [
                            in_window.org.pkijs.schema.CRL(),
                            new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                                id_block: {
                                    tag_class: 3, // CONTEXT-SPECIFIC
                                    tag_number: 1 // [1]
                                },
                                value: [
                                    new in_window.org.pkijs.asn1.OID(),
                                    new in_window.org.pkijs.asn1.ANY()
                                ]
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
    // #region ASN.1 schema for CMS "IssuerAndSerialNumber" type 
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.IssuerAndSerialNumber =
    function()
    {
        //IssuerAndSerialNumber ::= SEQUENCE {
        //    issuer Name,
        //    serialNumber CertificateSerialNumber }
        //
        //CertificateSerialNumber ::= INTEGER

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                in_window.org.pkijs.schema.RDN(names.issuer || {}),
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.serialNumber || "") })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema for CMS "Attribute" type
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.Attribute =
    function()
    {
        //Attribute ::= SEQUENCE {
        //    attrType OBJECT IDENTIFIER,
        //    attrValues SET OF AttributeValue }

        //AttributeValue ::= ANY

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.OID({ name: (names.attrType || "") }),
                new in_window.org.pkijs.asn1.SET({
                    value: [
                        new in_window.org.pkijs.asn1.REPEATED({
                            name: (names.attrValues || ""),
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
    // #region ASN.1 schema definition for "RSAES-OAEP-params" type (RFC3447)
    //**************************************************************************************
    in_window.org.pkijs.schema.x509.RSAES_OAEP_params =
    function()
    {
        //RSAES-OAEP-params ::= SEQUENCE {
        //    hashAlgorithm     [0] HashAlgorithm    DEFAULT sha1,
        //    maskGenAlgorithm  [1] MaskGenAlgorithm DEFAULT mgf1SHA1,
        //    pSourceAlgorithm  [2] PSourceAlgorithm DEFAULT pSpecifiedEmpty
        //}

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
                    value: [in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.pSourceAlgorithm || {})]
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema for CMS "SignedAttributes" and "UnsignedAttributes" types
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.SignedUnsignedAttributes =
    function(input_args, input_tag_number)
    {
        //    signedAttrs [0] IMPLICIT SignedAttributes OPTIONAL,
        //    unsignedAttrs [1] IMPLICIT UnsignedAttributes OPTIONAL }

        //SignedAttributes ::= SET SIZE (1..MAX) OF Attribute

        //UnsignedAttributes ::= SET SIZE (1..MAX) OF Attribute

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
            name: (names.block_name || ""),
            optional: true,
            id_block: {
                tag_class: 3, // CONTEXT-SPECIFIC
                tag_number: input_tag_number // "SignedAttributes" = 0, "UnsignedAttributes" = 1
            },
            value: [
                new in_window.org.pkijs.asn1.REPEATED({
                    name: (names.attributes || ""),
                    value: in_window.org.pkijs.schema.cms.Attribute()
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for CMS "SignerInfo" type 
    //**************************************************************************************
    in_window.org.pkijs.schema.CMS_SIGNER_INFO =
    function()
    {
        //SignerInfo ::= SEQUENCE {
        //    version CMSVersion,
        //    sid SignerIdentifier,
        //    digestAlgorithm DigestAlgorithmIdentifier,
        //    signedAttrs [0] IMPLICIT SignedAttributes OPTIONAL,
        //    signatureAlgorithm SignatureAlgorithmIdentifier,
        //    signature SignatureValue,
        //    unsignedAttrs [1] IMPLICIT UnsignedAttributes OPTIONAL }
        //
        //SignerIdentifier ::= CHOICE {
        //    issuerAndSerialNumber IssuerAndSerialNumber,
        //    subjectKeyIdentifier [0] SubjectKeyIdentifier }
        //
        //SubjectKeyIdentifier ::= OCTET STRING

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (
            new in_window.org.pkijs.asn1.SEQUENCE({
                name: "SignerInfo",
                value: [
                    new in_window.org.pkijs.asn1.INTEGER({ name: (names.version || "SignerInfo.version") }),
                    new in_window.org.pkijs.asn1.CHOICE({ 
                        value: [
                            in_window.org.pkijs.schema.cms.IssuerAndSerialNumber(names.sid || {
                                names: {
                                    block_name: "SignerInfo.sid"
                                }
                            }),
                            new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                                optional: true,
                                name: (names.sid || "SignerInfo.sid"),
                                id_block: {
                                    tag_class: 3, // CONTEXT-SPECIFIC
                                    tag_number: 0 // [0]
                                },
                                value: [new in_window.org.pkijs.asn1.OCTETSTRING()]
                            })
                        ]
                    }),
                    in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.digestAlgorithm || {
                        names: {
                            block_name: "SignerInfo.digestAlgorithm"
                        }
                    }),
                    in_window.org.pkijs.schema.cms.SignedUnsignedAttributes(names.signedAttrs || {
                        names: {
                            block_name: "SignerInfo.signedAttrs"
                        }
                    }, 0),
                    in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.signatureAlgorithm || {
                        names: {
                            block_name: "SignerInfo.signatureAlgorithm"
                        }
                    }),
                    new in_window.org.pkijs.asn1.OCTETSTRING({ name: (names.signature || "SignerInfo.signature") }),
                    in_window.org.pkijs.schema.cms.SignedUnsignedAttributes(names.unsignedAttrs || {
                        names: {
                            block_name: "SignerInfo.unsignedAttrs"
                        }
                    }, 1)
                ]
            })
            );
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema for CMS "EncapsulatedContentInfo" type
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.EncapsulatedContentInfo =
    function()
    {
        //EncapsulatedContentInfo ::= SEQUENCE {
        //    eContentType ContentType,
        //    eContent [0] EXPLICIT OCTET STRING OPTIONAL } // Changed it to ANY, as in PKCS#7

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.OID({ name: (names.eContentType || "") }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: [
                        new in_window.org.pkijs.asn1.ANY({ name: (names.eContent || "") }) // In order to aling this with PKCS#7 and CMS as well
                    ]
                })
            ]
        }));

        //new in_window.org.pkijs.asn1.OCTETSTRING({ name: (names.eContent || "") })
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "SignedData" type (RFC5652) 
    //**************************************************************************************
    in_window.org.pkijs.schema.CMS_SIGNED_DATA =
    function(names, optional_flag)
    {
        //SignedData ::= SEQUENCE {
        //    version CMSVersion,
        //    digestAlgorithms DigestAlgorithmIdentifiers,
        //    encapContentInfo EncapsulatedContentInfo,
        //    certificates [0] IMPLICIT CertificateSet OPTIONAL,
        //    crls [1] IMPLICIT RevocationInfoChoices OPTIONAL,
        //    signerInfos SignerInfos }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        if(typeof optional_flag === "undefined")
            optional_flag = false;

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || "SignedData"),
            value: [
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.version || "SignedData.version") }),
                new in_window.org.pkijs.asn1.SET({
                    value: [
                        new in_window.org.pkijs.asn1.REPEATED({
                            name: (names.digestAlgorithms || "SignedData.digestAlgorithms"),
                            value: in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER()
                        })
                    ]
                }),
                in_window.org.pkijs.schema.cms.EncapsulatedContentInfo(names.encapContentInfo || {
                    names: {
                        block_name: "SignedData.encapContentInfo"
                    }
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: in_window.org.pkijs.schema.CMS_CERTIFICATE_SET(names.certificates || {
                        names: {
                            certificates: "SignedData.certificates"
                        }
                    }).value_block.value
                }), // IMPLICIT CertificateSet
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    },
                    value: in_window.org.pkijs.schema.CSM_REVOCATION_INFO_CHOICES(names.crls || {
                        names: {
                            crls: "SignedData.crls"
                        }
                    }).value_block.value
                }), // IMPLICIT RevocationInfoChoices
                new in_window.org.pkijs.asn1.SET({
                    value: [
                        new in_window.org.pkijs.asn1.REPEATED({
                            name: (names.signerInfos || "SignedData.signerInfos"),
                            value: in_window.org.pkijs.schema.CMS_SIGNER_INFO()
                        })
                    ]
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema for CMS "ECC-CMS-SharedInfo" type (RFC5753)
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.ECC_CMS_SharedInfo =
    function()
    {
        //ECC-CMS-SharedInfo  ::=  SEQUENCE {
        //    keyInfo      AlgorithmIdentifier,
        //    entityUInfo  [0] EXPLICIT OCTET STRING OPTIONAL,
        //    suppPubInfo  [2] EXPLICIT OCTET STRING }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.keyInfo || {}),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    name: (names.entityUInfo || ""),
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    optional: true,
                    value: [new in_window.org.pkijs.asn1.OCTETSTRING()]
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    name: (names.suppPubInfo || ""),
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 2 // [2]
                    },
                    value: [new in_window.org.pkijs.asn1.OCTETSTRING()]
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema for CMS "PBKDF2-params" type (RFC2898)
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.PBKDF2_params =
    function()
    {
        //PBKDF2-params ::= SEQUENCE {
        //    salt CHOICE {
        //        specified OCTET STRING,
        //        otherSource AlgorithmIdentifier },
        //  iterationCount INTEGER (1..MAX),
        //  keyLength INTEGER (1..MAX) OPTIONAL,
        //  prf AlgorithmIdentifier
        //    DEFAULT { algorithm hMAC-SHA1, parameters NULL } }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.CHOICE({
                    value: [
                        new in_window.org.pkijs.asn1.OCTETSTRING({ name: (names.salt_primitive || "") }),
                        in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.salt_constructed || {})
                    ]
                }),
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.iterationCount || "") }),
                new in_window.org.pkijs.asn1.INTEGER({
                    name: (names.keyLength || ""),
                    optional: true
                }),
                in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.prf || {
                    names: {
                        optional: true
                    }
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "RecipientInfo" type (RFC5652) 
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.RecipientIdentifier =
    function()
    {
        //RecipientIdentifier ::= CHOICE {
        //    issuerAndSerialNumber IssuerAndSerialNumber,
        //    subjectKeyIdentifier [0] SubjectKeyIdentifier }
        //
        //SubjectKeyIdentifier ::= OCTET STRING

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.CHOICE({
            value: [
                in_window.org.pkijs.schema.cms.IssuerAndSerialNumber({
                    names: {
                        block_name: (names.block_name || "")
                    }
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    name: (names.block_name || ""),
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: [new in_window.org.pkijs.asn1.OCTETSTRING()]
                })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.KeyTransRecipientInfo =
    function()
    {
        //KeyTransRecipientInfo ::= SEQUENCE {
        //    version CMSVersion,  -- always set to 0 or 2
        //    rid RecipientIdentifier,
        //    keyEncryptionAlgorithm KeyEncryptionAlgorithmIdentifier,
        //    encryptedKey EncryptedKey }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.version || "") }),
                in_window.org.pkijs.schema.cms.RecipientIdentifier(names.rid || {}),
                in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.keyEncryptionAlgorithm || {}),
                new in_window.org.pkijs.asn1.OCTETSTRING({ name: (names.encryptedKey || "") })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.OriginatorPublicKey =
    function()
    {
        //OriginatorPublicKey ::= SEQUENCE {
        //    algorithm AlgorithmIdentifier,
        //    publicKey BIT STRING }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.algorithm || {}),
                new in_window.org.pkijs.asn1.BITSTRING({ name: (names.publicKey || "") })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.OriginatorIdentifierOrKey =
    function()
    {
        //OriginatorIdentifierOrKey ::= CHOICE {
        //    issuerAndSerialNumber IssuerAndSerialNumber,
        //    subjectKeyIdentifier [0] SubjectKeyIdentifier,
        //    originatorKey [1] OriginatorPublicKey }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.CHOICE({
            value: [
                in_window.org.pkijs.schema.cms.IssuerAndSerialNumber({
                    names: {
                        block_name: (names.block_name || "")
                    }
                }),
                new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    name: (names.block_name || "")
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    },
                    name: (names.block_name || ""),
                    value: in_window.org.pkijs.schema.cms.OriginatorPublicKey().value_block.value
                })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.OtherKeyAttribute =
    function()
    {
        //OtherKeyAttribute ::= SEQUENCE {
        //    keyAttrId OBJECT IDENTIFIER,
        //    keyAttr ANY DEFINED BY keyAttrId OPTIONAL }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            optional: (names.optional || true),
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.OID({ name: (names.keyAttrId || "") }),
                new in_window.org.pkijs.asn1.ANY({
                    optional: true,
                    name: (names.keyAttr || "")
                })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.RecipientKeyIdentifier =
    function()
    {
        //RecipientKeyIdentifier ::= SEQUENCE {
        //    subjectKeyIdentifier SubjectKeyIdentifier,
        //    date GeneralizedTime OPTIONAL,
        //    other OtherKeyAttribute OPTIONAL }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.OCTETSTRING({ name: (names.subjectKeyIdentifier || "") }),
                new in_window.org.pkijs.asn1.GENERALIZEDTIME({
                    optional: true,
                    name: (names.date || "")
                }),
                in_window.org.pkijs.schema.cms.OtherKeyAttribute(names.other || {})
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.KeyAgreeRecipientIdentifier =
    function()
    {
        //KeyAgreeRecipientIdentifier ::= CHOICE {
        //    issuerAndSerialNumber IssuerAndSerialNumber,
        //    rKeyId [0] IMPLICIT RecipientKeyIdentifier }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.CHOICE({
            value: [
                in_window.org.pkijs.schema.cms.IssuerAndSerialNumber(names.issuerAndSerialNumber || {
                    names: {
                        block_name: (names.block_name || "")
                    }
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    name: (names.block_name || ""),
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: in_window.org.pkijs.schema.cms.RecipientKeyIdentifier(names.rKeyId || {
                        names: {
                            block_name: (names.block_name || "")
                        }
                    }).value_block.value
                })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.RecipientEncryptedKey =
    function()
    {
        //RecipientEncryptedKey ::= SEQUENCE {
        //    rid KeyAgreeRecipientIdentifier,
        //    encryptedKey EncryptedKey }
        //
        //EncryptedKey ::= OCTET STRING

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                in_window.org.pkijs.schema.cms.KeyAgreeRecipientIdentifier(names.rid || {}),
                new in_window.org.pkijs.asn1.OCTETSTRING({ name: (names.encryptedKey || "") })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.RecipientEncryptedKeys =
    function()
    {
        //RecipientEncryptedKeys ::= SEQUENCE OF RecipientEncryptedKey

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.REPEATED({
                    name: (names.RecipientEncryptedKeys || ""),
                    value: in_window.org.pkijs.schema.cms.RecipientEncryptedKey()
                })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.KeyAgreeRecipientInfo =
    function()
    {
        //KeyAgreeRecipientInfo ::= SEQUENCE {
        //    version CMSVersion,  -- always set to 3
        //    originator [0] EXPLICIT OriginatorIdentifierOrKey,
        //    ukm [1] EXPLICIT UserKeyingMaterial OPTIONAL,
        //    keyEncryptionAlgorithm KeyEncryptionAlgorithmIdentifier,
        //    recipientEncryptedKeys RecipientEncryptedKeys }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: names.block_name || "",
            value: [
                new in_window.org.pkijs.asn1.INTEGER({ name: names.version || "" }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: [
                        in_window.org.pkijs.schema.cms.OriginatorIdentifierOrKey(names.originator || {})
                    ]
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    },
                    value: [new in_window.org.pkijs.asn1.OCTETSTRING({ name: names.ukm || "" })]
                }),
                in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.keyEncryptionAlgorithm || {}),
                in_window.org.pkijs.schema.cms.RecipientEncryptedKeys(names.recipientEncryptedKeys || {})
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.KEKIdentifier =
    function()
    {
        //KEKIdentifier ::= SEQUENCE {
        //    keyIdentifier OCTET STRING,
        //    date GeneralizedTime OPTIONAL,
        //    other OtherKeyAttribute OPTIONAL }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.OCTETSTRING({ name: (names.keyIdentifier || "") }),
                new in_window.org.pkijs.asn1.GENERALIZEDTIME({
                    optional: true,
                    name: (names.date || "")
                }),
                in_window.org.pkijs.schema.cms.OtherKeyAttribute(names.other || {})
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.KEKRecipientInfo =
    function()
    {
        //KEKRecipientInfo ::= SEQUENCE {
        //    version CMSVersion,  -- always set to 4
        //    kekid KEKIdentifier,
        //    keyEncryptionAlgorithm KeyEncryptionAlgorithmIdentifier,
        //    encryptedKey EncryptedKey }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.version || "") }),
                in_window.org.pkijs.schema.cms.KEKIdentifier(names.kekid || {}),
                in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.keyEncryptionAlgorithm || {}),
                new in_window.org.pkijs.asn1.OCTETSTRING({ name: (names.encryptedKey || "") })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.PasswordRecipientinfo =
    function()
    {
        //PasswordRecipientInfo ::= SEQUENCE {
        //    version CMSVersion,   -- Always set to 0
        //    keyDerivationAlgorithm [0] KeyDerivationAlgorithmIdentifier OPTIONAL,
        //    keyEncryptionAlgorithm KeyEncryptionAlgorithmIdentifier,
        //    encryptedKey EncryptedKey }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.version || "") }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    name: (names.keyDerivationAlgorithm || ""),
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER().value_block.value
                }),
                in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.keyEncryptionAlgorithm || {}),
                new in_window.org.pkijs.asn1.OCTETSTRING({ name: (names.encryptedKey || "") })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.OtherRecipientInfo =
    function()
    {
        //OtherRecipientInfo ::= SEQUENCE {
        //    oriType OBJECT IDENTIFIER,
        //    oriValue ANY DEFINED BY oriType }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.OID({ name: (names.oriType || "") }),
                new in_window.org.pkijs.asn1.ANY({ name: (names.oriValue || "") })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.CMS_RECIPIENT_INFO =
    function()
    {
        //RecipientInfo ::= CHOICE {
        //    ktri KeyTransRecipientInfo,
        //    kari [1] KeyAgreeRecipientInfo,
        //    kekri [2] KEKRecipientInfo,
        //    pwri [3] PasswordRecipientinfo,
        //    ori [4] OtherRecipientInfo }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.CHOICE({
            value: [
                in_window.org.pkijs.schema.cms.KeyTransRecipientInfo({
                    names: {
                        block_name: (names.block_name || "")
                    }
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    name: (names.block_name || ""),
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    },
                    value: in_window.org.pkijs.schema.cms.KeyAgreeRecipientInfo().value_block.value
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    name: (names.block_name || ""),
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 2 // [2]
                    },
                    value: in_window.org.pkijs.schema.cms.KEKRecipientInfo().value_block.value
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    name: (names.block_name || ""),
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 3 // [3]
                    },
                    value: in_window.org.pkijs.schema.cms.PasswordRecipientinfo().value_block.value
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    name: (names.block_name || ""),
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 4 // [4]
                    },
                    value: in_window.org.pkijs.schema.cms.OtherRecipientInfo().value_block.value
                })
            ]
        }));
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region ASN.1 schema definition for "EnvelopedData" type (RFC5652) 
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.OriginatorInfo =
    function()
    {
        //OriginatorInfo ::= SEQUENCE {
        //    certs [0] IMPLICIT CertificateSet OPTIONAL,
        //    crls [1] IMPLICIT RevocationInfoChoices OPTIONAL }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    name: (names.certs || ""),
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: in_window.org.pkijs.schema.CMS_CERTIFICATE_SET().value_block.value
                }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    name: (names.crls || ""),
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    },
                    value: in_window.org.pkijs.schema.CSM_REVOCATION_INFO_CHOICES().value_block.value
                })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.cms.EncryptedContentInfo =
    function()
    {
        //EncryptedContentInfo ::= SEQUENCE {
        //    contentType ContentType,
        //    contentEncryptionAlgorithm ContentEncryptionAlgorithmIdentifier,
        //    encryptedContent [0] IMPLICIT EncryptedContent OPTIONAL }
        //
        // Comment: Strange, but modern crypto engines create "encryptedContent" as "[0] EXPLICIT EncryptedContent"
        //
        //EncryptedContent ::= OCTET STRING

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.OID({ name: (names.contentType || "") }),
                in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER(names.contentEncryptionAlgorithm || {}),
                // The CHOICE we need because "EncryptedContent" could have either "constructive"
                // or "primitive" form of encoding and we need to handle both variants
                new in_window.org.pkijs.asn1.CHOICE({
                    value: [
                        new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                            name: (names.encryptedContent || ""),
                            id_block: {
                                tag_class: 3, // CONTEXT-SPECIFIC
                                tag_number: 0 // [0]
                            },
                            value: [
                                new in_window.org.pkijs.asn1.REPEATED({
                                    value: new in_window.org.pkijs.asn1.OCTETSTRING()
                                })
                            ]
                        }),
                        new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                            name: (names.encryptedContent || ""),
                            id_block: {
                                tag_class: 3, // CONTEXT-SPECIFIC
                                tag_number: 0 // [0]
                            }
                        })
                    ]
                })
            ]
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.schema.CMS_ENVELOPED_DATA =
    function()
    {
        //EnvelopedData ::= SEQUENCE {
        //    version CMSVersion,
        //    originatorInfo [0] IMPLICIT OriginatorInfo OPTIONAL,
        //    recipientInfos RecipientInfos,
        //    encryptedContentInfo EncryptedContentInfo,
        //    unprotectedAttrs [1] IMPLICIT UnprotectedAttributes OPTIONAL }

        var names = in_window.org.pkijs.getNames(arguments[0]);

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            name: (names.block_name || ""),
            value: [
                new in_window.org.pkijs.asn1.INTEGER({ name: (names.version || "") }),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    name: (names.originatorInfo || ""),
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: in_window.org.pkijs.schema.cms.OriginatorInfo().value_block.value
                }),
                new in_window.org.pkijs.asn1.SET({
                    value: [
                        new in_window.org.pkijs.asn1.REPEATED({
                            name: (names.recipientInfos || ""),
                            value: in_window.org.pkijs.schema.CMS_RECIPIENT_INFO()
                        })
                    ]
                }),
                in_window.org.pkijs.schema.cms.EncryptedContentInfo(names.encryptedContentInfo || {}),
                new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    optional: true,
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    },
                    value: [
                        new in_window.org.pkijs.asn1.REPEATED({
                            name: (names.unprotectedAttrs || ""),
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
}
)(typeof exports !== "undefined" ? exports : window);