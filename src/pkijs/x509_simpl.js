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

    // #region "org.pkijs.simpl" namespace 
    if(typeof in_window.org.pkijs.simpl === "undefined")
        in_window.org.pkijs.simpl = {};
    else
    {
        if(typeof in_window.org.pkijs.simpl !== "object")
            throw new Error("Name org.pkijs.simpl already exists and it's not an object" + " but " + (typeof in_window.org.pkijs.simpl));
    }
    // #endregion 

    // #region "org.pkijs.simpl.x509" namespace 
    if(typeof in_window.org.pkijs.simpl.x509 === "undefined")
        in_window.org.pkijs.simpl.x509 = {};
    else
    {
        if(typeof in_window.org.pkijs.simpl.x509 !== "object")
            throw new Error("Name org.pkijs.simpl.x509 already exists and it's not an object" + " but " + (typeof in_window.org.pkijs.simpl.x509));
    }
    // #endregion 

    // #region "local" namespace 
    var local = {};
    // #endregion   
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "Time" type
    //**************************************************************************************
    in_window.org.pkijs.simpl.TIME =
    function()
    {
        // #region Internal properties of the object 
        this.type = 0; // 0 - UTCTime; 1 - GeneralizedTime; 2 - empty value
        this.value = new Date(0, 0, 0);
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.TIME.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.type = (arguments[0].type || 0);
                this.value = (arguments[0].value || (new Date(0, 0, 0)));
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.TIME.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.TIME({
                names: {
                    utcTimeName: "utcTimeName",
                    generalTimeName: "generalTimeName"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for TIME");
        // #endregion 

        // #region Get internal properties from parsed schema 
        if("utcTimeName" in asn1.result)
        {
            this.type = 0;
            this.value = asn1.result.utcTimeName.toDate();
        }
        if("generalTimeName" in asn1.result)
        {
            this.type = 1;
            this.value = asn1.result.generalTimeName.toDate();
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.TIME.prototype.toSchema =
    function()
    {
        // #region Construct and return new ASN.1 schema for this object 
        var result = {};

        if(this.type === 0)
            result = new in_window.org.pkijs.asn1.UTCTIME({ value_date: this.value });
        if(this.type === 1)
            result = new in_window.org.pkijs.asn1.GENERALIZEDTIME({ value_date: this.value });

        return result;
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.TIME.prototype.toJSON =
    function()
    {
        return {
            type: this.type,
            value: this.value
        };
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "GeneralName" type 
    //**************************************************************************************
    in_window.org.pkijs.simpl.GENERAL_NAME =
    function()
    {
        // #region Internal properties of the object 
        this.NameType = 9; // Name type - from a tagged value (0 for "otherName", 1 for "rfc822Name" etc.)
        this.Name = {};
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.GENERAL_NAME.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.NameType = arguments[0].NameType || 9;
                this.Name = arguments[0].Name || {};
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.GENERAL_NAME.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.GENERAL_NAME({
                names: {
                    block_name: "block_name",
                    otherName: "otherName",
                    rfc822Name: "rfc822Name",
                    dNSName: "dNSName",
                    x400Address: "x400Address",
                    directoryName: {
                            names: {
                                block_name: "directoryName"
                            }
                        },
                    ediPartyName: "ediPartyName",
                    uniformResourceIdentifier: "uniformResourceIdentifier",
                    iPAddress: "iPAddress",
                    registeredID: "registeredID"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for GENERAL_NAME");
        // #endregion 

        // #region Get internal properties from parsed schema
        this.NameType = asn1.result["block_name"].id_block.tag_number;

        switch(this.NameType)
        {
            case 0: // otherName
                this.Name = asn1.result["block_name"];
                break;
            case 1: // rfc822Name + dNSName + uniformResourceIdentifier
            case 2:
            case 6:
                {
                    var value = asn1.result["block_name"];

                    value.id_block.tag_class = 1; // UNIVERSAL
                    value.id_block.tag_number = 22; // IA5STRING

                    var value_ber = value.toBER(false);

                    this.Name = in_window.org.pkijs.fromBER(value_ber).result.value_block.value;
                }
                break;
            case 3: // x400Address
                this.Name = asn1.result["block_name"];
                break;
            case 4: // directoryName
                this.Name = new in_window.org.pkijs.simpl.RDN({ schema: asn1.result["directoryName"] });
                break;
            case 5: // ediPartyName
                this.Name = asn1.result["ediPartyName"];
                break;
            case 7: // iPAddress
                this.Name = new in_window.org.pkijs.asn1.OCTETSTRING({ value_hex: asn1.result["block_name"].value_block.value_hex });
                break;
            case 8: // registeredID
                {
                    var value = asn1.result["block_name"];

                    value.id_block.tag_class = 1; // UNIVERSAL
                    value.id_block.tag_number = 6; // OID

                    var value_ber = value.toBER(false);

                    this.Name = in_window.org.pkijs.fromBER(value_ber).result.value_block.toString(); // Getting a string representation of the OID
                }
                break;
            default:;
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.GENERAL_NAME.prototype.toSchema =
    function(schema)
    {
        // #region Construct and return new ASN.1 schema for this object
        switch(this.NameType)
        {
            case 0:
            case 3:
            case 5:
                return new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: this.NameType
                    },
                    value: [
                        this.Name
                    ]
                });

                break;
            case 1:
            case 2:
            case 6:
                {
                    var value = new in_window.org.pkijs.asn1.IA5STRING({ value: this.Name });

                    value.id_block.tag_class = 3;
                    value.id_block.tag_number = this.NameType;

                    return value;
                }
                break;
            case 4:
                return new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 4
                    },
                    value: [this.Name.toSchema()]
                });
                break;
            case 7:
                {
                    var value = this.Name;

                    value.id_block.tag_class = 3;
                    value.id_block.tag_number = this.NameType;

                    return value;
                }
                break;
            case 8:
                {
                    var value = new in_window.org.pkijs.asn1.OID({ value: this.Name });

                    value.id_block.tag_class = 3;
                    value.id_block.tag_number = this.NameType;

                    return value;
                }
                break;
            default:
                return in_window.org.pkijs.schema.GENERAL_NAME();
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.GENERAL_NAME.prototype.toJSON =
    function()
    {
        var _object = {
            NameType: this.NameType
        };

        if((typeof this.Name) === "string")
            _object.Name = this.Name;
        else
            _object.Name = this.Name.toJSON();

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "GeneralNames" type 
    //**************************************************************************************
    in_window.org.pkijs.simpl.GENERAL_NAMES =
    function()
    {
        // #region Internal properties of the object 
        this.names = new Array(); // Array of "org.pkijs.simpl.GENERAL_NAME"
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.GENERAL_NAMES.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.names = arguments[0].names || new Array(); // Array of "org.pkijs.simpl.GENERAL_NAME"
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.GENERAL_NAMES.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            new in_window.org.pkijs.asn1.SEQUENCE({
                value: [
                    new in_window.org.pkijs.asn1.REPEATED({
                        name: "names",
                        value: in_window.org.pkijs.schema.GENERAL_NAME()
                    })
                ]
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for GENERAL_NAMES");
        // #endregion 

        // #region Get internal properties from parsed schema
        var n = asn1.result["names"];

        for(var i = 0; i < n.length; i++)
            this.names.push(new in_window.org.pkijs.simpl.GENERAL_NAME({ schema: n[i] }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.GENERAL_NAMES.prototype.toSchema =
    function(schema)
    {
        // #region Construct and return new ASN.1 schema for this object
        var output_array = new Array();

        for(var i = 0; i < this.names.length; i++)
            output_array.push(this.names[i].toSchema());

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.GENERAL_NAMES.prototype.toJSON =
    function()
    {
        var _names = new Array();

        for(var i = 0; i < this.names.length; i++)
            _names.push(this.names[i].toJSON());

        return {
            names: _names
        };
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "AlgorithmIdentifier" type 
    //**************************************************************************************
    in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER =
    function()
    {
        // #region Internal properties of the object 
        this.algorithm_id = "";
        // OPTIONAL this.algorithm_params = new in_window.org.pkijs.asn1.NULL();
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.algorithm_id = arguments[0].algorithm_id || "";
                if("algorithm_params" in arguments[0])
                    this.algorithm_params = arguments[0].algorithm_params;
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.ALGORITHM_IDENTIFIER({ 
                names: {
                    algorithmIdentifier: "algorithm",
                    algorithmParams: "params"
                }
                })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for ALGORITHM_IDENTIFIER");
        // #endregion 

        // #region Get internal properties from parsed schema 
        this.algorithm_id = asn1.result.algorithm.value_block.toString();
        if("params" in asn1.result)
            this.algorithm_params = asn1.result.params;
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER.prototype.toSchema =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        output_array.push(new in_window.org.pkijs.asn1.OID({ value: this.algorithm_id }));
        if("algorithm_params" in this)
            output_array.push(this.algorithm_params);
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER.prototype.getCommonName =
    function()
    {
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER.prototype.toJSON =
    function()
    {
        var _object = {
            algorithm_id: this.algorithm_id
        };

        if("algorithm_params" in this)
            _object.algorithm_params = this.algorithm_params.toJSON();

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "RSAPublicKey" type (RFC3447)
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.RSAPublicKey =
    function()
    {
        // #region Internal properties of the object 
        this.modulus = new in_window.org.pkijs.asn1.INTEGER();
        this.publicExponent = new in_window.org.pkijs.asn1.INTEGER();
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.RSAPublicKey.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.modulus = arguments[0].modulus || new in_window.org.pkijs.asn1.INTEGER();
                this.publicExponent = arguments[0].publicExponent || new in_window.org.pkijs.asn1.INTEGER();
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.RSAPublicKey.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.RSAPublicKey({
                names: {
                    modulus: "modulus",
                    publicExponent: "publicExponent"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for RSAPublicKey");
        // #endregion 

        // #region Get internal properties from parsed schema 
        this.modulus = asn1.result["modulus"];
        this.publicExponent = asn1.result["publicExponent"];
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.RSAPublicKey.prototype.toSchema =
    function()
    {
        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: [
                this.modulus,
                this.publicExponent
            ]
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.RSAPublicKey.prototype.toJSON =
    function()
    {
        return {
            modulus: this.modulus.toJSON(),
            publicExponent: this.publicExponent.toJSON()
        };
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "OtherPrimeInfo" type (RFC3447)
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.OtherPrimeInfo =
    function()
    {
        // #region Internal properties of the object 
        this.prime = new in_window.org.pkijs.asn1.INTEGER();
        this.exponent = new in_window.org.pkijs.asn1.INTEGER();
        this.coefficient = new in_window.org.pkijs.asn1.INTEGER();
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.OtherPrimeInfo.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.prime = arguments[0].prime || new in_window.org.pkijs.asn1.INTEGER();
                this.exponent = arguments[0].exponent || new in_window.org.pkijs.asn1.INTEGER();
                this.coefficient = arguments[0].coefficient || new in_window.org.pkijs.asn1.INTEGER();
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.OtherPrimeInfo.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.OtherPrimeInfo({
                names: {
                    prime: "prime",
                    exponent: "exponent",
                    coefficient: "coefficient"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for OtherPrimeInfo");
        // #endregion 

        // #region Get internal properties from parsed schema 
        this.prime = asn1.result["prime"];
        this.exponent = asn1.result["exponent"];
        this.coefficient = asn1.result["coefficient"];
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.OtherPrimeInfo.prototype.toSchema =
    function()
    {
        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: [
                this.prime,
                this.exponent,
                this.coefficient
            ]
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.OtherPrimeInfo.prototype.toJSON =
    function()
    {
        return {
            prime: this.prime.toJSON(),
            exponent: this.exponent.toJSON(),
            coefficient: this.coefficient.toJSON()
        };
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "RSAPrivateKey" type (RFC3447)
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.RSAPrivateKey =
    function()
    {
        // #region Internal properties of the object 
        this.version = 0;
        this.modulus = new in_window.org.pkijs.asn1.INTEGER();
        this.publicExponent = new in_window.org.pkijs.asn1.INTEGER();
        this.privateExponent = new in_window.org.pkijs.asn1.INTEGER();
        this.prime1 = new in_window.org.pkijs.asn1.INTEGER();
        this.prime2 = new in_window.org.pkijs.asn1.INTEGER();
        this.exponent1 = new in_window.org.pkijs.asn1.INTEGER();
        this.exponent2 = new in_window.org.pkijs.asn1.INTEGER();
        this.coefficient = new in_window.org.pkijs.asn1.INTEGER();
        // OPTIONAL this.otherPrimeInfos = new Array(); // Array of "OtherPrimeInfo"
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.RSAPrivateKey.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.version = arguments[0].version || 0;
                this.modulus = arguments[0].modulus || new in_window.org.pkijs.asn1.INTEGER();
                this.publicExponent = arguments[0].publicExponent || new in_window.org.pkijs.asn1.INTEGER();
                this.privateExponent = arguments[0].privateExponent || new in_window.org.pkijs.asn1.INTEGER();
                this.prime1 = arguments[0].prime1 || new in_window.org.pkijs.asn1.INTEGER();
                this.prime2 = arguments[0].prime2 || new in_window.org.pkijs.asn1.INTEGER();
                this.exponent1 = arguments[0].exponent1 || new in_window.org.pkijs.asn1.INTEGER();
                this.exponent2 = arguments[0].exponent2 || new in_window.org.pkijs.asn1.INTEGER();
                this.coefficient = arguments[0].coefficient || new in_window.org.pkijs.asn1.INTEGER();
                if("otherPrimeInfos" in arguments[0])
                    this.otherPrimeInfos = arguments[0].otherPrimeInfos || new Array();
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.RSAPrivateKey.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.RSAPrivateKey({
                names: {
                    version: "version",
                    modulus: "modulus",
                    publicExponent: "publicExponent",
                    privateExponent: "privateExponent",
                    prime1: "prime1",
                    prime2: "prime2",
                    exponent1: "exponent1",
                    exponent2: "exponent2",
                    coefficient: "coefficient",
                    otherPrimeInfos: "otherPrimeInfos"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for RSAPrivateKey");
        // #endregion 

        // #region Get internal properties from parsed schema 
        this.version = asn1.result["version"].value_block.value_dec;
        this.modulus = asn1.result["modulus"];
        this.publicExponent = asn1.result["publicExponent"];
        this.privateExponent = asn1.result["privateExponent"];
        this.prime1 = asn1.result["prime1"];
        this.prime2 = asn1.result["prime2"];
        this.exponent1 = asn1.result["exponent1"];
        this.exponent2 = asn1.result["exponent2"];
        this.coefficient = asn1.result["coefficient"];

        if("otherPrimeInfos" in asn1.result)
        {
            var otherPrimeInfos_array = asn1.result["otherPrimeInfos"];

            for(var i = 0; i < otherPrimeInfos_array.length; i++)
                this.otherPrimeInfos.push(new in_window.org.pkijs.simpl.x509.OtherPrimeInfo({ schema: otherPrimeInfos_array[i] }));
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.RSAPrivateKey.prototype.toSchema =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        output_array.push(new in_window.org.pkijs.asn1.INTEGER({ value: this.version }));
        output_array.push(this.modulus);
        output_array.push(this.publicExponent);
        output_array.push(this.privateExponent);
        output_array.push(this.prime1);
        output_array.push(this.prime2);
        output_array.push(this.exponent1);
        output_array.push(this.exponent2);
        output_array.push(this.coefficient);

        if("otherPrimeInfos" in this)
        {
            var otherPrimeInfos_array = new Array();

            for(var i = 0; i < this.otherPrimeInfos.length; i++)
                otherPrimeInfos_array.push(this.otherPrimeInfos[i].toSchema());

            output_array.push(new in_window.org.pkijs.asn1.SEQUENCE({ value: otherPrimeInfos_array }));
        }
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.RSAPrivateKey.prototype.toJSON =
    function()
    {
        var _object = {
            version: this.version,
            modulus: this.modulus.toJSON(),
            publicExponent: this.publicExponent.toJSON(),
            privateExponent: this.privateExponent.toJSON(),
            prime1: this.prime1.toJSON(),
            prime2: this.prime2.toJSON(),
            exponent1: this.exponent1.toJSON(),
            exponent2: this.exponent2.toJSON(),
            coefficient: this.coefficient.toJSON(),
        };

        if("otherPrimeInfos" in this)
        {
            _object.otherPrimeInfos = new Array();

            for(var i = 0; i < this.otherPrimeInfos.length; i++)
                _object.otherPrimeInfos.push(this.otherPrimeInfos[i].toJSON());
        }

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "RSASSA_PSS_params" type (RFC3447)
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.RSASSA_PSS_params =
    function()
    {
        // #region Internal properties of the object 
        // OPTIONAL this.hashAlgorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER();
        // OPTIONAL this.maskGenAlgorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER();
        // OPTIONAL this.saltLength = 20; // new in_window.org.pkijs.asn1.INTEGER();
        // OPTIONAL this.trailerField = 1; // new in_window.org.pkijs.asn1.INTEGER();
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.RSASSA_PSS_params.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                if("hashAlgorithm" in arguments[0])
                    this.hashAlgorithm = arguments[0].hashAlgorithm;

                if("maskGenAlgorithm" in arguments[0])
                    this.maskGenAlgorithm = arguments[0].maskGenAlgorithm;

                if("saltLength" in arguments[0])
                    this.saltLength = arguments[0].saltLength;

                if("trailerField" in arguments[0])
                    this.trailerField = arguments[0].trailerField;
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.RSASSA_PSS_params.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.RSASSA_PSS_params({
                names: {
                    hashAlgorithm: {
                        names: {
                            block_name: "hashAlgorithm"
                        }
                    },
                    maskGenAlgorithm: {
                        names: {
                            block_name: "maskGenAlgorithm"
                        }
                    },
                    saltLength: "saltLength",
                    trailerField: "trailerField"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for RSASSA_PSS_params");
        // #endregion 

        // #region Get internal properties from parsed schema 
        if("hashAlgorithm" in asn1.result)
            this.hashAlgorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER({ schema: asn1.result["hashAlgorithm"] });

        if("maskGenAlgorithm" in asn1.result)
            this.maskGenAlgorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER({ schema: asn1.result["maskGenAlgorithm"] });

        if("saltLength" in asn1.result)
            this.saltLength = asn1.result["saltLength"].value_block.value_dec;

        if("trailerField" in asn1.result)
            this.trailerField = asn1.result["trailerField"].value_block.value_dec;
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.RSASSA_PSS_params.prototype.toSchema =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        if("hashAlgorithm" in this)
            output_array.push(new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 0 // [0]
                },
                value: [this.hashAlgorithm.toSchema()]
            }));

        if("maskGenAlgorithm" in this)
            output_array.push(new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 1 // [1]
                },
                value: [this.maskGenAlgorithm.toSchema()]
            }));

        if("saltLength" in this)
            output_array.push(new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 2 // [2]
                },
                value: [new in_window.org.pkijs.asn1.INTEGER({ value: this.saltLength })]
            }));

        if("trailerField" in this)
            output_array.push(new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 3 // [3]
                },
                value: [new in_window.org.pkijs.asn1.INTEGER({ value: this.trailerField })]
            }));
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.RSASSA_PSS_params.prototype.toJSON =
    function()
    {
        var _object = {};

        if("hashAlgorithm" in this)
            _object.hashAlgorithm = this.hashAlgorithm.toJSON();

        if("maskGenAlgorithm" in this)
            _object.maskGenAlgorithm = this.maskGenAlgorithm.toJSON();

        if("saltLength" in this)
            _object.saltLength = this.saltLength.toJSON();

        if("trailerField" in this)
            _object.trailerField = this.trailerField.toJSON();

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "SubjectPublicKeyInfo" type 
    //**************************************************************************************
    in_window.org.pkijs.simpl.PUBLIC_KEY_INFO =
    function()
    {
        // #region Internal properties of the object 
        this.algorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER();
        this.subjectPublicKey = new in_window.org.pkijs.asn1.BITSTRING();
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.PUBLIC_KEY_INFO.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.algorithm = (arguments[0].algorithm || (new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER()));
                this.subjectPublicKey = (arguments[0].subjectPublicKey || (new in_window.org.pkijs.asn1.BITSTRING()));
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.PUBLIC_KEY_INFO.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.PUBLIC_KEY_INFO({
                names: {
                    algorithm: {
                        names: {
                            block_name: "algorithm"
                        }
                    },
                    subjectPublicKey: "subjectPublicKey"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for PUBLIC_KEY_INFO");
        // #endregion 

        // #region Get internal properties from parsed schema 
        this.algorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER({ schema: asn1.result.algorithm });
        this.subjectPublicKey = asn1.result.subjectPublicKey;
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.PUBLIC_KEY_INFO.prototype.toSchema =
    function()
    {
        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: [
                this.algorithm.toSchema(),
                this.subjectPublicKey
            ]
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.PUBLIC_KEY_INFO.prototype.importKey =
    function(publicKey)
    {
        /// <param name="publicKey" type="Key">Public key to work with</param>

        // #region Initial variables 
        var sequence = Promise.resolve();
        var _this = this;
        // #endregion   

        // #region Initial check 
        if(typeof publicKey === "undefined")
            return new Promise(function(resolve, reject) { reject("Need to provide publicKey input parameter"); });
        // #endregion 

        // #region Get a "crypto" extension 
        var crypto = in_window.org.pkijs.getCrypto();
        if(typeof crypto == "undefined")
            return new Promise(function(resolve, reject) { reject("Unable to create WebCrypto object"); });
        // #endregion 

        // #region Export public key 
        sequence = sequence.then(
            function()
            {
                return crypto.exportKey("spki", publicKey);
            }
            );
        // #endregion 

        // #region Initialize internal variables by parsing exported value
        sequence = sequence.then(
            function(exportedKey)
            {
                var asn1 = in_window.org.pkijs.fromBER(exportedKey);
                try
                {
                    in_window.org.pkijs.simpl.PUBLIC_KEY_INFO.prototype.fromSchema.call(_this, asn1.result);
                }
                catch(exception)
                {
                    return new Promise(function(resolve, reject) { reject("Error during initializing object from schema"); });
                }
            },
            function(error)
            {
                return new Promise(function(resolve, reject) { reject("Error during exporting public key: " + error); });
            }
            );
        // #endregion 

        return sequence;
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.PUBLIC_KEY_INFO.prototype.toJSON =
    function()
    {
        return {
            algorithm: this.algorithm.toJSON(),
            subjectPublicKey: this.subjectPublicKey.toJSON()
        };
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "AttributeTypeAndValue" type (part of RelativeDistinguishedName)
    //**************************************************************************************
    in_window.org.pkijs.simpl.ATTR_TYPE_AND_VALUE =
    function()
    {
        // #region Internal properties of the object 
        this.type = "";
        this.value = {}; // ANY -- DEFINED BY AttributeType
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.ATTR_TYPE_AND_VALUE.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.type = (arguments[0].type || "");
                this.value = (arguments[0].value || {});
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.ATTR_TYPE_AND_VALUE.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.ATTR_TYPE_AND_VALUE({
                names: {
                    type: "type",
                    value: "typeValue"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for ATTR_TYPE_AND_VALUE");
        // #endregion 

        // #region Get internal properties from parsed schema 
        this.type = asn1.result.type.value_block.toString();
        this.value = asn1.result.typeValue;
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.ATTR_TYPE_AND_VALUE.prototype.toSchema =
    function()
    {
        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: [
                new in_window.org.pkijs.asn1.OID({ value: this.type }),
                this.value
            ]
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.ATTR_TYPE_AND_VALUE.prototype.isEqual =
    function()
    {
        if(arguments[0] instanceof in_window.org.pkijs.simpl.ATTR_TYPE_AND_VALUE)
        {
            if(this.type !== arguments[0].type)
                return false;

            if(((this.value instanceof in_window.org.pkijs.asn1.UTF8STRING) && (arguments[0].value instanceof in_window.org.pkijs.asn1.UTF8STRING)) ||
               ((this.value instanceof in_window.org.pkijs.asn1.BMPSTRING) && (arguments[0].value instanceof in_window.org.pkijs.asn1.BMPSTRING)) ||
               ((this.value instanceof in_window.org.pkijs.asn1.UNIVERSALSTRING) && (arguments[0].value instanceof in_window.org.pkijs.asn1.UNIVERSALSTRING)) ||
               ((this.value instanceof in_window.org.pkijs.asn1.NUMERICSTRING) && (arguments[0].value instanceof in_window.org.pkijs.asn1.NUMERICSTRING)) ||
               ((this.value instanceof in_window.org.pkijs.asn1.PRINTABLESTRING) && (arguments[0].value instanceof in_window.org.pkijs.asn1.PRINTABLESTRING)) ||
               ((this.value instanceof in_window.org.pkijs.asn1.TELETEXSTRING) && (arguments[0].value instanceof in_window.org.pkijs.asn1.TELETEXSTRING)) ||
               ((this.value instanceof in_window.org.pkijs.asn1.VIDEOTEXSTRING) && (arguments[0].value instanceof in_window.org.pkijs.asn1.VIDEOTEXSTRING)) ||
               ((this.value instanceof in_window.org.pkijs.asn1.IA5STRING) && (arguments[0].value instanceof in_window.org.pkijs.asn1.IA5STRING)) ||
               ((this.value instanceof in_window.org.pkijs.asn1.GRAPHICSTRING) && (arguments[0].value instanceof in_window.org.pkijs.asn1.GRAPHICSTRING)) ||
               ((this.value instanceof in_window.org.pkijs.asn1.VISIBLESTRING) && (arguments[0].value instanceof in_window.org.pkijs.asn1.VISIBLESTRING)) ||
               ((this.value instanceof in_window.org.pkijs.asn1.GENERALSTRING) && (arguments[0].value instanceof in_window.org.pkijs.asn1.GENERALSTRING)) ||
               ((this.value instanceof in_window.org.pkijs.asn1.CHARACTERSTRING) && (arguments[0].value instanceof in_window.org.pkijs.asn1.CHARACTERSTRING)))
            {
                var value1 = in_window.org.pkijs.stringPrep(this.value.value_block.value);
                var value2 = in_window.org.pkijs.stringPrep(arguments[0].value.value_block.value);

                if(value1.localeCompare(value2) !== 0)
                    return false;
            }
            else // Comparing as two ArrayBuffers
            {
                if(in_window.org.pkijs.isEqual_buffer(this.value.value_before_decode, arguments[0].value.value_before_decode) === false)
                    return false;
            }

            return true;
        }
        else
            return false;
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.ATTR_TYPE_AND_VALUE.prototype.toJSON =
    function()
    {
        var _object = {
            type: this.type
        };

        if(Object.keys(this.value).length !== 0)
            _object.value = this.value.toJSON();
        else
            _object.value = this.value;

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "RelativeDistinguishedName" type
    //**************************************************************************************
    in_window.org.pkijs.simpl.RDN =
    function()
    {
        // #region Internal properties of the object 
        /// <field name="types_and_values" type="Array" elementType="in_window.org.pkijs.simpl.ATTR_TYPE_AND_VALUE">Array of "type and value" objects</field>
        this.types_and_values = new Array();
        /// <field name="value_before_decode" type="ArrayBuffer">Value of the RDN before decoding from schema</field>
        this.value_before_decode = new ArrayBuffer(0);
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.RDN.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.types_and_values = (arguments[0].types_and_values || (new Array()));
                this.value_before_decode = arguments[0].value_before_decode || new ArrayBuffer(0);
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.RDN.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.RDN({
                names: {
                    block_name: "RDN",
                    repeated_set: "types_and_values"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for RDN");
        // #endregion 

        // #region Get internal properties from parsed schema 
        if("types_and_values" in asn1.result) // Could be a case when there is no "types and values"
        {
            var types_and_values_array = asn1.result.types_and_values;
            for(var i = 0; i < types_and_values_array.length; i++)
                this.types_and_values.push(new in_window.org.pkijs.simpl.ATTR_TYPE_AND_VALUE({ schema: types_and_values_array[i] }));
        }

        this.value_before_decode = asn1.result.RDN.value_before_decode;
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.RDN.prototype.toSchema =
    function()
    {
        // #region Decode stored TBS value 
        if(this.value_before_decode.byteLength === 0) // No stored encoded array, create "from scratch"
        {
            // #region Create array for output set 
            var output_array = new Array();

            for(var i = 0; i < this.types_and_values.length; i++)
                output_array.push(this.types_and_values[i].toSchema());
            // #endregion 

            return (new in_window.org.pkijs.asn1.SEQUENCE({
                value: [new in_window.org.pkijs.asn1.SET({ value: output_array })]
            }));
        }

        var asn1 = in_window.org.pkijs.fromBER(this.value_before_decode);
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return asn1.result;
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.RDN.prototype.isEqual =
    function()
    {
        if(arguments[0] instanceof in_window.org.pkijs.simpl.RDN)
        {
            if(this.types_and_values.length != arguments[0].types_and_values.length)
                return false;

            for(var i = 0; i < this.types_and_values.length; i++)
            {
                if(this.types_and_values[i].isEqual(arguments[0].types_and_values[i]) === false)
                    return false;
            }

            return true;
        }
        else
        {
            if(arguments[0] instanceof ArrayBuffer)
                return in_window.org.pkijs.isEqual_buffer(this.value_before_decode, arguments[0]);
            else
                return false;
        }

        return false;
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.RDN.prototype.toJSON =
    function()
    {
        var _object = {
            types_and_values: new Array()
        };

        for(var i = 0; i < this.types_and_values.length; i++)
            _object.types_and_values.push(this.types_and_values[i].toJSON());

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "AuthorityKeyIdentifier" type of extension
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.AuthorityKeyIdentifier =
    function()
    {
        // #region Internal properties of the object 
        // OPTIONAL this.keyIdentifier - OCTETSTRING
        // OPTIONAL this.authorityCertIssuer - Array of GeneralName
        // OPTIONAL this.authorityCertSerialNumber - INTEGER
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.AuthorityKeyIdentifier.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                if("keyIdentifier" in arguments[0])
                    this.keyIdentifier = arguments[0].keyIdentifier;

                if("authorityCertIssuer" in arguments[0])
                    this.authorityCertIssuer = arguments[0].authorityCertIssuer;

                if("authorityCertSerialNumber" in arguments[0])
                    this.authorityCertSerialNumber = arguments[0].authorityCertSerialNumber;
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.AuthorityKeyIdentifier.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.AuthorityKeyIdentifier({
                names: {
                    keyIdentifier: "keyIdentifier",
                    authorityCertIssuer: "authorityCertIssuer",
                    authorityCertSerialNumber: "authorityCertSerialNumber"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for AuthorityKeyIdentifier");
        // #endregion 

        // #region Get internal properties from parsed schema 
        if("keyIdentifier" in asn1.result)
        {
            asn1.result["keyIdentifier"].id_block.tag_class = 1; // UNIVERSAL
            asn1.result["keyIdentifier"].id_block.tag_number = 4; // OCTETSTRING

            this.keyIdentifier = asn1.result["keyIdentifier"];
        }

        if("authorityCertIssuer" in asn1.result)
        {
            this.authorityCertIssuer = new Array();
            var issuer_array = asn1.result["authorityCertIssuer"];

            for(var i = 0; i < issuer_array.length; i++)
                this.authorityCertIssuer.push(new in_window.org.pkijs.simpl.GENERAL_NAME({ schema: issuer_array[i] }));
        }

        if("authorityCertSerialNumber" in asn1.result)
        {
            asn1.result["authorityCertSerialNumber"].id_block.tag_class = 1; // UNIVERSAL
            asn1.result["authorityCertSerialNumber"].id_block.tag_number = 2; // INTEGER

            this.authorityCertSerialNumber = asn1.result["authorityCertSerialNumber"];
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.AuthorityKeyIdentifier.prototype.toSchema =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        if("keyIdentifier" in this)
        {
            var value = this.keyIdentifier;

            value.id_block.tag_class = 3; // CONTEXT-SPECIFIC
            value.id_block.tag_number = 0; // [0]

            output_array.push(value);
        }

        if("authorityCertIssuer" in this)
        {
            var issuer_array = new Array();

            for(var i = 0; i < this.authorityCertIssuer.length; i++)
                issuer_array.push(this.authorityCertIssuer[i].toSchema());

            output_array.push(new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                optional: true,
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 1 // [1]
                },
                value: [new in_window.org.pkijs.asn1.SEQUENCE({
                    value: issuer_array
                })]
            }));
        }

        if("authorityCertSerialNumber" in this)
        {
            var value = this.authorityCertSerialNumber;

            value.id_block.tag_class = 3; // CONTEXT-SPECIFIC
            value.id_block.tag_number = 2; // [2]

            output_array.push(value);
        }
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.AuthorityKeyIdentifier.prototype.toJSON =
    function()
    {
        var _object = {};

        if("keyIdentifier" in this)
            _object.keyIdentifier = this.keyIdentifier.toJSON();

        if("authorityCertIssuer" in this)
        {
            _object.authorityCertIssuer = new Array();

            for(var i = 0; i < this.authorityCertIssuer.length; i++)
                _object.authorityCertIssuer.push(this.authorityCertIssuer[i].toJSON());
        }

        if("authorityCertSerialNumber" in this)
            _object.authorityCertSerialNumber = this.authorityCertSerialNumber.toJSON();

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "PrivateKeyUsagePeriod" type of extension
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PrivateKeyUsagePeriod =
    function()
    {
        // #region Internal properties of the object 
        // OPTIONAL this.notBefore - new Date()
        // OPTIONAL this.notAfter - new Date()
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.PrivateKeyUsagePeriod.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                if("notBefore" in arguments[0])
                    this.notBefore = arguments[0].notBefore;

                if("notAfter" in arguments[0])
                    this.notAfter = arguments[0].notAfter;
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PrivateKeyUsagePeriod.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.PrivateKeyUsagePeriod({
                names: {
                    notBefore: "notBefore",
                    notAfter: "notAfter"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for PrivateKeyUsagePeriod");
        // #endregion 

        // #region Get internal properties from parsed schema 
        if("notBefore" in asn1.result)
        {
            var localNotBefore = new in_window.org.pkijs.asn1.GENERALIZEDTIME();
            localNotBefore.fromBuffer(asn1.result["notBefore"].value_block.value_hex);
            this.notBefore = localNotBefore.toDate();
        }

        if("notAfter" in asn1.result)
        {
            var localNotAfter = new in_window.org.pkijs.asn1.GENERALIZEDTIME({ value_hex: asn1.result["notAfter"].value_block.value_hex });
            localNotAfter.fromBuffer(asn1.result["notAfter"].value_block.value_hex);
            this.notAfter = localNotAfter.toDate();
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PrivateKeyUsagePeriod.prototype.toSchema =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        if("notBefore" in this)
            output_array.push(new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 0 // [0]
                },
                value_hex: (new in_window.org.pkijs.asn1.GENERALIZEDTIME({ value_date: this.notBefore })).value_block.value_hex
            }));

        if("notAfter" in this)
            output_array.push(new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 1 // [1]
                },
                value_hex: (new in_window.org.pkijs.asn1.GENERALIZEDTIME({ value_date: this.notAfter })).value_block.value_hex
            }));
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PrivateKeyUsagePeriod.prototype.toJSON =
    function()
    {
        var _object = {};

        if("notBefore" in this)
            _object.notBefore = this.notBefore;

        if("notAfter" in this)
            _object.notAfter = this.notAfter;

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "IssuerAltName" and "SubjectAltName" types of extension
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.AltName =
    function()
    {
        // #region Internal properties of the object 
        this.altNames = new Array(); //Array of GeneralName
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.AltName.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.altNames = arguments[0].altNames || new Array();
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.AltName.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.AltName({
                names: {
                    altNames: "altNames"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for AltName");
        // #endregion 

        // #region Get internal properties from parsed schema 
        if("altNames" in asn1.result)
        {
            var altNames_array = asn1.result["altNames"];

            for(var i = 0; i < altNames_array.length; i++)
                this.altNames.push(new in_window.org.pkijs.simpl.GENERAL_NAME({ schema: altNames_array[i] }));
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.AltName.prototype.toSchema =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        for(var i = 0; i < this.altNames.length; i++)
            output_array.push(this.altNames[i].toSchema());
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.AltName.prototype.toJSON =
    function()
    {
        var _object = {
            altNames: new Array()
        };

        for(var i = 0; i < this.altNames.length; i++)
            _object.altNames.push(this.altNames[i].toJSON());

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "SubjectDirectoryAttributes" type of extension
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.SubjectDirectoryAttributes =
    function()
    {
        // #region Internal properties of the object 
        this.attributes = new Array(); // Array of "simpl.ATTRIBUTE"
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.SubjectDirectoryAttributes.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.attributes = arguments[0].attributes || new Array(); // Array of "simpl.ATTRIBUTE"
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.SubjectDirectoryAttributes.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.SubjectDirectoryAttributes({
                names: {
                    attributes: "attributes"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for SubjectDirectoryAttributes");
        // #endregion 

        // #region Get internal properties from parsed schema
        var attrs = asn1.result["attributes"];

        for(var i = 0; i < attrs.length; i++)
            this.attributes.push(new in_window.org.pkijs.simpl.ATTRIBUTE({ schema: attrs[i] }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.SubjectDirectoryAttributes.prototype.toSchema =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        for(var i = 0; i < this.attributes.length; i++)
            output_array.push(this.attributes[i].toSchema());
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.SubjectDirectoryAttributes.prototype.toJSON =
    function()
    {
        var _object = {
            attributes: new Array()
        };

        for(var i = 0; i < this.attributes.length; i++)
            _object.attributes.push(this.attributes[i].toJSON());

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "PolicyMapping" type
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PolicyMapping =
    function()
    {
        // #region Internal properties of the object 
        this.issuerDomainPolicy = "";
        this.subjectDomainPolicy = "";
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.PolicyMapping.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.issuerDomainPolicy = arguments[0].issuerDomainPolicy || "";
                this.subjectDomainPolicy = arguments[0].subjectDomainPolicy || "";
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PolicyMapping.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.PolicyMapping({
                names: {
                    issuerDomainPolicy: "issuerDomainPolicy",
                    subjectDomainPolicy: "subjectDomainPolicy"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for PolicyMapping");
        // #endregion 

        // #region Get internal properties from parsed schema
        this.issuerDomainPolicy = asn1.result["issuerDomainPolicy"].value_block.toString();
        this.subjectDomainPolicy = asn1.result["subjectDomainPolicy"].value_block.toString();
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PolicyMapping.prototype.toSchema =
    function()
    {
        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: [
                new in_window.org.pkijs.asn1.OID({ value: this.issuerDomainPolicy }),
                new in_window.org.pkijs.asn1.OID({ value: this.subjectDomainPolicy })
            ]
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PolicyMapping.prototype.toJSON =
    function()
    {
        return {
            issuerDomainPolicy: this.issuerDomainPolicy,
            subjectDomainPolicy: this.subjectDomainPolicy
        };
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "PolicyMappings" type of extension
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PolicyMappings =
    function()
    {
        // #region Internal properties of the object 
        this.mappings = new Array(); // Array of "simpl.x509.PolicyMapping"
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.PolicyMappings.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.mappings = arguments[0].mappings || new Array();
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PolicyMappings.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.PolicyMappings({
                names: {
                    mappings: "mappings"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for PolicyMappings");
        // #endregion 

        // #region Get internal properties from parsed schema 
        var maps = asn1.result["mappings"];

        for(var i = 0; i < maps.length; i++)
            this.mappings.push(new in_window.org.pkijs.simpl.x509.PolicyMapping({ schema: maps[i] }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PolicyMappings.prototype.toSchema =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        for(var i = 0; i < this.mappings.length; i++)
            output_array.push(this.mappings.toSchema());
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PolicyMappings.prototype.toJSON =
    function()
    {
        var _object = {
            mappings: new Array()
        };

        for(var i = 0; i < this.mappings.length; i++)
            _object.mappings.push(this.mappings[i].toJSON());

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "GeneralSubtree" type
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.GeneralSubtree =
    function()
    {
        // #region Internal properties of the object 
        this.base = new in_window.org.pkijs.simpl.GENERAL_NAME();
        // OPTIONAL this.minimum // in_window.org.pkijs.asn1.INTEGER
        // OPTIONAL this.maximum // in_window.org.pkijs.asn1.INTEGER
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.GeneralSubtree.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.base = arguments[0].base || new in_window.org.pkijs.simpl.GENERAL_NAME();

                if("minimum" in arguments[0])
                    this.minimum = arguments[0].minimum;

                if("maximum" in arguments[0])
                    this.maximum = arguments[0].maximum;
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.GeneralSubtree.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.GeneralSubtree({
                names: {
                    base: {
                        names: {
                            block_name: "base"
                        }
                    },
                    minimum: "minimum",
                    maximum: "maximum"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for ");
        // #endregion 

        // #region Get internal properties from parsed schema 
        this.base = new in_window.org.pkijs.simpl.GENERAL_NAME({ schema: asn1.result["base"] });

        if("minimum" in asn1.result)
        {
            if(asn1.result["minimum"].value_block.is_hex_only)
                this.minimum = asn1.result["minimum"];
            else
                this.minimum = asn1.result["minimum"].value_block.value_dec;
        }

        if("maximum" in asn1.result)
        {
            if(asn1.result["maximum"].value_block.is_hex_only)
                this.maximum = asn1.result["maximum"];
            else
                this.maximum = asn1.result["maximum"].value_block.value_dec;
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.GeneralSubtree.prototype.toSchema =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        output_array.push(this.base.toSchema());

        if("minimum" in this)
        {
            var value_minimum = 0;

            if(this.minimum instanceof in_window.org.pkijs.asn1.INTEGER)
                value_minimum = this.minimum;
            else
                value_minimum = new in_window.org.pkijs.asn1.INTEGER({ value: this.minimum });

            output_array.push(new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                optional: true,
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 0 // [0]
                },
                value: [value_minimum]
            }));
        }

        if("maximum" in this)
        {
            var value_maximum = 0;

            if(this.maximum instanceof in_window.org.pkijs.asn1.INTEGER)
                value_maximum = this.maximum;
            else
                value_maximum = new in_window.org.pkijs.asn1.INTEGER({ value: this.maximum });

            output_array.push(new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                optional: true,
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 1 // [1]
                },
                value: [value_maximum]
            }));
        }
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.GeneralSubtree.prototype.toJSON =
    function()
    {
        var _object = {
            base: this.base.toJSON()
        };

        if("minimum" in this)
        {
            if((typeof this.minimum) === "number")
                _object.minimum = this.minimum;
            else
                _object.minimum = this.minimum.toJSON();
        }

        if("maximum" in this)
        {
            if((typeof this.maximum) === "number")
                _object.maximum = this.maximum;
            else
                _object.maximum = this.maximum.toJSON();
        }

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "NameConstraints" type of extension
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.NameConstraints =
    function()
    {
        // #region Internal properties of the object 
        // OPTIONAL this.permittedSubtrees - Array of "simpl.x509.GeneralSubtree"
        // OPTIONAL this.excludedSubtrees - Array of "simpl.x509.GeneralSubtree"
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.NameConstraints.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                if("permittedSubtrees" in arguments[0])
                    this.permittedSubtrees = arguments[0].permittedSubtrees;

                if("excludedSubtrees" in arguments[0])
                    this.excludedSubtrees = arguments[0].excludedSubtrees;
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.NameConstraints.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.NameConstraints({
                names: {
                    permittedSubtrees: "permittedSubtrees",
                    excludedSubtrees: "excludedSubtrees"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for NameConstraints");
        // #endregion 

        // #region Get internal properties from parsed schema 
        if("permittedSubtrees" in asn1.result)
        {
            this.permittedSubtrees = new Array();
            var permited_array = asn1.result["permittedSubtrees"];

            for(var i = 0; i < permited_array.length; i++)
                this.permittedSubtrees.push(new in_window.org.pkijs.simpl.x509.GeneralSubtree({ schema: permited_array[i] }));
        }

        if("excludedSubtrees" in asn1.result)
        {
            this.excludedSubtrees = new Array();
            var excluded_array = asn1.result["excludedSubtrees"];

            for(var i = 0; i < excluded_array.length; i++)
                this.excludedSubtrees.push(new in_window.org.pkijs.simpl.x509.GeneralSubtree({ schema: excluded_array[i] }));
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.NameConstraints.prototype.toSchema =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        if("permittedSubtrees" in this)
        {
            var permited_array = new Array();

            for(var i = 0; i < this.permittedSubtrees.length; i++)
                permited_array.push(this.permittedSubtrees[i].toSchema());

            output_array.push(new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                optional: true,
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 0 // [0]
                },
                value: [new in_window.org.pkijs.asn1.SEQUENCE({
                    value: permited_array
                })]
            }));
        }

        if("excludedSubtrees" in this)
        {
            var excluded_array = new Array();

            for(var i = 0; i < this.excludedSubtrees.length; i++)
                excluded_array.push(this.excludedSubtrees[i].toSchema());

            output_array.push(new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                optional: true,
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 1 // [1]
                },
                value: [new in_window.org.pkijs.asn1.SEQUENCE({
                    value: excluded_array
                })]
            }));
        }
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.NameConstraints.prototype.toJSON =
    function()
    {
        var _object = {};

        if("permittedSubtrees" in this)
        {
            _object.permittedSubtrees = new Array();

            for(var i = 0; i < this.permittedSubtrees.length; i++)
                _object.permittedSubtrees.push(this.permittedSubtrees[i].toJSON());
        }

        if("excludedSubtrees" in this)
        {
            _object.excludedSubtrees = new Array();

            for(var i = 0; i < this.excludedSubtrees.length; i++)
                _object.excludedSubtrees.push(this.excludedSubtrees[i].toJSON());
        }

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "BasicConstraints" type of extension
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.BasicConstraints =
    function()
    {
        // #region Internal properties of the object 
        // OPTIONAL this.cA - boolean value
        // OPTIONAL this.pathLenConstraint - integer value
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.BasicConstraints.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                if("cA" in arguments[0])
                    this.cA = arguments[0].cA;

                if("pathLenConstraint" in arguments[0])
                    this.pathLenConstraint = arguments[0].pathLenConstraint;
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.BasicConstraints.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.BasicConstraints({
                names: {
                    cA: "cA",
                    pathLenConstraint: "pathLenConstraint"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for BasicConstraints");
        // #endregion 

        // #region Get internal properties from parsed schema 
        if("cA" in asn1.result)
            this.cA = asn1.result["cA"].value_block.value;

        if("pathLenConstraint" in asn1.result)
            this.pathLenConstraint = asn1.result["pathLenConstraint"].value_block.value_dec;
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.BasicConstraints.prototype.toSchema =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        if("cA" in this)
            output_array.push(new in_window.org.pkijs.asn1.BOOLEAN({ value: this.cA }));

        if("pathLenConstraint" in this)
            output_array.push(new in_window.org.pkijs.asn1.INTEGER({ value: this.pathLenConstraint }));
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.BasicConstraints.prototype.toJSON =
    function()
    {
        var _object = {};

        if("cA" in this)
            _object.cA = this.cA;

        if("pathLenConstraint" in this)
            _object.pathLenConstraint = this.pathLenConstraint;

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "PolicyQualifierInfo" type
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PolicyQualifierInfo =
    function()
    {
        // #region Internal properties of the object 
        this.policyQualifierId = "";
        this.qualifier = new in_window.org.pkijs.asn1.ANY();
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.PolicyQualifierInfo.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.policyQualifierId = arguments[0].policyQualifierId || "";
                this.qualifier = arguments[0].qualifier || new in_window.org.pkijs.asn1.ANY();
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PolicyQualifierInfo.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.PolicyQualifierInfo({
                names: {
                    policyQualifierId: "policyQualifierId",
                    qualifier: "qualifier"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for PolicyQualifierInfo");
        // #endregion 

        // #region Get internal properties from parsed schema 
        this.policyQualifierId = asn1.result["policyQualifierId"].value_block.toString();
        this.qualifier = asn1.result["qualifier"];
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PolicyQualifierInfo.prototype.toSchema =
    function()
    {
        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: [
                new in_window.org.pkijs.asn1.OID({ value: this.policyQualifierId }),
                this.qualifier
            ]
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PolicyQualifierInfo.prototype.toJSON =
    function()
    {
        return {
            policyQualifierId: this.policyQualifierId,
            qualifier: this.qualifier.toJSON()
        };
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "PolicyInformation" type
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PolicyInformation =
    function()
    {
        // #region Internal properties of the object 
        this.policyIdentifier = "";
        // OPTIONAL this.policyQualifiers = new Array(); // Array of "simpl.x509.PolicyQualifierInfo"
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.PolicyInformation.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.policyIdentifier = arguments[0].policyIdentifier || "";

                if("policyQualifiers" in arguments[0])
                    this.policyQualifiers = arguments[0].policyQualifiers;
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PolicyInformation.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.PolicyInformation({
                names: {
                    policyIdentifier: "policyIdentifier",
                    policyQualifiers: "policyQualifiers"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for PolicyInformation");
        // #endregion 

        // #region Get internal properties from parsed schema 
        this.policyIdentifier = asn1.result["policyIdentifier"].value_block.toString();

        if("policyQualifiers" in asn1.result)
        {
            this.policyQualifiers = new Array();
            var qualifiers = asn1.result["policyQualifiers"];

            for(var i = 0; i < qualifiers.length; i++)
                this.policyQualifiers.push(new in_window.org.pkijs.simpl.x509.PolicyQualifierInfo({ schema: qualifiers[i] }));
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PolicyInformation.prototype.toSchema =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        output_array.push(new in_window.org.pkijs.asn1.OID({ value: this.policyIdentifier }));

        if("policyQualifiers" in this)
        {
            var qualifiers = new Array();

            for(var i = 0; i < this.policyQualifiers.length; i++)
                qualifiers.push(this.policyQualifiers[i].toSchema());

            output_array.push(new in_window.org.pkijs.asn1.SEQUENCE({
                value: qualifiers
            }));
        }
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PolicyInformation.prototype.toJSON =
    function()
    {
        var _object = {
            policyIdentifier: this.policyIdentifier
        };

        if("policyQualifiers" in this)
        {
            _object.policyQualifiers = new Array();

            for(var i = 0; i < this.policyQualifiers.length; i++)
                _object.policyQualifiers.push(this.policyQualifiers[i].toJSON());
        }

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "CertificatePolicies" type of extension
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.CertificatePolicies =
    function()
    {
        // #region Internal properties of the object 
        this.certificatePolicies = new Array(); // Array of "simpl.x509.PolicyInformation"
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.CertificatePolicies.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.certificatePolicies = arguments[0].certificatePolicies || new Array(); // Array of "simpl.x509.PolicyInformation"
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.CertificatePolicies.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.CertificatePolicies({
                names: {
                    certificatePolicies: "certificatePolicies"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for CertificatePolicies");
        // #endregion 

        // #region Get internal properties from parsed schema
        var policies = asn1.result["certificatePolicies"];

        for(var i = 0; i < policies.length; i++)
            this.certificatePolicies.push(new in_window.org.pkijs.simpl.x509.PolicyInformation({ schema: policies[i] }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.CertificatePolicies.prototype.toSchema =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        for(var i = 0; i < this.certificatePolicies.length; i++)
            output_array.push(this.certificatePolicies[i].toSchema());
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.CertificatePolicies.prototype.toJSON =
    function()
    {
        var _object = {
            certificatePolicies: new Array()
        };

        for(var i = 0; i < this.certificatePolicies.length; i++)
            _object.certificatePolicies.push(this.certificatePolicies[i].toJSON());

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "PolicyConstraints" type of extension
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PolicyConstraints =
    function()
    {
        // #region Internal properties of the object 
        // OPTIONAL this.requireExplicitPolicy = 0;
        // OPTIONAL this.inhibitPolicyMapping = 0;
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.PolicyConstraints.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.requireExplicitPolicy = arguments[0].requireExplicitPolicy || 0;
                this.inhibitPolicyMapping = arguments[0].inhibitPolicyMapping || 0;
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PolicyConstraints.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.PolicyConstraints({
                names: {
                    requireExplicitPolicy: "requireExplicitPolicy",
                    inhibitPolicyMapping: "inhibitPolicyMapping"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for PolicyConstraints");
        // #endregion 

        // #region Get internal properties from parsed schema
        if("requireExplicitPolicy" in asn1.result)
        {
            var field1 = asn1.result["requireExplicitPolicy"];

            field1.id_block.tag_class = 1; // UNIVERSAL
            field1.id_block.tag_number = 2; // INTEGER

            var ber1 = field1.toBER(false);
            var int1 = in_window.org.pkijs.fromBER(ber1);

            this.requireExplicitPolicy = int1.result.value_block.value_dec;
        }

        if("inhibitPolicyMapping" in asn1.result)
        {
            var field2 = asn1.result["inhibitPolicyMapping"];

            field2.id_block.tag_class = 1; // UNIVERSAL
            field2.id_block.tag_number = 2; // INTEGER

            var ber2 = field2.toBER(false);
            var int2 = in_window.org.pkijs.fromBER(ber2);

            this.inhibitPolicyMapping = int2.result.value_block.value_dec;
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PolicyConstraints.prototype.toSchema =
    function()
    {
        // #region Create correct values for output sequence 
        var output_array = new Array();

        if("requireExplicitPolicy" in this)
        {
            var int1 = new in_window.org.pkijs.asn1.INTEGER({ value: this.requireExplicitPolicy });

            int1.id_block.tag_class = 3; // CONTEXT-SPECIFIC
            int1.id_block.tag_number = 0; // [0]

            output_array.push(int1);
        }

        if("inhibitPolicyMapping" in this)
        {
            var int2 = new in_window.org.pkijs.asn1.INTEGER({ value: this.inhibitPolicyMapping });

            int1.id_block.tag_class = 3; // CONTEXT-SPECIFIC
            int1.id_block.tag_number = 1; // [1]

            output_array.push(int2);
        }
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.PolicyConstraints.prototype.toJSON =
    function()
    {
        var _object = {};

        if("requireExplicitPolicy" in this)
            _object.requireExplicitPolicy = this.requireExplicitPolicy;

        if("inhibitPolicyMapping" in this)
            _object.inhibitPolicyMapping = this.inhibitPolicyMapping;

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "ExtKeyUsage" type of extension
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.ExtKeyUsage =
    function()
    {
        // #region Internal properties of the object 
        this.keyPurposes = new Array(); // Array of strings (OIDs value for key purposes)
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.ExtKeyUsage.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.keyPurposes = arguments[0].keyPurposes || new Array(); // Array of strings (OIDs value for key purposes)
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.ExtKeyUsage.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.ExtKeyUsage({
                names: {
                    keyPurposes: "keyPurposes"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for ExtKeyUsage");
        // #endregion 

        // #region Get internal properties from parsed schema 
        var purposes = asn1.result["keyPurposes"];

        for(var i = 0; i < purposes.length; i++)
            this.keyPurposes.push(purposes[i].value_block.toString());
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.ExtKeyUsage.prototype.toSchema =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        for(var i = 0; i < this.keyPurposes.length; i++)
            output_array.push(new in_window.org.pkijs.asn1.OID({ value: this.keyPurposes[i] }));
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.ExtKeyUsage.prototype.toJSON =
    function()
    {
        var _object = {
            keyPurposes: new Array()
        };

        for(var i = 0; i < this.keyPurposes.length; i++)
            _object.keyPurposes.push(this.keyPurposes[i]);

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "DistributionPoint" type
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.DistributionPoint =
    function()
    {
        // #region Internal properties of the object 
        // OPTIONAL this.distributionPoint // Array of "simpl.GENERAL_NAME" or a value of "simpl.RDN" type
        // OPTIONAL this.reasons // BITSTRING value
        // OPTIONAL this.cRLIssuer // Array of "simpl.GENERAL_NAME"
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.DistributionPoint.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                if("distributionPoint" in arguments[0])
                    this.distributionPoint = arguments[0].distributionPoint;

                if("reasons" in arguments[0])
                    this.reasons = arguments[0].reasons;

                if("cRLIssuer" in arguments[0])
                    this.cRLIssuer = arguments[0].cRLIssuer;
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.DistributionPoint.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.DistributionPoint({
                names: {
                    distributionPoint: "distributionPoint",
                    distributionPoint_names: "distributionPoint_names",
                    reasons: "reasons",
                    cRLIssuer: "cRLIssuer",
                    cRLIssuer_names: "cRLIssuer_names"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for DistributionPoint");
        // #endregion 

        // #region Get internal properties from parsed schema 
        if("distributionPoint" in asn1.result)
        {
            if(asn1.result["distributionPoint"].id_block.tag_number == 0) // GENERAL_NAMES variant
            {
                this.distributionPoint = new Array();
                var names = asn1.result["distributionPoint_names"];

                for(var i = 0; i < names.length; i++)
                    this.distributionPoint.push(new in_window.org.pkijs.simpl.GENERAL_NAME({ schema: names[i] }));
            }

            if(asn1.result["distributionPoint"].id_block.tag_number == 1) // RDN variant
            {
                asn1.result["distributionPoint"].id_block.tag_class = 1; // UNIVERSAL
                asn1.result["distributionPoint"].id_block.tag_number = 16; // SEQUENCE

                this.distributionPoint = new in_window.org.pkijs.simpl.RDN({ schema: asn1.result["distributionPoint"] });
            }
        }

        if("reasons" in asn1.result)
            this.reasons = new in_window.org.pkijs.asn1.BITSTRING({ value_hex: asn1.result["reasons"].value_block.value_hex });

        if("cRLIssuer" in asn1.result)
        {
            this.cRLIssuer = new Array();
            var crl_names = asn1.result["cRLIssuer_names"];

            for(var i = 0; i < crl_names; i++)
                this.cRLIssuer.push(new in_window.org.pkijs.simpl.GENERAL_NAME({ schema: crl_names[i] }));
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.DistributionPoint.prototype.toSchema =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        if("distributionPoint" in this)
        {
            var internalValue;

            if(this.distributionPoint instanceof Array)
            {
                var namesArray = new Array();

                for(var i = 0; i < this.distributionPoint.length; i++)
                    namesArray.push(this.distributionPoint[i].toSchema());

                internalValue = new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    },
                    value: namesArray
                });
            }
            else
            {
                internalValue = new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 1 // [1]
                    },
                    value: [this.distributionPoint.toSchema()]
                });
            }

            output_array.push(new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 0 // [0]
                },
                value: [internalValue]
            }));
        }

        if("reasons" in this)
        {
            output_array.push(new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 1 // [1]
                },
                value_hex: this.reasons.value_block.value_hex
            }));
        }

        if("cRLIssuer" in this)
        {
            var value = new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                name: (names.cRLIssuer || ""),
                optional: true,
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 2 // [2]
                }
            });

            for(var i = 0; i < this.cRLIssuer.length; i++)
                value.value_block.value.push(this.cRLIssuer[i].toSchema());

            output_array.push(value);
        }
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.DistributionPoint.prototype.toJSON =
    function()
    {
        var _object = {};

        if("distributionPoint" in this)
        {
            if(this.distributionPoint instanceof Array)
            {
                _object.distributionPoint = new Array();

                for(var i = 0; i < this.distributionPoint.length; i++)
                    _object.distributionPoint.push(this.distributionPoint[i].toJSON());
            }
            else
                _object.distributionPoint = this.distributionPoint.toJSON();
        }

        if("reasons" in this)
            _object.reasons = this.reasons.toJSON();

        if("cRLIssuer" in this)
        {
            _object.cRLIssuer = new Array();

            for(var i = 0; i < this.cRLIssuer.length; i++)
                _object.cRLIssuer.push(this.cRLIssuer[i].toJSON());
        }

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "CRLDistributionPoints" type of extension
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.CRLDistributionPoints =
    function()
    {
        // #region Internal properties of the object 
        this.distributionPoints = new Array(); // Array of "simpl.x509.DistributionPoint"
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.CRLDistributionPoints.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.distributionPoints = arguments[0].distributionPoints || new Array(); // Array of "simpl.x509.DistributionPoint"
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.CRLDistributionPoints.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.CRLDistributionPoints({
                names: {
                    distributionPoints: "distributionPoints"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for CRLDistributionPoints");
        // #endregion 

        // #region Get internal properties from parsed schema 
        var points = asn1.result["distributionPoints"];

        for(var i = 0; i < points.length; i++)
            this.distributionPoints.push(new in_window.org.pkijs.simpl.x509.DistributionPoint({ schema: points[i] }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.CRLDistributionPoints.prototype.toSchema =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        for(var i = 0; i < this.distributionPoints.length; i++)
            output_array.push(this.distributionPoints[i].toSchema());
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.CRLDistributionPoints.prototype.toJSON =
    function()
    {
        var _object = {
            distributionPoints: new Array()
        };

        for(var i = 0; i < this.distributionPoints.length; i++)
            _object.distributionPoints.push(this.distributionPoints[i].toJSON());

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "AccessDescription" type
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.AccessDescription =
    function()
    {
        // #region Internal properties of the object 
        this.accessMethod = "";
        this.accessLocation = new in_window.org.pkijs.simpl.GENERAL_NAME();
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.AccessDescription.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.accessMethod = arguments[0].accessMethod || "";
                this.accessLocation = arguments[0].accessLocation || new in_window.org.pkijs.simpl.GENERAL_NAME();
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.AccessDescription.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.AccessDescription({
                names: {
                    accessMethod: "accessMethod",
                    accessLocation: {
                        names: {
                            block_name: "accessLocation"
                        }
                    }
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for AccessDescription");
        // #endregion 

        // #region Get internal properties from parsed schema 
        this.accessMethod = asn1.result["accessMethod"].value_block.toString();
        this.accessLocation = new in_window.org.pkijs.simpl.GENERAL_NAME({ schema: asn1.result["accessLocation"] });
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.AccessDescription.prototype.toSchema =
    function()
    {
        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: [
                new in_window.org.pkijs.asn1.OID({ value: this.accessMethod }),
                this.accessLocation.toSchema()
            ]
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.AccessDescription.prototype.toJSON =
    function()
    {
        return {
            accessMethod: this.accessMethod,
            accessLocation: this.accessLocation.toJSON()
        };
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "AuthorityInfoAccess" and "SubjectInfoAccess" types of extension
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.InfoAccess =
    function()
    {
        // #region Internal properties of the object 
        this.accessDescriptions = new Array(); // Array of "simpl.x509.AccessDescription"
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.InfoAccess.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.accessDescriptions = arguments[0].accessDescriptions || new Array(); // Array of "simpl.x509.DistributionPoint"
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.InfoAccess.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.InfoAccess({
                names: {
                    accessDescriptions: "accessDescriptions"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for InfoAccess");
        // #endregion 

        // #region Get internal properties from parsed schema 
        var descriptions = asn1.result["accessDescriptions"];

        for(var i = 0; i < descriptions.length; i++)
            this.accessDescriptions.push(new in_window.org.pkijs.simpl.x509.AccessDescription({ schema: descriptions[i] }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.InfoAccess.prototype.toSchema =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        for(var i = 0; i < this.accessDescriptions.length; i++)
            output_array.push(this.accessDescriptions[i].toSchema());
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.InfoAccess.prototype.toJSON =
    function()
    {
        var _object = {
            accessDescriptions: new Array()
        };

        for(var i = 0; i < this.accessDescriptions.length; i++)
            _object.accessDescriptions.push(this.accessDescriptions[i].toJSON());

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "IssuingDistributionPoint" type of extension
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.IssuingDistributionPoint =
    function()
    {
        // #region Internal properties of the object 
        // OPTIONAL this.distributionPoint // Array of "simpl.GENERAL_NAME" or a value of "simpl.RDN" type
        // OPTIONAL this.onlyContainsUserCerts // BOOLEAN flag
        // OPTIONAL this.onlyContainsCACerts // BOOLEAN flag
        // OPTIONAL this.onlySomeReasons // BITSTRING
        // OPTIONAL this.indirectCRL // BOOLEAN flag
        // OPTIONAL this.onlyContainsAttributeCerts // BOOLEAN flag
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.x509.IssuingDistributionPoint.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                if("distributionPoint" in arguments[0])
                    this.distributionPoint = arguments[0].distributionPoint;

                if("onlyContainsUserCerts" in arguments[0])
                    this.onlyContainsUserCerts = arguments[0].onlyContainsUserCerts;

                if("onlyContainsCACerts" in arguments[0])
                    this.onlyContainsCACerts = arguments[0].onlyContainsCACerts;

                if("onlySomeReasons" in arguments[0])
                    this.onlySomeReasons = arguments[0].onlySomeReasons;

                if("indirectCRL" in arguments[0])
                    this.indirectCRL = arguments[0].indirectCRL;

                if("onlyContainsAttributeCerts" in arguments[0])
                    this.onlyContainsAttributeCerts = arguments[0].onlyContainsAttributeCerts;
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.IssuingDistributionPoint.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.x509.IssuingDistributionPoint({
                names: {
                    distributionPoint: "distributionPoint",
                    onlyContainsUserCerts: "onlyContainsUserCerts",
                    onlyContainsCACerts: "onlyContainsCACerts",
                    onlySomeReasons: "onlySomeReasons",
                    indirectCRL: "indirectCRL",
                    onlyContainsAttributeCerts: "onlyContainsAttributeCerts"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for IssuingDistributionPoint");
        // #endregion 

        // #region Get internal properties from parsed schema 
        if("distributionPoint" in asn1.result)
        {
            if(asn1.result["distributionPoint"].id_block.tag_number == 0) // GENERAL_NAMES variant
            {
                this.distributionPoint = new Array();
                var names = asn1.result["distributionPoint_names"];

                for(var i = 0; i < names.length; i++)
                    this.distributionPoint.push(new in_window.org.pkijs.simpl.GENERAL_NAME({ schema: names[i] }));
            }

            if(asn1.result["distributionPoint"].id_block.tag_number == 1) // RDN variant
            {
                asn1.result["distributionPoint"].id_block.tag_class = 1; // UNIVERSAL
                asn1.result["distributionPoint"].id_block.tag_number = 16; // SEQUENCE

                this.distributionPoint = new in_window.org.pkijs.simpl.RDN({ schema: asn1.result["distributionPoint"] });
            }
        }

        if("onlyContainsUserCerts" in asn1.result)
        {
            var view = new Uint8Array(asn1.result["onlyContainsUserCerts"].value_block.value_hex);
            this.onlyContainsUserCerts = (view[0] === 0x00) ? false : true;
        }

        if("onlyContainsCACerts" in asn1.result)
        {
            var view = new Uint8Array(asn1.result["onlyContainsCACerts"].value_block.value_hex);
            this.onlyContainsCACerts = (view[0] === 0x00) ? false : true;
        }

        if("onlySomeReasons" in asn1.result)
        {
            var view = new Uint8Array(asn1.result["onlySomeReasons"].value_block.value_hex);
            this.onlySomeReasons = view[0];
        }

        if("indirectCRL" in asn1.result)
        {
            var view = new Uint8Array(asn1.result["indirectCRL"].value_block.value_hex);
            this.indirectCRL = (view[0] === 0x00) ? false : true;
        }

        if("onlyContainsAttributeCerts" in asn1.result)
        {
            var view = new Uint8Array(asn1.result["onlyContainsAttributeCerts"].value_block.value_hex);
            this.onlyContainsAttributeCerts = (view[0] === 0x00) ? false : true;
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.IssuingDistributionPoint.prototype.toSchema =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        if("distributionPoint" in this)
        {
            var value;

            if(this.distributionPoint instanceof Array)
            {
                value = new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                    id_block: {
                        tag_class: 3, // CONTEXT-SPECIFIC
                        tag_number: 0 // [0]
                    }
                });

                for(var i = 0; i < this.distributionPoint.length; i++)
                    value.value_block.value.push(this.distributionPoint[i].toSchema());
            }
            else
            {
                value = this.distributionPoint.toSchema();

                value.id_block.tag_class = 3; // CONTEXT - SPECIFIC
                value.id_block.tag_number = 1; // [1]
            }

            output_array.push(value);
        }

        if("onlyContainsUserCerts" in this)
        {
            var buffer = new ArrayBuffer(1);
            var view = new Uint8Array(buffer);

            view[0] = (this.onlyContainsUserCerts === false) ? 0x00 : 0xFF;

            output_array.push(new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                name: (names.onlyContainsUserCerts || ""),
                optional: true,
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 1 // [1]
                },
                value_hex: buffer
            }));
        }

        if("onlyContainsCACerts" in this)
        {
            var buffer = new ArrayBuffer(1);
            var view = new Uint8Array(buffer);

            view[0] = (this.onlyContainsCACerts === false) ? 0x00 : 0xFF;

            output_array.push(new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                name: (names.onlyContainsUserCerts || ""),
                optional: true,
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 2 // [2]
                },
                value_hex: buffer
            }));
        }

        if("onlySomeReasons" in this)
        {
            var buffer = new ArrayBuffer(1);
            var view = new Uint8Array(buffer);

            view[0] = this.onlySomeReasons;

            output_array.push(new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                name: (names.onlyContainsUserCerts || ""),
                optional: true,
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 3 // [3]
                },
                value_hex: buffer
            }));
        }

        if("indirectCRL" in this)
        {
            var buffer = new ArrayBuffer(1);
            var view = new Uint8Array(buffer);

            view[0] = (this.indirectCRL === false) ? 0x00 : 0xFF;

            output_array.push(new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                name: (names.onlyContainsUserCerts || ""),
                optional: true,
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 4 // [4]
                },
                value_hex: buffer
            }));
        }

        if("onlyContainsAttributeCerts" in this)
        {
            var buffer = new ArrayBuffer(1);
            var view = new Uint8Array(buffer);

            view[0] = (this.onlyContainsAttributeCerts === false) ? 0x00 : 0xFF;

            output_array.push(new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                name: (names.onlyContainsUserCerts || ""),
                optional: true,
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 5 // [5]
                },
                value_hex: buffer
            }));
        }
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.x509.IssuingDistributionPoint.prototype.toJSON =
    function()
    {
        var _object = {};

        if("distributionPoint" in this)
        {
            if(this.distributionPoint instanceof Array)
            {
                _object.distributionPoint = new Array();

                for(var i = 0; i < this.distributionPoint.length; i++)
                    _object.distributionPoint.push(this.distributionPoint[i].toJSON());
            }
            else
                _object.distributionPoint = this.distributionPoint.toJSON();
        }

        if("onlyContainsUserCerts" in this)
            _object.onlyContainsUserCerts = this.onlyContainsUserCerts;

        if("onlyContainsCACerts" in this)
            _object.onlyContainsCACerts = this.onlyContainsCACerts;

        if("onlySomeReasons" in this)
            _object.onlySomeReasons = this.onlySomeReasons.toJSON();

        if("indirectCRL" in this)
            _object.indirectCRL = this.indirectCRL;

        if("onlyContainsAttributeCerts" in this)
            _object.onlyContainsAttributeCerts = this.onlyContainsAttributeCerts;

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "Extension" type
    //**************************************************************************************
    in_window.org.pkijs.simpl.EXTENSION =
    function()
    {
        // #region Internal properties of the object 
        this.extnID = "";
        this.critical = false;
        this.extnValue = new in_window.org.pkijs.asn1.OCTETSTRING();

        // OPTIONAL this.parsedValue - Parsed "extnValue" in case of well-known "extnID"
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.EXTENSION.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.extnID = (arguments[0].extnID || "");
                this.critical = (arguments[0].critical || false);
                if("extnValue" in arguments[0])
                    this.extnValue = new in_window.org.pkijs.asn1.OCTETSTRING({ value_hex: arguments[0].extnValue });
                else
                    this.extnValue = new in_window.org.pkijs.asn1.OCTETSTRING();

                if("parsedValue" in arguments[0])
                    this.parsedValue = arguments[0].parsedValue;
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.EXTENSION.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.EXTENSION({
                names: {
                    extnID: "extnID",
                    critical: "critical",
                    extnValue: "extnValue"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for EXTENSION");
        // #endregion 

        // #region Get internal properties from parsed schema 
        this.extnID = asn1.result.extnID.value_block.toString();
        if("critical" in asn1.result)
            this.critical = asn1.result.critical.value_block.value;
        this.extnValue = asn1.result.extnValue;

        // #region Get "parsedValue" for well-known extensions 
        var asn1 = in_window.org.pkijs.fromBER(this.extnValue.value_block.value_hex);
        if(asn1.offset === (-1))
            return;

        switch(this.extnID)
        {
            case "2.5.29.9": // SubjectDirectoryAttributes
                this.parsedValue = new in_window.org.pkijs.simpl.x509.SubjectDirectoryAttributes({ schema: asn1.result });
                break;
            case "2.5.29.14": // SubjectKeyIdentifier
                this.parsedValue = asn1.result; // Should be just a simple OCTETSTRING
                break;
            case "2.5.29.15": // KeyUsage
                this.parsedValue = asn1.result; // Should be just a simple BITSTRING
                break;
            case "2.5.29.16": // PrivateKeyUsagePeriod
                this.parsedValue = new in_window.org.pkijs.simpl.x509.PrivateKeyUsagePeriod({ schema: asn1.result });
                break;
            case "2.5.29.17": // SubjectAltName
            case "2.5.29.18": // IssuerAltName
                this.parsedValue = new in_window.org.pkijs.simpl.x509.AltName({ schema: asn1.result });
                break;
            case "2.5.29.19": // BasicConstraints
                this.parsedValue = new in_window.org.pkijs.simpl.x509.BasicConstraints({ schema: asn1.result });
                break;
            case "2.5.29.20": // CRLNumber
            case "2.5.29.27": // BaseCRLNumber (delta CRL indicator)
                this.parsedValue = asn1.result; // Should be just a simple INTEGER
                break;
            case "2.5.29.21": // CRLReason
                this.parsedValue = asn1.result; // Should be just a simple ENUMERATED
                break;
            case "2.5.29.24": // InvalidityDate
                this.parsedValue = asn1.result; // Should be just a simple GeneralizedTime
                break;
            case "2.5.29.28": // IssuingDistributionPoint
                this.parsedValue = new in_window.org.pkijs.simpl.x509.IssuingDistributionPoint({ schema: asn1.result });
                break;
            case "2.5.29.29": // CertificateIssuer
                this.parsedValue = new in_window.org.pkijs.simpl.GENERAL_NAMES({ schema: asn1.result }); // Should be just a simple 
                break;
            case "2.5.29.30": // NameConstraints
                this.parsedValue = new in_window.org.pkijs.simpl.x509.NameConstraints({ schema: asn1.result });
                break;
            case "2.5.29.31": // CRLDistributionPoints
            case "2.5.29.46": // FreshestCRL
                this.parsedValue = new in_window.org.pkijs.simpl.x509.CRLDistributionPoints({ schema: asn1.result });
                break;
            case "2.5.29.32": // CertificatePolicies
                this.parsedValue = new in_window.org.pkijs.simpl.x509.CertificatePolicies({ schema: asn1.result });
                break;
            case "2.5.29.33": // PolicyMappings
                this.parsedValue = new in_window.org.pkijs.simpl.x509.PolicyMappings({ schema: asn1.result });
                break;
            case "2.5.29.35": // AuthorityKeyIdentifier
                this.parsedValue = new in_window.org.pkijs.simpl.x509.AuthorityKeyIdentifier({ schema: asn1.result });
                break;
            case "2.5.29.36": // PolicyConstraints
                this.parsedValue = new in_window.org.pkijs.simpl.x509.PolicyConstraints({ schema: asn1.result });
                break;
            case "2.5.29.37": // ExtKeyUsage
                this.parsedValue = new in_window.org.pkijs.simpl.x509.ExtKeyUsage({ schema: asn1.result });
                break;
            case "2.5.29.54": // InhibitAnyPolicy
                this.parsedValue = asn1.result; // Should be just a simple INTEGER
                break;
            case "1.3.6.1.5.5.7.1.1": // AuthorityInfoAccess
            case "1.3.6.1.5.5.7.1.11": // SubjectInfoAccess
                this.parsedValue = new in_window.org.pkijs.simpl.x509.InfoAccess({ schema: asn1.result });
                break;
            default:;
        }
        // #endregion 
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.EXTENSION.prototype.toSchema =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        output_array.push(new in_window.org.pkijs.asn1.OID({ value: this.extnID }));

        if(this.critical)
            output_array.push(new in_window.org.pkijs.asn1.BOOLEAN({ value: this.critical }));

        output_array.push(this.extnValue);
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.EXTENSION.prototype.toJSON =
    function()
    {
        var _object = {
            extnID: this.extnID,
            critical: this.critical,
            extnValue: this.extnValue.toJSON()
        };

        if("parsedValue" in this)
            _object.parsedValue = this.parsedValue.toJSON();

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "Extensions" type (sequence of many Extension)
    //**************************************************************************************
    in_window.org.pkijs.simpl.EXTENSIONS =
    function()
    {
        // #region Internal properties of the object 
        this.extensions_array = new Array();
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.EXTENSIONS.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
                this.extensions_array = (arguments[0].extensions_array || (new Array()));
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.EXTENSIONS.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.EXTENSIONS({
                names: {
                    extensions: "extensions"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for EXTENSIONS");
        // #endregion 

        // #region Get internal properties from parsed schema 
        for(var i = 0; i < asn1.result.extensions.length; i++)
            this.extensions_array.push(new in_window.org.pkijs.simpl.EXTENSION({ schema: asn1.result.extensions[i] }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.EXTENSIONS.prototype.toSchema =
    function()
    {
        // #region Construct and return new ASN.1 schema for this object 
        var extension_schemas = new Array();

        for(var i = 0; i < this.extensions_array.length; i++)
            extension_schemas.push(this.extensions_array[i].toSchema());

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: extension_schemas
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.EXTENSIONS.prototype.toJSON =
    function()
    {
        var _object = {
            extensions_array: new Array()
        };

        for(var i = 0; i < this.extensions_array.length; i++)
            _object.extensions_array.push(this.extensions_array[i].toJSON());

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for X.509 v3 certificate (RFC5280)
    //**************************************************************************************
    in_window.org.pkijs.simpl.CERT =
    function()
    {
        // #region Internal properties of the object 
        // #region Properties from certificate TBS part 
        this.tbs = new ArrayBuffer(0); // Encoded value of certificate TBS (need to have it for certificate validation)

        // OPTIONAL this.version = 0;
        this.serialNumber = new in_window.org.pkijs.asn1.INTEGER(); // Might be a very long integer value
        this.signature = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER(); // Signature algorithm from certificate TBS part
        this.issuer = new in_window.org.pkijs.simpl.RDN();
        this.notBefore = new in_window.org.pkijs.simpl.TIME();
        this.notAfter = new in_window.org.pkijs.simpl.TIME();
        this.subject = new in_window.org.pkijs.simpl.RDN();
        this.subjectPublicKeyInfo = new in_window.org.pkijs.simpl.PUBLIC_KEY_INFO();
        // OPTIONAL this.issuerUniqueID = new ArrayBuffer(0); // IMPLICIT bistring value
        // OPTIONAL this.subjectUniqueID = new ArrayBuffer(0); // IMPLICIT bistring value
        // OPTIONAL this.extensions = new Array(); // Array of "simpl.EXTENSION"
        // #endregion 

        // #region Properties from certificate major part 
        this.signatureAlgorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER(); // Signature algorithm from certificate major part
        this.signatureValue = new in_window.org.pkijs.asn1.BITSTRING();
        // #endregion 
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.CERT.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                // #region Properties from certificate TBS part 
                this.tbs = arguments[0].tbs || new ArrayBuffer(0);

                if("version" in arguments[0])
                    this.version = arguments[0].version;
                this.serialNumber = arguments[0].serialNumber || new in_window.org.pkijs.asn1.INTEGER(); // Might be a very long integer value
                this.signature = arguments[0].signature || new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER(); // Signature algorithm from certificate TBS part
                this.issuer = arguments[0].issuer || new in_window.org.pkijs.simpl.RDN();
                this.notBefore = arguments[0].not_before || new in_window.org.pkijs.simpl.TIME();
                this.notAfter = arguments[0].not_after || new in_window.org.pkijs.simpl.TIME();
                this.subject = arguments[0].subject || new in_window.org.pkijs.simpl.RDN();
                this.subjectPublicKeyInfo = arguments[0].subjectPublicKeyInfo || new in_window.org.pkijs.simpl.PUBLIC_KEY_INFO();
                if("issuerUniqueID" in arguments[0])
                    this.issuerUniqueID = arguments[0].issuerUniqueID;
                if("subjectUniqueID" in arguments[0])
                    this.subjectUniqueID = arguments[0].subjectUniqueID;
                if("extensions" in arguments[0])
                    this.extensions = arguments[0].extensions;
                // #endregion 

                // #region Properties from certificate major part 
                this.signatureAlgorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER(); // Signature algorithm from certificate major part
                this.signatureValue = new in_window.org.pkijs.asn1.BITSTRING();
                // #endregion 
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.CERT.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.CERT({
                names: {
                    tbsCertificate: {
                        names: {
                            extensions: {
                                names: {
                                    extensions: "tbsCertificate.extensions"
                                }
                            }
                        }
                    }
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for CERT");
        // #endregion 

        // #region Get internal properties from parsed schema 
        this.tbs = asn1.result["tbsCertificate"].value_before_decode;

        if("tbsCertificate.version" in asn1.result)
            this.version = asn1.result["tbsCertificate.version"].value_block.value_dec;
        this.serialNumber = asn1.result["tbsCertificate.serialNumber"];
        this.signature = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER({ schema: asn1.result["tbsCertificate.signature"] });
        this.issuer = new in_window.org.pkijs.simpl.RDN({ schema: asn1.result["tbsCertificate.issuer"] });
        this.notBefore = new in_window.org.pkijs.simpl.TIME({ schema: asn1.result["tbsCertificate.notBefore"] });
        this.notAfter = new in_window.org.pkijs.simpl.TIME({ schema: asn1.result["tbsCertificate.notAfter"] });
        this.subject = new in_window.org.pkijs.simpl.RDN({ schema: asn1.result["tbsCertificate.subject"] });
        this.subjectPublicKeyInfo = new in_window.org.pkijs.simpl.PUBLIC_KEY_INFO({ schema: asn1.result["tbsCertificate.subjectPublicKeyInfo"] });
        if("tbsCertificate.issuerUniqueID" in asn1.result)
            this.issuerUniqueID = asn1.result["tbsCertificate.issuerUniqueID"].value_block.value_hex;
        if("tbsCertificate.subjectUniqueID" in asn1.result)
            this.issuerUniqueID = asn1.result["tbsCertificate.subjectUniqueID"].value_block.value_hex;
        if("tbsCertificate.extensions" in asn1.result)
        {
            this.extensions = new Array();

            var extensions = asn1.result["tbsCertificate.extensions"];

            for(var i = 0; i < extensions.length; i++)
                this.extensions.push(new in_window.org.pkijs.simpl.EXTENSION({ schema: extensions[i] }));
        }

        this.signatureAlgorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER({ schema: asn1.result["signatureAlgorithm"] });
        this.signatureValue = asn1.result["signatureValue"];
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.CERT.prototype.encodeTBS =
    function()
    {
        /// <summary>Create ASN.1 schema for existing values of TBS part for the certificate</summary>

        // #region Create array for output sequence 
        var output_array = new Array();

        if("version" in this)
            output_array.push(new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                optional: true,
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 0 // [0]
                },
                value: [
                    new in_window.org.pkijs.asn1.INTEGER({ value: this.version }) // EXPLICIT integer value
                ]
            }));

        output_array.push(this.serialNumber);
        output_array.push(this.signature.toSchema());
        output_array.push(this.issuer.toSchema());

        output_array.push(new in_window.org.pkijs.asn1.SEQUENCE({
            value: [
                this.notBefore.toSchema(),
                this.notAfter.toSchema()
            ]
        }));

        output_array.push(this.subject.toSchema());
        output_array.push(this.subjectPublicKeyInfo.toSchema());

        if("issuerUniqueID" in this)
            output_array.push(new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                optional: true,
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 1 // [1]
                },
                value_hex: this.issuerUniqueID
            }));
        if("subjectUniqueID" in this)
            output_array.push(new in_window.org.pkijs.asn1.ASN1_PRIMITIVE({
                optional: true,
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 2 // [2]
                },
                value_hex: this.subjectUniqueID
            }));

        if("subjectUniqueID" in this)
            output_array.push(new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                optional: true,
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 3 // [3]
                },
                value: [this.extensions.toSchema()]
            }));

        if("extensions" in this)
        {
            var extensions = new Array();

            for(var i = 0; i < this.extensions.length; i++)
                extensions.push(this.extensions[i].toSchema());

            output_array.push(new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                optional: true,
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 3 // [3]
                },
                value: [new in_window.org.pkijs.asn1.SEQUENCE({
                    value: extensions
                })]
            }));
        }
        // #endregion 

        // #region Create and return output sequence 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.CERT.prototype.toSchema =
    function(encodeFlag)
    {
        /// <param name="encodeFlag" type="Boolean">If param equal to false then create TBS schema via decoding stored value. In othe case create TBS schema via assembling from TBS parts.</param>

        if(typeof encodeFlag === "undefined")
            encodeFlag = false;

        var tbs_schema = {};

        // #region Decode stored TBS value 
        if(encodeFlag === false)
        {
            if(this.tbs.length === 0) // No stored certificate TBS part
                return in_window.org.pkijs.schema.CERT().value[0];

            var tbs_asn1 = in_window.org.pkijs.fromBER(this.tbs);

            tbs_schema = tbs_asn1.result;
        }
        // #endregion 
        // #region Create TBS schema via assembling from TBS parts 
        else
            tbs_schema = in_window.org.pkijs.simpl.CERT.prototype.encodeTBS.call(this);
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: [
                tbs_schema,
                this.signatureAlgorithm.toSchema(),
                this.signatureValue
            ]
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.CERT.prototype.verify =
    function()
    {
        /// <summary>!!! Works well in Chrome dev versions only (April 2014th) !!!</summary>
        /// <returns type="Promise">Returns a new Promise object (in case of error), or a result of "crypto.subtle.veryfy" function</returns>

        // #region Global variables 
        var sequence = Promise.resolve();

        var subjectPublicKeyInfo = {};

        var signature = this.signatureValue;
        var tbs = this.tbs;

        var _this = this;
        // #endregion 

        // #region Set correct "subjectPublicKeyInfo" value 
        if(this.issuer.isEqual(this.subject)) // Self-signed certificate
            subjectPublicKeyInfo = this.subjectPublicKeyInfo;
        else
        {
            if(arguments[0] instanceof Object)
            {
                if("issuerCertificate" in arguments[0]) // Must be of type "simpl.CERT"
                    subjectPublicKeyInfo = arguments[0].issuerCertificate.subjectPublicKeyInfo;
            }

            if((subjectPublicKeyInfo instanceof in_window.org.pkijs.simpl.PUBLIC_KEY_INFO) === false)
                return new Promise(function(resolve, reject) { reject("Please provide issuer certificate as a parameter"); });
        }
        // #endregion 

        // #region Get a "crypto" extension 
        var crypto = in_window.org.pkijs.getCrypto();
        if(typeof crypto == "undefined")
            return new Promise(function(resolve, reject) { reject("Unable to create WebCrypto object"); });
        // #endregion 

        // #region Find signer's hashing algorithm 
        var sha_algorithm = in_window.org.pkijs.getHashAlgorithm(this.signatureAlgorithm);
        if(sha_algorithm === "")
            return new Promise(function(resolve, reject) { reject("Unsupported signature algorithm: " + _this.signatureAlgorithm.algorithm_id); });
        // #endregion 

        // #region Importing public key 
        sequence = sequence.then(
            function()
            {
                // #region Get information about public key algorithm and default parameters for import
                var algorithmObject = in_window.org.pkijs.getAlgorithmByOID(_this.signatureAlgorithm.algorithm_id);
                if(("name" in algorithmObject) === false)
                    return new Promise(function(resolve, reject) { reject("Unsupported public key algorithm: " + _this.signatureAlgorithm.algorithm_id); });

                var algorithm_name = algorithmObject.name;

                var algorithm = in_window.org.pkijs.getAlgorithmParameters(algorithm_name, "importkey");
                if("hash" in algorithm.algorithm)
                    algorithm.algorithm.hash.name = sha_algorithm;
                // #endregion 

                var publicKeyInfo_schema = subjectPublicKeyInfo.toSchema();
                var publicKeyInfo_buffer = publicKeyInfo_schema.toBER(false);
                var publicKeyInfo_view = new Uint8Array(publicKeyInfo_buffer);

                return crypto.importKey("spki", publicKeyInfo_view, algorithm.algorithm, true, algorithm.usages);
            }
            );
        // #endregion 

        // #region Verify signature for the certificate 
        sequence = sequence.then(
            function(publicKey)
            {
                // #region Get default algorithm parameters for verification 
                var algorithm = in_window.org.pkijs.getAlgorithmParameters(publicKey.algorithm.name, "verify");
                if("hash" in algorithm.algorithm)
                    algorithm.algorithm.hash.name = sha_algorithm;
                // #endregion 

                // #region Special case for ECDSA signatures 
                var signature_value = signature.value_block.value_hex;

                if(publicKey.algorithm.name === "ECDSA")
                {
                    var asn1 = in_window.org.pkijs.fromBER(signature_value);
                    signature_value = in_window.org.pkijs.createECDSASignatureFromCMS(asn1.result);
                }
                // #endregion 

                // #region Special case for RSA-PSS 
                if(publicKey.algorithm.name === "RSA-PSS")
                {
                    var pssParameters;

                    try
                    {
                        pssParameters = new in_window.org.pkijs.simpl.x509.RSASSA_PSS_params({ schema: _this.signatureAlgorithm.algorithm_params });
                    }
                    catch(ex)
                    {
                        return new Promise(function(resolve, reject) { reject(ex); });
                    }

                    if("saltLength" in pssParameters)
                        algorithm.algorithm.saltLength = pssParameters.saltLength;
                    else
                        algorithm.algorithm.saltLength = 20;

                    var hash_algo = "SHA-1";

                    if("hashAlgorithm" in pssParameters)
                    {
                        var hashAlgorithm = in_window.org.pkijs.getAlgorithmByOID(pssParameters.hashAlgorithm.algorithm_id);
                        if(("name" in hashAlgorithm) === false)
                            return new Promise(function(resolve, reject) { reject("Unrecognized hash algorithm: " + pssParameters.hashAlgorithm.algorithm_id); });

                        hash_algo = hashAlgorithm.name;
                    }

                    algorithm.algorithm.hash.name = hash_algo;
                }
                // #endregion 

                return crypto.verify(algorithm.algorithm,
                    publicKey,
                    new Uint8Array(signature_value),
                    new Uint8Array(tbs));
            }
            );
        // #endregion 

        return sequence;
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.CERT.prototype.sign =
    function(privateKey, hashAlgorithm)
    {
        /// <param name="privateKey" type="CryptoKey">Private key for "subjectPublicKeyInfo" structure</param>
        /// <param name="hashAlgorithm" type="String" optional="true">Hashing algorithm. Default SHA-1</param>

        // #region Initial variables 
        var _this = this;
        // #endregion 

        // #region Get a private key from function parameter 
        if(typeof privateKey === "undefined")
            return new Promise(function(resolve, reject) { reject("Need to provide a private key for signing"); });
        // #endregion 

        // #region Get hashing algorithm 
        if(typeof hashAlgorithm === "undefined")
            hashAlgorithm = "SHA-1";
        else
        {
            // #region Simple check for supported algorithm 
            var oid = in_window.org.pkijs.getOIDByAlgorithm({ name: hashAlgorithm });
            if(oid === "")
                return new Promise(function(resolve, reject) { reject("Unsupported hash algorithm: " + hashAlgorithm); });
            // #endregion 
        }
        // #endregion 

        // #region Get a "default parameters" for current algorithm 
        var defParams = in_window.org.pkijs.getAlgorithmParameters(privateKey.algorithm.name, "sign");
        defParams.algorithm.hash.name = hashAlgorithm;
        // #endregion 

        // #region Fill internal structures base on "privateKey" and "hashAlgorithm" 
        switch(privateKey.algorithm.name.toUpperCase())
        {
            case "RSASSA-PKCS1-V1_5":
            case "ECDSA":
                _this.signature.algorithm_id = in_window.org.pkijs.getOIDByAlgorithm(defParams.algorithm);
                _this.signatureAlgorithm.algorithm_id = _this.signature.algorithm_id;
                break;
            case "RSA-PSS":
                {
                    // #region Set "saltLength" as a length (in octets) of hash function result 
                    switch(hashAlgorithm.toUpperCase())
                    {
                        case "SHA-256":
                            defParams.algorithm.saltLength = 32;
                            break;
                        case "SHA-384":
                            defParams.algorithm.saltLength = 48;
                            break;
                        case "SHA-512":
                            defParams.algorithm.saltLength = 64;
                            break;
                        default:;
                    }
                    // #endregion 

                    // #region Fill "RSASSA_PSS_params" object 
                    var paramsObject = {};

                    if(hashAlgorithm.toUpperCase() !== "SHA-1")
                    {
                        var hashAlgorithmOID = in_window.org.pkijs.getOIDByAlgorithm({ name: hashAlgorithm });
                        if(hashAlgorithmOID === "")
                            return new Promise(function(resolve, reject) { reject("Unsupported hash algorithm: " + hashAlgorithm); });

                        paramsObject.hashAlgorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER({
                            algorithm_id: hashAlgorithmOID,
                            algorithm_params: new in_window.org.pkijs.asn1.NULL()
                        });

                        paramsObject.maskGenAlgorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER({
                            algorithm_id: "1.2.840.113549.1.1.8", // MGF1
                            algorithm_params: paramsObject.hashAlgorithm.toSchema()
                        })
                    }

                    if(defParams.algorithm.saltLength !== 20)
                        paramsObject.saltLength = defParams.algorithm.saltLength;

                    var pssParameters = new in_window.org.pkijs.simpl.x509.RSASSA_PSS_params(paramsObject);
                    // #endregion   

                    // #region Automatically set signature algorithm 
                    _this.signature = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER({
                        algorithm_id: "1.2.840.113549.1.1.10",
                        algorithm_params: pssParameters.toSchema()
                    });
                    _this.signatureAlgorithm = _this.signature; // Must be the same
                    // #endregion 
                }
                break;
            default:
                return new Promise(function(resolve, reject) { reject("Unsupported signature algorithm: " + privateKey.algorithm.name); });
        }
        // #endregion 

        // #region Create TBS data for signing 
        _this.tbs = in_window.org.pkijs.simpl.CERT.prototype.encodeTBS.call(this).toBER(false);
        // #endregion 

        // #region Get a "crypto" extension 
        var crypto = in_window.org.pkijs.getCrypto();
        if(typeof crypto == "undefined")
            return new Promise(function(resolve, reject) { reject("Unable to create WebCrypto object"); });
        // #endregion 

        // #region Signing TBS data on provided private key 
        return crypto.sign(defParams.algorithm,
            privateKey,
            new Uint8Array(_this.tbs)).then(
            function(result)
            {
                // #region Special case for ECDSA algorithm 
                if(defParams.algorithm.name === "ECDSA")
                    result = in_window.org.pkijs.createCMSECDSASignature(result);
                // #endregion 

                _this.signatureValue = new in_window.org.pkijs.asn1.BITSTRING({ value_hex: result });
            },
            function(error)
            {
                return new Promise(function(resolve, reject) { reject("Signing error: " + error); });
            }
            );
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.CERT.prototype.getPublicKey =
    function()
    {
        /// <summary>Importing public key for current certificate</summary>

        // #region Initial variables 
        var algorithm;
        // #endregion 

        // #region Get a "crypto" extension 
        var crypto = in_window.org.pkijs.getCrypto();
        if(typeof crypto == "undefined")
            return new Promise(function(resolve, reject) { reject("Unable to create WebCrypto object"); });
        // #endregion 

        // #region Find correct algorithm for imported public key 
        if(arguments[0] instanceof Object)
        {
            if("algorithm" in arguments[0])
                algorithm = arguments[0].algorithm;
            else
                return new Promise(function(resolve, reject) { reject("Absent mandatory parameter \"algorithm\""); });
        }
        else
        {
            // #region Find signer's hashing algorithm 
            var sha_algorithm = in_window.org.pkijs.getHashAlgorithm(this.signatureAlgorithm);
            if(sha_algorithm === "")
                return new Promise(function(resolve, reject) { reject("Unsupported signature algorithm: " + this.signatureAlgorithm.algorithm_id); });
            // #endregion   

            // #region Get information about public key algorithm and default parameters for import
            var algorithmObject = in_window.org.pkijs.getAlgorithmByOID(this.signatureAlgorithm.algorithm_id);
            if(("name" in algorithmObject) === false)
                return new Promise(function(resolve, reject) { reject("Unsupported public key algorithm: " + this.signatureAlgorithm.algorithm_id); });

            var algorithm_name = algorithmObject.name;

            algorithm = in_window.org.pkijs.getAlgorithmParameters(algorithm_name, "importkey");
            if("hash" in algorithm.algorithm)
                algorithm.algorithm.hash.name = sha_algorithm;
            // #endregion 
        }
        // #endregion 

        // #region Get neccessary values from internal fields for current certificate 
        var publicKeyInfo_schema = this.subjectPublicKeyInfo.toSchema();
        var publicKeyInfo_buffer = publicKeyInfo_schema.toBER(false);
        var publicKeyInfo_view = new Uint8Array(publicKeyInfo_buffer);
        // #endregion 

        return crypto.importKey("spki", publicKeyInfo_view, algorithm.algorithm, true, algorithm.usages);
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.CERT.prototype.getKeyHash =
    function()
    {
        /// <summary>Get SHA-1 hash value for subject public key</summary>

        // #region Get a "crypto" extension 
        var crypto = in_window.org.pkijs.getCrypto();
        if(typeof crypto == "undefined")
            return new Promise(function(resolve, reject) { reject("Unable to create WebCrypto object"); });
        // #endregion 

        return crypto.digest({ name: "sha-1" }, new Uint8Array(this.subjectPublicKeyInfo.subjectPublicKey.value_block.value_hex));
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.CERT.prototype.toJSON =
    function()
    {
        var _object = {
            tbs: in_window.org.pkijs.bufferToHexCodes(this.tbs, 0, this.tbs.byteLength),
            serialNumber: this.serialNumber.toJSON(),
            signature: this.signature.toJSON(),
            issuer: this.issuer.toJSON(),
            notBefore: this.notBefore.toJSON(),
            notAfter: this.notAfter.toJSON(),
            subject: this.subject.toJSON(),
            subjectPublicKeyInfo: this.subjectPublicKeyInfo.toJSON(),
            signatureAlgorithm: this.signatureAlgorithm.toJSON(),
            signatureValue: this.signatureValue.toJSON()
        };

        if("version" in this)
            _object.version = this.version;

        if("issuerUniqueID" in this)
            _object.issuerUniqueID = in_window.org.pkijs.bufferToHexCodes(this.issuerUniqueID, 0, this.issuerUniqueID.byteLength);

        if("subjectUniqueID" in this)
            _object.subjectUniqueID = in_window.org.pkijs.bufferToHexCodes(this.subjectUniqueID, 0, this.subjectUniqueID.byteLength);

        if("extensions" in this)
        {
            _object.extensions = new Array();

            for(var i = 0; i < this.extensions.length; i++)
                _object.extensions.push(this.extensions[i].toJSON());
        }

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "revoked certificate" type (to use in CRL)
    //**************************************************************************************
    in_window.org.pkijs.simpl.REV_CERT =
    function()
    {
        // #region Internal properties of the object 
        this.userCertificate = new in_window.org.pkijs.asn1.INTEGER();
        this.revocationDate = new in_window.org.pkijs.simpl.TIME();
        // OPTIONAL this.crlEntryExtensions = new Array(); // Array of "in_window.org.pkijs.simpl.EXTENSION");
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.REV_CERT.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.userCertificate = arguments[0].userCertificate || new in_window.org.pkijs.asn1.INTEGER();
                this.revocationDate = arguments[0].revocationDate || new in_window.org.pkijs.simpl.TIME();
                if("crlEntryExtensions" in arguments[0])
                    this.crlEntryExtensions = arguments[0].crlEntryExtensions;
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.REV_CERT.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            new in_window.org.pkijs.asn1.SEQUENCE({
                value: [
                    new in_window.org.pkijs.asn1.INTEGER({ name: "userCertificate" }),
                    in_window.org.pkijs.schema.TIME({
                        names: {
                            utcTimeName: "revocationDate",
                            generalTimeName: "revocationDate"
                    }
                    }),
                    in_window.org.pkijs.schema.EXTENSIONS({
                        names: {
                            block_name: "crlEntryExtensions"
                        }
                    }, true)
                ]
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for REV_CERT");
        // #endregion 

        // #region Get internal properties from parsed schema 
        this.userCertificate = asn1.result["userCertificate"];
        this.revocationDate = new in_window.org.pkijs.simpl.TIME({ schema: asn1.result["revocationDate"] });

        if("crlEntryExtensions" in asn1.result)
        {
            this.crlEntryExtensions = new Array();
            var exts = asn1.result["crlEntryExtensions"].value_block.value;

            for(var i = 0; i < exts.length; i++)
                this.crlEntryExtensions.push(new in_window.org.pkijs.simpl.EXTENSION({ schema: exts[i] }));
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.REV_CERT.prototype.toSchema =
    function()
    {
        // #region Create array for output sequence 
        var sequence_array = new Array();
        sequence_array.push(this.userCertificate);
        sequence_array.push(this.revocationDate.toSchema());

        if("crlEntryExtensions" in this)
        {
            var exts = new Array();

            for(var i = 0; i < this.crlEntryExtensions.length; i++)
                exts.push(this.crlEntryExtensions[i].toSchema());

            sequence_array.push(new in_window.org.pkijs.asn1.SEQUENCE({ value: exts }));
        }
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: sequence_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.REV_CERT.prototype.toJSON =
    function()
    {
        var _object = {
            userCertificate: this.userCertificate.toJSON(),
            revocationDate: this.revocationDate.toJSON
        };

        if("crlEntryExtensions" in this)
        {
            _object.crlEntryExtensions = new Array();

            for(var i = 0; i < this.crlEntryExtensions.length; i++)
                _object.crlEntryExtensions.push(this.crlEntryExtensions[i].toJSON());
        }

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for X.509 CRL (Certificate Revocation List)(RFC5280)  
    //**************************************************************************************
    in_window.org.pkijs.simpl.CRL =
    function()
    {
        // #region Internal properties of the object 
        // #region Properties from CRL TBS part 
        this.tbs = new ArrayBuffer(0);

        // OPTIONAL this.version = 1;
        this.signature = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER();
        this.issuer = new in_window.org.pkijs.simpl.RDN();
        this.thisUpdate = new in_window.org.pkijs.simpl.TIME();
        // OPTIONAL this.nextUpdate = new in_window.org.pkijs.simpl.TIME();
        // OPTIONAL this.revokedCertificates = new Array(); // Array of REV_CERT objects
        // OPTIONAL this.crlExtensions = new Array(); // Array of in_window.org.pkijs.simpl.EXTENSION();
        // #endregion 

        // #region Properties from CRL major part 
        this.signatureAlgorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER();
        this.signatureValue = new in_window.org.pkijs.asn1.BITSTRING();
        // #endregion 
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.CRL.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                // #region Properties from CRL TBS part 
                this.tbs = arguments[0].tbs || new ArrayBuffer(0);

                if("version" in arguments[0])
                    this.version = arguments[0].version;
                this.signature = arguments[0].signature || new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER();
                this.issuer = arguments[0].issuer || new in_window.org.pkijs.simpl.RDN();
                this.thisUpdate = arguments[0].thisUpdate || new in_window.org.pkijs.simpl.TIME();
                if("nextUpdate" in arguments[0])
                    this.nextUpdate = arguments[0].nextUpdate;
                if("revokedCertificates" in arguments[0])
                    this.revokedCertificates = arguments[0].revokedCertificates;
                if("crlExtensions" in arguments[0])
                    this.crlExtensions = arguments[0].crlExtensions;
                // #endregion 

                // #region Properties from CRL major part 
                this.signatureAlgorithm = arguments[0].signatureAlgorithm || new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER();
                this.signatureValue = arguments[0].signatureValue || new in_window.org.pkijs.asn1.BITSTRING();
                // #endregion 
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.CRL.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.CRL()
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for CRL");
        // #endregion 

        // #region Get internal properties from parsed schema 
        this.tbs = asn1.result["tbsCertList"].value_before_decode;

        if("tbsCertList.version" in asn1.result)
            this.version = asn1.result["tbsCertList.version"].value_block.value_dec;
        this.signature = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER({ schema: asn1.result["tbsCertList.signature"] });
        this.issuer = new in_window.org.pkijs.simpl.RDN({ schema: asn1.result["tbsCertList.issuer"] });
        this.thisUpdate = new in_window.org.pkijs.simpl.TIME({ schema: asn1.result["tbsCertList.thisUpdate"] });
        if("tbsCertList.nextUpdate" in asn1.result)
            this.nextUpdate = new in_window.org.pkijs.simpl.TIME({ schema: asn1.result["tbsCertList.nextUpdate"] });
        if("tbsCertList.revokedCertificates" in asn1.result)
        {
            this.revokedCertificates = new Array();

            var rev_certs = asn1.result["tbsCertList.revokedCertificates"];
            for(var i = 0; i < rev_certs.length; i++)
                this.revokedCertificates.push(new in_window.org.pkijs.simpl.REV_CERT({ schema: rev_certs[i] }));
        }
        if("tbsCertList.extensions" in asn1.result)
        {
            this.crlExtensions = new Array();
            var exts = asn1.result["tbsCertList.extensions"].value_block.value;

            for(var i = 0; i < exts.length; i++)
                this.crlExtensions.push(new in_window.org.pkijs.simpl.EXTENSION({ schema: exts[i] }));
        }

        this.signatureAlgorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER({ schema: asn1.result["signatureAlgorithm"] });
        this.signatureValue = asn1.result["signatureValue"];
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.CRL.prototype.encodeTBS =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        if("version" in this)
            output_array.push(new in_window.org.pkijs.asn1.INTEGER({ value: this.version }));

        output_array.push(this.signature.toSchema());
        output_array.push(this.issuer.toSchema());
        output_array.push(this.thisUpdate.toSchema())

        if("nextUpdate" in this)
            output_array.push(this.nextUpdate.toSchema());

        if("revokedCertificates" in this)
        {
            var rev_certificates = new Array();

            for(var i = 0; i < this.revokedCertificates.length; i++)
                rev_certificates.push(this.revokedCertificates[i].toSchema());

            output_array.push(new in_window.org.pkijs.asn1.SEQUENCE({
                value: rev_certificates
            }));
        }

        if("crlExtensions" in this)
        {
            var extensions = new Array();

            for(var j = 0; j < this.crlExtensions.length; j++)
                extensions.push(this.crlExtensions[j].toSchema());

            output_array.push(new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                optional: true,
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 0 // [0]
                },
                value: [
                    new in_window.org.pkijs.asn1.SEQUENCE({
                        value: extensions
                    })
                ]
            }));
        }
        // #endregion 

        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.CRL.prototype.toSchema =
    function(encodeFlag)
    {
        /// <param name="encodeFlag" type="Boolean">If param equal to false then create TBS schema via decoding stored value. In othe case create TBS schema via assembling from TBS parts.</param>

        // #region Check "encodeFlag" 
        if(typeof encodeFlag === "undefined")
            encodeFlag = false;
        // #endregion 

        // #region Decode stored TBS value 
        var tbs_schema;

        if(encodeFlag === false)
        {
            if(this.tbs.length === 0) // No stored TBS part
                return in_window.org.pkijs.schema.CRL();

            tbs_schema = in_window.org.pkijs.fromBER(this.tbs).result;
        }
        // #endregion 
        // #region Create TBS schema via assembling from TBS parts 
        else
            tbs_schema = in_window.org.pkijs.simpl.CRL.prototype.encodeTBS.call(this);
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: [
                tbs_schema,
                this.signatureAlgorithm.toSchema(),
                this.signatureValue
            ]
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.CRL.prototype.verify =
    function()
    {
        /// <summary>!!! Works well in Chrome dev versions only (April 2014th) !!!</summary>
        /// <returns type="Promise">Returns a new Promise object (in case of error), or a result of "crypto.subtle.veryfy" function</returns>

        // #region Global variables 
        var sequence = Promise.resolve();

        var signature = this.signatureValue;
        var tbs = this.tbs;

        var subjectPublicKeyInfo = -1;

        var _this = this;
        // #endregion 

        // #region Get information about CRL issuer certificate 
        if(arguments[0] instanceof Object)
        {
            if("issuerCertificate" in arguments[0]) // "issuerCertificate" must be of type "simpl.CERT"
                subjectPublicKeyInfo = arguments[0].issuerCertificate.subjectPublicKeyInfo;

            // #region In case if there is only public key during verification 
            if("publicKeyInfo" in arguments[0])
                subjectPublicKeyInfo = arguments[0].publicKeyInfo; // Must be of type "org.pkijs.simpl.PUBLIC_KEY_INFO"
            // #endregion 
        }

        if((subjectPublicKeyInfo instanceof in_window.org.pkijs.simpl.PUBLIC_KEY_INFO) === false)
            return new Promise(function(resolve, reject) { reject("Issuer's certificate must be provided as an input parameter"); });
        // #endregion 

        // #region Get a "crypto" extension 
        var crypto = in_window.org.pkijs.getCrypto();
        if(typeof crypto == "undefined")
            return new Promise(function(resolve, reject) { reject("Unable to create WebCrypto object"); });
        // #endregion 

        // #region Find signer's hashing algorithm 
        var sha_algorithm = in_window.org.pkijs.getHashAlgorithm(this.signatureAlgorithm);
        if(sha_algorithm === "")
            return new Promise(function(resolve, reject) { reject("Unsupported signature algorithm: " + _this.signatureAlgorithm.algorithm_id); });
        // #endregion 

        // #region Import public key 
        sequence = sequence.then(
            function()
            {
                // #region Get information about public key algorithm and default parameters for import
                var algorithmObject = in_window.org.pkijs.getAlgorithmByOID(_this.signature.algorithm_id);
                if(("name" in algorithmObject) === "")
                    return new Promise(function(resolve, reject) { reject("Unsupported public key algorithm: " + _this.signature.algorithm_id); });

                var algorithm_name = algorithmObject.name;

                var algorithm = in_window.org.pkijs.getAlgorithmParameters(algorithm_name, "importkey");
                if("hash" in algorithm.algorithm)
                    algorithm.algorithm.hash.name = sha_algorithm;
                // #endregion 

                var publicKeyInfo_schema = subjectPublicKeyInfo.toSchema();
                var publicKeyInfo_buffer = publicKeyInfo_schema.toBER(false);
                var publicKeyInfo_view = new Uint8Array(publicKeyInfo_buffer);

                return crypto.importKey("spki",
                    publicKeyInfo_view,
                    algorithm.algorithm,
                    true,
                    algorithm.usages);
            }
            );
        // #endregion 

        // #region Verify signature for the certificate 
        sequence = sequence.then(
            function(publicKey)
            {
                // #region Get default algorithm parameters for verification 
                var algorithm = in_window.org.pkijs.getAlgorithmParameters(publicKey.algorithm.name, "verify");
                if("hash" in algorithm.algorithm)
                    algorithm.algorithm.hash.name = sha_algorithm;
                // #endregion 

                // #region Special case for ECDSA signatures 
                var signature_value = signature.value_block.value_hex;

                if(publicKey.algorithm.name === "ECDSA")
                {
                    var asn1 = in_window.org.pkijs.fromBER(signature_value);
                    signature_value = in_window.org.pkijs.createECDSASignatureFromCMS(asn1.result);
                }
                // #endregion 

                // #region Special case for RSA-PSS 
                if(publicKey.algorithm.name === "RSA-PSS")
                {
                    var pssParameters;

                    try
                    {
                        pssParameters = new in_window.org.pkijs.simpl.x509.RSASSA_PSS_params({ schema: _this.signatureAlgorithm.algorithm_params });
                    }
                    catch(ex)
                    {
                        return new Promise(function(resolve, reject) { reject(ex); });
                    }

                    if("saltLength" in pssParameters)
                        algorithm.algorithm.saltLength = pssParameters.saltLength;
                    else
                        algorithm.algorithm.saltLength = 20;

                    var hash_algo = "SHA-1";

                    if("hashAlgorithm" in pssParameters)
                    {
                        var hashAlgorithm = in_window.org.pkijs.getAlgorithmByOID(pssParameters.hashAlgorithm.algorithm_id);
                        if(("name" in hashAlgorithm) === false)
                            return new Promise(function(resolve, reject) { reject("Unrecognized hash algorithm: " + pssParameters.hashAlgorithm.algorithm_id); });

                        hash_algo = hashAlgorithm.name;
                    }

                    algorithm.algorithm.hash.name = hash_algo;
                }
                // #endregion 

                return crypto.verify(algorithm.algorithm,
                    publicKey,
                    new Uint8Array(signature_value),
                    new Uint8Array(tbs));
            }
            );
        // #endregion 

        return sequence;
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.CRL.prototype.sign =
    function(privateKey, hashAlgorithm)
    {
        /// <param name="privateKey" type="Key">Private key for "subjectPublicKeyInfo" structure</param>
        /// <param name="hashAlgorithm" type="String" optional="true">Hashing algorithm. Default SHA-1</param>

        // #region Initial variables 
        var _this = this;
        // #endregion 

        // #region Get a private key from function parameter 
        if(typeof privateKey === "undefined")
            return new Promise(function(resolve, reject) { reject("Need to provide a private key for signing"); });
        // #endregion 

        // #region Get hashing algorithm 
        if(typeof hashAlgorithm === "undefined")
            hashAlgorithm = "SHA-1";
        else
        {
            // #region Simple check for supported algorithm 
            var oid = in_window.org.pkijs.getOIDByAlgorithm({ name: hashAlgorithm });
            if(oid === "")
                return new Promise(function(resolve, reject) { reject("Unsupported hash algorithm: " + hashAlgorithm); });
            // #endregion 
        }
        // #endregion 

        // #region Get a "default parameters" for current algorithm 
        var defParams = in_window.org.pkijs.getAlgorithmParameters(privateKey.algorithm.name, "sign");
        defParams.algorithm.hash.name = hashAlgorithm;
        // #endregion 

        // #region Fill internal structures base on "privateKey" and "hashAlgorithm" 
        switch(privateKey.algorithm.name.toUpperCase())
        {
            case "RSASSA-PKCS1-V1_5":
            case "ECDSA":
                _this.signature.algorithm_id = in_window.org.pkijs.getOIDByAlgorithm(defParams.algorithm);
                _this.signatureAlgorithm.algorithm_id = _this.signature.algorithm_id;
                break;
            case "RSA-PSS":
                {
                    // #region Set "saltLength" as a length (in octets) of hash function result 
                    switch(hashAlgorithm.toUpperCase())
                    {
                        case "SHA-256":
                            defParams.algorithm.saltLength = 32;
                            break;
                        case "SHA-384":
                            defParams.algorithm.saltLength = 48;
                            break;
                        case "SHA-512":
                            defParams.algorithm.saltLength = 64;
                            break;
                        default:;
                    }
                    // #endregion 

                    // #region Fill "RSASSA_PSS_params" object 
                    var paramsObject = {};

                    if(hashAlgorithm.toUpperCase() !== "SHA-1")
                    {
                        var hashAlgorithmOID = in_window.org.pkijs.getOIDByAlgorithm({ name: hashAlgorithm });
                        if(hashAlgorithmOID === "")
                            return new Promise(function(resolve, reject) { reject("Unsupported hash algorithm: " + hashAlgorithm); });

                        paramsObject.hashAlgorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER({
                            algorithm_id: hashAlgorithmOID,
                            algorithm_params: new in_window.org.pkijs.asn1.NULL()
                        });

                        paramsObject.maskGenAlgorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER({
                            algorithm_id: "1.2.840.113549.1.1.8", // MGF1
                            algorithm_params: paramsObject.hashAlgorithm.toSchema()
                        })
                    }

                    if(defParams.algorithm.saltLength !== 20)
                        paramsObject.saltLength = defParams.algorithm.saltLength;

                    var pssParameters = new in_window.org.pkijs.simpl.x509.RSASSA_PSS_params(paramsObject);
                    // #endregion   

                    // #region Automatically set signature algorithm 
                    _this.signature = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER({
                        algorithm_id: "1.2.840.113549.1.1.10",
                        algorithm_params: pssParameters.toSchema()
                    });
                    _this.signatureAlgorithm = _this.signature; // Must be the same
                    // #endregion 
                }
                break;
            default:
                return new Promise(function(resolve, reject) { reject("Unsupported signature algorithm: " + privateKey.algorithm.name); });
        }
        // #endregion 

        // #region Create TBS data for signing 
        _this.tbs = in_window.org.pkijs.simpl.CRL.prototype.encodeTBS.call(this).toBER(false);
        // #endregion 

        // #region Get a "crypto" extension 
        var crypto = in_window.org.pkijs.getCrypto();
        if(typeof crypto == "undefined")
            return new Promise(function(resolve, reject) { reject("Unable to create WebCrypto object"); });
        // #endregion 

        // #region Signing TBS data on provided private key 
        return crypto.sign(
            defParams.algorithm,
            privateKey,
            new Uint8Array(_this.tbs)).
            then(
            function(result)
            {
                // #region Special case for ECDSA algorithm 
                if(defParams.algorithm.name === "ECDSA")
                    result = in_window.org.pkijs.createCMSECDSASignature(result);
                // #endregion 

                _this.signatureValue = new in_window.org.pkijs.asn1.BITSTRING({ value_hex: result });
            },
            function(error)
            {
                return new Promise(function(resolve, reject) { reject("Signing error: " + error); });
            }
            );
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.CRL.prototype.isCertificateRevoked =
    function()
    {
        // #region Get input certificate 
        var certificate = {};

        if(arguments[0] instanceof Object)
        {
            if("certificate" in arguments[0])
                certificate = arguments[0].certificate;
        }

        if((certificate instanceof in_window.org.pkijs.simpl.CERT) === false)
            return false;
        // #endregion 

        // #region Check that issuer of the input certificate is the same with issuer of this CRL 
        if(this.issuer.isEqual(certificate.issuer) === false)
            return false;
        // #endregion 

        // #region Check that there are revoked certificates in this CRL 
        if(("revokedCertificates" in this) === false)
            return false;
        // #endregion 

        // #region Search for input certificate in revoked certificates array 
        for(var i = 0; i < this.revokedCertificates.length; i++)
        {
            if(this.revokedCertificates[i].userCertificate.isEqual(certificate.serialNumber))
                return true;
        }
        // #endregion 

        return false;
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.CRL.prototype.toJSON =
    function()
    {
        var _object = {
            tbs: in_window.org.pkijs.bufferToHexCodes(this.tbs, 0, this.tbs.byteLength),
            signature: this.signature.toJSON(),
            issuer: this.issuer.toJSON(),
            thisUpdate: this.thisUpdate.toJSON(),
            signatureAlgorithm: this.signatureAlgorithm.toJSON(),
            signatureValue: this.signatureValue.toJSON()
        };

        if("version" in this)
            _object.version = this.version;

        if("nextUpdate" in this)
            _object.nextUpdate = this.nextUpdate.toJSON();

        if("revokedCertificates" in this)
        {
            _object.revokedCertificates = new Array();

            for(var i = 0; i < this.revokedCertificates.length; i++)
                _object.revokedCertificates.push(this.revokedCertificates[i].toJSON());
        }

        if("crlExtensions" in this)
        {
            _object.crlExtensions = new Array();

            for(var i = 0; i < this.crlExtensions.length; i++)
                _object.crlExtensions.push(this.crlExtensions[i].toJSON());
        }

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for "Attribute" type
    //**************************************************************************************
    in_window.org.pkijs.simpl.ATTRIBUTE =
    function()
    {
        // #region Internal properties of the object 
        this.type = "";
        this.values = new Array();
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.ATTRIBUTE.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.type = arguments[0].type || "";
                this.values = arguments[0].values || new Array();
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.ATTRIBUTE.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.ATTRIBUTE({
                names: {
                    type: "type",
                    values: "values"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for ATTRIBUTE");
        // #endregion 

        // #region Get internal properties from parsed schema 
        this.type = asn1.result["type"].value_block.toString();
        this.values = asn1.result["values"];
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.ATTRIBUTE.prototype.toSchema =
    function()
    {
        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: [
                new in_window.org.pkijs.asn1.OID({ value: this.type }),
                new in_window.org.pkijs.asn1.SET({
                    value: this.values
                })
            ]
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.ATTRIBUTE.prototype.toJSON =
    function()
    {
        var _object = {
            type: this.type,
            values: new Array()
        };

        for(var i = 0; i < this.values.length; i++)
            _object.values.push(this.values[i].toJSON());

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for PKCS#10 certificate request
    //**************************************************************************************
    in_window.org.pkijs.simpl.PKCS10 =
    function()
    {
        // #region Internal properties of the object 
        this.tbs = new ArrayBuffer(0);

        this.version = 0;
        this.subject = new in_window.org.pkijs.simpl.RDN();
        this.subjectPublicKeyInfo = new in_window.org.pkijs.simpl.PUBLIC_KEY_INFO();
        // OPTIONAL this.attributes = new Array(); // Array of simpl.ATTRIBUTE objects

        this.signatureAlgorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER(); // Signature algorithm from certificate major part
        this.signatureValue = new in_window.org.pkijs.asn1.BITSTRING();
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.PKCS10.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.tbs = arguments[0].tbs || new ArrayBuffer(0);

                this.version = arguments[0].version || 0;
                this.subject = arguments[0].subject || new in_window.org.pkijs.simpl.RDN();
                this.subjectPublicKeyInfo = arguments[0].subjectPublicKeyInfo || new in_window.org.pkijs.simpl.PUBLIC_KEY_INFO();

                if("attributes" in arguments[0])
                    this.attributes = arguments[0].attributes;

                this.signatureAlgorithm = arguments[0].signatureAlgorithm || new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER(); // Signature algorithm from certificate major part
                this.signatureValue = arguments[0].signatureValue || new in_window.org.pkijs.asn1.BITSTRING();
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.PKCS10.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.PKCS10()
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for PKCS10");
        // #endregion 

        // #region Get internal properties from parsed schema 
        this.tbs = asn1.result["CertificationRequestInfo"].value_before_decode;

        this.version = asn1.result["CertificationRequestInfo.version"].value_block.value_dec;
        this.subject = new in_window.org.pkijs.simpl.RDN({ schema: asn1.result["CertificationRequestInfo.subject"] });
        this.subjectPublicKeyInfo = new in_window.org.pkijs.simpl.PUBLIC_KEY_INFO({ schema: asn1.result["CertificationRequestInfo.subjectPublicKeyInfo"] });
        if("CertificationRequestInfo.attributes" in asn1.result)
        {
            this.attributes = new Array();

            var attrs = asn1.result["CertificationRequestInfo.attributes"];
            for(var i = 0; i < attrs.length; i++)
                this.attributes.push(new in_window.org.pkijs.simpl.ATTRIBUTE({ schema: attrs[i] }));
        }

        this.signatureAlgorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER({ schema: asn1.result["signatureAlgorithm"] });
        this.signatureValue = asn1.result["signatureValue"];
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.PKCS10.prototype.encodeTBS =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        output_array.push(new in_window.org.pkijs.asn1.INTEGER({ value: this.version }));
        output_array.push(this.subject.toSchema());
        output_array.push(this.subjectPublicKeyInfo.toSchema());

        if("attributes" in this)
        {
            var attributes = new Array();

            for(var i = 0; i < this.attributes.length; i++)
                attributes.push(this.attributes[i].toSchema());

            output_array.push(new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 0 // [0]
                },
                value: attributes
            }));
        }
        // #endregion 

        return (new in_window.org.pkijs.asn1.SEQUENCE({ value: output_array }));
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.PKCS10.prototype.toSchema =
    function(encodeFlag)
    {
        /// <param name="encodeFlag" type="Boolean">If param equal to false then create TBS schema via decoding stored value. In othe case create TBS schema via assembling from TBS parts.</param>

        // #region Check "encodeFlag" 
        if(typeof encodeFlag === "undefined")
            encodeFlag = false;
        // #endregion 

        // #region Decode stored TBS value 
        var tbs_schema;

        if(encodeFlag === false)
        {
            if(this.tbs.length === 0) // No stored TBS part
                return in_window.org.pkijs.schema.PKCS10();

            tbs_schema = in_window.org.pkijs.fromBER(this.tbs).result;
        }
        // #endregion 
        // #region Create TBS schema via assembling from TBS parts 
        else
            tbs_schema = in_window.org.pkijs.simpl.PKCS10.prototype.encodeTBS.call(this);
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: [
                tbs_schema,
                this.signatureAlgorithm.toSchema(),
                this.signatureValue
            ]
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.PKCS10.prototype.verify =
    function()
    {
        /// <summary>!!! Works well in Chrome dev versions only (April 2014th) !!!</summary>
        /// <returns type="Promise">Returns a new Promise object (in case of error), or a result of "crypto.subtle.veryfy" function</returns>

        // #region Global variables 
        var _this = this;
        var sha_algorithm = "";

        var sequence = Promise.resolve();

        var subjectPublicKeyInfo = this.subjectPublicKeyInfo;
        var signature = this.signatureValue;
        var tbs = this.tbs;
        // #endregion 

        // #region Get a "crypto" extension 
        var crypto = in_window.org.pkijs.getCrypto();
        if(typeof crypto == "undefined")
            return new Promise(function(resolve, reject) { reject("Unable to create WebCrypto object"); });
        // #endregion 

        // #region Find a correct hashing algorithm 
        sha_algorithm = in_window.org.pkijs.getHashAlgorithm(this.signatureAlgorithm);
        if(sha_algorithm === "")
            return new Promise(function(resolve, reject) { reject("Unsupported signature algorithm: " + _this.signatureAlgorithm.algorithm_id); });
        // #endregion 

        // #region Importing public key 
        sequence = sequence.then(
            function()
            {
                // #region Get information about public key algorithm and default parameters for import
                var algorithmObject = in_window.org.pkijs.getAlgorithmByOID(_this.signatureAlgorithm.algorithm_id);
                if(("name" in algorithmObject) === false)
                    return new Promise(function(resolve, reject) { reject("Unsupported public key algorithm: " + _this.signatureAlgorithm.algorithm_id); });

                var algorithm_name = algorithmObject.name;

                var algorithm = in_window.org.pkijs.getAlgorithmParameters(algorithm_name, "importkey");
                if("hash" in algorithm.algorithm)
                    algorithm.algorithm.hash.name = sha_algorithm;
                // #endregion 

                var publicKeyInfo_schema = subjectPublicKeyInfo.toSchema();
                var publicKeyInfo_buffer = publicKeyInfo_schema.toBER(false);
                var publicKeyInfo_view = new Uint8Array(publicKeyInfo_buffer);

                return crypto.importKey("spki", publicKeyInfo_view, algorithm.algorithm, true, algorithm.usages);
            }
            );
        // #endregion 

        // #region Verify signature  
        sequence = sequence.then(
            function(publicKey)
            {
                // #region Get default algorithm parameters for verification 
                var algorithm = in_window.org.pkijs.getAlgorithmParameters(publicKey.algorithm.name, "verify");
                if("hash" in algorithm.algorithm)
                    algorithm.algorithm.hash.name = sha_algorithm;
                // #endregion 

                // #region Special case for ECDSA signatures 
                var signature_value = signature.value_block.value_hex;

                if(publicKey.algorithm.name === "ECDSA")
                {
                    var asn1 = in_window.org.pkijs.fromBER(signature_value);
                    signature_value = in_window.org.pkijs.createECDSASignatureFromCMS(asn1.result);
                }
                // #endregion 

                // #region Special case for RSA-PSS 
                if(publicKey.algorithm.name === "RSA-PSS")
                {
                    var pssParameters;

                    try
                    {
                        pssParameters = new in_window.org.pkijs.simpl.x509.RSASSA_PSS_params({ schema: _this.signatureAlgorithm.algorithm_params });
                    }
                    catch(ex)
                    {
                        return new Promise(function(resolve, reject) { reject(ex); });
                    }

                    if("saltLength" in pssParameters)
                        algorithm.algorithm.saltLength = pssParameters.saltLength;
                    else
                        algorithm.algorithm.saltLength = 20;

                    var hash_algo = "SHA-1";

                    if("hashAlgorithm" in pssParameters)
                    {
                        var hashAlgorithm = in_window.org.pkijs.getAlgorithmByOID(pssParameters.hashAlgorithm.algorithm_id);
                        if(("name" in hashAlgorithm) === false)
                            return new Promise(function(resolve, reject) { reject("Unrecognized hash algorithm: " + pssParameters.hashAlgorithm.algorithm_id); });

                        hash_algo = hashAlgorithm.name;
                    }

                    algorithm.algorithm.hash.name = hash_algo;
                }
                // #endregion 

                return crypto.verify(algorithm.algorithm,
                    publicKey,
                    new Uint8Array(signature_value),
                    new Uint8Array(tbs));
            }
            );
        // #endregion   

        return sequence;
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.PKCS10.prototype.sign =
    function(privateKey, hashAlgorithm)
    {
        /// <param name="privateKey" type="Key">Private key for "subjectPublicKeyInfo" structure</param>
        /// <param name="hashAlgorithm" type="String" optional="true">Hashing algorithm. Default SHA-1</param>

        // #region Initial variables 
        var _this = this;
        // #endregion 

        // #region Get a private key from function parameter 
        if(typeof privateKey === "undefined")
            return new Promise(function(resolve, reject) { reject("Need to provide a private key for signing"); });
        // #endregion 

        // #region Get hashing algorithm 
        if(typeof hashAlgorithm === "undefined")
            hashAlgorithm = "SHA-1";
        else
        {
            // #region Simple check for supported algorithm 
            var oid = in_window.org.pkijs.getOIDByAlgorithm({ name: hashAlgorithm });
            if(oid === "")
                return new Promise(function(resolve, reject) { reject("Unsupported hash algorithm: " + hashAlgorithm); });
            // #endregion 
        }
        // #endregion 

        // #region Get a "default parameters" for current algorithm 
        var defParams = in_window.org.pkijs.getAlgorithmParameters(privateKey.algorithm.name, "sign");
        defParams.algorithm.hash.name = hashAlgorithm;
        // #endregion 

        // #region Fill internal structures base on "privateKey" and "hashAlgorithm" 
        switch(privateKey.algorithm.name.toUpperCase())
        {
            case "RSASSA-PKCS1-V1_5":
            case "ECDSA":
                _this.signatureAlgorithm.algorithm_id = in_window.org.pkijs.getOIDByAlgorithm(defParams.algorithm);
                break;
            case "RSA-PSS":
                {
                    // #region Set "saltLength" as a length (in octets) of hash function result 
                    switch(hashAlgorithm.toUpperCase())
                    {
                        case "SHA-256":
                            defParams.algorithm.saltLength = 32;
                            break;
                        case "SHA-384":
                            defParams.algorithm.saltLength = 48;
                            break;
                        case "SHA-512":
                            defParams.algorithm.saltLength = 64;
                            break;
                        default:;
                    }
                    // #endregion 

                    // #region Fill "RSASSA_PSS_params" object 
                    var paramsObject = {};

                    if(hashAlgorithm.toUpperCase() !== "SHA-1")
                    {
                        var hashAlgorithmOID = in_window.org.pkijs.getOIDByAlgorithm({ name: hashAlgorithm });
                        if(hashAlgorithmOID === "")
                            return new Promise(function(resolve, reject) { reject("Unsupported hash algorithm: " + hashAlgorithm); });

                        paramsObject.hashAlgorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER({
                            algorithm_id: hashAlgorithmOID,
                            algorithm_params: new in_window.org.pkijs.asn1.NULL()
                        });

                        paramsObject.maskGenAlgorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER({
                            algorithm_id: "1.2.840.113549.1.1.8", // MGF1
                            algorithm_params: paramsObject.hashAlgorithm.toSchema()
                        })
                    }

                    if(defParams.algorithm.saltLength !== 20)
                        paramsObject.saltLength = defParams.algorithm.saltLength;

                    var pssParameters = new in_window.org.pkijs.simpl.x509.RSASSA_PSS_params(paramsObject);
                    // #endregion   

                    // #region Automatically set signature algorithm 
                    _this.signatureAlgorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER({
                        algorithm_id: "1.2.840.113549.1.1.10",
                        algorithm_params: pssParameters.toSchema()
                    });
                    // #endregion 
                }
                break;
            default:
                return new Promise(function(resolve, reject) { reject("Unsupported signature algorithm: " + privateKey.algorithm.name); });
        }
        // #endregion 

        // #region Create TBS data for signing 
        _this.tbs = in_window.org.pkijs.simpl.PKCS10.prototype.encodeTBS.call(this).toBER(false);
        // #endregion 

        // #region Get a "crypto" extension 
        var crypto = in_window.org.pkijs.getCrypto();
        if(typeof crypto == "undefined")
            return new Promise(function(resolve, reject) { reject("Unable to create WebCrypto object"); });
        // #endregion 

        // #region Signing TBS data on provided private key 
        return crypto.sign(defParams.algorithm,
            privateKey,
            new Uint8Array(_this.tbs)).then(
            function(result)
            {
                // #region Special case for ECDSA algorithm 
                if(defParams.algorithm.name === "ECDSA")
                    result = in_window.org.pkijs.createCMSECDSASignature(result);
                // #endregion 

                _this.signatureValue = new in_window.org.pkijs.asn1.BITSTRING({ value_hex: result });
            },
            function(error)
            {
                return new Promise(function(resolve, reject) { reject("Signing error: " + error); });
            }
            );
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.PKCS10.prototype.toJSON =
    function()
    {
        var _object = {
            tbs: in_window.org.pkijs.bufferToHexCodes(this.tbs, 0, this.tbs.byteLength),
            version: this.version,
            subject: this.subject.toJSON(),
            subjectPublicKeyInfo: this.subjectPublicKeyInfo.toJSON(),
            signatureAlgorithm: this.signatureAlgorithm.toJSON(),
            signatureValue: this.signatureValue.toJSON()
        };

        if("attributes" in this)
        {
            _object.attributes = new Array();

            for(var i = 0; i < this.attributes.length; i++)
                _object.attributes.push(this.attributes[i].toJSON());
        }

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for PKCS#8 private key bag
    //**************************************************************************************
    in_window.org.pkijs.simpl.PKCS8 =
    function()
    {
        // #region Internal properties of the object 
        this.version = 0;
        this.privateKeyAlgorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER();
        this.privateKey = new in_window.org.pkijs.asn1.OCTETSTRING();
        // OPTIONAL this.attributes // Array of "in_window.org.pkijs.simpl.ATTRIBUTE"
        // #endregion 

        // #region If input argument array contains "schema" for this object 
        if((arguments[0] instanceof Object) && ("schema" in arguments[0]))
            in_window.org.pkijs.simpl.PKCS8.prototype.fromSchema.call(this, arguments[0].schema);
        // #endregion 
        // #region If input argument array contains "native" values for internal properties 
        else
        {
            if(arguments[0] instanceof Object)
            {
                this.version = arguments[0].version || 0;
                this.privateKeyAlgorithm = arguments[0].privateKeyAlgorithm || new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER();
                this.privateKey = arguments[0].privateKey || new in_window.org.pkijs.asn1.OCTETSTRING();

                if("attributes" in arguments[0])
                    this.attributes = arguments[0].attributes;
            }
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.PKCS8.prototype.fromSchema =
    function(schema)
    {
        // #region Check the schema is valid 
        var asn1 = in_window.org.pkijs.compareSchema(schema,
            schema,
            in_window.org.pkijs.schema.PKCS8({
                names: {
                    version: "version",
                    privateKeyAlgorithm: {
                        names: {
                            block_name: "privateKeyAlgorithm"
                        }
                    },
                    privateKey: "privateKey",
                    attributes: "attributes"
                }
            })
            );

        if(asn1.verified === false)
            throw new Error("Object's schema was not verified against input data for PKCS8");
        // #endregion 

        // #region Get internal properties from parsed schema 
        this.version = asn1.result["version"].value_block.value_dec;
        this.privateKeyAlgorithm = new in_window.org.pkijs.simpl.ALGORITHM_IDENTIFIER({ schema: asn1.result["privateKeyAlgorithm"] });
        this.privateKey = asn1.result["privateKey"];

        if("attributes" in asn1.result)
        {
            this.attributes = new Array();
            var attrs = asn1.result["attributes"];

            for(var i = 0; i < attrs.length; i++)
                this.attributes.push(new in_window.org.pkijs.simpl.ATTRIBUTE({ schema: attrs[i] }));
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.PKCS8.prototype.toSchema =
    function()
    {
        // #region Create array for output sequence 
        var output_array = new Array();

        output_array.push(new in_window.org.pkijs.asn1.INTEGER({ value: this.version }));
        output_array.push(this.privateKeyAlgorithm.toSchema());
        output_array.push(this.privateKey);

        if("attributes" in this)
        {
            var attrs = new Array();

            for(var i = 0; i < this.attributes.length; i++)
                attrs.push(this.attributes[i].toSchema());

            output_array.push(new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED({
                optional: true,
                id_block: {
                    tag_class: 3, // CONTEXT-SPECIFIC
                    tag_number: 0 // [0]
                },
                value: attrs
            }));
        }
        // #endregion 

        // #region Construct and return new ASN.1 schema for this object 
        return (new in_window.org.pkijs.asn1.SEQUENCE({
            value: output_array
        }));
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.PKCS8.prototype.toJSON =
    function()
    {
        var _object = {
            version: this.version,
            privateKeyAlgorithm: this.privateKeyAlgorithm.toJSON(),
            privateKey: this.privateKey.toJSON()
        };

        if("attributes" in this)
        {
            _object.attributes = new Array();

            for(var i = 0; i < this.attributes.length; i++)
                _object.attributes.push(this.attributes[i].toJSON());
        }

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Simplified structure for working with X.509 certificate chains 
    //**************************************************************************************
    in_window.org.pkijs.simpl.CERT_CHAIN =
    function()
    {
        // #region Internal properties of the object 
        /// <field name="trusted_certs" type="Array" elementType="in_window.org.pkijs.simpl.CERT">Array of pre-defined trusted (by user) certificates</field>
        this.trusted_certs = new Array();
        /// <field name="certs" type="Array" elementType="in_window.org.pkijs.simpl.CERT">Array with certificate chain. Could be only one end-user certificate in there!</field>
        this.certs = new Array(); 
        /// <field name="crls" type="Array" elementType="in_window.org.pkijs.simpl.CRL">Array of all CRLs for all certificates from certificate chain</field>
        this.crls = new Array(); 
        // #endregion 

        // #region Initialize internal properties by input values
        if(arguments[0] instanceof Object)
        {
            this.trusted_certs = arguments[0].trusted_certs || new Array();
            this.certs = arguments[0].certs || new Array();
            this.crls = arguments[0].crls || new Array();
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.CERT_CHAIN.prototype.sort =
    function()
    {
        // #region Initial variables 
        /// <var type="Array" elementType="in_window.org.pkijs.simpl.CERT">Array of sorted certificates</var>
        var sorted_certs = new Array();

        /// <var type="Array" elementType="in_window.org.pkijs.simpl.CERT">Initial array of certificates</var>
        var certs = this.certs.slice(0); // Explicity copy "this.certs"

        /// <var type="Date">Date for checking certificate validity period</var>
        var check_date = new Date();

        var _this = this;
        // #endregion 

        // #region Initial checks 
        if(certs.length === 0)
            return new Promise(function(resolve, reject)
            {
                reject({
                    result: false,
                    result_code: 2,
                    result_message: "Certificate's array can not be empty"
                });
            });
        // #endregion 

        // #region Find end-user certificate 
        var end_user_index = -1;

        for(var i = 0; i < certs.length; i++)
        {
            var isCA = false;

            if("extensions" in certs[i])
            {
                var mustBeCA = false;
                var keyUsagePresent = false;
                var cRLSign = false;

                for(var j = 0; j < certs[i].extensions.length; j++)
                {
                    if((certs[i].extensions[j].critical === true) &&
                       (("parsedValue" in certs[i].extensions[j]) === false))
                    {
                        return new Promise(function(resolve, reject)
                        {
                            reject({
                                result: false,
                                result_code: 6,
                                result_message: "Unable to parse critical certificate extension: " + certs[i].extensions[j].extnID
                            });
                        });
                    }

                    if(certs[i].extensions[j].extnID === "2.5.29.15") // KeyUsage
                    {
                        keyUsagePresent = true;

                        var view = new Uint8Array(certs[i].extensions[j].parsedValue.value_block.value_hex);

                        if((view[0] & 0x04) === 0x04) // Set flag "keyCertSign"
                            mustBeCA = true;

                        if((view[0] & 0x02) === 0x02) // Set flag "cRLSign"
                            cRLSign = true;
                    }

                    if(certs[i].extensions[j].extnID === "2.5.29.19") // BasicConstraints
                    {
                        if("cA" in certs[i].extensions[j].parsedValue)
                        {
                            if(certs[i].extensions[j].parsedValue.cA === true)
                                isCA = true;
                        }
                    }
                }

                if((mustBeCA === true) && (isCA === false))
                    return new Promise(function(resolve, reject)
                    {
                        reject({
                            result: false,
                            result_code: 3,
                            result_message: "Unable to build certificate chain - using \"keyCertSign\" flag set without BasicConstaints"
                        });
                    });

                if((keyUsagePresent === true) && (isCA === true) && (mustBeCA === false))
                    return new Promise(function(resolve, reject)
                    {
                        reject({
                            result: false,
                            result_code: 4,
                            result_message: "Unable to build certificate chain - \"keyCertSign\" flag was not set"
                        });
                    });

                if((isCA === true) && (keyUsagePresent === true) && (cRLSign === false))
                    return new Promise(function(resolve, reject)
                    {
                        reject({
                            result: false,
                            result_code: 5,
                            result_message: "Unable to build certificate chain - intermediate certificate must have \"cRLSign\" key usage flag"
                        });
                    });
            }

            if(isCA === false)
            {
                if(sorted_certs.length !== 0)
                    return new Promise(function(resolve, reject)
                    {
                        reject({
                            result: false,
                            result_code: 7,
                            result_message: "Unable to build certificate chain - more than one possible end-user certificate"
                        });
                    });

                sorted_certs.push(certs[i]);
                end_user_index = i;
            }
        }

        certs.splice(end_user_index, 1);
        // #endregion 

        // #region Check that end-user certificate was found 
        if(sorted_certs.length === 0)
            return new Promise(function(resolve, reject)
            {
                reject({
                    result: false,
                    result_code: 1,
                    result_message: "Can't find end-user certificate"
                });
            });
        // #endregion 

        // #region Return if there is only one certificate in certificate's array 
        if(certs.length === 0)
        {
            if(sorted_certs[0].issuer.isEqual(sorted_certs[0].subject) === true)
                return new Promise(function(resolve, reject) { resolve(sorted_certs); });
            else
            {
                if(this.trusted_certs.length === 0)
                {
                    return new Promise(function(resolve, reject)
                    {
                        reject({
                            result: false,
                            result_code: 70,
                            result_message: "Can't find root certificate"
                        });
                    });
                }
                else
                {
                    certs = _this.trusted_certs.splice(0);
                }
            }

        }
        // #endregion 

        /// <var type="in_window.org.pkijs.simpl.CERT">Current certificate (to find issuer for)</var>
        var current_certificate = sorted_certs[0];

        // #region Auxiliary functions working with Promises
        function basic(subject_certificate, issuer_certificate)
        {
            /// <summary>Basic certificate checks</summary>
            /// <param name="subject_certificate" type="in_window.org.pkijs.simpl.CERT">Certificate for testing (subject)</param>
            /// <param name="issuer_certificate" type="in_window.org.pkijs.simpl.CERT">Certificate for issuer of subject certificate</param>

            // #region Initial variables 
            var sequence = Promise.resolve()
            // #endregion 

            // #region Check validity period for subject certificate 
            sequence = sequence.then(
                function()
                {
                    if((subject_certificate.notBefore.value > check_date) ||
                       (subject_certificate.notAfter.value < check_date))
                    {
                        return new Promise(function(resolve, reject)
                        {
                            reject({
                                result: false,
                                result_code: 8,
                                result_message: "Certificate validity period is out of checking date"
                            });
                        });
                    }
                }
                );
            // #endregion 

            // #region Give ability to not provide CRLs (all certificates assume to be valid) 
            if(_this.crls.length === 0)
                return sequence.then(
                    function()
                    {
                        return new Promise(function(resolve, reject) { resolve(); });
                    }
                    );
            // #endregion 

            // #region Find correct CRL for "issuer_certificate" 
            function find_crl(index)
            {
                return _this.crls[index].verify({ issuerCertificate: issuer_certificate }).then(
                    function(result)
                    {
                        if(result === true)
                            return new Promise(function(resolve, reject) { resolve(_this.crls[index]); });
                        else
                        {
                            index++;

                            if(index < _this.crls.length)
                                return find_crl(index);
                            else
                                return new Promise(function(resolve, reject)
                                {
                                    reject({
                                        result: false,
                                        result_code: 9,
                                        result_message: "Unable to find CRL for issuer's certificate"
                                    });
                                });
                        }
                    },
                    function(error)
                    {
                        return new Promise(function(resolve, reject)
                        {
                            reject({
                                result: false,
                                result_code: 10,
                                result_message: "Unable to find CRL for issuer's certificate"
                            });
                        });
                    }
                    );
            }

            sequence = sequence.then(
                function()
                {
                    return find_crl(0);
                }
                );
            // #endregion 

            // #region Check that subject certificate is not in the CRL 
            sequence = sequence.then(
                function(crl)
                {
                    /// <param name="crl" type="in_window.org.pkijs.simpl.CRL">CRL for issuer's certificate</param>                

                    if(crl.isCertificateRevoked({ certificate: subject_certificate }) === true)
                        return new Promise(function(resolve, reject)
                        {
                            reject({
                                result: false,
                                result_code: 11,
                                result_message: "Subject certificate was revoked"
                            });
                        });
                    else
                        return new Promise(function(resolve, reject) { resolve(); });
                },
                function(error)
                {
                    /// <summary>Not for all certificates we have a CRL. So, this "stub" is for handling such situation - assiming we have a valid, non-revoked certificate</summary>
                    return new Promise(function(resolve, reject) { resolve(); });
                }
                );
            // #endregion 

            return sequence;
        }

        function outer()
        {
            return inner(current_certificate, 0).then(
                function(index)
                {
                    sorted_certs.push(certs[index]);
                    current_certificate = certs[index];

                    certs.splice(index, 1);

                    if(current_certificate.issuer.isEqual(current_certificate.subject) === true)
                    {
                        // #region Check that the "self-signed" certificate there is in "trusted_certs" array 
                        var found = (_this.trusted_certs.length === 0) ? true : false; // If user did not set "trusted_certs" then we have an option to trust any self-signed certificate as root

                        for(var i = 0; i < _this.trusted_certs.length; i++)
                        {
                            if((current_certificate.issuer.isEqual(_this.trusted_certs[i].issuer) === true) &&
                               (current_certificate.subject.isEqual(_this.trusted_certs[i].subject) === true) &&
                               (current_certificate.serialNumber.isEqual(_this.trusted_certs[i].serialNumber) === true))
                            {
                                found = true;
                                break;
                            }
                        }

                        if(found === false)
                            return new Promise(function(resolve, reject)
                            {
                                reject({
                                    result: false,
                                    result_code: 22,
                                    result_message: "Self-signed root certificate not in \"trusted certificates\" array"
                                });
                            });
                        // #endregion 

                        return (current_certificate.verify()).then( // Verifing last, self-signed certificate
                            function(result)
                            {
                                if(result === true)
                                    return basic(current_certificate, current_certificate).then(
                                        function()
                                        {
                                            return new Promise(function(resolve, reject) { resolve(sorted_certs); });
                                        },
                                        function(error)
                                        {
                                            return new Promise(function(resolve, reject)
                                            {
                                                reject({
                                                    result: false,
                                                    result_code: 12,
                                                    result_message: error
                                                });
                                            });
                                        }
                                        );
                                else
                                    return new Promise(function(resolve, reject)
                                    {
                                        reject({
                                            result: false,
                                            result_code: 13,
                                            result_message: "Unable to build certificate chain - signature of root certificate is invalid"
                                        });
                                    });
                            },
                            function(error)
                            {
                                return new Promise(function(resolve, reject)
                                {
                                    reject({
                                        result: false,
                                        result_code: 14,
                                        result_message: error
                                    });
                                });
                            }
                            );
                    }
                    else // In case if self-signed cert for the chain in the "trusted_certs" array
                    {
                        if(certs.length > 0)
                            return outer();
                        else
                        {
                            if(_this.trusted_certs.length !== 0)
                            {
                                certs = _this.trusted_certs.splice(0);
                                return outer();
                            }
                            else
                                return new Promise(function(resolve, reject)
                                {
                                    reject({
                                        result: false,
                                        result_code: 23,
                                        result_message: "Root certificate not found"
                                    });
                                });
                        }
                    }
                },
                function(error)
                {
                    return new Promise(function(resolve, reject)
                    {
                        reject(error);
                    });
                }
                );
        }

        function inner(current_certificate, index)
        {
            if(certs[index].subject.isEqual(current_certificate.issuer) === true)
            {
                return current_certificate.verify({ issuerCertificate: certs[index] }).then(
                    function(result)
                    {
                        if(result === true)
                        {
                            return basic(current_certificate, certs[index]).then(
                                function()
                                {
                                    return new Promise(function(resolve, reject) { resolve(index); });
                                },
                                function(error)
                                {
                                    return new Promise(function(resolve, reject)
                                    {
                                        reject({
                                            result: false,
                                            result_code: 16,
                                            result_message: error
                                        });
                                    });
                                }
                                );
                        }
                        else
                        {
                            if(index < (certs.length - 1))
                                return inner(current_certificate, index + 1);
                            else
                                return new Promise(function(resolve, reject)
                                {
                                    reject({
                                        result: false,
                                        result_code: 17,
                                        result_message: "Unable to build certificate chain - incomplete certificate chain or signature of some certificate is invalid"
                                    });
                                });
                        }
                    },
                    function(error)
                    {
                        return new Promise(function(resolve, reject)
                        {
                            reject({
                                result: false,
                                result_code: 18,
                                result_message: "Unable to build certificate chain - error during certificate signature verification"
                            });
                        });
                    }
                    );
            }
            else
            {
                if(index < (certs.length - 1))
                    return inner(current_certificate, index + 1);
                else
                    return new Promise(function(resolve, reject)
                    {
                        reject({
                            result: false,
                            result_code: 19,
                            result_message: "Unable to build certificate chain - incomplete certificate chain"
                        });
                    });
            }
        }
        // #endregion   

        // #region Find certificates for all issuers 
        return outer();
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.simpl.CERT_CHAIN.prototype.verify =
    function()
    {
        // #region Initial checks 
        if(this.certs.length === 0)
            return new Promise(function(resolve, reject) { reject("Empty certificate array"); });
        // #endregion 

        // #region Initial variables 
        var sequence = Promise.resolve();

        var _this = this;
        // #endregion 

        // #region Get input variables 
        var initial_policy_set = new Array();
        initial_policy_set.push("2.5.29.32.0"); // "anyPolicy"

        var initial_explicit_policy = false;
        var initial_policy_mapping_inhibit = false;
        var initial_inhibit_policy = false;

        var initial_permitted_subtrees_set = new Array(); // Array of "simpl.x509.GeneralSubtree"
        var initial_excluded_subtrees_set = new Array();  // Array of "simpl.x509.GeneralSubtree"
        var initial_required_name_forms = new Array();    // Array of "simpl.x509.GeneralSubtree"

        var verification_time = new Date();

        if(arguments[0] instanceof Object)
        {
            if("initial_policy_set" in arguments[0])
                initial_policy_set = arguments[0].initial_policy_set;

            if("initial_explicit_policy" in arguments[0])
                initial_explicit_policy = arguments[0].initial_explicit_policy;

            if("initial_policy_mapping_inhibit" in arguments[0])
                initial_policy_mapping_inhibit = arguments[0].initial_policy_mapping_inhibit;

            if("initial_inhibit_policy" in arguments[0])
                initial_inhibit_policy = arguments[0].initial_inhibit_policy;

            if("initial_permitted_subtrees_set" in arguments[0])
                initial_permitted_subtrees_set = arguments[0].initial_permitted_subtrees_set;

            if("initial_excluded_subtrees_set" in arguments[0])
                initial_excluded_subtrees_set = arguments[0].initial_excluded_subtrees_set;

            if("initial_required_name_forms" in arguments[0])
                initial_required_name_forms = arguments[0].initial_required_name_forms;
        }

        var explicit_policy_indicator = initial_explicit_policy;
        var policy_mapping_inhibit_indicator = initial_policy_mapping_inhibit;
        var inhibit_any_policy_indicator = initial_inhibit_policy;

        var pending_constraints = new Array(3);
        pending_constraints[0] = false; // For "explicit_policy_pending"
        pending_constraints[1] = false; // For "policy_mapping_inhibit_pending"
        pending_constraints[2] = false; // For "inhibit_any_policy_pending"

        var explicit_policy_pending = 0;
        var policy_mapping_inhibit_pending = 0;
        var inhibit_any_policy_pending = 0;

        var permitted_subtrees = initial_permitted_subtrees_set;
        var excluded_subtrees = initial_excluded_subtrees_set;
        var required_name_forms = initial_required_name_forms;

        var path_depth = 1;
        // #endregion 

        // #region Sorting certificates in the chain array 
        sequence = (in_window.org.pkijs.simpl.CERT_CHAIN.prototype.sort.call(this)).then(
            function(sorted_certs)
            {
                _this.certs = sorted_certs;
            }
            );
        // #endregion 

        // #region Work with policies
        sequence = sequence.then(
            function()
            {
                // #region Support variables 
                var all_policies = new Array(); // Array of all policies (string values)
                all_policies.push("2.5.29.32.0"); // Put "anyPolicy" at first place

                var policies_and_certs = new Array(); // In fact "array of array" where rows are for each specific policy, column for each certificate and value is "true/false"

                var any_policy_array = new Array(_this.certs.length - 1); // Minus "trusted anchor"
                for(var ii = 0; ii < (_this.certs.length - 1); ii++)
                    any_policy_array[ii] = true;

                policies_and_certs.push(any_policy_array);

                var policy_mappings = new Array(_this.certs.length - 1); // Array of "PolicyMappings" for each certificate
                var cert_policies = new Array(_this.certs.length - 1); // Array of "CertificatePolicies" for each certificate
                // #endregion 

                for(var i = (_this.certs.length - 2) ; i >= 0 ; i--, path_depth++)
                {
                    if("extensions" in _this.certs[i])
                    {
                        for(var j = 0; j < _this.certs[i].extensions.length; j++)
                        {
                            // #region CertificatePolicies 
                            if(_this.certs[i].extensions[j].extnID === "2.5.29.32")
                            {
                                cert_policies[i] = _this.certs[i].extensions[j].parsedValue;

                                for(var k = 0; k < _this.certs[i].extensions[j].parsedValue.certificatePolicies.length; k++)
                                {
                                    var policy_index = (-1);

                                    // #region Try to find extension in "all_policies" array 
                                    for(var s = 0; s < all_policies.length; s++)
                                    {
                                        if(_this.certs[i].extensions[j].parsedValue.certificatePolicies[k].policyIdentifier === all_policies[s])
                                        {
                                            policy_index = s;
                                            break;
                                        }
                                    }
                                    // #endregion 

                                    if(policy_index === (-1))
                                    {
                                        all_policies.push(_this.certs[i].extensions[j].parsedValue.certificatePolicies[k].policyIdentifier);

                                        var cert_array = new Array(_this.certs.length - 1);
                                        cert_array[i] = true;

                                        policies_and_certs.push(cert_array);
                                    }
                                    else
                                        (policies_and_certs[policy_index])[i] = true;
                                }
                            }
                            // #endregion 

                            // #region PolicyMappings 
                            if(_this.certs[i].extensions[j].extnID === "2.5.29.33")
                                policy_mappings[i] = _this.certs[i].extensions[j].parsedValue;
                            // #endregion 

                            // #region PolicyConstraints 
                            if(_this.certs[i].extensions[j].extnID === "2.5.29.36")
                            {
                                if(explicit_policy_indicator == false)
                                {
                                    // #region requireExplicitPolicy 
                                    if(_this.certs[i].extensions[j].parsedValue.requireExplicitPolicy === 0)
                                        explicit_policy_indicator = true;
                                    else
                                    {
                                        if(pending_constraints[0] === false)
                                        {
                                            pending_constraints[0] = true;
                                            explicit_policy_pending = _this.certs[i].extensions[j].parsedValue.requireExplicitPolicy;
                                        }
                                        else
                                        {
                                            explicit_policy_pending = (explicit_policy_pending > _this.certs[i].extensions[j].parsedValue.requireExplicitPolicy) ? _this.certs[i].extensions[j].parsedValue.requireExplicitPolicy : explicit_policy_pending;
                                        }
                                    }
                                    // #endregion 

                                    // #region inhibitPolicyMapping 
                                    if(_this.certs[i].extensions[j].parsedValue.inhibitPolicyMapping === 0)
                                        policy_mapping_inhibit_indicator = true;
                                    else
                                    {
                                        if(pending_constraints[1] === false)
                                        {
                                            pending_constraints[1] = true;
                                            policy_mapping_inhibit_pending = _this.certs[i].extensions[j].parsedValue.requireExplicitPolicy;
                                        }
                                        else
                                        {
                                            policy_mapping_inhibit_pending = (policy_mapping_inhibit_pending > _this.certs[i].extensions[j].parsedValue.requireExplicitPolicy) ? _this.certs[i].extensions[j].parsedValue.requireExplicitPolicy : policy_mapping_inhibit_pending;
                                        }
                                    }
                                    // #endregion   
                                }
                            }
                            // #endregion 

                            // #region InhibitAnyPolicy
                            if(_this.certs[i].extensions[j].extnID === "2.5.29.54")
                            {
                                if(inhibit_any_policy_indicator === false)
                                {
                                    if(_this.certs[i].extensions[j].parsedValue.value_block.value_dec === 0)
                                        inhibit_any_policy_indicator = true;
                                    else
                                    {
                                        if(pending_constraints[2] === false)
                                        {
                                            pending_constraints[2] = true;
                                            inhibit_any_policy_pending = _this.certs[i].extensions[j].parsedValue.value_block.value_dec;
                                        }
                                        else
                                        {
                                            inhibit_any_policy_pending = (inhibit_any_policy_pending > _this.certs[i].extensions[j].parsedValue.value_block.value_dec) ? _this.certs[i].extensions[j].parsedValue.value_block.value_dec : inhibit_any_policy_pending;
                                        }
                                    }
                                }
                            }
                            // #endregion 
                        }

                        // #region Check "inhibit_any_policy_indicator" 
                        if(inhibit_any_policy_indicator === true)
                            delete (policies_and_certs[0])[i]; // Unset value to "undefined" for "anyPolicies" value for current certificate
                        // #endregion 

                        // #region Combine information from certificate policies and policy mappings 
                        if((typeof cert_policies[i] !== "undefined") &&
                           (typeof policy_mappings[i] !== "undefined") &&
                           (policy_mapping_inhibit_indicator === false))
                        {
                            for(var m = 0; m < cert_policies[i].certificatePolicies.length; m++)
                            {
                                var domainPolicy = "";

                                // #region Find if current policy is in "mappings" array 
                                for(var n = 0; n < policy_mappings[i].mappings.length; n++)
                                {
                                    if(policy_mappings[i].mappings[n].subjectDomainPolicy === cert_policies[i].certificatePolicies[m].policyIdentifier)
                                    {
                                        domainPolicy = policy_mappings[i].mappings[n].issuerDomainPolicy;
                                        break;
                                    }

                                    // #region Could be the case for some reasons 
                                    if(policy_mappings[i].mappings[n].issuerDomainPolicy === cert_policies[i].certificatePolicies[m].policyIdentifier)
                                    {
                                        domainPolicy = policy_mappings[i].mappings[n].subjectDomainPolicy;
                                        break;
                                    }
                                    // #endregion 
                                }

                                if(domainPolicy === "")
                                    continue;
                                // #endregion

                                // #region Find the index of "domainPolicy"  
                                var domainPolicy_index = (-1);

                                for(var p = 0; p < all_policies.length; p++)
                                {
                                    if(all_policies[p] === domainPolicy)
                                    {
                                        domainPolicy_index = p;
                                        break;
                                    }
                                }
                                // #endregion 

                                // #region Change array value for "domainPolicy" 
                                if(domainPolicy_index !== (-1))
                                    (policies_and_certs[domainPolicy_index])[i] = true; // Put "set" in "domainPolicy" cell for specific certificate
                                // #endregion 
                            }
                        }
                        // #endregion 

                        // #region Process with "pending constraints" 
                        if(explicit_policy_indicator === false)
                        {
                            if(pending_constraints[0] === true)
                            {
                                explicit_policy_pending--;
                                if(explicit_policy_pending === 0)
                                {
                                    explicit_policy_indicator = true;
                                    pending_constraints[0] = false;
                                }
                            }
                        }

                        if(policy_mapping_inhibit_indicator === false)
                        {
                            if(pending_constraints[1] === true)
                            {
                                policy_mapping_inhibit_pending--;
                                if(policy_mapping_inhibit_pending === 0)
                                {
                                    policy_mapping_inhibit_indicator = true;
                                    pending_constraints[1] = false;
                                }
                            }
                        }

                        if(inhibit_any_policy_indicator === false)
                        {
                            if(pending_constraints[2] === true)
                            {
                                inhibit_any_policy_pending--;
                                if(inhibit_any_policy_pending === 0)
                                {
                                    inhibit_any_policy_indicator = true;
                                    pending_constraints[2] = false;
                                }
                            }
                        }
                        // #endregion 
                    }
                }

                // #region Create "set of authorities-constrained policies"
                var auth_constr_policies = new Array();

                for(var i = 0; i < policies_and_certs.length; i++)
                {
                    var found = true;

                    for(var j = 0; j < (_this.certs.length - 1) ; j++)
                    {
                        if(typeof (policies_and_certs[i])[j] === "undefined")
                        {
                            found = false;
                            break;
                        }
                    }

                    if(found === true)
                        auth_constr_policies.push(all_policies[i]);
                }
                // #endregion 

                // #region Create "set of user-constrained policies"
                var user_constr_policies = new Array();

                for(var i = 0; i < auth_constr_policies.length; i++)
                {
                    for(var j = 0; j < initial_policy_set.length; j++)
                    {
                        if(initial_policy_set[j] === auth_constr_policies[i])
                        {
                            user_constr_policies.push(initial_policy_set[j]);
                            break;
                        }
                    }
                }
                // #endregion 

                // #region Combine output object 
                return {
                    result: (user_constr_policies.length > 0) ? true : false,
                    result_code: 0,
                    result_message: (user_constr_policies.length > 0) ? "" : "Zero \"user_constr_policies\" array, no intersections with \"auth_constr_policies\"",
                    auth_constr_policies: auth_constr_policies,
                    user_constr_policies: user_constr_policies,
                    explicit_policy_indicator: explicit_policy_indicator,
                    policy_mappings: policy_mappings
                };
                // #endregion 
            }
            );
        // #endregion 

        // #region Work with name constraints
        sequence = sequence.then(
            function(policy_result)
            {
                // #region Auxiliary functions for name constraints checking
                function compare_dNSName(name, constraint)
                {
                    /// <summary>Compare two dNSName values</summary>
                    /// <param name="name" type="String">DNS from name</param>
                    /// <param name="constraint" type="String">Constraint for DNS from name</param>
                    /// <returns type="Boolean">Boolean result - valid or invalid the "name" against the "constraint"</returns>

                    // #region Make a "string preparation" for both name and constrain 
                    var name_prepared = in_window.org.pkijs.stringPrep(name);
                    var constraint_prepared = in_window.org.pkijs.stringPrep(constraint);
                    // #endregion 

                    // #region Make a "splitted" versions of "constraint" and "name" 
                    var name_splitted = name_prepared.split(".");
                    var constraint_splitted = constraint_prepared.split(".");
                    // #endregion 

                    // #region Length calculation and additional check 
                    var name_len = name_splitted.length;
                    var constr_len = constraint_splitted.length;

                    if((name_len === 0) || (constr_len === 0) || (name_len < constr_len))
                        return false;
                    // #endregion 

                    // #region Check that no part of "name" has zero length 
                    for(var i = 0; i < name_len; i++)
                    {
                        if(name_splitted[i].length === 0)
                            return false;
                    }
                    // #endregion 

                    // #region Check that no part of "constraint" has zero length
                    for(var i = 0; i < constr_len; i++)
                    {
                        if(constraint_splitted[i].length === 0)
                        {
                            if(i === 0)
                            {
                                if(constr_len === 1)
                                    return false;
                                else
                                    continue;
                            }

                            return false;
                        }
                    }
                    // #endregion 

                    // #region Check that "name" has a tail as "constraint" 

                    for(var i = 0; i < constr_len; i++)
                    {
                        if(constraint_splitted[constr_len - 1 - i].length === 0)
                            continue;

                        if(name_splitted[name_len - 1 - i].localeCompare(constraint_splitted[constr_len - 1 - i]) !== 0)
                            return false;
                    }
                    // #endregion 

                    return true;
                }

                function compare_rfc822Name(name, constraint)
                {
                    /// <summary>Compare two rfc822Name values</summary>
                    /// <param name="name" type="String">E-mail address from name</param>
                    /// <param name="constraint" type="String">Constraint for e-mail address from name</param>
                    /// <returns type="Boolean">Boolean result - valid or invalid the "name" against the "constraint"</returns>

                    // #region Make a "string preparation" for both name and constrain 
                    var name_prepared = in_window.org.pkijs.stringPrep(name);
                    var constraint_prepared = in_window.org.pkijs.stringPrep(constraint);
                    // #endregion 

                    // #region Make a "splitted" versions of "constraint" and "name" 
                    var name_splitted = name_prepared.split("@");
                    var constraint_splitted = constraint_prepared.split("@");
                    // #endregion 

                    // #region Splitted array length checking 
                    if((name_splitted.length === 0) || (constraint_splitted.length === 0) || (name_splitted.length < constraint_splitted.length))
                        return false;
                    // #endregion 

                    if(constraint_splitted.length === 1)
                    {
                        var result = compare_dNSName(name_splitted[1], constraint_splitted[0]);

                        if(result)
                        {
                            // #region Make a "splitted" versions of domain name from "constraint" and "name" 
                            var ns = name_splitted[1].split(".");
                            var cs = constraint_splitted[0].split(".");
                            // #endregion 

                            if(cs[0].length === 0)
                                return true;

                            if(ns.length !== cs.length)
                                return false;
                            else
                                return true;
                        }
                        else
                            return false;
                    }
                    else
                        return (name_prepared.localeCompare(constraint_prepared) === 0) ? true : false;

                    return false;
                }

                function compare_uniformResourceIdentifier(name, constraint)
                {
                    /// <summary>Compare two uniformResourceIdentifier values</summary>
                    /// <param name="name" type="String">uniformResourceIdentifier from name</param>
                    /// <param name="constraint" type="String">Constraint for uniformResourceIdentifier from name</param>
                    /// <returns type="Boolean">Boolean result - valid or invalid the "name" against the "constraint"</returns>

                    // #region Make a "string preparation" for both name and constrain 
                    var name_prepared = in_window.org.pkijs.stringPrep(name);
                    var constraint_prepared = in_window.org.pkijs.stringPrep(constraint);
                    // #endregion 

                    // #region Find out a major URI part to compare with
                    var ns = name_prepared.split("/");
                    var cs = constraint_prepared.split("/");

                    if(cs.length > 1) // Malformed constraint
                        return false;

                    if(ns.length > 1) // Full URI string
                    {
                        for(var i = 0; i < ns.length; i++)
                        {
                            if((ns[i].length > 0) && (ns[i].charAt(ns[i].length - 1) !== ':'))
                            {
                                var ns_port = ns[i].split(":");
                                name_prepared = ns_port[0];
                                break;
                            }
                        }
                    }
                    // #endregion 

                    var result = compare_dNSName(name_prepared, constraint_prepared);

                    if(result)
                    {
                        // #region Make a "splitted" versions of "constraint" and "name" 
                        var name_splitted = name_prepared.split(".");
                        var constraint_splitted = constraint_prepared.split(".");
                        // #endregion 

                        if(constraint_splitted[0].length === 0)
                            return true;

                        if(name_splitted.length !== constraint_splitted.length)
                            return false;
                        else
                            return true;
                    }
                    else
                        return false;

                    return false;
                }

                function compare_iPAddress(name, constraint)
                {
                    /// <summary>Compare two iPAddress values</summary>
                    /// <param name="name" type="in_window.org.pkijs.asn1.OCTETSTRING">iPAddress from name</param>
                    /// <param name="constraint" type="in_window.org.pkijs.asn1.OCTETSTRING">Constraint for iPAddress from name</param>
                    /// <returns type="Boolean">Boolean result - valid or invalid the "name" against the "constraint"</returns>

                    // #region Common variables 
                    var name_view = new Uint8Array(name.value_block.value_hex);
                    var constraint_view = new Uint8Array(constraint.value_block.value_hex);
                    // #endregion 

                    // #region Work with IPv4 addresses 
                    if((name_view.length === 4) && (constraint_view.length === 8))
                    {
                        for(var i = 0; i < 4; i++)
                        {
                            if((name_view[i] ^ constraint_view[i]) & constraint_view[i + 4])
                                return false;
                        }

                        return true;
                    }
                    // #endregion 

                    // #region Work with IPv6 addresses 
                    if((name_view.length === 16) && (constraint_view.length === 32))
                    {
                        for(var i = 0; i < 16; i++)
                        {
                            if((name_view[i] ^ constraint_view[i]) & constraint_view[i + 16])
                                return false;
                        }

                        return true;
                    }
                    // #endregion 

                    return false;
                }

                function compare_directoryName(name, constraint)
                {
                    /// <summary>Compare two directoryName values</summary>
                    /// <param name="name" type="in_window.org.pkijs.simpl.RDN">directoryName from name</param>
                    /// <param name="constraint" type="in_window.org.pkijs.simpl.RDN">Constraint for directoryName from name</param>
                    /// <param name="any" type="Boolean">Boolean flag - should be comparision interrupted after first match or we need to match all "constraints" parts</param>
                    /// <returns type="Boolean">Boolean result - valid or invalid the "name" against the "constraint"</returns>

                    // #region Initial check 
                    if((name.types_and_values.length === 0) || (constraint.types_and_values.length === 0))
                        return true;

                    if(name.types_and_values.length < constraint.types_and_values.length)
                        return false;
                    // #endregion 

                    // #region Initial variables 
                    var result = true;
                    var name_start = 0;
                    // #endregion 

                    for(var i = 0; i < constraint.types_and_values.length; i++)
                    {
                        var local_result = false;

                        for(var j = name_start; j < name.types_and_values.length; j++)
                        {
                            local_result = name.types_and_values[j].isEqual(constraint.types_and_values[i]);

                            if(name.types_and_values[j].type === constraint.types_and_values[i].type)
                                result = result && local_result;

                            if(local_result === true)
                            {
                                if((name_start === 0) || (name_start === j))
                                {
                                    name_start = j + 1;
                                    break;
                                }
                                else // Structure of "name" must be the same with "constraint"
                                    return false;
                            }
                        }

                        if(local_result === false)
                            return false;
                    }

                    return (name_start === 0) ? false : result;
                }
                // #endregion 

                // #region Check a result from "policy checking" part  
                if(policy_result.result === false)
                    return policy_result;
                // #endregion 

                // #region Check all certificates, excluding "trust anchor" 
                path_depth = 1;

                for(var i = (_this.certs.length - 2) ; i >= 0 ; i--, path_depth++)
                {
                    // #region Support variables 
                    var subject_alt_names = new Array();

                    var cert_permitted_subtrees = new Array();
                    var cert_excluded_subtrees = new Array();
                    // #endregion 

                    if("extensions" in _this.certs[i])
                    {
                        for(var j = 0; j < _this.certs[i].extensions.length; j++)
                        {
                            // #region NameConstraints 
                            if(_this.certs[i].extensions[j].extnID === "2.5.29.30")
                            {
                                if("permittedSubtrees" in _this.certs[i].extensions[j].parsedValue)
                                    cert_permitted_subtrees = cert_permitted_subtrees.concat(_this.certs[i].extensions[j].parsedValue.permittedSubtrees);

                                if("excludedSubtrees" in _this.certs[i].extensions[j].parsedValue)
                                    cert_excluded_subtrees = cert_excluded_subtrees.concat(_this.certs[i].extensions[j].parsedValue.excludedSubtrees);
                            }
                            // #endregion   

                            // #region SubjectAltName 
                            if(_this.certs[i].extensions[j].extnID === "2.5.29.17")
                                subject_alt_names = subject_alt_names.concat(_this.certs[i].extensions[j].parsedValue.altNames);
                            // #endregion 

                            // #region PKCS#9 e-mail address 
                            if(_this.certs[i].extensions[j].extnID === "1.2.840.113549.1.9.1")
                                email_addresses.push(_this.certs[i].extensions[j].parsedValue.value);
                            // #endregion 
                        }
                    }

                    // #region Checking for "required name forms" 
                    var form_found = (required_name_forms.length > 0) ? false : true;

                    for(var j = 0; j < required_name_forms.length; j++)
                    {
                        switch(required_name_forms[j].base.NameType)
                        {
                            case 4: // directoryName
                                {
                                    if(required_name_forms[j].base.Name.types_and_values.length !== _this.certs[i].subject.types_and_values.length)
                                        continue;

                                    form_found = true;

                                    for(var k = 0; k < _this.certs[i].subject.types_and_values.length; k++)
                                    {
                                        if(_this.certs[i].subject.types_and_values[k].type !== required_name_forms[j].base.Name.types_and_values[k].type)
                                        {
                                            form_found = false;
                                            break;
                                        }
                                    }

                                    if(form_found === true)
                                        break;
                                }
                                break;
                            default:; // ??? Probably here we should reject the certificate ???
                        }
                    }

                    if(form_found === false)
                    {
                        policy_result.result = false;
                        policy_result.result_code = 21;
                        policy_result.result_message = "No neccessary name form found";

                        return new Promise(function(resolve, reject)
                        {
                            reject(policy_result);
                        });
                    }
                    // #endregion 

                    // #region Checking for "permited sub-trees" 
                    // #region Make groups for all types of constraints 
                    var constr_groups = new Array(); // Array of array for groupped constraints
                    constr_groups[0] = new Array(); // rfc822Name
                    constr_groups[1] = new Array(); // dNSName
                    constr_groups[2] = new Array(); // directoryName
                    constr_groups[3] = new Array(); // uniformResourceIdentifier
                    constr_groups[4] = new Array(); // iPAddress

                    for(var j = 0; j < permitted_subtrees.length; j++)
                    {
                        switch(permitted_subtrees[j].base.NameType)
                        {
                            // #region rfc822Name 
                            case 1:
                                constr_groups[0].push(permitted_subtrees[j]);
                                break;
                            // #endregion 
                            // #region dNSName 
                            case 2:
                                constr_groups[1].push(permitted_subtrees[j]);
                                break;
                            // #endregion 
                            // #region directoryName 
                            case 4:
                                constr_groups[2].push(permitted_subtrees[j]);
                                break;
                            // #endregion 
                            // #region uniformResourceIdentifier 
                            case 6:
                                constr_groups[3].push(permitted_subtrees[j]);
                                break;
                            // #endregion 
                            // #region iPAddress 
                            case 7:
                                constr_groups[4].push(permitted_subtrees[j]);
                                break;
                            // #endregion 
                            // #region default 
                            default:;
                            // #endregion 
                        }
                    }
                    // #endregion   

                    // #region Check name constraints groupped by type, one-by-one 
                    for(var p = 0; p < 5; p++)
                    {
                        var group_permitted = false;
                        var group = constr_groups[p];

                        for(var j = 0; j < group.length; j++)
                        {
                            switch(p)
                            {
                                // #region rfc822Name 
                                case 0:
                                    if(subject_alt_names.length >= 0)
                                    {
                                        for(var k = 0; k < subject_alt_names.length; k++)
                                        {
                                            if(subject_alt_names[k].NameType === 1) // rfc822Name
                                                group_permitted = group_permitted || compare_rfc822Name(subject_alt_names[k].Name, group[j].base.Name);
                                        }
                                    }
                                    else // Try to find out "emailAddress" inside "subject"
                                    {
                                        for(var k = 0; k < _this.certs[i].subject.types_and_values.length; k++)
                                        {
                                            if((_this.certs[i].subject.types_and_values[k].type === "1.2.840.113549.1.9.1") ||    // PKCS#9 e-mail address
                                               (_this.certs[i].subject.types_and_values[k].type === "0.9.2342.19200300.100.1.3")) // RFC1274 "rfc822Mailbox" e-mail address
                                            {
                                                group_permitted = group_permitted || compare_rfc822Name(_this.certs[i].subject.types_and_values[k].value.value_block.value, group[j].base.Name);
                                            }
                                        }
                                    }
                                    break;
                                // #endregion 
                                // #region dNSName 
                                case 1:
                                    if(subject_alt_names.length > 0)
                                    {
                                        for(var k = 0; k < subject_alt_names.length; k++)
                                        {
                                            if(subject_alt_names[k].NameType === 2) // dNSName
                                                group_permitted = group_permitted || compare_dNSName(subject_alt_names[k].Name, group[j].base.Name);
                                        }
                                    }
                                    break;
                                // #endregion 
                                // #region directoryName 
                                case 2:
                                    group_permitted = compare_directoryName(_this.certs[i].subject, group[j].base.Name);
                                    break;
                                // #endregion 
                                // #region uniformResourceIdentifier 
                                case 3:
                                    if(subject_alt_names.length > 0)
                                    {
                                        for(var k = 0; k < subject_alt_names.length; k++)
                                        {
                                            if(subject_alt_names[k].NameType === 6) // uniformResourceIdentifier
                                                group_permitted = group_permitted || compare_uniformResourceIdentifier(subject_alt_names[k].Name, group[j].base.Name);
                                        }
                                    }
                                    break;
                                // #endregion 
                                // #region iPAddress 
                                case 4:
                                    if(subject_alt_names.length > 0)
                                    {
                                        for(var k = 0; k < subject_alt_names.length; k++)
                                        {
                                            if(subject_alt_names[k].NameType === 7) // iPAddress
                                                group_permitted = group_permitted || compare_iPAddress(subject_alt_names[k].Name, group[j].base.Name);
                                        }
                                    }
                                    break;
                                // #endregion 
                                // #region default 
                                default:;
                                // #endregion 
                            }

                            if(group_permitted)
                                break;
                        }

                        if((group_permitted === false) && (group.length > 0))
                        {
                            policy_result.result = false;
                            policy_result.result_code = 41;
                            policy_result.result_message = "Failed to meet \"permitted sub-trees\" name constraint";

                            return new Promise(function(resolve, reject)
                            {
                                reject(policy_result);
                            });
                        }
                    }
                    // #endregion 
                    // #endregion 

                    // #region Checking for "excluded sub-trees" 
                    var excluded = false;

                    for(var j = 0; j < excluded_subtrees.length; j++)
                    {
                        switch(excluded_subtrees[j].base.NameType)
                        {
                            // #region rfc822Name 
                            case 1:
                                if(subject_alt_names.length >= 0)
                                {
                                    for(var k = 0; k < subject_alt_names.length; k++)
                                    {
                                        if(subject_alt_names[k].NameType === 1) // rfc822Name
                                            excluded = excluded || compare_rfc822Name(subject_alt_names[k].Name, excluded_subtrees[j].base.Name);
                                    }
                                }
                                else // Try to find out "emailAddress" inside "subject"
                                {
                                    for(var k = 0; k < _this.subject.types_and_values.length; k++)
                                    {
                                        if((_this.subject.types_and_values[k].type === "1.2.840.113549.1.9.1") ||    // PKCS#9 e-mail address
                                           (_this.subject.types_and_values[k].type === "0.9.2342.19200300.100.1.3")) // RFC1274 "rfc822Mailbox" e-mail address
                                        {
                                            excluded = excluded || compare_rfc822Name(_this.subject.types_and_values[k].value.value_block.value, excluded_subtrees[j].base.Name);
                                        }
                                    }
                                }
                                break;
                            // #endregion 
                            // #region dNSName 
                            case 2:
                                if(subject_alt_names.length > 0)
                                {
                                    for(var k = 0; k < subject_alt_names.length; k++)
                                    {
                                        if(subject_alt_names[k].NameType === 2) // dNSName
                                            excluded = excluded || compare_dNSName(subject_alt_names[k].Name, excluded_subtrees[j].base.Name);
                                    }
                                }
                                break;
                            // #endregion 
                            // #region directoryName 
                            case 4:
                                excluded = excluded || compare_directoryName(_this.certs[i].subject, excluded_subtrees[j].base.Name);
                                break;
                            // #endregion 
                            // #region uniformResourceIdentifier 
                            case 6:
                                if(subject_alt_names.length > 0)
                                {
                                    for(var k = 0; k < subject_alt_names.length; k++)
                                    {
                                        if(subject_alt_names[k].NameType === 6) // uniformResourceIdentifier
                                            excluded = excluded || compare_uniformResourceIdentifier(subject_alt_names[k].Name, excluded_subtrees[j].base.Name);
                                    }
                                }
                                break;
                            // #endregion 
                            // #region iPAddress 
                            case 7:
                                if(subject_alt_names.length > 0)
                                {
                                    for(var k = 0; k < subject_alt_names.length; k++)
                                    {
                                        if(subject_alt_names[k].NameType === 7) // iPAddress
                                            excluded = excluded || compare_iPAddress(subject_alt_names[k].Name, excluded_subtrees[j].base.Name);
                                    }
                                }
                                break;
                            // #endregion 
                            // #region default 
                            default:; // No action, but probably here we need to create a warning for "malformed constraint"
                            // #endregion 
                        }

                        if(excluded)
                            break;
                    }

                    if(excluded === true)
                    {
                        policy_result.result = false;
                        policy_result.result_code = 42;
                        policy_result.result_message = "Failed to meet \"excluded sub-trees\" name constraint";

                        return new Promise(function(resolve, reject)
                        {
                            reject(policy_result);
                        });
                    }
                    // #endregion 

                    // #region Append "cert_..._subtrees" to "..._subtrees" 
                    permitted_subtrees = permitted_subtrees.concat(cert_permitted_subtrees);
                    excluded_subtrees = excluded_subtrees.concat(cert_excluded_subtrees);
                    // #endregion   
                }
                // #endregion 

                return policy_result;
            }
            );
        // #endregion   

        return sequence;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
}
)(typeof exports !== "undefined" ? exports : window);
