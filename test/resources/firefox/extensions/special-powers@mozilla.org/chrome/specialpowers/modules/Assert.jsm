/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
// When you see a javadoc comment that contains a number, it's a reference to a
// specific section of the CommonJS spec.
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
// MIT license: http://opensource.org/licenses/MIT

"use strict";

this.EXPORTED_SYMBOLS = [
  "Assert"
];

/**
 * 1. The assert module provides functions that throw AssertionError's when
 * particular conditions are not met.
 *
 * To use the module you'll need to instantiate it first, which allows consumers
 * to override certain behavior on the newly obtained instance. For examples,
 * see the javadoc comments for the `report` member function.
 */
let Assert = this.Assert = function(reporterFunc) {
  if (reporterFunc)
    this.setReporter(reporterFunc);
};

function instanceOf(object, type) {
  return Object.prototype.toString.call(object) == "[object " + type + "]";
}

function replacer(key, value) {
  if (value === undefined) {
    return "" + value;
  }
  if (typeof value === "number" && (isNaN(value) || !isFinite(value))) {
    return value.toString();
  }
  if (typeof value === "function" || instanceOf(value, "RegExp")) {
    return value.toString();
  }
  return value;
}

const kTruncateLength = 128;

function truncate(text, newLength = kTruncateLength) {
  if (typeof text == "string") {
    return text.length < newLength ? text : text.slice(0, newLength);
  } else {
    return text;
  }
}

function getMessage(error, prefix = "") {
  let actual, expected;
  // Wrap calls to JSON.stringify in try...catch blocks, as they may throw. If
  // so, fall back to toString().
  try {
    actual = JSON.stringify(error.actual, replacer);
  } catch (ex) {
    actual = Object.prototype.toString.call(error.actual);
  }
  try {
    expected = JSON.stringify(error.expected, replacer);
  } catch (ex) {
    expected = Object.prototype.toString.call(error.expected);
  }
  let message = prefix;
  if (error.operator) {
    message += (prefix ? " - " : "") + truncate(actual) + " " + error.operator +
               " " + truncate(expected);
  }
  return message;
}

/**
 * 2. The AssertionError is defined in assert.
 *
 * Example:
 * new assert.AssertionError({
 *   message: message,
 *   actual: actual,
 *   expected: expected,
 *   operator: operator
 * });
 *
 * At present only the four keys mentioned above are used and
 * understood by the spec. Implementations or sub modules can pass
 * other keys to the AssertionError's constructor - they will be
 * ignored.
 */
Assert.AssertionError = function(options) {
  this.name = "AssertionError";
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  this.message = getMessage(this, options.message);
  // The part of the stack that comes from this module is not interesting.
  let stack = Components.stack;
  do {
    stack = stack.caller;
  } while(stack.filename && stack.filename.contains("Assert.jsm"))
  this.stack = stack;
};

// assert.AssertionError instanceof Error
Assert.AssertionError.prototype = Object.create(Error.prototype, {
  constructor: {
    value: Assert.AssertionError,
    enumerable: false,
    writable: true,
    configurable: true
  }
});

let proto = Assert.prototype;

proto._reporter = null;
/**
 * Set a custom assertion report handler function. Arguments passed in to this
 * function are:
 * err (AssertionError|null) An error object when the assertion failed or null
 *                           when it passed
 * message (string) Message describing the assertion
 * stack (stack) Stack trace of the assertion function
 *
 * Example:
 * ```js
 * Assert.setReporter(function customReporter(err, message, stack) {
 *   if (err) {
 *     do_report_result(false, err.message, err.stack);
 *   } else {
 *     do_report_result(true, message, stack);
 *   }
 * });
 * ```
 *
 * @param reporterFunc
 *        (function) Report handler function
 */
proto.setReporter = function(reporterFunc) {
  this._reporter = reporterFunc;
};

