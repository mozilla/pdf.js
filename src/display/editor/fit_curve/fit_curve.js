/**
 *  @preserve  JavaScript implementation of
 *  Algorithm for Automatically Fitting Digitized Curves
 *  by Philip J. Schneider
 *  "Graphics Gems", Academic Press, 1990
 *
 *  The MIT License (MIT)
 *
 *  https://github.com/soswow/fit-curves
 */

/**
 * Fit one or more Bezier curves to a set of points.
 *
 * @param {Array<Array<Number>>} points - Array of digitized points,
 *   e.g. [[5,5],[5,50],[110,140],[210,160],[320,110]]
 * @param {Number} maxError - Tolerance, squared error between points and
 *   fitted curve
 * @returns {Array<Array<Array<Number>>>} Array of Bezier curves, where each
 *   element is
 *   [first-point, control-point-1, control-point-2, second-point]
 *    and points are [x, y]
 */
function fitCurve(points, maxError, progressCallback) {
  if (!Array.isArray(points)) {
    throw new TypeError("First argument should be an array");
  }
  points.forEach(point => {
    if (
      !Array.isArray(point) ||
      point.some(item => typeof item !== "number") ||
      point.length !== points[0].length
    ) {
      throw Error(
        "Each point should be an array of numbers. Each point should have the same amount of numbers."
      );
    }
  });

  // Remove duplicate points
  points = points.filter(
    (point, i) => i === 0 || !point.every((val, j) => val === points[i - 1][j])
  );

  if (points.length < 2) {
    return [];
  }

  const len = points.length;
  const leftTangent = createTangent(points[1], points[0]);
  const rightTangent = createTangent(points[len - 2], points[len - 1]);

  return fitCubic(
    points,
    leftTangent,
    rightTangent,
    maxError,
    progressCallback
  );
}

/**
 * Fit a Bezier curve to a (sub)set of digitized points.
 * Your code should not call this function directly.
 * Use {@link fitCurve} instead.
 *
 * @param {Array<Array<Number>>} points - Array of digitized points,
 *   e.g. [[5,5],[5,50],[110,140],[210,160],[320,110]]
 * @param {Array<Number>} leftTangent - Unit tangent vector at start point
 * @param {Array<Number>} rightTangent - Unit tangent vector at end point
 * @param {Number} error - Tolerance, squared error between points and
 *   fitted curve
 * @returns {Array<Array<Array<Number>>>} Array of Bezier curves, where
 *   each element is
 *   [first-point, control-point-1, control-point-2, second-point]
 *   and points are [x, y]
 */
