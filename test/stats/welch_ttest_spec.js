/* Copyright 2026 Mozilla Foundation
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

import { incompleteBeta, logGamma, welchTTest } from "./welch_ttest.js";

/*
 * Reference values: Scilab 2026.1.0. Run the script below with:
 *   scilab-cli -nb -quit -f welch_ttest.sce < /dev/null
 *
 *   // Suppress cdft's warning for non-integer degrees of freedom.
 *   warning("off");
 *
 *   function p = welch(a, b)
 *     na = size(a, "*");
 *     nb = size(b, "*");
 *     sa = variance(a) / na;
 *     sb = variance(b) / nb;
 *     t = (mean(a) - mean(b)) / sqrt(sa + sb);
 *     df = (sa + sb)^2 / (sa^2 / (na - 1) + sb^2 / (nb - 1));
 *     p = 2 * cdft("PQ", -abs(t), df);
 *   endfunction
 *
 *   xs = [0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4.5, ..
 *         7.25, 10, 25.5, 66.6, 100, 171.3, 1000.5, 123456.789];
 *   for x = xs
 *     mprintf("%.17g\n", gammaln(x));
 *   end
 *
 *   xab = [
 *     0, 2, 3;
 *     1, 2, 3;
 *     1e-10, 0.5, 0.5;
 *     0.001, 2.5, 0.5;
 *     0.1, 0.5, 0.5;
 *     0.3, 2.5, 0.5;
 *     0.9, 2.5, 0.5;
 *     0.5, 1, 1;
 *     0.25, 1, 3;
 *     0.75, 3, 1;
 *     0.2, 5, 10;
 *     0.6, 5, 10;
 *     0.01, 30, 2;
 *     0.37, 0.75, 12.5;
 *     0.999, 10, 0.5;
 *     0.45, 50, 50;
 *     0.5, 50, 50;
 *     0.95, 300, 0.5;
 *     0.999999, 500, 0.5;
 *     0.9999999999, 2, 2;
 *   ];
 *   for i = 1:size(xab, "r")
 *     [x, a, b] = (xab(i, 1), xab(i, 2), xab(i, 3));
 *     mprintf("%.17g\n", cdfbet("PQ", x, 1 - x, a, b));
 *   end
 *
 *   samples = list( ..
 *     list([10, 12], ..
 *          [30, 33]), ..
 *     list([102, 98, 110, 95, 101], ..
 *          [120, 118, 125, 130, 117]), ..
 *     list([12.5, 13.1, 11.8, 12.9, 13.4, 12.2, 12.7], ..
 *          [15.2, 9.8, 18.4, 11.1, 14.6]), ..
 *     list([100, 105, 98, 102, 101, 99], ..
 *          [101, 104, 99, 103, 100, 98, 102]), ..
 *     list([10, 200], ..
 *          100 + modulo(0:29, 3)), ..
 *     list([5, 5, 5], ..
 *          [6, 7, 9]), ..
 *     list([1, 2, 3, 4], ..
 *          [1, 2, 3, 4]), ..
 *     list([1, 2, 1, 2, 1, 2], ..
 *          [1000, 1001, 1000, 1001, 1000, 1001]), ..
 *     list([-1.5, -0.25, 0.75, -2.125], ..
 *          [0.5, 1.25, 2, 0.875, 1.5]), ..
 *     list(1000 + modulo((0:49) * 37, 101), ..
 *          1010 + modulo((0:59) * 53, 89)) ..
 *   );
 *   for i = 1:size(samples)
 *     mprintf("%.17g\n", welch(samples(i)(1), samples(i)(2)));
 *   end
 */

// Relative tolerance; absolute when the expected value is zero.
const TOLERANCE = 1e-12;

function expectCloseTo(actual, expected, context) {
  expect(Math.abs(actual - expected))
    .withContext(context)
    .toBeLessThanOrEqual(TOLERANCE * (Math.abs(expected) || 1));
}

