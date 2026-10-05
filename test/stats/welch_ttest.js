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

function mean(array) {
  return array.reduce((a, b) => a + b, 0) / array.length;
}

function variance(array, arrayMean) {
  return (
    array.reduce((a, b) => a + (b - arrayMean) ** 2, 0) / (array.length - 1)
  );
}

const LANCZOS_COEFFICIENTS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/* log(Gamma(x)) for x >= 0.5, using the Lanczos approximation with g = 7. */
function logGamma(x) {
  let sum = LANCZOS_COEFFICIENTS[0];
  for (let i = 1; i < LANCZOS_COEFFICIENTS.length; i++) {
    sum += LANCZOS_COEFFICIENTS[i] / (x + i - 1);
  }
  const t = x + 6.5;
  return (
    0.5 * Math.log(2 * Math.PI) + (x - 0.5) * Math.log(t) - t + Math.log(sum)
  );
}

/*
 * Beta continued fraction, evaluated with modified Lentz's method.
 * Coefficients: https://dlmf.nist.gov/8.17#E23
 */
function betaContinuedFraction(x, a, b) {
  const TINY = 1e-300;
  const clamp = v => (Math.abs(v) < TINY ? TINY : v);

  let c = 1,
    d = 1 / clamp(1 - ((a + b) * x) / (a + 1)),
    h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    for (const coef of [
      (m * (b - m) * x) / ((a + m2 - 1) * (a + m2)),
      (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1)),
    ]) {
      d = 1 / clamp(1 + coef * d);
      c = clamp(1 + coef / c);
      h *= d * c;
    }
    if (Math.abs(d * c - 1) < 1e-15) {
      break;
    }
  }
  return h;
}

/* Regularized incomplete beta function I_x(a, b). */
function incompleteBeta(x, a, b) {
  if (x <= 0 || x >= 1) {
    return x <= 0 ? 0 : 1;
  }
  const front = Math.exp(
    logGamma(a + b) -
      logGamma(a) -
      logGamma(b) +
      a * Math.log(x) +
      b * Math.log1p(-x)
  );
  // Use symmetry for faster convergence: https://dlmf.nist.gov/8.17#v
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(x, a, b)) / a
    : 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/* Two-sided Welch's t-test for equal population means. */
function welchTTest(a, b) {
  const meanA = mean(a),
    meanB = mean(b);
  const seA = variance(a, meanA) / a.length,
    seB = variance(b, meanB) / b.length;
  const t = (meanA - meanB) / Math.sqrt(seA + seB);
  const df =
    (seA + seB) ** 2 / (seA ** 2 / (a.length - 1) + seB ** 2 / (b.length - 1));
  // Two-sided p-value: I_{df / (df + t^2)}(df / 2, 1 / 2).
  return incompleteBeta(df / (df + t * t), df / 2, 0.5);
}

export { incompleteBeta, logGamma, mean, welchTTest };
