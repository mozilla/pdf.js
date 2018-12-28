/*
 * To the extent possible under law, the authors have dedicated all copyright
 * and related and neighboring rights to this software to the public
 * domain worldwide. This software is distributed without any warranty.
 *
 * You should have received a copy of the CC0 Public Domain Dedication along
 * with this software. If not, see https://creativecommons.org/publicdomain/zero/1.0/.
 */

(function(e, a) { for(var i in a) e[i] = a[i]; }(exports, /******/ (function(modules) { // webpackBootstrap
/******/  // The module cache
/******/  var installedModules = {};
/******/
/******/  // The require function
/******/  function __webpack_require__(moduleId) {
/******/
/******/    // Check if module is in cache
/******/    if(installedModules[moduleId])
/******/      return installedModules[moduleId].exports;
/******/
/******/    // Create a new module (and put it into the cache)
/******/    var module = installedModules[moduleId] = {
/******/      i: moduleId,
/******/      l: false,
/******/      exports: {}
/******/    };
/******/
/******/    // Execute the module function
/******/    modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/    // Flag the module as loaded
/******/    module.l = true;
/******/
/******/    // Return the exports of the module
/******/    return module.exports;
/******/  }
/******/
/******/
/******/  // expose the modules object (__webpack_modules__)
/******/  __webpack_require__.m = modules;
/******/
/******/  // expose the module cache
/******/  __webpack_require__.c = installedModules;
/******/
/******/  // identity function for calling harmony imports with the correct context
/******/  __webpack_require__.i = function(value) { return value; };
/******/
/******/  // define getter function for harmony exports
/******/  __webpack_require__.d = function(exports, name, getter) {
/******/    if(!__webpack_require__.o(exports, name)) {
/******/      Object.defineProperty(exports, name, {
/******/        configurable: false,
/******/        enumerable: true,
/******/        get: getter
/******/      });
/******/    }
/******/  };
/******/
/******/  // getDefaultExport function for compatibility with non-harmony modules
/******/  __webpack_require__.n = function(module) {
/******/    var getter = module && module.__esModule ?
/******/      function getDefault() { return module['default']; } :
/******/      function getModuleExports() { return module; };
/******/    __webpack_require__.d(getter, 'a', getter);
/******/    return getter;
/******/  };
/******/
/******/  // Object.prototype.hasOwnProperty.call
/******/  __webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/  // __webpack_public_path__
/******/  __webpack_require__.p = "";
/******/
/******/  // Load entry module and return exports
/******/  return __webpack_require__(__webpack_require__.s = 7);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _require = __webpack_require__(1),
    assert = _require.assert;

function IsPropertyKey(argument) {
  return typeof argument === 'string' || (typeof argument === 'undefined' ? 'undefined' : _typeof(argument)) === 'symbol';
}

exports.typeIsObject = function (x) {
  return (typeof x === 'undefined' ? 'undefined' : _typeof(x)) === 'object' && x !== null || typeof x === 'function';
};

exports.createDataProperty = function (o, p, v) {
  assert(exports.typeIsObject(o));
  Object.defineProperty(o, p, { value: v, writable: true, enumerable: true, configurable: true });
};

exports.createArrayFromList = function (elements) {
  // We use arrays to represent lists, so this is basically a no-op.
  // Do a slice though just in case we happen to depend on the unique-ness.
  return elements.slice();
};

exports.ArrayBufferCopy = function (dest, destOffset, src, srcOffset, n) {
  new Uint8Array(dest).set(new Uint8Array(src, srcOffset, n), destOffset);
};

exports.CreateIterResultObject = function (value, done) {
  assert(typeof done === 'boolean');
  var obj = {};
  Object.defineProperty(obj, 'value', { value: value, enumerable: true, writable: true, configurable: true });
  Object.defineProperty(obj, 'done', { value: done, enumerable: true, writable: true, configurable: true });
  return obj;
};

exports.IsFiniteNonNegativeNumber = function (v) {
  if (Number.isNaN(v)) {
    return false;
  }
  if (v === Infinity) {
    return false;
  }
  if (v < 0) {
    return false;
  }

  return true;
};

function Call(F, V, args) {
  if (typeof F !== 'function') {
    throw new TypeError('Argument is not a function');
  }

  return Function.prototype.apply.call(F, V, args);
}

exports.InvokeOrNoop = function (O, P, args) {
  assert(O !== undefined);
  assert(IsPropertyKey(P));
  assert(Array.isArray(args));

  var method = O[P];
  if (method === undefined) {
    return undefined;
  }

  return Call(method, O, args);
};

exports.PromiseInvokeOrNoop = function (O, P, args) {
  assert(O !== undefined);
  assert(IsPropertyKey(P));
  assert(Array.isArray(args));
  try {
    return Promise.resolve(exports.InvokeOrNoop(O, P, args));
  } catch (returnValueE) {
    return Promise.reject(returnValueE);
  }
};

exports.PromiseInvokeOrPerformFallback = function (O, P, args, F, argsF) {
  assert(O !== undefined);
  assert(IsPropertyKey(P));
  assert(Array.isArray(args));
  assert(Array.isArray(argsF));

  var method = void 0;
  try {
    method = O[P];
  } catch (methodE) {
    return Promise.reject(methodE);
  }

  if (method === undefined) {
    return F.apply(null, argsF);
  }

  try {
    return Promise.resolve(Call(method, O, args));
  } catch (e) {
    return Promise.reject(e);
  }
};

// Not implemented correctly
exports.TransferArrayBuffer = function (O) {
  return O.slice();
};

exports.ValidateAndNormalizeHighWaterMark = function (highWaterMark) {
  highWaterMark = Number(highWaterMark);
  if (Number.isNaN(highWaterMark) || highWaterMark < 0) {
    throw new RangeError('highWaterMark property of a queuing strategy must be non-negative and non-NaN');
  }

  return highWaterMark;
};

exports.ValidateAndNormalizeQueuingStrategy = function (size, highWaterMark) {
  if (size !== undefined && typeof size !== 'function') {
    throw new TypeError('size property of a queuing strategy must be a function');
  }

  highWaterMark = exports.ValidateAndNormalizeHighWaterMark(highWaterMark);

  return { size: size, highWaterMark: highWaterMark };
};

/***/ }),
/* 1 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


function rethrowAssertionErrorRejection(e) {
  // Used throughout the reference implementation, as `.catch(rethrowAssertionErrorRejection)`, to ensure any errors
  // get shown. There are places in the spec where we do promise transformations and purposefully ignore or don't
  // expect any errors, but assertion errors are always problematic.
  if (e && e.constructor === AssertionError) {
    setTimeout(function () {
      throw e;
    }, 0);
  }
};

function AssertionError(message) {
  this.name = 'AssertionError';
  this.message = message || '';
  this.stack = new Error().stack;
}
AssertionError.prototype = Object.create(Error.prototype);
AssertionError.prototype.constructor = AssertionError;

function assert(value, message) {
  if (!value) {
    throw new AssertionError(message);
  }
}

module.exports = {
  rethrowAssertionErrorRejection: rethrowAssertionErrorRejection,
  AssertionError: AssertionError,
  assert: assert
};

/***/ }),
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _require = __webpack_require__(0),
    InvokeOrNoop = _require.InvokeOrNoop,
    PromiseInvokeOrNoop = _require.PromiseInvokeOrNoop,
    ValidateAndNormalizeQueuingStrategy = _require.ValidateAndNormalizeQueuingStrategy,
    typeIsObject = _require.typeIsObject;

var _require2 = __webpack_require__(1),
    assert = _require2.assert,
    rethrowAssertionErrorRejection = _require2.rethrowAssertionErrorRejection;

var _require3 = __webpack_require__(3),
    DequeueValue = _require3.DequeueValue,
    EnqueueValueWithSize = _require3.EnqueueValueWithSize,
    PeekQueueValue = _require3.PeekQueueValue,
    ResetQueue = _require3.ResetQueue;

var WritableStream = function () {
  function WritableStream() {
    var underlyingSink = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
        size = _ref.size,
        _ref$highWaterMark = _ref.highWaterMark,
        highWaterMark = _ref$highWaterMark === undefined ? 1 : _ref$highWaterMark;

    _classCallCheck(this, WritableStream);

    this._state = 'writable';

    // The error that will be reported by new method calls once the state becomes errored. Only set when [[state]] is
    // 'erroring' or 'errored'. May be set to an undefined value.
    this._storedError = undefined;

    this._writer = undefined;

    // Initialize to undefined first because the constructor of the controller checks this
    // variable to validate the caller.
    this._writableStreamController = undefined;

    // This queue is placed here instead of the writer class in order to allow for passing a writer to the next data
    // producer without waiting for the queued writes to finish.
    this._writeRequests = [];

    // Write requests are removed from _writeRequests when write() is called on the underlying sink. This prevents
    // them from being erroneously rejected on error. If a write() call is in-flight, the request is stored here.
    this._inFlightWriteRequest = undefined;

    // The promise that was returned from writer.close(). Stored here because it may be fulfilled after the writer
    // has been detached.
    this._closeRequest = undefined;

    // Close request is removed from _closeRequest when close() is called on the underlying sink. This prevents it
    // from being erroneously rejected on error. If a close() call is in-flight, the request is stored here.
    this._inFlightCloseRequest = undefined;

    // The promise that was returned from writer.abort(). This may also be fulfilled after the writer has detached.
    this._pendingAbortRequest = undefined;

    // The backpressure signal set by the controller.
    this._backpressure = false;

    var type = underlyingSink.type;

    if (type !== undefined) {
      throw new RangeError('Invalid type is specified');
    }

    this._writableStreamController = new WritableStreamDefaultController(this, underlyingSink, size, highWaterMark);
    this._writableStreamController.__startSteps();
  }

  _createClass(WritableStream, [{
    key: 'abort',
    value: function abort(reason) {
      if (IsWritableStream(this) === false) {
        return Promise.reject(streamBrandCheckException('abort'));
      }

      if (IsWritableStreamLocked(this) === true) {
        return Promise.reject(new TypeError('Cannot abort a stream that already has a writer'));
      }

      return WritableStreamAbort(this, reason);
    }
  }, {
    key: 'getWriter',
    value: function getWriter() {
      if (IsWritableStream(this) === false) {
        throw streamBrandCheckException('getWriter');
      }

      return AcquireWritableStreamDefaultWriter(this);
    }
  }, {
    key: 'locked',
    get: function get() {
      if (IsWritableStream(this) === false) {
        throw streamBrandCheckException('locked');
      }

      return IsWritableStreamLocked(this);
    }
  }]);

  return WritableStream;
}();

module.exports = {
  AcquireWritableStreamDefaultWriter: AcquireWritableStreamDefaultWriter,
  IsWritableStream: IsWritableStream,
  IsWritableStreamLocked: IsWritableStreamLocked,
  WritableStream: WritableStream,
  WritableStreamAbort: WritableStreamAbort,
  WritableStreamDefaultControllerError: WritableStreamDefaultControllerError,
  WritableStreamDefaultWriterCloseWithErrorPropagation: WritableStreamDefaultWriterCloseWithErrorPropagation,
  WritableStreamDefaultWriterRelease: WritableStreamDefaultWriterRelease,
  WritableStreamDefaultWriterWrite: WritableStreamDefaultWriterWrite,
  WritableStreamCloseQueuedOrInFlight: WritableStreamCloseQueuedOrInFlight
};

// Abstract operations for the WritableStream.

function AcquireWritableStreamDefaultWriter(stream) {
  return new WritableStreamDefaultWriter(stream);
}

function IsWritableStream(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_writableStreamController')) {
    return false;
  }

  return true;
}

function IsWritableStreamLocked(stream) {
  assert(IsWritableStream(stream) === true, 'IsWritableStreamLocked should only be used on known writable streams');

  if (stream._writer === undefined) {
    return false;
  }

  return true;
}

function WritableStreamAbort(stream, reason) {
  var state = stream._state;
  if (state === 'closed') {
    return Promise.resolve(undefined);
  }
  if (state === 'errored') {
    return Promise.reject(stream._storedError);
  }
  var error = new TypeError('Requested to abort');
  if (stream._pendingAbortRequest !== undefined) {
    return Promise.reject(error);
  }

  assert(state === 'writable' || state === 'erroring', 'state must be writable or erroring');

  var wasAlreadyErroring = false;
  if (state === 'erroring') {
    wasAlreadyErroring = true;
    // reason will not be used, so don't keep a reference to it.
    reason = undefined;
  }

  var promise = new Promise(function (resolve, reject) {
    stream._pendingAbortRequest = {
      _resolve: resolve,
      _reject: reject,
      _reason: reason,
      _wasAlreadyErroring: wasAlreadyErroring
    };
  });

  if (wasAlreadyErroring === false) {
    WritableStreamStartErroring(stream, error);
  }

  return promise;
}

// WritableStream API exposed for controllers.

function WritableStreamAddWriteRequest(stream) {
  assert(IsWritableStreamLocked(stream) === true);
  assert(stream._state === 'writable');

  var promise = new Promise(function (resolve, reject) {
    var writeRequest = {
      _resolve: resolve,
      _reject: reject
    };

    stream._writeRequests.push(writeRequest);
  });

  return promise;
}

function WritableStreamDealWithRejection(stream, error) {
  var state = stream._state;

  if (state === 'writable') {
    WritableStreamStartErroring(stream, error);
    return;
  }

  assert(state === 'erroring');
  WritableStreamFinishErroring(stream);
}

function WritableStreamStartErroring(stream, reason) {
  assert(stream._storedError === undefined, 'stream._storedError === undefined');
  assert(stream._state === 'writable', 'state must be writable');

  var controller = stream._writableStreamController;
  assert(controller !== undefined, 'controller must not be undefined');

  stream._state = 'erroring';
  stream._storedError = reason;
  var writer = stream._writer;
  if (writer !== undefined) {
    WritableStreamDefaultWriterEnsureReadyPromiseRejected(writer, reason);
  }

  if (WritableStreamHasOperationMarkedInFlight(stream) === false && controller._started === true) {
    WritableStreamFinishErroring(stream);
  }
}

function WritableStreamFinishErroring(stream) {
  assert(stream._state === 'erroring', 'stream._state === erroring');
  assert(WritableStreamHasOperationMarkedInFlight(stream) === false, 'WritableStreamHasOperationMarkedInFlight(stream) === false');
  stream._state = 'errored';
  stream._writableStreamController.__errorSteps();

  var storedError = stream._storedError;
  for (var i = 0; i < stream._writeRequests.length; i++) {
    var writeRequest = stream._writeRequests[i];
    writeRequest._reject(storedError);
  }
  stream._writeRequests = [];

  if (stream._pendingAbortRequest === undefined) {
    WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream);
    return;
  }

  var abortRequest = stream._pendingAbortRequest;
  stream._pendingAbortRequest = undefined;

  if (abortRequest._wasAlreadyErroring === true) {
    abortRequest._reject(storedError);
    WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream);
    return;
  }

  var promise = stream._writableStreamController.__abortSteps(abortRequest._reason);
  promise.then(function () {
    abortRequest._resolve();
    WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream);
  }, function (reason) {
    abortRequest._reject(reason);
    WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream);
  });
}

