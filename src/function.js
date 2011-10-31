/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var PDFFunction = (function pdfFunction() {
  var CONSTRUCT_SAMPLED = 0;
  var CONSTRUCT_INTERPOLATED = 2;
  var CONSTRUCT_STICHED = 3;
  var CONSTRUCT_POSTSCRIPT = 4;

  return {
    getSampleArray: function pdfFunctionGetSampleArray(size, outputSize, bps,
                                                       str) {
      var length = 1;
      for (var i = 0; i < size.length; i++)
        length *= size[i];
      length *= outputSize;

      var array = [];
      var codeSize = 0;
      var codeBuf = 0;

      var strBytes = str.getBytes((length * bps + 7) / 8);
      var strIdx = 0;
      for (var i = 0; i < length; i++) {
        while (codeSize < bps) {
          codeBuf <<= 8;
          codeBuf |= strBytes[strIdx++];
          codeSize += 8;
        }
        codeSize -= bps;
        array.push(codeBuf >> codeSize);
        codeBuf &= (1 << codeSize) - 1;
      }
      return array;
    },

    getIR: function pdfFunctionGetIR(xref, fn) {
      var dict = fn.dict;
      if (!dict)
        dict = fn;

      var types = [this.constructSampled,
                   null,
                   this.constructInterpolated,
                   this.constructStiched,
                   this.constructPostScript];

      var typeNum = dict.get('FunctionType');
      var typeFn = types[typeNum];
      if (!typeFn)
        error('Unknown type of function');

      return typeFn.call(this, fn, dict, xref);
    },

    fromIR: function pdfFunctionFromIR(IR) {
      var type = IR[0];
      switch (type) {
        case CONSTRUCT_SAMPLED:
          return this.constructSampledFromIR(IR);
        case CONSTRUCT_INTERPOLATED:
          return this.constructInterpolatedFromIR(IR);
        case CONSTRUCT_STICHED:
          return this.constructStichedFromIR(IR);
        case CONSTRUCT_POSTSCRIPT:
        default:
          return this.constructPostScriptFromIR(IR);
      }
    },

    parse: function pdfFunctionParse(xref, fn) {
      var IR = this.getIR(xref, fn);
      return this.fromIR(IR);
    },

    constructSampled: function pdfFunctionConstructSampled(str, dict) {
      var domain = dict.get('Domain');
      var range = dict.get('Range');

      if (!domain || !range)
        error('No domain or range');

      var inputSize = domain.length / 2;
      var outputSize = range.length / 2;

      if (inputSize != 1)
        error('No support for multi-variable inputs to functions: ' +
              inputSize);

      var size = dict.get('Size');
      var bps = dict.get('BitsPerSample');
      var order = dict.get('Order');
      if (!order)
        order = 1;
      if (order !== 1)
        error('No support for cubic spline interpolation: ' + order);

      var encode = dict.get('Encode');
      if (!encode) {
        encode = [];
        for (var i = 0; i < inputSize; ++i) {
          encode.push(0);
          encode.push(size[i] - 1);
        }
      }
      var decode = dict.get('Decode');
      if (!decode)
        decode = range;

      var samples = this.getSampleArray(size, outputSize, bps, str);

      return [
        CONSTRUCT_SAMPLED, inputSize, domain, encode, decode, samples, size,
        outputSize, bps, range
      ];
    },

    constructSampledFromIR: function pdfFunctionConstructSampledFromIR(IR) {
      var inputSize = IR[1];
      var domain = IR[2];
      var encode = IR[3];
      var decode = IR[4];
      var samples = IR[5];
      var size = IR[6];
      var outputSize = IR[7];
      var bps = IR[8];
      var range = IR[9];

      return function constructSampledFromIRResult(args) {
        var clip = function constructSampledFromIRClip(v, min, max) {
          if (v > max)
            v = max;
          else if (v < min)
            v = min;
          return v;
        };

        if (inputSize != args.length)
          error('Incorrect number of arguments: ' + inputSize + ' != ' +
                args.length);

        for (var i = 0; i < inputSize; i++) {
          var i2 = i * 2;

          // clip to the domain
          var v = clip(args[i], domain[i2], domain[i2 + 1]);

          // encode
          v = encode[i2] + ((v - domain[i2]) *
                            (encode[i2 + 1] - encode[i2]) /
                            (domain[i2 + 1] - domain[i2]));

          // clip to the size
          args[i] = clip(v, 0, size[i] - 1);
        }

        // interpolate to table
        TODO('Multi-dimensional interpolation');
        var floor = Math.floor(args[0]);
        var ceil = Math.ceil(args[0]);
        var scale = args[0] - floor;

        floor *= outputSize;
        ceil *= outputSize;

        var output = [], v = 0;
        for (var i = 0; i < outputSize; ++i) {
          if (ceil == floor) {
            v = samples[ceil + i];
          } else {
            var low = samples[floor + i];
            var high = samples[ceil + i];
            v = low * scale + high * (1 - scale);
          }

          var i2 = i * 2;
          // decode
          v = decode[i2] + (v * (decode[i2 + 1] - decode[i2]) /
                            ((1 << bps) - 1));

          // clip to the domain
          output.push(clip(v, range[i2], range[i2 + 1]));
        }

        return output;
      }
    },

    constructInterpolated:
    function pdfFunctionConstructInterpolated(str, dict) {
      var c0 = dict.get('C0') || [0];
      var c1 = dict.get('C1') || [1];
      var n = dict.get('N');

      if (!isArray(c0) || !isArray(c1))
        error('Illegal dictionary for interpolated function');

      var length = c0.length;
      var diff = [];
      for (var i = 0; i < length; ++i)
        diff.push(c1[i] - c0[i]);

      return [CONSTRUCT_INTERPOLATED, c0, diff, n];
    },

    constructInterpolatedFromIR:
    function pdfFunctionconstructInterpolatedFromIR(IR) {
      var c0 = IR[1];
      var diff = IR[2];
      var n = IR[3];

      var length = diff.length;

      return function constructInterpolatedFromIRResult(args) {
        var x = n == 1 ? args[0] : Math.pow(args[0], n);

        var out = [];
        for (var j = 0; j < length; ++j)
          out.push(c0[j] + (x * diff[j]));

        return out;

      }
    },

    constructStiched: function pdfFunctionConstructStiched(fn, dict, xref) {
      var domain = dict.get('Domain');
      var range = dict.get('Range');

      if (!domain)
        error('No domain');

      var inputSize = domain.length / 2;
      if (inputSize != 1)
        error('Bad domain for stiched function');

      var fnRefs = dict.get('Functions');
      var fns = [];
      for (var i = 0, ii = fnRefs.length; i < ii; ++i)
        fns.push(PDFFunction.getIR(xref, xref.fetchIfRef(fnRefs[i])));

      var bounds = dict.get('Bounds');
      var encode = dict.get('Encode');

      return [CONSTRUCT_STICHED, domain, bounds, encode, fns];
    },

    constructStichedFromIR: function pdfFunctionConstructStichedFromIR(IR) {
      var domain = IR[1];
      var bounds = IR[2];
      var encode = IR[3];
      var fnsIR = IR[4];
      var fns = [];

      for (var i = 0; i < fnsIR.length; i++) {
        fns.push(PDFFunction.fromIR(fnsIR[i]));
      }

      return function constructStichedFromIRResult(args) {
        var clip = function constructStichedFromIRClip(v, min, max) {
          if (v > max)
            v = max;
          else if (v < min)
            v = min;
          return v;
        };

        // clip to domain
        var v = clip(args[0], domain[0], domain[1]);
        // calulate which bound the value is in
        for (var i = 0, ii = bounds.length; i < ii; ++i) {
          if (v < bounds[i])
            break;
        }

        // encode value into domain of function
        var dmin = domain[0];
        if (i > 0)
          dmin = bounds[i - 1];
        var dmax = domain[1];
        if (i < bounds.length)
          dmax = bounds[i];

        var rmin = encode[2 * i];
        var rmax = encode[2 * i + 1];

        var v2 = rmin + (v - dmin) * (rmax - rmin) / (dmax - dmin);

        // call the appropropriate function
        return fns[i]([v2]);
      };
    },

    constructPostScript: function pdfFunctionConstructPostScript() {
      return [CONSTRUCT_POSTSCRIPT];
    },

    constructPostScriptFromIR: function pdfFunctionConstructPostScriptFromIR() {
      TODO('unhandled type of function');
      return function constructPostScriptFromIRResult() {
        return [255, 105, 180];
      };
    }
  };
})();

