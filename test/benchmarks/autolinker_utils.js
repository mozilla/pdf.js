/* Copyright 2026 Mozilla Foundation
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

import { PageViewport } from "../../src/display/page_viewport.js";
import { TextHighlighter } from "../../web/text_highlighter.js";

const LINE_HEIGHT = 12;
const CHAR_WIDTH = 6;

// Fixed-width geometry for matches within one text item.
class RangeStub {
  #start = null;

  #end = null;

  setStart(node, offset) {
    this.#start = { node, offset };
  }

  setEnd(node, offset) {
    this.#end = { node, offset };
  }

  getClientRects() {
    const { node, offset } = this.#start;
    return [
      {
        left: offset * CHAR_WIDTH,
        top: node.parentNode.line * LINE_HEIGHT,
        width: (this.#end.offset - offset) * CHAR_WIDTH,
        height: LINE_HEIGHT,
      },
    ];
  }
}

globalThis.Node = { TEXT_NODE: 3 };
globalThis.Range = RangeStub;

function createTextDiv(text, line) {
  const div = { nodeType: 1, line, parentNode: null, nextSibling: null };
  div.firstChild = {
    nodeType: 3,
    textContent: text,
    parentNode: div,
    nextSibling: null,
  };
  return div;
}

function createPageView(texts) {
  const highlighter = new TextHighlighter({
    findController: null,
    eventBus: null,
    pageIndex: 0,
  });
  highlighter.setTextMapping(texts.map(createTextDiv), texts);
  const viewport = new PageViewport({
    viewBox: [0, 0, 612, 792],
    userUnit: 1,
    scale: 1,
    rotation: 0,
  });
  return {
    _textHighlighter: highlighter,
    textLayer: {
      div: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    },
    getPagePoint: (x, y) => viewport.convertToPdfPoint(x, y),
  };
}

export { createPageView };