/**
 * 3. All of the following functions must throw an AssertionError when a
 * corresponding condition is not met, with a message that may be undefined if
 * not provided.  All assertion methods provide both the actual and expected
 * values to the assertion error for display purposes.
 *
 * This report method only throws errors on assertion failures, as per spec,
 * but consumers of this module (think: xpcshell-test, mochitest) may want to
 * override this default implementation.
 *
 * Example:
 * ```js
 * // The following will report an assertion failure.
 * this.report(1 != 2, 1, 2, "testing JS number math!", "==");
 * ```
 *
 * @param failed
 *        (boolean) Indicates if the assertion failed or not
 * @param actual
 *        (mixed) The result of evaluating the assertion
 * @param expected (optional)
 *        (mixed) Expected result from the test author
 * @param message (optional)
 *        (string) Short explanation of the expected result
 * @param operator (optional)
 *        (string) Operation qualifier used by the assertion method (ex: '==')
 */
proto.report = function(failed, actual, expected, message, operator) {
  let err = new Assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator
  });
  if (!this._reporter) {
    // If no custom reporter is set, throw the error.
    if (failed) {
      throw err;
    }
  } else {
    this._reporter(failed ? err : null, message, err.stack);
  }
};

/**
 * 4. Pure assertion tests whether a value is truthy, as determined by !!guard.
 * assert.ok(guard, message_opt);
 * This statement is equivalent to assert.equal(true, !!guard, message_opt);.
 * To test strictly for the value true, use assert.strictEqual(true, guard,
 * message_opt);.
 *
 * @param value
 *        (mixed) Test subject to be evaluated as truthy
 * @param message (optional)
 *        (string) Short explanation of the expected result
 */
proto.ok = function(value, message) {
  this.report(!value, value, true, message, "==");
};

/**
 * 5. The equality assertion tests shallow, coercive equality with ==.
 * assert.equal(actual, expected, message_opt);
 *
 * @param actual
 *        (mixed) Test subject to be evaluated as equivalent to `expected`
 * @param expected
 *        (mixed) Test reference to evaluate against `actual`
 * @param message (optional)
 *        (string) Short explanation of the expected result
 */
proto.equal = function equal(actual, expected, message) {
  this.report(actual != expected, actual, expected, message, "==");
};

/**
 * 6. The non-equality assertion tests for whether two objects are not equal
 * with != assert.notEqual(actual, expected, message_opt);
 *
 * @param actual
 *        (mixed) Test subject to be evaluated as NOT equivalent to `expected`
 * @param expected
 *        (mixed) Test reference to evaluate against `actual`
 * @param message (optional)
 *        (string) Short explanation of the expected result
 */
proto.notEqual = function notEqual(actual, expected, message) {
  this.report(actual == expected, actual, expected, message, "!=");
};

/**
 * 7. The equivalence assertion tests a deep equality relation.
 * assert.deepEqual(actual, expected, message_opt);
 *
 * We check using the most exact approximation of equality between two objects
 * to keep the chance of false positives to a minimum.
 * `JSON.stringify` is not designed to be used for this purpose; objects may
 * have ambiguous `toJSON()` implementations that would influence the test.
 *
 * @param actual
 *        (mixed) Test subject to be evaluated as equivalent to `expected`, including nested properties
 * @param expected
 *        (mixed) Test reference to evaluate against `actual`
 * @param message (optional)
 *        (string) Short explanation of the expected result
 */