describe("welch_ttest", function () {
  it("computes the logarithm of the gamma function", function () {
    // [x, gammaln(x)]
    const values = [
      [0.5, 0.57236494292469997],
      [0.75, 0.20328095143129535],
      [1, 0],
      [1.5, -0.12078223763524526],
      [2, 0],
      [2.5, 0.28468287047291918],
      [3, 0.6931471805599454],
      [4.5, 2.4537365708424423],
      [7.25, 7.0521854507385395],
      [10, 12.801827480081471],
      [25.5, 56.389167643719944],
      [66.6, 211.85456235086662],
      [100, 359.13420536957545],
      [171.3, 708.11494703899689],
      [1000.5, 5908.6741758486778],
      [123456.789, 1323902.0187950633],
    ];
    for (const [x, expected] of values) {
      expectCloseTo(logGamma(x), expected, `logGamma(${x})`);
    }
  });

  it("computes the regularized incomplete beta function", function () {
    // [x, a, b, cdfbet("PQ", x, 1 - x, a, b)]
    const values = [
      [0, 2, 3, 0],
      [1, 2, 3, 1],
      [1e-10, 0.5, 0.5, 6.3661977237819169e-6],
      [0.001, 2.5, 0.5, 1.0740735427307244e-8],
      [0.1, 0.5, 0.5, 0.20483276469913345],
      [0.3, 2.5, 0.5, 0.01892712407194564],
      [0.9, 2.5, 0.5, 0.48958974456442772],
      [0.5, 1, 1, 0.5],
      [0.25, 1, 3, 0.57812499999999978],
      [0.75, 3, 1, 0.42187500000000017],
      [0.2, 5, 10, 0.12983962583039999],
      [0.6, 5, 10, 0.9824904585216],
      [0.01, 30, 2, 3.0700000000000305e-59],
      [0.37, 0.75, 12.5, 0.99833379498108465],
      [0.999, 10, 0.5, 0.8888967091248603],
      [0.45, 50, 50, 0.15865219893709892],
      [0.5, 50, 50, 0.50000000000000011],
      [0.95, 300, 0.5, 2.9343573874552804e-8],
      [0.999999, 500, 0.5, 0.97477917695586114],
      [0.9999999999, 2, 2, 1],
    ];
    for (const [x, a, b, expected] of values) {
      expectCloseTo(
        incompleteBeta(x, a, b),
        expected,
        `incompleteBeta(${x}, ${a}, ${b})`
      );
    }
  });

  it("computes the p-value of Welch's t-test", function () {
    // [description, a, b, welch(a, b)]
    const values = [
      ["two samples of size 2", [10, 12], [30, 33], 0.012261063471435553],
      [
        "equal sizes",
        [102, 98, 110, 95, 101],
        [120, 118, 125, 130, 117],
        0.00034551648962900301,
      ],
      [
        "unequal sizes and variances",
        [12.5, 13.1, 11.8, 12.9, 13.4, 12.2, 12.7],
        [15.2, 9.8, 18.4, 11.1, 14.6],
        0.49280848397223764,
      ],
      [
        "no significant difference",
        [100, 105, 98, 102, 101, 99],
        [101, 104, 99, 103, 100, 98, 102],
        0.90064262052772515,
      ],
      [
        "about one degree of freedom",
        [10, 200],
        Array.from({ length: 30 }, (_, i) => 100 + (i % 3)),
        0.97321078827173624,
      ],
      ["one constant sample", [5, 5, 5], [6, 7, 9], 0.11808289631180312],
      ["identical samples", [1, 2, 3, 4], [1, 2, 3, 4], 1],
      [
        "very different samples",
        [1, 2, 1, 2, 1, 2],
        [1000, 1001, 1000, 1001, 1000, 1001],
        2.4856713542327777e-31,
      ],
      [
        "negative and fractional values",
        [-1.5, -0.25, 0.75, -2.125],
        [0.5, 1.25, 2, 0.875, 1.5],
        0.044606705930515661,
      ],
      [
        "samples of sizes 50 and 60",
        Array.from({ length: 50 }, (_, i) => 1000 + ((i * 37) % 101)),
        Array.from({ length: 60 }, (_, i) => 1010 + ((i * 53) % 89)),
        0.40365751651370885,
      ],
    ];
    for (const [description, a, b, expected] of values) {
      expectCloseTo(welchTTest(a, b), expected, description);
      // Swapping samples preserves the two-sided p-value.
      expectCloseTo(welchTTest(b, a), expected, `${description} (swapped)`);
    }
  });

  it("returns NaN for degenerate samples", function () {
    // Both cases give NaN degrees of freedom.
    expect(welchTTest([5, 5, 5], [7, 7, 7]))
      .withContext("constant samples")
      .toBeNaN();
    expect(welchTTest([1, 2, 3], [4]))
      .withContext("sample of size 1")
      .toBeNaN();
  });
});
