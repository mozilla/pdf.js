/* Copyright 2012 Mozilla Foundation
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

const WaitOnType = {
  EVENT: "event",
  TIMEOUT: "timeout",
};

/**
 * @typedef {Object} WaitOnEventOrTimeoutParameters
 * @property {Object} target - The event target, can for example be:
 *   `window`, `document`, a DOM element, or an {EventBus} instance.
 * @property {string} name - The name of the event.
 * @property {number} delay - The delay, in milliseconds, after which the
 *   timeout occurs (if the event wasn't already dispatched).
 */

/**
 * Allows waiting for an event or a timeout, whichever occurs first.
 * Can be used to ensure that an action always occurs, even when an event
 * arrives late or not at all.
 *
 * @param {WaitOnEventOrTimeoutParameters}
 * @returns {Promise} A promise that is resolved with a {WaitOnType} value.
 */
async function waitOnEventOrTimeout({ target, name, delay = 0 }) {
  if (
    typeof target !== "object" ||
    !(name && typeof name === "string") ||
    !(Number.isInteger(delay) && delay >= 0)
  ) {
    throw new Error("waitOnEventOrTimeout - invalid parameters.");
  }
  const { promise, resolve } = Promise.withResolvers();
  const ac = new AbortController();

  function handler(type) {
    ac.abort(); // Remove event listener.
    clearTimeout(timeout);

    resolve(type);
  }

  const evtMethod = target instanceof EventBus ? "_on" : "addEventListener";
  target[evtMethod](name, handler.bind(null, WaitOnType.EVENT), {
    signal: ac.signal,
  });

  const timeout = setTimeout(handler.bind(null, WaitOnType.TIMEOUT), delay);

  return promise;
}

/**
 * Simple event bus for an application. Listeners are attached using the `on`
 * and `off` methods. To raise an event, the `dispatch` method shall be used.
 */
class EventBus {
  #listeners = Object.create(null);

  /**
   * @param {string} eventName
   * @param {function} listener
   * @param {Object} [options]
   */
  on(eventName, listener, options = null) {
    this._on(eventName, listener, {
      external: true,
      once: options?.once,
      signal: options?.signal,
    });
  }

  /**
   * @param {string} eventName
   * @param {function} listener
   * @param {Object} [options]
   */
  off(eventName, listener, options = null) {
    this._off(eventName, listener);
  }

  /**
   * @param {string} eventName
   * @param {Object} data
   */
  dispatch(eventName, data) {
    const eventListeners = this.#listeners[eventName];
    if (!eventListeners || eventListeners.length === 0) {
      return;
    }
    let externalListeners;
    // Making copy of the listeners array in case if it will be modified
    // during dispatch.
    for (const { listener, external, once } of eventListeners.slice(0)) {
      if (once) {
        this._off(eventName, listener);
      }
      if (external) {
        (externalListeners ||= []).push(listener);
        continue;
      }
      listener(data);
    }
    // Dispatch any "external" listeners *after* the internal ones, to give the
    // viewer components time to handle events and update their state first.
    if (externalListeners) {
      for (const listener of externalListeners) {
        listener(data);
      }
      externalListeners = null;
    }
  }

  /**
   * @ignore
   */
  _on(eventName, listener, options = null) {
    let rmAbort = null;
    if (options?.signal instanceof AbortSignal) {
      const { signal } = options;
      if (signal.aborted) {
        console.error("Cannot use an `aborted` signal.");
        return;
      }
      const onAbort = () => this._off(eventName, listener);
      rmAbort = () => signal.removeEventListener("abort", onAbort);

      signal.addEventListener("abort", onAbort);
    }

    const eventListeners = (this.#listeners[eventName] ||= []);
    eventListeners.push({
      listener,
      external: options?.external === true,
      once: options?.once === true,
      rmAbort,
    });
  }

  /**
   * @ignore
   */
  _off(eventName, listener, options = null) {
    const eventListeners = this.#listeners[eventName];
    if (!eventListeners) {
      return;
    }
    for (let i = 0, ii = eventListeners.length; i < ii; i++) {
      const evt = eventListeners[i];
      if (evt.listener === listener) {
        evt.rmAbort?.(); // Ensure that the `AbortSignal` listener is removed.
        eventListeners.splice(i, 1);
        return;
      }
    }
  }
}

/**
 * NOTE: Only used in the Firefox build-in pdf viewer.
 */
class FirefoxEventBus extends EventBus {
  #externalServices;

  #globalEventNames;

  #isInAutomation;

  constructor(globalEventNames, externalServices, isInAutomation) {
    super();
    this.#globalEventNames = globalEventNames;
    this.#externalServices = externalServices;
    this.#isInAutomation = isInAutomation;
  }

  dispatch(eventName, data) {
    if (typeof PDFJSDev !== "undefined" && !PDFJSDev.test("MOZCENTRAL")) {
      throw new Error("Not implemented: FirefoxEventBus.dispatch");
    }
    super.dispatch(eventName, data);

    if (this.#isInAutomation) {
      const detail = Object.create(null);
      if (data) {
        for (const key in data) {
          const value = data[key];
          if (key === "source") {
            if (value === window || value === document) {
              return; // No need to re-dispatch (already) global events.
            }
            continue; // Ignore the `source` property.
          }
          detail[key] = value;
        }
      }
      const event = new CustomEvent(eventName, {
        bubbles: true,
        cancelable: true,
        detail,
      });
      document.dispatchEvent(event);
    }

    if (this.#globalEventNames?.has(eventName)) {
      this.#externalServices.dispatchGlobalEvent({
        eventName,
        detail: data,
      });
    }
  }
}

export { EventBus, FirefoxEventBus, waitOnEventOrTimeout, WaitOnType };
