
 import { MAX_SCALE, MIN_SCALE } from './ui_utils';
 const DEFAULT_SCALE_DELTA = 1.1;

function MarqueeZoom(options) {
  this.element = options.element;
  this.document = options.element.ownerDocument;
  this.pdfViewer = options.pdfViewer;

  if (typeof options.ignoreTarget === 'function') {
    this.ignoreTarget = options.ignoreTarget;
  }
  this.onActiveChanged = options.onActiveChanged;

  // Bind the contexts to ensure that `this` always points to
  // the MarqueeZoom instance.
  this.activate = this.activate.bind(this);
  this.deactivate = this.deactivate.bind(this);
  this.toggle = this.toggle.bind(this);
  this._onmousedown = this._onmousedown.bind(this);
  this._onmousemove = this._onmousemove.bind(this);
  this._endZoom = this._endZoom.bind(this);

  // This overlay will be inserted in the document when the mouse moves
  // during select operation
  var overlay = this.overlay = document.createElement('div');
  overlay.className = 'rectangle';
}
MarqueeZoom.prototype = {
  /**
   * Class name of element which can be zoomed
   */
  CSS_CLASS_ZOOM: 'marquee-zoom',

  activate: function MarqueeZoom_activate() {
    if (!this.active) {
      this.active = true;
      this.element.addEventListener('mousedown', this._onmousedown, true);
      this.element.classList.add(this.CSS_CLASS_ZOOM);
      if (this.onActiveChanged) {
        this.onActiveChanged(true);
      }
    }
  },

  deactivate: function MarqueeZoom_deactivate() {
    if (this.active) {
      this.active = false;
      this.element.removeEventListener('mousedown', this._onmousedown, true);
      this._endZoom();
      this.element.classList.remove(this.CSS_CLASS_ZOOM);
      if (this.onActiveChanged) {
        this.onActiveChanged(false);
      }
    }
  },

  toggle: function MarqueeZoom_toggle() {
    if (this.active) {
      this.deactivate();
    } else {
      this.activate();
    }
  },

  ignoreTarget: function MarqueeZoom_ignoreTarget(node) {
    // Use matchesSelector to check whether the clicked element
    // is (a child of) an input element / link
    return node[matchesSelector](
      'a[href], a[href] *, input, textarea, button, button *, select, option'
    );
  },

  /**
   * @private
   */
  _onmousedown: function MarqueeZoom__onmousedown(event) {
    if (event.button !== 0 || this.ignoreTarget(event.target)) {
      return;
    }
    if (event.originalTarget) {
      try {
        // eslint-disable-next-line no-unused-expressions
        event.originalTarget.tagName;
      } catch (e) {
        // Mozilla-specific: element is a scrollbar (XUL element)
        return;
      }
    }

    this.scrollLeftStart = this.element.scrollLeft;
    this.scrollTopStart = this.element.scrollTop;
    this.clientXStart = event.clientX;
    this.clientYStart = event.clientY;
    this.document.addEventListener('mousemove', this._onmousemove, true);
    this.document.addEventListener('mouseup', this._endZoom, true);

    event.preventDefault();
    event.stopPropagation();

    var focusedElement = document.activeElement;
    if (focusedElement && !focusedElement.contains(event.target)) {
      focusedElement.blur();
    }
  },

  /**
   * @private
   */
  _onmousemove: function MarqueeZoom__onmousemove(event) {
    if (isLeftMouseReleased(event)) {
      this._endZoom();
      return;
    }
    this.clientXEnd = event.clientX;
    this.clientYEnd = event.clientY ;

    placeRect(this.clientXStart, this.clientYStart, this.clientXEnd,this.clientYEnd, this.overlay);

    if (!this.overlay.parentNode) {
      document.body.appendChild(this.overlay);
    }
  },

  _onzoomin: function MarqueeZoom__onzoomin(ticks){
    let newScale = this.pdfViewer.currentScale;

    do {
      newScale = (newScale * DEFAULT_SCALE_DELTA).toFixed(2);
      newScale = Math.ceil(newScale * 10) / 10;
      newScale = Math.min(MAX_SCALE, newScale);
    } while (--ticks > 0 && newScale < MAX_SCALE);
    this.pdfViewer.currentScaleValue = newScale;
/*
    var scrollTop = this.scrollTopStart + ((this.clientYEnd - this.clientYStart)/2);
    var scrollLeft = this.scrollLeftStart + (this.clientXEnd - this.clientXStart)/2;

    if (this.element.scrollTo) {
      this.element.scrollTo({
        top: scrollTop,
        left: scrollLeft,
        behavior: 'instant',
      });
    } else {
      this.element.scrollTop = scrollTop;
      this.element.scrollLeft = scrollLeft;
    }
    */

  },

  /**
   * @private
   */
  _endZoom: function MarqueeZoom__endZoom() {
    this.document.removeEventListener('mousemove', this._onmousemove, true);
    this.document.removeEventListener('mouseup', this._endZoom, true);
    this.overlay.remove();

    var xDiff = Math.abs(this.clientXStart - this.clientXEnd);
    var yDiff = Math.abs(this.clientYStart - this.clientYEnd);

    if( xDiff < 20 || yDiff < 20 || isNaN(xDiff) || isNaN(yDiff))
      {
        return;  // selected area is too small
      }
    this._onzoomin(1);
  },

};

function placeRect(startX, startY, endX, endY, div){

      var width = endX - startX;
      var height = endY - startY;
      var posX = startX;
      var posY = startY;

      if (width < 0) {
          width = Math.abs(width);
          posX -= width;
      }

      if (height < 0) {
          height = Math.abs(height);
          posY -= height;
      }

      div.style.height = height + "px";
      div.style.width = width + "px";
      div.style.left = posX + "px";
      div.style.top = posY + "px";
}



// Get the correct (vendor-prefixed) name of the matches method.
var matchesSelector;
['webkitM', 'mozM', 'msM', 'oM', 'm'].some(function(prefix) {
  var name = prefix + 'atches';
  if (name in document.documentElement) {
    matchesSelector = name;
  }
  name += 'Selector';
  if (name in document.documentElement) {
    matchesSelector = name;
  }
  return matchesSelector; // If found, then truthy, and [].some() ends.
});

// Browser sniffing because it's impossible to feature-detect
// whether event.which for onmousemove is reliable
var isNotIEorIsIE10plus = !document.documentMode || document.documentMode > 9;
var chrome = window.chrome;
var isChrome15OrOpera15plus = chrome && (chrome.webstore || chrome.app);
//                                       ^ Chrome 15+       ^ Opera 15+
var isSafari6plus = /Apple/.test(navigator.vendor) &&
                    /Version\/([6-9]\d*|[1-5]\d+)/.test(navigator.userAgent);

/**
 * Whether the left mouse is not pressed.
 * @param event {MouseEvent}
 * @return {boolean} True if the left mouse button is not pressed.
 *                   False if unsure or if the left mouse button is pressed.
 */
function isLeftMouseReleased(event) {
  if ('buttons' in event && isNotIEorIsIE10plus) {
    // http://www.w3.org/TR/DOM-Level-3-Events/#events-MouseEvent-buttons
    // Firefox 15+
    // Internet Explorer 10+
    return !(event.buttons & 1);
  }
  if (isChrome15OrOpera15plus || isSafari6plus) {
    // Chrome 14+
    // Opera 15+
    // Safari 6.0+
    return event.which === 0;
  }
}

export {
  MarqueeZoom,
};
