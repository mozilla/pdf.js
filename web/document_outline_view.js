/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2012 Mozilla Foundation
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
/* globals PDFView */

'use strict';

var DocumentOutlineView = {
  initialized: false,
  toolbarOpened: false,

  initialize: function documentOutlineViewInitialize(options) {
    this.initialized = true;

    this.outerContainer = options.outerContainer;
    this.outlineButton = options.outlineButton;
    this.outlineView = options.outlineView;
    this.toolbarToggleButton = options.toolbarToggleButton;
    this.toolbar = options.toolbar;

    // Define the toolbar buttons.
    this.expandTopOutlineItems = options.expandTopOutlineItems;
    this.expandAllOutlineItems = options.expandAllOutlineItems;
    this.collapseAllOutlineItems = options.collapseAllOutlineItems;

    // Attach the event listeners.
    this.outerContainer.addEventListener('click', this.closeToolbar.bind(this));
    this.outlineView.addEventListener('click',
      this.outlineViewClick.bind(this));
    this.toolbarToggleButton.addEventListener('click',
      this.toggleToolbar.bind(this));
    this.toolbar.addEventListener('click', this.toolbarClick.bind(this));
  },

  create: function documentOutlineViewCreate(outline, options) {
    if (!this.initialized) {
      this.initialize(options);
    }
    while (this.outlineView.firstChild) {
      this.outlineView.removeChild(this.outlineView.firstChild);
    }
    this.outlineButton.disabled = !outline;
    if (!outline) {
      PDFView.switchSidebarView('thumbs');
      return;
    }

    function bindItemLink(domObj, item) {
      domObj.href = PDFView.getDestinationHash(item.dest);
      domObj.onclick = function documentOutlineViewOnclick(e) {
        PDFView.navigateTo(item.dest);
        return false;
      };
    }

    var queue = [{ parent: outlineView, items: outline }];
    while (queue.length > 0) {
      var levelData = queue.shift();
      var i, n = levelData.items.length;
      for (i = 0; i < n; i++) {
        var item = levelData.items[i];
        var ul = document.createElement('ul');
        var li = document.createElement('li');
        ul.appendChild(li);
        var a = document.createElement('a');
        bindItemLink(a, item);
        a.textContent = item.title;
        li.appendChild(a);

        if (item.items.length > 0) {
          var subItems = document.createElement('ul');
          ul.appendChild(subItems);
          ul.className = 'collapsed';
          li.nextSibling.classList.add('hidden');
          queue.push({ parent: subItems, items: item.items });
        }

        levelData.parent.appendChild(ul);
      }
    }
  },

  _toggleItem: function documentOutlineView_toggleItem(
      currentElement, nextElement, expand, condition) {
    var currentState = currentElement.classList;
    if (expand && currentState.contains('collapsed')) {
      currentState.remove('collapsed');
      currentState.add('expanded');
      nextElement.classList.remove('hidden');
    } else if ((!expand || condition) && currentState.contains('expanded')) {
      nextElement.classList.add('hidden');
      currentState.remove('expanded');
      currentState.add('collapsed');
    }
  },

  _toggleMultipleItems: function documentOutlineView_toggleMultipleItem(
      parentElement, expand, allItems) {
    var children = parentElement.childNodes;
    var childElement, nextElement;
    for (var i = 0, ii = children.length; i < ii; i++) {
      childElement = children[i], nextElement = childElement.lastChild;
      if (nextElement.nodeName.toUpperCase() !== 'UL') {
        continue;
      }
      if (allItems) {
        this._toggleMultipleItems(nextElement, expand, allItems);
      }
      this._toggleItem(childElement, nextElement, expand);
    }
  },

  outlineViewClick: function documentOutlineViewOutlineViewClick(evt) {
    var target = evt.target, item;
    var nodeName = target.nodeName.toUpperCase();
    if (nodeName === 'LI') {
      item = target;
    } else if (nodeName === 'A') {
      item = target.parentNode;
    }
    if (item) {
      this._toggleItem(item.parentNode, item.nextSibling,
                       true, (item === target));
    }
  },

  toolbarClick: function documentOutlineViewToolbarClick(evt) {
    switch (evt.target) {
      case this.expandTopOutlineItems:
        this._toggleMultipleItems(this.outlineView, true, false);
        break;
      case this.expandAllOutlineItems:
        this._toggleMultipleItems(this.outlineView, true, true);
        break;
      case this.collapseAllOutlineItems:
        this._toggleMultipleItems(this.outlineView, false, true);
        break;
      default:
        evt.stopPropagation();
        return;
    } 
  },

  openToolbar: function documentOutlineViewOpenToolbar() {
    if (this.toolbarOpened || !this.initialized) {
      return;
    }
    this.toolbarOpened = true;
    this.toolbarToggleButton.classList.add('toggled');
    this.toolbar.classList.remove('hidden');
  },

  closeToolbar: function documentOutlineViewCloseToolbar() {
    if (!this.toolbarOpened || !this.initialized) {
      return;
    }
    this.toolbarOpened = false;
    this.toolbar.classList.add('hidden');
    this.toolbarToggleButton.classList.remove('toggled');
  },

  toggleToolbar: function documentOutlineViewToggleToolbar(evt) {
    if (this.toolbarOpened) {
      this.closeToolbar();
    } else {
      this.openToolbar();
    }
    evt.stopPropagation();
  }
};
