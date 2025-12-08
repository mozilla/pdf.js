/* Copyright 2025 Mozilla Foundation
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

// TODO: Remove the exception below once someone figures out how to fix it.
// eslint-disable-next-line import/no-unresolved
import { parse, registerWalkers, Root } from "postcss-values-parser";
import { isString } from "stylelint/lib/utils/validateTypes.mjs";
import stylelint from "stylelint";

const {
  createPlugin,
  utils: { report, validateOptions },
} = stylelint;

registerWalkers(Root);

const ruleName = "pdfjs/no-unused-custom-properties";

// It's a very basic linter: we don't take into account scopes.
// But it should be enough for our use case.

/** @type {import('stylelint').Plugin} */
const ruleFunction =
  (enabled, { ignoreList = [] } = {}, context = {}) =>
  (root, result) => {
    const validOptions = validateOptions(
      result,
      ruleName,
      {
        actual: enabled,
        possible: [true],
      },
      {
        actual: ignoreList,
        possible: [isString],
        optional: true,
      }
    );

    if (!validOptions) {
      return;
    }

    ignoreList = ignoreList.map(s => (s.startsWith("--") ? s : `--${s}`));

    const usedCustomProperties = new Set(ignoreList);
    const definedCustomProperties = new Set();
    const usedBy = new Map();
    root.walkDecls(decl => {
      let definingProperty = null;
      if (decl.prop.startsWith("--")) {
        // This is a custom property definition.
        definingProperty = decl.prop;
        definedCustomProperties.add(definingProperty);
      }
      // Parse the declaration value to find var() usages.
      const parsedValue = parse(decl.value);
      parsedValue.walkFuncs(node => {
        if (!node.isVar || node.nodes.length === 0) {
          return;
        }
        // This is a var() function; get the custom property name.
        const property = node.nodes[0].value;
        if (!definingProperty) {
          // This is a usage of a custom property but not in a definition.
          // width: var(--foo);
          usedCustomProperties.add(property);
          return;
        }
        let usages = usedBy.get(property);
        if (!usages) {
          usages = [];
          usedBy.set(property, usages);
        }
        // Record that this custom property is used by the defining property.
        // --foo: var(--bar);
        // bar is really used only if foo is.
        usages.push(definingProperty);
      });
    });
    const isUsed = p =>
      usedCustomProperties.has(p) || (usedBy.get(p) || []).some(isUsed);
    for (const customProperty of definedCustomProperties) {
      if (isUsed(customProperty)) {
        continue;
      }
      report({
        message: `Custom property "${customProperty}" is defined but never used.`,
        node: root,
        result,
        ruleName,
      });
    }
  };

ruleFunction.ruleName = ruleName;

export default createPlugin(ruleName, ruleFunction);