function WritableStreamFinishInFlightWrite(stream) {
  assert(stream._inFlightWriteRequest !== undefined);
  stream._inFlightWriteRequest._resolve(undefined);
  stream._inFlightWriteRequest = undefined;
}

function WritableStreamFinishInFlightWriteWithError(stream, error) {
  assert(stream._inFlightWriteRequest !== undefined);
  stream._inFlightWriteRequest._reject(error);
  stream._inFlightWriteRequest = undefined;

  assert(stream._state === 'writable' || stream._state === 'erroring');

  WritableStreamDealWithRejection(stream, error);
}

function WritableStreamFinishInFlightClose(stream) {
  assert(stream._inFlightCloseRequest !== undefined);
  stream._inFlightCloseRequest._resolve(undefined);
  stream._inFlightCloseRequest = undefined;

  var state = stream._state;

  assert(state === 'writable' || state === 'erroring');

  if (state === 'erroring') {
    // The error was too late to do anything, so it is ignored.
    stream._storedError = undefined;
    if (stream._pendingAbortRequest !== undefined) {
      stream._pendingAbortRequest._resolve();
      stream._pendingAbortRequest = undefined;
    }
  }

  stream._state = 'closed';

  var writer = stream._writer;
  if (writer !== undefined) {
    defaultWriterClosedPromiseResolve(writer);
  }

  assert(stream._pendingAbortRequest === undefined, 'stream._pendingAbortRequest === undefined');
  assert(stream._storedError === undefined, 'stream._storedError === undefined');
}

function WritableStreamFinishInFlightCloseWithError(stream, error) {
  assert(stream._inFlightCloseRequest !== undefined);
  stream._inFlightCloseRequest._reject(error);
  stream._inFlightCloseRequest = undefined;

  assert(stream._state === 'writable' || stream._state === 'erroring');

  // Never execute sink abort() after sink close().
  if (stream._pendingAbortRequest !== undefined) {
    stream._pendingAbortRequest._reject(error);
    stream._pendingAbortRequest = undefined;
  }
  WritableStreamDealWithRejection(stream, error);
}

// TODO(ricea): Fix alphabetical order.
function WritableStreamCloseQueuedOrInFlight(stream) {
  if (stream._closeRequest === undefined && stream._inFlightCloseRequest === undefined) {
    return false;
  }

  return true;
}

function WritableStreamHasOperationMarkedInFlight(stream) {
  if (stream._inFlightWriteRequest === undefined && stream._inFlightCloseRequest === undefined) {
    return false;
  }

  return true;
}

function WritableStreamMarkCloseRequestInFlight(stream) {
  assert(stream._inFlightCloseRequest === undefined);
  assert(stream._closeRequest !== undefined);
  stream._inFlightCloseRequest = stream._closeRequest;
  stream._closeRequest = undefined;
}

function WritableStreamMarkFirstWriteRequestInFlight(stream) {
  assert(stream._inFlightWriteRequest === undefined, 'there must be no pending write request');
  assert(stream._writeRequests.length !== 0, 'writeRequests must not be empty');
  stream._inFlightWriteRequest = stream._writeRequests.shift();
}

function WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream) {
  assert(stream._state === 'errored', '_stream_.[[state]] is `"errored"`');
  if (stream._closeRequest !== undefined) {
    assert(stream._inFlightCloseRequest === undefined);

    stream._closeRequest._reject(stream._storedError);
    stream._closeRequest = undefined;
  }
  var writer = stream._writer;
  if (writer !== undefined) {
    defaultWriterClosedPromiseReject(writer, stream._storedError);
    writer._closedPromise.catch(function () {});
  }
}

function WritableStreamUpdateBackpressure(stream, backpressure) {
  assert(stream._state === 'writable');
  assert(WritableStreamCloseQueuedOrInFlight(stream) === false);

  var writer = stream._writer;
  if (writer !== undefined && backpressure !== stream._backpressure) {
    if (backpressure === true) {
      defaultWriterReadyPromiseReset(writer);
    } else {
      assert(backpressure === false);

      defaultWriterReadyPromiseResolve(writer);
    }
  }

  stream._backpressure = backpressure;
}

var WritableStreamDefaultWriter = function () {
  function WritableStreamDefaultWriter(stream) {
    _classCallCheck(this, WritableStreamDefaultWriter);

    if (IsWritableStream(stream) === false) {
      throw new TypeError('WritableStreamDefaultWriter can only be constructed with a WritableStream instance');
    }
    if (IsWritableStreamLocked(stream) === true) {
      throw new TypeError('This stream has already been locked for exclusive writing by another writer');
    }

    this._ownerWritableStream = stream;
    stream._writer = this;

    var state = stream._state;

    if (state === 'writable') {
      if (WritableStreamCloseQueuedOrInFlight(stream) === false && stream._backpressure === true) {
        defaultWriterReadyPromiseInitialize(this);
      } else {
        defaultWriterReadyPromiseInitializeAsResolved(this);
      }

      defaultWriterClosedPromiseInitialize(this);
    } else if (state === 'erroring') {
      defaultWriterReadyPromiseInitializeAsRejected(this, stream._storedError);
      this._readyPromise.catch(function () {});
      defaultWriterClosedPromiseInitialize(this);
    } else if (state === 'closed') {
      defaultWriterReadyPromiseInitializeAsResolved(this);
      defaultWriterClosedPromiseInitializeAsResolved(this);
    } else {
      assert(state === 'errored', 'state must be errored');

      var storedError = stream._storedError;
      defaultWriterReadyPromiseInitializeAsRejected(this, storedError);
      this._readyPromise.catch(function () {});
      defaultWriterClosedPromiseInitializeAsRejected(this, storedError);
      this._closedPromise.catch(function () {});
    }
  }

  _createClass(WritableStreamDefaultWriter, [{
    key: 'abort',
    value: function abort(reason) {
      if (IsWritableStreamDefaultWriter(this) === false) {
        return Promise.reject(defaultWriterBrandCheckException('abort'));
      }

      if (this._ownerWritableStream === undefined) {
        return Promise.reject(defaultWriterLockException('abort'));
      }

      return WritableStreamDefaultWriterAbort(this, reason);
    }
  }, {
    key: 'close',
    value: function close() {
      if (IsWritableStreamDefaultWriter(this) === false) {
        return Promise.reject(defaultWriterBrandCheckException('close'));
      }

      var stream = this._ownerWritableStream;

      if (stream === undefined) {
        return Promise.reject(defaultWriterLockException('close'));
      }

      if (WritableStreamCloseQueuedOrInFlight(stream) === true) {
        return Promise.reject(new TypeError('cannot close an already-closing stream'));
      }

      return WritableStreamDefaultWriterClose(this);
    }
  }, {
    key: 'releaseLock',
    value: function releaseLock() {
      if (IsWritableStreamDefaultWriter(this) === false) {
        throw defaultWriterBrandCheckException('releaseLock');
      }

      var stream = this._ownerWritableStream;

      if (stream === undefined) {
        return;
      }

      assert(stream._writer !== undefined);

      WritableStreamDefaultWriterRelease(this);
    }
  }, {
    key: 'write',
    value: function write(chunk) {
      if (IsWritableStreamDefaultWriter(this) === false) {
        return Promise.reject(defaultWriterBrandCheckException('write'));
      }

      if (this._ownerWritableStream === undefined) {
        return Promise.reject(defaultWriterLockException('write to'));
      }

      return WritableStreamDefaultWriterWrite(this, chunk);
    }
  }, {
    key: 'closed',
    get: function get() {
      if (IsWritableStreamDefaultWriter(this) === false) {
        return Promise.reject(defaultWriterBrandCheckException('closed'));
      }

      return this._closedPromise;
    }
  }, {
    key: 'desiredSize',
    get: function get() {
      if (IsWritableStreamDefaultWriter(this) === false) {
        throw defaultWriterBrandCheckException('desiredSize');
      }

      if (this._ownerWritableStream === undefined) {
        throw defaultWriterLockException('desiredSize');
      }

      return WritableStreamDefaultWriterGetDesiredSize(this);
    }
  }, {
    key: 'ready',
    get: function get() {
      if (IsWritableStreamDefaultWriter(this) === false) {
        return Promise.reject(defaultWriterBrandCheckException('ready'));
      }

      return this._readyPromise;
    }
  }]);

  return WritableStreamDefaultWriter;
}();

// Abstract operations for the WritableStreamDefaultWriter.

function IsWritableStreamDefaultWriter(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_ownerWritableStream')) {
    return false;
  }

  return true;
}

// A client of WritableStreamDefaultWriter may use these functions directly to bypass state check.

function WritableStreamDefaultWriterAbort(writer, reason) {
  var stream = writer._ownerWritableStream;

  assert(stream !== undefined);

  return WritableStreamAbort(stream, reason);
}

function WritableStreamDefaultWriterClose(writer) {
  var stream = writer._ownerWritableStream;

  assert(stream !== undefined);

  var state = stream._state;
  if (state === 'closed' || state === 'errored') {
    return Promise.reject(new TypeError('The stream (in ' + state + ' state) is not in the writable state and cannot be closed'));
  }

  assert(state === 'writable' || state === 'erroring');
  assert(WritableStreamCloseQueuedOrInFlight(stream) === false);

  var promise = new Promise(function (resolve, reject) {
    var closeRequest = {
      _resolve: resolve,
      _reject: reject
    };

    stream._closeRequest = closeRequest;
  });

  if (stream._backpressure === true && state === 'writable') {
    defaultWriterReadyPromiseResolve(writer);
  }

  WritableStreamDefaultControllerClose(stream._writableStreamController);

  return promise;
}

function WritableStreamDefaultWriterCloseWithErrorPropagation(writer) {
  var stream = writer._ownerWritableStream;

  assert(stream !== undefined);

  var state = stream._state;
  if (WritableStreamCloseQueuedOrInFlight(stream) === true || state === 'closed') {
    return Promise.resolve();
  }

  if (state === 'errored') {
    return Promise.reject(stream._storedError);
  }

  assert(state === 'writable' || state === 'erroring');

  return WritableStreamDefaultWriterClose(writer);
}

function WritableStreamDefaultWriterEnsureClosedPromiseRejected(writer, error) {
  if (writer._closedPromiseState === 'pending') {
    defaultWriterClosedPromiseReject(writer, error);
  } else {
    defaultWriterClosedPromiseResetToRejected(writer, error);
  }
  writer._closedPromise.catch(function () {});
}

function WritableStreamDefaultWriterEnsureReadyPromiseRejected(writer, error) {
  if (writer._readyPromiseState === 'pending') {
    defaultWriterReadyPromiseReject(writer, error);
  } else {
    defaultWriterReadyPromiseResetToRejected(writer, error);
  }
  writer._readyPromise.catch(function () {});
}

function WritableStreamDefaultWriterGetDesiredSize(writer) {
  var stream = writer._ownerWritableStream;
  var state = stream._state;

  if (state === 'errored' || state === 'erroring') {
    return null;
  }

  if (state === 'closed') {
    return 0;
  }

  return WritableStreamDefaultControllerGetDesiredSize(stream._writableStreamController);
}

function WritableStreamDefaultWriterRelease(writer) {
  var stream = writer._ownerWritableStream;
  assert(stream !== undefined);
  assert(stream._writer === writer);

  var releasedError = new TypeError('Writer was released and can no longer be used to monitor the stream\'s closedness');

  WritableStreamDefaultWriterEnsureReadyPromiseRejected(writer, releasedError);

  // The state transitions to "errored" before the sink abort() method runs, but the writer.closed promise is not
  // rejected until afterwards. This means that simply testing state will not work.
  WritableStreamDefaultWriterEnsureClosedPromiseRejected(writer, releasedError);

  stream._writer = undefined;
  writer._ownerWritableStream = undefined;
}

function WritableStreamDefaultWriterWrite(writer, chunk) {
  var stream = writer._ownerWritableStream;

  assert(stream !== undefined);

  var controller = stream._writableStreamController;

  var chunkSize = WritableStreamDefaultControllerGetChunkSize(controller, chunk);

  if (stream !== writer._ownerWritableStream) {
    return Promise.reject(defaultWriterLockException('write to'));
  }

  var state = stream._state;
  if (state === 'errored') {
    return Promise.reject(stream._storedError);
  }
  if (WritableStreamCloseQueuedOrInFlight(stream) === true || state === 'closed') {
    return Promise.reject(new TypeError('The stream is closing or closed and cannot be written to'));
  }
  if (state === 'erroring') {
    return Promise.reject(stream._storedError);
  }

  assert(state === 'writable');

  var promise = WritableStreamAddWriteRequest(stream);

  WritableStreamDefaultControllerWrite(controller, chunk, chunkSize);

  return promise;
}

var WritableStreamDefaultController = function () {
  function WritableStreamDefaultController(stream, underlyingSink, size, highWaterMark) {
    _classCallCheck(this, WritableStreamDefaultController);

    if (IsWritableStream(stream) === false) {
      throw new TypeError('WritableStreamDefaultController can only be constructed with a WritableStream instance');
    }

    if (stream._writableStreamController !== undefined) {
      throw new TypeError('WritableStreamDefaultController instances can only be created by the WritableStream constructor');
    }

    this._controlledWritableStream = stream;

    this._underlyingSink = underlyingSink;

    // Need to set the slots so that the assert doesn't fire. In the spec the slots already exist implicitly.
    this._queue = undefined;
    this._queueTotalSize = undefined;
    ResetQueue(this);

    this._started = false;

    var normalizedStrategy = ValidateAndNormalizeQueuingStrategy(size, highWaterMark);
    this._strategySize = normalizedStrategy.size;
    this._strategyHWM = normalizedStrategy.highWaterMark;

    var backpressure = WritableStreamDefaultControllerGetBackpressure(this);
    WritableStreamUpdateBackpressure(stream, backpressure);
  }

  _createClass(WritableStreamDefaultController, [{
    key: 'error',
    value: function error(e) {
      if (IsWritableStreamDefaultController(this) === false) {
        throw new TypeError('WritableStreamDefaultController.prototype.error can only be used on a WritableStreamDefaultController');
      }
      var state = this._controlledWritableStream._state;
      if (state !== 'writable') {
        // The stream is closed, errored or will be soon. The sink can't do anything useful if it gets an error here, so
        // just treat it as a no-op.
        return;
      }

      WritableStreamDefaultControllerError(this, e);
    }
  }, {
    key: '__abortSteps',
    value: function __abortSteps(reason) {
      return PromiseInvokeOrNoop(this._underlyingSink, 'abort', [reason]);
    }
  }, {
    key: '__errorSteps',
    value: function __errorSteps() {
      ResetQueue(this);
    }
  }, {
    key: '__startSteps',
    value: function __startSteps() {
      var _this = this;

      var startResult = InvokeOrNoop(this._underlyingSink, 'start', [this]);
      var stream = this._controlledWritableStream;

      Promise.resolve(startResult).then(function () {
        assert(stream._state === 'writable' || stream._state === 'erroring');
        _this._started = true;
        WritableStreamDefaultControllerAdvanceQueueIfNeeded(_this);
      }, function (r) {
        assert(stream._state === 'writable' || stream._state === 'erroring');
        _this._started = true;
        WritableStreamDealWithRejection(stream, r);
      }).catch(rethrowAssertionErrorRejection);
    }
  }]);

  return WritableStreamDefaultController;
}();

