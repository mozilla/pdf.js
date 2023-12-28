/* Copyright 2021 Mozilla Foundation
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

import {
  $getChildren,
  $getChildrenByClass,
  $getChildrenByName,
  $getParent,
} from "./symbol_utils.js";
import { warn } from "../../shared/util.js";

const namePattern = /^[^.[]+/;
const indexPattern = /^[^\]]+/;
const operators = {
  dot: 0,
  dotDot: 1,
  dotHash: 2,
  dotBracket: 3,
  dotParen: 4,
};

const shortcuts = new Map([
  ["$data", (root, current) => (root.datasets ? root.datasets.data : root)],
  [
    "$record",
    (root, current) =>
      (root.datasets ? root.datasets.data : root)[$getChildren]()[0],
  ],
  ["$template", (root, current) => root.template],
  ["$connectionSet", (root, current) => root.connectionSet],
  ["$form", (root, current) => root.form],
  ["$layout", (root, current) => root.layout],
  ["$host", (root, current) => root.host],
  ["$dataWindow", (root, current) => root.dataWindow],
  ["$event", (root, current) => root.event],
  ["!", (root, current) => root.datasets],
  ["$xfa", (root, current) => root],
  ["xfa", (root, current) => root],
  ["$", (root, current) => current],
]);

const somCache = new WeakMap();

function parseIndex(index) {
  index = index.trim();
  if (index === "*") {
    return Infinity;
  }
  return parseInt(index, 10) || 0;
}

// For now expressions containing .[...] or .(...) are not
// evaluated so don't parse them.
// TODO: implement that stuff and the remove the noExpr param.
function parseExpression(expr, dotDotAllowed, noExpr = true) {
  let match = expr.match(namePattern);
  if (!match) {
    return null;
  }

  let [name] = match;
  const parsed = [
    {
      name,
      cacheName: "." + name,
      index: 0,
      js: null,
      formCalc: null,
      operator: operators.dot,
    },
  ];

  let pos = name.length;

  while (pos < expr.length) {
    const spos = pos;
    const char = expr.charAt(pos++);
    if (char === "[") {
      match = expr.slice(pos).match(indexPattern);
      if (!match) {
        warn("XFA - Invalid index in SOM expression");
        return null;
      }
      parsed.at(-1).index = parseIndex(match[0]);
      pos += match[0].length + 1;
      continue;
    }

    let operator;
    switch (expr.charAt(pos)) {
      case ".":
        if (!dotDotAllowed) {
          return null;
        }
        pos++;
        operator = operators.dotDot;
        break;
      case "#":
        pos++;
        operator = operators.dotHash;
        break;
      case "[":
        if (noExpr) {
          warn(
            "XFA - SOM expression contains a FormCalc subexpression which is not supported for now."
          );
          return null;
        }
        // TODO: FormCalc expression so need to use the parser
        operator = operators.dotBracket;
        break;
      case "(":
        if (noExpr) {
          warn(
            "XFA - SOM expression contains a JavaScript subexpression which is not supported for now."
          );
          return null;
        }
        // TODO:
        // JavaScript expression: should be a boolean operation with a path
        // so maybe we can have our own parser for that stuff or
        // maybe use the formcalc one.
        operator = operators.dotParen;
        break;
      default:
        operator = operators.dot;
        break;
    }

    match = expr.slice(pos).match(namePattern);
    if (!match) {
      break;
    }

    [name] = match;
    pos += name.length;
    parsed.push({
      name,
      cacheName: expr.slice(spos, pos),
      operator,
      index: 0,
      js: null,
      formCalc: null,
    });
  }
  return parsed;
}

function searchNode(
  root,
  container,
  expr,
  dotDotAllowed = true,
  useCache = true
) {
  const parsed = parseExpression(expr, dotDotAllowed);
  if (!parsed) {
    return null;
  }

  const fn = shortcuts.get(parsed[0].name);
  let i = 0;
  let isQualified;
  if (fn) {
    isQualified = true;
    root = [fn(root, container)];
    i = 1;
  } else {
    isQualified = container === null;
    root = [container || root];
  }

  for (let ii = parsed.length; i < ii; i++) {
    const { name, cacheName, operator, index } = parsed[i];
    const nodes = [];
    for (const node of root) {
      if (!node.isXFAObject) {
        continue;
      }

      let children, cached;

      if (useCache) {
        cached = somCache.get(node);
        if (!cached) {
          cached = new Map();
          somCache.set(node, cached);
        }
        children = cached.get(cacheName);
      }

      if (!children) {
        switch (operator) {
          case operators.dot:
            children = node[$getChildrenByName](name, false);
            break;
          case operators.dotDot:
            children = node[$getChildrenByName](name, true);
            break;
          case operators.dotHash:
            children = node[$getChildrenByClass](name);
            children = children.isXFAObjectArray
              ? children.children
              : [children];
            break;
          default:
            break;
        }
        if (useCache) {
          cached.set(cacheName, children);
        }
      }

      if (children.length > 0) {
        nodes.push(children);
      }
    }

    if (nodes.length === 0 && !isQualified && i === 0) {
      // We've an unqualified expression and we didn't find anything
      // so look at container and siblings of container and so on.
      // http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.364.2157&rep=rep1&type=pdf#page=114
      const parent = container[$getParent]();
      container = parent;
      if (!container) {
        return null;
      }
      i = -1;
      root = [container];
      continue;
    }

    root = isFinite(index)
      ? nodes.filter(node => index < node.length).map(node => node[index])
      : nodes.flat();
  }

  if (root.length === 0) {
    return null;
  }

  return root;
}

function createDataNode(root, container, expr) {
  const parsed = parseExpression(expr);
  if (!parsed) {
    return null;
  }

  if (parsed.some(x => x.operator === operators.dotDot)) {
    return null;
  }

  const fn = shortcuts.get(parsed[0].name);
  let i = 0;
  if (fn) {
    root = fn(root, container);
    i = 1;
  } else {
    root = container || root;
  }

  for (let ii = parsed.length; i < ii; i++) {
    const { name, operator, index } = parsed[i];
    if (!isFinite(index)) {
      parsed[i].index = 0;
      return root.createNodes(parsed.slice(i));
    }

    let children;
    switch (operator) {
      case operators.dot:
        children = root[$getChildrenByName](name, false);
        break;
      case operators.dotDot:
        children = root[$getChildrenByName](name, true);
        break;
      case operators.dotHash:
        children = root[$getChildrenByClass](name);
        children = children.isXFAObjectArray ? children.children : [children];
        break;
      default:
        break;
    }

    if (children.length === 0) {
      return root.createNodes(parsed.slice(i));
    }

    if (index < children.length) {
      const child = children[index];
      if (!child.isXFAObject) {
        warn(`XFA - Cannot create a node.`);
        return null;
      }
      root = child;
    } else {
      parsed[i].index = index - children.length;
      return root.createNodes(parsed.slice(i));
    }
  }
  return null;
}

export { createDataNode, searchNode };
