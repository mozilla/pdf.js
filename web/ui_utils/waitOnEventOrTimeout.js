import EventBus from './EventBus';
import WaitOnType from './WaitOnType';

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
export default function waitOnEventOrTimeout({ target, name, delay = 0, }) {
  return new Promise(function(resolve, reject) {
    if (typeof target !== 'object' || !(name && typeof name === 'string') ||
        !(Number.isInteger(delay) && delay >= 0)) {
      throw new Error('waitOnEventOrTimeout - invalid parameters.');
    }

    function handler(type) {
      if (target instanceof EventBus) {
        target.off(name, eventHandler);
      } else {
        target.removeEventListener(name, eventHandler);
      }

      if (timeout) {
        clearTimeout(timeout);
      }
      resolve(type);
    }

    const eventHandler = handler.bind(null, WaitOnType.EVENT);
    if (target instanceof EventBus) {
      target.on(name, eventHandler);
    } else {
      target.addEventListener(name, eventHandler);
    }

    const timeoutHandler = handler.bind(null, WaitOnType.TIMEOUT);
    let timeout = setTimeout(timeoutHandler, delay);
  });
}
