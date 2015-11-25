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

    // #region "org.pkijs.asn1" namespace 
    if(typeof in_window.org.pkijs.asn1 === "undefined")
        in_window.org.pkijs.asn1 = {};
    else
    {
        if(typeof in_window.org.pkijs.asn1 !== "object")
            throw new Error("Name org.pkijs.asn1 already exists and it's not an object" + " but " + (typeof in_window.org.pkijs.asn1));
    }
    // #endregion 

    // #region "local" namespace 
    var local = {};
    // #endregion   
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Aux-functions 
    //**************************************************************************************
    function util_frombase(input_buffer, input_base)
    {
        /// <summary>Convert number from 2^base to 2^10</summary>
        /// <param name="input_buffer" type="Uint8Array">Array of bytes representing the number to convert</param>
        /// <param name="input_base" type="Number">The base of initial number</param>

        var result = 0; 

        for(var i = (input_buffer.length - 1); i >= 0; i-- )
            result += input_buffer[(input_buffer.length - 1) - i] * Math.pow(2, input_base * i);

        return result;
    }
    //**************************************************************************************
    function util_tobase(value, base, reserved)
    {
        /// <summary>Convert number from 2^10 to 2^base</summary>
        /// <param name="value" type="Number">The number to convert</param>
        /// <param name="base" type="Number">The base for 2^base</param>
        /// <param name="reserved" type="Number">Pre-defined number of bytes in output array (-1 = limited by function itself)</param>

        reserved = reserved || (-1);

        var result = 0;
        var biggest = Math.pow(2, base);

        for(var i = 1; i < 8; i++)
        {
            if(value < biggest)
            {
                var ret_buf;

                if( reserved < 0 )
                {
                    ret_buf = new ArrayBuffer(i);
                    result = i;
                }
                else
                {
                    if(reserved < i)
                        return (new ArrayBuffer(0));

                    ret_buf = new ArrayBuffer(reserved);

                    result = reserved;
                }

                var ret_view = new Uint8Array(ret_buf);

                for(var j = ( i - 1 ); j >= 0; j-- )
                {
                    var basis = Math.pow(2, j * base);

                    ret_view[ result - j - 1 ] = Math.floor( value / basis );
                    value -= ( ret_view[ result - j - 1 ] ) * basis;
                }

                return ret_buf;
            }

            biggest *= Math.pow(2, base);
        }
    }
    //**************************************************************************************
    function util_encode_tc(value)
    {
        /// <summary>Encode integer value to "two complement" format</summary>
        /// <param name="value" type="Number">Value to encode</param>

        var mod_value = (value < 0) ? (value * (-1)) : value;
        var big_int = 128;

        for(var i = 1; i < 8; i++) 
        {
            if( mod_value <= big_int )
            {
                if( value < 0 )
                {
                    var small_int = big_int - mod_value;

                    var ret_buf = util_tobase( small_int, 8, i );
                    var ret_view = new Uint8Array(ret_buf);

                    ret_view[ 0 ] |= 0x80;

                    return ret_buf;
                }
                else
                {
                    var ret_buf = util_tobase( mod_value, 8, i );
                    var ret_view = new Uint8Array(ret_buf);

                    if( ret_view[ 0 ] & 0x80 )
                    {
                        var temp_buf = util_copybuf(ret_buf);
                        var temp_view = new Uint8Array(temp_buf);

                        ret_buf = new ArrayBuffer( ret_buf.byteLength + 1 );
                        ret_view = new Uint8Array(ret_buf);

                        for(var k = 0; k < temp_buf.byteLength; k++)
                            ret_view[k + 1] = temp_view[k];

                        ret_view[0] = 0x00;
                    }

                    return ret_buf;
                }
            }

            big_int *= Math.pow(2, 8);
        }

        return (new ArrayBuffer(0));
    }
    //**************************************************************************************
    function util_decode_tc()
    {
        /// <summary>Decoding of "two complement" values</summary>
        /// <remarks>The function must be called in scope of instance of "hex_block" class ("value_hex" and "warnings" properties must be present)</remarks>

        var buf = new Uint8Array(this.value_hex);

        if(this.value_hex.byteLength >= 2)
        {
            var condition_1 = (buf[0] == 0xFF) && (buf[1] & 0x80);
            var condition_2 = (buf[0] == 0x00) && ((buf[1] & 0x80) == 0x00);

            if(condition_1 || condition_2)
                this.warnings.push("Needlessly long format");
        }

        // #region Create big part of the integer
        var big_int_buffer = new ArrayBuffer(this.value_hex.byteLength);
        var big_int_view = new Uint8Array(big_int_buffer);
        for(var i = 0; i < this.value_hex.byteLength; i++)
            big_int_view[i] = 0;

        big_int_view[0] = (buf[0] & 0x80); // mask only the biggest bit

        var big_int = util_frombase(big_int_view, 8);
        // #endregion   

        // #region Create small part of the integer 
        var small_int_buffer = new ArrayBuffer(this.value_hex.byteLength);
        var small_int_view = new Uint8Array(small_int_buffer);
        for(var j = 0; j < this.value_hex.byteLength; j++)
            small_int_view[j] = buf[j];

        small_int_view[0] &= 0x7F; // mask biggest bit

        var small_int = util_frombase(small_int_view, 8);
        // #endregion 

        return (small_int - big_int);
    }
    //**************************************************************************************
    function util_copybuf(input_buffer)
    {
        /// <summary>Creating a copy of input ArrayBuffer</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ArrayBuffer for coping</param>

        if(check_buffer_params(input_buffer, 0, input_buffer.byteLength) === false)
            return (new ArrayBuffer(0));

        var input_view = new Uint8Array(input_buffer);

        var ret_buf = new ArrayBuffer(input_buffer.byteLength);
        var ret_view = new Uint8Array(ret_buf);

        for(var i = 0; i < input_buffer.byteLength; i++)
            ret_view[i] = input_view[i];

        return ret_buf;
    }
    //**************************************************************************************
    function util_copybuf_offset(input_buffer, input_offset, input_length)
    {
        /// <summary>Creating a copy of input ArrayBuffer</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ArrayBuffer for coping</param>

        if(check_buffer_params(input_buffer, input_offset, input_length) === false)
            return (new ArrayBuffer(0));

        var input_view = new Uint8Array(input_buffer, input_offset, input_length);

        var ret_buf = new ArrayBuffer(input_length);
        var ret_view = new Uint8Array(ret_buf);

        for(var i = 0; i < input_length; i++)
            ret_view[i] = input_view[i];

        return ret_buf;
    }
    //**************************************************************************************
    function util_concatbuf(input_buf1, input_buf2)
    {
        /// <summary>Concatenate two ArrayBuffers</summary>
        /// <param name="input_buf1" type="ArrayBuffer">First ArrayBuffer (first part of concatenated array)</param>
        /// <param name="input_buf2" type="ArrayBuffer">Second ArrayBuffer (second part of concatenated array)</param>

        var input_view1 = new Uint8Array(input_buf1);
        var input_view2 = new Uint8Array(input_buf2);

        var ret_buf = new ArrayBuffer(input_buf1.byteLength + input_buf2.byteLength);
        var ret_view = new Uint8Array(ret_buf);

        for(var i = 0; i < input_buf1.byteLength; i++)
            ret_view[i] = input_view1[i];

        for(var j = 0; j < input_buf2.byteLength; j++)
            ret_view[input_buf1.byteLength + j] = input_view2[j];

        return ret_buf;
    }
    //**************************************************************************************
    function check_buffer_params(input_buffer, input_offset, input_length)
    {
        if((input_buffer instanceof ArrayBuffer) === false)
        {
            this.error = "Wrong parameter: input_buffer must be \"ArrayBuffer\"";
            return false;
        }

        if(input_buffer.byteLength === 0)
        {
            this.error = "Wrong parameter: input_buffer has zero length";
            return false;
        }

        if(input_offset < 0)
        {
            this.error = "Wrong parameter: input_offset less than zero";
            return false;
        }

        if(input_length < 0)
        {
            this.error = "Wrong parameter: input_length less than zero";
            return false;
        }

        if((input_buffer.byteLength - input_offset - input_length) < 0)
        {
            this.error = "End of input reached before message was fully decoded (inconsistent offset and length values)";
            return false;
        }

        return true;
    }
    //**************************************************************************************
    function to_hex_codes(input_buffer, input_offset, input_lenght)
    {
        if(check_buffer_params(input_buffer, input_offset, input_lenght) === false)
            return "";

        var result = "";

        var int_buffer = new Uint8Array(input_buffer, input_offset, input_lenght);
        
        for(var i = 0; i < int_buffer.length; i++)
        {
            var str = int_buffer[i].toString(16).toUpperCase();
            result = result + ((str.length === 1) ? " 0" : " ") + str;
        }

        return result;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Declaration of base block class 
    //**************************************************************************************
    local.base_block =
    function()
    {
        /// <summary>General class of all ASN.1 blocks</summary>

        if(arguments[0] instanceof Object)
        {
            this.block_length = in_window.org.pkijs.getValue(arguments[0], "block_length", 0);
            this.error = in_window.org.pkijs.getValue(arguments[0], "error", new String());
            this.warnings = in_window.org.pkijs.getValue(arguments[0], "warnings", new Array());
            if("value_before_decode" in arguments[0])
                this.value_before_decode = util_copybuf(arguments[0].value_before_decode);
            else
                this.value_before_decode = new ArrayBuffer(0);
        }
        else
        {
            this.block_length = 0;
            this.error = new String();
            this.warnings = new Array();
            /// <field>Copy of the value of incoming ArrayBuffer done before decoding</field>
            this.value_before_decode = new ArrayBuffer(0);
        }
    }
    //**************************************************************************************
    local.base_block.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "base_block";
    }
    //**************************************************************************************
    local.base_block.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        return {
            block_name: local.base_block.prototype.block_name.call(this),
            block_length: this.block_length,
            error: this.error,
            warnings: this.warnings,
            value_before_decode: in_window.org.pkijs.bufferToHexCodes(this.value_before_decode, 0, this.value_before_decode.byteLength)
        };
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Declaration of hex block class 
    //**************************************************************************************
    local.hex_block =
    function()
    {
        /// <summary>Descendant of "base_block" with internal ArrayBuffer. Need to have it in case it is not possible to store ASN.1 value in native formats</summary>

        local.base_block.call(this, arguments[0]);

        if(arguments[0] instanceof Object)
        {
            this.is_hex_only = in_window.org.pkijs.getValue(arguments[0], "is_hex_only", false);
            if("value_hex" in arguments[0])
                this.value_hex = util_copybuf(arguments[0].value_hex);
            else
                this.value_hex = new ArrayBuffer(0);
        }
        else
        {
            this.is_hex_only = false;
            this.value_hex = new ArrayBuffer(0);
        }
    }
    //**************************************************************************************
    local.hex_block.prototype = new local.base_block();
    local.hex_block.constructor = local.hex_block;
    //**************************************************************************************
    local.hex_block.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "hex_block";
    }
    //**************************************************************************************
    local.hex_block.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        // #region Basic check for parameters 
        if(check_buffer_params.call(this, input_buffer, input_offset, input_length) === false)
            return (-1);
        // #endregion 

        // #region Getting Uint8Array from ArrayBuffer 
        var int_buffer = new Uint8Array(input_buffer, input_offset, input_length);
        // #endregion 

        // #region Initial checks 
        if(int_buffer.length == 0)
        {
            this.warnings.push("Zero buffer length");
            return input_offset;
        }
        // #endregion 

        // #region Copy input buffer to internal buffer 
        this.value_hex = new ArrayBuffer(input_length);
        var view = new Uint8Array(this.value_hex);

        for(var i = 0; i < int_buffer.length; i++)
            view[i] = int_buffer[i];
        // #endregion 

        this.block_length = input_length;

        return (input_offset + input_length);
    }
    //**************************************************************************************
    local.hex_block.prototype.toBER =
    function(size_only)
    {
        /// <summary>Encoding of current ASN.1 block into ASN.1 encoded array (BER rules)</summary>
        /// <param name="size_only" type="Boolean">Flag that we need only a size of encoding, not a real array of bytes</param>

        if(typeof size_only === "undefined")
            size_only = false;

        if(this.is_hex_only !== true)
        {
            this.error = "Flag \"is_hex_only\" is not set, abort";
            return (new ArrayBuffer(0));
        }

        var ret_buf = new ArrayBuffer(this.value_hex.byteLength);

        if(size_only === true)
            return ret_buf;

        var ret_view = new Uint8Array(ret_buf);
        var cur_view = new Uint8Array(this.value_hex);

        for(var i = 0; i < cur_view.length; i++)
            ret_view[i] = cur_view[i];

        return ret_buf;
    }
    //**************************************************************************************
    local.hex_block.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.base_block.prototype.toJSON.call(this);

        _object.block_name = local.hex_block.prototype.block_name.call(this);
        _object.is_hex_only = this.is_hex_only;
        _object.value_hex = in_window.org.pkijs.bufferToHexCodes(this.value_hex, 0, this.value_hex.byteLength)

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Declaration of identification block class 
    //**************************************************************************************
    local.identification_block =
    function()
    {
        /// <summary>Base class of ASN.1 "identification block"</summary>

        local.hex_block.call(this, arguments[0]);

        this.tag_class = (-1);
        this.tag_number = (-1);
        this.is_constructed = false;

        if(arguments[0] instanceof Object)
        {
            if("id_block" in arguments[0])
            {
                // #region Properties from hex_block class 
                this.is_hex_only = in_window.org.pkijs.getValue(arguments[0].id_block, "is_hex_only", false);
                this.value_hex = in_window.org.pkijs.getValue(arguments[0].id_block, "value_hex", new ArrayBuffer(0));
                // #endregion   

                this.tag_class = in_window.org.pkijs.getValue(arguments[0].id_block, "tag_class", (-1));
                this.tag_number = in_window.org.pkijs.getValue(arguments[0].id_block, "tag_number", (-1));
                this.is_constructed = in_window.org.pkijs.getValue(arguments[0].id_block, "is_constructed", false);
            }
        }
    }
    //**************************************************************************************
    local.identification_block.prototype = new local.hex_block();
    local.identification_block.constructor = local.identification_block;
    //**************************************************************************************
    local.identification_block.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "identification_block";
    }
    //**************************************************************************************
    local.identification_block.prototype.toBER =
    function(size_only)
    {
        /// <summary>Encoding of current ASN.1 block into ASN.1 encoded array (BER rules)</summary>
        /// <param name="size_only" type="Boolean">Flag that we need only a size of encoding, not a real array of bytes</param>

        if(typeof size_only === "undefined")
            size_only = false;

        var first_octet = 0;

        switch(this.tag_class)
        {
            case 1:
                first_octet |= 0x00; // UNIVERSAL
                break;
            case 2:
                first_octet |= 0x40; // APPLICATION
                break;
            case 3:
                first_octet |= 0x80; // CONTEXT-SPECIFIC
                break;
            case 4:
                first_octet |= 0xC0; // PRIVATE
                break;
            default:
                this.error = "Unknown tag class";
                return (new ArrayBuffer(0));
        }

        if(this.is_constructed)
            first_octet |= 0x20;

        if((this.tag_number < 31) && (!this.is_hex_only))
        {
            var ret_buf = new ArrayBuffer(1);
            var ret_view = new Uint8Array(ret_buf);

            if(!size_only)
            {
                var number = this.tag_number;
                number &= 0x1F;
                first_octet |= number;

                ret_view[0] = first_octet;
            }

            return ret_buf;
        }
        else
        {
            if(this.is_hex_only === false)
            {
                var encoded_buf = util_tobase(this.tag_number, 7);
                var encoded_view = new Uint8Array(encoded_buf);
                var size = encoded_buf.byteLength;

                var ret_buf = new ArrayBuffer(size + 1);
                var ret_view = new Uint8Array(ret_buf);

                ret_view[0] = (first_octet | 0x1F);

                if(!size_only)
                {
                    for(var i = 0; i < (size - 1) ; i++)
                        ret_view[i + 1] = encoded_view[i] | 0x80;

                    ret_view[size] = encoded_view[size - 1];
                }

                return ret_buf;
            }
            else
            {
                var ret_buf = new ArrayBuffer(this.value_hex.byteLength + 1);
                var ret_view = new Uint8Array(ret_buf);

                ret_view[0] = (first_octet | 0x1F);

                if(size_only === false)
                {
                    var cur_view = new Uint8Array(this.value_hex);

                    for(var i = 0; i < (cur_view.length - 1); i++)
                        ret_view[i + 1] = cur_view[i] | 0x80;

                    ret_view[this.value_hex.byteLength] = cur_view[cur_view.length - 1];
                }

                return ret_buf;
            }
        }
    }
    //**************************************************************************************
    local.identification_block.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        // #region Basic check for parameters 
        if(check_buffer_params.call(this, input_buffer, input_offset, input_length) === false)
            return (-1);
        // #endregion 

        // #region Getting Uint8Array from ArrayBuffer 
        var int_buffer = new Uint8Array(input_buffer, input_offset, input_length);
        // #endregion 

        // #region Initial checks 
        if(int_buffer.length == 0)
        {
            this.error = "Zero buffer length";
            return (-1);
        }
        // #endregion 

        // #region Find tag class 
        var tag_class_mask = int_buffer[0] & 0xC0;

        switch(tag_class_mask)
        {
            case 0x00:
                this.tag_class = (1); // UNIVERSAL
                break;
            case 0x40:
                this.tag_class = (2); // APPLICATION
                break;
            case 0x80:
                this.tag_class = (3); // CONTEXT-SPECIFIC
                break;
            case 0xC0:
                this.tag_class = (4); // PRIVATE
                break;
            default:
                this.error = "Unknown tag class";
                return ( -1 );
        }
        // #endregion 

        // #region Find it's constructed or not 
        if((int_buffer[0] & 0x20) == 0x20)
            this.is_constructed = true;
        else
            this.is_constructed = false;
        // #endregion 

        // #region Find tag number 
        this.is_hex_only = false;

        var tag_number_mask = int_buffer[0] & 0x1F;

        // #region Simple case (tag number < 31)
        if(tag_number_mask != 0x1F) 
        {
            this.tag_number = (tag_number_mask);
            this.block_length = 1;
        }
            // #endregion 
        // #region Tag number bigger or equal to 31 
        else
        {
            var count = 1;

            this.value_hex = new ArrayBuffer(255);
            var tag_number_buffer_max_length = 255;
            var int_tag_number_buffer = new Uint8Array(this.value_hex);

            while(int_buffer[count] & 0x80)
            {
                int_tag_number_buffer[count - 1] = int_buffer[count] & 0x7F;
                count++;

                if(count >= int_buffer.length)
                {
                    this.error = "End of input reached before message was fully decoded";
                    return (-1);
                }

                // #region In case if tag number length is greater than 255 bytes (rare but possible case)
                if(count == tag_number_buffer_max_length)
                {
                    tag_number_buffer_max_length += 255;

                    var temp_buffer = new ArrayBuffer(tag_number_buffer_max_length);
                    var temp_buffer_view = new Uint8Array(temp_buffer);

                    for(var i = 0; i < int_tag_number_buffer.length; i++)
                        temp_buffer_view[i] = int_tag_number_buffer[i];

                    this.value_hex = new ArrayBuffer(tag_number_buffer_max_length);
                    int_tag_number_buffer = new Uint8Array(this.value_hex);
                }
                // #endregion 
            }

            this.block_length = (count + 1);
            int_tag_number_buffer[count - 1] = int_buffer[count] & 0x7F; // Write last byte to buffer

            // #region Cut buffer 
            var temp_buffer = new ArrayBuffer(count);
            var temp_buffer_view = new Uint8Array(temp_buffer);
            for(var i = 0; i < count; i++)
                temp_buffer_view[i] = int_tag_number_buffer[i];

            this.value_hex = new ArrayBuffer(count);
            int_tag_number_buffer = new Uint8Array(this.value_hex);
            int_tag_number_buffer.set(temp_buffer_view);
            // #endregion 

            // #region Try to convert long tag number to short form 
            if(this.block_length <= 9)
                this.tag_number = util_frombase(int_tag_number_buffer, 7);
            else
            {
                this.is_hex_only = true;
                this.warnings.push("Tag too long, represented as hex-coded");
            }
            // #endregion 
        }
        // #endregion 
        // #endregion 

        // #region Check if constructed encoding was using for primitive type 
        if(((this.tag_class == 1)) &&
            (this.is_constructed))
        {
            switch(this.tag_number)
            {
                case 1:  // BOOLEAN
                case 2:  // REAL
                case 5:  // NULL
                case 6:  // OBJECT IDENTIFIER
                case 9:  // REAL
                case 14: // TIME
                case 23:
                case 24:
                case 31:
                case 32:
                case 33:
                case 34:
                    this.error = "Constructed encoding used for primitive type";
                    return (-1);
                default:
                    ;
            }
        }
        // #endregion 

        return ( input_offset + this.block_length ); // Return current offset in input buffer
    }
    //**************************************************************************************
    local.identification_block.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.hex_block.prototype.toJSON.call(this);

        _object.block_name = local.identification_block.prototype.block_name.call(this);
        _object.tag_class = this.tag_class;
        _object.tag_number = this.tag_number;
        _object.is_constructed = this.is_constructed;

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Declaration of length block class 
    //**************************************************************************************
    local.length_block =
    function()
    {
        /// <summary>Base class of ASN.1 "length block"</summary>

        local.base_block.call(this, arguments[0]);

        this.is_indefinite_form = false;
        this.long_form_used = false;
        this.length = (0);

        if(arguments[0] instanceof Object)
        {
            if("len_block" in arguments[0])
            {
                this.is_indefinite_form = in_window.org.pkijs.getValue(arguments[0].len_block, "is_indefinite_form", false);
                this.long_form_used = in_window.org.pkijs.getValue(arguments[0].len_block, "long_form_used", false);
                this.length = in_window.org.pkijs.getValue(arguments[0].len_block, "length", 0);
            }
        }
    }
    //**************************************************************************************
    local.length_block.prototype = new local.base_block();
    local.length_block.constructor = local.length_block;
    //**************************************************************************************
    local.length_block.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "length_block";
    }
    //**************************************************************************************
    local.length_block.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        // #region Basic check for parameters 
        if(check_buffer_params.call(this, input_buffer, input_offset, input_length) === false)
            return (-1);
        // #endregion 

        // #region Getting Uint8Array from ArrayBuffer 
        var int_buffer = new Uint8Array(input_buffer, input_offset, input_length);
        // #endregion 

        // #region Initial checks 
        if(int_buffer.length == 0)
        {
            this.error = "Zero buffer length";
            return (-1);
        }

        if(int_buffer[0] == 0xFF)
        {
            this.error = "Length block 0xFF is reserved by standard";
            return (-1);
        }
        // #endregion 

        // #region Check for length form type 
        if(int_buffer[0] == 0x80)
            this.is_indefinite_form = true;
        else
            this.is_indefinite_form = false;
        // #endregion 

        // #region Stop working in case of indefinite length form 
        if(this.is_indefinite_form == true)
        {
            this.block_length = 1;
            return (input_offset + this.block_length);
        }
        // #endregion 

        // #region Check is long form of length encoding using 
        if(int_buffer[0] & 0x80)
            this.long_form_used = true;
        else
            this.long_form_used = false;
        // #endregion 

        // #region Stop working in case of short form of length value 
        if(this.long_form_used == false)
        {
            this.length = (int_buffer[0]);
            this.block_length = 1;
            return (input_offset + this.block_length);
        }
        // #endregion 

        // #region Calculate length value in case of long form 
        var count = int_buffer[0] & 0x7F;

        if(count > 8) // Too big length value
        {
            this.error = "Too big integer";
            return (-1);
        }

        if((count + 1) > int_buffer.length)
        {
            this.error = "End of input reached before message was fully decoded";
            return (-1);
        }

        var length_buffer_view = new Uint8Array(count);

        for(var i = 0; i < count; i++)
            length_buffer_view[i] = int_buffer[i + 1];

        if(length_buffer_view[count - 1] == 0x00)
            this.warnings.push("Needlessly long encoded length");

        this.length = util_frombase(length_buffer_view, 8);

        if(this.long_form_used && (this.length <= 127))
            this.warnings.push("Unneccesary usage of long length form");

        this.block_length = count + 1;
        // #endregion 

        return (input_offset + this.block_length); // Return current offset in input buffer
    }
    //**************************************************************************************
    local.length_block.prototype.toBER =
    function(size_only)
    {
        /// <summary>Encoding of current ASN.1 block into ASN.1 encoded array (BER rules)</summary>
        /// <param name="size_only" type="Boolean">Flag that we need only a size of encoding, not a real array of bytes</param>

        if(typeof size_only === "undefined")
            size_only = false;

        if(this.length > 127)
            this.long_form_used = true;

        if(this.is_indefinite_form)
        {
            var ret_buf = new ArrayBuffer(1);

            if(size_only === false)
            {
                var ret_view = new Uint8Array(ret_buf);
                ret_view[0] = 0x80;
            }

            return ret_buf;
        }

        if(this.long_form_used === true)
        {
            var encoded_buf = util_tobase(this.length, 8);

            if(encoded_buf.byteLength > 127)
            {
                this.error = "Too big length";
                return (new ArrayBuffer(0));
            }

            var ret_buf = new ArrayBuffer(encoded_buf.byteLength + 1);

            if(size_only === true)
                return ret_buf;

            var encoded_view = new Uint8Array(encoded_buf);
            var ret_view = new Uint8Array(ret_buf);

            ret_view[0] = encoded_buf.byteLength | 0x80;

            for(var i = 0; i < encoded_buf.byteLength; i++)
                ret_view[i + 1] = encoded_view[i];

            return ret_buf;
        }
        else
        {
            var ret_buf = new ArrayBuffer(1);

            if(size_only === false)
            {
                var ret_view = new Uint8Array(ret_buf);

                ret_view[0] = this.length;
            }

            return ret_buf;
        }

        return (new ArrayBuffer(0));
    }
    //**************************************************************************************
    local.length_block.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.base_block.prototype.toJSON.call(this);

        _object.block_name = local.length_block.prototype.block_name.call(this);
        _object.is_indefinite_form = this.is_indefinite_form;
        _object.long_form_used = this.long_form_used;
        _object.length = this.length;

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Declaration of value block class 
    //**************************************************************************************
    local.value_block =
    function()
    {
        /// <summary>Generic class of ASN.1 "value block"</summary>
        local.base_block.call(this, arguments[0]);
    }
    //**************************************************************************************
    local.value_block.prototype = new local.base_block();
    local.value_block.constructor = local.value_block;
    //**************************************************************************************
    local.value_block.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "value_block";
    }
    //**************************************************************************************
    local.value_block.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.base_block.prototype.toJSON.call(this);

        _object.block_name = local.value_block.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Declaration of basic ASN.1 block class 
    //**************************************************************************************
    in_window.org.pkijs.asn1.ASN1_block =
    function()
    {
        /// <summary>Base class of ASN.1 block (identification block + length block + value block)</summary>

        local.base_block.call(this, arguments[0]);

        if(arguments[0] instanceof Object)
        {
            this.name = in_window.org.pkijs.getValue(arguments[0], "name", "");
            this.optional = in_window.org.pkijs.getValue(arguments[0], "optional", false);

            if("primitive_schema" in arguments[0])
                this.primitive_schema = arguments[0].primitive_schema;
        }

        this.id_block = new local.identification_block(arguments[0]);
        this.len_block = new local.length_block(arguments[0]);
        this.value_block = new local.value_block(arguments[0]);
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.ASN1_block.prototype = new local.base_block();
    in_window.org.pkijs.asn1.ASN1_block.constructor = in_window.org.pkijs.asn1.ASN1_block;
    //**************************************************************************************
    in_window.org.pkijs.asn1.ASN1_block.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "ASN1_block";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.ASN1_block.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        var result_offset = this.value_block.fromBER(input_buffer, input_offset, (this.len_block.is_indefinite_form == true) ? input_length : this.len_block.length);
        if(result_offset == (-1))
        {
            this.error = this.value_block.error;
            return result_offset;
        }

        if(this.id_block.error.length == 0)
            this.block_length += this.id_block.block_length;

        if(this.len_block.error.length == 0)
            this.block_length += this.len_block.block_length;

        if(this.value_block.error.length == 0)
            this.block_length += this.value_block.block_length;

        return result_offset;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.ASN1_block.prototype.toBER =
    function(size_only)
    {
        /// <summary>Encoding of current ASN.1 block into ASN.1 encoded array (BER rules)</summary>
        /// <param name="size_only" type="Boolean">Flag that we need only a size of encoding, not a real array of bytes</param>

        if(typeof size_only === "undefined")
            size_only = false;

        var ret_buf;

        var id_block_buf = this.id_block.toBER(size_only);
        var value_block_size_buf = this.value_block.toBER(true);

        this.len_block.length = value_block_size_buf.byteLength;
        var len_block_buf = this.len_block.toBER(size_only);

        ret_buf = util_concatbuf(id_block_buf, len_block_buf);

        var value_block_buf;

        if(size_only === false)
            value_block_buf = this.value_block.toBER(size_only);
        else
            value_block_buf = new ArrayBuffer(this.len_block.length);

        ret_buf = util_concatbuf(ret_buf, value_block_buf);

        if(this.len_block.is_indefinite_form === true)
        {
            var indef_buf = new ArrayBuffer(2);

            if(size_only === false)
            {
                var indef_view = new Uint8Array(indef_buf);

                indef_view[0] = 0x00;
                indef_view[1] = 0x00;
            }

            ret_buf = util_concatbuf(ret_buf, indef_buf);
        }

        return ret_buf;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.ASN1_block.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.base_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.ASN1_block.prototype.block_name.call(this);
        _object.id_block = this.id_block.toJSON();
        _object.len_block = this.len_block.toJSON();
        _object.value_block = this.value_block.toJSON();

        if("name" in this)
            _object.name = this.name;
        if("optional" in this)
            _object.optional = this.optional;
        if("primitive_schema" in this)
            _object.primitive_schema = this.primitive_schema.toJSON();

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Declaration of basic block for all PRIMITIVE types 
    //**************************************************************************************
    local.ASN1_PRIMITIVE_value_block =
    function()
    {
        /// <summary>Base class of ASN.1 value block for primitive values (non-constructive encoding)</summary>

        local.value_block.call(this, arguments[0]);

        if(arguments[0] instanceof Object)
        {
            // #region Variables from "hex_block" class 
            if("value_hex" in arguments[0])
                this.value_hex = util_copybuf(arguments[0].value_hex);
            else
                this.value_hex = new ArrayBuffer(0);

            this.is_hex_only = in_window.org.pkijs.getValue(arguments[0], "is_hex_only", true);
            // #endregion 
        }
        else
        {
            // #region Variables from "hex_block" class 
            this.value_hex = new ArrayBuffer(0);
            this.is_hex_only = true;
            // #endregion 
        }
    }
    //**************************************************************************************
    local.ASN1_PRIMITIVE_value_block.prototype = new local.value_block();
    local.ASN1_PRIMITIVE_value_block.constructor = local.ASN1_PRIMITIVE_value_block;
    //**************************************************************************************
    local.ASN1_PRIMITIVE_value_block.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        // #region Basic check for parameters 
        if(check_buffer_params.call(this, input_buffer, input_offset, input_length) === false)
            return (-1);
        // #endregion 

        // #region Getting Uint8Array from ArrayBuffer 
        var int_buffer = new Uint8Array(input_buffer, input_offset, input_length);
        // #endregion 

        // #region Initial checks 
        if(int_buffer.length == 0)
        {
            this.warnings.push("Zero buffer length");
            return input_offset;
        }
        // #endregion 

        // #region Copy input buffer into internal buffer 
        this.value_hex = new ArrayBuffer(int_buffer.length);
        var value_hex_view = new Uint8Array(this.value_hex);

        for(var i = 0; i < int_buffer.length; i++)
            value_hex_view[i] = int_buffer[i];
        // #endregion 

        this.block_length = input_length;

        return (input_offset + input_length);
    }
    //**************************************************************************************
    local.ASN1_PRIMITIVE_value_block.prototype.toBER =
    function(size_only)
    {
        /// <summary>Encoding of current ASN.1 block into ASN.1 encoded array (BER rules)</summary>
        /// <param name="size_only" type="Boolean">Flag that we need only a size of encoding, not a real array of bytes</param>

        return util_copybuf(this.value_hex);
    }
    //**************************************************************************************
    local.ASN1_PRIMITIVE_value_block.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "ASN1_PRIMITIVE_value_block";
    }
    //**************************************************************************************
    local.ASN1_PRIMITIVE_value_block.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.value_block.prototype.toJSON.call(this);

        _object.block_name = local.ASN1_PRIMITIVE_value_block.prototype.block_name.call(this);
        _object.value_hex = in_window.org.pkijs.bufferToHexCodes(this.value_hex, 0, this.value_hex.byteLength);
        _object.is_hex_only = this.is_hex_only;

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.ASN1_PRIMITIVE =
    function()
    {
        /// <summary>Base class of ASN.1 block for primitive values (non-constructive encoding)</summary>

        in_window.org.pkijs.asn1.ASN1_block.call(this, arguments[0]);

        this.id_block.is_constructed = false;
        this.value_block = new local.ASN1_PRIMITIVE_value_block(arguments[0]);
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.ASN1_PRIMITIVE.prototype = new in_window.org.pkijs.asn1.ASN1_block();
    in_window.org.pkijs.asn1.ASN1_PRIMITIVE.constructor = in_window.org.pkijs.asn1.ASN1_PRIMITIVE;
    //**************************************************************************************
    in_window.org.pkijs.asn1.ASN1_PRIMITIVE.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "PRIMITIVE";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.ASN1_PRIMITIVE.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.ASN1_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.ASN1_PRIMITIVE.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Declaration of basic block for all CONSTRUCTED types 
    //**************************************************************************************
    local.ASN1_CONSTRUCTED_value_block =
    function()
    {
        /// <summary>Base class of ASN.1 value block for constructive values (constructive encoding)</summary>

        local.value_block.call(this, arguments[0]);

        if(arguments[0] instanceof Object)
        {
            this.value = in_window.org.pkijs.getValue(arguments[0], "value", new Array());
            this.is_indefinite_form = in_window.org.pkijs.getValue(arguments[0], "is_indefinite_form", false);
        }
        else
        {
            this.value = new Array();
            this.is_indefinite_form = false;
        }
    }
    //**************************************************************************************
    local.ASN1_CONSTRUCTED_value_block.prototype = new local.value_block();
    local.ASN1_CONSTRUCTED_value_block.constructor = local.ASN1_CONSTRUCTED_value_block;
    //**************************************************************************************
    local.ASN1_CONSTRUCTED_value_block.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        // #region Store initial offset and length 
        var initial_offset = input_offset;
        var initial_length = input_length;
        // #endregion 

        // #region Basic check for parameters 
        if(check_buffer_params.call(this, input_buffer, input_offset, input_length) === false)
            return (-1);
        // #endregion 

        // #region Getting Uint8Array from ArrayBuffer 
        var int_buffer = new Uint8Array(input_buffer, input_offset, input_length);
        // #endregion 

        // #region Initial checks 
        if(int_buffer.length == 0)
        {
            this.warnings.push("Zero buffer length");
            return input_offset;
        }
        // #endregion 

        // #region Aux function 
        function check_len(_indefinite_length, _length)
        {
            if(_indefinite_length == true)
                return 1;

            return _length;
        }
        // #endregion 

        var current_offset = input_offset;

        while(check_len(this.is_indefinite_form, input_length) > 0)
        {
            var return_object = fromBER_raw(input_buffer, current_offset, input_length);
            if(return_object.offset == (-1))
            {
                this.error = return_object.result.error;
                this.warnings.concat(return_object.result.warnings);
                return (-1);
            }

            current_offset = return_object.offset;

            this.block_length += return_object.result.block_length;
            input_length -= return_object.result.block_length;

            this.value.push(return_object.result);

            if((this.is_indefinite_form == true) && (return_object.result.block_name() == in_window.org.pkijs.asn1.EOC.prototype.block_name()))
                break;
        }

        if(this.is_indefinite_form == true)
        {
            if(this.value[this.value.length - 1].block_name() == in_window.org.pkijs.asn1.EOC.prototype.block_name())
                this.value.pop();
            else
                this.warnings.push("No EOC block encoded");
        }

        // #region Copy "input_buffer" to "value_before_decode" 
        this.value_before_decode = util_copybuf_offset(input_buffer, initial_offset, initial_length);
        // #endregion 

        return current_offset;
    }
    //**************************************************************************************
    local.ASN1_CONSTRUCTED_value_block.prototype.toBER =
    function(size_only)
    {
        /// <summary>Encoding of current ASN.1 block into ASN.1 encoded array (BER rules)</summary>
        /// <param name="size_only" type="Boolean">Flag that we need only a size of encoding, not a real array of bytes</param>

        if(typeof size_only === "undefined")
            size_only = false;

        var ret_buf = new ArrayBuffer(0);

        for(var i = 0; i < this.value.length; i++)
        {
            var value_buf = this.value[i].toBER(size_only);
            ret_buf = util_concatbuf(ret_buf, value_buf);
        }

        return ret_buf;
    }
    //**************************************************************************************
    local.ASN1_CONSTRUCTED_value_block.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "ASN1_CONSTRUCTED_value_block";
    }
    //**************************************************************************************
    local.ASN1_CONSTRUCTED_value_block.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.value_block.prototype.toJSON.call(this);

        _object.block_name = local.ASN1_CONSTRUCTED_value_block.prototype.block_name.call(this);
        _object.is_indefinite_form = this.is_indefinite_form;
        _object.value = new Array();
        for(var i = 0; i < this.value.length; i++)
            _object.value.push(this.value[i].toJSON());

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.ASN1_CONSTRUCTED =
    function()
    {
        /// <summary>Base class of ASN.1 block for constructive values (constructive encoding)</summary>

        in_window.org.pkijs.asn1.ASN1_block.call(this, arguments[0]);

        this.id_block.is_constructed = true;
        this.value_block = new local.ASN1_CONSTRUCTED_value_block(arguments[0]);
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.ASN1_CONSTRUCTED.prototype = new in_window.org.pkijs.asn1.ASN1_block();
    in_window.org.pkijs.asn1.ASN1_CONSTRUCTED.constructor = in_window.org.pkijs.asn1.ASN1_CONSTRUCTED;
    //**************************************************************************************
    in_window.org.pkijs.asn1.ASN1_CONSTRUCTED.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "CONSTRUCTED";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.ASN1_CONSTRUCTED.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        this.value_block.is_indefinite_form = this.len_block.is_indefinite_form;

        var result_offset = this.value_block.fromBER(input_buffer, input_offset, (this.len_block.is_indefinite_form == true) ? input_length : this.len_block.length);
        if(result_offset == (-1))
        {
            this.error = this.value_block.error;
            return result_offset;
        }

        if(this.id_block.error.length == 0)
            this.block_length += this.id_block.block_length;

        if(this.len_block.error.length == 0)
            this.block_length += this.len_block.block_length;

        if(this.value_block.error.length == 0)
            this.block_length += this.value_block.block_length;

        return result_offset;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.ASN1_CONSTRUCTED.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.ASN1_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.ASN1_CONSTRUCTED.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Declaration of ASN.1 EOC type class
    //**************************************************************************************
    local.EOC_value_block =
    function()
    {
        local.value_block.call(this, arguments[0]);
    }
    //**************************************************************************************
    local.EOC_value_block.prototype = new local.value_block();
    local.EOC_value_block.constructor = local.EOC_value_block;
    //**************************************************************************************
    local.EOC_value_block.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        // #region There is no "value block" for EOC type and we need to return the same offset 
        return input_offset;
        // #endregion 
    }
    //**************************************************************************************
    local.EOC_value_block.prototype.toBER =
    function(size_only)
    {
        /// <summary>Encoding of current ASN.1 block into ASN.1 encoded array (BER rules)</summary>
        /// <param name="size_only" type="Boolean">Flag that we need only a size of encoding, not a real array of bytes</param>

        return (new ArrayBuffer(0));
    }
    //**************************************************************************************
    local.EOC_value_block.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "EOC_value_block";
    }
    //**************************************************************************************
    local.EOC_value_block.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.value_block.prototype.toJSON.call(this);

        _object.block_name = local.EOC_value_block.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.EOC =
    function()
    {
        in_window.org.pkijs.asn1.ASN1_block.call(this, arguments[0]);

        this.value_block = new local.EOC_value_block();

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 0; // EOC
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.EOC.prototype = new in_window.org.pkijs.asn1.ASN1_block();
    in_window.org.pkijs.asn1.EOC.constructor = local.EOC_value_block;
    //**************************************************************************************
    in_window.org.pkijs.asn1.EOC.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "END_OF_CONTENT";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.EOC.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.ASN1_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.EOC.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Declaration of ASN.1 BOOLEAN type class
    //**************************************************************************************
    local.BOOLEAN_value_block =
    function()
    {
        local.value_block.call(this, arguments[0]);

        if(arguments[0] instanceof Object)
        {
            this.value = in_window.org.pkijs.getValue(arguments[0], "value", false);

            // #region Variables from hex_block class 
            this.is_hex_only = in_window.org.pkijs.getValue(arguments[0], "is_hex_only", false);
            if("value_hex" in arguments[0])
                this.value_hex = util_copybuf(arguments[0].value_hex);
            else
            {
                this.value_hex = new ArrayBuffer(1);
                if(this.value === true)
                {
                    var view = new Uint8Array(this.value_hex);
                    view[0] = 0xFF;
                }
            }
            // #endregion 
        }
        else
        {
            this.value = false;

            // #region Variables from hex_block class 
            this.is_hex_only = false;
            this.value_hex = new ArrayBuffer(1);
            // #endregion 
        }
    }
    //**************************************************************************************
    local.BOOLEAN_value_block.prototype = new local.value_block();
    local.BOOLEAN_value_block.constructor = local.BOOLEAN_value_block;
    //**************************************************************************************
    local.BOOLEAN_value_block.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        // #region Basic check for parameters 
        if(check_buffer_params.call(this, input_buffer, input_offset, input_length) === false)
            return (-1);
        // #endregion 

        // #region Getting Uint8Array from ArrayBuffer 
        var int_buffer = new Uint8Array(input_buffer, input_offset, input_length);
        // #endregion 

        if(input_length > 1)
            this.warnings.push("BOOLEAN value encoded in more then 1 octet");

        if(int_buffer[0] == 0x00)
            this.value = false;
        else
            this.value = true;

        this.is_hex_only = true;

        // #region Copy input buffer to internal array 
        this.value_hex = new ArrayBuffer(int_buffer.length);
        var view = new Uint8Array(this.value_hex);

        for(var i = 0; i < int_buffer.length; i++)
            view[i] = int_buffer[i];
        // #endregion 

        this.block_length = input_length;

        return (input_offset + input_length);
    }
    //**************************************************************************************
    local.BOOLEAN_value_block.prototype.toBER =
    function(size_only)
    {
        /// <summary>Encoding of current ASN.1 block into ASN.1 encoded array (BER rules)</summary>
        /// <param name="size_only" type="Boolean">Flag that we need only a size of encoding, not a real array of bytes</param>

        if(typeof size_only === "undefined")
            size_only = false;

        return this.value_hex;
    }
    //**************************************************************************************
    local.BOOLEAN_value_block.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "BOOLEAN_value_block";
    }
    //**************************************************************************************
    local.BOOLEAN_value_block.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.value_block.prototype.toJSON.call(this);

        _object.block_name = local.BOOLEAN_value_block.prototype.block_name.call(this);
        _object.value = this.value;
        _object.is_hex_only = this.is_hex_only;
        _object.value_hex = in_window.org.pkijs.bufferToHexCodes(this.value_hex, 0, this.value_hex.byteLength)

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.BOOLEAN =
    function()
    {
        in_window.org.pkijs.asn1.ASN1_block.call(this, arguments[0]);

        this.value_block = new local.BOOLEAN_value_block(arguments[0]);

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 1; // BOOLEAN
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.BOOLEAN.prototype = new in_window.org.pkijs.asn1.ASN1_block();
    in_window.org.pkijs.asn1.BOOLEAN.constructor = local.BOOLEAN_value_block;
    //**************************************************************************************
    in_window.org.pkijs.asn1.BOOLEAN.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "BOOLEAN";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.BOOLEAN.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.ASN1_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.BOOLEAN.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Declaration of ASN.1 SEQUENCE and SET type classes
    //**************************************************************************************
    in_window.org.pkijs.asn1.SEQUENCE =
    function()
    {
        in_window.org.pkijs.asn1.ASN1_CONSTRUCTED.call(this, arguments[0]);

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 16; // SEQUENCE
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.SEQUENCE.prototype = new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED();
    in_window.org.pkijs.asn1.SEQUENCE.constructor = in_window.org.pkijs.asn1.SEQUENCE;
    //**************************************************************************************
    in_window.org.pkijs.asn1.SEQUENCE.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "SEQUENCE";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.SEQUENCE.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.ASN1_CONSTRUCTED.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.SEQUENCE.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.SET =
    function()
    {
        in_window.org.pkijs.asn1.ASN1_CONSTRUCTED.call(this, arguments[0]);

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 17; // SET
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.SET.prototype = new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED();
    in_window.org.pkijs.asn1.SET.constructor = in_window.org.pkijs.asn1.SET;
    //**************************************************************************************
    in_window.org.pkijs.asn1.SET.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "SET";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.SET.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.ASN1_CONSTRUCTED.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.SET.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Declaration of ASN.1 NULL type class 
    //**************************************************************************************
    in_window.org.pkijs.asn1.NULL =
    function()
    {
        in_window.org.pkijs.asn1.ASN1_block.call(this, arguments[0]);

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 5; // NULL
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.NULL.prototype = new in_window.org.pkijs.asn1.ASN1_block();
    in_window.org.pkijs.asn1.NULL.constructor = in_window.org.pkijs.asn1.NULL;
    //**************************************************************************************
    in_window.org.pkijs.asn1.NULL.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "NULL";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.NULL.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        if(this.len_block.length > 0)
            this.warnings.push("Non-zero length of value block for NULL type");

        if(this.id_block.error.length === 0)
            this.block_length += this.id_block.block_length;

        if(this.len_block.error.length === 0)
            this.block_length += this.len_block.block_length;

        this.block_length += input_length;

        return (input_offset + input_length);
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.NULL.prototype.toBER =
    function(size_only)
    {
        /// <summary>Encoding of current ASN.1 block into ASN.1 encoded array (BER rules)</summary>
        /// <param name="size_only" type="Boolean">Flag that we need only a size of encoding, not a real array of bytes</param>

        if(typeof size_only === "undefined")
            size_only = false;

        var ret_buf = new ArrayBuffer(2);

        if(size_only === true)
            return ret_buf;

        var ret_view = new Uint8Array(ret_buf);
        ret_view[0] = 0x05;
        ret_view[1] = 0x00;

        return ret_buf;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.NULL.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.ASN1_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.NULL.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Declaration of ASN.1 OCTETSTRING type class 
    //**************************************************************************************
    local.OCTETSTRING_value_block =
    function()
    {
        /// <param name="input_value_hex" type="ArrayBuffer"></param>
        /// <param name="input_value" type="Array"></param>
        /// <param name="input_constructed" type="Boolean"></param>
        /// <remarks>Value for the OCTETSTRING may be as hex, as well as a constructed value.</remarks>
        /// <remarks>Constructed values consists of other OCTETSTRINGs</remarks>

        local.ASN1_CONSTRUCTED_value_block.call(this, arguments[0]);

        if(arguments[0] instanceof Object)
        {
            this.is_constructed = in_window.org.pkijs.getValue(arguments[0], "is_constructed", false);

            // #region Variables from hex_block type 
            this.is_hex_only = in_window.org.pkijs.getValue(arguments[0], "is_hex_only", false);
            if("value_hex" in arguments[0])
                this.value_hex = util_copybuf(arguments[0].value_hex);
            else
                this.value_hex = new ArrayBuffer(0);
            // #endregion 
        }
        else
        {
            this.is_constructed = false;

            // #region Variables from hex_block type 
            this.is_hex_only = false;
            this.value_hex = new ArrayBuffer(0);
            // #endregion 
        }
    }
    //**************************************************************************************
    local.OCTETSTRING_value_block.prototype = new local.ASN1_CONSTRUCTED_value_block();
    local.OCTETSTRING_value_block.constructor = local.OCTETSTRING_value_block;
    //**************************************************************************************
    local.OCTETSTRING_value_block.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        var result_offset = 0;

        if(this.is_constructed == true)
        {
            this.is_hex_only = false;

            result_offset = local.ASN1_CONSTRUCTED_value_block.prototype.fromBER.call(this, input_buffer, input_offset, input_length);
            if(result_offset == (-1))
                return result_offset;

            for(var i = 0; i < this.value.length; i++)
            {
                var current_block_name = this.value[i].block_name();

                if(current_block_name == in_window.org.pkijs.asn1.EOC.prototype.block_name())
                {
                    if(this.is_indefinite_form == true)
                        break;
                    else
                    {
                        this.error = "EOC is unexpected, OCTET STRING may consists of OCTET STRINGs only";
                        return (-1);
                    }
                }

                if(current_block_name != in_window.org.pkijs.asn1.OCTETSTRING.prototype.block_name())
                {
                    this.error = "OCTET STRING may consists of OCTET STRINGs only";
                    return (-1);
                }
            }
        }
        else
        {
            this.is_hex_only = true;

            result_offset = local.hex_block.prototype.fromBER.call(this, input_buffer, input_offset, input_length);
            this.block_length = input_length;
        }

        return result_offset;
    }
    //**************************************************************************************
    local.OCTETSTRING_value_block.prototype.toBER =
    function(size_only)
    {
        /// <summary>Encoding of current ASN.1 block into ASN.1 encoded array (BER rules)</summary>
        /// <param name="size_only" type="Boolean">Flag that we need only a size of encoding, not a real array of bytes</param>

        if(typeof size_only === "undefined")
            size_only = false;

        if(this.is_constructed === true)
            return local.ASN1_CONSTRUCTED_value_block.prototype.toBER.call(this, size_only);
        else
        {
            var ret_buf = new ArrayBuffer(this.value_hex.byteLength);

            if(size_only === true)
                return ret_buf;

            if(this.value_hex.byteLength == 0)
                return ret_buf;

            ret_buf = util_copybuf(this.value_hex);

            return ret_buf;
        }

        return (new ArrayBuffer(0));
    }
    //**************************************************************************************
    local.OCTETSTRING_value_block.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "OCTETSTRING_value_block";
    }
    //**************************************************************************************
    local.OCTETSTRING_value_block.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.ASN1_CONSTRUCTED_value_block.prototype.toJSON.call(this);

        _object.block_name = local.OCTETSTRING_value_block.prototype.block_name.call(this);
        _object.is_constructed = this.is_constructed;
        _object.is_hex_only = this.is_hex_only;
        _object.value_hex = in_window.org.pkijs.bufferToHexCodes(this.value_hex, 0, this.value_hex.byteLength)

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.OCTETSTRING =
    function()
    {
        in_window.org.pkijs.asn1.ASN1_block.call(this, arguments[0]);

        this.value_block = new local.OCTETSTRING_value_block(arguments[0]);

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 4; // OCTETSTRING
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.OCTETSTRING.prototype = new in_window.org.pkijs.asn1.ASN1_block();
    in_window.org.pkijs.asn1.OCTETSTRING.constructor = in_window.org.pkijs.asn1.OCTETSTRING;
    //**************************************************************************************
    in_window.org.pkijs.asn1.OCTETSTRING.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        this.value_block.is_constructed = this.id_block.is_constructed;
        this.value_block.is_indefinite_form = this.len_block.is_indefinite_form;

        // #region Ability to encode empty OCTET STRING 
        if(input_length == 0)
        {
            if(this.id_block.error.length == 0)
                this.block_length += this.id_block.block_length;

            if(this.len_block.error.length == 0)
                this.block_length += this.len_block.block_length;

            return input_offset;
        }
        // #endregion 

        return in_window.org.pkijs.asn1.ASN1_block.prototype.fromBER.call(this, input_buffer, input_offset, input_length);
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.OCTETSTRING.prototype.block_name =
    function()
    {
        return "OCTETSTRING";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.OCTETSTRING.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.ASN1_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.OCTETSTRING.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Declaration of ASN.1 BITSTRING type class
    //**************************************************************************************
    local.BITSTRING_value_block =
    function()
    {
        local.ASN1_CONSTRUCTED_value_block.call(this, arguments[0]);

        if(arguments[0] instanceof Object)
        {
            this.unused_bits = in_window.org.pkijs.getValue(arguments[0], "unused_bits", 0);
            this.is_constructed = in_window.org.pkijs.getValue(arguments[0], "is_constructed", false);

            // #region Variables from hex_block type 
            this.is_hex_only = in_window.org.pkijs.getValue(arguments[0], "is_hex_only", false);

            if("value_hex" in arguments[0])
                this.value_hex = util_copybuf(arguments[0].value_hex);
            else
                this.value_hex = new ArrayBuffer(0);

            this.block_length = this.value_hex.byteLength;
            // #endregion 
        }
        else
        {
            this.unused_bits = 0;
            this.is_constructed = false;

            // #region Variables from hex_block type 
            this.is_hex_only = false;
            this.value_hex = new ArrayBuffer(0);
            // #endregion 
        }
    }
    //**************************************************************************************
    local.BITSTRING_value_block.prototype = new local.ASN1_CONSTRUCTED_value_block();
    local.BITSTRING_value_block.constructor = local.BITSTRING_value_block;
    //**************************************************************************************
    local.BITSTRING_value_block.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        // #region Ability to decode zero-length BITSTRING value 
        if(input_length == 0)
            return input_offset;
        // #endregion 

        var result_offset = (-1);

        // #region If the BISTRING supposed to be a constructed value 
        if(this.is_constructed == true)
        {
            result_offset = local.ASN1_CONSTRUCTED_value_block.prototype.fromBER.call(this, input_buffer, input_offset, input_length);
            if(result_offset == (-1))
                return result_offset;

            for(var i = 0; i < this.value.length; i++)
            {
                var current_block_name = this.value[i].block_name();

                if(current_block_name == in_window.org.pkijs.asn1.EOC.prototype.block_name())
                {
                    if(this.is_indefinite_form == true)
                        break;
                    else
                    {
                        this.error = "EOC is unexpected, BIT STRING may consists of BIT STRINGs only";
                        return (-1);
                    }
                }

                if(current_block_name != in_window.org.pkijs.asn1.BITSTRING.prototype.block_name())
                {
                    this.error = "BIT STRING may consists of BIT STRINGs only";
                    return (-1);
                }

                if((this.unused_bits > 0) && (this.value[i].unused_bits > 0))
                {
                    this.error = "Usign of \"unused bits\" inside constructive BIT STRING allowed for least one only";
                    return (-1);
                }
                else
                {
                    this.unused_bits = this.value[i].unused_bits;
                    if(this.unused_bits > 7)
                    {
                        this.error = "Unused bits for BITSTRING must be in range 0-7";
                        return (-1);
                    }
                }
            }

            return result_offset;
        }
            // #endregion 
        // #region If the BITSTRING supposed to be a primitive value
        else
        {
            // #region Basic check for parameters 
            if(check_buffer_params.call(this, input_buffer, input_offset, input_length) === false)
                return (-1);
            // #endregion 

            var int_buffer = new Uint8Array(input_buffer, input_offset, input_length);

            this.unused_bits = int_buffer[0];
            if(this.unused_bits > 7)
            {
                this.error = "Unused bits for BITSTRING must be in range 0-7";
                return (-1);
            }

            // #region Copy input buffer to internal buffer 
            this.value_hex = new ArrayBuffer(int_buffer.length - 1);
            var view = new Uint8Array(this.value_hex);
            for(var i = 0; i < (input_length - 1) ; i++)
                view[i] = int_buffer[i + 1];
            // #endregion 

            this.block_length = int_buffer.length;

            return (input_offset + input_length);
        }
        // #endregion 
    }
    //**************************************************************************************
    local.BITSTRING_value_block.prototype.toBER =
    function(size_only)
    {
        /// <summary>Encoding of current ASN.1 block into ASN.1 encoded array (BER rules)</summary>
        /// <param name="size_only" type="Boolean">Flag that we need only a size of encoding, not a real array of bytes</param>

        if(typeof size_only === "undefined")
            size_only = false;

        if(this.is_constructed === true)
            return local.ASN1_CONSTRUCTED_value_block.prototype.toBER.call(this, size_only);
        else
        {
            if(size_only === true)
                return (new ArrayBuffer(this.value_hex.byteLength + 1));

            if(this.value_hex.byteLength == 0)
                return (new ArrayBuffer(0));

            var cur_view = new Uint8Array(this.value_hex);

            var ret_buf = new ArrayBuffer(this.value_hex.byteLength + 1);
            var ret_view = new Uint8Array(ret_buf);

            ret_view[0] = this.unused_bits;

            for(var i = 0; i < this.value_hex.byteLength; i++)
                ret_view[i + 1] = cur_view[i];

            return ret_buf;
        }

        return (new ArrayBuffer(0));
    }
    //**************************************************************************************
    local.BITSTRING_value_block.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "BITSTRING_value_block";
    }
    //**************************************************************************************
    local.BITSTRING_value_block.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.ASN1_CONSTRUCTED_value_block.prototype.toJSON.call(this);

        _object.block_name = local.BITSTRING_value_block.prototype.block_name.call(this);
        _object.unused_bits = this.unused_bits;
        _object.is_constructed = this.is_constructed;
        _object.is_hex_only = this.is_hex_only;
        _object.value_hex = in_window.org.pkijs.bufferToHexCodes(this.value_hex, 0, this.value_hex.byteLength)

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.BITSTRING =
    function()
    {
        in_window.org.pkijs.asn1.ASN1_block.call(this, arguments[0]);

        this.value_block = new local.BITSTRING_value_block(arguments[0]);

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 3; // BITSTRING
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.BITSTRING.prototype = new in_window.org.pkijs.asn1.ASN1_block();
    in_window.org.pkijs.asn1.BITSTRING.constructor = in_window.org.pkijs.asn1.BITSTRING;
    //**************************************************************************************
    in_window.org.pkijs.asn1.BITSTRING.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "BITSTRING";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.BITSTRING.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        // #region Ability to encode empty BITSTRING 
        if(input_length == 0)
            return input_offset;
        // #endregion 

        this.value_block.is_constructed = this.id_block.is_constructed;
        this.value_block.is_indefinite_form = this.len_block.is_indefinite_form;

        return in_window.org.pkijs.asn1.ASN1_block.prototype.fromBER.call(this, input_buffer, input_offset, input_length);
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.BITSTRING.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.ASN1_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.BITSTRING.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Declaration of ASN.1 INTEGER type class 
    //**************************************************************************************
    local.INTEGER_value_block =
    function()
    {
        local.value_block.call(this, arguments[0]);

        if(arguments[0] instanceof Object)
        {
            this.value_dec = in_window.org.pkijs.getValue(arguments[0], "value", 0);

            // #region Variables from hex_block type 
            this.is_hex_only = in_window.org.pkijs.getValue(arguments[0], "is_hex_only", false);
            if("value_hex" in arguments[0])
            {
                this.value_hex = util_copybuf(arguments[0].value_hex);

                if(this.value_hex.byteLength >= 4) // Dummy's protection
                    this.is_hex_only = true;
                else
                    this.value_dec = util_decode_tc.call(this);
            }
            else
                this.value_hex = util_encode_tc(this.value_dec);
            // #endregion 
        }
        else
        {
            this.value_dec = 0;

            // #region Variables from hex_block type 
            this.is_hex_only = false;
            this.value_hex = new ArrayBuffer(0);
            // #endregion 
        }
    }
    //**************************************************************************************
    local.INTEGER_value_block.prototype = new local.value_block();
    local.INTEGER_value_block.constructor = local.INTEGER_value_block;
    //**************************************************************************************
    local.INTEGER_value_block.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        var result_offset = local.hex_block.prototype.fromBER.call(this, input_buffer, input_offset, input_length);
        if(result_offset == (-1))
            return result_offset;

        if(this.value_hex.byteLength > 4) // In JavaScript we can effectively work with 32-bit integers only
        {
            this.warnings.push("Too big INTEGER for decoding, hex only");
            this.is_hex_only = true;
        }
        else
            this.value_dec = util_decode_tc.call(this);

        this.block_length = input_length;

        return (input_offset + input_length);
    }
    //**************************************************************************************
    local.INTEGER_value_block.prototype.toBER =
    function(size_only)
    {
        /// <summary>Encoding of current ASN.1 block into ASN.1 encoded array (BER rules)</summary>
        /// <param name="size_only" type="Boolean">Flag that we need only a size of encoding, not a real array of bytes</param>

        if(typeof size_only === "undefined")
            size_only = false;

        if(this.is_hex_only === false)
        {
            var encoded_buf = util_encode_tc(this.value_dec);
            if(encoded_buf.byteLength == 0)
            {
                this.error = "Error during encoding INTEGER value";
                return (new ArrayBuffer(0));
            }

            return util_copybuf(encoded_buf);
        }
        else
            return util_copybuf(this.value_hex);

        return (new ArrayBuffer(0));
    }
    //**************************************************************************************
    local.INTEGER_value_block.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "INTEGER_value_block";
    }
    //**************************************************************************************
    local.INTEGER_value_block.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.value_block.prototype.toJSON.call(this);

        _object.block_name = local.INTEGER_value_block.prototype.block_name.call(this);
        _object.value_dec = this.value_dec;
        _object.is_hex_only = this.is_hex_only;
        _object.value_hex = in_window.org.pkijs.bufferToHexCodes(this.value_hex, 0, this.value_hex.byteLength)

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.INTEGER =
    function()
    {
        in_window.org.pkijs.asn1.ASN1_block.call(this, arguments[0]);

        this.value_block = new local.INTEGER_value_block(arguments[0]);

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 2; // INTEGER
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.INTEGER.prototype = new in_window.org.pkijs.asn1.ASN1_block();
    in_window.org.pkijs.asn1.INTEGER.constructor = in_window.org.pkijs.asn1.INTEGER;
    //**************************************************************************************
    in_window.org.pkijs.asn1.INTEGER.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "INTEGER";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.INTEGER.prototype.isEqual =
    function()
    {
        /// <summary>Compare two INTEGER object, or INTEGER and ArrayBuffer objects</summary>
        /// <returns type="Boolean"></returns>

        if(arguments[0] instanceof in_window.org.pkijs.asn1.INTEGER)
        {
            if(this.value_block.is_hex_only && arguments[0].value_block.is_hex_only) // Compare two ArrayBuffers
                return in_window.org.pkijs.isEqual_buffer(this.value_block.value_hex, arguments[0].value_block.value_hex);
            else
            {
                if(this.value_block.is_hex_only === arguments[0].value_block.is_hex_only)
                    return (this.value_block.value_dec == arguments[0].value_block.value_dec);
                else
                    return false;
            }
        }
        else
        {
            if(arguments[0] instanceof ArrayBuffer)
                return in_window.org.pkijs.isEqual_buffer(this.value_block.value_hex, arguments[0].value_block.value_hex);
            else
                return false;
        }

        return false;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.INTEGER.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.ASN1_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.INTEGER.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Declaration of ASN.1 ENUMERATED type class 
    //**************************************************************************************
    in_window.org.pkijs.asn1.ENUMERATED =
    function()
    {
        in_window.org.pkijs.asn1.INTEGER.call(this, arguments[0]);

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 10; // ENUMERATED
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.ENUMERATED.prototype = new in_window.org.pkijs.asn1.INTEGER();
    in_window.org.pkijs.asn1.ENUMERATED.constructor = in_window.org.pkijs.asn1.ENUMERATED;
    //**************************************************************************************
    in_window.org.pkijs.asn1.ENUMERATED.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "ENUMERATED";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.ENUMERATED.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.INTEGER.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.ENUMERATED.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Declaration of ASN.1 OBJECT IDENTIFIER type class 
    //**************************************************************************************
    local.SID_value_block =
    function()
    {
        local.hex_block.call(this, arguments[0]);

        if(arguments[0] instanceof Object)
        {
            this.value_dec = in_window.org.pkijs.getValue(arguments[0], "value_dec", -1);
            this.is_first_sid = in_window.org.pkijs.getValue(arguments[0], "is_first_sid", false);
        }
        else
        {
            this.value_dec = (-1);
            this.is_first_sid = false;
        }
    }
    //**************************************************************************************
    local.SID_value_block.prototype = new local.hex_block();
    local.SID_value_block.constructor = local.SID_value_block;
    //**************************************************************************************
    local.SID_value_block.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "sid_block";
    }
    //**************************************************************************************
    local.SID_value_block.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        if(input_length == 0)
            return input_offset;

        // #region Basic check for parameters 
        if(check_buffer_params.call(this, input_buffer, input_offset, input_length) === false)
            return (-1);
        // #endregion 

        var int_buffer = new Uint8Array(input_buffer, input_offset, input_length);

        this.value_hex = new ArrayBuffer(input_length);
        var view = new Uint8Array(this.value_hex);

        for(var i = 0; i < input_length; i++)
        {
            view[i] = int_buffer[i] & 0x7F;

            this.block_length++;

            if((int_buffer[i] & 0x80) == 0x00)
                break;
        }

        // #region Ajust size of value_hex buffer 
        var temp_value_hex = new ArrayBuffer(this.block_length);
        var temp_view = new Uint8Array(temp_value_hex);

        for(var i = 0; i < this.block_length; i++)
            temp_view[i] = view[i];

        this.value_hex = util_copybuf(temp_value_hex);
        view = new Uint8Array(this.value_hex);
        // #endregion   

        if((int_buffer[this.block_length - 1] & 0x80) != 0x00)
        {
            this.error = "End of input reached before message was fully decoded";
            return (-1);
        }

        if(view[0] == 0x00)
            this.warnings.push("Needlessly long format of SID encoding");

        if(this.block_length <= 8)
            this.value_dec = util_frombase(view, 7);
        else
        {
            this.is_hex_only = true;
            this.warnings.push("Too big SID for decoding, hex only");
        }

        return (input_offset + this.block_length);
    }
    //**************************************************************************************
    local.SID_value_block.prototype.toBER =
    function(size_only)
    {
        /// <summary>Encoding of current ASN.1 block into ASN.1 encoded array (BER rules)</summary>
        /// <param name="size_only" type="Boolean">Flag that we need only a size of encoding, not a real array of bytes</param>

        if(typeof size_only === "undefined")
            size_only = false;

        if(this.is_hex_only)
        {
            if(size_only === true)
                return (new ArrayBuffer(this.value_hex.byteLength));

            var cur_view = new Uint8Array(this.value_hex);

            var ret_buf = new ArrayBuffer(this.block_length);
            var ret_view = new Uint8Array(ret_buf);

            for(var i = 0; i < ( this.block_length - 1 ); i++ )
                ret_view[i] = cur_view[i] | 0x80;

            ret_view[this.block_length - 1] = cur_view[this.block_length - 1];
        }

        var encoded_buf = util_tobase(this.value_dec, 7);
        if(encoded_buf.byteLength === 0)
        {
            this.error = "Error during encoding SID value";
            return (new ArrayBuffer(0));
        }

        var ret_buf = new ArrayBuffer(encoded_buf.byteLength);

        if(size_only === false)
        {
            var encoded_view = new Uint8Array(encoded_buf);
            var ret_view = new Uint8Array(ret_buf);

            for(var i = 0; i < (encoded_buf.byteLength - 1) ; i++)
                ret_view[i] = encoded_view[i] | 0x80;

            ret_view[encoded_buf.byteLength - 1] = encoded_view[encoded_buf.byteLength - 1];
        }

        return ret_buf;
    }
    //**************************************************************************************
    local.SID_value_block.prototype.toString =
    function()
    {
        var result = "";

        if(this.is_hex_only === true)
            result = to_hex_codes(this.value_hex);
        else
        {
            if(this.is_first_sid)
            {
                var sid_value = this.value_dec;

                if(this.value_dec <= 39)
                    result = "0.";
                else
                {
                    if(this.value_dec <= 79)
                    {
                        result = "1.";
                        sid_value -= 40;
                    }
                    else
                    {
                        result = "2.";
                        sid_value -= 80;
                    }
                }

                result = result + sid_value.toString();
            }
            else
                result = this.value_dec.toString();
        }

        return result;
    }
    //**************************************************************************************
    local.SID_value_block.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.hex_block.prototype.toJSON.call(this);

        _object.block_name = local.SID_value_block.prototype.block_name.call(this);
        _object.value_dec = this.value_dec;
        _object.is_first_sid = this.is_first_sid;

        return _object;
    }
    //**************************************************************************************
    local.OID_value_block =
    function()
    {
        local.value_block.call(this, arguments[0]);

        this.value = new Array();

        if(arguments[0] instanceof Object)
            this.fromString(in_window.org.pkijs.getValue(arguments[0], "value", ""));
    }
    //**************************************************************************************
    local.OID_value_block.prototype = new local.value_block();
    local.OID_value_block.constructor = local.OID_value_block;
    //**************************************************************************************
    local.OID_value_block.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        var result_offset = input_offset;

        while(input_length > 0)
        {
            var sid_block = new local.SID_value_block();
            result_offset = sid_block.fromBER(input_buffer, result_offset, input_length);
            if(result_offset == (-1))
            {
                this.block_length = 0;
                this.error = sid_block.error;
                return result_offset;
            }

            if(this.value.length == 0)
                sid_block.is_first_sid = true;

            this.block_length += sid_block.block_length;
            input_length -= sid_block.block_length;

            this.value.push(sid_block);
        }

        return result_offset;
    }
    //**************************************************************************************
    local.OID_value_block.prototype.toBER =
    function(size_only)
    {
        /// <summary>Encoding of current ASN.1 block into ASN.1 encoded array (BER rules)</summary>
        /// <param name="size_only" type="Boolean">Flag that we need only a size of encoding, not a real array of bytes</param>

        if(typeof size_only === "undefined")
            size_only = false;

        var ret_buf = new ArrayBuffer(0);

        for(var i = 0; i < this.value.length; i++)
        {
            var value_buf = this.value[i].toBER(size_only);
            if(value_buf.byteLength === 0)
            {
                this.error = this.value[i].error;
                return (new ArrayBuffer(0));
            }

            ret_buf = util_concatbuf(ret_buf, value_buf);
        }

        return ret_buf;
    }
    //**************************************************************************************
    local.OID_value_block.prototype.fromString =
    function(str)
    {
        this.value = new Array(); // Clear existing SID values

        var pos1 = 0;
        var pos2 = 0;

        var sid = "";

        var flag = false;

        do
        {
            pos2 = str.indexOf('.', pos1);
            if(pos2 === (-1))
                sid = str.substr(pos1);
            else
                sid = str.substr(pos1, pos2 - pos1);

            pos1 = pos2 + 1;

            if(flag)
            {
                var sid_block = this.value[0];

                var plus = 0;

                switch(sid_block.value_dec)
                {
                    case 0:
                        break;
                    case 1:
                        plus = 40;
                        break;
                    case 2:
                        plus = 80;
                        break;
                    default:
                        this.value = new Array(); // clear SID array
                        return false; // ???
                }

                var parsedSID = parseInt(sid, 10);
                if(Number.isNaN(parsedSID))
                    return true;

                sid_block.value_dec = parsedSID + plus;

                flag = false;
            }
            else
            {
                var sid_block = new local.SID_value_block();
                sid_block.value_dec = parseInt(sid, 10);
                if(Number.isNaN(sid_block.value_dec))
                    return true;

                if(this.value.length === 0)
                {
                    sid_block.is_first_sid = true;
                    flag = true;
                }

                this.value.push(sid_block);
            }

        } while(pos2 !== (-1));

        return true;
    }
    //**************************************************************************************
    local.OID_value_block.prototype.toString =
    function()
    {
        var result = "";
        var is_hex_only = false;

        for(var i = 0; i < this.value.length; i++)
        {
            is_hex_only = this.value[i].is_hex_only;

            var sid_str = this.value[i].toString();

            if(i !== 0)
                result = result + ".";

            if(is_hex_only)
            {
                sid_str = "{" + sid_str + "}";

                if(this.value[i].is_first_sid)
                    result = "2.{" + sid_str + " - 80}";
                else
                    result = result + sid_str;
            }
            else
                result = result + sid_str;
        }

        return result;
    }
    //**************************************************************************************
    local.OID_value_block.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "OID_value_block";
    }
    //**************************************************************************************
    local.OID_value_block.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.value_block.prototype.toJSON.call(this);

        _object.block_name = local.OID_value_block.prototype.block_name.call(this);
        _object.value = local.OID_value_block.prototype.toString.call(this);
        _object.sid_array = new Array();
        for(var i = 0; i < this.value.length; i++)
            _object.sid_array.push(this.value[i].toJSON());

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.OID =
    function()
    {
        in_window.org.pkijs.asn1.ASN1_block.call(this, arguments[0]);

        this.value_block = new local.OID_value_block(arguments[0]);

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 6; // OBJECT IDENTIFIER
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.OID.prototype = new in_window.org.pkijs.asn1.ASN1_block();
    in_window.org.pkijs.asn1.OID.constructor = in_window.org.pkijs.asn1.OID;
    //**************************************************************************************
    in_window.org.pkijs.asn1.OID.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "OID";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.OID.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.ASN1_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.OID.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    // #endregion   
    //**************************************************************************************
    // #region Declaration of all string's classes 
    //**************************************************************************************
    local.UTF8STRING_value_block =
    function()
    {
        local.hex_block.call(this, arguments[0]);

        this.is_hex_only = true;
        this.value = ""; // String representation of decoded ArrayBuffer
    }
    //**************************************************************************************
    local.UTF8STRING_value_block.prototype = new local.hex_block();
    local.UTF8STRING_value_block.constructor = local.UTF8STRING_value_block;
    //**************************************************************************************
    local.UTF8STRING_value_block.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "UTF8STRING_value_block";
    }
    //**************************************************************************************
    local.UTF8STRING_value_block.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.hex_block.prototype.toJSON.call(this);

        _object.block_name = local.UTF8STRING_value_block.prototype.block_name.call(this);
        _object.value = this.value;

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.UTF8STRING =
    function()
    {
        in_window.org.pkijs.asn1.ASN1_block.call(this, arguments[0]);

        this.value_block = new local.UTF8STRING_value_block();

        if(arguments[0] instanceof Object)
        {
            if("value" in arguments[0])
                in_window.org.pkijs.asn1.UTF8STRING.prototype.fromString.call(this,arguments[0].value);
        }

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 12; // UTF8STRING
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.UTF8STRING.prototype = new in_window.org.pkijs.asn1.ASN1_block();
    in_window.org.pkijs.asn1.UTF8STRING.constructor = in_window.org.pkijs.asn1.UTF8STRING;
    //**************************************************************************************
    in_window.org.pkijs.asn1.UTF8STRING.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "UTF8STRING";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.UTF8STRING.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        var result_offset = this.value_block.fromBER(input_buffer, input_offset, (this.len_block.is_indefinite_form == true) ? input_length : this.len_block.length);
        if(result_offset == (-1))
        {
            this.error = this.value_block.error;
            return result_offset;
        }

        in_window.org.pkijs.asn1.UTF8STRING.prototype.fromBuffer.call(this, this.value_block.value_hex);

        if(this.id_block.error.length == 0)
            this.block_length += this.id_block.block_length;

        if(this.len_block.error.length == 0)
            this.block_length += this.len_block.block_length;

        if(this.value_block.error.length == 0)
            this.block_length += this.value_block.block_length;

        return result_offset;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.UTF8STRING.prototype.fromBuffer =
    function(input_buffer)
    {
        /// <param name="input_buffer" type="ArrayBuffer">Array with encoded string</param>
        this.value_block.value = String.fromCharCode.apply(null, new Uint8Array(input_buffer));

        try
        {
            this.value_block.value = decodeURIComponent(escape(this.value_block.value));
        }
        catch(ex)
        {
            this.warnings.push("Error during \"decodeURIComponent\": " + ex + ", using raw string");
        }
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.UTF8STRING.prototype.fromString =
    function(input_string)
    {
        /// <param name="input_string" type="String">String with UNIVERSALSTRING value</param>

        var str = unescape(encodeURIComponent(input_string));
        var str_len = str.length;

        this.value_block.value_hex = new ArrayBuffer(str_len);
        var view = new Uint8Array(this.value_block.value_hex);

        for(var i = 0; i < str_len; i++)
            view[i] = str.charCodeAt(i);

        this.value_block.value = input_string;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.UTF8STRING.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.ASN1_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.UTF8STRING.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    local.BMPSTRING_value_block =
    function()
    {
        local.hex_block.call(this, arguments[0]);

        this.is_hex_only = true;
        this.value = "";
    }
    //**************************************************************************************
    local.BMPSTRING_value_block.prototype = new local.hex_block();
    local.BMPSTRING_value_block.constructor = local.BMPSTRING_value_block;
    //**************************************************************************************
    local.BMPSTRING_value_block.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "BMPSTRING_value_block";
    }
    //**************************************************************************************
    local.BMPSTRING_value_block.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.hex_block.prototype.toJSON.call(this);

        _object.block_name = local.BMPSTRING_value_block.prototype.block_name.call(this);
        _object.value = this.value;

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.BMPSTRING =
    function()
    {
        in_window.org.pkijs.asn1.ASN1_block.call(this, arguments[0]);

        this.value_block = new local.BMPSTRING_value_block();

        if(arguments[0] instanceof Object)
        {
            if("value" in arguments[0])
                in_window.org.pkijs.asn1.BMPSTRING.prototype.fromString.call(this, arguments[0].value);
        }

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 30; // BMPSTRING
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.BMPSTRING.prototype = new in_window.org.pkijs.asn1.ASN1_block();
    in_window.org.pkijs.asn1.BMPSTRING.constructor = in_window.org.pkijs.asn1.BMPSTRING;
    //**************************************************************************************
    in_window.org.pkijs.asn1.BMPSTRING.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "BMPSTRING";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.BMPSTRING.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        var result_offset = this.value_block.fromBER(input_buffer, input_offset, (this.len_block.is_indefinite_form == true) ? input_length : this.len_block.length);
        if(result_offset == (-1))
        {
            this.error = this.value_block.error;
            return result_offset;
        }

        in_window.org.pkijs.asn1.BMPSTRING.prototype.fromBuffer.call(this, this.value_block.value_hex);

        if(this.id_block.error.length == 0)
            this.block_length += this.id_block.block_length;

        if(this.len_block.error.length == 0)
            this.block_length += this.len_block.block_length;

        if(this.value_block.error.length == 0)
            this.block_length += this.value_block.block_length;

        return result_offset;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.BMPSTRING.prototype.fromBuffer =
    function(input_buffer)
    {
        /// <param name="input_buffer" type="ArrayBuffer">Array with encoded string</param>

        var copy_buffer = in_window.org.pkijs.copyBuffer(input_buffer);

        var value_view = new Uint8Array(copy_buffer);

        for(var i = 0; i < value_view.length; i = i + 2)
        {
            var temp = value_view[i];

            value_view[i] = value_view[i + 1];
            value_view[i + 1] = temp;
        }

        this.value_block.value = String.fromCharCode.apply(null, new Uint16Array(copy_buffer));
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.BMPSTRING.prototype.fromString =
    function(input_string)
    {
        /// <param name="input_string" type="String">String with UNIVERSALSTRING value</param>

        var str_length = input_string.length;

        this.value_block.value_hex = new ArrayBuffer(str_length * 2);
        var value_hex_view = new Uint8Array(this.value_block.value_hex);

        for(var i = 0; i < str_length; i++)
        {
            var code_buf = util_tobase(input_string.charCodeAt(i), 8);
            var code_view = new Uint8Array(code_buf);
            if(code_view.length > 2)
                continue;

            var dif = 2 - code_view.length;

            for(var j = (code_view.length - 1) ; j >= 0; j--)
                value_hex_view[i * 2 + j + dif] = code_view[j];
        }

        this.value_block.value = input_string;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.BMPSTRING.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.ASN1_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.BMPSTRING.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    local.UNIVERSALSTRING_value_block =
    function()
    {
        local.hex_block.call(this, arguments[0]);

        this.is_hex_only = true;
        this.value = "";
    }
    //**************************************************************************************
    local.UNIVERSALSTRING_value_block.prototype = new local.hex_block();
    local.UNIVERSALSTRING_value_block.constructor = local.UNIVERSALSTRING_value_block;
    //**************************************************************************************
    local.UNIVERSALSTRING_value_block.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "UNIVERSALSTRING_value_block";
    }
    //**************************************************************************************
    local.UNIVERSALSTRING_value_block.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.hex_block.prototype.toJSON.call(this);

        _object.block_name = local.UNIVERSALSTRING_value_block.prototype.block_name.call(this);
        _object.value = this.value;

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.UNIVERSALSTRING =
    function()
    {
        in_window.org.pkijs.asn1.ASN1_block.call(this, arguments[0]);

        this.value_block = new local.UNIVERSALSTRING_value_block();

        if(arguments[0] instanceof Object)
        {
            if("value" in arguments[0])
                in_window.org.pkijs.asn1.UNIVERSALSTRING.prototype.fromString.call(this, arguments[0].value);
        }

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 28; // UNIVERSALSTRING
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.UNIVERSALSTRING.prototype = new in_window.org.pkijs.asn1.ASN1_block();
    in_window.org.pkijs.asn1.UNIVERSALSTRING.constructor = in_window.org.pkijs.asn1.UNIVERSALSTRING;
    //**************************************************************************************
    in_window.org.pkijs.asn1.UNIVERSALSTRING.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "UNIVERSALSTRING";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.UNIVERSALSTRING.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        var result_offset = this.value_block.fromBER(input_buffer, input_offset, (this.len_block.is_indefinite_form == true) ? input_length : this.len_block.length);
        if(result_offset == (-1))
        {
            this.error = this.value_block.error;
            return result_offset;
        }

        in_window.org.pkijs.asn1.UNIVERSALSTRING.prototype.fromBuffer.call(this, this.value_block.value_hex);

        if(this.id_block.error.length == 0)
            this.block_length += this.id_block.block_length;

        if(this.len_block.error.length == 0)
            this.block_length += this.len_block.block_length;

        if(this.value_block.error.length == 0)
            this.block_length += this.value_block.block_length;

        return result_offset;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.UNIVERSALSTRING.prototype.fromBuffer =
    function(input_buffer)
    {
        /// <param name="input_buffer" type="ArrayBuffer">Array with encoded string</param>

        var copy_buffer = in_window.org.pkijs.copyBuffer(input_buffer);

        var value_view = new Uint8Array(copy_buffer);

        for(var i = 0; i < value_view.length; i = i + 4)
        {
            value_view[i] = value_view[i + 3];
            value_view[i + 1] = value_view[i + 2];
            value_view[i + 2] = 0x00;
            value_view[i + 3] = 0x00;
        }

        this.value_block.value = String.fromCharCode.apply(null, new Uint32Array(copy_buffer));
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.UNIVERSALSTRING.prototype.fromString =
    function(input_string)
    {
        /// <param name="input_string" type="String">String with UNIVERSALSTRING value</param>

        var str_length = input_string.length;

        this.value_block.value_hex = new ArrayBuffer(str_length * 4);
        var value_hex_view = new Uint8Array(this.value_block.value_hex);

        for(var i = 0; i < str_length; i++)
        {
            var code_buf = util_tobase(input_string.charCodeAt(i), 8);
            var code_view = new Uint8Array(code_buf);
            if(code_view.length > 4)
                continue;

            var dif = 4 - code_view.length;

            for(var j = (code_view.length - 1) ; j >= 0; j--)
                value_hex_view[i*4 + j + dif] = code_view[j];
        }

        this.value_block.value = input_string;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.UNIVERSALSTRING.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.ASN1_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.UNIVERSALSTRING.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    local.SIMPLESTRING_value_block =
    function()
    {
        local.hex_block.call(this, arguments[0]);

        /// <field type="String">Native string representation</field>
        this.value = "";
        this.is_hex_only = true;
    }
    //**************************************************************************************
    local.SIMPLESTRING_value_block.prototype = new local.hex_block();
    local.SIMPLESTRING_value_block.constructor = local.SIMPLESTRING_value_block;
    //**************************************************************************************
    local.SIMPLESTRING_value_block.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "SIMPLESTRING_value_block";
    }
    //**************************************************************************************
    local.SIMPLESTRING_value_block.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.hex_block.prototype.toJSON.call(this);

        _object.block_name = local.SIMPLESTRING_value_block.prototype.block_name.call(this);
        _object.value = this.value;

        return _object;
    }
    //**************************************************************************************
    local.SIMPLESTRING_block =
    function()
    {
        in_window.org.pkijs.asn1.ASN1_block.call(this, arguments[0]);

        this.value_block = new local.SIMPLESTRING_value_block();

        if(arguments[0] instanceof Object)
        {
            if("value" in arguments[0])
                local.SIMPLESTRING_block.prototype.fromString.call(this, arguments[0].value);
        }
    }
    //**************************************************************************************
    local.SIMPLESTRING_block.prototype = new in_window.org.pkijs.asn1.ASN1_block();
    local.SIMPLESTRING_block.constructor = local.SIMPLESTRING_block;
    //**************************************************************************************
    local.SIMPLESTRING_block.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "SIMPLESTRING";
    }
    //**************************************************************************************
    local.SIMPLESTRING_block.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        var result_offset = this.value_block.fromBER(input_buffer, input_offset, (this.len_block.is_indefinite_form == true) ? input_length : this.len_block.length);
        if(result_offset == (-1))
        {
            this.error = this.value_block.error;
            return result_offset;
        }

        local.SIMPLESTRING_block.prototype.fromBuffer.call(this, this.value_block.value_hex);

        if(this.id_block.error.length == 0)
            this.block_length += this.id_block.block_length;

        if(this.len_block.error.length == 0)
            this.block_length += this.len_block.block_length;

        if(this.value_block.error.length == 0)
            this.block_length += this.value_block.block_length;

        return result_offset;
    }
    //**************************************************************************************
    local.SIMPLESTRING_block.prototype.fromBuffer =
    function(input_buffer)
    {
        /// <param name="input_buffer" type="ArrayBuffer">Array with encoded string</param>

        this.value_block.value = String.fromCharCode.apply(null, new Uint8Array(input_buffer));
    }
    //**************************************************************************************
    local.SIMPLESTRING_block.prototype.fromString =
    function(input_string)
    {
        /// <param name="input_string" type="String">String with UNIVERSALSTRING value</param>
        var str_len = input_string.length;

        this.value_block.value_hex = new ArrayBuffer(str_len);
        var view = new Uint8Array(this.value_block.value_hex);

        for(var i = 0; i < str_len; i++)
            view[i] = input_string.charCodeAt(i);

        this.value_block.value = input_string;
    }
    //**************************************************************************************
    local.SIMPLESTRING_block.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.ASN1_block.prototype.toJSON.call(this);

        _object.block_name = local.SIMPLESTRING_block.prototype.block_name.call(this);
        _object.block_name = local.value_block.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.NUMERICSTRING =
    function()
    {
        local.SIMPLESTRING_block.call(this, arguments[0]);

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 18; // NUMERICSTRING
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.NUMERICSTRING.prototype = new local.SIMPLESTRING_block();
    in_window.org.pkijs.asn1.NUMERICSTRING.constructor = in_window.org.pkijs.asn1.NUMERICSTRING;
    //**************************************************************************************
    in_window.org.pkijs.asn1.NUMERICSTRING.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "NUMERICSTRING";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.NUMERICSTRING.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.SIMPLESTRING_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.NUMERICSTRING.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.PRINTABLESTRING =
    function()
    {
        local.SIMPLESTRING_block.call(this, arguments[0]);

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 19; // PRINTABLESTRING
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.PRINTABLESTRING.prototype = new local.SIMPLESTRING_block();
    in_window.org.pkijs.asn1.PRINTABLESTRING.constructor = in_window.org.pkijs.asn1.PRINTABLESTRING;
    //**************************************************************************************
    in_window.org.pkijs.asn1.PRINTABLESTRING.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "PRINTABLESTRING";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.PRINTABLESTRING.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.SIMPLESTRING_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.PRINTABLESTRING.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.TELETEXSTRING =
    function()
    {
        local.SIMPLESTRING_block.call(this, arguments[0]);

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 20; // TELETEXSTRING
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.TELETEXSTRING.prototype = new local.SIMPLESTRING_block();
    in_window.org.pkijs.asn1.TELETEXSTRING.constructor = in_window.org.pkijs.asn1.TELETEXSTRING;
    //**************************************************************************************
    in_window.org.pkijs.asn1.TELETEXSTRING.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "TELETEXSTRING";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.TELETEXSTRING.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.SIMPLESTRING_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.TELETEXSTRING.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.VIDEOTEXSTRING =
    function()
    {
        local.SIMPLESTRING_block.call(this, arguments[0]);

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 21; // VIDEOTEXSTRING
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.VIDEOTEXSTRING.prototype = new local.SIMPLESTRING_block();
    in_window.org.pkijs.asn1.VIDEOTEXSTRING.constructor = in_window.org.pkijs.asn1.VIDEOTEXSTRING;
    //**************************************************************************************
    in_window.org.pkijs.asn1.VIDEOTEXSTRING.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "VIDEOTEXSTRING";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.VIDEOTEXSTRING.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.SIMPLESTRING_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.VIDEOTEXSTRING.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.IA5STRING =
    function()
    {
        local.SIMPLESTRING_block.call(this, arguments[0]);

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 22; // IA5STRING
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.IA5STRING.prototype = new local.SIMPLESTRING_block();
    in_window.org.pkijs.asn1.IA5STRING.constructor = in_window.org.pkijs.asn1.IA5STRING;
    //**************************************************************************************
    in_window.org.pkijs.asn1.IA5STRING.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "IA5STRING";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.IA5STRING.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.SIMPLESTRING_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.IA5STRING.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.GRAPHICSTRING =
    function()
    {
        local.SIMPLESTRING_block.call(this, arguments[0]);

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 25; // GRAPHICSTRING
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.GRAPHICSTRING.prototype = new local.SIMPLESTRING_block();
    in_window.org.pkijs.asn1.GRAPHICSTRING.constructor = in_window.org.pkijs.asn1.GRAPHICSTRING;
    //**************************************************************************************
    in_window.org.pkijs.asn1.GRAPHICSTRING.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "GRAPHICSTRING";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.GRAPHICSTRING.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.SIMPLESTRING_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.GRAPHICSTRING.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.VISIBLESTRING =
    function()
    {
        local.SIMPLESTRING_block.call(this, arguments[0]);

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 26; // VISIBLESTRING
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.VISIBLESTRING.prototype = new local.SIMPLESTRING_block();
    in_window.org.pkijs.asn1.VISIBLESTRING.constructor = in_window.org.pkijs.asn1.VISIBLESTRING;
    //**************************************************************************************
    in_window.org.pkijs.asn1.VISIBLESTRING.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "VISIBLESTRING";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.VISIBLESTRING.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.SIMPLESTRING_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.VISIBLESTRING.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.GENERALSTRING =
    function()
    {
        local.SIMPLESTRING_block.call(this, arguments[0]);

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 27; // GENERALSTRING
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.GENERALSTRING.prototype = new local.SIMPLESTRING_block();
    in_window.org.pkijs.asn1.GENERALSTRING.constructor = in_window.org.pkijs.asn1.GENERALSTRING;
    //**************************************************************************************
    in_window.org.pkijs.asn1.GENERALSTRING.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "GENERALSTRING";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.GENERALSTRING.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.SIMPLESTRING_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.GENERALSTRING.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.CHARACTERSTRING =
    function()
    {
        local.SIMPLESTRING_block.call(this, arguments[0]);

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 29; // CHARACTERSTRING
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.CHARACTERSTRING.prototype = new local.SIMPLESTRING_block();
    in_window.org.pkijs.asn1.CHARACTERSTRING.constructor = in_window.org.pkijs.asn1.CHARACTERSTRING;
    //**************************************************************************************
    in_window.org.pkijs.asn1.CHARACTERSTRING.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "CHARACTERSTRING";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.CHARACTERSTRING.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = local.SIMPLESTRING_block.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.CHARACTERSTRING.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Declaration of all date and time classes 
    //**************************************************************************************
    in_window.org.pkijs.asn1.UTCTIME =
    function()
    {
        in_window.org.pkijs.asn1.VISIBLESTRING.call(this, arguments[0]);

        this.year = 0;
        this.month = 0;
        this.day = 0;
        this.hour = 0;
        this.minute = 0;
        this.second = 0;

        // #region Create UTCTIME from ASN.1 UTC string value 
        if((arguments[0] instanceof Object) && ("value" in arguments[0]))
        {
            in_window.org.pkijs.asn1.UTCTIME.prototype.fromString.call(this, arguments[0].value);

            this.value_block.value_hex = new ArrayBuffer(arguments[0].value.length);
            var view = new Uint8Array(this.value_block.value_hex);

            for(var i = 0; i < str.length; i++)
                view[i] = arguments[0].value.charCodeAt(i);
        }
        // #endregion 
        // #region Create UTCTIME from JavaScript Date type 
        if((arguments[0] instanceof Object) && ("value_date" in arguments[0]))
        {
            in_window.org.pkijs.asn1.UTCTIME.prototype.fromDate.call(this, arguments[0].value_date);
            this.value_block.value_hex = in_window.org.pkijs.asn1.UTCTIME.prototype.toBuffer.call(this);
        }
        // #endregion 

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 23; // UTCTIME
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.UTCTIME.prototype = new in_window.org.pkijs.asn1.VISIBLESTRING();
    in_window.org.pkijs.asn1.UTCTIME.constructor = in_window.org.pkijs.asn1.UTCTIME;
    //**************************************************************************************
    in_window.org.pkijs.asn1.UTCTIME.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        var result_offset = this.value_block.fromBER(input_buffer, input_offset, (this.len_block.is_indefinite_form == true) ? input_length : this.len_block.length);
        if(result_offset == (-1))
        {
            this.error = this.value_block.error;
            return result_offset;
        }

        in_window.org.pkijs.asn1.UTCTIME.prototype.fromBuffer.call(this, this.value_block.value_hex);

        if(this.id_block.error.length == 0)
            this.block_length += this.id_block.block_length;

        if(this.len_block.error.length == 0)
            this.block_length += this.len_block.block_length;

        if(this.value_block.error.length == 0)
            this.block_length += this.value_block.block_length;

        return result_offset;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.UTCTIME.prototype.fromBuffer =
    function(input_buffer)
    {
        in_window.org.pkijs.asn1.UTCTIME.prototype.fromString.call(this, String.fromCharCode.apply(null, new Uint8Array(input_buffer)));
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.UTCTIME.prototype.toBuffer =
    function()
    {
        var str = in_window.org.pkijs.asn1.UTCTIME.prototype.toString.call(this);

        var buffer = new ArrayBuffer(str.length);
        var view = new Uint8Array(buffer);

        for(var i = 0; i < str.length; i++)
            view[i] = str.charCodeAt(i);

        return buffer;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.UTCTIME.prototype.fromDate =
    function(input_date)
    {
        /// <summary>Create "UTCTime" ASN.1 type from JavaScript "Date" type</summary>

        this.year = input_date.getFullYear();
        this.month = input_date.getMonth() + 1;
        this.day = input_date.getDate();
        this.hour = input_date.getHours();
        this.minute = input_date.getMinutes();
        this.second = input_date.getSeconds();
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.UTCTIME.prototype.toDate =
    function()
    {
        return (new Date(this.year, this.month - 1, this.day, this.hour, this.minute, this.second));
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.UTCTIME.prototype.fromString =
    function(input_string)
    {
        /// <summary>Create "UTCTime" ASN.1 type from JavaScript "String" type</summary>

        // #region Parse input string 
        var parser = /(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z/ig;
        var parser_array = parser.exec(input_string);
        if(parser_array === null)
        {
            this.error = "Wrong input string for convertion";
            return;
        }
        // #endregion 

        // #region Store parsed values 
        var year = parseInt(parser_array[1], 10);
        if(year >= 50)
            this.year = 1900 + year;
        else
            this.year = 2000 + year;

        this.month = parseInt(parser_array[2], 10);
        this.day = parseInt(parser_array[3], 10);
        this.hour = parseInt(parser_array[4], 10);
        this.minute = parseInt(parser_array[5], 10);
        this.second = parseInt(parser_array[6], 10);
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.UTCTIME.prototype.toString =
    function()
    {
        var output_array = new Array(7);

        output_array[0] = in_window.org.pkijs.padNumber(((this.year < 2000) ? (this.year - 1900) : (this.year - 2000)), 2);
        output_array[1] = in_window.org.pkijs.padNumber(this.month, 2);
        output_array[2] = in_window.org.pkijs.padNumber(this.day, 2);
        output_array[3] = in_window.org.pkijs.padNumber(this.hour, 2);
        output_array[4] = in_window.org.pkijs.padNumber(this.minute, 2);
        output_array[5] = in_window.org.pkijs.padNumber(this.second, 2);
        output_array[6] = "Z";

        return output_array.join('');
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.UTCTIME.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "UTCTIME";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.UTCTIME.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.VISIBLESTRING.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.UTCTIME.prototype.block_name.call(this);
        _object.year = this.year;
        _object.month = this.month;
        _object.day = this.day;
        _object.hour = this.hour;
        _object.minute = this.minute;
        _object.second = this.second;

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.GENERALIZEDTIME =
    function()
    {
        in_window.org.pkijs.asn1.VISIBLESTRING.call(this, arguments[0]);

        this.year = 0;
        this.month = 0;
        this.day = 0;
        this.hour = 0;
        this.minute = 0;
        this.second = 0;

        // #region Create GeneralizedTime from ASN.1 string value 
        if((arguments[0] instanceof Object) && ("value" in arguments[0]))
        {
            in_window.org.pkijs.asn1.GENERALIZEDTIME.prototype.fromString.call(this, arguments[0].value);

            this.value_block.value_hex = new ArrayBuffer(arguments[0].value.length);
            var view = new Uint8Array(this.value_block.value_hex);

            for(var i = 0; i < str.length; i++)
                view[i] = arguments[0].value.charCodeAt(i);
        }
        // #endregion 
        // #region Create GeneralizedTime from JavaScript Date type 
        if((arguments[0] instanceof Object) && ("value_date" in arguments[0]))
        {
            in_window.org.pkijs.asn1.GENERALIZEDTIME.prototype.fromDate.call(this, arguments[0].value_date);
            this.value_block.value_hex = in_window.org.pkijs.asn1.GENERALIZEDTIME.prototype.toBuffer.call(this);
        }
        // #endregion 

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 24; // GENERALIZEDTIME
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.GENERALIZEDTIME.prototype = new in_window.org.pkijs.asn1.VISIBLESTRING();
    in_window.org.pkijs.asn1.GENERALIZEDTIME.constructor = in_window.org.pkijs.asn1.GENERALIZEDTIME;
    //**************************************************************************************
    in_window.org.pkijs.asn1.GENERALIZEDTIME.prototype.fromBER =
    function(input_buffer, input_offset, input_length)
    {
        /// <summary>Base function for converting block from BER encoded array of bytes</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array</param>
        /// <param name="input_offset" type="Number">Offset in ASN.1 BER encoded array where decoding should be started</param>
        /// <param name="input_length" type="Number">Maximum length of array of bytes which can be using in this function</param>

        var result_offset = this.value_block.fromBER(input_buffer, input_offset, (this.len_block.is_indefinite_form == true) ? input_length : this.len_block.length);
        if(result_offset == (-1))
        {
            this.error = this.value_block.error;
            return result_offset;
        }

        in_window.org.pkijs.asn1.GENERALIZEDTIME.prototype.fromBuffer.call(this, this.value_block.value_hex);

        if(this.id_block.error.length == 0)
            this.block_length += this.id_block.block_length;

        if(this.len_block.error.length == 0)
            this.block_length += this.len_block.block_length;

        if(this.value_block.error.length == 0)
            this.block_length += this.value_block.block_length;

        return result_offset;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.GENERALIZEDTIME.prototype.fromBuffer =
    function(input_buffer)
    {
        in_window.org.pkijs.asn1.GENERALIZEDTIME.prototype.fromString.call(this, String.fromCharCode.apply(null, new Uint8Array(input_buffer)));
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.GENERALIZEDTIME.prototype.toBuffer =
    function()
    {
        var str = in_window.org.pkijs.asn1.GENERALIZEDTIME.prototype.toString.call(this);

        var buffer = new ArrayBuffer(str.length);
        var view = new Uint8Array(buffer);

        for(var i = 0; i < str.length; i++)
            view[i] = str.charCodeAt(i);

        return buffer;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.GENERALIZEDTIME.prototype.fromDate =
    function(input_date)
    {
        /// <summary>Create "GeneralizedTime" ASN.1 type from JavaScript "Date" type</summary>

        this.year = input_date.getFullYear();
        this.month = input_date.getMonth() + 1;
        this.day = input_date.getDate();
        this.hour = input_date.getHours();
        this.minute = input_date.getMinutes();
        this.second = input_date.getSeconds();
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.GENERALIZEDTIME.prototype.toDate =
    function()
    {
        return (new Date(this.year, this.month - 1, this.day, this.hour, this.minute, this.second));
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.GENERALIZEDTIME.prototype.fromString =
    function(input_string)
    {
        /// <summary>Create "GeneralizedTime" ASN.1 type from JavaScript "String" type</summary>

        var parser = /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z/ig;
        var parser_array = parser.exec(input_string);
        if(parser_array === null)
        {
            this.error = "Wrong input string for convertion";
            return;
        }

        this.year = parseInt(parser_array[1], 10);
        this.month = parseInt(parser_array[2], 10);
        this.day = parseInt(parser_array[3], 10);
        this.hour = parseInt(parser_array[4], 10);
        this.minute = parseInt(parser_array[5], 10);
        this.second = parseInt(parser_array[6], 10);
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.GENERALIZEDTIME.prototype.toString =
    function()
    {
        var output_array = new Array(7);

        output_array[0] = in_window.org.pkijs.padNumber(this.year, 4);
        output_array[1] = in_window.org.pkijs.padNumber(this.month, 2);
        output_array[2] = in_window.org.pkijs.padNumber(this.day, 2);
        output_array[3] = in_window.org.pkijs.padNumber(this.hour, 2);
        output_array[4] = in_window.org.pkijs.padNumber(this.minute, 2);
        output_array[5] = in_window.org.pkijs.padNumber(this.second, 2);
        output_array[6] = "Z";

        return output_array.join('');
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.GENERALIZEDTIME.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "GENERALIZEDTIME";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.GENERALIZEDTIME.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.VISIBLESTRING.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.GENERALIZEDTIME.prototype.block_name.call(this);
        _object.year = this.year;
        _object.month = this.month;
        _object.day = this.day;
        _object.hour = this.hour;
        _object.minute = this.minute;
        _object.second = this.second;

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.DATE =
    function()
    {
        in_window.org.pkijs.asn1.UTF8STRING.call(this, arguments[0]);

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 31; // DATE
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.DATE.prototype = new in_window.org.pkijs.asn1.UTF8STRING();
    in_window.org.pkijs.asn1.DATE.constructor = in_window.org.pkijs.asn1.DATE;
    //**************************************************************************************
    in_window.org.pkijs.asn1.DATE.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "DATE";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.DATE.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.UTF8STRING.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.DATE.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.TIMEOFDAY =
    function()
    {
        in_window.org.pkijs.asn1.UTF8STRING.call(this, arguments[0]);
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.TIMEOFDAY.prototype = new in_window.org.pkijs.asn1.UTF8STRING();
    in_window.org.pkijs.asn1.TIMEOFDAY.constructor = in_window.org.pkijs.asn1.TIMEOFDAY;
    //**************************************************************************************
    in_window.org.pkijs.asn1.TIMEOFDAY.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "TIMEOFDAY";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.DATE.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.UTF8STRING.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.TIMEOFDAY.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.DATETIME =
    function()
    {
        in_window.org.pkijs.asn1.UTF8STRING.call(this, arguments[0]);

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 33; // DATETIME
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.DATETIME.prototype = new in_window.org.pkijs.asn1.UTF8STRING();
    in_window.org.pkijs.asn1.DATETIME.constructor = in_window.org.pkijs.asn1.DATETIME;
    //**************************************************************************************
    in_window.org.pkijs.asn1.DATETIME.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "DATETIME";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.DATETIME.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.UTF8STRING.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.DATETIME.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.DURATION =
    function()
    {
        in_window.org.pkijs.asn1.UTF8STRING.call(this, arguments[0]);
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.DURATION.prototype = new in_window.org.pkijs.asn1.UTF8STRING();
    in_window.org.pkijs.asn1.DURATION.constructor = in_window.org.pkijs.asn1.DURATION;
    //**************************************************************************************
    in_window.org.pkijs.asn1.DURATION.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "DURATION";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.DURATION.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.UTF8STRING.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.DURATION.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.TIME =
    function()
    {
        in_window.org.pkijs.asn1.UTF8STRING.call(this, arguments[0]);

        this.id_block.tag_class = 1; // UNIVERSAL
        this.id_block.tag_number = 14; // TIME
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.TIME.prototype = new in_window.org.pkijs.asn1.UTF8STRING();
    in_window.org.pkijs.asn1.TIME.constructor = in_window.org.pkijs.asn1.TIME;
    //**************************************************************************************
    in_window.org.pkijs.asn1.TIME.prototype.block_name =
    function()
    {
        /// <summary>Aux function, need to get a block name. Need to have it here for inhiritence</summary>

        return "TIME";
    }
    //**************************************************************************************
    in_window.org.pkijs.asn1.TIME.prototype.toJSON =
    function()
    {
        /// <summary>Convertion for the block to JSON object</summary>

        var _object = in_window.org.pkijs.asn1.UTF8STRING.prototype.toJSON.call(this);

        _object.block_name = in_window.org.pkijs.asn1.TIME.prototype.block_name.call(this);

        return _object;
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Declaration of special ASN.1 schema type CHOICE 
    //**************************************************************************************
    in_window.org.pkijs.asn1.CHOICE =
    function()
    {
        if(arguments[0] instanceof Object)
        {
            this.value = in_window.org.pkijs.getValue(arguments[0], "value", new Array()); // Array of ASN.1 types for make a choice from
            this.optional = in_window.org.pkijs.getValue(arguments[0], "optional", false);
        }
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Declaration of special ASN.1 schema type ANY 
    //**************************************************************************************
    in_window.org.pkijs.asn1.ANY =
    function()
    {
        if(arguments[0] instanceof Object)
        {
            this.name = in_window.org.pkijs.getValue(arguments[0], "name", "");
            this.optional = in_window.org.pkijs.getValue(arguments[0], "optional", false);
        }
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Declaration of special ASN.1 schema type REPEATED 
    //**************************************************************************************
    in_window.org.pkijs.asn1.REPEATED =
    function()
    {
        if(arguments[0] instanceof Object)
        {
            this.name = in_window.org.pkijs.getValue(arguments[0], "name", "");
            this.optional = in_window.org.pkijs.getValue(arguments[0], "optional", false);
            this.value = in_window.org.pkijs.getValue(arguments[0], "value", new in_window.org.pkijs.asn1.ANY());
            this.local = in_window.org.pkijs.getValue(arguments[0], "local", false); // Could local or global array to store elements
        }
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Major ASN.1 BER decoding function
    //**************************************************************************************
    function fromBER_raw(input_buffer, input_offset, input_length)
    {
        var incoming_offset = input_offset; // Need to store initial offset since "input_offset" is changing in the function

        // #region Local function changing a type for ASN.1 classes 
        function local_change_type(input_object, new_type)
        {
            if(input_object instanceof new_type)
                return input_object;

            var new_object = new new_type();
            new_object.id_block = input_object.id_block;
            new_object.len_block = input_object.len_block;
            new_object.warnings = input_object.warnings;
            new_object.value_before_decode = util_copybuf(input_object.value_before_decode);

            return new_object;
        }
        // #endregion 

        // #region Create a basic ASN.1 type since we need to return errors and warnings from the function 
        var return_object = new in_window.org.pkijs.asn1.ASN1_block();
        // #endregion 

        // #region Basic check for parameters 
        if(check_buffer_params(input_buffer, input_offset, input_length) === false)
        {
            return_object.error = "Wrong input parameters";
            return {
                offset: (-1),
                result: return_object
            };
        }
        // #endregion 

        // #region Getting Uint8Array from ArrayBuffer 
        var int_buffer = new Uint8Array(input_buffer, input_offset, input_length);
        // #endregion 

        // #region Initial checks 
        if(int_buffer.length == 0)
        {
            this.error = "Zero buffer length";
            return {
                offset: (-1),
                result: return_object
            };
        }
        // #endregion 

        // #region Decode indentifcation block of ASN.1 BER structure 
        var result_offset = return_object.id_block.fromBER(input_buffer, input_offset, input_length);
        return_object.warnings.concat(return_object.id_block.warnings);
        if(result_offset == (-1))
        {
            return_object.error = return_object.id_block.error;
            return {
                offset: (-1),
                result: return_object
            };
        }

        input_offset = result_offset;
        input_length -= return_object.id_block.block_length;
        // #endregion 

        // #region Decode length block of ASN.1 BER structure 
        result_offset = return_object.len_block.fromBER(input_buffer, input_offset, input_length);
        return_object.warnings.concat(return_object.len_block.warnings);
        if(result_offset == (-1))
        {
            return_object.error = return_object.len_block.error;
            return {
                offset: (-1),
                result: return_object
            };
        }

        input_offset = result_offset;
        input_length -= return_object.len_block.block_length;
        // #endregion 

        // #region Check for usign indefinite length form in encoding for primitive types 
        if((return_object.id_block.is_constructed == false) &&
           (return_object.len_block.is_indefinite_form == true))
        {
            return_object.error = new String("Indefinite length form used for primitive encoding form");
            return {
                offset: (-1),
                result: return_object
            };
        }
        // #endregion 

        // #region Switch ASN.1 block type 
        var new_asn1_type = in_window.org.pkijs.asn1.ASN1_block;

        switch(return_object.id_block.tag_class)
        {
            // #region UNIVERSAL 
            case 1: 
                // #region Check for reserved tag numbers 
                if((return_object.id_block.tag_number >= 37) &&
                   (return_object.id_block.is_hex_only == false))
                {
                    return_object.error = "UNIVERSAL 37 and upper tags are reserved by ASN.1 standard";
                    return {
                        offset: (-1),
                        result: return_object
                    };
                }
                // #endregion 

                switch(return_object.id_block.tag_number)
                {
                    // #region EOC type 
                    case 0:
                        // #region Check for EOC type 
                        if((return_object.id_block.is_constructed == true) &&
                           (return_object.len_block.length > 0))
                        {
                            return_object.error = "Type [UNIVERSAL 0] is reserved";
                            return {
                                offset: (-1),
                                result: return_object
                            };
                        }
                        // #endregion 

                        new_asn1_type = in_window.org.pkijs.asn1.EOC;

                        break;
                        // #endregion 
                    // #region BOOLEAN type 
                    case 1:
                        new_asn1_type = in_window.org.pkijs.asn1.BOOLEAN;
                        break;
                    // #endregion 
                    // #region INTEGER type 
                    case 2:
                        new_asn1_type = in_window.org.pkijs.asn1.INTEGER;
                        break;
                    // #endregion 
                    // #region BITSTRING type 
                    case 3:
                        new_asn1_type = in_window.org.pkijs.asn1.BITSTRING;
                        break;
                    // #endregion 
                    // #region OCTETSTRING type 
                    case 4:
                        new_asn1_type = in_window.org.pkijs.asn1.OCTETSTRING;
                        break;
                    // #endregion 
                    // #region NULL type 
                    case 5:
                        new_asn1_type = in_window.org.pkijs.asn1.NULL;
                        break;
                    // #endregion 
                    // #region OBJECT IDENTIFIER type 
                    case 6:
                        new_asn1_type = in_window.org.pkijs.asn1.OID;
                        break;
                    // #endregion 
                    // #region ENUMERATED type 
                    case 10:
                        new_asn1_type = in_window.org.pkijs.asn1.ENUMERATED;
                        break;
                    // #endregion 
                    // #region UTF8STRING type 
                    case 12:
                        new_asn1_type = in_window.org.pkijs.asn1.UTF8STRING;
                        break;
                    // #endregion 
                    // #region TIME type 
                    case 14:
                        new_asn1_type = in_window.org.pkijs.asn1.TIME;
                        break;
                    // #endregion 
                    // #region ASN.1 reserved type 
                    case 15:
                        return_object.error = "[UNIVERSAL 15] is reserved by ASN.1 standard";
                        return {
                            offset: (-1),
                            result: return_object
                        };
                        break;
                    // #endregion 
                    // #region SEQUENCE type 
                    case 16:
                        new_asn1_type = in_window.org.pkijs.asn1.SEQUENCE;
                        break;
                    // #endregion 
                    // #region SET type 
                    case 17:
                        new_asn1_type = in_window.org.pkijs.asn1.SET;
                        break;
                    // #endregion 
                    // #region NUMERICSTRING type 
                    case 18:
                        new_asn1_type = in_window.org.pkijs.asn1.NUMERICSTRING;
                        break;
                    // #endregion 
                    // #region PRINTABLESTRING type 
                    case 19:
                        new_asn1_type = in_window.org.pkijs.asn1.PRINTABLESTRING;
                        break;
                    // #endregion 
                    // #region TELETEXSTRING type 
                    case 20:
                        new_asn1_type = in_window.org.pkijs.asn1.TELETEXSTRING;
                        break;
                    // #endregion 
                    // #region VIDEOTEXSTRING type 
                    case 21:
                        new_asn1_type = in_window.org.pkijs.asn1.VIDEOTEXSTRING;
                        break;
                    // #endregion 
                    // #region IA5STRING type 
                    case 22:
                        new_asn1_type = in_window.org.pkijs.asn1.IA5STRING;
                        break;
                    // #endregion 
                    // #region UTCTIME type 
                    case 23:
                        new_asn1_type = in_window.org.pkijs.asn1.UTCTIME;
                        break;
                    // #endregion 
                    // #region GENERALIZEDTIME type 
                    case 24:
                        new_asn1_type = in_window.org.pkijs.asn1.GENERALIZEDTIME;
                        break;
                    // #endregion 
                    // #region GRAPHICSTRING type 
                    case 25:
                        new_asn1_type = in_window.org.pkijs.asn1.GRAPHICSTRING;
                        break;
                    // #endregion 
                    // #region VISIBLESTRING type 
                    case 26:
                        new_asn1_type = in_window.org.pkijs.asn1.VISIBLESTRING;
                        break;
                    // #endregion 
                    // #region GENERALSTRING type 
                    case 27:
                        new_asn1_type = in_window.org.pkijs.asn1.GENERALSTRING;
                        break;
                    // #endregion 
                    // #region UNIVERSALSTRING type 
                    case 28:
                        new_asn1_type = in_window.org.pkijs.asn1.UNIVERSALSTRING;
                        break;
                    // #endregion 
                    // #region CHARACTERSTRING type 
                    case 29:
                        new_asn1_type = in_window.org.pkijs.asn1.CHARACTERSTRING;
                        break;
                    // #endregion 
                    // #region BMPSTRING type 
                    case 30:
                        new_asn1_type = in_window.org.pkijs.asn1.BMPSTRING;
                        break;
                    // #endregion 
                    // #region DATE type 
                    case 31:
                        new_asn1_type = in_window.org.pkijs.asn1.DATE;
                        break;
                    // #endregion 
                    // #region DATE-TIME type 
                    case 33:
                        new_asn1_type = in_window.org.pkijs.asn1.DATETIME;
                        break;
                    // #endregion 
                    // #region default 
                    default:
                        {
                            var new_object;

                            if(return_object.id_block.is_constructed == true)
                                new_object = new in_window.org.pkijs.asn1.ASN1_CONSTRUCTED();
                            else
                                new_object = new in_window.org.pkijs.asn1.ASN1_PRIMITIVE();

                            new_object.id_block = return_object.id_block;
                            new_object.len_block = return_object.len_block;
                            new_object.warnings = return_object.warnings;

                            return_object = new_object;

                            result_offset = return_object.fromBER(input_buffer, input_offset, input_length);
                        }
                    // #endregion 
                }
                break;
            // #endregion 
            // #region All other tag classes 
            case 2: // APPLICATION
            case 3: // CONTEXT-SPECIFIC
            case 4: // PRIVATE
            default:
                {
                    if(return_object.id_block.is_constructed == true)
                        new_asn1_type = in_window.org.pkijs.asn1.ASN1_CONSTRUCTED;
                    else
                        new_asn1_type = in_window.org.pkijs.asn1.ASN1_PRIMITIVE;
                }
            // #endregion 
        }
        // #endregion 

        // #region Change type and perform BER decoding 
        return_object = local_change_type(return_object, new_asn1_type);
        result_offset = return_object.fromBER(input_buffer, input_offset, (return_object.len_block.is_indefinite_form == true) ? input_length : return_object.len_block.length);
        // #endregion 

        // #region Coping incoming buffer for entire ASN.1 block 
        return_object.value_before_decode = util_copybuf_offset(input_buffer, incoming_offset, return_object.block_length);
        // #endregion 

        return {
            offset: result_offset,
            result: return_object
        };
    }
    //**************************************************************************************
    in_window.org.pkijs.fromBER = 
    function(input_buffer)
    {
        /// <summary>Major function for decoding ASN.1 BER array into internal library structuries</summary>
        /// <param name="input_buffer" type="ArrayBuffer">ASN.1 BER encoded array of bytes</param>

        if(input_buffer.byteLength == 0)
        {
            var result = new in_window.org.pkijs.asn1.ASN1_block();
            result.error = "Input buffer has zero length";

            return result;
        }

        return fromBER_raw(input_buffer, 0, input_buffer.byteLength);
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Major scheme verification function 
    //**************************************************************************************
    in_window.org.pkijs.compareSchema =
    function(root, input_asn1_data, input_asn1_schema)
    {
        // #region Special case for CHOICE schema element type 
        if(input_asn1_schema instanceof in_window.org.pkijs.asn1.CHOICE)
        {
            var choice_result = false;

            for(var j = 0; j < input_asn1_schema.value.length; j++)
            {
                var result = in_window.org.pkijs.compareSchema(root, input_asn1_data, input_asn1_schema.value[j]);
                if(result.verified === true)
                    return {
                        verified: true,
                        result: root
                    };
            }

            if(choice_result === false)
            {
                var _result = {
                    verified: false,
                    result: {
                        error: "Wrong values for CHOICE type"
                    }
                };

                if(input_asn1_schema.hasOwnProperty('name'))
                    _result.name = input_asn1_schema.name;

                return _result;
            }
        }
        // #endregion 

        // #region Special case for ANY schema element type 
        if(input_asn1_schema instanceof in_window.org.pkijs.asn1.ANY)
        {
            // #region Add named component of ASN.1 schema 
            if(input_asn1_schema.hasOwnProperty('name'))
                root[input_asn1_schema.name] = input_asn1_data;
            // #endregion 

            return {
                verified: true,
                result: root
            };
        }
        // #endregion 

        // #region Initial check 
        if((root instanceof Object) === false)
            return {
                verified: false,
                result: { error: "Wrong root object" }
            };

        if((input_asn1_data instanceof Object) === false)
            return {
                verified: false,
                result: { error: "Wrong ASN.1 data" }
            };

        if((input_asn1_schema instanceof Object) === false)
            return {
                verified: false,
                result: { error: "Wrong ASN.1 schema" }
            };

        if(('id_block' in input_asn1_schema) === false)
            return {
                verified: false,
                result: { error: "Wrong ASN.1 schema" }
            };
        // #endregion 

        // #region Comparing id_block properties in ASN.1 data and ASN.1 schema 
        // #region Encode and decode ASN.1 schema id_block 
        /// <remarks>This encoding/decoding is neccessary because could be an errors in schema definition</remarks>
        if(('fromBER' in input_asn1_schema.id_block) === false)
            return {
                verified: false,
                result: { error: "Wrong ASN.1 schema" }
            };

        if(('toBER' in input_asn1_schema.id_block) === false)
            return {
                verified: false,
                result: { error: "Wrong ASN.1 schema" }
            };

        var encoded_id = input_asn1_schema.id_block.toBER(false);
        if(encoded_id.byteLength === 0)
            return {
                verified: false,
                result: { error: "Error encoding id_block for ASN.1 schema" }
            };

        var decoded_offset = input_asn1_schema.id_block.fromBER(encoded_id, 0, encoded_id.byteLength);
        if(decoded_offset === (-1))
            return {
                verified: false,
                result: { error: "Error decoding id_block for ASN.1 schema" }
            };
        // #endregion 

        // #region tag_class 
        if(input_asn1_schema.id_block.hasOwnProperty('tag_class') === false)
            return {
                verified: false,
                result: { error: "Wrong ASN.1 schema" }
            };

        if(input_asn1_schema.id_block.tag_class !== input_asn1_data.id_block.tag_class)
            return {
                verified: false,
                result: root
            };
        // #endregion 
        // #region tag_number 
        if(input_asn1_schema.id_block.hasOwnProperty('tag_number') === false)
            return {
                verified: false,
                result: { error: "Wrong ASN.1 schema" }
            };

        if(input_asn1_schema.id_block.tag_number !== input_asn1_data.id_block.tag_number)
            return {
                verified: false,
                result: root
            };
        // #endregion 
        // #region is_constructed 
        if(input_asn1_schema.id_block.hasOwnProperty('is_constructed') === false)
            return {
                verified: false,
                result: { error: "Wrong ASN.1 schema" }
            };

        if(input_asn1_schema.id_block.is_constructed !== input_asn1_data.id_block.is_constructed)
            return {
                verified: false,
                result: root
            };
        // #endregion 
        // #region is_hex_only 
        if(('is_hex_only' in input_asn1_schema.id_block) === false) // Since 'is_hex_only' is an inhirited property
            return {
                verified: false,
                result: { error: "Wrong ASN.1 schema" }
            };

        if(input_asn1_schema.id_block.is_hex_only !== input_asn1_data.id_block.is_hex_only)
            return {
                verified: false,
                result: root
            };
        // #endregion 
        // #region value_hex 
        if(input_asn1_schema.id_block.is_hex_only === true)
        {
            if(('value_hex' in input_asn1_schema.id_block) === false) // Since 'value_hex' is an inhirited property
                return {
                    verified: false,
                    result: { error: "Wrong ASN.1 schema" }
                };

            var schema_view = new Uint8Array(input_asn1_schema.id_block.value_hex);
            var asn1_view = new Uint8Array(input_asn1_data.id_block.value_hex);

            if(schema_view.length !== asn1_view.length)
                return {
                    verified: false,
                    result: root
                };

            for(var i = 0; i < schema_view.length; i++)
            {
                if(schema_view[i] !== asn1_view[1])
                    return {
                        verified: false,
                        result: root
                    };
            }
        }
        // #endregion 
        // #endregion 

        // #region Add named component of ASN.1 schema 
        if(input_asn1_schema.hasOwnProperty('name'))
        {
            input_asn1_schema.name = input_asn1_schema.name.replace(/^\s+|\s+$/g, '');
            if(input_asn1_schema.name !== "")
                root[input_asn1_schema.name] = input_asn1_data;
        }
        // #endregion 

        // #region Getting next ASN.1 block for comparition 
        if(input_asn1_schema.id_block.is_constructed === true)
        {
            var admission = 0;
            var result = { verified: false };

            var max_length = input_asn1_schema.value_block.value.length;

            if(max_length > 0)
            {
                if(input_asn1_schema.value_block.value[0] instanceof in_window.org.pkijs.asn1.REPEATED)
                    max_length = input_asn1_data.value_block.value.length;
            }

            // #region Special case when constructive value has no elements 
            if(max_length === 0)
                return {
                    verified: true,
                    result: root
                };
            // #endregion 

            // #region Special case when "input_asn1_data" has no values and "input_asn1_schema" has all optional values
            if((input_asn1_data.value_block.value.length === 0) && 
               (input_asn1_schema.value_block.value.length !== 0))
            {
                var _optional = true;

                for(var i = 0; i < input_asn1_schema.value_block.value.length; i++)
                    _optional = _optional && (input_asn1_schema.value_block.value[i].optional || false);

                if(_optional === true)
                {
                    return {
                        verified: true,
                        result: root
                    };
                }
                else
                {
                    // #region Delete early added name of block 
                    if(input_asn1_schema.hasOwnProperty('name'))
                    {
                        input_asn1_schema.name = input_asn1_schema.name.replace(/^\s+|\s+$/g, '');
                        if(input_asn1_schema.name !== "")
                            delete root[input_asn1_schema.name];
                    }
                    // #endregion 

                    root.error = "Inconsistent object length";

                    return {
                        verified: false,
                        result: root
                    };
                }
            }
            // #endregion 

            for(var i = 0; i < max_length; i++)
            {
                // #region Special case when there is an "optional" element of ASN.1 schema at the end 
                if((i - admission) >= input_asn1_data.value_block.value.length)
                {
                    if(input_asn1_schema.value_block.value[i].optional === false)
                    {
                        var _result = {
                            verified: false,
                            result: root
                        };

                        root.error = "Inconsistent length between ASN.1 data and schema";

                        // #region Delete early added name of block 
                        if(input_asn1_schema.hasOwnProperty('name'))
                        {
                            input_asn1_schema.name = input_asn1_schema.name.replace(/^\s+|\s+$/g, '');
                            if(input_asn1_schema.name !== "")
                            {
                                delete root[input_asn1_schema.name];
                                _result.name = input_asn1_schema.name;
                            }
                        }
                        // #endregion 

                        return _result;
                    }
                }
                    // #endregion 
                else
                {
                    // #region Special case for REPEATED type of ASN.1 schema element 
                    if(input_asn1_schema.value_block.value[0] instanceof in_window.org.pkijs.asn1.REPEATED)
                    {
                        result = in_window.org.pkijs.compareSchema(root, input_asn1_data.value_block.value[i], input_asn1_schema.value_block.value[0].value);
                        if(result.verified === false)
                        {
                            if(input_asn1_schema.value_block.value[0].optional === true)
                                admission++;
                            else
                            {
                                // #region Delete early added name of block 
                                if(input_asn1_schema.hasOwnProperty('name'))
                                {
                                    input_asn1_schema.name = input_asn1_schema.name.replace(/^\s+|\s+$/g, '');
                                    if(input_asn1_schema.name !== "")
                                        delete root[input_asn1_schema.name];
                                }
                                // #endregion 

                                return result;
                            }
                        }

                        if(("name" in input_asn1_schema.value_block.value[0]) && (input_asn1_schema.value_block.value[0].name.length > 0))
                        {
                            var array_root = {};

                            if(("local" in input_asn1_schema.value_block.value[0]) && (input_asn1_schema.value_block.value[0].local === true))
                                array_root = input_asn1_data;
                            else
                                array_root = root;

                            if(typeof array_root[input_asn1_schema.value_block.value[0].name] === "undefined")
                                array_root[input_asn1_schema.value_block.value[0].name] = new Array();

                            array_root[input_asn1_schema.value_block.value[0].name].push(input_asn1_data.value_block.value[i]);
                        }
                    }
                        // #endregion 
                    else
                    {
                        result = in_window.org.pkijs.compareSchema(root, input_asn1_data.value_block.value[i - admission], input_asn1_schema.value_block.value[i]);
                        if(result.verified === false)
                        {
                            if(input_asn1_schema.value_block.value[i].optional === true)
                                admission++;
                            else
                            {
                                // #region Delete early added name of block 
                                if(input_asn1_schema.hasOwnProperty('name'))
                                {
                                    input_asn1_schema.name = input_asn1_schema.name.replace(/^\s+|\s+$/g, '');
                                    if(input_asn1_schema.name !== "")
                                        delete root[input_asn1_schema.name];
                                }
                                // #endregion 

                                return result;
                            }
                        }
                    }
                }
            }

            if(result.verified === false) // The situation may take place if last element is "optional" and verification failed
            {
                var _result = {
                    verified: false,
                    result: root
                };

                // #region Delete early added name of block 
                if(input_asn1_schema.hasOwnProperty('name'))
                {
                    input_asn1_schema.name = input_asn1_schema.name.replace(/^\s+|\s+$/g, '');
                    if(input_asn1_schema.name !== "")
                    {
                        delete root[input_asn1_schema.name];
                        _result.name = input_asn1_schema.name;
                    }
                }
                // #endregion 

                return _result;
            }

            return {
                verified: true,
                result: root
            };
        }
        // #endregion 
        // #region Ability to parse internal value for primitive-encoded value (value of OCTETSTRING, for example)
        else
        {
            if( ("primitive_schema" in input_asn1_schema) &&
                ("value_hex" in input_asn1_data.value_block) )
            {
                // #region Decoding of raw ASN.1 data 
                var asn1 = in_window.org.pkijs.fromBER(input_asn1_data.value_block.value_hex);
                if(asn1.offset === (-1))
                {
                    var _result = {
                        verified: false,
                        result: asn1.result
                    };

                    // #region Delete early added name of block 
                    if(input_asn1_schema.hasOwnProperty('name'))
                    {
                        input_asn1_schema.name = input_asn1_schema.name.replace(/^\s+|\s+$/g, '');
                        if(input_asn1_schema.name !== "")
                        {
                            delete root[input_asn1_schema.name];
                            _result.name = input_asn1_schema.name;
                        }
                    }
                    // #endregion 

                    return _result;
                }
                // #endregion 

                return in_window.org.pkijs.compareSchema(root, asn1.result, input_asn1_schema.primitive_schema);
            }
            else
                return {
                    verified: true,
                    result: root
                };
        }
        // #endregion 
    }
    //**************************************************************************************
    in_window.org.pkijs.verifySchema =
    function(input_buffer, input_schema)
    {
        // #region Initial check 
        if((input_schema instanceof Object) === false)
            return {
                varified: false,
                result: { error: "Wrong ASN.1 schema type" }
            };
        // #endregion 

        // #region Decoding of raw ASN.1 data 
        var asn1 = in_window.org.pkijs.fromBER(input_buffer);
        if(asn1.offset === (-1))
            return {
                verified: false,
                result: asn1.result
            };
        // #endregion 

        // #region Compare ASN.1 struct with input schema 
        return in_window.org.pkijs.compareSchema(asn1.result, asn1.result, input_schema);
        // #endregion 
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
    // #region Major function converting JSON to ASN.1 objects 
    //**************************************************************************************
    in_window.org.pkijs.fromJSON = 
    function(json)
    {
        /// <summary>Converting from JSON to ASN.1 objects</summary>
        /// <param name="json" type="String|Object">JSON string or object to convert to ASN.1 objects</param>
    }
    //**************************************************************************************
    // #endregion 
    //**************************************************************************************
}
)(typeof exports !== "undefined" ? exports : window);
