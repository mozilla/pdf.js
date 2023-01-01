/* Copyright 2013 Rob Wu <rob@robwu.nl>
 * https://github.com/Rob--W/grab-to-pan.js
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

// Class name of element which can be grabbed.
const CSS_CLASS_GRAB = "grab-to-pan-grab";

class GrabToPan {
  /**
   * Construct a GrabToPan instance for a given HTML element.
   * @param {Element} options.element
   * @param {function} [options.ignoreTarget] - See `ignoreTarget(node)`.
   * @param {function(boolean)} [options.onActiveChanged] - Called when
   *   grab-to-pan is (de)activated. The first argument is a boolean that
   *   shows whether grab-to-pan is activated.
   */
  constructor(options) {
    this.element = options.element;
    this.document = options.element.ownerDocument;
    if (typeof options.ignoreTarget === "function") {
      this.ignoreTarget = options.ignoreTarget;
    }
    this.onActiveChanged = options.onActiveChanged;

    // Bind the contexts to ensure that `this` always points to
    // the GrabToPan instance.
    this.activate = this.activate.bind(this);
    this.deactivate = this.deactivate.bind(this);
    this.toggle = this.toggle.bind(this);
    this._onMouseDown = this.#onMouseDown.bind(this);
    this._onMouseMove = this.#onMouseMove.bind(this);
    this._endPan = this.#endPan.bind(this);

    // This overlay will be inserted in the document when the mouse moves during
    // a grab operation, to ensure that the cursor has the desired appearance.
    const overlay = (this.overlay = document.createElement("div"));
    overlay.className = "grab-to-pan-grabbing";
  }

  /**
   * Bind a mousedown event to the element to enable grab-detection.
   */
  activate() {
    if (!this.active) {
      this.active = true;
      this.element.addEventListener("mousedown", this._onMouseDown, true);
      this.element.classList.add(CSS_CLASS_GRAB);

      this.onActiveChanged?.(true);
    }
  }

  /**
   * Removes all events. Any pending pan session is immediately stopped.
   */
  deactivate() {
    if (this.active) {
      this.active = false;
      this.element.removeEventListener("mousedown", this._onMouseDown, true);
      this._endPan();
      this.element.classList.remove(CSS_CLASS_GRAB);

      this.onActiveChanged?.(false);
    }
  }

  toggle() {
    if (this.active) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  /**
   * Whether to not pan if the target element is clicked.
   * Override this method to change the default behaviour.
   *
   * @param {Element} node - The target of the event.
   * @returns {boolean} Whether to not react to the click event.
   */
  ignoreTarget(node) {
    // Check whether the clicked element is, a child of, an input element/link.
    return node.matches(
      "a[href], a[href] *, input, textarea, button, button *, select, option"
    );
  }

  #onMouseDown(event) {
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
    this.document.addEventListener("mousemove", this._onMouseMove, true);
    this.document.addEventListener("mouseup", this._endPan, true);
    // When a scroll event occurs before a mousemove, assume that the user
    // dragged a scrollbar (necessary for Opera Presto, Safari and IE)
    // (not needed for Chrome/Firefox)
    this.element.addEventListener("scroll", this._endPan, true);
    event.preventDefault();
    event.stopPropagation();

    const focusedElement = document.activeElement;
    if (focusedElement && !focusedElement.contains(event.target)) {
      focusedElement.blur();
    }
  }

  #onMouseMove(event) {
    this.element.removeEventListener("scroll", this._endPan, true);
    if (!(event.buttons & 1)) {
      // The left mouse button is released.
      this._endPan();
      return;
    }
    const xDiff = event.clientX - this.clientXStart;
    const yDiff = event.clientY - this.clientYStart;
    const scrollTop = this.scrollTopStart - yDiff;
    const scrollLeft = this.scrollLeftStart - xDiff;
    if (this.element.scrollTo) {
      this.element.scrollTo({
        top: scrollTop,
        left: scrollLeft,
        behavior: "instant",
      });
    } else {
      this.element.scrollTop = scrollTop;
      this.element.scrollLeft = scrollLeft;
    }
    if (!this.overlay.parentNode) {
      document.body.append(this.overlay);
    }
  }

  #endPan() {
    this.element.removeEventListener("scroll", this._endPan, true);
    this.document.removeEventListener("mousemove", this._onMouseMove, true);
    this.document.removeEventListener("mouseup", this._endPan, true);
    // Note: ChildNode.remove doesn't throw if the parentNode is undefined.
    this.overlay.remove();
  }
}

export { GrabToPan };
