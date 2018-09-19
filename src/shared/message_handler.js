/* Copyright 2018 Mozilla Foundation
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

import {
  AbortException, assert, createPromiseCapability, MissingPDFException,
  ReadableStream, UnexpectedResponseException, UnknownErrorException
} from './util';

async function resolveCall(fn, args, thisArg = null) {
  if (!fn) {
    return;
  }
  return fn.apply(thisArg, args);
}

function wrapReason(reason) {
  if (typeof reason !== 'object') {
    return reason;
  }
  switch (reason.name) {
    case 'AbortException':
      return new AbortException(reason.message);
    case 'MissingPDFException':
      return new MissingPDFException(reason.message);
    case 'UnexpectedResponseException':
      return new UnexpectedResponseException(reason.message, reason.status);
    default:
      return new UnknownErrorException(reason.message, reason.details);
  }
}

function makeReasonSerializable(reason) {
  if (!(reason instanceof Error) ||
      reason instanceof AbortException ||
      reason instanceof MissingPDFException ||
      reason instanceof UnexpectedResponseException ||
      reason instanceof UnknownErrorException) {
    return reason;
  }
  return new UnknownErrorException(reason.message, reason.toString());
}

function resolveOrReject(capability, success, reason) {
  if (success) {
    capability.resolve();
  } else {
    capability.reject(reason);
  }
}

function finalize(promise) {
  return Promise.resolve(promise).catch(() => {});
}

function MessageHandler(sourceName, targetName, comObj) {
  this.sourceName = sourceName;
  this.targetName = targetName;
  this.comObj = comObj;
  this.callbackId = 1;
  this.streamId = 1;
  this.postMessageTransfers = true;
  this.streamSinks = Object.create(null);
  this.streamControllers = Object.create(null);
  let callbacksCapabilities = this.callbacksCapabilities = Object.create(null);
  let ah = this.actionHandler = Object.create(null);

  this._onComObjOnMessage = (event) => {
    let data = event.data;
    if (data.targetName !== this.sourceName) {
      return;
    }
    if (data.stream) {
      this._processStreamMessage(data);
    } else if (data.isReply) {
      let callbackId = data.callbackId;
      if (data.callbackId in callbacksCapabilities) {
        let callback = callbacksCapabilities[callbackId];
        delete callbacksCapabilities[callbackId];
        if ('error' in data) {
          callback.reject(wrapReason(data.error));
        } else {
          callback.resolve(data.data);
        }
      } else {
        throw new Error(`Cannot resolve callback ${callbackId}`);
      }
    } else if (data.action in ah) {
      let action = ah[data.action];
      if (data.callbackId) {
        let sourceName = this.sourceName;
        let targetName = data.sourceName;
        Promise.resolve().then(function () {
          return action[0].call(action[1], data.data);
        }).then((result) => {
          comObj.postMessage({
            sourceName,
            targetName,
            isReply: true,
            callbackId: data.callbackId,
            data: result,
          });
        }, (reason) => {
          comObj.postMessage({
            sourceName,
            targetName,
            isReply: true,
            callbackId: data.callbackId,
            error: makeReasonSerializable(reason),
          });
        });
      } else if (data.streamId) {
        this._createStreamSink(data);
      } else {
        action[0].call(action[1], data.data);
      }
    } else {
      throw new Error(`Unknown action from worker: ${data.action}`);
    }
  };
  comObj.addEventListener('message', this._onComObjOnMessage);
}

MessageHandler.prototype = {
  on(actionName, handler, scope) {
    var ah = this.actionHandler;
    if (ah[actionName]) {
      throw new Error(`There is already an actionName called "${actionName}"`);
    }
    ah[actionName] = [handler, scope];
  },
  /**
   * Sends a message to the comObj to invoke the action with the supplied data.
   * @param {String} actionName - Action to call.
   * @param {JSON} data - JSON data to send.
   * @param {Array} [transfers] - Optional list of transfers/ArrayBuffers
   */
  send(actionName, data, transfers) {
    var message = {
      sourceName: this.sourceName,
      targetName: this.targetName,
      action: actionName,
      data,
    };
    this.postMessage(message, transfers);
  },
  /**
   * Sends a message to the comObj to invoke the action with the supplied data.
   * Expects that the other side will callback with the response.
   * @param {String} actionName - Action to call.
   * @param {JSON} data - JSON data to send.
   * @param {Array} [transfers] - Optional list of transfers/ArrayBuffers.
   * @returns {Promise} Promise to be resolved with response data.
   */
  sendWithPromise(actionName, data, transfers) {
    var callbackId = this.callbackId++;
    var message = {
      sourceName: this.sourceName,
      targetName: this.targetName,
      action: actionName,
      data,
      callbackId,
    };
    var capability = createPromiseCapability();
    this.callbacksCapabilities[callbackId] = capability;
    try {
      this.postMessage(message, transfers);
    } catch (e) {
      capability.reject(e);
    }
    return capability.promise;
  },
  /**
   * Sends a message to the comObj to invoke the action with the supplied data.
   * Expect that the other side will callback to signal 'start_complete'.
   * @param {String} actionName - Action to call.
   * @param {JSON} data - JSON data to send.
   * @param {Object} queueingStrategy - strategy to signal backpressure based on
   *                 internal queue.
   * @param {Array} [transfers] - Optional list of transfers/ArrayBuffers.
   * @return {ReadableStream} ReadableStream to read data in chunks.
   */
  sendWithStream(actionName, data, queueingStrategy, transfers) {
    let streamId = this.streamId++;
    let sourceName = this.sourceName;
    let targetName = this.targetName;

    return new ReadableStream({
      start: (controller) => {
        let startCapability = createPromiseCapability();
        this.streamControllers[streamId] = {
          controller,
          startCall: startCapability,
          isClosed: false,
        };
        this.postMessage({
          sourceName,
          targetName,
          action: actionName,
          streamId,
          data,
          desiredSize: controller.desiredSize,
        });
        // Return Promise for Async process, to signal success/failure.
        return startCapability.promise;
      },

      pull: (controller) => {
        let pullCapability = createPromiseCapability();
        this.streamControllers[streamId].pullCall = pullCapability;
        this.postMessage({
          sourceName,
          targetName,
          stream: 'pull',
          streamId,
          desiredSize: controller.desiredSize,
        });
        // Returning Promise will not call "pull"
        // again until current pull is resolved.
        return pullCapability.promise;
      },

      cancel: (reason) => {
        let cancelCapability = createPromiseCapability();
        this.streamControllers[streamId].cancelCall = cancelCapability;
        this.streamControllers[streamId].isClosed = true;
        this.postMessage({
          sourceName,
          targetName,
          stream: 'cancel',
          reason,
          streamId,
        });
        // Return Promise to signal success or failure.
        return cancelCapability.promise;
      },
    }, queueingStrategy);
  },

  _createStreamSink(data) {
    let self = this;
    let action = this.actionHandler[data.action];
    let streamId = data.streamId;
    let desiredSize = data.desiredSize;
    let sourceName = this.sourceName;
    let targetName = data.sourceName;
    let capability = createPromiseCapability();

    let sendStreamRequest = ({ stream, chunk, transfers,
                               success, reason, }) => {
      this.postMessage({ sourceName, targetName, stream, streamId,
                         chunk, success, reason, }, transfers);
    };

    let streamSink = {
      enqueue(chunk, size = 1, transfers) {
        if (this.isCancelled) {
          return;
        }
        let lastDesiredSize = this.desiredSize;
        this.desiredSize -= size;
        // Enqueue decreases the desiredSize property of sink,
        // so when it changes from positive to negative,
        // set ready as unresolved promise.
        if (lastDesiredSize > 0 && this.desiredSize <= 0) {
          this.sinkCapability = createPromiseCapability();
          this.ready = this.sinkCapability.promise;
        }
        sendStreamRequest({ stream: 'enqueue', chunk, transfers, });
      },

      close() {
        if (this.isCancelled) {
          return;
        }
        this.isCancelled = true;
        sendStreamRequest({ stream: 'close', });
        delete self.streamSinks[streamId];
      },

      error(reason) {
        if (this.isCancelled) {
          return;
        }
        this.isCancelled = true;
        sendStreamRequest({ stream: 'error', reason, });
      },

      sinkCapability: capability,
      onPull: null,
      onCancel: null,
      isCancelled: false,
      desiredSize,
      ready: null,
    };

    streamSink.sinkCapability.resolve();
    streamSink.ready = streamSink.sinkCapability.promise;
    this.streamSinks[streamId] = streamSink;
    resolveCall(action[0], [data.data, streamSink], action[1]).then(() => {
      sendStreamRequest({ stream: 'start_complete', success: true, });
    }, (reason) => {
      sendStreamRequest({ stream: 'start_complete', success: false, reason, });
    });
  },

  _processStreamMessage(data) {
    let sourceName = this.sourceName;
    let targetName = data.sourceName;
    let streamId = data.streamId;

    let sendStreamResponse = ({ stream, success, reason, }) => {
      this.comObj.postMessage({ sourceName, targetName, stream,
                                success, streamId, reason, });
    };

    let deleteStreamController = () => {
      // Delete streamController only when start, pull and
      // cancel callbacks are resolved, to avoid "TypeError".
      Promise.all([
        this.streamControllers[data.streamId].startCall,
        this.streamControllers[data.streamId].pullCall,
        this.streamControllers[data.streamId].cancelCall
      ].map(function(capability) {
        return capability && finalize(capability.promise);
      })).then(() => {
        delete this.streamControllers[data.streamId];
      });
    };

    switch (data.stream) {
      case 'start_complete':
        resolveOrReject(this.streamControllers[data.streamId].startCall,
                        data.success, wrapReason(data.reason));
        break;
      case 'pull_complete':
        resolveOrReject(this.streamControllers[data.streamId].pullCall,
                        data.success, wrapReason(data.reason));
        break;
      case 'pull':
        // Ignore any pull after close is called.
        if (!this.streamSinks[data.streamId]) {
          sendStreamResponse({ stream: 'pull_complete', success: true, });
          break;
        }
        // Pull increases the desiredSize property of sink,
        // so when it changes from negative to positive,
        // set ready property as resolved promise.
        if (this.streamSinks[data.streamId].desiredSize <= 0 &&
            data.desiredSize > 0) {
          this.streamSinks[data.streamId].sinkCapability.resolve();
        }
        // Reset desiredSize property of sink on every pull.
        this.streamSinks[data.streamId].desiredSize = data.desiredSize;
        resolveCall(this.streamSinks[data.streamId].onPull).then(() => {
          sendStreamResponse({ stream: 'pull_complete', success: true, });
        }, (reason) => {
          sendStreamResponse({ stream: 'pull_complete',
                               success: false, reason, });
        });
        break;
      case 'enqueue':
        assert(this.streamControllers[data.streamId],
               'enqueue should have stream controller');
        if (!this.streamControllers[data.streamId].isClosed) {
          this.streamControllers[data.streamId].controller.enqueue(data.chunk);
        }
        break;
      case 'close':
        assert(this.streamControllers[data.streamId],
               'close should have stream controller');
        if (this.streamControllers[data.streamId].isClosed) {
          break;
        }
        this.streamControllers[data.streamId].isClosed = true;
        this.streamControllers[data.streamId].controller.close();
        deleteStreamController();
        break;
      case 'error':
        assert(this.streamControllers[data.streamId],
               'error should have stream controller');
        this.streamControllers[data.streamId].controller.
          error(wrapReason(data.reason));
        deleteStreamController();
        break;
      case 'cancel_complete':
        resolveOrReject(this.streamControllers[data.streamId].cancelCall,
                        data.success, wrapReason(data.reason));
        deleteStreamController();
        break;
      case 'cancel':
        if (!this.streamSinks[data.streamId]) {
          break;
        }
        resolveCall(this.streamSinks[data.streamId].onCancel,
                    [wrapReason(data.reason)]).then(() => {
          sendStreamResponse({ stream: 'cancel_complete', success: true, });
        }, (reason) => {
          sendStreamResponse({ stream: 'cancel_complete',
                               success: false, reason, });
        });
        this.streamSinks[data.streamId].sinkCapability.
          reject(wrapReason(data.reason));
        this.streamSinks[data.streamId].isCancelled = true;
        delete this.streamSinks[data.streamId];
        break;
      default:
        throw new Error('Unexpected stream case');
    }
  },

  /**
   * Sends raw message to the comObj.
   * @private
   * @param {Object} message - Raw message.
   * @param transfers List of transfers/ArrayBuffers, or undefined.
   */
  postMessage(message, transfers) {
    if (transfers && this.postMessageTransfers) {
      this.comObj.postMessage(message, transfers);
    } else {
      this.comObj.postMessage(message);
    }
  },

  destroy() {
    this.comObj.removeEventListener('message', this._onComObjOnMessage);
  },
};

export {
  MessageHandler,
};