function fitCubic(points, leftTangent, rightTangent, error, progressCallback) {
  const MaxIterations = 20; // Max times to try iterating (to find an acceptable curve)

  let bezCurve, // Control points of fitted Bezier curve
    uPrime, // Improved parameter values
    maxError,
    prevErr, // Maximum fitting error
    splitPoint,
    prevSplit, // Point to split point set at if we need more than one curve
    centerVector,
    beziers, // Array of fitted Bezier curves if we need more than one curve
    dist,
    i;

  // Use heuristic if region only has two points in it
  if (points.length === 2) {
    dist = maths.vectorLen(maths.subtract(points[0], points[1])) / 3.0;
    bezCurve = [
      points[0],
      maths.addArrays(points[0], maths.mulItems(leftTangent, dist)),
      maths.addArrays(points[1], maths.mulItems(rightTangent, dist)),
      points[1],
    ];
    return [bezCurve];
  }

  // Parameterize points, and attempt to fit curve
  // Parameter values for point
  const u = chordLengthParameterize(points);
  [bezCurve, maxError, splitPoint] = generateAndReport(
    points,
    u,
    u,
    leftTangent,
    rightTangent,
    progressCallback
  );

  if (maxError === 0 || maxError < error) {
    return [bezCurve];
  }
  // If error not too large, try some reparameterization and iteration
  if (maxError < error * error) {
    uPrime = u;
    prevErr = maxError;
    prevSplit = splitPoint;

    for (i = 0; i < MaxIterations; i++) {
      uPrime = reparameterize(bezCurve, points, uPrime);
      [bezCurve, maxError, splitPoint] = generateAndReport(
        points,
        u,
        uPrime,
        leftTangent,
        rightTangent,
        progressCallback
      );

      if (maxError < error) {
        return [bezCurve];
      }
      // If the development of the fitted curve grinds to a halt,
      // we abort this attempt (and try a shorter curve):
      else if (splitPoint === prevSplit) {
        const errChange = maxError / prevErr;
        if (errChange > 0.9999 && errChange < 1.0001) {
          break;
        }
      }

      prevErr = maxError;
      prevSplit = splitPoint;
    }
  }

  // Fitting failed -- split at max error point and fit recursively
  beziers = [];

  // To create a smooth transition from one curve segment to the next, we
  // calculate the line between the points directly before and after the
  // center, and use that as the tangent both to and from the center point.
  centerVector = maths.subtract(points[splitPoint - 1], points[splitPoint + 1]);
  // However, this won't work if they're the same point, because the line we
  // want to use as a tangent would be 0. Instead, we calculate the line from
  // that "double-point" to the center point, and use its tangent.
  if (centerVector.every(val => val === 0)) {
    // [x,y] -> [-y,x]: http://stackoverflow.com/a/4780141/1869660
    centerVector = maths.subtract(points[splitPoint - 1], points[splitPoint]);
    [centerVector[0], centerVector[1]] = [-centerVector[1], centerVector[0]];
  }
  const toCenterTangent = maths.normalize(centerVector);
  // To and from need to point in opposite directions:
  // Unit tangent vector(s) at splitPoint
  const fromCenterTangent = maths.mulItems(toCenterTangent, -1);

  /*
    Note:
    An alternative to this "divide and conquer" recursion could be to always
    let new curve segments start by trying to go all the way to the end,
    instead of only to the end of the current subdivided polyline.
    That might let many segments fit a few points more, reducing the number of
    total segments.
  
    However, a few tests have shown that the segment reduction is insignificant
    (240 pts, 100 err: 25 curves vs 27 curves. 140 pts, 100 err: 17 curves
    on both), and the results take twice as many steps and milliseconds to
    finish, without looking any better than what we already have.
  */
  beziers = beziers.concat(
    fitCubic(
      points.slice(0, splitPoint + 1),
      leftTangent,
      toCenterTangent,
      error,
      progressCallback
    )
  );
  beziers = beziers.concat(
    fitCubic(
      points.slice(splitPoint),
      fromCenterTangent,
      rightTangent,
      error,
      progressCallback
    )
  );
  return beziers;
}

function generateAndReport(
  points,
  paramsOrig,
  paramsPrime,
  leftTangent,
  rightTangent,
  progressCallback
) {
  const bezCurve = generateBezier(
    points,
    paramsPrime,
    leftTangent,
    rightTangent
  );
  // Find max deviation of points to fitted curve.
  // Here we always use the original parameters (from
  // chordLengthParameterize()), because we need to compare the current
  // curve to the actual source polyline, and not the currently iterated
  // parameters which reparameterize() & generateBezier() use, as those
  // have probably drifted far away and may no longer be in ascending order.
  const [maxError, splitPoint] = computeMaxError(points, bezCurve, paramsOrig);

  if (progressCallback) {
    progressCallback({
      bez: bezCurve,
      points,
      params: paramsOrig,
      maxErr: maxError,
      maxPoint: splitPoint,
    });
  }

  return [bezCurve, maxError, splitPoint];
}

/**
 * Use least-squares method to find Bezier control points for region.
 *
 * @param {Array<Array<Number>>} points - Array of digitized points
 * @param {Array<Number>} parameters - Parameter values for region
 * @param {Array<Number>} leftTangent - Unit tangent vector at start point
 * @param {Array<Number>} rightTangent - Unit tangent vector at end point
 * @returns {Array<Array<Number>>} Approximated Bezier curve:
 *   [first-point, control-point-1, control-point-2, second-point]
 *   where points are [x, y]
 */