// Abstract operations implementing interface required by the WritableStream.

function WritableStreamDefaultControllerClose(controller) {
  EnqueueValueWithSize(controller, 'close', 0);
  WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
}

function WritableStreamDefaultControllerGetChunkSize(controller, chunk) {
  var strategySize = controller._strategySize;

  if (strategySize === undefined) {
    return 1;
  }

  try {
    return strategySize(chunk);
  } catch (chunkSizeE) {
    WritableStreamDefaultControllerErrorIfNeeded(controller, chunkSizeE);
    return 1;
  }
}

function WritableStreamDefaultControllerGetDesiredSize(controller) {
  return controller._strategyHWM - controller._queueTotalSize;
}

function WritableStreamDefaultControllerWrite(controller, chunk, chunkSize) {
  var writeRecord = { chunk: chunk };

  try {
    EnqueueValueWithSize(controller, writeRecord, chunkSize);
  } catch (enqueueE) {
    WritableStreamDefaultControllerErrorIfNeeded(controller, enqueueE);
    return;
  }

  var stream = controller._controlledWritableStream;
  if (WritableStreamCloseQueuedOrInFlight(stream) === false && stream._state === 'writable') {
    var backpressure = WritableStreamDefaultControllerGetBackpressure(controller);
    WritableStreamUpdateBackpressure(stream, backpressure);
  }

  WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
}

// Abstract operations for the WritableStreamDefaultController.

function IsWritableStreamDefaultController(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_underlyingSink')) {
    return false;
  }

  return true;
}

function WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller) {
  var stream = controller._controlledWritableStream;

  if (controller._started === false) {
    return;
  }

  if (stream._inFlightWriteRequest !== undefined) {
    return;
  }

  var state = stream._state;
  if (state === 'closed' || state === 'errored') {
    return;
  }
  if (state === 'erroring') {
    WritableStreamFinishErroring(stream);
    return;
  }

  if (controller._queue.length === 0) {
    return;
  }

  var writeRecord = PeekQueueValue(controller);
  if (writeRecord === 'close') {
    WritableStreamDefaultControllerProcessClose(controller);
  } else {
    WritableStreamDefaultControllerProcessWrite(controller, writeRecord.chunk);
  }
}

function WritableStreamDefaultControllerErrorIfNeeded(controller, error) {
  if (controller._controlledWritableStream._state === 'writable') {
    WritableStreamDefaultControllerError(controller, error);
  }
}

function WritableStreamDefaultControllerProcessClose(controller) {
  var stream = controller._controlledWritableStream;

  WritableStreamMarkCloseRequestInFlight(stream);

  DequeueValue(controller);
  assert(controller._queue.length === 0, 'queue must be empty once the final write record is dequeued');

  var sinkClosePromise = PromiseInvokeOrNoop(controller._underlyingSink, 'close', []);
  sinkClosePromise.then(function () {
    WritableStreamFinishInFlightClose(stream);
  }, function (reason) {
    WritableStreamFinishInFlightCloseWithError(stream, reason);
  }).catch(rethrowAssertionErrorRejection);
}

function WritableStreamDefaultControllerProcessWrite(controller, chunk) {
  var stream = controller._controlledWritableStream;

  WritableStreamMarkFirstWriteRequestInFlight(stream);

  var sinkWritePromise = PromiseInvokeOrNoop(controller._underlyingSink, 'write', [chunk, controller]);
  sinkWritePromise.then(function () {
    WritableStreamFinishInFlightWrite(stream);

    var state = stream._state;
    assert(state === 'writable' || state === 'erroring');

    DequeueValue(controller);

    if (WritableStreamCloseQueuedOrInFlight(stream) === false && state === 'writable') {
      var backpressure = WritableStreamDefaultControllerGetBackpressure(controller);
      WritableStreamUpdateBackpressure(stream, backpressure);
    }

    WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
  }, function (reason) {
    WritableStreamFinishInFlightWriteWithError(stream, reason);
  }).catch(rethrowAssertionErrorRejection);
}

function WritableStreamDefaultControllerGetBackpressure(controller) {
  var desiredSize = WritableStreamDefaultControllerGetDesiredSize(controller);
  return desiredSize <= 0;
}

// A client of WritableStreamDefaultController may use these functions directly to bypass state check.

function WritableStreamDefaultControllerError(controller, error) {
  var stream = controller._controlledWritableStream;

  assert(stream._state === 'writable');

  WritableStreamStartErroring(stream, error);
}

// Helper functions for the WritableStream.

function streamBrandCheckException(name) {
  return new TypeError('WritableStream.prototype.' + name + ' can only be used on a WritableStream');
}

// Helper functions for the WritableStreamDefaultWriter.

function defaultWriterBrandCheckException(name) {
  return new TypeError('WritableStreamDefaultWriter.prototype.' + name + ' can only be used on a WritableStreamDefaultWriter');
}

function defaultWriterLockException(name) {
  return new TypeError('Cannot ' + name + ' a stream using a released writer');
}

function defaultWriterClosedPromiseInitialize(writer) {
  writer._closedPromise = new Promise(function (resolve, reject) {
    writer._closedPromise_resolve = resolve;
    writer._closedPromise_reject = reject;
    writer._closedPromiseState = 'pending';
  });
}

function defaultWriterClosedPromiseInitializeAsRejected(writer, reason) {
  writer._closedPromise = Promise.reject(reason);
  writer._closedPromise_resolve = undefined;
  writer._closedPromise_reject = undefined;
  writer._closedPromiseState = 'rejected';
}

function defaultWriterClosedPromiseInitializeAsResolved(writer) {
  writer._closedPromise = Promise.resolve(undefined);
  writer._closedPromise_resolve = undefined;
  writer._closedPromise_reject = undefined;
  writer._closedPromiseState = 'resolved';
}

function defaultWriterClosedPromiseReject(writer, reason) {
  assert(writer._closedPromise_resolve !== undefined, 'writer._closedPromise_resolve !== undefined');
  assert(writer._closedPromise_reject !== undefined, 'writer._closedPromise_reject !== undefined');
  assert(writer._closedPromiseState === 'pending', 'writer._closedPromiseState is pending');

  writer._closedPromise_reject(reason);
  writer._closedPromise_resolve = undefined;
  writer._closedPromise_reject = undefined;
  writer._closedPromiseState = 'rejected';
}

function defaultWriterClosedPromiseResetToRejected(writer, reason) {
  assert(writer._closedPromise_resolve === undefined, 'writer._closedPromise_resolve === undefined');
  assert(writer._closedPromise_reject === undefined, 'writer._closedPromise_reject === undefined');
  assert(writer._closedPromiseState !== 'pending', 'writer._closedPromiseState is not pending');

  writer._closedPromise = Promise.reject(reason);
  writer._closedPromiseState = 'rejected';
}

function defaultWriterClosedPromiseResolve(writer) {
  assert(writer._closedPromise_resolve !== undefined, 'writer._closedPromise_resolve !== undefined');
  assert(writer._closedPromise_reject !== undefined, 'writer._closedPromise_reject !== undefined');
  assert(writer._closedPromiseState === 'pending', 'writer._closedPromiseState is pending');

  writer._closedPromise_resolve(undefined);
  writer._closedPromise_resolve = undefined;
  writer._closedPromise_reject = undefined;
  writer._closedPromiseState = 'resolved';
}

function defaultWriterReadyPromiseInitialize(writer) {
  writer._readyPromise = new Promise(function (resolve, reject) {
    writer._readyPromise_resolve = resolve;
    writer._readyPromise_reject = reject;
  });
  writer._readyPromiseState = 'pending';
}

function defaultWriterReadyPromiseInitializeAsRejected(writer, reason) {
  writer._readyPromise = Promise.reject(reason);
  writer._readyPromise_resolve = undefined;
  writer._readyPromise_reject = undefined;
  writer._readyPromiseState = 'rejected';
}

function defaultWriterReadyPromiseInitializeAsResolved(writer) {
  writer._readyPromise = Promise.resolve(undefined);
  writer._readyPromise_resolve = undefined;
  writer._readyPromise_reject = undefined;
  writer._readyPromiseState = 'fulfilled';
}

function defaultWriterReadyPromiseReject(writer, reason) {
  assert(writer._readyPromise_resolve !== undefined, 'writer._readyPromise_resolve !== undefined');
  assert(writer._readyPromise_reject !== undefined, 'writer._readyPromise_reject !== undefined');

  writer._readyPromise_reject(reason);
  writer._readyPromise_resolve = undefined;
  writer._readyPromise_reject = undefined;
  writer._readyPromiseState = 'rejected';
}

function defaultWriterReadyPromiseReset(writer) {
  assert(writer._readyPromise_resolve === undefined, 'writer._readyPromise_resolve === undefined');
  assert(writer._readyPromise_reject === undefined, 'writer._readyPromise_reject === undefined');

  writer._readyPromise = new Promise(function (resolve, reject) {
    writer._readyPromise_resolve = resolve;
    writer._readyPromise_reject = reject;
  });
  writer._readyPromiseState = 'pending';
}

function defaultWriterReadyPromiseResetToRejected(writer, reason) {
  assert(writer._readyPromise_resolve === undefined, 'writer._readyPromise_resolve === undefined');
  assert(writer._readyPromise_reject === undefined, 'writer._readyPromise_reject === undefined');

  writer._readyPromise = Promise.reject(reason);
  writer._readyPromiseState = 'rejected';
}

function defaultWriterReadyPromiseResolve(writer) {
  assert(writer._readyPromise_resolve !== undefined, 'writer._readyPromise_resolve !== undefined');
  assert(writer._readyPromise_reject !== undefined, 'writer._readyPromise_reject !== undefined');

  writer._readyPromise_resolve(undefined);
  writer._readyPromise_resolve = undefined;
  writer._readyPromise_reject = undefined;
  writer._readyPromiseState = 'fulfilled';
}

/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _require = __webpack_require__(0),
    IsFiniteNonNegativeNumber = _require.IsFiniteNonNegativeNumber;

var _require2 = __webpack_require__(1),
    assert = _require2.assert;

exports.DequeueValue = function (container) {
  assert('_queue' in container && '_queueTotalSize' in container, 'Spec-level failure: DequeueValue should only be used on containers with [[queue]] and [[queueTotalSize]].');
  assert(container._queue.length > 0, 'Spec-level failure: should never dequeue from an empty queue.');

  var pair = container._queue.shift();
  container._queueTotalSize -= pair.size;
  if (container._queueTotalSize < 0) {
    container._queueTotalSize = 0;
  }

  return pair.value;
};

exports.EnqueueValueWithSize = function (container, value, size) {
  assert('_queue' in container && '_queueTotalSize' in container, 'Spec-level failure: EnqueueValueWithSize should only be used on containers with [[queue]] and ' + '[[queueTotalSize]].');

  size = Number(size);
  if (!IsFiniteNonNegativeNumber(size)) {
    throw new RangeError('Size must be a finite, non-NaN, non-negative number.');
  }

  container._queue.push({ value: value, size: size });
  container._queueTotalSize += size;
};

exports.PeekQueueValue = function (container) {
  assert('_queue' in container && '_queueTotalSize' in container, 'Spec-level failure: PeekQueueValue should only be used on containers with [[queue]] and [[queueTotalSize]].');
  assert(container._queue.length > 0, 'Spec-level failure: should never peek at an empty queue.');

  var pair = container._queue[0];
  return pair.value;
};

exports.ResetQueue = function (container) {
  assert('_queue' in container && '_queueTotalSize' in container, 'Spec-level failure: ResetQueue should only be used on containers with [[queue]] and [[queueTotalSize]].');

  container._queue = [];
  container._queueTotalSize = 0;
};

