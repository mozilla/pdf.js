"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.OverlayManager = void 0;

class OverlayManager {
  constructor() {
    this._overlays = {};
    this._active = null;
    this._keyDownBound = this._keyDown.bind(this);
  }

  get active() {
    return this._active;
  }

  async register(name, element, callerCloseMethod = null, canForceClose = false) {
    let container;

    if (!name || !element || !(container = element.parentNode)) {
      throw new Error('Not enough parameters.');
    } else if (this._overlays[name]) {
      throw new Error('The overlay is already registered.');
    }

    this._overlays[name] = {
      element,
      container,
      callerCloseMethod,
      canForceClose
    };
  }

  async unregister(name) {
    if (!this._overlays[name]) {
      throw new Error('The overlay does not exist.');
    } else if (this._active === name) {
      throw new Error('The overlay cannot be removed while it is active.');
    }

    delete this._overlays[name];
  }

  async open(name) {
    if (!this._overlays[name]) {
      throw new Error('The overlay does not exist.');
    } else if (this._active) {
      if (this._overlays[name].canForceClose) {
        this._closeThroughCaller();
      } else if (this._active === name) {
        throw new Error('The overlay is already active.');
      } else {
        throw new Error('Another overlay is currently active.');
      }
    }

    this._active = name;

    this._overlays[this._active].element.classList.remove('hidden');

    this._overlays[this._active].container.classList.remove('hidden');

    window.addEventListener('keydown', this._keyDownBound);
  }

  async close(name) {
    if (!this._overlays[name]) {
      throw new Error('The overlay does not exist.');
    } else if (!this._active) {
      throw new Error('The overlay is currently not active.');
    } else if (this._active !== name) {
      throw new Error('Another overlay is currently active.');
    }

    this._overlays[this._active].container.classList.add('hidden');

    this._overlays[this._active].element.classList.add('hidden');

    this._active = null;
    window.removeEventListener('keydown', this._keyDownBound);
  }

  _keyDown(evt) {
    if (this._active && evt.keyCode === 27) {
      this._closeThroughCaller();

      evt.preventDefault();
    }
  }

  _closeThroughCaller() {
    if (this._overlays[this._active].callerCloseMethod) {
      this._overlays[this._active].callerCloseMethod();
    }

    if (this._active) {
      this.close(this._active);
    }
  }

}

exports.OverlayManager = OverlayManager;