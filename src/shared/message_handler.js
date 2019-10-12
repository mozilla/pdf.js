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

const StreamKind = {
  UNKNOWN: 0,
  CANCEL: 1,
  CANCEL_COMPLETE: 2,
  CLOSE: 3,
  ENQUEUE: 4,
  ERROR: 5,
  PULL: 6,
  PULL_COMPLETE: 7,
  START_COMPLETE: 8,
};

function wrapReason(reason) {
  if (typeof PDFJSDev === 'undefined' ||
      PDFJSDev.test('!PRODUCTION || TESTING')) {
    assert(reason instanceof Error ||
           (typeof reason === 'object' && reason !== null),
           'wrapReason: Expected "reason" to be a (possibly cloned) Error.');
  }
  if (typeof reason !== 'object' || reason === null) {
    return reason;
  }
  switch (reason.name) {
    case 'AbortException':
      return new AbortException(reason.message);
    case 'MissingPDFException':
      return new MissingPDFException(reason.message);
    case 'UnexpectedResponseException':
      return new UnexpectedResponseException(reason.message, reason.status);
    case 'UnknownErrorException':
      return new UnknownErrorException(reason.message, reason.details);
    default:
      return new UnknownErrorException(reason.message, reason.toString());
  }
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
        if ('reason' in data) {
          callback.reject(wrapReason(data.reason));
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
        new Promise(function(resolve) {
          resolve(action(data.data));
        }).then(function(result) {
          comObj.postMessage({
            sourceName,
            targetName,
            isReply: true,
            callbackId: data.callbackId,
            data: result,
          });
        }, function(reason) {
          comObj.postMessage({
            sourceName,
            targetName,
            isReply: true,
            callbackId: data.callbackId,
            reason: wrapReason(reason),
          });
        });
      } else if (data.streamId) {
        this._createStreamSink(data);
      } else {
        action(data.data);
      }
    } else {
      throw new Error(`Unknown action from worker: ${data.action}`);
    }
  };
  comObj.addEventListener('message', this._onComObjOnMessage);
}

