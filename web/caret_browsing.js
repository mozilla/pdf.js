/* Copyright 2024 Mozilla Foundation
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

// Used to compare floats: there is no exact equality due to rounding errors.
const PRECISION = 1e-1;

class CaretBrowsingMode {
  #mainContainer;

  #toolBarHeight = 0;

  #viewerContainer;

  constructor(abortSignal, mainContainer, viewerContainer, toolbarContainer) {
    this.#mainContainer = mainContainer;
    this.#viewerContainer = viewerContainer;

    if (!toolbarContainer) {
      return;
    }
    this.#toolBarHeight = toolbarContainer.getBoundingClientRect().height;

    const toolbarObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === toolbarContainer) {
          this.#toolBarHeight = Math.floor(entry.borderBoxSize[0].blockSize);
          break;
        }
      }
    });
    toolbarObserver.observe(toolbarContainer);

    abortSignal.addEventListener("abort", () => toolbarObserver.disconnect(), {
      once: true,
    });
  }

  /**
   * Return true if the two rectangles are on the same line.
   * @param {DOMRect} rect1
   * @param {DOMRect} rect2
   * @returns {boolean}
   */
  #isOnSameLine(rect1, rect2) {
    const top1 = rect1.y;
    const bot1 = rect1.bottom;
    const mid1 = rect1.y + rect1.height / 2;

    const top2 = rect2.y;
    const bot2 = rect2.bottom;
    const mid2 = rect2.y + rect2.height / 2;

    return (top1 <= mid2 && mid2 <= bot1) || (top2 <= mid1 && mid1 <= bot2);
  }

  /**
   * Return `true` if the rectangle is:
   *  - under the caret when `isUp === false`.
   *  - over the caret when `isUp === true`.
   * @param {DOMRect} rect
   * @param {number} x
   * @param {number} y
   * @param {boolean} isUp
   * @returns {boolean}
   */
  #isUnderOver(rect, x, y, isUp) {
    const midY = rect.y + rect.height / 2;
    return (
      (isUp ? y >= midY : y <= midY) &&
      rect.x - PRECISION <= x &&
      x <= rect.right + PRECISION
    );
  }

  /**
   * Check if the rectangle is visible.
   * @param {DOMRect} rect
   * @returns {boolean}
   */
  #isVisible(rect) {
    return (
      rect.top >= this.#toolBarHeight &&
      rect.left >= 0 &&
      rect.bottom <=
        (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  /**
   * Get the position of the caret.
   * @param {Selection} selection
   * @param {boolean} isUp
   * @returns {Array<number>}
   */
  #getCaretPosition(selection, isUp) {
    const { focusNode, focusOffset } = selection;
    const range = document.createRange();
    range.setStart(focusNode, focusOffset);
    range.setEnd(focusNode, focusOffset);
    const rect = range.getBoundingClientRect();

    return [rect.x, isUp ? rect.top : rect.bottom];
  }

  static #caretPositionFromPoint(x, y) {
    if (
      (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) &&
      !document.caretPositionFromPoint
    ) {
      const { startContainer: offsetNode, startOffset: offset } =
        document.caretRangeFromPoint(x, y);
      return { offsetNode, offset };
    }
    return document.caretPositionFromPoint(x, y);
  }

  #setCaretPositionHelper(selection, caretX, select, element, rect) {
    rect ||= element.getBoundingClientRect();
    if (caretX <= rect.x + PRECISION) {
      if (select) {
        selection.extend(element.firstChild, 0);
      } else {
        selection.setPosition(element.firstChild, 0);
      }
      return;
    }
    if (rect.right - PRECISION <= caretX) {
      const { lastChild } = element;
      if (select) {
        selection.extend(lastChild, lastChild.length);
      } else {
        selection.setPosition(lastChild, lastChild.length);
      }
      return;
    }

    const midY = rect.y + rect.height / 2;
    let caretPosition = CaretBrowsingMode.#caretPositionFromPoint(caretX, midY);
    let parentElement = caretPosition.offsetNode?.parentElement;
    if (parentElement && parentElement !== element) {
      // There is an element on top of the one in the text layer, so we
      // need to hide all the elements (except the one in the text layer)
      // at this position in order to get the correct caret position.
      const elementsAtPoint = document.elementsFromPoint(caretX, midY);
      const savedVisibilities = [];
      for (const el of elementsAtPoint) {
        if (el === element) {
          break;
        }
        const { style } = el;
        savedVisibilities.push([el, style.visibility]);
        style.visibility = "hidden";
      }
      caretPosition = CaretBrowsingMode.#caretPositionFromPoint(caretX, midY);
      parentElement = caretPosition.offsetNode?.parentElement;
      for (const [el, visibility] of savedVisibilities) {
        el.style.visibility = visibility;
      }
    }
    if (parentElement !== element) {
      // The element targeted by caretPositionFromPoint isn't in the text
      // layer.
      if (select) {
        selection.extend(element.firstChild, 0);
      } else {
        selection.setPosition(element.firstChild, 0);
      }
      return;
    }
    if (select) {
      selection.extend(caretPosition.offsetNode, caretPosition.offset);
    } else {
      selection.setPosition(caretPosition.offsetNode, caretPosition.offset);
    }
  }

  /**
   * Set the caret position or extend the selection (it depends on the select
   * parameter).
   * @param {boolean} select
   * @param {Selection} selection
   * @param {Element} newLineElement
   * @param {DOMRect} newLineElementRect
   * @param {number} caretX
   */
  #setCaretPosition(
    select,
    selection,
    newLineElement,
    newLineElementRect,
    caretX
  ) {
    if (this.#isVisible(newLineElementRect)) {
      this.#setCaretPositionHelper(
        selection,
        caretX,
        select,
        newLineElement,
        newLineElementRect
      );
      return;
    }
    this.#mainContainer.addEventListener(
      "scrollend",
      this.#setCaretPositionHelper.bind(
        this,
        selection,
        caretX,
        select,
        newLineElement,
        null
      ),
      { once: true }
    );
    newLineElement.scrollIntoView();
  }

  /**
   * Get the node on the next page.
   * @param {Element} textLayer
   * @param {boolean} isUp
   * @returns {Node}
   */
  #getNodeOnNextPage(textLayer, isUp) {
    while (true) {
      const page = textLayer.closest(".page");
      const pageNumber = parseInt(page.getAttribute("data-page-number"));
      const nextPage = isUp ? pageNumber - 1 : pageNumber + 1;
      textLayer = this.#viewerContainer.querySelector(
        `.page[data-page-number="${nextPage}"] .textLayer`
      );
      if (!textLayer) {
        return null;
      }
      const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
      const node = isUp ? walker.lastChild() : walker.firstChild();
      if (node) {
        return node;
      }
    }
  }

  /**
   * Move the caret in the given direction.
   * @param {boolean} isUp
   * @param {boolean} select
   */
  moveCaret(isUp, select) {
    const selection = document.getSelection();
    if (selection.rangeCount === 0) {
      return;
    }
    const { focusNode } = selection;
    const focusElement =
      focusNode.nodeType !== Node.ELEMENT_NODE
        ? focusNode.parentElement
        : focusNode;
    const root = focusElement.closest(".textLayer");
    if (!root) {
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    walker.currentNode = focusNode;

    // Move to the next element which is not on the same line as the focus
    // element.
    const focusRect = focusElement.getBoundingClientRect();
    let newLineElement = null;
    const nodeIterator = (
      isUp ? walker.previousSibling : walker.nextSibling
    ).bind(walker);
    while (nodeIterator()) {
      const element = walker.currentNode.parentElement;
      if (!this.#isOnSameLine(focusRect, element.getBoundingClientRect())) {
        newLineElement = element;
        break;
      }
    }

    if (!newLineElement) {
      // Need to find the next line on the next page.
      const node = this.#getNodeOnNextPage(root, isUp);
      if (!node) {
        return;
      }
      if (select) {
        const lastNode =
          (isUp ? walker.firstChild() : walker.lastChild()) || focusNode;
        selection.extend(lastNode, isUp ? 0 : lastNode.length);
        const range = document.createRange();
        range.setStart(node, isUp ? node.length : 0);
        range.setEnd(node, isUp ? node.length : 0);
        selection.addRange(range);
        return;
      }
      const [caretX] = this.#getCaretPosition(selection, isUp);
      const { parentElement } = node;
      this.#setCaretPosition(
        select,
        selection,
        parentElement,
        parentElement.getBoundingClientRect(),
        caretX
      );
      return;
    }

    // We've a candidate for the next line now we want to find the first element
    // which is under/over the caret.
    const [caretX, caretY] = this.#getCaretPosition(selection, isUp);
    const newLineElementRect = newLineElement.getBoundingClientRect();

    // Maybe the element on the new line is a valid candidate.
    if (this.#isUnderOver(newLineElementRect, caretX, caretY, isUp)) {
      this.#setCaretPosition(
        select,
        selection,
        newLineElement,
        newLineElementRect,
        caretX
      );
      return;
    }

    while (nodeIterator()) {
      // Search an element on the same line as newLineElement
      // which could be under/over the caret.
      const element = walker.currentNode.parentElement;
      const elementRect = element.getBoundingClientRect();
      if (!this.#isOnSameLine(newLineElementRect, elementRect)) {
        break;
      }
      if (this.#isUnderOver(elementRect, caretX, caretY, isUp)) {
        // We found the element.
        this.#setCaretPosition(select, selection, element, elementRect, caretX);
        return;
      }
    }

    // No element has been found so just put the caret on the element on the new
    // line.
    this.#setCaretPosition(
      select,
      selection,
      newLineElement,
      newLineElementRect,
      caretX
    );
  }
}

export { CaretBrowsingMode };
