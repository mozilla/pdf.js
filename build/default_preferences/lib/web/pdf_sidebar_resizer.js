"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFSidebarResizer = void 0;

var _ui_utils = require("./ui_utils");

const SIDEBAR_WIDTH_VAR = '--sidebar-width';
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_RESIZING_CLASS = 'sidebarResizing';

class PDFSidebarResizer {
  constructor(options, eventBus, l10n = _ui_utils.NullL10n) {
    this.enabled = false;
    this.isRTL = false;
    this.sidebarOpen = false;
    this.doc = document.documentElement;
    this._width = null;
    this._outerContainerWidth = null;
    this._boundEvents = Object.create(null);
    this.outerContainer = options.outerContainer;
    this.resizer = options.resizer;
    this.eventBus = eventBus;
    this.l10n = l10n;

    if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function' || !CSS.supports(SIDEBAR_WIDTH_VAR, `calc(-1 * ${SIDEBAR_MIN_WIDTH}px)`)) {
      console.warn('PDFSidebarResizer: ' + 'The browser does not support resizing of the sidebar.');
      return;
    }

    this.enabled = true;
    this.resizer.classList.remove('hidden');
    this.l10n.getDirection().then(dir => {
      this.isRTL = dir === 'rtl';
    });

    this._addEventListeners();
  }

  get outerContainerWidth() {
    if (!this._outerContainerWidth) {
      this._outerContainerWidth = this.outerContainer.clientWidth;
    }

    return this._outerContainerWidth;
  }

  _updateWidth(width = 0) {
    if (!this.enabled) {
      return false;
    }

    const maxWidth = Math.floor(this.outerContainerWidth / 2);

    if (width > maxWidth) {
      width = maxWidth;
    }

    if (width < SIDEBAR_MIN_WIDTH) {
      width = SIDEBAR_MIN_WIDTH;
    }

    if (width === this._width) {
      return false;
    }

    this._width = width;
    this.doc.style.setProperty(SIDEBAR_WIDTH_VAR, `${width}px`);
    return true;
  }

  _mouseMove(evt) {
    let width = evt.clientX;

    if (this.isRTL) {
      width = this.outerContainerWidth - width;
    }

    this._updateWidth(width);
  }

  _mouseUp(evt) {
    this.outerContainer.classList.remove(SIDEBAR_RESIZING_CLASS);
    this.eventBus.dispatch('resize', {
      source: this
    });
    let _boundEvents = this._boundEvents;
    window.removeEventListener('mousemove', _boundEvents.mouseMove);
    window.removeEventListener('mouseup', _boundEvents.mouseUp);
  }

  _addEventListeners() {
    if (!this.enabled) {
      return;
    }

    let _boundEvents = this._boundEvents;
    _boundEvents.mouseMove = this._mouseMove.bind(this);
    _boundEvents.mouseUp = this._mouseUp.bind(this);
    this.resizer.addEventListener('mousedown', evt => {
      if (evt.button !== 0) {
        return;
      }

      this.outerContainer.classList.add(SIDEBAR_RESIZING_CLASS);
      window.addEventListener('mousemove', _boundEvents.mouseMove);
      window.addEventListener('mouseup', _boundEvents.mouseUp);
    });
    this.eventBus.on('sidebarviewchanged', evt => {
      this.sidebarOpen = !!(evt && evt.view);
    });
    this.eventBus.on('resize', evt => {
      if (evt && evt.source === window) {
        this._outerContainerWidth = null;

        if (this._width) {
          if (this.sidebarOpen) {
            this.outerContainer.classList.add(SIDEBAR_RESIZING_CLASS);

            let updated = this._updateWidth(this._width);

            Promise.resolve().then(() => {
              this.outerContainer.classList.remove(SIDEBAR_RESIZING_CLASS);

              if (updated) {
                this.eventBus.dispatch('resize', {
                  source: this
                });
              }
            });
          } else {
            this._updateWidth(this._width);
          }
        }
      }
    });
  }

}

exports.PDFSidebarResizer = PDFSidebarResizer;