MessageHandler.prototype = {
  on(actionName, handler) {
    var ah = this.actionHandler;
    if (ah[actionName]) {
      throw new Error(`There is already an actionName called "${actionName}"`);
    }
    ah[actionName] = handler;
  },
  /**
   * Sends a message to the comObj to invoke the action with the supplied data.
   * @param {string} actionName - Action to call.
   * @param {JSON} data - JSON data to send.
   * @param {Array} [transfers] - List of transfers/ArrayBuffers.
   */
  send(actionName, data, transfers) {
    this.postMessage({
      sourceName: this.sourceName,
      targetName: this.targetName,
      action: actionName,
      data,
    }, transfers);
  },
  /**
   * Sends a message to the comObj to invoke the action with the supplied data.
   * Expects that the other side will callback with the response.
   * @param {string} actionName - Action to call.
   * @param {JSON} data - JSON data to send.
   * @param {Array} [transfers] - List of transfers/ArrayBuffers.
   * @returns {Promise} Promise to be resolved with response data.
   */
  sendWithPromise(actionName, data, transfers) {
    var callbackId = this.callbackId++;
    var capability = createPromiseCapability();
    this.callbacksCapabilities[callbackId] = capability;
    try {
      this.postMessage({
        sourceName: this.sourceName,
        targetName: this.targetName,
        action: actionName,
        callbackId,
        data,
      }, transfers);
    } catch (ex) {
      capability.reject(ex);
    }
    return capability.promise;
  },
  /**
   * Sends a message to the comObj to invoke the action with the supplied data.
   * Expect that the other side will callback to signal 'start_complete'.
   * @param {string} actionName - Action to call.
   * @param {JSON} data - JSON data to send.
   * @param {Object} queueingStrategy - Strategy to signal backpressure based on
   *                 internal queue.
   * @param {Array} [transfers] - List of transfers/ArrayBuffers.
   * @returns {ReadableStream} ReadableStream to read data in chunks.
   */
  sendWithStream(actionName, data, queueingStrategy, transfers) {
    let streamId = this.streamId++;
    let sourceName = this.sourceName;
    let targetName = this.targetName;
    const comObj = this.comObj;

    return new ReadableStream({
      start: (controller) => {
        let startCapability = createPromiseCapability();
        this.streamControllers[streamId] = {
          controller,
          startCall: startCapability,
          pullCall: null,
          cancelCall: null,
          isClosed: false,
        };
        this.postMessage({
          sourceName,
          targetName,
          action: actionName,
          streamId,
          data,
          desiredSize: controller.desiredSize,
        }, transfers);
        // Return Promise for Async process, to signal success/failure.
        return startCapability.promise;
      },

      pull: (controller) => {
        let pullCapability = createPromiseCapability();
        this.streamControllers[streamId].pullCall = pullCapability;
        comObj.postMessage({
          sourceName,
          targetName,
          stream: StreamKind.PULL,
          streamId,
          desiredSize: controller.desiredSize,
        });
        // Returning Promise will not call "pull"
        // again until current pull is resolved.
        return pullCapability.promise;
      },

      cancel: (reason) => {
        assert(reason instanceof Error, 'cancel must have a valid reason');
        let cancelCapability = createPromiseCapability();
        this.streamControllers[streamId].cancelCall = cancelCapability;
        this.streamControllers[streamId].isClosed = true;
        comObj.postMessage({
          sourceName,
          targetName,
          stream: StreamKind.CANCEL,
          streamId,
          reason: wrapReason(reason),
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
    const comObj = this.comObj;

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
        self.postMessage({
          sourceName,
          targetName,
          stream: StreamKind.ENQUEUE,
          streamId,
          chunk,
        }, transfers);
      },

      close() {
        if (this.isCancelled) {
          return;
        }
        this.isCancelled = true;
        comObj.postMessage({
          sourceName,
          targetName,
          stream: StreamKind.CLOSE,
          streamId,
        });
        delete self.streamSinks[streamId];
      },

      error(reason) {
        assert(reason instanceof Error, 'error must have a valid reason');
        if (this.isCancelled) {
          return;
        }
        this.isCancelled = true;
        comObj.postMessage({
          sourceName,
          targetName,
          stream: StreamKind.ERROR,
          streamId,
          reason: wrapReason(reason),
        });
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
    new Promise(function(resolve) {
      resolve(action(data.data, streamSink));
    }).then(function() {
      comObj.postMessage({
        sourceName,
        targetName,
        stream: StreamKind.START_COMPLETE,
        streamId,
        success: true,
      });
    }, function(reason) {
      comObj.postMessage({
        sourceName,
        targetName,
        stream: StreamKind.START_COMPLETE,
        streamId,
        reason: wrapReason(reason),
      });
    });
  },

  _processStreamMessage(data) {
    let sourceName = this.sourceName;
    let targetName = data.sourceName;
    const streamId = data.streamId;
    const comObj = this.comObj;

    switch (data.stream) {
      case StreamKind.START_COMPLETE:
        if (data.success) {
          this.streamControllers[streamId].startCall.resolve();
        } else {
          this.streamControllers[streamId].startCall.reject(
            wrapReason(data.reason));
        }
        break;
      case StreamKind.PULL_COMPLETE:
        if (data.success) {
          this.streamControllers[streamId].pullCall.resolve();
        } else {
          this.streamControllers[streamId].pullCall.reject(
            wrapReason(data.reason));
        }
        break;
      case StreamKind.PULL:
        // Ignore any pull after close is called.
        if (!this.streamSinks[streamId]) {
          comObj.postMessage({
            sourceName,
            targetName,
            stream: StreamKind.PULL_COMPLETE,
            streamId,
            success: true,
          });
          break;
        }
        // Pull increases the desiredSize property of sink,
        // so when it changes from negative to positive,
        // set ready property as resolved promise.
        if (this.streamSinks[streamId].desiredSize <= 0 &&
            data.desiredSize > 0) {
          this.streamSinks[streamId].sinkCapability.resolve();
        }
        // Reset desiredSize property of sink on every pull.
        this.streamSinks[streamId].desiredSize = data.desiredSize;
        const { onPull, } = this.streamSinks[data.streamId];
        new Promise(function(resolve) {
          resolve(onPull && onPull());
        }).then(function() {
          comObj.postMessage({
            sourceName,
            targetName,
            stream: StreamKind.PULL_COMPLETE,
            streamId,
            success: true,
          });
        }, function(reason) {
          comObj.postMessage({
            sourceName,
            targetName,
            stream: StreamKind.PULL_COMPLETE,
            streamId,
            reason: wrapReason(reason),
          });
        });
        break;
      case StreamKind.ENQUEUE:
        assert(this.streamControllers[streamId],
               'enqueue should have stream controller');
        if (this.streamControllers[streamId].isClosed) {
          break;
        }
        this.streamControllers[streamId].controller.enqueue(data.chunk);
        break;
      case StreamKind.CLOSE:
        assert(this.streamControllers[streamId],
               'close should have stream controller');
        if (this.streamControllers[streamId].isClosed) {
          break;
        }
        this.streamControllers[streamId].isClosed = true;
        this.streamControllers[streamId].controller.close();
        this._deleteStreamController(streamId);
        break;
      case StreamKind.ERROR:
        assert(this.streamControllers[streamId],
               'error should have stream controller');
        this.streamControllers[streamId].controller.error(
          wrapReason(data.reason));
        this._deleteStreamController(streamId);
        break;
      case StreamKind.CANCEL_COMPLETE:
        if (data.success) {
          this.streamControllers[streamId].cancelCall.resolve();
        } else {
          this.streamControllers[streamId].cancelCall.reject(
            wrapReason(data.reason));
        }
        this._deleteStreamController(streamId);
        break;
      case StreamKind.CANCEL:
        if (!this.streamSinks[streamId]) {
          break;
        }
        const { onCancel, } = this.streamSinks[data.streamId];
        new Promise(function(resolve) {
          resolve(onCancel && onCancel(wrapReason(data.reason)));
        }).then(function() {
          comObj.postMessage({
            sourceName,
            targetName,
            stream: StreamKind.CANCEL_COMPLETE,
            streamId,
            success: true,
          });
        }, function(reason) {
          comObj.postMessage({
            sourceName,
            targetName,
            stream: StreamKind.CANCEL_COMPLETE,
            streamId,
            reason: wrapReason(reason),
          });
        });
        this.streamSinks[streamId].sinkCapability.reject(
          wrapReason(data.reason));
        this.streamSinks[streamId].isCancelled = true;
        delete this.streamSinks[streamId];
        break;
      default:
        throw new Error('Unexpected stream case');
    }
  },

  async _deleteStreamController(streamId) {
    // Delete the `streamController` only when the start, pull, and cancel
    // capabilities have settled, to prevent `TypeError`s.
    await Promise.all([
      this.streamControllers[streamId].startCall,
      this.streamControllers[streamId].pullCall,
      this.streamControllers[streamId].cancelCall
    ].map(function(capability) {
      return capability && capability.promise.catch(function() { });
    }));
    delete this.streamControllers[streamId];
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
