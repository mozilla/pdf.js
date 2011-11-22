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
      for (var i = 0, ii = size.length; i < ii; i++)
        length *= size[i];
      length *= outputSize;

      var array = [];
      var codeSize = 0;
      var codeBuf = 0;
      // 32 is a valid bps so shifting won't work
      var sampleMul = 1.0 / (Math.pow(2.0, bps) - 1);

      var strBytes = str.getBytes((length * bps + 7) / 8);
      var strIdx = 0;
      for (var i = 0; i < length; i++) {
        while (codeSize < bps) {
          codeBuf <<= 8;
          codeBuf |= strBytes[strIdx++];
          codeSize += 8;
        }
        codeSize -= bps;
        array.push((codeBuf >> codeSize) * sampleMul);
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
      function toMultiArray(arr) {
        var inputLength = arr.length;
        var outputLength = arr.length / 2;
        var out = new Array(outputLength);
        var index = 0;
        for (var i = 0; i < inputLength; i += 2) {
          out[index] = [arr[i], arr[i + 1]];
          ++index;
        }
        return out;
      }
      var domain = dict.get('Domain');
      var range = dict.get('Range');

      if (!domain || !range)
        error('No domain or range');

      var inputSize = domain.length / 2;
      var outputSize = range.length / 2;

      domain = toMultiArray(domain);
      range = toMultiArray(range);

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
      encode = toMultiArray(encode);

      var decode = dict.get('Decode');
      if (!decode)
        decode = range;
      else
        decode = toMultiArray(decode);

      // Precalc the multipliers
      var inputMul = new Float64Array(inputSize);
      for (var i = 0; i < inputSize; ++i) {
        inputMul[i] = (encode[i][1] - encode[i][0]) /
                  (domain[i][1] - domain[i][0]);
      }

      var idxMul = new Int32Array(inputSize);
      idxMul[0] = outputSize;
      for (i = 1; i < inputSize; ++i) {
        idxMul[i] = idxMul[i - 1] * size[i - 1];
      }

      var nSamples = outputSize;
      for (i = 0; i < inputSize; ++i)
          nSamples *= size[i];

      var samples = this.getSampleArray(size, outputSize, bps, str);

      return [
        CONSTRUCT_SAMPLED, inputSize, domain, encode, decode, samples, size,
        outputSize, bps, range, inputMul, idxMul, nSamples
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
      var inputMul = IR[10];
      var idxMul = IR[11];
      var nSamples = IR[12];

      return function constructSampledFromIRResult(args) {
        if (inputSize != args.length)
          error('Incorrect number of arguments: ' + inputSize + ' != ' +
                args.length);
        // Most of the below is a port of Poppler's implementation.
        // TODO: There's a few other ways to do multilinear interpolation such
        // as piecewise, which is much faster but an approximation.
        var out = new Float64Array(outputSize);
        var x;
        var e = new Array(inputSize);
        var efrac0 = new Float64Array(inputSize);
        var efrac1 = new Float64Array(inputSize);
        var sBuf = new Float64Array(1 << inputSize);
        var i, j, k, idx, t;

        // map input values into sample array
        for (i = 0; i < inputSize; ++i) {
          x = (args[i] - domain[i][0]) * inputMul[i] + encode[i][0];
          if (x < 0) {
            x = 0;
          } else if (x > size[i] - 1) {
            x = size[i] - 1;
          }
          e[i] = [Math.floor(x), 0];
          if ((e[i][1] = e[i][0] + 1) >= size[i]) {
            // this happens if in[i] = domain[i][1]
            e[i][1] = e[i][0];
          }
          efrac1[i] = x - e[i][0];
          efrac0[i] = 1 - efrac1[i];
        }

        // for each output, do m-linear interpolation
        for (i = 0; i < outputSize; ++i) {

          // pull 2^m values out of the sample array
          for (j = 0; j < (1 << inputSize); ++j) {
            idx = i;
            for (k = 0, t = j; k < inputSize; ++k, t >>= 1) {
              idx += idxMul[k] * (e[k][t & 1]);
            }
            if (idx >= 0 && idx < nSamples) {
              sBuf[j] = samples[idx];
            } else {
              sBuf[j] = 0; // TODO Investigate if this is what Adobe does
            }
          }

          // do m sets of interpolations
          for (j = 0, t = (1 << inputSize); j < inputSize; ++j, t >>= 1) {
            for (k = 0; k < t; k += 2) {
              sBuf[k >> 1] = efrac0[j] * sBuf[k] + efrac1[j] * sBuf[k + 1];
            }
          }

          // map output value to range
          out[i] = (sBuf[0] * (decode[i][1] - decode[i][0]) + decode[i][0]);
          if (out[i] < range[i][0]) {
            out[i] = range[i][0];
          } else if (out[i] > range[i][1]) {
            out[i] = range[i][1];
          }
        }
        return out;
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

      for (var i = 0, ii = fnsIR.length; i < ii; i++) {
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

