/**
 * Simple event bus for an application. Listeners are attached using the
 * `on` and `off` methods. To raise an event, the `dispatch` method shall be
 * used.
 */
export default class EventBus {
  constructor({ dispatchToDOM = false, } = {}) {
    this._listeners = Object.create(null);
    this._dispatchToDOM = dispatchToDOM === true;
  }

  on(eventName, listener) {
    let eventListeners = this._listeners[eventName];
    if (!eventListeners) {
      eventListeners = [];
      this._listeners[eventName] = eventListeners;
    }
    eventListeners.push(listener);
  }

  off(eventName, listener) {
    let eventListeners = this._listeners[eventName];
    let i;
    if (!eventListeners || ((i = eventListeners.indexOf(listener)) < 0)) {
      return;
    }
    eventListeners.splice(i, 1);
  }

  dispatch(eventName) {
    let eventListeners = this._listeners[eventName];
    if (!eventListeners || eventListeners.length === 0) {
      if (this._dispatchToDOM) {
        const args = Array.prototype.slice.call(arguments, 1);
        this._dispatchDOMEvent(eventName, args);
      }
      return;
    }
    // Passing all arguments after the eventName to the listeners.
    const args = Array.prototype.slice.call(arguments, 1);
    // Making copy of the listeners array in case if it will be modified
    // during dispatch.
    eventListeners.slice(0).forEach(function (listener) {
      listener.apply(null, args);
    });
    if (this._dispatchToDOM) {
      this._dispatchDOMEvent(eventName, args);
    }
  }

  /**
   * @private
   */
  _dispatchDOMEvent(eventName, args = null) {
    const details = Object.create(null);
    if (args && args.length > 0) {
      const obj = args[0];
      for (let key in obj) {
        const value = obj[key];
        if (key === 'source') {
          if (value === window || value === document) {
            return; // No need to re-dispatch (already) global events.
          }
          continue; // Ignore the `source` property.
        }
        details[key] = value;
      }
    }
    const event = document.createEvent('CustomEvent');
    event.initCustomEvent(eventName, true, true, details);
    document.dispatchEvent(event);
  }
}
