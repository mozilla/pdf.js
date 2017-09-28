/**
 * @property {String} cssText - CSS that goes in the new node.
 * Returns the new style node.
 */
function insertStyleNode(cssText) {
  var node = document.createElement('style');
  node.type = 'text/css';

  var head = document.head || document.getElementsByTagName('head')[0];
  head.appendChild(node);

  node.appendChild(document.createTextNode(cssText));
  return node;
}

/**
 * @property {HTMLStyleElement} styleNode - Node to update.
 * @property {String} cssText - CSS that goes in the node.
 * Returns the node.
 */
function updateStyleNode(styleNode, cssText) {
  styleNode.childNodes[0].nodeValue = cssText;
  return styleNode;
}

/**
 * @property {HTMLStyleElement} styleNode - Node to delete.
 */
/*
function deleteStyleNode(styleNode) {
  node.remove();
}
*/

/**
 * Create a CSS property setter.
 * @property {String} selector - CSS selector on which to apply the rule.
 * @property {String} property - CSS property.
 * @returns {Function} - A function that takes one argument, the value to 
 *                       to set.
 */
export function cssPropertyMutator(selector, property) {
  var node = insertStyleNode('');
  return function(value) {
    if (value !== undefined) {
      return updateStyleNode(node, `${selector} { ${property}: ${value}; }`);
    }
    return updateStyleNode(node, '');
  };
}