function generateBezier(points, parameters, leftTangent, rightTangent) {
  let a, // Precomputed rhs for eqn
    tmp,
    u,
    ux;

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  // Bezier curve ctl pts
  const bezCurve = [firstPoint, null, null, lastPoint];

  // Compute the A's
  const A = maths.zeros_Xx2x2(parameters.length);
  for (let i = 0, len = parameters.length; i < len; i++) {
    u = parameters[i];
    ux = 1 - u;
    a = A[i];

    a[0] = maths.mulItems(leftTangent, 3 * u * (ux * ux));
    a[1] = maths.mulItems(rightTangent, 3 * ux * (u * u));
  }

  // Create the C and X matrices
  const C = [
    [0, 0],
    [0, 0],
  ];
  const X = [0, 0];
  for (let i = 0, len = points.length; i < len; i++) {
    u = parameters[i];
    a = A[i];

    C[0][0] += maths.dot(a[0], a[0]);
    C[0][1] += maths.dot(a[0], a[1]);
    C[1][0] += maths.dot(a[0], a[1]);
    C[1][1] += maths.dot(a[1], a[1]);

    tmp = maths.subtract(
      points[i],
      bezier.q([firstPoint, firstPoint, lastPoint, lastPoint], u)
    );

    X[0] += maths.dot(a[0], tmp);
    X[1] += maths.dot(a[1], tmp);
  }

  // Compute the determinants of C and X
  const det_C0_C1 = C[0][0] * C[1][1] - C[1][0] * C[0][1];
  const det_C0_X = C[0][0] * X[1] - C[1][0] * X[0];
  const det_X_C1 = X[0] * C[1][1] - X[1] * C[0][1];

  // Finally, derive alpha values
  const alpha_l = det_C0_C1 === 0 ? 0 : det_X_C1 / det_C0_C1;
  const alpha_r = det_C0_C1 === 0 ? 0 : det_C0_X / det_C0_C1;

  // If alpha negative, use the Wu/Barsky heuristic (see text).
  // If alpha is 0, you get coincident control points that lead to
  // divide by zero in any subsequent NewtonRaphsonRootFind() call.
  const segLength = maths.vectorLen(maths.subtract(firstPoint, lastPoint));
  const epsilon = 1.0e-6 * segLength;
  if (alpha_l < epsilon || alpha_r < epsilon) {
    // Fall back on standard (probably inaccurate) formula, and subdivide
    // further if needed.
    bezCurve[1] = maths.addArrays(
      firstPoint,
      maths.mulItems(leftTangent, segLength / 3.0)
    );
    bezCurve[2] = maths.addArrays(
      lastPoint,
      maths.mulItems(rightTangent, segLength / 3.0)
    );
  } else {
    // First and last control points of the Bezier curve are
    // positioned exactly at the first and last data points
    // Control points 1 and 2 are positioned an alpha distance out
    // on the tangent vectors, left and right, respectively
    bezCurve[1] = maths.addArrays(
      firstPoint,
      maths.mulItems(leftTangent, alpha_l)
    );
    bezCurve[2] = maths.addArrays(
      lastPoint,
      maths.mulItems(rightTangent, alpha_r)
    );
  }

  return bezCurve;
}

/**
 * Given set of points and their parameterization, try to find a better
 * parameterization.
 *
 * @param {Array<Array<Number>>} bezier - Current fitted curve
 * @param {Array<Array<Number>>} points - Array of digitized points
 * @param {Array<Number>} parameters - Current parameter values
 * @returns {Array<Number>} New parameter values
 */
function reparameterize(bezier, points, parameters) {
  return parameters.map((p, i) => newtonRaphsonRootFind(bezier, points[i], p));
}

/**
 * Use Newton-Raphson iteration to find better root.
 *
 * @param {Array<Array<Number>>} bez - Current fitted curve
 * @param {Array<Number>} point - Digitized point
 * @param {Number} u - Parameter value for "P"
 * @returns {Number} New u
 */
function newtonRaphsonRootFind(bez, point, u) {
  /*
    Newton's root finding algorithm calculates f(x)=0 by reiterating
    x_n+1 = x_n - f(x_n)/f'(x_n)
    We are trying to find curve parameter u for some point p that minimizes
    the distance from that point to the curve. Distance point to curve
    is d=q(u)-p.
    At minimum distance the point is perpendicular to the curve.
    We are solving
    f = q(u)-p * q'(u) = 0
    with
    f' = q'(u) * q'(u) + q(u)-p * q''(u)
    gives
    u_n+1 = u_n - |q(u_n)-p * q'(u_n)| / |q'(u_n)**2 + q(u_n)-p * q''(u_n)|
  */

  const d = maths.subtract(bezier.q(bez, u), point),
    qprime = bezier.qprime(bez, u),
    numerator = maths.mulMatrix(d, qprime),
    denominator =
      maths.sum(maths.squareItems(qprime)) +
      2 * maths.mulMatrix(d, bezier.qprimeprime(bez, u));

  if (denominator === 0) {
    return u;
  }
  return u - numerator / denominator;
}

