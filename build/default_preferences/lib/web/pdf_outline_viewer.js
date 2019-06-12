"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFOutlineViewer = void 0;

var _pdf = require("../pdf");

const DEFAULT_TITLE = '\u2013';

class PDFOutlineViewer {
  constructor({
    container,
    linkService,
    eventBus
  }) {
    this.container = container;
    this.linkService = linkService;
    this.eventBus = eventBus;
    this.reset();
    eventBus.on('toggleoutlinetree', this.toggleOutlineTree.bind(this));
  }

  reset() {
    this.outline = null;
    this.lastToggleIsShow = true;
    this.container.textContent = '';
    this.container.classList.remove('outlineWithDeepNesting');
  }

  _dispatchEvent(outlineCount) {
    this.eventBus.dispatch('outlineloaded', {
      source: this,
      outlineCount
    });
  }

  _bindLink(element, {
    url,
    newWindow,
    dest
  }) {
    let {
      linkService
    } = this;

    if (url) {
      (0, _pdf.addLinkAttributes)(element, {
        url,
        target: newWindow ? _pdf.LinkTarget.BLANK : linkService.externalLinkTarget,
        rel: linkService.externalLinkRel
      });
      return;
    }

    element.href = linkService.getDestinationHash(dest);

    element.onclick = () => {
      if (dest) {
        linkService.navigateTo(dest);
      }

      return false;
    };
  }

  _setStyles(element, {
    bold,
    italic
  }) {
    let styleStr = '';

    if (bold) {
      styleStr += 'font-weight: bold;';
    }

    if (italic) {
      styleStr += 'font-style: italic;';
    }

    if (styleStr) {
      element.setAttribute('style', styleStr);
    }
  }

  _addToggleButton(div, {
    count,
    items
  }) {
    let toggler = document.createElement('div');
    toggler.className = 'outlineItemToggler';

    if (count < 0 && Math.abs(count) === items.length) {
      toggler.classList.add('outlineItemsHidden');
    }

    toggler.onclick = evt => {
      evt.stopPropagation();
      toggler.classList.toggle('outlineItemsHidden');

      if (evt.shiftKey) {
        let shouldShowAll = !toggler.classList.contains('outlineItemsHidden');

        this._toggleOutlineItem(div, shouldShowAll);
      }
    };

    div.insertBefore(toggler, div.firstChild);
  }

  _toggleOutlineItem(root, show = false) {
    this.lastToggleIsShow = show;

    for (const toggler of root.querySelectorAll('.outlineItemToggler')) {
      toggler.classList.toggle('outlineItemsHidden', !show);
    }
  }

  toggleOutlineTree() {
    if (!this.outline) {
      return;
    }

    this._toggleOutlineItem(this.container, !this.lastToggleIsShow);
  }

  render({
    outline
  }) {
    let outlineCount = 0;

    if (this.outline) {
      this.reset();
    }

    this.outline = outline || null;

    if (!outline) {
      this._dispatchEvent(outlineCount);

      return;
    }

    let fragment = document.createDocumentFragment();
    let queue = [{
      parent: fragment,
      items: this.outline
    }];
    let hasAnyNesting = false;

    while (queue.length > 0) {
      const levelData = queue.shift();

      for (const item of levelData.items) {
        let div = document.createElement('div');
        div.className = 'outlineItem';
        let element = document.createElement('a');

        this._bindLink(element, item);

        this._setStyles(element, item);

        element.textContent = (0, _pdf.removeNullCharacters)(item.title) || DEFAULT_TITLE;
        div.appendChild(element);

        if (item.items.length > 0) {
          hasAnyNesting = true;

          this._addToggleButton(div, item);

          let itemsDiv = document.createElement('div');
          itemsDiv.className = 'outlineItems';
          div.appendChild(itemsDiv);
          queue.push({
            parent: itemsDiv,
            items: item.items
          });
        }

        levelData.parent.appendChild(div);
        outlineCount++;
      }
    }

    if (hasAnyNesting) {
      this.container.classList.add('outlineWithDeepNesting');
      this.lastToggleIsShow = fragment.querySelectorAll('.outlineItemsHidden').length === 0;
    }

    this.container.appendChild(fragment);

    this._dispatchEvent(outlineCount);
  }

}

exports.PDFOutlineViewer = PDFOutlineViewer;