proto.deepEqual = function deepEqual(actual, expected, message) {
  this.report(!_deepEqual(actual, expected), actual, expected, message, "deepEqual");
};

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;
  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (instanceOf(actual, "Date") && instanceOf(expected, "Date")) {
    return actual.getTime() === expected.getTime();
  // 7.3 If the expected value is a RegExp object, the actual value is
  // equivalent if it is also a RegExp object with the same source and
  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (instanceOf(actual, "RegExp") && instanceOf(expected, "RegExp")) {
    return actual.source === expected.source &&
           actual.global === expected.global &&
           actual.multiline === expected.multiline &&
           actual.lastIndex === expected.lastIndex &&
           actual.ignoreCase === expected.ignoreCase;
  // 7.4. Other pairs that do not both pass typeof value == "object",
  // equivalence is determined by ==.
  } else if (typeof actual != "object" && typeof expected != "object") {
    return actual == expected;
  // 7.5 For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isUndefinedOrNull(value) {
  return value === null || value === undefined;
}

function isArguments(object) {
  return instanceOf(object, "Arguments");
}

function objEquiv(a, b) {
  if (isUndefinedOrNull(a) || isUndefinedOrNull(b)) {
    return false;
  }
  // An identical 'prototype' property.
  if (a.prototype !== b.prototype) {
    return false;
  }
  // Object.keys may be broken through screwy arguments passing. Converting to
  // an array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  let ka, kb, key, i;
  try {
    ka = Object.keys(a);
    kb = Object.keys(b);
  } catch (e) {
    // Happens when one is a string literal and the other isn't
    return false;
  }
  // Having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  // The same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  // Equivalent values for every corresponding key, and possibly expensive deep 
  // test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) {
      return false;
    }
  }
  return true;
}

/**
 * 8. The non-equivalence assertion tests for any deep inequality.
 * assert.notDeepEqual(actual, expected, message_opt);
 *
 * @param actual
 *        (mixed) Test subject to be evaluated as NOT equivalent to `expected`, including nested properties
 * @param expected
 *        (mixed) Test reference to evaluate against `actual`
 * @param message (optional)
 *        (string) Short explanation of the expected result
 */
proto.notDeepEqual = function notDeepEqual(actual, expected, message) {
  this.report(_deepEqual(actual, expected), actual, expected, message, "notDeepEqual");
};

/**
 * 9. The strict equality assertion tests strict equality, as determined by ===.
 * assert.strictEqual(actual, expected, message_opt);
 *
 * @param actual
 *        (mixed) Test subject to be evaluated as strictly equivalent to `expected`
 * @param expected
 *        (mixed) Test reference to evaluate against `actual`
 * @param message (optional)
 *        (string) Short explanation of the expected result
 */
proto.strictEqual = function strictEqual(actual, expected, message) {
  this.report(actual !== expected, actual, expected, message, "===");
};

/**
 * 10. The strict non-equality assertion tests for strict inequality, as
 * determined by !==.  assert.notStrictEqual(actual, expected, message_opt);
 *
 * @param actual
 *        (mixed) Test subject to be evaluated as NOT strictly equivalent to `expected`
 * @param expected
 *        (mixed) Test reference to evaluate against `actual`
 * @param message (optional)
 *        (string) Short explanation of the expected result
 */
proto.notStrictEqual = function notStrictEqual(actual, expected, message) {
  this.report(actual === expected, actual, expected, message, "!==");
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (instanceOf(expected, "RegExp")) {
    return expected.test(actual);
  } else if (actual instanceof expected) {
    return true;
  } else if (expected.call({}, actual) === true) {
    return true;
  }

  return false;
}

/**
 * 11. Expected to throw an error:
 * assert.throws(block, Error_opt, message_opt);
 *
 * @param block
 *        (function) Function block to evaluate and catch eventual thrown errors
 * @param expected (optional)
 *        (mixed) Test reference to evaluate against the thrown result from `block`
 * @param message (optional)
 *        (string) Short explanation of the expected result
 */
proto.throws = function(block, expected, message) {
  let actual;

  if (typeof expected === "string") {
    message = expected;
    expected = null;
  }

  try {
    block();
  } catch (e) {
    actual = e;
  }

  message = (expected && expected.name ? " (" + expected.name + ")." : ".") +
            (message ? " " + message : ".");

  if (!actual) {
    this.report(true, actual, expected, "Missing expected exception" + message);
  }

  if ((actual && expected && !expectedException(actual, expected))) {
    throw actual;
  }

  this.report(false, expected, expected, message);
};