/**
 * Assign parameter values to digitized points using relative distances
 * between points.
 *
 * @param {Array<Array<Number>>} points - Array of digitized points
 * @returns {Array<Number>} Parameter values
 */
function chordLengthParameterize(points) {
  let u = [],
    currU,
    prevU,
    prevP;

  points.forEach((p, i) => {
    currU = i ? prevU + maths.vectorLen(maths.subtract(p, prevP)) : 0;
    u.push(currU);

    prevU = currU;
    prevP = p;
  });
  u = u.map(x => x / prevU);

  return u;
}

/**
 * Find the maximum squared distance of digitized points to fitted curve.
 *
 * @param {Array<Array<Number>>} points - Array of digitized points
 * @param {Array<Array<Number>>} bez - Fitted curve
 * @param {Array<Number>} parameters - Parameterization of points
 * @returns {Array<Number>} Maximum error (squared) and point of max error
 */
function computeMaxError(points, bez, parameters) {
  let dist, // Current error
    maxDist, // Maximum error
    splitPoint, // Point of maximum error
    v, // Vector from point to curve
    i,
    count,
    point,
    t;

  maxDist = 0;
  splitPoint = Math.floor(points.length / 2);

  const t_distMap = mapTtoRelativeDistances(bez, 10);

  for (i = 0, count = points.length; i < count; i++) {
    point = points[i];
    // Find 't' for a point on the bez curve that's as close to 'point'
    // as possible:
    t = find_t(bez, parameters[i], t_distMap, 10);

    v = maths.subtract(bezier.q(bez, t), point);
    dist = v[0] * v[0] + v[1] * v[1];

    if (dist > maxDist) {
      maxDist = dist;
      splitPoint = i;
    }
  }

  return [maxDist, splitPoint];
}

// Sample 't's and map them to relative distances along the curve:
function mapTtoRelativeDistances(bez, B_parts) {
  let B_t_curr;
  let B_t_dist = [0];
  let B_t_prev = bez[0];
  let sumLen = 0;

  for (let i = 1; i <= B_parts; i++) {
    B_t_curr = bezier.q(bez, i / B_parts);

    sumLen += maths.vectorLen(maths.subtract(B_t_curr, B_t_prev));

    B_t_dist.push(sumLen);
    B_t_prev = B_t_curr;
  }

  // Normalize B_length to the same interval as the parameter distances; 0 to 1:
  B_t_dist = B_t_dist.map(x => x / sumLen);
  return B_t_dist;
}

function find_t(bez, param, t_distMap, B_parts) {
  if (param < 0) {
    return 0;
  }
  if (param > 1) {
    return 1;
  }

  /*
    'param' is a value between 0 and 1 telling us the relative position
    of a point on the source polyline (linearly from the start (0) to the
    end (1)).
    To see if a given curve - 'bez' - is a close approximation of the polyline,
    we compare such a poly-point to the point on the curve that's the same
    relative distance along the curve's length.
  
    But finding that curve-point takes a little work:
    There is a function "B(t)" to find points along a curve from the parametric
    parameter 't' (also relative from 0 to 1: http://stackoverflow.com/a/32841764/1869660
                                              http://pomax.github.io/bezierinfo/#explanation),
    but 't' isn't linear by length (http://gamedev.stackexchange.com/questions/105230).
  
    So, we sample some points along the curve using a handful of values for 't'.
    Then, we calculate the length between those samples via plain euclidean
    distance; B(t) concentrates the points around sharp turns, so this should
    give us a good-enough outline of the curve. Thus, for a given relative
    distance ('param'), we can now find an upper and lower value for the
    corresponding 't' by searching through those sampled distances. Finally, we
    just use linear interpolation to find a better value for the exact 't'.
  
    More info:
        http://gamedev.stackexchange.com/questions/105230/points-evenly-spaced-along-a-bezier-curve
        http://stackoverflow.com/questions/29438398/cheap-way-of-calculating-cubic-bezier-length
        http://steve.hollasch.net/cgindex/curves/cbezarclen.html
        https://github.com/retuxx/tinyspline
   */
  let lenMax, lenMin, tMax, tMin, t;

  // Find the two t-s that the current param distance lies between,
  // and then interpolate a somewhat accurate value for the exact t:
  for (let i = 1; i <= B_parts; i++) {
    if (param <= t_distMap[i]) {
      tMin = (i - 1) / B_parts;
      tMax = i / B_parts;
      lenMin = t_distMap[i - 1];
      lenMax = t_distMap[i];

      t = ((param - lenMin) / (lenMax - lenMin)) * (tMax - tMin) + tMin;
      break;
    }
  }
  return t;
}

