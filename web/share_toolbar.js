'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-web/share_toolbar', ['exports', 'pdfjs-web/ui_utils'],
      factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./ui_utils.js'));
  } else {
    factory((root.pdfjsWebShareToolbar = {}), root.pdfjsWebUIUtils);
  }
}(this, function (exports, uiUtils) {

var SCROLLBAR_PADDING = uiUtils.SCROLLBAR_PADDING;
var mozL10n = uiUtils.mozL10n;

/**
 * @typedef {Object} ShareToolbarOptions
 * @property {HTMLDivElement} toolbar - Container for the secondary toolbar.
 * @property {HTMLButtonElement} toggleButton - Button to toggle the visibility
 *   of the secondary toolbar.
 * @property {HTMLDivElement} toolbarButtonContainer - Container where all the
 *   toolbar buttons are placed. The maximum height of the toolbar is controlled
 *   dynamically by adjusting the 'max-height' CSS property of this DOM element.
 */

/**
 * @class
 */
var ShareToolbar = (function ShareToolbarClosure() {
  /**
   * @constructs ShareToolbar
   * @param {ShareToolbarOptions} options
   * @param {HTMLDivElement} mainContainer
   * @param {EventBus} eventBus
   */
  function ShareToolbar(options, mainContainer, eventBus) {
    this.toolbar = options.toolbar;
    this.toggleButton = options.toggleButton;
    this.toolbarButtonContainer = options.toolbarButtonContainer;
    this.secondaryToolbar = options.secondaryToolbar;
    this.buttons = [
      { element: options.facebookButton, eventName: 'facebookshare', close: true},
      { element: options.twitterButton, eventName: 'twittershare', close: true},
      { element: options.linkedinButton, eventName: 'linkedinshare', close: true}
    ];
    this.items = {
      facebook: options.facebookButton,
      twitter: options.twitterButton,
      linkedin: options.linkedinButton
    };

    this.mainContainer = mainContainer;
    this.eventBus = eventBus;

    this.opened = false;
    this.containerHeight = null;
    this.previousContainerHeight = null;

    this.reset();

    // Bind the event listeners for click and hand tool actions.
    this._bindClickListeners();

    // Bind the event listener for adjusting the 'max-height' of the toolbar.
    this.eventBus.on('resize', this._setMaxHeight.bind(this));
  }

  ShareToolbar.prototype = {
    /**
     * @return {boolean}
     */
    get isOpen() {
      return this.opened;
    },

    reset: function ShareToolbar_reset() {
      this._updateUIState();
    },

    _updateUIState: function ShareToolbar_updateUIState() {
      var items = this.items;
    },

    _bindClickListeners: function ShareToolbar_bindClickListeners() {
      // Button to toggle the visibility of the secondary toolbar.
      this.toggleButton.addEventListener('click', this.toggle.bind(this));

      // All items within the secondary toolbar.
      for (var button in this.buttons) {
        var element = this.buttons[button].element;
        var eventName = this.buttons[button].eventName;
        var close = this.buttons[button].close;

        element.addEventListener('click', function (eventName, close) {
          if (eventName !== null) {
            this.eventBus.dispatch(eventName, { source: this, });
          }
          if (close) {
            this.close();
          }
        }.bind(this, eventName, close));
      }
    },

    open: function ShareToolbar_open() {
      var me = this;
      var setPosition = function () {
        me.toolbar.style.top = (me.secondaryToolbar.offsetHeight + me.toolbarButtonContainer.offsetTop) + 'px';
      };

      if (me.opened) {
        return;
      }
      me.opened = true;
      me._setMaxHeight();

      me.toggleButton.classList.add('toggled');
      me.toolbar.classList.remove('hidden');
      setPosition();
    },

    close: function ShareToolbar_close() {
      if (!this.opened) {
        return;
      }
      this.opened = false;
      this.toolbar.classList.add('hidden');
      this.toggleButton.classList.remove('toggled');
    },

    toggle: function ShareToolbar_toggle() {
      if (this.opened) {
        this.close();
      } else {
        this.open();
      }
    },

    /**
     * @private
     */
    _setMaxHeight: function ShareToolbar_setMaxHeight() {
      if (!this.opened) {
        return; // Only adjust the 'max-height' if the toolbar is visible.
      }
      this.containerHeight = this.mainContainer.clientHeight;

      if (this.containerHeight === this.previousContainerHeight) {
        return;
      }
      this.toolbarButtonContainer.setAttribute('style',
        'max-height: ' + (this.containerHeight - SCROLLBAR_PADDING) + 'px;');

      this.previousContainerHeight = this.containerHeight;
    }
  };

  return ShareToolbar;
})();

exports.ShareToolbar = ShareToolbar;
}));