/***/ }),
/* 4 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _require = __webpack_require__(0),
    ArrayBufferCopy = _require.ArrayBufferCopy,
    CreateIterResultObject = _require.CreateIterResultObject,
    IsFiniteNonNegativeNumber = _require.IsFiniteNonNegativeNumber,
    InvokeOrNoop = _require.InvokeOrNoop,
    PromiseInvokeOrNoop = _require.PromiseInvokeOrNoop,
    TransferArrayBuffer = _require.TransferArrayBuffer,
    ValidateAndNormalizeQueuingStrategy = _require.ValidateAndNormalizeQueuingStrategy,
    ValidateAndNormalizeHighWaterMark = _require.ValidateAndNormalizeHighWaterMark;

var _require2 = __webpack_require__(0),
    createArrayFromList = _require2.createArrayFromList,
    createDataProperty = _require2.createDataProperty,
    typeIsObject = _require2.typeIsObject;

var _require3 = __webpack_require__(1),
    assert = _require3.assert,
    rethrowAssertionErrorRejection = _require3.rethrowAssertionErrorRejection;

var _require4 = __webpack_require__(3),
    DequeueValue = _require4.DequeueValue,
    EnqueueValueWithSize = _require4.EnqueueValueWithSize,
    ResetQueue = _require4.ResetQueue;

var _require5 = __webpack_require__(2),
    AcquireWritableStreamDefaultWriter = _require5.AcquireWritableStreamDefaultWriter,
    IsWritableStream = _require5.IsWritableStream,
    IsWritableStreamLocked = _require5.IsWritableStreamLocked,
    WritableStreamAbort = _require5.WritableStreamAbort,
    WritableStreamDefaultWriterCloseWithErrorPropagation = _require5.WritableStreamDefaultWriterCloseWithErrorPropagation,
    WritableStreamDefaultWriterRelease = _require5.WritableStreamDefaultWriterRelease,
    WritableStreamDefaultWriterWrite = _require5.WritableStreamDefaultWriterWrite,
    WritableStreamCloseQueuedOrInFlight = _require5.WritableStreamCloseQueuedOrInFlight;

var ReadableStream = function () {
  function ReadableStream() {
    var underlyingSource = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
        size = _ref.size,
        highWaterMark = _ref.highWaterMark;

    _classCallCheck(this, ReadableStream);

    // Exposed to controllers.
    this._state = 'readable';

    this._reader = undefined;
    this._storedError = undefined;

    this._disturbed = false;

    // Initialize to undefined first because the constructor of the controller checks this
    // variable to validate the caller.
    this._readableStreamController = undefined;
    var type = underlyingSource.type;
    var typeString = String(type);
    if (typeString === 'bytes') {
      if (highWaterMark === undefined) {
        highWaterMark = 0;
      }
      this._readableStreamController = new ReadableByteStreamController(this, underlyingSource, highWaterMark);
    } else if (type === undefined) {
      if (highWaterMark === undefined) {
        highWaterMark = 1;
      }
      this._readableStreamController = new ReadableStreamDefaultController(this, underlyingSource, size, highWaterMark);
    } else {
      throw new RangeError('Invalid type is specified');
    }
  }

  _createClass(ReadableStream, [{
    key: 'cancel',
    value: function cancel(reason) {
      if (IsReadableStream(this) === false) {
        return Promise.reject(streamBrandCheckException('cancel'));
      }

      if (IsReadableStreamLocked(this) === true) {
        return Promise.reject(new TypeError('Cannot cancel a stream that already has a reader'));
      }

      return ReadableStreamCancel(this, reason);
    }
  }, {
    key: 'getReader',
    value: function getReader() {
      var _ref2 = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
          mode = _ref2.mode;

      if (IsReadableStream(this) === false) {
        throw streamBrandCheckException('getReader');
      }

      if (mode === undefined) {
        return AcquireReadableStreamDefaultReader(this);
      }

      mode = String(mode);

      if (mode === 'byob') {
        return AcquireReadableStreamBYOBReader(this);
      }

      throw new RangeError('Invalid mode is specified');
    }
  }, {
    key: 'pipeThrough',
    value: function pipeThrough(_ref3, options) {
      var writable = _ref3.writable,
          readable = _ref3.readable;

      var promise = this.pipeTo(writable, options);

      ifIsObjectAndHasAPromiseIsHandledInternalSlotSetPromiseIsHandledToTrue(promise);

      return readable;
    }
  }, {
    key: 'pipeTo',
    value: function pipeTo(dest) {
      var _this = this;

      var _ref4 = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
          preventClose = _ref4.preventClose,
          preventAbort = _ref4.preventAbort,
          preventCancel = _ref4.preventCancel;

      if (IsReadableStream(this) === false) {
        return Promise.reject(streamBrandCheckException('pipeTo'));
      }
      if (IsWritableStream(dest) === false) {
        return Promise.reject(new TypeError('ReadableStream.prototype.pipeTo\'s first argument must be a WritableStream'));
      }

      preventClose = Boolean(preventClose);
      preventAbort = Boolean(preventAbort);
      preventCancel = Boolean(preventCancel);

      if (IsReadableStreamLocked(this) === true) {
        return Promise.reject(new TypeError('ReadableStream.prototype.pipeTo cannot be used on a locked ReadableStream'));
      }
      if (IsWritableStreamLocked(dest) === true) {
        return Promise.reject(new TypeError('ReadableStream.prototype.pipeTo cannot be used on a locked WritableStream'));
      }

      var reader = AcquireReadableStreamDefaultReader(this);
      var writer = AcquireWritableStreamDefaultWriter(dest);

      var shuttingDown = false;

      // This is used to keep track of the spec's requirement that we wait for ongoing writes during shutdown.
      var currentWrite = Promise.resolve();

      return new Promise(function (resolve, reject) {
        // Using reader and writer, read all chunks from this and write them to dest
        // - Backpressure must be enforced
        // - Shutdown must stop all activity
        function pipeLoop() {
          currentWrite = Promise.resolve();

          if (shuttingDown === true) {
            return Promise.resolve();
          }

          return writer._readyPromise.then(function () {
            return ReadableStreamDefaultReaderRead(reader).then(function (_ref5) {
              var value = _ref5.value,
                  done = _ref5.done;

              if (done === true) {
                return;
              }

              currentWrite = WritableStreamDefaultWriterWrite(writer, value).catch(function () {});
            });
          }).then(pipeLoop);
        }

        // Errors must be propagated forward
        isOrBecomesErrored(_this, reader._closedPromise, function (storedError) {
          if (preventAbort === false) {
            shutdownWithAction(function () {
              return WritableStreamAbort(dest, storedError);
            }, true, storedError);
          } else {
            shutdown(true, storedError);
          }
        });

        // Errors must be propagated backward
        isOrBecomesErrored(dest, writer._closedPromise, function (storedError) {
          if (preventCancel === false) {
            shutdownWithAction(function () {
              return ReadableStreamCancel(_this, storedError);
            }, true, storedError);
          } else {
            shutdown(true, storedError);
          }
        });

        // Closing must be propagated forward
        isOrBecomesClosed(_this, reader._closedPromise, function () {
          if (preventClose === false) {
            shutdownWithAction(function () {
              return WritableStreamDefaultWriterCloseWithErrorPropagation(writer);
            });
          } else {
            shutdown();
          }
        });

        // Closing must be propagated backward
        if (WritableStreamCloseQueuedOrInFlight(dest) === true || dest._state === 'closed') {
          var destClosed = new TypeError('the destination writable stream closed before all data could be piped to it');

          if (preventCancel === false) {
            shutdownWithAction(function () {
              return ReadableStreamCancel(_this, destClosed);
            }, true, destClosed);
          } else {
            shutdown(true, destClosed);
          }
        }

        pipeLoop().catch(function (err) {
          currentWrite = Promise.resolve();
          rethrowAssertionErrorRejection(err);
        });

        function waitForWritesToFinish() {
          // Another write may have started while we were waiting on this currentWrite, so we have to be sure to wait
          // for that too.
          var oldCurrentWrite = currentWrite;
          return currentWrite.then(function () {
            return oldCurrentWrite !== currentWrite ? waitForWritesToFinish() : undefined;
          });
        }

        function isOrBecomesErrored(stream, promise, action) {
          if (stream._state === 'errored') {
            action(stream._storedError);
          } else {
            promise.catch(action).catch(rethrowAssertionErrorRejection);
          }
        }

        function isOrBecomesClosed(stream, promise, action) {
          if (stream._state === 'closed') {
            action();
          } else {
            promise.then(action).catch(rethrowAssertionErrorRejection);
          }
        }

        function shutdownWithAction(action, originalIsError, originalError) {
          if (shuttingDown === true) {
            return;
          }
          shuttingDown = true;

          if (dest._state === 'writable' && WritableStreamCloseQueuedOrInFlight(dest) === false) {
            waitForWritesToFinish().then(doTheRest);
          } else {
            doTheRest();
          }

          function doTheRest() {
            action().then(function () {
              return finalize(originalIsError, originalError);
            }, function (newError) {
              return finalize(true, newError);
            }).catch(rethrowAssertionErrorRejection);
          }
        }

        function shutdown(isError, error) {
          if (shuttingDown === true) {
            return;
          }
          shuttingDown = true;

          if (dest._state === 'writable' && WritableStreamCloseQueuedOrInFlight(dest) === false) {
            waitForWritesToFinish().then(function () {
              return finalize(isError, error);
            }).catch(rethrowAssertionErrorRejection);
          } else {
            finalize(isError, error);
          }
        }

        function finalize(isError, error) {
          WritableStreamDefaultWriterRelease(writer);
          ReadableStreamReaderGenericRelease(reader);

          if (isError) {
            reject(error);
          } else {
            resolve(undefined);
          }
        }
      });
    }
  }, {
    key: 'tee',
    value: function tee() {
      if (IsReadableStream(this) === false) {
        throw streamBrandCheckException('tee');
      }

      var branches = ReadableStreamTee(this, false);
      return createArrayFromList(branches);
    }
  }, {
    key: 'locked',
    get: function get() {
      if (IsReadableStream(this) === false) {
        throw streamBrandCheckException('locked');
      }

      return IsReadableStreamLocked(this);
    }
  }]);

  return ReadableStream;
}();

module.exports = {
  ReadableStream: ReadableStream,
  IsReadableStreamDisturbed: IsReadableStreamDisturbed,
  ReadableStreamDefaultControllerClose: ReadableStreamDefaultControllerClose,
  ReadableStreamDefaultControllerEnqueue: ReadableStreamDefaultControllerEnqueue,
  ReadableStreamDefaultControllerError: ReadableStreamDefaultControllerError,
  ReadableStreamDefaultControllerGetDesiredSize: ReadableStreamDefaultControllerGetDesiredSize
};

// Abstract operations for the ReadableStream.

function AcquireReadableStreamBYOBReader(stream) {
  return new ReadableStreamBYOBReader(stream);
}

function AcquireReadableStreamDefaultReader(stream) {
  return new ReadableStreamDefaultReader(stream);
}

function IsReadableStream(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_readableStreamController')) {
    return false;
  }

  return true;
}

function IsReadableStreamDisturbed(stream) {
  assert(IsReadableStream(stream) === true, 'IsReadableStreamDisturbed should only be used on known readable streams');

  return stream._disturbed;
}

function IsReadableStreamLocked(stream) {
  assert(IsReadableStream(stream) === true, 'IsReadableStreamLocked should only be used on known readable streams');

  if (stream._reader === undefined) {
    return false;
  }

  return true;
}

function ReadableStreamTee(stream, cloneForBranch2) {
  assert(IsReadableStream(stream) === true);
  assert(typeof cloneForBranch2 === 'boolean');

  var reader = AcquireReadableStreamDefaultReader(stream);

  var teeState = {
    closedOrErrored: false,
    canceled1: false,
    canceled2: false,
    reason1: undefined,
    reason2: undefined
  };
  teeState.promise = new Promise(function (resolve) {
    teeState._resolve = resolve;
  });

  var pull = create_ReadableStreamTeePullFunction();
  pull._reader = reader;
  pull._teeState = teeState;
  pull._cloneForBranch2 = cloneForBranch2;

  var cancel1 = create_ReadableStreamTeeBranch1CancelFunction();
  cancel1._stream = stream;
  cancel1._teeState = teeState;

  var cancel2 = create_ReadableStreamTeeBranch2CancelFunction();
  cancel2._stream = stream;
  cancel2._teeState = teeState;

  var underlyingSource1 = Object.create(Object.prototype);
  createDataProperty(underlyingSource1, 'pull', pull);
  createDataProperty(underlyingSource1, 'cancel', cancel1);
  var branch1Stream = new ReadableStream(underlyingSource1);

  var underlyingSource2 = Object.create(Object.prototype);
  createDataProperty(underlyingSource2, 'pull', pull);
  createDataProperty(underlyingSource2, 'cancel', cancel2);
  var branch2Stream = new ReadableStream(underlyingSource2);

  pull._branch1 = branch1Stream._readableStreamController;
  pull._branch2 = branch2Stream._readableStreamController;

  reader._closedPromise.catch(function (r) {
    if (teeState.closedOrErrored === true) {
      return;
    }

    ReadableStreamDefaultControllerError(pull._branch1, r);
    ReadableStreamDefaultControllerError(pull._branch2, r);
    teeState.closedOrErrored = true;
  });

  return [branch1Stream, branch2Stream];
}

function create_ReadableStreamTeePullFunction() {
  function f() {
    var reader = f._reader,
        branch1 = f._branch1,
        branch2 = f._branch2,
        teeState = f._teeState;


    return ReadableStreamDefaultReaderRead(reader).then(function (result) {
      assert(typeIsObject(result));
      var value = result.value;
      var done = result.done;
      assert(typeof done === 'boolean');

      if (done === true && teeState.closedOrErrored === false) {
        if (teeState.canceled1 === false) {
          ReadableStreamDefaultControllerClose(branch1);
        }
        if (teeState.canceled2 === false) {
          ReadableStreamDefaultControllerClose(branch2);
        }
        teeState.closedOrErrored = true;
      }

      if (teeState.closedOrErrored === true) {
        return;
      }

      var value1 = value;
      var value2 = value;

      // There is no way to access the cloning code right now in the reference implementation.
      // If we add one then we'll need an implementation for serializable objects.
      // if (teeState.canceled2 === false && cloneForBranch2 === true) {
      //   value2 = StructuredDeserialize(StructuredSerialize(value2));
      // }

      if (teeState.canceled1 === false) {
        ReadableStreamDefaultControllerEnqueue(branch1, value1);
      }

      if (teeState.canceled2 === false) {
        ReadableStreamDefaultControllerEnqueue(branch2, value2);
      }
    });
  }
  return f;
}

function create_ReadableStreamTeeBranch1CancelFunction() {
  function f(reason) {
    var stream = f._stream,
        teeState = f._teeState;


    teeState.canceled1 = true;
    teeState.reason1 = reason;
    if (teeState.canceled2 === true) {
      var compositeReason = createArrayFromList([teeState.reason1, teeState.reason2]);
      var cancelResult = ReadableStreamCancel(stream, compositeReason);
      teeState._resolve(cancelResult);
    }
    return teeState.promise;
  }
  return f;
}

function create_ReadableStreamTeeBranch2CancelFunction() {
  function f(reason) {
    var stream = f._stream,
        teeState = f._teeState;


    teeState.canceled2 = true;
    teeState.reason2 = reason;
    if (teeState.canceled1 === true) {
      var compositeReason = createArrayFromList([teeState.reason1, teeState.reason2]);
      var cancelResult = ReadableStreamCancel(stream, compositeReason);
      teeState._resolve(cancelResult);
    }
    return teeState.promise;
  }
  return f;
}

// ReadableStream API exposed for controllers.

function ReadableStreamAddReadIntoRequest(stream) {
  assert(IsReadableStreamBYOBReader(stream._reader) === true);
  assert(stream._state === 'readable' || stream._state === 'closed');

  var promise = new Promise(function (resolve, reject) {
    var readIntoRequest = {
      _resolve: resolve,
      _reject: reject
    };

    stream._reader._readIntoRequests.push(readIntoRequest);
  });

  return promise;
}

function ReadableStreamAddReadRequest(stream) {
  assert(IsReadableStreamDefaultReader(stream._reader) === true);
  assert(stream._state === 'readable');

  var promise = new Promise(function (resolve, reject) {
    var readRequest = {
      _resolve: resolve,
      _reject: reject
    };

    stream._reader._readRequests.push(readRequest);
  });

  return promise;
}

function ReadableStreamCancel(stream, reason) {
  stream._disturbed = true;

  if (stream._state === 'closed') {
    return Promise.resolve(undefined);
  }
  if (stream._state === 'errored') {
    return Promise.reject(stream._storedError);
  }

  ReadableStreamClose(stream);

  var sourceCancelPromise = stream._readableStreamController.__cancelSteps(reason);
  return sourceCancelPromise.then(function () {
    return undefined;
  });
}

function ReadableStreamClose(stream) {
  assert(stream._state === 'readable');

  stream._state = 'closed';

  var reader = stream._reader;

  if (reader === undefined) {
    return undefined;
  }

  if (IsReadableStreamDefaultReader(reader) === true) {
    for (var i = 0; i < reader._readRequests.length; i++) {
      var _resolve = reader._readRequests[i]._resolve;

      _resolve(CreateIterResultObject(undefined, true));
    }
    reader._readRequests = [];
  }

  defaultReaderClosedPromiseResolve(reader);

  return undefined;
}

function ReadableStreamError(stream, e) {
  assert(IsReadableStream(stream) === true, 'stream must be ReadableStream');
  assert(stream._state === 'readable', 'state must be readable');

  stream._state = 'errored';
  stream._storedError = e;

  var reader = stream._reader;

  if (reader === undefined) {
    return undefined;
  }

  if (IsReadableStreamDefaultReader(reader) === true) {
    for (var i = 0; i < reader._readRequests.length; i++) {
      var readRequest = reader._readRequests[i];
      readRequest._reject(e);
    }

    reader._readRequests = [];
  } else {
    assert(IsReadableStreamBYOBReader(reader), 'reader must be ReadableStreamBYOBReader');

    for (var _i = 0; _i < reader._readIntoRequests.length; _i++) {
      var readIntoRequest = reader._readIntoRequests[_i];
      readIntoRequest._reject(e);
    }

    reader._readIntoRequests = [];
  }

  defaultReaderClosedPromiseReject(reader, e);
  reader._closedPromise.catch(function () {});
}

function ReadableStreamFulfillReadIntoRequest(stream, chunk, done) {
  var reader = stream._reader;

  assert(reader._readIntoRequests.length > 0);

  var readIntoRequest = reader._readIntoRequests.shift();
  readIntoRequest._resolve(CreateIterResultObject(chunk, done));
}

function ReadableStreamFulfillReadRequest(stream, chunk, done) {
  var reader = stream._reader;

  assert(reader._readRequests.length > 0);

  var readRequest = reader._readRequests.shift();
  readRequest._resolve(CreateIterResultObject(chunk, done));
}

function ReadableStreamGetNumReadIntoRequests(stream) {
  return stream._reader._readIntoRequests.length;
}

function ReadableStreamGetNumReadRequests(stream) {
  return stream._reader._readRequests.length;
}

function ReadableStreamHasBYOBReader(stream) {
  var reader = stream._reader;

  if (reader === undefined) {
    return false;
  }

  if (IsReadableStreamBYOBReader(reader) === false) {
    return false;
  }

  return true;
}

function ReadableStreamHasDefaultReader(stream) {
  var reader = stream._reader;

  if (reader === undefined) {
    return false;
  }

  if (IsReadableStreamDefaultReader(reader) === false) {
    return false;
  }

  return true;
}

// Readers

var ReadableStreamDefaultReader = function () {
  function ReadableStreamDefaultReader(stream) {
    _classCallCheck(this, ReadableStreamDefaultReader);

    if (IsReadableStream(stream) === false) {
      throw new TypeError('ReadableStreamDefaultReader can only be constructed with a ReadableStream instance');
    }
    if (IsReadableStreamLocked(stream) === true) {
      throw new TypeError('This stream has already been locked for exclusive reading by another reader');
    }

    ReadableStreamReaderGenericInitialize(this, stream);

    this._readRequests = [];
  }

  _createClass(ReadableStreamDefaultReader, [{
    key: 'cancel',
    value: function cancel(reason) {
      if (IsReadableStreamDefaultReader(this) === false) {
        return Promise.reject(defaultReaderBrandCheckException('cancel'));
      }

      if (this._ownerReadableStream === undefined) {
        return Promise.reject(readerLockException('cancel'));
      }

      return ReadableStreamReaderGenericCancel(this, reason);
    }
  }, {
    key: 'read',
    value: function read() {
      if (IsReadableStreamDefaultReader(this) === false) {
        return Promise.reject(defaultReaderBrandCheckException('read'));
      }

      if (this._ownerReadableStream === undefined) {
        return Promise.reject(readerLockException('read from'));
      }

      return ReadableStreamDefaultReaderRead(this);
    }
  }, {
    key: 'releaseLock',
    value: function releaseLock() {
      if (IsReadableStreamDefaultReader(this) === false) {
        throw defaultReaderBrandCheckException('releaseLock');
      }

      if (this._ownerReadableStream === undefined) {
        return;
      }

      if (this._readRequests.length > 0) {
        throw new TypeError('Tried to release a reader lock when that reader has pending read() calls un-settled');
      }

      ReadableStreamReaderGenericRelease(this);
    }
  }, {
    key: 'closed',
    get: function get() {
      if (IsReadableStreamDefaultReader(this) === false) {
        return Promise.reject(defaultReaderBrandCheckException('closed'));
      }

      return this._closedPromise;
    }
  }]);

  return ReadableStreamDefaultReader;
}();

var ReadableStreamBYOBReader = function () {
  function ReadableStreamBYOBReader(stream) {
    _classCallCheck(this, ReadableStreamBYOBReader);

    if (!IsReadableStream(stream)) {
      throw new TypeError('ReadableStreamBYOBReader can only be constructed with a ReadableStream instance given a ' + 'byte source');
    }
    if (IsReadableByteStreamController(stream._readableStreamController) === false) {
      throw new TypeError('Cannot construct a ReadableStreamBYOBReader for a stream not constructed with a byte ' + 'source');
    }
    if (IsReadableStreamLocked(stream)) {
      throw new TypeError('This stream has already been locked for exclusive reading by another reader');
    }

    ReadableStreamReaderGenericInitialize(this, stream);

    this._readIntoRequests = [];
  }

  _createClass(ReadableStreamBYOBReader, [{
    key: 'cancel',
    value: function cancel(reason) {
      if (!IsReadableStreamBYOBReader(this)) {
        return Promise.reject(byobReaderBrandCheckException('cancel'));
      }

      if (this._ownerReadableStream === undefined) {
        return Promise.reject(readerLockException('cancel'));
      }

      return ReadableStreamReaderGenericCancel(this, reason);
    }
  }, {
    key: 'read',
    value: function read(view) {
      if (!IsReadableStreamBYOBReader(this)) {
        return Promise.reject(byobReaderBrandCheckException('read'));
      }

      if (this._ownerReadableStream === undefined) {
        return Promise.reject(readerLockException('read from'));
      }

      if (!ArrayBuffer.isView(view)) {
        return Promise.reject(new TypeError('view must be an array buffer view'));
      }

      if (view.byteLength === 0) {
        return Promise.reject(new TypeError('view must have non-zero byteLength'));
      }

      return ReadableStreamBYOBReaderRead(this, view);
    }
  }, {
    key: 'releaseLock',
    value: function releaseLock() {
      if (!IsReadableStreamBYOBReader(this)) {
        throw byobReaderBrandCheckException('releaseLock');
      }

      if (this._ownerReadableStream === undefined) {
        return;
      }

      if (this._readIntoRequests.length > 0) {
        throw new TypeError('Tried to release a reader lock when that reader has pending read() calls un-settled');
      }

      ReadableStreamReaderGenericRelease(this);
    }
  }, {
    key: 'closed',
    get: function get() {
      if (!IsReadableStreamBYOBReader(this)) {
        return Promise.reject(byobReaderBrandCheckException('closed'));
      }

      return this._closedPromise;
    }
  }]);

  return ReadableStreamBYOBReader;
}();

// Abstract operations for the readers.

function IsReadableStreamBYOBReader(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_readIntoRequests')) {
    return false;
  }

  return true;
}

function IsReadableStreamDefaultReader(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_readRequests')) {
    return false;
  }

  return true;
}

function ReadableStreamReaderGenericInitialize(reader, stream) {
  reader._ownerReadableStream = stream;
  stream._reader = reader;

  if (stream._state === 'readable') {
    defaultReaderClosedPromiseInitialize(reader);
  } else if (stream._state === 'closed') {
    defaultReaderClosedPromiseInitializeAsResolved(reader);
  } else {
    assert(stream._state === 'errored', 'state must be errored');

    defaultReaderClosedPromiseInitializeAsRejected(reader, stream._storedError);
    reader._closedPromise.catch(function () {});
  }
}

// A client of ReadableStreamDefaultReader and ReadableStreamBYOBReader may use these functions directly to bypass state
// check.

function ReadableStreamReaderGenericCancel(reader, reason) {
  var stream = reader._ownerReadableStream;
  assert(stream !== undefined);
  return ReadableStreamCancel(stream, reason);
}

function ReadableStreamReaderGenericRelease(reader) {
  assert(reader._ownerReadableStream !== undefined);
  assert(reader._ownerReadableStream._reader === reader);

  if (reader._ownerReadableStream._state === 'readable') {
    defaultReaderClosedPromiseReject(reader, new TypeError('Reader was released and can no longer be used to monitor the stream\'s closedness'));
  } else {
    defaultReaderClosedPromiseResetToRejected(reader, new TypeError('Reader was released and can no longer be used to monitor the stream\'s closedness'));
  }
  reader._closedPromise.catch(function () {});

  reader._ownerReadableStream._reader = undefined;
  reader._ownerReadableStream = undefined;
}

function ReadableStreamBYOBReaderRead(reader, view) {
  var stream = reader._ownerReadableStream;

  assert(stream !== undefined);

  stream._disturbed = true;

  if (stream._state === 'errored') {
    return Promise.reject(stream._storedError);
  }

  // Controllers must implement this.
  return ReadableByteStreamControllerPullInto(stream._readableStreamController, view);
}

function ReadableStreamDefaultReaderRead(reader) {
  var stream = reader._ownerReadableStream;

  assert(stream !== undefined);

  stream._disturbed = true;

  if (stream._state === 'closed') {
    return Promise.resolve(CreateIterResultObject(undefined, true));
  }

  if (stream._state === 'errored') {
    return Promise.reject(stream._storedError);
  }

  assert(stream._state === 'readable');

  return stream._readableStreamController.__pullSteps();
}

// Controllers

var ReadableStreamDefaultController = function () {
  function ReadableStreamDefaultController(stream, underlyingSource, size, highWaterMark) {
    _classCallCheck(this, ReadableStreamDefaultController);

    if (IsReadableStream(stream) === false) {
      throw new TypeError('ReadableStreamDefaultController can only be constructed with a ReadableStream instance');
    }

    if (stream._readableStreamController !== undefined) {
      throw new TypeError('ReadableStreamDefaultController instances can only be created by the ReadableStream constructor');
    }

    this._controlledReadableStream = stream;

    this._underlyingSource = underlyingSource;

    // Need to set the slots so that the assert doesn't fire. In the spec the slots already exist implicitly.
    this._queue = undefined;
    this._queueTotalSize = undefined;
    ResetQueue(this);

    this._started = false;
    this._closeRequested = false;
    this._pullAgain = false;
    this._pulling = false;

    var normalizedStrategy = ValidateAndNormalizeQueuingStrategy(size, highWaterMark);
    this._strategySize = normalizedStrategy.size;
    this._strategyHWM = normalizedStrategy.highWaterMark;

    var controller = this;

    var startResult = InvokeOrNoop(underlyingSource, 'start', [this]);
    Promise.resolve(startResult).then(function () {
      controller._started = true;

      assert(controller._pulling === false);
      assert(controller._pullAgain === false);

      ReadableStreamDefaultControllerCallPullIfNeeded(controller);
    }, function (r) {
      ReadableStreamDefaultControllerErrorIfNeeded(controller, r);
    }).catch(rethrowAssertionErrorRejection);
  }

  _createClass(ReadableStreamDefaultController, [{
    key: 'close',
    value: function close() {
      if (IsReadableStreamDefaultController(this) === false) {
        throw defaultControllerBrandCheckException('close');
      }

      if (this._closeRequested === true) {
        throw new TypeError('The stream has already been closed; do not close it again!');
      }

      var state = this._controlledReadableStream._state;
      if (state !== 'readable') {
        throw new TypeError('The stream (in ' + state + ' state) is not in the readable state and cannot be closed');
      }

      ReadableStreamDefaultControllerClose(this);
    }
  }, {
    key: 'enqueue',
    value: function enqueue(chunk) {
      if (IsReadableStreamDefaultController(this) === false) {
        throw defaultControllerBrandCheckException('enqueue');
      }

      if (this._closeRequested === true) {
        throw new TypeError('stream is closed or draining');
      }

      var state = this._controlledReadableStream._state;
      if (state !== 'readable') {
        throw new TypeError('The stream (in ' + state + ' state) is not in the readable state and cannot be enqueued to');
      }

      return ReadableStreamDefaultControllerEnqueue(this, chunk);
    }
  }, {
    key: 'error',
    value: function error(e) {
      if (IsReadableStreamDefaultController(this) === false) {
        throw defaultControllerBrandCheckException('error');
      }

      var stream = this._controlledReadableStream;
      if (stream._state !== 'readable') {
        throw new TypeError('The stream is ' + stream._state + ' and so cannot be errored');
      }

      ReadableStreamDefaultControllerError(this, e);
    }
  }, {
    key: '__cancelSteps',
    value: function __cancelSteps(reason) {
      ResetQueue(this);
      return PromiseInvokeOrNoop(this._underlyingSource, 'cancel', [reason]);
    }
  }, {
    key: '__pullSteps',
    value: function __pullSteps() {
      var stream = this._controlledReadableStream;

      if (this._queue.length > 0) {
        var chunk = DequeueValue(this);

        if (this._closeRequested === true && this._queue.length === 0) {
          ReadableStreamClose(stream);
        } else {
          ReadableStreamDefaultControllerCallPullIfNeeded(this);
        }

        return Promise.resolve(CreateIterResultObject(chunk, false));
      }

      var pendingPromise = ReadableStreamAddReadRequest(stream);
      ReadableStreamDefaultControllerCallPullIfNeeded(this);
      return pendingPromise;
    }
  }, {
    key: 'desiredSize',
    get: function get() {
      if (IsReadableStreamDefaultController(this) === false) {
        throw defaultControllerBrandCheckException('desiredSize');
      }

      return ReadableStreamDefaultControllerGetDesiredSize(this);
    }
  }]);

  return ReadableStreamDefaultController;
}();

// Abstract operations for the ReadableStreamDefaultController.

function IsReadableStreamDefaultController(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_underlyingSource')) {
    return false;
  }

  return true;
}

function ReadableStreamDefaultControllerCallPullIfNeeded(controller) {
  var shouldPull = ReadableStreamDefaultControllerShouldCallPull(controller);
  if (shouldPull === false) {
    return undefined;
  }

  if (controller._pulling === true) {
    controller._pullAgain = true;
    return undefined;
  }

  assert(controller._pullAgain === false);

  controller._pulling = true;

  var pullPromise = PromiseInvokeOrNoop(controller._underlyingSource, 'pull', [controller]);
  pullPromise.then(function () {
    controller._pulling = false;

    if (controller._pullAgain === true) {
      controller._pullAgain = false;
      return ReadableStreamDefaultControllerCallPullIfNeeded(controller);
    }
    return undefined;
  }, function (e) {
    ReadableStreamDefaultControllerErrorIfNeeded(controller, e);
  }).catch(rethrowAssertionErrorRejection);

  return undefined;
}

function ReadableStreamDefaultControllerShouldCallPull(controller) {
  var stream = controller._controlledReadableStream;

  if (stream._state === 'closed' || stream._state === 'errored') {
    return false;
  }

  if (controller._closeRequested === true) {
    return false;
  }

  if (controller._started === false) {
    return false;
  }

  if (IsReadableStreamLocked(stream) === true && ReadableStreamGetNumReadRequests(stream) > 0) {
    return true;
  }

  var desiredSize = ReadableStreamDefaultControllerGetDesiredSize(controller);
  if (desiredSize > 0) {
    return true;
  }

  return false;
}

// A client of ReadableStreamDefaultController may use these functions directly to bypass state check.

function ReadableStreamDefaultControllerClose(controller) {
  var stream = controller._controlledReadableStream;

  assert(controller._closeRequested === false);
  assert(stream._state === 'readable');

  controller._closeRequested = true;

  if (controller._queue.length === 0) {
    ReadableStreamClose(stream);
  }
}

function ReadableStreamDefaultControllerEnqueue(controller, chunk) {
  var stream = controller._controlledReadableStream;

  assert(controller._closeRequested === false);
  assert(stream._state === 'readable');

  if (IsReadableStreamLocked(stream) === true && ReadableStreamGetNumReadRequests(stream) > 0) {
    ReadableStreamFulfillReadRequest(stream, chunk, false);
  } else {
    var chunkSize = 1;

    if (controller._strategySize !== undefined) {
      var strategySize = controller._strategySize;
      try {
        chunkSize = strategySize(chunk);
      } catch (chunkSizeE) {
        ReadableStreamDefaultControllerErrorIfNeeded(controller, chunkSizeE);
        throw chunkSizeE;
      }
    }

    try {
      EnqueueValueWithSize(controller, chunk, chunkSize);
    } catch (enqueueE) {
      ReadableStreamDefaultControllerErrorIfNeeded(controller, enqueueE);
      throw enqueueE;
    }
  }

  ReadableStreamDefaultControllerCallPullIfNeeded(controller);

  return undefined;
}

function ReadableStreamDefaultControllerError(controller, e) {
  var stream = controller._controlledReadableStream;

  assert(stream._state === 'readable');

  ResetQueue(controller);

  ReadableStreamError(stream, e);
}

function ReadableStreamDefaultControllerErrorIfNeeded(controller, e) {
  if (controller._controlledReadableStream._state === 'readable') {
    ReadableStreamDefaultControllerError(controller, e);
  }
}

function ReadableStreamDefaultControllerGetDesiredSize(controller) {
  var stream = controller._controlledReadableStream;
  var state = stream._state;

  if (state === 'errored') {
    return null;
  }
  if (state === 'closed') {
    return 0;
  }

  return controller._strategyHWM - controller._queueTotalSize;
}

var ReadableStreamBYOBRequest = function () {
  function ReadableStreamBYOBRequest(controller, view) {
    _classCallCheck(this, ReadableStreamBYOBRequest);

    this._associatedReadableByteStreamController = controller;
    this._view = view;
  }

  _createClass(ReadableStreamBYOBRequest, [{
    key: 'respond',
    value: function respond(bytesWritten) {
      if (IsReadableStreamBYOBRequest(this) === false) {
        throw byobRequestBrandCheckException('respond');
      }

      if (this._associatedReadableByteStreamController === undefined) {
        throw new TypeError('This BYOB request has been invalidated');
      }

      ReadableByteStreamControllerRespond(this._associatedReadableByteStreamController, bytesWritten);
    }
  }, {
    key: 'respondWithNewView',
    value: function respondWithNewView(view) {
      if (IsReadableStreamBYOBRequest(this) === false) {
        throw byobRequestBrandCheckException('respond');
      }

      if (this._associatedReadableByteStreamController === undefined) {
        throw new TypeError('This BYOB request has been invalidated');
      }

      if (!ArrayBuffer.isView(view)) {
        throw new TypeError('You can only respond with array buffer views');
      }

      ReadableByteStreamControllerRespondWithNewView(this._associatedReadableByteStreamController, view);
    }
  }, {
    key: 'view',
    get: function get() {
      return this._view;
    }
  }]);

  return ReadableStreamBYOBRequest;
}();

var ReadableByteStreamController = function () {
  function ReadableByteStreamController(stream, underlyingByteSource, highWaterMark) {
    _classCallCheck(this, ReadableByteStreamController);

    if (IsReadableStream(stream) === false) {
      throw new TypeError('ReadableByteStreamController can only be constructed with a ReadableStream instance given ' + 'a byte source');
    }

    if (stream._readableStreamController !== undefined) {
      throw new TypeError('ReadableByteStreamController instances can only be created by the ReadableStream constructor given a byte ' + 'source');
    }

    this._controlledReadableStream = stream;

    this._underlyingByteSource = underlyingByteSource;

    this._pullAgain = false;
    this._pulling = false;

    ReadableByteStreamControllerClearPendingPullIntos(this);

    // Need to set the slots so that the assert doesn't fire. In the spec the slots already exist implicitly.
    this._queue = this._queueTotalSize = undefined;
    ResetQueue(this);

    this._closeRequested = false;
    this._started = false;

    this._strategyHWM = ValidateAndNormalizeHighWaterMark(highWaterMark);

    var autoAllocateChunkSize = underlyingByteSource.autoAllocateChunkSize;
    if (autoAllocateChunkSize !== undefined) {
      if (Number.isInteger(autoAllocateChunkSize) === false || autoAllocateChunkSize <= 0) {
        throw new RangeError('autoAllocateChunkSize must be a positive integer');
      }
    }
    this._autoAllocateChunkSize = autoAllocateChunkSize;

    this._pendingPullIntos = [];

    var controller = this;

    var startResult = InvokeOrNoop(underlyingByteSource, 'start', [this]);
    Promise.resolve(startResult).then(function () {
      controller._started = true;

      assert(controller._pulling === false);
      assert(controller._pullAgain === false);

      ReadableByteStreamControllerCallPullIfNeeded(controller);
    }, function (r) {
      if (stream._state === 'readable') {
        ReadableByteStreamControllerError(controller, r);
      }
    }).catch(rethrowAssertionErrorRejection);
  }

  _createClass(ReadableByteStreamController, [{
    key: 'close',
    value: function close() {
      if (IsReadableByteStreamController(this) === false) {
        throw byteStreamControllerBrandCheckException('close');
      }

      if (this._closeRequested === true) {
        throw new TypeError('The stream has already been closed; do not close it again!');
      }

      var state = this._controlledReadableStream._state;
      if (state !== 'readable') {
        throw new TypeError('The stream (in ' + state + ' state) is not in the readable state and cannot be closed');
      }

      ReadableByteStreamControllerClose(this);
    }
  }, {
    key: 'enqueue',
    value: function enqueue(chunk) {
      if (IsReadableByteStreamController(this) === false) {
        throw byteStreamControllerBrandCheckException('enqueue');
      }

      if (this._closeRequested === true) {
        throw new TypeError('stream is closed or draining');
      }

      var state = this._controlledReadableStream._state;
      if (state !== 'readable') {
        throw new TypeError('The stream (in ' + state + ' state) is not in the readable state and cannot be enqueued to');
      }

      if (!ArrayBuffer.isView(chunk)) {
        throw new TypeError('You can only enqueue array buffer views when using a ReadableByteStreamController');
      }

      ReadableByteStreamControllerEnqueue(this, chunk);
    }
  }, {
    key: 'error',
    value: function error(e) {
      if (IsReadableByteStreamController(this) === false) {
        throw byteStreamControllerBrandCheckException('error');
      }

      var stream = this._controlledReadableStream;
      if (stream._state !== 'readable') {
        throw new TypeError('The stream is ' + stream._state + ' and so cannot be errored');
      }

      ReadableByteStreamControllerError(this, e);
    }
  }, {
    key: '__cancelSteps',
    value: function __cancelSteps(reason) {
      if (this._pendingPullIntos.length > 0) {
        var firstDescriptor = this._pendingPullIntos[0];
        firstDescriptor.bytesFilled = 0;
      }

      ResetQueue(this);

      return PromiseInvokeOrNoop(this._underlyingByteSource, 'cancel', [reason]);
    }
  }, {
    key: '__pullSteps',
    value: function __pullSteps() {
      var stream = this._controlledReadableStream;
      assert(ReadableStreamHasDefaultReader(stream) === true);

      if (this._queueTotalSize > 0) {
        assert(ReadableStreamGetNumReadRequests(stream) === 0);

        var entry = this._queue.shift();
        this._queueTotalSize -= entry.byteLength;

        ReadableByteStreamControllerHandleQueueDrain(this);

        var view = void 0;
        try {
          view = new Uint8Array(entry.buffer, entry.byteOffset, entry.byteLength);
        } catch (viewE) {
          return Promise.reject(viewE);
        }

        return Promise.resolve(CreateIterResultObject(view, false));
      }

      var autoAllocateChunkSize = this._autoAllocateChunkSize;
      if (autoAllocateChunkSize !== undefined) {
        var buffer = void 0;
        try {
          buffer = new ArrayBuffer(autoAllocateChunkSize);
        } catch (bufferE) {
          return Promise.reject(bufferE);
        }

        var pullIntoDescriptor = {
          buffer: buffer,
          byteOffset: 0,
          byteLength: autoAllocateChunkSize,
          bytesFilled: 0,
          elementSize: 1,
          ctor: Uint8Array,
          readerType: 'default'
        };

        this._pendingPullIntos.push(pullIntoDescriptor);
      }

      var promise = ReadableStreamAddReadRequest(stream);

      ReadableByteStreamControllerCallPullIfNeeded(this);

      return promise;
    }
  }, {
    key: 'byobRequest',
    get: function get() {
      if (IsReadableByteStreamController(this) === false) {
        throw byteStreamControllerBrandCheckException('byobRequest');
      }

      if (this._byobRequest === undefined && this._pendingPullIntos.length > 0) {
        var firstDescriptor = this._pendingPullIntos[0];
        var view = new Uint8Array(firstDescriptor.buffer, firstDescriptor.byteOffset + firstDescriptor.bytesFilled, firstDescriptor.byteLength - firstDescriptor.bytesFilled);

        this._byobRequest = new ReadableStreamBYOBRequest(this, view);
      }

      return this._byobRequest;
    }
  }, {
    key: 'desiredSize',
    get: function get() {
      if (IsReadableByteStreamController(this) === false) {
        throw byteStreamControllerBrandCheckException('desiredSize');
      }

      return ReadableByteStreamControllerGetDesiredSize(this);
    }
  }]);

  return ReadableByteStreamController;
}();

// Abstract operations for the ReadableByteStreamController.

function IsReadableByteStreamController(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_underlyingByteSource')) {
    return false;
  }

  return true;
}

function IsReadableStreamBYOBRequest(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_associatedReadableByteStreamController')) {
    return false;
  }

  return true;
}

function ReadableByteStreamControllerCallPullIfNeeded(controller) {
  var shouldPull = ReadableByteStreamControllerShouldCallPull(controller);
  if (shouldPull === false) {
    return undefined;
  }

  if (controller._pulling === true) {
    controller._pullAgain = true;
    return undefined;
  }

  assert(controller._pullAgain === false);

  controller._pulling = true;

  // TODO: Test controller argument
  var pullPromise = PromiseInvokeOrNoop(controller._underlyingByteSource, 'pull', [controller]);
  pullPromise.then(function () {
    controller._pulling = false;

    if (controller._pullAgain === true) {
      controller._pullAgain = false;
      ReadableByteStreamControllerCallPullIfNeeded(controller);
    }
  }, function (e) {
    if (controller._controlledReadableStream._state === 'readable') {
      ReadableByteStreamControllerError(controller, e);
    }
  }).catch(rethrowAssertionErrorRejection);

  return undefined;
}

function ReadableByteStreamControllerClearPendingPullIntos(controller) {
  ReadableByteStreamControllerInvalidateBYOBRequest(controller);
  controller._pendingPullIntos = [];
}

function ReadableByteStreamControllerCommitPullIntoDescriptor(stream, pullIntoDescriptor) {
  assert(stream._state !== 'errored', 'state must not be errored');

  var done = false;
  if (stream._state === 'closed') {
    assert(pullIntoDescriptor.bytesFilled === 0);
    done = true;
  }

  var filledView = ReadableByteStreamControllerConvertPullIntoDescriptor(pullIntoDescriptor);
  if (pullIntoDescriptor.readerType === 'default') {
    ReadableStreamFulfillReadRequest(stream, filledView, done);
  } else {
    assert(pullIntoDescriptor.readerType === 'byob');
    ReadableStreamFulfillReadIntoRequest(stream, filledView, done);
  }
}

function ReadableByteStreamControllerConvertPullIntoDescriptor(pullIntoDescriptor) {
  var bytesFilled = pullIntoDescriptor.bytesFilled;
  var elementSize = pullIntoDescriptor.elementSize;

  assert(bytesFilled <= pullIntoDescriptor.byteLength);
  assert(bytesFilled % elementSize === 0);

  return new pullIntoDescriptor.ctor(pullIntoDescriptor.buffer, pullIntoDescriptor.byteOffset, bytesFilled / elementSize);
}

function ReadableByteStreamControllerEnqueueChunkToQueue(controller, buffer, byteOffset, byteLength) {
  controller._queue.push({ buffer: buffer, byteOffset: byteOffset, byteLength: byteLength });
  controller._queueTotalSize += byteLength;
}

function ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor) {
  var elementSize = pullIntoDescriptor.elementSize;

  var currentAlignedBytes = pullIntoDescriptor.bytesFilled - pullIntoDescriptor.bytesFilled % elementSize;

  var maxBytesToCopy = Math.min(controller._queueTotalSize, pullIntoDescriptor.byteLength - pullIntoDescriptor.bytesFilled);
  var maxBytesFilled = pullIntoDescriptor.bytesFilled + maxBytesToCopy;
  var maxAlignedBytes = maxBytesFilled - maxBytesFilled % elementSize;

  var totalBytesToCopyRemaining = maxBytesToCopy;
  var ready = false;
  if (maxAlignedBytes > currentAlignedBytes) {
    totalBytesToCopyRemaining = maxAlignedBytes - pullIntoDescriptor.bytesFilled;
    ready = true;
  }

  var queue = controller._queue;

  while (totalBytesToCopyRemaining > 0) {
    var headOfQueue = queue[0];

    var bytesToCopy = Math.min(totalBytesToCopyRemaining, headOfQueue.byteLength);

    var destStart = pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled;
    ArrayBufferCopy(pullIntoDescriptor.buffer, destStart, headOfQueue.buffer, headOfQueue.byteOffset, bytesToCopy);

    if (headOfQueue.byteLength === bytesToCopy) {
      queue.shift();
    } else {
      headOfQueue.byteOffset += bytesToCopy;
      headOfQueue.byteLength -= bytesToCopy;
    }
    controller._queueTotalSize -= bytesToCopy;

    ReadableByteStreamControllerFillHeadPullIntoDescriptor(controller, bytesToCopy, pullIntoDescriptor);

    totalBytesToCopyRemaining -= bytesToCopy;
  }

  if (ready === false) {
    assert(controller._queueTotalSize === 0, 'queue must be empty');
    assert(pullIntoDescriptor.bytesFilled > 0);
    assert(pullIntoDescriptor.bytesFilled < pullIntoDescriptor.elementSize);
  }

  return ready;
}

function ReadableByteStreamControllerFillHeadPullIntoDescriptor(controller, size, pullIntoDescriptor) {
  assert(controller._pendingPullIntos.length === 0 || controller._pendingPullIntos[0] === pullIntoDescriptor);

  ReadableByteStreamControllerInvalidateBYOBRequest(controller);
  pullIntoDescriptor.bytesFilled += size;
}

function ReadableByteStreamControllerHandleQueueDrain(controller) {
  assert(controller._controlledReadableStream._state === 'readable');

  if (controller._queueTotalSize === 0 && controller._closeRequested === true) {
    ReadableStreamClose(controller._controlledReadableStream);
  } else {
    ReadableByteStreamControllerCallPullIfNeeded(controller);
  }
}

function ReadableByteStreamControllerInvalidateBYOBRequest(controller) {
  if (controller._byobRequest === undefined) {
    return;
  }

  controller._byobRequest._associatedReadableByteStreamController = undefined;
  controller._byobRequest._view = undefined;
  controller._byobRequest = undefined;
}

function ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller) {
  assert(controller._closeRequested === false);

  while (controller._pendingPullIntos.length > 0) {
    if (controller._queueTotalSize === 0) {
      return;
    }

    var pullIntoDescriptor = controller._pendingPullIntos[0];

    if (ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor) === true) {
      ReadableByteStreamControllerShiftPendingPullInto(controller);

      ReadableByteStreamControllerCommitPullIntoDescriptor(controller._controlledReadableStream, pullIntoDescriptor);
    }
  }
}

function ReadableByteStreamControllerPullInto(controller, view) {
  var stream = controller._controlledReadableStream;

  var elementSize = 1;
  if (view.constructor !== DataView) {
    elementSize = view.constructor.BYTES_PER_ELEMENT;
  }

  var ctor = view.constructor;

  var pullIntoDescriptor = {
    buffer: view.buffer,
    byteOffset: view.byteOffset,
    byteLength: view.byteLength,
    bytesFilled: 0,
    elementSize: elementSize,
    ctor: ctor,
    readerType: 'byob'
  };

  if (controller._pendingPullIntos.length > 0) {
    pullIntoDescriptor.buffer = TransferArrayBuffer(pullIntoDescriptor.buffer);
    controller._pendingPullIntos.push(pullIntoDescriptor);

    // No ReadableByteStreamControllerCallPullIfNeeded() call since:
    // - No change happens on desiredSize
    // - The source has already been notified of that there's at least 1 pending read(view)

    return ReadableStreamAddReadIntoRequest(stream);
  }

  if (stream._state === 'closed') {
    var emptyView = new view.constructor(pullIntoDescriptor.buffer, pullIntoDescriptor.byteOffset, 0);
    return Promise.resolve(CreateIterResultObject(emptyView, true));
  }

  if (controller._queueTotalSize > 0) {
    if (ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor) === true) {
      var filledView = ReadableByteStreamControllerConvertPullIntoDescriptor(pullIntoDescriptor);

      ReadableByteStreamControllerHandleQueueDrain(controller);

      return Promise.resolve(CreateIterResultObject(filledView, false));
    }

    if (controller._closeRequested === true) {
      var e = new TypeError('Insufficient bytes to fill elements in the given buffer');
      ReadableByteStreamControllerError(controller, e);

      return Promise.reject(e);
    }
  }

  pullIntoDescriptor.buffer = TransferArrayBuffer(pullIntoDescriptor.buffer);
  controller._pendingPullIntos.push(pullIntoDescriptor);

  var promise = ReadableStreamAddReadIntoRequest(stream);

  ReadableByteStreamControllerCallPullIfNeeded(controller);

  return promise;
}

function ReadableByteStreamControllerRespondInClosedState(controller, firstDescriptor) {
  firstDescriptor.buffer = TransferArrayBuffer(firstDescriptor.buffer);

  assert(firstDescriptor.bytesFilled === 0, 'bytesFilled must be 0');

  var stream = controller._controlledReadableStream;
  if (ReadableStreamHasBYOBReader(stream) === true) {
    while (ReadableStreamGetNumReadIntoRequests(stream) > 0) {
      var pullIntoDescriptor = ReadableByteStreamControllerShiftPendingPullInto(controller);
      ReadableByteStreamControllerCommitPullIntoDescriptor(stream, pullIntoDescriptor);
    }
  }
}

function ReadableByteStreamControllerRespondInReadableState(controller, bytesWritten, pullIntoDescriptor) {
  if (pullIntoDescriptor.bytesFilled + bytesWritten > pullIntoDescriptor.byteLength) {
    throw new RangeError('bytesWritten out of range');
  }

  ReadableByteStreamControllerFillHeadPullIntoDescriptor(controller, bytesWritten, pullIntoDescriptor);

  if (pullIntoDescriptor.bytesFilled < pullIntoDescriptor.elementSize) {
    // TODO: Figure out whether we should detach the buffer or not here.
    return;
  }

  ReadableByteStreamControllerShiftPendingPullInto(controller);

  var remainderSize = pullIntoDescriptor.bytesFilled % pullIntoDescriptor.elementSize;
  if (remainderSize > 0) {
    var end = pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled;
    var remainder = pullIntoDescriptor.buffer.slice(end - remainderSize, end);
    ReadableByteStreamControllerEnqueueChunkToQueue(controller, remainder, 0, remainder.byteLength);
  }

  pullIntoDescriptor.buffer = TransferArrayBuffer(pullIntoDescriptor.buffer);
  pullIntoDescriptor.bytesFilled -= remainderSize;
  ReadableByteStreamControllerCommitPullIntoDescriptor(controller._controlledReadableStream, pullIntoDescriptor);

  ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller);
}

function ReadableByteStreamControllerRespondInternal(controller, bytesWritten) {
  var firstDescriptor = controller._pendingPullIntos[0];

  var stream = controller._controlledReadableStream;

  if (stream._state === 'closed') {
    if (bytesWritten !== 0) {
      throw new TypeError('bytesWritten must be 0 when calling respond() on a closed stream');
    }

    ReadableByteStreamControllerRespondInClosedState(controller, firstDescriptor);
  } else {
    assert(stream._state === 'readable');

    ReadableByteStreamControllerRespondInReadableState(controller, bytesWritten, firstDescriptor);
  }
}

function ReadableByteStreamControllerShiftPendingPullInto(controller) {
  var descriptor = controller._pendingPullIntos.shift();
  ReadableByteStreamControllerInvalidateBYOBRequest(controller);
  return descriptor;
}

function ReadableByteStreamControllerShouldCallPull(controller) {
  var stream = controller._controlledReadableStream;

  if (stream._state !== 'readable') {
    return false;
  }

  if (controller._closeRequested === true) {
    return false;
  }

  if (controller._started === false) {
    return false;
  }

  if (ReadableStreamHasDefaultReader(stream) === true && ReadableStreamGetNumReadRequests(stream) > 0) {
    return true;
  }

  if (ReadableStreamHasBYOBReader(stream) === true && ReadableStreamGetNumReadIntoRequests(stream) > 0) {
    return true;
  }

  if (ReadableByteStreamControllerGetDesiredSize(controller) > 0) {
    return true;
  }

  return false;
}

// A client of ReadableByteStreamController may use these functions directly to bypass state check.

function ReadableByteStreamControllerClose(controller) {
  var stream = controller._controlledReadableStream;

  assert(controller._closeRequested === false);
  assert(stream._state === 'readable');

  if (controller._queueTotalSize > 0) {
    controller._closeRequested = true;

    return;
  }

  if (controller._pendingPullIntos.length > 0) {
    var firstPendingPullInto = controller._pendingPullIntos[0];
    if (firstPendingPullInto.bytesFilled > 0) {
      var e = new TypeError('Insufficient bytes to fill elements in the given buffer');
      ReadableByteStreamControllerError(controller, e);

      throw e;
    }
  }

  ReadableStreamClose(stream);
}

function ReadableByteStreamControllerEnqueue(controller, chunk) {
  var stream = controller._controlledReadableStream;

  assert(controller._closeRequested === false);
  assert(stream._state === 'readable');

  var buffer = chunk.buffer;
  var byteOffset = chunk.byteOffset;
  var byteLength = chunk.byteLength;
  var transferredBuffer = TransferArrayBuffer(buffer);

  if (ReadableStreamHasDefaultReader(stream) === true) {
    if (ReadableStreamGetNumReadRequests(stream) === 0) {
      ReadableByteStreamControllerEnqueueChunkToQueue(controller, transferredBuffer, byteOffset, byteLength);
    } else {
      assert(controller._queue.length === 0);

      var transferredView = new Uint8Array(transferredBuffer, byteOffset, byteLength);
      ReadableStreamFulfillReadRequest(stream, transferredView, false);
    }
  } else if (ReadableStreamHasBYOBReader(stream) === true) {
    // TODO: Ideally in this branch detaching should happen only if the buffer is not consumed fully.
    ReadableByteStreamControllerEnqueueChunkToQueue(controller, transferredBuffer, byteOffset, byteLength);
    ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller);
  } else {
    assert(IsReadableStreamLocked(stream) === false, 'stream must not be locked');
    ReadableByteStreamControllerEnqueueChunkToQueue(controller, transferredBuffer, byteOffset, byteLength);
  }
}

function ReadableByteStreamControllerError(controller, e) {
  var stream = controller._controlledReadableStream;

  assert(stream._state === 'readable');

  ReadableByteStreamControllerClearPendingPullIntos(controller);

  ResetQueue(controller);
  ReadableStreamError(stream, e);
}

function ReadableByteStreamControllerGetDesiredSize(controller) {
  var stream = controller._controlledReadableStream;
  var state = stream._state;

  if (state === 'errored') {
    return null;
  }
  if (state === 'closed') {
    return 0;
  }

  return controller._strategyHWM - controller._queueTotalSize;
}

function ReadableByteStreamControllerRespond(controller, bytesWritten) {
  bytesWritten = Number(bytesWritten);
  if (IsFiniteNonNegativeNumber(bytesWritten) === false) {
    throw new RangeError('bytesWritten must be a finite');
  }

  assert(controller._pendingPullIntos.length > 0);

  ReadableByteStreamControllerRespondInternal(controller, bytesWritten);
}

function ReadableByteStreamControllerRespondWithNewView(controller, view) {
  assert(controller._pendingPullIntos.length > 0);

  var firstDescriptor = controller._pendingPullIntos[0];

  if (firstDescriptor.byteOffset + firstDescriptor.bytesFilled !== view.byteOffset) {
    throw new RangeError('The region specified by view does not match byobRequest');
  }
  if (firstDescriptor.byteLength !== view.byteLength) {
    throw new RangeError('The buffer of view has different capacity than byobRequest');
  }

  firstDescriptor.buffer = view.buffer;

  ReadableByteStreamControllerRespondInternal(controller, view.byteLength);
}

// Helper functions for the ReadableStream.

function streamBrandCheckException(name) {
  return new TypeError('ReadableStream.prototype.' + name + ' can only be used on a ReadableStream');
}

// Helper functions for the readers.

function readerLockException(name) {
  return new TypeError('Cannot ' + name + ' a stream using a released reader');
}

// Helper functions for the ReadableStreamDefaultReader.

function defaultReaderBrandCheckException(name) {
  return new TypeError('ReadableStreamDefaultReader.prototype.' + name + ' can only be used on a ReadableStreamDefaultReader');
}

function defaultReaderClosedPromiseInitialize(reader) {
  reader._closedPromise = new Promise(function (resolve, reject) {
    reader._closedPromise_resolve = resolve;
    reader._closedPromise_reject = reject;
  });
}

function defaultReaderClosedPromiseInitializeAsRejected(reader, reason) {
  reader._closedPromise = Promise.reject(reason);
  reader._closedPromise_resolve = undefined;
  reader._closedPromise_reject = undefined;
}

function defaultReaderClosedPromiseInitializeAsResolved(reader) {
  reader._closedPromise = Promise.resolve(undefined);
  reader._closedPromise_resolve = undefined;
  reader._closedPromise_reject = undefined;
}

function defaultReaderClosedPromiseReject(reader, reason) {
  assert(reader._closedPromise_resolve !== undefined);
  assert(reader._closedPromise_reject !== undefined);

  reader._closedPromise_reject(reason);
  reader._closedPromise_resolve = undefined;
  reader._closedPromise_reject = undefined;
}

function defaultReaderClosedPromiseResetToRejected(reader, reason) {
  assert(reader._closedPromise_resolve === undefined);
  assert(reader._closedPromise_reject === undefined);

  reader._closedPromise = Promise.reject(reason);
}

function defaultReaderClosedPromiseResolve(reader) {
  assert(reader._closedPromise_resolve !== undefined);
  assert(reader._closedPromise_reject !== undefined);

  reader._closedPromise_resolve(undefined);
  reader._closedPromise_resolve = undefined;
  reader._closedPromise_reject = undefined;
}

// Helper functions for the ReadableStreamDefaultReader.

function byobReaderBrandCheckException(name) {
  return new TypeError('ReadableStreamBYOBReader.prototype.' + name + ' can only be used on a ReadableStreamBYOBReader');
}

// Helper functions for the ReadableStreamDefaultController.

function defaultControllerBrandCheckException(name) {
  return new TypeError('ReadableStreamDefaultController.prototype.' + name + ' can only be used on a ReadableStreamDefaultController');
}

// Helper functions for the ReadableStreamBYOBRequest.

function byobRequestBrandCheckException(name) {
  return new TypeError('ReadableStreamBYOBRequest.prototype.' + name + ' can only be used on a ReadableStreamBYOBRequest');
}

// Helper functions for the ReadableByteStreamController.

function byteStreamControllerBrandCheckException(name) {
  return new TypeError('ReadableByteStreamController.prototype.' + name + ' can only be used on a ReadableByteStreamController');
}

// Helper function for ReadableStream pipeThrough

function ifIsObjectAndHasAPromiseIsHandledInternalSlotSetPromiseIsHandledToTrue(promise) {
  try {
    // This relies on the brand-check that is enforced by Promise.prototype.then(). As with the rest of the reference
    // implementation, it doesn't attempt to do the right thing if someone has modified the global environment.
    Promise.prototype.then.call(promise, undefined, function () {});
  } catch (e) {
    // The brand check failed, therefore the internal slot is not present and there's nothing further to do.
  }
}

/***/ }),
/* 5 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var transformStream = __webpack_require__(6);
var readableStream = __webpack_require__(4);
var writableStream = __webpack_require__(2);

exports.TransformStream = transformStream.TransformStream;
exports.ReadableStream = readableStream.ReadableStream;
exports.IsReadableStreamDisturbed = readableStream.IsReadableStreamDisturbed;
exports.ReadableStreamDefaultControllerClose = readableStream.ReadableStreamDefaultControllerClose;
exports.ReadableStreamDefaultControllerEnqueue = readableStream.ReadableStreamDefaultControllerEnqueue;
exports.ReadableStreamDefaultControllerError = readableStream.ReadableStreamDefaultControllerError;
exports.ReadableStreamDefaultControllerGetDesiredSize = readableStream.ReadableStreamDefaultControllerGetDesiredSize;
exports.AcquireWritableStreamDefaultWriter = writableStream.AcquireWritableStreamDefaultWriter;
exports.IsWritableStream = writableStream.IsWritableStream;
exports.IsWritableStreamLocked = writableStream.IsWritableStreamLocked;
exports.WritableStream = writableStream.WritableStream;
exports.WritableStreamAbort = writableStream.WritableStreamAbort;
exports.WritableStreamDefaultControllerError = writableStream.WritableStreamDefaultControllerError;
exports.WritableStreamDefaultWriterCloseWithErrorPropagation = writableStream.WritableStreamDefaultWriterCloseWithErrorPropagation;
exports.WritableStreamDefaultWriterRelease = writableStream.WritableStreamDefaultWriterRelease;
exports.WritableStreamDefaultWriterWrite = writableStream.WritableStreamDefaultWriterWrite;

/***/ }),
/* 6 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _require = __webpack_require__(1),
    assert = _require.assert;

var _require2 = __webpack_require__(0),
    InvokeOrNoop = _require2.InvokeOrNoop,
    PromiseInvokeOrPerformFallback = _require2.PromiseInvokeOrPerformFallback,
    PromiseInvokeOrNoop = _require2.PromiseInvokeOrNoop,
    typeIsObject = _require2.typeIsObject;

var _require3 = __webpack_require__(4),
    ReadableStream = _require3.ReadableStream,
    ReadableStreamDefaultControllerClose = _require3.ReadableStreamDefaultControllerClose,
    ReadableStreamDefaultControllerEnqueue = _require3.ReadableStreamDefaultControllerEnqueue,
    ReadableStreamDefaultControllerError = _require3.ReadableStreamDefaultControllerError,
    ReadableStreamDefaultControllerGetDesiredSize = _require3.ReadableStreamDefaultControllerGetDesiredSize;

var _require4 = __webpack_require__(2),
    WritableStream = _require4.WritableStream,
    WritableStreamDefaultControllerError = _require4.WritableStreamDefaultControllerError;

// Methods on the transform stream controller object

function TransformStreamCloseReadable(transformStream) {
  // console.log('TransformStreamCloseReadable()');

  if (transformStream._errored === true) {
    throw new TypeError('TransformStream is already errored');
  }

  if (transformStream._readableClosed === true) {
    throw new TypeError('Readable side is already closed');
  }

  TransformStreamCloseReadableInternal(transformStream);
}

function TransformStreamEnqueueToReadable(transformStream, chunk) {
  // console.log('TransformStreamEnqueueToReadable()');

  if (transformStream._errored === true) {
    throw new TypeError('TransformStream is already errored');
  }

  if (transformStream._readableClosed === true) {
    throw new TypeError('Readable side is already closed');
  }

  // We throttle transformer.transform invocation based on the backpressure of the ReadableStream, but we still
  // accept TransformStreamEnqueueToReadable() calls.

  var controller = transformStream._readableController;

  try {
    ReadableStreamDefaultControllerEnqueue(controller, chunk);
  } catch (e) {
    // This happens when readableStrategy.size() throws.
    // The ReadableStream has already errored itself.
    transformStream._readableClosed = true;
    TransformStreamErrorIfNeeded(transformStream, e);

    throw transformStream._storedError;
  }

  var desiredSize = ReadableStreamDefaultControllerGetDesiredSize(controller);
  var maybeBackpressure = desiredSize <= 0;

  if (maybeBackpressure === true && transformStream._backpressure === false) {
    // This allows pull() again. When desiredSize is 0, it's possible that a pull() will happen immediately (but
    // asynchronously) after this because of pending read()s and set _backpressure back to false.
    //
    // If pull() could be called from inside enqueue(), then this logic would be wrong. This cannot happen
    // because there is always a promise pending from start() or pull() when _backpressure is false.
    TransformStreamSetBackpressure(transformStream, true);
  }
}

function TransformStreamError(transformStream, e) {
  if (transformStream._errored === true) {
    throw new TypeError('TransformStream is already errored');
  }

  TransformStreamErrorInternal(transformStream, e);
}

// Abstract operations.

function TransformStreamCloseReadableInternal(transformStream) {
  assert(transformStream._errored === false);
  assert(transformStream._readableClosed === false);

  try {
    ReadableStreamDefaultControllerClose(transformStream._readableController);
  } catch (e) {
    assert(false);
  }

  transformStream._readableClosed = true;
}

function TransformStreamErrorIfNeeded(transformStream, e) {
  if (transformStream._errored === false) {
    TransformStreamErrorInternal(transformStream, e);
  }
}

function TransformStreamErrorInternal(transformStream, e) {
  // console.log('TransformStreamErrorInternal()');

  assert(transformStream._errored === false);

  transformStream._errored = true;
  transformStream._storedError = e;

  if (transformStream._writableDone === false) {
    WritableStreamDefaultControllerError(transformStream._writableController, e);
  }
  if (transformStream._readableClosed === false) {
    ReadableStreamDefaultControllerError(transformStream._readableController, e);
  }
}

// Used for preventing the next write() call on TransformStreamSink until there
// is no longer backpressure.
function TransformStreamReadableReadyPromise(transformStream) {
  assert(transformStream._backpressureChangePromise !== undefined, '_backpressureChangePromise should have been initialized');

  if (transformStream._backpressure === false) {
    return Promise.resolve();
  }

  assert(transformStream._backpressure === true, '_backpressure should have been initialized');

  return transformStream._backpressureChangePromise;
}

function TransformStreamSetBackpressure(transformStream, backpressure) {
  // console.log(`TransformStreamSetBackpressure(${backpressure})`);

  // Passes also when called during construction.
  assert(transformStream._backpressure !== backpressure, 'TransformStreamSetBackpressure() should be called only when backpressure is changed');

  if (transformStream._backpressureChangePromise !== undefined) {
    // The fulfillment value is just for a sanity check.
    transformStream._backpressureChangePromise_resolve(backpressure);
  }

  transformStream._backpressureChangePromise = new Promise(function (resolve) {
    transformStream._backpressureChangePromise_resolve = resolve;
  });

  transformStream._backpressureChangePromise.then(function (resolution) {
    assert(resolution !== backpressure, '_backpressureChangePromise should be fulfilled only when backpressure is changed');
  });

  transformStream._backpressure = backpressure;
}

function TransformStreamDefaultTransform(chunk, transformStreamController) {
  var transformStream = transformStreamController._controlledTransformStream;
  TransformStreamEnqueueToReadable(transformStream, chunk);
  return Promise.resolve();
}

function TransformStreamTransform(transformStream, chunk) {
  // console.log('TransformStreamTransform()');

  assert(transformStream._errored === false);
  assert(transformStream._transforming === false);
  assert(transformStream._backpressure === false);

  transformStream._transforming = true;

  var transformer = transformStream._transformer;
  var controller = transformStream._transformStreamController;

  var transformPromise = PromiseInvokeOrPerformFallback(transformer, 'transform', [chunk, controller], TransformStreamDefaultTransform, [chunk, controller]);

  return transformPromise.then(function () {
    transformStream._transforming = false;

    return TransformStreamReadableReadyPromise(transformStream);
  }, function (e) {
    TransformStreamErrorIfNeeded(transformStream, e);
    return Promise.reject(e);
  });
}

function IsTransformStreamDefaultController(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_controlledTransformStream')) {
    return false;
  }

  return true;
}

function IsTransformStream(x) {
  if (!typeIsObject(x)) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(x, '_transformStreamController')) {
    return false;
  }

  return true;
}

var TransformStreamSink = function () {
  function TransformStreamSink(transformStream, startPromise) {
    _classCallCheck(this, TransformStreamSink);

    this._transformStream = transformStream;
    this._startPromise = startPromise;
  }

  _createClass(TransformStreamSink, [{
    key: 'start',
    value: function start(c) {
      var transformStream = this._transformStream;

      transformStream._writableController = c;

      return this._startPromise.then(function () {
        return TransformStreamReadableReadyPromise(transformStream);
      });
    }
  }, {
    key: 'write',
    value: function write(chunk) {
      // console.log('TransformStreamSink.write()');

      var transformStream = this._transformStream;

      return TransformStreamTransform(transformStream, chunk);
    }
  }, {
    key: 'abort',
    value: function abort() {
      var transformStream = this._transformStream;
      transformStream._writableDone = true;
      TransformStreamErrorInternal(transformStream, new TypeError('Writable side aborted'));
    }
  }, {
    key: 'close',
    value: function close() {
      // console.log('TransformStreamSink.close()');

      var transformStream = this._transformStream;

      assert(transformStream._transforming === false);

      transformStream._writableDone = true;

      var flushPromise = PromiseInvokeOrNoop(transformStream._transformer, 'flush', [transformStream._transformStreamController]);
      // Return a promise that is fulfilled with undefined on success.
      return flushPromise.then(function () {
        if (transformStream._errored === true) {
          return Promise.reject(transformStream._storedError);
        }
        if (transformStream._readableClosed === false) {
          TransformStreamCloseReadableInternal(transformStream);
        }
        return Promise.resolve();
      }).catch(function (r) {
        TransformStreamErrorIfNeeded(transformStream, r);
        return Promise.reject(transformStream._storedError);
      });
    }
  }]);

  return TransformStreamSink;
}();

var TransformStreamSource = function () {
  function TransformStreamSource(transformStream, startPromise) {
    _classCallCheck(this, TransformStreamSource);

    this._transformStream = transformStream;
    this._startPromise = startPromise;
  }

  _createClass(TransformStreamSource, [{
    key: 'start',
    value: function start(c) {
      var transformStream = this._transformStream;

      transformStream._readableController = c;

      return this._startPromise.then(function () {
        // Prevent the first pull() call until there is backpressure.

        assert(transformStream._backpressureChangePromise !== undefined, '_backpressureChangePromise should have been initialized');

        if (transformStream._backpressure === true) {
          return Promise.resolve();
        }

        assert(transformStream._backpressure === false, '_backpressure should have been initialized');

        return transformStream._backpressureChangePromise;
      });
    }
  }, {
    key: 'pull',
    value: function pull() {
      // console.log('TransformStreamSource.pull()');

      var transformStream = this._transformStream;

      // Invariant. Enforced by the promises returned by start() and pull().
      assert(transformStream._backpressure === true, 'pull() should be never called while _backpressure is false');

      assert(transformStream._backpressureChangePromise !== undefined, '_backpressureChangePromise should have been initialized');

      TransformStreamSetBackpressure(transformStream, false);

      // Prevent the next pull() call until there is backpressure.
      return transformStream._backpressureChangePromise;
    }
  }, {
    key: 'cancel',
    value: function cancel() {
      var transformStream = this._transformStream;
      transformStream._readableClosed = true;
      TransformStreamErrorInternal(transformStream, new TypeError('Readable side canceled'));
    }
  }]);

  return TransformStreamSource;
}();

var TransformStreamDefaultController = function () {
  function TransformStreamDefaultController(transformStream) {
    _classCallCheck(this, TransformStreamDefaultController);

    if (IsTransformStream(transformStream) === false) {
      throw new TypeError('TransformStreamDefaultController can only be ' + 'constructed with a TransformStream instance');
    }

    if (transformStream._transformStreamController !== undefined) {
      throw new TypeError('TransformStreamDefaultController instances can ' + 'only be created by the TransformStream constructor');
    }

    this._controlledTransformStream = transformStream;
  }

  _createClass(TransformStreamDefaultController, [{
    key: 'enqueue',
    value: function enqueue(chunk) {
      if (IsTransformStreamDefaultController(this) === false) {
        throw defaultControllerBrandCheckException('enqueue');
      }

      TransformStreamEnqueueToReadable(this._controlledTransformStream, chunk);
    }
  }, {
    key: 'close',
    value: function close() {
      if (IsTransformStreamDefaultController(this) === false) {
        throw defaultControllerBrandCheckException('close');
      }

      TransformStreamCloseReadable(this._controlledTransformStream);
    }
  }, {
    key: 'error',
    value: function error(reason) {
      if (IsTransformStreamDefaultController(this) === false) {
        throw defaultControllerBrandCheckException('error');
      }

      TransformStreamError(this._controlledTransformStream, reason);
    }
  }, {
    key: 'desiredSize',
    get: function get() {
      if (IsTransformStreamDefaultController(this) === false) {
        throw defaultControllerBrandCheckException('desiredSize');
      }

      var transformStream = this._controlledTransformStream;
      var readableController = transformStream._readableController;

      return ReadableStreamDefaultControllerGetDesiredSize(readableController);
    }
  }]);

  return TransformStreamDefaultController;
}();

var TransformStream = function () {
  function TransformStream() {
    var transformer = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    _classCallCheck(this, TransformStream);

    this._transformer = transformer;
    var readableStrategy = transformer.readableStrategy,
        writableStrategy = transformer.writableStrategy;


    this._transforming = false;
    this._errored = false;
    this._storedError = undefined;

    this._writableController = undefined;
    this._readableController = undefined;
    this._transformStreamController = undefined;

    this._writableDone = false;
    this._readableClosed = false;

    this._backpressure = undefined;
    this._backpressureChangePromise = undefined;
    this._backpressureChangePromise_resolve = undefined;

    this._transformStreamController = new TransformStreamDefaultController(this);

    var startPromise_resolve = void 0;
    var startPromise = new Promise(function (resolve) {
      startPromise_resolve = resolve;
    });

    var source = new TransformStreamSource(this, startPromise);

    this._readable = new ReadableStream(source, readableStrategy);

    var sink = new TransformStreamSink(this, startPromise);

    this._writable = new WritableStream(sink, writableStrategy);

    assert(this._writableController !== undefined);
    assert(this._readableController !== undefined);

    var desiredSize = ReadableStreamDefaultControllerGetDesiredSize(this._readableController);
    // Set _backpressure based on desiredSize. As there is no read() at this point, we can just interpret
    // desiredSize being non-positive as backpressure.
    TransformStreamSetBackpressure(this, desiredSize <= 0);

    var transformStream = this;
    var startResult = InvokeOrNoop(transformer, 'start', [transformStream._transformStreamController]);
    startPromise_resolve(startResult);
    startPromise.catch(function (e) {
      // The underlyingSink and underlyingSource will error the readable and writable ends on their own.
      if (transformStream._errored === false) {
        transformStream._errored = true;
        transformStream._storedError = e;
      }
    });
  }

  _createClass(TransformStream, [{
    key: 'readable',
    get: function get() {
      if (IsTransformStream(this) === false) {
        throw streamBrandCheckException('readable');
      }

      return this._readable;
    }
  }, {
    key: 'writable',
    get: function get() {
      if (IsTransformStream(this) === false) {
        throw streamBrandCheckException('writable');
      }

      return this._writable;
    }
  }]);

  return TransformStream;
}();

module.exports = { TransformStream: TransformStream };

// Helper functions for the TransformStreamDefaultController.

function defaultControllerBrandCheckException(name) {
  return new TypeError('TransformStreamDefaultController.prototype.' + name + ' can only be used on a TransformStreamDefaultController');
}

// Helper functions for the TransformStream.

function streamBrandCheckException(name) {
  return new TypeError('TransformStream.prototype.' + name + ' can only be used on a TransformStream');
}

/***/ }),
/* 7 */
/***/ (function(module, exports, __webpack_require__) {

module.exports = __webpack_require__(5);


/***/ })
/******/ ])));