/**
 * Creates a vector of length 1 which shows the direction from B to A
 */
function createTangent(pointA, pointB) {
  return maths.normalize(maths.subtract(pointA, pointB));
}

/*
    Simplified versions of what we need from math.js
    Optimized for our input, which is only numbers and 1x2 arrays
    (i.e. [x, y] coordinates).
*/
class maths {
  static zeros_Xx2x2(x) {
    const zs = [];
    while (x--) {
      zs.push([0, 0]);
    }
    return zs;
  }

  static mulItems(items, multiplier) {
    return items.map(x => x * multiplier);
  }

  static mulMatrix(m1, m2) {
    // https://en.wikipedia.org/wiki/Matrix_multiplication#Matrix_product_.28two_matrices.29
    // Simplified to only handle 1-dimensional matrices (i.e. arrays)
    // of equal length:
    return m1.reduce((sum, x1, i) => sum + x1 * m2[i], 0);
  }

  // Only used to subract to points (or at least arrays):
  static subtract(arr1, arr2) {
    return arr1.map((x1, i) => x1 - arr2[i]);
  }

  static addArrays(arr1, arr2) {
    return arr1.map((x1, i) => x1 + arr2[i]);
  }

  static addItems(items, addition) {
    return items.map(x => x + addition);
  }

  static sum(items) {
    return items.reduce((sum, x) => sum + x);
  }

  // Only used on two arrays. The dot product is equal to the matrix product
  // in this case:
  static dot(m1, m2) {
    return maths.mulMatrix(m1, m2);
  }

  // https://en.wikipedia.org/wiki/Norm_(mathematics)#Euclidean_norm
  //  var norm = logAndRun(math.norm);
  static vectorLen(v) {
    return Math.hypot(...v);
  }

  static divItems(items, divisor) {
    return items.map(x => x / divisor);
  }

  static squareItems(items) {
    return items.map(x => x * x);
  }

  static normalize(v) {
    return this.divItems(v, this.vectorLen(v));
  }
}

class bezier {
  // Evaluates cubic bezier at t, return point
  static q(ctrlPoly, t) {
    const tx = 1.0 - t;
    const pA = maths.mulItems(ctrlPoly[0], tx * tx * tx),
      pB = maths.mulItems(ctrlPoly[1], 3 * tx * tx * t),
      pC = maths.mulItems(ctrlPoly[2], 3 * tx * t * t),
      pD = maths.mulItems(ctrlPoly[3], t * t * t);
    return maths.addArrays(maths.addArrays(pA, pB), maths.addArrays(pC, pD));
  }

  // Evaluates cubic bezier first derivative at t, return point
  static qprime(ctrlPoly, t) {
    const tx = 1.0 - t;
    const pA = maths.mulItems(
        maths.subtract(ctrlPoly[1], ctrlPoly[0]),
        3 * tx * tx
      ),
      pB = maths.mulItems(maths.subtract(ctrlPoly[2], ctrlPoly[1]), 6 * tx * t),
      pC = maths.mulItems(maths.subtract(ctrlPoly[3], ctrlPoly[2]), 3 * t * t);
    return maths.addArrays(maths.addArrays(pA, pB), pC);
  }

  // Evaluates cubic bezier second derivative at t, return point
  static qprimeprime(ctrlPoly, t) {
    return maths.addArrays(
      maths.mulItems(
        maths.addArrays(
          maths.subtract(ctrlPoly[2], maths.mulItems(ctrlPoly[1], 2)),
          ctrlPoly[0]
        ),
        6 * (1.0 - t)
      ),
      maths.mulItems(
        maths.addArrays(
          maths.subtract(ctrlPoly[3], maths.mulItems(ctrlPoly[2], 2)),
          ctrlPoly[1]
        ),
        6 * t
      )
    );
  }
}

export { fitCurve };
