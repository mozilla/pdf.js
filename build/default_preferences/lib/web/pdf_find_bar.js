"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFFindBar = void 0;

var _ui_utils = require("./ui_utils");

var _pdf_find_controller = require("./pdf_find_controller");

const MATCHES_COUNT_LIMIT = 1000;

class PDFFindBar {
  constructor(options, eventBus = (0, _ui_utils.getGlobalEventBus)(), l10n = _ui_utils.NullL10n) {
    this.opened = false;
    this.bar = options.bar || null;
    this.toggleButton = options.toggleButton || null;
    this.findField = options.findField || null;
    this.highlightAll = options.highlightAllCheckbox || null;
    this.caseSensitive = options.caseSensitiveCheckbox || null;
    this.entireWord = options.entireWordCheckbox || null;
    this.findMsg = options.findMsg || null;
    this.findResultsCount = options.findResultsCount || null;
    this.findPreviousButton = options.findPreviousButton || null;
    this.findNextButton = options.findNextButton || null;
    this.eventBus = eventBus;
    this.l10n = l10n;
    this.toggleButton.addEventListener('click', () => {
      this.toggle();
    });
    this.findField.addEventListener('input', () => {
      this.dispatchEvent('');
    });
    this.bar.addEventListener('keydown', e => {
      switch (e.keyCode) {
        case 13:
          if (e.target === this.findField) {
            this.dispatchEvent('again', e.shiftKey);
          }

          break;

        case 27:
          this.close();
          break;
      }
    });
    this.findPreviousButton.addEventListener('click', () => {
      this.dispatchEvent('again', true);
    });
    this.findNextButton.addEventListener('click', () => {
      this.dispatchEvent('again', false);
    });
    this.highlightAll.addEventListener('click', () => {
      this.dispatchEvent('highlightallchange');
    });
    this.caseSensitive.addEventListener('click', () => {
      this.dispatchEvent('casesensitivitychange');
    });
    this.entireWord.addEventListener('click', () => {
      this.dispatchEvent('entirewordchange');
    });
    this.eventBus.on('resize', this._adjustWidth.bind(this));
  }

  reset() {
    this.updateUIState();
  }

  dispatchEvent(type, findPrev) {
    this.eventBus.dispatch('find', {
      source: this,
      type,
      query: this.findField.value,
      phraseSearch: true,
      caseSensitive: this.caseSensitive.checked,
      entireWord: this.entireWord.checked,
      highlightAll: this.highlightAll.checked,
      findPrevious: findPrev
    });
  }

  updateUIState(state, previous, matchesCount) {
    let notFound = false;
    let findMsg = '';
    let status = '';

    switch (state) {
      case _pdf_find_controller.FindState.FOUND:
        break;

      case _pdf_find_controller.FindState.PENDING:
        status = 'pending';
        break;

      case _pdf_find_controller.FindState.NOT_FOUND:
        findMsg = this.l10n.get('find_not_found', null, 'Phrase not found');
        notFound = true;
        break;

      case _pdf_find_controller.FindState.WRAPPED:
        if (previous) {
          findMsg = this.l10n.get('find_reached_top', null, 'Reached top of document, continued from bottom');
        } else {
          findMsg = this.l10n.get('find_reached_bottom', null, 'Reached end of document, continued from top');
        }

        break;
    }

    this.findField.classList.toggle('notFound', notFound);
    this.findField.setAttribute('data-status', status);
    Promise.resolve(findMsg).then(msg => {
      this.findMsg.textContent = msg;

      this._adjustWidth();
    });
    this.updateResultsCount(matchesCount);
  }

  updateResultsCount({
    current = 0,
    total = 0
  } = {}) {
    if (!this.findResultsCount) {
      return;
    }

    let matchesCountMsg = '',
        limit = MATCHES_COUNT_LIMIT;

    if (total > 0) {
      if (total > limit) {
        matchesCountMsg = this.l10n.get('find_match_count_limit', {
          limit
        }, 'More than {{limit}} match' + (limit !== 1 ? 'es' : ''));
      } else {
        matchesCountMsg = this.l10n.get('find_match_count', {
          current,
          total
        }, '{{current}} of {{total}} match' + (total !== 1 ? 'es' : ''));
      }
    }

    Promise.resolve(matchesCountMsg).then(msg => {
      this.findResultsCount.textContent = msg;
      this.findResultsCount.classList.toggle('hidden', !total);

      this._adjustWidth();
    });
  }

  open() {
    if (!this.opened) {
      this.opened = true;
      this.toggleButton.classList.add('toggled');
      this.bar.classList.remove('hidden');
    }

    this.findField.select();
    this.findField.focus();

    this._adjustWidth();
  }

  close() {
    if (!this.opened) {
      return;
    }

    this.opened = false;
    this.toggleButton.classList.remove('toggled');
    this.bar.classList.add('hidden');
    this.eventBus.dispatch('findbarclose', {
      source: this
    });
  }

  toggle() {
    if (this.opened) {
      this.close();
    } else {
      this.open();
    }
  }

  _adjustWidth() {
    if (!this.opened) {
      return;
    }

    this.bar.classList.remove('wrapContainers');
    let findbarHeight = this.bar.clientHeight;
    let inputContainerHeight = this.bar.firstElementChild.clientHeight;

    if (findbarHeight > inputContainerHeight) {
      this.bar.classList.add('wrapContainers');
    }
  }

}

exports.PDFFindBar = PDFFindBar;